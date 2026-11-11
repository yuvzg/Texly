import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('TypeScript Strictness Configuration', () => {
  it('enforces mandatory compiler strictness flags in base tsconfig', () => {
    const tsconfigPath = path.resolve(process.cwd(), 'packages/config/tsconfig/base.json');
    const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'));
    const options = tsconfig.compilerOptions;

    expect(options.strict).toBe(true);
    expect(options.noUncheckedIndexedAccess).toBe(true);
    expect(options.exactOptionalPropertyTypes).toBe(true);
    expect(options.noImplicitOverride).toBe(true);
  });
});
