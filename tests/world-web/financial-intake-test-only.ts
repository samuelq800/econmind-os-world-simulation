import { createFinancialIntakeController } from '../../apps/world-web/src/financial-intake/controller.js';
import { installFinancialIntake } from '../../apps/world-web/src/financial-intake/view.js';
import type { OfficeRole } from '../../apps/world-web/src/office-projection/model.js';
import { financialIntakeFixture } from './financial-intake-fixture.js';

let fixture = financialIntakeFixture();
const api = installFinancialIntake(document, window, (binding, view) =>
  createFinancialIntakeController(binding, view, {
    fetcher: (input, init) => fixture.fetcher(input, init),
    readFactory: () => fixture.f.client(),
  }),
);
document.querySelector('#role')?.addEventListener('change', (event) => {
  api.disconnect();
  const role = (event.target as HTMLSelectElement).value as OfficeRole;
  document.querySelector<HTMLElement>('.country-game')!.dataset.office = role;
});
document.querySelector('#connect')?.addEventListener('click', () => {
  const role = document.querySelector<HTMLElement>('.country-game')!.dataset
    .office as OfficeRole;
  fixture = financialIntakeFixture(
    role,
    role === 'finance' ? 'SIGN_BUYER_FINANCE' : 'ENQUEUE',
  );
  api.connect(fixture.binding);
});
document
  .querySelector('#unknown')
  ?.addEventListener('click', () =>
    fixture.setReply({ status: 503, state: { status: 'UNKNOWN' } }),
  );
document
  .querySelector('#revoke')
  ?.addEventListener('click', () => fixture.f.invalidate());
