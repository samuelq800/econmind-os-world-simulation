import { createOfficeProjectionController } from '../../apps/world-web/src/office-projection/controller.js';
import { installOfficeProjection } from '../../apps/world-web/src/office-projection/view.js';
import type { OfficeRole } from '../../apps/world-web/src/office-projection/model.js';
import { currentFinancialPositionFixture } from './current-financial-position-fixture.js';

// Explicit test entry only; no production import, global fetch mock or fallback.
let fixture = currentFinancialPositionFixture('finance');
const ui = installOfficeProjection(document, window, (binding, view) =>
  createOfficeProjectionController(binding, view, () => fixture.client()),
);
const roleSelect = document.querySelector<HTMLSelectElement>('#test-role')!;
const carrierSelect =
  document.querySelector<HTMLSelectElement>('#test-carrier')!;
function replace() {
  ui.disconnect();
  fixture.invalidate();
  const role = roleSelect.value as OfficeRole;
  document.querySelector<HTMLElement>('.country-game')!.dataset.office = role;
  fixture = currentFinancialPositionFixture(role);
  const p = fixture.getCarrier();
  switch (carrierSelect.value) {
    case 'legacy':
      fixture.setCarrier(undefined);
      return;
    case 'empty':
      p.positions = [];
      break;
    case 'negative':
      if (Array.isArray(p.positions))
        Object.assign(p.positions[0]!, {
          accountClass: 'EQUITY',
          netDebitBalance: '-13',
        });
      break;
    case 'seed':
      if (p.opening)
        (p.opening as Record<string, unknown>).seedId = 'OTHER_SEED';
      break;
    case 'denied':
      fixture.setCarrier({
        schemaVersion: 'authoritative-financial-position-v1',
        status: 'NOT_AUTHORIZED',
        reason: 'SCOPE_NOT_AUTHORIZED',
      });
      return;
    default:
      return;
  }
  fixture.setCarrier(p);
}
roleSelect.addEventListener('change', replace);
carrierSelect.addEventListener('change', replace);
document
  .querySelector('#test-connect')!
  .addEventListener('click', () => ui.connect(fixture.binding));
document
  .querySelector('#test-revoke')!
  .addEventListener('click', () => fixture.invalidate());
