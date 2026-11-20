'use client';

import React, { useState } from 'react';
import { X, Layers, Loader2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createWorkspace } from '@/lib/workspaces';
import { ApiClientError } from '@/lib/api-client';
import type { WorkspaceWithRoleDTO } from '@texly/shared';

export interface NewWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onWorkspaceCreated: (workspace: WorkspaceWithRoleDTO) => void;
}

export function NewWorkspaceModal({ isOpen, onClose, onWorkspaceCreated }: NewWorkspaceModalProps) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Workspace name is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const generatedSlug = slug.trim()
        ? slug
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9-]+/g, '-')
        : undefined;

      const created = await createWorkspace({
        name: name.trim(),
        ...(generatedSlug ? { slug: generatedSlug } : {}),
      });

      setName('');
      setSlug('');
      onWorkspaceCreated(created);
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Failed to create workspace. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const previewSlug =
    (slug || name)
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-|-$/g, '') || 'workspace-slug';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#0A1310] border border-[#00D69A]/20 rounded-2xl shadow-[0_0_40px_rgba(0,61,48,0.35)] overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#00D69A]/15 bg-[#003D30]/20">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-[#003D30] text-[#00D69A] flex items-center justify-center border border-[#00D69A]/30">
              <Layers className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base font-heading tracking-tight">
                Create Workspace
              </h3>
              <p className="text-xs text-[#94A3B8]">Organize projects with your team</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#94A3B8] hover:text-white hover:bg-[#003D30]/40 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-800/50 text-xs text-rose-300">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-white">Workspace Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Research Lab, Marketing Team"
              maxLength={100}
              className="w-full px-3.5 py-2.5 text-sm bg-[#050807] border border-[#00D69A]/20 rounded-xl text-white placeholder-[#94A3B8]/40 focus:outline-none focus:border-[#00D69A] focus:ring-1 focus:ring-[#00D69A] transition-all"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-white">
              Workspace URL Slug{' '}
              <span className="text-[10px] text-[#94A3B8] font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="e.g. research-lab"
              maxLength={60}
              className="w-full px-3.5 py-2.5 text-sm bg-[#050807] border border-[#00D69A]/20 rounded-xl text-white placeholder-[#94A3B8]/40 focus:outline-none focus:border-[#00D69A] focus:ring-1 focus:ring-[#00D69A] transition-all font-mono text-xs"
            />
            <p className="text-[11px] text-[#94A3B8]/80 font-mono">
              texly.app/ws/<span className="text-[#00D69A] font-semibold">{previewSlug}</span>
            </p>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-[#00D69A]/10">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || !name.trim()}
              className="flex items-center gap-1.5 shadow-[0_0_15px_rgba(0,214,154,0.25)]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <span>Create Workspace</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
