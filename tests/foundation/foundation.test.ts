import { describe, expect, it } from 'vitest';

import { getApiFoundationStatus } from '../../apps/world-api/src/index.js';
import { getWorkerFoundationStatus } from '../../apps/world-worker/src/index.js';

describe('V00.1 application foundations', () => {
  it('keeps API authority disabled at the foundation stage', () => {
    expect(getApiFoundationStatus()).toEqual({
      role: 'command-query-boundary',
      authoritativeMutationEnabled: false,
    });
  });

  it('keeps worker simulation disabled at the foundation stage', () => {
    expect(getWorkerFoundationStatus()).toEqual({
      role: 'future-authoritative-executor',
      simulationEnabled: false,
    });
  });
});
