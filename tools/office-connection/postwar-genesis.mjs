/** Explicit offline scenario preparation. No production DB, signature or start. */
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { writePostwarPublicationPackage } from './postwar-publication-package.mjs';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const usage =
  'Use --world WORLD_ID --seed SEED_ID --value-date YYYY-MM-DD --out NEW_DIRECTORY';
const options = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index],
    value = process.argv[index + 1];
  if (
    !['--world', '--seed', '--value-date', '--out'].includes(key) ||
    !value ||
    options.has(key)
  )
    throw Error(usage);
  options.set(key, value);
}
if (
  options.size !== 4 ||
  !/^\d{4}-\d{2}-\d{2}$/u.test(options.get('--value-date'))
)
  throw Error(usage);
const workerRoot = path.join(
  repositoryRoot,
  'apps/world-worker/dist/preparation',
);
const load = (name) =>
  import(pathToFileURL(path.join(workerRoot, name + '.js')).href);
const { preparePostwarWorldGenesis } = await load('postwar-world-genesis');
const { assemblePostwarGenesisCarrier } = await load(
  'postwar-genesis-carrier-assembly',
);
const { readPostwarNewWorldScopeFrom } = await load(
  'postwar-operating-genesis-adoption',
);
const prepared = await preparePostwarWorldGenesis({
  repositoryRoot,
  worldId: options.get('--world'),
  seedId: options.get('--seed'),
  valueDate: options.get('--value-date'),
  genesisVersion: 'POSTWAR_OPERATING_GENESIS_20261028_V1',
});
// The empty local database proves only this isolated preparation is new. The
// production publisher must observe/lock its own target; this is no permit.
const db = new PGlite();
let assembled;
try {
  await db.exec(
    'create schema world_v2; create table world_v2.world_head(world_id text primary key); create table world_v2.opening_seed(world_id text primary key)',
  );
  await db.exec('begin isolation level repeatable read read only');
  const scope = await readPostwarNewWorldScopeFrom(
    {
      async query(sql, parameters = []) {
        const result = await db.query(sql, [...parameters]);
        return { rows: result.rows, rowCount: result.rows.length };
      },
    },
    prepared.input.worldId,
  );
  await db.exec('rollback');
  assembled = await assemblePostwarGenesisCarrier({
    prepared,
    newWorldScope: scope,
  });
} finally {
  await db.close();
}
if (
  !assembled.finalSeed ||
  assembled.adoption.status !== 'PROJECT_ADOPTED_NOT_ADMITTED'
)
  throw Error('POSTWAR_GENERATION_NOT_ADOPTED');
const output = path.resolve(options.get('--out'));
await mkdir(output, { recursive: false, mode: 0o700 });
const save = async (name, bytes) =>
  writeFile(path.join(output, name), bytes, { flag: 'wx', mode: 0o600 });
const json = (value) => JSON.stringify(value, null, 2) + '\n';
const seedBytes = json(assembled.finalSeed);
await save('final-seed.json', seedBytes);
await save('carrier.json', json(assembled.carrier));
await save('financial-adoption.json', prepared.financial.receiptBytes);
await save('owner-instruction.json', prepared.financial.instructionBytes);
const publication = await writePostwarPublicationPackage({
  prepared,
  finalSeed: assembled.finalSeed,
  directory: path.join(output, 'source-package'),
});
const report = {
  schemaVersion: 'postwar-offline-genesis-evidence-v1',
  status: assembled.adoption.status,
  scope: 'ISOLATED_NEW_WORLD_PREPARATION_NOT_PRODUCTION',
  worldId: prepared.input.worldId,
  seedId: prepared.input.seedId,
  seedFingerprint: assembled.finalSeed.fingerprint,
  finalSeedFileSha256: createHash('sha256').update(seedBytes).digest('hex'),
  countries: prepared.monetary.bindings.length,
  regions: prepared.socialFinalized.regions.length,
  positions: prepared.labour.positions.length,
  inventoryEntries: assembled.finalSeed.inventoryEntries.length,
  rawSourceChanged: false,
  paymentsPosted: false,
  worldStarted: false,
  clockStarted: false,
  publicationSourceBundleSha256: publication.sourceBundleSha256,
  publicationPreflight: publication.publicationPreflight,
  remainingPublicationBlockers: publication.remainingBlockers.length,
  productionAdmission: 'NOT_RUN',
  formallyVerifiedOffices: 0,
};
await save('receipt.json', json(report));
process.stdout.write(json(report));
