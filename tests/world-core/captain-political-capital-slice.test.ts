import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  CAPTAIN_POLITICAL_CAPITAL_CAPABILITY,
  CAPTAIN_POLITICAL_CAPITAL_COMMAND,
  CAPTAIN_POLITICAL_CAPITAL_PAYLOAD_SCHEMA,
  COMMAND_SCHEMA_VERSION,
  POLITICAL_CAPITAL_BUCKETS,
  authSubject,
  authorizeOfficeCapability,
  captainPoliticalCapitalSourceHash,
  canonicalSerialize,
  classifyCommandIdentity,
  countryId,
  createFoundationFact,
  parseAuthoritativeEvent,
  parseCanonicalCommand,
  parseCaptainPoliticalCapitalAllocation,
  parseWorldWriterLease,
  processQueuedCommand,
  replayCaptainPoliticalCapitalAllocation,
  teamId,
  worldId,
  type AuthenticatedPrincipal,
  type AuthorizationCapability,
  type CanonicalCommand,
  type CaptainPoliticalCapitalReason,
  type CaptainPoliticalCapitalReplayState,
  type CaptainPoliticalCapitalSourceSnapshot,
  type CommitAuthorizationProof,
  type FinalCommandReceipt,
  type FoundationTraceRequest,
  type MembershipSnapshot,
  type PoliticalCapitalSnapshot,
} from '@econmind/core';
import {
  CaptainPoliticalCapitalSourceMissing,
  createCaptainPoliticalCapitalCandidateFactory,
  type CaptainPoliticalCapitalCandidateSource,
  type CaptainPoliticalCapitalSourceRead,
} from '../../apps/world-worker/src/persistence/captain-political-capital-candidate-source.js';
import {
  prepareAtomicTransitionCandidate,
  type AtomicTransitionDraft,
} from '../../apps/world-worker/src/persistence/atomic-transition-repository.js';

const sha256Hex = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const WORLD = 'WORLD_TEST_ONLY_CAPTAIN_01';
const COUNTRY = 'COUNTRY_01';
const SUBJECT = '11111111-1111-4111-8111-111111111111';
const NOW = '2026-10-07T00:00:01.000Z';
const quantity = (amount: string) => ({ amount, unit: 'political_capital' });
const terms = {
  schemaVersion: CAPTAIN_POLITICAL_CAPITAL_PAYLOAD_SCHEMA,
  fromBucket: 'FISCAL_REFORM',
  toBucket: 'INDUSTRIAL_STRATEGY',
  amount: quantity('7.125'),
  reasonFactRef: 'FACT.TEST_ONLY.REASON.1',
};

function command(overrides: Record<string, unknown> = {}): CanonicalCommand {
  return parseCanonicalCommand(
    {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      commandId: 'COMMAND_TEST_ONLY_CAP_01',
      actorId: 'ACTOR_TEST_ONLY_CAP_01',
      authSubject: SUBJECT,
      commandType: CAPTAIN_POLITICAL_CAPITAL_COMMAND,
      correlationId: 'CORRELATION_TEST_ONLY_CAP_01',
      countryId: COUNTRY,
      worldId: WORLD,
      officeId: 'CAPTAIN',
      expectedWorldVersion: '7',
      idempotencyKey: 'IDEMPOTENCY_TEST_ONLY_CAP_01',
      simTime: '24000',
      submittedAtReal: '2026-10-07T00:00:00.000Z',
      payload: terms,
      ...overrides,
    },
    sha256Hex,
  );
}

