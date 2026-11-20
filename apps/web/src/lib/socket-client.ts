import { io, Socket } from 'socket.io-client';
import { getAccessToken } from './api-client';
import type {
  CompilationQueuedEvent,
  CompilationStartedEvent,
  CompilationFinishedEvent,
} from '@texly/shared';

export type SocketConnectionStatus = 'connected' | 'connecting' | 'disconnected';

class SocketClientManager {
  private socket: Socket | null = null;
  private joinedProjects = new Set<string>();
  private statusListeners = new Set<(status: SocketConnectionStatus) => void>();
  private currentStatus: SocketConnectionStatus = 'disconnected';

  private setStatus(status: SocketConnectionStatus) {
    if (this.currentStatus !== status) {
      this.currentStatus = status;
      for (const listener of this.statusListeners) {
        try {
          listener(status);
        } catch {
          // Ignore listener errors
        }
      }
    }
  }

  public getStatus(): SocketConnectionStatus {
    return this.currentStatus;
  }

  public subscribeStatus(listener: (status: SocketConnectionStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.currentStatus);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  public connect(): Socket | null {
    if (typeof window === 'undefined') {
      return null;
    }

    if (this.socket && this.socket.connected) {
      return this.socket;
    }

    if (this.socket && !this.socket.connected) {
      this.setStatus('connecting');
      this.socket.connect();
      return this.socket;
    }

    this.setStatus('connecting');

    const token = getAccessToken();
    const socketUrl =
      process.env.NEXT_PUBLIC_SOCKET_URL ||
      (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4000');

    this.socket = io(socketUrl, {
      path: '/socket.io',
      auth: {
        token: token ?? '',
      },
      ...(token
        ? {
            extraHeaders: {
              Authorization: `Bearer ${token}`,
            },
          }
        : {}),
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      transports: ['websocket', 'polling'],
    });

    this.socket.on('connect', () => {
      this.setStatus('connected');
      // Re-join any previously tracked project rooms
      for (const projectId of this.joinedProjects) {
        this.socket?.emit('project.join', { projectId });
      }
    });

    this.socket.on('disconnect', () => {
      this.setStatus('disconnected');
    });

    this.socket.on('connect_error', () => {
      this.setStatus('disconnected');
    });

    return this.socket;
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.setStatus('disconnected');
  }

  public joinProject(projectId: string): void {
    if (!projectId) return;
    this.joinedProjects.add(projectId);

    const socket = this.connect();
    if (socket && socket.connected) {
      socket.emit('project.join', { projectId });
    }
  }

  public leaveProject(projectId: string): void {
    if (!projectId) return;
    this.joinedProjects.delete(projectId);

    if (this.socket && this.socket.connected) {
      this.socket.emit('project.leave', { projectId });
    }
  }

  public onCompilationQueued(handler: (event: CompilationQueuedEvent) => void): () => void {
    const socket = this.connect();
    if (!socket) return () => {};

    const eventName = 'compilation.queued';
    socket.on(eventName, handler);
    return () => {
      socket.off(eventName, handler);
    };
  }

  public onCompilationStarted(handler: (event: CompilationStartedEvent) => void): () => void {
    const socket = this.connect();
    if (!socket) return () => {};

    const eventName = 'compilation.started';
    socket.on(eventName, handler);
    return () => {
      socket.off(eventName, handler);
    };
  }

  public onCompilationFinished(handler: (event: CompilationFinishedEvent) => void): () => void {
    const socket = this.connect();
    if (!socket) return () => {};

    const eventName = 'compilation.finished';
    socket.on(eventName, handler);
    return () => {
      socket.off(eventName, handler);
    };
  }

  public on<T = unknown>(eventName: string, handler: (data: T) => void): () => void {
    const socket = this.connect();
    if (!socket) return () => {};

    socket.on(eventName, handler as any);
    return () => {
      socket.off(eventName, handler as any);
    };
  }

  public getRawSocket(): Socket | null {
    return this.socket;
  }
}

export const socketClient = new SocketClientManager();
