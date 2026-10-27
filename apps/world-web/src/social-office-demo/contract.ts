/** Browser-owned wire data only. No authoritative engine or server imports. */
export const SOCIAL_DEMO_ACTIONS = [
  'PLAN',
  'ADMIT',
  'SERVE',
  'GRADUATE_OLD',
  'GRADUATE_NEW',
] as const;
export type SocialDemoAction = (typeof SOCIAL_DEMO_ACTIONS)[number];
export interface SocialDemoRequest {
  readonly requestId: string;
  readonly action: SocialDemoAction;
  readonly expectedWorldVersion: string;
}
export interface SocialDemoReceipt {
  readonly schemaVersion: 'g-social-office-receipt-v1';
  readonly requestId: string;
  readonly commandId: string;
  readonly status: 'QUEUED' | 'UNKNOWN' | 'FINAL' | 'REJECTED';
  readonly worldVersion: string | null;
  readonly message: string;
}
export interface SocialDemoProjection {
  readonly schemaVersion: 'g-social-office-projection-v1';
  readonly sourceClass: 'SIMULATED_OPENING';
  readonly sourceAdmitted: false;
  readonly worldId: 'WORLD_SOCIAL_SINGLE_DEMO_V1';
  readonly countryId: 'COUNTRY_01';
  readonly worldVersion: string;
  readonly eventSequence: string;
  readonly dayIndex: string;
  readonly sourceGeneration: string;
  readonly sourceManifestHash: string;
  readonly labour: {
    readonly total: string;
    readonly employed: string;
    readonly student: string;
    readonly searching: string;
    readonly low: string;
    readonly medium: string;
    readonly high: string;
  };
  readonly employment: {
    readonly vacancies: string;
    readonly freeServiceSlots: string;
    readonly planState: 'NONE' | 'PENDING' | 'SETTLED';
    readonly matched: string | null;
    readonly planCommandId: string | null;
    readonly settlementCommandId: string | null;
  };
  readonly college: {
    readonly students: string;
    readonly graduates: string;
    readonly freeSeats: string;
    readonly budgetCommitted: string;
    readonly budgetRemaining: string;
    readonly currency: 'XAA';
    readonly cohorts: readonly {
      readonly cohortId: string;
      readonly state: 'OPEN' | 'GRADUATION_PROCESSED';
      readonly enrolled: string;
      readonly graduates: string;
      readonly retained: string;
    }[];
  };
  readonly clinic: {
    readonly served: string | null;
    readonly backlog: string;
    readonly medicineAvailable: string;
    readonly budgetCommitted: string;
    readonly budgetRemaining: string;
    readonly currency: 'XAA';
  };
  readonly availableActions: readonly SocialDemoAction[];
}
function record(
  value: unknown,
  fields: readonly string[],
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join('|') !== [...fields].sort().join('|')
  )
    throw Error('Incomplete demonstration wire fields');
  return value as Record<string, unknown>;
}
function text(v: unknown): string {
  if (typeof v !== 'string' || v.length > 2048)
    throw Error('Invalid demonstration wire text');
  return v;
}
function uint(v: unknown): string {
  const s = text(v);
  if (!/^(?:0|[1-9]\d*)$/u.test(s))
    throw Error('Invalid demonstration wire quantity');
  return s;
}
function decimal(v: unknown): string {
  const s = text(v);
  if (!/^(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/u.test(s))
    throw Error('Invalid demonstration wire amount');
  return s;
}
function freeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
export function parseSocialDemoRequest(
  input: unknown,
): Readonly<SocialDemoRequest> {
  const r = record(input, ['requestId', 'action', 'expectedWorldVersion']);
  const requestId = text(r.requestId),
    action = text(r.action);
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(
      requestId,
    ) ||
    !SOCIAL_DEMO_ACTIONS.includes(action as SocialDemoAction)
  )
    throw Error('Invalid demonstration request');
  return freeze({
    requestId,
    action: action as SocialDemoAction,
    expectedWorldVersion: uint(r.expectedWorldVersion),
  });
}
export function parseSocialDemoReceipt(
  input: unknown,
): Readonly<SocialDemoReceipt> {
  const r = record(input, [
    'schemaVersion',
    'requestId',
    'commandId',
    'status',
    'worldVersion',
    'message',
  ]);
  if (
    r.schemaVersion !== 'g-social-office-receipt-v1' ||
    !['QUEUED', 'UNKNOWN', 'FINAL', 'REJECTED'].includes(text(r.status))
  )
    throw Error('Invalid demonstration receipt type');
  const requestId = text(r.requestId),
    commandId = text(r.commandId),
    status = r.status as SocialDemoReceipt['status'];
  if (!requestId || !commandId)
    throw Error('Receipt is missing the original request identity');
  const worldVersion = r.worldVersion === null ? null : uint(r.worldVersion);
  if (status === 'FINAL' && worldVersion === null)
    throw Error('Final receipt is missing its durable version');
  return freeze({
    schemaVersion: 'g-social-office-receipt-v1',
    requestId,
    commandId,
    status,
    worldVersion,
    message: text(r.message),
  });
}
export function parseSocialDemoProjection(
  input: unknown,
): Readonly<SocialDemoProjection> {
  const r = record(input, [
    'schemaVersion',
    'sourceClass',
    'sourceAdmitted',
    'worldId',
    'countryId',
    'worldVersion',
    'eventSequence',
    'dayIndex',
    'sourceGeneration',
    'sourceManifestHash',
    'labour',
    'employment',
    'college',
    'clinic',
    'availableActions',
  ]);
  if (
    r.schemaVersion !== 'g-social-office-projection-v1' ||
    r.sourceClass !== 'SIMULATED_OPENING' ||
    r.sourceAdmitted !== false ||
    r.worldId !== 'WORLD_SOCIAL_SINGLE_DEMO_V1' ||
    r.countryId !== 'COUNTRY_01' ||
    !/^[a-f0-9]{64}$/u.test(text(r.sourceManifestHash))
  )
    throw Error('Invalid demonstration scope or source label');
  for (const k of [
    'worldVersion',
    'eventSequence',
    'dayIndex',
    'sourceGeneration',
  ])
    uint(r[k]);
  const l = record(r.labour, [
    'total',
    'employed',
    'student',
    'searching',
    'low',
    'medium',
    'high',
  ]);
  Object.values(l).forEach(uint);
  const job = record(r.employment, [
    'vacancies',
    'freeServiceSlots',
    'planState',
    'matched',
    'planCommandId',
    'settlementCommandId',
  ]);
  uint(job.vacancies);
  uint(job.freeServiceSlots);
  if (!['NONE', 'PENDING', 'SETTLED'].includes(text(job.planState)))
    throw Error('Invalid match plan state');
  if (job.matched !== null) uint(job.matched);
  for (const k of ['planCommandId', 'settlementCommandId'])
    if (job[k] !== null && !text(job[k]))
      throw Error('Invalid matching command identity');
  if (
    job.planState === 'NONE'
      ? job.planCommandId !== null ||
        job.matched !== null ||
        job.settlementCommandId !== null
      : job.planCommandId === null ||
        (job.planState === 'SETTLED'
          ? job.matched === null || job.settlementCommandId === null
          : job.matched !== null || job.settlementCommandId !== null)
  )
    throw Error('Incomplete original matching result');
  const e = record(r.college, [
    'students',
    'graduates',
    'freeSeats',
    'budgetCommitted',
    'budgetRemaining',
    'currency',
    'cohorts',
  ]);
  for (const k of ['students', 'graduates', 'freeSeats']) uint(e[k]);
  for (const k of ['budgetCommitted', 'budgetRemaining']) decimal(e[k]);
  if (e.currency !== 'XAA' || !Array.isArray(e.cohorts) || e.cohorts.length > 8)
    throw Error('Invalid course data');
  const ids = new Set<string>();
  for (const value of e.cohorts) {
    const c = record(value, [
      'cohortId',
      'state',
      'enrolled',
      'graduates',
      'retained',
    ]);
    if (
      ids.has(text(c.cohortId)) ||
      !['OPEN', 'GRADUATION_PROCESSED'].includes(text(c.state))
    )
      throw Error('Invalid cohort identity');
    ids.add(text(c.cohortId));
    for (const k of ['enrolled', 'graduates', 'retained']) uint(c[k]);
  }
  const h = record(r.clinic, [
    'served',
    'backlog',
    'medicineAvailable',
    'budgetCommitted',
    'budgetRemaining',
    'currency',
  ]);
  if (h.served !== null) uint(h.served);
  for (const k of ['backlog', 'medicineAvailable']) uint(h[k]);
  for (const k of ['budgetCommitted', 'budgetRemaining']) decimal(h[k]);
  if (
    h.currency !== 'XAA' ||
    !Array.isArray(r.availableActions) ||
    r.availableActions.length > 5 ||
    new Set(r.availableActions).size !== r.availableActions.length ||
    r.availableActions.some(
      (a) => !SOCIAL_DEMO_ACTIONS.includes(a as SocialDemoAction),
    )
  )
    throw Error('Invalid available demonstration actions');
  return freeze(JSON.parse(JSON.stringify(r)) as SocialDemoProjection);
}
