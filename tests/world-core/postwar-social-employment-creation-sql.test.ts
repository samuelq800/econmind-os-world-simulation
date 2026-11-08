/** Actual SQL over explicit TEST_ONLY small admitted originals and genuine
 * Core-calculated frames. This does not certify an official E03 installation,
 * Worker authorization/Atomic execution, native PG, HTTP or production. */
import { readFile } from 'node:fs/promises';
import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import * as C from '../../packages/core/src/index.js';
import { OPENING_PUBLICATION_SIGNATURE_DOMAIN } from '../../apps/world-worker/src/admission/private-opening-admission-authority.js';
import { POSTWAR_PROJECTION_PUBLISH_QUERY } from '../../apps/world-worker/src/persistence/postwar-office-projection-store.js';
const read = (p: string) =>
  readFile(new URL('../../' + p, import.meta.url), 'utf8');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const world = 'WORLD_TEST_ONLY_EMPLOYMENT_CREATION',
  subject = '00000000-0000-4000-8000-000000000001',
  other = '00000000-0000-4000-8000-000000000002';
const admissionPublisher = 'world_v2_opening_admission_test_bounded',
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
    skill: 'HIGH' as const,
    classificationId: 'PUBLIC_SAFETY',
    occupation: 'GENERAL' as const,
    wageAmount: '360',
    wageCurrency: 'XAA',
    wagePeriod: 'SIM_YEAR' as const,
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
  const servicePosition = {
    ...wage,
    positionId: 'SERVICE_' + countryId,
    employerId: 'OP_' + countryId,
    employerRole: 'OP' as const,
    owner: 'PRIVATE_SECTOR' as const,
    classificationId: 'PROFESSIONAL_AND_BUSINESS_SERVICES',
    occupation: 'GENERAL' as const,
    requiredCount: '200',
    sourceWeight: '200',
    payrollFundingRef: 'PAYROLL_SERVICE_' + countryId,
  };
  const actualPosition = {
    ...wage,
    employerRole: 'GOV' as const,
    owner: 'PUBLIC_SERVICE' as const,
    requiredCount: '22',
    sourceWeight: '1',
    payrollFundingRef: 'PAYROLL_' + countryId,
  };
  populationAvailability[0]!.workingAgeAvailable = '300';
  const labour = C.materializeOpeningLabourState({
    targets: [{ countryId, locationId, skill: 'HIGH' as const, count: '201' }],
    positions: [actualPosition, servicePosition],
    populationAvailability,
    skillAvailability: [
      { countryId, locationId, skill: 'HIGH' as const, count: '300' },
    ],
    nonEmployedAggregates: [
      {
        countryId,
        locationId,
        skill: 'HIGH' as const,
        status: 'UNEMPLOYED_SEARCHING',
        count: '99',
      },
    ],
    employers: [
      { countryId, employerId: funding.payerEntityId, role: 'GOV' },
      { countryId, employerId: 'OP_' + countryId, role: 'OP' },
    ],
  }).state;
  const offer: C.SocialEmploymentWageOffer = {
    countryId,
    locationId,
    skill: 'HIGH' as const,
    positionId: wage.positionId,
    employerId: funding.payerEntityId,
    employerRole: 'GOV',
    legalPositionRef: 'LEGAL_TEST_ONLY_SOURCE',
    payrollFundingRef: 'PAYROLL_' + countryId,
    offerVersion: 'OFFER_TEST_ONLY',
    state: 'ACTIVE',
    wageVersion: wage.wageVersion,
    amount: wage.wageAmount,
    currency: 'XAA',
    period: 'SIM_YEAR',
    validFromDayIndex: '0',
    validUntilDayIndex: '1',
  };
  const country = {
    countryId,
    state: {
      schemaVersion: 'social-employment-service-state-v1',
      worldId: world,
      labour,
      servicePools: [
        {
          countryId,
          locationId,
          poolId: 'POOL_' + countryId,
          skill: 'HIGH' as const,
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
    offers: [offer],
    minimumWage,
    validationReadFacts: { facts: { minimumWage, populationAvailability } },
    dutyAssignments: ['EMPLOYMENT_INTAKE', 'EMPLOYMENT_VERIFICATION'].map(
      (duty, i) => ({
        assignmentId: 'DUTY_' + countryId + '_' + i,
        countryId,
        locationId,
        employerId: 'OP_' + countryId,
        employerRole: 'OP',
        occupation: 'GENERAL' as const,
        duty,
        cohortId: 'COHORT_' + countryId,
        positionId: 'SERVICE_' + countryId,
        startOrdinal: String(i),
        workerCount: '1',
        minutesPerWorker: '480',
        totalMinutes: '480',
        payrollFundingRef: 'PAYROLL_SERVICE_' + countryId,
      }),
    ),
    npcUsageLicenses: [
      {
        licenseId: 'LICENCE_' + countryId,
        licensorEntityId: 'OP_' + countryId,
        beneficiaryEntityId: funding.payerEntityId,
        locationId,
        validFromDayIndex: '0',
        validUntilDayIndex: '1',
        dutyAssignmentIds: [
          'DUTY_' + countryId + '_0',
          'DUTY_' + countryId + '_1',
        ],
        maximumWorkerMinutes: '960',
        scope: 'PUBLIC_REFERRALS_ONLY_NOT_EMPLOYER_TRANSFER',
        state: 'GENESIS_USAGE_LICENSE_NOT_PAID_PURCHASE',
        additionalFeeAmount: '0',
        futurePaymentCondition:
          'NEW_PUBLIC_PURCHASE_REQUIRES_SEPARATE_LAWFUL_FUNDED_CONTRACT',
      },
    ],
  };
  country.state.servicePools[0]!.ruleVersion = C.SOCIAL_JOB_MATCH_RULE_VERSION;
  return {
    country,
    wage,
    servicePosition,
    funding,
    populationAvailability,
    offer,
  };
});
beforeAll(async () => {
  db = new PGlite();
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
                documents: [
                  {
                    documentId: 'POSTWAR_FINANCIAL_OFFICE_ORIGINALS',
                    bytes: C.canonicalSerialize({
                      contract: {
                        countries: ['COUNTRY_01', 'COUNTRY_02'].map(
                          (countryId) => ({
                            countryId,
                            cbRegister: {
                              categories: [
                                {
                                  category: 'DOMESTIC_GOVERNMENT_SECURITIES',
                                  disposition: 'NO_DECLARED_INSTRUMENT',
                                },
                              ],
                              holdings: [
                                {
                                  holdingId: 'TGA_' + countryId,
                                  category: 'TREASURY_GOVERNMENT_DEPOSIT',
                                  kind: 'CLAIM',
                                  amount: '1000',
                                  currency: 'XAA',
                                  holderId: 'CB_' + countryId,
                                  counterpartyId: 'GOV_' + countryId,
                                },
                              ],
                            },
                            bankLoans: [],
                          }),
                        ),
                      },
                    }),
                  },
                ],
                socialEmployment: {
                  schemaVersion: 'postwar-social-employment-state-v1',
                  inputs: {
                    worldId: world,
                    seedId: 'SEED_TEST_ONLY_BOUNDED_PROJECTION',
                    labour: {
                      positions: fixtures.flatMap((f) => [
                        f.wage,
                        f.servicePosition,
                      ]),
                      employers: fixtures.flatMap((f) => [
                        {
                          countryId: f.country.countryId,
                          employerId: f.funding.payerEntityId,
                          role: 'GOV',
                        },
                        {
                          countryId: f.country.countryId,
                          employerId: 'OP_' + f.country.countryId,
                          role: 'OP',
                        },
                      ]),
                    },
                    fundingAccounts: fixtures.map((f) => f.funding),
                    populationPositionRefs: fixtures.map((f) => ({
                      positionId: f.wage.positionId,
                      cohortId: 'COHORT_' + f.country.countryId,
                    })),
                  },
                  policy: {
                    version: 'POSTWAR_SOCIAL_EMPLOYMENT_20261028_V1',
                    authorizationReference:
                      'Sentinel_a619bdbe25588191aa05709db76c7567',
                    npcMandate:
                      'FINITE_T0_NONEXCLUSIVE_PUBLIC_REFERRAL_ACCESS_TO_OP_EMPLOYMENT_DESKS',
                    mandateFee: 'NO_ADDITIONAL_T0_FEE_OR_TRANSFER',
                    period: 'ONE_INITIAL_SIM_DAY_ONLY',
                    futurePaymentCondition:
                      'NEW_PUBLIC_PURCHASE_REQUIRES_SEPARATE_LAWFUL_FUNDED_CONTRACT',
                  },
                  countries,
                },
                facts: {
                  regions: [
                    { countryId: 'COUNTRY_01', regionId: 'REGION_01_E1' },
                    { countryId: 'COUNTRY_02', regionId: 'REGION_02_E1' },
                  ],
                },
              },
            },
          },
          sha,
        ),
        C.createOpeningSource(
          {
            schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
            sourceId: C.openingSourceId('SOURCE_TEST_ONLY_FINANCIAL'),
            sourceKind: 'DOCUMENTED_ASSUMPTION',
            locator: 'TEST_ONLY_CB_FINANCIAL_SQL_SOURCE',
            sourceVersion: 'TEST_ONLY_NO_DECLARED_INSTRUMENT_V1',
            payload: {
              schemaVersion: 'adopted-financial-opening-source-v2',
              assembly: {
                countries: ['COUNTRY_01', 'COUNTRY_02'].map((countryId) => ({
                  countryId,
                  roster: {
                    government: 'GOV_' + countryId,
                    centralBank: 'CB_' + countryId,
                    bank: 'BANK_' + countryId,
                  },
                })),
              },
            },
          },
          sha,
        ),
      ],
      inventoryEntries: [],
      financialBatches: [
        {
          batchId: C.financialOpeningBatchId('CB_READ_TEST_ONLY_OPENING'),
          sourceId: C.openingSourceId('SOURCE_TEST_ONLY_FINANCIAL'),
          settlementCurrency: 'XAA',
          legs: [
            [
              'GOV_COUNTRY_01',
              'CB_COUNTRY_01',
              'ASSET',
              'CLAIM_CB_READ_TGA',
              '1000',
            ],
            [
              'CB_COUNTRY_01',
              'GOV_COUNTRY_01',
              'LIABILITY',
              'CLAIM_CB_READ_TGA',
              '1000',
            ],
            [
              'BANK_COUNTRY_01',
              'CB_COUNTRY_01',
              'ASSET',
              'CLAIM_CB_READ_RESERVE',
              '100',
            ],
            [
              'CB_COUNTRY_01',
              'BANK_COUNTRY_01',
              'LIABILITY',
              'CLAIM_CB_READ_RESERVE',
              '100',
            ],
          ].map(([owner, counterparty, accountClass, claim, amount], i) => ({
            legId: C.financialOpeningLegId('CB_READ_LEG_' + i),
            counterpartLegId: C.financialOpeningLegId(
              'CB_READ_LEG_' + (i % 2 ? i - 1 : i + 1),
            ),
            account: C.createFinancialAccount({
              worldId: C.worldId(world),
              countryId: C.countryId('COUNTRY_01'),
              accountId: C.financialAccountId('CB_READ_ACCOUNT_' + i),
              ownerId: C.legalEntityId(owner!),
              counterpartyEntityId: C.legalEntityId(counterparty!),
              accountClass: accountClass === 'ASSET' ? 'ASSET' : 'LIABILITY',
              claimId: C.financialClaimId(claim!),
              currency: 'XAA',
            }),
            direction: i % 2 ? ('CREDIT' as const) : ('DEBIT' as const),
            amount: C.Money.from(amount!, 'XAA'),
          })),
        },
      ],
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
  await admin();
  await db.exec(await read('database/proposals/social-operating-custody.sql'));
  await db.exec(await read('database/proposals/finance-budget-custody.sql'));
  await db.exec(
    await read('database/proposals/finance-budget-mixed-source.sql'),
  );
  await db.exec(
    await read('database/proposals/social-operating-match-publisher.sql'),
  );
  await db.exec(
    await read('database/proposals/postwar-social-mixed-match-publisher.sql'),
  );
  await db.exec(
    await read('database/proposals/postwar-social-paged-match-publisher.sql'),
  );
  // Execute the actual final frame-fold override as well, without installing
  // unrelated Industry source custodians in this deliberately small fixture.
  const finalIndustry = await read(
    'database/proposals/postwar-mixed-industry-current-effects.sql',
  );
  await db.exec(
    finalIndustry.slice(
      finalIndustry.indexOf(
        'create or replace function world_v2.postwar_apply_current_frame_page(',
      ),
      finalIndustry.indexOf(
        'revoke create on schema world_v2 from world_v2_industry_source_owner',
      ),
    ),
  );

  await db.exec(
    await read('database/proposals/postwar-social-employment-creation.sql'),
  );
  await db.exec('set role world_v2_postwar_projection_owner');
  await db.query('select world_v2.prepare_postwar_social_prefix_scopes($1)', [
    world,
  ]);
  await admin();
}, 60_000);

