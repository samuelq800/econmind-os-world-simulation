import { setTimeout as delay } from 'node:timers/promises';

import type { PostwarOfficeRuntimeServiceResponse } from './postwar-office-runtime-read-service.js';

const unpublishedErrors = new Map([
  ['CURRENT_FINANCIAL_NOT_PUBLISHED', 'CURRENT_FINANCIAL_UNAVAILABLE'],
  ['CURRENT_SOCIAL_NOT_PUBLISHED', 'CURRENT_SOCIAL_UNAVAILABLE'],
  [
    'CURRENT_INDUSTRY_LABOUR_NOT_PUBLISHED',
    'CURRENT_INDUSTRY_LABOUR_UNAVAILABLE',
  ],
]);

/** Each attempt reauthenticates and reads a fresh snapshot. Wait only after
 * releasing that snapshot; never retry economic commands or rejected sources. */
export async function readAfterCurrentPublication(
  read: () => Promise<PostwarOfficeRuntimeServiceResponse>,
  signal?: AbortSignal,
): Promise<PostwarOfficeRuntimeServiceResponse> {
  let result = await read();
  // A new global head can supersede a short publication window. Cap the gaps
  // to observe those windows, with six reads and 3.25s total waiting within
  // the original 3.5s budget. Each probe still authenticates afresh.
  for (const waitMs of [500, 500, 750, 750, 750]) {
    if (
      signal?.aborted ||
      result.body.ok ||
      result.httpStatus !== 503 ||
      !unpublishedErrors.has(result.body.error.code)
    )
      break;
    try {
      await delay(waitMs, undefined, { signal });
    } catch (error) {
      if (!signal?.aborted) throw error;
      break;
    }
    result = await read();
  }
  if (signal?.aborted)
    return {
      httpStatus: 499,
      body: {
        schemaVersion: result.body.schemaVersion,
        requestId: result.body.requestId,
        ok: false,
        error: { code: 'CANCELLED', retryable: false },
      },
    };
  if (!result.body.ok) {
    const code = unpublishedErrors.get(result.body.error.code);
    if (code)
      return {
        ...result,
        body: { ...result.body, error: { code, retryable: false } },
      };
  }
  return result;
}
