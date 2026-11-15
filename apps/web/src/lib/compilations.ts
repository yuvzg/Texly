import {
  type CompilationDTO,
  type CompilationLogDTO,
  type CompilationPdfResponseData,
  type CreateCompilationRequest,
  ErrorCodeEnum,
} from '@texly/shared';
import { apiClient, ApiClientError } from './api-client';

export interface CompilationListParams {
  limit?: number;
  cursor?: string;
  status?: string;
}

/**
 * Format user-friendly error messages from API or runtime errors.
 * Never leaks internal container IDs, stack traces or credentials.
 */
export function formatCompilationError(error: unknown): string {
  if (error instanceof ApiClientError) {
    switch (error.code) {
      case ErrorCodeEnum.NOT_FOUND:
        if (error.message.toLowerCase().includes('main file')) {
          return 'Main document file not found. Please set a valid main file in project settings.';
        }
        return 'The requested project or compilation was not found.';
      case ErrorCodeEnum.FORBIDDEN:
        return 'You do not have permission to compile this project (editor role required).';
      case ErrorCodeEnum.COMPILE_LIMIT:
        return 'Active compilation limit reached. Please wait for previous jobs to complete.';
      case ErrorCodeEnum.RATE_LIMITED:
        return 'Too many compilation requests. Please wait a moment before trying again.';
      case ErrorCodeEnum.VALIDATION_FAILED:
        return 'Invalid compilation configuration. Please check the selected engine or parameters.';
      case ErrorCodeEnum.INTERNAL:
        return 'A temporary compilation service error occurred. Please try again.';
      default:
        if (error.status === 413) {
          return 'Project size exceeds maximum compilation limit (50 MB).';
        }
        if (error.status === 504) {
          return 'Compilation timed out. Your document may have an infinite loop or excessive complexity.';
        }
        if (error.status === 503) {
          return 'Compilation service is currently unavailable. Please try again in a few seconds.';
        }
        return error.message || 'An unexpected compilation error occurred.';
    }
  }

  if (error instanceof Error) {
    if (error.message.includes('timeout') || error.message.includes('TIMED_OUT')) {
      return 'Compilation timed out. Please check for infinite loops or unclosed environments.';
    }
    if (error.message.includes('OOM') || error.message.includes('memory')) {
      return 'Compilation exceeded memory limits. Please optimize large assets or figures.';
    }
    if (error.message.includes('Failed to fetch') || error.message.includes('Network')) {
      return 'Unable to reach the compilation service. Please check your network connection.';
    }
    return error.message;
  }

  return 'An unexpected error occurred during compilation.';
}

export async function triggerCompilation(
  projectId: string,
  request?: CreateCompilationRequest,
): Promise<CompilationDTO> {
  return apiClient.post<CompilationDTO>(`/projects/${projectId}/compilations`, request ?? {});
}

export async function fetchCompilation(compilationId: string): Promise<CompilationDTO> {
  return apiClient.get<CompilationDTO>(`/compilations/${compilationId}`);
}

export async function fetchLatestCompilation(projectId: string): Promise<CompilationDTO | null> {
  try {
    return await apiClient.get<CompilationDTO>(`/projects/${projectId}/compilations/latest`);
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 404) {
      return null;
    }
    throw err;
  }
}

export async function fetchCompilationList(
  projectId: string,
  params?: CompilationListParams,
): Promise<CompilationDTO[]> {
  const query = new URLSearchParams();
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.cursor) query.set('cursor', params.cursor);
  if (params?.status) query.set('status', params.status);

  const qs = query.toString();
  const path = `/projects/${projectId}/compilations${qs ? `?${qs}` : ''}`;
  const result = await apiClient.get<CompilationDTO[]>(path);
  return result ?? [];
}

export async function fetchCompilationLog(
  compilationId: string,
  raw?: boolean,
): Promise<CompilationLogDTO> {
  const qs = raw ? '?raw=1' : '';
  return apiClient.get<CompilationLogDTO>(`/compilations/${compilationId}/log${qs}`);
}

export async function fetchCompilationPdf(
  compilationId: string,
  download?: boolean,
): Promise<CompilationPdfResponseData> {
  const qs = download ? '?download=1' : '';
  return apiClient.get<CompilationPdfResponseData>(`/compilations/${compilationId}/pdf${qs}`);
}

export async function cancelCompilation(compilationId: string): Promise<CompilationDTO> {
  return apiClient.delete<CompilationDTO>(`/compilations/${compilationId}`);
}
