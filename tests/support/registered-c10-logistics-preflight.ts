/** Fixed C10 read-contract preflight on an already owned clone. No DDL,
 * publication, actor registration, lease/Clock mutation, command or Node.
 * Source lock RPCs require write-mode RR; every transaction rolls back and
 * only fixed SELECT/read RPC statements are invoked. Not a readiness token. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import type { PostwarNativeReferenceMarker } from './postwar-native-reference-db.js';
import { POSTWAR_INDUSTRY_SOURCE_LOCK } from '../../apps/world-worker/src/persistence/postwar-industry-production-source.js';
import { inspectRefinery21OriginalText } from './postwar-refinery21-source-assembly.js';
import { INDUSTRY_FIRST_DAY_READ_QUERY } from '../../apps/world-worker/src/persistence/postwar-industry-first-day-source.js';
import { INDUSTRY_UTILITY_READ_QUERY } from '../../apps/world-worker/src/persistence/postwar-industry-utility-source.js';
import { INDUSTRY_CURRENT_AUTHORIZATION_LOCK_QUERY } from '../../apps/world-worker/src/persistence/postwar-industry-current-authorization.js';
import { INDUSTRY_RUN_SCOPE_QUERY } from '../../apps/world-worker/src/persistence/postwar-industry-run-runtime.js';
import { createPostwarBoundedPrefixPageReaderFrom } from '../../apps/world-worker/src/persistence/postgres-postwar-bounded-prefix-pages.js';
import { createPostwarPhysicalInventoryProvenanceReader } from '../../apps/world-worker/src/persistence/postwar-physical-inventory-provenance.js';
import { createPostwarIndustryLabourCurrentProjectionStore } from '../../apps/world-worker/src/persistence/postwar-industry-labour-current-projection.js';
import { WORLD_ACTOR_BINDING_READ_QUERY } from '../../apps/world-api/src/integration/postgres-world-actor-registry.js';
const country = 'COUNTRY_10',
  facility = 'OPEN-10-REFINED_FUEL';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
export const C10_LOGISTICS_MANUAL_CHAIN = Object.freeze([
  {
    stage: 'RUN',
    kind: 'MANUAL_SOURCE_BOUND',
    requires: [
      'actual facility/quantity/unit/time/cap',
      'current source/seat/actor/lease/Clock',
      'genuine complete current ledgers',
    ],
  },
  {
    stage: 'BOOK',
    kind: 'MANUAL_STRICT_REQUEST',
    requires: [
      'actual COMMITTED RUN',
      'actual available warehouse inventory/title/risk',
      'positive actual domestic source/capacity/time',
      'explicit quantity and window',
    ],
  },
  {
    stage: 'SHIP',
    kind: 'MANUAL_STRICT_REFS',
    requires: [
      'actual COMMITTED BOOK/RESERVED state',
      'current source/inventory/seat/Clock',
    ],
  },
  {
    stage: 'SERVICE_WORK',
    kind: 'MANUAL_STRICT_REFS',
    requires: [
      'actual COMMITTED SHIP',
      'registered distinct service WORK order',
      'actual E03 filled person ranges and nonoverlapping time',
      'actual due/end time',
    ],
  },
  {
    stage: 'PAY_INPUTS',
    kind: 'MANUAL_STRICT_REFS',
    requires: [
      'actual COMMITTED distinct SERVICE_WORK',
      'registered expense order bound to actual WORK fingerprint',
      'actual OP spendable deposit and retained obligations',
      'actual bank/HH claim mirrors',
    ],
  },
  {
    stage: 'DELIVER',
    kind: 'MANUAL_STRICT_REFS',
    requires: [
      'actual COMMITTED qualified PAY_INPUTS',
      'actual due time and IN_TRANSIT inventory',
      'same OP/title/risk/quantity/capacity',
      'Core rederived receipt and inventory posting',
    ],
  },
] as const);
export interface C10PreflightDescriptor {
  readonly repositoryRoot: string;
  readonly database: string;
  readonly worldId: string;
  readonly seedId: string;
  readonly seedFingerprint: string;
  readonly admissionRef: string;
  readonly workerId: string;
  readonly workerRole: string;
  readonly readRole: string;
  readonly intakeRole: string;
  readonly registrationRef: string;
  readonly countries: readonly {
    readonly countryId: string;
    readonly expectedRawSourceSHA256: string;
  }[];
}
type Check = Readonly<{
  name: string;
  status: 'PRESENT' | 'MISSING' | 'DENIED_OR_INVALID' | 'DEFERRED';
  data?: unknown;
  error?: Readonly<{ code: string; message: string }>;
}>;
const tables = [
  'world_head',
  'command_submission',
  'command_queue',
  'command_receipt',
  'authoritative_event',
  'financial_posting_batch',
  'inventory_posting',
] as const;
const queryAdapter = (client: PoolClient) => ({
  async query<T extends object>(q: string, args: readonly unknown[] = []) {
    const r = await client.query<T>(q, [...args]);
    return { rows: r.rows, rowCount: r.rowCount };
  },
});
async function probe(
  client: PoolClient,
  name: string,
  read: () => Promise<unknown>,
): Promise<Check> {
  await client.query('savepoint c10_read_probe');
  try {
    const data = await read();
    await client.query('release savepoint c10_read_probe');
    const explicitlyMissing =
      typeof data === 'object' &&
      data !== null &&
      'status' in data &&
      data.status === 'MISSING';
    const unavailable =
      typeof data === 'object' &&
      data !== null &&
      'status' in data &&
      ['UNAVAILABLE', 'STALE', 'DENIED'].includes(String(data.status));
    return {
      name,
      status:
        data === null ||
        explicitlyMissing ||
        (Array.isArray(data) && data.length === 0)
          ? 'MISSING'
          : unavailable
            ? 'DENIED_OR_INVALID'
            : 'PRESENT',
      ...(data === null ? {} : { data }),
    };
  } catch (error) {
    await client.query('rollback to savepoint c10_read_probe');
    await client.query('release savepoint c10_read_probe');
    const e = error as { code?: unknown; message?: unknown };
    return {
      name,
      status: 'DENIED_OR_INVALID',
      error: {
        code: typeof e.code === 'string' ? e.code : 'NON_SQL',
        message: typeof e.message === 'string' ? e.message : String(error),
      },
    };
  }
}
function one<T>(rows: readonly T[]): T {
  assert.equal(rows.length, 1, 'C10_EXACT_ONE_ACTUAL_ROW_REQUIRED');
  return rows[0]!;
}
function boundedOriginalBytes(
  row: Record<string, unknown>,
  textField: string,
  hashField: string,
) {
  const text = row[textField],
    hash = row[hashField];
  assert(
    typeof text === 'string' &&
      Buffer.byteLength(text) <= 262144 &&
      typeof hash === 'string' &&
      sha(text) === hash,
    'C10_ACTUAL_BOUNDED_ORIGINAL_HASH_REQUIRED',
  );
  return text;
}
function boundedOriginal(
  row: Record<string, unknown>,
  textField: string,
  hashField: string,
) {
  return JSON.parse(boundedOriginalBytes(row, textField, hashField)) as Record<
    string,
    unknown
  >;
}
/** The production inspector consumes exact numeric source lexemes, not rounded
 * JavaScript Numbers. Preserve the original byte/hash check before decoding. */
