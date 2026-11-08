/** Fixed admitted-source joins for the already adopted internal handover.
 * No plan, filled worker, order or budget-reference is actual service or pay. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  canonicalSerialize,
  createFoundationFact,
  Money,
  type FoundationTraceRequest,
} from '@econmind/core';
import { readPreparedFinanceSocialOpening } from '@econmind/core/finance-social-prepared-ledger';
import {
  prepareIndustryInternalLogisticsSourceFromPreparedOpening,
  readIndustryInternalLogisticsSource,
  INDUSTRY_INTERNAL_LOGISTICS_POLICY_VERSION,
  INDUSTRY_INTERNAL_LOGISTICS_MULTICOUNTRY_POLICY_VERSION,
  INDUSTRY_INTERNAL_LOGISTICS_MULTICOUNTRY_POLICY_RAW_SHA256,
  INDUSTRY_INTERNAL_LOGISTICS_POLICY_RAW_SHA256,
  INDUSTRY_INTERNAL_LOGISTICS_ADOPTION_RAW_SHA256,
} from '@econmind/core/industry-internal-logistics';
import {
  prepareIndustryInternalLogisticsReplaySources,
  type IndustryInternalLogisticsReplaySources,
  type IndustryLogisticsLabourSource,
  type IndustryLogisticsExpenseOriginal,
} from '@econmind/core/industry-internal-logistics-execution';
import type { IndustryUtilitySource } from '@econmind/core/industry-utility-execution';
import { isVerifiedOfficialOpeningDecisionSource } from '../preparation/official-opening-decision-reconciliation.js';
import type { PostwarPhysicalSourceContext } from '../preparation/postwar-physical-service-receipt.js';
import {
  consumePreparedPostwarSocialFinancialReplayBase,
  type PreparedPostwarSocialFinancialReplayBase,
} from './prepared-postwar-social-source.js';
import {
  readPostwarIndustryFirstDaySourceFrom,
  decodePostwarIndustryFirstDaySourceRow,
  type PostwarIndustryFirstDaySourceData,
} from './postwar-industry-first-day-source.js';
import type { SqlExecutor } from './sql-database.js';
import { readPostwarBeneficialHousingRentMixedOriginalsForSocialBase } from './postwar-beneficial-housing-rent-mixed-source.js';
const sha = (v: string) => createHash('sha256').update(v).digest('hex');
function fail(s: string): never {
  throw Error('INDUSTRY_LOGISTICS_SOURCE:' + s);
}
function object(v: unknown): Readonly<Record<string, unknown>> {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    fail('EXACT_SOURCE_RECORD_REQUIRED');
  return v as Readonly<Record<string, unknown>>;
}
function text(v: unknown): string {
  if (typeof v !== 'string' || !v) fail('EXACT_SOURCE_TEXT_REQUIRED');
  return v;
}
export interface PostwarIndustryLogisticsPolicyBytes {
  readonly policy: string;
  readonly adoption: string;
  readonly multiCountryPolicy?: string;
}
export async function loadPostwarIndustryLogisticsPolicy(
  repositoryRoot: string,
): Promise<Readonly<PostwarIndustryLogisticsPolicyBytes>> {
  if (!path.isAbsolute(repositoryRoot)) fail('FIXED_REPOSITORY_ROOT_REQUIRED');
  const [policy, adoption, multiCountryPolicy] = await Promise.all([
    readFile(
      path.join(
        repositoryRoot,
        'config/postwar-genesis/industry-internal-logistics-first-day.v1.json',
      ),
      'utf8',
    ),
    readFile(
      path.join(
        repositoryRoot,
        'docs/reports/office-connection/INDUSTRY_UTILITIES_ADOPTION_20261101.json',
      ),
      'utf8',
    ),
    readFile(
      path.join(
        repositoryRoot,
        'config/postwar-genesis/industry-internal-logistics-first-day.multicountry-v2.json',
      ),
      'utf8',
    ),
  ]);
  if (
    sha(multiCountryPolicy) !==
      INDUSTRY_INTERNAL_LOGISTICS_MULTICOUNTRY_POLICY_RAW_SHA256 ||
    sha(policy) !== INDUSTRY_INTERNAL_LOGISTICS_POLICY_RAW_SHA256 ||
    sha(adoption) !== INDUSTRY_INTERNAL_LOGISTICS_ADOPTION_RAW_SHA256
  )
    fail('ADOPTED_POLICY_BYTES_REQUIRED');
  return Object.freeze({ policy, adoption, multiCountryPolicy });
}
export function projectPostwarIndustryLogisticsReplaySources(
  input: Readonly<{
    baseline: Readonly<PreparedPostwarSocialFinancialReplayBase>;
    context: PostwarPhysicalSourceContext;
    firstday: Readonly<PostwarIndustryFirstDaySourceData>;
    runIds: readonly string[];
    policyBytes: PostwarIndustryLogisticsPolicyBytes;
    expenseOriginals: readonly IndustryLogisticsExpenseOriginal[];
    workOriginals?: readonly IndustryLogisticsExpenseOriginal[];
  }>,
): Readonly<{
  source: IndustryInternalLogisticsReplaySources | null;
  physical: ReturnType<typeof readIndustryInternalLogisticsSource>;
  labour: IndustryLogisticsLabourSource;
  utilitySources: readonly IndustryUtilitySource[];
}> {
  const b = consumePreparedPostwarSocialFinancialReplayBase(input.baseline),
    d = input.firstday.data,
    f = object(d.sourceFacility),
    opening = readPreparedFinanceSocialOpening(b.prepared);
  if (
    sha(input.policyBytes.policy) !==
      INDUSTRY_INTERNAL_LOGISTICS_POLICY_RAW_SHA256 ||
    sha(input.policyBytes.adoption) !==
      INDUSTRY_INTERNAL_LOGISTICS_ADOPTION_RAW_SHA256
  )
    fail('ADOPTED_POLICY_BYTES_REQUIRED');
  const selectedPolicy =
    d.countryId === 'COUNTRY_02'
      ? input.policyBytes.policy
      : input.policyBytes.multiCountryPolicy;
  if (!selectedPolicy)
    throw new PostwarIndustryLogisticsSourceMissing(
      'ADOPTED_LOGISTICS_SCOPE_UNAVAILABLE',
    );
  const selectedHash = sha(selectedPolicy),
    multiCountry =
      selectedHash ===
      INDUSTRY_INTERNAL_LOGISTICS_MULTICOUNTRY_POLICY_RAW_SHA256;
  if (
    !multiCountry &&
    selectedHash !== INDUSTRY_INTERNAL_LOGISTICS_POLICY_RAW_SHA256
  )
    fail('ADOPTED_POLICY_BYTES_REQUIRED');
  if (
    multiCountry &&
    /^0(?:[.]0+)?$/u.test(String(object(d.domesticAccess).distanceKmEstimate))
  )
    throw new PostwarIndustryLogisticsSourceMissing(
      'POSITIVE_LOGISTICS_DISTANCE_REQUIRED_ZERO_SOURCE_NOT_OPERATIONAL',
    );
  const policyVersion = multiCountry
    ? INDUSTRY_INTERNAL_LOGISTICS_MULTICOUNTRY_POLICY_VERSION
    : INDUSTRY_INTERNAL_LOGISTICS_POLICY_VERSION;
  const policy = object(JSON.parse(selectedPolicy)),
    scope = object(policy.scope),
    mass = object(policy.massBasis);
  if (
    !multiCountry &&
    (d.countryId !== scope.country || d.facilityId !== scope.facility)
  )
    throw new PostwarIndustryLogisticsSourceMissing(
      'ADOPTED_LOGISTICS_SCOPE_UNAVAILABLE',
    );
  if (
    !isVerifiedOfficialOpeningDecisionSource(input.context.source) ||
    d.worldId !== b.pins.worldId ||
    d.seedId !== b.pins.seedRef ||
    d.seedFingerprint !== b.pins.contentHash ||
    d.admissionRef !== b.pins.admissionRef
  )
    fail('EXACT_ADMITTED_SITE_SOURCE_AND_PRIVATE_H0_REQUIRED');
  if (
    input.runIds.length > 256 ||
    new Set(input.runIds).size !== input.runIds.length
  )
    fail('ACTUAL_FINITE_RUN_SELECTION_REQUIRED');
  const countrySuffix = /^COUNTRY_(0[1-9]|[1-6][0-9]|70)$/u.exec(
    text(d.countryId),
  )?.[1];
  if (!countrySuffix) fail('ACTUAL_FINITE_COUNTRY_REQUIRED');
  const sourcePhysicalLocation = multiCountry
    ? 'LOCATION_WAREHOUSE_' + countrySuffix
    : text(scope.sourcePhysicalLocation);
  const operatorId = text(d.operatorId),
    countryId = text(d.countryId),
    facilityId = text(d.facilityId),
    stock = opening.inventory.balances.filter(
      (x) =>
        x.account.countryId === countryId &&
        x.account.titleHolderId === operatorId &&
        x.account.riskBearerId === operatorId &&
        x.account.commodityId === mass.commodityId &&
        x.account.unit === mass.unit &&
        x.account.physicalLocationId === sourcePhysicalLocation &&
        x.account.bucket === 'AVAILABLE',
    );
  if (!stock.length)
    throw new PostwarIndustryLogisticsSourceMissing(
      'ACTUAL_OP_WAREHOUSE_OPENING_REQUIRED',
    );
  if (stock.length !== 1) fail('ACTUAL_UNIQUE_OP_WAREHOUSE_OPENING_REQUIRED');
  const snapshot = {
      lineageRef: 'LOGISTICS_' + b.pins.seedRef,
      sourceVersion: b.pins.seedRef,
      snapshotRef: 'OPENING_' + countryId,
      snapshotHash: b.pins.contentHash.slice(7),
      predecessorSnapshotHash: null,
    },
    trace: FoundationTraceRequest = {
      traceRef: 'INTERNAL_LOGISTICS_' + countryId,
      calculationVersion: policyVersion,
      snapshot,
      snapshotAt: { amount: '0', unit: 'sim_millisecond' },
    };
  const source = prepareIndustryInternalLogisticsSourceFromPreparedOpening({
    prepared: b.prepared,
    openingInventoryAccountSha256: sha(canonicalSerialize(stock[0]!.account)),
    trace,
    siteFact: createFoundationFact({
      trace,
      factRef: 'REGISTERED_' + facilityId,
      sourceRef: input.firstday.sourceRef,
      predecessorFactRefs: [input.firstday.sourceRef],
      payload: {
        facilityRef: facilityId,
        countryRef: countryId,
        operatorRef: operatorId,
        locationRef: text(d.locationId),
        sourceCountryId: text(f.countryId),
        sourceOperatorId: text(f.operatorId),
      },
    }),
    policyRawBytes: selectedPolicy,
    adoptionRawBytes: input.policyBytes.adoption,
    sourceBytes: {
      'facilities.json':
        input.context.sourceBytes.datasets['data/facilities.json']!,
      'domestic-access.json':
        input.context.sourceBytes.datasets['data/domestic-access.json']!,
      'stocks.json': input.context.sourceBytes.datasets['data/stocks.json']!,
      'commodity-catalog.json':
        input.context.sourceBytes.datasets['data/commodity-catalog.json']!,
    },
    sha256Hex: sha,
  });
  const physical = readIndustryInternalLogisticsSource(source),
    sourceObjects = new Set(
      physical.logisticsEmploymentSources.map((x) => x.sourceObjectId),
    ),
    document = b.document.inputs;
  const positions = document.sourcePositions.filter(
    (p) =>
      sourceObjects.has(p.sourceObjectId) &&
      p.countryId === countryId &&
      p.employerId === operatorId &&
      p.sourceBucket === 'LOGISTICS',
  );
  if (!positions.length)
    throw new PostwarIndustryLogisticsSourceMissing(
      'ACTUAL_LOGISTICS_EMPLOYMENT_ORIGINALS_REQUIRED',
    );
  if (positions.length > 6)
    fail('ACTUAL_LOGISTICS_EMPLOYMENT_ORIGINALS_REQUIRED');
  const funding = document.fundingAccounts.filter(
    (a) =>
      a.countryId === countryId &&
      a.payerEntityId === operatorId &&
      a.payerRole === 'OP',
  );
  if (!funding.length)
    throw new PostwarIndustryLogisticsSourceMissing(
      'ACTUAL_OP_PAYROLL_FUNDING_ACCOUNT_REQUIRED',
    );
  if (funding.length !== 1) fail('ACTUAL_OP_PAYROLL_FUNDING_ACCOUNT_REQUIRED');
  const currency = funding[0]!.currency,
    householdAccountId =
      'ACCOUNT_' +
      sha(
        canonicalSerialize([
          b.pins.worldId,
          countryId,
          'HOUSEHOLD_DEPOSIT_ASSET',
          currency,
        ]),
      ).toUpperCase();
  const beneficiaries =
    readPostwarBeneficialHousingRentMixedOriginalsForSocialBase(
      input.baseline,
    )?.filter((r) => r.countryId === countryId) ?? [];
  if (beneficiaries.length > 1)
    fail('UNIQUE_GENUINE_CHILD_RECIPIENT_MAPPING_REQUIRED');
  const beneficiary = beneficiaries[0];
  const original = beneficiary?.originalAccount;
  if (
    !(
      original?.accountId === householdAccountId &&
      original.countryId === countryId &&
      original.accountClass === 'ASSET' &&
      original.currency === currency &&
      original.claimId !== null
    ) &&
    !b.financialAccounts.some(
      (a) =>
        a.accountId === householdAccountId &&
        a.countryId === countryId &&
        a.accountClass === 'ASSET' &&
        a.currency === currency &&
        a.claimId !== null,
    )
  )
    fail('ACTUAL_HOUSEHOLD_DEPOSIT_OR_BENEFICIAL_ORIGINAL_REQUIRED');
  const rows = positions
    .map((p) => {
      const wages = document.labour.positions.filter(
          (w) => w.positionId === p.positionId,
        ),
        people = document.populationPositionRefs.filter(
          (x) => x.positionId === p.positionId,
        ),
        funds = document.positionFunding.filter(
          (x) => x.positionId === p.positionId,
        );
      if (wages.length !== 1 || people.length !== 1 || funds.length !== 1)
        fail('EXACT_LOGISTICS_WAGE_POPULATION_FUNDING_JOIN_REQUIRED');
      const w = wages[0]!,
        r = people[0]!,
        pay = funds[0]!;
      if (
        p.employerRole !== 'OP' ||
        w.employerRole !== 'OP' ||
        w.employerId !== operatorId ||
        w.countryId !== countryId ||
        w.locationId !== p.locationId ||
        w.skill !== p.skill ||
        w.wagePeriod !== 'SIM_YEAR' ||
        w.wageCurrency !== currency ||
        p.personRange.poolId !== r.sourcePoolId ||
        p.personRange.startOrdinal !== r.sourceStartOrdinal ||
        p.filledCount !== r.count ||
        p.personRange.count !== r.count ||
        r.regionId !== p.locationId ||
        pay.accountRef !== funding[0]!.accountRef ||
        pay.payerEntityId !== operatorId ||
        pay.currency !== currency
      )
        fail('ACTUAL_LOGISTICS_SOURCE_COORDINATES_OR_CASH_SCOPE_DIFFER');
      if (p.skill !== 'LOW' && p.skill !== 'MEDIUM' && p.skill !== 'HIGH')
        fail('EXACT_LOGISTICS_SKILL_REQUIRED');
      return Object.freeze({
        positionId: p.positionId,
        poolId: r.sourcePoolId,
        regionId: r.regionId,
        cohortRef: r.cohortId,
        sourceStartOrdinal: r.sourceStartOrdinal,
        startOrdinal: r.startOrdinal,
        count: r.count,
        skill: p.skill,
        sourceBucket: 'LOGISTICS' as const,
        sourceObjectId: p.sourceObjectId,
        annualWage: Money.from(w.wageAmount, w.wageCurrency).toCanonicalValue()
          .amount,
        currency,
        wageSourceRef: w.payrollFundingRef,
        wageSourceRawSha256: sha(
          canonicalSerialize({
            position: p,
            wage: w,
            population: r,
            funding: pay,
          }),
        ),
        householdAccountId,
      });
    })
    .filter((p) => BigInt(p.count) > 0n);
  if (!rows.length)
    throw new PostwarIndustryLogisticsSourceMissing(
      'ACTUAL_FILLED_LOGISTICS_STAFF_REQUIRED',
    );
  const labourBody = {
      schemaVersion: 'industry-logistics-labour-source-v1' as const,
      worldId: b.pins.worldId,
      countryId,
      facilityId,
      operatorId,
      seedId: b.pins.seedRef,
      seedFingerprint: b.pins.contentHash,
      admissionRef: b.pins.admissionRef,
      positions: rows,
    },
    labourHash = sha(canonicalSerialize(labourBody)),
    labour: IndustryLogisticsLabourSource = Object.freeze({
      ...labourBody,
      sourceRef: 'LOGISTICS_LABOUR_' + labourHash.toUpperCase(),
      sourceRawSha256: labourHash,
    });
  const utilitySources: readonly IndustryUtilitySource[] = Object.freeze(
    input.runIds.map((runId) => {
      if (!/^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/u.test(runId))
        fail('EXACT_ACTUAL_RUN_REFERENCE_REQUIRED');
      const body = {
          worldId: b.pins.worldId,
          countryId,
          locationId: text(d.locationId),
          facilityId,
          operatorId,
          runId,
          seedId: b.pins.seedRef,
          seedFingerprint: b.pins.contentHash,
          admissionRef: b.pins.admissionRef,
          policyVersion,
          policyRawSha256: selectedHash,
          userAdoptionRawSha256:
            INDUSTRY_INTERNAL_LOGISTICS_ADOPTION_RAW_SHA256,
          originals: [
            {
              kind: 'REGISTERED_INDUSTRY_SITE',
              reference: input.firstday.sourceRef,
              rawSha256: input.firstday.rawSha256,
            },
            {
              kind: 'LOGISTICS_LABOUR',
              reference: labour.sourceRef,
              rawSha256: labour.sourceRawSha256,
            },
          ],
        },
        digest = sha(canonicalSerialize(body));
      return Object.freeze({
        ...body,
        sourceRef: 'LOGISTICS_SOURCE_' + digest.toUpperCase(),
        sourceRawSha256: digest,
      });
    }),
  );
  return Object.freeze({
    source: utilitySources.length
      ? prepareIndustryInternalLogisticsReplaySources(
          {
            source,
            labourSource: labour,
            utilitySources,
            expenseOriginals: input.expenseOriginals,
            workOriginals: input.workOriginals ?? [],
            ...(beneficiary ? { beneficialReceipt: beneficiary } : {}),
          },
          sha,
        )
      : null,
    physical,
    labour,
    utilitySources,
  });
}

/** Only private startup configuration is retained. Every read still obtains
 * the actual registered first-day parent and orders under the held SQL scope. */
