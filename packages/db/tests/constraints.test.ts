import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDatabase, type TestDatabase } from './helper.js';
import {
  WorkspaceRole,
  FileNodeType,
  FileKind,
  LatexEngine,
  BibTool,
  ProposalStatus,
  CompilationStatus,
  AssetStatus,
} from '../src/types.js';

describe('PostgreSQL Constraints and Indexes', () => {
  let db: TestDatabase;
  let testUserId: string;
  let testWorkspaceId: string;
  let testProjectId: string;

  beforeAll(async () => {
    db = await setupTestDatabase();

    // Create base user and workspace
    const user = await db.client.user.create({
      data: {
        email: 'constraint-tester@texly.app',
        name: 'Constraint Tester',
      },
    });
    testUserId = user.id;

    const workspace = await db.client.workspace.create({
      data: {
        name: 'Test Workspace',
        slug: 'test-workspace',
        isPersonal: true,
        members: {
          create: {
            userId: testUserId,
            role: WorkspaceRole.OWNER,
          },
        },
      },
    });
    testWorkspaceId = workspace.id;

    const project = await db.client.project.create({
      data: {
        name: 'Constraint Project',
        createdById: testUserId,
        workspaceId: testWorkspaceId,
      },
    });
    testProjectId = project.id;
  }, 60000);

  afterAll(async () => {
    if (db) {
      await db.cleanup();
    }
  });

  describe('Unique Live File Paths & Case-Insensitive Uniqueness', () => {
    it('prevents creating two live files with identical paths in the same project', async () => {
      await db.client.projectFile.create({
        data: {
          projectId: testProjectId,
          name: 'chapter1.tex',
          path: 'chapters/chapter1.tex',
          nodeType: FileNodeType.FILE,
          kind: FileKind.TEXT,
          createdById: testUserId,
        },
      });

      await expect(
        db.client.projectFile.create({
          data: {
            projectId: testProjectId,
            name: 'chapter1.tex',
            path: 'chapters/chapter1.tex',
            nodeType: FileNodeType.FILE,
            kind: FileKind.TEXT,
            createdById: testUserId,
          },
        }),
      ).rejects.toThrow();
    });

    it('prevents creating case-insensitively conflicting live paths in the same project', async () => {
      await expect(
        db.client.projectFile.create({
          data: {
            projectId: testProjectId,
            name: 'CHAPTER1.TEX',
            path: 'chapters/CHAPTER1.TEX',
            nodeType: FileNodeType.FILE,
            kind: FileKind.TEXT,
            createdById: testUserId,
          },
        }),
      ).rejects.toThrow();
    });

    it('permits creating a new file with the same path after soft deleting the original', async () => {
      const fileToSoftDelete = await db.client.projectFile.create({
        data: {
          projectId: testProjectId,
          name: 'temp.tex',
          path: 'temp.tex',
          nodeType: FileNodeType.FILE,
          kind: FileKind.TEXT,
          createdById: testUserId,
        },
      });

      // Soft delete
      await db.client.projectFile.update({
        where: { id: fileToSoftDelete.id },
        data: { deletedAt: new Date() },
      });

      // Creating new live file with same path succeeds
      const newFile = await db.client.projectFile.create({
        data: {
          projectId: testProjectId,
          name: 'temp.tex',
          path: 'temp.tex',
          nodeType: FileNodeType.FILE,
          kind: FileKind.TEXT,
          createdById: testUserId,
        },
      });

      expect(newFile.id).toBeDefined();
      expect(newFile.id).not.toBe(fileToSoftDelete.id);
    });
  });

  describe('AI Proposals: Maximum One Active per Document', () => {
    it('prevents multiple active proposals (PENDING/QUEUED/GENERATING) on the same document', async () => {
      const file = await db.client.projectFile.create({
        data: {
          projectId: testProjectId,
          name: 'proposal_test.tex',
          path: 'proposal_test.tex',
          nodeType: FileNodeType.FILE,
          kind: FileKind.TEXT,
          createdById: testUserId,
        },
      });

      const doc = await db.client.document.create({
        data: {
          fileId: file.id,
          projectId: testProjectId,
          content: 'Hello World',
          contentHash: 'a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e',
          revision: 1,
          sizeBytes: 11,
        },
      });

      const conversation = await db.client.aIConversation.create({
        data: {
          projectId: testProjectId,
          userId: testUserId,
        },
      });

      const reqMessage1 = await db.client.aIMessage.create({
        data: {
          conversationId: conversation.id,
          role: 'USER',
          content: 'Improve intro',
        },
      });

      // First active proposal (PENDING)
      await db.client.aIProposal.create({
        data: {
          conversationId: conversation.id,
          requestMessageId: reqMessage1.id,
          documentId: doc.id,
          status: ProposalStatus.PENDING,
          baseRevision: 1,
          baseContentHash: 'a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e',
          provider: 'anthropic',
          model: 'claude-3-7-sonnet',
          promptVersion: '1.0',
          proposedContent: 'Hello Beautiful World',
          proposedContentHash: 'b591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e',
          editOps: [{ op: 'replace', search: 'World', replace: 'Beautiful World' }],
        },
      });

      const reqMessage2 = await db.client.aIMessage.create({
        data: {
          conversationId: conversation.id,
          role: 'USER',
          content: 'Another edit',
        },
      });

      // Second active proposal on same document must fail
      await expect(
        db.client.aIProposal.create({
          data: {
            conversationId: conversation.id,
            requestMessageId: reqMessage2.id,
            documentId: doc.id,
            status: ProposalStatus.QUEUED,
            baseRevision: 1,
            baseContentHash: 'a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e',
            provider: 'anthropic',
            model: 'claude-3-7-sonnet',
            promptVersion: '1.0',
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe('Compilations: Maximum One RUNNING Compilation per Project', () => {
    it('prevents multiple concurrently RUNNING compilations for the same project', async () => {
      // First RUNNING compilation
      await db.client.compilation.create({
        data: {
          projectId: testProjectId,
          status: CompilationStatus.RUNNING,
          engine: LatexEngine.PDFLATEX,
          bibTool: BibTool.AUTO,
          mainFilePath: 'main.tex',
          inputHash: 'c591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e',
          docRevisions: {},
        },
      });

      // Second RUNNING compilation on same project must fail
      await expect(
        db.client.compilation.create({
          data: {
            projectId: testProjectId,
            status: CompilationStatus.RUNNING,
            engine: LatexEngine.PDFLATEX,
            bibTool: BibTool.AUTO,
            mainFilePath: 'main.tex',
            inputHash: 'd591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e',
            docRevisions: {},
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe('Check Constraints', () => {
    it('enforces lowercase email check constraint', async () => {
      await expect(
        db.client.user.create({
          data: {
            email: 'UPPERCASE@TEXLY.APP',
            name: 'Uppercase User',
          },
        }),
      ).rejects.toThrow();
    });

    it('enforces document size cap of 2 MiB', async () => {
      const file = await db.client.projectFile.create({
        data: {
          projectId: testProjectId,
          name: 'oversized.tex',
          path: 'oversized.tex',
          nodeType: FileNodeType.FILE,
          kind: FileKind.TEXT,
          createdById: testUserId,
        },
      });

      await expect(
        db.client.document.create({
          data: {
            fileId: file.id,
            projectId: testProjectId,
            content: 'x',
            contentHash: 'e591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e',
            revision: 1,
            sizeBytes: 2097153, // 2 MiB + 1 byte
          },
        }),
      ).rejects.toThrow();
    });

    it('enforces document revision >= 1', async () => {
      const file = await db.client.projectFile.create({
        data: {
          projectId: testProjectId,
          name: 'zero_rev.tex',
          path: 'zero_rev.tex',
          nodeType: FileNodeType.FILE,
          kind: FileKind.TEXT,
          createdById: testUserId,
        },
      });

      await expect(
        db.client.document.create({
          data: {
            fileId: file.id,
            projectId: testProjectId,
            content: 'x',
            contentHash: 'f591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e',
            revision: 0,
            sizeBytes: 1,
          },
        }),
      ).rejects.toThrow();
    });

    it('enforces READY asset payload completeness', async () => {
      const file = await db.client.projectFile.create({
        data: {
          projectId: testProjectId,
          name: 'figure.png',
          path: 'figures/figure.png',
          nodeType: FileNodeType.FILE,
          kind: FileKind.BINARY,
          createdById: testUserId,
        },
      });

      // READY status without sha256 and ready_at must fail
      await expect(
        db.client.uploadedAsset.create({
          data: {
            fileId: file.id,
            projectId: testProjectId,
            uploadedById: testUserId,
            status: AssetStatus.READY,
            objectKey: 'projects/p1/figures/figure.png',
            originalName: 'figure.png',
            mimeType: 'image/png',
            sizeBytes: BigInt(1024),
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe('Foreign Key Actions', () => {
    it('restricts deleting workspace when project references it with onDelete: Restrict', async () => {
      const restrictedWorkspace = await db.client.workspace.create({
        data: {
          name: 'Restricted Workspace',
          slug: 'restricted-ws',
        },
      });

      await db.client.project.create({
        data: {
          workspaceId: restrictedWorkspace.id,
          createdById: testUserId,
          name: 'Restricted Project',
        },
      });

      await expect(
        db.client.workspace.delete({ where: { id: restrictedWorkspace.id } }),
      ).rejects.toThrow();
    });
  });
});
