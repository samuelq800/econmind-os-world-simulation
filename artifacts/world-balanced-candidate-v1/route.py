"""Terrain-constrained illustrative routes; not surveyed or operating transport."""
from pathlib import Path
import json,sys,math
import numpy as np
from scipy.spatial import cKDTree
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra, connected_components
from shapely import contains_xy, prepare
from shapely.geometry import Point,LineString
from shapely.ops import nearest_points
B=Path(__file__).parent;D=B/'data';sys.path.insert(0,str(B/'vendor'))
from atlas_display_geometry import parse_path
get=lambda n:json.loads((D/(n+'.json')).read_text())
def put(n,x):(D/(n+'.json')).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
g=get('geography');countries=get('countries');fac=get('facilities');nodes=get('nodes');flows=get('trade-plans');dom=get('domestic-access');trans=[]
ocean=parse_path(g['maritime']['oceanPath']);land=parse_path(g['partition']['coastPath']);shapes={t['id']:parse_path(t['path']) for t in g['partition']['territories']};km=36000/1774
allowed_sea=ocean.buffer(.02);allowed_land=land.buffer(.02);prepare(allowed_sea);prepare(allowed_land)
STEP=6;xv=np.arange(0,1774,STEP);yv=np.arange(0,887,STEP);yy,xx=np.meshgrid(yv,xv,indexing='ij');gridshape=xx.shape
# Erosion guarantees straight graph segments stay on the correct surface.
def graph(poly):
 mask=contains_xy(poly.buffer(-4.5),xx,yy);raster=np.full(gridshape,-1,dtype=np.int32);raster[mask]=np.arange(mask.sum());pts=np.c_[xx[mask],yy[mask]];rr=[];cc=[];ww=[]
 for dy,dx in [(0,1),(1,0),(1,1),(1,-1)]:
  r,c=np.where(mask);r2=r+dy;c2=c+dx;valid=(r2>=0)&(r2<gridshape[0])&(c2>=0)&(c2<gridshape[1]);r,c,r2,c2=r[valid],c[valid],r2[valid],c2[valid];good=mask[r2,c2];a=raster[r[good],c[good]];b=raster[r2[good],c2[good]];rr.extend(a);cc.extend(b);ww.extend([math.hypot(dx,dy)*STEP]*len(a));rr.extend(b);cc.extend(a);ww.extend([math.hypot(dx,dy)*STEP]*len(a))
 return pts,coo_matrix((ww,(rr,cc)),shape=(len(pts),len(pts))).tocsr(),cKDTree(pts)
sea_pts,sea_graph,sea_tree=graph(ocean)
_,components=connected_components(sea_graph);main=int(np.argmax(np.bincount(components)));selected=np.flatnonzero(components==main);sea_pts=sea_pts[selected];sea_graph=sea_graph[selected][:,selected];sea_tree=cKDTree(sea_pts)
land_pts,land_graph,land_tree=graph(land)
def snap(point,pts,tree,poly):
 ds,ix=tree.query(point,k=min(300,len(pts)))
 for index in np.atleast_1d(ix):
  line=LineString([point,pts[index]])
  if (allowed_sea if poly is ocean else allowed_land).covers(line):return int(index)
 raise ValueError('No surface-safe grid connector '+str(point))
gates={c['id']:next(f for f in fac if f['id']=='GATE-'+c['number']) for c in countries};coastal=[c['id'] for c in countries if c['coastal']]
direct_ports=[]
for c in coastal:
 f=gates[c];shore=shapes[c].boundary.intersection(ocean.boundary)
 if shore.is_empty:raise ValueError('Coastal metadata conflict '+c)
 pp=nearest_points(Point(f['point']),shore)[1];proposal=[pp.x,pp.y]
 try:snap(proposal,sea_pts,sea_tree,ocean)
 except ValueError:
  samples=[shore.interpolate(t,normalized=True) for t in np.linspace(0,1,160)]
  for cand in sorted(samples,key=lambda p:p.distance(Point(f['point']))):
   try:snap([cand.x,cand.y],sea_pts,sea_tree,ocean);proposal=[cand.x,cand.y];break
   except ValueError:continue
  else:
   f['harbourAccessStatus']='NARROW_WATER_ACCESS_NOT_RESOLVED_AT_6PX_USE_OVERLAND_TRANSIT_PROPOSAL'
   f['projectId']='PROJECT-25';f['name']='河口与过境物流集群'
   continue
 direct_ports.append(c)
 f['previousCandidatePoint']=f['point'];f['point']=proposal;f['siteBasis']='Snapped to original ocean shoreline with ocean-grid access; harbour engineering not surveyed'
 for n in nodes:
  if n['id']==f['id']:n['point']=f['point']
coastal=direct_ports
print('Direct sea gateways',len(coastal),flush=True)
sea_idx={c:snap(gates[c]['point'],sea_pts,sea_tree,ocean) for c in coastal};sea_dist,sea_pred=dijkstra(sea_graph,indices=[sea_idx[c] for c in coastal],return_predecessors=True)
def extract(pred,source,target,pts):
 path=[int(target)];here=int(target)
 while here!=source:
  here=int(pred[here])
  if here<0:raise ValueError('Disconnected route')
  path.append(here)
 path.reverse();return [list(map(float,pts[i])) for i in path]
