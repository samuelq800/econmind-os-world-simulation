/** Pure retained-document binding. This module grants no source or runtime authority. */
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import {
  canonicalSerialize,
  createE01DailyBoundary,
  parseOpeningSeed,
  parseSocialEmploymentServiceCommand,
  parseSocialOfficeActionIntent,
  SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
  SOCIAL_JOB_MATCH_DUE_COMMAND,
  validateCanonicalCommand,
  validateSocialOfficeState,
  type CanonicalCommand,
  type CanonicalSha256,
  type SocialEmploymentReadFacts,
  type SocialOfficeReadFactsV1,
  type SocialOfficeResourceV1,
  type SocialOfficeStateV1,
} from '@econmind/core';
import {
  parseSocialOfficeSimulatedPublication,
  type SocialOfficeSimulatedPublication,
  type SocialOfficeSimulatedRecord,
} from '../persistence/social-office-simulated-source-custody.js';

export const SOCIAL_DEMO_RECORD_IDS = Object.freeze({
  opening: 'G_SOCIAL_OPENING_AGGREGATE_V1',
  domain: 'G_SOCIAL_DOMAIN_FACTS_V1',
  policy: 'G_SOCIAL_ACTION_POLICY_V1',
  catalog: 'COMMON_RF_RESOURCE_CATALOG_V1',
  identity: 'G_SOCIAL_EXECUTION_IDENTITY_V1',
});
/** Documentary identity only: current grants, seats, active/version and locks remain native. */
export const SOCIAL_DEMO_EXECUTION_IDENTITY_V1 = freeze({
  schemaVersion: 'g-social-office-execution-identity-v1',
  sourceClass: 'SIMULATED_OPENING',
  simulationId: 'SINGLE_SOCIAL_OFFICE_SIM_V1',
  worldId: 'WORLD_SOCIAL_SINGLE_DEMO_V1',
  countryId: 'COUNTRY_01',
  locationId: 'REGION_01_E1',
  selectionFingerprint:
    'sha256:b7ff5facc4e3301d265279762d18cec18a5258dfa061ea88cffb4a03693e8036',
  manual: {
    authSubject: '7f1c4f94-75b4-4876-a741-50bd31e14b21',
    actorId: 'ACTOR_SOCIAL_SINGLE_DEMO_V1',
    teamId: 'TEAM_SOCIAL_SINGLE_DEMO_V1',
    officeId: 'SOCIAL',
    capabilities: [
      'READ_AUTHORIZED_PROJECTION_AND_FINAL',
      'SOCIAL_DEVELOPMENT',
      'SOCIAL_EDUCATION',
      'SOCIAL_LABOUR',
    ],
    actionCapabilities: {
      PLAN: 'SOCIAL_LABOUR',
      ADMIT: 'SOCIAL_EDUCATION',
      GRADUATE: 'SOCIAL_EDUCATION',
      SERVE: 'SOCIAL_DEVELOPMENT',
    },
  },
  publisher: {
    issuerRef: 'SIMULATED_DUE_MATCH_PUBLISHER_V1',
    publisherVersion: 'SIM_SOCIAL_DUE_PUBLISHER_VERSION_V1',
    actorId: 'ACTOR_SOCIAL_DUE_MATCH_PUBLISHER_V1',
    authSubject: '7f1c4f94-75b4-4876-a741-50bd31e14b21',
    commandType: 'CORE_SOCIAL_JOB_MATCH_SETTLEMENT_V1',
    ruleVersion: 'SOCIAL_JOB_MATCH_RULE_V1',
    validFromDay: '1',
    validUntilDay: '2',
  },
} as const);
type Kind = NonNullable<SocialOfficeReadFactsV1['sourceBinding']['purpose']>;
type FixedFacts = Omit<
  SocialOfficeReadFactsV1,
  | 'sourceBinding'
  | 'simTime'
  | 'dayBoundary'
  | 'resourceAllocations'
  | 'employmentReadFacts'
