import { spawnSync } from 'node:child_process';

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

const result = spawnSync('supabase', [decision.command], {
  encoding: 'utf8',
  stdio: 'inherit',
});

if (result.error) {
  console.error(`Unable to execute Supabase CLI: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
