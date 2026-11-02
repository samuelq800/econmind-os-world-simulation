import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  assertIndustryPersistenceSchemaBoundaryMatchesActual,
  assertInventoryPersistenceSchemaAdmitted,
  canonicalSerialize,
  classifyInventoryPersistenceSchemaPair,
  createAuthoritativeTransition,
  parseAuthoritativeEvent,
  parseCanonicalCommand,
  parseIndustryPersistenceSchemaBoundaryContext,
  type IndustryPersistenceSchemaBoundaryActualInputV1,
  type IndustryPersistenceSchemaCommitContextV1,
  type IndustryPersistenceSchemaReadContextV1,
} from '../../packages/core/src/index.js';
import { createProductionSchemaFixture } from '../support/production-schema-fixture.js';

// All successful comparisons below are TEST_ONLY Core data controls, never
// authentic source decisions, installed schemas or protected native IO.
const sha256 = (input: string) =>
  createHash('sha256').update(input).digest('hex');
const target = {
  targetDeploymentRef: 'TEST_ONLY_DEPLOYMENT',
  databaseIdentityRef: 'TEST_ONLY_DATABASE',
};
const build = {
  constructorSourceCommit: 'a'.repeat(40),
  constructorBlobSHA256: 'b'.repeat(64),
  decoderProtocol: 'industry-production-decoder-v1' as const,
  decoderBuildSHA256: 'c'.repeat(64),
};
function fixture(mode: 'read' | 'commit' = 'read', wv = '2', seq = '2') {
  const made = createProductionSchemaFixture().make();
  const { command, transition, posting } = made;
  const common = {
    worldId: command.worldId,
    expectedHead: { worldVersion: wv, eventSequence: seq },
    target: { ...target },
    build: { ...build },
  };
  const context:
    | IndustryPersistenceSchemaReadContextV1
    | IndustryPersistenceSchemaCommitContextV1 =
    mode === 'read'
      ? {
          schemaVersion: 'industry-persistence-schema-read-context-v1',
          purpose: 'INDUSTRY_PRODUCTION_CANONICAL_HISTORY_READ',
          ...common,
        }
      : {
          schemaVersion: 'industry-persistence-schema-commit-context-v1',
          purpose: 'INDUSTRY_PRODUCTION_NEW_EFFECT_COMMIT',
          ...common,
          commandBinding: {
            commandId: command.commandId,
            commandFingerprint: command.fingerprint,
            simTime: command.simTime.toCanonicalValue(),
          },
        };
  const identity = {
    schemaVersion: posting.schemaVersion,
    operation: posting.operation,
    worldId: posting.worldId,
    causationCommandId: posting.causationCommandId,
    postingId: posting.postingId,
    fingerprint: posting.fingerprint,
    worldVersionBefore: posting.worldVersionBefore,
    worldVersionAfter: posting.worldVersionAfter,
  };
  const input = {
    context,
    actualHeldHead: {
      worldId: command.worldId,
      worldVersion: wv,
      eventSequence: seq,
    },
    actualTarget: { ...target },
    actualBuild: { ...build },
    command,
    transition,
    postingIdentities: [identity],
  } satisfies IndustryPersistenceSchemaBoundaryActualInputV1;
  return { ...made, context, identity, input };
}
const match = (value: unknown) =>
  Reflect.apply(
    assertIndustryPersistenceSchemaBoundaryMatchesActual,
    undefined,
    [value, sha256],
  );
const clone = (value: unknown): Record<string, unknown> =>
  JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
const matched = {
  status: 'BOUNDARY_DATA_MATCHED_NOT_ADMITTED',
  scope: 'CONTEXT_AND_CANONICAL_IDENTITIES_ONLY',
};

