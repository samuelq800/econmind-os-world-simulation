'use strict';
(() => {
  // Public source data is not a World projection or an Office authorization.
  const packageId = 'BALANCED_2026_09_28_V1';
  const selectionChecksum = '88dd44478f97d2e8893a4f11b3aaf96e256bdb13248aca0d08f097fabe10d315';
  const sourceStatus = 'OFFICIAL_SELECTED_OPENING_DATA_NOT_RUNTIME_STATE';
  const numberPattern = /^(?:0[1-9]|[1-6][0-9]|70)$/;
  const sourceSlugs = 'assumptions changes commodity-catalog countries coverage deposits domestic-access employment entities facilities facility-map-links finance geography hazard-proposals illustration-links land-program license-proposals manifest nodes opening-material-reconciliation population-services power production-plans recipes regions seasonal-water settlements stocks supplier-concentration-policy technology-proposals trade-plans transit-proposals transport-routes water-allocations'.split(' ');
  const sourceSlugSet = new Set(sourceSlugs);
  const geographyArraySections = new Set(['partition.territories', 'climates', 'physical', 'currents', 'maritime.countries', 'maritime.assumptions', 'maritime.sources', 'basins', 'backgroundResources']);
  const geographyStringSections = new Set(['partition.coastPath', 'maritime.territorialPath', 'maritime.eezPath', 'maritime.highSeasPath', 'maritime.overlapPath', 'maritime.territorialOverlapPath', 'maritime.oceanPath']);
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
    if (!record(config) || (config.apiBaseUrl !== undefined && config.apiOrigin !== undefined)) return null;
    const address = config.apiBaseUrl ?? config.apiOrigin;
    if (typeof address !== 'string') return null;
    try {
      const url = new URL(address);
      const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      const edgePath = '/functions/v1/world-v2-official-read';
      const validPath = url.pathname === '/' || (config.apiBaseUrl !== undefined &&
        [edgePath, `${edgePath}/`].includes(url.pathname));
      if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
        url.username || url.password || url.search || url.hash || !validPath) return null;
      if (!url.pathname.endsWith('/')) url.pathname += '/';
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
    const outside = options.signal;
    if (outside?.aborted) throw Error('DATA_ABORTED');
    let timer, onAbort;
    try {
      const aborted = new Promise((_, reject) => {
        onAbort = () => { controller.abort(); reject(Error('DATA_ABORTED')); };
        outside?.addEventListener('abort', onAbort, { once: true });
      });
      return await Promise.race([
        fetcher(url, { ...options, signal: controller.signal }).then(json),
        new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(Error('DATA_TIMEOUT')); }, 5000); }),
        aborted,
      ]);
    } finally { clearTimeout(timer); outside?.removeEventListener('abort', onAbort); controller.abort(); }
  }

  function validSourceMetadata(value, slug) {
    return record(value) && value.schemaVersion === 'official-source-dataset-v1' &&
      value.dataNature === 'OFFICIAL_SELECTED_SOURCE_DATASET' &&
      value.packageId === packageId && value.selectionChecksumSha256 === selectionChecksum &&
      value.dataset === slug && value.sourcePath === `data/${slug}.json` &&
      /^[0-9a-f]{64}$/.test(value.sourceSha256) && Number.isSafeInteger(value.sourceBytes) && value.sourceBytes > 0 &&
      ['ARRAY', 'OBJECT', 'GEOGRAPHY'].includes(value.sourceKind) &&
      value.unitTreatment === 'SOURCE_UNITS_PRESERVED_NO_CONVERSION' &&
      value.numericEncoding === 'DECIMAL_STRING_EXACT' && value.unitsSourcePath === 'DATA_DICTIONARY.md' &&
      value.proposalFieldsAreExecuted === false && value.liveWorldState === false &&
      record(value.associations) && ['countryFields', 'entityFields', 'referenceFields'].every(key =>
        Array.isArray(value.associations[key]) && value.associations[key].every(field => typeof field === 'string'));
  }

  function noNumericTokens(value) {
    if (typeof value === 'number') return false;
    if (Array.isArray(value)) return value.every(noNumericTokens);
    if (record(value)) return Object.values(value).every(noNumericTokens);
    return true;
  }

  function createDatasetSession(number, options = {}) {
    const fetcher = options.fetcher || fetch;
    const config = options.config === undefined ? globalThis.__ECONMIND_WORLD_READ_CONFIG__ : options.config;
    const origin = apiOrigin(config);
    let countryNumber = number, generation = 0, controller = null, catalogue = null;
    function cancel() { generation += 1; controller?.abort(); controller = null; }
    function setCountry(nextNumber) { cancel(); countryNumber = nextNumber; catalogue = null; }
    async function request(path, validator) {
      if (!numberPattern.test(countryNumber)) return { kind: 'INVALID', reason: 'COUNTRY_ID_INVALID' };
      if (config == null) return { kind: 'NOT_CONNECTED', reason: 'API_NOT_CONFIGURED' };
      if (!origin) return { kind: 'INVALID', reason: 'API_ORIGIN_INVALID' };
      cancel();
      const current = generation, signal = (controller = new AbortController()).signal;
      try {
        const data = await boundedRead(fetcher, new URL(path, origin), {
          method: 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer',
          headers: { accept: 'application/json' }, signal,
        });
        if (current !== generation || signal.aborted) return { kind: 'STALE', reason: 'READ_RETIRED' };
        return validator(data);
      } catch {
        return current !== generation || signal.aborted
          ? { kind: 'STALE', reason: 'READ_RETIRED' }
          : { kind: 'UNAVAILABLE', reason: 'API_UNAVAILABLE' };
      } finally { if (current === generation) controller = null; }
    }
    async function loadCatalogue() {
      // A refreshed or failed catalogue must never leave old source identities usable.
      catalogue = null;
      const result = await request('v1/world-data/datasets', data => {
        if (!record(data) || data.ok !== true || data.schemaVersion !== 'official-source-catalog-v1' ||
          data.dataNature !== 'OFFICIAL_SELECTED_SOURCE_DATASET' || data.packageId !== packageId ||
          data.selectionChecksumSha256 !== selectionChecksum || data.datasetCount !== 34 ||
          data.databaseAvailability !== 'VERIFY_PER_REQUEST' || data.liveWorldState !== false ||
          !Array.isArray(data.datasets) || data.datasets.length !== 34 ||
          new Set(data.datasets.map(item => item?.dataset)).size !== 34 ||
          !data.datasets.every(item => sourceSlugSet.has(item?.dataset) && validSourceMetadata(item, item.dataset))) {
          return { kind: 'INVALID', reason: 'CATALOGUE_MISMATCH' };
        }
        catalogue = new Map(data.datasets.map(item => [item.dataset, item]));
        return { kind: 'CATALOGUE', datasets: data.datasets };
      });
      if (result.kind !== 'CATALOGUE' && result.kind !== 'STALE') catalogue = null;
      return result;
    }
    async function loadDataset(slug, options = {}) {
      const spec = catalogue?.get(slug);
      if (!spec || !sourceSlugSet.has(slug)) return { kind: 'INVALID', reason: 'DATASET_NOT_IN_CATALOGUE' };
      const offset = options.offset ?? 0, limit = options.limit ?? 20;
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000 ||
        !Number.isSafeInteger(limit) || limit < 1 || limit > 50) return { kind: 'INVALID', reason: 'PAGE_INVALID' };
      const query = new URLSearchParams(), countryId = expectedId(countryNumber);
      let filtered = false;
      if (spec.sourceKind === 'ARRAY') {
        query.set('offset', String(offset)); query.set('limit', String(limit));
        filtered = spec.associations.countryFields.length > 0 || ['changes', 'seasonal-water'].includes(slug);
        if (filtered) query.set('countryId', countryId);
      } else if (spec.sourceKind === 'GEOGRAPHY' && options.section) {
        if (typeof options.section !== 'string' || !/^[a-zA-Z.]+$/.test(options.section)) return { kind: 'INVALID', reason: 'SECTION_INVALID' };
        query.set('section', options.section);
        if (geographyArraySections.has(options.section)) {
          query.set('offset', String(offset)); query.set('limit', String(limit));
          filtered = ['partition.territories', 'maritime.countries', 'basins', 'backgroundResources'].includes(options.section);
          if (filtered) query.set('countryId', countryId);
        } else if (geographyStringSections.has(options.section)) {
          query.set('fragmentOffset', String(offset)); query.set('fragmentLength', '16384');
        }
      }
      const suffix = query.size ? `?${query}` : '';
      const result = await request(`v1/world-data/datasets/${slug}${suffix}`, data => {
        if (!validSourceMetadata(data, slug) || data.ok !== true ||
          ['sourceSha256', 'sourceBytes', 'sourceKind'].some(key => data[key] !== spec[key]))
          return { kind: 'INVALID', reason: 'DATASET_MISMATCH' };
        if (spec.sourceKind === 'OBJECT') {
          if (!record(data.data) || !noNumericTokens(data.data)) return { kind: 'INVALID', reason: 'DATASET_SHAPE_INVALID' };
          return { kind: 'DATA', dataset: slug, data: data.data, sourceKind: 'OBJECT' };
        }
        if (spec.sourceKind === 'GEOGRAPHY' && !options.section) {
          if (!Array.isArray(data.sections) || !data.sections.every(section => typeof section === 'string'))
            return { kind: 'INVALID', reason: 'DATASET_SHAPE_INVALID' };
          return { kind: 'SECTIONS', dataset: slug, sections: data.sections };
        }
        if (spec.sourceKind === 'GEOGRAPHY' && data.section !== options.section)
          return { kind: 'INVALID', reason: 'SECTION_MISMATCH' };
        if (spec.sourceKind === 'GEOGRAPHY' && geographyStringSections.has(options.section)) {
          if (typeof data.fragment !== 'string' || !Number.isSafeInteger(data.totalLength) ||
            data.fragmentOffset !== offset || (data.nextFragmentOffset !== null && !Number.isSafeInteger(data.nextFragmentOffset)))
            return { kind: 'INVALID', reason: 'FRAGMENT_INVALID' };
          return { kind: 'FRAGMENT', dataset: slug, section: options.section, fragment: data.fragment,
            nextOffset: data.nextFragmentOffset, total: data.totalLength };
        }
        if (spec.sourceKind === 'GEOGRAPHY' && !geographyArraySections.has(options.section)) {
          if (!record(data.data) || !noNumericTokens(data.data)) return { kind: 'INVALID', reason: 'DATASET_SHAPE_INVALID' };
          return { kind: 'DATA', dataset: slug, section: options.section, data: data.data, sourceKind: 'GEOGRAPHY' };
        }
        if (!Array.isArray(data.items) || data.offset !== offset || data.returned !== data.items.length ||
          data.items.length > limit || !Number.isSafeInteger(data.total) || data.total < 0 ||
          !record(data.filters) || data.filters.countryId !== (filtered ? countryId : null) ||
          data.nextOffset !== (offset + data.items.length < data.total ? offset + data.items.length : null) ||
          !noNumericTokens(data.items)) return { kind: 'INVALID', reason: 'DATASET_SHAPE_INVALID' };
        if (filtered && spec.sourceKind === 'ARRAY' && spec.associations.countryFields.length &&
          data.items.some(row => !record(row) || !spec.associations.countryFields.some(field =>
            row[field] === countryId || (Array.isArray(row[field]) && row[field].includes(countryId)))))
          return { kind: 'INVALID', reason: 'COUNTRY_FILTER_MISMATCH' };
        return { kind: 'PAGE', dataset: slug, section: options.section || null, items: data.items,
          total: data.total, nextOffset: data.nextOffset, filteredCountryId: filtered ? countryId : null };
      });
      if (result.kind === 'INVALID' || result.kind === 'UNAVAILABLE') catalogue = null;
      return result;
    }
    return Object.freeze({ loadCatalogue, loadDataset, cancel, setCountry, countryId: () => expectedId(countryNumber) });
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

  globalThis.EconWorldRead = Object.freeze({ loadCountry, validCountry, createDatasetSession });
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