export function inspectRegisteredC10ProductionOriginal(
  row: Record<string, unknown>,
) {
  return inspectRefinery21OriginalText(
    boundedOriginalBytes(row, 'document_text', 'document_sha256'),
  );
}

export async function inspectRegisteredC10LogisticsPreflight(
  input: Readonly<{
    marker: PostwarNativeReferenceMarker;
    clone: Readonly<{ database: string; installer: Pool }>;
    descriptor: C10PreflightDescriptor;
    /** Existing actual test/office principal only. Never created by this check. */
    authSubject?: string;
  }>,
) {
  assert.equal(process.env.ECONMIND_REGISTERED_C10_LOGISTICS_PREFLIGHT, '1');
  const d = input.descriptor,
    m = input.marker;
  assert(
    m.socket.startsWith('/tmp/') || m.socket.startsWith('/workspace/'),
    'C10_EXISTING_LOCAL_OWNED_SOCKET_REQUIRED',
  );
  assert.notEqual(input.clone.database, m.database);
  assert.match(input.clone.database, /^postwar_clone_[a-z0-9_]+$/u);
  assert.equal(d.database, input.clone.database);
  for (const k of [
    'worldId',
    'seedId',
    'seedFingerprint',
    'admissionRef',
  ] as const)
    assert.equal(d[k], m[k]);
  for (const role of [d.workerRole, d.readRole, d.intakeRole])
    assert.match(role, /^[a-z_][a-z0-9_]{0,62}$/u);
  const selector = d.countries.filter((c) => c.countryId === country);
  assert.equal(selector.length, 1, 'C10_ACTUAL_HOST_SELECTOR_REQUIRED');
  if (input.authSubject !== undefined)
    assert.match(
      input.authSubject,
      /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu,
    );
  const checks: Check[] = [],
    admin = await input.clone.installer.connect();
  const snapshot = async () => {
    const result: Record<string, unknown> = {};
    for (const table of tables)
      result[table] = (
        await admin.query(
          `select count(*)::text count,encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,E'\\n'order by to_jsonb(t)::text collate "C"),''),'UTF8')),'hex')sha256 from world_v2.${table} t`,
        )
      ).rows;
    return result;
  };
  const actualRunIds = new Set<string>();
  let head: { world_version: string; event_sequence: string },
    before: Record<string, unknown>;
  try {
    await admin.query('begin isolation level repeatable read read only');
    assert.equal(
      (await admin.query('select current_database()as database')).rows[0]
        ?.database,
      input.clone.database,
    );
    head = one(
      (
        await admin.query<{ world_version: string; event_sequence: string }>(
          'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1',
          [m.worldId],
        )
      ).rows,
    );
    before = await snapshot();
    checks.push(
      await probe(admin, 'CURRENT_IMMUTABLE_ADMISSION_AND_PERMIT', async () => {
        const rows = (
          await admin.query(
            "select a.seed_id,a.seed_fingerprint,a.admission_ref,a.model_version from world_v2.runtime_opening_admission a join world_v2.opening_seed s on s.world_id=a.world_id and s.seed_id=a.seed_id and s.seed_fingerprint=a.seed_fingerprint and s.replay_binding=a.replay_binding join world_v2.runtime_admission_publication_permit p on a.admission_ref='ADMISSION_'||upper(p.authorization_sha256)and p.world_id=a.world_id and p.seed_id=a.seed_id and p.seed_fingerprint=a.seed_fingerprint and a.admitted_at_real>=p.valid_from and a.admitted_at_real<p.valid_until where a.world_id=$1 and not exists(select 1 from world_v2.runtime_admission_publication_revocation r where r.authorization_id=p.authorization_id)",
            [m.worldId],
          )
        ).rows;
        const a = one(rows);
        assert.equal(a.seed_fingerprint, m.seedFingerprint);
        assert.equal(a.admission_ref, m.admissionRef);
        return a;
      }),
    );
    checks.push(
      await probe(
        admin,
        'C10_PUBLISHED_FINANCE_ORIGINAL_NOT_CURRENT_SPENDABLE_BALANCE',
        async () => {
          const rows = (
            await admin.query(
              'select x.source_text,x.source_sha256,x.seed_fingerprint,x.admission_ref,exists(select 1 from world_v2.finance_budget_capacity_revocation v where v.capacity_ref=x.capacity_ref)as revoked from world_v2.finance_budget_capacity_original x where x.world_id=$1 and x.country_id=$2',
              [m.worldId, country],
            )
          ).rows;
          if (!rows.length) return null;
          const r = one(rows),
            data = boundedOriginal(r, 'source_text', 'source_sha256');
          assert.equal(r.source_sha256, selector[0]!.expectedRawSourceSHA256);
          assert.equal(r.revoked, false, 'C10_CURRENT_FINANCE_SOURCE_REVOKED');
          assert.equal(r.seed_fingerprint, m.seedFingerprint);
          assert.equal(r.admission_ref, m.admissionRef);
          return {
            sourceSha256: r.source_sha256,
            openingTreasury: data.treasury,
            classification:
              'OPENING_CAPACITY_ORIGINAL_NOT_CURRENT_OP_FREE_FUNDS',
          };
        },
      ),
    );
    checks.push(
      await probe(
        admin,
        'C10_ADMITTED_OP_AND_HH_DEPOSIT_MIRROR_ORIGINALS_NOT_CURRENT_FREE_FUNDS',
        async () => {
          const rows = (
            await admin.query(
              'select kind,asset_account,liability_account,opening_amount::text,seed_fingerprint,admission_ref from world_v2.postwar_industry_deposit_original where world_id=$1 and country_id=$2 order by kind',
              [m.worldId, country],
            )
          ).rows;
          if (!rows.length) return null;
          for (const r of rows) {
            assert.equal(r.seed_fingerprint, m.seedFingerprint);
            assert.equal(r.admission_ref, m.admissionRef);
          }
          return {
            rows,
            classification:
              'IMMUTABLE_DEPOSIT_ORIGINALS_CURRENT_PRIVATE_REPLAY_AND_ENCUMBRANCES_STILL_REQUIRED',
          };
        },
      ),
    );
    checks.push(
      await probe(
        admin,
        'C10_ACTUAL_COMMITTED_RUNS_AND_CONTROLLED_SERVICE_ORDER_REFS',
        async () => {
          const runs = (
            await admin.query(
              "select c.command_id,c.command_fingerprint,c.canonical_payload,c.sim_time::text,r.world_version_after::text,r.event_ids from world_v2.command_submission c join world_v2.command_receipt r using(world_id,command_id)where c.world_id=$1 and c.country_id=$2 and c.command_type='CORE_INDUSTRY_RUN_SCHEDULE_V1'and r.outcome='COMMITTED'order by r.world_version_after limit 32",
              [m.worldId, country],
            )
          ).rows;
          for (const r of runs) {
            const intent = JSON.parse(String(r.canonical_payload)) as Record<
              string,
              unknown
            >;
            if (
              intent.facilityId === facility &&
              typeof intent.runId === 'string'
            )
              actualRunIds.add(intent.runId);
          }
          const orders = (
            await admin.query(
              'select run_id,transfer_id,kind,original_ref,original_sha256,original_text from world_v2.postwar_industry_logistics_order where world_id=$1 and country_id=$2 and facility_id=$3 order by run_id,transfer_id,kind limit 64',
              [m.worldId, country, facility],
            )
          ).rows;
          for (const o of orders)
            boundedOriginal(o, 'original_text', 'original_sha256');
          return {
            runs,
            orders: orders.map(({ original_text, ...o }) => {
              void original_text;
              return o;
            }),
            meaning:
              'ORDERS_ARE_CONTROLLED_INPUTS_NOT_PERFORMED_WORK_OR_PAID_RECEIPTS',
          };
        },
      ),
    );
    checks.push(
      await probe(admin, 'C10_SEALED_E03_SCOPE_NOT_SERVICE_WORK', async () => {
        const rows = (
          await admin.query(
            'select scope_document,scope_sha256,seed_fingerprint,admission_ref from world_v2.postwar_social_prefix_scope where world_id=$1 and country_id=$2',
            [m.worldId, country],
          )
        ).rows;
        if (!rows.length) return null;
        const row = one(rows),
          scope = boundedOriginal(row, 'scope_document', 'scope_sha256');
        assert.equal(row.seed_fingerprint, m.seedFingerprint);
        assert.equal(row.admission_ref, m.admissionRef);
        assert.equal(scope.countryId, country);
        return {
          rawSha256: row.scope_sha256,
          classification:
            'IMMUTABLE_E03_COUNTRY_SCOPE_NOT_ATTENDANCE_WORK_OR_PAYMENT',
          positions: scope.positions,
        };
      }),
    );
    checks.push(
      await probe(
        admin,
        'C10_EXISTING_DERIVED_READBACK_BASE_DOCUMENTS',
        async () => {
          const rows = (
            await admin.query(
              'select office_id,dataset,document_ref,canonical_seed_sha256,admission_ref from world_v2.postwar_office_projection_document where world_id=$1 and country_id=$2 order by office_id,dataset',
              [m.worldId, country],
            )
          ).rows;
          const needed = [
            ['FINANCE', 'currency-fx'],
            ['FINANCE', 'opening-financial-legs'],
            ['CENTRAL_BANK', 'currency-fx'],
            ['CENTRAL_BANK', 'cb-categories'],
            ['CENTRAL_BANK', 'cb-holdings'],
            ['CENTRAL_BANK', 'bank-loans'],
            ['CENTRAL_BANK', 'opening-financial-legs'],
            ['SOCIAL', 'positions'],
            ['SOCIAL', 'service-pools'],
            ['INDUSTRY', 'regional-source-capacity'],
            ['INDUSTRY', 'opening-inventory-entries-complete-v2'],
            ['TRADE', 'opening-inventory-entries-complete-v2'],
          ];
          const missing = needed.filter(
            ([office, dataset]) =>
              !rows.some(
                (r) => r.office_id === office && r.dataset === dataset,
              ),
          );
          return {
            status: missing.length ? 'MISSING' : 'PRESENT',
            rows,
            missingRequiredReadbackBases: missing,
            classification:
              'DERIVED_BASE_DOCUMENTS_NOT_CURRENT_LEDGER_OR_NEW_ECONOMIC_AUTHORITY',
          };
        },
      ),
    );
    checks.push(
      await probe(
        admin,
        'SAME_WORKER_FINITE_CONTROL_CLOCK_AND_LEASE',
        async () => {
          const r = one(
            (
              await admin.query(
                'select registration_text,registration_sha256,clock_original_text,control_original_text,valid_from::text,valid_until::text from world_v2.world_command_execution_registration x where x.world_id=$1 and x.registration_ref=$2 and x.worker_id=$3 and not exists(select 1 from world_v2.world_command_execution_revocation v where v.registration_ref=x.registration_ref)',
                [m.worldId, d.registrationRef, d.workerId],
              )
            ).rows,
          );
          const b = boundedOriginal(
            r,
            'registration_text',
            'registration_sha256',
          );
          assert.equal(b.seedFingerprint, m.seedFingerprint);
          assert.equal(b.consumerRole, d.workerRole);
          assert.equal(b.clockSourceSha256, sha(String(r.clock_original_text)));
          assert.equal(
            b.controlSourceSha256,
            sha(String(r.control_original_text)),
          );
          const lease = (
            await admin.query(
              'select holder_id,fencing_token::text,lease_expires_at_real::text,lease_expires_at_real>clock_timestamp()as live from world_v2.world_writer_lease where world_id=$1',
              [m.worldId],
            )
          ).rows;
          assert.equal(one(lease).holder_id, d.workerId);
          assert.equal(
            one(lease).live,
            true,
            'C10_CURRENT_WORKER_LEASE_EXPIRED',
          );
          assert(
            Date.parse(String(b.validUntilReal)) > Date.now(),
            'C10_FINITE_CONTROL_EXPIRED',
          );
          return { registration: b, lease };
        },
      ),
    );
    checks.push(
      await probe(
        admin,
        'C10_EXISTING_AUTH_SEAT_ENTITLEMENT_METADATA',
        async () =>
          input.authSubject
            ? (
                await admin.query(
                  "select a.auth_subject::text,a.authorization_version,s.seat_ref,e.scope_key from world_v2.current_commit_authorization a join world_v2.runtime_read_seat s on s.world_id=a.world_id and s.auth_subject=a.auth_subject and s.country_id=a.country_id and s.office_id=a.office_id and s.team_id=a.team_id and s.authorization_revision=a.authorization_version join world_v2.projection_entitlement e on e.world_id=s.world_id and e.auth_subject=s.auth_subject and e.authorization_version=s.authorization_revision and e.active and e.revoked_at is null and e.classification='OFFICE_PRIVATE' where a.world_id=$1 and a.country_id=$2 and a.office_id='INDUSTRY'and a.capability='INDUSTRY_PRODUCTION'and a.active and a.auth_subject=$3::uuid",
                  [m.worldId, country, input.authSubject],
                )
              ).rows
            : null,
      ),
    );
    checks.push(
      await probe(
        admin,
        'GLOBAL_FIFO_PENDING_HEAD_NO_COUNTRY_SKIP',
        async () => ({
          pending: (
            await admin.query(
              "select c.command_id,c.command_type,c.country_id,q.queue_state,q.authority_kind from world_v2.command_queue q join world_v2.command_submission c using(world_id,command_id)where q.world_id=$1 and q.queue_state<>'FINALIZED'order by c.submitted_at_real,c.command_id limit 1",
              [m.worldId],
            )
          ).rows,
        }),
      ),
    );
    checks.push(
      await probe(
        admin,
        'REQUIRED_LOGISTICS_SCOPE_SCHEMA_ACTUAL_BODIES',
        async () => {
          const rows = (
            await admin.query(
              "select x.signature,p.oid::text,pg_get_userbyid(p.proowner)owner,p.prosecdef,p.proconfig,p.proacl::text,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')body_sha256 from unnest($1::text[])x(signature)left join pg_proc p on p.oid=to_regprocedure(x.signature)",
              [
                [
                  'world_v2.postwar_industry_logistics_order_scope(text,text,text)',
                  'world_v2.read_postwar_industry_logistics_committed_orders(text,text,text,text,text,text,text,text,bigint,bigint,text,text)',
                  'world_v2.publish_postwar_industry_logistics_order(text,text,text,text)',
                  'world_v2.lock_postwar_industry_run_scope(text,text,uuid,text,bigint,timestamptz)',
                ],
              ],
            )
          ).rows;
          const required = new Map([
            [
              'world_v2.postwar_industry_logistics_order_scope(text,text,text)',
              'c2d4fd3d334377b6dd506b7051172341ddae0ffbb0a0932fbf9ce7ee28e1390f',
            ],
            [
              'world_v2.read_postwar_industry_logistics_committed_orders(text,text,text,text,text,text,text,text,bigint,bigint,text,text)',
              'f8544cf50a9f5f7ec52251faf4ce8362b1f4b892ed572dd26fd236fe8d15e5ec',
            ],
          ]);
          for (const row of rows) {
            assert(row.oid, 'C10_REQUIRED_LOGISTICS_RPC_NOT_INSTALLED');
            assert.equal(row.owner, 'world_v2_industry_source_owner');
            assert.equal(row.prosecdef, true);
            assert.deepEqual(row.proconfig, ['search_path=pg_catalog']);
            const target = required.get(row.signature);
            if (target)
              assert.equal(
                row.body_sha256,
                target,
                'C10_MULTICOUNTRY_SCOPE_FORWARD_REQUIRED',
              );
          }
          return rows;
        },
      ),
    );
    await admin.query('rollback');
  } finally {
    try {
      await admin.query('rollback');
    } finally {
      admin.release();
    }
  }
  const open = (role: string) =>
    new Pool({
      host: m.socket,
      port: m.port,
      database: input.clone.database,
      user: role,
      max: 1,
      ssl: false,
      password: async () => '',
      connectionTimeoutMillis: 10000,
      application_name: 'ECONMIND_C10_READONLY_PREFLIGHT',
    });
  const worker = open(d.workerRole),
    reader = open(d.readRole),
    idleErrors: string[] = [];
  for (const pool of [worker, reader])
    pool.on('error', (e) => idleErrors.push(e.message));
  try {
    const w = await worker.connect();
    try {
      await w.query('begin isolation level repeatable read');
      await w.query('set local role world_v2_industry_source_reader');
      await w.query(
        'select world_v2.lock_postwar_source_revocation_fences($1)',
        [m.worldId],
      );
      checks.push(
        await probe(w, 'LOW_WORKER_FIXED_ROLE_AND_SOURCE_FENCE', async () => {
          const r = one(
            (
              await w.query(
                "select session_user::text role,not(rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolreplication)safe,pg_has_role(current_user,'world_v2_industry_source_reader','MEMBER')industry_reader from pg_roles where rolname=session_user",
              )
            ).rows,
          );
          assert.equal(r.role, d.workerRole);
          assert.equal(r.safe, true);
          assert.equal(r.industry_reader, true);
          return r;
        }),
      );
      const args = [
        m.worldId,
        country,
        facility,
        head.world_version,
        head.event_sequence,
      ];
      checks.push(
        await probe(w, 'LOW_READER_ACTUAL_PRODUCTION_ORIGINAL', async () => {
          const r = one(
            (await w.query(POSTWAR_INDUSTRY_SOURCE_LOCK, args)).rows,
          );
          const original = inspectRegisteredC10ProductionOriginal(r);
          assert.equal(original.scope.countryId, country);
          assert.equal(original.scope.facilityId, facility);
          return {
            rawSha256: r.document_sha256,
            scope: original.scope,
            missing: original.missing.map((m) => m.code),
          };
        }),
      );
      checks.push(
        await probe(
          w,
          'LOW_READER_ACTUAL_FIRSTDAY_REFINERY_AND_DOMESTIC_SOURCE',
          async () => {
            const rows = (await w.query(INDUSTRY_FIRST_DAY_READ_QUERY, args))
              .rows;
            if (!rows.length) return null;
            const r = one(rows),
              b = boundedOriginal(r, 'source_text', 'source_sha256');
            assert.equal(b.countryId, country);
            return {
              rawSha256: r.source_sha256,
              sourceRef: r.source_ref,
              operatorId: b.operatorId,
              domesticAccess: b.domesticAccess,
              classification: 'REGISTERED_FACTS_NOT_DELIVERY',
            };
          },
        ),
      );
      checks.push(
        await probe(w, 'LOW_READER_ACTUAL_UTILITY_COMPACT', async () => {
          const rows = (await w.query(INDUSTRY_UTILITY_READ_QUERY, args)).rows;
          if (!rows.length) return null;
          const r = one(rows),
            b = boundedOriginal(r, 'source_text', 'source_sha256');
          assert.equal(b.countryId, country);
          return {
            sourceRef: r.source_ref,
            sourceSha256: r.source_sha256,
            power: b.power,
            water: b.water,
          };
        }),
      );
      if (input.authSubject) {
        await w.query("select set_config('request.jwt.claim.sub',$1,true)", [
          input.authSubject,
        ]);
        checks.push(
          await probe(
            w,
            'LOW_READER_ACTUAL_INDUSTRY_AUTHORIZATION',
            async () => {
              const r = (
                await w.query(INDUSTRY_CURRENT_AUTHORIZATION_LOCK_QUERY, [
                  m.worldId,
                  input.authSubject,
                  country,
                  'INDUSTRY',
                  'INDUSTRY_PRODUCTION',
                ])
              ).rows;
              return r.length ? one(r) : null;
            },
          ),
        );
        checks.push(
          await probe(w, 'LOW_READER_ACTUAL_RUN_SEAT_LEASE_CUTOFF', async () =>
            one(
              (
                await w.query(INDUSTRY_RUN_SCOPE_QUERY, [
                  m.worldId,
                  country,
                  input.authSubject,
                  d.workerId,
                  head.world_version,
                  new Date().toISOString(),
                ])
              ).rows,
            ),
          ),
        );
      } else
        checks.push({
          name: 'LOW_READER_ACTUAL_RUN_SEAT_LEASE_CUTOFF',
          status: 'DEFERRED',
          data: 'NO_EXISTING_C10_SUBJECT_SUPPLIED_NOT_CREATED',
        });
      for (const runId of actualRunIds)
        checks.push(
          await probe(
            w,
            'LOW_READER_ACTUAL_CONTROLLED_ORDER_REFS_FOR_' + runId,
            async () => {
              const rows = (
                await w.query(
                  'select * from world_v2.read_postwar_industry_logistics_orders($1,$2,$3,$4,$5::bigint,$6::bigint,$7,$8)',
                  [
                    m.worldId,
                    country,
                    facility,
                    runId,
                    head.world_version,
                    head.event_sequence,
                    m.seedFingerprint,
                    m.admissionRef,
                  ],
                )
              ).rows;
              for (const row of rows) {
                const body = boundedOriginal(
                  row,
                  'original_text',
                  'original_sha256',
                );
                assert.equal(row.seed_fingerprint, m.seedFingerprint);
                assert.equal(row.admission_ref, m.admissionRef);
                assert.equal(row.world_version, head.world_version);
                assert.equal(row.event_sequence, head.event_sequence);
                assert.equal(body.countryId, country);
                assert.equal(body.facilityId, facility);
                assert.equal(body.runId, runId);
              }
              return rows.length
                ? rows.map(({ original_text, ...row }) => {
                    void original_text;
                    return row;
                  })
                : null;
            },
          ),
        );
      if (!actualRunIds.size)
        checks.push({
          name: 'LOW_READER_ACTUAL_CONTROLLED_ORDER_REFS',
          status: 'DEFERRED',
          data: 'NO_ACTUAL_C10_COMMITTED_RUN_NO_ORDER_OR_WORK_CREATED',
        });
      checks.push(
        await probe(
          w,
          'LOW_READER_COMPLETE_PREFIX_TRANSPORT_NOT_CORE_AUTHORITY',
          async () => {
            await w.query('set local role world_v2_social_source_reader');
            const pages = createPostwarBoundedPrefixPageReaderFrom(
              queryAdapter(w),
              {
                worldId: m.worldId,
                countryId: country,
                officeId: 'SOCIAL',
                seedFingerprint: m.seedFingerprint,
                admissionRef: m.admissionRef,
              },
            );
            const summaries = [];
            for (let i = 0; i < 8; i++) {
              const p = await pages.readNext();
              if (p === null)
                return {
                  complete: true,
                  pages: summaries,
                  meaning:
                    'DATA_TRANSPORT_ONLY_CURRENT_FINANCIAL_STOCK_FREE_FUNDS_REQUIRE_PRIVATE_CORE_FOLD',
                };
              summaries.push({
                from: p.fromHead,
                through: p.throughHead,
                framesSha256: p.framesSha256,
                commands: p.frames.map((f) => ({
                  id: f.command.commandId,
                  country: f.command.countryId,
                  type: f.command.commandType,
                  financialBatches: f.financialPostingBatches.length,
                  inventoryPostings: f.inventoryPostings.length,
                })),
              });
            }
            return {
              complete: false,
              code: 'PREFLIGHT_BOUNDED_8PAGES_NOT_FULL_REPLAY',
              pages: summaries,
            };
          },
        ),
      );
    } finally {
      try {
        await w.query('rollback');
      } finally {
        w.release();
      }
    }
    const r = await reader.connect();
    try {
      await r.query('begin isolation level repeatable read read only');
      if (input.authSubject) {
        await r.query("select set_config('request.jwt.claim.sub',$1,true)", [
          input.authSubject,
        ]);
        checks.push(
          await probe(
            r,
            'ACTUAL_HTTP_ACTOR_REGISTRY_BINDING_SEPARATE_FROM_SEAT',
            async () => {
              const rows = (
                await r.query(WORLD_ACTOR_BINDING_READ_QUERY, [
                  m.worldId,
                  input.authSubject,
                ])
              ).rows;
              return rows.length ? one(rows) : null;
            },
          ),
        );
        await r.query('set local role world_v2_postwar_projection_reader');
        const port = createPostwarPhysicalInventoryProvenanceReader({
          runtimeReaderRole: 'world_v2_postwar_projection_reader',
          authorizationPublisherRole: 'world_v2_postwar_projection_publisher',
          expectedSeedFingerprint: m.seedFingerprint,
        });
        checks.push(
          await probe(
            r,
            'LOW_READ_C10_COMPLETE_OPENING_STOCK_PROVENANCE_NOT_CURRENT_LEDGER',
            () =>
              port.readPageFrom(queryAdapter(r), {
                worldId: m.worldId,
                officeId: 'INDUSTRY',
                dataset: 'opening-inventory-entries',
                limit: 64,
              }),
          ),
        );
        const labour = createPostwarIndustryLabourCurrentProjectionStore({
          runtimeReaderRole: 'world_v2_postwar_projection_reader',
          authorizationPublisherRole: 'world_v2_postwar_projection_publisher',
        });
        checks.push(
          await probe(
            r,
            'LOW_READ_C10_CURRENT_EMPLOYMENT_HEADCOUNT_NOT_WORK_OR_PAYMENT',
            () =>
              labour.readPageFrom(queryAdapter(r), {
                worldId: m.worldId,
                offset: 0,
                limit: 64,
              }),
          ),
        );
      } else
        checks.push({
          name: 'ACTUAL_HTTP_ACTOR_REGISTRY_BINDING_SEPARATE_FROM_SEAT',
          status: 'DEFERRED',
        });
    } finally {
      try {
        await r.query('rollback');
      } finally {
        r.release();
      }
    }
  } finally {
    await Promise.all([worker.end(), reader.end()]);
  }
  const final = await input.clone.installer.connect();
  const after: Record<string, unknown> = {};
  try {
    await final.query('begin isolation level repeatable read read only');
    for (const table of tables)
      after[table] = (
        await final.query(
          `select count(*)::text count,encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,E'\\n'order by to_jsonb(t)::text collate "C"),''),'UTF8')),'hex')sha256 from world_v2.${table} t`,
        )
      ).rows;
    await final.query('rollback');
  } finally {
    try {
      await final.query('rollback');
    } finally {
      final.release();
    }
  }
  assert.deepEqual(after, before, 'C10_PREFLIGHT_ECONOMIC_ROWS_CHANGED');
  return Object.freeze({
    classification:
      'READ_CONTRACT_PREFLIGHT_NOT_AUTHORITY_OR_ECONOMIC_READINESS',
    worldId: m.worldId,
    countryId: country,
    facilityId: facility,
    head,
    checks,
    before,
    after,
    idleErrors,
    manualStages: C10_LOGISTICS_MANUAL_CHAIN,
    sourceAndPaidBoundary:
      'NO_WORK_ORDER_ALLOCATIONS_PAYMENT_AMOUNT_OR_SOURCE_CREATED',
    mandatoryColdPhase:
      'SAME_GENUINE_CHILD_SOCIAL_FULL_PREFIX_CORE_REPLAY_AND_CURRENT_OP_FREE_FUNDS_STILL_REQUIRED',
    automaticStages: 'NOT_ASSUMED_AUTHORIZED_BY_THIS_PREFLIGHT',
  });
}
