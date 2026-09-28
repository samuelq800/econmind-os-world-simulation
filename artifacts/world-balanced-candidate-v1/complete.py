"""Complete candidate links, explicit assumptions, inventory provenance and audit views."""
from pathlib import Path
import json,math,csv,hashlib,html
from collections import defaultdict
import numpy as np
B=Path(__file__).parent;D=B/'data'
def get(n):return json.loads((D/(n+'.json')).read_text())
def put(n,v):(D/(n+'.json')).write_text(json.dumps(v,ensure_ascii=False,indent=2,allow_nan=False)+'\n')
countries=get('countries');regions=get('regions');fac=get('facilities');stocks=get('stocks');flows=get('trade-plans');deposits=get('deposits');catalog=get('commodity-catalog');plans=get('production-plans');emp=get('employment');power=get('power');fin=get('finance');changes=get('changes');recipes=get('recipes');C=[c['id'] for c in countries];G=[g['id'] for g in catalog];units={g['id']:g['unit'] for g in catalog};prices={g['id']:g['referencePriceGcu'] for g in catalog};masses={g['id']:g['freightTonnesPerUnit'] for g in catalog}
# Transit startup stock is not silently assumed to arrive on day zero.
for c in countries:
 cid=c['id'];lead=max([f['travelSimDaysEstimate'] for f in flows if f['buyerCountryId']==cid]+[0]);days=max(c['stockBufferDays'],math.ceil(lead)+35)
 c['stockBufferDays']=days;c['longestInboundLeadDays']=lead
 for st in stocks:
  if st['countryId']==cid:
   p=next(p for p in plans if p['countryId']==cid and p['commodityId']==st['commodityId']);st.update(available=round(p['usePerDay']*days,6),bufferDays=days)
 warehouse=next(f for f in fac if f['id']=='WAREHOUSE-'+c['number']);warehouse['capacity']=round(sum(st['available']*masses[st['commodityId']] for st in stocks if st['countryId']==cid)*1.15+100,6)
# Backcast physical mineral content of all initial stock through the same recipes.
# Reclassify previously extracted/consumed historical material; never create ore.
A=np.eye(len(G))
for r in recipes:
 for inp,q in r['inputsPerUnit'].items():A[G.index(inp),G.index(r['commodityId'])]-=q
final_stock=np.array([sum(s['available'] for s in stocks if s['commodityId']==g) for g in G]);gross=np.linalg.solve(A,final_stock);opening_material=[]
for j,g in enumerate(G):
 ds=[d for d in deposits if d['commodityId']==g]
 if not ds:continue
 extracted=sum(d['cumulativeExtracted'] for d in ds);needed=float(gross[j])
 if needed>extracted+1:raise ValueError('Opening stock exceeds prior extraction '+g)
 for d in ds:
  allocated=needed*d['cumulativeExtracted']/extracted
  d['openingStockRawEquivalentAllocated']=allocated;d['historicalConsumed']=d['cumulativeExtracted']-allocated
 opening_material.append({'commodityId':g,'unit':units[g],'cumulativeExtraction':extracted,'openingStockRawEquivalent':needed,'historicalConsumed':extracted-needed,'basis':'Raw-equivalent decomposition includes mineral content in processed opening stocks; no increase in geological endowment or extraction'})
# Buildable land is an explicit, conserved allocation; production land is protected.
land_program=[]
for c in countries:
 cid=c['id'];pg=next(g for g in power if g['countryId']==cid);landneeded=c['population']/15000+pg['solarMW']*.025+pg['windMW']*.005
 local=[r for r in regions if r['countryId']==cid];remaining=landneeded
 for r in sorted(local,key=lambda r:-r['areaKm2']):
  uses=r['landUseKm2'];spare=max(0,uses['croplandPotential']-r['initial']['croplandHa']/100);sources=[('convertible',uses['convertible']),('croplandPotential',spare),('forest',uses['forest']*.02)]
  for typ,available in sources:
   amount=min(remaining,available);uses[typ]-=amount;uses['urbanIndustrialPotential']+=amount;remaining-=amount
   if amount>0:land_program.append({'countryId':cid,'regionId':r['id'],'from':typ,'to':'urbanIndustrialPotential','areaKm2':amount,'reason':'Explicit settlement and renewable facility footprint allocation'})
 if remaining>.01:raise ValueError('Insufficient non-cropping development land '+cid)
 c['openingSettlementAndEnergyLandKm2']=landneeded
