import { describe, it, expect, vi } from 'vitest';
import { PasswordService, PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from '../password.service.js';
import { BreachedPasswordClient } from '../breached-password.client.js';
import { AppError } from '../../../http/middleware/error-handler.js';
import { ErrorCodeEnum } from '@texly/shared';

describe('PasswordService & BreachedPasswordClient', () => {
  // Use lower argon2 parameters in unit tests for speed
  const testPasswordService = new PasswordService({
    memoryCost: 1024,
    timeCost: 1,
    parallelism: 1,
  });

  describe('Password length and format validation', () => {
    it('rejects passwords shorter than 10 characters', async () => {
      await expect(testPasswordService.hashPassword('short123')).rejects.toThrow(AppError);
      await expect(testPasswordService.hashPassword('short123')).rejects.toMatchObject({
        code: ErrorCodeEnum.VALIDATION_FAILED,
        statusCode: 400,
      });
    });

    it('rejects passwords longer than 128 characters', async () => {
      const longPassword = 'A'.repeat(129);
      await expect(testPasswordService.hashPassword(longPassword)).rejects.toThrow(AppError);
      await expect(testPasswordService.hashPassword(longPassword)).rejects.toMatchObject({
        code: ErrorCodeEnum.VALIDATION_FAILED,
        statusCode: 400,
      });
    });

    it('accepts valid passwords at the boundary limits (10 and 128 chars)', async () => {
      const tenChar = 'Valid10Ch!';
      expect(tenChar.length).toBe(PASSWORD_MIN_LENGTH);
      const hash10 = await testPasswordService.hashPassword(tenChar);
      expect(hash10).toContain('$argon2id$');

      const maxChar = 'A'.repeat(PASSWORD_MAX_LENGTH);
      const hashMax = await testPasswordService.hashPassword(maxChar);
      expect(hashMax).toContain('$argon2id$');
    });
  });

  describe('Argon2id hashing & verification', () => {
    it('hashes passwords with Argon2id and verifies successfully', async () => {
      const password = 'CorrectHorseBatteryStaple!';
      const hash = await testPasswordService.hashPassword(password);

      expect(hash).toContain('$argon2id$');
      const isMatch = await testPasswordService.verifyPassword(hash, password);
      expect(isMatch).toBe(true);

      const isNotMatch = await testPasswordService.verifyPassword(hash, 'WrongPassword!');
      expect(isNotMatch).toBe(false);
    });

    it('handles malformed hashes safely without throwing unhandled exceptions', async () => {
      const isMatchMalformed = await testPasswordService.verifyPassword(
        'invalid-argon-hash',
        'password123',
      );
      expect(isMatchMalformed).toBe(false);

      const isMatchEmpty = await testPasswordService.verifyPassword('', 'password123');
      expect(isMatchEmpty).toBe(false);
    });
  });

  describe('Breached password checking', () => {
    it('detects common passwords from the local blacklist', async () => {
      const client = new BreachedPasswordClient({ enabled: true });
      const isPwned = await client.isPwned('password123');
      expect(isPwned).toBe(true);
    });

    it('queries k-anonymity API using 5-char SHA-1 prefix', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => '0018A45C4D1787236E9DE1A1E00BA96F807:5\r\nABCDEF1234567890:12',
      });

      const client = new BreachedPasswordClient({
        enabled: true,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      // A password that doesn't match the mocked suffix
      const notPwned = await client.isPwned('SecureRandomUniquePass2026!');
      expect(notPwned).toBe(false);
      expect(mockFetch).toHaveBeenCalled();
    });

    it('fails open when the breached password API times out or fails', async () => {
      const failingFetch = vi.fn().mockRejectedValue(new Error('Network connection timeout'));
      const client = new BreachedPasswordClient({
        enabled: true,
        fetchFn: failingFetch as unknown as typeof fetch,
      });

      // Should not throw and should fail open (return false)
      const result = await client.isPwned('SomeUniquePassword123!');
      expect(result).toBe(false);
    });

    it('blocks hashing when breachedChecker flags password as pwned', async () => {
      const mockChecker = {
        isPwned: vi.fn().mockResolvedValue(true),
      };

      const breachedService = new PasswordService({
        memoryCost: 1024,
        timeCost: 1,
        parallelism: 1,
        breachedPasswordChecker: mockChecker,
      });

      await expect(breachedService.hashPassword('PwnedPassword123!')).rejects.toMatchObject({
        code: ErrorCodeEnum.VALIDATION_FAILED,
        statusCode: 400,
      });
    });
  });
});
