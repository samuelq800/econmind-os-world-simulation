'use strict';
(() => {
  // Public source data is not a World projection or an Office authorization.
  const packageId = 'BALANCED_2026_09_28_V1';
  const selectionChecksum = '88dd44478f97d2e8893a4f11b3aaf96e256bdb13248aca0d08f097fabe10d315';
  const sourceStatus = 'OFFICIAL_SELECTED_OPENING_DATA_NOT_RUNTIME_STATE';
  const numberPattern = /^(?:0[1-9]|[1-6][0-9]|70)$/;
  const requiredProfile = ['population', 'labourForce', 'scenarioUnemployed', 'treasuryCentralBankBalanceGcu', 'bankReservesGcu', 'bankDepositsGcu', 'bankEquityGcu', 'foodAvailableStockTonnes', 'foodDemandTonnesDay'];
  const record = value => value && typeof value === 'object' && !Array.isArray(value);
  const nonnegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const expectedId = number => `visual-territory-${number}`;

  function validCountry(country, number) {
    if (!record(country) || country.id !== expectedId(number) || country.number !== number ||
      country.sourceStatus !== sourceStatus || !record(country.officialOpening) ||
      country.officialOpening.sourcePackageId !== packageId ||
      country.officialOpening.worldId !== null || country.officialOpening.openingSeedCommitted !== false ||
      !record(country.profile) || country.profile.countryId !== country.id ||
      !requiredProfile.every(key => nonnegative(country.profile[key])) ||
      !Array.isArray(country.facilities) || !country.facilities.length ||
      !Array.isArray(country.resources) || !Array.isArray(country.viewBox) ||
      typeof country.scene !== 'string' || typeof country.detail !== 'string') return false;
    const facilityIds = new Set(), resourceIds = new Set();
    for (const site of country.facilities) {
      if (!record(site) || typeof site.id !== 'string' || facilityIds.has(site.id) ||
        site.countryId !== country.id || !record(site.record) ||
        site.record.id !== site.id || site.record.countryId !== country.id ||
        typeof site.record.operational !== 'boolean') return false;
      facilityIds.add(site.id);
    }
    for (const resource of country.resources) {
      if (!record(resource) || typeof resource.id !== 'string' || resourceIds.has(resource.id) ||
        resource.countryId !== country.id ||
        (resource.deposit && (resource.deposit.id !== resource.id || resource.deposit.countryId !== country.id))) return false;
      resourceIds.add(resource.id);
    }
    if (country.facilities.some(site => site.resourceId && !resourceIds.has(site.resourceId))) return false;
    return true;
  }

  function apiOrigin(config) {
    if (!record(config) || typeof config.apiOrigin !== 'string') return null;
    try {
      const url = new URL(config.apiOrigin);
      const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
        url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
      return url;
    } catch { return null; }
  }

  function sameFields(source, local) {
    if (!record(source) || source.id !== local.id || source.number !== local.number ||
      source.name !== local.name || source.population !== local.profile.population ||
      source.labourForce !== local.profile.labourForce || source.areaKm2 !== local.areaKm2 ||
      source.coastal !== local.coastal ||
      source.economyIdProposal !== local.profile.economyIdProposal ||
      source.teamAssignment !== null || source.administrationProposal !== 'NPC_UNTIL_TEAM_ASSIGNED') return false;
    return JSON.stringify(source.neighbours) === JSON.stringify(local.neighbours) &&
      JSON.stringify(source.climateMix) === JSON.stringify(local.climateMix);
  }

  async function json(response) {
    if (!response.ok || !response.headers.get('content-type')?.toLowerCase().includes('application/json')) throw Error('DATA_UNAVAILABLE');
    if (!response.body) throw Error('DATA_EMPTY');
    const reader = response.body.getReader(), chunks = [];
    let total = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        total += part.value.byteLength;
        if (total > 512 * 1024) throw Error('DATA_TOO_LARGE');
        chunks.push(part.value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  }

  async function boundedRead(fetcher, url, options) {
    const controller = new AbortController();
    let timer;
    try {
      return await Promise.race([
        fetcher(url, { ...options, signal: controller.signal }).then(json),
        new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(Error('DATA_TIMEOUT')); }, 5000); }),
      ]);
    } finally { clearTimeout(timer); controller.abort(); }
  }

  async function loadCountry(number, options = {}) {
    if (!numberPattern.test(number)) return { kind: 'MISSING', country: null, reason: 'COUNTRY_ID_INVALID', runtime: 'NOT_CONNECTED' };
    const fetcher = options.fetcher || fetch;
    let local;
    try {
      local = await boundedRead(fetcher, `countries/data/${number}.json`, { credentials: 'omit', redirect: 'error' });
      if (!validCountry(local, number)) throw Error('STATIC_BASELINE_INVALID');
    } catch {
      return { kind: 'MISSING', country: null, reason: 'STATIC_BASELINE_UNAVAILABLE', runtime: 'NOT_CONNECTED' };
    }
    const config = options.config === undefined ? globalThis.__ECONMIND_WORLD_READ_CONFIG__ : options.config;
    const origin = apiOrigin(config);
    if (config != null && !origin) return { kind: 'STATIC_DISCONNECTED', country: local, reason: 'API_ORIGIN_INVALID', runtime: 'NOT_CONNECTED' };
    if (!origin) return { kind: 'STATIC_BASELINE', country: local, reason: null, runtime: 'NOT_CONNECTED' };
    try {
      const path = `v1/world-data/countries/${expectedId(number)}`;
      const envelope = await boundedRead(fetcher, new URL(path, origin), {
        method: 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store',
        headers: { accept: 'application/json' },
      });
      if (!record(envelope) || envelope.ok !== true || envelope.schemaVersion !== 'official-country-baseline-v1' ||
        envelope.dataNature !== 'OFFICIAL_SELECTED_SOURCE_DATASET' ||
        envelope.packageId !== packageId || envelope.selectionChecksumSha256 !== selectionChecksum ||
        envelope.countriesSha256 !== local.officialOpening.countriesSha256 ||
        envelope.sourcePath !== 'data/countries.json' ||
        envelope.proposalFieldsAreExecuted !== false || envelope.liveWorldState !== false ||
        !record(envelope.units) || envelope.units.population !== 'persons' ||
        envelope.units.areaKm2 !== 'km2' || envelope.units.gcuReference !== 'GCU_SCENARIO_ACCOUNTING_UNIT' ||
        envelope.countryId !== expectedId(number) || !sameFields(envelope.country, local)) {
        return { kind: 'STATIC_DISCONNECTED', country: local, reason: 'API_BASELINE_MISMATCH', runtime: 'NOT_CONNECTED' };
      }
      // The first API contract has no map, facility, deposit or finance fields.
      // Keep those strictly in the selected static package; never synthesize them.
      return { kind: 'API_COUNTRY_VERIFIED', country: local, reason: null, runtime: 'NOT_CONNECTED' };
    } catch {
      return { kind: 'STATIC_DISCONNECTED', country: local, reason: 'API_UNAVAILABLE', runtime: 'NOT_CONNECTED' };
    }
  }

  globalThis.EconWorldRead = Object.freeze({ loadCountry, validCountry });
})();
// National geography and local interaction state are separate from authoritative world settlement.
let contextCountry=null,contextCountrySource=null;
function brandScene(){const h=document.querySelector('.scene-header .scene-location');if(h&&!h.querySelector('.scene-official-badge')){const badge=document.createElement('img');badge.className='scene-official-badge';badge.src='assets/lobby/econmind-badge-96.png';badge.alt='EconMind badge';h.prepend(badge)}if(countryScope&&contextCountry){document.body.classList.add('country-bound');const clockBox=document.querySelector('#world-clock');if(clockBox)clockBox.style.display='none';const back=document.querySelector('.scene-back');if(back){back.dataset.cmd='country-home';back.innerHTML='← <span>'+esc(contextCountry.name)+'</span>';back.setAttribute('aria-label','Return to '+contextCountry.name)}const heading=document.querySelector('.scene-kicker');if(heading)heading.textContent=contextCountry.name+' / '+roles[role].name;const edition=document.querySelector('.scene-edition');if(edition)edition.textContent=contextCountry.name+' · 本国参数草稿 · 未提交正式世界';}}
const countryScene=scene;scene=function(...args){document.body.classList.remove('country-map-home');countryScene(...args);brandScene()};
function countryHome(){if(window.CountryGame)CountryGame.home();}
const countryDataReady=countryScope?Promise.resolve().then(()=>EconWorldRead.loadCountry(countryScope)).then(result=>{contextCountrySource=result;if(!result.country)throw Error('Official opening data unavailable');contextCountry=result.country;brandScene();return contextCountry;}):Promise.resolve(null);
if(countryScope){commands['country-home']=countryHome;commands.close=countryHome;commands['journey-home']=countryHome;const countrySave=commands['save-policy'];commands['save-policy']=()=>{data.countryId='visual-territory-'+countryScope;countrySave();};countryDataReady.catch(()=>{document.querySelector('#game').innerHTML='<main class="game-shell"><div class="edition">Official opening data unavailable. No sample values were substituted. Reload to retry.</div></main>';toast('Country data unavailable. Reload to retry.');});}
const readyBrand=setInterval(()=>{if(!window.GameTest)return;clearInterval(readyBrand);brandScene()},50);
if(countryScope){openModule=function(id){const module=catalog?.modules.find(m=>m.id===id);if(module?.role!==roles[countryOffice].code){toast('该操作属于其他部长席位。');return;}toast('World 实时数据与命令接口尚未接通；不能使用本地样例结算。');};}
