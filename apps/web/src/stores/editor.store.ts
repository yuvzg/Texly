import { create } from 'zustand';

export interface DocumentTab {
  fileId: string;
  documentId?: string | undefined;
  path: string;
  name: string;
}

export interface CachedEditorState {
  cursor?: { line: number; ch: number } | undefined;
  scrollTop?: number | undefined;
  localDraft?: string | undefined;
  isDirty?: boolean | undefined;
}

export interface EditorStoreState {
  tabs: DocumentTab[];
  activeFileId: string | null;
  cachedStates: Record<string, CachedEditorState>;
  lastOpenedFileId: string | null;

  // Actions
  openTab: (tab: DocumentTab) => void;
  closeTab: (fileId: string) => void;
  setActiveTab: (fileId: string) => void;
  closeOtherTabs: (fileId: string) => void;
  closeAllTabs: () => void;
  setTabDirty: (fileId: string, isDirty: boolean, localDraft?: string) => void;
  saveViewState: (
    fileId: string,
    viewState: { cursor?: { line: number; ch: number }; scrollTop?: number },
  ) => void;
  updateTabPath: (fileId: string, newPath: string, newName: string) => void;
  removeTabsBySubtree: (fileIds: string[]) => void;
  clearCachedState: (fileId: string) => void;
  reset: () => void;
}

export const useEditorStore = create<EditorStoreState>((set, get) => ({
  tabs: [],
  activeFileId: null,
  cachedStates: {},
  lastOpenedFileId: null,

  openTab: (tab) => {
    const { tabs } = get();
    const existingIndex = tabs.findIndex((t) => t.fileId === tab.fileId);

    if (existingIndex !== -1) {
      // Tab already open, just activate it and ensure metadata is up to date
      const updatedTabs = [...tabs];
      updatedTabs[existingIndex] = { ...updatedTabs[existingIndex], ...tab };
      set({
        tabs: updatedTabs,
        activeFileId: tab.fileId,
        lastOpenedFileId: tab.fileId,
      });
      return;
    }

    set({
      tabs: [...tabs, tab],
      activeFileId: tab.fileId,
      lastOpenedFileId: tab.fileId,
    });
  },

  closeTab: (fileId) => {
    const { tabs, activeFileId } = get();
    const tabIndex = tabs.findIndex((t) => t.fileId === fileId);
    if (tabIndex === -1) return;

    const newTabs = tabs.filter((t) => t.fileId !== fileId);
    let nextActiveId = activeFileId;

    if (activeFileId === fileId) {
      if (newTabs.length === 0) {
        nextActiveId = null;
      } else {
        // Prefer next tab, or previous if closed tab was at the end
        const newIndex = Math.min(tabIndex, newTabs.length - 1);
        nextActiveId = newTabs[newIndex]?.fileId ?? null;
      }
    }

    set({
      tabs: newTabs,
      activeFileId: nextActiveId,
      lastOpenedFileId: nextActiveId,
    });
  },

  setActiveTab: (fileId) => {
    const { tabs } = get();
    if (tabs.some((t) => t.fileId === fileId)) {
      set({
        activeFileId: fileId,
        lastOpenedFileId: fileId,
      });
    }
  },

  closeOtherTabs: (fileId) => {
    const { tabs } = get();
    const targetTab = tabs.find((t) => t.fileId === fileId);
    if (!targetTab) return;

    set({
      tabs: [targetTab],
      activeFileId: fileId,
      lastOpenedFileId: fileId,
    });
  },

  closeAllTabs: () => {
    set({
      tabs: [],
      activeFileId: null,
      lastOpenedFileId: null,
    });
  },

  setTabDirty: (fileId, isDirty, localDraft) => {
    const { cachedStates } = get();
    const existing = cachedStates[fileId] || {};

    set({
      cachedStates: {
        ...cachedStates,
        [fileId]: {
          ...existing,
          isDirty,
          ...(localDraft !== undefined ? { localDraft } : {}),
        },
      },
    });
  },

  saveViewState: (fileId, viewState) => {
    const { cachedStates } = get();
    const existing = cachedStates[fileId] || {};

    set({
      cachedStates: {
        ...cachedStates,
        [fileId]: {
          ...existing,
          cursor: viewState.cursor ?? existing.cursor,
          scrollTop: viewState.scrollTop ?? existing.scrollTop,
        },
      },
    });
  },

  updateTabPath: (fileId, newPath, newName) => {
    const { tabs } = get();
    const updatedTabs = tabs.map((t) =>
      t.fileId === fileId ? { ...t, path: newPath, name: newName } : t,
    );
    set({ tabs: updatedTabs });
  },

  removeTabsBySubtree: (fileIds) => {
    const { tabs, activeFileId } = get();
    const idSet = new Set(fileIds);
    const newTabs = tabs.filter((t) => !idSet.has(t.fileId));

    let nextActiveId = activeFileId;
    if (activeFileId && idSet.has(activeFileId)) {
      nextActiveId = newTabs.length > 0 ? (newTabs[0]?.fileId ?? null) : null;
    }

    set({
      tabs: newTabs,
      activeFileId: nextActiveId,
      lastOpenedFileId: nextActiveId,
    });
  },

  clearCachedState: (fileId) => {
    const { cachedStates } = get();
    const rest = { ...cachedStates };
    delete rest[fileId];
    set({ cachedStates: rest });
  },

  reset: () => {
    set({
      tabs: [],
      activeFileId: null,
      cachedStates: {},
      lastOpenedFileId: null,
    });
  },
}));

