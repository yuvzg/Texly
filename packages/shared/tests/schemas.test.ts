import { describe, it, expect } from 'vitest';
import {
  RegisterRequestSchema,
  LoginRequestSchema,
  UserDTOSchema,
  ProjectDTOSchema,
  CreateProjectRequestSchema,
  ProjectFileDTOSchema,
  DocumentDTOSchema,
  PutDocumentContentRequestSchema,
  CompilationDTOSchema,
  CreateCompilationRequestSchema,
  ProposalDTOSchema,
  EditOpSchema,
  DocumentVersionDTOSchema,
} from '../src/index.js';

const VALID_UUID = '0192e2fb-3c1a-7b3b-9a4f-5c21ef9a8241';
const VALID_ISO = '2026-11-11T00:00:00.000Z';

describe('Domain DTO Schemas Validation', () => {
  describe('Auth & User Schemas', () => {
    it('validates RegisterRequest with valid email, password, and name', () => {
      const valid = {
        email: 'User@Example.com',
        password: 'supersecretpassword10',
        name: 'Ada Lovelace',
      };
      const parsed = RegisterRequestSchema.parse(valid);
      expect(parsed.email).toBe('user@example.com'); // lowercased
      expect(parsed.name).toBe('Ada Lovelace');
    });

    it('rejects password shorter than 10 characters in RegisterRequest', () => {
      const invalid = {
        email: 'user@example.com',
        password: 'short',
        name: 'Ada',
      };
      expect(RegisterRequestSchema.safeParse(invalid).success).toBe(false);
    });

    it('validates LoginRequest with valid email and password', () => {
      const valid = {
        email: 'user@example.com',
        password: 'anyPassword123',
      };
      expect(LoginRequestSchema.safeParse(valid).success).toBe(true);
    });

    it('validates UserDTO and rejects unknown internal fields like passwordHash', () => {
      const validUser = {
        id: VALID_UUID,
        email: 'user@example.com',
        name: 'Ada Lovelace',
        emailVerified: true,
        plan: 'FREE',
        createdAt: VALID_ISO,
        updatedAt: VALID_ISO,
      };
      expect(UserDTOSchema.safeParse(validUser).success).toBe(true);

      const leakingUser = {
        ...validUser,
        passwordHash: 'argon2id$v=19$m=65536...',
      };
      expect(UserDTOSchema.safeParse(leakingUser).success).toBe(false);
    });
  });

  describe('Project Schemas', () => {
    it('validates CreateProjectRequest with template and engine', () => {
      const valid = {
        workspaceId: VALID_UUID,
        name: 'Quantum Optics Paper',
        template: 'ieee-conference',
        engine: 'XELATEX',
      };
      expect(CreateProjectRequestSchema.safeParse(valid).success).toBe(true);
    });

    it('rejects unsupported engine or template', () => {
      const invalid = {
        workspaceId: VALID_UUID,
        name: 'Quantum Optics',
        template: 'unknown-template',
      };
      expect(CreateProjectRequestSchema.safeParse(invalid).success).toBe(false);
    });

    it('validates ProjectDTO and enforces strictness', () => {
      const valid = {
        id: VALID_UUID,
        workspaceId: VALID_UUID,
        name: 'Quantum Optics',
        description: 'Research paper on quantum optics',
        engine: 'PDFLATEX',
        bibTool: 'BIBER',
        mainFileId: VALID_UUID,
        autoCompile: true,
        role: 'OWNER',
        storageBytes: 1048576,
        createdAt: VALID_ISO,
        updatedAt: VALID_ISO,
      };
      expect(ProjectDTOSchema.safeParse(valid).success).toBe(true);
      expect(ProjectDTOSchema.safeParse({ ...valid, rogueField: 123 }).success).toBe(false);
    });
  });

  describe('File & Document Schemas', () => {
    it('validates ProjectFileDTO', () => {
      const valid = {
        id: VALID_UUID,
        parentId: null,
        name: 'main.tex',
        path: 'main.tex',
        nodeType: 'FILE',
        kind: 'TEXT',
        sizeBytes: 2048,
        mimeType: 'text/x-tex',
        documentId: VALID_UUID,
        revision: 1,
        updatedAt: VALID_ISO,
      };
      expect(ProjectFileDTOSchema.safeParse(valid).success).toBe(true);
    });

    it('validates DocumentDTO', () => {
      const validDoc = {
        id: VALID_UUID,
        fileId: VALID_UUID,
        projectId: VALID_UUID,
        path: 'main.tex',
        content: '\\documentclass{article}',
        contentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        revision: 1,
        sizeBytes: 23,
        updatedAt: VALID_ISO,
      };
      expect(DocumentDTOSchema.safeParse(validDoc).success).toBe(true);
    });

    it('validates PutDocumentContentRequest and enforces size limits', () => {
      const valid = {
        baseRevision: 12,
        content: '\\section{Intro}\nHello world',
        clientHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      };
      expect(PutDocumentContentRequestSchema.safeParse(valid).success).toBe(true);

      const invalidHash = {
        baseRevision: 12,
        content: 'hello',
        clientHash: 'not-a-valid-sha256',
      };
      expect(PutDocumentContentRequestSchema.safeParse(invalidHash).success).toBe(false);
    });
  });

  describe('Compilation Schemas', () => {
    it('validates CreateCompilationRequest with defaults', () => {
      const parsed = CreateCompilationRequestSchema.parse({});
      expect(parsed.trigger).toBe('MANUAL');
      expect(parsed.draft).toBe(false);
    });

    it('validates CompilationDTO', () => {
      const valid = {
        id: VALID_UUID,
        projectId: VALID_UUID,
        status: 'SUCCEEDED',
        trigger: 'MANUAL',
        engine: 'PDFLATEX',
        bibTool: 'AUTO',
        mainFilePath: 'main.tex',
        queuedAt: VALID_ISO,
        startedAt: VALID_ISO,
        finishedAt: VALID_ISO,
        durationMs: 1420,
        errorCount: 0,
        warningCount: 2,
        pageCount: 14,
        hasPdf: true,
        cacheHit: false,
      };
      expect(CompilationDTOSchema.safeParse(valid).success).toBe(true);
    });
  });

  describe('AI Schemas & EditOp Operations', () => {
    it('validates insert_before, insert_after, and replace operations', () => {
      const insertBefore = {
        id: 'op-1',
        op: 'insert_before',
        anchor: '\\section{Intro}',
        content: '\\begin{abstract}...\n\\end{abstract}\n',
      };
      expect(EditOpSchema.safeParse(insertBefore).success).toBe(true);

      const replaceOp = {
        id: 'op-2',
        op: 'replace',
        anchor: 'old text',
        content: 'new text',
      };
      expect(EditOpSchema.safeParse(replaceOp).success).toBe(true);
    });

    it('enforces explicit confirmDeletion: true for delete op', () => {
      const validDelete = {
        id: 'op-3',
        op: 'delete',
        anchor: 'unwanted paragraph',
        confirmDeletion: true,
      };
      expect(EditOpSchema.safeParse(validDelete).success).toBe(true);

      const invalidDeleteWithoutConfirm = {
        id: 'op-3',
        op: 'delete',
        anchor: 'unwanted paragraph',
      };
      expect(EditOpSchema.safeParse(invalidDeleteWithoutConfirm).success).toBe(false);
    });

    it('validates ProposalDTO with validation results and diff stats', () => {
      const validProposal = {
        id: VALID_UUID,
        conversationId: VALID_UUID,
        documentId: VALID_UUID,
        status: 'PENDING',
        baseRevision: 5,
        model: 'openai:gpt-4o',
        provider: 'openai',
        summary: 'Added abstract section',
        diffStats: { added: 12, removed: 0, hunks: 1 },
        validation: [{ severity: 'info', code: 'ENV_CLOSED', message: 'All environments closed' }],
        createdAt: VALID_ISO,
        expiresAt: VALID_ISO,
      };
      expect(ProposalDTOSchema.safeParse(validProposal).success).toBe(true);
    });
  });

  describe('Version Schemas', () => {
    it('validates DocumentVersionDTO with source and revision', () => {
      const validVersion = {
        id: VALID_UUID,
        documentId: VALID_UUID,
        revision: 4,
        source: 'AI_ACCEPT',
        label: 'Accepted AI abstract changes',
        sizeBytes: 15420,
        createdAt: VALID_ISO,
      };
      expect(DocumentVersionDTOSchema.safeParse(validVersion).success).toBe(true);
    });
  });
});
