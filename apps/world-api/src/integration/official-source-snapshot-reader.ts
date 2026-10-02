import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

import {
  OFFICIAL_COUNTRY_PACKAGE_ID,
  OFFICIAL_COUNTRY_SELECTION_SHA256,
  OFFICIAL_COUNTRY_SOURCE_QUERY,
  OFFICIAL_COUNTRY_SOURCE_STORAGE_PATH,
  type OfficialCountrySqlReader,
} from './official-country-baseline.js';
import { OFFICIAL_DATASETS } from './official-dataset-registry.js';
import { OFFICIAL_DATASET_SOURCE_QUERY } from './official-dataset-source.js';

export const OFFICIAL_SOURCE_BUCKET = 'world-v2-official-source-v1';
export const OFFICIAL_SOURCE_PUBLIC_BASE = `https://vimksjrhaxdpnkvgsavz.supabase.co/storage/v1/object/public/${OFFICIAL_SOURCE_BUCKET}/${OFFICIAL_COUNTRY_SELECTION_SHA256}`;
const MAX_PART_BYTES = 150_000;
const MAX_SOURCE_BYTES = 9_000_000;
type SnapshotFetch = (url: string, init: RequestInit) => Promise<Response>;

function splitUtf8(content: string): string[] {
  const parts: string[] = [];
  let current: string[] = [];
  let bytes = 0;
  for (const character of content) {
    const size = Buffer.byteLength(character, 'utf8');
    if (bytes + size > MAX_PART_BYTES) {
      parts.push(current.join(''));
      current = [];
      bytes = 0;
    }
    current.push(character);
    bytes += size;
  }
  if (current.length > 0) parts.push(current.join(''));
  return parts;
}

/** Server-only adapter for an exact selected-source copy, not a database or
 * live World projection. The old fixed-query interface is reused solely to
 * retain existing DTO/hash/decimal validation; no SQL is executed here. */
export function createOfficialSourceSnapshotReader(
  fetchSource: SnapshotFetch = (url, init) => fetch(url, init),
): OfficialCountrySqlReader {
  return {
    async query(text, values) {
      const spec = OFFICIAL_DATASETS.find(
        (candidate) => candidate.storagePath === values[1],
      );
      const country =
        text === OFFICIAL_COUNTRY_SOURCE_QUERY &&
        values[1] === OFFICIAL_COUNTRY_SOURCE_STORAGE_PATH;
      if (
        values.length !== 2 ||
        values[0] !== OFFICIAL_COUNTRY_PACKAGE_ID ||
        spec === undefined ||
        (!country && text !== OFFICIAL_DATASET_SOURCE_QUERY) ||
        spec.bytes < 1 ||
        spec.bytes > MAX_SOURCE_BYTES
      )
        throw new Error('OFFICIAL_SOURCE_FIXED_QUERY_REQUIRED');
      const response = await fetchSource(
        `${OFFICIAL_SOURCE_PUBLIC_BASE}/${spec.sha256}.json`,
        {
          method: 'GET',
          redirect: 'error',
          credentials: 'omit',
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(5_000),
        },
      );
      if (
        response.status !== 200 ||
        response.body === null ||
        response.redirected ||
        response.headers
          .get('content-type')
          ?.split(';')[0]
          ?.trim()
          .toLowerCase() !== 'application/json'
      )
        throw new Error('OFFICIAL_SOURCE_SNAPSHOT_UNAVAILABLE');
      const stream = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        for (;;) {
          const { done, value } = await stream.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > spec.bytes)
            throw new Error('OFFICIAL_SOURCE_SNAPSHOT_INVALID');
          chunks.push(value);
        }
      } finally {
        await stream.cancel().catch(() => undefined);
        stream.releaseLock();
      }
      const raw = Buffer.concat(chunks);
      if (
        bytes !== spec.bytes ||
        createHash('sha256').update(raw).digest('hex') !== spec.sha256
      )
        throw new Error('OFFICIAL_SOURCE_SNAPSHOT_INVALID');
      const content = new TextDecoder('utf-8', { fatal: true }).decode(raw);
      const parts = country ? [content] : splitUtf8(content);
      return {
        rows: parts.map((part, index) => ({
          bundle_id: OFFICIAL_COUNTRY_PACKAGE_ID,
          package_manifest_sha256: OFFICIAL_COUNTRY_SELECTION_SHA256,
          source_status: 'IMPLEMENTED_UNVERIFIED_CANDIDATE',
          activation_allowed: false,
          artifact_path:
            parts.length === 1
              ? spec.storagePath
              : `${spec.storagePath}.part${String(index + 1).padStart(4, '0')}`,
          content_sha256: createHash('sha256')
            .update(part, 'utf8')
            .digest('hex'),
          content_utf8: part,
        })),
      };
    },
  };
}
