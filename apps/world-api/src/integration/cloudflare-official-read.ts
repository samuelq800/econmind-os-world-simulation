import { createOfficialEdgeFetchHandler } from './official-edge-fetch-adapter.js';
import { createOfficialSourceSnapshotReader } from './official-source-snapshot-reader.js';

type SourceTransport = (url: string, init: RequestInit) => Promise<Response>;

/** Workers rejects redirect:"error" before making a request. Manual mode lets
 * the existing snapshot loader reject every 3xx without following it. All
 * source identity, byte/hash checks and read-only routes remain in that loader.
 */
export function createCloudflareOfficialReadHandler(
  transport: SourceTransport = (url, init) => fetch(url, init),
): (request: Request) => Promise<Response> {
  const reader = createOfficialSourceSnapshotReader((url, init) =>
    transport(url, { ...init, redirect: 'manual' }),
  );
  const handle = createOfficialEdgeFetchHandler({
    reader,
    allowedOrigins: [
      'https://samuelq800.github.io',
      'https://world.econmind.group',
    ],
  });
  return async (request) => {
    const response = await handle(request);
    response.headers.set(
      'x-world-source-transport',
      'HASH_PINNED_IMMUTABLE_SOURCE_SNAPSHOT',
    );
    return response;
  };
}

export default { fetch: createCloudflareOfficialReadHandler() };
