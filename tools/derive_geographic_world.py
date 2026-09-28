"""Reproducible fictional geography scenario, never an authoritative initializer.
All coefficients are authored scenario assumptions, not measurements or handbook defaults.
"""
import json, math, hashlib
from pathlib import Path
from collections import Counter
import numpy as np
from scipy import ndimage as ndi
from shapely import contains_xy
from shapely.geometry import Point, LineString, box
from shapely.ops import unary_union
from atlas_display_geometry import parse_path,to_svg
ROOT=Path(__file__).resolve().parents[1];D=ROOT/'apps/world-web/src/map-lab';OUT=ROOT/'artifacts/world-geography'
d=json.loads((OUT/'atlas-before-season-alignment.json').read_text());p=json.loads((D/'land-partition.json').read_text())
w,h=p['width'],p['height'];km=36000/w;area_factor=km*km
Y,X=np.mgrid[:h,:w];land=contains_xy(parse_path(p['coastPath']),X,Y)
climate=np.zeros((h,w),dtype=np.uint8)
for c in d['climates']:climate[contains_xy(parse_path(c['path']),X,Y)]=c['id']
# Climate templates: temperature C, annual rain mm, rain seasonality, crop suitability.
CT=[(0,0,0,0),(13,1000,.2,.85),(26,2300,.15,.75),(11,1300,.2,.8),(19,450,.45,.48),(23,150,.6,.1),(3,600,.35,.35),(5,850,.4,.28),(25,1800,.65,.9),(25,900,.7,.6),(17,650,.7,.72),(6,350,.5,.3),(10,850,.4,.8),(16,1500,.4,.65),(-4,650,.4,.05)]
temp=np.array([x[0] for x in CT])[climate];rain=np.array([x[1] for x in CT])[climate];crop=np.array([x[3] for x in CT])[climate]
mount=np.zeros((h,w),bool)
def lines(path):
 return [LineString([list(map(float,v.split(','))) for v in s.rstrip('Z').split('L')]) for s in path.split('M')[1:]]
for f in d['physical']:
 if f['kind']=='mountain':mount|=contains_xy(unary_union(lines(f['path'])).buffer(12),X,Y)
lakes=unary_union([parse_path(f['path']) for f in d['physical'] if f['kind']=='lake'])
water=contains_xy(lakes,X,Y)&land;dry=land&~water
coastdist=ndi.distance_transform_edt(land);ridge_dist=ndi.distance_transform_edt(~mount)
elevation=np.where(land,80+coastdist*8+2600*np.exp(-ridge_dist/10),0)
slope=np.hypot(*np.gradient(elevation))/(km*1000)
# Six geological resources; distribute using environmental proxy scores, not country quotas.
geo={'oil':('CRUDE_OIL','原油','barrel',80000),'gas':('NATURAL_GAS','天然气','MMBtu',160000),'uranium':('URANIUM','铀','tonne U',.7),'iron':('IRON_ORE','铁矿石','tonne',50000),'copper':('COPPER','铜','tonne',1800),'lithium':('LITHIUM','锂','tonne LCE',100)}
for t in d['resourceTypes']:
 t['group']='首季地质资源' if t['id'] in geo else '农业用地' if t['id']=='grain' else '未启用背景'
 t['seasonEnabled']=t['id'] in geo or t['id']=='grain'
 if t['id'] in geo:t['name']=geo[t['id']][1]
# Keep 42 agricultural sites; retain 38 background sites, convert other nonseason points.
non=[r for r in d['resources'] if r['kind'] not in geo and r['kind']!='grain']
convert=non[:183]
counts=Counter(r['kind'] for r in d['resources'] if r['kind'] in geo)
def score(r,k):
 x,y=map(round,r['point']);e=elevation[y,x];rr=rain[y,x];inland=coastdist[y,x]
 return {'oil':1/(1+e/500),'gas':1/(1+e/650),'uranium':.3+e/2800,'iron':.5+e/1500,'copper':.4+math.exp(-abs(e-1100)/900),'lithium':.3+(1-rr/2600)*.8+inland/70}[k]
