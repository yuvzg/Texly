import { useState, useEffect, useRef, useCallback } from 'react';
import type { CompilationDTO, CompilationLogDTO, Engine } from '@texly/shared';
import {
  triggerCompilation,
  fetchCompilation,
  fetchLatestCompilation,
  fetchCompilationList,
  fetchCompilationLog,
  fetchCompilationPdf,
  cancelCompilation,
  formatCompilationError,
} from '@/lib/compilations';

export interface UseCompilationOptions {
  projectId: string;
  defaultEngine?: Engine | undefined;
  onFlushSave?: (() => Promise<boolean>) | undefined;
  onSuccess?: ((compilation: CompilationDTO) => void) | undefined;
  onError?: ((errorMsg: string) => void) | undefined;
}

const BACKOFF_DELAYS = [2000, 3000, 5000, 8000, 10000];

export function useCompilation({
  projectId,
  defaultEngine = 'PDFLATEX',
  onFlushSave,
  onSuccess,
  onError,
}: UseCompilationOptions) {
  const [currentCompilation, setCurrentCompilation] = useState<CompilationDTO | null>(null);
  const [lastSuccessfulCompilation, setLastSuccessfulCompilation] = useState<CompilationDTO | null>(
    null,
  );
  const [history, setHistory] = useState<CompilationDTO[]>([]);
  const [isCompiling, setIsCompiling] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<CompilationLogDTO | null>(null);
  const [isLoadingLog, setIsLoadingLog] = useState(false);

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pollAttemptRef = useRef(0);
  const isMountedRef = useRef(true);
  const isBusyRef = useRef(false);

  // Clear polling timer safely
  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  // Refresh history list
  const refreshHistory = useCallback(async () => {
    if (!projectId) return;
    try {
      const items = await fetchCompilationList(projectId, { limit: 10 });
      if (isMountedRef.current) {
        setHistory(items);
        const lastSuccess = items.find((item) => item.status === 'SUCCEEDED');
        if (lastSuccess) {
          setLastSuccessfulCompilation((prev) => prev ?? lastSuccess);
        }
      }
    } catch {
      // Background history refresh failure is non-fatal
    }
  }, [projectId]);

  // Load initial latest compilation and history on mount or project switch
  useEffect(() => {
    isMountedRef.current = true;
    clearPollTimer();
    setErrorMessage(null);

    async function loadInitial() {
      try {
        const latest = await fetchLatestCompilation(projectId);
        if (!isMountedRef.current) return;
        if (latest) {
          setCurrentCompilation(latest);
          if (latest.status === 'SUCCEEDED') {
            setLastSuccessfulCompilation(latest);
          }
          if (latest.status === 'QUEUED' || latest.status === 'RUNNING') {
            setIsCompiling(true);
            startPolling(latest.id);
          }
        }
        await refreshHistory();
      } catch {
        // Initial load failure is non-fatal
      }
    }

    if (projectId) {
      void loadInitial();
    }

    return () => {
      isMountedRef.current = false;
      clearPollTimer();
    };
  }, [projectId, clearPollTimer, refreshHistory]);

  // Polling step with backoff
  const pollCompilationStatus = useCallback(
    async (compilationId: string) => {
      if (!isMountedRef.current) return;

      try {
        const updated = await fetchCompilation(compilationId);
        if (!isMountedRef.current) return;

        setCurrentCompilation(updated);

        const isTerminal =
          updated.status === 'SUCCEEDED' ||
          updated.status === 'FAILED' ||
          updated.status === 'CANCELLED';

        if (isTerminal) {
          isBusyRef.current = false;
          setIsCompiling(false);
          clearPollTimer();

          if (updated.status === 'SUCCEEDED') {
            setLastSuccessfulCompilation(updated);
            onSuccess?.(updated);
          } else if (updated.status === 'FAILED') {
            const msg = updated.errorCode
              ? formatCompilationError(new Error(updated.errorCode))
              : 'Compilation failed with errors. Check the log for details.';
            setErrorMessage(msg);
            onError?.(msg);
          }

          void refreshHistory();
          return;
        }

        // Schedule next poll with backoff
        pollAttemptRef.current += 1;
        const delay =
          BACKOFF_DELAYS[Math.min(pollAttemptRef.current, BACKOFF_DELAYS.length - 1)] ?? 10000;

        pollTimerRef.current = setTimeout(() => {
          void pollCompilationStatus(compilationId);
        }, delay);
      } catch {
        if (!isMountedRef.current) return;
        // On error, try one more time with max delay or stop
        pollAttemptRef.current += 1;
        if (pollAttemptRef.current > 15) {
          isBusyRef.current = false;
          setIsCompiling(false);
          setErrorMessage('Lost connection while checking compilation status.');
          clearPollTimer();
        } else {
          pollTimerRef.current = setTimeout(() => {
            void pollCompilationStatus(compilationId);
          }, 10000);
        }
      }
    },
    [clearPollTimer, onSuccess, onError, refreshHistory],
  );

  const startPolling = useCallback(
    (compilationId: string) => {
      clearPollTimer();
      pollAttemptRef.current = 0;
      const initialDelay = BACKOFF_DELAYS[0] ?? 2000;
      pollTimerRef.current = setTimeout(() => {
        void pollCompilationStatus(compilationId);
      }, initialDelay);
    },
    [clearPollTimer, pollCompilationStatus],
  );

  // Main compile action
  const compile = useCallback(
    async (engineOverride?: Engine) => {
      if (isBusyRef.current || isCompiling || isSaving) {
        // Prevent accidental duplicate requests from repeated clicks
        return;
      }

      isBusyRef.current = true;
      setErrorMessage(null);

      // Step 1: Flush pending autosave before starting compilation
      if (onFlushSave) {
        setIsSaving(true);
        try {
          const saveSuccess = await onFlushSave();
          if (!saveSuccess) {
            isBusyRef.current = false;
            setIsSaving(false);
            setErrorMessage('Unable to save changes before compiling. Please check for conflicts.');
            onError?.('Save failed before compilation.');
            return;
          }
        } catch (err) {
          isBusyRef.current = false;
          setIsSaving(false);
          const msg = formatCompilationError(err);
          setErrorMessage(`Save failed: ${msg}`);
          onError?.(msg);
          return;
        } finally {
          setIsSaving(false);
        }
      }

      // Step 2: Send compilation request
      setIsCompiling(true);
      try {
        const engine = engineOverride || defaultEngine;
        const compilation = await triggerCompilation(projectId, {
          engine,
          trigger: 'MANUAL',
          draft: false,
        });

        if (!isMountedRef.current) return;
        setCurrentCompilation(compilation);

        // Immediate cache hit
        if (compilation.cacheHit || compilation.status === 'SUCCEEDED') {
          isBusyRef.current = false;
          setIsCompiling(false);
          setLastSuccessfulCompilation(compilation);
          onSuccess?.(compilation);
          void refreshHistory();
          return;
        }

        // Active job: begin REST polling
        startPolling(compilation.id);
      } catch (err) {
        isBusyRef.current = false;
        if (!isMountedRef.current) return;
        setIsCompiling(false);
        const msg = formatCompilationError(err);
        setErrorMessage(msg);
        onError?.(msg);
      }
    },
    [
      isCompiling,
      isSaving,
      onFlushSave,
      defaultEngine,
      projectId,
      onSuccess,
      onError,
      refreshHistory,
      startPolling,
    ],
  );

  // Cancel compilation action
  const cancel = useCallback(async () => {
    if (!currentCompilation || !isCompiling) return;

    try {
      const updated = await cancelCompilation(currentCompilation.id);
      clearPollTimer();
      isBusyRef.current = false;
      setIsCompiling(false);
      setCurrentCompilation(updated);
      void refreshHistory();
    } catch (err) {
      const msg = formatCompilationError(err);
      setErrorMessage(`Failed to cancel: ${msg}`);
    }
  }, [currentCompilation, isCompiling, clearPollTimer, refreshHistory]);

  // View compilation log
  const viewLog = useCallback(async (compilationId: string) => {
    setIsLoadingLog(true);
    try {
      const log = await fetchCompilationLog(compilationId);
      setSelectedLog(log);
    } catch (err) {
      const msg = formatCompilationError(err);
      setErrorMessage(`Failed to load log: ${msg}`);
    } finally {
      setIsLoadingLog(false);
    }
  }, []);

  // Download PDF helper
  const downloadPdf = useCallback(
    async (compilationId?: string) => {
      const targetId = compilationId ?? lastSuccessfulCompilation?.id ?? currentCompilation?.id;
      if (!targetId) return;

      try {
        const pdfData = await fetchCompilationPdf(targetId, true);
        if (pdfData.url) {
          window.open(pdfData.url, '_blank', 'noopener,noreferrer');
        }
      } catch (err) {
        const msg = formatCompilationError(err);
        setErrorMessage(`Failed to download PDF: ${msg}`);
      }
    },
    [lastSuccessfulCompilation, currentCompilation],
  );

  // Global Mod-Enter keyboard shortcut listener
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        void compile();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [compile]);

  return {
    currentCompilation,
    lastSuccessfulCompilation,
    history,
    isCompiling,
    isSaving,
    errorMessage,
    selectedLog,
    isLoadingLog,
    compile,
    cancel,
    refreshHistory,
    viewLog,
    downloadPdf,
    closeLog: () => setSelectedLog(null),
    clearError: () => setErrorMessage(null),
  };
}
