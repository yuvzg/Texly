'use client';

import React from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { FileTreeNode } from './tree-utils';

interface DeleteFileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  node: FileTreeNode | null;
  isMainFile: boolean;
  containsMainFile: boolean;
  isDeleting: boolean;
}

export function DeleteFileModal({
  isOpen,
  onClose,
  onConfirm,
  node,
  isMainFile,
  containsMainFile,
  isDeleting,
}: DeleteFileModalProps) {
  if (!isOpen || !node) return null;

  const isFolder = node.nodeType === 'FOLDER';
  const childCount = node.children.length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-file-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div className="relative w-full max-w-md bg-white dark:bg-[#0A1310] border border-gray-200 dark:border-[#00D69A]/20 rounded-xl shadow-2xl p-6 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-[#00D69A]/10">
          <div className="flex items-center gap-2.5 text-rose-500 dark:text-rose-400 font-semibold text-base">
            <Trash2 className="h-5 w-5" />
            <span id="delete-file-title">
              Delete {isFolder ? 'Folder' : 'File'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg transition-colors"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="py-4 space-y-3">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Are you sure you want to delete{' '}
            <strong className="text-gray-900 dark:text-white font-mono">{node.name}</strong>?
          </p>

          {isFolder && childCount > 0 && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
              <span>
                This folder contains <strong>{childCount} item{childCount > 1 ? 's' : ''}</strong>.
                Deleting it will also delete all files and subdirectories inside it.
              </span>
            </div>
          )}

          {(isMainFile || containsMainFile) && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500 mt-0.5" />
              <span>
                <strong>Warning:</strong> {isMainFile ? 'This file' : 'This folder'} is or contains the
                project&apos;s <strong>main compilation document</strong>. Deleting it will clear the main document setting.
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100 dark:border-[#00D69A]/10">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isDeleting}
            className="text-xs"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={isDeleting}
            className="text-xs flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white"
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </div>
    </div>
  );
}

