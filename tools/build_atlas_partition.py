"""Rebuild the display-only political partition from the unchanged V8 terrain.

Requires Pillow, numpy, scipy and shapely. No economic or World data.
The raster coast is an illustrative extraction, not a surveyed coastline.
"""
from pathlib import Path
import hashlib
import heapq
import json

import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from shapely.geometry import box
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'apps/world-web/src/assets/asterra-satellite-terrain-v8.png'
DEST = ROOT / 'apps/world-web/src/map-lab/land-partition.json'
a = np.asarray(Image.open(SOURCE).convert('RGB')).astype(float)
h, w = a.shape[:2]
r, g, b = a.transpose(2, 0, 1)
# Earth-coloured cores, with adjoining neutral snow/rock. Blue water is excluded.
cores = (r > b * 1.04) & (g > b * 1.02)
# Dark forests remain land: a high brightness floor incorrectly punched holes
# through green canopy. Chromatic water separation does not need that floor.
candidate = (r > b * .85) & (g > b * .89) & (r > 15)
components, _ = ndi.label(candidate)
ids = np.unique(components[cores])
land = np.isin(components, ids[ids > 0])
# The source's decorative polar cloud bands contain no drawn land.
land[:110] = False
land[840:] = False
# Close narrow river/texture holes; preserve the visible large inland lakes.
holes = ndi.binary_fill_holes(land) & ~land
hole_ids, _ = ndi.label(holes)
hole_sizes = np.bincount(hole_ids.ravel())
land |= holes & (hole_sizes[hole_ids] < 100)
components, _ = ndi.label(land)
sizes = np.bincount(components.ravel())
major_ids = np.argsort(sizes[1:])[::-1][:10] + 1
# Area-balanced first draft: eastern continent, north-west, central shelf,
# south-west and larger detached islands. These are visual slots only.
counts = [32, 20, 7, 4, 2, 1, 1, 1, 1, 1]
seeds = []
for component, count in zip(major_ids, counts):
    coords = np.argwhere(components == component)
    centre = coords.mean(axis=0)
    selected = [coords[np.argmin(((coords - centre) ** 2).sum(axis=1))]]
    for _ in range(count - 1):
        distances = ((coords[:, None] - np.asarray(selected)) ** 2).sum(axis=2)
        selected.append(coords[np.argmax(distances.min(axis=1))])
    # Spread seeds into compact, non-overlapping interior regions.
    for _ in range(5):
        owners = ((coords[:, None] - np.asarray(selected)) ** 2).sum(axis=2).argmin(axis=1)
        for i in range(count):
            owned = coords[owners == i]
            centre = owned.mean(axis=0)
            selected[i] = owned[np.argmin(((owned - centre) ** 2).sum(axis=1))]
    seeds.extend(sorted(selected, key=lambda p: (p[0] // 100, p[1])))

# Multi-source land-only travel fronts. Rock relief slows expansion, causing
# neighbouring regions to meet around ridges; this is a planning heuristic.
rock = ndi.gaussian_filter(np.clip((r + g) / 2 - b, 0, 100), 5)
relief = ndi.gaussian_filter(np.maximum(0, r - g) + np.maximum(0, r - 120), 4)
cost = 1 + relief / 35 + rock / 150
owner = np.zeros((h, w), dtype=np.uint8)
distance = np.full((h, w), np.inf)
queue = []
for idx, (y, x) in enumerate(seeds, 1):
    y, x = int(y), int(x)
    distance[y, x] = 0
    owner[y, x] = idx
    heapq.heappush(queue, (0., idx, y, x))
neighbours = [(dy, dx, 2 ** .5 if dx and dy else 1) for dy in (-1, 0, 1)
              for dx in (-1, 0, 1) if dx or dy]
while queue:
    d, idx, y, x = heapq.heappop(queue)
    if d != distance[y, x]:
        continue
    for dy, dx, step in neighbours:
        yy, xx = y + dy, x + dx
        if not (0 <= yy < h and 0 <= xx < w and land[yy, xx]):
            continue
        nd = d + (cost[y, x] + cost[yy, xx]) * .5 * step
        if nd < distance[yy, xx]:
            distance[yy, xx] = nd
            owner[yy, xx] = idx
            heapq.heappush(queue, (nd, idx, yy, xx))

# Each unseeded offshore island is assigned intact to its nearest allocated
# coast, not split by ocean-crossing polygons or maritime envelopes.
_, nearest = ndi.distance_transform_edt(owner == 0, return_indices=True)
for component in np.unique(components[land & (owner == 0)]):
    island = components == component
    ys, xs = np.where(island)
    ny, nx = nearest[:, ys, xs]
    k = np.argmin((ys - ny) ** 2 + (xs - nx) ** 2)
    owner[island] = owner[ny[k], nx[k]]

def path_for(mask):
    # Union complete pixel cells. Unlike independent marching contours, this
    # preserves an EXACT common edge at triple junctions and diagonal contacts.
    rectangles = []
    for y, row in enumerate(mask):
        changes = np.diff(np.pad(row.astype(np.int8), 1))
        for left, right in zip(np.where(changes == 1)[0], np.where(changes == -1)[0]):
            rectangles.append(box(float(left) - .5, y - .5, float(right) - .5, y + .5))
    geometry = unary_union(rectangles)
    polygons = [geometry] if geometry.geom_type == 'Polygon' else list(geometry.geoms)
    paths = []
    for polygon in polygons:
        for ring in [polygon.exterior, *polygon.interiors]:
            xy = np.asarray(ring.coords)[:-1]
            before = xy - np.roll(xy, 1, axis=0)
            after = np.roll(xy, -1, axis=0) - xy
            keep = before[:, 0] * after[:, 1] != before[:, 1] * after[:, 0]
            xy = xy[keep]
            paths.append('M' + 'L'.join(f'{x:g},{y:g}' for x, y in xy) + 'Z')
    return ''.join(paths)

territories = []
for idx in range(1, 71):
    mask = owner == idx
    interior = ndi.distance_transform_edt(mask)
    y, x = np.unravel_index(interior.argmax(), interior.shape)
    territories.append(dict(id=f'visual-territory-{idx:02}', number=f'{idx:02}',
                            path=path_for(mask), label=[int(x), int(y)],
                            landPixels=int(mask.sum())))
assert np.all(owner[land] > 0), 'Unassigned land'
assert np.all(owner[~land] == 0), 'Assigned ocean'
assert all(t['landPixels'] > 0 for t in territories)
assert sum(t['landPixels'] for t in territories) == int(land.sum())
result = dict(width=w, height=h, sourceSha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
              coastPath=path_for(land), territories=territories,
              coverage=dict(landPixels=int(land.sum()), assignedPixels=int((owner > 0).sum()),
                            unassignedPixels=int((land & (owner == 0)).sum()),
                            assignedWaterPixels=int((~land & (owner > 0)).sum()),
                            territoryCount=70, landComponents=int(components.max())))
DEST.write_text(json.dumps(result, separators=(',', ':')) + '\n')
print(json.dumps(result['coverage']))
