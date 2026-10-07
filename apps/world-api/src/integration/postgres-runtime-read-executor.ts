import type { Pool } from 'pg';
import type { ServerReadBindingPort } from './https-authenticated-read-composition.js';
import { parseSupabaseAuthSubject } from './identity.js';
import { WORLD_V2_AUTHENTICATED_FINAL_RECEIPT_QUERY } from './postgres-final-receipt-reader.js';
import {
  WORLD_V2_ENTITLED_PROJECTION_QUERY,
  type ParameterizedPgReadExecutor,
  type ParameterizedPgReadRequest,
} from './postgres-read-adapter.js';
import { createPostgresServerReadBindingSnapshotReader } from './postgres-server-read-binding.js';
import { createPersistedReadBindingConsumer } from './postgres-full-read-provider.js';
import { WorldReadFailure } from './transport.js';

/** Only the two existing authenticated handler queries; same managed read pool
 * and role as the full provider, subject-bound READ ONLY snapshots. No raw SQL
 * from HTTP, writes, SET ROLE, credentials or automatic connection startup. */
export function createPostgresRuntimeReadExecutor(input: {
  readonly pool: Pick<Pool, 'connect'>;
  readonly readerRole: string;
  readonly authorizationPublisherRole: string;
}): Readonly<ParameterizedPgReadExecutor> {
  const snapshot = createPostgresServerReadBindingSnapshotReader(input);
  const consume = createPersistedReadBindingConsumer(input);
  return Object.freeze({
    async query(request: ParameterizedPgReadRequest) {
      let binding: Parameters<ServerReadBindingPort['resolve']>[0];
      try {
        const subject = parseSupabaseAuthSubject(request.verifiedAuthSubject);
        const signal = request.signal ?? new AbortController().signal;
        if (
          request.text === WORLD_V2_ENTITLED_PROJECTION_QUERY &&
          request.values.length === 6 &&
          request.values[0] === subject
        ) {
          binding = {
            verifiedSubject: subject,
            worldId: request.values[1]!,
            projectionSelector: {
              classification: request.values[2]!,
              scopeKey: request.values[3]!,
            },
            finalSelector: null,
            signal,
          };
        } else if (
          request.text === WORLD_V2_AUTHENTICATED_FINAL_RECEIPT_QUERY &&
          request.values.length === 4 &&
          request.values[3] === subject
        ) {
          binding = {
            verifiedSubject: subject,
            worldId: request.values[0]!,
            projectionSelector: null,
            finalSelector: {
              commandId: request.values[1]!,
              idempotencyKey: request.values[2]!,
            },
            signal,
          };
        } else throw new Error('QUERY_DENIED');
      } catch {
        throw new WorldReadFailure(
          'AUTHORIZATION_DENIED',
          'Authenticated read query denied',
          false,
        );
      }
      const result = await snapshot.read(binding, async (facts, executor) => {
        if (!(await consume(binding, facts, executor))) return null;
        const result = await executor.query(request.text, request.values);
        return Object.freeze({ rows: result.rows });
      });
      return result ?? Object.freeze({ rows: [] });
    },
  });
}
