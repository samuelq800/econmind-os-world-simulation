import { describe, expect, it } from 'vitest';
import { createElement } from '../../apps/world-web/node_modules/react';
import { renderToStaticMarkup } from '../../apps/world-web/node_modules/react-dom/server';

import type {
  AuthorizedBrowserIdentity,
  BrowserCommandResult,
  BrowserReadResult,
} from '../../apps/world-web/src/authorized-client/client.js';
import {
  resolveAuthorizedUi,
  type AuthorizedUiInjection,
} from '../../apps/world-web/src/prototype/authorized-read-adapter.js';
import { commandLifecycleCopy } from '../../apps/world-web/src/prototype/CommandLifecycleStatus.js';
import { AuthorizedMetricValueTrail } from '../../apps/world-web/src/prototype/MetricValueTrail.js';
import { SixOfficesG01 } from '../../apps/world-web/src/prototype/SixOfficesG01.js';
import { fixtureProjectionForOffice } from '../../apps/world-web/src/prototype/fixtures.js';

const identity: AuthorizedBrowserIdentity = {
  worldId: 'WORLD_TEST',
  countryId: 'COUNTRY_NORTH',
  officeId: 'FINANCE',
  scopeKey: 'SCOPE_TEST',
  authSubjectId: 'subject-1',
  authorizationRevision: 'rev-1',
  modelVersion: 'model-1',
  projectionVersion: 'projection-1',
  classification: 'OFFICE_PRIVATE',
};

const payload = {
  schemaVersion: 'g02-derived-read-v1',
  worldId: identity.worldId,
  countryId: identity.countryId,
  officeId: identity.officeId,
  scopeKey: identity.scopeKey,
  authSubjectId: identity.authSubjectId,
  authorizationRevision: identity.authorizationRevision,
  modelVersion: identity.modelVersion,
  projectionVersion: identity.projectionVersion,
  classification: identity.classification,
  worldVersion: '42',
  snapshotRef: 'SNAPSHOT_42',
  metrics: [
    {
      id: 'GRAIN',
      label: 'Available grain',
      canonicalValue: '128000',
      displayValue: '128k',
      unit: 'tonnes',
      changeLabel: '−18k',
      accessibleSummary: 'Available grain fell by 18,000 tonnes.',
    },
  ],
  trails: [
    {
      metricId: 'GRAIN',
      input: { canonicalValue: '146000', sourceRef: 'INPUT_41' },
      difference: {
        canonicalValue: '-18000',
        label: 'Reserved stock',
        eventId: 'EVENT_42',
        eventVersion: '42',
      },
      output: { canonicalValue: '128000', snapshotVersion: '42' },
    },
  ],
};

function injection(
  readResult: BrowserReadResult | null = {
    status: 'PROJECTION',
    source: 'DERIVED_SERVER_PROJECTION',
    worldVersion: '42',
    snapshotRef: 'SNAPSHOT_42',
    payload,
  },
  commandResult: BrowserCommandResult | null = null,
): AuthorizedUiInjection {
  return {
    currentIdentity: identity,
    read: readResult ? { identity, result: readResult } : null,
    command: commandResult
      ? { identity, commandId: 'COMMAND_42', result: commandResult }
      : null,
  };
}

