type FocusTarget = Pick<HTMLElement, 'focus'>;
type ScrollPanel = Pick<HTMLElement, 'scrollTo'>;

/** Run after the new country/World DOM is committed, never for map selection. */
export function restoreExplorerRouteStart(
  previousCountry: string,
  nextCountry: string,
  navigationTarget: FocusTarget | null,
  scrollPage: (options: ScrollToOptions) => void,
) {
  if (previousCountry === nextCountry) return false;
  navigationTarget?.focus({ preventScroll: true });
  scrollPage({ top: 0, left: 0, behavior: 'instant' });
  return true;
}

/** Reset only the inspector's own scroll; the map and page stay in place. */
export function prepareExplorerFacilitySelection(
  inspector: ScrollPanel | null,
  selectionTarget: FocusTarget | null,
) {
  inspector?.scrollTo({ top: 0, behavior: 'instant' });
  selectionTarget?.focus({ preventScroll: true });
}
