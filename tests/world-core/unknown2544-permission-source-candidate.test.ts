import { describe, expect, it } from 'vitest';
import {
  buildB16PermissionMap,
  inspectB16PermissionSourceCandidate,
  parseB16PermissionTarget,
} from '../../apps/world-worker/src/preparation/unknown2544-permission-source-candidate.js';
import { sha256 } from '../../apps/world-worker/src/preparation/current-authorization-source-contract.js';
import {
  sourceBytes,
  TEST_NOW,
  TEST_SUBJECT,
} from '../support/current-authorization-preparation-fixture.js';
import { OFFICE_DEFINITIONS } from '../../packages/core/src/authorization/offices.js';

const target = (country = '01', kind: string | null = null) => ({
  stableId: `U2544::${kind ? 'ENTITY' : 'COUNTRY'}::${kind ? `ENTITY_${kind}_${country}` : `COUNTRY_${country}`}::${kind ? 'currentPermission' : 'discretionaryAuthorization'}`,
  scope: kind ? 'ENTITY' : 'COUNTRY',
  ownerId: kind ? `ENTITY_${kind}_${country}` : `COUNTRY_${country}`,
  countryId: `COUNTRY_${country}`,
  missingField: kind ? 'currentPermission' : 'discretionaryAuthorization',
});
const targets = () =>
  Array.from({ length: 70 }, (_, i) => String(i + 1).padStart(2, '0')).flatMap(
    (country) =>
      [
        null,
        'GOVERNMENT',
        'OPERATOR',
        'HOUSEHOLDS',
        'BANK',
        'CENTRAL_BANK',
      ].map((kind) => target(country, kind)),
  );
const expected = () => ({
  worldId: 'WORLD_AUTHZ_TEST_DEFAULT',
  worldVersion: '0',
  countryId: 'COUNTRY_01',
  authSubject: TEST_SUBJECT,
  teamId: 'TEAM_AUTHZ_TEST_A',
  officeId: 'CAPTAIN',
  capability: 'CAPTAIN_STRATEGY',
  authorizationRevision: 'TEST_ONLY_REV_1',
});
function proposed(overrides: Record<string, unknown> = {}) {
  const source = sourceBytes('TEST_ONLY_REV_1', null, [], {
    countryId: 'COUNTRY_01',
    ...overrides,
  });
  return {
    target: target(),
    rawBytes: source.rawBytes,
    expectedSha256: source.expectedSha256,
    expected: expected(),
    observedAtReal: TEST_NOW,
  };
}
const deny = (
  value: ReturnType<typeof inspectB16PermissionSourceCandidate>,
) => {
  expect(value).toMatchObject({
    batchId: 'B16',
    status: 'PENDING_ROSTER',
    originalFieldStatus: 'UNKNOWN',
    originalFieldValue: null,
    permissionGranted: false,
    sourceAdmitted: false,
    runtimeConnected: false,
    productionAuthority: false,
    currentnessVerified: false,
    entityOfficeAssignment: null,
  });
};

