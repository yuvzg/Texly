import type { Request, Response, NextFunction } from 'express';
import { v7 as uuidv7 } from 'uuid';

export const REQUEST_ID_HEADER = 'x-request-id';

declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingId = req.header(REQUEST_ID_HEADER);
  const requestId = incomingId && incomingId.trim() !== '' ? incomingId : uuidv7();

  req.id = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}

