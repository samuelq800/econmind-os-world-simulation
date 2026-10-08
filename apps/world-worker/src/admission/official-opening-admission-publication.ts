/** Explicit private publication service; not installed in startup/HTTP/Clock.
 * Existing SQL veto/RLS/grants are deliberately untouched. Source inspection,
 * owner authorization and SQL ADMITTED readback are three different facts.
 */
import { createHash } from 'node:crypto';
import { canonicalSerialize, worldId, type OpeningSeed } from '@econmind/core';
import { inspectOfficialWorldOpeningAdmission } from '../preparation/official-world-opening-admission.js';
import {
  reconcileOfficialOpeningDecision,
  officialOpeningTrustedDecisionSource,
  type OfficialOpeningSourceBytes,
} from '../preparation/official-opening-decision-reconciliation.js';
import { prepareOpeningCanonicalSeed } from '../preparation/opening-canonical-seed-bridge.js';
import { WorldOpeningSeedStore } from '../persistence/opening-seed-store.js';
import { DurableV08LedgerLineageReader } from '../persistence/durable-v08-ledger-lineage-reader.js';
import type { SqlDatabase, SqlExecutor } from '../persistence/sql-database.js';
import type { ImmutableOpeningAdmissionReference } from '../persistence/runtime-read-binding-store.js';
import {
  PrivateOpeningAdmissionAuthority,
  isPrivateOpeningAdmissionAuthority,
  resolvePrivateOpeningPublicationAuthorization,
  OpeningPublicationAuthorityError,
  openingPublicationTimestamp,
  type OpeningPublicationAuthorization,
} from './private-opening-admission-authority.js';

export interface OfficialOpeningPublicationSourceBundle {
  readonly source: OfficialOpeningSourceBytes;
  readonly selectionBytes: string;
  readonly mapManifestBytes: string;
  readonly regionsBytes: string;
  readonly gapsBytes: string;
  readonly decisionBytes: string;
  readonly assemblyBytes: string;
  /** Independently retained owner registry bytes, not approval flags. All bytes
   * and references are bound by the signed bundle digest and economic validator. */
  readonly ownerRecords: readonly Readonly<{
    reference: string;
    recordBytes: string;
  }>[];
}

const sha = (bytes: string) =>
  createHash('sha256').update(bytes, 'utf8').digest('hex');
export function officialOpeningPublicationSourceSha256(
  bundle: OfficialOpeningPublicationSourceBundle,
): string {
  return sha(canonicalSerialize(bundle));
}

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

function selectedSeed(
  bundle: OfficialOpeningPublicationSourceBundle,
): OpeningSeed {
  try {
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

const columns = `admission_ref, world_id, seed_id, seed_fingerprint, model_version, replay_binding,
  to_char(admitted_at_real at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as admitted_at_real`;
type Row = Record<string, unknown>;

/** Server-owned database/source/authority/clock inputs only. Invocation carries
 * just World identity and a reference looked up by the private authority. This
 * class never bootstraps a seed, mints an Owner record or changes any ledger. */
export class OfficialOpeningAdmissionPublicationService {
  readonly #database: SqlDatabase;
  readonly #authority: PrivateOpeningAdmissionAuthority;
  readonly #sources: Readonly<{
    load(
      sha256: string,
    ): Promise<OfficialOpeningPublicationSourceBundle | null>;
  }>;
  readonly #nowReal: () => string;
  readonly #role: string;
  readonly #opening: WorldOpeningSeedStore;
  readonly #lineage: DurableV08LedgerLineageReader;

  constructor(input: {
    readonly database: SqlDatabase;
    readonly authority: PrivateOpeningAdmissionAuthority;
    readonly sources: Readonly<{
      load(
        sha256: string,
      ): Promise<OfficialOpeningPublicationSourceBundle | null>;
    }>;
    readonly nowReal: () => string;
    readonly publisherRole: string;
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
    const bundle = await this.#sources
      .load(claims.sourceBundleSha256)
      .catch(() => fail('OPENING_SOURCE_UNAVAILABLE'));
    if (!bundle) fail('OPENING_SOURCE_UNAVAILABLE');
    // Snapshot untrusted loader objects before awaiting the database/registry.
    const snapshot = JSON.parse(
      canonicalSerialize(bundle),
    ) as OfficialOpeningPublicationSourceBundle;
    if (
      officialOpeningPublicationSourceSha256(snapshot) !==
      claims.sourceBundleSha256
    )
      fail('OPENING_SOURCE_IDENTITY_MISMATCH');
    const seed = selectedSeed(snapshot);
    matchesAuthorization(seed, claims);
    const authorizationSha256 = sha(canonicalSerialize(claims));
    const admissionRef = `ADMISSION_${authorizationSha256.toUpperCase()}`;
    try {
      const result = await this.#database.transaction(async (tx) => {
        await this.#assertPublisher(tx);
        const head = await tx.query<Row>(
          'select world_version::text, event_sequence::text from world_v2.world_head where world_id=$1 for update',
          [requestedWorld],
        );
        if (head.rows.length !== 1) fail('OPENING_BINDING_MISMATCH');
        const stored = await this.#opening.loadFrom(tx, requestedWorld);
        matchesAuthorization(stored, claims);
        if (canonicalSerialize(stored) !== canonicalSerialize(seed))
          fail('OPENING_BINDING_MISMATCH');
        const lineage = await this.#lineage.rebuildFrom(tx, requestedWorld);
        if (
          lineage.ledgers.seedId !== stored.seedId ||
          lineage.ledgers.seedFingerprint !== stored.fingerprint
        )
          fail('OPENING_BINDING_MISMATCH');
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
        let admission = await this.#readAdmission(tx, requestedWorld);
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
            `insert into world_v2.runtime_opening_admission
              (world_id, admission_ref, seed_id, seed_fingerprint, model_version, replay_binding, admitted_at_real)
             values ($1,$2,$3,$4,$5,$6,$7::timestamptz) on conflict (world_id) do nothing`,
            [
              requestedWorld,
              admissionRef,
              stored.seedId,
              stored.fingerprint,
              claims.modelVersion,
              claims.replayBinding,
              admittedAtReal,
            ],
          );
          admission = await this.#readAdmission(tx, requestedWorld);
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
      const seen = new Set<Error>();
      let cause: unknown = error;
      for (
        let depth = 0;
        depth < 8 && cause instanceof Error && !seen.has(cause);
        depth++
      ) {
        if (cause instanceof OpeningAdmissionPublicationError) throw cause;
        if (cause instanceof OpeningPublicationAuthorityError) throw cause;
        if (cause.message.includes('ADMISSION_PUBLICATION_ENTRYPOINT_MISSING'))
          fail('ADMISSION_PUBLICATION_ENTRYPOINT_MISSING');
        seen.add(cause);
        cause = cause.cause;
      }
      return fail('OPENING_PUBLICATION_COMMIT_UNCONFIRMED');
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
    world: string,
  ): Promise<Readonly<ImmutableOpeningAdmissionReference> | null> {
    const result = await tx.query<Row>(
      `select ${columns} from world_v2.runtime_opening_admission where world_id=$1`,
      [world],
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
}
