// Display-only fit; does not alter any source geometry or economic state.
export function fitBounds(bounds, world, padding = 1.6) {
  if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isFinite)) throw Error('DEMO_MAP_BOUNDS_INVALID');
  const [x, y, w, h] = bounds;
  if (w <= 0 || h <= 0) throw Error('DEMO_MAP_BOUNDS_INVALID');
  const width = Math.min(world[0], Math.max(w * padding, 150));
  const height = Math.min(world[1], Math.max(h * padding, 100));
  return [Math.max(0, Math.min(world[0] - width, x + w / 2 - width / 2)), Math.max(0, Math.min(world[1] - height, y + h / 2 - height / 2)), width, height];
}
