import { createOfficialEdgeFetchHandler } from './lib/official-edge-fetch-adapter.js';
import { createOfficialSourceSnapshotReader } from './lib/official-source-snapshot-reader.js';

// Forward candidate only: immutable selected-source snapshot, not a live DB
// projection. No environment, password, admin/service-role or browser key.
// The old DB publisher remains HOLD and its guards are not bypassed.
// Exact HTTPS publication origins only. HTTP/custom-domain aliases do not gain
// browser read access; no credentials or arbitrary Origin reflection are used.
const allowedOrigins = [
  'https://samuelq800.github.io',
  'https://world.econmind.group',
];
const reader = createOfficialSourceSnapshotReader();
const handle = createOfficialEdgeFetchHandler({ reader, allowedOrigins });

export default {
  async fetch(request: Request) {
    const response = await handle(request);
    response.headers.set(
      'x-world-source-transport',
      'HASH_PINNED_IMMUTABLE_SOURCE_SNAPSHOT',
    );
    return response;
  },
};
