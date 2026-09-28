"""Enrich the image-aligned planning atlas without changing country borders.

Standalone: python tools/enrich_atlas_ecology.py
Also called by build_atlas_layers.py so a full rebuild preserves this detail.
Requires Pillow, numpy, scipy and shapely. No economic quantities are assigned.
"""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from shapely import contains_xy
from shapely.geometry import LineString
from shapely.ops import unary_union

from atlas_display_geometry import parse_path, mask_geometry, to_svg

ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / 'apps/world-web/src/map-lab'


def enrich(data, partition):
    source=ROOT/'apps/world-web/src/assets/asterra-satellite-terrain-v8.png'
    assert hashlib.sha256(source.read_bytes()).hexdigest()==data['sourceSha256']
    assert hashlib.sha256((DIR/'land-partition.json').read_bytes()).hexdigest()==data['partitionSha256']
    coast=parse_path(partition['coastPath'])
    w,h=partition['width'],partition['height']
    yy,xx=np.mgrid[:h,:w]
    land=contains_xy(coast,xx,yy)
    rgb=np.asarray(Image.open(source).convert('RGB')).astype(float)
    r,g,b=rgb.transpose(2,0,1)
    dryness=ndi.gaussian_filter(r-g,12)
    inland=ndi.distance_transform_edt(land)
    latitude=np.abs(65-yy/h*130)
    ridges=[]
    for feature in data['physical']:
        if feature['kind']=='mountain':
            for part in feature['path'].split('M')[1:]:
                ridges.append(LineString([list(map(float,p.split(','))) for p in part.split('L')]))
    highlands=contains_xy(unary_union(ridges).buffer(14),xx,yy)
    climate=np.ones((h,w),dtype=np.uint8)
    climate[latitude<20]=2
    climate[(inland<25)&(latitude>=20)]=3
    climate[(dryness>8)&(inland>18)]=4
    climate[(dryness>18)&(inland>24)]=5
    climate[latitude>45]=6
    # Authored regional exposure and dry-season distinctions, not a climate model.
    monsoon=((xx>720)&(xx<1010)|(xx>1370))&(latitude<27)&(dryness<12)
    climate[monsoon]=8
    climate[(latitude<22)&(dryness>1)&(dryness<=12)&~monsoon]=9
    west_margin=(xx<350)|((xx>900)&(xx<1170))
    climate[(latitude>20)&(latitude<40)&(inland<55)&west_margin&(dryness>1)]=10
    climate[(latitude>32)&(dryness>5)&(inland>22)]=11
    climate[(latitude>28)&(latitude<46)&(inland>45)&(dryness<=8)]=12
    climate[highlands]=7
    climate[highlands&(latitude<23)]=13
    climate[highlands&(latitude>32)&(ndi.gaussian_filter((r+g+b)/3,4)>90)]=14
    climate=ndi.median_filter(climate,size=7)
    climate[~land]=0
    definitions=[
        (1,'温带湿润','#79ad78','四季温和，内陆与河谷的湿润过渡带'),
        (2,'热带常湿','#1c9474','低纬湿润地带，常绿植被的规划区域'),
        (3,'温带海洋性','#68b8ba','受海洋调节的沿海地区'),
        (4,'暖温带半干旱草原','#c9b76c','干旱内陆外围的草原过渡带'),
        (5,'内陆荒漠','#dc9362','盆地与雨影区的干旱核心'),
        (6,'冷凉大陆性','#87a9c7','高纬度陆地，生长季较短的规划地带'),
        (7,'温带高山','#b1a4cc','山脊和高地的垂直气候带'),
        (8,'热带季风','#4bc498','低纬迎风地带，干湿季分明的规划区域'),
        (9,'热带稀树草原','#b7c667','湿润热带与季节性干旱区的过渡'),
        (10,'地中海式沿岸','#e5bd89','中纬西岸，夏干冬湿的规划气候'),
        (11,'冷凉半干旱草原','#b49d80','较高纬度的干旱内陆与背风坡'),
        (12,'温带湿润大陆性','#8dba96','远离海岸的湿润森林与平原'),
        (13,'热带高地','#91b7bd','低纬山地，温度较周围低地温和'),
        (14,'高山寒带','#ded5e8','高纬山脊与积雪高地的寒冷带')]
    data['climates']=[]
    for idx,name,color,description in definitions:
        count=int((climate==idx).sum())
        assert count>0,f'Unused climate: {name}'
        data['climates'].append(dict(id=idx,name=name,color=color,description=description,
                                    path=to_svg(mask_geometry(climate==idx)),landPixels=count))
    print('14 climate types generated',flush=True)
    country_land={}
    for country,region in zip(data['political']['countries'],partition['territories']):
        geometry=parse_path(region['path'])
        x0,y0,x1,y1=geometry.bounds
        x0,y0=max(0,int(x0)),max(0,int(y0))
        x1,y1=min(w,int(x1)+2),min(h,int(y1)+2)
        inside=contains_xy(geometry,xx[y0:y1,x0:x1],yy[y0:y1,x0:x1])
        values=np.bincount(climate[y0:y1,x0:x1][inside],minlength=15)
        country_land[country['id']]=(xx[y0:y1,x0:x1][inside],yy[y0:y1,x0:x1][inside])
        country['climateId']=int(values[1:].argmax()+1)
        country['climateMix']=[dict(id=int(idx),landPixels=int(values[idx]),
                                   sharePercent=round(float(values[idx]/values.sum()*100),1))
                               for idx in np.argsort(values[1:])[::-1]+1 if values[idx]>0]

    # Preserve all existing resource IDs/locations and infrastructure references.
    data['resources']=[resource for resource in data['resources'] if int(resource['id'][3:])<=32]
    data['resourceTypes']=[r for r in data['resourceTypes'] if r['id'] in
                           ('iron','copper','grain','gas','oil','lithium','uranium')]
    extra_types=[
        ('coal','煤炭','煤','#a9a2a1','沉积盆地与山前煤系'),
        ('bauxite','铝土矿','Al','#d89b75','暖湿地带的风化高原'),
        ('nickel','镍矿','Ni','#a0c8a8','岛弧与基性岩带'),
        ('phosphate','磷矿','P','#ddca9b','沉积盆地与古浅海区'),
        ('rareearth','稀土','稀','#cfa7d3','古老岩体与风化带'),
        ('salt','盐类矿产','盐','#e7d9c0','干旱盆地与蒸发环境'),
        ('timber','林业产区','林','#8ec793','湿润森林与山麓'),
        ('cotton','棉花产区','棉','#ebc9a7','暖热河谷与灌溉平原'),
        ('coffee','咖啡产区','咖','#bb997c','热带丘陵与高地')]
    data['resourceTypes'].extend(dict(id=id,name=name,symbol=symbol,color=color,context=context)
                                for id,name,symbol,color,context in extra_types)
    groups={'iron':'金属矿产','copper':'金属矿产','lithium':'金属矿产','bauxite':'金属矿产',
            'nickel':'金属矿产','rareearth':'金属矿产','gas':'能源','oil':'能源','uranium':'能源',
            'coal':'能源','phosphate':'非金属矿产','salt':'非金属矿产',
            'grain':'农林产品','timber':'农林产品','cotton':'农林产品','coffee':'农林产品'}
    for kind in data['resourceTypes']:kind['group']=groups[kind['id']]
    extra_sites={
      'coal':[(380,335),(497,343),(710,529),(1160,592),(1430,660),(270,455)],
      'bauxite':[(767,429),(884,471),(988,343),(1111,527),(1360,505)],
      'nickel':[(692,277),(943,177),(1209,250),(948,335),(505,711),(281,574)],
      'phosphate':[(1131,577),(1337,563),(1302,621),(1543,702),(393,328)],
      'rareearth':[(188,178),(409,181),(1515,307),(1102,688),(1292,721)],
      'salt':[(1225,579),(1264,613),(382,368),(1383,561)],
      'timber':[(285,225),(407,239),(514,216),(741,459),(821,551),(231,534),(1446,427),(1522,613)],
      'cotton':[(386,306),(473,372),(821,497),(1431,736),(1479,682)],
      'coffee':[(686,320),(764,495),(968,329),(285,613),(1378,444)],
      'iron':[(1529,264),(200,692),(1230,729)],
      'copper':[(566,184),(862,457),(1554,399)],
      'grain':[(463,273),(866,505),(1342,746)],
      'gas':[(1424,583),(376,354)],'oil':[(1325,615),(1187,704)]}
    ecological_types={'coffee':[2,8,9,13],'cotton':[1,2,4,8,9,10],
                      'timber':[1,2,3,6,8,12,13],'bauxite':[2,8,9,13],
                      'salt':[4,5,11]}
    region_geometries=[parse_path(r['path']) for r in partition['territories']]
    for kind,points in extra_sites.items():
        for x,y in points:
            allowed=land.copy()
            if kind in ecological_types:allowed &= np.isin(climate,ecological_types[kind])
            for existing in data['resources']:
                ex,ey=existing['point']
                allowed[max(0,ey-25):min(h,ey+26),max(0,ex-25):min(w,ex+26)] &= \
                    ((xx[max(0,ey-25):min(h,ey+26),max(0,ex-25):min(w,ex+26)]-ex)**2+
                     (yy[max(0,ey-25):min(h,ey+26),max(0,ex-25):min(w,ex+26)]-ey)**2)>=25**2
            ys,xs=np.where(allowed)
            i=int(np.argmin((xs-x)**2+(ys-y)**2));px,py=int(xs[i]),int(ys[i])
            country_index=next(i for i,geometry in enumerate(region_geometries) if contains_xy(geometry,px,py))
            data['resources'].append(dict(id=f"RES{len(data['resources'])+1:02}",kind=kind,
                                         point=[px,py],countryId=partition['territories'][country_index]['id']))
    # Tenfold expansion from the original visible 32-site map. Every country
    # receives at least four sites and three distinct resource types. Additional
    # sites favour larger land areas, while quantities and output remain unset.
    ecological_types['grain']=[1,2,3,4,8,9,10,11,12]
    all_kinds=[r['id'] for r in data['resourceTypes']]
    def add_country_site(country):
        cid=country['id'];xs,ys=country_land[cid]
        local=[r for r in data['resources'] if r['countryId']==cid]
        present=[r['kind'] for r in local]
        primary=country['climateId']
        if primary in (2,8,9,13):
            preferred=['bauxite','coffee','nickel','timber','cotton','copper','grain']
        elif primary in (4,5,11):
            preferred=['salt','phosphate','gas','oil','uranium','lithium','copper']
        elif primary in (7,14):
            preferred=['iron','copper','rareearth','nickel','lithium','uranium']
        else:
            preferred=['timber','grain','coal','iron','phosphate','copper','rareearth']
        ordered=list(dict.fromkeys(preferred+all_kinds))
        ordered=sorted(enumerate(ordered),key=lambda pair:(present.count(pair[1]),pair[0]))
        for _,kind in ordered:
            valid=np.ones(len(xs),dtype=bool)
            if kind in ecological_types:valid &= np.isin(climate[ys,xs],ecological_types[kind])
            # Reuse the closest authored region, but do not stack point symbols.
            cx,cy=xs[valid],ys[valid]
            if not len(cx):continue
            if local:
                clearance=np.full(len(cx),np.inf)
                for site in local:
                    sx,sy=site['point'];clearance=np.minimum(clearance,(cx-sx)**2+(cy-sy)**2)
                if clearance.max()<16:continue
                best=int(np.argmax(clearance + np.minimum(inland[cy,cx],8)))
            else:
                best=int(np.argmax(inland[cy,cx]))
            p=[int(cx[best]),int(cy[best])]
            data['resources'].append(dict(id=f"RES{len(data['resources'])+1:03}",kind=kind,point=p,countryId=cid))
            return
        raise AssertionError(f'Unable to diversify {cid}')
    countries=data['political']['countries']
    for country in countries:
        while True:
            local=[r for r in data['resources'] if r['countryId']==country['id']]
            if len(local)>=4 and len({r['kind'] for r in local})>=3:break
            add_country_site(country)
    assert len(data['resources'])<=320
    while len(data['resources'])<320:
        counts={c['id']:sum(r['countryId']==c['id'] for r in data['resources']) for c in countries}
        country=max(countries,key=lambda c:len(country_land[c['id']][0])**.5/(counts[c['id']]+1)**1.5)
        add_country_site(country)
    for site in data['resources']:
        site['climateId']=int(climate[site['point'][1],site['point'][0]])
    data['ecologyRevision']='CLIMATE_14_RESOURCE_16_V1'
    data['resourceComplexity']=dict(baselineSites=32,multiplier=10,totalSites=320,
                                    minimumSitesPerCountry=4,minimumTypesPerCountry=3)
    data['ecologyNotes']={
        'climate':'按底图与地域设定细分，季节性特征为规划假设。',
        'resources':'矿产为规划点位；新增农林产区按气候带布置，未赋储量或产量。',
        'share':'区内气候比例是地图面积占比，不是气候预测概率。'}
    print(f"{len(data['resourceTypes'])} resource types, {len(data['resources'])} sites",flush=True)
    return data


if __name__=='__main__':
    artifact=DIR/'atlas-layers.json'
    data=json.loads(artifact.read_text())
    partition=json.loads((DIR/'land-partition.json').read_text())
    artifact.write_text(json.dumps(enrich(data,partition),ensure_ascii=False,separators=(',',':'))+'\n')
