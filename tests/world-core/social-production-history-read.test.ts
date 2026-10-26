import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  COMMAND_SCHEMA_VERSION,
  createProductionConsumptionPosting,
  inventoryPostingId,
  parseOpeningSeed,
  type InventoryLedgerPosting,
  type FinancialPostingBatch,
  validateSocialEmploymentServiceState,
  SOCIAL_JOB_MATCH_RULE_VERSION,
  createE01DailyBoundary,
  PRODUCTION_SETTLED_EVENT_TYPE,
  bindAuthoritativeTransition,
  CURRENT_REPLAY_BINDING,
  EVENT_SCHEMA_VERSION,
  OPENING_SEED_SCHEMA_VERSION,
  OPENING_SOURCE_SCHEMA_VERSION,
  SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
  SOCIAL_SERVICE_PLAN_EVENT,
  SOCIAL_JOB_MATCH_EVENT,
  canonicalHashInput,
  canonicalSerialize,
  canonicalSha256,
  createAuthoritativeTransition,
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
import { createProductionSchemaFixture } from '../support/production-schema-fixture.js';
import { canonicalSerialize as fixtureSerialize } from '../../packages/core/src/index.js';

// Synthetic, nonempty, mechanism-only original values. The real durable lineage
// reader runs over this SQL protocol fixture; neither native locks, actual source
// authority/adoption nor a production custodian is claimed by these positives.
const digest = (v: string) =>
  createHash('sha256').update(v, 'utf8').digest('hex');
const hash = (v: unknown) => canonicalSha256(canonicalHashInput(v), digest);
const at = '2026-10-25T00:00:00.000Z';
const wid = 'WORLD_PRODUCTION_TEST';
const cid = 'COUNTRY_PRODUCTION_TEST',
  locationId = 'REGION_01_E1';
