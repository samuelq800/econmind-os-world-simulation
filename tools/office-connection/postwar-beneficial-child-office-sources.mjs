/** Fixed saved-child offline derivation. No admission, database, signing,
 * Clock, seed generation or consumer is run by --derive. A live opaque proof
 * may be retained for a separately authorized final native rehearsal. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { assertBeneficialChildNativeEvidenceDirectory } from './beneficial-child-source-preflight.mjs';
import * as C from '@econmind/core';
import {
  prepareBeneficialHousingRentSource,
  consumeBeneficialHousingRentSource,
  retireBeneficialHousingRentSource,
} from '../../apps/world-worker/src/persistence/postwar-beneficial-housing-rent-source.ts';
import { readPostwarBeneficialHousingRentChildOperatingView } from '../../apps/world-worker/src/persistence/postwar-beneficial-housing-rent-child-view.ts';
import { derivePostwarBeneficialChildFinanceSocialSources } from '../../apps/world-worker/src/persistence/postwar-finance-social-source-publication.ts';
import {
  loadAdoptedCaptainOpeningPolicy,
  createAdoptedCaptainOpeningCandidate,
} from '../../apps/world-worker/src/preparation/postwar-captain-opening-source.ts';
import { createPostwarDayOneFxPolicy } from '../../apps/world-worker/src/preparation/postwar-day-one-fx-policy.ts';
const root = fileURLToPath(new URL('../../', import.meta.url)).replace(
  /\/$/u,
  '',
);
const artifacts =
  '/workspace/.cloud-setup/evidence/beneficial-rent-candidate-20261101';
const parentFile =
  '/workspace/.cloud-setup/evidence/postwar-gcu-opening-fresh-20261029T020748Z/final-seed.json';
const childFingerprint =
  'sha256:cd6cd0825fd8b15c13dab28f030e2df24b804d5675e132ff77715a20ec67056a';
const parentFingerprint =
  'sha256:cfc55796562b44bd616f33082cbbafd9dbd43d58733a24ac550339cbc8376274';
const sha = (s) => createHash('sha256').update(s).digest('hex');
const args = process.argv.slice(2),
  out = args[args.indexOf('--out') + 1];
if (!args.includes('--derive')) {
  console.log(
    JSON.stringify({
      classification: 'OFFLINE_PLAN_NOT_ADMISSION',
      parentFile,
      artifacts,
      childFingerprint,
      parentFingerprint,
      sourceGeneration: false,
      database: false,
    }),
  );
  process.exit(0);
}
if (
  !args.includes('--out') ||
  !out?.startsWith('/workspace/.cloud-setup/evidence/')
)
  throw Error('OWNED_NEW_EVIDENCE_DIRECTORY_REQUIRED');
if (args.includes('--hold')) {
  if (!args.includes('--native-out'))
    throw Error('PREFLIGHT_NATIVE_OUT_REQUIRED');
  assertBeneficialChildNativeEvidenceDirectory(
    args[args.indexOf('--native-out') + 1],
  );
}
await mkdir(out, { recursive: true });
const started = Date.now(),
  stages = [];
let preparation,
  seed,
  transferred = false;
const save = (name, data) =>
  writeFile(out + '/' + name, JSON.stringify(data, null, 2) + '\n', {
    flag: 'wx',
  });
async function stage(name, data = {}) {
  const row = {
    stage: name,
    elapsedMs: Date.now() - started,
    rss: process.memoryUsage().rss,
    maxRssKiB: process.resourceUsage().maxRSS,
    ...data,
  };
  stages.push(row);
  console.log(JSON.stringify(row));
  await writeFile(
    out + '/progress.json',
    JSON.stringify(stages, null, 2) + '\n',
  );
}
try {
  await stage('IMPORTS_RESOLVED_READ_SAVED_ARTIFACTS');
  let raw = await readFile(parentFile, 'utf8');
  const parentRawSha256 = sha(raw),
    parent = C.parseOpeningSeed(JSON.parse(raw), sha);
  raw = await readFile(artifacts + '/candidate-seed.json', 'utf8');
  const childRawSha256 = sha(raw);
  seed = C.parseOpeningSeed(JSON.parse(raw), sha);
  raw = null;
  if (
    parent.fingerprint !== parentFingerprint ||
    seed.fingerprint !== childFingerprint ||
    childRawSha256 !==
      '835f9ec096746e3bc8f8cd1a7235fc7a2af0daee06d4ceeedff1fdff99d0262f'
  )
    throw Error('EXACT_RETAINED_PARENT_CHILD_REQUIRED');
  const receiptText = await readFile(artifacts + '/receipts.json', 'utf8');
  await stage('ACTUAL_CORE_PARENT_CHILD_PARSED_BEGIN_COMPLETE_PROOF', {
    parentRawSha256,
    childRawSha256,
  });
  preparation = prepareBeneficialHousingRentSource({
    parentSeed: parent,
    seed,
    receipts: JSON.parse(receiptText),
  });
  const proof = consumeBeneficialHousingRentSource(preparation);
  await stage('GENUINE_COMPLETE_SEVENTY_COUNTRY_PROOF', {
    countries: proof.receipts.length,
    canonicalSeedSha256: proof.canonicalSeedSha256,
    bundleSha256: proof.bundleSha256,
  });
  const view = readPostwarBeneficialHousingRentChildOperatingView({
    seed,
    preparation,
  });
  if (view.parentView.seedFingerprint !== parentFingerprint)
    throw Error('PARENT_FACTS_FINGERPRINT_CHANGED');
  const d = derivePostwarBeneficialChildFinanceSocialSources({
    seed,
    preparation,
  });
  const originals = Object.fromEntries(
    d.countries.map((c) => [c.countryId, JSON.parse(c.derivedText)]),
  );
  const oldOriginals = JSON.parse(
    await readFile(
      '/workspace/.cloud-setup/evidence/finance-social-fixed-source-publication-20261030/country-originals.json',
      'utf8',
    ),
  );
  // The old evidence is a country publication array, not authority. Compare the
  // complete original data after removing only the two newly derived seed pins.
  const oldCountries = Array.isArray(oldOriginals)
    ? oldOriginals
    : oldOriginals.countries;
  if (!Array.isArray(oldCountries) || oldCountries.length !== 70)
    throw Error('RETAINED_PARENT_COUNTRY_EVIDENCE_REQUIRED');
  for (const c of d.countries) {
    const old = oldCountries.find((x) => x.countryId === c.countryId);
    const body =
      typeof old.derivedText === 'string' ? JSON.parse(old.derivedText) : old;
    const current = originals[c.countryId];
    const normalized = {
      ...current,
      seedFingerprint: body.seedFingerprint,
      canonicalSeedSha256: body.canonicalSeedSha256,
      capacity: {
        ...current.capacity,
        seedFingerprint: body.capacity.seedFingerprint,
        canonicalSeedSha256: body.capacity.canonicalSeedSha256,
      },
    };
    if (C.canonicalSerialize(normalized) !== C.canonicalSerialize(body))
      throw Error('PARENT_COUNTRY_FACTS_CHANGED:' + c.countryId);
  }
  const manifest = {
    schemaVersion: d.schemaVersion,
    classification: 'FIXED_VERSION_DERIVATION_EVIDENCE_NOT_SIGNATURE',
    worldId: d.worldId,
    seedId: d.seedId,
    seedFingerprint: d.seedFingerprint,
    canonicalSeedSha256: d.canonicalSeedSha256,
    parentSeedFingerprint: parentFingerprint,
    retainedSources: d.retainedSources,
    countries: d.countries.map(({ countryId, derivedSha256 }) => ({
      countryId,
      derivedSha256,
    })),
  };
  await save('finance-social-manifest.json', manifest);
  await save('country-originals.json', d.countries);
  await stage('CHILD_FINANCE_SOCIAL_DERIVED_PARENT_FACTS_EXACT', {
    countryCount: d.countries.length,
    manifestSha256: sha(JSON.stringify(manifest, null, 2) + '\n'),
  });
  const captainPolicy = await loadAdoptedCaptainOpeningPolicy(root);
  await save('captain-source-inputs.json', {
    classification: 'AWAIT_ACTUAL_NEW_CHILD_ADMISSION_NOT_PUBLICATION',
    binding: view.binding,
    countryIds: d.countries.map((c) => c.countryId),
    policySha256: sha(
      await readFile(
        root + '/config/postwar-genesis/captain-opening.v1.json',
        'utf8',
      ),
    ),
    receiptSha256: sha(
      await readFile(
        root + '/config/postwar-genesis/captain-opening-adoption.v1.json',
        'utf8',
      ),
    ),
    admissionRef: null,
    parentPacketReused: false,
  });
  const fx = createPostwarDayOneFxPolicy({
    seed,
    startupBeneficialHousingRentSource: preparation,
    policyBytes: await readFile(
      root + '/config/postwar-genesis/day-one-fx.v1.json',
      'utf8',
    ),
    userReceiptBytes: await readFile(
      root +
        '/docs/governance/owner-inputs/2026-10-29/DAY_ONE_FX_USER_ADOPTION.original.json',
      'utf8',
    ),
  });
  if (
    fx.quotes.length !== 70 ||
    fx.seedFingerprint !== childFingerprint ||
    fx.quotes.some((q) => q.seedFingerprint !== childFingerprint)
  )
    throw Error('ACTUAL_CHILD_FX_QUOTE_BINDING_REQUIRED');
  await save('day-one-fx-policy.json', fx);
  await stage('CHILD_FX_SEVENTY_QUOTES_VERIFIED_SAME_PROOF', {
    fingerprint: fx.fingerprint,
    count: fx.quotes.length,
  });
  await save('summary.json', {
    status: 'ACTUAL_OFFLINE_DERIVATION_COMPLETE_NOT_ADMITTED',
    binding: view.binding,
    parentFactsUnchanged: true,
    countries: 70,
    captainAdmission: 'AWAIT_ACTUAL_NEW_CHILD_ADMISSION',
    fxPolicyFingerprint: fx.fingerprint,
    elapsedMs: Date.now() - started,
    maxRssKiB: process.resourceUsage().maxRSS,
    database: false,
    WorldClock: false,
    stages,
  });
  if (args.includes('--hold')) {
    await stage('HOLDING_LIVE_PRIVATE_PROOF_NO_DATABASE');
    const lines = createInterface({ input: process.stdin, terminal: false });
    let nativeAttempt = 0;
    for await (const line of lines) {
      const message = JSON.parse(line);
      if (message.action === 'status')
        await stage('LIVE_PROOF_STATUS', {
          countries:
            consumeBeneficialHousingRentSource(preparation).receipts.length,
        });
      else if (
        message.action === 'captain-review' &&
        typeof message.actualChildAdmissionRef === 'string'
      ) {
        const candidate = createAdoptedCaptainOpeningCandidate(captainPolicy, {
          worldId: seed.worldId,
          seedId: seed.seedId,
          seedFingerprint: seed.fingerprint,
          worldAdmissionRef: message.actualChildAdmissionRef,
          countryIds: d.countries.map((c) => c.countryId),
        });
        await save('captain-review-candidate.json', candidate);
        await stage('CAPTAIN_NEW_REVIEW_DERIVED_SQL_SCOPE_STILL_REQUIRED', {
          fingerprint: candidate.fingerprint,
        });
      } else if (
        message.action === 'native-rehearsal' &&
        typeof message.evidenceDirectory === 'string'
      ) {
        nativeAttempt++;
        try {
          assertBeneficialChildNativeEvidenceDirectory(
            message.evidenceDirectory,
          );
          const { runPostwarBeneficialRentChildNativeRehearsal } =
            await import('../../tests/support/postwar-beneficial-rent-child-native-fixture.ts');
          const result = await runPostwarBeneficialRentChildNativeRehearsal({
            repositoryRoot: root,
            evidenceDirectory: message.evidenceDirectory,
            artifactDirectory: artifacts,
            sourcePreparation: preparation,
            startupSeed: seed,
          });
          transferred = true;
          await save('native-rehearsal-return.json', result);
          await stage('NATIVE_REHEARSAL_COMPLETE_TOKEN_RETIRED_BY_OWNER');
          break;
        } catch (error) {
          // The fixed source-only fixture borrows this token until all SQL and
          // cleanup succeeds. Failure must not escape into the owner's finally
          // and destroy the costly proof before a fixed, authorized retry.
          consumeBeneficialHousingRentSource(preparation);
          await save('native-attempt-' + nativeAttempt + '-failure.json', {
            name: error.name,
            message: error.message,
            stack: error.stack,
            preparation: 'STILL_GENUINE_LIVE_CALLER_OWNED',
          });
          await stage('NATIVE_REHEARSAL_FAILED_PROOF_RETAINED', {
            attempt: nativeAttempt,
            reason: error.message,
          });
        }
      } else if (message.action === 'release') break;
      else throw Error('FIXED_OFFLINE_CONTROL_MESSAGE_REQUIRED');
    }
    lines.close();
  }
} catch (error) {
  await save('failure.json', {
    name: error.name,
    message: error.message,
    stack: error.stack,
    stages,
  });
  console.error(error);
  process.exitCode = 1;
} finally {
  if (preparation && !transferred)
    retireBeneficialHousingRentSource(preparation);
}
