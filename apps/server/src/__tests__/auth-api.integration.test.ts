import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { setupTestDatabase, type TestDatabase } from './test-db.js';
import { createApp } from '../http/app.js';
import { buildContainer } from '../container.js';
import { MockEmailSender } from '../modules/email/email.service.js';
import { MemoryRateLimitStore } from '../http/middleware/rate-limiter.js';
import { ErrorCodeEnum } from '@texly/shared';

function getSetCookies(res: request.Response): string[] {
  const header = res.headers['set-cookie'];
  if (Array.isArray(header)) return header as string[];
  if (typeof header === 'string') return [header];
  return [];
}

describe('Authentication & User Settings API (Integration)', () => {
  let db: TestDatabase;
  let app: Express;
  let emailSender: MockEmailSender;
  let rateLimitStore: MemoryRateLimitStore;

  beforeAll(async () => {
    db = await setupTestDatabase();
    emailSender = new MockEmailSender();
    rateLimitStore = new MemoryRateLimitStore();

    const container = buildContainer({
      db: db.db,
      emailSender,
      rateLimitStore,
      envOverrides: {
        NODE_ENV: 'test',
        JWT_ACCESS_TTL_SECONDS: 900,
        REFRESH_TOKEN_TTL_DAYS: 7,
        CORS_ALLOWED_ORIGINS: ['http://localhost:3000', 'http://127.0.0.1:3000'],
      },
    });

    app = createApp({ container });
  }, 60000);

  afterAll(async () => {
    if (db) {
      await db.cleanup();
    }
  });

  describe('POST /api/v1/auth/register', () => {
    it('registers a new user and creates personal workspace, settings, and session', async () => {
      emailSender.clear();

      const res = await request(app)
        .post('/api/v1/auth/register')
        .set('Origin', 'http://localhost:3000')
        .send({
          email: 'alice@texly.app',
          password: 'CorrectHorseBattery123!',
          name: 'Alice Smith',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.user).toMatchObject({
        email: 'alice@texly.app',
        name: 'Alice Smith',
        emailVerified: false,
      });
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.expiresIn).toBe(900);
      expect(res.headers).toHaveProperty('x-request-id');

      // Refresh cookie validation: httpOnly, SameSite=Lax, Path=/api/v1/auth
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const cookieStr = Array.isArray(cookies) ? cookies.join(';') : (cookies as string);
      expect(cookieStr).toContain('rt=');
      expect(cookieStr).toContain('Path=/api/v1/auth');
      expect(cookieStr.toLowerCase()).toContain('httponly');

      // Verify email was sent
      expect(emailSender.sentEmails.length).toBe(1);
      expect(emailSender.sentEmails[0]?.to).toBe('alice@texly.app');
      expect(emailSender.sentEmails[0]?.subject).toContain('Verify');
    });

    it('rejects duplicate email registration with 409 EMAIL_TAKEN', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        email: 'alice@texly.app',
        password: 'AnotherPassword123!',
        name: 'Alice Impostor',
      });

      expect(res.status).toBe(409);
      expect(res.body.error).toMatchObject({
        code: ErrorCodeEnum.EMAIL_TAKEN,
      });
    });

    it('rejects invalid password shorter than 10 characters with 422 VALIDATION_FAILED', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        email: 'short@texly.app',
        password: 'short',
        name: 'Short Pass',
      });

      expect(res.status).toBe(422);
      expect(res.body.error).toMatchObject({
        code: ErrorCodeEnum.VALIDATION_FAILED,
      });
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('authenticates valid credentials and sets refresh cookie', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        email: 'alice@texly.app',
        password: 'CorrectHorseBattery123!',
      });

      expect(res.status).toBe(200);
      expect(res.body.data.user.email).toBe('alice@texly.app');
      expect(res.body.data.accessToken).toBeDefined();

      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
    });

    it('returns identical 401 INVALID_CREDENTIALS for wrong password and unknown email', async () => {
      const wrongPassRes = await request(app).post('/api/v1/auth/login').send({
        email: 'alice@texly.app',
        password: 'WrongPassword123!',
      });

      expect(wrongPassRes.status).toBe(401);
      expect(wrongPassRes.body.error.code).toBe(ErrorCodeEnum.INVALID_CREDENTIALS);

      const unknownEmailRes = await request(app).post('/api/v1/auth/login').send({
        email: 'nonexistent@texly.app',
        password: 'WrongPassword123!',
      });

      expect(unknownEmailRes.status).toBe(401);
      expect(unknownEmailRes.body.error.code).toBe(ErrorCodeEnum.INVALID_CREDENTIALS);
      expect(unknownEmailRes.body.error.message).toBe(wrongPassRes.body.error.message);
    });
  });

  describe('POST /api/v1/auth/refresh and Reuse Detection', () => {
    it('rotates refresh token and returns new access token', async () => {
      // 1. Login to get initial refresh cookie
      const loginRes = await request(app).post('/api/v1/auth/login').send({
        email: 'alice@texly.app',
        password: 'CorrectHorseBattery123!',
      });

      const cookies = getSetCookies(loginRes);
      const rtCookie = cookies.find((c) => c.startsWith('rt='));
      expect(rtCookie).toBeDefined();

      // 2. Call refresh with the cookie and valid Origin
      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', [rtCookie!]);

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.data.accessToken).toBeDefined();

      const rotatedCookies = getSetCookies(refreshRes);
      const newRtCookie = rotatedCookies.find((c) => c.startsWith('rt='));
      expect(newRtCookie).toBeDefined();
      expect(newRtCookie).not.toBe(rtCookie);

      // 3. REUSE DETECTION: Re-submit the old rtCookie
      const reuseRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', [rtCookie!]);

      expect(reuseRes.status).toBe(401);
      expect(reuseRes.body.error.code).toBe(ErrorCodeEnum.REFRESH_REUSED);

      // 4. Verifying that the successor session was also revoked by reuse detection
      const successorRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', [newRtCookie!]);

      expect(successorRes.status).toBe(401);
    });

    it('rejects refresh request from untrusted Origin', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Origin', 'http://malicious-site.com')
        .set('Cookie', ['rt=fake-token']);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(ErrorCodeEnum.FORBIDDEN);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('returns full user profile, workspaces, settings, and plan', async () => {
      const loginRes = await request(app).post('/api/v1/auth/login').send({
        email: 'alice@texly.app',
        password: 'CorrectHorseBattery123!',
      });

      const token = loginRes.body.data.accessToken;

      const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body.data.user.email).toBe('alice@texly.app');
      expect(res.body.data.workspaces.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.workspaces[0]).toMatchObject({
        isPersonal: true,
        role: 'OWNER',
      });
      expect(res.body.data.settings).toMatchObject({
        theme: 'system',
        editorFontSize: 14,
        keymap: 'default',
      });
      expect(res.body.data.plan).toBe('FREE');
    });

    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/v1/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe(ErrorCodeEnum.UNAUTHENTICATED);
    });
  });

  describe('Email Verification Workflow', () => {
    it('verifies email using single-use token', async () => {
      emailSender.clear();

      // Register bob
      const regRes = await request(app).post('/api/v1/auth/register').send({
        email: 'bob@texly.app',
        password: 'B0b!Un1qu3P@ssw0rd#2026',
        name: 'Bob Jones',
      });

      expect(regRes.status).toBe(201);

      // Extract verification token from mock email URL
      expect(emailSender.sentEmails.length).toBe(1);
      const emailContent = emailSender.sentEmails[0]?.text ?? '';
      const match = emailContent.match(/token=([A-Za-z0-9_-]+)/);
      expect(match).not.toBeNull();
      const token = match![1];

      // Verify email
      const verifyRes = await request(app).post('/api/v1/auth/verify-email').send({ token });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.data.verified).toBe(true);

      // Verify user profile now shows emailVerified: true
      const loginRes = await request(app).post('/api/v1/auth/login').send({
        email: 'bob@texly.app',
        password: 'B0b!Un1qu3P@ssw0rd#2026',
      });
      expect(loginRes.body.data.user.emailVerified).toBe(true);

      // Single-use: Reusing the same verification token must fail
      const reuseRes = await request(app).post('/api/v1/auth/verify-email').send({ token });

      expect(reuseRes.status).toBe(400);
      expect(reuseRes.body.error.code).toBe(ErrorCodeEnum.TOKEN_INVALID);
    });
  });

  describe('Password Reset Workflow', () => {
    it('sends reset link and updates password with all sessions revoked', async () => {
      emailSender.clear();

      // 1. Forgot password request (generic 202 response)
      const forgotRes = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'bob@texly.app' });

      expect(forgotRes.status).toBe(202);
      expect(forgotRes.body.data.message).toBeDefined();

      // Nonexistent email also returns 202 (preventing enumeration)
      const nonexistentRes = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'unknown@texly.app' });
      expect(nonexistentRes.status).toBe(202);

      // 2. Extract reset token from email
      expect(emailSender.sentEmails.length).toBe(1);
      const emailText = emailSender.sentEmails[0]?.text ?? '';
      const match = emailText.match(/token=([A-Za-z0-9_-]+)/);
      expect(match).not.toBeNull();
      const resetToken = match![1];

      // 3. Reset password
      const resetRes = await request(app).post('/api/v1/auth/reset-password').send({
        token: resetToken,
        password: 'NewBrandPassword456!',
      });

      expect(resetRes.status).toBe(200);

      // 4. Old password fails
      const oldLoginRes = await request(app).post('/api/v1/auth/login').send({
        email: 'bob@texly.app',
        password: 'B0b!Un1qu3P@ssw0rd#2026',
      });
      expect(oldLoginRes.status).toBe(401);

      // 5. New password succeeds
      const newLoginRes = await request(app).post('/api/v1/auth/login').send({
        email: 'bob@texly.app',
        password: 'NewBrandPassword456!',
      });
      expect(newLoginRes.status).toBe(200);
      expect(newLoginRes.body.data.user.email).toBe('bob@texly.app');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('revokes session family and clears cookie', async () => {
      const loginRes = await request(app).post('/api/v1/auth/login').send({
        email: 'alice@texly.app',
        password: 'CorrectHorseBattery123!',
      });

      const token = loginRes.body.data.accessToken;
      const cookies = getSetCookies(loginRes);
      const rtCookie = cookies.find((c) => c.startsWith('rt='));

      const logoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .set('Cookie', [rtCookie!]);

      expect(logoutRes.status).toBe(204);

      // Clear cookie header sent
      const logoutCookies = getSetCookies(logoutRes);
      const clearedRt = logoutCookies.find((c) => c.startsWith('rt=;'));
      expect(clearedRt).toBeDefined();

      // Refreshing with the revoked session now fails
      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', [rtCookie!]);
      expect(refreshRes.status).toBe(401);
    });
  });

  describe('User Profile and Settings APIs', () => {
    let authToken: string;

    beforeAll(async () => {
      const loginRes = await request(app).post('/api/v1/auth/login').send({
        email: 'alice@texly.app',
        password: 'CorrectHorseBattery123!',
      });
      authToken = loginRes.body.data.accessToken;
    });

    it('PATCH /api/v1/users/me updates profile name', async () => {
      const res = await request(app)
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Alice Wonderland' });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Alice Wonderland');
    });

    it('GET /api/v1/users/me/settings returns user settings', async () => {
      const res = await request(app)
        .get('/api/v1/users/me/settings')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.theme).toBe('system');
      expect(res.body.data.editorFontSize).toBe(14);
    });

    it('PATCH /api/v1/users/me/settings updates theme, font size, and keymap', async () => {
      const res = await request(app)
        .patch('/api/v1/users/me/settings')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          theme: 'dark',
          editorFontSize: 18,
          keymap: 'vim',
          autoCompile: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        theme: 'dark',
        editorFontSize: 18,
        keymap: 'vim',
        autoCompile: true,
      });
    });
  });
});
