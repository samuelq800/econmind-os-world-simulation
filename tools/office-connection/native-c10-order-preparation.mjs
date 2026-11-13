/** Existing owned native rehearsal only. Drafts are NOT labour/payment facts. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const country = 'COUNTRY_10',
  facility = 'OPEN-10-REFINED_FUEL';
const u = (x) => {
  assert(
    typeof x === 'string' && /^(0|[1-9][0-9]*)$/.test(x),
    'C10_EXACT_INTEGER_REQUIRED',
  );
  return BigInt(x);
};
const dec = (x) => {
  assert(typeof x === 'string' && /^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(x));
  const [a, b = ''] = x.split('.');
  return { n: BigInt(a + b), d: 10n ** BigInt(b.length) };
};
const add = (a, b) => ({ n: a.n * b.d + b.n * a.d, d: a.d * b.d });
const sub = (a, b) => ({ n: a.n * b.d - b.n * a.d, d: a.d * b.d });
const canonical = (value) =>
  JSON.stringify(value, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, v[k]]),
        )
      : v,
  );
const sha = (s) => createHash('sha256').update(s).digest('hex');
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const order = (body) => {
  const rawText = canonical(body);
  assert(Buffer.byteLength(rawText) <= 16384);
  return { reference: body.inputRef, rawText, rawSha256: sha(rawText) };
};
const micros = (n) => {
  const whole = n / 1000000n,
    tail = (n % 1000000n).toString().padStart(6, '0').replace(/0+$/, '');
  return whole.toString() + (tail ? '.' + tail : '');
};
const one = (xs, code) => {
  assert.equal(xs.length, 1, code);
  return xs[0];
};

/** Pure assembly from the genuine server snapshot below. Explicit finite
 * scheduling choices are not qualifications. SQL/runtime recheck on execution. */
