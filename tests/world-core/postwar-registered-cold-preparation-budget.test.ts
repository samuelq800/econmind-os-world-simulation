/** Finite test startup selection only, not Node/source/native acceptance. */
import { afterEach, expect, it } from 'vitest';
import { registeredFinalColdPreparationBudget } from '../support/postwar-registered-final-child.js';
const flags = [
  'ECONMIND_REGISTERED_REFINERY21_SOURCE_PREPARATION',
  'ECONMIND_REGISTERED_FINAL_NODE_NATIVE',
] as const;
const original = flags.map((key) => process.env[key]);
afterEach(() => {
  flags.forEach((key, i) => {
    const value = original[i];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
});
const descriptor = {
  schemaVersion: 'test-only-registered-final-child-host-v1',
  prepareRefinery21Sources: true,
};
it('keeps ordinary cold preparation at its existing 600s bound', () => {
  flags.forEach((key) => delete process.env[key]);
  expect(registeredFinalColdPreparationBudget({})).toBe(600000);
  expect(registeredFinalColdPreparationBudget(descriptor)).toBe(600000);
});
it('uses 3600s only for the explicit isolated refinery21 preparation path', () => {
  flags.forEach((key) => (process.env[key] = '1'));
  expect(registeredFinalColdPreparationBudget(descriptor)).toBe(3600000);
  expect(
    registeredFinalColdPreparationBudget({
      ...descriptor,
      prepareRefinery21Sources: false,
    }),
  ).toBe(600000);
  expect(
    registeredFinalColdPreparationBudget({
      ...descriptor,
      schemaVersion: 'UNKNOWN',
    }),
  ).toBe(600000);
});
