/** Native custody consumer for independently admitted Captain originals. This
 * installs no issuer, source admission, opening balances, roles or consumer.
 * Original rows must come from the separately trusted source publisher. */
import { createHash } from 'node:crypto';
import {
  canonicalSerialize,
  parseCaptainPoliticalCapitalAllocation,
  parseWorldWriterLease,
  validateCanonicalCommand,
} from '@econmind/core';
import type {
  CaptainOperatingOriginal,
  CaptainOperatingSourceCustodyPort,
} from './captain-operating-source-custody.js';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';
import { createCaptainRuntimeSnapshotReader } from './captain-runtime-snapshot-reader.js';

export const CAPTAIN_OPERATING_CUSTODY_PROPOSAL =
  'database/proposals/captain-operating-custody.sql';
export const CAPTAIN_OPERATING_CUSTODY_READER =
  'world_v2_captain_source_reader';
export const CAPTAIN_OPERATING_CUSTODY_SESSION_QUERY = `select current_user as role_name,r.rolsuper,r.rolbypassrls,r.rolcreaterole,r.rolcreatedb,r.rolreplication,
 current_setting('transaction_isolation')as isolation,current_setting('transaction_read_only')as read_only,
 pg_has_role(current_user,'world_v2_captain_source_owner','MEMBER')as owner_member
 from pg_roles r where r.rolname=current_user`;
export const CAPTAIN_OPERATING_CUSTODY_LOCK_QUERY =
  'select * from world_v2.lock_captain_operating_originals($1,$2,$3,$4,$5,$6)';
type Row = Record<string, unknown>;
const sha = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
function invalid(reason: string): never {
  throw Error(`CAPTAIN_NATIVE_CUSTODY: ${reason}`);
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value || value.trim() !== value)
    invalid('stored original metadata required');
  return value;
}
function inert<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(inert);
    Object.freeze(value);
  }
  return value;
}
async function session(tx: SqlExecutor) {
  const result = await tx.query<Row>(CAPTAIN_OPERATING_CUSTODY_SESSION_QUERY);
  const r = result.rows[0];
  if (
    result.rows.length !== 1 ||
    !r ||
    r.role_name !== CAPTAIN_OPERATING_CUSTODY_READER ||
    r.rolsuper !== false ||
    r.rolbypassrls !== false ||
    r.rolcreaterole !== false ||
    r.rolcreatedb !== false ||
    r.rolreplication !== false ||
    r.owner_member !== false ||
    r.read_only !== 'off' ||
    !['repeatable read', 'serializable'].includes(String(r.isolation))
  )
    invalid('separated native reader and stable outer transaction required');
}
function original(
  raw: unknown,
  row: Row,
  mode: string,
): CaptainOperatingOriginal {
  const bytes = text(raw);
  const value = JSON.parse(bytes) as CaptainOperatingOriginal;
  if (canonicalSerialize(value) !== bytes)
    invalid('stored original must retain canonical exact bytes');
  if (
    value.issuerRef !== row.issuer_ref ||
    value.custodianRef !== row.custodian_ref ||
    value.admissionRef !== row.admission_ref ||
    value.admissionRevision !== row.admission_revision ||
    value.revokedByRevision !== null ||
    value.payloadSHA256 !== sha(value.canonicalPayload) ||
    !['ADMITTED_ORIGINAL', 'TEST_ONLY'].includes(value.sourceClass) ||
    (mode === 'OFFICIAL_RUNTIME' && value.sourceClass !== 'ADMITTED_ORIGINAL')
  )
    invalid('original differs from independently registered issuer/admission');
  // The existing Captain runtime reader performs the closed payload schema,
  // effective-time, exact seed binding, complete prefix replay and Core math.
  return inert(value);
}

/** Await the callback inside the SAME outer read/write transaction. SQL locks
 * the actual writer lease before source adoption/original resources; revocation
 * takes a conflicting adoption lock and cannot race through the callback.
 * No caller-provided original, capital balance or source-admitted flag exists.
 */
