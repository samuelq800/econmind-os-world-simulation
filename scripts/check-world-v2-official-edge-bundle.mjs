import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const functionRoot = path.join(
  root,
  'supabase/functions/world-v2-official-read',
);
const committed = path.join(functionRoot, 'lib');
const temporary = await mkdtemp(
  path.join(os.tmpdir(), 'world-v2-edge-bundle-'),
);

async function files(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory())
      result.push(...(await files(path.join(directory, entry.name), relative)));
    else if (entry.isFile()) result.push(relative);
    else throw new Error('OFFICIAL_EDGE_BUNDLE_NONFILE');
  }
  return result.sort();
}

try {
  await execFileAsync(
    process.execPath,
    [
      path.join(root, 'node_modules/typescript/bin/tsc'),
      '-p',
      path.join(root, 'tsconfig.world-v2-official-edge-bundle.json'),
      '--outDir',
      temporary,
    ],
    { cwd: root, maxBuffer: 2_000_000 },
  );
  const generatedFiles = await files(temporary);
  assert.deepEqual(
    await files(committed),
    generatedFiles,
    'OFFICIAL_EDGE_BUNDLE_FILE_SET_DRIFT',
  );
  const hash = createHash('sha256');
  for (const relative of generatedFiles) {
    const expected = await readFile(path.join(temporary, relative));
    const actual = await readFile(path.join(committed, relative));
    assert.deepEqual(
      actual,
      expected,
      `OFFICIAL_EDGE_BUNDLE_CONTENT_DRIFT:${relative}`,
    );
    hash.update(relative).update('\0').update(expected).update('\0');
  }
  assert.equal(
    generatedFiles.length,
    20,
    'OFFICIAL_EDGE_BUNDLE_UNEXPECTED_MODULE_COUNT',
  );
  process.stdout.write(
    JSON.stringify({
      status: 'PASS',
      function: 'world-v2-official-read',
      generatedFiles: generatedFiles.length,
      sha256: hash.digest('hex'),
      deployment: 'NOT_RUN',
    }) + '\n',
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
