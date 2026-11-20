import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { socketClient } from '@/lib/socket-client';
import { FILE_QUERY_KEYS } from './use-files';
import type { DocumentRevisionChangedEvent, FileTreeChangedEvent } from '@texly/shared';
import type { SaveStatus } from './use-document-autosave';

export interface UseRealtimeSyncOptions {
  projectId: string;
  activeDocumentId?: string | undefined;
  saveStatus?: SaveStatus | undefined;
  onRemoteRevisionUpdate?: ((event: DocumentRevisionChangedEvent) => void) | undefined;
  onRemoteRevisionConflict?: ((event: DocumentRevisionChangedEvent) => void) | undefined;
}

export function useRealtimeSync({
  projectId,
  activeDocumentId,
  saveStatus,
  onRemoteRevisionUpdate,
  onRemoteRevisionConflict,
}: UseRealtimeSyncOptions) {
  const queryClient = useQueryClient();
  const saveStatusRef = useRef(saveStatus);
  saveStatusRef.current = saveStatus;

  // Project room subscription
  useEffect(() => {
    if (!projectId) return;

    socketClient.joinProject(projectId);

    return () => {
      socketClient.leaveProject(projectId);
    };
  }, [projectId]);

  // Document room subscription
  useEffect(() => {
    if (!projectId || !activeDocumentId) return;

    socketClient.joinDocument(projectId, activeDocumentId);

    return () => {
      socketClient.leaveDocument(activeDocumentId);
    };
  }, [projectId, activeDocumentId]);

  // Reconnection reconciliation
  useEffect(() => {
    if (!projectId) return;

    const unsubscribe = socketClient.subscribeStatus((status) => {
      if (status === 'connected') {
        void queryClient.invalidateQueries({ queryKey: FILE_QUERY_KEYS.all(projectId) });
        // Attempt project sync to reconcile file tree and compilation state
        void socketClient.requestProjectSync(projectId).catch(() => {
          // Ignore sync failure on background reconnections
        });
      }
    });

    return unsubscribe;
  }, [projectId, queryClient]);

  // File tree changed listener
  useEffect(() => {
    if (!projectId) return;

    const unsubscribe = socketClient.onFileTreeChanged((event: FileTreeChangedEvent) => {
      if (event.projectId === projectId) {
        void queryClient.invalidateQueries({ queryKey: FILE_QUERY_KEYS.all(projectId) });
      }
    });

    return unsubscribe;
  }, [projectId, queryClient]);

  // Document revision changed listener
  useEffect(() => {
    if (!projectId) return;

    const unsubscribe = socketClient.onDocumentRevisionChanged((event: DocumentRevisionChangedEvent) => {
      if (event.projectId !== projectId) return;

      if (event.documentId === activeDocumentId) {
        const currentStatus = saveStatusRef.current;
        if (currentStatus === 'DIRTY' || currentStatus === 'SAVING') {
          // User is actively editing or saving - do not overwrite! Flag potential conflict
          onRemoteRevisionConflict?.(event);
        } else {
          // Clean state - can safely reload document
          onRemoteRevisionUpdate?.(event);
        }
      }
    });

    return unsubscribe;
  }, [projectId, activeDocumentId, onRemoteRevisionUpdate, onRemoteRevisionConflict]);
}
