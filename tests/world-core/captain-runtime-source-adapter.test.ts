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
  countryId,
  createFoundationFact,
  parseCanonicalCommand,
  parseWorldWriterLease,
  processQueuedCommand,
  replayCaptainPoliticalCapitalAllocation,
  teamId,
  worldId,
  type AuthenticatedPrincipal,
  type CanonicalCommand,
  type CaptainPoliticalCapitalSourceSnapshot,
  type CommitAuthorizationProof,
  type FinalCommandReceipt,
  type FoundationTraceRequest,
  type MembershipSnapshot,
} from '@econmind/core';
import {
  createCaptainPoliticalCapitalCandidateFactory,
  createCaptainPoliticalCapitalRuntimeSource,
  type CaptainPoliticalCapitalRuntimeReader,
  type CaptainPoliticalCapitalSourceRead,
} from '../../apps/world-worker/src/persistence/captain-political-capital-candidate-source.js';
import {
  prepareAtomicTransitionCandidate,
  type AtomicTransitionDraft,
} from '../../apps/world-worker/src/persistence/atomic-transition-repository.js';

const digest = (text: string) =>
  createHash('sha256').update(text).digest('hex');
const WORLD = 'WORLD_TEST_ONLY_CAP_ADAPTER_01';
const COUNTRY = 'COUNTRY_01';
const SUBJECT = '11111111-1111-4111-8111-111111111111';
const NOW = '2026-10-08T00:00:01.000Z';
const q = (amount: string) => ({ amount, unit: 'political_capital' });
const payload = {
  schemaVersion: CAPTAIN_POLITICAL_CAPITAL_PAYLOAD_SCHEMA,
  fromBucket: 'FISCAL_REFORM',
  toBucket: 'INDUSTRIAL_STRATEGY',
  amount: q('2.75'),
  reasonFactRef: 'FACT.TEST_ONLY.ADAPTER.REASON',
};
function command(overrides: Record<string, unknown> = {}): CanonicalCommand {
  return parseCanonicalCommand(
    {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      commandId: 'COMMAND_TEST_ONLY_ADAPTER_01',
      commandType: CAPTAIN_POLITICAL_CAPITAL_COMMAND,
      actorId: 'ACTOR_TEST_ONLY_ADAPTER_01',
      authSubject: SUBJECT,
      correlationId: 'CORRELATION_TEST_ONLY_ADAPTER_01',
      worldId: WORLD,
      countryId: COUNTRY,
      officeId: 'CAPTAIN',
      expectedWorldVersion: '4',
      idempotencyKey: 'IDEM_TEST_ONLY_ADAPTER_01',
      simTime: '16000',
      submittedAtReal: '2026-10-08T00:00:00.000Z',
      payload,
      ...overrides,
    },
    digest,
  );
}

/** Actual explicit TEST_ONLY quantities and reason, not an official/admitted genesis issuer. */
function snapshot(): CaptainPoliticalCapitalSourceSnapshot {
  const capital = {
    capitalRef: 'CAPITAL.TEST_ONLY.ADAPTER',
    countryRef: COUNTRY,
    opening: q('35'),
    generated: q('7'),
    total: q('42'),
    available: q('38'),
    spent: q('4'),
    closing: q('38'),
    buckets: POLITICAL_CAPITAL_BUCKETS.map((bucket, i) => ({
      bucket,
      balance: q(['11.5', '6.25', '4', '5', '3', '2', '6.25'][i]!),
    })),
  };
  const reason = {
    countryRef: COUNTRY,
    recordRef: 'CABINET.TEST_ONLY.ADAPTER.RECORD',
    reason: 'TEST_ONLY existing support reallocation record.',
  };
  const trace: FoundationTraceRequest = {
    traceRef: 'TRACE.TEST_ONLY.ADAPTER',
    calculationVersion: 'CAP_ADAPTER_TEST_ONLY.1',
    snapshot: {
      lineageRef: WORLD,
      sourceVersion: 'WORLD_VERSION_4',
      snapshotRef: 'SNAPSHOT.TEST_ONLY.ADAPTER',
      snapshotHash: 'a'.repeat(64),
      predecessorSnapshotHash: 'b'.repeat(64),
    },
    snapshotAt: { amount: '16000', unit: 'sim_millisecond' },
  };
  const facts = (t: FoundationTraceRequest) => ({
    capitalFact: createFoundationFact({
      trace: t,
      factRef: 'FACT.TEST_ONLY.ADAPTER.CAPITAL',
      sourceRef: 'SOURCE.TEST_ONLY.OPERATING.CAPITAL',
      predecessorFactRefs: ['TEST_ONLY.OPERATING.PREDECESSOR'],
      payload: capital,
    }),
    reasonFact: createFoundationFact({
      trace: t,
      factRef: payload.reasonFactRef,
      sourceRef: 'SOURCE.TEST_ONLY.CABINET.RECORD',
      predecessorFactRefs: ['TEST_ONLY.REASON.PREDECESSOR'],
      payload: reason,
    }),
  });
  const scope = {
    worldId: WORLD,
    countryId: COUNTRY,
    worldVersion: '4',
    lastEventSequence: '7',
  };
  const bound = {
    ...trace,
    snapshot: {
      ...trace.snapshot,
      snapshotHash: captainPoliticalCapitalSourceHash(
        { ...scope, ...facts(trace) },
        digest,
      ),
    },
  };
  return { ...scope, trace: bound, ...facts(bound) };
}
function read(): CaptainPoliticalCapitalSourceRead {
  return {
    kind: 'READ',
    snapshot: snapshot(),
    lease: parseWorldWriterLease({
      schemaVersion: 'world-writer-lease-v1',
      worldId: WORLD,
      holderId: 'WORKER_TEST_ONLY_CAP_ADAPTER',
      fencingToken: '5',
      acquiredAtReal: '2026-10-08T00:00:00.000Z',
      renewedAtReal: '2026-10-08T00:00:00.000Z',
      expiresAtReal: '2026-10-08T00:01:00.000Z',
    }),
  };
}

