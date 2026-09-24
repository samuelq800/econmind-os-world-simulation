/** V29.3 preparation: inert parameter provenance, never economic authority. */

export type V29ParameterAvailability = 'AVAILABLE' | 'MISSING';

export interface V29ParameterTimeRange {
  readonly startRef: string;
  readonly endRef: string;
}

export interface V29ParameterSourceInput {
  readonly sourceId: string;
  readonly status: V29ParameterAvailability;
  readonly sourceHash: string | null;
  readonly locator: string | null;
  readonly timeRange: V29ParameterTimeRange | null;
  readonly missingReason: string | null;
}

export interface V29ParameterTransformation {
  readonly transformationId: string;
  /** Inert formula text for review; this tool never evaluates it. */
  readonly formula: string;
}

export interface V29NumericParameterInput {
  readonly parameterId: string;
  readonly status: V29ParameterAvailability;
  readonly value: unknown;
  readonly unit: string;
  readonly sourceIds: readonly string[];
  readonly transformation: V29ParameterTransformation | null;
  readonly economicEventTypes: readonly string[];
  readonly missingReason: string | null;
}

export interface V29ParameterProvenanceInput {
  readonly sources: readonly V29ParameterSourceInput[];
  readonly parameters: readonly V29NumericParameterInput[];
}

export type V29ParameterProvenanceIssueCode =
  'SOURCE_MISSING' | 'PARAMETER_MISSING' | 'PARAMETER_SOURCE_UNAVAILABLE';

export interface V29ParameterProvenanceIssue {
  readonly code: V29ParameterProvenanceIssueCode;
  readonly sourceId: string | null;
  readonly parameterId: string | null;
  readonly missingFields: readonly string[];
  readonly message: string;
}

export interface V29SourceParameterEventChain {
  readonly chainRef: string;
  readonly sourceId: string;
  readonly sourceHash: string;
  readonly sourceLocator: string;
  readonly timeRange: V29ParameterTimeRange;
  readonly parameterId: string;
  readonly parameterValue: string;
  readonly parameterUnit: string;
  readonly transformationId: string;
  readonly formula: string;
  readonly economicEventType: string;
  readonly sourceBytesVerified: false;
  readonly causalEffectVerified: false;
}

export interface V29ParameterProvenanceResult {
  readonly status:
    'PREPARATION_ONLY_TRACEABLE' | 'PREPARATION_ONLY_UNAVAILABLE';
  readonly formallyVerified: false;
  readonly eventAuthorized: false;
  readonly parameterApplicationAuthorized: false;
  readonly counts: {
    readonly sources: number;
    readonly parameters: number;
    readonly chains: number;
    readonly issues: number;
  };
  readonly chains: readonly V29SourceParameterEventChain[];
  readonly issues: readonly V29ParameterProvenanceIssue[];
}

type UnknownRecord = Readonly<Record<string, unknown>>;

const ID = /^[A-Z][A-Z0-9]*(?:[_.:-][A-Z0-9]+)*$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const DECIMAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u;
const UNIT = /^[A-Za-z][A-Za-z0-9_./%-]*$/u;

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(message: string): never {
  throw new Error(`V29.3 parameter provenance invalid: ${message}`);
}

function record(value: unknown, label: string): UnknownRecord {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    fail(`${label} must be a plain record`);
  }
  return value as UnknownRecord;
}

function exactKeys(
  value: UnknownRecord,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort(compare);
  const required = [...expected].sort(compare);
  if (
    actual.length !== required.length ||
    actual.some((key, index) => key !== required[index])
  ) {
    fail(`${label} contains missing or unknown fields`);
  }
}

function list(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  return value;
}

function text(value: unknown, label: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    fail(`${label} must be a non-empty canonical string`);
  }
  return value;
}

function nullableText(value: unknown, label: string): string | null {
  return value === null ? null : text(value, label);
}

function id(value: unknown, label: string): string {
  const result = text(value, label);
  if (!ID.test(result)) fail(`${label} must be a stable identifier`);
  return result;
}

function choice<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    fail(`${label} is unsupported`);
  }
  return value as T;
}

function uniqueIds(value: unknown, label: string): readonly string[] {
  const values = list(value, label)
    .map((item) => id(item, label))
    .sort(compare);
  if (new Set(values).size !== values.length) {
    fail(`${label} must contain unique identifiers`);
  }
  return Object.freeze(values);
}

function canonicalFiniteDecimal(value: unknown, label: string): string {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    fail(`${label} must be finite`);
  }
  if (typeof value !== 'string' || !DECIMAL.test(value) || value === '-0') {
    fail(`${label} must be a canonical finite decimal string`);
  }
  if (!Number.isFinite(Number(value))) fail(`${label} must be finite`);
  return value;
}

