import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  COMMAND_SCHEMA_VERSION,
  parseCanonicalCommand,
  parseCaptainPoliticalCapitalAllocation,
  parseCentralBankOmoIntent,
  parseSocialEmploymentServiceCommand,
} from '@econmind/core';
import { createHash } from 'node:crypto';
import { createOfficeCommandController } from '../../apps/world-web/src/office-command/controller.js';
import { createOfficeCommandClient } from '../../apps/world-web/src/office-command/client.js';
import { installOfficeCommand } from '../../apps/world-web/src/office-command/view.js';
import { officeCommandFixture } from './office-command-fixture.js';
import { HostDocument, type HostElement } from './trusted-host-dom.js';

afterEach(() => vi.unstubAllGlobals());
function setup(role: 'captain' | 'central_bank' | 'social' = 'captain') {
  const f = officeCommandFixture(role);
  let view = f.binding.view;
  const controller = createOfficeCommandController(f.binding, () => view, {
    fetcher: f.fetcher,
    requestId: () => f.request.requestId,
  });
  return {
    ...f,
    controller,
    changeView: () => {
      view = { ...view, countryDisplayId: '02' };
    },
  };
}
async function reviewed(f: ReturnType<typeof setup>) {
  await f.controller.refresh();
  expect(f.controller.stage(f.request)).toBe(true);
  expect(f.controller.review()).toBe(true);
}
describe('three manual Office families / shipped clients / OFFLINE TEST_ONLY', () => {
  it.each(['captain', 'central_bank', 'social'] as const)(
    'actual %s payload parser + explicit review + ACK + original FINAL/readback',
    async (role) => {
      const f = setup(role);
      const parsers = {
        captain: parseCaptainPoliticalCapitalAllocation,
        central_bank: parseCentralBankOmoIntent,
        social: parseSocialEmploymentServiceCommand,
      };
      const sha = (s: string) => createHash('sha256').update(s).digest('hex');
      const command = parseCanonicalCommand(
        {
          ...f.request.request,
          schemaVersion: COMMAND_SCHEMA_VERSION,
          actorId: 'ACTOR_TEST_ONLY',
          authSubject: f.f.config.identity.authSubjectId,
          correlationId: 'CORRELATION_TEST_ONLY',
          simTime: '10000',
          submittedAtReal: '2026-10-10T00:00:00.000Z',
        },
        sha,
      );
      expect(() => parsers[role](command, sha)).not.toThrow();
      await f.controller.confirm();
      expect(f.commands).toHaveLength(0);
      await reviewed(f);
      await Promise.all([f.controller.confirm(), f.controller.confirm()]);
      expect(f.commands).toHaveLength(1);
      expect(f.commands[0]!.body).toEqual(f.request);
      expect(f.commands[0]!.init).toMatchObject({
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
      });
      expect(f.controller.getState()).toMatchObject({
        status: 'QUEUE_ACK',
        completion: false,
        receipt: null,
      });
      await f.controller.lookupAndRefresh();
      expect(f.controller.getState()).toMatchObject({
        status: 'FINAL_VERIFIED',
        receipt: { outcome: 'COMMITTED' },
        completion: false,
      });
      expect(f.controller.getState().model?.decisionResult.result).toBeNull();
      expect(f.f.calls.map((c) => c.path)).toEqual([
        f.f.config.endpoints.projectionPath,
        f.f.config.endpoints.finalLookupPath,
        f.f.config.endpoints.projectionPath,
      ]);
      expect(f.f.calls[1]!.body).toMatchObject({
        operation: 'READ_FINAL_NARROW_TRANSFER_RECEIPT',
        payload: {
          commandId: f.request.request.commandId,
          idempotencyKey: f.request.request.idempotencyKey,
        },
      });
    },
  );
  it.each(['INDUSTRY', 'FINANCE', 'TRADE'])(
    'keeps %s explicitly unsupported',
    async (officeId) => {
      const f = officeCommandFixture('industry');
      const read = {
        ...f.binding.read,
        identity: { ...f.binding.read.identity, officeId },
      };
      const c = createOfficeCommandController(
        { ...f.binding, read },
        () => f.binding.view,
        { fetcher: f.fetcher },
      );
      await c.confirm();
      expect(c.getState().status).toBe('MISSING');
      expect(f.commands).toHaveLength(0);
    },
  );
  it.each([
    'extra-authority',
    'wrong-world',
    'wrong-office',
    'number',
    'stale-version',
    'extra-envelope',
  ])('refuses %s before dispatch', async (fault) => {
    const f = setup();
    await f.controller.refresh();
    const value = structuredClone(f.request) as unknown as Record<
        string,
        unknown
      >,
      r = value.request as Record<string, unknown>;
    if (fault === 'extra-authority') r.actorId = 'ACTOR_FAKE';
    if (fault === 'wrong-world') r.worldId = 'OTHER_WORLD';
    if (fault === 'wrong-office') r.officeId = 'CENTRAL_BANK';
    if (fault === 'number') r.payload = { amount: 7.125 };
    if (fault === 'stale-version') r.expectedWorldVersion = '1';
    if (fault === 'extra-envelope') value.approved = true;
    expect(f.controller.stage(value)).toBe(false);
    await f.controller.confirm();
    expect(f.commands).toHaveLength(0);
  });
  it('snapshots review terms and ignores mutations of returned state', async () => {
    const f = setup();
    await reviewed(f);
    const state = f.controller.getState();
    Object.assign(state.model!.head, { worldVersion: '100' });
    Object.assign(f.request.request, { payload: { fake: true } });
    Object.assign(state.intent!.request, { payload: { changed: true } });
    await f.controller.confirm();
    expect(f.commands[0]!.body.request.payload).toHaveProperty(
      'schemaVersion',
      'captain-political-capital-allocation-v1',
    );
  });
  it.each(['network', 'malformed', 'write-unknown', '5xx', 'wrong-ack-id'])(
    '%s becomes UNKNOWN and is never replayed',
    async (fault) => {
      const f = setup();
      await reviewed(f);
      f.submit(async () => {
        if (fault === 'network') throw Error('TEST_ONLY');
        if (fault === 'malformed')
          return new Response('bad', {
            headers: { 'content-type': 'application/json' },
          });
        if (fault === 'wrong-ack-id')
          return Response.json({
            schemaVersion: f.request.schemaVersion,
            requestId: f.request.requestId,
            ok: true,
            state: {
              status: 'QUEUED',
              source: 'NEW',
              submitted: true,
              queued: true,
              commandType: f.request.request.commandType,
              commandId: 'OTHER_COMMAND',
              commandFingerprint: f.f.lookup.commandFingerprint,
            },
          });
        return Response.json(
          {
            schemaVersion: f.request.schemaVersion,
            requestId: f.request.requestId,
            ok: false,
            error: {
              code:
                fault === 'write-unknown'
                  ? 'WRITE_OUTCOME_UNKNOWN'
                  : 'UPSTREAM_UNAVAILABLE',
              retryable: false,
            },
          },
          { status: 503 },
        );
      });
      await f.controller.confirm();
      expect(f.controller.getState()).toMatchObject({
        status: 'UNKNOWN',
        canConfirm: false,
      });
      await f.controller.confirm();
      expect(f.controller.stage(f.request)).toBe(false);
      expect(f.commands).toHaveLength(1);
      expect(
        f.controller.recoverLookup({
          ...f.f.lookup,
          commandId: 'OTHER_COMMAND',
        }),
      ).toBe(false);
      expect(f.controller.recoverLookup(f.f.lookup)).toBe(true);
      await f.controller.lookupAndRefresh();
      expect(f.commands).toHaveLength(1);
    },
  );
  it('explicit source rejection stays REJECTED, no fabricated queue/result', async () => {
    const f = setup();
    await reviewed(f);
    f.submit(async () =>
      Response.json(
        {
          schemaVersion: f.request.schemaVersion,
          requestId: f.request.requestId,
          ok: false,
          error: { code: 'SOURCE_RUNTIME_UNAVAILABLE', retryable: false },
          state: {
            status: 'REJECTED',
            reason: 'SOURCE_RUNTIME_UNAVAILABLE',
            commandType: f.request.request.commandType,
            submitted: false,
            queued: false,
            missing: ['ADMITTED_DOMAIN_SOURCE', 'SOLE_DURABLE_CONSUMER'],
          },
        },
        { status: 503 },
      ),
    );
    await f.controller.confirm();
    expect(f.controller.getState()).toMatchObject({
      status: 'REJECTED',
      receipt: null,
      acknowledgement: null,
      completion: false,
    });
  });
  it.each(['view', 'revoke'])(
    'fences %s during token await, with zero command dispatch',
    async (fault) => {
      const f = setup();
      let release: (s: string) => void = () => undefined;
      const token = new Promise<string>((r) => {
        release = r;
      });
      const c = createOfficeCommandClient(
        f.endpoint,
        { ...f.f.config, getAccessToken: () => token },
        { fetcher: f.fetcher },
      );
      const result = c.submit(f.request);
      if (fault === 'revoke') f.f.invalidate();
      else c.disconnect();
      release('TEST_ONLY_TOKEN');
      expect(await result).toEqual({ status: 'NOT_CONNECTED' });
      expect(f.commands).toHaveLength(0);
    },
  );
  it('clears intent/receipt on view change and ignores late dispatch response', async () => {
    const f = setup();
    await reviewed(f);
    let release: (v: Response) => void = () => undefined;
    f.submit(
      () =>
        new Promise((r) => {
          release = r;
        }),
    );
    const pending = f.controller.confirm();
    await expect.poll(() => f.commands.length).toBe(1);
    f.changeView();
    f.controller.checkLiveness();
    release(Response.json({}));
    await pending;
    expect(f.controller.getState()).toMatchObject({
      status: 'MISSING',
      intent: null,
      model: null,
      receipt: null,
      acknowledgement: null,
    });
  });
  it('DENIED retires instead of preserving private intent or inferring rollback', async () => {
    const f = setup();
    await reviewed(f);
    f.submit(async () => new Response(null, { status: 403 }));
    await f.controller.confirm();
    expect(f.controller.getState()).toMatchObject({
      status: 'DENIED',
      intent: null,
      model: null,
      receipt: null,
    });
  });
  it('lookup failure or refresh failure cannot clear MISSING/result gaps', async () => {
    const f = setup();
    await reviewed(f);
    await f.controller.confirm();
    const original = f.f.fetcher;
    f.reads(async (input, init) =>
      new URL(String(input)).pathname === f.f.config.endpoints.projectionPath
        ? new Response(null, { status: 503 })
        : original(input, init),
    );
    await f.controller.lookupAndRefresh();
    expect(f.controller.getState()).toMatchObject({
      status: 'UNAVAILABLE',
      model: null,
      completion: false,
      receipt: { outcome: 'COMMITTED' },
    });
  });
});

