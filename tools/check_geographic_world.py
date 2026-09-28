"""Independent structural, dimensional and accounting checks of the draft scenario."""
import json, math, re
from pathlib import Path
from collections import Counter
from shapely.ops import unary_union
from atlas_display_geometry import parse_path
ROOT=Path(__file__).resolve().parents[1];D=ROOT/'apps/world-web/src/map-lab'
s=json.loads((D/'geographic-scenario.json').read_text());p=json.loads((D/'land-partition.json').read_text());d=json.loads((D/'atlas-layers.json').read_text())
def finite(o):
 if isinstance(o,dict):
  for v in o.values():finite(v)
 elif isinstance(o,list):
  for v in o:finite(v)
 elif isinstance(o,(int,float)):assert math.isfinite(o)
finite(s)
assert s['activationAllowed'] is False and len(s['countries'])==70
assert set(x['commodityId'] for x in s['deposits'])=={'CRUDE_OIL','NATURAL_GAS','URANIUM','IRON_ORE','COPPER','LITHIUM'}
for k in ('URANIUM','LITHIUM'):assert len({r['countryId'] for r in s['deposits'] if r['commodityId']==k})>=10
for r in s['deposits']:
 assert abs(r['initialGeological']-r['cumulativeExtracted']-r['remainingGeological'])<.002
 assert r['remainingGeological']>=r['discoveredRemaining']>=r['recoverableRemaining']>=r['developedRemaining']>=0
 assert r['historicalConsumed']==r['cumulativeExtracted']
for c in s['countries']:
 rr=[r for r in s['regions'] if r['countryId']==c['countryId']]
 assert c['population']==sum(r['initial']['population'] for r in rr)
 assert c['labourForce']==c['scenarioEmployed']+c['scenarioUnemployed']
 assert abs(c['bankReservesGcu']+c['bankLoansGcu']-c['bankDepositsGcu']-c['bankEquityGcu'])<.03
 footprint=unary_union([parse_path(r['path']) for r in rr]);original=parse_path(next(t['path'] for t in p['territories'] if t['id']==c['countryId']))
 assert footprint.symmetric_difference(original).area<.001
for r in s['regions']:
 assert abs(sum(r['landUseKm2'].values())-r['areaKm2'])<.01
 assert r['initial']['population']>=r['initial']['workingAge']>=r['initial']['labourForce']
 assert sum(r['initial']['skills'].values())==r['initial']['labourForce']
 assert r['initial']['croplandHa']<=r['landUseKm2']['croplandPotential']*100+.1
 assert abs(sum(r['natural']['monthlyRainMm'])-r['natural']['annualRainMm'])<.6
 assert abs(r['natural']['runoffM3Year']*.35/360-r['natural']['allocatableWaterM3Day'])<1
assert sum(len(b['regionIds']) for b in s['basins'])==len(s['regions'])
assert len({rid for b in s['basins'] for rid in b['regionIds']})==len(s['regions'])
assert sum(b['annualInflowM3'] for b in s['basins'])==sum(r['natural']['runoffM3Year'] for r in s['regions'])
ids={f['id'] for f in s['facilities']};assert len(ids)==350
adj={x:set() for x in ids}
for edge in s['freight']:
 assert edge['fromId'] in ids and edge['toId'] in ids
 assert edge['operating'] is False and edge['status']=='SURVEY_CORRIDOR'
 assert edge['cargo']=='STANDARD_COMMODITIES_EXCLUDING_ELECTRICITY'
 assert edge['capacityTonnesDay']>0 and edge['travelSimDays']>0
 adj[edge['fromId']].add(edge['toId']);adj[edge['toId']].add(edge['fromId'])
seen=set();pending=[next(iter(ids))]
while pending:
 x=pending.pop()
 if x not in seen:seen.add(x);pending.extend(adj[x]-seen)
assert seen==ids
catalog=(ROOT/'packages/core/src/registries/fixed-catalog.ts').read_text()
for f in s['facilities']:
 assert f"id: '{f['projectId']}'" in catalog
 assert not f['operational'] and f['lifecycle']=='CANDIDATE'
assert all(g['crossBorderConnections']==[] for g in s['power'])
assert all(r['marineOverlap']=='DEVELOPMENT_FROZEN_UNTIL_DELIMITATION_OR_JOINT_REGISTER' for r in s['rights'])
assert all(r['visibility']=='PUBLIC_SCENARIO_CANDIDATE' for r in s['deposits'])
result=dict(status='PASS',regions=len(s['regions']),countries=70,facilities=350,candidateGraphConnected=True,actualOperatingNetwork='NOT_ACTIVATED',mineralConservation=True,landConservation=True,populationAndSkillsConserved=True,bankBalance=True,
 finalBalance={'foodDeficitRegions':sum(r['foodNetTonnesDay']<0 for r in s['balanceChecks']),'housingGapRegions':sum(r['housingGapUnits']>0 for r in s['balanceChecks']),'waterDeficitRegions':sum(r['waterAfterHouseholdsAndFarmsM3Day']<0 for r in s['balanceChecks'])},fullSimulation='NOT_RUN')
(ROOT/'artifacts/world-geography/validation-result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
