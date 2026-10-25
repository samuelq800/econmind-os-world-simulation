import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COMMAND_SCHEMA_VERSION,
  CURRENT_REPLAY_BINDING,
  EVENT_SCHEMA_VERSION,
  OPENING_SEED_SCHEMA_VERSION,
  OPENING_SOURCE_SCHEMA_VERSION,
  SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
  SOCIAL_SERVICE_PLAN_EVENT,
  SOCIAL_JOB_MATCH_EVENT,
  SOCIAL_JOB_MATCH_DUE_COMMAND,
  SOCIAL_JOB_MATCH_RULE_VERSION,
  canonicalHashInput,
  canonicalSerialize,
  canonicalSha256,
  createAuthoritativeTransition,
  createE01DailyBoundary,
  createFinalCommandReceipt,
  createOpeningSeed,
  createOpeningSource,
  materializeOpeningLabourState,
  openingSeedId,
  openingSourceId,
  parseAuthoritativeEvent,
  parseCanonicalCommand,
  prepareSocialEmploymentServiceOperation,
  worldId,
  type CanonicalCommand,
  type SocialEmploymentReadFacts,
  type SocialEmploymentServiceState,
} from '@econmind/core';
import {
  createSocialEmploymentRuntimeSnapshotReader,
  createSocialEmploymentCommitSourceGuard,
  readIssuedSocialGoverningSourceBinding,
} from '../../apps/world-worker/src/persistence/social-employment-runtime-snapshot-reader.js';
import {
  SOCIAL_SOURCE_MATERIAL_PATHS,
  type SocialOperatingCustodyPort,
  type SocialOperatingSnapshotRequest,
} from '../../apps/world-worker/src/persistence/social-employment-source-input.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';
import {
  SqlSocialJobMatchCandidateSource,
  prepareSocialJobMatchAtomicDraft,
} from '../../apps/world-worker/src/persistence/social-job-match-candidate-source.js';
import { createOfficialLabourSocialOpeningAdoption } from '../../apps/world-worker/src/preparation/official-labour-social-opening-adoption.js';
import { inspectOfficialOpeningDecisionSource } from '../../apps/world-worker/src/preparation/official-opening-decision-reconciliation.js';
import { createManualOfficeCommandComposition } from '../../apps/world-worker/src/preparation/manual-office-command-composition.js';

// Synthetic, nonempty, mechanism-only original values. The real durable lineage
// reader runs over this SQL protocol fixture; neither native locks, actual source
// authority/adoption nor a production custodian is claimed by these positives.
const digest = (v: string) =>
  createHash('sha256').update(v, 'utf8').digest('hex');
const hash = (v: unknown) => canonicalSha256(canonicalHashInput(v), digest);
const at = '2026-10-25T00:00:00.000Z';
const wid = 'WORLD_TEST_SOCIAL_SOURCE';
const cid = 'COUNTRY_01',
  locationId = 'REGION_01_E1';
