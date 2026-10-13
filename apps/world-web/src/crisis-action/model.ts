import {
  parseAuthority,
  READ_OFFICES,
  validConfig,
  type ProductionReadConfig,
  type ServerReadAuthority,
} from '../production-read/contract.js';

export type CrisisOffice = (typeof READ_OFFICES)[number];
export const crisisOfficeLabels: Record<CrisisOffice, string> = {
  CAPTAIN: '国家负责人',
  CENTRAL_BANK: '央行行长',
  FINANCE: '财政与经济',
  INDUSTRY: '产业科技资源',
  SOCIAL: '劳工教育社会发展',
  TRADE: '贸易与外交',
};

/** Presentation semantics only. This is not a new server DTO, permission,
 * endpoint, economic model, or substitute for the authorized read adapter. */
export interface CrisisProvenance {
  readonly sourceRef: string;
  readonly effectiveAt: string;
  readonly version: string;
}

export interface CrisisClock {
  readonly realStartAt: string;
  readonly realEndAt: string;
  readonly serverNow: string;
  readonly worldTimeLabel: string;
  readonly worldRate: string;
}

export interface CrisisShortage extends CrisisProvenance {
  readonly shortageId: string;
  readonly resourceId: string;
  readonly label: string;
  readonly unit: string;
  readonly current: string | null;
  readonly target: string | null;
  /** Always supplied by the authoritative metric; never computed in the UI. */
  readonly gap: string | null;
  readonly basis: 'INVENTORY' | 'VERIFIED_DELIVERY';
  readonly expectedArrival: string | null;
  readonly locationId: string | null;
}

export interface CrisisLocation extends CrisisProvenance {
  readonly locationId: string;
  readonly label: string;
  readonly kind: 'SHORTAGE' | 'SUPPLY' | 'TRANSPORT' | 'DELIVERY';
  /** Stable authority reference. The map host resolves its canonical geometry. */
  readonly geographyRef: string;
  readonly mapSource: string;
  readonly mapVersion: string;
}

export interface CrisisRoute extends CrisisProvenance {
  readonly routeId: string;
  readonly fromLocationId: string;
  readonly toLocationId: string;
  readonly geometryRef: string;
  readonly mode: string;
  readonly passage: 'OPEN' | 'BLOCKED' | 'UNKNOWN';
  readonly validatedAt: string | null;
}

export type CrisisTaskStatus =
  | 'PROPOSED'
  | 'APPROVED'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'COMMISSIONED'
  | 'RETURNED'
  | 'CANCELLED'
  | 'FAILED';
export const crisisStatusLabels: Record<CrisisTaskStatus, string> = {
  PROPOSED: '提案',
  APPROVED: '已批准',
  IN_TRANSIT: '运输中',
  DELIVERED: '已交付',
  COMMISSIONED: '已投产',
  RETURNED: '已退回',
  CANCELLED: '已取消',
  FAILED: '失败',
};

export interface CrisisTask extends CrisisProvenance {
  readonly taskId: string;
  readonly label: string;
  readonly locationId: string | null;
  readonly status: CrisisTaskStatus;
  readonly ownerLabel: string | null;
  readonly requiredOffices: readonly CrisisOffice[];
  readonly nextStep: string | null;
  readonly resourcesLabel: string | null;
  readonly expectedEffect: string | null;
  readonly evidenceRefs: readonly string[];
  /** Already filtered by current server authorization. Office titles do not
   * imply actions. This read-only shell cannot execute any returned action. */
  readonly allowedActions: readonly {
    readonly actionId: string;
    readonly label: string;
  }[];
}

export interface CrisisContribution extends CrisisProvenance {
  readonly contributionId: string;
  readonly taskId: string;
  readonly eventId: string;
  readonly contributorLabel: string;
  readonly locationId: string | null;
  readonly kind: 'DELIVERY' | 'COMMISSIONING';
  readonly resultLabel: string;
  readonly verifiedAt: string | null;
  readonly evidenceRef: string | null;
}

