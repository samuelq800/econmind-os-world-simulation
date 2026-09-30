import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  OFFICIAL_COUNTRY_LIST_PATH,
  createOfficialCountryBaselineRoute,
  type OfficialCountrySqlReader,
} from './official-country-baseline.js';
import {
  OFFICIAL_DATASET_LIST_PATH,
  createOfficialDatasetRoute,
} from './official-dataset-route.js';
import {
  OFFICIAL_MAP_ASSET_LIST_PATH,
  createOfficialMapAssetRoute,
} from './official-map-asset-route.js';
import { handleOfficialPublicCors } from './official-public-cors.js';

export const OFFICIAL_EDGE_FUNCTION_NAME = 'world-v2-official-read';
export const OFFICIAL_EDGE_FUNCTION_PREFIX = `/functions/v1/${OFFICIAL_EDGE_FUNCTION_NAME}`;
export const OFFICIAL_EDGE_INTERNAL_PREFIX = `/${OFFICIAL_EDGE_FUNCTION_NAME}`;

type NodeReadRoute = (
  request: IncomingMessage,
  response: ServerResponse,
) => Promise<void> | void;

function jsonError(status: number, code: string, method: string): Response {
  const payload = JSON.stringify({ ok: false, error: { code } });
  return new Response(method === 'HEAD' ? null : payload, {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
      'x-content-type-options': 'nosniff',
    },
  });
}

/** Converts only the tiny IncomingMessage/ServerResponse surface used by the
 * existing public source handlers. Their whitelist, validation, decimal
 * encoding and response limits remain the sole contract implementation. */
async function runNodeReadRoute(
  route: NodeReadRoute,
  webRequest: Request,
  pathAndSearch: string,
  allowedOrigins: readonly string[],
): Promise<Response> {
  const headers: Record<string, string> = {};
  webRequest.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const request = {
    method: webRequest.method,
    url: pathAndSearch,
    headers,
    resume: () => undefined,
  } as unknown as IncomingMessage;
  const responseHeaders = new Headers();
  let status = 200;
  let body: string | undefined;
  let ended = false;
  let sent = false;
  const response = {
    destroyed: false,
    get headersSent() {
      return sent;
    },
    setHeader(name: string, value: string) {
      responseHeaders.set(name, value);
      return this;
    },
    writeHead(code: number, outgoing?: Record<string, string | number>) {
      status = code;
      sent = true;
      for (const [name, value] of Object.entries(outgoing ?? {}))
        responseHeaders.set(name, String(value));
      return this;
    },
    end(payload?: string) {
      body = payload;
      ended = true;
      return this;
    },
  } as unknown as ServerResponse;
  try {
    if (handleOfficialPublicCors(request, response, allowedOrigins)) {
      // A successful or rejected preflight never reaches a source route.
    } else {
      await route(request, response);
    }
  } catch {
    if (!sent) return jsonError(503, 'SOURCE_UNAVAILABLE', webRequest.method);
  }
  if (!ended) return jsonError(503, 'SOURCE_UNAVAILABLE', webRequest.method);
  return new Response(
    webRequest.method === 'HEAD' || status === 204 || status === 304
      ? null
      : (body ?? null),
    { status, headers: responseHeaders },
  );
}

/** Only the frozen country, 34-dataset and metadata-only map routes exist.
 * No Command, receipt, arbitrary SQL, table, World or worker route is mapped. */
export function createOfficialEdgeFetchHandler(input: {
  readonly reader: OfficialCountrySqlReader;
  readonly allowedOrigins: readonly string[];
}): (request: Request) => Promise<Response> {
  const countries = createOfficialCountryBaselineRoute(input.reader);
  const datasets = createOfficialDatasetRoute(input.reader);
  const mapAssets = createOfficialMapAssetRoute();
  return async (request) => {
    if (request.url.length > 2_048)
      return jsonError(414, 'REQUEST_URI_TOO_LONG', request.method);
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return jsonError(400, 'PARAMETERS_NOT_ALLOWED', request.method);
    }
    const prefix = [
      OFFICIAL_EDGE_FUNCTION_PREFIX,
      OFFICIAL_EDGE_INTERNAL_PREFIX,
    ].find((candidate) => url.pathname.startsWith(`${candidate}/`));
    if (
      prefix === undefined ||
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method)
    ) {
      return jsonError(
        !['GET', 'HEAD', 'OPTIONS'].includes(request.method) ? 405 : 404,
        !['GET', 'HEAD', 'OPTIONS'].includes(request.method)
          ? 'METHOD_NOT_ALLOWED'
          : 'NOT_FOUND',
        request.method,
      );
    }
    const path = url.pathname.slice(prefix.length);
    const route =
      path === OFFICIAL_MAP_ASSET_LIST_PATH
        ? mapAssets
        : path === OFFICIAL_DATASET_LIST_PATH ||
            path.startsWith(`${OFFICIAL_DATASET_LIST_PATH}/`)
          ? datasets
          : path === OFFICIAL_COUNTRY_LIST_PATH ||
              path.startsWith(`${OFFICIAL_COUNTRY_LIST_PATH}/`)
            ? countries
            : undefined;
    if (route === undefined) return jsonError(404, 'NOT_FOUND', request.method);
    return runNodeReadRoute(
      route,
      request,
      `${path}${url.search}`,
      input.allowedOrigins,
    );
  };
}
