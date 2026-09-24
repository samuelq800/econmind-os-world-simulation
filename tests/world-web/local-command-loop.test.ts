import { createElement } from '../../apps/world-web/node_modules/react';
import { renderToStaticMarkup } from '../../apps/world-web/node_modules/react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type {
  AuthorizedBrowserIdentity,
  BrowserCommandResult,
  BrowserReadResult,
  NarrowTransferDraft,
} from '../../apps/world-web/src/authorized-client/client.js';
import { resolveAuthorizedUi } from '../../apps/world-web/src/prototype/authorized-read-adapter.js';
import {
  commandLifecycleCopy,
  CommandLifecycleStatus,
} from '../../apps/world-web/src/prototype/CommandLifecycleStatus.js';
import { createLocalAuthorizedReadController } from '../../apps/world-web/src/prototype/local-authorized-read.js';

const identity: AuthorizedBrowserIdentity = {
  worldId: 'WORLD_TEST',
  countryId: 'COUNTRY_NORTH',
  officeId: 'FINANCE',
  scopeKey: 'SCOPE_TEST',
  authSubjectId: 'subject-1',
  authorizationRevision: 'revision-1',
  modelVersion: 'model-1',
  projectionVersion: 'projection-1',
  classification: 'OFFICE_PRIVATE',
};

const draft: NarrowTransferDraft = {
  commandId: 'COMMAND_43',
  idempotencyKey: 'KEY_43',
  expectedWorldVersion: '42',
  proposalRef: 'PROPOSAL_43',
  buyerCountryId: 'COUNTRY_SOUTH',
  buyerFinanceApprovalRef: 'APPROVAL_43',
};

function readResult(worldVersion: string): BrowserReadResult {
  const snapshotRef = `projection:${worldVersion}:7`;
  return {
    status: 'PROJECTION',
    source: 'DERIVED_SERVER_PROJECTION',
    worldVersion,
    snapshotRef,
    payload: {
      schemaVersion: 'g02-derived-read-v1',
      worldId: identity.worldId,
      countryId: identity.countryId,
      officeId: identity.officeId,
      scopeKey: identity.scopeKey,
      authSubjectId: identity.authSubjectId,
      authorizationRevision: identity.authorizationRevision,
      modelVersion: identity.modelVersion,
      projectionVersion: identity.projectionVersion,
      classification: identity.classification,
      worldVersion,
      snapshotRef,
      metrics: [
        {
          id: 'GRAIN',
          label: 'Available grain',
          canonicalValue: '128000',
          displayValue: '128k',
          unit: 'tonnes',
          changeLabel: null,
          accessibleSummary: 'Available grain is 128,000 tonnes.',
        },
      ],
      trails: [],
    },
  };
}

const finalReceipt: BrowserCommandResult = {
  status: 'FINAL_RECEIPT',
  receipt: {
    source: 'DURABLE_FINAL_COMMAND_RECEIPT',
    worldId: identity.worldId,
    commandId: draft.commandId,
    idempotencyKey: draft.idempotencyKey,
    commandFingerprint: `sha256:${'a'.repeat(64)}`,
    outcome: 'COMMITTED',
    reasonCode: null,
    worldVersionAfter: '43',
    eventIds: ['EVENT_43'],
    recordedAtReal: '2026-09-24T00:00:00.000Z',
  },
};

