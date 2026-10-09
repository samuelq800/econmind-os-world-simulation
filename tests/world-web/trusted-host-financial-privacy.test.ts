import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFinancialIntake } from '../../apps/world-web/src/financial-intake/view.js';
import { createFinancialIntakeController } from '../../apps/world-web/src/financial-intake/controller.js';
import { createProductionReadClient } from '../../apps/world-web/src/production-read/client.js';
import { financialIntakeFixture } from './financial-intake-fixture.js';
import { HostDocument } from './trusted-host-dom.js';

afterEach(() => vi.unstubAllGlobals());

/** No trusted-host installation. No host state polling or reopen after loss.
 * A real direct consumer must retire its own CLOSED private surface. */
function directView() {
  const fixture = financialIntakeFixture('trade', 'REGISTER');
  const doc = new HostDocument('trade');
  let mutation: () => void = () => undefined;
  vi.stubGlobal(
    'MutationObserver',
    class {
      constructor(fn: () => void) {
        mutation = fn;
      }
      observe() {}
    },
  );
  const ui = installFinancialIntake(
    doc as unknown as Document,
    {
      addEventListener() {},
    } as unknown as Window,
    (binding, view) =>
      createFinancialIntakeController(binding, view, {
        fetcher: fixture.fetcher,
        readFactory: (config) =>
          createProductionReadClient(config, { fetcher: fixture.f.fetcher }),
      }),
  );
  ui.connect(fixture.binding);
  doc.tools.children[0]!.click();
  const drawer = doc.root
    .all()
    .find((el) => Object.hasOwn(el.dataset, 'financialIntakeDialog'))!;
  expect(drawer.textContent).toContain('TEST_COMMAND');
  expect(drawer.textContent).toContain('9007199254740993.25');
  drawer.close();
  return { fixture, doc, ui, drawer, mutation: () => mutation() };
}
describe('direct Financial view CLOSED privacy / shipped consumer / OFFLINE TEST_ONLY', () => {
  it.each(['revoke', 'disconnect', 'roleloss'] as const)(
    '%s immediately removes private DOM without reopen/poll/bootstrap',
    (loss) => {
      const m = directView();
      // Valid ordinary close keeps the original existing behaviour.
      expect(m.drawer.textContent).toContain('TEST_COMMAND');
      if (loss === 'revoke') m.fixture.f.invalidate();
      if (loss === 'disconnect') m.ui.disconnect();
      if (loss === 'roleloss') {
        m.doc.root.dataset.office = 'finance';
        m.mutation();
      }
      expect(m.drawer.open).toBe(false);
      expect(m.drawer.children).toHaveLength(0);
      expect(m.doc.body.textContent).not.toContain('TEST_COMMAND');
      expect(m.doc.body.textContent).not.toContain('9007199254740993.25');
      expect(m.fixture.calls).toHaveLength(0);
      expect(m.fixture.f.calls).toHaveLength(0);
    },
  );
  it('valid close can reopen the same original; lost authority cannot restore it', () => {
    const m = directView();
    m.doc.tools.children[0]!.click();
    expect(m.drawer.textContent).toContain('TEST_COMMAND');
    m.drawer.close();
    m.fixture.f.invalidate();
    m.doc.tools.children[0]!.click();
    expect(m.drawer.textContent).not.toContain('TEST_COMMAND');
    expect(m.drawer.textContent).not.toContain('9007199254740993.25');
    m.ui.disconnect();
  });
});
