/** Catalogue-only protocol tests. Synthetic additions are not installed SQL,
 * source authority, actor permissions or a genuine runtime preparation. */
import { readFile } from 'node:fs/promises';
import { it, expect } from 'vitest';
import {
  assertRegisteredSocialForwardCatalog,
  type SocialForwardMetadata,
} from '../support/registered-social-retained-upgrade.js';
import { readRetainedOpeningBaseEvidence } from '../support/postwar-retained-opening-base-evidence.js';
import type { readRetainedPostwarPowerCatalogFrom } from '../support/postwar-retained-power-upgrade.js';
type Catalog = Awaited<ReturnType<typeof readRetainedPostwarPowerCatalogFrom>>;
type Row = Record<string, unknown>;
const before = JSON.parse(
  await readFile(
    '/workspace/.cloud-setup/evidence/c10-opening-base-repair-03/catalog-after.json',
    'utf8',
  ),
) as Catalog;
const manifest = JSON.parse(
  await readFile(
    new URL(
      '../../database/upgrades/postwar-social-employment-creation.manifest.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as SocialForwardMetadata;
const owner = 'world_v2_postwar_projection_owner',
  ownerId = (before.roles as Row[]).find((r) => r.rolname === owner)!.oid;
const parentIds = (before.tables as Row[])
  .filter((r) =>
    ['postwar_social_prefix_scope', 'runtime_opening_admission'].includes(
      String(r.relname),
    ),
  )
  .map((r) => r.oid);
const reject = before.functions.find(
  (f) => f.signature === 'world_v2.reject_authoritative_history_mutation()',
)!;
const ids = ['1', '2', '3', '4'];
const world =
    "(world_id = current_setting('econmind.postwar_projection_world'::text, true))",
  ownerQual =
    "((CURRENT_USER = 'world_v2_postwar_projection_owner'::name) AND " +
    world +
    ')';
const policyExpressions = [
  { name: 'social_creation_licence_owner', qual: ownerQual, check: ownerQual },
  { name: 'social_creation_licence_world', qual: world, check: null },
];
function fixture() {
  const after = structuredClone(before);
  const specs = new Map(manifest.functions.map((f) => [f.signature, f]));
  after.functions = after.functions.map((f) =>
    specs.has(f.signature)
      ? { ...f, body_sha256: specs.get(f.signature)!.newBodySha256 }
      : f,
  );
  for (const [s, f] of manifest.newSupplementFunctions.entries())
    after.functions.push({
      ...before.functions[0]!,
      oid: 99990 + s,
      signature: f.signature,
      owner,
      body_sha256: f.sha256,
      security_definer: true,
      config: ['search_path=pg_catalog'],
      proargnames: f.argumentNames,
      result: f.result,
      proisstrict: false,
      provolatile: 'v',
      proparallel: 'u',
      acl: '{' + f.roles.map((r) => r + '=X/' + owner).join(',') + '}',
    });
  (after.tables as Row[]).push({
    oid: '99980',
    relname: 'postwar_social_employment_creation_licence',
    relowner: ownerId,
    relacl: null,
    relrowsecurity: true,
    relforcerowsecurity: true,
  });
  (after.policies as Row[]).push(
    ...policyExpressions.map((p, i) => ({
      oid: String(99970 + i),
      polname: p.name,
      polrelid: '99980',
      polcmd: '*',
      polpermissive: i === 0,
      polroles: [ownerId],
      polqual: 'TEST_ONLY_AST_NOT_SQL_PROOF',
      polwithcheck: i === 0 ? 'TEST_ONLY_AST' : null,
    })),
  );
  (after.triggers as Row[]).push(
    ...[
      'social_creation_licence_immutable',
      'social_creation_licence_no_truncate',
    ].map((name, i) => ({
      oid: String(99960 + i),
      tgname: name,
      tgisinternal: false,
      tgrelid: '99980',
      tgfoid: reject.oid,
      tgenabled: 'O',
    })),
  );
  for (let p = 0; p < 2; p++)
    for (let i = 0; i < 4; i++)
      (after.triggers as Row[]).push({
        oid: String(99940 + p * 4 + i),
        tgisinternal: true,
        tgrelid: i < 2 ? '99980' : parentIds[p],
        tgconstrrelid: i < 2 ? parentIds[p] : '99980',
        tgfoid: ids[i],
        tgenabled: 'O',
      });
  return after;
}
const check = (after: Catalog, expressions = policyExpressions) =>
  assertRegisteredSocialForwardCatalog({
    before,
    after,
    manifest,
    foreignKeyFunctionIds: ids,
    policyExpressions: expressions,
  });
it('pins the separately repaired catalogue and preserves all 16 real C10 documents', async () => {
  const e = await readRetainedOpeningBaseEvidence(
    new URL('../..', import.meta.url).pathname,
  );
  expect(e.documents).toHaveLength(16);
  expect(e.provenance).toHaveLength(2);
  expect(e.catalog).toEqual(before);
});
it('matches all 13 actual predecessor bodies and permits exactly the known DATA delta', () =>
  expect(() => check(fixture())).not.toThrow());
it.each([
  'unknown-function',
  'extra-ACL',
  'old-policy-change',
  'wrong-target-body',
  'unsafe-policy',
  'wrong-FK-function',
] as const)('rejects %s metadata drift', (kind) => {
  const after = fixture();
  if (kind === 'unknown-function')
    after.functions.push({
      ...before.functions[0]!,
      signature: 'world_v2.unreviewed_extra()',
    });
  if (kind === 'extra-ACL')
    after.functions[after.functions.length - 1]!.acl =
      '{PUBLIC=X/' + owner + '}';
  if (kind === 'old-policy-change')
    (after.policies as Row[])[0]!.polpermissive = !(after.policies as Row[])[0]!
      .polpermissive;
  if (kind === 'wrong-target-body')
    after.functions.find(
      (f) => f.signature === manifest.functions[0]!.signature,
    )!.body_sha256 = '0'.repeat(64);
  if (kind === 'wrong-FK-function')
    (after.triggers as Row[]).at(-1)!.tgfoid = 'UNKNOWN_TRIGGER_FN';
  const expressions =
    kind === 'unsafe-policy'
      ? policyExpressions.map((p) => ({ ...p, qual: 'true' }))
      : policyExpressions;
  expect(() => check(after, expressions)).toThrow();
});
