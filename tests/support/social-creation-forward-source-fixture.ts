/** Historical source tree for fixed upgrade regressions; never a current candidate. */
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export async function createSocialCreationForwardSourceFixture() {
  const repositoryRoot = path.resolve(import.meta.dirname, '../..');
  const root = await mkdtemp(path.join(tmpdir(), 'social-forward-source-'));
  const copy = async (relative: string, bytes: string | Buffer) => {
    await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
    await writeFile(path.join(root, relative), bytes);
  };
  const cleanup = () => rm(root, { recursive: true, force: true });
  try {
    const loader =
      'tests/support/postwar-social-employment-creation-forward.ts';
    await copy(loader, await readFile(path.join(repositoryRoot, loader)));
    for (const name of [
      'postwar-social-employment-creation',
      'postwar-social-employment-creation-ordinal',
    ]) {
      const relative = `database/upgrades/${name}.manifest.json`;
      const bytes = await readFile(path.join(repositoryRoot, relative));
      const manifest = JSON.parse(bytes.toString('utf8'));
      await copy(relative, bytes);
      await copy(
        manifest.upgrade.path,
        await readFile(path.join(repositoryRoot, manifest.upgrade.path)),
      );
      for (const source of [...manifest.sourcePins, manifest.newSupplement]) {
        await copy(
          source.path,
          execFileSync(
            'git',
            [
              '--no-replace-objects',
              'show',
              `${manifest.targetSourceCommit}:${source.path}`,
            ],
            { cwd: repositoryRoot, maxBuffer: 4 * 1024 * 1024 },
          ),
        );
      }
    }
    return { root, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
