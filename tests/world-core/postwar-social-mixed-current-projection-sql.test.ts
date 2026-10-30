/** New mixed projection SQL infrastructure uses explicit TEST_ONLY small sources. Genuine full
 * source publication is separately exercised against the shared native reference. */
import { readFile } from 'node:fs/promises';
import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import * as C from '@econmind/core';
import { canonicalSerialize as sourceCanonicalSerialize } from '../../packages/core/src/index.js';
import {
  mixedFinancialFixture,
  mixedFxFrame,
} from '../support/finance-social-fx-replay-fixture.js';
import { OPENING_PUBLICATION_SIGNATURE_DOMAIN } from '../../apps/world-worker/src/admission/private-opening-admission-authority.js';
import { POSTWAR_PROJECTION_PUBLISH_QUERY } from '../../apps/world-worker/src/persistence/postwar-office-projection-store.js';
const read = (p: string) =>
  readFile(new URL('../../' + p, import.meta.url), 'utf8');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const world = 'WORLD_TEST_ONLY_BOUNDED_PROJECTION',
  subject = '00000000-0000-4000-8000-000000000001',
  other = '00000000-0000-4000-8000-000000000002';
const admissionPublisher = 'world_v2_opening_admission_test_bounded',
  reader = 'world_v2_postwar_projection_reader',
  publisher = 'world_v2_postwar_projection_publisher';
const sourceHash = 'a'.repeat(64);
let db: PGlite,
  seed: C.OpeningSeed,
  seedIntentHash: string,
  admissionRef: string;
