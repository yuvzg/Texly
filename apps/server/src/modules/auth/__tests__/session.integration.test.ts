import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDatabase, type TestDatabase } from '../../../__tests__/test-db.js';
import { UsersRepository } from '../../users/users.repository.js';
import { SessionsRepository } from '../sessions.repository.js';
import { SessionService } from '../session.service.js';
import { hashToken } from '../token.utils.js';
import { ErrorCodeEnum } from '@texly/shared';

describe('SessionService Integration (PostgreSQL)', () => {
  let db: TestDatabase;
  let usersRepo: UsersRepository;
  let sessionsRepo: SessionsRepository;
  let sessionService: SessionService;
  let testUserId: string;

  beforeAll(async () => {
    db = await setupTestDatabase();
    usersRepo = new UsersRepository(db.db.client);
    sessionsRepo = new SessionsRepository(db.db.client);
    sessionService = new SessionService(db.db.client, sessionsRepo, usersRepo, {
      refreshTokenTtlDays: 7,
      maxActiveSessions: 3,
    });

    const user = await usersRepo.create({
      email: 'session-test@texly.app',
      name: 'Session Tester',
    });
    testUserId = user.id;
  }, 60000);

  afterAll(async () => {
    if (db) {
      await db.cleanup();
    }
  });

  it('creates an active session and stores only the SHA-256 token hash', async () => {
    const { session, refreshToken } = await sessionService.createSession({
      userId: testUserId,
      userAgent: 'Mozilla/5.0 Vitest',
      ipAddress: '127.0.0.1',
    });

    expect(session.id).toBeDefined();
    expect(session.userId).toBe(testUserId);
    expect(session.familyId).toBeDefined();
    expect(session.revokedAt).toBeNull();
    expect(session.replacedById).toBeNull();
    expect(session.userAgent).toBe('Mozilla/5.0 Vitest');
    expect(session.ipAddress).toBe('127.0.0.1');

    // Token must be opaque base64url string (not plaintext in DB)
    expect(refreshToken).not.toBe(session.tokenHash);
    expect(hashToken(refreshToken)).toBe(session.tokenHash);

    // Verify retrieval by hash
    const found = await sessionsRepo.findByTokenHash(hashToken(refreshToken));
    expect(found).not.toBeNull();
    expect(found?.id).toBe(session.id);
  });

  it('rotates refresh tokens successfully and links session successor', async () => {
    // 1. Initial session
    const initial = await sessionService.createSession({
      userId: testUserId,
      userAgent: 'Agent 1',
    });

    // 2. Rotate with the initial token
    const rotated1 = await sessionService.rotateSession({
      refreshToken: initial.refreshToken,
      userAgent: 'Agent 2',
    });

    expect(rotated1.session.id).not.toBe(initial.session.id);
    expect(rotated1.session.familyId).toBe(initial.session.familyId); // Same family
    expect(rotated1.refreshToken).not.toBe(initial.refreshToken);

    // Verify initial session in DB is now replaced and revoked
    const oldSession = await sessionsRepo.findById(initial.session.id);
    expect(oldSession?.revokedAt).not.toBeNull();
    expect(oldSession?.replacedById).toBe(rotated1.session.id);

    // 3. Second rotation with the new token
    const rotated2 = await sessionService.rotateSession({
      refreshToken: rotated1.refreshToken,
    });

    expect(rotated2.session.familyId).toBe(initial.session.familyId);
    expect(rotated2.session.replacedById).toBeNull();

    const previousSession = await sessionsRepo.findById(rotated1.session.id);
    expect(previousSession?.revokedAt).not.toBeNull();
    expect(previousSession?.replacedById).toBe(rotated2.session.id);
  });

  it('detects refresh token reuse and immediately revokes all family sessions', async () => {
    // 1. Create a session family
    const gen0 = await sessionService.createSession({ userId: testUserId });

    // 2. Legitimate user rotates gen0 -> gen1
    const gen1 = await sessionService.rotateSession({
      refreshToken: gen0.refreshToken,
    });

    // 3. Legitimate user rotates gen1 -> gen2
    const gen2 = await sessionService.rotateSession({
      refreshToken: gen1.refreshToken,
    });

    // At this point, gen2 is active
    const gen2Active = await sessionService.validateSession(gen2.session.id);
    expect(gen2Active.revokedAt).toBeNull();

    // 4. ATTACK: An attacker or replay re-submits gen0 (already rotated/revoked)
    await expect(
      sessionService.rotateSession({
        refreshToken: gen0.refreshToken,
      }),
    ).rejects.toMatchObject({
      code: ErrorCodeEnum.REFRESH_REUSED,
      statusCode: 401,
    });

    // 5. Verification: Entire family (including gen2!) MUST now be revoked
    const gen2AfterReuse = await sessionsRepo.findById(gen2.session.id);
    expect(gen2AfterReuse?.revokedAt).not.toBeNull();

    // Validating gen2 now fails
    await expect(sessionService.validateSession(gen2.session.id)).rejects.toMatchObject({
      code: ErrorCodeEnum.UNAUTHENTICATED,
      statusCode: 401,
    });

    // Rotating gen2 now fails as well
    await expect(
      sessionService.rotateSession({
        refreshToken: gen2.refreshToken,
      }),
    ).rejects.toThrow();
  });

  it('enforces maximum concurrent session quota per user', async () => {
    // Max sessions is configured to 3 for this test
    const s1 = await sessionService.createSession({ userId: testUserId });
    const s2 = await sessionService.createSession({ userId: testUserId });
    const s3 = await sessionService.createSession({ userId: testUserId });
    const s4 = await sessionService.createSession({ userId: testUserId });

    // s1 (oldest) should have been pruned/revoked
    const s1Db = await sessionsRepo.findById(s1.session.id);
    expect(s1Db?.revokedAt).not.toBeNull();

    // s4, s3, s2 should remain active
    const s2Db = await sessionsRepo.findById(s2.session.id);
    const s3Db = await sessionsRepo.findById(s3.session.id);
    const s4Db = await sessionsRepo.findById(s4.session.id);
    expect(s2Db?.revokedAt).toBeNull();
    expect(s3Db?.revokedAt).toBeNull();
    expect(s4Db?.revokedAt).toBeNull();
  });

  it('prevents disabled or deleted users from authenticating', async () => {
    const disabledUser = await usersRepo.create({
      email: 'disabled@texly.app',
      name: 'Disabled User',
    });

    const activeSession = await sessionService.createSession({
      userId: disabledUser.id,
    });

    // Disable the user
    await usersRepo.update(disabledUser.id, {
      disabledAt: new Date(),
    });

    // Attempting to validate session must fail with ACCOUNT_DISABLED
    await expect(sessionService.validateSession(activeSession.session.id)).rejects.toMatchObject({
      code: ErrorCodeEnum.ACCOUNT_DISABLED,
      statusCode: 403,
    });

    // Attempting to rotate session must also fail and revoke family
    await expect(
      sessionService.rotateSession({
        refreshToken: activeSession.refreshToken,
      }),
    ).rejects.toMatchObject({
      code: ErrorCodeEnum.ACCOUNT_DISABLED,
      statusCode: 403,
    });
  });

  it('handles concurrent refreshes with identical token safely', async () => {
    const initial = await sessionService.createSession({ userId: testUserId });

    // Execute two refresh requests simultaneously with the same token
    const results = await Promise.allSettled([
      sessionService.rotateSession({ refreshToken: initial.refreshToken }),
      sessionService.rotateSession({ refreshToken: initial.refreshToken }),
    ]);

    // Exactly one should succeed, or if racing causes reuse detection, the family is protected
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBeLessThanOrEqual(1);
    expect(rejected.length).toBeGreaterThanOrEqual(1);
  });
});
