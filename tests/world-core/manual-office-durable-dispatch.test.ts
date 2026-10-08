import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, describe, expect, it } from 'vitest';
import {
  COMMAND_SCHEMA_VERSION,
  DomainError,
  canonicalSerialize,
  createWorldWriterCommitAssertion,
  parseCanonicalCommand,
  parseWorldWriterLease,
  parseOpeningSeed,
  rebuildV08LedgersFromLineage,
  type CanonicalCommand,
  type CaptainPoliticalCapitalSourceSnapshot,
} from '@econmind/core';
import { createDurableCommandConsumptionPreparation } from '../../apps/world-worker/src/preparation/durable-command-consumption.js';
import type { ManualOfficeRuntimeReaders } from '../../apps/world-worker/src/preparation/manual-office-command-composition.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';
import type { CentralBankOmoReader } from '../../apps/world-worker/src/persistence/central-bank-omo-candidate-source.js';
import { inspectOfficialOpeningDecisionSource } from '../../apps/world-worker/src/preparation/official-opening-decision-reconciliation.js';
import { createOfficialLabourSocialOpeningAdoption } from '../../apps/world-worker/src/preparation/official-labour-social-opening-adoption.js';
import {
  captainTestOnlyCommand,
  captainTestOnlySnapshot,
} from '../support/g-dispatch-captain-test-only-fixture.js';
import { centralBankTestOnlyFixture } from '../support/g-dispatch-cb-test-only-fixture.js';

const digest = (s: string) => createHash('sha256').update(s).digest('hex');
const live: PGlite[] = [];
afterEach(async () => {
  for (const db of live.splice(0)) await db.close();
});
const read = (name: string) =>
  readFile(new URL(`../../${name}`, import.meta.url), 'utf8');
const change = (c: CanonicalCommand, fields: Record<string, unknown>) =>
  parseCanonicalCommand(
    {
      actorId: c.actorId,
      authSubject: c.authSubject,
      commandId: c.commandId,
      commandType: c.commandType,
      correlationId: c.correlationId,
      countryId: c.countryId,
      expectedWorldVersion: c.expectedWorldVersion,
      idempotencyKey: c.idempotencyKey,
      officeId: c.officeId,
      payload: JSON.parse(c.canonicalPayload) as unknown,
      schemaVersion: c.schemaVersion,
      simTime: c.simTime.toCanonicalValue(),
      submittedAtReal: c.submittedAtReal,
      worldId: c.worldId,
      ...fields,
    },
    digest,
  );

/** Real PGlite schema, canonical durable command, actual current authorization,
 * existing lease/queue/AtomicTransitionRepository. TEST_ONLY source data lives
 * in a fixture SQL table and is read through the trusted server reader port;
 * no economic snapshot or prebuilt command/draft is passed to consumeOnce. */
