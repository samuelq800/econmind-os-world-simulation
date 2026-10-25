import {
  SimTime,
  canonicalSerialize,
  commandId,
  worldId,
} from '@econmind/core';
import {
  bindIndustryCompatibilityEvidenceInput,
  parseIndustryCompatibilityEvidenceInput,
  type IndustryCompatibilityEvidenceBinding,
  type IndustryCompatibilityEvidenceExpectation,
  type IndustryCompatibilityEvidenceInput,
} from './industry-compatibility-evidence-input.js';
import {
  copyIndustrySourceData,
  industryClosedRecord,
  industryInputInvalid,
} from './industry-production-row-decoder.js';
import type { SqlExecutor } from './sql-database.js';

type Target = IndustryCompatibilityEvidenceInput['target'];
type Build = IndustryCompatibilityEvidenceInput['build'];
export interface IndustryCompatibilityRequest {
  readonly checkedFor: IndustryCompatibilityEvidenceInput['checkedFor'];
  readonly target: Target;
  readonly build: Build;
}
/** Actual registered connector/custodian implementation remains required.
 * This interface, its refs and a successful binder do NOT prove native custody.
 * Source-owned guards must protect predicates until the owning transaction ends.
 */
export interface IndustryCompatibilitySourceAccessor {
  resolveTargetFrom(
    transaction: SqlExecutor,
    request: Readonly<IndustryCompatibilityRequest>,
  ): Promise<Target>;
  acquireAdmissionGuardFrom(
    transaction: SqlExecutor,
    request: Readonly<IndustryCompatibilityRequest>,
  ): Promise<void>;
  readObservedInputFrom(
    transaction: SqlExecutor,
    request: Readonly<IndustryCompatibilityRequest>,
  ): Promise<IndustryCompatibilityEvidenceInput>;
  readExpectedInputFrom(
    transaction: SqlExecutor,
    request: Readonly<IndustryCompatibilityRequest>,
  ): Promise<IndustryCompatibilityEvidenceExpectation>;
}
export interface IndustryPersistenceCompatibilitySourceInputs {
  readonly schemaVersion: 'industry-persistence-source-inputs-v1';
  readonly status: 'SOURCE_INPUTS_BOUND_NOT_ADMITTED';
  readonly checkedRequest: Readonly<IndustryCompatibilityRequest>;
  readonly binding: Readonly<IndustryCompatibilityEvidenceBinding>;
  readonly steps: readonly string[];
  readonly productionAuthority: false;
  readonly sourceAdmitted: false;
  readonly runtimeReady: false;
}
function equal(a: unknown, b: unknown, reason: string) {
  if (canonicalSerialize(a) !== canonicalSerialize(b))
    industryInputInvalid(reason);
}
function string(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 512)
    industryInputInvalid('REQUEST_TEXT_BOUND');
  return value;
}
function integer(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length > 120 ||
    !/^(?:0|[1-9]\d*)$/u.test(value)
  )
    industryInputInvalid('REQUEST_INTEGER');
  return value;
}
function target(value: unknown): Target {
  const t = industryClosedRecord(copyIndustrySourceData(value), [
    'targetDeploymentRef',
    'databaseIdentityRef',
  ]);
  return Object.freeze({
    targetDeploymentRef: string(t.targetDeploymentRef),
    databaseIdentityRef: string(t.databaseIdentityRef),
  });
}
function build(value: unknown): Build {
  const b = industryClosedRecord(copyIndustrySourceData(value), [
    'constructorSourceCommit',
    'constructorBlobSHA256',
    'decoderProtocol',
    'decoderBuildSHA256',
  ]);
  if (
    typeof b.constructorSourceCommit !== 'string' ||
    !/^[a-f0-9]{40}$/u.test(b.constructorSourceCommit) ||
    typeof b.constructorBlobSHA256 !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(b.constructorBlobSHA256) ||
    typeof b.decoderBuildSHA256 !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(b.decoderBuildSHA256) ||
    b.decoderProtocol !== 'industry-production-decoder-v1'
  )
    industryInputInvalid('FIXED_BUILD_REQUIRED');
  return Object.freeze({
    constructorSourceCommit: b.constructorSourceCommit,
    constructorBlobSHA256: b.constructorBlobSHA256,
    decoderProtocol: b.decoderProtocol,
    decoderBuildSHA256: b.decoderBuildSHA256,
  });
}
function request(value: unknown): Readonly<IndustryCompatibilityRequest> {
  const r = industryClosedRecord(copyIndustrySourceData(value), [
    'checkedFor',
    'target',
    'build',
  ]);
  const c = industryClosedRecord(r.checkedFor, [
    'worldId',
    'commandId',
    'commandFingerprint',
    'head',
    'simTime',
  ]);
  const head = industryClosedRecord(c.head, ['worldVersion', 'eventSequence']);
  if (
    typeof c.commandFingerprint !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/u.test(c.commandFingerprint)
  )
    industryInputInvalid('REQUEST_COMMAND_FINGERPRINT');
  const result = {
    checkedFor: Object.freeze({
      worldId: worldId(string(c.worldId)),
      commandId: commandId(string(c.commandId)),
      commandFingerprint: c.commandFingerprint,
      head: Object.freeze({
        worldVersion: integer(head.worldVersion),
        eventSequence: integer(head.eventSequence),
      }),
      simTime: SimTime.fromTicks(integer(c.simTime)).toCanonicalValue(),
    }),
    target: target(r.target),
    build: build(r.build),
  };
  return Object.freeze(result);
}

