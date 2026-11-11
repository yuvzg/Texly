import type { Response } from 'express';

export const REFRESH_COOKIE_NAME = 'rt';

export interface CookieOptions {
  secure: boolean;
  domain?: string | undefined;
  maxAgeDays?: number | undefined;
}

export function setRefreshCookie(
  res: Response,
  refreshToken: string,
  options: CookieOptions,
): void {
  const maxAgeDays = options.maxAgeDays ?? 7;
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: options.secure,
    sameSite: 'lax',
    path: '/api/v1/auth',
    maxAge: maxAgeDays * 24 * 60 * 60 * 1000,
    ...(options.domain ? { domain: options.domain } : {}),
  });
}

export function clearRefreshCookie(res: Response, options: CookieOptions): void {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: options.secure,
    sameSite: 'lax',
    path: '/api/v1/auth',
    ...(options.domain ? { domain: options.domain } : {}),
  });
}
