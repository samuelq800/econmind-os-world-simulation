export type SupabaseAuthSubject = string & {
  readonly __brand: 'SupabaseAuthSubject';
};

export interface JwtClaimsPolicy {
  readonly expectedIssuer: string;
  readonly expectedAudience: string;
  readonly nowEpochSeconds: number;
  readonly clockSkewSeconds?: number;
}

export interface ValidatedJwtClaims {
  readonly authSubject: SupabaseAuthSubject;
  readonly issuer: string;
  readonly audience: string;
  readonly issuedAtEpochSeconds: number;
  readonly expiresAtEpochSeconds: number;
}

export interface JwtSignatureVerifier {
  /**
   * Must cryptographically verify the token before returning decoded claims.
   * The preparation slice injects only local fixtures; no live verifier exists.
   */
  verify(token: string, signal?: AbortSignal): Promise<unknown>;
}

const CANONICAL_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

function invalid(reason: string): never {
  throw new Error(`JWT_CLAIMS_INVALID: ${reason}`);
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    invalid('claims must be an object');
  }
  return value as Record<string, unknown>;
}

function integer(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    invalid(`${label} must be a non-negative safe integer`);
  }
  return value as number;
}

function abortFailure(): Error {
  return new Error('JWT_VERIFICATION_CANCELLED');
}

async function awaitVerification<T>(
  operation: Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T> {
  if (signal?.aborted) throw abortFailure();
  if (signal === undefined) return operation;
  return new Promise<T>((resolve, reject) => {
    const cancel = () => reject(abortFailure());
    signal.addEventListener('abort', cancel, { once: true });
    void operation.then(
      (value) => {
        signal.removeEventListener('abort', cancel);
        if (signal.aborted) reject(abortFailure());
        else resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', cancel);
        if (signal.aborted) reject(abortFailure());
        else reject(error);
      },
    );
  });
}

export function parseSupabaseAuthSubject(value: unknown): SupabaseAuthSubject {
  if (typeof value !== 'string' || !CANONICAL_UUID.test(value)) {
    invalid('sub must be a canonical lowercase UUID');
  }
  return value as SupabaseAuthSubject;
}

/**
 * Pure post-signature claims validation. This function does not decode or
 * authenticate a JWT and must receive claims from JwtSignatureVerifier.
 */
export function validateVerifiedJwtClaims(
  value: unknown,
  policy: JwtClaimsPolicy,
): ValidatedJwtClaims {
  const claims = record(value);
  const authSubject = parseSupabaseAuthSubject(claims.sub);
  if (claims.iss !== policy.expectedIssuer) invalid('issuer mismatch');

  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (
    audiences.length === 0 ||
    audiences.some((audience) => typeof audience !== 'string') ||
    !audiences.includes(policy.expectedAudience)
  ) {
    invalid('audience mismatch');
  }

  const issuedAt = integer(claims.iat, 'iat');
  const expiresAt = integer(claims.exp, 'exp');
  const now = integer(policy.nowEpochSeconds, 'nowEpochSeconds');
  const skew = integer(policy.clockSkewSeconds ?? 0, 'clockSkewSeconds');
  if (skew > 300) invalid('clockSkewSeconds exceeds 300');
  if (issuedAt > now + skew) invalid('token issued in the future');
  if (expiresAt <= issuedAt) invalid('exp must be after iat');
  if (expiresAt <= now - skew) invalid('token expired');

  return Object.freeze({
    authSubject,
    issuer: policy.expectedIssuer,
    audience: policy.expectedAudience,
    issuedAtEpochSeconds: issuedAt,
    expiresAtEpochSeconds: expiresAt,
  });
}

export async function verifySupabaseJwtClaims(input: {
  readonly token: string;
  readonly verifier: JwtSignatureVerifier;
  readonly policy: JwtClaimsPolicy;
  readonly signal?: AbortSignal;
}): Promise<ValidatedJwtClaims> {
  if (input.token.length === 0) invalid('token is empty');
  if (input.signal?.aborted) throw abortFailure();
  const claims = await awaitVerification(
    input.verifier.verify(input.token, input.signal),
    input.signal,
  );
  return validateVerifiedJwtClaims(claims, input.policy);
}
