import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDurableCommandConsumptionPreparation } from '../../apps/world-worker/src/preparation/durable-command-consumption.js';
import { captainTestOnlyCommand } from '../support/g-dispatch-captain-test-only-fixture.js';
import {
  COMMAND_SCHEMA_VERSION,
  CURRENT_REPLAY_BINDING,
  EVENT_SCHEMA_VERSION,
  OPENING_SEED_SCHEMA_VERSION,
  OPENING_SOURCE_SCHEMA_VERSION,
  SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
  SOCIAL_SERVICE_PLAN_EVENT,
  SOCIAL_JOB_MATCH_EVENT,
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
import { createSocialEmploymentRuntimeSnapshotReader } from '../../apps/world-worker/src/persistence/social-employment-runtime-snapshot-reader.js';
import {
  SOCIAL_SOURCE_MATERIAL_PATHS,
  type SocialOperatingCustodyPort,
  type SocialOperatingSnapshotRequest,
} from '../../apps/world-worker/src/persistence/social-employment-source-input.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';
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
  let queryRoute:
    | ((
        sql: string,
        parameters: readonly unknown[],
      ) => readonly unknown[] | undefined)
    | undefined;
  const { fingerprint: _fingerprint, ...seedIntent } = seed;
  void _fingerprint;
  const executor: SqlExecutor = {
    async query<Row>(sql: string, parameters = []) {
      queries.push(sql);
      const routed = queryRoute?.(sql, parameters);
      if (routed !== undefined)
        return { rows: routed as Row[], rowCount: routed.length };
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
  let transform: (s: ReturnType<typeof snapshot>) => unknown = (s) => s;
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
    setQueryRoute: (route: typeof queryRoute) => {
      queryRoute = route;
    },
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

let openingAdoptionOnce:
  ReturnType<typeof existingNonReadyOpeningAdoption> | undefined;

/** Routes real consumer SQL into the existing explicitly synthetic source fixture.
 * No production registration, source grant or native transaction proof. */
async function wired(
  input: {
    receipt?: boolean;
    legacyMissing?: boolean;
    rejectCommit?: boolean;
  } = {},
) {
  const f = fixture(),
    c = command(),
    proposed = committedPlan(c, f.values.state, f.values.facts);
  let claimed = !!input.receipt;
  const durable = {
    ...transitionRow(proposed),
    actor_id: c.actorId,
    auth_subject: c.authSubject,
    canonical_payload: c.canonicalPayload,
    country_id: c.countryId,
    expected_world_version: c.expectedWorldVersion,
    command_fingerprint: c.fingerprint,
    command_id: c.commandId,
    idempotency_key: c.idempotencyKey,
    office_id: c.officeId,
    payload_sha256: c.payloadHash,
    schema_version: c.schemaVersion,
    sim_time: c.simTime.toCanonicalValue(),
    submitted_at_real: c.submittedAtReal,
    command_type: c.commandType,
    world_id: c.worldId,
    correlation_id: c.correlationId,
  };
  f.setQueryRoute((sql) => {
    if (sql.includes('from world_v2.command_submission')) return [durable];
    if (sql.includes('from world_v2.current_commit_authorization'))
      return [
        {
          auth_subject: c.authSubject,
          world_id: c.worldId,
          country_id: c.countryId,
          office_id: 'SOCIAL',
          capability: 'SOCIAL_LABOUR',
          team_id: 'TEAM_SOCIAL',
          authorization_version: 'REV_SOCIAL',
        },
      ];
    if (sql.includes('from world_v2.command_queue'))
      return [
        {
          command_id: c.commandId,
          command_type: c.commandType,
          authority_kind: 'DISCRETIONARY_USER',
          queue_state: claimed ? 'CLAIMED' : 'PENDING',
          available_at_sim_time: '10000',
          claimed_by: claimed ? 'WORKER_SOCIAL' : null,
          claim_fencing_token: claimed ? '1' : null,
        },
      ];
    if (sql.includes('update world_v2.command_queue')) {
      claimed = true;
      return [{}];
    }
    if (sql.includes('assert_world_writer_commit_guard'))
      return [{ world_version: '0', event_sequence: '0' }];
    if (
      sql.includes('from world_v2.command_receipt') &&
      !sql.includes('select command_id')
    )
      return input.receipt ? [receiptRow(proposed)] : [];
    return undefined;
  });
  if (input.rejectCommit) f.mutateSnapshot((s) => (f.calls() >= 3 ? null : s));
  let legacyReads = 0;
  const snapshotReader = input.legacyMissing
    ? {
        async readFrom() {
          legacyReads++;
          return { status: 'MISSING_OPERATING_STATE' as const };
        },
      }
    : f.reader;
  const adoption = await (openingAdoptionOnce ??=
    existingNonReadyOpeningAdoption());
  const readers = {
    social: {
      mode: input.legacyMissing
        ? ('OFFICIAL_RUNTIME' as const)
        : ('TEST_ONLY_LOCAL' as const),
      openingAdoption: adoption,
      snapshotReader,
    },
  };
  const consumer = createDurableCommandConsumptionPreparation({
    database: f.database,
    workerId: 'WORKER_SOCIAL',
    worldId: wid,
    sha256Hex: digest,
    environment: { ECONMIND_ENV: 'local' },
    clock: {
      nowReal: () => at,
      simTime: async () => c.simTime.toCanonicalValue(),
    },
    officeReaders: readers,
  });
  consumer.startPreparation();
  return {
    f,
    c,
    readers,
    consumer,
    legacyReads: () => legacyReads,
    claimed: () => claimed,
  };
}
describe('manual Social fixed source commit guard wiring', () => {
  it('actual composition to durable execution and repository re-resolves the same G reader before Events', async () => {
    const w = await wired({ rejectCommit: true });
    const result = await w.consumer.consumeOnce();
    expect(result).toMatchObject({
      status: 'BLOCKED',
      reason: 'DURABLE_PRIMITIVE_REJECTED',
      detail: expect.stringContaining(
        'fresh current source unavailable before events',
      ),
    });
    // Preclaim, candidate source, then the NEW repository source check use one
    // concrete G reader/custody. An omitted pass-through would stop at two.
    expect(w.f.calls()).toBe(3);
    expect(w.claimed()).toBe(true);
    expect(
      w.f.queries.some(
        (s) =>
          s.includes('for key share') &&
          s.includes('current_commit_authorization'),
      ),
    ).toBe(true);
    expect(
      w.f.queries.filter((s) =>
        /insert into world_v2\.(?:authoritative_event|command_receipt|inventory_posting|financial_posting_batch)/iu.test(
          s,
        ),
      ),
    ).toEqual([]);
  });
  it('exact receipt recovery never asks a non-G legacy reader for a new guard or source', async () => {
    const w = await wired({ receipt: true, legacyMissing: true });
    expect(await w.consumer.consumeOnce()).toMatchObject({
      status: 'PROCESSED',
      source: 'EXISTING_FINAL',
    });
    expect(w.legacyReads()).toBe(0);
    expect(w.f.calls()).toBe(0);
    expect(
      w.f.queries.some((s) => s.includes('update world_v2.command_queue')),
    ).toBe(false);
  });
  it('legacy official MISSING retains its existing preclaim refusal without probing G private identity', async () => {
    const w = await wired({ legacyMissing: true });
    expect(await w.consumer.consumeOnce()).toMatchObject({
      status: 'BLOCKED',
      reason: 'MANUAL_OFFICE_SOURCE_UNAVAILABLE',
    });
    expect(w.legacyReads()).toBe(1);
    expect(w.claimed()).toBe(false);
    expect(
      w.f.queries.some((s) => s.includes('update world_v2.command_queue')),
    ).toBe(false);
  });
  it('a non-G reader cannot mint G authority through the deferred source port', async () => {
    const w = await wired({ legacyMissing: true });
    const composition = createManualOfficeCommandComposition({
      command: w.c,
      database: w.f.database,
      workerId: 'WORKER_SOCIAL',
      sha256Hex: digest,
      readers: w.readers,
    })!;
    await expect(
      composition.sourceCommitProtectionPort!.assertCurrentFrom(
        w.f.executor,
        {} as never,
      ),
    ).rejects.toThrow('actual concrete G reader');
    expect(w.legacyReads()).toBe(0);
  });
  it('other manual families keep their original factory without a Social source port', () => {
    const composition = createManualOfficeCommandComposition({
      command: captainTestOnlyCommand(),
      database: fixture().database,
      workerId: 'WORKER_SOCIAL',
      sha256Hex: digest,
      readers: {
        captain: {
          async read() {
            throw Error('No source read during construction');
          },
        },
      },
    })!;
    expect(composition.factory).toBeDefined();
    expect(composition.sourceCommitProtectionPort).toBeUndefined();
  });
});