describe('Industry boundary closed data contract', () => {
  it('owns and deeply freezes both contexts without freezing caller data', () => {
    for (const mode of ['read', 'commit'] as const) {
      const { context } = fixture(mode);
      const parsed = parseIndustryPersistenceSchemaBoundaryContext(context);
      expect(parsed).toEqual(context);
      expect(parsed).not.toBe(context);
      expect(Object.isFrozen(parsed)).toBe(true);
      for (const key of ['expectedHead', 'target', 'build'] as const) {
        expect(parsed[key]).not.toBe(context[key]);
        expect(Object.isFrozen(parsed[key])).toBe(true);
        expect(Object.isFrozen(context[key])).toBe(false);
      }
      if ('commandBinding' in parsed)
        expect(Object.isFrozen(parsed.commandBinding)).toBe(true);
      expect(Object.isFrozen(context)).toBe(false);
    }
  });
  it.each([
    ['read command forbidden', { commandBinding: null }],
    ['extra key', { allow: true }],
    [
      'unknown purpose',
      { purpose: 'SOCIAL_EMPLOYMENT_SERVICE_PLAN_SOURCE_EVALUATION_V1' },
    ],
    [
      'write purpose in read schema',
      { purpose: 'INDUSTRY_PRODUCTION_NEW_EFFECT_COMMIT' },
    ],
    ['unknown schema', { schemaVersion: 'unknown' }],
    ['noncanonical World', { worldId: 'world' }],
    ['World number coercion', { worldId: 1 }],
    [
      'head extra',
      { expectedHead: { worldVersion: '2', eventSequence: '2', allow: true } },
    ],
    [
      'head negative',
      { expectedHead: { worldVersion: '-1', eventSequence: '2' } },
    ],
    [
      'head leading zero',
      { expectedHead: { worldVersion: '02', eventSequence: '2' } },
    ],
    ['head Number', { expectedHead: { worldVersion: 2, eventSequence: '2' } }],
    [
      'head overflow',
      {
        expectedHead: {
          worldVersion: '9223372036854775808',
          eventSequence: '2',
        },
      },
    ],
    ['target empty', { target: { ...target, databaseIdentityRef: '' } }],
    [
      'target overflow',
      { target: { ...target, databaseIdentityRef: 'x'.repeat(513) } },
    ],
    [
      'uppercase commit',
      { build: { ...build, constructorSourceCommit: 'A'.repeat(40) } },
    ],
    [
      'prefixed raw hash',
      {
        build: { ...build, constructorBlobSHA256: `sha256:${'b'.repeat(64)}` },
      },
    ],
    ['wrong decoder', { build: { ...build, decoderProtocol: 'other' } }],
  ])('refuses %s', (_name, delta) => {
    expect(() =>
      parseIndustryPersistenceSchemaBoundaryContext({
        ...fixture().context,
        ...delta,
      }),
    ).toThrow();
  });
  it('refuses missing, hidden, symbol, nonplain and cyclic context data', () => {
    const base = clone(fixture().context);
    const missing = { ...base };
    delete missing.purpose;
    const hidden = Object.defineProperty({ ...base }, 'purpose', {
      value: base.purpose,
      enumerable: false,
    });
    const cyclic = { ...base, target: base };
    cyclic.target = cyclic;
    for (const value of [
      missing,
      hidden,
      { ...base, [Symbol('extra')]: 'x' },
      Object.assign(Object.create({}), base),
      cyclic,
    ])
      expect(() =>
        parseIndustryPersistenceSchemaBoundaryContext(value),
      ).toThrow();
  });
  it('rejects getters and native Proxies before executing any trap', () => {
    let calls = 0;
    const trap = () => {
      calls++;
      throw new Error('must not execute');
    };
    const proxy = new Proxy(
      {},
      {
        get: trap,
        ownKeys: trap,
        getPrototypeOf: trap,
        getOwnPropertyDescriptor: trap,
      },
    );
    const getter = Object.defineProperty(
      { ...fixture().context },
      'schemaVersion',
      { get: trap },
    );
    for (const value of [
      proxy,
      getter,
      { ...fixture().context, target: proxy },
    ])
      expect(() =>
        parseIndustryPersistenceSchemaBoundaryContext(value),
      ).toThrow();
    expect(() => classifyInventoryPersistenceSchemaPair(proxy)).toThrow();
    expect(() => match(proxy)).toThrow();
    const f = fixture();
    for (const key of ['command', 'transition', 'postingIdentities'] as const)
      expect(() => match({ ...f.input, [key]: proxy })).toThrow();
    expect(calls).toBe(0);
  });
  it('counts canonical UTF8 bytes and preserves target text exactly', () => {
    const context = {
      ...fixture().context,
      worldId: 'W'.repeat(1024),
      target: {
        targetDeploymentRef: '中'.repeat(512),
        databaseIdentityRef: '文'.repeat(512),
      },
    };
    expect(Buffer.byteLength(canonicalSerialize(context))).toBeGreaterThan(
      4096,
    );
    expect(() =>
      parseIndustryPersistenceSchemaBoundaryContext(context),
    ).toThrow();
    const small = {
      ...context,
      worldId: 'WORLD_TEST',
      target: {
        targetDeploymentRef: '中文 😀',
        databaseIdentityRef: ' test-only ',
      },
    };
    expect(parseIndustryPersistenceSchemaBoundaryContext(small).target).toEqual(
      small.target,
    );
    const boundary = { ...context, worldId: 'W' };
    const padding = 4096 - Buffer.byteLength(canonicalSerialize(boundary));
    const exact = { ...boundary, worldId: 'W'.repeat(padding + 1) };
    expect(Buffer.byteLength(canonicalSerialize(exact))).toBe(4096);
    expect(parseIndustryPersistenceSchemaBoundaryContext(exact)).toEqual(exact);
    expect(() =>
      parseIndustryPersistenceSchemaBoundaryContext({
        ...exact,
        worldId: exact.worldId + 'W',
      }),
    ).toThrow();
  });
  it.each(['01', '-1', '1.0', '1e3', '9'.repeat(121), 1000, null])(
    'refuses noncanonical commit SimTime case %s',
    (value) => {
      const context = fixture('commit')
        .context as IndustryPersistenceSchemaCommitContextV1;
      expect(() =>
        parseIndustryPersistenceSchemaBoundaryContext({
          ...context,
          commandBinding: { ...context.commandBinding, simTime: value },
        }),
      ).toThrow();
    },
  );
  it('preserves large exact SimTime and PG bigint bounds', () => {
    const context = fixture('commit')
      .context as IndustryPersistenceSchemaCommitContextV1;
    const value = {
      ...context,
      expectedHead: {
        worldVersion: '9223372036854775807',
        eventSequence: '9223372036854775807',
      },
      commandBinding: { ...context.commandBinding, simTime: '9'.repeat(120) },
    };
    expect(parseIndustryPersistenceSchemaBoundaryContext(value)).toEqual(value);
  });
});

