/** Explicit private publication service; not installed in startup/HTTP/Clock.
 * The default SQL entry is absent; a separately reviewed proposal may install
 * exact-permit functions without opening direct INSERT. Source inspection,
 * owner authorization and SQL ADMITTED readback are three different facts.
 */
import { createHash } from 'node:crypto';
import { canonicalSerialize, worldId, type OpeningSeed } from '@econmind/core';
import { inspectOfficialWorldOpeningAdmission } from '../preparation/official-world-opening-admission.js';
import {
  reconcileOfficialOpeningDecision,
  officialOpeningTrustedDecisionSource,
} from '../preparation/official-opening-decision-reconciliation.js';
import {
  OfficialOpeningBundleLoader,
  isLoadedOfficialOpeningBundle,
  isOfficialOpeningBundleV2,
  officialOpeningPublicationSourceSha256,
  type LoadedOfficialOpeningBundle,
  type OfficialOpeningPublicationSourceBundle,
} from '../preparation/official-opening-bundle-loader.js';
import { prepareOfficialOpeningBundleCandidate } from '../preparation/official-opening-candidate-composition.js';
export { officialOpeningPublicationSourceSha256 } from '../preparation/official-opening-bundle-loader.js';
export type { OfficialOpeningPublicationSourceBundle } from '../preparation/official-opening-bundle-loader.js';
import { prepareOpeningCanonicalSeed } from '../preparation/opening-canonical-seed-bridge.js';
import { WorldOpeningSeedStore } from '../persistence/opening-seed-store.js';
import { DurableV08LedgerLineageReader } from '../persistence/durable-v08-ledger-lineage-reader.js';
import type { SqlDatabase, SqlExecutor } from '../persistence/sql-database.js';
import { PostgresTransactionError } from '../persistence/postgres-sql-database.js';
import type { ImmutableOpeningAdmissionReference } from '../persistence/runtime-read-binding-store.js';
import {
  PrivateOpeningAdmissionAuthority,
  isPrivateOpeningAdmissionAuthority,
  resolvePrivateOpeningPublicationAuthorization,
  OpeningPublicationAuthorityError,
  openingPublicationTimestamp,
  type OpeningPublicationAuthorization,
} from './private-opening-admission-authority.js';

const sha = (bytes: string) =>
  createHash('sha256').update(bytes, 'utf8').digest('hex');
export class OpeningAdmissionPublicationError extends Error {
  constructor(
    readonly code:
      | 'OPENING_PUBLICATION_REQUEST_INVALID'
      | 'OPENING_SOURCE_UNAVAILABLE'
      | 'OPENING_SOURCE_IDENTITY_MISMATCH'
      | 'OPENING_SOURCE_BLOCKED'
      | 'OPENING_SOURCE_INVALID'
      | 'OPENING_BINDING_MISMATCH'
      | 'OPENING_PUBLISHER_ROLE_DENIED'
      | 'OPENING_WORLD_ALREADY_ADVANCED'
      | 'OPENING_ADMISSION_CONFLICT'
      | 'ADMISSION_PUBLICATION_ENTRYPOINT_MISSING'
      | 'OPENING_PUBLICATION_COMMIT_UNCONFIRMED',
    readonly blockerCodes: readonly string[] = [],
  ) {
    super(code);
    this.name = 'OpeningAdmissionPublicationError';
  }
}

function fail(
  code: OpeningAdmissionPublicationError['code'],
  blockers: readonly string[] = [],
): never {
  throw new OpeningAdmissionPublicationError(
    code,
    Object.freeze([...new Set(blockers)].sort()),
  );
}

/** Transaction uncertainty takes precedence over any nested semantic failure.
 * A source transaction's failed cleanup remains uncertain even when the outer
 * publisher transaction subsequently confirms its own rollback. */
