import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'node:crypto';
import * as jose from 'jose';
import { JwtService } from '../jwt.service.js';
import { ErrorCodeEnum } from '@texly/shared';

describe('JwtService (EdDSA & Key Rotation)', () => {
  let activePrivPem: string;
  let activePubPem: string;
  let rotatedPrivPem: string;
  let rotatedPubPem: string;
  let jwtService: JwtService;

  beforeAll(() => {
    // Generate active keypair
    const activePair = crypto.generateKeyPairSync('ed25519');
    activePrivPem = activePair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    activePubPem = activePair.publicKey.export({ type: 'spki', format: 'pem' }).toString();

    // Generate older/rotated keypair
    const rotatedPair = crypto.generateKeyPairSync('ed25519');
    rotatedPrivPem = rotatedPair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    rotatedPubPem = rotatedPair.publicKey.export({ type: 'spki', format: 'pem' }).toString();

    jwtService = new JwtService({
      issuer: 'texly-test-api',
      audience: 'texly-test-web',
      expiresInSeconds: 60,
      activeKid: 'active-key-2026',
      privateKeyPem: activePrivPem,
      publicKeyPem: activePubPem,
      additionalPublicKeys: {
        'legacy-key-2025': rotatedPubPem,
      },
    });
  });

  it('signs and verifies a valid access token with active key', async () => {
    const claims = {
      sub: '018f3a22-3847-7975-b6d3-000000000001',
      sid: '018f3a22-3847-7975-b6d3-000000000002',
      email: 'user@example.com',
    };

    const token = await jwtService.signAccessToken(claims);
    expect(typeof token).toBe('string');

    // Inspect protected header
    const header = jose.decodeProtectedHeader(token);
    expect(header.alg).toBe('EdDSA');
    expect(header.kid).toBe('active-key-2026');

    // Verify token
    const verified = await jwtService.verifyAccessToken(token);
    expect(verified.sub).toBe(claims.sub);
    expect(verified.sid).toBe(claims.sid);
    expect(verified.iss).toBe('texly-test-api');
    expect(verified.aud).toBe('texly-test-web');
  });

  it('verifies tokens signed with previous key ID (key rotation)', async () => {
    // Create token signed with the older key and legacy kid
    const oldPrivKey = await jose.importPKCS8(rotatedPrivPem, 'EdDSA');
    const legacyToken = await new jose.SignJWT({
      sub: 'user-legacy-id',
      sid: 'session-legacy-id',
    })
      .setProtectedHeader({ alg: 'EdDSA', kid: 'legacy-key-2025' })
      .setIssuedAt()
      .setIssuer('texly-test-api')
      .setAudience('texly-test-web')
      .setExpirationTime('5m')
      .sign(oldPrivKey);

    const verified = await jwtService.verifyAccessToken(legacyToken);
    expect(verified.sub).toBe('user-legacy-id');
    expect(verified.sid).toBe('session-legacy-id');
  });

  it('rejects tokens with an unknown key ID (kid)', async () => {
    const oldPrivKey = await jose.importPKCS8(rotatedPrivPem, 'EdDSA');
    const unknownKidToken = await new jose.SignJWT({
      sub: 'user-1',
      sid: 'session-1',
    })
      .setProtectedHeader({ alg: 'EdDSA', kid: 'unregistered-kid' })
      .setIssuedAt()
      .setIssuer('texly-test-api')
      .setAudience('texly-test-web')
      .setExpirationTime('5m')
      .sign(oldPrivKey);

    await expect(jwtService.verifyAccessToken(unknownKidToken)).rejects.toMatchObject({
      code: ErrorCodeEnum.TOKEN_INVALID,
      statusCode: 401,
    });
  });

  it('rejects expired tokens with TOKEN_EXPIRED', async () => {
    const expiredService = new JwtService({
      issuer: 'texly-test-api',
      audience: 'texly-test-web',
      expiresInSeconds: -10, // already expired
      activeKid: 'active-key-2026',
      privateKeyPem: activePrivPem,
      publicKeyPem: activePubPem,
    });

    const token = await expiredService.signAccessToken({
      sub: 'user-1',
      sid: 'session-1',
    });

    await expect(jwtService.verifyAccessToken(token)).rejects.toMatchObject({
      code: ErrorCodeEnum.TOKEN_EXPIRED,
      statusCode: 401,
    });
  });

  it('rejects tokens signed with a different key than header claims', async () => {
    // Signed with rotated key, but claims active kid in header
    const oldPrivKey = await jose.importPKCS8(rotatedPrivPem, 'EdDSA');
    const forgedToken = await new jose.SignJWT({
      sub: 'user-hacker',
      sid: 'session-fake',
    })
      .setProtectedHeader({ alg: 'EdDSA', kid: 'active-key-2026' })
      .setIssuedAt()
      .setIssuer('texly-test-api')
      .setAudience('texly-test-web')
      .setExpirationTime('5m')
      .sign(oldPrivKey);

    await expect(jwtService.verifyAccessToken(forgedToken)).rejects.toMatchObject({
      code: ErrorCodeEnum.TOKEN_INVALID,
      statusCode: 401,
    });
  });

  it('rejects tokens with mismatched issuer or audience', async () => {
    const activePrivKey = await jose.importPKCS8(activePrivPem, 'EdDSA');

    // Wrong issuer
    const wrongIssToken = await new jose.SignJWT({ sub: 'user-1', sid: 'session-1' })
      .setProtectedHeader({ alg: 'EdDSA', kid: 'active-key-2026' })
      .setIssuedAt()
      .setIssuer('malicious-issuer')
      .setAudience('texly-test-web')
      .setExpirationTime('5m')
      .sign(activePrivKey);

    await expect(jwtService.verifyAccessToken(wrongIssToken)).rejects.toMatchObject({
      code: ErrorCodeEnum.TOKEN_INVALID,
      statusCode: 401,
    });

    // Wrong audience
    const wrongAudToken = await new jose.SignJWT({ sub: 'user-1', sid: 'session-1' })
      .setProtectedHeader({ alg: 'EdDSA', kid: 'active-key-2026' })
      .setIssuedAt()
      .setIssuer('texly-test-api')
      .setAudience('another-service')
      .setExpirationTime('5m')
      .sign(activePrivKey);

    await expect(jwtService.verifyAccessToken(wrongAudToken)).rejects.toMatchObject({
      code: ErrorCodeEnum.TOKEN_INVALID,
      statusCode: 401,
    });
  });
});