async function harness(
  options: {
    intent?: CanonicalCommand;
    reader?: CaptainPoliticalCapitalRuntimeReader | null;
    onMembership?: () => void;
  } = {},
) {
  const intent = options.intent ?? command();
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
      issuedAt: '2026-10-08T00:00:00.000Z',
      expiresAt: '2026-10-08T01:00:00.000Z',
    },
  };
  let membership: MembershipSnapshot | null = {
    authSubject: principal.authSubject,
    authorizationVersion: '1',
    worldId: worldId(WORLD),
    countryId: countryId(COUNTRY),
    teamId: teamId('TEAM_TEST_ONLY_ADAPTER'),
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
      options.onMembership?.();
      return membership;
    },
  };
  const intake = await authorizeOfficeCapability({
    principal,
    resolver,
    worldId: worldId(WORLD),
    requestedCountryId: countryId(COUNTRY),
    requestedOfficeId: command().officeId!,
    capability: CAPTAIN_POLITICAL_CAPITAL_CAPABILITY,
  });
  let reads = 0;
  let capturedRequest:
    Parameters<CaptainPoliticalCapitalRuntimeReader['read']>[0] | null = null;
  let proof: CommitAuthorizationProof | null = null;
  let draft: AtomicTransitionDraft | null = null;
  let final: FinalCommandReceipt | null = null;
  let effects = 0;
  const reader =
    options.reader === null
      ? null
      : {
          async read(
            input: Parameters<CaptainPoliticalCapitalRuntimeReader['read']>[0],
          ) {
            reads += 1;
            capturedRequest = input;
            return options.reader?.read(input) ?? read();
          },
        };
  const factory = createCaptainPoliticalCapitalCandidateFactory({
    sha256Hex: digest,
    source: createCaptainPoliticalCapitalRuntimeSource({
      reader,
      sha256Hex: digest,
    }),
  });
  return {
    intent,
    factory,
    get draft() {
      return draft;
    },
    get proof() {
      return proof;
    },
    get reads() {
      return reads;
    },
    get effects() {
      return effects;
    },
    get request() {
      return capturedRequest;
    },
    revoke() {
      membership = null;
    },
    async execute() {
      return processQueuedCommand({
        command: intent,
        authorityKind: 'DISCRETIONARY_USER',
        commitSimTime: intent.simTime,
        recordedAtReal: NOW,
        requiredCapability: CAPTAIN_POLITICAL_CAPITAL_CAPABILITY,
        intakeAuthorization: intake,
        persistence: {
          async readFinalReceipt() {
            return final;
          },
          async recordZeroEffectReceipt(receipt) {
            final = receipt;
            return receipt;
          },
          async commitAuthorizedCommand(input) {
            proof = input.commitAuthorization;
            const value = await factory.prepare({
              command: input.command,
              commitAuthorization: input.commitAuthorization,
              observedAtReal: input.recordedAtReal,
            });
            prepareAtomicTransitionCandidate({
              command: intent,
              commitAuthorization: proof,
              draft: value,
              sha256Hex: digest,
            });
            // Capture only; never an alternate durable writer.
            draft = value;
            final = value.receipt;
            effects += 1;
            return { receipt: value.receipt, transition: value.transition };
          },
        },
      });
    },
  };
}

