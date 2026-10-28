import type { ProductionReadConfig } from '../production-read/contract.js';
import {
  createPostwarRuntimeClient,
  officeDatasets,
  type RuntimePage,
  type RuntimeResult,
} from './client.js';

/** Text-only bounded business readout. Opening balances/capacity are labeled
 * historical H0 facts; this surface has no command, payment or dispatch port. */
export function createPostwarRuntimeView(
  config: ProductionReadConfig,
  changed: () => void,
) {
  const client = createPostwarRuntimeClient(config);
  const datasets = officeDatasets[config.identity.officeId] ?? [];
  let dataset = datasets[0] ?? '',
    result: RuntimeResult | null = null,
    busy = false,
    epoch = 0,
    closed = false;
  const state = () => ({
    connection:
      !closed && (result?.status === 'PAGE' || result?.status === 'EMPTY')
        ? ('READ_ONLY_BOUND' as const)
        : ('NOT_CONNECTED' as const),
    status: closed
      ? ('MISSING' as const)
      : busy
        ? ('READING' as const)
        : result?.status === 'PAGE' || result?.status === 'EMPTY'
          ? ('CURRENT' as const)
          : result?.status === 'DENIED'
            ? ('DENIED' as const)
            : result?.status === 'STALE'
              ? ('STALE' as const)
              : result
                ? ('UNAVAILABLE' as const)
                : ('READY_TO_READ' as const),
    code: result && 'code' in result ? result.code : null,
    canRead: !closed && !busy,
  });
  async function load(next = false) {
    if (closed || busy) return;
    const previous = next && result && 'page' in result ? result : undefined;
    const started = ++epoch;
    result = null;
    busy = true;
    changed();
    const read = await client.readPage(dataset, crypto.randomUUID(), previous);
    if (closed || started !== epoch) return;
    busy = false;
    result = read;
    changed();
  }
  function disconnect() {
    closed = true;
    epoch++;
    result = null;
    busy = false;
    client.disconnect();
    changed();
  }
  const stop = config.session.onInvalidate(disconnect);
  return Object.freeze({
    state,
    disconnect() {
      stop();
      disconnect();
    },
    refresh: () => load(),
    render(document: Document) {
      const section = document.createElement('section');
      section.dataset.postwarRuntimeReadout = '';
      const text = (tag: string, value: string) => {
        const el = document.createElement(tag);
        el.textContent = value;
        return el;
      };
      section.append(
        text('h3', `${config.identity.officeId} · Admitted opening data`),
        text(
          'p',
          `${state().status}${state().code ? ' · ' + state().code : ''}`,
        ),
        text(
          'p',
          'H0 derived data · No post-opening replay. Opening financial legs are not current spendable balances.',
        ),
      );
      const select = document.createElement('select');
      select.setAttribute('aria-label', 'Office dataset');
      for (const name of datasets) {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.append(option);
      }
      select.value = dataset;
      select.disabled = busy || closed;
      select.addEventListener('change', () => {
        epoch++;
        dataset = select.value;
        result = null;
        void load();
      });
      section.append(select);
      const button = (
        label: string,
        enabled: boolean,
        action: () => unknown,
      ) => {
        const el = document.createElement('button');
        el.type = 'button';
        el.textContent = label;
        el.disabled = !enabled;
        el.addEventListener('click', () => {
          void action();
        });
        section.append(el);
      };
      button('Read current authorized page', !busy && !closed, () => load());
      if (result && 'page' in result) {
        const page: RuntimePage = result;
        section.append(
          text(
            'p',
            `Rows ${page.page.offset + (page.rows.length ? 1 : 0)}–${page.page.offset + page.rows.length} / ${page.page.total} · Source ${page.source.sourceVersion}`,
          ),
        );
        if (page.status === 'EMPTY')
          section.append(
            text(
              'p',
              dataset === 'offers'
                ? 'No actual vacancies in the admitted opening.'
                : 'This authorized dataset has no rows.',
            ),
          );
        else {
          const fields: Readonly<Record<string, readonly string[]>> = {
            positions: [
              'positionId',
              'locationId',
              'classificationId',
              'occupation',
              'skill',
              'requiredCount',
              'employedCount',
              'wageAmount',
              'wageCurrency',
              'wagePeriod',
            ],
            'service-pools': [
              'poolId',
              'locationId',
              'skill',
              'dayIndex',
              'capacitySlots',
              'usedSlots',
              'reservedSlots',
            ],
            'minimum-wage': [
              'countryId',
              'amount',
              'currency',
              'period',
              'ruleVersion',
              'validFromDayIndex',
              'validUntilDayIndex',
            ],
            'currency-fx': ['countryId', 'localCurrency', 'openingFx'],
            'public-service-summary': [
              'regionId',
              'kind',
              'demandCount',
              'capacityCount',
              'allocatedCount',
              'unallocatedCount',
            ],
            'regional-source-capacity': [
              'locationId',
              'sourceRegionId',
              'sourceInitial',
              'sourceStatus',
            ],
          };
          const columns =
            fields[dataset] ?? Object.keys(page.rows[0] ?? {}).slice(0, 8);
          const table = document.createElement('table'),
            head = document.createElement('tr');
          for (const column of columns) head.append(text('th', column));
          table.append(head);
          for (const row of page.rows) {
            const tr = document.createElement('tr');
            for (const column of columns) {
              const value = row[column];
              tr.append(
                text(
                  'td',
                  value === undefined || value === null
                    ? 'Not supplied'
                    : typeof value === 'object'
                      ? JSON.stringify(value).slice(0, 1200)
                      : String(value),
                ),
              );
            }
            table.append(tr);
          }
          section.append(table);
        }
        button(
          'Next authorized page',
          !busy && !closed && page.page.nextOffset !== null,
          () => load(true),
        );
      }
      return section;
    },
  });
}
