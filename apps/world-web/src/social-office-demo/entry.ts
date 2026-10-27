import { createSocialDemoClient } from './client.js';
import { createSocialDemoController } from './controller.js';
import { createSocialDemoView } from './view.js';

const root = document.getElementById('social-office-demo');
if (!(root instanceof HTMLElement))
  throw Error('Demonstration page root is missing');
const key = `g-social-office-pending:${location.origin}`;
const view = createSocialDemoView(
  root,
  (action) => {
    void controller.submit(action);
  },
  () => {
    void controller.start();
  },
);
const controller = createSocialDemoController({
  client: createSocialDemoClient(location.origin),
  render: (state) => view.render(state),
  pendingStore: {
    read: () => sessionStorage.getItem(key),
    write: (value) => sessionStorage.setItem(key, value),
    clear: () => sessionStorage.removeItem(key),
  },
  newRequestId: () => crypto.randomUUID(),
});
const poll = window.setInterval(() => {
  void controller.poll();
}, 1500);
window.addEventListener(
  'pagehide',
  () => {
    window.clearInterval(poll);
    controller.stop();
  },
  { once: true },
);
window.addEventListener('pageshow', (event) => {
  if (event.persisted) location.reload();
});
void controller.start();