# Complete point asset operating, labour, maintenance and cost proposals. Aggregate
# facilities represent regional networks rather than implausibly gigantic single plants.
service_by={s['regionId']:s for s in get('population-services')}
for c in countries:
 cid=c['id'];opening=[f for f in fac if f['countryId']==cid and f['scenarioRole']=='OPENING_PORTFOLIO'];jobs=next(e for e in emp if e['countryId']==cid)
 for f in opening:
  role=f['projectId'];sv=service_by[f['regionId']]
  if f.get('commodityId'):continue
  if role=='PROJECT-31':f['requiredWorkers']=sv['teachers']
  elif role=='PROJECT-35':f['requiredWorkers']=sv['medicalWorkers']
  elif role in ['PROJECT-10','PROJECT-11','PROJECT-13','PROJECT-23']:
   # power jobs divided across generation, grid and storage, total conserved
   f['requiredWorkers']=jobs['power']//4
  elif role in ['PROJECT-21','PROJECT-25','PROJECT-26']:f['requiredWorkers']=jobs['logistics']//2
  elif role=='PROJECT-36':f['requiredWorkers']=0 # maintenance is part of other domestic services
 for types,total in [(['PROJECT-10','PROJECT-11','PROJECT-13','PROJECT-23'],jobs['power']),(['PROJECT-21','PROJECT-25','PROJECT-26'],jobs['logistics'])]:
  fs=[f for f in opening if f['projectId'] in types];fs[0]['requiredWorkers']+=total-sum(f['requiredWorkers'] for f in fs)
 # per-deposit worker ceilings may differ slightly from sector aggregate; reconcile explicitly.
 for g,n in jobs['sectors'].items():
  fs=[f for f in opening if f.get('commodityId')==g]
  if fs:fs[0]['requiredWorkers']+=n-sum(f['requiredWorkers'] for f in fs)
 c['occupiedProductionAndPublicServiceJobs']=sum(f['requiredWorkers'] for f in opening)
 for f in opening:
  n=f['requiredWorkers'];g=f.get('commodityId');hi=.30 if g=='SEMICONDUCTORS' else .18 if g in ['MACHINERY','BATTERIES'] else .08;mid=.35
  high=round(n*hi);medium=round(n*mid);f['labourBySkill']={'low':n-high-medium,'medium':medium,'high':high}
# Cost figures are authored asset-level values, not measured geography or fake handbook rules.
capex_by_unit={'MW':900000,'MWh':160000,'bed':70000,'student-seat':6000,'dwelling-unit':65000,'tonne':120,'tonne/sim-day':1800,'barrel/sim-day':18000,'barrel equivalent/sim-day':18000,'MMBtu/sim-day':2400,'tonne U/sim-day':6000000,'tonne LCE/sim-day':600000,'equipment unit/sim-day':1200000,'standardised chip unit/sim-day':3500,'MWh-equivalent/sim-day':1800000,'patient-visit/sim-day':40000,'equipment-unit/sim-day':1200000}
for f in fac:
 if f['scenarioRole']=='OPENING_PORTFOLIO':
  if f['capacityUnit'] not in capex_by_unit:raise ValueError(f['capacityUnit'])
  cost=f['capacity']*capex_by_unit[f['capacityUnit']];f.update(replacementCostGcuProposal=round(cost,2),dailyMaintenanceGcuProposal=round(cost*.02/360,2),conditionFraction=1,plannedUtilizationFraction=round(f.get('plannedOutputPerDay',0)/f['capacity'],6) if f.get('commodityId') else None,installedMachineryUnits=max(1,math.ceil(f['requiredWorkers']/20)),costBasis='AUTHORED_REFERENCE_COST_PER_CAPACITY_UNIT')
 # State is deliberately distinct from operating availability in a candidate test.
 f['constructionStatusProposal']='OPENING_EXISTING_ASSET' if f['scenarioRole']=='OPENING_PORTFOLIO' else 'UNBUILT_OPTION'
