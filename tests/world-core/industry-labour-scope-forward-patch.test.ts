/** Offline artifact contract only. Actual SQL catalog/apply checks belong to
 * the separately coordinated owned-clone test, never inferred from these. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildIndustryLabourScopeForwardPatch,
  INDUSTRY_LABOUR_FORWARD_PREDECESSOR_SHA256,
} from '../support/industry-labour-scope-forward-patch.js';
const previousSql = readFileSync(
  new URL(
    '../../database/proposals/postwar-industry-labour-current-read.sql',
    import.meta.url,
  ),
  'utf8',
);
const digest = (text: string) =>
  createHash('sha256').update(text).digest('hex');
// Deliberately tiny TEST_ONLY next body: these tests verify packaging, not the
// correctness or adoption of the real source extraction/repair economics.
const nextSql =
  previousSql.replace(
    'root:=s.canonical_payload::jsonb;',
    'root:=s.canonical_payload::jsonb; -- TEST_ONLY_CHANGED_FUNCTION_BODY\n',
  ) +
  `\ncreate function world_v2.repair_postwar_industry_regional_source_capacity(p_world text,p_country text)
returns world_v2.postwar_office_projection_document
language plpgsql security definer set search_path=pg_catalog as $$
begin raise exception 'TEST_ONLY_NO_DATABASE_EXECUTION';end;$$;\n`;
const build = (sql = nextSql) =>
  buildIndustryLabourScopeForwardPatch({
    previousSql,
    nextSql: sql,
    expectedNextSqlSha256: digest(sql),
  });
describe('fixed Industry labour function-only forward artifact', () => {
  it('pins the predecessor and emits only one changed body and one exact new RPC', () => {
    expect(digest(previousSql)).toBe(
      INDUSTRY_LABOUR_FORWARD_PREDECESSOR_SHA256,
    );
    const artifact = build();
    expect(artifact.sha256).toBe(digest(artifact.sql));
    expect(artifact).toEqual(build());
    expect(artifact.functions.map((f) => [f.signature, f.operation])).toEqual([
      ['world_v2.prepare_postwar_industry_labour_scopes(text)', 'REPLACE'],
      [
        'world_v2.repair_postwar_industry_regional_source_capacity(text,text)',
        'CREATE',
      ],
    ]);
    expect(
      artifact.functions.every(
        (f) =>
          f.owner === 'world_v2_postwar_projection_owner' &&
          f.executeRoles.join() === 'world_v2_postwar_projection_publisher',
      ),
    ).toBe(true);
    expect(artifact.sql.match(/^begin;$/gm)).toHaveLength(1);
    expect(artifact.sql.match(/^commit;$/gm)).toHaveLength(1);
    expect(artifact.sql).not.toMatch(
      /^(?:create table|create role|create policy|insert into world_v2\.)/imu,
    );
    expect(artifact.sql).not.toContain(
      'postwar_industry_labour_document values',
    );
    expect(artifact.sql).toContain('old_acl:=f.proacl;old_oid:=f.oid');
    expect(artifact.sql).toContain('f.proacl is distinct from old_acl');
    expect(artifact.sql).toContain('UNKNOWN COMMIT');
    expect(artifact.sql).toContain('NEW_RPC_ALREADY_EXISTS');
    for (const fn of artifact.functions)
      expect(artifact.sql).toContain(fn.newBodySha256);
  });
  it('refuses altered predecessor bytes or an unpinned next source', () => {
    expect(() =>
      buildIndustryLabourScopeForwardPatch({
        previousSql: previousSql + '\n',
        nextSql,
        expectedNextSqlSha256: digest(nextSql),
      }),
    ).toThrow('EXACT_PREDECESSOR_SOURCE_REQUIRED');
    expect(() =>
      buildIndustryLabourScopeForwardPatch({
        previousSql,
        nextSql,
        expectedNextSqlSha256: '0'.repeat(64),
      }),
    ).toThrow('EXACT_NEXT_SOURCE_REQUIRED');
  });
  it('refuses prepare contract drift, duplicate or missing fixed definitions', () => {
    expect(() =>
      build(
        nextSql.replace(
          'scopes(p_world text)returns void',
          'scopes(p_world text)returns text',
        ),
      ),
    ).toThrow('SAME_PREPARE_CONTRACT');
    expect(() =>
      build(
        nextSql.replace(
          'repair_postwar_industry_regional_source_capacity',
          'other_repair',
        ),
      ),
    ).toThrow('EXACT_FUNCTION_REQUIRED');
    expect(() => build(nextSql + nextSql)).toThrow('EXACT_FUNCTION_REQUIRED');
    expect(() =>
      build(
        nextSql.replace(
          'returns world_v2.postwar_office_projection_document',
          'returns jsonb',
        ),
      ),
    ).toThrow('FIXED_REPAIR_CONTRACT_REQUIRED');
    expect(() =>
      build(
        nextSql.replace(
          'returns world_v2.postwar_office_projection_document',
          'returns setof world_v2.postwar_office_projection_document',
        ),
      ),
    ).toThrow('FIXED_REPAIR_CONTRACT_REQUIRED');
  });
  it('refuses quoted-body delimiter collisions rather than emitting executable ambiguity', () => {
    expect(() =>
      build(nextSql.replace('TEST_ONLY_CHANGED_FUNCTION_BODY', '$patch$')),
    ).toThrow('DOLLAR_DELIMITER_COLLISION');
    expect(() =>
      build(nextSql.replace('TEST_ONLY_CHANGED_FUNCTION_BODY', '$nextbody$')),
    ).toThrow('DOLLAR_DELIMITER_COLLISION');
  });
});