export function rethrowOpeningPublicationFailure(error: unknown): never {
  const seen = new Set<Error>();
  const causes: Error[] = [];
  let cause: unknown = error;
  while (cause instanceof Error) {
    if (seen.has(cause)) fail('OPENING_PUBLICATION_COMMIT_UNCONFIRMED');
    seen.add(cause);
    causes.push(cause);
    if (
      cause instanceof PostgresTransactionError &&
      (cause.outcome === 'ROLLBACK_UNCONFIRMED' ||
        cause.outcome === 'COMMIT_OUTCOME_UNKNOWN')
    )
      fail('OPENING_PUBLICATION_COMMIT_UNCONFIRMED');
    cause = cause.cause;
  }
  for (const nested of causes) {
    if (nested instanceof OpeningAdmissionPublicationError) throw nested;
    if (nested instanceof OpeningPublicationAuthorityError) throw nested;
    if (
      nested.message.includes('ADMISSION_PUBLICATION_ENTRYPOINT_MISSING') ||
      ('code' in nested && nested.code === '42883')
    )
      fail('ADMISSION_PUBLICATION_ENTRYPOINT_MISSING');
  }
  return fail('OPENING_PUBLICATION_COMMIT_UNCONFIRMED');
}

function selectedSeed(
  bundle: OfficialOpeningPublicationSourceBundle,
  loaded?: LoadedOfficialOpeningBundle,
): OpeningSeed {
  try {
    if (isOfficialOpeningBundleV2(bundle)) {
      if (
        !loaded ||
        !isLoadedOfficialOpeningBundle(loaded) ||
        loaded.bundle !== bundle
      )
        fail('OPENING_SOURCE_INVALID');
      const prepared = prepareOfficialOpeningBundleCandidate(loaded);
      if (
        !prepared.seed ||
        prepared.status !== 'VALIDATED_CANDIDATE_NOT_ADMITTED' ||
        prepared.blockers.length
      )
        fail(
          'OPENING_SOURCE_BLOCKED',
          prepared.blockers.map((b) => b.code),
        );
      return prepared.seed;
    }
    const source = inspectOfficialWorldOpeningAdmission({
      selectionBytes: bundle.selectionBytes,
      checksumsBytes: bundle.source.checksumsBytes,
      mapManifestBytes: bundle.mapManifestBytes,
      regionsBytes: bundle.regionsBytes,
      mapping: JSON.parse(bundle.source.mappingBytes) as unknown,
      gaps: JSON.parse(bundle.gapsBytes) as unknown,
      coverage: JSON.parse(bundle.source.coverageBytes) as unknown,
      sha256Hex: sha,
    });
    // No request READY label, bootstrap status or technical approval can pass
    // this reinspection. Deferred runtime records are not silently executed.
    if (
      source.status !== 'SOURCE_READY_NOT_APPROVAL' ||
      source.blockerCodes.length ||
      source.deferredCodes.length
    )
      fail('OPENING_SOURCE_BLOCKED', [
        ...source.blockerCodes,
        ...source.deferredCodes,
      ]);
    const ownerRecords = bundle.ownerRecords.map((row) => ({
      reference: row.reference,
      record: JSON.parse(row.recordBytes) as unknown,
    }));
    const reconciled = reconcileOfficialOpeningDecision(
      {
        sourceBytes: bundle.source,
        decision: JSON.parse(bundle.decisionBytes) as unknown,
      },
      ownerRecords,
    );
    if (
      reconciled.status !== 'DECISION_RECONCILED_NOT_SEED' ||
      !reconciled.source
    )
      fail(
        'OPENING_SOURCE_BLOCKED',
        reconciled.blockers.map((b) => b.code),
      );
    const prepared = prepareOpeningCanonicalSeed({
      decision: JSON.parse(bundle.decisionBytes) as unknown,
      trusted: {
        source: officialOpeningTrustedDecisionSource(reconciled.source),
        ownerRecords,
      },
      frozenMappingBytes: bundle.source.mappingBytes,
      assembly: JSON.parse(bundle.assemblyBytes) as unknown,
    });
    if (
      prepared.status !== 'NOT_ADMITTED' ||
      !prepared.seed ||
      prepared.blockers.length
    )
      fail(
        'OPENING_SOURCE_BLOCKED',
        prepared.blockers.map((b) => b.code),
      );
    return prepared.seed;
  } catch (error) {
    if (error instanceof OpeningAdmissionPublicationError) throw error;
    return fail('OPENING_SOURCE_INVALID');
  }
}

