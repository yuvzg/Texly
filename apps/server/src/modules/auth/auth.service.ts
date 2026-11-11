import { v7 as uuidv7 } from 'uuid';
import type { PrismaClient, User, Plan, SubscriptionStatus } from '@texly/db';
import { AppError } from '../../http/middleware/error-handler.js';
import {
  ErrorCodeEnum,
  type RegisterRequest,
  type LoginRequest,
  type UserSummaryDTO,
  type AuthMeResponseData,
  type UserSettingsDTO,
} from '@texly/shared';
import { generateSecureOpaqueToken, hashToken } from './token.utils.js';
import type { UsersRepository } from '../users/users.repository.js';
import type { UserSettingsRepository } from '../users/user-settings.repository.js';
import type { SessionsRepository } from './sessions.repository.js';
import type { VerificationTokensRepository } from './verification-tokens.repository.js';
import type { WorkspacesRepository } from '../workspaces/workspaces.repository.js';
import type { PasswordService } from './password.service.js';
import type { JwtService } from './jwt.service.js';
import type { SessionService } from './session.service.js';
import type { EmailService } from '../email/email.service.js';
import type { RateLimiter } from '../../http/middleware/rate-limiter.js';

export interface AuthServiceOptions {
  jwtAccessTtlSeconds: number;
  refreshTokenTtlDays: number;
}

export interface AuthRequestMeta {
  userAgent?: string | null | undefined;
  ipAddress?: string | null | undefined;
}

export function toUserSummaryDTO(user: User): UserSummaryDTO {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarKey ?? null,
    emailVerified: user.emailVerifiedAt !== null,
  };
}

