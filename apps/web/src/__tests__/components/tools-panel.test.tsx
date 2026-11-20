import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToolsPanel } from '@/components/editor/tools-panel';
import type { CompilationDiagnostic, CompilationLogDTO } from '@texly/shared';

describe('ToolsPanel Component', () => {
  const mockDiagnostics: CompilationDiagnostic[] = [
    {
      ordinal: 1,
      level: 'error',
      file: 'main.tex',
      line: 42,
      message: 'Undefined control sequence \\invalidCommand',
      context: 'l.42 \\invalidCommand',
    },
    {
      ordinal: 2,
      level: 'warning',
      file: 'main.tex',
      line: 88,
      message: 'Overfull \\hbox (12.4pt too wide)',
    },
  ];

  const mockLogData: CompilationLogDTO = {
    diagnostics: mockDiagnostics,
    counts: { errors: 1, warnings: 1 },
    truncated: false,
    rawLogUrl: 'https://example.com/log.txt',
  };

  it('renders tab headers with error and warning badges', () => {
    render(
      <ToolsPanel
        isOpen={true}
        onToggleOpen={vi.fn()}
        activeTab="problems"
        onSelectTab={vi.fn()}
        diagnostics={mockDiagnostics}
        logData={mockLogData}
      />,
    );

    expect(screen.getByTestId('tab-problems')).toBeInTheDocument();
    expect(screen.getByTestId('tab-log')).toBeInTheDocument();
    expect(screen.getByTestId('tab-settings')).toBeInTheDocument();

    // Problem counts displayed in badge
    const badges = screen.getAllByText('1');
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it('filters diagnostics by errors and warnings', () => {
    render(
      <ToolsPanel
        isOpen={true}
        onToggleOpen={vi.fn()}
        activeTab="problems"
        onSelectTab={vi.fn()}
        diagnostics={mockDiagnostics}
        logData={mockLogData}
      />,
    );

    expect(screen.getByText('Undefined control sequence \\invalidCommand')).toBeInTheDocument();
    expect(screen.getByText('Overfull \\hbox (12.4pt too wide)')).toBeInTheDocument();

    // Filter to only Errors
    fireEvent.click(screen.getByText(/Errors \(1\)/i));
    expect(screen.getByText('Undefined control sequence \\invalidCommand')).toBeInTheDocument();
    expect(screen.queryByText('Overfull \\hbox (12.4pt too wide)')).not.toBeInTheDocument();
  });

  it('navigates to line when problem item is clicked', () => {
    const handleNavigate = vi.fn();
    render(
      <ToolsPanel
        isOpen={true}
        onToggleOpen={vi.fn()}
        activeTab="problems"
        onSelectTab={vi.fn()}
        diagnostics={mockDiagnostics}
        logData={mockLogData}
        onNavigateToLine={handleNavigate}
      />,
    );

    fireEvent.click(screen.getByTestId('problem-item-0'));
    expect(handleNavigate).toHaveBeenCalledWith(42, 'main.tex');
  });

  it('allows changing and saving compile settings', async () => {
    const handleUpdateSettings = vi.fn().mockResolvedValue(undefined);
    render(
      <ToolsPanel
        isOpen={true}
        onToggleOpen={vi.fn()}
        activeTab="settings"
        onSelectTab={vi.fn()}
        currentEngine="PDFLATEX"
        currentBibTool="AUTO"
        autoCompileEnabled={false}
        onUpdateSettings={handleUpdateSettings}
      />,
    );

    // Switch engine to XELATEX
    const engineSelect = screen.getByTestId('engine-select');
    fireEvent.change(engineSelect, { target: { value: 'XELATEX' } });

    // Enable auto-compile toggle
    const toggle = screen.getByTestId('auto-compile-toggle');
    fireEvent.click(toggle);

    // Click Save Settings
    const saveBtn = screen.getByTestId('save-compile-settings-btn');
    fireEvent.click(saveBtn);

    expect(handleUpdateSettings).toHaveBeenCalledWith({
      engine: 'XELATEX',
      bibTool: 'AUTO',
      autoCompile: true,
    });
  });
});
