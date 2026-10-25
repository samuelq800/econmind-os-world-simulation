import type { CanonicalSha256 } from '../commands/command.js';
import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import { commandId, openingSeedId, worldId } from '../ids.js';
import {
  canonicalSerialize,
  isCanonicalInputProxy,
} from '../serialization/canonical.js';
import { INVENTORY_POSTING_SCHEMA_VERSION } from './inventory-ledger.js';
import {
  PRODUCTION_CONSUMPTION_SCHEMA_VERSION,
  type InventoryLedgerPosting,
} from './production-consumption-posting.js';

export const PRODUCTION_PERSISTENCE_REQUIREMENT_SCHEMA =
  'production-persistence-admission-requirement-v1' as const;
const KINDS = [
  'OPERATING_SOURCE',
  'ORIGINAL_FUNDING_QUALIFICATION',
  'CURRENT_USE_ELIGIBILITY',
  'REVOCATION_STATE',
  'WRITER_REVOKER_COOPERATION',
] as const;
type SourceKind = (typeof KINDS)[number];
type CutoffKind =
  | 'ORIGINAL_SETTLEMENT_CUTOFF'
  | 'TARGET_TRANSITION_CUTOFF'
  | 'CURRENT_USE_HEAD';
type Head = Readonly<{ worldVersion: string; eventSequence: string }>;
type Data = Record<string, unknown>;

export interface ProductionPersistenceSourceRequirementV1 {
  readonly kind: SourceKind;
  readonly recordRef: string;
  readonly expectedRevision: string;
  readonly expectedFingerprint: CanonicalSha256;
  readonly custodianRef: string;
  readonly subjectRef: string;
  readonly requiredAt: CutoffKind;
  readonly cutoff: Head;
  readonly resourceRefs: readonly string[];
}

/** Expected data only. No field is an installed fact, admission or capability. */
export interface ProductionPersistenceAdmissionRequirementV1 {
  readonly schemaVersion: typeof PRODUCTION_PERSISTENCE_REQUIREMENT_SCHEMA;
  readonly purpose: 'NEW_INVENTORY_PRODUCTION_PERSISTENCE';
  readonly target: Readonly<{
    targetDeploymentRef: string;
    databaseIdentityRef: string;
    connectorBindingRef: string;
  }>;
  readonly worldBinding: Readonly<{
    worldId: string;
    seedId: string;
    seedFingerprint: CanonicalSha256;
    modelVersion: string;
    replayBindingFingerprint: CanonicalSha256;
  }>;
  readonly commandBinding: Readonly<{
    commandId: string;
    commandFingerprint: CanonicalSha256;
    inventoryPostingFingerprints: readonly CanonicalSha256[];
  }>;
  readonly head: Head;
  readonly implementation: Readonly<{
    constructorSourceCommit: string;
    constructorBlobSHA256: string;
    decoderProtocol: 'industry-production-decoder-v1';
    decoderBuildSHA256: string;
    writerProtocol: string;
    admissionContractVersion: string;
  }>;
  readonly releaseContract: Readonly<{
    publisherPolicyRef: string;
    publisherPolicyRevision: string;
    installedReleaseChainFingerprint: CanonicalSha256;
    catalogContractVersion: string;
    catalogFingerprint: CanonicalSha256;
    currentAdmissionRef: string;
    currentAdmissionRevision: string;
  }>;
  readonly sourceRequirements: readonly ProductionPersistenceSourceRequirementV1[];
}

