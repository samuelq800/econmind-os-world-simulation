/** Social source DATA only. Parsing, hashes and lineage correspondence never admit a source. */
import { createHash } from 'node:crypto';
import {
  DOMAIN_ERROR_CODES,
  DomainError,
  SimTime,
  canonicalHashInput,
  canonicalSerialize,
  canonicalSha256,
  commandId,
  countryId,
  openingSeedId,
  openingSourceId,
  parseSocialEmploymentServiceCommand,
  validateCanonicalCommand,
  worldId,
  type CanonicalCommand,
  type CanonicalSha256,
  type ReplayVersionBinding,
  type SocialEmploymentReadFacts,
  type SocialEmploymentServiceState,
} from '@econmind/core';
import {
  readValidatedCanonicalLineageFrom,
  type ValidatedCanonicalLineageData,
  type ValidatedCanonicalLineageView,
} from './validated-canonical-lineage.js';
import type { SqlExecutor } from './sql-database.js';
import type { SocialPhysicalAttemptEnvelope } from './social-physical-attempt-envelope.js';

type Json =
  null | boolean | string | readonly Json[] | { readonly [key: string]: Json };
type Row = Record<string, unknown>;
const digest = (value: string) =>
  createHash('sha256').update(value, 'utf8').digest('hex');
const objectHash = (value: unknown) =>
  canonicalSha256(canonicalHashInput(value), digest);
const MAX_BYTES = 8_388_608;
const MAX_VERSION = 9_223_372_036_854_775_807n;
const parsedInputs = new WeakMap<object, SocialEmploymentSourceGraph>();

export const SOCIAL_SOURCE_MATERIAL_PATHS = Object.freeze([
  '/admittedGenesis/semanticRevision',
  '/admittedGenesis/state',
  '/currentReadFacts/boundary',
  '/currentReadFacts/minimumWage',
  '/currentReadFacts/offer',
  '/currentReadFacts/populationAvailability',
  '/physicalAttemptEnvelope',
] as const);
export const SOCIAL_SOURCE_ROLES = Object.freeze([
  'GENESIS_HISTORICAL',
  'CURRENT_EFFECTIVE',
  'PHYSICAL_ORIGINAL_BODY',
  'CURRENT_ELIGIBILITY',
] as const);
export type SocialSourceRole = (typeof SOCIAL_SOURCE_ROLES)[number];

export interface SocialSourceWitness {
  readonly fieldPath: string;
  readonly sourceId: string;
  readonly sourceRevision: string;
  readonly locator: string;
  readonly payloadHash: CanonicalSha256;
  readonly pointer: string;
  readonly effectiveBindingRef: string;
  readonly adoptionOrCommitBindingRef: string;
  readonly role: SocialSourceRole;
  readonly effectiveFromSimTime: string;
  readonly effectiveUntilSimTime: string | null;
  readonly predecessorRevision: string | null;
  readonly supersededByRevision: string | null;
  readonly revokedByRevision: string | null;
}

export interface SocialEmploymentSourceGraph {
  readonly schemaVersion: 'SOCIAL_RESOLVED_SOURCE_INPUT_V3';
  readonly scope: Readonly<{
    worldId: string;
    countryId: string;
    commandId: string;
    commandFingerprint: CanonicalSha256;
    headWorldVersion: string;
    headEventSequence: string;
    simTime: string;
  }>;
  readonly admittedGenesis: Readonly<{
    openingSeedId: string;
    openingSeedFingerprint: CanonicalSha256;
    modelVersion: string;
    replayBinding: ReplayVersionBinding;
    socialSourceId: string;
    socialSourcePayloadHash: CanonicalSha256;
    semanticRevision: string;
    adoptionBindingRef: string;
    state: SocialEmploymentServiceState;
  }>;
  readonly currentReadFacts: SocialEmploymentReadFacts;
  readonly historyCoverage: Readonly<{
    openingVersion: '0';
    heldHead: Readonly<{ worldVersion: string; eventSequence: string }>;
    taxonomyRevision: string;
    completePrefixBinding: CanonicalSha256;
    /** Data only; exact C/current-manifest validation follows original-record capture. */
    sourceRevisionSet: readonly Json[];
  }>;
  readonly sourceWitnesses: readonly SocialSourceWitness[];
  readonly physicalAttemptEnvelope: SocialPhysicalAttemptEnvelope;
}
export interface ParsedSocialEmploymentSourceInput {
  readonly classification: 'PARSED_UNTRUSTED_SOCIAL_SOURCE_DATA';
  readonly canonicalBytes: string;
  readonly payloadHash: CanonicalSha256;
  readonly data: SocialEmploymentSourceGraph;
}
export interface BoundSocialSourceData {
  readonly classification: 'DATA_BINDING_MATCH_NOT_AUTHENTICATED';
  readonly command: CanonicalCommand;
  readonly data: SocialEmploymentSourceGraph;
  readonly lineage: Readonly<ValidatedCanonicalLineageData>;
}
export interface SocialOperatingSnapshotRequest {
  readonly publicationHead: Readonly<{
    worldId: string;
    worldVersion: string;
    eventSequence: string;
  }>;
  readonly worldBinding: Readonly<{
    seedId: string;
    seedFingerprint: string;
    modelVersion: string;
    replayBindingFingerprint: string;
  }>;
  readonly purpose: 'SOCIAL_EMPLOYMENT_SERVICE_PLAN_SOURCE_EVALUATION_V1';
  readonly commandBinding: Readonly<{
    commandId: string;
    commandFingerprint: string;
    countryId: string;
    locationId: string;
    skill: string;
    positionId: string;
    servicePoolId: string;
    dueDayIndex: string;
    simTime: string;
  }>;
  readonly requiredMaterialPaths: readonly string[];
}
/** Actual independent custody is a mandatory private server trust boundary.
 * An implementation requires separate original-issuer/current-admission and
 * cooperating-lock evidence. A callback or matching snapshot is NOT that evidence.
 * No default implementation, HTTP provider, source issuer or registry lives here. */
