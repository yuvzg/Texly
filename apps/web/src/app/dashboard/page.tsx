'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
  Layers,
  ChevronRight,
  FolderPlus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProtectedRoute } from '@/components/auth/route-guards';
import { useAuth } from '@/providers/auth-provider';
import { fetchProjects } from '@/lib/projects';
import { NewProjectModal } from '@/components/dashboard/new-project-modal';
import type { ProjectDTO } from '@texly/shared';

export default function DashboardPage() {
  const router = useRouter();
  const { user, workspaces, plan, logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectDTO[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [projectsError, setProjectsError] = useState<string | null>(null);

  const personalWorkspace = workspaces.find((w) => w.isPersonal);
  const defaultWorkspaceId = personalWorkspace?.id || workspaces[0]?.id;
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | undefined>(
    defaultWorkspaceId,
  );

  // Sync workspace ID when workspaces load
  useEffect(() => {
    if (!selectedWorkspaceId && defaultWorkspaceId) {
      setSelectedWorkspaceId(defaultWorkspaceId);
    }
  }, [defaultWorkspaceId, selectedWorkspaceId]);

  const loadProjects = useCallback(async () => {
    setIsLoadingProjects(true);
    setProjectsError(null);
    try {
      const data = await fetchProjects({ workspaceId: selectedWorkspaceId });
      setProjects(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load projects';
      setProjectsError(msg);
    } finally {
      setIsLoadingProjects(false);
    }
  }, [selectedWorkspaceId]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      router.push('/login');
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleProjectCreated = (newProject: ProjectDTO) => {
    setIsNewProjectOpen(false);
    router.push(`/workspace?projectId=${newProject.id}`);
  };

  const formatEngine = (engine: string) => {
    switch (engine) {
      case 'XELATEX':
        return 'XeLaTeX';
      case 'LUALATEX':
        return 'LuaLaTeX';
      case 'PDFLATEX':
      default:
        return 'pdfLaTeX';
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {/* Navigation Bar */}
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

            <Button
              size="sm"
              variant="default"
              onClick={() => setIsNewProjectOpen(true)}
              className="flex items-center gap-1.5"
            >
              <Plus className="h-4 w-4" /> New Project
            </Button>

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

        {/* Main Content */}
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

          {/* Header & Workspace filter */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Your Projects</h1>
              <p className="text-sm text-gray-500">Manage, edit and compile your LaTeX documents</p>
            </div>

            {workspaces.length > 1 && (
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-gray-400" />
                <select
                  value={selectedWorkspaceId || ''}
                  onChange={(e) => setSelectedWorkspaceId(e.target.value || undefined)}
                  className="h-8 px-2.5 rounded-md border border-gray-300 bg-white text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  <option value="">All Workspaces</option>
                  {workspaces.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} {w.isPersonal ? '(Personal)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Project List */}
          {isLoadingProjects ? (
            <div className="p-12 flex flex-col items-center justify-center text-gray-400">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-2" />
              <p className="text-sm">Loading projects...</p>
            </div>
          ) : projectsError ? (
            <div className="p-6 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center justify-between">
              <span>{projectsError}</span>
              <Button size="sm" variant="outline" onClick={loadProjects}>
                Retry
              </Button>
            </div>
          ) : projects.length === 0 ? (
            <div className="p-12 text-center bg-white border border-dashed border-gray-300 rounded-xl space-y-3">
              <div className="h-12 w-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                <FolderPlus className="h-6 w-6" />
              </div>
              <h3 className="text-base font-semibold text-gray-900">No projects yet</h3>
              <p className="text-xs text-gray-500 max-w-sm mx-auto">
                Get started by creating your first LaTeX project with standard templates or a blank slate.
              </p>
              <Button
                size="sm"
                variant="default"
                onClick={() => setIsNewProjectOpen(true)}
                className="mt-2"
              >
                <Plus className="h-4 w-4 mr-1.5" /> Create Project
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((p) => (
                <Link
                  key={p.id}
                  href={`/workspace?projectId=${p.id}`}
                  className="group block p-5 bg-white border border-gray-200 rounded-lg shadow-xs hover:border-blue-500 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                        <FileCode className="h-4 w-4" />
                      </div>
                      <div className="max-w-[170px]">
                        <h3 className="font-semibold text-sm text-gray-900 truncate" title={p.name}>
                          {p.name}
                        </h3>
                        <span className="text-[10px] text-gray-400 font-mono">
                          {formatEngine(p.engine)}
                        </span>
                      </div>
                    </div>
                    {p.role && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">
                        {p.role}
                      </span>
                    )}
                  </div>

                  {p.description && (
                    <p className="text-xs text-gray-500 mt-2 line-clamp-2">{p.description}</p>
                  )}

                  <div className="flex items-center justify-between text-xs text-gray-400 mt-4 pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-1 text-[11px]">
                      <Clock className="h-3 w-3" />
                      <span>{new Date(p.updatedAt).toLocaleDateString()}</span>
                    </div>
                    <span className="text-blue-600 text-[11px] font-medium flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      Open <ChevronRight className="h-3 w-3" />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </main>

        {/* New Project Modal */}
        <NewProjectModal
          isOpen={isNewProjectOpen}
          onClose={() => setIsNewProjectOpen(false)}
          onSuccess={handleProjectCreated}
          workspaces={workspaces}
          defaultWorkspaceId={selectedWorkspaceId}
        />
      </div>
    </ProtectedRoute>
  );
}
