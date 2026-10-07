import {
  constants,
  createPublicKey,
  verify as cryptoVerify,
  type KeyObject,
} from 'node:crypto';
import type { JwtSignatureVerifier } from './identity.js';

export const SUPABASE_JWKS_LIMITS = Object.freeze({
  tokenBytes: 8192,
  headerBytes: 1024,
  responseBytes: 65536,
  keys: 8,
  waiters: 64,
  timeoutMs: 5000,
  cacheTtlMs: 300000,
  refreshCooldownMs: 30000,
});

type Algorithm = 'ES256' | 'RS256';
interface VerificationKey {
  readonly alg: Algorithm;
  readonly key: KeyObject;
  readonly signatureBytes: number;
}
type Keys = ReadonlyMap<string, VerificationKey>;
interface PendingLoad {
  readonly controller: AbortController;
  readonly promise: Promise<Keys>;
  waiters: number;
}
export interface SupabaseJwksSignatureVerifier extends JwtSignatureVerifier {
  readonly expectedIssuer: string;
  readonly jwksUrl: string;
  /** Server/operator only: discard cache and cancel old loads, not token driven. */
  invalidateCache(): void;
}

function failure(): never {
  // No remote token/key, URL, decoded claims or underlying exception in errors.
  throw new Error('SUPABASE_JWT_VERIFICATION_FAILED');
}
function cancelled(): never {
  throw new Error('JWT_VERIFICATION_CANCELLED');
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) failure();
  return value as Record<string, unknown>;
}
function algorithm(value: unknown): Algorithm {
  if (value !== 'ES256' && value !== 'RS256') failure();
  return value;
}
function kid(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/u.test(value))
    failure();
  return value;
}
function bytes(value: unknown, max: number): Buffer {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > Math.ceil((max * 4) / 3) ||
    !/^[A-Za-z0-9_-]+$/u.test(value)
  )
    failure();
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length > max || decoded.toString('base64url') !== value)
    failure();
  return decoded;
}
function json(value: Uint8Array): Record<string, unknown> {
  return record(
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(value)),
  );
}
function onlyFields(
  value: Record<string, unknown>,
  allowed: readonly string[],
): void {
  if (Object.keys(value).some((name) => !allowed.includes(name))) failure();
}
function publicKeys(value: Record<string, unknown>): Keys {
  onlyFields(value, ['keys']);
  if (
    !Array.isArray(value.keys) ||
    value.keys.length === 0 ||
    value.keys.length > SUPABASE_JWKS_LIMITS.keys
  )
    failure();
  const keys = new Map<string, VerificationKey>();
  for (const raw of value.keys) {
    const jwk = record(raw);
    const id = kid(jwk.kid),
      alg = algorithm(jwk.alg);
    if (keys.has(id)) failure();
    // Supabase may provide use, key_ops, or both. At least one affirmative
    // signing/verification purpose is required; contradictory purposes reject.
    if (
      (jwk.use !== undefined && jwk.use !== 'sig') ||
      (jwk.key_ops !== undefined &&
        (!Array.isArray(jwk.key_ops) ||
          jwk.key_ops.length !== 1 ||
          jwk.key_ops[0] !== 'verify')) ||
      (jwk.use !== 'sig' && jwk.key_ops === undefined) ||
      (jwk.ext !== undefined && jwk.ext !== true)
    )
      failure();
    let material: {
      kty: string;
      crv?: string;
      x?: string;
      y?: string;
      n?: string;
      e?: string;
    };
    let signatureBytes: number;
    if (alg === 'ES256') {
      onlyFields(jwk, [
        'kid',
        'alg',
        'kty',
        'use',
        'key_ops',
        'ext',
        'crv',
        'x',
        'y',
      ]);
      if (
        jwk.kty !== 'EC' ||
        jwk.crv !== 'P-256' ||
        bytes(jwk.x, 32).length !== 32 ||
        bytes(jwk.y, 32).length !== 32
      )
        failure();
      material = {
        kty: 'EC',
        crv: 'P-256',
        x: jwk.x as string,
        y: jwk.y as string,
      };
      signatureBytes = 64; // JOSE ECDSA uses fixed-width IEEE-P1363 r || s.
    } else {
      onlyFields(jwk, ['kid', 'alg', 'kty', 'use', 'key_ops', 'ext', 'n', 'e']);
      if (jwk.kty !== 'RSA') failure();
      const modulus = bytes(jwk.n, 512),
        exponent = bytes(jwk.e, 8);
      if (modulus.length < 256 || modulus[0] === 0 || exponent[0] === 0)
        failure();
      const exponentValue = BigInt('0x' + exponent.toString('hex'));
      if (exponentValue < 3n || exponentValue % 2n === 0n) failure();
      material = { kty: 'RSA', n: jwk.n as string, e: jwk.e as string };
      signatureBytes = modulus.length;
    }
    const key = createPublicKey({ key: material, format: 'jwk' });
    if (
      key.type !== 'public' ||
      (alg === 'ES256' &&
        (key.asymmetricKeyType !== 'ec' ||
          key.asymmetricKeyDetails?.namedCurve !== 'prime256v1')) ||
      (alg === 'RS256' &&
        (key.asymmetricKeyType !== 'rsa' ||
          (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048 ||
          (key.asymmetricKeyDetails?.modulusLength ?? 0) > 4096))
    )
      failure();
    keys.set(id, { alg, key, signatureBytes });
  }
  return keys;
}

function awaitAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    // Still observe a late transport rejection (a custom fetch can ignore abort).
    void operation.catch(() => undefined);
    return Promise.reject(new Error('JWT_VERIFICATION_CANCELLED'));
  }
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new Error('JWT_VERIFICATION_CANCELLED'));
    signal.addEventListener('abort', abort, { once: true });
    void operation.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        if (signal.aborted) abort();
        else resolve(value);
      },
      () => {
        signal.removeEventListener('abort', abort);
        reject(new Error('SUPABASE_JWT_VERIFICATION_FAILED'));
      },
    );
  });
}

