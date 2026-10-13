import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canonicalSerialize,
  createFinalCommandReceipt,
  createAuthoritativeTransition,
  parseCanonicalCommand,
  parseAuthoritativeEvent,
  COMMAND_SCHEMA_VERSION,
  EVENT_SCHEMA_VERSION,
} from '@econmind/core';
import { createNarrowTreasuryGcuDeliveryCandidateFactory } from '../../apps/world-worker/src/persistence/narrow-treasury-gcu-delivery-draft.js';
import {
  createIsolatedCommittedDeliveryFeedbackSourceForTestOnly,
  type IsolatedForeignReader,
  type IsolatedForeignSnapshot,
} from '../../apps/world-worker/src/projections/committed-delivery-feedback-source.js';
import {
  createIsolatedForeignDeliveryFeedbackProjectorForTestOnly,
  projectForeignDeliveryFeedback,
} from '../../apps/world-worker/src/projections/foreign-delivery-feedback-projector.js';
import {
  AT,
  preparedTwoCountryDelivery,
  sha256,
} from '../support/v29-worker-two-delivery-fixture.js';

async function fixture(side: 'BUYER' | 'SELLER' = 'BUYER') {
  const p = preparedTwoCountryDelivery('G_FOREIGN_V2_MODEL');
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
  const countryId =
    side === 'BUYER' ? p.fixture.countries.buyer : p.fixture.countries.seller;
  const sourceHead = {
    worldId: p.fixture.worldId,
    worldVersion: '3',
    eventSequence: '3',
  };
  const reader: IsolatedForeignReader = {
    subject: 'SUBJECT_G_MODEL_' + side,
    worldId: p.fixture.worldId,
    countryId,
    teamId: 'TEAM_G_MODEL_' + side,
    officeId: 'TRADE',
    authorizationRevision: '1',
    currentAuthorizationRevision: '1',
    authenticated: true,
    worldActive: true,
    seatActive: true,
    seatRevoked: false,
    entitlement: {
      subject: 'SUBJECT_G_MODEL_' + side,
      worldId: p.fixture.worldId,
      countryId,
      teamId: 'TEAM_G_MODEL_' + side,
      officeId: 'TRADE',
      authorizationRevision: '1',
      classification: 'OFFICE_PRIVATE',
      scopeKey:
        'OFFICE_' +
        Buffer.from(countryId).toString('hex').toUpperCase() +
        '_5452414445',
      active: true,
      revoked: false,
    },
    sourceHead,
    heldSnapshotKey: 'G_FOREIGN_MODEL_HELD',
    rlsReadPermitted: true,
  };
  const input: IsolatedForeignSnapshot = {
    seed: p.fixture.openingSeed,
    openingSeedFingerprint: p.fixture.openingSeed.fingerprint,
    sourceHead,
    reader,
    heldSnapshotKey: reader.heldSnapshotKey,
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
  const handle =
    createIsolatedCommittedDeliveryFeedbackSourceForTestOnly().load(input);
  const projector = createIsolatedForeignDeliveryFeedbackProjectorForTestOnly();
  return {
    p,
    input,
    handle,
    projector,
    packet: projector.project({ handle, reader }),
  };
}
function itemOf(value: Awaited<ReturnType<typeof fixture>>) {
  const item = value.packet.government.items[0];
  if (!item) throw new Error('EXPECTED_TEST_ONLY_ACK');
  return item;
}
const digest = (value: unknown) =>
  'sha256:' +
  createHash('sha256').update(canonicalSerialize(value)).digest('hex');
afterEach(() => vi.unstubAllEnvs());

describe('FOREIGN V2 private fixed-model test projector', () => {
  it.each(['BUYER', 'SELLER'] as const)(
    'derives fixed %s SYSTEM_SIMULATED caption and only opaque source references',
    async (side) => {
      const f = await fixture(side);
      const item = itemOf(f);
      expect(f.packet.schemaVersion).toBe('unit-test-only-foreign-feedback-v2');
      expect(f.packet.admission).toBe('ISOLATED_TEST_ONLY_NOT_ADMITTED');
      expect(item.recipientSide).toBe(side);
      expect(item.actorKind).toBe('SYSTEM_SIMULATED');
      expect(item.text).toBe(
        side === 'BUYER'
          ? '外方回应 · 系统模拟：已核验来自交易对方的最近一次跨国交付与结算。此提示不是对方玩家发言，也不表示新的合作承诺。'
          : '外方回应 · 系统模拟：已核验发往交易对方的最近一次跨国交付与结算。此提示不是对方玩家发言，也不表示新的合作承诺。',
      );
      expect(item.sourceRef).toBe(
        digest([
          'FOREIGN_ACK_SOURCE_REF_V2',
          f.input.sourceHead.worldId,
          '2',
          f.packet.scopeKey,
          f.input.transitions[2]!.transition.events[0]!.eventId,
          f.input.transitions[2]!.transition.events[0]!.fingerprint,
        ]),
      );
      expect(item.model.rulesHash).toBe(
        'sha256:0e7d16fb443ac9ef2030a8f7fcabc25e8e2b7fe741fe39b0d61c0f4deeab272c',
      );
      expect(item.sourceRef).toMatch(/^sha256:[a-f0-9]{64}$/u);
      expect(item.feedbackId).toMatch(/^sha256:[a-f0-9]{64}$/u);
      expect(
        f.projector.validateWireItem(item, {
          handle: f.handle,
          reader: f.input.reader,
        }),
      ).toBe(true);
      expect(Object.isFrozen(item)).toBe(true);
      expect(Object.isFrozen(item.model)).toBe(true);
    },
  );
  it('has stable IDs/text across rereads and separately validated later unrelated complete head', async () => {
    const f = await fixture();
    const first = itemOf(f);
    expect(
      f.projector.project({ handle: f.handle, reader: f.input.reader }),
    ).toEqual(f.packet);
    const prior = f.input.transitions[2]!.command;
    const command = parseCanonicalCommand(
      {
        schemaVersion: COMMAND_SCHEMA_VERSION,
        commandType: 'FOREIGN_UNRELATED_PROPOSAL_V1',
        commandId: 'G_FOREIGN_MODEL_LATER',
        idempotencyKey: 'G_FOREIGN_MODEL_LATER_KEY',
        worldId: prior.worldId,
        actorId: prior.actorId,
        authSubject: prior.authSubject,
        countryId: prior.countryId,
        officeId: 'TRADE',
        expectedWorldVersion: '3',
        simTime: '10400',
        submittedAtReal: AT,
        correlationId: 'G_FOREIGN_MODEL_LATER_CORRELATION',
        payload: {},
      },
      sha256,
    );
    const event = parseAuthoritativeEvent(
      {
        schemaVersion: EVENT_SCHEMA_VERSION,
        eventId: 'G_FOREIGN_MODEL_LATER_EVENT',
        eventType: 'FOREIGN_UNRELATED_PROPOSAL_V1',
        worldId: prior.worldId,
        causationCommandId: command.commandId,
        correlationId: command.correlationId,
        worldVersion: '4',
        sequence: '4',
        simTime: '10400',
        recordedAtReal: AT,
        correctsEventId: null,
        payload: {},
      },
      sha256,
    );
    const transition = createAuthoritativeTransition({
      command,
      worldVersionBefore: '3',
      worldVersionAfter: '4',
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
      ...f.input.sourceHead,
      worldVersion: '4',
      eventSequence: '4',
    };
    const later = {
      ...f.input,
      sourceHead,
      reader: { ...f.input.reader, sourceHead },
      transitions: [
        ...f.input.transitions,
        {
          command,
          transition,
          receipt,
          inventoryPostings: [],
          financialPostingBatches: [],
        },
      ],
    };
    expect(() =>
      f.projector.project({ handle: f.handle, reader: later.reader }),
    ).toThrow();
    const newHandle =
      createIsolatedCommittedDeliveryFeedbackSourceForTestOnly().load(later);
    expect(
      f.projector.project({ handle: newHandle, reader: later.reader })
        .government.items[0],
    ).toEqual(first);
  });
  it('separates bilateral opaque identities and never accepts cross-party handle reuse', async () => {
    const buyer = await fixture('BUYER');
    const seller = await fixture('SELLER');
    expect(itemOf(buyer).sourceRef).not.toBe(itemOf(seller).sourceRef);
    expect(itemOf(buyer).feedbackId).not.toBe(itemOf(seller).feedbackId);
    expect(itemOf(buyer).counterpartyCountryId).toBe(
      itemOf(seller).recipientCountryId,
    );
    expect(() =>
      buyer.projector.project({
        handle: buyer.handle,
        reader: seller.input.reader,
      }),
    ).toThrow();
  });
  it('minimal entitlement ack requires no action capability field and grants no action API', async () => {
    const f = await fixture();
    const retainedRead = { ...f.input.reader };
    expect(Object.hasOwn(retainedRead, 'capability')).toBe(false);
    expect(
      f.projector.project({ handle: f.handle, reader: retainedRead }),
    ).toEqual(f.packet);
    expect(Object.keys(f.projector).sort()).toEqual([
      'admission',
      'model',
      'project',
      'validateWireItem',
    ]);
    // No action service is invoked: this does not certify a real API denial.
  });
  it.each([
    'eventId',
    'commandId',
    'receiptId',
    'eventFingerprint',
    'postingId',
    'amount',
    'commodity',
    'account',
    'route',
    'player',
    'signature',
  ] as const)('rejects raw/private extra wire field %s', async (key) => {
    const f = await fixture();
    expect(
      f.projector.validateWireItem(
        { ...itemOf(f), [key]: 'PRIVATE_RAW_VALUE' },
        { handle: f.handle, reader: f.input.reader },
      ),
    ).toBe(false);
  });
  it('wire serialization contains no raw IDs/fingerprints/private facts from canonical proof', async () => {
    const f = await fixture();
    const wire = JSON.stringify(f.packet);
    for (const value of f.input.transitions) {
      expect(wire).not.toContain(value.command.commandId);
      expect(wire).not.toContain(value.command.fingerprint);
      for (const event of value.transition.events) {
        expect(wire).not.toContain(event.eventId);
        expect(wire).not.toContain(event.fingerprint);
      }
      for (const posting of value.inventoryPostings) {
        expect(wire).not.toContain(posting.postingId);
        expect(wire).not.toContain(posting.fingerprint);
      }
      for (const batch of value.financialPostingBatches) {
        expect(wire).not.toContain(batch.batchId);
        expect(wire).not.toContain(batch.fingerprint);
      }
    }
    expect(wire).not.toContain(f.input.reader.subject);
    expect(wire).not.toContain('GRAIN');
  });
  it('rejects V1 substitution, same-version wrong hash, text/raw aliases and nested hidden fields', async () => {
    const f = await fixture();
    const item = itemOf(f);
    const input = { handle: f.handle, reader: f.input.reader };
    for (const model of [
      { ...item.model, version: '1' },
      { ...item.model, rulesHash: 'sha256:' + '0'.repeat(64) },
      { ...item.model, commandId: 'RAW_CAUSE' },
    ])
      expect(f.projector.validateWireItem({ ...item, model }, input)).toBe(
        false,
      );
    for (const altered of [
      { ...item, sourceRef: f.input.transitions[2]!.command.commandId },
      { ...item, text: '对方政府同意' },
      { ...item, feedbackId: 'sha256:bad' },
    ])
      expect(f.projector.validateWireItem(altered, input)).toBe(false);
    expect(
      f.projector.validateWireItem(
        Object.defineProperty({ ...item }, 'hidden', { value: 'RAW' }),
        input,
      ),
    ).toBe(false);
    expect(
      f.projector.validateWireItem(
        {
          ...item,
          model: Object.defineProperty({ ...item.model }, 'hidden', {
            value: 'RAW',
          }),
        },
        input,
      ),
    ).toBe(false);
  });
  it('rejects caller source/model admission, cloned handles and additional top-level project fields', async () => {
    const f = await fixture();
    expect(() =>
      f.projector.project({ handle: { ...f.handle }, reader: f.input.reader }),
    ).toThrow();
    expect(() =>
      f.projector.project(
        Object.assign(
          { handle: f.handle, reader: f.input.reader },
          { admitted: true },
        ),
      ),
    ).toThrow();
    expect(() =>
      Reflect.apply(
        createIsolatedForeignDeliveryFeedbackProjectorForTestOnly,
        undefined,
        [{ admitted: true }],
      ),
    ).toThrow();
  });
  it('revalidates entitlement each use despite a valid shared snapshot', async () => {
    const f = await fixture();
    expect(() =>
      f.projector.project({
        handle: f.handle,
        reader: {
          ...f.input.reader,
          entitlement: { ...f.input.reader.entitlement, revoked: true },
        },
      }),
    ).toThrow();
  });
  it('rejects noncanonical input accessors before reading a private handle', async () => {
    const f = await fixture();
    const input = Object.defineProperty({ reader: f.input.reader }, 'handle', {
      enumerable: true,
      get() {
        throw new Error('PRIVATE_RAW_CAUSE');
      },
    });
    expect(() =>
      Reflect.apply(f.projector.project, undefined, [input]),
    ).toThrow('Canonical serialization rejects accessors');
  });
  it('normal production entry rejects actual test packet and caller admission irrespective of environment', async () => {
    const f = await fixture();
    for (const supplied of [
      f.packet,
      f.handle,
      { admitted: true, source: f.packet },
    ])
      expect(projectForeignDeliveryFeedback(supplied)).toEqual({
        status: 'UNAVAILABLE',
        reason: 'MODEL_NOT_ADMITTED',
        items: [],
      });
    vi.stubEnv('NODE_ENV', 'production');
    expect(() =>
      f.projector.project({ handle: f.handle, reader: f.input.reader }),
    ).toThrow('ISOLATED_TEST_RUNTIME_REQUIRED');
    expect(() =>
      createIsolatedForeignDeliveryFeedbackProjectorForTestOnly(),
    ).toThrow('ISOLATED_TEST_RUNTIME_REQUIRED');
    expect(projectForeignDeliveryFeedback(f.packet).reason).toBe(
      'MODEL_NOT_ADMITTED',
    );
  });
});
