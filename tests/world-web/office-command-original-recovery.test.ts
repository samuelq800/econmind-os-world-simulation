/** OFFLINE TEST_ONLY transport/DOM protocol. Real Chromium/backend evidence is
 * a separate native stage; these responses do not assert an economic commit. */
import { afterEach, describe, it, expect, vi } from 'vitest';
import { createOfficeCommandController } from '../../apps/world-web/src/office-command/controller.js';
import { installOfficeCommand } from '../../apps/world-web/src/office-command/view.js';
import { fixedOfficeCommandFixture } from './office-command-fixed-offices-fixture.js';
import { HostDocument, type HostElement } from './trusted-host-dom.js';
afterEach(() => vi.unstubAllGlobals());
function controller(
  f: ReturnType<typeof fixedOfficeCommandFixture>,
  fetcher = f.fetcher,
) {
  return createOfficeCommandController(f.binding, () => f.binding.view, {
    fetcher,
    requestId: () => f.request.requestId,
  });
}
describe('explicit original-request recovery after a page reload', () => {
  it('accepts the old head for query only after a new controller reads a newer head, with zero resubmission', async () => {
    const f = fixedOfficeCommandFixture('central_bank');
    f.submit('ack');
    const first = controller(f);
    await first.refresh();
    expect(first.stage(f.request)).toBe(true);
    expect(first.review()).toBe(true);
    await first.confirm();
    f.recover('final');
    await first.recoverOriginal();
    expect(first.getState().currentHead?.worldVersion).toBe('3');
    first.disconnect();
    const fresh = controller(f);
    await fresh.refresh();
    expect(fresh.getState().currentHead?.worldVersion).toBe('3');
    const writes = f.calls.filter(
      (c) => c.path === '/v1/office-command',
    ).length;
    expect(fresh.restoreOriginalForRecovery(f.request)).toBe(true);
    expect(fresh.getState()).toMatchObject({
      status: 'UNKNOWN',
      canStage: false,
      canReview: false,
      canConfirm: false,
      canRecover: true,
      intent: { request: { expectedWorldVersion: '2' } },
    });
    expect(
      fresh.stage({
        ...f.request,
        request: { ...f.request.request, expectedWorldVersion: '3' },
      }),
    ).toBe(false);
    expect(fresh.review()).toBe(false);
    await fresh.confirm();
    await fresh.recoverOriginal();
    expect(fresh.getState()).toMatchObject({
      status: 'FINAL_VERIFIED',
      receipt: { outcome: 'COMMITTED' },
      currentHead: { worldVersion: '3' },
      canConfirm: false,
    });
    expect(f.calls.filter((c) => c.path === '/v1/office-command')).toHaveLength(
      writes,
    );
    const recovered = f.calls
      .filter((c) => c.path === '/v1/command-recovery')
      .at(-1)!.body as { request: { originalRequest: unknown } };
    expect(recovered.request.originalRequest).toEqual(f.request);
  });
  it('recovers an explicit original with no previously obtained fingerprint, and never enables submit when the server reports pending', async () => {
    const f = fixedOfficeCommandFixture('trade'),
      c = controller(f);
    expect(c.restoreOriginalForRecovery(f.request)).toBe(true);
    expect(f.calls).toHaveLength(0);
    await c.recoverOriginal();
    expect(c.getState()).toMatchObject({
      status: 'QUEUE_ACK',
      canConfirm: false,
      canStage: false,
      canRecover: true,
    });
    const request = f.calls.find((r) => r.path === '/v1/command-recovery')!.body
      .request as Record<string, unknown>;
    expect(request).not.toHaveProperty('knownCommandFingerprint');
    expect(request.originalRequest).toEqual(f.request);
    await c.confirm();
    expect(f.calls.some((r) => r.path === '/v1/office-command')).toBe(false);
  });
  it('recovers FINAL without a successful current page and retains the receipt when readback remains unavailable', async () => {
    const f = fixedOfficeCommandFixture('trade'),
      c = controller(f);
    f.read('unavailable');
    f.recover('final');
    await c.refresh();
    expect(c.getState()).toMatchObject({
      status: 'UNAVAILABLE',
      currentHead: null,
      runtimePage: null,
    });
    expect(c.restoreOriginalForRecovery(f.request)).toBe(true);
    await c.recoverOriginal();
    expect(c.getState()).toMatchObject({
      status: 'UNAVAILABLE',
      receipt: { outcome: 'COMMITTED', commandId: f.request.request.commandId },
      currentHead: null,
      runtimePage: null,
      canStage: false,
      canConfirm: false,
      completion: false,
    });
    await c.confirm();
    expect(
      f.calls.filter((r) => r.path === '/v1/command-recovery'),
    ).toHaveLength(1);
    expect(f.calls.some((r) => r.path === '/v1/office-command')).toBe(false);
  });
  it('rejects foreign World/country/office/family and future head without querying or changing into a submit intent', async () => {
    const f = fixedOfficeCommandFixture('trade'),
      c = controller(f);
    await c.refresh();
    const before = f.calls.length;
    for (const patch of [
      { worldId: 'WORLD_OTHER' },
      { countryId: 'COUNTRY_OTHER' },
      { officeId: 'CENTRAL_BANK', commandType: 'CORE_CENTRAL_BANK_OMO_V1' },
      { commandType: 'CORE_INDUSTRY_FIRST_DAY_WORK_V1' },
      { expectedWorldVersion: '999' },
    ])
      expect(
        c.restoreOriginalForRecovery({
          ...f.request,
          request: { ...f.request.request, ...patch },
        }),
      ).toBe(false);
    expect(f.calls).toHaveLength(before);
    expect(c.getState().intent).toBeNull();
    f.invalidate();
    expect(c.restoreOriginalForRecovery(f.request)).toBe(false);
    expect(c.getState()).toMatchObject({
      status: 'MISSING',
      canRestoreOriginal: false,
      intent: null,
    });
  });
  it('clears private original/receipt/pages on real transport 403 and cannot confirm afterward', async () => {
    const f = fixedOfficeCommandFixture('trade'),
      c = controller(f, async (input, init) =>
        new URL(String(input)).pathname === '/v1/command-recovery'
          ? Response.json({ error: { code: 'FORBIDDEN' } }, { status: 403 })
          : f.fetcher(input, init),
      );
    await c.refresh();
    expect(c.restoreOriginalForRecovery(f.request)).toBe(true);
    await c.recoverOriginal();
    expect(c.getState()).toMatchObject({
      status: 'DENIED',
      intent: null,
      receipt: null,
      runtimePage: null,
      runParametersPage: null,
      canRestoreOriginal: false,
      canStage: false,
      canConfirm: false,
    });
    await c.confirm();
    expect(f.calls.some((r) => r.path === '/v1/office-command')).toBe(false);
  });
  it('exposes a distinct recovery-only button in the shipped drawer without stage/review/confirm', async () => {
    vi.stubGlobal(
      'MutationObserver',
      class {
        observe() {}
      },
    );
    const f = fixedOfficeCommandFixture('trade');
    f.recover('final');
    const doc = new HostDocument('trade');
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
        .find((e) => Object.hasOwn(e.dataset, 'officeCommandDialog'))!,
      find = (key: string) =>
        dialog.all().find((e) => e.dataset.officeCommandAction === key)!;
    const draft = dialog
      .all()
      .find((e) =>
        Object.hasOwn(e.dataset, 'officeCommandDraft'),
      )! as HostElement & { value: string };
    draft.value = JSON.stringify(f.request);
    expect(draft.disabled).toBe(false);
    find('restore').click();
    expect(api.getState()).toMatchObject({
      status: 'UNKNOWN',
      canConfirm: false,
      canStage: false,
    });
    expect(find('confirm').disabled).toBe(true);
    expect(f.calls).toHaveLength(0);
    find('recover').click();
    await expect.poll(() => api.getState().status).toBe('FINAL_VERIFIED');
    expect(f.calls.some((r) => r.path === '/v1/office-command')).toBe(false);
    f.invalidate();
    expect(api.getState().intent).toBeNull();
    expect(doc.root.textContent).not.toContain(f.request.request.commandId);
  });
});
