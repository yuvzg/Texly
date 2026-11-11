import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient, setAccessToken, getAccessToken, ApiClientError } from '@/lib/api-client';

describe('API Client and Silent Refresh (Integration)', () => {
  beforeEach(() => {
    setAccessToken(null);
    vi.restoreAllMocks();
  });

  it('attaches Bearer access token when token is in memory', async () => {
    setAccessToken('test-access-token-123');

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { message: 'hello' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const res = await apiClient.get<{ message: string }>('/test');
    expect(res).toEqual({ message: 'hello' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const requestHeaders = fetchSpy.mock.calls[0]?.[1]?.headers as Headers;
    expect(requestHeaders.get('Authorization')).toBe('Bearer test-access-token-123');
  });

  it('performs silent refresh on 401 and transparently retries original request', async () => {
    setAccessToken('expired-token');

    let requestCount = 0;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, _init) => {
      const urlStr = url.toString();

      // First call to /protected-resource returns 401
      if (urlStr.includes('/protected-resource') && requestCount === 0) {
        requestCount++;
        return new Response(
          JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'Token expired' } }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }

      // Silent refresh call
      if (urlStr.includes('/auth/refresh')) {
        return new Response(JSON.stringify({ data: { accessToken: 'new-refreshed-token-456' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Retried call with new token
      if (urlStr.includes('/protected-resource') && requestCount === 1) {
        requestCount++;
        return new Response(JSON.stringify({ data: { success: true } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch call to ${urlStr}`);
    });

    const data = await apiClient.get<{ success: boolean }>('/protected-resource');
    expect(data).toEqual({ success: true });

    // Verify token was updated in memory
    expect(getAccessToken()).toBe('new-refreshed-token-456');

    // Total calls: 1 initial (401), 1 refresh (200), 1 retry (200)
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('prevents multiple concurrent refresh calls using single-flight deduplication', async () => {
    setAccessToken('stale-token');

    let refreshCallCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const urlStr = url.toString();

      if (urlStr.includes('/auth/refresh')) {
        refreshCallCount++;
        // Simulate network latency
        await new Promise((r) => setTimeout(r, 50));
        return new Response(JSON.stringify({ data: { accessToken: 'deduped-token-789' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Check if bearer token is the new one
      const headers = init?.headers as Headers;
      const authHeader =
        headers?.get?.('Authorization') ||
        (headers as unknown as Record<string, string>)?.['Authorization'];
      if (authHeader === 'Bearer deduped-token-789') {
        return new Response(JSON.stringify({ data: { ok: true } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Otherwise return 401
      return new Response(
        JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'Token invalid' } }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    });

    // Fire 5 simultaneous requests that all receive 401
    const results = await Promise.all([
      apiClient.get('/req-1'),
      apiClient.get('/req-2'),
      apiClient.get('/req-3'),
      apiClient.get('/req-4'),
      apiClient.get('/req-5'),
    ]);

    // All 5 must succeed
    expect(results).toHaveLength(5);
    results.forEach((res) => expect(res).toEqual({ ok: true }));

    // CRITICAL: /auth/refresh was called EXACTLY ONCE!
    expect(refreshCallCount).toBe(1);
    expect(getAccessToken()).toBe('deduped-token-789');
  });

  it('clears access token and fails if silent refresh fails', async () => {
    setAccessToken('invalid-token');

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = url.toString();

      if (urlStr.includes('/auth/refresh')) {
        return new Response(
          JSON.stringify({ error: { code: 'REFRESH_INVALID', message: 'Refresh failed' } }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }

      return new Response(
        JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'Invalid token' } }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    });

    await expect(apiClient.get('/protected')).rejects.toThrow(ApiClientError);
    expect(getAccessToken()).toBeNull();
  });
});
