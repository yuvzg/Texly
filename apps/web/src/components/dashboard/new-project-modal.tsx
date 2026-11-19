import React, { useState } from 'react';
import { X, Loader2, FileText, BookOpen, Presentation, Award, FileCode, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createProject } from '@/lib/projects';
import type { ProjectDTO, ProjectTemplate, Engine, AuthWorkspaceSummaryDTO } from '@texly/shared';
import { ApiClientError } from '@/lib/api-client';

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (project: ProjectDTO) => void;
  workspaces: AuthWorkspaceSummaryDTO[];
  defaultWorkspaceId?: string | undefined;
}

const TEMPLATES: Array<{
  id: ProjectTemplate;
  name: string;
  description: string;
  icon: React.ElementType;
}> = [
  {
    id: 'blank',
    name: 'Blank Document',
    description: 'Clean slate with basic structure',
    icon: FileCode,
  },
  {
    id: 'article',
    name: 'Academic Article',
    description: 'Standard article with bibliography',
    icon: FileText,
  },
  {
    id: 'report',
    name: 'Report',
    description: 'Multi-chapter report layout',
    icon: BookOpen,
  },
  {
    id: 'beamer',
    name: 'Beamer Presentation',
    description: 'Slide deck with Madrid theme',
    icon: Presentation,
  },
  {
    id: 'ieee-conference',
    name: 'IEEE Conference',
    description: 'Two-column IEEE format',
    icon: Award,
  },
  {
    id: 'resume',
    name: 'Resume / CV',
    description: 'Professional one-page resume',
    icon: FileText,
  },
];

export function NewProjectModal({
  isOpen,
  onClose,
  onSuccess,
  workspaces,
  defaultWorkspaceId,
}: NewProjectModalProps) {
  const initialWorkspaceId =
    defaultWorkspaceId ||
    workspaces.find((w) => w.isPersonal)?.id ||
    workspaces[0]?.id ||
    '';

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [workspaceId, setWorkspaceId] = useState(initialWorkspaceId);
  const [template, setTemplate] = useState<ProjectTemplate>('blank');
  const [engine, setEngine] = useState<Engine>('PDFLATEX');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Project name is required.');
      return;
    }

    if (!workspaceId) {
      setError('Please select a valid workspace.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const project = await createProject({
        workspaceId,
        name: name.trim(),
        description: description.trim() || undefined,
        template,
        engine,
      });

      onSuccess(project);
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(err.message || 'Failed to create project');
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50/50">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Create New Project</h2>
            <p className="text-xs text-gray-500">Configure your LaTeX document and workspace</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3 text-xs rounded-lg bg-rose-50 border border-rose-200 text-rose-700">
              {error}
            </div>
          )}

          {/* Project Name */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-700">
              Project Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              maxLength={160}
              placeholder="e.g., Quantum Computing Notes"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-9 px-3 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
              autoFocus
            />
          </div>

          {/* Workspace selector if multiple */}
          {workspaces.length > 1 && (
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-700">Workspace</label>
              <select
                value={workspaceId}
                onChange={(e) => setWorkspaceId(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
              >
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} {w.isPersonal ? '(Personal)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Description */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-700">Description (Optional)</label>
            <input
              type="text"
              maxLength={1000}
              placeholder="Brief summary of document goals..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full h-9 px-3 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Template Selection */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-700">Choose Template</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-48 overflow-y-auto p-0.5">
              {TEMPLATES.map((t) => {
                const Icon = t.icon;
                const isSelected = template === t.id;
                return (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() => setTemplate(t.id)}
                    className={`flex flex-col items-start p-2.5 rounded-lg border text-left transition-all relative cursor-pointer ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/60 ring-1 ring-blue-600'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <Icon className={`h-4 w-4 ${isSelected ? 'text-blue-600' : 'text-gray-500'}`} />
                      {isSelected && <Check className="h-3.5 w-3.5 text-blue-600" />}
                    </div>
                    <span className="text-xs font-semibold text-gray-900 leading-tight">
                      {t.name}
                    </span>
                    <span className="text-[11px] text-gray-500 leading-tight mt-0.5 line-clamp-2">
                      {t.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Compilation Engine */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-700">LaTeX Engine</label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'PDFLATEX', label: 'pdfLaTeX', desc: 'Standard & fast' },
                  { id: 'XELATEX', label: 'XeLaTeX', desc: 'Unicode & modern fonts' },
                  { id: 'LUALATEX', label: 'LuaLaTeX', desc: 'Advanced scripting' },
                ] as const
              ).map((eng) => (
                <button
                  type="button"
                  key={eng.id}
                  onClick={() => setEngine(eng.id)}
                  className={`px-3 py-2 rounded-lg border text-left cursor-pointer transition-colors ${
                    engine === eng.id
                      ? 'border-blue-600 bg-blue-50/50 text-blue-900 font-medium'
                      : 'border-gray-200 text-gray-700 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="text-xs font-semibold">{eng.label}</div>
                  <div className="text-[10px] text-gray-500">{eng.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-200">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting || !name.trim()}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Creating...
                </>
              ) : (
                'Create Project'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
