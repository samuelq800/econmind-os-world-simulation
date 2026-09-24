import type { Pool } from 'pg';

import type {
  CurrentCommandScopeReader,
  ServerBoundCommandScope,
} from './authenticated-narrow-transfer-command-handler.js';
import {
  parseSupabaseAuthSubject,
  type SupabaseAuthSubject,
} from './identity.js';
import { WORLD_V2_AUTHENTICATED_FINAL_RECEIPT_QUERY } from './postgres-final-receipt-reader.js';
import {
  WORLD_V2_ENTITLED_PROJECTION_QUERY,
  type ParameterizedPgReadExecutor,
  type ParameterizedPgReadRequest,
} from './postgres-read-adapter.js';

const CURRENT_COMMAND_SCOPE_QUERY = `
select
  world_id,
  auth_subject::text as auth_subject,
  country_id,
  office_id,
  capability,
  authorization_version
from world_v2.current_commit_authorization
where world_id = $1
  and auth_subject = $2::uuid
  and active
order by country_id, office_id, capability
limit 2
`.trim();

const CURRENT_SCOPE_KEYS = Object.freeze([
  'auth_subject',
  'authorization_version',
  'capability',
  'country_id',
  'office_id',
  'world_id',
]);

function bindingFailure(message: string): never {
  throw new Error(`LOCAL_TRUSTED_POSTGRES_BINDING_INVALID: ${message}`);
}

function verifiedSubject(
  request: ParameterizedPgReadRequest,
  subjectIndex: number,
): SupabaseAuthSubject {
  if (request.verifiedAuthSubject === undefined) {
    bindingFailure('verified server JWT subject is required');
  }
  let subject: SupabaseAuthSubject;
  try {
    subject = parseSupabaseAuthSubject(request.verifiedAuthSubject);
  } catch {
    bindingFailure('verified server JWT subject is invalid');
  }
  if (request.values[subjectIndex] !== subject) {
    bindingFailure('query subject does not match the verified server JWT');
  }
  return subject;
}

function subjectForReadRequest(
  request: ParameterizedPgReadRequest,
): SupabaseAuthSubject {
  if (
    request.text === WORLD_V2_ENTITLED_PROJECTION_QUERY &&
    request.values.length === 6
  ) {
    return verifiedSubject(request, 0);
  }
  if (
    request.text === WORLD_V2_AUTHENTICATED_FINAL_RECEIPT_QUERY &&
    request.values.length === 4
  ) {
    return verifiedSubject(request, 3);
  }
  return bindingFailure(
    'only authenticated World read and receipt queries are allowed',
  );
}

/**
 * A local server-only executor for the two read handlers. It never accepts a
 * GUC or subject from HTTP: authenticated handlers attach the verified subject
 * to their own fixed query request, then this adapter sets that exact value in
 * a short PostgreSQL transaction before RLS is evaluated.
 */
export function createLocalTrustedPostgresReadExecutor(input: {
  readonly pool: Pick<Pool, 'connect'>;
}): Readonly<ParameterizedPgReadExecutor> {
  return Object.freeze({
    async query(request: ParameterizedPgReadRequest) {
      if (request.signal?.aborted) {
        bindingFailure('authenticated query was cancelled before execution');
      }
      const subject = subjectForReadRequest(request);
      const client = await input.pool.connect();
      let transactionOpen = false;
      try {
        await client.query('begin');
        transactionOpen = true;
        await client.query(
          "select set_config('request.jwt.claim.sub', $1, true)",
          [subject],
        );
        if (request.signal?.aborted) {
          bindingFailure('authenticated query was cancelled before RLS read');
        }
        const result = await client.query(request.text, [...request.values]);
        await client.query('commit');
        transactionOpen = false;
        return Object.freeze({ rows: result.rows });
      } catch (error) {
        if (transactionOpen) {
          await client.query('rollback').catch(() => undefined);
        }
        throw error;
      } finally {
        client.release();
      }
    },
  });
}

function commandScope(value: unknown): ServerBoundCommandScope | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  const keys = Object.keys(row).sort();
  if (
    keys.length !== CURRENT_SCOPE_KEYS.length ||
    keys.some((key, index) => key !== CURRENT_SCOPE_KEYS[index]) ||
    typeof row.world_id !== 'string' ||
    typeof row.country_id !== 'string' ||
    typeof row.office_id !== 'string' ||
    typeof row.capability !== 'string' ||
    typeof row.authorization_version !== 'string'
  ) {
    return null;
  }
  try {
    return Object.freeze({
      authSubject: parseSupabaseAuthSubject(row.auth_subject),
      authorizationVersion: row.authorization_version,
      capability: row.capability,
      countryId: row.country_id,
      officeId: row.office_id,
      worldId: row.world_id,
    });
  } catch {
    return null;
  }
}

/**
 * Resolves one active command scope only after the command handler has
 * cryptographically verified its caller. Multiple active scopes fail closed
 * until a capability-selection contract is introduced.
 */
export function createLocalPostgresCurrentCommandScopeReader(input: {
  readonly pool: Pick<Pool, 'query'>;
}): Readonly<CurrentCommandScopeReader> {
  return Object.freeze({
    async resolve(request: {
      readonly authSubject: SupabaseAuthSubject;
      readonly worldId: string;
      readonly signal?: AbortSignal;
    }) {
      if (request.signal?.aborted) {
        bindingFailure('command scope query was cancelled before execution');
      }
      const result = await input.pool.query(CURRENT_COMMAND_SCOPE_QUERY, [
        request.worldId,
        request.authSubject,
      ]);
      if (request.signal?.aborted || result.rows.length !== 1) return null;
      return commandScope(result.rows[0]);
    },
  });
}