for r in convert:
 choices=list(geo)
 # Prefer geology while spreading potential suppliers across distinct countries.
 k=max(choices,key=lambda k:score(r,k)/math.sqrt(1+counts[k])/(1+sum(x['countryId']==r['countryId'] and x['kind']==k for x in d['resources'])))
 r['kind']=k;counts[k]+=1
# Reclassify sites publicly as known scenario candidates; no undiscovered records in browser.
for r in d['resources']:
 r['classification']='geological' if r['kind'] in geo else 'agriculture' if r['kind']=='grain' else 'background'
 r['commodityId']=geo[r['kind']][0] if r['kind'] in geo else 'GRAIN' if r['kind']=='grain' else ''
 r['visibility']='PUBLIC_SCENARIO_CANDIDATE';r['tradable']=False
# Spatial hierarchy and conserved land uses. Country polygons include inland jurisdiction.
regions=[];country_regions={};masks={};country_stats={};shapes={}
for c,territory in zip(d['political']['countries'],p['territories']):
 cid=c['id'];shape=parse_path(territory['path']);mask=contains_xy(shape,X,Y);masks[cid]=mask;shapes[cid]=shape
 ys,xs=np.where(mask);n=1+(len(xs)>5000)+(len(xs)>12000)
 edges=np.quantile(xs,np.linspace(0,1,n+1));edges[0]-=1;edges[-1]+=1
 country_regions[cid]=[]
 for j in range(n):
  m=mask&(X>=edges[j])&(X<(edges[j+1] if j<n-1 else edges[j+1]+1))
  if not m.any():continue
  rid=f'{cid}-E{j+1}';country_regions[cid].append(rid)
  build=m&dry&~mount;farm=build&(crop>.55)&(rain>450)&(rain<2200)
  forest=build&~farm&(rain>1000);urban=build&~farm&~forest&(coastdist<7)
  mountain=m&~water&mount;reserve=m&~(water|farm|forest|urban|mountain)
  uses={name:round(float(v.sum())*area_factor,3) for name,v in [('croplandPotential',farm),('forest',forest),('urbanIndustrialPotential',urban),('mountain',mountain),('inlandWater',m&water),('convertible',reserve)]}
  A=float(m.sum())*area_factor;R=float(rain[m].mean());T=float(temp[m].mean());E=float(elevation[m].mean());S=float(crop[m].mean());season=float(np.array([z[2] for z in CT])[climate[m]].mean())
  runoff=A*1e6*(R/1000)*(.12+.15*min(1,E/2200));environmental=runoff*.65;usable=(runoff-environmental)/360
  arable=uses['croplandPotential'];yield_t=1.2+3.8*S;crop_water=5000
  irrigation_area=min(arable*100,usable*360/crop_water);grain_potential=irrigation_area*yield_t
  carrying=min(grain_potential/.24,usable*360/65)
  # Population is a settlement scenario constrained by local land and water, not observed history.
  access=1/(1+float(coastdist[m].mean())/25);pop=int(max(1000,carrying*(.22+.22*access)))
  work=round(pop*.64);labour=round(work*(.58+.12*access));high=round(labour*(.05+.1*access));mid=round(labour*(.22+.15*access));low=labour-high-mid
  housing=round(pop/3.2);annual_grain=pop*.24;cropped_ha=min(irrigation_area,annual_grain*1.25/yield_t)
  occupied_km2=cropped_ha/100
  centroid=shape.intersection(box(float(edges[j]),-.5,float(edges[j+1]),h-.5)).representative_point()
  regions.append(dict(id=rid,countryId=cid,path=to_svg(shape.intersection(box(float(edges[j]),-.5,float(edges[j+1]),h-.5)).buffer(0)),label=[centroid.x,centroid.y],areaKm2=round(A,3),landUseKm2=uses,
   natural=dict(meanElevationM=round(E),temperatureC=round(T,1),annualRainMm=round(R),monthlyRainMm=[round(R*(1+season*math.cos(2*math.pi*(mo-6)/12))/12,2) for mo in range(12)],
    runoffM3Year=round(runoff),environmentalFlowM3Year=round(environmental),allocatableWaterM3Day=round(usable),drySeasonWaterM3Day=round(usable*(1-season*.7)),
    grainPotentialTonnesYear=round(grain_potential),grainYieldTonnesHa=round(yield_t,3),solarKwhM2Day=round(3+2.6*(1-R/2600),2),windMps=round(4+2*access+E/1800,2),
    droughtExposure=round(1-R/2600,3),floodExposure=round(min(1,R/2600*access),3),stormExposure=round(access*max(0,1-abs(T-24)/25),3)),
   initial=dict(population=pop,workingAge=work,labourForce=labour,skills={'low':low,'medium':mid,'high':high},households=housing,housingUnits=round(housing*(.93+.12*access)),
    croplandHa=round(cropped_ha,2),grainTonnesDay=round(cropped_ha*yield_t/360,3),grainDemandTonnesDay=round(annual_grain/360,3),foodStockTonnes=round(annual_grain/360*(20+40*(1-access)),3),
    teachers=round(pop/220),medicalWorkers=round(pop/350),schoolSeats=round(pop*.19),hospitalBeds=round(pop/500)),
   basis='GEOGRAPHIC_SCENARIO_ESTIMATE',settlementAccess=round(access,4)))
 by=[r for r in regions if r['countryId']==cid];country_stats[cid]=dict(population=sum(r['initial']['population'] for r in by),areaKm2=sum(r['areaKm2'] for r in by),waterM3Day=sum(r['natural']['allocatableWaterM3Day'] for r in by),regionIds=country_regions[cid])
