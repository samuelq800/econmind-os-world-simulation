/** Actual deployed config loader, immutable original bytes; no DB or proof. */
import { it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadPostwarIndustryLogisticsPolicy } from '../../apps/world-worker/src/persistence/postwar-industry-logistics-source.js';
import {
  INDUSTRY_INTERNAL_LOGISTICS_POLICY_RAW_SHA256,
  INDUSTRY_INTERNAL_LOGISTICS_MULTICOUNTRY_POLICY_RAW_SHA256,
  INDUSTRY_INTERNAL_LOGISTICS_ADOPTION_RAW_SHA256,
} from '../../packages/core/src/inventory/industry-internal-logistics.js';
it('loads both exact versions while preserving the original C2 bytes and same original adoption', async () => {
  const root = fileURLToPath(new URL('../..', import.meta.url)),
    p = await loadPostwarIndustryLogisticsPolicy(root),
    sha = (s: string) => createHash('sha256').update(s).digest('hex');
  expect(sha(p.policy)).toBe(INDUSTRY_INTERNAL_LOGISTICS_POLICY_RAW_SHA256);
  expect(sha(p.adoption)).toBe(INDUSTRY_INTERNAL_LOGISTICS_ADOPTION_RAW_SHA256);
  expect(p.multiCountryPolicy).toBeDefined();
  if (!p.multiCountryPolicy) throw Error('MULTICOUNTRY_POLICY_BYTES_REQUIRED');
  expect(sha(p.multiCountryPolicy)).toBe(
    INDUSTRY_INTERNAL_LOGISTICS_MULTICOUNTRY_POLICY_RAW_SHA256,
  );
  const derived = JSON.parse(p.multiCountryPolicy) as {
    classification: string;
    existingAdoptions: readonly { path: string; rawSha256: string }[];
  };
  expect(derived.classification).toBe(
    'DERIVED_COUNTRY_SOURCE_MAPPING_UNDER_EXISTING_USER_ADOPTION_NOT_NEW_APPROVAL',
  );
  for (const a of derived.existingAdoptions)
    expect(
      sha(await readFile(new URL('../../' + a.path, import.meta.url), 'utf8')),
    ).toBe(a.rawSha256);
});
