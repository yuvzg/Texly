import React, { useState, useEffect } from 'react';
import { Play, Loader2, Download, History, Ban, AlertTriangle, X } from 'lucide-react';
import type { Engine, CompilationDTO } from '@texly/shared';
import { Button } from '@/components/ui/button';
import { CompileStatusChip } from './compile-status-chip';
import { CompilationHistoryModal } from './compilation-history-modal';
import { CompilationLogModal } from './compilation-log-modal';
import { useCompilation } from '@/hooks/use-compilation';

export interface CompileToolbarProps {
  projectId: string;
  defaultEngine?: Engine;
  onFlushSave?: () => Promise<boolean>;
  onCompileSuccess?: () => void;
  onCompilationChange?: (
    current: CompilationDTO | null,
    lastSuccess: CompilationDTO | null,
    isCompiling: boolean,
  ) => void;
  className?: string;
}

export function CompileToolbar({
  projectId,
  defaultEngine = 'PDFLATEX',
  onFlushSave,
  onCompileSuccess,
  onCompilationChange,
  className,
}: CompileToolbarProps) {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const {
    currentCompilation,
    lastSuccessfulCompilation,
    history,
    isCompiling,
    isSaving,
    errorMessage,
    selectedLog,
    compile,
    cancel,
    refreshHistory,
    viewLog,
    downloadPdf,
    closeLog,
    clearError,
  } = useCompilation({
    projectId,
    defaultEngine,
    onFlushSave,
    onSuccess: () => {
      onCompileSuccess?.();
    },
  });

  useEffect(() => {
    onCompilationChange?.(currentCompilation, lastSuccessfulCompilation, isCompiling);
  }, [currentCompilation, lastSuccessfulCompilation, isCompiling, onCompilationChange]);

  const isBusy = isCompiling || isSaving;
  const canCancel =
    isCompiling &&
    (currentCompilation?.status === 'QUEUED' || currentCompilation?.status === 'RUNNING');
  const hasPdfAvailable =
    lastSuccessfulCompilation?.hasPdf ||
    (currentCompilation?.status === 'SUCCEEDED' && currentCompilation.hasPdf);

  return (
    <div className={`flex flex-col gap-1 ${className ?? ''}`}>
      <div className="flex items-center gap-2">
        {/* Status Chip */}
        <CompileStatusChip
          currentCompilation={currentCompilation}
          lastSuccessfulCompilation={lastSuccessfulCompilation}
          isCompiling={isCompiling}
          isSaving={isSaving}
          onClickHistory={() => setIsHistoryOpen(true)}
        />

        {/* Cancel Button (when active) */}
        {canCancel && (
          <Button
            size="sm"
            variant="outline"
            onClick={cancel}
            data-testid="cancel-compile-button"
            className="h-8 px-2.5 text-xs text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900/40 hover:bg-rose-50 dark:hover:bg-rose-950/40"
            title="Cancel running compilation"
          >
            <Ban className="h-3.5 w-3.5 mr-1" />
            Cancel
          </Button>
        )}

        {/* Quick PDF Download Button */}
        {hasPdfAvailable && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => downloadPdf()}
            data-testid="download-pdf-button"
            className="h-8 px-2.5 text-xs text-gray-700 dark:text-gray-300 border-gray-200 dark:border-[#00D69A]/20 hover:bg-gray-50 dark:hover:bg-[#003D30]/60"
            title="Download latest generated PDF"
          >
            <Download className="h-3.5 w-3.5 mr-1 text-gray-600 dark:text-[#00D69A]" />
            PDF
          </Button>
        )}

        {/* History Modal Trigger */}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            void refreshHistory();
            setIsHistoryOpen(true);
          }}
          data-testid="history-button"
          className="h-8 px-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-[#00D69A] hover:bg-gray-100 dark:hover:bg-[#003D30]/40"
          title="Compilation history"
        >
          <History className="h-3.5 w-3.5" />
        </Button>

        {/* Main Compile Button */}
        <Button
          size="sm"
          variant="default"
          onClick={() => compile()}
          disabled={isBusy}
          data-testid="compile-button"
          className="flex items-center gap-1.5 bg-[#00D69A] hover:bg-[#00BF89] text-[#050807] font-semibold shadow-[0_0_15px_rgba(0,214,154,0.25)] hover:shadow-[0_0_20px_rgba(0,214,154,0.35)] transition-all cursor-pointer"
          title="Compile document (Mod-Enter)"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Saving...</span>
            </>
          ) : isCompiling ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Compiling...</span>
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>Compile</span>
              <kbd className="hidden sm:inline-block ml-1 px-1 py-0.2 text-[10px] bg-black/20 rounded text-[#050807] font-mono font-bold">
                ⌘↵
              </kbd>
            </>
          )}
        </Button>
      </div>

      {/* User-friendly Error Alert Banner */}
      {errorMessage && (
        <div
          data-testid="compilation-error-banner"
          className="flex items-center justify-between px-3 py-1.5 text-xs bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/50 text-rose-800 dark:text-rose-200 rounded-md mt-1 animate-in fade-in duration-200"
        >
          <div className="flex items-center gap-1.5 overflow-hidden">
            <AlertTriangle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
            <span className="truncate">{errorMessage}</span>
          </div>
          <button
            onClick={clearError}
            className="p-0.5 text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-200 rounded ml-2 cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* History Modal */}
      <CompilationHistoryModal
        history={history}
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        onViewLog={(id) => {
          setIsHistoryOpen(false);
          void viewLog(id);
        }}
        onDownloadPdf={(id) => {
          void downloadPdf(id);
        }}
        onCancel={() => {
          void cancel();
        }}
        onRefresh={() => {
          void refreshHistory();
        }}
        isCompiling={isCompiling}
      />

      {/* Diagnostics / Log Modal */}
      <CompilationLogModal log={selectedLog} isOpen={selectedLog !== null} onClose={closeLog} />
    </div>
  );
}
