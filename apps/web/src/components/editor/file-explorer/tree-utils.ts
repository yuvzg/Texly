import type { ProjectFileDTO } from '@texly/shared';
import {
  FileText,
  Folder,
  FolderOpen,
  BookOpen,
  Palette,
  FileCode,
  Image as ImageIcon,
  File,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface FileTreeNode extends ProjectFileDTO {
  children: FileTreeNode[];
  depth: number;
}

export const ALLOWED_TEXT_EXTENSIONS = [
  '.tex',
  '.bib',
  '.sty',
  '.cls',
  '.bst',
  '.txt',
  '.md',
  '.csv',
];

export const FORBIDDEN_NAME_CHARS_REGEX = /[/\\:*?"<>|\x00-\x1f\x7f]/;

/**
 * Validates a file or directory name segment on the frontend.
 * Returns null if valid, or a descriptive error message if invalid.
 */
export function validateItemName(name: string, nodeType: 'FILE' | 'FOLDER'): string | null {
  if (!name || name.trim() === '') {
    return 'Name cannot be empty';
  }

  if (name.trim() !== name) {
    return 'Name cannot have leading or trailing whitespace';
  }

  if (name.length > 255) {
    return 'Name cannot exceed 255 characters';
  }

  if (FORBIDDEN_NAME_CHARS_REGEX.test(name)) {
    return 'Name contains invalid characters (/ \\ : * ? " < > |)';
  }

  if (name === '.' || name === '..') {
    return 'Name cannot be "." or ".."';
  }

  if (name.startsWith('-')) {
    return 'Name cannot start with a hyphen';
  }

  if (name.endsWith('.')) {
    return 'Name cannot end with a period';
  }

  if (name.startsWith('.') && name !== '.gitkeep') {
    return 'Name cannot start with a period';
  }

  if (nodeType === 'FILE') {
    if (name === '.gitkeep') return null;
    const lastDot = name.lastIndexOf('.');
    if (lastDot === -1 || lastDot === 0) {
      return 'File must have an extension (e.g. .tex, .bib)';
    }
    const ext = name.slice(lastDot).toLowerCase();
    if (!ALLOWED_TEXT_EXTENSIONS.includes(ext)) {
      return `Extension "${ext}" not supported. Allowed: ${ALLOWED_TEXT_EXTENSIONS.join(', ')}`;
    }
  }

  return null;
}

/**
 * Transforms a flat list of ProjectFileDTOs into a hierarchical FileTreeNode tree.
 */
export function buildFileTree(files: ProjectFileDTO[]): FileTreeNode[] {
  const nodesById = new Map<string, FileTreeNode>();
  const rootNodes: FileTreeNode[] = [];

  // 1. Create wrapped nodes
  for (const f of files) {
    nodesById.set(f.id, {
      ...f,
      children: [],
      depth: 0,
    });
  }

  // 2. Build parent-child relationships
  for (const f of files) {
    const node = nodesById.get(f.id)!;
    if (f.parentId && nodesById.has(f.parentId)) {
      nodesById.get(f.parentId)!.children.push(node);
    } else {
      rootNodes.push(node);
    }
  }

  // 3. Sort children at each level (folders first, then alphabetically) and compute depths
  function sortAndAssignDepth(nodes: FileTreeNode[], depth: number) {
    nodes.sort((a, b) => {
      // Folders first
      if (a.nodeType === 'FOLDER' && b.nodeType !== 'FOLDER') return -1;
      if (a.nodeType !== 'FOLDER' && b.nodeType === 'FOLDER') return 1;
      // Then alphabetical
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
    });

    for (const node of nodes) {
      node.depth = depth;
      if (node.children.length > 0) {
        sortAndAssignDepth(node.children, depth + 1);
      }
    }
  }

  sortAndAssignDepth(rootNodes, 0);
  return rootNodes;
}

/**
 * Collects all file and folder IDs in a subtree starting from the given node.
 */
export function collectSubtreeIds(node: FileTreeNode): string[] {
  const ids: string[] = [node.id];
  for (const child of node.children) {
    ids.push(...collectSubtreeIds(child));
  }
  return ids;
}

export interface FileIconMeta {
  icon: LucideIcon;
  colorClass: string;
}

/**
 * Returns the appropriate Lucide icon and theme styling for a file or directory.
 */
export function getFileIcon(
  name: string,
  nodeType: 'FILE' | 'FOLDER',
  isOpenFolder = false,
): FileIconMeta {
  if (nodeType === 'FOLDER') {
    return {
      icon: isOpenFolder ? FolderOpen : Folder,
      colorClass: 'text-amber-400 dark:text-emerald-400',
    };
  }

  const lastDot = name.lastIndexOf('.');
  const ext = lastDot !== -1 ? name.slice(lastDot).toLowerCase() : '';

  switch (ext) {
    case '.tex':
      return { icon: FileCode, colorClass: 'text-[#00D69A]' };
    case '.bib':
      return { icon: BookOpen, colorClass: 'text-cyan-400' };
    case '.sty':
    case '.cls':
      return { icon: Palette, colorClass: 'text-purple-400' };
    case '.md':
    case '.txt':
      return { icon: FileText, colorClass: 'text-emerald-300' };
    case '.png':
    case '.jpg':
    case '.jpeg':
    case '.gif':
    case '.svg':
      return { icon: ImageIcon, colorClass: 'text-blue-400' };
    default:
      return { icon: File, colorClass: 'text-zinc-400' };
  }
}

