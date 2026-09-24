import {
  createAuthenticatedNarrowTransferCommandHandler,
  type BuyerFinanceApprovalReader,
  type CurrentCommandScopeReader,
  type DurableNarrowTransferReceiptPort,
} from './authenticated-narrow-transfer-command-handler.js';
import { createAuthenticatedFinalReceiptQueryHandler } from './authenticated-final-receipt-query-handler.js';
import { createAuthenticatedWorldReadQueryHandler } from './authenticated-read-query-handler.js';
import type { AuthenticatedWorldReadPolicy } from './authenticated-read-boundary.js';
import type { JwtSignatureVerifier } from './identity.js';
import {
  createLocalNonproductionWorldHttpBridge,
  type LocalNonproductionWorldHttpBridge,
} from './local-nonproduction-http-bridge.js';
import type { ParameterizedPgReadExecutor } from './postgres-read-adapter.js';

export interface LocalAuthenticatedCommandDependencies {
  readonly approvalReader: BuyerFinanceApprovalReader;
  readonly receiptPort: DurableNarrowTransferReceiptPort;
  readonly scopeReader: CurrentCommandScopeReader;
}

/**
 * Wires only locally supplied, server-held dependencies into the existing
 * authenticated handlers. Read and receipt require one verified-JWT and
 * PostgreSQL executor pair. Command stays unavailable unless all three of its
 * server-owned dependencies are supplied; no browser fallback is possible.
 */
export function createLocalNonproductionAuthenticatedWorldHttpBridge(input: {
  readonly allowedBrowserOrigin?: string;
  readonly bindHost?: '127.0.0.1' | 'localhost' | '::1';
  readonly command?: LocalAuthenticatedCommandDependencies;
  readonly environment: NodeJS.ProcessEnv;
  readonly executor: ParameterizedPgReadExecutor;
  readonly policy: AuthenticatedWorldReadPolicy;
  readonly verifier: JwtSignatureVerifier;
}): Readonly<LocalNonproductionWorldHttpBridge> {
  return createLocalNonproductionWorldHttpBridge({
    ...(input.allowedBrowserOrigin === undefined
      ? {}
      : { allowedBrowserOrigin: input.allowedBrowserOrigin }),
    ...(input.bindHost === undefined ? {} : { bindHost: input.bindHost }),
    ...(input.command === undefined
      ? {}
      : {
          commandHandler: createAuthenticatedNarrowTransferCommandHandler({
            approvalReader: input.command.approvalReader,
            policy: input.policy.jwt,
            receiptPort: input.command.receiptPort,
            scopeReader: input.command.scopeReader,
            verifier: input.verifier,
          }),
        }),
    environment: input.environment,
    readHandler: createAuthenticatedWorldReadQueryHandler({
      executor: input.executor,
      policy: input.policy,
      verifier: input.verifier,
    }),
    receiptHandler: createAuthenticatedFinalReceiptQueryHandler({
      executor: input.executor,
      policy: input.policy.jwt,
      verifier: input.verifier,
    }),
  });
}
