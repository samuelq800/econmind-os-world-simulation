/** Fixed display-only image overlay. Original selected sources are never written. */
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const correctionVersion = 'lake-repair-20261018-v1';
export const correctedCountries = Object.freeze([
  '11',
  '12',
  '13',
  '14',
  '21',
  '22',
  '23',
  '41',
]);
const directory = `apps/world-web/src/assets/country-scene-corrections/${correctionVersion}`;
const manifestPin =
  'f94d25e60d0d3dd6d2e36093a17be456a1522db152e6e05ab8fb702156193833';
const reviewPin =
  '7051d650e2582f3c96f74e0f70e957ddc831f508da3cc92d1218d3b4ade768fc';
const originalManifestPin =
  '9a83b2de3e0da39dae9e485e8de4be5bf236de26d68937c48c7941d7d50f795f';
const initialReviewPin =
  'b27c6452e12cf474c3c3e60d2ed92a0694dd9f318126a6eb7911c3b1bb76751b';
const additionalReviewPin =
  'a1f464ed8a27a836f4f87ef258f2b5167764f20d1a67d97afe227f7454f9d72f';
export const followupVersion = 'geography-followup-20261018-v1';
export const followupCountries = Object.freeze(['01', '09', '38', '40', '42']);
const followupDirectory = `apps/world-web/src/assets/country-scene-corrections/${followupVersion}`;
const followupManifestPin =
  '1916003f8e3fdfb38207712b6004a4f5fb73f97b57bf8880902ad2c840f906c7';
const followupReviewPin =
  'e4d95c5eee4fdf65022b317d4739b700e876e6d09917caeb65c6bdb5a4e610ea';
const followupReports = Object.freeze([
  [
    'd5b0dab22b4bc7d70314fde4669cee5630b07e85cc860c22af7a97cfebf323a2',
    'c27d078ad1aa01c5ef5060e9c84a124ae5f1e618fb7a3cce9a501976aa342775',
    ['01', '09'],
  ],
  [
    'e6f36d32b10003daa96ffde73faa37bdce10eab9a194997582de28281ad815d4',
    '8209b7a5788a4320d8c5ac9b83aa9e706dff68cd6a11eb2af878360aea5aa89d',
    ['38', '40', '42'],
  ],
]);
const packages = new WeakMap();
const plans = new WeakMap();
const batches = new WeakMap();
export const displaySha256 = (bytes) =>
  createHash('sha256').update(bytes).digest('hex');