# Maintenance finance is explicit. No construction grant is counted as both cash and asset.
for c in countries:
 cid=c['id'];assets=[f for f in fac if f['countryId']==cid and f['scenarioRole']=='OPENING_PORTFOLIO'];maintenance=sum(f['dailyMaintenanceGcuProposal'] for f in assets);shipping=sum(f['transportCostGcuDayProposal'] for f in flows if f['buyerCountryId']==cid);fr=next(f for f in fin if f['countryId']==cid)
 revenue=fr['dailyLabourIncomeReference']*.18;trade=fr['dailyReferenceTradeNet'];drain=max(0,maintenance+shipping-trade-revenue)
 fr.update(openingPhysicalAssetBookValueGcu=round(sum(f['replacementCostGcuProposal'] for f in assets),2),assetFunding='GENESIS_PUBLIC_CAPITAL_EQUITY_NOT_NEW_CASH',dailyMaintenanceBudgetGcu=round(maintenance,2),dailyInboundFreightBudgetGcu=round(shipping,2),dailyTaxRevenueReferenceGcu=round(revenue,2),dailyNetCashDrainGcu=round(drain,2))
 # Concrete liquid reserve required for a 600-day candidate, with 60-day margin.
 reserve=max(fr['treasuryCentralBankBalance'],drain*660);fr['treasuryCentralBankBalance']=round(reserve,2);fr['reserveBasis']='max(60 days baseline labour income, 660 days maintenance+freight+trade shortfall net of tax)';fr['cashRunwayDays']=round(reserve/drain,2) if drain>0 else None;fr['cashRunwayStatus']='NO_BASELINE_DRAIN' if drain==0 else 'FINITE'
 c['maintenanceGcuDay']=round(maintenance,2);c['freightBudgetGcuDay']=round(shipping,2)
# Freshwater allocations account for people, irrigation and industries on regional boundaries.
water_alloc=[]
for c in countries:
 cid=c['id'];local=[r for r in regions if r['countryId']==cid];facwater=sum(f['requiredWaterM3Day'] for f in fac if f['countryId']==cid and f['scenarioRole']=='OPENING_PORTFOLIO' and f.get('commodityId')!='GRAIN')
 for r in local:
  domestic=r['initial']['population']*65/360;ag=r['initial']['croplandHa']*5000/360;industry=facwater*r['initial']['population']/c['population'];available=r['natural']['allocatableWaterM3Day'];water_alloc.append({'regionId':r['id'],'countryId':cid,'basinId':r['basinId'],'domesticM3Day':domestic,'agricultureM3Day':ag,'industryM3Day':industry,'allocatedM3Day':domestic+ag+industry,'availableM3Day':available,'remainingM3Day':available-domestic-ag-industry,'drySeasonAvailableM3Day':r['natural']['drySeasonWaterM3Day'],'rightsStatus':'ALLOCATION_PROPOSAL_NOT_GRANTED'})
# Keep original scene anchors and proposed new physical asset IDs explicitly linked.
original_scene={v['id']:v for v in get('illustration-links')['countryScenes']}
maplinks=[]
for f in fac:
 legacy=None
 if f.get('depositId'):
  legacy=next((v['id'] for v in fac if v.get('resourceId')==f['depositId'] and v['scenarioRole']=='DEVELOPMENT_OPTION'),None)
 art=original_scene.get(f['countryId'],{});anchor=art.get('anchors',{}).get(legacy or f['id'])
 maplinks.append({'facilityId':f['id'],'legacyFacilityId':legacy,'countryId':f['countryId'],'geographicPoint':f['point'],'sceneAnchor':anchor,'markerAction':'REUSE_ANCHOR' if anchor else 'NEW_MARKER_REQUIRED','scenePointAuthority':'DISPLAY_ONLY'})
put('facility-map-links',maplinks)
# Population clusters have explicit accounting and representative locations;
# they are regional aggregates, not invented precise addresses of painted towns.
settlements=[];hazards=[];hydrology=[]
for r in regions:
 pop=r['initial']['population'];urban=round(pop*r['humanGeography']['scenarioUrbanShare'])
 for typ,n in [('URBAN_CLUSTER',urban),('RURAL_SETTLEMENT_NETWORK',pop-urban)]:
  settlements.append({'id':r['id']+'-'+typ,'countryId':r['countryId'],'regionId':r['id'],'name':next(c['name'] for c in countries if c['id']==r['countryId'])+' '+r['id'].split('-')[-1]+('城镇群' if typ=='URBAN_CLUSTER' else '乡村聚落群'),'kind':typ,'population':n,'representativePoint':r['label'],'coordinatePrecision':'REGIONAL_REPRESENTATIVE_NOT_INDIVIDUAL_BUILDINGS'})
 n=r['natural']
 for kind,key,base,loss in [('DROUGHT','droughtExposure',.03,.25),('FLOOD','floodExposure',.02,.12),('STORM','stormExposure',.02,.10)]:
  hazards.append({'regionId':r['id'],'countryId':r['countryId'],'kind':kind,'exposure':n[key],'annualEventProbabilityProposal':round(base+.08*n[key],4),'productionLossFractionProposal':loss,'durationSimDaysProposal':90 if kind=='DROUGHT' else 10,'ruleAuthority':'AUTHORED_EVENT_RULE_NOT_OBSERVED_FREQUENCY'})
 hydrology.append({'regionId':r['id'],'basinId':r['basinId'],'monthlyRunoffM3Proposal':[round(n['runoffM3Year']*rain/sum(n['monthlyRainMm']),2) for rain in n['monthlyRainMm']],'ecologicalReserveShare':.65,'seasonalBasis':'Monthly rain proportion; no independent multiplier or exact drainage claim'})