afterEach(async () => {
  await admin();
});
afterAll(async () => {
  await db.close();
});
async function prepareLicences() {
  await admin();
  await db.exec('set role ' + publisher);
  return db.query<{
    prepare_postwar_social_employment_creation_licences: number;
  }>(
    'select world_v2.prepare_postwar_social_employment_creation_licences($1)',
    [world],
  );
}
function command(
  id: string,
  type: string,
  version: string,
  payload: unknown,
  change: Record<string, unknown> = {},
) {
  return C.parseCanonicalCommand(
    {
      schemaVersion: C.COMMAND_SCHEMA_VERSION,
      worldId: world,
      countryId: 'COUNTRY_01',
      officeId: 'SOCIAL',
      actorId: 'ACTOR_TEST_ONLY_SOCIAL',
      authSubject: subject,
      commandId: id,
      idempotencyKey: id,
      commandType: type,
      expectedWorldVersion: version,
      simTime: '10000',
      submittedAtReal: '2026-11-08T00:00:00.000Z',
      correlationId: 'TRACE_TEST_ONLY_CREATION',
      payload,
      ...change,
    },
    sha,
  );
}
function creationData() {
  const f = fixtures[0]!,
    state = f.country.state as unknown as C.SocialEmploymentServiceState,
    source = seed.sources[0]!;
  const facts: C.SocialEmploymentServiceCreationReadFacts = {
    boundary: C.createE01DailyBoundary('0'),
    simTime: '10000',
    populationAvailability: f.populationAvailability,
    worldId: world,
    countryId: f.country.countryId,
    head: { worldVersion: '0', eventSequence: '0' },
    governmentEntityId: f.funding.payerEntityId,
    localCurrency: f.funding.currency,
    sourceRef: source.sourceId,
    sourceFingerprint: source.payloadHash,
    sourceRevocations: [],
    usageLicence: f.country
      .npcUsageLicenses[0]! as C.SocialEmploymentServiceCreationReadFacts['usageLicence'],
  };
  const c = command(
    'CREATE_TEST_ONLY_SQL',
    C.SOCIAL_EMPLOYMENT_SERVICE_CREATE_COMMAND,
    '0',
    {
      schemaVersion: 'social-employment-service-create-v1',
      programmeId: 'PROGRAMME_TEST_ONLY_SQL',
      capacity: { amount: '4', unit: 'person' },
      budget: { amount: '0', currency: f.funding.currency },
      target: {
        servicePoolId: state.servicePools[0]!.poolId,
        locationId: state.servicePools[0]!.locationId,
        skill: 'HIGH' as const,
      },
    },
  );
  const op = C.prepareSocialEmploymentServiceCreation({
    command: c,
    state,
    readFacts: facts,
    sha256Hex: sha,
  });
  return { f, state, facts, c, op };
}
async function scoped(c: C.CanonicalCommand, payload: unknown, seq = '1') {
  await admin();
  await db.exec('begin;set local role world_v2_postwar_projection_owner');
  await db.query(
    "select set_config('econmind.postwar_projection_world',$1,true)",
    [world],
  );
  const r = await db.query<{ ok: boolean }>(
    'select world_v2.postwar_social_employment_creation_effect_scoped($1,$2,$3::jsonb,$4::jsonb,$5::bigint)ok',
    [
      world,
      c.countryId,
      C.canonicalSerialize(c),
      C.canonicalSerialize(payload),
      seq,
    ],
  );
  await db.exec('commit');
  return r.rows[0]!.ok;
}
describe('actual SQL licence supplement over TEST_ONLY genuine Core opening data', () => {
  it('derives licences only from the admitted original; keeps old scope bytes, repeats exactly, and denies the online reader', async () => {
    await admin();
    const before = await db.query(
      'select country_id,scope_document,scope_sha256 from world_v2.postwar_social_prefix_scope order by country_id',
    );
    expect(
      (await prepareLicences()).rows[0]!
        .prepare_postwar_social_employment_creation_licences,
    ).toBe(2);
    expect(
      (await prepareLicences()).rows[0]!
        .prepare_postwar_social_employment_creation_licences,
    ).toBe(2);
    await admin();
    expect(
      (
        await db.query(
          'select country_id,scope_document,scope_sha256 from world_v2.postwar_social_prefix_scope order by country_id',
        )
      ).rows,
    ).toEqual(before.rows);
    const rows = await db.query<{ canonical_licence: string }>(
      'select canonical_licence from world_v2.postwar_social_employment_creation_licence order by country_id',
    );
    expect(rows.rows.map((r) => JSON.parse(r.canonical_licence))).toEqual(
      fixtures.map((f) => f.country.npcUsageLicenses[0]),
    );
    await readerSession();
    await expect(
      db.query(
        'select world_v2.prepare_postwar_social_employment_creation_licences($1)',
        [world],
      ),
    ).rejects.toThrow('permission denied');
    await admin();
    await readerSession();
    await expect(
      db.query(
        'select * from world_v2.postwar_social_employment_creation_licence',
      ),
    ).rejects.toThrow('permission denied');
  });
  it('accepts genuine Core CREATE source binding and refuses a foreign licence, missing record, invented budget or altered source', async () => {
    await prepareLicences();
    const x = creationData();
    expect(await scoped(x.c, x.op.eventPayload)).toBe(true);
    const event = x.op.eventPayload! as unknown as Record<string, unknown>,
      facts = x.facts;
    for (const patch of [
      { usageLicence: fixtures[1]!.country.npcUsageLicenses[0] },
      {
        usageLicence: { ...facts.usageLicence, licenseId: 'MISSING_TEST_ONLY' },
      },
      { sourceFingerprint: 'sha256:' + 'f'.repeat(64) },
    ])
      expect(
        await scoped(x.c, { ...event, readFacts: { ...facts, ...patch } }),
      ).toBe(false);
    const bad = command(
      'BAD_BUDGET_SQL',
      C.SOCIAL_EMPLOYMENT_SERVICE_CREATE_COMMAND,
      '0',
      {
        ...JSON.parse(x.c.canonicalPayload),
        budget: { amount: '1', currency: 'XAA' },
      },
    );
    expect(await scoped(bad, event)).toBe(false);
  });
});