function parseTimeRange(value: unknown): V29ParameterTimeRange {
  const input = record(value, 'source timeRange');
  exactKeys(input, ['startRef', 'endRef'], 'source timeRange');
  return Object.freeze({
    startRef: text(input.startRef, 'source timeRange.startRef'),
    endRef: text(input.endRef, 'source timeRange.endRef'),
  });
}

function parseSource(value: unknown): V29ParameterSourceInput {
  const input = record(value, 'parameter source');
  exactKeys(
    input,
    [
      'sourceId',
      'status',
      'sourceHash',
      'locator',
      'timeRange',
      'missingReason',
    ],
    'parameter source',
  );
  const sourceId = id(input.sourceId, 'sourceId');
  const status = choice(
    input.status,
    ['AVAILABLE', 'MISSING'] as const,
    'source status',
  );
  const sourceHash = nullableText(input.sourceHash, 'sourceHash');
  const locator = nullableText(input.locator, 'source locator');
  const timeRange =
    input.timeRange === null ? null : parseTimeRange(input.timeRange);
  const missingReason = nullableText(
    input.missingReason,
    'source missingReason',
  );
  if (status === 'AVAILABLE') {
    if (
      sourceHash === null ||
      !SHA256.test(sourceHash) ||
      locator === null ||
      timeRange === null ||
      missingReason !== null
    ) {
      fail(
        `available source ${sourceId} requires SHA-256, locator, time range and no missing reason`,
      );
    }
  } else if (
    sourceHash !== null ||
    locator !== null ||
    timeRange !== null ||
    missingReason === null
  ) {
    fail(`missing source ${sourceId} requires only an explicit missing reason`);
  }
  return Object.freeze({
    sourceId,
    status,
    sourceHash,
    locator,
    timeRange,
    missingReason,
  });
}

function parseTransformation(value: unknown): V29ParameterTransformation {
  const input = record(value, 'parameter transformation');
  exactKeys(input, ['transformationId', 'formula'], 'parameter transformation');
  return Object.freeze({
    transformationId: id(input.transformationId, 'transformationId'),
    formula: text(input.formula, 'formula'),
  });
}

interface ParsedParameter extends Omit<V29NumericParameterInput, 'value'> {
  readonly value: string | null;
}

function parseParameter(value: unknown): ParsedParameter {
  const input = record(value, 'numeric parameter');
  exactKeys(
    input,
    [
      'parameterId',
      'status',
      'value',
      'unit',
      'sourceIds',
      'transformation',
      'economicEventTypes',
      'missingReason',
    ],
    'numeric parameter',
  );
  const parameterId = id(input.parameterId, 'parameterId');
  const status = choice(
    input.status,
    ['AVAILABLE', 'MISSING'] as const,
    'parameter status',
  );
  const unit = text(input.unit, 'parameter unit');
  if (!UNIT.test(unit)) fail('parameter unit must be canonical');
  const sourceIds = uniqueIds(input.sourceIds, 'parameter sourceIds');
  const economicEventTypes = uniqueIds(
    input.economicEventTypes,
    'parameter economicEventTypes',
  );
  const transformation =
    input.transformation === null
      ? null
      : parseTransformation(input.transformation);
  const missingReason = nullableText(
    input.missingReason,
    'parameter missingReason',
  );
  if (status === 'AVAILABLE') {
    const numericValue = canonicalFiniteDecimal(
      input.value,
      `parameter ${parameterId} value`,
    );
    if (
      sourceIds.length === 0 ||
      transformation === null ||
      economicEventTypes.length === 0 ||
      missingReason !== null
    ) {
      fail(
        `available parameter ${parameterId} requires sources, transformation, Event types and no missing reason`,
      );
    }
    return Object.freeze({
      parameterId,
      status,
      value: numericValue,
      unit,
      sourceIds,
      transformation,
      economicEventTypes,
      missingReason,
    });
  }
  if (
    input.value !== null ||
    transformation !== null ||
    missingReason === null
  ) {
    fail(
      `missing parameter ${parameterId} requires null value/transformation and an explicit reason`,
    );
  }
  return Object.freeze({
    parameterId,
    status,
    value: null,
    unit,
    sourceIds,
    transformation: null,
    economicEventTypes,
    missingReason,
  });
}

function sortedUnique<T>(
  values: readonly T[],
  identity: (value: T) => string,
  label: string,
): readonly T[] {
  const sorted = [...values].sort((left, right) =>
    compare(identity(left), identity(right)),
  );
  if (new Set(sorted.map(identity)).size !== sorted.length) {
    fail(`${label} identities must be unique`);
  }
  return Object.freeze(sorted);
}

