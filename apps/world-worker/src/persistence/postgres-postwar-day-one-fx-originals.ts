/** Fixed approved first-day quote custody. Publication derives all originals
 * from the actual new-World seed; a reader/DTO/Ready flag cannot publish. */
import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import {
  canonicalSerialize,
  DOMAIN_ERROR_CODES,
  DomainError,
  type OpeningSeed,
} from '@econmind/core';
import {
  parsePostwarDayOneFxQuoteData,
  type PostwarDayOneFxQuoteData,
} from '@econmind/core/postwar-day-one-treasury-fx';
import {
  createPostwarDayOneFxPolicy,
  POSTWAR_DAY_ONE_FX_POLICY_SHA256,
  POSTWAR_DAY_ONE_FX_USER_RECEIPT_SHA256,
} from '../preparation/postwar-day-one-fx-policy.js';
import {
  WORKER_CURRENT_AUTHORIZATION_LOCK_QUERY,
  WORKER_REVOKED_AUTHORIZATION_LOCK_QUERY,
} from './worker-authorization-sql.js';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';
import { OFFICE_COMMAND_CURRENT_BINDING_QUERY } from '../intake/postgres-office-command-intake.js';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');
export const POSTWAR_DAY_ONE_FX_CUSTODY_PROPOSAL =
  'database/proposals/postwar-day-one-fx-custody.sql';
export const POSTWAR_DAY_ONE_FX_SEED_FINGERPRINT =
  'sha256:cfc55796562b44bd616f33082cbbafd9dbd43d58733a24ac550339cbc8376274';
export const POSTWAR_DAY_ONE_FX_RETAINED_SOURCES = Object.freeze({
  POSTWAR_SUPPLY_SOURCE_02C3D68F539B5E945DFA99AA9BC4536FC4ACAD34:
    'sha256:3df2e5ffc29cf305fd6dd735551cf37caa87e4fddcad619fdbf17beaa208a799',
  SOURCE_GCU_BANK_67D45B1D13871199F315631C6E04333A:
    'sha256:232bbde072e731867226202eab44271014b65ed2485f9efaeae580f2f7e8aaca',
  SOURCE_POSTWAR_FINANCIAL_V1:
    'sha256:3e2c610a5884857e3075db8214848b8405176f6e5e9b6234f15c7a8b96db332e',
  SOURCE_POSTWAR_OPERATING_V1:
    'sha256:ba9ad8f6117d8bb8535cd6572b9092d25779add30e8050b35186606ec860e1cc',
});
export const POSTWAR_DAY_ONE_FX_ORIGINAL_LOCK_QUERY =
  'select * from world_v2.lock_postwar_day_one_fx_original($1,$2,$3,$4,$5::timestamptz)';
const MANUAL_CLAIM = `select team_id,authorization_version from world_v2.current_commit_authorization
         where world_id=$1 and auth_subject=$2::uuid and country_id=$3 and office_id=$4
           and capability=$5 and active for share`;
function invalid(reason: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'POSTWAR_DAY_ONE_FX_CUSTODY:' + reason,
  );
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value || value.trim() !== value)
    invalid('EXACT_ORIGINAL_METADATA_REQUIRED');
  return value;
}
export interface PostwarDayOneFxLockedOriginal {
  readonly registrationRef: string;
  readonly admissionRef: string;
  readonly seedId: string;
  readonly seedFingerprint: string;
  readonly sourceRevision: string;
  readonly quote: PostwarDayOneFxQuoteData;
  readonly quoteTextSHA256: string;
  readonly head: Readonly<{ worldVersion: string; eventSequence: string }>;
}
/** Same executor retains source/admission/quote guards through outer COMMIT.
 * This returns DATA, not a current-authority grant or transferable held view. */