export type CrisisFeedbackOrigin =
  | 'CITIZEN_PLAYER'
  | 'CITIZEN_SIMULATION'
  | 'GOVERNMENT_SIMULATION'
  | 'PLAYER_DIPLOMACY';
export const crisisFeedbackLabels: Record<CrisisFeedbackOrigin, string> = {
  CITIZEN_PLAYER: '民众声音 · 玩家内容',
  CITIZEN_SIMULATION: '民众声音 · 系统模拟',
  GOVERNMENT_SIMULATION: '他国回应 · 系统模拟',
  PLAYER_DIPLOMACY: '玩家外交',
};
export interface CrisisFeedback extends CrisisProvenance {
  readonly feedbackId: string;
  readonly origin: CrisisFeedbackOrigin;
  readonly text: string;
  readonly generatedAt: string;
  readonly relatedEventIds: readonly string[];
  readonly taskId: string | null;
  readonly locationId: string | null;
}

/** The existing trusted read adapter must authorize and filter every child
 * object before constructing this view. A public page cannot manufacture it. */
export interface CrisisPresentation extends CrisisProvenance {
  readonly worldId: string;
  readonly countryId: string;
  readonly countryLabel: string;
  readonly eventId: string;
  readonly eventLabel: string;
  readonly worldVersion: string;
  readonly eventSequence: string;
  readonly officeId: CrisisOffice;
  readonly clock: CrisisClock | null;
  readonly shortages: readonly CrisisShortage[];
  readonly locations: readonly CrisisLocation[];
  readonly routes: readonly CrisisRoute[];
  readonly tasks: readonly CrisisTask[];
  readonly contributions: readonly CrisisContribution[];
  readonly feedback: readonly CrisisFeedback[];
}

declare const boundCrisisView: unique symbol;
export interface BoundCrisisView {
  readonly [boundCrisisView]: true;
  readonly presentation: CrisisPresentation;
  readonly readbackRef: string;
}
// Runtime branding prevents structural casts from granting a usable UI view.
const issuedViews = new WeakMap<object, ProductionReadConfig>();
function currentSession(config: ProductionReadConfig): boolean {
  try {
    const current = config.currentIdentity();
    return (
      config.session.isCurrent() &&
      current !== null &&
      (Object.keys(config.identity) as (keyof typeof config.identity)[]).every(
        (key) => config.identity[key] === current[key],
      )
    );
  } catch {
    return false;
  }
}
export function isBoundCrisisView(value: unknown): value is BoundCrisisView {
  if (typeof value !== 'object' || value === null) return false;
  const config = issuedViews.get(value);
  if (!config) return false;
  if (currentSession(config)) return true;
  issuedViews.delete(value);
  return false;
}

export type CrisisReadState =
  | { readonly status: 'UNBOUND' | 'LOADING' | 'DENIED' }
  | { readonly status: 'CURRENT'; readonly view: BoundCrisisView }
  | {
      readonly status: 'STALE' | 'ERROR';
      readonly view: BoundCrisisView | null;
    };

const sourced = (value: CrisisProvenance) =>
  value.sourceRef.trim().length > 0 &&
  value.version.trim().length > 0 &&
  timestamp(value.effectiveAt) !== null;