export function createPostgresCaptainOperatingCustody(configuration: {
  readonly workerId: string;
  readonly mode: 'OFFICIAL_RUNTIME' | 'TEST_ONLY_LOCAL';
}): Readonly<CaptainOperatingSourceCustodyPort> {
  if (
    !/^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u.test(configuration.workerId) ||
    !['OFFICIAL_RUNTIME', 'TEST_ONLY_LOCAL'].includes(configuration.mode)
  )
    invalid('fixed server worker and explicit mode required');
  const worker = configuration.workerId,
    mode = configuration.mode;
  const custody: CaptainOperatingSourceCustodyPort = {
    async withProtectedAdmittedOriginalsFrom(tx, supplied, consume) {
      if (supplied.purpose !== 'CAPTAIN_OPERATING_SOURCE_READ_V1')
        invalid('closed source purpose required');
      const command = validateCanonicalCommand(supplied.command, sha);
      const terms = parseCaptainPoliticalCapitalAllocation(command, sha);
      if (
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(
          supplied.observedAtReal,
        ) ||
        !Number.isFinite(Date.parse(supplied.observedAtReal)) ||
        new Date(supplied.observedAtReal).toISOString() !==
          supplied.observedAtReal
      )
        invalid('canonical observation time required');
      await session(tx);
      const r = await tx.query<Row>(CAPTAIN_OPERATING_CUSTODY_LOCK_QUERY, [
        command.worldId,
        command.countryId,
        terms.reasonFactRef,
        worker,
        supplied.observedAtReal,
        command.authSubject,
      ]);
      if (r.rows.length !== 1) invalid('unique native source result required');
      const row = r.rows[0]!;
      if (row.status === 'MISSING') {
        const allowed = [
          'POLITICAL_CAPITAL_EVENT_LINEAGE',
          'REASON_RECORD',
          'WRITER_LEASE',
        ];
        if (
          !Array.isArray(row.missing) ||
          !row.missing.length ||
          row.missing.some((v) => !allowed.includes(String(v)))
        )
          invalid('exact missing original resources required');
        return consume(
          inert({
            kind: 'MISSING' as const,
            missing: row.missing as (
              | 'POLITICAL_CAPITAL_EVENT_LINEAGE'
              | 'REASON_RECORD'
              | 'WRITER_LEASE'
            )[],
          }),
        );
      }
      if (
        row.status !== 'ORIGINALS' ||
        row.world_id !== command.worldId ||
        row.country_id !== command.countryId
      )
        invalid('native source scope differs');
      const genesis = original(row.genesis_text, row, mode);
      const reason = original(row.reason_text, row, mode);
      if (reason.factRef !== terms.reasonFactRef)
        invalid('reason identity differs');
      const lease = parseWorldWriterLease({
        schemaVersion: 'world-writer-lease-v1',
        worldId: command.worldId,
        holderId: worker,
        fencingToken: text(row.fencing_token),
        acquiredAtReal: text(row.acquired_at_real),
        renewedAtReal: text(row.renewed_at_real),
        expiresAtReal: text(row.lease_expires_at_real),
      });
      const result = await consume(
        inert({ kind: 'ORIGINALS' as const, genesis, reason, lease }),
      );
      // Same-executor exact re-read also detects same-transaction source changes;
      // native SHARE locks remain held through the outer COMMIT/ROLLBACK.
      const after = await tx.query<Row>(CAPTAIN_OPERATING_CUSTODY_LOCK_QUERY, [
        command.worldId,
        command.countryId,
        terms.reasonFactRef,
        worker,
        supplied.observedAtReal,
        command.authSubject,
      ]);
      if (canonicalSerialize(after.rows) !== canonicalSerialize(r.rows))
        invalid('source admission/originals changed within protected consumer');
      await session(tx);
      return result;
    },
  };
  return Object.freeze(custody);
}

/** Explicit server composition only; no listener, queue claim or World start. */
export function createPostgresCaptainRuntimeSnapshotReader(configuration: {
  readonly database: SqlDatabase;
  readonly workerId: string;
  readonly mode: 'OFFICIAL_RUNTIME' | 'TEST_ONLY_LOCAL';
}) {
  return createCaptainRuntimeSnapshotReader({
    ...configuration,
    custody: createPostgresCaptainOperatingCustody(configuration),
  });
}
