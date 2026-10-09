/** Offline diagnostics only. Never publishes admission, writes SQL or starts a World. */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SEED_PREFLIGHT_SCHEMA = 'world-seed-preflight-v1';
const root = path.resolve(import.meta.dirname, '..');
const ownerPath =
  'docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISIONS.original.md';
const receiptPath =
  'docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISION_RECEIPT.json';
const outputDirectory = 'artifacts/world-seed-delivery-v1';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

function countsByCode(rows) {
  const counts = new Map();
  for (const row of rows) counts.set(row.code, (counts.get(row.code) ?? 0) + 1);
  return Object.fromEntries([...counts].sort(([a], [b]) => a.localeCompare(b)));
}

export async function collectWorldSeedPreflight(repositoryRoot = root) {
  // Use existing server-owned validators. No replacement mapper, fixture FX,
  // fabricated World identity, approval flag or application startup is supplied.
  const [nonHost, bridgeModule, physicalModule, waterModule, socialModule] =
    await Promise.all([
      import('../apps/world-worker/dist/preparation/owner-non-host-source-adoption.js'),
      import('../apps/world-worker/dist/preparation/opening-canonical-seed-bridge.js'),
      import('../apps/world-worker/dist/preparation/official-physical-opening-adoption.js'),
      import('../apps/world-worker/dist/preparation/official-water-opening-adoption.js'),
      import('../apps/world-worker/dist/preparation/official-labour-social-opening-adoption.js'),
    ]);
  const read = (relative) =>
    readFile(path.join(repositoryRoot, relative), 'utf8');
  const adopted = await nonHost.loadOwnerNonHostSourceAdoption({
    repositoryRoot,
    ownerDocumentPath: path.join(repositoryRoot, ownerPath),
    rootReceiptPath: path.join(repositoryRoot, receiptPath),
    scope: { environment: 'NON_ACTIVATED_PREPARATION', worldId: null },
  });
  const mappingBytes = await read(
    'docs/reports/world-connection/C_OFFICIAL_WORLD_OPENING_MAPPING.json',
  );
  const datasets = {};
  for (const domain of adopted.source.domains) {
    if (!/^data\/[a-z0-9-]+\.json$/u.test(domain.sourcePath))
      throw new Error('SOURCE_PATH_INVALID');
    datasets[domain.sourcePath] = await read(
      'artifacts/world-balanced-candidate-v1/' + domain.sourcePath,
    );
  }
  const sourceBytes = {
    mappingBytes,
    datasets,
    checksumsBytes: await read(
      'artifacts/world-balanced-candidate-v1/CHECKSUMS.json',
    ),
    coverageBytes: await read(
      'docs/reports/world-connection/C_OFFICIAL_WORLD_COMPLETE_COVERAGE.json',
    ),
    proposalBytes: await read(
      'artifacts/E_OPENING_SEMANTIC_MAPPING_PROPOSAL_2026_10_07.md',
    ),
  };
  const ownerDecisionBytes = await read(ownerPath);
  const physical = physicalModule.buildOfficialPhysicalOpeningAdoption({
    sourceBytes,
    ownerDecisionBytes,
  });
  const water = waterModule.buildOfficialWaterOpeningAdoption({
    sourceBytes,
    ownerDecisionBytes,
  });
  const social = socialModule.createOfficialLabourSocialOpeningAdoption({
    source: adopted.source,
    mappingBytes,
    ownerOriginalBytes: ownerDecisionBytes,
    ownerReceiptBytes: await read(receiptPath),
    datasets: Object.fromEntries(
      ['employment', 'population-services', 'regions', 'facilities'].map(
        (name) => [name, datasets[`data/${name}.json`]],
      ),
    ),
  });
  const bridge = bridgeModule.prepareOwnerAdoptedOpeningSeed({
    sourceAdoption: adopted,
    seedId: 'SEED_DIAGNOSTIC_ONLY',
    sourceId: 'SOURCE_DIAGNOSTIC_ONLY',
  });
  const physicalGaps = [
    ...physical.facilities,
    ...physical.deposits,
    ...physical.power,
  ].flatMap((item) => item.gaps);
  const waterGaps = water.countries.flatMap((item) => item.gaps);
  const gapGroups = {
    financialSource: adopted.manifest.gaps,
    canonicalSeedBridge: bridge.blockers,
    physical: physicalGaps,
    water: waterGaps,
    labourSocial: social.gaps,
  };
  const gateBytes = await read('status/progress.json');
  const gate = JSON.parse(gateBytes).current_gate;
  const selectionBytes = await read('status/world-data-selection.json');
  const selection = JSON.parse(selectionBytes);
  const countries = adopted.manifest.countries.map((country) => ({
    countryId: country.countryId,
    rawFinance: country.rawFinance,
    denominations: country.denominations,
    bankOpening: country.bankOpening,
    holderRoster: country.holderRoster,
    centralBankCategories: country.cbInput,
    centralBankNetWorth: country.centralBankNetWorth,
  }));
  const report = {
    schemaVersion: SEED_PREFLIGHT_SCHEMA,
    status: 'BLOCKED',
    mode: 'OFFLINE_DIAGNOSTIC_NOT_AN_OPENING_SEED',
    sourcePackageId: adopted.ownerPolicy.sourcePins.packageId,
    sourceManifestFingerprint: adopted.manifestFingerprint,
    sourcePins: adopted.ownerPolicy.sourcePins,
    observedGovernance: {
      progressSha256: hash(gateBytes),
      currentGate: gate,
      selectionSha256: hash(selectionBytes),
      recordedRuntime: selection.runtime,
      externalRuntimeVerification: 'NOT_PERFORMED',
    },
    capabilities: {
      authoritativeSeedProduced: false,
      admissionAllowed: false,
      productionAuthorized: false,
      databaseAccessPerformed: false,
      workerStarted: false,
      clockStarted: false,
    },
    counts: {
      countries: countries.length,
      entities: adopted.manifest.entities.length,
      stockCells: adopted.manifest.stockRights.length,
      positiveStockSourceCells: adopted.manifest.stockRights.filter(
        (cell) => cell.positive,
      ).length,
      positiveInventoryEntries: adopted.inventoryEntries.length,
      centralBankCategoryRows: countries.reduce(
        (sum, country) => sum + country.centralBankCategories.length,
        0,
      ),
      gapGroups: Object.fromEntries(
        Object.entries(gapGroups).map(([name, rows]) => [
          name,
          { rowCount: rows.length, byCode: countsByCode(rows) },
        ]),
      ),
    },
    inspectedDomainStates: {
      financial: adopted.state,
      seedBridge: bridge.status,
      physical: physical.status,
      water: water.status,
      labourSocial: social.status,
    },
    // These are follow-up requirements, not newly verified runtime facts.
    remainingPrerequisites: [
      'COMPLETE_SOURCE_AND_LAWFUL_DENOMINATION',
      'POLITICAL_CAPITAL_GENESIS_SOURCE_OR_EXPLICIT_DESIGN',
      'FORMAL_WORLD_ADMISSION_AND_SEED_LINEAGE',
      'REAL_ADMIN_AND_LAWFUL_CURRENT_SEATS',
      'APPROVED_SCHEMA_PUBLICATION_AND_RUNTIME_DEPLOYMENT',
      'INDEPENDENT_REVIEW_AND_REQUIRED_GATE_ACCEPTANCE',
    ],
    countingRule:
      'Diagnostic rows overlap across consumers and are not independent Owner questions. Reserved CB categories are not invented holdings or approved zero balances. The report never certifies production readiness.',
    countries,
    gaps: gapGroups,
  };
  const worksheet = {
    schemaVersion: 'world-seed-input-worksheet-v1',
    status: 'UNFILLED_NON_AUTHORITATIVE_NOT_CONSUMED_BY_RUNTIME',
    sourceManifestFingerprint: adopted.manifestFingerprint,
    worldBindingEvidence: null,
    instructions:
      'Keep unknowns null. Record actual holdings and explicit completeness evidence; do not populate every reserved category with fabricated positions. This worksheet is not approval, an OpeningSeed, or a supported publication input.',
    countries: countries.map((country) => ({
      countryId: country.countryId,
      knownCategoryFacts: country.centralBankCategories,
      holdingRegisterSource: null,
      holdingRegisterCompletenessEvidence: null,
      actualHoldingRecords: null,
      denominationAndFxEvidence: null,
      politicalCapitalGenesisEvidence: null,
      operatingStateEvidence: null,
    })),
  };
  return { report, worksheet };
}

