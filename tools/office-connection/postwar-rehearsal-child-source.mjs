/** Fresh offline derivative of an actual saved parent, never H3 restoration.
 * Reuses approved producers and full Core validation; no signer, native DB,
 * source publication, economic command, Node host or Clock is started. */
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { canonicalSerialize, parseOpeningSeed } from '@econmind/core';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const load = (relative) =>
  import(pathToFileURL(path.join(root, relative)).href);

export async function prepareRehearsalChildSource({
  parentFile,
  outputDirectory,
  candidateOnly = false,
}) {
  if (!path.isAbsolute(parentFile) || !path.isAbsolute(outputDirectory))
    throw Error('ABSOLUTE_PARENT_AND_NEW_OUTPUT_REQUIRED');
  await mkdir(outputDirectory, { recursive: false, mode: 0o700 });
  const json = (value) => JSON.stringify(value, null, 2) + '\n';
  const canonicalJson = (value) => canonicalSerialize(value) + '\n';
  const save = (name, value, serialize = json) =>
    writeFile(path.join(outputDirectory, name), serialize(value), {
      flag: 'wx',
      mode: 0o600,
    });
  const started = Date.now();
  const progress = [];
  const stage = async (name, details = {}) => {
    const entry = {
      name,
      elapsedMs: Date.now() - started,
      maxRssKiB: process.resourceUsage().maxRSS,
      ...details,
    };
    progress.push(entry);
    process.stdout.write(json(entry));
    await writeFile(
      path.join(outputDirectory, 'progress.json'),
      json(progress),
    );
  };
  let preparation;
  let retire;
  try {
    const candidateModule = await load(
      'apps/world-worker/dist/preparation/postwar-beneficial-housing-rent-candidate.js',
    );
    const sourceModule = await load(
      'apps/world-worker/dist/persistence/postwar-beneficial-housing-rent-source.js',
    );
    retire = sourceModule.retireBeneficialHousingRentSource;
    const { derivePostwarBeneficialChildFinanceSocialSources } = await load(
      'apps/world-worker/dist/persistence/postwar-finance-social-source-publication.js',
    );
    const { createPostwarDayOneFxPolicy } = await load(
      'apps/world-worker/dist/preparation/postwar-day-one-fx-policy.js',
    );
    const { loadAdoptedCaptainOpeningPolicy } = await load(
      'apps/world-worker/dist/preparation/postwar-captain-opening-source.js',
    );
    const { loadPostwarIndustryFirstDayAdoptedPolicy } = await load(
      'apps/world-worker/dist/persistence/postwar-industry-first-day-source.js',
    );
    const parentBytes = await readFile(parentFile, 'utf8');
    const parentRawSha256 = sha(parentBytes);
    const parent = parseOpeningSeed(JSON.parse(parentBytes), sha);
    await stage('GENUINE_PARENT_PARSED', {
      parentRawSha256,
      parentFingerprint: parent.fingerprint,
    });
    const candidate =
      candidateModule.preparePostwarBeneficialHousingRentCandidate({
        parentSeed: parent,
      });
    await save('candidate-seed.json', candidate.seed, canonicalJson);
    await save('receipts.json', candidate.receipts, canonicalJson);
    await stage('CHILD_DERIVED_FROM_UNMODIFIED_PARENT', {
      childFingerprint: candidate.seed.fingerprint,
      countryReceipts: candidate.receipts.length,
    });
    if (candidateOnly) {
      const files = {};
      for (const name of ['candidate-seed.json', 'receipts.json']) {
        const bytes = await readFile(path.join(outputDirectory, name));
        files[name] = { sha256: sha(bytes), bytes: bytes.length };
      }
      const manifest = {
        schemaVersion: 'postwar-fresh-rehearsal-source-v1',
        classification: 'NEW_OFFLINE_REHEARSAL_NOT_RESTORED_H3',
        status: 'CANDIDATE_ONLY_NOT_FULLY_VALIDATED_NOT_RUNTIME_ADMITTED',
        repositoryCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
          cwd: root,
          encoding: 'utf8',
        }).trim(),
        parentFile,
        parentRawSha256,
        parentSeedFingerprint: parent.fingerprint,
        seedFingerprint: candidate.seed.fingerprint,
        worldId: candidate.seed.worldId,
        seedId: candidate.seed.seedId,
        countries: candidate.receipts.length,
        population: candidate.population,
        households: candidate.households,
        openingRentPaid: candidate.openingRentPaid,
        openingRentAccrued: candidate.openingRentAccrued,
        files,
        privateProofVerification: 'NOT_RUN_REQUIRES_GENUINE_COLD_PROCESS',
        databaseOperations: 0,
        runtimeAdmission: 'NOT_RUN',
        sourcePublications: 0,
        WorldClockStarted: false,
        maxRssKiB: process.resourceUsage().maxRSS,
        elapsedMs: Date.now() - started,
      };
      await save('manifest.json', manifest);
      return manifest;
    }
    const verification =
      candidateModule.verifyPostwarBeneficialHousingRentCandidate({
        parentSeed: parent,
        seed: candidate.seed,
        receipts: candidate.receipts,
      });
    await save('full-core-verification.json', verification);
    await stage('COMPLETE_PARENT_CHILD_CORE_VERIFICATION', verification);
    preparation = sourceModule.prepareBeneficialHousingRentSource({
      parentSeed: parent,
      seed: candidate.seed,
      receipts: candidate.receipts,
    });
    const derivation = derivePostwarBeneficialChildFinanceSocialSources({
      seed: candidate.seed,
      preparation,
    });
    await save('country-originals.json', derivation.countries);
    await save('finance-social-manifest.json', {
      classification: 'OFFLINE_DERIVATION_NOT_RUNTIME_ADMISSION',
      worldId: derivation.worldId,
      seedId: derivation.seedId,
      seedFingerprint: derivation.seedFingerprint,
      canonicalSeedSha256: derivation.canonicalSeedSha256,
      retainedSources: derivation.retainedSources,
      countries: derivation.countries.map(({ countryId, derivedSha256 }) => ({
        countryId,
        derivedSha256,
      })),
    });
    const read = (file) => readFile(path.join(root, file), 'utf8');
    const fx = createPostwarDayOneFxPolicy({
      seed: candidate.seed,
      startupBeneficialHousingRentSource: preparation,
      policyBytes: await read('config/postwar-genesis/day-one-fx.v1.json'),
      userReceiptBytes: await read(
        'docs/governance/owner-inputs/2026-10-29/DAY_ONE_FX_USER_ADOPTION.original.json',
      ),
    });
    await save('day-one-fx-policy.json', fx);
    // Validate adopted originals only. Their publication packet needs the
    // future real admission reference; no placeholder reference is issued.
    await loadAdoptedCaptainOpeningPolicy(root);
    await loadPostwarIndustryFirstDayAdoptedPolicy(root);
    await stage('OFFICE_INPUTS_DERIVED_WITHOUT_ADMISSION', {
      financeSocialCountries: derivation.countries.length,
      fxQuotes: fx.quotes.length,
      captainAdmission: 'NOT_RUN',
      industryAdmission: 'NOT_RUN',
      waterStaffQualification: 'NOT_ADOPTED_NOT_CREATED',
    });
    const files = {};
    for (const name of [
      'candidate-seed.json',
      'receipts.json',
      'full-core-verification.json',
      'country-originals.json',
      'finance-social-manifest.json',
      'day-one-fx-policy.json',
    ]) {
      const bytes = await readFile(path.join(outputDirectory, name));
      files[name] = { sha256: sha(bytes), bytes: bytes.length };
    }
    const manifest = {
      schemaVersion: 'postwar-fresh-rehearsal-source-v1',
      classification: 'NEW_OFFLINE_REHEARSAL_NOT_RESTORED_H3',
      status: 'ACTUAL_SOURCE_DERIVED_AND_VERIFIED_NOT_RUNTIME_ADMITTED',
      repositoryCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: root,
        encoding: 'utf8',
      }).trim(),
      parentFile,
      parentRawSha256,
      parentSeedFingerprint: parent.fingerprint,
      seedFingerprint: candidate.seed.fingerprint,
      worldId: candidate.seed.worldId,
      seedId: candidate.seed.seedId,
      countries: candidate.receipts.length,
      population: candidate.population,
      households: candidate.households,
      retainedInventoryEntries: verification.retainedInventoryEntries,
      exactLegalHouseholdClaims: verification.exactLegalHouseholdClaims,
      exactNonHouseholdAccounts: verification.exactNonHouseholdAccounts,
      openingRentPaid: candidate.openingRentPaid,
      openingRentAccrued: candidate.openingRentAccrued,
      files,
      databaseOperations: 0,
      runtimeAdmission: 'NOT_RUN',
      sourcePublications: 0,
      WorldClockStarted: false,
      maxRssKiB: process.resourceUsage().maxRSS,
      elapsedMs: Date.now() - started,
    };
    await save('manifest.json', manifest);
    return manifest;
  } catch (error) {
    await save('failure.json', {
      status: 'FAILED_NOT_ADMITTED',
      error: error instanceof Error ? error.message : String(error),
      elapsedMs: Date.now() - started,
    });
    throw error;
  } finally {
    if (preparation) retire(preparation);
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  const candidateOnly = args[4] === '--candidate-only';
  if (
    (args.length !== 4 && !(args.length === 5 && candidateOnly)) ||
    args[0] !== '--parent' ||
    args[2] !== '--out'
  )
    throw Error(
      'USE --parent ABSOLUTE_SAVED_PARENT --out NEW_ABSOLUTE_DIRECTORY [--candidate-only]',
    );
  const result = await prepareRehearsalChildSource({
    parentFile: args[1],
    outputDirectory: args[3],
    candidateOnly,
  });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
