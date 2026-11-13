import { AUTHENTICATED_CURRENT_SEAT_PATH } from '@econmind/core';
import { createCurrentSeatFetchHandler } from '../runtime-preparation/current-seat-fetch-handler.js';
import {
  createTradeContractRuntimeFetchHandler,
  TRADE_CONTRACT_RUNTIME_READ_PATH,
} from '../runtime-preparation/trade-contract-runtime-fetch-handler.js';
import {
  explicitReadConfig,
  type ExplicitReadPreparationConfig,
} from '../runtime-preparation/explicit-read-preparation-config.js';

export interface NonactivatedRuntimeReadFetchHostConfig {
  readonly read: ExplicitReadPreparationConfig | null;
  /** Server-composed opt-in only; not readiness, admission or a client flag. */
  readonly tradeEvidenceEnabled?: boolean;
}

/** Explicit executable Fetch mux for authenticated read paths. Production
 * HOLD/Cloudflare entrypoints are unchanged. Defaults stay closed with zero IO;
 * the host neither creates/ends pools nor obtains secrets or starts World. */
export function createNonactivatedRuntimeReadFetchHost(
  input: NonactivatedRuntimeReadFetchHostConfig | null = null,
) {
  if (
    input?.tradeEvidenceEnabled !== undefined &&
    typeof input.tradeEvidenceEnabled !== 'boolean'
  )
    throw new TypeError('TRADE_READ_OPT_IN_INVALID');
  const read = explicitReadConfig(input?.read ?? null);
  if (
    read &&
    [
      read.endpointPins.projectionPath,
      read.endpointPins.finalLookupPath,
    ].includes(TRADE_CONTRACT_RUNTIME_READ_PATH)
  )
    throw new TypeError('TRADE_READ_ROUTE_COLLISION');
  const seat = createCurrentSeatFetchHandler(read);
  const trade = createTradeContractRuntimeFetchHandler(
    input?.tradeEvidenceEnabled === true ? read : null,
  );
  return Object.freeze({
    simulationEnabled: false as const,
    workerActivationAllowed: false as const,
    clockActivationAllowed: false as const,
    /** Null preserves the caller's public/health/404 router. No dynamic path dispatch. */
    async fetch(request: Request): Promise<Response | null> {
      const path = new URL(request.url).pathname;
      if (path === AUTHENTICATED_CURRENT_SEAT_PATH) return seat(request);
      if (path === TRADE_CONTRACT_RUNTIME_READ_PATH) return trade(request);
      return null;
    },
  });
}
