/** Bounded adopted source plan and post-registration inspection. No seed
 * parsing, source publication, command, consumer or Clock. Actor identities
 * are isolated inspection data; actual publication uses the same-dist host hook. */
import { createHash, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { canonicalSerialize } from '@econmind/core';
import type { PostwarPhysicalSourceContext } from '../../apps/world-worker/src/preparation/postwar-physical-service-receipt.js';
import { readPostwarIndustryRefineryCoverage } from '../../apps/world-worker/src/persistence/postwar-industry-refinery-sites.js';
import {
  POSTWAR_INDUSTRY_SOURCE_LOCK,
  inspectPostwarIndustryOriginalDocument,
} from '../../apps/world-worker/src/persistence/postwar-industry-production-source.js';
import {
  INDUSTRY_FIRST_DAY_READ_QUERY,
  readPostwarIndustryFirstDaySourceFrom,
} from '../../apps/world-worker/src/persistence/postwar-industry-first-day-source.js';
import { INDUSTRY_UTILITY_READ_QUERY } from '../../apps/world-worker/src/persistence/postwar-industry-utility-source.js';
import { INDUSTRY_CURRENT_AUTHORIZATION_LOCK_QUERY } from '../../apps/world-worker/src/persistence/postwar-industry-current-authorization.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
type Pins = Readonly<{
  worldId: string;
  seedId: string;
  seedFingerprint: string;
  admissionRef: string;
}>;
type Head = Readonly<{ worldVersion: string; eventSequence: string }>;
type Scope = Readonly<{ countryId: string; facilityId: string }>;
type SourceRow = Readonly<{
  source_text: string;
  source_sha256: string;
  source_ref: string;
  world_version: string;
  event_sequence: string;
}>;
export interface Refinery21InspectionActor {
  readonly countryId: string;
  readonly authSubject: string;
}
function record(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    throw Error('REFINERY21_EXACT_RECORD_REQUIRED');
  return v as Record<string, unknown>;
}
/** Mirrors the production reader's lossless original decoding. Never recover
 * decimal lexemes by stringifying an already rounded JavaScript Number. */
export function inspectRefinery21OriginalText(bytes: string) {
  const parse = JSON.parse as (
    bytes: string,
    revive: (
      key: string,
      value: unknown,
      context: { source?: string },
    ) => unknown,
  ) => unknown;
  return inspectPostwarIndustryOriginalDocument(
    parse(bytes, (_key, value, context) => {
      if (typeof value !== 'number') return value;
      if (typeof context.source !== 'string' || !context.source)
        throw Error('REFINERY21_EXACT_NUMERIC_SOURCE_LEXEME_REQUIRED');
      return context.source;
    }),
  );
}

/** DATA decoder; never issues an operating/admission/payment authority. */
export function decodeRefinery21UtilityPacket(
  row: SourceRow,
  input: Pins & Scope & { head: Head },
) {
  if (
    sha(row.source_text) !== row.source_sha256 ||
    row.source_ref !== 'INDUSTRY_UTILITY_' + row.source_sha256.toUpperCase() ||
    row.world_version !== input.head.worldVersion ||
    row.event_sequence !== input.head.eventSequence
  )
    throw Error('REFINERY21_EXACT_UTILITY_BYTES_OR_HEAD_REQUIRED');
  const data = record(JSON.parse(row.source_text) as unknown);
  for (const key of [
    'worldId',
    'seedId',
    'seedFingerprint',
    'admissionRef',
    'countryId',
    'facilityId',
  ] as const)
    if (data[key] !== input[key])
      throw Error('REFINERY21_UTILITY_SOURCE_SCOPE_DIFFERS');
  if (data.schemaVersion !== 'postwar-industry-utility-original-v1')
    throw Error('REFINERY21_UTILITY_SCHEMA_REQUIRED');
  const power = record(data.power);
  if (typeof power.storageId !== 'string' || !power.storageId)
    throw Error('REFINERY21_ACTUAL_POWER_STORAGE_REQUIRED');
  return Object.freeze({
    sourceRef: row.source_ref,
    sourceSha256: row.source_sha256,
    storageId: power.storageId,
  });
}
const knownMissing = new Set(['INDUSTRY_ORIGINAL_NOT_REGISTERED']);
const knownRevoked = new Set([
  'INDUSTRY_ORIGINAL_REVOKED',
  'INDUSTRY_FIRST_DAY_SOURCE_REVOKED',
  'UTILITY_CURRENT_PARENT_OR_SOURCE_REVOKED',
  'POWER_SERVICE_CURRENT_PARENT_OR_SOURCE_REVOKED',
]);
async function probe<T extends object>(
  tx: SqlExecutor,
  run: () => Promise<T | null>,
) {
  await tx.query('savepoint refinery21_probe');
  try {
    const value = await run();
    await tx.query('release savepoint refinery21_probe');
    return value === null
      ? { status: 'MISSING' as const, reason: 'NO_REGISTERED_SOURCE_ROW' }
      : { status: 'PRESENT' as const, value };
  } catch (error) {
    await tx.query('rollback to savepoint refinery21_probe');
    await tx.query('release savepoint refinery21_probe');
    const e = error as { code?: unknown; message?: unknown };
    if (e.code === '55000' && typeof e.message === 'string') {
      if (knownMissing.has(e.message))
        return { status: 'MISSING' as const, reason: e.message };
      if (knownRevoked.has(e.message))
        return { status: 'REVOKED' as const, reason: e.message };
    }
    throw error; // permission/SQL/head/hash/rollback failures are not absence.
  }
}

export function createPostwarRefinery21AssemblyCheck(
  sourceContext: PostwarPhysicalSourceContext,
) {
  // Existing genuine source loader and adoption rules determine every site;
  // no caller site list, guessed C2 parameter, quantity or staffing is accepted.
  const coverage = readPostwarIndustryRefineryCoverage(sourceContext);
  if (
    coverage.sites.length !== 21 ||
    coverage.notApplicableCountries.length !== 49 ||
    new Set(coverage.sites.map((s) => s.countryId)).size !== 21
  )
    throw Error('REFINERY21_EXACT_ADOPTED_COVERAGE_REQUIRED');
  return Object.freeze({
    sites: coverage.sites.map((s) =>
      Object.freeze({ countryId: s.countryId, facilityId: s.facilityId }),
    ),
    /** Existing isolated fixture's auth/seat/entitlement mechanism, restricted
     * to these actual21 countries and one Industry capability. No roles,
     * membership, source custody, OP mandate, JWT or economic fact is created. */
    async configureTestOnlyInspectionActors(
      input: Readonly<{
        marker: Pins & { database: string; team: string };
        clone: { database: string; installer: Pool };
        existingHostCountries?: readonly Readonly<{
          countryId: string;
          expectedRawSourceSHA256: string;
        }>[];
      }>,
    ) {
      if (
        process.env.ECONMIND_REGISTERED_FINAL_NODE_NATIVE !== '1' ||
        input.clone.database === input.marker.database ||
        !/^postwar_clone_[a-z0-9_]+$/u.test(input.clone.database)
      )
        throw Error('REFINERY21_OWNED_TEST_ONLY_CLONE_REQUIRED');
      const client = await input.clone.installer.connect();
      const actors: Refinery21InspectionActor[] = [];
      const countries: Readonly<{
        countryId: string;
        expectedRawSourceSHA256: string;
      }>[] = [];
      try {
        await client.query('begin');
        const actual = await client.query<{
          database: string;
          seed_id: string;
          seed_fingerprint: string;
          admission_ref: string;
        }>(
          'select current_database()as database,a.seed_id,a.seed_fingerprint,a.admission_ref from world_v2.runtime_opening_admission a join world_v2.opening_seed s on s.world_id=a.world_id and s.seed_id=a.seed_id and s.seed_fingerprint=a.seed_fingerprint where a.world_id=$1',
          [input.marker.worldId],
        );
        if (
          actual.rows.length !== 1 ||
          actual.rows[0]?.database !== input.clone.database ||
          actual.rows[0].seed_id !== input.marker.seedId ||
          actual.rows[0].seed_fingerprint !== input.marker.seedFingerprint ||
          actual.rows[0].admission_ref !== input.marker.admissionRef
        )
          throw Error('REFINERY21_ACTUAL_CLONE_ADMISSION_REQUIRED');
        const existing = new Map(
          (input.existingHostCountries ?? []).map((c) => [
            c.countryId,
            c.expectedRawSourceSHA256,
          ]),
        );
        if (existing.size !== (input.existingHostCountries?.length ?? 0))
          throw Error('REFINERY21_DUPLICATE_EXISTING_HOST_COUNTRY');
        const union = [
          ...new Set([
            ...existing.keys(),
            ...coverage.sites.map((s) => s.countryId),
          ]),
        ].sort();
        for (const countryId of union) {
          if (!/^COUNTRY_(0[1-9]|[1-6][0-9]|70)$/u.test(countryId))
            throw Error('REFINERY21_EXACT_HOST_COUNTRY_REQUIRED');
          // Host selectors come from this same admitted published capacity
          // original, never a reused C2 hash or a new departmental cap policy.
          const capacity = await client.query<{ source_sha256: string }>(
            "select source_sha256 from world_v2.finance_budget_capacity_original where world_id=$1 and country_id=$2 and seed_fingerprint=$3 and admission_ref=$4 and source_sha256=encode(sha256(convert_to(source_text,'UTF8')),'hex')",
            [
              input.marker.worldId,
              countryId,
              input.marker.seedFingerprint,
              input.marker.admissionRef,
            ],
          );
          const original = capacity.rows[0];
          if (
            capacity.rows.length !== 1 ||
            !original ||
            !/^[a-f0-9]{64}$/u.test(original.source_sha256)
          )
            throw Error(
              'REFINERY21_ACTUAL_PUBLISHED_CAPACITY_SELECTOR_REQUIRED:' +
                countryId,
            );
          if (
            existing.has(countryId) &&
            existing.get(countryId) !== original.source_sha256
          )
            throw Error(
              'REFINERY21_EXISTING_HOST_SOURCE_SHA_DIFFERS:' + countryId,
            );
          countries.push(
            Object.freeze({
              countryId,
              expectedRawSourceSHA256: original.source_sha256,
            }),
          );
        }
        // All source selectors were checked before adding test identities.
        for (const site of coverage.sites) {
          const subject = randomUUID();
          const revision =
            'TEST_ONLY_REFINERY21_' + subject.replaceAll('-', '').toUpperCase();
          await client.query(
            "insert into world_v2.current_commit_authorization(world_id,auth_subject,country_id,office_id,capability,team_id,authorization_version,active,refreshed_at_real)values($1,$2::uuid,$3,'INDUSTRY','INDUSTRY_PRODUCTION',$4,$5,true,clock_timestamp())",
            [
              input.marker.worldId,
              subject,
              site.countryId,
              input.marker.team,
              revision,
            ],
          );
          await client.query(
            "insert into world_v2.runtime_read_seat(world_id,auth_subject,country_id,office_id,team_id,authorization_revision)values($1,$2::uuid,$3,'INDUSTRY',$4,$5)",
            [
              input.marker.worldId,
              subject,
              site.countryId,
              input.marker.team,
              revision,
            ],
          );
          const scope =
            'OFFICE_' +
            Buffer.from(site.countryId).toString('hex').toUpperCase() +
            '_494E445553545259';
          await client.query(
            "insert into world_v2.projection_entitlement(world_id,auth_subject,classification,scope_key,authorization_version,active,granted_at)values($1,$2::uuid,'OFFICE_PRIVATE',$3,$4,true,clock_timestamp())",
            [input.marker.worldId, subject, scope, revision],
          );
          actors.push(
            Object.freeze({ countryId: site.countryId, authSubject: subject }),
          );
        }
        await client.query('commit');
        return Object.freeze({
          classification:
            'TEST_ONLY_WORKER_AUTHORIZATION_INSPECTION_IDENTITIES_NOT_HTTP_ACTOR_BINDINGS',
          actors: Object.freeze(actors),
          countries: Object.freeze(countries),
        });
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    },
    async inspect(
      input: Readonly<{
        database: SqlDatabase;
        workerRole: string;
        pins: Pins;
        actors?: readonly Refinery21InspectionActor[];
      }>,
    ) {
      if (!/^[a-z_][a-z0-9_]{0,62}$/u.test(input.workerRole))
        throw Error('REFINERY21_FIXED_WORKER_ROLE_REQUIRED');
      return input.database.transaction(async (tx) => {
        await tx.query('set transaction isolation level repeatable read');
        const h = await tx.query<{
          world_version: string;
          event_sequence: string;
        }>(
          'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1',
          [input.pins.worldId],
        );
        if (h.rows.length !== 1) throw Error('REFINERY21_ACTUAL_HEAD_REQUIRED');
        const head: Head = {
          worldVersion: h.rows[0]!.world_version,
          eventSequence: h.rows[0]!.event_sequence,
        };
        const sourceSession = await tx.query<{
          role_name: string;
          safe: boolean;
          reader: boolean;
          owner: boolean;
          publisher: boolean;
        }>(
          "select current_user::text role_name,not(rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolreplication)safe,pg_has_role(current_user,'world_v2_industry_source_reader','MEMBER')reader,pg_has_role(current_user,'world_v2_industry_source_owner','MEMBER')owner,pg_has_role(current_user,'world_v2_industry_source_publisher','MEMBER')publisher from pg_roles where rolname=current_user",
        );
        const session = sourceSession.rows[0];
        if (
          sourceSession.rows.length !== 1 ||
          session?.role_name !== input.workerRole ||
          !session.safe ||
          !session.reader ||
          session.owner ||
          session.publisher
        )
          throw Error('REFINERY21_SEPARATED_EXISTING_WORKER_REQUIRED');
        const signatures = [
          'world_v2.publish_postwar_industry_first_day_source(text,text,text,text,text,text,text)',
          'world_v2.publish_postwar_industry_utility_source(text,text,jsonb,text)',
          'world_v2.publish_postwar_industry_power_service_source(text,text)',
          'world_v2.read_postwar_industry_water_grant_publication(text,text,text,text)',
        ];
        const schema = await tx.query<{
          signature: string;
          body_sha256: string | null;
        }>(
          "select s.signature,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')body_sha256 from unnest($1::text[])s(signature)left join pg_proc p on p.oid=to_regprocedure(s.signature)",
          [signatures],
        );
        const rows = [];
        let failure: unknown;
        try {
          await tx.query('set local role world_v2_industry_source_reader');
          for (const site of coverage.sites) {
            const args = [
              input.pins.worldId,
              site.countryId,
              site.facilityId,
              head.worldVersion,
              head.eventSequence,
            ];
            const original = await probe(tx, async () => {
              const r = await tx.query<{
                document_text: string;
                document_sha256: string;
                seed_fingerprint: string;
                admission_ref: string;
              }>(POSTWAR_INDUSTRY_SOURCE_LOCK, args);
              if (r.rows.length !== 1)
                throw Error('REFINERY21_EXACT_PRODUCTION_ORIGINAL_REQUIRED');
              const d = r.rows[0]!;
              if (
                sha(d.document_text) !== d.document_sha256 ||
                d.seed_fingerprint !== input.pins.seedFingerprint ||
                d.admission_ref !== input.pins.admissionRef
              )
                throw Error('REFINERY21_ORIGINAL_HASH_OR_PINS_DIFFERS');
              const parsed = inspectRefinery21OriginalText(d.document_text);
              if (
                parsed.scope.worldId !== input.pins.worldId ||
                parsed.scope.countryId !== site.countryId ||
                parsed.scope.facilityId !== site.facilityId ||
                parsed.scope.operatorId !== site.operatorId
              )
                throw Error('REFINERY21_ACTUAL_ORIGINAL_SCOPE_DIFFERS');
              return {
                documentSha256: d.document_sha256,
                rawOriginalMissingCodes: parsed.missing.map((x) => x.code),
                classification:
                  'RAW_ORIGINAL_DIAGNOSTICS_NOT_FIRSTDAY_RUNTIME_READINESS',
              };
            });
            const firstDay = await probe(tx, async () => {
              const d = await readPostwarIndustryFirstDaySourceFrom(tx, {
                ...input.pins,
                ...site,
                head,
                expectedPins: input.pins,
              });
              return d
                ? {
                    sourceRef: d.sourceRef,
                    sourceSha256: d.rawSha256,
                    outputUnit: d.data.outputUnit,
                  }
                : null;
            });
            const utility = await probe(tx, async () => {
              const r = await tx.query<SourceRow>(
                INDUSTRY_UTILITY_READ_QUERY,
                args,
              );
              if (r.rows.length === 0) return null;
              if (r.rows.length !== 1)
                throw Error('REFINERY21_EXACT_UTILITY_PACKET_REQUIRED');
              return decodeRefinery21UtilityPacket(r.rows[0]!, {
                ...input.pins,
                ...site,
                head,
              });
            });
            const compact = utility.status === 'PRESENT' ? utility.value : null;
            const power = compact
              ? await probe(tx, async () => {
                  const r = await tx.query<SourceRow>(
                    INDUSTRY_FIRST_DAY_READ_QUERY,
                    [
                      input.pins.worldId,
                      site.countryId,
                      compact.storageId,
                      head.worldVersion,
                      head.eventSequence,
                    ],
                  );
                  if (r.rows.length === 0) return null;
                  if (r.rows.length !== 1)
                    throw Error('REFINERY21_EXACT_POWER_PACKET_REQUIRED');
                  const d = r.rows[0]!,
                    positions = JSON.parse(d.source_text) as unknown;
                  if (
                    sha(d.source_text) !== d.source_sha256 ||
                    d.source_ref !==
                      'INDUSTRY_POWER_STAFF_' + d.source_sha256.toUpperCase() ||
                    d.world_version !== head.worldVersion ||
                    d.event_sequence !== head.eventSequence ||
                    !Array.isArray(positions) ||
                    positions.length !== 3 ||
                    positions.some(
                      (x) =>
                        record(x).countryId !== site.countryId ||
                        record(x).sourceObjectId !== compact.storageId ||
                        record(x).sourceBucket !== 'POWER',
                    )
                  )
                    throw Error(
                      'REFINERY21_ACTUAL_POWER_SERVICE_SOURCE_DIFFERS',
                    );
                  return {
                    sourceRef: d.source_ref,
                    sourceSha256: d.source_sha256,
                    storageId: compact.storageId,
                  };
                })
              : {
                  status: 'UNKNOWN' as const,
                  reason: 'UTILITY_SOURCE_NOT_PRESENT_NO_STORAGE_ID_GUESS',
                };
            const actorResults = [];
            for (const actor of input.actors ?? []) {
              if (!/^[0-9a-f-]{36}$/iu.test(actor.authSubject))
                throw Error('REFINERY21_ACTUAL_SUBJECT_REQUIRED');
              const result = await tx.query<{
                world_id: string;
                country_id: string;
                office_id: string;
                capability: string;
                auth_subject: string;
              }>(INDUSTRY_CURRENT_AUTHORIZATION_LOCK_QUERY, [
                input.pins.worldId,
                actor.authSubject,
                site.countryId,
                'INDUSTRY',
                'INDUSTRY_PRODUCTION',
              ]);
              if (result.rows.length > 1)
                throw Error('REFINERY21_AMBIGUOUS_ACTOR_SCOPE');
              if (actor.countryId !== site.countryId && result.rows.length)
                throw Error('REFINERY21_FOREIGN_ACTOR_ACCEPTED');
              const actual = result.rows[0];
              if (
                actual &&
                (actual.auth_subject !== actor.authSubject ||
                  actual.world_id !== input.pins.worldId ||
                  actual.country_id !== site.countryId ||
                  actual.office_id !== 'INDUSTRY' ||
                  actual.capability !== 'INDUSTRY_PRODUCTION')
              )
                throw Error('REFINERY21_ACTOR_SCOPE_DIFFERS');
              actorResults.push({
                configuredCountry: actor.countryId,
                authSubject: actor.authSubject,
                status: actual
                  ? 'AUTHORIZED'
                  : actor.countryId === site.countryId
                    ? 'NOT_AUTHORIZED'
                    : 'CROSS_COUNTRY_DENIED',
              });
            }
            rows.push({
              countryId: site.countryId,
              facilityId: site.facilityId,
              original,
              firstDay,
              utility,
              power,
              actors: actorResults,
              ownActorConfiguration: (input.actors ?? []).some(
                (a) => a.countryId === site.countryId,
              )
                ? 'TEST_ONLY_CONFIGURED'
                : 'UNKNOWN_NOT_CONFIGURED',
            });
          }
        } catch (error) {
          failure = error;
        }
        try {
          await tx.query('set local role "' + input.workerRole + '"');
        } catch (restore) {
          if (failure !== undefined)
            throw new AggregateError(
              [failure, restore],
              'REFINERY21_RESTORE_FAILED',
              { cause: restore },
            );
          throw restore;
        }
        if (failure !== undefined) throw failure;
        return Object.freeze({
          classification:
            'REGISTERED_SOURCE_AND_WORKER_SCOPE_GATES_NOT_EXECUTION_OR_HTTP_AUTH',
          head,
          pins: input.pins,
          schema: schema.rows,
          sites: rows,
          notApplicableCountries: coverage.notApplicableCountries,
          runtimeStartup: 'NOT_RUN_BY_THIS_CHECK',
          productionExecution: 'NOT_RUN',
          sourceCoverageFingerprint: sha(canonicalSerialize(rows)),
        });
      });
    },
  });
}