export class AuthService {
  private readonly jwtAccessTtlSeconds: number;
  private readonly refreshTokenTtlDays: number;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly usersRepo: UsersRepository,
    private readonly userSettingsRepo: UserSettingsRepository,
    private readonly sessionsRepo: SessionsRepository,
    private readonly verificationTokensRepo: VerificationTokensRepository,
    private readonly workspacesRepo: WorkspacesRepository,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly sessionService: SessionService,
    private readonly emailService: EmailService,
    private readonly rateLimiter: RateLimiter,
    options: AuthServiceOptions,
  ) {
    this.jwtAccessTtlSeconds = options.jwtAccessTtlSeconds;
    this.refreshTokenTtlDays = options.refreshTokenTtlDays;
  }

  async register(
    input: RegisterRequest,
    meta: AuthRequestMeta = {},
  ): Promise<{
    user: UserSummaryDTO;
    accessToken: string;
    expiresIn: number;
    refreshToken: string;
  }> {
    const email = input.email.toLowerCase().trim();

    // Check email uniqueness
    const existing = await this.usersRepo.findByEmail(email);
    if (existing) {
      throw new AppError(
        ErrorCodeEnum.EMAIL_TAKEN,
        409,
        'An account with this email address already exists.',
      );
    }

    // Validate password policy & breached check
    const passwordHash = await this.passwordService.hashPassword(input.password);

    // Prepare credentials, keys and tokens
    const userId = uuidv7();
    const rawRefreshToken = generateSecureOpaqueToken(32);
    const refreshTokenHash = hashToken(rawRefreshToken);
    const rawVerifyToken = generateSecureOpaqueToken(32);
    const verifyTokenHash = hashToken(rawVerifyToken);

    const now = new Date();
    const refreshExpiresAt = new Date(
      now.getTime() + this.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
    );
    const verifyExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

    const familyId = uuidv7();
    const sessionId = uuidv7();
    const workspaceId = uuidv7();

    // Clean slug for personal workspace
    const baseSlug =
      input.name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 30) || 'workspace';
    const workspaceSlug = `${baseSlug}-${userId.slice(0, 8)}`;

    // Execute atomic user onboarding transaction
    const createdUser = await this.prisma.$transaction(async (tx) => {
      // 1. User
      const user = await tx.user.create({
        data: {
          id: userId,
          email,
          name: input.name.trim(),
          passwordHash,
        },
      });

      // 2. User Settings
      await tx.userSettings.create({
        data: {
          userId: user.id,
          theme: 'system',
          editorFontSize: 14,
          keymap: 'default',
          defaultModelId: 'openai:gpt-4o',
          autoCompile: false,
        },
      });

      // 3. Personal Workspace
      const workspace = await tx.workspace.create({
        data: {
          id: workspaceId,
          name: `${input.name.trim()}'s Workspace`,
          slug: workspaceSlug,
          isPersonal: true,
        },
      });

      // 4. Workspace Member (OWNER)
      await tx.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: user.id,
          role: 'OWNER',
        },
      });

      // 5. Subscription (FREE)
      await tx.subscription.create({
        data: {
          workspaceId: workspace.id,
          plan: 'FREE' as Plan,
          status: 'ACTIVE' as SubscriptionStatus,
          provider: 'system',
        },
      });

      // 6. Initial Session
      await tx.session.create({
        data: {
          id: sessionId,
          userId: user.id,
          familyId,
          tokenHash: refreshTokenHash,
          userAgent: meta.userAgent ?? null,
          ipAddress: meta.ipAddress ?? null,
          expiresAt: refreshExpiresAt,
        },
      });

      // 7. Email Verification Token
      await tx.verificationToken.create({
        data: {
          userId: user.id,
          type: 'EMAIL_VERIFY',
          tokenHash: verifyTokenHash,
          expiresAt: verifyExpiresAt,
        },
      });

      return user;
    });

    // Enqueue verification email (safe fail-open delivery)
    await this.emailService.sendVerificationEmail(
      createdUser.email,
      createdUser.name,
      rawVerifyToken,
    );

    // Sign access token
    const accessToken = await this.jwtService.signAccessToken({
      sub: createdUser.id,
      sid: sessionId,
      email: createdUser.email,
    });

    return {
      user: toUserSummaryDTO(createdUser),
      accessToken,
      expiresIn: this.jwtAccessTtlSeconds,
      refreshToken: rawRefreshToken,
    };
  }

  async login(
    input: LoginRequest,
    meta: AuthRequestMeta = {},
  ): Promise<{
    user: UserSummaryDTO;
    accessToken: string;
    expiresIn: number;
    refreshToken: string;
  }> {
    const email = input.email.toLowerCase().trim();

    // Check progressive delay / account lockout
    const failedAttempts = await this.rateLimiter.recordFailedAttempt(email);
    if (failedAttempts > 5) {
      throw new AppError(
        ErrorCodeEnum.RATE_LIMITED,
        429,
        'Too many failed login attempts. Please wait 15 minutes before trying again.',
        { retryAfter: 900 },
      );
    }

    const user = await this.usersRepo.findByEmail(email);
    if (!user || !user.passwordHash) {
      // Dummy check to prevent timing analysis
      await this.passwordService.verifyPassword(
        '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$dHVtbXloYXNo',
        input.password,
      );
      throw new AppError(
        ErrorCodeEnum.INVALID_CREDENTIALS,
        401,
        'Invalid email address or password.',
      );
    }

    const isValidPassword = await this.passwordService.verifyPassword(
      user.passwordHash,
      input.password,
    );
    if (!isValidPassword) {
      throw new AppError(
        ErrorCodeEnum.INVALID_CREDENTIALS,
        401,
        'Invalid email address or password.',
      );
    }

    if (user.disabledAt !== null || user.deletedAt !== null) {
      throw new AppError(ErrorCodeEnum.ACCOUNT_DISABLED, 403, 'Account is disabled.');
    }

    // Reset failed login counter upon successful authentication
    await this.rateLimiter.resetFailedAttempts(email);

    // Update last login timestamp
    await this.usersRepo.updateLastLogin(user.id);

    // Create session family
    const { session, refreshToken } = await this.sessionService.createSession({
      userId: user.id,
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
    });

    // Sign JWT access token
    const accessToken = await this.jwtService.signAccessToken({
      sub: user.id,
      sid: session.id,
      email: user.email,
    });

    return {
      user: toUserSummaryDTO(user),
      accessToken,
      expiresIn: this.jwtAccessTtlSeconds,
      refreshToken,
    };
  }

  async refresh(
    refreshToken: string,
    meta: AuthRequestMeta = {},
  ): Promise<{
    accessToken: string;
    expiresIn: number;
    nextRefreshToken: string;
  }> {
    const { session, refreshToken: nextRefreshToken } = await this.sessionService.rotateSession({
      refreshToken,
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
    });

    const accessToken = await this.jwtService.signAccessToken({
      sub: session.userId,
      sid: session.id,
    });

    return {
      accessToken,
      expiresIn: this.jwtAccessTtlSeconds,
      nextRefreshToken,
    };
  }

  async logout(params: {
    userId: string;
    sessionId?: string | undefined;
    familyId?: string | undefined;
    everywhere?: boolean | undefined;
  }): Promise<void> {
    if (params.everywhere) {
      await this.sessionService.revokeAllUserSessions(params.userId);
    } else if (params.familyId) {
      await this.sessionsRepo.revokeFamily(params.familyId);
    } else if (params.sessionId) {
      await this.sessionService.revokeSession(params.sessionId);
    }
  }

  async getMe(userId: string): Promise<AuthMeResponseData> {
    const user = await this.usersRepo.findById(userId);
    if (!user || user.deletedAt !== null || user.disabledAt !== null) {
      throw new AppError(ErrorCodeEnum.ACCOUNT_DISABLED, 403, 'Account is disabled.');
    }

    const [workspaces, settingsRecord] = await Promise.all([
      this.workspacesRepo.findUserWorkspaces(userId),
      this.userSettingsRepo.findByUserId(userId),
    ]);

    const personalWorkspace = workspaces.find((w) => w.isPersonal);
    const plan = personalWorkspace ? personalWorkspace.plan : ('FREE' as Plan);

    const settings: UserSettingsDTO = {
      userId: user.id,
      theme: (settingsRecord?.theme as 'light' | 'dark' | 'system') ?? 'system',
      editorFontSize: settingsRecord?.editorFontSize ?? 14,
      keymap: (settingsRecord?.keymap as 'default' | 'vim' | 'emacs') ?? 'default',
      defaultModelId: settingsRecord?.defaultModelId ?? 'openai:gpt-4o',
      autoCompile: settingsRecord?.autoCompile ?? false,
      layout: (settingsRecord?.layout as Record<string, unknown>) ?? {},
      updatedAt: settingsRecord?.updatedAt?.toISOString() ?? new Date().toISOString(),
    };

    return {
      user: toUserSummaryDTO(user),
      workspaces: workspaces.map((w) => ({
        id: w.id,
        name: w.name,
        slug: w.slug,
        role: w.role,
        isPersonal: w.isPersonal,
      })),
      settings,
      plan: (String(plan) === 'TEAM' ? 'ENTERPRISE' : (plan as string)) as
        'FREE' | 'PRO' | 'ENTERPRISE',
    };
  }

  async verifyEmail(token: string): Promise<void> {
    const tokenHash = hashToken(token.trim());
    const verificationToken = await this.verificationTokensRepo.findByTokenHash(
      tokenHash,
      'EMAIL_VERIFY',
    );

    if (!verificationToken || verificationToken.usedAt !== null) {
      throw new AppError(
        ErrorCodeEnum.TOKEN_INVALID,
        400,
        'Invalid or already used email verification token.',
      );
    }

    if (verificationToken.expiresAt <= new Date()) {
      throw new AppError(
        ErrorCodeEnum.TOKEN_INVALID,
        400,
        'Email verification token has expired. Please request a new one.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await this.verificationTokensRepo.markUsed(verificationToken.id, new Date(), tx);
      await this.usersRepo.markEmailVerified(verificationToken.userId, new Date(), tx);
    });
  }

  async forgotPassword(email: string): Promise<void> {
    const normalized = email.toLowerCase().trim();
    const user = await this.usersRepo.findByEmail(normalized);

    // Generic response to prevent account enumeration
    if (!user || user.deletedAt !== null || user.disabledAt !== null) {
      return;
    }

    const rawToken = generateSecureOpaqueToken(32);
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    // Revoke previous pending reset tokens for this user
    await this.verificationTokensRepo.revokePendingForUser(user.id, 'PASSWORD_RESET');

    // Store new token
    await this.verificationTokensRepo.create({
      userId: user.id,
      type: 'PASSWORD_RESET',
      tokenHash,
      expiresAt,
    });

    // Enqueue password reset email (safe fail-open delivery)
    await this.emailService.sendPasswordResetEmail(user.email, user.name, rawToken);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const passwordHash = await this.passwordService.hashPassword(newPassword);
    const tokenHash = hashToken(token.trim());

    const resetToken = await this.verificationTokensRepo.findByTokenHash(
      tokenHash,
      'PASSWORD_RESET',
    );

    if (!resetToken || resetToken.usedAt !== null) {
      throw new AppError(
        ErrorCodeEnum.TOKEN_INVALID,
        400,
        'Invalid or already used password reset token.',
      );
    }

    if (resetToken.expiresAt <= new Date()) {
      throw new AppError(
        ErrorCodeEnum.TOKEN_INVALID,
        400,
        'Password reset token has expired. Please request a new one.',
      );
    }

    const user = await this.usersRepo.findById(resetToken.userId);
    if (!user || user.deletedAt !== null || user.disabledAt !== null) {
      throw new AppError(ErrorCodeEnum.ACCOUNT_DISABLED, 403, 'Account is disabled.');
    }

    // Atomic password update + token consumption + session revocation
    await this.prisma.$transaction(async (tx) => {
      await this.usersRepo.update(user.id, { passwordHash }, tx);
      await this.verificationTokensRepo.markUsed(resetToken.id, new Date(), tx);
      await this.sessionsRepo.revokeAllForUser(user.id, new Date(), tx);
    });
  }
}
