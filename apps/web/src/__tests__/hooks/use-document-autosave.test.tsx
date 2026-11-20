import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useDocumentAutosave } from '@/hooks/use-document-autosave';
import * as documentsLib from '@/lib/documents';
import * as draftStorage from '@/lib/draft-storage';
import { ApiClientError } from '@/lib/api-client';
import type { DocumentDTO, PutDocumentContentResponseData } from '@texly/shared';

vi.mock('@/lib/documents');

describe('useDocumentAutosave hook', () => {
  const mockProjectId = 'proj-123';
  const mockDocId = 'doc-456';

  const initialDoc: DocumentDTO = {
    id: mockDocId,
    fileId: 'file-1',
    projectId: mockProjectId,
    path: 'main.tex',
    content: '\\documentclass{article}\n\\begin{document}\nInitial content\n\\end{document}',
    contentHash: 'hash-initial',
    revision: 1,
    sizeBytes: 60,
    updatedAt: '2026-01-01T10:00:00.000Z',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    await draftStorage.clearAllDrafts();

    vi.mocked(documentsLib.fetchDocument).mockResolvedValue(initialDoc);
    vi.mocked(documentsLib.fetchMainDocument).mockResolvedValue(initialDoc);
    vi.mocked(documentsLib.computeSha256).mockResolvedValue('hash-new');
    vi.mocked(documentsLib.saveDocumentContent).mockResolvedValue({
      revision: 2,
      contentHash: 'hash-rev-2',
      updatedAt: '2026-01-01T10:01:00.000Z',
      unchanged: false,
    });
  });

  it('loads document content and sets status to CLEAN on mount', async () => {
    const { result } = renderHook(() =>
      useDocumentAutosave({
        projectId: mockProjectId,
        documentId: mockDocId,
        debounceMs: 50,
      }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.content).toBe(initialDoc.content);
      expect(result.current.status).toBe('CLEAN');
    });
  });

  it('transitions to DIRTY on edit and persists draft to IndexedDB immediately', async () => {
    const { result } = renderHook(() =>
      useDocumentAutosave({
        projectId: mockProjectId,
        documentId: mockDocId,
        debounceMs: 200,
      }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.setContent('Edited content 1');
    });

    expect(result.current.content).toBe('Edited content 1');
    expect(result.current.status).toBe('DIRTY');

    await waitFor(async () => {
      const storedDraft = await draftStorage.getDraft(mockDocId);
      expect(storedDraft).not.toBeNull();
      expect(storedDraft?.content).toBe('Edited content 1');
      expect(storedDraft?.baseRevision).toBe(1);
    });
  });

  it('debounces save before dispatching network request and cleans up draft on success', async () => {
    const onSaveSuccess = vi.fn();
    const { result } = renderHook(() =>
      useDocumentAutosave({
        projectId: mockProjectId,
        documentId: mockDocId,
        debounceMs: 50,
        onSaveSuccess,
      }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.setContent('Debounced change');
    });

    await waitFor(() => {
      expect(documentsLib.saveDocumentContent).toHaveBeenCalledTimes(1);
      expect(result.current.status).toBe('SAVED');
      expect(onSaveSuccess).toHaveBeenCalledWith(2);
    });

    // Verify draft was cleaned up from IndexedDB upon successful save
    const storedDraft = await draftStorage.getDraft(mockDocId);
    expect(storedDraft).toBeNull();
  });

  it('enforces max-wait window during continuous typing', async () => {
    const { result } = renderHook(() =>
      useDocumentAutosave({
        projectId: mockProjectId,
        documentId: mockDocId,
        debounceMs: 200,
        maxWaitMs: 80,
      }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Make an edit. Debounce is 200ms, but maxWait is 80ms
    act(() => {
      result.current.setContent('Edit that hits max wait');
    });

    await waitFor(
      () => {
        expect(documentsLib.saveDocumentContent).toHaveBeenCalledTimes(1);
      },
      { timeout: 500 },
    );
  });

  it('coalesces rapid saves: queues next edit while current save is in-flight', async () => {
    let resolveFirstSave: (val: PutDocumentContentResponseData) => void = () => {};
    const firstSavePromise = new Promise<PutDocumentContentResponseData>((resolve) => {
      resolveFirstSave = resolve;
    });

    vi.mocked(documentsLib.saveDocumentContent).mockReturnValueOnce(firstSavePromise);

    const { result } = renderHook(() =>
      useDocumentAutosave({
        projectId: mockProjectId,
        documentId: mockDocId,
        debounceMs: 30,
      }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // 1. Initial edit
    act(() => {
      result.current.setContent('Edit 1');
    });

    await waitFor(() => {
      expect(documentsLib.saveDocumentContent).toHaveBeenCalledTimes(1);
      expect(result.current.status).toBe('SAVING');
    });

    // 2. While first save is in-flight, user continues typing
    act(() => {
      result.current.setContent('Edit 2 (in-flight)');
    });

    // 3. Resolve first save
    vi.mocked(documentsLib.saveDocumentContent).mockResolvedValueOnce({
      revision: 3,
      contentHash: 'hash-rev-3',
      updatedAt: '2026-01-01T10:02:00.000Z',
      unchanged: false,
    });

    act(() => {
      resolveFirstSave({
        revision: 2,
        contentHash: 'hash-rev-2',
        updatedAt: '2026-01-01T10:01:30.000Z',
        unchanged: false,
      });
    });

    // Follow-up save must be automatically triggered with new baseRevision: 2
    await waitFor(() => {
      expect(documentsLib.saveDocumentContent).toHaveBeenCalledTimes(2);
      expect(documentsLib.saveDocumentContent).toHaveBeenLastCalledWith(
        mockProjectId,
        mockDocId,
        expect.objectContaining({
          baseRevision: 2,
          content: 'Edit 2 (in-flight)',
        }),
      );
    });
  });

  it('handles 409 conflict: transitions to CONFLICT and preserves local draft', async () => {
    const conflictError = new ApiClientError(409, 'REVISION_CONFLICT', 'Conflict', {
      serverRevision: 3,
    });
    vi.mocked(documentsLib.saveDocumentContent).mockRejectedValueOnce(conflictError);
    vi.mocked(documentsLib.fetchDocument).mockResolvedValueOnce({
      ...initialDoc,
      revision: 3,
      content: 'Server content from collaborator',
    });

    const onSaveConflict = vi.fn();
    const { result } = renderHook(() =>
      useDocumentAutosave({
        projectId: mockProjectId,
        documentId: mockDocId,
        debounceMs: 30,
        onSaveConflict,
      }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.setContent('My conflicting edit');
    });

    await waitFor(() => {
      expect(result.current.status).toBe('CONFLICT');
      expect(onSaveConflict).toHaveBeenCalledWith(3);
      expect(result.current.activeConflict).not.toBeNull();
      expect(result.current.activeConflict?.serverRevision).toBe(3);
      expect(result.current.activeConflict?.localContent).toBe('My conflicting edit');
    });

    // Local draft in IndexedDB MUST NOT be destroyed
    const draft = await draftStorage.getDraft(mockDocId);
    expect(draft?.content).toBe('My conflicting edit');
  });

  it('detects uncommitted crash recovery draft on mount', async () => {
    // Pre-seed IndexedDB with an uncommitted crash recovery draft
    await draftStorage.saveDraft({
      documentId: mockDocId,
      projectId: mockProjectId,
      content: 'Unsaved crash draft text',
      baseRevision: 1,
      baseHash: 'hash-initial',
      updatedAt: '2026-01-01T12:00:00.000Z', // newer than initialDoc
    });

    const { result } = renderHook(() =>
      useDocumentAutosave({
        projectId: mockProjectId,
        documentId: mockDocId,
      }),
    );

    await waitFor(() => {
      expect(result.current.unrecoveredDraft).not.toBeNull();
      expect(result.current.unrecoveredDraft?.content).toBe('Unsaved crash draft text');
    });

    // Applying draft replaces editor content
    act(() => {
      result.current.applyDraft();
    });

    expect(result.current.content).toBe('Unsaved crash draft text');
    expect(result.current.status).toBe('DIRTY');
    expect(result.current.unrecoveredDraft).toBeNull();
  });
});