function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.INVENTORY_INPUT_INVALID,
    `Production persistence requirement: ${message}`,
  );
}
function fields(value: unknown, keys: readonly string[]): Data {
  if (
    isCanonicalInputProxy(value) ||
    value === null ||
    typeof value !== 'object' ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    invalid('Plain closed data object required');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(descriptors);
  if (
    actual.length !== keys.length ||
    actual.some((k) => typeof k !== 'string' || !keys.includes(k))
  )
    invalid('Missing or unknown key');
  const owned: Data = {};
  for (const key of keys) {
    const d = descriptors[key];
    if (!d || !Object.hasOwn(d, 'value') || !d.enumerable)
      invalid('Own enumerable data properties required');
    owned[key] = d.value;
  }
  return owned;
}
function array(value: unknown, min: number, max: number): unknown[] {
  if (
    isCanonicalInputProxy(value) ||
    !Array.isArray(value) ||
    value.length < min ||
    value.length > max
  )
    invalid('Array capacity exceeded or required members missing');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== value.length + 1)
    invalid('Array must be dense with no extra keys');
  const owned: unknown[] = [];
  for (let i = 0; i < value.length; i++) {
    const d = descriptors[String(i)];
    if (!d || !Object.hasOwn(d, 'value') || !d.enumerable)
      invalid('Array must contain own data, not holes or accessors');
    owned.push(d.value);
  }
  return owned;
}
function ref(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length > 128 ||
    !/^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u.test(value)
  )
    invalid('Canonical reference required');
  return value;
}
function integer(value: unknown, positive = false): string {
  if (
    typeof value !== 'string' ||
    value.length > 19 ||
    !(positive ? /^[1-9]\d*$/u : /^(?:0|[1-9]\d*)$/u).test(value) ||
    BigInt(value) > 9_223_372_036_854_775_807n
  )
    invalid('Canonical bounded integer text required');
  return value;
}
function fingerprint(value: unknown): CanonicalSha256 {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value))
    invalid('Exact canonical object fingerprint required');
  // canonicalSha256 constructs from a preimage; it is NOT a text parser.
  return value as CanonicalSha256;
}
function hex(value: unknown, length: 40 | 64): string {
  if (
    typeof value !== 'string' ||
    value.length !== length ||
    !/^[0-9a-f]+$/u.test(value)
  )
    invalid('Exact raw byte/build hash or Git commit required');
  return value;
}
function literal<T extends string>(value: unknown, expected: T): T {
  if (value !== expected) invalid('Unsupported schema, purpose or protocol');
  return expected;
}
function head(value: unknown): Head {
  const r = fields(value, ['worldVersion', 'eventSequence']);
  return Object.freeze({
    worldVersion: integer(r.worldVersion),
    eventSequence: integer(r.eventSequence),
  });
}
function sorted<T extends string>(values: T[]): readonly T[] {
  for (let i = 1; i < values.length; i++)
    if (values[i - 1]! >= values[i]!)
      invalid('Strict canonical array order without duplicates required');
  return Object.freeze(values);
}
function sources(value: unknown, h: Head) {
  const kinds = new Set<SourceKind>();
  const identities = new Map<string, string>();
  let previous = '';
  const result = array(value, 5, 1024).map((item) => {
    const r = fields(item, [
      'kind',
      'recordRef',
      'expectedRevision',
      'expectedFingerprint',
      'custodianRef',
      'subjectRef',
      'requiredAt',
      'cutoff',
      'resourceRefs',
    ]);
    const index = KINDS.findIndex((k) => k === r.kind);
    if (index < 0) invalid('Unknown source requirement kind');
    const kind = KINDS[index]!;
    kinds.add(kind);
    const requiredAt: CutoffKind =
      kind === 'OPERATING_SOURCE'
        ? 'TARGET_TRANSITION_CUTOFF'
        : kind === 'ORIGINAL_FUNDING_QUALIFICATION'
          ? 'ORIGINAL_SETTLEMENT_CUTOFF'
          : 'CURRENT_USE_HEAD';
    literal(r.requiredAt, requiredAt);
    const cutoff = head(r.cutoff);
    if (
      requiredAt === 'CURRENT_USE_HEAD' &&
      (cutoff.worldVersion !== h.worldVersion ||
        cutoff.eventSequence !== h.eventSequence)
    )
      invalid('Current-use descriptor must equal declared pre-target head');
    // No <=H restriction on target/original after-frontiers. Actual chronology,
    // including same-transition funding, is D's canonical-source obligation.
    const resourceRefs = sorted(
      array(
        r.resourceRefs,
        kind === 'WRITER_REVOKER_COOPERATION' ? 1 : 0,
        32,
      ).map(ref),
    );
    const row: ProductionPersistenceSourceRequirementV1 = Object.freeze({
      kind,
      recordRef: ref(r.recordRef),
      expectedRevision: integer(r.expectedRevision, true),
      expectedFingerprint: fingerprint(r.expectedFingerprint),
      custodianRef: ref(r.custodianRef),
      subjectRef: ref(r.subjectRef),
      requiredAt,
      cutoff,
      resourceRefs,
    });
    const key = `${index}\0${row.recordRef}\0${row.subjectRef}\0${requiredAt}`;
    if (previous && previous >= key)
      invalid('Source descriptor order or duplicate');
    previous = key;
    const identity = `${kind}\0${row.recordRef}`;
    const content = canonicalSerialize([
      row.expectedRevision,
      row.expectedFingerprint,
      row.custodianRef,
    ]);
    if (identities.has(identity) && identities.get(identity) !== content)
      invalid('Conflicting expected source identity');
    identities.set(identity, content);
    return row;
  });
  if (kinds.size !== KINDS.length)
    invalid('All five expected source kinds required');
  return Object.freeze(result);
}

