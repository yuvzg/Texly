import { apiClient } from './api-client';
import type { WorkspaceWithRoleDTO, CreateWorkspaceRequest } from '@texly/shared';

/**
 * Retrieves the list of workspaces accessible by the authenticated user.
 */
export async function fetchWorkspaces(): Promise<WorkspaceWithRoleDTO[]> {
  return apiClient.get<WorkspaceWithRoleDTO[]>('/workspaces');
}

/**
 * Creates a new workspace.
 */
export async function createWorkspace(data: CreateWorkspaceRequest): Promise<WorkspaceWithRoleDTO> {
  return apiClient.post<WorkspaceWithRoleDTO>('/workspaces', data);
}
