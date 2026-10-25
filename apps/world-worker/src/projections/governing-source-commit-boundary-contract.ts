/** Owned data contracts only. No source issuer, native guard or commit authority. */
import { createHash } from 'node:crypto';
import { types as nodeTypes } from 'node:util';
import {
  DOMAIN_ERROR_CODES,
  DomainError,
  SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
  SOCIAL_SERVICE_PLAN_EVENT,
  SimTime,
  bindAuthoritativeTransition,
  canonicalHashInput,
  canonicalSerialize,
  canonicalSha256,
  commandId,
  countryId,
  createAuthoritativeTransition,
  openingSeedId,
  parseSocialEmploymentServiceCommand,
  validateAuthoritativeEvent,
  validateCanonicalCommand,
  worldId,
  type AuthoritativeTransition,
  type CanonicalCommand,
  type CanonicalSha256,
  type DecisionResultHead,
} from '@econmind/core';
import type { SqlExecutor } from '../persistence/sql-database.js';

export const SOCIAL_PLAN_SOURCE_EVALUATION_PURPOSE =
  'SOCIAL_EMPLOYMENT_SERVICE_PLAN_SOURCE_EVALUATION_V1' as const;
export const GOVERNING_SOURCE_READ_BINDING_SCHEMA =
  'social-plan-governing-source-read-binding-v1' as const;
const ROLES = [
  'GENESIS_HISTORICAL',
  'CURRENT_EFFECTIVE',
  'PHYSICAL_ORIGINAL_BODY',
  'CURRENT_ELIGIBILITY',
] as const;
type Role = (typeof ROLES)[number];
const MATERIAL_PATHS = Object.freeze([
  '/admittedGenesis/semanticRevision',
  '/admittedGenesis/state',
  '/currentReadFacts/boundary',
  '/currentReadFacts/minimumWage',
  '/currentReadFacts/offer',
  '/currentReadFacts/populationAvailability',
  '/physicalAttemptEnvelope',
]);
type Data = Record<string, unknown>;
type Head = Readonly<{ worldVersion: string; eventSequence: string }>;
type SourceRevision = Readonly<{
  recordId: string;
  revision: string;
  payloadHash: CanonicalSha256;
  role: Role;
  fieldPaths: readonly string[];
  revocationRevision: string | null;
}>;
export interface GoverningSourceReadBindingV1 {
  readonly schemaVersion: typeof GOVERNING_SOURCE_READ_BINDING_SCHEMA;
  readonly purpose: typeof SOCIAL_PLAN_SOURCE_EVALUATION_PURPOSE;
  readonly scope: Readonly<{
    worldId: string;
    countryId: string;
    officeId: 'SOCIAL';
  }>;
  readonly commandBinding: Readonly<{
    commandId: string;
    commandFingerprint: CanonicalSha256;
    commandType: typeof SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND;
    payloadHash: CanonicalSha256;
    simTime: string;
  }>;
  readonly readHead: Head;
  readonly worldBinding: Readonly<{
    seedId: string;
    seedFingerprint: CanonicalSha256;
    modelVersion: string;
    replayBindingFingerprint: CanonicalSha256;
  }>;
  readonly historyBinding: Readonly<{
    openingVersion: string;
    completePrefixFingerprint: CanonicalSha256;
    receiptSetFingerprint: CanonicalSha256;
    taxonomyRevision: string;
  }>;
  readonly sourceAuthorityBinding: Readonly<{
    issuerId: string;
    custodianId: string;
    ownerAdoptionRef: string;
    ownerAdoptionFingerprint: CanonicalSha256;
    admissionRef: string;
    admissionRevision: string;
  }>;
  readonly sourceManifest: Readonly<{
    manifestId: string;
    revision: string;
    contentFingerprint: CanonicalSha256;
    entrySetFingerprint: CanonicalSha256;
  }>;
  readonly sourceRevisions: readonly SourceRevision[];
  readonly materialBindings: readonly Readonly<{
    fieldPath: string;
    valueHash: CanonicalSha256;
    recordId: string;
    recordRevision: string;
    pointer: string;
  }>[];
  readonly originalPhysicalBodyBindings: readonly Readonly<{
    groupRef: string;
    bodyHash: CanonicalSha256;
    originRecordId: string;
    originRevision: string;
  }>[];
  readonly stateHash: CanonicalSha256;
  readonly readFactsHash: CanonicalSha256;
}
export interface GoverningSourceCommitRequestV1 {
  readonly phase: 'BEFORE_EVENTS';
  readonly purpose: typeof SOCIAL_PLAN_SOURCE_EVALUATION_PURPOSE;
  readonly command: CanonicalCommand;
  readonly transition: AuthoritativeTransition;
  /** D supplies its actual guarded DB head, not prepared input or a token. */
  readonly currentHead: DecisionResultHead;
  readonly readBinding: unknown;
  readonly observedAtReal: string;
}
export interface GoverningSourceCommitBindingFingerprints {
  readonly readBindingFingerprint: CanonicalSha256;
  readonly sourceManifestFingerprint: CanonicalSha256;
  readonly sourceRevisionSetFingerprint: CanonicalSha256;
}
/** Inert audit only; matching it is NOT proof of source/locks or World CAS. */
export interface SourceCommitCurrentnessAuditV1 extends GoverningSourceCommitBindingFingerprints {
  readonly status: 'CURRENT_SOURCE_RECHECKED_NOT_AUTHORITY';
  readonly purpose: typeof SOCIAL_PLAN_SOURCE_EVALUATION_PURPOSE;
  readonly commandFingerprint: CanonicalSha256;
  readonly currentHead: DecisionResultHead;
  readonly protectionMode: 'HELD_SOURCE_GUARDS';
}
/**
 * Mandatory NEW PLAN server boundary. No default/boolean/void verifier.
 * G re-resolves actual originals/replay; D holds real cooperating guards until
 * COMMIT. Neither this type, parsed binding nor an active view proves that work.
 */
