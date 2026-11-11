import { describe, it, expect } from 'vitest';
import { generateOpenApiDocument } from '../src/openapi/generator.js';

describe('OpenAPI 3.1 Document Generation', () => {
  it('generates a valid OpenAPI 3.1.0 document structure', () => {
    const doc = generateOpenApiDocument();

    expect(doc.openapi).toBe('3.1.0');
    expect(doc.info.title).toBe('Texly API');
    expect(doc.info.version).toBe('0.1.0');
    expect(doc.paths).toBeDefined();

    // Verify key paths exist
    expect(doc.paths).toHaveProperty('/api/v1/auth/register');
    expect(doc.paths).toHaveProperty('/api/v1/auth/login');
    expect(doc.paths).toHaveProperty('/api/v1/projects');
    expect(doc.paths).toHaveProperty('/api/v1/projects/{projectId}/compilations');
    expect(doc.paths).toHaveProperty('/api/v1/ai/proposals/{proposalId}/accept');
    expect(doc.paths).toHaveProperty('/healthz');
  });

  it('is completely deterministic and reproducible', () => {
    const docA = generateOpenApiDocument();
    const docB = generateOpenApiDocument();

    expect(JSON.stringify(docA)).toBe(JSON.stringify(docB));
  });
});
