/** Transport protocol evidence only. Genuine small Core DATA, mocked SQL header
 * boundary; never native permission/admission/Clock or economic commit evidence. */
import { describe, it, expect } from 'vitest';
import { createBeneficialHousingRentChildCoreFixture } from '../support/beneficial-housing-rent-child-test-only.js';
import {
  prepareBeneficialHousingRentSource,
  consumeBeneficialHousingRentSource,
  retireBeneficialHousingRentSource,
} from '../../apps/world-worker/src/persistence/postwar-beneficial-housing-rent-source.js';
import {
  createPostwarBeneficialHousingRentRuntime,
  readPostwarBeneficialHousingRentSourcePreparation,
  hasPostwarBeneficialHousingRentSourceOwner,
  createPostwarBeneficialHousingRentRuntimeForSharedSource,
} from '../../apps/world-worker/src/persistence/postwar-beneficial-housing-rent-runtime.js';
import { BENEFICIAL_RENT_HEADER_QUERY } from '../../apps/world-worker/src/persistence/postgres-postwar-beneficial-housing-rent-originals.js';
import type {
  SqlDatabase,
  SqlQueryResult,
} from '../../apps/world-worker/src/persistence/sql-database.js';
function setup(
  options: {
    headerGate?: Promise<void>;
    entered?: () => void;
    wrongChild?: boolean;
  } = {},
) {
  const f = createBeneficialHousingRentChildCoreFixture(1);
  const token = prepareBeneficialHousingRentSource({
    parentSeed: f.parent,
    seed: f.seed,
    receipts: f.receipts,
  });
  const data = consumeBeneficialHousingRentSource(token);
  let headers = 0;
  const db: SqlDatabase = {
    async query<Row extends object>(sql: string): Promise<SqlQueryResult<Row>> {
      let rows: object[] = [];
      if (sql.startsWith('select current_user as role_name'))
        rows = [
          {
            role_name: 'fixture_rent_worker',
            rolsuper: false,
            rolbypassrls: false,
            rolcreaterole: false,
            rolcreatedb: false,
            rolreplication: false,
            source_member: true,
            owner_member: false,
            publisher_member: false,
          },
        ];
      else if (sql === BENEFICIAL_RENT_HEADER_QUERY) {
        headers++;
        options.entered?.();
        await options.headerGate;
        rows = [
          {
            world_id: data.worldId,
            seed_id: data.seedId,
            seed_fingerprint: options.wrongChild
              ? data.parentSeedFingerprint
              : data.seedFingerprint,
            parent_seed_fingerprint: data.parentSeedFingerprint,
            canonical_seed_sha256: data.canonicalSeedSha256,
            bundle_sha256: data.bundleSha256,
          },
        ];
      } else if (!sql.startsWith('set local role '))
        throw Error('Unexpected protocol SQL: ' + sql);
      return { rowCount: rows.length, rows: rows as Row[] };
    },
    async transaction(consume) {
      return consume(db);
    },
  };
  const config = {
    database: db,
    worldId: f.seed.worldId,
    workerId: 'WORKER_TEST_ONLY_VERIFIED_RENT',
    workerRole: 'fixture_rent_worker',
    environment: 'ci' as const,
    clock: {
      nowReal: () => '2026-11-01T00:00:00.000Z',
      simTime: async () => '0',
    },
    clockBindingRef: 'TEST_ONLY_NO_DUE_PUBLICATION',
  };
  return {
    token,
    data,
    config,
    get headers() {
      return headers;
    },
  };
}
describe('managed ownership of verified rent source data', () => {
  it('does not issue a registered runtime from a structural shared binding or environment label', () => {
    expect(() =>
      createPostwarBeneficialHousingRentRuntimeForSharedSource({
        sharedBinding: {} as never,
        clockBindingRef: 'NOT_A_REGISTRATION',
      }),
    ).toThrow('GENUINE_FINANCE_SOCIAL_SOURCE_BINDING_REQUIRED');
  });

  it('accepts the actual private token after fresh exact child-header delegation and retires it on close', async () => {
    const f = setup(),
      runtime = createPostwarBeneficialHousingRentRuntime(f.config);
    expect(hasPostwarBeneficialHousingRentSourceOwner(f.token)).toBe(false);
    await runtime.prepareFromVerifiedSource(f.token);
    expect(hasPostwarBeneficialHousingRentSourceOwner(f.token)).toBe(true);
    expect(f.headers).toBe(1);
    expect(
      readPostwarBeneficialHousingRentSourcePreparation(
        runtime,
        f.data.worldId,
      ),
    ).toBe(f.token);
    await expect(runtime.prepareFromVerifiedSource(f.token)).rejects.toThrow(
      'SOURCE_ALREADY_PREPARED',
    );
    const competitor = createPostwarBeneficialHousingRentRuntime(f.config);
    await expect(competitor.prepareFromVerifiedSource(f.token)).rejects.toThrow(
      'VERIFIED_SOURCE_ALREADY_OWNED',
    );
    expect(consumeBeneficialHousingRentSource(f.token)).toBe(f.data);
    await competitor.close();
    await runtime.close();
    await runtime.close();
    expect(hasPostwarBeneficialHousingRentSourceOwner(f.token)).toBe(false);
    expect(() => consumeBeneficialHousingRentSource(f.token)).toThrow(
      'GENUINE_LIVE_PREPARED_SOURCE_REQUIRED',
    );
  });
  it('rejects copied and retired tokens before SQL and does not retire a valid borrowed token after a failed child check', async () => {
    const f = setup({ wrongChild: true }),
      runtime = createPostwarBeneficialHousingRentRuntime(f.config);
    await expect(
      runtime.prepareFromVerifiedSource({ ...f.token }),
    ).rejects.toThrow('GENUINE_LIVE_PREPARED_SOURCE_REQUIRED');
    expect(f.headers).toBe(0);
    const foreign = createPostwarBeneficialHousingRentRuntime({
      ...f.config,
      worldId: 'WORLD_TEST_ONLY_FOREIGN_RENT_CHILD',
    });
    await expect(foreign.prepareFromVerifiedSource(f.token)).rejects.toThrow(
      'EXACT_WORLD_REQUIRED',
    );
    await foreign.close();
    expect(consumeBeneficialHousingRentSource(f.token)).toBe(f.data);
    await expect(runtime.prepareFromVerifiedSource(f.token)).rejects.toThrow(
      'EXACT_ADMITTED_SOURCE_BINDING_REQUIRED',
    );
    expect(consumeBeneficialHousingRentSource(f.token)).toBe(f.data);
    expect(hasPostwarBeneficialHousingRentSourceOwner(f.token)).toBe(false);
    await runtime.close();
    expect(consumeBeneficialHousingRentSource(f.token)).toBe(f.data);
    retireBeneficialHousingRentSource(f.token);
    const other = createPostwarBeneficialHousingRentRuntime(f.config);
    await expect(other.prepareFromVerifiedSource(f.token)).rejects.toThrow(
      'GENUINE_LIVE_PREPARED_SOURCE_REQUIRED',
    );
    await other.close();
  });
  it('drains an entered preparation during close and rejects new work without taking ownership on that failed transfer', async () => {
    let entered!: () => void, release!: () => void;
    const seen = new Promise<void>((r) => {
        entered = r;
      }),
      gate = new Promise<void>((r) => {
        release = r;
      });
    const f = setup({ headerGate: gate, entered }),
      runtime = createPostwarBeneficialHousingRentRuntime(f.config);
    const preparing = runtime.prepareFromVerifiedSource(f.token);
    const rejected = expect(preparing).rejects.toThrow(
      'RUNTIME_RETIRED_DURING_PREPARATION',
    );
    await seen;
    expect(hasPostwarBeneficialHousingRentSourceOwner(f.token)).toBe(true);
    await expect(runtime.prepareFromVerifiedSource(f.token)).rejects.toThrow(
      'SOURCE_ALREADY_PREPARED',
    );
    let closed = false;
    const closing = runtime.close().then(() => {
      closed = true;
    });
    await Promise.resolve();
    expect(closed).toBe(false);
    await expect(runtime.prepareFromVerifiedSource(f.token)).rejects.toThrow(
      'RUNTIME_RETIRED',
    );
    release();
    await rejected;
    await closing;
    expect(hasPostwarBeneficialHousingRentSourceOwner(f.token)).toBe(false);
    expect(consumeBeneficialHousingRentSource(f.token)).toBe(f.data);
    retireBeneficialHousingRentSource(f.token);
  });
});