export function seedPreflightExitCode(mode, report) {
  // --report means the diagnostic export succeeded. It is never a ready gate.
  return mode === '--report' ? 0 : report.status === 'BLOCKED' ? 2 : 1;
}

export async function runWorldSeedPreflight(args = process.argv.slice(2)) {
  if (args.length !== 1 || !['--report', '--check'].includes(args[0])) {
    console.error(
      'Usage: node scripts/world-seed-preflight.mjs --report|--check',
    );
    return 1;
  }
  const { report, worksheet } = await collectWorldSeedPreflight();
  if (args[0] === '--report') {
    const directory = path.join(root, outputDirectory);
    await mkdir(directory, { recursive: true });
    const files = {
      'preflight.json': JSON.stringify(report, null, 2) + '\n',
      'input-worksheet.json': JSON.stringify(worksheet, null, 2) + '\n',
    };
    for (const [name, bytes] of Object.entries(files))
      await writeFile(path.join(directory, name), bytes, { encoding: 'utf8' });
    await writeFile(
      path.join(directory, 'checksums.json'),
      JSON.stringify(
        Object.entries(files).map(([name, bytes]) => ({
          path: name,
          bytes: Buffer.byteLength(bytes),
          sha256: hash(bytes),
        })),
        null,
        2,
      ) + '\n',
    );
  }
  console.log(
    JSON.stringify({
      status: report.status,
      mode: args[0],
      capabilities: report.capabilities,
      counts: report.counts,
      reportDirectory: args[0] === '--report' ? outputDirectory : null,
    }),
  );
  return seedPreflightExitCode(args[0], report);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.exitCode = await runWorldSeedPreflight();
  } catch (error) {
    // Do not downgrade source drift, missing artifacts or invalid policy to READY.
    console.error(
      JSON.stringify({
        status: 'INVALID_INPUT',
        error:
          error instanceof Error ? error.message : 'Unknown diagnostic error',
      }),
    );
    process.exitCode = 1;
  }
}
