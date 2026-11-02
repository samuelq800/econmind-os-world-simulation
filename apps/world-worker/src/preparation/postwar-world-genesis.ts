/** Executing new-world preparation. No DB connection, signer, queue or Clock. */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadPostwarSourceContext } from './postwar-source-context.js';
import { createPostwarMonetaryGenesis } from './postwar-monetary-genesis.js';
import {
  preparePostwarSocialServiceGenesis,
  createPostwarSocialServiceFundingRequests,
} from './postwar-social-service-genesis.js';
import {
  createPostwarPublicSafetyGenesis,
  createPostwarPublicSafetyFundingRequests,
  finalizePostwarPublicSafetyGenesis,
} from './postwar-public-safety-genesis.js';
import {
  preparePostwarLabourGenesis,
  materializePostwarLabourGenesis,
} from './postwar-labour-genesis.js';
import { createPostwarWagePolicy } from './postwar-wage-policy.js';
import { createPostwarFinancialGenesis } from './postwar-financial-genesis.js';
import { createPostwarFundingGenesis } from './postwar-funding-genesis.js';
import { buildPostwarHousingGenesis } from './postwar-housing-genesis.js';
import {
  buildPostwarOperatingSupplies,
  appendPostwarOperatingSupplies,
  allocatePostwarOperatingSupplies,
} from './postwar-operating-supplies.js';
import {
  createPostwarUtilityInputs,
  allocatePostwarUtilityInputs,
} from './postwar-utility-inputs.js';
import { finalizePostwarSocialSupport } from './postwar-social-support.js';
import { createPostwarPopulationFacts } from './postwar-population-facts.js';

