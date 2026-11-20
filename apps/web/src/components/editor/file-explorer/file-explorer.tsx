'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Files,
  FilePlus,
  FolderPlus,
  RotateCw,
  Search,
  ChevronsUpDown,
  AlertCircle,
  Loader2,
  Folder,
  FileCode,
} from 'lucide-react';
import type { ProjectFileDTO } from '@texly/shared';
import {
  useProjectFiles,
  useCreateFile,
  useUpdateFile,
  useDeleteFile,
  useSetMainFile,
} from '@/hooks/use-files';
import { useEditorStore } from '@/stores/editor.store';
import {
  buildFileTree,
  validateItemName,
  collectSubtreeIds,
  type FileTreeNode,
} from './tree-utils';
import { FileTreeItem } from './file-tree-item';
import { DeleteFileModal } from './delete-file-modal';

interface FileExplorerProps {
  projectId: string;
  className?: string;
  onFileSelect?: (file: ProjectFileDTO) => void;
}

interface InlineCreationState {
  parentId: string | null;
  nodeType: 'FILE' | 'FOLDER';
}

export function FileExplorer({ projectId, className = '', onFileSelect }: FileExplorerProps) {
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useProjectFiles(projectId);

  const createFileMutation = useCreateFile(projectId);
  const updateFileMutation = useUpdateFile(projectId);
  const deleteFileMutation = useDeleteFile(projectId);
  const setMainFileMutation = useSetMainFile(projectId);

  const openTab = useEditorStore((state) => state.openTab);
  const activeFileId = useEditorStore((state) => state.activeFileId);

  // Expanded folders state
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [creationState, setCreationState] = useState<InlineCreationState | null>(null);
  const [creationName, setCreationName] = useState('');
  const [creationError, setCreationError] = useState<string | null>(null);

  // Deletion modal state
  const [deleteTargetNode, setDeleteTargetNode] = useState<FileTreeNode | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // Root drop target highlight
  const [isRootDragOver, setIsRootDragOver] = useState(false);

  const creationInputRef = useRef<HTMLInputElement>(null);
  const hasAutoExpandedRef = useRef(false);

  const files = data?.files ?? [];
  const mainFileId = data?.mainFileId ?? null;

  // Auto-expand all folders on initial load once
  useEffect(() => {
    if (!hasAutoExpandedRef.current && files.length > 0) {
      hasAutoExpandedRef.current = true;
      const folderIds = files.filter((f) => f.nodeType === 'FOLDER').map((f) => f.id);
      if (folderIds.length > 0) {
        setExpandedFolders(new Set(folderIds));
      }
    }
  }, [files]);

  // Focus inline creation input
  useEffect(() => {
    if (creationState) {
      creationInputRef.current?.focus();
      creationInputRef.current?.select();
    }
  }, [creationState]);

  // Build hierarchical tree
  const treeNodes = useMemo(() => {
    return buildFileTree(files);
  }, [files]);

  // Toggle folder expansion
  const toggleFolder = useCallback((folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }, []);

  // Expand / collapse all
  const toggleAllFolders = () => {
    const allFolderIds = files.filter((f) => f.nodeType === 'FOLDER').map((f) => f.id);
    if (expandedFolders.size === allFolderIds.length) {
      setExpandedFolders(new Set());
    } else {
      setExpandedFolders(new Set(allFolderIds));
    }
  };

  // Open file handler
  const handleOpenFile = useCallback(
    (node: FileTreeNode) => {
      openTab({
        fileId: node.id,
        documentId: node.documentId,
        path: node.path,
        name: node.name,
      });
      onFileSelect?.(node);
    },
    [openTab, onFileSelect],
  );

  // Start inline creation
  const handleStartCreate = (parentId: string | null, nodeType: 'FILE' | 'FOLDER') => {
    if (parentId) {
      setExpandedFolders((prev) => new Set(prev).add(parentId));
    }
    setCreationState({ parentId, nodeType });
    setCreationName(nodeType === 'FILE' ? 'document.tex' : 'folder');
    setCreationError(null);
  };

  // Confirm inline creation
  const handleConfirmCreate = async () => {
    if (!creationState) return;

    const trimmed = creationName.trim();
    const validationError = validateItemName(trimmed, creationState.nodeType);
    if (validationError) {
      setCreationError(validationError);
      return;
    }

    try {
      const created = await createFileMutation.mutateAsync({
        nodeType: creationState.nodeType,
        parentId: creationState.parentId,
        name: trimmed,
        ...(creationState.nodeType === 'FILE'
          ? { content: '% Document content\n\\documentclass{article}\n\\begin{document}\n\n\\end{document}\n' }
          : {}),
      });

      if (created.nodeType === 'FOLDER') {
        setExpandedFolders((prev) => new Set(prev).add(created.id));
      }

      setCreationState(null);
      setCreationName('');
      setCreationError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Creation failed';
      setCreationError(msg);
    }
  };

  // Handle creation keyboard navigation
  const handleCreationKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void handleConfirmCreate();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setCreationState(null);
      setCreationName('');
      setCreationError(null);
    }
  };

  // Rename file or folder
  const handleRename = async (node: FileTreeNode, newName: string) => {
    await updateFileMutation.mutateAsync({
      fileId: node.id,
      data: { name: newName },
    });
  };

  // Move item between folders
  const handleMoveItem = async (sourceFileId: string, targetParentId: string | null) => {
    const source = files.find((f) => f.id === sourceFileId);
    if (!source || source.parentId === targetParentId) return;

    if (targetParentId) {
      setExpandedFolders((prev) => new Set(prev).add(targetParentId));
    }

    await updateFileMutation.mutateAsync({
      fileId: sourceFileId,
      data: { parentId: targetParentId },
    });
  };

  // Delete handlers
  const handleDeleteRequest = (node: FileTreeNode) => {
    setDeleteTargetNode(node);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargetNode) return;
    const subtreeIds = collectSubtreeIds(deleteTargetNode);

    await deleteFileMutation.mutateAsync({
      fileId: deleteTargetNode.id,
      subtreeIds,
    });

    setIsDeleteModalOpen(false);
    setDeleteTargetNode(null);
  };

  // Set as main document
  const handleSetMainDocument = async (fileId: string) => {
    await setMainFileMutation.mutateAsync(fileId);
  };

  // Filter tree nodes if search query is active
  const filteredTreeNodes = useMemo(() => {
    if (!searchQuery.trim()) return treeNodes;
    const q = searchQuery.toLowerCase();

    function filterNode(node: FileTreeNode): FileTreeNode | null {
      const nameMatches = node.name.toLowerCase().includes(q);
      const filteredChildren = node.children
        .map((child) => filterNode(child))
        .filter((child): child is FileTreeNode => child !== null);

      if (nameMatches || filteredChildren.length > 0) {
        return {
          ...node,
          children: filteredChildren,
        };
      }
      return null;
    }

    return treeNodes
      .map((node) => filterNode(node))
      .filter((node): node is FileTreeNode => node !== null);
  }, [treeNodes, searchQuery]);

  // Recursively render tree nodes
  const renderNodes = (nodes: FileTreeNode[]) => {
    return nodes.map((node) => {
      const isFolder = node.nodeType === 'FOLDER';
      const isExpanded = expandedFolders.has(node.id) || searchQuery.trim() !== '';
      const isMainFile = node.id === mainFileId;
      const isActive = node.id === activeFileId;

      return (
        <React.Fragment key={node.id}>
          <FileTreeItem
            node={node}
            isExpanded={isExpanded}
            isActive={isActive}
            isMainFile={isMainFile}
            onToggleExpand={toggleFolder}
            onOpenFile={handleOpenFile}
            onStartCreate={handleStartCreate}
            onRename={handleRename}
            onDeleteRequest={handleDeleteRequest}
            onSetMainDocument={handleSetMainDocument}
            onMoveItem={handleMoveItem}
          />

          {/* Children if expanded */}
          {isFolder && isExpanded && (
            <div>
              {/* If inline creation is active inside this folder */}
              {creationState && creationState.parentId === node.id && (
                <div
                  style={{ paddingLeft: `${(node.depth + 1) * 14 + 8}px` }}
                  className="h-7 pr-2 flex items-center gap-1.5 text-xs relative"
                >
                  <span className="w-3.5" />
                  {creationState.nodeType === 'FOLDER' ? (
                    <Folder className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  ) : (
                    <FileCode className="h-3.5 w-3.5 text-[#00D69A] shrink-0" />
                  )}
                  <div className="flex-1 flex flex-col z-20">
                    <input
                      ref={creationInputRef}
                      type="text"
                      value={creationName}
                      onChange={(e) => {
                        setCreationName(e.target.value);
                        setCreationError(null);
                      }}
                      onKeyDown={handleCreationKeyDown}
                      onBlur={() => void handleConfirmCreate()}
                      className="w-full h-5 px-1 bg-white dark:bg-[#050807] border border-[#00D69A] rounded text-xs text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-[#00D69A]"
                    />
                    {creationError && (
                      <span className="absolute left-6 top-7 text-[10px] text-rose-500 bg-black/80 px-1 py-0.5 rounded shadow z-30 whitespace-nowrap">
                        {creationError}
                      </span>
                    )}
                  </div>
                </div>
              )}
              {renderNodes(node.children)}
            </div>
          )}
        </React.Fragment>
      );
    });
  };

  const isMainOrContainsMain = useMemo(() => {
    if (!deleteTargetNode || !mainFileId) return false;
    const subtreeIds = collectSubtreeIds(deleteTargetNode);
    return subtreeIds.includes(mainFileId);
  }, [deleteTargetNode, mainFileId]);

  return (
    <div
      className={`flex flex-col h-full bg-white dark:bg-[#0A1310] border-r border-gray-200 dark:border-[#00D69A]/15 select-none ${className}`}
    >
      {/* Explorer Header */}
      <div className="p-2.5 border-b border-gray-200 dark:border-[#00D69A]/15 flex items-center justify-between bg-gray-50 dark:bg-[#050807]/50 shrink-0">
        <span className="flex items-center gap-2 font-semibold text-xs text-gray-700 dark:text-gray-200 uppercase tracking-wider">
          <Files className="h-4 w-4 text-[#00D69A]" /> Project Files
        </span>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => handleStartCreate(null, 'FILE')}
            className="p-1 hover:bg-gray-200 dark:hover:bg-[#003D30] rounded text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-[#00D69A] transition-colors"
            title="New File in Root"
            aria-label="New file"
          >
            <FilePlus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleStartCreate(null, 'FOLDER')}
            className="p-1 hover:bg-gray-200 dark:hover:bg-[#003D30] rounded text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-[#00D69A] transition-colors"
            title="New Folder in Root"
            aria-label="New folder"
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={toggleAllFolders}
            className="p-1 hover:bg-gray-200 dark:hover:bg-[#003D30] rounded text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-[#00D69A] transition-colors"
            title={expandedFolders.size > 0 ? 'Collapse All' : 'Expand All'}
            aria-label="Toggle all folders"
          >
            <ChevronsUpDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="p-1 hover:bg-gray-200 dark:hover:bg-[#003D30] rounded text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-[#00D69A] transition-colors"
            title="Refresh Files"
            aria-label="Refresh files"
          >
            <RotateCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Quick Search / Filter Input */}
      <div className="px-2 py-1.5 border-b border-gray-100 dark:border-[#00D69A]/10 bg-white dark:bg-[#08100D] shrink-0">
        <div className="relative flex items-center">
          <Search className="absolute left-2 h-3.5 w-3.5 text-gray-400 dark:text-gray-500 pointer-events-none" />
          <input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-6 pl-7 pr-2 bg-gray-50 dark:bg-[#050807] border border-gray-200 dark:border-[#00D69A]/20 rounded text-xs text-gray-800 dark:text-gray-200 placeholder-gray-400 outline-none focus:border-[#00D69A] transition-colors"
          />
        </div>
      </div>

      {/* Tree Content Area */}
      <div
        role="tree"
        aria-label="Project files"
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setIsRootDragOver(true);
        }}
        onDragLeave={() => setIsRootDragOver(false)}
        onDrop={async (e) => {
          e.preventDefault();
          setIsRootDragOver(false);
          try {
            const dragData = JSON.parse(e.dataTransfer.getData('application/json')) as { fileId: string };
            if (dragData.fileId) {
              await handleMoveItem(dragData.fileId, null);
            }
          } catch {
            // Invalid drop
          }
        }}
        className={`flex-1 p-1 overflow-y-auto overflow-x-hidden space-y-0.5 transition-colors ${
          isRootDragOver ? 'bg-[#00D69A]/5 ring-1 ring-inset ring-[#00D69A]/30' : ''
        }`}
      >
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-xs text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin text-[#00D69A]" />
            <span>Loading file tree...</span>
          </div>
        ) : isError ? (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/30 rounded-lg text-xs text-rose-600 dark:text-rose-400 space-y-2">
            <div className="flex items-center gap-1.5 font-medium">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>Failed to load files</span>
            </div>
            <p className="text-[11px] opacity-80">{error?.message || 'Network error'}</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-[11px] font-medium"
            >
              Retry
            </button>
          </div>
        ) : files.length === 0 && !creationState ? (
          <div className="flex flex-col items-center justify-center h-48 px-4 text-center text-xs text-gray-400 dark:text-gray-500 gap-3">
            <Files className="h-8 w-8 text-gray-300 dark:text-gray-600" />
            <span>This project has no files yet.</span>
            <button
              type="button"
              onClick={() => handleStartCreate(null, 'FILE')}
              className="px-3 py-1.5 bg-[#003D30] hover:bg-[#004D3D] text-[#00D69A] border border-[#00D69A]/30 rounded-lg font-medium transition-colors"
            >
              Create File
            </button>
          </div>
        ) : (
          <>
            {/* Root inline creation row */}
            {creationState && creationState.parentId === null && (
              <div
                style={{ paddingLeft: '8px' }}
                className="h-7 pr-2 flex items-center gap-1.5 text-xs relative"
              >
                <span className="w-3.5" />
                {creationState.nodeType === 'FOLDER' ? (
                  <Folder className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                ) : (
                  <FileCode className="h-3.5 w-3.5 text-[#00D69A] shrink-0" />
                )}
                <div className="flex-1 flex flex-col z-20">
                  <input
                    ref={creationInputRef}
                    type="text"
                    value={creationName}
                    onChange={(e) => {
                      setCreationName(e.target.value);
                      setCreationError(null);
                    }}
                    onKeyDown={handleCreationKeyDown}
                    onBlur={() => void handleConfirmCreate()}
                    className="w-full h-5 px-1 bg-white dark:bg-[#050807] border border-[#00D69A] rounded text-xs text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-[#00D69A]"
                  />
                  {creationError && (
                    <span className="absolute left-6 top-7 text-[10px] text-rose-500 bg-black/80 px-1 py-0.5 rounded shadow z-30 whitespace-nowrap">
                      {creationError}
                    </span>
                  )}
                </div>
              </div>
            )}

            {renderNodes(filteredTreeNodes)}
          </>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <DeleteFileModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setDeleteTargetNode(null);
        }}
        onConfirm={handleConfirmDelete}
        node={deleteTargetNode}
        isMainFile={deleteTargetNode?.id === mainFileId}
        containsMainFile={isMainOrContainsMain}
        isDeleting={deleteFileMutation.isPending}
      />
    </div>
  );
}

