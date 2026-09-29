import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadBalancedCountryCandidate } from './balanced-country-candidate-intake.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const selection = JSON.parse(
  await readFile(path.join(root, 'status/world-data-selection.json'), 'utf8'),
);
const packageRoot = path.join(root, selection.balancedData.path, 'data');
const outputRoot = path.join(
  root,
  'apps/world-web/public/season1-immersive/countries/data',
);
const check = process.argv.includes('--check');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const source = await loadBalancedCountryCandidate(root);
if (
  selection.decision !== 'OWNER_SELECTED_OFFICIAL_WORLD_V2_DATA_BASELINE' ||
  source.candidateId !== selection.balancedData.packageId ||
  source.manifestSha256 !== selection.balancedData.checksumsSha256 ||
  source.countries.length !== 70 ||
  selection.runtime.worldId !== null ||
  selection.runtime.openingSeedCommitted !== false
) {
  throw new Error('Selected official opening data is missing or has changed');
}
const read = async (name) =>
  JSON.parse(await readFile(path.join(packageRoot, `${name}.json`), 'utf8'));
const [
  countries,
  finance,
  stocks,
  plans,
  employment,
  facilities,
  links,
  deposits,
  power,
  regions,
  services,
] = await Promise.all(
  [
    'countries',
    'finance',
    'stocks',
    'production-plans',
    'employment',
    'facilities',
    'facility-map-links',
    'deposits',
    'power',
    'regions',
    'population-services',
  ].map(read),
);
const linkById = new Map(links.map((item) => [item.facilityId, item]));
const byCountry = (rows, id) => rows.filter((row) => row.countryId === id);
const one = (rows, id, label) => {
  const matched = byCountry(rows, id);
  if (matched.length !== 1)
    throw new Error(`${label}: expected one row for ${id}`);
  return matched[0];
};
const kindFor = (name) => {
  if (/港|口岸/.test(name)) return 'port';
  if (/物流|库存|仓/.test(name)) return 'hub';
  if (/矿|开采/.test(name)) return 'mine';
  if (/油田|气田|太阳|风能|电网|储能/.test(name)) return 'energy';
  if (/教育/.test(name)) return 'education';
  if (/医院|医疗/.test(name)) return 'health';
  if (/住房/.test(name)) return 'housing';
  if (/GRAIN/.test(name)) return 'farm';
  return 'factory';
};
const text = (value) => JSON.stringify(value, null, 2) + '\n';
async function emit(file, value) {
  const expected = text(value);
  if (check) {
    if ((await readFile(file, 'utf8')) !== expected) {
      throw new Error(
        `Official UI data is stale: ${path.relative(root, file)}`,
      );
    }
  } else {
    await writeFile(file, expected);
  }
}
const index = [];
for (const selected of countries) {
  const number = selected.number;
  const file = path.join(outputRoot, `${number}.json`);
  const visual = JSON.parse(await readFile(file, 'utf8'));
  if (visual.id !== selected.id || visual.number !== number) {
    throw new Error(`Visual/official country identity mismatch: ${number}`);
  }
  const f = one(finance, selected.id, 'finance');
  const e = one(employment, selected.id, 'employment');
  const p = one(power, selected.id, 'power');
  const countryStocks = byCountry(stocks, selected.id);
  const countryPlans = byCountry(plans, selected.id);
  const grainStock = countryStocks.find((row) => row.commodityId === 'GRAIN');
  const grainPlan = countryPlans.find((row) => row.commodityId === 'GRAIN');
  if (
    !grainStock ||
    !grainPlan ||
    countryStocks.length !== 12 ||
    countryPlans.length !== 12
  ) {
    throw new Error(`Missing official commodity rows: ${selected.id}`);
  }
  const oldFacilities = new Map(visual.facilities.map((row) => [row.id, row]));
  const oldResources = new Map(visual.resources.map((row) => [row.id, row]));
  const countryFacilities = byCountry(facilities, selected.id).map((item) => {
    const old = oldFacilities.get(item.id);
    const link = linkById.get(item.id);
    if (!link || link.countryId !== selected.id) {
      throw new Error(`Missing official facility map link: ${item.id}`);
    }
    return {
      id: item.id,
      countryId: item.countryId,
      point: item.point,
      kind: old?.kind ?? kindFor(item.name),
      name: item.name,
      resourceId: item.resourceId,
      projectId: item.projectId,
      projectNumber: old?.projectNumber ?? null,
      anchor: link.sceneAnchor,
      record: {
        id: item.id,
        countryId: item.countryId,
        projectId: item.projectId,
        name: item.name,
        lifecycle: item.status,
        operational: item.runtimeOperational,
        estimatedCapacity: item.capacity,
        capacityUnit: item.capacityUnit,
        requiredWorkers: item.requiredWorkers,
        requiredPowerMW: item.requiredPowerMW,
        requiredWaterM3Day: item.requiredWaterM3Day,
        maintenanceGcuDay: item.maintenanceGcuDayProposal,
        equipmentUnits: item.installedMachineryUnits,
        constructionSimDays: item.constructionSimDaysProposal,
        recipeStatus: item.recipeId ?? 'NO_APPROVED_RECIPE',
        scenarioRole: item.scenarioRole,
        openingAvailabilityProposal: item.openingAvailabilityProposal,
        sourceStatus: item.status,
      },
    };
  });
  const countryResources = byCountry(deposits, selected.id).map((item) => {
    const old = oldResources.get(item.id);
    if (!old)
      throw new Error(`Missing official resource display point: ${item.id}`);
    return {
      ...old,
      countryId: item.countryId,
      point: item.point,
      commodityId: item.commodityId,
      visibility: item.visibility,
      tradable: false,
      deposit: item,
    };
  });
  const countryRegions = byCountry(regions, selected.id).map((row) =>
    Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'path')),
  );
  const profile = {
    countryId: selected.id,
    economyIdProposal: selected.economyIdProposal,
    bindingStatus: 'OPENING_SEED_NOT_COMMITTED',
    population: selected.population,
    labourForce: selected.labourForce,
    scenarioEmployed: e.employed,
    scenarioUnemployed: e.unemployed,
    foodProductionTonnesDay: grainPlan.outputPerDay,
    foodDemandTonnesDay: grainPlan.usePerDay,
    foodAvailableStockTonnes: grainStock.available,
    foodReservedTonnes: grainStock.reserved,
    foodInTransitTonnes: grainStock.inTransit,
    dailyIncomeGcu: f.dailyLabourIncomeReference,
    treasuryCentralBankBalanceGcu: f.treasuryCentralBankBalance,
    bankDepositsGcu: f.bankDepositLiabilities,
    bankReservesGcu: f.bankReserveAssets,
    bankLoansGcu: f.bankLoanAssets,
    bankEquityGcu: f.bankEquity,
    historicalDebtGcu: f.publicDebt,
    existingContracts: f.existingContracts,
    techLicenses: [],
    historicalPolicy: f.openingMoneyOrigin,
    strengths: visual.profile.strengths,
    bottlenecks: visual.profile.bottlenecks,
    developmentPaths: visual.profile.developmentPaths,
  };
  const updated = {
    ...visual,
    name: selected.name,
    climateMix: selected.climateMix,
    neighbours: selected.neighbours,
    coastal: selected.coastal,
    facilities: countryFacilities,
    resources: countryResources,
    regions: countryRegions,
    profile,
    power: p,
    areaKm2: selected.areaKm2,
    sourceStatus: 'OFFICIAL_SELECTED_OPENING_DATA_NOT_RUNTIME_STATE',
    officialOpening: {
      sourcePackageId: selection.balancedData.packageId,
      countriesSha256: selection.balancedData.countriesSha256,
      worldId: null,
      openingSeedCommitted: false,
      finance: f,
      employment: e,
      stocks: countryStocks,
      productionPlans: countryPlans,
      populationServices: byCountry(services, selected.id),
    },
  };
  if (
    countryRegions.reduce((sum, row) => sum + row.initial.population, 0) !==
    selected.population
  ) {
    throw new Error(`Region population does not reconcile: ${selected.id}`);
  }
  await emit(file, updated);
  index.push({
    id: selected.id,
    number,
    name: selected.name,
    scene: visual.scene,
    areaKm2: selected.areaKm2,
    population: selected.population,
    facilities: countryFacilities.length,
    resources: countryResources.length,
    coastal: selected.coastal,
    climate: visual.climates[0]?.name ?? '',
    neighbours: selected.neighbours,
    sourceStatus: updated.sourceStatus,
  });
}
if (
  index.reduce((sum, row) => sum + row.population, 0) !==
  selection.balancedData.populationTotal
) {
  throw new Error('Official UI population total does not reconcile');
}
await emit(path.join(outputRoot, 'index.json'), index);
process.stdout.write(
  JSON.stringify({
    status: check ? 'VERIFIED' : 'SYNCED',
    sourceSha256: sha256(
      await readFile(path.join(packageRoot, 'countries.json')),
    ),
    countries: index.length,
    population: selection.balancedData.populationTotal,
    facilities: facilities.length,
    deposits: deposits.length,
    runtimeConnected: false,
  }) + '\n',
);
