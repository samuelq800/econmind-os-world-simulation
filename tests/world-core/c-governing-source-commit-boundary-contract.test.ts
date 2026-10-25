import { createHash } from 'node:crypto';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  COMMAND_SCHEMA_VERSION,
  EVENT_SCHEMA_VERSION,
  SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
  SOCIAL_JOB_MATCH_DUE_COMMAND,
  SOCIAL_JOB_MATCH_RULE_VERSION,
  SOCIAL_SERVICE_PLAN_EVENT,
  canonicalHashInput,
  canonicalSha256,
  createAuthoritativeTransition,
  parseAuthoritativeEvent,
  parseCanonicalCommand,
  type CanonicalCommand,
  type DecisionResultHead,
} from '@econmind/core';
import {
  GOVERNING_SOURCE_READ_BINDING_SCHEMA,
  SOCIAL_PLAN_SOURCE_EVALUATION_PURPOSE,
  assertGoverningSourceCommitRequestConsistent,
  calculateGoverningSourceCommitBindingFingerprints,
  parseGoverningSourceReadBinding,
  type GoverningSourceCommitRequestV1,
  type GoverningSourceReadBindingV1,
  type SourceCommitCurrentnessAuditV1,
  type SourceCommitProtectionPort,
} from '../../apps/world-worker/src/projections/governing-source-commit-boundary-contract.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';

// Explicit TEST_ONLY metadata/envelopes. No custodian, source admission or SQL.
const digest = (value: string) =>
  createHash('sha256').update(value, 'utf8').digest('hex');
const hash = (value: unknown) =>
  canonicalSha256(canonicalHashInput(value), digest);