export interface SourceCommitProtectionPort {
  assertCurrentFrom(
    executor: SqlExecutor,
    request: Readonly<GoverningSourceCommitRequestV1>,
  ): Promise<Readonly<SourceCommitCurrentnessAuditV1>>;
}

function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    `Social source commit contract: ${message}`,
  );
}
function closed(value: unknown, keys: readonly string[]): Data {
  if (
    nodeTypes.isProxy(value) ||
    value === null ||
    typeof value !== 'object' ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    invalid('Plain own data required');
  const ds = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(ds);
  if (
    actual.length !== keys.length ||
    actual.some((k) => typeof k !== 'string' || !keys.includes(k))
  )
    invalid('Missing or unknown field');
  const result: Data = {};
  for (const key of keys) {
    const d = ds[key];
    if (!d || !Object.hasOwn(d, 'value') || !d.enumerable)
      invalid('Accessor or non-data field');
    result[key] = d.value;
  }
  return result;
}
function freezeOwned(value: unknown): void {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeOwned(child);
    Object.freeze(value);
  }
}
/** Copies untrusted JSON data before validation; never executes caller hooks. */
function capture(
  value: unknown,
  budget: { bytes: number; nodes: number },
  depth = 0,
): unknown {
  if (nodeTypes.isProxy(value)) invalid('Proxy input is not owned data');
  if (++budget.nodes > 1_000_000 || depth > 16)
    invalid('Binding structural capacity exceeded');
  const add = (n: number) => {
    budget.bytes += n;
    if (budget.bytes > 4_194_304) invalid('Binding byte capacity exceeded');
  };
  if (value === null) {
    add(4);
    return null;
  }
  if (typeof value === 'string') {
    add(Buffer.byteLength(value, 'utf8') + 2);
    return value;
  }
  if (typeof value !== 'object')
    invalid('Only exact string/null data permitted');
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype)
      invalid('Foreign array prototype');
    const ds = Object.getOwnPropertyDescriptors(value);
    const length = Object.getOwnPropertyDescriptor(value, 'length')
      ?.value as unknown;
    if (
      typeof length !== 'number' ||
      !Number.isSafeInteger(length) ||
      length > 10000 ||
      length < 0 ||
      Reflect.ownKeys(ds).length !== length + 1
    )
      invalid('Dense bounded array required');
    const result: unknown[] = [];
    add(2 + length);
    for (let i = 0; i < length; i++) {
      const d = ds[String(i)];
      if (!d || !Object.hasOwn(d, 'value') || !d.enumerable)
        invalid('Array accessor/hole');
      result.push(capture(d.value, budget, depth + 1));
    }
    return result;
  }
  if (![Object.prototype, null].includes(Object.getPrototypeOf(value)))
    invalid('Foreign object prototype');
  const ds = Object.getOwnPropertyDescriptors(value),
    result: Data = {};
  for (const key of Reflect.ownKeys(ds)) {
    if (typeof key !== 'string' || Buffer.byteLength(key, 'utf8') > 512)
      invalid('Invalid object key');
    const d = ds[key];
    if (!d || !Object.hasOwn(d, 'value') || !d.enumerable)
      invalid('Object accessor');
    add(Buffer.byteLength(key, 'utf8') + 4);
    Object.defineProperty(result, key, {
      enumerable: true,
      configurable: true,
      writable: true,
      value: capture(d.value, budget, depth + 1),
    });
  }
  return result;
}
function ref(v: unknown): string {
  if (
    typeof v !== 'string' ||
    v.length > 128 ||
    !/^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u.test(v)
  )
    invalid('Canonical reference required');
  return v;
}
function uint(v: unknown, positive = false): string {
  if (
    typeof v !== 'string' ||
    v.length > 19 ||
    !(positive ? /^[1-9]\d*$/u : /^(?:0|[1-9]\d*)$/u).test(v) ||
    BigInt(v) > 9_223_372_036_854_775_807n
  )
    invalid('Canonical bounded integer required');
  return v;
}
function fp(v: unknown): CanonicalSha256 {
  if (typeof v !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(v))
    invalid('Canonical fingerprint required');
  return v as CanonicalSha256;
}
function lit<T extends string>(v: unknown, expected: T): T {
  if (v !== expected) invalid('Unsupported literal');
  return expected;
}
function array(v: unknown, min: number, max: number): unknown[] {
  if (!Array.isArray(v) || v.length < min || v.length > max)
    invalid('Array count outside supported bounds');
  return v;
}
function pointer(v: unknown, field = false): string {
  if (
    typeof v !== 'string' ||
    Buffer.byteLength(v, 'utf8') > 512 ||
    (v !== '' && !v.startsWith('/')) ||
    /~(?:[^01]|$)/u.test(v) ||
    /[^\u0020-\u007e]/u.test(v)
  )
    invalid('Canonical ASCII JSON pointer required');
  if (field && !MATERIAL_PATHS.some((p) => v === p || v.startsWith(p + '/')))
    invalid('Field outside finite source domain');
  return v;
}
function head(v: unknown): Head {
  const r = closed(v, ['worldVersion', 'eventSequence']);
  return {
    worldVersion: uint(r.worldVersion),
    eventSequence: uint(r.eventSequence),
  };
}
function ordered(strings: readonly string[]): void {
  for (let i = 1; i < strings.length; i++)
    if (strings[i - 1]! >= strings[i]!)
      invalid('Strict canonical order/unique members required');
}

