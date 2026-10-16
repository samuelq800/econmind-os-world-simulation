/** Test-only SQL read-context proof, not a model/admission/economic execution. */
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import {
  WORLD_V2_ENTITLED_PROJECTION_QUERY,
  type ParameterizedPgReadRequest,
} from '../../apps/world-api/src/integration/postgres-read-adapter.js';
import { parseSupabaseAuthSubject } from '../../apps/world-api/src/integration/identity.js';
import {
  createTestOnlyPersistedReadContextFixture,
  protocolFixtureLifecycle,
  type TestOnlyPersistedReadContextFixture,
} from '../support/test-only-persisted-read-context-fixture.js';
import {
  DECISION_TEST_WORLD,
  DECISION_TEST_COUNTRY,
  DECISION_TEST_SUBJECT,
  DECISION_TEST_REVISION,
  decisionTestOfficeScope,
  readPersistedDecisionTestRow,
} from '../support/office-decision-result-persisted-read-fixture.js';

const offices = [
  'CAPTAIN',
  'CENTRAL_BANK',
  'FINANCE',
  'INDUSTRY',
  'SOCIAL',
  'TRADE',
] as const;
const AT = '2026-10-08T00:00:00.000Z';
const before = protocolFixtureLifecycle();
const live: Readonly<TestOnlyPersistedReadContextFixture>[] = [];
afterEach(async () => {
  for (const f of live.splice(0)) await f.close();
});
afterAll(() => {
  const actual = protocolFixtureLifecycle();
  expect(actual.created - before.created).toBe(7);
  expect(actual.closed - before.closed).toBe(7);
  expect(actual.open).toBe(0);
  expect(actual.peakOpen).toBe(1);
});
function query(
  scope: string,
  subject = DECISION_TEST_SUBJECT,
): ParameterizedPgReadRequest {
  return {
    text: WORLD_V2_ENTITLED_PROJECTION_QUERY,
    values: [subject, DECISION_TEST_WORLD, 'OFFICE_PRIVATE', scope, '0', '0'],
    verifiedAuthSubject: subject,
  };
}

describe('owned SQL decision-result context finite Office profiles', () => {
  it.each(offices)(
    '%s derives real context and denies other Office/subject and stale capability',
    async (office) => {
      const f = await createTestOnlyPersistedReadContextFixture({
        decisionOffice: office,
      });
      live.push(f);
      await f.publishContext();
      const scope = decisionTestOfficeScope(office);
      const otherScope = decisionTestOfficeScope(
        office === 'CAPTAIN' ? 'TRADE' : 'CAPTAIN',
      );
      // Bare JSON is sufficient for this SQL executor metadata proof. This test
      // does not pretend to be a publisher/domain DTO or a business result.
      for (const key of [scope, otherScope]) {
        await f.database.query(
          `insert into world_v2.read_projection
        (world_id,classification,scope_key,schema_version,world_version,event_sequence,payload,generated_at)
        values($1,'OFFICE_PRIVATE',$2,'world-projection-read-v1',0,0,'{}'::jsonb,$3)`,
          [DECISION_TEST_WORLD, key, AT],
        );
        await f.database.query(
          `insert into world_v2.projection_entitlement
        (world_id,auth_subject,classification,scope_key,authorization_version,active,granted_at)
        values($1,$2::uuid,'OFFICE_PRIVATE',$3,$4,true,$5)`,
          [
            DECISION_TEST_WORLD,
            DECISION_TEST_SUBJECT,
            key,
            DECISION_TEST_REVISION,
            AT,
          ],
        );
      }
      const actual = await f.executor.query(query(scope));
      expect(actual.rows).toHaveLength(1);
      const stored = (
        await f.database.query<{
          seed_id: string;
          seed_fingerprint: string;
          source_kind: string;
          canonical_seed_payload: string;
        }>(
          'select seed_id,seed_fingerprint,source_kind,canonical_seed_payload from test_protocol.persisted_read_context',
        )
      ).rows[0]!;
      expect(stored.source_kind).toBe('TEST_FIXTURE');
      expect(actual.verifiedProjectionAuthority).toEqual({
        authSubject: DECISION_TEST_SUBJECT,
        worldId: DECISION_TEST_WORLD,
        classification: 'OFFICE_PRIVATE',
        scopeKey: scope,
        seedRef: stored.seed_id,
        contentHash: stored.seed_fingerprint,
        worldVersion: '0',
        eventSequence: '0',
      });
      const seed = JSON.parse(stored.canonical_seed_payload) as {
        sources: { sourceKind: string; canonicalPayload: string }[];
      };
      expect(seed.sources[0]?.sourceKind).toBe('TEST_FIXTURE');
      expect(JSON.parse(seed.sources[0]!.canonicalPayload)).toMatchObject({
        officeId: office,
        countryId: DECISION_TEST_COUNTRY,
      });
      expect(await f.executor.query(query(otherScope))).toEqual({ rows: [] });
      expect(
        await f.executor.query(
          query(
            scope,
            parseSupabaseAuthSubject('550e8400-e29b-41d4-a716-446655440022'),
          ),
        ),
      ).toEqual({ rows: [] });
      await f.database.query(
        'update world_v2.current_commit_authorization set active=false',
      );
      expect(await f.executor.query(query(scope))).toEqual({ rows: [] });
      expect(
        (
          await f.database.query(
            "select to_regclass('world_v2.opening_seed') as seed,to_regclass('world_v2.runtime_opening_admission') as admission",
          )
        ).rows,
      ).toEqual([{ seed: null, admission: null }]);
    },
  );

  it('rejects any non-enumerated decision profile before allocation', async () => {
    const start = protocolFixtureLifecycle();
    await expect(
      createTestOnlyPersistedReadContextFixture({
        decisionOffice: 'UNKNOWN' as never,
      }),
    ).rejects.toThrow('EXTERNAL_INPUT_DENIED');
    expect(protocolFixtureLifecycle()).toEqual(start);
  });

  it('closes actual owned SQL when the strict API refuses an invalid payload', async () => {
    const start = protocolFixtureLifecycle();
    let queries = 0;
    await expect(
      readPersistedDecisionTestRow({
        office: 'CAPTAIN',
        row: {
          world_id: DECISION_TEST_WORLD,
          classification: 'OFFICE_PRIVATE',
          scope_key: decisionTestOfficeScope('CAPTAIN'),
          schema_version: 'world-projection-read-v1',
          world_version: '1',
          event_sequence: '1',
          generated_at: AT,
          payload: {
            schemaVersion: 'world-activity-projection-v1',
            countryId: DECISION_TEST_COUNTRY,
            officeId: 'CAPTAIN',
            activity: {},
            ledger: {},
            feedback: {
              schemaVersion: 'derived-system-feedback-v1',
              citizen: {
                status: 'UNAVAILABLE',
                reason: 'MODEL_NOT_ADMITTED',
                items: [],
              },
              government: {
                status: 'UNAVAILABLE',
                reason: 'DISCLOSURE_UNAVAILABLE',
                items: [],
              },
            },
          },
        },
        inspectRequest: () => {
          queries++;
        },
      }),
    ).rejects.toMatchObject({ code: 'PROTOCOL_ERROR' });
    expect(queries).toBe(1);
    expect(protocolFixtureLifecycle()).toMatchObject({
      created: start.created + 1,
      closed: start.closed + 1,
      open: 0,
      peakOpen: 1,
    });
  });
});
