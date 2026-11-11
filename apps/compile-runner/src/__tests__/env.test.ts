import { describe, it, expect } from 'vitest';
import { loadRunnerEnv } from '../config/env.js';

describe('Compile Runner Configuration', () => {
  it('loads valid default environment configuration', () => {
    const config = loadRunnerEnv();
    expect(config.COMPILE_CONCURRENCY).toBeGreaterThanOrEqual(1);
    expect(config.COMPILE_TIMEOUT_MS).toBeGreaterThanOrEqual(1000);
  });
});