function issue(
  input: V29ParameterProvenanceIssue,
): V29ParameterProvenanceIssue {
  return Object.freeze({
    ...input,
    missingFields: Object.freeze([...input.missingFields].sort(compare)),
  });
}

function issueKey(value: V29ParameterProvenanceIssue): string {
  return [
    value.code,
    value.sourceId ?? '',
    value.parameterId ?? '',
    ...value.missingFields,
    value.message,
  ].join('\u0000');
}

function chainKey(value: V29SourceParameterEventChain): string {
  return [value.sourceId, value.parameterId, value.economicEventType].join(
    '\u0000',
  );
}

export function prepareV29ParameterProvenance(
  value: unknown,
): V29ParameterProvenanceResult {
  const input = record(value, 'V29.3 parameter provenance input');
  exactKeys(input, ['sources', 'parameters'], 'V29.3 input');
  const sources = sortedUnique(
    list(input.sources, 'sources').map(parseSource),
    (source) => source.sourceId,
    'source',
  );
  const parameters = sortedUnique(
    list(input.parameters, 'parameters').map(parseParameter),
    (parameter) => parameter.parameterId,
    'parameter',
  );
  const sourceById = new Map(
    sources.map((source) => [source.sourceId, source] as const),
  );
  const issues: V29ParameterProvenanceIssue[] = sources
    .filter((source) => source.status === 'MISSING')
    .map((source) =>
      issue({
        code: 'SOURCE_MISSING',
        sourceId: source.sourceId,
        parameterId: null,
        missingFields: [
          'source.sourceHash',
          'source.locator',
          'source.timeRange',
        ],
        message: source.missingReason!,
      }),
    );
  const chains: V29SourceParameterEventChain[] = [];
  for (const parameter of parameters) {
    for (const sourceId of parameter.sourceIds) {
      if (!sourceById.has(sourceId)) {
        fail(
          `parameter ${parameter.parameterId} references unknown source ${sourceId}`,
        );
      }
    }
    if (parameter.status === 'MISSING') {
      issues.push(
        issue({
          code: 'PARAMETER_MISSING',
          sourceId: null,
          parameterId: parameter.parameterId,
          missingFields: ['parameter.value', 'parameter.transformation'],
          message: parameter.missingReason!,
        }),
      );
      continue;
    }
    const unavailableSources = parameter.sourceIds
      .map((sourceId) => sourceById.get(sourceId)!)
      .filter((source) => source.status === 'MISSING');
    if (unavailableSources.length > 0) {
      for (const source of unavailableSources) {
        issues.push(
          issue({
            code: 'PARAMETER_SOURCE_UNAVAILABLE',
            sourceId: source.sourceId,
            parameterId: parameter.parameterId,
            missingFields: [
              'source.sourceHash',
              'source.locator',
              'source.timeRange',
            ],
            message: `Parameter ${parameter.parameterId} depends on missing source ${source.sourceId}`,
          }),
        );
      }
      continue;
    }
    for (const sourceId of parameter.sourceIds) {
      const source = sourceById.get(sourceId)!;
      for (const economicEventType of parameter.economicEventTypes) {
        chains.push(
          Object.freeze({
            chainRef: `${source.sourceId}->${parameter.parameterId}->${economicEventType}`,
            sourceId: source.sourceId,
            sourceHash: source.sourceHash!,
            sourceLocator: source.locator!,
            timeRange: source.timeRange!,
            parameterId: parameter.parameterId,
            parameterValue: parameter.value!,
            parameterUnit: parameter.unit,
            transformationId: parameter.transformation!.transformationId,
            formula: parameter.transformation!.formula,
            economicEventType,
            sourceBytesVerified: false,
            causalEffectVerified: false,
          }),
        );
      }
    }
  }
  const sortedChains = Object.freeze(
    chains.sort((left, right) => compare(chainKey(left), chainKey(right))),
  );
  const sortedIssues = Object.freeze(
    issues.sort((left, right) => compare(issueKey(left), issueKey(right))),
  );
  return Object.freeze({
    status:
      sortedIssues.length === 0
        ? ('PREPARATION_ONLY_TRACEABLE' as const)
        : ('PREPARATION_ONLY_UNAVAILABLE' as const),
    formallyVerified: false,
    eventAuthorized: false,
    parameterApplicationAuthorized: false,
    counts: Object.freeze({
      sources: sources.length,
      parameters: parameters.length,
      chains: sortedChains.length,
      issues: sortedIssues.length,
    }),
    chains: sortedChains,
    issues: sortedIssues,
  });
}
