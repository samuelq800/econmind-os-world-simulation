/** Public getter protocol with actual pinned site/policy bytes and a genuine
 * tiny Core seed. Social/base/config-binding/registered-token boundaries are mocked; no DB,
 * 70-country private preparation, ready source or authority is issued here. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { beforeAll, beforeEach, afterEach, it, expect, vi } from 'vitest';
import * as C from '@econmind/core';
import { testOpeningSeed } from '../helpers/v08-ledgers.js';
import {
  inspectOfficialOpeningDecisionSource,
  type OfficialOpeningSourceBytes,
} from '../../apps/world-worker/src/preparation/official-opening-decision-reconciliation.js';
const state = vi.hoisted(() => ({
  live: true,
  baseline: {} as unknown,
  social: {
    worldId: 'WORLD_TEST_ONLY_SCOPE_PROTOCOL',
    workerId: 'WORKER_TEST_ONLY_SCOPE',
  },
  tokens: new Map<string, object>(),
  compact: new Map<object, Record<string, unknown>>(),
  lookups: [] as string[],
}));
vi.mock(
  '../../apps/world-worker/src/runtime-preparation/social-runtime-connection.js',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../apps/world-worker/src/runtime-preparation/social-runtime-connection.js')
    >()),
    isPostwarSocialRuntimeConnection: (value: unknown) =>
      value === state.social && state.live,
    readPostwarSocialRuntimeFinancialReplayBase: () => {
      if (!state.live) throw Error('TEST_ONLY_BASE_RETIRED');
      return state.baseline;
    },
    readPostwarSocialRuntimeConnectionResources: () => ({
      workerRole: 'test_scope_worker',
    }),
  }),
);
vi.mock(
  '../../apps/world-worker/src/persistence/prepared-postwar-social-source.js',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../apps/world-worker/src/persistence/prepared-postwar-social-source.js')
    >()),
    consumePreparedPostwarSocialFinancialReplayBase: (value: unknown) => value,
  }),
);
vi.mock(
  '../../apps/world-worker/src/persistence/postwar-social-position-runtime.js',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../apps/world-worker/src/persistence/postwar-social-position-runtime.js')
    >()),
    requirePostwarSocialSourceRevocationFence: () => {},
  }),
);
vi.mock(
  '../../apps/world-worker/src/persistence/postwar-industry-utility-source.js',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../apps/world-worker/src/persistence/postwar-industry-utility-source.js')
    >()),
    readPostwarIndustryUtilitySourceForBase: (
      _base: unknown,
      site: { countryId: string; facilityId: string },
    ) => {
      const key = site.countryId + '/' + site.facilityId;
      state.lookups.push(key);
      return state.tokens.get(key);
    },
    consumePostwarIndustryUtilitySource: (token: object) => {
      const compact = state.compact.get(token);
      if (!compact) throw Error('TEST_ONLY_UNINSTALLED_TOKEN');
      return { compact };
    },
  }),
);
vi.mock(
  '../../apps/world-worker/src/persistence/postwar-industry-logistics-source.js',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../apps/world-worker/src/persistence/postwar-industry-logistics-source.js')
    >()),
    // Scope protocol does not exercise genuine source issuance/configuration.
    bindPostwarIndustryLogisticsSourceConfiguration: () => {},
    retirePostwarIndustryLogisticsSourceConfiguration: () => {},
  }),
);
import {
  createPostwarIndustryLogisticsRuntime,
  type PostwarIndustryLogisticsRuntime,
} from '../../apps/world-worker/src/persistence/postwar-industry-logistics-runtime.js';
import { readPostwarIndustryRefineryCoverage } from '../../apps/world-worker/src/persistence/postwar-industry-refinery-sites.js';
const root = fileURLToPath(new URL('../..', import.meta.url)),
  read = (p: string) =>
    readFile(new URL('../../' + p, import.meta.url), 'utf8'),
  sha = (s: string) => createHash('sha256').update(s).digest('hex');
// Validate the fixture through the same public Core module as the Worker.
// A source-module seed alone does not carry the installed module's brand.
const seed = C.parseOpeningSeed(
  testOpeningSeed({
    worldId: C.worldId('WORLD_TEST_ONLY_SCOPE_PROTOCOL'),
    sha256Hex: sha,
  }),
  sha,
);
let context: Parameters<typeof readPostwarIndustryRefineryCoverage>[0],
  runtime: Readonly<PostwarIndustryLogisticsRuntime>;
beforeAll(async () => {
  const mappingBytes = await read(
      'docs/reports/world-connection/C_OFFICIAL_WORLD_OPENING_MAPPING.json',
    ),
    mapping = JSON.parse(mappingBytes) as {
      source: { dataFiles: Record<string, unknown> };
    };
  const sourceBytes: OfficialOpeningSourceBytes = {
    mappingBytes,
    checksumsBytes: await read(
      'artifacts/world-balanced-candidate-v1/CHECKSUMS.json',
    ),
    coverageBytes: await read(
      'docs/reports/world-connection/C_OFFICIAL_WORLD_COMPLETE_COVERAGE.json',
    ),
    proposalBytes: await read(
      'artifacts/E_OPENING_SEMANTIC_MAPPING_PROPOSAL_2026_10_07.md',
    ),
    datasets: Object.fromEntries(
      await Promise.all(
        Object.keys(mapping.source.dataFiles).map(async (file) => [
          file,
          await read('artifacts/world-balanced-candidate-v1/' + file),
        ]),
      ),
    ),
  };
  const checked = inspectOfficialOpeningDecisionSource(sourceBytes);
  if (!checked.source) throw Error(JSON.stringify(checked.blockers));
  context = {
    source: checked.source,
    sourceBytes,
    ownerOriginalBytes: await read(
      'docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISIONS.original.md',
    ),
  } as never;
  state.baseline = {
    prepared: {},
    pins: {
      worldId: seed.worldId,
      seedRef: seed.seedId,
      contentHash: seed.fingerprint,
      admissionRef: 'TEST_ONLY_SCOPE_NOT_PG',
    },
    document: {
      inputs: { sourceChecksumsSha256: sha(sourceBytes.checksumsBytes) },
    },
  };
});
beforeEach(() => {
  state.live = true;
  state.tokens.clear();
  state.compact.clear();
  state.lookups = [];
  const database = {
    query: async () => {
      throw Error('NO_SQL_IN_SCOPE_GETTER');
    },
    transaction: async () => {
      throw Error('NO_TRANSACTION_IN_SCOPE_GETTER');
    },
  };
  runtime = createPostwarIndustryLogisticsRuntime({
    database,
    socialConnection: state.social as never,
    sourceContext: context,
    clock: {
      nowReal: () => '2026-11-08T00:00:00.000Z',
      simTime: async () => '0',
    },
  });
});
afterEach(async () => {
  await runtime.close();
});
const prepare = () =>
  runtime.prepare({ repositoryRoot: root, startupSeed: seed });
function registered(countryId: string, override: Record<string, unknown> = {}) {
  const site = readPostwarIndustryRefineryCoverage(context).sites.find(
    (s) => s.countryId === countryId,
  );
  if (!site) throw Error('ACTUAL_PINNED_SITE_REQUIRED');
  const token = Object.freeze({});
  state.tokens.set(countryId + '/' + site.facilityId, token);
  state.compact.set(token, {
    worldId: seed.worldId,
    countryId: site.countryId,
    facilityId: site.facilityId,
    operatorId: site.operatorId,
    seedId: seed.seedId,
    seedFingerprint: seed.fingerprint,
    admissionRef: 'TEST_ONLY_SCOPE_NOT_PG',
    sourceChecksumsSha256: sha(context.sourceBytes.checksumsBytes),
    ...override,
  });
}
it('stays closed before preparation', () => {
  expect(runtime.readPlanningScope('COUNTRY_10')).toBeNull();
  expect(state.lookups).toEqual([]);
});
it('preserves the actual registered C2 scope under its unchanged legacy policy', async () => {
  registered('COUNTRY_02');
  await prepare();
  expect(runtime.readPlanningScope('COUNTRY_02')).toEqual({
    worldId: seed.worldId,
    countryId: 'COUNTRY_02',
    facilityId: 'OPEN-02-REFINED_FUEL',
  });
});
it('returns the actual registered C10 scope using the pinned multicountry policy', async () => {
  registered('COUNTRY_10');
  await prepare();
  expect(runtime.readPlanningScope('COUNTRY_10')).toEqual({
    worldId: seed.worldId,
    countryId: 'COUNTRY_10',
    facilityId: 'OPEN-10-REFINED_FUEL',
  });
  expect(state.lookups).toEqual(['COUNTRY_10/OPEN-10-REFINED_FUEL']);
});
it('keeps actual C20 zero-distance data closed even with a registered compact', async () => {
  registered('COUNTRY_20');
  await prepare();
  expect(runtime.readPlanningScope('COUNTRY_20')).toBeNull();
  expect(state.lookups).toEqual([]);
});
it('does not invent registration or fall back to C2 for missing/foreign scope', async () => {
  registered('COUNTRY_02');
  await prepare();
  for (const country of ['COUNTRY_10', 'COUNTRY_01', 'COUNTRY_99'])
    expect(runtime.readPlanningScope(country)).toBeNull();
  expect(state.lookups).toEqual(['COUNTRY_10/OPEN-10-REFINED_FUEL']);
});
it('rejects a compact with foreign admitted source pins rather than returning its scope', async () => {
  registered('COUNTRY_10', { countryId: 'COUNTRY_02' });
  await prepare();
  expect(() => runtime.readPlanningScope('COUNTRY_10')).toThrow(
    'ACTUAL_REGISTERED_LOGISTICS_PLANNING_SCOPE_DIFFERS',
  );
});
it('does not retain scope after the registered token disappears or runtime closes', async () => {
  registered('COUNTRY_10');
  await prepare();
  state.tokens.clear();
  expect(runtime.readPlanningScope('COUNTRY_10')).toBeNull();
  await runtime.close();
  expect(runtime.readPlanningScope('COUNTRY_10')).toBeNull();
});