const skills = ['LOW', 'MEDIUM', 'HIGH'] as const;
type JsonRow = Record<string, unknown>;
const clone = <T>(v: T): T => JSON.parse(canonicalSerialize(v)) as T;
function command(n = 1, version = '0', simTime = '10000', day = '1') {
  return parseCanonicalCommand(
    {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      actorId: 'ACTOR_SOCIAL',
      authSubject: '11111111-1111-4111-8111-111111111111',
      commandId: `TEST_SOCIAL_PLAN_${n}`,
      commandType: SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
      correlationId: 'TEST_TRACE',
      countryId: cid,
      worldId: wid,
      officeId: 'SOCIAL',
      expectedWorldVersion: version,
      idempotencyKey: `TEST_PLAN_IDEM_${n}`,
      simTime,
      submittedAtReal: at,
      payload: {
        schemaVersion: 'social-employment-service-plan-v1',
        locationId,
        skill: 'HIGH',
        positionId: 'POSITION_HIGH',
        servicePoolId: `POOL_HIGH_D${day}`,
        requestedMatches: '1',
        dueDayIndex: day,
      },
    },
    digest,
  );
}
function initialValues() {
  const populationAvailability = [
    { countryId: cid, locationId, workingAgeAvailable: '24' },
  ];
  const labour = materializeOpeningLabourState({
    targets: skills.map((skill) => ({
      countryId: cid,
      locationId,
      skill,
      count: '2',
    })),
    positions: skills.map((skill) => ({
      countryId: cid,
      locationId,
      skill,
      positionId: `POSITION_${skill}`,
      requiredCount: '8',
      sourceWeight: '1',
      owner: 'PRIVATE_SECTOR' as const,
      classificationId: 'SECTOR_FOOD',
      employerId: 'ENTITY_OPERATOR_01',
      employerRole: 'OP' as const,
      occupation: 'GENERAL' as const,
      wageAmount: '11',
      wageCurrency: 'XAA',
      wagePeriod: 'SIM_YEAR' as const,
      wageVersion: 'TEST_WAGE_V1',
      payrollFundingRef: 'TEST_PAYROLL',
    })),
    populationAvailability,
    skillAvailability: skills.map((skill) => ({
      countryId: cid,
      locationId,
      skill,
      count: '8',
    })),
    nonEmployedAggregates: skills.map((skill) => ({
      countryId: cid,
      locationId,
      skill,
      status: 'UNEMPLOYED_SEARCHING' as const,
      count: '6',
    })),
    employers: [
      { countryId: cid, employerId: 'ENTITY_OPERATOR_01', role: 'OP' },
    ],
  }).state;
  const state: SocialEmploymentServiceState = {
    schemaVersion: 'social-employment-service-state-v1',
    worldId: wid,
    labour,
    plans: [],
    appliedOperations: [],
    servicePools: ['1', '2'].flatMap((day) =>
      skills.map((skill) => ({
        poolId: `POOL_${skill}_D${day}`,
        countryId: cid,
        locationId,
        skill,
        dayIndex: day,
        ruleVersion: SOCIAL_JOB_MATCH_RULE_VERSION,
        capacitySlots: '6',
        usedSlots: '0',
        reservedSlots: '0',
      })),
    ),
  };
  const facts: SocialEmploymentReadFacts = {
    boundary: createE01DailyBoundary('0'),
    simTime: '10000',
    populationAvailability,
    offer: {
      countryId: cid,
      locationId,
      skill: 'HIGH',
      positionId: 'POSITION_HIGH',
      employerId: 'ENTITY_OPERATOR_01',
      employerRole: 'OP',
      legalPositionRef: 'TEST_LEGAL_POSITION',
      payrollFundingRef: 'TEST_PAYROLL',
      offerVersion: 'TEST_OFFER_V1',
      state: 'ACTIVE',
      wageVersion: 'TEST_WAGE_V1',
      amount: '11',
      currency: 'XAA',
      period: 'SIM_YEAR',
      validFromDayIndex: '0',
      validUntilDayIndex: '10',
    },
    minimumWage: {
      countryId: cid,
      ruleId: 'TEST_MIN',
      ruleVersion: 'TEST_MIN_V1',
      amount: '7',
      currency: 'XAA',
      period: 'SIM_YEAR',
      validFromDayIndex: '0',
      validUntilDayIndex: '10',
    },
  };
  const body = {
    schemaVersion: 'social-physical-attempt-envelope-v1',
    worldId: wid,
    ruleRevision: 'TEST_RULE_V1',
    sourceRevision: 'TEST_ORIGINAL_BODY_V1',
    validFromDayIndex: '0',
    validUntilDayIndex: '3',
    dayIndex: '1',
    countryId: cid,
    locationId,
    pools: skills.map((skill) => ({ poolId: `POOL_${skill}_D1`, skill })),
    stages: [
      {
        resourceKey: 'TEST_SHARED_STAGE',
        availableMinutes: '24',
        minutesPerOpportunity: { LOW: '2', MEDIUM: '3', HIGH: '4' },
      },
    ],
  };
  const { simTime: _simTime, ...current } = facts;
  void _simTime;
  return {
    state,
    facts,
    sourceValue: {
      genesis: { semanticRevision: 'SOCIAL_SOURCE_V3', state },
      current,
      currentRevised: {
        ...current,
        offer: { ...current.offer, offerVersion: 'TEST_OFFER_V2' },
      },
      currentDay1: { ...current, boundary: createE01DailyBoundary('1') },
      physicalBody: body,
      physicalAlternative: {
        ...body,
        stages: [{ ...body.stages[0]!, availableMinutes: '25' }],
      },
      physicalDay2: {
        ...body,
        dayIndex: '2',
        pools: skills.map((skill) => ({ poolId: `POOL_${skill}_D2`, skill })),
      },
    },
    body,
  };
}
function fixture() {
  const values = initialValues();
  const source = createOpeningSource(
    {
      schemaVersion: OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: openingSourceId('TEST_SOCIAL_ORIGINAL'),
      sourceKind: 'DOCUMENTED_ASSUMPTION',
      locator: 'TEST_ONLY_NONEMPTY_SOURCE_MECHANISM',
      sourceVersion: '1',
      payload: values.sourceValue,
    },
    digest,
  );
  const seed = createOpeningSeed(
    {
      schemaVersion: OPENING_SEED_SCHEMA_VERSION,
      seedId: openingSeedId('TEST_SOCIAL_SEED'),
      worldId: worldId(wid),
      openingWorldVersion: '0',
      replayBinding: CURRENT_REPLAY_BINDING,
      sources: [source],
      inventoryEntries: [],
      financialBatches: [],
    },
    digest,
  );
  const sourceBinding = {
    sourceId: source.sourceId,
    sourceRevision: '1',
    sourceFingerprint: source.payloadHash,
    ownerAdoptionRef: 'TEST_ONLY_ADOPTION',
    ownerAdoptionFingerprint: hash({ mechanism: 'TEST_ONLY' }),
    admissionRef: 'TEST_ONLY_ADMISSION',
    admissionRevision: '1',
  };
  const authority = {
    issuerId: 'TEST_ONLY_ISSUER',
    custodianId: 'TEST_ONLY_CUSTODIAN',
    ...sourceBinding,
  };
  const genesisPaths = SOCIAL_SOURCE_MATERIAL_PATHS.filter((p) =>
    p.startsWith('/admittedGenesis/'),
  );
  const currentPaths = SOCIAL_SOURCE_MATERIAL_PATHS.filter((p) =>
    p.startsWith('/currentReadFacts/'),
  );
  function original(
    recordId: string,
    role: string,
    paths: readonly string[],
    pointer: string,
    value: unknown,
  ): JsonRow {
    return {
      schemaVersion: 'social-operating-source-record-v1',
      recordId,
      revision: '1',
      role,
      sourceBinding,
      worldId: wid,
      fieldPaths: paths,
      semanticRevision: 'SOCIAL_SOURCE_V3',
      value,
      effectivity: {
        fromSimTime: '0',
        untilSimTime: null,
        fromHead: { worldVersion: '0', eventSequence: '0' },
        untilHead: null,
      },
      predecessorRevision: null,
      supersededByRevision: null,
      revokedAt: null,
      sourceUnits: ['TEST_ONLY_NORMATIVE_REFERENCE'],
      originProof: {
        kind: 'ADMITTED_OPENING_SOURCE',
        sourceId: source.sourceId,
        pointer,
        payloadHash: source.payloadHash,
      },
    };
  }
  let originals: JsonRow[] = [
    original(
      'TEST_GENESIS',
      'GENESIS_HISTORICAL',
      genesisPaths,
      '/genesis',
      values.sourceValue.genesis,
    ),
    original(
      'TEST_CURRENT',
      'CURRENT_EFFECTIVE',
      currentPaths,
      '/current',
      values.sourceValue.current,
    ),
    original(
      'TEST_PHYSICAL',
      'PHYSICAL_ORIGINAL_BODY',
      ['/physicalAttemptEnvelope'],
      '/physicalBody',
      values.body,
    ),
    original(
      'TEST_ELIGIBILITY',
      'CURRENT_ELIGIBILITY',
      ['/physicalAttemptEnvelope'],
      '/physicalBody',
      values.body,
    ),
  ];
  const history: ReturnType<typeof committedPlan>[] = [];
  const queries: string[] = [];
  const { fingerprint: _fingerprint, ...seedIntent } = seed;
  void _fingerprint;
  const executor: SqlExecutor = {
    async query<Row>(sql: string, parameters = []) {
      queries.push(sql);
      let rows: unknown[];
      if (sql.includes('from world_v2.world_head'))
        rows = [
          {
            world_version: String(history.length),
            event_sequence: String(history.length),
          },
        ];
      else if (sql.includes('from world_v2.opening_seed'))
        rows = [
          {
            world_id: wid,
            seed_id: seed.seedId,
            opening_world_version: '0',
            replay_binding: canonicalSerialize(seed.replayBinding),
            canonical_payload: canonicalSerialize(seedIntent),
            seed_fingerprint: seed.fingerprint,
          },
        ];
      else if (sql.includes('from world_v2.authoritative_event'))
        rows = history.map(transitionRow);
      else if (
        sql.includes('from world_v2.inventory_posting') ||
        sql.includes('from world_v2.financial_posting_batch')
      )
        rows = [];
      else if (sql.includes('select command_id from world_v2.command_receipt'))
        rows = history.map((v) => ({ command_id: v.command.commandId }));
      else if (sql.includes('from world_v2.command_receipt'))
        rows = history
          .filter((v) => v.command.commandId === parameters[1])
          .map(receiptRow);
      else if (sql.includes('from world_v2.command_submission'))
        rows = sql.includes('command_actor_id')
          ? [
              transitionRow(
                committedPlan(command(), values.state, values.facts),
              ),
            ]
          : [{ command_id: command().commandId }];
      else if (sql.includes('from world_v2.world_writer_lease'))
        rows = [
          {
            world_id: wid,
            holder_id: 'WORKER_SOCIAL',
            fencing_token: '1',
            acquired_at_real: at,
            renewed_at_real: at,
            lease_expires_at_real: '2026-10-25T01:00:00.000Z',
          },
        ];
      else if (sql.includes('from world_v2.command_queue'))
        rows = [
          {
            command_type: command().commandType,
            authority_kind: 'DISCRETIONARY_USER',
            queue_state: 'CLAIMED',
            available_at_sim_time: '10000',
            claimed_by: 'WORKER_SOCIAL',
            claim_fencing_token: '1',
          },
        ];
      else throw new Error('Unexpected protocol SQL');
      return { rows: rows as Row[], rowCount: rows.length };
    },
  };
  const database: SqlDatabase = {
    query: executor.query,
    transaction: async (fn) => fn(executor),
  };
  const canonicalPrefix = () =>
    history.map((v) => ({
      command: v.command,
      transition: v.transition,
      inventoryPostings: [],
      financialPostingBatches: [],
      receipt: v.receipt,
    }));
  function snapshot(request: Readonly<SocialOperatingSnapshotRequest>) {
    const sorted = [...originals].sort((a, b) =>
      String(a.recordId) < String(b.recordId)
        ? -1
        : String(a.recordId) === String(b.recordId)
          ? Number(BigInt(String(a.revision)) - BigInt(String(b.revision)))
          : 1,
    );
    const revisions = sorted.map((r) => ({
      recordId: r.recordId,
      revision: r.revision,
      payloadHash: hash(r),
      role: r.role,
      fieldPaths: r.fieldPaths,
      revocationRevision: r.revokedAt === null ? null : r.revision,
    }));
    const selected = (path: string) =>
      sorted
        .filter(
          (r) =>
            (r.fieldPaths as string[]).includes(path) &&
            r.role !== 'CURRENT_ELIGIBILITY',
        )
        .at(-1)!;
    const current = selected('/currentReadFacts/offer').value as JsonRow;
    const graph = {
      schemaVersion: 'SOCIAL_RESOLVED_SOURCE_INPUT_V3',
      scope: {
        worldId: wid,
        countryId: cid,
        commandId: request.commandBinding.commandId,
        commandFingerprint: request.commandBinding.commandFingerprint,
        headWorldVersion: request.publicationHead.worldVersion,
        headEventSequence: request.publicationHead.eventSequence,
        simTime: request.commandBinding.simTime,
      },
      admittedGenesis: {
        openingSeedId: seed.seedId,
        openingSeedFingerprint: seed.fingerprint,
        modelVersion: seed.replayBinding.modelVersion,
        replayBinding: seed.replayBinding,
        socialSourceId: source.sourceId,
        socialSourcePayloadHash: source.payloadHash,
        semanticRevision: 'SOCIAL_SOURCE_V3',
        adoptionBindingRef: sourceBinding.ownerAdoptionRef,
        state: values.state,
      },
      currentReadFacts: { ...current, simTime: request.commandBinding.simTime },
      historyCoverage: {
        openingVersion: '0',
        heldHead: {
          worldVersion: request.publicationHead.worldVersion,
          eventSequence: request.publicationHead.eventSequence,
        },
        taxonomyRevision: 'SOCIAL_SOURCE_EFFECTS_V1',
        completePrefixBinding: hash({
          worldId: wid,
          seedFingerprint: seed.fingerprint,
          transitions: canonicalPrefix(),
        }),
        sourceRevisionSet: revisions,
      },
      sourceWitnesses: SOCIAL_SOURCE_MATERIAL_PATHS.map((fieldPath) => {
        const r = selected(fieldPath),
          eff = r.effectivity as JsonRow;
        return {
          fieldPath,
          sourceId: source.sourceId,
          sourceRevision: '1',
          locator: source.locator,
          payloadHash: hash(r),
          pointer:
            fieldPath === '/physicalAttemptEnvelope'
              ? '/value'
              : '/value/' + fieldPath.split('/').at(-1),
          effectiveBindingRef: 'TEST_ONLY_EFFECTIVE',
          adoptionOrCommitBindingRef: sourceBinding.ownerAdoptionRef,
          role: r.role,
          effectiveFromSimTime: eff.fromSimTime,
          effectiveUntilSimTime: eff.untilSimTime,
          predecessorRevision: r.predecessorRevision,
          supersededByRevision: r.supersededByRevision,
          revokedByRevision: r.revokedAt === null ? null : r.revision,
        };
      }),
      physicalAttemptEnvelope: {
        ...values.body,
        headWorldVersion: request.publicationHead.worldVersion,
        headEventSequence: request.publicationHead.eventSequence,
      },
    };
    const records = sorted.map((r) => ({
      recordId: String(r.recordId),
      revision: String(r.revision),
      bytes: new TextEncoder().encode(canonicalSerialize(r)),
    }));
    const content = {
      manifestId: 'TEST_ONLY_MANIFEST',
      revision: '1',
      purpose: request.purpose,
      publicationHead: request.publicationHead,
      commandBinding: request.commandBinding,
      entries: records.map((r, i) => ({
        recordId: r.recordId,
        revision: r.revision,
        rawByteLength: String(r.bytes.length),
        rawSHA256: createHash('sha256').update(r.bytes).digest('hex'),
        role: sorted[i]!.role,
        fieldPaths: sorted[i]!.fieldPaths,
      })),
    };
    return {
      schemaVersion: 'social-operating-custodied-snapshot-v1',
      publicationHead: request.publicationHead,
      worldBinding: request.worldBinding,
      sourceAuthority: authority,
      manifest: {
        ...content,
        contentFingerprint: hash({
          schemaVersion: 'SOCIAL_OPERATING_ORIGINAL_MANIFEST_CONTENT_V1',
          ...content,
        }),
      },
      graphBytes: canonicalSerialize(graph),
      records,
    };
  }
  let transform = (s: ReturnType<typeof snapshot>) => s;
  let calls = 0;
  const custody: SocialOperatingCustodyPort = {
    async withSnapshotFrom(ex, request, consume) {
      expect(ex).toBe(executor);
      expect(request.requiredMaterialPaths).toEqual(
        SOCIAL_SOURCE_MATERIAL_PATHS,
      );
      calls++;
      return consume(transform(snapshot(request)));
    },
  };
  const reader = createSocialEmploymentRuntimeSnapshotReader({
    mode: 'TEST_ONLY_LOCAL',
    database,
    sha256Hex: digest,
    custody,
  });
  const input = (c = command()) => ({
    transaction: executor,
    command: c,
    headWorldVersion: String(history.length),
    headEventSequence: String(history.length),
    observedAtReal: at,
  });
  return {
    reader,
    executor,
    database,
    custody,
    queries,
    values,
    seed,
    history,
    snapshot,
    input,
    originals: () => originals,
    setOriginals: (rows: JsonRow[]) => {
      originals = rows;
    },
    calls: () => calls,
    mutateSnapshot: (fn: typeof transform) => {
      transform = fn;
    },
  };
}
function committedPlan(
  c: CanonicalCommand,
  state: SocialEmploymentServiceState,
  facts: SocialEmploymentReadFacts,
) {
  const operation = prepareSocialEmploymentServiceOperation({
    command: c,
    state,
    readFacts: facts,
    sha256Hex: digest,
  });
  const after = String(BigInt(c.expectedWorldVersion!) + 1n);
  const event = parseAuthoritativeEvent(
    {
      schemaVersion: EVENT_SCHEMA_VERSION,
      eventId: `SOCIAL_EVENT_${c.commandId}`,
      eventType:
        c.commandType === SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND
          ? SOCIAL_SERVICE_PLAN_EVENT
          : SOCIAL_JOB_MATCH_EVENT,
      worldId: c.worldId,
      causationCommandId: c.commandId,
      correlationId: c.correlationId,
      worldVersion: after,
      sequence: after,
      simTime: c.simTime.toCanonicalValue(),
      recordedAtReal: at,
      correctsEventId: null,
      payload: operation.eventPayload,
    },
    digest,
  );
  const transition = createAuthoritativeTransition({
    command: c,
    worldVersionBefore: c.expectedWorldVersion!,
    worldVersionAfter: after,
    events: [event],
  });
  const receipt = createFinalCommandReceipt({
    command: c,
    outcome: 'COMMITTED',
    reasonCode: null,
    transition,
    simTime: c.simTime,
    recordedAtReal: at,
  });
  return { command: c, event, transition, receipt, state: operation.state };
}
function transitionRow(v: ReturnType<typeof committedPlan>) {
  const c = v.command,
    e = v.event;
  return {
    command_actor_id: c.actorId,
    command_auth_subject: c.authSubject,
    command_canonical_payload: c.canonicalPayload,
    command_country_id: c.countryId,
    command_expected_world_version: c.expectedWorldVersion,
    command_fingerprint: c.fingerprint,
    command_id: c.commandId,
    command_idempotency_key: c.idempotencyKey,
    command_office_id: c.officeId,
    command_payload_sha256: c.payloadHash,
    command_schema_version: c.schemaVersion,
    command_sim_time: c.simTime.toCanonicalValue(),
    command_submitted_at_real: c.submittedAtReal,
    command_type: c.commandType,
    command_world_id: c.worldId,
    command_correlation_id: c.correlationId,
    correlation_id: e.correlationId,
    event_canonical_payload: e.canonicalPayload,
    event_causation_command_id: e.causationCommandId,
    event_corrects_event_id: e.correctsEventId,
    event_fingerprint: e.fingerprint,
    event_id: e.eventId,
    event_payload_sha256: e.payloadHash,
    event_recorded_at_real: e.recordedAtReal,
    event_schema_version: e.schemaVersion,
    event_sequence: e.sequence,
    event_sim_time: e.simTime.toCanonicalValue(),
    event_type: e.eventType,
    event_world_id: e.worldId,
    event_world_version: e.worldVersion,
  };
}
function receiptRow(v: ReturnType<typeof committedPlan>) {
  const r = v.receipt;
  return {
    schema_version: r.schemaVersion,
    world_id: r.worldId,
    command_id: r.commandId,
    idempotency_key: r.idempotencyKey,
    command_fingerprint: r.commandFingerprint,
    outcome: r.outcome,
    reason_code: r.reasonCode,
    transition_id: r.transitionId,
    world_version_before: r.worldVersionBefore,
    world_version_after: r.worldVersionAfter,
    sim_time: r.simTime.toCanonicalValue(),
    event_ids: canonicalSerialize(r.eventIds),
    recorded_at_real: r.recordedAtReal,
  };
}

