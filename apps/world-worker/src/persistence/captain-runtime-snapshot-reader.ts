/** Standalone Captain read/commit-protection adapter; not registered in production.
 * Requires a real external issuer/custodian. It issues data preparations only. */
import { createHash } from 'node:crypto';
import {
  CAPTAIN_POLITICAL_CAPITAL_EVENT,
  DOMAIN_ERROR_CODES,
  DomainError,
  assertWorldWriterCanCommit,
  canonicalSerialize,
  captainPoliticalCapitalSourceHash,
  createFoundationFact,
  createWorldWriterCommitAssertion,
  parseCaptainPoliticalCapitalAllocation,
  prepareCaptainPoliticalCapitalEvent,
  replayCaptainPoliticalCapitalAllocation,
  validateCanonicalCommand,
  type CanonicalCommand,
  type CaptainPoliticalCapitalReplayState,
  type CaptainPoliticalCapitalSourceSnapshot,
  type FoundationTraceRequest,
} from '@econmind/core';
import {
  CaptainPoliticalCapitalSourceMissing,
  type CaptainPoliticalCapitalRuntimeReader,
  type CaptainPoliticalCapitalRuntimeReadRequest,
  type CaptainPoliticalCapitalSourceRead,
} from './captain-political-capital-candidate-source.js';
import type {
  CaptainOperatingGenesisV1,
  CaptainOperatingOriginal,
  CaptainOperatingReasonV1,
  CaptainOperatingSourceCustodyPort,
} from './captain-operating-source-custody.js';
import { DurableV08LedgerLineageReader } from './durable-v08-ledger-lineage-reader.js';
import {
  readValidatedCanonicalLineageFrom,
  withValidatedCanonicalLineageFrom,
} from './validated-canonical-lineage.js';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';
import type {
  OfficeOperatingSourceBinding,
  OfficeOperatingSourceCustodyScope,
} from './office-operating-source-commit-protection.js';

const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
function invalid(reason: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    `Captain custody: ${reason}`,
  );
}
function inert<T>(value: T): T {
  const copy = JSON.parse(canonicalSerialize(value)) as T;
  const freeze = (v: unknown): void => {
    if (v && typeof v === 'object') {
      Object.values(v).forEach(freeze);
      Object.freeze(v);
    }
  };
  freeze(copy);
  return copy;
}
function keys(
  value: unknown,
  expected: readonly string[],
): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join('|') !== [...expected].sort().join('|')
  )
    invalid('missing/unknown fields');
}
function timestamp(value: string): void {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    invalid('canonical observation time required');
}
function original<T>(
  raw: CaptainOperatingOriginal,
  mode: string,
  simTime: string,
): T {
  const value = inert(raw);
  keys(value, [
    'recordId',
    'revision',
    'factRef',
    'sourceRef',
    'predecessorFactRefs',
    'issuerRef',
    'custodianRef',
    'admissionRef',
    'admissionRevision',
    'sourceClass',
    'effectiveFromSimTime',
    'effectiveUntilSimTime',
    'revokedByRevision',
    'canonicalPayload',
    'payloadSHA256',
  ]);
  for (const field of [
    'recordId',
    'revision',
    'factRef',
    'sourceRef',
    'issuerRef',
    'custodianRef',
    'admissionRef',
    'admissionRevision',
  ] as const)
    if (
      typeof value[field] !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value[field])
    )
      invalid('explicit original/issuer/admission references required');
  if (
    !Array.isArray(value.predecessorFactRefs) ||
    !value.predecessorFactRefs.length ||
    value.predecessorFactRefs.some(
      (ref) =>
        typeof ref !== 'string' ||
        !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(ref),
    )
  )
    invalid('explicit original predecessor references required');
  if (
    !['ADMITTED_ORIGINAL', 'TEST_ONLY'].includes(value.sourceClass) ||
    (mode === 'OFFICIAL_RUNTIME' && value.sourceClass !== 'ADMITTED_ORIGINAL')
  )
    invalid('original source class refused');
  const tick = (v: string): bigint => {
    if (typeof v !== 'string' || !/^(?:0|[1-9]\d{0,18})$/u.test(v))
      invalid('canonical effective time required');
    return BigInt(v);
  };
  if (
    value.revokedByRevision !== null ||
    tick(value.effectiveFromSimTime) > tick(simTime) ||
    (value.effectiveUntilSimTime !== null &&
      tick(simTime) >= tick(value.effectiveUntilSimTime))
  )
    invalid('revoked/not-effective original');
  if (
    typeof value.canonicalPayload !== 'string' ||
    Buffer.byteLength(value.canonicalPayload) > 1_048_576 ||
    !/^[a-f0-9]{64}$/u.test(value.payloadSHA256) ||
    digest(value.canonicalPayload) !== value.payloadSHA256
  )
    invalid('original bytes/hash mismatch');
  const payload = JSON.parse(value.canonicalPayload) as T;
  if (canonicalSerialize(payload) !== value.canonicalPayload)
    invalid('original payload must be canonical with unique keys');
  return inert(payload);
}

