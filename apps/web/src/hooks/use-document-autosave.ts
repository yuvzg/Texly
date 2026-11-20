import { useState, useEffect, useRef, useCallback } from 'react';
import type { DocumentDTO } from '@texly/shared';
import { fetchMainDocument, fetchDocument, saveDocumentContent, computeSha256 } from '@/lib/documents';
import { ApiClientError } from '@/lib/api-client';
import {
  saveDraft,
  getDraft,
  deleteDraft,
  type DocumentDraft,
} from '@/lib/draft-storage';
import { useEditorStore, type DocumentSaveStatus, type DocumentConflictData } from '@/stores/editor.store';

export type SaveStatus =
  | DocumentSaveStatus
  | 'idle'
  | 'saving'
  | 'saved'
  | 'unsaved'
  | 'conflict'
  | 'error'
  | 'offline';

export interface UseDocumentAutosaveOptions {
  projectId: string;
  documentId?: string | undefined;
  debounceMs?: number | undefined;
  maxWaitMs?: number | undefined;
  onSaveSuccess?: ((revision: number) => void) | undefined;
  onSaveConflict?: ((serverRevision?: number) => void) | undefined;
  onSaveError?: ((error: Error) => void) | undefined;
}

const DEFAULT_DEBOUNCE_MS = 1500;
const DEFAULT_MAX_WAIT_MS = 10000;
const MAX_NETWORK_RETRIES = 3;

