import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CAPTAIN_POLITICAL_CAPITAL_COMMAND,
  CAPTAIN_POLITICAL_CAPITAL_PAYLOAD_SCHEMA,
  COMMAND_SCHEMA_VERSION,
  CURRENT_REPLAY_BINDING,
  OPENING_SEED_SCHEMA_VERSION,
  OPENING_SOURCE_SCHEMA_VERSION,
  POLITICAL_CAPITAL_BUCKETS,
  canonicalSerialize,
  createAuthoritativeTransition,
  createFinalCommandReceipt,
  parseAuthoritativeEvent,
  createOpeningSeed,
  createOpeningSource,
  openingSeedId,
  openingSourceId,
  parseCanonicalCommand,
  parseWorldWriterLease,
  prepareCaptainPoliticalCapitalEvent,
  worldId,
} from '@econmind/core';
import {
  createCaptainRuntimeSnapshotReader,
  type CaptainOperatingPreparation,
} from '../../apps/world-worker/src/persistence/captain-runtime-snapshot-reader.js';
import type {
  CaptainOperatingOriginal,
  CaptainOperatingOriginalsRead,
  CaptainOperatingSourceCustodyPort,
} from '../../apps/world-worker/src/persistence/captain-operating-source-custody.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';
import { createCaptainPoliticalCapitalRuntimeSource } from '../../apps/world-worker/src/persistence/captain-political-capital-candidate-source.js';
import {
  createManualOfficeIntakeRuntime,
  preflightManualOfficeIntakeRuntime,
} from '../../apps/world-worker/src/intake/manual-office-intake-runtime.js';

