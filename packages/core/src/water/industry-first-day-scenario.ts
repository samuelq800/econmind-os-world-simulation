/** Explicitly adopted NEW scenario mathematics, not physical calibration or
 * World/source admission. No grant, real operation, payment or output issuer. */
import { kernelInvalid } from '../engine-kernels/common.js';
import type { Sha256Hex } from '../commands/command.js';
import { canonicalSerialize } from '../serialization/canonical.js';
import {
  deriveFixedConservativeOpeningWaterBasis,
  type CONSERVATIVE_OPENING_WATER_SOURCES,
} from './conservative-opening-basis.js';
import {
  addWater,
  assertWaterVolume,
  waterVolume,
  compareWater,
  minimumWater,
  ratioWater,
  scaleWater,
  subtractWater,
  sumWater,
  unscaleWater,
  volumeFromDecimal,
  waterFraction,
  zeroWater,
  type WaterFraction,
  type WaterVolume,
} from './exact-volume.js';

export const INDUSTRY_FIRST_DAY_WATER_SCENARIO_POLICY = Object.freeze({
  version: 'INDUSTRY_FIRST_DAY_NONPOTABLE_WATER_SCENARIO_20261101_V1',
  classification: 'USER_ADOPTED_SIMULATION_NOT_PHYSICAL_CALIBRATION',
  userAdoptionPath:
    'docs/reports/office-connection/INDUSTRY_UTILITIES_ADOPTION_20261101.json',
  userAdoptionSha256:
    'de6ad8ff58ff0180706b6bc6b4d548fd2d3404c4749cf71d91845474b19fddb0',
  userQuestionItemId:
    '["request_user_input_async","call_6882266ba4514c7393c098f6e53d9aa7",0]',
  userAnswer: '采用上述有限模拟方案',
  adoptionEvidenceKind:
    'TRANSCRIBED_DIRECT_USER_QUESTION_REPLY_NOT_TRANSPORT_SIGNATURE',
  priorProposalStatus:
    'SUSPENDED_WITHOUT_PHYSICAL_BASIS_THEN_EXPLICITLY_ADOPTED_AS_SCENARIO',
  physicalPumpingCalibration:
    'UNCALIBRATED_NOT_MEASURED_NOT_ENGINEERING_UPPER_BOUND',
  additionalElectricityPerAbstractedM3: '0.1',
  additionalElectricityUnit: 'MWh/m3',
  equivalentUnitDisclosure: '100 kWh per abstracted m3; not 0.1 kWh',
  rawPlantRecipeWaterMeteringMeaning: 'UNKNOWN_UNCHANGED',
  rawPlantRecipeElectricityIncludesWaterUtilities: 'UNKNOWN_UNCHANGED',
  scenarioRecipeWaterBoundary:
    'NONPOTABLE_PROCESS_WATER_DELIVERED_AT_TARGET_FACILITY',
  scenarioElectricityBoundary:
    'ORIGINAL_PLANT_RECIPE_LINE_PLUS_EXPLICIT_ADDITIONAL_WATER_MODEL_LINE',
  simulatedAvailability:
    'EXISTING_REGIONAL_TREATMENT_BPS_TIMES_QUALITY_BPS_OVER_100000000',
  scope: 'NEW_SCENARIO_FIRST_DAY_SAME_OPERATOR_EXISTING_REFINERY_ONLY',
  noWaterCommodityOrAssetOrPriceCreated: true,
});
export const INDUSTRY_WATER_SCENARIO_SOURCE_HASHES = Object.freeze({
  regions: '42ef418d90c3f448d390ad9e62971065eb29c3d96fdb4f3dde5fc33ae0cb2bdd',
  countries: '5d493e93dfab1425731191ba7491cce47949d176e4769b33fdca48d2d31dba89',
  facilities:
    '049e39330646048b95636d3a075fc1423ee62762999184a2326df161a198b485',
  recipes: '205259654c754d2ebe6e774f3a902f367455bdff4a51f7b0449e0d74334aeb7c',
  utilityPolicy:
    '27bbb6a7fddc97b83b74cc4f3ef13455a3238f1998d10c34016123ba19cf6872',
});
type Row = Readonly<Record<string, unknown>>;
type FixedWaterRaw = Readonly<
  Record<keyof typeof CONSERVATIVE_OPENING_WATER_SOURCES, string>
