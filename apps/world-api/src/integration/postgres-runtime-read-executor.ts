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
import { TRADE_CONTRACT_RUNTIME_READ_QUERY } from '../read-models/trade-contract-runtime-reader.js';

function validTradeParameters(
  values: readonly string[],
  subject: string,
): boolean {
  if (
    !Array.isArray(values) ||
    values.length !== 12 ||
    values.some((value) => typeof value !== 'string')
  )
    return false;
  const id = (value: string) =>
    value.length <= 256 && /^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u.test(value);
  const version = (value: string) =>
    value.length <= 19 &&
    /^(?:0|[1-9]\d*)$/u.test(value) &&
    BigInt(value) <= 9223372036854775807n;
  const [
    world,
    authSubject,
    country,
    team,
    revision,
    classification,
    scope,
    limit,
    head,
    eventSequence,
    after,
    command,
  ] = values as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  return (
    authSubject === subject &&
    [world, country, team, scope].every(id) &&
    revision.length > 0 &&
    revision.length <= 256 &&
    revision.trim() === revision &&
    classification === 'OFFICE_PRIVATE' &&
    scope ===
      `OFFICE_${Buffer.from(country).toString('hex').toUpperCase()}_5452414445` &&
    /^[1-9]\d{0,2}$/u.test(limit) &&
    Number(limit) >= 2 &&
    Number(limit) <= 101 &&
    ((head === '' && eventSequence === '' && after === '' && command === '') ||
      (version(head) &&
        version(eventSequence) &&
        version(after) &&
        BigInt(after) > 0n &&
        BigInt(after) <= BigInt(head) &&
        id(command)))
  );
}

/** Only the existing two queries plus exact own-Trade evidence SQL; same managed read pool
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
        } else if (
          request.text === TRADE_CONTRACT_RUNTIME_READ_QUERY &&
          validTradeParameters(request.values, subject)
        ) {
          binding = {
            verifiedSubject: subject,
            worldId: request.values[0]!,
            projectionSelector: {
              classification: 'OFFICE_PRIVATE',
              scopeKey: request.values[6]!,
            },
            finalSelector: null,
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
        const verified = await consume(binding, facts, executor);
        if (!verified) return null;
        if (
          request.text === TRADE_CONTRACT_RUNTIME_READ_QUERY &&
          (verified.identity.officeId !== 'TRADE' ||
            verified.identity.worldId !== request.values[0] ||
            verified.identity.authSubjectId !== request.values[1] ||
            verified.identity.countryId !== request.values[2] ||
            verified.identity.authorizationRevision !== request.values[4] ||
            verified.identity.classification !== 'OFFICE_PRIVATE' ||
            verified.identity.scopeKey !== request.values[6])
        )
          return null;
        const result = await executor.query(request.text, request.values);
        return Object.freeze({
          rows: result.rows,
          ...(request.text === WORLD_V2_ENTITLED_PROJECTION_QUERY
            ? {
                verifiedProjectionAuthority: Object.freeze({
                  authSubject: verified.identity.authSubjectId,
                  worldId: verified.identity.worldId,
                  classification: verified.identity.classification,
                  scopeKey: verified.identity.scopeKey,
                  seedRef: verified.seed.seedRef,
                  contentHash: verified.seed.contentHash,
                  worldVersion: facts.head.worldVersion,
                  eventSequence: facts.head.eventSequence,
                }),
              }
            : {}),
        });
      });
      return result ?? Object.freeze({ rows: [] });
    },
  });
}
