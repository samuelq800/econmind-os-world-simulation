"""Authored inland waters and 10x infrastructure for the display atlas."""
import json
from pathlib import Path
import numpy as np
from scipy import ndimage as ndi
from shapely import contains_xy
from shapely.geometry import Point, Polygon, LineString
from shapely.ops import unary_union
from skimage.graph import route_through_array
from atlas_display_geometry import parse_path,to_svg
DIR=Path(__file__).resolve().parents[1]/'apps/world-web/src/map-lab'
d=json.loads((DIR/'atlas-layers.json').read_text());p=json.loads((DIR/'land-partition.json').read_text())
h,w=p['height'],p['width'];yy,xx=np.mgrid[:h,:w];coast=parse_path(p['coastPath']);land=contains_xy(coast,xx,yy)
rng=np.random.default_rng(927)
d['physical']=[f for f in d['physical'] if not f['id'].startswith(('HR','HL'))]
d['facilities']=[f for f in d['facilities'] if not f['id'].startswith('IF')]
occupied=unary_union([Point(i['point']).buffer(5) for i in d['resources']+d['nodes']+d['facilities']]+[LineString(r['points']).buffer(3) for r in d['routes']])
regions={r['id']:parse_path(r['path']) for r in p['territories']}
lakes=[]
for cid,region in sorted(regions.items(),key=lambda x:-x[1].area):
    safe=region.buffer(-5).difference(occupied)
    if safe.is_empty or safe.area<70:continue
    point=safe.representative_point();radius=min(7,point.distance(safe.boundary)*.8)
    if radius<2.5:continue
    angles=np.linspace(0,2*np.pi,25)[:-1];rad=radius*(.8+.2*rng.random(24))
    lake=Polygon([(point.x+np.cos(a)*r,point.y+np.sin(a)*r*.7) for a,r in zip(angles,rad)])
    lakes.append(lake);d['physical'].append(dict(id=f'HL{len(lakes):02}',name=f'内陆湖 {len(lakes):02}',kind='lake',path=to_svg(lake),label=[point.x,point.y]))
    if len(lakes)==30:break
lake_union=unary_union(lakes);dry=land & ~contains_xy(lake_union,xx,yy)
# Draw connected land-only catchment trunks to the nearest coast or lake.
distance,nearest=ndi.distance_transform_edt(dry,return_indices=True)
noise=ndi.gaussian_filter(rng.random((h,w)),3)
cost=np.where(dry,1+noise*4,np.inf)
starts=[lake.representative_point() for lake in lakes]
for cid,region in sorted(regions.items(),key=lambda x:-x[1].area)[:35]:
    mask=contains_xy(region,xx,yy)&dry
    score=np.where(mask,distance,0);y,x=np.unravel_index(np.argmax(score),score.shape)
    if score[y,x]<7:continue
    ty,tx=nearest[:,y,x]
    # Target the last land pixel before the ocean/lake.
    near=(xx-tx)**2+(yy-ty)**2;near[~dry]=10**9
    ey,ex=np.unravel_index(np.argmin(near),near.shape)
    route,_=route_through_array(cost,(y,x),(ey,ex),fully_connected=True)
    line=LineString([(b,a) for a,b in route]).simplify(.35).intersection(coast).difference(lake_union)
    if line.length<6:continue
    idx=sum(f['id'].startswith('HR') for f in d['physical'])+1
    label=line.interpolate(.45,normalized=True)
    d['physical'].append(dict(id=f'HR{idx:02}',name=f'内陆河 {idx:02}',kind='river',path=to_svg(line),label=[label.x,label.y]))
# Five sites per state where possible; preserve all previous facilities/nodes.
all_sites=d['nodes']+d['facilities'];counts={cid:sum(i['countryId']==cid for i in all_sites) for cid in regions}
while len(d['nodes'])+len(d['facilities'])<350:
    cid=min(counts,key=lambda c:(counts[c],c));region=regions[cid]
    local=[i for i in all_sites if i['countryId']==cid]
    candidates=[r for r in d['resources'] if r['countryId']==cid and not any(f.get('resourceId')==r['id'] for f in d['facilities'])]
    resource=candidates[0] if candidates else None
    if resource:
        point=resource['point'];kind='farm' if resource['kind'] in ('grain','cotton','coffee','timber') else 'energy' if resource['kind'] in ('oil','gas','coal','uranium') else 'mine'
    else:
        ys,xs=np.where(contains_xy(region,xx,yy)&dry)
        clearance=np.min([(xs-i['point'][0])**2+(ys-i['point'][1])**2 for i in local],axis=0) if local else distance[ys,xs]
        index=np.argmax(clearance);point=[int(xs[index]),int(ys[index])];kind='factory'
    names={'farm':'农林基地','energy':'能源设施','mine':'采矿设施','factory':'加工基地'}
    item=dict(id=f'IF{len(d["facilities"]):03}',name=names[kind]+'（规划）',kind=kind,point=point,countryId=cid,resourceId=resource['id'] if resource else None)
    d['facilities'].append(item);all_sites.append(item);counts[cid]+=1
assert not any(lake_union.contains(Point(i['point'])) for i in all_sites+d['resources'])
assert all(lake_union.intersection(LineString(r['points'])).length==0 for r in d['routes'])
d['hydrologyNotes']='新增河湖为虚构世界水系规划，河道连接近岸或湖泊；无实测高程及水文模拟。内陆湖保留所属国家管辖，不作为海洋基线。'
d['infrastructureExpansion']={'baseline':35,'total':350,'multiplier':10}
(DIR/'atlas-layers.json').write_text(json.dumps(d,ensure_ascii=False,separators=(',',':'))+'\n')
print(json.dumps({'infrastructure':len(all_sites),'minPerCountry':min(counts.values()),'maxPerCountry':max(counts.values()),'newLakes':len(lakes),'rivers':sum(f['kind']=='river' for f in d['physical'])}))
