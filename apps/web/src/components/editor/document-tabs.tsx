'use client';

import React, { useState, useRef, useEffect } from 'react';
import { X, MoreVertical, Star, AlertTriangle } from 'lucide-react';
import { useEditorStore, type DocumentTab } from '@/stores/editor.store';
import { getFileIcon } from './file-explorer/tree-utils';

interface DocumentTabsProps {
  mainFileId?: string | null | undefined;
  onSetMainFile?: ((fileId: string) => Promise<void>) | undefined;
  className?: string | undefined;
}

export function DocumentTabs({
  mainFileId,
  onSetMainFile,
  className = '',
}: DocumentTabsProps) {
  const tabs = useEditorStore((state) => state.tabs);
  const activeFileId = useEditorStore((state) => state.activeFileId);
  const cachedStates = useEditorStore((state) => state.cachedStates);

  const setActiveTab = useEditorStore((state) => state.setActiveTab);
  const closeTab = useEditorStore((state) => state.closeTab);
  const closeOtherTabs = useEditorStore((state) => state.closeOtherTabs);
  const closeAllTabs = useEditorStore((state) => state.closeAllTabs);

  // Tab context menu state
  const [contextMenuTab, setContextMenuTab] = useState<DocumentTab | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);

  // Unsaved close warning modal state
  const [pendingCloseFileId, setPendingCloseFileId] = useState<string | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);

  // Close context menu on outside click
  useEffect(() => {
    if (!menuPosition) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuPosition(null);
        setContextMenuTab(null);
      }
    }
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [menuPosition]);

  if (tabs.length === 0) {
    return null;
  }

  const handleTabClick = (fileId: string) => {
    setActiveTab(fileId);
  };

  const handleTabClose = (e: React.MouseEvent, fileId: string) => {
    e.stopPropagation();
    const isDirty = cachedStates[fileId]?.isDirty;

    if (isDirty) {
      // Guard against accidental loss of locally modified content
      setPendingCloseFileId(fileId);
      return;
    }

    closeTab(fileId);
  };

  const handleMouseDown = (e: React.MouseEvent, fileId: string) => {
    // Middle click (button === 1) closes the tab
    if (e.button === 1) {
      e.preventDefault();
      handleTabClose(e, fileId);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, tab: DocumentTab) => {
    e.preventDefault();
    setContextMenuTab(tab);
    setMenuPosition({ x: e.clientX, y: e.clientY });
  };

  const confirmDiscardAndClose = () => {
    if (pendingCloseFileId) {
      closeTab(pendingCloseFileId);
      setPendingCloseFileId(null);
    }
  };

  return (
    <div
      role="tablist"
      aria-label="Open documents"
      className={`h-9 bg-[#08100D] border-b border-[#003D30]/30 flex items-center overflow-x-auto overflow-y-hidden px-1 text-xs select-none scrollbar-none ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = tab.fileId === activeFileId;
        const isMain = tab.fileId === mainFileId;
        const isDirty = Boolean(cachedStates[tab.fileId]?.isDirty);
        const iconInfo = getFileIcon(tab.name, 'FILE');
        const IconComponent = iconInfo.icon;

        return (
          <div
            key={tab.fileId}
            role="tab"
            aria-selected={isActive}
            tabIndex={0}
            onClick={() => handleTabClick(tab.fileId)}
            onMouseDown={(e) => handleMouseDown(e, tab.fileId)}
            onContextMenu={(e) => handleContextMenu(e, tab)}
            className={`group h-8 px-3 max-w-[200px] flex items-center gap-2 border-r border-[#003D30]/20 cursor-pointer transition-colors relative shrink-0 ${
              isActive
                ? 'bg-[#050807] text-[#00D69A] font-medium border-t-2 border-t-[#00D69A] shadow-[inset_0_1px_0_rgba(0,214,154,0.2)]'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#0A1410]'
            }`}
          >
            {/* File Icon */}
            <IconComponent className={`h-3.5 w-3.5 shrink-0 ${iconInfo.colorClass}`} />

            {/* Tab Title */}
            <span className="truncate flex-1 text-xs">{tab.name}</span>

            {/* Main File Indicator */}
            {isMain && (
              <span className="px-1 py-0.2 text-[8px] font-bold bg-[#00D69A]/20 text-[#00D69A] border border-[#00D69A]/30 rounded shrink-0 leading-tight">
                main
              </span>
            )}

            {/* Dirty / Unsaved Indicator Dot */}
            {isDirty && (
              <span
                title="Unsaved changes"
                className="h-1.5 w-1.5 rounded-full bg-[#00D69A] shadow-[0_0_6px_#00D69A] shrink-0"
              />
            )}

            {/* Close Button */}
            <button
              type="button"
              onClick={(e) => handleTabClose(e, tab.fileId)}
              className="p-0.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 opacity-60 group-hover:opacity-100 transition-opacity shrink-0"
              aria-label={`Close tab ${tab.name}`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}

      {/* Tab Context Menu */}
      {menuPosition && contextMenuTab && (
        <div
          ref={menuRef}
          style={{ top: menuPosition.y, left: menuPosition.x }}
          className="fixed z-50 w-44 bg-[#0A1310] border border-[#00D69A]/20 rounded-lg shadow-2xl py-1 text-xs text-zinc-200 animate-in fade-in duration-100"
        >
          <button
            type="button"
            onClick={() => {
              closeTab(contextMenuTab.fileId);
              setMenuPosition(null);
            }}
            className="w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-[#003D30] hover:text-white"
          >
            <span>Close Tab</span>
            <span className="text-[10px] text-zinc-500">Ctrl+W</span>
          </button>
          <button
            type="button"
            onClick={() => {
              closeOtherTabs(contextMenuTab.fileId);
              setMenuPosition(null);
            }}
            className="w-full px-3 py-1.5 text-left hover:bg-[#003D30] hover:text-white"
          >
            Close Others
          </button>
          <button
            type="button"
            onClick={() => {
              closeAllTabs();
              setMenuPosition(null);
            }}
            className="w-full px-3 py-1.5 text-left hover:bg-[#003D30] hover:text-white"
          >
            Close All
          </button>

          {contextMenuTab.name.endsWith('.tex') &&
            contextMenuTab.fileId !== mainFileId &&
            onSetMainFile && (
              <>
                <div className="my-1 border-t border-[#00D69A]/10" />
                <button
                  type="button"
                  onClick={async () => {
                    await onSetMainFile(contextMenuTab.fileId);
                    setMenuPosition(null);
                  }}
                  className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-[#003D30] text-[#00D69A]"
                >
                  <Star className="h-3 w-3" />
                  <span>Set as Main Document</span>
                </button>
              </>
            )}
        </div>
      )}

      {/* Unsaved Changes Close Warning Modal */}
      {pendingCloseFileId && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div className="w-full max-w-sm bg-[#0A1310] border border-amber-500/30 rounded-xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center gap-2.5 text-amber-400 font-semibold text-sm">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <span>Unsaved Changes</span>
            </div>
            <p className="text-xs text-zinc-300">
              This document has unsaved modifications. Closing this tab will discard any uncommitted edits.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#003D30]/40">
              <button
                type="button"
                onClick={() => setPendingCloseFileId(null)}
                className="px-3 py-1.5 text-xs text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-md transition-colors"
              >
                Keep Open
              </button>
              <button
                type="button"
                onClick={confirmDiscardAndClose}
                className="px-3 py-1.5 text-xs bg-rose-600 hover:bg-rose-700 text-white font-medium rounded-md transition-colors"
              >
                Discard & Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
