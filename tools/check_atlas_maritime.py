"""Check exported maritime geometry against land and independent distance envelopes."""
import hashlib
import json
from pathlib import Path
from shapely.geometry import box, Point
from shapely.affinity import translate
from shapely.ops import unary_union
from atlas_display_geometry import parse_path

DIR=Path(__file__).resolve().parents[1]/'apps/world-web/src/map-lab'
raw=(DIR/'land-partition.json').read_bytes()
p=json.loads(raw); data=json.loads((DIR/'maritime-zones.json').read_text())
assert data['partitionSha256']==hashlib.sha256(raw).hexdigest()
assert data['territorialSeaNm']==12 and data['eezLimitNm']==200
assert abs(data['territorialRadiusPixels']*data['kmPerPixel']-22.224)<1e-10
assert abs(data['eezRadiusPixels']*data['kmPerPixel']-370.4)<1e-10
land=parse_path(p['coastPath']); frame=box(-.5,-.5,p['width']-.5,p['height']-.5)
water=frame.difference(land); ocean=max(water.geoms,key=lambda g:g.area)
bands=[parse_path(data[k]) for k in ('territorialPath','eezPath','highSeasPath')]
# SVG coordinates use six significant figures; allow 0.008 native pixel rounding.
tolerance=.008
assert all(g.is_valid for g in bands)
for g in bands: assert g.difference(ocean.buffer(tolerance)).area<1e-6
combined=unary_union(bands)
assert ocean.difference(combined.buffer(tolerance)).area<1e-6
for i,g in enumerate(bands):
    for other in bands[i+1:]:assert g.buffer(-tolerance).intersection(other.buffer(-tolerance)).area<1e-6
assert bands[2].contains(Point(1060,214)), 'High seas label outside high seas'
territorial_margin=bands[0].buffer(tolerance)
coastal=0
for region,entry in zip(p['territories'],data['countries']):
    assert region['id']==entry['id']
    own=parse_path(region['path'])
    shore=own.boundary.intersection(ocean.boundary).difference(frame.boundary)
    assert entry['coastal']==(shore.length>0), 'Inland country given sea entitlement'
    coastal+=entry['coastal']
    baseline=unary_union([shore,translate(shore,xoff=p['width']),translate(shore,xoff=-p['width'])])
    for key,radius in [('territorialCandidatePath',data['territorialRadiusPixels']),('eezCandidatePath',data['eezRadiusPixels'])]:
        actual=parse_path(entry[key])
        expected=baseline.buffer(radius,quad_segs=8).intersection(ocean)
        if key=='eezCandidatePath':expected=expected.difference(bands[0])
        assert actual.difference(expected.buffer(tolerance)).area<1e-6, entry['id']
        covered=actual.buffer(tolerance)
        if key=='eezCandidatePath':covered=covered.union(territorial_margin)
        assert expected.difference(covered).area<1e-6, entry['id']
print(json.dumps(dict(result='PASS',coastalCountries=coastal,inlandCountries=70-coastal,oceanCoverage='complete',inlandLakesExcluded=True,distanceLimits='12nm / 200nm',roundingTolerancePixels=tolerance)))