describe('actual installed drawer / OFFLINE TEST_ONLY DOM', () => {
  it('explicit review/confirm calls actual client and clears closed/revoked DOM', async () => {
    const f = officeCommandFixture(),
      doc = new HostDocument('captain');
    const mutations: (() => void)[] = [];
    vi.stubGlobal(
      'MutationObserver',
      class {
        constructor(fn: () => void) {
          mutations.push(fn);
        }
        observe() {}
      },
    );
    const api = installOfficeCommand(
      doc as unknown as Document,
      { addEventListener() {} } as unknown as Window,
      (b, view) =>
        createOfficeCommandController(b, view, {
          fetcher: f.fetcher,
          requestId: () => f.request.requestId,
        }),
    );
    api.connect(f.binding);
    doc.tools
      .all()
      .find((e) => Object.hasOwn(e.dataset, 'officeCommandEntry'))!
      .click();
    const dialog = doc.root
      .all()
      .find((e) => Object.hasOwn(e.dataset, 'officeCommandDialog'))!;
    const click = (key: string) =>
      dialog
        .all()
        .find((e) => e.dataset.officeCommandAction === key)!
        .click();
    click('refresh');
    await expect.poll(() => api.getState().status).toBe('CURRENT');
    const draft = dialog
      .all()
      .find((e) =>
        Object.hasOwn(e.dataset, 'officeCommandDraft'),
      )! as HostElement & { value: string };
    draft.value = JSON.stringify(f.request);
    click('stage');
    click('confirm');
    expect(f.commands).toHaveLength(0);
    click('review');
    click('confirm');
    await expect.poll(() => api.getState().status).toBe('QUEUE_ACK');
    expect(dialog.textContent).toContain('TEST_COMMAND');
    dialog.close();
    expect(dialog.textContent).toBe('');
    doc.tools
      .all()
      .find((e) => Object.hasOwn(e.dataset, 'officeCommandEntry'))!
      .click();
    expect(dialog.textContent).toContain('TEST_COMMAND');
    f.f.invalidate();
    expect(doc.body.textContent).not.toContain('TEST_COMMAND');
    doc.root.dataset.country = '02';
    for (const fn of mutations) fn();
    expect(api.getState().status).toBe('MISSING');
  });
});

