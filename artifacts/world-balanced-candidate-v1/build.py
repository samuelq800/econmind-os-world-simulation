"""Offline candidate authoring only. Does not seed Core, modify maps or grant rights."""
from pathlib import Path
import json, math, hashlib, re, csv, copy
from collections import Counter, defaultdict
import numpy as np
from scipy.optimize import linprog
from scipy.sparse import lil_matrix, vstack
from shapely.geometry import Point
import sys
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(Path(__file__).parent/'vendor'))
from atlas_display_geometry import parse_path
BASE=Path(__file__).parent; OUT=BASE/'data'; OUT.mkdir(exist_ok=True)
def load(rel):return json.loads((BASE/'inputs'/rel.replace('/','__')).read_text())
def save(name,obj): (OUT/(name+'.json')).write_text(json.dumps(obj,ensure_ascii=False,indent=2,allow_nan=False)+'\n')
def rounded(x):return round(float(x),6)
def share_integer(total,weights):
 a=np.array(weights)/sum(weights)*total; n=np.floor(a).astype(np.int64)
 for i in np.argsort(-(a-n),kind='stable')[:int(total-n.sum())]:n[i]+=1
 return list(map(int,n))
s=load('apps/world-web/src/map-lab/geographic-scenario.json');atlas=load('apps/world-web/src/map-lab/atlas-layers.json');part=load('apps/world-web/src/map-lab/land-partition.json');marine=load('apps/world-web/src/map-lab/maritime-zones.json')
scene=load('apps/world-web/src/assets/country-scenes/index.json');continents=load('apps/world-web/src/assets/continent-scenes/index.json')
C=[c['id'] for c in atlas['political']['countries']];names={c['id']:c['name'] for c in atlas['political']['countries']};political={c['id']:c for c in atlas['political']['countries']};shapes={c['id']:parse_path(c['path']) for c in part['territories']};coords={x['id']:x for x in atlas['nodes']+atlas['facilities']};km=36000/1774
regions=copy.deepcopy(s['regions']);changes=[]
# A humid tropical forest is not an uninhabitable zero-capacity region. A bounded
# land-use scenario allocates 12% of forest to potential settled agriculture.
for r in regions:
 lu=r['landUseKm2'];n=r['natural'];before=lu['croplandPotential']
 if n['temperatureC']>15 and n['annualRainMm']>=2200 and before/r['areaKm2']<.12:
  delta=min(lu['forest']*.12,max(0,.12*r['areaKm2']-before));lu['forest']-=delta;lu['croplandPotential']+=delta
  changes.append({'objectId':r['id'],'field':'landUseKm2','reason':'湿润热带农业不再被2200毫米硬阈值归零；12%森林转为候选农业用地，上限明确且面积守恒。','transferredKm2':delta,'from':'forest','to':'croplandPotential'})
 n['grainPotentialTonnesYear']=min(lu['croplandPotential']*100,n['allocatableWaterM3Day']*360/5000)*n['grainYieldTonnesHa']
weights=[]
for r in regions:
 n=r['natural'];h=r['humanGeography'];mount=r['landUseKm2']['mountain']/r['areaKm2']
 suitability=.2+.45*math.exp(-(n['temperatureC']-18)**2/450)+.25*min(n['annualRainMm']/1000,1.5)-.12*mount
 weights.append(r['areaKm2']**.72*suitability*(.7+.6*h['transportGravity']+.25*h['riverGravity']))
totalpop=sum(c['population'] for c in s['countries'])
for r,pop in zip(regions,share_integer(totalpop,weights)):
 old=r['initial'];oldpop=old['population'];urban=r['humanGeography']['scenarioUrbanShare'];work=round(pop*(.58+.09*urban));lf=round(work*(.58+.13*r['humanGeography']['transportGravity']));high=round(lf*(.035+.17*urban));mid=round(lf*(.19+.24*urban));households=math.ceil(pop/(3.7-.9*urban))
 old.update(population=pop,workingAge=work,labourForce=lf,skills={'low':lf-high-mid,'medium':mid,'high':high},households=households,housingUnits=math.ceil(households*(1.03+.04*(1-urban))),teachers=math.ceil(pop*.19/26),medicalWorkers=math.ceil(pop*.0035),schoolSeats=math.ceil(pop*.19*1.05),hospitalBeds=math.ceil(pop*.003))
 old['grainDemandTonnesDay']=pop*.24/360
 changes.append({'objectId':r['id'],'field':'population','before':oldpop,'after':pop,'reason':'连续人文地理权重重分配；世界总人口守恒'})
 r['populationBasis']='area^0.72 × continuous temperature/rain/mountain suitability × transport/river settlement access'
