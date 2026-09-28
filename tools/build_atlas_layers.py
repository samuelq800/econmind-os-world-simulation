"""Build seven coherent, illustrative layers in the V8 image's pixel CRS.

Run with Pillow, numpy, scipy, shapely and scikit-image. All placements are
fictional planning proposals, not inferred reserves, climate observations,
operational infrastructure, or economic/transport simulation parameters.
"""
import hashlib
import json
import re
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from scipy.sparse.csgraph import minimum_spanning_tree
from shapely import contains_xy
from shapely.geometry import LineString, Point
from shapely.ops import unary_union
from skimage.graph import route_through_array

from atlas_display_geometry import parse_path, to_svg, mask_geometry

ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / 'apps/world-web/src/map-lab'
partition = json.loads((DIR / 'land-partition.json').read_text())
source = ROOT / 'apps/world-web/src/assets/asterra-satellite-terrain-v8.png'
coast = parse_path(partition['coastPath'])
regions = [parse_path(region['path']) for region in partition['territories']]
w, h = partition['width'], partition['height']
yy, xx = np.mgrid[:h, :w]
land = contains_xy(coast, xx, yy)
land_components, _ = ndi.label(land)
sea_components, _ = ndi.label(~land)
sea_id = np.bincount(sea_components.ravel())[1:].argmax() + 1
ocean = sea_components == sea_id
owners = np.zeros((h, w), dtype=np.uint8)
for idx, region in enumerate(regions, 1):
    x0, y0, x1, y1 = region.bounds
    x0, y0 = max(0, int(x0)), max(0, int(y0))
    x1, y1 = min(w, int(x1)+2), min(h, int(y1)+2)
    hit = contains_xy(region, xx[y0:y1, x0:x1], yy[y0:y1, x0:x1])
    owners[y0:y1, x0:x1][hit] = idx
assert np.all(owners[land] > 0)

def snap(p, mask):
    ys, xs = np.where(mask)
    i = np.argmin((xs - p[0])**2 + (ys - p[1])**2)
    return [int(xs[i]), int(ys[i])]

def owner_at(p):
    return f'visual-territory-{owners[p[1], p[0]]:02}'

print('Land and country alignment ready', flush=True)

# Trace conspicuous ridges and rivers on the actual, unflipped raster.
physical_specs = [
 ('M01','西北雪脊','mountain',[(183,151),(208,183),(225,234),(237,281),(228,331),(207,380),(184,419)],[168,285]),
 ('M02','北缘群峰','mountain',[(269,192),(326,198),(395,178),(454,169),(521,173),(581,161)],[401,165]),
 ('M03','双岛山系','mountain',[(578,331),(625,321),(653,296),(686,302),(718,284)],[654,283]),
 ('M04','中陆山脊','mountain',[(698,457),(739,478),(767,495),(797,516),(818,541)],[746,459]),
 ('M05','西南长脊','mountain',[(204,518),(240,545),(273,579),(305,610),(341,647),(326,696)],[235,597]),
 ('M06','东北弧山','mountain',[(1353,438),(1414,422),(1473,383),(1530,350),(1590,313),(1644,294)],[1500,369]),
 ('M07','南陆褶皱带','mountain',[(1038,608),(1100,638),(1160,650),(1219,675),(1280,697),(1351,720)],[1183,677]),
 ('R01','北原河','river',[(551,192),(526,214),(502,230),(490,251),(455,265),(461,282),(494,295),(501,311),(472,315),(450,328),(438,353),(447,387)],[493,274]),
 ('R02','雪脊南河','river',[(282,289),(282,316),(264,335),(246,359),(228,382),(220,414),(211,441)],[244,365]),
 ('R03','中陆纵河','river',[(835,410),(831,436),(814,460),(802,485),(795,512),(774,534),(750,552),(736,573),(724,593),(706,621)],[817,471]),
 ('R04','西南谷河','river',[(351,571),(328,588),(321,609),(334,630),(350,647),(365,660),(379,665)],[357,619]),
 ('R05','南陆大河','river',[(1186,638),(1221,644),(1240,666),(1274,668),(1312,680),(1350,702),(1383,714),(1422,731),(1456,745),(1470,769),(1480,791)],[1364,687]),
 ('R06','东岸支流','river',[(1465,573),(1459,594),(1468,615),(1485,627),(1480,648),(1489,667),(1508,683),(1521,704)],[1503,641]),
]
physical = []
mountains = []
for id, name, kind, coords, label in physical_specs:
    line = LineString(coords).intersection(coast)
    if kind == 'mountain': mountains.append(line)
    physical.append(dict(id=id,name=name,kind=kind,path=to_svg(line),label=label))