function demand(ok, code) {
  if (!ok) throw new Error(code);
}
function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}
async function fixedRead(relative) {
  const physicalRoot = await realpath(root);
  let current = root;
  for (const segment of relative.split('/')) {
    demand(
      segment && segment !== '.' && segment !== '..' && !segment.includes('\\'),
      'CORRECTION_PATH_INVALID',
    );
    current = path.join(current, segment);
    demand(
      !(await lstat(current)).isSymbolicLink(),
      'CORRECTION_SYMLINK_DENIED',
    );
  }
  demand(
    (await realpath(current)).startsWith(physicalRoot + path.sep),
    'CORRECTION_OUTSIDE_REPOSITORY',
  );
  demand((await lstat(current)).isFile(), 'CORRECTION_REGULAR_FILE_REQUIRED');
  return readFile(current);
}
export function verifyCorrectionPng(bytes, entry) {
  demand(
    Buffer.isBuffer(bytes) &&
      bytes.length === entry.bytes &&
      displaySha256(bytes) === entry.sha256,
    'CORRECTION_PNG_BYTES_MISMATCH',
  );
  demand(
    bytes.length >= 33 &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
      bytes.toString('ascii', 12, 16) === 'IHDR' &&
      bytes.readUInt32BE(16) === 1254 &&
      bytes.readUInt32BE(20) === 1254 &&
      entry.width === 1254 &&
      entry.height === 1254,
    'CORRECTION_PNG_DIMENSIONS_INVALID',
  );
}
/** Exact fixed bytes first; data cannot configure a source path, allowlist or review. */
export function inspectCorrectionRecords(
  manifestBytes,
  reviewBytes,
  originalManifestBytes,
  uiManifestBytes,
) {
  demand(
    displaySha256(manifestBytes) === manifestPin,
    'CORRECTION_MANIFEST_PIN_MISMATCH',
  );
  demand(
    displaySha256(reviewBytes) === reviewPin,
    'CORRECTION_REVIEW_PIN_MISMATCH',
  );
  demand(
    displaySha256(originalManifestBytes) === originalManifestPin,
    'ORIGINAL_MAP_MANIFEST_PIN_MISMATCH',
  );
  const manifest = JSON.parse(manifestBytes.toString('utf8')),
    review = JSON.parse(reviewBytes.toString('utf8'));
  const originals = JSON.parse(originalManifestBytes.toString('utf8')),
    ui = JSON.parse(uiManifestBytes.toString('utf8'));
  demand(
    manifest.schemaVersion === 'COUNTRY_SCENE_DISPLAY_CORRECTION_V1' &&
      manifest.version === correctionVersion &&
      manifest.nature === 'DISPLAY_ONLY_IMAGE_CORRECTION_NOT_WORLD_STATE' &&
      manifest.originalManifestSha256 === originalManifestPin &&
      manifest.reviewSha256 === reviewPin,
    'CORRECTION_MANIFEST_IDENTITY_INVALID',
  );
  demand(
    displaySha256(uiManifestBytes) === manifest.originalUiManifestSha256,
    'ORIGINAL_UI_MANIFEST_PIN_MISMATCH',
  );
  demand(
    review.initialThreeReportSha256 === initialReviewPin &&
      review.additionalFiveReportSha256 === additionalReviewPin &&
      review.exactPixelAnchorAlignment === 'NOT_PROVEN' &&
      review.geographyOrEconomicDataModified === false &&
      review.rows.length === 8,
    'CORRECTION_INDEPENDENT_REVIEW_REQUIRED',
  );
  demand(
    same(
      manifest.entries.map((e) => e.number),
      correctedCountries,
    ),
    'CORRECTION_FIXED_COUNTRIES_REQUIRED',
  );
  let subjects = 0;
  for (const e of manifest.entries) {
    const n = e.number,
      originalPath = `apps/world-web/src/assets/country-scenes/${n}.png`;
    demand(
      e.sourcePath === `${directory}/${n}.png` &&
        e.displayPath === `scene-corrections/${correctionVersion}/${n}.png` &&
        e.legacyAlias === `season1-immersive/countries/assets/scenes/${n}.png`,
      'CORRECTION_FIXED_PATH_REQUIRED',
    );
    const old = originals.files.find((f) => f.path === originalPath);
    const legacy = ui.files.find(
      (f) =>
        f.path ===
        `role-prototypes/season1-immersive/countries/assets/scenes/${n}.png`,
    );
    demand(
      old &&
        legacy &&
        e.original.sourcePath === originalPath &&
        e.original.bytes === old.bytes &&
        e.original.sha256 === old.sha256 &&
        legacy.bytes === old.bytes &&
        legacy.sha256 === old.sha256 &&
        e.original.publicUrl ===
          `official-map-source/${originalManifestPin}/files/${originalPath}`,
      'CORRECTION_ORIGINAL_SOURCE_IDENTITY_MISMATCH',
    );
    const r = review.rows.find((r) => r.number === n);
    demand(
      r &&
        r.sha256 === e.sha256 &&
        r.verdict === 'APPROVED_FOR_VISUAL_DELTA_ONLY' &&
        r.actualFullImageViewed === true &&
        r.subjectsPreservedVisually === true &&
        r.exactPixelAnchorAlignment === 'NOT_PROVEN',
      'CORRECTION_IMAGE_REVIEW_MISMATCH',
    );
    demand(
      Number.isSafeInteger(e.bytes) &&
        e.bytes > 0 &&
        e.bytes <= 16 * 1024 * 1024 &&
        /^[0-9a-f]{64}$/u.test(e.sha256),
      'CORRECTION_IMAGE_PIN_INVALID',
    );
    subjects += r.subjectIds.length;
  }
  demand(subjects === 35, 'CORRECTION_SUBJECT_COVERAGE_INVALID');
  return deepFreeze({ manifest, review });
}
/** Separate fixed candidate-only reviews; the original eight-image record is unchanged. */
export function inspectFollowupCorrectionRecords(
  manifestBytes,
  reviewBytes,
  originalManifestBytes,
  uiManifestBytes,
) {
  demand(
    displaySha256(manifestBytes) === followupManifestPin,
    'FOLLOWUP_MANIFEST_PIN_MISMATCH',
  );
  demand(
    displaySha256(reviewBytes) === followupReviewPin,
    'FOLLOWUP_REVIEW_PIN_MISMATCH',
  );
  demand(
    displaySha256(originalManifestBytes) === originalManifestPin,
    'ORIGINAL_MAP_MANIFEST_PIN_MISMATCH',
  );
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const review = JSON.parse(reviewBytes.toString('utf8'));
  const originals = JSON.parse(originalManifestBytes.toString('utf8'));
  const ui = JSON.parse(uiManifestBytes.toString('utf8'));
  demand(
    manifest.schemaVersion === 'COUNTRY_SCENE_DISPLAY_CORRECTION_V1' &&
      manifest.version === followupVersion &&
      manifest.nature === 'DISPLAY_ONLY_IMAGE_CORRECTION_NOT_WORLD_STATE' &&
      manifest.originalManifestSha256 === originalManifestPin &&
      manifest.originalUiManifestSha256 === displaySha256(uiManifestBytes) &&
      manifest.previousCorrectionManifestSha256 === manifestPin &&
      manifest.reviewSha256 === followupReviewPin &&
      same(
        manifest.entries.map((e) => e.number),
        followupCountries,
      ),
    'FOLLOWUP_FIXED_IDENTITY_REQUIRED',
  );
  demand(
    review.schemaVersion === 'COUNTRY_SCENE_FOLLOWUP_CANDIDATE_REVIEW_V1' &&
      review.version === followupVersion &&
      same(review.scope, followupCountries) &&
      review.decision === 'APPROVED_FOR_ILLUSTRATIVE_ASSET_CANDIDATE_ONLY' &&
      review.codeApproval === false &&
      review.mergeApproval === false &&
      review.publicationApproval === false &&
      review.all70Approved === false &&
      review.geographyOrEconomicDataModified === false &&
      review.exactPixelAnchorAlignment === 'NOT_PROVEN' &&
      review.quantitativeSharpness === 'NOT_RUN' &&
      review.rows.length === 5 &&
      same(
        review.reports.map((r) => [r.markdownSha256, r.jsonSha256, r.scope]),
        followupReports,
      ) &&
      review.reports[0].actualImageViews === 6 &&
      review.reports[1].actualImageViews === 9,
    'FOLLOWUP_FIXED_INDEPENDENT_CANDIDATE_REVIEW_REQUIRED',
  );
  for (const e of manifest.entries) {
    const n = e.number;
    const originalPath = `apps/world-web/src/assets/country-scenes/${n}.png`;
    const old = originals.files.find((f) => f.path === originalPath);
    const legacy = ui.files.find(
      (f) =>
        f.path ===
        `role-prototypes/season1-immersive/countries/assets/scenes/${n}.png`,
    );
    demand(
      e.sourcePath === `${followupDirectory}/${n}.png` &&
        e.displayPath === `scene-corrections/${followupVersion}/${n}.png` &&
        e.legacyAlias ===
          `season1-immersive/countries/assets/scenes/${n}.png` &&
        old &&
        legacy &&
        e.original.sourcePath === originalPath &&
        e.original.bytes === old.bytes &&
        e.original.sha256 === old.sha256 &&
        legacy.bytes === old.bytes &&
        legacy.sha256 === old.sha256 &&
        e.original.publicUrl ===
          `official-map-source/${originalManifestPin}/files/${originalPath}` &&
        Number.isSafeInteger(e.bytes) &&
        e.bytes > 0 &&
        e.bytes <= 16 * 1024 * 1024 &&
        /^[0-9a-f]{64}$/u.test(e.sha256),
      'FOLLOWUP_FIXED_SOURCE_IDENTITY_REQUIRED',
    );
    const r = review.rows.find((r) => r.number === n);
    const report = followupReports.find((r) => r[2].includes(n));
    demand(
      r &&
        report &&
        r.sha256 === e.sha256 &&
        r.originalSha256 === e.original.sha256 &&
        r.reportMarkdownSha256 === report[0] &&
        r.reportJsonSha256 === report[1] &&
        r.verdict === 'APPROVED_FOR_ILLUSTRATIVE_ASSET_CANDIDATE_ONLY' &&
        r.actualOriginalCandidateReferenceViewed === true &&
        r.principalLandmarksPreservedVisually === true &&
        r.clarityVerdict === 'NO_SIGNIFICANT_OVERALL_DEGRADATION_OBSERVED' &&
        r.exactPixelAnchorAlignment === 'NOT_PROVEN' &&
        r.requiredChanges.length === 0,
      'FOLLOWUP_IMAGE_REVIEW_MISMATCH',
    );
  }
  return deepFreeze({ manifest, review });
}
export async function loadDisplayCorrections() {
  const [manifestBytes, reviewBytes, originalManifestBytes, uiManifestBytes] =
    await Promise.all([
      fixedRead(`${directory}/manifest.json`),
      fixedRead(`${directory}/review.json`),
      fixedRead('artifacts/world-map-files-v1/manifest.json'),
      fixedRead('artifacts/ui-authority/20260928T134420Z/MANIFEST.json'),
    ]);
  const records = inspectCorrectionRecords(
    manifestBytes,
    reviewBytes,
    originalManifestBytes,
    uiManifestBytes,
  );
  const data = new Map();
  for (const entry of records.manifest.entries) {
    const bytes = await fixedRead(entry.sourcePath);
    verifyCorrectionPng(bytes, entry);
    data.set(entry.number, bytes);
  }
  const proof = deepFreeze({
    kind: 'VERIFIED_DISPLAY_ASSETS_NOT_AUTHORITY',
    manifest: records.manifest,
    review: records.review,
  });
  packages.set(proof, {
    data,
    manifestBytes,
    manifestPin,
    version: correctionVersion,
    countryCount: 8,
  });
  return proof;
}
export async function loadFollowupDisplayCorrections() {
  const [manifestBytes, reviewBytes, originalManifestBytes, uiManifestBytes] =
    await Promise.all([
      fixedRead(`${followupDirectory}/manifest.json`),
      fixedRead(`${followupDirectory}/review.json`),
      fixedRead('artifacts/world-map-files-v1/manifest.json'),
      fixedRead('artifacts/ui-authority/20260928T134420Z/MANIFEST.json'),
    ]);
  const records = inspectFollowupCorrectionRecords(
    manifestBytes,
    reviewBytes,
    originalManifestBytes,
    uiManifestBytes,
  );
  const data = new Map();
  for (const entry of records.manifest.entries) {
    const bytes = await fixedRead(entry.sourcePath);
    verifyCorrectionPng(bytes, entry);
    data.set(entry.number, bytes);
  }
  const proof = deepFreeze({
    kind: 'VERIFIED_FOLLOWUP_DISPLAY_ASSETS_NOT_AUTHORITY',
    ...records,
  });
  packages.set(proof, {
    data,
    manifestBytes,
    manifestPin: followupManifestPin,
    version: followupVersion,
    countryCount: 5,
  });
  return proof;
}
/** Validate the complete alias set before a single output is written. No caller paths. */
export function preflightDisplayCorrectionPublication(proof, aliases) {
  const snapshot = packages.get(proof);
  demand(snapshot, 'CORRECTION_PRIVATE_PACKAGE_REQUIRED');
  demand(
    aliases instanceof Map && aliases.size === snapshot.countryCount,
    'CORRECTION_ALL_ALIASES_REQUIRED',
  );
  const targets = [];
  for (const entry of proof.manifest.entries) {
    const bytes = aliases.get(entry.number);
    demand(Buffer.isBuffer(bytes), 'CORRECTION_ALIAS_REQUIRED');
    const digest = displaySha256(bytes);
    demand(
      (bytes.length === entry.original.bytes &&
        digest === entry.original.sha256) ||
        (bytes.length === entry.bytes && digest === entry.sha256),
      'CORRECTION_ALIAS_UNEXPECTED_BYTES',
    );
    for (const relativePath of [entry.displayPath, entry.legacyAlias])
      targets.push({
        relativePath,
        bytes: entry.bytes,
        sha256: entry.sha256,
        number: entry.number,
      });
  }
  const manifestPath = `scene-corrections/${snapshot.version}/manifest.json`;
  targets.push({
    relativePath: manifestPath,
    bytes: snapshot.manifestBytes.length,
    sha256: snapshot.manifestPin,
    number: null,
  });
  const plan = deepFreeze({ kind: 'FIXED_DISPLAY_OUTPUT_PLAN', targets });
  plans.set(plan, { proof, snapshot });
  return plan;
}
export function preflightAllDisplayCorrectionPublication(
  baseProof,
  followupProof,
  aliases,
) {
  demand(
    packages.get(baseProof)?.version === correctionVersion &&
      packages.get(followupProof)?.version === followupVersion &&
      aliases instanceof Map &&
      aliases.size === 13,
    'CORRECTION_FIXED_TWO_PACKAGES_AND_ALL_ALIASES_REQUIRED',
  );
  const basePlan = preflightDisplayCorrectionPublication(
    baseProof,
    new Map(correctedCountries.map((n) => [n, aliases.get(n)])),
  );
  const followupPlan = preflightDisplayCorrectionPublication(
    followupProof,
    new Map(followupCountries.map((n) => [n, aliases.get(n)])),
  );
  const targets = [...basePlan.targets, ...followupPlan.targets];
  demand(
    new Set(targets.map((t) => t.relativePath)).size === 28,
    'CORRECTION_OUTPUT_SETS_MUST_BE_DISJOINT',
  );
  const batch = deepFreeze({
    kind: 'FIXED_DISPLAY_BATCH_OUTPUT_PLAN',
    targets,
  });
  batches.set(batch, [basePlan, followupPlan]);
  return batch;
}
async function assertDistPath(relative) {
  const dist = path.join(root, 'apps/world-web/dist');
  demand(
    !relative.startsWith('/') &&
      !relative
        .split('/')
        .some((s) => !s || s === '.' || s === '..' || s.includes('\\')),
    'CORRECTION_OUTPUT_PATH_INVALID',
  );
  let current = dist;
  const top = await lstat(dist);
  demand(top.isDirectory() && !top.isSymbolicLink(), 'CORRECTION_DIST_INVALID');
  for (const segment of relative.split('/')) {
    current = path.join(current, segment);
    const stat = await lstat(current).catch((e) => {
      if (e.code === 'ENOENT') return null;
      throw e;
    });
    demand(!stat?.isSymbolicLink(), 'CORRECTION_OUTPUT_SYMLINK_DENIED');
  }
  return current;
}
async function verifyPackageOutput(proof) {
  const snapshot = packages.get(proof);
  demand(snapshot, 'CORRECTION_PRIVATE_PACKAGE_REQUIRED');
  for (const entry of proof.manifest.entries)
    for (const target of [entry.displayPath, entry.legacyAlias]) {
      const p = await assertDistPath(target);
      verifyCorrectionPng(await readFile(p), entry);
    }
  const p = await assertDistPath(
    `scene-corrections/${snapshot.version}/manifest.json`,
  );
  demand(
    displaySha256(await readFile(p)) === snapshot.manifestPin,
    'CORRECTION_OUTPUT_MANIFEST_MISMATCH',
  );
  return {
    status: 'PASS',
    correctedImages: snapshot.countryCount,
    verifiedDisplayAliases: snapshot.countryCount,
    originalSourcesModified: false,
    deploymentVerified: false,
    exactPixelAnchorAlignment: 'NOT_PROVEN',
  };
}
export async function verifyBuiltDisplayCorrections() {
  return verifyPackageOutput(await loadDisplayCorrections());
}
export async function verifyAllBuiltDisplayCorrections() {
  const baseProof = await loadDisplayCorrections();
  const followupProof = await loadFollowupDisplayCorrections();
  await verifyPackageOutput(baseProof);
  await verifyPackageOutput(followupProof);
  return {
    status: 'PASS',
    correctedImages: 13,
    verifiedDisplayAliases: 13,
    versions: [correctionVersion, followupVersion],
    originalSourcesModified: false,
    deploymentVerified: false,
    exactPixelAnchorAlignment: 'NOT_PROVEN',
  };
}
async function writePlans(planList) {
  const outputs = planList.flatMap((plan) => {
    const privatePlan = plans.get(plan);
    demand(privatePlan, 'CORRECTION_PRIVATE_PLAN_REQUIRED');
    return plan.targets.map((target) => ({
      target,
      bytes:
        target.number === null
          ? privatePlan.snapshot.manifestBytes
          : privatePlan.snapshot.data.get(target.number),
    }));
  });
  for (const row of outputs)
    demand(
      row.bytes && displaySha256(row.bytes) === row.target.sha256,
      'CORRECTION_SNAPSHOT_DRIFT',
    );
  const destinations = await Promise.all(
    outputs.map((row) => assertDistPath(row.target.relativePath)),
  );
  for (const [i, row] of outputs.entries()) {
    await mkdir(path.dirname(destinations[i]), { recursive: true });
    await writeFile(destinations[i], row.bytes);
  }
}
export async function publishDisplayCorrections() {
  const proof = await loadDisplayCorrections(),
    aliases = new Map();
  for (const e of proof.manifest.entries)
    aliases.set(e.number, await readFile(await assertDistPath(e.legacyAlias)));
  const plan = preflightDisplayCorrectionPublication(proof, aliases);
  await writePlans([plan]);
  return verifyBuiltDisplayCorrections();
}
export async function publishAllDisplayCorrections() {
  const baseProof = await loadDisplayCorrections();
  const followupProof = await loadFollowupDisplayCorrections();
  const aliases = new Map();
  for (const proof of [baseProof, followupProof])
    for (const entry of proof.manifest.entries)
      aliases.set(
        entry.number,
        await readFile(await assertDistPath(entry.legacyAlias)),
      );
  const batch = preflightAllDisplayCorrectionPublication(
    baseProof,
    followupProof,
    aliases,
  );
  const planList = batches.get(batch);
  demand(planList, 'CORRECTION_PRIVATE_BATCH_REQUIRED');
  // All thirteen aliases, fixed source bytes and all 28 destination chains precede writes.
  await writePlans(planList);
  return verifyAllBuiltDisplayCorrections();
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  demand(
    process.argv.length === 2 ||
      (process.argv.length === 3 && process.argv[2] === '--check'),
    'No custom paths or correction sets accepted',
  );
  console.log(
    JSON.stringify(
      await (process.argv[2] === '--check'
        ? verifyAllBuiltDisplayCorrections()
        : publishAllDisplayCorrections()),
    ),
  );
}
