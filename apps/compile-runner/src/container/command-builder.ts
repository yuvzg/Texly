import type { Engine, BibTool, CompileLimits } from '@texly/shared';

export interface CommandBuilderOptions {
  engine: Engine;
  bibTool: BibTool;
  mainFile: string;
  draft?: boolean;
  limits: CompileLimits;
}

export function buildLatexmkArgv(options: CommandBuilderOptions): string[] {
  const { engine, bibTool, mainFile, limits } = options;

  let engineFlag = '-pdf';
  if (engine === 'XELATEX') {
    engineFlag = '-xelatex';
  } else if (engine === 'LUALATEX') {
    engineFlag = '-lualatex';
  }

  const argv: string[] = [
    'latexmk',
    '-norc',
    '-f',
    engineFlag,
    '-pdflatex=pdflatex -no-shell-escape -interaction=nonstopmode -file-line-error -synctex=1 %O %S',
    '-xelatex=xelatex -no-shell-escape -interaction=nonstopmode -file-line-error -synctex=1 %O %S',
    '-lualatex=lualatex --safer --nosocket -no-shell-escape -interaction=nonstopmode -file-line-error -synctex=1 %O %S',
    '-outdir=/work/out',
    '-auxdir=/work/aux',
  ];

  // Bibliography tool flag
  if (bibTool === 'NONE') {
    argv.push('-bibtex-');
  } else if (bibTool === 'BIBER') {
    argv.push('-biber');
  } else if (bibTool === 'BIBTEX') {
    argv.push('-bibtex');
  }
  // AUTO uses default latexmk detection

  // Main file relative to /work (source files reside in /work/src)
  const normalizedMainFile = mainFile.startsWith('src/')
    ? mainFile
    : `src/${mainFile.replace(/^\.?\/?/, '')}`;

  argv.push(normalizedMainFile);

  // Wrap with in-container timeout as second layer of defense
  const timeoutSec = Math.max(1, Math.min(limits.timeoutSec, 300));
  return ['timeout', '--signal=KILL', String(timeoutSec), ...argv];
}
