'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plus,
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
  Search,
  Menu,
  X,
  FileText,
  Briefcase,
  Sliders,
  CheckCircle2,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProtectedRoute } from '@/components/auth/route-guards';
import { useAuth } from '@/providers/auth-provider';
import { fetchProjects } from '@/lib/projects';
import { NewProjectModal } from '@/components/dashboard/new-project-modal';
import { NewWorkspaceModal } from '@/components/dashboard/new-workspace-modal';
import { DeleteProjectModal } from '@/components/dashboard/delete-project-modal';
import { TexlyLogo } from '@/components/common/texly-logo';
import type { ProjectDTO, WorkspaceWithRoleDTO, AuthWorkspaceSummaryDTO } from '@texly/shared';

export default function DashboardPage() {
  const router = useRouter();
  const { user, workspaces, logout } = useAuth();
  const [localWorkspaces, setLocalWorkspaces] = useState<Array<AuthWorkspaceSummaryDTO | WorkspaceWithRoleDTO>>([]);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [isNewWorkspaceOpen, setIsNewWorkspaceOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<ProjectDTO | null>(null);
  const [projects, setProjects] = useState<ProjectDTO[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  useEffect(() => {
    if (workspaces && workspaces.length > 0) {
      setLocalWorkspaces(workspaces);
    }
  }, [workspaces]);

  const activeWorkspacesList = localWorkspaces.length > 0 ? localWorkspaces : workspaces;
  const personalWorkspace = activeWorkspacesList.find((w) => w.isPersonal);
  const defaultWorkspaceId = personalWorkspace?.id || activeWorkspacesList[0]?.id;
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

  const handleWorkspaceCreated = (newWorkspace: WorkspaceWithRoleDTO) => {
    setLocalWorkspaces((prev) => [...prev, newWorkspace]);
    setSelectedWorkspaceId(newWorkspace.id);
  };

  const handleProjectDeleted = (deletedId: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== deletedId));
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

  const activeWorkspaceName = useMemo(() => {
    if (!selectedWorkspaceId) return 'All Workspaces';
    const ws = activeWorkspacesList.find((w) => w.id === selectedWorkspaceId);
    return ws ? ws.name : 'Workspace';
  }, [activeWorkspacesList, selectedWorkspaceId]);

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    const q = searchQuery.toLowerCase();
    return projects.filter(
      (p) => p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q),
    );
  }, [projects, searchQuery]);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#050807] bg-texly-glow text-[#ECFDF5] flex relative overflow-x-hidden">
        {/* Mobile Navigation Drawer Overlay */}
        {isMobileDrawerOpen && (
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setIsMobileDrawerOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Sidebar: Desktop fixed, Mobile slide-out drawer */}
        <aside
          className={`fixed lg:sticky top-0 h-screen w-64 bg-[#0A1310] border-r border-[#00D69A]/15 flex flex-col z-50 transition-transform duration-200 ease-in-out ${
            isMobileDrawerOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          }`}
        >
          {/* Sidebar Header */}
          <div className="h-16 border-b border-[#00D69A]/15 px-6 flex items-center justify-between">
            <Link href="/" className="inline-block" onClick={() => setIsMobileDrawerOpen(false)}>
              <TexlyLogo size="md" subtitle="LaTeX Editor" />
            </Link>
            <button
              onClick={() => setIsMobileDrawerOpen(false)}
              className="lg:hidden p-1.5 text-[#94A3B8] hover:text-white rounded-lg focus:outline-none"
              aria-label="Close navigation drawer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Navigation Links */}
          <div className="p-4 space-y-1">
            <Link
              href="/dashboard"
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[#003D30] text-[#00D69A] font-semibold text-sm border border-[#00D69A]/30 shadow-[0_0_15px_rgba(0,61,48,0.5)]"
              onClick={() => setIsMobileDrawerOpen(false)}
            >
              <FileText className="h-4 w-4" />
              <span>Projects</span>
            </Link>
            <Link
              href="/dashboard/settings"
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[#94A3B8] hover:text-white hover:bg-[#003D30]/40 transition-colors text-sm font-medium"
              onClick={() => setIsMobileDrawerOpen(false)}
            >
              <Sliders className="h-4 w-4" />
              <span>Settings</span>
            </Link>
          </div>

          {/* Workspaces Section */}
          <div className="px-4 py-3 flex-1 overflow-y-auto">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-[#94A3B8]/70 px-2 mb-2 font-heading">
              <span>Workspaces</span>
              <span className="text-[10px] bg-[#003D30] text-[#00D69A] px-1.5 py-0.5 rounded-full font-mono">
                {activeWorkspacesList.length}
              </span>
            </div>

            <div className="space-y-1">
              <button
                onClick={() => {
                  setSelectedWorkspaceId(undefined);
                  setIsMobileDrawerOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all text-left ${
                  selectedWorkspaceId === undefined
                    ? 'bg-[#003D30]/80 text-[#00D69A] border border-[#00D69A]/30'
                    : 'text-[#94A3B8] hover:text-white hover:bg-[#003D30]/30'
                }`}
              >
                <div className="h-6 w-6 rounded-md bg-[#003D30] text-[#00D69A] flex items-center justify-center font-bold text-[10px]">
                  ALL
                </div>
                <span className="truncate">All Workspaces</span>
              </button>

              {activeWorkspacesList.map((w) => {
                const isSelected = selectedWorkspaceId === w.id;
                const initial = w.name.charAt(0).toUpperCase();
                return (
                  <button
                    key={w.id}
                    onClick={() => {
                      setSelectedWorkspaceId(w.id);
                      setIsMobileDrawerOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all text-left ${
                      isSelected
                        ? 'bg-[#003D30]/80 text-[#00D69A] border border-[#00D69A]/30'
                        : 'text-[#94A3B8] hover:text-white hover:bg-[#003D30]/30'
                    }`}
                  >
                    <div className="h-6 w-6 rounded-md bg-[#003D30] text-[#00D69A] border border-[#00D69A]/20 flex items-center justify-center font-bold text-[11px]">
                      {initial}
                    </div>
                    <span className="truncate">
                      {w.name} {w.isPersonal ? '(Personal)' : ''}
                    </span>
                  </button>
                );
              })}

              <button
                onClick={() => {
                  setIsNewWorkspaceOpen(true);
                  setIsMobileDrawerOpen(false);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium text-[#94A3B8] hover:text-[#00D69A] hover:bg-[#003D30]/30 transition-all text-left cursor-pointer border border-dashed border-[#00D69A]/20 mt-1.5"
              >
                <Plus className="h-3.5 w-3.5 text-[#00D69A]" />
                <span>Add Workspace</span>
              </button>
            </div>
          </div>

          {/* User profile footer */}
          {user && (
            <div className="p-4 border-t border-[#00D69A]/15 bg-[#08100D] flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="h-8 w-8 rounded-full bg-[#00D69A] text-[#050807] flex items-center justify-center font-bold text-xs shrink-0 shadow-[0_0_10px_rgba(0,214,154,0.4)]">
                  {user.name ? user.name.slice(0, 2).toUpperCase() : <User className="h-4 w-4" />}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-white truncate">{user.name}</span>
                  </div>
                  <span className="text-[11px] text-[#94A3B8] truncate block">{user.email}</span>
                </div>
              </div>

              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="p-1.5 text-[#94A3B8] hover:text-rose-400 rounded-lg hover:bg-rose-950/40 transition-colors cursor-pointer"
                title="Sign Out"
                aria-label="Sign out"
              >
                {isLoggingOut ? (
                  <Loader2 className="h-4 w-4 animate-spin text-[#94A3B8]" />
                ) : (
                  <LogOut className="h-4 w-4" />
                )}
              </button>
            </div>
          )}
        </aside>

        {/* Main Content Pane */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top Bar */}
          <header className="h-16 border-b border-[#00D69A]/15 px-4 sm:px-8 flex items-center justify-between gap-4 backdrop-blur-md bg-[#050807]/70 sticky top-0 z-30">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsMobileDrawerOpen(true)}
                className="lg:hidden p-2 text-[#94A3B8] hover:text-white rounded-lg hover:bg-[#003D30]/40 focus:outline-none"
                aria-label="Open navigation menu"
              >
                <Menu className="h-5 w-5" />
              </button>

              <div className="flex items-center gap-2 text-xs sm:text-sm font-medium">
                <span className="text-[#94A3B8] hidden sm:inline">Workspace</span>
                <span className="text-[#94A3B8]/40 hidden sm:inline">/</span>
                <span className="text-[#00D69A] font-semibold">{activeWorkspaceName}</span>
              </div>
            </div>

            {/* Search Input & Action Button */}
            <div className="flex items-center gap-3">
              <div className="relative hidden sm:block w-48 md:w-64">
                <Search className="h-3.5 w-3.5 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search projects..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-[#0A1310] border border-[#00D69A]/20 text-[#ECFDF5] placeholder:text-[#94A3B8]/40 focus:outline-none focus:border-[#00D69A] focus:ring-1 focus:ring-[#00D69A]"
                />
              </div>

              <Button
                size="sm"
                onClick={() => setIsNewProjectOpen(true)}
                className="flex items-center gap-1.5 shadow-[0_0_15px_rgba(0,214,154,0.3)]"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden xs:inline">New Project</span>
              </Button>
            </div>
          </header>

          {/* Page Body */}
          <main className="flex-1 p-4 sm:p-8 max-w-7xl mx-auto w-full space-y-6">
            {user && !user.emailVerified && (
              <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-200 flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <span className="font-semibold block text-white">Your email address is unverified</span>
                    <span>Please check your inbox at {user.email} for your verification link.</span>
                  </div>
                </div>
                <Link href="/verify-email">
                  <Button size="sm" variant="outline" className="text-xs bg-amber-950/60 border-amber-600/40 text-amber-200">
                    Verify Now
                  </Button>
                </Link>
              </div>
            )}

            {/* Section Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-2">
                  <span>Projects</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#003D30] text-[#00D69A] border border-[#00D69A]/30">
                    {filteredProjects.length}
                  </span>
                </h1>
                <p className="text-xs sm:text-sm text-[#94A3B8] mt-1">
                  Manage, edit and compile your LaTeX documents in isolated sandboxes
                </p>
              </div>
            </div>

            {/* Project List / Grid */}
            {isLoadingProjects ? (
              <div className="p-16 flex flex-col items-center justify-center text-[#94A3B8]">
                <Loader2 className="h-8 w-8 animate-spin text-[#00D69A] mb-3" />
                <p className="text-sm">Loading your workspaces & projects...</p>
              </div>
            ) : projectsError ? (
              <div className="p-6 rounded-xl bg-rose-950/40 border border-rose-900/60 text-rose-200 text-sm flex items-center justify-between">
                <span>{projectsError}</span>
                <Button size="sm" variant="outline" onClick={loadProjects}>
                  Retry
                </Button>
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="p-12 sm:p-16 text-center bg-[#0A1310] border border-dashed border-[#00D69A]/20 rounded-2xl space-y-4 shadow-[0_0_20px_rgba(0,61,48,0.2)]">
                <div className="h-14 w-14 rounded-2xl bg-[#003D30] text-[#00D69A] border border-[#00D69A]/30 flex items-center justify-center mx-auto shadow-[0_0_20px_rgba(0,214,154,0.15)]">
                  <FolderPlus className="h-7 w-7" />
                </div>
                <h3 className="text-lg font-semibold text-white">No projects found</h3>
                <p className="text-xs sm:text-sm text-[#94A3B8] max-w-sm mx-auto leading-relaxed">
                  {searchQuery
                    ? `No projects matched "${searchQuery}". Try a different keyword.`
                    : 'Get started by creating your first LaTeX project with standard templates or a blank slate.'}
                </p>
                <Button
                  size="default"
                  onClick={() => setIsNewProjectOpen(true)}
                  className="mt-2"
                >
                  <Plus className="h-4 w-4 mr-1.5" /> Create Project
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredProjects.map((p) => (
                  <Link
                    key={p.id}
                    href={`/workspace?projectId=${p.id}`}
                    className="group block p-5 rounded-2xl bg-[#0A1310] border border-[#00D69A]/15 hover:border-[#00D69A]/40 shadow-[0_0_15px_rgba(0,61,48,0.2)] hover:shadow-[0_0_25px_rgba(0,214,154,0.15)] transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-xl bg-[#003D30] text-[#00D69A] border border-[#00D69A]/20 flex items-center justify-center group-hover:bg-[#00D69A] group-hover:text-[#050807] transition-colors shadow-xs">
                            <FileCode className="h-4.5 w-4.5" />
                          </div>
                          <div className="min-w-0 max-w-[180px]">
                            <h3 className="font-semibold text-sm text-white truncate group-hover:text-[#00D69A] transition-colors" title={p.name}>
                              {p.name}
                            </h3>
                            <span className="text-[10px] text-[#00D69A]/80 font-mono tracking-wider">
                              {formatEngine(p.engine)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {p.role && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#003D30] text-[#00D69A] border border-[#00D69A]/30 font-medium font-mono">
                              {p.role}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setProjectToDelete(p);
                            }}
                            className="p-1 rounded-md text-[#94A3B8]/60 hover:text-rose-400 hover:bg-rose-950/40 transition-colors cursor-pointer"
                            title="Delete project"
                            aria-label={`Delete ${p.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {p.description ? (
                        <p className="text-xs text-[#94A3B8] mt-3 line-clamp-2 leading-relaxed">
                          {p.description}
                        </p>
                      ) : (
                        <p className="text-xs text-[#94A3B8]/40 italic mt-3">No description provided</p>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-xs text-[#94A3B8] mt-5 pt-3 border-t border-[#00D69A]/10">
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <Clock className="h-3 w-3 text-[#00D69A]/60" />
                        <span>{new Date(p.updatedAt).toLocaleDateString()}</span>
                      </div>
                      <span className="text-[#00D69A] text-xs font-semibold flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                        Open <ChevronRight className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </main>
        </div>

        {/* New Project Modal */}
        <NewProjectModal
          isOpen={isNewProjectOpen}
          onClose={() => setIsNewProjectOpen(false)}
          onSuccess={handleProjectCreated}
          workspaces={activeWorkspacesList}
          defaultWorkspaceId={selectedWorkspaceId}
        />

        {/* New Workspace Modal */}
        <NewWorkspaceModal
          isOpen={isNewWorkspaceOpen}
          onClose={() => setIsNewWorkspaceOpen(false)}
          onWorkspaceCreated={handleWorkspaceCreated}
        />

        {/* Delete Project Modal */}
        <DeleteProjectModal
          project={projectToDelete}
          isOpen={projectToDelete !== null}
          onClose={() => setProjectToDelete(null)}
          onDeleted={handleProjectDeleted}
        />
      </div>
    </ProtectedRoute>
  );
}