export function useDocumentAutosave({
  projectId,
  documentId: explicitDocumentId,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  maxWaitMs = DEFAULT_MAX_WAIT_MS,
  onSaveSuccess,
  onSaveConflict,
  onSaveError,
}: UseDocumentAutosaveOptions) {
  const [document, setDocument] = useState<DocumentDTO | null>(null);
  const [content, setContentState] = useState<string>('');
  const [status, setStatusState] = useState<SaveStatus>('CLEAN');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [unrecoveredDraft, setUnrecoveredDraftState] = useState<DocumentDraft | null>(null);
  const [activeConflict, setActiveConflictState] = useState<DocumentConflictData | null>(null);

  // Global editor store integration
  const setStoreSaveStatus = useEditorStore((state) => state.setSaveStatus);
  const setStoreConflict = useEditorStore((state) => state.setConflict);
  const setStoreUnrecoveredDraft = useEditorStore((state) => state.setUnrecoveredDraft);

  // Mutable refs to prevent stale closures and manage in-flight saves
  const contentRef = useRef<string>('');
  const lastSavedContentRef = useRef<string>('');
  const revisionRef = useRef<number>(0);
  const documentIdRef = useRef<string | null>(explicitDocumentId ?? null);
  const baseHashRef = useRef<string>('');

  // Timers and queue
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const maxWaitTimerRef = useRef<NodeJS.Timeout | null>(null);
  const firstDirtyAtRef = useRef<number | null>(null);
  const isSavingRef = useRef<boolean>(false);
  const pendingContentRef = useRef<string | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const retryCountRef = useRef<number>(0);
  const isConflictRef = useRef<boolean>(false);
  const isOfflineRef = useRef<boolean>(false);

  const updateStatus = useCallback(
    (newStatus: DocumentSaveStatus) => {
      setStatusState(newStatus);
      if (documentIdRef.current) {
        setStoreSaveStatus(documentIdRef.current, newStatus);
      }
    },
    [setStoreSaveStatus],
  );

  // Clear debounce and max-wait timers
  const clearTimers = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (maxWaitTimerRef.current) {
      clearTimeout(maxWaitTimerRef.current);
      maxWaitTimerRef.current = null;
    }
    firstDirtyAtRef.current = null;
  }, []);

  // Save execution with concurrency & coalescing guarantees
  const executeSave = useCallback(async (): Promise<boolean> => {
    const docId = documentIdRef.current;
    if (!docId || !projectId) {
      return false;
    }

    const currentText = contentRef.current;

    // If identical to last successfully saved text and no pending changes
    if (currentText === lastSavedContentRef.current) {
      if (isMountedRef.current && status !== 'CONFLICT') {
        updateStatus('SAVED');
      }
      return true;
    }

    // Coalesce in-flight saves: if a save is already in-flight, mark pending
    if (isSavingRef.current) {
      pendingContentRef.current = currentText;
      return false;
    }

    isSavingRef.current = true;
    isConflictRef.current = false;
    isOfflineRef.current = false;
    clearTimers();

    if (isMountedRef.current) {
      updateStatus('SAVING');
      setErrorMessage(null);
    }

    try {
      const clientHash = await computeSha256(currentText);
      const res = await saveDocumentContent(projectId, docId, {
        baseRevision: revisionRef.current,
        content: currentText,
        clientHash,
      });

      if (!isMountedRef.current) return true;

      // Update base revision and saved content tracker
      revisionRef.current = res.revision;
      lastSavedContentRef.current = currentText;
      baseHashRef.current = res.contentHash;
      retryCountRef.current = 0;
      setLastSavedAt(new Date(res.updatedAt));
      setErrorMessage(null);

      // Clean up local draft in IndexedDB since server confirmed write
      await deleteDraft(docId);

      onSaveSuccess?.(res.revision);

      return true;
    } catch (err: unknown) {
      if (!isMountedRef.current) return false;

      const isConflict =
        (err instanceof ApiClientError && err.status === 409) ||
        (typeof err === 'object' && err !== null && (err as any).status === 409);

      if (isConflict) {
        // Concurrency conflict detected!
        isConflictRef.current = true;
        updateStatus('CONFLICT');
        const conflictDetails = (err as any).details as { serverRevision?: number } | undefined;
        const sRev = conflictDetails?.serverRevision ?? revisionRef.current + 1;

        // Try to fetch current authoritative server content for side-by-side diff
        let serverText = '';
        let serverUpdatedAt = new Date().toISOString();
        try {
          const freshServerDoc = await fetchDocument(projectId, docId);
          serverText = freshServerDoc.content;
          serverUpdatedAt = freshServerDoc.updatedAt;
        } catch {
          serverText = '(Failed to retrieve server version content)';
        }

        const conflictData: DocumentConflictData = {
          documentId: docId,
          projectId,
          localContent: currentText,
          serverContent: serverText,
          localRevision: revisionRef.current,
          serverRevision: sRev,
          serverUpdatedAt,
        };

        setActiveConflictState(conflictData);
        setStoreConflict(docId, conflictData);
        setErrorMessage(`Revision conflict: server is at revision ${sRev}. Resolve to proceed.`);
        onSaveConflict?.(sRev);

        return false;
      }

      // Check for offline / network transient errors
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

      if (isOffline || retryCountRef.current >= MAX_NETWORK_RETRIES) {
        isOfflineRef.current = true;
        updateStatus('OFFLINE');
        const msg = isOffline ? 'Offline - changes saved locally' : 'Save failed - changes saved locally';
        setErrorMessage(msg);
      } else {
        // Retry with exponential backoff (1s, 2s, 4s)
        retryCountRef.current += 1;
        const backoffMs = Math.pow(2, retryCountRef.current - 1) * 1000;
        setTimeout(() => {
          if (isMountedRef.current && !isSavingRef.current) {
            void executeSave();
          }
        }, backoffMs);
      }

      if (err instanceof Error) {
        onSaveError?.(err);
      }
      return false;
    } finally {
      isSavingRef.current = false;

      // Check if user continued typing while save was in-flight (coalescing)
      if (pendingContentRef.current !== null) {
        const nextContent = pendingContentRef.current;
        pendingContentRef.current = null;
        if (nextContent !== lastSavedContentRef.current && !isConflictRef.current) {
          void executeSave();
        } else if (isMountedRef.current && !isConflictRef.current && !isOfflineRef.current) {
          updateStatus('SAVED');
        }
      } else if (isMountedRef.current && !isConflictRef.current && !isOfflineRef.current) {
        updateStatus('SAVED');
      }
    }
  }, [projectId, status, updateStatus, clearTimers, onSaveSuccess, onSaveConflict, onSaveError, setStoreConflict]);

  // Set content handler (called on user typing)
  const setContent = useCallback(
    (newContent: string) => {
      contentRef.current = newContent;
      setContentState(newContent);

      const docId = documentIdRef.current;
      if (!docId) return;

      if (newContent !== lastSavedContentRef.current) {
        updateStatus('DIRTY');
        setErrorMessage(null);

        // Record dirty timestamp for max-wait guarantee
        const now = Date.now();
        if (firstDirtyAtRef.current === null) {
          firstDirtyAtRef.current = now;
        }

        // 1. Immediately persist local draft to IndexedDB to survive browser crashes
        void saveDraft({
          documentId: docId,
          projectId,
          content: newContent,
          baseRevision: revisionRef.current,
          baseHash: baseHashRef.current,
          updatedAt: new Date().toISOString(),
        });

        // 2. Schedule debounced autosave (1.5s default)
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
        debounceTimerRef.current = setTimeout(() => {
          void executeSave();
        }, debounceMs);

        // 3. Schedule or maintain max-wait timer (10s default)
        if (!maxWaitTimerRef.current) {
          maxWaitTimerRef.current = setTimeout(() => {
            void executeSave();
          }, maxWaitMs);
        }
      } else {
        clearTimers();
        updateStatus('CLEAN');
      }
    },
    [projectId, debounceMs, maxWaitMs, executeSave, clearTimers, updateStatus],
  );

  // Load document and check for crash recovery drafts
  const loadDocument = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    setErrorMessage(null);
    clearTimers();

    try {
      const doc = explicitDocumentId
        ? await fetchDocument(projectId, explicitDocumentId)
        : await fetchMainDocument(projectId);

      if (!isMountedRef.current) return;

      setDocument(doc);
      documentIdRef.current = doc.id;
      revisionRef.current = doc.revision;
      contentRef.current = doc.content;
      lastSavedContentRef.current = doc.content;
      baseHashRef.current = doc.contentHash;
      setContentState(doc.content);
      updateStatus('CLEAN');
      setLastSavedAt(new Date(doc.updatedAt));

      // Check IndexedDB for uncommitted crash recovery draft
      const localDraft = await getDraft(doc.id);
      if (localDraft && localDraft.content !== doc.content) {
        const draftDate = new Date(localDraft.updatedAt).getTime();
        const serverDate = new Date(doc.updatedAt).getTime();
        if (draftDate >= serverDate) {
          setUnrecoveredDraftState(localDraft);
          setStoreUnrecoveredDraft(doc.id, localDraft);
        } else {
          // Stale local draft, delete it
          await deleteDraft(doc.id);
        }
      }
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      const msg = err instanceof Error ? err.message : 'Failed to load document';
      setErrorMessage(msg);
      updateStatus('OFFLINE');
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [projectId, explicitDocumentId, clearTimers, updateStatus, setStoreUnrecoveredDraft]);

  useEffect(() => {
    isMountedRef.current = true;
    void loadDocument();

    return () => {
      isMountedRef.current = false;
      clearTimers();
    };
  }, [loadDocument, clearTimers]);

  // Flush save (e.g. before compilation, tab change, or manual save Ctrl+S)
  const flushSave = useCallback(async (): Promise<boolean> => {
    clearTimers();

    if (contentRef.current === lastSavedContentRef.current) {
      return true;
    }

    return await executeSave();
  }, [executeSave, clearTimers]);

  // Conflict Resolution: Use Server Version
  const resolveConflictUseServer = useCallback(async () => {
    const docId = documentIdRef.current;
    if (!docId || !projectId) return;

    try {
      setIsLoading(true);
      const serverDoc = await fetchDocument(projectId, docId);
      if (!isMountedRef.current) return;

      revisionRef.current = serverDoc.revision;
      contentRef.current = serverDoc.content;
      lastSavedContentRef.current = serverDoc.content;
      baseHashRef.current = serverDoc.contentHash;
      setContentState(serverDoc.content);
      setLastSavedAt(new Date(serverDoc.updatedAt));

      // Clean local draft and conflict state
      await deleteDraft(docId);
      setActiveConflictState(null);
      setStoreConflict(docId, null);
      updateStatus('CLEAN');
      setErrorMessage(null);
    } catch (err) {
      setErrorMessage('Failed to reload server version');
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [projectId, updateStatus, setStoreConflict]);

  // Conflict Resolution: Keep Mine (overwrite server using latest server revision)
  const resolveConflictKeepMine = useCallback(async () => {
    const docId = documentIdRef.current;
    if (!docId || !projectId) return;

    try {
      // 1. Fetch latest server revision to use as baseRevision
      const freshServerDoc = await fetchDocument(projectId, docId);
      revisionRef.current = freshServerDoc.revision;

      // 2. Clear conflict status
      setActiveConflictState(null);
      setStoreConflict(docId, null);

      // 3. Immediately trigger save
      await executeSave();
    } catch (err) {
      setErrorMessage('Failed to resolve conflict: ' + (err instanceof Error ? err.message : String(err)));
    }
  }, [projectId, executeSave, setStoreConflict]);

  // Draft Recovery: Apply local draft
  const applyDraft = useCallback(() => {
    if (!unrecoveredDraft) return;
    setContent(unrecoveredDraft.content);
    setUnrecoveredDraftState(null);
    if (documentIdRef.current) {
      setStoreUnrecoveredDraft(documentIdRef.current, null);
    }
  }, [unrecoveredDraft, setContent, setStoreUnrecoveredDraft]);

  // Draft Recovery: Discard local draft
  const discardDraft = useCallback(async () => {
    const docId = documentIdRef.current;
    if (docId) {
      await deleteDraft(docId);
      setStoreUnrecoveredDraft(docId, null);
    }
    setUnrecoveredDraftState(null);
  }, [setStoreUnrecoveredDraft]);

  // Auto-reconnect when browser returns online
  useEffect(() => {
    const handleOnline = () => {
      if (status === 'OFFLINE' || status === 'DIRTY') {
        void executeSave();
      }
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [status, executeSave]);

  // Browser dirty exit warning
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (status === 'DIRTY' || status === 'SAVING' || isSavingRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [status]);

  return {
    document,
    content,
    setContent,
    status,
    errorMessage,
    lastSavedAt,
    isLoading,
    unrecoveredDraft,
    activeConflict,
    flushSave,
    reloadDocument: loadDocument,
    resolveConflictUseServer,
    resolveConflictKeepMine,
    applyDraft,
    discardDraft,
  };
}
