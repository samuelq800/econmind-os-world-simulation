/** TEST_ONLY one-stage entry on the caller's existing registered native host.
 * No initialization, Clock movement, source invention, service startup or retry.
 * Stage originals are persisted by the existing driver before HTTP dispatch.
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import {
  canonicalSerialize,
  INDUSTRY_FIRST_DAY_POLICY_VERSION,
} from '@econmind/core';
import type { AuthenticatedOfficeCommandRequestDto } from '@econmind/core/authenticated-office-command-contract';
import {
  parseIndustryUtilityPlanningRow,
  type IndustryUtilityPlanningRow,
} from '@econmind/core/postwar-industry-utility-planning-contract';
import {
  buildIndustryUtilityRequest,
  type IndustryUtilityDraft,
} from '../../apps/world-web/src/industry-utility/form.js';
import {
  createRegisteredFinalDriver,
  deriveRegisteredFinalIndustryRunPlan,
} from './postwar-registered-final-driver.js';
import type { PostwarNativeReferenceMarker } from './postwar-native-reference-db.js';
const country = 'COUNTRY_10',
  facility = 'OPEN-10-REFINED_FUEL';
type Driver = ReturnType<typeof createRegisteredFinalDriver>;
type Identity = Readonly<{
  commandId: string;
  idempotencyKey: string;
  requestId: string;
}>;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');

/** Build once; keep this exact original for recovery even if dispatch fails. */
export async function prepareRegisteredC10Run(input: {
  driver: Driver;
  runId: string;
  identity: Identity;
}) {
  const terms = deriveRegisteredFinalIndustryRunPlan(
    await input.driver.rpc('INDUSTRY_SELECTORS', {
      countryId: country,
      facilityId: facility,
    }),
    'C10_CURRENT',
  );
  const original = await input.driver.makeRequest({
    countryId: country,
    officeId: 'INDUSTRY',
    commandType: 'CORE_INDUSTRY_RUN_SCHEDULE_V1',
    commandId: input.identity.commandId,
    idempotencyKey: input.identity.idempotencyKey,
    payload: {
      schemaVersion: 'postwar-industry-run-schedule-v1',
      runId: input.runId,
      facilityId: facility,
      policyVersion: INDUSTRY_FIRST_DAY_POLICY_VERSION,
      sourceRef: terms.sourceRef,
      sourceRawSha256: terms.sourceRawSha256,
      quantity: terms.quantity,
      startsAtSimTime: terms.startsAtSimTime,
      endsAtSimTime: terms.endsAtSimTime,
      maximumExpense: terms.maximumExpense,
    },
  });
  return { ...original, requestId: input.identity.requestId };
}

/** Caller supplies the actual authorized, head-bound planning page row, not a
 * fabricated work/payment operation. Backend revalidates all source/seat facts.
 * BOOK quantity/window are explicit choices; later stages are ref-only. */
export async function prepareRegisteredC10LogisticsStage(input: {
  driver: Driver;
  worldId: string;
  runId: string;
  identity: Identity;
  pageHead: Readonly<{ worldVersion: string; eventSequence: string }>;
  row: IndustryUtilityPlanningRow;
  draft: IndustryUtilityDraft;
}) {
  const row = parseIndustryUtilityPlanningRow(input.row),
    head = await input.driver.readHead();
  assert.deepEqual(head, input.pageHead, 'C10_CURRENT_PLANNING_HEAD_REQUIRED');
  assert(
    row.countryId === country &&
      row.facilityId === facility &&
      row.runId === input.runId &&
      row.serviceKind === 'LOGISTICS',
    'C10_ACTUAL_LOGISTICS_ROW_REQUIRED',
  );
  return buildIndustryUtilityRequest({
    row,
    draft: input.draft,
    worldId: input.worldId,
    countryId: country,
    worldVersion: head.worldVersion,
    ...input.identity,
  });
}

/** One explicit new command only. Never call this again after unknown outcome:
 * recover the driver's persisted original first, using driver.recover(). */
export async function executeRegisteredC10Stage(input: {
  driver: Driver;
  original: AuthenticatedOfficeCommandRequestDto;
}) {
  const r = input.original.request;
  assert(
    r.countryId === country && r.officeId === 'INDUSTRY',
    'C10_INDUSTRY_COMMAND_ONLY',
  );
  const p = r.payload as Record<string, unknown>;
  assert.equal(p.facilityId, facility);
  assert(
    r.commandType === 'CORE_INDUSTRY_RUN_SCHEDULE_V1' ||
      (r.commandType === 'INDUSTRY_FIRST_DAY_LOGISTICS_EXECUTE_V1' &&
        p.serviceKind === 'LOGISTICS' &&
        ['BOOK', 'SHIP', 'SERVICE_WORK', 'PAY_INPUTS', 'DELIVER'].includes(
          String((p.operation as Record<string, unknown>)?.action),
        )),
    'C10_FINITE_CHAIN_ONLY',
  );
  assert(
    !input.driver.originals.some(
      (prior) =>
        prior.request.commandId === r.commandId ||
        prior.request.idempotencyKey === r.idempotencyKey,
    ),
    'C10_PRIOR_DISPATCH_REQUIRES_RECOVERY_NOT_RESUBMIT',
  );
  const fingerprint = await input.driver.submit(input.original);
  const committed = await input.driver.consume(r.commandId, {
    countryId: country,
    commandType: r.commandType,
    fingerprint,
  });
  await input.driver.recover(input.original, { duplicateProbe: false });
  return committed;
}

