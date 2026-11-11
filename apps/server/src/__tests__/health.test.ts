import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../http/app.js';

describe('Server HTTP Probes', () => {
  const app = createApp();

  it('GET /healthz returns 200 OK', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.headers).toHaveProperty('x-request-id');
  });

  it('GET /readyz returns 200 ready', async () => {
    const res = await request(app).get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ready');
  });

  it('GET /api/v1/health returns envelope with data', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('status', 'ok');
    expect(res.body.meta).toHaveProperty('requestId');
  });
});
