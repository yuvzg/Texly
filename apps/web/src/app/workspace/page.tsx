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
  ExternalLink,
  AlertCircle,
  Download,
} from 'lucide-react';
import type { ImperativePanelHandle } from 'react-resizable-panels';
import { Button } from '@/components/ui/button';
import { ProtectedRoute } from '@/components/auth/route-guards';
import { CompileToolbar } from '@/components/editor/compile-toolbar';
import { SaveStatusIndicator } from '@/components/editor/save-status-indicator';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import { ThemeToggle } from '@/providers/theme-provider';
import { useDocumentAutosave } from '@/hooks/use-document-autosave';
import { fetchProject } from '@/lib/projects';
import { fetchCompilationPdf } from '@/lib/compilations';
import type { ProjectDTO, CompilationDTO } from '@texly/shared';

const DEFAULT_DEMO_PROJECT_ID = '01931a00-0000-7000-8000-000000000003';

function WorkspaceContent() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId') || DEFAULT_DEMO_PROJECT_ID;
  const [project, setProject] = useState<ProjectDTO | null>(null);

  // Resizable panel handles
  const sidebarRef = useRef<ImperativePanelHandle>(null);
  const pdfRef = useRef<ImperativePanelHandle>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isPdfCollapsed, setIsPdfCollapsed] = useState(false);

  // Compilation & PDF Preview state
  const [currentCompilation, setCurrentCompilation] = useState<CompilationDTO | null>(null);
  const [lastSuccessCompilation, setLastSuccessCompilation] = useState<CompilationDTO | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);

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
    debounceMs: 1000,
  });

  const handleCompilationChange = useCallback(
    (
      current: CompilationDTO | null,
      lastSuccess: CompilationDTO | null,
      compiling: boolean,
    ) => {
      setCurrentCompilation(current);
      setLastSuccessCompilation(lastSuccess);
      setIsCompiling(compiling);
    },
    [],
  );

  // Automatically fetch PDF presigned URL on successful compilation
  const targetCompilationId =
    (currentCompilation?.status === 'SUCCEEDED' && currentCompilation.hasPdf
      ? currentCompilation.id
      : null) ??
    (lastSuccessCompilation?.hasPdf ? lastSuccessCompilation.id : null);

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

  return (
    <div className="h-screen flex flex-col bg-gray-100 dark:bg-gray-950 overflow-hidden">
      {/* Top Navigation Bar */}
      <header className="h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/dashboard"
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
            title="Back to Dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>

          {/* Toggle Sidebar Button */}
          <Button
            size="sm"
            variant="ghost"
            onClick={toggleSidebar}
            className="h-8 w-8 p-0 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
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

          <span className="font-semibold text-sm text-gray-800 dark:text-gray-100 truncate max-w-[200px] sm:max-w-xs">
            {project
              ? `${project.name} / ${document?.path || 'main.tex'}`
              : document?.path
                ? `Project / ${document.path}`
                : 'Project Editor'}
          </span>

          <SaveStatusIndicator
            status={status}
            lastSavedAt={lastSavedAt}
            errorMessage={errorMessage}
            onRetry={flushSave}
            onReload={reloadDocument}
          />
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Toggle PDF Preview Button */}
          <Button
            size="sm"
            variant="ghost"
            onClick={togglePdf}
            className="h-8 w-8 p-0 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
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
            className="hidden sm:flex items-center gap-1 text-xs border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"
          >
            <Sparkles className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" /> AI Assistant
          </Button>

          {/* Integrated Compile Toolbar */}
          <CompileToolbar
            projectId={projectId}
            defaultEngine={project?.engine || 'PDFLATEX'}
            onFlushSave={flushSave}
            onCompilationChange={handleCompilationChange}
          />
        </div>
      </header>

      {/* Main Three-Panel Resizable Area */}
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
          className="bg-gray-50 dark:bg-gray-900/60 flex flex-col"
        >
          <div className="p-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between font-medium text-xs text-gray-600 dark:text-gray-400 uppercase tracking-wider">
            <span className="flex items-center gap-2">
              <Files className="h-4 w-4" /> Project Files
            </span>
            <span className="text-[10px] text-gray-400 lowercase">draggable</span>
          </div>
          <div className="p-2 space-y-1 text-sm overflow-y-auto flex-1">
            <div className="px-2 py-1.5 rounded bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-medium cursor-pointer text-xs flex items-center gap-2">
              <FileText className="h-3.5 w-3.5" /> {document?.path || 'main.tex'}
            </div>
            <div className="px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 cursor-pointer text-xs flex items-center gap-2">
              <FileText className="h-3.5 w-3.5" /> references.bib
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Center: Editor Panel */}
        <ResizablePanel
          id="editor"
          order={2}
          defaultSize={47}
          minSize={30}
          className="bg-white dark:bg-gray-950 flex flex-col"
        >
          <div className="h-8 border-b border-gray-200 dark:border-gray-800 px-4 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900">
            <span>{document?.path || 'main.tex'}</span>
            <span className="text-[11px] text-gray-400">
              {document ? `Rev ${document.revision} • LaTeX • UTF-8` : 'LaTeX • UTF-8'}
            </span>
          </div>
          <div className="flex-1 p-4 font-mono text-xs overflow-auto text-gray-800 dark:text-gray-100 bg-white dark:bg-gray-950 relative">
            {isLoading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-gray-950/70">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : (
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full h-full resize-none font-mono text-xs leading-relaxed outline-none border-none p-0 focus:ring-0 bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400"
                spellCheck={false}
                placeholder="Enter LaTeX document content..."
              />
            )}
          </div>
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
          className="bg-gray-100 dark:bg-gray-900 flex flex-col overflow-hidden"
        >
          {/* PDF Viewer Header */}
          <div className="h-8 border-b border-gray-200 dark:border-gray-800 px-3 flex items-center justify-between text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-900">
            <span className="font-medium flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" /> PDF Preview
              {pageCount && (
                <span className="text-[11px] font-normal text-gray-400">
                  ({pageCount} page{pageCount > 1 ? 's' : ''})
                </span>
              )}
            </span>
            <div className="flex items-center gap-2">
              {pdfUrl && (
                <>
                  <a
                    href={pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                    title="Open PDF in new tab"
                  >
                    <ExternalLink className="h-3 w-3" /> Pop out
                  </a>
                  <a
                    href={pdfUrl}
                    download={`${project?.name || 'document'}.pdf`}
                    className="text-[11px] text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white flex items-center gap-1"
                    title="Download PDF"
                  >
                    <Download className="h-3 w-3" />
                  </a>
                </>
              )}
            </div>
          </div>

          {/* PDF Viewer Content Area */}
          <div className="flex-1 relative flex flex-col items-center justify-center bg-gray-200 dark:bg-gray-900/60 overflow-hidden">
            {isCompiling ? (
              <div className="flex flex-col items-center justify-center p-6 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400 mb-2" />
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  Compiling document...
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Executing LaTeX engine inside container sandbox
                </p>
              </div>
            ) : isLoadingPdf ? (
              <div className="flex flex-col items-center justify-center p-6 text-center">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400 mb-2" />
                <p className="text-xs text-gray-500">Loading PDF preview...</p>
              </div>
            ) : pdfUrl ? (
              <iframe
                src={pdfUrl}
                className="w-full h-full border-0 bg-white"
                title="Compiled PDF Preview"
              />
            ) : currentCompilation?.status === 'FAILED' ? (
              <div className="p-6">
                <div className="border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 rounded-lg p-6 max-w-sm text-center">
                  <AlertCircle className="h-7 w-7 text-rose-600 dark:text-rose-400 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-rose-800 dark:text-rose-200 mb-1">
                    Compilation Failed
                  </p>
                  <p className="text-xs text-rose-600 dark:text-rose-400">
                    {currentCompilation.errorCount > 0
                      ? `${currentCompilation.errorCount} error(s) found during compilation. Check the error log.`
                      : 'LaTeX process exited with errors. Check log.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="border border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-8 max-w-sm text-center bg-white/60 dark:bg-gray-800/60 m-4">
                <FileText className="h-8 w-8 text-gray-400 dark:text-gray-500 mx-auto mb-2" />
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  No PDF preview yet
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Trigger a compilation using{' '}
                  <kbd className="font-mono bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-1 py-0.5 rounded">
                    Mod-Enter
                  </kbd>{' '}
                  or the Compile button above.
                </p>
              </div>
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
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
