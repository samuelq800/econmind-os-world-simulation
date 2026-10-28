/** Actual selected raw originals; TEST_ONLY miniature signed admission and money.
 * This is SQL/Core infrastructure verification, never an operating approval. */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import * as C from '@econmind/core';
import { loadPostwarSourceContext } from '../../apps/world-worker/src/preparation/postwar-source-context.js';
import { OPENING_PUBLICATION_SIGNATURE_DOMAIN } from '../../apps/world-worker/src/admission/private-opening-admission-authority.js';
import {
  createPostwarIndustryProductionSource,
  inspectPostwarIndustryOriginalDocument,
  PostwarIndustrySourceMissingError,
  POSTWAR_INDUSTRY_SOURCE_ROLES as ROLES,
  POSTWAR_INDUSTRY_SOURCE_REGISTER,
} from '../../apps/world-worker/src/persistence/postwar-industry-production-source.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
const root = path.resolve(import.meta.dirname, '../..'),
  read = (p: string) => readFile(path.join(root, p), 'utf8'),
  sha = (s: string) => createHash('sha256').update(s).digest('hex');
const world = 'WORLD_TEST_ONLY_INDUSTRY_ORIGINALS',
  country = 'COUNTRY_01',
  operator = 'ENTITY_OPERATOR_01',
  bank = 'ENTITY_BANK_01',
  household = 'ENTITY_HOUSEHOLDS_01';
let db: PGlite,
  context: Awaited<ReturnType<typeof loadPostwarSourceContext>>,
  seed: C.OpeningSeed,
  originals: Record<string, string>,
  registrationRows: readonly Record<string, unknown>[],
  authorizationId: string;
let source: ReturnType<typeof createPostwarIndustryProductionSource>;
let opAsset: C.FinancialAccount,
  opLiability: C.FinancialAccount,
  hhAsset: C.FinancialAccount,
  hhLiability: C.FinancialAccount;
const executor: SqlExecutor = {
  async query<Row extends object>(q: string, args: readonly unknown[] = []) {
    const r = await db.query<Row>(q, [...args]);
    return { rows: r.rows, rowCount: r.rows.length };
  },
};
const admin = () =>
  db.exec('rollback;reset role;set session authorization postgres');
