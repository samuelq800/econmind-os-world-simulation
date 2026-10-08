/** Private server composition only. No HTTP DTO, key loading or signing API.
 * A signature authorizes one exact publication attempt, NOT economic adoption
 * or ADMITTED state. The service must still validate real source and SQL facts.
 */
import { KeyObject, verify } from 'node:crypto';
import { canonicalSerialize, worldId, openingSeedId } from '@econmind/core';

export const OPENING_PUBLICATION_SIGNATURE_DOMAIN =
  'EconMindWorld/opening-admission-publication/v1\n';

export interface OpeningPublicationAuthorization {
  readonly schemaVersion: 'opening-publication-authorization-v1';
  readonly purpose: 'AUTHORIZE_OFFICIAL_OPENING_ADMISSION_PUBLICATION';
  readonly authorizationId: string;
  readonly keyId: string;
  readonly ownerIdentity: string;
  readonly issuedAtReal: string;
  readonly expiresAtReal: string;
  readonly worldId: string;
  readonly seedId: string;
  readonly seedFingerprint: string;
  readonly modelVersion: string;
  readonly replayBinding: string;
  readonly sourceBundleSha256: string;
}

export interface SignedOpeningPublicationAuthorization {
  readonly canonicalAuthorization: string;
  readonly signatureBase64Url: string;
}

export class OpeningPublicationAuthorityError extends Error {
  constructor() {
    super('OPENING_PUBLICATION_AUTHORIZATION_DENIED');
    this.name = 'OpeningPublicationAuthorityError';
  }
}

declare const verifiedApproval: unique symbol;
const privateAuthorities = new WeakSet<object>();
export interface VerifiedOpeningPublicationApproval {
  readonly [verifiedApproval]: true;
}

function deny(): never {
  throw new OpeningPublicationAuthorityError();
}

export function openingPublicationTimestamp(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    deny();
  return value;
}

const fields = [
  'schemaVersion',
  'purpose',
  'authorizationId',
  'keyId',
  'ownerIdentity',
  'issuedAtReal',
  'expiresAtReal',
  'worldId',
  'seedId',
  'seedFingerprint',
  'modelVersion',
  'replayBinding',
  'sourceBundleSha256',
] as const;

function parseAuthorization(
  bytes: string,
): Readonly<OpeningPublicationAuthorization> {
  const raw: unknown = JSON.parse(bytes);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) deny();
  const r = raw as Record<string, unknown>;
  if (
    Object.keys(r).length !== fields.length ||
    fields.some((key) => typeof r[key] !== 'string' || r[key] === '') ||
    canonicalSerialize(raw) !== bytes ||
    r.schemaVersion !== 'opening-publication-authorization-v1' ||
    r.purpose !== 'AUTHORIZE_OFFICIAL_OPENING_ADMISSION_PUBLICATION' ||
    !/^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u.test(String(r.authorizationId)) ||
    !/^sha256:[0-9a-f]{64}$/u.test(String(r.seedFingerprint)) ||
    !/^[0-9a-f]{64}$/u.test(String(r.sourceBundleSha256))
  )
    deny();
  worldId(String(r.worldId));
  openingSeedId(String(r.seedId));
  const replay: unknown = JSON.parse(String(r.replayBinding));
  if (canonicalSerialize(replay) !== r.replayBinding) deny();
  const issued = openingPublicationTimestamp(r.issuedAtReal);
  const expires = openingPublicationTimestamp(r.expiresAtReal);
  if (issued >= expires) deny();
  return Object.freeze(
    r,
  ) as unknown as Readonly<OpeningPublicationAuthorization>;
}

/** Keys/owner identities and the immutable registry are deployment-owned inputs,
 * never request JSON. No approved production key/record is bundled here. Registry
 * absence/revocation denies. B owns audited provisioning and durable retention.
 */
export class PrivateOpeningAdmissionAuthority {
  readonly #keys: ReadonlyMap<
    string,
    Readonly<{ publicKey: KeyObject; ownerIdentity: string }>
  >;
  readonly #registry: Readonly<{
    load(
      reference: string,
    ): Promise<SignedOpeningPublicationAuthorization | null>;
  }>;
  readonly #proofs = new WeakMap<
    object,
    Readonly<OpeningPublicationAuthorization>
  >();

  constructor(input: {
    readonly trustedKeys: ReadonlyMap<
      string,
      Readonly<{ publicKey: KeyObject; ownerIdentity: string }>
    >;
    readonly registry: Readonly<{
      load(
        reference: string,
      ): Promise<SignedOpeningPublicationAuthorization | null>;
    }>;
  }) {
    this.#keys = new Map(
      [...input.trustedKeys].map(([id, key]) => {
        if (
          !id ||
          !key.ownerIdentity ||
          !(key.publicKey instanceof KeyObject) ||
          key.publicKey.type !== 'public' ||
          key.publicKey.asymmetricKeyType !== 'ed25519'
        )
          deny();
        return [id, Object.freeze({ ...key })];
      }),
    );
    this.#registry = input.registry;
    privateAuthorities.add(this);
  }

  async resolve(
    reference: string,
    nowReal: string,
  ): Promise<VerifiedOpeningPublicationApproval> {
    try {
      if (!/^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u.test(reference)) deny();
      const now = openingPublicationTimestamp(nowReal);
      const envelope = await this.#registry.load(reference);
      if (
        !envelope ||
        typeof envelope.canonicalAuthorization !== 'string' ||
        Buffer.byteLength(envelope.canonicalAuthorization, 'utf8') > 16_384 ||
        typeof envelope.signatureBase64Url !== 'string'
      )
        deny();
      const claims = parseAuthorization(envelope.canonicalAuthorization);
      const key = this.#keys.get(claims.keyId);
      const signature = Buffer.from(envelope.signatureBase64Url, 'base64url');
      if (
        !key ||
        claims.authorizationId !== reference ||
        key.ownerIdentity !== claims.ownerIdentity ||
        claims.issuedAtReal > now ||
        now >= claims.expiresAtReal ||
        signature.length !== 64 ||
        signature.toString('base64url') !== envelope.signatureBase64Url ||
        !verify(
          null,
          Buffer.from(
            OPENING_PUBLICATION_SIGNATURE_DOMAIN +
              envelope.canonicalAuthorization,
          ),
          key.publicKey,
          signature,
        )
      )
        deny();
      const proof = Object.freeze({}) as VerifiedOpeningPublicationApproval;
      this.#proofs.set(proof, claims);
      return proof;
    } catch {
      return deny();
    }
  }

  claims(
    proof: VerifiedOpeningPublicationApproval,
  ): Readonly<OpeningPublicationAuthorization> {
    const claims = this.#proofs.get(proof);
    if (!claims) deny();
    return claims;
  }
}

export function isPrivateOpeningAdmissionAuthority(
  value: unknown,
): value is PrivateOpeningAdmissionAuthority {
  return (
    typeof value === 'object' && value !== null && privateAuthorities.has(value)
  );
}

// Capture the genuine issuer methods. Structural objects/subclass overrides
// must not replace signature validation in a service composition.
const resolveApproval = PrivateOpeningAdmissionAuthority.prototype.resolve;
const readClaims = PrivateOpeningAdmissionAuthority.prototype.claims;
export async function resolvePrivateOpeningPublicationAuthorization(
  authority: PrivateOpeningAdmissionAuthority,
  reference: string,
  nowReal: string,
): Promise<Readonly<OpeningPublicationAuthorization>> {
  if (!isPrivateOpeningAdmissionAuthority(authority)) deny();
  return readClaims.call(
    authority,
    await resolveApproval.call(authority, reference, nowReal),
  );
}