export async function lockPostwarDayOneFxOriginalFrom(
  tx: SqlExecutor,
  input: {
    readonly worldId: string;
    readonly countryId: string;
    readonly seedFingerprint: string;
    readonly quoteRef: string;
    readonly observedAtReal: string;
  },
): Promise<Readonly<PostwarDayOneFxLockedOriginal>> {
  if (input.seedFingerprint !== POSTWAR_DAY_ONE_FX_SEED_FINGERPRINT)
    invalid('FIXED_ADOPTED_NEW_WORLD_REQUIRED');
  const result = await tx
    .query(POSTWAR_DAY_ONE_FX_ORIGINAL_LOCK_QUERY, [
      input.worldId,
      input.countryId,
      input.seedFingerprint,
      input.quoteRef,
      input.observedAtReal,
    ])
    .catch((error: unknown) => {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        'message' in error &&
        ['55000', '42501', '22023'].includes(String(error.code)) &&
        /^FX_[A-Z_]+$/u.test(String(error.message))
      ) {
        const failure = new DomainError(
          DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
          'POSTWAR_DAY_ONE_FX_CUSTODY:' + String(error.message),
        );
        Object.defineProperty(failure, 'cause', { value: error });
        throw failure;
      }
      throw error;
    });
  if (result.rows.length !== 1 || !result.rows[0])
    invalid('CURRENT_ORIGINAL_REQUIRED');
  const row = result.rows[0],
    bytes = text(row.quote_text);
  const quote = parsePostwarDayOneFxQuoteData(JSON.parse(bytes), sha);
  if (
    canonicalSerialize(quote) !== bytes ||
    sha(bytes) !== row.quote_text_sha256 ||
    quote.worldId !== input.worldId ||
    quote.countryId !== input.countryId ||
    quote.seedFingerprint !== input.seedFingerprint ||
    quote.quoteRef !== input.quoteRef ||
    row.seed_fingerprint !== input.seedFingerprint ||
    quote.policySha256 !== POSTWAR_DAY_ONE_FX_POLICY_SHA256 ||
    quote.userReceiptSha256 !== POSTWAR_DAY_ONE_FX_USER_RECEIPT_SHA256
  )
    invalid('ACTUAL_QUOTE_HASH_OR_SCOPE_DIFFERS');
  const version = text(row.world_version),
    sequence = text(row.event_sequence);
  if (
    !/^(0|[1-9][0-9]*)$/u.test(version) ||
    !/^(0|[1-9][0-9]*)$/u.test(sequence)
  )
    invalid('ACTUAL_HEAD_REQUIRED');
  return Object.freeze({
    registrationRef: text(row.registration_ref),
    admissionRef: text(row.admission_ref),
    seedId: text(row.seed_id),
    seedFingerprint: input.seedFingerprint,
    sourceRevision: text(row.source_revision),
    quote,
    quoteTextSHA256: sha(bytes),
    head: Object.freeze({ worldVersion: version, eventSequence: sequence }),
  });
}
/** Controlled offline publisher only. No arbitrary quote or caller admission
 * field is accepted. SQL independently checks its fixed publisher and the
 * actual immutable seed/admission/permit and hard-pinned document hashes. */
export async function publishPostwarDayOneFxOriginals(input: {
  readonly database: SqlDatabase;
  readonly seed: OpeningSeed;
  readonly policyBytes: string;
  readonly userReceiptBytes: string;
}) {
  const policy = createPostwarDayOneFxPolicy(input);
  if (policy.seedFingerprint !== POSTWAR_DAY_ONE_FX_SEED_FINGERPRINT)
    invalid('FIXED_ADOPTED_NEW_WORLD_REQUIRED');
  const retainedSources = Object.fromEntries(
    input.seed.sources.map((s) => [s.sourceId, s.payloadHash]),
  );
  if (
    canonicalSerialize(retainedSources) !==
    canonicalSerialize(POSTWAR_DAY_ONE_FX_RETAINED_SOURCES)
  )
    invalid('EXACT_FOUR_SOURCE_ORIGINALS_REQUIRED');
  const { fingerprint: _fingerprint, ...intent } = input.seed;
  void _fingerprint;
  const document = canonicalSerialize({
    schemaVersion: 'postwar-day-one-fx-custody-publication-v1',
    worldId: input.seed.worldId,
    seedId: input.seed.seedId,
    seedFingerprint: input.seed.fingerprint,
    canonicalSeedSha256: sha(canonicalSerialize(intent)),
    retainedSources,
    policyBytes: input.policyBytes,
    userReceiptBytes: input.userReceiptBytes,
    quotes: policy.quotes.map((quote) => ({
      quoteText: canonicalSerialize(quote),
    })),
  });
  return input.database.transaction(async (tx) => {
    const result = await tx.query(
      'select * from world_v2.publish_postwar_day_one_fx_originals($1)',
      [document],
    );
    if (
      result.rows.length !== 70 ||
      new Set(result.rows.map((r) => r.country_id)).size !== 70
    )
      invalid('COMPLETE_ACTUAL_QUOTE_PUBLICATION_REQUIRED');
    return Object.freeze({
      worldId: policy.worldId,
      seedFingerprint: policy.seedFingerprint,
      publicationSHA256: sha(document),
      quotes: policy.quotes,
      registrations: Object.freeze(
        result.rows.map((r) => Object.freeze({ ...r })),
      ),
    });
  });
}
/** Exact existing cutoff statements only. No UPDATE privilege, authority DTO,
 * generic SQL rewrite, extra connection or per-request role grants. */
