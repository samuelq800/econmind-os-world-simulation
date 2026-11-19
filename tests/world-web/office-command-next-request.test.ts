/** OFFLINE TEST_ONLY transport/DOM protocol. No native browser, backend or
 * economic acceptance is claimed by these synthetic responses. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOfficeCommandController } from '../../apps/world-web/src/office-command/controller.js';
import { installOfficeCommand } from '../../apps/world-web/src/office-command/view.js';
import { fixedOfficeCommandFixture } from './office-command-fixed-offices-fixture.js';
import { HostDocument } from './trusted-host-dom.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function setup(
  override?: (f: ReturnType<typeof fixedOfficeCommandFixture>) => typeof fetch,
  requestId?: () => string,
) {
  const f = fixedOfficeCommandFixture('central_bank');
  const c = createOfficeCommandController(f.binding, () => f.binding.view, {
    fetcher: override?.(f) ?? f.fetcher,
    requestId: requestId ?? (() => f.request.requestId),
  });
  const next = () => ({
    ...f.request,
    request: {
      ...f.request.request,
      expectedWorldVersion: '3',
      commandId: 'COMMAND_NEXT_TEST_ONLY',
      idempotencyKey: 'KEY_NEXT_TEST_ONLY',
    },
  });
  async function finish() {
    await c.refresh();
    expect(c.stage(f.request)).toBe(true);
    expect(c.review()).toBe(true);
    f.submit('ack');
    await c.confirm();
    f.recover('final');
    await c.recoverOriginal();
    expect(c.getState().status).toBe('FINAL_VERIFIED');
  }
  return { f, c, next, finish };
}
function writes(f: ReturnType<typeof fixedOfficeCommandFixture>) {
  return f.calls.filter((r) => r.path === '/v1/office-command').length;
}
describe('explicit next request after verified FINAL and fresh authorized read', () => {
  it('retains the original and receipt, refreshes authority, and opens a new review without posting', async () => {
    const { f, c, next, finish } = setup();
    await finish();
    const old = c.getState();
    expect(old.canBeginNextRequest).toBe(true);
    expect(old.canStage).toBe(false);
    const reads = f.calls.length;
    await c.beginNextRequest();
    expect(f.calls.length).toBeGreaterThan(reads);
    expect(c.getState()).toMatchObject({
      status: 'CURRENT_AUTHORIZED_HEAD',
      intent: null,
      receipt: null,
      acknowledgement: null,
      canStage: true,
      canConfirm: false,
      canLookupFinal: false,
      canBeginNextRequest: false,
      previousFinal: { original: old.intent, receipt: old.receipt },
      currentHead: { worldVersion: '3' },
    });
    expect(c.stage(next())).toBe(true);
    expect(c.getState().status).toBe('REVIEW_REQUIRED');
    expect(c.review()).toBe(true);
    expect(writes(f)).toBe(1);
    c.disconnect();
  });
  it('cannot begin from UNKNOWN, queue acknowledgement, or an unsubmitted intent', async () => {
    for (const mode of ['unknown', 'ack'] as const) {
      const { f, c } = setup();
      await c.refresh();
      expect(c.stage(f.request)).toBe(true);
      await c.beginNextRequest();
      expect(c.getState().status).toBe('REVIEW_REQUIRED');
      c.review();
      f.submit(mode);
      await c.confirm();
      const before = c.getState(),
        count = f.calls.length;
      expect(before.canBeginNextRequest).toBe(false);
      await c.beginNextRequest();
      expect(c.getState()).toEqual(before);
      expect(f.calls).toHaveLength(count);
      expect(writes(f)).toBe(1);
      c.disconnect();
    }
  });
  it('preserves the locked original on fresh read failure and requires a later successful read', async () => {
    const { f, c, finish } = setup();
    await finish();
    const old = c.getState();
    f.read('unavailable');
    await c.beginNextRequest();
    expect(c.getState()).toMatchObject({
      status: 'UNAVAILABLE',
      intent: old.intent,
      receipt: old.receipt,
      previousFinal: null,
      canStage: false,
      canBeginNextRequest: false,
    });
    f.read('page');
    await c.refresh();
    expect(c.getState().canBeginNextRequest).toBe(true);
    await c.beginNextRequest();
    expect(c.getState().canStage).toBe(true);
    expect(writes(f)).toBe(1);
    c.disconnect();
  });
  it('rejects reuse of either original command ID or idempotency key', async () => {
    const { f, c, next, finish } = setup();
    await finish();
    await c.beginNextRequest();
    for (const patch of [
      { commandId: f.request.request.commandId },
      { idempotencyKey: f.request.request.idempotencyKey },
    ]) {
      expect(
        c.stage({ ...next(), request: { ...next().request, ...patch } }),
      ).toBe(false);
      expect(c.getState().code).toBe('ORIGINAL_REQUEST_RECOVERY_ONLY');
    }
    expect(c.stage(next())).toBe(true);
    expect(writes(f)).toBe(1);
    c.disconnect();
  });
  it('recovers the prior FINAL without changing a current unknown request or its authorized head', async () => {
    const { f, c, next, finish } = setup();
    await finish();
    await c.beginNextRequest();
    c.stage(next());
    c.review();
    f.submit('unknown');
    await c.confirm();
    const active = c.getState();
    await c.recoverPreviousFinal();
    expect(c.getState()).toEqual({
      ...active,
      previousFinalCode: 'FINAL_VERIFIED',
    });
    expect(writes(f)).toBe(2);
    const original = f.calls
      .filter((r) => r.path === '/v1/command-recovery')
      .at(-1)!.body.request as { originalRequest: unknown };
    expect(original.originalRequest).toEqual(f.request);
    f.recover('unavailable');
    await c.recoverPreviousFinal();
    expect(c.getState()).toEqual({ ...active, previousFinalCode: 'NOT_FOUND' });
    expect(writes(f)).toBe(2);
    c.disconnect();
  });
  it('does not treat a changed prior receipt as verified or overwrite the active draft', async () => {
    let changed = false;
    const { c, next, finish } = setup((f) => async (input, init) => {
      const response = await f.fetcher(input, init);
      if (
        changed &&
        new URL(String(input)).pathname === '/v1/command-recovery'
      ) {
        const body = await response.json();
        body.state.receipt.eventIds = ['EVENT_OTHER_TEST_ONLY'];
        return Response.json(body);
      }
      return response;
    });
    await finish();
    await c.beginNextRequest();
    c.stage(next());
    const before = c.getState();
    changed = true;
    await c.recoverPreviousFinal();
    expect(c.getState()).toEqual({
      ...before,
      previousFinalCode: 'PREVIOUS_FINAL_MISMATCH',
    });
    c.disconnect();
  });
  it('contains a prior recovery exception without clearing the active unknown request or page', async () => {
    let throwRequestId = false;
    const { f, c, next, finish } = setup(undefined, () => {
      if (throwRequestId) throw Error('TEST_ONLY_REQUEST_ID_UNAVAILABLE');
      return '11111111-1111-4111-8111-111111111111';
    });
    await finish();
    await c.beginNextRequest();
    c.stage(next());
    c.review();
    f.submit('unknown');
    await c.confirm();
    const active = c.getState(),
      count = f.calls.length;
    throwRequestId = true;
    await c.recoverPreviousFinal();
    expect(c.getState()).toEqual({
      ...active,
      previousFinalCode: 'UNAVAILABLE',
    });
    expect(f.calls).toHaveLength(count);
    expect(writes(f)).toBe(2);
    c.disconnect();
  });
  it('denial of prior recovery clears all private request state and never enables submission', async () => {
    let denied = false;
    const { c, next, finish } = setup(
      (f) => async (input, init) =>
        denied && new URL(String(input)).pathname === '/v1/command-recovery'
          ? Response.json({}, { status: 403 })
          : f.fetcher(input, init),
    );
    await finish();
    await c.beginNextRequest();
    c.stage(next());
    denied = true;
    await c.recoverPreviousFinal();
    expect(c.getState()).toMatchObject({
      status: 'DENIED',
      previousFinal: null,
      previousFinalCode: null,
      intent: null,
      receipt: null,
      currentHead: null,
      canBeginNextRequest: false,
      canConfirm: false,
      canRecoverPreviousFinal: false,
    });
  });
  it('serializes a delayed next read and ignores its result after session invalidation', async () => {
    let delay = false,
      release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const { f, c, finish } = setup((f) => async (input, init) => {
      if (delay) await gate;
      return f.fetcher(input, init);
    });
    await finish();
    delay = true;
    const pending = c.beginNextRequest();
    expect(c.getState().canBeginNextRequest).toBe(false);
    await c.beginNextRequest();
    f.invalidate();
    release();
    await pending;
    expect(c.getState()).toMatchObject({
      status: 'MISSING',
      intent: null,
      receipt: null,
      previousFinal: null,
      canStage: false,
      canBeginNextRequest: false,
    });
    expect(writes(f)).toBe(1);
  });
  it('renders explicit next and previous-recovery actions in the shipped drawer', async () => {
    vi.stubGlobal(
      'MutationObserver',
      class {
        observe() {}
      },
    );
    const f = fixedOfficeCommandFixture('central_bank');
    let c!: ReturnType<typeof createOfficeCommandController>;
    const doc = new HostDocument('central_bank');
    const api = installOfficeCommand(
      doc as unknown as Document,
      { addEventListener() {} } as unknown as Window,
      (b, view) => {
        c = createOfficeCommandController(b, view, {
          fetcher: f.fetcher,
          requestId: () => f.request.requestId,
        });
        return c;
      },
    );
    api.connect(f.binding);
    doc.tools
      .all()
      .find((e) => Object.hasOwn(e.dataset, 'officeCommandEntry'))!
      .click();
    const find = (key: string) =>
      doc.root.all().find((e) => e.dataset.officeCommandAction === key)!;
    expect(find('next-request').disabled).toBe(true);
    c.restoreOriginalForRecovery(f.request);
    f.recover('final');
    await c.recoverOriginal();
    expect(find('next-request').disabled).toBe(false);
    find('next-request').click();
    await expect.poll(() => c.getState().canStage).toBe(true);
    expect(find('previous-final').disabled).toBe(false);
    find('previous-final').click();
    await expect
      .poll(() => c.getState().previousFinalCode)
      .toBe('FINAL_VERIFIED');
    expect(writes(f)).toBe(0);
    f.invalidate();
    expect(doc.root.textContent).not.toContain(f.request.request.commandId);
  });
});

describe('budget submission and automatic receipt recovery', () => {
  function setupBudget(
    fetcher?: (f: ReturnType<typeof fixedOfficeCommandFixture>) => typeof fetch,
  ) {
    const f = fixedOfficeCommandFixture('finance');
    f.read('empty');
    const c = createOfficeCommandController(f.binding, () => f.binding.view, {
      fetcher: fetcher?.(f) ?? f.fetcher,
      requestId: () => f.request.requestId,
    });
    return { f, c };
  }

  it('queries the original after acknowledgement and exposes FINAL while the current page is pending', async () => {
    vi.useFakeTimers();
    let holdPage = false;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { f, c } = setupBudget((f) => async (input, init) => {
      if (
        holdPage &&
        new URL(String(input)).pathname === '/v1/postwar-office-runtime'
      )
        await gate;
      return f.fetcher(input, init);
    });
    await c.refresh();
    expect(c.stage(f.request)).toBe(true);
    expect(c.review()).toBe(true);
    f.submit('ack');
    const confirmed = c.confirm();
    await vi.advanceTimersByTimeAsync(500);
    expect(c.getState()).toMatchObject({ status: 'QUEUE_ACK', receipt: null });
    const readsBefore = f.calls.length;
    f.recover('final');
    holdPage = true;
    await vi.advanceTimersByTimeAsync(850);
    expect(c.getState()).toMatchObject({
      status: 'READING',
      receipt: { outcome: 'COMMITTED', worldVersionAfter: '3' },
      canBeginNextRequest: false,
    });
    release();
    await confirmed;
    expect(c.getState()).toMatchObject({
      status: 'FINAL_VERIFIED',
      currentHead: { worldVersion: '3' },
      canBeginNextRequest: true,
    });
    expect(
      f.calls.slice(readsBefore).map(({ path, body }) => [path, body.dataset]),
    ).toEqual([
      ['/v1/command-recovery', undefined],
      ['/v1/postwar-office-runtime', 'ledger-balances'],
    ]);
    expect(writes(f)).toBe(1);
    c.disconnect();
  });

  it('stops automatic queries at four pending responses and allows manual recovery', async () => {
    vi.useFakeTimers();
    const { f, c } = setupBudget();
    await c.refresh();
    expect(c.stage(f.request)).toBe(true);
    expect(c.review()).toBe(true);
    f.submit('ack');
    const confirmed = c.confirm();
    await vi.advanceTimersByTimeAsync(10_000);
    await confirmed;
    expect(
      f.calls.filter(({ path }) => path === '/v1/command-recovery'),
    ).toHaveLength(4);
    expect(c.getState()).toMatchObject({
      status: 'QUEUE_ACK',
      canRecover: true,
      canConfirm: false,
    });
    expect(writes(f)).toBe(1);
    c.disconnect();
  });

  it('keeps a lost acknowledgement available for manual lookup only', async () => {
    const { f, c } = setupBudget();
    await c.refresh();
    expect(c.stage(f.request)).toBe(true);
    expect(c.review()).toBe(true);
    await c.confirm();
    expect(c.getState()).toMatchObject({
      status: 'UNKNOWN',
      canRecover: true,
      canConfirm: false,
    });
    expect(
      f.calls.filter(({ path }) => path === '/v1/command-recovery'),
    ).toHaveLength(0);
    expect(writes(f)).toBe(1);
    c.disconnect();
  });

  it('lets an explicitly rejected budget request advance after a fresh authorized read', async () => {
    const { f, c } = setupBudget();
    await c.refresh();
    expect(c.stage(f.request)).toBe(true);
    expect(c.review()).toBe(true);
    f.submit('source-rejected');
    await c.confirm();
    expect(c.getState()).toMatchObject({
      status: 'REJECTED',
      canBeginNextRequest: true,
      canRecover: false,
      canStage: false,
    });
    await c.beginNextRequest();
    expect(c.getState()).toMatchObject({ canStage: true, intent: null });
    expect(c.stage(f.request)).toBe(false);
    expect(writes(f)).toBe(1);
    c.disconnect();
  });

  it('renders the original amount and a retryable page state after a committed receipt', async () => {
    vi.stubGlobal(
      'MutationObserver',
      class {
        observe() {}
      },
    );
    vi.useFakeTimers();
    const f = fixedOfficeCommandFixture('finance');
    f.read('empty');
    const doc = new HostDocument('finance');
    let c!: ReturnType<typeof createOfficeCommandController>;
    const api = installOfficeCommand(
      doc as unknown as Document,
      { addEventListener() {} } as unknown as Window,
      (b, view) => {
        c = createOfficeCommandController(b, view, {
          fetcher: f.fetcher,
          requestId: () => f.request.requestId,
        });
        return c;
      },
    );
    api.connect(f.binding);
    const find = (key: string) =>
      doc.root.all().find((e) => e.dataset.officeCommandAction === key);
    find('open')!.click();
    await c.refresh();
    expect(c.stage(f.request)).toBe(true);
    expect(c.review()).toBe(true);
    expect(doc.root.textContent).toContain('设定预算额度 · 100 LC_TEST');
    expect(find('confirm')?.textContent).toContain('确认提交');
    f.submit('ack');
    f.recover('final');
    f.read('unavailable');
    const confirmed = c.confirm();
    await vi.advanceTimersByTimeAsync(500);
    await confirmed;
    expect(doc.root.textContent).toContain('预算申请已生效，当前页暂不可用');
    expect(find('refresh')?.textContent).toContain('刷新页面');
    expect(find('next-request')).toBeUndefined();
    expect(find('confirm')).toBeUndefined();
    f.read('empty');
    await c.refresh();
    expect(find('next-request')?.textContent).toContain('准备下一笔');
    f.invalidate();
    expect(doc.root.textContent).not.toContain('100 LC_TEST');
    expect(writes(f)).toBe(1);
  });
});
