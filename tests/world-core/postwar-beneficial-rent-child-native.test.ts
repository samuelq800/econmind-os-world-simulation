/** Explicit isolated offline rehearsal; no automatic native/large source run. */
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { runPostwarBeneficialRentChildColdRuntimeRehearsal } from '../support/postwar-beneficial-rent-child-native-fixture.js';
const enabled = process.env.ECONMIND_RUN_BENEFICIAL_RENT_CHILD_NATIVE === '1';
describe('actual independently admitted beneficial child source', () => {
  it.skipIf(!enabled)(
    'prepares actual rent and Social under the child header, retains the parent proof and refuses revoked source',
    async () => {
      const result = await runPostwarBeneficialRentChildColdRuntimeRehearsal({
        repositoryRoot: path.resolve(import.meta.dirname, '../..'),
        artifactDirectory:
          '/workspace/.cloud-setup/evidence/beneficial-rent-candidate-20261101',
        evidenceDirectory:
          '/workspace/.cloud-setup/evidence/rent-child-' +
          randomUUID().slice(0, 8),
      });
      expect(result.registrations).toBe(70);
      expect(result.current.status).toBe('UNPAID');
      expect(result.revokedSourceDenied).toBe(true);
      // Measured offline complete-family validation alone takes ~348s; this new
      // explicit native gate includes bootstrap. Online request budgets unchanged.
    },
    900000,
  );
});
