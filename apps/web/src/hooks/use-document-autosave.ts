import { useState, useEffect, useRef, useCallback } from 'react';
import type { DocumentDTO } from '@texly/shared';
import { fetchMainDocument, fetchDocument, saveDocumentContent, computeSha256 } from '@/lib/documents';
import { ApiClientError } from '@/lib/api-client';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'unsaved' | 'conflict' | 'error';

export interface UseDocumentAutosaveOptions {
  projectId: string;
  documentId?: string | undefined;
  debounceMs?: number | undefined;
  onSaveSuccess?: ((revision: number) => void) | undefined;
  onSaveConflict?: ((serverRevision?: number) => void) | undefined;
  onSaveError?: ((error: Error) => void) | undefined;
}

export function useDocumentAutosave({
  projectId,
  documentId: explicitDocumentId,
  debounceMs = 1000,
  onSaveSuccess,
  onSaveConflict,
  onSaveError,
}: UseDocumentAutosaveOptions) {
  const [document, setDocument] = useState<DocumentDTO | null>(null);
  const [content, setContentState] = useState<string>('');
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Mutable refs to prevent stale closures and manage in-flight saves
  const contentRef = useRef<string>('');
  const lastSavedContentRef = useRef<string>('');
  const revisionRef = useRef<number>(0);
  const documentIdRef = useRef<string | null>(explicitDocumentId ?? null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isSavingRef = useRef<boolean>(false);
  const hasPendingSaveRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);

  // Keep contentRef in sync
  const setContent = useCallback(
    (newContent: string) => {
      contentRef.current = newContent;
      setContentState(newContent);

      if (newContent !== lastSavedContentRef.current) {
        setStatus('unsaved');
        setErrorMessage(null);

        // Debounce autosave
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
        debounceTimerRef.current = setTimeout(() => {
          void executeSave();
        }, debounceMs);
      }
    },
    [debounceMs],
  );

  // Load document on mount or when projectId/explicitDocumentId changes
  const loadDocument = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    setErrorMessage(null);

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
      setContentState(doc.content);
      setStatus('saved');
      setLastSavedAt(new Date(doc.updatedAt));
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      const msg = err instanceof Error ? err.message : 'Failed to load document';
      setErrorMessage(msg);
      setStatus('error');
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [projectId, explicitDocumentId]);

  useEffect(() => {
    isMountedRef.current = true;
    void loadDocument();

    return () => {
      isMountedRef.current = false;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [loadDocument]);

  // Execute save logic
  const executeSave = useCallback(async (): Promise<boolean> => {
    if (!documentIdRef.current || !projectId) {
      return false;
    }

    const currentText = contentRef.current;

    // If identical to last saved, mark saved and exit
    if (currentText === lastSavedContentRef.current) {
      if (isMountedRef.current) {
        setStatus('saved');
      }
      return true;
    }

    // Coalesce in-flight saves
    if (isSavingRef.current) {
      hasPendingSaveRef.current = true;
      return false;
    }

    isSavingRef.current = true;
    if (isMountedRef.current) {
      setStatus('saving');
      setErrorMessage(null);
    }

    try {
      const clientHash = await computeSha256(currentText);
      const res = await saveDocumentContent(projectId, documentIdRef.current, {
        baseRevision: revisionRef.current,
        content: currentText,
        clientHash,
      });

      if (!isMountedRef.current) return true;

      revisionRef.current = res.revision;
      lastSavedContentRef.current = currentText;
      setLastSavedAt(new Date(res.updatedAt));
      setStatus('saved');
      setErrorMessage(null);
      onSaveSuccess?.(res.revision);

      return true;
    } catch (err: unknown) {
      if (!isMountedRef.current) return false;

      if (err instanceof ApiClientError && err.status === 409) {
        setStatus('conflict');
        const conflictDetails = err.details as { serverRevision?: number } | undefined;
        const sRev = conflictDetails?.serverRevision;
        setErrorMessage(
          `Document conflict detected (server revision ${sRev ?? 'unknown'}). Reload or resolve conflicting edits.`,
        );
        onSaveConflict?.(sRev);
      } else {
        setStatus('error');
        const msg = err instanceof Error ? err.message : 'Failed to save document';
        setErrorMessage(msg);
        if (err instanceof Error) {
          onSaveError?.(err);
        }
      }
      return false;
    } finally {
      isSavingRef.current = false;

      // If user typed while save was in-flight, trigger follow-up save
      if (hasPendingSaveRef.current) {
        hasPendingSaveRef.current = false;
        void executeSave();
      }
    }
  }, [projectId, onSaveSuccess, onSaveConflict, onSaveError]);

  // Flush save (e.g. before compilation or manual save)
  const flushSave = useCallback(async (): Promise<boolean> => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    if (contentRef.current === lastSavedContentRef.current) {
      return true;
    }

    return await executeSave();
  }, [executeSave]);

  // Browser dirty exit warning
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (status === 'unsaved' || isSavingRef.current) {
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
    flushSave,
    reloadDocument: loadDocument,
  };
}