/** Shape/relationship validation only; never authenticates original sources. */
export function parseGoverningSourceReadBinding(
  value: unknown,
): Readonly<GoverningSourceReadBindingV1> {
  const owned = capture(value, { bytes: 0, nodes: 0 });
  const r = closed(owned, [
    'schemaVersion',
    'purpose',
    'scope',
    'commandBinding',
    'readHead',
    'worldBinding',
    'historyBinding',
    'sourceAuthorityBinding',
    'sourceManifest',
    'sourceRevisions',
    'materialBindings',
    'originalPhysicalBodyBindings',
    'stateHash',
    'readFactsHash',
  ]);
  lit(r.schemaVersion, GOVERNING_SOURCE_READ_BINDING_SCHEMA);
  lit(r.purpose, SOCIAL_PLAN_SOURCE_EVALUATION_PURPOSE);
  const s = closed(r.scope, ['worldId', 'countryId', 'officeId']);
  worldId(ref(s.worldId));
  countryId(ref(s.countryId));
  lit(s.officeId, 'SOCIAL');
  const c = closed(r.commandBinding, [
    'commandId',
    'commandFingerprint',
    'commandType',
    'payloadHash',
    'simTime',
  ]);
  commandId(ref(c.commandId));
  fp(c.commandFingerprint);
  fp(c.payloadHash);
  lit(c.commandType, SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND);
  if (
    typeof c.simTime !== 'string' ||
    c.simTime.length > 128 ||
    SimTime.fromTicks(c.simTime).toCanonicalValue() !== c.simTime
  )
    invalid('Canonical SimTime required');
  const h = head(r.readHead);
  const w = closed(r.worldBinding, [
    'seedId',
    'seedFingerprint',
    'modelVersion',
    'replayBindingFingerprint',
  ]);
  openingSeedId(ref(w.seedId));
  fp(w.seedFingerprint);
  ref(w.modelVersion);
  fp(w.replayBindingFingerprint);
  const hist = closed(r.historyBinding, [
    'openingVersion',
    'completePrefixFingerprint',
    'receiptSetFingerprint',
    'taxonomyRevision',
  ]);
  if (BigInt(uint(hist.openingVersion)) > BigInt(h.worldVersion))
    invalid('Opening after declared read head');
  fp(hist.completePrefixFingerprint);
  fp(hist.receiptSetFingerprint);
  ref(hist.taxonomyRevision);
  const a = closed(r.sourceAuthorityBinding, [
    'issuerId',
    'custodianId',
    'ownerAdoptionRef',
    'ownerAdoptionFingerprint',
    'admissionRef',
    'admissionRevision',
  ]);
  ref(a.issuerId);
  ref(a.custodianId);
  ref(a.ownerAdoptionRef);
  fp(a.ownerAdoptionFingerprint);
  ref(a.admissionRef);
  uint(a.admissionRevision, true);
  const manifest = closed(r.sourceManifest, [
    'manifestId',
    'revision',
    'contentFingerprint',
    'entrySetFingerprint',
  ]);
  ref(manifest.manifestId);
  uint(manifest.revision, true);
  fp(manifest.contentFingerprint);
  fp(manifest.entrySetFingerprint);
  const revisions = array(r.sourceRevisions, 1, 10000),
    versions = new Map<string, Data>();
  let previous: { id: string; revision: bigint } | null = null;
  for (const value of revisions) {
    const row = closed(value, [
      'recordId',
      'revision',
      'payloadHash',
      'role',
      'fieldPaths',
      'revocationRevision',
    ]);
    const id = ref(row.recordId),
      revision = uint(row.revision, true);
    fp(row.payloadHash);
    if (!ROLES.some((role) => row.role === role))
      invalid('Unknown original source role');
    if (row.revocationRevision !== null) uint(row.revocationRevision, true);
    const fields = array(row.fieldPaths, 1, 64).map((v) => pointer(v, true));
    ordered(fields);
    if (
      previous &&
      (previous.id > id ||
        (previous.id === id && previous.revision >= BigInt(revision)))
    )
      invalid('Duplicate version or nonnumeric revision order');
    previous = { id, revision: BigInt(revision) };
    const key = id + '\0' + revision;
    if (versions.has(key)) invalid('Conflicting exact original version');
    versions.set(key, row);
  }
  const material = array(r.materialBindings, 7, 7),
    materialPaths: string[] = [];
  for (const value of material) {
    const row = closed(value, [
      'fieldPath',
      'valueHash',
      'recordId',
      'recordRevision',
      'pointer',
    ]);
    const path = pointer(row.fieldPath, true);
    materialPaths.push(path);
    fp(row.valueHash);
    pointer(row.pointer);
    const key = ref(row.recordId) + '\0' + uint(row.recordRevision, true),
      source = versions.get(key);
    if (!source || !(source.fieldPaths as string[]).includes(path))
      invalid('Material has no exact original record/path');
  }
  if (canonicalSerialize(materialPaths) !== canonicalSerialize(MATERIAL_PATHS))
    invalid('Exact seven ordered material paths required');
  const bodies = array(r.originalPhysicalBodyBindings, 1, 10000),
    groups: string[] = [];
  for (const value of bodies) {
    const row = closed(value, [
      'groupRef',
      'bodyHash',
      'originRecordId',
      'originRevision',
    ]);
    groups.push(ref(row.groupRef));
    fp(row.bodyHash);
    const source = versions.get(
      ref(row.originRecordId) + '\0' + uint(row.originRevision, true),
    );
    if (!source || source.role !== 'PHYSICAL_ORIGINAL_BODY')
      invalid('Exact historical original-body reference required');
  }
  ordered(groups);
  fp(r.stateHash);
  fp(r.readFactsHash);
  if (Buffer.byteLength(canonicalSerialize(owned), 'utf8') > 4_194_304)
    invalid('Canonical binding capacity exceeded');
  freezeOwned(owned);
  return owned as Readonly<GoverningSourceReadBindingV1>;
}

