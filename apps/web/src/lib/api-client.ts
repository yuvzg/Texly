import { ErrorCodeEnum } from '@texly/shared';

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: Record<string, unknown> | undefined;
  public readonly fieldErrors?: Record<string, string[]> | undefined;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown> | undefined,
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;

    if (details && typeof details['fields'] === 'object' && details['fields'] !== null) {
      this.fieldErrors = details['fields'] as Record<string, string[]>;
    }
  }
}

// In-memory access token storage (NEVER in localStorage or sessionStorage)
let inMemoryAccessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function setAccessToken(token: string | null): void {
  inMemoryAccessToken = token;
}

export function getAccessToken(): string | null {
  return inMemoryAccessToken;
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  _retry?: boolean;
  skipAuth?: boolean;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

function resolveUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const cleanBase = API_BASE_URL.replace(/\/+$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${cleanBase}${cleanPath}`;
}

/**
 * Execute silent refresh using HttpOnly cookie `rt` with single-flight deduplication.
 */
export async function performSilentRefresh(): Promise<string | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const url = resolveUrl('/auth/refresh');
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        setAccessToken(null);
        return null;
      }

      const json = await response.json();
      const newToken = (json.data?.accessToken as string | undefined) ?? null;
      setAccessToken(newToken);
      return newToken;
    } catch {
      setAccessToken(null);
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = resolveUrl(path);
  const isAuthEndpoint =
    path.includes('/auth/login') ||
    path.includes('/auth/register') ||
    path.includes('/auth/refresh');

  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.method && options.method !== 'GET') {
    headers.set('Content-Type', 'application/json');
  }

  if (inMemoryAccessToken && !options.skipAuth) {
    headers.set('Authorization', `Bearer ${inMemoryAccessToken}`);
  }

  const fetchOptions: RequestInit = {
    ...options,
    headers,
    credentials: 'include', // Ensure cookies (like rt) are sent
  };

  let response: Response;
  try {
    response = await fetch(url, fetchOptions);
  } catch (err: unknown) {
    throw new ApiClientError(
      0,
      ErrorCodeEnum.INTERNAL,
      err instanceof Error ? err.message : 'Network request failed',
    );
  }

  // Handle 401 Unauthorized for eligible requests (auto silent-refresh & single-flight)
  if (response.status === 401 && !isAuthEndpoint && !options._retry) {
    const newToken = await performSilentRefresh();
    if (newToken) {
      // Retry original request once with new token
      return request<T>(path, {
        ...options,
        _retry: true,
      });
    }
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as unknown as T;
  }

  let body: unknown;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    try {
      body = await response.json();
    } catch {
      body = null;
    }
  } else {
    body = await response.text();
  }

  if (!response.ok) {
    if (body && typeof body === 'object' && 'error' in body) {
      const errPayload = body as {
        error?: { code?: string; message?: string; details?: Record<string, unknown> };
      };
      throw new ApiClientError(
        response.status,
        errPayload.error?.code || ErrorCodeEnum.INTERNAL,
        errPayload.error?.message || 'An error occurred',
        errPayload.error?.details,
      );
    }
    throw new ApiClientError(
      response.status,
      ErrorCodeEnum.INTERNAL,
      typeof body === 'string' && body.length > 0 ? body : response.statusText,
    );
  }

  // Unwrap envelope if present
  if (body && typeof body === 'object' && 'data' in body) {
    return (body as { data: T }).data;
  }

  return body as T;
}

export const apiClient = {
  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return request<T>(path, { ...options, method: 'GET' });
  },

  post<T>(path: string, data?: unknown, options?: RequestOptions): Promise<T> {
    return request<T>(path, {
      ...options,
      method: 'POST',
      ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
    });
  },

  put<T>(path: string, data?: unknown, options?: RequestOptions): Promise<T> {
    return request<T>(path, {
      ...options,
      method: 'PUT',
      ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
    });
  },

  patch<T>(path: string, data?: unknown, options?: RequestOptions): Promise<T> {
    return request<T>(path, {
      ...options,
      method: 'PATCH',
      ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
    });
  },

  delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return request<T>(path, { ...options, method: 'DELETE' });
  },

  setToken(token: string | null): void {
    setAccessToken(token);
  },

  getToken(): string | null {
    return getAccessToken();
  },

  refresh(): Promise<string | null> {
    return performSilentRefresh();
  },
};