byreg={c:[r for r in regions if r['countryId']==c] for c in C}
pop={c:sum(r['initial']['population'] for r in byreg[c]) for c in C};lf={c:sum(r['initial']['labourForce'] for r in byreg[c]) for c in C};area={c:sum(r['areaKm2'] for r in byreg[c]) for c in C}
def mean(c,k):return sum(r['natural'][k]*r['areaKm2'] for r in byreg[c])/area[c]
# 12 catalog commodities; electricity is an energy flow, never a warehouse commodity.
G=['CRUDE_OIL','NATURAL_GAS','URANIUM','GRAIN','IRON_ORE','COPPER','LITHIUM','STEEL','REFINED_FUEL','MACHINERY','SEMICONDUCTORS','BATTERIES']
units=['barrel','MMBtu','tonne U','tonne','tonne','tonne','tonne LCE','tonne','barrel equivalent','equipment unit','standardised chip unit','MWh-equivalent']
prices=np.array([75,4,100000,250,110,8000,15000,700,95,25000,20,90000.])
# Authored balancing references, not market prices or handbook fixed coefficients.
finalpc=np.array([0,0,.000000001,.24/360,0,0,0,.00015,.001,.0000008,.001,.00000008])
inputs={'STEEL':{'IRON_ORE':1.6,'NATURAL_GAS':3},'REFINED_FUEL':{'CRUDE_OIL':1.08},'MACHINERY':{'STEEL':2,'COPPER':.08},'SEMICONDUCTORS':{'COPPER':.00005,'MACHINERY':.000001},'BATTERIES':{'LITHIUM':.6,'COPPER':.8,'MACHINERY':.001}}
# Per unit output requirements; machinery requirement above is consumed input,
# installed equipment capacity is separately booked, so the two are not counted twice.
energy=np.array([.012,.001,35,.02,.06,.8,1.2,.65,.008,2,.0001,.6]) # MWh/unit
workers=np.array([.015,.002,20,.5,.08,.5,.5,.12,.008,.2,.001,.3]) # workers/(unit/day)
water=np.array([.2,.01,20,5000/3.5,.1,2,3,2,.1,1,.0001,2])
projects=[1,2,3,None,4,5,6,14,15,16,17,18]
recipe=[]
for j,g in enumerate(G):
 recipe.append({'id':'SCENARIO-RECIPE-'+g,'commodityId':g,'outputUnit':units[j],'outputQuantity':1,'inputsPerUnit':inputs.get(g,{}),'electricityMWhPerUnit':energy[j],'waterM3PerUnit':water[j],'workersPerDailyOutputUnit':workers[j],'projectId':f'PROJECT-{projects[j]:02}' if projects[j] else None,'agricultureOwnerProposal':'INDUSTRY_WITH_SOCIAL_WATER_COORDINATION' if g=='GRAIN' else None,'authority':'AUTHORED_CANDIDATE_NOT_CORE_APPROVED'})
# Fixed reference-price IO margins. Optimize physical output and installed capacity,
# not macro GDP multipliers or altered mineral endowments.
A=np.eye(12)
for out,ins in inputs.items():
 for inp,q in ins.items():A[G.index(inp),G.index(out)]-=q
margin=prices@A/prices
mines=copy.deepcopy(s['deposits']);depby=defaultdict(list)
for d in mines:depby[(d['countryId'],d['commodityId'])].append(d)
rawscores=np.zeros((70,12));bounds=[];geocaps={}
for i,c in enumerate(C):
 for j,g in enumerate(G):
  ds=depby[(c,g)]; cap=sum(min(d['extractionCapacityPerDay'],d['developedRemaining']/600) for d in ds)
  if g=='GRAIN':cap=sum(r['natural']['grainPotentialTonnesYear']/360*.8 for r in byreg[c])
  geocaps[c,g]=cap
  if j<7:
   bounds.append((0,cap*prices[j]));rawscores[i,j]=cap/max(1,pop[c])*prices[j]
  else:
   urban=sum(r['humanGeography']['scenarioUrbanShare']*r['initial']['population'] for r in byreg[c])/pop[c];skill=sum(r['initial']['skills']['high'] for r in byreg[c])/lf[c]
   access=sum(r['settlementAccess']*r['areaKm2'] for r in byreg[c])/area[c]
   mineral=lambda g: math.log1p(sum(d['extractionCapacityPerDay'] for d in depby[(c,g)])*prices[G.index(g)]/max(1,pop[c]))
   score={'STEEL':.3+mineral('IRON_ORE')+.3*mineral('NATURAL_GAS'),'REFINED_FUEL':.3+mineral('CRUDE_OIL')+.4*access,'MACHINERY':.3+urban+skill*4+.3*access,'SEMICONDUCTORS':.3+skill*8+urban+.15*access,'BATTERIES':.3+mineral('LITHIUM')+mineral('COPPER')+.4*urban}[g]
   rawscores[i,j]=score;bounds.append((0,pop[c]*float(finalpc@prices)*12))
