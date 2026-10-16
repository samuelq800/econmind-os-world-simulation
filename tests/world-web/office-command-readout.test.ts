import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOfficeCommandController } from '../../apps/world-web/src/office-command/controller.js';
import { installOfficeCommand } from '../../apps/world-web/src/office-command/view.js';
import { officeCommandFixture } from './office-command-fixture.js';
import { HostDocument } from './trusted-host-dom.js';

afterEach(() => vi.unstubAllGlobals());

// Actual command controller, read client, model and renderer; only intercepted
// TEST_ONLY transport and the existing DOM double. Never a live source/seat.
function setup(role: 'captain' | 'central_bank' | 'social') {
  const f = officeCommandFixture(role),
    doc = new HostDocument(role);
  vi.stubGlobal(
    'MutationObserver',
    class {
      observe() {}
    },
  );
  const api = installOfficeCommand(
    doc as unknown as Document,
    {
      addEventListener: () => undefined,
    } as unknown as Window,
    (binding, view) =>
      createOfficeCommandController(binding, view, {
        fetcher: f.fetcher,
        requestId: () => f.request.requestId,
      }),
  );
  const click = (action: string) => {
    const button = doc.body
      .all()
      .find((el) => el.dataset.officeCommandAction === action);
    if (!button) throw Error('TEST_ACTION_MISSING_' + action);
    button.click();
  };
  return { f, doc, api, click };
}

describe('Office intent consumes the same schema-bound numeric readback', () => {
  it.each(['captain', 'central_bank', 'social'] as const)(
    'shows actual authorized %s values/head only after explicit read, then clears on invalidation',
    async (role) => {
      const s = setup(role);
      expect(s.doc.body.textContent).not.toContain('TEST_READBACK');
      s.api.connect(s.f.binding);
      s.click('open');
      expect(s.doc.body.textContent).not.toContain('1 events');
      s.click('refresh');
      await expect.poll(() => s.api.getState().status).toBe('CURRENT');
      expect(s.doc.body.textContent).toContain('Recorded authoritative events');
      expect(s.doc.body.textContent).toContain('1 events');
      expect(s.doc.body.textContent).toContain(
        'Source head · World v2 / event 2',
      );
      expect(s.doc.body.textContent).toContain('TEST_READBACK');
      expect(s.doc.body.textContent).toContain('DERIVED_SERVER_PROJECTION');
      if (role === 'central_bank') {
        expect(s.doc.body.textContent).toContain('9007199254740993.25 GCU');
        // This fixture supplies a movement, NOT an opening-inclusive carrier.
        expect(s.doc.body.textContent).toContain(
          'FINANCIAL_POSITION_UNAVAILABLE',
        );
      } else expect(s.doc.body.textContent).not.toContain('TEST_CB_ACCOUNT');
      expect(s.f.commands).toHaveLength(0);
      s.click('close');
      expect(s.doc.body.textContent).not.toContain('TEST_READBACK');
      s.click('open');
      expect(s.doc.body.textContent).toContain('TEST_READBACK');
      s.f.f.invalidate();
      expect(s.api.getState().model).toBeNull();
      expect(s.doc.body.textContent).not.toContain('TEST_READBACK');
      expect(s.doc.body.textContent).not.toContain('9007199254740993.25');
    },
  );

  it('removes previously displayed numbers when a fresh read fails, not substitute defaults', async () => {
    const s = setup('central_bank');
    s.api.connect(s.f.binding);
    s.click('open');
    s.click('refresh');
    await expect.poll(() => s.api.getState().status).toBe('CURRENT');
    expect(s.doc.body.textContent).toContain('9007199254740993.25 GCU');
    s.f.reads(async () => {
      throw Error('TEST_ONLY_UNAVAILABLE');
    });
    s.click('refresh');
    await expect.poll(() => s.api.getState().status).toBe('UNAVAILABLE');
    expect(s.doc.body.textContent).not.toContain('9007199254740993.25');
    expect(s.doc.body.textContent).not.toContain('1 events');
    expect(s.doc.body.textContent).not.toContain('0 GCU');
    expect(s.f.commands).toHaveLength(0);
    s.api.disconnect();
  });
});
