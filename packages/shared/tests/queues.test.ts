import { describe, it, expect } from 'vitest';
import { CompileJobV1Schema, CompileResultV1Schema, AIGenerateJobV1Schema } from '../src/index.js';

const VALID_UUID = '0192e2fb-3c1a-7b3b-9a4f-5c21ef9a8241';
const VALID_ISO = '2026-11-11T00:00:00.000Z';

describe('Queue Payloads Contracts', () => {
  it('validates a complete CompileJobV1 payload', () => {
    const validJob = {
      version: 1,
      compilationId: VALID_UUID,
      projectId: VALID_UUID,
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
          url: 'https://r2.example.com/inputs/bundle.tar.gz',
          sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          sizeBytes: 1048576,
        },
        assets: [
          {
            path: 'figures/plot.png',
            url: 'https://r2.example.com/assets/plot.png',
            sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            sizeBytes: 245000,
          },
        ],
      },
      outputs: {
        pdf: { url: 'https://r2.example.com/outputs/main.pdf' },
        synctex: { url: 'https://r2.example.com/outputs/main.synctex.gz' },
        log: { url: 'https://r2.example.com/outputs/compile.log' },
      },
      expiresAt: VALID_ISO,
    };

    expect(CompileJobV1Schema.safeParse(validJob).success).toBe(true);
  });

  it('rejects CompileJobV1 with mismatched version or missing presigned outputs', () => {
    const invalidJob = {
      version: 2, // only version 1 supported
      compilationId: VALID_UUID,
      projectId: VALID_UUID,
      engine: 'PDFLATEX',
      bibTool: 'AUTO',
      mainFile: 'main.tex',
    };
    expect(CompileJobV1Schema.safeParse(invalidJob).success).toBe(false);
  });

  it('validates a complete CompileResultV1 payload', () => {
    const validResult = {
      version: 1,
      compilationId: VALID_UUID,
      projectId: VALID_UUID,
      status: 'SUCCEEDED',
      exitCode: 0,
      durationMs: 2350,
      errorCount: 0,
      warningCount: 1,
      pageCount: 5,
      diagnostics: [
        {
          level: 'warning',
          file: 'main.tex',
          line: 23,
          message: 'LaTeX Warning: Reference `sec:intro` on page 1 undefined',
        },
      ],
      outputs: {
        pdfKey: 'projects/p1/compilations/c1/output.pdf',
        synctexKey: 'projects/p1/compilations/c1/synctex.gz',
        logKey: 'projects/p1/compilations/c1/compile.log',
      },
      outputSizes: {
        pdfBytes: 154000,
        synctexBytes: 12000,
        logBytes: 45000,
      },
    };

    expect(CompileResultV1Schema.safeParse(validResult).success).toBe(true);
  });

  it('validates AIGenerateJobV1 payload', () => {
    const validAiJob = {
      version: 1,
      proposalId: VALID_UUID,
      projectId: VALID_UUID,
      conversationId: VALID_UUID,
      documentId: VALID_UUID,
      baseRevision: 3,
      baseContentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      prompt: 'Please add a conclusion section summarizing the findings.',
      model: 'anthropic:claude-3-7-sonnet',
      reasoningEffort: 'medium',
      scope: { kind: 'file' },
      attachments: [],
      includeCompileErrors: false,
      createdAt: VALID_ISO,
    };

    expect(AIGenerateJobV1Schema.safeParse(validAiJob).success).toBe(true);
  });
});
