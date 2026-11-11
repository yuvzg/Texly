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
  return [];
}
