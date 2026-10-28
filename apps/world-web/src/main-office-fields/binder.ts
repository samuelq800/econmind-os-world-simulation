/** Non-authoritative main-page field consumer. The trusted host supplies its
 * existing read lifetime; the actual server/parser still verifies every read.
 * No URL, storage, environment, source seed, command or fallback data discovery. */
import type { OfficeProjectionBinding } from '../office-projection/controller.js';
import {
  createTrustedHostSession,
  type TrustedHostSession,
} from '../trusted-host/session.js';
import {
  createPostwarRuntimeClient,
  POSTWAR_RUNTIME_SCHEMA,
  type RuntimePage,
} from '../postwar-office-runtime/client.js';
import { canonicalId, validConfig } from '../production-read/contract.js';
import {
  MAIN_OFFICE_FIELD_MAPPING as mapping,
  type MainOfficeCapacityField,
} from './mapping.js';

type Values = Readonly<Record<MainOfficeCapacityField, string>>;
type Snapshot = Readonly<{
  values: Values;
  worldVersion: string;
  eventSequence: string;
}>;
function capacity(page: RuntimePage, countryId: string): Snapshot | null {
  if (
    page.status !== 'PAGE' ||
    page.dataset !== mapping.dataset ||
    page.source.dataNature !== mapping.dataNature ||
    page.page.offset !== 0 ||
    page.page.total !== 1 ||
    page.page.nextOffset !== null ||
    page.rows.length !== 1
  )
    return null;
  const row = page.rows[0]!;
  if (
    row.schemaVersion !== 'postwar-treasury-capacity-row-v1' ||
    row.countryId !== countryId ||
    !canonicalId(row.accountId) ||
    !canonicalId(row.claimId) ||
    typeof row.currency !== 'string' ||
    !/^[A-Z][A-Z0-9_]{1,15}$/u.test(row.currency) ||
    row.reservationNature !== 'CAPACITY_RESERVED_NOT_PAID_OR_ACCRUED' ||
    row.balanceNature !== 'RECIPROCAL_LEDGER_CLAIM_NOT_CASH_WALLET'
  )
    return null;
  const values: Partial<Record<MainOfficeCapacityField, string>> = {};
  for (const f of mapping.fields) {
    const value = row[f.field];
    if (
      typeof value !== 'string' ||
      value.length > 256 ||
      (f.kind === 'AMOUNT' &&
        (!/^(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/u.test(value) ||
          value.replace('.', '').length > 120))
    )
      return null;
    values[f.field] = value;
  }
  return Object.freeze({
    values: Object.freeze(values) as Values,
    worldVersion: page.authority.readback.worldVersion,
    eventSequence: page.authority.readback.eventSequence,
  });
}

export function installMainOfficeFields(document: Document, host: Window) {
  let lifetime: TrustedHostSession | null = null;
  let binding: OfficeProjectionBinding | null = null;
  let client: ReturnType<typeof createPostwarRuntimeClient> | null = null;
  let stopLifetime: (() => void) | null = null;
  let epoch = 0,
    busy = false,
    status = 'NOT_CONNECTED';
  let snapshot: Snapshot | null = null;
  let section: HTMLElement | null = null,
    sectionRoot: HTMLElement | null = null;
  const privateNodes = new Set<HTMLElement>();
  const ownedHuds = new Set<HTMLElement>();
  const hudSignatures = new WeakMap<HTMLElement, string>();
  const currentView = () => {
    const root = document.querySelector<HTMLElement>(mapping.rootSelector);
    return root?.dataset.country && root.dataset.office === mapping.role
      ? { role: mapping.role, countryDisplayId: root.dataset.country }
      : null;
  };
  const text = (el: HTMLElement, value: string) => {
    if (el.textContent !== value) el.textContent = value;
  };
  function clearPrivate() {
    for (const el of privateNodes) text(el, 'Unavailable');
    privateNodes.clear();
    for (const hud of ownedHuds) {
      hud.replaceChildren(
        element('small', 'Treasury ledger claim · not cash'),
        element('strong', 'Unavailable'),
        element('small', 'Current ledger value unavailable'),
      );
      hud.dataset.sourceState = 'UNAVAILABLE';
      hud.dataset.sourceNature = 'UNAVAILABLE';
      hudSignatures.delete(hud);
    }
    ownedHuds.clear();
  }
  function disconnect() {
    epoch++;
    busy = false;
    snapshot = null;
    binding = null;
    status = 'NOT_CONNECTED';
    const old = lifetime;
    lifetime = null;
    const stop = stopLifetime;
    stopLifetime = null;
    stop?.();
    client?.disconnect();
    client = null;
    old?.retire('MAIN_FIELDS_DISCONNECTED');
    clearPrivate();
    paint();
  }
  function element(tag: string, content: string) {
    const el = document.createElement(tag);
    el.textContent = content;
    return el;
  }
  function paintHud(root: HTMLElement) {
    const hud = root.querySelector<HTMLElement>(mapping.existingHudSelector);
    if (!hud) return;
    if (!snapshot && !hud.dataset.mainOfficeOwned) {
      // Untouched public baseline may remain, explicitly historical. Never
      // restore a previous private number as a disconnected fallback.
      if (!hud.querySelector('[data-main-office-opening-note]')) {
        const note = element('small', 'Opening public reference · not current');
        note.dataset.mainOfficeOpeningNote = '';
        hud.append(note);
      }
      return;
    }
    const amount = snapshot?.values.treasuryLedgerClaimBalance ?? 'Unavailable';
    const currency = snapshot?.values.currency ?? '';
    const caption = snapshot
      ? `Ledger claim · ${currency} · checked at World version ${snapshot.worldVersion} · not cash`
      : `${status} · No current ledger value`;
    const signature = [amount, currency, caption].join('|');
    if (hudSignatures.get(hud) === signature) return;
    hudSignatures.set(hud, signature);
    ownedHuds.add(hud);
    hud.dataset.mainOfficeOwned = 'FINANCE_TREASURY_CLAIM';
    hud.removeAttribute('data-cmd');
    for (const attribute of [
      'data-source-dataset',
      'data-source-field',
      'data-source-pointer',
      'data-output-pointer',
      'data-source-exact',
      'data-source-unit',
      'data-source-nature',
      'data-source-row-id',
    ])
      hud.removeAttribute(attribute);
    hud.dataset.sourceState = snapshot ? 'CURRENT_SERVER_READ' : 'UNAVAILABLE';
    hud.dataset.sourceNature = snapshot ? mapping.dataNature : 'UNAVAILABLE';
    hud.setAttribute(
      'aria-label',
      'Treasury ledger claim · not wallet cash; see current read status',
    );
    hud.title = 'Server read only · ledger claim, not cash';
    if ('disabled' in hud) (hud as HTMLButtonElement).disabled = true;
    const value = element('strong', amount + (currency ? ` ${currency}` : ''));
    privateNodes.add(value);
    hud.replaceChildren(
      element('small', 'Treasury ledger claim · not cash'),
      value,
      element('small', caption),
    );
  }
  function paint() {
    const root = document.querySelector<HTMLElement>(mapping.rootSelector);
    if (!root || root.dataset.office !== mapping.role) {
      section?.remove();
      section = null;
      sectionRoot = null;
      return;
    }
    if (sectionRoot && sectionRoot !== root) clearPrivate();
    paintHud(root);
    const main = root.querySelector<HTMLElement>(mapping.mainSelector);
    if (!main) return;
    if (!section || sectionRoot !== root || !main.contains(section)) {
      section?.remove();
      section = element('section', '');
      sectionRoot = root;
      section.id = mapping.sectionId;
      section.dataset.mainOfficeFields = mapping.version;
      section.setAttribute('aria-label', 'Verified treasury capacity');
      section.append(element('h3', 'Treasury capacity · server read only'));
      const state = element('p', 'Unavailable');
      state.dataset.mainOfficeStatus = '';
      state.setAttribute('role', 'status');
      section.append(state);
      const list = element('dl', '');
      Object.assign(list.style, {
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
        gap: '6px 12px',
        margin: '12px 0',
      });
      Object.assign(section.style, {
        maxHeight: '300px',
        overflow: 'auto',
        borderTop: '1px solid currentColor',
        marginTop: '12px',
        paddingTop: '8px',
      });
      for (const f of mapping.fields) {
        const value = element('dd', 'Unavailable');
        value.id = f.id;
        value.dataset.mainOfficeField = f.field;
        list.append(element('dt', f.label), value);
      }
      section.append(list);
      const refreshButton = document.createElement('button');
      refreshButton.type = 'button';
      refreshButton.textContent = 'Refresh treasury fields';
      refreshButton.dataset.mainOfficeRefresh = '';
      refreshButton.addEventListener('click', () => {
        void refresh();
      });
      section.append(refreshButton);
      section.append(
        element(
          'p',
          'Read-only ledger claim and capacity. Reservations are not payments. Policy inputs and commands remain separate.',
        ),
      );
      main.append(section);
    }
    const state = section.querySelector<HTMLElement>(
      '[data-main-office-status]',
    );
    if (state)
      text(
        state,
        snapshot
          ? `Verified at World version ${snapshot.worldVersion} · ${snapshot.values.currency} · ${binding?.read.identity.countryId}`
          : `${status} · Current fields unavailable`,
      );
    for (const f of mapping.fields) {
      const el = section.querySelector<HTMLElement>(
        `[data-main-office-field="${f.field}"]`,
      );
      if (el) {
        const value = !snapshot
          ? 'Unavailable'
          : f.field === 'reservationNature'
            ? 'Reserved capacity · not paid or accrued'
            : f.field === 'balanceNature'
              ? 'Reciprocal ledger claim · not a cash wallet'
              : snapshot.values[f.field];
        text(el, value);
        if (snapshot) privateNodes.add(el);
      }
    }
    const refreshButton = section.querySelector<HTMLButtonElement>(
      '[data-main-office-refresh]',
    );
    if (refreshButton) refreshButton.disabled = !binding || busy;
  }
  function sync() {
    if (binding && !lifetime?.isCurrent()) {
      disconnect();
      return;
    }
    paint();
  }
  async function refresh() {
    if (!binding || !client || !lifetime || busy) return;
    if (!lifetime.isCurrent()) {
      disconnect();
      return;
    }
    const started = ++epoch,
      read = client,
      country = binding.read.identity.countryId;
    snapshot = null;
    clearPrivate();
    busy = true;
    status = 'READING';
    paint();
    try {
      const result = await read.readPage(mapping.dataset, crypto.randomUUID());
      if (started !== epoch || !binding || !lifetime?.isCurrent()) return;
      if (result.status !== 'PAGE' && result.status !== 'EMPTY') {
        if (['DENIED', 'STALE', 'NOT_CONNECTED'].includes(result.status)) {
          const reason = result.status;
          disconnect();
          status = reason;
          paint();
        } else status = result.status;
        return;
      }
      const value = capacity(result, country);
      if (!value) {
        status = 'UNAVAILABLE';
        return;
      }
      snapshot = value;
      status = 'CURRENT';
    } catch {
      if (started === epoch) status = 'UNAVAILABLE';
    } finally {
      if (started === epoch) {
        busy = false;
        paint();
      }
    }
  }
  const observer = new MutationObserver(sync);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-country', 'data-office'],
  });
  host.addEventListener('pagehide', disconnect);
  paint();
  return Object.freeze({
    connect(supplied: OfficeProjectionBinding): void {
      disconnect();
      const view = currentView();
      if (
        !view ||
        supplied.view.role !== mapping.role ||
        supplied.view.countryDisplayId !== view.countryDisplayId ||
        !validConfig(supplied.read) ||
        supplied.read.identity.officeId !== mapping.officeId ||
        supplied.read.identity.projectionVersion !== POSTWAR_RUNTIME_SCHEMA
      )
        return;
      const session = createTrustedHostSession(
        supplied.read,
        supplied.view,
        currentView,
      );
      if (!session || !session.isCurrent()) return;
      lifetime = session;
      binding = supplied;
      client = createPostwarRuntimeClient(session.read);
      stopLifetime = session.onInvalidate(disconnect);
      status = 'READY_TO_READ';
      paint();
      // Explicit host connection may start only this bounded read, never a command.
      void refresh();
    },
    disconnect,
    refresh,
    getState: () =>
      Object.freeze({
        status,
        canRead: !!binding && !busy,
        coverage: mapping.coverage,
        denominator: mapping.denominator,
      }),
  });
}
