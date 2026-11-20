#!/usr/bin/env node
/** Offline, read-only source coverage; no seed, DB, admission or runtime issued. */
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const repositoryRoot = process.cwd();
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--out')
  throw Error(
    'Usage: node tools/office-connection/postwar-refinery-source-coverage.mjs --out <report.json>',
  );
for (const name of [
  'postwar-industry-refinery-sites',
  'postwar-industry-first-day-source',
]) {
  const source = await stat(
    path.join(
      repositoryRoot,
      'apps/world-worker/src/persistence/' + name + '.ts',
    ),
  );
  const emitted = await stat(
    path.join(
      repositoryRoot,
      'apps/world-worker/dist/persistence/' + name + '.js',
    ),
  );
  if (emitted.mtimeMs < source.mtimeMs)
    throw Error('FRESH_OWN_WORKER_BUILD_REQUIRED:' + name);
}
const { loadPostwarSourceContext } = await import(
  pathToFileURL(
    path.join(
      repositoryRoot,
      'apps/world-worker/dist/preparation/postwar-source-context.js',
    ),
  ).href
);
const { readPostwarIndustryRefineryCoverage } = await import(
  pathToFileURL(
    path.join(
      repositoryRoot,
      'apps/world-worker/dist/persistence/postwar-industry-refinery-sites.js',
    ),
  ).href
);
const { loadPostwarIndustryFirstDayAdoptedPolicy } = await import(
  pathToFileURL(
    path.join(
      repositoryRoot,
      'apps/world-worker/dist/persistence/postwar-industry-first-day-source.js',
    ),
  ).href
);
await loadPostwarIndustryFirstDayAdoptedPolicy(repositoryRoot);
const context = await loadPostwarSourceContext(repositoryRoot),
  coverage = readPostwarIndustryRefineryCoverage(context);
const sha = (s) => createHash('sha256').update(s).digest('hex');
const originals = {};
for (const f of [
  'artifacts/world-balanced-candidate-v1/data/facilities.json',
  'artifacts/world-balanced-candidate-v1/data/recipes.json',
  'artifacts/world-balanced-candidate-v1/data/domestic-access.json',
  'config/postwar-genesis/industry-first-day.v1.json',
  'docs/governance/owner-inputs/2026-11-01/INDUSTRY_FIRST_DAY_USER_ADOPTION.original.json',
])
  originals[f] = sha(await readFile(path.join(repositoryRoot, f)));
const report = {
  classification: 'ACTUAL_PINNED_SOURCE_VALIDATION_NOT_RUNTIME_ACCEPTANCE',
  recordedAt: new Date().toISOString(),
  repositoryHead: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim(),
  sourceChecksumsSha256: context.source.pins.checksumsSha256,
  originals,
  counts: {
    countries: coverage.countries.length,
    refinerySites: coverage.sites.length,
    countriesWithRefinery: new Set(coverage.sites.map((s) => s.countryId)).size,
    notApplicableCountries: coverage.notApplicableCountries.length,
  },
  sites: coverage.sites,
  notApplicableCountries: coverage.notApplicableCountries,
  policyScope:
    'Existing domestic unfragmented OP aggregate refineries only; no other recipe/upgrade/debt/title transfer is adopted.',
  runtimeAcceptance: 'NOT_RUN',
  admittedDatabaseRegistration: 'NOT_RUN',
  utilitiesAndActualProduction: 'NOT_VERIFIED_FOR_21_COUNTRIES',
};
const target = path.resolve(args[1]);
await mkdir(path.dirname(target), { recursive: true });
await writeFile(target, JSON.stringify(report, null, 2) + '\n');
process.stdout.write(
  JSON.stringify({
    report: target,
    counts: report.counts,
    reportSha256: sha(await readFile(target)),
  }) + '\n',
);