# Limit supplier concentration without changing geological volume. Soft upper
# bound is raised only where physical capacities make a 20% cap infeasible.
world_required=np.linalg.solve(A,totalpop*finalpc)
supply_caps=[]
for j,g in enumerate(G):
 caps=np.array([bounds[i*12+j][1]/prices[j] for i in range(70)])
 share=.20
 while sum(np.minimum(caps,world_required[j]*share)) < world_required[j]*(1-1e-9):
  share+=.01
  if share>1.001:raise ValueError('Insufficient physical supply '+g)
 supply_caps.append({'commodityId':g,'maxCountryOutputShare':round(share,2),'basis':'20% diversity cap; feasibility relaxation only when geology requires it'})
 for i in range(70):bounds[i*12+j]=(0,min(bounds[i*12+j][1],world_required[j]*share*prices[j]))
# National comparison uses the same physical consumption basket per person. A
# country cannot rely on a baseline daily trade deficit above 8% of that basket.
# Geography decides profitable mix; population scale stays different.
rank=np.zeros_like(rawscores)
for j in range(12):
 vals=rawscores[:,j]; rank[:,j]=np.searchsorted(np.sort(vals),vals,side='right')/70
# Each country starts with two meaningful production routes. These are physical
# portfolio floors, not GDP bonuses. Floors use at most 55% of global sector use.
route_choices={};floor_totals=np.zeros(12);pair_counts=Counter()
for i in sorted(range(70),key=lambda i:-pop[C[i]]):
 c=C[i];settled=sum(r['humanGeography']['scenarioUrbanShare']*r['initial']['population'] for r in byreg[c])/pop[c];floor=pop[c]*float(finalpc@prices)*(.06+.03*settled)
 eligible=[j for j in range(12) if bounds[i*12+j][1]>=floor and floor_totals[j]+floor<=world_required[j]*prices[j]*.55]
 pairs=[(j,k) for j in eligible for k in eligible if j<k]
 if not pairs:raise ValueError('No diversified portfolio '+c)
 j,k=max(pairs,key=lambda pair:rank[i,pair[0]]+rank[i,pair[1]]-.13*pair_counts[pair])
 pair_counts[j,k]+=1;route_choices[c]=[G[j],G[k]]
 for q in [j,k]:bounds[i*12+q]=(floor,bounds[i*12+q][1]);floor_totals[q]+=floor
objective=(-.35-.65*rank).ravel()
# Tie-break based on actual environmental features, not arbitrary nation ID buffs.
objective += -.01*np.log1p(rawscores).ravel()/max(1,np.log1p(rawscores).max())
eq=lil_matrix((12,840));beq=np.zeros(12)
for j in range(12):
 for i in range(70):
  for k in range(12):eq[j,i*12+k]=A[j,k]*prices[j]/prices[k]
 beq[j]=sum(pop.values())*finalpc[j]*prices[j]
ub=lil_matrix((70*4,840));bub=np.zeros(70*4)
for i,c in enumerate(C):
 basket=pop[c]*float(finalpc@prices)
 for j in range(12):
  ub[i*4,i*12+j]=margin[j];ub[i*4+1,i*12+j]=-margin[j]
  ub[i*4+2,i*12+j]=workers[j]/prices[j]
  ub[i*4+3,i*12+j]=water[j]/prices[j]
 bub[i*4]=basket*1.08;bub[i*4+1]=-basket*.92;bub[i*4+2]=lf[c]*.55
 bub[i*4+3]=sum(r['natural']['allocatableWaterM3Day'] for r in byreg[c])-pop[c]*65/360
# A balanced reference-price sheet must not collapse when a single commodity
# moves 20%. Physical portfolios also satisfy +/-30% consumption-basket trade
# exposure under each of 24 one-at-a-time price shocks.
shock=lil_matrix((70*12*2*2,840));shock_b=[];row=0
for i,c in enumerate(C):
 for j in range(12):
  for multiplier in [.8,1.2]:
   px=prices.copy();px[j]*=multiplier;shock_margin=px@A/prices;basket=pop[c]*float(finalpc@px)
   for sign,limit in [(1,1.30),(-1,-.70)]:
    for k in range(12):shock[row,i*12+k]=sign*shock_margin[k]
    shock_b.append(basket*limit);row+=1
ub=vstack([ub.tocsr(),shock.tocsr()]);bub=np.r_[bub,shock_b]
res=linprog(objective,A_ub=ub.tocsr(),b_ub=bub,A_eq=eq.tocsr(),b_eq=beq,bounds=bounds,method='highs')
if not res.success:raise RuntimeError(res.message)
production=res.x.reshape(70,12)/prices;production[np.abs(production)<1e-9]=0
usage=np.zeros_like(production)
for i,c in enumerate(C):
 usage[i]=pop[c]*finalpc
 for out,ins in inputs.items():
  for inp,q in ins.items():usage[i,G.index(inp)]+=production[i,G.index(out)]*q
