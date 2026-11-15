import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import tar from 'tar-stream';
import { pipeline } from 'node:stream/promises';
import { safeExtractTar, ExtractionError } from '../storage/extractor.js';

describe('Safe Archive Extractor', () => {
  let tmpDir: string;
  let targetDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'texly-test-storage-'));
    targetDir = path.join(tmpDir, 'target');
    await fs.promises.mkdir(targetDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  async function createTarArchive(
    tarPath: string,
    entries: {
      name: string;
      content?: string;
      type?: 'file' | 'directory' | 'symlink' | 'link';
      linkname?: string;
    }[],
  ): Promise<void> {
    const pack = tar.pack();
    const dest = fs.createWriteStream(tarPath);

    const promise = pipeline(pack, dest);

    for (const entry of entries) {
      const type = entry.type || 'file';
      if (type === 'directory') {
        pack.entry({ name: entry.name, type: 'directory' });
      } else if (type === 'symlink' || type === 'link') {
        pack.entry({ name: entry.name, type, linkname: entry.linkname || '/etc/passwd' });
      } else {
        const content = Buffer.from(entry.content || 'hello world');
        pack.entry({ name: entry.name, size: content.length, type: 'file' }, content);
      }
    }
    pack.finalize();
    await promise;
  }

  it('safely extracts regular files and nested directories', async () => {
    const tarFile = path.join(tmpDir, 'valid.tar');
    await createTarArchive(tarFile, [
      { name: 'main.tex', content: '\\documentclass{article}' },
      { name: 'sections/intro.tex', content: 'Intro text' },
    ]);

    const result = await safeExtractTar(tarFile, targetDir);
    expect(result.extractedFiles).toContain('main.tex');
    expect(result.extractedFiles).toContain(path.normalize('sections/intro.tex'));

    const mainContent = await fs.promises.readFile(path.join(targetDir, 'main.tex'), 'utf-8');
    expect(mainContent).toBe('\\documentclass{article}');
  });

  it('rejects archives containing symlinks', async () => {
    const tarFile = path.join(tmpDir, 'symlink.tar');
    await createTarArchive(tarFile, [
      { name: 'evil_link', type: 'symlink', linkname: '/etc/passwd' },
    ]);

    await expect(safeExtractTar(tarFile, targetDir)).rejects.toThrowError(ExtractionError);
    await expect(safeExtractTar(tarFile, targetDir)).rejects.toThrow(/forbidden link/i);
  });

  it('rejects archives containing hard links', async () => {
    const tarFile = path.join(tmpDir, 'hardlink.tar');
    await createTarArchive(tarFile, [
      { name: 'evil_hardlink', type: 'link', linkname: '/etc/shadow' },
    ]);

    await expect(safeExtractTar(tarFile, targetDir)).rejects.toThrowError(ExtractionError);
  });

  it('rejects path traversal (..) entries', async () => {
    const tarFile = path.join(tmpDir, 'traversal.tar');
    await createTarArchive(tarFile, [{ name: '../escape.tex', content: 'dangerous' }]);

    await expect(safeExtractTar(tarFile, targetDir)).rejects.toThrowError(ExtractionError);
    await expect(safeExtractTar(tarFile, targetDir)).rejects.toThrow(/path traversal/i);
  });

  it('rejects absolute path entries', async () => {
    const tarFile = path.join(tmpDir, 'absolute.tar');
    await createTarArchive(tarFile, [{ name: '/root/pwn.tex', content: 'dangerous' }]);

    await expect(safeExtractTar(tarFile, targetDir)).rejects.toThrowError(ExtractionError);
  });

  it('rejects duplicate or case-colliding entries', async () => {
    const tarFile = path.join(tmpDir, 'collision.tar');
    await createTarArchive(tarFile, [
      { name: 'file.tex', content: 'version1' },
      { name: 'FILE.TEX', content: 'version2' },
    ]);

    await expect(safeExtractTar(tarFile, targetDir)).rejects.toThrow(
      /duplicate or case-colliding/i,
    );
  });

  it('deletes malicious .latexmkrc / latexmkrc if present in tarball', async () => {
    const tarFile = path.join(tmpDir, 'latexmkrc.tar');
    await createTarArchive(tarFile, [
      { name: 'main.tex', content: '\\documentclass{article}' },
      { name: '.latexmkrc', content: '$pdflatex = "sh -i";' },
      { name: 'latexmkrc', content: '$pdflatex = "sh -i";' },
    ]);

    const res = await safeExtractTar(tarFile, targetDir);
    expect(res.extractedFiles).toContain('main.tex');
    expect(fs.existsSync(path.join(targetDir, '.latexmkrc'))).toBe(false);
    expect(fs.existsSync(path.join(targetDir, 'latexmkrc'))).toBe(false);
  });
});
