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
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [template, setTemplate] = useState<ProjectTemplate>('blank');
  const [engine, setEngine] = useState<Engine>('PDFLATEX');
  const [workspaceId, setWorkspaceId] = useState<string>(
    defaultWorkspaceId || workspaces[0]?.id || '',
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Project name is required.');
      return;
    }

    if (!workspaceId) {
      setError('Please select a workspace for this project.');
      return;
    }

    setIsSubmitting(true);
    try {
      const project = await createProject({
        workspaceId,
        name: trimmedName,
        description: description.trim() || undefined,
        template,
        engine,
      });
      setName('');
      setDescription('');
      setTemplate('blank');
      setEngine('PDFLATEX');
      onSuccess(project);
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(err.message || 'Failed to create project');
      } else {
        setError('A network error occurred while creating project.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="relative w-full max-w-lg rounded-2xl bg-[#0A1310] border border-[#00D69A]/25 shadow-[0_0_50px_rgba(0,61,48,0.5)] overflow-hidden transition-all text-[#ECFDF5]">
        {/* Header */}
        <div className="h-16 px-6 border-b border-[#00D69A]/15 flex items-center justify-between bg-[#08100D]">
          <div>
            <h2 id="modal-title" className="text-base sm:text-lg font-bold text-white leading-tight">
              Create New Project
            </h2>
            <p className="text-[11px] text-[#94A3B8]">Initialize a new LaTeX document in your workspace</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#94A3B8] hover:text-white rounded-lg hover:bg-[#003D30]/40 transition-colors"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="p-3 text-xs rounded-xl bg-rose-950/40 border border-rose-900/60 text-rose-200">
              {error}
            </div>
          )}

          {/* Project Name */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-white">
              Project Name <span className="text-[#00D69A]">*</span>
            </label>
            <input
              type="text"
              required
              maxLength={160}
              placeholder="e.g., Quantum Computing Notes"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-[#00D69A]/20 bg-[#050807] text-[#ECFDF5] text-sm placeholder:text-[#94A3B8]/40 focus:outline-none focus:border-[#00D69A] focus:ring-1 focus:ring-[#00D69A] transition-colors"
              autoFocus
            />
          </div>

          {/* Workspace selector if multiple */}
          {workspaces.length > 1 && (
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-white">Target Workspace</label>
              <select
                value={workspaceId}
                onChange={(e) => setWorkspaceId(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-[#00D69A]/20 bg-[#050807] text-[#ECFDF5] text-sm focus:outline-none focus:border-[#00D69A] focus:ring-1 focus:ring-[#00D69A]"
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
            <label className="block text-xs font-semibold text-white">Description (Optional)</label>
            <input
              type="text"
              maxLength={1000}
              placeholder="Brief summary of document goals..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-[#00D69A]/20 bg-[#050807] text-[#ECFDF5] text-sm placeholder:text-[#94A3B8]/40 focus:outline-none focus:border-[#00D69A] focus:ring-1 focus:ring-[#00D69A] transition-colors"
            />
          </div>

          {/* Template Selection */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-white">Choose Template</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-48 overflow-y-auto p-0.5">
              {TEMPLATES.map((t) => {
                const Icon = t.icon;
                const isSelected = template === t.id;
                return (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() => setTemplate(t.id)}
                    className={`flex flex-col items-start p-2.5 rounded-xl border text-left transition-all relative cursor-pointer ${
                      isSelected
                        ? 'border-[#00D69A] bg-[#003D30]/70 ring-1 ring-[#00D69A] shadow-[0_0_15px_rgba(0,214,154,0.15)]'
                        : 'border-[#00D69A]/15 hover:border-[#00D69A]/30 bg-[#08120F]'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <Icon className={`h-4 w-4 ${isSelected ? 'text-[#00D69A]' : 'text-[#94A3B8]'}`} />
                      {isSelected && <Check className="h-3.5 w-3.5 text-[#00D69A]" />}
                    </div>
                    <span className="text-xs font-semibold text-white leading-tight">
                      {t.name}
                    </span>
                    <span className="text-[11px] text-[#94A3B8] leading-tight mt-0.5 line-clamp-2">
                      {t.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Engine Selection */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-white">LaTeX Engine</label>
            <div className="grid grid-cols-3 gap-2">
              {(['PDFLATEX', 'XELATEX', 'LUALATEX'] as Engine[]).map((eng) => (
                <button
                  type="button"
                  key={eng}
                  onClick={() => setEngine(eng)}
                  className={`h-9 px-2 text-xs font-medium rounded-lg border text-center transition-all cursor-pointer ${
                    engine === eng
                      ? 'border-[#00D69A] bg-[#003D30] text-[#00D69A] font-semibold ring-1 ring-[#00D69A]'
                      : 'border-[#00D69A]/15 bg-[#08120F] text-[#94A3B8] hover:text-white'
                  }`}
                >
                  {eng === 'PDFLATEX' ? 'pdfLaTeX' : eng === 'XELATEX' ? 'XeLaTeX' : 'LuaLaTeX'}
                </button>
              ))}
            </div>
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#00D69A]/15">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 shadow-[0_0_15px_rgba(0,214,154,0.3)]"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin text-[#050807]" />}
              {isSubmitting ? 'Creating Project...' : 'Create & Open Project'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
