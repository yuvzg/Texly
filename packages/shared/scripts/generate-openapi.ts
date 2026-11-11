import fs from 'node:fs';
import path from 'node:path';
import { generateOpenApiDocument } from '../src/openapi/generator.js';

export function runOpenApiGeneration() {
  const doc = generateOpenApiDocument();
  const jsonContent = JSON.stringify(doc, null, 2);

  // Write to packages/shared/dist and docs
  const distDir = path.resolve('dist');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }
  fs.writeFileSync(path.join(distDir, 'openapi.json'), jsonContent, 'utf-8');

  // Also write to docs/openapi.json if in root repository context
  const docsDir = path.resolve('../../docs');
  if (fs.existsSync(docsDir)) {
    fs.writeFileSync(path.join(docsDir, 'openapi.json'), jsonContent, 'utf-8');
  }

  console.info('✔ OpenAPI 3.1 specification generated successfully.');
  return doc;
}

if (
  process.argv[1]?.endsWith('generate-openapi.ts') ||
  process.argv[1]?.endsWith('generate-openapi.js')
) {
  runOpenApiGeneration();
}
