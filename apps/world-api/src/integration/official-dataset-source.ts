import { createHash } from 'node:crypto';

import {
  OFFICIAL_COUNTRY_PACKAGE_ID,
  OFFICIAL_COUNTRY_SELECTION_SHA256,
  type OfficialCountrySqlReader,
} from './official-country-baseline.js';
import type { OfficialDatasetSpec } from './official-dataset-registry.js';

export const OFFICIAL_DATASET_SOURCE_QUERY = `
select b.bundle_id, b.package_manifest_sha256, b.source_status,
       b.activation_allowed, a.artifact_path, a.content_sha256, a.content_utf8
from world_v2.country_candidate_bundle as b
join world_v2.country_candidate_artifact as a on a.bundle_id = b.bundle_id
where b.bundle_id = $1
  and (a.artifact_path = $2
    or left(a.artifact_path, length($2) + 5) = $2 || '.part')
order by a.artifact_path
limit 100
`.trim();

const MAX_CHUNK_BYTES = 150_000;
const MAX_SOURCE_BYTES = 9_000_000;
const JSON_NUMBER = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/uy;

export class OfficialDatasetFailure extends Error {
  constructor(readonly code: 'SOURCE_UNAVAILABLE' | 'SOURCE_INVALID') {
    super(code);
  }
}

function invalid(): never {
  throw new OfficialDatasetFailure('SOURCE_INVALID');
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return invalid();
  return value as Record<string, unknown>;
}

/** Only data number tokens are quoted. Numbers inside source strings are left
 * untouched; parsing then preserves exact decimals without JS float coercion. */
export function parseLosslessOfficialJson(content: string): unknown {
  const segments: string[] = [];
  let start = 0;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') {
      quoted = true;
      continue;
    }
    if (
      character !== '-' &&
      (character === undefined || character < '0' || character > '9')
    )
      continue;
    JSON_NUMBER.lastIndex = index;
    const match = JSON_NUMBER.exec(content);
    if (match === null) continue;
    segments.push(content.slice(start, index), '"', match[0], '"');
    index = JSON_NUMBER.lastIndex - 1;
    start = JSON_NUMBER.lastIndex;
  }
  segments.push(content.slice(start));
  return JSON.parse(segments.join(''));
}

/** Reconstructs exact UTF-8 chunks under the selected bundle only. The
 * source's historical candidate status remains unchanged and non-runtime. */
export async function readOfficialDatasetSource(
  reader: OfficialCountrySqlReader,
  spec: OfficialDatasetSpec,
): Promise<unknown> {
  let rows: readonly unknown[];
  try {
    const result = await reader.query(OFFICIAL_DATASET_SOURCE_QUERY, [
      OFFICIAL_COUNTRY_PACKAGE_ID,
      spec.storagePath,
    ]);
    rows = result.rows;
  } catch {
    throw new OfficialDatasetFailure('SOURCE_UNAVAILABLE');
  }
  if (!Array.isArray(rows) || rows.length === 0)
    throw new OfficialDatasetFailure('SOURCE_UNAVAILABLE');
  if (rows.length >= 100) invalid();
  const parts: string[] = [];
  for (const [index, value] of rows.entries()) {
    const row = record(value);
    const expectedPath =
      rows.length === 1 && row.artifact_path === spec.storagePath
        ? spec.storagePath
        : `${spec.storagePath}.part${String(index + 1).padStart(4, '0')}`;
    if (
      row.bundle_id !== OFFICIAL_COUNTRY_PACKAGE_ID ||
      row.package_manifest_sha256 !== OFFICIAL_COUNTRY_SELECTION_SHA256 ||
      row.source_status !== 'IMPLEMENTED_UNVERIFIED_CANDIDATE' ||
      row.activation_allowed !== false ||
      row.artifact_path !== expectedPath ||
      typeof row.content_utf8 !== 'string' ||
      typeof row.content_sha256 !== 'string' ||
      Buffer.byteLength(row.content_utf8, 'utf8') > MAX_CHUNK_BYTES ||
      createHash('sha256').update(row.content_utf8, 'utf8').digest('hex') !==
        row.content_sha256
    )
      invalid();
    parts.push(row.content_utf8);
  }
  const content = parts.join('');
  if (
    Buffer.byteLength(content, 'utf8') !== spec.bytes ||
    spec.bytes > MAX_SOURCE_BYTES ||
    createHash('sha256').update(content, 'utf8').digest('hex') !== spec.sha256
  )
    invalid();
  let parsed: unknown;
  try {
    parsed = parseLosslessOfficialJson(content);
  } catch {
    invalid();
  }
  if (
    (spec.kind === 'ARRAY' && !Array.isArray(parsed)) ||
    (spec.kind !== 'ARRAY' &&
      (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)))
  )
    invalid();
  return parsed;
}
