import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { nationalSignalSelection } from '../../apps/world-web/src/prototype/NationalOverview.js';
import {
  EMPTY_PROJECTION,
  READY_PROJECTION,
} from '../../apps/world-web/src/prototype/fixtures.js';
import { readableProjection } from '../../apps/world-web/src/prototype/state.js';

const overviewSource = readFileSync(
  'apps/world-web/src/prototype/NationalOverview.tsx',
  'utf8',
);

describe('national atlas integration', () => {
  it('takes selected national values and linked events only from the supplied projection', () => {
    const projection = {
      ...READY_PROJECTION,
      metrics: [
        {
          ...READY_PROJECTION.metrics[0]!,
          displayValue: '2.3',
        },
      ],
      events: [
        {
          ...READY_PROJECTION.events[0]!,
          eventId: 'CUSTOM-EVENT',
          title: 'A new inflation report arrived',
          affectedMetricIds: ['inflation'],
        },
      ],
    };

    const selected = nationalSignalSelection(projection, 'inflation');

    expect(selected.metric?.displayValue).toBe('2.3');
    expect(selected.events.map((event) => event.eventId)).toEqual([
      'CUSTOM-EVENT',
    ]);
    expect(selected.events[0]?.title).toBe('A new inflation report arrived');
    expect(overviewSource).toContain(
      'Atlas territories are not linked to country records',
    );
    expect(overviewSource).toContain('Signal table');
    expect(overviewSource).toContain('onMapUnavailable');
  });

  it('keeps empty and revoked projections from supplying map intel', () => {
    expect(nationalSignalSelection(EMPTY_PROJECTION, 'inflation')).toEqual({
      metric: null,
      events: [],
    });
    expect(
      readableProjection({
        status: 'unauthorized',
        reason: 'Office access revoked.',
      }),
    ).toBeNull();
  });
});
