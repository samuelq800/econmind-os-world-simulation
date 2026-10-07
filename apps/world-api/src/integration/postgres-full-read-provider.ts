import type { Pool } from 'pg';
import { RuntimeReadBindingStore } from '@econmind/world-worker/runtime-read-binding-store';
import type {
  ServerReadBindingPort,
  ServerVerifiedReadBinding,
} from './https-authenticated-read-composition.js';
import {
  createPostgresServerReadBindingSnapshotReader,
  type ExistingPostgresReadBindingFacts,
  type PostgresBindingSnapshotExecutor,
} from './postgres-server-read-binding.js';

/** Actual read-only provider; no grant, admission writer, pool creation or startup.
 * The independently reviewed A store rehydrates its persisted references inside
 * the same subject-bound snapshot as current entitlement, seed and World head.
 * Missing/withheld admission stays disconnected; bootstrap is never admission.
 */
export function createPostgresServerReadBindingProvider(input: {
  readonly pool: Pick<Pool, 'connect'>;
  readonly readerRole: string;
  readonly authorizationPublisherRole: string;
}): Readonly<ServerReadBindingPort> {
  const snapshot = createPostgresServerReadBindingSnapshotReader(input);
  const consume = createPersistedReadBindingConsumer(input);
  return Object.freeze({
    resolve: (request: Parameters<ServerReadBindingPort['resolve']>[0]) =>
      snapshot.read(request, (facts, executor) =>
        consume(request, facts, executor),
      ),
  });
}

/** Shared server-only hydration for the provider and its payload query executor.
 * Consume only from the subject-bound read-only snapshot runner; not a grant. */
export function createPersistedReadBindingConsumer(input: {
  readonly readerRole: string;
  readonly authorizationPublisherRole: string;
}) {
  // Only read*From methods are used. No standalone query/transaction can escape
  // the verified-subject snapshot, and the store's write method is not exposed.
  const unavailable = async (): Promise<never> => {
    throw new Error('RUNTIME_BINDING_REQUIRES_VERIFIED_READ_TRANSACTION');
  };
  const database: ConstructorParameters<
    typeof RuntimeReadBindingStore
  >[0]['database'] = {
    query: unavailable,
    transaction: unavailable,
  };
  const references = new RuntimeReadBindingStore({
    database,
    authorizationPublisherRole: input.authorizationPublisherRole,
    runtimeReaderRole: input.readerRole,
  });
  return async (
    request: Parameters<ServerReadBindingPort['resolve']>[0],
    facts: Readonly<ExistingPostgresReadBindingFacts>,
    executor: PostgresBindingSnapshotExecutor,
  ): Promise<ServerVerifiedReadBinding | null> => {
    const seat = await references.readCurrentSeatFrom({
      executor,
      verifiedSubject: request.verifiedSubject,
      worldId: facts.scope.worldId,
      countryId: facts.scope.countryId,
      officeId: facts.scope.officeId,
    });
    if (
      !seat ||
      seat.authorizationRevision !== facts.scope.authorizationRevision
    )
      return null;
    const admission = await references.readImmutableAdmissionFrom({
      executor,
      verifiedSubject: request.verifiedSubject,
      worldId: facts.scope.worldId,
    });
    if (
      !admission ||
      admission.seedRef !== facts.opening.seedId ||
      admission.contentHash !== facts.opening.seedFingerprint ||
      admission.modelVersion !== facts.opening.modelVersion
    )
      return null;
    const seed = Object.freeze({
      worldId: admission.worldId,
      seedRef: admission.seedRef,
      contentHash: admission.contentHash,
      admissionRef: admission.admissionRef,
    });
    const binding: ServerVerifiedReadBinding = {
      source: 'SERVER_VERIFIED_READ_BINDING',
      capability: 'READ_AUTHORIZED_PROJECTION_AND_FINAL',
      seatRef: seat.seatRef,
      seatState: 'ACTIVE',
      identity: Object.freeze({
        authSubjectId: facts.scope.authSubject,
        worldId: facts.scope.worldId,
        countryId: facts.scope.countryId,
        officeId: facts.scope.officeId,
        scopeKey: facts.scope.scopeKey,
        classification: facts.scope.classification,
        authorizationRevision: seat.authorizationRevision,
        modelVersion: admission.modelVersion,
        projectionVersion: facts.scope.projectionSchemaVersion,
      }),
      seed,
      readback: Object.freeze({
        ...seed,
        ...facts.head,
        // Persistent admission anchor re-read here, not an invented receipt.
        // It does not attest a deployment, independent review or Clock state.
        readbackRef: admission.admissionRef,
      }),
    };
    return Object.freeze(binding);
  };
}
