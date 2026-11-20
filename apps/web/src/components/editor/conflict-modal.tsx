'use client';

import React, { useState } from 'react';
import { AlertCircle, ArrowRightLeft, Check, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DocumentConflictData } from '@/stores/editor.store';

interface ConflictModalProps {
  isOpen: boolean;
  conflict: DocumentConflictData | null;
  onUseServer: () => Promise<void> | void;
  onKeepMine: () => Promise<void> | void;
  onClose: () => void;
}

export function ConflictModal({
  isOpen,
  conflict,
  onUseServer,
  onKeepMine,
  onClose,
}: ConflictModalProps) {
  const [activeTab, setActiveTab] = useState<'side-by-side' | 'mine' | 'server'>('side-by-side');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !conflict) {
    return null;
  }

  const handleUseServer = async () => {
    setIsSubmitting(true);
    try {
      await onUseServer();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeepMine = async () => {
    setIsSubmitting(true);
    try {
      await onKeepMine();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="conflict-dialog-title"
    >
      <div className="relative flex flex-col w-full max-w-4xl max-h-[85vh] rounded-xl border border-[#003D30] bg-[#050807] text-[#e0e0e0] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#003D30]/60 px-6 py-4 bg-[#0a100d]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div>
              <h2 id="conflict-dialog-title" className="text-base font-semibold text-white">
                Document Revision Conflict Detected
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Another session or tab saved Revision {conflict.serverRevision}. Your local draft is based on Revision {conflict.localRevision}.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* View Switcher */}
        <div className="flex items-center justify-between px-6 py-2 border-b border-[#003D30]/40 bg-[#070d0a] text-xs">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('side-by-side')}
              className={`px-3 py-1 rounded-md font-medium transition-colors ${
                activeTab === 'side-by-side'
                  ? 'bg-[#003D30] text-[#00D69A]'
                  : 'text-muted-foreground hover:text-white'
              }`}
            >
              Side-by-Side View
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('mine')}
              className={`px-3 py-1 rounded-md font-medium transition-colors ${
                activeTab === 'mine'
                  ? 'bg-[#003D30] text-[#00D69A]'
                  : 'text-muted-foreground hover:text-white'
              }`}
            >
              Your Local Changes
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('server')}
              className={`px-3 py-1 rounded-md font-medium transition-colors ${
                activeTab === 'server'
                  ? 'bg-[#003D30] text-[#00D69A]'
                  : 'text-muted-foreground hover:text-white'
              }`}
            >
              Server Version (Rev {conflict.serverRevision})
            </button>
          </div>
          <span className="text-muted-foreground">
            Server updated: {conflict.serverUpdatedAt ? new Date(conflict.serverUpdatedAt).toLocaleTimeString() : 'Recently'}
          </span>
        </div>

        {/* Comparison Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeTab === 'side-by-side' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-[350px]">
              {/* Local */}
              <div className="flex flex-col rounded-lg border border-[#003D30] bg-[#070e0b] overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-[#0a1510] border-b border-[#003D30] text-xs font-medium text-amber-400">
                  <span>Your Draft (Local)</span>
                  <span>Rev {conflict.localRevision}</span>
                </div>
                <div className="flex-1 p-3 overflow-auto font-mono text-xs whitespace-pre-wrap text-emerald-100/90 leading-relaxed">
                  {conflict.localContent || '<empty document>'}
                </div>
              </div>

              {/* Server */}
              <div className="flex flex-col rounded-lg border border-[#003D30] bg-[#070e0b] overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-[#0a1510] border-b border-[#003D30] text-xs font-medium text-sky-400">
                  <span>Server Version</span>
                  <span>Rev {conflict.serverRevision}</span>
                </div>
                <div className="flex-1 p-3 overflow-auto font-mono text-xs whitespace-pre-wrap text-blue-100/90 leading-relaxed">
                  {conflict.serverContent || '<empty document>'}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'mine' && (
            <div className="h-[350px] rounded-lg border border-[#003D30] bg-[#070e0b] flex flex-col overflow-hidden">
              <div className="px-3 py-2 bg-[#0a1510] border-b border-[#003D30] text-xs font-medium text-amber-400">
                Your Local Changes (Revision {conflict.localRevision})
              </div>
              <div className="flex-1 p-4 overflow-auto font-mono text-xs whitespace-pre-wrap text-emerald-100/90 leading-relaxed">
                {conflict.localContent}
              </div>
            </div>
          )}

          {activeTab === 'server' && (
            <div className="h-[350px] rounded-lg border border-[#003D30] bg-[#070e0b] flex flex-col overflow-hidden">
              <div className="px-3 py-2 bg-[#0a1510] border-b border-[#003D30] text-xs font-medium text-sky-400">
                Authoritative Server Content (Revision {conflict.serverRevision})
              </div>
              <div className="flex-1 p-4 overflow-auto font-mono text-xs whitespace-pre-wrap text-blue-100/90 leading-relaxed">
                {conflict.serverContent}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-[#003D30]/60 px-6 py-4 bg-[#0a100d]">
          <div className="text-xs text-muted-foreground">
            No edits are overwritten until you select a resolution option.
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleUseServer}
              disabled={isSubmitting}
              className="border-rose-900/50 hover:bg-rose-950/30 text-rose-300 hover:text-rose-200"
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Use Server Version
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleKeepMine}
              disabled={isSubmitting}
              className="bg-[#00D69A] hover:bg-[#00bd87] text-[#050807] font-semibold"
            >
              <Check className="mr-1.5 h-3.5 w-3.5" />
              Keep Mine (Overwrite Server)
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
