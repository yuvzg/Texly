import { describe, it, expect } from 'vitest';
import { buildLatexmkArgv } from '../container/command-builder.js';
import type { CompileLimits } from '@texly/shared';

describe('Command Builder', () => {
  const limits: CompileLimits = {
    timeoutSec: 45,
    memoryMb: 1024,
    cpus: 1,
    pidsLimit: 256,
    maxPdfMb: 50,
    maxLogMb: 5,
    maxOutputFiles: 200,
    workDirMb: 512,
  };

  it('builds valid pdfLaTeX command with timeout wrapper', () => {
    const cmd = buildLatexmkArgv({
      engine: 'PDFLATEX',
      bibTool: 'AUTO',
      mainFile: 'main.tex',
      limits,
    });

    expect(cmd[0]).toBe('timeout');
    expect(cmd[1]).toBe('--signal=KILL');
    expect(cmd[2]).toBe('45');
    expect(cmd[3]).toBe('latexmk');
    expect(cmd).toContain('-norc');
    expect(cmd).toContain('-f');
    expect(cmd).toContain('-pdf');
    expect(cmd).toContain('-outdir=/work/out');
    expect(cmd).toContain('-auxdir=/work/aux');
    expect(cmd[cmd.length - 1]).toBe('src/main.tex');
  });

  it('builds valid XeLaTeX command', () => {
    const cmd = buildLatexmkArgv({
      engine: 'XELATEX',
      bibTool: 'BIBER',
      mainFile: 'thesis.tex',
      limits,
    });

    expect(cmd).toContain('-xelatex');
    expect(cmd).toContain('-biber');
    expect(cmd[cmd.length - 1]).toBe('src/thesis.tex');
  });

  it('builds valid LuaLaTeX command with --safer and --nosocket', () => {
    const cmd = buildLatexmkArgv({
      engine: 'LUALATEX',
      bibTool: 'BIBTEX',
      mainFile: 'src/document.tex',
      limits,
    });

    expect(cmd).toContain('-lualatex');
    expect(cmd).toContain('-bibtex');
    const lualatexOpt = cmd.find((arg) => arg.startsWith('-lualatex='));
    expect(lualatexOpt).toContain('--safer');
    expect(lualatexOpt).toContain('--nosocket');
    expect(cmd[cmd.length - 1]).toBe('src/document.tex');
  });

  it('disables bibliography when bibTool is NONE', () => {
    const cmd = buildLatexmkArgv({
      engine: 'PDFLATEX',
      bibTool: 'NONE',
      mainFile: 'notes.tex',
      limits,
    });

    expect(cmd).toContain('-bibtex-');
  });
});
