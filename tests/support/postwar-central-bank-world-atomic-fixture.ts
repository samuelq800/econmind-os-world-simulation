/** Tiny two-country TEST_ONLY instruments/adoptions. Real official SQL,
 * canonical Core ledgers, low-role source RPCs and Root Atomic are retained.
 * The unused Pool transport is not a native PostgreSQL/HTTP proof. */
import * as C from '@econmind/core';
import type { Pool } from 'pg';
import { readFile } from 'node:fs/promises';
import { centralBankTestOnlyFixture } from './g-dispatch-cb-test-only-fixture.js';
import {
  createCentralBankOmoAtomicFixture,
  cbAtomicTestSha as sha,
  CB_ATOMIC_TEST_AT as at,
  CB_ATOMIC_TEST_WORKER as worker,
} from './postwar-central-bank-omo-atomic-fixture.js';
import { createPostwarCentralBankOmoWorldRuntime } from '../../apps/world-worker/src/persistence/postwar-central-bank-omo-world-runtime.js';
import { createAuthoritativeWorkerExecution } from '../../apps/world-worker/src/authoritative-execution.js';
import {
  publishCentralBankOmoOriginals,
  type CentralBankOmoOriginal,
} from '../../apps/world-worker/src/persistence/postgres-central-bank-omo-originals.js';
import type { SqlDatabase } from '../../apps/world-worker/src/persistence/sql-database.js';
import { createPostwarCentralBankAuthorizationDatabase } from '../../apps/world-worker/src/persistence/postwar-central-bank-intake-authorization.js';
const world = 'WORLD_TEST_ONLY_CB_WORLD';
function countryData(index: '01' | '02') {
  const legacy = centralBankTestOnlyFixture('BUY_GOVERNMENT_SECURITIES', '1'),
    country = 'COUNTRY_' + index;
  const map = (v: unknown): unknown =>
    typeof v === 'string'
      ? v === 'WORLD_TEST_ONLY_CB1'
        ? world
        : v === 'COUNTRY_TEST_ONLY_CB1'
          ? country
          : v.replaceAll('TEST_ONLY', 'TEST_ONLY_' + index)
      : Array.isArray(v)
        ? v.map(map)
        : v && typeof v === 'object'
          ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, map(x)]))
          : v;
  const raw = map(JSON.parse(C.canonicalSerialize(legacy.seed))) as Record<
      string,
      unknown
    >,
    { fingerprint: _fp, ...intent } = raw;
  void _fp;
  const seed = C.parseOpeningSeed(
    {
      ...intent,
      fingerprint: C.canonicalSha256(C.canonicalHashInput(intent), sha),
    },
    sha,
  );
  const facts = map(
    legacy.preparation.source.facts,
  ) as C.CentralBankOmoSourceFacts;
  const c = legacy.command;
  const command = C.parseCanonicalCommand(
    {
      schemaVersion: c.schemaVersion,
      worldId: world,
      countryId: country,
      commandId: `COMMAND_TEST_ONLY_CB_WORLD_${index}`,
      idempotencyKey: `KEY_TEST_ONLY_CB_WORLD_${index}`,
      expectedWorldVersion: index === '01' ? '0' : '1',
      officeId: c.officeId,
      actorId: `ACTOR_TEST_ONLY_CB_WORLD_${index}`,
      authSubject:
        index === '01' ? c.authSubject : '22222222-2222-4222-8222-222222222222',
      commandType: c.commandType,
      correlationId: `CORRELATION_TEST_ONLY_CB_WORLD_${index}`,
      simTime: c.simTime.toCanonicalValue(),
      submittedAtReal: c.submittedAtReal,
      payload: map(JSON.parse(c.canonicalPayload)),
    },
    sha,
  );
  const source = C.createOpeningSource(
    {
      schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: seed.sources[0]!.sourceId,
      sourceKind: 'DOCUMENTED_ASSUMPTION',
      sourceVersion: 'TEST_ONLY_CB_WORLD_V1',
      locator: 'fixture://TEST_ONLY_CB_WORLD_' + index,
      payload: { notice: 'TEST_ONLY NOT FORMAL SECURITIES/PRICES' },
    },
    sha,
  );
  return { seed, facts, command, source };
}
export async function createPostwarCentralBankWorldAtomicFixture() {
  const first = countryData('01'),
    second = countryData('02');
  const seed = C.createOpeningSeed(
    {
      schemaVersion: C.OPENING_SEED_SCHEMA_VERSION,
      worldId: C.worldId(world),
      seedId: C.openingSeedId('SEED_TEST_ONLY_CB_WORLD'),
      openingWorldVersion: '0',
      replayBinding: C.CURRENT_REPLAY_BINDING,
      sources: [first.source, second.source],
      financialBatches: [
        ...first.seed.financialBatches,
        ...second.seed.financialBatches,
      ],
      inventoryEntries: [],
    },
    sha,
  );
  const f = await createCentralBankOmoAtomicFixture({
    seed,
    command: first.command,
    facts: first.facts,
  });
  try {
    // Existing host roles/catalogues are TEST_ONLY metadata. CB host mode still
    // requires its real independently adopted original in the actual custody.
    await f.db
      .exec(`create role world_v2_day_one_fx_history_owner nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
grant usage on schema world_v2 to world_v2_day_one_fx_history_owner;
create role world_v2_finance_budget_source_reader nologin;
create role world_v2_social_source_reader nologin;
create role world_v2_day_one_fx_source_reader nologin;
create role world_v2_captain_source_reader nologin;
create table world_v2.social_operating_source_registration(world_id text,country_id text,seed_fingerprint text,admission_ref text,registration_ref text);
create table world_v2.social_operating_source_revocation(registration_ref text);
create table world_v2.finance_budget_policy_original(world_id text,country_id text,seed_fingerprint text,admission_ref text,policy_ref text);
create table world_v2.finance_budget_policy_revocation(policy_ref text);
create table world_v2.postwar_day_one_fx_source_original(world_id text,seed_id text,seed_fingerprint text,admission_ref text,registration_ref text);
create table world_v2.postwar_day_one_fx_source_revocation(registration_ref text);
create table world_v2.postwar_day_one_fx_quote_original(world_id text,country_id text,quote_ref text);
create table world_v2.postwar_day_one_fx_quote_revocation(world_id text,country_id text,quote_ref text);
create table world_v2.captain_operating_source_adoption(world_id text,country_id text,seed_fingerprint text,adoption_ref text);
create table world_v2.captain_operating_source_revocation(adoption_ref text);
create table world_v2.captain_source_publication_registry(world_id text,country_id text,seed_fingerprint text,world_admission_ref text,adoption_ref text);`);
    await f.db.exec(
      await readFile(
        new URL(
          '../../database/proposals/central-bank-omo-history-read.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    const original: CentralBankOmoOriginal = {
      schemaVersion: 'central-bank-omo-original-v1',
      worldId: world,
      countryId: 'COUNTRY_02',
      seedFingerprint: seed.fingerprint,
      sourceRef: second.facts.quote.sourceRef,
      sourceRevision: 'TEST_ONLY_WORLD_REV_1',
      domesticTreasuryRef: second.facts.domesticTreasuryRef,
      bank: second.facts.bank,
      centralBank: second.facts.centralBank,
      bankAccounts: second.facts.bankAccounts,
      centralBankAccounts: second.facts.centralBankAccounts,
      holdings: second.facts.holdings,
    };
    const quote = {
      ...second.facts.quote,
      worldVersion: '1',
      quoteRef: 'QUOTE_TEST_ONLY_CB_WORLD_HEAD_1',
    };
    await f.db.query(
      'insert into world_v2.central_bank_omo_adoption values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
      [
        'ADOPTION_TEST_ONLY_CB_WORLD_02',
        world,
        'COUNTRY_02',
        seed.seedId,
        seed.fingerprint,
        'ADMISSION_' + '1'.repeat(64),
        '1',
        'ISSUER_TEST_ONLY',
        'CUSTODIAN_TEST_ONLY',
        original.sourceRef,
        original.sourceRevision,
        'TEST_ONLY',
        sha('TEST_ONLY_INDEPENDENT_ADOPTION'),
        sha(C.canonicalSerialize(original)),
      ],
    );
    await f.db.query(
      'insert into world_v2.central_bank_omo_quote_adoption values($1,$2,$3,$4)',
      [
        'ADOPTION_TEST_ONLY_CB_WORLD_02',
        quote.quoteRef,
        sha(C.canonicalSerialize(quote)),
        sha('TEST_ONLY_INDEPENDENT_QUOTE'),
      ],
    );
    const publisher: SqlDatabase = {
      ...f.admin,
      transaction: (consume) =>
        f.admin.transaction(async (tx) => {
          await tx.query('set local role world_v2_cb_omo_source_publisher');
          return consume(tx);
        }),
    };
    await publishCentralBankOmoOriginals({
      database: publisher,
      adoptionRef: 'ADOPTION_TEST_ONLY_CB_WORLD_02',
      original,
      quote,
    });
    await f.db.query(
      "insert into world_v2.current_commit_authorization(world_id,auth_subject,country_id,office_id,capability,team_id,authorization_version,active,refreshed_at_real)values($1,$2::uuid,'COUNTRY_02','CENTRAL_BANK',$3,'TEAM_TEST_ONLY_CB_WORLD_02','1',true,$4)",
      [world, second.command.authSubject, C.CENTRAL_BANK_OMO_CAPABILITY, at],
    );
    const authorization = await C.authorizeOfficeCapability({
      principal: {
        authSubject: second.command.authSubject,
        facts: {
          user_id: second.command.authSubject,
          display_name: 'TEST_ONLY',
          school_id: null,
        },
        token: {
          subject: second.command.authSubject,
          issuer: 'TEST_ONLY',
          audience: 'TEST_ONLY',
          issuedAt: at,
          expiresAt: '2026-10-08T00:00:00.000Z',
        },
      },
      resolver: {
        resolveCurrentIdentity: async () => second.command.authSubject,
        async resolveCurrentMembership() {
          const r = await f.db.query<{
              country_id: string;
              team_id: string;
              authorization_version: string;
              active: boolean;
            }>(
              "select country_id,team_id,authorization_version,active from world_v2.current_commit_authorization where world_id=$1 and auth_subject=$2::uuid and office_id='CENTRAL_BANK'and capability=$3",
              [
                world,
                second.command.authSubject,
                C.CENTRAL_BANK_OMO_CAPABILITY,
              ],
            ),
            a = r.rows[0];
          return !a
            ? null
            : {
                authSubject: second.command.authSubject,
                worldId: C.worldId(world),
                countryId: C.countryId(a.country_id),
                teamId: C.teamId(a.team_id),
                authorizationVersion: a.authorization_version,
                officeAssignments: [C.officeId('CENTRAL_BANK')],
                active: a.active,
                suspended: false,
                isWorldAdmin: false,
                negotiationPartyIds: [],
              };
        },
      },
      worldId: C.worldId(world),
      requestedCountryId: C.countryId('COUNTRY_02'),
      requestedOfficeId: C.officeId('CENTRAL_BANK'),
      capability: C.CENTRAL_BANK_OMO_CAPABILITY,
    });
    const clock = Object.freeze({
      nowReal: () => at,
      simTime: async () => '10000',
    });
    const workerPool = {
      connect: async () => {
        throw Error('TEST_ONLY_UNUSED_POOL_TRANSPORT');
      },
    } as Pick<Pool, 'connect'>;
    await f.db.exec(
      await readFile(
        new URL(
          '../../database/migrations/artifacts/0013_world_v2_read_projection_boundary.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    const bindingStorage = await readFile(
        new URL(
          '../../database/proposals/runtime-read-binding-storage.sql',
          import.meta.url,
        ),
        'utf8',
      ),
      admissionMarker = 'create table world_v2.runtime_opening_admission';
    if (bindingStorage.split(admissionMarker).length !== 2)
      throw Error('EXACT_OFFICIAL_SEAT_DDL_BOUNDARY_REQUIRED');
    // Reuse the exact official seat DDL and all its constraints/RLS. The
    // previously bootstrapped admission remains the explicit TEST_ONLY stand-in.
    await f.db.exec(
      bindingStorage.slice(0, bindingStorage.indexOf(admissionMarker)),
    );
    // The production dependency is provided by runtime admission publication.
    // This tiny fixture's independent admission remains explicitly TEST_ONLY.
    await f.db.exec(
      'create role world_v2_admission_release nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication',
    );
    await f.db.exec(
      await readFile(
        new URL(
          '../../database/proposals/postwar-central-bank-intake-binding.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    for (const command of [first.command, second.command]) {
      const row = (
        await f.db.query<{ team_id: string; authorization_version: string }>(
          'select team_id,authorization_version from world_v2.current_commit_authorization where world_id=$1 and auth_subject=$2::uuid',
          [world, command.authSubject],
        )
      ).rows[0]!;
      await f.db.query(
        "insert into world_v2.runtime_read_seat(world_id,auth_subject,country_id,office_id,team_id,authorization_revision)values($1,$2::uuid,$3,'CENTRAL_BANK',$4,$5)",
        [
          world,
          command.authSubject,
          command.countryId,
          row.team_id,
          row.authorization_version,
        ],
      );
      const scope =
        'OFFICE_' +
        Buffer.from(command.countryId).toString('hex').toUpperCase() +
        '_' +
        Buffer.from('CENTRAL_BANK').toString('hex').toUpperCase();
      await f.db.query(
        "insert into world_v2.projection_entitlement values($1,$2::uuid,'OFFICE_PRIVATE',$3,$4,true,$5,null)",
        [world, command.authSubject, scope, row.authorization_version, at],
      );
    }
    await f.db.exec(
      'revoke update(authorization_version)on world_v2.current_commit_authorization from cb_omo_atomic_test_worker',
    );
    const database = createPostwarCentralBankAuthorizationDatabase(f.database);
    const runtime = createPostwarCentralBankOmoWorldRuntime({
      database,
      worldId: world,
      workerId: worker,
      workerRole: 'cb_omo_atomic_test_worker',
      mode: 'TEST_ONLY_LOCAL',
      countryIds: ['COUNTRY_01', 'COUNTRY_02', 'COUNTRY_03'],
      clock,
      workerPool,
    });
    await runtime.prepare(seed);
    const execution = createAuthoritativeWorkerExecution({
      database,
      workerId: worker,
      sha256Hex: sha,
      candidateFactory: runtime.factory,
      centralBankOmoSourceCommitProtectionPort:
        runtime.sourceCommitProtectionPort,
    });
    async function enqueueSecond() {
      const c = second.command;
      await f.db.query(
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
      await f.db.query(
        "insert into world_v2.command_queue(world_id,command_id,authority_kind,priority_rank,available_at_sim_time,attempt_count)values($1,$2,'DISCRETIONARY_USER',0,10000,0)",
        [world, c.commandId],
      );
      await f.db.query(
        "update world_v2.command_queue set queue_state='CLAIMED',attempt_count=1,claimed_by=$3,claimed_at_real=$4,claim_fencing_token=1 where world_id=$1 and command_id=$2",
        [world, c.commandId, worker, at],
      );
    }
    return {
      ...f,
      database,
      runtime,
      execution,
      clock,
      second,
      secondInput: {
        command: second.command,
        authorityKind: 'DISCRETIONARY_USER' as const,
        commitSimTime: second.command.simTime,
        recordedAtReal: at,
        requiredCapability: C.CENTRAL_BANK_OMO_CAPABILITY,
        intakeAuthorization: authorization,
      },
      enqueueSecond,
    };
  } catch (error) {
    await f.db.close();
    throw error;
  }
}