async function fixture(
  kind: 'CAPTAIN' | 'CENTRAL_BANK' | 'SOCIAL' = 'CAPTAIN',
  fields: Record<string, unknown> = {},
) {
  const cb = kind === 'CENTRAL_BANK' ? centralBankTestOnlyFixture() : null;
  const manual =
    kind === 'SOCIAL'
      ? change(captainTestOnlyCommand(), {
          officeId: 'SOCIAL',
          commandType: 'CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1',
          payload: {
            schemaVersion: 'social-employment-service-plan-v1',
            locationId: 'REGION_01_E1',
            skill: 'HIGH',
            positionId: 'POSITION_A',
            servicePoolId: 'SOCIAL_POOL_A',
            requestedMatches: '3',
            dueDayIndex: '1',
          },
        })
      : (cb?.command ?? captainTestOnlyCommand());
  const command = change(manual, fields),
    world = command.worldId;
  const holder = cb ? 'WORKER_TEST_ONLY_CB1' : 'WORKER_TEST_ONLY_CAP_DISPATCH';
  const at = command.submittedAtReal;
  const clock = { at };
  const capability =
    kind === 'CAPTAIN'
      ? 'CAPTAIN_CABINET'
      : kind === 'CENTRAL_BANK'
        ? 'CENTRAL_BANK_MONETARY_POLICY'
        : 'SOCIAL_LABOUR';
  const db = new PGlite();
  live.push(db);
  const manifest = JSON.parse(
    await read('database/migrations/manifest.json'),
  ) as { migrations: Array<{ path: string; release_order: number }> };
  for (const m of manifest.migrations.filter((m) => m.release_order <= 17))
    await db.exec(await read(m.path));
  await db.exec(
    'create table g_test_only_domain_source(payload text not null)',
  );
  await db.query('insert into world_v2.world_head(world_id) values($1)', [
    world,
  ]);
  await db.query(
    'select * from world_v2.acquire_world_writer_lease($1,$2,$3::timestamptz,60000)',
    [world, holder, at],
  );
  await db.query(
    `insert into world_v2.command_submission(world_id,command_id,idempotency_key,command_type,schema_version,canonical_payload,payload_sha256,command_fingerprint,
    auth_subject,actor_id,country_id,office_id,expected_world_version,sim_time,correlation_id,submitted_at_real)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [
      world,
      command.commandId,
      command.idempotencyKey,
      command.commandType,
      COMMAND_SCHEMA_VERSION,
      command.canonicalPayload,
      command.payloadHash,
      command.fingerprint,
      command.authSubject,
      command.actorId,
      command.countryId,
      command.officeId,
      command.expectedWorldVersion,
      command.simTime.toCanonicalValue(),
      command.correlationId,
      command.submittedAtReal,
    ],
  );
  await db.query(
    'insert into world_v2.command_queue(world_id,command_id,authority_kind,available_at_sim_time) values($1,$2,$3,$4)',
    [
      world,
      command.commandId,
      command.officeId === null ? 'VERSIONED_AUTOMATIC' : 'DISCRETIONARY_USER',
      command.simTime.toCanonicalValue(),
    ],
  );
  await db.query(
    "insert into world_v2.current_commit_authorization values($1,$2,$3,$4,$5,'TEAM_TEST_ONLY','REV_1',true,$6)",
    [
      world,
      command.authSubject,
      command.countryId,
      command.officeId ?? manual.officeId,
      capability,
      at,
    ],
  );
  if (cb) {
    await db.query('insert into g_test_only_domain_source values($1)', [
      canonicalSerialize({
        facts: cb.preparation.source.facts,
        trace: cb.preparation.source.trace,
        seed: cb.seed,
      }),
    ]);
  } else if (kind === 'CAPTAIN')
    await db.query('insert into g_test_only_domain_source values($1)', [
      canonicalSerialize(captainTestOnlySnapshot()),
    ]);
  const sql: string[] = [];
  const hooks: {
    afterClaim?: () => Promise<void>;
    beforeCutoff?: () => Promise<void>;
    beforeClaim?: () => Promise<void>;
  } = {};
  let claimed = false;
  const executor: SqlExecutor = {
    async query<Row extends object>(text: string, values?: readonly unknown[]) {
      sql.push(text);
      if (text.includes('select auth_subject::text as auth_subject'))
        await hooks.beforeCutoff?.();
      if (text.includes("set queue_state='CLAIMED'")) {
        await hooks.beforeClaim?.();
        claimed = true;
      }
      const r = await db.query(text, values ? [...values] : undefined);
      return {
        rows: r.rows as Row[],
        rowCount: r.affectedRows ?? r.rows.length,
      };
    },
  };
  const database: SqlDatabase = {
    query: executor.query,
    async transaction(operation) {
      await db.exec('begin');
      try {
        const result = await operation(executor);
        await db.exec('commit');
        if (claimed) {
          claimed = false;
          await hooks.afterClaim?.();
        }
        return result;
      } catch (e) {
        await db.exec('rollback');
        throw e;
      }
    },
  };
  const lease = async () => {
    const r = await db.query<{
      world_id: string;
      holder_id: string;
      fencing_token: string;
      acquired_at_real: Date;
      renewed_at_real: Date;
      lease_expires_at_real: Date;
    }>(
      'select world_id,holder_id,fencing_token::text,acquired_at_real,renewed_at_real,lease_expires_at_real from world_v2.world_writer_lease',
    );
    const l = r.rows[0]!;
    return parseWorldWriterLease({
      schemaVersion: 'world-writer-lease-v1',
      worldId: l.world_id,
      holderId: l.holder_id,
      fencingToken: l.fencing_token,
      acquiredAtReal: new Date(l.acquired_at_real).toISOString(),
      renewedAtReal: new Date(l.renewed_at_real).toISOString(),
      expiresAtReal: new Date(l.lease_expires_at_real).toISOString(),
    });
  };
  let reads = 0;
  const captain: NonNullable<ManualOfficeRuntimeReaders['captain']> = {
    async read(request) {
      reads++;
      expect(request.worldId).toBe(world);
      expect(request.commandFingerprint).toBe(command.fingerprint);
      const r = await db.query<{ payload: string }>(
        'select payload from g_test_only_domain_source',
      );
      if (!r.rows[0])
        return {
          kind: 'MISSING',
          missing: ['POLITICAL_CAPITAL_EVENT_LINEAGE'],
        };
      return {
        kind: 'READ',
        snapshot: JSON.parse(
          r.rows[0].payload,
        ) as CaptainPoliticalCapitalSourceSnapshot,
        lease: await lease(),
      };
    },
  };
  const centralBank: CentralBankOmoReader = {
    async read(request) {
      reads++;
      expect(request.commandFingerprint).toBe(command.fingerprint);
      const r = await db.query<{ payload: string }>(
        'select payload from g_test_only_domain_source',
      );
      if (!r.rows[0])
        throw new DomainError(
          'TRANSITION_EVIDENCE_INVALID',
          'TEST_ONLY OMO SOURCE MISSING',
        );
      const data = JSON.parse(r.rows[0].payload) as Pick<
        NonNullable<typeof cb>['preparation']['source'],
        'facts' | 'trace'
      > & { seed: unknown };
      return {
        ...cb!.preparation,
        source: {
          facts: data.facts,
          trace: data.trace,
          // TEST_ONLY SQL fixture retains TEST_FIXTURE provenance. It cannot
          // enter WorldOpeningSeedStore or masquerade as admitted genesis.
          financialState: rebuildV08LedgersFromLineage({
            seed: parseOpeningSeed(data.seed, digest),
            sha256Hex: digest,
          }).financial,
        },
        commitAssertion: createWorldWriterCommitAssertion(await lease(), '0'),
      };
    },
  };
  const make = (
    readers: ManualOfficeRuntimeReaders = kind === 'CAPTAIN'
      ? { captain }
      : kind === 'CENTRAL_BANK'
        ? { centralBank }
        : {},
  ) => {
    const w = createDurableCommandConsumptionPreparation({
      database,
      environment: { ECONMIND_ENV: 'ci' },
      workerId: holder,
      worldId: world,
      sha256Hex: digest,
      clock: {
        nowReal: () => clock.at,
        simTime: async (requested) => {
          expect(requested).toBe(world);
          return command.simTime.toCanonicalValue();
        },
      },
      officeReaders: readers,
    });
    w.startPreparation();
    return w;
  };
  const effects = async (): Promise<Record<string, unknown>> => {
    const counts: Record<string, number> = {};
    for (const t of [
      'authoritative_event',
      'command_receipt',
      'authoritative_commit_authorization',
      'financial_posting_batch',
      'inventory_posting',
      'notification_outbox',
    ])
      counts[t] = Number(
        (
          await db.query<{ n: string }>(
            `select count(*)::text as n from world_v2.${t}`,
          )
        ).rows[0]!.n,
      );
    return {
      ...counts,
      head: (
        await db.query(
          'select world_version::text,event_sequence::text from world_v2.world_head',
        )
      ).rows[0],
      queue: (
        await db.query(
          'select queue_state,attempt_count::text from world_v2.command_queue',
        )
      ).rows[0],
    };
  };
  const zero = async () => {
    const e = await effects();
    expect(e).toMatchObject({
      authoritative_event: 0,
      command_receipt: 0,
      authoritative_commit_authorization: 0,
      financial_posting_batch: 0,
      inventory_posting: 0,
      notification_outbox: 0,
      head: { world_version: '0', event_sequence: '0' },
      queue: { queue_state: 'PENDING', attempt_count: '0' },
    });
    expect(sql.some((s) => /^(?:insert|update)/iu.test(s.trim()))).toBe(false);
  };
  return {
    db,
    command,
    holder,
    clock,
    capability,
    make,
    effects,
    zero,
    hooks,
    sql,
    captain,
    centralBank,
    readCount: () => reads,
  };
}

async function socialAdoption() {
  const mappingBytes = await read(
    'docs/reports/world-connection/C_OFFICIAL_WORLD_OPENING_MAPPING.json',
  );
  const map = JSON.parse(mappingBytes) as {
    source: { dataFiles: Record<string, unknown> };
  };
  const datasets = Object.fromEntries(
    await Promise.all(
      Object.keys(map.source.dataFiles).map(async (name) => [
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
  if (!inspected.source) throw new Error(JSON.stringify(inspected.blockers));
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

describe('manual family → existing durable authoritative execution, TEST_ONLY actual SQL', () => {
  it.each(['CAPTAIN', 'CENTRAL_BANK'] as const)(
    '%s reads SQL source, invokes real Core factory and atomically finalizes once',
    async (kind) => {
      const f = await fixture(kind),
        w = f.make();
      const result = await w.consumeOnce();
      expect(result).toMatchObject({
        status: 'PROCESSED',
        source: 'NEW_FINAL',
        receipt: {
          outcome: 'COMMITTED',
          worldVersionBefore: '0',
          worldVersionAfter: '1',
        },
      });
      expect(await w.consumeOnce()).toEqual({ status: 'IDLE' });
      const e = await f.effects();
      expect(e).toMatchObject({
        authoritative_event: 1,
        command_receipt: 1,
        authoritative_commit_authorization: 1,
        notification_outbox: 1,
        head: { world_version: '1', event_sequence: '1' },
        queue: { queue_state: 'FINALIZED', attempt_count: '1' },
      });
      expect(f.readCount()).toBe(2);
      expect(
        (
          await f.db.query(
            'select capability from world_v2.authoritative_commit_authorization',
          )
        ).rows[0],
      ).toEqual({ capability: f.capability });
      expect(e.financial_posting_batch).toBe(kind === 'CENTRAL_BANK' ? 1 : 0);
      await w.stop();
    },
  );
  it.each(['CAPTAIN', 'CENTRAL_BANK', 'SOCIAL'] as const)(
    '%s absent trusted reader never claims, executes, writes or skips',
    async (kind) => {
      const f = await fixture(kind),
        w = f.make({});
      expect(await w.consumeOnce()).toMatchObject({
        status: 'BLOCKED',
        reason: 'MANUAL_OFFICE_SOURCE_NOT_BOUND',
      });
      expect(await w.consumeOnce()).toMatchObject({ status: 'BLOCKED' });
      await f.zero();
      await w.stop();
    },
  );
  it.each(['CAPTAIN', 'CENTRAL_BANK'] as const)(
    '%s bound SQL reader reports missing source with zero queue/economic writes',
    async (kind) => {
      const f = await fixture(kind);
      await f.db.exec('delete from g_test_only_domain_source');
      const w = f.make();
      expect(await w.consumeOnce()).toMatchObject({ status: 'BLOCKED' });
      await f.zero();
      expect(w.state()).toBe('READY');
      await w.stop();
    },
  );
  it('Social actual source constructor retains NOT_READY operating-state refusal before claim', async () => {
    const f = await fixture('SOCIAL');
    const adoption = await socialAdoption();
    const w = f.make({
      social: {
        mode: 'OFFICIAL_RUNTIME',
        openingAdoption: adoption,
        snapshotReader: {
          async readFrom(input) {
            expect(
              (
                await input.transaction.query(
                  'select payload from g_test_only_domain_source',
                )
              ).rows,
            ).toEqual([]);
            return { status: 'MISSING_OPERATING_STATE' };
          },
        },
      },
    });
    expect(await w.consumeOnce()).toMatchObject({
      status: 'BLOCKED',
      reason: 'MANUAL_OFFICE_SOURCE_UNAVAILABLE',
    });
    await f.zero();
    expect(adoption.seedAdmissionReady).toBe(false);
    await w.stop();
  });
  it.each(['CAPTAIN', 'CENTRAL_BANK'] as const)(
    '%s current revocation cannot borrow durable intake or READ authority',
    async (kind) => {
      const f = await fixture(kind);
      await f.db.exec(
        'update world_v2.current_commit_authorization set active=false',
      );
      const w = f.make();
      expect(await w.consumeOnce()).toMatchObject({
        status: 'BLOCKED',
        domainCode: 'AUTHORIZATION_DENIED',
      });
      await f.zero();
      await w.stop();
    },
  );
  it.each(['CAPTAIN', 'CENTRAL_BANK'] as const)(
    '%s wrong current capability denies before source and claim',
    async (kind) => {
      const f = await fixture(kind);
      await f.db.exec(
        "update world_v2.current_commit_authorization set capability='READ'",
      );
      const w = f.make();
      expect(await w.consumeOnce()).toMatchObject({
        status: 'BLOCKED',
        domainCode: 'AUTHORIZATION_DENIED',
      });
      expect(f.readCount()).toBe(0);
      await f.zero();
      await w.stop();
    },
  );
  it.each(['CAPTAIN', 'CENTRAL_BANK'] as const)(
    '%s old expected version cannot claim or execute',
    async (kind) => {
      const f = await fixture(kind, { expectedWorldVersion: '1' });
      const w = f.make();
      expect(await w.consumeOnce()).toMatchObject({ status: 'BLOCKED' });
      await f.zero();
      await w.stop();
    },
  );
  it('revocation after claim becomes a genuine zero-effect FINAL through the unchanged Core/SQL protocol', async () => {
    const f = await fixture();
    f.hooks.afterClaim = async () => {
      await f.db.exec(
        'update world_v2.current_commit_authorization set active=false',
      );
    };
    const w = f.make();
    expect(await w.consumeOnce()).toMatchObject({
      status: 'PROCESSED',
      receipt: { outcome: 'AUTHORIZATION_REVOKED' },
    });
    expect(await w.consumeOnce()).toEqual({ status: 'IDLE' });
    expect(await f.effects()).toMatchObject({
      authoritative_event: 0,
      authoritative_commit_authorization: 0,
      command_receipt: 1,
      head: { world_version: '0', event_sequence: '0' },
      queue: { queue_state: 'FINALIZED', attempt_count: '1' },
    });
    await w.stop();
  });
  it('SQL transaction cutoff denial rolls back every economic effect', async () => {
    const f = await fixture();
    f.hooks.beforeCutoff = async () => {
      await f.db.exec(
        'update world_v2.current_commit_authorization set active=false',
      );
    };
    const w = f.make();
    expect(await w.consumeOnce()).toMatchObject({
      status: 'BLOCKED',
      domainCode: 'AUTHORIZATION_DENIED',
    });
    expect(await f.effects()).toMatchObject({
      authoritative_event: 0,
      command_receipt: 0,
      notification_outbox: 0,
      head: { world_version: '0', event_sequence: '0' },
      queue: { queue_state: 'CLAIMED', attempt_count: '1' },
    });
    await w.stop();
  });
  it('head changed after source preflight denies the claim before writing', async () => {
    const f = await fixture();
    const w = f.make({
      captain: {
        async read(input) {
          const read = await f.captain.read(input);
          await f.db.exec('update world_v2.world_head set world_version=1');
          return read;
        },
      },
    });
    expect(await w.consumeOnce()).toMatchObject({
      status: 'BLOCKED',
      domainCode: 'VERSION_MISMATCH',
    });
    expect((await f.effects()).queue).toEqual({
      queue_state: 'PENDING',
      attempt_count: '0',
    });
    expect(
      f.sql.some((s) => s.startsWith('update world_v2.command_queue')),
    ).toBe(false);
    await w.stop();
  });
  it('expired lease and stale claimed fence are refused with no authoritative effects or takeover', async () => {
    const f = await fixture();
    f.clock.at = new Date(
      Date.parse(f.command.submittedAtReal) + 61000,
    ).toISOString();
    const w = f.make();
    expect(await w.consumeOnce()).toMatchObject({ status: 'BLOCKED' });
    await f.zero();
    await w.stop();
    const g = await fixture();
    await g.db.query(
      "update world_v2.command_queue set queue_state='CLAIMED',claimed_by=$1,claimed_at_real=$2,claim_fencing_token=1,attempt_count=1",
      [g.holder, g.command.submittedAtReal],
    );
    g.clock.at = new Date(
      Date.parse(g.command.submittedAtReal) + 61000,
    ).toISOString();
    await g.db.query(
      'select * from world_v2.acquire_world_writer_lease($1,$2,$3::timestamptz,60000)',
      [g.command.worldId, g.holder, g.clock.at],
    );
    const v = g.make();
    expect(await v.consumeOnce()).toMatchObject({ status: 'BLOCKED' });
    expect(await g.effects()).toMatchObject({
      authoritative_event: 0,
      command_receipt: 0,
      queue: { queue_state: 'CLAIMED', attempt_count: '1' },
    });
    expect(g.sql.some((s) => s.includes('acquire_world_writer_lease'))).toBe(
      false,
    );
    await v.stop();
  });
  it('automatic Social MATCH remains unsupported; no injected source grants system authority', async () => {
    const f = await fixture('SOCIAL', {
      officeId: null,
      commandType: 'CORE_SOCIAL_JOB_MATCH_SETTLEMENT_V1',
    });
    const w = f.make();
    expect(await w.consumeOnce()).toMatchObject({
      status: 'BLOCKED',
      reason: 'UNSUPPORTED_COMMAND',
    });
    await f.zero();
    await w.stop();
  });
});