/** One configured accessor, no transaction opening, admission token or fallback. */
export class IndustryPersistenceCompatibilityProvider {
  readonly #accessor: IndustryCompatibilitySourceAccessor;
  readonly #target: Target;
  readonly #build: Build;
  constructor(input: {
    readonly accessor: IndustryCompatibilitySourceAccessor | null;
    readonly expectedTarget: Target;
    readonly expectedBuild: Build;
  }) {
    if (!input.accessor) industryInputInvalid('SOURCE_NOT_SUPPLIED');
    this.#accessor = input.accessor;
    this.#target = target(input.expectedTarget);
    this.#build = build(input.expectedBuild);
  }
  async assertCurrentFrom(
    transaction: SqlExecutor,
    raw: IndustryCompatibilityRequest,
  ): Promise<Readonly<IndustryPersistenceCompatibilitySourceInputs>> {
    const checked = request(raw);
    equal(checked.target, this.#target, 'CONFIGURED_TARGET_MISMATCH');
    equal(checked.build, this.#build, 'CONFIGURED_BUILD_MISMATCH');
    // Passed executor owns S/L/H/A. This method does not prove those prior locks.
    const actual = target(
      await this.#accessor.resolveTargetFrom(transaction, checked),
    );
    equal(actual, this.#target, 'ACTUAL_TARGET_MISMATCH');
    await transaction.query('LOCK TABLE world_v2.schema_release IN SHARE MODE');
    await this.#accessor.acquireAdmissionGuardFrom(transaction, checked);
    const observed = parseIndustryCompatibilityEvidenceInput(
      await this.#accessor.readObservedInputFrom(transaction, checked),
    );
    equal(observed.target, checked.target, 'OBSERVED_TARGET_MISMATCH');
    equal(observed.build, checked.build, 'OBSERVED_BUILD_MISMATCH');
    equal(observed.checkedFor, checked.checkedFor, 'OBSERVED_CUTOFF_MISMATCH');
    const expected = await this.#accessor.readExpectedInputFrom(
      transaction,
      checked,
    );
    // A alone snapshots/validates both complete schemas, including numeric23 rows
    // and its private three-domain audit image. No D coercion or clone of observed.
    const binding = bindIndustryCompatibilityEvidenceInput(observed, expected);
    return Object.freeze({
      schemaVersion: 'industry-persistence-source-inputs-v1',
      status: 'SOURCE_INPUTS_BOUND_NOT_ADMITTED',
      checkedRequest: checked,
      binding,
      steps: Object.freeze([
        'TARGET_RESOLVED',
        'SCHEMA_RELEASE_SHARE_REQUESTED',
        'ADMISSION_GUARD_REQUESTED',
        'OBSERVED_SOURCE_READ',
        'EXPECTED_SOURCE_READ',
        'A_DATA_BINDING_MATCH',
      ]),
      productionAuthority: false,
      sourceAdmitted: false,
      runtimeReady: false,
    });
  }
}
