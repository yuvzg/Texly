'use client';

import React, { useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLineGutter,
  highlightActiveLine,
  drawSelection,
  dropCursor,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { bracketMatching, indentOnInput } from '@codemirror/language';
import { StreamLanguage, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { stex } from '@codemirror/legacy-modes/mode/stex';
import {
  lintGutter,
  setDiagnostics,
  nextDiagnostic,
  previousDiagnostic,
  type Diagnostic as CMDiagnostic,
} from '@codemirror/lint';
import type { CompilationDiagnostic } from '@texly/shared';

export interface CodeMirrorEditorHandle {
  goToLine: (line: number, column?: number) => void;
  focus: () => void;
  getView: () => EditorView | null;
}

export interface CodeMirrorEditorProps {
  value: string;
  onChange?: (val: string) => void;
  diagnostics?: CompilationDiagnostic[] | undefined;
  readOnly?: boolean;
  onCompile?: () => void;
  className?: string;
  placeholder?: string;
}

// Dark Emerald Theme definition for CodeMirror 6
const darkEmeraldTheme = EditorView.theme(
  {
    '&': {
      color: '#E0E7E4',
      backgroundColor: '#050807',
      height: '100%',
      fontFamily:
        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      fontSize: '13.5px',
      lineHeight: '1.6',
    },
    '.cm-scroller': {
      overflow: 'auto',
      fontFamily: 'inherit',
    },
    '.cm-content': {
      caretColor: '#00D69A',
      padding: '16px 0',
      minHeight: '100%',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: '#00D69A',
      borderLeftWidth: '2px',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: '#003D30 !important',
    },
    '.cm-gutters': {
      backgroundColor: '#050807',
      color: '#4B6B5E',
      borderRight: '1px solid rgba(0, 214, 154, 0.12)',
      paddingRight: '6px',
      minWidth: '42px',
      userSelect: 'none',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'rgba(0, 61, 48, 0.4)',
      color: '#00D69A',
      fontWeight: '600',
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(0, 61, 48, 0.15)',
    },
    '.cm-line': {
      paddingLeft: '12px',
      paddingRight: '12px',
    },
    // Lint Gutters & Markers
    '.cm-gutter-lint': {
      width: '16px',
    },
    '.cm-lint-marker': {
      width: '12px',
      height: '12px',
    },
    '.cm-lint-marker-error': {
      color: '#F43F5E',
    },
    '.cm-lint-marker-warning': {
      color: '#F59E0B',
    },
    '.cm-lint-marker-info': {
      color: '#38BDF8',
    },
    // Squiggly Underlines
    '.cm-lintRange-error': {
      backgroundImage: 'none',
      borderBottom: '2px wavy #F43F5E',
      paddingBottom: '1px',
    },
    '.cm-lintRange-warning': {
      backgroundImage: 'none',
      borderBottom: '2px wavy #F59E0B',
      paddingBottom: '1px',
    },
    '.cm-lintRange-info': {
      backgroundImage: 'none',
      borderBottom: '2px wavy #38BDF8',
      paddingBottom: '1px',
    },
    // Diagnostics Tooltips
    '.cm-tooltip-lint': {
      backgroundColor: '#0A120E !important',
      border: '1px solid rgba(0, 214, 154, 0.25) !important',
      borderRadius: '8px',
      color: '#E0E7E4',
      padding: '6px 10px',
      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.7), 0 0 15px rgba(0, 214, 154, 0.08)',
      fontSize: '12px',
      maxWidth: '450px',
    },
    '.cm-diagnostic': {
      padding: '4px 0',
      borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    },
    '.cm-diagnostic:last-child': {
      borderBottom: 'none',
    },
    '.cm-diagnostic-error': {
      borderLeft: '3px solid #F43F5E',
      paddingLeft: '8px',
    },
    '.cm-diagnostic-warning': {
      borderLeft: '3px solid #F59E0B',
      paddingLeft: '8px',
    },
    '.cm-diagnostic-info': {
      borderLeft: '3px solid #38BDF8',
      paddingLeft: '8px',
    },
  },
  { dark: true },
);

export const CodeMirrorEditor = forwardRef<CodeMirrorEditorHandle, CodeMirrorEditorProps>(
  function CodeMirrorEditor(
    { value, onChange, diagnostics = [], readOnly = false, onCompile, className },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const readOnlyCompartmentRef = useRef<Compartment>(new Compartment());

    // Expose imperative methods to parent
    useImperativeHandle(
      ref,
      () => ({
        goToLine: (line: number, column?: number) => {
          const view = viewRef.current;
          if (!view) return;

          const docLines = view.state.doc.lines;
          const targetLine = Math.min(Math.max(1, line), docLines);
          const lineObj = view.state.doc.line(targetLine);
          const col = column ? Math.max(1, column) : 1;
          const pos = Math.min(lineObj.from + col - 1, lineObj.to);

          view.dispatch({
            selection: { anchor: pos, head: pos },
            scrollIntoView: true,
          });
          view.focus();
        },
        focus: () => {
          viewRef.current?.focus();
        },
        getView: () => viewRef.current,
      }),
      [],
    );

    // Convert CompilationDiagnostic to CodeMirror Diagnostic
    const convertDiagnostics = useCallback(
      (diags: CompilationDiagnostic[], state: EditorState): CMDiagnostic[] => {
        const docLines = state.doc.lines;
        if (docLines === 0) return [];

        return diags
          .filter((d) => d && typeof d.line === 'number')
          .map((d) => {
            const targetLine = Math.min(Math.max(1, d.line), docLines);
            const lineObj = state.doc.line(targetLine);
            const from = lineObj.from;
            const to = lineObj.to > from ? lineObj.to : Math.min(from + 1, state.doc.length);

            const severity: CMDiagnostic['severity'] =
              d.level === 'error' ? 'error' : d.level === 'warning' ? 'warning' : 'info';

            const message = d.context ? `${d.message}\n${d.context}` : d.message;

            return {
              from,
              to,
              severity,
              message,
            };
          });
      },
      [],
    );

    // Initialize CodeMirror instance
    useEffect(() => {
      if (!containerRef.current) return;

      const readOnlyCompartment = readOnlyCompartmentRef.current;

      const updateListener = EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const newDoc = update.state.doc.toString();
          onChange?.(newDoc);
        }
      });

      const compileKeymap = keymap.of([
        {
          key: 'Mod-Enter',
          run: () => {
            onCompile?.();
            return true;
          },
        },
        {
          key: 'F8',
          run: nextDiagnostic,
        },
        {
          key: 'Shift-F8',
          run: previousDiagnostic,
        },
      ]);

      const state = EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          drawSelection(),
          dropCursor(),
          bracketMatching(),
          indentOnInput(),
          history(),
          StreamLanguage.define(stex),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          lintGutter(),
          darkEmeraldTheme,
          readOnlyCompartment.of(EditorState.readOnly.of(readOnly)),
          compileKeymap,
          keymap.of([...defaultKeymap, ...historyKeymap]),
          updateListener,
        ],
      });

      const view = new EditorView({
        state,
        parent: containerRef.current,
      });

      viewRef.current = view;

      // Initial diagnostics dispatch if any
      if (diagnostics.length > 0) {
        const cmDiags = convertDiagnostics(diagnostics, view.state);
        view.dispatch(setDiagnostics(view.state, cmDiags));
      }

      return () => {
        view.destroy();
        viewRef.current = null;
      };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Sync external value changes without losing cursor
    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;

      const currentValue = view.state.doc.toString();
      if (value !== currentValue) {
        view.dispatch({
          changes: { from: 0, to: currentValue.length, insert: value },
        });
      }
    }, [value]);

    // Sync readOnly changes
    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;

      view.dispatch({
        effects: readOnlyCompartmentRef.current.reconfigure(EditorState.readOnly.of(readOnly)),
      });
    }, [readOnly]);

    // Sync diagnostics changes
    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;

      const cmDiags = convertDiagnostics(diagnostics, view.state);
      view.dispatch(setDiagnostics(view.state, cmDiags));
    }, [diagnostics, convertDiagnostics]);

    return (
      <div
        ref={containerRef}
        data-testid="codemirror-editor-container"
        className={`w-full h-full relative overflow-hidden bg-[#050807] ${className ?? ''}`}
      />
    );
  },
);
