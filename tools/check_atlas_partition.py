"""Check exported SVG topology independently of the allocation algorithm."""
import hashlib
import json
from pathlib import Path

from shapely.geometry import Point, Polygon
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
data = json.loads((ROOT / 'apps/world-web/src/map-lab/land-partition.json').read_text())


def parse_path(path):
    result = Polygon()
    for ring in path.split('M')[1:]:
        polygon = Polygon([list(map(float, vertex.split(',')))
                           for vertex in ring.rstrip('Z').split('L')])
        assert polygon.is_valid, 'Invalid exported ring'
        result = result.symmetric_difference(polygon)
    assert result.is_valid
    return result


coast = parse_path(data['coastPath'])
regions = [parse_path(region['path']) for region in data['territories']]
combined = unary_union(regions)
source = ROOT / 'apps/world-web/src/assets/asterra-satellite-terrain-v8.png'
assert hashlib.sha256(source.read_bytes()).hexdigest() == data['sourceSha256']
assert len(regions) == len({region['id'] for region in data['territories']}) == 70
assert coast.difference(combined).area == 0, 'Gaps between regions'
assert combined.difference(coast).area == 0, 'Regions extend over water'
assert sum(region.area for region in regions) == combined.area, 'Overlapping regions'
assert coast.area == data['coverage']['landPixels']
for polygon, region in zip(regions, data['territories']):
    assert polygon.contains(Point(region['label'])), 'Label outside its own land'
    assert polygon.area == region['landPixels'] > 0
print(json.dumps(dict(result='PASS', regions=len(regions),
                      landArea=coast.area, gaps=0, overlaps=0,
                      assignedWater=0, labelsOnOwnLand=70)))
