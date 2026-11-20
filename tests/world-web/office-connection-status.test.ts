import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OFFICIAL_DATASETS } from '../../apps/world-api/src/integration/official-dataset-registry.js';
import {
  createStagedReservationClient,
  type PreparedReservation,
} from '../../apps/world-web/src/country-runtime/staged-reservation-client.js';
import type { AuthorizedBrowserIdentity } from '../../apps/world-web/src/authorized-client/client.js';

// These are transport/contract fixtures. No live API, admission or execution is claimed.
const source = readFileSync(
  'apps/world-web/public/season1-immersive/country-context.js',
  'utf8',
).split('// National geography and local interaction state')[0]!;
const game = readFileSync(
  'apps/world-web/public/season1-immersive/country-game.js',
  'utf8',
);
const countryId = 'visual-territory-01';
const selectionChecksumSha256 =
  '88dd44478f97d2e8893a4f11b3aaf96e256bdb13248aca0d08f097fabe10d315';
function metadata(slug: string) {
  const spec = OFFICIAL_DATASETS.find((row) => row.slug === slug)!;
  return {
    schemaVersion: 'official-source-dataset-v1',
    dataNature: 'OFFICIAL_SELECTED_SOURCE_DATASET',
    packageId: 'BALANCED_2026_09_28_V1',
    selectionChecksumSha256,
    dataset: slug,
    sourcePath: spec.sourcePath,
    sourceSha256: spec.sha256,
    sourceBytes: spec.bytes,
    sourceKind: spec.kind,
    unitTreatment: 'SOURCE_UNITS_PRESERVED_NO_CONVERSION',
    numericEncoding: 'DECIMAL_STRING_EXACT',
    unitsSourcePath: 'DATA_DICTIONARY.md',
    associations: {
      countryFields: spec.countryFields,
      entityFields: spec.entityFields,
      referenceFields: spec.referenceFields,
    },
    proposalFieldsAreExecuted: false,
    liveWorldState: false,
  };
}
type DatasetSession = {
  loadCatalogue(): Promise<{ kind: string }>;
  loadDataset(
    slug: string,
    options?: { offset?: number; section?: string },
  ): Promise<Record<string, unknown>>;
};
async function sessionFor(response: Record<string, unknown>) {
  const fetcher = vi.fn<typeof fetch>(async (url) =>
    Response.json(
      String(url).endsWith('/datasets')
        ? {
            ok: true,
            schemaVersion: 'official-source-catalog-v1',
            dataNature: 'OFFICIAL_SELECTED_SOURCE_DATASET',
            packageId: 'BALANCED_2026_09_28_V1',
            selectionChecksumSha256,
            datasetCount: 34,
            databaseAvailability: 'VERIFY_PER_REQUEST',
            liveWorldState: false,
            datasets: OFFICIAL_DATASETS.map((row) => metadata(row.slug)),
          }
        : response,
    ),
  );
  const context = {
    URL,
    URLSearchParams,
    TextDecoder,
    AbortController,
    setTimeout,
    clearTimeout,
    EconWorldRead: undefined as
      | {
          createDatasetSession(number: string, options: object): DatasetSession;
        }
      | undefined,
  };
  runInNewContext(source, context);
  const session = context.EconWorldRead!.createDatasetSession('01', {
    fetcher,
    config: { apiOrigin: 'https://source.example/' },
  });
  expect(await session.loadCatalogue()).toMatchObject({ kind: 'CATALOGUE' });
  return session;
}
const page = {
  ok: true,
  ...metadata('finance'),
  offset: 0,
  total: 0,
  returned: 0,
  nextOffset: null,
  filters: { countryId, entityId: null, referenceId: null },
  items: [],
};
const fragment = {
  ok: true,
  ...metadata('geography'),
  section: 'partition.coastPath',
  fragment: 'abcd',
  fragmentLength: 4,
  totalLength: 8,
  fragmentOffset: 0,
  nextFragmentOffset: 4,
};

afterEach(() => vi.useRealTimers());

describe('active source reader distinguishes empty data from invalid paging', () => {
  it('accepts an actual zero-row country result', async () => {
    const session = await sessionFor(page);
    expect(await session.loadDataset('finance')).toMatchObject({
      kind: 'PAGE',
      total: 0,
      items: [],
      nextOffset: null,
    });
  });
  it.each([
    { total: 2, nextOffset: 0 },
    { total: 0, returned: 1, items: [{ countryId }] },
    { total: 1, returned: 2, items: [{ countryId }, { countryId }] },
  ])('rejects impossible/non-progressing source pages: %j', async (changes) => {
    const session = await sessionFor({ ...page, ...changes });
    expect(await session.loadDataset('finance')).toMatchObject({
      kind: 'INVALID',
      reason: 'DATASET_SHAPE_INVALID',
    });
    expect(await session.loadDataset('finance')).toMatchObject({
      reason: 'DATASET_NOT_IN_CATALOGUE',
    });
  });
  it('keeps a valid end-of-page request distinct from zero source rows', async () => {
    const session = await sessionFor({ ...page, total: 2, offset: 2 });
    expect(await session.loadDataset('finance', { offset: 2 })).toMatchObject({
      kind: 'PAGE',
      total: 2,
      items: [],
      nextOffset: null,
    });
  });
  it('accepts valid next-fragment progress', async () => {
    const session = await sessionFor(fragment);
    expect(
      await session.loadDataset('geography', {
        section: 'partition.coastPath',
      }),
    ).toMatchObject({ kind: 'FRAGMENT', nextOffset: 4 });
  });
  it.each([
    { nextFragmentOffset: 0 },
    { nextFragmentOffset: -1 },
    { nextFragmentOffset: 9 },
    { nextFragmentOffset: null },
    { totalLength: -1 },
    { totalLength: 3, nextFragmentOffset: null },
    { fragment: '', fragmentLength: 0, nextFragmentOffset: 0 },
    { fragmentLength: 3 },
    {
      fragment: 'x'.repeat(16385),
      fragmentLength: 16385,
      totalLength: 20000,
      nextFragmentOffset: 16385,
    },
  ])('rejects invalid source fragment fixture %#', async (changes) => {
    const session = await sessionFor({ ...fragment, ...changes });
    expect(
      await session.loadDataset('geography', {
        section: 'partition.coastPath',
      }),
    ).toMatchObject({ kind: 'INVALID', reason: 'FRAGMENT_INVALID' });
  });
  it.each([
    [0, 'No source row for this country.'],
    [2, 'No more source records on this page.'],
  ])('renders an empty page with total %i accurately', (total, expected) => {
    let rendered = '';
    const start = game.indexOf('function sourcePage(');
    const end = game.indexOf('async function openSource()', start);
    runInNewContext(`${game.slice(start, end)}; sourcePage(result);`, {
      result: { kind: 'PAGE', items: [], total, nextOffset: null },
      sourceSelected: 'finance',
      sourceNote: '',
      esc: (value: string) => value,
      drawer: (_title: string, body: string) => {
        rendered = body;
      },
    });
    expect(rendered).toContain(expected);
    if (total > 0) expect(rendered).not.toContain('No source row');
  });
});