// Explicit TEST_ONLY SQL protocol and custody fixture. The real canonical reader
// and Core run; this is not native locking, original admission or production proof.
const digest = (v: string) => createHash('sha256').update(v).digest('hex');
const WORLD = 'WORLD_CAPTAIN_CUSTODY_TEST';
const COUNTRY = 'COUNTRY_01';
const WORKER = 'WORKER_CAPTAIN_CUSTODY_TEST';
const NOW = '2026-10-28T12:00:00.000Z';
const q = (amount: string) => ({ amount, unit: 'political_capital' });
type Row = Record<string, unknown>;
function fixture() {
  const source = createOpeningSource(
    {
      schemaVersion: OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: openingSourceId('SOURCE_CAPTAIN_TEST_ONLY'),
      sourceKind: 'AUTHORITATIVE_DATASET',
      locator: 'fixture://TEST_ONLY_NOT_ADMISSION',
      sourceVersion: 'TEST_ONLY_V1',
      payload: { fixture: true },
    },
    digest,
  );
  const seed = createOpeningSeed(
    {
      schemaVersion: OPENING_SEED_SCHEMA_VERSION,
      seedId: openingSeedId('SEED_CAPTAIN_TEST_ONLY'),
      worldId: worldId(WORLD),
      openingWorldVersion: '0',
      replayBinding: CURRENT_REPLAY_BINDING,
      sources: [source],
      inventoryEntries: [],
      financialBatches: [],
    },
    digest,
  );
  const { fingerprint: _fingerprint, ...seedIntent } = seed;
  void _fingerprint;
  let command = parseCanonicalCommand(
    {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      commandId: 'COMMAND_CAPTAIN_CUSTODY_TEST',
      commandType: CAPTAIN_POLITICAL_CAPITAL_COMMAND,
      actorId: 'ACTOR_CAPTAIN_CUSTODY_TEST',
      authSubject: '11111111-1111-4111-8111-111111111111',
      correlationId: 'CORRELATION_CAPTAIN_TEST',
      worldId: WORLD,
      countryId: COUNTRY,
      officeId: 'CAPTAIN',
      expectedWorldVersion: '0',
      idempotencyKey: 'IDEM_CAPTAIN_TEST',
      simTime: '1000',
      submittedAtReal: NOW,
      payload: {
        schemaVersion: CAPTAIN_POLITICAL_CAPITAL_PAYLOAD_SCHEMA,
        fromBucket: 'FISCAL_REFORM',
        toBucket: 'INDUSTRIAL_STRATEGY',
        amount: q('2'),
        reasonFactRef: 'REASON_CAPTAIN_TEST',
      },
    },
    digest,
  );
  const capital = {
    capitalRef: 'CAPITAL_TEST_ONLY',
    countryRef: COUNTRY,
    opening: q('42'),
    generated: q('0'),
    total: q('42'),
    available: q('42'),
    spent: q('0'),
    closing: q('42'),
    buckets: POLITICAL_CAPITAL_BUCKETS.map((bucket) => ({
      bucket,
      balance: q('6'),
    })),
  };
  function record(id: string, payload: unknown): CaptainOperatingOriginal {
    const canonicalPayload = canonicalSerialize(payload);
    return {
      recordId: id,
      revision: 'REV_1',
      factRef: id,
      sourceRef: 'SOURCE_CAPTAIN_TEST_ONLY',
      predecessorFactRefs: ['TEST_ONLY_ORIGINAL_PREDECESSOR'],
      issuerRef: 'ISSUER_TEST_ONLY',
      custodianRef: 'CUSTODIAN_TEST_ONLY',
      admissionRef: 'ADMISSION_TEST_ONLY',
      admissionRevision: 'ADMISSION_REV_1',
      sourceClass: 'TEST_ONLY',
      effectiveFromSimTime: '0',
      effectiveUntilSimTime: null,
      revokedByRevision: null,
      canonicalPayload,
      payloadSHA256: digest(canonicalPayload),
    };
  }
  let originals: CaptainOperatingOriginalsRead = {
    kind: 'ORIGINALS',
    genesis: record('GENESIS_CAPTAIN_TEST', {
      schemaVersion: 'captain-operating-genesis-v1',
      worldId: WORLD,
      countryId: COUNTRY,
      seedId: seed.seedId,
      seedFingerprint: seed.fingerprint,
      semanticRevision: 'CAPTAIN_TEST_ONLY_V1',
      capital,
    }),
    reason: record('REASON_CAPTAIN_TEST', {
      schemaVersion: 'captain-operating-reason-v1',
      worldId: WORLD,
      countryId: COUNTRY,
      reason: {
        countryRef: COUNTRY,
        recordRef: 'CABINET_TEST_ONLY',
        reason: 'Explicit TEST_ONLY cabinet record.',
      },
    }),
    lease: parseWorldWriterLease({
      schemaVersion: 'world-writer-lease-v1',
      worldId: WORLD,
      holderId: WORKER,
      fencingToken: '1',
      acquiredAtReal: NOW,
      renewedAtReal: NOW,
      expiresAtReal: '2026-10-28T12:05:00.000Z',
    }),
  };
  let active = false,
    calls = 0;
  const queries: string[] = [];
  let head = { world_version: '0', event_sequence: '0' };
  const historyRows: Row[] = [],
    receiptRows: Row[] = [];
  let commandStored = true;
  const executor: SqlExecutor = {
    async query<Result extends object>(
      statement: string,
      parameters?: readonly unknown[],
    ) {
      queries.push(statement);
      expect(parameters?.[0]).toBe(WORLD);
      let rows: Row[];
      if (statement.includes('from world_v2.command_submission'))
        rows = !commandStored
          ? []
          : [
              {
                command_actor_id: command.actorId,
                command_auth_subject: command.authSubject,
                command_canonical_payload: command.canonicalPayload,
                command_country_id: command.countryId,
                command_expected_world_version: command.expectedWorldVersion,
                command_fingerprint: command.fingerprint,
                command_id: command.commandId,
                command_idempotency_key: command.idempotencyKey,
                command_office_id: command.officeId,
                command_payload_sha256: command.payloadHash,
                command_schema_version: command.schemaVersion,
                command_sim_time: command.simTime.toCanonicalValue(),
                command_submitted_at_real: command.submittedAtReal,
                command_type: command.commandType,
                command_world_id: command.worldId,
                correlation_id: command.correlationId,
              },
            ];
      else if (statement.includes('from world_v2.world_head')) {
        expect(active).toBe(true);
        rows = [head];
      } else if (statement.includes('from world_v2.opening_seed'))
        rows = [
          {
            world_id: WORLD,
            seed_id: seed.seedId,
            opening_world_version: '0',
            replay_binding: canonicalSerialize(seed.replayBinding),
            canonical_payload: canonicalSerialize(seedIntent),
            seed_fingerprint: seed.fingerprint,
          },
        ];
      else if (statement.includes('from world_v2.authoritative_event event'))
        rows = historyRows;
      else if (statement.includes("outcome = 'COMMITTED'"))
        rows = receiptRows.map((row) => ({ command_id: row.command_id }));
      else if (statement.includes('from world_v2.command_receipt'))
        rows = receiptRows.filter((row) => row.command_id === parameters?.[1]);
      else if (
        [
          'from world_v2.inventory_posting',
          'from world_v2.financial_posting_batch',
        ].some((s) => statement.includes(s))
      )
        rows = [];
      else throw Error(`UNEXPECTED_SQL: ${statement}`);
      return { rows: rows as readonly Result[], rowCount: rows.length };
    },
  };
  const database: SqlDatabase = {
    query: async () => {
      throw Error('POOL_QUERY_FORBIDDEN');
    },
    transaction: async (operation) => operation(executor),
  };
  const custody: CaptainOperatingSourceCustodyPort = {
    async withProtectedAdmittedOriginalsFrom(tx, request, consume) {
      expect(tx).toBe(executor);
      expect(request.command.fingerprint).toBe(command.fingerprint);
      calls++;
      const previousActive = active;
      active = true;
      try {
        return await consume(originals);
      } finally {
        active = previousActive;
      }
    },
  };
  const adapter = createCaptainRuntimeSnapshotReader({
    mode: 'TEST_ONLY_LOCAL',
    database,
    custody,
    workerId: WORKER,
  });
  const request = () => ({
    worldId: command.worldId,
    countryId: command.countryId,
    commandId: command.commandId,
    commandFingerprint: command.fingerprint,
    expectedWorldVersion: command.expectedWorldVersion!,
    simTime: command.simTime.toCanonicalValue(),
    reasonFactRef: 'REASON_CAPTAIN_TEST',
    observedAtReal: NOW,
  });
  return {
    get command() {
      return command;
    },
    adapter,
    executor,
    database,
    custody,
    get request() {
      return request();
    },
    queries,
    record,
    get calls() {
      return calls;
    },
    get active() {
      return active;
    },
    get originals() {
      return originals;
    },
    setOriginals(v: CaptainOperatingOriginalsRead) {
      originals = v;
    },
    setHead(v: typeof head) {
      head = v;
    },
    get head() {
      return { ...head };
    },
    setCommandStored(value: boolean) {
      commandStored = value;
    },
    originalRead() {
      if (originals.kind !== 'ORIGINALS')
        throw Error('fixture originals missing');
      return originals;
    },
    async installHistory(fault: 'NONE' | 'UNKNOWN' | 'FAKE_GENESIS' = 'NONE') {
      if (originals.kind !== 'ORIGINALS')
        throw Error('fixture originals missing');
      const genuineOriginals = originals;
      if (fault === 'FAKE_GENESIS') {
        const altered = JSON.parse(originals.genesis.canonicalPayload);
        for (const key of ['opening', 'total', 'available', 'closing'])
          altered.capital[key] = q('56');
        altered.capital.buckets = POLITICAL_CAPITAL_BUCKETS.map((bucket) => ({
          bucket,
          balance: q('8'),
        }));
        const canonicalPayload = canonicalSerialize(altered);
        originals = {
          ...originals,
          genesis: {
            ...originals.genesis,
            canonicalPayload,
            payloadSHA256: digest(canonicalPayload),
          },
        };
      }
      const prior = command;
      const prep = await adapter.prepareFrom(executor, prior, NOW);
      if (prep.sourceRead.kind !== 'READ') throw Error('fixture');
      const originalEvent = prepareCaptainPoliticalCapitalEvent({
        command: prior,
        source: prep.sourceRead.snapshot,
        eventId: 'EVENT_CAPTAIN_PREFIX_TEST',
        recordedAtReal: NOW,
        sha256Hex: digest,
      }).event;
      originals = genuineOriginals;
      const event =
        fault === 'UNKNOWN'
          ? parseAuthoritativeEvent(
              {
                schemaVersion: originalEvent.schemaVersion,
                eventId: originalEvent.eventId,
                eventType: 'UNKNOWN_CAPITAL_EFFECT_V999',
                worldId: originalEvent.worldId,
                causationCommandId: originalEvent.causationCommandId,
                correlationId: originalEvent.correlationId,
                worldVersion: originalEvent.worldVersion,
                sequence: originalEvent.sequence,
                simTime: originalEvent.simTime.toCanonicalValue(),
                recordedAtReal: originalEvent.recordedAtReal,
                correctsEventId: null,
                payload: JSON.parse(originalEvent.canonicalPayload),
              },
              digest,
            )
          : originalEvent;
      const transition = createAuthoritativeTransition({
        command: prior,
        worldVersionBefore: '0',
        worldVersionAfter: '1',
        events: [event],
      });
      const receipt = createFinalCommandReceipt({
        command: prior,
        outcome: 'COMMITTED',
        reasonCode: null,
        transition,
        simTime: prior.simTime,
        recordedAtReal: NOW,
      });
      historyRows.push({
        command_actor_id: prior.actorId,
        command_auth_subject: prior.authSubject,
        command_canonical_payload: prior.canonicalPayload,
        command_country_id: prior.countryId,
        command_expected_world_version: prior.expectedWorldVersion,
        command_fingerprint: prior.fingerprint,
        command_id: prior.commandId,
        command_idempotency_key: prior.idempotencyKey,
        command_office_id: prior.officeId,
        command_payload_sha256: prior.payloadHash,
        command_schema_version: prior.schemaVersion,
        command_sim_time: prior.simTime.toCanonicalValue(),
        command_submitted_at_real: prior.submittedAtReal,
        command_type: prior.commandType,
        command_world_id: prior.worldId,
        command_correlation_id: prior.correlationId,
        correlation_id: event.correlationId,
        event_canonical_payload: event.canonicalPayload,
        event_causation_command_id: event.causationCommandId,
        event_corrects_event_id: event.correctsEventId,
        event_fingerprint: event.fingerprint,
        event_id: event.eventId,
        event_payload_sha256: event.payloadHash,
        event_recorded_at_real: event.recordedAtReal,
        event_schema_version: event.schemaVersion,
        event_sequence: event.sequence,
        event_sim_time: event.simTime.toCanonicalValue(),
        event_type: event.eventType,
        event_world_id: event.worldId,
        event_world_version: event.worldVersion,
      });
      receiptRows.push({
        world_id: receipt.worldId,
        command_id: receipt.commandId,
        idempotency_key: receipt.idempotencyKey,
        schema_version: receipt.schemaVersion,
        command_fingerprint: receipt.commandFingerprint,
        outcome: receipt.outcome,
        reason_code: receipt.reasonCode,
        transition_id: receipt.transitionId,
        world_version_before: receipt.worldVersionBefore,
        world_version_after: receipt.worldVersionAfter,
        sim_time: receipt.simTime.toCanonicalValue(),
        event_ids: [...receipt.eventIds],
        recorded_at_real: receipt.recordedAtReal,
      });
      head = { world_version: '1', event_sequence: '1' };
      command = parseCanonicalCommand(
        {
          schemaVersion: prior.schemaVersion,
          commandId: 'COMMAND_CAPTAIN_CUSTODY_NEXT',
          commandType: prior.commandType,
          actorId: prior.actorId,
          authSubject: prior.authSubject,
          correlationId: prior.correlationId,
          worldId: prior.worldId,
          countryId: prior.countryId,
          officeId: prior.officeId,
          expectedWorldVersion: '1',
          idempotencyKey: 'IDEM_CAPTAIN_NEXT',
          simTime: '2000',
          submittedAtReal: NOW,
          payload: JSON.parse(prior.canonicalPayload),
        },
        digest,
      );
    },
    prepare: () => adapter.prepareFrom(executor, command, NOW),
  };
}

