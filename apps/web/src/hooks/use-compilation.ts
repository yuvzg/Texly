import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type {
  CompilationDTO,
  CompilationLogDTO,
  CompilationDiagnostic,
  Engine,
  CompilationQueuedEvent,
  CompilationStartedEvent,
  CompilationFinishedEvent,
} from '@texly/shared';
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
import { socketClient, type SocketConnectionStatus } from '@/lib/socket-client';

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
  const [socketStatus, setSocketStatus] = useState<SocketConnectionStatus>(
    socketClient.getStatus(),
  );

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pollAttemptRef = useRef(0);
  const isMountedRef = useRef(true);
  const isBusyRef = useRef(false);
  const activeCompilationIdRef = useRef<string | null>(null);

  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  const onFlushSaveRef = useRef(onFlushSave);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;
    onFlushSaveRef.current = onFlushSave;
  });

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

  // View compilation log & diagnostics
  const viewLog = useCallback(async (compilationId: string) => {
    setIsLoadingLog(true);
    try {
      const log = await fetchCompilationLog(compilationId);
      if (isMountedRef.current) {
        setSelectedLog(log);
      }
      return log;
    } catch (err) {
      const msg = formatCompilationError(err);
      if (isMountedRef.current) {
        setErrorMessage(`Failed to load log: ${msg}`);
      }
      return null;
    } finally {
      if (isMountedRef.current) {
        setIsLoadingLog(false);
      }
    }
  }, []);

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
          updated.status === 'CANCELLED' ||
          updated.status === 'TIMED_OUT';

        if (isTerminal) {
          isBusyRef.current = false;
          setIsCompiling(false);
          activeCompilationIdRef.current = null;
          clearPollTimer();

          if (updated.status === 'SUCCEEDED') {
            setLastSuccessfulCompilation(updated);
            onSuccessRef.current?.(updated);
          } else if (updated.status === 'FAILED' || updated.status === 'TIMED_OUT') {
            const msg = updated.errorCode
              ? formatCompilationError(new Error(updated.errorCode))
              : 'Compilation failed with errors. Check the log for details.';
            setErrorMessage(msg);
            onErrorRef.current?.(msg);
          }

          // Fetch diagnostics and logs automatically
          void viewLog(updated.id);
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
        pollAttemptRef.current += 1;
        if (pollAttemptRef.current > 15) {
          isBusyRef.current = false;
          setIsCompiling(false);
          activeCompilationIdRef.current = null;
          setErrorMessage('Lost connection while checking compilation status.');
          clearPollTimer();
        } else {
          pollTimerRef.current = setTimeout(() => {
            void pollCompilationStatus(compilationId);
          }, 10000);
        }
      }
    },
    [clearPollTimer, refreshHistory, viewLog],
  );

  const startPolling = useCallback(
    (compilationId: string) => {
      clearPollTimer();
      activeCompilationIdRef.current = compilationId;
      pollAttemptRef.current = 0;
      const initialDelay = BACKOFF_DELAYS[0] ?? 2000;
      pollTimerRef.current = setTimeout(() => {
        void pollCompilationStatus(compilationId);
      }, initialDelay);
    },
    [clearPollTimer, pollCompilationStatus],
  );

  // Subscribe to socket events and connection state
  useEffect(() => {
    if (!projectId) return;

    // Track connection state
    const unsubscribeStatus = socketClient.subscribeStatus((status) => {
      if (isMountedRef.current) {
        setSocketStatus(status);
        // On reconnect, catch up with latest compilation status
        if (status === 'connected') {
          fetchLatestCompilation(projectId)
            .then((latest) => {
              if (!isMountedRef.current || !latest) return;
              setCurrentCompilation(latest);
              if (latest.status === 'SUCCEEDED') {
                setLastSuccessfulCompilation(latest);
              }
              if (latest.status === 'QUEUED' || latest.status === 'RUNNING') {
                setIsCompiling(true);
                activeCompilationIdRef.current = latest.id;
              } else {
                setIsCompiling(false);
                activeCompilationIdRef.current = null;
                clearPollTimer();
              }
            })
            .catch(() => {});
        }
      }
    });

    socketClient.joinProject(projectId);

    // Event handlers
    const unsubQueued = socketClient.onCompilationQueued((event: CompilationQueuedEvent) => {
      if (!isMountedRef.current || event.projectId !== projectId) return;
      setIsCompiling(true);
      activeCompilationIdRef.current = event.compilationId;
      setErrorMessage(null);
      setCurrentCompilation((prev) =>
        prev && prev.id === event.compilationId
          ? { ...prev, status: 'QUEUED' }
          : ({
              id: event.compilationId,
              projectId: event.projectId,
              status: 'QUEUED',
              engine: prev?.engine ?? defaultEngine,
              trigger: prev?.trigger ?? 'MANUAL',
              errorCount: 0,
              warningCount: 0,
              hasPdf: prev?.hasPdf ?? false,
              cacheHit: false,
              createdAt: event.timestamp,
              finishedAt: null,
              durationMs: null,
              sizeBytes: null,
              errorCode: null,
            } as unknown as CompilationDTO),
      );
    });

    const unsubStarted = socketClient.onCompilationStarted((event: CompilationStartedEvent) => {
      if (!isMountedRef.current || event.projectId !== projectId) return;
      setIsCompiling(true);
      activeCompilationIdRef.current = event.compilationId;
      setCurrentCompilation((prev) => (prev ? { ...prev, status: 'RUNNING' } : null));
    });

    const unsubFinished = socketClient.onCompilationFinished((event: CompilationFinishedEvent) => {
      if (!isMountedRef.current || event.projectId !== projectId) return;
      clearPollTimer();
      isBusyRef.current = false;
      setIsCompiling(false);
      activeCompilationIdRef.current = null;

      // Fetch full details
      fetchCompilation(event.compilationId)
        .then((full) => {
          if (!isMountedRef.current) return;
          setCurrentCompilation(full);

          if (full.status === 'SUCCEEDED') {
            setLastSuccessfulCompilation(full);
            onSuccessRef.current?.(full);
          } else if (full.status === 'FAILED' || full.status === 'TIMED_OUT') {
            const msg = full.errorCode
              ? formatCompilationError(new Error(full.errorCode))
              : 'Compilation failed with errors. Check the log for details.';
            setErrorMessage(msg);
            onErrorRef.current?.(msg);
          }

          void viewLog(full.id);
          void refreshHistory();
        })
        .catch(() => {
          if (!isMountedRef.current) return;
          setCurrentCompilation((prev) =>
            prev
              ? {
                  ...prev,
                  status: event.status,
                  hasPdf: event.hasPdf ?? false,
                  errorCount: event.errorCount ?? 0,
                  warningCount: event.warningCount ?? 0,
                }
              : null,
          );
          void refreshHistory();
        });
    });

    return () => {
      unsubscribeStatus();
      unsubQueued();
      unsubStarted();
      unsubFinished();
      socketClient.leaveProject(projectId);
    };
  }, [projectId, defaultEngine, clearPollTimer, refreshHistory, viewLog]);

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
            activeCompilationIdRef.current = latest.id;
            startPolling(latest.id);
          } else {
            // Load logs for the latest compilation
            void viewLog(latest.id);
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
  }, [projectId, clearPollTimer, refreshHistory, startPolling, viewLog]);

  // Main compile action
  const compile = useCallback(
    async (
      engineOverride?: Engine,
      bypassCache = false,
      trigger: 'MANUAL' | 'AUTO' | 'AI_ACCEPT' | 'RESTORE' = 'MANUAL',
    ) => {
      if (isBusyRef.current || isCompiling || isSaving) {
        return;
      }

      isBusyRef.current = true;
      setErrorMessage(null);

      // Step 1: Flush pending autosave before starting compilation
      if (onFlushSaveRef.current) {
        setIsSaving(true);
        try {
          const saveSuccess = await onFlushSaveRef.current();
          if (!saveSuccess) {
            isBusyRef.current = false;
            setIsSaving(false);
            setErrorMessage('Unable to save changes before compiling. Please check for conflicts.');
            onErrorRef.current?.('Save failed before compilation.');
            return;
          }
        } catch (err) {
          isBusyRef.current = false;
          setIsSaving(false);
          const msg = formatCompilationError(err);
          setErrorMessage(`Save failed: ${msg}`);
          onErrorRef.current?.(msg);
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
          trigger,
          draft: false,
        });

        if (!isMountedRef.current) return;
        setCurrentCompilation(compilation);
        activeCompilationIdRef.current = compilation.id;

        // Immediate cache hit
        if (!bypassCache && (compilation.cacheHit || compilation.status === 'SUCCEEDED')) {
          isBusyRef.current = false;
          setIsCompiling(false);
          activeCompilationIdRef.current = null;
          setLastSuccessfulCompilation(compilation);
          onSuccessRef.current?.(compilation);
          void viewLog(compilation.id);
          void refreshHistory();
          return;
        }

        // Always start a backup polling timer in case socket events are delayed/lost
        startPolling(compilation.id);
      } catch (err) {
        isBusyRef.current = false;
        activeCompilationIdRef.current = null;
        if (!isMountedRef.current) return;
        setIsCompiling(false);
        const msg = formatCompilationError(err);
        setErrorMessage(msg);
        onErrorRef.current?.(msg);
      }
    },
    [
      isCompiling,
      isSaving,
      defaultEngine,
      projectId,
      refreshHistory,
      startPolling,
      viewLog,
    ],
  );

  // Recompile from scratch (bypass cache)
  const recompileFromScratch = useCallback(
    async (engineOverride?: Engine) => {
      return compile(engineOverride, true, 'MANUAL');
    },
    [compile],
  );

  // Cancel compilation action
  const cancel = useCallback(async () => {
    if (!currentCompilation || !isCompiling) return;

    try {
      const updated = await cancelCompilation(currentCompilation.id);
      clearPollTimer();
      isBusyRef.current = false;
      setIsCompiling(false);
      activeCompilationIdRef.current = null;
      setCurrentCompilation(updated);
      void refreshHistory();
    } catch (err) {
      const msg = formatCompilationError(err);
      setErrorMessage(`Failed to cancel: ${msg}`);
    }
  }, [currentCompilation, isCompiling, clearPollTimer, refreshHistory]);

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

  const diagnostics: CompilationDiagnostic[] = useMemo(() => {
    return selectedLog?.diagnostics ?? [];
  }, [selectedLog]);

  const diagnosticCounts = useMemo(() => {
    if (selectedLog?.counts) {
      return selectedLog.counts;
    }
    const errors = diagnostics.filter((d) => d.level === 'error').length;
    const warnings = diagnostics.filter((d) => d.level === 'warning').length;
    return { errors, warnings };
  }, [selectedLog, diagnostics]);

  return {
    currentCompilation,
    lastSuccessfulCompilation,
    history,
    isCompiling,
    isSaving,
    errorMessage,
    selectedLog,
    isLoadingLog,
    socketStatus,
    diagnostics,
    diagnosticCounts,
    compile,
    recompileFromScratch,
    cancel,
    refreshHistory,
    viewLog,
    downloadPdf,
    closeLog: () => setSelectedLog(null),
    clearError: () => setErrorMessage(null),
  };
}
export type UseCompilationReturn = ReturnType<typeof useCompilation>;
