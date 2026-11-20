'use client';

import React from 'react';
import { FileText, Loader2, AlertCircle, RefreshCw, Play, FileWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface PdfEmptyStateProps {
  type: 'empty' | 'compiling' | 'compile-failed' | 'load-failed' | 'expired';
  errorMessage?: string | null | undefined;
  errorCount?: number | undefined;
  onCompile?: (() => void) | undefined;
  onRetry?: (() => void) | undefined;
  onViewLog?: (() => void) | undefined;
  className?: string | undefined;
}

export function PdfEmptyState({
  type,
  errorMessage,
  errorCount = 0,
  onCompile,
  onRetry,
  onViewLog,
  className = '',
}: PdfEmptyStateProps) {
  if (type === 'compiling') {
    return (
      <div
        className={`flex flex-col items-center justify-center p-8 text-center rounded-2xl bg-white dark:bg-[#0A1310] border border-gray-200 dark:border-[#00D69A]/20 shadow-[0_0_20px_rgba(0,214,154,0.08)] max-w-sm mx-auto my-auto ${className}`}
        data-testid="pdf-state-compiling"
      >
        <Loader2 className="h-9 w-9 animate-spin text-[#00D69A] mb-3" />
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          Compiling document...
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Executing LaTeX engine inside container sandbox
        </p>
      </div>
    );
  }

  if (type === 'compile-failed') {
    return (
      <div
        className={`flex flex-col items-center justify-center p-6 text-center rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 shadow-lg max-w-sm mx-auto my-auto ${className}`}
        data-testid="pdf-state-compile-failed"
      >
        <AlertCircle className="h-9 w-9 text-rose-500 mb-2" />
        <p className="text-sm font-semibold text-rose-800 dark:text-rose-200 mb-1">
          Compilation Failed
        </p>
        <p className="text-xs text-rose-600 dark:text-rose-400 mb-4">
          {errorMessage ||
            (errorCount > 0
              ? `${errorCount} error(s) found during compilation. Check the log for diagnostics.`
              : 'LaTeX process exited with errors. Check log for details.')}
        </p>
        <div className="flex items-center gap-2">
          {onViewLog && (
            <Button
              size="sm"
              variant="outline"
              onClick={onViewLog}
              className="text-xs border-rose-300 dark:border-rose-900/50 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-800 dark:text-rose-200"
            >
              View Log
            </Button>
          )}
          {onCompile && (
            <Button
              size="sm"
              onClick={onCompile}
              className="text-xs bg-rose-600 hover:bg-rose-700 text-white"
            >
              Recompile
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (type === 'load-failed' || type === 'expired') {
    return (
      <div
        className={`flex flex-col items-center justify-center p-6 text-center rounded-2xl bg-white dark:bg-[#0A1310] border border-gray-200 dark:border-[#00D69A]/20 shadow-md max-w-sm mx-auto my-auto ${className}`}
        data-testid="pdf-state-load-failed"
      >
        <FileWarning className="h-9 w-9 text-amber-500 mb-2" />
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">
          {type === 'expired' ? 'Preview Link Expired' : 'Unable to Render PDF'}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          {errorMessage ||
            (type === 'expired'
              ? 'The secure preview link has expired. Refresh to generate a new session.'
              : 'Failed to fetch or parse the generated PDF document.')}
        </p>
        {onRetry && (
          <Button
            size="sm"
            onClick={onRetry}
            className="text-xs bg-[#00D69A] text-black hover:bg-[#00BF89] font-medium flex items-center gap-1.5"
            data-testid="pdf-retry-button"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry Preview
          </Button>
        )}
      </div>
    );
  }

  // Default: 'empty'
  return (
    <div
      className={`border border-dashed border-gray-300 dark:border-[#00D69A]/30 rounded-2xl p-8 max-w-sm mx-auto my-auto text-center bg-white dark:bg-[#0A1310] shadow-sm ${className}`}
      data-testid="pdf-state-empty"
    >
      <FileText className="h-10 w-10 text-gray-400 dark:text-[#00D69A]/60 mx-auto mb-3" />
      <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">
        Press Compile to preview your document.
      </p>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
        Build a high-fidelity PDF from your LaTeX source code.
      </p>
      {onCompile && (
        <Button
          size="sm"
          onClick={onCompile}
          className="text-xs bg-[#00D69A] text-black hover:bg-[#00BF89] font-medium flex items-center gap-1.5 mx-auto"
          data-testid="pdf-empty-compile-button"
        >
          <Play className="h-3.5 w-3.5 fill-current" />
          Compile Now
          <kbd className="ml-1 text-[10px] font-mono bg-black/20 text-black px-1 rounded">
            Mod-Enter
          </kbd>
        </Button>
      )}
    </div>
  );
}
