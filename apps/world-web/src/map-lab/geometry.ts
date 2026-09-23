import type { AtlasPoint, AtlasPolygon } from './types.js';

const epsilon = 0.000_001;

export function isFinitePoint(point: AtlasPoint): boolean {
  return Number.isFinite(point.xKm) && Number.isFinite(point.yKm);
}

/**
 * Measures a segment in the local fictional coordinate system. When a width is
 * supplied, the atlas is a horizontal cylinder: x=0 and x=width are adjacent.
 */
export function distanceKm(
  from: AtlasPoint,
  to: AtlasPoint,
  horizontalWrapWidthKm?: number,
): number {
  let horizontalDistanceKm = Math.abs(to.xKm - from.xKm);
  if (horizontalWrapWidthKm !== undefined) {
    if (!Number.isFinite(horizontalWrapWidthKm) || horizontalWrapWidthKm <= 0) {
      throw new Error('Horizontal wrap width must be a positive finite value');
    }
    if (horizontalDistanceKm > horizontalWrapWidthKm) {
      throw new Error('Wrapped points must be inside one atlas width');
    }
    horizontalDistanceKm = Math.min(
      horizontalDistanceKm,
      horizontalWrapWidthKm - horizontalDistanceKm,
    );
  }
  return Math.hypot(horizontalDistanceKm, to.yKm - from.yKm);
}

export function polylineDistanceKm(
  points: readonly AtlasPoint[],
  horizontalWrapWidthKm?: number,
): number {
  if (points.length < 2) {
    throw new Error(
      'A measurable transport route requires at least two points',
    );
  }
  return points.slice(1).reduce((total, point, index) => {
    return total + distanceKm(points[index]!, point, horizontalWrapWidthKm);
  }, 0);
}

export function pointOnSegment(
  point: AtlasPoint,
  start: AtlasPoint,
  end: AtlasPoint,
): boolean {
  const cross =
    (point.yKm - start.yKm) * (end.xKm - start.xKm) -
    (point.xKm - start.xKm) * (end.yKm - start.yKm);
  if (Math.abs(cross) > epsilon) return false;

  const dot =
    (point.xKm - start.xKm) * (end.xKm - start.xKm) +
    (point.yKm - start.yKm) * (end.yKm - start.yKm);
  if (dot < -epsilon) return false;

  return dot <= distanceKm(start, end) ** 2 + epsilon;
}

/** Inclusive point-in-polygon test: a coastline counts as land. */
export function pointInPolygon(
  point: AtlasPoint,
  polygon: AtlasPolygon,
): boolean {
  if (polygon.length < 3) return false;

  let inside = false;
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index]!;
    const end = polygon[(index + 1) % polygon.length]!;
    if (pointOnSegment(point, start, end)) return true;

    const intersects =
      start.yKm > point.yKm !== end.yKm > point.yKm &&
      point.xKm <
        ((end.xKm - start.xKm) * (point.yKm - start.yKm)) /
          (end.yKm - start.yKm) +
          start.xKm;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function pointAlongSegment(
  start: AtlasPoint,
  end: AtlasPoint,
  fraction: number,
): AtlasPoint {
  return {
    xKm: start.xKm + (end.xKm - start.xKm) * fraction,
    yKm: start.yKm + (end.yKm - start.yKm) * fraction,
  };
}

export function polygonAreaKm2(polygon: AtlasPolygon): number {
  if (polygon.length < 3) return 0;
  let doubledArea = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index]!;
    const end = polygon[(index + 1) % polygon.length]!;
    doubledArea += start.xKm * end.yKm - end.xKm * start.yKm;
  }
  return Math.abs(doubledArea) / 2;
}

export function polygonCentroid(polygon: AtlasPolygon): AtlasPoint {
  if (polygon.length < 3)
    throw new Error('A polygon needs at least three points');
  let doubledArea = 0;
  let xTimesArea = 0;
  let yTimesArea = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index]!;
    const end = polygon[(index + 1) % polygon.length]!;
    const cross = start.xKm * end.yKm - end.xKm * start.yKm;
    doubledArea += cross;
    xTimesArea += (start.xKm + end.xKm) * cross;
    yTimesArea += (start.yKm + end.yKm) * cross;
  }
  if (Math.abs(doubledArea) < epsilon) {
    throw new Error('A polygon needs non-zero area');
  }
  return {
    xKm: xTimesArea / (3 * doubledArea),
    yKm: yTimesArea / (3 * doubledArea),
  };
}

/** Includes both endpoints and samples at intervals no longer than `stepKm`. */
export function samplePolyline(
  path: readonly AtlasPoint[],
  stepKm: number,
): readonly AtlasPoint[] {
  if (!Number.isFinite(stepKm) || stepKm <= 0) {
    throw new Error(
      'Route sample step must be a positive finite kilometre value',
    );
  }
  if (path.length < 2) return [...path];

  const samples: AtlasPoint[] = [path[0]!];
  for (let index = 1; index < path.length; index += 1) {
    const start = path[index - 1]!;
    const end = path[index]!;
    const segments = Math.max(1, Math.ceil(distanceKm(start, end) / stepKm));
    for (let part = 1; part <= segments; part += 1) {
      samples.push(pointAlongSegment(start, end, part / segments));
    }
  }
  return samples;
}

export function svgPath(points: readonly AtlasPoint[], close = false): string {
  if (points.length === 0) return '';
  const segments = points.map(
    (point, index) => `${index === 0 ? 'M' : 'L'} ${point.xKm} ${point.yKm}`,
  );
  return `${segments.join(' ')}${close ? ' Z' : ''}`;
}
