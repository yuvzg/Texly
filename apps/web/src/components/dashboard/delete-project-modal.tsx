'use client';

import React, { useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { deleteProject } from '@/lib/projects';
import { ApiClientError } from '@/lib/api-client';
import type { ProjectDTO } from '@texly/shared';

export interface DeleteProjectModalProps {
  project: ProjectDTO | null;
  isOpen: boolean;
  onClose: () => void;
  onDeleted: (projectId: string) => void;
}

export function DeleteProjectModal({
  project,
  isOpen,
  onClose,
  onDeleted,
}: DeleteProjectModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !project) return null;

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);

    try {
      await deleteProject(project.id);
      onDeleted(project.id);
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Failed to delete project. Please try again.');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#0A1310] border border-rose-900/40 rounded-2xl shadow-[0_0_40px_rgba(225,29,72,0.15)] overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-rose-900/30 bg-rose-950/20">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-rose-950/60 text-rose-400 flex items-center justify-center border border-rose-800/40">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base font-heading">Delete Project</h3>
              <p className="text-xs text-[#94A3B8]">Confirm project deletion</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#94A3B8] hover:text-white hover:bg-rose-950/40 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-800/50 text-xs text-rose-300">
              {error}
            </div>
          )}

          <p className="text-sm text-[#94A3B8] leading-relaxed">
            Are you sure you want to delete <span className="font-semibold text-white">"{project.name}"</span>?
            This will move the project and its LaTeX documents to trash.
          </p>

          <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-[#00D69A]/10">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex items-center gap-1.5"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Deleting...</span>
                </>
              ) : (
                <span>Delete Project</span>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

