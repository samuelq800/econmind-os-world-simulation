"""Independent exported-geometry checks for the seven display layers."""
import hashlib
import json
import math
from pathlib import Path

from shapely.geometry import Point, LineString
from shapely.ops import unary_union

from atlas_display_geometry import parse_path

ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / 'apps/world-web/src/map-lab'
data = json.loads((DIR / 'atlas-layers.json').read_text())
partition = json.loads((DIR / 'land-partition.json').read_text())
coast = parse_path(partition['coastPath'])
for forest_point in [(350,231),(418,204),(342,603)]:
    assert coast.contains(Point(forest_point)), 'Dark forest misclassified as water'
assert not coast.contains(Point(1256,584)), 'Visible inland lake filled as land'
countries = {region['id']:parse_path(region['path']) for region in partition['territories']}
assert data['sourceSha256'] == hashlib.sha256((ROOT / 'apps/world-web/src/assets/asterra-satellite-terrain-v8.png').read_bytes()).hexdigest()
assert data['partitionSha256'] == hashlib.sha256((DIR/'land-partition.json').read_bytes()).hexdigest()
assert data['status'] == 'ILLUSTRATIVE_PLANNING_ONLY'

climates = [parse_path(zone['path']) for zone in data['climates']]
assert all(zone.is_valid for zone in climates)
combined = unary_union(climates)
assert combined.symmetric_difference(coast).area == 0, 'Climate must cover land exactly'
assert sum(zone.area for zone in climates) == combined.area, 'Overlapping climate regions'
assert sum(zone['landPixels'] for zone in data['climates']) == partition['coverage']['landPixels']

def paths_as_lines(path):
    return [LineString([list(map(float,vertex.split(','))) for vertex in part.split('L')])
            for part in path.split('M')[1:]]

for feature in data['physical']:
    if feature['kind']=='lake':
        assert parse_path(feature['path']).difference(coast).area == 0
        continue
    for line in paths_as_lines(feature['path']):
        assert line.difference(coast).length < 1e-7, f"Physical feature outside land: {feature['id']}"

for item in data['nodes'] + data['resources'] + data['facilities']:
    assert countries[item['countryId']].contains(Point(item['point'])), f"Wrong country: {item['id']}"
nodes = {node['id']:node for node in data['nodes']}
assert len(nodes) == len(data['nodes'])
adjacency = {id:set() for id in nodes}
for item in data['nodes']:
    if item['kind'] == 'port':
        assert Point(item['point']).distance(coast.boundary) < 2, 'Port away from coast'
for route in data['routes']:
    line = LineString(route['points'])
    assert abs(route['distanceKm'] - line.length*36000/partition['width']) <= .5
    if route['mode'] == 'land':
        assert line.difference(coast).length < 1e-7, f"Road over water: {route['id']}"
        assert list(line.coords[0]) == nodes[route['fromId']]['point']
        assert list(line.coords[-1]) == nodes[route['toId']]['point']
    else:
        assert line.intersection(coast).length < 1e-7, f"Sea route crosses land: {route['id']}"
        for point, node_id in [(line.coords[0],route['fromId']),(line.coords[-1],route['toId'])]:
            assert nodes[node_id]['kind'] == 'port'
            assert math.dist(point,nodes[node_id]['point']) < 2
    # The SVG path is the same centreline that was checked and measured.
    rendered=paths_as_lines(route['path'])
    assert len(rendered)==1 and line.hausdorff_distance(rendered[0]) < .001
    adjacency[route['fromId']].add(route['toId'])
    adjacency[route['toId']].add(route['fromId'])
visited=set()
pending=[next(iter(nodes))]
while pending:
    node=pending.pop()
    if node in visited:continue
    visited.add(node);pending.extend(adjacency[node]-visited)
assert visited == set(nodes), 'Disconnected transport network'

for current in data['currents']:
    line=LineString(current['points'])
    assert line.intersection(coast).length < 1e-7, f"Current crosses land: {current['id']}"
    assert current['kind'] in ('warm','cold')
    assert line.hausdorff_distance(paths_as_lines(current['path'])[0]) < .01
political = {country['id']:country for country in data['political']['countries']}
assert set(political)==set(countries)
for country in political.values():
    for neighbour in country['neighbours']:
        assert political[neighbour]['color'] != country['color']
        assert country['id'] in political[neighbour]['neighbours']
for border in paths_as_lines(data['political']['sharedBorders']):
    assert border.difference(coast).length < 1e-7
    assert border.intersection(coast.boundary).length == 0
resource_by_id={item['id']:item for item in data['resources']}
for item in data['facilities']:
    if item['resourceId']:
        resource=resource_by_id[item['resourceId']]
        assert item['point']==resource['point'] and item['countryId']==resource['countryId']
print(json.dumps(dict(result='PASS', climateCoverage='exact', climateOverlaps=0,
                     roadsOnLand=sum(r['mode']=='land' for r in data['routes']),
                     seaRoutesInWater=sum(r['mode']=='sea' for r in data['routes']),
                     oceanCurrentsInWater=len(data['currents']),
                     facilitiesOnOwnLand=len(data['nodes'])+len(data['facilities']),
                     resourceSitesOnOwnLand=len(data['resources']), networkConnected=True,
                     adjacentCountryColors='distinct'),ensure_ascii=False))
assert len(data['climates'])==14 and len(data['resourceTypes'])==16
assert len(data['resources'])==320 and len(resource_by_id)==320
counts=[]; varieties=[]
for cid,shape in countries.items():
    local=[r for r in data['resources'] if r['countryId']==cid]
    counts.append(len(local));varieties.append(len({r['kind'] for r in local}))
    mix=political[cid]['climateMix']
    assert sum(c['landPixels'] for c in mix)==shape.area
    for c in mix:
        climate=next(zone for zone in data['climates'] if zone['id']==c['id'])
        assert shape.intersection(parse_path(climate['path'])).area==c['landPixels']
assert min(counts)>=4 and min(varieties)>=1
print(json.dumps(dict(result='PASS',resources=320,resourceTypes=16,climateTypes=14,minSitesPerCountry=min(counts),maxSitesPerCountry=max(counts),minTypesPerCountry=min(varieties))))

lakes=unary_union([parse_path(f['path']) for f in data['physical'] if f['kind']=='lake'])
assert len(data['nodes'])+len(data['facilities'])==350
for cid in countries:assert sum(i['countryId']==cid for i in data['nodes']+data['facilities'])>=2
for i in data['nodes']+data['facilities']+data['resources']:assert not lakes.contains(Point(i['point']))
for r in data['routes']:assert lakes.intersection(LineString(r['points'])).length==0
print('PASS: 350 infrastructure sites; at least 2 per country; 30 lakes avoid resources, infrastructure and routes')