function matchesAuthorization(
  seed: OpeningSeed,
  claims: OpeningPublicationAuthorization,
): void {
  if (
    seed.worldId !== claims.worldId ||
    seed.seedId !== claims.seedId ||
    seed.fingerprint !== claims.seedFingerprint ||
    seed.replayBinding.modelVersion !== claims.modelVersion ||
    canonicalSerialize(seed.replayBinding) !== claims.replayBinding
  )
    fail('OPENING_BINDING_MISMATCH');
}

type Row = Record<string, unknown>;
const databaseIdentityQuery = `select current_database() as database_name,
  (select oid::text from pg_database where datname=current_database()) as database_oid,
  extract(epoch from pg_postmaster_start_time())::text as postmaster_started_at,
  inet_server_addr()::text as server_address,inet_server_port()::text as server_port,
  pg_is_in_recovery() as in_recovery`;

/** Server-owned database/source/authority/clock inputs only. Invocation carries
 * just World identity and a reference looked up by the private authority. This
 * class never bootstraps a seed, mints an Owner record or changes any ledger. */
export class OfficialOpeningAdmissionPublicationService {
  readonly #database: SqlDatabase;
  readonly #authority: PrivateOpeningAdmissionAuthority;
  readonly #sources: Readonly<{
    load(
      sha256: string,
    ): Promise<
      | OfficialOpeningPublicationSourceBundle
      | OfficialOpeningBundleLoader
      | null
    >;
  }>;
  readonly #nowReal: () => string;
  readonly #role: string;
  readonly #sourceProtocol: 'LEGACY_AND_V2' | 'PINNED_V2_ONLY';
  readonly #sourceDatabase: SqlDatabase | null;
  readonly #sourceReaderRole: string | null;
  readonly #opening: WorldOpeningSeedStore;
  readonly #lineage: DurableV08LedgerLineageReader;

  constructor(input: {
    readonly database: SqlDatabase;
    readonly authority: PrivateOpeningAdmissionAuthority;
    readonly sources: Readonly<{
      load(
        sha256: string,
      ): Promise<
        | OfficialOpeningPublicationSourceBundle
        | OfficialOpeningBundleLoader
        | null
      >;
    }>;
    readonly nowReal: () => string;
    readonly publisherRole: string;
    readonly sourceProtocol?: 'PINNED_V2_ONLY';
    readonly source?: Readonly<{ database: SqlDatabase; readerRole: string }>;
  }) {
    if (
      !isPrivateOpeningAdmissionAuthority(input.authority) ||
      !/^world_v2_opening_admission_[a-z0-9_]+$/u.test(input.publisherRole) ||
      input.publisherRole.length > 63
    )
      fail('OPENING_PUBLISHER_ROLE_DENIED');
    this.#database = input.database;
    this.#authority = input.authority;
    this.#sources = input.sources;
    this.#nowReal = input.nowReal;
    this.#role = input.publisherRole;
    this.#sourceProtocol = input.sourceProtocol ?? 'LEGACY_AND_V2';
    this.#sourceDatabase = input.source?.database ?? null;
    this.#sourceReaderRole = input.source?.readerRole ?? null;
    if (
      input.source &&
      (input.source.database === input.database ||
        input.source.readerRole === input.publisherRole ||
        !/^[a-z][a-z0-9_]{0,62}$/u.test(input.source.readerRole) ||
        input.source.readerRole.startsWith('pg_'))
    )
      fail('OPENING_PUBLISHER_ROLE_DENIED');
    this.#opening = new WorldOpeningSeedStore({
      database: input.database,
      sha256Hex: sha,
    });
    this.#lineage = new DurableV08LedgerLineageReader({
      database: input.database,
      sha256Hex: sha,
    });
  }

  async publish(
    input: Readonly<{ worldId: string; authorizationReference: string }>,
  ): Promise<
    Readonly<{
      disposition: 'ADMITTED' | 'ALREADY_ADMITTED';
      admission: ImmutableOpeningAdmissionReference;
      authorizationReference: string;
      authorizationSha256: string;
      sourceBundleSha256: string;
    }>
  > {
    if (
      !input ||
      Object.keys(input).length !== 2 ||
      !Object.hasOwn(input, 'worldId') ||
      !Object.hasOwn(input, 'authorizationReference') ||
      typeof input.authorizationReference !== 'string' ||
      typeof input.worldId !== 'string'
    )
      fail('OPENING_PUBLICATION_REQUEST_INVALID');
    const requestedWorld = worldId(input.worldId);
    const claims = await resolvePrivateOpeningPublicationAuthorization(
      this.#authority,
      input.authorizationReference,
      this.#nowReal(),
    );
    if (claims.worldId !== requestedWorld) fail('OPENING_BINDING_MISMATCH');
    const source = await this.#sources
      .load(claims.sourceBundleSha256)
      .catch(() => fail('OPENING_SOURCE_UNAVAILABLE'));
    if (!source) fail('OPENING_SOURCE_UNAVAILABLE');
    // The digest registry selects server-owned loader configuration, never a
    // cached preflight DTO/snapshot. Reload raw files for every V2 publication.
    const loaded =
      source instanceof OfficialOpeningBundleLoader
        ? await source.load().catch(() => fail('OPENING_SOURCE_UNAVAILABLE'))
        : undefined;
    const bundle = loaded
      ? loaded.bundle
      : (source as OfficialOpeningPublicationSourceBundle);
    if (!bundle) fail('OPENING_SOURCE_UNAVAILABLE');
    if (
      this.#sourceProtocol === 'PINNED_V2_ONLY' &&
      (!loaded || !isOfficialOpeningBundleV2(bundle))
    )
      fail('OPENING_SOURCE_INVALID');
    if (isOfficialOpeningBundleV2(bundle) && !loaded)
      fail('OPENING_SOURCE_INVALID');
    // Snapshot untrusted loader objects before awaiting the database/registry.
    const snapshot = isOfficialOpeningBundleV2(bundle)
      ? bundle
      : (JSON.parse(
          canonicalSerialize(bundle),
        ) as OfficialOpeningPublicationSourceBundle);
    if (
      officialOpeningPublicationSourceSha256(snapshot) !==
      claims.sourceBundleSha256
    )
      fail('OPENING_SOURCE_IDENTITY_MISMATCH');
    const seed = selectedSeed(snapshot, loaded);
    matchesAuthorization(seed, claims);
    const authorizationSha256 = sha(canonicalSerialize(claims));
    const admissionRef = `ADMISSION_${authorizationSha256.toUpperCase()}`;
    try {
      const result = await this.#database.transaction(async (tx) => {
        await this.#assertPublisher(tx);
        const head = await tx.query<Row>(
          'select world_version,event_sequence from world_v2.lock_runtime_admission_publication($1,$2,$3)',
          [
            claims.authorizationId,
            authorizationSha256,
            claims.sourceBundleSha256,
          ],
        );
        if (head.rows.length !== 1) fail('OPENING_BINDING_MISMATCH');
        // Publisher holds H until this outer transaction commits. The separate
        // source transaction must be on that same primary database, never a
        // replica or independently matching snapshot supplied by a request.
        const publisherIdentity = await tx.query<Row>(databaseIdentityQuery);
        const lineage = await this.#readSource(
          seed,
          claims,
          head.rows[0]!,
          publisherIdentity.rows,
        );
        // Refresh the registry/expiry after source+SQL readback, before commit.
        // A deleted/revoked record or altered signed authorization cannot reuse
        // the preflight proof. B owns coherent durable registry provisioning.
        const admittedAtReal = openingPublicationTimestamp(this.#nowReal());
        const current = await resolvePrivateOpeningPublicationAuthorization(
          this.#authority,
          input.authorizationReference,
          admittedAtReal,
        );
        if (canonicalSerialize(current) !== canonicalSerialize(claims))
          fail('OPENING_BINDING_MISMATCH');
        let admission = await this.#readAdmission(
          tx,
          claims,
          authorizationSha256,
        );
        let disposition: 'ADMITTED' | 'ALREADY_ADMITTED' = 'ALREADY_ADMITTED';
        if (!admission) {
          if (
            head.rows[0]!.world_version !== '0' ||
            head.rows[0]!.event_sequence !== '0' ||
            lineage.headWorldVersion !== '0' ||
            lineage.headEventSequence !== '0'
          )
            fail('OPENING_WORLD_ALREADY_ADVANCED');
          await tx.query(
            'select world_v2.publish_runtime_admission_publication($1,$2,$3)',
            [
              claims.authorizationId,
              authorizationSha256,
              claims.sourceBundleSha256,
            ],
          );
          admission = await this.#readAdmission(
            tx,
            claims,
            authorizationSha256,
          );
          disposition = 'ADMITTED';
        }
        if (
          !admission ||
          admission.admissionRef !== admissionRef ||
          admission.worldId !== requestedWorld ||
          admission.seedRef !== claims.seedId ||
          admission.contentHash !== claims.seedFingerprint ||
          admission.modelVersion !== claims.modelVersion ||
          admission.replayBinding !== claims.replayBinding
        )
          fail('OPENING_ADMISSION_CONFLICT');
        return Object.freeze({ disposition, admission });
      });
      // Only return ADMITTED after transaction completion, never after an
      // INSERT attempt or in-memory readiness. Ack-unknown errors remain errors.
      return Object.freeze({
        ...result,
        authorizationReference: claims.authorizationId,
        authorizationSha256,
        sourceBundleSha256: claims.sourceBundleSha256,
      });
    } catch (error) {
      return rethrowOpeningPublicationFailure(error);
    }
  }

  async #assertPublisher(tx: SqlExecutor): Promise<void> {
    const role = await tx.query<Row>(
      `select current_user as role_name, r.rolsuper, r.rolbypassrls, r.rolcreaterole, r.rolcreatedb, r.rolreplication,
        exists (select 1 from pg_roles p where p.rolname in
          ('anon','authenticated','service_role','postgres','supabase_admin','world_v2_api_reader','world_v2_api_login')
          and pg_has_role(current_user,p.oid,'MEMBER')) as forbidden_member
       from pg_roles r where r.rolname=current_user`,
    );
    const row = role.rows[0];
    if (
      role.rows.length !== 1 ||
      !row ||
      row.role_name !== this.#role ||
      row.rolsuper !== false ||
      row.rolbypassrls !== false ||
      row.rolcreaterole !== false ||
      row.rolcreatedb !== false ||
      row.rolreplication !== false ||
      row.forbidden_member !== false
    )
      fail('OPENING_PUBLISHER_ROLE_DENIED');
  }

  async #readAdmission(
    tx: SqlExecutor,
    claims: OpeningPublicationAuthorization,
    authorizationSha256: string,
  ): Promise<Readonly<ImmutableOpeningAdmissionReference> | null> {
    const result = await tx.query<Row>(
      'select admission_ref,world_id,seed_id,seed_fingerprint,model_version,replay_binding,admitted_at_real from world_v2.read_runtime_admission_publication($1,$2,$3)',
      [claims.authorizationId, authorizationSha256, claims.sourceBundleSha256],
    );
    if (!result.rows.length) return null;
    const row = result.rows[0]!;
    if (
      result.rows.length !== 1 ||
      [
        'admission_ref',
        'world_id',
        'seed_id',
        'seed_fingerprint',
        'model_version',
        'replay_binding',
      ].some((key) => typeof row[key] !== 'string')
    )
      fail('OPENING_ADMISSION_CONFLICT');
    return Object.freeze({
      admissionRef: row.admission_ref as string,
      worldId: row.world_id as string,
      seedRef: row.seed_id as string,
      contentHash: row.seed_fingerprint as string,
      modelVersion: row.model_version as string,
      replayBinding: row.replay_binding as string,
      admittedAtReal: openingPublicationTimestamp(row.admitted_at_real),
    });
  }

  async #readSource(
    candidate: OpeningSeed,
    claims: OpeningPublicationAuthorization,
    head: Row,
    publisherIdentity: readonly Row[],
  ) {
    const database = this.#sourceDatabase;
    const readerRole = this.#sourceReaderRole;
    if (!database || !readerRole) fail('OPENING_SOURCE_UNAVAILABLE');
    return database.transaction(async (source) => {
      await source.query(
        'set transaction isolation level repeatable read read only',
      );
      const roles =
        await source.query<Row>(`select current_user as role_name, session_user as session_role,
        current_setting('role') as role_override,
        current_setting('transaction_read_only') as read_only,r.rolsuper,r.rolbypassrls,r.rolcreaterole,r.rolcreatedb,r.rolreplication,
        exists(select 1 from pg_roles p where p.rolname in ('anon','authenticated','service_role','postgres','supabase_admin','supabase_auth_admin','world_v2_admission_owner','world_v2_admission_release')
          and pg_has_role(current_user,p.oid,'MEMBER')) as forbidden_member,
        (has_schema_privilege(current_user,'world_v2','CREATE') or exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
          where n.nspname='world_v2' and c.relkind in ('r','p') and
            (has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE') or has_any_column_privilege(current_user,c.oid,'INSERT,UPDATE')))) as unsafe_write
        from pg_roles r where r.rolname=current_user`);
      const role = roles.rows[0];
      if (
        roles.rows.length !== 1 ||
        !role ||
        role.role_name !== readerRole ||
        role.session_role !== readerRole ||
        role.role_override !== 'none' ||
        role.read_only !== 'on' ||
        [
          'rolsuper',
          'rolbypassrls',
          'rolcreaterole',
          'rolcreatedb',
          'rolreplication',
          'forbidden_member',
          'unsafe_write',
        ].some((key) => role[key] !== false)
      )
        fail('OPENING_PUBLISHER_ROLE_DENIED');
      const identity = await source.query<Row>(databaseIdentityQuery);
      if (
        publisherIdentity.length !== 1 ||
        identity.rows.length !== 1 ||
        ['database_name', 'database_oid', 'postmaster_started_at'].some(
          (key) =>
            typeof identity.rows[0]?.[key] !== 'string' ||
            !identity.rows[0]?.[key],
        ) ||
        identity.rows[0]!.in_recovery !== false ||
        canonicalSerialize(identity.rows) !==
          canonicalSerialize(publisherIdentity)
      )
        fail('OPENING_BINDING_MISMATCH');
      const sourceHead = await source.query<Row>(
        'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1',
        [claims.worldId],
      );
      if (
        sourceHead.rows.length !== 1 ||
        canonicalSerialize(sourceHead.rows[0]) !== canonicalSerialize(head)
      )
        fail('OPENING_BINDING_MISMATCH');
      const stored = await this.#opening.loadFrom(source, claims.worldId);
      matchesAuthorization(stored, claims);
      if (canonicalSerialize(stored) !== canonicalSerialize(candidate))
        fail('OPENING_BINDING_MISMATCH');
      const lineage = await this.#lineage.rebuildReadOnlyFrom(
        source,
        claims.worldId,
      );
      if (
        lineage.ledgers.seedId !== stored.seedId ||
        lineage.ledgers.seedFingerprint !== stored.fingerprint ||
        lineage.headWorldVersion !== head.world_version ||
        lineage.headEventSequence !== head.event_sequence
      )
        fail('OPENING_BINDING_MISMATCH');
      return lineage;
    });
  }
}
