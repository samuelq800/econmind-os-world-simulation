/** Complete tiny TEST_ONLY Core source; source/admission/publication SQL below
 * is embedded protocol evidence only, never production admission or a Clock.
 * No 70-country generator, existing cfc seed, service loop or credentials. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { describe, it, expect } from 'vitest';
import * as C from '@econmind/core';
import {
  prepareBeneficialHousingRentSource,
  consumeBeneficialHousingRentSource,
  retireBeneficialHousingRentSource,
} from '../../apps/world-worker/src/persistence/postwar-beneficial-housing-rent-source.js';
import {
  createPostwarBeneficialHousingRentRuntime,
  isPostwarBeneficialHousingRentRuntime,
  isPostwarBeneficialHousingRentSourceCommitProtectionPort,
  BENEFICIAL_HOUSING_RENT_SOURCE_PURPOSE,
} from '../../apps/world-worker/src/persistence/postwar-beneficial-housing-rent-runtime.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';
import { createAuthoritativeWorkerExecution } from '../../apps/world-worker/src/authoritative-execution.js';
import { prepareAtomicTransitionCandidate } from '../../apps/world-worker/src/persistence/atomic-transition-repository.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const at = '2026-10-30T00:00:00.000Z',
  world = 'WORLD_TEST_ONLY_RENT_RUNTIME',
  worker = 'WORKER_TEST_ONLY_RENT',
  clockRef = 'TEST_ONLY_FROZEN_RENT_CLOCK_V1';
function fixture() {
  const source = C.createOpeningSource(
    {
      schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: C.openingSourceId('SOURCE_TEST_ONLY_RENT_PARENT'),
      sourceKind: 'TEST_FIXTURE',
      sourceVersion: 'TEST_ONLY_V1',
      locator:
        'tests/world-core/postwar-beneficial-housing-rent-runtime.test.ts',
      payload: { classification: 'TEST_ONLY_CORE_MECHANISM_NOT_ADMISSION' },
    },
    sha,
  );
  const asset = C.createFinancialAccount({
    worldId: C.worldId(world),
    countryId: C.countryId('COUNTRY_01'),
    ownerId: C.legalEntityId('ENTITY_HOUSEHOLDS_01'),
    accountId: C.financialAccountId('ACCOUNT_HH_TEST_ONLY'),
    accountClass: 'ASSET',
    currency: 'AAA',
    claimId: C.financialClaimId('CLAIM_HH_TEST_ONLY'),
    counterpartyEntityId: C.legalEntityId('ENTITY_BANK_01'),
  });
  const liability = C.createFinancialAccount({
    ...asset,
    accountId: C.financialAccountId('ACCOUNT_BANK_TEST_ONLY'),
    ownerId: C.legalEntityId('ENTITY_BANK_01'),
    accountClass: 'LIABILITY',
    counterpartyEntityId: asset.ownerId,
  });
  const parent = C.createOpeningSeed(
    {
      schemaVersion: C.OPENING_SEED_SCHEMA_VERSION,
      worldId: C.worldId(world),
      seedId: C.openingSeedId('SEED_TEST_ONLY_RENT'),
      openingWorldVersion: '0',
      replayBinding: C.CURRENT_REPLAY_BINDING,
      sources: [source],
      inventoryEntries: [],
      financialBatches: [
        {
          batchId: C.financialOpeningBatchId('OPENING_TEST_ONLY_HH'),
          sourceId: source.sourceId,
          settlementCurrency: 'AAA',
          legs: [
            {
              legId: C.financialOpeningLegId('TEST_ONLY_DEBIT'),
              account: asset,
              direction: 'DEBIT',
              amount: C.Money.from('100.000003', 'AAA'),
              counterpartLegId: C.financialOpeningLegId('TEST_ONLY_CREDIT'),
            },
            {
              legId: C.financialOpeningLegId('TEST_ONLY_CREDIT'),
              account: liability,
              direction: 'CREDIT',
              amount: C.Money.from('100.000003', 'AAA'),
              counterpartLegId: C.financialOpeningLegId('TEST_ONLY_DEBIT'),
            },
          ],
        },
      ],
    },
    sha,
  );
  const locationId = 'REGION_01_E1';
  const child = C.reclassifyBeneficialHousingSeed(
    {
      seed: parent,
      allocationId: 'ALLOCATION_TEST_ONLY_RENT',
      policyRef: 'TEST_ONLY_EXISTING_CORE_RULES',
      sourcePopulationRef: 'TEST_ONLY_SIX_HOUSEHOLDS_EIGHTEEN_PEOPLE',
      countryId: 'COUNTRY_01',
      householdEntityId: asset.ownerId,
      parentAccountId: asset.accountId,
      regions: [{ locationId, households: '6', population: '18' }],
      groups: [
        {
          groupId: 'GROUP_OWNER',
          locationId,
          role: 'OWNER_OCCUPIER',
          firstHouseholdOrdinal: '0',
          households: '2',
          firstPersonOrdinal: '0',
          population: '6',
        },
        {
          groupId: 'GROUP_TENANT',
          locationId,
          role: 'PRIVATE_RENTER',
          firstHouseholdOrdinal: '2',
          households: '2',
          firstPersonOrdinal: '6',
          population: '6',
        },
        {
          groupId: 'GROUP_PUBLIC',
          locationId,
          role: 'PUBLIC_RENTER',
          firstHouseholdOrdinal: '4',
          households: '1',
          firstPersonOrdinal: '12',
          population: '3',
        },
        {
          groupId: 'GROUP_DISPLACED',
          locationId,
          role: 'DISPLACED',
          firstHouseholdOrdinal: '5',
          households: '1',
          firstPersonOrdinal: '15',
          population: '3',
        },
      ],
      pools: [
        {
          poolId: 'POOL_TEST_ONLY',
          locationId,
          landlordGroupId: 'GROUP_OWNER',
          totalUnits: '12',
          habitableUnits: '10',
          ownerOccupiedUnits: '2',
        },
      ],
      leases: [
        {
          leaseId: 'LEASE_TEST_ONLY',
          poolId: 'POOL_TEST_ONLY',
          landlordGroupId: 'GROUP_OWNER',
          tenantGroupId: 'GROUP_TENANT',
          firstHouseholdOrdinal: '0',
          households: '1',
          startTick: '1',
          endTick: '31',
          periodTicks: '10',
          rentPerHouseholdPerPeriod: '5.000001',
          currency: 'AAA',
          genesisRightsRef: 'TEST_ONLY_EXISTING_LEASE_RIGHTS',
        },
      ],
    },
    sha,
  );
  const input = {
      parentSeed: parent,
      seed: child.seed,
      receipts: [child.receipt],
    },
    token = prepareBeneficialHousingRentSource(input),
    data = consumeBeneficialHousingRentSource(token);
  const quote = C.prepareBeneficialHousingRent(
    {
      receipt: data.receipts[0]!,
      state: C.createBeneficialHousingRentState(data.receipts[0]!),
      financialBefore: data.openingFinancial,
      leaseId: 'LEASE_TEST_ONLY',
      periodIndex: '0',
      simTime: C.SimTime.fromTicks('11'),
    },
    sha,
  );
  const command = C.parseCanonicalCommand(
    {
      schemaVersion: C.COMMAND_SCHEMA_VERSION,
      worldId: world,
      countryId: 'COUNTRY_01',
      officeId: null,
      commandType: C.BENEFICIAL_HOUSING_RENT_COMMAND,
      commandId: 'COMMAND_TEST_ONLY_RENT',
      idempotencyKey: quote.idempotencyKey,
      actorId: 'ACTOR_TEST_ONLY_RENT_PUBLISHER',
      authSubject: '11111111-1111-4111-8111-111111111111',
      correlationId: 'CORRELATION_TEST_ONLY_RENT',
      expectedWorldVersion: '0',
      simTime: '11',
      submittedAtReal: at,
      payload: quote.commandPayload,
    },
    sha,
  );
  return { input, token, data, command };
}
const clock = { nowReal: () => at, simTime: async () => '11' };
describe('small complete Core source and fixed rent runtime prerequisites', () => {
  it('reconstructs every actual child and retains the same legal household claim without minting admission', () => {
    const f = fixture();
    expect(f.data.receipts).toHaveLength(1);
    expect(f.input.seed.sources).toHaveLength(2);
    expect(
      C.aggregateBeneficialHousingLiquidClaim(
        f.data.openingFinancial,
        f.data.receipts[0]!,
      ),
    ).toMatchObject({ availableAmount: '100.000003' });
    expect(() => consumeBeneficialHousingRentSource({ ...f.token })).toThrow(
      'GENUINE_LIVE_PREPARED',
    );
    expect(f.data.bundleBytes).toContain(
      'postwar-beneficial-housing-rent-source-v1',
    );
    retireBeneficialHousingRentSource(f.token);
    expect(() => consumeBeneficialHousingRentSource(f.token)).toThrow(
      'GENUINE_LIVE_PREPARED',
    );
  });
  it('refuses omitted/duplicate originals and unexplained composed sources instead of weakening the existing 70-country verifier', () => {
    const f = fixture();
    expect(() =>
      prepareBeneficialHousingRentSource({ ...f.input, receipts: [] }),
    ).toThrow('COMPLETE_UNIQUE');
    expect(() =>
      prepareBeneficialHousingRentSource({
        ...f.input,
        receipts: [...f.input.receipts, ...f.input.receipts],
      }),
    ).toThrow('COMPLETE_UNIQUE');
    const extra = C.createOpeningSource(
      {
        schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
        sourceId: C.openingSourceId('SOURCE_TEST_ONLY_UNEXPLAINED'),
        sourceKind: 'TEST_FIXTURE',
        sourceVersion: 'TEST_ONLY',
        locator: 'TEST_ONLY',
        payload: { unused: true },
      },
      sha,
    );
    const seed = C.createOpeningSeed(
      { ...f.input.seed, sources: [...f.input.seed.sources, extra] },
      sha,
    );
    expect(() =>
      prepareBeneficialHousingRentSource({ ...f.input, seed }),
    ).toThrow('COMPLETE_PARENT_AND_COMPOSED');
  });
  it('does not accept a copied runtime/port, unprepared data, a discretionary proof or a formal Clock label', async () => {
    const f = fixture();
    let queries = 0;
    const db: SqlDatabase = {
      query: async () => {
        queries++;
        throw Error('unexpected');
      },
      transaction: async (op) => op(db),
    };
    const config = {
      database: db,
      worldId: world,
      workerId: worker,
      workerRole: 'fixture_rent_worker',
      environment: 'ci' as const,
      clock,
      clockBindingRef: clockRef,
    };
    const runtime = createPostwarBeneficialHousingRentRuntime(config);
    expect(isPostwarBeneficialHousingRentRuntime(runtime)).toBe(true);
    expect(isPostwarBeneficialHousingRentRuntime({ ...runtime })).toBe(false);
    expect(
      isPostwarBeneficialHousingRentSourceCommitProtectionPort(
        runtime.sourceCommitProtectionPort,
      ),
    ).toBe(true);
    expect(
      isPostwarBeneficialHousingRentSourceCommitProtectionPort({
        ...runtime.sourceCommitProtectionPort,
      }),
    ).toBe(false);
    await expect(
      runtime.assertSourceBeforeClaim({
        command: f.command,
        observedAtReal: at,
      }),
    ).rejects.toThrow('SOURCE_NOT_PREPARED');
    await expect(
      runtime.candidateFactory.prepare({
        command: f.command,
        observedAtReal: at,
        commitAuthorization: {} as never,
      }),
    ).rejects.toThrow('CANNOT_BORROW_USER_PROOF');
    expect(() =>
      createPostwarBeneficialHousingRentRuntime({
        ...config,
        environment: 'production' as never,
      }),
    ).toThrow('FORMAL_CLOCK_SOURCE_CONTROL_NOT_REGISTERED');
    expect(queries).toBe(0);
    await runtime.close();
    await expect(
      runtime.assertSourceBeforeClaim({
        command: f.command,
        observedAtReal: at,
      }),
    ).rejects.toThrow('RETIRED');
  });
});

/** All admission metadata and the frozen clock publication here are TEST_ONLY.
 * Economic/queue/fencing/append-only receipt constraints use actual artifacts. */