/** Parse owned expected obligations; never observes/admits target or source. */
export function parseProductionPersistenceAdmissionRequirement(
  value: unknown,
): Readonly<ProductionPersistenceAdmissionRequirementV1> {
  const r = fields(value, [
    'schemaVersion',
    'purpose',
    'target',
    'worldBinding',
    'commandBinding',
    'head',
    'implementation',
    'releaseContract',
    'sourceRequirements',
  ]);
  const t = fields(r.target, [
    'targetDeploymentRef',
    'databaseIdentityRef',
    'connectorBindingRef',
  ]);
  const w = fields(r.worldBinding, [
    'worldId',
    'seedId',
    'seedFingerprint',
    'modelVersion',
    'replayBindingFingerprint',
  ]);
  const c = fields(r.commandBinding, [
    'commandId',
    'commandFingerprint',
    'inventoryPostingFingerprints',
  ]);
  const h = head(r.head);
  const i = fields(r.implementation, [
    'constructorSourceCommit',
    'constructorBlobSHA256',
    'decoderProtocol',
    'decoderBuildSHA256',
    'writerProtocol',
    'admissionContractVersion',
  ]);
  const p = fields(r.releaseContract, [
    'publisherPolicyRef',
    'publisherPolicyRevision',
    'installedReleaseChainFingerprint',
    'catalogContractVersion',
    'catalogFingerprint',
    'currentAdmissionRef',
    'currentAdmissionRevision',
  ]);
  const parsed: ProductionPersistenceAdmissionRequirementV1 = Object.freeze({
    schemaVersion: literal(
      r.schemaVersion,
      PRODUCTION_PERSISTENCE_REQUIREMENT_SCHEMA,
    ),
    purpose: literal(r.purpose, 'NEW_INVENTORY_PRODUCTION_PERSISTENCE'),
    target: Object.freeze({
      targetDeploymentRef: ref(t.targetDeploymentRef),
      databaseIdentityRef: ref(t.databaseIdentityRef),
      connectorBindingRef: ref(t.connectorBindingRef),
    }),
    worldBinding: Object.freeze({
      worldId: worldId(ref(w.worldId)),
      seedId: openingSeedId(ref(w.seedId)),
      seedFingerprint: fingerprint(w.seedFingerprint),
      modelVersion: ref(w.modelVersion),
      replayBindingFingerprint: fingerprint(w.replayBindingFingerprint),
    }),
    commandBinding: Object.freeze({
      commandId: commandId(ref(c.commandId)),
      commandFingerprint: fingerprint(c.commandFingerprint),
      inventoryPostingFingerprints: sorted(
        array(c.inventoryPostingFingerprints, 1, 10000).map(fingerprint),
      ),
    }),
    head: h,
    implementation: Object.freeze({
      constructorSourceCommit: hex(i.constructorSourceCommit, 40),
      constructorBlobSHA256: hex(i.constructorBlobSHA256, 64),
      decoderProtocol: literal(
        i.decoderProtocol,
        'industry-production-decoder-v1',
      ),
      decoderBuildSHA256: hex(i.decoderBuildSHA256, 64),
      writerProtocol: ref(i.writerProtocol),
      admissionContractVersion: ref(i.admissionContractVersion),
    }),
    releaseContract: Object.freeze({
      publisherPolicyRef: ref(p.publisherPolicyRef),
      publisherPolicyRevision: integer(p.publisherPolicyRevision, true),
      installedReleaseChainFingerprint: fingerprint(
        p.installedReleaseChainFingerprint,
      ),
      catalogContractVersion: ref(p.catalogContractVersion),
      catalogFingerprint: fingerprint(p.catalogFingerprint),
      currentAdmissionRef: ref(p.currentAdmissionRef),
      currentAdmissionRevision: integer(p.currentAdmissionRevision, true),
    }),
    sourceRequirements: sources(r.sourceRequirements, h),
  });
  // Every parsed string/key is canonical ASCII; character length equals UTF8 bytes.
  if (canonicalSerialize(parsed).length > 1_048_576)
    invalid('Canonical requirement exceeds supported one-MiB capacity');
  return parsed;
}

