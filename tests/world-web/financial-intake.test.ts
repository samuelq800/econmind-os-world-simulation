import { describe, expect, it, vi } from 'vitest';
import {
  AUTHENTICATED_FINANCIAL_INTAKE_PATH,
  FINANCIAL_INTAKE_OFFICE_ACTIONS,
  type FinancialIntakeAction,
} from '@econmind/core';
import { createFinancialIntakeController } from '../../apps/world-web/src/financial-intake/controller.js';
import { createFinancialIntakeTransport } from '../../apps/world-web/src/financial-intake/transport.js';
import type { OfficeProjectionView } from '../../apps/world-web/src/office-projection/model.js';
import { financialIntakeFixture } from './financial-intake-fixture.js';
import { parseStagedTransferRequest } from '../../apps/world-api/src/integration/staged-narrow-transfer-handler.js';

const uuid = () => '11111111-1111-4111-8111-111111111111';
function setup(
  role: 'trade' | 'finance' = 'trade',
  action: FinancialIntakeAction = 'ENQUEUE',
) {
  const f = financialIntakeFixture(role, action, parseStagedTransferRequest);
  let view: OfficeProjectionView = f.binding.view;
  const c = createFinancialIntakeController(f.binding, () => view, {
    fetcher: f.fetcher,
    readFactory: () => f.f.client(),
    requestId: uuid,
  });
  return {
    ...f,
    c,
    changeRole: () => {
      view = { ...view, role: 'captain' };
    },
  };
}
const actions = [
  ...FINANCIAL_INTAKE_OFFICE_ACTIONS.TRADE.map(
    (action) => ['trade', action] as const,
  ),
  ...FINANCIAL_INTAKE_OFFICE_ACTIONS.FINANCE.map(
    (action) => ['finance', action] as const,
  ),
];
describe('G frozen public port / OFFLINE TEST_ONLY browser consumer', () => {
  it.each(actions)(
    '%s %s uses real action-specific server shape and explicit inspection/review',
    async (role, action) => {
      const f = setup(role, action);
      expect(f.c.getState()).toMatchObject({
        connection: 'NOT_CONNECTED',
        canSubmit: false,
      });
      await f.c.submit();
      expect(f.calls).toHaveLength(0);
      await f.c.inspect();
      expect(f.c.getState()).toMatchObject({
        connection: 'SERVER_BOUND',
        canSubmit: false,
      });
      const inspected = JSON.parse(f.calls[0]!.body).request;
      expect(Object.keys(inspected).sort()).toEqual(
        [
          'schemaVersion',
          'action',
          'worldId',
          'countryId',
          'officeId',
          'commandId',
          'idempotencyKey',
        ].sort(),
      );
      f.c.review(true);
      expect(f.c.getState().canSubmit).toBe(true);
      await f.c.submit();
      expect(f.calls).toHaveLength(2);
      expect(f.calls[1]!.url).toBe(
        f.binding.endpoint.origin + AUTHENTICATED_FINANCIAL_INTAKE_PATH,
      );
      expect(JSON.parse(f.calls[1]!.body)).toEqual(f.binding.request);
      expect(f.calls[1]!.init).toMatchObject({
        method: 'POST',
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
      });
      expect(f.c.getState().read?.receipt).toBeNull();
      f.c.disconnect();
    },
  );
  it.each(['captain', 'central_bank', 'industry', 'social'] as const)(
    '%s never gains an action from the capability map',
    async (role) => {
      const c = createFinancialIntakeController(null, () => ({
        countryDisplayId: '01',
        role,
      }));
      await c.inspect();
      await c.submit();
      expect(c.getState()).toMatchObject({
        status: 'OFFICE_COMMAND_FAMILY_UNSUPPORTED',
        connection: 'NOT_CONNECTED',
        canSubmit: false,
        canRetry: false,
      });
    },
  );
  it.each(['trade', 'finance'] as const)(
    '%s stays disconnected without host configuration',
    (role) => {
      const c = createFinancialIntakeController(null, () => ({
        countryDisplayId: '01',
        role,
      }));
      expect(c.getState()).toMatchObject({
        connection: 'NOT_CONNECTED',
        request: null,
        canSubmit: false,
      });
    },
  );
  it('server NOT_CONNECTED keeps submit disabled despite host endpoint strings', async () => {
    const f = setup();
    const fetcher: typeof fetch = async (_input, init) =>
      Response.json(
        {
          schemaVersion: f.binding.request.schemaVersion,
          requestId: JSON.parse(String(init?.body)).requestId,
          ok: false,
          error: { code: 'NOT_CONNECTED', retryable: false },
        },
        { status: 503 },
      );
    const c = createFinancialIntakeController(f.binding, () => f.binding.view, {
      fetcher,
    });
    await c.inspect();
    c.review(true);
    expect(c.getState()).toMatchObject({
      connection: 'NOT_CONNECTED',
      canSubmit: false,
      code: 'NOT_CONNECTED',
    });
    c.disconnect();
    f.c.disconnect();
  });
  it('UNKNOWN never automatically replays; explicit reinspection/review/retry keeps byte-identical original IDs and body', async () => {
    const f = setup();
    await f.c.inspect();
    f.c.review(true);
    f.setReply({ status: 503, state: { status: 'UNKNOWN' } });
    await f.c.submit();
    expect(f.c.getState()).toMatchObject({
      status: 'UNKNOWN',
      uncertain: true,
      canRetry: false,
      canSubmit: false,
    });
    await f.c.retry();
    f.c.review(true);
    expect(f.calls).toHaveLength(2);
    await f.c.inspect();
    expect(f.c.getState().canRetry).toBe(false);
    f.c.review(true);
    expect(f.c.getState().canRetry).toBe(true);
    await f.c.retry();
    expect(f.calls[3]!.body).toBe(f.calls[1]!.body);
    expect(f.c.getState()).toMatchObject({ status: 'QUEUED', canRetry: false });
    f.c.disconnect();
  });
  it.each([401, 403])(
    'HTTP %i plus UNKNOWN preserves uncertainty and retires privacy, not proof of rollback',
    async (status) => {
      const f = setup();
      await f.c.inspect();
      f.c.review(true);
      f.setReply({ status, state: { status: 'UNKNOWN' } });
      await f.c.submit();
      expect(f.c.getState()).toMatchObject({
        status: 'DENIED',
        uncertain: true,
        request: null,
        read: null,
        canInspect: false,
        canSubmit: false,
        canLookupFinal: false,
      });
      await f.c.inspect();
      await f.c.retry();
      expect(f.calls).toHaveLength(2);
    },
  );
  it('semantic conflict is not made retryable by reinspection', async () => {
    const f = setup();
    await f.c.inspect();
    f.c.review(true);
    f.setReply({
      status: 409,
      error: { code: 'IDEMPOTENCY_CONFLICT', retryable: false },
    });
    await f.c.submit();
    await f.c.inspect();
    f.c.review(true);
    expect(f.c.getState().canRetry).toBe(false);
    f.c.disconnect();
  });
  it('a mismatched server INSPECT never enables review or submit', async () => {
    const f = setup('finance', 'SIGN_BUYER_FINANCE');
    f.mismatch();
    await f.c.inspect();
    f.c.review(true);
    expect(f.c.getState()).toMatchObject({
      status: 'INSPECTION_MISMATCH',
      canReview: false,
      canSubmit: false,
    });
    f.c.disconnect();
  });
  it('QUEUED is not FINAL; original lookup then min-head read refresh supplies verified FINAL and stops writes', async () => {
    const f = setup();
    await f.c.inspect();
    f.c.review(true);
    await f.c.submit();
    expect(f.c.getState()).toMatchObject({
      status: 'QUEUED',
      read: { receipt: null },
    });
    await f.c.lookupAndRefresh();
    expect(f.c.getState()).toMatchObject({
      status: 'FINAL_VERIFIED',
      read: {
        receipt: { outcome: 'COMMITTED' },
        model: { head: { worldVersion: '3' } },
      },
    });
    await f.c.inspect();
    f.c.review(true);
    expect(f.c.getState().canSubmit).toBe(false);
    expect(f.c.getState().canRetry).toBe(false);
    f.c.disconnect();
  });
  it('revoked FINAL read retires the financial consumer as well', async () => {
    const f = setup();
    const { createProductionReadClient } =
      await import('../../apps/world-web/src/production-read/client.js');
    // Real ProductionReadClient, no replacement port.
    const readFactory: typeof createProductionReadClient = (config) =>
      createProductionReadClient(config, {
        fetcher: async () => new Response(null, { status: 403 }),
      });
    const c = createFinancialIntakeController(f.binding, () => f.binding.view, {
      fetcher: f.fetcher,
      readFactory,
      requestId: uuid,
    });
    await c.lookupAndRefresh();
    expect(c.getState()).toMatchObject({
      status: 'DENIED',
      request: null,
      read: null,
      canInspect: false,
    });
    c.disconnect();
    f.c.disconnect();
  });
  it('session/role loss clears private request/read state and fences a late success', async () => {
    const f = setup();
    await f.c.inspect();
    f.c.review(true);
    let release!: (r: Response) => void;
    let started!: () => void;
    const entered = new Promise<void>((r) => {
      started = r;
    });
    const fetcher: typeof fetch = (input, init) =>
      JSON.parse(String(init?.body)).request.action === 'INSPECT'
        ? f.fetcher(input, init)
        : new Promise<Response>((r) => {
            release = r;
            started();
          });
    const c = createFinancialIntakeController(f.binding, () => f.binding.view, {
      fetcher,
      readFactory: () => f.f.client(),
      requestId: uuid,
    });
    await c.inspect();
    c.review(true);
    const pending = c.submit();
    await entered;
    f.f.invalidate();
    await pending;
    release(
      await f.authorized(f.binding.request.requestId, { status: 'QUEUED' }),
    );
    await Promise.resolve();
    expect(c.getState()).toMatchObject({
      connection: 'NOT_CONNECTED',
      request: null,
      read: null,
      canRetry: false,
    });
    f.changeRole();
    expect(f.c.getState().request).toBeNull();
  });
  it('freezes the original request even if the host or a view snapshot is mutated', async () => {
    const f = setup();
    const original = JSON.stringify(f.binding.request);
    (f.binding.request.request as { commandId: string }).commandId =
      'TEST_DIFFERENT';
    const state = f.c.getState();
    (state.request!.request as { commandId: string }).commandId =
      'TEST_VISIBLE_MUTATION';
    await f.c.inspect();
    f.c.review(true);
    await f.c.submit();
    expect(JSON.parse(f.calls[1]!.body)).toEqual(JSON.parse(original));
    f.c.disconnect();
  });
  it('transport does not drop an illegal extra READ fingerprint; real server parser rejects it', async () => {
    const f = setup('trade', 'READ');
    const r = {
      ...f.binding.request,
      request: {
        ...f.binding.request.request,
        commandFingerprint: f.f.lookup.commandFingerprint,
      },
    };
    const port = createFinancialIntakeTransport(
      f.binding.endpoint,
      f.binding.read,
      () => true,
      { fetcher: f.fetcher },
    );
    const result = await port.execute({
      request: r,
      accessToken: 'TEST_ONLY_TOKEN',
    });
    expect(result.error?.code).toBe('PROTOCOL_ERROR');
    expect(
      JSON.parse(f.calls[0]!.body).request.commandFingerprint,
    ).toBeDefined();
    f.c.disconnect();
  });
  it('bounded timeout handles a transport ignoring AbortSignal without replay', async () => {
    vi.useFakeTimers();
    try {
      const f = setup();
      let calls = 0;
      const port = createFinancialIntakeTransport(
        f.binding.endpoint,
        f.binding.read,
        () => true,
        {
          fetcher: () => {
            calls++;
            return new Promise(() => undefined);
          },
        },
      );
      const pending = port.execute({
        request: f.binding.request,
        accessToken: 'TEST_ONLY_TOKEN',
      });
      await vi.advanceTimersByTimeAsync(10_000);
      expect((await pending).state?.status).toBe('UNKNOWN');
      expect(calls).toBe(1);
      f.c.disconnect();
    } finally {
      vi.useRealTimers();
    }
  });
  it('a hanging session-token getter is bounded before dispatch', async () => {
    vi.useFakeTimers();
    try {
      const f = financialIntakeFixture(
        'trade',
        'ENQUEUE',
        parseStagedTransferRequest,
      );
      const read = {
        ...f.binding.read,
        getAccessToken: () => new Promise<string | null>(() => undefined),
      };
      const c = createFinancialIntakeController(
        { ...f.binding, read },
        () => f.binding.view,
        { fetcher: f.fetcher },
      );
      const pending = c.inspect();
      await vi.advanceTimersByTimeAsync(10_000);
      await pending;
      expect(f.calls).toHaveLength(0);
      expect(c.getState()).toMatchObject({
        connection: 'NOT_CONNECTED',
        canSubmit: false,
        code: 'SESSION_TOKEN_MISSING',
      });
      c.disconnect();
    } finally {
      vi.useRealTimers();
    }
  });
});