net=production-usage
# Enrich original candidates without erasing them or treating illustrations as assets.
facilities=[];entities=[];country_records=[];nodes=[];licences=[];stocks=[];finance=[];power=[];services=[];employment=[];links=[]
regions_by_id={r['id']:r for r in regions}
def region_at(c,pt):
 matches=[r for r in byreg[c] if parse_path(r['path']).covers(Point(pt))]
 return (matches[0] if matches else min(byreg[c],key=lambda r:math.dist(r['label'],pt)))['id']
def point_in(c):
 r=max(byreg[c],key=lambda r:r['initial']['population']);p=parse_path(r['path']).representative_point();return [rounded(p.x),rounded(p.y)]
def add_fac(c,fid,name,pid,pt,capacity,unit,role,**extra):
 row={'id':fid,'countryId':c,'regionId':region_at(c,pt),'name':name,'projectId':pid,'point':pt,'capacity':rounded(capacity),'capacityUnit':unit,'operatorId':'OP-'+c[-2:],'ownerId':'GOV-'+c[-2:],'scenarioRole':role,'runtimeOperational':False,'openingAvailabilityProposal':role=='OPENING_PORTFOLIO','status':'UNAPPROVED_SCENARIO_ASSET','renderingStatus':'EXISTING_MAP_POINT' if fid in coords else 'NEW_DATA_POINT_NEEDS_MAP_MARKER',**extra}
 facilities.append(row);nodes.append({'id':fid,'countryId':c,'regionId':row['regionId'],'point':pt});return row
for old in s['facilities']:
 loc=coords[old['id']];row=add_fac(old['countryId'],old['id'],old['name'],old['projectId'],loc['point'],old['estimatedCapacity'],old['capacityUnit'],'DEVELOPMENT_OPTION',resourceId=loc.get('resourceId'),legacyRecord=old)
# Minerals remain exactly conserved; assign real coordinates and region links.
for d in mines:
 pt=next(r['point'] for r in atlas['resources'] if r['id']==d['id']);d.update(point=pt,regionId=region_at(d['countryId'],pt),runtimeExtractionPerDay=0)
 d['developedReserveInterpretation']='CONDITIONAL_ON_OPENING_FACILITY_AND_LICENSE_ADOPTION'
