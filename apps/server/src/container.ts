import { Redis } from 'ioredis';
import { getDbClient, type DatabaseInstance } from '@texly/db';
import { env, type ServerEnv } from './config/env.js';
import {
  PasswordService,
  JwtService,
  SessionService,
  SessionsRepository,
  VerificationTokensRepository,
  BreachedPasswordClient,
} from './modules/auth/index.js';
import { UsersRepository, UserSettingsRepository } from './modules/users/index.js';
import { WorkspacesRepository } from './modules/workspaces/workspaces.repository.js';
import {
  EmailService,
  NodemailerEmailSender,
  MockEmailSender,
  type EmailSender,
} from './modules/email/email.service.js';
import {
  RateLimiter,
  MemoryRateLimitStore,
  RedisRateLimitStore,
  type RateLimitStore,
} from './http/middleware/rate-limiter.js';
import { AuthService } from './modules/auth/auth.service.js';
import { AuthController } from './modules/auth/auth.controller.js';
import { UsersController } from './modules/users/users.controller.js';
import { createAuthMiddleware, validateOriginMiddleware } from './http/middleware/auth.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { createUsersRouter } from './modules/users/users.routes.js';

export interface ContainerDependencies {
  db?: DatabaseInstance | undefined;
  emailSender?: EmailSender | undefined;
  rateLimitStore?: RateLimitStore | undefined;
  envOverrides?: Partial<ServerEnv> | undefined;
}

export function buildContainer(dependencies: ContainerDependencies = {}) {
  const currentEnv = { ...env, ...(dependencies.envOverrides ?? {}) };
  const db = dependencies.db ?? getDbClient();

  // Rate limiting store
  let rateLimitStore: RateLimitStore;
  if (dependencies.rateLimitStore) {
    rateLimitStore = dependencies.rateLimitStore;
  } else if (currentEnv.NODE_ENV === 'test') {
    rateLimitStore = new MemoryRateLimitStore();
  } else {
    try {
      const redisClient = new Redis(currentEnv.REDIS_URL, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      });
      rateLimitStore = new RedisRateLimitStore(redisClient);
    } catch {
      rateLimitStore = new MemoryRateLimitStore();
    }
  }

  const rateLimiter = new RateLimiter(rateLimitStore);

  // Email delivery
  let emailSender: EmailSender;
  if (dependencies.emailSender) {
    emailSender = dependencies.emailSender;
  } else if (currentEnv.NODE_ENV === 'test') {
    emailSender = new MockEmailSender();
  } else {
    emailSender = new NodemailerEmailSender({
      host: currentEnv.SMTP_HOST,
      port: currentEnv.SMTP_PORT,
      secure: currentEnv.SMTP_SECURE,
      user: currentEnv.SMTP_USER,
      pass: currentEnv.SMTP_PASS,
      from: currentEnv.EMAIL_FROM,
    });
  }

  const emailService = new EmailService(emailSender, currentEnv.APP_URL);

  // Repositories
  const usersRepo = new UsersRepository(db.client);
  const userSettingsRepo = new UserSettingsRepository(db.client);
  const sessionsRepo = new SessionsRepository(db.client);
  const verificationTokensRepo = new VerificationTokensRepository(db.client);
  const workspacesRepo = new WorkspacesRepository(db.client);

  // Password & Breached check
  const breachedPasswordChecker = new BreachedPasswordClient({
    enabled: currentEnv.PWNED_PASSWORDS_ENABLED,
  });

  const passwordService = new PasswordService({
    memoryCost: currentEnv.ARGON2_MEMORY_COST,
    timeCost: currentEnv.ARGON2_TIME_COST,
    parallelism: currentEnv.ARGON2_PARALLELISM,
    breachedPasswordChecker,
  });

  // JWT Service
  const jwtService = new JwtService({
    issuer: currentEnv.JWT_ISSUER,
    audience: currentEnv.JWT_AUDIENCE,
    expiresInSeconds: currentEnv.JWT_ACCESS_TTL_SECONDS,
    activeKid: currentEnv.JWT_ACTIVE_KID,
    privateKeyPem: currentEnv.JWT_PRIVATE_KEY_PEM,
    publicKeyPem: currentEnv.JWT_PUBLIC_KEY_PEM,
    additionalPublicKeys: currentEnv.JWT_ADDITIONAL_PUBLIC_KEYS,
  });

  // Session Service
  const sessionService = new SessionService(db.client, sessionsRepo, usersRepo, {
    refreshTokenTtlDays: currentEnv.REFRESH_TOKEN_TTL_DAYS,
    maxActiveSessions: 10,
  });

  // Auth Service
  const authService = new AuthService(
    db.client,
    usersRepo,
    userSettingsRepo,
    sessionsRepo,
    verificationTokensRepo,
    workspacesRepo,
    passwordService,
    jwtService,
    sessionService,
    emailService,
    rateLimiter,
    {
      jwtAccessTtlSeconds: currentEnv.JWT_ACCESS_TTL_SECONDS,
      refreshTokenTtlDays: currentEnv.REFRESH_TOKEN_TTL_DAYS,
    },
  );

  // Cookie configuration
  const cookieOptions = {
    secure: currentEnv.COOKIE_SECURE,
    domain: currentEnv.COOKIE_DOMAIN,
    maxAgeDays: currentEnv.REFRESH_TOKEN_TTL_DAYS,
  };

  // Controllers
  const authController = new AuthController(authService, cookieOptions);
  const usersController = new UsersController(usersRepo, userSettingsRepo, workspacesRepo);

  // Middlewares
  const authMiddleware = createAuthMiddleware(jwtService, sessionService, usersRepo);
  const originMiddleware = validateOriginMiddleware(currentEnv.CORS_ALLOWED_ORIGINS);

  // Sub-routers
  const authRouter = createAuthRouter({
    authController,
    authMiddleware,
    originMiddleware,
    rateLimiter,
  });

  const usersRouter = createUsersRouter({
    usersController,
    authMiddleware,
  });

  return {
    db,
    env: currentEnv,
    emailSender,
    rateLimiter,
    usersRepo,
    userSettingsRepo,
    sessionsRepo,
    verificationTokensRepo,
    workspacesRepo,
    passwordService,
    jwtService,
    sessionService,
    emailService,
    authService,
    authController,
    usersController,
    authMiddleware,
    originMiddleware,
    authRouter,
    usersRouter,
  };
}

export type AppContainer = ReturnType<typeof buildContainer>;
