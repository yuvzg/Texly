import { parseLatexLog, type ParseLogResult, type ParseLogOptions } from './log-parser.js';
import type { CompilationDiagnostic } from '@texly/shared';

export { parseLatexLog, type ParseLogResult, type ParseLogOptions };
export type { CompilationDiagnostic };

export interface LatexDiagnostic {
  file: string;
  line: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export function parseLatexErrors(rawLog: string): LatexDiagnostic[] {
  if (!rawLog) {
    return [];
  }
  const { diagnostics } = parseLatexLog(rawLog);
  return diagnostics.map((d) => ({
    file: d.file,
    line: d.line,
    message: d.message,
    severity: d.level,
  }));
}
