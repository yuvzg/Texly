import { apiClient } from './api-client';
import type {
  DocumentDTO,
  PutDocumentContentRequest,
  PutDocumentContentResponseData,
} from '@texly/shared';

/**
 * Computes hexadecimal SHA-256 hash using the Web Crypto API.
 */
export async function computeSha256(text: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(text);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Retrieves the main document for the given project.
 */
export async function fetchMainDocument(projectId: string): Promise<DocumentDTO> {
  return apiClient.get<DocumentDTO>(`/projects/${projectId}/documents/main`);
}

/**
 * Retrieves a document by id.
 */
export async function fetchDocument(projectId: string, documentId: string): Promise<DocumentDTO> {
  return apiClient.get<DocumentDTO>(`/projects/${projectId}/documents/${documentId}`);
}

/**
 * Saves document content with optimistic concurrency control.
 */
export async function saveDocumentContent(
  projectId: string,
  documentId: string,
  data: PutDocumentContentRequest,
): Promise<PutDocumentContentResponseData> {
  return apiClient.put<PutDocumentContentResponseData>(
    `/projects/${projectId}/documents/${documentId}/content`,
    data,
  );
}
