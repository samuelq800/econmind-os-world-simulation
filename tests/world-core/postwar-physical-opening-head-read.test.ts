/** TEST_ONLY SQL protocol responses test the adapter, NOT native SQL/RLS or
 * source admission. The opt-in artifact vector uses the actual sealed c427
 * bytes without rebuilding a World or creating a DB; SQL remains simulated. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  createPostwarPhysicalOpeningHeadReader,
  POSTWAR_PHYSICAL_OPENING_DATASETS,
  POSTWAR_PHYSICAL_OPENING_PAGE_QUERY,
} from '../../apps/world-worker/src/persistence/postwar-physical-opening-head-read.js';
import { POSTWAR_PROJECTION_SEATS_QUERY } from '../../apps/world-worker/src/persistence/postwar-office-projection-store.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const POSTWAR_PHYSICAL_OPENING_SEED_FINGERPRINT =
  'sha256:c42757599f51fe7e21ff52c152387c1f6a27649ff0cd199dd39b7d2205386589';
const configuration = {
  expectedSeedFingerprint: POSTWAR_PHYSICAL_OPENING_SEED_FINGERPRINT,
  runtimeReaderRole: 'fixture_opening_reader',
  authorizationPublisherRole: 'fixture_opening_publisher',
};
const reader = createPostwarPhysicalOpeningHeadReader(configuration);
type Office = keyof typeof POSTWAR_PHYSICAL_OPENING_DATASETS;
const worldId = 'WORLD_TEST_ONLY_HISTORICAL_READ';
function protocol(
  options: {
    officeId?: Office;
    head?: string;
    rows?: readonly unknown[];
    sourceFingerprint?: string;
    seedFingerprint?: string;
    changedAfter?: boolean;
    missingFunction?: boolean;
    missingSeat?: boolean;
    changedAdmission?: boolean;
    corruptRows?: boolean;
    pageStatus?: 'DENIED' | 'STALE';
  } = {},
) {
  const officeId = options.officeId ?? 'INDUSTRY',
    subject = '11111111-1111-4111-8111-111111111111';
  const scope = {
    worldId,
    countryId: 'COUNTRY_01',
    officeId,
    authSubject: subject,
    teamId: 'TEAM_TEST_ONLY',
    authorizationVersion: 'REV_1',
    scopeKey: `OFFICE_${Buffer.from('COUNTRY_01').toString('hex').toUpperCase()}_${Buffer.from(officeId).toString('hex').toUpperCase()}`,
    seatRef: 'SEAT_TEST_ONLY',
  };
  const metadata = {
    admissionRef: 'ADMISSION_TEST_ONLY_PROTOCOL',
    seedId: 'SEED_TEST_ONLY_PROTOCOL',
    seedFingerprint:
      options.seedFingerprint ?? POSTWAR_PHYSICAL_OPENING_SEED_FINGERPRINT,
    modelVersion: 'MODEL_TEST_ONLY',
    replayBinding: '{}',
    sourceBundleSha256: 'a'.repeat(64),
  };
  const statements: string[] = [];
  let headers = 0;
  const executor: SqlExecutor = {
    async query<Row extends object>(sql: string) {
      statements.push(sql);
      let result: object[];
      if (sql.includes('select current_user as role_name'))
        result = [
          {
            role_name: configuration.runtimeReaderRole,
            subject,
            read_only: 'on',
            isolation: 'repeatable read',
            unsafe_role: false,
            publisher_member: false,
          },
        ];
      else if (sql === POSTWAR_PROJECTION_SEATS_QUERY) {
        headers++;
        result = options.missingSeat
          ? []
          : [
              {
                world_id: worldId,
                country_id: scope.countryId,
                office_id: officeId,
                auth_subject: subject,
                team_id: scope.teamId,
                authorization_revision:
                  options.changedAfter && headers > 1 ? 'REV_2' : 'REV_1',
                scope_key: scope.scopeKey,
                seat_ref: scope.seatRef,
                admission_ref: metadata.admissionRef,
                seed_id: metadata.seedId,
                seed_fingerprint: metadata.seedFingerprint,
                model_version: metadata.modelVersion,
                replay_binding: metadata.replayBinding,
                source_bundle_sha256: metadata.sourceBundleSha256,
                world_version: options.head ?? '5',
                event_sequence: options.head ?? '5',
              },
            ];
      } else if (sql === POSTWAR_PHYSICAL_OPENING_PAGE_QUERY) {
        if (options.missingFunction)
          throw Object.assign(Error('undefined_function'), { code: '42883' });
        const rows = options.rows ?? [],
          raw = JSON.stringify(rows);
        result = [
          {
            status: options.pageStatus ?? (rows.length ? 'PAGE' : 'EMPTY'),
            scope_json: scope,
            source_json: {
              ...metadata,
              seedFingerprint:
                options.sourceFingerprint ?? metadata.seedFingerprint,
              admissionRef: options.changedAdmission
                ? 'ADMISSION_OTHER'
                : metadata.admissionRef,
              dataNature: 'DERIVED_RAW_FROM_ADMITTED_H0_NOT_AUTHORITY',
              sourceVersion: `sha256:${'b'.repeat(64)}`,
              sourceRevision: 'TEST_ONLY_PROTOCOL',
              canonicalSeedSha256: 'c'.repeat(64),
              worldVersion: '0',
              eventSequence: '0',
              pageHash: sha(raw),
              returnedRowsHash: options.corruptRows ? '0'.repeat(64) : sha(raw),
              hashAlgorithm: 'POSTGRES_JSONB_TEXT_UTF8_SHA256',
              sourcePointer: {
                path: 'TEST_ONLY_PROTOCOL_NOT_ACTUAL_SOURCE_ADMISSION',
              },
            },
            page_json: {
              offset: 0,
              limit: 25,
              returned: rows.length,
              total: rows.length,
              nextOffset: null,
            },
            rows_text: raw,
          },
        ];
      } else throw Error('UNEXPECTED_SQL:' + sql);
      return { rows: result as Row[], rowCount: result.length };
    },
  };
  return { executor, statements };
}
describe('explicit historical physical opening facts at an observed current head', () => {
  it('takes the expected immutable fingerprint from trusted deployment pins rather than a c427 production allowlist', async () => {
    const expectedSeedFingerprint = `sha256:${'d'.repeat(64)}`;
    const otherWorldReader = createPostwarPhysicalOpeningHeadReader({
      ...configuration,
      expectedSeedFingerprint,
    });
    const result = await otherWorldReader.readPageFrom(
      protocol({ seedFingerprint: expectedSeedFingerprint }).executor,
      { worldId, officeId: 'INDUSTRY', dataset: 'opening-inventory-entries' },
    );
    expect(result.status).toBe('EMPTY');
    if (result.status !== 'EMPTY')
      throw Error('NARROW_OTHER_VALID_DEPLOYMENT_PIN');
    expect(result.source.seedFingerprint).toBe(expectedSeedFingerprint);
  });
  it.each(['3', '5'])(
    'retains H0 origin at H%s without treating current events as permission to rewrite history',
    async (head) => {
      for (const officeId of Object.keys(
        POSTWAR_PHYSICAL_OPENING_DATASETS,
      ) as Office[]) {
        for (const dataset of POSTWAR_PHYSICAL_OPENING_DATASETS[officeId]) {
          const p = protocol({ officeId, head });
          const result = await reader.readPageFrom(p.executor, {
            worldId,
            officeId,
            dataset,
          });
          expect(result.status).toBe('EMPTY');
          if (result.status !== 'EMPTY') throw Error('NARROW');
          expect(result.source).toMatchObject({
            dataNature: 'ADMITTED_IMMUTABLE_OPENING_FACTS',
            originWorldVersion: '0',
            originEventSequence: '0',
            worldVersion: '0',
            eventSequence: '0',
            observedHead: { worldVersion: head, eventSequence: head },
          });
          expect(result.currentState.status).toBe('UNAVAILABLE');
          expect(
            p.statements.filter((s) => s === POSTWAR_PROJECTION_SEATS_QUERY),
          ).toHaveLength(2);
          expect(p.statements).toContain(POSTWAR_PHYSICAL_OPENING_PAGE_QUERY);
          expect(
            p.statements.every(
              (s) =>
                !s.includes('canonical_payload') &&
                !s.includes('from world_v2.postwar_office_projection_'),
            ),
          ).toBe(true);
        }
      }
    },
  );
  it('never rebrands H0 demand/allocation/staffing or inventory as current', async () => {
    const p = protocol({ officeId: 'CAPTAIN' });
    const value = await reader.readPageFrom(p.executor, {
      worldId,
      officeId: 'CAPTAIN',
      dataset: 'public-service-summary',
      view: 'CURRENT',
    });
    expect(value).toEqual({
      status: 'UNAVAILABLE',
      code: 'CURRENT_PHYSICAL_STATE_REPLAY_REQUIRED',
    });
    expect(p.statements).not.toContain(POSTWAR_PHYSICAL_OPENING_PAGE_QUERY);
  });
  it('requires the new fixed SQL entry and does not retry through the stale H0 path', async () => {
    const p = protocol({ missingFunction: true });
    expect(
      await reader.readPageFrom(p.executor, {
        worldId,
        officeId: 'INDUSTRY',
        dataset: 'opening-inventory-entries',
      }),
    ).toEqual({
      status: 'UNAVAILABLE',
      code: 'PHYSICAL_OPENING_READ_FUNCTION_NOT_INSTALLED',
    });
  });
  it.each([
    { changedAfter: true },
    { changedAdmission: true },
    { sourceFingerprint: `sha256:${'0'.repeat(64)}` },
  ])(
    'closes changed admission, country-office binding and same-head revision: %j',
    async (options) => {
      const p = protocol(options);
      expect(
        (
          await reader.readPageFrom(p.executor, {
            worldId,
            officeId: 'INDUSTRY',
            dataset: 'opening-inventory-entries',
          })
        ).status,
      ).toBe('UNAVAILABLE');
    },
  );
  it('retains the bounded parser hash, dataset, pagination and exact-seat negatives', async () => {
    const input = {
      worldId,
      officeId: 'INDUSTRY' as const,
      dataset: 'opening-inventory-entries',
    };
    await expect(
      reader.readPageFrom(protocol({ corruptRows: true }).executor, input),
    ).rejects.toThrow('HASH_OR_HEAD');
    await expect(
      reader.readPageFrom(protocol().executor, {
        ...input,
        dataset: 'public-service-summary',
      }),
    ).rejects.toThrow('EXACT_OFFICE_DATASET');
    await expect(
      reader.readPageFrom(protocol().executor, { ...input, offset: 1 }),
    ).rejects.toThrow('INVALID_PAGE_REQUEST');
    expect(
      (
        await reader.readPageFrom(
          protocol({ missingSeat: true }).executor,
          input,
        )
      ).status,
    ).toBe('DENIED');
    expect(
      (
        await reader.readPageFrom(
          protocol({ pageStatus: 'DENIED' }).executor,
          input,
        )
      ).status,
    ).toBe('DENIED');
  });
});
const markerPath = process.env.ECONMIND_POSTWAR_PHYSICAL_OPENING_REFERENCE;
it.skipIf(!markerPath)(
  'preserves an actual sealed c427 inventory original through the historical adapter (SQL protocol only)',
  async () => {
    const marker = JSON.parse(await readFile(markerPath!, 'utf8'));
    const bytes = await readFile(marker.seedFile, 'utf8');
    expect(sha(bytes)).toBe(marker.seedFileSha256);
    expect(marker.seedFingerprint).toBe(
      POSTWAR_PHYSICAL_OPENING_SEED_FINGERPRINT,
    );
    const seed = JSON.parse(bytes);
    expect(seed.fingerprint).toBe(marker.seedFingerprint);
    const row = seed.inventoryEntries.find(
      (e: { account: { countryId: string } }) =>
        e.account.countryId === 'COUNTRY_01',
    );
    expect(row).toBeDefined();
    const p = protocol({ rows: [row] });
    const value = await reader.readPageFrom(p.executor, {
      worldId,
      officeId: 'INDUSTRY',
      dataset: 'opening-inventory-entries',
    });
    if (value.status !== 'PAGE') throw Error('ACTUAL_ARTIFACT_ROW_REQUIRED');
    expect(value.rows).toEqual([row]);
    expect(value.source.worldVersion).toBe('0');
    expect(value.source.observedHead.worldVersion).toBe('5');
  },
);
