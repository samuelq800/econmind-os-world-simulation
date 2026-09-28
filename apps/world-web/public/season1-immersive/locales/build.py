from pathlib import Path
import json,re
root=Path(__file__).resolve().parent; pairs={}
for name in ['terms.tsv','modules.tsv','ui.tsv','country-game.tsv']:
 for line in (root/name).read_text().splitlines():
  if '|' in line:
   zh,en=line.split('|',1);pairs[zh]=en
catalog=json.loads((root.parent/'catalog.json').read_text())
overrides={'协调状态':'Coordination status','调整原因':'Reason for adjustment','指令对象':'Instruction target','指令理由':'Instruction rationale','行政优先级':'Administrative priority','执行延迟安排':'Execution-delay arrangements','行政能力调配':'Administrative capacity allocation','优先处理对象':'Priority target','前瞻指引':'Forward guidance','拟议货币融资本金':'Proposed monetary-financing principal','拟议货币融资年利率':'Proposed monetary-financing annual rate','拟议货币融资期限':'Proposed monetary-financing term','目标国家':'Target country','冻结资产':'Assets to freeze','限制币种':'Restricted currencies','支付渠道':'Payment channels','禁止新增合同类型':'Prohibited new contract types','保留既有到期义务':'Retain existing maturity obligations','处置方式':'Resolution method','六类供电优先级':'Six-category power priority','协定类型':'Agreement type'}
phrases={zh:en for name in ['terms.tsv','modules.tsv','ui.tsv','country-game.tsv'] for line in (root/name).read_text().splitlines() if '|' in line for zh,en in [line.split('|',1)]}
(root/'phrases.json').write_text(json.dumps(phrases,ensure_ascii=False,separators=(',',':')))
pairs.update(overrides)
suffixes={'起征门槛':'threshold','边际税率':'marginal tax rate','税率':'tax rate','金额':'amount','比例':'share','期限':'term','上限':'ceiling','日期':'date','人数':'headcount','资金':'funding','费用':'cost','预算':'budget','规模':'scale','份额':'share','责任':'responsibility'}
for m in catalog['modules']:
 for f in m['fields']:
  if f['label'] in pairs:continue
  src=f.get('sourceQuote','').split('|')[0].strip();src=re.split(r'[\u4e00-\u9fff]',src)[0].strip(' /:;，。-•')
  if not re.match('[A-Za-z]',src):continue
  if ':' in src or len(src)>110:
   src=src.split(':')[0]
   suffix=next((v for k,v in suffixes.items() if f['label'].endswith(k)),None)
   if suffix and suffix.lower() not in src.lower():src+=' — '+suffix
  pairs[f['label']]=src
missing=[]
for m in catalog['modules']:
 for f in m['fields']:
  if f['label'] not in pairs:missing.append(f['label'])
  for option in f.get('options',[]):
   if isinstance(option,str) and re.search('[\u4e00-\u9fff]',option) and option not in pairs:missing.append(option)
(root/'dictionary.json').write_text(json.dumps(pairs,ensure_ascii=False,separators=(',',':')))
(root/'coverage.json').write_text(json.dumps({'entries':len(pairs),'missingFieldLabelsOrOptions':sorted(set(missing)),'fieldLabels':len(set(f['label'] for m in catalog['modules'] for f in m['fields'])),'note':'English labels reuse original English specification headings. Original source quotations remain unchanged.'},ensure_ascii=False,indent=2))
print('dictionary',len(pairs),'missing',sorted(set(missing)))

english_source={en:zh for line in (root/'country-game.tsv').read_text().splitlines() if '|' in line for zh,en in [line.split('|',1)]}
(root/'english-source.json').write_text(json.dumps(english_source,ensure_ascii=False,separators=(',',':')))
