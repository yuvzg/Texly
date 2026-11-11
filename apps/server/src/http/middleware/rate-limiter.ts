import type { Request, Response, NextFunction } from 'express';
import type { Redis } from 'ioredis';
import { AppError } from './error-handler.js';
import { ErrorCodeEnum } from '@texly/shared';
import { logger } from '../../logging/logger.js';

export interface RateLimitOptions {
  prefix: string;
  limit: number;
  windowSeconds: number;
  keyGenerator?: (req: Request) => string;
}

export interface RateLimitStore {
  increment(key: string, windowSeconds: number): Promise<{ total: number; ttlSeconds: number }>;
  reset(key: string): Promise<void>;
}

export class MemoryRateLimitStore implements RateLimitStore {
  private hits = new Map<string, { count: number; expiresAt: number }>();

  async increment(
    key: string,
    windowSeconds: number,
  ): Promise<{ total: number; ttlSeconds: number }> {
    const now = Date.now();
    const entry = this.hits.get(key);

    if (!entry || entry.expiresAt <= now) {
      const expiresAt = now + windowSeconds * 1000;
      this.hits.set(key, { count: 1, expiresAt });
      return { total: 1, ttlSeconds: windowSeconds };
    }

    entry.count += 1;
    const ttlSeconds = Math.max(1, Math.ceil((entry.expiresAt - now) / 1000));
    return { total: entry.count, ttlSeconds };
  }

  async reset(key: string): Promise<void> {
    this.hits.delete(key);
  }
}

export class RedisRateLimitStore implements RateLimitStore {
  constructor(private readonly redis: Redis) {}

  async increment(
    key: string,
    windowSeconds: number,
  ): Promise<{ total: number; ttlSeconds: number }> {
    const results = await this.redis.multi().incr(key).ttl(key).exec();

    if (!results) {
      return { total: 1, ttlSeconds: windowSeconds };
    }

    const [incrErr, count] = results[0] as [Error | null, number];
    const [ttlErr, ttl] = results[1] as [Error | null, number];

    if (incrErr || ttlErr) {
      throw incrErr ?? ttlErr;
    }

    // Set TTL on newly created key
    if (ttl === -1 || ttl === -2) {
      await this.redis.expire(key, windowSeconds);
      return { total: count, ttlSeconds: windowSeconds };
    }

    return { total: count, ttlSeconds: Math.max(1, ttl) };
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(key);
  }
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    const ips = forwarded.split(',');
    return ips[0]?.trim() || req.ip || req.socket.remoteAddress || '127.0.0.1';
  }
  return req.ip || req.socket.remoteAddress || '127.0.0.1';
}

export class RateLimiter {
  constructor(private readonly store: RateLimitStore) {}

  async checkLimit(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds: number }> {
    const { total, ttlSeconds } = await this.store.increment(key, windowSeconds);
    const remaining = Math.max(0, limit - total);
    const allowed = total <= limit;

    return {
      allowed,
      remaining,
      retryAfterSeconds: allowed ? 0 : ttlSeconds,
    };
  }

  middleware(options: RateLimitOptions) {
    const keyGen = options.keyGenerator ?? ((req: Request) => getClientIp(req));

    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const clientKey = keyGen(req);
        const storageKey = `ratelimit:${options.prefix}:${clientKey}`;

        const { allowed, remaining, retryAfterSeconds } = await this.checkLimit(
          storageKey,
          options.limit,
          options.windowSeconds,
        );

        res.setHeader('X-RateLimit-Limit', options.limit);
        res.setHeader('X-RateLimit-Remaining', remaining);

        if (!allowed) {
          res.setHeader('Retry-After', retryAfterSeconds);
          logger.warn(
            { clientKey, prefix: options.prefix, retryAfterSeconds },
            'Rate limit exceeded',
          );
          next(
            new AppError(
              ErrorCodeEnum.RATE_LIMITED,
              429,
              'Too many requests. Please try again later.',
              { retryAfter: retryAfterSeconds },
            ),
          );
          return;
        }

        next();
      } catch (err: unknown) {
        // Fail open on rate limiter storage errors so requests are not blocked by Redis outage
        logger.error({ err }, 'Rate limiter encountered internal error, failing open');
        next();
      }
    };
  }

  async recordFailedAttempt(accountKey: string, windowSeconds: number = 900): Promise<number> {
    const storageKey = `ratelimit:failed_login:${accountKey.toLowerCase().trim()}`;
    const { total } = await this.store.increment(storageKey, windowSeconds);
    return total;
  }

  async resetFailedAttempts(accountKey: string): Promise<void> {
    const storageKey = `ratelimit:failed_login:${accountKey.toLowerCase().trim()}`;
    await this.store.reset(storageKey);
  }
}
