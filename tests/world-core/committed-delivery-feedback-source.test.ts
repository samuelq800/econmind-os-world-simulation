import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COMMAND_SCHEMA_VERSION,
  EVENT_SCHEMA_VERSION,
  Money,
  createAuthoritativeTransition,
  createFinalCommandReceipt,
  createFinancialPostingBatch,
  parseAuthoritativeEvent,
  parseCanonicalCommand,
} from '@econmind/core';
import { createNarrowTreasuryGcuDeliveryCandidateFactory } from '../../apps/world-worker/src/persistence/narrow-treasury-gcu-delivery-draft.js';
import {
  createIsolatedCommittedDeliveryFeedbackSourceForTestOnly,
  loadCommittedDeliveryFeedbackSource,
  readIsolatedCommittedDeliveryFeedbackForTestOnly,
  type IsolatedForeignReader,
  type IsolatedForeignSnapshot,
} from '../../apps/world-worker/src/projections/committed-delivery-feedback-source.js';
import {
  AT,
  preparedTwoCountryDelivery,
  sha256,
} from '../support/v29-worker-two-delivery-fixture.js';

// Canonical factory-created fixtures only. No SQL/durable COMMIT is performed.
async function fixture() {
  const p = preparedTwoCountryDelivery('G_FOREIGN_V2_SOURCE');
  const draft = await createNarrowTreasuryGcuDeliveryCandidateFactory({
    source: p.source,
    sha256Hex: sha256,
  }).prepare({
    command: p.delivery,
    commitAuthorization: null,
    observedAtReal: AT,
  });
  const receipt = (
    command: typeof p.transfer,
    transition: typeof p.reserve.transition,
  ) =>
    createFinalCommandReceipt({
      command,
      transition,
      outcome: 'COMMITTED',
      reasonCode: null,
      simTime: command.simTime,
      recordedAtReal: AT,
    });
  const sourceHead = {
    worldId: p.fixture.worldId,
    worldVersion: '3',
    eventSequence: '3',
  };
  const reader: IsolatedForeignReader = {
    subject: 'SUBJECT_G_FOREIGN_BUYER',
    countryId: p.fixture.countries.buyer,
    worldId: p.fixture.worldId,
    teamId: 'TEAM_G_FOREIGN_BUYER',
    officeId: 'TRADE',
    authorizationRevision: '1',
    currentAuthorizationRevision: '1',
    authenticated: true,
    worldActive: true,
    seatActive: true,
    seatRevoked: false,
    entitlement: {
      subject: 'SUBJECT_G_FOREIGN_BUYER',
      countryId: p.fixture.countries.buyer,
      worldId: p.fixture.worldId,
      teamId: 'TEAM_G_FOREIGN_BUYER',
      officeId: 'TRADE',
      authorizationRevision: '1',
      classification: 'OFFICE_PRIVATE',
      scopeKey:
        'OFFICE_' +
        Buffer.from(p.fixture.countries.buyer).toString('hex').toUpperCase() +
        '_5452414445',
      active: true,
      revoked: false,
    },
    sourceHead,
    heldSnapshotKey: 'G_FOREIGN_HELD_3',
    rlsReadPermitted: true,
  };
  const input: IsolatedForeignSnapshot = {
    seed: p.fixture.openingSeed,
    openingSeedFingerprint: p.fixture.openingSeed.fingerprint,
    sourceHead,
    heldSnapshotKey: reader.heldSnapshotKey,
    reader,
    transitions: [
      {
        command: p.transfer,
        transition: p.reserve.transition,
        receipt: receipt(p.transfer, p.reserve.transition),
        inventoryPostings: [p.reservationPosting],
        financialPostingBatches: [],
      },
      {
        command: p.shipment,
        transition: p.ship.transition,
        receipt: receipt(p.shipment, p.ship.transition),
        inventoryPostings: [p.shipmentPosting],
        financialPostingBatches: [],
      },
      {
        command: p.delivery,
        transition: draft.transition,
        receipt: draft.receipt,
        inventoryPostings: draft.inventoryPostings,
        financialPostingBatches: draft.financialPostingBatches,
      },
    ],
  };
  return { p, draft, input };
}
function append(
  input: IsolatedForeignSnapshot,
  options: {
    corrects?: string;
    deliveryPayload?: string;
    unknownDelivery?: boolean;
  } = {},
): IsolatedForeignSnapshot {
  const before = input.sourceHead.worldVersion;
  const after = (BigInt(before) + 1n).toString();
  const prior = input.transitions.at(-1)!.command;
  const command = parseCanonicalCommand(
    {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      commandId: 'G_FOREIGN_APPENDED_COMMAND',
      idempotencyKey: 'G_FOREIGN_APPENDED_KEY',
      commandType: options.unknownDelivery
        ? 'CORE_GOODS_DELIVERY_V2'
        : options.deliveryPayload
          ? 'CORE_GOODS_DELIVERY_V1'
          : 'FOREIGN_TEST_UNRELATED_V1',
      worldId: prior.worldId,
      actorId: prior.actorId,
      authSubject: prior.authSubject,
      countryId: prior.countryId,
      officeId: null,
      expectedWorldVersion: before,
      simTime: '10400',
      submittedAtReal: AT,
      correlationId: 'G_FOREIGN_APPENDED_CORRELATION',
      payload: options.deliveryPayload
        ? JSON.parse(options.deliveryPayload)
        : {},
    },
    sha256,
  );
  const event = parseAuthoritativeEvent(
    {
      schemaVersion: EVENT_SCHEMA_VERSION,
      eventId: 'G_FOREIGN_APPENDED_EVENT',
      eventType: options.unknownDelivery
        ? 'NARROW_TREASURY_GCU_DELIVERED_V2'
        : options.deliveryPayload
          ? 'NARROW_TREASURY_GCU_DELIVERED_V1'
          : 'FOREIGN_TEST_UNRELATED_V1',
      worldId: prior.worldId,
      causationCommandId: command.commandId,
      correlationId: command.correlationId,
      worldVersion: after,
      sequence: (BigInt(input.sourceHead.eventSequence) + 1n).toString(),
      simTime: '10400',
      recordedAtReal: AT,
      correctsEventId: options.corrects ?? null,
      payload: options.deliveryPayload
        ? JSON.parse(
            input.transitions.at(-1)!.transition.events[0]!.canonicalPayload,
          )
        : {},
    },
    sha256,
  );
  const transition = createAuthoritativeTransition({
    command,
    worldVersionBefore: before,
    worldVersionAfter: after,
    events: [event],
  });
  const receipt = createFinalCommandReceipt({
    command,
    transition,
    outcome: 'COMMITTED',
    reasonCode: null,
    simTime: command.simTime,
    recordedAtReal: AT,
  });
  const sourceHead = {
    ...input.sourceHead,
    worldVersion: after,
    eventSequence: event.sequence,
  };
  return {
    ...input,
    sourceHead,
    reader: { ...input.reader, sourceHead },
    transitions: [
      ...input.transitions,
      {
        command,
        transition,
        receipt,
        inventoryPostings: [],
        financialPostingBatches: [],
      },
    ],
  };
}
const load = (input: IsolatedForeignSnapshot) =>
  createIsolatedCommittedDeliveryFeedbackSourceForTestOnly().load(input);
