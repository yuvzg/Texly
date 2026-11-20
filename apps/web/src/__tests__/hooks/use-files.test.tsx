import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useProjectFiles,
  useCreateFile,
  useUpdateFile,
  useDeleteFile,
  useSetMainFile,
  useDocument,
} from '@/hooks/use-files';
import { apiClient } from '@/lib/api-client';
import type { ProjectFileDTO, FileListResponseData, DocumentDTO } from '@texly/shared';

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const mockProjectId = 'proj-123';
const mockFile: ProjectFileDTO = {
  id: 'file-1',
  parentId: null,
  name: 'main.tex',
  path: 'main.tex',
  nodeType: 'FILE',
  kind: 'TEXT',
  sizeBytes: 100,
  mimeType: 'application/x-tex',
  documentId: 'doc-1',
  revision: 1,
  updatedAt: new Date().toISOString(),
};

const mockFileList: FileListResponseData = {
  files: [mockFile],
  mainFileId: 'file-1',
};

const mockDocument: DocumentDTO = {
  id: 'doc-1',
  fileId: 'file-1',
  projectId: mockProjectId,
  path: 'main.tex',
  content: '\\documentclass{article}\n\\begin{document}\nHello\n\\end{document}',
  contentHash: 'hash-1',
  revision: 1,
  sizeBytes: 60,
  updatedAt: new Date().toISOString(),
};

describe('use-files Hooks (TanStack Query File System)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('useProjectFiles fetches file list and mainFileId', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(mockFileList);

    const { result } = renderHook(() => useProjectFiles(mockProjectId), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.files).toHaveLength(1);
    expect(result.current.data?.mainFileId).toBe('file-1');
    expect(apiClient.get).toHaveBeenCalledWith(`/projects/${mockProjectId}/files`);
  });

  it('useCreateFile creates a new file and invalidates query', async () => {
    const newFile: ProjectFileDTO = {
      ...mockFile,
      id: 'file-2',
      name: 'chapter1.tex',
      path: 'chapter1.tex',
    };
    vi.mocked(apiClient.post).mockResolvedValueOnce(newFile);

    const { result } = renderHook(() => useCreateFile(mockProjectId), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({
      nodeType: 'FILE',
      parentId: null,
      name: 'chapter1.tex',
      content: 'hello',
    });

    expect(apiClient.post).toHaveBeenCalledWith(`/projects/${mockProjectId}/files`, {
      nodeType: 'FILE',
      parentId: null,
      name: 'chapter1.tex',
      content: 'hello',
    });
  });

  it('useUpdateFile renames or moves a file', async () => {
    const updatedFile: ProjectFileDTO = {
      ...mockFile,
      name: 'renamed.tex',
      path: 'renamed.tex',
    };
    vi.mocked(apiClient.patch).mockResolvedValueOnce(updatedFile);

    const { result } = renderHook(() => useUpdateFile(mockProjectId), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({
      fileId: 'file-1',
      data: { name: 'renamed.tex' },
    });

    expect(apiClient.patch).toHaveBeenCalledWith(`/projects/${mockProjectId}/files/file-1`, {
      name: 'renamed.tex',
    });
  });

  it('useDeleteFile soft-deletes file', async () => {
    vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useDeleteFile(mockProjectId), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({ fileId: 'file-1' });
    expect(apiClient.delete).toHaveBeenCalledWith(`/projects/${mockProjectId}/files/file-1`);
  });

  it('useSetMainFile sets main document', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ success: true });

    const { result } = renderHook(() => useSetMainFile(mockProjectId), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync('file-1');
    expect(apiClient.post).toHaveBeenCalledWith(`/projects/${mockProjectId}/files/file-1/set-main`, {});
  });

  it('useDocument fetches document content by documentId', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(mockDocument);

    const { result } = renderHook(() => useDocument(mockProjectId, 'doc-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.content).toContain('Hello');
    expect(apiClient.get).toHaveBeenCalledWith(`/projects/${mockProjectId}/documents/doc-1`);
  });
});

