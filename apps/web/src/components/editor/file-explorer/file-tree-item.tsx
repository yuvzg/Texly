'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  ChevronRight,
  ChevronDown,
  MoreVertical,
  Star,
  Edit2,
  Trash2,
  FilePlus,
  FolderPlus,
} from 'lucide-react';
import type { FileTreeNode } from './tree-utils';
import { getFileIcon, validateItemName } from './tree-utils';

interface FileTreeItemProps {
  node: FileTreeNode;
  isExpanded: boolean;
  isActive: boolean;
  isMainFile: boolean;
  onToggleExpand: (folderId: string) => void;
  onOpenFile: (node: FileTreeNode) => void;
  onStartCreate: (parentId: string | null, nodeType: 'FILE' | 'FOLDER') => void;
  onRename: (node: FileTreeNode, newName: string) => Promise<void>;
  onDeleteRequest: (node: FileTreeNode) => void;
  onSetMainDocument: (fileId: string) => void;
  onMoveItem: (sourceFileId: string, targetParentId: string | null) => Promise<void>;
}

export function FileTreeItem({
  node,
  isExpanded,
  isActive,
  isMainFile,
  onToggleExpand,
  onOpenFile,
  onStartCreate,
  onRename,
  onDeleteRequest,
  onSetMainDocument,
  onMoveItem,
}: FileTreeItemProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(node.name);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const isFolder = node.nodeType === 'FOLDER';
  const iconInfo = getFileIcon(node.name, node.nodeType, isExpanded);
  const IconComponent = iconInfo.icon;

  useEffect(() => {
    if (isRenaming) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isRenaming]);

  // Close context menu on outside click
  useEffect(() => {
    if (!isMenuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  const handleItemClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRenaming) return;
    if (isFolder) {
      onToggleExpand(node.id);
    } else {
      onOpenFile(node);
    }
  };

  const handleConfirmRename = async () => {
    const trimmed = renameValue.trim();
    if (trimmed === node.name) {
      setIsRenaming(false);
      setRenameError(null);
      return;
    }

    const validationError = validateItemName(trimmed, node.nodeType);
    if (validationError) {
      setRenameError(validationError);
      return;
    }

    try {
      await onRename(node, trimmed);
      setIsRenaming(false);
      setRenameError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Rename failed';
      setRenameError(msg);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void handleConfirmRename();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsRenaming(false);
      setRenameValue(node.name);
      setRenameError(null);
    }
  };

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ fileId: node.id, path: node.path }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!isFolder) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    if (!isFolder) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json')) as { fileId: string };
      if (data.fileId && data.fileId !== node.id) {
        await onMoveItem(data.fileId, node.id);
      }
    } catch {
      // Invalid drag data
    }
  };

  const paddingLeft = `${node.depth * 14 + 8}px`;

  return (
    <div className="relative group select-none">
      <div
        role="treeitem"
        aria-selected={isActive}
        aria-expanded={isFolder ? isExpanded : undefined}
        draggable={!isRenaming}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={(e) => void handleDrop(e)}
        onClick={handleItemClick}
        style={{ paddingLeft }}
        className={`h-7 pr-2 flex items-center gap-1.5 rounded-md text-xs cursor-pointer transition-colors relative ${
          isActive
            ? 'bg-[#003D30] text-[#00D69A] font-medium border border-[#00D69A]/30 shadow-[0_0_10px_rgba(0,214,154,0.08)]'
            : isDragOver
              ? 'bg-[#00D69A]/20 text-white border border-[#00D69A]'
              : 'hover:bg-gray-100 dark:hover:bg-[#0C1814] text-gray-700 dark:text-gray-300'
        }`}
      >
        {/* Folder expand/collapse chevron */}
        {isFolder ? (
          <span
            className="p-0.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 rounded"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(node.id);
            }}
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </span>
        ) : (
          <span className="w-3.5" />
        )}

        {/* Item Icon */}
        <IconComponent className={`h-3.5 w-3.5 shrink-0 ${iconInfo.colorClass}`} />

        {/* Item Name or Inline Edit Input */}
        {isRenaming ? (
          <div className="flex-1 flex flex-col z-20" onClick={(e) => e.stopPropagation()}>
            <input
              ref={inputRef}
              type="text"
              value={renameValue}
              onChange={(e) => {
                setRenameValue(e.target.value);
                setRenameError(null);
              }}
              onKeyDown={handleKeyDown}
              onBlur={() => void handleConfirmRename()}
              className="w-full h-5 px-1 bg-white dark:bg-[#050807] border border-[#00D69A] rounded text-xs text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-[#00D69A]"
            />
            {renameError && (
              <span className="absolute left-6 top-7 text-[10px] text-rose-500 bg-black/80 px-1 py-0.5 rounded shadow z-30 whitespace-nowrap">
                {renameError}
              </span>
            )}
          </div>
        ) : (
          <span className="truncate flex-1 text-left">{node.name}</span>
        )}

        {/* Main Document Badge */}
        {isMainFile && (
          <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-[#00D69A]/20 text-[#00D69A] border border-[#00D69A]/40 rounded leading-none shrink-0">
            main
          </span>
        )}

        {/* Hover / Actions Button */}
        {!isRenaming && (
          <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsMenuOpen((prev) => !prev);
              }}
              className="p-1 hover:bg-gray-200 dark:hover:bg-[#003D30] rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              title="More actions"
              aria-label={`Actions for ${node.name}`}
            >
              <MoreVertical className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {/* Context Action Menu Dropdown */}
      {isMenuOpen && (
        <div
          ref={menuRef}
          onClick={(e) => e.stopPropagation()}
          className="absolute right-2 top-7 z-30 w-44 bg-white dark:bg-[#0A1310] border border-gray-200 dark:border-[#00D69A]/20 rounded-lg shadow-xl py-1 text-xs text-gray-700 dark:text-gray-200 animate-in fade-in zoom-in-95 duration-100"
        >
          {isFolder ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  onStartCreate(node.id, 'FILE');
                }}
                className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-[#003D30] hover:text-[#00D69A]"
              >
                <FilePlus className="h-3.5 w-3.5" />
                <span>New File Inside</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  onStartCreate(node.id, 'FOLDER');
                }}
                className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-[#003D30] hover:text-[#00D69A]"
              >
                <FolderPlus className="h-3.5 w-3.5" />
                <span>New Folder Inside</span>
              </button>
            </>
          ) : (
            node.name.endsWith('.tex') &&
            !isMainFile && (
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  onSetMainDocument(node.id);
                }}
                className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-[#003D30] text-[#00D69A]"
              >
                <Star className="h-3.5 w-3.5" />
                <span>Set as Main Document</span>
              </button>
            )
          )}

          <button
            type="button"
            onClick={() => {
              setIsMenuOpen(false);
              setIsRenaming(true);
            }}
            className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-[#003D30] hover:text-white"
          >
            <Edit2 className="h-3.5 w-3.5" />
            <span>Rename</span>
          </button>

          <div className="my-1 border-t border-gray-100 dark:border-[#00D69A]/10" />

          <button
            type="button"
            onClick={() => {
              setIsMenuOpen(false);
              onDeleteRequest(node);
            }}
            className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Delete</span>
          </button>
        </div>
      )}
    </div>
  );
}

