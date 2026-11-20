import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { useDocumentAutosave } from '@/hooks/use-document-autosave';
import { ConflictModal } from '@/components/editor/conflict-modal';
import * as documentsLib from '@/lib/documents';
import * as draftStorage from '@/lib/draft-storage';
import { ApiClientError } from '@/lib/api-client';
import type { DocumentDTO, PutDocumentContentResponseData } from '@texly/shared';

vi.mock('@/lib/documents');

function AutosaveConflictTestHarness({
  projectId,
  documentId,
}: {
  projectId: string;
  documentId: string;
}) {
  const [isModalOpen, setIsModalOpen] = React.useState(false);

  const {
    content,
    setContent,
    status,
    activeConflict,
    resolveConflictUseServer,
    resolveConflictKeepMine,
    flushSave,
  } = useDocumentAutosave({
    projectId,
    documentId,
    debounceMs: 50,
  });

  React.useEffect(() => {
    if (activeConflict) {
      setIsModalOpen(true);
    }
  }, [activeConflict]);

  return (
    <div>
      <div data-testid="status-indicator">{status}</div>
      <textarea
        data-testid="editor-textarea"
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <button data-testid="save-btn" onClick={() => void flushSave()}>
        Save Now
      </button>

      <ConflictModal
        isOpen={isModalOpen}
        conflict={activeConflict}
        onUseServer={async () => {
          await resolveConflictUseServer();
          setIsModalOpen(false);
        }}
        onKeepMine={async () => {
          await resolveConflictKeepMine();
          setIsModalOpen(false);
        }}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
}

describe('Autosave & Concurrent Edit Conflict Workflow (Integration)', () => {
  const mockProjectId = 'proj-conflict-e2e';
  const mockDocId = 'doc-concurrent-1';

  let serverDoc: DocumentDTO;

  beforeEach(async () => {
    vi.clearAllMocks();
    await draftStorage.clearAllDrafts();

    serverDoc = {
      id: mockDocId,
      fileId: 'file-doc-1',
      projectId: mockProjectId,
      path: 'main.tex',
      content: '\\section{Original Document}',
      contentHash: 'hash-rev-1',
      revision: 1,
      sizeBytes: 30,
      updatedAt: '2026-03-01T10:00:00.000Z',
    };

    vi.mocked(documentsLib.fetchDocument).mockImplementation(async () => {
      return { ...serverDoc };
    });

    vi.mocked(documentsLib.fetchMainDocument).mockImplementation(async () => {
      return { ...serverDoc };
    });

    vi.mocked(documentsLib.computeSha256).mockResolvedValue('hash-computed');

    vi.mocked(documentsLib.saveDocumentContent).mockImplementation(async (_pId, _dId, req) => {
      // Optimistic concurrency control check
      if (req.baseRevision !== serverDoc.revision) {
        throw new ApiClientError(409, 'REVISION_CONFLICT', 'Revision conflict', {
          serverRevision: serverDoc.revision,
        });
      }

      // Advance server document state
      serverDoc.revision += 1;
      serverDoc.content = req.content;
      serverDoc.contentHash = 'hash-rev-' + serverDoc.revision;
      serverDoc.updatedAt = new Date().toISOString();

      return {
        revision: serverDoc.revision,
        contentHash: serverDoc.contentHash,
        updatedAt: serverDoc.updatedAt,
        unchanged: false,
      };
    });
  });

  it('detects two-tab concurrency conflict and resolves via Keep Mine', async () => {
    render(<AutosaveConflictTestHarness projectId={mockProjectId} documentId={mockDocId} />);

    // 1. Initial state loads Revision 1
    await waitFor(() => {
      expect(screen.getByTestId('status-indicator')).toHaveTextContent('CLEAN');
      expect(screen.getByTestId('editor-textarea')).toHaveValue('\\section{Original Document}');
    });

    // 2. Tab 2 concurrently edits and commits Revision 2 to server
    serverDoc.revision = 2;
    serverDoc.content = '\\section{Edited by Remote Tab 2}';
    serverDoc.contentHash = 'hash-rev-2';

    // 3. Tab 1 edits its local buffer without knowing about Tab 2 yet
    const textarea = screen.getByTestId('editor-textarea');
    fireEvent.change(textarea, { target: { value: '\\section{Local Edits from Tab 1}' } });

    expect(screen.getByTestId('status-indicator')).toHaveTextContent('DIRTY');

    // 4. Tab 1 attempts save (baseRevision: 1, but server is at 2)
    fireEvent.click(screen.getByTestId('save-btn'));

    // 5. Concurrency conflict is caught, modal is presented
    await waitFor(() => {
      expect(screen.getByTestId('status-indicator')).toHaveTextContent('CONFLICT');
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Document Revision Conflict Detected')).toBeInTheDocument();
      expect(screen.getAllByText('\\section{Local Edits from Tab 1}').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('\\section{Edited by Remote Tab 2}')).toBeInTheDocument();
    });

    // 6. User chooses "Keep Mine (Overwrite Server)"
    const keepMineBtn = screen.getByRole('button', { name: /Keep Mine/ });
    fireEvent.click(keepMineBtn);

    // 7. Modal closes, save succeeds with new baseRevision: 2 -> moves server to Revision 3
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeNull(); // until closed
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.getByTestId('status-indicator')).toHaveTextContent('SAVED');
    });

    // Verify server has Tab 1's content and is now at Revision 3
    expect(serverDoc.revision).toBe(3);
    expect(serverDoc.content).toBe('\\section{Local Edits from Tab 1}');
  });

  it('resolves conflict via Use Server Version (discards local edits)', async () => {
    render(<AutosaveConflictTestHarness projectId={mockProjectId} documentId={mockDocId} />);

    await waitFor(() => {
      expect(screen.getByTestId('status-indicator')).toHaveTextContent('CLEAN');
    });

    // Tab 2 updates server to Revision 2
    serverDoc.revision = 2;
    serverDoc.content = '\\section{Collaborator Masterpiece}';

    // Tab 1 types local changes
    fireEvent.change(screen.getByTestId('editor-textarea'), {
      target: { value: '\\section{Draft to discard}' },
    });

    // Trigger save -> hits 409
    fireEvent.click(screen.getByTestId('save-btn'));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // User chooses "Use Server Version"
    fireEvent.click(screen.getByRole('button', { name: /Use Server Version/ }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.getByTestId('status-indicator')).toHaveTextContent('CLEAN');
      expect(screen.getByTestId('editor-textarea')).toHaveValue('\\section{Collaborator Masterpiece}');
    });

    // Local IndexedDB draft must be deleted
    const draft = await draftStorage.getDraft(mockDocId);
    expect(draft).toBeNull();
  });
});
