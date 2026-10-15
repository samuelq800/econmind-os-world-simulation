/** TEST_PROTOCOL_ONLY: owns its real disposable PGlite and SQL facts.
 * Not the production ADMITTED executor, source adoption or a formal opening.
 * No external database/Pool/DSN/context may be blessed by this fixture.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  authenticateIdentity,
  authorizeOfficeCapability,
  authSubject,
  canonicalSerialize,
  countryId,
  createOpeningSeed,
  createOpeningSource,
  CURRENT_REPLAY_BINDING,
  officeId,
  openingSeedId,
  openingSourceId,
  parseOpeningSeed,
  rebuildV08LedgersFromLineage,
  teamId,
  worldId,
  type AuthorizationResolver,
} from '@econmind/core';
import {
  WORLD_V2_ENTITLED_PROJECTION_QUERY,
  type ParameterizedPgReadExecutor,
  type ParameterizedPgReadRequest,
  type ParameterizedPgReadResult,
} from '../../apps/world-api/src/integration/postgres-read-adapter.js';
import { WorldReadFailure } from '../../apps/world-api/src/integration/transport.js';
import { RuntimeReadBindingStore } from '../../apps/world-worker/src/persistence/runtime-read-binding-store.js';
import { createPGliteV09AtomicTestDatabase } from './v09-atomic-database.js';
import {
  V09TransactionCleanupIncompleteError,
  V09TransactionCommitUnknownError,
  V09TransactionRolledBackError,
  type V09AtomicSqlClient,
  type V09AtomicTestDatabase,
} from './v09-atomic-contract.js';

const WORLD = worldId('WORLD_V10_COUNTRY_FLOW_TEST');
const SUBJECT = authSubject('550e8400-e29b-41d4-a716-446655440021');
const OTHER = authSubject('550e8400-e29b-41d4-a716-446655440022');
const COUNTRY = countryId('COUNTRY_SELLER');
const OFFICE = officeId('TRADE');
const TEAM = teamId('TEAM_SELLER');
const REVISION = 'AUTH_SELLER_1';
const AT = '2026-09-14T00:00:00.000Z';
const PUBLISHER = 'test_only_protocol_authz_publisher';
const READER = 'test_only_protocol_reader';
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const root = path.resolve(import.meta.dirname, '../..');
const migrations = [
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
  '0013_world_v2_read_projection_boundary.sql',
] as const;

type FaultPoint =
  | 'AFTER_CONTEXT_INSERT_BEFORE_COMMIT'
  | 'AFTER_COMMIT_BEFORE_ACKNOWLEDGEMENT'
  | 'READ_AFTER_FACTS_BEFORE_RETURN';
type Row = Record<string, unknown>;
export interface TestOnlyPersistedReadContextFixture {
  readonly database: V09AtomicTestDatabase;
  readonly executor: Readonly<ParameterizedPgReadExecutor>;
  publishContext(): Promise<
    Readonly<{
      disposition:
        'TEST_PROTOCOL_CONTEXT_PUBLISHED' | 'EXISTING_TEST_PROTOCOL_CONTEXT';
      worldId: string;
      contextRef: string;
      seedFingerprint: string;
    }>
  >;
  close(): Promise<void>;
}

const lifecycle = { created: 0, closed: 0, open: 0, peakOpen: 0 };
export function protocolFixtureLifecycle() {
  return Object.freeze({ ...lifecycle });
}

function denied(message: string): never {
  throw new WorldReadFailure('PROTOCOL_ERROR', message, false);
}
function cancelled(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw new WorldReadFailure(
      'CANCELLED',
      'Protocol fixture read cancelled',
      false,
    );
}
function opening() {
  const source = createOpeningSource(
    {
      schemaVersion: 'opening-source-v1',
      sourceId: openingSourceId('SOURCE_V10_PROTOCOL_CONTEXT'),
      sourceKind: 'TEST_FIXTURE',
      locator: 'fixture://TEST_ONLY/v10-1-country-office-read-flow',
      sourceVersion: 'test-protocol-context-v1',
      payload: {
        schemaVersion: 'test-protocol-source-v1',
        evidenceKind: 'TEST_PROTOCOL_ONLY',
        worldId: WORLD,
        countryId: COUNTRY,
        officeId: OFFICE,
        purpose: 'COUNTRY_OFFICE_READ_PROTOCOL',
      },
    },
    sha,
  );
  const seed = createOpeningSeed(
    {
      schemaVersion: 'opening-seed-v1',
      seedId: openingSeedId('SEED_V10_PROTOCOL_CONTEXT'),
      worldId: WORLD,
      openingWorldVersion: '0',
      replayBinding: CURRENT_REPLAY_BINDING,
      sources: [source],
      inventoryEntries: [],
      financialBatches: [],
    },
    sha,
  );
  const bytes = canonicalSerialize(seed);
  const parsed = parseOpeningSeed(JSON.parse(bytes) as unknown, sha);
  rebuildV08LedgersFromLineage({ seed: parsed, sha256Hex: sha });
  return { seed: parsed, bytes, sourceHash: sha(source.canonicalPayload) };
}

const seatSchema = [
  String.raw`create table world_v2.runtime_read_seat (
  seat_ref text primary key default ('SEAT_' || upper(replace(pg_catalog.gen_random_uuid()::text, '-', '_')))
    check (seat_ref ~ '^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'),
  world_id text not null references world_v2.world_head(world_id)
    check (world_id ~ '^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'),
  auth_subject uuid not null,
  country_id text not null check (country_id ~ '^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'),
  office_id text not null check (office_id in ('CAPTAIN','FINANCE','CENTRAL_BANK','INDUSTRY','TRADE','SOCIAL')),
  team_id text not null check (team_id ~ '^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'),
  authorization_revision text not null check (
    authorization_revision = btrim(authorization_revision)
    and length(authorization_revision) between 1 and 256
  ),
  created_at_real timestamptz not null default current_timestamp,
  unique (world_id, auth_subject, office_id, authorization_revision)
);
comment on table world_v2.runtime_read_seat is
  'Immutable revision-scoped reference derived from current server authorization; not a role assignment, capability, active flag or grant. Existing current authorization and entitlement remain mandatory at every read.';

create function world_v2.validate_runtime_read_seat_insert()
returns trigger language plpgsql security invoker as $$
begin
  if not exists (
    select 1 from world_v2.current_commit_authorization a
    where a.world_id = new.world_id and a.auth_subject = new.auth_subject
      and a.country_id = new.country_id and a.office_id = new.office_id
      and a.team_id = new.team_id and a.authorization_version = new.authorization_revision
      and a.active
  ) or exists (
    select 1 from world_v2.current_commit_authorization a
    where a.world_id = new.world_id and a.auth_subject = new.auth_subject and a.active
      and (a.country_id is distinct from new.country_id
        or a.team_id is distinct from new.team_id
        or a.authorization_version is distinct from new.authorization_revision)
  ) then
    raise exception 'seat reference requires one coherent current membership and the exact Office assignment'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger runtime_read_seat_binds_current_assignment
before insert on world_v2.runtime_read_seat
for each row execute function world_v2.validate_runtime_read_seat_insert();
create trigger runtime_read_seat_is_immutable
before update or delete on world_v2.runtime_read_seat
for each row execute function world_v2.reject_authoritative_history_mutation();
create trigger runtime_read_seat_cannot_truncate
before truncate on world_v2.runtime_read_seat
for each statement execute function world_v2.reject_authoritative_history_mutation();`,
  String.raw`alter table world_v2.runtime_read_seat enable row level security;
alter table world_v2.runtime_read_seat force row level security;
revoke all on world_v2.runtime_read_seat from public;
revoke all on function world_v2.validate_runtime_read_seat_insert() from public;`,
  String.raw`create policy runtime_read_seat_current_subject_select on world_v2.runtime_read_seat
for select to public using (
  current_user not in ('anon','authenticated','service_role','world_v2_api_reader','world_v2_api_login')
  and auth_subject::text = current_setting('request.jwt.claim.sub', true)
  and exists (select 1 from world_v2.current_commit_authorization a
    where a.world_id = runtime_read_seat.world_id and a.auth_subject = runtime_read_seat.auth_subject
      and a.country_id = runtime_read_seat.country_id and a.office_id = runtime_read_seat.office_id
      and a.team_id = runtime_read_seat.team_id and a.authorization_version = runtime_read_seat.authorization_revision and a.active)
  and not exists (select 1 from world_v2.current_commit_authorization a
    where a.world_id = runtime_read_seat.world_id and a.auth_subject = runtime_read_seat.auth_subject and a.active
      and (a.country_id is distinct from runtime_read_seat.country_id or a.team_id is distinct from runtime_read_seat.team_id
        or a.authorization_version is distinct from runtime_read_seat.authorization_revision))
);`,
  String.raw`create policy runtime_read_seat_current_assignment_insert on world_v2.runtime_read_seat
for insert to public with check (
  current_user not in ('anon','authenticated','service_role','world_v2_api_reader','world_v2_api_login')
  and exists (select 1 from world_v2.current_commit_authorization a
    where a.world_id = runtime_read_seat.world_id and a.auth_subject = runtime_read_seat.auth_subject
      and a.country_id = runtime_read_seat.country_id and a.office_id = runtime_read_seat.office_id
      and a.team_id = runtime_read_seat.team_id and a.authorization_version = runtime_read_seat.authorization_revision and a.active)
);`,
];
const contextColumns = `world_id, context_ref, fixture_schema_version, source_kind,
 source_bytes_sha256, canonical_seed_payload, seed_id, seed_fingerprint,
 model_version, canonical_replay_binding, canonical_context_intent,
 context_intent_sha256, publication_genesis_world_version::text as publication_genesis_world_version,
 publication_genesis_event_sequence::text as publication_genesis_event_sequence`;
const contextSchema = String.raw`
create schema test_protocol;
create table test_protocol.persisted_read_context (
 world_id text primary key references world_v2.world_head(world_id),
 context_ref text not null unique check(context_ref ~ '^TEST_PROTOCOL_CONTEXT_[0-9A-F]{64}$'),
 fixture_schema_version text not null check(fixture_schema_version='test-protocol-read-context-v1'),
 source_kind text not null check(source_kind='TEST_FIXTURE'),
 source_bytes_sha256 text not null check(source_bytes_sha256 ~ '^[0-9a-f]{64}$'),
 canonical_seed_payload text not null check(octet_length(canonical_seed_payload)<=16384),
 seed_id text not null check(seed_id ~ '^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'),
 seed_fingerprint text not null check(seed_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
 model_version text not null,
 canonical_replay_binding text not null,
 canonical_context_intent text not null check(octet_length(canonical_context_intent)<=32768),
 context_intent_sha256 text not null check(context_intent_sha256 ~ '^[0-9a-f]{64}$'),
 publication_genesis_world_version bigint not null check(publication_genesis_world_version=0),
 publication_genesis_event_sequence bigint not null check(publication_genesis_event_sequence=0),
 created_at_real timestamptz not null
);
create trigger test_protocol_context_immutable before update or delete on test_protocol.persisted_read_context
 for each row execute function world_v2.reject_authoritative_history_mutation();
create trigger test_protocol_context_no_truncate before truncate on test_protocol.persisted_read_context
 for each statement execute function world_v2.reject_authoritative_history_mutation();
alter table test_protocol.persisted_read_context enable row level security;
alter table test_protocol.persisted_read_context force row level security;
revoke all on test_protocol.persisted_read_context from public;
create policy test_protocol_context_current_subject on test_protocol.persisted_read_context for select to public using (
 exists(select 1 from world_v2.current_commit_authorization a join world_v2.runtime_read_seat s
 on s.world_id=a.world_id and s.auth_subject=a.auth_subject and s.country_id=a.country_id
 and s.office_id=a.office_id and s.team_id=a.team_id and s.authorization_revision=a.authorization_version
 where a.world_id=persisted_read_context.world_id and a.auth_subject::text=current_setting('request.jwt.claim.sub',true)
 and a.capability='TRADE_POLICY' and a.active)
);`;

function membershipRows(
  db: V09AtomicSqlClient,
  subject: string,
  world: string,
) {
  return db.query<{
    world_id: string;
    auth_subject: string;
    country_id: string;
    office_id: string;
    capability: string;
    team_id: string;
    authorization_version: string;
    active: boolean;
  }>(
    `select world_id,auth_subject::text,country_id,office_id,capability,team_id,authorization_version,active
     from world_v2.current_commit_authorization where world_id=$1 and auth_subject=$2::uuid and active`,
    [world, subject],
  );
}

export async function createTestOnlyPersistedReadContextFixture(
  options: Readonly<{ faultPoint?: FaultPoint }> = {},
): Promise<Readonly<TestOnlyPersistedReadContextFixture>> {
  const allowedFaults: readonly string[] = [
    'AFTER_CONTEXT_INSERT_BEFORE_COMMIT',
    'AFTER_COMMIT_BEFORE_ACKNOWLEDGEMENT',
    'READ_AFTER_FACTS_BEFORE_RETURN',
  ];
  if (
    Object.keys(options).some((k) => k !== 'faultPoint') ||
    (options.faultPoint !== undefined &&
      !allowedFaults.includes(options.faultPoint))
  )
    throw new Error('TEST_PROTOCOL_FACTORY_EXTERNAL_INPUT_DENIED');
  const owned = createPGliteV09AtomicTestDatabase();
  lifecycle.created++;
  lifecycle.open++;
  lifecycle.peakOpen = Math.max(lifecycle.peakOpen, lifecycle.open);
  let tail: Promise<void> = Promise.resolve();
  let state: 'OPEN' | 'CLOSING' | 'POISONED' | 'CLOSED' = 'OPEN';
  let closing: Promise<void> | undefined;
  let fault = options.faultPoint;
  const close = (): Promise<void> => {
    if (closing) return closing;
    state = 'CLOSING';
    closing = tail
      .then(() => owned.close())
      .then(() => {
        state = 'CLOSED';
        lifecycle.closed++;
        lifecycle.open--;
        console.info(
          'TEST_PROTOCOL_INSTANCE_CLOSED',
          JSON.stringify(protocolFixtureLifecycle()),
        );
      });
    return closing;
  };
  function serial<Result>(operation: () => Promise<Result>): Promise<Result> {
    if (state !== 'OPEN')
      return Promise.reject(new Error('TEST_PROTOCOL_DATABASE_UNAVAILABLE'));
    const work = tail.then(() => {
      if (state !== 'OPEN')
        throw new Error('TEST_PROTOCOL_DATABASE_UNAVAILABLE');
      return operation();
    });
    tail = work.then(
      () => undefined,
      () => undefined,
    );
    return work.catch(async (error: unknown) => {
      if (
        error instanceof V09TransactionCommitUnknownError ||
        error instanceof V09TransactionCleanupIncompleteError
      ) {
        state = 'POISONED';
        await close();
      }
      throw error;
    });
  }
  const database: V09AtomicTestDatabase = Object.freeze({
    kind: owned.kind,
    supportsParallelTransactions: false,
    query: <RowType extends object = Row>(
      text: string,
      values?: readonly unknown[],
    ) => serial(() => owned.query<RowType>(text, values)),
    executeScript: (script: string) =>
      serial(() => owned.executeScript(script)),
    transaction: <Result>(
      operation: (tx: V09AtomicSqlClient) => Promise<Result>,
    ) => serial(() => owned.transaction(operation)),
    close,
  });
  let fresh: ReturnType<typeof opening>;
  try {
    fresh = opening();
  } catch (error) {
    await close();
    throw error;
  }
  const intent = {
    fixture_schema_version: 'test-protocol-read-context-v1',
    world_id: fresh.seed.worldId,
    seed_id: fresh.seed.seedId,
    source_kind: 'TEST_FIXTURE',
    source_bytes_sha256: fresh.sourceHash,
    canonical_seed_payload: fresh.bytes,
    seed_fingerprint: fresh.seed.fingerprint,
    model_version: fresh.seed.replayBinding.modelVersion,
    canonical_replay_binding: canonicalSerialize(fresh.seed.replayBinding),
    publication_genesis_world_version: '0',
    publication_genesis_event_sequence: '0',
  };
  const intentBytes = canonicalSerialize(intent);
  const intentHash = sha(intentBytes);
  const contextRef = 'TEST_PROTOCOL_CONTEXT_' + intentHash.toUpperCase();
  const contextFrom = (tx: V09AtomicSqlClient) =>
    tx.query<Row>(
      `select ${contextColumns} from test_protocol.persisted_read_context where world_id=$1`,
      [WORLD],
    );
  function validate(row: Row) {
    try {
      if (typeof row.canonical_seed_payload !== 'string')
        denied('Protocol canonical seed missing');
      const seed = parseOpeningSeed(
        JSON.parse(row.canonical_seed_payload) as unknown,
        sha,
      );
      rebuildV08LedgersFromLineage({ seed, sha256Hex: sha });
      const actual = {
        fixture_schema_version: row.fixture_schema_version,
        world_id: row.world_id,
        seed_id: row.seed_id,
        source_kind: row.source_kind,
        source_bytes_sha256: row.source_bytes_sha256,
        canonical_seed_payload: row.canonical_seed_payload,
        seed_fingerprint: row.seed_fingerprint,
        model_version: row.model_version,
        canonical_replay_binding: row.canonical_replay_binding,
        publication_genesis_world_version:
          row.publication_genesis_world_version,
        publication_genesis_event_sequence:
          row.publication_genesis_event_sequence,
      };
      const bytes = canonicalSerialize(actual);
      if (
        canonicalSerialize(seed) !== row.canonical_seed_payload ||
        seed.sources.length !== 1 ||
        seed.sources[0]?.sourceKind !== 'TEST_FIXTURE' ||
        sha(seed.sources[0].canonicalPayload) !== row.source_bytes_sha256 ||
        seed.seedId !== row.seed_id ||
        seed.worldId !== row.world_id ||
        seed.fingerprint !== row.seed_fingerprint ||
        seed.replayBinding.modelVersion !== row.model_version ||
        canonicalSerialize(seed.replayBinding) !==
          row.canonical_replay_binding ||
        bytes !== row.canonical_context_intent ||
        sha(bytes) !== row.context_intent_sha256 ||
        row.context_ref !==
          'TEST_PROTOCOL_CONTEXT_' + sha(bytes).toUpperCase() ||
        bytes !== intentBytes
      )
        denied('Protocol context canonical source/intent conflict');
      return seed;
    } catch (error) {
      if (error instanceof WorldReadFailure) throw error;
      return denied('Protocol context canonical source rejected');
    }
  }
  const takeFault = (point: FaultPoint) => {
    if (fault !== point) return false;
    fault = undefined;
    return true;
  };
  const publishContext = async () => {
    const result = await database.transaction(async (tx) => {
      const before = await contextFrom(tx);
      if (before.rows.length === 1) {
        const row = before.rows[0]!;
        const seed = validate(row);
        return {
          disposition: 'EXISTING_TEST_PROTOCOL_CONTEXT' as const,
          worldId: seed.worldId,
          contextRef: String(row.context_ref),
          seedFingerprint: seed.fingerprint,
        };
      }
      if (before.rows.length !== 0) denied('Protocol context multiplicity');
      const head = await tx.query<{
        world_version: string;
        event_sequence: string;
      }>(
        'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1 for update',
        [WORLD],
      );
      if (
        head.rows.length !== 1 ||
        head.rows[0]?.world_version !== '0' ||
        head.rows[0]?.event_sequence !== '0'
      )
        denied('New protocol context requires genesis 0/0');
      await tx.query(
        `insert into test_protocol.persisted_read_context
        (world_id,context_ref,fixture_schema_version,source_kind,source_bytes_sha256,canonical_seed_payload,
         seed_id,seed_fingerprint,model_version,canonical_replay_binding,canonical_context_intent,
         context_intent_sha256,publication_genesis_world_version,publication_genesis_event_sequence,created_at_real)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,0,0,$13)`,
        [
          intent.world_id,
          contextRef,
          intent.fixture_schema_version,
          intent.source_kind,
          intent.source_bytes_sha256,
          intent.canonical_seed_payload,
          intent.seed_id,
          intent.seed_fingerprint,
          intent.model_version,
          intent.canonical_replay_binding,
          intentBytes,
          intentHash,
          AT,
        ],
      );
      const stored = await contextFrom(tx);
      if (stored.rows.length !== 1) denied('Protocol context readback missing');
      const row = stored.rows[0]!,
        seed = validate(row);
      if (takeFault('AFTER_CONTEXT_INSERT_BEFORE_COMMIT'))
        throw new Error('TEST_ONLY_CONTEXT_BEFORE_COMMIT');
      return {
        disposition: 'TEST_PROTOCOL_CONTEXT_PUBLISHED' as const,
        worldId: seed.worldId,
        contextRef: String(row.context_ref),
        seedFingerprint: seed.fingerprint,
      };
    });
    if (takeFault('AFTER_COMMIT_BEFORE_ACKNOWLEDGEMENT'))
      throw new Error('TEST_ONLY_KNOWN_COMMIT_RESPONSE_LOST');
    return Object.freeze(result);
  };

  const seatDatabase = {
    query: database.query,
    transaction: <Result>(
      operation: (tx: V09AtomicSqlClient) => Promise<Result>,
    ) =>
      database.transaction(async (tx) => {
        await tx.query(`set local role ${PUBLISHER}`);
        await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
          SUBJECT,
        ]);
        return operation(tx);
      }),
  };
  const seats = new RuntimeReadBindingStore({
    database: seatDatabase,
    authorizationPublisherRole: PUBLISHER,
    runtimeReaderRole: READER,
  });
  const executor: ParameterizedPgReadExecutor = Object.freeze({
    async query(
      request: ParameterizedPgReadRequest,
    ): Promise<ParameterizedPgReadResult> {
      cancelled(request.signal);
      if (
        request.text !== WORLD_V2_ENTITLED_PROJECTION_QUERY ||
        request.values.length !== 6 ||
        !request.verifiedAuthSubject ||
        request.values[0] !== request.verifiedAuthSubject ||
        !['COUNTRY', 'OFFICE_PRIVATE'].includes(request.values[2]!)
      )
        throw new WorldReadFailure(
          'AUTHORIZATION_DENIED',
          'Protocol query denied',
          false,
        );
      let subject: string;
      try {
        subject = authSubject(request.verifiedAuthSubject);
      } catch {
        throw new WorldReadFailure(
          'AUTHORIZATION_DENIED',
          'Protocol subject denied',
          false,
        );
      }
      let result: ParameterizedPgReadResult;
      try {
        result = await database.transaction(async (tx) => {
          await tx.query(
            'set transaction isolation level repeatable read read only',
          );
          cancelled(request.signal);
          await tx.query(`set local role ${READER}`);
          await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
            subject,
          ]);
          cancelled(request.signal);
          const facts = await tx.query<{
            world_id: string;
            auth_subject: string;
            country_id: string;
            office_id: string;
            authorization_version: string;
            classification: 'COUNTRY' | 'OFFICE_PRIVATE';
            scope_key: string;
            world_version: string;
            event_sequence: string;
            projection_world_version: string;
            projection_event_sequence: string;
          }>(
            `select distinct a.world_id,a.auth_subject::text,a.country_id,a.office_id,a.authorization_version,
             e.classification,e.scope_key,h.world_version::text,h.event_sequence::text,
             p.world_version::text as projection_world_version,p.event_sequence::text as projection_event_sequence
             from world_v2.current_commit_authorization a
             join world_v2.projection_entitlement e on e.world_id=a.world_id and e.auth_subject=a.auth_subject
               and e.authorization_version=a.authorization_version and e.active and e.revoked_at is null
             join world_v2.read_projection p on p.world_id=e.world_id and p.classification=e.classification and p.scope_key=e.scope_key
             join world_v2.world_head h on h.world_id=a.world_id
             where a.world_id=$2 and a.auth_subject=$1::uuid and a.active and a.capability='TRADE_POLICY'
             and e.classification=$3 and e.scope_key=$4
             and ((e.classification='COUNTRY' and e.scope_key=a.country_id) or
              (e.classification='OFFICE_PRIVATE' and e.scope_key=('OFFICE_'||upper(encode(convert_to(a.country_id,'UTF8'),'hex'))||'_'||upper(encode(convert_to(a.office_id,'UTF8'),'hex')))))`,
            request.values.slice(0, 4),
          );
          cancelled(request.signal);
          if (facts.rows.length === 0) return { rows: [] };
          if (facts.rows.length !== 1)
            denied('Protocol current facts are incoherent');
          const f = facts.rows[0]!;
          const seat = await seats.readCurrentSeatFrom({
            executor: tx,
            verifiedSubject: subject,
            worldId: f.world_id,
            countryId: f.country_id,
            officeId: f.office_id,
          });
          cancelled(request.signal);
          if (!seat || seat.authorizationRevision !== f.authorization_version)
            return { rows: [] };
          const stored = await contextFrom(tx);
          cancelled(request.signal);
          if (stored.rows.length !== 1)
            denied('Protocol persisted context missing');
          const seed = validate(stored.rows[0]!);
          if (
            seed.worldId !== f.world_id ||
            f.world_version !== f.projection_world_version ||
            f.event_sequence !== f.projection_event_sequence
          )
            denied('Protocol projection/current head mismatch');
          const rows = await tx.query(request.text, request.values);
          cancelled(request.signal);
          if (rows.rows.length > 1) denied('Protocol projection multiplicity');
          if (rows.rows.length === 0) return { rows: [] };
          if (takeFault('READ_AFTER_FACTS_BEFORE_RETURN'))
            throw new WorldReadFailure(
              'CANCELLED',
              'TEST_ONLY read abandonment after actual facts',
              false,
            );
          return {
            rows: rows.rows,
            verifiedProjectionAuthority: Object.freeze({
              authSubject: seat.authSubject,
              worldId: seed.worldId,
              classification: f.classification,
              scopeKey: f.scope_key,
              seedRef: seed.seedId,
              contentHash: seed.fingerprint,
              worldVersion: f.world_version,
              eventSequence: f.event_sequence,
            }),
          };
        });
      } catch (error) {
        if (
          error instanceof V09TransactionRolledBackError &&
          error.cause instanceof WorldReadFailure
        )
          throw error.cause;
        throw error;
      }
      cancelled(request.signal);
      return result;
    },
  });

  try {
    for (const name of migrations)
      await database.executeScript(
        await readFile(
          path.join(root, 'database/migrations/artifacts', name),
          'utf8',
        ),
      );
    for (const sql of seatSchema) await database.executeScript(sql);
    await database.executeScript(contextSchema);
    await database.executeScript(`
      create role ${PUBLISHER} nologin nosuperuser nobypassrls nocreaterole nocreatedb noreplication;
      create role ${READER} nologin nosuperuser nobypassrls nocreaterole nocreatedb noreplication;
      grant usage on schema world_v2 to ${PUBLISHER},${READER};
      grant usage on schema test_protocol to ${READER};
      grant select on world_v2.current_commit_authorization,world_v2.runtime_read_seat to ${PUBLISHER};
      -- bindCurrentSeat uses SELECT FOR SHARE: PostgreSQL additionally requires
      -- UPDATE on at least one column. Keep this fixture-only permission on the
      -- observation timestamp, not membership/capability/revision or the reader.
      grant update (refreshed_at_real) on world_v2.current_commit_authorization to ${PUBLISHER};
      grant insert on world_v2.runtime_read_seat to ${PUBLISHER};
      grant select on world_v2.current_commit_authorization,world_v2.runtime_read_seat,
       world_v2.projection_entitlement,world_v2.read_projection,world_v2.world_head,
       test_protocol.persisted_read_context to ${READER};`);
    await database.query(
      'insert into world_v2.world_head(world_id) values($1)',
      [WORLD],
    );
    await database.query(
      `insert into world_v2.current_commit_authorization
      (world_id,auth_subject,country_id,office_id,capability,team_id,authorization_version,active,refreshed_at_real)
      values($1,$2::uuid,$3,$4,'TRADE_POLICY',$5,$6,true,$7)`,
      [WORLD, SUBJECT, COUNTRY, OFFICE, TEAM, REVISION, AT],
    );
    const resolver: AuthorizationResolver = {
      async resolveCurrentIdentity(principal) {
        const found = await membershipRows(
          database,
          principal.authSubject,
          WORLD,
        );
        const canonical = found.rows.find(
          (r) => r.capability === 'TRADE_POLICY',
        );
        return canonical ? authSubject(canonical.auth_subject) : null;
      },
      async resolveCurrentMembership(principal, world) {
        const found = await membershipRows(
          database,
          principal.authSubject,
          world,
        );
        const c = found.rows.find((r) => r.capability === 'TRADE_POLICY');
        if (
          !c ||
          found.rows.some(
            (r) =>
              r.world_id !== c.world_id ||
              r.country_id !== c.country_id ||
              r.team_id !== c.team_id ||
              r.authorization_version !== c.authorization_version,
          )
        )
          return null;
        return {
          authSubject: authSubject(c.auth_subject),
          worldId: worldId(c.world_id),
          countryId: countryId(c.country_id),
          teamId: teamId(c.team_id),
          authorizationVersion: c.authorization_version,
          officeAssignments: [
            ...new Set(found.rows.map((r) => officeId(r.office_id))),
          ],
          active: c.active,
          suspended: !c.active,
          isWorldAdmin: false,
          negotiationPartyIds: [],
        };
      },
    };
    const principal = await authenticateIdentity({
      token: 'ENTITLED_PROTOCOL_TEST_TOKEN',
      profile: { user_id: SUBJECT, display_name: null, school_id: null },
      verifier: {
        async verify(token: string) {
          if (
            ![
              'ENTITLED_PROTOCOL_TEST_TOKEN',
              'UNENTITLED_PROTOCOL_TEST_TOKEN',
            ].includes(token)
          )
            throw new Error('TEST_ONLY_TOKEN_DENIED');
          return {
            subject: token === 'ENTITLED_PROTOCOL_TEST_TOKEN' ? SUBJECT : OTHER,
            issuer: 'https://issuer.example.test',
            audience: 'world-api',
            issuedAt: '2027-01-15T07:43:20.000Z',
            expiresAt: '2027-01-15T08:16:40.000Z',
          };
        },
      },
    });
    const authorization = await authorizeOfficeCapability({
      principal,
      resolver,
      worldId: WORLD,
      requestedCountryId: COUNTRY,
      requestedOfficeId: OFFICE,
      capability: 'TRADE_POLICY',
    });
    await seats.bindCurrentSeat({ authorization });
    return Object.freeze({ database, executor, publishContext, close });
  } catch (error) {
    await close();
    throw error;
  }
}
