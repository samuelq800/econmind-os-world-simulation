import { sha256Bytes, sha256Canonical } from './canonical.js';
import type {
  RawSnapshotMetadata,
  RetrievedPayload,
  SnapshotTransport,
  SourceAdapter,
  SourceRequest,
} from './types.js';

export interface SnapshotInput {
  readonly retrievedAt: string;
  readonly sourceAsOf: string | null;
  readonly providerVersion: string | null;
  readonly requestedDimensions?: Readonly<Record<string, readonly string[]>>;
  readonly status: RawSnapshotMetadata['status'];
}

export function createSnapshotMetadata(
  request: SourceRequest,
  payload: RetrievedPayload,
  adapter: SourceAdapter,
  input: SnapshotInput,
): RawSnapshotMetadata {
  const sha256 = sha256Bytes(payload.bytes);
  const requestParameters = Object.freeze(
    Object.fromEntries(
      Object.entries(request.parameters).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  );
  const requestedDimensions = Object.freeze(
    Object.fromEntries(
      Object.entries(input.requestedDimensions ?? {})
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, values]) => [key, Object.freeze([...values])]),
    ),
  );
  const responseHeaders = Object.freeze(
    Object.fromEntries(
      Object.entries(payload.responseHeaders).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  );
  const snapshotIdentity = {
    sourceId: request.sourceId,
    sourceFamily: adapter.sourceFamily,
    endpointIdentity: adapter.endpointIdentity,
    query: payload.finalUrl,
    requestParameters,
    requestedDimensions,
    retrievedAt: input.retrievedAt,
    sourceAsOf: input.sourceAsOf,
    providerVersion: input.providerVersion,
    adapterVersion: adapter.adapterVersion,
    sha256,
  };
  return Object.freeze({
    schemaVersion: 'raw-snapshot.v2',
    snapshotId: `snap_${request.sourceId.toLowerCase()}_${sha256Canonical(snapshotIdentity).slice(0, 20)}`,
    sourceId: request.sourceId,
    sourceFamily: adapter.sourceFamily,
    provider: adapter.provider,
    endpointIdentity: adapter.endpointIdentity,
    retrievedAt: input.retrievedAt,
    sourceAsOf: input.sourceAsOf,
    query: payload.finalUrl,
    requestParameters,
    requestedDimensions,
    providerVersion: input.providerVersion,
    fileFormat: request.expectedFormat,
    httpStatus: payload.httpStatus,
    responseHeaders,
    adapterVersion: adapter.adapterVersion,
    licenseUrl: adapter.licenseUrl,
    sha256,
    byteLength: payload.bytes.byteLength,
    status: input.status,
  });
}

export function verifySnapshot(
  metadata: RawSnapshotMetadata,
  bytes: Uint8Array,
): boolean {
  return (
    metadata.byteLength === bytes.byteLength &&
    metadata.sha256 === sha256Bytes(bytes)
  );
}

export async function retrieveSnapshot(
  request: SourceRequest,
  transport: SnapshotTransport,
  adapter: SourceAdapter,
  input: SnapshotInput,
): Promise<Readonly<{ bytes: Uint8Array; metadata: RawSnapshotMetadata }>> {
  const payload = await transport.retrieve(request);
  if (payload.httpStatus < 200 || payload.httpStatus >= 300) {
    throw new Error(
      `HTTP_RETRIEVAL_FAILED:${payload.httpStatus}:${request.sourceId}`,
    );
  }
  return Object.freeze({
    bytes: payload.bytes,
    metadata: createSnapshotMetadata(request, payload, adapter, input),
  });
}

export class FixtureTransport implements SnapshotTransport {
  public constructor(
    private readonly fixtures: Readonly<Record<string, Uint8Array>>,
  ) {}

  public async retrieve(request: SourceRequest): Promise<RetrievedPayload> {
    const bytes = this.fixtures[request.sourceId];
    if (bytes === undefined)
      throw new Error(`No fixture for ${request.sourceId}`);
    return Promise.resolve({
      bytes: bytes.slice(),
      httpStatus: 200,
      responseHeaders: {
        'content-type':
          request.expectedFormat === 'JSON' ? 'application/json' : 'text/csv',
      },
      finalUrl: request.url,
    });
  }
}

const REPRODUCIBILITY_HEADERS = new Set([
  'content-type',
  'content-length',
  'etag',
  'last-modified',
  'date',
  'cache-control',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
]);

export class NodeHttpTransport implements SnapshotTransport {
  public constructor(
    private readonly requestHeaders: Readonly<Record<string, string>> = {},
  ) {}

  public async retrieve(request: SourceRequest): Promise<RetrievedPayload> {
    const response = await fetch(request.url, {
      method: request.method,
      headers: this.requestHeaders,
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    });
    const responseHeaders: Record<string, string> = {};
    for (const [key, value] of response.headers.entries()) {
      if (REPRODUCIBILITY_HEADERS.has(key.toLowerCase())) {
        responseHeaders[key.toLowerCase()] = value;
      }
    }
    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      httpStatus: response.status,
      responseHeaders,
      finalUrl: response.url,
    };
  }
}