/**
 * Explicit server-only construction, no environment lookup or default mount.
 * fetch is a trusted server transport/test port, never supplied by a request.
 * Claims returned here are NOT a seat/role grant: callers must still run
 * verifySupabaseJwtClaims with their server issuer/audience/current-time policy.
 */
export function createSupabaseJwksSignatureVerifier(input: {
  readonly projectRef: string;
  readonly expectedIssuer: string;
  readonly jwksUrl: string;
  readonly fetch?: typeof globalThis.fetch;
}): SupabaseJwksSignatureVerifier {
  if (!/^[a-z]{20}$/u.test(input.projectRef))
    throw new Error('SUPABASE_JWKS_CONFIGURATION_INVALID');
  const issuer = `https://${input.projectRef}.supabase.co/auth/v1`;
  const jwksUrl = issuer + '/.well-known/jwks.json';
  if (input.expectedIssuer !== issuer || input.jwksUrl !== jwksUrl)
    throw new Error('SUPABASE_JWKS_CONFIGURATION_INVALID');
  const fetchKeys = input.fetch ?? globalThis.fetch;
  if (typeof fetchKeys !== 'function')
    throw new Error('SUPABASE_JWKS_CONFIGURATION_INVALID');
  let cache: { readonly keys: Keys; readonly expiresAt: number } | null = null;
  let pending: PendingLoad | null = null;
  let lastAttempt = Number.NEGATIVE_INFINITY;
  let generation = 0;

  async function download(signal: AbortSignal): Promise<Keys> {
    const response = await awaitAbort(
      fetchKeys(jwksUrl, {
        method: 'GET',
        redirect: 'error',
        credentials: 'omit',
        headers: { Accept: 'application/json' },
        signal,
        cache: 'no-store',
      }).then((result) => {
        if (signal.aborted) {
          void result.body?.cancel().catch(() => undefined);
          failure();
        }
        return result;
      }),
      signal,
    );
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      if (
        response.status !== 200 ||
        response.redirected ||
        response.url !== jwksUrl ||
        !['application/json', 'application/jwk-set+json'].includes(
          (response.headers.get('content-type') ?? '')
            .split(';')[0]!
            .trim()
            .toLowerCase(),
        ) ||
        response.body === null
      )
        failure();
      const length = response.headers.get('content-length');
      if (
        length !== null &&
        (!/^(0|[1-9]\d*)$/u.test(length) ||
          Number(length) > SUPABASE_JWKS_LIMITS.responseBytes)
      )
        failure();
      reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const next = await awaitAbort(reader.read(), signal);
        if (next.done) break;
        size += next.value.byteLength;
        if (size > SUPABASE_JWKS_LIMITS.responseBytes) failure();
        chunks.push(next.value);
      }
      // Native fetch may decompress a body while retaining its encoded
      // Content-Length. Bound both independently; never trust it as a read cap.
      return publicKeys(json(Buffer.concat(chunks, size)));
    } finally {
      // Best effort cleanup cannot prolong authentication; no error contents leak.
      if (reader) {
        void reader.cancel().catch(() => undefined);
        reader.releaseLock();
      } else {
        void response.body?.cancel().catch(() => undefined);
      }
    }
  }

  function startLoad(): PendingLoad {
    lastAttempt = performance.now();
    cache = null; // Never serve stale keys on a failed/expired refresh.
    const currentGeneration = generation;
    const controller = new AbortController();
    const mine: PendingLoad = {
      controller,
      waiters: 0,
      promise: Promise.resolve().then(async () => {
        const timeout = setTimeout(
          () => controller.abort(),
          SUPABASE_JWKS_LIMITS.timeoutMs,
        );
        try {
          const keys = await download(controller.signal);
          if (controller.signal.aborted || currentGeneration !== generation)
            failure();
          cache = {
            keys,
            expiresAt: performance.now() + SUPABASE_JWKS_LIMITS.cacheTtlMs,
          };
          return keys;
        } finally {
          clearTimeout(timeout);
          if (pending === mine) pending = null;
        }
      }),
    };
    pending = mine;
    return mine;
  }
  async function load(signal: AbortSignal | undefined): Promise<Keys> {
    if (signal?.aborted) cancelled();
    const operation =
      pending ??
      (performance.now() - lastAttempt >= SUPABASE_JWKS_LIMITS.refreshCooldownMs
        ? startLoad()
        : failure());
    if (operation.waiters >= SUPABASE_JWKS_LIMITS.waiters) failure();
    operation.waiters += 1;
    try {
      return signal
        ? await awaitAbort(operation.promise, signal)
        : await operation.promise;
    } finally {
      operation.waiters -= 1;
      // A caller cannot cancel another caller's key load. If none remain, abort.
      if (operation.waiters === 0) operation.controller.abort();
    }
  }

  return Object.freeze({
    expectedIssuer: issuer,
    jwksUrl,
    invalidateCache() {
      generation += 1;
      cache = null;
      lastAttempt = Number.NEGATIVE_INFINITY;
      pending?.controller.abort();
      pending = null;
    },
    async verify(token: string, signal?: AbortSignal): Promise<unknown> {
      try {
        if (signal?.aborted) cancelled();
        if (
          typeof token !== 'string' ||
          Buffer.byteLength(token) > SUPABASE_JWKS_LIMITS.tokenBytes
        )
          failure();
        const parts = token.split('.');
        if (parts.length !== 3) failure();
        const [headerPart, payloadPart, signaturePart] = parts;
        const header = json(
          bytes(headerPart, SUPABASE_JWKS_LIMITS.headerBytes),
        );
        onlyFields(header, ['alg', 'kid', 'typ']); // reject jku/x5u/jwk/crit/b64, not just ignore
        const alg = algorithm(header.alg),
          id = kid(header.kid);
        if (header.typ !== 'JWT') failure();
        const signature = bytes(signaturePart, 512);
        let keys =
          cache && performance.now() < cache.expiresAt
            ? cache.keys
            : await load(signal);
        // An unknown kid may cause one cooldown-gated refresh, never a loop.
        if (
          !keys.has(id) &&
          performance.now() - lastAttempt >=
            SUPABASE_JWKS_LIMITS.refreshCooldownMs
        )
          keys = await load(signal);
        const selected = keys.get(id);
        if (
          !selected ||
          selected.alg !== alg ||
          signature.length !== selected.signatureBytes
        )
          failure();
        if (signal?.aborted) cancelled();
        const verified = cryptoVerify(
          'sha256',
          Buffer.from(`${headerPart}.${payloadPart}`, 'ascii'),
          alg === 'ES256'
            ? { key: selected.key, dsaEncoding: 'ieee-p1363' }
            : { key: selected.key, padding: constants.RSA_PKCS1_PADDING },
          signature,
        );
        if (!verified) failure();
        // Decode/return claims only after actual cryptographic verification.
        const claims = json(
          bytes(payloadPart, SUPABASE_JWKS_LIMITS.tokenBytes),
        );
        if (claims.iss !== issuer) failure();
        if (signal?.aborted) cancelled();
        return claims;
      } catch {
        if (signal?.aborted) cancelled();
        return failure();
      }
    },
  });
}