put('settlements',settlements);put('hazard-proposals',hazards);put('seasonal-water',hydrology)
# An uncertainty table makes authored social/financial rules distinguishable from geography.
assumptions={'resourceVolumes':'UNCHANGED_FROM_FROZEN_GEOGRAPHIC_SCENARIO','population':'World total fixed; continuous human-geography redistribution','grainWaterM3HaYear':5000,'averageGridLossFraction':.06,'storageHoursAtAverageDemand':48,'storageEfficiency':.9,'solarFootprintKm2MW':.025,'windDedicatedFootprintKm2MW':.005,'urbanPopulationPerKm2':15000,'minimumStockDaysAfterLongestDelivery':35,'normalTradeBalanceBand':.08,'industrialPortfolioMinimumShareOfConsumptionValuePerRoute':'0.06 + 0.03 * country urban share','openingCapital':'Explicit pre-existing public asset endowment; replacement values separately recorded','financialAndRecipeNumbers':'AUTHORED_CANDIDATE_NOT_INFERABLE_FACTS','domesticAccessDetourFactor':1.35,'internationalRouting':'terrain-constrained 6px graph when transport-routes.json exists','transportCostGcuTonneKm':.015,'referenceFuelDemandBarrelEquivalentPersonDay':.001,'rejectedDraftFuelDemand':.002,'fuelCorrectionReason':'Rejected draft exceeded existing aggregate oil extraction capacity','costPerCapacityUnit':capex_by_unit,'demographicDynamics':{'birthRatePerYear':.012,'deathRatePerYear':.009,'netMigration':0,'appliedInSteadyStateRehearsal':False,'basis':'Optional scenario proposal; simulation uses fixed initial population'},'disasterRules':{'droughtTestYieldReduction':.25,'droughtDurationDays':90,'importPauseDays':30,'hazardExposureIsNotEventProbability':True}}
for name,val in [('countries',countries),('regions',regions),('facilities',fac),('stocks',stocks),('deposits',deposits),('finance',fin),('land-program',land_program),('opening-material-reconciliation',opening_material),('water-allocations',water_alloc),('assumptions',assumptions)]:put(name,val)
# Full data dictionary generated from actual emitted structures, preserving nested fields.
def fields(v,prefix=''):
 if isinstance(v,dict):
  for k,x in v.items():yield from fields(x,prefix+'.'+k if prefix else k)
 elif isinstance(v,list):
  if v and isinstance(v[0],dict):yield from fields(v[0],prefix+'[]')
  else:yield prefix,'array'
 else:yield prefix,type(v).__name__
lines=['# World V2 完整候选数据字典','', '所有 JSON 均为候选设计数据；本目录没有生产入库脚本。JSON 保留完整嵌套关系，CSV 中嵌套对象使用 JSON 单元格。','']
for file in sorted(D.glob('*.json')):
 data=json.loads(file.read_text());rows=data if isinstance(data,list) else [data];schema={}
 for row in rows:
  if isinstance(row,dict):schema.update(dict(fields(row)))
 lines+=['## '+file.name,'','记录数：'+str(len(rows)),'','| 字段 | 类型 |','|---|---|']+[f'| `{k}` | {t} |' for k,t in schema.items()]+['']
 if isinstance(data,list) and data and isinstance(data[0],dict):
  keys=list(dict.fromkeys(k for row in data for k in row))
  with file.with_suffix('.csv').open('w',encoding='utf-8-sig',newline='') as f:
   w=csv.DictWriter(f,fieldnames=keys);w.writeheader()
   for row in data:w.writerow({k:json.dumps(v,ensure_ascii=False) if isinstance(v,(dict,list)) else v for k,v in row.items()})
(B/'DATA_DICTIONARY.md').write_text('\n'.join(lines)+'\n')
print('Completed provenance, stock lead-time buffers, land, skill, cost, water and dictionary')
