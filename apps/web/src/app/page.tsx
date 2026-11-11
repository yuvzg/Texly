import Link from 'next/link';
import { FileText, Sparkles, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 text-center bg-gray-50">
      <div className="max-w-2xl space-y-6">
        <div className="flex justify-center items-center gap-3">
          <FileText className="h-10 w-10 text-blue-600" />
          <h1 className="text-4xl font-bold tracking-tight text-gray-900">Texly</h1>
        </div>
        <p className="text-lg text-gray-600">
          A production-grade, web-based LaTeX editor with user-controlled AI modification workflow.
        </p>

        <div className="flex justify-center gap-4 pt-4">
          <Link href="/login">
            <Button variant="default">Sign In</Button>
          </Link>
          <Link href="/register">
            <Button variant="outline">Create Account</Button>
          </Link>
          <Link href="/dashboard">
            <Button variant="secondary">Dashboard</Button>
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-8 text-left">
          <div className="p-4 bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center gap-2 font-semibold text-gray-800 mb-1">
              <Sparkles className="h-4 w-4 text-purple-600" /> AI Proposal Engine
            </div>
            <p className="text-xs text-gray-500">
              AI suggests edits via visual diffs; you inspect and accept changes.
            </p>
          </div>
          <div className="p-4 bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center gap-2 font-semibold text-gray-800 mb-1">
              <Terminal className="h-4 w-4 text-emerald-600" /> Isolated Sandboxes
            </div>
            <p className="text-xs text-gray-500">
              Compilation runs in secure, network-isolated TeX Live containers.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

