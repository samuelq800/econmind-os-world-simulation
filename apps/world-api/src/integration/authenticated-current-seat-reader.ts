import type { Pool } from 'pg';
import type { ServerReadBindingPort } from './https-authenticated-read-composition.js';
import type { PostgresBindingSnapshotExecutor } from './postgres-server-read-binding.js';
import { createPostgresServerReadBindingSnapshotReader } from './postgres-server-read-binding.js';
export class CurrentSeatReadError extends Error {
  constructor(
    readonly code:
      | 'CURRENT_SEAT_REQUIRED'
      | 'CURRENT_AUTHORIZATION_NOT_COHERENT'
      | 'READ_BINDING_UNAVAILABLE'
      | 'NOT_CONNECTED',
  ) {
    super(code);
  }
}
/** Fixed enumeration includes all active authorities, even those lacking a seat
 * or entitlement. Missing rows cannot disappear through an inner join. */
export async function enumerateCurrentSeatSelectors(
  executor: PostgresBindingSnapshotExecutor,
  subject: string,
  world: string,
) {
  const result = await executor.query<{
    country_id: string;
    office_id: string;
    team_id: string;
    authorization_version: string;
  }>(
    'select distinct country_id,office_id,team_id,authorization_version from world_v2.current_commit_authorization where world_id=$1 and auth_subject=$2::uuid and active order by country_id,office_id,team_id,authorization_version limit 7',
    [world, subject],
  );
  if (!result.rows.length)
    throw new CurrentSeatReadError('CURRENT_SEAT_REQUIRED');
  const first = result.rows[0]!;
  const offices = new Set<string>();
  for (const r of result.rows) {
    if (
      result.rows.length > 6 ||
      !/^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u.test(r.country_id) ||
      !/^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u.test(r.team_id) ||
      !r.authorization_version ||
      r.authorization_version.length > 256 ||
      ![
        'CAPTAIN',
        'FINANCE',
        'CENTRAL_BANK',
        'INDUSTRY',
        'TRADE',
        'SOCIAL',
      ].includes(r.office_id) ||
      r.country_id !== first.country_id ||
      r.team_id !== first.team_id ||
      r.authorization_version !== first.authorization_version ||
      offices.has(r.office_id)
    )
      throw new CurrentSeatReadError('CURRENT_AUTHORIZATION_NOT_COHERENT');
    offices.add(r.office_id);
  }
  return result.rows
    .map((r) => ({
      classification: 'OFFICE_PRIVATE' as const,
      scopeKey:
        'OFFICE_' +
        Buffer.from(r.country_id).toString('hex').toUpperCase() +
        '_' +
        Buffer.from(r.office_id).toString('hex').toUpperCase(),
    }))
    .sort((a, b) => a.scopeKey.localeCompare(b.scopeKey));
}
export function createAuthenticatedCurrentSeatReader(input: {
  pool: Pick<Pool, 'connect'>;
  readerRole: string;
  authorizationPublisherRole: string;
}) {
  const snapshot = createPostgresServerReadBindingSnapshotReader(input);
  return Object.freeze({
    read: (
      request: Pick<
        Parameters<ServerReadBindingPort['resolve']>[0],
        'verifiedSubject' | 'worldId' | 'signal'
      >,
    ) => snapshot.readCurrentSeats(request, input.authorizationPublisherRole),
  });
}
