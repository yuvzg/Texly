import crypto from 'node:crypto';
import { logger } from '../../logging/logger.js';

export interface BreachedPasswordChecker {
  isPwned(password: string): Promise<boolean>;
}

// Built-in list of common weak/breached passwords for offline/fast-path checks
const LOCAL_BREACHED_PASSWORDS = new Set<string>([
  '1234567890',
  'password123',
  'password1234',
  'qwertyuiop',
  'admin12345',
  'iloveyou123',
  'welcome1234',
  'monkey12345',
  'dragon12345',
  'master12345',
  'letmein1234',
  'trustno1123',
  'sunshine123',
  'princess123',
  'football123',
]);

export interface BreachedPasswordClientOptions {
  enabled?: boolean;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

export class BreachedPasswordClient implements BreachedPasswordChecker {
  private readonly enabled: boolean;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: BreachedPasswordClientOptions = {}) {
    this.enabled = options.enabled ?? true;
    this.timeoutMs = options.timeoutMs ?? 2500;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
  }

  async isPwned(password: string): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }

    // 1. Fast offline check against known common breached passwords
    if (LOCAL_BREACHED_PASSWORDS.has(password.toLowerCase())) {
      return true;
    }

    // 2. K-anonymity check via Have I Been Pwned API
    // Compute SHA-1 hex in uppercase
    const sha1 = crypto.createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await this.fetchFn(`https://api.pwnedpasswords.com/range/${prefix}`, {
        method: 'GET',
        headers: {
          'Add-Padding': 'true',
          'User-Agent': 'Texly-Auth-Breach-Check',
        },
        signal: controller.signal,
      }).finally(() => {
        clearTimeout(timer);
      });

      if (!response.ok) {
        logger.warn(
          { status: response.status, prefix },
          'Pwned passwords API returned non-200 status, failing open',
        );
        return false;
      }

      const body = await response.text();
      const lines = body.split('\r\n');

      for (const line of lines) {
        const [hashSuffix, countStr] = line.split(':');
        if (hashSuffix && hashSuffix.trim().toUpperCase() === suffix) {
          const count = parseInt(countStr ?? '0', 10);
          return count > 0;
        }
      }

      return false;
    } catch (err: unknown) {
      // Graceful degradation: never crash user flows on network timeouts or API downtime
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'Pwned passwords check failed or timed out, failing open',
      );
      return false;
    }
  }
}
