import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';

import { classifySupabaseArguments } from './supabase-policy.mjs';

const rawArguments = process.argv.slice(2);
const arguments_ =
  rawArguments[0] === '--' ? rawArguments.slice(1) : rawArguments;
const decision = classifySupabaseArguments(arguments_);

if (!decision.allowed) {
  console.error(
    `Blocked Supabase command: ${decision.command}. Only "status" and "--version" are allowed by the repository wrapper.`,
  );
  process.exit(2);
}

// Optional machine-local tool path; this never imports credentials or link data.
let entrypoint = process.env.SUPABASE_CLI_ENTRYPOINT;
const localConfig = new URL('../.supabase-cli.local.json', import.meta.url);
if (!entrypoint && existsSync(localConfig)) {
  try {
    const config = JSON.parse(readFileSync(localConfig, 'utf8'));
    if (
      !config ||
      Object.keys(config).length !== 1 ||
      typeof config.entrypoint !== 'string' ||
      !config.entrypoint
    )
      throw new Error();
    entrypoint = config.entrypoint;
  } catch {
    console.error('Invalid local Supabase CLI configuration.');
    process.exit(1);
  }
}
if (
  entrypoint &&
  (!isAbsolute(entrypoint) || !/\.[cm]?js$/u.test(entrypoint))
) {
  console.error('Supabase CLI entrypoint must be an absolute JavaScript path.');
  process.exit(1);
}
const result = spawnSync(
  entrypoint ? process.execPath : 'supabase',
  entrypoint ? [entrypoint, decision.command] : [decision.command],
  {
    encoding: 'utf8',
    stdio: 'inherit',
  },
);

if (result.error) {
  console.error(`Unable to execute Supabase CLI: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