/** Source publication is only an immutable ORDER, never proof of performed
 * labour/payment. Use existing separate publisher; do not create/grant roles.
 * SQL verifies committed RUN/BOOK/SHIP (and WORK for PAY); Core subsequently
 * checks actual E03 people, 480-minute/nonoverlap, due time, wages and deposits.
 * Caller must supply an actual controlled order, not the tiny test fixture. */
export async function publishRegisteredC10LogisticsOrder(input: {
  marker: PostwarNativeReferenceMarker;
  database: string;
  publisher: Pick<Pool, 'connect'>;
  rawText: string;
  runId: string;
  transferId: string;
}) {
  assert.equal(process.env.ECONMIND_REGISTERED_FINAL_NODE_NATIVE, '1');
  assert.match(input.database, /^postwar_clone_[a-z0-9_]+$/u);
  assert.notEqual(input.database, input.marker.database);
  assert(
    input.marker.socket.startsWith('/tmp/') ||
      input.marker.socket.startsWith('/workspace/'),
  );
  assert(
    Buffer.byteLength(input.rawText) <= 16384,
    'C10_BOUNDED_ORDER_REQUIRED',
  );
  const body = JSON.parse(input.rawText) as Record<string, unknown>;
  assert.equal(
    canonicalSerialize(body),
    input.rawText,
    'C10_CANONICAL_ORDER_REQUIRED',
  );
  assert.equal(body.worldId, input.marker.worldId);
  assert.equal(body.seedFingerprint, input.marker.seedFingerprint);
  assert.equal(body.countryId, country);
  assert.equal(body.facilityId, facility);
  assert.equal(body.runId, input.runId);
  assert.equal(body.transferId, input.transferId);
  assert(
    [
      'industry-logistics-service-work-order-v1',
      'industry-logistics-service-expense-order-v1',
    ].includes(String(body.schemaVersion)),
    'C10_WORK_OR_PAY_ORDER_ONLY',
  );
  const client = await input.publisher.connect();
  let commitAttempted = false,
    discard = false;
  try {
    await client.query('begin isolation level repeatable read');
    const scope = await client.query<{
      database: string;
      local: boolean;
      safe: boolean;
    }>(
      `select current_database() database, inet_server_addr() is null as local,
       not(rolsuper or rolbypassrls or rolcreatedb or rolcreaterole or rolreplication) as safe
       from pg_roles where rolname=session_user`,
    );
    assert.equal(scope.rows.length, 1);
    assert.equal(scope.rows[0]!.database, input.database);
    assert(
      scope.rows[0]!.local && scope.rows[0]!.safe,
      'C10_EXISTING_LOCAL_RESTRICTED_PUBLISHER_REQUIRED',
    );
    await client.query('set local role world_v2_industry_source_publisher');
    const result = await client.query<{
      order_ref: string;
      order_sha256: string;
    }>(
      'select * from world_v2.publish_postwar_industry_logistics_order($1,$2,$3,$4)',
      [input.marker.worldId, country, input.rawText, sha(input.rawText)],
    );
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0]!.order_ref, body.inputRef);
    assert.equal(result.rows[0]!.order_sha256, sha(input.rawText));
    commitAttempted = true;
    await client.query('commit');
    return {
      ...result.rows[0]!,
      classification: 'REGISTERED_ORDER_NOT_WORK_OR_PAYMENT' as const,
    };
  } catch (error) {
    discard = true;
    if (!commitAttempted) await client.query('rollback');
    // A failed COMMIT acknowledgement is uncertain. Do not automatically republish.
    throw error;
  } finally {
    client.release(discard);
  }
}

/** Reads the existing JWT-protected API itself. Native source/order IPC is not
 * accepted as authorization or as a substitute planning page. */