import {
  prepareFinanceNativeBudgetMixedPrefix,
  readFinanceNativeBudgetMixedPrefix,
  type FinanceNativeBudgetCanonicalFrame,
} from '../../packages/core/src/commands/finance-budget-native.js';
function frame(
  command: C.CanonicalCommand,
  eventType: string,
  payload: unknown,
  seq: string,
): FinanceNativeBudgetCanonicalFrame {
  const event = C.parseAuthoritativeEvent(
      {
        schemaVersion: C.EVENT_SCHEMA_VERSION,
        eventId: 'EVENT_' + command.commandId,
        eventType,
        worldId: world,
        causationCommandId: command.commandId,
        correlationId: command.correlationId,
        worldVersion: (BigInt(command.expectedWorldVersion!) + 1n).toString(),
        sequence: seq,
        simTime: command.simTime.toCanonicalValue(),
        recordedAtReal: '2026-11-08T00:00:00.000Z',
        correctsEventId: null,
        payload,
      },
      sha,
    ),
    transition = C.createAuthoritativeTransition({
      command,
      worldVersionBefore: command.expectedWorldVersion!,
      worldVersionAfter: event.worldVersion,
      events: [event],
    });
  return {
    command,
    events: [event],
    transition,
    receipt: C.createFinalCommandReceipt({
      command,
      transition,
      outcome: 'COMMITTED',
      reasonCode: null,
      simTime: command.simTime,
      recordedAtReal: '2026-11-08T00:00:00.000Z',
    }),
    financialPostingBatches: [],
    inventoryPostings: [],
  };
}
// Controlled TEST_ONLY persistence of actual Core-calculated canonical frames.
// This is SQL replay/publication acceptance, not a Worker authorization/Atomic test.
async function persist(
  f: FinanceNativeBudgetCanonicalFrame,
  state: C.SocialEmploymentServiceState,
) {
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
    "insert into world_v2.command_receipt values($1,$2,$3,'command-receipt-v2',$4,'COMMITTED',null,$2,$5,$6,$7,$8::jsonb,$9)",
    [
      world,
      c.commandId,
      c.idempotencyKey,
      c.fingerprint,
      c.expectedWorldVersion,
      e.worldVersion,
      c.simTime.toCanonicalValue(),
      JSON.stringify([e.eventId]),
      r.recordedAtReal,
    ],
  );
  const raw = C.canonicalSerialize(state),
    stateHash = 'sha256:' + sha('SHA-256\n' + raw);
  await db.query(
    'insert into world_v2.current_materialization values($1,$2,$3,$4,$5,$6) on conflict(world_id,materialization_key) do update set world_version=excluded.world_version,source_command_id=excluded.source_command_id,canonical_payload=excluded.canonical_payload,payload_sha256=excluded.payload_sha256',
    [
      world,
      'SOCIAL_EMPLOYMENT_SERVICE_' + c.countryId,
      e.worldVersion,
      c.commandId,
      raw,
      stateHash,
    ],
  );
  await db.query(
    'update world_v2.world_head set world_version=$2,event_sequence=$3 where world_id=$1',
    [world, e.worldVersion, e.sequence],
  );
}
it('replays real Core CREATE→child PLAN→MATCH from stored SQL and retains the physical parent capacity, with no economic postings', async () => {
  await prepareLicences();
  const x = creationData(),
    scope = x.state.servicePools[0]!,
    position = x.state.labour.positions.find(
      (p) => p.positionId === x.f.wage.positionId,
    )!;
  const offer = x.f.offer;
  const readFacts: C.SocialEmploymentReadFacts = {
    boundary: C.createE01DailyBoundary('0'),
    simTime: '10000',
    populationAvailability: x.f.populationAvailability,
    offer,
    minimumWage: x.f.country.minimumWage as C.SocialEmploymentMinimumWage,
  };
  const p = command(
      'PLAN_TEST_ONLY_SQL',
      C.SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
      '1',
      {
        schemaVersion: 'social-employment-service-plan-v1',
        locationId: scope.locationId,
        skill: 'HIGH' as const,
        positionId: position.positionId,
        servicePoolId: x.op.result.servicePoolId,
        requestedMatches: '4',
        dueDayIndex: '0',
      },
    ),
    planned = C.prepareSocialEmploymentServiceOperation({
      command: p,
      state: x.op.state,
      readFacts,
      sha256Hex: sha,
    });
  const m = command(
      'MATCH_TEST_ONLY_SQL',
      C.SOCIAL_JOB_MATCH_DUE_COMMAND,
      '2',
      {
        schemaVersion: 'social-job-match-settlement-v1',
        planCommandId: p.commandId,
        planFingerprint: p.fingerprint,
        dueDayIndex: '0',
        ruleVersion: C.SOCIAL_JOB_MATCH_RULE_VERSION,
      },
      { officeId: null, simTime: '20000' },
    ),
    matched = C.prepareSocialEmploymentServiceOperation({
      command: m,
      state: planned.state,
      readFacts: { ...readFacts, simTime: '20000' },
      sha256Hex: sha,
    });
  expect(matched.result.matched).toBe('4');
  const frames = [
    frame(
      x.c,
      C.SOCIAL_EMPLOYMENT_SERVICE_CREATED_EVENT,
      x.op.eventPayload,
      '1',
    ),
    frame(p, C.SOCIAL_SERVICE_PLAN_EVENT, planned.eventPayload, '2'),
    frame(m, C.SOCIAL_JOB_MATCH_EVENT, matched.eventPayload, '3'),
  ];
  const {
    worldId,
    countryId,
    governmentEntityId,
    localCurrency,
    sourceRef,
    sourceFingerprint,
    populationAvailability,
    usageLicence,
  } = x.facts;
  const evidence = prepareFinanceNativeBudgetMixedPrefix(
    {
      worldId,
      frames,
      socialCountries: [{ countryId, state: x.state, offers: [offer] }],
      socialCreationOriginals: [
        {
          worldId,
          countryId,
          governmentEntityId,
          localCurrency,
          sourceRef,
          sourceFingerprint,
          populationAvailability,
          usageLicences: [usageLicence],
        },
      ],
    },
    sha,
  );
  expect(
    readFinanceNativeBudgetMixedPrefix(evidence, world, frames, sha)
      .socialCountries[0]!.lifecycle.employment,
  ).toEqual(matched.state);
  await admin();
  await db.exec('begin');
  for (const [i, state] of [x.op.state, planned.state, matched.state].entries())
    await persist(frames[i]!, state);
  await db.exec('set local role world_v2_postwar_projection_owner');
  await db.query(
    "select set_config('econmind.postwar_projection_world',$1,true)",
    [world],
  );
  for (const f of frames) {
    const e = f.events[0]!;
    const proof = await db.query<{ ok: boolean }>(
      'select world_v2.postwar_social_prefix_effect_scoped($1,$2,$3,$4::jsonb,$5::jsonb,$6::bigint)ok',
      [
        world,
        f.command.countryId,
        e.eventType,
        C.canonicalSerialize(f.command),
        e.canonicalPayload,
        e.sequence,
      ],
    );
    expect(proof.rows[0]!.ok, f.command.commandId).toBe(true);
  }
  const result = await db.query(
    'select * from world_v2.postwar_social_complete_prefix($1)',
    [world],
  );
  expect(result.rows).toHaveLength(1);
  const origin = await db.query<{
    state: unknown;
    origin_world_version: number;
  }>('select * from world_v2.postwar_social_origin_at_prefix($1,$2)', [
    world,
    countryId,
  ]);
  expect(origin.rows[0]!.state).toEqual(matched.state);
  expect(String(origin.rows[0]!.origin_world_version)).toBe('3');
  const legacy = await db.query<{ state: unknown }>(
    'select * from world_v2.postwar_current_social_witness($1,$2)',
    [world, countryId],
  );
  expect(legacy.rows[0]!.state).toEqual(matched.state);
  expect(
    (
      await db.query(
        'select * from world_v2.postwar_financial_complete_prefix($1)',
        [world],
      )
    ).rows,
  ).toHaveLength(1);
  const folded = await db.query<{
    page: { state: { worldVersion: string }; effects: unknown[] };
  }>('select world_v2.postwar_apply_current_frame_page($1,$2,$3::jsonb)page', [
    world,
    C.canonicalSerialize(frames),
    JSON.stringify({
      worldVersion: '0',
      eventSequence: '0',
      envelopes: [],
      captains: {},
      omos: {},
      rents: {},
    }),
  ]);
  expect(folded.rows[0]!.page.state.worldVersion).toBe('3');
  expect(folded.rows[0]!.page.effects).toHaveLength(3);

  const pool = await db.query<{ p: { poolId: string } }>(
    'select world_v2.postwar_social_created_pool($1,$2,$3,4)p',
    [world, countryId, x.op.result.servicePoolId],
  );
  expect(pool.rows[0]!.p.poolId).toBe(x.op.result.servicePoolId);
  await db.exec('rollback');
  await admin();
  expect(
    (await db.query('select * from world_v2.financial_posting_batch')).rows,
  ).toHaveLength(0);
  expect(
    (await db.query('select * from world_v2.inventory_posting')).rows,
  ).toHaveLength(0);
});

