import React, { useState } from 'react';
import { X, AlertTriangle, AlertCircle, FileText, Download } from 'lucide-react';
import type { CompilationLogDTO } from '@texly/shared';
import { Button } from '@/components/ui/button';

export interface CompilationLogModalProps {
  log: CompilationLogDTO | null;
  isOpen: boolean;
  onClose: () => void;
}

export function CompilationLogModal({ log, isOpen, onClose }: CompilationLogModalProps) {
  const [activeTab, setActiveTab] = useState<'diagnostics' | 'raw'>('diagnostics');

  if (!isOpen || !log) return null;

  return (
    <div
      data-testid="compilation-log-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4"
    >
      <div className="bg-white dark:bg-[#0A1310] rounded-2xl shadow-2xl border border-gray-200 dark:border-[#00D69A]/20 w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-[#00D69A]/15 bg-gray-50 dark:bg-[#003D30]/30">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
              Compilation Diagnostics
            </h3>
            <div className="flex items-center gap-2 text-xs">
              <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 font-medium border border-rose-300/30">
                <AlertCircle className="h-3 w-3" /> {log.counts.errors} Errors
              </span>
              <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-medium border border-amber-300/30">
                <AlertTriangle className="h-3 w-3" /> {log.counts.warnings} Warnings
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-[#00D69A] hover:bg-gray-200 dark:hover:bg-[#003D30]/60 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab buttons */}
        <div className="flex border-b border-gray-200 dark:border-[#00D69A]/15 px-5 pt-2 bg-white dark:bg-[#0A1310] gap-4 text-xs font-medium">
          <button
            onClick={() => setActiveTab('diagnostics')}
            className={`pb-2 border-b-2 cursor-pointer transition-colors ${
              activeTab === 'diagnostics'
                ? 'border-[#00D69A] text-[#00D69A] font-semibold'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            Diagnostics ({log.diagnostics.length})
          </button>
          {log.rawLogUrl && (
            <button
              onClick={() => setActiveTab('raw')}
              className={`pb-2 border-b-2 cursor-pointer transition-colors ${
                activeTab === 'raw'
                  ? 'border-[#00D69A] text-[#00D69A] font-semibold'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              Raw Log Link
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 p-4 overflow-y-auto font-sans text-xs">
          {activeTab === 'diagnostics' && (
            <div className="space-y-2">
              {log.diagnostics.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <FileText className="h-8 w-8 mx-auto mb-2 text-gray-400 dark:text-gray-600" />
                  <p>No diagnostics recorded for this compilation.</p>
                </div>
              ) : (
                log.diagnostics.map((diag, index) => {
                  const isErr = diag.level === 'error';
                  return (
                    <div
                      key={index}
                      className={`p-3 rounded-lg border text-xs leading-relaxed ${
                        isErr
                          ? 'bg-rose-50/50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/40 text-rose-950 dark:text-rose-200'
                          : 'bg-amber-50/50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/40 text-amber-950 dark:text-amber-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono font-semibold text-[11px] text-gray-700 dark:text-gray-300">
                          {diag.file}:{diag.line}
                        </span>
                        <span
                          className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                            isErr
                              ? 'bg-rose-200 dark:bg-rose-900/70 text-rose-900 dark:text-rose-200'
                              : 'bg-amber-200 dark:bg-amber-900/70 text-amber-900 dark:text-amber-200'
                          }`}
                        >
                          {diag.level}
                        </span>
                      </div>
                      <p className="font-mono text-xs">{diag.message}</p>
                      {diag.context && (
                        <pre className="mt-1.5 p-1.5 bg-white/70 dark:bg-[#050807] rounded text-[11px] text-gray-600 dark:text-gray-400 overflow-x-auto border border-gray-100 dark:border-[#00D69A]/10">
                          {diag.context}
                        </pre>
                      )}
                    </div>
                  );
                })
              )}
              {log.truncated && (
                <p className="text-gray-500 dark:text-gray-400 italic text-center py-2">
                  Showing first 200 diagnostics. Access the raw log for the complete output.
                </p>
              )}
            </div>
          )}

          {activeTab === 'raw' && log.rawLogUrl && (
            <div className="p-6 text-center space-y-4">
              <p className="text-gray-600 dark:text-gray-300">
                The full LaTeX engine stdout and stderr log is available for download or viewing.
              </p>
              <a
                href={log.rawLogUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#00D69A] text-[#050807] rounded-lg font-semibold hover:bg-[#00BF89] transition-all shadow-[0_0_15px_rgba(0,214,154,0.2)]"
              >
                <Download className="h-4 w-4" /> Download Raw Log
              </a>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-200 dark:border-[#00D69A]/15 bg-gray-50 dark:bg-[#003D30]/20 flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