const fixedSha256Hex = (preimage: string) =>
  createHash('sha256').update(preimage, 'utf8').digest('hex');
/** Three fixed data domains; not a signature, source verifier or generic hasher. */
export function calculateGoverningSourceCommitBindingFingerprints(
  binding: unknown,
): Readonly<GoverningSourceCommitBindingFingerprints> {
  const parsed = parseGoverningSourceReadBinding(binding);
  return Object.freeze({
    readBindingFingerprint: canonicalSha256(
      canonicalHashInput({
        domain: 'SOCIAL_PLAN_GOVERNING_READ_BINDING_V1',
        value: parsed,
      }),
      fixedSha256Hex,
    ),
    sourceManifestFingerprint: canonicalSha256(
      canonicalHashInput({
        domain: 'SOCIAL_PLAN_GOVERNING_SOURCE_MANIFEST_V1',
        value: parsed.sourceManifest,
      }),
      fixedSha256Hex,
    ),
    sourceRevisionSetFingerprint: canonicalSha256(
      canonicalHashInput({
        domain: 'SOCIAL_PLAN_GOVERNING_SOURCE_REVISION_SET_V1',
        value: parsed.sourceRevisions,
      }),
      fixedSha256Hex,
    ),
  });
}

/**
 * D invokes only AFTER exact receipt recovery for a new PLAN. This function
 * compares data; it does not acquire H, authenticate custody or call the port.
 */
