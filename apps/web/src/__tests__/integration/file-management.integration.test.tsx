import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FileExplorer } from '@/components/editor/file-explorer/file-explorer';
import { DocumentTabs } from '@/components/editor/document-tabs';
import { useEditorStore } from '@/stores/editor.store';
import { apiClient } from '@/lib/api-client';
import type { ProjectFileDTO, FileListResponseData } from '@texly/shared';

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

function WorkspaceApp({ projectId }: { projectId: string }) {
  return (
    <div className="flex h-screen">
      <FileExplorer projectId={projectId} className="w-64" />
      <div className="flex-1 flex flex-col">
        <DocumentTabs />
        <div data-testid="editor-viewport" className="p-4">
          Editor Content Area
        </div>
      </div>
    </div>
  );
}

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

const mockProjectId = 'proj-e2e-123';

describe('File Management & Document Workflow (Integration E2E)', () => {
  let projectFilesState: ProjectFileDTO[];
  let mainFileIdState: string | null;
  let fileIdCounter: number;

  beforeEach(() => {
    vi.clearAllMocks();
    useEditorStore.getState().reset();
    fileIdCounter = 1;

    projectFilesState = [
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
    ];
    mainFileIdState = 'file-main';

    vi.mocked(apiClient.get).mockImplementation(async (path: string) => {
      if (path === `/projects/${mockProjectId}/files`) {
        return {
          files: JSON.parse(JSON.stringify(projectFilesState)),
          mainFileId: mainFileIdState,
        } as FileListResponseData;
      }
      return {};
    });

    vi.mocked(apiClient.post).mockImplementation(async (path: string, body: unknown) => {
      if (path === `/projects/${mockProjectId}/files`) {
        const req = body as { name: string; nodeType: 'FILE' | 'FOLDER'; parentId: string | null };
        const newId = `id-${fileIdCounter++}`;
        const newPath = req.parentId ? `folder/${req.name}` : req.name;
        const newFile: ProjectFileDTO = {
          id: newId,
          parentId: req.parentId,
          name: req.name,
          path: newPath,
          nodeType: req.nodeType,
          kind: req.nodeType === 'FILE' ? 'TEXT' : null,
          sizeBytes: 0,
          mimeType: req.nodeType === 'FILE' ? 'application/x-tex' : null,
          ...(req.nodeType === 'FILE' ? { documentId: `doc-${newId}`, revision: 1 } : {}),
          updatedAt: new Date().toISOString(),
        };
        projectFilesState.push(newFile);
        return newFile;
      }
      if (path.includes('/set-main')) {
        const fileId = path.split('/')[4]!;
        mainFileIdState = fileId;
        return { success: true };
      }
      return {};
    });

    vi.mocked(apiClient.patch).mockImplementation(async (path: string, body: unknown) => {
      const parts = path.split('/');
      const fileId = parts[4]!;
      const req = body as { name?: string; parentId?: string | null };
      const file = projectFilesState.find((f) => f.id === fileId);
      if (file) {
        if (req.name !== undefined) file.name = req.name;
        if (req.parentId !== undefined) file.parentId = req.parentId;
        file.path = file.parentId ? `folder/${file.name}` : file.name;
        return file;
      }
      return {};
    });

    vi.mocked(apiClient.delete).mockImplementation(async (path: string) => {
      const fileId = path.split('/')[4]!;
      projectFilesState = projectFilesState.filter((f) => f.id !== fileId);
      if (mainFileIdState === fileId) {
        mainFileIdState = null;
      }
      return undefined;
    });
  });

  it('completes the entire realistic 10-step file management workflow', async () => {
    // 1. Open a project
    render(<WorkspaceApp projectId={mockProjectId} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText('main.tex')).toBeInTheDocument();
    });

    // 2. Create a folder 'sections'
    fireEvent.click(screen.getByTitle('New Folder in Root'));
    const folderInput = screen.getByDisplayValue('folder');
    fireEvent.change(folderInput, { target: { value: 'sections' } });
    fireEvent.keyDown(folderInput, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText('sections')).toBeInTheDocument();
    });

    // 3. Create a .tex file 'intro.tex' inside 'sections'
    const sectionsActions = screen.getByLabelText('Actions for sections');
    fireEvent.click(sectionsActions);
    fireEvent.click(screen.getByText('New File Inside'));

    const fileInput = screen.getByDisplayValue('document.tex');
    fireEvent.change(fileInput, { target: { value: 'intro.tex' } });
    fireEvent.keyDown(fileInput, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText('intro.tex')).toBeInTheDocument();
    });

    // 4. Open the file 'intro.tex'
    fireEvent.click(screen.getByText('intro.tex'));
    expect(useEditorStore.getState().tabs).toHaveLength(1);
    expect(useEditorStore.getState().activeFileId).toBeDefined();

    // 5. Create another .tex file 'summary.tex' in root
    fireEvent.click(screen.getByTitle('New File in Root'));
    const summaryInput = screen.getByDisplayValue('document.tex');
    fireEvent.change(summaryInput, { target: { value: 'summary.tex' } });
    fireEvent.keyDown(summaryInput, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText('summary.tex')).toBeInTheDocument();
    });

    // 6. Switch between both documents
    fireEvent.click(screen.getByText('summary.tex'));
    expect(useEditorStore.getState().tabs).toHaveLength(2);

    // Switch tab by clicking 'intro.tex' tab in tab bar
    const tabHeaders = screen.getAllByRole('tab');
    fireEvent.click(tabHeaders[0]!); // switch back to intro.tex
    expect(useEditorStore.getState().tabs[0]?.name).toBe('intro.tex');

    // 7. Rename 'summary.tex' to 'conclusion.tex'
    const summaryActions = screen.getByLabelText('Actions for summary.tex');
    fireEvent.click(summaryActions);
    fireEvent.click(screen.getByText('Rename'));

    const renameInput = screen.getByDisplayValue('summary.tex');
    fireEvent.change(renameInput, { target: { value: 'conclusion.tex' } });
    fireEvent.keyDown(renameInput, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText('conclusion.tex')).toBeInTheDocument();
    });

    // 8. Move 'conclusion.tex' into 'sections' folder using drag-and-drop
    const sectionsNode = projectFilesState.find((f) => f.name === 'sections')!;
    const conclusionNode = projectFilesState.find((f) => f.name === 'conclusion.tex')!;
    
    // Simulate drop on 'sections' folder
    const sectionsEl = screen.getByText('sections');
    fireEvent.drop(sectionsEl, {
      dataTransfer: {
        getData: (type: string) => {
          if (type === 'application/json') {
            return JSON.stringify({ fileId: conclusionNode.id });
          }
          return '';
        },
      },
    });

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        `/projects/${mockProjectId}/files/${conclusionNode.id}`,
        { parentId: sectionsNode.id },
      );
    });

    // 9. Select 'intro.tex' as the main document
    const introActions = screen.getByLabelText('Actions for intro.tex');
    fireEvent.click(introActions);
    fireEvent.click(screen.getByText('Set as Main Document'));

    await waitFor(() => {
      expect(mainFileIdState).toBe(introNodeId());
    });

    function introNodeId() {
      return projectFilesState.find((f) => f.name === 'intro.tex')!.id;
    }

    // 10. Delete 'conclusion.tex' and verify the tree updates
    const conclusionActions = await screen.findByLabelText('Actions for conclusion.tex');
    fireEvent.click(conclusionActions);
    fireEvent.click(await screen.findByText('Delete'));

    // Confirm dialog
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(screen.queryByText('conclusion.tex')).not.toBeInTheDocument();
    });
  });
});