const installed = new WeakMap<
  object,
  Readonly<{
    context: PostwarPhysicalSourceContext;
    policyBytes: PostwarIndustryLogisticsPolicyBytes;
  }>
>();
export function bindPostwarIndustryLogisticsSourceConfiguration(
  baseline: Readonly<PreparedPostwarSocialFinancialReplayBase>,
  config: Readonly<{
    context: PostwarPhysicalSourceContext;
    policyBytes: PostwarIndustryLogisticsPolicyBytes;
  }>,
): void {
  const b = consumePreparedPostwarSocialFinancialReplayBase(baseline);
  if (
    !isVerifiedOfficialOpeningDecisionSource(config.context.source) ||
    sha(config.context.sourceBytes.checksumsBytes) !==
      b.document.inputs.sourceChecksumsSha256 ||
    sha(config.policyBytes.policy) !==
      INDUSTRY_INTERNAL_LOGISTICS_POLICY_RAW_SHA256 ||
    (config.policyBytes.multiCountryPolicy !== undefined &&
      sha(config.policyBytes.multiCountryPolicy) !==
        INDUSTRY_INTERNAL_LOGISTICS_MULTICOUNTRY_POLICY_RAW_SHA256) ||
    sha(config.policyBytes.adoption) !==
      INDUSTRY_INTERNAL_LOGISTICS_ADOPTION_RAW_SHA256
  )
    fail('EXACT_PRIVATE_STARTUP_CONFIGURATION_REQUIRED');
  const old = installed.get(b.prepared);
  if (
    old &&
    (old.context !== config.context || old.policyBytes !== config.policyBytes)
  )
    fail('LOGISTICS_BASE_ALREADY_CONFIGURED');
  installed.set(b.prepared, Object.freeze(config));
}
export function retirePostwarIndustryLogisticsSourceConfiguration(
  baseline: Readonly<PreparedPostwarSocialFinancialReplayBase>,
): void {
  installed.delete(baseline.prepared);
}
export class PostwarIndustryLogisticsSourceMissing extends Error {
  readonly code = 'INDUSTRY_LOGISTICS_SOURCE_MISSING';
  constructor(reason: string) {
    super('INDUSTRY_LOGISTICS:' + reason);
    this.name = 'PostwarIndustryLogisticsSourceMissing';
  }
}

