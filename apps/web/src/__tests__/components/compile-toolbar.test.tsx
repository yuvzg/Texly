import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { CompileToolbar } from '@/components/editor/compile-toolbar';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { ErrorCodeEnum, type CompilationDTO, type CompilationLogDTO } from '@texly/shared';

const mockProjectId = '018f6c4a-8e2b-7c1e-9a1d-4f8b2c5e7a90';

const mockQueuedCompilation: CompilationDTO = {
  id: '018f6c4a-8e2b-7c1e-9a1d-comp00000001',
  projectId: mockProjectId,
  status: 'QUEUED',
  trigger: 'MANUAL',
  engine: 'PDFLATEX',
  bibTool: 'BIBTEX',
  mainFilePath: 'main.tex',
  queuedAt: new Date().toISOString(),
  errorCount: 0,
  warningCount: 0,
  hasPdf: false,
  cacheHit: false,
};

const mockRunningCompilation: CompilationDTO = {
  ...mockQueuedCompilation,
  status: 'RUNNING',
  startedAt: new Date().toISOString(),
};

const mockSucceededCompilation: CompilationDTO = {
  ...mockQueuedCompilation,
  status: 'SUCCEEDED',
  startedAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
  durationMs: 1420,
  errorCount: 0,
  warningCount: 1,
  hasPdf: true,
  cacheHit: false,
};

const mockFailedCompilation: CompilationDTO = {
  ...mockQueuedCompilation,
  id: '018f6c4a-8e2b-7c1e-9a1d-comp00000002',
  status: 'FAILED',
  startedAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
  durationMs: 950,
  errorCount: 2,
  warningCount: 0,
  hasPdf: false,
  errorCode: 'COMPILATION_FAILED',
};