const H = hash('TEST_ONLY');
const OTHER = hash('TEST_ONLY_OTHER');
const at = '2026-10-25T00:00:00.000Z';
const paths = [
  '/admittedGenesis/semanticRevision',
  '/admittedGenesis/state',
  '/currentReadFacts/boundary',
  '/currentReadFacts/minimumWage',
  '/currentReadFacts/offer',
  '/currentReadFacts/populationAvailability',
  '/physicalAttemptEnvelope',
];
function command(overrides: Record<string, unknown> = {}): CanonicalCommand {
  return parseCanonicalCommand(
    {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      actorId: 'ACTOR_TEST_ONLY',
      authSubject: '11111111-1111-4111-8111-111111111111',
      commandId: 'PLAN_TEST_ONLY',
      commandType: SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
      correlationId: 'TRACE_TEST_ONLY',
      countryId: 'COUNTRY_01',
      worldId: 'WORLD_TEST_01',
      officeId: 'SOCIAL',
      expectedWorldVersion: '2',
      idempotencyKey: 'IDEM_TEST_ONLY',
      simTime: '10000',
      submittedAtReal: at,
      payload: {
        schemaVersion: 'social-employment-service-plan-v1',
        locationId: 'REGION_01_E1',
        skill: 'HIGH',
        positionId: 'POSITION_A',
        servicePoolId: 'POOL_A',
        requestedMatches: '3',
        dueDayIndex: '1',
      },
      ...overrides,
    },
    digest,
  );
}
function bindingFixture(cmd = command()) {
  return {
    schemaVersion: GOVERNING_SOURCE_READ_BINDING_SCHEMA,
    purpose: SOCIAL_PLAN_SOURCE_EVALUATION_PURPOSE,
    scope: {
      worldId: cmd.worldId,
      countryId: cmd.countryId!,
      officeId: 'SOCIAL' as const,
    },
    commandBinding: {
      commandId: cmd.commandId,
      commandFingerprint: cmd.fingerprint,
      commandType: SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
      payloadHash: cmd.payloadHash,
      simTime: cmd.simTime.toCanonicalValue(),
    },
    readHead: { worldVersion: '2', eventSequence: '9' },
    worldBinding: {
      seedId: 'SEED_TEST_ONLY',
      seedFingerprint: H,
      modelVersion: 'MODEL_TEST_ONLY',
      replayBindingFingerprint: H,
    },
    historyBinding: {
      openingVersion: '0',
      completePrefixFingerprint: H,
      receiptSetFingerprint: H,
      taxonomyRevision: 'TAXONOMY_TEST_ONLY',
    },
    sourceAuthorityBinding: {
      issuerId: 'ISSUER_TEST_ONLY',
      custodianId: 'CUSTODIAN_TEST_ONLY',
      ownerAdoptionRef: 'ADOPTION_TEST_ONLY',
      ownerAdoptionFingerprint: H,
      admissionRef: 'ADMISSION_TEST_ONLY',
      admissionRevision: '1',
    },
    sourceManifest: {
      manifestId: 'MANIFEST_TEST_ONLY',
      revision: '1',
      contentFingerprint: H,
      entrySetFingerprint: H,
    },
    sourceRevisions: paths.map((path, i) => ({
      recordId: `RECORD_${i}`,
      revision: '2',
      payloadHash: H,
      role:
        i === 6
          ? ('PHYSICAL_ORIGINAL_BODY' as const)
          : i < 2
            ? ('GENESIS_HISTORICAL' as const)
            : ('CURRENT_EFFECTIVE' as const),
      fieldPaths: [path],
      revocationRevision: null as string | null,
    })),
    materialBindings: paths.map((path, i) => ({
      fieldPath: path,
      valueHash: H,
      recordId: `RECORD_${i}`,
      recordRevision: '2',
      pointer: '/value',
    })),
    originalPhysicalBodyBindings: [
      {
        groupRef: 'GROUP_TEST_ONLY',
        bodyHash: H,
        originRecordId: 'RECORD_6',
        originRevision: '2',
      },
    ],
    stateHash: H,
    readFactsHash: H,
  } satisfies GoverningSourceReadBindingV1;
}
function requestFixture(
  cmd = command(),
  eventOverrides: Record<string, unknown> = {},
) {
  // Core authenticates the canonical envelope, not the Social source semantics.
  // G must separately re-prepare and compare the actual domain event payload.
  const event = parseAuthoritativeEvent(
    {
      schemaVersion: EVENT_SCHEMA_VERSION,
      causationCommandId: cmd.commandId,
      correlationId: cmd.correlationId,
      correctsEventId: null,
      eventId: 'EVENT_TEST_ONLY',
      eventType: SOCIAL_SERVICE_PLAN_EVENT,
      payload: { TEST_ONLY: 'INERT_ENVELOPE_NOT_SOURCE' },
      recordedAtReal: at,
      sequence: '10',
      simTime: cmd.simTime.toCanonicalValue(),
      worldId: cmd.worldId,
      worldVersion: '3',
      ...eventOverrides,
    },
    digest,
  );
  return {
    phase: 'BEFORE_EVENTS',
    purpose: SOCIAL_PLAN_SOURCE_EVALUATION_PURPOSE,
    command: cmd,
    transition: createAuthoritativeTransition({
      command: cmd,
      worldVersionBefore: '2',
      worldVersionAfter: '3',
      events: [event],
    }),
    currentHead: {
      worldId: cmd.worldId,
      worldVersion: '2',
      eventSequence: '9',
    },
    readBinding: bindingFixture(cmd),
    observedAtReal: at,
  } satisfies GoverningSourceCommitRequestV1;
}
function clone<T>(value: T): T {
  return structuredClone(value);
}
function set(
  root: unknown,
  path: readonly (string | number)[],
  value: unknown,
) {
  let row = root as Record<string, unknown>;
  for (const key of path.slice(0, -1))
    row = row[key] as Record<string, unknown>;
  row[path.at(-1)!] = value;
}
function get(root: unknown, path: readonly (string | number)[]): unknown {
  let value = root;
  for (const key of path) value = (value as Record<string, unknown>)[key];
  return value;
}
const closedObjects = [
  [],
  ['scope'],
  ['commandBinding'],
  ['readHead'],
  ['worldBinding'],
  ['historyBinding'],
  ['sourceAuthorityBinding'],
  ['sourceManifest'],
  ['sourceRevisions', 0],
  ['materialBindings', 0],
  ['originalPhysicalBodyBindings', 0],
] satisfies (string | number)[][];