const timestamp = (value: string): number | null => {
  if (!/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/u.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** No browser clock or timer. Recompute only when an authorized server read
 * supplies serverNow. World time/rate never changes this real deadline. */
export function crisisWindow(clock: CrisisClock | null): {
  readonly status: 'UNKNOWN' | 'UPCOMING' | 'OPEN' | 'CLOSED';
  readonly remainingLabel: string;
} {
  const start = clock && timestamp(clock.realStartAt);
  const end = clock && timestamp(clock.realEndAt);
  const now = clock && timestamp(clock.serverNow);
  if (start === null || end === null || now === null || end <= start)
    return { status: 'UNKNOWN', remainingLabel: '暂无服务端时间' };
  if (now < start) return { status: 'UPCOMING', remainingLabel: '尚未开始' };
  if (now >= end) return { status: 'CLOSED', remainingLabel: '活动已结束' };
  const minutes = Math.floor((end - now) / 60_000);
  return {
    status: 'OPEN',
    remainingLabel: `${Math.floor(minutes / 1440)} 天 ${Math.floor((minutes % 1440) / 60)} 小时 ${minutes % 60} 分钟`,
  };
}

/** This binds a trusted adapter's presentation to existing server authority;
 * it does not validate arbitrary JSON, certify its facts, or create an API. */
export function bindCrisisPresentation(
  presentation: CrisisPresentation,
  authority: ServerReadAuthority | unknown,
  config: ProductionReadConfig,
): BoundCrisisView | null {
  if (!validConfig(config) || !currentSession(config)) return null;
  const parsed = parseAuthority(authority, config);
  if (
    !parsed ||
    presentation.worldId !== config.identity.worldId ||
    presentation.countryId !== config.identity.countryId ||
    presentation.officeId !== config.identity.officeId ||
    !READ_OFFICES.includes(presentation.officeId) ||
    presentation.worldVersion !== parsed.readback.worldVersion ||
    presentation.eventSequence !== parsed.readback.eventSequence ||
    !sourced(presentation) ||
    !presentation.shortages.every(sourced) ||
    !presentation.tasks.every(sourced)
  )
    return null;
  const snapshot: CrisisPresentation = JSON.parse(JSON.stringify(presentation));
  const freeze = (value: unknown): void => {
    if (typeof value !== 'object' || value === null || Object.isFrozen(value))
      return;
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  };
  freeze(snapshot);
  const view = Object.freeze({
    presentation: snapshot,
    readbackRef: parsed.readback.readbackRef,
  }) as BoundCrisisView;
  issuedViews.set(view, config);
  return view;
}

export function crisisPresentation(
  state: CrisisReadState,
): CrisisPresentation | null {
  return 'view' in state && isBoundCrisisView(state.view)
    ? state.view.presentation
    : null;
}

/** Only source-bearing, authority-resolved locations/routes reach the map.
 * Blocked routes may be displayed as blocked, never made executable. */
export function crisisMapObjects(view: CrisisPresentation | null) {
  const locations = (view?.locations ?? []).filter(
    (location) =>
      sourced(location) &&
      location.geographyRef.trim().length > 0 &&
      location.mapSource.trim().length > 0 &&
      location.mapVersion.trim().length > 0,
  );
  const ids = new Set(locations.map((location) => location.locationId));
  const routes = (view?.routes ?? []).filter(
    (route) =>
      sourced(route) &&
      route.geometryRef.trim().length > 0 &&
      route.validatedAt !== null &&
      timestamp(route.validatedAt) !== null &&
      ids.has(route.fromLocationId) &&
      ids.has(route.toLocationId),
  );
  return { locations, routes };
}

/** Proposals, claims, approvals, forecasts and transport cannot enter this
 * feed. Corrections/de-duplication are the server's responsibility; the UI
 * additionally avoids showing a repeated authoritative completion event. */
export function crisisVerifiedContributions(view: CrisisPresentation | null) {
  const seen = new Set<string>();
  return (view?.contributions ?? []).filter((item) => {
    if (
      !['DELIVERY', 'COMMISSIONING'].includes(item.kind) ||
      !sourced(item) ||
      !item.evidenceRef ||
      !item.verifiedAt ||
      timestamp(item.verifiedAt) === null ||
      !item.eventId ||
      seen.has(item.eventId)
    )
      return false;
    seen.add(item.eventId);
    return true;
  });
}

export function crisisSourcedFeedback(view: CrisisPresentation | null) {
  return (view?.feedback ?? []).filter(
    (item) =>
      sourced(item) &&
      Object.hasOwn(crisisFeedbackLabels, item.origin) &&
      timestamp(item.generatedAt) !== null,
  );
}
