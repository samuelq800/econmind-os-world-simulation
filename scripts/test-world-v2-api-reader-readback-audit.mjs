import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderWorldV2ApiReaderReadbackAudit } from './render-world-v2-api-reader-readback-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const audit = await renderWorldV2ApiReaderReadbackAudit(root);

assert.equal(
  audit.migration.migration_id,
  '0020_world_v2_official_country_reader',
);
assert.equal(audit.migration.release_order, 20);
assert.ok(audit.query.includes("'READBACK_AUDIT'"));
assert.ok(audit.query.includes("'postgres'"));
assert.ok(audit.query.includes('rolcreaterole'));
assert.ok(audit.query.includes('grantor_role.rolname'));
assert.ok(audit.query.includes('policy.tablename in'));
for (const token of [
  'begin;',
  'commit;',
  'create ',
  'alter ',
  'insert ',
  'update ',
  'delete ',
  'revoke ',
  'grant ',
]) {
  assert.equal(audit.query.toLowerCase().includes(token), false, token);
}

process.stdout.write(
  JSON.stringify({
    status: 'PASS',
    audit: 'READ_ONLY',
    requestBytes: Buffer.byteLength(JSON.stringify({ query: audit.query })),
  }) + '\n',
);
