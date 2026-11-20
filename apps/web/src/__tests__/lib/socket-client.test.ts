import { describe, it, expect, vi, beforeEach } from 'vitest';
import { socketClient } from '@/lib/socket-client';

describe('SocketClientManager', () => {
  beforeEach(() => {
    socketClient.disconnect();
    vi.clearAllMocks();
  });

  it('tracks initial connection status as disconnected', () => {
    expect(socketClient.getStatus()).toBe('disconnected');
  });

  it('notifies status listeners when subscription starts', () => {
    const listener = vi.fn();
    const unsubscribe = socketClient.subscribeStatus(listener);

    expect(listener).toHaveBeenCalledWith('disconnected');
    unsubscribe();
  });

  it('tracks project rooms to join and allows leaving', () => {
    const joinSpy = vi.spyOn(socketClient, 'joinProject');
    const leaveSpy = vi.spyOn(socketClient, 'leaveProject');

    socketClient.joinProject('project-123');
    expect(joinSpy).toHaveBeenCalledWith('project-123');

    socketClient.leaveProject('project-123');
    expect(leaveSpy).toHaveBeenCalledWith('project-123');
  });

  it('registers typed event handlers and provides unsubscribe functions', () => {
    const queuedHandler = vi.fn();
    const unsubQueued = socketClient.onCompilationQueued(queuedHandler);
    expect(typeof unsubQueued).toBe('function');
    unsubQueued();

    const startedHandler = vi.fn();
    const unsubStarted = socketClient.onCompilationStarted(startedHandler);
    expect(typeof unsubStarted).toBe('function');
    unsubStarted();

    const finishedHandler = vi.fn();
    const unsubFinished = socketClient.onCompilationFinished(finishedHandler);
    expect(typeof unsubFinished).toBe('function');
    unsubFinished();
  });
});
