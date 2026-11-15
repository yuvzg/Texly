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
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200',
          className,
        )}
      >
        <Loader2 className="h-3 w-3 animate-spin text-amber-600" />
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
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200',
            className,
          )}
        >
          <Clock className="h-3 w-3 animate-pulse text-blue-600" />
          <span>Queued ({engine.toLowerCase()})</span>
        </div>
      );

    case 'RUNNING':
      return (
        <div
          data-testid="status-chip-running"
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200',
            className,
          )}
        >
          <Loader2 className="h-3 w-3 animate-spin text-indigo-600" />
          <span>Compiling... ({engine.toLowerCase()})</span>
        </div>
      );

    case 'SUCCEEDED':
      return (
        <div
          data-testid="status-chip-succeeded"
          onClick={onClickHistory}
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-pointer hover:bg-emerald-100 transition-colors',
            className,
          )}
          title="Click to view compilation history"
        >
          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
          <span>Succeeded</span>
          {currentCompilation && currentCompilation.warningCount > 0 && (
            <span className="bg-amber-100 text-amber-800 text-[10px] px-1 rounded font-semibold">
              {currentCompilation.warningCount}{' '}
              {currentCompilation.warningCount === 1 ? 'warn' : 'warns'}
            </span>
          )}
          {currentCompilation?.durationMs ? (
            <span className="text-gray-400 font-normal">
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
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200 cursor-pointer hover:bg-rose-100 transition-colors',
            className,
          )}
          title="Click to view compilation logs"
        >
          <AlertCircle className="h-3 w-3 text-rose-600" />
          <span>{isTimedOut ? 'Timed out' : 'Compile failed'}</span>
          {currentCompilation && currentCompilation.errorCount > 0 && (
            <span className="bg-rose-200 text-rose-900 text-[10px] px-1 rounded font-bold">
              {currentCompilation.errorCount} {currentCompilation.errorCount === 1 ? 'err' : 'errs'}
            </span>
          )}
          {currentCompilation && currentCompilation.warningCount > 0 && (
            <span className="bg-amber-100 text-amber-800 text-[10px] px-1 rounded font-semibold">
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
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200',
            className,
          )}
        >
          <Ban className="h-3 w-3 text-gray-500" />
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
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-50 text-gray-600 border border-gray-200 cursor-pointer hover:bg-gray-100',
              className,
            )}
            title="Last successful compilation"
          >
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            <span>Ready ({lastSuccessfulCompilation.engine.toLowerCase()})</span>
            {lastSuccessfulCompilation.finishedAt && (
              <span className="text-gray-400 text-[11px]">
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
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-50 text-gray-500 border border-gray-200',
            className,
          )}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
          <span>Not compiled</span>
        </div>
      );
  }
}