async function admin() {
  await db.exec('rollback; reset role; set session authorization postgres');
}
async function readerSession(who = subject) {
  await admin();
  await db.exec(
    'set session authorization projection_test_reader; set role world_v2_postwar_projection_reader',
  );
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [who]);
  await db.exec('begin isolation level repeatable read read only');
}
async function publish(country = 'COUNTRY_01', dataset = 'positions') {
  await admin();
  await db.exec('set role ' + publisher);
  return db.query<Record<string, unknown>>(POSTWAR_PROJECTION_PUBLISH_QUERY, [
    world,
    country,
    'SOCIAL',
    dataset,
    seed.fingerprint,
    seedIntentHash,
    sourceHash,
    admissionRef,
  ]);
}
const fixtures = ['COUNTRY_01', 'COUNTRY_02'].map((countryId, index) => {
  const locationId = `REGION_${index + 1}`,
    minimumWage = {
      countryId,
      ruleId: 'MIN_' + countryId,
      ruleVersion: 'TEST_ONLY',
      amount: '1',
      currency: 'XAA',
      period: 'SIM_YEAR',
      validFromDayIndex: '0',
      validUntilDayIndex: '1',
    },
    populationAvailability = [
      { countryId, locationId, workingAgeAvailable: '100' },
    ];
  const wage = {
    countryId,
    locationId,
    positionId: 'WAGE_' + countryId,
    owner: 'PUBLIC_SERVICE',
    employerId: 'GOV_' + countryId,
    employerRole: 'GOV',
    skill: 'HIGH',
    classificationId: 'PUBLIC_SAFETY',
    occupation: 'GENERAL',
    wageAmount: '360',
    wageCurrency: 'XAA',
    wagePeriod: 'SIM_YEAR',
    wageVersion: 'WAGE_TEST_ONLY',
  };
  const funding = {
    countryId,
    payerEntityId: 'GOV_' + countryId,
    payerRole: 'GOV',
    accountRef: 'ACCOUNT_' + countryId,
    claimId: 'CLAIM_' + countryId,
    issuerEntityId: 'CB_' + countryId,
    currency: 'XAA',
    availableAmount: '1000',
    reservedAmount: '0',
    remainingAmount: '1000',
  };
  const country = {
    countryId,
    state: {
      schemaVersion: 'social-employment-service-state-v1',
      worldId: world,
      labour: {
        positions: [
          {
            countryId,
            locationId,
            positionId: wage.positionId,
            owner: 'PUBLIC_SERVICE',
            skill: 'HIGH',
            classificationId: 'PUBLIC_SAFETY',
            requiredCount: '1',
            employedCount: '1',
          },
        ],
        aggregates: [
          {
            countryId,
            locationId,
            skill: 'HIGH',
            status: 'UNEMPLOYED_SEARCHING',
            count: '99',
          },
        ],
        wageAssertions: [],
        appliedFactBindings: [],
      },
      servicePools: [
        {
          countryId,
          locationId,
          poolId: 'POOL_' + countryId,
          skill: 'HIGH',
          capacitySlots: '10',
          usedSlots: '0',
          reservedSlots: '0',
          dayIndex: '0',
          ruleVersion: 'TEST_ONLY',
        },
      ],
      plans: [],
      appliedOperations: [],
    },
    offers: [],
    minimumWage,
    validationReadFacts: { facts: { minimumWage, populationAvailability } },
    dutyAssignments: [{ cohortId: 'COHORT_' + countryId }],
  };
  return { country, wage, funding, populationAvailability };
});
beforeAll(async () => {
  db = new PGlite();
  for (const id of [
    '0001_world_v2_namespace',
    '0002_world_v2_command_event_ledger',
    '0003_world_v2_command_receipts_outbox',
    '0007_world_v2_atomic_transition_facts',
    '0009_world_v2_posting_payload_integrity',
    '0011_world_v2_current_commit_authorization',
    '0013_world_v2_read_projection_boundary',
    '0016_world_v2_opening_seed',
  ])
    await db.exec(await read(`database/migrations/artifacts/${id}.sql`));
  await db.exec(
    await read('database/proposals/runtime-read-binding-storage.sql'),
  );
  await db.exec(
    await read('database/proposals/runtime-admission-publication.sql'),
  );
  await db.exec(
    await read('database/proposals/postwar-office-derived-read.sql'),
  );
  await db.exec(
    await read('database/proposals/postwar-social-current-derived-read.sql'),
  );
  await db.exec(
    await read('database/proposals/postwar-social-current-prefix-read.sql'),
  );
  await db.exec(
    await read('database/proposals/postwar-financial-current-derived-read.sql'),
  );
  await db.exec(
    await read('database/proposals/postwar-day-one-fx-custody.sql'),
  );
  await db.exec(
    await read('database/proposals/postwar-mixed-current-projection-read.sql'),
  );
  await db.exec(
    await read(
      'database/proposals/postwar-mixed-financial-current-publication.sql',
    ),
  );
  const countries = fixtures.map((f) => f.country);
  seed = C.createOpeningSeed(
    {
      schemaVersion: C.OPENING_SEED_SCHEMA_VERSION,
      seedId: C.openingSeedId('SEED_TEST_ONLY_BOUNDED_PROJECTION'),
      worldId: C.worldId(world),
      openingWorldVersion: '0',
      replayBinding: C.CURRENT_REPLAY_BINDING,
      sources: [
        C.createOpeningSource(
          {
            schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
            sourceId: C.openingSourceId('SOURCE_TEST_ONLY_BOUNDED_OPERATING'),
            sourceKind: 'DOCUMENTED_ASSUMPTION',
            locator: 'TEST_ONLY_BOUNDED_SQL_INFRASTRUCTURE',
            sourceVersion: 'TEST_ONLY_SMALL_SOURCE_V1',
            payload: {
              schemaVersion: 'postwar-operating-genesis-seed-source-v1',
              carrier: {
                socialEmployment: {
                  schemaVersion: 'postwar-social-employment-state-v1',
                  inputs: {
                    worldId: world,
                    seedId: 'SEED_TEST_ONLY_BOUNDED_PROJECTION',
                    labour: { positions: fixtures.map((f) => f.wage) },
                    fundingAccounts: fixtures.map((f) => f.funding),
                    populationPositionRefs: fixtures.map((f) => ({
                      positionId: f.wage.positionId,
                      cohortId: 'COHORT_' + f.country.countryId,
                    })),
                  },
                  countries,
                },
                facts: {
                  regions: [
                    { countryId: 'COUNTRY_01', regionId: 'REGION_01_E1' },
                    { countryId: 'COUNTRY_02', regionId: 'REGION_02_E1' },
                  ],
                },
                retainedTestOnlyPadding: 'TEST_ONLY_NOT_RETURNED_'.repeat(
                  30000,
                ),
              },
            },
          },
          sha,
        ),
      ],
      inventoryEntries: [],
      financialBatches: [],
    },
    sha,
  );
  const { fingerprint, ...intent } = seed;
  seedIntentHash = sha(C.canonicalSerialize(intent));
  await db.query('insert into world_v2.world_head values($1,0,0)', [world]);
  await db.query(
    'insert into world_v2.opening_seed values($1,$2,0,$3,$4,$5,now())',
    [
      world,
      seed.seedId,
      C.canonicalSerialize(seed.replayBinding),
      C.canonicalSerialize(intent),
      fingerprint,
    ],
  );
  await db.exec(
    `create role ${admissionPublisher} nologin nosuperuser nobypassrls nocreaterole nocreatedb noreplication; grant usage on schema world_v2 to ${admissionPublisher}; grant execute on function world_v2.publish_runtime_admission_publication(text,text,text)to ${admissionPublisher}; create role projection_test_reader nologin noinherit nosuperuser nobypassrls nocreaterole nocreatedb noreplication;grant world_v2_postwar_projection_reader to projection_test_reader`,
  );
  const now = Date.now(),
    keys = generateKeyPairSync('ed25519'),
    claims = {
      schemaVersion: 'opening-publication-authorization-v1',
      purpose: 'AUTHORIZE_OFFICIAL_OPENING_ADMISSION_PUBLICATION',
      authorizationId: 'AUTHORIZATION_TEST_ONLY_BOUNDED',
      keyId: 'TEST_ONLY_BOUNDED_EPHEMERAL_KEY',
      ownerIdentity: 'TEST_ONLY_NOT_REAL_OWNER',
      issuedAtReal: new Date(now - 60000).toISOString(),
      expiresAtReal: new Date(now + 3600000).toISOString(),
      worldId: world,
      seedId: seed.seedId,
      seedFingerprint: seed.fingerprint,
      modelVersion: seed.replayBinding.modelVersion,
      replayBinding: C.canonicalSerialize(seed.replayBinding),
      sourceBundleSha256: sourceHash,
    };
  const canonical = C.canonicalSerialize(claims),
    signature = sign(
      null,
      Buffer.from(OPENING_PUBLICATION_SIGNATURE_DOMAIN + canonical),
      keys.privateKey,
    );
  expect(
    verify(
      null,
      Buffer.from(OPENING_PUBLICATION_SIGNATURE_DOMAIN + canonical),
      keys.publicKey,
      signature,
    ),
  ).toBe(true);
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
      sourceHash,
      admissionPublisher,
      claims.issuedAtReal,
      claims.expiresAtReal,
    ],
  );
  await admin();
  await db.exec('set session authorization ' + admissionPublisher);
  await db.query(
    'select world_v2.publish_runtime_admission_publication($1,$2,$3)',
    [claims.authorizationId, sha(canonical), sourceHash],
  );
  admissionRef = 'ADMISSION_' + sha(canonical).toUpperCase();
  await admin();
  for (const [who, countryId] of [
    [subject, 'COUNTRY_01'],
    [other, 'COUNTRY_02'],
  ] as const) {
    await db.query(
      "insert into world_v2.current_commit_authorization values($1,$2::uuid,$3,'SOCIAL','SOCIAL_LABOUR','TEAM_TEST_ONLY','REV_TEST_ONLY',true,now())",
      [world, who, countryId],
    );
    await db.query(
      "insert into world_v2.runtime_read_seat(world_id,auth_subject,country_id,office_id,team_id,authorization_revision)values($1,$2::uuid,$3,'SOCIAL','TEAM_TEST_ONLY','REV_TEST_ONLY')",
      [world, who, countryId],
    );
    await db.query(
      "insert into world_v2.projection_entitlement values($1,$2::uuid,'OFFICE_PRIVATE',$3,'REV_TEST_ONLY',true,now(),null)",
      [
        world,
        who,
        'OFFICE_' +
          Buffer.from(countryId).toString('hex').toUpperCase() +
          '_' +
          Buffer.from('SOCIAL').toString('hex').toUpperCase(),
      ],
    );
  }
  await publish();
  await publish('COUNTRY_02');
  await publish('COUNTRY_01', 'offers');
  await publish('COUNTRY_01', 'service-pools');
  await publish('COUNTRY_02', 'service-pools');
}, 60_000);
afterEach(async () => {
  await admin();
});
afterAll(async () => {
  await db.close();
});
/** These are explicit TEST_ONLY SQL infrastructure fixtures, not full source
 * adoption or Core economic approval. Real two-country Core/native is separate. */