it('keeps all supplementary authority confined to the exact existing inaccessible owners and publisher', async () => {
  await admin();
  const funcs = await db.query<{
    name: string;
    owner: string;
    prosecdef: boolean;
    proconfig: string[];
    reader: boolean;
    publisher: boolean;
    social: boolean;
    finance: boolean;
  }>(`select p.proname name,pg_get_userbyid(p.proowner)owner,p.prosecdef,p.proconfig,
 has_function_privilege('world_v2_postwar_projection_reader',p.oid,'EXECUTE')reader,
 has_function_privilege('world_v2_postwar_projection_publisher',p.oid,'EXECUTE')publisher,
 has_function_privilege('world_v2_social_source_owner',p.oid,'EXECUTE')social,
 has_function_privilege('world_v2_finance_budget_source_owner',p.oid,'EXECUTE')finance
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='world_v2'and p.proname in('prepare_postwar_social_employment_creation_licences','postwar_social_employment_creation_effect_scoped','postwar_social_created_pool')order by p.proname`);
  expect(funcs.rows).toHaveLength(3);
  for (const f of funcs.rows) {
    expect(f.owner).toBe('world_v2_postwar_projection_owner');
    expect(f.prosecdef).toBe(true);
    expect(f.proconfig).toEqual(['search_path=pg_catalog']);
    expect(f.reader).toBe(false);
    expect(f.publisher).toBe(
      f.name === 'prepare_postwar_social_employment_creation_licences',
    );
    expect(f.social).toBe(
      f.name === 'postwar_social_employment_creation_effect_scoped',
    );
    expect(f.finance).toBe(
      f.name !== 'prepare_postwar_social_employment_creation_licences',
    );
  }
  const grants = await db.query(
    `select has_table_privilege('world_v2_postwar_projection_reader','world_v2.postwar_social_employment_creation_licence','SELECT,INSERT,UPDATE,DELETE')r,has_table_privilege('world_v2_postwar_projection_publisher','world_v2.postwar_social_employment_creation_licence','SELECT,INSERT,UPDATE,DELETE')p`,
  );
  expect(grants.rows[0]).toEqual({ r: false, p: false });
  const roles = await db.query<{
    rolcanlogin: boolean;
    rolsuper: boolean;
    rolbypassrls: boolean;
  }>(
    "select rolcanlogin,rolsuper,rolbypassrls from pg_roles where rolname in('world_v2_postwar_projection_owner','world_v2_social_source_owner','world_v2_finance_budget_source_owner')",
  );
  expect(roles.rows).toHaveLength(3);
  expect(
    roles.rows.every((r) => !r.rolcanlogin && !r.rolsuper && !r.rolbypassrls),
  ).toBe(true);
});
