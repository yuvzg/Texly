import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Monorepo Workspace Resolution', () => {
  const expectedPackages = [
    { name: '@texly/shared', dir: 'packages/shared' },
    { name: '@texly/db', dir: 'packages/db' },
    { name: '@texly/latex', dir: 'packages/latex' },
    { name: '@texly/llm', dir: 'packages/llm' },
    { name: '@texly/config', dir: 'packages/config' },
    { name: '@texly/web', dir: 'apps/web' },
    { name: '@texly/server', dir: 'apps/server' },
    { name: '@texly/compile-runner', dir: 'apps/compile-runner' },
  ];

  for (const pkg of expectedPackages) {
    it(`resolves ${pkg.name} with package.json and README`, () => {
      const pkgJsonPath = path.resolve(process.cwd(), pkg.dir, 'package.json');
      const readmePath = path.resolve(process.cwd(), pkg.dir, 'README.md');

      expect(fs.existsSync(pkgJsonPath), `${pkg.dir}/package.json should exist`).toBe(true);
      expect(fs.existsSync(readmePath), `${pkg.dir}/README.md should exist`).toBe(true);

      const content = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
      expect(content.name).toBe(pkg.name);
      expect(content.type).toBe('module');
    });
  }
});

