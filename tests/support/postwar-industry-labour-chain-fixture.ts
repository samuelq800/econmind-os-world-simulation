/** TEST_ONLY two-country Core + real embedded canonical journal + SQL publisher.
 * No private Social factory/Atomic source guard is impersonated. The journal
 * writer below is fixture infrastructure, NOT a registered Worker consumer. */
import { PGlite } from '@electric-sql/pglite';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import * as C from '@econmind/core';
import {
  prepareFinanceNativeBudgetMixedPrefix,
  type FinanceNativeBudgetCanonicalFrame,
} from '@econmind/core/finance-budget-native';
import {
  prepareFinanceSocialReplayContinuation,
  appendFinanceSocialReplayPage,
  readFinanceSocialReplayContinuation,
  retireFinanceSocialReplayContinuation,
} from '@econmind/core/finance-social-replay-continuation';
import {
  createPostwarPagedCurrentProof,
  advancePostwarPagedCurrentProof,
  readPostwarPagedCurrentProof,
  retirePostwarPagedCurrentProof,
  type PostwarPagedCurrentCoverage,
} from '../../apps/world-worker/src/persistence/postwar-paged-current-proof.js';
import { createPostwarBoundedPrefixPageReaderFrom } from '../../apps/world-worker/src/persistence/postgres-postwar-bounded-prefix-pages.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
import { OPENING_PUBLICATION_SIGNATURE_DOMAIN } from '../../apps/world-worker/src/admission/private-opening-admission-authority.js';
import { projectPostwarIndustryLabourAllocation } from '../../apps/world-worker/src/persistence/postwar-industry-labour-source.js';
import {
  createPostwarOfficeRuntimeFetchHandler,
  POSTWAR_OFFICE_RUNTIME_READ_PATH,
} from '../../apps/world-api/src/runtime-preparation/postwar-office-runtime-fetch-handler.js';
import { POSTWAR_OFFICE_RUNTIME_SCHEMA } from '../../apps/world-api/src/integration/postwar-office-runtime-read-service.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex'),
  hash = (v: unknown) => 'sha256:' + sha('SHA-256\n' + C.canonicalSerialize(v));
const read = (p: string) =>
  readFile(new URL('../../' + p, import.meta.url), 'utf8');
const world = C.worldId('WORLD_TEST_ONLY_INDUSTRY_CHAIN'),
  subject = '11111111-1111-4111-8111-111111111111',
  other = '22222222-2222-4222-8222-222222222222',
  at = '2026-11-01T00:00:00.000Z';