mountain_zone = unary_union(mountains).buffer(14).intersection(coast)
highlands = contains_xy(mountain_zone, xx, yy)

# A complete climate-design partition, guided by latitude, illustrated
# dryness, proximity to coast and traced highlands. No claimed meteorology.
rgb = np.asarray(Image.open(source).convert('RGB')).astype(float)
r,g,b = rgb.transpose(2,0,1)
dryness = ndi.gaussian_filter(r-g, 12)
inland_distance = ndi.distance_transform_edt(land)
latitude = np.abs(65 - yy / h * 130)
climate = np.ones((h,w),dtype=np.uint8) # temperate
climate[latitude < 18] = 2
climate[(inland_distance < 24) & (latitude >= 18)] = 3
climate[(dryness > 8) & (inland_distance > 18)] = 4
climate[(dryness > 18) & (inland_distance > 24)] = 5
climate[latitude > 48] = 6
climate[highlands] = 7
climate = ndi.median_filter(climate, size=7)
climate[~land] = 0
climate_defs = [
 (1,'温带湿润','#6da777'),(2,'热带湿润','#29b597'),
 (3,'温和海洋性','#69b4b1'),(4,'半干旱草原','#d4b76a'),
 (5,'干旱内陆','#dc8655'),(6,'冷凉地带','#90b9d3'),
 (7,'高山气候','#cdc6e2')]
climates=[]
for idx,name,color in climate_defs:
    geom=mask_geometry(climate==idx)
    climates.append(dict(id=idx,name=name,color=color,path=to_svg(geom),landPixels=int((climate==idx).sum())))
print('Physical traces and seven climate zones ready', flush=True)

# Redraw political lines once per shared boundary; adjacent countries receive
# different colours, and coastlines no longer masquerade as internal borders.
adjacency={i:set() for i in range(70)}
shared=[]
for i,a in enumerate(regions):
    for j in range(i+1,70):
        edge=a.boundary.intersection(regions[j].boundary)
        if edge.length>0:
            adjacency[i].add(j);adjacency[j].add(i);shared.append(edge)
palette=['#e8bd75','#72bcb0','#c79cc0','#91b977','#829dc7','#d49076','#b9add6']
colors={}
for idx in sorted(adjacency,key=lambda i:(-len(adjacency[i]),i)):
    used={colors[j] for j in adjacency[idx] if j in colors}
    colors[idx]=next(c for c in palette if c not in used)
names_source=(DIR/'atlas.ts').read_text().split('const visualTerritoryNames = [',1)[1].split('] as const;',1)[0]
names=re.findall(r"'([^']+)'",names_source)
countries=[]
for idx,reg in enumerate(partition['territories']):
    climate_values=np.bincount(climate[owners==idx+1],minlength=8)
    countries.append(dict(id=reg['id'],number=reg['number'],name=names[idx],color=colors[idx],
                          climateId=int(climate_values[1:].argmax()+1),
                          neighbours=[partition['territories'][j]['id'] for j in sorted(adjacency[idx])]))

# Ports are snapped to land immediately adjoining the connected ocean, never
# inland lakes. Hubs and proposed resource/industrial sites are land-only.
coastal_land=land & (ndi.distance_transform_edt(~ocean)<=1.5)
node_specs=[
 ('P01','西北西岸港','port',[137,329]),('P02','北原东港','port',[537,391]),
 ('P03','双岛港','port',[691,332]),('P04','中陆西港','port',[651,555]),
 ('P05','中陆东港','port',[971,447]),('P06','西南海峡港','port',[383,661]),
 ('P07','南岛港','port',[536,694]),('P08','弧岛港','port',[965,363]),
 ('P09','东北湾港','port',[1482,475]),('P10','东岸港','port',[1555,697]),
 ('P11','南湾港','port',[1318,801]),('P12','西湾港','port',[1011,630]),
 ('H01','北原枢纽','hub',[365,295]),('H02','雪脊南枢纽','hub',[303,425]),
 ('H03','中陆枢纽','hub',[791,478]),('H04','西南枢纽','hub',[298,590]),
 ('H05','东北枢纽','hub',[1507,369]),('H06','内陆枢纽','hub',[1265,554]),
 ('H07','东原枢纽','hub',[1450,676]),('H08','南原枢纽','hub',[1195,750])]
