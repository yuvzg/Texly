'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plus,
  FolderGit2,
  Clock,
  FileCode,
  Settings,
  LogOut,
  User,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProtectedRoute } from '@/components/auth/route-guards';
import { useAuth } from '@/providers/auth-provider';

export default function DashboardPage() {
  const router = useRouter();
  const { user, plan, logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      router.push('/login');
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="h-16 border-b border-gray-200 bg-white px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
              <FolderGit2 className="h-5 w-5" />
            </div>
            <div>
              <span className="font-bold text-gray-900 block leading-none">Texly</span>
              <span className="text-[11px] text-gray-500 font-medium">LaTeX Editor</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {user && (
              <div className="flex items-center gap-2.5 pr-2 border-r border-gray-200">
                <div className="h-8 w-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold text-xs shadow-xs">
                  {user.name ? user.name.slice(0, 2).toUpperCase() : <User className="h-4 w-4" />}
                </div>
                <div className="hidden sm:block text-left">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-gray-900 leading-none">
                      {user.name}
                    </span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                      {plan}
                    </span>
                  </div>
                  <span className="text-[11px] text-gray-500 leading-none block mt-0.5">
                    {user.email}
                  </span>
                </div>
              </div>
            )}

            <Link href="/workspace">
              <Button size="sm" variant="default" className="flex items-center gap-1.5">
                <Plus className="h-4 w-4" /> New Project
              </Button>
            </Link>

            <Link href="/dashboard/settings" title="Settings">
              <button
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors cursor-pointer"
                aria-label="User settings"
              >
                <Settings className="h-4 w-4" />
              </button>
            </Link>

            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
              title="Sign Out"
              aria-label="Sign out"
            >
              {isLoggingOut ? (
                <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
              ) : (
                <LogOut className="h-4 w-4" />
              )}
            </button>
          </div>
        </header>

        <main className="flex-1 p-8 max-w-5xl mx-auto w-full space-y-6">
          {user && !user.emailVerified && (
            <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <span className="font-semibold block">Your email address is unverified</span>
                  <span>Please check your inbox at {user.email} for your verification link.</span>
                </div>
              </div>
              <Link href="/verify-email">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs bg-white border-amber-300 text-amber-900"
                >
                  Verify Now
                </Button>
              </Link>
            </div>
          )}

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
                <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">
                  Default
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-2">IEEE Conference template</p>
              <div className="flex items-center gap-1 text-xs text-gray-400 mt-4">
                <Clock className="h-3 w-3" /> Updated recently
              </div>
            </Link>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