export function assertGoverningSourceCommitRequestConsistent(
  request: GoverningSourceCommitRequestV1,
): Readonly<GoverningSourceReadBindingV1> {
  const r = closed(request, [
    'phase',
    'purpose',
    'command',
    'transition',
    'currentHead',
    'readBinding',
    'observedAtReal',
  ]);
  lit(r.phase, 'BEFORE_EVENTS');
  lit(r.purpose, SOCIAL_PLAN_SOURCE_EVALUATION_PURPOSE);
  // Existing canonical serializer rejects getters/proxies before Core validation.
  canonicalSerialize(r.command);
  canonicalSerialize(r.transition);
  const command = validateCanonicalCommand(
    r.command as CanonicalCommand,
    fixedSha256Hex,
  );
  if (
    parseSocialEmploymentServiceCommand(command, fixedSha256Hex).kind !==
      'PLAN' ||
    command.officeId !== 'SOCIAL' ||
    command.commandType !== SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND
  )
    invalid('Only canonical manual Social PLAN');
  if (canonicalSerialize(command) !== canonicalSerialize(r.command))
    invalid('Command canonical identity differs');
  const current = closed(r.currentHead, [
    'worldId',
    'worldVersion',
    'eventSequence',
  ]);
  const currentWorld = worldId(ref(current.worldId)),
    h = head({
      worldVersion: current.worldVersion,
      eventSequence: current.eventSequence,
    });
  const binding = parseGoverningSourceReadBinding(r.readBinding);
  if (
    command.worldId !== currentWorld ||
    binding.scope.worldId !== currentWorld ||
    binding.scope.countryId !== command.countryId ||
    command.expectedWorldVersion !== h.worldVersion ||
    binding.readHead.worldVersion !== h.worldVersion ||
    binding.readHead.eventSequence !== h.eventSequence
  )
    invalid('Actual supplied head/scope differs from read binding');
  const b = binding.commandBinding;
  if (
    b.commandId !== command.commandId ||
    b.commandFingerprint !== command.fingerprint ||
    b.payloadHash !== command.payloadHash ||
    b.simTime !== command.simTime.toCanonicalValue()
  )
    invalid('Read binding command differs');
  const original = r.transition as AuthoritativeTransition;
  if (!Array.isArray(original.events) || original.events.length !== 1)
    invalid('Exact single PLAN event required');
  const events = original.events.map((e) =>
    validateAuthoritativeEvent(e, fixedSha256Hex),
  );
  const transition = createAuthoritativeTransition({
    command,
    worldVersionBefore: original.worldVersionBefore,
    worldVersionAfter: original.worldVersionAfter,
    events,
  });
  // Reuse Core's stronger command/event binding, including exact SimTime.
  // Canonical event integrity alone does not bind its time to this command.
  bindAuthoritativeTransition({ command, transition }, fixedSha256Hex);
  if (
    canonicalSerialize(transition) !== canonicalSerialize(original) ||
    transition.worldVersionBefore !== h.worldVersion ||
    BigInt(uint(transition.worldVersionAfter)) !==
      BigInt(h.worldVersion) + 1n ||
    events[0]!.eventType !== SOCIAL_SERVICE_PLAN_EVENT ||
    BigInt(uint(events[0]!.sequence)) !== BigInt(h.eventSequence) + 1n
  )
    invalid('Actual candidate transition differs from held PLAN');
  if (
    typeof r.observedAtReal !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(r.observedAtReal) ||
    !Number.isFinite(Date.parse(r.observedAtReal)) ||
    new Date(r.observedAtReal).toISOString() !== r.observedAtReal
  )
    invalid('Canonical observed audit timestamp required');
  return binding;
}
