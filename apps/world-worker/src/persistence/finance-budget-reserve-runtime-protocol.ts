/** Isolated F0 descriptor checks only. No IO, source/native issuer, authority,
 * budget arithmetic, clock, SQL, registration or runtime execution lives here.
 * A consistent caller declaration proves neither locks nor source admission.
 */
export type InertReserveCheck = Readonly<{
  kind: 'INERT_CONSISTENT' | 'INERT_REJECTED';
  code: string | null;
  productionAuthority: false;
  sourceAdmitted: false;
  runtimeConnected: false;
}>;

export interface InertReserveHead {
  readonly worldVersion: string;
  readonly eventSequence: string;
}
export interface InertReserveBinding {
  readonly worldId: string;
  readonly countryId: string;
  readonly entityRef: string;
  readonly envelopeRef: string;
  readonly effectivePeriodRef: string;
  readonly budgetLineRef: string;
  readonly currency: string;
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly commandFingerprint: string;
  readonly canonicalIntent: string;
  readonly intentSimTime: string;
  readonly sourceRef: string;
  readonly sourceRevision: string;
  readonly admissionRef: string;
  readonly approvalRevision: string;
  readonly permissionRevision: string;
  readonly executorRef: string;
  readonly timeProviderRef: string;
  readonly holderId: string;
  readonly fencingToken: string;
}
export interface InertReserveCache {
  readonly key: string;
  readonly valueWorldVersion: string | null;
  readonly canonicalPayload: string | null;
  readonly payloadHash: string | null;
  readonly sourceCommandId: string | null;
}
export interface InertReserveBeforeCache {
  /** Just an inert reference, NEVER a CurrentMaterializationObservation brand. */
  readonly observationRef: string;
  readonly observedWorldVersion: string;
  readonly value: InertReserveCache;
}
export interface InertReserveEvent {
  readonly eventId: string;
  readonly sequence: string;
  readonly worldVersion: string;
  readonly commandId: string;
  readonly simTime: string;
  readonly canonicalEvent: string;
  readonly fingerprint: string;
}
export interface InertReserveFinal {
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly commandFingerprint: string;
  readonly worldVersionBefore: string;
  readonly worldVersionAfter: string;
  readonly simTime: string;
  readonly outcome: 'COMMITTED';
  readonly eventIds: readonly string[];
  readonly canonicalFinal: string;
}
export interface InertReserveAnchor {
  readonly binding: InertReserveBinding;
  readonly beforeHead: InertReserveHead;
  readonly sourceCutoff: InertReserveHead;
  readonly originalCache: InertReserveBeforeCache;
  readonly afterHead: InertReserveHead;
  readonly afterCache: InertReserveCache;
  readonly events: readonly InertReserveEvent[];
  readonly final: InertReserveFinal;
  readonly authorizationAudit: string;
  readonly outbox: readonly string[];
  readonly leaseRenewedAtReal: string;
  readonly leaseExpiresAtReal: string;
  readonly validity: readonly Readonly<{
    ref: string;
    effectiveAtReal: string;
    expiresAtReal: string | null;
  }>[];
}
export interface InertReservePhase {
  readonly phase: 'PREWRITE' | 'POST_TAIL';
  readonly binding: InertReserveBinding;
  readonly head: InertReserveHead;
  readonly sourceCutoff: InertReserveHead;
  readonly originalCache: InertReserveBeforeCache;
  readonly currentCache: InertReserveCache;
  readonly queue: Readonly<{
    commandId: string;
    holderId: string;
    fencingToken: string;
    authorityKind: 'DISCRETIONARY_USER';
    intentSimTime: string;
    state: 'CLAIMED' | 'FINALIZED';
  }>;
  readonly events: readonly InertReserveEvent[];
  readonly final: InertReserveFinal | null;
  readonly authorizationAudit: string | null;
  readonly outbox: readonly string[];
  readonly tailCalls: string;
  readonly deltaApplications: string;
  readonly cacheWrites: string;
  readonly financialPostings: string;
  readonly inventoryPostings: string;
  readonly cutoffReal: string;
  readonly previousCutoffReal: string | null;
  readonly cutoffOrdinal: string;
  /** Latest preceding potentially-blocking acquisition/awaited hook ordinal.
   * Merely a supplied trace claim, not a real lock/time observation. */
  readonly lastBarrierOrdinal: string;
  readonly tailCompleteOrdinal: string | null;
}

