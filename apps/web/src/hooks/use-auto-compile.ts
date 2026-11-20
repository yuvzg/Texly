import { useEffect, useRef } from 'react';
import type { SaveStatus } from './use-document-autosave';
import type { Engine } from '@texly/shared';

export interface UseAutoCompileOptions {
  enabled: boolean;
  saveStatus: SaveStatus;
  lastSavedAt: Date | null;
  isCompiling: boolean;
  compile: (
    engineOverride?: Engine,
    bypassCache?: boolean,
    trigger?: 'MANUAL' | 'AUTO' | 'RETRY',
  ) => Promise<void>;
  debounceMs?: number;
}

/**
 * Automatically triggers compilation after document changes are successfully saved.
 * Enforces a 2500ms debounce window and coalesces rapid document modifications.
 */
export function useAutoCompile({
  enabled,
  saveStatus,
  lastSavedAt,
  isCompiling,
  compile,
  debounceMs = 2500,
}: UseAutoCompileOptions) {
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastCompiledTimestampRef = useRef<number | null>(null);

  // Clear timer safely
  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    const isSaved = saveStatus === 'saved' || saveStatus === 'SAVED';
    // If auto-compile is disabled or document is not in a cleanly saved state, clear timer
    if (!enabled || !isSaved || !lastSavedAt) {
      clearTimer();
      return;
    }

    const savedTime = lastSavedAt.getTime();

    // If we've already compiled for this exact save event, do nothing
    if (lastCompiledTimestampRef.current && savedTime <= lastCompiledTimestampRef.current) {
      return;
    }

    clearTimer();

    timerRef.current = setTimeout(() => {
      // Don't trigger if a compilation is actively running or document became unsaved/saving
      if (!isCompiling && (saveStatus === 'saved' || saveStatus === 'SAVED')) {
        lastCompiledTimestampRef.current = savedTime;
        void compile(undefined, false, 'AUTO');
      }
    }, debounceMs);

    return () => {
      clearTimer();
    };
  }, [enabled, saveStatus, lastSavedAt, isCompiling, compile, debounceMs]);

  return {
    isAutoCompileActive: enabled,
  };
}
