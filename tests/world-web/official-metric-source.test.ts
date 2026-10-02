import { readFileSync } from 'node:fs';
import { createContext, runInContext, runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { WorldDecimal } from '../../packages/core/src/numeric/world-decimal.js';
import { OFFICIAL_DATASETS } from '../../apps/world-api/src/integration/official-dataset-registry.js';

const root = new URL(
  '../../apps/world-web/public/season1-immersive/',
  import.meta.url,
);
const adapterSource = readFileSync(
  new URL('country-context.js', root),
  'utf8',
).split('// National geography and local interaction state')[0]!;
const gameSource = readFileSync(new URL('country-game.js', root), 'utf8');
const selected = new URL(
  '../../artifacts/world-balanced-candidate-v1/data/',
  import.meta.url,
);
const packageId = 'BALANCED_2026_09_28_V1';
const checksum =
  '88dd44478f97d2e8893a4f11b3aaf96e256bdb13248aca0d08f097fabe10d315';
const roles = {
  captain: ['population', 'sites', 'resources'],
  finance: ['treasury', 'maintenance', 'sites'],
  central_bank: ['reserves', 'deposits', 'equity'],
  industry: ['power', 'workers', 'build'],
  trade: ['grain', 'demand', 'resources'],
  social: ['labour', 'unemployed', 'workers'],
};

function metadata(spec: (typeof OFFICIAL_DATASETS)[number]) {
  return {
    schemaVersion: 'official-source-dataset-v1',
    dataNature: 'OFFICIAL_SELECTED_SOURCE_DATASET',
    packageId,
    selectionChecksumSha256: checksum,
    dataset: spec.slug,
    sourcePath: spec.sourcePath,
    sourceSha256: spec.sha256,
    sourceBytes: spec.bytes,
    sourceKind: spec.kind,
    unitTreatment: 'SOURCE_UNITS_PRESERVED_NO_CONVERSION',
    numericEncoding: 'DECIMAL_STRING_EXACT',
    unitsSourcePath: 'DATA_DICTIONARY.md',
    proposalFieldsAreExecuted: false,
    liveWorldState: false,
    associations: {
      countryFields: spec.countryFields,
      entityFields: spec.entityFields,
      referenceFields: spec.referenceFields,
    },
  };
}

function fixtureCountry() {
  return JSON.parse(
    readFileSync(new URL('countries/data/01.json', root), 'utf8'),
  );
}

// Minimal DOM surface for the real country-game controller; no production browser or API.
class Element {
  hidden = false;
  innerHTML = '';
  textContent = '';
  value = '';
  disabled = false;
  scrollTop = 42;
  clientWidth = 1440;
  clientHeight = 930;
  isConnected = true;
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  children: Element[] = [];
  classList = { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() };
  focus = vi.fn();
  constructor(readonly find: (selector: string) => Element | null) {}
  querySelector = (selector: string) =>
    selector === 'button' ? this : this.find(selector);
  querySelectorAll = () => [];
  setAttribute = (key: string, value: string) => {
    this.attributes[key] = value;
  };
  append = (element: Element) => {
    this.children.push(element);
  };
  contains = () => false;
  remove = vi.fn();
}

function game(
  role: keyof typeof roles,
  options: {
    connected?: boolean;
    country?: ReturnType<typeof fixtureCountry>;
    mutatePage?: (data: Record<string, unknown>) => void;
    beforePage?: (slug: string) => Promise<void>;
    fetcher?: typeof fetch;
  } = {},
) {
  const country = options.country ?? fixtureCountry();
  const fetcher =
    options.fetcher ??
    (vi.fn(async (url: URL | RequestInfo) => {
      const address = new URL(String(url));
      if (address.pathname.endsWith('/datasets'))
        return Response.json({
          ok: true,
          schemaVersion: 'official-source-catalog-v1',
          dataNature: 'OFFICIAL_SELECTED_SOURCE_DATASET',
          packageId,
          selectionChecksumSha256: checksum,
          datasetCount: 34,
          databaseAvailability: 'VERIFY_PER_REQUEST',
          liveWorldState: false,
          datasets: OFFICIAL_DATASETS.map(metadata),
        });
      const spec = OFFICIAL_DATASETS.find((item) =>
        address.pathname.endsWith('/' + item.slug),
      )!;
      await options.beforePage?.(spec.slug);
      // The pinned Node 24 parser exposes source lexemes; never round source fixture operands.
      const rows = JSON.parse(
        readFileSync(new URL(spec.slug + '.json', selected), 'utf8'),
        (_key: string, value: unknown, context?: { source: string }) =>
          typeof value === 'number' ? context!.source : value,
      ) as Record<string, unknown>[];
      const countryId = address.searchParams.get('countryId');
      const filtered = rows.filter(
        (row) =>
          !countryId ||
          spec.countryFields.some(
            (field) =>
              row[field] === countryId ||
              (Array.isArray(row[field]) && row[field].includes(countryId)),
          ),
      );
      const offset = Number(address.searchParams.get('offset')),
        limit = Number(address.searchParams.get('limit'));
      const items = filtered.slice(offset, offset + limit);
      const data = {
        ok: true,
        ...metadata(spec),
        offset,
        returned: items.length,
        total: filtered.length,
        nextOffset:
          offset + items.length < filtered.length
            ? offset + items.length
            : null,
        filters: { countryId, entityId: null, referenceId: null },
        items,
      };
      options.mutatePage?.(data);
      return Response.json(data);
    }) as typeof fetch);
  const adapterContext = {
    URL,
    URLSearchParams,
    TextDecoder,
    AbortController,
    setTimeout,
    clearTimeout,
    EconWorldRead: undefined as unknown,
    fetch: fetcher,
  };
  runInNewContext(adapterSource, adapterContext);
  const adapter = adapterContext.EconWorldRead as {
    fieldSource: (
      country: unknown,
      pointer: string,
    ) => Record<string, string> | null;
    collectionSource: (
      country: unknown,
      name: string,
    ) => Record<string, string> | null;
    createDatasetSession: (
      country: string,
      options: Record<string, unknown>,
    ) => unknown;
  };
  const nodes = new Map<string, Element>();
  const find = (selector: string) => nodes.get(selector) ?? null;
  for (const selector of [
    '.country-game',
    '.national-resources',
    '.national-reading',
    '.national-tools',
    '.national-drawer',
    '#country-home-layout',
    '#game',
    '#overlay',
    '.national-world-status strong',
    '.national-world-status small',
    '.national-time small',
    '.national-time span',
    '.national-destination small',
    '.national-edition',
    '.national-destination',
    '[data-national-value]',
    '[data-national-remaining]',
    '[data-national-setting]',
    '[data-national-progress]',
    '[data-national-amount]',
    '[data-national-status]',
    '.national-confirm',
  ])
    nodes.set(selector, new Element(find));
  nodes.get('.national-drawer')!.hidden = true;
  const saved = vi.fn();
  const commands: Record<
    string,
    (button?: { dataset: Record<string, string> }) => unknown
  > = {};
  const window: {
    Season1: { D: typeof WorldDecimal };
    EconI18n: null;
    addEventListener: typeof vi.fn;
    CountryGame?: {
      home: () => void;
      state: () => { records: { status: string }[]; amount: number };
    };
  } = {
    Season1: { D: WorldDecimal },
    EconI18n: null,
    addEventListener: vi.fn(),
  };
  const document = {
    querySelector: find,
    createElement: () => new Element(find),
    body: { classList: { add: vi.fn(), remove: vi.fn() } },
    head: new Element(find),
    addEventListener: vi.fn(),
    activeElement: nodes.get('.national-resources'),
  };
  const context = createContext({
    countryScope: '01',
    role,
    contextCountry: country,
    contextCountrySource: { kind: 'STATIC_BASELINE' },
    KEY: 'test',
    localStorage: { getItem: () => null, setItem: saved },
    EconWorldRead: {
      ...adapter,
      createDatasetSession: (number: string) =>
        adapter.createDatasetSession(number, {
          fetcher,
          config: options.connected
            ? {
                apiBaseUrl:
                  'https://source.example/functions/v1/world-v2-official-read/',
              }
            : null,
        }),
    },
    commands,
    document,
    window,
    structuredClone,
    setInterval: vi.fn(),
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    render: vi.fn(),
    routeFromHash: vi.fn(),
    view: null,
    location: { hash: '' },
    bootHash: '',
    pathTo: vi.fn(),
    requestAnimationFrame: (fn: () => void) => fn(),
    roles: { [role]: { name: role, code: role.toUpperCase(), tag: role } },
    catalog: { modules: [] },
    n: (value: unknown) => String(value),
    compact: (value: unknown) => String(value),
    esc: (value: unknown) =>
      String(value).replace(
        /[&<>"']/g,
        (char) =>
          ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
          })[char]!,
      ),
    toast: vi.fn(),
    openModule: vi.fn(),
  });
  runInContext(gameSource, context);
  window.CountryGame!.home();
  return {
    commands,
    nodes,
    adapter,
    country,
    fetcher,
    saved,
    state: window.CountryGame!.state,
  };
}