/** Explicit mechanism fixture, never a default or adopted official opening. */
function sourceSnapshot(): CaptainPoliticalCapitalSourceSnapshot {
  const capital: PoliticalCapitalSnapshot = {
    capitalRef: 'CAPITAL.TEST_ONLY.1',
    countryRef: COUNTRY,
    opening: quantity('90'),
    generated: quantity('10'),
    total: quantity('100'),
    available: quantity('80'),
    spent: quantity('20'),
    closing: quantity('80'),
    buckets: POLITICAL_CAPITAL_BUCKETS.map((bucket, index) => ({
      bucket,
      balance: quantity(
        ['10.25', '15.75', '10', '10', '10', '10', '14'][index]!,
      ),
    })),
  };
  const reason: CaptainPoliticalCapitalReason = {
    countryRef: COUNTRY,
    recordRef: 'CABINET.TEST_ONLY.RECORD.1',
    reason:
      'TEST_ONLY cabinet record: move an existing allocation, generate no capital.',
  };
  const trace: FoundationTraceRequest = {
    traceRef: 'TRACE.TEST_ONLY.CAP.1',
    calculationVersion: 'CAP_ALLOCATION_TEST_ONLY.1',
    snapshot: {
      lineageRef: WORLD,
      sourceVersion: 'WORLD_VERSION_7',
      snapshotRef: 'SNAPSHOT.TEST_ONLY.CAP.1',
      snapshotHash: 'a'.repeat(64),
      predecessorSnapshotHash: 'b'.repeat(64),
    },
    snapshotAt: { amount: '24000', unit: 'sim_millisecond' },
  };
  const facts = (bound: FoundationTraceRequest) => ({
    capitalFact: createFoundationFact({
      trace: bound,
      factRef: 'FACT.TEST_ONLY.CAP.1',
      sourceRef: 'SOURCE.TEST_ONLY.CAP.EVENTS',
      predecessorFactRefs: ['EVENT.TEST_ONLY.CAP.GENESIS'],
      payload: capital,
    }),
    reasonFact: createFoundationFact({
      trace: bound,
      factRef: terms.reasonFactRef,
      sourceRef: 'SOURCE.TEST_ONLY.CABINET.RECORDS',
      predecessorFactRefs: ['EVENT.TEST_ONLY.REASON.1'],
      payload: reason,
    }),
  });
  const scope = {
    worldId: WORLD,
    countryId: COUNTRY,
    worldVersion: '7',
    lastEventSequence: '12',
  };
  const boundTrace = {
    ...trace,
    snapshot: {
      ...trace.snapshot,
      snapshotHash: captainPoliticalCapitalSourceHash(
        { ...scope, ...facts(trace) },
        sha256Hex,
      ),
    },
  };
  // Deep immutable fixture prevents alias mutation masquerading as a source read.
  const snapshot = { ...scope, trace: boundTrace, ...facts(boundTrace) };
  return deepFreeze(snapshot);
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function readSource(): CaptainPoliticalCapitalSourceRead {
  return {
    kind: 'READ',
    snapshot: sourceSnapshot(),
    lease: parseWorldWriterLease({
      schemaVersion: 'world-writer-lease-v1',
      worldId: WORLD,
      holderId: 'WORKER_TEST_ONLY_CAP_01',
      fencingToken: '3',
      acquiredAtReal: '2026-10-07T00:00:00.000Z',
      renewedAtReal: '2026-10-07T00:00:00.000Z',
      expiresAtReal: '2026-10-07T00:01:00.000Z',
    }),
  };
}

function replayState(): CaptainPoliticalCapitalReplayState {
  const source = sourceSnapshot();
  return deepFreeze({
    worldId: WORLD,
    countryId: COUNTRY,
    worldVersion: '7',
    lastEventSequence: '12',
    capital: source.capitalFact.payload,
    applied: [],
  });
}

async function harness(
  options: {
    command?: CanonicalCommand;
    read?: CaptainPoliticalCapitalSourceRead;
    unavailable?: boolean;
    capability?: AuthorizationCapability;
  } = {},
) {
  const intent = options.command ?? command();
  const principal: AuthenticatedPrincipal = {
    authSubject: authSubject(SUBJECT),
    facts: {
      user_id: SUBJECT,
      display_name: 'TEST_ONLY Captain',
      school_id: null,
    },
    token: {
      subject: SUBJECT,
      issuer: 'TEST_ONLY',
      audience: 'world',
      issuedAt: '2026-10-07T00:00:00.000Z',
      expiresAt: '2026-10-07T01:00:00.000Z',
    },
  };
  let membership: MembershipSnapshot | null = {
    authorizationVersion: '1',
    authSubject: principal.authSubject,
    worldId: worldId(WORLD),
    countryId: countryId(COUNTRY),
    teamId: teamId('TEAM_TEST_ONLY_CAP_01'),
    officeAssignments: [command().officeId!],
    active: true,
    suspended: false,
    isWorldAdmin: false,
    negotiationPartyIds: [],
  };
  const resolver = {
    async resolveCurrentIdentity() {
      return membership === null ? null : principal.authSubject;
    },
    async resolveCurrentMembership() {
      return membership;
    },
  };
  const capability = options.capability ?? CAPTAIN_POLITICAL_CAPITAL_CAPABILITY;
  const authorization = await authorizeOfficeCapability({
    principal,
    resolver,
    worldId: worldId(WORLD),
    requestedCountryId: countryId(COUNTRY),
    requestedOfficeId: command().officeId!,
    capability,
  });
  let reads = 0;
  let calls = 0;
  let effects = 0;
  let final: FinalCommandReceipt | null = null;
  let proof: CommitAuthorizationProof | null = null;
  let draft: AtomicTransitionDraft | null = null;
  const source: CaptainPoliticalCapitalCandidateSource = {
    async load() {
      reads += 1;
      return options.read ?? readSource();
    },
  };
  const factory = createCaptainPoliticalCapitalCandidateFactory({
    sha256Hex,
    ...(options.unavailable ? {} : { source }),
  });
  return {
    factory,
    intent,
    revoke() {
      membership = null;
    },
    get reads() {
      return reads;
    },
    get calls() {
      return calls;
    },
    get effects() {
      return effects;
    },
    get proof() {
      return proof;
    },
    get draft() {
      return draft;
    },
    async run() {
      return processQueuedCommand({
        command: intent,
        authorityKind: 'DISCRETIONARY_USER',
        commitSimTime: intent.simTime,
        recordedAtReal: NOW,
        requiredCapability: capability,
        intakeAuthorization: authorization,
        persistence: {
          async readFinalReceipt() {
            return final;
          },
          async recordZeroEffectReceipt(receipt) {
            final = receipt;
            return receipt;
          },
          async commitAuthorizedCommand(input) {
            calls += 1;
            proof = input.commitAuthorization;
            const result = await factory.prepare({
              command: input.command,
              commitAuthorization: input.commitAuthorization,
              observedAtReal: input.recordedAtReal,
            });
            // Exercise the existing private atomic-candidate validation, not a second writer.
            prepareAtomicTransitionCandidate({
              command: input.command,
              commitAuthorization: input.commitAuthorization,
              draft: result,
              sha256Hex,
            });
            draft = result;
            effects += 1;
            final = result.receipt;
            // TEST_ONLY capture, NOT AtomicTransitionRepository or a durable commit.
            return { receipt: result.receipt, transition: result.transition };
          },
        },
      });
    },
  };
}

describe('CAP-1 TEST_ONLY actual political-capital source-to-draft', () => {
  it('invokes queued authority/source/kernel and emits exact event/draft/receipt without cash', async () => {
    const h = await harness();
    const result = await h.run();
    expect(result.receipt.outcome).toBe('COMMITTED');
    const draft = h.draft!;
    const payload = JSON.parse(draft.transition.events[0]!.canonicalPayload);
    expect(
      payload.transitions.map(
        (leg: { before: unknown; delta: unknown; after: unknown }) => [
          leg.before,
          leg.delta,
          leg.after,
        ],
      ),
    ).toEqual([
      [quantity('10.25'), quantity('-7.125'), quantity('3.125')],
      [quantity('15.75'), quantity('7.125'), quantity('22.875')],
    ]);
    for (const field of [
      'opening',
      'generated',
      'total',
      'available',
      'spent',
      'closing',
    ]) {
      expect(payload.capitalAfter[field]).toEqual(
        payload.source.capitalFact.payload[field],
      );
    }
    expect(draft.transition.worldVersionBefore).toBe('7');
    expect(draft.transition.worldVersionAfter).toBe('8');
    expect(draft.transition.events[0]!.sequence).toBe('13');
    expect(draft.financialPostingBatches).toEqual([]);
    expect(draft.inventoryPostings).toEqual([]);
    expect(draft.outboxMessages).toHaveLength(1);
    expect(draft.currentMaterializations[0]!.payload).toMatchObject({
      capital: payload.capitalAfter,
      eventFingerprint: draft.transition.events[0]!.fingerprint,
    });
    expect(h.reads).toBe(1);
    const before = replayState();
    const after = replayCaptainPoliticalCapitalAllocation({
      state: before,
      event: draft.transition.events[0]!,
      sha256Hex,
    });
    expect(after.capital).toEqual(payload.capitalAfter);
    expect(before.capital.buckets[0]!.balance.amount).toBe('10.25');
    expect(after.worldVersion).toBe('8');
  });

  it('replay exact duplicate and queued final-receipt retry make no second effect', async () => {
    const h = await harness();
    await h.run();
    const event = h.draft!.transition.events[0]!;
    const after = replayCaptainPoliticalCapitalAllocation({
      state: replayState(),
      event,
      sha256Hex,
    });
    expect(
      replayCaptainPoliticalCapitalAllocation({
        state: after,
        event,
        sha256Hex,
      }),
    ).toBe(after);
    const retried = await h.run();
    expect(retried.source).toBe('EXISTING_FINAL');
    expect(h.calls).toBe(1);
    expect(h.reads).toBe(1);
    expect(h.effects).toBe(1);
    expect(
      classifyCommandIdentity(
        [
          {
            commandId: h.intent.commandId,
            fingerprint: h.intent.fingerprint,
            idempotencyKey: h.intent.idempotencyKey,
            worldId: h.intent.worldId,
          },
        ],
        h.intent,
      ).kind,
    ).toBe('EXACT_DUPLICATE');
    expect(() =>
      classifyCommandIdentity(
        [
          {
            commandId: h.intent.commandId,
            fingerprint: h.intent.fingerprint,
            idempotencyKey: h.intent.idempotencyKey,
            worldId: h.intent.worldId,
          },
        ],
        command({ payload: { ...terms, amount: quantity('8') } }),
      ),
    ).toThrow();
  });

  it.each([
    { ...terms, total: quantity('999') },
    { ...terms, GDP: '999' },
    { ...terms, amount: quantity('0') },
    { ...terms, amount: quantity('-1') },
    { ...terms, amount: quantity('7.1250') },
    { ...terms, amount: { amount: '1', unit: 'USD' } },
    { ...terms, toBucket: terms.fromBucket },
    { ...terms, fromBucket: 'UNKNOWN' },
    { ...terms, reasonFactRef: '' },
    { ...terms, schemaVersion: 'unknown' },
  ])(
    'refuses invalid or expanded intent before source access: %j',
    async (payload) => {
      const h = await harness({ command: command({ payload }) });
      await expect(h.run()).rejects.toThrow();
      expect(h.reads).toBe(0);
      expect(h.effects).toBe(0);
      expect(h.draft).toBeNull();
    },
  );

  it('rejects JS numeric amounts and automatic/non-Captain envelopes', () => {
    expect(() =>
      command({
        payload: { ...terms, amount: { amount: 7, unit: 'political_capital' } },
      }),
    ).toThrow();
    for (const override of [
      { officeId: null },
      { officeId: 'FINANCE' },
      { expectedWorldVersion: null },
      { commandType: 'UNKNOWN' },
    ]) {
      expect(() =>
        parseCaptainPoliticalCapitalAllocation(command(override), sha256Hex),
      ).toThrow();
    }
  });

  it('default production source reports exact missing without producing a draft', async () => {
    const h = await harness({ unavailable: true });
    await expect(h.run()).rejects.toMatchObject({
      missing: [
        'CURRENT_WORLD_HEAD',
        'POLITICAL_CAPITAL_EVENT_LINEAGE',
        'REASON_RECORD',
        'WRITER_LEASE',
      ],
    });
    expect(h.draft).toBeNull();
    expect(h.effects).toBe(0);
  });

  it.each(['POLITICAL_CAPITAL_EVENT_LINEAGE', 'REASON_RECORD'] as const)(
    'keeps missing %s, never zero/placeholder facts',
    async (missing) => {
      const h = await harness({
        read: { kind: 'MISSING', missing: [missing] },
      });
      await expect(h.run()).rejects.toBeInstanceOf(
        CaptainPoliticalCapitalSourceMissing,
      );
      expect(h.effects).toBe(0);
      expect(h.draft).toBeNull();
    },
  );

  it.each([
    'country',
    'head',
    'time',
    'hash',
    'reason',
    'insufficient',
  ] as const)('rejects inconsistent actual source: %s', async (failure) => {
    const source = readSource();
    if (source.kind !== 'READ') throw new Error('fixture');
    const raw = JSON.parse(
      canonicalSerialize(source.snapshot),
    ) as CaptainPoliticalCapitalSourceSnapshot;
    let snapshot = raw;
    if (failure === 'country') snapshot = { ...raw, countryId: 'COUNTRY_02' };
    if (failure === 'head') snapshot = { ...raw, worldVersion: '6' };
    if (failure === 'time')
      snapshot = {
        ...raw,
        trace: {
          ...raw.trace,
          snapshotAt: { amount: '25000', unit: 'sim_millisecond' },
        },
      };
    if (failure === 'hash')
      snapshot = {
        ...raw,
        trace: {
          ...raw.trace,
          snapshot: { ...raw.trace.snapshot, snapshotHash: 'c'.repeat(64) },
        },
      };
    const intent =
      failure === 'insufficient'
        ? command({ payload: { ...terms, amount: quantity('11') } })
        : failure === 'reason'
          ? command({
              payload: { ...terms, reasonFactRef: 'FACT.TEST_ONLY.ABSENT' },
            })
          : command();
    const h = await harness({ command: intent, read: { ...source, snapshot } });
    await expect(h.run()).rejects.toThrow();
    expect(h.effects).toBe(0);
    expect(h.draft).toBeNull();
  });

  it('revoked authority records zero effect without invoking the factory or source', async () => {
    const h = await harness();
    h.revoke();
    const result = await h.run();
    expect(result.receipt.outcome).toBe('AUTHORIZATION_REVOKED');
    expect(result.receipt.transitionId).toBeNull();
    expect(h.calls).toBe(0);
    expect(h.reads).toBe(0);
    expect(h.effects).toBe(0);
  });

  it('wrong capability and forged/cloned/mismatched commit proofs refuse before read', async () => {
    const wrong = await harness({ capability: 'CAPTAIN_STRATEGY' });
    await expect(wrong.run()).rejects.toMatchObject({
      code: 'AUTHORIZATION_DENIED',
    });
    expect(wrong.reads).toBe(0);
    expect(wrong.effects).toBe(0);
    const h = await harness();
    await h.run();
    for (const proof of [null, { ...h.proof } as CommitAuthorizationProof]) {
      await expect(
        h.factory.prepare({
          command: h.intent,
          commitAuthorization: proof,
          observedAtReal: NOW,
        }),
      ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
    }
    await expect(
      h.factory.prepare({
        command: command({ commandId: 'COMMAND_TEST_ONLY_OTHER' }),
        commitAuthorization: h.proof,
        observedAtReal: NOW,
      }),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
    expect(h.reads).toBe(1);
  });

  it('reauthorizes a previously issued proof again before source access', async () => {
    const h = await harness();
    await h.run();
    h.revoke();
    await expect(
      h.factory.prepare({
        command: h.intent,
        commitAuthorization: h.proof,
        observedAtReal: NOW,
      }),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
    expect(h.reads).toBe(1);
  });

  it('expired or cross-world leases refuse without returning a draft', async () => {
    const source = readSource();
    if (source.kind !== 'READ') throw new Error('fixture');
    for (const scope of [
      { worldId: WORLD, expiresAtReal: NOW },
      {
        worldId: 'WORLD_TEST_ONLY_OTHER',
        expiresAtReal: source.lease.expiresAtReal,
      },
    ]) {
      const lease = parseWorldWriterLease({ ...source.lease, ...scope });
      const h = await harness({ read: { ...source, lease } });
      await expect(h.run()).rejects.toThrow();
      expect(h.effects).toBe(0);
      expect(h.draft).toBeNull();
    }
  });

  it('replay rejects changed after/delta, wrong predecessor, duplicate identity conflict and event scope', async () => {
    const h = await harness();
    await h.run();
    const event = h.draft!.transition.events[0]!;
    const payload = JSON.parse(event.canonicalPayload);
    const altered = parseAuthoritativeEvent(
      {
        schemaVersion: event.schemaVersion,
        eventId: event.eventId,
        eventType: event.eventType,
        worldId: event.worldId,
        causationCommandId: event.causationCommandId,
        correlationId: event.correlationId,
        worldVersion: event.worldVersion,
        sequence: event.sequence,
        simTime: event.simTime.toCanonicalValue(),
        recordedAtReal: event.recordedAtReal,
        correctsEventId: null,
        payload: {
          ...payload,
          capitalAfter: { ...payload.capitalAfter, total: quantity('101') },
        },
      },
      sha256Hex,
    );
    expect(() =>
      replayCaptainPoliticalCapitalAllocation({
        state: replayState(),
        event: altered,
        sha256Hex,
      }),
    ).toThrow();
    expect(() =>
      replayCaptainPoliticalCapitalAllocation({
        state: { ...replayState(), worldVersion: '6' },
        event,
        sha256Hex,
      }),
    ).toThrow();
    expect(() =>
      replayCaptainPoliticalCapitalAllocation({
        state: { ...replayState(), countryId: 'COUNTRY_02' },
        event,
        sha256Hex,
      }),
    ).toThrow();
    const after = replayCaptainPoliticalCapitalAllocation({
      state: replayState(),
      event,
      sha256Hex,
    });
    expect(() =>
      replayCaptainPoliticalCapitalAllocation({
        state: {
          ...after,
          applied: [
            { ...after.applied[0]!, commandFingerprint: 'sha256:conflict' },
          ],
        },
        event,
        sha256Hex,
      }),
    ).toThrow();
  });
});
