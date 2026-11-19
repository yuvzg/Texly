import React from 'react';
import { Loader2, CheckCircle2, AlertCircle, Clock, Ban } from 'lucide-react';
import type { CompilationDTO } from '@texly/shared';
import { cn } from '@/lib/utils';

export interface CompileStatusChipProps {
  currentCompilation: CompilationDTO | null;
  lastSuccessfulCompilation: CompilationDTO | null;
  isCompiling: boolean;
  isSaving: boolean;
  className?: string;
  onClickHistory?: () => void;
}

function formatRelativeTime(dateStr?: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  return `${diffHours}h ago`;
}

export function CompileStatusChip({
  currentCompilation,
  lastSuccessfulCompilation,
  isCompiling: _isCompiling,
  isSaving,
  className,
  onClickHistory,
}: CompileStatusChipProps) {
  if (isSaving) {
    return (
      <div
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40',
          className,
        )}
      >
        <Loader2 className="h-3 w-3 animate-spin text-amber-600 dark:text-amber-400" />
        <span>Saving changes...</span>
      </div>
    );
  }

  const status = currentCompilation?.status ?? 'IDLE';
  const engine = currentCompilation?.engine ?? 'PDFLATEX';

  switch (status) {
    case 'QUEUED':
      return (
        <div
          data-testid="status-chip-queued"
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-950/40 dark:bg-[#003D30]/60 text-emerald-400 dark:text-[#00D69A] border border-emerald-800/40 dark:border-[#00D69A]/30',
            className,
          )}
        >
          <Clock className="h-3 w-3 animate-pulse text-[#00D69A]" />
          <span>Queued ({engine.toLowerCase()})</span>
        </div>
      );

    case 'RUNNING':
      return (
        <div
          data-testid="status-chip-running"
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#003D30]/80 text-[#00D69A] border border-[#00D69A]/40 shadow-[0_0_10px_rgba(0,214,154,0.1)]',
            className,
          )}
        >
          <Loader2 className="h-3 w-3 animate-spin text-[#00D69A]" />
          <span>Compiling... ({engine.toLowerCase()})</span>
        </div>
      );

    case 'SUCCEEDED':
      return (
        <div
          data-testid="status-chip-succeeded"
          onClick={onClickHistory}
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 dark:bg-[#003D30] text-emerald-700 dark:text-[#00D69A] border border-emerald-200 dark:border-[#00D69A]/40 cursor-pointer hover:bg-emerald-100 dark:hover:bg-[#003D30]/80 transition-colors',
            className,
          )}
          title="Click to view compilation history"
        >
          <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-[#00D69A]" />
          <span>Succeeded</span>
          {currentCompilation && currentCompilation.warningCount > 0 && (
            <span className="bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-[10px] px-1 rounded font-semibold border border-amber-300/30">
              {currentCompilation.warningCount}{' '}
              {currentCompilation.warningCount === 1 ? 'warn' : 'warns'}
            </span>
          )}
          {currentCompilation?.durationMs ? (
            <span className="text-gray-400 dark:text-[#00D69A]/60 font-normal">
              {(currentCompilation.durationMs / 1000).toFixed(1)}s
            </span>
          ) : null}
        </div>
      );

    case 'FAILED': {
      const isTimedOut = currentCompilation?.errorCode === 'TIMED_OUT';
      return (
        <div
          data-testid="status-chip-failed"
          onClick={onClickHistory}
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/50 cursor-pointer hover:bg-rose-100 dark:hover:bg-rose-950/80 transition-colors',
            className,
          )}
          title="Click to view compilation logs"
        >
          <AlertCircle className="h-3 w-3 text-rose-600 dark:text-rose-400" />
          <span>{isTimedOut ? 'Timed out' : 'Compile failed'}</span>
          {currentCompilation && currentCompilation.errorCount > 0 && (
            <span className="bg-rose-200 dark:bg-rose-900/80 text-rose-900 dark:text-rose-200 text-[10px] px-1 rounded font-bold">
              {currentCompilation.errorCount} {currentCompilation.errorCount === 1 ? 'err' : 'errs'}
            </span>
          )}
          {currentCompilation && currentCompilation.warningCount > 0 && (
            <span className="bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-[10px] px-1 rounded font-semibold">
              {currentCompilation.warningCount} w
            </span>
          )}
        </div>
      );
    }

    case 'CANCELLED':
      return (
        <div
          data-testid="status-chip-cancelled"
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-[#0A1310] text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-[#00D69A]/15',
            className,
          )}
        >
          <Ban className="h-3 w-3 text-gray-500 dark:text-gray-400" />
          <span>Cancelled</span>
        </div>
      );

    case 'IDLE':
    default:
      if (lastSuccessfulCompilation) {
        return (
          <div
            data-testid="status-chip-idle"
            onClick={onClickHistory}
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-50 dark:bg-[#0A1310] text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-[#00D69A]/20 cursor-pointer hover:bg-gray-100 dark:hover:bg-[#0C1814] transition-colors',
              className,
            )}
            title="Last successful compilation"
          >
            <CheckCircle2 className="h-3 w-3 text-emerald-500 dark:text-[#00D69A]" />
            <span>Ready ({lastSuccessfulCompilation.engine.toLowerCase()})</span>
            {lastSuccessfulCompilation.finishedAt && (
              <span className="text-gray-400 dark:text-gray-500 text-[11px]">
                {formatRelativeTime(lastSuccessfulCompilation.finishedAt)}
              </span>
            )}
          </div>
        );
      }

      return (
        <div
          data-testid="status-chip-not-compiled"
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-50 dark:bg-[#0A1310] text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-[#00D69A]/15',
            className,
          )}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-[#00D69A]/40" />
          <span>Not compiled</span>
        </div>
      );
  }
}