nodes=[]
for id,name,kind,p in node_specs:
    p=snap(p,coastal_land if kind=='port' else land)
    nodes.append(dict(id=id,name=name,kind=kind,point=p,countryId=owner_at(p)))
nodes_by_id={n['id']:n for n in nodes}
relief=ndi.gaussian_filter(np.maximum(r-g,0)+np.maximum(r-120,0),4)
land_cost=np.where(land,1+relief/45,np.inf)
water_distance=ndi.distance_transform_edt(ocean)
water_cost=np.where(ocean,1+12/(water_distance+2),np.inf)
water_cost[:115]=np.inf;water_cost[837:]=np.inf

def route(cost,start,end):
    points,_=route_through_array(cost,tuple(start[::-1]),tuple(end[::-1]),fully_connected=True,geometric=True)
    xy=[(int(x),int(y)) for y,x in points]
    # Collinear reduction only: no shortcut may cut a coastal headland.
    keep=[xy[0]]
    for a,b,c in zip(xy,xy[1:],xy[2:]):
        if (b[0]-a[0],b[1]-a[1]) != (c[0]-b[0],c[1]-b[1]):keep.append(b)
    keep.append(xy[-1])
    return keep

routes=[]
# Minimum spanning connections within each actual land component.
for component in sorted({int(land_components[n['point'][1],n['point'][0]]) for n in nodes}):
    group=[n for n in nodes if land_components[n['point'][1],n['point'][0]]==component]
    points=np.array([n['point'] for n in group])
    distances=np.sqrt(((points[:,None]-points)**2).sum(axis=2))
    tree=minimum_spanning_tree(distances).tocoo()
    for ai,bi in zip(tree.row,tree.col):
        a,b=group[ai],group[bi]
        coords=route(land_cost,a['point'],b['point'])
        routes.append(dict(id=f'L{len(routes)+1:02}',mode='land',fromId=a['id'],toId=b['id'],points=coords))
print('Land transport network ready', flush=True)
sea_pairs=[('P01','P06'),('P02','P03'),('P03','P04'),('P04','P06'),
           ('P06','P07'),('P05','P08'),('P08','P09'),('P05','P12'),
           ('P12','P11'),('P11','P10'),('P09','P10')]
for i,(aid,bid) in enumerate(sea_pairs,1):
    a,b=nodes_by_id[aid],nodes_by_id[bid]
    coords=route(water_cost,snap(a['point'],ocean),snap(b['point'],ocean))
    routes.append(dict(id=f'S{i:02}',mode='sea',fromId=aid,toId=bid,points=coords))
for item in routes:
    line=LineString(item['points'])
    item['path']=to_svg(line)
    item['distanceKm']=round(line.length*36000/w)
    item['name']=nodes_by_id[item['fromId']]['name']+' — '+nodes_by_id[item['toId']]['name']

print('Ocean transport network ready', flush=True)
# Wide, directional schematic currents follow connected open-water channels.
current_specs=[
 ('C01','西岸暖流','warm',[(82,743),(43,570),(28,405),(43,182)]),
 ('C02','赤道东向暖流','warm',[(520,491),(601,420),(787,377),(1045,423),(1207,362)]),
 ('C03','东岸寒流','cold',[(1714,205),(1733,405),(1679,609),(1682,760)]),
 ('C04','北洋寒流','cold',[(1227,135),(1063,138),(849,143),(707,146)]),
 ('C05','南洋西向寒流','cold',[(1105,820),(922,798),(759,770),(615,793)]),
 ('C06','中央暖流','warm',[(669,724),(860,712),(982,578),(1049,458)])]
