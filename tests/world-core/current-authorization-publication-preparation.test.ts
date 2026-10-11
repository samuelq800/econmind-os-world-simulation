import { describe, expect, it } from 'vitest';
import { OFFICE_DEFINITIONS } from '../../packages/core/src/authorization/offices.js';
import { PostgresTransactionError } from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import {
  canonicalVersion,
  parseAuthorizationSourceBytes,
  sha256,
} from '../../apps/world-worker/src/preparation/current-authorization-source-contract.js';
import {
  classifyAuthorizationPublicationFailure,
  compareAuthorizationPublicationReadback,
  createUnregisteredAuthorizationPublicationPreparation,
  planAuthorizationReplacement,
} from '../../apps/world-worker/src/preparation/current-authorization-publication-preparation.js';
import {
  sourceBytes,
  TEST_COUNTRIES,
  TEST_NOW,
} from '../support/current-authorization-preparation-fixture.js';

const initial = () => ({
  ...sourceBytes(),
  rows: [],
  checkpoint: null,
  headVersion: '0',
  countryIds: TEST_COUNTRIES,
  observedAtReal: TEST_NOW,
});
describe('authorization mechanical preparation — no authority', () => {
  it('product apply/readback always refuse arbitrary registered/approved/resolver DTOs without a database', () => {
    const entry = createUnregisteredAuthorizationPublicationPreparation();
    const poison = new Proxy(
      {},
      {
        get() {
          throw Error('must never inspect authority DTO');
        },
      },
    );
    for (const request of [
      null,
      true,
      { approved: true, isWorldAdmin: true },
      poison,
      sourceBytes(),
    ]) {
      expect(entry.apply(request)).toEqual({
        status: 'AUTHORIZATION_SOURCE_NOT_REGISTERED',
        retryable: false,
      });
      expect(entry.readback(request)).toEqual(entry.apply(request));
    }
    expect(Object.isFrozen(entry)).toBe(true);
  });
  it('parser validates exact immutable bytes but labels them untrusted, not a source registration', () => {
    const input = sourceBytes();
    const parsed = parseAuthorizationSourceBytes(
      input.rawBytes,
      input.expectedSha256,
    );
    expect(parsed.classification).toBe('UNTRUSTED_PARSED_DATA_NOT_AUTHORITY');
    expect(parsed.sourceRegistrationId).toBe('TEST_ONLY_NOT_REGISTERED');
    expect(Object.isFrozen(parsed.grants[0])).toBe(true);
    expect(() =>
      parseAuthorizationSourceBytes(input.rawBytes, 'sha256:' + '0'.repeat(64)),
    ).toThrow('BYTES');
    expect(() =>
      parseAuthorizationSourceBytes({}, input.expectedSha256),
    ).toThrow('BYTES');
  });
  it('rejects duplicate/unknown keys, alias JSON, huge bytes, invalid schema/cutoff, UUID and times', () => {
    const raw = sourceBytes().rawBytes;
    for (const bytes of [
      ' ' + raw,
      raw.replace('{', '{"operationId":"DUP",'),
      raw + '\n',
    ]) {
      expect(() => parseAuthorizationSourceBytes(bytes, sha256(bytes))).toThrow(
        'CANONICAL',
      );
    }
    for (const override of [
      { approved: true },
      { sourceSchemaVersion: 'fake' },
      { schemaVersion: 'v2' },
      { cutoffProtocol: 'REMOTE_TRUE' },
      { authSubject: 'NOT_UUID' },
      { sourceRevision: 'bad|frame' },
      { expiresAtReal: '2026-02-30T00:00:00.000Z' },
      { expiresAtReal: '2026-10-10T00:00:00.000Z' },
    ]) {
      const input = sourceBytes('TEST_ONLY_REV_1', null, [], override);
      expect(() =>
        parseAuthorizationSourceBytes(input.rawBytes, input.expectedSha256),
      ).toThrow();
    }
    const huge = 'x'.repeat(65537);
    expect(() => parseAuthorizationSourceBytes(huge, sha256(huge))).toThrow(
      'BYTES',
    );
  });
  it('uses canonical nonnegative bigint versions, not floats/rounding/leading-zero aliases', () => {
    expect(canonicalVersion('9223372036854775807')).toBe('9223372036854775807');
    for (const version of ['-1', '01', '1.0', '9223372036854775808', 1, NaN])
      expect(() => canonicalVersion(version)).toThrow('VERSION');
  });
  it('accepts all18 explicit existing Office pairs, never grants a default bundle', () => {
    const grants = Object.entries(OFFICE_DEFINITIONS).flatMap(
      ([officeId, office]) =>
        office.capabilities.map((capability) => ({ officeId, capability })),
    );
    const plan = planAuthorizationReplacement({
      ...initial(),
      ...sourceBytes('TEST_ONLY_REV_1', null, [], { grants }),
    });
    expect(plan.rows).toHaveLength(18);
    expect(plan.rows.every((r) => r.active)).toBe(true);
    expect(plan.classification).toBe('UNTRUSTED_PLAN_NOT_AUTHORITY');
    expect(planAuthorizationReplacement(initial()).rows).toHaveLength(1);
  });
  it.each([
    [{ officeId: 'CAPTAIN', capability: 'TRADE_POLICY' }],
    [{ officeId: 'TRADE', capability: 'SIGN_OFFICE_APPROVAL' }],
    [{ officeId: '*', capability: '*' }],
    [
      { officeId: 'CAPTAIN', capability: 'CAPTAIN_STRATEGY' },
      { officeId: 'CAPTAIN', capability: 'CAPTAIN_STRATEGY' },
    ],
  ])('rejects unsupported/duplicate/wildcard Office input %j', (...grants) => {
    const input = sourceBytes('TEST_ONLY_REV_1', null, [], { grants });
    expect(() =>
      parseAuthorizationSourceBytes(input.rawBytes, input.expectedSha256),
    ).toThrow();
  });
  it('replaces complete subject including inactive/omitted keys with new revision/country/team', () => {
    const first = planAuthorizationReplacement(initial());
    const input = sourceBytes(
      'TEST_ONLY_REV_2',
      'TEST_ONLY_REV_1',
      first.rows,
      {
        countryId: TEST_COUNTRIES[1],
        teamId: 'TEAM_AUTHZ_TEST_B',
        grants: [{ officeId: 'SOCIAL', capability: 'SOCIAL_LABOUR' }],
      },
    );
    const next = planAuthorizationReplacement({
      ...initial(),
      ...input,
      rows: first.rows,
      checkpoint: first.checkpoint,
    });
    expect(next.rows).toHaveLength(2);
    expect(next.rows.filter((r) => r.active)).toMatchObject([
      { countryId: TEST_COUNTRIES[1], teamId: 'TEAM_AUTHZ_TEST_B' },
    ]);
    expect(
      next.rows.every((r) => r.authorizationVersion === 'TEST_ONLY_REV_2'),
    ).toBe(true);
    expect(next.rows.find((r) => !r.active)?.teamId).toBe('TEAM_AUTHZ_TEST_A');
    const restored = planAuthorizationReplacement({
      ...initial(),
      ...sourceBytes('TEST_ONLY_REV_3', 'TEST_ONLY_REV_2', next.rows),
      rows: next.rows,
      checkpoint: next.checkpoint,
    });
    expect(restored.rows.find((r) => r.officeId === 'CAPTAIN')?.active).toBe(
      true,
    );
    expect(restored.rows.find((r) => r.officeId === 'SOCIAL')?.active).toBe(
      false,
    );
  });
  it('empty revoke has exact derived checkpoint without invented Office/tombstone', () => {
    const plan = planAuthorizationReplacement({
      ...initial(),
      ...sourceBytes('TEST_ONLY_REV_1', null, [], {
        operation: 'REVOKE',
        grants: [],
      }),
    });
    expect(plan.rows).toEqual([]);
    expect(plan.checkpoint.sourceRevision).toBe('TEST_ONLY_REV_1');
    expect(Object.keys(plan.checkpoint)).not.toContain('active');
    expect(Object.keys(plan.checkpoint)).not.toContain('grants');
  });
  it('requires existing H, complete scoped rows/catalog, predecessor and exact before/head CAS', () => {
    const first = planAuthorizationReplacement(initial());
    expect(() =>
      planAuthorizationReplacement({ ...initial(), headVersion: null }),
    ).toThrow('HEAD_MISSING');
    expect(() =>
      planAuthorizationReplacement({ ...initial(), headVersion: '1' }),
    ).toThrow('CAS');
    expect(() =>
      planAuthorizationReplacement({ ...initial(), rows: first.rows }),
    ).toThrow('PREDECESSOR_UNESTABLISHED');
    expect(() =>
      planAuthorizationReplacement({ ...initial(), countryIds: [] }),
    ).toThrow('CATALOG');
    expect(() =>
      planAuthorizationReplacement({
        ...initial(),
        rows: [{ ...first.rows[0]!, worldId: 'OTHER' }],
      }),
    ).toThrow('IDENTITY');
    expect(() =>
      planAuthorizationReplacement({
        ...initial(),
        rows: [
          {
            ...first.rows[0]!,
            capability: 'SIGN_OFFICE_APPROVAL',
            active: false,
          },
        ],
      }),
    ).toThrow('CAPABILITY');
    expect(() =>
      planAuthorizationReplacement({
        ...initial(),
        checkpoint: {
          ...first.checkpoint,
          authSubject: '00000000-0000-4000-8000-000000000013',
        },
      }),
    ).toThrow('IDENTITY');
  });
  it('exact retry preserves original operation/bytes/arguments and metadata even after economic head advance', () => {
    const first = planAuthorizationReplacement(initial());
    const exact = planAuthorizationReplacement({
      ...initial(),
      rows: first.rows,
      checkpoint: first.checkpoint,
      headVersion: '7',
    });
    expect(exact.action).toBe('EXISTING_METADATA_ONLY');
    expect(exact.checkpoint).toEqual(first.checkpoint);
    const changed = sourceBytes('TEST_ONLY_REV_1', null, [], {
      issuer: 'CHANGED_BYTES',
    });
    expect(() =>
      planAuthorizationReplacement({
        ...initial(),
        ...changed,
        rows: first.rows,
        checkpoint: first.checkpoint,
      }),
    ).toThrow('CONFLICT');
    expect(() =>
      planAuthorizationReplacement({
        ...initial(),
        request: { ...sourceBytes().request, expectedWorldVersion: '7' },
      }),
    ).toThrow('MISMATCH');
  });
  it('readback never upgrades C/A match to real current-source or original COMMIT-ACK proof', () => {
    const first = planAuthorizationReplacement(initial());
    const read = {
      ...initial(),
      rows: first.rows,
      checkpoint: first.checkpoint,
    };
    expect(compareAuthorizationPublicationReadback(read)).toBe(
      'METADATA_MATCH_REAL_SOURCE_REQUIRED',
    );
    expect(
      compareAuthorizationPublicationReadback({ ...read, checkpoint: null }),
    ).toBe('CURRENT_MATCH_ONLY_UNKNOWN_STOP');
    expect(
      compareAuthorizationPublicationReadback({
        ...read,
        checkpoint: { ...first.checkpoint, operationId: 'LATER' },
      }),
    ).toBe('SUPERSEDED_OR_CONFLICT_UNKNOWN_STOP');
    expect(() =>
      compareAuthorizationPublicationReadback({
        ...read,
        observedAtReal: '2026-10-11T00:00:00.000Z',
      }),
    ).toThrow('EXPIRED');
  });
  it('COMMIT/rollback-unconfirmed/cleanup/unknown failures never silently retry', () => {
    for (const outcome of [
      'COMMIT_OUTCOME_UNKNOWN',
      'ROLLBACK_UNCONFIRMED',
    ] as const)
      expect(
        classifyAuthorizationPublicationFailure(
          new PostgresTransactionError({ outcome, cause: Error('TEST_ONLY') }),
        ),
      ).toEqual({
        status: 'AUTHORIZATION_WRITE_OUTCOME_UNKNOWN',
        retryable: false,
      });
    expect(classifyAuthorizationPublicationFailure(Error('cleanup'))).toEqual({
      status: 'AUTHORIZATION_WRITE_OUTCOME_UNKNOWN',
      retryable: false,
    });
    for (const outcome of ['ROLLED_BACK', 'NOT_STARTED'] as const)
      expect(
        classifyAuthorizationPublicationFailure(
          new PostgresTransactionError({ outcome, cause: Error('TEST_ONLY') }),
        ).status,
      ).toBe('REJECTED_CONFIRMED_NO_CHANGE');
  });
});