describe('CompileToolbar & useCompilation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    // Default mock responses
    vi.spyOn(apiClient, 'get').mockImplementation(async (path: string) => {
      if (path.includes('/latest')) {
        throw new ApiClientError(404, ErrorCodeEnum.NOT_FOUND, 'Not found');
      }
      if (path.includes('/compilations') && !path.includes('/log') && !path.includes('/pdf')) {
        return [] as unknown as never;
      }
      return {} as unknown as never;
    });

    vi.spyOn(apiClient, 'post').mockResolvedValue({} as unknown as never);
    vi.spyOn(apiClient, 'delete').mockResolvedValue({} as unknown as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders initial idle compile button and not-compiled status', async () => {
    await act(async () => {
      render(<CompileToolbar projectId={mockProjectId} />);
    });

    expect(screen.getByTestId('compile-button')).toBeInTheDocument();
    expect(screen.getByTestId('status-chip-not-compiled')).toBeInTheDocument();
    expect(screen.getByText(/Not compiled/i)).toBeInTheDocument();
  });

  it('flushes pending save before triggering compilation', async () => {
    const onFlushSave = vi.fn().mockResolvedValue(true);
    vi.spyOn(apiClient, 'post').mockResolvedValue(mockQueuedCompilation as never);

    render(<CompileToolbar projectId={mockProjectId} onFlushSave={onFlushSave} />);

    const compileBtn = screen.getByTestId('compile-button');
    await act(async () => {
      fireEvent.click(compileBtn);
    });

    expect(onFlushSave).toHaveBeenCalledTimes(1);
    expect(apiClient.post).toHaveBeenCalledWith(
      `/projects/${mockProjectId}/compilations`,
      expect.objectContaining({ engine: 'PDFLATEX', trigger: 'MANUAL' }),
    );
  });

  it('aborts compilation and displays error when save flush fails', async () => {
    const onFlushSave = vi.fn().mockResolvedValue(false);

    render(<CompileToolbar projectId={mockProjectId} onFlushSave={onFlushSave} />);

    const compileBtn = screen.getByTestId('compile-button');
    await act(async () => {
      fireEvent.click(compileBtn);
    });

    expect(onFlushSave).toHaveBeenCalledTimes(1);
    expect(apiClient.post).not.toHaveBeenCalled();

    expect(screen.getByTestId('compilation-error-banner')).toBeInTheDocument();
    expect(screen.getByText(/Unable to save changes before compiling/i)).toBeInTheDocument();
  });

  it('prevents duplicate compilation requests from rapid clicks', async () => {
    let resolvePost: (val: unknown) => void;
    vi.spyOn(apiClient, 'post').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePost = resolve;
        }),
    );

    render(<CompileToolbar projectId={mockProjectId} />);

    const compileBtn = screen.getByTestId('compile-button');
    await act(async () => {
      fireEvent.click(compileBtn);
      fireEvent.click(compileBtn);
      fireEvent.click(compileBtn);
    });

    // Should only be called once
    expect(apiClient.post).toHaveBeenCalledTimes(1);

    // Button should be disabled during compilation
    expect(compileBtn).toBeDisabled();

    // Clean up in-flight promise
    await act(async () => {
      resolvePost!(mockQueuedCompilation);
    });
  });

  it('triggers compilation with Mod-Enter keyboard shortcut', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue(mockQueuedCompilation as never);

    render(<CompileToolbar projectId={mockProjectId} />);

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          metaKey: true,
          bubbles: true,
        }),
      );
    });

    expect(apiClient.post).toHaveBeenCalledTimes(1);
  });

  it('polls status with backoff and stops upon terminal SUCCEEDED state', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue(mockQueuedCompilation as never);

    // Initial status check returns RUNNING, second check returns SUCCEEDED
    vi.spyOn(apiClient, 'get').mockImplementation(async (path: string) => {
      if (path === `/compilations/${mockQueuedCompilation.id}`) {
        return mockRunningCompilation as never;
      }
      return [] as unknown as never;
    });

    render(<CompileToolbar projectId={mockProjectId} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('compile-button'));
    });

    expect(screen.getByTestId('status-chip-queued')).toBeInTheDocument();

    // Fast-forward initial 2000ms delay
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByTestId('status-chip-running')).toBeInTheDocument();

    // Next status check returns SUCCEEDED
    vi.spyOn(apiClient, 'get').mockImplementation(async (path: string) => {
      if (path === `/compilations/${mockQueuedCompilation.id}`) {
        return mockSucceededCompilation as never;
      }
      return [] as unknown as never;
    });

    // Fast-forward next backoff delay (3000ms)
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByTestId('status-chip-succeeded')).toBeInTheDocument();
    expect(screen.getByTestId('download-pdf-button')).toBeInTheDocument();

    // Ensure polling stops: further timer advances make no more calls
    const callCount = vi.mocked(apiClient.get).mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });
    expect(vi.mocked(apiClient.get).mock.calls.length).toBe(callCount);
  });

  it('handles immediate cache hit with 201 SUCCEEDED', async () => {
    const cacheHitCompilation = {
      ...mockSucceededCompilation,
      cacheHit: true,
    };
    vi.spyOn(apiClient, 'post').mockResolvedValue(cacheHitCompilation as never);

    render(<CompileToolbar projectId={mockProjectId} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('compile-button'));
    });

    expect(screen.getByTestId('status-chip-succeeded')).toBeInTheDocument();
    expect(screen.getByTestId('download-pdf-button')).toBeInTheDocument();
  });

  it('displays user-friendly error message on missing main file and limits', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValue(
      new ApiClientError(404, ErrorCodeEnum.NOT_FOUND, 'Main file not found'),
    );

    render(<CompileToolbar projectId={mockProjectId} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('compile-button'));
    });

    expect(screen.getByTestId('compilation-error-banner')).toBeInTheDocument();
    expect(
      screen.getByText(/Main document file not found\. Please set a valid main file/i),
    ).toBeInTheDocument();

    // Error can be dismissed
    const dismissBtn = screen.getByTestId('compilation-error-banner').querySelector('button');
    await act(async () => {
      fireEvent.click(dismissBtn!);
    });
    expect(screen.queryByTestId('compilation-error-banner')).not.toBeInTheDocument();
  });

  it('allows cancelling a queued or running compilation', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue(mockRunningCompilation as never);
    vi.spyOn(apiClient, 'delete').mockResolvedValue({
      ...mockRunningCompilation,
      status: 'CANCELLED',
    } as never);

    render(<CompileToolbar projectId={mockProjectId} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('compile-button'));
    });

    const cancelBtn = screen.getByTestId('cancel-compile-button');
    expect(cancelBtn).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(cancelBtn);
    });

    expect(apiClient.delete).toHaveBeenCalledWith(`/compilations/${mockRunningCompilation.id}`);
    expect(screen.getByTestId('status-chip-cancelled')).toBeInTheDocument();
  });

  it('opens history modal, lists compilations and opens diagnostics log modal', async () => {
    vi.useRealTimers();

    vi.spyOn(apiClient, 'get').mockImplementation(async (path: string) => {
      if (path.includes('/projects/') && path.includes('/compilations')) {
        return [mockSucceededCompilation, mockFailedCompilation] as never;
      }
      if (path.includes('/log')) {
        const mockLog: CompilationLogDTO = {
          diagnostics: [
            {
              ordinal: 1,
              level: 'error',
              file: 'main.tex',
              line: 42,
              message: 'Undefined control sequence \\foo',
            },
          ],
          counts: { errors: 1, warnings: 0 },
          truncated: false,
          rawLogUrl: 'https://storage.texly.local/raw.log',
        };
        return mockLog as never;
      }
      return {} as unknown as never;
    });

    render(<CompileToolbar projectId={mockProjectId} />);

    // Open history modal
    await act(async () => {
      fireEvent.click(screen.getByTestId('history-button'));
    });

    expect(screen.getByTestId('compilation-history-modal')).toBeInTheDocument();
    expect(screen.getByTestId(`history-item-${mockSucceededCompilation.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`history-item-${mockFailedCompilation.id}`)).toBeInTheDocument();

    // Click "Log" button on the first item
    const logBtn = screen.getAllByRole('button', { name: /Log/i })[0];
    await act(async () => {
      fireEvent.click(logBtn!);
    });

    // History modal closes and log modal opens
    await waitFor(() => {
      expect(screen.getByTestId('compilation-log-modal')).toBeInTheDocument();
    });

    expect(screen.getByText(/Undefined control sequence \\foo/i)).toBeInTheDocument();
    expect(screen.getByText('main.tex:42')).toBeInTheDocument();
  });
});
