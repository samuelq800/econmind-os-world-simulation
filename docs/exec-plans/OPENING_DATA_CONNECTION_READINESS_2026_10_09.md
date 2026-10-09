# 开局包与数据接口接线 — 2026-10-09

Owner 当前请求：先准备随时接入开局包，该处理的数据接口接上。
本轮只完成现有接口的显式接线，不启动经济、不虚构开局或任职数据。

## 固定起点与实际依赖

- 本轮施工起点：96217db583db4c1bd6ef74714b2e0a5ef6b7ed6d，treef605d1a。
- PR118已获B独审及全部适用CI通过，正常合并后的实际main为
  3eb6e049d02a76e010cb5cb449d6d7151ae63573，tree945c82b；与候选068f885完整tree相同。
- 完整check的取消原因已通过GitHub实际annotations定位：hosted runner未获得，
  macOS arm64容量不足、没有执行步骤。Root仅恢复该取消job一次，保留旧CANCELLED。
- 现有read、financial intake、Office command routes各自实现，不等于默认API已mount。
- 唯一生产schema publisher、真实开局包/admission、lawful seats和外部host仍是实际条件。

## 所有权与施工顺序

先由A定位existing opening bundle→Core bridge→seed/bootstrap/admission/readback；
G定位existing三route→显式服务host；C定位正式browser→统一真实session接线。
先核实最小缺口，再绑定精确文件实施；不再造已经存在的接口。
Root只负责固定组合、CI接线、检查结果与交接记录。独审另交未参与实现的窗口。

已完成一次轻量定位，现已精确授权以下源码准备：

- A：新增Worker私有opening-bundle loader/preflight、专用测试/config/report；
  真实固定byte/hash/UTF8/集合与现有验证器接通，无DB、bootstrap或publisher调用。
- G：新增nonactivated-runtime-api-host、专用实际socket测试/config/report；
  复用existing read-host/financial/Office constructors，四exactpath与配置一致性验证，
  无listen、默认mount或production解锁。API factory export若需要仅限本工厂/types。
- C：新增trusted-host session/bootstrap、entry薄安装和专用测试/config/report；
  必要时仅在两个既有view增加真实controller.subscribe观察出口，统一撤权清理。
  复用existingread/financial binding，禁止自动生成command或挪用localTrade路径。
- E：只读确认旧GCU batch→正式各国LC batch、FX/CB register真实producer缺口，
  不创建新经济规则或缺失carrier。A不占用此桥的生产代码。

已经明确的实际边界：当前没有生产host/session的connect调用；各单route存在并不代表
默认API进程已挂载。manualOffice runtime还有私有同pool/clock/World引用与local/CI-only
consumer守卫，不能通过一个URL/JSON跨进程宣称已接外部Worker。开局旧桥与LC batch
要求也不能仅把函数串起来就宣布已准备完毕；须用合法真实carrier接口解决。

PR118取消job的单次恢复已执行原始pnpm check并实际SUCCESS；未改workflow/skip。
完整run37786268839 attempt2的原始artifact已下载，主suite2967PASS/153SKIP/0FAIL；
另有29与34PASS的子suite，不累加为唯一测试数量。旧CANCELLED与历史FAIL保留。
native37786268901、trusted37786268875、Storage37786268873及真实PG子jobSUCCESS；
源码合并不等于生产schema发布或开局。旧PR114已作superseded关闭，未删分支。

C已冻结d9313b5180895d20e9563f3f9dc34830b702785e，206定向测试PASS，交F独审；
其中直接Financial view closed失效后清私密DOM，原3FAIL及修后4PASS分别保留。
A已固定49e8359a4bfa76a1622ab0dc6645bfb5160c90f6，14PASS，实际93文件/34JSON校验，交B独审。
G已固定89ae38a8412de1beb8c4566c1a6b19bc89c8a71d，最终socket11PASS，交E独审；
borrowed clock不冻结、不执行getter，真实private identity与原守卫不变。
Root正常replay三方原件，已逐文件确认与各自固定候选相同；新增CI覆盖与strict配置，
不放宽任何原测试。独审结论及组合检查尚待收口，不能提前自批合并。
各窗口的SOURCE_ONLY成果在独审前均不当作已合并或生产连通。

E已从fixed96217db极窄只读确认：old canonical assembly仅单GCU batch，正式bootstrap
要求各国获批LC batch（允许额外GCU）；Core本身已有合法multi-currency FinancialOpeningBatch[]。
Owner-adopted FX/CB输入仍仅TEST_ONLY品牌，正式FX/完整CB register producer契约不存在。
这是一项尚未接通的金融输入代码边界，不是“收到任何开局包就能直接跑”的保证。
金融producer在真实LC/FX版本/日期/字段币种与完整持仓/claim/counterparty来源契约到达前HOLD；
届时另做窄producer工程及独审。loader真实预检必须原样报出限制，不改币种标签、
不默认FX=1、未知持仓不填0、TEST_ONLY不升格。不阻塞其他existing接口的非启用接线。

允许：在隔离本地/CI验证现有真实链、数据形状/hash/拒绝控制及transport/session清理。
不允许：新SQL/schema/旧站改动、生产任意写入、自动启动、默认READY、补零、
mock成功回调、替代Core权威链、测试签名作为正式任职或source authority。

## 交付门槛

1. 开局包入口：原字节及来源保留、完整性与版本定位；已有Core validator拒绝不完整输入。
2. 服务端接线：复用现有auth/current binding/SQL ports和精确path；失败不触发写入。
3. 浏览器接线：真实token/current-session与server-owned pins；无配置默认断开。
4. 生命周期：撤权、断连、换国家/职位、pagehide后清除私密状态，迟到请求不复活。
5. 固定SHA/typecheck/正常定向测试、独立窄审与适用CI完成后正常合并。

只在真实输入和外部连接到达、受控发布与读回完成后报告生产连通。
Gate B、admission、worldId、seed和启动状态不因本接线计划改变。

## 收口：源码已合并，未启用

上述施工快照已由最终回执更新：B/E/F固定范围APPROVED；PR125 final a435a31的
trusted37893770119与atlas37893770112实际SUCCESS，正常merge main56cdcfa9573464c64c7368571dea7c6abb8ffa24。
candidate/实际CI checkout85cdcde/main完整tree均69381337f3fe8aab845e761a79a6b8a0e7159bee。
新增四文件64PASS/0FAIL/0SKIP、25.56s；这是适用CI，不是完整pnpm check或production验收。
G继承skipLibCheck=true/vendor声明NOT_CHECKED的报告表述已修正，原件配置未变。
F首轮timeout UNKNOWN及其他历史失败仍保留；不追加全量重复检查。
见[固定合并回执与接包入口](../reports/world-connection/O_OPENING_INTERFACE_SOURCE_MERGE_2026_10_09.md)。
