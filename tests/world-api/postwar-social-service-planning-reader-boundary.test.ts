/** A callback-shaped object cannot become a server planning data source. */
import { expect, it } from 'vitest';
import { createPostwarOfficeRuntimeReadService } from '../../apps/world-api/src/integration/postwar-office-runtime-read-service.js';
it('rejects an unissued service-creation planning reader without executing it', () => {
  let calls = 0;
  expect(() =>
    createPostwarOfficeRuntimeReadService(null, {
      socialServiceCreationPlanningReader: {
        async read() {
          calls++;
          throw Error('MUST_NOT_RUN');
        },
      },
    }),
  ).toThrow('GENUINE_SOCIAL_SERVICE_CREATION_PLANNING_READER_REQUIRED');
  expect(calls).toBe(0);
});
