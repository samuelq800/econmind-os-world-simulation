/** Exact DATA packet builder and separately authorized publication call.
 * No capital default, issuer signature, approval, role or source registration
 * is created by this module. A default-empty release registry is mandatory. */
import { createHash } from 'node:crypto';
import {
  canonicalSerialize,
  validatePoliticalCapitalSnapshot,
} from '@econmind/core';
import type {
  CaptainOperatingOriginal,
  CaptainOperatingGenesisV1,
  CaptainOperatingReasonV1,
} from './captain-operating-source-custody.js';
import type { SqlExecutor } from './sql-database.js';
export const CAPTAIN_SOURCE_PUBLICATION_SCHEMA =
  'postwar-captain-source-publication-v1' as const;
export interface CaptainSourcePublicationAdoption {
  readonly adoptionRef: string;
  readonly worldId: string;
  readonly countryId: string;
  readonly seedId: string;
  readonly seedFingerprint: string;
  readonly worldAdmissionRef: string;
  readonly issuerRef: string;
  readonly custodianRef: string;
  readonly admissionRef: string;
  readonly admissionRevision: string;
  readonly originalAdmissionEvidenceSha256: string;
}
export interface CaptainSourcePublicationPacket {
  readonly schemaVersion: typeof CAPTAIN_SOURCE_PUBLICATION_SCHEMA;
  readonly adoption: CaptainSourcePublicationAdoption;
  readonly genesis: CaptainOperatingOriginal;
  readonly reasons: readonly CaptainOperatingOriginal[];
  readonly originalTexts: Readonly<Record<string, string>>;
}
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function invalid(s: string): never {
  throw Error('CAPTAIN_SOURCE_PUBLICATION:' + s);
}
function keys(
  v: unknown,
  k: readonly string[],
): asserts v is Record<string, unknown> {
  if (
    !v ||
    typeof v !== 'object' ||
    Array.isArray(v) ||
    Object.keys(v).sort().join('|') !== [...k].sort().join('|')
  )
    invalid('EXACT_FIELDS_REQUIRED');
}
function freeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
function original(
  v: CaptainOperatingOriginal,
  a: CaptainSourcePublicationAdoption,
) {
  keys(v, [
    'recordId',
    'revision',
    'factRef',
    'sourceRef',
    'predecessorFactRefs',
    'issuerRef',
    'custodianRef',
    'admissionRef',
    'admissionRevision',
    'sourceClass',
    'effectiveFromSimTime',
    'effectiveUntilSimTime',
    'revokedByRevision',
    'canonicalPayload',
    'payloadSHA256',
  ]);
  for (const f of [
    'recordId',
    'revision',
    'factRef',
    'sourceRef',
    'issuerRef',
    'custodianRef',
    'admissionRef',
    'admissionRevision',
  ] as const)
    if (
      typeof v[f] !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(v[f])
    )
      invalid('ORIGINAL_REFERENCES_REQUIRED');
  if (
    v.issuerRef !== a.issuerRef ||
    v.custodianRef !== a.custodianRef ||
    v.admissionRef !== a.admissionRef ||
    v.admissionRevision !== a.admissionRevision ||
    v.revokedByRevision !== null ||
    !['ADMITTED_ORIGINAL', 'TEST_ONLY'].includes(v.sourceClass)
  )
    invalid('EXACT_ADOPTED_ORIGINAL_REQUIRED');
  if (
    !Array.isArray(v.predecessorFactRefs) ||
    !v.predecessorFactRefs.length ||
    v.predecessorFactRefs.some(
      (x) =>
        typeof x !== 'string' ||
        !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(x),
    )
  )
    invalid('RETAINED_PREDECESSORS_REQUIRED');
  if (
    !/^(?:0|[1-9]\d{0,18})$/u.test(v.effectiveFromSimTime) ||
    (v.effectiveUntilSimTime !== null &&
      (!/^(?:0|[1-9]\d{0,18})$/u.test(v.effectiveUntilSimTime) ||
        BigInt(v.effectiveUntilSimTime) <= BigInt(v.effectiveFromSimTime)))
  )
    invalid('CANONICAL_EFFECTIVE_WINDOW_REQUIRED');
  if (
    typeof v.canonicalPayload !== 'string' ||
    sha(v.canonicalPayload) !== v.payloadSHA256
  )
    invalid('ORIGINAL_HASH_REQUIRED');
  const body = JSON.parse(v.canonicalPayload) as Record<string, unknown>;
  if (
    canonicalSerialize(body) !== v.canonicalPayload ||
    body.worldId !== a.worldId ||
    body.countryId !== a.countryId
  )
    invalid('EXACT_CANONICAL_COUNTRY_ORIGINAL_REQUIRED');
  return body;
}
export function validateCaptainSourcePublicationPacket(
  raw: unknown,
): Readonly<CaptainSourcePublicationPacket> {
  const bytes = canonicalSerialize(raw);
  if (Buffer.byteLength(bytes) > 65536) invalid('BOUNDED_PACKET_REQUIRED');
  const p = JSON.parse(bytes) as CaptainSourcePublicationPacket;
  keys(p, ['schemaVersion', 'adoption', 'genesis', 'reasons', 'originalTexts']);
  if (p.schemaVersion !== CAPTAIN_SOURCE_PUBLICATION_SCHEMA)
    invalid('VERSION_REQUIRED');
  const a = p.adoption;
  keys(a, [
    'adoptionRef',
    'worldId',
    'countryId',
    'seedId',
    'seedFingerprint',
    'worldAdmissionRef',
    'issuerRef',
    'custodianRef',
    'admissionRef',
    'admissionRevision',
    'originalAdmissionEvidenceSha256',
  ]);
  for (const f of [
    'adoptionRef',
    'worldId',
    'countryId',
    'seedId',
    'worldAdmissionRef',
    'issuerRef',
    'custodianRef',
    'admissionRef',
    'admissionRevision',
  ] as const)
    if (
      typeof a[f] !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(a[f])
    )
      invalid('ADOPTION_REFERENCES_REQUIRED');
  if (
    !/^COUNTRY_(?:0[1-9]|[1-6][0-9]|70)$/u.test(a.countryId) ||
    !/^sha256:[a-f0-9]{64}$/u.test(a.seedFingerprint) ||
    !/^[a-f0-9]{64}$/u.test(a.originalAdmissionEvidenceSha256)
  )
    invalid('EXACT_SEED_AND_ADOPTION_EVIDENCE_REQUIRED');
  const g = original(p.genesis, a);
  keys(g, [
    'schemaVersion',
    'worldId',
    'countryId',
    'seedId',
    'seedFingerprint',
    'semanticRevision',
    'capital',
  ]);
  if (
    g.schemaVersion !== 'captain-operating-genesis-v1' ||
    g.seedId !== a.seedId ||
    g.seedFingerprint !== a.seedFingerprint ||
    typeof g.semanticRevision !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(g.semanticRevision)
  )
    invalid('EXACT_GENESIS_REQUIRED');
  const capital = validatePoliticalCapitalSnapshot(
    (g as unknown as CaptainOperatingGenesisV1).capital,
  );
  if (capital.countryRef !== a.countryId) invalid('CAPITAL_COUNTRY_REQUIRED');
  if (
    !Array.isArray(p.reasons) ||
    p.reasons.length < 1 ||
    p.reasons.length > 64
  )
    invalid('BOUNDED_EXPLICIT_REASON_RECORDS_REQUIRED');
  const refs = new Set([p.genesis.factRef]);
  for (const reason of p.reasons) {
    const b = original(reason, a);
    keys(b, ['schemaVersion', 'worldId', 'countryId', 'reason']);
    const v = (b as unknown as CaptainOperatingReasonV1).reason;
    keys(v, ['countryRef', 'recordRef', 'reason']);
    if (
      b.schemaVersion !== 'captain-operating-reason-v1' ||
      v.countryRef !== a.countryId ||
      typeof v.recordRef !== 'string' ||
      !v.recordRef.trim() ||
      typeof v.reason !== 'string' ||
      !v.reason.trim() ||
      refs.has(reason.factRef) ||
      reason.sourceClass !== p.genesis.sourceClass
    )
      invalid('UNIQUE_SCOPED_REASON_REQUIRED');
    refs.add(reason.factRef);
  }
  keys(p.originalTexts, [
    p.genesis.factRef,
    ...p.reasons.map((r) => r.factRef),
  ]);
  for (const record of [p.genesis, ...p.reasons])
    if (p.originalTexts[record.factRef] !== canonicalSerialize(record))
      invalid('EXACT_WRAPPER_BYTES_REQUIRED');
  return freeze(p);
}
/** Build a DATA packet from supplied retained originals, never default capital. */
export function createCaptainSourcePublicationPacket(
  input: Omit<
    CaptainSourcePublicationPacket,
    'schemaVersion' | 'originalTexts'
  >,
): Readonly<CaptainSourcePublicationPacket> {
  return validateCaptainSourcePublicationPacket({
    ...input,
    schemaVersion: CAPTAIN_SOURCE_PUBLICATION_SCHEMA,
    originalTexts: Object.fromEntries(
      [input.genesis, ...input.reasons].map((o) => [
        o.factRef,
        canonicalSerialize(o),
      ]),
    ),
  });
}
/** Publication does not register/approve this packet. SQL consumes only a
 * separately release-registered exact SHA and rechecks actual admission. */
export async function publishCaptainOperatingSourceFrom(
  tx: SqlExecutor,
  raw: unknown,
): Promise<Readonly<{ adoptionRef: string; packetSha256: string }>> {
  const p = validateCaptainSourcePublicationPacket(raw),
    bytes = canonicalSerialize(p),
    hash = sha(bytes);
  const r = await tx.query<Record<string, unknown>>(
    'select * from world_v2.publish_captain_operating_source($1,$2)',
    [bytes, hash],
  );
  if (
    r.rows.length !== 1 ||
    r.rows[0]?.adoption_ref !== p.adoption.adoptionRef ||
    r.rows[0]?.packet_sha256 !== hash
  )
    invalid('EXACT_PUBLICATION_READBACK_REQUIRED');
  return Object.freeze({
    adoptionRef: p.adoption.adoptionRef,
    packetSha256: hash,
  });
}