for i,c in enumerate(C):
 p=pop[c];num=c[-2:];pt=point_in(c);reg=max(byreg[c],key=lambda r:r['initial']['population']);urban=sum(r['humanGeography']['scenarioUrbanShare']*r['initial']['population'] for r in byreg[c])/p
 coast=next(v['coastal'] for v in marine['countries'] if v['id']==c);economic='SCENARIO-ECONOMY-'+num
 for role in ['GOV','OP','HOUSEHOLDS','BANK','CENTRAL-BANK']:
  entities.append({'id':role+'-'+num,'countryId':c,'economyId':economic,'role':role,'realTeamBinding':None,'bindingMode':'UNASSIGNED_TEAM_WITH_CANDIDATE_NPC_ADMINISTRATION'})
 # Sector production is split into known deposits; new industry is a mapped regional aggregate.
 for j,g in enumerate(G):
  q=production[i,j]
  if q<1e-7:continue
  ds=depby[(c,g)]
  if ds:
   caps=[min(d['extractionCapacityPerDay'],d['developedRemaining']/600) for d in ds]
   for d,dc in zip(ds,caps):
    dq=q*dc/sum(caps);d['openingExtractionPlanPerDay']=rounded(dq)
    f=add_fac(c,'OPEN-'+d['id'],g+'开采组',f'PROJECT-{projects[j]:02}',d['point'],dq*1.1,units[j]+'/sim-day','OPENING_PORTFOLIO',depositId=d['id'],commodityId=g,plannedOutputPerDay=rounded(dq),recipeId='SCENARIO-RECIPE-'+g)
  else:
   f=add_fac(c,'OPEN-'+num+'-'+g,g+'区域生产群',f'PROJECT-{projects[j]:02}' if projects[j] else None,pt,q*1.15,units[j]+'/sim-day','OPENING_PORTFOLIO',commodityId=g,plannedOutputPerDay=rounded(q),recipeId='SCENARIO-RECIPE-'+g,aggregateFacility=True)
 # Cropland and employment close against the new country-level production plan.
 rcaps=[r['natural']['grainPotentialTonnesYear'] for r in byreg[c]]
 for r,cap in zip(byreg[c],rcaps):
  grain=production[i,3]*cap/max(1,sum(rcaps));ini=r['initial'];ini['grainTonnesDay']=rounded(grain);ini['croplandHa']=rounded(grain*360/r['natural']['grainYieldTonnesHa']);ini['foodStockTonnes']=0 # inventory table alone owns stock
  services.append({'id':'SERVICE-'+r['id'],'countryId':c,'regionId':r['id'],'population':ini['population'],'households':ini['households'],'housingUnits':ini['housingUnits'],'schoolSeats':ini['schoolSeats'],'teachers':ini['teachers'],'medicalWorkers':ini['medicalWorkers'],'hospitalBeds':ini['hospitalBeds'],'dailyMedicalVisits':math.ceil(ini['population']*.012),'waterDomesticM3Day':rounded(ini['population']*65/360),'sourceStatus':'OPENING_SOCIAL_ASSET_PROPOSAL'})
  for kind,pid,cap,u in [('住房',36,ini['housingUnits'],'dwelling-unit'),('基础教育',31,ini['schoolSeats'],'student-seat'),('医院',35,ini['hospitalBeds'],'bed')]:
   add_fac(c,'SERVICE-'+r['id']+'-'+str(pid),kind+'区域服务群',f'PROJECT-{pid:02}',r['label'],cap,u,'OPENING_PORTFOLIO',aggregateFacility=True)
 # Physical power demand; no electricity freight or globally tradable grid supply.
 industrial_mwh=float(production[i]@energy);demand_mw=p*.00045+industrial_mwh/24
 solarcf=mean(c,'solarKwhM2Day')/24;windcf=min(.5,(mean(c,'windMps')/12)**3);solarshare=min(.8,max(.25,solarcf/(solarcf+windcf)))
 gen_mwh=demand_mw*24/.94*1.15
 solar_mw=gen_mwh*solarshare/(24*solarcf);wind_mw=gen_mwh*(1-solarshare)/(24*windcf)
 for kind,pid,cap,u in [('太阳能',10,solar_mw,'MW'),('风能',11,wind_mw,'MW'),('国家电网',23,demand_mw*1.25,'MW'),('储能',13,demand_mw*48/.9,'MWh')]:
  add_fac(c,'POWER-'+num+'-'+str(pid),kind+'区域设施群',f'PROJECT-{pid:02}',pt,cap,u,'OPENING_PORTFOLIO',aggregateFacility=True)
 power.append({'id':'GRID-'+num,'countryId':c,'solarMW':rounded(solar_mw),'windMW':rounded(wind_mw),'solarCapacityFactor':rounded(solarcf),'windCapacityFactor':rounded(windcf),'averageDemandMW':rounded(demand_mw),'averageDeliveredMW':rounded(gen_mwh*.94/24),'lossFraction':.06,'storageMWh':rounded(demand_mw*48/.9),'storageDischargeMW':rounded(demand_mw),'storageEfficiency':.9,'openingStateOfChargeFraction':1,'crossBorderConnections':[],'hourlyDispatchValidated':False,'status':'CANDIDATE_NOT_ENERGIZED'})
 # Concrete ports reuse mapped coastal points. Inland sites get inland gateways.
 original_ports=[x for x in atlas['nodes'] if x['countryId']==c and x['kind']=='port']
 if coast:
  if original_ports:gpt=original_ports[0]['point']
  else:
   ocean=parse_path(marine['oceanPath']);bnd=shapes[c].boundary.intersection(ocean.boundary);target=bnd if not bnd.is_empty else shapes[c].boundary;pnt=target.interpolate(.5,normalized=True);gpt=[rounded(pnt.x),rounded(pnt.y)]
 else:gpt=pt
 add_fac(c,'GATE-'+num,'国家海港集群' if coast else '内陆货运口岸','PROJECT-21' if coast else 'PROJECT-25',gpt,1,'tonne/sim-day','OPENING_PORTFOLIO',aggregateFacility=True,coastal=coast)
 # At least 45 days stock; remote and import-dependent countries have larger explicit buffers.
 importshare=float(np.maximum(-net[i],0)@prices)/max(1,float(usage[i]@prices));access=sum(r['humanGeography']['transportGravity']*r['initial']['population'] for r in byreg[c])/p
 days=round(45+20*(1-access)+15*min(1,importshare),2)
 for j,g in enumerate(G):
  stocks.append({'id':'STOCK-'+num+'-'+g,'countryId':c,'ownerId':'OP-'+num,'warehouseId':'WAREHOUSE-'+num,'commodityId':g,'unit':units[j],'available':rounded(usage[i,j]*days),'reserved':0,'inTransit':0,'bufferDays':days,'origin':'AUTHORED_OPENING_STOCK_ENDOWMENT_NOT_HISTORICAL_EXTRACTION'})
 add_fac(c,'WAREHOUSE-'+num,'国家战略与生产库存库群','PROJECT-26',pt,1,'tonne','OPENING_PORTFOLIO',aggregateFacility=True)
 sectorworkers=np.ceil(production[i]*workers).astype(int);essential=sum(x['teachers']+x['medicalWorkers'] for x in services if x['countryId']==c);gridworkers=math.ceil((solar_mw+wind_mw)*.12);logworkers=math.ceil(p*.003)
 employed=round(lf[c]*(.9-.04*importshare));remainder=employed-int(sectorworkers.sum())-essential-gridworkers-logworkers
 if remainder<0:raise ValueError('Labour shortage '+c)
 employment.append({'countryId':c,'labourForce':lf[c],'employed':employed,'unemployed':lf[c]-employed,'sectors':dict(zip(G,map(int,sectorworkers))),'educationAndHealth':essential,'power':gridworkers,'logistics':logworkers,'otherDomesticServices':remainder,'interpretation':'Candidate allocated posts; not runtime jobs'})
 # Reference balance target concerns viable trade, not equal GDP or guaranteed victory.
 baseline_basket=p*float(finalpc@prices);trade=float(net[i]@prices);income=employed*(18+12*urban);annualcash=income*60
 # Distinct cash instruments: treasury base money; deposits are household/business bank liabilities.
 deposits=income*30;equity=deposits*.1
 finance.append({'countryId':c,'currency':'GCU_SCENARIO_ACCOUNTING_UNIT','dailyLabourIncomeReference':rounded(income),'treasuryCentralBankBalance':rounded(annualcash),'householdBankDeposits':rounded(deposits*.75),'businessBankDeposits':rounded(deposits*.25),'bankReserveAssets':rounded(deposits+equity),'bankLoanAssets':0,'bankEquity':rounded(equity),'bankDepositLiabilities':rounded(deposits),'publicDebt':0,'existingContracts':[],'historicalClaims':[],'dailyReferenceTradeNet':rounded(trade),'openingMoneyOrigin':'EXPLICIT_GENESIS_ALLOCATION; no invented historical debt','taxRateProposal':.18,'taxBase':'daily labour-income reference','priceAuthority':'BALANCE_REFERENCE_ONLY'})
 ranked=sorted(range(12),key=lambda j:production[i,j]*prices[j],reverse=True);exports=sorted(range(12),key=lambda j:net[i,j]*prices[j],reverse=True);imports=sorted(range(12),key=lambda j:net[i,j]*prices[j])
 country_records.append({'id':c,'name':names[c],'number':num,'economyIdProposal':economic,'governmentId':'GOV-'+num,'operatorId':'OP-'+num,'teamAssignment':None,'administrationProposal':'NPC_UNTIL_TEAM_ASSIGNED','areaKm2':area[c],'population':p,'previousPopulation':next(x['population'] for x in s['countries'] if x['countryId']==c),'labourForce':lf[c],'urbanShare':rounded(urban),'coastal':coast,'capitalPointProposal':pt,'regionIds':[r['id'] for r in byreg[c]],'neighbours':political[c]['neighbours'],'climateMix':political[c]['climateMix'],'guaranteedProductionRoutes':route_choices[c],'leadingSectors':[G[j] for j in ranked[:3] if production[i,j]>0],'principalExports':[G[j] for j in exports[:3] if net[i,j]>1e-6],'principalImports':[G[j] for j in imports[:3] if net[i,j]<-1e-6],'dailyReferenceConsumptionValueGcu':rounded(baseline_basket),'dailyReferenceTradeNetGcu':rounded(trade),'tradeNetToConsumptionRatio':rounded(trade/baseline_basket),'stockBufferDays':days,'sourceOfDifference':'physical geography, resource presence, climate, skills, settlement access and explicit installed portfolio'})
 # Licence proposals are structured terms, never real signed grants.
 for g in [G[j] for j in ranked if production[i,j]>1e-7]:
  licences.append({'id':'LIC-'+num+'-'+g,'countryId':c,'grantorId':'GOV-'+num,'holderId':'OP-'+num,'activity':g,'validFromSimDay':0,'validUntilSimDay':600,'status':'PROPOSED_NOT_GRANTED','feeGcuProposal':0,'conditions':['season adoption','resource and environmental limits','operator registration']})
