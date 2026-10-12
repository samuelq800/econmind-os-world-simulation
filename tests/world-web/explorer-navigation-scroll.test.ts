import { describe, expect, it, vi } from 'vitest';
import {
  prepareExplorerFacilitySelection,
  restoreExplorerRouteStart,
} from '../../apps/world-web/src/map-explorer/navigation-scroll.js';

describe('Explorer route scroll versus facility inspector scroll', () => {
  it.each([
    ['', 'visual-territory-58'],
    ['visual-territory-38', 'visual-territory-70'],
    ['visual-territory-58', ''],
  ])(
    'restores the new route %s → %s without scrolling during focus',
    (from, to) => {
      const operations: string[] = [];
      const target = {
        focus: vi.fn((options: FocusOptions) => {
          expect(options).toEqual({ preventScroll: true });
          operations.push('focus');
        }),
      };
      const pageScroll = vi.fn((options: ScrollToOptions) => {
        expect(options).toEqual({ top: 0, left: 0, behavior: 'instant' });
        operations.push('page-start');
      });
      expect(restoreExplorerRouteStart(from, to, target, pageScroll)).toBe(
        true,
      );
      expect(operations).toEqual(['focus', 'page-start']);
    },
  );

  it.each(['', 'visual-territory-58'])(
    'does not steal page scroll or keyboard focus for unchanged route %s',
    (route) => {
      const target = { focus: vi.fn() };
      const pageScroll = vi.fn();
      expect(restoreExplorerRouteStart(route, route, target, pageScroll)).toBe(
        false,
      );
      expect(target.focus).not.toHaveBeenCalled();
      expect(pageScroll).not.toHaveBeenCalled();
    },
  );

  it('resets only a previously scrolled inspector for first and repeated source-ID selections', () => {
    const nestedScroll = vi.fn();
    const focus = vi.fn();
    const inspector = { scrollTo: nestedScroll };
    const selectedTarget = { focus };
    prepareExplorerFacilitySelection(inspector, selectedTarget);
    prepareExplorerFacilitySelection(inspector, selectedTarget);
    expect(nestedScroll.mock.calls).toEqual([
      [{ top: 0, behavior: 'instant' }],
      [{ top: 0, behavior: 'instant' }],
    ]);
    expect(focus.mock.calls).toEqual([
      [{ preventScroll: true }],
      [{ preventScroll: true }],
    ]);
  });
});