const receiptBinding = {
  commandId: draft.commandId,
  idempotencyKey: draft.idempotencyKey,
  commandFingerprint: `sha256:${'a'.repeat(64)}`,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function controllerWith(
  readProjection: () => Promise<BrowserReadResult>,
  submitNarrowTransfer: () => Promise<BrowserCommandResult>,
) {
  const submit = vi.fn(submitNarrowTransfer);
  const controller = createLocalAuthorizedReadController(
    {
      currentIdentity: identity,
      getAccessToken: async () => 'token',
      bridgeOrigin: 'http://127.0.0.1:4102',
    },
    () => ({ readProjection, submitNarrowTransfer: submit }),
    () => '123e4567-e89b-42d3-a456-426614174000',
  );
  return { controller, submit };
}

describe('authorized browser Command → receipt → projection preparation', () => {
  it('requires a current derived G02 read and exact draft version before any POST', async () => {
    const { controller, submit } = controllerWith(
      async () => readResult('42'),
      async () => finalReceipt,
    );
    await controller.submitNarrowTransfer(draft, receiptBinding);
    expect(submit).not.toHaveBeenCalled();
    await controller.readProjection();
    await controller.submitNarrowTransfer(
      { ...draft, expectedWorldVersion: '41' },
      receiptBinding,
    );
    expect(submit).not.toHaveBeenCalled();
    expect(controller.getSnapshot().read?.result.status).toBe('PROJECTION');
  });

  it('does not offer a Command from E’s generic projection payload', async () => {
    const ordinary = {
      ...readResult('42'),
      payload: { cash: '5.00' },
    } as BrowserReadResult;
    const { controller, submit } = controllerWith(
      async () => ordinary,
      async () => finalReceipt,
    );
    await controller.readProjection();
    await controller.submitNarrowTransfer(draft, receiptBinding);
    expect(submit).not.toHaveBeenCalled();
    expect(controller.getSnapshot().phase).toBe('READ_RETURNED');
  });

  it('does not POST without the original trusted key and fingerprint binding', async () => {
    const { controller, submit } = controllerWith(
      async () => readResult('42'),
      async () => finalReceipt,
    );
    await controller.readProjection();
    await controller.submitNarrowTransfer(draft, null);
    await controller.submitNarrowTransfer(draft, {
      ...receiptBinding,
      idempotencyKey: 'OTHER_KEY',
    });
    await controller.submitNarrowTransfer(draft, {
      ...receiptBinding,
      commandFingerprint: 'not-an-authoritative-fingerprint',
    });
    expect(submit).not.toHaveBeenCalled();
    expect(controller.getSnapshot().phase).toBe('READ_RETURNED');
  });

  it('clears the old read while sending, accepts only a final receipt, then refreshes to its version', async () => {
    const pending = deferred<BrowserCommandResult>();
    const reads = vi
      .fn()
      .mockResolvedValueOnce(readResult('42'))
      .mockResolvedValueOnce(readResult('43'));
    const { controller, submit } = controllerWith(reads, () => pending.promise);
    await controller.readProjection();
    const send = controller.submitNarrowTransfer(draft, receiptBinding);
    expect(controller.getSnapshot()).toMatchObject({
      phase: 'SUBMITTING',
      read: null,
      pendingCommandId: draft.commandId,
    });
    expect(
      resolveAuthorizedUi({
        currentIdentity: identity,
        read: null,
        command: null,
        pendingCommandId: draft.commandId,
      }).command.kind,
    ).toBe('SENDING_UNCONFIRMED');
    pending.resolve(finalReceipt);
    await send;
    expect(submit).toHaveBeenCalledOnce();
    expect(controller.wasSubmitted(draft.commandId)).toBe(true);
    expect(controller.getSnapshot()).toMatchObject({
      phase: 'FINAL_RECEIPT',
      read: null,
      command: { result: { status: 'FINAL_RECEIPT' } },
    });
    await controller.readProjection();
    const state = controller.getSnapshot();
    expect(state.phase).toBe('READ_RETURNED');
    const display = resolveAuthorizedUi({
      currentIdentity: identity,
      read: state.read,
      command: state.command,
    });
    expect(display.command.kind).toBe('SUCCEEDED');
    expect(display.read.kind).toBe('CURRENT');
    await controller.submitNarrowTransfer(draft, receiptBinding);
    expect(submit).toHaveBeenCalledOnce();
  });

  it('locks on UNKNOWN without blind retry or refresh until a matching external final receipt is supplied', async () => {
    const reads = vi.fn(async () => readResult('42'));
    const { controller, submit } = controllerWith(reads, async () => ({
      status: 'UNKNOWN',
    }));
    await controller.readProjection();
    await controller.submitNarrowTransfer(draft, receiptBinding);
    expect(controller.getSnapshot()).toMatchObject({
      phase: 'UNKNOWN',
      read: null,
      command: { result: { status: 'UNKNOWN' } },
    });
    await controller.readProjection();
    await controller.submitNarrowTransfer(draft, receiptBinding);
    expect(reads).toHaveBeenCalledOnce();
    expect(submit).toHaveBeenCalledOnce();
    expect(
      controller.reconcileFinalReceipt({
        identity,
        commandId: 'OTHER',
        result: finalReceipt,
      }),
    ).toBe(false);
    expect(
      controller.reconcileFinalReceipt({
        identity,
        commandId: draft.commandId,
        result: {
          ...finalReceipt,
          receipt: { ...finalReceipt.receipt, idempotencyKey: 'OTHER_KEY' },
        },
      }),
    ).toBe(false);
    expect(controller.getSnapshot().phase).toBe('UNKNOWN');
    expect(
      controller.reconcileFinalReceipt({
        identity,
        commandId: draft.commandId,
        result: {
          ...finalReceipt,
          receipt: {
            ...finalReceipt.receipt,
            commandFingerprint: `sha256:${'b'.repeat(64)}`,
          },
        },
      }),
    ).toBe(false);
    expect(controller.getSnapshot().phase).toBe('UNKNOWN');
    expect(
      controller.reconcileFinalReceipt({
        identity,
        commandId: draft.commandId,
        result: finalReceipt,
      }),
    ).toBe(true);
    expect(controller.getSnapshot().phase).toBe('FINAL_RECEIPT');
  });

  it('cannot reconcile externally recorded UNKNOWN without a locally captured trusted binding', () => {
    const { controller } = controllerWith(
      async () => readResult('42'),
      async () => finalReceipt,
    );
    controller.recordUnknown({
      identity,
      commandId: draft.commandId,
      result: { status: 'UNKNOWN' },
    });
    expect(controller.getSnapshot().phase).toBe('UNKNOWN');
    expect(
      controller.reconcileFinalReceipt({
        identity,
        commandId: draft.commandId,
        result: finalReceipt,
      }),
    ).toBe(false);
    expect(controller.getSnapshot().phase).toBe('UNKNOWN');
  });

  it('keeps the original command and fingerprint when host objects change after dispatch', async () => {
    const pending = deferred<BrowserCommandResult>();
    const { controller } = controllerWith(
      async () => readResult('42'),
      () => pending.promise,
    );
    const hostBinding = { ...receiptBinding };
    const hostDraft = { ...draft };
    await controller.readProjection();
    const send = controller.submitNarrowTransfer(hostDraft, hostBinding);
    hostBinding.commandFingerprint = `sha256:${'b'.repeat(64)}`;
    hostDraft.commandId = 'MUTATED_COMMAND';
    pending.resolve({ status: 'UNKNOWN' });
    await send;
    expect(
      controller.reconcileFinalReceipt({
        identity,
        commandId: draft.commandId,
        result: finalReceipt,
      }),
    ).toBe(true);
  });

  it('keeps a rejected durable receipt distinct from a committed World change', async () => {
    const rejected: BrowserCommandResult = {
      ...finalReceipt,
      receipt: {
        ...finalReceipt.receipt,
        outcome: 'REJECTED',
        reasonCode: 'INSUFFICIENT_FUNDS',
        worldVersionAfter: null,
        eventIds: [],
      },
    };
    const { controller } = controllerWith(
      async () => readResult('42'),
      async () => rejected,
    );
    await controller.readProjection();
    await controller.submitNarrowTransfer(draft, receiptBinding);
    const state = controller.getSnapshot();
    expect(state.phase).toBe('FINAL_RECEIPT');
    const copy = commandLifecycleCopy(
      resolveAuthorizedUi({
        currentIdentity: identity,
        read: state.read,
        command: state.command,
      }).command,
    );
    expect(copy.title).toBe('Final receipt · rejected');
    expect(copy.tone).toBe('danger');
    expect(state.read).toBeNull();
  });

  it('allows a fresh reviewed attempt after a preflight UNAVAILABLE result, never after UNKNOWN', async () => {
    let attempts = 0;
    const { controller, submit } = controllerWith(
      async () => readResult('42'),
      async () => {
        attempts += 1;
        return attempts === 1
          ? { status: 'UNAVAILABLE', reason: 'TOKEN_NOT_READY' }
          : finalReceipt;
      },
    );
    await controller.readProjection();
    await controller.submitNarrowTransfer(draft, receiptBinding);
    expect(controller.getSnapshot().phase).toBe('COMMAND_UNAVAILABLE');
    expect(controller.wasSubmitted(draft.commandId)).toBe(false);
    await controller.readProjection();
    await controller.submitNarrowTransfer(draft, receiptBinding);
    expect(submit).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot().phase).toBe('FINAL_RECEIPT');
  });

  it('ignores a late final receipt after Office authorization changes', async () => {
    const pending = deferred<BrowserCommandResult>();
    const { controller } = controllerWith(
      async () => readResult('42'),
      () => pending.promise,
    );
    await controller.readProjection();
    const send = controller.submitNarrowTransfer(draft, receiptBinding);
    controller.setIdentity({
      ...identity,
      authorizationRevision: 'revision-2',
    });
    pending.resolve(finalReceipt);
    await send;
    expect(controller.getSnapshot()).toMatchObject({
      phase: 'UNAVAILABLE',
      read: null,
      command: null,
    });
  });

  it('does not promote an invalid final receipt or a lost response to success', async () => {
    const { controller } = controllerWith(
      async () => readResult('42'),
      async () => ({
        ...finalReceipt,
        receipt: { ...finalReceipt.receipt, commandId: 'OTHER' },
      }),
    );
    await controller.readProjection();
    await controller.submitNarrowTransfer(draft, receiptBinding);
    expect(controller.getSnapshot().phase).toBe('UNKNOWN');
    const copy = commandLifecycleCopy(
      resolveAuthorizedUi({
        currentIdentity: identity,
        read: null,
        command: controller.getSnapshot().command,
      }).command,
    );
    expect(copy.title).toBe('Outcome unknown');
    expect(
      renderToStaticMarkup(
        createElement(CommandLifecycleStatus, {
          context: 'Office',
          state: {
            source: 'AUTHORIZED_READ_MODEL',
            kind: 'SENDING_UNCONFIRMED',
            commandId: draft.commandId,
          },
        }),
      ),
    ).toContain('Sending · not confirmed');
  });

  it('treats a direct final receipt with a different authoritative fingerprint as UNKNOWN', async () => {
    const { controller } = controllerWith(
      async () => readResult('42'),
      async () => ({
        ...finalReceipt,
        receipt: {
          ...finalReceipt.receipt,
          commandFingerprint: `sha256:${'b'.repeat(64)}`,
        },
      }),
    );
    await controller.readProjection();
    await controller.submitNarrowTransfer(draft, receiptBinding);
    expect(controller.getSnapshot().phase).toBe('UNKNOWN');
    expect(controller.getSnapshot().read).toBeNull();
  });
});
