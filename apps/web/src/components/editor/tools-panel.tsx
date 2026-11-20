'use client';

import React, { useState, useMemo } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle2,
  FileCode,
  Terminal,
  Settings,
  ChevronUp,
  ChevronDown,
  Search,
  Copy,
  Check,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import type { CompilationDiagnostic, CompilationLogDTO, Engine, BibTool } from '@texly/shared';
import { Button } from '@/components/ui/button';

export type ToolsPanelTab = 'problems' | 'log' | 'settings';

export interface ToolsPanelProps {
  isOpen: boolean;
  onToggleOpen: () => void;
  activeTab: ToolsPanelTab;
  onSelectTab: (tab: ToolsPanelTab) => void;
  diagnostics?: CompilationDiagnostic[];
  logData?: CompilationLogDTO | null;
  isLoadingLog?: boolean;
  onNavigateToLine?: (line: number, file?: string) => void;
  // Settings
  currentEngine?: Engine;
  currentBibTool?: BibTool;
  autoCompileEnabled?: boolean;
  mainFileName?: string;
  onUpdateSettings?: (settings: {
    engine?: Engine;
    bibTool?: BibTool;
    autoCompile?: boolean;
  }) => Promise<void>;
  className?: string;
}

export function ToolsPanel({
  isOpen,
  onToggleOpen,
  activeTab,
  onSelectTab,
  diagnostics = [],
  logData,
  isLoadingLog = false,
  onNavigateToLine,
  currentEngine = 'PDFLATEX',
  currentBibTool = 'AUTO',
  autoCompileEnabled = false,
  mainFileName = 'main.tex',
  onUpdateSettings,
  className,
}: ToolsPanelProps) {
  // Problems tab filter: 'all' | 'errors' | 'warnings'
  const [problemFilter, setProblemFilter] = useState<'all' | 'errors' | 'warnings'>('all');

  // Log tab filter & state
  const [logSearch, setLogSearch] = useState('');
  const [showRawLog, setShowRawLog] = useState(false);
  const [copiedLog, setCopiedLog] = useState(false);

  // Settings tab local state
  const [selectedEngine, setSelectedEngine] = useState<Engine>(currentEngine);
  const [selectedBibTool, setSelectedBibTool] = useState<BibTool>(currentBibTool);
  const [autoCompile, setAutoCompile] = useState<boolean>(autoCompileEnabled);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsSavedMessage, setSettingsSavedMessage] = useState(false);

  // Sync props to local settings when props change
  React.useEffect(() => {
    setSelectedEngine(currentEngine);
  }, [currentEngine]);

  React.useEffect(() => {
    setSelectedBibTool(currentBibTool);
  }, [currentBibTool]);

  React.useEffect(() => {
    setAutoCompile(autoCompileEnabled);
  }, [autoCompileEnabled]);

  const errorCount = useMemo(
    () => diagnostics.filter((d) => d.level === 'error').length,
    [diagnostics],
  );
  const warningCount = useMemo(
    () => diagnostics.filter((d) => d.level === 'warning').length,
    [diagnostics],
  );

  const filteredDiagnostics = useMemo(() => {
    if (problemFilter === 'errors') {
      return diagnostics.filter((d) => d.level === 'error');
    }
    if (problemFilter === 'warnings') {
      return diagnostics.filter((d) => d.level === 'warning');
    }
    return diagnostics;
  }, [diagnostics, problemFilter]);

  // Handle settings save
  const handleSaveSettings = async () => {
    if (!onUpdateSettings) return;
    setIsSavingSettings(true);
    try {
      await onUpdateSettings({
        engine: selectedEngine,
        bibTool: selectedBibTool,
        autoCompile,
      });
      setSettingsSavedMessage(true);
      setTimeout(() => setSettingsSavedMessage(false), 2500);
    } catch {
      // Error handled by caller
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Copy compile log to clipboard
  const handleCopyLog = () => {
    if (!diagnostics.length && !logData) return;
    const text = diagnostics
      .map(
        (d) =>
          `[${d.level}] ${d.file}:${d.line} - ${d.message}${d.context ? `\n${d.context}` : ''}`,
      )
      .join('\n');
    void navigator.clipboard.writeText(text);
    setCopiedLog(true);
    setTimeout(() => setCopiedLog(false), 2000);
  };

  return (
    <div
      data-testid="tools-panel"
      className={`border-t border-[#003D30]/60 bg-[#050807] flex flex-col transition-all duration-200 z-10 ${
        isOpen ? 'h-64' : 'h-10'
      } ${className ?? ''}`}
    >
      {/* Tab Navigation Header */}
      <div className="h-10 px-3 bg-[#0A120E] border-b border-[#003D30]/40 flex items-center justify-between select-none">
        <div className="flex items-center gap-1">
          {/* Problems Tab */}
          <button
            type="button"
            data-testid="tab-problems"
            onClick={() => {
              if (!isOpen) onToggleOpen();
              onSelectTab('problems');
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              activeTab === 'problems' && isOpen
                ? 'bg-[#003D30] text-[#00D69A]'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            <AlertCircle className="h-3.5 w-3.5" />
            <span>Problems</span>
            {(errorCount > 0 || warningCount > 0) && (
              <span className="flex items-center gap-1 ml-1">
                {errorCount > 0 && (
                  <span className="bg-rose-950/80 text-rose-400 text-[10px] px-1.5 py-0.2 rounded font-semibold border border-rose-800/40">
                    {errorCount}
                  </span>
                )}
                {warningCount > 0 && (
                  <span className="bg-amber-950/80 text-amber-400 text-[10px] px-1.5 py-0.2 rounded font-semibold border border-amber-800/40">
                    {warningCount}
                  </span>
                )}
              </span>
            )}
          </button>

          {/* Compile Log Tab */}
          <button
            type="button"
            data-testid="tab-log"
            onClick={() => {
              if (!isOpen) onToggleOpen();
              onSelectTab('log');
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              activeTab === 'log' && isOpen
                ? 'bg-[#003D30] text-[#00D69A]'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            <Terminal className="h-3.5 w-3.5" />
            <span>Compile Log</span>
          </button>

          {/* Settings Tab */}
          <button
            type="button"
            data-testid="tab-settings"
            onClick={() => {
              if (!isOpen) onToggleOpen();
              onSelectTab('settings');
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              activeTab === 'settings' && isOpen
                ? 'bg-[#003D30] text-[#00D69A]'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            <Settings className="h-3.5 w-3.5" />
            <span>Compile Settings</span>
          </button>
        </div>

        {/* Panel Collapse / Expand Button */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={onToggleOpen}
            data-testid="toggle-tools-panel-btn"
            className="h-7 w-7 p-0 text-zinc-400 hover:text-[#00D69A] hover:bg-[#003D30]/40"
            title={isOpen ? 'Collapse panel' : 'Expand panel'}
          >
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Panel Body (Visible when open) */}
      {isOpen && (
        <div className="flex-1 overflow-hidden p-0 relative bg-[#050807]">
          {/* PROBLEMS TAB CONTENT */}
          {activeTab === 'problems' && (
            <div className="h-full flex flex-col">
              {/* Filter Sub-header */}
              <div className="px-3 py-1.5 bg-[#070D0A] border-b border-[#003D30]/30 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-zinc-400 font-medium">Filter:</span>
                  <button
                    type="button"
                    onClick={() => setProblemFilter('all')}
                    className={`px-2 py-0.5 rounded transition-colors ${
                      problemFilter === 'all'
                        ? 'bg-[#003D30] text-[#00D69A] font-medium'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    All ({diagnostics.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setProblemFilter('errors')}
                    className={`px-2 py-0.5 rounded transition-colors ${
                      problemFilter === 'errors'
                        ? 'bg-rose-950/60 text-rose-400 font-medium border border-rose-800/40'
                        : 'text-zinc-400 hover:text-rose-300'
                    }`}
                  >
                    Errors ({errorCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setProblemFilter('warnings')}
                    className={`px-2 py-0.5 rounded transition-colors ${
                      problemFilter === 'warnings'
                        ? 'bg-amber-950/60 text-amber-400 font-medium border border-amber-800/40'
                        : 'text-zinc-400 hover:text-amber-300'
                    }`}
                  >
                    Warnings ({warningCount})
                  </button>
                </div>
                <div className="text-[11px] text-zinc-500">
                  Tip: Press{' '}
                  <kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono">F8</kbd>{' '}
                  to cycle through problems
                </div>
              </div>

              {/* Problems List */}
              <div className="flex-1 overflow-y-auto divide-y divide-zinc-900/60 font-mono text-xs">
                {filteredDiagnostics.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center p-6 text-center text-zinc-500">
                    <CheckCircle2 className="h-8 w-8 text-[#00D69A]/80 mb-2" />
                    <p className="text-sm font-sans font-medium text-zinc-300">
                      No problems detected
                    </p>
                    <p className="text-xs font-sans text-zinc-500 mt-1">
                      Your document compiled cleanly with zero{' '}
                      {problemFilter !== 'all' ? problemFilter : 'errors'}.
                    </p>
                  </div>
                ) : (
                  filteredDiagnostics.map((diag, idx) => (
                    <div
                      key={idx}
                      data-testid={`problem-item-${idx}`}
                      onClick={() => onNavigateToLine?.(diag.line, diag.file)}
                      className="px-4 py-2 hover:bg-[#003D30]/20 cursor-pointer flex items-start gap-2.5 transition-colors group"
                    >
                      {diag.level === 'error' ? (
                        <AlertCircle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                      ) : diag.level === 'warning' ? (
                        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                      ) : (
                        <Info className="h-4 w-4 text-sky-400 shrink-0 mt-0.5" />
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-200 font-sans font-medium text-xs">
                            {diag.message}
                          </span>
                          <span className="text-[#00D69A] text-[11px] px-1.5 py-0.2 rounded bg-[#003D30]/40 border border-[#00D69A]/20">
                            {diag.file}:{diag.line}
                          </span>
                        </div>
                        {diag.context && (
                          <div className="mt-1 text-[11px] text-zinc-400 bg-zinc-950/60 p-1.5 rounded border border-zinc-900 overflow-x-auto whitespace-pre">
                            {diag.context}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* COMPILE LOG TAB CONTENT */}
          {activeTab === 'log' && (
            <div className="h-full flex flex-col font-mono text-xs">
              {/* Log Toolbar */}
              <div className="px-3 py-1.5 bg-[#070D0A] border-b border-[#003D30]/30 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="relative w-48">
                    <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-zinc-500" />
                    <input
                      type="text"
                      placeholder="Search log..."
                      value={logSearch}
                      onChange={(e) => setLogSearch(e.target.value)}
                      className="w-full pl-7 pr-2 py-1 text-xs rounded bg-zinc-950 border border-zinc-800 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-[#00D69A]/60"
                    />
                  </div>
                  {logData?.truncated && (
                    <span className="text-amber-400 text-[11px] bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/40">
                      Truncated to last 200 lines
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {logData?.rawLogUrl && (
                    <a
                      href={logData.rawLogUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-zinc-400 hover:text-[#00D69A] hover:bg-[#003D30]/40 transition-colors text-xs font-sans"
                    >
                      <span>Raw Log</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}

                  <button
                    type="button"
                    onClick={handleCopyLog}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800/60 hover:bg-[#003D30]/60 text-zinc-300 hover:text-[#00D69A] border border-zinc-700/40 transition-colors text-xs font-sans"
                  >
                    {copiedLog ? (
                      <Check className="h-3 w-3 text-[#00D69A]" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    <span>{copiedLog ? 'Copied' : 'Copy Log'}</span>
                  </button>
                </div>
              </div>

              {/* Log View Body */}
              <div className="flex-1 overflow-y-auto p-3 bg-[#030605] text-zinc-300 space-y-1">
                {isLoadingLog ? (
                  <div className="h-full flex items-center justify-center text-zinc-500">
                    <Loader2 className="h-5 w-5 animate-spin mr-2 text-[#00D69A]" />
                    <span>Loading compilation log...</span>
                  </div>
                ) : diagnostics.length === 0 ? (
                  <div className="text-zinc-500 italic p-4 text-center">
                    No compilation log available. Run a compilation to view output.
                  </div>
                ) : (
                  diagnostics
                    .filter(
                      (d) =>
                        !logSearch ||
                        d.message.toLowerCase().includes(logSearch.toLowerCase()) ||
                        (d.context && d.context.toLowerCase().includes(logSearch.toLowerCase())),
                    )
                    .map((d, i) => (
                      <div
                        key={i}
                        className={`py-0.5 ${
                          d.level === 'error'
                            ? 'text-rose-400 font-semibold'
                            : d.level === 'warning'
                              ? 'text-amber-300'
                              : 'text-zinc-400'
                        }`}
                      >
                        <span className="text-zinc-600 select-none mr-2">
                          [{d.file}:{d.line}]
                        </span>
                        <span>{d.message}</span>
                        {d.context && (
                          <div className="pl-6 text-zinc-500 text-[11px]">{d.context}</div>
                        )}
                      </div>
                    ))
                )}
              </div>
            </div>
          )}

          {/* SETTINGS TAB CONTENT */}
          {activeTab === 'settings' && (
            <div className="h-full overflow-y-auto p-4 bg-[#050807] text-zinc-200">
              <div className="max-w-2xl space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* LaTeX Engine */}
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                      LaTeX Engine
                    </label>
                    <select
                      value={selectedEngine}
                      onChange={(e) => setSelectedEngine(e.target.value as Engine)}
                      data-testid="engine-select"
                      className="w-full px-3 py-1.5 text-xs rounded bg-zinc-950 border border-[#003D30] text-zinc-200 focus:outline-none focus:border-[#00D69A]"
                    >
                      <option value="PDFLATEX">pdfLaTeX (Default, fast)</option>
                      <option value="XELATEX">XeLaTeX (Modern fonts, Unicode)</option>
                      <option value="LUALATEX">LuaLaTeX (Lua scripting, advanced)</option>
                    </select>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      Select the TeX engine for compiling documents in this project.
                    </p>
                  </div>

                  {/* Bibliography Tool */}
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                      Bibliography Tool
                    </label>
                    <select
                      value={selectedBibTool}
                      onChange={(e) => setSelectedBibTool(e.target.value as BibTool)}
                      data-testid="bibtool-select"
                      className="w-full px-3 py-1.5 text-xs rounded bg-zinc-950 border border-[#003D30] text-zinc-200 focus:outline-none focus:border-[#00D69A]"
                    >
                      <option value="AUTO">Auto Detect</option>
                      <option value="BIBTEX">BibTeX</option>
                      <option value="BIBER">Biber (BibLaTeX)</option>
                      <option value="NONE">None</option>
                    </select>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      Tool used to process references and citations.
                    </p>
                  </div>
                </div>

                <div className="pt-2 border-t border-zinc-900 flex items-center justify-between">
                  {/* Auto-compile Toggle */}
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="auto-compile-toggle"
                      data-testid="auto-compile-toggle"
                      checked={autoCompile}
                      onChange={(e) => setAutoCompile(e.target.checked)}
                      className="h-4 w-4 rounded bg-zinc-900 border-[#003D30] text-[#00D69A] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#00D69A]"
                    />
                    <label
                      htmlFor="auto-compile-toggle"
                      className="text-xs text-zinc-300 cursor-pointer select-none"
                    >
                      <span className="font-medium text-zinc-200 block">
                        Auto-compile on document save
                      </span>
                      <span className="text-[11px] text-zinc-500 block">
                        Automatically compiles changes 2.5s after autosave finishes.
                      </span>
                    </label>
                  </div>

                  {/* Save Button */}
                  <div className="flex items-center gap-3">
                    {settingsSavedMessage && (
                      <span className="text-xs text-[#00D69A] flex items-center gap-1">
                        <Check className="h-3.5 w-3.5" />
                        Settings saved
                      </span>
                    )}
                    <Button
                      size="sm"
                      onClick={handleSaveSettings}
                      disabled={isSavingSettings}
                      data-testid="save-compile-settings-btn"
                      className="bg-[#00D69A] text-[#050807] hover:bg-[#00D69A]/90 font-medium text-xs px-4"
                    >
                      {isSavingSettings ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                          Saving...
                        </>
                      ) : (
                        'Save Settings'
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