async function publisher() {
  await admin();
  await db.exec(
    'begin isolation level repeatable read;set role ' + ROLES.publisher,
  );
}
async function reader() {
  await admin();
  await db.exec(
    'set session authorization test_industry_source_runtime;set role ' +
      ROLES.reader +
      ';begin isolation level repeatable read',
  );
}
function command(countryId = country, version = '0') {
  return C.parseCanonicalCommand(
    {
      schemaVersion: C.COMMAND_SCHEMA_VERSION,
      commandId: 'COMMAND_TEST_ONLY_INDUSTRY_PROBE',
      worldId: world,
      commandType: 'TEST_ONLY_INDUSTRY_SOURCE_PROBE',
      actorId: 'ACTOR_TEST_ONLY',
      authSubject: '11111111-1111-4111-8111-111111111111',
      countryId,
      officeId: 'INDUSTRY',
      expectedWorldVersion: version,
      idempotencyKey: 'TEST_ONLY_SOURCE_PROBE',
      correlationId: 'CORRELATION_TEST_ONLY',
      simTime: '1000',
      submittedAtReal: '2026-10-28T00:00:00.000Z',
      payload: { TEST_ONLY: true },
    },
    sha,
  );
}
function financialSource() {
  const id = (prefix: string, key: string) =>
    `${prefix}_${sha(C.canonicalSerialize([world, country, key, 'XAA'])).toUpperCase()}`;
  const pair = (key: string, owner: string) => {
    const common = {
      worldId: C.worldId(world),
      countryId: C.countryId(country),
      currency: 'XAA',
      claimId: C.financialClaimId(id('CLAIM', key)),
    };
    return [
      C.createFinancialAccount({
        ...common,
        accountId: C.financialAccountId(id('ACCOUNT', key + '_ASSET')),
        accountClass: 'ASSET',
        ownerId: C.legalEntityId(owner),
        counterpartyEntityId: C.legalEntityId(bank),
      }),
      C.createFinancialAccount({
        ...common,
        accountId: C.financialAccountId(id('ACCOUNT', key + '_LIABILITY')),
        accountClass: 'LIABILITY',
        ownerId: C.legalEntityId(bank),
        counterpartyEntityId: C.legalEntityId(owner),
      }),
    ] as const;
  };
  [opAsset, opLiability] = pair('BUSINESS_DEPOSIT', operator);
  [hhAsset, hhLiability] = pair('HOUSEHOLD_DEPOSIT', household);
  return C.createOpeningSource(
    {
      schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: C.openingSourceId('SOURCE_TEST_ONLY_FINANCIAL'),
      sourceKind: 'AUTHORITATIVE_DATASET',
      locator: 'TEST_ONLY_MONEY_NOT_ORIGINAL_SELECTED_FINANCIAL_VALUES',
      sourceVersion: 'TEST_ONLY.1',
      payload: {
        TEST_ONLY: true,
        schemaVersion: 'adopted-financial-opening-source-v2',
        assembly: {
          worldId: world,
          countries: [
            {
              countryId: country,
              roster: { operator, bank, households: household },
            },
          ],
        },
        reconciliations: [
          {
            countryId: country,
            denominations: [
              {
                field: 'businessBankDeposits',
                localBookValue: { amount: '100', currency: 'XAA' },
              },
              {
                field: 'householdBankDeposits',
                localBookValue: { amount: '100', currency: 'XAA' },
              },
            ],
          },
        ],
      },
    },
    sha,
  );
}
function paidFixture(mode: 'fee' | 'transfer' | 'missing-mirror') {
  const at = C.SimTime.fromTicks('1000'),
    c = C.parseCanonicalCommand(
      {
        schemaVersion: C.COMMAND_SCHEMA_VERSION,
        commandId: 'COMMAND_TEST_ONLY_INDUSTRY_PAYMENT',
        worldId: world,
        commandType: 'TEST_ONLY_COST_SETTLEMENT',
        actorId: 'ACTOR_TEST_ONLY',
        authSubject: '11111111-1111-4111-8111-111111111111',
        countryId: country,
        officeId: 'INDUSTRY',
        expectedWorldVersion: '0',
        idempotencyKey: 'TEST_ONLY_PAYMENT_KEY',
        correlationId: 'CORRELATION_TEST_ONLY_PAYMENT',
        simTime: at.toCanonicalValue(),
        submittedAtReal: '2026-10-28T00:00:00.000Z',
        payload: { TEST_ONLY: true, mode },
      },
      sha,
    );
  const e = C.parseAuthoritativeEvent(
      {
        schemaVersion: C.EVENT_SCHEMA_VERSION,
        eventId: 'EVENT_TEST_ONLY_INDUSTRY_PAYMENT',
        worldId: world,
        worldVersion: '1',
        sequence: '1',
        causationCommandId: c.commandId,
        correlationId: c.correlationId,
        eventType: 'TEST_ONLY_COST_SETTLED',
        simTime: at.toCanonicalValue(),
        recordedAtReal: '2026-10-28T00:00:01.000Z',
        correctsEventId: null,
        payload: { TEST_ONLY: true, mode },
      },
      sha,
    ),
    transition = C.createAuthoritativeTransition({
      command: c,
      worldVersionBefore: '0',
      worldVersionAfter: '1',
      events: [e],
    });
  const expense = C.createFinancialAccount({
      ...opAsset,
      accountId: C.financialAccountId('ACCOUNT_TEST_ONLY_COST'),
      accountClass: 'EXPENSE',
      claimId: null,
      counterpartyEntityId: null,
    }),
    revenue = C.createFinancialAccount({
      ...opAsset,
      accountId: C.financialAccountId('ACCOUNT_TEST_ONLY_FEE_REVENUE'),
      ownerId: C.legalEntityId(bank),
      accountClass: 'REVENUE',
      claimId: null,
      counterpartyEntityId: null,
    }),
    hhRevenue = C.createFinancialAccount({
      ...hhAsset,
      accountId: C.financialAccountId('ACCOUNT_TEST_ONLY_HH_REVENUE'),
      accountClass: 'REVENUE',
      claimId: null,
      counterpartyEntityId: null,
    });
  const leg = (
    id: string,
    account: C.FinancialAccount,
    direction: 'DEBIT' | 'CREDIT',
    counterpartyAccountId: C.FinancialAccount['accountId'],
  ) => ({
    legId: C.financialPostingLegId(id),
    account,
    direction,
    amount: C.Money.from('6', 'XAA'),
    counterpartyAccountId,
  });
  const legs = [
    leg('LEG_TEST_ONLY_COST', expense, 'DEBIT', opAsset.accountId),
    leg('LEG_TEST_ONLY_PAYMENT', opAsset, 'CREDIT', expense.accountId),
    ...(mode === 'missing-mirror'
      ? []
      : mode === 'fee'
        ? [
            leg(
              'LEG_TEST_ONLY_BANK_LIABILITY',
              opLiability,
              'DEBIT',
              revenue.accountId,
            ),
            leg(
              'LEG_TEST_ONLY_REVENUE',
              revenue,
              'CREDIT',
              opLiability.accountId,
            ),
          ]
        : [
            leg(
              'LEG_TEST_ONLY_BANK_LIABILITY',
              opLiability,
              'DEBIT',
              hhLiability.accountId,
            ),
            leg(
              'LEG_TEST_ONLY_HH_LIABILITY',
              hhLiability,
              'CREDIT',
              opLiability.accountId,
            ),
            leg(
              'LEG_TEST_ONLY_HH_ASSET',
              hhAsset,
              'DEBIT',
              hhRevenue.accountId,
            ),
            leg(
              'LEG_TEST_ONLY_HH_REVENUE',
              hhRevenue,
              'CREDIT',
              hhAsset.accountId,
            ),
          ]),
  ];
  const batch = C.createFinancialPostingBatch(
    {
      schemaVersion: C.FINANCIAL_POSTING_SCHEMA_VERSION,
      batchId: C.financialPostingBatchId('BATCH_TEST_ONLY_INDUSTRY_PAYMENT'),
      worldId: C.worldId(world),
      causationCommandId: c.commandId,
      causationEventIds: transition.eventIds,
      worldVersionBefore: '0',
      worldVersionAfter: '1',
      simTime: at,
      command: c,
      transition,
      settlementCurrency: 'XAA',
      legs,
    },
    sha,
  );
  const receipt = C.createFinalCommandReceipt({
    command: c,
    transition,
    outcome: 'COMMITTED',
    reasonCode: null,
    simTime: at,
    recordedAtReal: '2026-10-28T00:00:01.000Z',
  });
  return { command: c, event: e, batch, receipt };
}
async function persistPayment(f: ReturnType<typeof paidFixture>) {
  const c = f.command,
    e = f.event,
    b = f.batch,
    r = f.receipt;
  await db.query(
    'insert into world_v2.command_submission(world_id,command_id,idempotency_key,command_type,schema_version,canonical_payload,payload_sha256,command_fingerprint,auth_subject,actor_id,country_id,office_id,expected_world_version,sim_time,correlation_id,submitted_at_real)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)',
    [
      c.worldId,
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
    'insert into world_v2.authoritative_event(world_id,event_id,event_sequence,world_version,causation_command_id,correlation_id,event_type,schema_version,canonical_payload,payload_sha256,event_fingerprint,sim_time,recorded_at_real,corrects_event_id)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
    [
      e.worldId,
      e.eventId,
      e.sequence,
      e.worldVersion,
      e.causationCommandId,
      e.correlationId,
      e.eventType,
      e.schemaVersion,
      e.canonicalPayload,
      e.payloadHash,
      e.fingerprint,
      e.simTime.toCanonicalValue(),
      e.recordedAtReal,
      e.correctsEventId,
    ],
  );
  const { fingerprint, ...body } = b;
  await db.query(
    'insert into world_v2.financial_posting_batch(world_id,batch_id,causation_command_id,world_version_before,world_version_after,sim_time,event_ids,transition_binding,settlement_currency,canonical_payload,batch_fingerprint)values($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11)',
    [
      b.worldId,
      b.batchId,
      b.causationCommandId,
      b.worldVersionBefore,
      b.worldVersionAfter,
      b.simTime.toCanonicalValue(),
      C.canonicalSerialize(b.causationEventIds),
      C.canonicalSerialize(b.transitionBinding),
      b.settlementCurrency,
      C.canonicalSerialize(body),
      fingerprint,
    ],
  );
  await db.query(
    'insert into world_v2.command_receipt(world_id,command_id,idempotency_key,schema_version,command_fingerprint,outcome,reason_code,transition_id,world_version_before,world_version_after,sim_time,event_ids,recorded_at_real)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)',
    [
      r.worldId,
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
      C.canonicalSerialize(r.eventIds),
      r.recordedAtReal,
    ],
  );
  await db.query(
    'update world_v2.world_head set world_version=1,event_sequence=1 where world_id=$1',
    [world],
  );
}
beforeAll(async () => {
  context = await loadPostwarSourceContext(root);
  db = new PGlite();
  await db.exec(
    'create role anon nologin;create role authenticated nologin;create role service_role nologin;create schema storage;create table storage.objects(bucket_id text);alter table storage.objects enable row level security;',
  );
  const manifest = JSON.parse(
    await read('database/migrations/manifest.json'),
  ) as { migrations: { path: string; sha256: string }[] };
  for (const migration of manifest.migrations) {
    const bytes = await read(migration.path);
    expect(sha(bytes)).toBe(migration.sha256);
    await db.exec(bytes);
  }
  for (const p of [
    'runtime-read-binding-storage.sql',
    'runtime-admission-publication.sql',
    'postwar-industry-production-source.sql',
  ])
    await db.exec(await read('database/proposals/' + p));
  const receipt = {
    schemaVersion: 'postwar-physical-service-receipt-v1',
    worldId: world,
    seedId: 'SEED_TEST_ONLY_INDUSTRY_ORIGINALS',
    sourceChecksumsSha256: context.source.pins.checksumsSha256,
    mappingSha256: context.source.pins.mappingSha256,
    ownerOriginalSha256: sha(context.ownerOriginalBytes),
  };
  const receiptBytes = C.canonicalSerialize(receipt),
    regionMappingBytes = await read(
      'config/postwar-genesis/region-mapping.v1.json',
    );
  const operating = C.createOpeningSource(
    {
      schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: C.openingSourceId('SOURCE_TEST_ONLY_SELECTED_PIN_CARRIER'),
      sourceKind: 'DOCUMENTED_ASSUMPTION',
      locator: 'TEST_ONLY_SQL_CUSTODY_NOT_FULL_POSTWAR_CARRIER',
      sourceVersion: 'TEST_ONLY.1',
      payload: {
        schemaVersion: 'postwar-operating-genesis-seed-source-v1',
        carrier: {
          documents: [
            {
              documentId: 'TEST_ONLY_PHYSICAL_SOURCE_PIN_RECEIPT',
              sha256: sha(receiptBytes),
              bytes: receiptBytes,
            },
          ],
          physicalServiceReceiptDocumentId:
            'TEST_ONLY_PHYSICAL_SOURCE_PIN_RECEIPT',
          selectedSource: { regionMappingBytes },
          sourcePins: {
            mapping: context.source.pins.mappingSha256,
            regionMapping: sha(regionMappingBytes),
          },
        },
      },
    },
    sha,
  );
  const financial = financialSource();
  seed = C.createOpeningSeed(
    {
      schemaVersion: C.OPENING_SEED_SCHEMA_VERSION,
      seedId: C.openingSeedId('SEED_TEST_ONLY_INDUSTRY_ORIGINALS'),
      worldId: C.worldId(world),
      openingWorldVersion: '0',
      replayBinding: C.CURRENT_REPLAY_BINDING,
      sources: [operating, financial],
      inventoryEntries: [],
      financialBatches: [
        {
          batchId: C.financialOpeningBatchId('OPENING_TEST_ONLY_DEPOSITS'),
          sourceId: financial.sourceId,
          settlementCurrency: 'XAA',
          legs: [
            [opAsset, opLiability],
            [hhAsset, hhLiability],
          ].flatMap(([asset, liability], index) => {
            const a = C.financialOpeningLegId('ASSET_TEST_ONLY_' + index),
              l = C.financialOpeningLegId('LIABILITY_TEST_ONLY_' + index);
            return [
              {
                legId: a,
                account: asset!,
                direction: 'DEBIT' as const,
                amount: C.Money.from('100', 'XAA'),
                counterpartLegId: l,
              },
              {
                legId: l,
                account: liability!,
                direction: 'CREDIT' as const,
                amount: C.Money.from('100', 'XAA'),
                counterpartLegId: a,
              },
            ];
          }),
        },
      ],
    },
    sha,
  );
  const { fingerprint, ...intent } = seed;
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
  const admissionPublisher = 'world_v2_opening_admission_test_industry';
  await db.exec(
    `create role ${admissionPublisher} nologin nosuperuser nobypassrls nocreaterole nocreatedb noreplication;grant usage on schema world_v2 to ${admissionPublisher};grant execute on function world_v2.publish_runtime_admission_publication(text,text,text)to ${admissionPublisher};create role test_industry_source_runtime nologin noinherit nosuperuser nobypassrls nocreaterole nocreatedb noreplication;grant ${ROLES.reader} to test_industry_source_runtime`,
  );
  const now = Date.now(),
    keys = generateKeyPairSync('ed25519'),
    claims = {
      schemaVersion: 'opening-publication-authorization-v1',
      purpose: 'AUTHORIZE_OFFICIAL_OPENING_ADMISSION_PUBLICATION',
      authorizationId: 'AUTHORIZATION_TEST_ONLY_INDUSTRY_SOURCE',
      keyId: 'TEST_ONLY_EPHEMERAL_INDUSTRY_KEY',
      ownerIdentity: 'TEST_ONLY_NOT_REAL_OWNER',
      issuedAtReal: new Date(now - 60000).toISOString(),
      expiresAtReal: new Date(now + 3600000).toISOString(),
      worldId: world,
      seedId: seed.seedId,
      seedFingerprint: seed.fingerprint,
      modelVersion: seed.replayBinding.modelVersion,
      replayBinding: C.canonicalSerialize(seed.replayBinding),
      sourceBundleSha256: 'b'.repeat(64),
    };
  const canonical = C.canonicalSerialize(claims),
    sig = sign(
      null,
      Buffer.from(OPENING_PUBLICATION_SIGNATURE_DOMAIN + canonical),
      keys.privateKey,
    );
  expect(
    verify(
      null,
      Buffer.from(OPENING_PUBLICATION_SIGNATURE_DOMAIN + canonical),
      keys.publicKey,
      sig,
    ),
  ).toBe(true);
  await db.exec('set role world_v2_admission_release');
  await db.query(
    'insert into world_v2.runtime_admission_publication_permit(authorization_id,authorization_sha256,canonical_authorization,signature_base64url,world_id,seed_id,seed_fingerprint,model_version,replay_binding,source_bundle_sha256,caller_session_role,valid_from,valid_until)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
    [
      claims.authorizationId,
      sha(canonical),
      canonical,
      sig.toString('base64url'),
      world,
      seed.seedId,
      seed.fingerprint,
      claims.modelVersion,
      claims.replayBinding,
      claims.sourceBundleSha256,
      admissionPublisher,
      claims.issuedAtReal,
      claims.expiresAtReal,
    ],
  );
  await admin();
  await db.exec('set session authorization ' + admissionPublisher);
  await db.query(
    'select world_v2.publish_runtime_admission_publication($1,$2,$3)',
    [claims.authorizationId, sha(canonical), claims.sourceBundleSha256],
  );
  authorizationId = claims.authorizationId;
  source = createPostwarIndustryProductionSource({
    sourceContext: context,
    scope: { worldId: world, countryId: country },
    runtimeReaderRole: ROLES.reader,
  });
  originals = Object.fromEntries(
    [
      'facilities',
      'recipes',
      'production-plans',
      'technology-proposals',
      'license-proposals',
      'commodity-catalog',
    ].map((key) => [
      key,
      context.sourceBytes.datasets['data/' + key + '.json']!,
    ]),
  );
  await publisher();
  registrationRows = (await source.registerFrom(executor)).rows;
  await db.exec('commit');
}, 60000);
afterEach(async () => {
  await admin();
});
afterAll(async () => {
  await db?.close();
});
describe('actual pinned Industry source custody, incomplete operations remain typed missing', () => {
  it('registers exactly the two actual COUNTRY01 recipe facilities and original bank claim pairs idempotently', async () => {
    expect(registrationRows.map((r) => r.facility_id).sort()).toEqual([
      'OPEN-01-GRAIN',
      'OPEN-RES098',
    ]);
    await publisher();
    const again = await source.registerFrom(executor);
    expect(again.rows).toEqual(registrationRows);
    await db.exec('commit');
    await admin();
    expect(
      (
        await db.query(
          'select count(*)::int as n from world_v2.postwar_industry_deposit_original',
        )
      ).rows,
    ).toEqual([{ n: 2 }]);
  });
  it('reads exact grain source parameters/OP inherited scope under held source/admission/head locks, never grants tech or paid cost', async () => {
    await reader();
    const seen = await source.readForCommandFrom(executor, {
      command: command(),
      facilityId: 'OPEN-01-GRAIN',
      eventSequence: '0',
    });
    expect(seen.inspected.physical.titleHolderId).toBe(operator);
    expect(seen.inspected.physical.operatingPermission).toBe(
      'OWNER_D04_CONDITIONAL_SITE_SCOPE_NOT_TRANSFERABLE_LICENSE',
    );
    expect(seen.inspected.recipe.waterPerOutput.amount).toBe(
      '1428.5714285714287',
    );
    expect(seen.inspected.recipe.costPerOutput).toBeNull();
    expect(seen.inspected.recipe.labourPerOutput).toEqual({
      amount: '0.5',
      inputUnit: 'tonne',
      outputUnit: 'person_day',
    });
    expect(seen.inspected.sourceLicenseProposals[0]?.status).toBe(
      'PROPOSED_NOT_GRANTED',
    );
    expect(seen.inspected.authority).toBe(false);
    expect(seen.inspected.missing.map((x) => x.code)).toEqual(
      expect.arrayContaining([
        'ACTUAL_MAINTENANCE_RECEIPT_MISSING',
        'PAID_COST_PURPOSE_ORIGINAL_MISSING',
        'CORE_WATER_DEBIT_BINDING_MISSING',
      ]),
    );
  });
  it('the actual atomic cutoff adapter throws typed missing facts before producing any positive observation', async () => {
    await reader();
    const guard = source.createCutoffGuard(null);
    const request = {
      command: command(),
      expectedHead: { worldVersion: '0', eventSequence: '0' },
      posting: {
        evidence: { operating: { payload: { facilityRef: 'OPEN-01-GRAIN' } } },
      },
    } as unknown as import('../../apps/world-worker/src/persistence/industry-production-source-cutoff.js').IndustryProductionCutoffRequest;
    await expect(
      guard.assertCurrentFrom(executor, request),
    ).rejects.toBeInstanceOf(PostwarIndustrySourceMissingError);
  });
  it('rejects raw original drift, arbitrary Ready JSON and wrong-country source registration without partial writes', async () => {
    await publisher();
    await expect(
      db.query(POSTWAR_INDUSTRY_SOURCE_REGISTER, [
        world,
        country,
        context.sourceBytes.checksumsBytes,
        JSON.stringify({ ...originals, recipes: '[]' }),
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    await publisher();
    await expect(
      db.query(POSTWAR_INDUSTRY_SOURCE_REGISTER, [
        world,
        country,
        context.sourceBytes.checksumsBytes,
        JSON.stringify({ Ready: true }),
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    await publisher();
    await expect(
      db.query(POSTWAR_INDUSTRY_SOURCE_REGISTER, [
        world,
        'COUNTRY_02',
        context.sourceBytes.checksumsBytes,
        JSON.stringify(originals),
      ]),
    ).rejects.toMatchObject({ code: '23514' });
  });
  it('requires real command scope/head, denies raw seed/source table reads, DML, publishing and owner escalation to the source reader', async () => {
    await reader();
    await expect(
      source.readForCommandFrom(executor, {
        command: command('COUNTRY_02'),
        facilityId: 'OPEN-01-GRAIN',
        eventSequence: '0',
      }),
    ).rejects.toThrow('ACTUAL_COMMAND_SCOPE_MISMATCH');
    for (const q of [
      'select canonical_payload from world_v2.opening_seed',
      'select * from world_v2.postwar_industry_original',
      "update world_v2.postwar_industry_original set document_text='{}'",
      'set role world_v2_industry_source_owner',
    ]) {
      await reader();
      await expect(db.exec(q)).rejects.toMatchObject({ code: '42501' });
    }
    await reader();
    await expect(source.registerFrom(executor)).rejects.toThrow(
      'SEPARATED_FIXED_ROLE',
    );
    await reader();
    await expect(
      source.readForCommandFrom(executor, {
        command: command(country, '1'),
        facilityId: 'OPEN-01-GRAIN',
        eventSequence: '1',
      }),
    ).rejects.toMatchObject({ code: '40001' });
  });
  it('expands exact scientific source coefficients without JS floating conversion', () => {
    const recipes = JSON.parse(
        context.sourceBytes.datasets['data/recipes.json']!,
      ) as Record<string, unknown>[],
      facilities = JSON.parse(
        context.sourceBytes.datasets['data/facilities.json']!,
      ) as Record<string, unknown>[];
    const r = recipes.find((r) => r.commodityId === 'SEMICONDUCTORS')!,
      f = facilities.find((f) => f.recipeId === r.id)!;
    // Source strings here retain the exact scientific lexemes for pure mapping;
    // the SQL native path uses jsonb numeric text with the same exact value.
    const d = inspectPostwarIndustryOriginalDocument({
      worldId: world,
      countryId: country,
      locationId: 'REGION_01_E1',
      operatorId: operator,
      sourceFacility: {
        ...f,
        capacity: String(f.capacity),
        installedMachineryUnits: String(f.installedMachineryUnits),
      },
      recipe: {
        ...r,
        electricityMWhPerUnit: '0.0001',
        waterM3PerUnit: '0.0001',
        workersPerDailyOutputUnit: '0.001',
        inputsPerUnit: { COPPER: '5e-05', MACHINERY: '1e-06' },
      },
      productionPlans: [],
      technologyProposals: [],
      licenseProposals: [],
      commodityCatalog: JSON.parse(
        context.sourceBytes.datasets['data/commodity-catalog.json']!,
      ),
    });
    expect(d.recipe.materials.map((x) => x.perOutput.amount)).toEqual([
      '0.00005',
      '0.000001',
    ]);
    expect(d.authority).toBe(false);
  });
  it.each(['fee', 'transfer', 'missing-mirror'] as const)(
    'SQL original-deposit proof verifies actual %s batch/receipt and complete mirrored prefix, never an unpaid reserve',
    async (mode) => {
      await admin();
      await db.exec('begin isolation level repeatable read');
      const f = paidFixture(mode),
        args = [
          world,
          country,
          operator,
          'OPEN-01-GRAIN',
          f.batch.batchId,
          f.batch.fingerprint,
          'LEG_TEST_ONLY_COST',
          'LEG_TEST_ONLY_PAYMENT',
          '1',
        ];
      expect(
        (
          await db.query<{ valid: boolean }>(
            'select world_v2.industry_source_paid_deposit($1,$2,$3,$4,$5,$6,$7,$8,$9)as valid',
            args,
          )
        ).rows[0]!.valid,
      ).toBe(false);
      await persistPayment(f);
      expect(
        (
          await db.query<{ valid: boolean }>(
            'select world_v2.industry_source_paid_deposit($1,$2,$3,$4,$5,$6,$7,$8,$9)as valid',
            args,
          )
        ).rows[0]!.valid,
      ).toBe(mode !== 'missing-mirror');
      // Rollback is performed by afterEach; these are TEST_ONLY isolated writes,
      // never a stored operating-cost authority or adopted production price.
    },
  );
  it('append-only revocation refuses subsequent source use; registration never manufactures a permission', async () => {
    await publisher();
    await db.query(
      'select world_v2.revoke_postwar_industry_original($1,$2,$3)',
      [
        world,
        registrationRows.find((r) => r.facility_id === 'OPEN-RES098')!
          .registration_ref,
        'TEST_ONLY_REVOKED',
      ],
    );
    await db.exec('commit');
    await reader();
    await expect(
      source.readForCommandFrom(executor, {
        command: command(),
        facilityId: 'OPEN-RES098',
        eventSequence: '0',
      }),
    ).rejects.toMatchObject({ code: '55000' });
  });
  it('revoked signed admission closes all original reads', async () => {
    await admin();
    await db.exec('set role world_v2_admission_release');
    await db.query(
      'insert into world_v2.runtime_admission_publication_revocation(authorization_id,reason_ref)values($1,$2)',
      [authorizationId, 'TEST_ONLY_ADMISSION_REVOKE'],
    );
    await reader();
    await expect(
      source.readForCommandFrom(executor, {
        command: command(),
        facilityId: 'OPEN-01-GRAIN',
        eventSequence: '0',
      }),
    ).rejects.toMatchObject({ code: '55000' });
  });
});