function sourceBindingFor(
  originals: {
    genesis: CaptainOperatingOriginal;
    reason: CaptainOperatingOriginal;
  },
  world: string,
  country: string,
): Readonly<OfficeOperatingSourceBinding> {
  return Object.freeze({
    sourceId: `CAPTAIN_${digest(canonicalSerialize({ worldId: world, countryId: country }))}`,
    sourceRevision: `REV_${digest(canonicalSerialize([originals.genesis.revision, originals.reason.revision]))}`,
    currentnessRevision: `CURRENT_${digest(canonicalSerialize([originals.genesis.admissionRef, originals.genesis.admissionRevision, originals.reason.admissionRef, originals.reason.admissionRevision]))}`,
    contentHash:
      `sha256:${digest(canonicalSerialize({ kind: 'ORIGINALS', genesis: originals.genesis, reason: originals.reason }))}` as const,
  });
}

declare const captainPreparation: unique symbol;
/** Identity/lifetime association only. Never source admission or commit authority. */
export interface CaptainOperatingPreparation {
  readonly [captainPreparation]: true;
  readonly sourceRead: CaptainPoliticalCapitalSourceRead;
  /** Currentness comparison data only, never admission/commit proof. */
  readonly sourceBinding: Readonly<OfficeOperatingSourceBinding> | null;
}