export function assembleC10Orders({
  source,
  transfer,
  bookings,
  currentPositions,
  now,
  work,
  refPrefix,
}) {
  assert(
    source.countryId === country && source.facilityId === facility,
    'C10_SOURCE_REQUIRED',
  );
  assert(/^[A-Za-z][A-Za-z0-9_]{0,80}$/.test(refPrefix));
  assert(
    transfer && transfer.request.runId && transfer.request.transferId,
    'C10_ACTUAL_TRANSFER_REQUIRED',
  );
  const common = {
    worldId: source.worldId,
    countryId: country,
    facilityId: facility,
    operatorId: source.operatorId,
    runId: transfer.request.runId,
    seedFingerprint: source.seedFingerprint,
    transferId: transfer.request.transferId,
  };
  const labour = source.labourSource;
  if (transfer.status === 'DELIVERED')
    return { status: 'ALREADY_DELIVERED', orders: [] };
  if (!transfer.work) {
    if (transfer.status !== 'IN_TRANSIT')
      return { status: 'WAIT_FOR_COMMITTED_SHIP', orders: [] };
    const registered = source.workOriginals.filter((o) => {
      const b = JSON.parse(o.rawText);
      return b.runId === common.runId && b.transferId === common.transferId;
    });
    assert(registered.length <= 1, 'C10_UNIQUE_REGISTERED_WORK_ORDER_REQUIRED');
    if (registered.length) {
      const ends = JSON.parse(registered[0].rawText).allocations.map((a) =>
        u(a.endsAtSimTime),
      );
      const end = ends.reduce((a, b) => (a > b ? a : b), 0n);
      return {
        status:
          u(now) < end ? 'WAIT_FOR_ACTUAL_CLOCK' : 'REGISTERED_WORK_ORDER',
        requiredSimTime: end.toString(),
        orders: registered,
      };
    }
    if (!work)
      return {
        status: 'EXPLICIT_PERSON_COUNT_AND_WINDOW_REQUIRED',
        orders: [],
      };
    const count = u(work.count),
      start = u(work.startsAtSimTime),
      end = u(work.endsAtSimTime);
    assert(
      count > 0n &&
        end > start &&
        end - start <= 28800000n &&
        start >= u(transfer.request.startsAtSimTime) &&
        end <= u(transfer.request.endsAtSimTime),
      'C10_BOOK_BOUND_FINITE_WORK_WINDOW_REQUIRED',
    );
    const unique = [
      ...new Map(bookings.map((b) => [canonical(b), b])).values(),
    ];
    let allocation;
    for (const p of [...labour.positions].sort((a, b) =>
      compare(a.positionId, b.positionId),
    )) {
      const current = currentPositions.filter(
        (c) =>
          c.positionId === p.positionId &&
          c.locationId === p.regionId &&
          c.skill === p.skill,
      );
      if (current.length !== 1 || u(current[0].employedCount) < count) continue;
      const lo = u(p.startOrdinal),
        hi = lo + u(p.count);
      const prior = unique.filter(
        (b) =>
          b.regionId === p.regionId &&
          u(b.startOrdinal) < hi &&
          lo < u(b.startOrdinal) + u(b.count),
      );
      const cuts = [
        ...new Set([
          lo.toString(),
          hi.toString(),
          ...prior.flatMap((b) => [
            u(b.startOrdinal) > lo ? b.startOrdinal : lo.toString(),
            u(b.startOrdinal) + u(b.count) < hi
              ? (u(b.startOrdinal) + u(b.count)).toString()
              : hi.toString(),
          ]),
        ]),
      ]
        .map(BigInt)
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      for (let i = 0; i < cuts.length - 1; i++) {
        const ordinal = cuts[i];
        if (cuts[i + 1] - ordinal < count) continue;
        const intersect = prior.filter(
          (b) =>
            u(b.startOrdinal) <= ordinal &&
            ordinal < u(b.startOrdinal) + u(b.count),
        );
        if (
          intersect.some(
            (b) => start < u(b.endsAtSimTime) && u(b.startsAtSimTime) < end,
          )
        )
          continue;
        if (
          intersect.reduce(
            (n, b) => n + u(b.endsAtSimTime) - u(b.startsAtSimTime),
            end - start,
          ) > 28800000n
        )
          continue;
        const ms = (count * (end - start)).toString();
        allocation = {
          positionId: p.positionId,
          poolId: p.poolId,
          sourceStartOrdinal: p.sourceStartOrdinal,
          populationLineage: 'POSTWAR_REGIONAL_POPULATION_ORDINAL_V1',
          regionId: p.regionId,
          cohortRef: p.cohortRef,
          startOrdinal: ordinal.toString(),
          count: count.toString(),
          skill: p.skill,
          startsAtSimTime: start.toString(),
          endsAtSimTime: end.toString(),
          personMilliseconds: ms,
          personMinutes: { numerator: ms, denominator: '60000' },
        };
        break;
      }
      if (allocation) break;
    }
    if (!allocation)
      return {
        status: 'NO_CURRENT_UNOCCUPIED_LOGISTICS_PERSON_RANGE',
        orders: [],
      };
    const body = {
      schemaVersion: 'industry-logistics-service-work-order-v1',
      purpose: 'DISTINCT_LOGISTICS_SERVICE_WORK',
      inputRef: refPrefix + '_WORK',
      ...common,
      labourSourceRef: labour.sourceRef,
      labourSourceRawSha256: labour.sourceRawSha256,
      allocations: [allocation],
    };
    return {
      status: u(now) < end ? 'WAIT_FOR_ACTUAL_CLOCK' : 'WORK_ORDER_DRAFT',
      requiredSimTime: end.toString(),
      orders: [order(body)],
      classification: 'SCHEDULED_ORDER_NOT_COMPLETED_WORK',
    };
  }
  const earned = new Map();
  for (const a of transfer.work.allocations) {
    const p = one(
      transfer.work.labour.positions.filter(
        (p) =>
          p.positionId === a.positionId &&
          p.poolId === a.poolId &&
          p.regionId === a.regionId &&
          p.cohortRef === a.cohortRef &&
          u(p.startOrdinal) <= u(a.startOrdinal) &&
          u(a.startOrdinal) + u(a.count) <= u(p.startOrdinal) + u(p.count),
      ),
      'C10_ACTUAL_COMMITTED_WORK_WAGE_SOURCE_REQUIRED',
    );
    const targets = [];
    if (source.beneficialReceipt) {
      for (const group of source.beneficialReceipt.groups.filter(
        (g) => g.locationId === a.regionId,
      )) {
        const left =
            u(group.firstPersonOrdinal) > u(a.startOrdinal)
              ? u(group.firstPersonOrdinal)
              : u(a.startOrdinal),
          right =
            u(group.firstPersonOrdinal) + u(group.population) <
            u(a.startOrdinal) + u(a.count)
              ? u(group.firstPersonOrdinal) + u(group.population)
              : u(a.startOrdinal) + u(a.count);
        if (right <= left) continue;
        const payee = one(
          source.beneficialReceipt.subaccounts.filter(
            (r) => r.groupId === group.groupId,
          ),
          'C10_EXACT_BENEFICIAL_GROUP_ACCOUNT_REQUIRED',
        );
        assert(
          payee.account.currency === p.currency,
          'C10_BENEFICIAL_CURRENCY_REQUIRED',
        );
        targets.push({
          accountId: payee.account.accountId,
          count: right - left,
        });
      }
      assert(
        targets.reduce((n, r) => n + r.count, 0n) === u(a.count),
        'C10_COMPLETE_NONOVERLAPPING_CHILD_MAPPING_REQUIRED',
      );
    } else targets.push({ accountId: p.householdAccountId, count: u(a.count) });
    for (const target of targets) {
      const wage = dec(p.annualWage),
        value = {
          n:
            wage.n * target.count * (u(a.endsAtSimTime) - u(a.startsAtSimTime)),
          d: wage.d * 360n * 480n * 60000n,
        };
      const prior = earned.get(target.accountId);
      assert(!prior || prior.currency === p.currency);
      earned.set(target.accountId, {
        currency: p.currency,
        value: add(prior?.value ?? { n: 0n, d: 1n }, value),
      });
    }
  }
  const orders = [],
    remainders = [];
  for (const [accountId, item] of [...earned].sort(([a], [b]) =>
    compare(a, b),
  )) {
    let unpaid = item.value;
    for (const payment of transfer.payments.filter(
      (p) => p.householdAccountId === accountId,
    )) {
      assert(payment.currency === item.currency);
      unpaid = sub(unpaid, dec(payment.amount));
    }
    assert(unpaid.n >= 0n, 'C10_PRIOR_PAYMENT_EXCEEDS_EARNED_WAGE');
    const pending = source.expenseOriginals.filter((o) => {
      const b = JSON.parse(o.rawText);
      return (
        b.runId === common.runId &&
        b.transferId === common.transferId &&
        b.workEventFingerprint === transfer.work.eventFingerprint &&
        b.householdAccountId === accountId &&
        !transfer.payments.some((p) => p.original.reference === o.reference)
      );
    });
    assert(
      pending.length <= 1,
      'C10_MULTIPLE_OUTSTANDING_PAY_ORDERS_REQUIRE_EXPLICIT_RESOLUTION',
    );
    if (pending.length) {
      const b = JSON.parse(pending[0].rawText);
      assert.equal(b.currency, item.currency);
      const remainder = sub(unpaid, dec(b.amount));
      assert(
        remainder.n >= 0n,
        'C10_PENDING_ORDER_EXCEEDS_CURRENT_EARNED_BALANCE',
      );
      orders.push(pending[0]);
      remainders.push({
        accountId,
        numerator: remainder.n.toString(),
        denominator: remainder.d.toString(),
      });
      continue;
    }
    const payable = (unpaid.n * 1000000n) / unpaid.d;
    const remainder = sub(unpaid, { n: payable, d: 1000000n });
    remainders.push({
      accountId,
      numerator: remainder.n.toString(),
      denominator: remainder.d.toString(),
    });
    if (!payable) continue;
    orders.push(
      order({
        schemaVersion: 'industry-logistics-service-expense-order-v1',
        purpose: 'DISTINCT_LOGISTICS_SERVICE_WORK_WAGE',
        inputRef:
          refPrefix +
          '_PAY_' +
          sha(
            canonical([
              accountId,
              micros(payable),
              transfer.work.eventFingerprint,
            ]),
          )
            .slice(0, 16)
            .toUpperCase(),
        ...common,
        workEventFingerprint: transfer.work.eventFingerprint,
        householdAccountId: accountId,
        amount: micros(payable),
        currency: item.currency,
      }),
    );
  }
  assert(orders.length <= 256, 'C10_BOUNDED_PAYEE_ORDERS_REQUIRED');
  return {
    status: orders.length ? 'PAY_ORDER_DRAFTS' : 'NO_REPRESENTABLE_UNPAID_WAGE',
    orders,
    remainders,
    classification: 'EXACT_EARNED_WAGE_DRAFT_NOT_CASH_OR_PAYMENT',
  };
}

