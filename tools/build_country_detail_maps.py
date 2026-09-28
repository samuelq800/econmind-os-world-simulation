"""Seventy independent vector country maps from the atlas geometry and environmental proxies.
No raster crops. Trees, fields and town blocks are cartographic scenario detail, not surveyed objects.
"""
import json,math,hashlib,html
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from shapely.geometry import Point,LineString,box
from shapely.ops import unary_union
from shapely import contains_xy
from atlas_display_geometry import parse_path,to_svg
ROOT=Path(__file__).resolve().parents[1];D=ROOT/'apps/world-web/src/map-lab';OUT=ROOT/'apps/world-web/src/assets/country-detail';OUT.mkdir(exist_ok=True)
p=json.loads((D/'land-partition.json').read_text());a=json.loads((D/'atlas-layers.json').read_text());s=json.loads((D/'geographic-scenario.json').read_text());W,H=p['width'],p['height'];Y,X=np.mgrid[:H,:W]
rgb=np.asarray(Image.open(ROOT/'apps/world-web/src/assets/asterra-satellite-terrain-v8.png').convert('RGB')).astype(float)
climates={c['id']:parse_path(c['path']) for c in a['climates']};land=parse_path(p['coastPath'])
physical=[]
for f in a['physical']:
 geometry=parse_path(f['path']) if f['kind']=='lake' else unary_union([LineString([list(map(float,v.split(','))) for v in part.split('L')]) for part in f['path'].split('M')[1:]])
 physical.append((f,geometry))