const identity: AuthorizedBrowserIdentity = {
  worldId: 'WORLD_TEST',
  countryId: 'COUNTRY_01',
  officeId: 'TRADE',
  scopeKey: 'SCOPE_TEST',
  authSubjectId: 'test-subject',
  authorizationRevision: 'revision-1',
  modelVersion: 'model-1',
  projectionVersion: 'projection-1',
  classification: 'OFFICE_PRIVATE',
};
const prepared: PreparedReservation = {
  commandId: 'COMMAND_TEST',
  idempotencyKey: 'KEY_TEST',
  commandFingerprint: `sha256:${'a'.repeat(64)}`,
  approvalRef: 'APPROVAL_TEST',
  expectedWorldVersion: '0',
  payload: {},
};
function staged(
  fetcher: typeof fetch,
  getAccessToken = async (): Promise<string | null> => 'fixture-token',
) {
  return createStagedReservationClient({
    identity,
    origin: 'http://127.0.0.1:4101',
    isCurrent: () => true,
    getAccessToken,
    prepared,
    fetcher,
    pendingStorage: null,
  });
}

describe('staged connection transport retires pending reads', () => {
  it.each([401, 403])(
    'reports HTTP %i without requiring a success schema/body',
    async (status) => {
      const client = staged(
        vi.fn(async () => new Response('denied', { status })),
      );
      expect(await client.readLifecycle()).toBe('DENIED');
      client.retire();
    },
  );
  it.each(['token', 'headers', 'body'] as const)(
    'bounds the complete request while waiting for %s',
    async (stage) => {
      vi.useFakeTimers();
      const fetcher = vi.fn<typeof fetch>(async () =>
        stage === 'headers'
          ? new Promise<Response>(() => undefined)
          : new Response(new ReadableStream(), {
              headers: { 'content-type': 'application/json' },
            }),
      );
      const client = staged(
        fetcher,
        stage === 'token'
          ? () => new Promise<string | null>(() => undefined)
          : undefined,
      );
      let result: string | undefined;
      const pending = client.readLifecycle().then((value) => {
        result = value;
      });
      await vi.advanceTimersByTimeAsync(10_000);
      expect(result).toBe('UNKNOWN');
      await pending;
      expect(vi.getTimerCount()).toBe(0);
      client.retire();
    },
  );
  it('retirement settles a pending token read and never dispatches its late token', async () => {
    let resolveToken: (value: string) => void = () => undefined;
    const fetcher = vi.fn<typeof fetch>();
    const client = staged(
      fetcher,
      () =>
        new Promise((resolve) => {
          resolveToken = resolve;
        }),
    );
    let result: string | undefined;
    const pending = client.readLifecycle().then((value) => {
      result = value;
    });
    client.retire();
    await vi.waitFor(() => expect(result).toBe('UNKNOWN'));
    resolveToken('late-fixture-token');
    await pending;
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(['headers', 'body'] as const)(
    'retirement aborts and settles a pending %s read immediately',
    async (stage) => {
      vi.useFakeTimers();
      let signal: AbortSignal | null | undefined;
      let releaseHeaders: (response: Response) => void = () => undefined;
      const bodyCancelled = vi.fn();
      const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
        signal = init?.signal;
        return stage === 'headers'
          ? new Promise<Response>((resolve) => {
              releaseHeaders = resolve;
            })
          : new Response(new ReadableStream({ cancel: bodyCancelled }), {
              headers: { 'content-type': 'application/json' },
            });
      });
      const client = staged(fetcher);
      let result: string | undefined;
      const pending = client.readLifecycle().then((value) => {
        result = value;
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(fetcher).toHaveBeenCalledOnce();
      client.retire();
      await vi.advanceTimersByTimeAsync(0);
      expect(result).toBe('UNKNOWN');
      expect(signal?.aborted).toBe(true);
      if (stage === 'body') expect(bodyCancelled).toHaveBeenCalledOnce();
      releaseHeaders(
        Response.json({
          schemaVersion: 'world-staged-transfer-v1',
          ok: true,
          state: {
            status: 'QUEUED',
            acknowledgement: {
              worldId: identity.worldId,
              commandId: prepared.commandId,
              commandFingerprint: prepared.commandFingerprint,
              status: 'ACCEPTED',
            },
          },
        }),
      );
      await pending;
      expect(result).toBe('UNKNOWN');
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});