# Human geography redistribution: settlement gravity, river access and cultivable plains.
# Preserve the total scenario population; change its spatial distribution before balance checks.
old_total=sum(r['initial']['population'] for r in regions)
settlement_weights=[]
for r in regions:
    x,y=r['label'];coast_access=r['settlementAccess']
    transport_distance=min(math.dist(r['label'],n['point']) for n in d['nodes'])*km
    river_distance=min(math.dist(r['label'],f['label']) for f in d['physical'] if f['kind']=='river')*km
    transport_gravity=1/(1+transport_distance/700);river_gravity=1/(1+river_distance/250)
    farm_share=r['landUseKm2']['croplandPotential']/r['areaKm2']
    mineral_frontier=sum(v['countryId']==r['countryId'] and v['kind'] in geo for v in d['resources'])
    weight=r['initial']['population']*(.25+1.2*transport_gravity+.9*river_gravity+.8*farm_share+.12*math.log1p(mineral_frontier))
    settlement_weights.append(weight)
    r['humanGeography']=dict(transportDistanceKm=round(transport_distance),riverDistanceKm=round(river_distance),transportGravity=round(transport_gravity,4),riverGravity=round(river_gravity,4),
      settlementType='贸易城市带' if transport_gravity>.55 else '农业河谷' if farm_share>.35 else '资源腹地' if mineral_frontier>2 else '低密度腹地',
      scenarioUrbanShare=round(min(.86,.18+.5*transport_gravity+.13*coast_access),3),basis='HUMAN_GEOGRAPHY_SCENARIO_NOT_OBSERVED_HISTORY')
