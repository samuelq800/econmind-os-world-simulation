/** Actual PG16.15 over bounded TEST_ONLY source originals. This is neither
 * restoration of the sealed H3 world nor 70-country/Node/browser acceptance. */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSocialEmploymentCreationSqlFixture } from '../support/social-employment-creation-sql-fixture.js';
import { createSocialEmploymentCreationNativeDatabase } from '../support/social-employment-creation-native-db.js';
import {
  preparePostwarSocialEmploymentCreationForward,
  preparePostwarSocialEmploymentCreationOrdinalForward,
} from '../support/postwar-social-employment-creation-forward.js';
const suite =
  process.env.ECONMIND_SOCIAL_ORDINAL_NATIVE === '1' ? describe : describe.skip;
const root = path.resolve(import.meta.dirname, '../..');
const signature =
  'world_v2.prepare_postwar_social_employment_creation_licences(text)';
suite('isolated native Social absolute personnel-range contract', () => {
  it('reproduces old rejection, repairs exactly one body and preserves licence idempotence and role denial', async () => {
    const native = await createSocialEmploymentCreationNativeDatabase();
    const checks: string[] = [];
    try {
      const f = await createSocialEmploymentCreationSqlFixture(
        'DC5_PREDECESSOR',
        'VALID_ABSOLUTE',
        async () => native.db,
      );
      const full = await preparePostwarSocialEmploymentCreationForward(root);
      const fix =
        await preparePostwarSocialEmploymentCreationOrdinalForward(root);
      await f.admin();
      await f.db.exec(full.sql);
      await f.db.exec(
        await readFile(
          path.join(
            root,
            'tests/fixtures/sql/postwar-social-employment-creation.v1-initializer.sql',
          ),
          'utf8',
        ),
      );
      const metadata = async () =>
        (
          await f.db.query(
            `select oid,proowner,proacl::text acl,proconfig,prosecdef,proargnames,proisstrict,provolatile,proparallel,encode(sha256(convert_to(prosrc,'UTF8')),'hex')body from pg_proc where oid=to_regprocedure($1)`,
            [signature],
          )
        ).rows[0]!;
      const before = await metadata();
      expect(before.body).toBe(fix.functions[0]!.oldBodySha256);
      await expect(f.prepareLicences()).rejects.toThrow(
        'SOCIAL_CREATION_ACTUAL_DUTY_TIME_REQUIRED',
      );
      await f.admin();
      expect(
        (
          await f.db.query(
            'select * from world_v2.postwar_social_employment_creation_licence',
          )
        ).rows,
      ).toHaveLength(0);
      checks.push(
        'OLD_V1_REJECTED_VALID_NONZERO_ABSOLUTE_RANGE_WITH_ZERO_LICENCES',
      );
      await f.db.exec(fix.sql);
      const after = await metadata();
      expect(after.body).toBe(fix.functions[0]!.newBodySha256);
      expect({ ...after, body: null }).toEqual({ ...before, body: null });
      checks.push('EXACT_ONE_BODY_CHANGED_OID_OWNER_ACL_CONFIG_UNCHANGED');
      expect(
        (await f.prepareLicences()).rows[0]!
          .prepare_postwar_social_employment_creation_licences,
      ).toBe(2);
      await f.admin();
      const licences = (
        await f.db.query(
          'select * from world_v2.postwar_social_employment_creation_licence order by country_id,licence_ref',
        )
      ).rows;
      expect(
        (await f.prepareLicences()).rows[0]!
          .prepare_postwar_social_employment_creation_licences,
      ).toBe(2);
      await f.admin();
      expect(
        (
          await f.db.query(
            'select * from world_v2.postwar_social_employment_creation_licence order by country_id,licence_ref',
          )
        ).rows,
      ).toEqual(licences);
      checks.push('INITIALIZER_REPEATED_WITH_IDENTICAL_TWO_LICENCES');
      await expect(f.db.exec(fix.sql)).rejects.toThrow();
      await f.admin();
      expect(await metadata()).toEqual(after);
      checks.push(
        'ONE_FUNCTION_FORWARD_REPEAT_REJECTED_WITHOUT_CATALOG_CHANGE',
      );
      await f.readerSession();
      await expect(
        f.db.query(
          'select world_v2.prepare_postwar_social_employment_creation_licences($1)',
          [f.world],
        ),
      ).rejects.toThrow('permission denied');
      await f.readerSession();
      await expect(
        f.db.query(
          'select * from world_v2.postwar_social_employment_creation_licence',
        ),
      ).rejects.toThrow('permission denied');
      await f.admin();
      checks.push('ONLINE_READER_INITIALIZATION_AND_RAW_LICENCE_READ_DENIED');
      await f.assertActualCreationChain();
      checks.push(
        'SMALL_SOURCE_CORE_CREATE_PLAN_MATCH_SQL_READBACK_WITH_ZERO_POSTINGS',
      );
      native.report.status = 'PASS';
      native.report.checks = checks;
      native.report.forward = {
        sha256: fix.sha256,
        manifestSha256: fix.manifestSha256,
        old: before,
        new: after,
      };
      await native.save();
    } catch (error) {
      native.report.status = 'FAIL';
      native.report.checks = checks;
      native.report.failure =
        error instanceof Error ? error.message : String(error);
      await native.save();
      throw error;
    } finally {
      await native.db.close();
    }
  }, 120_000);

  it.each(['BEFORE_START', 'AFTER_END', 'OVERLAPPING_DUTIES'] as const)(
    'rejects actual admitted TEST_ONLY source violation %s without licence rows',
    async (sourceCase) => {
      const native = await createSocialEmploymentCreationNativeDatabase();
      try {
        const f = await createSocialEmploymentCreationSqlFixture(
          'CREATE_FRESH',
          sourceCase,
          async () => native.db,
        );
        await expect(f.prepareLicences()).rejects.toThrow(
          'SOCIAL_CREATION_ACTUAL_DUTY_TIME_REQUIRED',
        );
        await f.admin();
        expect(
          (
            await f.db.query(
              'select * from world_v2.postwar_social_employment_creation_licence',
            )
          ).rows,
        ).toHaveLength(0);
        native.report.status = 'PASS';
        native.report.sourceCase = sourceCase;
        await native.save();
      } catch (error) {
        native.report.status = 'FAIL';
        native.report.failure =
          error instanceof Error ? error.message : String(error);
        await native.save();
        throw error;
      } finally {
        await native.db.close();
      }
    },
    120_000,
  );
});