async function embeddedFixture(testClock = clock) {
  const f = fixture(),
    db = new PGlite(),
    role = 'fixture_rent_worker';
  const load = async (path: string) =>
    db.exec(await readFile(new URL('../../' + path, import.meta.url), 'utf8'));
  try {
    for (const name of [
      '0001_world_v2_namespace.sql',
      '0002_world_v2_command_event_ledger.sql',
      '0003_world_v2_command_receipts_outbox.sql',
      '0004_world_v2_receipt_event_set_integrity.sql',
      '0005_world_v2_writer_lease_fencing.sql',
      '0006_world_v2_writer_lease_lineage_guard.sql',
      '0007_world_v2_atomic_transition_facts.sql',
      '0008_world_v2_materialization_recovery.sql',
      '0009_world_v2_posting_payload_integrity.sql',
      '0010_world_v2_command_claim_fencing.sql',
      '0011_world_v2_current_commit_authorization.sql',
      '0012_world_v2_command_claim_active_lease_guard.sql',
      '0016_world_v2_opening_seed.sql',
    ])
      await load('database/migrations/artifacts/' + name);
    await db.exec(`create table world_v2.runtime_opening_admission(world_id text,seed_id text,seed_fingerprint text,replay_binding text,model_version text,admission_ref text primary key,admitted_at_real timestamptz);
create table world_v2.runtime_admission_publication_permit(authorization_id text primary key,authorization_sha256 text,world_id text,seed_id text,seed_fingerprint text,model_version text,replay_binding text,valid_from timestamptz,valid_until timestamptz);
create table world_v2.runtime_admission_publication_revocation(authorization_id text);`);
    await load('database/proposals/financial-posting-decimal-validation.sql');
    await load(
      'database/proposals/postwar-beneficial-housing-rent-custody.sql',
    );
    const queries: string[] = [];
    const executor: SqlExecutor = {
      async query<Row extends object>(
        statement: string,
        parameters: readonly unknown[] = [],
      ) {
        queries.push(statement);
        const r = await db.query<Row>(statement, [...parameters]);
        return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
      },
    };
    const scoped = (name: string | null): SqlDatabase => {
      const database: SqlDatabase = {
        query<Row extends object>(
          statement: string,
          parameters: readonly unknown[] = [],
        ) {
          return database.transaction((tx) =>
            tx.query<Row>(statement, parameters),
          );
        },
        async transaction(op) {
          await db.exec('begin isolation level repeatable read');
          try {
            if (name) await db.exec('set local role ' + name);
            const result = await op(executor);
            await db.exec('commit');
            return result;
          } catch (error) {
            await db.exec('rollback');
            throw error;
          }
        },
      };
      return database;
    };
    const database = scoped(role),
      publisher = scoped('world_v2_beneficial_rent_source_publisher');
    const { fingerprint, ...seedIntent } = f.input.seed,
      replay = C.canonicalSerialize(f.input.seed.replayBinding);
    await db.query('insert into world_v2.world_head values($1,0,0)', [world]);
    await db.query(
      'insert into world_v2.opening_seed values($1,$2,0,$3,$4,$5,$6)',
      [
        world,
        f.input.seed.seedId,
        replay,
        C.canonicalSerialize(seedIntent),
        fingerprint,
        at,
      ],
    );
    await db.query(
      'insert into world_v2.runtime_opening_admission values($1,$2,$3,$4,$5,$6,$7)',
      [
        world,
        f.input.seed.seedId,
        fingerprint,
        replay,
        f.input.seed.replayBinding.modelVersion,
        'ADMISSION_' + '1'.repeat(64),
        at,
      ],
    );
    await db.query(
      'insert into world_v2.runtime_admission_publication_permit values($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [
        'PERMIT_TEST_ONLY_RENT',
        '1'.repeat(64),
        world,
        f.input.seed.seedId,
        fingerprint,
        f.input.seed.replayBinding.modelVersion,
        replay,
        '2026-10-29T00:00:00.000Z',
        '2026-10-31T00:00:00.000Z',
      ],
    );
    await publisher.transaction((tx) =>
      tx.query(
        'select world_v2.register_postwar_beneficial_rent_source($1,$2,$3)',
        [world, f.data.bundleBytes, f.data.bundleSha256],
      ),
    );
    const c = f.command;
    await db.query(
      `insert into world_v2.command_submission(world_id,command_id,idempotency_key,command_type,schema_version,canonical_payload,payload_sha256,command_fingerprint,auth_subject,actor_id,country_id,office_id,expected_world_version,sim_time,correlation_id,submitted_at_real)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
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
      'insert into world_v2.world_writer_lease values($1,$2,1,$3,$3,$4)',
      [world, worker, at, '2026-10-30T00:01:00.000Z'],
    );
    await db.query(
      `insert into world_v2.command_queue(world_id,command_id,authority_kind,priority_rank,available_at_sim_time,attempt_count)values($1,$2,'VERSIONED_AUTOMATIC',0,11,0)`,
      [world, c.commandId],
    );
    await db.query(
      `update world_v2.command_queue set queue_state='CLAIMED',attempt_count=1,claimed_by=$3,claimed_at_real=$4,claim_fencing_token=1 where world_id=$1 and command_id=$2`,
      [world, c.commandId, worker, at],
    );
    await publisher.transaction((tx) =>
      tx.query(
        'select world_v2.register_test_only_beneficial_rent_publication($1,$2,$3,$4,$5,$6,$7::timestamptz,$8::timestamptz)',
        [
          world,
          c.countryId,
          c.commandId,
          worker,
          clockRef,
          '11',
          '2026-10-29T00:00:00.000Z',
          '2026-10-31T00:00:00.000Z',
        ],
      ),
    );
    // Writer has economic append/lease/queue I/O; fixed source reader has only
    // EXECUTE, with neither raw source/authority table privileges nor publishers.
    await db.exec(`create role ${role} nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
grant usage on schema world_v2 to ${role};grant world_v2_beneficial_rent_source_reader to ${role};
grant select on world_v2.world_head,world_v2.world_writer_lease,world_v2.command_submission,world_v2.command_queue,world_v2.command_receipt,world_v2.authoritative_event,world_v2.inventory_posting,world_v2.financial_posting_batch,world_v2.current_materialization,world_v2.authoritative_commit_authorization,world_v2.notification_outbox to ${role};
grant update(world_version,event_sequence)on world_v2.world_head to ${role};grant update(fencing_token)on world_v2.world_writer_lease to ${role};grant update(command_id)on world_v2.command_submission to ${role};
grant insert on world_v2.authoritative_event,world_v2.financial_posting_batch,world_v2.command_receipt,world_v2.authoritative_commit_authorization,world_v2.notification_outbox to ${role};grant update on world_v2.command_queue to ${role};`);
    const runtime = createPostwarBeneficialHousingRentRuntime({
      database,
      worldId: world,
      workerId: worker,
      workerRole: role,
      environment: 'ci',
      clock: testClock,
      clockBindingRef: clockRef,
    });
    await runtime.prepare(f.input);
    const execution = createAuthoritativeWorkerExecution({
      database,
      workerId: worker,
      sha256Hex: sha,
      candidateFactory: runtime.candidateFactory,
      beneficialHousingRentSourceCommitProtectionPort:
        runtime.sourceCommitProtectionPort,
    });
    const input = {
      command: c,
      authorityKind: 'VERSIONED_AUTOMATIC' as const,
      commitSimTime: c.simTime,
      recordedAtReal: at,
    };
    const counts = async () =>
      (
        await db.query<{
          events: number;
          batches: number;
          receipts: number;
          finalized: number;
          version: string;
          sequence: string;
          inventory: number;
          materials: number;
        }>(
          `select(select count(*)::int from world_v2.authoritative_event)as events,(select count(*)::int from world_v2.financial_posting_batch)as batches,(select count(*)::int from world_v2.command_receipt)as receipts,(select count(*)::int from world_v2.command_queue where queue_state='FINALIZED')as finalized,(select world_version::text from world_v2.world_head)as version,(select event_sequence::text from world_v2.world_head)as sequence,(select count(*)::int from world_v2.inventory_posting)as inventory,(select count(*)::int from world_v2.current_materialization)as materials`,
        )
      ).rows[0]!;
    const revoke = () =>
      publisher.transaction((tx) =>
        tx.query(
          'select world_v2.revoke_postwar_beneficial_rent_source($1,$2,$3)',
          [world, 'COUNTRY_01', 'TEST_ONLY_REVOKED'],
        ),
      );
    return {
      ...f,
      sourceInput: f.input,
      db,
      database,
      publisher,
      runtime,
      execution,
      input,
      counts,
      revoke,
      queries,
    };
  } catch (error) {
    await db.close();
    throw error;
  }
}
const empty = {
  events: 0,
  batches: 0,
  receipts: 0,
  finalized: 0,
  version: '0',
  sequence: '0',
  inventory: 0,
  materials: 0,
};
describe('TEST_ONLY fixed SQL rent custody and Root Atomic execution', () => {
  it('settles one real rent batch atomically, reads the paid receipt at H1 and recovers FINAL after revocation', async () => {
    const f = await embeddedFixture();
    try {
      await f.runtime.assertSourceBeforeClaim({
        command: f.command,
        observedAtReal: at,
      });
      expect(
        await f.runtime.readCurrentReceipt({
          countryId: 'COUNTRY_01',
          leaseId: 'LEASE_TEST_ONLY',
          periodIndex: '0',
        }),
      ).toMatchObject({ status: 'UNPAID', head: { worldVersion: '0' } });
      expect(await f.counts()).toEqual(empty);
      const result = await f.execution.executeQueuedCommand(f.input);
      expect(result.source).toBe('NEW_FINAL');
      expect(result.receipt.outcome).toBe('COMMITTED');
      expect(await f.counts()).toEqual({
        ...empty,
        events: 1,
        batches: 1,
        receipts: 1,
        finalized: 1,
        version: '1',
        sequence: '1',
      });
      const current = await f.runtime.readCurrentReceipt({
        countryId: 'COUNTRY_01',
        leaseId: 'LEASE_TEST_ONLY',
        periodIndex: '0',
      });
      expect(current).toMatchObject({
        status: 'PAID',
        head: { worldVersion: '1', eventSequence: '1' },
        receipt: {
          leaseId: 'LEASE_TEST_ONLY',
          periodIndex: '0',
          amount: '5.000001',
        },
      });
      const stored = (
        await f.db.query<{ canonical_payload: string }>(
          'select canonical_payload from world_v2.financial_posting_batch',
        )
      ).rows[0]!;
      const batch = JSON.parse(stored.canonical_payload) as {
        legs: {
          amount: { amount: string };
          account: {
            ownerId: string;
            accountClass: string;
            claimId: string;
            counterpartyEntityId: string;
          };
        }[];
      };
      expect(batch.legs).toHaveLength(2);
      expect(batch.legs.map((x) => x.amount.amount)).toEqual([
        '5.000001',
        '5.000001',
      ]);
      for (const leg of batch.legs)
        expect(leg.account).toMatchObject({
          ownerId: 'ENTITY_HOUSEHOLDS_01',
          accountClass: 'ASSET',
          claimId: 'CLAIM_HH_TEST_ONLY',
          counterpartyEntityId: 'ENTITY_BANK_01',
        });
      const prior = await f.counts();
      await f.revoke();
      const calls = f.queries.filter((q) =>
        q.includes('lock_postwar_beneficial_rent_original'),
      ).length;
      const repeat = await f.execution.executeQueuedCommand(f.input);
      expect(repeat.source).toBe('EXISTING_FINAL');
      expect(C.canonicalSerialize(repeat.receipt)).toBe(
        C.canonicalSerialize(result.receipt),
      );
      expect(
        f.queries.filter((q) =>
          q.includes('lock_postwar_beneficial_rent_original'),
        ).length,
      ).toBe(calls);
      expect(await f.counts()).toEqual(prior);
    } finally {
      await f.runtime.close();
      await f.db.close();
    }
  });
  it('rejects revoked or expired originals and exact-scope/clock/projection mismatches without economic writes', async () => {
    const f = await embeddedFixture();
    try {
      const draft = await f.runtime.candidateFactory.prepare({
        command: f.command,
        commitAuthorization: null,
        observedAtReal: at,
      });
      const request = {
        phase: 'BEFORE_EVENTS' as const,
        purpose: BENEFICIAL_HOUSING_RENT_SOURCE_PURPOSE,
        command: f.command,
        transition: draft.transition,
        currentHead: {
          worldId: C.worldId(world),
          worldVersion: '0',
          eventSequence: '0',
        },
        observedAtReal: at,
        readBinding: draft.officeOperatingSourceReadBinding,
        commitAuthorization: null,
        inventoryPostings: [],
        financialPostingBatches: draft.financialPostingBatches,
        currentMaterializations: [],
      } as const;
      expect(
        await f.database.transaction((tx) =>
          f.runtime.sourceCommitProtectionPort.assertCurrentFrom(tx, request),
        ),
      ).toMatchObject({ status: 'CURRENT_SOURCE_RECHECKED_NOT_AUTHORITY' });
      await expect(
        f.database.transaction((tx) =>
          f.runtime.sourceCommitProtectionPort.assertCurrentFrom(tx, {
            ...request,
            currentMaterializations: [{ key: 'FAKE', payload: {} }],
          }),
        ),
      ).rejects.toThrow('EXACT_AUTOMATIC_NULL_PROOF');
      await expect(
        f.runtime.assertSourceBeforeClaim({
          command: f.command,
          observedAtReal: '2026-10-31T00:00:00.000Z',
        }),
      ).rejects.toThrow('REGISTERED_ADMITTED_SOURCE_MISSING');
      const wrongClock = createPostwarBeneficialHousingRentRuntime({
        database: f.database,
        worldId: world,
        workerId: worker,
        workerRole: 'fixture_rent_worker',
        environment: 'ci',
        clock: { ...clock, simTime: async () => '12' },
        clockBindingRef: clockRef,
      });
      await wrongClock.prepare(f.sourceInput);
      await expect(
        wrongClock.assertSourceBeforeClaim({
          command: f.command,
          observedAtReal: at,
        }),
      ).rejects.toThrow('EXACT_BOUND_HOST_CLOCK_REQUIRED');
      await wrongClock.close();
      await f.revoke();
      await expect(
        f.execution.repository.commit(
          prepareAtomicTransitionCandidate({
            command: f.command,
            commitAuthorization: null,
            draft,
            sha256Hex: sha,
          }),
        ),
      ).rejects.toThrow('REGISTERED_ADMITTED_SOURCE_MISSING');
      expect(await f.counts()).toEqual(empty);
    } finally {
      await f.runtime.close();
      await f.db.close();
    }
  });
  it('exposes no raw source/authority grants and refuses cross-world, cross-country and copied guard requests', async () => {
    const f = await embeddedFixture();
    try {
      const raw = await f.db.query<{
        seed: boolean;
        authority: boolean;
        journal: boolean;
        owner: boolean;
        publisher: boolean;
      }>(
        `select has_column_privilege('world_v2_beneficial_rent_source_reader','world_v2.opening_seed','canonical_payload','SELECT')as seed,has_table_privilege('fixture_rent_worker','world_v2.current_commit_authorization','UPDATE')as authority,has_table_privilege('world_v2_beneficial_rent_source_reader','world_v2.financial_posting_batch','SELECT')as journal,pg_has_role('fixture_rent_worker','world_v2_beneficial_rent_source_owner','MEMBER')as owner,pg_has_role('fixture_rent_worker','world_v2_beneficial_rent_source_publisher','MEMBER')as publisher`,
      );
      expect(raw.rows[0]).toEqual({
        seed: false,
        authority: false,
        journal: false,
        owner: false,
        publisher: false,
      });
      for (const args of [
        ['WORLD_TEST_ONLY_OTHER', 'COUNTRY_01'],
        [world, 'COUNTRY_02'],
      ]) {
        const r = await f.database.transaction((tx) =>
          tx.query(
            'select * from world_v2.lock_postwar_beneficial_rent_header($1,$2)',
            args,
          ),
        );
        expect(r.rows).toEqual([]);
      }
      expect(() =>
        createAuthoritativeWorkerExecution({
          database: f.database,
          workerId: worker,
          sha256Hex: sha,
          candidateFactory: f.runtime.candidateFactory,
          beneficialHousingRentSourceCommitProtectionPort: {
            ...f.runtime.sourceCommitProtectionPort,
          },
        }),
      ).toThrow('fixed runtime issuer');
      await expect(
        f.database.transaction((tx) =>
          tx.query('select canonical_payload from world_v2.opening_seed'),
        ),
      ).rejects.toMatchObject({ code: '42501' });
      expect(await f.counts()).toEqual(empty);
    } finally {
      await f.runtime.close();
      await f.db.close();
    }
  });
  it('drains an already entered genuine guard and rejects a new guard while closing', async () => {
    let blocked = false;
    let entered!: () => void, release!: () => void;
    const entering = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const f = await embeddedFixture({
      ...clock,
      simTime: async () => {
        if (blocked) {
          entered();
          await held;
        }
        return '11';
      },
    });
    try {
      const draft = await f.runtime.candidateFactory.prepare({
        command: f.command,
        commitAuthorization: null,
        observedAtReal: at,
      });
      const request = {
        phase: 'BEFORE_EVENTS' as const,
        purpose: BENEFICIAL_HOUSING_RENT_SOURCE_PURPOSE,
        command: f.command,
        transition: draft.transition,
        currentHead: {
          worldId: C.worldId(world),
          worldVersion: '0',
          eventSequence: '0',
        },
        observedAtReal: at,
        readBinding: draft.officeOperatingSourceReadBinding,
        commitAuthorization: null,
        inventoryPostings: [],
        financialPostingBatches: draft.financialPostingBatches,
        currentMaterializations: [],
      } as const;
      blocked = true;
      let actualTx: SqlExecutor | undefined;
      const guard = f.database.transaction((tx) => {
        actualTx = tx;
        return f.runtime.sourceCommitProtectionPort.assertCurrentFrom(
          tx,
          request,
        );
      });
      await entering;
      let closed = false;
      const closing = f.runtime.close().then(() => {
        closed = true;
      });
      await Promise.resolve();
      expect(closed).toBe(false);
      if (!actualTx) throw Error('actual held SQL executor required');
      await expect(
        f.runtime.sourceCommitProtectionPort.assertCurrentFrom(
          actualTx,
          request,
        ),
      ).rejects.toThrow('RETIRED');
      release();
      await guard;
      await closing;
      expect(closed).toBe(true);
      expect(await f.counts()).toEqual(empty);
    } finally {
      release();
      await f.runtime.close();
      await f.db.close();
    }
  });
});