# Installed machinery and production operating requirements are completely explicit.
for f in facilities:
 c=f['countryId'];output=f.get('plannedOutputPerDay',0);g=f.get('commodityId');j=G.index(g) if g in G else None
 w=math.ceil(output*workers[j]) if j is not None else math.ceil(pop[c]*.0001) if f['scenarioRole']=='OPENING_PORTFOLIO' else f['legacyRecord']['requiredWorkers']
 f.update(requiredWorkers=w,requiredPowerMW=rounded(output*energy[j]/24) if j is not None else 0,requiredWaterM3Day=rounded(output*water[j]) if j is not None else 0,installedMachineryUnits=max(1,math.ceil(w/20)),constructionSimDaysProposal=90 if j is None else 180,maintenanceGcuDayProposal=rounded(w*4),recipeId=f.get('recipeId'),licenseIdProposal='LIC-'+c[-2:]+'-'+g if g else None)
# Goods flow: minimum-distance transportation for each commodity; units are
# converted to freight mass explicitly, and electricity never enters this table.
unitmass=np.array([.136,.0192,1,1,1,1,1,1,.125,5,.000001,6.])
gateway={c:next(f for f in facilities if f['id']=='GATE-'+c[-2:]) for c in C}
positions=np.array([gateway[c]['point'] for c in C]);dist=np.linalg.norm(positions[:,None]-positions[None,:],axis=2)*km
flows=[];totalship=np.zeros(70);totalwarehouse=np.zeros(70);transit=[]
for j,g in enumerate(G):
 sellers=np.flatnonzero(net[:,j]>1e-6);buyers=np.flatnonzero(net[:,j]<-1e-6)
 if not len(sellers) or not len(buyers):continue
 supply=net[sellers,j];demand=-net[buyers,j];m=len(sellers);n=len(buyers)
 # Tiny LP residual is allocated to largest buyer, solely to close solver tolerance.
 residual=float(supply.sum()-demand.sum());demand[np.argmax(demand)]+=residual
 mat=lil_matrix((m+n,m*n))
 for a in range(m):mat[a,a*n:(a+1)*n]=1
 for b in range(n):mat[m+b,b::n]=1
 opt=linprog(dist[np.ix_(sellers,buyers)].ravel(),A_eq=mat.tocsr(),b_eq=np.r_[supply,demand],bounds=(0,None),method='highs')
 if not opt.success:raise ValueError(opt.message)
 for (a,b),amount in np.ndenumerate(opt.x.reshape(m,n)):
  if amount<=1e-6:continue
  si=int(sellers[a]);bi=int(buyers[b]);ca=C[si];cb=C[bi];distance=dist[si,bi]*1.35 # explicit survey detour proxy, not validated road geometry
  inland=not gateway[ca]['coastal'] or not gateway[cb]['coastal'];mode='MULTIMODAL_WITH_TRANSIT' if inland else 'SEA_PORT_TO_PORT'
  flowid=f'FLOW-{len(flows)+1:04}';mass=amount*unitmass[j];travel=distance/(24*25)+2
  flows.append({'id':flowid,'commodityId':g,'unit':units[j],'sellerCountryId':ca,'buyerCountryId':cb,'sellerEntityId':'OP-'+ca[-2:],'buyerEntityId':'OP-'+cb[-2:],'fromNodeId':gateway[ca]['id'],'toNodeId':gateway[cb]['id'],'quantityPerDay':rounded(amount),'freightTonnesDay':rounded(mass),'referenceUnitPriceGcu':prices[j],'distanceKmEstimate':rounded(distance),'travelSimDaysEstimate':rounded(travel),'mode':mode,'transportCostGcuDayProposal':rounded(mass*distance*.015),'status':'UNSIGNED_CAPACITY_AND_TRADE_PLAN','physicalRouteStatus':'NOT_SURVEYED','routeGeometry':None,'requiresTransit':inland})
  totalship[si]+=mass;totalship[bi]+=mass
  if inland:transit.append({'id':'TRANSIT-'+flowid,'flowId':flowid,'countryIds':[ca,cb],'intermediateStatesStatus':'NEEDS_ROUTE_SURVEY','consentStatus':'PROPOSED_NOT_GRANTED'})
