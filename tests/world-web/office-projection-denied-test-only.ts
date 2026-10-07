import { createProductionReadClient } from '../../apps/world-web/src/production-read/client.js';
import { createOfficeProjectionController } from '../../apps/world-web/src/office-projection/controller.js';
import { installOfficeProjection } from '../../apps/world-web/src/office-projection/view.js';
import { officeProjectionFixture } from './office-projection-fixture.js';

let denied = 0;
const fixture = officeProjectionFixture('finance');
const api = installOfficeProjection(document, window, (binding, view) =>
  createOfficeProjectionController(binding, view, (config) =>
    createProductionReadClient(config, {
      fetcher: (input, init) =>
        denied
          ? Promise.resolve(new Response(null, { status: denied }))
          : fixture.fetcher(input, init),
    }),
  ),
);
document.querySelector('#connect')?.addEventListener('click', () => {
  denied = 0;
  api.connect(fixture.binding);
});
document.querySelector('#deny401')?.addEventListener('click', () => {
  denied = 401;
});
document.querySelector('#deny403')?.addEventListener('click', () => {
  denied = 403;
});
