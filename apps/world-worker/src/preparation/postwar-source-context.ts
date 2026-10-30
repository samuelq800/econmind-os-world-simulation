/** Fixed server-side source composition; no production connection or mutation. */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  OfficialOpeningBundleLoader,
  isLoadedOfficialOpeningBundle,
  isOfficialOpeningBundleV2,
  type LoadedOfficialOpeningBundle,
} from './official-opening-bundle-loader.js';
import { inspectOfficialOpeningDecisionSource } from './official-opening-decision-reconciliation.js';
import {
  loadOwnerNonHostSourceAdoption,
  produceOwnerNonHostSourceAdoption,
} from './owner-non-host-source-adoption.js';
import { createOfficialLabourSocialOpeningAdoption } from './official-labour-social-opening-adoption.js';

export async function loadPostwarSourceContext(repositoryRoot: string) {
  if (!path.isAbsolute(repositoryRoot))
    throw Error('POSTWAR_FIXED_REPOSITORY_ROOT_REQUIRED');
  const loaded = await new OfficialOpeningBundleLoader({
    repositoryRoot,
  }).load();
  const sourceBytes = loaded.inputs.source;
  const inspected = inspectOfficialOpeningDecisionSource(sourceBytes);
  if (!inspected.source) throw Error('POSTWAR_VERIFIED_BASE_SOURCE_REQUIRED');
  const read = (relative: string) =>
    readFile(path.join(repositoryRoot, relative), 'utf8');
  const ownerPath =
    'docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISIONS.original.md';
  const receiptPath =
    'docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISION_RECEIPT.json';
  const [ownerOriginalBytes, ownerReceiptBytes, ownerAdoption] =
    await Promise.all([
      read(ownerPath),
      read(receiptPath),
      loadOwnerNonHostSourceAdoption({
        repositoryRoot,
        ownerDocumentPath: path.join(repositoryRoot, ownerPath),
        rootReceiptPath: path.join(repositoryRoot, receiptPath),
        scope: { environment: 'NON_ACTIVATED_PREPARATION', worldId: null },
      }),
    ]);
  const source = inspected.source;
  const mappingBytes = sourceBytes.mappingBytes;
  const datasets = sourceBytes.datasets;
  const labourSocial = createOfficialLabourSocialOpeningAdoption({
    source,
    mappingBytes,
    ownerOriginalBytes,
    ownerReceiptBytes,
    datasets: {
      employment: datasets['data/employment.json']!,
      'population-services': datasets['data/population-services.json']!,
      regions: datasets['data/regions.json']!,
      facilities: datasets['data/facilities.json']!,
    },
  });
  return Object.freeze({
    loaded,
    sourceBytes,
    source,
    ownerAdoption,
    labourSocial,
    ownerOriginalBytes,
    ownerReceiptBytes,
    mappingBytes,
    countriesBytes: datasets['data/countries.json']!,
    regionsBytes: datasets['data/regions.json']!,
    facilitiesBytes: datasets['data/facilities.json']!,
    employmentBytes: datasets['data/employment.json']!,
    financeBytes: datasets['data/finance.json']!,
    selectionBytes: loaded.inputs.selectionBytes,
  });
}

/** Reconstruct the identical pinned context from the genuine per-publication
 * loader snapshot. No request object, path, signer or second source of truth. */
export function derivePostwarSourceContextFromLoaded(
  loaded: LoadedOfficialOpeningBundle,
) {
  if (
    !isLoadedOfficialOpeningBundle(loaded) ||
    !loaded.bundle ||
    !isOfficialOpeningBundleV2(loaded.bundle) ||
    !loaded.financialProvenance
  )
    throw Error('POSTWAR_PINNED_FINANCIAL_LOADER_REQUIRED');
  const sourceBytes = loaded.inputs.source;
  const inspected = inspectOfficialOpeningDecisionSource(sourceBytes);
  if (!inspected.source) throw Error('POSTWAR_VERIFIED_BASE_SOURCE_REQUIRED');
  const source = inspected.source;
  const ownerOriginalBytes =
    loaded.bundle.financial.parentOwnerInstructionBytes;
  const ownerReceiptBytes = loaded.bundle.financial.parentOwnerReceiptBytes;
  const ownerAdoption = produceOwnerNonHostSourceAdoption({
    source,
    ownerPolicy: loaded.financialProvenance.parentPolicy,
    scope: { environment: 'NON_ACTIVATED_PREPARATION', worldId: null },
  });
  const mappingBytes = sourceBytes.mappingBytes;
  const datasets = sourceBytes.datasets;
  const labourSocial = createOfficialLabourSocialOpeningAdoption({
    source,
    mappingBytes,
    ownerOriginalBytes,
    ownerReceiptBytes,
    datasets: {
      employment: datasets['data/employment.json']!,
      'population-services': datasets['data/population-services.json']!,
      regions: datasets['data/regions.json']!,
      facilities: datasets['data/facilities.json']!,
    },
  });
  return Object.freeze({
    loaded,
    sourceBytes,
    source,
    ownerAdoption,
    labourSocial,
    ownerOriginalBytes,
    ownerReceiptBytes,
    mappingBytes,
    countriesBytes: datasets['data/countries.json']!,
    regionsBytes: datasets['data/regions.json']!,
    facilitiesBytes: datasets['data/facilities.json']!,
    employmentBytes: datasets['data/employment.json']!,
    financeBytes: datasets['data/finance.json']!,
    selectionBytes: loaded.inputs.selectionBytes,
  });
}