describe('B16 original field mapping and source parsing — no roster or authority', () => {
  it('maps the exact420 canonical original field slots without granting any entity an Office', () => {
    const rows = buildB16PermissionMap(targets());
    expect(rows).toHaveLength(420);
    expect(new Set(rows.map((r) => r.stableId)).size).toBe(420);
    expect(
      rows.filter((r) => r.missingField === 'currentPermission'),
    ).toHaveLength(350);
    expect(
      rows.filter((r) => r.missingField === 'discretionaryAuthorization'),
    ).toHaveLength(70);
    for (const row of rows)
      expect(row).toMatchObject({
        status: 'PENDING_ROSTER',
        permissionGranted: false,
        entityOfficeAssignment: null,
      });
  });
  it('retains original identities at country01/70 and central-bank/operator endpoints', () => {
    for (const row of [
      target(),
      target('70'),
      target('01', 'OPERATOR'),
      target('70', 'CENTRAL_BANK'),
    ])
      expect(parseB16PermissionTarget(row)).toMatchObject(row);
  });
  it('rejects duplicated IDs instead of deduplicating into apparent coverage', () => {
    const rows = targets();
    rows[419] = rows[0]!;
    expect(() => buildB16PermissionMap(rows)).toThrow('DUPLICATE');
  });
  it('rejects incomplete sets instead of treating a subset as B16 complete', () => {
    expect(() => buildB16PermissionMap(targets().slice(1))).toThrow(
      'INCOMPLETE',
    );
  });
  it('rejects non-original country, entity and stable ID variants', () => {
    for (const row of [
      target('00'),
      target('71'),
      target('1'),
      target('01', 'FINANCE'),
      { ...target(), stableId: 'B16::COUNTRY_01' },
    ])
      expect(() => parseB16PermissionTarget(row)).toThrow();
  });
  it('rejects cross-country ownership and mismatched fields/scopes', () => {
    for (const row of [
      { ...target('01', 'BANK'), countryId: 'COUNTRY_02' },
      { ...target(), ownerId: 'COUNTRY_02' },
      { ...target(), scope: 'ENTITY' },
      { ...target(), missingField: 'availableNativeCash' },
    ])
      expect(() => parseB16PermissionTarget(row)).toThrow();
  });
  it('accepts only the five ledger identity columns and rejects caller-granted flags', () => {
    for (const row of [
      { ...target(), approved: true },
      { ...target(), scope: true },
      null,
      [],
    ])
      expect(() => parseB16PermissionTarget(row)).toThrow();
  });
  it('missing real source is explicit PENDING_ROSTER/default deny, not a fabricated subject or zero', () => {
    const value = inspectB16PermissionSourceCandidate({
      ...proposed(),
      rawBytes: null,
      expectedSha256: null,
      expected: null,
    });
    deny(value);
    expect(value.inspection).toBe('SOURCE_ABSENT');
    expect(value.candidate).toBeNull();
  });
  it('well-formed TEST_ONLY proposed source still cannot establish current permission', () => {
    const value = inspectB16PermissionSourceCandidate(proposed());
    deny(value);
    expect(value.inspection).toBe('CANDIDATE_WELL_FORMED_NOT_CURRENT');
    expect(value.candidate?.sourceRevision).toBe('TEST_ONLY_REV_1');
  });
  it('a source without expected binding cannot infer a subject/team/Office from candidate bytes', () => {
    const value = inspectB16PermissionSourceCandidate({
      ...proposed(),
      expected: null,
    });
    deny(value);
    expect(value.inspection).toBe('EXPECTED_SCOPE_ABSENT');
  });
  it('uses the existing byte-pinned canonical parser, including duplicate JSON member refusal', () => {
    const input = proposed();
    expect(() =>
      inspectB16PermissionSourceCandidate({
        ...input,
        expectedSha256: 'sha256:' + '0'.repeat(64),
      }),
    ).toThrow();
    for (const rawBytes of [
      ' ' + input.rawBytes,
      input.rawBytes.replace('{', '{"operationId":"DUP",'),
    ])
      expect(() =>
        inspectB16PermissionSourceCandidate({
          ...input,
          rawBytes,
          expectedSha256: sha256(rawBytes),
        }),
      ).toThrow('CANONICAL');
  });
  it('rejects expired source at the exact expiry boundary', () => {
    expect(() =>
      inspectB16PermissionSourceCandidate({
        ...proposed(),
        observedAtReal: '2026-10-11T00:00:00.000Z',
      }),
    ).toThrow('EXPIRED');
  });
  it('rejects not-yet-effective source with an injected deterministic time, no device clock', () => {
    expect(() =>
      inspectB16PermissionSourceCandidate({
        ...proposed(),
        observedAtReal: '2026-10-09T00:00:00.000Z',
      }),
    ).toThrow('NOT_EFFECTIVE');
  });
  it('explicit revoke stays denied and cannot be treated as an active empty assignment', () => {
    const value = inspectB16PermissionSourceCandidate(
      proposed({ operation: 'REVOKE', grants: [] }),
    );
    deny(value);
    expect(value.inspection).toBe('CANDIDATE_REVOKED');
  });
  it('rejects repeated grants rather than dropping duplicates', () => {
    expect(() =>
      inspectB16PermissionSourceCandidate(
        proposed({
          grants: [
            { officeId: 'CAPTAIN', capability: 'CAPTAIN_STRATEGY' },
            { officeId: 'CAPTAIN', capability: 'CAPTAIN_STRATEGY' },
          ],
        }),
      ),
    ).toThrow('GRANTS_INVALID');
  });
  it('wrong Office/capability pair cannot be inferred from an entity or title', () => {
    expect(() =>
      inspectB16PermissionSourceCandidate(
        proposed({
          grants: [{ officeId: 'CAPTAIN', capability: 'FINANCE_BUDGET' }],
        }),
      ),
    ).toThrow('CAPABILITY_INVALID');
  });
  it('rejects foreign source country and foreign expected country against the original target', () => {
    expect(() =>
      inspectB16PermissionSourceCandidate(
        proposed({ countryId: 'COUNTRY_02' }),
      ),
    ).toThrow('SCOPE_MISMATCH');
    expect(() =>
      inspectB16PermissionSourceCandidate({
        ...proposed(),
        expected: { ...expected(), countryId: 'COUNTRY_02' },
      }),
    ).toThrow('SCOPE_MISMATCH');
  });
  it('rejects World/head mismatch instead of accepting stale scope comparison', () => {
    for (const change of [
      { worldId: 'WORLD_OTHER' },
      { expectedWorldVersion: '1' },
    ])
      expect(() =>
        inspectB16PermissionSourceCandidate(proposed(change)),
      ).toThrow('SCOPE_MISMATCH');
  });
  it('rejects subject, team or authorization revision changes', () => {
    for (const change of [
      { authSubject: '00000000-0000-4000-8000-000000000099' },
      { teamId: 'TEAM_OTHER' },
      { sourceRevision: 'TEST_ONLY_REV_2' },
    ])
      expect(() =>
        inspectB16PermissionSourceCandidate(proposed(change)),
      ).toThrow('SCOPE_MISMATCH');
  });
  it('does not convert invalid comparison data into authority', () => {
    for (const change of [
      { authSubject: 'NPC' },
      { teamId: 'bad team' },
      { worldVersion: '01' },
      { authorizationRevision: '' },
    ])
      expect(() =>
        inspectB16PermissionSourceCandidate({
          ...proposed(),
          expected: { ...expected(), ...change },
        }),
      ).toThrow();
  });
  it('all six existing Office domains stay explicit and no wildcard grants are accepted', () => {
    for (const [officeId, office] of Object.entries(OFFICE_DEFINITIONS)) {
      const capability = office.capabilities[0];
      const value = inspectB16PermissionSourceCandidate({
        ...proposed({ grants: [{ officeId, capability }] }),
        expected: { ...expected(), officeId, capability },
      });
      deny(value);
      expect(value.inspection).toBe('CANDIDATE_WELL_FORMED_NOT_CURRENT');
    }
    for (const change of [
      { officeId: '*', capability: '*' },
      { officeId: 'CAPTAIN', capability: 'FINANCE_BUDGET' },
    ])
      expect(() =>
        inspectB16PermissionSourceCandidate({
          ...proposed(),
          expected: { ...expected(), ...change },
        }),
      ).toThrow();
    expect(() =>
      inspectB16PermissionSourceCandidate({
        ...proposed(),
        expected: {
          ...expected(),
          officeId: 'FINANCE',
          capability: 'FINANCE_BUDGET',
        },
      }),
    ).toThrow('CAPABILITY_ABSENT');
  });
  it('freezes result and chain without returning an authorized context, principal or commit proof', () => {
    const value = inspectB16PermissionSourceCandidate(proposed());
    deny(value);
    for (const part of [value, value.chain, value.candidate])
      expect(Object.isFrozen(part)).toBe(true);
    for (const key of [
      'principal',
      'authorization',
      'commitProof',
      'grants',
      'resolver',
    ])
      expect(value).not.toHaveProperty(key);
  });
  it('mapping order is deterministic independent of input order; only original IDs are returned', () => {
    expect(buildB16PermissionMap(targets().reverse())).toEqual(
      buildB16PermissionMap(targets()),
    );
  });
  it('never accepts schema/approval flags as source registration or real roster evidence', () => {
    for (const change of [
      { approved: true },
      { schemaVersion: 'registered' },
      { sourceRegistrationId: '' },
    ])
      expect(() =>
        inspectB16PermissionSourceCandidate(proposed(change)),
      ).toThrow();
  });
});
