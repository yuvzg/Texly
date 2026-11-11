import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  createSuccessEnvelopeSchema,
  ApiErrorEnvelopeSchema,
  FieldValidationErrorSchema,
  CursorPaginationInputSchema,
  PaginationMetaSchema,
} from '../src/index.js';

describe('API Envelopes and Pagination Contracts', () => {
  it('validates a standard success envelope with data and meta', () => {
    const PayloadSchema = z.object({ id: z.string(), name: z.string() }).strict();
    const EnvelopeSchema = createSuccessEnvelopeSchema(PayloadSchema);

    const validEnvelope = {
      data: { id: 'item-1', name: 'Item One' },
      meta: {
        requestId: '0192e2fb-3c1a-7b3b-9a4f-5c21ef9a8241',
        timestamp: '2026-11-11T00:00:00.000Z',
      },
    };

    const parsed = EnvelopeSchema.safeParse(validEnvelope);
    expect(parsed.success).toBe(true);
  });

  it('rejects unknown properties in success envelope due to .strict()', () => {
    const PayloadSchema = z.object({ id: z.string() }).strict();
    const EnvelopeSchema = createSuccessEnvelopeSchema(PayloadSchema);

    const invalidEnvelope = {
      data: { id: 'item-1' },
      unexpectedField: 'forbidden',
    };

    const parsed = EnvelopeSchema.safeParse(invalidEnvelope);
    expect(parsed.success).toBe(false);
  });

  it('validates standard error envelope with field-level details', () => {
    const validErrorEnvelope = {
      error: {
        code: 'VALIDATION_FAILED',
        message: 'The request body failed validation.',
        fields: [
          {
            path: 'email',
            code: 'invalid_string',
            message: 'Invalid email address',
          },
        ],
        requestId: '0192e2fb-3c1a-7b3b-9a4f-5c21ef9a8241',
      },
      meta: {
        requestId: '0192e2fb-3c1a-7b3b-9a4f-5c21ef9a8241',
        timestamp: '2026-11-11T00:00:00.000Z',
      },
    };

    const parsed = ApiErrorEnvelopeSchema.safeParse(validErrorEnvelope);
    expect(parsed.success).toBe(true);
  });

  it('validates field validation error schema correctly', () => {
    const validFieldError = {
      path: 'password',
      code: 'too_small',
      message: 'Password must contain at least 10 characters',
    };

    expect(FieldValidationErrorSchema.safeParse(validFieldError).success).toBe(true);

    const invalidFieldError = {
      path: 'password',
      // missing code and message
    };
    expect(FieldValidationErrorSchema.safeParse(invalidFieldError).success).toBe(false);
  });

  it('validates cursor pagination input defaults and limits', () => {
    const defaultParsed = CursorPaginationInputSchema.parse({});
    expect(defaultParsed.limit).toBe(25);
    expect(defaultParsed.cursor).toBeUndefined();

    const customParsed = CursorPaginationInputSchema.parse({
      cursor: 'cursor-abc',
      limit: '50',
    });
    expect(customParsed.limit).toBe(50);
    expect(customParsed.cursor).toBe('cursor-abc');

    // Limit over 100 rejected
    expect(CursorPaginationInputSchema.safeParse({ limit: 101 }).success).toBe(false);
    // Limit 0 or negative rejected
    expect(CursorPaginationInputSchema.safeParse({ limit: 0 }).success).toBe(false);
  });

  it('validates pagination metadata schema', () => {
    const validMeta = {
      requestId: '0192e2fb-3c1a-7b3b-9a4f-5c21ef9a8241',
      timestamp: '2026-11-11T00:00:00.000Z',
      nextCursor: 'next-123',
      totalCount: 42,
    };
    expect(PaginationMetaSchema.safeParse(validMeta).success).toBe(true);
  });
});
