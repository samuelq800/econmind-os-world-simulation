from pathlib import Path
import json,csv,html,hashlib
B=Path(__file__).parent;D=B/'data';get=lambda n:json.loads((D/(n+'.json')).read_text());v=json.loads((B/'VALIDATION.json').read_text());cs=get('countries');fs=get('facilities');ts=get('trade-plans');rs=get('transport-routes');goods=get('commodity-catalog');plans=get('production-plans');deps=get('deposits')
cn={'CRUDE_OIL':'原油','NATURAL_GAS':'天然气','URANIUM':'铀','GRAIN':'粮食','IRON_ORE':'铁矿石','COPPER':'铜','LITHIUM':'锂','STEEL':'钢铁','REFINED_FUEL':'成品燃料','MACHINERY':'机械设备','SEMICONDUCTORS':'半导体','BATTERIES':'电池'}
render=lambda a:'、'.join(cn.get(x,x) for x in a)
summary=[]
for c in cs:
 cid=c['id'];f=[x for x in fs if x['countryId']==cid and x['scenarioRole']=='OPENING_PORTFOLIO'];d=[x for x in deps if x['countryId']==cid]
 summary.append({'编号':c['number'],'国家':c['name'],'旧人口':c['previousPopulation'],'新人口':c['population'],'国土面积平方公里':round(c['areaKm2'],2),'城镇人口占比':c['urbanShare'],'主要产业':render(c['leadingSectors']),'两条开局路线':render(c['guaranteedProductionRoutes']),'主要出口':render(c['principalExports']),'主要进口':render(c['principalImports']),'矿床数':len(d),'开局设施群数':len(f),'库存缓冲日':c['stockBufferDays'],'基准贸易收支占消费篮子':c['tradeNetToConsumptionRatio'],'港口所在国':next(x['name'] for x in cs if x['id']==c['seaAccessPortCountryId'])})
with (B/'70国总表.csv').open('w',encoding='utf-8-sig',newline='') as f:
 w=csv.DictWriter(f,fieldnames=list(summary[0]));w.writeheader();w.writerows(summary)
