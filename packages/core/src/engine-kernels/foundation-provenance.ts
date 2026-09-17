import {
  canonicalHashInput,
  canonicalSerialize,
} from '../serialization/canonical.js';

import {
  kernelInvalid,
  nonNegative,
  nonNegativeQuantity,
  quantity,
  renderQuantity,
  type ExactQuantity,
  type WorldDecimalValue,
} from './common.js';

/**
 * Shared proof boundary for the V13/V14 foundation kernels. These helpers
 * validate caller-owned immutable facts and emit deterministic replay
 * preimages; they neither read nor write an authoritative store.
 */
export type V13V14FoundationModule =
  | 'V13_ENERGY_ALLOCATION'
  | 'V13_PRODUCTION'
  | 'V14_TECHNOLOGY_RIGHTS'
  | 'V14_PROJECT_LIFECYCLE';

export interface FoundationSnapshotBinding {
  readonly lineageRef: string;
  readonly sourceVersion: string;
  readonly snapshotRef: string;
  readonly snapshotHash: string;
  readonly predecessorSnapshotHash: string | null;
}

export interface FoundationTraceRequest {
  readonly traceRef: string;
  readonly calculationVersion: string;
  readonly snapshot: FoundationSnapshotBinding;
  readonly snapshotAt: ExactQuantity;
}

export interface FoundationFact<T> {
  readonly factRef: string;
  readonly sourceRef: string;
  readonly predecessorFactRefs: readonly string[];
  readonly snapshot: FoundationSnapshotBinding;
  readonly observedAt: ExactQuantity;
  readonly payload: T;
  readonly canonicalPayload: string;
}

export interface FoundationFactBinding {
  readonly factRef: string;
  readonly sourceRef: string;
  readonly predecessorFactRefs: readonly string[];
  readonly snapshot: FoundationSnapshotBinding;
  readonly observedAt: ExactQuantity;
  readonly canonicalPayload: string;
}

export interface ExactQuantityTransition {
  readonly transitionRef: string;
  readonly inputRefs: readonly string[];
  readonly outputRef: string;
  readonly before: ExactQuantity;
  readonly delta: ExactQuantity;
  readonly after: ExactQuantity;
}

export interface FoundationReplayProof {
  readonly module: V13V14FoundationModule;
  readonly traceRef: string;
  readonly calculationVersion: string;
  readonly snapshot: FoundationSnapshotBinding;
  readonly snapshotAt: ExactQuantity;
  readonly inputFactRefs: readonly string[];
  readonly outputFactRefs: readonly string[];
  readonly inputFacts: readonly FoundationFactBinding[];
  readonly outputFacts: readonly FoundationFactBinding[];
  readonly transitions: readonly ExactQuantityTransition[];
  /** Canonical SHA-256 preimage for a future authoritative replay owner. */
  readonly hashInput: string;
}

const STABLE_REFERENCE = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u;
const SHA256_HEX = /^[a-f0-9]{64}$/u;

function stableReference(value: string, label: string): string {
  if (!STABLE_REFERENCE.test(value)) {
    kernelInvalid(`${label} must be a stable reference`);
  }
  return value;
}

function stableReferences(
  values: readonly string[],
  label: string,
): readonly string[] {
  if (values.length === 0) {
    kernelInvalid(`${label} requires an explicit predecessor reference`);
  }
  const result = values.map((value, index) =>
    stableReference(value, `${label}[${index}]`),
  );
  if (new Set(result).size !== result.length) {
    kernelInvalid(`${label} must not repeat a reference`);
  }
  return Object.freeze(result);
}

function hash(value: string, label: string): string {
  if (!SHA256_HEX.test(value)) {
    kernelInvalid(`${label} must be a lowercase SHA-256 hex digest`);
  }
  return value;
}

function snapshotBinding(
  value: FoundationSnapshotBinding,
  label: string,
): FoundationSnapshotBinding {
  return Object.freeze({
    lineageRef: stableReference(value.lineageRef, `${label}.lineageRef`),
    sourceVersion: stableReference(
      value.sourceVersion,
      `${label}.sourceVersion`,
    ),
    snapshotRef: stableReference(value.snapshotRef, `${label}.snapshotRef`),
    snapshotHash: hash(value.snapshotHash, `${label}.snapshotHash`),
    predecessorSnapshotHash:
      value.predecessorSnapshotHash === null
        ? null
        : hash(
            value.predecessorSnapshotHash,
            `${label}.predecessorSnapshotHash`,
          ),
  });
}