type Frame = C.V08AuthoritativeLedgerTransition & {
  readonly receipt: C.FinalCommandReceipt;
  readonly events: readonly C.AuthoritativeEvent[];
};
let frames: Frame[] = [];
const coreHash = (v: unknown) =>
  'sha256:' + sha('SHA-256\n' + C.canonicalSerialize(v));
async function begin() {
  await admin();
  await db.exec('begin');
  frames = [];
}
async function position(
  index: number,
  options: {
    foreignFunding?: boolean;
    positionId?: string;
    unknownEvent?: boolean;
  } = {},
) {
  const f = fixtures[index]!,
    countryId = f.country.countryId,
    version = frames.length + 1,
    id = 'COMMAND_PREFIX_' + version,
    positionId = options.positionId ?? 'POSITION_NEW_' + countryId;
  const intent = {
    schemaVersion: 'social-employment-position-offer-create-v1',
    positionId,
    locationId: f.wage.locationId,
    skill: 'HIGH',
    publicService: 'PUBLIC_SAFETY',
    occupation: 'GENERAL',
    requiredCount: '1',
    wageScheduleRef: f.wage.positionId,
    fundingAccountId: f.funding.accountRef,
    coverageDays: '1',
  };
  const command = C.parseCanonicalCommand(
    {
      schemaVersion: 'command-v1',
      commandId: id,
      commandType: 'CORE_SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATE_V1',
      actorId: 'ACTOR_TEST_ONLY_PREFIX',
      authSubject: index === 0 ? subject : other,
      worldId: world,
      countryId,
      officeId: 'SOCIAL',
      expectedWorldVersion: String(version - 1),
      idempotencyKey: 'IDEMPOTENCY_' + id,
      correlationId: 'CORRELATION_' + id,
      simTime: String(version),
      submittedAtReal: '2026-10-28T00:00:00.000Z',
      payload: intent,
    },
    sha,
  );
  const funding = options.foreignFunding
    ? fixtures[1 - index]!.funding
    : f.funding;
  const offer = {
    positionId,
    countryId,
    locationId: f.wage.locationId,
    skill: 'HIGH',
    employerId: funding.payerEntityId,
    employerRole: 'GOV',
    legalPositionRef: 'LEGAL_' + id,
    payrollFundingRef: 'RESERVE_' + id,
    offerVersion: 'OFFER_' + id,
    state: 'ACTIVE',
    wageVersion: f.wage.wageVersion,
    amount: '360',
    currency: 'XAA',
    period: 'SIM_YEAR',
    validFromDayIndex: '0',
    validUntilDayIndex: '1',
  };
  const reservation = {
    reservationId: 'RESERVE_' + id,
    positionId,
    accountId: funding.accountRef,
    employerId: funding.payerEntityId,
    countryId,
    amount: '1',
    currency: 'XAA',
    coverageDays: '1',
    exactAnnualNumerator: '360',
    denominator: '360',
    state: 'RESERVED_NOT_PAID',
  };
  const state = {
    schemaVersion: 'social-employment-position-lifecycle-v1',
    employment: {
      ...f.country.state,
      labour: {
        ...f.country.state.labour,
        positions: [
          ...f.country.state.labour.positions,
          {
            ...f.country.state.labour.positions[0],
            positionId,
            requiredCount: '1',
            employedCount: '0',
          },
        ],
      },
    },
    offers: [offer],
    reservations: [reservation],
    operations: [],
  };
  const wire = JSON.parse(C.canonicalSerialize(command)) as Record<
    string,
    unknown
  >;
  delete wire.fingerprint;
  delete wire.payloadHash;
  delete wire.canonicalPayload;
  wire.payload = intent;
  const facts = {
    governmentEntityId: funding.payerEntityId,
    centralBankEntityId: funding.issuerEntityId,
    wageSchedule: {
      scheduleId: f.wage.positionId,
      countryId,
      amount: '360',
      currency: 'XAA',
      period: 'SIM_YEAR',
      wageVersion: f.wage.wageVersion,
    },
    funding: {
      accountId: funding.accountRef,
      countryId: funding.countryId,
      ownerId: funding.payerEntityId,
      currency: 'XAA',
    },
    employment: {
      populationAvailability: f.populationAvailability,
      minimumWage: f.country.minimumWage,
    },
  };
  const event = C.parseAuthoritativeEvent(
    {
      schemaVersion: 'event-v1',
      eventId: 'EVENT_' + id,
      eventType: options.unknownEvent
        ? 'UNKNOWN_TEST_ONLY_PREFIX_V1'
        : 'SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATED_V1',
      worldId: world,
      causationCommandId: id,
      correlationId: command.correlationId,
      worldVersion: String(version),
      sequence: String(version),
      simTime: String(version),
      recordedAtReal: '2026-10-28T00:00:00.000Z',
      correctsEventId: null,
      payload: {
        schemaVersion: 'social-employment-position-offer-event-v1',
        command: wire,
        readFacts: facts,
        offer,
        reservation,
        beforeStateHash: coreHash(f.country.state),
        afterStateHash: coreHash(state),
      },
    },
    sha,
  );
  const transition = C.createAuthoritativeTransition({
      command,
      worldVersionBefore: String(version - 1),
      worldVersionAfter: String(version),
      events: [event],
    }),
    receipt = C.createFinalCommandReceipt({
      command,
      outcome: 'COMMITTED',
      reasonCode: null,
      transition,
      simTime: command.simTime,
      recordedAtReal: event.recordedAtReal,
    });
  frames.push({
    command,
    transition,
    receipt,
    events: [event],
    inventoryPostings: [],
    financialPostingBatches: [],
  });
  await db.query(
    'insert into world_v2.command_submission values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)',
    [
      world,
      id,
      command.idempotencyKey,
      command.commandType,
      command.schemaVersion,
      command.canonicalPayload,
      command.payloadHash,
      command.fingerprint,
      command.authSubject,
      command.actorId,
      countryId,
      command.officeId,
      command.expectedWorldVersion,
      command.simTime.toCanonicalValue(),
      command.correlationId,
      command.submittedAtReal,
    ],
  );
  await db.query(
    'insert into world_v2.authoritative_event values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
    [
      world,
      event.eventId,
      event.sequence,
      event.worldVersion,
      id,
      command.correlationId,
      event.eventType,
      event.schemaVersion,
      event.canonicalPayload,
      event.payloadHash,
      event.fingerprint,
      event.simTime.toCanonicalValue(),
      event.recordedAtReal,
      null,
    ],
  );
  await db.query(
    "insert into world_v2.command_receipt values($1,$2,$3,'command-receipt-v2',$4,'COMMITTED',null,$2,$5,$6,$7,$8::jsonb,$9)",
    [
      world,
      id,
      command.idempotencyKey,
      command.fingerprint,
      String(version - 1),
      String(version),
      String(version),
      JSON.stringify([event.eventId]),
      receipt.recordedAtReal,
    ],
  );
  await db.query(
    'insert into world_v2.current_materialization values($1,$2,$3,$4,$5,$6)',
    [
      world,
      'SOCIAL_POSITION_LIFECYCLE_' + countryId,
      version,
      id,
      C.canonicalSerialize(state),
      coreHash(state),
    ],
  );
  await db.query(
    'update world_v2.world_head set world_version=$2,event_sequence=$2 where world_id=$1',
    [world, version],
  );
}
function pins() {
  return [
    coreHash({
      worldId: world,
      seedFingerprint: seed.fingerprint,
      headWorldVersion: String(frames.length),
      headEventSequence: String(frames.length),
      frames,
    }),
    coreHash(
      frames.map((f) => ({
        commandId: f.command.commandId,
        countryId: f.command.countryId,
        commandType: f.command.commandType,
        transitionFingerprint: coreHash(f.transition),
        receiptFingerprint: coreHash(f.receipt),
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
  ];
}
async function publishMixed(
  country = 'COUNTRY_01',
  change: Record<string, unknown> = {},
) {
  const material = await db.query<{ canonical_payload: string }>(
    'select canonical_payload from world_v2.current_materialization where world_id=$1 and materialization_key=$2',
    [world, 'SOCIAL_POSITION_LIFECYCLE_' + country],
  );
  const state = material.rows[0]
    ? JSON.parse(material.rows[0].canonical_payload)
    : {
        employment: fixtures.find((f) => f.country.countryId === country)!
          .country.state,
      };
  const [prefix, effects] = pins(),
    last = frames.at(-1)!.events.at(-1)!;
  const assertion = {
    head: {
      worldId: world,
      worldVersion: String(frames.length),
      eventSequence: String(frames.length),
    },
    seedPins: {
      worldId: world,
      seedId: seed.seedId,
      seedFingerprint: seed.fingerprint,
      admissionRef,
    },
    coverage: {
      prefixFingerprint: prefix,
      knownEffectsFingerprint: effects,
      coveredThroughEventId: last.eventId,
      coveredThroughEventFingerprint: last.fingerprint,
      financialPostingCount: '0',
      financialBatchCount: '0',
      financialPostingsFingerprint: coreHash([]),
    },
    employmentStateHash: coreHash(state.employment),
    materializationHash: coreHash(material.rows[0] ? state : state.employment),
    positionsHash: coreHash(state.employment.labour.positions),
    servicePoolsHash: coreHash(state.employment.servicePools),
    ...change,
  };
  await db.exec('set local role ' + publisher);
  try {
    return await db.query(
      'select * from world_v2.publish_postwar_mixed_social_current($1,$2,$3)',
      [world, country, C.canonicalSerialize(assertion)],
    );
  } finally {
    await db.exec('reset role').catch(() => {});
  }
}
async function mixedPage(
  dataset = 'positions',
  who = subject,
  version: string | null = null,
  offset = 0,
  limit = 100,
) {
  await db.exec(
    'set local session authorization projection_test_reader;set local role ' +
      reader,
  );
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [who]);
  return db.query<{
    status: string;
    source: Record<string, unknown>;
    scope: Record<string, unknown>;
    page: Record<string, unknown>;
    rows_text: string;
  }>(
    'select * from world_v2.read_postwar_mixed_current_page($1,$2,$3,$4,$5,$6)',
    [world, 'SOCIAL', dataset, offset, limit, version],
  );
}
async function prepare() {
  await begin();
  await db.query('select world_v2.prepare_postwar_social_prefix_scopes($1)', [
    world,
  ]);
}
describe('mixed current SQL infrastructure (TEST_ONLY, not native/Core adoption)', () => {
  it('installs fixed functions with no reader table SELECT or private-helper execution', async () => {
    await readerSession();
    await expect(
      db.query('select * from world_v2.postwar_mixed_current_document'),
    ).rejects.toThrow('permission denied');
    await admin();
    await readerSession();
    await expect(
      db.query('select * from world_v2.postwar_mixed_current_prefix($1)', [
        world,
      ]),
    ).rejects.toThrow('permission denied');
  });
  it('derives two immutable bounded pages from actual stored materialization and complete prefix', async () => {
    await prepare();
    await position(0);
    expect((await publishMixed()).rows).toHaveLength(2);
    const first = await mixedPage();
    expect(first.rows[0]!.status).toBe('PAGE');
    const src = first.rows[0]!.source,
      coverage = src.currentPrefixCoverage as Record<string, unknown>;
    expect(coverage.schemaVersion).toBe(
      'postwar-social-current-prefix-coverage-v3',
    );
    expect(coverage.financialPostingCount).toBe('0');
    expect(src.worldVersion).toBe('1');
    expect(src.originWorldVersion).toBe('1');
    expect(src.observedHead).toEqual({ worldVersion: '1', eventSequence: '1' });
    expect(JSON.parse(first.rows[0]!.rows_text)).toHaveLength(2);
  });
  it('keeps foreign country unchanged at origin zero without claiming committed state', async () => {
    await prepare();
    await position(0);
    expect((await publishMixed('COUNTRY_02')).rows).toHaveLength(2);
    const result = await mixedPage('positions', other),
      src = result.rows[0]!.source;
    expect(result.rows[0]!.scope.countryId).toBe('COUNTRY_02');
    expect(src.originWorldVersion).toBe('0');
    expect(src.worldVersion).toBe('1');
    expect(src.currentStateBinding).toBeUndefined();
    expect(
      (src.currentPrefixCoverage as Record<string, unknown>).stateOrigin,
    ).toBe('ADMITTED_OPENING_SOURCE');
  });
  it('rejects mismatching assertions instead of publishing caller rows', async () => {
    await prepare();
    await position(0);
    await expect(
      publishMixed('COUNTRY_01', { positionsHash: 'sha256:' + '0'.repeat(64) }),
    ).rejects.toThrow('STATE_MISMATCH');
  });
  it('keeps unknown effects unavailable', async () => {
    await prepare();
    await position(0, { unknownEvent: true });
    await expect(publishMixed()).rejects.toThrow();
  });
  it('distinguishes missing publication from EMPTY and invalidates cursor after uncovered head', async () => {
    await prepare();
    await position(0);
    expect((await mixedPage()).rows[0]!.status).toBe('UNAVAILABLE');
    await db.exec('reset role;set session authorization postgres');
    await publishMixed();
    const result = await mixedPage(),
      version = String(result.rows[0]!.source.sourceVersion);
    await db.exec('reset role;set session authorization postgres');
    await db.query(
      'update world_v2.world_head set world_version=2,event_sequence=2 where world_id=$1',
      [world],
    );
    expect(
      (await mixedPage('positions', subject, version)).rows[0]!.status,
    ).toBe('STALE');
  });
  it('enforces cursor binding and fresh current authority at every read', async () => {
    await prepare();
    await position(0);
    await publishMixed();
    const first = await mixedPage('positions', subject, null, 0, 1),
      v = String(first.rows[0]!.source.sourceVersion);
    expect(first.rows[0]!.page.nextOffset).toBe(1);
    expect(
      JSON.parse(
        (await mixedPage('positions', subject, v, 1, 1)).rows[0]!.rows_text,
      ),
    ).toHaveLength(1);
    await db.exec('reset role;set session authorization postgres');
    await db.query(
      'update world_v2.current_commit_authorization set active=false where world_id=$1 and auth_subject=$2::uuid',
      [world, subject],
    );
    expect((await mixedPage()).rows[0]!.status).toBe('DENIED');
  });
});

describe('SQL canonical FX batch transport from actual TEST_ONLY Core settlement', () => {
  it('checks raw payload hash before restoring fingerprint metadata; rejects DTO and corrupt bytes', async () => {
    const original = mixedFinancialFixture(),
      frame = await mixedFxFrame({
        financial: original.financial,
        original,
        sequence: '1',
        identity: 'MIXED_PROJECTION_BATCH_SHAPE',
        treasuryReservedAmount: '900',
        bankGcuReservedAmount: '10',
      });
    for (const batch of frame.financialPostingBatches) {
      const { fingerprint, ...intent } = batch,
        raw = sourceCanonicalSerialize(intent);
      const restored = await db.query<{ value: unknown }>(
        'select world_v2.postwar_mixed_current_batch($1,$2,$3)as value',
        [raw, fingerprint, batch.batchId],
      );
      expect(restored.rows[0]!.value).toEqual(
        JSON.parse(sourceCanonicalSerialize(batch)),
      );
      await expect(
        db.query('select world_v2.postwar_mixed_current_batch($1,$2,$3)', [
          raw + ' ',
          fingerprint,
          batch.batchId,
        ]),
      ).rejects.toThrow('CANONICAL_BATCH_INVALID');
      await admin();
      await expect(
        db.query('select world_v2.postwar_mixed_current_batch($1,$2,$3)', [
          sourceCanonicalSerialize(batch),
          fingerprint,
          batch.batchId,
        ]),
      ).rejects.toThrow('CANONICAL_BATCH_INVALID');
      await admin();
      await expect(
        db.query('select world_v2.postwar_mixed_current_batch($1,$2,$3)', [
          raw,
          'sha256:' + '0'.repeat(64),
          batch.batchId,
        ]),
      ).rejects.toThrow('CANONICAL_BATCH_INVALID');
      await admin();
    }
  });
});