async function existingNonReadyOpeningAdoption() {
  // Reuse the existing genuine fixed-source consumer solely for the constructor's
  // NOT_READY opening record. It does not admit these synthetic operating facts.
  const root = path.resolve(import.meta.dirname, '../..');
  const read = (name: string) => readFile(path.join(root, name), 'utf8');
  const mappingBytes = await read(
    'docs/reports/world-connection/C_OFFICIAL_WORLD_OPENING_MAPPING.json',
  );
  const mapping = JSON.parse(mappingBytes) as {
    source: { dataFiles: Record<string, unknown> };
  };
  const datasets = Object.fromEntries(
    await Promise.all(
      Object.keys(mapping.source.dataFiles).map(async (name) => [
        name,
        await read(`artifacts/world-balanced-candidate-v1/${name}`),
      ]),
    ),
  );
  const inspected = inspectOfficialOpeningDecisionSource({
    mappingBytes,
    datasets,
    checksumsBytes: await read(
      'artifacts/world-balanced-candidate-v1/CHECKSUMS.json',
    ),
    coverageBytes: await read(
      'docs/reports/world-connection/C_OFFICIAL_WORLD_COMPLETE_COVERAGE.json',
    ),
    proposalBytes: await read(
      'artifacts/E_OPENING_SEMANTIC_MAPPING_PROPOSAL_2026_10_07.md',
    ),
  });
  if (!inspected.source) throw new Error('Existing opening inspection failed');
  return createOfficialLabourSocialOpeningAdoption({
    source: inspected.source,
    mappingBytes,
    ownerOriginalBytes: await read(
      'docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISIONS.original.md',
    ),
    ownerReceiptBytes: await read(
      'docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISION_RECEIPT.json',
    ),
    datasets: {
      employment: datasets['data/employment.json']!,
      'population-services': datasets['data/population-services.json']!,
      regions: datasets['data/regions.json']!,
      facilities: datasets['data/facilities.json']!,
    },
  });
}

