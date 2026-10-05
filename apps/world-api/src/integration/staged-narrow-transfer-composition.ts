import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { PostgresNarrowTransferIntake } from '@econmind/world-worker/intake';
import { NarrowTransferApprovalStore } from '@econmind/world-worker/approval-store';
import { createPostgresBuyerFinanceApprovalReader } from './postgres-buyer-finance-approval-reader.js';
import { createStagedTransferHandler } from './staged-narrow-transfer-handler.js';
import {
  createStagedTransferService,
  type StagedTransferServiceInput,
} from './staged-narrow-transfer-service.js';
import { createLocalNonproductionWorldHttpBridge } from './local-nonproduction-http-bridge.js';
import type { JwtSignatureVerifier } from './identity.js';
import type { ParameterizedPgReadExecutor } from './postgres-read-adapter.js';
import type { AuthenticatedWorldReadPolicy } from './authenticated-read-boundary.js';
import { createAuthenticatedWorldReadQueryHandler } from './authenticated-read-query-handler.js';
import { createAuthenticatedFinalReceiptQueryHandler } from './authenticated-final-receipt-query-handler.js';

/** Opt-in local/CI composition. SQL authority, verified JWT, actor directory
 * and clocks are server-owned, never deserialized from HTTP. No settlement. */
export function createLocalStagedNarrowTransferBridge(input: {
  readonly database: ConstructorParameters<
    typeof PostgresNarrowTransferIntake
  >[0]['database'];
  readonly approvalPool: Pick<Pool, 'query'>;
  readonly environment: NodeJS.ProcessEnv;
  readonly verifier: JwtSignatureVerifier;
  readonly expectedIssuer: string;
  readonly expectedAudience: string;
  readonly resolveActorId: StagedTransferServiceInput['resolveActorId'];
  readonly clock: StagedTransferServiceInput['clock'];
  readonly allowedBrowserOrigin?: string;
  /** Existing authenticated query boundaries; omission keeps routes unavailable. */
  readonly queries?: {
    readonly executor: ParameterizedPgReadExecutor;
    readonly policy: AuthenticatedWorldReadPolicy;
  };
}) {
  const sha256Hex = (text: string) =>
    createHash('sha256').update(text).digest('hex');
  const database = input.database;
  const service = createStagedTransferService({
    database,
    intake: new PostgresNarrowTransferIntake({ database, sha256Hex }),
    approvals: new NarrowTransferApprovalStore({ database, sha256Hex }),
    approvalReader: createPostgresBuyerFinanceApprovalReader({
      pool: input.approvalPool,
    }),
    sha256Hex,
    resolveActorId: input.resolveActorId,
    clock: input.clock,
  });
  return createLocalNonproductionWorldHttpBridge({
    environment: input.environment,
    ...(input.queries === undefined
      ? {}
      : {
          readHandler: createAuthenticatedWorldReadQueryHandler({
            ...input.queries,
            verifier: input.verifier,
          }),
          receiptHandler: createAuthenticatedFinalReceiptQueryHandler({
            executor: input.queries.executor,
            policy: input.queries.policy.jwt,
            verifier: input.verifier,
          }),
        }),
    ...(input.allowedBrowserOrigin === undefined
      ? {}
      : { allowedBrowserOrigin: input.allowedBrowserOrigin }),
    stagedHandler: createStagedTransferHandler({
      service,
      verifier: input.verifier,
      expectedIssuer: input.expectedIssuer,
      expectedAudience: input.expectedAudience,
      nowEpochSeconds: () =>
        Math.floor(Date.parse(input.clock.nowReal()) / 1000),
    }),
  });
}