describe('authorized G02 display binding', () => {
  it('starts without a current projection or Command result', () => {
    const state = resolveAuthorizedUi({
      currentIdentity: null,
      read: null,
      command: null,
    });
    expect(state.read.kind).toBe('UNAVAILABLE');
    expect(state.command.kind).toBe('UNAVAILABLE');
  });

  it('shows only explicitly bound derived metrics and exact arithmetic trail', () => {
    const state = resolveAuthorizedUi(injection());
    expect(state.read.kind).toBe('CURRENT');
    if (state.read.kind !== 'CURRENT') return;
    expect(state.read.metrics[0]?.canonicalValue).toBe('128000');
    expect(state.read.trails[0]?.difference.canonicalValue).toBe('-18000');
    expect(state.command.kind).toBe('UNAVAILABLE');
  });

  it.each([
    ['missing G02 schema', { ...payload, schemaVersion: 'world-read-api-v1' }],
    [
      'different authorization revision',
      { ...payload, authorizationRevision: 'rev-old' },
    ],
    ['different subject', { ...payload, authSubjectId: 'other' }],
    [
      'forged output',
      {
        ...payload,
        trails: [
          {
            ...payload.trails[0],
            output: { canonicalValue: '130000', snapshotVersion: '42' },
          },
        ],
      },
    ],
    [
      'invalid arithmetic',
      {
        ...payload,
        trails: [
          {
            ...payload.trails[0],
            difference: {
              ...payload.trails[0].difference,
              canonicalValue: '-17000',
            },
          },
        ],
      },
    ],
  ])('withholds private numbers for %s', (_name, invalidPayload) => {
    expect(
      resolveAuthorizedUi(
        injection({
          status: 'PROJECTION',
          source: 'DERIVED_SERVER_PROJECTION',
          worldVersion: '42',
          snapshotRef: 'SNAPSHOT_42',
          payload: invalidPayload,
        }),
      ).read.kind,
    ).toBe('UNAVAILABLE');
  });

  it('clears stale values when the current identity changes or read is denied', () => {
    expect(
      resolveAuthorizedUi({
        ...injection(),
        currentIdentity: { ...identity, authorizationRevision: 'rev-2' },
      }).read.kind,
    ).toBe('UNAVAILABLE');
    const denied = resolveAuthorizedUi(injection({ status: 'DENIED' }));
    expect(denied.read.kind).toBe('UNAVAILABLE');
    expect(denied.command.kind).toBe('AUTHORIZATION_REVOKED');
  });

  it('keeps UNKNOWN separate from submission pending and final receipt, withholding old values', () => {
    const state = resolveAuthorizedUi(
      injection(undefined, { status: 'UNKNOWN' }),
    );
    expect(state.command.kind).toBe('UNKNOWN_OUTCOME');
    expect(state.read.kind).toBe('UNAVAILABLE');
    expect(commandLifecycleCopy(state.command).title).toBe('Outcome unknown');
    expect(
      commandLifecycleCopy({
        source: 'AUTHORIZED_READ_MODEL',
        kind: 'SUBMITTED_AWAITING_FINAL_RECEIPT',
        commandId: 'COMMAND_42',
      }).title,
    ).toBe('Submitted · awaiting final receipt');
  });

  it('shows only a matching final receipt and withholds a projection behind its version', () => {
    const final: BrowserCommandResult = {
      status: 'FINAL_RECEIPT',
      receipt: {
        source: 'DURABLE_FINAL_COMMAND_RECEIPT',
        worldId: identity.worldId,
        commandId: 'COMMAND_42',
        idempotencyKey: 'KEY_42',
        commandFingerprint: `sha256:${'a'.repeat(64)}`,
        outcome: 'COMMITTED',
        reasonCode: null,
        worldVersionAfter: '43',
        eventIds: ['EVENT_43'],
        recordedAtReal: '2026-09-24T00:00:00.000Z',
      },
    };
    const state = resolveAuthorizedUi(injection(undefined, final));
    expect(state.command.kind).toBe('SUCCEEDED');
    expect(state.read.kind).toBe('UNAVAILABLE');
    const mismatch = resolveAuthorizedUi(
      injection(undefined, {
        ...final,
        receipt: { ...final.receipt, commandId: 'OTHER' },
      }),
    );
    expect(mismatch.command.kind).toBe('UNAVAILABLE');
    const forgedSource = resolveAuthorizedUi(
      injection(undefined, {
        ...final,
        receipt: { ...final.receipt, source: 'NOT_DURABLE' },
      } as BrowserCommandResult),
    );
    expect(forgedSource.command.kind).toBe('UNAVAILABLE');
  });

  it('renders a source-backed trail with a missing receipt clearly separated from a linked final receipt', () => {
    const state = resolveAuthorizedUi(injection());
    expect(state.read.kind).toBe('CURRENT');
    if (state.read.kind !== 'CURRENT') return;
    const metric = state.read.metrics[0]!;
    const trail = state.read.trails[0]!;
    const withoutReceipt = renderToStaticMarkup(
      createElement(AuthorizedMetricValueTrail, {
        metric,
        trail,
        command: state.command,
      }),
    );
    expect(withoutReceipt).toContain('INPUT_41');
    expect(withoutReceipt).toContain('No matching final receipt supplied');
    const linked = renderToStaticMarkup(
      createElement(AuthorizedMetricValueTrail, {
        metric,
        trail,
        command: {
          source: 'AUTHORIZED_READ_MODEL',
          kind: 'SUCCEEDED',
          receipt: {
            outcome: 'COMMITTED',
            commandId: 'COMMAND_42',
            worldVersionAfter: '42',
            eventIds: ['EVENT_42'],
          },
        },
      }),
    );
    expect(linked).toContain('COMMAND_42');
    expect(linked).not.toContain('No matching final receipt supplied');
  });

  it('does not render fixture private values inside the authorized Office route', () => {
    const markup = renderToStaticMarkup(
      createElement(SixOfficesG01, {
        state: {
          status: 'ready',
          projection: fixtureProjectionForOffice('TRADE'),
        },
        onRetry: () => undefined,
        onReturnToEntry: () => undefined,
        authorized: { currentIdentity: null, read: null, command: null },
      }),
    );
    expect(markup).toContain('AUTHORIZED VIEW UNAVAILABLE');
    expect(markup).toContain('Authorized signals unavailable');
    expect(markup).not.toContain('LOCAL FIXTURE VIEW');
    expect(markup).not.toContain('146k');
    expect(markup).not.toContain('WORLD-PROTOTYPE-ONLY');
  });

  it('announces UNKNOWN as an alert without leaking the previous projection', () => {
    const markup = renderToStaticMarkup(
      createElement(SixOfficesG01, {
        state: {
          status: 'ready',
          projection: fixtureProjectionForOffice('TRADE'),
        },
        onRetry: () => undefined,
        onReturnToEntry: () => undefined,
        authorized: injection(undefined, { status: 'UNKNOWN' }),
      }),
    );
    expect(markup).toContain('Outcome unknown');
    expect(markup).toContain('role="alert"');
    expect(markup).not.toContain('128k');
    expect(markup).not.toContain('Reserved stock');
  });
});
