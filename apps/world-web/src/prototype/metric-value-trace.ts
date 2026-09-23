import {
  PREPARATION_ONLY_MARKER,
  type PrototypeWorldBriefProjection,
} from './contracts.js';
import type { ReadableOfficeState } from './office-action-adapter.js';

export interface FixtureValueTrail {
  readonly marker: typeof PREPARATION_ONLY_MARKER;
  readonly source: 'LOCAL_FIXTURE';
  readonly metricId: 'available-grain';
  readonly input: {
    readonly canonicalValue: '146000';
    readonly displayValue: '146k tonnes';
    readonly evidence: 'MISSING_SOURCE_RECORD';
  };
  readonly difference: {
    readonly canonicalValue: '-18000';
    readonly displayValue: '−18k tonnes';
    readonly label: 'Reserved stock';
    readonly sourceFact: {
      readonly eventId: string;
      readonly eventVersion: string;
      readonly detail: string;
    };
  };
  readonly output: {
    readonly canonicalValue: '128000';
    readonly displayValue: '128k tonnes';
    readonly snapshotVersion: string;
  };
  readonly receipt:
    | { readonly kind: 'LINKED_FIXTURE_RECEIPT'; readonly commandId: string }
    | { readonly kind: 'MISSING'; readonly reason: string };
}

export type FixtureValueTrailState =
  | { readonly kind: 'AVAILABLE'; readonly trail: FixtureValueTrail }
  | { readonly kind: 'MISSING'; readonly reason: string };

/** Exact local fixture comparison, never a World calculation or causal proof. */
export function fixtureValueTrail(
  projection: PrototypeWorldBriefProjection,
  metricId: string,
  status: ReadableOfficeState,
): FixtureValueTrailState {
  if (status !== 'ready' || projection.freshness !== 'CURRENT') {
    return {
      kind: 'MISSING',
      reason: 'Current evidence is unavailable. Refresh the fixture view.',
    };
  }

  const metric = projection.metrics.find((item) => item.id === metricId);
  if (!metric) {
    return { kind: 'MISSING', reason: 'This signal is not in the fixture.' };
  }
  if (metric.id !== 'available-grain') {
    return {
      kind: 'MISSING',
      reason:
        'No numeric input and linked source fact are supplied for this signal.',
    };
  }

  const event = projection.events.find(
    (item) => item.eventId === 'EVENT-PROTOTYPE-001',
  );
  const fact = event?.evidence.find((item) => item.kind === 'RECORDED_FACT');
  if (
    projection.marker !== PREPARATION_ONLY_MARKER ||
    projection.worldId !== 'WORLD-PROTOTYPE-ONLY' ||
    projection.countryId !== 'COUNTRY-NORTHSTAR' ||
    projection.watermark.worldVersion !== '1842' ||
    metric.canonicalValue !== '128000' ||
    metric.displayValue !== '128' ||
    metric.unit !== 'k tonnes' ||
    metric.changeLabel !== '-18k' ||
    event?.eventType !== 'INVENTORY_RESERVED' ||
    event?.worldVersion !== projection.watermark.worldVersion ||
    !event.affectedMetricIds.includes(metric.id) ||
    fact?.detail !== '18,000 tonnes moved from AVAILABLE to RESERVED.'
  ) {
    return {
      kind: 'MISSING',
      reason:
        'The fixture value and source fact no longer match. No trail is shown.',
    };
  }

  const receipt = projection.recentReceipt;
  const linkedReceipt =
    receipt?.outcome === 'COMMITTED' &&
    receipt.worldVersionBefore === '1841' &&
    receipt.worldVersionAfter === event.worldVersion &&
    receipt.eventIds.includes(event.eventId)
      ? receipt
      : null;

  return {
    kind: 'AVAILABLE',
    trail: {
      marker: PREPARATION_ONLY_MARKER,
      source: 'LOCAL_FIXTURE',
      metricId: 'available-grain',
      input: {
        canonicalValue: '146000',
        displayValue: '146k tonnes',
        evidence: 'MISSING_SOURCE_RECORD',
      },
      difference: {
        canonicalValue: '-18000',
        displayValue: '−18k tonnes',
        label: 'Reserved stock',
        sourceFact: {
          eventId: event.eventId,
          eventVersion: event.worldVersion,
          detail: fact.detail,
        },
      },
      output: {
        canonicalValue: '128000',
        displayValue: '128k tonnes',
        snapshotVersion: projection.watermark.worldVersion,
      },
      receipt: linkedReceipt
        ? {
            kind: 'LINKED_FIXTURE_RECEIPT',
            commandId: linkedReceipt.commandId,
          }
        : {
            kind: 'MISSING',
            reason: 'No final receipt is linked to this event in the fixture.',
          },
    },
  };
}
