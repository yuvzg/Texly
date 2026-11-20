import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '@/stores/editor.store';

describe('useEditorStore (Zustand Multiple Document State)', () => {
  beforeEach(() => {
    useEditorStore.getState().reset();
  });

  it('initializes with empty state', () => {
    const state = useEditorStore.getState();
    expect(state.tabs).toEqual([]);
    expect(state.activeFileId).toBeNull();
    expect(state.cachedStates).toEqual({});
  });

  it('opens a new tab and sets it as active', () => {
    useEditorStore.getState().openTab({
      fileId: 'file-1',
      documentId: 'doc-1',
      path: 'main.tex',
      name: 'main.tex',
    });

    const state = useEditorStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0]?.fileId).toBe('file-1');
    expect(state.activeFileId).toBe('file-1');
    expect(state.lastOpenedFileId).toBe('file-1');
  });

  it('activates existing tab instead of creating duplicate if already open', () => {
    useEditorStore.getState().openTab({
      fileId: 'file-1',
      documentId: 'doc-1',
      path: 'main.tex',
      name: 'main.tex',
    });

    useEditorStore.getState().openTab({
      fileId: 'file-2',
      documentId: 'doc-2',
      path: 'sections/intro.tex',
      name: 'intro.tex',
    });

    expect(useEditorStore.getState().tabs).toHaveLength(2);
    expect(useEditorStore.getState().activeFileId).toBe('file-2');

    // Re-open file-1
    useEditorStore.getState().openTab({
      fileId: 'file-1',
      documentId: 'doc-1',
      path: 'main.tex',
      name: 'main.tex',
    });

    expect(useEditorStore.getState().tabs).toHaveLength(2);
    expect(useEditorStore.getState().activeFileId).toBe('file-1');
  });

  it('switches active tab cleanly', () => {
    useEditorStore.getState().openTab({
      fileId: 'file-1',
      path: 'main.tex',
      name: 'main.tex',
    });
    useEditorStore.getState().openTab({
      fileId: 'file-2',
      path: 'refs.bib',
      name: 'refs.bib',
    });

    useEditorStore.getState().setActiveTab('file-1');
    expect(useEditorStore.getState().activeFileId).toBe('file-1');
  });

  it('closes tab and selects adjacent tab', () => {
    useEditorStore.getState().openTab({ fileId: 'file-1', path: '1.tex', name: '1.tex' });
    useEditorStore.getState().openTab({ fileId: 'file-2', path: '2.tex', name: '2.tex' });
    useEditorStore.getState().openTab({ fileId: 'file-3', path: '3.tex', name: '3.tex' });

    // Active is file-3. Close file-3:
    useEditorStore.getState().closeTab('file-3');
    expect(useEditorStore.getState().tabs).toHaveLength(2);
    expect(useEditorStore.getState().activeFileId).toBe('file-2');

    // Close remaining tabs
    useEditorStore.getState().closeTab('file-2');
    expect(useEditorStore.getState().activeFileId).toBe('file-1');

    useEditorStore.getState().closeTab('file-1');
    expect(useEditorStore.getState().activeFileId).toBeNull();
    expect(useEditorStore.getState().tabs).toHaveLength(0);
  });

  it('closes other tabs or all tabs', () => {
    useEditorStore.getState().openTab({ fileId: 'file-1', path: '1.tex', name: '1.tex' });
    useEditorStore.getState().openTab({ fileId: 'file-2', path: '2.tex', name: '2.tex' });
    useEditorStore.getState().openTab({ fileId: 'file-3', path: '3.tex', name: '3.tex' });

    useEditorStore.getState().closeOtherTabs('file-2');
    expect(useEditorStore.getState().tabs).toHaveLength(1);
    expect(useEditorStore.getState().tabs[0]?.fileId).toBe('file-2');
    expect(useEditorStore.getState().activeFileId).toBe('file-2');

    useEditorStore.getState().closeAllTabs();
    expect(useEditorStore.getState().tabs).toHaveLength(0);
    expect(useEditorStore.getState().activeFileId).toBeNull();
  });

  it('tracks dirty unsaved changes per document', () => {
    useEditorStore.getState().openTab({ fileId: 'file-1', path: '1.tex', name: '1.tex' });
    useEditorStore.getState().setTabDirty('file-1', true, 'draft text');

    const cached = useEditorStore.getState().cachedStates['file-1'];
    expect(cached?.isDirty).toBe(true);
    expect(cached?.localDraft).toBe('draft text');

    useEditorStore.getState().setTabDirty('file-1', false);
    expect(useEditorStore.getState().cachedStates['file-1']?.isDirty).toBe(false);
  });

  it('preserves cached editor cursor and scroll position', () => {
    useEditorStore.getState().openTab({ fileId: 'file-1', path: '1.tex', name: '1.tex' });
    useEditorStore.getState().saveViewState('file-1', {
      cursor: { line: 42, ch: 10 },
      scrollTop: 350,
    });

    const cached = useEditorStore.getState().cachedStates['file-1'];
    expect(cached?.cursor).toEqual({ line: 42, ch: 10 });
    expect(cached?.scrollTop).toBe(350);
  });

  it('updates tab path and title when file is renamed or moved', () => {
    useEditorStore.getState().openTab({ fileId: 'file-1', path: 'chapters/intro.tex', name: 'intro.tex' });
    useEditorStore.getState().updateTabPath('file-1', 'sections/introduction.tex', 'introduction.tex');

    const tab = useEditorStore.getState().tabs[0];
    expect(tab?.path).toBe('sections/introduction.tex');
    expect(tab?.name).toBe('introduction.tex');
  });

  it('removes tabs for subtree when parent directory is deleted', () => {
    useEditorStore.getState().openTab({ fileId: 'file-1', path: 'main.tex', name: 'main.tex' });
    useEditorStore.getState().openTab({ fileId: 'file-2', path: 'sections/1.tex', name: '1.tex' });
    useEditorStore.getState().openTab({ fileId: 'file-3', path: 'sections/2.tex', name: '2.tex' });

    useEditorStore.getState().setActiveTab('file-2');
    useEditorStore.getState().removeTabsBySubtree(['file-2', 'file-3']);

    expect(useEditorStore.getState().tabs).toHaveLength(1);
    expect(useEditorStore.getState().tabs[0]?.fileId).toBe('file-1');
    expect(useEditorStore.getState().activeFileId).toBe('file-1');
  });
});

