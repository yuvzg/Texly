import { describe, it, expect } from 'vitest';
import { loadRunnerEnv } from '../config/env.js';

describe('Compile Runner Configuration & Security Audit', () => {
  it('loads valid default environment configuration', () => {
    const config = loadRunnerEnv();
    expect(config.COMPILE_CONCURRENCY).toBeGreaterThanOrEqual(1);
    expect(config.COMPILE_TIMEOUT_MS).toBeGreaterThanOrEqual(1000);
  });

  it('audits runner config: holds zero database, R2/S3, or LLM credentials', () => {
    const config = loadRunnerEnv();
    const configKeys = Object.keys(config);

    // List of forbidden secret keys per SECURITY.md and IMPLEMENTATION_ROADMAP.md
    const forbiddenPatterns = [
      /DATABASE/i,
      /POSTGRES/i,
      /PGPASSWORD/i,
      /AWS_SECRET/i,
      /AWS_ACCESS_KEY/i,
      /R2_SECRET/i,
      /R2_ACCESS_KEY/i,
      /S3_SECRET/i,
      /OPENAI/i,
      /ANTHROPIC/i,
      /GEMINI/i,
      /LLM/i,
      /JWT_SECRET/i,
      /COOKIE_SECRET/i,
      /SESSION_SECRET/i,
    ];

    for (const key of configKeys) {
      for (const pattern of forbiddenPatterns) {
        expect(key).not.toMatch(pattern);
      }
    }

    // Runner relies solely on job-specific presigned URLs provided by CompileJobV1
    expect(configKeys).toEqual(
      expect.arrayContaining([
        'NODE_ENV',
        'LOG_LEVEL',
        'REDIS_URL',
        'COMPILE_IMAGE',
        'COMPILE_CONCURRENCY',
        'COMPILE_TIMEOUT_MS',
        'JOBS_ROOT_DIR',
        'CACHE_ROOT_DIR',
        'TEXMF_CNF_PATH',
        'DOCKER_SOCKET_PATH',
        'MIN_DISK_FREE_PERCENT',
      ]),
    );
  });
});
