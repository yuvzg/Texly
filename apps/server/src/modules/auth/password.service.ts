import argon2 from 'argon2';
import { AppError } from '../../http/middleware/error-handler.js';
import { ErrorCodeEnum } from '@texly/shared';
import { logger } from '../../logging/logger.js';
import type { BreachedPasswordChecker } from './breached-password.client.js';

export interface PasswordServiceOptions {
  memoryCost?: number;
  timeCost?: number;
  parallelism?: number;
  breachedPasswordChecker?: BreachedPasswordChecker;
}

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export class PasswordService {
  private readonly memoryCost: number;
  private readonly timeCost: number;
  private readonly parallelism: number;
  private readonly breachedChecker?: BreachedPasswordChecker | undefined;

  constructor(options: PasswordServiceOptions = {}) {
    this.memoryCost = options.memoryCost ?? 19456;
    this.timeCost = options.timeCost ?? 2;
    this.parallelism = options.parallelism ?? 1;
    this.breachedChecker = options.breachedPasswordChecker;
  }

  /**
   * Validates and hashes a plaintext password using Argon2id.
   * Enforces 10-128 character policy and checks against known breached passwords.
   */
  async hashPassword(password: string): Promise<string> {
    if (typeof password !== 'string') {
      throw new AppError(ErrorCodeEnum.VALIDATION_FAILED, 400, 'Password must be a string.');
    }

    if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
      throw new AppError(
        ErrorCodeEnum.VALIDATION_FAILED,
        400,
        `Password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters in length.`,
      );
    }

    if (this.breachedChecker) {
      const isBreached = await this.breachedChecker.isPwned(password);
      if (isBreached) {
        throw new AppError(
          ErrorCodeEnum.VALIDATION_FAILED,
          400,
          'This password has been identified in a known data breach and is unsafe. Please choose a different password.',
        );
      }
    }

    try {
      return await argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: this.memoryCost,
        timeCost: this.timeCost,
        parallelism: this.parallelism,
      });
    } catch (err: unknown) {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        'Failed to hash password with Argon2id',
      );
      throw new AppError(ErrorCodeEnum.INTERNAL, 500, 'Unable to process password.');
    }
  }

  /**
   * Safely verifies a plaintext password against an Argon2id hash.
   * Returns false on mismatch or invalid hash without leaking internal errors.
   */
  async verifyPassword(hash: string, password: string): Promise<boolean> {
    if (!hash || typeof hash !== 'string' || !password || typeof password !== 'string') {
      return false;
    }

    try {
      return await argon2.verify(hash, password);
    } catch {
      // In case of corrupt hash or formatting errors, treat as non-match
      return false;
    }
  }
}