allocated=np.floor(np.array(settlement_weights)/sum(settlement_weights)*old_total).astype(int)
allocated[np.argmax(settlement_weights)]+=old_total-int(allocated.sum())
for r,pop in zip(regions,allocated):
    initial=r['initial'];pop=int(pop);g=r['humanGeography'];access=g['transportGravity'];urban=g['scenarioUrbanShare']
    working=round(pop*(.58+.09*urban));labour=round(working*(.58+.13*access));high=round(labour*(.035+.17*urban));medium=round(labour*(.19+.24*urban))
    households=round(pop/(3.7-.9*urban));grain_demand=pop*.24/360
    cropped_ha=min(r['landUseKm2']['croplandPotential']*100,r['natural']['allocatableWaterM3Day']*360/5000)*(.22+.35*(1-urban))
    initial.update(population=pop,workingAge=working,labourForce=labour,skills={'low':labour-high-medium,'medium':medium,'high':high},households=households,housingUnits=round(households*(1.08-.2*urban)),
     croplandHa=round(cropped_ha,2),grainTonnesDay=round(cropped_ha*r['natural']['grainYieldTonnesHa']/360,3),grainDemandTonnesDay=round(grain_demand,3),foodStockTonnes=round(grain_demand*(20+40*(1-access)),3),
     teachers=round(pop*(.0028+.002*urban)),medicalWorkers=round(pop*(.0016+.0022*urban)),schoolSeats=round(pop*.19),hospitalBeds=round(pop*(.001+.002*urban)))
for cid,v in country_stats.items():v['population']=sum(r['initial']['population'] for r in regions if r['countryId']==cid)
print('Spatial, water and human geography settlement model complete',flush=True)
# Deposits use local proxy province, weighted prospect area and explicit abundance coefficients.
deposits=[]
for r in d['resources']:
 if r['kind'] not in geo:continue
 cid=r['countryId'];x,y=map(round,r['point']);E=float(elevation[y,x]);s=score(r,r['kind']);local=sum(t['countryId']==cid and t['kind'] in geo for t in d['resources'])
 catchment=country_stats[cid]['areaKm2']/max(1,local);total=round(catchment*geo[r['kind']][3]*s,3);depth=round(80+E*.35)
 difficulty=1+depth/1000+coastdist[y,x]/40;recovery=min(.75,.65/difficulty);recoverable=total*recovery;developed=recoverable*(.08+.12/(difficulty));extracted=developed*.015
 deposits.append(dict(id=r['id'],countryId=cid,commodityId=r['commodityId'],unit=geo[r['kind']][2],provinceId=f'PROVINCE-{int(x//300)}-{int(y//220)}',provinceType='basin' if r['kind'] in ('oil','gas') else 'mineral-belt',
  initialGeological=total,historicalConsumed=round(extracted,3),cumulativeExtracted=round(extracted,3),remainingGeological=round(total-extracted,3),discoveredRemaining=round((total-extracted)*.7,3),recoverableRemaining=round(recoverable-extracted,3),developedRemaining=round(developed-extracted,3),
  qualityProxy=round(s,3),depthM=depth,developmentDifficulty=round(difficulty,3),extractionCapacityPerDay=round(developed/(360*25)/difficulty,4),requiredRoad=True,requiredGrid=True,visibility='PUBLIC_SCENARIO_CANDIDATE',uncertaintyFactor=[.25,4]))
# 350 candidates reallocated by settlement size and mineral access, no five-per-country rule.
existing_nodes=d['nodes'];facilities=[];weights={cid:math.sqrt(v['population']) for cid,v in country_stats.items()};targets={cid:max(2,sum(n['countryId']==cid for n in existing_nodes)) for cid in weights}
while sum(targets.values())<350:
 cid=max(weights,key=lambda c:weights[c]/(targets[c]+1));targets[cid]+=1
