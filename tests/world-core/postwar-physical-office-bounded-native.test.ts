/** Opt-in actual admitted source/PG16 bounded read evidence. Reuses a sealed
 * derived template; never regenerates or reads the full canonical seed. */
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  clonePostwarNativeReference,
  loadPostwarNativeReferenceMarker,
} from '../support/postwar-native-reference-db.js';
import {
  createPostwarOfficeProjectionStore,
  POSTWAR_PROJECTION_RESPONSE_MAX,
  type PostwarProjectionOffice,
  type PostwarOfficeProjectionPage,
} from '../../apps/world-worker/src/persistence/postwar-office-projection-store.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';

const descriptorPath = process.env.ECONMIND_POSTWAR_PHYSICAL_BOUNDED_TEMPLATE;
const native = descriptorPath ? describe : describe.skip;
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('ACTUAL_SOURCE_OBJECT_REQUIRED');
  return value as Record<string, unknown>;
};
const page = (value: PostwarOfficeProjectionPage) => {
  if (value.status !== 'PAGE' && value.status !== 'EMPTY')
    throw Error(`ACTUAL_BOUNDED_PAGE_REQUIRED:${value.status}`);
  return value;
};

native(
  'actual admitted physical offices through bounded native PG16 pages',
  () => {
    it('returns exact country stock/raw capacity/public summaries with no full-seed grant and closes a revoked office', async () => {
      const descriptor = object(
        JSON.parse(await readFile(descriptorPath!, 'utf8')),
      );
      expect(descriptor.schemaVersion).toBe(
        'postwar-bounded-projection-template-v1',
      );
      expect(descriptor.classification).toBe(
        'TEST_ONLY_SEALED_DERIVED_TEMPLATE_NOT_PRODUCTION',
      );
      if (
        typeof descriptor.referenceMarker !== 'string' ||
        typeof descriptor.templateDatabase !== 'string'
      )
        throw Error('SEALED_DERIVED_REFERENCE_REQUIRED');
      const marker = await loadPostwarNativeReferenceMarker(
        descriptor.referenceMarker,
      );
      const clone = await clonePostwarNativeReference(
        marker,
        'physical_bounded',
        descriptor.templateDatabase,
      );
      const store = createPostwarOfficeProjectionStore({
        runtimeReaderRole: marker.roles.boundedReaderRole,
        authorizationPublisherRole: marker.roles.authorizationPublisherRole,
      });
      const statements: string[] = [];
      const read = async <T>(
        consume: (executor: SqlExecutor) => Promise<T>,
      ) => {
        const client = await clone.boundedReader.connect();
        try {
          await client.query('begin isolation level repeatable read read only');
          await client.query(
            "select set_config('request.jwt.claim.sub',$1,true)",
            [marker.subject],
          );
          const result = await consume({
            async query<Row extends object>(
              sql: string,
              values: readonly unknown[] = [],
            ) {
              statements.push(sql);
              const result = await client.query<Row>(sql, [...values]);
              return { rows: result.rows, rowCount: result.rowCount };
            },
          });
          await client.query('commit');
          return result;
        } finally {
          await client.query('rollback').catch(() => {});
          client.release();
        }
      };
      const get = async (officeId: PostwarProjectionOffice, dataset: string) =>
        page(
          await read((executor) =>
            store.readPageFrom(executor, {
              worldId: marker.worldId,
              officeId,
              dataset,
              limit: 100,
            }),
          ),
        );
      try {
        expect(descriptor.seedFingerprint).toBe(marker.seedFingerprint);
        const industry = await get('INDUSTRY', 'opening-inventory-entries');
        const trade = await get('TRADE', 'opening-inventory-entries');
        expect(industry.rows.length).toBeGreaterThan(0);
        expect(trade.rows).toEqual(industry.rows);
        for (const value of industry.rows) {
          const entry = object(value),
            account = object(entry.account);
          expect(account.countryId).toBe(marker.countryId);
          for (const key of [
            'titleHolderId',
            'riskBearerId',
            'bucket',
            'physicalLocationId',
          ])
            expect(typeof account[key]).toBe('string');
          expect(typeof object(entry.quantity).amount).toBe('string');
          expect(typeof entry.sourceId).toBe('string');
          expect(typeof entry.entryId).toBe('string');
        }
        const regional = await get('INDUSTRY', 'regional-source-capacity');
        const captainRegional = await get(
          'CAPTAIN',
          'regional-source-capacity',
        );
        expect(regional.rows.length).toBeGreaterThan(0);
        expect(captainRegional.rows).toEqual(regional.rows);
        const regionIds = new Set(
          regional.rows.map((value) => {
            const row = object(value);
            expect(row.countryId).toBe(marker.countryId);
            expect(row.sourceStatus).toBe(
              'PINNED_SOURCE_CAPACITY_NOT_CURRENT_DELIVERY',
            );
            expect(
              Object.keys(object(row.sourceInitial)).length,
            ).toBeGreaterThan(0);
            expect(typeof row.sourceRegionId).toBe('string');
            return row.locationId;
          }),
        );
        const services = await get('CAPTAIN', 'public-service-summary');
        expect(services.rows.length).toBeGreaterThan(0);
        for (const value of services.rows) {
          const row = object(value);
          expect(regionIds.has(row.regionId)).toBe(true);
          expect(Object.keys(row).sort()).toEqual([
            'allocatedCount',
            'capacityCount',
            'demandCount',
            'kind',
            'regionId',
            'unallocatedCount',
          ]);
          for (const key of [
            'allocatedCount',
            'capacityCount',
            'demandCount',
            'unallocatedCount',
          ])
            expect(typeof row[key]).toBe('string');
        }
        for (const result of [
          industry,
          trade,
          regional,
          captainRegional,
          services,
        ]) {
          expect(result.scope.countryId).toBe(marker.countryId);
          expect(result.scope.authSubject).toBe(marker.subject);
          expect(result.source.seedFingerprint).toBe(marker.seedFingerprint);
          expect(result.source.sourceBundleSha256).toBe(
            marker.sourceBundleSha256,
          );
          expect(result.source.dataNature).toBe(
            'DERIVED_RAW_FROM_ADMITTED_H0_NOT_AUTHORITY',
          );
          expect(result.page.nextOffset).toBeNull();
          expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(
            POSTWAR_PROJECTION_RESPONSE_MAX,
          );
        }
        expect(
          statements.every((sql) => !sql.includes('canonical_payload')),
        ).toBe(true);
        await expect(
          read((executor) =>
            executor.query(
              'select canonical_payload from world_v2.opening_seed',
            ),
          ),
        ).rejects.toMatchObject({ code: '42501' });
        for (const table of [
          'postwar_office_projection_document',
          'postwar_office_projection_page',
        ])
          await expect(
            read((executor) =>
              executor.query(`select * from world_v2.${table}`),
            ),
          ).rejects.toMatchObject({ code: '42501' });
        // The only callable reader derives country from the held current seat;
        // it has no caller-controlled country argument or raw-table fallback.
        const foreign = await read((executor) =>
          executor.query(
            "select * from world_v2.read_postwar_office_projection_page($1,'INDUSTRY','opening-inventory-entries',0,100,null) where scope_json->>'countryId'='COUNTRY_02'",
            [marker.worldId],
          ),
        );
        expect(foreign.rows).toEqual([]);
        await expect(
          read((executor) =>
            store.readPageFrom(executor, {
              worldId: marker.worldId,
              officeId: 'TRADE',
              dataset: 'public-service-summary',
            }),
          ),
        ).rejects.toThrow('INVALID_OFFICE_DATASET');
        await clone.installer.query(
          "update world_v2.projection_entitlement set active=false,revoked_at=now() where world_id=$1 and auth_subject=$2::uuid and classification='OFFICE_PRIVATE' and scope_key=$3",
          [marker.worldId, marker.subject, trade.scope.scopeKey],
        );
        expect(
          await read((executor) =>
            store.readPageFrom(executor, {
              worldId: marker.worldId,
              officeId: 'TRADE',
              dataset: 'opening-inventory-entries',
            }),
          ),
        ).toMatchObject({ status: 'DENIED' });
        // An active authorization with a revoked corresponding read entitlement
        // makes the whole current-seat tuple incoherent; every office closes.
        expect(
          await read((executor) =>
            store.readPageFrom(executor, {
              worldId: marker.worldId,
              officeId: 'INDUSTRY',
              dataset: 'opening-inventory-entries',
            }),
          ),
        ).toMatchObject({ status: 'DENIED' });
      } finally {
        await clone.drop();
      }
    }, 60000);
  },
);
