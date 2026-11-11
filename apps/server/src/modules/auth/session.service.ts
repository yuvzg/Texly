import { v7 as uuidv7 } from 'uuid';
import type { PrismaClient, Session, TransactionClient } from '@texly/db';
import { AppError } from '../../http/middleware/error-handler.js';
import { ErrorCodeEnum } from '@texly/shared';
import { generateSecureOpaqueToken, hashToken } from './token.utils.js';
import type { SessionsRepository } from './sessions.repository.js';
import type { UsersRepository } from '../users/users.repository.js';

export interface CreateSessionParams {
  userId: string;
  userAgent?: string | null | undefined;
  ipAddress?: string | null | undefined;
}

export interface RotateSessionParams {
  refreshToken: string;
  userAgent?: string | null | undefined;
  ipAddress?: string | null | undefined;
}

export interface SessionResult {
  session: Session;
  refreshToken: string;
}

export interface SessionServiceOptions {
  refreshTokenTtlDays?: number;
  maxActiveSessions?: number;
}

class ConcurrencyReuseError extends Error {
  constructor(public readonly familyId: string) {
    super('Concurrency reuse');
    this.name = 'ConcurrencyReuseError';
  }
}

export class SessionService {
  private readonly refreshTokenTtlDays: number;
  private readonly maxActiveSessions: number;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly sessionsRepo: SessionsRepository,
    private readonly usersRepo: UsersRepository,
    options: SessionServiceOptions = {},
  ) {
    this.refreshTokenTtlDays = options.refreshTokenTtlDays ?? 7;
    this.maxActiveSessions = options.maxActiveSessions ?? 10;
  }

  /**
   * Creates a new session family and initial session for a validated user.
   */
  async createSession(params: CreateSessionParams): Promise<SessionResult> {
    const user = await this.usersRepo.findById(params.userId);
    if (!user || user.deletedAt !== null || user.disabledAt !== null) {
      throw new AppError(
        ErrorCodeEnum.ACCOUNT_DISABLED,
        403,
        'Account is disabled or deactivated.',
      );
    }

    const rawRefreshToken = generateSecureOpaqueToken(32);
    const tokenHash = hashToken(rawRefreshToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.refreshTokenTtlDays * 24 * 60 * 60 * 1000);
    const familyId = uuidv7();

    const session = await this.sessionsRepo.create({
      userId: params.userId,
      familyId,
      tokenHash,
      userAgent: params.userAgent ?? null,
      ipAddress: params.ipAddress ?? null,
      expiresAt,
    });

    // Enforce active session quota
    await this.sessionsRepo.pruneOldestForUser(params.userId, this.maxActiveSessions);

    return { session, refreshToken: rawRefreshToken };
  }

  /**
   * Rotates an active refresh token.
   * 1. Looks up session by token hash.
   * 2. Checks user account state.
   * 3. Detects token reuse: if session was already revoked or replaced, persistently revokes entire family.
   * 4. Validates expiration.
   * 5. Atomically issues successor session in the same family and revokes predecessor.
   */
  async rotateSession(params: RotateSessionParams): Promise<SessionResult> {
    const rawRefreshToken = params.refreshToken?.trim();
    if (!rawRefreshToken) {
      throw new AppError(ErrorCodeEnum.REFRESH_INVALID, 401, 'Refresh token is required.');
    }

    const tokenHash = hashToken(rawRefreshToken);
    const session = await this.sessionsRepo.findByTokenHash(tokenHash);
    if (!session) {
      throw new AppError(ErrorCodeEnum.REFRESH_INVALID, 401, 'Invalid or unknown refresh token.');
    }

    const now = new Date();

    // Check user account status first
    const user = await this.usersRepo.findById(session.userId);
    if (!user || user.deletedAt !== null || user.disabledAt !== null) {
      await this.sessionsRepo.revokeFamily(session.familyId, now);
      throw new AppError(ErrorCodeEnum.ACCOUNT_DISABLED, 403, 'Account is disabled.');
    }

    // REUSE DETECTION:
    // If the token's session is already revoked or already replaced by another session,
    // it indicates this refresh token was reused (compromised).
    // Persistently revoke all sessions in this family.
    if (session.revokedAt !== null || session.replacedById !== null) {
      await this.sessionsRepo.revokeFamily(session.familyId, now);
      throw new AppError(
        ErrorCodeEnum.REFRESH_REUSED,
        401,
        'Token reuse detected. All active sessions in this family have been terminated.',
      );
    }

    // Expiration check
    if (session.expiresAt <= now) {
      throw new AppError(ErrorCodeEnum.TOKEN_EXPIRED, 401, 'Refresh token has expired.');
    }

    try {
      return await this.prisma.$transaction(async (tx: TransactionClient) => {
        // Generate successor refresh token
        const nextRawRefreshToken = generateSecureOpaqueToken(32);
        const nextTokenHash = hashToken(nextRawRefreshToken);
        const nextExpiresAt = new Date(
          now.getTime() + this.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
        );
        const nextSessionId = uuidv7();

        // Create new session in the same family
        const nextSession = await this.sessionsRepo.create(
          {
            id: nextSessionId,
            userId: session.userId,
            familyId: session.familyId,
            tokenHash: nextTokenHash,
            userAgent: params.userAgent ?? session.userAgent,
            ipAddress: params.ipAddress ?? session.ipAddress,
            expiresAt: nextExpiresAt,
          },
          tx,
        );

        // Atomically mark old session as replaced and revoked
        const updateResult = await tx.session.updateMany({
          where: {
            id: session.id,
            replacedById: null,
            revokedAt: null,
          },
          data: {
            revokedAt: now,
            replacedById: nextSession.id,
            lastUsedAt: now,
          },
        });

        // Race condition check: if another process modified this session in parallel, trigger reuse
        if (updateResult.count === 0) {
          throw new ConcurrencyReuseError(session.familyId);
        }

        return {
          session: nextSession,
          refreshToken: nextRawRefreshToken,
        };
      });
    } catch (err: unknown) {
      if (err instanceof ConcurrencyReuseError) {
        await this.sessionsRepo.revokeFamily(err.familyId, now);
        throw new AppError(
          ErrorCodeEnum.REFRESH_REUSED,
          401,
          'Token reuse detected. All active sessions in this family have been terminated.',
        );
      }
      throw err;
    }
  }

  /**
   * Validates that a session exists, is active (not revoked/expired), and the user is not disabled.
   */
  async validateSession(sessionId: string): Promise<Session> {
    const session = await this.sessionsRepo.findById(sessionId);
    if (!session || session.revokedAt !== null) {
      throw new AppError(
        ErrorCodeEnum.UNAUTHENTICATED,
        401,
        'Session is invalid or has been revoked.',
      );
    }

    if (session.expiresAt <= new Date()) {
      throw new AppError(ErrorCodeEnum.TOKEN_EXPIRED, 401, 'Session has expired.');
    }

    const user = await this.usersRepo.findById(session.userId);
    if (!user || user.deletedAt !== null || user.disabledAt !== null) {
      await this.sessionsRepo.revoke(sessionId);
      throw new AppError(ErrorCodeEnum.ACCOUNT_DISABLED, 403, 'User account is disabled.');
    }

    return session;
  }

  /**
   * Explicitly revokes a single session (e.g. user logout).
   */
  async revokeSession(sessionId: string): Promise<void> {
    await this.sessionsRepo.revoke(sessionId);
  }

  /**
   * Revokes all active sessions for a user (e.g. security reset).
   */
  async revokeAllUserSessions(userId: string): Promise<void> {
    await this.sessionsRepo.revokeAllForUser(userId);
  }
}
