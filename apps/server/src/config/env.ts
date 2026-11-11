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
