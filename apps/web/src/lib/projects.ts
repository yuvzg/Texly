import { apiClient } from './api-client';
import type { ProjectDTO, CreateProjectRequest, UpdateProjectRequest } from '@texly/shared';

export interface ListProjectsParams {
  workspaceId?: string | undefined;
  trashed?: boolean | undefined;
  q?: string | undefined;
}

/**
 * Retrieves the projects accessible by the authenticated user.
 */
export async function fetchProjects(params?: ListProjectsParams): Promise<ProjectDTO[]> {
  const queryParams = new URLSearchParams();
  if (params?.workspaceId) queryParams.set('workspaceId', params.workspaceId);
  if (params?.trashed) queryParams.set('trashed', 'true');
  if (params?.q) queryParams.set('q', params.q);

  const qs = queryParams.toString();
  const path = qs ? `/projects?${qs}` : '/projects';
  return apiClient.get<ProjectDTO[]>(path);
}

/**
 * Retrieves details for a specific project.
 */
export async function fetchProject(projectId: string): Promise<ProjectDTO> {
  return apiClient.get<ProjectDTO>(`/projects/${projectId}`);
}

/**
 * Creates a new project in the specified workspace.
 */
export async function createProject(data: CreateProjectRequest): Promise<ProjectDTO> {
  return apiClient.post<ProjectDTO>('/projects', data);
}

/**
 * Deletes (moves to trash) a project.
 */
export async function deleteProject(projectId: string): Promise<void> {
  return apiClient.delete<void>(`/projects/${projectId}`);
}

/**
 * Updates settings for a specific project.
 */
export async function updateProject(
  projectId: string,
  data: UpdateProjectRequest,
): Promise<ProjectDTO> {
  return apiClient.patch<ProjectDTO>(`/projects/${projectId}`, data);
}
