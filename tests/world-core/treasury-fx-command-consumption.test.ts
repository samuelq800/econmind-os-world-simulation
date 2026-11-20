/** Private fixed issuer over protocol transport only. No quote, prepared seed,
 * admission, economic execution, Clock service or native authority is mocked. */
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COMMAND_SCHEMA_VERSION, parseCanonicalCommand } from '@econmind/core';
import { POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND } from '@econmind/core/authenticated-office-command-contract';
import { createTreasuryFxCommandConsumptionPreparation } from '../../apps/world-worker/src/preparation/durable-command-consumption.js';
import {
  createTreasuryFxManualOfficeIntakeRuntime,
  boundManualOfficeIntakeRuntime,
  manualOfficeIntakeRuntimeSupportsFamily,
  preflightManualOfficeIntakeRuntime,
} from '../../apps/world-worker/src/intake/manual-office-intake-runtime.js';
import {
  createManualOfficeCommandComposition,
  manualOfficeCapability,
  type ManualOfficeRuntimeReaders,
} from '../../apps/world-worker/src/preparation/manual-office-command-composition.js';
import {
  createPostwarTreasuryFxRuntimeConnection,
  readPostwarTreasuryFxRuntimeBinding,
  type PostwarTreasuryFxSourceBinding,
} from '../../apps/world-worker/src/runtime-preparation/postwar-treasury-fx-runtime-connection.js';
import { DurableV08LedgerLineageReader } from '../../apps/world-worker/src/persistence/durable-v08-ledger-lineage-reader.js';
import type { SqlDatabase } from '../../apps/world-worker/src/persistence/sql-database.js';
import * as reservation from '../../apps/world-worker/src/preparation/local-narrow-reservation-worker.js';
import * as shipment from '../../apps/world-worker/src/persistence/sql-narrow-treasury-gcu-shipment-preparation-source.js';
import * as delivery from '../../apps/world-worker/src/persistence/sql-narrow-treasury-gcu-delivery-preparation-source.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const at = '2026-10-29T00:00:00.000Z';
let serial = 0;
function command(
  world: string,
  commandType: string,
  officeId: string | null = 'FINANCE',
) {
  return parseCanonicalCommand(
    {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      worldId: world,
      countryId: 'COUNTRY_01',
      commandId: 'COMMAND_TEST_ONLY_HEAD',
      idempotencyKey: 'KEY_TEST_ONLY_HEAD',
      actorId: 'ACTOR_TEST_ONLY',
      authSubject: '11111111-1111-4111-8111-111111111111',
      officeId,
      commandType,
      expectedWorldVersion: '0',
      simTime: '0',
      submittedAtReal: at,
      correlationId: 'CORRELATION_TEST_ONLY',
      payload:
        commandType === POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND
          ? {
              schemaVersion: 'postwar-day-one-treasury-fx-command-v1',
              quoteRef: 'QUOTE_TEST_ONLY',
              payerTreasuryAccountId: 'TGA_TEST_ONLY',
              payerGcuAccountId: 'GOV_GCU_TEST_ONLY',
              dealerGcuAccountId: 'BANK_GCU_TEST_ONLY',
              localAmount: '1.23',
              localCurrency: 'XAA',
              expectedQuoteSha256: '1'.repeat(64),
            }
          : { classification: 'TEST_ONLY_PROTOCOL' },
    },
    sha,
  );
}
function harness(type = 'UNKNOWN_TEST_ONLY') {
  const world = `WORLD_TEST_ONLY_FX_${++serial}`;
  const selected = command(world, type);
  const statements: string[] = [];
  const query = vi.fn(async (sql: string) => {
    statements.push(sql);
    if (sql.includes('from world_v2.command_queue'))
      return {
        rows: [
          {
            command_id: selected.commandId,
            authority_kind: 'DISCRETIONARY_USER',
            queue_state: 'PENDING',
            available_at_sim_time: '0',
            claimed_by: null,
            claim_fencing_token: null,
          },
        ],
        rowCount: 1,
      };
    throw Error('UNEXPECTED_PROTOCOL_SQL:' + sql);
  });
  const database: SqlDatabase = {
    query,
    transaction: async (consume) => consume({ query }),
  };
  const intakePool = {
    connect: vi.fn(async () => {
      throw Error('NO_INTAKE_EXPECTED');
    }),
  };
  const clock = Object.freeze({ nowReal: () => at, simTime: async () => '0' });
  const connection = createPostwarTreasuryFxRuntimeConnection({
    worldId: world,
    workerId: 'WORKER_TEST_ONLY_FX',
    workerDatabase: database,
    workerRole: 'fixture_treasury_fx_worker',
    intakePool,
    clock,
    environment: 'ci',
  });
  const ports = readPostwarTreasuryFxRuntimeBinding(connection);
  vi.spyOn(
    DurableV08LedgerLineageReader.prototype,
    'readCommandFrom',
  ).mockImplementation(async (_executor, actualWorld, id) => {
    expect(actualWorld).toBe(world);
    expect(id).toBe(selected.commandId);
    return selected;
  });
  return {
    connection,
    ports,
    selected,
    statements,
    database,
    intakePool,
    clock,
  };
}
afterEach(() => vi.restoreAllMocks());
describe('fixed genuine Treasury FX durable composition', () => {
  it('rejects forged binding, missing source and the wrong Office without acquiring a connection', () => {
    expect(() =>
      createTreasuryFxCommandConsumptionPreparation(
        {} as PostwarTreasuryFxSourceBinding,
      ),
    ).toThrow();
    expect(() =>
      createTreasuryFxManualOfficeIntakeRuntime(
        {} as PostwarTreasuryFxSourceBinding,
      ),
    ).toThrow();
    const query = vi.fn();
    const c = command(
      'WORLD_TEST_ONLY_ABSENT_FX',
      POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND,
    );
    expect(manualOfficeCapability(c)).toBe('FINANCE_TREASURY');
    expect(
      manualOfficeCapability(command(c.worldId, c.commandType, 'SOCIAL')),
    ).toBe(null);
    expect(
      createManualOfficeCommandComposition({
        command: c,
        database: { query, transaction: vi.fn() },
        workerId: 'WORKER_TEST_ONLY_FX',
        sha256Hex: sha,
        readers: {},
      }),
    ).toBe(null);
    const callerCallback = vi.fn();
    expect(
      createManualOfficeCommandComposition({
        command: c,
        database: { query, transaction: vi.fn() },
        workerId: 'WORKER_TEST_ONLY_FX',
        sha256Hex: sha,
        readers: {
          treasuryFx: {
            candidateFactory: { prepare: callerCallback },
            sourceCommitProtectionPort: { assertCurrentFrom: callerCallback },
            preflightCanonical: callerCallback,
          } as unknown as NonNullable<ManualOfficeRuntimeReaders['treasuryFx']>,
        },
      }),
    ).toBe(null);
    expect(callerCallback).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });
  it('uses one private fixed runtime identity and remains PREPARED before explicit start', async () => {
    const h = harness();
    try {
      expect(() =>
        readPostwarTreasuryFxRuntimeBinding({ ...h.connection }),
      ).toThrow();
      expect(
        boundManualOfficeIntakeRuntime(h.ports.runtime, {
          pool: h.ports.intakePool,
          clock: h.clock,
          worldId: h.selected.worldId,
        }),
      ).toBe(true);
      expect(
        manualOfficeIntakeRuntimeSupportsFamily(
          h.ports.runtime,
          POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND,
        ),
      ).toBe(true);
      expect(
        manualOfficeIntakeRuntimeSupportsFamily(
          h.ports.runtime,
          'CORE_FINANCE_BUDGET_APPROPRIATION_V1',
        ),
      ).toBe(false);
      expect(
        manualOfficeIntakeRuntimeSupportsFamily(
          h.ports.runtime,
          'CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1',
        ),
      ).toBe(false);
      expect(await h.ports.runtime.consumer.consumeOnce()).toMatchObject({
        status: 'BLOCKED',
        reason: 'LIFECYCLE_PREPARED',
      });
      expect(
        await preflightManualOfficeIntakeRuntime(
          h.ports.runtime,
          command(h.selected.worldId, POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND),
          at,
        ),
      ).toBe(false);
      expect(h.statements).toEqual([]);
    } finally {
      await h.connection.stop();
    }
  });
  it.each([
    'UNKNOWN_TEST_ONLY',
    'CORE_GOODS_TRANSFER_V1',
    'CORE_FINANCE_BUDGET_APPROPRIATION_V1',
    'CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1',
  ])(
    'keeps %s at the full World queue head without source reads, claim or writes',
    async (type) => {
      const reserve = vi.spyOn(
        reservation,
        'createLocalNarrowReservationWorker',
      );
      const ship = vi.spyOn(
        shipment,
        'createSqlNarrowTreasuryGcuShipmentCandidateFactory',
      );
      const deliver = vi.spyOn(
        delivery,
        'createSqlNarrowTreasuryGcuDeliveryCandidateFactory',
      );
      const h = harness(type);
      try {
        h.ports.runtime.consumer.startPreparation();
        for (let i = 0; i < 2; i++)
          expect(await h.ports.runtime.consumer.consumeOnce()).toEqual({
            status: 'BLOCKED',
            reason: 'TREASURY_FX_FAMILY_NOT_INSTALLED',
            commandId: h.selected.commandId,
          });
        expect(h.statements).toHaveLength(2);
        for (const sql of h.statements) {
          expect(sql).toContain(
            'order by available_at_sim_time, priority_rank, command_id limit 1',
          );
          expect(sql).not.toMatch(
            /command_type|office_id|skip locked|update|source|authorization|lease/iu,
          );
        }
        expect(reserve).not.toHaveBeenCalled();
        expect(ship).not.toHaveBeenCalled();
        expect(deliver).not.toHaveBeenCalled();
      } finally {
        await h.connection.stop();
      }
    },
  );
});