const skills = ['LOW', 'MEDIUM', 'HIGH'] as const;
type JsonRow = Record<string, unknown>;
function command(
  n = 1,
  version = '0',
  simTime = '10000',
  day = '1',
  selectedCountry = cid,
) {
  return parseCanonicalCommand(
    {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      actorId: 'ACTOR_SOCIAL',
      authSubject: '11111111-1111-4111-8111-111111111111',
      commandId: `TEST_SOCIAL_PLAN_${n}`,
      commandType: SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
      correlationId: 'TEST_TRACE',
      countryId: selectedCountry,
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
function fixture(
  protectedRead?: NonNullable<
    Parameters<
      typeof createSocialEmploymentRuntimeSnapshotReader
    >[0]['industryProtectedRead']
  >,
  production = false,
) {
  const values = initialValues();
  const rawProduction = production
    ? createProductionSchemaFixture()
    : undefined;
  const productionSeed =
    rawProduction === undefined
      ? undefined
      : parseOpeningSeed(
          JSON.parse(fixtureSerialize(rawProduction.seed)) as unknown,
          digest,
        );
  // Independently declared synthetic balance source; the original TEST_FIXTURE
  // is never changed, retagged, adopted or sent to the real durable reader.
  const balanceSource = createOpeningSource(
    {
      schemaVersion: OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: openingSourceId('TEST_ONLY_SOCIAL_PRODUCTION_BALANCES'),
      sourceKind: 'DOCUMENTED_ASSUMPTION',
      locator: 'TEST_ONLY_MIXED_SQL_PROTOCOL_NO_SOURCE_ADMISSION',
      sourceVersion: '1',
      payload: {
        MOCK_SQL_ONLY: true,
        sourceAdmitted: false,
        inventoryEntries: productionSeed?.inventoryEntries ?? [],
        financialBatches: productionSeed?.financialBatches ?? [],
      },
    },
    digest,
  );
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
      sources:
        productionSeed === undefined ? [source] : [source, balanceSource],
      inventoryEntries: (productionSeed?.inventoryEntries ?? []).map((e) => ({
        ...e,
        sourceId: balanceSource.sourceId,
      })),
      financialBatches: (productionSeed?.financialBatches ?? []).map((e) => ({
        ...e,
        sourceId: balanceSource.sourceId,
      })),
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
  const history: (ReturnType<typeof committedPlan> & {
    inventoryPostings?: readonly InventoryLedgerPosting[];
    financialPostingBatches?: readonly FinancialPostingBatch[];
  })[] = [];
  if (rawProduction !== undefined) {
    const rawGroups = [rawProduction.paidLineage, rawProduction.make().lineage];
    for (const raw of rawGroups) {
      // Crossing the source-fixture module boundary by bytes only: the actual D
      // reader below parses Commands/Events and decodes postings through Core.
      const value = JSON.parse(fixtureSerialize(raw)) as JsonRow;
      const c = value.command as JsonRow;
      const intent = (v: JsonRow) =>
        Object.fromEntries(
          Object.entries(v).filter(
            ([key]) =>
              !['canonicalPayload', 'payloadHash', 'fingerprint'].includes(key),
          ),
        );
      const parsed = parseCanonicalCommand(
        { ...intent(c), payload: JSON.parse(String(c.canonicalPayload)) },
        digest,
      );
      const t = value.transition as JsonRow;
      const events = (t.events as JsonRow[]).map((e) =>
        parseAuthoritativeEvent(
          {
            ...intent(e),
            payload: JSON.parse(String(e.canonicalPayload)),
          },
          digest,
        ),
      );
      const transition = createAuthoritativeTransition({
        command: parsed,
        worldVersionBefore: String(t.worldVersionBefore),
        worldVersionAfter: String(t.worldVersionAfter),
        events,
      });
      const receipt = createFinalCommandReceipt({
        command: parsed,
        transition,
        outcome: 'COMMITTED',
        reasonCode: null,
        simTime: parsed.simTime,
        recordedAtReal: at,
      });
      history.push({
        command: parsed,
        event: events[0]!,
        transition,
        receipt,
        state: values.state,
        inventoryPostings: value.inventoryPostings as InventoryLedgerPosting[],
        financialPostingBatches:
          value.financialPostingBatches as FinancialPostingBatch[],
      });
    }
  }
  const queries: string[] = [];
  const rawInventoryRows: unknown[] = [];
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
            event_sequence:
              history.at(-1)?.transition.events.at(-1)?.sequence ?? '0',
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
        rows = history.flatMap((v) =>
          v.transition.events.map((event) => transitionRow({ ...v, event })),
        );
      else if (
        sql.includes('from world_v2.inventory_posting') ||
        sql.includes('from world_v2.financial_posting_batch')
      ) {
        const financial = sql.includes('from world_v2.financial_posting_batch');
        rows = history.flatMap((v) =>
          (financial
            ? (v.financialPostingBatches ?? [])
            : (v.inventoryPostings ?? [])
          ).map((p) => {
            const { fingerprint, ...body } = p;
            return {
              causation_command_id: v.command.commandId,
              canonical_payload: canonicalSerialize(body),
              fingerprint,
            };
          }),
        );
        if (!financial) rows.push(...rawInventoryRows);
      } else if (
        sql.includes('select command_id from world_v2.command_receipt')
      )
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
      inventoryPostings: v.inventoryPostings ?? [],
      financialPostingBatches: v.financialPostingBatches ?? [],
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
    ...(protectedRead === undefined
      ? {}
      : { industryProtectedRead: protectedRead }),
  });
  const input = (c = command()) => ({
    transaction: executor,
    command: c,
    headWorldVersion: String(history.length),
    headEventSequence:
      history.at(-1)?.transition.events.at(-1)?.sequence ?? '0',
    observedAtReal: at,
  });
  return {
    reader,
    executor,
    database,
    custody,
    queries,
    rawInventoryRows,
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

// The guard observation is inert protocol correspondence, never native custody,
// a production decoder result, source admission, or a replacement Social grant.
function profile() {
  return {
    target: {
      targetDeploymentRef: 'TEST_ONLY_SOCIAL',
      databaseIdentityRef: 'TEST_ONLY_DB',
    },
    build: {
      constructorSourceCommit: 'a'.repeat(40),
      constructorBlobSHA256: 'b'.repeat(64),
      decoderProtocol: 'industry-production-decoder-v1' as const,
      decoderBuildSHA256: 'c'.repeat(64),
    },
  };
}
type Guard = NonNullable<
  Parameters<
    typeof createSocialEmploymentRuntimeSnapshotReader
  >[0]['industryProtectedRead']
>['historicalReadGuard'];
function observation(r: Parameters<Guard['assertReadFrom']>[1]) {
  return {
    schemaVersion:
      'industry-production-historical-read-observation-v1' as const,
    purpose: r.context.purpose,
    worldId: r.context.worldId,
    checkedHead: r.context.expectedHead,
    target: r.context.target,
    build: r.context.build,
    checkedGroups: r.groups.map((g) => ({
      commandFingerprint: g.command.fingerprint,
      transitionBinding: JSON.parse(
        canonicalSerialize(bindAuthoritativeTransition(g, digest)),
      ) as unknown,
      postingIdentities: g.postingIdentities,
    })),
    representationDecision: {
      issuerRef: 'TEST_ONLY_ISSUER',
      custodyRef: 'TEST_ONLY_CUSTODY',
      decisionRef: 'TEST_ONLY_DECISION',
      revision: '1',
      sourceContentHash: 'sha256:' + 'd'.repeat(64),
    },
    lockedResources: [
      {
        targetDatabaseIdentity: r.context.target.databaseIdentityRef,
        ownerDomainId: 'TEST_ONLY_OWNER',
        resourceKind: 'TEST_ONLY_NO_NATIVE_LOCK',
        canonicalResourceKey: 'TEST_ONLY_R',
        aliasIdentity: 'TEST_ONLY_R',
        lockMode: 'SHARE' as const,
        observationRevision: '1',
        protectedPredicateRef: 'TEST_ONLY_PARENT',
        writerProtocolRevision: '1',
        revokerProtocolRevision: '1',
        postlockObservationRef: 'TEST_ONLY_POSTLOCK',
      },
    ],
  };
}
function binding(
  assertReadFrom: Guard['assertReadFrom'] = async (_tx, r) => observation(r),
) {
  return { ...profile(), historicalReadGuard: { assertReadFrom } };
}
function eventGroup(
  types: readonly { type: string; payload?: unknown; corrects?: string }[],
  n = 1,
  beforeSequence = 0,
  selectedCountry = cid,
) {
  const c = command(n, String(n - 1), '10000', '1', selectedCountry);
  const events = types.map((v, index) =>
    parseAuthoritativeEvent(
      {
        schemaVersion: EVENT_SCHEMA_VERSION,
        eventId: `TEST_HISTORY_${n}_${index}`,
        eventType: v.type,
        worldId: c.worldId,
        causationCommandId: c.commandId,
        correlationId: c.correlationId,
        worldVersion: String(n),
        sequence: String(beforeSequence + index + 1),
        simTime: c.simTime.toCanonicalValue(),
        recordedAtReal: at,
        correctsEventId: v.corrects ?? null,
        payload: v.payload ?? { TEST_ONLY_ORPHAN: true },
      },
      digest,
    ),
  );
  const transition = createAuthoritativeTransition({
    command: c,
    worldVersionBefore: c.expectedWorldVersion!,
    worldVersionAfter: String(n),
    events,
  });
  const receipt = createFinalCommandReceipt({
    command: c,
    outcome: 'COMMITTED',
    reasonCode: null,
    transition,
    simTime: c.simTime,
    recordedAtReal: at,
  });
  return {
    command: c,
    event: events[0]!,
    transition,
    receipt,
    state: initialValues().state,
  };
}

describe('Social production history: real sole issuer, finite new controls, TEST_ONLY SQL', () => {
  it('SPH01 awaits fixed guard on an empty prefix before independent Social custody', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reached!: () => void;
    const reachedGuard = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const owned = binding(async (tx, r) => {
      expect(tx).toBe(f.executor);
      expect(r.actualHeldHead).toEqual({
        worldId: wid,
        worldVersion: '0',
        eventSequence: '0',
      });
      expect(r.context.purpose).toBe(
        'INDUSTRY_PRODUCTION_CANONICAL_HISTORY_READ',
      );
      expect(r.groups).toEqual([]);
      expect(r.context.target.targetDeploymentRef).toBe('TEST_ONLY_SOCIAL');
      expect(f.calls()).toBe(0);
      reached();
      await gate;
      return observation(r);
    });
    const f = fixture(owned);
    owned.target.targetDeploymentRef = 'MUTATED_AFTER_CONSTRUCTION';
    const pending = f.reader.readFrom(f.input());
    await reachedGuard;
    expect(f.calls()).toBe(0);
    release();
    const result = await pending;
    expect(result.status).toBe('REPLAYED');
    if (result.status !== 'REPLAYED') throw Error('Expected mechanism replay');
    expect(result.state).toEqual(
      validateSocialEmploymentServiceState(
        f.values.state,
        f.values.facts,
        digest,
      ),
    );
    expect(result.readFacts).toEqual(f.values.facts);
    expect(f.calls()).toBe(1);
    expect(f.queries.some((q) => /insert|update|delete/i.test(q))).toBe(false);
  });
  it('SPH02 rejects missing fixed guard, malformed build and extra purpose instead of granting a source', async () => {
    const f = fixture();
    const make = (v: unknown) =>
      createSocialEmploymentRuntimeSnapshotReader({
        mode: 'TEST_ONLY_LOCAL',
        database: f.database,
        sha256Hex: digest,
        custody: f.custody,
        industryProtectedRead: v as Parameters<
          typeof createSocialEmploymentRuntimeSnapshotReader
        >[0]['industryProtectedRead'] & {},
      });
    expect(() =>
      make({ ...profile(), historicalReadGuard: undefined }),
    ).toThrow('fixed Industry');
    expect(() => make({ ...binding(), purpose: 'SOCIAL_GRANT' })).toThrow(
      'fields',
    );
    const bad = binding();
    Object.assign(bad.build, { decoderProtocol: 'SOCIAL_PURPOSE' });
    await expect(make(bad).readFrom(f.input())).rejects.toThrow();
    expect(f.calls()).toBe(0);
  });
  it('SPH03 refuses wrong supplied H before guard and does not replace independent custody', async () => {
    let guards = 0;
    const f = fixture(
      binding(async (_tx, r) => {
        guards++;
        return observation(r);
      }),
    );
    await expect(
      f.reader.readFrom({ ...f.input(), headEventSequence: '1' }),
    ).rejects.toThrow('actual World/head');
    expect(guards).toBe(0);
    expect(f.calls()).toBe(0);
    f.mutateSnapshot(() => null as unknown as ReturnType<typeof f.snapshot>);
    const result = await f.reader.readFrom(f.input());
    expect(result.status).toBe('MISSING_OPERATING_STATE');
    expect(guards).toBe(1);
  });
  it.each([false, true])(
    'SPH04 refuses an orphan production type with protected binding=%s',
    async (protectedMode) => {
      const f = fixture(protectedMode ? binding() : undefined);
      f.history.push(eventGroup([{ type: PRODUCTION_SETTLED_EVENT_TYPE }]));
      await expect(f.reader.readFrom(f.input(command(2, '1')))).rejects.toThrow(
        'exactly one same-transition posting',
      );
      expect(f.calls()).toBe(1);
    },
  );
  it('SPH04b retains legacy hard denial of a raw production header before Social custody', async () => {
    const f = fixture();
    const group = eventGroup([{ type: PRODUCTION_SETTLED_EVENT_TYPE }]);
    f.history.push(group);
    // Negative-only incomplete row: must fail at the original persistence gate,
    // never decoded or presented as a valid constructor posting/source.
    f.rawInventoryRows.push({
      causation_command_id: group.command.commandId,
      canonical_payload: canonicalSerialize({
        schemaVersion: 'inventory-production-consumption-v1',
        operation: 'PRODUCE_AND_CONSUME',
      }),
      fingerprint: 'sha256:' + 'd'.repeat(64),
    });
    await expect(f.reader.readFrom(f.input(command(2, '1')))).rejects.toThrow(
      'PRODUCTION_PERSISTENCE_SCHEMA_NOT_ADMITTED',
    );
    expect(f.calls()).toBe(0);
  });
  it('SPH04c refuses whole mixed production groups instead of discarding PLAN or unknown siblings', async () => {
    for (const sibling of [SOCIAL_SERVICE_PLAN_EVENT, 'TEST_ONLY_UNKNOWN']) {
      const f = fixture(binding());
      const plan = committedPlan(command(), f.values.state, f.values.facts);
      f.history.push(
        eventGroup([
          { type: PRODUCTION_SETTLED_EVENT_TYPE },
          {
            type: sibling,
            payload:
              sibling === SOCIAL_SERVICE_PLAN_EVENT
                ? JSON.parse(plan.event.canonicalPayload)
                : {},
          },
        ]),
      );
      await expect(f.reader.readFrom(f.input(command(2, '1')))).rejects.toThrow(
        'exactly one same-transition posting',
      );
    }
  });
  it('SPH04d traverses actual production constructor/decoder/funding, then refuses the unclassified funding Event', async () => {
    let productionHeaders = 0;
    const f = fixture(
      binding(async (_tx, r) => {
        productionHeaders += r.groups.length;
        return observation(r);
      }),
      true,
    );
    const p = f.history[1]!.inventoryPostings![0]!;
    if (p.operation !== 'PRODUCE_AND_CONSUME')
      throw Error('Real production required');
    expect(p.evidence.input.labour.payload.availableBefore.amount).toBe('10');
    expect(p.result.labourConsumption.proposedConsumed.amount).not.toBe('0');
    // The legal fixture's funding Event remains its original type. It is never
    // relabelled as OMO/Treasury/Social to manufacture a successful mixed replay.
    await expect(f.reader.readFrom(f.input(command(3, '2')))).rejects.toThrow(
      'reducer',
    );
    expect(productionHeaders).toBe(1);
    expect(f.calls()).toBe(1); // actual D decode/full-ledger succeeded first
  });
  it('SPH04e refuses an extra isolated production Event despite a genuine validated production prefix', async () => {
    const f = fixture(binding(), true);
    f.history.push(
      eventGroup(
        [
          {
            type: PRODUCTION_SETTLED_EVENT_TYPE,
            payload: { wrongProductionBody: true },
          },
        ],
        3,
        2,
      ),
    );
    await expect(f.reader.readFrom(f.input(command(4, '3')))).rejects.toThrow(
      'exactly one same-transition posting',
    );
    expect(f.calls()).toBe(1);
  });
  it('SPH04f retains full-ledger duplicate-cost rejection for two actual constructor postings', async () => {
    const f = fixture(binding(), true),
      g = f.history[1]!,
      p = g.inventoryPostings![0]!;
    if (p.operation !== 'PRODUCE_AND_CONSUME')
      throw Error('Real production required');
    const duplicate = createProductionConsumptionPosting(
      {
        command: g.command,
        transition: g.transition,
        postingId: inventoryPostingId('TEST_SECOND_ACTUAL_PRODUCTION_POSTING'),
        evidence: p.evidence,
      },
      digest,
    );
    g.inventoryPostings = [p, duplicate];
    await expect(f.reader.readFrom(f.input(command(3, '2')))).rejects.toThrow();
    expect(f.calls()).toBe(0); // full funding/ledger admission precedes G replay
  });
  it('SPH05 rejects a production correction, plus a prior-group correction targeting a later production ID', async () => {
    const own = fixture(binding());
    own.history.push(
      eventGroup([
        { type: PRODUCTION_SETTLED_EVENT_TYPE, corrects: 'OTHER_EVENT' },
      ]),
    );
    await expect(
      own.reader.readFrom(own.input(command(2, '1'))),
    ).rejects.toThrow('production source correction');
    const prefix = fixture(binding());
    prefix.history.push(
      eventGroup([
        { type: 'CENTRAL_BANK_OMO_SETTLED_V1', corrects: 'TEST_HISTORY_2_0' },
      ]),
    );
    prefix.history.push(
      eventGroup([{ type: PRODUCTION_SETTLED_EVENT_TYPE }], 2, 1),
    );
    await expect(
      prefix.reader.readFrom(prefix.input(command(3, '2'))),
    ).rejects.toThrow('correction of production');
  });
  it.each(['earlier', 'later'])(
    'SPH05b scans %s foreign-country corrections across the entire prefix',
    async (position) => {
      const f = fixture(binding(), position === 'later');
      if (position === 'earlier') {
        f.history.push(
          eventGroup(
            [
              {
                type: 'CENTRAL_BANK_OMO_SETTLED_V1',
                corrects: 'TEST_HISTORY_2_0',
              },
            ],
            1,
            0,
            'COUNTRY_FOREIGN_TEST',
          ),
        );
        f.history.push(
          eventGroup([{ type: PRODUCTION_SETTLED_EVENT_TYPE }], 2, 1),
        );
      } else {
        f.history.push(
          eventGroup(
            [
              {
                type: 'CENTRAL_BANK_OMO_SETTLED_V1',
                corrects: f.history[1]!.event.eventId,
              },
            ],
            3,
            2,
            'COUNTRY_FOREIGN_TEST',
          ),
        );
      }
      await expect(
        f.reader.readFrom(
          f.input(
            command(
              position === 'earlier' ? 3 : 4,
              position === 'earlier' ? '2' : '3',
            ),
          ),
        ),
      ).rejects.toThrow('correction of production');
    },
  );
  it('SPH06 retains mixed siblings, sequence/full-prefix binding and historical PLAN semantics', async () => {
    const f = fixture(binding());
    const plan = committedPlan(command(), f.values.state, f.values.facts);
    const sibling = parseAuthoritativeEvent(
      {
        schemaVersion: EVENT_SCHEMA_VERSION,
        eventId: 'TEST_SIBLING',
        eventType: 'CENTRAL_BANK_OMO_SETTLED_V1',
        worldId: wid,
        causationCommandId: plan.command.commandId,
        correlationId: plan.command.correlationId,
        worldVersion: '1',
        sequence: '2',
        simTime: '10000',
        recordedAtReal: at,
        correctsEventId: null,
        payload: { TEST_ONLY_NO_DIRECT_SOCIAL_WRITE: true },
      },
      digest,
    );
    const transition = createAuthoritativeTransition({
      command: plan.command,
      worldVersionBefore: '0',
      worldVersionAfter: '1',
      events: [plan.event, sibling],
    });
    const receipt = createFinalCommandReceipt({
      command: plan.command,
      outcome: 'COMMITTED',
      reasonCode: null,
      transition,
      simTime: plan.command.simTime,
      recordedAtReal: at,
    });
    f.history.push({ ...plan, transition, receipt });
    const result = await f.reader.readFrom(f.input(command(2, '1')));
    expect(result.status).toBe('REPLAYED');
    if (result.status !== 'REPLAYED') throw Error('Expected complete replay');
    expect(result.state).toEqual(plan.state);
    expect(result.state.plans).toHaveLength(1);
    expect(result.headEventSequence).toBe('2');
    // Changing an actual retained sibling changes the complete binding; omission
    // cannot be hidden by the same H or a production-bearing group shortcut.
    f.history[0] = eventGroup([
      { type: 'TEST_ONLY_UNKNOWN' },
      { type: 'CENTRAL_BANK_OMO_SETTLED_V1' },
    ]);
    await expect(f.reader.readFrom(f.input(command(2, '1')))).rejects.toThrow();
  });
});
