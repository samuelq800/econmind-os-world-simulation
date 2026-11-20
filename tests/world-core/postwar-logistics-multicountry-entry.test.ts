/** Entry control-flow protocol only: intercept the live baseline reader, then
 * stop at the first real fixed source query. This never returns source DATA,
 * fabricates an issued runtime/source or claims native/private-proof success.
 * Actual immutable country/source facts and policy bytes are read from files. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { beforeAll, it, expect, vi } from 'vitest';
import {
  inspectOfficialOpeningDecisionSource,
  type OfficialOpeningSourceBytes,
} from '../../apps/world-worker/src/preparation/official-opening-decision-reconciliation.js';
vi.mock(
  '../../apps/world-worker/src/persistence/prepared-postwar-social-source.js',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('../../apps/world-worker/src/persistence/prepared-postwar-social-source.js')
      >();
    return {
      ...actual,
      consumePreparedPostwarSocialFinancialReplayBase: (value: unknown) =>
        value,
    };
  },
);
import {
  loadPostwarIndustryLogisticsPolicy,
  bindPostwarIndustryLogisticsSourceConfiguration,
  readPostwarIndustryLogisticsReplaySourcesFrom,
  type PostwarIndustryLogisticsPolicyBytes,
} from '../../apps/world-worker/src/persistence/postwar-industry-logistics-source.js';
const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (file: string) =>
  readFile(new URL('../../' + file, import.meta.url), 'utf8');
let context: {
    source: NonNullable<
      ReturnType<typeof inspectOfficialOpeningDecisionSource>['source']
    >;
    sourceBytes: OfficialOpeningSourceBytes;
  },
  policyBytes: PostwarIndustryLogisticsPolicyBytes;
beforeAll(async () => {
  const mappingBytes = await read(
    'docs/reports/world-connection/C_OFFICIAL_WORLD_OPENING_MAPPING.json',
  );
  const mapping = JSON.parse(mappingBytes) as {
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
  const inspected = inspectOfficialOpeningDecisionSource(sourceBytes);
  if (!inspected.source) throw Error(JSON.stringify(inspected.blockers));
  context = { source: inspected.source, sourceBytes };
  policyBytes = await loadPostwarIndustryLogisticsPolicy(root);
});
function input(bytes = policyBytes) {
  // Deliberately NOT a usable genuine runtime base; protocol stops at SQL.
  const baseline = {
    prepared: {},
    pins: {
      worldId: 'WORLD_TEST_ONLY_ENTRY_PROTOCOL',
      seedRef: 'SEED_TEST_ONLY_ENTRY_PROTOCOL',
      contentHash: 'sha256:' + 'a'.repeat(64),
      admissionRef: 'ADMISSION_TEST_ONLY_ENTRY_PROTOCOL',
    },
    document: {
      inputs: {
        sourceChecksumsSha256: createHash('sha256')
          .update(context.sourceBytes.checksumsBytes)
          .digest('hex'),
      },
    },
  };
  bindPostwarIndustryLogisticsSourceConfiguration(baseline as never, {
    context: context as never,
    policyBytes: bytes,
  });
  const seen: { sql: string; args: readonly unknown[] }[] = [],
    failure = Error('TEST_ONLY_STOP_AT_ACTUAL_SOURCE_QUERY');
  const tx = {
    query: async (sql: string, args: readonly unknown[] = []) => {
      seen.push({ sql, args });
      throw failure;
    },
  };
  const run = (countryId: string, facilityId: string) =>
    readPostwarIndustryLogisticsReplaySourcesFrom(tx, {
      baseline: baseline as never,
      worldId: baseline.pins.worldId,
      countryId,
      facilityId,
      runIds: ['RUN_TEST_ONLY_PROTOCOL'],
      expectedHead: { worldVersion: '3', eventSequence: '3' },
    });
  return { run, seen, failure };
}
it.each([
  { countryId: 'COUNTRY_10', facilityId: 'OPEN-10-REFINED_FUEL' },
  { countryId: 'COUNTRY_02', facilityId: 'OPEN-02-REFINED_FUEL' },
])(
  'held reader entry protocol reaches fixed source SQL for $countryId under its pinned policy',
  async ({ countryId, facilityId }) => {
    const f = input();
    await expect(f.run(countryId, facilityId)).rejects.toBe(f.failure);
    expect(f.seen).toEqual([
      {
        sql: 'select * from world_v2.read_postwar_industry_first_day_source($1,$2,$3,$4::bigint,$5::bigint)',
        args: [
          'WORLD_TEST_ONLY_ENTRY_PROTOCOL',
          countryId,
          facilityId,
          '3',
          '3',
        ],
      },
    ]);
  },
);
it.each([
  { countryId: 'COUNTRY_10', facilityId: 'OPEN-02-REFINED_FUEL' },
  { countryId: 'COUNTRY_71', facilityId: 'OPEN-71-REFINED_FUEL' },
])(
  'held reader entry protocol rejects foreign or unknown scope $countryId/$facilityId before source read',
  async ({ countryId, facilityId }) => {
    const f = input();
    await expect(f.run(countryId, facilityId)).rejects.toThrow(
      'ADOPTED_LOGISTICS_SCOPE_UNAVAILABLE',
    );
    expect(f.seen).toEqual([]);
  },
);
it('held reader entry protocol with legacy-only installation remains explicitly C2-bounded', async () => {
  const f = input({
    policy: policyBytes.policy,
    adoption: policyBytes.adoption,
  });
  await expect(f.run('COUNTRY_10', 'OPEN-10-REFINED_FUEL')).rejects.toThrow(
    'ADOPTED_LOGISTICS_SCOPE_UNAVAILABLE',
  );
  expect(f.seen).toEqual([]);
  await expect(f.run('COUNTRY_02', 'OPEN-02-REFINED_FUEL')).rejects.toBe(
    f.failure,
  );
});
it('startup still rejects changed multicountry policy bytes before any read', () => {
  expect(() =>
    input({
      ...policyBytes,
      multiCountryPolicy: policyBytes.multiCountryPolicy + ' ',
    }),
  ).toThrow('EXACT_PRIVATE_STARTUP_CONFIGURATION_REQUIRED');
});