afterEach(() => vi.unstubAllEnvs());

describe('FOREIGN V2 isolated committed source, not durable COMMIT evidence', () => {
  it('accepts original Atomic/Core delivery fixture only after full receipt and two-ledger replay', async () => {
    const { input, draft } = await fixture();
    const handle = load(input);
    expect(draft.receipt.outcome).toBe('COMMITTED');
    expect(
      readIsolatedCommittedDeliveryFeedbackForTestOnly(handle, input.reader)
        .status,
    ).toBe('VALIDATED');
    expect(Object.keys(handle)).toEqual(['schemaVersion', 'admission']);
    expect(JSON.stringify(handle)).not.toContain(
      input.transitions[2]!.command.commandId,
    );
  });
  it.each(['inventoryPostings', 'financialPostingBatches'] as const)(
    'rejects absent or duplicate %s',
    async (key) => {
      const { input } = await fixture();
      const last = input.transitions[2]!;
      for (const value of [[], [...last[key], ...last[key]]]) {
        expect(() =>
          load({
            ...input,
            transitions: [
              ...input.transitions.slice(0, 2),
              { ...last, [key]: value },
            ],
          }),
        ).toThrow();
      }
    },
  );
  it('rejects a valid balanced financial posting with the wrong actual settlement', async () => {
    const { input } = await fixture();
    const last = input.transitions[2]!;
    const batch = last.financialPostingBatches[0]!;
    const altered = createFinancialPostingBatch(
      {
        ...batch,
        command: last.command,
        transition: last.transition,
        legs: batch.legs.map((leg) => ({
          ...leg,
          amount: Money.from('5', 'GCU'),
        })),
      },
      sha256,
    );
    expect(() =>
      load({
        ...input,
        transitions: [
          ...input.transitions.slice(0, 2),
          { ...last, financialPostingBatches: [altered] },
        ],
      }),
    ).toThrow();
  });
  it.each(['commandFingerprint', 'eventIds', 'outcome', 'commandId'] as const)(
    'rejects mismatched final receipt %s',
    async (key) => {
      const { input } = await fixture();
      const last = input.transitions[2]!;
      const changes = {
        commandFingerprint: 'sha256:' + '0'.repeat(64),
        eventIds: [],
        outcome: 'REJECTED',
        commandId: 'OTHER_COMMAND',
      };
      expect(() =>
        load({
          ...input,
          transitions: [
            ...input.transitions.slice(0, 2),
            { ...last, receipt: { ...last.receipt, [key]: changes[key] } },
          ],
        }),
      ).toThrow();
    },
  );
  it('rejects absent parent/shipment and complete-prefix gaps', async () => {
    const { input } = await fixture();
    for (const transitions of [
      input.transitions.slice(1),
      [input.transitions[0]!, input.transitions[2]!],
      [...input.transitions, input.transitions[2]!],
    ])
      expect(() => load({ ...input, transitions })).toThrow();
  });
  it('rejects receipt extra fields/invalid audit timestamp and another transition posting', async () => {
    const { input } = await fixture();
    const last = input.transitions[2]!;
    for (const receipt of [
      Object.assign({}, last.receipt, { rawCause: 'PRIVATE' }),
      { ...last.receipt, recordedAtReal: 'INVALID_AUDIT_TIME' },
    ])
      expect(() =>
        load({
          ...input,
          transitions: [...input.transitions.slice(0, 2), { ...last, receipt }],
        }),
      ).toThrow();
    expect(() =>
      load({
        ...input,
        transitions: [
          ...input.transitions.slice(0, 2),
          {
            ...last,
            inventoryPostings: input.transitions[1]!.inventoryPostings,
          },
        ],
      }),
    ).toThrow();
  });
  it('rejects wrong genesis seed pin, World, head and mixed snapshot', async () => {
    const { input } = await fixture();
    expect(() =>
      load({ ...input, openingSeedFingerprint: 'sha256:' + '0'.repeat(64) }),
    ).toThrow();
    expect(() =>
      load({
        ...input,
        sourceHead: { ...input.sourceHead, worldId: 'WORLD_OTHER' },
      }),
    ).toThrow();
    expect(() =>
      load({
        ...input,
        sourceHead: { ...input.sourceHead, worldVersion: '4' },
      }),
    ).toThrow();
    expect(() =>
      load({ ...input, heldSnapshotKey: 'OTHER_SNAPSHOT' }),
    ).toThrow();
  });
  it('does not treat parent Reserve FINAL or Ship as delivery', async () => {
    const { input } = await fixture();
    for (const size of [1, 2]) {
      const sourceHead = {
        ...input.sourceHead,
        worldVersion: String(size),
        eventSequence: String(size),
      };
      const reduced = {
        ...input,
        sourceHead,
        reader: { ...input.reader, sourceHead },
        transitions: input.transitions.slice(0, size),
      };
      expect(
        readIsolatedCommittedDeliveryFeedbackForTestOnly(
          load(reduced),
          reduced.reader,
        ).reason,
      ).toBe('NO_COMMITTED_DELIVERY');
    }
  });
  it('latest bad receipt/postings or unknown delivery schema cannot fall back to older valid history', async () => {
    const { input, p } = await fixture();
    for (const changed of [
      append(input, { deliveryPayload: p.delivery.canonicalPayload }),
      append(input, { unknownDelivery: true }),
    ])
      expect(() => load(changed)).toThrow();
  });
  it('a later correction invalidates latest completion without an older fallback', async () => {
    const { input } = await fixture();
    const changed = append(input, {
      corrects: input.transitions[2]!.transition.events[0]!.eventId,
    });
    expect(
      readIsolatedCommittedDeliveryFeedbackForTestOnly(
        load(changed),
        changed.reader,
      ).reason,
    ).toBe('CAUSE_CORRECTED');
  });
  it.each([
    'authenticated',
    'worldActive',
    'seatActive',
    'rlsReadPermitted',
  ] as const)('denies missing current reader predicate %s', async (key) => {
    const { input } = await fixture();
    expect(() =>
      load({ ...input, reader: { ...input.reader, [key]: false } }),
    ).toThrow();
  });
  it('denies revoked seat/entitlement and wrong subject/team/Office/revision without transferring another holder rights', async () => {
    const { input } = await fixture();
    const changes = [
      { seatRevoked: true },
      { officeId: 'FINANCE' },
      { currentAuthorizationRevision: '2' },
      { subject: 'OTHER_SUBJECT' },
      { teamId: 'OTHER_TEAM' },
      { entitlement: { ...input.reader.entitlement, revoked: true } },
      { entitlement: { ...input.reader.entitlement, active: false } },
    ];
    for (const change of changes)
      expect(() =>
        load({ ...input, reader: { ...input.reader, ...change } }),
      ).toThrow();
  });
  it('denies third-country bilateral scope rather than exposing another party', async () => {
    const { input } = await fixture();
    const countryId = 'COUNTRY_FOREIGN_THIRD';
    const reader = {
      ...input.reader,
      countryId,
      entitlement: {
        ...input.reader.entitlement,
        countryId,
        scopeKey:
          'OFFICE_' +
          Buffer.from(countryId).toString('hex').toUpperCase() +
          '_5452414445',
      },
    };
    expect(() => load({ ...input, reader })).toThrow();
  });
  it('rejects caller admission/hidden keys and cloned handles', async () => {
    const { input } = await fixture();
    expect(() => load(Object.assign({}, input, { admitted: true }))).toThrow();
    const reader = Object.defineProperty({ ...input.reader }, 'secretGrant', {
      value: true,
    });
    expect(() => load({ ...input, reader })).toThrow();
    const handle = load(input);
    expect(() =>
      readIsolatedCommittedDeliveryFeedbackForTestOnly(
        { ...handle },
        input.reader,
      ),
    ).toThrow();
  });
  it('revalidates each use and never promotes an old handle to a later head', async () => {
    const { input } = await fixture();
    const handle = load(input);
    const later = append(input);
    expect(() =>
      readIsolatedCommittedDeliveryFeedbackForTestOnly(handle, later.reader),
    ).toThrow();
    expect(() =>
      readIsolatedCommittedDeliveryFeedbackForTestOnly(handle, {
        ...input.reader,
        seatRevoked: true,
      }),
    ).toThrow();
    expect(
      readIsolatedCommittedDeliveryFeedbackForTestOnly(
        load(later),
        later.reader,
      ).status,
    ).toBe('VALIDATED');
  });
  it('redacts raw references from source validation errors', async () => {
    const { input } = await fixture();
    const last = input.transitions[2]!;
    try {
      load({
        ...input,
        transitions: [
          ...input.transitions.slice(0, 2),
          { ...last, inventoryPostings: [] },
        ],
      });
      throw new Error('EXPECTED_FAILURE');
    } catch (error) {
      expect(String(error)).not.toContain(last.command.commandId);
      expect(String(error)).not.toContain(last.transition.events[0]!.eventId);
    }
  });
  it('normal entry always denies and actual production environment rejects the test constructor and retained operations', async () => {
    const { input } = await fixture();
    const source = createIsolatedCommittedDeliveryFeedbackSourceForTestOnly();
    const handle = source.load(input);
    expect(
      loadCommittedDeliveryFeedbackSource({ admitted: true, handle }),
    ).toEqual({ status: 'UNAVAILABLE', reason: 'SOURCE_NOT_ADMITTED' });
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => source.load(input)).toThrow('ISOLATED_TEST_RUNTIME_REQUIRED');
    expect(() =>
      readIsolatedCommittedDeliveryFeedbackForTestOnly(handle, input.reader),
    ).toThrow('ISOLATED_TEST_RUNTIME_REQUIRED');
    expect(() =>
      createIsolatedCommittedDeliveryFeedbackSourceForTestOnly(),
    ).toThrow('ISOLATED_TEST_RUNTIME_REQUIRED');
  });
});