describe('Captain operating custody adapter — TEST_ONLY protocol, no native admission', () => {
  it('loads actual source/replay before first Command INSERT without minting a commit preparation', async () => {
    const f = fixture();
    f.setCommandStored(false);
    const source = createCaptainPoliticalCapitalRuntimeSource({
      reader: f.adapter.reader,
      sha256Hex: digest,
    });
    const read = await source.load({ command: f.command, observedAtReal: NOW });
    expect(read.kind).toBe('READ');
    if (read.kind !== 'READ') throw Error('fixture');
    expect(read.snapshot.worldVersion).toBe('0');
    expect(read.snapshot.capitalFact.payload.available).toEqual(q('42'));
    expect(f.calls).toBe(1);
    expect(
      f.queries.some((query) =>
        query.includes('from world_v2.command_submission'),
      ),
    ).toBe(false);
    expect(
      f.queries.some((query) =>
        query.includes('from world_v2.authoritative_event event'),
      ),
    ).toBe(true);
    expect(
      f.queries.some((query) => /\b(?:insert|update|delete)\b/iu.test(query)),
    ).toBe(false);
    await expect(
      f.adapter.withCommitProtectionFrom(
        f.executor,
        read as unknown as CaptainOperatingPreparation,
        NOW,
        async () => 'unreachable',
      ),
    ).rejects.toThrow('forged/missing preparation');
    // Prospective success never relaxes the existing durable read/preparation.
    await expect(f.adapter.reader.read(f.request)).rejects.toThrow();
    await expect(f.prepare()).rejects.toThrow();
  });

  it.each([
    ['worldId', 'WORLD_OTHER'],
    ['countryId', 'COUNTRY_OTHER'],
    ['commandId', 'COMMAND_OTHER'],
    ['commandFingerprint', `sha256:${'a'.repeat(64)}`],
    ['expectedWorldVersion', '1'],
    ['simTime', '2000'],
    ['reasonFactRef', 'REASON_OTHER'],
  ])(
    'refuses prospective request %s mismatch before source or SQL',
    async (field, value) => {
      const f = fixture();
      f.setCommandStored(false);
      await expect(
        f.adapter.reader.readCanonical!(
          { ...f.request, [field]: value },
          f.command,
        ),
      ).rejects.toThrow('supplied server canonical intent');
      expect(f.queries).toEqual([]);
      expect(f.calls).toBe(0);
    },
  );

  it('refuses forged canonical intent and extra prospective request fields before SQL', async () => {
    const f = fixture();
    f.setCommandStored(false);
    await expect(
      f.adapter.reader.readCanonical!(f.request, {
        ...f.command,
        fingerprint: `sha256:${'b'.repeat(64)}` as typeof f.command.fingerprint,
      }),
    ).rejects.toThrow();
    await expect(
      f.adapter.reader.readCanonical!(
        { ...f.request, capital: q('999') } as typeof f.request,
        f.command,
      ),
    ).rejects.toThrow('missing/unknown fields');
    expect(f.queries).toEqual([]);
    expect(f.calls).toBe(0);
  });

  it('prospective source still replays the full committed prefix and refuses unknown effects', async () => {
    const f = fixture();
    await f.installHistory();
    f.setCommandStored(false);
    f.queries.length = 0;
    const source = createCaptainPoliticalCapitalRuntimeSource({
      reader: f.adapter.reader,
      sha256Hex: digest,
    });
    const read = await source.load({ command: f.command, observedAtReal: NOW });
    expect(read.kind).toBe('READ');
    if (read.kind !== 'READ') throw Error('fixture');
    expect(read.snapshot.worldVersion).toBe('1');
    expect(read.snapshot.capitalFact.payload.buckets[0]!.balance).toEqual(
      q('4'),
    );
    expect(read.snapshot.capitalFact.payload.buckets[1]!.balance).toEqual(
      q('8'),
    );
    const unsupported = fixture();
    await unsupported.installHistory('UNKNOWN');
    unsupported.setCommandStored(false);
    await expect(
      createCaptainPoliticalCapitalRuntimeSource({
        reader: unsupported.adapter.reader,
        sha256Hex: digest,
      }).load({ command: unsupported.command, observedAtReal: NOW }),
    ).rejects.toThrow('unsupported/future canonical history effect');
  });

  it.each([false, true])(
    'legacy wrapper preserves prospective source capability and head guard (advance=%s)',
    async (advance) => {
      const f = fixture();
      f.setCommandStored(false);
      let headReads = 0;
      const workerDatabase: SqlDatabase = {
        transaction: f.database.transaction,
        async query<Result extends object>(
          statement: string,
          parameters?: readonly unknown[],
        ) {
          expect(statement).toContain('from world_v2.world_head');
          expect(parameters).toEqual([WORLD]);
          headReads++;
          return {
            rowCount: 1,
            rows: [f.head] as unknown as readonly Result[],
          };
        },
      };
      const runtime = createManualOfficeIntakeRuntime({
        intakePool: {
          connect: async () => {
            throw Error('INTAKE_POOL_NOT_USED');
          },
        },
        workerDatabase,
        worldId: WORLD,
        workerId: WORKER,
        clock: Object.freeze({
          nowReal: () => NOW,
          simTime: async () => '1000',
        }),
        sha256Hex: digest,
        environment: { ECONMIND_ENV: 'local' },
        readers: {
          captain: {
            read: f.adapter.reader.read,
            async readCanonical(request, command) {
              const read = await f.adapter.reader.readCanonical!(
                request,
                command,
              );
              if (advance)
                f.setHead({ world_version: '1', event_sequence: '1' });
              return read;
            },
          },
        },
      });
      if (advance)
        await expect(
          preflightManualOfficeIntakeRuntime(runtime, f.command, NOW),
        ).rejects.toMatchObject({ code: 'VERSION_MISMATCH' });
      else
        await expect(
          preflightManualOfficeIntakeRuntime(runtime, f.command, NOW),
        ).resolves.toBe(true);
      expect(headReads).toBe(2);
      expect(f.calls).toBe(1);
      expect(
        f.queries.some((query) =>
          query.includes('from world_v2.command_submission'),
        ),
      ).toBe(false);
      expect(runtime.consumer.state()).toBe('PREPARED');
    },
  );
  it('builds an existing Core snapshot from separate original genesis/reason and actual canonical head, then protects on the same executor', async () => {
    const f = fixture(),
      prep = await f.prepare();
    expect(prep.sourceRead.kind).toBe('READ');
    if (prep.sourceRead.kind !== 'READ') throw Error('fixture');
    expect(prep.sourceRead.snapshot.capitalFact.payload.available).toEqual(
      q('42'),
    );
    expect(prep.sourceRead.snapshot.reasonFact.factRef).toBe(
      'REASON_CAPTAIN_TEST',
    );
    const event = prepareCaptainPoliticalCapitalEvent({
      command: f.command,
      source: prep.sourceRead.snapshot,
      eventId: 'EVENT_TEST_ONLY',
      recordedAtReal: NOW,
      sha256Hex: digest,
    });
    expect(event.capitalAfter.buckets[0]!.balance).toEqual(q('4'));
    expect(event.capitalAfter.buckets[1]!.balance).toEqual(q('8'));
    const result = await f.adapter.withCommitProtectionFrom(
      f.executor,
      prep,
      NOW,
      async (current) => {
        expect(f.active).toBe(true);
        expect(current.snapshot).toEqual(
          prep.sourceRead.kind === 'READ' ? prep.sourceRead.snapshot : null,
        );
        return 'CONSUMER_TEST_ONLY';
      },
    );
    expect(result).toBe('CONSUMER_TEST_ONLY');
    expect(f.calls).toBe(3); // prepare, commit read, post-consumer original recheck
    await expect(
      f.adapter.withCommitProtectionFrom(
        f.executor,
        prep,
        NOW,
        async () => 'again',
      ),
    ).rejects.toThrow('forged/missing preparation');
  });

  it('the existing runtime-reader DTO is resolved against durable command, never caller capital or reason contents', async () => {
    const f = fixture();
    const read = await f.adapter.reader.read(f.request);
    expect(read.kind).toBe('READ');
    await expect(
      f.adapter.reader.read({ ...f.request, reasonFactRef: 'OTHER_REASON' }),
    ).rejects.toThrow('actual durable command');
    await expect(
      f.adapter.reader.read({
        ...f.request,
        capital: q('999'),
      } as typeof f.request),
    ).rejects.toThrow('missing/unknown fields');
  });

  it.each([
    'POLITICAL_CAPITAL_EVENT_LINEAGE',
    'REASON_RECORD',
    'WRITER_LEASE',
  ] as const)(
    'missing %s stays missing and cannot issue usable commit preparation',
    async (missing) => {
      const f = fixture();
      f.setOriginals({ kind: 'MISSING', missing: [missing] });
      const prep = await f.prepare();
      expect(prep.sourceRead).toEqual({ kind: 'MISSING', missing: [missing] });
      await expect(
        f.adapter.withCommitProtectionFrom(
          f.executor,
          prep,
          NOW,
          async () => 'forbidden',
        ),
      ).rejects.toThrow('forged/missing preparation');
    },
  );

  it.each([
    'reason-revision',
    'admission-revision',
    'reason-body',
    'fence',
    'revoked',
  ] as const)(
    'same-head %s change refuses before the consumer',
    async (fault) => {
      const f = fixture(),
        prep = await f.prepare(),
        raw = f.originalRead();
      let changed = raw;
      if (fault === 'reason-revision')
        changed = { ...raw, reason: { ...raw.reason, revision: 'REV_2' } };
      if (fault === 'admission-revision')
        changed = {
          ...raw,
          genesis: { ...raw.genesis, admissionRevision: 'ADMISSION_REV_2' },
        };
      if (fault === 'reason-body') {
        const payload = JSON.parse(raw.reason.canonicalPayload);
        payload.reason.reason = 'Different actual TEST_ONLY record.';
        const canonicalPayload = canonicalSerialize(payload);
        changed = {
          ...raw,
          reason: {
            ...raw.reason,
            canonicalPayload,
            payloadSHA256: digest(canonicalPayload),
          },
        };
      }
      if (fault === 'fence')
        changed = {
          ...raw,
          lease: parseWorldWriterLease({ ...raw.lease, fencingToken: '2' }),
        };
      if (fault === 'revoked')
        changed = {
          ...raw,
          reason: { ...raw.reason, revokedByRevision: 'REVOKED_2' },
        };
      f.setOriginals(changed);
      let consumed = 0;
      await expect(
        f.adapter.withCommitProtectionFrom(
          f.executor,
          prep,
          NOW,
          async () => ++consumed,
        ),
      ).rejects.toThrow();
      expect(consumed).toBe(0);
    },
  );

  it.each([
    'hash',
    'scope',
    'seed',
    'effective',
    'wrong-holder',
    'alias',
  ] as const)(
    'rejects %s original/cutoff mismatch without constructing a replacement',
    async (fault) => {
      const f = fixture(),
        raw = f.originalRead();
      if (fault === 'hash')
        f.setOriginals({
          ...raw,
          reason: { ...raw.reason, payloadSHA256: 'f'.repeat(64) },
        });
      if (fault === 'effective')
        f.setOriginals({
          ...raw,
          reason: { ...raw.reason, effectiveFromSimTime: '2000' },
        });
      if (fault === 'wrong-holder')
        f.setOriginals({
          ...raw,
          lease: parseWorldWriterLease({
            ...raw.lease,
            holderId: 'WORKER_OTHER',
          }),
        });
      if (fault === 'scope' || fault === 'seed') {
        const payload = JSON.parse(raw.genesis.canonicalPayload);
        if (fault === 'scope') payload.countryId = 'COUNTRY_02';
        else payload.seedId = 'SEED_OTHER';
        const canonicalPayload = canonicalSerialize(payload);
        f.setOriginals({
          ...raw,
          genesis: {
            ...raw.genesis,
            canonicalPayload,
            payloadSHA256: digest(canonicalPayload),
          },
        });
      }
      if (fault === 'alias')
        f.setOriginals({
          ...raw,
          reason: {
            ...raw.reason,
            extraAuthority: true,
          } as CaptainOperatingOriginal,
        });
      await expect(f.prepare()).rejects.toThrow();
    },
  );

  it('OFFICIAL_RUNTIME refuses explicitly TEST_ONLY originals regardless of valid hashes', async () => {
    const f = fixture();
    const adapter = createCaptainRuntimeSnapshotReader({
      mode: 'OFFICIAL_RUNTIME',
      workerId: WORKER,
      database: f.database,
      custody: f.custody,
    });
    await expect(
      adapter.prepareFrom(f.executor, f.command, NOW),
    ).rejects.toThrow('original source class refused');
  });

  it('replays the complete actual canonical prefix from separate original genesis', async () => {
    const f = fixture();
    await f.installHistory();
    const prep = await f.prepare();
    if (prep.sourceRead.kind !== 'READ') throw Error('fixture');
    expect(prep.sourceRead.snapshot.worldVersion).toBe('1');
    expect(prep.sourceRead.snapshot.lastEventSequence).toBe('1');
    expect(
      prep.sourceRead.snapshot.capitalFact.payload.buckets[0]!.balance,
    ).toEqual(q('4'));
    expect(
      prep.sourceRead.snapshot.capitalFact.payload.buckets[1]!.balance,
    ).toEqual(q('8'));
    expect(prep.sourceRead.snapshot.capitalFact.predecessorFactRefs).toContain(
      'EVENT_CAPTAIN_PREFIX_TEST',
    );
  });

  it.each(['UNKNOWN', 'FAKE_GENESIS'] as const)(
    'does not bootstrap authoritative capital from %s embedded history',
    async (fault) => {
      const f = fixture();
      await f.installHistory(fault);
      await expect(f.prepare()).rejects.toThrow(
        fault === 'UNKNOWN'
          ? 'unsupported/future canonical history effect'
          : 'Replay predecessor',
      );
    },
  );

  it('currentness re-reads actual originals without replaying a legitimately advanced head and rejects escaped scope', async () => {
    const f = fixture(),
      prep = await f.prepare();
    let escaped: (() => Promise<unknown>) | undefined;
    await f.adapter.withCommitProtectionFrom(
      f.executor,
      prep,
      NOW,
      async (_source, currentness) => {
        expect(currentness.executor).toBe(f.executor);
        expect(currentness.binding).toEqual(prep.sourceBinding);
        const headReads = f.queries.filter((sql) =>
          sql.includes('from world_v2.world_head'),
        ).length;
        f.setHead({ world_version: '1', event_sequence: '1' });
        expect(await currentness.readCurrentBinding()).toEqual(
          prep.sourceBinding,
        );
        expect(
          f.queries.filter((sql) => sql.includes('from world_v2.world_head')),
        ).toHaveLength(headReads);
        expect(f.active).toBe(true);
        const raw = f.originalRead();
        f.setOriginals({
          ...raw,
          reason: { ...raw.reason, admissionRevision: 'ADMISSION_REV_2' },
        });
        expect(await currentness.readCurrentBinding()).not.toEqual(
          prep.sourceBinding,
        );
        f.setOriginals(raw);
        escaped = () => currentness.readCurrentBinding();
      },
    );
    await expect(escaped!()).rejects.toThrow('scope expired');
  });

  it('source changes during the protected consumer fail the enclosing protocol rather than returning success', async () => {
    const f = fixture(),
      prep = await f.prepare();
    await expect(
      f.adapter.withCommitProtectionFrom(f.executor, prep, NOW, async () => {
        const raw = f.originalRead();
        f.setOriginals({
          ...raw,
          reason: { ...raw.reason, revision: 'REV_2' },
        });
        return 'NOT_A_COMMITTED_RESULT';
      }),
    ).rejects.toThrow('changed during protected consumer');
    expect(f.active).toBe(false);
  });

  it('forged/foreign preparations and backward or expired observation never reach consumer', async () => {
    const f = fixture(),
      prep = await f.prepare(),
      foreign = fixture();
    await expect(
      f.adapter.withCommitProtectionFrom(
        f.executor,
        { ...prep } as CaptainOperatingPreparation,
        NOW,
        async () => null,
      ),
    ).rejects.toThrow('forged/missing preparation');
    await expect(
      foreign.adapter.withCommitProtectionFrom(
        foreign.executor,
        prep,
        NOW,
        async () => null,
      ),
    ).rejects.toThrow('forged/missing preparation');
    await expect(
      f.adapter.withCommitProtectionFrom(
        f.executor,
        prep,
        '2026-10-28T11:59:59.000Z',
        async () => null,
      ),
    ).rejects.toThrow('precedes preparation');
    await expect(
      f.adapter.withCommitProtectionFrom(
        f.executor,
        prep,
        '2026-10-28T12:06:00.000Z',
        async () => null,
      ),
    ).rejects.toThrow();
  });

  it('a missing real custodian is refused at construction, not replaced with admitted-looking facts', () => {
    const f = fixture();
    expect(() =>
      createCaptainRuntimeSnapshotReader({
        mode: 'TEST_ONLY_LOCAL',
        workerId: WORKER,
        database: f.database,
        custody: null as unknown as CaptainOperatingSourceCustodyPort,
      }),
    ).toThrow('real custody dependency');
  });
});
