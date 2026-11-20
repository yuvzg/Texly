'use client';

import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Sparkles,
  Files,
  ArrowLeft,
  FileText,
  Loader2,
  PanelLeft,
  PanelLeftClose,
  PanelRight,
  PanelRightClose,
  Code2,
  ChevronRight,
} from 'lucide-react';
import type { ImperativePanelHandle } from 'react-resizable-panels';
import { Button } from '@/components/ui/button';
import { ProtectedRoute } from '@/components/auth/route-guards';
import { CompileToolbar } from '@/components/editor/compile-toolbar';
import { SaveStatusIndicator } from '@/components/editor/save-status-indicator';
import { PdfViewer } from '@/components/pdf/pdf-viewer';
import {
  CodeMirrorEditor,
  type CodeMirrorEditorHandle,
} from '@/components/editor/codemirror-editor';
import { ToolsPanel, type ToolsPanelTab } from '@/components/editor/tools-panel';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { ThemeToggle } from '@/providers/theme-provider';
import { useDocumentAutosave } from '@/hooks/use-document-autosave';
import { useAutoCompile } from '@/hooks/use-auto-compile';
import { FileExplorer } from '@/components/editor/file-explorer/file-explorer';
import { DocumentTabs } from '@/components/editor/document-tabs';
import { useEditorStore } from '@/stores/editor.store';
import { useProjectFiles, useSetMainFile } from '@/hooks/use-files';
import { fetchProject, updateProject } from '@/lib/projects';
import { fetchCompilationPdf } from '@/lib/compilations';
import type {
  ProjectDTO,
  CompilationDTO,
  CompilationDiagnostic,
  CompilationLogDTO,
  Engine,
  BibTool,
} from '@texly/shared';

const DEFAULT_DEMO_PROJECT_ID = '01931a00-0000-7000-8000-000000000003';

