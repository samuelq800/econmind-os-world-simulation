/** Keep global cartography immediate; mount native country detail at useful scale. */
export const DETAIL_TILE_SCALE_KM = 650;

type ViewBox = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export function shouldMountDetailTile(
  view: ViewBox,
  countryBounds: readonly [number, number, number, number],
  showFullDetail: boolean,
): boolean {
  if (!showFullDetail && view.width > DETAIL_TILE_SCALE_KM) return false;

  // Prefetch a narrow margin so panning does not expose an empty tile edge.
  const padX = view.width * 0.08;
  const padY = view.height * 0.08;
  const [left, top, right, bottom] = countryBounds;
  return (
    right >= view.x - padX &&
    left <= view.x + view.width + padX &&
    bottom >= view.y - padY &&
    top <= view.y + view.height + padY
  );
}
