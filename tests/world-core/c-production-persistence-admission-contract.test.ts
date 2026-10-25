// TEST_ONLY expected obligations, never a native installation/admission test.
import { describe, expect, it } from 'vitest';
import {
  parseProductionPersistenceAdmissionRequirement as parse,
  assertProductionPersistenceRequirementMatchesCandidate as match,
  assertInventoryPersistenceSchemaAdmitted,
  PRODUCTION_PERSISTENCE_SCHEMA_NOT_ADMITTED,
  isCanonicalInputProxy,
  canonicalSerialize,
  SimTime,
  type ProductionPersistenceAdmissionRequirementV1,
} from '../../packages/core/src/index.js';
import { isCanonicalInputProxy as directIsProxy } from '../../packages/core/src/serialization/canonical.js';
import { createProductionSchemaFixture } from '../support/production-schema-fixture.js';

const fixture = createProductionSchemaFixture();
const made = fixture.make();
const fp = `sha256:${'a'.repeat(64)}` as const;
const fp2 = `sha256:${'b'.repeat(64)}` as const;
const head = { worldVersion: '1', eventSequence: '1' };
const kinds = [
  'OPERATING_SOURCE',
  'ORIGINAL_FUNDING_QUALIFICATION',
  'CURRENT_USE_ELIGIBILITY',
  'REVOCATION_STATE',
  'WRITER_REVOKER_COOPERATION',
] as const;
function requirement(): ProductionPersistenceAdmissionRequirementV1 {
  return {
    schemaVersion: 'production-persistence-admission-requirement-v1',
    purpose: 'NEW_INVENTORY_PRODUCTION_PERSISTENCE',
    target: {
      targetDeploymentRef: 'TARGET_TEST',
      databaseIdentityRef: 'DATABASE_TEST',
      connectorBindingRef: 'CONNECTOR_TEST',
    },
    worldBinding: {
      worldId: made.command.worldId,
      seedId: fixture.seed.seedId,
      seedFingerprint: fixture.seed.fingerprint,
      modelVersion: 'MODEL_TEST',
      replayBindingFingerprint: fp,
    },
    commandBinding: {
      commandId: made.command.commandId,
      commandFingerprint: made.command.fingerprint,
      inventoryPostingFingerprints: [made.posting.fingerprint],
    },
    head: { ...head },
    implementation: {
      constructorSourceCommit: 'a'.repeat(40),
      constructorBlobSHA256: 'b'.repeat(64),
      decoderProtocol: 'industry-production-decoder-v1',
      decoderBuildSHA256: 'c'.repeat(64),
      writerProtocol: 'industry-production-writer-v1',
      admissionContractVersion: 'ADMISSION_TEST_V1',
    },
    releaseContract: {
      publisherPolicyRef: 'POLICY_TEST',
      publisherPolicyRevision: '1',
      installedReleaseChainFingerprint: fp,
      catalogContractVersion: 'CATALOG_TEST',
      catalogFingerprint: fp2,
      currentAdmissionRef: 'ADMISSION_TEST',
      currentAdmissionRevision: '1',
    },
    sourceRequirements: kinds.map((kind, index) => ({
      kind,
      recordRef: `SOURCE_TEST_${index}`,
      expectedRevision: '1',
      expectedFingerprint: fp,
      custodianRef: 'CUSTODIAN_TEST_NOT_ACTUAL',
      subjectRef: 'SUBJECT_TEST',
      requiredAt:
        kind === 'OPERATING_SOURCE'
          ? 'TARGET_TRANSITION_CUTOFF'
          : kind === 'ORIGINAL_FUNDING_QUALIFICATION'
            ? 'ORIGINAL_SETTLEMENT_CUTOFF'
            : 'CURRENT_USE_HEAD',
      cutoff:
        index < 2 ? { worldVersion: '2', eventSequence: '2' } : { ...head },
      resourceRefs:
        kind === 'WRITER_REVOKER_COOPERATION' ? ['RESOURCE_TEST'] : [],
    })),
  };
}
function candidate(r = parse(requirement())) {
  return {
    requirement: r,
    worldId: made.command.worldId,
    commandId: made.command.commandId,
    commandFingerprint: made.command.fingerprint,
    head: { ...head },
    postings: [made.posting],
  };
}
type Data = Record<string, unknown>;
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
function change(path: readonly string[], value: unknown): unknown {
  const r = clone(requirement()) as unknown as Data;
  let row = r;
  for (const key of path.slice(0, -1)) row = row[key] as Data;
  row[path.at(-1)!] = value;
  return r;
}

