/** Genuine fixed server components only. No DB admission, raw seed, operating
 * producer, fabricated native source or production success in this protocol. */
import { beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { loadPostwarSourceContext } from '../../apps/world-worker/src/preparation/postwar-source-context.js';
import { createPostwarSocialRuntimeConnection } from '../../apps/world-worker/src/runtime-preparation/social-runtime-connection.js';
import { createPostwarMixedCurrentProjectionSource } from '../../apps/world-worker/src/persistence/postwar-mixed-current-projection-publication.js';
import {
  createPostwarIndustryRuntimeConnection,
  readPostwarIndustryRuntimeBinding,
  isPostwarIndustryRuntimeConnection,
  isPreparedPostwarIndustryRuntimeConnection,
} from '../../apps/world-worker/src/runtime-preparation/postwar-industry-runtime-connection.js';
import type { SqlDatabase } from '../../apps/world-worker/src/persistence/sql-database.js';
let context: Awaited<ReturnType<typeof loadPostwarSourceContext>>;
beforeAll(async () => {
  context = await loadPostwarSourceContext(process.cwd());
});
function fixture() {
  let connections = 0;
  const pool = {
    async connect() {
      connections++;
      throw Error('NO_PROTOCOL_DB');
    },
    async query() {
      connections++;
      throw Error('NO_PROTOCOL_DB');
    },
  } as unknown as Pool;
  const social = createPostwarSocialRuntimeConnection({
    worldId: 'WORLD_INDUSTRY_FIXED_UNIT',
    workerId: 'WORKER_INDUSTRY_FIXED_UNIT',
    workerPool: pool,
    workerRole: 'worker_industry_fixed_unit',
    openingAdoption: context.labourSocial,
  });
  const database: SqlDatabase = {
    query: async () => {
      throw Error('NO_PROTOCOL_SQL');
    },
    transaction: async () => {
      throw Error('NO_PROTOCOL_SQL');
    },
  };
  const mixedSource = createPostwarMixedCurrentProjectionSource({
    worldId: social.worldId,
    socialConnection: social,
    workerRole: 'worker_industry_fixed_unit',
    publicationDatabase: database,
  });
  const clock = Object.freeze({
    nowReal: () => '2026-11-01T00:00:00.000Z',
    simTime: async () => '0',
  });
  const input = {
    worldId: social.worldId,
    workerId: social.workerId,
    database: social.database,
    socialConnection: social,
    mixedSource,
    sourceContext: context,
    clock,
  };
  return { input, social, mixedSource, connections: () => connections };
}
describe('fixed Industry borrowed installation', () => {
  it('constructs a private one-runtime port without SQL, consumer, payment, admission or clock work', async () => {
    const f = fixture();
    const c = createPostwarIndustryRuntimeConnection(f.input);
    try {
      const p = readPostwarIndustryRuntimeBinding(c);
      expect(isPostwarIndustryRuntimeConnection(c, f.social.worldId)).toBe(
        true,
      );
      expect(isPreparedPostwarIndustryRuntimeConnection(c)).toBe(false);
      expect(p.runtime.database).toBe(f.social.database);
      expect(p.clock).toBe(f.input.clock);
      expect(Object.keys(p)).not.toContain('consumer');
      expect(Object.keys(p)).not.toContain('sourceAdmitted');
      expect(f.connections()).toBe(0);
      expect(() => readPostwarIndustryRuntimeBinding({ ...c })).toThrow(
        'GENUINE_LIVE',
      );
      await expect(c.prepare()).rejects.toThrow();
      expect(isPreparedPostwarIndustryRuntimeConnection(c)).toBe(false);
      expect(f.connections()).toBe(0);
    } finally {
      await c.close();
      await f.mixedSource.close();
      await f.social.close();
    }
  });
  it('does not accept an interface-shaped Social or mixed source, callback factory or unbranded run data', async () => {
    const f = fixture();
    try {
      expect(() =>
        createPostwarIndustryRuntimeConnection({
          ...f.input,
          socialConnection: { ...f.social },
        }),
      ).toThrow('GENUINE_SAME_WORLD');
      expect(() =>
        createPostwarIndustryRuntimeConnection({
          ...f.input,
          mixedSource: { ...f.mixedSource },
        }),
      ).toThrow('GENUINE_SAME_WORLD');
      expect(() =>
        createPostwarIndustryRuntimeConnection({
          ...f.input,
          workerId: 'WORKER_OTHER',
        }),
      ).toThrow('EXACT_SHARED_WORKER');
      expect(() =>
        createPostwarIndustryRuntimeConnection({
          ...f.input,
          clock: { ...f.input.clock },
        }),
      ).toThrow('SERVER_CLOCK');
      expect(() =>
        createPostwarIndustryRuntimeConnection({
          ...f.input,
          preparedRuns: Array.from({ length: 257 }, () => ({}) as never),
        }),
      ).toThrow('BOUNDED_RUN');
      expect(f.connections()).toBe(0);
    } finally {
      await f.mixedSource.close();
      await f.social.close();
    }
  });
  it('drains and retires only its own borrowing, without stopping the shared source or its pools', async () => {
    const f = fixture();
    const c = createPostwarIndustryRuntimeConnection(f.input),
      p = readPostwarIndustryRuntimeBinding(c);
    const pending = c.prepare();
    const outcome = pending.catch((e) => e);
    const closing = c.close();
    expect(c.close()).toBe(closing);
    await closing;
    expect(await outcome).toBeInstanceOf(Error);
    expect(isPostwarIndustryRuntimeConnection(c)).toBe(false);
    expect(isPreparedPostwarIndustryRuntimeConnection(c)).toBe(false);
    await expect(c.prepare()).rejects.toThrow('RETIRED');
    await expect(
      p.runtime.readFacility({
        worldId: f.social.worldId,
        countryId: 'COUNTRY_01',
        locationId: 'REGION_TEST',
        facilityId: 'FACILITY_TEST',
        operatorId: 'OP_TEST',
      }),
    ).rejects.toThrow('RETIRED');
    expect(f.connections()).toBe(0);
    await f.mixedSource.close();
    await f.social.close();
  });
});
