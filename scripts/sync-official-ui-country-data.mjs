import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadBalancedCountryCandidate } from './balanced-country-candidate-intake.mjs';
import {
  canonicalDecimal,
  parseLosslessJson,
} from './official-world-opening-mapping.mjs';

export const OFFICIAL_UI_PROVENANCE_SCHEMA = 'OFFICIAL_UI_FIELD_PROVENANCE_V1';
const pointerPart = (value) =>
  String(value).replace(/~/gu, '~0').replace(/\//gu, '~1');
const pointer = (parts) =>
  parts.map((part) => `/${pointerPart(part)}`).join('');
const at = (row, parts) => parts.reduce((value, part) => value[part], row);

// Units describe the selected source, never a settlement-currency or rights grant.
export function officialFieldUnit(dataset, row, parts) {
  const field = parts.at(-1);
  const source = (unit, unitBasis) => ({ unit, unitBasis });
  if (parts.includes('point') || parts.includes('capitalPointProposal'))
    return source('scene coordinate', 'SOURCE_FIELD_NAME');
  if (['capacity', 'estimatedCapacity'].includes(field) && row.capacityUnit)
    return source(row.capacityUnit, 'SOURCE_CAPACITY_UNIT');
  if (
    dataset === 'stocks' &&
    ['available', 'reserved', 'inTransit'].includes(field)
  )
    return source(row.unit, 'SOURCE_UNIT');
  if (
    dataset === 'production-plans' &&
    ['outputPerDay', 'usePerDay', 'netPerDay'].includes(field)
  )
    return source(`${row.unit}/sim-day`, 'SOURCE_UNIT_AND_FIELD_NAME');
  if (dataset === 'finance') {
    if (field === 'taxRateProposal')
      return source('fraction', 'SOURCE_FIELD_NAME');
    if (field === 'cashRunwayDays')
      return source('sim-day', 'SOURCE_FIELD_NAME');
    if (
      field === 'dailyLabourIncomeReference' ||
      /^daily.*(?:Gcu|Net)$/u.test(field)
    )
      return source(
        `${row.currency}/sim-day`,
        'SOURCE_CURRENCY_AND_FIELD_NAME',
      );
    return source(row.currency, 'SOURCE_CURRENCY');
  }
  if (/GcuDay|GcuDayProposal/u.test(field))
    return source('GCU_SCENARIO_ACCOUNTING_UNIT/sim-day', 'SOURCE_FIELD_NAME');
  if (/Gcu$/u.test(field))
    return source('GCU_SCENARIO_ACCOUNTING_UNIT', 'SOURCE_FIELD_NAME');
  if (/Km2$/u.test(field) || parts.includes('landUseKm2'))
    return source('km2', 'SOURCE_FIELD_NAME');
  if (/Km$/u.test(field)) return source('km', 'SOURCE_FIELD_NAME');
  if (/Ha$/u.test(field) && !/TonnesHa$/u.test(field))
    return source('ha', 'SOURCE_FIELD_NAME');
  if (/Tonnes$/u.test(field)) return source('tonne', 'SOURCE_FIELD_NAME');
  if (/TonnesDay$/u.test(field))
    return source('tonne/sim-day', 'SOURCE_FIELD_NAME');
  if (/TonnesYear$/u.test(field))
    return source('tonne/year', 'SOURCE_FIELD_NAME');
  if (/TonnesHa$/u.test(field)) return source('tonne/ha', 'SOURCE_FIELD_NAME');
  if (/M3Year$/u.test(field)) return source('m3/year', 'SOURCE_FIELD_NAME');
  if (/Mm$/u.test(field) || parts.includes('monthlyRainMm'))
    return source('mm', 'SOURCE_FIELD_NAME');
  if (field === 'meanElevationM') return source('m', 'SOURCE_FIELD_NAME');
  if (field === 'temperatureC') return source('degC', 'SOURCE_FIELD_NAME');
  if (field === 'solarKwhM2Day')
    return source('kWh/m2/sim-day', 'SOURCE_FIELD_NAME');
  if (field === 'windMps') return source('m/s', 'SOURCE_FIELD_NAME');
  if (/MW$/u.test(field)) return source('MW', 'SOURCE_FIELD_NAME');
  if (/MWh$/u.test(field)) return source('MWh', 'SOURCE_FIELD_NAME');
  if (/M3Day$/u.test(field)) return source('m3/sim-day', 'SOURCE_FIELD_NAME');
  if (/Days$|SimDays(?:Proposal)?$|bufferDays$/u.test(field))
    return source('sim-day', 'SOURCE_FIELD_NAME');
  if (
    /population|Population|labourForce|employed|unemployed|Workers|teachers|medicalWorkers/u.test(
      field,
    ) ||
    dataset === 'employment'
  )
    return source('person', 'SOURCE_FIELD_NAME');
  if (/MachineryUnits|equipmentUnits/u.test(field))
    return source('equipment unit', 'SOURCE_FIELD_NAME');
  if (dataset === 'deposits') {
    if (/Geological|Consumed|Extracted|Remaining|Allocated/u.test(field))
      return source(row.unit, 'SOURCE_UNIT');
    if (/PerDay$/u.test(field))
      return source(`${row.unit}/sim-day`, 'SOURCE_UNIT_AND_FIELD_NAME');
    if (field === 'depthM') return source('m', 'SOURCE_FIELD_NAME');
  }
  if (/Factor$|Fraction$|Share$/u.test(field))
    return source('fraction', 'SOURCE_FIELD_NAME');
  if (field === 'sharePercent') return source('percent', 'SOURCE_FIELD_NAME');
  if (field === 'housingUnits')
    return source('housing unit', 'SOURCE_FIELD_NAME');
  if (field === 'households') return source('household', 'SOURCE_FIELD_NAME');
  if (field === 'schoolSeats')
    return source('school seat', 'SOURCE_FIELD_NAME');
  if (field === 'hospitalBeds')
    return source('hospital bed', 'SOURCE_FIELD_NAME');
  if (field === 'dailyMedicalVisits')
    return source('visit/sim-day', 'SOURCE_FIELD_NAME');
  return source('UNIT_NOT_SPECIFIED_IN_SOURCE', 'NOT_SPECIFIED');
}

const natureFor = (dataset) =>
  ({
    countries: 'OPENING_INPUT_SOURCE',
    regions: 'OPENING_INPUT_SOURCE',
    finance: 'OPENING_INPUT_BLOCKED_ON_SEMANTICS',
    stocks: 'OPENING_INPUT_BLOCKED_ON_OWNERSHIP',
    'facility-map-links': 'DISPLAY_ASSOCIATION',
  })[dataset] ?? 'PROPOSAL_READ_ONLY';

export async function syncOfficialUiCountryData(root, { check = false } = {}) {
  const selection = JSON.parse(
    await readFile(path.join(root, 'status/world-data-selection.json'), 'utf8'),
  );
  const packageRoot = path.join(root, selection.balancedData.path, 'data');
  const outputRoot = path.join(
    root,
    'apps/world-web/public/season1-immersive/countries/data',
  );
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
  const datasets = {};
  const rowOrigins = new WeakMap();
  const read = async (name) => {
    const sourcePath = `data/${name}.json`;
    const artifact = source.artifacts.find(
      (item) => item.sourcePath === sourcePath,
    );
    if (!artifact) throw new Error(`Missing verified source: ${sourcePath}`);
    // Capture the lexical values before building the backwards-compatible Number view.
    const exact = parseLosslessJson(artifact.content, sourcePath);
    const rows = JSON.parse(artifact.content);
    datasets[name] = {
      sourcePath,
      sha256: artifact.sha256,
      recordCountExact: String(rows.length),
    };
    rows.forEach((row, rowIndex) =>
      rowOrigins.set(row, {
        dataset: name,
        rowIndex,
        exact: exact[rowIndex],
        rowId:
          row.id ??
          row.facilityId ??
          (row.commodityId
            ? `${row.countryId}:${row.commodityId}`
            : row.countryId),
      }),
    );
    return rows;
  };
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
    const oldFacilities = new Map(
      visual.facilities.map((row) => [row.id, row]),
    );
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
    const fields = {};
    const trace = (outputParts, row, sourceParts = []) => {
      const origin = rowOrigins.get(row);
      if (!origin) throw new Error('Unbound official source row');
      const visit = (targetParts, parts) => {
        const value = at(row, parts);
        if (typeof value === 'number') {
          if (!Object.is(at(updated, targetParts), value))
            throw new Error(
              `Official display/source mismatch: ${pointer(targetParts)}`,
            );
          const rawToken = at(origin.exact, parts);
          fields[pointer(targetParts)] = {
            exact: canonicalDecimal(
              rawToken,
              `${origin.dataset}${pointer(parts)}`,
            ),
            rawToken,
            dataset: origin.dataset,
            rowId: origin.rowId,
            rowIndex: origin.rowIndex,
            field: parts.join('.'),
            sourcePointer: pointer([origin.rowIndex, ...parts]),
            ...officialFieldUnit(origin.dataset, row, parts),
            nature: natureFor(origin.dataset),
          };
        } else if (value !== null && typeof value === 'object') {
          for (const key of Object.keys(value))
            visit([...targetParts, key], [...parts, key]);
        }
      };
      visit(outputParts, sourceParts);
    };
    for (const field of ['areaKm2', 'climateMix'])
      trace([field], selected, [field]);
    for (const field of ['population', 'labourForce'])
      trace(['profile', field], selected, [field]);
    for (const [alias, row, field] of [
      ['scenarioEmployed', e, 'employed'],
      ['scenarioUnemployed', e, 'unemployed'],
      ['foodProductionTonnesDay', grainPlan, 'outputPerDay'],
      ['foodDemandTonnesDay', grainPlan, 'usePerDay'],
      ['foodAvailableStockTonnes', grainStock, 'available'],
      ['foodReservedTonnes', grainStock, 'reserved'],
      ['foodInTransitTonnes', grainStock, 'inTransit'],
      ['dailyIncomeGcu', f, 'dailyLabourIncomeReference'],
      ['treasuryCentralBankBalanceGcu', f, 'treasuryCentralBankBalance'],
      ['bankDepositsGcu', f, 'bankDepositLiabilities'],
      ['bankReservesGcu', f, 'bankReserveAssets'],
      ['bankLoansGcu', f, 'bankLoanAssets'],
      ['bankEquityGcu', f, 'bankEquity'],
      ['historicalDebtGcu', f, 'publicDebt'],
    ])
      trace(['profile', alias], row, [field]);
    for (const field of ['finance', 'employment'])
      trace(['officialOpening', field], field === 'finance' ? f : e);
    for (const [field, rows] of [
      ['stocks', countryStocks],
      ['productionPlans', countryPlans],
      ['populationServices', byCountry(services, selected.id)],
    ])
      rows.forEach((row, index) =>
        trace(['officialOpening', field, index], row),
      );
    trace(['power'], p);
    byCountry(facilities, selected.id).forEach((row, index) => {
      trace(['facilities', index, 'point'], row, ['point']);
      trace(['facilities', index, 'anchor'], linkById.get(row.id), [
        'sceneAnchor',
      ]);
      for (const [alias, field] of [
        ['estimatedCapacity', 'capacity'],
        ['requiredWorkers', 'requiredWorkers'],
        ['requiredPowerMW', 'requiredPowerMW'],
        ['requiredWaterM3Day', 'requiredWaterM3Day'],
        ['maintenanceGcuDay', 'maintenanceGcuDayProposal'],
        ['equipmentUnits', 'installedMachineryUnits'],
        ['constructionSimDays', 'constructionSimDaysProposal'],
      ])
        trace(['facilities', index, 'record', alias], row, [field]);
    });
    byCountry(deposits, selected.id).forEach((row, index) => {
      trace(['resources', index, 'point'], row, ['point']);
      trace(['resources', index, 'deposit'], row);
    });
    byCountry(regions, selected.id).forEach((row, index) => {
      for (const field of Object.keys(row).filter((key) => key !== 'path'))
        trace(['regions', index, field], row, [field]);
    });
    const collection = (dataset, rows, predicate) => ({
      countExact: String(rows.length),
      dataset,
      sourceRowIds: rows.map((row) => rowOrigins.get(row).rowId),
      rule: predicate.scenarioRole
        ? 'FILTER_COUNTRY_ID_AND_SCENARIO_ROLE_DEVELOPMENT_OPTION'
        : 'FILTER_COUNTRY_ID',
      predicate,
      unit: 'source record',
      nature: 'DERIVED_SOURCE_COUNT_NOT_RUNTIME',
    });
    updated.officialSource = {
      schemaVersion: OFFICIAL_UI_PROVENANCE_SCHEMA,
      sourcePackageId: selection.balancedData.packageId,
      sourceChecksumsSha256: source.manifestSha256,
      authority: 'SELECTED_SOURCE_NOT_RUNTIME',
      datasets,
      fields,
      collections: {
        facilities: collection(
          'facilities',
          byCountry(facilities, selected.id),
          { countryId: selected.id },
        ),
        resources: collection('deposits', byCountry(deposits, selected.id), {
          countryId: selected.id,
        }),
        historicalDevelopmentOptions: collection(
          'facilities',
          byCountry(facilities, selected.id).filter(
            (row) => row.scenarioRole === 'DEVELOPMENT_OPTION',
          ),
          { countryId: selected.id, scenarioRole: 'DEVELOPMENT_OPTION' },
        ),
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
  return {
    status: check ? 'CHECKED' : 'SYNCED',
    sourceSha256: sha256(
      await readFile(path.join(packageRoot, 'countries.json')),
    ),
    countries: index.length,
    population: selection.balancedData.populationTotal,
    facilities: facilities.length,
    deposits: deposits.length,
    runtimeConnected: false,
  };
}

const invokedPath = process.argv[1] && path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  process.stdout.write(
    JSON.stringify(
      await syncOfficialUiCountryData(root, {
        check: process.argv.includes('--check'),
      }),
    ) + '\n',
  );
}