export async function prepareNativeC10Orders({
  binding,
  social,
  clock,
  Shared,
  C,
  request,
}) {
  assert(
    request.countryId === country && request.facilityId === facility,
    'FIXED_C10_REQUIRED',
  );
  const State =
    await import('../../apps/world-worker/dist/persistence/postwar-industry-run-state.js');
  const Sources =
    await import('../../apps/world-worker/dist/persistence/postwar-industry-logistics-source.js');
  const Work =
    await import('../../packages/core/dist/industry/industry-first-day-work.js');
  const Logistics =
    await import('../../packages/core/dist/inventory/industry-internal-logistics-execution.js');
  const Plans =
    await import('../../packages/core/dist/inventory/industry-internal-logistics.js');
  const ports = Shared.readPostwarFinanceSocialRuntimeBinding(binding),
    resources =
      await import('../../apps/world-worker/dist/runtime-preparation/social-runtime-connection.js');
  const role =
    resources.readPostwarSocialRuntimeConnectionResources(social).workerRole;
  assert(/^[a-z][a-z0-9_]{0,62}$/.test(role));
  return social.database.transaction(async (tx) => {
    const held = await tx.query(
      'select h.world_version::text as "worldVersion",h.event_sequence::text as "eventSequence" from world_v2.world_head h join world_v2.world_writer_lease l using(world_id) where h.world_id=$1 and l.holder_id=$2 and l.lease_expires_at_real>clock_timestamp() for share',
      [ports.worldId, ports.workerId],
    );
    const head = one(held.rows, 'C10_HELD_HEAD_AND_LEASE_REQUIRED');
    const context = await State.readPostwarIndustryRunStateFrom(tx, {
      socialConnection: social,
      worldId: ports.worldId,
      countryId: country,
      facilityId: facility,
      expectedHead: head,
    });
    try {
      const facts = State.consumePostwarIndustryRunStateFrom(tx, context),
        workState = Work.readIndustryFirstDayWorkState(facts.workState);
      const run = one(
        workState.runs.filter(
          (r) =>
            r.terms.runId === request.runId &&
            r.source.countryId === country &&
            r.source.facilityId === facility,
        ),
        'C10_ACTUAL_COMMITTED_RUN_REQUIRED',
      );
      const planning = await ports.industryLogistics.readPlanningFrom(tx, {
        countryId: country,
        expectedHead: head,
        context,
      });
      let projected;
      try {
        await tx.query('set local role world_v2_industry_source_reader');
        projected = await Sources.readPostwarIndustryLogisticsReplaySourcesFrom(
          tx,
          {
            baseline: facts.baseline,
            worldId: ports.worldId,
            countryId: country,
            facilityId: facility,
            runIds: [run.terms.runId],
            expectedHead: head,
          },
        );
      } finally {
        await tx.query('set local role "' + role + '"');
      }
      const source = Logistics.readIndustryInternalLogisticsReplaySources(
        projected.source,
      );
      const states = (facts.pagedReplay.result.industryLogisticsState ?? [])
        .map(Logistics.readIndustryInternalLogisticsExecutionState)
        .filter(
          (s) =>
            s.source.countryId === country && s.source.facilityId === facility,
        );
      assert(states.length <= 1, 'C10_UNIQUE_CURRENT_LOGISTICS_STATE');
      const currentSimTime = (
        await clock.simTime(ports.worldId)
      ).toCanonicalValue();
      if (BigInt(currentSimTime) < BigInt(facts.maxCommandSimTimeTicks))
        return {
          head,
          currentSimTime,
          status: 'CLOCK_BEHIND_COMMITTED_HISTORY',
          orders: [],
        };
      if (!request.transferId)
        return {
          head,
          currentSimTime,
          rows: planning.rows,
          run: run.terms,
          status: 'ACTUAL_PLANNING_ROWS',
        };
      const transfer = one(
        (states[0]?.transfers ?? []).filter(
          (t) =>
            Plans.readIndustryInternalLogisticsPlan(t.plan).request
              .transferId === request.transferId,
        ),
        'C10_ACTUAL_COMMITTED_TRANSFER_REQUIRED',
      );
      const plan = Plans.readIndustryInternalLogisticsPlan(transfer.plan);
      assert.equal(plan.request.runId, request.runId);
      const socialCountry = one(
        facts.socialCountries.filter((c) => c.countryId === country),
        'C10_CURRENT_SOCIAL_COUNTRY_REQUIRED',
      );
      const result = assembleC10Orders({
        source,
        transfer: {
          request: plan.request,
          status: transfer.status,
          work: transfer.work
            ? {
                allocations: transfer.work.allocations,
                labour: transfer.work.labour,
                eventFingerprint: transfer.work.frame.events[0].fingerprint,
              }
            : undefined,
          payments: transfer.payments,
        },
        bookings: [...workState.bookings, ...states.flatMap((s) => s.bookings)],
        currentPositions: socialCountry.lifecycle.employment.labour.positions,
        now: currentSimTime,
        work: request.work,
        refPrefix: request.refPrefix,
      });
      // Canonical Core serialization check is intentional: the pure helper must
      // preserve the same exact source-order bytes as the authoritative parser.
      for (const o of result.orders)
        assert.equal(o.rawText, C.canonicalSerialize(JSON.parse(o.rawText)));
      return {
        head,
        currentSimTime,
        rows: planning.rows,
        run: run.terms,
        ...result,
      };
    } finally {
      State.releasePostwarIndustryRunStateContext(context);
    }
  });
}
