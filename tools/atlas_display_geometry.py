"""Geometry helpers for the image-aligned display atlas; no World economics."""
import numpy as np
from shapely.geometry import Polygon, box
from shapely.ops import unary_union


def parse_path(path):
    result = Polygon()
    for ring in path.split('M')[1:]:
        polygon = Polygon([list(map(float, p.split(',')))
                           for p in ring.rstrip('Z').split('L')])
        result = result.symmetric_difference(polygon)
    return result


def to_svg(geometry):
    if geometry.is_empty:
        return ''
    if geometry.geom_type in ('Point', 'MultiPoint'):
        return ''
    if geometry.geom_type == 'Polygon':
        rings = [geometry.exterior, *geometry.interiors]
        paths = []
        for ring in rings:
            xy = np.asarray(ring.coords)[:-1]
            before = xy - np.roll(xy, 1, axis=0)
            after = np.roll(xy, -1, axis=0) - xy
            xy = xy[before[:, 0] * after[:, 1] != before[:, 1] * after[:, 0]]
            paths.append('M' + 'L'.join(f'{x:g},{y:g}' for x, y in xy) + 'Z')
        return ''.join(paths)
    if geometry.geom_type in ('LineString', 'LinearRing'):
        return 'M' + 'L'.join(f'{x:g},{y:g}' for x, y in geometry.coords)
    return ''.join(to_svg(g) for g in geometry.geoms)


def mask_geometry(mask):
    strips = []
    for y, row in enumerate(mask):
        changes = np.diff(np.pad(row.astype(np.int8), 1))
        for left, right in zip(np.where(changes == 1)[0], np.where(changes == -1)[0]):
            strips.append(box(float(left) - .5, y - .5, float(right) - .5, y + .5))
    return unary_union(strips)