print('Sea graph ready',flush=True)
landlegs={};access_port={c:c for c in coastal}
for c in [c['id'] for c in countries if c['id'] not in coastal]:
 start=snap(gates[c]['point'],land_pts,land_tree,land);ds,pred=dijkstra(land_graph,indices=start,return_predecessors=True)
 options=[]
 for port in coastal:
  try:
   target=snap(gates[port]['point'],land_pts,land_tree,land)
   if np.isfinite(ds[target]):options.append((ds[target],port,target))
  except ValueError:pass
 if not options:raise ValueError('No overland exit '+c)
 _,port,target=min(options);line=LineString([gates[c]['point'],*extract(pred,start,target,land_pts),gates[port]['point']]);landlegs[c]=line;access_port[c]=port
print('Landlocked exits ready',flush=True)
routecache={};route_records=[]
for flow in flows:
 a,b=flow['sellerCountryId'],flow['buyerCountryId'];key=(a,b)
 if key not in routecache:
  pa,pb=access_port[a],access_port[b];row=coastal.index(pa);pieces=[]
  if a in landlegs:pieces.append(('LAND',landlegs[a]))
  if pa!=pb:
   sea=LineString([gates[pa]['point'],*extract(sea_pred[row],sea_idx[pa],sea_idx[pb],sea_pts),gates[pb]['point']]);pieces.append(('SEA',sea))
  if b in landlegs:pieces.append(('LAND',LineString(list(landlegs[b].coords)[::-1])))
  if not pieces:raise ValueError('Empty route')
  coords=[];segments=[];states={a,b};length=0
  for mode,line in pieces:
   outside=line.difference((allowed_sea if mode=='SEA' else allowed_land)).length
   if outside>.1:raise ValueError('Surface mismatch '+a+' '+b+' '+str(outside))
   segments.append({'mode':mode,'points':[list(p) for p in line.coords],'distanceKm':line.length*km,'surfaceOutsideLengthPixels':outside});length+=line.length*km
   if mode=='LAND':states.update(c for c,shape in shapes.items() if line.intersection(shape).length>.1)
   coords.extend(list(line.coords))
  rid=f'ROUTE-{len(route_records)+1:04}';record={'id':rid,'fromCountryId':a,'toCountryId':b,'fromNodeId':gates[a]['id'],'toNodeId':gates[b]['id'],'portCountryIds':[pa,pb],'transitCountryIds':sorted(states-{a,b}),'segments':segments,'distanceKm':length,'status':'TERRAIN_CONSTRAINED_PLANNING_ROUTE_NOT_SURVEYED','gridStepPixels':STEP,'engineeringAndRightsApproved':False};route_records.append(record);routecache[key]=record
 route=routecache[key];flow['mode']='MULTIMODAL_WITH_TRANSIT' if any(seg['mode']=='LAND' for seg in route['segments']) else 'SEA_PORT_TO_PORT';flow.update(routeId=route['id'],distanceKmEstimate=round(route['distanceKm'],6),travelSimDaysEstimate=round(sum(seg['distanceKm']/(24*(25 if seg['mode']=='SEA' else 35)) for seg in route['segments'])+2,6),transportCostGcuDayProposal=round(flow['freightTonnesDay']*route['distanceKm']*.015,6),physicalRouteStatus=route['status'],routeGeometry={'routeId':route['id']},requiresTransit=bool(route['transitCountryIds']))
 if route['transitCountryIds']:trans.append({'id':'TRANSIT-'+flow['id'],'flowId':flow['id'],'countryIds':route['transitCountryIds'],'consentStatus':'PROPOSED_NOT_GRANTED'})
for edge in dom:
 cid=edge['countryId'];point=next(f['point'] for f in fac if f['id']==edge['fromId']);edge['distanceKmEstimate']=math.dist(point,gates[cid]['point'])*km*1.35;edge['engineeringStatus']='Local road alignment requires terrain survey'
regions=get('regions')
for c in countries:
 c['seaAccessPortCountryId']=access_port[c['id']]
 c['seaAccessBasis']='DIRECT_GRID_CONNECTED_COAST' if c['id'] in coastal else 'CONSERVATIVE_FOREIGN_PORT_ACCESS_PROPOSAL'
 gate=gates[c['id']];eligible=[r for r in regions if r['countryId']==c['id'] and parse_path(r['path']).buffer(.01).covers(Point(gate['point']))]
 if eligible:
  gate['regionId']=eligible[0]['id']
  next(n for n in nodes if n['id']==gate['id'])['regionId']=gate['regionId']
put('countries',countries)
put('facilities',fac);put('nodes',nodes);put('trade-plans',flows);put('transit-proposals',trans);put('transport-routes',route_records);put('domestic-access',dom)
print('Terrain-constrained routes',len(route_records),'foreign-port access',{c:p for c,p in access_port.items() if c!=p})