describe('strict schema pairs, never admission', () => {
  it.each(['RESERVE', 'RELEASE', 'SHIP', 'DELIVER'])(
    'recognizes movement %s as data only',
    (operation) => {
      expect(
        classifyInventoryPersistenceSchemaPair({
          schemaVersion: 'inventory-posting-v1',
          operation,
        }),
      ).toEqual({
        status: 'SCHEMA_PAIR_RECOGNIZED_NOT_ADMITTED',
        family: 'V08_MOVEMENT',
      });
    },
  );
  it('recognizes production as frozen data only', () => {
    const result = classifyInventoryPersistenceSchemaPair({
      schemaVersion: 'inventory-production-consumption-v1',
      operation: 'PRODUCE_AND_CONSUME',
    });
    expect(result).toEqual({
      status: 'SCHEMA_PAIR_RECOGNIZED_NOT_ADMITTED',
      family: 'INDUSTRY_PRODUCTION',
    });
    expect(Object.isFrozen(result)).toBe(true);
  });
  it.each([
    { schemaVersion: 'inventory-posting-v1', operation: 'PRODUCE_AND_CONSUME' },
    {
      schemaVersion: 'inventory-production-consumption-v1',
      operation: 'RESERVE',
    },
    { schemaVersion: 'unknown', operation: 'PRODUCE_AND_CONSUME' },
    { schemaVersion: 'inventory-production-consumption-v1' },
    { operation: 'PRODUCE_AND_CONSUME' },
    {
      schemaVersion: 'inventory-posting-v1',
      operation: 'RESERVE',
      admitted: true,
    },
  ])('refuses mixed, unknown or nonclosed pair %#', (value) => {
    expect(() => classifyInventoryPersistenceSchemaPair(value)).toThrow();
  });
});

