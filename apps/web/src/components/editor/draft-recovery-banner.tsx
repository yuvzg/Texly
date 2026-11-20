'use client';

import React from 'react';
import { History, Check, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DocumentDraft } from '@/lib/draft-storage';

interface DraftRecoveryBannerProps {
  draft: DocumentDraft | null;
  onRestore: () => void;
  onDiscard: () => void;
}

export function DraftRecoveryBanner({
  draft,
  onRestore,
  onDiscard,
}: DraftRecoveryBannerProps) {
  if (!draft) return null;

  const dateStr = draft.updatedAt
    ? new Date(draft.updatedAt).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'a previous session';

  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-2.5 bg-[#003D30]/40 border-b border-[#003D30] text-xs text-emerald-200 animate-in fade-in slide-in-from-top-1"
      data-testid="draft-recovery-banner"
    >
      <div className="flex items-center gap-2">
        <div className="p-1 rounded bg-[#00D69A]/20 text-[#00D69A]">
          <History className="h-4 w-4" />
        </div>
        <span>
          <strong className="text-white font-medium">Unsaved local draft detected</strong> from {dateStr} (Revision {draft.baseRevision}).
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onDiscard}
          className="h-7 px-2.5 text-xs border-[#003D30] text-muted-foreground hover:text-rose-400 hover:bg-rose-950/20"
        >
          <Trash2 className="mr-1 h-3 w-3" />
          Discard
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={onRestore}
          className="h-7 px-3 text-xs bg-[#00D69A] hover:bg-[#00bd87] text-[#050807] font-semibold"
        >
          <Check className="mr-1 h-3 w-3" />
          Restore Draft
        </Button>
      </div>
    </div>
  );
}

