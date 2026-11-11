import type { Request, Response, NextFunction } from 'express';
import { logger } from '../../logging/logger.js';
import type { ApiErrorEnvelope } from '@texly/shared';

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    statusCode: number,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = req.id ?? (req.header('x-request-id') as string | undefined) ?? 'unknown';

  if (err instanceof AppError) {
    logger.warn({ err, requestId, code: err.code }, 'Handled application error');
    const envelope: ApiErrorEnvelope = {
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
      },
    };
    res.status(err.statusCode).json(envelope);
    return;
  }

  logger.error({ err, requestId }, 'Unhandled internal server error');
  const envelope: ApiErrorEnvelope = {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected internal error occurred.',
    },
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
    },
  };
  res.status(500).json(envelope);
}
