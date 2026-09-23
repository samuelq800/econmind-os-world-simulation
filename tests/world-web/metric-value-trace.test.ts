import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { fixtureValueTrail } from '../../apps/world-web/src/prototype/metric-value-trace.js';
import {
  EMPTY_PROJECTION,
  READY_PROJECTION,
  STALE_PROJECTION,
} from '../../apps/world-web/src/prototype/fixtures.js';

const overviewSource = readFileSync(
  'apps/world-web/src/prototype/NationalOverview.tsx',
  'utf8',
);
const componentSource = readFileSync(
  'apps/world-web/src/prototype/MetricValueTrail.tsx',
  'utf8',
);

describe('G02 local fixture value trail', () => {
  it('shows exact input, recorded stock movement and displayed output with visible evidence gaps', () => {
    const result = fixtureValueTrail(
      READY_PROJECTION,
      'available-grain',
      'ready',
    );
    expect(result.kind).toBe('AVAILABLE');
    if (result.kind !== 'AVAILABLE') return;

    expect(
      BigInt(result.trail.input.canonicalValue) +
        BigInt(result.trail.difference.canonicalValue),
    ).toBe(BigInt(result.trail.output.canonicalValue));
    expect(result.trail.output.canonicalValue).toBe(
      READY_PROJECTION.metrics.find((metric) => metric.id === 'available-grain')
        ?.canonicalValue,
    );
    expect(result.trail.difference.sourceFact).toMatchObject({
      eventId: 'EVENT-PROTOTYPE-001',
      eventVersion: '1842',
      detail: '18,000 tonnes moved from AVAILABLE to RESERVED.',
    });
    expect(result.trail.input.evidence).toBe('MISSING_SOURCE_RECORD');
    expect(result.trail.receipt.kind).toBe('MISSING');

    expect(componentSource).toContain('<details');
    expect(componentSource).toContain('<summary>');
    expect(componentSource).toContain('state.trail.input.displayValue');
    expect(componentSource).toContain('state.trail.difference.displayValue');
    expect(componentSource).toContain('state.trail.output.displayValue');
    expect(componentSource).toContain('Source record missing');
    expect(componentSource).toContain('state.trail.receipt.reason');
    expect(componentSource).toContain('complete causal attribution');
    expect(componentSource).toContain('local fixture only');
  });

  it('does not invent a trail for a metric without a numeric input and source fact', () => {
    const result = fixtureValueTrail(READY_PROJECTION, 'inflation', 'ready');
    expect(result).toMatchObject({ kind: 'MISSING' });
    expect(componentSource).toContain('Evidence missing');
    expect(componentSource).toContain(
      'A displayed change alone does not establish a cause.',
    );
  });

  it('fails closed for stale, offline, empty, mismatched value, changed fact or changed World identity', () => {
    const grain = READY_PROJECTION.metrics.find(
      (metric) => metric.id === 'available-grain',
    )!;
    const variants = [
      [STALE_PROJECTION, 'ready'],
      [READY_PROJECTION, 'offline'],
      [EMPTY_PROJECTION, 'ready'],
      [
        {
          ...READY_PROJECTION,
          metrics: READY_PROJECTION.metrics.map((metric) =>
            metric.id === grain.id
              ? { ...metric, canonicalValue: '127000' }
              : metric,
          ),
        },
        'ready',
      ],
      [
        {
          ...READY_PROJECTION,
          events: READY_PROJECTION.events.filter(
            (event) => event.eventId !== 'EVENT-PROTOTYPE-001',
          ),
        },
        'ready',
      ],
      [
        {
          ...READY_PROJECTION,
          events: READY_PROJECTION.events.map((event) =>
            event.eventId === 'EVENT-PROTOTYPE-001'
              ? {
                  ...event,
                  evidence: event.evidence.map((item) =>
                    item.kind === 'RECORDED_FACT'
                      ? { ...item, detail: 'Different stock movement.' }
                      : item,
                  ),
                }
              : event,
          ),
        },
        'ready',
      ],
      [{ ...READY_PROJECTION, countryId: 'ANOTHER-COUNTRY' }, 'ready'],
    ] as const;

    for (const [projection, status] of variants) {
      expect(
        fixtureValueTrail(projection, 'available-grain', status).kind,
      ).toBe('MISSING');
    }
  });

  it('requires a committed, version-matched receipt before displaying a linked receipt reference', () => {
    const receipt = READY_PROJECTION.recentReceipt!;
    const projection = {
      ...READY_PROJECTION,
      recentReceipt: {
        ...receipt,
        worldVersionBefore: '1841',
        worldVersionAfter: '1842',
        eventIds: ['EVENT-PROTOTYPE-001'],
      },
    };
    const linked = fixtureValueTrail(projection, 'available-grain', 'ready');
    expect(linked.kind).toBe('AVAILABLE');
    if (linked.kind !== 'AVAILABLE') return;
    expect(linked.trail.receipt).toEqual({
      kind: 'LINKED_FIXTURE_RECEIPT',
      commandId: receipt.commandId,
    });
    const rejected = fixtureValueTrail(
      {
        ...projection,
        recentReceipt: { ...projection.recentReceipt, outcome: 'REJECTED' },
      },
      'available-grain',
      'ready',
    );
    expect(rejected.kind).toBe('AVAILABLE');
    if (rejected.kind === 'AVAILABLE') {
      expect(rejected.trail.receipt.kind).toBe('MISSING');
    }
  });

  it('uses the same collapsible component in map and table inspectors with no runtime wire', () => {
    expect(overviewSource.match(/<MetricValueTrail/g)).toHaveLength(2);
    expect(overviewSource).toContain('fixtureValueTrail(');
    expect(overviewSource).not.toContain('fetch(');
    expect(overviewSource).not.toContain('submitCommand(');
  });
});