currents=[]
current_cost=np.where(np.isfinite(water_cost),1+40/(water_distance+2),np.inf)
for id,name,kind,waypoints in current_specs:
    coords=[]
    for a,b in zip(waypoints,waypoints[1:]):
        pts=route(current_cost,snap(a,ocean),snap(b,ocean))
        coords.extend(pts if not coords else pts[1:])
    line=LineString(coords)
    # Resample and smooth the water-only route into an open current arc.
    # Accept smoothing only when the complete resulting line remains offshore.
    samples=np.array([line.interpolate(d).coords[0] for d in np.linspace(0,line.length,max(12,int(line.length/4)))])
    for sigma in (5,3,1):
        smoothed=ndi.gaussian_filter1d(samples,sigma,axis=0,mode='nearest')
        smoothed[0]=samples[0];smoothed[-1]=samples[-1]
        candidate=LineString(smoothed).simplify(.3)
        if not candidate.intersects(coast.buffer(2)):
            line=candidate
            break

    currents.append(dict(id=id,name=name,kind=kind,path=to_svg(line),points=list(line.coords),
                         arrows=[list(line.interpolate(t,normalized=True).coords)[0] for t in (.25,.6)]))

resource_defs=[
 ('iron','铁矿','Fe','#c68b75','山地矿带'),('copper','铜矿','Cu','#eda26c','褶皱矿带'),
 ('grain','粮食产区','麦','#ded47d','河谷与平原'),('gas','天然气','气','#ba9fda','内陆沉积盆地'),
 ('oil','石油','油','#909cbe','沉积盆地'),('lithium','锂矿','Li','#dfafd8','干旱盆地'),
 ('uranium','铀矿','U','#b0c579','古老岩体')]
resource_specs=[
 ('iron',[216,241]),('copper',[228,327]),('grain',[365,283]),('grain',[447,337]),
 ('gas',[329,353]),('grain',[307,459]),('copper',[467,184]),('iron',[592,183]),
 ('copper',[657,295]),('grain',[628,333]),('iron',[745,480]),('grain',[819,444]),
 ('grain',[829,529]),('copper',[934,345]),('copper',[250,554]),('grain',[324,609]),
 ('iron',[312,665]),('copper',[496,698]),('grain',[482,597]),('iron',[1510,368]),
 ('copper',[1602,301]),('grain',[1480,404]),('gas',[1310,547]),('oil',[1205,570]),
 ('lithium',[1284,605]),('uranium',[1093,602]),('iron',[1122,648]),('copper',[1256,698]),
 ('grain',[1397,672]),('grain',[1460,756]),('grain',[1203,761]),('gas',[1510,714])]
resources=[]
for i,(kind,p) in enumerate(resource_specs,1):
    p=snap(p,land)
    resources.append(dict(id=f'RES{i:02}',kind=kind,point=p,countryId=owner_at(p)))
facilities=[]
for index in [0,2,8,11,14,17,19,23,24,28,29,30]:
    resource=resources[index]
    kind='farm' if resource['kind']=='grain' else 'energy' if resource['kind'] in ('gas','oil','uranium') else 'mine'
    facilities.append(dict(id=f'F{index+1:02}',name={'farm':'农业基地','energy':'能源设施','mine':'采矿设施'}[kind]+'（规划）',
                           kind=kind,point=resource['point'],countryId=resource['countryId'],resourceId=resource['id']))
for n in [nodes_by_id['H01'],nodes_by_id['H05'],nodes_by_id['H07']]:
    p=snap([n['point'][0]+18,n['point'][1]+12],land)
    facilities.append(dict(id='F-'+n['id'],name='加工基地（规划）',kind='factory',point=p,countryId=owner_at(p),resourceId=None))

result=dict(version='ASTERra_DISPLAY_LAYERS_V2',status='ILLUSTRATIVE_PLANNING_ONLY',
            width=w,height=h,sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),
            partitionSha256=hashlib.sha256((DIR/'land-partition.json').read_bytes()).hexdigest(),
            coordinateSystem='V8_IMAGE_PIXELS_TOP_LEFT',physical=physical,climates=climates,
            political=dict(sharedBorders=to_svg(unary_union(shared)),countries=countries),
            nodes=nodes,routes=routes,currents=currents,resources=resources,
            resourceTypes=[dict(id=id,name=name,symbol=symbol,color=color,context=context) for id,name,symbol,color,context in resource_defs],
            facilities=facilities)
from enrich_atlas_ecology import enrich
result=enrich(result,partition)
(DIR/'atlas-layers.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n')
print(json.dumps({key:len(result[key]) for key in ['physical','climates','nodes','routes','currents','resources','facilities']}),flush=True)