export const INDUSTRY_LOGISTICS_ORDERS_QUERY =
  'select * from world_v2.read_postwar_industry_logistics_orders($1,$2,$3,$4,$5::bigint,$6::bigint,$7,$8)';
export async function readPostwarIndustryLogisticsReplaySourcesFrom(
  tx: SqlExecutor,
  input: Readonly<{
    baseline: Readonly<PreparedPostwarSocialFinancialReplayBase>;
    worldId: string;
    countryId: string;
    facilityId: string;
    runIds: readonly string[];
    expectedHead: Readonly<{ worldVersion: string; eventSequence: string }>;
  }>,
) {
  const b = consumePreparedPostwarSocialFinancialReplayBase(input.baseline),
    configuration = installed.get(b.prepared);
  if (!configuration)
    throw new PostwarIndustryLogisticsSourceMissing(
      'PRIVATE_STARTUP_CONFIGURATION_MISSING',
    );
  const fixedScope = object(
    object(JSON.parse(configuration.policyBytes.policy)).scope,
  );
  if (
    input.countryId !== fixedScope.country ||
    input.facilityId !== fixedScope.facility
  )
    throw new PostwarIndustryLogisticsSourceMissing(
      'ADOPTED_LOGISTICS_SCOPE_UNAVAILABLE',
    );
  if (
    input.worldId !== b.pins.worldId ||
    !input.runIds.length ||
    input.runIds.length > 256 ||
    new Set(input.runIds).size !== input.runIds.length
  )
    fail('EXACT_FINITE_ADMITTED_RUN_SCOPE_REQUIRED');
  const firstday = await readPostwarIndustryFirstDaySourceFrom(tx, {
    worldId: input.worldId,
    countryId: input.countryId,
    facilityId: input.facilityId,
    head: input.expectedHead,
    expectedPins: {
      seedId: b.pins.seedRef,
      seedFingerprint: b.pins.contentHash,
      admissionRef: b.pins.admissionRef,
    },
  });
  if (!firstday)
    throw new PostwarIndustryLogisticsSourceMissing(
      'REGISTERED_FIRST_DAY_SOURCE_MISSING',
    );
  let totalBytes = 0;
  const workOriginals: IndustryLogisticsExpenseOriginal[] = [],
    expenseOriginals: IndustryLogisticsExpenseOriginal[] = [],
    seen = new Set<string>();
  for (const runId of input.runIds) {
    const result = await tx.query<Record<string, unknown>>(
      INDUSTRY_LOGISTICS_ORDERS_QUERY,
      [
        input.worldId,
        input.countryId,
        input.facilityId,
        runId,
        input.expectedHead.worldVersion,
        input.expectedHead.eventSequence,
        b.pins.contentHash,
        b.pins.admissionRef,
      ],
    );
    if (result.rows.length > 256) fail('BOUNDED_CONTROLLED_ORDERS_REQUIRED');
    for (const r of result.rows) {
      if (
        r.world_version !== input.expectedHead.worldVersion ||
        r.event_sequence !== input.expectedHead.eventSequence ||
        r.seed_fingerprint !== b.pins.contentHash ||
        r.admission_ref !== b.pins.admissionRef ||
        (r.kind !== 'WORK' && r.kind !== 'PAY')
      )
        fail('ORDER_ACTUAL_HEAD_ADMISSION_OR_KIND_DIFFERS');
      const reference = text(r.original_ref),
        rawText = text(r.original_text),
        rawSha256 = text(r.original_sha256);
      if (
        Buffer.byteLength(rawText, 'utf8') > 65536 ||
        sha(rawText) !== rawSha256 ||
        canonicalSerialize(JSON.parse(rawText)) !== rawText ||
        seen.has(reference)
      )
        fail('EXACT_UNIQUE_CANONICAL_ORDER_BYTES_REQUIRED');
      const body = object(JSON.parse(rawText));
      if (
        body.worldId !== input.worldId ||
        body.countryId !== input.countryId ||
        body.facilityId !== input.facilityId ||
        body.runId !== runId ||
        body.seedFingerprint !== b.pins.contentHash ||
        body.inputRef !== reference
      )
        fail('ORDER_SCOPE_DIFFERS');
      totalBytes += Buffer.byteLength(rawText, 'utf8');
      if (seen.size >= 256 || totalBytes > 1048576)
        fail('BOUNDED_COMPLETE_ORDER_SET_REQUIRED');
      seen.add(reference);
      (r.kind === 'WORK' ? workOriginals : expenseOriginals).push(
        Object.freeze({ reference, rawText, rawSha256 }),
      );
    }
  }
  const projected = projectPostwarIndustryLogisticsReplaySources({
    baseline: input.baseline,
    context: configuration.context,
    firstday,
    runIds: input.runIds,
    policyBytes: configuration.policyBytes,
    expenseOriginals,
    workOriginals,
  });
  if (!projected.source) fail('ACTUAL_RUN_REPLAY_SOURCE_REQUIRED');
  return Object.freeze({ ...projected, source: projected.source });
}

