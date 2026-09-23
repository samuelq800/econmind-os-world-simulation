import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { PREPARATION_ONLY_MARKER } from '../../apps/world-web/src/prototype/contracts.js';
import {
  fixtureProjectionForOffice,
  READY_PROJECTION,
} from '../../apps/world-web/src/prototype/fixtures.js';
import { preparationOfficeActionAdapter as adapter } from '../../apps/world-web/src/prototype/office-action-adapter.js';

const overview = readFileSync(
  'apps/world-web/src/prototype/NationalOverview.tsx',
  'utf8',
);

describe('V25.2 preparation event-to-Office handoff', () => {
  it('opens only a same-Office, event-specific local rehearsal route', async () => {
    const projection = fixtureProjectionForOffice('TRADE');
    const event = projection.events[0]!;
    const model = adapter.readModel({ projection, event, state: 'ready' });

    expect(model).toMatchObject({
      marker: PREPARATION_ONLY_MARKER,
      source: 'LOCAL_FIXTURE',
      kind: 'LOCAL_REHEARSAL_ROUTE',
      eventId: event.eventId,
      routeId: 'ROUTE-PROTOTYPE-TRADE',
    });
    expect(adapter.commandAvailability()).toMatchObject({
      kind: 'UNAVAILABLE',
      code: 'NO_AUTHORIZED_COMMAND_PORT',
    });
    expect(
      await adapter.submitCommand({
        marker: PREPARATION_ONLY_MARKER,
        worldId: projection.worldId,
        countryId: projection.countryId,
        actingOfficeId: 'TRADE',
        eventId: event.eventId,
        routeId: 'ROUTE-PROTOTYPE-TRADE',
        expectedWorldVersion: projection.watermark.worldVersion,
        authorizationVersion: projection.authorizationVersion!,
      }),
    ).toMatchObject({ kind: 'UNAVAILABLE' });
  });

  it('blocks another Office, required approval, and a missing event route', () => {
    const tradeEvent = READY_PROJECTION.events[0]!;
    const financeEvent = READY_PROJECTION.events[1]!;
    const socialEvent = READY_PROJECTION.events[2]!;

    expect(
      adapter.readModel({
        projection: fixtureProjectionForOffice('CAPTAIN'),
        event: tradeEvent,
        state: 'ready',
      }),
    ).toMatchObject({
      kind: 'UNAVAILABLE',
      code: 'OTHER_OFFICE_OWNS_ACTION',
    });
    expect(
      adapter.readModel({
        projection: fixtureProjectionForOffice('FINANCE'),
        event: financeEvent,
        state: 'ready',
      }),
    ).toMatchObject({ kind: 'UNAVAILABLE', code: 'APPROVAL_REQUIRED' });
    expect(
      adapter.readModel({
        projection: fixtureProjectionForOffice('SOCIAL'),
        event: socialEvent,
        state: 'ready',
      }),
    ).toMatchObject({ kind: 'UNAVAILABLE', code: 'ROUTE_NOT_PROVIDED' });
  });

  it('fails closed for stale, offline, missing authorization, and mismatched route identity', () => {
    const projection = fixtureProjectionForOffice('TRADE');
    const event = projection.events[0]!;
    const input = { projection, event };

    expect(adapter.readModel({ ...input, state: 'stale' })).toMatchObject({
      code: 'PROJECTION_NOT_CURRENT',
    });
    expect(adapter.readModel({ ...input, state: 'offline' })).toMatchObject({
      code: 'QUERY_UNAVAILABLE',
    });
    expect(
      adapter.readModel({
        projection: { ...projection, authorizationVersion: null },
        event,
        state: 'ready',
      }),
    ).toMatchObject({ code: 'AUTHORIZATION_MISSING' });
    expect(
      adapter.readModel({
        projection: {
          ...projection,
          routes: projection.routes.map((route) => ({
            ...route,
            eventId: 'DIFFERENT-EVENT',
          })),
        },
        event,
        state: 'ready',
      }),
    ).toMatchObject({ code: 'ROUTE_NOT_PROVIDED' });
  });

  it('derives ownership from the supplied projection rather than a forged event object', () => {
    const projection = fixtureProjectionForOffice('TRADE');
    const forged = { ...projection.events[0]!, ownerOfficeId: 'CAPTAIN' };
    const model = adapter.readModel({
      projection,
      event: forged,
      state: 'ready',
    });

    expect(model.ownerOfficeId).toBe('TRADE');
    expect(model.kind).toBe('LOCAL_REHEARSAL_ROUTE');
    expect(overview).toContain('preparationOfficeActionAdapter.readModel');
    expect(overview).toContain('chooseEvent');
    expect(overview).not.toContain('fetch(');
    expect(overview).not.toContain('submitCommand(');
  });
});