export function createPostwarDayOneFxAuthorizationDatabase(
  database: SqlDatabase,
): SqlDatabase {
  const wrap = (executor: SqlExecutor): SqlExecutor =>
    Object.freeze({
      query<Row extends object>(
        sql: string,
        parameters: readonly unknown[] = [],
      ) {
        let actual = sql;
        if (
          parameters[3] === 'FINANCE' &&
          parameters[4] === 'FINANCE_TREASURY'
        ) {
          if (sql === WORKER_CURRENT_AUTHORIZATION_LOCK_QUERY)
            actual =
              'select * from world_v2.lock_postwar_day_one_fx_current_authorization($1,$2::uuid,$3,$4,$5)';
          else if (sql === MANUAL_CLAIM)
            actual =
              'select team_id,authorization_version from world_v2.lock_postwar_day_one_fx_current_authorization($1,$2::uuid,$3,$4,$5)';
        }
        if (
          sql === WORKER_REVOKED_AUTHORIZATION_LOCK_QUERY &&
          parameters[3] === 'FINANCE'
        )
          actual =
            'select * from world_v2.lock_postwar_day_one_fx_revoked_authorization($1,$2::uuid,$3,$4)';
        return executor.query<Row>(actual, parameters);
      },
    });
  const direct = wrap(database);
  return Object.freeze({
    query: direct.query,
    transaction<T>(consume: (tx: SqlExecutor) => Promise<T>) {
      return database.transaction((tx) => consume(wrap(tx)));
    },
  });
}

const intakeWrappers = new WeakMap<object, Pick<Pool, 'connect'>>();
const issuedIntakeWrappers = new WeakSet<object>();
/** One exact cutoff on the already-held intake transaction. The caller must
 * reuse this same wrapper for HTTP and the privately bound manual runtime. */
export function createPostwarDayOneFxIntakeAuthorizationPool(
  pool: Pick<Pool, 'connect'>,
): Pick<Pool, 'connect'> {
  if (issuedIntakeWrappers.has(pool)) return pool;
  const prior = intakeWrappers.get(pool);
  if (prior) return prior;
  const wrapper = Object.freeze({
    async connect() {
      const client = await pool.connect();
      return new Proxy(client, {
        get(target, key) {
          if (key === 'query')
            return (statement: string, parameters?: readonly unknown[]) => {
              if (
                statement ===
                  OFFICE_COMMAND_CURRENT_BINDING_QUERY +
                    ' for share of authz,entitlement' &&
                parameters?.length === 8 &&
                parameters[3] === 'FINANCE' &&
                parameters[6] === 'FINANCE_TREASURY'
              )
                return target.query(
                  'select * from world_v2.lock_postwar_day_one_fx_intake_binding($1,$2::uuid,$3,$4,$5,$6,$7,$8)',
                  [...parameters],
                );
              return target.query(
                statement,
                parameters ? [...parameters] : undefined,
              );
            };
          const value: unknown = Reflect.get(target, key, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    },
  });
  intakeWrappers.set(pool, wrapper);
  issuedIntakeWrappers.add(wrapper);
  return wrapper;
}
