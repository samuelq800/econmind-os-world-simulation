import type { AuthorizedBrowserIdentity } from '../authorized-client/client.js';

/** Browser mirror of the optional HTTP-neutral read composition, never authority. */
export const AUTHORIZED_READ_BINDING_SCHEMA =
  'world-authorized-read-binding-v1';
export const READ_ONLY_CAPABILITY = 'READ_AUTHORIZED_PROJECTION_AND_FINAL';
export const READ_OFFICES = Object.freeze([
  'CAPTAIN',
  'FINANCE',
  'CENTRAL_BANK',
  'INDUSTRY',
  'TRADE',
  'SOCIAL',
] as const);
export interface AdmittedWorldPins {
  readonly worldId: string;
  readonly seedRef: string;
  readonly contentHash: string;
  readonly admissionRef: string;
  readonly minimumWorldVersion: string;
}
export interface ApprovedReadEndpoints {
  readonly origin: string;
  readonly projectionPath: string;
  readonly finalLookupPath: string;
  /** External deployment/config approval reference; a string is not an approval. */
  readonly deploymentRef: string;
}
export interface ServerReadAuthority {
  readonly source: 'SERVER_VERIFIED_READ_BINDING';
  readonly capability: typeof READ_ONLY_CAPABILITY;
  readonly identity: AuthorizedBrowserIdentity;
  readonly seatRef: string;
  readonly seatState: 'ACTIVE';
  readonly seed: Omit<AdmittedWorldPins, 'minimumWorldVersion'>;
  readonly readback: {
    readonly worldId: string;
    readonly seedRef: string;
    readonly contentHash: string;
    readonly admissionRef: string;
    readonly worldVersion: string;
    readonly eventSequence: string;
    readonly readbackRef: string;
  };
}
export interface ProductionReadConfig {
  readonly endpoints: ApprovedReadEndpoints;
  readonly world: AdmittedWorldPins;
  readonly identity: AuthorizedBrowserIdentity;
  readonly seatRef: string;
  readonly currentIdentity: () => AuthorizedBrowserIdentity | null;
  readonly getAccessToken: () => Promise<string | null>;
  readonly session: {
    readonly sessionRef: string;
    readonly isCurrent: () => boolean;
    readonly onInvalidate: (listener: () => void) => () => void;
  };
}
export function row(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
export const canonicalId = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u.test(v) &&
  v.length <= 256;
export const version = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^(?:0|[1-9]\d*)$/u.test(v) &&
  v.length <= 19 &&
  BigInt(v) <= 9223372036854775807n;
export const hash = (v: unknown): v is string =>
  typeof v === 'string' && /^sha256:[0-9a-f]{64}$/u.test(v);
export const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
    v,
  );
const text = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= 256 && v.trim() === v;
export function validReadIdentity(v: unknown): v is AuthorizedBrowserIdentity {
  const i = row(v);
  return (
    !!i &&
    [i.worldId, i.countryId, i.officeId, i.scopeKey].every(canonicalId) &&
    READ_OFFICES.includes(i.officeId as (typeof READ_OFFICES)[number]) &&
    uuid(i.authSubjectId) &&
    [i.authorizationRevision, i.modelVersion, i.projectionVersion].every(
      text,
    ) &&
    ['COUNTRY', 'OFFICE_PRIVATE'].includes(String(i.classification))
  );
}
export function validWorldPins(v: unknown): v is AdmittedWorldPins {
  const w = row(v);
  return (
    !!w &&
    [w.worldId, w.seedRef, w.admissionRef].every(canonicalId) &&
    hash(w.contentHash) &&
    version(w.minimumWorldVersion)
  );
}
export function validEndpoints(v: unknown): v is ApprovedReadEndpoints {
  const p = row(v);
  if (!p || !text(p.origin) || !canonicalId(p.deploymentRef)) return false;
  try {
    const u = new URL(p.origin);
    const path = (v: unknown) =>
      typeof v === 'string' &&
      /^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/u.test(v) &&
      v.length <= 256 &&
      !v.startsWith('/local/');
    return (
      u.protocol === 'https:' &&
      u.origin === p.origin &&
      !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) &&
      !u.username &&
      !u.password &&
      !u.search &&
      !u.hash &&
      u.pathname === '/' &&
      path(p.projectionPath) &&
      path(p.finalLookupPath) &&
      p.projectionPath !== p.finalLookupPath
    );
  } catch {
    return false;
  }
}
export function validConfig(
  c: ProductionReadConfig | null | undefined,
): c is ProductionReadConfig {
  try {
    return (
      !!c &&
      validEndpoints(c.endpoints) &&
      validWorldPins(c.world) &&
      validReadIdentity(c.identity) &&
      c.identity.worldId === c.world.worldId &&
      canonicalId(c.seatRef) &&
      text(c.session.sessionRef) &&
      typeof c.currentIdentity === 'function' &&
      typeof c.getAccessToken === 'function' &&
      typeof c.session.isCurrent === 'function' &&
      typeof c.session.onInvalidate === 'function'
    );
  } catch {
    return false;
  }
}
export function parseAuthority(
  value: unknown,
  c: ProductionReadConfig,
): ServerReadAuthority | null {
  const a = row(value),
    s = row(a?.seed),
    b = row(a?.readback);
  if (
    !a ||
    !s ||
    !b ||
    a.source !== 'SERVER_VERIFIED_READ_BINDING' ||
    a.capability !== READ_ONLY_CAPABILITY ||
    !validReadIdentity(a.identity) ||
    a.seatState !== 'ACTIVE' ||
    a.seatRef !== c.seatRef
  )
    return null;
  for (const key of Object.keys(
    c.identity,
  ) as (keyof AuthorizedBrowserIdentity)[]) {
    if (a.identity[key] !== c.identity[key]) return null;
  }
  for (const key of [
    'worldId',
    'seedRef',
    'contentHash',
    'admissionRef',
  ] as const) {
    if (s[key] !== c.world[key] || b[key] !== c.world[key]) return null;
  }
  if (
    !version(b.worldVersion) ||
    !version(b.eventSequence) ||
    !canonicalId(b.readbackRef) ||
    BigInt(b.worldVersion) < BigInt(c.world.minimumWorldVersion)
  )
    return null;
  return JSON.parse(JSON.stringify(a)) as ServerReadAuthority;
}
