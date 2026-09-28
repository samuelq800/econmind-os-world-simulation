"""Read-only candidate checks and bounded offline inventory rehearsals, not Core acceptance."""
from pathlib import Path
import json, math, hashlib, sys
from collections import Counter
import numpy as np
B=Path(__file__).parent;D=B/'data';ROOT=B.parents[1];sys.path.insert(0,str(B/'vendor'))
from atlas_display_geometry import parse_path
from shapely.geometry import Point

def get(n):return json.loads((D/(n+'.json')).read_text())
C=get('countries');R=get('regions');F=get('facilities');M=get('deposits');P=get('production-plans');T=get('trade-plans');S=get('stocks');G=get('commodity-catalog');E=get('employment');FIN=get('finance');PW=get('power');REC=get('recipes');ids=[c['id'] for c in C];goods=[g['id'] for g in G];checks=[]
def test(name,fn):
 try:fn();checks.append({'check':name,'status':'PASS'})
 except Exception as e:checks.append({'check':name,'status':'FAIL','detail':str(e)})
def require(b,msg):
 if not b:raise AssertionError(msg)
def finite(v):
 if isinstance(v,dict):
  for x in v.values():finite(x)
 elif isinstance(v,list):
  for x in v:finite(x)
 elif isinstance(v,(int,float)):require(math.isfinite(v),'nonfinite')
def quantities():
 for file in D.glob('*.json'):finite(json.loads(file.read_text()))
 require(len(C)==70 and len(R)==122,'country/region count')
 require(sum(c['population'] for c in C)==get('manifest')['populationTotalPreserved'],'world population changed')
 for c in C:
  rr=[r for r in R if r['countryId']==c['id']];require(sum(r['initial']['population'] for r in rr)==c['population'],'regional population mismatch '+c['id']);require(len(c['guaranteedProductionRoutes'])==2,'missing route')
 for r in R:
  x=r['initial'];require(x['population']>=x['workingAge']>=x['labourForce']>=0,'labour population hierarchy')
  require(sum(x['skills'].values())==x['labourForce'],'skill conservation')
  require(abs(sum(r['landUseKm2'].values())-r['areaKm2'])<.02,'land conservation')
  require(x['croplandHa']/100<=r['landUseKm2']['croplandPotential']+.01,'farmland overflow')
  require(x['housingUnits']>=x['households'],'housing gap');require(x['schoolSeats']>=x['population']*.19,'school gap')
 require(min(c['population'] for c in C)>1000000,'rain threshold population regression')
test('Population, land, labour, housing and education conservation',quantities)
def refs():
 for table in [C,R,F,M,get('nodes'),get('entities')]:require(len({x['id'] for x in table})==len(table),'duplicate IDs')
 regids={r['id'] for r in R};fids={f['id'] for f in F};entityids={e['id'] for e in get('entities')};depid={d['id'] for d in M}
 shapes={c['id']:parse_path(c['path']) for c in get('geography')['partition']['territories']}
 for f in F:
  require(f['countryId'] in ids and f['regionId'] in regids,'orphan facility')
  require(f['ownerId'] in entityids and f['operatorId'] in entityids,'orphan owner')
  require(shapes[f['countryId']].buffer(.002).covers(Point(f['point'])),'off-country point '+f['id'])
  if f.get('depositId'):require(f['depositId'] in depid,'orphan deposit')
 for t in T:require(t['fromNodeId'] in fids and t['toNodeId'] in fids and t['commodityId'] in goods,'orphan trade')
 for st in S:require(st['warehouseId'] in fids and st['ownerId'] in entityids,'orphan inventory')
 for e in get('domestic-access'):require(e['fromId'] in fids and e['toId'] in fids,'orphan local link')
test('Unique IDs, references and country-point containment',refs)
def minerals():
 old=json.loads((B/'inputs/apps__world-web__src__map-lab__geographic-scenario.json').read_text())['deposits'];old={d['id']:d for d in old}
 for d in M:
  a=old[d['id']];require(d['initialGeological']==a['initialGeological'],'geology changed')
  require(abs(d['remainingGeological']+d['cumulativeExtracted']-d['initialGeological'])<.01,'ore conservation')
  require(d['remainingGeological']>=d['discoveredRemaining']>=d['recoverableRemaining']>=d['developedRemaining']>=0,'reserve layers')
  require(abs(d['historicalConsumed']+d['openingStockRawEquivalentAllocated']-d['cumulativeExtracted'])<.01,'opening material double count')
  require(d.get('openingExtractionPlanPerDay',0)*600<=d['developedRemaining']+.01,'600day reserve exhaustion')
 for r in get('opening-material-reconciliation'):require(r['historicalConsumed']>=0,'negative historical use')
