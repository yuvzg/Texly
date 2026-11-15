import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DockerManager } from '../container/docker-manager.js';
import { WorkDirManager } from '../workdir/workdir-manager.js';
import { collectSafeOutputs } from '../output/collector.js';
import { parseLatexLog } from '@texly/latex';
import type { CompileJobV1 } from '@texly/shared';

const DOCKER_IMAGE = process.env.COMPILE_IMAGE || 'texly/texlive:dev';
const TEXMF_CNF_PATH = path.resolve(__dirname, '../../../../docker/texlive/texmf.cnf');
const FIXTURES_DIR = path.resolve(__dirname, '../../../../docker/texlive/tests/fixtures');

describe('Compile Runner Container Orchestration Integration', { timeout: 180_000 }, () => {
  let tmpRoot: string;
  let workDirManager: WorkDirManager;
  let dockerManager: DockerManager;

  beforeEach(async () => {
    tmpRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'texly-pipeline-test-'));
    workDirManager = new WorkDirManager(tmpRoot);
    dockerManager = new DockerManager({
      image: DOCKER_IMAGE,
      texmfCnfPath: TEXMF_CNF_PATH,
    });
  });

  afterEach(async () => {
    try {
      await fs.promises.rm(tmpRoot, { recursive: true, force: true });
    } catch {
      try {
        const { execSync } = await import('node:child_process');
        execSync(`docker run --rm -v "${tmpRoot}:/clean" ${DOCKER_IMAGE} rm -rf /clean/*`, {
          stdio: 'ignore',
        });
        await fs.promises.rm(tmpRoot, { recursive: true, force: true });
      } catch {
        // Ignore
      }
    }
  });

  function createJob(overrides: Partial<CompileJobV1> = {}): CompileJobV1 {
    return {
      version: 1,
      compilationId: `test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      projectId: 'proj-001',
      engine: 'PDFLATEX',
      bibTool: 'AUTO',
      mainFile: 'main.tex',
      draft: false,
      limits: {
        timeoutSec: 45,
        memoryMb: 1024,
        cpus: 1,
        pidsLimit: 256,
        maxPdfMb: 50,
        maxLogMb: 5,
        maxOutputFiles: 200,
        workDirMb: 512,
      },
      inputs: {
        textBundle: {
          url: 'http://localhost/bundle.tar',
          sha256: 'mock',
          sizeBytes: 100,
        },
        assets: [],
      },
      outputs: {
        pdf: { url: 'http://localhost/pdf' },
        synctex: { url: 'http://localhost/synctex' },
        log: { url: 'http://localhost/log' },
      },
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      ...overrides,
    };
  }

  it('compiles golden article fixture with pdfLaTeX producing PDF and SyncTeX', async () => {
    const job = createJob({ engine: 'PDFLATEX' });
    const workDirs = await workDirManager.createJobDir(job.compilationId);

    // Copy golden article fixtures into work/src
    await fs.promises.copyFile(
      path.join(FIXTURES_DIR, 'golden_article/main.tex'),
      path.join(workDirs.srcDir, 'main.tex'),
    );
    await fs.promises.copyFile(
      path.join(FIXTURES_DIR, 'golden_article/references.bib'),
      path.join(workDirs.srcDir, 'references.bib'),
    );

    const execResult = await dockerManager.runCompileContainer(job, workDirs);
    expect(execResult.timedOut).toBe(false);
    expect(execResult.oomKilled).toBe(false);

    const outputs = await collectSafeOutputs(workDirs, job.mainFile, job.limits);
    expect(outputs.pdfPath).toBeDefined();
    expect(outputs.pdfSizeBytes).toBeGreaterThan(1000);
    expect(outputs.synctexPath).toBeDefined();

    const diagnostics = parseLatexLog(outputs.rawLogContent, { mainFile: job.mainFile });
    expect(diagnostics.pageCount).toBeGreaterThanOrEqual(1);
    expect(diagnostics.errorCount).toBe(0);
  });

  it('compiles XeLaTeX golden fixture successfully', async () => {
    const job = createJob({ engine: 'XELATEX' });
    const workDirs = await workDirManager.createJobDir(job.compilationId);

    await fs.promises.copyFile(
      path.join(FIXTURES_DIR, 'golden_xelatex/main.tex'),
      path.join(workDirs.srcDir, 'main.tex'),
    );

    const execResult = await dockerManager.runCompileContainer(job, workDirs);
    expect(execResult.timedOut).toBe(false);

    const outputs = await collectSafeOutputs(workDirs, job.mainFile, job.limits);
    expect(outputs.pdfPath).toBeDefined();
    expect(outputs.pdfSizeBytes).toBeGreaterThan(1000);
  });

  it('compiles LuaLaTeX golden fixture successfully', async () => {
    const job = createJob({ engine: 'LUALATEX' });
    const workDirs = await workDirManager.createJobDir(job.compilationId);

    await fs.promises.copyFile(
      path.join(FIXTURES_DIR, 'golden_lualatex/main.tex'),
      path.join(workDirs.srcDir, 'main.tex'),
    );

    const execResult = await dockerManager.runCompileContainer(job, workDirs);
    expect(execResult.timedOut).toBe(false);

    const outputs = await collectSafeOutputs(workDirs, job.mainFile, job.limits);
    expect(outputs.pdfPath).toBeDefined();
    expect(outputs.pdfSizeBytes).toBeGreaterThan(1000);
  });

  it('compiles multi-file document with nested assets', async () => {
    const job = createJob({ engine: 'PDFLATEX' });
    const workDirs = await workDirManager.createJobDir(job.compilationId);

    await fs.promises.copyFile(
      path.join(FIXTURES_DIR, 'golden_multifile/main.tex'),
      path.join(workDirs.srcDir, 'main.tex'),
    );
    await fs.promises.mkdir(path.join(workDirs.srcDir, 'sections'), { recursive: true });
    await fs.promises.copyFile(
      path.join(FIXTURES_DIR, 'golden_multifile/sections/intro.tex'),
      path.join(workDirs.srcDir, 'sections/intro.tex'),
    );

    const execResult = await dockerManager.runCompileContainer(job, workDirs);
    expect(execResult.timedOut).toBe(false);

    const outputs = await collectSafeOutputs(workDirs, job.mainFile, job.limits);
    expect(outputs.pdfPath).toBeDefined();
    expect(outputs.pdfSizeBytes).toBeGreaterThan(1000);
  });

  it('enforces timeout killing long-running jobs', async () => {
    const job = createJob({
      engine: 'PDFLATEX',
      limits: {
        timeoutSec: 3, // 3 seconds timeout
        memoryMb: 1024,
        cpus: 1,
        pidsLimit: 256,
        maxPdfMb: 50,
        maxLogMb: 5,
        maxOutputFiles: 200,
        workDirMb: 512,
      },
    });
    const workDirs = await workDirManager.createJobDir(job.compilationId);

    // Write infinite loop document
    const infiniteLoopDoc = `
\\documentclass{article}
\\begin{document}
\\def\\loopforever#1{\\loopforever{#1#1}}
\\loopforever{X}
\\end{document}
`;
    await fs.promises.writeFile(path.join(workDirs.srcDir, 'main.tex'), infiniteLoopDoc);

    const execResult = await dockerManager.runCompileContainer(job, workDirs);
    expect(execResult.timedOut || execResult.exitCode !== 0).toBe(true);
  });

  it('confines sandbox: blocks \\write18 command execution', async () => {
    const job = createJob({ engine: 'PDFLATEX' });
    const workDirs = await workDirManager.createJobDir(job.compilationId);

    await fs.promises.copyFile(
      path.join(FIXTURES_DIR, 'sec01_write18.tex'),
      path.join(workDirs.srcDir, 'main.tex'),
    );

    await dockerManager.runCompileContainer(job, workDirs);
    const outputs = await collectSafeOutputs(workDirs, job.mainFile, job.limits);

    // Exploit file should NOT have been created anywhere in the workspace
    expect(fs.existsSync(path.join(workDirs.workDir, 'pwned_write18.txt'))).toBe(false);
    expect(fs.existsSync(path.join(workDirs.outDir, 'pwned_write18.txt'))).toBe(false);
    expect(outputs.rawLogContent).not.toContain('PWNED_WRITE18_SUCCESS');
  });

  it('confines sandbox: blocks absolute path reads of /etc/passwd', async () => {
    const job = createJob({ engine: 'PDFLATEX' });
    const workDirs = await workDirManager.createJobDir(job.compilationId);

    await fs.promises.copyFile(
      path.join(FIXTURES_DIR, 'sec04_read_passwd.tex'),
      path.join(workDirs.srcDir, 'main.tex'),
    );

    await dockerManager.runCompileContainer(job, workDirs);
    const outputs = await collectSafeOutputs(workDirs, job.mainFile, job.limits);

    expect(outputs.rawLogContent).not.toContain('PASSWD_LEAKED:root:');
    expect(outputs.rawLogContent).toContain('PASSWD_OPEN_BLOCKED');
  });
});