export interface SocialOperatingCustodyPort {
  withSnapshotFrom<Result>(
    executor: SqlExecutor,
    request: Readonly<SocialOperatingSnapshotRequest>,
    consume: (snapshot: unknown) => Promise<Result>,
  ): Promise<Result>;
}

function invalid(reason: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    `Social source input: ${reason}`,
  );
}
function record(value: unknown, expected: readonly string[]): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    invalid('record required');
  const r = value as Row;
  if (Object.keys(r).sort().join('|') !== [...expected].sort().join('|'))
    invalid('missing/unknown fields');
  return r;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.length || value.length > 2048)
    invalid('explicit bounded text required');
  return value;
}
function reference(value: unknown): string {
  const v = text(value);
  if (!/^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u.test(v))
    invalid('canonical reference required');
  return v;
}
function version(value: unknown, positive = false): string {
  const v = text(value);
  if (
    !(positive ? /^[1-9]\d{0,18}$/u : /^(?:0|[1-9]\d{0,18})$/u).test(v) ||
    BigInt(v) > MAX_VERSION
  )
    invalid('canonical bounded version required');
  return v;
}
function fingerprint(value: unknown): CanonicalSha256 {
  const v = text(value);
  if (!/^sha256:[0-9a-f]{64}$/u.test(v))
    invalid('canonical fingerprint required');
  return v as CanonicalSha256;
}
function ticks(value: unknown): string {
  const v = text(value);
  if (v.length > 120 || SimTime.fromTicks(v).toCanonicalValue() !== v)
    invalid('canonical SimTime required');
  return v;
}
function nullableVersion(value: unknown): string | null {
  return value === null ? null : version(value, true);
}
function pointer(value: unknown): string {
  const v = text(value);
  if (
    Buffer.byteLength(v, 'utf8') > 512 ||
    !v.startsWith('/') ||
    /~(?![01])/u.test(v)
  )
    invalid('canonical JSON pointer required');
  return v;
}
function dense(value: unknown, min: number, max: number): readonly unknown[] {
  if (
    !Array.isArray(value) ||
    value.length < min ||
    value.length > max ||
    Array.from({ length: value.length }, (_, i) => i).some(
      (i) => !Object.hasOwn(value, i),
    )
  )
    invalid('bounded dense array required');
  return value;
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Exact shape/identity only. Core validates state/facts semantics after replay. */
export function parseSocialEmploymentSourceInput(
  canonicalBytes: string,
  expectedPayloadHash: CanonicalSha256,
): Readonly<ParsedSocialEmploymentSourceInput> {
  if (
    typeof canonicalBytes !== 'string' ||
    Buffer.byteLength(canonicalBytes, 'utf8') > MAX_BYTES ||
    Buffer.from(canonicalBytes, 'utf8').toString('utf8') !== canonicalBytes
  )
    invalid('source bytes invalid');
  let decoded: unknown;
  try {
    decoded = JSON.parse(canonicalBytes) as unknown;
  } catch {
    invalid('invalid JSON');
  }
  if (
    canonicalSerialize(decoded) !== canonicalBytes ||
    objectHash(decoded) !== fingerprint(expectedPayloadHash)
  )
    invalid('canonical source bytes/hash mismatch');
  const r = record(decoded, [
    'schemaVersion',
    'scope',
    'admittedGenesis',
    'currentReadFacts',
    'historyCoverage',
    'sourceWitnesses',
    'physicalAttemptEnvelope',
  ]);
  if (r.schemaVersion !== 'SOCIAL_RESOLVED_SOURCE_INPUT_V3')
    invalid('unsupported source schema');
  const s = record(r.scope, [
    'worldId',
    'countryId',
    'commandId',
    'commandFingerprint',
    'headWorldVersion',
    'headEventSequence',
    'simTime',
  ]);
  worldId(text(s.worldId));
  countryId(text(s.countryId));
  commandId(text(s.commandId));
  fingerprint(s.commandFingerprint);
  version(s.headWorldVersion);
  version(s.headEventSequence);
  ticks(s.simTime);
  const g = record(r.admittedGenesis, [
    'openingSeedId',
    'openingSeedFingerprint',
    'modelVersion',
    'replayBinding',
    'socialSourceId',
    'socialSourcePayloadHash',
    'semanticRevision',
    'adoptionBindingRef',
    'state',
  ]);
  openingSeedId(text(g.openingSeedId));
  openingSourceId(text(g.socialSourceId));
  fingerprint(g.openingSeedFingerprint);
  fingerprint(g.socialSourcePayloadHash);
  reference(g.modelVersion);
  reference(g.semanticRevision);
  reference(g.adoptionBindingRef);
  record(g.replayBinding, [
    'replaySchemaVersion',
    'eventSchemaVersion',
    'reducerRegistryVersion',
    'engineVersion',
    'modelVersion',
    'domainRegistryVersion',
    'worldSchemaVersion',
    'numericPolicyVersion',
  ]);
  const state = record(g.state, [
    'schemaVersion',
    'worldId',
    'labour',
    'servicePools',
    'plans',
    'appliedOperations',
  ]);
  if (state.schemaVersion !== 'social-employment-service-state-v1')
    invalid('wrong genesis state schema');
  const f = record(r.currentReadFacts, [
    'boundary',
    'simTime',
    'populationAvailability',
    'offer',
    'minimumWage',
  ]);
  ticks(f.simTime);
  const b = record(f.boundary, ['kind', 'dayIndex']);
  if (b.kind !== 'E01_DAILY_BOUNDARY') invalid('actual E01 boundary required');
  version(b.dayIndex);
  const h = record(r.historyCoverage, [
    'openingVersion',
    'heldHead',
    'taxonomyRevision',
    'completePrefixBinding',
    'sourceRevisionSet',
  ]);
  if (h.openingVersion !== '0') invalid('actual opening version required');
  const hh = record(h.heldHead, ['worldVersion', 'eventSequence']);
  version(hh.worldVersion);
  version(hh.eventSequence);
  reference(h.taxonomyRevision);
  fingerprint(h.completePrefixBinding);
  dense(h.sourceRevisionSet, 1, 10000);
  const targets = new Set<string>();
  for (const value of dense(r.sourceWitnesses, 7, 10000)) {
    const witness = record(value, [
      'fieldPath',
      'sourceId',
      'sourceRevision',
      'locator',
      'payloadHash',
      'pointer',
      'effectiveBindingRef',
      'adoptionOrCommitBindingRef',
      'role',
      'effectiveFromSimTime',
      'effectiveUntilSimTime',
      'predecessorRevision',
      'supersededByRevision',
      'revokedByRevision',
    ]);
    const field = pointer(witness.fieldPath);
    if (!(SOCIAL_SOURCE_MATERIAL_PATHS as readonly string[]).includes(field))
      invalid('unsupported material path');
    if (targets.has(field))
      invalid('one unambiguous selected witness per material path required');
    targets.add(field);
    reference(witness.sourceId);
    // A source's stable revision label is distinct from ordinal record revisions.
    // Preserve either canonical positive version text or its exact stable ref.
    if (/^[0-9]/u.test(text(witness.sourceRevision)))
      version(witness.sourceRevision, true);
    else reference(witness.sourceRevision);
    text(witness.locator);
    fingerprint(witness.payloadHash);
    pointer(witness.pointer);
    reference(witness.effectiveBindingRef);
    reference(witness.adoptionOrCommitBindingRef);
    if (!(SOCIAL_SOURCE_ROLES as readonly unknown[]).includes(witness.role))
      invalid('unsupported original role');
    const from = ticks(witness.effectiveFromSimTime);
    if (
      witness.effectiveUntilSimTime !== null &&
      BigInt(ticks(witness.effectiveUntilSimTime)) <= BigInt(from)
    )
      invalid('empty effective interval');
    nullableVersion(witness.predecessorRevision);
    nullableVersion(witness.supersededByRevision);
    nullableVersion(witness.revokedByRevision);
    const expectedRole =
      field === '/physicalAttemptEnvelope'
        ? 'PHYSICAL_ORIGINAL_BODY'
        : field === '/admittedGenesis/state' ||
            field === '/admittedGenesis/semanticRevision'
          ? 'GENESIS_HISTORICAL'
          : 'CURRENT_EFFECTIVE';
    if (witness.role !== expectedRole)
      invalid('exact material role/path pairing required');
  }
  if (targets.size !== SOCIAL_SOURCE_MATERIAL_PATHS.length)
    invalid('complete material selection required');
  // The D-owned assertion validates its exact closed envelope later, on replayed Core state.
  if (
    !r.physicalAttemptEnvelope ||
    typeof r.physicalAttemptEnvelope !== 'object' ||
    Array.isArray(r.physicalAttemptEnvelope)
  )
    invalid('explicit physical source envelope required');
  const data = freeze(r as unknown as SocialEmploymentSourceGraph);
  const result = freeze({
    classification: 'PARSED_UNTRUSTED_SOCIAL_SOURCE_DATA' as const,
    canonicalBytes,
    payloadHash: fingerprint(expectedPayloadHash),
    data,
  });
  parsedInputs.set(result, data);
  return result;
}

/** Synchronous DATA/view correspondence only. Original-record checks need the
 * reader-private captured custody snapshot and are intentionally not claimed here. */
export function bindSocialEmploymentSourceInputFrom(
  executor: SqlExecutor,
  view: ValidatedCanonicalLineageView,
  commandInput: CanonicalCommand,
  parsed: ParsedSocialEmploymentSourceInput,
): Readonly<BoundSocialSourceData> {
  const data = parsedInputs.get(parsed);
  if (!data) invalid('actual parsed data required');
  const command = validateCanonicalCommand(commandInput, digest);
  if (
    parseSocialEmploymentServiceCommand(command, digest).kind !== 'PLAN' ||
    command.expectedWorldVersion === null
  )
    invalid('manual PLAN only');
  const lineage = readValidatedCanonicalLineageFrom(executor, view);
  const s = data.scope,
    g = data.admittedGenesis,
    h = data.historyCoverage;
  if (
    s.worldId !== command.worldId ||
    s.countryId !== command.countryId ||
    s.commandId !== command.commandId ||
    s.commandFingerprint !== command.fingerprint ||
    s.simTime !== command.simTime.toCanonicalValue() ||
    s.worldId !== lineage.worldId ||
    s.headWorldVersion !== lineage.headWorldVersion ||
    s.headEventSequence !== lineage.headEventSequence ||
    s.headWorldVersion !== command.expectedWorldVersion ||
    h.heldHead.worldVersion !== lineage.headWorldVersion ||
    h.heldHead.eventSequence !== lineage.headEventSequence ||
    g.openingSeedId !== lineage.seed.seedId ||
    g.openingSeedFingerprint !== lineage.seed.fingerprint ||
    g.modelVersion !== lineage.seed.replayBinding.modelVersion ||
    canonicalSerialize(g.replayBinding) !==
      canonicalSerialize(lineage.seed.replayBinding) ||
    g.state.worldId !== lineage.worldId ||
    data.currentReadFacts.simTime !== s.simTime
  )
    invalid('mixed command/World/head/seed/replay binding');
  const original = lineage.seed.sources.filter(
    (source) => source.sourceId === g.socialSourceId,
  );
  if (
    original.length !== 1 ||
    original[0]!.payloadHash !== g.socialSourcePayloadHash
  )
    invalid('original opening source identity required');
  const prefix = objectHash({
    worldId: lineage.worldId,
    seedFingerprint: lineage.seed.fingerprint,
    transitions: lineage.transitions,
  });
  if (h.completePrefixBinding !== prefix)
    invalid('complete actual prefix fingerprint mismatch');
  if (
    data.physicalAttemptEnvelope.headWorldVersion !==
      lineage.headWorldVersion ||
    data.physicalAttemptEnvelope.headEventSequence !== lineage.headEventSequence
  )
    invalid('physical current audit head mismatch');
  readValidatedCanonicalLineageFrom(executor, view);
  return Object.freeze({
    classification: 'DATA_BINDING_MATCH_NOT_AUTHENTICATED' as const,
    command,
    data,
    lineage,
  });
}