test('Geology unchanged, reserve conservation and opening stock provenance',minerals)
def people_power_water_finance():
 for c in C:
  cid=c['id'];ff=[f for f in F if f['countryId']==cid and f['scenarioRole']=='OPENING_PORTFOLIO'];rr=[r for r in R if r['countryId']==cid];e=next(e for e in E if e['countryId']==cid)
  require(sum(f['requiredWorkers'] for f in ff)+e['otherDomesticServices']==e['employed'],'job accounting '+cid)
  require(e['employed']+e['unemployed']==e['labourForce'],'unemployment accounting')
  for k in ['low','medium','high']:require(sum(f['labourBySkill'][k] for f in ff)<=sum(r['initial']['skills'][k] for r in rr),'skill shortfall')
 for w in get('water-allocations'):require(w['remainingM3Day']>=-.1,'water deficit '+w['regionId'])
 for p in PW:require(p['averageDeliveredMW']>=p['averageDemandMW']*1.1499,'power adequacy');require(p['storageMWh']*.9>=p['averageDemandMW']*47.9999,'storage adequacy')
 for f in FIN:
  require(abs(f['bankReserveAssets']+f['bankLoanAssets']-f['bankDepositLiabilities']-f['bankEquity'])<.05,'bank balance')
  require(abs(f['householdBankDeposits']+f['businessBankDeposits']-f['bankDepositLiabilities'])<.05,'deposit holders')
  require(f['treasuryCentralBankBalance']>=f['dailyNetCashDrainGcu']*600-.1,'liquid cash runway')
test('Staffing, skill sufficiency, water, average power and financial coverage',people_power_water_finance)
prod=np.array([[next(p['outputPerDay'] for p in P if p['countryId']==c and p['commodityId']==g) for g in goods] for c in ids]);use=np.array([[next(p['usePerDay'] for p in P if p['countryId']==c and p['commodityId']==g) for g in goods] for c in ids]);initial=np.array([[next(s['available'] for s in S if s['countryId']==c and s['commodityId']==g) for g in goods] for c in ids]);export=np.zeros_like(prod);inflow=np.zeros_like(prod)
for f in T:export[ids.index(f['sellerCountryId']),goods.index(f['commodityId'])]+=f['quantityPerDay'];inflow[ids.index(f['buyerCountryId']),goods.index(f['commodityId'])]+=f['quantityPerDay']
def physical_balance():
 require(np.max(np.abs(prod-use-export+inflow))<.02,'commodity mass imbalance')
 A=np.eye(12)
 for r in REC:
  for inp,q in r['inputsPerUnit'].items():A[goods.index(inp),goods.index(r['commodityId'])]-=q
 demand=np.array([g['finalDemandPerPersonDay'] for g in G])
 # Independently reconstruct use from recipes and final physical consumption.
 expected=np.array([c['population']*demand+(np.eye(12)-A)@prod[i] for i,c in enumerate(C)])
 require(np.max(np.abs(expected-use))<.02,'recipe use inconsistent')
 limits={p['commodityId']:p['maxCountryOutputShare'] for p in get('supplier-concentration-policy')}
 for j,g in enumerate(goods):require(prod[:,j].max()/prod[:,j].sum()<=limits[g]+1e-7,'supplier concentration '+g)
 for c in C:require(abs(c['tradeNetToConsumptionRatio'])<=.080001,'relative trade imbalance')
 for i,c in enumerate(C):
  for g in c['guaranteedProductionRoutes']:require(prod[i,goods.index(g)]*prices[goods.index(g)]>=c['dailyReferenceConsumptionValueGcu']*.059999,'missing viable production route')