export function createCaptainRuntimeSnapshotReader(input: {
  readonly mode: 'TEST_ONLY_LOCAL' | 'OFFICIAL_RUNTIME';
  readonly database: SqlDatabase;
  readonly workerId: string;
  readonly custody: CaptainOperatingSourceCustodyPort;
}) {
  if (
    !['TEST_ONLY_LOCAL', 'OFFICIAL_RUNTIME'].includes(input.mode) ||
    typeof input.workerId !== 'string' ||
    !/^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u.test(input.workerId) ||
    !input.custody ||
    typeof input.custody.withProtectedAdmittedOriginalsFrom !== 'function'
  )
    invalid('explicit server mode and real custody dependency required');
  const mode = input.mode,
    workerId = input.workerId,
    database = input.database,
    custody = input.custody;
  const withOriginals =
    custody.withProtectedAdmittedOriginalsFrom.bind(custody);
  const lineageReader = new DurableV08LedgerLineageReader({
    database,
    sha256Hex: digest,
  });
  const issued = new WeakMap<
    object,
    {
      command: CanonicalCommand;
      observedAtReal: string;
      originals: string;
      read: string;
      fence: string;
    }
  >();
  type Resolved = {
    sourceRead: CaptainPoliticalCapitalSourceRead;
    originals: string;
    sourceBinding: Readonly<OfficeOperatingSourceBinding> | null;
  };
  const assertDurableCommandFrom = async (
    executor: SqlExecutor,
    command: CanonicalCommand,
  ) => {
    const durable = await lineageReader.readCommandFrom(
      executor,
      command.worldId,
      command.commandId,
    );
    if (canonicalSerialize(durable) !== canonicalSerialize(command))
      invalid('durable canonical command mismatch');
  };
  const resolveFrom = async <Result>(
    executor: SqlExecutor,
    supplied: CanonicalCommand,
    observedAtReal: string,
    consume: (value: Resolved) => Promise<Result>,
  ): Promise<Result> => {
    timestamp(observedAtReal);
    const command = validateCanonicalCommand(supplied, digest);
    const terms = parseCaptainPoliticalCapitalAllocation(command, digest);
    return withOriginals(
      executor,
      Object.freeze({
        purpose: 'CAPTAIN_OPERATING_SOURCE_READ_V1',
        command,
        observedAtReal,
      }),
      async (suppliedOriginals) => {
        if (suppliedOriginals.kind === 'MISSING') {
          const allowed = [
            'CURRENT_WORLD_HEAD',
            'POLITICAL_CAPITAL_EVENT_LINEAGE',
            'REASON_RECORD',
            'WRITER_LEASE',
          ];
          if (
            !Array.isArray(suppliedOriginals.missing) ||
            !suppliedOriginals.missing.length ||
            suppliedOriginals.missing.some((v) => !allowed.includes(v))
          )
            invalid('exact missing source gaps required');
          return consume({
            sourceRead: inert({
              kind: 'MISSING' as const,
              missing: suppliedOriginals.missing,
            }),
            originals: '',
            sourceBinding: null,
          });
        }
        if (suppliedOriginals.kind !== 'ORIGINALS')
          invalid('unsupported custody result');
        // Capture raw original bytes/revisions before awaiting further reads.
        const captured = inert({
          kind: suppliedOriginals.kind,
          genesis: suppliedOriginals.genesis,
          reason: suppliedOriginals.reason,
        });
        const genesis = original<CaptainOperatingGenesisV1>(
          captured.genesis,
          mode,
          command.simTime.toCanonicalValue(),
        );
        const reason = original<CaptainOperatingReasonV1>(
          captured.reason,
          mode,
          command.simTime.toCanonicalValue(),
        );
        keys(genesis, [
          'schemaVersion',
          'worldId',
          'countryId',
          'seedId',
          'seedFingerprint',
          'semanticRevision',
          'capital',
        ]);
        keys(reason, ['schemaVersion', 'worldId', 'countryId', 'reason']);
        if (
          genesis.schemaVersion !== 'captain-operating-genesis-v1' ||
          reason.schemaVersion !== 'captain-operating-reason-v1' ||
          genesis.worldId !== command.worldId ||
          reason.worldId !== command.worldId ||
          genesis.countryId !== command.countryId ||
          reason.countryId !== command.countryId ||
          captured.reason.factRef !== terms.reasonFactRef ||
          typeof genesis.semanticRevision !== 'string' ||
          !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(genesis.semanticRevision)
        )
          invalid('original scope/reason/semantics mismatch');
        const lease = suppliedOriginals.lease;
        const assertion = createWorldWriterCommitAssertion(
          lease,
          command.expectedWorldVersion!,
        );
        assertWorldWriterCanCommit(
          lease,
          assertion,
          observedAtReal,
          command.expectedWorldVersion!,
        );
        if (
          lease.worldId !== command.worldId ||
          lease.holderId !== workerId ||
          lease.renewedAtReal > observedAtReal
        )
          invalid('lease world/observation mismatch');
        return withValidatedCanonicalLineageFrom(
          { reader: lineageReader, executor, worldId: command.worldId },
          async (view) => {
            const lineage = readValidatedCanonicalLineageFrom(executor, view);
            if (
              lineage.seed.seedId !== genesis.seedId ||
              lineage.seed.fingerprint !== genesis.seedFingerprint ||
              lineage.headWorldVersion !== command.expectedWorldVersion
            )
              invalid(
                'admitted genesis/current head differs from canonical lineage',
              );
            let state: CaptainPoliticalCapitalReplayState = {
              worldId: command.worldId,
              countryId: command.countryId,
              worldVersion: '0',
              lastEventSequence: '0',
              capital: genesis.capital,
              applied: [],
            };
            let predecessorSnapshotHash: string | null = null;
            const eventRefs: string[] = [];
            // Deliberately bounded taxonomy: unknown or other-country effects deny.
            // A future reviewed shared taxonomy may classify inert sibling events.
            for (const transition of lineage.transitions)
              for (const event of transition.transition.events) {
                if (
                  event.eventType !== CAPTAIN_POLITICAL_CAPITAL_EVENT ||
                  event.simTime.ticks > command.simTime.ticks
                )
                  invalid('unsupported/future canonical history effect');
                state = replayCaptainPoliticalCapitalAllocation({
                  state,
                  event,
                  sha256Hex: digest,
                });
                predecessorSnapshotHash = (
                  JSON.parse(event.canonicalPayload) as {
                    source: CaptainPoliticalCapitalSourceSnapshot;
                  }
                ).source.trace.snapshot.snapshotHash;
                eventRefs.push(event.eventId);
              }
            if (
              state.worldVersion !== lineage.headWorldVersion ||
              state.lastEventSequence !== lineage.headEventSequence
            )
              invalid(
                'domain replay cursor does not reach complete canonical head',
              );
            const identity = digest(
              canonicalSerialize({
                commandId: command.commandId,
                fingerprint: command.fingerprint,
              }),
            ).slice(0, 32);
            const trace: FoundationTraceRequest = {
              traceRef: `TRACE_CAPTAIN_${identity}`,
              calculationVersion: genesis.semanticRevision,
              snapshot: {
                lineageRef: command.worldId,
                sourceVersion: `WORLD_VERSION_${lineage.headWorldVersion}`,
                snapshotRef: `CAPTAIN_SNAPSHOT_${identity}`,
                snapshotHash: '0'.repeat(64),
                predecessorSnapshotHash,
              },
              snapshotAt: {
                amount: command.simTime.toCanonicalValue(),
                unit: 'sim_millisecond',
              },
            };
            const facts = (t: FoundationTraceRequest) => ({
              capitalFact: createFoundationFact({
                trace: t,
                factRef: `CAPTAIN_REPLAY_${identity}`,
                sourceRef: captured.genesis.sourceRef,
                predecessorFactRefs: [captured.genesis.factRef, ...eventRefs],
                payload: state.capital,
              }),
              reasonFact: createFoundationFact({
                trace: t,
                factRef: captured.reason.factRef,
                sourceRef: captured.reason.sourceRef,
                predecessorFactRefs: captured.reason.predecessorFactRefs,
                payload: reason.reason,
              }),
            });
            const scope = {
              worldId: command.worldId,
              countryId: command.countryId,
              worldVersion: lineage.headWorldVersion,
              lastEventSequence: lineage.headEventSequence,
            };
            const boundTrace = {
              ...trace,
              snapshot: {
                ...trace.snapshot,
                snapshotHash: captainPoliticalCapitalSourceHash(
                  { ...scope, ...facts(trace) },
                  digest,
                ),
              },
            };
            const snapshot = inert({
              ...scope,
              trace: boundTrace,
              ...facts(boundTrace),
            });
            // Existing kernel validates all quantities, conservation and actual reason.
            prepareCaptainPoliticalCapitalEvent({
              command,
              source: snapshot,
              eventId: `CAPTAIN_VALIDATE_${identity.toUpperCase()}`,
              recordedAtReal: observedAtReal,
              sha256Hex: digest,
            });
            return consume({
              sourceRead: Object.freeze({
                kind: 'READ' as const,
                snapshot,
                lease,
              }),
              originals: canonicalSerialize(captured),
              sourceBinding: sourceBindingFor(
                captured,
                command.worldId,
                command.countryId,
              ),
            });
          },
        );
      },
    );
  };
  const prepareFrom = async (
    executor: SqlExecutor,
    command: CanonicalCommand,
    observedAtReal: string,
  ): Promise<CaptainOperatingPreparation> => {
    timestamp(observedAtReal);
    const validated = validateCanonicalCommand(command, digest);
    await assertDurableCommandFrom(executor, validated);
    const resolved = await resolveFrom(
      executor,
      validated,
      observedAtReal,
      async (value) => value,
    );
    const preparation = Object.freeze({
      sourceRead: resolved.sourceRead,
      sourceBinding: resolved.sourceBinding,
    }) as CaptainOperatingPreparation;
    if (resolved.sourceRead.kind === 'READ')
      issued.set(preparation, {
        command: validated,
        observedAtReal,
        originals: resolved.originals,
        read: canonicalSerialize(resolved.sourceRead.snapshot),
        fence: resolved.sourceRead.lease.fencingToken,
      });
    return preparation;
  };
  const captureRequest = (
    request: Readonly<CaptainPoliticalCapitalRuntimeReadRequest>,
  ) => {
    const copied = inert(request);
    keys(copied, [
      'worldId',
      'countryId',
      'commandId',
      'commandFingerprint',
      'expectedWorldVersion',
      'simTime',
      'reasonFactRef',
      'observedAtReal',
    ]);
    timestamp(copied.observedAtReal);
    return copied;
  };
  const assertRequestMatchesCommand = (
    copied: Readonly<CaptainPoliticalCapitalRuntimeReadRequest>,
    command: CanonicalCommand,
  ) => {
    const terms = parseCaptainPoliticalCapitalAllocation(command, digest);
    if (
      command.worldId !== copied.worldId ||
      command.commandId !== copied.commandId ||
      command.countryId !== copied.countryId ||
      command.fingerprint !== copied.commandFingerprint ||
      command.expectedWorldVersion !== copied.expectedWorldVersion ||
      command.simTime.toCanonicalValue() !== copied.simTime ||
      terms.reasonFactRef !== copied.reasonFactRef
    )
      invalid(
        'request differs from actual durable command or supplied server canonical intent',
      );
  };
  const reader: CaptainPoliticalCapitalRuntimeReader = Object.freeze({
    async read(request: Readonly<CaptainPoliticalCapitalRuntimeReadRequest>) {
      const copied = captureRequest(request);
      return database.transaction(async (executor) => {
        const command = await lineageReader.readCommandFrom(
          executor,
          copied.worldId,
          copied.commandId,
        );
        assertRequestMatchesCommand(copied, command);
        return (await prepareFrom(executor, command, copied.observedAtReal))
          .sourceRead;
      });
    },
    async readCanonical(
      request: Readonly<CaptainPoliticalCapitalRuntimeReadRequest>,
      supplied: Readonly<CanonicalCommand>,
    ) {
      // Prospective read only. Do not mint a commit preparation or require the
      // not-yet-submitted command to exist. Full committed history, genuine
      // originals, admission/effectiveness and lease checks remain unchanged.
      const copied = captureRequest(request);
      const command = validateCanonicalCommand(supplied, digest);
      assertRequestMatchesCommand(copied, command);
      return database.transaction((executor) =>
        resolveFrom(
          executor,
          command,
          copied.observedAtReal,
          async (resolved) => resolved.sourceRead,
        ),
      );
    },
  });
  return Object.freeze({
    reader,
    prepareFrom,
    /** Caller must already own existing submission/lease/head locks and await this
     * whole method in its OUTER commit transaction. The custody port must retain
     * cooperating SQL guards through COMMIT. Existing atomic repo does NOT yet
     * invoke this Captain-specific adapter: no runtime-ready claim is issued. */
    async withCommitProtectionFrom<Result>(
      executor: SqlExecutor,
      preparation: CaptainOperatingPreparation,
      observedAtReal: string,
      consume: (
        source: Extract<CaptainPoliticalCapitalSourceRead, { kind: 'READ' }>,
        currentness: Readonly<OfficeOperatingSourceCustodyScope>,
      ) => Promise<Result>,
    ): Promise<Result> {
      const bound = issued.get(preparation);
      if (!bound) invalid('forged/missing preparation');
      timestamp(observedAtReal);
      if (observedAtReal < bound.observedAtReal)
        invalid('commit observation precedes preparation');
      issued.delete(preparation);
      await assertDurableCommandFrom(executor, bound.command);
      return resolveFrom(
        executor,
        bound.command,
        observedAtReal,
        async (current) => {
          if (current.sourceRead.kind === 'MISSING')
            throw new CaptainPoliticalCapitalSourceMissing(
              current.sourceRead.missing,
            );
          if (
            current.originals !== bound.originals ||
            canonicalSerialize(current.sourceRead.snapshot) !== bound.read ||
            current.sourceRead.lease.fencingToken !== bound.fence
          )
            invalid(
              'source/admission changed after preparation, including at the same head',
            );
          if (!current.sourceBinding) invalid('missing current source binding');
          let active = true;
          const currentness: Readonly<OfficeOperatingSourceCustodyScope> =
            Object.freeze({
              executor,
              binding: current.sourceBinding,
              async readCurrentBinding() {
                if (!active) invalid('currentness scope expired');
                // Re-read original/admission revisions only. Do not read H/history
                // after the legitimate consumer may have advanced the World head.
                return withOriginals(
                  executor,
                  Object.freeze({
                    purpose: 'CAPTAIN_OPERATING_SOURCE_READ_V1',
                    command: bound.command,
                    observedAtReal,
                  }),
                  async (raw) => {
                    if (!active) invalid('currentness scope expired');
                    if (raw.kind === 'MISSING') return null;
                    if (raw.kind !== 'ORIGINALS')
                      invalid('unsupported custody result');
                    const originals = inert({
                      genesis: raw.genesis,
                      reason: raw.reason,
                    });
                    original<CaptainOperatingGenesisV1>(
                      originals.genesis,
                      mode,
                      bound.command.simTime.toCanonicalValue(),
                    );
                    original<CaptainOperatingReasonV1>(
                      originals.reason,
                      mode,
                      bound.command.simTime.toCanonicalValue(),
                    );
                    return sourceBindingFor(
                      originals,
                      bound.command.worldId,
                      bound.command.countryId,
                    );
                  },
                );
              },
            });
          try {
            const result = await consume(current.sourceRead, currentness);
            if (
              canonicalSerialize(await currentness.readCurrentBinding()) !==
              canonicalSerialize(currentness.binding)
            )
              invalid('source/admission changed during protected consumer');
            return result;
          } finally {
            active = false;
          }
        },
      );
    },
  });
}
