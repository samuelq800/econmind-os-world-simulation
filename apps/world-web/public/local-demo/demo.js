import { fitBounds } from './map-camera.js';

const offices = { captain: 'Country Captain', finance: 'Finance Minister', central_bank: 'Central Bank Governor', industry: 'Industry Minister', trade: 'Trade & Foreign Affairs Minister', social: 'Labour & Social Minister' };
const scenes = { captain: ['Cabinet agenda', 'Cabinet vote', 'Public commitment'], finance: ['Project funding', 'Bond issue', 'Treasury payments'], central_bank: ['Bank liquidity', 'Policy rate', 'Foreign exchange'], industry: ['Power dispatch', 'Production chain', 'Expansion project'], trade: ['Supplier & route', 'Quote & shipment', 'Arrival & inventory'], social: ['Skills training', 'Employment matching', 'Community clinic'] };
const $ = selector => document.querySelector(selector);
const ns = 'http://www.w3.org/2000/svg';
const params = new URLSearchParams(location.search);
let countryNumber = /^(0[1-9]|[1-6][0-9]|70)$/.test(params.get('country') || '') ? params.get('country') : '01';
let office = Object.hasOwn(offices, params.get('role')) ? params.get('role') : 'captain';
let countries, partition, country, page = 'home', frameReady = false, pending = null, selectionEpoch = 0;
const logKey = 'econmind-DEMO_LOCAL-log-v1';
let log;
try { log = JSON.parse(localStorage.getItem(logKey) || '[]'); } catch { log = []; }
if (!Array.isArray(log)) log = [];

