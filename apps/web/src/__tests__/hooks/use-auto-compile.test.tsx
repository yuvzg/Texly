import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutoCompile } from '@/hooks/use-auto-compile';
import type { SaveStatus } from '@/hooks/use-document-autosave';

describe('useAutoCompile Hook', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not trigger compile when enabled is false', () => {
    const mockCompile = vi.fn().mockResolvedValue(undefined);
    const saveTime = new Date();

    renderHook(() =>
      useAutoCompile({
        enabled: false,
        saveStatus: 'saved',
        lastSavedAt: saveTime,
        isCompiling: false,
        compile: mockCompile,
        debounceMs: 2500,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(mockCompile).not.toHaveBeenCalled();
  });

  it('triggers compile after debounce when enabled is true and document is saved', () => {
    const mockCompile = vi.fn().mockResolvedValue(undefined);
    const saveTime = new Date('2026-11-20T10:00:00Z');

    renderHook(() =>
      useAutoCompile({
        enabled: true,
        saveStatus: 'saved',
        lastSavedAt: saveTime,
        isCompiling: false,
        compile: mockCompile,
        debounceMs: 2500,
      }),
    );

    // Before debounce elapsed
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(mockCompile).not.toHaveBeenCalled();

    // After debounce elapsed
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(mockCompile).toHaveBeenCalledTimes(1);
    expect(mockCompile).toHaveBeenCalledWith(undefined, false, 'AUTO');
  });

  it('does not trigger compile if isCompiling is true when debounce fires', () => {
    const mockCompile = vi.fn().mockResolvedValue(undefined);
    const saveTime = new Date('2026-11-20T10:00:00Z');

    renderHook(() =>
      useAutoCompile({
        enabled: true,
        saveStatus: 'saved',
        lastSavedAt: saveTime,
        isCompiling: true,
        compile: mockCompile,
        debounceMs: 2500,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(mockCompile).not.toHaveBeenCalled();
  });

  it('coalesces rapid saves and debounces from the latest save', () => {
    const mockCompile = vi.fn().mockResolvedValue(undefined);
    let saveTime = new Date('2026-11-20T10:00:00Z');

    const { rerender } = renderHook(
      ({ lastSaved }) =>
        useAutoCompile({
          enabled: true,
          saveStatus: 'saved',
          lastSavedAt: lastSaved,
          isCompiling: false,
          compile: mockCompile,
          debounceMs: 2500,
        }),
      {
        initialProps: { lastSaved: saveTime },
      },
    );

    // Advance 1500ms
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    // New save occurs before debounce finishes
    saveTime = new Date('2026-11-20T10:00:02Z');
    rerender({ lastSaved: saveTime });

    // Advance 1500ms (total 3000ms from start, but only 1500ms from second save)
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(mockCompile).not.toHaveBeenCalled();

    // Advance another 1100ms (total 2600ms from second save)
    act(() => {
      vi.advanceTimersByTime(1100);
    });
    expect(mockCompile).toHaveBeenCalledTimes(1);
  });
});
