/** Test-only hook guard/protocol checks; no dist import, source load or DB.
 * Actual publication and the one cold-proof reuse remain native NOT_RUN. */
import { afterEach, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { requireRefinery21PreparationOptIn } from '../../tools/office-connection/registered-refinery21-source-preparation.mjs';
const beforeChild = process.env.ECONMIND_REGISTERED_FINAL_NODE_CHILD;
const beforePrepare =
  process.env.ECONMIND_REGISTERED_REFINERY21_SOURCE_PREPARATION;
afterEach(() => {
  for (const [key, value] of [
    ['ECONMIND_REGISTERED_FINAL_NODE_CHILD', beforeChild],
    ['ECONMIND_REGISTERED_REFINERY21_SOURCE_PREPARATION', beforePrepare],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
const base = {
  enabled: true as const,
  repositoryRoot: fileURLToPath(new URL('../..', import.meta.url)),
  industryInstalled: true as const,
  utilitiesInstalled: true as const,
  countries: [{ countryId: 'COUNTRY_10' }],
};
const enable = () => {
  process.env.ECONMIND_REGISTERED_FINAL_NODE_CHILD = '1';
  process.env.ECONMIND_REGISTERED_REFINERY21_SOURCE_PREPARATION = '1';
};
it('requires an explicit isolated source-preparation opt-in', () => {
  process.env.ECONMIND_REGISTERED_FINAL_NODE_CHILD = '1';
  delete process.env.ECONMIND_REGISTERED_REFINERY21_SOURCE_PREPARATION;
  expect(() => requireRefinery21PreparationOptIn(base)).toThrow();
});
it('accepts only the installed same-repository preparation protocol, without claiming sources ready', () => {
  enable();
  expect(requireRefinery21PreparationOptIn(base)).toBeUndefined();
});
it.each([
  { enabled: false },
  { repositoryRoot: '/tmp/other-checkout' },
  { industryInstalled: false },
  { utilitiesInstalled: false },
  { countries: [] },
  { countries: [{ countryId: 'COUNTRY_71' }] },
  { countries: [{ countryId: 'COUNTRY_10' }, { countryId: 'COUNTRY_10' }] },
])(
  'rejects an uninstalled or invalid finite preparation descriptor %j',
  (patch) => {
    enable();
    expect(() =>
      Reflect.apply(requireRefinery21PreparationOptIn, undefined, [
        { ...base, ...patch },
      ]),
    ).toThrow();
  },
);