project_names={1:'油田开发',2:'气田开发',3:'铀矿',4:'铁矿',5:'铜矿',6:'锂矿',7:'燃气电厂',10:'太阳能设施',11:'风能设施',12:'电网升级',13:'储能设施',14:'钢铁厂',15:'炼油厂',16:'设备工厂',17:'半导体工厂',18:'大型电池工厂',21:'深水港',25:'物流枢纽',31:'基础教育设施',32:'职业教育设施',34:'基层医疗设施',36:'公共住房'}
project_mine={'oil':1,'gas':2,'uranium':3,'iron':4,'copper':5,'lithium':6}
for cid,target in targets.items():
 localres=[r for r in d['resources'] if r['countryId']==cid and r['kind'] in geo];base=[n for n in existing_nodes if n['countryId']==cid];remaining=target-len(base)
 options=[r for r in d['resources'] if r['countryId']==cid];mask=masks[cid]&dry;ys,xs=np.where(mask)
 for j in range(remaining):
  resource=localres[j] if j<len(localres) else None
  if resource:point=resource['point'];project=project_mine[resource['kind']];kind='mine' if project>2 else 'energy'
  else:
   used=base+[f for f in facilities if f['countryId']==cid]
   distances=np.min([(xs-f['point'][0])**2+(ys-f['point'][1])**2 for f in used],axis=0) if used else coastdist[ys,xs]
   i=int(np.argmax(distances));point=[int(xs[i]),int(ys[i])]
   project=[10,11,25,31,34,36,16,13][(j-len(localres))%8];kind='energy' if project in (10,11,13) else 'hub' if project==25 else 'factory'
  facilities.append(dict(id=f'SF{len(facilities)+1:03}',countryId=cid,point=point,kind=kind,name=project_names[project]+'（情景候选）',resourceId=resource['id'] if resource else None,projectId=f'PROJECT-{project:02}',projectNumber=project))
d['facilities']=facilities
for n in existing_nodes:n['projectId']='PROJECT-21' if n['kind']=='port' else 'PROJECT-25';n['projectNumber']=21 if n['kind']=='port' else 25
all_fac=existing_nodes+facilities
# Geographic freight access: every candidate connects to country centre; connectors are proposed,
# and water crossings are explicitly multimodal corridors requiring ports/ferries, never roads.
network_nodes=[dict(id=f['id'],countryId=f['countryId'],point=f['point']) for f in all_fac];links=[];hubs={}
for cid in country_stats:
 local=[f for f in all_fac if f['countryId']==cid];hubs[cid]=next((f for f in local if f['kind'] in ('port','hub')),local[0])
 for f in local:
  if f['id']==hubs[cid]['id']:continue
  links.append((f,hubs[cid],'domestic'))
# Euclidean minimum spanning tree connects all economies as survey corridors, preserving original trunk routes.
from scipy.sparse.csgraph import minimum_spanning_tree
hublist=list(hubs.values());pts=np.array([f['point'] for f in hublist]);dist=np.linalg.norm(pts[:,None]-pts[None,:],axis=2)
tree=minimum_spanning_tree(dist).tocoo()
for a,b in zip(tree.row,tree.col):links.append((hublist[a],hublist[b],'international'))
transport=[]
land_shape=parse_path(p['coastPath']).difference(lakes)
for i,(a,b,scope) in enumerate(links):
 line=LineString([a['point'],b['point']]);over_water=line.difference(land_shape).length>0;mode='multimodal-survey' if over_water else 'land-survey';length=line.length*km
 passing=[cid for cid,mask in masks.items() if False] # computed from sampled corridor below
 samples=[line.interpolate(t,normalized=True) for t in np.linspace(0,1,max(2,int(line.length/3)))];country_ids=set()
 for cid in (a['countryId'],b['countryId']):country_ids.add(cid)
 for c in p['territories']:
  shape=shapes[c['id']]
  if line.intersection(shape).length>0:country_ids.add(c['id'])
 demand=min(country_stats[a['countryId']]['population'],country_stats[b['countryId']]['population'])*.002
 capacity=max(25,demand/(1+length/1500));speed=18 if over_water else 30
 transport.append(dict(id=f'ACCESS-{i+1:03}',fromId=a['id'],toId=b['id'],countryIds=sorted(country_ids),path=to_svg(line),distanceKm=round(length,2),mode=mode,status='SURVEY_CORRIDOR',operating=False,
  capacityTonnesDay=round(capacity,2),travelSimDays=round(length/(speed*24)+(.75 if over_water else .25),3),cargo='STANDARD_COMMODITIES_EXCLUDING_ELECTRICITY',requiresTransitConsent=len(country_ids)>1,requiresPortOrFerry=over_water))
