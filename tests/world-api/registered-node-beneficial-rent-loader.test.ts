/** TEST_ONLY Core data, not an admitted operating world or production acceptance. */
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm, truncate } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import * as C from '@econmind/core';
import {
  consumeBeneficialHousingRentSource,
  prepareBeneficialHousingRentSource,
  retireBeneficialHousingRentSource,
} from '../../apps/world-worker/dist/runtime-preparation/beneficial-housing-rent-source-exports.js';
import { createBeneficialHousingRentChildCoreFixture } from '../support/beneficial-housing-rent-child-test-only.js';
import {
  loadRegisteredNodeStartupArtifacts,
  retireRegisteredNodeRentSourceAfterDrain,
  REGISTERED_NODE_SEED_MAX_BYTES,
  REGISTERED_NODE_RENT_RECEIPTS_MAX_BYTES,
} from '../../apps/world-api/src/runtime/registered-node-beneficial-rent-loader.js';
// SQL is a protocol double here; token ownership and Core data are genuine.
import { createPostwarBeneficialHousingRentRuntime } from '../../apps/world-worker/dist/persistence/postwar-beneficial-housing-rent-runtime.js';
import { BENEFICIAL_RENT_HEADER_QUERY } from '../../apps/world-worker/dist/persistence/postgres-postwar-beneficial-housing-rent-originals.js';
import type {
  SqlDatabase,
  SqlQueryResult,
} from '../../apps/world-worker/src/persistence/sql-database.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
});
function fixture() {
  const old = createBeneficialHousingRentChildCoreFixture(1);
  const source = C.createOpeningSource(
    {
      schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: C.openingSourceId('SOURCE_TEST_ONLY_PARENT_4'),
      sourceKind: 'TEST_FIXTURE',
      sourceVersion: 'TEST_ONLY_V1',
      locator: 'TEST_ONLY_NOT_CFC_ADMISSION',
      payload: { testOnly: true },
    },
    sha,
  );
  const parent = C.createOpeningSeed(
    { ...old.parent, sources: [...old.parent.sources, source] },
    sha,
  );
  const r = old.receipts[0]!;
  const child = C.reclassifyBeneficialHousingSeed(
    {
      seed: parent,
      allocationId: r.allocationId,
      policyRef: r.policyRef,
      sourcePopulationRef: r.sourcePopulationRef,
      countryId: r.countryId,
      householdEntityId: r.householdEntityId,
      parentAccountId: r.originalAccount.accountId,
      regions: r.regions,
      groups: r.groups,
      pools: r.pools,
      leases: r.leases,
    },
    sha,
  );
  return { parent, seed: child.seed, receipts: [child.receipt] };
}
async function files() {
  const f = fixture(),
    dir = await mkdtemp(join(tmpdir(), 'registered-rent-loader-'));
  directories.push(dir);
  const put = async (name: string, value: unknown) => {
    const bytes = C.canonicalSerialize(value),
      path = join(dir, name);
    await writeFile(path, bytes);
    return { path, hash: sha(bytes) };
  };
  const child = await put('child.json', f.seed),
    parent = await put('parent.json', f.parent),
    receipts = await put('receipts.json', f.receipts);
  const request = {
    seedPath: child.path,
    seedFileSha256: child.hash,
    worldId: f.seed.worldId,
    beneficialRent: {
      parentSeedPath: parent.path,
      parentSeedFileSha256: parent.hash,
      receiptsPath: receipts.path,
      receiptsFileSha256: receipts.hash,
      clockBindingRef: 'CLOCK_TEST_ONLY_RENT',
    },
  };
  return { f, dir, put, request };
}
describe('registered Node bounded genuine rent artifact loader', () => {
  it('reconstructs a genuine proof from exact Core child/parent/receipt bytes and retires only its own proof', async () => {
    const { f, request } = await files();
    const loaded = await loadRegisteredNodeStartupArtifacts(request),
      proof = loaded.beneficialRentSource!;
    const data = consumeBeneficialHousingRentSource(proof);
    expect(data.worldId).toBe(f.seed.worldId);
    expect(data.parentSeedFingerprint).toBe(f.parent.fingerprint);
    expect(data.seedFingerprint).toBe(f.seed.fingerprint);
    expect(data.receipts).toHaveLength(1);
    expect(loaded.files.map((x) => x.sha256)).toEqual([
      request.seedFileSha256,
      request.beneficialRent.parentSeedFileSha256,
      request.beneficialRent.receiptsFileSha256,
    ]);
    expect(() => consumeBeneficialHousingRentSource({ ...proof })).toThrow();
    retireRegisteredNodeRentSourceAfterDrain(proof);
    expect(() => consumeBeneficialHousingRentSource(proof)).toThrow();
    expect(() => retireRegisteredNodeRentSourceAfterDrain(proof)).not.toThrow();
    const foreign = prepareBeneficialHousingRentSource({
      parentSeed: f.parent,
      seed: f.seed,
      receipts: f.receipts,
    });
    expect(() => retireRegisteredNodeRentSourceAfterDrain(foreign)).toThrow(
      'LOADER_OWNED',
    );
    expect(consumeBeneficialHousingRentSource(foreign).seedFingerprint).toBe(
      f.seed.fingerprint,
    );
    retireBeneficialHousingRentSource(foreign);
  });
  it('does not retire a genuinely reserved or transferred proof before the actual runtime drains', async () => {
    const { request } = await files(),
      loaded = await loadRegisteredNodeStartupArtifacts(request),
      proof = loaded.beneficialRentSource!;
    const data = consumeBeneficialHousingRentSource(proof);
    let entered!: () => void, release!: () => void;
    const seen = new Promise<void>((r) => {
        entered = r;
      }),
      gate = new Promise<void>((r) => {
        release = r;
      });
    const db: SqlDatabase = {
      async query<Row extends object>(
        sql: string,
      ): Promise<SqlQueryResult<Row>> {
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
          entered();
          await gate;
          rows = [
            {
              world_id: data.worldId,
              seed_id: data.seedId,
              seed_fingerprint: data.seedFingerprint,
              parent_seed_fingerprint: data.parentSeedFingerprint,
              canonical_seed_sha256: data.canonicalSeedSha256,
              bundle_sha256: data.bundleSha256,
            },
          ];
        } else if (!sql.startsWith('set local role '))
          throw Error('UNEXPECTED_PROTOCOL_SQL');
        return { rows: rows as Row[], rowCount: rows.length };
      },
      async transaction(consume) {
        return consume(db);
      },
    };
    const runtime = createPostwarBeneficialHousingRentRuntime({
      database: db,
      worldId: data.worldId,
      workerId: 'WORKER_TEST_LOADER',
      workerRole: 'fixture_rent_worker',
      environment: 'ci',
      clock: {
        nowReal: () => '2026-11-01T00:00:00.000Z',
        simTime: async () => '0',
      },
      clockBindingRef: 'CLOCK_TEST_ONLY_RENT',
    });
    const preparing = runtime.prepareFromVerifiedSource(proof);
    await seen;
    expect(() => retireRegisteredNodeRentSourceAfterDrain(proof)).toThrow(
      'OWNER_STILL_ACTIVE',
    );
    expect(consumeBeneficialHousingRentSource(proof)).toBe(data);
    release();
    await preparing;
    expect(() => retireRegisteredNodeRentSourceAfterDrain(proof)).toThrow(
      'OWNER_STILL_ACTIVE',
    );
    await runtime.close();
    expect(() => retireRegisteredNodeRentSourceAfterDrain(proof)).not.toThrow();
    expect(() => consumeBeneficialHousingRentSource(proof)).toThrow();
  });
  it('keeps old configurations without rent compatible, issuing no token', async () => {
    const { request } = await files();
    const legacy = {
      seedPath: request.seedPath,
      seedFileSha256: request.seedFileSha256,
      worldId: request.worldId,
    };
    const loaded = await loadRegisteredNodeStartupArtifacts(legacy);
    expect(loaded.beneficialRentSource).toBeUndefined();
    expect(loaded.files).toHaveLength(1);
  });
  it.each(['child', 'parent', 'receipts'] as const)(
    'rejects mismatched %s file SHA',
    async (which) => {
      const { request } = await files();
      const bad = '0'.repeat(64);
      if (which === 'child') request.seedFileSha256 = bad;
      else if (which === 'parent')
        request.beneficialRent.parentSeedFileSha256 = bad;
      else request.beneficialRent.receiptsFileSha256 = bad;
      await expect(loadRegisteredNodeStartupArtifacts(request)).rejects.toThrow(
        'FILE_HASH_MISMATCH',
      );
    },
  );
  it('rejects missing config fields, caller proof/readiness and extra seed fields', async () => {
    const { request, f, put } = await files();
    const missing = {
      parentSeedPath: request.beneficialRent.parentSeedPath,
      parentSeedFileSha256: request.beneficialRent.parentSeedFileSha256,
      receiptsPath: request.beneficialRent.receiptsPath,
      receiptsFileSha256: request.beneficialRent.receiptsFileSha256,
    };
    await expect(
      loadRegisteredNodeStartupArtifacts({
        ...request,
        beneficialRent: missing,
      } as never),
    ).rejects.toThrow();
    await expect(
      loadRegisteredNodeStartupArtifacts({
        ...request,
        proof: { ready: true },
      } as never),
    ).rejects.toThrow('EXACT_SHAPE');
    const changed = await put('extra.json', { ...f.seed, ready: true });
    await expect(
      loadRegisteredNodeStartupArtifacts({
        ...request,
        seedPath: changed.path,
        seedFileSha256: changed.hash,
      }),
    ).rejects.toThrow('EXACT_SHAPE');
    const nested = JSON.parse(C.canonicalSerialize(f.seed));
    nested.sources[0].ready = true;
    const changedNested = await put('extra-nested.json', nested);
    await expect(
      loadRegisteredNodeStartupArtifacts({
        ...request,
        seedPath: changedNested.path,
        seedFileSha256: changedNested.hash,
      }),
    ).rejects.toThrow('EXACT_SHAPE');
  });
  it('rejects wrong World and incomplete retained parent family', async () => {
    const { request, put } = await files();
    await expect(
      loadRegisteredNodeStartupArtifacts({
        ...request,
        worldId: 'WORLD_OTHER',
      }),
    ).rejects.toThrow('WORLD_MISMATCH');
    const old = createBeneficialHousingRentChildCoreFixture(1),
      parent = await put('old-parent.json', old.parent),
      child = await put('old-child.json', old.seed);
    await expect(
      loadRegisteredNodeStartupArtifacts({
        ...request,
        seedPath: child.path,
        seedFileSha256: child.hash,
        beneficialRent: {
          ...request.beneficialRent,
          parentSeedPath: parent.path,
          parentSeedFileSha256: parent.hash,
        },
      }),
    ).rejects.toThrow('FOUR_SOURCE_PARENT');
  });
  it('rejects tampered receipt facts even when file SHA is correct', async () => {
    const { request, f, put } = await files();
    const bad = JSON.parse(C.canonicalSerialize(f.receipts));
    bad[0].groups[0].households = '999';
    const file = await put('tampered.json', bad);
    await expect(
      loadRegisteredNodeStartupArtifacts({
        ...request,
        beneficialRent: {
          ...request.beneficialRent,
          receiptsPath: file.path,
          receiptsFileSha256: file.hash,
        },
      }),
    ).rejects.toThrow();
  });
  it('rejects empty/unknown receipt shapes and bounded sparse files without reading huge JSON', async () => {
    const { request, dir, put } = await files();
    for (const value of [[], { proof: true }, [{ ready: true }]]) {
      const file = await put('bad-receipts.json', value);
      await expect(
        loadRegisteredNodeStartupArtifacts({
          ...request,
          beneficialRent: {
            ...request.beneficialRent,
            receiptsPath: file.path,
            receiptsFileSha256: file.hash,
          },
        }),
      ).rejects.toThrow();
    }
    const large = join(dir, 'large.json');
    await writeFile(large, 'x');
    await truncate(large, REGISTERED_NODE_SEED_MAX_BYTES + 1);
    await expect(
      loadRegisteredNodeStartupArtifacts({ ...request, seedPath: large }),
    ).rejects.toThrow('BYTE_LIMIT');
    await truncate(large, REGISTERED_NODE_RENT_RECEIPTS_MAX_BYTES + 1);
    await expect(
      loadRegisteredNodeStartupArtifacts({
        ...request,
        beneficialRent: { ...request.beneficialRent, receiptsPath: large },
      }),
    ).rejects.toThrow('BYTE_LIMIT');
  });
});
