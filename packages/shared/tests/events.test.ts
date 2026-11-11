import { describe, it, expect } from 'vitest';
import {
  CompilationQueuedEventSchema,
  CompilationStartedEventSchema,
  CompilationFinishedEventSchema,
  AIProposalUpdatedEventSchema,
  DocumentRevisionChangedEventSchema,
  FileTreeChangedEventSchema,
  ProjectSyncEventSchema,
  ProjectJoinEventSchema,
} from '../src/index.js';

const VALID_UUID = '0192e2fb-3c1a-7b3b-9a4f-5c21ef9a8241';
const VALID_ISO = '2026-11-11T00:00:00.000Z';

describe('Realtime WebSocket Events Contracts', () => {
  it('validates compilation lifecycle events', () => {
    const queued = {
      projectId: VALID_UUID,
      compilationId: VALID_UUID,
      status: 'QUEUED',
      timestamp: VALID_ISO,
    };
    expect(CompilationQueuedEventSchema.safeParse(queued).success).toBe(true);

    const started = {
      projectId: VALID_UUID,
      compilationId: VALID_UUID,
      status: 'RUNNING',
      timestamp: VALID_ISO,
    };
    expect(CompilationStartedEventSchema.safeParse(started).success).toBe(true);

    const finished = {
      projectId: VALID_UUID,
      compilationId: VALID_UUID,
      status: 'SUCCEEDED',
      durationMs: 1200,
      errorCount: 0,
      warningCount: 0,
      hasPdf: true,
      timestamp: VALID_ISO,
    };
    expect(CompilationFinishedEventSchema.safeParse(finished).success).toBe(true);
  });

  it('validates ai.proposal.updated event', () => {
    const aiUpdated = {
      projectId: VALID_UUID,
      documentId: VALID_UUID,
      proposalId: VALID_UUID,
      status: 'PENDING',
      summary: 'Added bibliography citations',
      diffStats: { added: 5, removed: 1, hunks: 2 },
      timestamp: VALID_ISO,
    };
    expect(AIProposalUpdatedEventSchema.safeParse(aiUpdated).success).toBe(true);
  });

  it('validates document.revision.changed event', () => {
    const docRev = {
      projectId: VALID_UUID,
      documentId: VALID_UUID,
      revision: 8,
      contentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      byUserId: VALID_UUID,
      timestamp: VALID_ISO,
    };
    expect(DocumentRevisionChangedEventSchema.safeParse(docRev).success).toBe(true);
  });

  it('validates file.tree.changed event', () => {
    const fileEvent = {
      projectId: VALID_UUID,
      op: 'rename',
      fileId: VALID_UUID,
      path: 'chapters/intro.tex',
      timestamp: VALID_ISO,
    };
    expect(FileTreeChangedEventSchema.safeParse(fileEvent).success).toBe(true);
  });

  it('validates project.sync snapshot event', () => {
    const syncEvent = {
      projectId: VALID_UUID,
      activeCompilation: {
        compilationId: VALID_UUID,
        status: 'RUNNING',
      },
      pendingProposal: {
        proposalId: VALID_UUID,
        documentId: VALID_UUID,
        status: 'PENDING',
      },
      timestamp: VALID_ISO,
    };
    expect(ProjectSyncEventSchema.safeParse(syncEvent).success).toBe(true);
  });

  it('validates client-to-server project.join event', () => {
    const joinEvent = {
      projectId: VALID_UUID,
      lastSeenEventId: 'evt-12345',
    };
    expect(ProjectJoinEventSchema.safeParse(joinEvent).success).toBe(true);
  });
});
