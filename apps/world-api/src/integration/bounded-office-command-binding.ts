/** Metadata-only command binding. This reads actual current authority/seat,
 * entitlement, signed opening admission and head through the fixed bounded
 * header function. It never hydrates canonical_payload or a World projection. */
import type { Pool } from 'pg';
import { parseSupabaseAuthSubject } from './identity.js';
import { createPostwarOfficeProjectionStore } from '@econmind/world-worker/postwar-office-runtime';
import { createPostgresServerReadBindingSnapshotReader } from './postgres-server-read-binding.js';
import type {
  ServerReadBindingPort,
  ServerVerifiedReadBinding,
} from './https-authenticated-read-composition.js';

export function createBoundedOfficeCommandBindingProvider(config: {
  readonly pool: Pick<Pool, 'connect'>;
  readonly readerRole: string;
  readonly authorizationPublisherRole: string;
}): Readonly<ServerReadBindingPort> {
  const snapshots = createPostgresServerReadBindingSnapshotReader(config);
  const store = createPostwarOfficeProjectionStore({
    runtimeReaderRole: config.readerRole,
    authorizationPublisherRole: config.authorizationPublisherRole,
  });
  return Object.freeze({
    async resolve(
      request: Parameters<ServerReadBindingPort['resolve']>[0],
    ): Promise<ServerVerifiedReadBinding | null> {
      if (
        request.finalSelector ||
        request.projectionSelector?.classification !== 'OFFICE_PRIVATE'
      )
        return null;
      return snapshots.withReadOnlyExecutor(request, async (tx) => {
        const headers = await store.readCurrentSeatHeadersFrom(tx, {
          worldId: request.worldId,
        });
        const matches = headers.filter(
          (h) =>
            h.scope.authSubject === request.verifiedSubject &&
            h.scope.worldId === request.worldId &&
            h.scope.scopeKey === request.projectionSelector!.scopeKey,
        );
        if (matches.length !== 1) return null;
        const h = matches[0]!,
          seed = Object.freeze({
            worldId: h.scope.worldId,
            seedRef: h.source.seedId,
            contentHash: h.source.seedFingerprint,
            admissionRef: h.source.admissionRef,
          });
        return Object.freeze({
          source: 'SERVER_VERIFIED_READ_BINDING',
          capability: 'READ_AUTHORIZED_PROJECTION_AND_FINAL',
          seatRef: h.scope.seatRef,
          seatState: 'ACTIVE',
          identity: Object.freeze({
            authSubjectId: parseSupabaseAuthSubject(h.scope.authSubject),
            worldId: h.scope.worldId,
            countryId: h.scope.countryId,
            officeId: h.scope.officeId,
            scopeKey: h.scope.scopeKey,
            classification: 'OFFICE_PRIVATE',
            authorizationRevision: h.scope.authorizationVersion,
            modelVersion: h.source.modelVersion,
            projectionVersion: 'postwar-office-runtime-read-v1',
          }),
          seed,
          readback: Object.freeze({
            ...seed,
            worldVersion: h.source.worldVersion,
            eventSequence: h.source.eventSequence,
            readbackRef: h.source.admissionRef,
          }),
        });
      });
    },
  });
}