export async function preparePostwarWorldGenesis(
  input: Readonly<{
    repositoryRoot: string;
    worldId: string;
    seedId: string;
    genesisVersion: string;
    valueDate: string;
  }>,
) {
  const context = await loadPostwarSourceContext(input.repositoryRoot);
  const read = (name: string) =>
    readFile(
      path.join(input.repositoryRoot, 'config/postwar-genesis', name),
      'utf8',
    );
  const [
    wagePolicyBytes,
    safetyPolicyBytes,
    housingPolicyBytes,
    supplyPolicyBytes,
    utilityPolicyBytes,
  ] = await Promise.all([
    read('wage-policy.v1.json'),
    read('public-safety.v1.json'),
    read('housing.v1.json'),
    read('supplies.v1.json'),
    read('utilities.v1.json'),
  ]);
  const social = preparePostwarSocialServiceGenesis({
    adoption: context.labourSocial,
    mappingBytes: context.mappingBytes,
    regionsBytes: context.regionsBytes,
    worldId: input.worldId,
    seedId: input.seedId,
  });
  const utilities = createPostwarUtilityInputs({
    sourceBytes: context.sourceBytes,
    ownerDecisionBytes: context.ownerOriginalBytes,
    adoption: context.labourSocial,
    social,
    worldId: input.worldId,
    seedId: input.seedId,
    openingGregorianTimestamp: `${input.valueDate}T00:00:00.000Z`,
    policyBytes: utilityPolicyBytes,
  });
  const utilityAllocations = allocatePostwarUtilityInputs(utilities);
  const safety = createPostwarPublicSafetyGenesis({
    source: context.source,
    adoption: context.labourSocial,
    mappingBytes: context.mappingBytes,
    regionsBytes: context.regionsBytes,
    countriesBytes: context.countriesBytes,
    worldId: input.worldId,
    seed: input.seedId,
    policyBytes: safetyPolicyBytes,
  });
  const labour = preparePostwarLabourGenesis({
    adoption: context.labourSocial,
    mappingBytes: context.mappingBytes,
    regionsBytes: context.regionsBytes,
    facilitiesBytes: context.facilitiesBytes,
    serviceDemands: [...social.demands, ...safety.demands],
  });
  const monetary = createPostwarMonetaryGenesis({
    source: context.source,
    countriesBytes: context.countriesBytes,
    mappingBytes: context.mappingBytes,
    valueDate: input.valueDate,
  });
  const wages = createPostwarWagePolicy({
    policyBytes: wagePolicyBytes,
    adoption: context.labourSocial,
    financeSource: context.source,
    labourPreparation: labour,
    monetaryBindings: monetary.bindings,
  });
  const financial = createPostwarFinancialGenesis({
    adoption: context.ownerAdoption,
    monetary,
    worldId: input.worldId,
    seedId: input.seedId,
    sourceId: 'SOURCE_POSTWAR_FINANCIAL_V1',
    genesisVersion: input.genesisVersion,
  });
  const supplies = buildPostwarOperatingSupplies({
    source: context.source,
    adoption: context.labourSocial,
    mappingBytes: context.mappingBytes,
    countriesBytes: context.countriesBytes,
    regionsBytes: context.regionsBytes,
    worldId: input.worldId,
    seedId: input.seedId,
    policyBytes: supplyPolicyBytes,
  });
  const supplySeed = appendPostwarOperatingSupplies(
    financial.baselineSeed,
    supplies,
  );
  const supplyAllocations = allocatePostwarOperatingSupplies(
    supplies,
    supplies.stocks.map((stock) => ({
      allocationId: `POSTWAR_FIRST_DAY_${stock.entry.entryId}`,
      consumerRef: stock.serviceAssetId,
      worldId: input.worldId,
      countryId: stock.countryId,
      locationId: stock.locationId,
      serviceAssetId: stock.serviceAssetId,
      sourceId: supplies.source.sourceId,
      entryId: stock.entry.entryId,
      commodityId: stock.entry.account.commodityId,
      unit: stock.entry.quantity.unit,
      quantity: stock.dailyBasis,
    })),
  );
  const socialRequests = createPostwarSocialServiceFundingRequests(
    social,
    wages,
  );
  const welfareRequests = createPostwarPublicSafetyFundingRequests({
    genesis: safety,
    labour,
    social,
    wages,
  });
  const funding = createPostwarFundingGenesis({
    source: context.source,
    openingSeed: supplySeed,
    monetary,
    labourPreparation: labour,
    wages,
    publicRequests: [...socialRequests.requests, ...welfareRequests],
  });
  const materializedLabour = materializePostwarLabourGenesis(labour, {
    wagesByPositionId: funding.wagesByPositionId,
  });
  const housing = buildPostwarHousingGenesis({
    sourceBytes: context.sourceBytes,
    ownerDecisionBytes: context.ownerOriginalBytes,
    policyBytes: housingPolicyBytes,
    wagePolicy: wages,
  });
  const safetyFinalized = finalizePostwarPublicSafetyGenesis({
    genesis: safety,
    labour,
    social,
    wages,
    funding: {
      balances: funding.balances.filter((a) => a.payerRole === 'GOV'),
      allocations: [
        ...funding.positionFunding.filter((a) =>
          safety.demands.some((d) => d.positionId === a.purposeId),
        ),
        ...funding.allocations.filter((a) =>
          safety.programmes.some((p) => p.programmeId === a.purposeId),
        ),
      ],
    },
  });
  const socialFinalized = finalizePostwarSocialSupport({
    social,
    socialRequests,
    wages,
    funding,
    supplies,
    supplyAllocations,
    utilities,
    utilityAllocations,
    labour,
  });
  const populationFacts = createPostwarPopulationFacts({
    labourPreparation: labour,
    socialPrepared: social,
    socialFinalized,
  });
  return Object.freeze({
    input,
    context,
    social,
    safety,
    labour,
    monetary,
    wages,
    financial,
    supplies,
    utilities,
    utilityAllocations,
    supplySeed,
    supplyAllocations,
    socialRequests,
    welfareRequests,
    funding,
    materializedLabour,
    housing,
    safetyFinalized,
    socialFinalized,
    populationFacts,
    policyBytes: Object.freeze({
      wages: wagePolicyBytes,
      safety: safetyPolicyBytes,
      housing: housingPolicyBytes,
      supplies: supplyPolicyBytes,
      utilities: utilityPolicyBytes,
    }),
    worldStarted: false as const,
    clockStarted: false as const,
    paymentsPosted: false as const,
    status:
      'FINANCIAL_AND_PERSONNEL_PREPARED_PENDING_COMPLETE_OPERATING_ADOPTION' as const,
  });
}
