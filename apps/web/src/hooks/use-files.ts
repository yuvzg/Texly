import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  CreateFileRequest,
  UpdateFileRequest,
  FileListResponseData,
  ProjectFileDTO,
  DocumentDTO,
} from '@texly/shared';
import {
  fetchFiles,
  createFile,
  updateFile,
  deleteFile,
  setMainFile,
  fetchFile,
} from '@/lib/files';
import { fetchDocument } from '@/lib/documents';
import { useEditorStore } from '@/stores/editor.store';

export const FILE_QUERY_KEYS = {
  all: (projectId: string) => ['project-files', projectId] as const,
  file: (projectId: string, fileId: string) => ['project-file', projectId, fileId] as const,
  document: (projectId: string, documentId: string) => ['document', projectId, documentId] as const,
};

/**
 * Hook to retrieve the project's file list and tree metadata.
 */
export function useProjectFiles(projectId: string) {
  return useQuery<FileListResponseData, Error>({
    queryKey: FILE_QUERY_KEYS.all(projectId),
    queryFn: () => fetchFiles(projectId),
    enabled: Boolean(projectId),
    staleTime: 5000,
  });
}

/**
 * Hook to retrieve a single file's metadata.
 */
export function useFile(projectId: string, fileId: string | null) {
  return useQuery<ProjectFileDTO, Error>({
    queryKey: FILE_QUERY_KEYS.file(projectId, fileId ?? ''),
    queryFn: () => fetchFile(projectId, fileId!),
    enabled: Boolean(projectId && fileId),
  });
}

/**
 * Hook to fetch text document content by documentId.
 */
export function useDocument(projectId: string, documentId: string | null | undefined) {
  return useQuery<DocumentDTO, Error>({
    queryKey: FILE_QUERY_KEYS.document(projectId, documentId ?? ''),
    queryFn: () => fetchDocument(projectId, documentId!),
    enabled: Boolean(projectId && documentId),
    staleTime: 10000,
  });
}

/**
 * Hook to create a new file or directory.
 */
export function useCreateFile(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation<ProjectFileDTO, Error, CreateFileRequest>({
    mutationFn: (data: CreateFileRequest) => createFile(projectId, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: FILE_QUERY_KEYS.all(projectId) });
    },
  });
}

/**
 * Hook to rename or move a file or directory.
 */
export function useUpdateFile(projectId: string) {
  const queryClient = useQueryClient();
  const updateTabPath = useEditorStore((state) => state.updateTabPath);

  return useMutation<
    ProjectFileDTO & { affected?: Array<{ id: string; path: string }> },
    Error,
    { fileId: string; data: UpdateFileRequest }
  >({
    mutationFn: ({ fileId, data }) => updateFile(projectId, fileId, data),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: FILE_QUERY_KEYS.all(projectId) });
      updateTabPath(result.id, result.path, result.name);

      // Also update any affected descendant tabs if present
      if (result.affected && result.affected.length > 0) {
        for (const item of result.affected) {
          const name = item.path.split('/').pop() || '';
          updateTabPath(item.id, item.path, name);
        }
      }
    },
  });
}

/**
 * Hook to soft-delete a file or directory tree.
 */
export function useDeleteFile(projectId: string) {
  const queryClient = useQueryClient();
  const closeTab = useEditorStore((state) => state.closeTab);

  return useMutation<void, Error, { fileId: string; subtreeIds?: string[] }>({
    mutationFn: ({ fileId }) => deleteFile(projectId, fileId),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: FILE_QUERY_KEYS.all(projectId) });
      void queryClient.invalidateQueries({ queryKey: ['project', projectId] });

      if (variables.subtreeIds && variables.subtreeIds.length > 0) {
        for (const id of variables.subtreeIds) {
          closeTab(id);
        }
      } else {
        closeTab(variables.fileId);
      }
    },
  });
}

/**
 * Hook to set the project's main compilation document.
 */
export function useSetMainFile(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean }, Error, string>({
    mutationFn: (fileId: string) => setMainFile(projectId, fileId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: FILE_QUERY_KEYS.all(projectId) });
      void queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
  });
}

