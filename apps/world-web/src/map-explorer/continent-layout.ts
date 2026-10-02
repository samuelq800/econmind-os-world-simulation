/** Shared display grouping for the four illustrated continent scenes. */
export function continentFor(point: readonly number[]) {
  const [x = 0, y = 0] = point;
  if (x < 600 && y >= 465) return 'southwest';
  if (x < 870 && y < 465) return 'northwest';
  if (x < 1090) return 'central';
  return 'east';
}