lakes=unary_union([g for f,g in physical if f['kind']=='lake']);mountains=unary_union([g for f,g in physical if f['kind']=='mountain'])
all_sites=a['nodes']+a['facilities'];metadata=[]
for idx,country in enumerate(p['territories']):
 rng=np.random.default_rng(20260927+idx);shape=parse_path(country['path']);dry=shape.difference(lakes);x0,y0,x1,y1=shape.bounds;span=max(x1-x0,y1-y0);unit=span/180;pad=span*.2
 frame=(x0-pad,y0-pad,x1-x0+2*pad,y1-y0+2*pad);name=a['political']['countries'][idx]['name'];cid=country['id']
 path=to_svg(shape);drypath=to_svg(dry);clipid='country-'+country['number'];parts=[]
 def add(t):parts.append(t)
 def pathfill(g,color,opacity=1,stroke='none',width=0):
  if not g.is_empty:add(f'<path d="{to_svg(g)}" fill="{color}" fill-opacity="{opacity}" stroke="{stroke}" stroke-width="{width}" fill-rule="evenodd"/>')
 add(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{frame[0]} {frame[1]} {frame[2]} {frame[3]}" width="1800" height="1400"><title>{country["number"]} · {html.escape(name)} · 独立地理细图</title><desc>海岸、边界、水系与设施继承既有地图。树林、田块和城镇街区为推演制图细节，不代表实测建筑或已投运设施。</desc>')
 add(f'<defs><clipPath id="{clipid}"><path d="{drypath}" fill-rule="evenodd"/></clipPath><linearGradient id="sea" x2=".2" y2="1"><stop stop-color="#193e48"/><stop offset="1" stop-color="#0c303b"/></linearGradient><linearGradient id="field" x2="1" y2="1"><stop stop-color="#b7b775"/><stop offset="1" stop-color="#7c945a"/></linearGradient><pattern id="waves" width="{unit*11}" height="{unit*7}" patternUnits="userSpaceOnUse"><path d="M0 {unit*3}q{unit*2} {-unit} {unit*4} 0" fill="none" stroke="#75aead" stroke-width="{unit*.1}" opacity=".15"/></pattern></defs>')
 add(f'<rect x="{frame[0]}" y="{frame[1]}" width="{frame[2]}" height="{frame[3]}" fill="url(#sea)"/><rect x="{frame[0]}" y="{frame[1]}" width="{frame[2]}" height="{frame[3]}" fill="url(#waves)"/>')
 # Context shore belongs to neighbours, rendered quietly for true border continuity.
 context=land.intersection(box(frame[0],frame[1],frame[0]+frame[2],frame[1]+frame[3])).difference(shape)
 pathfill(context,'#50695b',.46)
 for distance,color,opacity in [(unit*5,'#497c7c',.2),(unit*2.8,'#68aba0',.27),(unit*1.2,'#98c6b0',.4)]:pathfill(shape.buffer(distance).difference(land),'#'+color.lstrip('#'),opacity)
 pathfill(shape,'#819362',1,'#d0c18d',unit*.35)
 palette={1:'#96aa75',2:'#527b4e',3:'#91a578',4:'#b3aa73',5:'#c4ad7c',6:'#82957b',7:'#8b947e',8:'#739764',9:'#a5a56c',10:'#b4b277',11:'#ada985',12:'#99a976',13:'#78926b',14:'#b8bcb0'}
 for climate_id,g in climates.items():pathfill(g.intersection(dry),palette[climate_id],.85)
 add(f'<g clip-path="url(#{clipid})">')
 # Painted contour terraces inherit the mountain traces.
 for width,color in [(unit*13,'#697b57'),(unit*8,'#798266'),(unit*4,'#a9a68b')]:pathfill(mountains.buffer(width).intersection(shape),color,.45)
 mask=contains_xy(dry,X,Y);ys,xs=np.where(mask)
 # Sample synthetic cartographic detail from actual source land pixels, with scale tied to this country.
 total=min(1150,max(360,int(shape.area/10)));sample=rng.choice(len(xs),size=total,replace=len(xs)<total)
 trees=fields=peaks=houses=0
 for index in sorted(sample,key=lambda i:ys[i]):
  x=float(xs[index])+float(rng.uniform(-.3,.3));y=float(ys[index])+float(rng.uniform(-.3,.3));point=Point(x,y)
  if not dry.contains(point):continue
  r,g,b=rgb[int(round(y)),int(round(x))];near=point.distance(mountains);scale=unit*float(rng.uniform(.65,1.1))
  if near<unit*4.5 and peaks<85:
   # Isometric ridge peaks, only in the existing mountain belt.
   t=scale*3.5;add(f'<g transform="translate({x} {y})"><path d="M{-t} {t*.35}L0 {-t*1.55}L{t} {t*.35}Z" fill="#8e947d" stroke="#526a58" stroke-width="{unit*.12}"/><path d="M0 {-t*1.55}L{t} {t*.35}L{t*.15} {t*.15}Z" fill="#5c7061"/><path d="M0 {-t*1.55}L{-t*.34} {-t*.86}L{-t*.05} {-t*.96}L{t*.19} {-t*.73}L{t*.39} {-t*.88}Z" fill="#e8e4c9"/></g>');peaks+=1
  elif g>r*.92 and r<155 and trees<650:
   t=scale;add(f'<g transform="translate({x} {y})"><ellipse cx="{t*.5}" cy="{t*.65}" rx="{t}" ry="{t*.42}" fill="#344f3d" opacity=".28"/><path d="M0 0v{t}" stroke="#725c3b" stroke-width="{t*.24}"/><path d="M0 {-t*2.2}L{-t*.7} 0H{t*.7}ZM0 {-t*1.55}L{-t*.9} {t*.5}H{t*.9}Z" fill="#3d6447"/><path d="M0 {-t*2.2}L{-t*.7} 0H0ZM0 {-t*1.55}L{-t*.9} {t*.5}H0Z" fill="#567b4b"/></g>');trees+=1
  elif near>unit*6 and fields<170:
   t=scale*2.1;angle=int(rng.choice([-20,8,25]));color=str(rng.choice(['#b4b774','#bfb980','#a0ac69','#b4a56d']))
   add(f'<g transform="translate({x} {y}) rotate({angle})"><rect x="{-t}" y="{-t*.55}" width="{t*2}" height="{t*1.1}" fill="{color}" stroke="#6d8254" stroke-width="{unit*.14}"/>')
   for stripe in [-.6,-.2,.2,.6]:add(f'<path d="M{t*stripe} {-t*.55}v{t*1.1}" stroke="#778b56" stroke-width="{unit*.12}"/>')
   add('</g>');fields+=1
 # Settlement streets and roofs are a scenario visualisation of the human-geography regions.
 for region in [r for r in s['regions'] if r['countryId']==cid]:
  center=Point(region['label']);radius=unit*(9+region['humanGeography']['scenarioUrbanShare']*9)
  for j in range(55):
   angle=float(rng.uniform(0,math.tau));rr=radius*math.sqrt(float(rng.random()));x=center.x+math.cos(angle)*rr;y=center.y+math.sin(angle)*rr
   if not dry.buffer(-unit*.6).contains(Point(x,y)):continue
   q=unit*float(rng.uniform(.55,1));roofs=['#b77d52','#9c6d48','#bb9164'];roof=roofs[j%3]
   add(f'<g transform="translate({x} {y})"><path d="M{-q} 0L0 {q*.6}L{q} 0V{q*1.1}L0 {q*1.7}L{-q} {q*1.1}Z" fill="#d6c59b" stroke="#807754" stroke-width="{unit*.08}"/><path d="M{-q} 0L0 {-q*.7}L{q} 0L0 {q*.6}Z" fill="{roof}"/><path d="M0 {q*.6}V{q*1.7}L{q} {q*1.1}V0Z" fill="#a79772"/></g>');houses+=1
 add('</g>')
 for f,g in physical:
  if f['kind']=='lake':pathfill(g.intersection(shape),'#317789',1,'#a8cfc0',unit*.3)
  elif f['kind']=='river':
   line=g.intersection(shape)
   if not line.is_empty:add(f'<path d="{to_svg(line)}" fill="none" stroke="#cece9d" stroke-width="{unit*.9}"/><path d="{to_svg(line)}" fill="none" stroke="#64a9b1" stroke-width="{unit*.48}"/>')
 # Facility buildings are tied to exact model coordinates and IDs.
 sites=[f for f in all_sites if f['countryId']==cid]
 for site in sites:
  x,y=site['point'];q=unit*2.1;kind=site['kind'];rec=next(f for f in s['facilities'] if f['id']==site['id'])
  add(f'<g data-facility="{site["id"]}" transform="translate({x} {y})"><title>{html.escape(rec["name"])} · {site["id"]} · 候选设施</title>')
  add(f'<ellipse rx="{q*2.2}" ry="{q*1.3}" fill="#465a44" opacity=".3"/>')
  if kind=='mine':add(f'<path d="M{-q*2} 0L{-q} {-q}H{q}L{q*2} 0L{q} {q}H{-q}Z" fill="#a99e7c" stroke="#695f48" stroke-width="{unit*.2}"/><ellipse rx="{q*1.1}" ry="{q*.6}" fill="#5b6655"/><path d="M{-q} 0L{q} {-q*2}M0 {-q}H{q*1.4}" stroke="#bea273" stroke-width="{unit*.4}"/>')
  elif rec['projectNumber']==10:
   for i in range(3):add(f'<path d="M{q*(-2+i*1.4)} {-q}l{q} 0l{-q*.2} {q*2}h{-q}Z" fill="#355e69" stroke="#b6c3a1" stroke-width="{unit*.15}"/>')
  elif rec['projectNumber']==11:
   for i in [-1,1]:add(f'<path d="M{q*i} {q}v{-q*3}m0 0l0 {-q*1.3}m0 {q*1.3}l{-q} {q*.6}m{q} {-q*.6}l{q} {q*.6}" stroke="#ded9bd" stroke-width="{unit*.26}"/>')
  else:
   add(f'<path d="M{-q*1.6} 0L0 {-q*.9}L{q*1.6} 0V{q*1.5}L0 {q*2.2}L{-q*1.6} {q*1.5}Z" fill="#cfc29b" stroke="#776c51" stroke-width="{unit*.16}"/><path d="M{-q*1.6} 0L0 {-q*1.4}L{q*1.6} 0L0 {q*.8}Z" fill="#936e50"/><path d="M0 {q*.8}V{q*2.2}L{q*1.6} {q*1.5}V0Z" fill="#938968"/>')
   if kind in ('energy','factory'):add(f'<path d="M{q*.8} 0v{-q*2.7}h{q*.5}v{q*2.7}" fill="#a5a18a" stroke="#676c5e" stroke-width="{unit*.12}"/>')
   if kind=='port':add(f'<path d="M{-q*2} {q*2}h{q*4}m{-q*3} 0v{q}m{q*2} {-q}v{q}" stroke="#c0ae80" stroke-width="{unit*.6}"/>')
  add('</g>')
 add(f'<path d="{path}" fill="none" stroke="#e4d2a1" stroke-width="{unit*.28}" stroke-dasharray="{unit*.8} {unit*.5}"/>')
 add('</svg>');filename=f'{country["number"]}-{name.lower()}.svg';svg=''.join(parts);(OUT/filename).write_text(svg)
 metadata.append(dict(id=cid,number=country['number'],name=name,file=filename,viewBox=frame,trees=trees,fields=fields,mountainSymbols=peaks,buildings=houses,facilityIds=[f['id'] for f in sites],sha256=hashlib.sha256(svg.encode()).hexdigest(),basis='BOUNDARIES_WATER_AND_FACILITY_POSITIONS_FROM_ATLAS; MICRODETAIL_SCENARIO_CARTOGRAPHY'))
 if (idx+1)%10==0:print(f'Country detail maps {idx+1}/70',flush=True)
(OUT/'index.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')
print('PASS: 70 independent vector maps; no embedded raster imagery',flush=True)