describe('actual canonical group binding', () => {
  it.each([
    ['2', '2'],
    ['3', '3'],
    ['10', '20'],
    ['9223372036854775807', '9223372036854775807'],
  ])(
    'accepts historical T<=H at %s/%s without H+1/current-use checks',
    (wv, seq) => {
      const f = fixture('read', wv, seq);
      expect(f.command.expectedWorldVersion).toBe('1');
      const result = assertIndustryPersistenceSchemaBoundaryMatchesActual(
        f.input,
        sha256,
      );
      expect(result).toEqual(matched);
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(f.input)).toBe(false);
    },
  );
  it('accepts a real fresh next transition, still NOT_ADMITTED', () => {
    expect(
      assertIndustryPersistenceSchemaBoundaryMatchesActual(
        fixture('commit', '1', '1').input,
        sha256,
      ),
    ).toEqual(matched);
  });
  it.each([
    ['1', '1'],
    ['1', '3'],
    ['3', '1'],
    ['2', '3'],
    ['3', '2'],
  ])('rejects future or crossed historical H %s/%s', (wv, seq) => {
    expect(() => match(fixture('read', wv, seq).input)).toThrow();
  });
  it.each(['actualHeldHead', 'actualTarget', 'actualBuild'] as const)(
    'compares independently supplied %s',
    (key) => {
      const f = fixture();
      const delta =
        key === 'actualHeldHead'
          ? { ...f.input[key], worldVersion: '3' }
          : key === 'actualTarget'
            ? { ...target, databaseIdentityRef: 'OTHER_DATABASE' }
            : { ...build, decoderBuildSHA256: 'd'.repeat(64) };
      expect(() => match({ ...f.input, [key]: delta })).toThrow();
    },
  );
  it('rejects unrelated actual World and closed-input extras', () => {
    const f = fixture();
    expect(() =>
      match({
        ...f.input,
        actualHeldHead: { ...f.input.actualHeldHead, worldId: 'OTHER_WORLD' },
      }),
    ).toThrow();
    expect(() => match({ ...f.input, admitted: true })).toThrow();
  });
  it.each(['commandId', 'commandFingerprint', 'simTime'] as const)(
    'binds fresh %s',
    (key) => {
      const f = fixture('commit', '1', '1');
      const c = f.context as IndustryPersistenceSchemaCommitContextV1;
      const value =
        key === 'commandId'
          ? 'OTHER_COMMAND'
          : key === 'simTime'
            ? '1001'
            : `sha256:${'d'.repeat(64)}`;
      expect(() =>
        match({
          ...f.input,
          context: {
            ...c,
            commandBinding: { ...c.commandBinding, [key]: value },
          },
        }),
      ).toThrow();
    },
  );
  it.each([
    ['2', '2'],
    ['1', '0'],
    ['0', '1'],
  ])('fresh cannot reuse historical or nonnext H %s/%s', (wv, seq) => {
    expect(() => match(fixture('commit', wv, seq).input)).toThrow();
  });
  it('validates actual Command fingerprint and expected version, not a matching header alone', () => {
    const f = fixture();
    expect(() =>
      match({
        ...f.input,
        command: { ...f.command, fingerprint: `sha256:${'d'.repeat(64)}` },
      }),
    ).toThrow();
    const wire = JSON.parse(canonicalSerialize(f.command)) as Record<
      string,
      unknown
    >;
    const { canonicalPayload, ...rest } = wire;
    delete rest.fingerprint;
    delete rest.payloadHash;
    const command = parseCanonicalCommand(
      {
        ...rest,
        payload: JSON.parse(canonicalPayload as string),
        expectedWorldVersion: null,
      },
      sha256,
    );
    const transition = createAuthoritativeTransition({
      command,
      worldVersionBefore: '1',
      worldVersionAfter: '2',
      events: f.transition.events,
    });
    expect(() => match({ ...f.input, command, transition })).toThrow();
  });
  it('rejects a valid rehashed Event with different SimTime from its Command', () => {
    const f = fixture();
    const wire = JSON.parse(
      canonicalSerialize(f.transition.events[0]),
    ) as Record<string, unknown>;
    const { canonicalPayload, ...rest } = wire;
    delete rest.fingerprint;
    delete rest.payloadHash;
    const event = parseAuthoritativeEvent(
      {
        ...rest,
        payload: JSON.parse(canonicalPayload as string),
        simTime: '1001',
      },
      sha256,
    );
    const transition = createAuthoritativeTransition({
      command: f.command,
      worldVersionBefore: '1',
      worldVersionAfter: '2',
      events: [event],
    });
    expect(() => match({ ...f.input, transition })).toThrow(/SimTime/);
  });
  it('rejects corrupted Event evidence and incomplete/noncanonical transition objects', () => {
    const f = fixture();
    for (const transition of [
      {
        ...f.transition,
        events: [
          {
            ...f.transition.events[0],
            fingerprint: `sha256:${'d'.repeat(64)}`,
          },
        ],
      },
      { ...f.transition, eventIds: [] },
      { ...f.transition, events: [] },
      { ...f.transition, extra: 'x' },
      { ...f.transition, worldVersionAfter: '3' },
    ])
      expect(() => match({ ...f.input, transition })).toThrow();
  });
  it.each([
    'worldId',
    'causationCommandId',
    'postingId',
    'fingerprint',
    'worldVersionBefore',
    'worldVersionAfter',
    'schemaVersion',
    'operation',
  ] as const)('validates posting identity %s', (key) => {
    const f = fixture();
    const value =
      key === 'worldVersionBefore'
        ? '0'
        : key === 'worldVersionAfter'
          ? '3'
          : key === 'fingerprint'
            ? 'invalid'
            : key === 'postingId'
              ? 'lowercase'
              : 'OTHER';
    expect(() =>
      match({
        ...f.input,
        postingIdentities: [{ ...f.identity, [key]: value }],
      }),
    ).toThrow();
  });
  it('requires complete dense unique production-bearing identity data and bounded count', () => {
    const f = fixture();
    const movement = {
      ...f.identity,
      schemaVersion: 'inventory-posting-v1',
      operation: 'RESERVE',
      postingId: 'MOVEMENT_POSTING',
      fingerprint: `sha256:${'d'.repeat(64)}`,
    };
    expect(
      match({ ...f.input, postingIdentities: [f.identity, movement] }),
    ).toEqual(matched);
    for (const postingIdentities of [
      [],
      [movement],
      [f.identity, f.identity],
      [f.identity, { ...movement, fingerprint: f.identity.fingerprint }],
      [f.identity, { ...movement, postingId: f.identity.postingId }],
      [{ ...f.identity, extra: 'x' }],
      new Array(1),
      Array.from({ length: 10001 }, () => f.identity),
    ])
      expect(() => match({ ...f.input, postingIdentities })).toThrow();
  });
  it('accepts the full 10000 identity capacity without truncation', () => {
    const f = fixture();
    const postingIdentities = Array.from({ length: 10000 }, (_, i) => ({
      ...f.identity,
      postingId: `POSTING_${i}`,
      fingerprint: `sha256:${i.toString(16).padStart(64, '0')}`,
    }));
    expect(match({ ...f.input, postingIdentities })).toEqual(matched);
    const end = [...postingIdentities];
    end[9999] = { ...end[9999]!, worldVersionAfter: '3' };
    expect(() => match({ ...f.input, postingIdentities: end })).toThrow();
  });
  it('binds complete multi-Event groups rather than imposing the D fresh-mode subset rule', () => {
    const f = fixture('commit', '1', '1');
    const wire = JSON.parse(
      canonicalSerialize(f.transition.events[0]),
    ) as Record<string, unknown>;
    const { canonicalPayload, ...rest } = wire;
    delete rest.fingerprint;
    delete rest.payloadHash;
    const second = parseAuthoritativeEvent(
      {
        ...rest,
        payload: JSON.parse(canonicalPayload as string),
        eventId: 'SECOND_EVENT_TEST',
        sequence: '3',
      },
      sha256,
    );
    const transition = createAuthoritativeTransition({
      command: f.command,
      worldVersionBefore: '1',
      worldVersionAfter: '2',
      events: [...f.transition.events, second],
    });
    expect(match({ ...f.input, transition })).toEqual(matched);
    expect(match({ ...fixture('read', '2', '3').input, transition })).toEqual(
      matched,
    );
    expect(() =>
      match({ ...fixture('read', '2', '2').input, transition }),
    ).toThrow();
    const gap = parseAuthoritativeEvent(
      {
        ...rest,
        payload: JSON.parse(canonicalPayload as string),
        eventId: 'THIRD_EVENT_TEST',
        sequence: '4',
      },
      sha256,
    );
    expect(() =>
      match({
        ...f.input,
        transition: {
          ...transition,
          events: [f.transition.events[0], gap],
          eventIds: [f.transition.eventIds[0], gap.eventId],
        },
      }),
    ).toThrow();
  });
  it('rejects nested accessors without invoking them', () => {
    const f = fixture();
    let calls = 0;
    const getter = () => {
      calls++;
      return '2';
    };
    const transition = Object.defineProperty(
      { ...f.transition },
      'worldVersionAfter',
      { get: getter },
    );
    const posting = Object.defineProperty({ ...f.identity }, 'fingerprint', {
      get: getter,
    });
    expect(() => match({ ...f.input, transition })).toThrow();
    expect(() => match({ ...f.input, postingIdentities: [posting] })).toThrow();
    expect(calls).toBe(0);
  });
});

