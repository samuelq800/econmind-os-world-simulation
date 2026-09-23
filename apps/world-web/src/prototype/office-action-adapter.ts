import { PREPARATION_ONLY_MARKER } from './contracts.js';
import type {
  PrototypeBriefEvent,
  PrototypeWorldBriefProjection,
} from './contracts.js';
import type { PrototypeViewState } from './state.js';

export type ReadableOfficeState = Extract<
  PrototypeViewState['status'],
  'ready' | 'empty' | 'stale' | 'offline' | 'retrying'
>;

export type OfficeActionBlockCode =
  | 'NO_EVENT'
  | 'PROJECTION_NOT_CURRENT'
  | 'QUERY_UNAVAILABLE'
  | 'AUTHORIZATION_MISSING'
  | 'OFFICE_NOT_BOUND'
  | 'OTHER_OFFICE_OWNS_ACTION'
  | 'ROUTE_NOT_PROVIDED'
  | 'APPROVAL_REQUIRED'
  | 'ROUTE_BLOCKED';

interface OfficeActionReadBase {
  readonly marker: typeof PREPARATION_ONLY_MARKER;
  readonly source: 'LOCAL_FIXTURE';
  readonly worldId: string;
  readonly countryId: string;
  readonly worldVersion: string;
  readonly actingOfficeId: string;
  readonly eventId: string | null;
  readonly ownerOfficeId: string | null;
  readonly routeLabel: string | null;
}

export type OfficeActionReadModel = OfficeActionReadBase &
  (
    | {
        readonly kind: 'LOCAL_REHEARSAL_ROUTE';
        readonly routeId: string;
        readonly reason: string;
      }
    | {
        readonly kind: 'UNAVAILABLE';
        readonly routeId: string | null;
        readonly code: OfficeActionBlockCode;
        readonly reason: string;
      }
  );

/** A browser handoff reference, never a canonical World Command envelope. */
export interface OfficeCommandHandoff {
  readonly marker: typeof PREPARATION_ONLY_MARKER;
  readonly worldId: string;
  readonly countryId: string;
  readonly actingOfficeId: string;
  readonly eventId: string;
  readonly routeId: string;
  readonly expectedWorldVersion: string;
  readonly authorizationVersion: string;
}

export type OfficeCommandOutcome = {
  readonly kind: 'UNAVAILABLE';
  readonly code: 'NO_AUTHORIZED_COMMAND_PORT';
  readonly reason: string;
};

export interface OfficeActionAdapter {
  readModel(input: {
    readonly projection: PrototypeWorldBriefProjection;
    readonly event: PrototypeBriefEvent | null;
    readonly state: ReadableOfficeState;
  }): OfficeActionReadModel;
  commandAvailability(): OfficeCommandOutcome;
  submitCommand(handoff: OfficeCommandHandoff): Promise<OfficeCommandOutcome>;
}

const unavailableCommand: OfficeCommandOutcome = {
  kind: 'UNAVAILABLE',
  code: 'NO_AUTHORIZED_COMMAND_PORT',
  reason: 'Live Command submission is not connected in this preparation build.',
};

function unavailable(
  base: OfficeActionReadBase,
  code: OfficeActionBlockCode,
  reason: string,
  routeId: string | null = null,
): OfficeActionReadModel {
  return { ...base, kind: 'UNAVAILABLE', routeId, code, reason };
}

export const preparationOfficeActionAdapter: OfficeActionAdapter = {
  readModel({ projection, event, state }) {
    const projectedEvent = event
      ? projection.events.find((item) => item.eventId === event.eventId)
      : undefined;
    const base: OfficeActionReadBase = {
      marker: PREPARATION_ONLY_MARKER,
      source: 'LOCAL_FIXTURE',
      worldId: projection.worldId,
      countryId: projection.countryId,
      worldVersion: projection.watermark.worldVersion,
      actingOfficeId: projection.viewer.actingOfficeId,
      eventId: projectedEvent?.eventId ?? null,
      ownerOfficeId: projectedEvent?.ownerOfficeId ?? null,
      routeLabel: null,
    };
    if (!projectedEvent) {
      return unavailable(
        base,
        'NO_EVENT',
        'Choose a recorded event to inspect its route.',
      );
    }
    if (state === 'offline' || state === 'retrying') {
      return unavailable(
        base,
        'QUERY_UNAVAILABLE',
        'The projection connection is unavailable. Refresh before following an action route.',
      );
    }
    if (state !== 'ready' || projection.freshness !== 'CURRENT') {
      return unavailable(
        base,
        'PROJECTION_NOT_CURRENT',
        'This snapshot is behind the current world. Refresh before following an action route.',
      );
    }
    if (!projection.authorizationVersion) {
      return unavailable(
        base,
        'AUTHORIZATION_MISSING',
        'No current Office authorization revision is present.',
      );
    }
    if (
      !projection.viewer.offices.some(
        (office) => office.officeId === base.actingOfficeId,
      )
    ) {
      return unavailable(
        base,
        'OFFICE_NOT_BOUND',
        'The selected Office is not present in this projection.',
      );
    }
    if (projectedEvent.ownerOfficeId !== base.actingOfficeId) {
      return unavailable(
        base,
        'OTHER_OFFICE_OWNS_ACTION',
        `${projectedEvent.ownerOfficeId} owns this event. Your current Office can inspect it but cannot act for that Office.`,
      );
    }
    const route = projection.routes.find(
      (item) =>
        item.eventId === projectedEvent.eventId &&
        item.officeId === projectedEvent.ownerOfficeId,
    );
    if (!route) {
      return unavailable(
        base,
        'ROUTE_NOT_PROVIDED',
        'No Office route is supplied for this event.',
      );
    }
    const routedBase = { ...base, routeLabel: route.label };
    if (route.availability === 'APPROVAL_REQUIRED') {
      return unavailable(
        routedBase,
        'APPROVAL_REQUIRED',
        route.reason,
        route.id,
      );
    }
    if (route.availability === 'BLOCKED') {
      return unavailable(routedBase, 'ROUTE_BLOCKED', route.reason, route.id);
    }
    return {
      ...routedBase,
      kind: 'LOCAL_REHEARSAL_ROUTE',
      routeId: route.id,
      reason:
        'Open your Office fixture to rehearse the response. No Command is submitted.',
    };
  },
  commandAvailability() {
    return unavailableCommand;
  },
  async submitCommand() {
    return unavailableCommand;
  },
};