/**
 * Data comparison ONLY. Unprovided target/seed/build/catalog/admission/source
 * observations are NOT verified. The existing production hard-deny remains.
 */
export function assertProductionPersistenceRequirementMatchesCandidate(input: {
  readonly requirement: ProductionPersistenceAdmissionRequirementV1;
  readonly worldId: string;
  readonly commandId: string;
  readonly commandFingerprint: string;
  readonly head: Head;
  readonly postings: readonly InventoryLedgerPosting[];
}): Readonly<{
  status: 'REQUIREMENT_MATCHED_NOT_ADMITTED';
  comparisonScope: 'CANDIDATE_IDENTITY_ONLY';
}> {
  const r = fields(input, [
    'requirement',
    'worldId',
    'commandId',
    'commandFingerprint',
    'head',
    'postings',
  ]);
  const requirement = parseProductionPersistenceAdmissionRequirement(
    r.requirement,
  );
  const wid = worldId(ref(r.worldId)),
    cid = commandId(ref(r.commandId));
  const commandFingerprint = fingerprint(r.commandFingerprint);
  const h = head(r.head);
  let production = false;
  const fingerprints = array(r.postings, 1, 10000).map((posting) => {
    if (
      isCanonicalInputProxy(posting) ||
      posting === null ||
      typeof posting !== 'object'
    )
      invalid('Posting data required');
    const own: Data = {};
    for (const key of [
      'worldId',
      'causationCommandId',
      'fingerprint',
      'schemaVersion',
      'operation',
    ]) {
      const d = Object.getOwnPropertyDescriptor(posting, key);
      if (!d || !Object.hasOwn(d, 'value') || !d.enumerable)
        invalid('Posting own identity data required');
      own[key] = d.value;
    }
    if (own.worldId !== wid || own.causationCommandId !== cid)
      invalid('Posting World or command mismatch');
    if (
      own.schemaVersion === PRODUCTION_CONSUMPTION_SCHEMA_VERSION &&
      own.operation === 'PRODUCE_AND_CONSUME'
    )
      production = true;
    else if (!(
      own.schemaVersion === INVENTORY_POSTING_SCHEMA_VERSION &&
      typeof own.operation === 'string' &&
      ['RESERVE', 'RELEASE', 'SHIP', 'DELIVER'].includes(own.operation)
    ))
      invalid('Unknown or mixed schema-operation pair');
    return fingerprint(own.fingerprint);
  });
  // Set comparison does not repair a declared ordering; only candidate order is irrelevant.
  const candidateSet = sorted([...fingerprints].sort());
  if (
    !production ||
    requirement.worldBinding.worldId !== wid ||
    requirement.commandBinding.commandId !== cid ||
    requirement.commandBinding.commandFingerprint !== commandFingerprint ||
    requirement.head.worldVersion !== h.worldVersion ||
    requirement.head.eventSequence !== h.eventSequence ||
    canonicalSerialize(
      requirement.commandBinding.inventoryPostingFingerprints,
    ) !== canonicalSerialize(candidateSet)
  )
    invalid('Supplied candidate identity differs from expected requirement');
  return Object.freeze({
    status: 'REQUIREMENT_MATCHED_NOT_ADMITTED',
    comparisonScope: 'CANDIDATE_IDENTITY_ONLY',
  });
}
