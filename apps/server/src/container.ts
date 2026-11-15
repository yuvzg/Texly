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
import {
  type StorageService,
  S3StorageService,
  MemoryStorageService,
} from './infrastructure/storage/index.js';
import { CompileQueueService } from './infrastructure/queues/compile-queue.service.js';
import { RealtimeEmitter } from './realtime/realtime-emitter.js';
import {
  CompilationsRepository,
  CompilationsService,
  CompilationsController,
  CompilationsWorker,
  CompilationsReconciler,
  CompilationsRetention,
  createProjectCompilationsRouter,
  createCompilationsRouter,
} from './modules/compilations/index.js';

export interface ContainerDependencies {
  db?: DatabaseInstance | undefined;
  emailSender?: EmailSender | undefined;
  rateLimitStore?: RateLimitStore | undefined;
  storageService?: StorageService | undefined;
  compileQueueService?: CompileQueueService | undefined;
  realtimeEmitter?: RealtimeEmitter | undefined;
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

  // Storage Service
  let storageService: StorageService;
  if (dependencies.storageService) {
    storageService = dependencies.storageService;
  } else if (currentEnv.STORAGE_DRIVER === 'memory' || currentEnv.NODE_ENV === 'test') {
    storageService = new MemoryStorageService(currentEnv.S3_PROJECTS_BUCKET);
  } else {
    storageService = new S3StorageService({
      endpoint: currentEnv.S3_ENDPOINT,
      region: currentEnv.S3_REGION,
      accessKeyId: currentEnv.S3_ACCESS_KEY_ID,
      secretAccessKey: currentEnv.S3_SECRET_ACCESS_KEY,
      bucket: currentEnv.S3_PROJECTS_BUCKET,
      forcePathStyle: currentEnv.S3_FORCE_PATH_STYLE,
    });
  }

  // Realtime & Queue Services
  const realtimeEmitter = dependencies.realtimeEmitter ?? new RealtimeEmitter();
  const compileQueueService =
    dependencies.compileQueueService ??
    new CompileQueueService({
      connection: {
        url: currentEnv.REDIS_URL,
      },
    });

  // Repositories
  const usersRepo = new UsersRepository(db.client);
  const userSettingsRepo = new UserSettingsRepository(db.client);
  const sessionsRepo = new SessionsRepository(db.client);
  const verificationTokensRepo = new VerificationTokensRepository(db.client);
  const workspacesRepo = new WorkspacesRepository(db.client);
  const compilationsRepo = new CompilationsRepository(db.client);

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

  // Compilation Service
  const compilationsService = new CompilationsService(
    db.client,
    compilationsRepo,
    storageService,
    compileQueueService,
    realtimeEmitter,
    {
      imageTag: currentEnv.COMPILATION_IMAGE_TAG,
      limitsVersion: currentEnv.COMPILATION_LIMITS_VERSION,
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
  const compilationsController = new CompilationsController(compilationsService);

  // Compilation Background Workers & Jobs
  const compilationsWorker = new CompilationsWorker(
    db.client,
    compilationsRepo,
    storageService,
    realtimeEmitter,
    { url: currentEnv.REDIS_URL },
  );
  const compilationsReconciler = new CompilationsReconciler(
    compilationsRepo,
    compileQueueService,
    realtimeEmitter,
  );
  const compilationsRetention = new CompilationsRetention(db.client, storageService);

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

  const projectCompilationsRouter = createProjectCompilationsRouter({
    controller: compilationsController,
    authMiddleware,
    originMiddleware,
  });

  const compilationsRouter = createCompilationsRouter({
    controller: compilationsController,
    authMiddleware,
    originMiddleware,
  });

  return {
    db,
    env: currentEnv,
    emailSender,
    rateLimiter,
    storageService,
    compileQueueService,
    realtimeEmitter,
    usersRepo,
    userSettingsRepo,
    sessionsRepo,
    verificationTokensRepo,
    workspacesRepo,
    compilationsRepo,
    passwordService,
    jwtService,
    sessionService,
    emailService,
    authService,
    compilationsService,
    authController,
    usersController,
    compilationsController,
    compilationsWorker,
    compilationsReconciler,
    compilationsRetention,
    authMiddleware,
    originMiddleware,
    authRouter,
    usersRouter,
    projectCompilationsRouter,
    compilationsRouter,
  };
}

export type AppContainer = ReturnType<typeof buildContainer>;
