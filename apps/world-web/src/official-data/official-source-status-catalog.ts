import { OFFICIAL_EXPLORER_SOURCE } from './official-explorer-country-manifest.js';
import { OFFICIAL_SOURCE_CATALOG_IDENTITIES } from './official-source-status-registry.js';

export type OfficialSourceConnectionState =
  | { readonly kind: 'NOT_CONFIGURED' }
  | { readonly kind: 'LOADING' }
  | { readonly kind: 'SELECTED_SOURCE_CATALOG_VERIFIED' }
  | { readonly kind: 'UNAVAILABLE' };

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const identityBySlug = new Map(
  OFFICIAL_SOURCE_CATALOG_IDENTITIES.map((row) => [row.slug, row]),
);
const maximumCatalogBytes = 128_000;
const requestTimeoutMs = 5_000;

/** Only the existing build-injected public Edge config is accepted. */
export function officialSourceCatalogUrl(config: unknown): URL | null {
  if (
    !record(config) ||
    Object.keys(config).length !== 1 ||
    typeof config.apiBaseUrl !== 'string'
  )
    return null;
  let base: URL;
  try {
    base = new URL(config.apiBaseUrl);
  } catch {
    return null;
  }
  const edgePath = '/functions/v1/world-v2-official-read';
  if (
    base.protocol !== 'https:' ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    ![edgePath, `${edgePath}/`].includes(base.pathname)
  )
    return null;
  base.pathname = `${edgePath}/`;
  return new URL('v1/world-data/datasets', base);
}

/** Checks metadata identities only. No raw dataset bytes or economic state are read. */
export function verifyOfficialSourceCatalog(value: unknown): boolean {
  if (
    !record(value) ||
    value.ok !== true ||
    value.schemaVersion !== 'official-source-catalog-v1' ||
    value.dataNature !== 'OFFICIAL_SELECTED_SOURCE_DATASET' ||
    value.packageId !== OFFICIAL_EXPLORER_SOURCE.packageId ||
    value.selectionChecksumSha256 !==
      OFFICIAL_EXPLORER_SOURCE.selectionChecksumSha256 ||
    value.datasetCount !== 34 ||
    value.databaseAvailability !== 'VERIFY_PER_REQUEST' ||
    value.liveWorldState !== false ||
    !Array.isArray(value.datasets) ||
    value.datasets.length !== 34
  )
    return false;
  const seen = new Set<string>();
  for (const row of value.datasets) {
    if (
      !record(row) ||
      typeof row.dataset !== 'string' ||
      seen.has(row.dataset)
    )
      return false;
    const expected = identityBySlug.get(row.dataset);
    if (
      !expected ||
      row.schemaVersion !== 'official-source-dataset-v1' ||
      row.dataNature !== 'OFFICIAL_SELECTED_SOURCE_DATASET' ||
      row.packageId !== OFFICIAL_EXPLORER_SOURCE.packageId ||
      row.selectionChecksumSha256 !==
        OFFICIAL_EXPLORER_SOURCE.selectionChecksumSha256 ||
      row.sourcePath !== expected.sourcePath ||
      row.sourceSha256 !== expected.sha256 ||
      row.sourceBytes !== expected.bytes ||
      row.sourceKind !== expected.kind ||
      row.numericEncoding !== 'DECIMAL_STRING_EXACT' ||
      row.unitTreatment !== 'SOURCE_UNITS_PRESERVED_NO_CONVERSION' ||
      row.unitsSourcePath !== 'DATA_DICTIONARY.md' ||
      row.proposalFieldsAreExecuted !== false ||
      row.liveWorldState !== false
    )
      return false;
    seen.add(row.dataset);
  }
  return seen.size === identityBySlug.size;
}

async function readCatalog(
  fetcher: typeof fetch,
  url: URL,
  signal: AbortSignal,
): Promise<boolean> {
  const response = await fetcher(url, {
    method: 'GET',
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
    headers: { accept: 'application/json' },
    signal,
  });
  if (
    signal.aborted ||
    response.status !== 200 ||
    response.redirected ||
    !response.body ||
    response.headers
      .get('content-type')
      ?.split(';')[0]
      ?.trim()
      .toLowerCase() !== 'application/json'
  ) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error('CATALOG_UNAVAILABLE');
  }
  const reader = response.body.getReader();
  const cancelReader = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener('abort', cancelReader, { once: true });
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (signal.aborted) throw new Error('CATALOG_ABORTED');
      if (done) break;
      total += value.byteLength;
      if (total > maximumCatalogBytes) throw new Error('CATALOG_TOO_LARGE');
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return verifyOfficialSourceCatalog(
      JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      ) as unknown,
    );
  } finally {
    signal.removeEventListener('abort', cancelReader);
    // Do not wait on a transport that ignores cancellation.
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/** One catalog GET per mounted session. StrictMode's setup/cleanup/setup cycle
 * shares that same request; a real unmount aborts it and retires late replies. */
export function createOfficialSourceStatusSession(
  config: unknown,
  fetcher: typeof fetch = fetch,
) {
  const url = officialSourceCatalogUrl(config);
  let state: OfficialSourceConnectionState =
    config == null
      ? { kind: 'NOT_CONFIGURED' }
      : url
        ? { kind: 'LOADING' }
        : { kind: 'UNAVAILABLE' };
  const observers = new Set<() => void>();
  let started = false;
  let retired = false;
  let controller: AbortController | undefined;
  const publish = (next: OfficialSourceConnectionState) => {
    if (retired) return;
    state = next;
    for (const observer of observers) observer();
  };
  const start = async () => {
    if (started || !url || retired) return;
    started = true;
    controller = new AbortController();
    const signal = controller.signal;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: () => void = () => undefined;
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(new Error('CATALOG_ABORTED'));
      signal.addEventListener('abort', onAbort, { once: true });
      timer = setTimeout(() => controller?.abort(), requestTimeoutMs);
    });
    try {
      const valid = await Promise.race([
        readCatalog(fetcher, url, signal),
        aborted,
      ]);
      if (!signal.aborted)
        publish({
          kind: valid ? 'SELECTED_SOURCE_CATALOG_VERIFIED' : 'UNAVAILABLE',
        });
    } catch {
      publish({ kind: 'UNAVAILABLE' });
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      controller = undefined;
    }
  };
  return {
    getSnapshot: () => state,
    subscribe: (observer: () => void) => {
      observers.add(observer);
      void start();
      return () => {
        observers.delete(observer);
        queueMicrotask(() => {
          if (observers.size === 0) {
            retired = true;
            controller?.abort();
          }
        });
      };
    },
  };
}