for i,c in enumerate(C):
 gateway[c]['capacity']=rounded(totalship[i]*1.3+100);warehouse=next(f for f in facilities if f['id']=='WAREHOUSE-'+c[-2:]);warehouse['capacity']=rounded(sum(x['available']*unitmass[G.index(x['commodityId'])] for x in stocks if x['countryId']==c)*1.15+100)
 for f in [f for f in facilities if f['countryId']==c and f['id']!=gateway[c]['id']]:
  links.append({'id':'DOM-'+f['id'],'fromId':f['id'],'toId':gateway[c]['id'],'countryId':c,'distanceKmEstimate':rounded(math.dist(f['point'],gateway[c]['point'])*km*1.35),'mode':'DOMESTIC_ACCESS_SURVEY','status':'NOT_SURVEYED_NOT_OPERATIONAL','capacityTonnesDayProposal':gateway[c]['capacity']})
# Explicit technology access proposals only use existing catalog technology IDs.
techmap={'STEEL':'RESOURCE_EFFICIENT_REFINING','REFINED_FUEL':'RESOURCE_EFFICIENT_REFINING','MACHINERY':'MFG_PRECISION','SEMICONDUCTORS':'SEMI_BASIC','BATTERIES':'RESOURCE_BATTERY_CHEM'}
technology=[]
for c in country_records:
 for g,t in techmap.items():
  if production[C.index(c['id']),G.index(g)]>1e-7:technology.append({'countryId':c['id'],'technologyId':t,'holderId':c['operatorId'],'levelProposal':1,'status':'OPENING_LICENSE_PROPOSAL_NOT_GRANTED','royaltyGcuPerDayProposal':0,'scope':g})
