import { createOfficeProjectionController } from '../../apps/world-web/src/office-projection/controller.js';
import { installOfficeProjection } from '../../apps/world-web/src/office-projection/view.js';
import type { OfficeRole } from '../../apps/world-web/src/office-projection/model.js';
import { officeProjectionFixture } from './office-projection-fixture.js';

// This explicitly opened test document is not a Vite production entry and is
// never imported by the production UI. No global fetch mock or runtime fallback.
let fixture = officeProjectionFixture('captain');
const ui = installOfficeProjection(document, window, (binding, view) =>
  createOfficeProjectionController(binding, view, () => fixture.client()),
);
const select = document.querySelector<HTMLSelectElement>('#test-role')!;
select.addEventListener('change', () => {
  ui.disconnect();
  fixture.invalidate();
  const role = select.value as OfficeRole;
  document.querySelector<HTMLElement>('.country-game')!.dataset.office = role;
  fixture = officeProjectionFixture(role);
});
document
  .querySelector('#test-connect')!
  .addEventListener('click', () => ui.connect(fixture.binding));
document
  .querySelector('#test-revoke')!
  .addEventListener('click', () => fixture.invalidate());
