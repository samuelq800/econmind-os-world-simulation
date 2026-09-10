import { sha256Bytes } from './canonical.js';
import type {
  RawSnapshotMetadata,
  SnapshotTransport,
  SourceRequest,
} from './types.js';

export interface SnapshotInput {
  readonly snapshotId: string;
  readonly retrievedAt: string;
  readonly sourceAsOf: string | null;
  readonly providerVersion: string | null;
  readonly status: RawSnapshotMetadata['status'];
}

export function createSnapshotMetadata(
  request: SourceRequest,
  bytes: Uint8Array,
  input: SnapshotInput,
): RawSnapshotMetadata {
  return Object.freeze({
    schemaVersion: 'raw-snapshot.v1',
    snapshotId: input.snapshotId,
    sourceId: request.sourceId,
    retrievedAt: input.retrievedAt,
    sourceAsOf: input.sourceAsOf,
    query: request.url,
    requestParameters: Object.freeze({ ...request.parameters }),
    providerVersion: input.providerVersion,
    fileFormat: request.expectedFormat,
    sha256: sha256Bytes(bytes),
    byteLength: bytes.byteLength,
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
  input: SnapshotInput,
): Promise<Readonly<{ bytes: Uint8Array; metadata: RawSnapshotMetadata }>> {
  const bytes = await transport.retrieve(request);
  return Object.freeze({
    bytes,
    metadata: createSnapshotMetadata(request, bytes, input),
  });
}

export class FixtureTransport implements SnapshotTransport {
  public constructor(
    private readonly fixtures: Readonly<Record<string, Uint8Array>>,
  ) {}

  public async retrieve(request: SourceRequest): Promise<Uint8Array> {
    const bytes = this.fixtures[request.sourceId];
    if (bytes === undefined)
      throw new Error(`No fixture for ${request.sourceId}`);
    return Promise.resolve(bytes.slice());
  }
}