describe('C shared PLAN data contract only, not source/guard authority', () => {
  it('owns and freezes every returned data node without freezing the caller', () => {
    const input = bindingFixture(),
      out = parseGoverningSourceReadBinding(input);
    expect(out).toEqual(input);
    expect(out).not.toBe(input);
    const visit = (v: unknown) => {
      if (v !== null && typeof v === 'object') {
        expect(Object.isFrozen(v)).toBe(true);
        Object.values(v).forEach(visit);
      }
    };
    visit(out);
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(input.sourceRevisions[0])).toBe(false);
    input.sourceRevisions[0]!.revision = '10';
    expect(out.sourceRevisions[0]!.revision).toBe('2');
    expect(Object.hasOwn(out, 'sourceAdmitted')).toBe(false);
  });
  it('normalizes null-prototype records to owned ordinary records', () => {
    const input = bindingFixture();
    Object.setPrototypeOf(input, null);
    Object.setPrototypeOf(input.scope, null);
    const out = parseGoverningSourceReadBinding(input);
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(out.scope)).toBe(Object.prototype);
  });
  it.each(closedObjects.map((path, i) => ({ name: `closed-node-${i}`, path })))(
    '$name rejects extra, missing, symbol and hidden keys',
    ({ path }) => {
      for (const mode of ['extra', 'missing', 'symbol', 'hidden']) {
        const input = bindingFixture(),
          node = get(input, path) as Record<string, unknown>;
        if (mode === 'extra') node.extra = 'x';
        if (mode === 'missing') delete node[Object.keys(node)[0]!];
        if (mode === 'symbol')
          Object.defineProperty(node, Symbol('x'), {
            value: 'x',
            enumerable: true,
          });
        if (mode === 'hidden')
          Object.defineProperty(node, 'hidden', {
            value: 'x',
            enumerable: false,
          });
        expect(() => parseGoverningSourceReadBinding(input)).toThrow();
      }
    },
  );
  it.each(closedObjects.map((path, i) => ({ name: `getter-node-${i}`, path })))(
    '$name invokes no getter',
    ({ path }) => {
      const input = bindingFixture(),
        node = get(input, path) as Record<string, unknown>;
      let calls = 0;
      Object.defineProperty(node, Object.keys(node)[0]!, {
        enumerable: true,
        get() {
          calls++;
          throw Error('HOOK');
        },
      });
      expect(() => parseGoverningSourceReadBinding(input)).toThrow();
      expect(calls).toBe(0);
    },
  );
  it.each(
    [
      ...closedObjects,
      ['sourceRevisions'],
      ['sourceRevisions', 0, 'fieldPaths'],
      ['materialBindings'],
      ['originalPhysicalBodyBindings'],
    ].map((path, i) => ({ name: `proxy-node-${i}`, path })),
  )('$name rejects before any Proxy trap', ({ path }) => {
    let input: unknown = bindingFixture(),
      calls = 0;
    const target = get(input, path) as object;
    const trap = () => {
      calls++;
      throw Error('PROXY_HOOK');
    };
    const proxy = new Proxy(target, {
      get: trap,
      getPrototypeOf: trap,
      ownKeys: trap,
      getOwnPropertyDescriptor: trap,
    });
    if (path.length) set(input, path, proxy);
    else input = proxy;
    expect(() => parseGoverningSourceReadBinding(input)).toThrow();
    expect(calls).toBe(0);
  });
  it('rejects revoked Proxy without executing a trap', () => {
    const p = Proxy.revocable(bindingFixture(), {});
    p.revoke();
    expect(() => parseGoverningSourceReadBinding(p.proxy)).toThrow();
  });
  it.each([
    'sourceRevisions',
    'materialBindings',
    'originalPhysicalBodyBindings',
  ])('%s rejects holes, non-index extras and accessors', (key) => {
    for (const mode of ['hole', 'extra', 'accessor']) {
      const input = bindingFixture(),
        a = get(input, [key]) as unknown[];
      let calls = 0;
      if (mode === 'hole') delete a[0];
      if (mode === 'extra')
        Object.defineProperty(a, 'extra', { value: 'x', enumerable: true });
      if (mode === 'accessor')
        Object.defineProperty(a, '0', {
          enumerable: true,
          get() {
            calls++;
            return null;
          },
        });
      expect(() => parseGoverningSourceReadBinding(input)).toThrow();
      expect(calls).toBe(0);
    }
  });
  it('keeps historical/current versions under one ID in numeric order, including old body origin', () => {
    const input = bindingFixture(),
      old = clone(input.sourceRevisions[6]!);
    input.sourceRevisions.push({
      ...old,
      revision: '10',
      role: 'CURRENT_EFFECTIVE',
      payloadHash: OTHER,
    });
    const out = parseGoverningSourceReadBinding(input);
    expect(out.sourceRevisions.slice(-2).map((v) => v.revision)).toEqual([
      '2',
      '10',
    ]);
    expect(out.originalPhysicalBodyBindings[0]!.originRevision).toBe('2');
    expect(out.sourceRevisions.at(-2)!.role).toBe('PHYSICAL_ORIGINAL_BODY');
    expect(out.materialBindings.at(-1)!.recordRevision).toBe('2');
  });
  it.each([
    'duplicate',
    'conflicting-role',
    'conflicting-hash',
    'lexical-order',
  ])('rejects same-version conflict or invalid order: %s', (mode) => {
    const input = bindingFixture(),
      row = clone(input.sourceRevisions[6]!);
    if (mode === 'conflicting-role') row.role = 'CURRENT_EFFECTIVE';
    if (mode === 'conflicting-hash') row.payloadHash = OTHER;
    if (mode === 'lexical-order') {
      input.sourceRevisions[6]!.revision = '10';
    }
    input.sourceRevisions.push(row);
    expect(() => parseGoverningSourceReadBinding(input)).toThrow();
  });
  it.each([
    { name: 'schema', p: ['schemaVersion'], v: 'other' },
    { name: 'purpose', p: ['purpose'], v: 'MATCH' },
    { name: 'office', p: ['scope', 'officeId'], v: 'FINANCE' },
    { name: 'World', p: ['scope', 'worldId'], v: 'bad world' },
    { name: 'country', p: ['scope', 'countryId'], v: '' },
    { name: 'command', p: ['commandBinding', 'commandId'], v: 'bad/id' },
    {
      name: 'command-type',
      p: ['commandBinding', 'commandType'],
      v: 'SOCIAL_LABOUR',
    },
    { name: 'SimTime', p: ['commandBinding', 'simTime'], v: '010000' },
    { name: 'head-negative', p: ['readHead', 'worldVersion'], v: '-1' },
    { name: 'head-number', p: ['readHead', 'eventSequence'], v: 9 },
    {
      name: 'head-overflow',
      p: ['readHead', 'worldVersion'],
      v: '9223372036854775808',
    },
    {
      name: 'opening-after-H',
      p: ['historyBinding', 'openingVersion'],
      v: '3',
    },
    { name: 'zero-revision', p: ['sourceManifest', 'revision'], v: '0' },
    {
      name: 'bad-ref',
      p: ['sourceAuthorityBinding', 'custodianId'],
      v: 'https://invented',
    },
    {
      name: 'unknown-role',
      p: ['sourceRevisions', 0, 'role'],
      v: 'CURRENT_USE',
    },
    {
      name: 'revocation',
      p: ['sourceRevisions', 0, 'revocationRevision'],
      v: '00',
    },
    { name: 'bare-fp', p: ['stateHash'], v: 'a'.repeat(64) },
    { name: 'upper-fp', p: ['readFactsHash'], v: `sha256:${'A'.repeat(64)}` },
    {
      name: 'unknown-material-version',
      p: ['materialBindings', 0, 'recordRevision'],
      v: '10',
    },
    {
      name: 'material-declared-path',
      p: ['sourceRevisions', 0, 'fieldPaths'],
      v: ['/admittedGenesis/state'],
    },
    {
      name: 'body-role-relabel',
      p: ['sourceRevisions', 6, 'role'],
      v: 'CURRENT_ELIGIBILITY',
    },
    {
      name: 'body-unknown-version',
      p: ['originalPhysicalBodyBindings', 0, 'originRevision'],
      v: '1',
    },
    {
      name: 'pointer-escape',
      p: ['materialBindings', 0, 'pointer'],
      v: '/bad~2x',
    },
    {
      name: 'pointer-Unicode',
      p: ['materialBindings', 0, 'pointer'],
      v: '/资料',
    },
    {
      name: 'pointer-control',
      p: ['materialBindings', 0, 'pointer'],
      v: '/bad\n',
    },
    {
      name: 'pointer-long',
      p: ['materialBindings', 0, 'pointer'],
      v: '/' + 'a'.repeat(512),
    },
    {
      name: 'field-outside-domain',
      p: ['sourceRevisions', 0, 'fieldPaths'],
      v: ['/unrelated'],
    },
    {
      name: 'field-duplicate',
      p: ['sourceRevisions', 0, 'fieldPaths'],
      v: [paths[0], paths[0]],
    },
    {
      name: 'field-order',
      p: ['sourceRevisions', 0, 'fieldPaths'],
      v: [paths[1], paths[0]],
    },
    { name: 'missing-revisions', p: ['sourceRevisions'], v: [] },
    {
      name: 'oversize-array',
      p: ['sourceRevisions'],
      v: Array(10001).fill(null),
    },
    { name: 'missing-material', p: ['materialBindings'], v: [] },
    { name: 'missing-body', p: ['originalPhysicalBodyBindings'], v: [] },
    { name: 'byte-limit', p: ['stateHash'], v: 'a'.repeat(4_194_305) },
  ])('rejects $name', ({ p, v }) => {
    const input = bindingFixture();
    set(input, p, v);
    expect(() => parseGoverningSourceReadBinding(input)).toThrow();
  });
  it('rejects cycles, excessive depth, foreign prototype and non-data primitives', () => {
    for (const value of [new Date(), true, 1, 1n, undefined, () => null])
      expect(() => parseGoverningSourceReadBinding(value)).toThrow();
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(() => parseGoverningSourceReadBinding(cycle)).toThrow();
    let deep: unknown = 'x';
    for (let i = 0; i < 18; i++) deep = { nested: deep };
    expect(() => parseGoverningSourceReadBinding(deep)).toThrow();
  });
  it('rejects unsorted/duplicate materials and original groups without silently repairing', () => {
    const input = bindingFixture();
    input.materialBindings.reverse();
    expect(() => parseGoverningSourceReadBinding(input)).toThrow();
    const duplicate = bindingFixture();
    duplicate.materialBindings[1] = clone(duplicate.materialBindings[0]!);
    expect(() => parseGoverningSourceReadBinding(duplicate)).toThrow();
    const bodies = bindingFixture();
    bodies.originalPhysicalBodyBindings.push(
      clone(bodies.originalPhysicalBodyBindings[0]!),
    );
    expect(() => parseGoverningSourceReadBinding(bodies)).toThrow();
  });
  it('independently reproduces all three fixed domains without aliasing source content hash', () => {
    const input = bindingFixture(),
      parsed = parseGoverningSourceReadBinding(input),
      result = calculateGoverningSourceCommitBindingFingerprints(input);
    expect(result).toEqual({
      readBindingFingerprint: hash({
        domain: 'SOCIAL_PLAN_GOVERNING_READ_BINDING_V1',
        value: parsed,
      }),
      sourceManifestFingerprint: hash({
        domain: 'SOCIAL_PLAN_GOVERNING_SOURCE_MANIFEST_V1',
        value: parsed.sourceManifest,
      }),
      sourceRevisionSetFingerprint: hash({
        domain: 'SOCIAL_PLAN_GOVERNING_SOURCE_REVISION_SET_V1',
        value: parsed.sourceRevisions,
      }),
    });
    expect(result.sourceManifestFingerprint).not.toBe(
      input.sourceManifest.contentFingerprint,
    );
    expect(new Set(Object.values(result)).size).toBe(3);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.keys(parsed)).toHaveLength(14);
  });
  it.each(['binding', 'manifest', 'revisions'])(
    'changes only containing preimage hashes: %s',
    (part) => {
      const input = bindingFixture(),
        before = calculateGoverningSourceCommitBindingFingerprints(input);
      if (part === 'binding') input.stateHash = OTHER;
      if (part === 'manifest') input.sourceManifest.contentFingerprint = OTHER;
      if (part === 'revisions') input.sourceRevisions[0]!.payloadHash = OTHER;
      const after = calculateGoverningSourceCommitBindingFingerprints(input);
      expect(after.readBindingFingerprint).not.toBe(
        before.readBindingFingerprint,
      );
      expect(
        after.sourceManifestFingerprint === before.sourceManifestFingerprint,
      ).toBe(part !== 'manifest');
      expect(
        after.sourceRevisionSetFingerprint ===
          before.sourceRevisionSetFingerprint,
      ).toBe(part !== 'revisions');
    },
  );
  it('rejects audit fields in the binding (no circular/self-digest contract)', () => {
    expect(() =>
      calculateGoverningSourceCommitBindingFingerprints({
        ...bindingFixture(),
        readBindingFingerprint: H,
      }),
    ).toThrow();
  });
  it('compares actual Core-constructed canonical PLAN/transition envelopes without issuing a grant', () => {
    const request = requestFixture(),
      result = assertGoverningSourceCommitRequestConsistent(request);
    expect(result).toEqual(request.readBinding);
    expect(result).not.toBe(request.readBinding);
    expect(Object.hasOwn(result, 'protectionMode')).toBe(false);
  });
  it.each([
    { name: 'phase', p: ['phase'], v: 'AFTER_EVENTS' },
    { name: 'purpose', p: ['purpose'], v: 'MATCH' },
    { name: 'binding-null', p: ['readBinding'], v: null },
    { name: 'H-World', p: ['currentHead', 'worldId'], v: 'WORLD_OTHER' },
    { name: 'H-WV', p: ['currentHead', 'worldVersion'], v: '3' },
    { name: 'H-sequence', p: ['currentHead', 'eventSequence'], v: '10' },
    {
      name: 'binding-World',
      p: ['readBinding', 'scope', 'worldId'],
      v: 'WORLD_OTHER',
    },
    {
      name: 'binding-country',
      p: ['readBinding', 'scope', 'countryId'],
      v: 'COUNTRY_02',
    },
    {
      name: 'binding-WV',
      p: ['readBinding', 'readHead', 'worldVersion'],
      v: '3',
    },
    {
      name: 'binding-sequence',
      p: ['readBinding', 'readHead', 'eventSequence'],
      v: '10',
    },
    {
      name: 'binding-command',
      p: ['readBinding', 'commandBinding', 'commandId'],
      v: 'PLAN_OTHER',
    },
    {
      name: 'binding-fp',
      p: ['readBinding', 'commandBinding', 'commandFingerprint'],
      v: OTHER,
    },
    {
      name: 'binding-payload',
      p: ['readBinding', 'commandBinding', 'payloadHash'],
      v: OTHER,
    },
    {
      name: 'binding-time',
      p: ['readBinding', 'commandBinding', 'simTime'],
      v: '20000',
    },
    {
      name: 'transition-fp',
      p: ['transition', 'commandFingerprint'],
      v: OTHER,
    },
    {
      name: 'transition-after',
      p: ['transition', 'worldVersionAfter'],
      v: '4',
    },
    {
      name: 'transition-before',
      p: ['transition', 'worldVersionBefore'],
      v: '1',
    },
    { name: 'transition-extra', p: ['transition', 'extra'], v: 'x' },
    { name: 'transition-no-event', p: ['transition', 'events'], v: [] },
    {
      name: 'event-fp',
      p: ['transition', 'events', 0, 'fingerprint'],
      v: OTHER,
    },
    {
      name: 'event-payload',
      p: ['transition', 'events', 0, 'canonicalPayload'],
      v: '{}',
    },
    { name: 'timestamp-shape', p: ['observedAtReal'], v: '2026-10-25' },
    {
      name: 'timestamp-normalized',
      p: ['observedAtReal'],
      v: '2026-02-30T00:00:00.000Z',
    },
  ])('request rejects $name', ({ p, v }) => {
    // Shallowly owned Core values stay real; cloning only mutated branches avoids
    // fabricating positive SimTime instances and never mutates Core frozen data.
    const original = requestFixture();
    const copy = (value: unknown): unknown => {
      if (value === null || typeof value !== 'object') return value;
      if (Array.isArray(value)) return value.map(copy);
      if (Object.getPrototypeOf(value) !== Object.prototype) return value;
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, copy(v)]),
      );
    };
    const input = copy(original);
    set(input, p, v);
    expect(() =>
      assertGoverningSourceCommitRequestConsistent(
        input as GoverningSourceCommitRequestV1,
      ),
    ).toThrow();
  });
  it.each(['sequence', 'eventType', 'simTime'])(
    'rejects independently rehashed but wrong event %s',
    (field) => {
      const request = requestFixture(command(), {
        [field]:
          field === 'sequence'
            ? '11'
            : field === 'simTime'
              ? '20000'
              : 'TEST_ONLY_OTHER_EVENT',
      });
      expect(() =>
        assertGoverningSourceCommitRequestConsistent(request),
      ).toThrow();
    },
  );
  it('accepts independently rehashed same-time canonical PLAN envelope', () => {
    const request = requestFixture(command(), { simTime: '10000' });
    expect(assertGoverningSourceCommitRequestConsistent(request)).toEqual(
      request.readBinding,
    );
  });
  it('rejects independently canonical wrong Office/type/MATCH commands', () => {
    const due = command({
      commandType: SOCIAL_JOB_MATCH_DUE_COMMAND,
      officeId: null,
      payload: {
        schemaVersion: 'social-job-match-settlement-v1',
        planCommandId: 'PLAN_ORIGINAL',
        planFingerprint: H,
        dueDayIndex: '1',
        ruleVersion: SOCIAL_JOB_MATCH_RULE_VERSION,
      },
    });
    for (const cmd of [
      command({ officeId: 'FINANCE' }),
      command({ commandType: 'TEST_ONLY_OTHER' }),
      due,
    ])
      expect(() =>
        assertGoverningSourceCommitRequestConsistent(requestFixture(cmd)),
      ).toThrow();
  });
  it('requires closed request/currentHead, rejects getters and Proxy before traps', () => {
    const request = requestFixture();
    expect(() =>
      assertGoverningSourceCommitRequestConsistent({
        ...request,
        extra: 'x',
      } as GoverningSourceCommitRequestV1),
    ).toThrow();
    expect(() =>
      assertGoverningSourceCommitRequestConsistent({
        ...request,
        currentHead: { ...request.currentHead, extra: 'x' },
      } as GoverningSourceCommitRequestV1),
    ).toThrow();
    for (const field of [
      'command',
      'transition',
      'currentHead',
      'readBinding',
      'root',
    ]) {
      let calls = 0;
      const trap = () => {
        calls++;
        throw Error('HOOK');
      };
      const input = { ...request };
      const proxy = new Proxy(
        field === 'root' ? input : (get(input, [field]) as object),
        {
          get: trap,
          getPrototypeOf: trap,
          ownKeys: trap,
          getOwnPropertyDescriptor: trap,
        },
      );
      if (field !== 'root') set(input, [field], proxy);
      expect(() =>
        assertGoverningSourceCommitRequestConsistent(
          (field === 'root' ? proxy : input) as GoverningSourceCommitRequestV1,
        ),
      ).toThrow();
      expect(calls).toBe(0);
    }
    let calls = 0;
    const input = { ...request };
    Object.defineProperty(input, 'command', {
      get() {
        calls++;
        return request.command;
      },
      enumerable: true,
    });
    expect(() => assertGoverningSourceCommitRequestConsistent(input)).toThrow();
    expect(calls).toBe(0);
  });
  it('exports an exact audit/port type, not an implementation or authority token', () => {
    expectTypeOf<
      SourceCommitProtectionPort['assertCurrentFrom']
    >().parameters.toEqualTypeOf<
      [SqlExecutor, Readonly<GoverningSourceCommitRequestV1>]
    >();
    expectTypeOf<
      SourceCommitProtectionPort['assertCurrentFrom']
    >().returns.toEqualTypeOf<
      Promise<Readonly<SourceCommitCurrentnessAuditV1>>
    >();
    expectTypeOf<
      SourceCommitCurrentnessAuditV1['currentHead']
    >().toEqualTypeOf<DecisionResultHead>();
    expectTypeOf<keyof SourceCommitCurrentnessAuditV1>().toEqualTypeOf<
      | 'status'
      | 'purpose'
      | 'commandFingerprint'
      | 'currentHead'
      | 'readBindingFingerprint'
      | 'sourceManifestFingerprint'
      | 'sourceRevisionSetFingerprint'
      | 'protectionMode'
    >();
    expectTypeOf<
      SourceCommitCurrentnessAuditV1['protectionMode']
    >().toEqualTypeOf<'HELD_SOURCE_GUARDS'>();
    expectTypeOf<
      SourceCommitCurrentnessAuditV1['status']
    >().toEqualTypeOf<'CURRENT_SOURCE_RECHECKED_NOT_AUTHORITY'>();
  });
});
