import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const DEFAULT_DEV_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIPkZYW+Ixrc/f/Q8VPK5irkk4TrezzIoP+B5aDTaqQ0k
-----END PRIVATE KEY-----
`;

const DEFAULT_DEV_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAbfhTxfI10H5b1ZZxZsRhw20UfEIGdtSEmmbVKv6Li38=
-----END PUBLIC KEY-----
`;

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(4000),
    HOST: z.string().default('0.0.0.0'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    // Authentication & JWT
    JWT_ISSUER: z.string().default('texly-api'),
    JWT_AUDIENCE: z.string().default('texly-web'),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900), // 15 minutes
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7), // 7 days
    JWT_ACTIVE_KID: z.string().default('dev-key-1'),
    JWT_PRIVATE_KEY_PEM: z.string().optional(),
    JWT_PUBLIC_KEY_PEM: z.string().optional(),
    JWT_ADDITIONAL_PUBLIC_KEYS: z
      .string()
      .optional()
      .transform((val) => {
        if (!val) return {} as Record<string, string>;
        try {
          return JSON.parse(val) as Record<string, string>;
        } catch {
          return {} as Record<string, string>;
        }
      })
      .pipe(z.record(z.string(), z.string())),

    // Argon2 Password Hashing
    ARGON2_MEMORY_COST: z.coerce.number().int().positive().default(19456), // 19 MiB per OWASP
    ARGON2_TIME_COST: z.coerce.number().int().positive().default(2),
    ARGON2_PARALLELISM: z.coerce.number().int().positive().default(1),

    // Breached Password Checking
    PWNED_PASSWORDS_ENABLED: z
      .union([z.boolean(), z.string()])
      .default(true)
      .transform((val) => {
        if (typeof val === 'boolean') return val;
        return val !== 'false' && val !== '0';
      }),

    // CORS & Cookies
    CORS_ALLOWED_ORIGINS: z
      .string()
      .default('http://localhost:3000,http://127.0.0.1:3000')
      .transform((val) =>
        val
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    COOKIE_DOMAIN: z.string().optional(),
    COOKIE_SECURE: z
      .union([z.boolean(), z.string()])
      .optional()
      .transform((val) => {
        if (val === undefined) return undefined;
        if (typeof val === 'boolean') return val;
        return val !== 'false' && val !== '0';
      }),

    // Redis
    REDIS_URL: z.string().default('redis://127.0.0.1:6379'),

    // Storage & S3 / R2 / MinIO
    STORAGE_DRIVER: z.enum(['s3', 'memory']).default('s3'),
    S3_ENDPOINT: z.string().default('http://127.0.0.1:9000'),
    S3_REGION: z.string().default('auto'),
    S3_ACCESS_KEY_ID: z.string().default('minioadmin'),
    S3_SECRET_ACCESS_KEY: z.string().default('minioadmin_secret'),
    S3_PROJECTS_BUCKET: z.string().default('texly-dev-projects'),
    S3_FORCE_PATH_STYLE: z
      .union([z.boolean(), z.string()])
      .default(true)
      .transform((val) => {
        if (typeof val === 'boolean') return val;
        return val === 'true' || val === '1';
      }),

    // Compilation Sandbox Config
    COMPILATION_IMAGE_TAG: z.string().default('texly/texlive:dev'),
    COMPILATION_LIMITS_VERSION: z.string().default('v1'),

    // Email & SMTP (Mailpit defaults for local development)
    SMTP_HOST: z.string().default('127.0.0.1'),
    SMTP_PORT: z.coerce.number().int().default(1025),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_SECURE: z
      .union([z.boolean(), z.string()])
      .default(false)
      .transform((val) => {
        if (typeof val === 'boolean') return val;
        return val === 'true' || val === '1';
      }),
    EMAIL_FROM: z.string().default('Texly <noreply@texly.app>'),
    APP_URL: z.string().url().default('http://localhost:3000'),
  })
  .transform((data) => {
    let privateKeyPem = data.JWT_PRIVATE_KEY_PEM;
    let publicKeyPem = data.JWT_PUBLIC_KEY_PEM;

    if (!privateKeyPem && data.NODE_ENV !== 'production') {
      privateKeyPem = DEFAULT_DEV_PRIVATE_KEY;
    }
    if (!publicKeyPem && data.NODE_ENV !== 'production') {
      publicKeyPem = DEFAULT_DEV_PUBLIC_KEY;
    }

    return {
      ...data,
      COOKIE_SECURE: data.COOKIE_SECURE ?? data.NODE_ENV === 'production',
      JWT_PRIVATE_KEY_PEM: privateKeyPem ?? '',
      JWT_PUBLIC_KEY_PEM: publicKeyPem ?? '',
    };
  })
  .refine(
    (data) => {
      if (data.NODE_ENV === 'production') {
        return !!data.JWT_PRIVATE_KEY_PEM && !!data.JWT_PUBLIC_KEY_PEM;
      }
      return true;
    },
    {
      message: 'JWT_PRIVATE_KEY_PEM and JWT_PUBLIC_KEY_PEM must be set in production mode',
      path: ['JWT_PRIVATE_KEY_PEM'],
    },
  );

export type ServerEnv = z.infer<typeof EnvSchema>;

export function loadEnv(): ServerEnv {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const errorDetails = result.error.errors
      .map((err) => `${err.path.join('.')}: ${err.message}`)
      .join(', ');
    throw new Error(`Invalid environment configuration: ${errorDetails}`);
  }
  return result.data;
}

export const env = loadEnv();