class DescriptorError extends Error {}
function fail(code: string): never {
  throw new DescriptorError(code);
}
function result(code: string | null): InertReserveCheck {
  return Object.freeze({
    kind: code === null ? 'INERT_CONSISTENT' : 'INERT_REJECTED',
    code,
    productionAuthority: false,
    sourceAdmitted: false,
    runtimeConnected: false,
  });
}
function inspect(check: () => void): InertReserveCheck {
  try {
    check();
    return result(null);
  } catch (error) {
    if (error instanceof DescriptorError) return result(error.message);
    throw error;
  }
}
function record(value: unknown, fields: readonly string[]) {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Object.keys(value).length !== fields.length ||
    fields.some((key) => !Object.hasOwn(value, key))
  )
    fail('DESCRIPTOR_SHAPE');
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 16384 ||
    value.trim() !== value
  )
    fail('DESCRIPTOR_TEXT');
  return value;
}
function ref(value: unknown): string {
  const v = text(value);
  if (!/^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u.test(v) || v.length > 256)
    fail('DESCRIPTOR_REF');
  return v;
}
function count(value: unknown): string {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,119})$/u.test(value))
    fail('DESCRIPTOR_COUNTER');
  return value;
}
function digest(value: unknown): string {
  const v = text(value);
  if (!/^sha256:[0-9a-f]{64}$/u.test(v)) fail('DESCRIPTOR_HASH');
  return v;
}
function timestamp(value: unknown): string {
  const v = text(value);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(v) ||
    !Number.isFinite(Date.parse(v)) ||
    new Date(v).toISOString() !== v
  )
    fail('DESCRIPTOR_TIME');
  return v;
}
function list(value: unknown): readonly unknown[] {
  if (!Array.isArray(value) || value.length > 64) fail('DESCRIPTOR_LIST');
  return value as readonly unknown[];
}
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((v, i) => same(v, b[i]));
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const left = a as Record<string, unknown>,
    right = b as Record<string, unknown>;
  return (
    Object.keys(left).length === Object.keys(right).length &&
    Object.keys(left).every(
      (k) => Object.hasOwn(right, k) && same(left[k], right[k]),
    )
  );
}
function equal(a: unknown, b: unknown, code: string) {
  if (!same(a, b)) fail(code);
}
const bindingFields = [
  'worldId',
  'countryId',
  'entityRef',
  'envelopeRef',
  'effectivePeriodRef',
  'budgetLineRef',
  'currency',
  'commandId',
  'idempotencyKey',
  'commandFingerprint',
  'canonicalIntent',
  'intentSimTime',
  'sourceRef',
  'sourceRevision',
  'admissionRef',
  'approvalRevision',
  'permissionRevision',
  'executorRef',
  'timeProviderRef',
  'holderId',
  'fencingToken',
] as const;
function binding(value: unknown): asserts value is InertReserveBinding {
  const b = record(value, bindingFields);
  for (const key of bindingFields) {
    const field = b[key];
    if (key === 'commandFingerprint') digest(field);
    else if (key === 'canonicalIntent') text(field);
    else if (key === 'intentSimTime' || key === 'fencingToken') count(field);
    else if (key === 'currency') {
      if (typeof field !== 'string' || !/^[A-Z]{3}$/u.test(field))
        fail('DESCRIPTOR_CURRENCY');
    } else ref(field);
  }
  if (b.fencingToken === '0') fail('DESCRIPTOR_FENCE');
}
function head(value: unknown): asserts value is InertReserveHead {
  const h = record(value, ['worldVersion', 'eventSequence']);
  count(h.worldVersion);
  count(h.eventSequence);
}
function cache(value: unknown): asserts value is InertReserveCache {
  const c = record(value, [
    'key',
    'valueWorldVersion',
    'canonicalPayload',
    'payloadHash',
    'sourceCommandId',
  ]);
  ref(c.key);
  if (c.valueWorldVersion === null) {
    if (
      c.canonicalPayload !== null ||
      c.payloadHash !== null ||
      c.sourceCommandId !== null
    )
      fail('ABSENT_CACHE_INCONSISTENT');
  } else {
    if (count(c.valueWorldVersion) === '0') fail('CACHE_VERSION');
    text(c.canonicalPayload);
    digest(c.payloadHash);
    ref(c.sourceCommandId);
  }
}
function beforeCache(value: unknown): asserts value is InertReserveBeforeCache {
  const c = record(value, ['observationRef', 'observedWorldVersion', 'value']);
  ref(c.observationRef);
  count(c.observedWorldVersion);
  cache(c.value);
  if (
    c.value.valueWorldVersion !== null &&
    BigInt(c.value.valueWorldVersion) > BigInt(c.observedWorldVersion as string)
  )
    fail('CACHE_AHEAD');
}
function events(value: unknown): asserts value is readonly InertReserveEvent[] {
  const seen = new Set<string>();
  for (const raw of list(value)) {
    const e = record(raw, [
      'eventId',
      'sequence',
      'worldVersion',
      'commandId',
      'simTime',
      'canonicalEvent',
      'fingerprint',
    ]);
    const id = ref(e.eventId);
    if (seen.has(id)) fail('DUPLICATE_EVENT');
    seen.add(id);
    count(e.sequence);
    count(e.worldVersion);
    count(e.simTime);
    ref(e.commandId);
    text(e.canonicalEvent);
    digest(e.fingerprint);
  }
}
function final(value: unknown): asserts value is InertReserveFinal {
  const f = record(value, [
    'commandId',
    'idempotencyKey',
    'commandFingerprint',
    'worldVersionBefore',
    'worldVersionAfter',
    'simTime',
    'outcome',
    'eventIds',
    'canonicalFinal',
  ]);
  ref(f.commandId);
  ref(f.idempotencyKey);
  digest(f.commandFingerprint);
  count(f.worldVersionBefore);
  count(f.worldVersionAfter);
  count(f.simTime);
  if (f.outcome !== 'COMMITTED') fail('FINAL_OUTCOME');
  list(f.eventIds).forEach(ref);
  text(f.canonicalFinal);
}
function cacheKey(b: InertReserveBinding): string {
  const hex = (s: string) =>
    [...s]
      .map((c) => c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'))
      .join('');
  return (
    'BUDGET_RESERVE_V1_' +
    [
      b.countryId,
      b.entityRef,
      b.envelopeRef,
      b.effectivePeriodRef,
      b.budgetLineRef,
    ]
      .map(hex)
      .join('_')
  );
}
function anchor(value: unknown): asserts value is InertReserveAnchor {
  const a = record(value, [
    'binding',
    'beforeHead',
    'sourceCutoff',
    'originalCache',
    'afterHead',
    'afterCache',
    'events',
    'final',
    'authorizationAudit',
    'outbox',
    'leaseRenewedAtReal',
    'leaseExpiresAtReal',
    'validity',
  ]);
  binding(a.binding);
  head(a.beforeHead);
  head(a.sourceCutoff);
  head(a.afterHead);
  beforeCache(a.originalCache);
  cache(a.afterCache);
  events(a.events);
  final(a.final);
  text(a.authorizationAudit);
  list(a.outbox).forEach(text);
  const renewed = timestamp(a.leaseRenewedAtReal),
    expires = timestamp(a.leaseExpiresAtReal);
  if (renewed >= expires) fail('LEASE_INTERVAL');
  const validityRefs = new Set<string>();
  for (const raw of list(a.validity)) {
    const v = record(raw, ['ref', 'effectiveAtReal', 'expiresAtReal']);
    const id = ref(v.ref),
      start = timestamp(v.effectiveAtReal);
    if (validityRefs.has(id)) fail('DUPLICATE_VALIDITY');
    validityRefs.add(id);
    if (v.expiresAtReal !== null && start >= timestamp(v.expiresAtReal))
      fail('VALIDITY_INTERVAL');
  }
  equal(a.sourceCutoff, a.beforeHead, 'SOURCE_CUTOFF');
  equal(
    a.originalCache.observedWorldVersion,
    a.beforeHead.worldVersion,
    'CACHE_OBSERVED_HEAD',
  );
  equal(a.originalCache.value.key, cacheKey(a.binding), 'CACHE_KEY');
  equal(a.afterCache.key, a.originalCache.value.key, 'CACHE_KEY');
  if (
    a.events.length === 0 ||
    BigInt(a.afterHead.worldVersion) !==
      BigInt(a.beforeHead.worldVersion) + 1n ||
    BigInt(a.afterHead.eventSequence) !==
      BigInt(a.beforeHead.eventSequence) + BigInt(a.events.length)
  )
    fail('AFTER_HEAD');
  for (const [i, event] of a.events.entries()) {
    if (
      event.sequence !==
        (BigInt(a.beforeHead.eventSequence) + BigInt(i) + 1n).toString() ||
      event.worldVersion !== a.afterHead.worldVersion ||
      event.commandId !== a.binding.commandId ||
      event.simTime !== a.binding.intentSimTime
    )
      fail('EVENT_CAUSATION');
  }
  if (
    a.final.commandId !== a.binding.commandId ||
    a.final.idempotencyKey !== a.binding.idempotencyKey ||
    a.final.commandFingerprint !== a.binding.commandFingerprint ||
    a.final.simTime !== a.binding.intentSimTime ||
    a.final.worldVersionBefore !== a.beforeHead.worldVersion ||
    a.final.worldVersionAfter !== a.afterHead.worldVersion
  )
    fail('FINAL_CAUSATION');
  equal(
    a.final.eventIds,
    a.events.map((e) => e.eventId),
    'FINAL_EVENT_SET',
  );
  if (
    a.afterCache.valueWorldVersion !== a.afterHead.worldVersion ||
    a.afterCache.sourceCommandId !== a.binding.commandId
  )
    fail('AFTER_CACHE_CAUSATION');
}

/** Describes a complete S/L/H/D/A/C/Q lock plan, not actual acquired locks.
 * Resource bounds/lexical checks are local descriptor limits, not new law. */
export function inspectReserveLockPlan(value: unknown): InertReserveCheck {
  return inspect(() => {
    const p = record(value, ['worldId', 'commandId', 'locks']);
    ref(p.worldId);
    ref(p.commandId);
    const ranks = ['S', 'L', 'H', 'D', 'A', 'C', 'Q'];
    const seen = new Set<string>(),
      rankCounts = new Map<string, number>();
    let previousRank = -1,
      previousResource = '';
    for (const raw of list(p.locks)) {
      const l = record(raw, ['rank', 'worldId', 'resourceId', 'mode']);
      if (typeof l.rank !== 'string' || !ranks.includes(l.rank))
        fail('LOCK_RANK');
      const index = ranks.indexOf(l.rank),
        resource = ref(l.resourceId);
      if (l.worldId !== p.worldId) fail('LOCK_WORLD');
      if (
        index < previousRank ||
        (index === previousRank && resource <= previousResource)
      )
        fail('LOCK_ORDER');
      if (seen.has(resource)) fail('DUPLICATE_LOCK');
      seen.add(resource);
      rankCounts.set(l.rank, (rankCounts.get(l.rank) ?? 0) + 1);
      if (l.mode !== 'UPDATE' && l.mode !== 'SHARE') fail('LOCK_MODE');
      if (!['D', 'A'].includes(l.rank) && l.mode !== 'UPDATE')
        fail('LOCK_MODE');
      if (l.rank === 'S' && resource !== p.commandId)
        fail('OTHER_SUBMISSION_LOCK');
      previousRank = index;
      previousResource = resource;
    }
    for (const rank of ranks) {
      const n = rankCounts.get(rank) ?? 0;
      if (n === 0 || (!['D', 'A'].includes(rank) && n !== 1))
        fail('LOCK_COVERAGE');
    }
  });
}

/** PREWRITE and POST_TAIL intentionally have DIFFERENT head/cache/Q tests.
 * Rechecking POST_TAIL is read-only descriptor comparison, never apply/replay.
 * Opaque canonical strings/hashes are compared, NOT authenticated or parsed
 * into a budget truth. Native observations and current permissions remain
 * unproven even when this function returns INERT_CONSISTENT. */
export function inspectReservePhase(
  frozen: unknown,
  value: unknown,
): InertReserveCheck {
  return inspect(() => {
    anchor(frozen);
    const s = record(value, [
      'phase',
      'binding',
      'head',
      'sourceCutoff',
      'originalCache',
      'currentCache',
      'queue',
      'events',
      'final',
      'authorizationAudit',
      'outbox',
      'tailCalls',
      'deltaApplications',
      'cacheWrites',
      'financialPostings',
      'inventoryPostings',
      'cutoffReal',
      'previousCutoffReal',
      'cutoffOrdinal',
      'lastBarrierOrdinal',
      'tailCompleteOrdinal',
    ]);
    if (s.phase !== 'PREWRITE' && s.phase !== 'POST_TAIL') fail('PHASE');
    binding(s.binding);
    head(s.head);
    head(s.sourceCutoff);
    beforeCache(s.originalCache);
    cache(s.currentCache);
    events(s.events);
    if (s.final !== null) final(s.final);
    if (s.authorizationAudit !== null) text(s.authorizationAudit);
    list(s.outbox).forEach(text);
    for (const k of [
      'tailCalls',
      'deltaApplications',
      'cacheWrites',
      'financialPostings',
      'inventoryPostings',
      'cutoffOrdinal',
      'lastBarrierOrdinal',
    ] as const)
      count(s[k]);
    const cutoff = timestamp(s.cutoffReal);
    if (
      s.previousCutoffReal !== null &&
      timestamp(s.previousCutoffReal) > cutoff
    )
      fail('TIME_REGRESSION');
    if (
      BigInt(s.cutoffOrdinal as string) <=
      BigInt(s.lastBarrierOrdinal as string)
    )
      fail('STALE_CUTOFF');
    if (
      cutoff < frozen.leaseRenewedAtReal ||
      cutoff >= frozen.leaseExpiresAtReal
    )
      fail('LEASE_EXPIRED_OR_FUTURE');
    for (const v of frozen.validity)
      if (
        cutoff < v.effectiveAtReal ||
        (v.expiresAtReal !== null && cutoff >= v.expiresAtReal)
      )
        fail('VALIDITY_EXPIRED_OR_FUTURE');
    equal(s.binding, frozen.binding, 'BINDING_CHANGED');
    equal(s.sourceCutoff, frozen.beforeHead, 'SOURCE_CUTOFF');
    equal(s.originalCache, frozen.originalCache, 'ORIGINAL_CAS_CHANGED');
    const q = record(s.queue, [
      'commandId',
      'holderId',
      'fencingToken',
      'authorityKind',
      'intentSimTime',
      'state',
    ]);
    if (
      q.commandId !== frozen.binding.commandId ||
      q.holderId !== frozen.binding.holderId ||
      q.fencingToken !== frozen.binding.fencingToken ||
      q.authorityKind !== 'DISCRETIONARY_USER' ||
      q.intentSimTime !== frozen.binding.intentSimTime
    )
      fail('QUEUE_CAUSATION');
    if (s.financialPostings !== '0' || s.inventoryPostings !== '0')
      fail('UNEXPECTED_POSTINGS');
    if (s.phase === 'PREWRITE') {
      equal(s.head, frozen.beforeHead, 'PREWRITE_HEAD');
      equal(s.currentCache, frozen.originalCache.value, 'PREWRITE_CACHE');
      if (q.state !== 'CLAIMED') fail('PREWRITE_QUEUE');
      if (
        s.tailCalls !== '0' ||
        s.deltaApplications !== '0' ||
        s.cacheWrites !== '0' ||
        s.tailCompleteOrdinal !== null ||
        s.events.length !== 0 ||
        s.final !== null ||
        s.authorizationAudit !== null ||
        list(s.outbox).length !== 0
      )
        fail('PREWRITE_ALREADY_APPLIED');
    } else {
      if (s.previousCutoffReal === null) fail('POST_TAIL_PREVIOUS_CUTOFF');
      if (
        s.tailCompleteOrdinal === null ||
        BigInt(count(s.tailCompleteOrdinal)) >=
          BigInt(s.cutoffOrdinal as string)
      )
        fail('POST_TAIL_ORDER');
      equal(s.head, frozen.afterHead, 'POST_TAIL_HEAD');
      equal(s.currentCache, frozen.afterCache, 'POST_TAIL_CACHE');
      if (q.state !== 'FINALIZED') fail('POST_TAIL_QUEUE');
      if (
        s.tailCalls !== '1' ||
        s.deltaApplications !== '1' ||
        s.cacheWrites !== '1'
      )
        fail('POST_TAIL_NOT_ONCE');
      equal(s.events, frozen.events, 'POST_TAIL_EVENTS');
      equal(s.final, frozen.final, 'POST_TAIL_FINAL');
      equal(s.authorizationAudit, frozen.authorizationAudit, 'POST_TAIL_AUDIT');
      equal(s.outbox, frozen.outbox, 'POST_TAIL_OUTBOX');
    }
  });
}

/** Pure classification of explicitly supplied phase evidence. It does not
 * recover receipts or infer rollback from a missing receipt / exception text. */
export function classifyReserveLifecycle(value: unknown): Readonly<{
  kind: 'INERT_CLASSIFICATION';
  economicOutcome: 'NOT_STARTED' | 'COMMITTED' | 'ROLLED_BACK' | 'UNKNOWN';
  cleanup: 'CONFIRMED' | 'CLEANUP_INCOMPLETE' | 'UNKNOWN';
  stopWork: boolean;
  productionAuthority: false;
  sourceAdmitted: false;
  runtimeConnected: false;
}> {
  const d = record(value, ['phaseEvidence', 'finalEvidence', 'cleanup']);
  const phase = text(d.phaseEvidence),
    receipt = text(d.finalEvidence),
    cleanup = text(d.cleanup);
  if (
    ![
      'NOT_STARTED',
      'COMMIT_ACK',
      'ROLLBACK_ACK',
      'COMMIT_UNKNOWN',
      'ROLLBACK_UNCONFIRMED',
    ].includes(phase) ||
    !['NONE', 'EXACT_COMMITTED_FINAL'].includes(receipt) ||
    !['CONFIRMED', 'CLEANUP_INCOMPLETE', 'UNKNOWN'].includes(cleanup)
  )
    fail('LIFECYCLE_SHAPE');
  // Phase evidence describes this attempt. An exact original FINAL may predate
  // it (receipt-first), even when this attempt never started or rolled back.
  const economicOutcome =
    phase === 'COMMIT_ACK' || receipt === 'EXACT_COMMITTED_FINAL'
      ? 'COMMITTED'
      : phase === 'ROLLBACK_ACK'
        ? 'ROLLED_BACK'
        : phase === 'NOT_STARTED'
          ? 'NOT_STARTED'
          : 'UNKNOWN';
  return Object.freeze({
    kind: 'INERT_CLASSIFICATION',
    economicOutcome,
    cleanup: cleanup as 'CONFIRMED' | 'CLEANUP_INCOMPLETE' | 'UNKNOWN',
    stopWork: economicOutcome === 'UNKNOWN' || cleanup !== 'CONFIRMED',
    productionAuthority: false,
    sourceAdmitted: false,
    runtimeConnected: false,
  });
}
