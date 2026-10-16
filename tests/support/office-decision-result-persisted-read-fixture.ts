/** TEST_ONLY read-port bridge, not a PostgreSQL economic execution witness.
 * The existing held-SQL writer/pure projector still produces the business row.
 * Only read facts are materialized here in this factory's real disposable SQL.
 * Empty TEST_FIXTURE opening context is never admission, finance or World proof.
 */
import {
  createWorldReadRequest,
  parseSupabaseAuthSubject,
  readEntitledWorldProjection,
} from '../../apps/world-api/src/index.js';
import type {
  ParameterizedPgReadExecutor,
  ParameterizedPgReadRequest,
} from '../../apps/world-api/src/integration/postgres-read-adapter.js';
import {
  createTestOnlyPersistedReadContextFixture,
  isTestOnlyDecisionOffice,
} from './test-only-persisted-read-context-fixture.js';

export const DECISION_TEST_WORLD = 'WORLD_TEST_ONLY_DECISION_RESULTS';
export const DECISION_TEST_COUNTRY = 'COUNTRY_01';
export const DECISION_TEST_SUBJECT = parseSupabaseAuthSubject(
  '11111111-1111-4111-8111-111111111111',
);
export const DECISION_TEST_REVISION = 'AUTH_DECISION_CONTEXT_1';
type Row = Record<string, unknown>;
export function decisionTestOfficeScope(office: string) {
  return `OFFICE_${Buffer.from(DECISION_TEST_COUNTRY).toString('hex').toUpperCase()}_${Buffer.from(office).toString('hex').toUpperCase()}`;
}

/** Positive TEST_ONLY re-publication metadata only. Call before the original
 * negative edit, never after it. Keep unavailable reasons/items/content intact.
 */
function preparePositiveRow(source: Row, office: string): Row {
  const row = structuredClone(source);
  const classification = row.classification;
  if (
    row.world_id !== DECISION_TEST_WORLD ||
    !['COUNTRY', 'OFFICE_PRIVATE'].includes(String(classification)) ||
    row.scope_key !==
      (classification === 'COUNTRY'
        ? DECISION_TEST_COUNTRY
        : decisionTestOfficeScope(office)) ||
    !row.payload ||
    typeof row.payload !== 'object' ||
    Array.isArray(row.payload)
  )
    throw Error('TEST_ONLY_DECISION_ROW_SCOPE_DENIED');
  const payload = row.payload as Row;
  if (classification === 'COUNTRY') {
    if (Object.hasOwn(payload, 'feedback'))
      throw Error('COUNTRY_FEEDBACK_DENIED');
    return row;
  }
  const feedback = payload.feedback as Row | undefined;
  if (!feedback || feedback.schemaVersion !== 'derived-system-feedback-v1')
    throw Error('TEST_ONLY_EXPECTED_PUBLISHER_UNAVAILABLE_FEEDBACK');
  for (const [key, reason] of [
    ['citizen', 'MODEL_NOT_ADMITTED'],
    ['government', 'DISCLOSURE_UNAVAILABLE'],
  ] as const) {
    const part = feedback[key] as Row | undefined;
    if (
      !part ||
      part.status !== 'UNAVAILABLE' ||
      part.reason !== reason ||
      !Array.isArray(part.items) ||
      part.items.length !== 0
    )
      throw Error('TEST_ONLY_FEEDBACK_MODEL_NOT_ADMITTED');
  }
  // The business positive vector intentionally changed its publication Office
  // or sparse head. Rebind only its existing unavailable feedback metadata.
  Object.assign(feedback, {
    classification: 'OFFICE_PRIVATE',
    scopeKey: row.scope_key,
    countryId: DECISION_TEST_COUNTRY,
    officeId: office,
    sourceHead: {
      worldId: row.world_id,
      worldVersion: row.world_version,
      eventSequence: row.event_sequence,
    },
    generatedAt: row.generated_at,
  });
  return row;
}

export async function readPersistedDecisionTestRow(input: {
  readonly row: Row;
  readonly office: unknown;
  readonly active?: boolean;
  readonly inspectRequest?: (request: ParameterizedPgReadRequest) => void;
  readonly edit?: (payload: Row, row: Row) => void;
}) {
  if (!isTestOnlyDecisionOffice(input.office))
    throw Error('TEST_ONLY_DECISION_OFFICE_DENIED');
  const fixture = await createTestOnlyPersistedReadContextFixture({
    decisionOffice: input.office,
  });
  try {
    await fixture.publishContext();
    const row = preparePositiveRow(input.row, input.office);
    const active = input.active ?? true;
    // Explicit trusted TEST_ONLY materialization of the held writer's row/head.
    // This does not insert an Event/Posting/receipt or claim a real transition.
    await fixture.database.transaction(async (tx) => {
      await tx.query(
        'update world_v2.world_head set world_version=$2::bigint,event_sequence=$3::bigint where world_id=$1',
        [DECISION_TEST_WORLD, row.world_version, row.event_sequence],
      );
      await tx.query(
        'update world_v2.current_commit_authorization set active=$2 where world_id=$1',
        [DECISION_TEST_WORLD, active],
      );
      await tx.query(
        `insert into world_v2.read_projection
        (world_id,classification,scope_key,schema_version,world_version,event_sequence,payload,generated_at)
        values($1,$2,$3,$4,$5::bigint,$6::bigint,$7::jsonb,$8::timestamptz)`,
        [
          row.world_id,
          row.classification,
          row.scope_key,
          row.schema_version,
          row.world_version,
          row.event_sequence,
          JSON.stringify(row.payload),
          row.generated_at,
        ],
      );
      await tx.query(
        `insert into world_v2.projection_entitlement
        (world_id,auth_subject,classification,scope_key,authorization_version,active,granted_at,revoked_at)
        values($1,$2::uuid,$3,$4,$5,$6,$7::timestamptz,$8::timestamptz)`,
        [
          DECISION_TEST_WORLD,
          DECISION_TEST_SUBJECT,
          row.classification,
          row.scope_key,
          DECISION_TEST_REVISION,
          active,
          row.generated_at,
          active ? null : row.generated_at,
        ],
      );
    });
    const request = createWorldReadRequest({
      requestId: '11111111-1111-4111-8111-111111111112',
      worldId: DECISION_TEST_WORLD,
      classification: row.classification as 'COUNTRY' | 'OFFICE_PRIVATE',
      scopeKey: String(row.scope_key),
    });
    const genuine: ParameterizedPgReadExecutor = {
      async query(query) {
        input.inspectRequest?.(query);
        return fixture.executor.query(query);
      },
    };
    if (input.edit) {
      // A generic PROTOCOL_ERROR must not pass merely because context is absent.
      const baseline = await readEntitledWorldProjection({
        executor: genuine,
        authSubject: DECISION_TEST_SUBJECT,
        request,
      });
      if (!baseline)
        throw Error('TEST_ONLY_NEGATIVE_REQUIRES_VALID_SQL_BASELINE');
    }
    const executor: ParameterizedPgReadExecutor = input.edit
      ? {
          async query(query) {
            const actual = await genuine.query(query);
            if (actual.rows.length !== 1) return actual;
            const copy = structuredClone(actual.rows[0]) as Row;
            input.edit?.(copy.payload as Row, copy);
            // Never manufacture/replace authority: retain the genuine same-snapshot
            // SQL result and change only the original unit-test raw row vector.
            return { ...actual, rows: [copy] };
          },
        }
      : genuine;
    return await readEntitledWorldProjection({
      executor,
      authSubject: DECISION_TEST_SUBJECT,
      request,
    });
  } finally {
    await fixture.close();
  }
}
