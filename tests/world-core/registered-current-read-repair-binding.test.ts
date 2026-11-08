/** Metadata transport protocol only; no actual PostgreSQL or source proof. */
import { describe, it, expect, vi } from 'vitest';
import type { Pool } from 'pg';
import { REGISTERED_FINAL_NATIVE_SQL_ORDER } from '../../tools/office-connection/registered-final-native-sql.mjs';
import {
  verifyRegisteredCurrentReadRepairFunctionsFrom,
  loadRegisteredCurrentReadRepairCheckpoint,
  assertRegisteredReadRepairReceiptCoverage,
} from '../support/registered-current-read-repair-checkpoint.js';
const adaptations = Array.from({ length: 13 }, (_, i) => ({
  signature: 'world_v2.fixture_' + i + '(text)',
  owner: 'world_v2_postwar_projection_owner',
  oldHash: '1'.repeat(64),
  newHash: '2'.repeat(64),
}));
const repair: Awaited<
  ReturnType<typeof loadRegisteredCurrentReadRepairCheckpoint>
> = {
  checkpoint: {},
  originalDirectory: 'PROTOCOL_ONLY',
  extraReceipt: {
    name: 'postwar-complete-opening-inventory-read-repair',
    sha256: '0'.repeat(64),
    status: 'DDL_COMMITTED',
  },
  adaptations,
  evidence: {
    checkpointFile: 'PROTOCOL_ONLY',
    checkpointSha256: '0'.repeat(64),
    reportFile: 'PROTOCOL_ONLY',
    reportSha256: '0'.repeat(64),
    extraReceiptSha256: '0'.repeat(64),
    appliedAdaptationsSha256: '0'.repeat(64),
    sqlSha256: '0'.repeat(64),
  },
};
const rows = () =>
  adaptations.map((x) => ({
    signature: x.signature,
    prosrc_sha256: x.newHash,
    owner: x.owner,
    prosecdef: true,
    proconfig: ['search_path=pg_catalog'],
    acl: '{}',
  }));
const pool = (result: ReturnType<typeof rows>) =>
  ({ query: vi.fn(async () => ({ rows: result })) }) as unknown as Pick<
    Pool,
    'query'
  >;
describe('exact repaired function transport contract', () => {
  it('binds the actual 76-proposal union separately from the 60 later runtime receipts and 74 canonical loader entries', () => {
    const planNames = [...REGISTERED_FINAL_NATIVE_SQL_ORDER];
    const installed = Object.fromEntries(
      [
        ...planNames,
        'current-authorization-writer-preparation',
        'postwar-runtime-source-read-policy',
      ].map((name) => [name, 'a'.repeat(64)]),
    );
    const input = {
      installed,
      planNames,
      runtimeReceiptNames: planNames.slice(0, 60),
    };
    expect(assertRegisteredReadRepairReceiptCoverage(input)).toHaveLength(76);
    expect(() =>
      assertRegisteredReadRepairReceiptCoverage({
        ...input,
        installed: { ...installed, UNKNOWN_DDL: 'b'.repeat(64) },
      }),
    ).toThrow();
    expect(() =>
      assertRegisteredReadRepairReceiptCoverage({
        ...input,
        planNames: planNames.slice(0, 60),
      }),
    ).toThrow();
    expect(() =>
      assertRegisteredReadRepairReceiptCoverage({
        ...input,
        runtimeReceiptNames: planNames.slice(0, 59),
      }),
    ).toThrow();
  });

  it('requires all 13 concrete signatures and body hashes rather than an installation flag', async () => {
    await expect(
      verifyRegisteredCurrentReadRepairFunctionsFrom(pool(rows()), repair),
    ).resolves.toHaveLength(13);
  });
  it('refuses the obsolete 12-function repair', async () => {
    await expect(
      verifyRegisteredCurrentReadRepairFunctionsFrom(
        pool(rows().slice(0, 12)),
        repair,
      ),
    ).rejects.toThrow('ACTUAL_THIRTEEN_REPAIRED_FUNCTIONS_REQUIRED');
  });
  it.each(['prosrc_sha256', 'owner', 'proconfig'] as const)(
    'refuses drift of %s',
    async (field) => {
      const actual = rows();
      if (field === 'proconfig') actual[12]!.proconfig = ['search_path=public'];
      else actual[12]![field] = 'OTHER';
      await expect(
        verifyRegisteredCurrentReadRepairFunctionsFrom(pool(actual), repair),
      ).rejects.toThrow('ACTUAL_READ_REPAIR_FUNCTION_DIFFERS');
    },
  );
});
