#!/usr/bin/env node
/** Offline actual-source join only. Does not reconstruct private admission,
 * inspect current occupancy, open a database or publish any source/command. */
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../..', import.meta.url));
const args = process.argv.slice(2);
if (args.length !== 4 || args[0] !== '--marker' || args[2] !== '--out')
  throw Error(
    'Usage: postwar-water-staff-source-coverage.mjs --marker <saved-reference-db.json> --out <new-directory>',
  );
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
for (const relative of [
  'persistence/postwar-industry-utility-service-source',
  'preparation/postwar-water-staff-policy',
]) {
  const source = await stat(
      path.join(root, 'apps/world-worker/src/' + relative + '.ts'),
    ),
    emitted = await stat(
      path.join(root, 'apps/world-worker/dist/' + relative + '.js'),
    );
  assert(
    emitted.mtimeMs >= source.mtimeMs,
    'FRESH_WORKER_BUILD_REQUIRED:' + relative,
  );
}
const markerPath = path.resolve(args[1]),
  out = path.resolve(args[3]),
  markerBytes = await readFile(markerPath),
  marker = JSON.parse(markerBytes.toString()),
  seedBytes = await readFile(marker.seedFile),
  seed = JSON.parse(seedBytes.toString());
assert.equal(
  sha(seedBytes),
  marker.seedFileSha256,
  'EXACT_SAVED_SEED_FILE_REQUIRED',
);
assert.equal(String(seedBytes.length), String(marker.seedBytes));
assert.equal(seed.fingerprint, marker.seedFingerprint);
assert.equal(seed.worldId, marker.worldId);
assert.equal(seed.seedId, marker.seedId);
const records = seed.sources.filter(
  (s) => s.sourceId === 'SOURCE_POSTWAR_OPERATING_V1',
);
assert.equal(records.length, 1);
const operating = JSON.parse(records[0].canonicalPayload),
  inputs = operating.carrier.socialEmployment.inputs;
const [
  { loadPostwarSourceContext },
  { buildOfficialPhysicalOpeningAdoption },
  { readPostwarIndustryRefineryCoverage },
  { derivePostwarIndustryWaterServiceSiteData },
  { POSTWAR_WATER_STAFF_POLICY },
] = await Promise.all([
  import('../../apps/world-worker/dist/preparation/postwar-source-context.js'),
  import('../../apps/world-worker/dist/preparation/official-physical-opening-adoption.js'),
  import('../../apps/world-worker/dist/persistence/postwar-industry-refinery-sites.js'),
  import('../../apps/world-worker/dist/persistence/postwar-industry-utility-service-source.js'),
  import('../../apps/world-worker/dist/preparation/postwar-water-staff-policy.js'),
]);
const adoption = await readFile(
  path.join(root, POSTWAR_WATER_STAFF_POLICY.userAdoptionPath),
);
assert.equal(sha(adoption), POSTWAR_WATER_STAFF_POLICY.userAdoptionRawSha256);
const context = await loadPostwarSourceContext(root),
  physical = buildOfficialPhysicalOpeningAdoption({
    sourceBytes: context.sourceBytes,
    ownerDecisionBytes: context.ownerOriginalBytes,
  }),
  coverage = readPostwarIndustryRefineryCoverage(context);
