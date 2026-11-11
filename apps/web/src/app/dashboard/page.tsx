import Link from 'next/link';
import { Plus, FolderGit2, Clock, FileCode, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="h-14 border-b border-gray-200 bg-white px-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderGit2 className="h-5 w-5 text-blue-600" />
          <span className="font-bold text-gray-900">Texly Dashboard</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/workspace">
            <Button size="sm" variant="default" className="flex items-center gap-1">
              <Plus className="h-4 w-4" /> New Project
            </Button>
          </Link>
          <button className="text-gray-500 hover:text-gray-700 cursor-pointer">
            <Settings className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 p-8 max-w-5xl mx-auto w-full space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Your Projects</h1>
            <p className="text-sm text-gray-500">Manage and edit your LaTeX documents</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link
            href="/workspace"
            className="block p-5 bg-white border border-gray-200 rounded-lg shadow-xs hover:border-blue-500 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <FileCode className="h-5 w-5 text-blue-600" />
                <h3 className="font-semibold text-gray-900">Sample Paper</h3>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">IEEE Conference template</p>
            <div className="flex items-center gap-1 text-xs text-gray-400 mt-4">
              <Clock className="h-3 w-3" /> Updated 2 hours ago
            </div>
          </Link>
        </div>
      </main>
    </div>
  );
}