describe('bounded cancellation and original FINAL integrity', () => {
  it('SOURCE rejection remains definite after explicit refresh and is not recoverable UNKNOWN', async () => {
    const f = setup();
    await reviewed(f);
    f.submit(async () =>
      Response.json(
        {
          schemaVersion: f.request.schemaVersion,
          requestId: f.request.requestId,
          ok: false,
          error: { code: 'SOURCE_RUNTIME_UNAVAILABLE', retryable: false },
          state: {
            status: 'REJECTED',
            reason: 'SOURCE_RUNTIME_UNAVAILABLE',
            commandType: f.request.request.commandType,
            submitted: false,
            queued: false,
            missing: ['ADMITTED_DOMAIN_SOURCE'],
          },
        },
        { status: 503 },
      ),
    );
    await f.controller.confirm();
    await f.controller.refresh();
    expect(f.controller.getState()).toMatchObject({
      status: 'REJECTED',
      canRecover: false,
      canStage: false,
      code: 'SOURCE_RUNTIME_UNAVAILABLE',
    });
  });
  it.each(['fingerprint', 'command', 'key', 'stale-readback'])(
    'rejects mismatched original %s FINAL/readback without completion',
    async (fault) => {
      const f = setup();
      await reviewed(f);
      await f.controller.confirm();
      f.reads(async (input, init) => {
        const r = await f.f.fetcher(input, init),
          envelope = (await r.json()) as {
            result: {
              receipt?: Record<string, unknown>;
              data?: { watermark: { worldVersion: string } };
            };
            authority: { readback: { worldVersion: string } };
          };
        if (envelope.result.receipt) {
          if (fault === 'fingerprint')
            envelope.result.receipt.commandFingerprint = `sha256:${'b'.repeat(64)}`;
          if (fault === 'command')
            envelope.result.receipt.commandId = 'OTHER_COMMAND';
          if (fault === 'key')
            envelope.result.receipt.idempotencyKey = 'OTHER_KEY';
        }
        if (fault === 'stale-readback' && envelope.result.data) {
          envelope.result.data.watermark.worldVersion = '2';
          envelope.authority.readback.worldVersion = '2';
        }
        return Response.json(envelope);
      });
      await f.controller.lookupAndRefresh();
      expect(f.controller.getState()).toMatchObject({
        status: 'UNAVAILABLE',
        model: null,
        completion: false,
      });
    },
  );
  it('10s timeout terminates a hung dispatch as UNKNOWN, never a retry', async () => {
    vi.useFakeTimers();
    try {
      const f = setup();
      await reviewed(f);
      f.submit(() => new Promise<Response>(() => undefined));
      const pending = f.controller.confirm();
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(10001);
      await pending;
      expect(f.controller.getState()).toMatchObject({
        status: 'UNKNOWN',
        canConfirm: false,
      });
      await f.controller.confirm();
      expect(f.commands).toHaveLength(1);
      f.controller.disconnect();
    } finally {
      vi.useRealTimers();
    }
  });
});