prices=np.array([g['referencePriceGcu'] for g in G]);test('Input-output, bilateral trade conservation and two-route balance',physical_balance)
# Daily offline stock model. Production is conditional on prior inputs and available
# workforce/power. Goods departed during pauses are held by sellers; arrivals delayed.
def rehearse(kind):
 stock=initial.copy();queue={};min_stock=initial.copy();violations=[];grain=goods.index('GRAIN')
 for day in range(600):
  stock+=queue.pop(day,np.zeros_like(stock))
  output=prod.copy()
  if kind=='drought90' and 180<=day<270:output[:,grain]*=.75
  for i in range(70):
   for r in REC:
    for inp,q in r['inputsPerUnit'].items():
     if stock[i,goods.index(inp)]+1e-3<output[i,goods.index(r['commodityId'])]*q:violations.append([day,ids[i],inp,'production_input'])
  stock+=output-use
  for f in T:
   a=ids.index(f['sellerCountryId']);b=ids.index(f['buyerCountryId']);j=goods.index(f['commodityId']);q=f['quantityPerDay']
   if kind=='trade_pause30' and 180<=day<210:continue
   stock[a,j]-=q
   arrival=day+max(1,math.ceil(f['travelSimDaysEstimate']))
   if arrival not in queue:queue[arrival]=np.zeros_like(stock)
   queue[arrival][b,j]+=q
  min_stock=np.minimum(min_stock,stock)
  for i,j in np.argwhere(stock<-.001):violations.append([day,ids[i],goods[j],'negative_stock'])
  if len(violations)>200:break
 return {'scenario':kind,'status':'PASS' if not violations else 'FAIL','daysExecuted':day+1,'violations':violations[:20],'minimumStockAcrossUnits':float(min_stock.min()),'scope':'OFFLINE_FIXED_PLAN_STOCK_REHEARSAL_WITH_SHIPPING_DELAY; not Core, not hour-by-hour power, not legal route activation'}
scenarios=[rehearse(k) for k in ['normal600','trade_pause30','drought90']]
# Explicit sensitivity; balance guarantee is NOT falsely extended to changed prices.
sensitivity=[];net=prod-use
for j,g in enumerate(goods):
 for factor in [.8,1.2]:
  px=prices.copy();px[j]*=factor;rat=[]
  for i,c in enumerate(C):rat.append(float(net[i]@px)/(c['population']*sum(G[k]['finalDemandPerPersonDay']*px[k] for k in range(12))))
  sensitivity.append({'commodityId':g,'priceMultiplier':factor,'worstAbsoluteTradeRatio':max(map(abs,rat)),'countriesOutsideBaseline8PercentBand':int(sum(abs(v)>.080001 for v in rat))})
test('Reference price shocks +/-20% within 30% trade exposure',lambda:require(max(s['worstAbsoluteTradeRatio'] for s in sensitivity)<=.30001,'price sensitivity too high'))
def route_checks():
 routes=get('transport-routes');byid={r['id']:r for r in routes};geo=get('geography');sea=parse_path(geo['maritime']['oceanPath']).buffer(.02);land=parse_path(geo['partition']['coastPath']).buffer(.02)
 from shapely.geometry import LineString
 for route in routes:
  length=0
  for seg in route['segments']:
   line=LineString(seg['points']);require(line.difference(sea if seg['mode']=='SEA' else land).length<.1,'route crosses wrong surface');length+=line.length*36000/1774
  require(abs(length-route['distanceKm'])<.01,'route length mismatch')
 for t in T:require(t['routeId'] in byid,'unrouted flow')
 for r in R:require(sum(x['population'] for x in get('settlements') if x['regionId']==r['id'])==r['initial']['population'],'settlement population mismatch')
test('Terrain-constrained trade paths and settlement reconciliation',route_checks)
profiles=[]
for i,c in enumerate(C):
 mix=prod[i]*prices;mix=mix/mix.sum();profiles.append(tuple(np.round(mix,5)))
result={'candidateChecks':checks,'candidateStatus':'PASS' if all(c['status']=='PASS' for c in checks) and all(t['status']=='PASS' for t in scenarios) else 'FAIL','countries':len(C),'regions':len(R),'deposits':len(M),'facilities':len(F),'openingPortfolioFacilities':sum(f['scenarioRole']=='OPENING_PORTFOLIO' for f in F),'legacyDevelopmentOptions':sum(f['scenarioRole']=='DEVELOPMENT_OPTION' for f in F),'tradePlans':len(T),'uniqueOutputMixesRounded5Decimals':len(set(profiles)),'scenarios':scenarios,'priceSensitivity':sensitivity,'worstPriceShockTradeRatio':max(s['worstAbsoluteTradeRatio'] for s in sensitivity),'quantityRoundingTolerancePerUnit':.001,'coreSimulation':'NOT_RUN','hourlyPowerDispatch':'NOT_RUN','physicalRouteSurvey':'NOT_RUN','independentReview':'NOT_CLAIMED','activationAllowed':False}
(B/'VALIDATION.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k not in ['priceSensitivity']},ensure_ascii=False,indent=2))
if result['candidateStatus']!='PASS':sys.exit(1)
