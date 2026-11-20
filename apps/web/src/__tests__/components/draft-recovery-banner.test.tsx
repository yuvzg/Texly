import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { DraftRecoveryBanner } from '@/components/editor/draft-recovery-banner';
import type { DocumentDraft } from '@/lib/draft-storage';

describe('DraftRecoveryBanner Component', () => {
  const mockDraft: DocumentDraft = {
    documentId: 'doc-abc',
    projectId: 'proj-xyz',
    content: 'Recovered draft content',
    baseRevision: 4,
    baseHash: 'hash-abc',
    updatedAt: '2026-02-15T14:30:00.000Z',
  };

  it('does not render when draft is null', () => {
    const { container } = render(
      <DraftRecoveryBanner draft={null} onRestore={vi.fn()} onDiscard={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders draft prompt with revision info', () => {
    render(
      <DraftRecoveryBanner draft={mockDraft} onRestore={vi.fn()} onDiscard={vi.fn()} />,
    );

    expect(screen.getByTestId('draft-recovery-banner')).toBeInTheDocument();
    expect(screen.getByText(/Unsaved local draft detected/)).toBeInTheDocument();
    expect(screen.getByText(/Revision 4/)).toBeInTheDocument();
  });

  it('calls onRestore when Restore Draft is clicked', () => {
    const handleRestore = vi.fn();
    render(
      <DraftRecoveryBanner draft={mockDraft} onRestore={handleRestore} onDiscard={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Restore Draft/ }));
    expect(handleRestore).toHaveBeenCalledTimes(1);
  });

  it('calls onDiscard when Discard is clicked', () => {
    const handleDiscard = vi.fn();
    render(
      <DraftRecoveryBanner draft={mockDraft} onRestore={vi.fn()} onDiscard={handleDiscard} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Discard/ }));
    expect(handleDiscard).toHaveBeenCalledTimes(1);
  });
});