>;
export interface SocialDemoDomainRecordV1 {
  readonly schemaVersion: 'g-social-office-domain-facts-v1';
  readonly worldId: string;
  readonly countryId: string;
  readonly locationId: string;
  readonly fixedFacts: FixedFacts;
  readonly employmentTerms: Omit<
    SocialEmploymentReadFacts,
    'boundary' | 'simTime'
  >;
}
export interface SocialDemoOpeningRecordV1 {
  readonly schemaVersion: 'g-social-office-simulated-opening-v1';
  readonly worldId: string;
  readonly countryId: string;
  readonly locationId: string;
  readonly openingSeed: unknown;
  readonly socialOpening: SocialOfficeStateV1;
}
interface BindingInput {
  readonly publicationUtf8: string;
  readonly generation: string;
  readonly manifestHash: string;
}
export interface SocialDemoOpeningBindingInput extends BindingInput {
  readonly expectedWorldId: string;
  readonly expectedCountryId: string;
  readonly expectedSeedId: string;
  readonly expectedSeedFingerprint: CanonicalSha256;
}
export interface SocialDemoCommandBindingInput extends BindingInput {
  readonly command: Readonly<CanonicalCommand>;
}
const DAY = 86400000n;
const digest = (s: string) =>
  createHash('sha256').update(s, 'utf8').digest('hex');
