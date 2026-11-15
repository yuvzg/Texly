/**
 * Latexmk Command Policy and Argument Builder
 *
 * Enforces strict, hardened argument construction for running latexmk inside the sandbox.
 * Arguments are returned as an array of discrete argv elements, preventing shell injection.
 */

export type LatexEngine = 'pdflatex' | 'xelatex' | 'lualatex';
export type BibTool = 'auto' | 'bibtex' | 'biber' | 'none';

export interface CompileCommandOptions {
  engine: LatexEngine;
  bibTool?: BibTool;
  mainFile: string;
  outDir?: string;
  auxDir?: string;
}

export function buildLatexmkArgv(options: CompileCommandOptions): string[] {
  const outDir = options.outDir || '/work/out';
  const auxDir = options.auxDir || '/work/aux';

  const argv: string[] = ['latexmk', '-norc', '-f', `-outdir=${outDir}`, `-auxdir=${auxDir}`];

  switch (options.engine) {
    case 'pdflatex':
      argv.push(
        '-pdf',
        '-pdflatex=pdflatex -no-shell-escape -interaction=nonstopmode -file-line-error -synctex=1 %O %S',
      );
      break;
    case 'xelatex':
      argv.push(
        '-xelatex',
        '-xelatex=xelatex -no-shell-escape -interaction=nonstopmode -file-line-error -synctex=1 %O %S',
      );
      break;
    case 'lualatex':
      argv.push(
        '-lualatex',
        '-lualatex=lualatex --safer --nosocket -no-shell-escape -interaction=nonstopmode -file-line-error -synctex=1 %O %S',
      );
      break;
  }

  // Bibliography tooling policy
  if (options.bibTool === 'none') {
    argv.push('-bibtex-');
  } else if (options.bibTool === 'bibtex' || options.bibTool === 'biber') {
    argv.push('-bibtex');
  }
  // If 'auto', latexmk automatically checks .aux (\bibdata) vs .bcf (biber)

  // Main file is always passed as a single isolated argv element
  argv.push(options.mainFile);

  return argv;
}
