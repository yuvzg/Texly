import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

describe('Dependency Boundaries', () => {
  const depcruiseBin = path.resolve('node_modules/.bin/depcruise');

  it('passes boundary check on production code in apps and packages', () => {
    expect(() => {
      execSync(`"${depcruiseBin}" --config .dependency-cruiser.cjs apps packages`, {
        stdio: 'pipe',
        encoding: 'utf-8',
      });
    }).not.toThrow();
  }, 30000);

  it('fails with a boundary violation when an invalid cross-boundary import is analyzed', () => {
    const fixturePath = path.resolve('tests/fixtures/invalid-boundary/invalid-runner.ts');
    const fixtureConfig = path.resolve('tests/fixtures/invalid-boundary/.fixture-depcruise.cjs');
    expect(fs.existsSync(fixturePath)).toBe(true);
    expect(fs.existsSync(fixtureConfig)).toBe(true);

    let output = '';
    let exitedWithError = false;

    try {
      execSync(`"${depcruiseBin}" --config "${fixtureConfig}" "${fixturePath}"`, {
        stdio: 'pipe',
        encoding: 'utf-8',
      });
    } catch (err: unknown) {
      exitedWithError = true;
      if (err && typeof err === 'object') {
        const execErr = err as { stdout?: string; stderr?: string };
        output = (execErr.stdout ?? '') + (execErr.stderr ?? '');
      }
    }

    expect(exitedWithError).toBe(true);
    expect(output).toContain('compile-runner-forbidden-packages');
  }, 30000);
});
