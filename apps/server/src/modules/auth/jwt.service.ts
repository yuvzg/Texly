import * as jose from 'jose';
import { AppError } from '../../http/middleware/error-handler.js';
import { ErrorCodeEnum } from '@texly/shared';
import { logger } from '../../logging/logger.js';

export interface AccessTokenClaims {
  sub: string;
  sid: string;
  [key: string]: unknown;
}

export interface JwtSigner {
  signAccessToken(claims: AccessTokenClaims): Promise<string>;
}

export interface JwtVerifier {
  verifyAccessToken(token: string): Promise<AccessTokenClaims>;
}

export interface JwtServiceOptions {
  issuer: string;
  audience: string;
  expiresInSeconds: number;
  activeKid: string;
  privateKeyPem: string;
  publicKeyPem: string;
  additionalPublicKeys?: Record<string, string>; // kid -> PEM
}

type JoseKey = Awaited<ReturnType<typeof jose.importPKCS8>>;

export class JwtService implements JwtSigner, JwtVerifier {
  private readonly issuer: string;
  private readonly audience: string;
  private readonly expiresInSeconds: number;
  private readonly activeKid: string;
  private readonly privateKeyPem: string;
  private readonly publicKeysPem: Map<string, string>;

  // Cached imported KeyObjects / CryptoKeys
  private activePrivateKeyPromise?: Promise<JoseKey>;
  private readonly publicKeysCache = new Map<string, Promise<JoseKey>>();

  constructor(options: JwtServiceOptions) {
    this.issuer = options.issuer;
    this.audience = options.audience;
    this.expiresInSeconds = options.expiresInSeconds;
    this.activeKid = options.activeKid;
    this.privateKeyPem = options.privateKeyPem;

    this.publicKeysPem = new Map<string, string>();
    this.publicKeysPem.set(options.activeKid, options.publicKeyPem);

    if (options.additionalPublicKeys) {
      for (const [kid, pem] of Object.entries(options.additionalPublicKeys)) {
        this.publicKeysPem.set(kid, pem);
      }
    }
  }

  private getPrivateKey(): Promise<JoseKey> {
    if (!this.activePrivateKeyPromise) {
      this.activePrivateKeyPromise = jose.importPKCS8(this.privateKeyPem, 'EdDSA');
    }
    return this.activePrivateKeyPromise;
  }

  private getPublicKey(kid?: string): Promise<JoseKey> {
    const targetKid = kid ?? this.activeKid;
    const pem = this.publicKeysPem.get(targetKid);

    if (!pem) {
      throw new AppError(
        ErrorCodeEnum.TOKEN_INVALID,
        401,
        `Unknown or unsupported key identifier: ${targetKid}`,
      );
    }

    let keyPromise = this.publicKeysCache.get(targetKid);
    if (!keyPromise) {
      keyPromise = jose.importSPKI(pem, 'EdDSA');
      this.publicKeysCache.set(targetKid, keyPromise);
    }

    return keyPromise;
  }

  /**
   * Signs an access token with EdDSA using the active private key and key ID.
   */
  async signAccessToken(claims: AccessTokenClaims): Promise<string> {
    const key = await this.getPrivateKey();

    const signBuilder = new jose.SignJWT({ ...claims })
      .setProtectedHeader({ alg: 'EdDSA', kid: this.activeKid })
      .setIssuedAt()
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setExpirationTime(`${this.expiresInSeconds}s`);

    return await signBuilder.sign(key);
  }

  /**
   * Cryptographically verifies an access token against the key designated in its header.
   * Validates issuer, audience, and expiration.
   */
  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    if (!token || typeof token !== 'string') {
      throw new AppError(ErrorCodeEnum.UNAUTHENTICATED, 401, 'Access token is required.');
    }

    try {
      // Decode protected header to resolve the key ID (kid) for key rotation
      const header = jose.decodeProtectedHeader(token);
      if (header.alg !== 'EdDSA') {
        throw new AppError(
          ErrorCodeEnum.TOKEN_INVALID,
          401,
          `Unsupported token algorithm: ${header.alg}`,
        );
      }

      const kid = header.kid;
      const publicKey = await this.getPublicKey(kid);

      const { payload } = await jose.jwtVerify(token, publicKey, {
        issuer: this.issuer,
        audience: this.audience,
      });

      if (!payload.sub || typeof payload.sub !== 'string') {
        throw new AppError(ErrorCodeEnum.TOKEN_INVALID, 401, 'Token missing sub claim.');
      }

      if (!payload['sid'] || typeof payload['sid'] !== 'string') {
        throw new AppError(ErrorCodeEnum.TOKEN_INVALID, 401, 'Token missing sid claim.');
      }

      return {
        ...payload,
        sub: payload.sub,
        sid: payload['sid'] as string,
      };
    } catch (err: unknown) {
      if (err instanceof AppError) {
        throw err;
      }

      if (err instanceof jose.errors.JWTExpired) {
        throw new AppError(ErrorCodeEnum.TOKEN_EXPIRED, 401, 'Access token has expired.');
      }

      if (
        err instanceof jose.errors.JWTClaimValidationFailed ||
        err instanceof jose.errors.JWSInvalid ||
        err instanceof jose.errors.JWSSignatureVerificationFailed
      ) {
        throw new AppError(ErrorCodeEnum.TOKEN_INVALID, 401, 'Invalid or tampered access token.');
      }

      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'Unexpected error verifying JWT',
      );
      throw new AppError(ErrorCodeEnum.TOKEN_INVALID, 401, 'Token verification failed.');
    }
  }
}
