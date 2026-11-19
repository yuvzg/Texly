import React from 'react';
import { Check, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import type { SaveStatus } from '@/hooks/use-document-autosave';

interface SaveStatusIndicatorProps {
  status: SaveStatus;
  lastSavedAt?: Date | null;
  errorMessage?: string | null;
  onRetry?: () => void;
  onReload?: () => void;
}

export function SaveStatusIndicator({
  status,
  lastSavedAt,
  errorMessage,
  onRetry,
  onReload,
}: SaveStatusIndicatorProps) {
  switch (status) {
    case 'saving':
      return (
        <span
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground animate-pulse"
          data-testid="save-status-saving"
        >
          <Loader2 className="h-3 w-3 animate-spin text-[#00D69A]" />
          <span>Saving...</span>
        </span>
      );

    case 'saved':
      return (
        <span
          className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-[#00D69A] font-medium"
          data-testid="save-status-saved"
          title={lastSavedAt ? `Saved at ${lastSavedAt.toLocaleTimeString()}` : 'All changes saved'}
        >
          <Check className="h-3.5 w-3.5 text-[#00D69A]" />
          <span>Saved</span>
        </span>
      );

    case 'unsaved':
      return (
        <span
          className="inline-flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800/50"
          data-testid="save-status-unsaved"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping" />
          <span>Unsaved changes</span>
        </span>
      );

    case 'conflict':
      return (
        <div
          className="inline-flex items-center gap-2 text-xs text-rose-600 dark:text-rose-300 font-medium bg-rose-50 dark:bg-rose-950/50 px-2 py-0.5 rounded border border-rose-200 dark:border-rose-900/50"
          data-testid="save-status-conflict"
          title={errorMessage || 'Document was modified elsewhere'}
        >
          <AlertCircle className="h-3.5 w-3.5 text-rose-500" />
          <span>Conflict detected</span>
          {onReload && (
            <button
              type="button"
              onClick={onReload}
              className="underline hover:text-rose-400 flex items-center gap-0.5 ml-1 cursor-pointer"
            >
              <RefreshCw className="h-3 w-3" /> Reload
            </button>
          )}
        </div>
      );

    case 'error':
      return (
        <div
          className="inline-flex items-center gap-2 text-xs text-rose-600 dark:text-rose-300 font-medium bg-rose-50 dark:bg-rose-950/50 px-2 py-0.5 rounded border border-rose-200 dark:border-rose-900/50"
          data-testid="save-status-error"
          title={errorMessage || 'Failed to save document'}
        >
          <AlertCircle className="h-3.5 w-3.5 text-rose-500" />
          <span>Save failed</span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="underline hover:text-rose-400 ml-1 cursor-pointer"
            >
              Retry
            </button>
          )}
        </div>
      );

    case 'idle':
    default:
      return null;
  }
}