describe('Captain runtime adapter SOURCE_TO_DRAFT_ONLY', () => {
  it('binds actual server read to Core event/replay and complete atomic checkpoint with conserved quantities', async () => {
    const h = await harness();
    const result = await h.execute();
    const draft = h.draft!;
    expect(result.receipt.outcome).toBe('COMMITTED');
    expect(h.request).toEqual({
      worldId: WORLD,
      countryId: COUNTRY,
      commandId: h.intent.commandId,
      commandFingerprint: h.intent.fingerprint,
      expectedWorldVersion: '4',
      simTime: '16000',
      reasonFactRef: payload.reasonFactRef,
      observedAtReal: NOW,
    });
    const event = draft.transition.events[0]!;
    const evidence = JSON.parse(event.canonicalPayload);
    expect(
      evidence.transitions.map(
        (leg: { before: unknown; delta: unknown; after: unknown }) => [
          leg.before,
          leg.delta,
          leg.after,
        ],
      ),
    ).toEqual([
      [q('11.5'), q('-2.75'), q('8.75')],
      [q('6.25'), q('2.75'), q('9')],
    ]);
    for (const field of [
      'opening',
      'generated',
      'total',
      'available',
      'spent',
      'closing',
    ])
      expect(evidence.capitalAfter[field]).toEqual(
        evidence.source.capitalFact.payload[field],
      );
    const before = {
      worldId: WORLD,
      countryId: COUNTRY,
      worldVersion: '4',
      lastEventSequence: '7',
      capital: snapshot().capitalFact.payload,
      applied: [],
    };
    const after = replayCaptainPoliticalCapitalAllocation({
      state: before,
      event,
      sha256Hex: digest,
    });
    expect(after.capital).toEqual(evidence.capitalAfter);
    expect(
      replayCaptainPoliticalCapitalAllocation({
        state: after,
        event,
        sha256Hex: digest,
      }),
    ).toBe(after);
    const checkpoint = draft.currentMaterializations[0]!.payload;
    expect(checkpoint).toMatchObject({
      schemaVersion: 'captain-political-capital-checkpoint-v2',
      worldVersionBefore: '4',
      worldVersionAfter: '5',
      eventSequenceBefore: '7',
      eventSequence: '8',
      eventIds: [event.eventId],
      events: [event],
      sourceSnapshotHash: evidence.source.trace.snapshot.snapshotHash,
      capital: after.capital,
    });
    expect(draft.financialPostingBatches).toEqual([]);
    expect(draft.inventoryPostings).toEqual([]);
    expect(draft.outboxMessages).toHaveLength(1);
    expect((await h.execute()).source).toBe('EXISTING_FINAL');
    expect(h.reads).toBe(1);
    expect(h.effects).toBe(1);
  });

  it('missing reader and exact missing operating/reason source return no draft or fallback', async () => {
    for (const reader of [
      null,
      {
        async read() {
          return {
            kind: 'MISSING' as const,
            missing: ['REASON_RECORD' as const],
          };
        },
      },
      {
        async read() {
          return {
            kind: 'MISSING' as const,
            missing: ['POLITICAL_CAPITAL_EVENT_LINEAGE' as const],
          };
        },
      },
    ]) {
      const h = await harness({ reader });
      await expect(h.execute()).rejects.toMatchObject({
        code: 'TRANSITION_EVIDENCE_INVALID',
      });
      expect(h.draft).toBeNull();
      expect(h.effects).toBe(0);
    }
  });

  it.each([
    'world',
    'country',
    'head',
    'time',
    'hash',
    'reason',
    'extra',
    'insufficient',
    'sequence',
  ] as const)('refuses wrong actual read %s', async (fault) => {
    const supplied = read();
    if (supplied.kind !== 'READ') throw new Error('fixture');
    let value = supplied.snapshot;
    if (fault === 'world')
      value = { ...value, worldId: 'WORLD_TEST_ONLY_OTHER' };
    if (fault === 'country') value = { ...value, countryId: 'COUNTRY_02' };
    if (fault === 'head') value = { ...value, worldVersion: '3' };
    if (fault === 'time')
      value = {
        ...value,
        trace: {
          ...value.trace,
          snapshotAt: { amount: '17000', unit: 'sim_millisecond' },
        },
      };
    if (fault === 'hash')
      value = {
        ...value,
        trace: {
          ...value.trace,
          snapshot: { ...value.trace.snapshot, snapshotHash: 'c'.repeat(64) },
        },
      };
    if (fault === 'sequence') value = { ...value, lastEventSequence: '-1' };
    if (fault === 'extra')
      value = {
        ...value,
        sourceAuthority: true,
      } as CaptainPoliticalCapitalSourceSnapshot;
    const intent =
      fault === 'insufficient'
        ? command({ payload: { ...payload, amount: q('12') } })
        : fault === 'reason'
          ? command({
              payload: { ...payload, reasonFactRef: 'FACT.TEST_ONLY.MISSING' },
            })
          : command();
    const h = await harness({
      intent,
      reader: {
        async read() {
          return { ...supplied, snapshot: value };
        },
      },
    });
    await expect(h.execute()).rejects.toThrow();
    expect(h.effects).toBe(0);
    expect(h.draft).toBeNull();
  });

  it('revocation during awaited read refuses at second authorization', async () => {
    let revoke = () => {};
    const h = await harness({
      reader: {
        async read() {
          revoke();
          return read();
        },
      },
    });
    revoke = () => h.revoke();
    await expect(h.execute()).rejects.toMatchObject({
      code: 'AUTHORIZATION_DENIED',
    });
    expect(h.reads).toBe(1);
    expect(h.effects).toBe(0);
    expect(h.draft).toBeNull();
  });

  it.each(['blank', 'country'] as const)(
    'refuses an actual hash-bound but invalid reason record: %s',
    async (fault) => {
      const supplied = read();
      if (supplied.kind !== 'READ') throw new Error('fixture');
      const previous = supplied.snapshot;
      const reason = {
        ...previous.reasonFact.payload,
        ...(fault === 'blank' ? { reason: ' ' } : { countryRef: 'COUNTRY_02' }),
      };
      const provisional = {
        ...previous,
        reasonFact: {
          ...previous.reasonFact,
          payload: reason,
          canonicalPayload: canonicalSerialize(reason),
        },
      };
      const trace = {
        ...previous.trace,
        snapshot: {
          ...previous.trace.snapshot,
          snapshotHash: captainPoliticalCapitalSourceHash(provisional, digest),
        },
      };
      const value = {
        ...previous,
        trace,
        capitalFact: createFoundationFact({
          trace,
          factRef: previous.capitalFact.factRef,
          sourceRef: previous.capitalFact.sourceRef,
          predecessorFactRefs: previous.capitalFact.predecessorFactRefs,
          payload: previous.capitalFact.payload,
        }),
        reasonFact: createFoundationFact({
          trace,
          factRef: previous.reasonFact.factRef,
          sourceRef: previous.reasonFact.sourceRef,
          predecessorFactRefs: previous.reasonFact.predecessorFactRefs,
          payload: reason,
        }),
      };
      const h = await harness({
        reader: {
          async read() {
            return { ...supplied, snapshot: value };
          },
        },
      });
      await expect(h.execute()).rejects.toThrow(
        'Missing or mismatched actual country reason record',
      );
      expect(h.effects).toBe(0);
      expect(h.draft).toBeNull();
    },
  );

  it('reader aliases cannot change the source across post-read authorization', async () => {
    const supplied = read();
    if (supplied.kind !== 'READ') throw new Error('fixture');
    let returned = false;
    const h = await harness({
      reader: {
        async read() {
          returned = true;
          return supplied;
        },
      },
      onMembership() {
        if (returned)
          Object.assign(
            supplied.snapshot.capitalFact.payload.buckets[0]!.balance,
            { amount: '999' },
          );
      },
    });
    await h.execute();
    const eventPayload = JSON.parse(
      h.draft!.transition.events[0]!.canonicalPayload,
    );
    expect(eventPayload.source.capitalFact.payload.buckets[0].balance).toEqual(
      q('11.5'),
    );
    expect(eventPayload.capitalAfter.buckets[0].balance).toEqual(q('8.75'));
  });

  it('forged or command-mismatched proof refuses before the reader', async () => {
    const h = await harness();
    await h.execute();
    await expect(
      h.factory.prepare({
        command: h.intent,
        commitAuthorization: { ...h.proof } as CommitAuthorizationProof,
        observedAtReal: NOW,
      }),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
    await expect(
      h.factory.prepare({
        command: command({ commandId: 'COMMAND_TEST_ONLY_MISMATCH' }),
        commitAuthorization: h.proof,
        observedAtReal: NOW,
      }),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
    expect(h.reads).toBe(1);
  });

  it('future-renewed or wrong-world lease produces no draft', async () => {
    const supplied = read();
    if (supplied.kind !== 'READ') throw new Error('fixture');
    for (const patch of [
      { renewedAtReal: '2026-10-08T00:00:02.000Z' },
      { worldId: 'WORLD_TEST_ONLY_OTHER' },
    ]) {
      const lease = parseWorldWriterLease({ ...supplied.lease, ...patch });
      const h = await harness({
        reader: {
          async read() {
            return { ...supplied, lease };
          },
        },
      });
      await expect(h.execute()).rejects.toThrow();
      expect(h.effects).toBe(0);
      expect(h.draft).toBeNull();
    }
  });

  it('expanded intent refuses before reader, without source-authority flags', async () => {
    const h = await harness({
      intent: command({ payload: { ...payload, balance: q('999') } }),
    });
    await expect(h.execute()).rejects.toThrow();
    expect(h.reads).toBe(0);
    expect(h.effects).toBe(0);
    expect(canonicalSerialize(payload)).not.toContain('sourceAuthority');
  });
});
