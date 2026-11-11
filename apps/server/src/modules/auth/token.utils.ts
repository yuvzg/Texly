import crypto from 'node:crypto';

/**
 * Generates a cryptographically secure, opaque random token encoded as URL-safe base64.
 * Default length of 32 bytes provides 256 bits of entropy.
 */
export function generateSecureOpaqueToken(byteLength: number = 32): string {
  return crypto.randomBytes(byteLength).toString('base64url');
}

/**
 * Computes the SHA-256 hex digest of a token string.
 * Used to store one-way hashes of refresh and verification tokens.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}
