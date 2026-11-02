/** Browser-safe DATA wire. A validated shape is never source/actor authority. */
export const POSTWAR_SOCIAL_MIXED_CURRENT_NATURE =
  'ADMITTED_CURRENT_SOCIAL_MIXED_FINANCIAL_PREFIX' as const;
export const POSTWAR_SOCIAL_MIXED_COVERAGE_SCHEMA =
  'postwar-social-current-prefix-coverage-v3' as const;
export const POSTWAR_SOCIAL_MIXED_REDUCER =
  'POSTWAR_SOCIAL_FINANCE_FX_COMPLETE_PREFIX_V3' as const;
export interface PostwarSocialMixedCoverage {
  readonly schemaVersion: typeof POSTWAR_SOCIAL_MIXED_COVERAGE_SCHEMA;
  readonly reducerVersion: typeof POSTWAR_SOCIAL_MIXED_REDUCER;
  readonly countryId: string;
  readonly coverageRef: string;
  readonly globalWorldVersion: string;
  readonly globalEventSequence: string;
  readonly originWorldVersion: string;
  readonly originEventSequence: string;
  readonly prefixFingerprint: string;
  readonly knownEffectsFingerprint: string;
  readonly coveredThroughEventId: string;
  readonly coveredThroughEventFingerprint: string;
  readonly financialPostingCount: string;
  readonly financialBatchCount: string;
  readonly financialPostingsFingerprint: string;
  readonly employmentStateHash: string;
  readonly materializationHash: string;
  readonly stateOrigin: 'COMMITTED_MATERIALIZATION' | 'ADMITTED_OPENING_SOURCE';
}
export interface PostwarSocialMixedStateBinding {
  readonly sourceCommandId: string;
  readonly commandFingerprint: string;
  readonly sourceEventId: string;
  readonly eventFingerprint: string;
  readonly materializationKey: string;
  readonly materializationHash: string;
  readonly canonicalMaterializationSha256: string;
  readonly sourceStateWorldVersion: string;
  readonly sourceEventSequence: string;
}
function invalid(reason: string): never {
  throw Error('POSTWAR_SOCIAL_MIXED_WIRE:' + reason);
}
const object = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : invalid('OBJECT_REQUIRED');
const id = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= 256 && v.trim() === v;
const uint = (v: unknown): v is string =>
  typeof v === 'string' && /^(0|[1-9]\d*)$/u.test(v) && v.length <= 20;
const fp = (v: unknown): v is string =>
  typeof v === 'string' && /^sha256:[a-f0-9]{64}$/u.test(v);
function exact(v: Record<string, unknown>, keys: readonly string[]) {
  if (
    Object.keys(v).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(v, k))
  )
    invalid('EXACT_FIELDS_REQUIRED');
}
export function parsePostwarSocialMixedCoverage(
  value: unknown,
  scope: { countryId: string; worldVersion: string; eventSequence: string },
): PostwarSocialMixedCoverage {
  const c = object(value);
  exact(c, [
    'schemaVersion',
    'reducerVersion',
    'countryId',
    'coverageRef',
    'globalWorldVersion',
    'globalEventSequence',
    'originWorldVersion',
    'originEventSequence',
    'prefixFingerprint',
    'knownEffectsFingerprint',
    'coveredThroughEventId',
    'coveredThroughEventFingerprint',
    'financialPostingCount',
    'financialBatchCount',
    'financialPostingsFingerprint',
    'employmentStateHash',
    'materializationHash',
    'stateOrigin',
  ]);
  if (
    c.schemaVersion !== POSTWAR_SOCIAL_MIXED_COVERAGE_SCHEMA ||
    c.reducerVersion !== POSTWAR_SOCIAL_MIXED_REDUCER ||
    c.countryId !== scope.countryId ||
    !id(c.countryId) ||
    !id(c.coverageRef) ||
    ![
      c.globalWorldVersion,
      c.globalEventSequence,
      c.originWorldVersion,
      c.originEventSequence,
      c.financialPostingCount,
      c.financialBatchCount,
    ].every(uint) ||
    c.globalWorldVersion !== scope.worldVersion ||
    c.globalEventSequence !== scope.eventSequence ||
    ![
      c.prefixFingerprint,
      c.knownEffectsFingerprint,
      c.coveredThroughEventFingerprint,
      c.financialPostingsFingerprint,
      c.employmentStateHash,
      c.materializationHash,
    ].every(fp) ||
    !id(c.coveredThroughEventId)
  )
    invalid('COMPLETE_MIXED_COVERAGE_REQUIRED');
  const h = BigInt(String(c.globalWorldVersion)),
    seq = BigInt(String(c.globalEventSequence)),
    origin = BigInt(String(c.originWorldVersion)),
    os = BigInt(String(c.originEventSequence)),
    legs = BigInt(String(c.financialPostingCount)),
    batches = BigInt(String(c.financialBatchCount));
  if (
    h < 1n ||
    seq < h ||
    origin > h ||
    os > seq ||
    (origin === 0n) !== (os === 0n) ||
    batches > legs ||
    (batches === 0n) !== (legs === 0n) ||
    c.stateOrigin !==
      (origin === 0n ? 'ADMITTED_OPENING_SOURCE' : 'COMMITTED_MATERIALIZATION')
  )
    invalid('CURRENT_AND_ORIGIN_MUST_BE_DISTINCT');
  return Object.freeze({ ...c }) as unknown as PostwarSocialMixedCoverage;
}
export function parsePostwarSocialMixedStateBinding(
  value: unknown,
  coverage: PostwarSocialMixedCoverage,
): PostwarSocialMixedStateBinding | undefined {
  if (coverage.originWorldVersion === '0') {
    if (value !== undefined) invalid('OPENING_MUST_NOT_CLAIM_COMMITTED_ORIGIN');
    return undefined;
  }
  const b = object(value);
  exact(b, [
    'sourceCommandId',
    'commandFingerprint',
    'sourceEventId',
    'eventFingerprint',
    'materializationKey',
    'materializationHash',
    'canonicalMaterializationSha256',
    'sourceStateWorldVersion',
    'sourceEventSequence',
  ]);
  if (
    ![b.sourceCommandId, b.sourceEventId, b.materializationKey].every(id) ||
    ![b.commandFingerprint, b.eventFingerprint, b.materializationHash].every(
      fp,
    ) ||
    typeof b.canonicalMaterializationSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(b.canonicalMaterializationSha256) ||
    b.materializationHash !== coverage.materializationHash ||
    b.sourceStateWorldVersion !== coverage.originWorldVersion ||
    b.sourceEventSequence !== coverage.originEventSequence
  )
    invalid('EXACT_COMMITTED_ORIGIN_REQUIRED');
  return Object.freeze({ ...b }) as unknown as PostwarSocialMixedStateBinding;
}