function WorkspaceContent() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId') || DEFAULT_DEMO_PROJECT_ID;
  const [project, setProject] = useState<ProjectDTO | null>(null);

  // Resizable panel handles
  const sidebarRef = useRef<ImperativePanelHandle>(null);
  const pdfRef = useRef<ImperativePanelHandle>(null);
  const editorHandleRef = useRef<CodeMirrorEditorHandle>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isPdfCollapsed, setIsPdfCollapsed] = useState(false);

  // Compilation & PDF Preview state
  const compileRef = useRef<(() => Promise<void>) | null>(null);
  const [currentCompilation, setCurrentCompilation] = useState<CompilationDTO | null>(null);
  const [lastSuccessCompilation, setLastSuccessCompilation] = useState<CompilationDTO | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);

  // Diagnostics and Tools Panel state
  const [diagnostics, setDiagnostics] = useState<CompilationDiagnostic[]>([]);
  const [selectedLog, setSelectedLog] = useState<CompilationLogDTO | null>(null);
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const [toolsActiveTab, setToolsActiveTab] = useState<ToolsPanelTab>('problems');

  // Mobile layout tab
  const [mobileTab, setMobileTab] = useState<'files' | 'editor' | 'pdf'>('editor');

  // Document Tabs & Editor State
  const tabs = useEditorStore((state) => state.tabs);
  const activeFileId = useEditorStore((state) => state.activeFileId);
  const openTab = useEditorStore((state) => state.openTab);
  const setTabDirty = useEditorStore((state) => state.setTabDirty);
  const saveViewState = useEditorStore((state) => state.saveViewState);
  const cachedStates = useEditorStore((state) => state.cachedStates);

  const { data: filesData } = useProjectFiles(projectId);
  const setMainFileMutation = useSetMainFile(projectId);

  const activeTab = tabs.find((t) => t.fileId === activeFileId);
  const activeDocumentId = activeTab?.documentId;

  // Auto-open main document or first file if tabs are empty
  useEffect(() => {
    if (!filesData?.files || filesData.files.length === 0) return;
    if (tabs.length === 0) {
      const mainFile = filesData.mainFileId
        ? filesData.files.find((f) => f.id === filesData.mainFileId)
        : null;
      const target =
        mainFile ||
        filesData.files.find((f) => f.nodeType === 'FILE' && f.kind === 'TEXT') ||
        filesData.files[0];
      if (target) {
        openTab({
          fileId: target.id,
          documentId: target.documentId,
          path: target.path,
          name: target.name,
        });
      }
    }
  }, [filesData, tabs.length, openTab]);

  // Fetch project settings on mount
  useEffect(() => {
    let isMounted = true;
    if (projectId) {
      fetchProject(projectId)
        .then((p) => {
          if (isMounted) setProject(p);
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [projectId]);

  // Document autosave
  const {
    document,
    content,
    setContent,
    status,
    errorMessage,
    lastSavedAt,
    isLoading,
    flushSave,
    reloadDocument,
  } = useDocumentAutosave({
    projectId,
    documentId: activeDocumentId,
    debounceMs: 1000,
  });

  // Synchronize dirty tab status with autosave state
  useEffect(() => {
    if (activeFileId) {
      if (status === 'unsaved') {
        setTabDirty(activeFileId, true, content);
      } else if (status === 'saved') {
        setTabDirty(activeFileId, false);
      }
    }
  }, [activeFileId, status, content, setTabDirty]);

  const handleSetMainFile = async (fileId: string) => {
    await setMainFileMutation.mutateAsync(fileId);
  };

  // Auto-compile integration (2.5s debounce after successful save)
  useAutoCompile({
    enabled: project?.autoCompile ?? false,
    saveStatus: status,
    lastSavedAt,
    isCompiling,
    compile: async () => {
      if (compileRef.current) {
        await compileRef.current();
      }
    },
    debounceMs: 2500,
  });

  const handleCompilationChange = useCallback(
    (current: CompilationDTO | null, lastSuccess: CompilationDTO | null, compiling: boolean) => {
      setCurrentCompilation(current);
      setLastSuccessCompilation(lastSuccess);
      setIsCompiling(compiling);
    },
    [],
  );

  const handleDiagnosticsChange = useCallback(
    (diags: CompilationDiagnostic[], log: CompilationLogDTO | null) => {
      setDiagnostics(diags);
      setSelectedLog(log);
      // Auto open problems tab if errors exist
      if (diags.some((d) => d.level === 'error')) {
        setIsToolsOpen(true);
        setToolsActiveTab('problems');
      }
    },
    [],
  );

  // Automatically fetch PDF presigned URL on successful compilation
  const targetCompilationId =
    (currentCompilation?.status === 'SUCCEEDED' && currentCompilation.hasPdf
      ? currentCompilation.id
      : null) ?? (lastSuccessCompilation?.hasPdf ? lastSuccessCompilation.id : null);

  useEffect(() => {
    let isMounted = true;
    if (targetCompilationId) {
      setIsLoadingPdf(true);
      fetchCompilationPdf(targetCompilationId, false)
        .then((res) => {
          if (isMounted) {
            setPdfUrl(res.url);
            if (res.pageCount) setPageCount(res.pageCount);
          }
        })
        .catch(() => {
          if (isMounted) {
            setPdfUrl(null);
          }
        })
        .finally(() => {
          if (isMounted) {
            setIsLoadingPdf(false);
          }
        });
    } else {
      setPdfUrl(null);
      setPageCount(null);
    }
    return () => {
      isMounted = false;
    };
  }, [targetCompilationId]);

  // Keyboard shortcuts for panel collapse/expand
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        const panel = sidebarRef.current;
        if (panel) {
          if (panel.isCollapsed()) {
            panel.expand();
            setIsSidebarCollapsed(false);
          } else {
            panel.collapse();
            setIsSidebarCollapsed(true);
          }
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.altKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        const panel = pdfRef.current;
        if (panel) {
          if (panel.isCollapsed()) {
            panel.expand();
            setIsPdfCollapsed(false);
          } else {
            panel.collapse();
            setIsPdfCollapsed(true);
          }
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const toggleSidebar = () => {
    const panel = sidebarRef.current;
    if (panel) {
      if (panel.isCollapsed()) {
        panel.expand();
        setIsSidebarCollapsed(false);
      } else {
        panel.collapse();
        setIsSidebarCollapsed(true);
      }
    }
  };

  const togglePdf = () => {
    const panel = pdfRef.current;
    if (panel) {
      if (panel.isCollapsed()) {
        panel.expand();
        setIsPdfCollapsed(false);
      } else {
        panel.collapse();
        setIsPdfCollapsed(true);
      }
    }
  };

  // Update Project Settings handler
  const handleUpdateSettings = async (settings: {
    engine?: Engine;
    bibTool?: BibTool;
    autoCompile?: boolean;
  }) => {
    if (!projectId) return;
    try {
      const updated = await updateProject(projectId, settings);
      setProject(updated);
    } catch {
      // Background failure
    }
  };

  // Jump to problem line in editor
  const handleNavigateToProblem = (line: number) => {
    if (editorHandleRef.current) {
      editorHandleRef.current.goToLine(line);
    }
  };

  // Reusable File Sidebar Component
  const renderSidebarContent = () => (
    <FileExplorer projectId={projectId} className="h-full" />
  );

  // Reusable Editor Content Component (with CodeMirror 6 and Tools Panel)
  const renderEditorContent = () => (
    <div className="flex flex-col h-full bg-[#050807] overflow-hidden">
      {/* Document Tabs */}
      <DocumentTabs
        mainFileId={project?.mainFileId ?? filesData?.mainFileId}
        onSetMainFile={handleSetMainFile}
      />

      {/* Editor Subheader */}
      <div className="h-9 border-b border-[#003D30]/30 px-4 flex items-center justify-between text-xs text-zinc-400 bg-[#0A120E] shrink-0">
        <div className="flex items-center gap-2">
          <Code2 className="h-3.5 w-3.5 text-[#00D69A]" />
          <span className="font-medium text-zinc-200">
            {activeTab?.path || document?.path || 'main.tex'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <SaveStatusIndicator
            status={status}
            errorMessage={errorMessage}
            lastSavedAt={lastSavedAt}
            onRetry={() => {
              void flushSave();
            }}
          />
          <span className="text-[11px] text-zinc-500">
            {document ? `Rev ${document.revision} • LaTeX • UTF-8` : 'LaTeX • UTF-8'}
          </span>
        </div>
      </div>

      {/* CodeMirror 6 LaTeX Editor */}
      <div className="flex-1 overflow-hidden relative bg-[#050807]">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-[#050807]/80 z-20">
            <Loader2 className="h-6 w-6 animate-spin text-[#00D69A]" />
          </div>
        ) : (
          <CodeMirrorEditor
            ref={editorHandleRef}
            value={content}
            onChange={setContent}
            diagnostics={diagnostics}
            onCompile={() => {
              void compileRef.current?.();
            }}
            className="w-full h-full"
          />
        )}
      </div>

      {/* Docked Tools Panel */}
      <ToolsPanel
        isOpen={isToolsOpen}
        onToggleOpen={() => setIsToolsOpen((prev) => !prev)}
        activeTab={toolsActiveTab}
        onSelectTab={setToolsActiveTab}
        diagnostics={diagnostics}
        logData={selectedLog}
        onNavigateToLine={handleNavigateToProblem}
        currentEngine={project?.engine || 'PDFLATEX'}
        currentBibTool={project?.bibTool || 'AUTO'}
        autoCompileEnabled={project?.autoCompile ?? false}
        mainFileName={document?.path || 'main.tex'}
        onUpdateSettings={handleUpdateSettings}
      />
    </div>
  );

  // Reusable PDF Preview Component
  const renderPdfContent = () => (
    <div className="flex-1 flex flex-col h-full bg-[#050807] overflow-hidden">
      <PdfViewer
        pdfUrl={pdfUrl}
        compilation={currentCompilation ?? lastSuccessCompilation}
        isCompiling={isCompiling}
        projectName={project?.name || 'document'}
        onCompile={() => {
          void compileRef.current?.();
        }}
        className="flex-1"
      />
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-gray-100 dark:bg-[#050807] overflow-hidden">
      {/* Top Navigation Bar */}
      <header className="h-14 bg-white dark:bg-[#050807] border-b border-gray-200 dark:border-[#00D69A]/15 px-3 sm:px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/dashboard"
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-[#00D69A] p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#003D30]/40 transition-colors"
            title="Back to Dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>

          {/* Desktop Toggle Sidebar Button */}
          <Button
            size="sm"
            variant="ghost"
            onClick={toggleSidebar}
            className="hidden lg:flex h-8 w-8 p-0 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-[#00D69A] hover:bg-gray-100 dark:hover:bg-[#003D30]/40"
            title="Toggle File Sidebar (Mod-\)"
            aria-label="Toggle sidebar"
            data-testid="toggle-sidebar-button"
          >
            {isSidebarCollapsed ? (
              <PanelLeft className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </Button>

          {/* Breadcrumb Info */}
          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <span className="font-semibold text-gray-800 dark:text-gray-200 truncate max-w-[120px] sm:max-w-xs">
              {project?.name || 'Project'}
            </span>
            <ChevronRight className="h-3 w-3 text-gray-400 dark:text-[#00D69A]/40" />
            <span className="text-gray-600 dark:text-[#00D69A] truncate max-w-[100px] sm:max-w-none font-medium">
              {document?.path || 'main.tex'}
            </span>
          </div>

          <SaveStatusIndicator
            status={status}
            lastSavedAt={lastSavedAt}
            errorMessage={errorMessage}
            onRetry={flushSave}
            onReload={reloadDocument}
          />
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2.5">
          {/* Desktop Toggle PDF Preview Button */}
          <Button
            size="sm"
            variant="ghost"
            onClick={togglePdf}
            className="hidden lg:flex h-8 w-8 p-0 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-[#00D69A] hover:bg-gray-100 dark:hover:bg-[#003D30]/40"
            title="Toggle PDF Preview (Mod-Alt-P)"
            aria-label="Toggle preview"
            data-testid="toggle-pdf-button"
          >
            {isPdfCollapsed ? (
              <PanelRight className="h-4 w-4" />
            ) : (
              <PanelRightClose className="h-4 w-4" />
            )}
          </Button>

          {/* Theme Toggle Button */}
          <ThemeToggle />

          <Button
            size="sm"
            variant="outline"
            className="hidden md:flex items-center gap-1.5 text-xs border-gray-200 dark:border-[#00D69A]/20 bg-white dark:bg-[#0A1310] text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#003D30]/40"
          >
            <Sparkles className="h-3.5 w-3.5 text-purple-600 dark:text-[#00D69A]" /> AI Assistant
          </Button>

          {/* Integrated Compile Toolbar */}
          <CompileToolbar
            projectId={projectId}
            defaultEngine={project?.engine || 'PDFLATEX'}
            autoCompile={project?.autoCompile ?? false}
            onFlushSave={flushSave}
            onCompilationChange={handleCompilationChange}
            onDiagnosticsChange={handleDiagnosticsChange}
            onOpenToolsTab={(tab) => {
              setIsToolsOpen(true);
              setToolsActiveTab(tab);
            }}
            onChangeEngine={(eng) => {
              void handleUpdateSettings({ engine: eng });
            }}
            onToggleAutoCompile={(enabled) => {
              void handleUpdateSettings({ autoCompile: enabled });
            }}
            compileRef={compileRef}
          />
        </div>
      </header>

      {/* Mobile & Tablet Tab Switcher (< 1024px) */}
      <div className="lg:hidden flex items-center border-b border-gray-200 dark:border-[#00D69A]/15 bg-white dark:bg-[#0A1310] px-2 text-xs font-medium">
        <button
          onClick={() => setMobileTab('files')}
          className={`flex items-center gap-1.5 px-3 py-2.5 border-b-2 transition-all cursor-pointer min-h-[44px] ${
            mobileTab === 'files'
              ? 'border-[#00D69A] text-[#00D69A] font-semibold bg-[#003D30]/20'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
          }`}
        >
          <Files className="h-4 w-4" /> Files
        </button>
        <button
          onClick={() => setMobileTab('editor')}
          className={`flex items-center gap-1.5 px-3 py-2.5 border-b-2 transition-all cursor-pointer min-h-[44px] ${
            mobileTab === 'editor'
              ? 'border-[#00D69A] text-[#00D69A] font-semibold bg-[#003D30]/20'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
          }`}
        >
          <Code2 className="h-4 w-4" /> Editor
        </button>
        <button
          onClick={() => setMobileTab('pdf')}
          className={`flex items-center gap-1.5 px-3 py-2.5 border-b-2 transition-all cursor-pointer min-h-[44px] ${
            mobileTab === 'pdf'
              ? 'border-[#00D69A] text-[#00D69A] font-semibold bg-[#003D30]/20'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
          }`}
        >
          <FileText className="h-4 w-4" /> PDF Preview
          {currentCompilation?.status === 'RUNNING' && (
            <Loader2 className="h-3 w-3 animate-spin text-[#00D69A]" />
          )}
        </button>
      </div>

      {/* Mobile Tab Views (< 1024px) */}
      <div className="flex-1 lg:hidden overflow-hidden">
        {mobileTab === 'files' && renderSidebarContent()}
        {mobileTab === 'editor' && renderEditorContent()}
        {mobileTab === 'pdf' && renderPdfContent()}
      </div>

      {/* Desktop Three-Panel Resizable Layout (>= 1024px) */}
      <div className="hidden lg:flex flex-1 overflow-hidden">
        <ResizablePanelGroup
          direction="horizontal"
          autoSaveId="texly-workspace-layout"
          className="flex-1 overflow-hidden"
        >
          {/* Left: File Tree Sidebar */}
          <ResizablePanel
            ref={sidebarRef}
            id="sidebar"
            order={1}
            defaultSize={18}
            minSize={12}
            maxSize={30}
            collapsible={true}
            onCollapse={() => setIsSidebarCollapsed(true)}
            onExpand={() => setIsSidebarCollapsed(false)}
            className="flex flex-col"
          >
            {renderSidebarContent()}
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Center: Editor Panel */}
          <ResizablePanel
            id="editor"
            order={2}
            defaultSize={47}
            minSize={30}
            className="flex flex-col"
          >
            {renderEditorContent()}
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Right: PDF Preview Panel */}
          <ResizablePanel
            ref={pdfRef}
            id="pdf-preview"
            order={3}
            defaultSize={35}
            minSize={20}
            maxSize={60}
            collapsible={true}
            onCollapse={() => setIsPdfCollapsed(true)}
            onExpand={() => setIsPdfCollapsed(false)}
            className="flex flex-col overflow-hidden"
          >
            {renderPdfContent()}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}

export default function WorkspacePage() {
  return (
    <ProtectedRoute>
      <Suspense
        fallback={
          <div className="h-screen flex items-center justify-center text-sm text-gray-500 dark:text-gray-400">
            Loading workspace...
          </div>
        }
      >
        <WorkspaceContent />
      </Suspense>
    </ProtectedRoute>
  );
}