describe('C inert production persistence requirement', () => {
  it('owns and freezes a legal complete descriptor without freezing caller data', () => {
    const raw = requirement(),
      parsed = parse(raw);
    expect(parsed).toEqual(raw);
    expect(parsed).not.toBe(raw);
    expect(Object.isFrozen(raw)).toBe(false);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.sourceRequirements)).toBe(true);
    expect(Object.isFrozen(parsed.sourceRequirements[4]!.resourceRefs)).toBe(
      true,
    );
    const mutable = raw.sourceRequirements[4]!.resourceRefs as string[];
    mutable.push('Z_LATER');
    expect(parsed.sourceRequirements[4]!.resourceRefs).toEqual([
      'RESOURCE_TEST',
    ]);
  });
  it('matches actual TEST_ONLY constructor posting identity but never admits it', () => {
    expect(match(candidate())).toEqual({
      status: 'REQUIREMENT_MATCHED_NOT_ADMITTED',
      comparisonScope: 'CANDIDATE_IDENTITY_ONLY',
    });
    expect(() =>
      assertInventoryPersistenceSchemaAdmitted([made.posting]),
    ).toThrow(PRODUCTION_PERSISTENCE_SCHEMA_NOT_ADMITTED);
  });
  it('accepts original/target AFTER cutoffs beyond pre-H without inventing earlier-only law', () => {
    const r = parse(requirement());
    expect(r.sourceRequirements[0]!.cutoff.worldVersion).toBe('2');
    expect(r.sourceRequirements[1]!.cutoff.worldVersion).toBe('2');
    expect(match(candidate(r)).status).toBe('REQUIREMENT_MATCHED_NOT_ADMITTED');
  });
  it('does not pretend to compare actual target/seed/build/catalog/source values not supplied', () => {
    for (const [path, value] of [
      [['target', 'databaseIdentityRef'], 'OTHER_EXPECTED_DATABASE'],
      [['worldBinding', 'seedFingerprint'], fp2],
      [['implementation', 'decoderBuildSHA256'], 'd'.repeat(64)],
      [['releaseContract', 'catalogFingerprint'], fp],
      [['sourceRequirements', '0', 'expectedFingerprint'], fp2],
    ] as const) {
      const r = parse(change(path, value));
      expect(match(candidate(r)).comparisonScope).toBe(
        'CANDIDATE_IDENTITY_ONLY',
      );
    }
  });
  it.each([
    [['schemaVersion'], 'UNKNOWN'],
    [['purpose'], 'ADMITTED'],
    [['target', 'connectorBindingRef'], ''],
    [['target', 'targetDeploymentRef'], 'A B'],
    [['worldBinding', 'seedFingerprint'], 'a'.repeat(64)],
    [['commandBinding', 'commandFingerprint'], 'a'.repeat(64)],
    [['commandBinding', 'commandFingerprint'], `sha256:${'A'.repeat(64)}`],
    [['commandBinding', 'inventoryPostingFingerprints'], []],
    [['head', 'worldVersion'], '01'],
    [['head', 'eventSequence'], -1],
    [['head', 'worldVersion'], '9223372036854775808'],
    [['implementation', 'constructorSourceCommit'], 'a'.repeat(39)],
    [['implementation', 'constructorBlobSHA256'], fp],
    [['implementation', 'decoderBuildSHA256'], fp],
    [['implementation', 'decoderProtocol'], 'industry-production-decoder-v2'],
    [['releaseContract', 'currentAdmissionRevision'], '0'],
    [['sourceRequirements', '0', 'kind'], 'ADMITTED'],
    [['sourceRequirements', '0', 'expectedRevision'], '0'],
    [['sourceRequirements', '0', 'expectedFingerprint'], 'a'.repeat(64)],
    [['sourceRequirements', '0', 'subjectRef'], 'S'.repeat(129)],
    [['sourceRequirements', '0', 'requiredAt'], 'CURRENT_USE_HEAD'],
    [['sourceRequirements', '2', 'cutoff', 'worldVersion'], '2'],
    [['sourceRequirements', '3', 'cutoff', 'eventSequence'], '2'],
    [['sourceRequirements', '4', 'resourceRefs'], []],
    [
      ['sourceRequirements', '4', 'resourceRefs'],
      ['B', 'A'],
    ],
    [
      ['sourceRequirements', '4', 'resourceRefs'],
      ['A', 'A'],
    ],
    [
      ['sourceRequirements', '4', 'resourceRefs'],
      Array.from({ length: 33 }, (_, i) => `R${i}`),
    ],
  ])('rejects malformed descriptor field %j', (path, value) => {
    expect(() => parse(change(path as string[], value))).toThrow();
  });
  it.each(['root', 'target', 'source'])(
    'rejects extra fields at %s',
    (where) => {
      const r = clone(requirement()) as unknown as Data;
      const row =
        where === 'root'
          ? r
          : where === 'target'
            ? (r.target as Data)
            : (r.sourceRequirements as Data[])[0]!;
      row.admitted = true;
      expect(() => parse(r)).toThrow();
    },
  );
  it('rejects accessors without executing them', () => {
    const r = requirement();
    let called = 0;
    Object.defineProperty(r.target, 'databaseIdentityRef', {
      enumerable: true,
      get() {
        called++;
        return 'DATABASE_TEST';
      },
    });
    expect(() => parse(r)).toThrow();
    expect(called).toBe(0);
  });
  it('rejects sparse arrays and extra array properties', () => {
    const sparse = requirement().sourceRequirements.slice();
    delete sparse[1];
    expect(() => parse(change(['sourceRequirements'], sparse))).toThrow();
    const refs: string[] & { extra?: string } = ['A'];
    refs.extra = 'B';
    expect(() =>
      parse(change(['sourceRequirements', '4', 'resourceRefs'], refs)),
    ).toThrow();
  });
  it('requires all five kinds even when total count is five', () => {
    const r = clone(requirement());
    const first = { ...r.sourceRequirements[0]!, recordRef: 'SOURCE_TEST_0B' };
    const rows = [
      r.sourceRequirements[0]!,
      first,
      ...r.sourceRequirements.slice(2),
    ];
    expect(() => parse(change(['sourceRequirements'], rows))).toThrow();
  });
  it('rejects source tuple duplicates and out-of-order data without sorting it', () => {
    const rows = requirement().sourceRequirements;
    expect(() =>
      parse(change(['sourceRequirements'], [rows[0], ...rows])),
    ).toThrow();
    expect(() =>
      parse(change(['sourceRequirements'], [...rows].reverse())),
    ).toThrow();
  });
  it('rejects conflicting same-record source identity across distinct subjects', () => {
    const rows = requirement().sourceRequirements;
    const alternate = {
      ...rows[0]!,
      subjectRef: 'Z_OTHER',
      expectedFingerprint: fp2,
    };
    expect(() =>
      parse(
        change(['sourceRequirements'], [rows[0], alternate, ...rows.slice(1)]),
      ),
    ).toThrow();
  });
  it('bounds total descriptors before interpreting them', () => {
    expect(() =>
      parse(
        change(
          ['sourceRequirements'],
          Array(1025).fill(requirement().sourceRequirements[0]),
        ),
      ),
    ).toThrow();
  });
  it('rejects a canonical descriptor larger than one MiB, never truncates', () => {
    const rows = requirement().sourceRequirements;
    const refs = Array.from(
      { length: 32 },
      (_, i) => `R${String(i).padStart(2, '0')}${'A'.repeat(125)}`,
    );
    const operating = Array.from({ length: 1020 }, (_, i) => ({
      ...rows[0]!,
      recordRef: `OPERATING_${String(i).padStart(4, '0')}`,
      resourceRefs: refs,
    }));
    expect(() =>
      parse(change(['sourceRequirements'], [...operating, ...rows.slice(1)])),
    ).toThrow(/one-MiB/);
  });
  it.each(
    [
      { worldId: 'WORLD_OTHER' },
      { commandId: 'COMMAND_OTHER' },
      { commandFingerprint: fp },
      { head: { worldVersion: '2', eventSequence: '1' } },
      { head: { worldVersion: '1', eventSequence: '2' } },
      { postings: [] },
      { postings: [made.posting, made.posting] },
      { postings: [{ ...made.posting, fingerprint: fp }] },
      { postings: [{ ...made.posting, worldId: 'WORLD_OTHER' }] },
      { postings: [{ ...made.posting, causationCommandId: 'COMMAND_OTHER' }] },
      { postings: [{ ...made.posting, operation: 'DELIVER' }] },
      {
        postings: [{ ...made.posting, schemaVersion: 'inventory-posting-v1' }],
      },
      { postings: [{ ...made.posting, schemaVersion: 'UNKNOWN' }] },
    ].map((delta, caseId) => ({ delta, caseId })),
  )('rejects supplied candidate identity difference $caseId', ({ delta }) => {
    const value = { ...candidate(), ...delta };
    expect(() => Reflect.apply(match, undefined, [value])).toThrow();
  });
  it('rejects declared duplicate or unsorted fingerprint sets', () => {
    expect(() =>
      parse(
        change(['commandBinding', 'inventoryPostingFingerprints'], [fp, fp]),
      ),
    ).toThrow();
    expect(() =>
      parse(
        change(['commandBinding', 'inventoryPostingFingerprints'], [fp2, fp]),
      ),
    ).toThrow();
  });
  it('rejects a callback/brand/flag instead of an exact closed requirement', () => {
    let called = 0;
    const value = {
      ...candidate(),
      admitted: true,
      assertCurrent: () => {
        called++;
        return true;
      },
    };
    expect(() => Reflect.apply(match, undefined, [value])).toThrow();
    expect(called).toBe(0);
    expect(() =>
      assertInventoryPersistenceSchemaAdmitted([made.posting]),
    ).toThrow(PRODUCTION_PERSISTENCE_SCHEMA_NOT_ADMITTED);
  });
  it.each(
    [
      [],
      ['target'],
      ['worldBinding'],
      ['commandBinding'],
      ['commandBinding', 'inventoryPostingFingerprints'],
      ['head'],
      ['implementation'],
      ['releaseContract'],
      ['sourceRequirements'],
      ['sourceRequirements', '0'],
      ['sourceRequirements', '0', 'cutoff'],
      ['sourceRequirements', '4', 'resourceRefs'],
    ].map((path, caseId) => ({ path, caseId })),
  )('rejects requirement Proxy before any trap $caseId', ({ path }) => {
    let input: unknown = requirement(),
      parent = input as Data;
    for (const key of path.slice(0, -1)) parent = parent[key] as Data;
    const target = path.length ? parent[path.at(-1)!] : input;
    let calls = 0;
    const trap = () => {
      calls++;
      throw Error('PROXY_TRAP');
    };
    const proxy = new Proxy(target as object, {
      get: trap,
      getPrototypeOf: trap,
      ownKeys: trap,
      getOwnPropertyDescriptor: trap,
    });
    if (path.length) parent[path.at(-1)!] = proxy;
    else input = proxy;
    expect(() => parse(input)).toThrow();
    expect(calls).toBe(0);
  });
  it.each(
    [[], ['head'], ['postings'], ['postings', '0']].map((path, caseId) => ({
      path,
      caseId,
    })),
  )('rejects matcher Proxy before any trap $caseId', ({ path }) => {
    let input: unknown = candidate(),
      parent = input as Data;
    for (const key of path.slice(0, -1)) parent = parent[key] as Data;
    const target = path.length ? parent[path.at(-1)!] : input;
    let calls = 0;
    const trap = () => {
      calls++;
      throw Error('PROXY_TRAP');
    };
    const proxy = new Proxy(target as object, {
      get: trap,
      getPrototypeOf: trap,
      ownKeys: trap,
      getOwnPropertyDescriptor: trap,
    });
    if (path.length) parent[path.at(-1)!] = proxy;
    else input = proxy;
    expect(() => Reflect.apply(match, undefined, [input])).toThrow();
    expect(calls).toBe(0);
  });
  it('rejects revoked Proxy inputs without reflecting on their targets', () => {
    const object = Proxy.revocable(requirement(), {});
    object.revoke();
    expect(() => parse(object.proxy)).toThrow();
    const postings = Proxy.revocable([made.posting], {});
    postings.revoke();
    expect(() => match({ ...candidate(), postings: postings.proxy })).toThrow();
  });
  it('retains null-prototype record normalization and never freezes the caller', () => {
    const input = requirement();
    Object.setPrototypeOf(input, null);
    Object.setPrototypeOf(input.target, null);
    const output = parse(input);
    expect(Object.getPrototypeOf(output)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(output.target)).toBe(Object.prototype);
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(input.target)).toBe(false);
    expect(match(candidate(output))).toEqual({
      status: 'REQUIREMENT_MATCHED_NOT_ADMITTED',
      comparisonScope: 'CANDIDATE_IDENTITY_ONLY',
    });
    expect(() =>
      assertInventoryPersistenceSchemaAdmitted([made.posting]),
    ).toThrow(PRODUCTION_PERSISTENCE_SCHEMA_NOT_ADMITTED);
  });
  it('rejects posting identity accessors without executing them', () => {
    let calls = 0;
    const posting = { ...made.posting };
    Object.defineProperty(posting, 'fingerprint', {
      enumerable: true,
      get() {
        calls++;
        throw Error('GETTER');
      },
    });
    expect(() => match({ ...candidate(), postings: [posting] })).toThrow();
    expect(calls).toBe(0);
  });
  it('exposes the same thin native Proxy identity helper through root and direct module', () => {
    expect(isCanonicalInputProxy).toBe(directIsProxy);
    for (const value of [
      null,
      undefined,
      'x',
      1,
      [],
      {},
      Object.create(null),
      SimTime.fromTicks('1'),
    ])
      expect(isCanonicalInputProxy(value)).toBe(false);
    let calls = 0;
    const trap = () => {
      calls++;
      throw Error('PROXY_TRAP');
    };
    const proxy = new Proxy(
      {},
      {
        get: trap,
        getPrototypeOf: trap,
        ownKeys: trap,
        getOwnPropertyDescriptor: trap,
      },
    );
    expect(isCanonicalInputProxy(proxy)).toBe(true);
    expect(calls).toBe(0);
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    expect(isCanonicalInputProxy(revoked.proxy)).toBe(true);
    expect(() => canonicalSerialize(proxy)).toThrow();
    expect(calls).toBe(0);
  });
  it('keeps old serializer getter rejection and null-prototype distinction unchanged', () => {
    let calls = 0;
    const value = {};
    Object.defineProperty(value, 'x', {
      enumerable: true,
      get() {
        calls++;
        return 'x';
      },
    });
    expect(() => canonicalSerialize(value)).toThrow();
    expect(calls).toBe(0);
    const nullPrototype = Object.assign(Object.create(null), { x: 'x' });
    expect(() => canonicalSerialize(nullPrototype)).toThrow();
    expect(canonicalSerialize({ x: 'x' })).toBe('{"x":"x"}');
  });
});
