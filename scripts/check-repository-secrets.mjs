import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { findSensitivePatterns } from './repository-secrets-policy.mjs';

const git = spawnSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { encoding: 'utf8' },
);

if (git.status !== 0) {
  console.error(git.stderr || 'Unable to enumerate repository files');
  process.exit(1);
}

const files = git.stdout.split('\0').filter(Boolean);
const violations = [];

for (const file of files) {
  const source = await readFile(file, 'utf8').catch(() => null);
  if (source === null || source.includes('\0')) {
    continue;
  }

  for (const pattern of findSensitivePatterns(source)) {
    violations.push({ file, pattern });
  }
}

if (violations.length > 0) {
  console.error(JSON.stringify({ status: 'FAIL', violations }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify({ status: 'PASS', scannedFiles: files.length }, null, 2),
);
