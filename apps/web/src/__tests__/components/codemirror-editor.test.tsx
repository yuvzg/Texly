import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CodeMirrorEditor, type CodeMirrorEditorHandle } from '@/components/editor/codemirror-editor';
import type { CompilationDiagnostic } from '@texly/shared';

describe('CodeMirrorEditor Component', () => {
  const mockDiagnostics: CompilationDiagnostic[] = [
    {
      ordinal: 1,
      level: 'error',
      file: 'main.tex',
      line: 1,
      message: 'Undefined control sequence',
    },
  ];

  it('renders editor container with dark emerald styling', () => {
    render(
      <CodeMirrorEditor
        value="\documentclass{article}\n\begin{document}\nHello World\n\end{document}"
        diagnostics={mockDiagnostics}
      />,
    );

    const container = screen.getByTestId('codemirror-editor-container');
    expect(container).toBeInTheDocument();
    expect(container).toHaveClass('bg-[#050807]');
  });

  it('exposes imperative handle methods goToLine and focus', () => {
    const ref = React.createRef<CodeMirrorEditorHandle>();
    render(
      <CodeMirrorEditor
        ref={ref}
        value="\documentclass{article}\n\begin{document}\nLine 3\n\end{document}"
      />,
    );

    expect(ref.current).toBeDefined();
    expect(typeof ref.current?.goToLine).toBe('function');
    expect(typeof ref.current?.focus).toBe('function');

    // Should navigate without throwing
    expect(() => {
      ref.current?.goToLine(2);
      ref.current?.focus();
    }).not.toThrow();
  });
});
