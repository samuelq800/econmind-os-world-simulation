/** Explicit offline new-World preparation; no existing DB, signing or deploy. */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { writePostwarPublicationPackage } from './postwar-publication-package.mjs';

export async function preparePostwarGcuOpeningCandidate({
  repositoryRoot,
  worldId,
  seedId,
  valueDate,
  outputDirectory,
}) {
  if (!path.isAbsolute(repositoryRoot) || !path.isAbsolute(outputDirectory))
    throw Error('POSTWAR_GCU_ABSOLUTE_PATHS_REQUIRED');
  // Reserve a fresh directory before the costly deterministic construction.
  // Failure retains its evidence and never overwrites/reuses an old seed.
  await mkdir(outputDirectory, { recursive: false, mode: 0o700 });
  const save = (name, bytes) =>
    writeFile(path.join(outputDirectory, name), bytes, {
      flag: 'wx',
      mode: 0o600,
    });
  const json = (value) => JSON.stringify(value, null, 2) + '\n';
  const load = (name) =>
    import(
      pathToFileURL(
        path.join(
          repositoryRoot,
          'apps/world-worker/dist/preparation',
          `${name}.js`,
        ),
      ).href
    );
  try {
    const {
      derivePostwarGcuBankOpening,
      appendPostwarGcuBankOpening,
      verifyPostwarGcuBankOpeningSeed,
    } = await load('postwar-gcu-bank-opening');
    const { preparePostwarWorldGenesis } = await load('postwar-world-genesis');
    const { assemblePostwarGenesisCarrier } = await load(
      'postwar-genesis-carrier-assembly',
    );
    const { readPostwarNewWorldScopeFrom } = await load(
      'postwar-operating-genesis-adoption',
    );
    const read = (file) => readFile(path.join(repositoryRoot, file), 'utf8');
    const [
      tradePlansBytes,
      compactMappingBytes,
      policyBytes,
      userReceiptBytes,
    ] = await Promise.all([
      read('artifacts/world-balanced-candidate-v1/data/trade-plans.json'),
      read('config/postwar-genesis/gcu-country-mapping.v1.json'),
      read('config/postwar-genesis/gcu-bank-opening.v1.json'),
      read(
        'docs/governance/owner-inputs/2026-10-29/GCU_OPENING_USER_ADOPTION.original.json',
      ),
    ]);
    const plan = derivePostwarGcuBankOpening({
      tradePlansBytes,
      compactMappingBytes,
      policyBytes,
      userReceiptBytes,
    });
    const prepared = await preparePostwarWorldGenesis({
      repositoryRoot,
      worldId,
      seedId,
      valueDate,
      genesisVersion: 'POSTWAR_OPERATING_GENESIS_20261028_V1',
    });
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
        worldId,
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
      throw Error('POSTWAR_GCU_PARENT_NOT_ADOPTED');
    const family = appendPostwarGcuBankOpening({
      parentSeed: assembled.finalSeed,
      plan,
    });
    const checked = verifyPostwarGcuBankOpeningSeed(family.seed);
    if (checked.seed.fingerprint !== family.seed.fingerprint)
      throw Error('POSTWAR_GCU_READBACK_MISMATCH');
    const seedBytes = json(family.seed);
    await save('final-seed.json', seedBytes);
    await save('gcu-opening-plan.json', json(plan));
    await save('gcu-user-adoption.original.json', userReceiptBytes);
    await save('gcu-policy.original.json', policyBytes);
    await save('financial-adoption.json', prepared.financial.receiptBytes);
    await save('owner-instruction.json', prepared.financial.instructionBytes);
    // Existing package verifier must explicitly recognize the new family.
    // It continues to require a fresh matching private signature for this fp.
    const publication = await writePostwarPublicationPackage({
      prepared,
      finalSeed: family.seed,
      directory: path.join(outputDirectory, 'source-package'),
    });
    const receipt = {
      schemaVersion: 'postwar-gcu-opening-candidate-receipt-v1',
      status: 'PROJECT_POLICY_ADOPTED_NOT_RUNTIME_ADMITTED',
      worldId,
      seedId,
      parentSeedFingerprint: family.parentSeed.fingerprint,
      seedFingerprint: family.seed.fingerprint,
      finalSeedFileSha256: createHash('sha256').update(seedBytes).digest('hex'),
      policyVersion: plan.policyVersion,
      planFingerprint: plan.fingerprint,
      countries: String(family.accounts.length),
      initialGcuCash: plan.totalGcu,
      initialGcuEquity: plan.totalGcu,
      additionalInitialNetWealthGcu: plan.totalGcu,
      originalBalancesChanged: false,
      historicalPaymentsCreated: false,
      executableQuotesCreated: false,
      worldStarted: false,
      clockStarted: false,
      targetAbsenceProof:
        'ISOLATED_PREPARATION_ONLY_TARGET_PUBLICATION_MUST_RECHECK',
      publicationSourceBundleSha256: publication.sourceBundleSha256,
      productionAdmission: 'NOT_RUN',
    };
    await save('receipt.json', json(receipt));
    return receipt;
  } catch (error) {
    await save(
      'failure.json',
      json({
        status: 'FAILED_NOT_ADMITTED',
        error: error instanceof Error ? error.message : String(error),
        worldId,
        seedId,
      }),
    );
    throw error;
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const options = new Map();
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i],
      value = process.argv[i + 1];
    if (
      !['--world', '--seed', '--value-date', '--out'].includes(key) ||
      !value ||
      options.has(key)
    )
      throw Error(
        'Use --world NEW_WORLD --seed NEW_SEED --value-date YYYY-MM-DD --out NEW_DIRECTORY',
      );
    options.set(key, value);
  }
  if (
    options.size !== 4 ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(options.get('--value-date'))
  )
    throw Error('POSTWAR_GCU_CLI_ARGUMENTS_REQUIRED');
  const receipt = await preparePostwarGcuOpeningCandidate({
    repositoryRoot: fileURLToPath(new URL('../../', import.meta.url)),
    worldId: options.get('--world'),
    seedId: options.get('--seed'),
    valueDate: options.get('--value-date'),
    outputDirectory: path.resolve(options.get('--out')),
  });
  process.stdout.write(JSON.stringify(receipt, null, 2) + '\n');
}
