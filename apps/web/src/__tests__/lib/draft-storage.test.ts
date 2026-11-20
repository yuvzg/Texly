import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveDraft,
  getDraft,
  deleteDraft,
  listDraftsForProject,
  clearAllDrafts,
  type DocumentDraft,
} from '@/lib/draft-storage';

describe('IndexedDB Draft Storage (Local Crash Recovery)', () => {
  beforeEach(async () => {
    await clearAllDrafts();
  });

  it('saves and retrieves a document draft', async () => {
    const draft: DocumentDraft = {
      documentId: 'doc-123',
      projectId: 'proj-abc',
      content: '\\documentclass{article}\n\\begin{document}\nHello World\n\\end{document}',
      baseRevision: 1,
      baseHash: 'hash123',
      updatedAt: new Date().toISOString(),
    };

    await saveDraft(draft);
    const retrieved = await getDraft('doc-123');

    expect(retrieved).not.toBeNull();
    expect(retrieved?.documentId).toBe('doc-123');
    expect(retrieved?.projectId).toBe('proj-abc');
    expect(retrieved?.content).toBe(draft.content);
    expect(retrieved?.baseRevision).toBe(1);
    expect(retrieved?.baseHash).toBe('hash123');
  });

  it('returns null for non-existent draft', async () => {
    const result = await getDraft('non-existent-doc');
    expect(result).toBeNull();
  });

  it('updates an existing draft on subsequent save', async () => {
    const draft1: DocumentDraft = {
      documentId: 'doc-123',
      projectId: 'proj-abc',
      content: 'Initial draft',
      baseRevision: 1,
      baseHash: 'hash1',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    await saveDraft(draft1);

    const draft2: DocumentDraft = {
      ...draft1,
      content: 'Updated draft content',
      updatedAt: '2026-01-01T00:05:00.000Z',
    };
    await saveDraft(draft2);

    const retrieved = await getDraft('doc-123');
    expect(retrieved?.content).toBe('Updated draft content');
    expect(retrieved?.updatedAt).toBe('2026-01-01T00:05:00.000Z');
  });

  it('deletes a draft', async () => {
    const draft: DocumentDraft = {
      documentId: 'doc-delete-test',
      projectId: 'proj-abc',
      content: 'To be deleted',
      baseRevision: 2,
      baseHash: 'hash2',
      updatedAt: new Date().toISOString(),
    };
    await saveDraft(draft);
    expect(await getDraft('doc-delete-test')).not.toBeNull();

    await deleteDraft('doc-delete-test');
    expect(await getDraft('doc-delete-test')).toBeNull();
  });

  it('lists all drafts for a given project', async () => {
    const drafts: DocumentDraft[] = [
      {
        documentId: 'doc-proj1-a',
        projectId: 'project-A',
        content: 'Content A',
        baseRevision: 1,
        baseHash: 'hA',
        updatedAt: new Date().toISOString(),
      },
      {
        documentId: 'doc-proj1-b',
        projectId: 'project-A',
        content: 'Content B',
        baseRevision: 1,
        baseHash: 'hB',
        updatedAt: new Date().toISOString(),
      },
      {
        documentId: 'doc-proj2-c',
        projectId: 'project-B',
        content: 'Content C',
        baseRevision: 1,
        baseHash: 'hC',
        updatedAt: new Date().toISOString(),
      },
    ];

    for (const d of drafts) {
      await saveDraft(d);
    }

    const projectADrafts = await listDraftsForProject('project-A');
    expect(projectADrafts).toHaveLength(2);
    expect(projectADrafts.map((d) => d.documentId).sort()).toEqual(['doc-proj1-a', 'doc-proj1-b']);

    const projectBDrafts = await listDraftsForProject('project-B');
    expect(projectBDrafts).toHaveLength(1);
    expect(projectBDrafts[0]?.documentId).toBe('doc-proj2-c');
  });
});
