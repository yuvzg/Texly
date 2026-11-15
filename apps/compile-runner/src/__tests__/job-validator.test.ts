import { describe, it, expect } from 'vitest';
import { validateCompileJob, JobValidationError } from '../validator/job-validator.js';
import type { CompileJobV1 } from '@texly/shared';

function createMockJob(overrides: Partial<CompileJobV1> = {}): CompileJobV1 {
  return {
    version: 1,
    compilationId: '018f3a2b-4c5d-7e8f-9a0b-1c2d3e4f5a6b',
    projectId: '018f3a2b-4c5d-7e8f-9a0b-1c2d3e4f5a6c',
    engine: 'PDFLATEX',
    bibTool: 'AUTO',
    mainFile: 'main.tex',
    draft: false,
    limits: {
      timeoutSec: 60,
      memoryMb: 1024,
      cpus: 1,
      pidsLimit: 256,
      maxPdfMb: 50,
      maxLogMb: 5,
      maxOutputFiles: 200,
      workDirMb: 512,
    },
    inputs: {
      textBundle: {
        url: 'https://storage.texly.internal/bundle.tar',
        sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        sizeBytes: 1024,
      },
      assets: [],
    },
    outputs: {
      pdf: { url: 'https://storage.texly.internal/upload/main.pdf' },
      synctex: { url: 'https://storage.texly.internal/upload/main.synctex.gz' },
      log: { url: 'https://storage.texly.internal/upload/main.log' },
    },
    expiresAt: new Date(Date.now() + 600000).toISOString(),
    ...overrides,
  };
}

describe('Job Validator', () => {
  it('accepts valid compilation job payload', () => {
    const job = createMockJob();
    const validated = validateCompileJob(job);
    expect(validated.compilationId).toBe(job.compilationId);
    expect(validated.mainFile).toBe('main.tex');
  });

  it('rejects expired compilation job', () => {
    const expiredJob = createMockJob({
      expiresAt: new Date(Date.now() - 10000).toISOString(),
    });
    expect(() => validateCompileJob(expiredJob)).toThrowError(JobValidationError);
    expect(() => validateCompileJob(expiredJob)).toThrow(/Job has expired/);
  });

  it('rejects path traversal in mainFile', () => {
    const maliciousJob = createMockJob({
      mainFile: '../etc/passwd.tex',
    });
    expect(() => validateCompileJob(maliciousJob)).toThrowError(JobValidationError);
  });

  it('rejects absolute paths in mainFile', () => {
    const maliciousJob = createMockJob({
      mainFile: '/main.tex',
    });
    expect(() => validateCompileJob(maliciousJob)).toThrowError(JobValidationError);
  });

  it('rejects non-.tex mainFile extension', () => {
    const invalidJob = createMockJob({
      mainFile: 'main.pdf',
    });
    expect(() => validateCompileJob(invalidJob)).toThrow(/extension/);
  });

  it('rejects path traversal in asset paths', () => {
    const invalidJob = createMockJob({
      inputs: {
        textBundle: {
          url: 'https://storage.texly.internal/bundle.tar',
          sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          sizeBytes: 100,
        },
        assets: [
          {
            path: '../../etc/shadow',
            url: 'https://storage.texly.internal/asset',
            sha256: 'abc',
            sizeBytes: 50,
          },
        ],
      },
    });
    expect(() => validateCompileJob(invalidJob)).toThrow(/Invalid asset path/);
  });

  it('rejects case-insensitive duplicate asset collisions', () => {
    const invalidJob = createMockJob({
      inputs: {
        textBundle: {
          url: 'https://storage.texly.internal/bundle.tar',
          sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          sizeBytes: 100,
        },
        assets: [
          {
            path: 'figures/logo.PNG',
            url: 'https://storage.texly.internal/asset1',
            sha256: 'abc',
            sizeBytes: 50,
          },
          {
            path: 'figures/logo.png',
            url: 'https://storage.texly.internal/asset2',
            sha256: 'def',
            sizeBytes: 50,
          },
        ],
      },
    });
    expect(() => validateCompileJob(invalidJob)).toThrow(/Duplicate or case-insensitive/);
  });

  it('rejects inputs exceeding work directory size limit', () => {
    const invalidJob = createMockJob({
      limits: {
        timeoutSec: 60,
        memoryMb: 1024,
        cpus: 1,
        pidsLimit: 256,
        maxPdfMb: 50,
        maxLogMb: 5,
        maxOutputFiles: 200,
        workDirMb: 1, // 1 MB limit
      },
      inputs: {
        textBundle: {
          url: 'https://storage.texly.internal/bundle.tar',
          sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          sizeBytes: 2 * 1024 * 1024, // 2 MB > 1 MB
        },
        assets: [],
      },
    });
    expect(() => validateCompileJob(invalidJob)).toThrow(/exceeds limit/);
  });
});