function renderLog() {
  $('#log').replaceChildren(...log.slice().reverse().map(record => { const li = document.createElement('li'); li.textContent = `${record.time} · ${record.country}/${offices[record.office]} · ${record.action}${record.module ? ' · ' + record.module : ''}${record.demoDay ? ' · demo day ' + record.demoDay : ''}${record.amount !== undefined ? ' · ' + record.amount + ' demo units' : ''}${record.outcome ? ' · ' + record.outcome : ''}`; return li; }));
}
function appendLog(record) { log.push({ ...record, time: new Date().toLocaleTimeString('en-GB'), mode: 'DEMO_LOCAL' }); log = log.slice(-200); localStorage.setItem(logKey, JSON.stringify(log)); renderLog(); }
function send(action, values = {}) {
  if (!frameReady) { pending = { action, ...values }; return; }
  $('#office-frame').contentWindow.postMessage({ type: 'ECONMIND_DEMO_CONTROL', action, ...values }, location.origin);
}
function openFrame() {
  frameReady = false;
  $('#office-frame').src = `office/?country=${countryNumber}&role=${office}#country`;
}
function showPage(next) {
  page = next;
  for (const button of document.querySelectorAll('[data-page]')) button.setAttribute('aria-current', button.dataset.page === page ? 'page' : 'false');
  $('#map-panel').hidden = page !== 'map'; $('#scenario-panel').hidden = page !== 'scenario'; $('#log-panel').hidden = page !== 'log';
  $('#office-frame').hidden = ['map', 'log'].includes(page);
  if (page === 'home') send('home');
  if (page === 'actions') send('actions');
  renderLog();
}
function node(tag, attrs) { const element = document.createElementNS(ns, tag); for (const [key, value] of Object.entries(attrs || {})) element.setAttribute(key, String(value)); return element; }
function regional() {
  const frames = countries.filter(c => c.id === country.id || country.neighbours.includes(c.id)).map(c => partition.territories.find(t => t.id === c.id)).map(t => {
    // Bounds taken directly from the immutable pixel-space paths.
    const points = t.path.match(/-?\d+(?:\.\d+)?/g).map(Number), xs = points.filter((_, i) => i % 2 === 0), ys = points.filter((_, i) => i % 2 === 1);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  });
  const x = Math.min(...frames.map(f => f[0])), y = Math.min(...frames.map(f => f[1]));
  const bounds = [x, y, Math.max(...frames.map(f => f[2])) - x, Math.max(...frames.map(f => f[3])) - y];
  $('#atlas').setAttribute('viewBox', fitBounds(bounds, [partition.width, partition.height], 1.15).join(' '));
}
function drawMap() {
  const svg = $('#atlas'); svg.replaceChildren();
  svg.append(node('image', { href: 'map/terrain.png', width: partition.width, height: partition.height }));
  for (const territory of partition.territories) {
    const info = countries.find(c => c.id === territory.id);
    const shape = node('path', { d: territory.path, 'data-country': territory.number, 'data-selected': territory.id === country.id, class: territory.id === country.id ? 'selected' : country.neighbours.includes(territory.id) ? 'neighbour' : '', 'vector-effect': 'non-scaling-stroke', role: 'button', tabindex: 0, 'aria-label': `${territory.number} ${info.name}` });
    const title = node('title'); title.textContent = info.name; shape.append(title);
    const select = () => { $('#country').value = territory.number; selectCountry(territory.number); };
    shape.addEventListener('click', select); shape.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); } });
    svg.append(shape);
    const label = node('text', { x: territory.label[0], y: territory.label[1], 'text-anchor': 'middle' }); label.textContent = territory.number; svg.append(label);
  }
  svg.dataset.country = countryNumber; svg.dataset.loadedTerritories = partition.territories.length;
  $('#map-title').textContent = `${country.number} / ${country.name}`;
  $('#neighbours').replaceChildren(...country.neighbours.map(id => { const c = countries.find(item => item.id === id); const button = document.createElement('button'); button.textContent = `${c.number} ${c.name} ↗`; button.addEventListener('click', () => { $('#country').value = c.number; selectCountry(c.number); }); return button; }));
  regional();
}
async function selectCountry(number) {
  const epoch = ++selectionEpoch;
  countryNumber = number;
  $('#status').textContent = 'Loading local country data…';
  const response = await fetch(`office/countries/data/${number}.json`);
  if (!response.ok) throw Error('Local country data unavailable');
  const next = await response.json();
  if (epoch !== selectionEpoch) return;
  country = next; drawMap(); openFrame();
  history.replaceState(null, '', `?country=${countryNumber}&role=${office}`);
  $('#scenes').replaceChildren(...scenes[office].map((label, index) => { const button = document.createElement('button'); button.textContent = label + ' ↗'; button.addEventListener('click', () => send('scene', { index })); return button; }));
  if (page === 'actions') pending = { action: 'actions' };
  $('#status').textContent = `${country.name} · ${offices[office]} · DEMO_LOCAL. Static source facts and separate sample outcomes.`;
}
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== $('#office-frame').contentWindow || event.data?.type !== 'ECONMIND_DEMO') return;
  if (event.data.country !== countryNumber || event.data.office !== office) return;
  if (event.data.action === 'show-map') { showPage('map'); return; }
  if (event.data.action === 'select-office' && Object.hasOwn(offices, event.data.nextOffice)) {
    office = event.data.nextOffice; $('#office').value = office;
    selectCountry(countryNumber).catch(error => { $('#status').textContent = error.message; }); return;
  }
  if (event.data.action === 'ready') { frameReady = true; $('#status').textContent = `${country.name} · ${offices[office]} · ${event.data.moduleCount} existing forms · DEMO_LOCAL`; if (pending) { const next = pending; pending = null; send(next.action, next); } return; }
  appendLog(event.data);
});
document.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => showPage(button.dataset.page)));
$('#country').addEventListener('change', event => selectCountry(event.target.value).catch(error => { $('#status').textContent = error.message; }));
$('#office').addEventListener('change', event => { office = event.target.value; selectCountry(countryNumber).catch(error => { $('#status').textContent = error.message; }); });
$('#reset').addEventListener('click', () => send('reset'));
$('#advance').addEventListener('click', () => send('next'));
$('#regional').addEventListener('click', regional);
$('#world').addEventListener('click', () => $('#atlas').setAttribute('viewBox', `0 0 ${partition.width} ${partition.height}`));
function zoom(factor) { const [x, y, w, h] = $('#atlas').getAttribute('viewBox').split(' ').map(Number); $('#atlas').setAttribute('viewBox', fitBounds([x, y, w, h], [partition.width, partition.height], factor).join(' ')); }
$('#zoom-in').addEventListener('click', () => zoom(.8)); $('#zoom-out').addEventListener('click', () => zoom(1.25));
try {
  const responses = await Promise.all([fetch('office/countries/data/index.json'), fetch('map/partition.json')]);
  if (responses.some(r => !r.ok)) throw Error('Local map assets unavailable');
  [countries, partition] = await Promise.all(responses.map(r => r.json()));
  if (countries.length !== 70 || partition.territories.length !== 70) throw Error('Expected the existing 70-country map');
  for (const c of countries) { const option = document.createElement('option'); option.value = c.number; option.textContent = `${c.number} · ${c.name}`; $('#country').append(option); }
  for (const [key, name] of Object.entries(offices)) { const option = document.createElement('option'); option.value = key; option.textContent = name; $('#office').append(option); }
  $('#country').value = countryNumber; $('#office').value = office;
  await selectCountry(countryNumber); renderLog();
} catch (error) { $('#status').textContent = `${error.message}. No official data or API was substituted.`; }
