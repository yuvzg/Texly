'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Sparkles, Files, ArrowLeft, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProtectedRoute } from '@/components/auth/route-guards';
import { CompileToolbar } from '@/components/editor/compile-toolbar';
import { SaveStatusIndicator } from '@/components/editor/save-status-indicator';
import { useDocumentAutosave } from '@/hooks/use-document-autosave';
import { fetchProject } from '@/lib/projects';
import type { ProjectDTO } from '@texly/shared';

const DEFAULT_DEMO_PROJECT_ID = '01931a00-0000-7000-8000-000000000003';

function WorkspaceContent() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId') || DEFAULT_DEMO_PROJECT_ID;
  const [project, setProject] = useState<ProjectDTO | null>(null);

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

  return (
    <div className="h-screen flex flex-col bg-gray-100 overflow-hidden">
      {/* Top Navigation Bar */}
      <header className="h-14 bg-white border-b border-gray-200 px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <span className="font-semibold text-sm text-gray-800">
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

        <div className="flex items-center gap-3">
          <Button size="sm" variant="outline" className="flex items-center gap-1 text-xs">
            <Sparkles className="h-3.5 w-3.5 text-purple-600" /> AI Assistant
          </Button>

          {/* Integrated Compile Toolbar */}
          <CompileToolbar
            projectId={projectId}
            defaultEngine={project?.engine || 'PDFLATEX'}
            onFlushSave={flushSave}
          />
        </div>
      </header>

      {/* Main Three-Panel Editor Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: File Tree Sidebar */}
        <aside className="w-64 bg-gray-50 border-r border-gray-200 flex flex-col">
          <div className="p-3 border-b border-gray-200 flex items-center gap-2 font-medium text-xs text-gray-600 uppercase tracking-wider">
            <Files className="h-4 w-4" /> Project Files
          </div>
          <div className="p-2 space-y-1 text-sm">
            <div className="px-2 py-1.5 rounded bg-blue-50 text-blue-700 font-medium cursor-pointer text-xs flex items-center gap-2">
              <FileText className="h-3.5 w-3.5" /> {document?.path || 'main.tex'}
            </div>
            <div className="px-2 py-1.5 rounded hover:bg-gray-100 text-gray-700 cursor-pointer text-xs flex items-center gap-2">
              <FileText className="h-3.5 w-3.5" /> references.bib
            </div>
          </div>
        </aside>

        {/* Center: Editor Panel */}
        <section className="flex-1 bg-white flex flex-col border-r border-gray-200">
          <div className="h-8 border-b border-gray-200 px-4 flex items-center justify-between text-xs text-gray-500 bg-gray-50">
            <span>{document?.path || 'main.tex'}</span>
            <span className="text-[11px] text-gray-400">
              {document ? `Rev ${document.revision} • LaTeX • UTF-8` : 'LaTeX • UTF-8'}
            </span>
          </div>
          <div className="flex-1 p-4 font-mono text-xs overflow-auto text-gray-800 bg-white relative">
            {isLoading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : (
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full h-full resize-none font-mono text-xs leading-relaxed outline-none border-none p-0 focus:ring-0"
                spellCheck={false}
                placeholder="Enter LaTeX document content..."
              />
            )}
          </div>
        </section>

        {/* Right: PDF Preview Panel */}
        <aside className="w-1/3 bg-gray-100 flex flex-col items-center justify-center p-6 text-center">
          <div className="border border-dashed border-gray-300 rounded-lg p-8 max-w-sm">
            <p className="text-sm font-medium text-gray-700 mb-1">PDF Preview</p>
            <p className="text-xs text-gray-400">
              Trigger a compilation using{' '}
              <kbd className="font-mono bg-gray-200 px-1 rounded">Mod-Enter</kbd> or the Compile
              button above. Full interactive PDF.js preview with SyncTeX will render here in Phase
              06.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function WorkspacePage() {
  return (
    <ProtectedRoute>
      <Suspense
        fallback={
          <div className="h-screen flex items-center justify-center text-sm text-gray-500">
            Loading workspace...
          </div>
        }
      >
        <WorkspaceContent />
      </Suspense>
    </ProtectedRoute>
  );
}
