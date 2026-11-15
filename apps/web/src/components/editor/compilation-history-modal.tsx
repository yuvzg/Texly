import React from 'react';
import {
  X,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  Download,
  Ban,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import type { CompilationDTO } from '@texly/shared';
import { Button } from '@/components/ui/button';

export interface CompilationHistoryModalProps {
  history: CompilationDTO[];
  isOpen: boolean;
  onClose: () => void;
  onViewLog: (compilationId: string) => void;
  onDownloadPdf: (compilationId: string) => void;
  onCancel: () => void;
  onRefresh: () => void;
  isCompiling: boolean;
}

function formatDuration(ms?: number | null): string {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatDate(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function CompilationHistoryModal({
  history,
  isOpen,
  onClose,
  onViewLog,
  onDownloadPdf,
  onCancel,
  onRefresh,
  isCompiling,
}: CompilationHistoryModalProps) {
  if (!isOpen) return null;

  return (
    <div
      data-testid="compilation-history-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="bg-white rounded-lg shadow-xl border border-gray-200 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-gray-500" />
            <h3 className="font-semibold text-gray-900 text-sm">Compilation History</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors cursor-pointer"
              title="Refresh history"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content Table */}
        <div className="flex-1 overflow-y-auto p-4">
          {history.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-xs">
              No recent compilations found for this project.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {history.map((comp) => {
                const isRunning = comp.status === 'RUNNING' || comp.status === 'QUEUED';
                const isSuccess = comp.status === 'SUCCEEDED';
                const isFailed = comp.status === 'FAILED';
                const isCancelled = comp.status === 'CANCELLED';

                return (
                  <div
                    key={comp.id}
                    data-testid={`history-item-${comp.id}`}
                    className="py-3 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div>
                        {isRunning && <Loader2 className="h-4 w-4 animate-spin text-blue-600" />}
                        {isSuccess && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                        {isFailed && <AlertCircle className="h-4 w-4 text-rose-600" />}
                        {isCancelled && <Ban className="h-4 w-4 text-gray-400" />}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-800 capitalize">
                            {comp.engine.toLowerCase()}
                          </span>
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
                            {comp.trigger}
                          </span>
                          {comp.cacheHit && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700">
                              CACHE
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-gray-400 flex items-center gap-2 mt-0.5">
                          <span>{formatDate(comp.queuedAt)}</span>
                          <span>•</span>
                          <span>{formatDuration(comp.durationMs)}</span>
                          {comp.errorCount > 0 && (
                            <>
                              <span>•</span>
                              <span className="text-rose-600 font-medium">
                                {comp.errorCount} errors
                              </span>
                            </>
                          )}
                          {comp.warningCount > 0 && (
                            <>
                              <span>•</span>
                              <span className="text-amber-600 font-medium">
                                {comp.warningCount} warnings
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isRunning && isCompiling && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={onCancel}
                          className="h-7 text-xs px-2"
                        >
                          <Ban className="h-3 w-3 mr-1" /> Cancel
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onViewLog(comp.id)}
                        className="h-7 text-xs px-2"
                        title="View log and diagnostics"
                      >
                        <FileText className="h-3 w-3 mr-1" /> Log
                      </Button>

                      {comp.hasPdf && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => onDownloadPdf(comp.id)}
                          className="h-7 text-xs px-2"
                          title="Download PDF"
                        >
                          <Download className="h-3 w-3 mr-1" /> PDF
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
