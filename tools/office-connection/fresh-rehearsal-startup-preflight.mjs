/** Read-only file/binding preflight. A manifest is evidence to compare, never a
 * Core proof, admission, publisher permit, lease or runnable Node descriptor.
 * No database, Docker, authority registration or economic operation is opened. */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { REGISTERED_FINAL_NATIVE_SQL_ORDER } from './registered-final-native-sql.mjs';

async function fileEvidence(file) {
  const digest = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(file)) {
    digest.update(chunk);
    bytes += chunk.length;
  }
  return { path: file, sha256: digest.digest('hex'), bytes };
}

export async function inspectFreshRehearsalStartup({
  repositoryRoot,
  manifestFile,
}) {
  const root = path.resolve(repositoryRoot);
  const manifestPath = path.resolve(manifestFile);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (
    manifest.schemaVersion !== 'postwar-fresh-rehearsal-source-v1' ||
    manifest.classification !== 'NEW_OFFLINE_REHEARSAL_NOT_RESTORED_H3' ||
    !path.isAbsolute(manifest.parentFile) ||
    !/^[a-f0-9]{64}$/u.test(manifest.parentRawSha256) ||
    typeof manifest.worldId !== 'string' ||
    typeof manifest.seedId !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/u.test(manifest.parentSeedFingerprint) ||
    !/^sha256:[a-f0-9]{64}$/u.test(manifest.seedFingerprint)
  )
    throw Error('FRESH_SOURCE_FILE_MANIFEST_REQUIRED_NOT_AUTHORITY');
  const files = [
    { file: manifest.parentFile, expected: manifest.parentRawSha256 },
    ...['candidate-seed.json', 'receipts.json'].map((name) => ({
      file: path.join(path.dirname(manifestPath), name),
      expected: manifest.files?.[name]?.sha256,
    })),
  ];
  const checked = [];
  for (const item of files) {
    if (!/^[a-f0-9]{64}$/u.test(item.expected))
      throw Error('ACTUAL_ARTIFACT_SHA256_REQUIRED');
    const actual = await fileEvidence(item.file);
    if (actual.sha256 !== item.expected)
      throw Error('FRESH_SOURCE_BYTES_DIFFER:' + path.basename(item.file));
    checked.push(actual);
  }
  const parent = JSON.parse(
    await readFile(
      path.join(
        root,
        'config/postwar-genesis/finance-social-source-manifest.v1.json',
      ),
      'utf8',
    ),
  );
  const child = JSON.parse(
    await readFile(
      path.join(
        root,
        'config/postwar-genesis/finance-social-source-manifest.beneficial-child.v1.json',
      ),
      'utf8',
    ),
  );
  const exact =
    manifest.worldId === child.worldId &&
    manifest.seedId === child.seedId &&
    manifest.parentSeedFingerprint === parent.seedFingerprint &&
    manifest.seedFingerprint === child.seedFingerprint;
  const bindingState = exact
    ? 'PIN_MATCH_ONLY_CORE_PROOF_STILL_REQUIRED'
    : 'BLOCKED_NEW_SOURCE_NOT_BOUND_BY_CURRENT_PRODUCT';
  const bindings = [
    [
      'Finance/Social source publication',
      [
        'apps/world-worker/src/persistence/postwar-finance-social-source-publication.ts',
        'database/proposals/postwar-finance-social-source-publication.sql',
      ],
    ],
    [
      'Day-one FX source publication and reads',
      [
        'apps/world-worker/src/persistence/postgres-postwar-day-one-fx-originals.ts',
        'database/proposals/postwar-day-one-fx-custody.sql',
      ],
    ],
    [
      'Captain adopted child preparation',
      ['apps/world-worker/src/preparation/postwar-captain-opening-source.ts'],
    ],
    [
      'Historical native fixture and H0 host',
      [
        'tests/support/postwar-beneficial-rent-child-native-fixture.ts',
        'tests/support/registered-final-node-setup.ts',
        'tests/support/registered-final-child-h0-readback.ts',
        'tools/office-connection/native-registered-final-host.mjs',
      ],
    ],
  ];
  const dependencies = [];
  for (const [dependency, filenames] of bindings)
    dependencies.push({
      dependency,
      status: bindingState,
      files: await Promise.all(
        filenames.map((file) => fileEvidence(path.join(root, file))),
      ),
    });
  return {
    schemaVersion: 'fresh-rehearsal-startup-preflight-v1',
    classification: 'READ_ONLY_FILE_AND_BINDING_COMPARISON_NOT_AUTHORITY',
    status: exact
      ? 'PRECHECK_ONLY_FULL_VALIDATION_NOT_RUN'
      : 'BLOCKED_SOURCE_BINDING',
    manifest: await fileEvidence(manifestPath),
    artifacts: checked,
    suppliedIdentity: {
      worldId: manifest.worldId,
      seedId: manifest.seedId,
      parentSeedFingerprint: manifest.parentSeedFingerprint,
      seedFingerprint: manifest.seedFingerprint,
    },
    expectedCurrentIdentity: {
      worldId: child.worldId,
      seedId: child.seedId,
      parentSeedFingerprint: parent.seedFingerprint,
      seedFingerprint: child.seedFingerprint,
    },
    dependencies,
    socialCreationSql: {
      inExistingFullPlan: REGISTERED_FINAL_NATIVE_SQL_ORDER.includes(
        'postwar-social-employment-creation',
      ),
      requiredBeforeCreate:
        'database/proposals/postwar-social-employment-creation.sql',
    },
    requiredBeforeNode: [
      'Actual complete Core parent/child/70-receipt validation',
      'New owned TEST_ONLY target absence and controlled seed admission',
      'Actual separately authorized source publication and readback',
      'Actor/seat/source/control registrations and least-privilege reads',
      'Exclusive writer lease and explicit finite-consumer registration',
      'Same frozen source/build candidate for Node and browser',
    ],
    omittedOptionalPlugin: {
      name: 'centralBankOmo',
      status: 'NOT_CONFIGURED',
      reason:
        'No actual independent security/quote adoption supplied; CB current read remains in scope',
    },
    fullCoreProof: 'NOT_ISSUED',
    database: 'NOT_STARTED',
    node: 'NOT_STARTED',
    consumer: 'NOT_STARTED',
    clock: 'NOT_STARTED',
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const [manifestFile, repositoryRoot = process.cwd()] = process.argv.slice(2);
  if (!manifestFile)
    throw Error(
      'Usage: fresh-rehearsal-startup-preflight.mjs MANIFEST [REPOSITORY]',
    );
  const report = await inspectFreshRehearsalStartup({
    repositoryRoot,
    manifestFile,
  });
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  if (report.status === 'BLOCKED_SOURCE_BINDING') process.exitCode = 2;
}