>;
type ExtraRaw = Readonly<
  Record<keyof typeof INDUSTRY_WATER_SCENARIO_SOURCE_HASHES, string>
>;
export interface ExactScenarioElectricity extends WaterFraction {
  readonly unit: 'MWh';
}
export interface IndustryWaterScenarioDemand {
  readonly demandRef: string;
  readonly sourceCountryId: string;
  readonly sourceRegionId: string;
  readonly sourceOperatorId: string;
  readonly facilityId: string;
  readonly runId: string;
  readonly requestedOutputAmount: string;
}
export interface IndustryWaterScenarioProtectedClaim {
  /** Additional current higher-priority raw reservations NOT already included
   * in the original household/agricultural baseline. Runtime must bind these
   * DATA rows to actual rights/period; this interface issues no such proof. */
  readonly claimRef: string;
  readonly sourceRegionId: string;
  readonly rawReserved: WaterVolume;
}
export interface IndustryWaterScenarioOperation {
  readonly operationRef: string;
  readonly predecessorRef: string;
  readonly untilTicks: string;
  /** This is inert clock DATA, not a registered Clock source or permission. */
  readonly observedAtTicks: string;
  readonly demands: readonly IndustryWaterScenarioDemand[];
  readonly additionalProtectedClaims: readonly IndustryWaterScenarioProtectedClaim[];
}
export interface IndustryWaterScenarioLine {
  readonly demand: Readonly<IndustryWaterScenarioDemand>;
  readonly recipeRef: string;
  readonly outputUnit: string;
  readonly originalRecipeWaterUnit: string;
  readonly originalRecipeElectricityUnit: string;
  readonly originalRecipeWaterPerOutput: string;
  readonly originalRecipeElectricityPerOutput: string;
  readonly requestedDelivered: WaterVolume;
  readonly abstracted: WaterVolume;
  readonly modelUnavailableAfterAbstraction: WaterVolume;
  readonly deliveredModelQuantity: WaterVolume;
  readonly unservedRequest: WaterVolume;
  readonly waterSupportedOutputUpperBound: WaterFraction & {
    readonly unit: string;
  };
  readonly additionalWaterElectricityRequirement: ExactScenarioElectricity;
  readonly originalPlantElectricityForSupportedOutput: ExactScenarioElectricity;
  readonly combinedScenarioElectricityRequirement: ExactScenarioElectricity;
}
export interface IndustryWaterScenarioRecord {
  readonly classification: 'SIMULATED_WATER_PERIOD_DATA_NOT_ACTUAL_DELIVERY_OR_AUTHORITY';
  readonly policyVersion: typeof INDUSTRY_FIRST_DAY_WATER_SCENARIO_POLICY.version;
  readonly operationRef: string;
  readonly operationFingerprint: string;
  readonly predecessorRef: string;
  readonly successorRef: string;
  readonly fromTicks: string;
  readonly untilTicks: string;
  readonly lines: readonly Readonly<IndustryWaterScenarioLine>[];
  readonly abstracted: WaterVolume;
  readonly modelUnavailableAfterAbstraction: WaterVolume;
  readonly deliveredModelQuantity: WaterVolume;
  readonly unservedRequest: WaterVolume;
  readonly additionalWaterElectricityRequirement: ExactScenarioElectricity;
  readonly additionalProtectedClaims: readonly IndustryWaterScenarioProtectedClaim[];
}
export interface IndustryWaterScenarioRun {
  readonly sourceCountryId: string;
  readonly sourceRegionId: string;
  readonly sourceOperatorId: string;
  readonly facilityId: string;
  readonly runId: string;
  readonly requestedOutputAmount: string;
  readonly requiredDelivered: WaterVolume;
  readonly deliveredModelQuantity: WaterVolume;
}
export interface IndustryWaterScenarioState {
  readonly classification: 'INDUSTRY_WATER_SCENARIO_DATA_STATE_NOT_RIGHT_OR_DELIVERY';
  readonly policyVersion: typeof INDUSTRY_FIRST_DAY_WATER_SCENARIO_POLICY.version;
  readonly modelRef: string;
  readonly baselineFingerprint: string;
  readonly cursorTicks: string;
  readonly predecessorRef: string;
  readonly records: readonly Readonly<IndustryWaterScenarioRecord>[];
  readonly runTargets: readonly Readonly<IndustryWaterScenarioRun>[];
  readonly abstracted: WaterVolume;
  readonly deliveredModelQuantity: WaterVolume;
  readonly modelUnavailableAfterAbstraction: WaterVolume;
  readonly additionalWaterElectricityRequirement: ExactScenarioElectricity;
}
interface Profile {
  readonly sourceCountryId: string;
  readonly sourceRegionId: string;
  readonly basinRef: string;
  readonly dailyRawLimit: WaterVolume;
  readonly treatmentBps: string;
  readonly qualityBps: string;
  readonly simulatedFraction: WaterFraction;
}
interface Target {
  readonly id: string;
  readonly sourceCountryId: string;
  readonly sourceRegionId: string;
  readonly sourceOperatorId: string;
  readonly recipeRef: string;
  readonly outputUnit: string;
  readonly water: string;
  readonly electricity: string;
}
interface Baseline {
  readonly profiles: readonly Profile[];
  readonly targets: readonly Target[];
  readonly basinDailyLimits: ReadonlyMap<string, WaterVolume>;
  readonly modelRef: string;
  readonly fingerprint: string;
}
const baselines = new WeakMap<object, Baseline>();
function fail(s: string): never {
  return kernelInvalid('Industry scenario water DATA: ' + s);
}
function text(v: unknown): string {
  if (typeof v !== 'string' || !v || v.trim() !== v)
    fail('exact original text required');
  return v;
}
function object(v: unknown): Row {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    fail('original object required');
  return v as Row;
}
function rows(v: unknown): readonly Row[] {
  if (!Array.isArray(v)) fail('original rows required');
  return v.map(object);
}
function ref(v: string): string {
  if (typeof v !== 'string' || !/^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/u.test(v))
    fail('bounded explicit reference required');
  return v;
}
function uint(v: string): bigint {
  if (typeof v !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(v) || v.length > 20)
    fail('bounded canonical ticks required');
  return BigInt(v);
}
function fraction(v: unknown): WaterFraction {
  const s = text(v);
  if (!/^(0|[1-9][0-9]*)(\.[0-9]+)?$/u.test(s) || s.length > 120)
    fail('bounded exact decimal required');
  const [whole, part = ''] = s.split('.');
  return waterFraction(
    BigInt(whole + part).toString(),
    (10n ** BigInt(part.length)).toString(),
  );
}
function electricity(n: string, d: string): ExactScenarioElectricity {
  return Object.freeze({ ...waterFraction(n, d), unit: 'MWh' as const });
}
const ZERO_ENERGY = electricity('0', '1');
function addEnergy(a: ExactScenarioElectricity, b: ExactScenarioElectricity) {
  return electricity(
    (
      BigInt(a.numerator) * BigInt(b.denominator) +
      BigInt(b.numerator) * BigInt(a.denominator)
    ).toString(),
    (BigInt(a.denominator) * BigInt(b.denominator)).toString(),
  );
}
function energyFromWater(v: WaterVolume): ExactScenarioElectricity {
  return electricity(v.numerator, (BigInt(v.denominator) * 10n).toString());
}
function parse(raw: string): unknown {
  const p = JSON.parse as (
    s: string,
    r: (k: string, v: unknown, c: { source?: string }) => unknown,
  ) => unknown;
  return p(raw, (_k, v, c) => (typeof v === 'number' ? c.source : v));
}
function hash(v: unknown, sha: Sha256Hex) {
  return 'sha256:' + sha(canonicalSerialize(v));
}
function identity(state: Readonly<IndustryWaterScenarioState>): Baseline {
  const b = baselines.get(state);
  if (!b) fail('genuine DATA state required; copies do not restore state');
  return b;
}
function profile(region: Row, country: Row) {
  const natural = object(region.natural),
    access = fraction(region.settlementAccess),
    drought = fraction(natural.droughtExposure),
    flood = fraction(natural.floodExposure),
    storm = fraction(natural.stormExposure);
  for (const f of [access, drought, flood, storm])
    if (BigInt(f.numerator) > BigInt(f.denominator))
      fail('source profile fraction outside unit range');
  const hazard = [drought, flood, storm].reduce((a, b) =>
    BigInt(a.numerator) * BigInt(b.denominator) >=
    BigInt(b.numerator) * BigInt(a.denominator)
      ? a
      : b,
  );
  const buffer = fraction(country.stockBufferDays),
    capped =
      BigInt(buffer.numerator) > 90n * BigInt(buffer.denominator)
        ? waterFraction('90', '1')
        : buffer;
  const weighted = (f: WaterFraction, n: bigint) =>
    (BigInt(f.numerator) * n) / BigInt(f.denominator);
  const clamp = (x: bigint, lo: bigint, hi: bigint) =>
    x < lo ? lo : x > hi ? hi : x;
  const t = clamp(
      2500n +
        weighted(access, 3500n) +
        weighted(capped, 1000n) / 90n -
        weighted(hazard, 1500n),
      1500n,
      7500n,
    ),
    q = clamp(
      6000n +
        weighted(access, 2000n) -
        weighted(drought, 1500n) -
        weighted(flood, 1500n),
      3500n,
      9000n,
    );
  return {
    treatmentBps: t.toString(),
    qualityBps: q.toString(),
    simulatedFraction: waterFraction((t * q).toString(), '100000000'),
  };
}
/** Raw identities and the shared adoption transcript are independently checked.
 * This creates only an isolated mathematical scenario state, never admission. */