print('Freight corridor geometry complete',flush=True)
# Facility scenario state with units. No commissioning until matching core recipe and network validation.
facility_records=[];grid=[]
for f in all_fac:
 cid=f['countryId'];pop=country_stats[cid]['population'];count=targets[cid];workers=max(12,round(math.sqrt(pop)*(.4 if f['kind']=='mine' else .25)))
 dep=next((r for r in deposits if r['id']==f.get('resourceId')),None)
 capacity=dep['extractionCapacityPerDay'] if dep else max(10,round(pop/count*.002,2));unit=dep['unit']+'/sim-day' if dep else {10:'MW',11:'MW',13:'MWh',16:'equipment-unit/sim-day',21:'tonne/sim-day',25:'tonne/sim-day',31:'student-seat',34:'patient-visit/sim-day',36:'dwelling-unit'}[f['projectNumber']]
 required_mw=round(workers*.018,3)
 facility_records.append(dict(id=f['id'],countryId=cid,projectId=f['projectId'],projectNumber=f['projectNumber'],name=project_names[f['projectNumber']],lifecycle='CANDIDATE',operational=False,
  estimatedCapacity=capacity,capacityUnit=unit,requiredWorkers=workers,requiredPowerMW=required_mw,requiredWaterM3Day=round(workers*1.8),maintenanceGcuDay=round(workers*8+capacity*.02,2),equipmentUnits=max(1,round(workers/20)),
  constructionSimDays=round(90+workers*.06+capacity**.25),recipeStatus='CORE_COEFFICIENT_BINDING_REQUIRED',inputCategories=['LABOUR','MACHINERY','ELECTRICITY']+([dep['commodityId']+'_DEVELOPED_RESERVE'] if dep else []),
  gridNodeId='GRID-'+cid,accessNodeId=f['id'],capacityBasis='GEOGRAPHIC_SCENARIO_ESTIMATE'))
for cid,v in country_stats.items():
 local=[r for r in regions if r['countryId']==cid];solar=sum(r['natural']['solarKwhM2Day']*r['areaKm2'] for r in local)/v['areaKm2'];wind=sum(r['natural']['windMps']*r['areaKm2'] for r in local)/v['areaKm2'];demand=v['population']*.00045
 grid.append(dict(id='GRID-'+cid,countryId=cid,scenarioDemandMW=round(demand,3),solarCapacityFactor=round(solar/24,4),windCapacityFactor=round(min(.5,(wind/12)**3),4),suggestedGenerationMW=round(demand*1.2/max(.1,solar/24),2),transferCapacityMW=round(demand*1.15,3),lossFraction=.06,crossBorderConnections=[],status='CANDIDATE_NOT_ENERGIZED'))
# Social scenario balances. Geography informs buffers and ability, not historical debt.
society=[]
for cid,v in country_stats.items():
 local=[r for r in regions if r['countryId']==cid];population=v['population'];labour=sum(r['initial']['labourForce'] for r in local);employment=round(labour*.86)
 food=sum(r['initial']['grainTonnesDay'] for r in local);demand=sum(r['initial']['grainDemandTonnesDay'] for r in local)
 wage=18+sum(r['settlementAccess']*r['initial']['population'] for r in local)/population*12;income=round(employment*wage,2);cash=round(income*30,2)
 society.append(dict(countryId=cid,economyIdProposal='S1-'+cid[-2:],bindingStatus='UNBOUND',population=population,labourForce=labour,scenarioEmployed=employment,scenarioUnemployed=labour-employment,
   foodProductionTonnesDay=round(food,3),foodDemandTonnesDay=round(demand,3),foodAvailableStockTonnes=round(sum(r['initial']['foodStockTonnes'] for r in local),3),foodReservedTonnes=0,foodInTransitTonnes=0,
   dailyIncomeGcu=income,treasuryCashGcu=cash,bankDepositsGcu=cash,bankReservesGcu=round(cash*.2,2),bankLoansGcu=round(cash*.9,2),bankEquityGcu=round(cash*.1,2),
   historicalDebtGcu=0,existingContracts=[],techLicenses=[],historicalPolicy='CLEAN_START_SCENARIO_NO_INFERRED_HISTORY',
   strengths=['可用耕地与淡水承载','具名资源与网络候选'],bottlenecks=['设施尚未完成配方与投运核验','历史技术和权利不由地理推定'],developmentPaths=['农业与国内集散建设','资源开发与跨境技术合作']))