rows=''.join('<tr>'+''.join('<td>'+html.escape(f'{x:,}' if isinstance(x,int) else str(x))+'</td>' for x in row.values())+'</tr>' for row in summary)
heads=''.join('<th>'+html.escape(k)+'</th>' for k in summary[0])
page='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>World V2 · 70国数据与平衡</title><style>body{background:#0c2028;color:#e6e9e4;font:15px/1.7 system-ui;margin:0;padding:36px}h1{color:#ebcb80;font-size:30px}input{padding:12px;background:#17353d;color:white;border:1px solid #55767a;width:360px;max-width:85%}.table{overflow:auto;max-height:70vh;margin-top:24px}table{border-collapse:collapse;white-space:nowrap}td,th{padding:12px 16px;text-align:left;border-bottom:1px solid #28414b}th{position:sticky;top:0;background:#24424b;color:#ebcb80}tr:hover{background:#1c3d47}p{max-width:1000px}.note{color:#99bbc0}</style><h1>World V2 · 70国数据与平衡</h1><p>70国、122区域、240处矿床。人口与自然环境共同决定聚落和产业条件，各国保留不同的生产组合与贸易依赖。</p><p class="note">候选设计数据。基准价格贸易敞口控制在消费篮子的±8%；单项商品价格±20%的压力下控制在±30%。不代表GDP相等或胜率已验证。</p><label>查找国家、资源或产业<br><input id="filter" placeholder="例如：Korra、铜、半导体"></label><div class="table"><table><thead><tr>'''+heads+'''</tr></thead><tbody>'''+rows+'''</tbody></table></div><p class="note">全部数值、单位、推导规则、源快照和测试记录随数据包提供。插画坐标与地理坐标分别保存；新增设施是区域设施群，需整合到地图标记。离线演练不等于Core运行或正式入库。</p><script>document.getElementById('filter').addEventListener('input',e=>{let q=e.target.value.toLowerCase();document.querySelectorAll('tbody tr').forEach(r=>r.hidden=!r.textContent.toLowerCase().includes(q))})</script></html>'''
(B/'70国总览.html').write_text(page)
readme=f'''# World V2 全数据候选包 · 2026-09-28

本包在独立目录中完成，原地图、旧数据、生产数据库和审批状态均未改动。它是可审阅、可复现的开局设计候选；不是已批准或已运行的World State。

## 阅读入口

- `70国总览.html`：可搜索的国家对照表，可直接打开。
- `70国总表.csv`：Excel可打开的中文总表。
- `DATA_DICTIONARY.md`：按真实JSON字段生成的完整数据字典。
- `data/`：完整JSON与对应CSV；JSON为本包数据主格式。
- `inputs/`：8份冻结源文件及SHA256，用于追溯几版地图与目录来源。
- `VALIDATION.json`：实际执行的检查与限定范围的演练结果。
- `build.py / route.py / complete.py / check.py / rebuild.py`：推导、选线、补全与校验代码。

## 结果规模

- 国家70、经济区域122、矿床240、聚落归集244。
- 设施总记录{len(fs)}：开局设施群{v['openingPortfolioFacilities']}、保留的原开发选项350。两者不能相加当作已投运产能。
- 12类商品；六类固定地下资源不变。电力单独记录为流量。
- 贸易方案{len(ts)}、按地图海陆约束生成的国间路线{len(rs)}。
- 70国全部具有至少两条明确生产路线，产出组合以五位小数比较仍有{v['uniqueOutputMixesRounded5Decimals']}种。

## 人口和地理修正

旧模型把年降水超过2200毫米的耕地潜力归零，使Zorin仅900人、Yara仅1549人。新模型以面积、连续温度/降水适宜度、山地比例、河流和交通可达性重新分布人口，世界总人口保持14,712,146,434人。国家人口范围{min(c['population'] for c in cs):,}—{max(c['population'] for c in cs):,}人。

湿润热带最多把原森林面积12%列为候选农业用地。住房、太阳能和风能占地进一步逐区扣除，耕作面积受保护，土地面积守恒。所有变化写入changes与land-program，不能误称这些面积是实测历史。

矿床原始地质量、既有累计开采量和地下剩余量未增加。开局库存按投入产出配方回溯到原料含量，并从已开采的历史物料中重新分配；不凭空生成矿产库存。历史消耗相应减少，详见opening-material-reconciliation。

## 相对平衡如何实现

1. 自然资源决定可开采上限，气候/耕地/淡水决定农业上限，人文地理决定人口与技能。
2. 通过配置具体生产设施、农业和贸易组合实现平衡，没有国家专属GDP或产量加成。
3. 在统一参考价格和人均最终消费篮子下，各国每日净贸易收支在消费篮子的±8%以内。
4. 每种商品单独价格上涨或下跌20%时，各国贸易敞口不超过消费篮子的±30%。这不是所有商品同时波动的保证。
5. 一般商品单国生产份额上限20%；铀因既有地质产能约束放宽为25%，没有改写铀储量。
6. 开局住房、学位、技能、平均供电、用水、仓储与资金都有具体记录。库存按最慢到货时间加至少35日缓冲配置；维护、运费及税收后的净资金缺口有660日储备方案。
7. 不追求各国面积、人口、GDP或资源种类相等；也未声称多人博弈胜率已经相等。

## 实際检查

候选检查状态：{v['candidateStatus']}。检查包括人口/土地/矿产/物料守恒，引用与空间位置，劳动力技能，水电和账户，配方/贸易守恒，产业多样性与价格冲击，海陆路线及聚落汇总。

三次600日离线固定计划库存演练：常态；第180日起暂停发货30日；第180日起粮食减产25%持续90日。均按估算运输时间延迟到货，结果见VALIDATION。数量序列化容差0.001个相应商品单位；不是Core定点数结算证据。人口固定、配方固定、假设设施可用和许可被采用，未运行内生价格、逐小时电网、真实合同及违约反馈。

## 地图版本与交通处理

地理位置以V8陆地分区和14气候/320资源点图为准；矿产与人文参数取地理推导版；国家与大陆精绘图用于展示索引和原标记对应，不从画面计数建筑或推定储量。

航线使用6像素网格，在原海洋几何内行走；陆路出海段在原陆地几何内行走。每段保存坐标、距离与所经国家。部分窄水道在此分辨率下保守采用外国港口通道，这不改变沿海国家资格，也不表示该水道实际不能通航。内部设施接驳仍是待测绘通道；地形规划不是建成公路或港口工程验收。

## 数值的权威性与仍需真实输入的内容

本包补齐的是候选数值与结构。团队成员、真实World/Season绑定、许可证批准、技术授权和合同签署属于未来实际操作，不能伪造已批准记录。当前统一提供NPC接管方案、完整许可/技术条款候选与未签贸易计划。

农业尚无已绑定的Core项目目录编号，保留projectId=null，并明确给出农业责任与配方提案。财务、配方、建设成本、灾害概率和人口动态是公开的设计假设，不是可以仅靠地形推断的事实。地质qualityProxy也不是经化验的矿石品位。

正式接入仍需Core配方/农业责任确认、身份映射、权利登记、内部实际路由、逐小时调度和完整Core运行验收。activationAllowed始终为false。

## 复现

Python 3.12；参考依赖：numpy 2.5.3、scipy 1.18.1、shapely 2.1.2。

```sh
python rebuild.py
python package_report.py
```

脚本只写本包目录。地图原JSON不会被覆盖。复现的优化器版本固定时结果可比较；跨求解器版本可能出现等价最优产业组合，应重新检查差异。
'''
(B/'README.md').write_text(readme)
# Build immutable manifest after all numerical outputs and docs are ready.
files=[]
for f in sorted(B.rglob('*')):
 if f.is_file() and f.name!='CHECKSUMS.json' and '__pycache__' not in str(f):files.append({'path':str(f.relative_to(B)),'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'bytes':f.stat().st_size})
(B/'CHECKSUMS.json').write_text(json.dumps(files,ensure_ascii=False,indent=2)+'\n')
print('Report and package manifest written:',len(files),'files')
