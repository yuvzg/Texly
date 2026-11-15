import type { CompilationDiagnostic } from '@texly/shared';

export interface ParseLogResult {
  diagnostics: CompilationDiagnostic[];
  errorCount: number;
  warningCount: number;
  pageCount?: number | undefined;
}

export interface ParseLogOptions {
  mainFile?: string | undefined;
  maxDiagnostics?: number | undefined;
}

const DEFAULT_MAX_DIAGNOSTICS = 500;

function cleanFilePath(filePath: string): string {
  let cleaned = filePath.trim();
  // Strip quotes
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1);
  }
  // Strip sandbox root prefixes
  cleaned = cleaned.replace(/^\/work\/src\//, '');
  cleaned = cleaned.replace(/^\/work\/aux\//, '');
  cleaned = cleaned.replace(/^\/work\/out\//, '');
  cleaned = cleaned.replace(/^\/work\//, '');
  cleaned = cleaned.replace(/^\.\//, '');
  return cleaned;
}

export function parseLatexLog(rawLog: string, options: ParseLogOptions = {}): ParseLogResult {
  const mainFile = options.mainFile ? cleanFilePath(options.mainFile) : 'main.tex';
  const maxDiagnostics = options.maxDiagnostics ?? DEFAULT_MAX_DIAGNOSTICS;

  const diagnostics: CompilationDiagnostic[] = [];
  let errorCount = 0;
  let warningCount = 0;
  let pageCount: number | undefined;

  if (!rawLog || typeof rawLog !== 'string') {
    return { diagnostics, errorCount, warningCount, pageCount };
  }

  const lines = rawLog.split(/\r?\n/);
  const totalLines = lines.length;

  let currentFile = mainFile;
  const fileStack: string[] = [mainFile];

  // Regex patterns
  const fileLineErrorRegex = /^([^:\n\r]+):(\d+):\s*(.*)$/;
  const texErrorStartRegex = /^!\s+(.*)$/;
  const lineContextRegex = /^l\.(\d+)\s*(.*)$/;
  const overfullHboxRegex = /^Overfull \\hbox \([^)]+\) in paragraph at lines (\d+)--(\d+)/;
  const underfullHboxRegex = /^Underfull \\hbox \([^)]+\) in paragraph at lines (\d+)--(\d+)/;
  const bibtexErrorRegex = /^(?:I found no|I couldn't open|Error:)(.*)$/i;
  const biberErrorRegex = /^(?:ERROR|WARN)\s+-\s+(.*)$/;
  const outputWrittenRegex = /Output written on .*\s+\((\d+)\s+pages?/;

  let ordinal = 0;

  function pushDiagnostic(diag: Omit<CompilationDiagnostic, 'ordinal'>) {
    if (diag.level === 'error') {
      errorCount++;
    } else if (diag.level === 'warning') {
      warningCount++;
    }

    if (diagnostics.length < maxDiagnostics) {
      diagnostics.push({
        ...diag,
        ordinal: ordinal++,
        file: cleanFilePath(diag.file || currentFile || mainFile),
      });
    }
  }

  for (let i = 0; i < totalLines; i++) {
    const line = lines[i] ?? '';

    // Check page count from Output written line
    const pageMatch = outputWrittenRegex.exec(line);
    if (pageMatch && pageMatch[1]) {
      pageCount = parseInt(pageMatch[1], 10);
    }

    // 1. File-line error format: file.tex:12: error message
    const fileLineMatch = fileLineErrorRegex.exec(line);
    if (fileLineMatch && fileLineMatch[1] && fileLineMatch[2] && fileLineMatch[3]) {
      const candidateFile = fileLineMatch[1].trim();
      // Verify candidateFile looks like a source file path (has extension or reasonable path)
      if (candidateFile.includes('.') || candidateFile.includes('/')) {
        const lineNum = parseInt(fileLineMatch[2], 10);
        const msg = fileLineMatch[3].trim();
        const isWarning = /warning/i.test(msg);

        pushDiagnostic({
          level: isWarning ? 'warning' : 'error',
          file: candidateFile,
          line: isNaN(lineNum) ? 0 : lineNum,
          message: msg,
          kind: isWarning ? 'latex_warning' : 'file_line_error',
        });
        continue;
      }
    }

    // 2. Standard TeX errors starting with !
    const texErrorMatch = texErrorStartRegex.exec(line);
    if (texErrorMatch && texErrorMatch[1]) {
      const errorMessage = texErrorMatch[1].trim();
      let errorLine = 0;
      let errorContext = '';

      // Lookahead up to 12 lines for l.<number> context
      for (let j = i + 1; j < Math.min(i + 14, totalLines); j++) {
        const nextLine = lines[j] ?? '';
        const lMatch = lineContextRegex.exec(nextLine);
        if (lMatch && lMatch[1]) {
          errorLine = parseInt(lMatch[1], 10);
          errorContext = (lMatch[2] ?? '').trim();
          break;
        }
      }

      let kind = 'tex_error';
      if (/can't find file|file .* not found/i.test(errorMessage)) {
        kind = 'missing_file';
      } else if (/runaway argument/i.test(errorMessage)) {
        kind = 'runaway_argument';
      } else if (/capacity exceeded/i.test(errorMessage)) {
        kind = 'capacity_exceeded';
      }

      pushDiagnostic({
        level: 'error',
        file: currentFile,
        line: errorLine,
        message: errorMessage,
        context: errorContext || undefined,
        kind,
      });
      continue;
    }

    // 3. Runaway argument check
    if (/^Runaway argument\?/i.test(line)) {
      const context = (lines[i + 1] ?? '').trim();
      pushDiagnostic({
        level: 'error',
        file: currentFile,
        line: 0,
        message: 'Runaway argument',
        context: context || undefined,
        kind: 'runaway_argument',
      });
      continue;
    }

    // 4. Overfull / Underfull \hbox
    const overfullMatch = overfullHboxRegex.exec(line);
    if (overfullMatch && overfullMatch[1]) {
      pushDiagnostic({
        level: 'info',
        file: currentFile,
        line: parseInt(overfullMatch[1], 10),
        message: line.trim(),
        kind: 'overfull_hbox',
      });
      continue;
    }

    const underfullMatch = underfullHboxRegex.exec(line);
    if (underfullMatch && underfullMatch[1]) {
      pushDiagnostic({
        level: 'info',
        file: currentFile,
        line: parseInt(underfullMatch[1], 10),
        message: line.trim(),
        kind: 'underfull_hbox',
      });
      continue;
    }

    // 5. LaTeX and Package Warnings
    if (line.startsWith('LaTeX Warning:') || /^[A-Za-z0-9_-]+ Warning:/.test(line)) {
      let warningText = line;
      // Some warnings span multiple lines until a period
      if (!line.endsWith('.')) {
        for (let j = i + 1; j < Math.min(i + 5, totalLines); j++) {
          const nextLine = (lines[j] ?? '').trim();
          if (!nextLine || nextLine.startsWith('(') || nextLine.startsWith('!')) break;
          warningText += ' ' + nextLine;
          if (nextLine.endsWith('.')) {
            i = j;
            break;
          }
        }
      }

      let warningLine = 0;
      const lineNumMatch = /on input line (\d+)\.?/i.exec(warningText);
      if (lineNumMatch && lineNumMatch[1]) {
        warningLine = parseInt(lineNumMatch[1], 10);
      }

      let kind = 'latex_warning';
      if (/reference .* undefined/i.test(warningText)) {
        kind = 'undefined_reference';
      } else if (/citation .* undefined/i.test(warningText)) {
        kind = 'undefined_citation';
      } else if (/package/i.test(warningText)) {
        kind = 'package_warning';
      }

      pushDiagnostic({
        level: 'warning',
        file: currentFile,
        line: warningLine,
        message: warningText.replace(/\s+/g, ' ').trim(),
        kind,
      });
      continue;
    }

    // 6. BibTeX Errors
    const bibtexMatch = bibtexErrorRegex.exec(line);
    if (bibtexMatch && bibtexMatch[1]) {
      pushDiagnostic({
        level: 'error',
        file: currentFile,
        line: 0,
        message: line.trim(),
        kind: 'bibtex_error',
      });
      continue;
    }

    // 7. Biber Errors / Warnings
    const biberMatch = biberErrorRegex.exec(line);
    if (biberMatch && biberMatch[1]) {
      const isWarn = line.startsWith('WARN');
      pushDiagnostic({
        level: isWarn ? 'warning' : 'error',
        file: currentFile,
        line: 0,
        message: biberMatch[1].trim(),
        kind: isWarn ? 'biber_warning' : 'biber_error',
      });
      continue;
    }

    // 8. Basic file stack tracking via (path/to/file.tex
    const openParenMatch = /\(([^()\s]+\.(?:tex|sty|cls|bib|aux))\b/g;
    let match: RegExpExecArray | null;
    while ((match = openParenMatch.exec(line)) !== null) {
      if (match[1]) {
        const file = cleanFilePath(match[1]);
        fileStack.push(file);
        currentFile = file;
      }
    }
    const closeParenCount = (line.match(/\)/g) || []).length;
    for (let c = 0; c < closeParenCount; c++) {
      if (fileStack.length > 1) {
        fileStack.pop();
        currentFile = fileStack[fileStack.length - 1] ?? mainFile;
      }
    }
  }

  return {
    diagnostics,
    errorCount,
    warningCount,
    pageCount,
  };
}
