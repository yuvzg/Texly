import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { DocumentTabs } from '@/components/editor/document-tabs';
import { useEditorStore } from '@/stores/editor.store';

describe('DocumentTabs Component (Multiple Document Tabs)', () => {
  beforeEach(() => {
    useEditorStore.getState().reset();
  });

  it('renders nothing when no tabs are open', () => {
    const { container } = render(<DocumentTabs />);
    expect(container.firstChild).toBeNull();
  });

  it('renders open document tabs with name, icon, and main badge', () => {
    useEditorStore.getState().openTab({
      fileId: 'file-1',
      path: 'main.tex',
      name: 'main.tex',
    });
    useEditorStore.getState().openTab({
      fileId: 'file-2',
      path: 'chapters/intro.tex',
      name: 'intro.tex',
    });

    render(<DocumentTabs mainFileId="file-1" />);

    expect(screen.getByText('main.tex')).toBeInTheDocument();
    expect(screen.getByText('intro.tex')).toBeInTheDocument();
    expect(screen.getByText('main')).toBeInTheDocument(); // main badge
  });

  it('switches active tab when clicked', () => {
    useEditorStore.getState().openTab({
      fileId: 'file-1',
      path: 'main.tex',
      name: 'main.tex',
    });
    useEditorStore.getState().openTab({
      fileId: 'file-2',
      path: 'intro.tex',
      name: 'intro.tex',
    });

    render(<DocumentTabs />);

    // Click file-1 tab
    fireEvent.click(screen.getByText('main.tex'));
    expect(useEditorStore.getState().activeFileId).toBe('file-1');

    // Click file-2 tab
    fireEvent.click(screen.getByText('intro.tex'));
    expect(useEditorStore.getState().activeFileId).toBe('file-2');
  });

  it('displays unsaved change indicator dot when document is dirty', () => {
    useEditorStore.getState().openTab({
      fileId: 'file-1',
      path: 'main.tex',
      name: 'main.tex',
    });
    useEditorStore.getState().setTabDirty('file-1', true);

    render(<DocumentTabs />);
    const dirtyDot = screen.getByTitle('Unsaved changes');
    expect(dirtyDot).toBeInTheDocument();
  });

  it('closes a clean tab when close button is clicked', () => {
    useEditorStore.getState().openTab({
      fileId: 'file-1',
      path: 'main.tex',
      name: 'main.tex',
    });

    render(<DocumentTabs />);
    const closeBtn = screen.getByLabelText('Close tab main.tex');
    fireEvent.click(closeBtn);

    expect(useEditorStore.getState().tabs).toHaveLength(0);
  });

  it('prompts confirmation when closing a dirty tab with unsaved changes', async () => {
    useEditorStore.getState().openTab({
      fileId: 'file-1',
      path: 'main.tex',
      name: 'main.tex',
    });
    useEditorStore.getState().setTabDirty('file-1', true);

    render(<DocumentTabs />);
    const closeBtn = screen.getByLabelText('Close tab main.tex');
    fireEvent.click(closeBtn);

    // Dialog should appear
    expect(screen.getByText('Unsaved Changes')).toBeInTheDocument();
    expect(
      screen.getByText(/This document has unsaved modifications/i),
    ).toBeInTheDocument();

    // Tab is not closed yet
    expect(useEditorStore.getState().tabs).toHaveLength(1);

    // Click "Keep Open"
    fireEvent.click(screen.getByText('Keep Open'));
    expect(screen.queryByText('Unsaved Changes')).not.toBeInTheDocument();
    expect(useEditorStore.getState().tabs).toHaveLength(1);

    // Try closing again, this time click "Discard & Close"
    fireEvent.click(closeBtn);
    fireEvent.click(screen.getByText('Discard & Close'));

    expect(useEditorStore.getState().tabs).toHaveLength(0);
  });

  it('middle click closes tab', () => {
    useEditorStore.getState().openTab({
      fileId: 'file-1',
      path: 'main.tex',
      name: 'main.tex',
    });

    render(<DocumentTabs />);
    const tabEl = screen.getByRole('tab');
    fireEvent.mouseDown(tabEl, { button: 1 });

    expect(useEditorStore.getState().tabs).toHaveLength(0);
  });

  it('context menu supports Close Others and Close All', () => {
    useEditorStore.getState().openTab({ fileId: 'file-1', path: '1.tex', name: '1.tex' });
    useEditorStore.getState().openTab({ fileId: 'file-2', path: '2.tex', name: '2.tex' });
    useEditorStore.getState().openTab({ fileId: 'file-3', path: '3.tex', name: '3.tex' });

    render(<DocumentTabs />);
    const tabs = screen.getAllByRole('tab');

    // Right-click second tab
    fireEvent.contextMenu(tabs[1]!);
    expect(screen.getByText('Close Others')).toBeInTheDocument();
    expect(screen.getByText('Close All')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Close Others'));
    expect(useEditorStore.getState().tabs).toHaveLength(1);
    expect(useEditorStore.getState().tabs[0]?.fileId).toBe('file-2');
  });
});

