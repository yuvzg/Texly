'use client';

import React from 'react';
import Link from 'next/link';
import { Play, Sparkles, Files, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProtectedRoute } from '@/components/auth/route-guards';

export default function WorkspacePage() {
  return (
    <ProtectedRoute>
      <div className="h-screen flex flex-col bg-gray-100 overflow-hidden">
        {/* Top Navigation Bar */}
        <header className="h-12 bg-white border-b border-gray-200 px-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-gray-500 hover:text-gray-700">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <span className="font-semibold text-sm text-gray-800">Sample Paper / main.tex</span>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="flex items-center gap-1">
              <Sparkles className="h-4 w-4 text-purple-600" /> AI Assistant
            </Button>
            <Button
              size="sm"
              variant="default"
              className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700"
            >
              <Play className="h-3.5 w-3.5" /> Recompile
            </Button>
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
              <div className="px-2 py-1.5 rounded bg-blue-50 text-blue-700 font-medium cursor-pointer">
                main.tex
              </div>
              <div className="px-2 py-1.5 rounded hover:bg-gray-100 text-gray-700 cursor-pointer">
                references.bib
              </div>
            </div>
          </aside>

          {/* Center: Editor Panel */}
          <section className="flex-1 bg-white flex flex-col border-r border-gray-200">
            <div className="h-8 border-b border-gray-200 px-4 flex items-center text-xs text-gray-500 bg-gray-50">
              main.tex
            </div>
            <div className="flex-1 p-4 font-mono text-sm overflow-auto text-gray-800 bg-white">
              <pre className="text-xs leading-relaxed">
                {`\\documentclass{article}
\\usepackage{amsmath}

\\title{Sample Document}
\\author{Texly Author}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{Introduction}
Welcome to Texly, a production-grade web-based LaTeX editor.

\\end{document}`}
              </pre>
            </div>
          </section>

          {/* Right: PDF Preview Panel */}
          <aside className="w-1/3 bg-gray-100 flex flex-col items-center justify-center p-6 text-center">
            <div className="border border-dashed border-gray-300 rounded-lg p-8 max-w-sm">
              <p className="text-sm font-medium text-gray-700 mb-1">PDF Preview</p>
              <p className="text-xs text-gray-400">
                Compilation preview will render here via PDF.js worker.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </ProtectedRoute>
  );
}