export function createIndustryFirstDayWaterScenario(
  input: {
    readonly modelRef: string;
    readonly adoptionRecordBytes: string;
    readonly raw: FixedWaterRaw & ExtraRaw;
    readonly year: string;
    readonly month: string;
  },
  sha256Hex: Sha256Hex,
): Readonly<IndustryWaterScenarioState> {
  ref(input.modelRef);
  if (
    sha256Hex(input.adoptionRecordBytes) !==
    INDUSTRY_FIRST_DAY_WATER_SCENARIO_POLICY.userAdoptionSha256
  )
    fail('shared exact adoption transcription required');
  const transcript = object(JSON.parse(input.adoptionRecordBytes));
  if (
    transcript.answer !== INDUSTRY_FIRST_DAY_WATER_SCENARIO_POLICY.userAnswer ||
    object(transcript.source).questionItemId !==
      INDUSTRY_FIRST_DAY_WATER_SCENARIO_POLICY.userQuestionItemId
  )
    fail('adoption answer or provenance drift');
  const parsed: Record<string, unknown> = {};
  for (const key of Object.keys(
    INDUSTRY_WATER_SCENARIO_SOURCE_HASHES,
  ) as (keyof ExtraRaw)[]) {
    const raw = input.raw[key];
    if (
      typeof raw !== 'string' ||
      raw.length > 2500000 ||
      sha256Hex(raw) !== INDUSTRY_WATER_SCENARIO_SOURCE_HASHES[key]
    )
      fail('fixed model source drift: ' + key);
    parsed[key] = parse(raw);
  }
  const basis = deriveFixedConservativeOpeningWaterBasis(input, sha256Hex),
    regionRows = rows(parsed.regions),
    countries = rows(parsed.countries),
    facilities = rows(parsed.facilities),
    recipes = rows(parsed.recipes);
  const profiles = basis.regions.map((r) => {
    const rs = regionRows.filter(
        (x) => x.id === r.sourceRegionId && x.countryId === r.sourceCountryId,
      ),
      cs = countries.filter((x) => x.id === r.sourceCountryId),
      limits = basis.basins
        .flatMap((x) => x.limits)
        .filter((x) => x.sourceRegionId === r.sourceRegionId);
    if (rs.length !== 1 || cs.length !== 1 || limits.length !== 1)
      fail('unique source profile and basin limit required');
    return Object.freeze({
      sourceCountryId: r.sourceCountryId,
      sourceRegionId: r.sourceRegionId,
      basinRef: r.basinRef,
      dailyRawLimit: limits[0]!.limit.volume,
      ...profile(rs[0]!, cs[0]!),
    });
  });
  const targets = facilities
    .filter(
      (f) =>
        f.recipeId === 'SCENARIO-RECIPE-REFINED_FUEL' &&
        f.constructionStatusProposal === 'OPENING_EXISTING_ASSET',
    )
    .map((f) => {
      const recipe = recipes.filter((r) => r.id === f.recipeId),
        rs = profiles.filter(
          (r) =>
            r.sourceRegionId === f.regionId &&
            r.sourceCountryId === f.countryId,
        );
      if (recipe.length !== 1 || rs.length !== 1)
        fail('fixed existing refinery and region required');
      const r = recipe[0]!;
      if (
        text(r.waterM3PerUnit) !== '0.1' ||
        text(r.electricityMWhPerUnit) !== '0.008'
      )
        fail('unchanged fixed refinery coefficients required');
      return Object.freeze({
        id: text(f.id),
        sourceCountryId: text(f.countryId),
        sourceRegionId: text(f.regionId),
        sourceOperatorId: text(f.operatorId),
        recipeRef: text(r.id),
        outputUnit: text(r.outputUnit),
        water: text(r.waterM3PerUnit),
        electricity: text(r.electricityMWhPerUnit),
      });
    });
  const fingerprint = hash(
    {
      policy: INDUSTRY_FIRST_DAY_WATER_SCENARIO_POLICY,
      period: basis.period,
      waterSourceHashes: basis.sourceHashes,
      modelSourceHashes: INDUSTRY_WATER_SCENARIO_SOURCE_HASHES,
      profiles,
      targets,
    },
    sha256Hex,
  );
  const baseline: Baseline = Object.freeze({
    profiles: Object.freeze(profiles),
    targets: Object.freeze(targets),
    basinDailyLimits: new Map(
      basis.basins.map((b) => [b.basinRef, b.assigned]),
    ),
    modelRef: input.modelRef,
    fingerprint,
  });
  const state: Readonly<IndustryWaterScenarioState> = Object.freeze({
    classification: 'INDUSTRY_WATER_SCENARIO_DATA_STATE_NOT_RIGHT_OR_DELIVERY',
    policyVersion: INDUSTRY_FIRST_DAY_WATER_SCENARIO_POLICY.version,
    modelRef: input.modelRef,
    baselineFingerprint: fingerprint,
    cursorTicks: '0',
    predecessorRef: hash([input.modelRef, fingerprint, '0'], sha256Hex),
    records: Object.freeze([]),
    runTargets: Object.freeze([]),
    abstracted: zeroWater(),
    deliveredModelQuantity: zeroWater(),
    modelUnavailableAfterAbstraction: zeroWater(),
    additionalWaterElectricityRequirement: ZERO_ENERGY,
  });
  baselines.set(state, baseline);
  return state;
}
export function readIndustryFirstDayWaterScenarioProfiles(
  state: Readonly<IndustryWaterScenarioState>,
) {
  const b = identity(state);
  return Object.freeze({
    classification:
      'PROFILE_AND_LIMIT_DATA_NOT_ACTUAL_NETWORK_OR_WATER_QUALITY' as const,
    profiles: b.profiles,
    targets: b.targets,
    baselineFingerprint: b.fingerprint,
  });
}

