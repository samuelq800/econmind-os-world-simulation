/** Metadata equality protocol, not native DB, Core or source authority. */
import { expect, it } from 'vitest';
import { assertRetainedPowerSuccessorCatalog } from '../support/postwar-retained-power-reuse.js';
import { readRetainedPostwarPowerCatalogFrom } from '../support/postwar-retained-power-upgrade.js';

type Catalog = Awaited<ReturnType<typeof readRetainedPostwarPowerCatalogFrom>>;
const signature =
  'world_v2.publish_postwar_industry_first_day_source(text,text,text,text,text,text,text)';
const catalog = (): Catalog => ({
  roles: [{ oid: 1, rolname: 'TEST_ONLY_OWNER', rolcanlogin: false }],
  memberships: [],
  tables: [],
  policies: [],
  triggers: [],
  grantKey: 'TEST_ONLY_KEY',
  functions: [
    {
      signature,
      oid: 1,
      owner: 'world_v2_industry_source_owner',
      body_sha256: '1'.repeat(64),
      acl: 'TEST_ONLY_FIXED_ACL',
      readers: ['world_v2_industry_source_publisher'],
      security_definer: true,
      config: ['search_path=pg_catalog'],
    },
  ],
});
const forward = {
  signature,
  oldBodySha256: '1'.repeat(64),
  newBodySha256: '2'.repeat(64),
};
it('accepts the exact observed upgraded catalog and only the one forwarded body', () => {
  const expected = catalog();
  expect(() =>
    assertRetainedPowerSuccessorCatalog({
      actual: structuredClone(expected),
      expected,
    }),
  ).not.toThrow();
  const actual = catalog();
  actual.functions[0]!.body_sha256 = forward.newBodySha256;
  expect(() =>
    assertRetainedPowerSuccessorCatalog({
      actual,
      expected,
      forwardedFunction: forward,
    }),
  ).not.toThrow();
  expect(expected.functions[0]!.body_sha256).toBe(forward.oldBodySha256);
});
it('refuses an already changed predecessor, unknown function or non-body metadata drift', () => {
  const expected = catalog(),
    actual = catalog();
  actual.functions[0]!.body_sha256 = forward.newBodySha256;
  expect(() =>
    assertRetainedPowerSuccessorCatalog({ actual, expected }),
  ).toThrow();
  expect(() =>
    assertRetainedPowerSuccessorCatalog({
      actual,
      expected,
      forwardedFunction: { ...forward, signature: 'world_v2.unknown(text)' },
    }),
  ).toThrow();
  for (const patch of [
    { owner: 'DIFFERENT' },
    { acl: 'PUBLIC_EXEC' },
    { oid: 7 },
    { readers: ['PUBLIC'] },
    { security_definer: false },
    { config: ['search_path=public'] },
  ]) {
    const changed = catalog();
    Object.assign(changed.functions[0]!, patch);
    expect(() =>
      assertRetainedPowerSuccessorCatalog({ actual: changed, expected }),
    ).toThrow();
  }
});
it('does not allow the function-forward lane to hide tables, roles, memberships or extra functions', () => {
  const expected = catalog();
  for (const field of [
    'roles',
    'memberships',
    'tables',
    'policies',
    'triggers',
  ] as const) {
    const actual = catalog();
    actual[field] = [{ unexpected: true }];
    expect(() =>
      assertRetainedPowerSuccessorCatalog({ actual, expected }),
    ).toThrow();
  }
  const actual = catalog();
  actual.functions.push({
    ...actual.functions[0]!,
    oid: 2,
    signature: 'world_v2.unknown(text)',
  });
  expect(() =>
    assertRetainedPowerSuccessorCatalog({ actual, expected }),
  ).toThrow();
});