describe('six-role official metric source links', () => {
  it.each(Object.keys(roles) as (keyof typeof roles)[])(
    '%s opens published exact field provenance offline and keeps confirmation local',
    async (role) => {
      const page = game(role);
      for (const key of roles[role]) {
        expect(page.nodes.get('.national-resources')!.innerHTML).toContain(
          `data-metric="${key}"`,
        );
        await page.commands['country-metric']!({ dataset: { metric: key } });
        const html = page.nodes.get('.national-drawer')!.innerHTML;
        expect(html).toContain('STATIC_BASELINE');
        expect(html).toContain('NOT_CONNECTED · Published provenance only');
        expect(html).toContain('Source record & units');
        expect(html).toContain(
          'data-disabled-reason="API_NOT_CONFIGURED" disabled',
        );
        expect(html).not.toContain('VERIFIED_SOURCE');
      }
      page.commands['country-adjust']!({ dataset: { delta: '1' } });
      page.commands['country-metric']!({ dataset: { metric: 'plan' } });
      expect(page.nodes.get('.national-drawer')!.innerHTML).toContain(
        'LOCAL_REHEARSAL',
      );
      expect(page.nodes.get('.national-drawer')!.innerHTML).toContain(
        'Confirm saves a local decision.',
      );
      page.commands['country-confirm']!();
      expect(page.state().records[0]?.status).toBe('LOCAL_NOT_EXECUTED');
      expect(page.fetcher).not.toHaveBeenCalled();
      expect(page.saved).toHaveBeenCalled();
      expect(page.nodes.get('.country-game')!.scrollTop).toBe(42);
    },
  );

  it('shows C exact token and source field, even beyond Number precision', () => {
    const country = fixtureCountry();
    const field =
      country.officialSource.fields['/profile/treasuryCentralBankBalanceGcu'];
    field.exact = '9007199254740993.125';
    field.rawToken = '9007199254740993.125';
    const page = game('finance', { country });
    page.commands['country-metric']!({ dataset: { metric: 'treasury' } });
    const html = page.nodes.get('.national-drawer')!.innerHTML;
    expect(html).toContain('9007199254740993.125');
    expect(html).toContain('treasuryCentralBankBalance');
    expect(html).toContain('GCU_SCENARIO_ACCOUNTING_UNIT');
    expect(html).not.toContain('9007199254740992');
  });

  it('preserves the source time basis without inventing a simulated-day unit', () => {
    const country = fixtureCountry();
    const field =
      country.officialSource.fields['/facilities/0/record/maintenanceGcuDay'];
    field.unit = 'GCU_SCENARIO_ACCOUNTING_UNIT/day';
    field.unitBasis = 'TIME_BASIS_UNSPECIFIED';
    const page = game('finance', { country });
    expect(page.nodes.get('.national-resources')!.innerHTML).toContain(
      'scenario GCU/day',
    );
    expect(page.nodes.get('.national-resources')!.innerHTML).not.toContain(
      'scenario GCU/sim-day',
    );
    page.commands['country-metric']!({ dataset: { metric: 'maintenance' } });
    expect(page.nodes.get('.national-drawer')!.innerHTML).toContain(
      'GCU_SCENARIO_ACCOUNTING_UNIT/day',
    );
    expect(page.nodes.get('.national-drawer')!.innerHTML).toContain(
      'TIME_BASIS_UNSPECIFIED',
    );
  });

  it('uses the selected facility pointer after a site switch', () => {
    const page = game('industry');
    const next = page.country.facilities[1];
    page.commands['country-site']!({ dataset: { id: next.id } });
    page.commands['country-metric']!({ dataset: { metric: 'workers' } });
    expect(page.nodes.get('.national-drawer')!.innerHTML).toContain(next.id);
    expect(page.nodes.get('.national-drawer')!.innerHTML).toContain(
      page.country.officialSource.fields['/facilities/1/record/requiredWorkers']
        .sourcePointer,
    );
  });

  it('only calls a matched source VERIFIED_SOURCE, with no live or Command promotion', async () => {
    const page = game('finance', { connected: true });
    await page.commands['country-metric-verify']!({
      dataset: { metric: 'treasury' },
    });
    expect(page.nodes.get('.national-drawer')!.innerHTML).toContain(
      'VERIFIED_SOURCE',
    );
    expect(page.nodes.get('.national-drawer')!.innerHTML).toContain(
      'not live World',
    );
    expect(page.nodes.get('.national-resources')!.innerHTML).toContain(
      'VERIFIED_SOURCE',
    );
    expect(page.state().records).toHaveLength(0);
    expect(page.fetcher).toHaveBeenCalledTimes(2);
  });

  it.each(Object.keys(roles) as (keyof typeof roles)[])(
    '%s verifies the source inputs for a local preview without execution',
    async (role) => {
      const page = game(role, { connected: true });
      for (const key of roles[role]) {
        await page.commands['country-metric-verify']!({
          dataset: { metric: key },
        });
        expect(page.nodes.get('.national-drawer')!.innerHTML).toContain(
          'Source fields match',
        );
        expect(page.nodes.get('.national-drawer')!.innerHTML).toContain(
          'data-source-state="VERIFIED_SOURCE"',
        );
      }
      await page.commands['country-metric-verify']!({
        dataset: { metric: 'plan' },
      });
      expect(page.nodes.get('.national-drawer')!.innerHTML).toContain(
        'Source fields match',
      );
      expect(page.nodes.get('.national-drawer')!.innerHTML).toContain(
        'LOCAL_REHEARSAL',
      );
      expect(page.state().records).toHaveLength(0);
    },
  );

  it('does not verify a count when the source identities do not match the published collection', async () => {
    const page = game('captain', {
      connected: true,
      mutatePage: (data) => {
        (data.items as Record<string, unknown>[])[0]!.id = 'UNRELATED-SITE';
      },
    });
    await page.commands['country-metric-verify']!({
      dataset: { metric: 'sites' },
    });
    expect(page.nodes.get('.national-drawer')!.innerHTML).toContain(
      'Source check failed',
    );
    expect(page.nodes.get('.national-drawer')!.innerHTML).not.toContain(
      'VERIFIED_SOURCE',
    );
  });

  it('retires a verification read when another drawer opens and restores the trigger focus on close', async () => {
    let finish: () => void = () => undefined;
    const waiting = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const beforePage = vi.fn(async () => waiting);
    const page = game('finance', { connected: true, beforePage });
    const pending = page.commands['country-metric-verify']!({
      dataset: { metric: 'treasury' },
    });
    await vi.waitFor(() => expect(beforePage).toHaveBeenCalled());
    page.commands['country-metric']!({ dataset: { metric: 'maintenance' } });
    finish();
    await pending;
    const html = page.nodes.get('.national-drawer')!.innerHTML;
    expect(html).toContain('maintenanceGcuDayProposal');
    expect(html).not.toContain('Source fields match');
    expect(page.nodes.get('.national-resources')!.innerHTML).not.toContain(
      'VERIFIED_SOURCE',
    );
    page.commands.close!();
    expect(page.nodes.get('.national-drawer')!.hidden).toBe(true);
    expect(page.nodes.get('.national-resources')!.focus).toHaveBeenCalled();
  });

  it('returns focus to the replacement HUD button after its source status was refreshed', () => {
    const page = game('finance');
    const trigger = page.nodes.get('.national-resources')!;
    trigger.dataset.metric = 'treasury';
    page.commands['country-metric']!({ dataset: { metric: 'treasury' } });
    trigger.isConnected = false;
    const replacement = page.nodes.get('.national-reading')!;
    page.nodes.set(
      '[data-cmd="country-metric"][data-metric="treasury"]',
      replacement,
    );
    page.commands.close!();
    expect(replacement.focus).toHaveBeenCalledOnce();
    expect(trigger.focus).not.toHaveBeenCalled();
  });

  it.each(['source-hash', 'value', 'country'])(
    'keeps the bundle static on a mismatched %s',
    async (mismatch) => {
      const page = game('finance', {
        connected: true,
        mutatePage: (data) => {
          if (mismatch === 'source-hash') data.sourceSha256 = '0'.repeat(64);
          else {
            const first = (data.items as Record<string, unknown>[])[0]!;
            first[
              mismatch === 'country'
                ? 'countryId'
                : 'treasuryCentralBankBalance'
            ] = mismatch === 'country' ? 'visual-territory-02' : '1.234';
          }
        },
      });
      await page.commands['country-metric-verify']!({
        dataset: { metric: 'treasury' },
      });
      expect(page.nodes.get('.national-drawer')!.innerHTML).toContain(
        'Source check failed',
      );
      expect(page.nodes.get('.national-drawer')!.innerHTML).not.toContain(
        'VERIFIED_SOURCE',
      );
      expect(page.nodes.get('.national-drawer')!.innerHTML).toContain(
        page.country.officialSource.fields[
          '/profile/treasuryCentralBankBalanceGcu'
        ].exact,
      );
    },
  );

  it('shows missing provenance without generating exact tokens from legacy numbers', () => {
    const country = fixtureCountry();
    delete country.officialSource;
    const page = game('finance', { country });
    page.commands['country-metric']!({ dataset: { metric: 'treasury' } });
    expect(page.nodes.get('.national-drawer')!.innerHTML).toContain(
      'Published field provenance unavailable',
    );
    expect(page.nodes.get('.national-drawer')!.innerHTML).not.toContain(
      'Raw token:',
    );
    expect(page.fetcher).not.toHaveBeenCalled();
  });
});
