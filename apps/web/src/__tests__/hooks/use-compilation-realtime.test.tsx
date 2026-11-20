import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCompilation } from '@/hooks/use-compilation';
import { socketClient } from '@/lib/socket-client';
import * as compLib from '@/lib/compilations';
import type { CompilationDTO, CompilationLogDTO } from '@texly/shared';

vi.mock('@/lib/compilations', () => ({
  triggerCompilation: vi.fn(),
  fetchCompilation: vi.fn(),
  fetchLatestCompilation: vi.fn(),
  fetchCompilationList: vi.fn().mockResolvedValue([]),
  fetchCompilationLog: vi.fn(),
  fetchCompilationPdf: vi.fn(),
  cancelCompilation: vi.fn(),
  formatCompilationError: vi.fn((err: any) => err.message || 'Compilation error'),
}));

describe('useCompilation Realtime & Interaction (Phase 06B)', () => {
  const projectId = 'proj-realtime-1';

  const mockRunningCompilation: CompilationDTO = {
    id: 'comp-rt-1',
    projectId,
    status: 'RUNNING',
    trigger: 'MANUAL',
    engine: 'PDFLATEX',
    bibTool: 'AUTO',
    mainFilePath: 'main.tex',
    queuedAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    finishedAt: null,
    durationMs: null,
    errorCount: 0,
    warningCount: 0,
    hasPdf: false,
    cacheHit: false,
  };

  const mockSucceededCompilation: CompilationDTO = {
    ...mockRunningCompilation,
    status: 'SUCCEEDED',
    finishedAt: new Date().toISOString(),
    durationMs: 1400,
    hasPdf: true,
  };

  const mockLog: CompilationLogDTO = {
    diagnostics: [],
    counts: { errors: 0, warnings: 0 },
    truncated: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (compLib.fetchLatestCompilation as any).mockResolvedValue(null);
    (compLib.fetchCompilationList as any).mockResolvedValue([]);
    (compLib.fetchCompilationLog as any).mockResolvedValue(mockLog);
  });

  it('joins project socket room on mount and leaves on unmount', () => {
    const joinSpy = vi.spyOn(socketClient, 'joinProject');
    const leaveSpy = vi.spyOn(socketClient, 'leaveProject');

    const { unmount } = renderHook(() =>
      useCompilation({
        projectId,
      }),
    );

    expect(joinSpy).toHaveBeenCalledWith(projectId);

    unmount();
    expect(leaveSpy).toHaveBeenCalledWith(projectId);
  });

  it('updates state to QUEUED and isCompiling=true on compilation.queued event', () => {
    let queuedCallback: any;
    vi.spyOn(socketClient, 'onCompilationQueued').mockImplementation((cb: any) => {
      queuedCallback = cb;
      return () => {};
    });

    const { result } = renderHook(() =>
      useCompilation({
        projectId,
      }),
    );

    expect(result.current.isCompiling).toBe(false);

    act(() => {
      queuedCallback?.({
        projectId,
        compilationId: 'comp-rt-1',
        status: 'QUEUED',
        timestamp: new Date().toISOString(),
      });
    });

    expect(result.current.isCompiling).toBe(true);
    expect(result.current.currentCompilation?.status).toBe('QUEUED');
  });

  it('updates state to RUNNING on compilation.started event', () => {
    let startedCallback: any;
    vi.spyOn(socketClient, 'onCompilationStarted').mockImplementation((cb: any) => {
      startedCallback = cb;
      return () => {};
    });

    const { result } = renderHook(() =>
      useCompilation({
        projectId,
      }),
    );

    act(() => {
      startedCallback?.({
        projectId,
        compilationId: 'comp-rt-1',
        status: 'RUNNING',
        timestamp: new Date().toISOString(),
      });
    });

    expect(result.current.isCompiling).toBe(true);
  });

  it('updates to SUCCEEDED and fetches diagnostics on compilation.finished event', async () => {
    let finishedCallback: any;
    vi.spyOn(socketClient, 'onCompilationFinished').mockImplementation((cb: any) => {
      finishedCallback = cb;
      return () => {};
    });
    (compLib.fetchCompilation as any).mockResolvedValue(mockSucceededCompilation);

    const onSuccess = vi.fn();
    const { result } = renderHook(() =>
      useCompilation({
        projectId,
        onSuccess,
      }),
    );

    await act(async () => {
      await finishedCallback?.({
        projectId,
        compilationId: 'comp-rt-1',
        status: 'SUCCEEDED',
        hasPdf: true,
        errorCount: 0,
        warningCount: 0,
        timestamp: new Date().toISOString(),
      });
    });

    expect(result.current.isCompiling).toBe(false);
    expect(result.current.currentCompilation?.status).toBe('SUCCEEDED');
    expect(result.current.lastSuccessfulCompilation?.status).toBe('SUCCEEDED');
    expect(onSuccess).toHaveBeenCalledWith(mockSucceededCompilation);
  });

  it('recompileFromScratch invokes compilation with draft=false and bypassCache=true', async () => {
    (compLib.triggerCompilation as any).mockResolvedValue(mockRunningCompilation);
    (compLib.fetchCompilation as any).mockResolvedValue(mockSucceededCompilation);

    const { result } = renderHook(() =>
      useCompilation({
        projectId,
      }),
    );

    await act(async () => {
      await result.current.recompileFromScratch('XELATEX');
    });

    expect(compLib.triggerCompilation).toHaveBeenCalledWith(projectId, {
      engine: 'XELATEX',
      trigger: 'MANUAL',
      draft: false,
    });
  });
});