/** Each operation advances one complete shared interval. All concurrent same-
 * priority demands must be in the batch; no caller can reuse its time capacity.
 * A runtime still needs real grants, source/currentness/Clock, WORK and energy. */
export function calculateIndustryFirstDayWaterScenarioPeriod(
  input: {
    readonly state: Readonly<IndustryWaterScenarioState>;
    readonly operation: IndustryWaterScenarioOperation;
  },
  sha256Hex: Sha256Hex,
): Readonly<{
  state: Readonly<IndustryWaterScenarioState>;
  record: Readonly<IndustryWaterScenarioRecord>;
  replayed: boolean;
}> {
  const state = input.state,
    b = identity(state),
    op = input.operation;
  ref(op.operationRef);
  const until = uint(op.untilTicks),
    observed = uint(op.observedAtTicks);
  if (until > 86400000n || observed > 86400000n || observed < until)
    fail('actual elapsed first-day interval DATA required');
  if (
    !Array.isArray(op.demands) ||
    op.demands.length < 1 ||
    op.demands.length > 512
  )
    fail('bounded nonempty complete demand batch required');
  const demands = op.demands
    .map((d) => {
      ref(d.demandRef);
      ref(d.runId);
      ref(d.facilityId);
      const output = fraction(d.requestedOutputAmount);
      if (output.numerator === '0') fail('positive requested output required');
      return Object.freeze({ ...d });
    })
    .sort((a, b) =>
      a.demandRef < b.demandRef ? -1 : a.demandRef > b.demandRef ? 1 : 0,
    );
  if (
    new Set(demands.map((d) => d.demandRef)).size !== demands.length ||
    new Set(demands.map((d) => [d.sourceCountryId, d.runId].join('\0')))
      .size !== demands.length
  )
    fail('duplicate demand/run in one interval');
  if (
    !Array.isArray(op.additionalProtectedClaims) ||
    op.additionalProtectedClaims.length > 512
  )
    fail('explicit bounded additional protected claims DATA required');
  const protectedClaims = op.additionalProtectedClaims
    .map((c) => {
      ref(c.claimRef);
      assertWaterVolume(c.rawReserved);
      if (!b.profiles.some((p) => p.sourceRegionId === c.sourceRegionId))
        fail('known protected-claim source region required');
      return Object.freeze({
        ...c,
        rawReserved: waterVolume(
          c.rawReserved.numerator,
          c.rawReserved.denominator,
        ),
      });
    })
    .sort((a, b) =>
      a.claimRef < b.claimRef ? -1 : a.claimRef > b.claimRef ? 1 : 0,
    );
  if (
    new Set(protectedClaims.map((c) => c.claimRef)).size !==
    protectedClaims.length
  )
    fail('duplicate protected claim');
  const operationFingerprint = hash(
    {
      operationRef: op.operationRef,
      predecessorRef: op.predecessorRef,
      untilTicks: op.untilTicks,
      demands,
      additionalProtectedClaims: protectedClaims,
    },
    sha256Hex,
  );
  const prior = state.records.find((r) => r.operationRef === op.operationRef);
  if (prior) {
    if (prior.operationFingerprint !== operationFingerprint)
      fail('operation idempotency conflict');
    return Object.freeze({ state, record: prior, replayed: true });
  }
  if (
    state.records.length >= 512 ||
    op.predecessorRef !== state.predecessorRef ||
    until <= uint(state.cursorTicks)
  )
    fail('unconsumed ordered first-day predecessor required');
  const duration = waterFraction(
      (until - uint(state.cursorTicks)).toString(),
      '86400000',
    ),
    lines: Readonly<IndustryWaterScenarioLine>[] = [];
  const positiveDifference = (a: WaterVolume, b: WaterVolume) =>
    compareWater(a, b) > 0 ? subtractWater(a, b) : zeroWater();
  const plans: {
    p: Profile;
    requested: {
      d: Readonly<IndustryWaterScenarioDemand>;
      t: Target;
      need: WaterVolume;
    }[];
    totalRequested: WaterVolume;
    extracted: WaterVolume;
  }[] = [];
  for (const p of b.profiles) {
    const selected = demands.filter(
      (d) => d.sourceRegionId === p.sourceRegionId,
    );
    if (!selected.length) continue;
    const localProtected = sumWater(
      protectedClaims
        .filter((c) => c.sourceRegionId === p.sourceRegionId)
        .map((c) => c.rawReserved),
    );
    const bound = positiveDifference(
      scaleWater(p.dailyRawLimit, duration),
      localProtected,
    );
    const requested = selected.map((d) => {
      const ts = b.targets.filter(
        (t) =>
          t.id === d.facilityId &&
          t.sourceRegionId === d.sourceRegionId &&
          t.sourceCountryId === d.sourceCountryId &&
          t.sourceOperatorId === d.sourceOperatorId,
      );
      if (ts.length !== 1 || d.sourceCountryId !== p.sourceCountryId)
        fail('actual fixed refinery/operator/region DATA required');
      const full = scaleWater(
        volumeFromDecimal(ts[0]!.water),
        fraction(d.requestedOutputAmount),
      );
      const existing = state.runTargets.filter(
        (r) => r.sourceCountryId === d.sourceCountryId && r.runId === d.runId,
      );
      if (existing.length > 1) fail('unique scoped run state required');
      const priorRun = existing[0];
      if (
        priorRun &&
        (priorRun.facilityId !== d.facilityId ||
          priorRun.sourceRegionId !== d.sourceRegionId ||
          priorRun.sourceOperatorId !== d.sourceOperatorId ||
          priorRun.requestedOutputAmount !== d.requestedOutputAmount ||
          compareWater(priorRun.requiredDelivered, full) !== 0)
      )
        fail('same run original demand cannot change');
      const need = priorRun
        ? subtractWater(full, priorRun.deliveredModelQuantity)
        : full;
      if (need.numerator === '0')
        fail('run water requirement already satisfied; no duplicate grant');
      return { d, t: ts[0]!, need };
    });
    const totalRequested = sumWater(requested.map((x) => x.need)),
      extracted = minimumWater(
        bound,
        unscaleWater(totalRequested, p.simulatedFraction),
      );
    plans.push({ p, requested, totalRequested, extracted });
  }
  for (const plan of plans) {
    const { p, requested, totalRequested } = plan,
      basinPlans = plans.filter((x) => x.p.basinRef === p.basinRef),
      basinProposed = sumWater(basinPlans.map((x) => x.extracted)),
      basinRegions = new Set(
        b.profiles
          .filter((x) => x.basinRef === p.basinRef)
          .map((x) => x.sourceRegionId),
      ),
      basinProtected = sumWater(
        protectedClaims
          .filter((c) => basinRegions.has(c.sourceRegionId))
          .map((c) => c.rawReserved),
      ),
      basinDaily = b.basinDailyLimits.get(p.basinRef);
    if (!basinDaily) fail('one fixed basin envelope required');
    const basinAllowed = minimumWater(
      basinProposed,
      positiveDifference(scaleWater(basinDaily, duration), basinProtected),
    );
    const extracted =
      basinProposed.numerator === '0'
        ? zeroWater()
        : scaleWater(plan.extracted, ratioWater(basinAllowed, basinProposed));
    for (const x of requested) {
      const raw = scaleWater(extracted, ratioWater(x.need, totalRequested)),
        delivered = scaleWater(raw, p.simulatedFraction),
        unavailable = subtractWater(raw, delivered),
        supported = ratioWater(delivered, volumeFromDecimal(x.t.water)),
        plantRate = fraction(x.t.electricity),
        plant = electricity(
          (
            BigInt(supported.numerator) * BigInt(plantRate.numerator)
          ).toString(),
          (
            BigInt(supported.denominator) * BigInt(plantRate.denominator)
          ).toString(),
        ),
        additional = energyFromWater(raw);
      lines.push(
        Object.freeze({
          demand: x.d,
          recipeRef: x.t.recipeRef,
          outputUnit: x.t.outputUnit,
          originalRecipeWaterUnit: 'm3/' + x.t.outputUnit,
          originalRecipeElectricityUnit: 'MWh/' + x.t.outputUnit,
          originalRecipeWaterPerOutput: x.t.water,
          originalRecipeElectricityPerOutput: x.t.electricity,
          requestedDelivered: x.need,
          abstracted: raw,
          modelUnavailableAfterAbstraction: unavailable,
          deliveredModelQuantity: delivered,
          unservedRequest: subtractWater(x.need, delivered),
          waterSupportedOutputUpperBound: Object.freeze({
            ...supported,
            unit: x.t.outputUnit,
          }),
          additionalWaterElectricityRequirement: additional,
          originalPlantElectricityForSupportedOutput: plant,
          combinedScenarioElectricityRequirement: addEnergy(plant, additional),
        }),
      );
    }
  }
  if (lines.length !== demands.length)
    fail('unknown/unserved scope cannot disappear from complete batch');
  for (const [basin, limit] of b.basinDailyLimits) {
    const ids = new Set(
        b.profiles
          .filter((p) => p.basinRef === basin)
          .map((p) => p.sourceRegionId),
      ),
      total = sumWater(
        lines
          .filter((l) => ids.has(l.demand.sourceRegionId))
          .map((l) => l.abstracted),
      );
    const reserved = sumWater(
      protectedClaims
        .filter((c) => ids.has(c.sourceRegionId))
        .map((c) => c.rawReserved),
    );
    if (
      compareWater(
        total,
        positiveDifference(scaleWater(limit, duration), reserved),
      ) > 0
    )
      fail('one shared basin interval budget required');
  }
  const abstracted = sumWater(lines.map((l) => l.abstracted)),
    delivered = sumWater(lines.map((l) => l.deliveredModelQuantity)),
    unavailable = sumWater(
      lines.map((l) => l.modelUnavailableAfterAbstraction),
    ),
    additional = lines.reduce(
      (e, l) => addEnergy(e, l.additionalWaterElectricityRequirement),
      ZERO_ENERGY,
    );
  if (compareWater(abstracted, addWater(delivered, unavailable)) !== 0)
    fail('withdrawal/rejected/delivered conservation');
  const successorRef = hash(
    [state.predecessorRef, operationFingerprint, lines],
    sha256Hex,
  );
  const record: Readonly<IndustryWaterScenarioRecord> = Object.freeze({
    classification:
      'SIMULATED_WATER_PERIOD_DATA_NOT_ACTUAL_DELIVERY_OR_AUTHORITY',
    policyVersion: INDUSTRY_FIRST_DAY_WATER_SCENARIO_POLICY.version,
    operationRef: op.operationRef,
    operationFingerprint,
    predecessorRef: state.predecessorRef,
    successorRef,
    fromTicks: state.cursorTicks,
    untilTicks: op.untilTicks,
    lines: Object.freeze(lines),
    abstracted,
    deliveredModelQuantity: delivered,
    modelUnavailableAfterAbstraction: unavailable,
    unservedRequest: sumWater(lines.map((l) => l.unservedRequest)),
    additionalProtectedClaims: Object.freeze(protectedClaims),
    additionalWaterElectricityRequirement: additional,
  });
  const runTargets = [...state.runTargets];
  for (const l of lines) {
    const d = l.demand,
      index = runTargets.findIndex(
        (r) => r.sourceCountryId === d.sourceCountryId && r.runId === d.runId,
      ),
      old = index < 0 ? undefined : runTargets[index];
    const nextRun: Readonly<IndustryWaterScenarioRun> = Object.freeze({
      sourceCountryId: d.sourceCountryId,
      sourceRegionId: d.sourceRegionId,
      sourceOperatorId: d.sourceOperatorId,
      facilityId: d.facilityId,
      runId: d.runId,
      requestedOutputAmount: d.requestedOutputAmount,
      requiredDelivered: scaleWater(
        volumeFromDecimal(l.originalRecipeWaterPerOutput),
        fraction(d.requestedOutputAmount),
      ),
      deliveredModelQuantity: addWater(
        old?.deliveredModelQuantity ?? zeroWater(),
        l.deliveredModelQuantity,
      ),
    });
    if (
      compareWater(nextRun.deliveredModelQuantity, nextRun.requiredDelivered) >
      0
    )
      fail('no duplicate scoped run delivery');
    if (index < 0) runTargets.push(nextRun);
    else runTargets[index] = nextRun;
  }
  const next: Readonly<IndustryWaterScenarioState> = Object.freeze({
    ...state,
    runTargets: Object.freeze(runTargets),
    cursorTicks: op.untilTicks,
    predecessorRef: successorRef,
    records: Object.freeze([...state.records, record]),
    abstracted: addWater(state.abstracted, abstracted),
    deliveredModelQuantity: addWater(state.deliveredModelQuantity, delivered),
    modelUnavailableAfterAbstraction: addWater(
      state.modelUnavailableAfterAbstraction,
      unavailable,
    ),
    additionalWaterElectricityRequirement: addEnergy(
      state.additionalWaterElectricityRequirement,
      additional,
    ),
  });
  baselines.set(next, b);
  return Object.freeze({ state: next, record, replayed: false });
}
/** Replay checks every water/energy line, not a claimed status or selected field. */
export function replayIndustryFirstDayWaterScenarioPeriod(
  input: {
    readonly state: Readonly<IndustryWaterScenarioState>;
    readonly operation: IndustryWaterScenarioOperation;
    readonly record: Readonly<IndustryWaterScenarioRecord>;
  },
  sha256Hex: Sha256Hex,
) {
  const result = calculateIndustryFirstDayWaterScenarioPeriod(input, sha256Hex);
  if (canonicalSerialize(result.record) !== canonicalSerialize(input.record))
    fail('complete exact scenario record differs');
  return result;
}
