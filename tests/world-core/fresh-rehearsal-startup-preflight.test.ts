import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect } from 'vitest';
import { inspectFreshRehearsalStartup } from '../../tools/office-connection/fresh-rehearsal-startup-preflight.mjs';
const repositoryRoot = path.resolve(import.meta.dirname, '../..');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

async function fixture(exact: boolean) {
  const directory = await mkdtemp(path.join(tmpdir(), 'fresh-preflight-'));
  const child = JSON.parse(
    await readFile(
      path.join(
        repositoryRoot,
        'config/postwar-genesis/finance-social-source-manifest.beneficial-child.v1.json',
      ),
      'utf8',
    ),
  );
  const bytes = 'TEST_ONLY_NON_SEED_BYTES_NOT_AUTHORITY\n';
  for (const name of ['parent.json', 'candidate-seed.json', 'receipts.json'])
    await writeFile(path.join(directory, name), bytes);
  const manifestFile = path.join(directory, 'manifest.json');
  await writeFile(
    manifestFile,
    JSON.stringify({
      schemaVersion: 'postwar-fresh-rehearsal-source-v1',
      classification: 'NEW_OFFLINE_REHEARSAL_NOT_RESTORED_H3',
      parentFile: path.join(directory, 'parent.json'),
      parentRawSha256: sha(bytes),
      worldId: child.worldId,
      seedId: child.seedId,
      parentSeedFingerprint: child.parentSeedFingerprint,
      seedFingerprint: exact
        ? child.seedFingerprint
        : 'sha256:' + '0'.repeat(64),
      files: {
        'candidate-seed.json': { sha256: sha(bytes) },
        'receipts.json': { sha256: sha(bytes) },
      },
      ready: true,
      validation: true,
    }),
  );
  return { directory, manifestFile, repositoryRoot };
}

describe('fresh source startup comparison is not admission', () => {
  it('collects all fixed-product blockers before any PG or Node is opened', async () => {
    const report = await inspectFreshRehearsalStartup(await fixture(false));
    expect(report.status).toBe('BLOCKED_SOURCE_BINDING');
    expect(report.dependencies).toHaveLength(4);
    expect(
      report.dependencies.every((d) => d.status.startsWith('BLOCKED_')),
    ).toBe(true);
    expect(report.database).toBe('NOT_STARTED');
    expect(report.node).toBe('NOT_STARTED');
  });
  it('never promotes matching manifest claims or ready booleans into Core proof', async () => {
    const report = await inspectFreshRehearsalStartup(await fixture(true));
    expect(report.status).toBe('PRECHECK_ONLY_FULL_VALIDATION_NOT_RUN');
    expect(report.fullCoreProof).toBe('NOT_ISSUED');
    expect(report.consumer).toBe('NOT_STARTED');
    expect(report.clock).toBe('NOT_STARTED');
    expect(report.omittedOptionalPlugin.status).toBe('NOT_CONFIGURED');
  });
  it('rejects changed receipt bytes despite a self-asserted matching identity', async () => {
    const input = await fixture(true);
    await writeFile(path.join(input.directory, 'receipts.json'), 'CHANGED');
    await expect(inspectFreshRehearsalStartup(input)).rejects.toThrow(
      'FRESH_SOURCE_BYTES_DIFFER:receipts.json',
    );
  });
});
