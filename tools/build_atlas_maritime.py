"""UNCLOS-inspired, non-authoritative maritime envelopes for the fictional map.

Normal-coast baseline proxy only. No low-water survey, archipelagic/straight
baselines, treaty delimitation, rock qualification, or seabed delimitation.
"""
import hashlib
import json
from pathlib import Path

from shapely.affinity import translate
from shapely.geometry import box, Polygon
from shapely.ops import unary_union

from atlas_display_geometry import parse_path, to_svg

ROOT=Path(__file__).resolve().parents[1]
DIR=ROOT/'apps/world-web/src/map-lab'
raw=(DIR/'land-partition.json').read_bytes()
partition=json.loads(raw)
w,h=partition['width'],partition['height']
coast=parse_path(partition['coastPath'])
frame=box(-.5,-.5,w-.5,h-.5)
waters=frame.difference(coast)
# Exclude enclosed lakes from maritime zones, retaining the connected ocean.
ocean=max(waters.geoms,key=lambda g:g.area) if hasattr(waters,'geoms') else waters
km_per_pixel=36000/w
territorial_radius=12*1.852/km_per_pixel
eez_radius=200*1.852/km_per_pixel
countries=[];territories=[];eezs=[]
territorial_overlap=Polygon();eez_overlap=Polygon()
territorial_seen=Polygon();eez_seen=Polygon()
for region in partition['territories']:
    land=parse_path(region['path'])
    # Only the country's own ocean-facing coast can generate maritime zones.
    # An inland border close to another state's coast is not a baseline.
    shoreline=land.boundary.intersection(ocean.boundary).difference(frame.boundary)
    copies=[shoreline]
    if land.bounds[0]<eez_radius:copies.append(translate(shoreline,xoff=w))
    if land.bounds[2]>w-eez_radius:copies.append(translate(shoreline,xoff=-w))
    baseline_land=unary_union(copies)
    sea=baseline_land.buffer(territorial_radius,quad_segs=8).intersection(ocean)
    extent=baseline_land.buffer(eez_radius,quad_segs=8).intersection(ocean)
    territorial_overlap=territorial_overlap.union(territorial_seen.intersection(sea))
    eez_overlap=eez_overlap.union(eez_seen.intersection(extent))
    territorial_seen=territorial_seen.union(sea)
    eez_seen=eez_seen.union(extent)
    territories.append(sea);eezs.append(extent)
    countries.append(dict(id=region['id'],coastal=sea.area>0,territorialCandidatePath=to_svg(sea)))
    if len(countries)%20==0:print(f"Maritime envelopes: {len(countries)}/70",flush=True)
territorial=unary_union(territories)
eez=unary_union(eezs).difference(territorial)
high_seas=ocean.difference(territorial.union(eez))
overlap=territorial_overlap.union(eez_overlap.difference(territorial))
for country,extent in zip(countries,eezs):
    country['eezCandidatePath']=to_svg(extent.difference(territorial))
result=dict(version='MARITIME_ENVELOPES_V1',status='ILLUSTRATIVE_UNDELIMITED',
            partitionSha256=hashlib.sha256(raw).hexdigest(),
            kmPerPixel=km_per_pixel,territorialSeaNm=12,eezLimitNm=200,
            territorialSeaKm=22.224,eezLimitKm=370.4,
            territorialRadiusPixels=territorial_radius,eezRadiusPixels=eez_radius,
            countries=countries,territorialPath=to_svg(territorial),eezPath=to_svg(eez),
            highSeasPath=to_svg(high_seas),overlapPath=to_svg(overlap),
            territorialOverlapPath=to_svg(territorial_overlap),
            oceanPath=to_svg(ocean),
            areas=dict(territorial=territorial.area,eez=eez.area,highSeas=high_seas.area,ocean=ocean.area),
            assumptions=[
                '以底图海岸作为普通基线的近似；尚无低潮线测绘。',
                '按图宽36,000公里的等比例平面距离绘制；尚无球面投影与测地线校正。',
                '示意场景暂按绘制岛陆均可产生完整海域权利计算；第121条岛礁资格仍待确认。',
                '不使用直线或群岛基线，不划大陆架；公海标签仅描述水体制度。',
                '重叠海域为待协商的权利范围，不表示已经确定的国家海界。',
                '领海相邻划界需考虑第15条中间线规则及例外；专属经济区依第74条协商公平划界。'],
            sources=[
                dict(label='UNCLOS 第3、5、15条：领海与基线',url='https://www.un.org/depts/los/convention_agreements/texts/unclos/part2.htm'),
                dict(label='UNCLOS 第57、74条：专属经济区与划界',url='https://www.un.org/depts/los/convention_agreements/texts/unclos/part5.htm'),
                dict(label='UNCLOS 第86条：公海范围',url='https://www.un.org/depts/los/convention_agreements/texts/unclos/part7.htm'),
                dict(label='UNCLOS 第121条：岛屿制度',url='https://www.un.org/depts/los/convention_agreements/texts/unclos/part8.htm')])
(DIR/'maritime-zones.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n')
print(json.dumps({'coastalCountries':sum(c['coastal'] for c in countries),**result['areas']}),flush=True)
