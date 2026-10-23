/** TEST_ONLY real browser controllers with intercepted existing DTO fixtures.
 * This verifies stale-intent disposal across every directed Office switch,
 * not real seats, source admission, economic commits or six-Office completion. */
import { describe, expect, it } from 'vitest';
import { CANONICAL_OFFICE_IDS } from '@econmind/core';
import { createFinancialIntakeController } from '../../apps/world-web/src/financial-intake/controller.js';
import { createOfficeCommandController } from '../../apps/world-web/src/office-command/controller.js';
import {
  officeProjectionRoles,
  type OfficeRole,
} from '../../apps/world-web/src/office-projection/model.js';
import { financialIntakeFixture } from './financial-intake-fixture.js';
import { officeCommandFixture } from './office-command-fixture.js';

const roles = Object.keys(officeProjectionRoles) as OfficeRole[];
const manual = ['captain', 'central_bank', 'social'] as const;
const financial = ['finance', 'trade'] as const;
const targets = (from: OfficeRole) => roles.filter((to) => to !== from);
const manualSwitches = manual.flatMap((from) =>
  targets(from).map((to) => [from, to] as const),
);
const financialSwitches = financial.flatMap((from) =>
  targets(from).map((to) => [from, to] as const),
);

describe('F six-Office seat-switch wiring, not six-Office product completion', () => {
  it('covers each of the 30 directed role switches exactly once', () => {
    expect(Object.values(officeProjectionRoles).sort()).toEqual(
      [...CANONICAL_OFFICE_IDS].sort(),
    );
    const all = [
      ...manualSwitches,
      ...financialSwitches,
      ...targets('industry').map((to) => ['industry', to] as const),
    ];
    expect(all).toHaveLength(30);
    expect(new Set(all.map(([from, to]) => `${from}:${to}`)).size).toBe(30);
    for (const role of roles)
      expect(all.filter(([from]) => from === role)).toHaveLength(5);
  });

  it.each(manualSwitches)(
    '%s → %s retires a reviewed manual intent; switching back cannot submit it',
    async (from, to) => {
      const f = officeCommandFixture(from);
      let view = f.binding.view;
      const c = createOfficeCommandController(f.binding, () => view, {
        fetcher: f.fetcher,
        requestId: () => f.request.requestId,
      });
      try {
        await c.refresh();
        expect(c.stage(f.request)).toBe(true);
        expect(c.review()).toBe(true);
        view = { ...view, role: to };
        await c.confirm();
        expect(f.commands).toHaveLength(0);
        expect(c.getState().completion).toBe(false);
        view = f.binding.view;
        await c.confirm();
        expect(c.stage(f.request)).toBe(false);
        expect(f.commands).toHaveLength(0);
      } finally {
        c.disconnect();
      }
    },
  );

  it.each(financialSwitches)(
    '%s → %s retires the inspected financial action without replaying it',
    async (from, to) => {
      const f = financialIntakeFixture(
        from,
        from === 'finance' ? 'SIGN_BUYER_FINANCE' : 'ENQUEUE',
      );
      let view = f.binding.view;
      const c = createFinancialIntakeController(f.binding, () => view, {
        fetcher: f.fetcher,
        readFactory: () => f.f.client(),
        requestId: () => f.binding.request.requestId,
      });
      try {
        await c.inspect();
        c.review(true);
        expect(c.getState().canSubmit).toBe(true);
        expect(f.calls).toHaveLength(1);
        expect(JSON.parse(f.calls[0]!.body).request.action).toBe('INSPECT');
        view = { ...view, role: to };
        await c.submit();
        expect(c.getState().canSubmit).toBe(false);
        expect(f.calls).toHaveLength(1);
        view = f.binding.view;
        c.review(true);
        await c.submit();
        expect(c.getState().canSubmit).toBe(false);
        expect(f.calls).toHaveLength(1);
      } finally {
        c.disconnect();
      }
    },
  );

  it.each(targets('industry'))(
    'industry → %s never promotes an unsupported action into a supported role',
    async (to) => {
      const f = financialIntakeFixture('industry', 'ENQUEUE');
      let view = f.binding.view;
      const c = createFinancialIntakeController(f.binding, () => view, {
        fetcher: f.fetcher,
        readFactory: () => f.f.client(),
        requestId: () => f.binding.request.requestId,
      });
      try {
        await c.inspect();
        c.review(true);
        await c.submit();
        expect(c.getState().canSubmit).toBe(false);
        expect(f.calls).toHaveLength(0);
        view = { ...view, role: to };
        await c.inspect();
        c.review(true);
        await c.submit();
        expect(c.getState().canSubmit).toBe(false);
        expect(f.calls).toHaveLength(0);
        view = f.binding.view;
        await c.submit();
        expect(f.calls).toHaveLength(0);
      } finally {
        c.disconnect();
      }
    },
  );
});
