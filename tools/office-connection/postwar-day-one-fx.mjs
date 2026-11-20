/** Offline fixed-policy quote package; reuses an existing new-World seed file.
 * No seed copy, signing, SQL, provider request, payment, or World/Clock start. */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i],
    value = process.argv[i + 1];
  if (!['--seed-file', '--out'].includes(key) || !value || args.has(key))
    throw Error(
      'Use --seed-file EXISTING_NEW_WORLD_SEED --out FRESH_DIRECTORY',
    );
  args.set(key, value);
}
if (args.size !== 2)
  throw Error('Use --seed-file EXISTING_NEW_WORLD_SEED --out FRESH_DIRECTORY');
const out = path.resolve(args.get('--out'));
await mkdir(out, { recursive: false, mode: 0o700 });
const sha = (s) => createHash('sha256').update(s).digest('hex');
try {
  const C = await import(
    pathToFileURL(path.join(root, 'packages/core/dist/index.js')).href
  );
  const P = await import(
    pathToFileURL(
      path.join(
        root,
        'apps/world-worker/dist/preparation/postwar-day-one-fx-policy.js',
      ),
    ).href
  );
  const bytes = await readFile(path.resolve(args.get('--seed-file')), 'utf8');
  const seed = C.parseOpeningSeed(JSON.parse(bytes), sha);
  const [policyBytes, userReceiptBytes] = await Promise.all([
    readFile(
      path.join(root, 'config/postwar-genesis/day-one-fx.v1.json'),
      'utf8',
    ),
    readFile(
      path.join(
        root,
        'docs/governance/owner-inputs/2026-10-29/DAY_ONE_FX_USER_ADOPTION.original.json',
      ),
      'utf8',
    ),
  ]);
  const policy = P.createPostwarDayOneFxPolicy({
    seed,
    policyBytes,
    userReceiptBytes,
  });
  await writeFile(
    path.join(out, 'day-one-fx-policy.json'),
    JSON.stringify(policy, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 },
  );
  const receipt = {
    schemaVersion: 'postwar-day-one-fx-offline-receipt-v1',
    status: policy.status,
    worldId: seed.worldId,
    seedFingerprint: seed.fingerprint,
    referencedSeedFileSha256: sha(bytes),
    policyFingerprint: policy.fingerprint,
    quoteCount: String(policy.quotes.length),
    validUntilSimTime: C.SIMULATION_TICKS_PER_DAY,
    rateUnits: 'LC_PER_GCU_EXACT',
    sourceBalancesClaimedAvailable: false,
    paymentsPosted: false,
    productionAdmission: 'NOT_RUN',
    worldClockStarted: false,
  };
  await writeFile(
    path.join(out, 'receipt.json'),
    JSON.stringify(receipt, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 },
  );
  process.stdout.write(JSON.stringify(receipt) + '\n');
} catch (error) {
  await writeFile(
    path.join(out, 'failure.json'),
    JSON.stringify({
      status: 'FAILED',
      message: error instanceof Error ? error.message : String(error),
    }) + '\n',
    { flag: 'wx', mode: 0o600 },
  );
  throw error;
}
