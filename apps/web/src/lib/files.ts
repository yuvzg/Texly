import { apiClient } from './api-client';
import type {
  ProjectFileDTO,
  CreateFileRequest,
  UpdateFileRequest,
  FileListResponseData,
} from '@texly/shared';

/**
 * Retrieves the project file tree and main file ID.
 */
export async function fetchFiles(projectId: string): Promise<FileListResponseData> {
  return apiClient.get<FileListResponseData>(`/projects/${projectId}/files`);
}

/**
 * Retrieves metadata for a single file or directory.
 */
export async function fetchFile(projectId: string, fileId: string): Promise<ProjectFileDTO> {
  return apiClient.get<ProjectFileDTO>(`/projects/${projectId}/files/${fileId}`);
}

/**
 * Creates a new folder or text file in the project.
 */
export async function createFile(
  projectId: string,
  data: CreateFileRequest,
): Promise<ProjectFileDTO> {
  return apiClient.post<ProjectFileDTO>(`/projects/${projectId}/files`, data);
}

/**
 * Renames or moves a file or folder.
 */
export async function updateFile(
  projectId: string,
  fileId: string,
  data: UpdateFileRequest,
): Promise<ProjectFileDTO & { affected?: Array<{ id: string; path: string }> }> {
  return apiClient.patch<ProjectFileDTO & { affected?: Array<{ id: string; path: string }> }>(
    `/projects/${projectId}/files/${fileId}`,
    data,
  );
}

/**
 * Soft-deletes a file or directory tree.
 */
export async function deleteFile(projectId: string, fileId: string): Promise<void> {
  return apiClient.delete<void>(`/projects/${projectId}/files/${fileId}`);
}

/**
 * Sets an active .tex file as the project's main compilation document.
 */
export async function setMainFile(
  projectId: string,
  fileId: string,
): Promise<{ success: boolean }> {
  return apiClient.post<{ success: boolean }>(`/projects/${projectId}/files/${fileId}/set-main`, {});
}

/**
 * Restores a soft-deleted file or folder.
 */
export async function restoreFile(projectId: string, fileId: string): Promise<ProjectFileDTO> {
  return apiClient.post<ProjectFileDTO>(`/projects/${projectId}/files/${fileId}/restore`, {});
}

