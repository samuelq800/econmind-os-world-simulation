import { createHash } from 'node:crypto';
import {
  authorizeOfficeCapability,
  createOpeningSeed,
  createOpeningSource,
  parseCanonicalCommand,
  worldId,
  type CanonicalCommand,
} from '@econmind/core';
import { PostgresNarrowTransferIntake } from '../../apps/world-worker/src/intake/postgres-narrow-transfer-intake.js';
import { NarrowTransferApprovalStore } from '../../apps/world-worker/src/persistence/narrow-transfer-approval-store.js';
import { WorldOpeningBootstrapReadback } from '../../apps/world-worker/src/persistence/world-opening-bootstrap-readback.js';
import type { SqlDatabase } from '../../apps/world-worker/src/persistence/sql-database.js';
import { createIsolatedFinancialRuntimeComposition } from '../../apps/world-worker/src/preparation/isolated-financial-runtime-composition.js';
import { createV10TwoCountryTestFixture } from './v10-two-country-fixture.js';

export const C_ISOLATED_AT = '2026-10-07T00:00:00.000Z';
export const cIsolatedHash = (value: string) =>
  createHash('sha256').update(value).digest('hex');

/** Synthetic amounts and identities; never a 70-country or admin fixture. */
export async function createCIsolatedFinancialFixture(
  database: SqlDatabase,
  suffix: string,
) {
  const original = createV10TwoCountryTestFixture();
  const world = worldId(`WORLD_C_ISOLATED_${suffix}`);
  const source = original.openingSeed.sources[0]!;
  // The store forbids TEST_FIXTURE. Use an explicit documented test assumption,
  // not a forged AUTHORITATIVE_DATASET / actual Owner adoption provenance.
  const documentedSource = createOpeningSource(
    {
      ...source,
      sourceKind: 'DOCUMENTED_ASSUMPTION',
      locator: 'tests/support/c-isolated-financial-fixture.ts#TEST_ONLY',
      payload: {
        status: 'TEST_ONLY_NON_AUTHORITATIVE',
        worldId: world,
        productionFallback: false,
        originalFixture: original.fixtureVersion,
      },
    },
    cIsolatedHash,
  );
  const seed = createOpeningSeed(
    {
      ...original.openingSeed,
      seedId: `SEED_C_ISOLATED_${suffix}` as typeof original.openingSeed.seedId,
      worldId: world,
      sources: [documentedSource],
      inventoryEntries: original.openingSeed.inventoryEntries.map((entry) => ({
        ...entry,
        account: { ...entry.account, worldId: world },
      })),
      financialBatches: original.openingSeed.financialBatches.map((batch) => ({
        ...batch,
        legs: batch.legs.map((leg) => ({
          ...leg,
          account: { ...leg.account, worldId: world },
        })),
      })),
    },
    cIsolatedHash,
  );
  await database.query(
    'insert into world_v2.world_head (world_id) values ($1)',
    [world],
  );
  const openingStore = new WorldOpeningBootstrapReadback({
    database,
    sha256Hex: cIsolatedHash,
  });
  const openingReadback = await openingStore.bootstrapAndReadback({
    seed,
    bootstrappedAtReal: C_ISOLATED_AT,
  });
  for (const actor of Object.values(original.officeActors)) {
    await database.query(
      `insert into world_v2.current_commit_authorization
       (world_id,auth_subject,country_id,office_id,capability,team_id,
        authorization_version,active,refreshed_at_real)
       values ($1,$2::uuid,$3,$4,$5,$6,$7,true,$8::timestamptz)`,
      [
        world,
        actor.principal.authSubject,
        actor.membership.countryId,
        actor.officeId,
        actor.capability,
        actor.membership.teamId,
        actor.membership.authorizationVersion,
        C_ISOLATED_AT,
      ],
    );
  }
  const seller = original.officeActors.sellerTrade;
  const asset = original.inventoryAccounts.sellerAvailable;
  const transfer = parseCanonicalCommand(
    {
      schemaVersion: original.command.schemaVersion,
      commandId: `COMMAND_C_TRANSFER_${suffix}`,
      commandType: 'CORE_GOODS_TRANSFER_V1',
      idempotencyKey: `KEY_C_TRANSFER_${suffix}`,
      worldId: world,
      actorId: seller.actorId,
      authSubject: seller.principal.authSubject,
      countryId: original.countries.seller,
      officeId: 'TRADE',
      expectedWorldVersion: '0',
      simTime: '10000',
      submittedAtReal: C_ISOLATED_AT,
      correlationId: `CORRELATION_C_${suffix}`,
      payload: {
        schemaVersion: 'core-goods-transfer-v1',
        commodityId: 'GRAIN',
        sellerCountryId: original.countries.seller,
        buyerCountryId: original.countries.buyer,
        quantity: { amount: '2', unit: 'tonne' },
        price: { amount: '3', currency: 'GCU', perUnit: 'tonne' },
        assetSource: {
          batchId: asset.batchId,
          physicalLocationId: asset.physicalLocationId,
          titleHolderId: asset.titleHolderId,
          riskBearerId: asset.riskBearerId,
          economicRecognitionId: asset.economicRecognitionId,
        },
        paymentSource: 'BUYER_TREASURY_GCU',
        policyVersion: 'V10_TREASURY_GCU_V1',
        threshold: {
          policyVersion: 'V10_TREASURY_GCU_THRESHOLD_V1',
          maxSettlement: { amount: '6', currency: 'GCU' },
        },
        expiresAtReal: '2026-10-07T00:10:00.000Z',
      },
    },
    cIsolatedHash,
  );
  const authorization = await authorizeOfficeCapability({
    principal: seller.principal,
    resolver: {
      resolveCurrentIdentity: async () => seller.principal.authSubject,
      resolveCurrentMembership: async () => ({
        ...seller.membership,
        worldId: world,
      }),
    },
    worldId: world,
    requestedCountryId: transfer.countryId,
    requestedOfficeId: seller.officeId,
    capability: 'TRADE_CONTRACTS',
  });
  const intake = new PostgresNarrowTransferIntake({
    database,
    sha256Hex: cIsolatedHash,
  });
  const intakeInput = {
    command: transfer,
    scope: { actorId: seller.actorId, authorization },
    observedAtReal: '2026-10-07T00:00:04.000Z',
  };
  const approvals = new NarrowTransferApprovalStore({
    database,
    sha256Hex: cIsolatedHash,
  });
  async function approve() {
    await approvals.openSellerOffer({
      command: transfer,
      signer: {
        actorId: seller.actorId,
        authSubject: seller.principal.authSubject,
        signedAtReal: '2026-10-07T00:00:01.000Z',
      },
    });
    for (const key of ['buyerTrade', 'buyerFinance'] as const) {
      const actor = original.officeActors[key];
      await approvals.signBuyerOffice({
        command: transfer,
        office: actor.officeId as 'TRADE' | 'FINANCE',
        signer: {
          actorId: actor.actorId,
          authSubject: actor.principal.authSubject,
          signedAtReal: '2026-10-07T00:00:02.000Z',
        },
      });
    }
  }
  function automatic(
    commandType: string,
    expectedWorldVersion: string,
    simTime: string,
    payload: unknown,
  ) {
    const commandId = `COMMAND_C_${commandType === 'CORE_GOODS_SHIPMENT_V1' ? 'SHIP' : 'DELIVERY'}_${suffix}`;
    const { fingerprint, payloadHash, canonicalPayload, ...identity } =
      transfer;
    void fingerprint;
    void payloadHash;
    void canonicalPayload;
    return parseCanonicalCommand(
      {
        ...identity,
        commandId,
        commandType,
        idempotencyKey: `KEY_${commandId}`,
        officeId: null,
        expectedWorldVersion,
        simTime,
        payload,
      },
      cIsolatedHash,
    );
  }
  const shipmentId = `SHIPMENT_C_${suffix}`;
  const shipment = automatic('CORE_GOODS_SHIPMENT_V1', '1', '10100', {
    schemaVersion: 'core-goods-shipment-v1',
    shipmentId,
    transferCommandId: transfer.commandId,
    transferFingerprint: transfer.fingerprint,
  });
  const destination = original.inventoryAccounts.buyerAvailable;
  const delivery = automatic('CORE_GOODS_DELIVERY_V1', '2', '10200', {
    schemaVersion: 'core-goods-delivery-v1',
    shipmentId,
    transferCommandId: transfer.commandId,
    transferFingerprint: transfer.fingerprint,
    destination: {
      physicalLocationId: destination.physicalLocationId,
      titleHolderId: destination.titleHolderId,
      riskBearerId: destination.riskBearerId,
      economicRecognitionId: destination.economicRecognitionId,
    },
    buyerTreasuryAccountId: original.financialAccounts.buyerTreasury.accountId,
    sellerSettlementAccountId:
      original.financialAccounts.sellerSettlement.accountId,
  });
  // Explicit scheduling fixture ONLY. There is no production system-command
  // producer in this increment. No authoritative events/postings are prefilled.
  async function schedule(command: CanonicalCommand) {
    await database.transaction(async (transaction) => {
      await transaction.query(
        `insert into world_v2.command_submission
        (world_id,command_id,idempotency_key,command_type,schema_version,canonical_payload,
         payload_sha256,command_fingerprint,auth_subject,actor_id,country_id,office_id,
         expected_world_version,sim_time,correlation_id,submitted_at_real)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          world,
          command.commandId,
          command.idempotencyKey,
          command.commandType,
          command.schemaVersion,
          command.canonicalPayload,
          command.payloadHash,
          command.fingerprint,
          command.authSubject,
          command.actorId,
          command.countryId,
          command.officeId,
          command.expectedWorldVersion,
          command.simTime.toCanonicalValue(),
          command.correlationId,
          command.submittedAtReal,
        ],
      );
      await transaction.query(
        `insert into world_v2.command_queue
        (world_id,command_id,authority_kind,available_at_sim_time)
        values ($1,$2,'VERSIONED_AUTOMATIC',$3::bigint)`,
        [world, command.commandId, command.simTime.toCanonicalValue()],
      );
    });
  }
  let simTime = '10000';
  let nowReal = '2026-10-07T00:00:04.000Z';
  const clock = {
    nowReal: () => nowReal,
    simTime: async (requested: string) => {
      if (requested !== world) throw new Error('TEST_CLOCK_WORLD_MISMATCH');
      return simTime;
    },
  };
  const hostInput = {
    database,
    environment: { ECONMIND_ENV: 'local' },
    workerId: `WORKER_C_${suffix}`,
    opening: {
      worldId: world,
      seedId: seed.seedId,
      seedFingerprint: seed.fingerprint,
    },
    sha256Hex: cIsolatedHash,
    clock,
  };
  async function lease(worker = hostInput.workerId, at = nowReal) {
    return database.query(
      'select * from world_v2.acquire_world_writer_lease($1,$2,$3::timestamptz,60000)',
      [world, worker, at],
    );
  }
  return {
    original,
    world,
    seed,
    openingReadback,
    openingStore,
    transfer,
    shipment,
    delivery,
    intake,
    intakeInput,
    approve,
    schedule,
    lease,
    hostInput,
    host: createIsolatedFinancialRuntimeComposition(hostInput),
    setTime: (ticks: string, real = nowReal) => {
      simTime = ticks;
      nowReal = real;
    },
  };
}