describe('existing refusal and additive exports', () => {
  it('does not change production admission even after successful parse/classify/match', () => {
    const f = fixture();
    expect(match(f.input)).toEqual(matched);
    expect(() =>
      assertInventoryPersistenceSchemaAdmitted([f.posting]),
    ).toThrow();
  });
  it('preserves the production admission guard and every base root export byte', () => {
    const base = 'bf4a3f558d6aaa5f2d522ae3d6f77bc9cf0ed9c2';
    const original = (path: string) =>
      execFileSync('git', ['show', `${base}:${path}`], { encoding: 'utf8' });
    const guardPath =
      'packages/core/src/inventory/production-consumption-posting.ts';
    // Funding now also recognizes a fully proven original bank deposit. That
    // additive data validation must not activate production schema admission.
    const declaration =
      'export function assertInventoryPersistenceSchemaAdmitted(';
    const actualGuard = readFileSync(guardPath, 'utf8');
    expect(actualGuard).toContain(declaration);
    expect(actualGuard.slice(actualGuard.indexOf(declaration))).toBe(
      original(guardPath).slice(original(guardPath).indexOf(declaration)),
    );
    const oldIndex = original('packages/core/src/index.ts');
    const actualIndex = readFileSync('packages/core/src/index.ts', 'utf8');
    expect(actualIndex.startsWith(oldIndex)).toBe(true);
    const addition = actualIndex.slice(oldIndex.length);
    expect(addition).toContain('industry-persistence-boundary-contract.js');
    expect(addition).not.toContain('export *');
  });
});
