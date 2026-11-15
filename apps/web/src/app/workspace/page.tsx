'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Sparkles, Files, ArrowLeft, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProtectedRoute } from '@/components/auth/route-guards';
import { CompileToolbar } from '@/components/editor/compile-toolbar';

function WorkspaceContent() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId') || '018f6c4a-8e2b-7c1e-9a1d-4f8b2c5e7a90';
  const [docContent, setDocContent] = useState<string>(`\\documentclass{article}
\\usepackage{amsmath}

\\title{Sample Document}
\\author{Texly Author}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{Introduction}
Welcome to Texly, a production-grade web-based LaTeX editor.

\\end{document}`);

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Autosave flush handler before compiling
  const handleFlushSave = async (): Promise<boolean> => {
    if (!hasUnsavedChanges) return true;
    // Simulate autosave flush completion
    await new Promise((resolve) => setTimeout(resolve, 300));
    setHasUnsavedChanges(false);
    return true;
  };

  return (
    <div className="h-screen flex flex-col bg-gray-100 overflow-hidden">
      {/* Top Navigation Bar */}
      <header className="h-14 bg-white border-b border-gray-200 px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <span className="font-semibold text-sm text-gray-800">Sample Paper / main.tex</span>
          {hasUnsavedChanges && (
            <span className="text-[11px] text-amber-600 font-medium bg-amber-50 px-2 py-0.5 rounded">
              Unsaved changes
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Button size="sm" variant="outline" className="flex items-center gap-1 text-xs">
            <Sparkles className="h-3.5 w-3.5 text-purple-600" /> AI Assistant
          </Button>

          {/* Integrated Compile Toolbar */}
          <CompileToolbar
            projectId={projectId}
            defaultEngine="PDFLATEX"
            onFlushSave={handleFlushSave}
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
              <FileText className="h-3.5 w-3.5" /> main.tex
            </div>
            <div className="px-2 py-1.5 rounded hover:bg-gray-100 text-gray-700 cursor-pointer text-xs flex items-center gap-2">
              <FileText className="h-3.5 w-3.5" /> references.bib
            </div>
          </div>
        </aside>

        {/* Center: Editor Panel */}
        <section className="flex-1 bg-white flex flex-col border-r border-gray-200">
          <div className="h-8 border-b border-gray-200 px-4 flex items-center justify-between text-xs text-gray-500 bg-gray-50">
            <span>main.tex</span>
            <span className="text-[11px] text-gray-400">LaTeX • UTF-8</span>
          </div>
          <div className="flex-1 p-4 font-mono text-xs overflow-auto text-gray-800 bg-white">
            <textarea
              value={docContent}
              onChange={(e) => {
                setDocContent(e.target.value);
                setHasUnsavedChanges(true);
              }}
              className="w-full h-full resize-none font-mono text-xs leading-relaxed outline-none border-none p-0 focus:ring-0"
              spellCheck={false}
            />
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