# Every field previously mistaken for an authority decision remains a visible adapter task.
coverage=[{'domain':d,'candidateData':'COMPLETE','runtimeActivation':'NOT_AUTHORIZED','remainingAdapterWork':work} for d,work in [
 ('国家/团队','团队成员由赛事实际分配，候选NPC管理记录已完整'),('资源/人口/气候','候选数值完整；采用时锁定版本'),('生产配方/农业','完整候选系数已提供，需Core责任方审定并映射'),('道路/港口/航运','端点、货量和容量完整；实际地形路由、第三国过境及航道测绘未完成'),('电网','平均供需与储能完整；逐小时调度未运行'),('权利/合同','条款候选完整；未替用户或国家签约授权'),('金融/库存','开局账户与库存完整；需通过官方初始化命令入库'),('世界运行','离线质量与稳态校验不等于Core 600日完整运行')]]
provenance={'version':'WORLD_BALANCED_CANDIDATE_V1','status':'IMPLEMENTED_UNVERIFIED_CANDIDATE','activationAllowed':False,'sourceSnapshots':json.loads((BASE/'inputs/manifest.json').read_text()),'sourcePriority':['V8 land partition for geometry','14-climate/320-resource atlas for location and classification','geographic scenario for immutable minerals and human/environment inputs','country/continent illustrations for display identity only, never quantities'], 'simDaysYear':360,'seasonSimDays':600,'populationTotalPreserved':totalpop,'balanceDefinition':'At reference prices, each country physical net trade is within ±8% of the same per-person final demand basket. Basic services and buffers have explicit assets. This does not promise equal GDP, geography, skill, or win probability.','pricePolicy':'Authored calibration references; sensitivity and runtime pricing are separate.','newNumbersAuthority':'AUTHORED_GEOGRAPHY_CONSTRAINED_CANDIDATE_NOT_HANDBOOK_FIXED_RULES','solver':'scipy.optimize.linprog highs; country-neutral IO constraints and geographic feasible capacities','worldIdentity':'CANDIDATE_ONLY_NO_PRODUCTION_WORLD_ID','noProductionMutation':True}
save('supplier-concentration-policy',supply_caps);save('manifest',provenance);save('countries',country_records);save('regions',regions);save('deposits',mines);save('facilities',facilities);save('nodes',nodes);save('domestic-access',links);save('trade-plans',flows);save('transit-proposals',transit);save('power',power);save('population-services',services);save('employment',employment);save('entities',entities);save('finance',finance);save('stocks',stocks);save('recipes',recipe);save('technology-proposals',technology);save('license-proposals',licences);save('coverage',coverage);save('changes',changes);save('commodity-catalog',[{'id':g,'unit':units[j],'referencePriceGcu':prices[j],'finalDemandPerPersonDay':finalpc[j],'freightTonnesPerUnit':unitmass[j]} for j,g in enumerate(G)]);save('production-plans',[{'countryId':c,'commodityId':g,'outputPerDay':rounded(production[i,j]),'usePerDay':rounded(usage[i,j]),'netPerDay':rounded(net[i,j]),'unit':units[j]} for i,c in enumerate(C) for j,g in enumerate(G)])
save('geography',{'partition':part,'climates':atlas['climates'],'physical':atlas['physical'],'currents':atlas['currents'],'maritime':marine,'basins':s['basins'],'backgroundResources':[r for r in atlas['resources'] if r['classification']=='background']});save('illustration-links',{'countryScenes':scene,'continentScenes':continents,'interpretation':'Scene anchors are presentation coordinates; geographic positions come from partition and atlas. New data assets need markers, not inferred invented buildings.'})
# Flat imports retain nested values as JSON strings and never silently discard fields.
for file in sorted(OUT.glob('*.json')):
 data=json.loads(file.read_text())
 if isinstance(data,list) and data and isinstance(data[0],dict):
  keys=list(dict.fromkeys(k for row in data for k in row))
  with file.with_suffix('.csv').open('w',encoding='utf-8-sig',newline='') as f:
   writer=csv.DictWriter(f,fieldnames=keys);writer.writeheader()
   for row in data:writer.writerow({k:json.dumps(v,ensure_ascii=False) if isinstance(v,(dict,list)) else v for k,v in row.items()})
print(json.dumps({'countries':len(C),'population':totalpop,'populationRange':[min(pop.values()),max(pop.values())],'facilities':len(facilities),'tradePlans':len(flows),'solverSuccess':res.success,'leadingSectors':dict(Counter(c['leadingSectors'][0] for c in country_records))},ensure_ascii=False))