# Basic food diagnostic is intentionally separate from actual 12-sector operation.
food_normal=sum(s['foodProductionTonnesDay'] for s in society);food_demand=sum(s['foodDemandTonnesDay'] for s in society)
food_dry=sum(r['initial']['grainTonnesDay']*r['natural']['drySeasonWaterM3Day']/max(1,r['natural']['allocatableWaterM3Day']) for r in regions)
# Seasonal storage recovery bounded by mapped lake surface and synthetic depth, requiring built works.
lake_storage=sum(parse_path(f['path']).area*area_factor*1e6*10 for f in d['physical'] if f['kind']=='lake')
food_recovery=min(food_normal,food_dry+lake_storage/90/(5000/3))
scenarios=[dict(id='normal-food-capacity',status='PASS' if food_normal>=food_demand else 'FAIL',supply=round(food_normal,2),demand=round(food_demand,2),scope='geographic potential, not actual operating supply'),dict(id='climate-derived-dry-season',supply=round(food_dry,2),demand=round(food_demand,2),status='SHORTFALL' if food_dry<food_demand else 'SURPLUS'),dict(id='cooperative-irrigation-recovery',supply=round(food_recovery,2),demand=round(food_demand,2),status='CAPACITY_SCENARIO_ONLY',requires=['construction','water allocation','labour','equipment','financing'])]
balance=[dict(regionId=r['id'],foodNetTonnesDay=round(r['initial']['grainTonnesDay']-r['initial']['grainDemandTonnesDay'],3),housingGapUnits=max(0,r['initial']['households']-r['initial']['housingUnits']),waterAfterHouseholdsAndFarmsM3Day=round(r['natural']['allocatableWaterM3Day']-r['initial']['population']*65/360-r['initial']['croplandHa']*5000/360),action='TRADE_HOUSING_POWER_AND_EMPLOYMENT_CALIBRATION_REQUIRED') for r in regions]
coeff=dict(status='AUTHORED_FICTIONAL_ASSUMPTIONS_NOT_HANDBOOK_PARAMETERS',worldWidthKm=36000,horizontalWrap=True,travelWrap='seam crossings require explicit edges; none inferred',simDaysYear=360,seasonSimDays=600,
 cropWaterM3HaYear=5000,grainTonnesPersonYear=.24,environmentalRunoffShare=.65,populationSettlementShare='Initial carrying-capacity total redistributed by transport gravity, river access, arable share and mineral frontier; see humanGeography',minSettlementPersons=1000,droughtRecoveryStorageDays=90,illustrativeUsableLakeDepthM=10,annualGeologicalDensity={k:{'unitPerKm2':v[3],'unit':v[2]} for k,v in geo.items()},uncertainty='Mineral volume 0.25x–4x; all scenario coefficients are configurable, not measured.')
rights=[dict(countryId=cid,landJurisdiction=cid,resourceDevelopment='SEPARATE_REGISTERED_LICENSE_REQUIRED',facilityOperation='SEPARATE_OPERATOR_LICENSE_REQUIRED',transit='CORRIDOR_CONSENT_REQUIRED',portUse='CAPACITY_AND_ACCESS_CONTRACT_REQUIRED',marineOverlap='DEVELOPMENT_FROZEN_UNTIL_DELIMITATION_OR_JOINT_REGISTER',navigation='SEPARATE_FROM_RESOURCE_DEVELOPMENT',sharedWater='BASIN_ALLOCATION_REQUIRED') for cid in country_stats]
# Simplified disjoint catchment allocation to nearest mapped water feature.
hydro=[]
features=[f for f in d['physical'] if f['kind'] in ('river','lake')]
for r in regions:
    nearest=min(features,key=lambda f:math.dist(r['label'],f['label']))
    r['basinId']='BASIN-'+nearest['id']