describe('Social real reader mechanism over synthetic originals, never authority', () => {
  it.each([
    ['TEST_GENESIS', 'worldVersion'],
    ['TEST_GENESIS', 'eventSequence'],
    ['TEST_PHYSICAL', 'worldVersion'],
    ['TEST_PHYSICAL', 'eventSequence'],
  ])(
    'rejects malformed historical revocation frontier %s %s',
    async (id, field) => {
      const f = fixture(),
        rows = clone(f.originals()),
        original = rows.find((r) => r.recordId === id)!;
      original.revokedAt = {
        worldVersion: '0',
        eventSequence: '0',
        [field!]: 'BAD',
      };
      f.setOriginals(rows);
      await expect(f.reader.readFrom(f.input())).rejects.toThrow(
        'canonical integer',
      );
    },
  );
  it.each(['future', 'expired'])(
    'rejects malformed historical revocation frontier-adjacent %s effectivity head',
    async (kind) => {
      const f = fixture(),
        rows = clone(f.originals()),
        original = rows.find((r) => r.recordId === 'TEST_GENESIS')!;
      original.effectivity = {
        ...(original.effectivity as JsonRow),
        fromSimTime: kind === 'future' ? '20000' : '0',
        untilSimTime: kind === 'expired' ? '5000' : null,
        fromHead: { worldVersion: 'BAD', eventSequence: '0' },
      };
      f.setOriginals(rows);
      await expect(f.reader.readFrom(f.input())).rejects.toThrow(
        'canonical integer',
      );
    },
  );
  it('retains canonical historical revocation frontier without retroactively invalidating PLAN replay', async () => {
    const f = fixture(),
      committed = committedPlan(command(), f.values.state, f.values.facts);
    f.history.push(committed);
    const rows = clone(f.originals());
    for (const r of rows)
      if (
        r.role === 'GENESIS_HISTORICAL' ||
        r.role === 'PHYSICAL_ORIGINAL_BODY'
      )
        r.revokedAt = { worldVersion: '1', eventSequence: '1' };
    f.setOriginals(rows);
    const result = await f.reader.readFrom(f.input(command(2, '1')));
    if (result.status !== 'REPLAYED')
      throw new Error('Canonical historical revocation must retain history');
    expect(result.state).toEqual(committed.state);
    expect(result.state.plans).toHaveLength(1);
  });
  it('passes the real issued binding through existing preclaim and postclaim source/Atomic draft', async () => {
    const f = fixture(),
      c = command();
    const openingAdoption = await existingNonReadyOpeningAdoption();
    const composition = createManualOfficeCommandComposition({
      command: c,
      database: f.database,
      workerId: 'WORKER_SOCIAL',
      sha256Hex: digest,
      readers: {
        social: {
          mode: 'TEST_ONLY_LOCAL',
          openingAdoption,
          snapshotReader: f.reader,
        },
      },
    });
    if (!composition) throw new Error('Expected existing Social composition');
    await composition.assertSourceBeforeClaim(at);
    const source = new SqlSocialJobMatchCandidateSource({
      mode: 'TEST_ONLY_LOCAL',
      database: f.database,
      workerId: 'WORKER_SOCIAL',
      sha256Hex: digest,
      openingAdoption,
      snapshotReader: f.reader,
      automaticAuthority: null,
    });
    const preparation = await source.load({ command: c, observedAtReal: at });
    const binding = preparation.governingSourceReadBinding;
    expect(binding).not.toBe(null);
    expect(binding).toMatchObject({
      stateHash: hash(preparation.state),
      purpose: 'SOCIAL_EMPLOYMENT_SERVICE_PLAN_SOURCE_EVALUATION_V1',
    });
    const draft = prepareSocialJobMatchAtomicDraft({
      preparation,
      sha256Hex: digest,
    });
    expect(draft).toMatchObject({ governingSourceReadBinding: binding });
    expect(draft.transition.events[0]!.canonicalPayload).toBe(
      committedPlan(c, f.values.state, f.values.facts).event.canonicalPayload,
    );
    expect(f.calls()).toBe(2);
  });
  it('returns the existing missing union only for genuinely absent supplied input', async () => {
    const f = fixture();
    const reader = createSocialEmploymentRuntimeSnapshotReader({
      mode: 'TEST_ONLY_LOCAL',
      database: f.database,
      sha256Hex: digest,
      custody: {
        async withSnapshotFrom(_ex, _request, consume) {
          return consume(null);
        },
      },
    });
    expect(await reader.readFrom(f.input())).toEqual({
      status: 'MISSING_OPERATING_STATE',
    });
    expect(
      readIssuedSocialGoverningSourceBinding(reader, {
        status: 'MISSING_OPERATING_STATE',
      }),
    ).toBe(null);
  });
  it('captures bytes before the provider can mutate its buffers and never opens a nested transaction', async () => {
    const f = fixture();
    Reflect.set(f.database, 'transaction', () => {
      throw new Error('Nested transaction forbidden');
    });
    const reader = createSocialEmploymentRuntimeSnapshotReader({
      mode: 'TEST_ONLY_LOCAL',
      database: f.database,
      sha256Hex: digest,
      custody: {
        async withSnapshotFrom(_ex, request, consume) {
          const original = f.snapshot(request),
            result = consume(original);
          original.records.forEach((r) => r.bytes.fill(0));
          original.graphBytes = '{}';
          return result;
        },
      },
    });
    const result = await reader.readFrom(f.input());
    expect(result.status).toBe('REPLAYED');
  });
  it('rejects a provider that skips or repeats its scoped callback', async () => {
    const f = fixture();
    const skipped = {
      withSnapshotFrom: async () => ({ status: 'MISSING_OPERATING_STATE' }),
    } as unknown as SocialOperatingCustodyPort;
    const reader = createSocialEmploymentRuntimeSnapshotReader({
      mode: 'TEST_ONLY_LOCAL',
      database: f.database,
      sha256Hex: digest,
      custody: skipped,
    });
    await expect(reader.readFrom(f.input())).rejects.toThrow();
    const repeated = createSocialEmploymentRuntimeSnapshotReader({
      mode: 'TEST_ONLY_LOCAL',
      database: f.database,
      sha256Hex: digest,
      custody: {
        async withSnapshotFrom(_ex, request, consume) {
          await consume(f.snapshot(request));
          return consume(f.snapshot(request));
        },
      },
    });
    await expect(repeated.readFrom(f.input())).rejects.toThrow();
  });
  it('expires the callback on settlement and rejects accessor input before invocation', async () => {
    const f = fixture();
    let escaped: ((snapshot: unknown) => Promise<unknown>) | undefined;
    const reader = createSocialEmploymentRuntimeSnapshotReader({
      mode: 'TEST_ONLY_LOCAL',
      database: f.database,
      sha256Hex: digest,
      custody: {
        async withSnapshotFrom(_ex, request, consume) {
          escaped = consume;
          return consume(f.snapshot(request));
        },
      },
    });
    await reader.readFrom(f.input());
    await expect(escaped!(null)).rejects.toThrow('in scope');
    let invoked = 0;
    f.mutateSnapshot((s) => {
      Object.defineProperty(s.records, '0', {
        enumerable: true,
        configurable: true,
        get() {
          invoked++;
          throw new Error('Must not invoke');
        },
      });
      return s;
    });
    await expect(f.reader.readFrom(f.input())).rejects.toThrow('inert array');
    expect(invoked).toBe(0);
  });
  it.each(['missingPredecessor', 'disconnectedRoot', 'fork'])(
    'rejects %s in the complete revision chain',
    async (kind) => {
      const f = fixture(),
        old = f.originals().find((r) => r.recordId === 'TEST_CURRENT')!;
      const successor = {
        ...clone(old),
        revision: '2',
        predecessorRevision:
          kind === 'missingPredecessor'
            ? '9'
            : kind === 'disconnectedRoot'
              ? null
              : '1',
      };
      f.setOriginals([
        ...f.originals(),
        successor,
        ...(kind === 'fork'
          ? [{ ...clone(old), revision: '10', predecessorRevision: '1' }]
          : []),
      ]);
      await expect(f.reader.readFrom(f.input())).rejects.toThrow();
    },
  );
  it('replays a nonempty actual Core opening and issues owned TEST_ONLY data plus inert binding', async () => {
    const f = fixture(),
      result = await f.reader.readFrom(f.input());
    expect(result.status).toBe('REPLAYED');
    if (result.status !== 'REPLAYED') throw new Error('Expected replay');
    expect(result.provenance).toBe('TEST_ONLY');
    expect(result.state.labour.positions.length).toBe(3);
    expect(result.stateHash).toBe(hash(result.state));
    expect(result.readFactsHash).toBe(hash(result.readFacts));
    const binding = readIssuedSocialGoverningSourceBinding(f.reader, result);
    expect(binding?.materialBindings).toHaveLength(7);
    expect(binding?.sourceRevisions).toHaveLength(4);
    expect(binding?.sourceManifest.contentFingerprint).toBeDefined();
    expect(
      readIssuedSocialGoverningSourceBinding(f.reader, clone(result)),
    ).toBe(null);
    expect(
      readIssuedSocialGoverningSourceBinding(fixture().reader, result),
    ).toBe(null);
    expect(Object.isFrozen(result.state.labour.positions)).toBe(true);
    expect(f.queries.some((q) => q.includes('command_receipt'))).toBe(true);
  });
  it('replays the complete committed PLAN prefix and keeps physical identity at a new audit head', async () => {
    const f = fixture(),
      before = await f.reader.readFrom(f.input());
    const first = committedPlan(command(), f.values.state, f.values.facts);
    f.history.push(first);
    const after = await f.reader.readFrom(f.input(command(2, '1')));
    if (before.status !== 'REPLAYED' || after.status !== 'REPLAYED')
      throw new Error('Expected replay');
    expect(after.state).toEqual(first.state);
    expect(after.headWorldVersion).toBe('1');
    expect(after.state.plans).toHaveLength(1);
    const a = readIssuedSocialGoverningSourceBinding(f.reader, before)!,
      b = readIssuedSocialGoverningSourceBinding(f.reader, after)!;
    expect(a.originalPhysicalBodyBindings).toEqual(
      b.originalPhysicalBodyBindings,
    );
    expect(a.historyBinding.receiptSetFingerprint).not.toBe(
      b.historyBinding.receiptSetFingerprint,
    );
  });
  it('never drops a canonically valid unknown event from the full committed prefix', async () => {
    const f = fixture(),
      first = committedPlan(command(), f.values.state, f.values.facts),
      c = first.command,
      e = first.event;
    const {
      canonicalPayload,
      payloadHash: _payloadHash,
      fingerprint: _fingerprint,
      ...eventIntent
    } = e;
    void _payloadHash;
    void _fingerprint;
    const event = parseAuthoritativeEvent(
      {
        ...eventIntent,
        simTime: e.simTime.toCanonicalValue(),
        eventType: 'TEST_UNREGISTERED_EFFECT',
        payload: JSON.parse(canonicalPayload) as unknown,
      },
      digest,
    );
    const transition = createAuthoritativeTransition({
      command: c,
      worldVersionBefore: '0',
      worldVersionAfter: '1',
      events: [event],
    });
    const receipt = createFinalCommandReceipt({
      command: c,
      outcome: 'COMMITTED',
      reasonCode: null,
      transition,
      simTime: c.simTime,
      recordedAtReal: at,
    });
    f.history.push({ ...first, event, transition, receipt });
    await expect(f.reader.readFrom(f.input(command(2, '1')))).rejects.toThrow(
      'reducer',
    );
  });
  it('retains the original day-body version across a legal identical-value wrapper successor', async () => {
    const f = fixture(),
      before = await f.reader.readFrom(f.input());
    f.history.push(committedPlan(command(), f.values.state, f.values.facts));
    const original = f.originals().find((r) => r.recordId === 'TEST_PHYSICAL')!;
    f.setOriginals([
      ...f.originals(),
      { ...clone(original), revision: '2', predecessorRevision: '1' },
    ]);
    const after = await f.reader.readFrom(f.input(command(2, '1')));
    const first = readIssuedSocialGoverningSourceBinding(f.reader, before)!,
      second = readIssuedSocialGoverningSourceBinding(f.reader, after)!;
    expect(second.originalPhysicalBodyBindings).toEqual(
      first.originalPhysicalBodyBindings,
    );
    expect(
      second.materialBindings.find(
        (b) => b.fieldPath === '/physicalAttemptEnvelope',
      )?.recordRevision,
    ).toBe('2');
  });
  it('replays committed PLAN and MATCH with historical facts while using separately supplied next-day facts/body', async () => {
    const f = fixture(),
      plan = command(),
      planned = committedPlan(plan, f.values.state, f.values.facts);
    f.history.push(planned);
    const due = parseCanonicalCommand(
      {
        schemaVersion: COMMAND_SCHEMA_VERSION,
        actorId: 'ACTOR_AUTOMATIC',
        authSubject: '11111111-1111-4111-8111-111111111111',
        commandId: 'TEST_HISTORICAL_MATCH',
        commandType: SOCIAL_JOB_MATCH_DUE_COMMAND,
        correlationId: 'TEST_TRACE',
        countryId: cid,
        worldId: wid,
        officeId: null,
        expectedWorldVersion: '1',
        idempotencyKey: 'TEST_HISTORICAL_MATCH_IDEM',
        simTime: '20000',
        submittedAtReal: at,
        payload: {
          schemaVersion: 'social-job-match-settlement-v1',
          planCommandId: plan.commandId,
          planFingerprint: plan.fingerprint,
          dueDayIndex: '1',
          ruleVersion: SOCIAL_JOB_MATCH_RULE_VERSION,
        },
      },
      digest,
    );
    const matched = committedPlan(due, planned.state, {
      ...f.values.facts,
      boundary: createE01DailyBoundary('1'),
      simTime: '20000',
    });
    f.history.push(matched);
    const oldCurrent = f
        .originals()
        .find((r) => r.recordId === 'TEST_CURRENT')!,
      oldBody = f.originals().find((r) => r.recordId === 'TEST_PHYSICAL')!,
      oldEligibility = f
        .originals()
        .find((r) => r.recordId === 'TEST_ELIGIBILITY')!;
    f.setOriginals([
      ...f.originals().filter((r) => r !== oldEligibility),
      {
        ...clone(oldEligibility),
        revokedAt: { worldVersion: '2', eventSequence: '2' },
      },
      {
        ...clone(oldCurrent),
        revision: '2',
        predecessorRevision: '1',
        value: f.values.sourceValue.currentDay1,
        originProof: {
          ...(oldCurrent.originProof as JsonRow),
          pointer: '/currentDay1',
        },
      },
      ...[oldBody, oldEligibility].map((r) => ({
        ...clone(r),
        recordId: `${String(r.recordId)}_DAY2`,
        value: f.values.sourceValue.physicalDay2,
        originProof: {
          ...(r.originProof as JsonRow),
          pointer: '/physicalDay2',
        },
      })),
    ]);
    f.mutateSnapshot((s) => {
      const graph = JSON.parse(s.graphBytes) as JsonRow;
      graph.physicalAttemptEnvelope = {
        ...f.values.sourceValue.physicalDay2,
        headWorldVersion: '2',
        headEventSequence: '2',
      };
      return { ...s, graphBytes: canonicalSerialize(graph) };
    });
    const result = await f.reader.readFrom(
      f.input(command(3, '2', '20000', '2')),
    );
    if (result.status !== 'REPLAYED') throw new Error('Expected full replay');
    expect(result.state).toEqual(matched.state);
    expect(result.state.plans[0]!.state).toBe('SETTLED');
    expect(result.readFacts.boundary.dayIndex).toBe('1');
    expect(
      readIssuedSocialGoverningSourceBinding(f.reader, result)
        ?.originalPhysicalBodyBindings,
    ).toHaveLength(2);
  });
  it('rejects a genuinely published alternative recipe for the same original day/group', async () => {
    const f = fixture(),
      original = f.originals().find((r) => r.recordId === 'TEST_PHYSICAL')!;
    f.setOriginals([
      ...f.originals(),
      {
        ...clone(original),
        recordId: 'TEST_PHYSICAL_ALTERNATIVE',
        value: f.values.sourceValue.physicalAlternative,
        originProof: {
          ...(original.originProof as JsonRow),
          pointer: '/physicalAlternative',
        },
      },
    ]);
    f.mutateSnapshot((s) => {
      const g = JSON.parse(s.graphBytes) as JsonRow;
      g.physicalAttemptEnvelope = {
        ...f.values.sourceValue.physicalAlternative,
        headWorldVersion: '0',
        headEventSequence: '0',
      };
      return { ...s, graphBytes: canonicalSerialize(g) };
    });
    await expect(f.reader.readFrom(f.input())).rejects.toThrow(
      'replacement/alias',
    );
  });
  it('selects a genuine current successor independently of historical event readFacts', async () => {
    const f = fixture();
    f.history.push(committedPlan(command(), f.values.state, f.values.facts));
    const old = f.originals().find((r) => r.recordId === 'TEST_CURRENT')!;
    const successor = {
      ...clone(old),
      revision: '2',
      predecessorRevision: '1',
      value: f.values.sourceValue.currentRevised,
      originProof: {
        ...(old.originProof as JsonRow),
        pointer: '/currentRevised',
      },
    };
    f.setOriginals([...f.originals(), successor]);
    const result = await f.reader.readFrom(f.input(command(2, '1')));
    if (result.status !== 'REPLAYED') throw new Error('Expected replay');
    expect(result.readFacts.offer.offerVersion).toBe('TEST_OFFER_V2');
    expect(
      readIssuedSocialGoverningSourceBinding(
        f.reader,
        result,
      )?.sourceRevisions.filter((r) => r.recordId === 'TEST_CURRENT'),
    ).toHaveLength(2);
  });
  it.each(['revoked', 'expired'])(
    'does not fall back from a current %s successor to an older active row',
    async (kind) => {
      const f = fixture(),
        old = f.originals().find((r) => r.recordId === 'TEST_CURRENT')!;
      f.setOriginals([
        ...f.originals(),
        {
          ...clone(old),
          revision: '2',
          predecessorRevision: '1',
          ...(kind === 'revoked'
            ? { revokedAt: { worldVersion: '0', eventSequence: '0' } }
            : {
                effectivity: {
                  ...(old.effectivity as JsonRow),
                  untilSimTime: '5000',
                },
              }),
        },
      ]);
      expect(await f.reader.readFrom(f.input())).toEqual({
        status: 'MISSING_OPERATING_STATE',
      });
    },
  );
  it.each([
    'rawBytes',
    'manifest',
    'graphValue',
    'sourceRevisionSet',
    'head',
    'sourceOrigin',
    'physicalReprice',
    'unknownEffect',
  ])(
    'rejects independently changed %s rather than returning an admitted snapshot',
    async (kind) => {
      const f = fixture();
      if (kind === 'sourceOrigin') {
        const rows = clone(f.originals());
        (rows[0]!.originProof as JsonRow).pointer = '/physicalBody';
        f.setOriginals(rows);
      } else if (kind === 'physicalReprice') {
        const rows = clone(f.originals()),
          physical = rows.find((r) => r.recordId === 'TEST_PHYSICAL')!;
        ((physical.value as JsonRow).stages as JsonRow[])[0]!.availableMinutes =
          '25';
        f.setOriginals(rows);
      } else {
        f.mutateSnapshot((s) => {
          if (kind === 'rawBytes') s.records[0]!.bytes[0] = 32;
          if (kind === 'manifest') s.manifest.entries.pop();
          if (kind === 'head')
            return {
              ...s,
              publicationHead: { ...s.publicationHead, worldVersion: '1' },
            };
          if (
            ['graphValue', 'sourceRevisionSet', 'unknownEffect'].includes(kind)
          ) {
            const g = JSON.parse(s.graphBytes) as JsonRow;
            if (kind === 'graphValue')
              ((g.currentReadFacts as JsonRow).offer as JsonRow).amount = '99';
            if (kind === 'sourceRevisionSet')
              (g.historyCoverage as JsonRow).sourceRevisionSet = [];
            if (kind === 'unknownEffect')
              (g.historyCoverage as JsonRow).taxonomyRevision =
                'UNKNOWN_TAXONOMY';
            return { ...s, graphBytes: canonicalSerialize(g) };
          }
          return s;
        });
      }
      await expect(f.reader.readFrom(f.input())).rejects.toThrow();
    },
  );
  it('re-resolves originals at commit and compares the actual recomputed Core PLAN payload', async () => {
    const f = fixture(),
      c = command(),
      loaded = await f.reader.readFrom(f.input(c));
    const binding = readIssuedSocialGoverningSourceBinding(f.reader, loaded)!;
    const guard = createSocialEmploymentCommitSourceGuard(f.reader),
      proposed = committedPlan(c, f.values.state, f.values.facts);
    const request = {
      phase: 'BEFORE_EVENTS' as const,
      purpose: 'SOCIAL_EMPLOYMENT_SERVICE_PLAN_SOURCE_EVALUATION_V1' as const,
      command: c,
      transition: proposed.transition,
      currentHead: { worldId: wid, worldVersion: '0', eventSequence: '0' },
      readBinding: binding,
      observedAtReal: at,
    };
    const audit = await guard.assertCurrentFrom(f.executor, request);
    expect(audit.status).toBe('CURRENT_SOURCE_RECHECKED_NOT_AUTHORITY');
    expect(f.calls()).toBe(2);
    expect(audit.sourceManifestFingerprint).not.toBe(
      binding.sourceManifest.contentFingerprint,
    );
    const payload = JSON.parse(proposed.event.canonicalPayload) as JsonRow;
    payload.afterStateHash = hash({ wrong: 'SEMANTIC_STATE' });
    const wrongEvent = parseAuthoritativeEvent(
      {
        schemaVersion: proposed.event.schemaVersion,
        eventId: proposed.event.eventId,
        eventType: proposed.event.eventType,
        worldId: wid,
        causationCommandId: c.commandId,
        correlationId: c.correlationId,
        worldVersion: '1',
        sequence: '1',
        simTime: '10000',
        recordedAtReal: at,
        correctsEventId: null,
        payload,
      },
      digest,
    );
    const wrongTransition = createAuthoritativeTransition({
      command: c,
      worldVersionBefore: '0',
      worldVersionAfter: '1',
      events: [wrongEvent],
    });
    await expect(
      guard.assertCurrentFrom(f.executor, {
        ...request,
        transition: wrongTransition,
      }),
    ).rejects.toThrow();
    const rows = clone(f.originals()),
      current = rows.find((r) => r.recordId === 'TEST_CURRENT')!;
    current.revokedAt = { worldVersion: '0', eventSequence: '0' };
    f.setOriginals(rows);
    await expect(
      guard.assertCurrentFrom(f.executor, request),
    ).rejects.toThrow();
  });
});
