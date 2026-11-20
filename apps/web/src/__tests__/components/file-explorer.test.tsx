import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FileExplorer } from '@/components/editor/file-explorer/file-explorer';
import { apiClient } from '@/lib/api-client';
import { useEditorStore } from '@/stores/editor.store';
import type { ProjectFileDTO, FileListResponseData } from '@texly/shared';

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

const mockFiles: ProjectFileDTO[] = [
  {
    id: 'file-main',
    parentId: null,
    name: 'main.tex',
    path: 'main.tex',
    nodeType: 'FILE',
    kind: 'TEXT',
    sizeBytes: 100,
    mimeType: 'application/x-tex',
    documentId: 'doc-main',
    revision: 1,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'folder-sections',
    parentId: null,
    name: 'sections',
    path: 'sections',
    nodeType: 'FOLDER',
    kind: null,
    sizeBytes: 0,
    mimeType: null,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'file-intro',
    parentId: 'folder-sections',
    name: 'intro.tex',
    path: 'sections/intro.tex',
    nodeType: 'FILE',
    kind: 'TEXT',
    sizeBytes: 250,
    mimeType: 'application/x-tex',
    documentId: 'doc-intro',
    revision: 1,
    updatedAt: new Date().toISOString(),
  },
];

const mockFileList: FileListResponseData = {
  files: mockFiles,
  mainFileId: 'file-main',
};

describe('FileExplorer Component (Project File Tree)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useEditorStore.getState().reset();
  });

  it('renders the file tree with directories and files', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(mockFileList);

    render(<FileExplorer projectId={mockProjectId} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText('main.tex')).toBeInTheDocument();
      expect(screen.getByText('sections')).toBeInTheDocument();
      expect(screen.getByText('intro.tex')).toBeInTheDocument();
    });

    // Main file has the "main" indicator badge
    expect(screen.getByText('main')).toBeInTheDocument();
  });

  it('expands and collapses folder when clicked', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(mockFileList);

    render(<FileExplorer projectId={mockProjectId} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(screen.getByText('intro.tex')).toBeInTheDocument());

    // Click 'sections' folder to collapse
    fireEvent.click(screen.getByText('sections'));
    expect(screen.queryByText('intro.tex')).not.toBeInTheDocument();

    // Click again to expand
    fireEvent.click(screen.getByText('sections'));
    expect(screen.getByText('intro.tex')).toBeInTheDocument();
  });

  it('filters file tree using search input', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(mockFileList);

    render(<FileExplorer projectId={mockProjectId} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(screen.getByText('main.tex')).toBeInTheDocument());

    const searchInput = screen.getByPlaceholderText('Search files...');
    fireEvent.change(searchInput, { target: { value: 'intro' } });

    // 'intro.tex' and its parent 'sections' should remain visible; 'main.tex' hidden
    expect(screen.getByText('intro.tex')).toBeInTheDocument();
    expect(screen.getByText('sections')).toBeInTheDocument();
    expect(screen.queryByText('main.tex')).not.toBeInTheDocument();
  });

  it('clicking a file opens a document tab', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(mockFileList);
    const onSelect = vi.fn();

    render(<FileExplorer projectId={mockProjectId} onFileSelect={onSelect} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(screen.getByText('main.tex')).toBeInTheDocument());

    fireEvent.click(screen.getByText('main.tex'));

    expect(useEditorStore.getState().tabs).toHaveLength(1);
    expect(useEditorStore.getState().tabs[0]?.fileId).toBe('file-main');
    expect(useEditorStore.getState().activeFileId).toBe('file-main');
    expect(onSelect).toHaveBeenCalled();
  });

  it('starts inline creation of a new file and validates input', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(mockFileList);
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      id: 'file-new',
      parentId: null,
      name: 'chapter1.tex',
      path: 'chapter1.tex',
      nodeType: 'FILE',
      kind: 'TEXT',
      sizeBytes: 0,
      updatedAt: new Date().toISOString(),
    });

    render(<FileExplorer projectId={mockProjectId} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(screen.getByText('main.tex')).toBeInTheDocument());

    // Click "New File" button
    fireEvent.click(screen.getByTitle('New File in Root'));

    // Input should be present
    const input = screen.getByDisplayValue('document.tex');
    expect(input).toBeInTheDocument();

    // Try typing an invalid name with forbidden characters
    fireEvent.change(input, { target: { value: 'invalid/name.tex' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    // Validation error should show
    expect(screen.getByText(/Name contains invalid characters/i)).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();

    // Type a valid name and press Enter
    fireEvent.change(input, { target: { value: 'chapter1.tex' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        `/projects/${mockProjectId}/files`,
        expect.objectContaining({
          name: 'chapter1.tex',
          nodeType: 'FILE',
        }),
      );
    });
  });

  it('shows delete confirmation dialog with warnings for folder and main document', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(mockFileList);
    vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined);

    render(<FileExplorer projectId={mockProjectId} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(screen.getByText('main.tex')).toBeInTheDocument());

    // Open context menu for main.tex
    const actionsBtn = screen.getByLabelText('Actions for main.tex');
    fireEvent.click(actionsBtn);

    // Click delete
    fireEvent.click(screen.getByText('Delete'));

    // Modal should appear warning about main document
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/main compilation document/i)).toBeInTheDocument();

    // Click confirm delete
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(apiClient.delete).toHaveBeenCalledWith(`/projects/${mockProjectId}/files/file-main`);
    });
  });

  it('renders empty state when project has no files', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ files: [], mainFileId: null });

    render(<FileExplorer projectId={mockProjectId} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText(/This project has no files yet/i)).toBeInTheDocument();
      expect(screen.getByText('Create File')).toBeInTheDocument();
    });
  });
});
