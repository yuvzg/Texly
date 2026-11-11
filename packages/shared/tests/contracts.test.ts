import { describe, it, expect } from 'vitest';
import {
  createSuccessEnvelopeSchema,
  UserDTOSchema,
  ProjectDTOSchema,
  CompilationDTOSchema,
  ProposalDTOSchema,
  CompileJobV1Schema,
  CompileResultV1Schema,
} from '../src/index.js';

const VALID_UUID = '0192e2fb-3c1a-7b3b-9a4f-5c21ef9a8241';
const VALID_ISO = '2026-11-11T00:00:00.000Z';

describe('Producer-Consumer Contract Compatibility', () => {
  describe('Server API Producer -> Web Frontend Consumer', () => {
    it('consumer parses server User profile response envelope', () => {
      // Producer emits:
      const serverPayload = {
        data: {
          id: VALID_UUID,
          email: 'jane@example.com',
          name: 'Jane Doe',
          emailVerified: true,
          plan: 'PRO',
          createdAt: VALID_ISO,
          updatedAt: VALID_ISO,
        },
        meta: {
          requestId: 'req-12345',
          timestamp: VALID_ISO,
        },
      };

      // Consumer verifies with shared envelope schema:
      const ConsumerUserResponseSchema = createSuccessEnvelopeSchema(UserDTOSchema);
      const parsed = ConsumerUserResponseSchema.safeParse(serverPayload);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.data.email).toBe('jane@example.com');
        expect(parsed.data.data.plan).toBe('PRO');
      }
    });

    it('consumer parses server Project details response envelope', () => {
      const serverPayload = {
        data: {
          id: VALID_UUID,
          workspaceId: VALID_UUID,
          name: 'Conference Submission',
          description: 'Draft for NeurIPS',
          engine: 'PDFLATEX',
          bibTool: 'BIBER',
          mainFileId: VALID_UUID,
          autoCompile: false,
          role: 'OWNER',
          storageBytes: 524288,
          createdAt: VALID_ISO,
          updatedAt: VALID_ISO,
        },
        meta: {
          requestId: 'req-67890',
          timestamp: VALID_ISO,
        },
      };

      const ConsumerProjectResponseSchema = createSuccessEnvelopeSchema(ProjectDTOSchema);
      const parsed = ConsumerProjectResponseSchema.safeParse(serverPayload);
      expect(parsed.success).toBe(true);
    });

    it('consumer parses server Compilation details response envelope', () => {
      const serverPayload = {
        data: {
          id: VALID_UUID,
          projectId: VALID_UUID,
          status: 'SUCCEEDED',
          trigger: 'AUTO',
          engine: 'PDFLATEX',
          bibTool: 'AUTO',
          mainFilePath: 'main.tex',
          queuedAt: VALID_ISO,
          startedAt: VALID_ISO,
          finishedAt: VALID_ISO,
          durationMs: 1100,
          errorCount: 0,
          warningCount: 0,
          pageCount: 3,
          hasPdf: true,
          cacheHit: false,
        },
        meta: {
          requestId: 'req-comp-1',
          timestamp: VALID_ISO,
        },
      };

      const ConsumerCompilationResponseSchema = createSuccessEnvelopeSchema(CompilationDTOSchema);
      const parsed = ConsumerCompilationResponseSchema.safeParse(serverPayload);
      expect(parsed.success).toBe(true);
    });

    it('consumer parses server AI Proposal response envelope', () => {
      const serverPayload = {
        data: {
          id: VALID_UUID,
          conversationId: VALID_UUID,
          documentId: VALID_UUID,
          status: 'PENDING',
          baseRevision: 2,
          model: 'openai:gpt-4o',
          provider: 'openai',
          summary: 'Refactored abstract',
          diffStats: { added: 8, removed: 2, hunks: 1 },
          validation: [],
          proposedContent: '\\begin{abstract}\nNew text\n\\end{abstract}',
          createdAt: VALID_ISO,
          expiresAt: VALID_ISO,
        },
        meta: {
          requestId: 'req-ai-1',
          timestamp: VALID_ISO,
        },
      };

      const ConsumerProposalResponseSchema = createSuccessEnvelopeSchema(ProposalDTOSchema);
      const parsed = ConsumerProposalResponseSchema.safeParse(serverPayload);
      expect(parsed.success).toBe(true);
    });
  });

  describe('Server API Producer -> Compile Runner Consumer', () => {
    it('compile runner successfully validates job dispatched by server', () => {
      const serverDispatchedJob = {
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
            url: 'https://r2.example.com/inputs.tar.gz',
            sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            sizeBytes: 4096,
          },
          assets: [],
        },
        outputs: {
          pdf: { url: 'https://r2.example.com/output.pdf' },
          synctex: { url: 'https://r2.example.com/output.synctex.gz' },
          log: { url: 'https://r2.example.com/output.log' },
        },
        expiresAt: VALID_ISO,
      };

      const parsed = CompileJobV1Schema.safeParse(serverDispatchedJob);
      expect(parsed.success).toBe(true);
    });

    it('server worker successfully validates compilation result emitted by runner', () => {
      const runnerEmittedResult = {
        version: 1,
        compilationId: VALID_UUID,
        projectId: VALID_UUID,
        status: 'SUCCEEDED',
        exitCode: 0,
        durationMs: 1450,
        errorCount: 0,
        warningCount: 0,
        pageCount: 2,
        diagnostics: [],
        outputs: {
          pdfKey: 'projects/p/compilations/c/output.pdf',
          synctexKey: 'projects/p/compilations/c/output.synctex.gz',
          logKey: 'projects/p/compilations/c/output.log',
        },
        outputSizes: {
          pdfBytes: 120400,
          synctexBytes: 8500,
          logBytes: 32000,
        },
      };

      const parsed = CompileResultV1Schema.safeParse(runnerEmittedResult);
      expect(parsed.success).toBe(true);
    });
  });
});