function sameSnapshot(
  expected: FoundationSnapshotBinding,
  actual: FoundationSnapshotBinding,
  label: string,
): void {
  if (
    expected.lineageRef !== actual.lineageRef ||
    expected.sourceVersion !== actual.sourceVersion ||
    expected.snapshotRef !== actual.snapshotRef ||
    expected.snapshotHash !== actual.snapshotHash ||
    expected.predecessorSnapshotHash !== actual.predecessorSnapshotHash
  ) {
    kernelInvalid(`${label} has mixed lineage/version/snapshot evidence`);
  }
}

function traceContext(request: FoundationTraceRequest): {
  readonly traceRef: string;
  readonly calculationVersion: string;
  readonly snapshot: FoundationSnapshotBinding;
  readonly snapshotAt: WorldDecimalValue;
} {
  const snapshotAt = nonNegativeQuantity(
    request.snapshotAt,
    'sim_millisecond',
    'snapshotAt',
  ).amount;
  if (!snapshotAt.isInteger()) {
    kernelInvalid('snapshotAt must be an integer sim_millisecond tick');
  }
  return Object.freeze({
    traceRef: stableReference(request.traceRef, 'traceRef'),
    calculationVersion: stableReference(
      request.calculationVersion,
      'calculationVersion',
    ),
    snapshot: snapshotBinding(request.snapshot, 'snapshot'),
    snapshotAt,
  });
}

function canonicalPayload(value: unknown): string {
  try {
    return canonicalSerialize(value);
  } catch {
    return kernelInvalid('Fact payload must be canonical JSON data');
  }
}

/** Creates an immutable caller-supplied fact that is re-validated by every calculation. */
export function createFoundationFact<T>(input: {
  readonly trace: FoundationTraceRequest;
  readonly factRef: string;
  readonly sourceRef: string;
  readonly predecessorFactRefs: readonly string[];
  readonly payload: T;
}): FoundationFact<T> {
  const context = traceContext(input.trace);
  const result: FoundationFact<T> = {
    factRef: stableReference(input.factRef, 'factRef'),
    sourceRef: stableReference(input.sourceRef, 'sourceRef'),
    predecessorFactRefs: stableReferences(
      input.predecessorFactRefs,
      'predecessorFactRefs',
    ),
    snapshot: context.snapshot,
    observedAt: renderQuantity(context.snapshotAt, 'sim_millisecond'),
    payload: input.payload,
    canonicalPayload: canonicalPayload(input.payload),
  };
  foundationFactBinding(input.trace, result, 'created fact');
  return Object.freeze(result);
}

/** Verifies source, predecessor, version, snapshot, time, and exact payload binding. */
export function foundationFactBinding<T>(
  request: FoundationTraceRequest,
  fact: FoundationFact<T>,
  label: string,
): FoundationFactBinding {
  const context = traceContext(request);
  const snapshot = snapshotBinding(fact.snapshot, `${label}.snapshot`);
  sameSnapshot(context.snapshot, snapshot, label);
  const observedAt = nonNegativeQuantity(
    fact.observedAt,
    'sim_millisecond',
    `${label}.observedAt`,
  ).amount;
  if (!observedAt.isInteger() || !observedAt.equals(context.snapshotAt)) {
    kernelInvalid(`${label}.observedAt must equal the replay snapshot tick`);
  }
  const payload = canonicalPayload(fact.payload);
  if (payload !== fact.canonicalPayload) {
    kernelInvalid(
      `${label} canonical payload evidence does not match its fact`,
    );
  }
  return Object.freeze({
    factRef: stableReference(fact.factRef, `${label}.factRef`),
    sourceRef: stableReference(fact.sourceRef, `${label}.sourceRef`),
    predecessorFactRefs: stableReferences(
      fact.predecessorFactRefs,
      `${label}.predecessorFactRefs`,
    ),
    snapshot,
    observedAt: renderQuantity(observedAt, 'sim_millisecond'),
    canonicalPayload: payload,
  });
}

export function foundationFactPayload<T>(
  request: FoundationTraceRequest,
  fact: FoundationFact<T>,
  label: string,
): T {
  foundationFactBinding(request, fact, label);
  return fact.payload;
}

