import { describe, it, expect } from 'vitest';
import { parseLatexLog } from '../log-parser.js';

describe('LaTeX Log Parser', () => {
  it('handles empty or blank logs', () => {
    const res = parseLatexLog('');
    expect(res.diagnostics).toEqual([]);
    expect(res.errorCount).toBe(0);
    expect(res.warningCount).toBe(0);
    expect(res.pageCount).toBeUndefined();
  });

  it('parses -file-line-error format errors and warnings', () => {
    const log = `
This is pdfTeX, Version 3.141592653-2.6-1.40.26
entering extended mode
./sections/intro.tex:14: Undefined control sequence.
l.14 \\badcommand
./main.tex:25: LaTeX Warning: Reference 'fig:missing' on page 1 undefined on input line 25.
Output written on /work/out/main.pdf (2 pages, 12345 bytes).
`;
    const res = parseLatexLog(log, { mainFile: 'main.tex' });
    expect(res.pageCount).toBe(2);
    expect(res.errorCount).toBe(1);
    expect(res.warningCount).toBe(1);
    expect(res.diagnostics.length).toBe(2);

    expect(res.diagnostics[0]).toMatchObject({
      file: 'sections/intro.tex',
      line: 14,
      level: 'error',
      message: 'Undefined control sequence.',
    });

    expect(res.diagnostics[1]).toMatchObject({
      file: 'main.tex',
      line: 25,
      level: 'warning',
    });
  });

  it('parses standard TeX ! errors with line context', () => {
    const log = `
(main.tex
! LaTeX Error: File 'nonexistent.sty' not found.

Type X to quit or <RETURN> to proceed,
or enter new name. (Default extension: sty)

Enter file name: 
! Emergency stop.
<read *> 
         
l.3 \\usepackage
               {nonexistent}
)
`;
    const res = parseLatexLog(log);
    expect(res.errorCount).toBeGreaterThanOrEqual(1);
    const missingFileDiag = res.diagnostics.find((d) => d.kind === 'missing_file');
    expect(missingFileDiag).toBeDefined();
    expect(missingFileDiag?.line).toBe(3);
  });

  it('parses overfull and underfull hbox warnings as info', () => {
    const log = `
Overfull \\hbox (15.2pt too wide) in paragraph at lines 42--48
Underfull \\hbox (badness 10000) in paragraph at lines 50--55
`;
    const res = parseLatexLog(log);
    expect(res.diagnostics.length).toBe(2);
    expect(res.diagnostics[0]?.level).toBe('info');
    expect(res.diagnostics[0]?.line).toBe(42);
    expect(res.diagnostics[1]?.level).toBe('info');
    expect(res.diagnostics[1]?.line).toBe(50);
  });

  it('parses BibTeX and Biber diagnostics', () => {
    const log = `
I found no \\citation commands---while reading file main.aux
WARN - I didn't find a database entry for 'smith2020'
ERROR - Cannot find 'references.bib'!
`;
    const res = parseLatexLog(log);
    expect(res.diagnostics.some((d) => d.kind === 'bibtex_error')).toBe(true);
    expect(res.diagnostics.some((d) => d.kind === 'biber_warning')).toBe(true);
    expect(res.diagnostics.some((d) => d.kind === 'biber_error')).toBe(true);
  });

  it('bounds diagnostics to maxDiagnostics while preserving exact error counts', () => {
    let hugeLog = '';
    for (let i = 1; i <= 600; i++) {
      hugeLog += `main.tex:${i}: Undefined control sequence.\n`;
    }
    const res = parseLatexLog(hugeLog, { maxDiagnostics: 500 });
    expect(res.errorCount).toBe(600);
    expect(res.diagnostics.length).toBe(500);
  });
});