function fail(message: string): never {
  throw Error(`SOCIAL_DEMO_BINDING: ${message}`);
}
function object(v: unknown, keys?: readonly string[]): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail('record required');
  if (
    keys &&
    canonicalSerialize(Object.keys(v).sort()) !==
      canonicalSerialize([...keys].sort())
  )
    fail('closed record required');
  return v as Record<string, unknown>;
}
function integer(v: unknown): string {
  if (typeof v !== 'string' || !/^(?:0|[1-9]\d*)$/u.test(v))
    fail('integer required');
  return v;
}
function freeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
function captured<T>(value: T, names: readonly string[]): T {
  if (
    !value ||
    typeof value !== 'object' ||
    types.isProxy(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    fail('own inert binding input required');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(descriptors).length !== names.length ||
    names.some(
      (name) =>
        !descriptors[name] ||
        !Object.hasOwn(descriptors[name], 'value') ||
        !descriptors[name]!.enumerable,
    )
  )
    fail('closed inert binding input required');
  return Object.freeze(
    Object.fromEntries(names.map((name) => [name, descriptors[name]!.value])),
  ) as T;
}
function body(record: SocialOfficeSimulatedRecord): Record<string, unknown> {
  const result: unknown = JSON.parse(record.rawUtf8);
  if (canonicalSerialize(result) !== record.rawUtf8)
    fail('canonical original bytes required');
  return object(result);
}
function one(
  p: SocialOfficeSimulatedPublication,
  id: string,
  role: SocialOfficeSimulatedRecord['role'],
) {
  const selected = p.records.filter(
    (r) =>
      r.recordId === id && r.role === role && p.selectedRecordIds.includes(id),
  );
  if (selected.length !== 1) fail(`original selected ${id} required`);
  return selected[0]!;
}
function read(input: BindingInput) {
  integer(input.generation);
  if (
    !/^[a-f0-9]{64}$/u.test(input.manifestHash) ||
    typeof input.publicationUtf8 !== 'string' ||
    Buffer.byteLength(input.publicationUtf8) > 4194304 ||
    digest(input.publicationUtf8) !== input.manifestHash
  )
    fail('retained raw publication hash mismatch');
  const raw: unknown = JSON.parse(input.publicationUtf8);
  const p = parseSocialOfficeSimulatedPublication(raw);
  if (canonicalSerialize(p) !== input.publicationUtf8)
    fail('original canonical publication required');
  if (
    p.simulationId !== 'SINGLE_SOCIAL_OFFICE_SIM_V1' ||
    p.worldId !== 'WORLD_SOCIAL_SINGLE_DEMO_V1' ||
    p.countryId !== 'COUNTRY_01' ||
    p.disposition !== 'ACTIVE' ||
    BigInt(input.generation) !== BigInt(p.expectedGeneration) + 1n
  )
    fail('scope, active original or generation mismatch');
  const domainRecord = one(p, SOCIAL_DEMO_RECORD_IDS.domain, 'DOMAIN_FACTS');
  const domain = body(domainRecord);
  object(domain, [
    'schemaVersion',
    'worldId',
    'countryId',
    'locationId',
    'fixedFacts',
    'employmentTerms',
  ]);
  if (domain.schemaVersion !== 'g-social-office-domain-facts-v1')
    fail('domain schema');
  const openingRecord = one(p, SOCIAL_DEMO_RECORD_IDS.opening, 'DOMAIN_FACTS');
  const opening = body(openingRecord);
  object(opening, [
    'schemaVersion',
    'worldId',
    'countryId',
    'locationId',
    'openingSeed',
    'socialOpening',
  ]);
  if (opening.schemaVersion !== 'g-social-office-simulated-opening-v1')
    fail('opening schema');
  for (const r of [domain, opening]) {
    if (
      r.worldId !== p.worldId ||
      r.countryId !== p.countryId ||
      r.locationId !== 'REGION_01_E1'
    )
      fail('mixed domain scope');
  }
  const physicalRecords = p.records.filter(
    (r) =>
      r.role === 'PHYSICAL_ORIGINAL_BODY' &&
      p.selectedRecordIds.includes(r.recordId),
  );
  const resources: SocialOfficeResourceV1[] = [];
  for (const r of physicalRecords) {
    const v = body(r);
    object(v, [
      'schemaVersion',
      'worldId',
      'countryId',
      'locationId',
      'dayIndex',
      'allocations',
    ]);
    if (
      v.schemaVersion !== 'g-social-office-physical-day-v1' ||
      v.worldId !== p.worldId ||
      v.countryId !== p.countryId ||
      v.locationId !== domain.locationId ||
      !Array.isArray(v.allocations)
    )
      fail('physical original scope');
    for (const a of v.allocations as SocialOfficeResourceV1[]) {
      if (
        a.originalSourceRecordId !== r.recordId ||
        a.dayIndex !== integer(v.dayIndex)
      )
        fail('allocation detached from original day');
      resources.push(a);
    }
  }
  const catalogRecord = one(
    p,
    SOCIAL_DEMO_RECORD_IDS.catalog,
    'RESOURCE_CATALOG',
  );
  const catalog = body(catalogRecord);
  if (!Array.isArray(catalog.resources)) fail('catalog required');
  for (const a of resources) {
    const identities = (catalog.resources as Record<string, unknown>[]).filter(
      (r) => r.resourceId === a.canonicalPhysicalResourceId,
    );
    if (
      identities.length !== 1 ||
      !Array.isArray(identities[0]!.aliases) ||
      !identities[0]!.aliases.includes(a.resourceId) ||
      identities[0]!.unit !== a.unit
    )
      fail('allocation physical alias mismatch');
  }
  const policy = body(
    one(p, SOCIAL_DEMO_RECORD_IDS.policy, 'CURRENT_AUTHORIZATION'),
  );
  const identityRecord = one(
    p,
    SOCIAL_DEMO_RECORD_IDS.identity,
    'CURRENT_AUTHORIZATION',
  );
  const identity = body(identityRecord);
  if (
    canonicalSerialize(identity) !==
    canonicalSerialize(SOCIAL_DEMO_EXECUTION_IDENTITY_V1)
  )
    fail('selected execution identity original mismatch');
  object(policy, [
    'schemaVersion',
    'worldId',
    'countryId',
    'locationId',
    'actionKinds',
    'presets',
    'rootSelectionSHA256',
  ]);
  if (
    policy.schemaVersion !== 'g-social-office-action-policy-v1' ||
    policy.worldId !== p.worldId ||
    policy.countryId !== p.countryId ||
    policy.locationId !== domain.locationId ||
    policy.rootSelectionSHA256 !==
      'b7ff5facc4e3301d265279762d18cec18a5258dfa061ea88cffb4a03693e8036'
  )
    fail('fixed simulation policy mismatch');
  const asofRecords = p.records.filter(
    (r) =>
      r.recordId.startsWith('G_SOCIAL_ASOF_DAY_') &&
      p.selectedRecordIds.includes(r.recordId),
  );
  if (
    asofRecords.length !== 1 ||
    asofRecords[0]!.role !== 'CURRENT_AUTHORIZATION'
  )
    fail('one selected as-of required');
  const asof = body(asofRecords[0]!);
  object(asof, [
    'schemaVersion',
    'sourceClass',
    'simulationId',
    'worldId',
    'countryId',
    'locationId',
    'presetId',
    'dayIndex',
    'simTime',
    'selectionFingerprint',
  ]);
  const day = integer(asof.dayIndex),
    time = integer(asof.simTime);
  if (
    asof.schemaVersion !== 'g-social-office-simulated-asof-v1' ||
    asof.sourceClass !== 'SIMULATED_OPENING' ||
    asof.simulationId !== p.simulationId ||
    asof.presetId !== `G_SOCIAL_PRESET_DAY_${day}` ||
    asof.selectionFingerprint !==
      'sha256:b7ff5facc4e3301d265279762d18cec18a5258dfa061ea88cffb4a03693e8036' ||
    asof.worldId !== p.worldId ||
    asof.countryId !== p.countryId ||
    asof.locationId !== domain.locationId ||
    BigInt(time) !== BigInt(day) * DAY ||
    !Array.isArray(policy.presets) ||
    !policy.presets.includes(day) ||
    asofRecords[0]!.recordId !== `G_SOCIAL_ASOF_DAY_${day}`
  )
    fail('fixed original as-of mismatch');
  if (
    BigInt(time) < BigInt(p.validFromSimTime) ||
    (p.validUntilSimTime !== null &&
      BigInt(time) >= BigInt(p.validUntilSimTime))
  )
    fail('as-of outside original validity');
  return {
    p,
    domain: domain as unknown as SocialDemoDomainRecordV1,
    domainRecord,
    opening: opening as unknown as SocialDemoOpeningRecordV1,
    physicalRecords,
    catalogRecord,
    identityRecord,
    resources,
    policy,
    day,
    time,
  };
}
function facts(
  input: BindingInput,
  r: ReturnType<typeof read>,
  purpose: Kind | null,
): SocialOfficeReadFactsV1 {
  if (
    purpose !== null &&
    (!Array.isArray(r.policy.actionKinds) ||
      !r.policy.actionKinds.includes(purpose))
  )
    fail('original action-purpose not selected');
  const category =
    purpose === 'SERVE'
      ? 'HEALTHCARE'
      : purpose === 'ADMIT' || purpose === 'GRADUATE'
        ? 'EDUCATION'
        : 'EMPLOYMENT';
  if (purpose !== null && !r.p.allowedPurposes.includes(category))
    fail('document category unavailable');
  return freeze({
    ...r.domain.fixedFacts,
    sourceBinding: {
      sourceClass: 'SIMULATED_OPENING',
      sourceAdmitted: false,
      sourceGeneration: input.generation,
      manifestHash: `sha256:${input.manifestHash}` as CanonicalSha256,
      selectedRecordIds: r.p.selectedRecordIds,
      worldId: r.p.worldId,
      countryId: r.p.countryId,
      locationId: r.domain.locationId,
      purpose,
    },
    simTime: r.time,
    dayBoundary: createE01DailyBoundary(r.day),
    resourceAllocations: r.resources,
    employmentReadFacts:
      purpose === 'PLAN' || purpose === 'MATCH'
        ? {
            ...r.domain.employmentTerms,
            boundary: createE01DailyBoundary(r.day),
            simTime: r.time,
          }
        : null,
  });
}
/** Reconstruct both n0 inputs from the initial retained publication and genuine seed. */
export function bindSocialOfficeSimulatedOpening(
  input: SocialDemoOpeningBindingInput,
): Readonly<{
  socialOpening: SocialOfficeStateV1;
  openingReadFacts: SocialOfficeReadFactsV1;
}> {
  input = captured(input, [
    'publicationUtf8',
    'generation',
    'manifestHash',
    'expectedWorldId',
    'expectedCountryId',
    'expectedSeedId',
    'expectedSeedFingerprint',
  ]);
  const r = read(input);
  if (
    input.generation !== '1' ||
    r.day !== '0' ||
    r.p.worldId !== input.expectedWorldId ||
    r.p.countryId !== input.expectedCountryId
  )
    fail('initial opening scope required');
  const seed = parseOpeningSeed(r.opening.openingSeed, digest);
  if (
    seed.seedId !== input.expectedSeedId ||
    seed.fingerprint !== input.expectedSeedFingerprint ||
    seed.worldId !== input.expectedWorldId ||
    seed.sources.length !== 1
  )
    fail('retained opening seed mismatch');
  const payload: unknown = JSON.parse(seed.sources[0]!.canonicalPayload);
  const expected = {
    sourceClass: 'SIMULATED_OPENING',
    sourceAdmitted: false,
    rootSelectionSHA256: r.policy.rootSelectionSHA256,
    socialOpeningSHA256: digest(canonicalSerialize(r.opening.socialOpening)),
    domainFactsSHA256: r.domainRecord.sha256,
    physicalOriginals: r.physicalRecords.map(({ recordId, sha256 }) => ({
      recordId,
      sha256,
    })),
    catalogSHA256: r.catalogRecord.sha256,
    executionIdentitySHA256: r.identityRecord.sha256,
  };
  if (
    seed.sources[0]!.sourceKind !== 'DOCUMENTED_ASSUMPTION' ||
    canonicalSerialize(payload) !== canonicalSerialize(expected)
  )
    fail('seed does not bind complete original social state and recipes');
  const openingReadFacts = facts(input, r, null);
  const socialOpening = validateSocialOfficeState(
    r.opening.socialOpening,
    openingReadFacts,
    digest,
  );
  return freeze({ socialOpening, openingReadFacts });
}
/** Bytes must come from D's already protected original SQL revision, never Event facts. */
export function bindSocialOfficeSimulatedReadFacts(
  input: SocialDemoCommandBindingInput,
): Readonly<SocialOfficeReadFactsV1> {
  input = captured(input, [
    'publicationUtf8',
    'generation',
    'manifestHash',
    'command',
  ]);
  validateCanonicalCommand(input.command, digest);
  const r = read(input);
  if (
    input.command.worldId !== r.p.worldId ||
    input.command.countryId !== r.p.countryId ||
    input.command.simTime.toCanonicalValue() !== r.time
  )
    fail('command/source scope and original as-of mismatch');
  const purpose =
    input.command.commandType === SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND ||
    input.command.commandType === SOCIAL_JOB_MATCH_DUE_COMMAND
      ? parseSocialEmploymentServiceCommand(input.command, digest).kind
      : parseSocialOfficeActionIntent(input.command, digest).kind;
  return facts(input, r, purpose);
}
/** Compare complete canonical reconstructed facts; matching a hash field alone is insufficient. */
export function assertSocialOfficeHistoricalReadFacts(
  input: SocialDemoCommandBindingInput &
    Readonly<{ retainedReadFacts: SocialOfficeReadFactsV1 }>,
): Readonly<SocialOfficeReadFactsV1> {
  input = captured(input, [
    'publicationUtf8',
    'generation',
    'manifestHash',
    'command',
    'retainedReadFacts',
  ]);
  const actual = bindSocialOfficeSimulatedReadFacts({
    publicationUtf8: input.publicationUtf8,
    generation: input.generation,
    manifestHash: input.manifestHash,
    command: input.command,
  });
  if (
    canonicalSerialize(input.retainedReadFacts) !== canonicalSerialize(actual)
  )
    fail('retained read facts differ from original complete source');
  return actual;
}
