'use strict';
(() => {
 if(!countryScope)return;
 const config={
  captain:{heading:'Choose the next national priority',lead:'Select a site and set its place in the national agenda.',label:'Priority',unit:'',max:3,step:1,rooms:[['Cabinet chamber','Set the national agenda','captain-2','♜'],['National strategy','Choose a development direction','captain-5','⚑'],['Diplomatic hall','Coordinate with other countries','captain-6','✧']]},
  finance:{heading:'Keep the country building',lead:'Allocate operating cover to a site. Compare its cost with the treasury reference.',label:'Operating cover',unit:'days',max:30,step:5,rooms:[['Project funding','Allocate project participation','finance-17','◈'],['Bond exchange','Set issuance terms','finance-3','⚖'],['Treasury','Schedule cash and payments','finance-11','◷']]},
  central_bank:{national:'National banking system',heading:'Keep money moving',lead:'Set aside a liquidity buffer and compare it with the banking system.',label:'Reserve allocation',unit:'%',max:100,step:10,rooms:[['Clearing house','Review reserves and capital','central_bank-3','◎'],['Monetary chamber','Set the policy rate','central_bank-8','◉'],['FX exchange','Manage foreign-currency transactions','central_bank-5','⇄']]},
  industry:{heading:'Prepare the next production site',lead:'Match planned power to the selected facility. Capacity requires workers, water and equipment too.',label:'Power coverage',unit:'%',max:100,step:10,rooms:[['Power dispatch','Allocate electricity','industry-14','ϟ'],['Production works','Set production targets','industry-13','⚒'],['Construction site','Expand a facility','industry-21','⌂']]},
  trade:{national:'National food reserve',heading:'Connect this country to the market',lead:'Compare a shipment with available food stock and the domestic demand reference.',label:'Food shipment',unit:'% of stock',max:100,step:5,rooms:[['Market harbour','Arrange a spot import','trade-27','⚓'],['Export quay','Set an export order','trade-5','◇'],['Customs house','Set customs rules','trade-20','▤']]},
  social:{heading:'Bring people into the country’s next chapter',lead:'Match a workforce to a local facility. Assignment does not imply training or arrival.',label:'Workforce coverage',unit:'%',max:100,step:10,rooms:[['Technical academy','Arrange skills training','social-12','♧'],['Employment bureau','Connect people with jobs','social-10','♙'],['Community clinic','Plan healthcare services','social-5','✚']]}
 };
 const planKey=KEY+':map-decisions-v1';let plan;try{plan=JSON.parse(localStorage.getItem(planKey))}catch{};plan=plan&&plan.country===countryScope&&plan.role===role?plan:{country:countryScope,role,site:null,amount:0,records:[]};
 // Public view navigation only: never setRole, grant an Office, or dispatch a command.
 function countryRoleViewHref(number, nextRole, href) {
  if (!/^(?:0[1-9]|[1-6][0-9]|70)$/.test(number) || !Object.hasOwn(config, nextRole)) return null;
  try {
   const current = new URL(href);
   const incomingRole = current.searchParams.get('role');
   if (current.searchParams.getAll('role').length > 1 || current.searchParams.getAll('country').length !== 1 || current.searchParams.get('country') !== number || (incomingRole !== null && !Object.hasOwn(config, incomingRole))) return null;
   return new URL(`?role=${nextRole}&country=${number}#country`, new URL('./', current)).href;
  } catch { return null; }
 }
 function mountCountryRoleSwitch(root) {
  const identity = root.querySelector('.national-identity strong');
  if (!identity || typeof location.href !== 'string') return;
  const currentHref = countryRoleViewHref(countryScope, role, location.href);
  if (!currentHref) return;
  const label = document.createElement('label');
  label.setAttribute('style', 'display:block;max-width:100%;font-size:9px');
  label.textContent = 'Static view · No seat grant';
  const select = document.createElement('select');
  select.setAttribute('data-country-role-switch', '');
  select.setAttribute('aria-label', 'Switch this country’s public role view (no Office authorization)');
  select.setAttribute('style', 'display:block;max-width:100%;width:100%;min-height:44px;margin-top:4px;font:12px Georgia,serif;color:#254a41;background:#fff6d9;border:1px solid #bbaa72;border-radius:6px');
  for (const key of Object.keys(config)) {
   const option = document.createElement('option');
   option.value = key;
   option.textContent = roles[key].name;
   option.selected = key === role;
   select.append(option);
  }
  select.value = role;
  select.addEventListener('change', () => {
   const target = countryRoleViewHref(countryScope, select.value, location.href);
   if (target) location.assign(target);
   else select.value = role;
  });
  select.addEventListener('focus', () => { select.style.outline = '3px solid #ffd26f'; });
  select.addEventListener('blur', () => { select.style.outline = ''; });
  label.append(select);
  identity.replaceChildren(label);
  // Keep the native 44px control within the existing HUD row; no shared layout edit.
  const badgeIdentity = root.querySelector('.national-identity');
  if (badgeIdentity) badgeIdentity.style.paddingBlock = '0';
 }
 const office=config[role],n=v=>Number(v).toLocaleString('en-US',{maximumFractionDigits:2}),c=()=>contextCountry,f=()=>c().facilities.find(x=>x.id===plan.site)||c().facilities[0];
 const sourceSession=EconWorldRead.createDatasetSession(countryScope);
 const sourceOffice={captain:['countries','regions','facilities','population-services','hazard-proposals','land-program'],finance:['finance','stocks','trade-plans','facilities','countries'],central_bank:['finance','countries','entities'],industry:['facilities','deposits','production-plans','recipes','power','water-allocations','employment'],trade:['stocks','trade-plans','transport-routes','transit-proposals','commodity-catalog','supplier-concentration-policy'],social:['population-services','employment','settlements','water-allocations','hazard-proposals','facilities']};
 const sourceGlance={finance:['cashRunwayDays','treasuryCentralBankBalance','bankReserveAssets'],stocks:['commodityId','available','bufferDays'],facilities:['name','capacity','requiredWorkers'],deposits:['commodityId','recoverableRemaining','extractionCapacityPerDay'],employment:['labourForce','employed','unemployed'],'population-services':['hospitalBeds','schoolSeats','waterDomesticM3Day'],power:['averageDemandMW','averageDeliveredMW','hourlyDispatchValidated'],'trade-plans':['commodityId','quantityPerDay','travelSimDaysEstimate'],'transport-routes':['distanceKm','status','engineeringAndRightsApproved'],'water-allocations':['availableM3Day','allocatedM3Day','remainingM3Day']};
 let sourceCatalogue=null,sourceSelected=null,sourceSection=null,sourceRequest=0;
 const verifiedMetrics = new Set();
 let drawerReturnFocus = null;
 let drawerReturnSelector = null;
 const metricButtonStyle =
   'background:none;border:0;padding:0;color:inherit;font:inherit;text-align:inherit;cursor:pointer';
 function metricSources(key) {
   const index = c().facilities.findIndex((site) => site.id === f().id),
     site = `/facilities/${index}/record/`,
     pointer = {
       population: '/profile/population',
       treasury: '/profile/treasuryCentralBankBalanceGcu',
       reserves: '/profile/bankReservesGcu',
       deposits: '/profile/bankDepositsGcu',
       equity: '/profile/bankEquityGcu',
       grain: '/profile/foodAvailableStockTonnes',
       demand: '/profile/foodDemandTonnesDay',
       labour: '/profile/labourForce',
       unemployed: '/profile/scenarioUnemployed',
       maintenance: site + 'maintenanceGcuDay',
       power: site + 'requiredPowerMW',
       workers: site + 'requiredWorkers',
       build: site + 'constructionSimDays',
     }[key];
   return key === 'sites' || key === 'resources'
     ? EconWorldRead.collectionSource(
         c(),
         key === 'sites' ? 'facilities' : 'resources',
       )
     : pointer
       ? EconWorldRead.fieldSource(c(), pointer)
       : null;
 }
 function metricIdentity(key, source) {
   return [
     c().id,
     key,
     source?.sourceSha256,
     source?.rowId || source?.rule,
     source?.exact,
   ].join('|');
 }
 function metricState(key) {
   const source = metricSources(key);
   return !source
     ? 'NOT_CONNECTED'
     : verifiedMetrics.has(metricIdentity(key, source))
       ? 'VERIFIED_SOURCE'
       : 'STATIC_BASELINE';
 }
 function displayExact(value, compactValue = false) {
   const D = window.Season1?.D;
   if (!D) return value;
   let decimal = new D(value),
     suffix = '';
   if (compactValue && decimal.abs().gte('1000000')) {
     decimal = decimal.div('1000000');
     suffix = 'M';
   }
   const parts = decimal
     .toFixed(2)
     .replace(/\.00$/, '')
     .replace(/(\.\d)0$/, '$1')
     .split('.');
   parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
   return parts.join('.') + suffix;
 }
 function hudValue(key, value, compactValue = false) {
   const source = metricSources(key);
   return source
     ? displayExact(source.exact, compactValue)
     : compactValue
       ? compact(value)
       : n(value);
 }
 function metricButton(key, label, value, unit) {
   const state = metricState(key);
   const caption = { STATIC_BASELINE: 'Static reference', VERIFIED_SOURCE: 'Source matched', NOT_CONNECTED: 'Source unavailable' }[state];
   return `<button type="button" data-cmd="country-metric" data-metric="${key}" ${metricAttributes(key)} style="${metricButtonStyle};width:100%;min-height:44px" aria-label="${esc(label)}: ${esc(value)} ${esc(unit)}. ${caption}. Inspect source"><small>${esc(label)} ↗</small><strong>${esc(value)} <em>${esc(unit)}</em></strong><span data-metric-state="${key}" style="display:block;font-size:10px;letter-spacing:.3px;margin-top:4px">${caption}</span></button>`;
 }
 function metricAttributes(key) {
   const source = metricSources(key);
   return Object.entries({
     'data-source-state': metricState(key),
     'data-source-dataset': source?.dataset,
     'data-source-field': source?.field,
     'data-source-pointer': source?.sourcePointer || source?.rule,
     'data-output-pointer': source?.outputPointer,
     'data-source-exact': source?.exact,
     'data-source-unit': source?.unit,
     'data-source-nature': source?.nature,
     'data-source-row-id': source?.rowId,
   }).filter(([, value]) => value !== undefined).map(([name, value]) => `${name}="${esc(value)}"`).join(' ');
 }
 function metricUnit(key, fallback) {
   // Only abbreviate the explicitly labelled scenario accounting unit, never time basis.
   return metricSources(key)?.unit.replace('GCU_SCENARIO_ACCOUNTING_UNIT', 'scenario GCU') || fallback;
 }
 function sourceStats() {
   const p = c().profile,
     r = f().record;
   switch (role) {
     case 'captain':
       return [
         [
           'population',
           'Population',
           hudValue('population', p.population),
           'people',
         ],
         [
           'sites',
           'Local sites',
           hudValue('sites', c().facilities.length),
           'sites',
         ],
         [
           'resources',
           'Resources',
           hudValue('resources', c().resources.length),
           'sites',
         ],
       ];
     case 'finance':
       return [
         [
           'treasury',
           'Treasury/CB account',
           hudValue('treasury', p.treasuryCentralBankBalanceGcu, true),
           'scenario GCU',
         ],
         [
           'maintenance',
           'Proposed site maintenance',
           hudValue('maintenance', r.maintenanceGcuDay),
           metricUnit('maintenance', 'scenario GCU/day'),
         ],
         [
           'sites',
           'Local sites',
           hudValue('sites', c().facilities.length),
           'sites',
         ],
       ];
     case 'central_bank':
       return [
         [
           'reserves',
           'Bank reserves',
           hudValue('reserves', p.bankReservesGcu, true),
           'scenario GCU',
         ],
         [
           'deposits',
           'Bank deposits',
           hudValue('deposits', p.bankDepositsGcu, true),
           'scenario GCU',
         ],
         [
           'equity',
           'Bank equity',
           hudValue('equity', p.bankEquityGcu, true),
           'scenario GCU',
         ],
       ];
     case 'industry':
       return [
         [
           'power',
           'Proposed site power',
           hudValue('power', r.requiredPowerMW),
           'MW',
         ],
         [
           'workers',
           'Site labour need',
           hudValue('workers', r.requiredWorkers),
           'people',
         ],
         [
           'build',
           'Proposed build duration',
           hudValue('build', r.constructionSimDays),
           metricUnit('build', 'days'),
         ],
       ];
     case 'trade':
       return [
         [
           'grain',
           'Opening grain stock',
           hudValue('grain', p.foodAvailableStockTonnes, true),
           'tonne',
         ],
         [
           'demand',
           'Demand reference',
           hudValue('demand', p.foodDemandTonnesDay),
           metricUnit('demand', 'tonne/day'),
         ],
         [
           'resources',
           'Resource sites',
           hudValue('resources', c().resources.length),
           'sites',
         ],
       ];
     case 'social':
       return [
         [
           'labour',
           'Labour force',
           hudValue('labour', p.labourForce, true),
           'people',
         ],
         [
           'unemployed',
           'Candidate unemployed',
           hudValue('unemployed', p.scenarioUnemployed, true),
           'people',
         ],
         [
           'workers',
           'Site labour need',
           hudValue('workers', r.requiredWorkers),
           'people',
         ],
       ];
   }
 }
 function planKeys() {
   return {
     captain: ['sites'],
     finance: ['maintenance', 'treasury'],
     central_bank: ['reserves'],
     industry: ['power', 'workers'],
     trade: ['grain', 'demand'],
     social: ['workers', 'labour', 'unemployed'],
   }[role];
 }
 function refreshMetricLinks() {
   const root = document.querySelector('.country-game');
   if (!root) return;
   root.querySelector('.national-resources').innerHTML = sourceStats()
     .map(
       ([key, label, value, unit]) =>
         `<div>${metricButton(key, label, value, unit)}</div>`,
     )
     .join('');
 }
 function mountMetricLinks(root) {
   refreshMetricLinks();
   root.querySelector('.national-reading').innerHTML =
     `<button type="button" data-cmd="country-metric" data-metric="plan" data-source-state="LOCAL_REHEARSAL" style="${metricButtonStyle};width:100%;min-height:44px" aria-label="Inspect local preview formula and source inputs"><strong data-national-value></strong><small data-national-remaining></small></button><button type="button" data-cmd="country-metric" data-metric="plan" id="national-input-source" style="${metricButtonStyle};font-size:10px;min-height:44px"><span data-national-setting></span> · Local preview ↗</button>`;
   root
     .querySelector('[data-national-amount]')
     .setAttribute('aria-describedby', 'national-input-source');
 }
 function previewNumbers() {
   const d = derived(),
     D = window.Season1?.D,
     keys = planKeys(),
     sources = Object.fromEntries(keys.map((key) => [key, metricSources(key)]));
   if (!D || keys.some((key) => !sources[key]))
     return { value: n(d.value), remaining: n(d.remaining) };
   const a = new D(String(plan.amount)),
     percent = a.div('100');
   let value, remaining;
   switch (role) {
     case 'captain':
       value = a;
       remaining = new D('3').minus(a);
       break;
     case 'finance':
       value = new D(sources.maintenance.exact).times(a);
       remaining = new D(sources.treasury.exact).minus(value);
       break;
     case 'central_bank':
       value = new D(sources.reserves.exact).times(percent);
       remaining = new D(sources.reserves.exact).minus(value);
       break;
     case 'industry':
       value = new D(sources.power.exact).times(percent);
       remaining = new D(sources.power.exact).minus(value);
       break;
     case 'trade':
       value = new D(sources.grain.exact).times(percent);
       if (new D(sources.demand.exact).isZero())
         return {
           value: displayExact(value.toFixed()),
           remaining: 'Unavailable',
         };
       remaining = new D(sources.grain.exact)
         .minus(value)
         .div(sources.demand.exact);
       break;
     case 'social':
       value = new D(sources.workers.exact)
         .times(percent)
         .toDecimalPlaces(0, D.ROUND_HALF_UP);
       remaining = new D(sources.workers.exact).minus(value);
       break;
   }
   return {
     value: displayExact(value.toFixed()),
     remaining: displayExact(remaining.toFixed()),
   };
 }
 function metricEntry(key) {
   const source = metricSources(key),
     label = sourceStats().find((item) => item[0] === key)?.[1] || key;
   if (!source)
     return `<article class="national-record" data-source-state="NOT_CONNECTED"><small>${esc(label)} · NOT_CONNECTED</small><p class="national-drawer-note">Published field provenance unavailable.</p></article>`;
   const count = source.countExact !== undefined;
   return `<article class="national-record" ${metricAttributes(key)}><small>${esc(label)} · ${metricState(key)}</small><strong style="overflow-wrap:anywhere">${esc(source.exact)} <em style="font-size:11px;font-style:normal">${esc(source.unit)}</em></strong><span>${esc(source.dataset)} · ${esc(source.field)} · ${esc(source.nature)}</span><p class="national-drawer-note">${count ? 'Country-filtered source count · does not imply operating assets.' : 'Selected opening reference · proposals remain unexecuted.'}</p><details><summary>Source record & units</summary><p class="national-drawer-note">${esc(source.sourcePath)} · ${esc(source.rowId || source.rule)}</p>${count ? `<p class="national-drawer-note">${esc(source.rule)}<br>${esc(source.sourceRowIds.join(', '))}</p>` : `<p class="national-drawer-note">${esc(source.sourcePointer)}<br>Raw token: ${esc(source.rawToken)}<br>Unit basis: ${esc(source.unitBasis)}</p>`}<p class="national-drawer-note" style="overflow-wrap:anywhere">SHA-256: ${esc(source.sourceSha256)}</p></details></article>`;
 }
 function showMetric(key, message = '') {
   const planning = key === 'plan',
     keys = planning ? planKeys() : [key],
     formula = {
       captain:
         'Local priority 0–3. Remaining = 3 − priority. Site count is context, not political capital.',
       finance:
         'Local cover = proposed daily maintenance × local days. Remaining = combined Treasury/CB reference − cover.',
       central_bank:
         'Local buffer = bank reserve reference × local percentage. Remaining = reference − buffer.',
       industry:
         'Local covered power = site power requirement × local percentage. Other site inputs remain separate.',
       trade:
         'Local shipment = opening grain stock × local percentage. Remaining cover = remaining stock ÷ demand reference.',
       social:
         'Local worker coverage = site worker requirement × local percentage, rounded to whole people. This is not a verified job vacancy.',
     }[role];
   const connectionState = sourceSession.configurationState?.() || 'NOT_CONNECTED';
   const connected = connectionState === 'CONFIGURED_READ_ONLY';
   const disabledReason = !connected ? (connectionState === 'INVALID' ? 'API_CONFIG_INVALID' : 'API_NOT_CONFIGURED') : keys.some(item => !metricSources(item)) ? 'PROVENANCE_MISSING' : '';
   drawer(
     planning ? 'Planning inputs' : 'Metric source',
     sourceNote +
       `<p role="status" class="national-drawer-note">${connected ? 'Read-only source verification available' : connectionState + ' · Published provenance only'}${message ? ' · ' + esc(message) : ''}</p>${planning ? `<p class="national-drawer-note">${plan.amount} ${esc(office.unit || 'priority')} · LOCAL_REHEARSAL<br>${esc(formula)}<br>Local planning only. Allocation Confirm is disabled.</p>` : ''}${keys.map(metricEntry).join('')}<div class="national-site-list"><button type="button" data-cmd="country-metric-verify" data-metric="${key}" data-disabled-reason="${disabledReason}" ${disabledReason ? 'disabled' : ''}><h3>Verify source fields →</h3></button><button type="button" data-cmd="country-source"><h3>All source dossiers →</h3></button></div>`,
   );
 }
 function matchesMetricRow(row, key) {
   if (!row || typeof row !== 'object') return false;
   if (['maintenance', 'power', 'workers', 'build'].includes(key))
     return row.id === f().id && row.countryId === c().id;
   if (['grain', 'demand'].includes(key))
     return row.countryId === c().id && row.commodityId === 'GRAIN';
   return row.countryId === c().id || row.id === c().id;
 }
 function verifiedMetric(result, key, rows) {
   const source = metricSources(key);
   if (
     !source ||
     result.kind !== 'PAGE' ||
     result.sourceMetadata?.sourceSha256 !== source.sourceSha256 ||
     result.sourceMetadata.dataset !== source.dataset ||
     result.filteredCountryId !== c().id
   )
     return false;
   if (source.countExact !== undefined) {
     const expected = new Set(source.sourceRowIds);
     return String(result.total) === source.countExact && result.nextOffset === null &&
       String(rows.length) === source.countExact && new Set(rows.map(row => row.id)).size === rows.length &&
       rows.every(row => row.countryId === c().id && expected.has(row.id));
   }
   return result.items.some(
     (row) =>
       matchesMetricRow(row, key) &&
       (row[source.field] === source.exact ||
         row[source.field] === source.rawToken),
   );
 }
 async function verifyMetric(key) {
   if (sourceSession.configurationState?.() !== 'CONFIGURED_READ_ONLY')
     return showMetric(key);
   const keys = key === 'plan' ? planKeys() : [key];
   verifiedMetrics.clear();
   refreshMetricLinks();
   showMetric(key, 'Reading selected source…');
   const request = sourceRequest,
     catalogueResult = await sourceSession.loadCatalogue();
   if (request !== sourceRequest) return;
   if (catalogueResult.kind !== 'CATALOGUE') {
     showMetric(key, 'Source unavailable · no value replaced');
     return;
   }
   sourceCatalogue = catalogueResult.datasets;
   let success = true;
   const matchedIdentities = [];
   for (const metric of keys) {
     const source = metricSources(metric);
     if (!source) {
       success = false;
       break;
     }
     const rows = [];
     let offset = 0,
       matched = false;
     for (let page = 0; page < 10; page++) {
       const result = await sourceSession.loadDataset(source.dataset, {
         offset,
         limit: 50,
       });
       if (request !== sourceRequest) return;
       if (result.kind === 'PAGE') rows.push(...result.items);
       if (verifiedMetric(result, metric, rows)) {
         matchedIdentities.push(metricIdentity(metric, source));
         matched = true;
         break;
       }
       if (result.kind !== 'PAGE' || result.nextOffset === null) break;
       offset = result.nextOffset;
     }
     if (!matched) {
       success = false;
       break;
     }
   }
   if (success) matchedIdentities.forEach(identity => verifiedMetrics.add(identity));
   refreshMetricLinks();
   showMetric(
     key,
     success
       ? 'Source fields match · not live World'
       : 'Source check failed · no value replaced',
   );
 }
 function storePlan(){localStorage.setItem(planKey,JSON.stringify(plan));}
 function derived(){const a=plan.amount,record=f().record,p=c().profile;switch(role){case'captain':return {value:a,unit:'priority',remaining:3-a,other:'levels remaining',lesson:'A higher priority changes the agenda; another minister still controls execution.'};case'finance':return {value:record.maintenanceGcuDay*a,unit:'GCU',remaining:p.treasuryCentralBankBalanceGcu-record.maintenanceGcuDay*a,other:'GCU in combined opening account after this hypothetical cover',lesson:'Operating cover = proposed daily maintenance × days. The source has a combined Treasury/central-bank balance, not independently spendable Treasury cash.'};case'central_bank':return {value:p.bankReservesGcu*a/100,unit:'GCU',remaining:p.bankReservesGcu*(1-a/100),other:'GCU outside the buffer',lesson:'A reserve allocation changes a plan; it does not create bank capital or a loan.'};case'industry':return {value:record.requiredPowerMW*a/100,unit:'MW',remaining:record.requiredPowerMW*(1-a/100),other:'MW still required',lesson:'Power is a flow, not stored inventory. Water, workers and inputs remain separate constraints.'};case'trade':return {value:p.foodAvailableStockTonnes*a/100,unit:'tonne',remaining:p.foodAvailableStockTonnes*(1-a/100)/p.foodDemandTonnesDay,other:'days of food cover remaining',lesson:'A shipment reduces available stock only when executed. An order is not an arrival.'};case'social':return {value:Math.round(record.requiredWorkers*a/100),unit:'people',remaining:record.requiredWorkers-Math.round(record.requiredWorkers*a/100),other:'positions still to cover',lesson:'Required workers are a facility estimate, not a verified hiring vacancy.'};}}
 function stats(){const p=c().profile,r=f().record;switch(role){case'captain':return [['Population',n(p.population),'people'],['Local sites',c().facilities.length,''],['Resources',c().resources.length,'']];case'finance':return [['Treasury/CB account',compact(p.treasuryCentralBankBalanceGcu),'GCU'],['Proposed site maintenance',n(r.maintenanceGcuDay),'GCU/day'],['Local sites',c().facilities.length,'']];case'central_bank':return [['Bank reserves',compact(p.bankReservesGcu),'GCU'],['Bank deposits',compact(p.bankDepositsGcu),'GCU'],['Bank equity',compact(p.bankEquityGcu),'GCU']];case'industry':return [['Proposed site power',n(r.requiredPowerMW),'MW'],['Site labour need',n(r.requiredWorkers),'people'],['Proposed build duration',n(r.constructionSimDays),'days']];case'trade':return [['Opening grain stock',compact(p.foodAvailableStockTonnes),'tonne'],['Demand reference',n(p.foodDemandTonnesDay),'tonne/day'],['Resource sites',c().resources.length,'']];case'social':return [['Labour force',compact(p.labourForce),'people'],['Candidate unemployed',compact(p.scenarioUnemployed),'people'],['Site labour need',n(r.requiredWorkers),'people']];}}
 function mapHome(){if(!contextCountry||!catalog)return;sourceRequest++;sourceSession.cancel();view='country-home';document.body.classList.remove('in-scene');document.body.classList.add('country-bound','country-map-home');document.querySelector('#overlay').innerHTML='';document.querySelector('.result-receipt')?.remove();document.querySelector('#world-clock')?.setAttribute('hidden','');pathTo('country',true);document.title=c().name+' · '+roles[role].name+' · EconMind';const previous=document.querySelector('.country-game'),scroll=previous?.scrollTop||0;
 document.querySelector('#game').innerHTML=`<main class="country-game" data-country="${countryScope}" data-office="${role}" style="--national-art:url('countries/${c().scene}')"><div class="national-world" role="img" aria-label="${esc(c().name)}"></div><div class="national-light"></div><header class="national-hud"><div class="national-identity"><span class="brand-badge-mini"><img class="brand-badge-mini-image" src="assets/lobby/econmind-badge-96.png" alt="EconMind"></span><div><small>${esc(c().name)} / SEASON 1</small><strong>${roles[role].name}</strong></div></div><a class="national-atlas" href="countries/?role=${role}&country=${countryScope}&view=atlas">Country atlas ↗</a><div class="national-time"><small>World preview · Real time ×10</small><strong data-national-time></strong><span>1 day = 2h 24m real time</span></div><div class="national-resources">${stats().map(([label,value,unit])=>`<div><small>${label}</small><strong>${value} <em>${unit}</em></strong></div>`).join('')}</div></header><section class="national-mission"><small>CHAPTER I / ${roles[role].tag}</small><h1>${office.heading}</h1><p>${office.lead}</p><div class="national-progress"><i data-national-progress></i></div><span>${c().name} · <span data-selected-site>${office.national||f().record.name}</span></span></section><nav class="national-tools"><button data-cmd="country-functions" title="All office actions" aria-label="All office actions">▤</button><button data-cmd="country-records" title="Decision record" aria-label="Decision record">◷</button><button data-cmd="country-sites" title="Local sites" aria-label="Local sites">⌖</button></nav><section class="national-play" ${office.national?'data-national-drop':''}><div class="national-play-heading"><small>${office.label}</small>${office.national?'<small>National</small>':`<button data-cmd="country-sites">${f().id} ▾</button>`}</div><h2>${office.national||f().record.name}</h2><div class="national-tokens">${Array.from({length:office.max/office.step},(_,i)=>`<button data-cmd="country-token" data-value="${(i+1)*office.step}" draggable="true" aria-label="${office.label} ${(i+1)*office.step} ${office.unit}" class="${(i+1)*office.step<=plan.amount?'allocated':''}"><span>${office.step}${role==='finance'?'d':role==='captain'?'':'%'}</span></button>`).join('')}</div><div class="national-slider"><button data-cmd="country-adjust" data-delta="-1" aria-label="Decrease allocation">−</button><input data-national-amount type="range" min="0" max="${office.max}" step="${office.step}" value="${plan.amount}" aria-label="${office.label}"><button data-cmd="country-adjust" data-delta="1" aria-label="Increase allocation">+</button></div><div class="national-reading"><strong data-national-value></strong><small data-national-remaining></small></div><p class="national-lesson">${derived().lesson}</p><button class="national-confirm" data-cmd="country-confirm">Confirm allocation <span>→</span></button><small class="national-save-status" data-national-status>${plan.records.length?'Local decision saved':'Local planning · Not executed'}</small></section><div class="national-site-pins">${c().facilities.map(site=>`<button data-cmd="country-site" data-id="${site.id}" title="${esc(site.record.name)}" aria-label="${site.id} ${esc(site.record.name)}" class="${site.id===f().id?'selected':''}">${site.id.slice(-2)}</button>`).join('')}</div><div class="national-destination" ${office.national?'':'data-national-drop'}><span>${f().id}</span><strong>${f().record.name}</strong><small>Local site · ${f().record.operational?'Operational':'Not commissioned'}</small></div><nav class="national-buildings" aria-label="Ministry locations">${office.rooms.map(([name,desc,module,icon],i)=>`<button data-cmd="country-room" data-id="${i}" data-module="${module}" class="national-building"><span>${icon}</span><strong>${name}</strong></button>`).join('')}</nav><footer class="national-bottom"><div class="national-hand">${office.rooms.map(([name,desc,module,icon],i)=>`<button class="national-card" data-cmd="country-room" data-id="${i}" data-module="${module}"><small>0${i+1}</small><span>${icon}</span><h3>${name}</h3><p>${desc}</p></button>`).join('')}</div><button class="national-world-status" data-cmd="country-records"><span>◷</span><strong>World running</strong><small>Automatic ×10</small></button></footer><div class="national-edition">Country scenario references · Local decisions · Official settlement not connected</div><div class="national-drawer" hidden></div></main>`;
 const root=document.querySelector('.country-game');
 mountCountryRoleSwitch(root);
 mountMetricLinks(root);
 if(!document.querySelector('#country-home-layout')){const layoutLink=document.createElement('link');layoutLink.id='country-home-layout';layoutLink.rel='stylesheet';layoutLink.href='../country-home-layout.css';document.head.append(layoutLink);}
 const sourceButton=document.createElement('button');sourceButton.type='button';sourceButton.dataset.cmd='country-source';sourceButton.title='Official source intel';sourceButton.setAttribute('aria-label','Official source intel');sourceButton.textContent='◈';root.querySelector('.national-tools').append(sourceButton);
 root.querySelector('.national-world-status strong').textContent='World not started';
 root.querySelector('.national-world-status small').textContent='Opening data only';
 root.querySelector('.national-time small').textContent='Official opening dataset';
 root.querySelector('.national-time span').textContent='No live World clock';
 root.querySelector('.national-destination small').textContent=f().record.operational?'Marked operational in opening source · not live':'Opening proposal · not commissioned';
 const sourceLabel=contextCountrySource?.kind==='API_COUNTRY_VERIFIED'?'API-verified country record · bundled sites and resources':contextCountrySource?.kind==='STATIC_DISCONNECTED'?'API unavailable or mismatched · bundled opening baseline':'Bundled official opening baseline';
 root.dataset.dataSource=contextCountrySource?.kind||'MISSING';
 root.querySelector('.national-edition').textContent=sourceLabel+' · Proposed sites are not operating · Local decisions only · No live World projection';
 root.scrollTop=scroll;updatePlan();updateTime();positionSites();observeSize();
 }

 let sizeObserver;
 function observeSize(){sizeObserver?.disconnect();sizeObserver=new ResizeObserver(positionSites);sizeObserver.observe(document.querySelector('.country-game'));}
 function positionSites(){const root=document.querySelector('.country-game');if(!root)return;const w=root.clientWidth,h=root.clientHeight,scale=Math.min(w,h);for(const site of c().facilities){const anchor=site.anchor;if(!anchor)continue;const x=w/2+(anchor[0]-.5)*scale,y=h/2+(anchor[1]-.5)*scale,pin=root.querySelector('.national-site-pins [data-id="'+site.id+'"]');if(pin){pin.style.left=x+'px';pin.style.top=y+'px';pin.hidden=x<12||x>w-12||y<200||y>h-210;}if(site.id===f().id){const label=root.querySelector('.national-destination');label.style.left=x+'px';label.style.top=y+'px';label.hidden=x<100||x>w-100||y<240||y>h-320;}}}
 function updatePlan(){if(view!=='country-home')return;const d=derived(),root=document.querySelector('.country-game');if(!root)return;const preview=previewNumbers();root.querySelector('[data-national-value]').textContent=preview.value+' '+(['finance','central_bank'].includes(role)?'scenario GCU':d.unit);root.querySelector('[data-national-remaining]').textContent=preview.remaining+' '+d.other;root.querySelector('[data-national-setting]').textContent=plan.amount+' '+(office.unit||'priority');root.querySelector('[data-national-progress]').style.width=plan.amount/office.max*100+'%';root.querySelector('[data-national-amount]').value=plan.amount;root.querySelectorAll('[data-cmd=country-token]').forEach(b=>b.classList.toggle('allocated',Number(b.dataset.value)<=plan.amount));root.querySelector('.national-confirm').disabled=true;root.querySelector('.national-confirm').textContent='Confirm unavailable · local planning only';storePlan();window.EconI18n?.refresh();}
 function updateTime(){const el=document.querySelector('[data-national-time]');if(el)el.textContent='Not started';}
 function drawer(title,body){
  const el=document.querySelector('.national-drawer');if(!el)return;
  sourceRequest++;sourceSession.cancel();
  if(document.activeElement&&!el.contains?.(document.activeElement)){
   drawerReturnFocus=document.activeElement;
   const metric=document.activeElement.dataset?.metric;
   drawerReturnSelector=metric&&/^[a-z]+$/.test(metric)?`[data-cmd="country-metric"][data-metric="${metric}"]`:null;
  }
  el.setAttribute?.('role','dialog');el.setAttribute?.('aria-label',title);
  el.style.position='';el.style.top='';el.style.bottom='';el.style.maxHeight='';
  // Keep source inspection reachable from a scrolled country page without moving its map/layout.
  if(body.startsWith(sourceNote)){
   el.style.position='fixed';el.style.top='min(164px,20dvh)';el.style.bottom='20px';
   el.style.maxHeight='calc(100dvh - min(164px,20dvh) - 20px)';
  }
  el.hidden=false;
  el.innerHTML=`<div class="national-drawer-head"><h2>${title}</h2><button data-cmd="country-dismiss" aria-label="Close">×</button></div>${body}`;
  el.querySelector('button')?.focus();window.EconI18n?.refresh();
 }
 const sourceNote='<p class="national-drawer-note">Selected source · Not live World · Read only</p>';
 function sourceError(result){verifiedMetrics.clear();refreshMetricLinks();const message=result.kind==='NOT_CONNECTED'?'Source not connected':result.kind==='INVALID'?'Source check failed':'Source unavailable';drawer('Source intel',sourceNote+`<p role="status" class="national-drawer-note">${message}. No value substituted.</p><div class="national-site-list"><button data-cmd="country-source"><h3>Retry read →</h3></button></div>`);const el=document.querySelector('.national-drawer');if(el){el.style.bottom='auto';el.style.maxHeight='min(380px,calc(100dvh - 190px))';}}
 function sourceList(){if(!sourceCatalogue)return;const priority=sourceOffice[role]||[],ordered=[...sourceCatalogue].sort((a,b)=>(priority.includes(b.dataset)?1:0)-(priority.includes(a.dataset)?1:0)||priority.indexOf(a.dataset)-priority.indexOf(b.dataset)||a.dataset.localeCompare(b.dataset));drawer('Source intel',sourceNote+`<p class="national-drawer-note">${esc(c().name)} · ${sourceCatalogue.length} source dossiers</p><div class="national-site-list">${ordered.map(item=>`<button data-cmd="country-source-dataset" data-slug="${esc(item.dataset)}"><small>${priority.includes(item.dataset)?'YOUR OFFICE':'FULL ARCHIVE'} · ${esc(item.sourceKind)}</small><h3>${esc(item.dataset.replaceAll('-',' '))}</h3><span>${item.associations.countryFields.length||['changes','seasonal-water'].includes(item.dataset)?'Filtered to this country':'Global source'}</span></button>`).join('')}</div>`);}
 function sourceRecord(row,index){const data=JSON.stringify(row,null,2),label=row?.id||row?.name||row?.countryId||`Record ${index+1}`;const glance=sourceGlance[sourceSelected]||[];const highlights=glance.filter(key=>row?.[key]!==undefined&&row?.[key]!==null&&typeof row[key]!=='object').map(key=>`${esc(key)}: ${esc(String(row[key]))}`).join(' · ');return `<article class="national-record"><small>${esc(String(label))}</small>${highlights?`<p class="national-drawer-note">${highlights}</p>`:''}<details><summary>Inspect all source fields</summary><pre class="national-source-json" style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(data)}</pre></details></article>`;}
 function sourcePage(result){if(result.kind==='STALE')return;if(!['PAGE','DATA','SECTIONS','FRAGMENT'].includes(result.kind)){sourceError(result);return;}const label=esc(sourceSelected.replaceAll('-',' '));let body=sourceNote+`<div class="national-site-list"><button data-cmd="country-source-back"><h3>← All dossiers</h3></button></div><p class="national-drawer-note">${label} · Source units · Proposals unexecuted</p>`;
  if(result.kind==='PAGE'){body+=`<p class="national-drawer-note">${result.filteredCountryId?'This country':'Global source'} · ${result.total} records</p>${result.items.length?result.items.map(sourceRecord).join(''):'<p class="national-drawer-note">No source row for this country.</p>'}`;if(result.nextOffset!==null)body+=`<button data-cmd="country-source-more" data-offset="${result.nextOffset}">Next source records →</button>`;}
  if(result.kind==='DATA')body+=sourceRecord(result.data,0);
  if(result.kind==='SECTIONS')body+=`<div class="national-site-list">${result.sections.map(section=>`<button data-cmd="country-source-section" data-section="${esc(section)}"><h3>${esc(section)}</h3></button>`).join('')}</div>`;
  if(result.kind==='FRAGMENT'){body+=`<pre class="national-source-json" style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(result.fragment)}</pre>`;if(result.nextOffset!==null)body+=`<button data-cmd="country-source-more" data-offset="${result.nextOffset}">Next map fragment →</button>`;}
  drawer('Source intel',body);
 }
 async function openSource(){verifiedMetrics.clear();refreshMetricLinks();drawer('Source intel',sourceNote+'<p role="status" class="national-drawer-note">Reading source catalogue…</p>');const request=sourceRequest,result=await sourceSession.loadCatalogue();if(request!==sourceRequest||!document.querySelector('.national-drawer')||document.querySelector('.national-drawer').hidden)return;if(result.kind==='CATALOGUE'){sourceCatalogue=result.datasets;sourceList();}else sourceError(result);}
 async function openSourceDataset(slug,offset=0,section=null){if(!sourceCatalogue?.some(item=>item.dataset===slug))return;sourceSelected=slug;sourceSection=section;drawer('Source intel',sourceNote+`<p role="status" class="national-drawer-note">Reading ${esc(slug)}…</p>`);const request=sourceRequest,result=await sourceSession.loadDataset(slug,{offset,section});if(request!==sourceRequest||!document.querySelector('.national-drawer')||document.querySelector('.national-drawer').hidden)return;sourcePage(result);}
 commands['country-metric']=b=>showMetric(b.dataset.metric);
 commands['country-metric-verify']=b=>verifyMetric(b.dataset.metric);
 commands['country-source']=openSource;
 commands['country-source-dataset']=b=>openSourceDataset(b.dataset.slug);
 commands['country-source-section']=b=>openSourceDataset(sourceSelected,0,b.dataset.section);
 commands['country-source-more']=b=>openSourceDataset(sourceSelected,Number(b.dataset.offset),sourceSection);
 commands['country-source-back']=()=>{sourceRequest++;sourceSession.cancel();sourceList();};
 commands['country-dismiss']=()=>{sourceRequest++;sourceSession.cancel();document.querySelector('.national-drawer').hidden=true;const trigger=drawerReturnFocus?.isConnected?drawerReturnFocus:drawerReturnSelector?document.querySelector(drawerReturnSelector):null;trigger?.focus();};
 commands['country-sites']=()=>drawer('Local sites',`<div class="national-site-list">${c().facilities.map(site=>`<button data-cmd="country-site" data-id="${site.id}"><small>${site.id}</small><h3>${site.record.name}</h3><p>${n(site.record.requiredWorkers)} people · ${n(site.record.requiredPowerMW)} MW</p><span>${site.record.operational?'Marked operational in opening source':'Proposal · not commissioned'}</span></button>`).join('')}</div>`);
 commands['country-site']=b=>{plan.site=b.dataset.id;if(!office.national)plan.amount=0;storePlan();mapHome();if(office.national)drawer(f().record.name,`<p class="national-drawer-note">${n(f().record.requiredWorkers)} people · ${n(f().record.requiredPowerMW)} MW</p><p class="national-drawer-note">${f().record.operational?'Marked operational in opening source':'Proposal · not commissioned'}</p>`);};
 commands['country-token']=b=>{const v=Number(b.dataset.value);plan.amount=plan.amount===v?Math.max(0,v-office.step):v;updatePlan();};
 commands['country-adjust']=b=>{plan.amount=Math.max(0,Math.min(office.max,plan.amount+Number(b.dataset.delta)*office.step));updatePlan();};
 // Planning remains local. Only the separate trusted runtime can submit a host-prepared Command.
 commands['country-confirm']=()=>toast('Local allocation cannot execute a World Command. Use the trusted runtime review when connected.');
 commands['country-records']=()=>drawer('Decision record',`<p class="national-drawer-note">Local decisions · Official settlement not connected</p>${plan.records.length?plan.records.map(x=>`<article class="national-record"><small>${esc(x.subject||x.site)} · ${new Date(x.id).toLocaleTimeString('en-GB')}</small><strong>${n(x.value)} ${x.unit}</strong><span>Local decision saved</span></article>`).join(''):'<p>No local decisions yet</p>'}`);
 commands['country-functions']=()=>drawer('All office actions',`<div class="national-site-list">${catalog.modules.filter(m=>m.role===roles[role].code).map(m=>`<button data-cmd="country-module" data-module="${m.id}"><h3>${esc(m.title==='VAT'?'增值税':m.title)}</h3><small>${m.fields.length} parameters ↗</small></button>`).join('')}</div>`);
 commands['country-room']=commands['country-module']=b=>{document.body.classList.remove('country-map-home');openModule(b.dataset.module);};
 commands['country-home']=commands.close=commands['journey-home']=mapHome;
 commands.close=()=>{const el=document.querySelector('.national-drawer');if(el&&!el.hidden)commands['country-dismiss']();else mapHome();};
 commands.codex=()=>{mapHome();commands['country-functions']();};
 document.addEventListener('input',e=>{if(!e.target.matches('[data-national-amount]'))return;plan.amount=Number(e.target.value);updatePlan();});
 document.addEventListener('dragstart',e=>{const token=e.target.closest('[data-cmd=country-token]');if(token)e.dataTransfer.setData('application/econmind-allocation',token.dataset.value);});
 document.addEventListener('dragover',e=>{if(e.target.closest('[data-national-drop]'))e.preventDefault();});
 document.addEventListener('drop',e=>{if(!e.target.closest('[data-national-drop]'))return;e.preventDefault();const value=Number(e.dataTransfer.getData('application/econmind-allocation'));if(Number.isFinite(value)&&value>0&&value<=office.max){plan.amount=value;updatePlan();}});
 window.addEventListener?.('pagehide',()=>{sourceRequest++;sourceSession.cancel();});
 const previousRender=render;render=function(){if(contextCountry&&(view===null||view==='country-home'))mapHome();else if(contextCountry)previousRender();};
 routeFromHash=function(hash=location.hash){mapHome();if(hash.startsWith('#action/')||hash.startsWith('#office/'))toast('Live World commands are not connected. Local planning cannot settle the world.');};
 const init=setInterval(()=>{if(!window.GameTest||!contextCountry)return;clearInterval(init);if(bootHash.startsWith('#action/')||bootHash.startsWith('#office/'))routeFromHash(bootHash);else mapHome();},40);
 setInterval(updateTime,250);window.CountryGame={home:mapHome,country:()=>c(),state:()=>structuredClone(plan),derived,rooms:office.rooms,clockScale:10};
})();

// A stable built module reuses the reviewed local controller, never prototype fixtures.
// Failure leaves the native allocation Confirm disabled; there is no fallback execution.
if (document.currentScript?.src) {
  const runtimeEntry = new URL('../country-runtime-entry.js', document.currentScript.src);
  const runtimeModule = document.createElement('script');
  runtimeModule.type = 'module';
  runtimeModule.src = runtimeEntry.href;
  runtimeModule.onerror = () => console.warn('Trusted runtime module unavailable · NOT_CONNECTED');
  document.head.append(runtimeModule);
}