for f in features:
    rid='BASIN-'+f['id'];catchment=[r for r in regions if r['basinId']==rid]
    flow=sum(r['natural']['runoffM3Year'] for r in catchment)
    lake_area=parse_path(f['path']).area*area_factor if f['kind']=='lake' else 0
    e=sum(r['natural']['meanElevationM']*r['areaKm2'] for r in catchment)/max(1,sum(r['areaKm2'] for r in catchment))
    hydro.append(dict(id=rid,featureId=f['id'],kind=f['kind'],regionIds=[r['id'] for r in catchment],countryIds=sorted(set(r['countryId'] for r in catchment)),
      annualInflowM3=flow,environmentalFlowM3Year=round(flow*.65),allocatableM3Day=round(flow*.35/360),
      lakeStorageM3=round(lake_area*1e6*(5+e/100)) if f['kind']=='lake' else 0,freshwaterAssumed=True,
      outlet='OCEAN_OR_ENDORHEIC_REQUIRES_SURVEY',allocationMethod='NEAREST_WATER_FEATURE_REGION_PARTITION',
      limitation='Simplified catchments, not topographically validated drainage; no independent basin water multiplier'))
# Five non-authoritative tables, with traceability to PDF and source hashes.
source=dict(handbook='EconMind Season1 Official Handbook CN v1.1',pages=[22,23,90,93,94,95,96,98],pdfSha256='befe98dbe34531a40019104712c3b185ab14be33b944553a85a53268e8b8cb40',partitionSha256=hashlib.sha256((D/'land-partition.json').read_bytes()).hexdigest())
tables={'world-space':dict(scale=coeff,regions=regions),'natural-endowment':dict(deposits=deposits,climateTemplates=CT,basins=hydro),'opening-society':dict(countries=society,facilities=facility_records),'connections-rights':dict(nodes=network_nodes,freight=transport,power=grid,rights=rights),'initialization-validation':dict(source=source,coefficients=coeff,balanceChecks=balance,scenarios=scenarios,blockers=['AGRICULTURE_CORE_OWNER_AND_RECIPE_UNRESOLVED','RECIPE_COEFFICIENTS_AND_SEASON_CALIBRATION_REQUIRED','STATE_IDENTITY_AND_PRIVATE_DATA_GATE_REQUIRED','MULTIMODAL_CORRIDORS_REQUIRE_ROUTING_AND_TRANSIT_REGISTRATION','FULL_NORMAL_DISRUPTION_RECOVERY_SIMULATION_NOT_RUN'],activationAllowed=False)}
for name,value in tables.items():(OUT/(name+'.json')).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
summary=dict(status='GEOGRAPHIC_SCENARIO_NOT_LIVE',source=source,coefficients=coeff,regions=regions,basins=hydro,countries=society,deposits=deposits,facilities=facility_records,freight=transport,power=grid,rights=rights,balanceChecks=balance,scenarios=scenarios,blockers=tables['initialization-validation']['blockers'],activationAllowed=False)
(D/'geographic-scenario.json').write_text(json.dumps(summary,ensure_ascii=False,separators=(',',':'))+'\n')
d['seasonAlignment']=dict(geologicalResources=6,geologicalSites=len(deposits),agricultureSites=sum(r['kind']=='grain' for r in d['resources']),backgroundSites=sum(r['classification']=='background' for r in d['resources']),status='HANDBOOK_CATALOG_ALIGNED_SCENARIO_UNCALIBRATED')
(D/'atlas-layers.json').write_text(json.dumps(d,ensure_ascii=False,separators=(',',':'))+'\n')
print(json.dumps(dict(regions=len(regions),minerals=dict(Counter(r['commodityId'] for r in deposits)),supplierCountries={k:len(set(r['countryId'] for r in deposits if r['commodityId']==geo[k][0])) for k in geo},facilities=len(all_fac),minFacilities=min(targets.values()),maxFacilities=max(targets.values()),corridors=len(transport),scenarios=scenarios)))