export async function prepareRegisteredC10StageFromCurrentApi(input: {
  driver: Driver;
  worldId: string;
  runId: string;
  identity: Identity;
  action: 'BOOK' | 'SHIP' | 'SERVICE_WORK' | 'PAY_INPUTS' | 'DELIVER';
  transferId?: string;
  orderRef?: string;
  booking?: Readonly<{
    quantity: string;
    startsAtSimTime: string;
    endsAtSimTime: string;
  }>;
}) {
  const head = await input.driver.readHead();
  let offset = 0,
    sourceVersion: string | undefined,
    bindingVersion: string | undefined;
  const rows: IndustryUtilityPlanningRow[] = [],
    seen = new Set<string>();
  for (let pageNumber = 0; pageNumber < 32; pageNumber++) {
    const requestId = randomUUID();
    const response = await input.driver.post(
      '/v1/postwar-office-runtime',
      {
        schemaVersion: 'postwar-office-runtime-read-v1',
        requestId,
        operation: 'READ_CURRENT_OFFICE_OPENING',
        officeId: 'INDUSTRY',
        dataset: 'industry-utility-planning',
        page: {
          offset,
          limit: 25,
          ...(sourceVersion ? { sourceVersion, bindingVersion } : {}),
        },
      },
      country,
    );
    const body = response.body;
    assert(
      response.status === 200 &&
        body.ok === true &&
        body.requestId === requestId &&
        body.dataset === 'industry-utility-planning',
      'C10_CURRENT_AUTHENTICATED_PLANNING_PAGE_REQUIRED',
    );
    const source = body.source as Record<string, unknown>,
      authority = body.authority as Record<string, unknown>,
      page = body.page as Record<string, unknown>;
    assert(
      source.countryId === country &&
        source.officeId === 'INDUSTRY' &&
        source.worldId === input.worldId,
      'C10_AUTHENTICATED_PAGE_SCOPE_REQUIRED',
    );
    const readback = authority.readback as Record<string, unknown>;
    assert(
      readback.worldVersion === head.worldVersion &&
        readback.eventSequence === head.eventSequence,
      'C10_CURRENT_AUTHENTICATED_PAGE_HEAD_REQUIRED',
    );
    assert(
      typeof source.sourceVersion === 'string' &&
        typeof source.bindingVersion === 'string',
    );
    if (sourceVersion)
      assert(
        sourceVersion === source.sourceVersion &&
          bindingVersion === source.bindingVersion,
        'C10_UNCHANGED_PAGE_BINDING_REQUIRED',
      );
    sourceVersion = source.sourceVersion;
    bindingVersion = source.bindingVersion;
    assert(
      Array.isArray(body.rows) &&
        page.offset === offset &&
        page.returned === body.rows.length &&
        body.rows.length <= 25,
      'C10_BOUNDED_PAGE_REQUIRED',
    );
    for (const raw of body.rows) {
      const row = parseIndustryUtilityPlanningRow(raw);
      assert(!seen.has(row.planningRef), 'C10_DUPLICATE_PAGE_ROW');
      seen.add(row.planningRef);
      rows.push(row);
    }
    if (page.nextOffset === null) {
      assert(
        rows.length === page.total,
        'C10_COMPLETE_CURRENT_PLANNING_PAGES_REQUIRED',
      );
      const matches = rows.filter(
        (row) =>
          row.facilityId === facility &&
          row.runId === input.runId &&
          row.serviceKind === 'LOGISTICS' &&
          row.action === input.action &&
          (row.action === 'BOOK' ||
            ((!input.transferId ||
              row.parameters.operation.transferId === input.transferId) &&
              (!input.orderRef ||
                row.parameters.operation.workOrderRef === input.orderRef ||
                row.parameters.operation.expenseOrderRef === input.orderRef))),
      );
      assert.equal(
        matches.length,
        1,
        'C10_ONE_ACTUAL_REQUESTED_STAGE_ROW_REQUIRED',
      );
      const row = matches[0]!;
      assert(
        (input.action === 'BOOK') === !!input.booking,
        'C10_BOOK_CHOICES_OR_REF_ONLY_REQUIRED',
      );
      return prepareRegisteredC10LogisticsStage({
        driver: input.driver,
        worldId: input.worldId,
        runId: input.runId,
        identity: input.identity,
        pageHead: head,
        row,
        draft: {
          planningRef: row.planningRef,
          quantity: input.booking?.quantity ?? '',
          startsAtSimTime: input.booking?.startsAtSimTime ?? '',
          endsAtSimTime: input.booking?.endsAtSimTime ?? '',
        },
      });
    }
    assert(
      Number.isSafeInteger(page.nextOffset) &&
        page.nextOffset === offset + body.rows.length &&
        body.rows.length > 0,
      'C10_CONTIGUOUS_PAGE_REQUIRED',
    );
    offset = page.nextOffset as number;
  }
  throw Error('C10_BOUNDED_PAGE_LIMIT_EXCEEDED');
}
/** Actual source/replay joins are performed by the registered child. This only
 * requests explicit scheduling choices; no caller-supplied labour/payee facts. */
export async function prepareRegisteredC10OrdersFromCurrentReplay(input: {
  driver: Driver;
  runId: string;
  transferId: string;
  refPrefix: string;
  work?: Readonly<{
    count: string;
    startsAtSimTime: string;
    endsAtSimTime: string;
  }>;
}) {
  return input.driver.rpc('C10_LOGISTICS_ORDERS', {
    countryId: country,
    facilityId: facility,
    runId: input.runId,
    transferId: input.transferId,
    refPrefix: input.refPrefix,
    ...(input.work ? { work: input.work } : {}),
  });
}