assert.equal(inputs.sourceChecksumsSha256, context.source.pins.checksumsSha256);
assert.equal(coverage.sites.length, 21);
const rows = [];
await mkdir(out, { recursive: false });
for (const site of coverage.sites) {
  try {
    const powers = physical.power.filter((p) => p.countryId === site.countryId);
    assert.equal(
      powers.length,
      1,
      'ONE_ACTUAL_COUNTRY_POWER_ORIGINAL_REQUIRED',
    );
    const power = powers[0],
      storage = physical.facilities.find(
        (f) => f.id === power.storageFacilityId,
      );
    assert(
      storage &&
        storage.status === 'ADOPTED_BUILT' &&
        storage.operatorId === site.operatorId &&
        storage.titleHolderId === site.operatorId &&
        storage.riskBearerId === site.operatorId,
      'EXISTING_SAME_OP_OWNED_STORAGE_REQUIRED',
    );
    const powerRaw = context.sourceBytes.datasets['data/power.json'],
      powerSha = sha(powerRaw),
      derived = derivePostwarIndustryWaterServiceSiteData({
        scope: {
          worldId: marker.worldId,
          seedId: marker.seedId,
          seedFingerprint: marker.seedFingerprint,
          admissionRef: marker.admissionRef,
          countryId: site.countryId,
          locationId: site.locationId,
          operatorId: site.operatorId,
          storageId: storage.id,
          physicalSourceRef: 'INDUSTRY_STORAGE_' + powerSha.toUpperCase(),
          physicalSourceRawSha256: powerSha,
          // Pure staff raw bytes do not include or depend on the utility compact.
          // Never claim this audit-only identity is an admitted runtime compact.
          utilityCompactSha256:
            'UNAVAILABLE_OFFLINE_NO_ADMITTED_UTILITY_PACKET',
        },
        targetFacilityId: site.facilityId,
        sourcePositions: inputs.sourcePositions,
        wagePositions: inputs.labour.positions,
        populationPositionRefs: inputs.populationPositionRefs,
        positionFunding: inputs.positionFunding,
      });
    const filename = site.countryId + '.water-staff.json';
    await writeFile(
      path.join(out, filename),
      derived.firstdayOriginal.rawText,
      { flag: 'wx' },
    );
    rows.push({
      countryId: site.countryId,
      targetFacilityId: site.facilityId,
      serviceFacilityId: derived.siteSource.facilityId,
      sourceEligibility: 'EXISTING_SAME_OP_POWER_PERSONNEL_JOIN_PASSED',
      currentAvailability: 'NOT_READ_REQUIRES_CURRENT_SHARED_BOOKINGS',
      sourceRef: derived.firstdayOriginal.sourceRef,
      rawSha256: derived.firstdayOriginal.rawSha256,
      rawFile: filename,
      rawBytes: Buffer.byteLength(derived.firstdayOriginal.rawText),
      personCount: derived.siteSource.capacityPerSimDay,
      positionRanges: derived.siteSource.positions,
      registeredSource: 'NOT_READ',
      production: 'NOT_EXECUTED',
    });
  } catch (error) {
    rows.push({
      countryId: site.countryId,
      targetFacilityId: site.facilityId,
      sourceEligibility: 'REJECTED',
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}
const report = {
  classification:
    'OFFLINE_ACTUAL_SOURCE_JOIN_NOT_RUNTIME_AUTHORITY_OR_WORK_AVAILABILITY',
  repositoryHead: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim(),
  markerPath,
  markerSha256: sha(markerBytes),
  seedFile: marker.seedFile,
  seedFileSha256: sha(seedBytes),
  worldId: seed.worldId,
  seedId: seed.seedId,
  seedFingerprint: seed.fingerprint,
  operatingSourcePayloadSha256: sha(records[0].canonicalPayload),
  selectedSourceChecksumsSha256: context.source.pins.checksumsSha256,
  staffingPolicy: POSTWAR_WATER_STAFF_POLICY,
  counts: {
    countryDenominator: 70,
    refineryCountries: 21,
    sourceEligible: rows.filter((r) => r.sourceEligibility !== 'REJECTED')
      .length,
    rejected: rows.filter((r) => r.sourceEligibility === 'REJECTED').length,
    noRefineryCountries: coverage.notApplicableCountries.length,
  },
  rows,
  notApplicableCountries: coverage.notApplicableCountries,
  databaseOperations: 0,
  publications: 0,
  commands: 0,
  currentWorkerAvailability: 'NOT_READ',
  payments: 'NOT_EXECUTED',
  serviceDelivery: 'NOT_EXECUTED',
};
await writeFile(
  path.join(out, 'report.json'),
  JSON.stringify(report, null, 2) + '\n',
  { flag: 'wx' },
);
process.stdout.write(
  JSON.stringify({
    out,
    counts: report.counts,
    maximumRawBytes: Math.max(...rows.map((r) => r.rawBytes ?? 0)),
  }) + '\n',
);
