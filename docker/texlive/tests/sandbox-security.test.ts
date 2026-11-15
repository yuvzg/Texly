import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const DOCKER_IMAGE = process.env.COMPILE_IMAGE || 'texly/texlive:dev';
const SCRIPT_PATH = path.resolve(__dirname, '../verify.sh');

describe('TeX Live Sandbox Security & Toolchain Suite', () => {
  it('has executable verification script and valid fixtures', () => {
    expect(fs.existsSync(SCRIPT_PATH)).toBe(true);
    expect(fs.existsSync(path.resolve(__dirname, 'fixtures/sec01_write18.tex'))).toBe(true);
    expect(fs.existsSync(path.resolve(__dirname, 'fixtures/sec04_read_passwd.tex'))).toBe(true);
    expect(fs.existsSync(path.resolve(__dirname, 'fixtures/sec07_lua_os_execute.tex'))).toBe(true);
    expect(fs.existsSync(path.resolve(__dirname, 'fixtures/golden_article/main.tex'))).toBe(true);
  });

  it(
    'runs complete sandbox security verification script successfully',
    { timeout: 120_000 },
    () => {
      // If docker daemon is available and image exists, run verify.sh
      try {
        const output = execSync(`bash "${SCRIPT_PATH}" "${DOCKER_IMAGE}"`, {
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        expect(output).toContain('Configured default user: 10001:10001');
        expect(output).toContain('\\write18 command execution prevented');
        expect(output).toContain('\\immediate\\write18 command execution prevented');
        expect(output).toContain('\\ShellEscape is completely inert');
        expect(output).toContain('Absolute path read (/etc/passwd) blocked');
        expect(output).toContain('Writes outside designated working directory blocked');
        expect(output).toContain('Malicious .latexmkrc / latexmkrc ignored');
        expect(output).toContain('LuaLaTeX os.execute and io.popen blocked');
        expect(output).toContain('LuaLaTeX socket library unavailable');
        expect(output).toContain('All 11 Sandbox Security Tests & 5 Golden Compiles PASSED');
      } catch (err: unknown) {
        const execError = err as { stdout?: string; stderr?: string; message: string };
        // Check if failure is due to image not yet built or missing docker daemon
        if (
          execError.stderr?.includes('Image texly/texlive:dev not found') ||
          execError.stdout?.includes('Image texly/texlive:dev not found')
        ) {
          throw new Error(
            `Image ${DOCKER_IMAGE} not built yet. Run docker/texlive/build.sh before executing this test suite.`,
          );
        }
        throw new Error(
          `Sandbox verification failed:\nSTDOUT:\n${execError.stdout}\nSTDERR:\n${execError.stderr}`,
        );
      }
    },
  );
});
