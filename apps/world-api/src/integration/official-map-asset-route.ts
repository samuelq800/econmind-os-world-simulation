import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  OFFICIAL_MAP_ASSETS,
  OFFICIAL_MAP_MANIFEST_SHA256,
  OFFICIAL_MAP_PACKAGE_ID,
} from './generated/official-map-catalog.js';

export const OFFICIAL_MAP_ASSET_LIST_PATH = '/v1/world-data/map-assets';
const COUNTRY_ID = /^visual-territory-(?:0[1-9]|[1-6][0-9]|70)$/u;
const INTEGER = /^(?:0|[1-9][0-9]{0,5})$/u;

function integer(
  value: string | null,
  fallback: number,
  max: number,
): number | null {
  if (value === null) return fallback;
  if (!INTEGER.test(value)) return null;
  const number = Number(value);
  return number <= max ? number : null;
}

function send(
  response: ServerResponse,
  status: number,
  body: object,
  head: boolean,
) {
  if (response.destroyed) return;
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'x-content-type-options': 'nosniff',
  });
  response.end(head ? undefined : payload);
}

/** Metadata only. E/D own static publication and its URL binding; no binary
 * file, repository path selector, database blob or World-state claim here. */
export function createOfficialMapAssetRoute() {
  return (request: IncomingMessage, response: ServerResponse): void => {
    const head = request.method === 'HEAD';
    if (request.method !== 'GET' && !head) {
      response.setHeader('allow', 'GET, HEAD');
      send(
        response,
        405,
        { ok: false, error: { code: 'METHOD_NOT_ALLOWED' } },
        false,
      );
      return;
    }
    if (
      request.url?.split('?', 1)[0] !== OFFICIAL_MAP_ASSET_LIST_PATH ||
      request.headers['transfer-encoding'] !== undefined ||
      (request.headers['content-length'] !== undefined &&
        request.headers['content-length'] !== '0')
    ) {
      request.resume();
      send(
        response,
        400,
        { ok: false, error: { code: 'PARAMETERS_NOT_ALLOWED' } },
        head,
      );
      return;
    }
    let params: URLSearchParams;
    try {
      params = new URL(request.url, 'http://world-api.invalid').searchParams;
    } catch {
      send(
        response,
        400,
        { ok: false, error: { code: 'PARAMETERS_NOT_ALLOWED' } },
        head,
      );
      return;
    }
    const keys = [...params.keys()];
    const offset = integer(params.get('offset'), 0, 1_000_000);
    const limit = integer(params.get('limit'), 50, 50);
    const countryId = params.get('countryId');
    if (
      new Set(keys).size !== keys.length ||
      keys.some((key) => !['offset', 'limit', 'countryId'].includes(key)) ||
      offset === null ||
      limit === null ||
      limit < 1 ||
      (countryId !== null && !COUNTRY_ID.test(countryId))
    ) {
      send(
        response,
        400,
        { ok: false, error: { code: 'PARAMETERS_NOT_ALLOWED' } },
        head,
      );
      return;
    }
    const assets =
      countryId === null
        ? OFFICIAL_MAP_ASSETS
        : OFFICIAL_MAP_ASSETS.filter(
            (asset) => asset.sourceCountryId === countryId,
          );
    const page = assets.slice(offset, offset + limit);
    send(
      response,
      200,
      {
        ok: true,
        schemaVersion: 'official-map-asset-catalog-v1',
        dataNature: 'OFFICIAL_VERSIONED_MAP_ASSETS',
        packageId: OFFICIAL_MAP_PACKAGE_ID,
        manifestSha256: OFFICIAL_MAP_MANIFEST_SHA256,
        totalPackageFiles: 203,
        imageFiles: 160,
        countryAssociatedFiles: 140,
        globalOrSupportFiles: 63,
        repositoryOriginalVerified: true,
        staticPublicationStatus: 'NOT_VERIFIED',
        productionDatabaseStorageStatus: 'NOT_CLAIMED',
        liveWorldState: false,
        countryId,
        total: assets.length,
        offset,
        returned: page.length,
        nextOffset:
          offset + page.length < assets.length ? offset + page.length : null,
        assets: page.map((asset) => ({ ...asset, publicUrl: null })),
      },
      head,
    );
  };
}