/** Actual COMMITTED historical originals use the current HOST lane, never a
 * target Industry seat. Later target revocation cannot erase an applied journal.
 * The complete Core fold still verifies every supplied canonical frame/effect. */
export const INDUSTRY_LOGISTICS_COMMITTED_SOURCE_QUERY =
  'select * from world_v2.read_postwar_industry_logistics_committed_source($1,$2,$3,$4,$5,$6,$7,$8,$9::bigint,$10::bigint,$11,$12)';
export const INDUSTRY_LOGISTICS_COMMITTED_ORDERS_QUERY =
  'select * from world_v2.read_postwar_industry_logistics_committed_orders($1,$2,$3,$4,$5,$6,$7,$8,$9::bigint,$10::bigint,$11,$12)';
export async function readPostwarIndustryLogisticsPageOriginalsFrom(
  tx: SqlExecutor,
  input: Readonly<{
    baseline: Readonly<PreparedPostwarSocialFinancialReplayBase>;
    worldId: string;
    hostCountryId: string;
    officeId: 'SOCIAL' | 'FINANCE';
    expectedHead: Readonly<{ worldVersion: string; eventSequence: string }>;
    frames: readonly import('@econmind/core/finance-budget-native').FinanceNativeBudgetCanonicalFrame[];
  }>,
) {
  const b = consumePreparedPostwarSocialFinancialReplayBase(input.baseline);
  if (
    b.pins.worldId !== input.worldId ||
    input.frames.length > 256 ||
    Buffer.byteLength(canonicalSerialize(input.frames), 'utf8') > 1048576
  )
    fail('EXACT_BOUNDED_ACTUAL_HISTORY_PAGE_REQUIRED');
  const frames = input.frames.filter(
    (f) => f.command.commandType === 'INDUSTRY_FIRST_DAY_LOGISTICS_EXECUTE_V1',
  );
  if (!frames.length)
    return Object.freeze({ industryLogisticsSources: Object.freeze([]) });
  const configuration = installed.get(b.prepared);
  if (!configuration)
    throw new PostwarIndustryLogisticsSourceMissing(
      'HISTORICAL_LOGISTICS_CONFIGURATION_NOT_PREPARED',
    );
  const found = new Map<
    string,
    {
      firstday: Readonly<PostwarIndustryFirstDaySourceData>;
      runs: Set<string>;
      work: Map<string, IndustryLogisticsExpenseOriginal>;
      pay: Map<string, IndustryLogisticsExpenseOriginal>;
    }
  >();
  let totalBytes = 0;
  for (const frame of frames) {
    const intent = JSON.parse(frame.command.canonicalPayload) as Record<
      string,
      unknown
    >;
    if (
      intent.serviceKind !== 'LOGISTICS' ||
      frame.command.worldId !== input.worldId ||
      frame.command.officeId !== 'INDUSTRY'
    )
      fail('ACTUAL_FIXED_LOGISTICS_HISTORY_REQUIRED');
    const countryId = text(frame.command.countryId),
      facilityId = text(intent.facilityId),
      runId = text(intent.runId);
    const parameters = [
      input.worldId,
      input.hostCountryId,
      input.officeId,
      countryId,
      facilityId,
      runId,
      frame.command.commandId,
      frame.command.fingerprint,
      input.expectedHead.worldVersion,
      input.expectedHead.eventSequence,
      b.pins.contentHash,
      b.pins.admissionRef,
    ];
    const rows = await tx.query<Record<string, unknown>>(
      INDUSTRY_LOGISTICS_COMMITTED_SOURCE_QUERY,
      parameters,
    );
    if (rows.rows.length !== 1)
      fail('EXACT_HISTORICAL_FIRSTDAY_ORIGINAL_REQUIRED');
    const firstday = decodePostwarIndustryFirstDaySourceRow(
      {
        source_text: text(rows.rows[0]!.source_text),
        source_sha256: text(rows.rows[0]!.source_sha256),
        source_ref: text(rows.rows[0]!.source_ref),
        world_version: text(rows.rows[0]!.world_version),
        event_sequence: text(rows.rows[0]!.event_sequence),
      },
      {
        worldId: input.worldId,
        countryId,
        facilityId,
        head: input.expectedHead,
        expectedPins: {
          seedId: b.pins.seedRef,
          seedFingerprint: b.pins.contentHash,
          admissionRef: b.pins.admissionRef,
        },
      },
    );
    const key = countryId + '\0' + facilityId,
      old = found.get(key);
    if (
      old &&
      (old.firstday.rawSha256 !== firstday.rawSha256 ||
        old.firstday.rawText !== firstday.rawText ||
        old.firstday.sourceRef !== firstday.sourceRef)
    )
      fail('HISTORICAL_FIRSTDAY_IMMUTABLE_IDENTITY_CHANGED');
    const group = old ?? {
      firstday,
      runs: new Set<string>(),
      work: new Map<string, IndustryLogisticsExpenseOriginal>(),
      pay: new Map<string, IndustryLogisticsExpenseOriginal>(),
    };
    group.runs.add(runId);
    found.set(key, group);
    const orders = await tx.query<Record<string, unknown>>(
      INDUSTRY_LOGISTICS_COMMITTED_ORDERS_QUERY,
      parameters,
    );
    if (orders.rows.length > 1)
      fail('EXACT_REFERENCED_HISTORICAL_ORDER_REQUIRED');
    for (const r of orders.rows) {
      if (
        r.world_version !== input.expectedHead.worldVersion ||
        r.event_sequence !== input.expectedHead.eventSequence ||
        r.seed_fingerprint !== b.pins.contentHash ||
        r.admission_ref !== b.pins.admissionRef ||
        (r.kind !== 'WORK' && r.kind !== 'PAY')
      )
        fail('HISTORICAL_ORDER_ACTUAL_PINS_CHANGED');
      const reference = text(r.original_ref),
        rawText = text(r.original_text),
        rawSha256 = text(r.original_sha256),
        table = r.kind === 'WORK' ? group.work : group.pay;
      if (
        Buffer.byteLength(rawText, 'utf8') > 65536 ||
        sha(rawText) !== rawSha256 ||
        canonicalSerialize(JSON.parse(rawText)) !== rawText
      )
        fail('EXACT_HISTORICAL_ORDER_BYTES_REQUIRED');
      const prior = table.get(reference);
      if (prior && (prior.rawText !== rawText || prior.rawSha256 !== rawSha256))
        fail('HISTORICAL_ORDER_REFERENCE_CHANGED');
      if (!prior) {
        totalBytes += Buffer.byteLength(rawText, 'utf8');
        if (totalBytes > 1048576)
          fail('BOUNDED_ACTUAL_HISTORY_ORDERS_REQUIRED');
        table.set(reference, Object.freeze({ reference, rawText, rawSha256 }));
      }
    }
  }
  const sources: IndustryInternalLogisticsReplaySources[] = [];
  for (const group of found.values()) {
    const projected = projectPostwarIndustryLogisticsReplaySources({
      baseline: input.baseline,
      context: configuration.context,
      firstday: group.firstday,
      runIds: [...group.runs],
      policyBytes: configuration.policyBytes,
      workOriginals: [...group.work.values()],
      expenseOriginals: [...group.pay.values()],
    });
    if (!projected.source) fail('ACTUAL_HISTORICAL_RUN_SOURCE_REQUIRED');
    sources.push(projected.source);
  }
  return Object.freeze({ industryLogisticsSources: Object.freeze(sources) });
}
