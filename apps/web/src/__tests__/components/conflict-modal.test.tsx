import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ConflictModal } from '@/components/editor/conflict-modal';
import type { DocumentConflictData } from '@/stores/editor.store';

describe('ConflictModal Component', () => {
  const mockConflict: DocumentConflictData = {
    documentId: 'doc-123',
    projectId: 'proj-456',
    localContent: '\\section{Local Changes}',
    serverContent: '\\section{Server Content}',
    localRevision: 2,
    serverRevision: 3,
    serverUpdatedAt: '2026-01-01T12:00:00.000Z',
  };

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <ConflictModal
        isOpen={false}
        conflict={mockConflict}
        onUseServer={vi.fn()}
        onKeepMine={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('does not render when conflict is null', () => {
    const { container } = render(
      <ConflictModal
        isOpen={true}
        conflict={null}
        onUseServer={vi.fn()}
        onKeepMine={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders conflict details and comparison text', () => {
    render(
      <ConflictModal
        isOpen={true}
        conflict={mockConflict}
        onUseServer={vi.fn()}
        onKeepMine={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('Document Revision Conflict Detected')).toBeInTheDocument();
    expect(screen.getByText(/Revision 3/)).toBeInTheDocument();
    expect(screen.getByText(/Revision 2/)).toBeInTheDocument();
    expect(screen.getByText('\\section{Local Changes}')).toBeInTheDocument();
    expect(screen.getByText('\\section{Server Content}')).toBeInTheDocument();
  });

  it('allows switching views between Side-by-Side, Mine, and Server', () => {
    render(
      <ConflictModal
        isOpen={true}
        conflict={mockConflict}
        onUseServer={vi.fn()}
        onKeepMine={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Your Local Changes' }));
    expect(screen.getByText('Your Local Changes (Revision 2)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Server Version/ }));
    expect(screen.getByText('Authoritative Server Content (Revision 3)')).toBeInTheDocument();
  });

  it('calls onUseServer when Use Server Version button is clicked', async () => {
    const handleUseServer = vi.fn();
    render(
      <ConflictModal
        isOpen={true}
        conflict={mockConflict}
        onUseServer={handleUseServer}
        onKeepMine={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Use Server Version/ }));
    expect(handleUseServer).toHaveBeenCalledTimes(1);
  });

  it('calls onKeepMine when Keep Mine button is clicked', async () => {
    const handleKeepMine = vi.fn();
    render(
      <ConflictModal
        isOpen={true}
        conflict={mockConflict}
        onUseServer={vi.fn()}
        onKeepMine={handleKeepMine}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Keep Mine/ }));
    expect(handleKeepMine).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when close icon is clicked', () => {
    const handleClose = vi.fn();
    render(
      <ConflictModal
        isOpen={true}
        conflict={mockConflict}
        onUseServer={vi.fn()}
        onKeepMine={vi.fn()}
        onClose={handleClose}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
