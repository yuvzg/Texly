'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Loader2,
  Download,
  History,
  Ban,
  AlertTriangle,
  X,
  ChevronDown,
  RotateCcw,
  Check,
  AlertCircle,
  Terminal,
  Settings,
} from 'lucide-react';
import type {
  Engine,
  CompilationDTO,
  CompilationDiagnostic,
  CompilationLogDTO,
} from '@texly/shared';
import { Button } from '@/components/ui/button';
import { CompileStatusChip } from './compile-status-chip';
import { CompilationHistoryModal } from './compilation-history-modal';
import { CompilationLogModal } from './compilation-log-modal';
import { useCompilation } from '@/hooks/use-compilation';

export interface CompileToolbarProps {
  projectId: string;
  defaultEngine?: Engine;
  autoCompile?: boolean;
  onFlushSave?: () => Promise<boolean>;
  onCompileSuccess?: () => void;
  onCompilationChange?: (
    current: CompilationDTO | null,
    lastSuccess: CompilationDTO | null,
    isCompiling: boolean,
  ) => void;
  onDiagnosticsChange?: (
    diagnostics: CompilationDiagnostic[],
    log: CompilationLogDTO | null,
  ) => void;
  onOpenToolsTab?: (tab: 'problems' | 'log' | 'settings') => void;
  onChangeEngine?: (engine: Engine) => void;
  onToggleAutoCompile?: (enabled: boolean) => void;
  compileRef?: React.MutableRefObject<(() => Promise<void>) | null>;
  className?: string;
}