function country(countryId: string, industrial: boolean) {
  const locationId = 'REGION_' + countryId,
    positionId = 'POSITION_' + countryId,
    employerId = (industrial ? 'OP_' : 'GOV_') + countryId;
  const scope = { countryId, locationId, skill: 'HIGH' as const };
  const demand: C.OpeningLabourPositionDemand = {
    ...scope,
    positionId,
    requiredCount: '6',
    sourceWeight: '1',
    owner: industrial ? 'PRIVATE_SECTOR' : 'PUBLIC_SERVICE',
    classificationId: industrial ? 'STEEL' : 'EDUCATION',
    employerId,
    employerRole: industrial ? 'OP' : 'GOV',
    occupation: industrial ? 'GENERAL' : 'TEACHER',
    wageAmount: '3600',
    wageCurrency: 'XAA',
    wagePeriod: 'SIM_YEAR',
    wageVersion: 'TEST_ONLY_WAGE',
    payrollFundingRef: 'PAYROLL_' + countryId,
  };
  const populationAvailability = [
    { countryId, locationId, workingAgeAvailable: '7' },
  ];
  const opening = C.materializeOpeningLabourState({
    targets: [{ ...scope, count: '2' }],
    positions: [demand],
    populationAvailability,
    skillAvailability: [{ ...scope, count: '7' }],
    nonEmployedAggregates: [
      { ...scope, status: 'UNEMPLOYED_SEARCHING', count: '5' },
    ],
    employers: [{ countryId, employerId, role: demand.employerRole }],
  });
  const state: C.SocialEmploymentServiceState = {
    schemaVersion: 'social-employment-service-state-v1',
    worldId: world,
    labour: opening.state,
    servicePools: [
      {
        ...scope,
        poolId: 'POOL_' + countryId,
        dayIndex: '0',
        ruleVersion: C.SOCIAL_JOB_MATCH_RULE_VERSION,
        capacitySlots: '3',
        usedSlots: '0',
        reservedSlots: '0',
      },
    ],
    plans: [],
    appliedOperations: [],
  };
  const facts: C.SocialEmploymentReadFacts = {
    boundary: C.createE01DailyBoundary('0'),
    simTime: '0',
    populationAvailability,
    offer: {
      ...scope,
      positionId,
      employerId,
      employerRole: demand.employerRole,
      legalPositionRef: 'LEGAL_' + countryId,
      payrollFundingRef: demand.payrollFundingRef!,
      offerVersion: 'TEST_ONLY_EXISTING_OFFER',
      state: 'ACTIVE',
      wageVersion: demand.wageVersion,
      amount: demand.wageAmount,
      currency: demand.wageCurrency,
      period: demand.wagePeriod,
      validFromDayIndex: '0',
      validUntilDayIndex: '1',
    },
    minimumWage: {
      countryId,
      ruleId: 'TEST_ONLY_FLOOR',
      ruleVersion: 'TEST_ONLY_FLOOR_V1',
      amount: '3600',
      currency: 'XAA',
      period: 'SIM_YEAR',
      validFromDayIndex: '0',
      validUntilDayIndex: '1',
    },
  };
  return {
    countryId,
    locationId,
    positionId,
    demand,
    state,
    facts,
    industrial,
    employerId,
  };
}
export async function createPostwarIndustryLabourChainFixture(
  options: { paged?: boolean } = {},
) {
  const directory = await mkdtemp(join(tmpdir(), 'industry-labour-chain-')),
    dataDir = join(directory, 'pgdata');
  let db = new PGlite(dataDir),
    closed = false,
    acquired = 0,
    released = 0;
  const countries = [country('COUNTRY_01', true), country('COUNTRY_02', false)];
  const sourcePositions = countries.map((c) => ({
    ...c.demand,
    sourceBucket: c.industrial
      ? ('INDUSTRY' as const)
      : ('EDUCATION_AND_HEALTH' as const),
    sourceObjectId: (c.industrial ? 'FACILITY_' : 'SCHOOL_') + c.countryId,
    policyVersion: 'TEST_ONLY_V1',
    provenance: 'SOURCE_MAPPED' as const,
    filledCount: '2',
    personRange: {
      poolId: 'PEOPLE_' + c.countryId,
      startOrdinal: '0',
      count: '2',
    },
  }));
  const fundingAccounts = countries.map((c) => ({
    countryId: c.countryId,
    payerEntityId: c.employerId,
    payerRole: c.demand.employerRole,
    accountRef: 'ACCOUNT_' + c.countryId,
    claimId: 'CLAIM_' + c.countryId,
    issuerEntityId: (c.industrial ? 'BANK_' : 'CB_') + c.countryId,
    currency: 'XAA',
    availableAmount: '1000',
    reservedAmount: '20',
    remainingAmount: '980',
  }));
  const positionFunding = countries.map((c, i) => ({
    positionId: c.positionId,
    countryId: c.countryId,
    locationId: c.locationId,
    payerEntityId: c.employerId,
    kind: 'PAYROLL' as const,
    filledCount: '2',
    currency: 'XAA',
    payrollFundingRef: c.demand.payrollFundingRef,
    accountRef: fundingAccounts[i]!.accountRef,
    amount: '20',
    period: 'SIM_DAY' as const,
    periodDays: '1' as const,
    exactFirstDayPayrollLC: { numerator: '7200', denominator: '360' },
    purposeId: c.positionId,
    fundingRef: c.demand.payrollFundingRef!,
    sourceBalanceRef: 'OPENING_ACCOUNT_' + c.countryId,
    requestedReservationAmount: '20',
    uncoveredReservationAmount: '0',
  }));
  const populationPositionRefs = countries.map((c) => ({
    positionId: c.positionId,
    regionId: c.locationId,
    cohortId: 'COHORT_' + c.countryId,
    startOrdinal: '0',
    count: '2',
    sourcePoolId: 'PEOPLE_' + c.countryId,
    sourceStartOrdinal: '0',
  }));
  const originals = {
    sourcePositions,
    labour: {
      positions: countries.map((c) => c.demand),
      targets: countries.map((c) => ({
        countryId: c.countryId,
        locationId: c.locationId,
        skill: 'HIGH' as const,
        count: '2',
      })),
      populationAvailability: countries.flatMap(
        (c) => c.facts.populationAvailability,
      ),
      skillAvailability: countries.map((c) => ({
        countryId: c.countryId,
        locationId: c.locationId,
        skill: 'HIGH' as const,
        count: '7',
      })),
      nonEmployedAggregates: countries.map((c) => ({
        countryId: c.countryId,
        locationId: c.locationId,
        skill: 'HIGH' as const,
        status: 'UNEMPLOYED_SEARCHING' as const,
        count: '5',
      })),
      employers: countries.map((c) => ({
        countryId: c.countryId,
        employerId: c.employerId,
        role: c.demand.employerRole,
      })),
    },
    positionFunding,
    populationPositionRefs,
  };
  const socialDocument = {
    schemaVersion: 'postwar-social-employment-state-v1',
    classification: 'TEST_ONLY_CORE_DATA_NOT_OFFICIAL_OPERATING_ADOPTION',
    sourceRevision: 'TEST_ONLY_INDUSTRY_CHAIN_V1',
    inputs: {
      worldId: world,
      seedId: 'SEED_TEST_ONLY_INDUSTRY_CHAIN',
      ...originals,
      fundingAccounts,
    },
    countries: countries.map((c) => ({
      countryId: c.countryId,
      state: c.state,
      offers: [c.facts.offer],
      minimumWage: c.facts.minimumWage,
      validationReadFacts: { facts: c.facts },
      dutyAssignments: [],
    })),
  };
  const source = C.createOpeningSource(
    {
      schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: C.openingSourceId('SOURCE_TEST_ONLY_INDUSTRY_CHAIN'),
      sourceKind: 'TEST_FIXTURE',
      sourceVersion: 'TEST_ONLY_TWO_COUNTRY_CORE',
      locator: 'TEST_ONLY_NOT_OFFICIAL_70_COUNTRY_OR_PRIVATE_FACTORY',
      payload: {
        schemaVersion: 'postwar-operating-genesis-seed-source-v1',
        carrier: {
          socialEmployment: socialDocument,
          selectedSource: {
            regionsBytes: '[]',
            regionMappingBytes: '{"mappings":[]}',
          },
        },
      },
    },
    sha,
  );
  const seed = C.createOpeningSeed(
    {
      schemaVersion: C.OPENING_SEED_SCHEMA_VERSION,
      seedId: C.openingSeedId('SEED_TEST_ONLY_INDUSTRY_CHAIN'),
      worldId: world,
      openingWorldVersion: '0',
      replayBinding: C.CURRENT_REPLAY_BINDING,
      sources: [source],
      inventoryEntries: [],
      financialBatches: countries.map((c) => ({
        batchId: C.financialOpeningBatchId('OPENING_' + c.countryId),
        sourceId: source.sourceId,
        settlementCurrency: 'XAA',
        legs: ['ASSET', 'LIABILITY'].map((kind, i) => ({
          legId: C.financialOpeningLegId('LEG_' + c.countryId + '_' + kind),
          account: C.createFinancialAccount({
            worldId: world,
            countryId: C.countryId(c.countryId),
            accountId: C.financialAccountId(
              (i ? 'COUNTERPART_' : 'ACCOUNT_') + c.countryId,
            ),
            ownerId: C.legalEntityId(
              i ? (c.industrial ? 'BANK_' : 'CB_') + c.countryId : c.employerId,
            ),
            accountClass: i ? 'LIABILITY' : 'ASSET',
            currency: 'XAA',
            claimId: C.financialClaimId('CLAIM_' + c.countryId),
            counterpartyEntityId: C.legalEntityId(
              i ? c.employerId : (c.industrial ? 'BANK_' : 'CB_') + c.countryId,
            ),
          }),
          direction: i ? ('CREDIT' as const) : ('DEBIT' as const),
          amount: C.Money.from('1000', 'XAA'),
          counterpartLegId: C.financialOpeningLegId(
            'LEG_' + c.countryId + '_' + (i ? 'ASSET' : 'LIABILITY'),
          ),
        })),
      })),
    },
    sha,
  );
  const { fingerprint: _, ...intent } = seed;
  void _;
  const intentBytes = C.canonicalSerialize(intent),
    seedSHA = sha(intentBytes),
    bundleSHA = sha(
      C.canonicalSerialize(
        seed.sources.map((s) => ({
          sourceId: s.sourceId,
          payloadHash: s.payloadHash,
        })),
      ),
    );
  const admin = () =>
    db.exec('rollback;reset role;set session authorization postgres');
  let admissionRef = '';
  const frames: FinanceNativeBudgetCanonicalFrame[] = [];
  const apiSql: string[] = [];
  const apiSqlErrors: string[] = [];
  async function initialize() {
    for (const id of [
      '0001_world_v2_namespace',
      '0002_world_v2_command_event_ledger',
      '0003_world_v2_command_receipts_outbox',
      '0005_world_v2_writer_lease_fencing',
      '0007_world_v2_atomic_transition_facts',
      '0009_world_v2_posting_payload_integrity',
      '0011_world_v2_current_commit_authorization',
      '0013_world_v2_read_projection_boundary',
      '0016_world_v2_opening_seed',
    ])
      await db.exec(await read('database/migrations/artifacts/' + id + '.sql'));
    for (const name of [
      'runtime-read-binding-storage',
      'runtime-admission-publication',
      'postwar-office-derived-read',
      'postwar-social-current-derived-read',
      'postwar-social-current-prefix-read',
      'postwar-financial-current-derived-read',
      'postwar-day-one-fx-custody',
      'postwar-mixed-current-projection-read',
      'social-operating-custody',
      'postwar-industry-labour-current-read',
    ])
      await db.exec(await read('database/proposals/' + name + '.sql'));
    if (options.paged) {
      for (const name of [
        'finance-budget-custody',
        'postwar-day-one-fx-history-read',
        'postwar-bounded-journal-read',
        'postwar-bounded-prefix-read',
        'postwar-bounded-prefix-pages',
        'captain-operating-custody',
        'postwar-captain-source-publication',
        'postwar-captain-current-derived-read',
        'postwar-paged-current-projection',
        'postwar-source-revocation-fence',
      ])
        await db.exec(await read('database/proposals/' + name + '.sql'));
    }
    await db.query('insert into world_v2.world_head values($1,0,0)', [world]);
    await db.query(
      'insert into world_v2.opening_seed values($1,$2,0,$3,$4,$5,now())',
      [
        world,
        seed.seedId,
        C.canonicalSerialize(seed.replayBinding),
        intentBytes,
        seed.fingerprint,
      ],
    );
    await db.exec(
      'create role world_v2_opening_admission_test_industry_chain nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;grant usage on schema world_v2 to world_v2_opening_admission_test_industry_chain;grant execute on function world_v2.publish_runtime_admission_publication(text,text,text)to world_v2_opening_admission_test_industry_chain;create role industry_chain_test_reader nologin noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication;grant world_v2_postwar_projection_reader to industry_chain_test_reader',
    );
    const now = Date.now(),
      keys = generateKeyPairSync('ed25519'),
      claims = {
        schemaVersion: 'opening-publication-authorization-v1',
        purpose: 'AUTHORIZE_OFFICIAL_OPENING_ADMISSION_PUBLICATION',
        authorizationId: 'AUTHORIZATION_TEST_ONLY_INDUSTRY_CHAIN',
        keyId: 'TEST_ONLY_EPHEMERAL',
        ownerIdentity: 'TEST_ONLY_NOT_PROJECT_OWNER',
        issuedAtReal: new Date(now - 60000).toISOString(),
        expiresAtReal: new Date(now + 3600000).toISOString(),
        worldId: world,
        seedId: seed.seedId,
        seedFingerprint: seed.fingerprint,
        modelVersion: seed.replayBinding.modelVersion,
        replayBinding: C.canonicalSerialize(seed.replayBinding),
        sourceBundleSha256: bundleSHA,
      };
    const canonical = C.canonicalSerialize(claims),
      signature = sign(
        null,
        Buffer.from(OPENING_PUBLICATION_SIGNATURE_DOMAIN + canonical),
        keys.privateKey,
      );
    if (
      !verify(
        null,
        Buffer.from(OPENING_PUBLICATION_SIGNATURE_DOMAIN + canonical),
        keys.publicKey,
        signature,
      )
    )
      throw Error('TEST_ONLY_SIGNATURE_VERIFICATION_FAILED');
    await db.exec('set role world_v2_admission_release');
    await db.query(
      'insert into world_v2.runtime_admission_publication_permit(authorization_id,authorization_sha256,canonical_authorization,signature_base64url,world_id,seed_id,seed_fingerprint,model_version,replay_binding,source_bundle_sha256,caller_session_role,valid_from,valid_until)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
      [
        claims.authorizationId,
        sha(canonical),
        canonical,
        signature.toString('base64url'),
        world,
        seed.seedId,
        seed.fingerprint,
        claims.modelVersion,
        claims.replayBinding,
        bundleSHA,
        'world_v2_opening_admission_test_industry_chain',
        claims.issuedAtReal,
        claims.expiresAtReal,
      ],
    );
    await admin();
    await db.exec(
      'set session authorization world_v2_opening_admission_test_industry_chain',
    );
    await db.query(
      'select world_v2.publish_runtime_admission_publication($1,$2,$3)',
      [claims.authorizationId, sha(canonical), bundleSHA],
    );
    admissionRef = 'ADMISSION_' + sha(canonical).toUpperCase();
    await admin();
    for (const [who, c] of [
      [subject, 'COUNTRY_01'],
      [other, 'COUNTRY_02'],
    ]) {
      await db.query(
        "insert into world_v2.current_commit_authorization values($1,$2::uuid,$3,'INDUSTRY','INDUSTRY_PRODUCTION','TEAM_TEST_ONLY','REV_TEST_ONLY',true,now())",
        [world, who, c],
      );
      await db.query(
        "insert into world_v2.runtime_read_seat(world_id,auth_subject,country_id,office_id,team_id,authorization_revision)values($1,$2::uuid,$3,'INDUSTRY','TEAM_TEST_ONLY','REV_TEST_ONLY')",
        [world, who, c],
      );
      await db.query(
        "insert into world_v2.projection_entitlement values($1,$2::uuid,'OFFICE_PRIVATE',$3,'REV_TEST_ONLY',true,now(),null)",
        [
          world,
          who,
          'OFFICE_' +
            Buffer.from(c!).toString('hex').toUpperCase() +
            '_494E445553545259',
        ],
      );
    }
    await db.query(
      "insert into world_v2.current_commit_authorization values($1,$2::uuid,'COUNTRY_01','SOCIAL','SOCIAL_LABOUR','TEAM_TEST_ONLY','REV_TEST_ONLY',true,now())",
      [world, subject],
    );
    // A real PLAN author also needs a coherent read seat/entitlement. Leaving
    // a second active office assignment without these correctly denies *all*
    // current-seat metadata; do not weaken that SQL guard for this fixture.
    await db.query(
      "insert into world_v2.runtime_read_seat(world_id,auth_subject,country_id,office_id,team_id,authorization_revision)values($1,$2::uuid,'COUNTRY_01','SOCIAL','TEAM_TEST_ONLY','REV_TEST_ONLY')",
      [world, subject],
    );
    await db.query(
      "insert into world_v2.projection_entitlement values($1,$2::uuid,'OFFICE_PRIVATE',$3,'REV_TEST_ONLY',true,now(),null)",
      [
        world,
        subject,
        'OFFICE_' +
          Buffer.from('COUNTRY_01').toString('hex').toUpperCase() +
          '_534F4349414C',
      ],
    );
    await db.exec('set role world_v2_social_source_publisher');
    await db.query(
      'select * from world_v2.register_social_operating_source_world($1)',
      [world],
    );
    await admin();
    await db.exec('set role world_v2_postwar_projection_publisher');
    for (const c of countries)
      for (const [office, dataset] of [
        ['SOCIAL', 'positions'],
        ['SOCIAL', 'service-pools'],
        ['INDUSTRY', 'regional-source-capacity'],
      ])
        await db.query(
          'select * from world_v2.publish_postwar_office_projection($1,$2,$3,$4,$5,$6,$7,$8)',
          [
            world,
            c.countryId,
            office,
            dataset,
            seed.fingerprint,
            seedSHA,
            bundleSHA,
            admissionRef,
          ],
        );
    await admin();
    await db.query('select world_v2.prepare_postwar_social_prefix_scopes($1)', [
      world,
    ]);
    await db.exec('set role world_v2_postwar_projection_publisher');
    await db.query(
      'select world_v2.prepare_postwar_industry_labour_scopes($1)',
      [world],
    );
    await admin();
  }
  try {
    await initialize();
  } catch (error) {
    await db.close();
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  function frame(previous?: {
    command: C.CanonicalCommand;
    state: C.SocialEmploymentServiceState;
  }) {
    const c = countries[0]!,
      due = !!previous,
      version = frames.length.toString();
    const command = C.parseCanonicalCommand(
      {
        schemaVersion: C.COMMAND_SCHEMA_VERSION,
        worldId: world,
        countryId: c.countryId,
        officeId: due ? null : 'SOCIAL',
        commandType: due
          ? C.SOCIAL_JOB_MATCH_DUE_COMMAND
          : C.SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
        commandId: due ? 'COMMAND_MATCH_TEST' : 'COMMAND_PLAN_TEST',
        actorId: 'ACTOR_TEST_ONLY',
        authSubject: subject,
        correlationId: 'CORRELATION_TEST_ONLY',
        idempotencyKey: due ? 'KEY_MATCH_TEST' : 'KEY_PLAN_TEST',
        expectedWorldVersion: version,
        simTime: '0',
        submittedAtReal: at,
        payload: due
          ? {
              schemaVersion: 'social-job-match-settlement-v1',
              planCommandId: previous!.command.commandId,
              planFingerprint: previous!.command.fingerprint,
              dueDayIndex: '0',
              ruleVersion: C.SOCIAL_JOB_MATCH_RULE_VERSION,
            }
          : {
              schemaVersion: 'social-employment-service-plan-v1',
              locationId: c.locationId,
              skill: 'HIGH',
              positionId: c.positionId,
              servicePoolId: 'POOL_' + c.countryId,
              requestedMatches: '1',
              dueDayIndex: '0',
            },
      },
      sha,
    );
    const prepared = C.prepareSocialEmploymentServiceOperation({
      command,
      state: previous?.state ?? c.state,
      readFacts: c.facts,
      sha256Hex: sha,
    });
    const event = C.parseAuthoritativeEvent(
      {
        schemaVersion: C.EVENT_SCHEMA_VERSION,
        eventId: 'EVENT_' + command.commandId,
        eventType: due ? C.SOCIAL_JOB_MATCH_EVENT : C.SOCIAL_SERVICE_PLAN_EVENT,
        worldId: world,
        causationCommandId: command.commandId,
        correlationId: command.correlationId,
        worldVersion: (BigInt(version) + 1n).toString(),
        sequence: (BigInt(version) + 1n).toString(),
        simTime: '0',
        recordedAtReal: at,
        correctsEventId: null,
        payload: prepared.eventPayload,
      },
      sha,
    );
    const transition = C.createAuthoritativeTransition({
        command,
        worldVersionBefore: version,
        worldVersionAfter: event.worldVersion,
        events: [event],
      }),
      receipt = C.createFinalCommandReceipt({
        command,
        transition,
        outcome: 'COMMITTED',
        reasonCode: null,
        simTime: command.simTime,
        recordedAtReal: at,
      });
    return {
      command,
      transition,
      receipt,
      events: [event],
      financialPostingBatches: [],
      inventoryPostings: [],
      state: prepared.state,
    };
  }
  async function persist(f: ReturnType<typeof frame>) {
    // Real SQL transaction over actual Core canonical data, not the registered
    // Atomic repository/source guard. Its separate acceptance stays NOT_RUN here.
    await admin();
    await db.exec('begin');
    try {
      const h = await db.query<{ v: string }>(
        'select world_version::text v from world_v2.world_head where world_id=$1 for update',
        [world],
      );
      if (h.rows[0]?.v !== f.command.expectedWorldVersion)
        throw Error('TEST_JOURNAL_STALE_HEAD');
      const c = f.command,
        e = f.events[0]!,
        r = f.receipt;
      await db.query(
        'insert into world_v2.command_submission values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)',
        [
          world,
          c.commandId,
          c.idempotencyKey,
          c.commandType,
          c.schemaVersion,
          c.canonicalPayload,
          c.payloadHash,
          c.fingerprint,
          c.authSubject,
          c.actorId,
          c.countryId,
          c.officeId,
          c.expectedWorldVersion,
          c.simTime.toCanonicalValue(),
          c.correlationId,
          c.submittedAtReal,
        ],
      );
      await db.query(
        'insert into world_v2.authoritative_event values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
        [
          world,
          e.eventId,
          e.sequence,
          e.worldVersion,
          c.commandId,
          c.correlationId,
          e.eventType,
          e.schemaVersion,
          e.canonicalPayload,
          e.payloadHash,
          e.fingerprint,
          e.simTime.toCanonicalValue(),
          e.recordedAtReal,
          null,
        ],
      );
      await db.query(
        'insert into world_v2.command_receipt values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)',
        [
          world,
          r.commandId,
          r.idempotencyKey,
          r.schemaVersion,
          r.commandFingerprint,
          r.outcome,
          r.reasonCode,
          r.transitionId,
          r.worldVersionBefore,
          r.worldVersionAfter,
          r.simTime.toCanonicalValue(),
          JSON.stringify(r.eventIds),
          r.recordedAtReal,
        ],
      );
      await db.query(
        'insert into world_v2.current_materialization values($1,$2,$3,$4,$5,$6)on conflict(world_id,materialization_key)do update set world_version=excluded.world_version,source_command_id=excluded.source_command_id,canonical_payload=excluded.canonical_payload,payload_sha256=excluded.payload_sha256',
        [
          world,
          'SOCIAL_EMPLOYMENT_SERVICE_COUNTRY_01',
          e.worldVersion,
          c.commandId,
          C.canonicalSerialize(f.state),
          hash(f.state),
        ],
      );
      await db.query(
        'update world_v2.world_head set world_version=$2,event_sequence=$3 where world_id=$1',
        [world, e.worldVersion, e.sequence],
      );
      await db.exec('commit');
      frames.push({
        command: c,
        transition: f.transition,
        receipt: r,
        events: f.events,
        financialPostingBatches: [],
        inventoryPostings: [],
      });
    } catch (error) {
      await db.exec('rollback');
      throw error;
    }
  }
  async function publishCurrent(
    countryId: 'COUNTRY_01' | 'COUNTRY_02' = 'COUNTRY_01',
    profile: 'BOUNDED' | 'PAGED' = 'BOUNDED',
  ) {
    const last = frames.at(-1)!.events.at(-1)!,
      head = {
        worldId: world,
        worldVersion: last.worldVersion,
        eventSequence: last.sequence,
      };
    let evidence = prepareFinanceNativeBudgetMixedPrefix(
      {
        worldId: world,
        frames,
        socialCountries: countries.map((c) => ({
          countryId: c.countryId,
          state: c.state,
          offers: [c.facts.offer],
        })),
      },
      sha,
    );
    let evidenceFrames: readonly FinanceNativeBudgetCanonicalFrame[] = frames;
    let pagedCoverage: Readonly<PostwarPagedCurrentCoverage> | undefined;
    if (profile === 'PAGED') {
      if (!options.paged) throw Error('TEST_PAGED_SCHEMA_NOT_INSTALLED');
      const opening = C.rebuildV08LedgersFromLineage({
        seed,
        transitions: [],
        sha256Hex: sha,
      });
      let cursor = prepareFinanceSocialReplayContinuation(
        {
          opening,
          expectedHead: head,
          socialCountries: countries.map((c) => ({
            countryId: c.countryId,
            state: c.state,
            offers: [c.facts.offer],
          })),
          openingEncumbrances: [],
          fxOriginals: [],
        },
        sha,
      );
      let proof = createPostwarPagedCurrentProof(cursor);
      await admin();
      await db.exec(
        'begin isolation level repeatable read;set local role world_v2_social_source_reader',
      );
      const tx: SqlExecutor = {
        async query<Row extends object>(q: string, p: readonly unknown[] = []) {
          const r = await db.query<Row>(q, [...p]);
          return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
        },
      };
      try {
        const reader = createPostwarBoundedPrefixPageReaderFrom(tx, {
          worldId: world,
          countryId,
          officeId: 'SOCIAL',
          seedFingerprint: seed.fingerprint,
          admissionRef,
        });
        for (;;) {
          const page = await reader.readNext();
          if (!page) break;
          cursor = appendFinanceSocialReplayPage({
            continuation: cursor,
            page,
            sha256Hex: sha,
            originals: { fxOriginals: [] },
          });
          proof = advancePostwarPagedCurrentProof({
            proof,
            continuation: cursor,
          });
        }
        const view = readFinanceSocialReplayContinuation(cursor);
        if (!view.complete)
          throw Error('TEST_ACTUAL_COMPLETE_PAGE_CHAIN_REQUIRED');
        evidence = view.lastPage.evidence;
        evidenceFrames = view.lastPage.frames;
        pagedCoverage = readPostwarPagedCurrentProof(proof).coverage;
      } finally {
        await db.exec('rollback');
        await admin();
        retirePostwarPagedCurrentProof(proof);
        retireFinanceSocialReplayContinuation(cursor);
      }
    }
    const eligible = sourcePositions.filter(
      (p) =>
        p.countryId === countryId &&
        p.sourceBucket === 'INDUSTRY' &&
        p.employerRole === 'OP',
    );
    const allocation = eligible.length
      ? projectPostwarIndustryLabourAllocation({
          scope: {
            worldId: world,
            countryId,
            locationId: eligible[0]!.locationId,
            facilityId: eligible[0]!.sourceObjectId,
            operatorId: eligible[0]!.employerId,
          },
          originals,
          evidence,
          frames: evidenceFrames,
          head,
        })
      : null;
    const rows = (allocation?.positions ?? []).map((p) => ({
      schemaVersion: 'postwar-industry-labour-current-row-v1',
      countryId,
      facilityId: eligible[0]!.sourceObjectId,
      locationId: allocation!.scope.locationId,
      operatorId: allocation!.scope.operatorId,
      positionId: p.positionId,
      skill: p.skill,
      classificationId: p.classificationId,
      requiredCount: p.requiredCount,
      openingFilledCount: p.openingFilledCount,
      currentEmployedCount: p.currentEmployedCount,
      measurement: 'EMPLOYMENT_HEADCOUNT_NOT_ATTENDANCE_OR_PAYMENT',
      completedPersonDays: null,
      paidCost: null,
    }));
    const coverage = pagedCoverage ?? {
      prefixFingerprint: hash({
        worldId: world,
        seedFingerprint: seed.fingerprint,
        headWorldVersion: head.worldVersion,
        headEventSequence: head.eventSequence,
        frames,
      }),
      knownEffectsFingerprint: hash(
        frames.map((f) => ({
          commandId: f.command.commandId,
          countryId: f.command.countryId,
          commandType: f.command.commandType,
          transitionFingerprint: hash(f.transition),
          receiptFingerprint: hash(f.receipt),
          eventFingerprints: f.events.map((e) => e.fingerprint),
          worldVersionBefore: f.transition.worldVersionBefore,
          worldVersionAfter: f.transition.worldVersionAfter,
          events: f.events.map((e) => ({
            eventId: e.eventId,
            fingerprint: e.fingerprint,
            sequence: e.sequence,
            worldVersion: e.worldVersion,
          })),
        })),
      ),
      coveredThroughEventId: last.eventId,
      coveredThroughEventFingerprint: last.fingerprint,
      financialPostingCount: '0',
      financialBatchCount: '0',
      financialPostingsFingerprint: hash([]),
    };
    await admin();
    if (profile === 'PAGED')
      await db.exec('begin isolation level repeatable read');
    await db.exec('set role world_v2_postwar_projection_publisher');
    const result = await db.query<Record<string, unknown>>(
      'select * from world_v2.publish_postwar_industry_labour_current($1,$2,$3)',
      [
        world,
        countryId,
        C.canonicalSerialize({
          head,
          seedPins: {
            worldId: world,
            seedId: seed.seedId,
            seedFingerprint: seed.fingerprint,
            admissionRef,
          },
          coverage,
          rowsHash: hash(rows),
        }),
      ],
    );
    if (profile === 'PAGED') await db.exec('commit');
    await admin();
    return { result: result.rows, allocation, coverage };
  }
  const jwtKeys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }),
    jwk = {
      ...jwtKeys.publicKey.export({ format: 'jwk' }),
      kid: 'TEST_ONLY_INDUSTRY_CHAIN_JWT',
      alg: 'ES256',
      use: 'sig',
      key_ops: ['verify'],
    };
  const issuer = 'https://abcdefghijklmnopqrst.supabase.co/auth/v1';
  const pool = {
    async connect() {
      acquired++;
      await admin();
      await db.exec(
        'set session authorization industry_chain_test_reader;set role world_v2_postwar_projection_reader',
      );
      return {
        async query(q: string, p?: unknown[]) {
          apiSql.push(q);
          try {
            const r = await db.query(q, p);
            return { rows: r.rows, rowCount: r.rows.length };
          } catch (error) {
            apiSqlErrors.push(String(error));
            throw error;
          }
        },
        release() {
          released++;
        },
      } as unknown as PoolClient;
    },
  } as Pick<Pool, 'connect'>;
  const handler = createPostwarOfficeRuntimeFetchHandler({
    pool,
    readerRole: 'world_v2_postwar_projection_reader',
    authorizationPublisherRole: 'world_v2_postwar_projection_publisher',
    modelVersion: C.WORLD_MODEL_VERSION,
    endpointPins: {
      origin: 'https://read.example',
      projectionPath: POSTWAR_OFFICE_RUNTIME_READ_PATH,
      finalLookupPath: '/v1/final-receipt',
      deploymentRef: 'TEST_ONLY_INDUSTRY_CHAIN',
    },
    admittedWorldPins: {
      worldId: world,
      seedRef: seed.seedId,
      contentHash: seed.fingerprint,
      admissionRef,
      minimumWorldVersion: '0',
    },
    routeOptions: { allowedOrigins: ['https://pages.example'] },
    auth: {
      projectRef: 'abcdefghijklmnopqrst',
      expectedIssuer: issuer,
      jwksUrl: issuer + '/.well-known/jwks.json',
      audience: 'authenticated',
      fetch: async (url) => {
        const r = Response.json({ keys: [jwk] });
        Object.defineProperty(r, 'url', { value: String(url) });
        return r;
      },
    },
  });
  function token(who: string) {
    const head = Buffer.from(
        JSON.stringify({ alg: 'ES256', kid: jwk.kid, typ: 'JWT' }),
      ).toString('base64url'),
      now = Math.floor(Date.now() / 1000),
      payload = Buffer.from(
        JSON.stringify({
          sub: who,
          iss: issuer,
          aud: 'authenticated',
          iat: now - 5,
          exp: now + 300,
        }),
      ).toString('base64url'),
      raw = head + '.' + payload;
    return (
      raw +
      '.' +
      sign('sha256', Buffer.from(raw), {
        key: jwtKeys.privateKey,
        dsaEncoding: 'ieee-p1363',
      }).toString('base64url')
    );
  }
  async function call(
    page: Record<string, unknown> = {},
    who = subject,
    extra: Record<string, unknown> = {},
  ) {
    const r = await handler(
      new Request('https://read.example' + POSTWAR_OFFICE_RUNTIME_READ_PATH, {
        method: 'POST',
        headers: {
          origin: 'https://pages.example',
          authorization: 'Bearer ' + token(who),
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          schemaVersion: POSTWAR_OFFICE_RUNTIME_SCHEMA,
          requestId: '44444444-4444-4444-8444-444444444444',
          operation: 'READ_CURRENT_OFFICE_OPENING',
          officeId: 'INDUSTRY',
          dataset: 'industry-labour-current',
          page: { limit: 25, ...page },
          ...extra,
        }),
      }),
    );
    if (!r) throw Error('TEST_HANDLER_MISSING');
    return {
      status: r.status,
      body: (await r.json()) as Record<string, unknown>,
    };
  }
  return {
    classification:
      'TEST_ONLY_CORE_CANONICAL_JOURNAL_SQL_PUBLICATION_NOT_REGISTERED_WORKER' as const,
    world,
    seed,
    subject,
    other,
    apiSql,
    apiSqlErrors,
    call,
    publishCurrent,
    counts: () => ({ acquired, released }),
    async planAndMatch() {
      const plan = frame();
      await persist(plan);
      const match = frame({ command: plan.command, state: plan.state });
      await persist(match);
      return { plan, match };
    },
    async readAsWrongRole() {
      await admin();
      try {
        await db.exec('set role world_v2_social_source_reader');
        return await db.query(
          'select * from world_v2.read_postwar_industry_labour_current_page($1,0,25,null)',
          [world],
        );
      } finally {
        await admin();
      }
    },
    async revokeAuthority(active: boolean) {
      await admin();
      await db.query(
        "update world_v2.current_commit_authorization set active=$2 where world_id=$1 and office_id='INDUSTRY'",
        [world, active],
      );
    },
    async revokeSource() {
      await admin();
      await db.exec('set role world_v2_social_source_publisher');
      await db.query(
        'select world_v2.revoke_social_operating_source($1,$2,$3)',
        [world, 'COUNTRY_01', 'TEST_ONLY_REVOKED'],
      );
      await admin();
    },
    async reopen() {
      await admin();
      await db.close();
      db = new PGlite(dataDir);
      await db.waitReady;
    },
    async close() {
      if (closed) return;
      closed = true;
      await admin();
      await db.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