/** Validates a stock/flow identity exactly: before + delta = after in one unit. */
export function exactQuantityTransition(input: {
  readonly transitionRef: string;
  readonly inputRefs: readonly string[];
  readonly outputRef: string;
  readonly before: ExactQuantity;
  readonly delta: ExactQuantity;
  readonly after: ExactQuantity;
}): ExactQuantityTransition {
  const before = quantity(input.before, 'transition.before');
  const delta = quantity(input.delta, 'transition.delta');
  const after = quantity(input.after, 'transition.after');
  if (
    before.unit !== delta.unit ||
    before.unit !== after.unit ||
    nonNegative(input.before.amount, 'transition.before').isNegative() ||
    nonNegative(input.after.amount, 'transition.after').isNegative() ||
    !before.amount.plus(delta.amount).equals(after.amount)
  ) {
    kernelInvalid(
      'Quantity transition must conserve unit and before plus delta',
    );
  }
  return Object.freeze({
    transitionRef: stableReference(input.transitionRef, 'transitionRef'),
    inputRefs: stableReferences(input.inputRefs, 'transition.inputRefs'),
    outputRef: stableReference(input.outputRef, 'transition.outputRef'),
    before: renderQuantity(before.amount, before.unit),
    delta: renderQuantity(delta.amount, before.unit),
    after: renderQuantity(after.amount, before.unit),
  });
}

function distinctReferences(
  values: readonly string[],
  label: string,
): readonly string[] {
  const result = values.map((value, index) =>
    stableReference(value, `${label}[${index}]`),
  );
  if (new Set(result).size !== result.length) {
    kernelInvalid(`${label} must not repeat a reference`);
  }
  return Object.freeze(result);
}

/** Builds a deterministic, non-persistent replay proof from facts and exact transitions. */
export function foundationReplayProof(input: {
  readonly module: V13V14FoundationModule;
  readonly trace: FoundationTraceRequest;
  readonly inputFacts: readonly FoundationFact<unknown>[];
  readonly outputs: readonly {
    readonly outputRef: string;
    readonly payload: unknown;
  }[];
  readonly transitions: readonly ExactQuantityTransition[];
}): FoundationReplayProof {
  const context = traceContext(input.trace);
  const inputFacts = input.inputFacts.map((fact, index) =>
    foundationFactBinding(input.trace, fact, `inputFacts[${index}]`),
  );
  const inputFactRefs = distinctReferences(
    inputFacts.map((fact) => fact.factRef),
    'inputFactRefs',
  );
  if (inputFactRefs.length === 0) {
    kernelInvalid('A replay proof requires at least one input fact');
  }
  const outputFacts = input.outputs.map(({ outputRef, payload }) =>
    Object.freeze({
      factRef: stableReference(outputRef, 'outputRef'),
      sourceRef: context.traceRef,
      predecessorFactRefs: inputFactRefs,
      snapshot: context.snapshot,
      observedAt: renderQuantity(context.snapshotAt, 'sim_millisecond'),
      canonicalPayload: canonicalPayload(payload),
    }),
  );
  const outputFactRefs = distinctReferences(
    outputFacts.map((fact) => fact.factRef),
    'outputFactRefs',
  );
  const transitionRefs = distinctReferences(
    input.transitions.map((transition) => transition.transitionRef),
    'transitionRefs',
  );
  if (transitionRefs.length !== input.transitions.length) {
    kernelInvalid('Replay transitions must be unique');
  }
  return Object.freeze({
    module: input.module,
    traceRef: context.traceRef,
    calculationVersion: context.calculationVersion,
    snapshot: context.snapshot,
    snapshotAt: renderQuantity(context.snapshotAt, 'sim_millisecond'),
    inputFactRefs,
    outputFactRefs,
    inputFacts: Object.freeze(inputFacts),
    outputFacts: Object.freeze(outputFacts),
    transitions: Object.freeze([...input.transitions]),
    hashInput: canonicalHashInput({
      module: input.module,
      traceRef: context.traceRef,
      calculationVersion: context.calculationVersion,
      snapshot: context.snapshot,
      snapshotAt: renderQuantity(context.snapshotAt, 'sim_millisecond'),
      inputFacts,
      outputFacts,
      transitions: input.transitions,
    }),
  });
}

/** Rejects altered, stale, mixed-lineage, or duplicate fact evidence on replay. */
export function assertFoundationReplayEvidence(
  proof: FoundationReplayProof,
  inputFacts: readonly FoundationFact<unknown>[],
): void {
  const request: FoundationTraceRequest = {
    traceRef: proof.traceRef,
    calculationVersion: proof.calculationVersion,
    snapshot: proof.snapshot,
    snapshotAt: proof.snapshotAt,
  };
  const replayed = inputFacts.map((fact, index) =>
    foundationFactBinding(request, fact, `replay.inputFacts[${index}]`),
  );
  if (
    canonicalPayload(replayed) !== canonicalPayload(proof.inputFacts) ||
    canonicalPayload(replayed.map((fact) => fact.factRef)) !==
      canonicalPayload(proof.inputFactRefs)
  ) {
    kernelInvalid('Replay evidence does not exactly equal the recorded proof');
  }
}