export function CompileToolbar({
  projectId,
  defaultEngine = 'PDFLATEX',
  autoCompile = false,
  onFlushSave,
  onCompileSuccess,
  onCompilationChange,
  onDiagnosticsChange,
  onOpenToolsTab,
  onChangeEngine,
  onToggleAutoCompile,
  compileRef,
  className,
}: CompileToolbarProps) {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const {
    currentCompilation,
    lastSuccessfulCompilation,
    history,
    isCompiling,
    isSaving,
    errorMessage,
    selectedLog,
    socketStatus,
    diagnostics,
    diagnosticCounts,
    compile,
    recompileFromScratch,
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
    if (compileRef) {
      compileRef.current = compile;
    }
  }, [compileRef, compile]);

  useEffect(() => {
    onCompilationChange?.(currentCompilation, lastSuccessfulCompilation, isCompiling);
  }, [currentCompilation, lastSuccessfulCompilation, isCompiling, onCompilationChange]);

  useEffect(() => {
    onDiagnosticsChange?.(diagnostics, selectedLog);
  }, [diagnostics, selectedLog, onDiagnosticsChange]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    if (isDropdownOpen) {
      window.addEventListener('mousedown', handleClickOutside);
      return () => window.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isDropdownOpen]);

  const isBusy = isCompiling || isSaving;
  const canCancel =
    isCompiling &&
    (currentCompilation?.status === 'QUEUED' || currentCompilation?.status === 'RUNNING');
  const hasPdfAvailable =
    lastSuccessfulCompilation?.hasPdf ||
    (currentCompilation?.status === 'SUCCEEDED' && currentCompilation.hasPdf);

  const currentActiveEngine = currentCompilation?.engine || defaultEngine;

  return (
    <div className={`flex flex-col gap-1 ${className ?? ''}`}>
      <div className="flex items-center gap-2">
        {/* Status Chip with live socket indicator */}
        <CompileStatusChip
          currentCompilation={currentCompilation}
          lastSuccessfulCompilation={lastSuccessfulCompilation}
          isCompiling={isCompiling}
          isSaving={isSaving}
          socketStatus={socketStatus}
          onClickHistory={() => {
            if (onOpenToolsTab) {
              onOpenToolsTab('problems');
            } else {
              setIsHistoryOpen(true);
            }
          }}
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

        {/* Split Compile Button with Dropdown Menu */}
        <div className="relative inline-flex items-center" ref={dropdownRef}>
          {/* Main Compile Action */}
          <Button
            size="sm"
            variant="default"
            onClick={() => compile()}
            disabled={isBusy}
            data-testid="compile-button"
            className="flex items-center gap-1.5 rounded-r-none pr-2 bg-[#00D69A] hover:bg-[#00BF89] text-[#050807] font-semibold shadow-[0_0_15px_rgba(0,214,154,0.25)] hover:shadow-[0_0_20px_rgba(0,214,154,0.35)] transition-all cursor-pointer"
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

          {/* Dropdown Toggle Chevron */}
          <Button
            size="sm"
            variant="default"
            onClick={() => setIsDropdownOpen((prev) => !prev)}
            disabled={isBusy}
            data-testid="compile-dropdown-trigger"
            className="rounded-l-none pl-1.5 pr-2 border-l border-[#00B582] bg-[#00D69A] hover:bg-[#00BF89] text-[#050807] transition-all cursor-pointer"
            title="More compilation options"
          >
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform duration-150 ${isDropdownOpen ? 'rotate-180' : ''}`}
            />
          </Button>

          {/* Compilation Controls Dropdown Menu */}
          {isDropdownOpen && (
            <div
              data-testid="compile-dropdown-menu"
              className="absolute right-0 top-full mt-1.5 w-60 rounded-lg bg-[#070D0A] border border-[#003D30] shadow-xl py-1.5 z-50 text-xs text-zinc-200 animate-in fade-in zoom-in-95 duration-100"
            >
              {/* Compile */}
              <button
                type="button"
                data-testid="menu-compile"
                onClick={() => {
                  setIsDropdownOpen(false);
                  void compile();
                }}
                className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[#003D30]/60 text-left transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Play className="h-3.5 w-3.5 text-[#00D69A]" />
                  <span>Compile</span>
                </span>
                <kbd className="text-[10px] text-zinc-400 font-mono">⌘↵</kbd>
              </button>

              {/* Recompile from scratch */}
              <button
                type="button"
                data-testid="menu-recompile-scratch"
                onClick={() => {
                  setIsDropdownOpen(false);
                  void recompileFromScratch();
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[#003D30]/60 text-left transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5 text-[#00D69A]" />
                <span>Recompile from scratch</span>
              </button>

              {/* Stop compilation if active */}
              {canCancel && (
                <button
                  type="button"
                  data-testid="menu-stop-compile"
                  onClick={() => {
                    setIsDropdownOpen(false);
                    void cancel();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-rose-950/40 text-rose-400 text-left transition-colors"
                >
                  <Ban className="h-3.5 w-3.5" />
                  <span>Stop compilation</span>
                </button>
              )}

              <div className="my-1 border-t border-[#003D30]/50" />

              {/* Auto-compile Toggle */}
              <label className="flex items-center justify-between px-3 py-1.5 hover:bg-[#003D30]/40 cursor-pointer select-none">
                <span className="text-zinc-300">Auto-compile on save</span>
                <input
                  type="checkbox"
                  data-testid="menu-auto-compile-checkbox"
                  checked={autoCompile}
                  onChange={(e) => {
                    onToggleAutoCompile?.(e.target.checked);
                  }}
                  className="h-3.5 w-3.5 rounded bg-zinc-900 border-[#003D30] text-[#00D69A] accent-[#00D69A]"
                />
              </label>

              {/* Engine Submenu / Select */}
              <div className="px-3 py-1 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                LaTeX Engine
              </div>
              {(['PDFLATEX', 'XELATEX', 'LUALATEX'] as Engine[]).map((eng) => (
                <button
                  key={eng}
                  type="button"
                  data-testid={`menu-engine-${eng.toLowerCase()}`}
                  onClick={() => {
                    onChangeEngine?.(eng);
                    setIsDropdownOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-3 py-1 hover:bg-[#003D30]/60 text-left transition-colors"
                >
                  <span
                    className={
                      eng === currentActiveEngine ? 'text-[#00D69A] font-medium' : 'text-zinc-300'
                    }
                  >
                    {eng === 'PDFLATEX' ? 'pdfLaTeX' : eng === 'XELATEX' ? 'XeLaTeX' : 'LuaLaTeX'}
                  </span>
                  {eng === currentActiveEngine && <Check className="h-3.5 w-3.5 text-[#00D69A]" />}
                </button>
              ))}

              <div className="my-1 border-t border-[#003D30]/50" />

              {/* Tools Panel Tabs */}
              {onOpenToolsTab && (
                <>
                  <button
                    type="button"
                    data-testid="menu-open-problems"
                    onClick={() => {
                      setIsDropdownOpen(false);
                      onOpenToolsTab('problems');
                    }}
                    className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[#003D30]/60 text-left transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <AlertCircle className="h-3.5 w-3.5 text-zinc-400" />
                      <span>Problems</span>
                    </span>
                    {(diagnosticCounts.errors > 0 || diagnosticCounts.warnings > 0) && (
                      <span className="text-[10px] px-1 rounded bg-zinc-800 text-zinc-300 font-mono">
                        {diagnosticCounts.errors}e {diagnosticCounts.warnings}w
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    data-testid="menu-open-log"
                    onClick={() => {
                      setIsDropdownOpen(false);
                      onOpenToolsTab('log');
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[#003D30]/60 text-left transition-colors"
                  >
                    <Terminal className="h-3.5 w-3.5 text-zinc-400" />
                    <span>Compile Log</span>
                  </button>

                  <button
                    type="button"
                    data-testid="menu-open-settings"
                    onClick={() => {
                      setIsDropdownOpen(false);
                      onOpenToolsTab('settings');
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[#003D30]/60 text-left transition-colors"
                  >
                    <Settings className="h-3.5 w-3.5 text-zinc-400" />
                    <span>Compile Settings</span>
                  </button>
                </>
              )}

              <button
                type="button"
                data-testid="menu-open-history"
                onClick={() => {
                  setIsDropdownOpen(false);
                  void refreshHistory();
                  setIsHistoryOpen(true);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[#003D30]/60 text-left transition-colors"
              >
                <History className="h-3.5 w-3.5 text-zinc-400" />
                <span>Compilation History</span>
              </button>
            </div>
          )}
        </div>
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
          setIsLogModalOpen(true);
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
      <CompilationLogModal
        log={selectedLog}
        isOpen={isLogModalOpen && selectedLog !== null}
        onClose={() => {
          setIsLogModalOpen(false);
          closeLog();
        }}
      />
    </div>
  );
}
