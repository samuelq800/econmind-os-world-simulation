'use strict';
// This adapter exists only in the loopback preview. No production runtime/seat.
(() => {
  const send = detail => parent.postMessage({ type: 'ECONMIND_DEMO', country: countryScope, office: role, ...detail }, location.origin);
  const localLog = (action, extra = {}) => send({ action, kind: 'DEMO_LOCAL', ...extra });
  const ready = setInterval(() => {
    if (!window.GameTest || !window.CountryGame || !contextCountry) return;
    clearInterval(ready);
    localStorage.setItem('econmind-DEMO_LOCAL-language', 'en');
    window.EconI18n?.refresh();
    // Keep the original field renderer and scene mechanics, not their country
    // execution guard. That guard was omitted only from the served local copy.
    const localModule = openModule;
    openModule = id => {
      const module = catalog.modules.find(item => item.id === id && item.role === roles[role].code);
      if (!module) return;
      localModule(id);
      localLog('Open form', { module: id });
    };
    for (const [key, handler] of Object.entries(commands)) {
      if (!['save-policy', 'lend', 'announce-rate', 'fx', 'expand', 'ship', 'train', 'match', 'clinic', 'fund-commit', 'issue', 'enact', 'approve', 'finance-approve'].includes(key)) continue;
      commands[key] = button => {
        const before = JSON.stringify(s);
        const value = handler(button);
        localLog(key, { demoDay: s.day, records: s.log.length, outcome: before === JSON.stringify(s) ? 'No local change' : 'Local sample changed; no official effect' });
        return value;
      };
    }
    commands['country-confirm'] = () => {
      const plan = CountryGame.state();
      const key = KEY + ':demo-allocations';
      const records = JSON.parse(localStorage.getItem(key) || '[]');
      records.push({ mode: 'DEMO_LOCAL', country: countryScope, office: role, target: plan.site, amount: plan.amount, timestamp: new Date().toISOString(), result: 'Demo allocation recorded; no official effect' });
      localStorage.setItem(key, JSON.stringify(records));
      localLog('Demo allocation recorded', { target: plan.site, amount: plan.amount });
      toast('DEMO recorded · no official effect');
    };
    const enableAllocation = () => {
      const button = document.querySelector('[data-cmd=country-confirm]');
      if (button) {
        button.disabled = CountryGame.state().amount <= 0;
        if (button.firstChild.textContent !== 'Record demo allocation ') button.firstChild.textContent = 'Record demo allocation ';
      }
    };
    const observer = new MutationObserver(enableAllocation);
    observer.observe(document.querySelector('#game'), { childList: true, subtree: true });
    document.addEventListener('input', enableAllocation);
    document.addEventListener('click', enableAllocation);
    document.addEventListener('click', event => {
      const link = event.target.closest('a[href^="countries/"]');
      if (!link) return;
      event.preventDefault(); event.stopImmediatePropagation();
      send({ action: 'show-map' });
    }, true);
    // One selector controls the whole preview; never leave the parent office
    // and the child role/storage namespace out of sync.
    document.addEventListener('change', event => {
      if (!event.target.matches('[data-country-role-switch]')) return;
      event.stopImmediatePropagation();
      send({ action: 'select-office', nextOffice: event.target.value });
    }, true);
    window.addEventListener('message', event => {
      if (event.origin !== location.origin || event.source !== parent || event.data?.type !== 'ECONMIND_DEMO_CONTROL') return;
      const action = event.data.action;
      if (action === 'home') CountryGame.home();
      if (action === 'actions') { CountryGame.home(); commands['country-functions'](); }
      if (action === 'scene') { view = Math.max(0, Math.min(2, Number(event.data.index) || 0)); openRoomScene(view); }
      if (action === 'next') { const next = nextEvent(); advance(Number.isFinite(next) && next > s.day ? next - s.day : 1); localLog('Next demo event', { demoDay: s.day, records: s.log.length }); }
      if (action === 'reset') {
        // Only this country/office demo namespace, never user/production state.
        localStorage.removeItem(KEY); localStorage.removeItem(KEY + ':map-decisions-v1'); localStorage.removeItem(KEY + ':demo-allocations');
        localLog('Reset local demo'); location.reload();
      }
      if (action === 'module') openModule(event.data.id);
    });
    send({ action: 'ready', moduleCount: catalog.modules.filter(m => m.role === roles[role].code).length });
    enableAllocation();
  }, 50);
})();
