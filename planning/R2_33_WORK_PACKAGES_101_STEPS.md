# EconMind World V2 R2 — 33 个工作包 / 101 个详细步骤

> 本文件与 `r2_steps.json` 共同构成 R2 详细步骤的权威定义。若二者冲突，以 JSON 的 step_id / dependencies 为机器校验源，并停止执行等待修正。

状态规则：只有独立审查后才可 `VERIFIED`；普通步骤的 hard dependencies 必须全部 VERIFIED。`PARALLEL_PREPARATION` 只允许提前准备，不代表父工作包完成。

## V00｜新仓库边界、资料导入与可运行脚手架
- Stage: S0
- Work-package prerequisites: 无

### V00.1｜仓库工具链核验与版本冻结
- 执行模式：`NORMAL`
- Hard dependencies：无
- 目的：冻结 Node/pnpm/TypeScript/Vite/React/test/lint 版本、真实命令与环境安全边界。
- Exit gate：干净安装、lint/typecheck/test/build 与生产写保护均有真实证据。

### V00.2｜三应用运行入口与生命周期骨架
- 执行模式：`NORMAL`
- Hard dependencies：V00.1
- 目的：让 world-web、world-api、world-worker 成为可独立启动的真实进程，建立 health/readiness/graceful shutdown。
- Exit gate：三进程可独立/联合启动；错误端口、无效环境和退出信号 fail closed。

### V00.3｜启动层集成验证与 Bootstrap 报告
- 执行模式：`NORMAL`
- Hard dependencies：V00.2
- 目的：建立 Web→API 健康通信、Worker 内部健康检查、统一 dev 命令和 bootstrap evidence。
- Exit gate：不接业务数据库写入；三层运行边界被自动测试；V00 独立审查可执行。

## V01｜需求追踪、规范协调与两仓库集成契约
- Stage: S0
- Work-package prerequisites: V00

### V01.1｜需求来源与覆盖登记
- 执行模式：`NORMAL`
- Hard dependencies：V00.3
- 目的：把 8 份规范来源、固定目录和高层功能映射为可追踪 requirement registry。
- Exit gate：来源可回查；资料完整不被误报为功能实现。

### V01.2｜ADR-01 至 ADR-20 协调与阻塞图
- 执行模式：`NORMAL`
- Hard dependencies：V01.1
- 目的：登记冲突、提案、批准主体、最晚关口和受影响工作包。
- Exit gate：未批准 ADR 不进入正式算法；Codex 不可自批。

### V01.3｜两仓库身份/路由/Legacy 集成契约
- 执行模式：`NORMAL`
- Hard dependencies：V01.2
- 目的：冻结共享身份字段白名单、旧路由行为、复用资产与 V1/V2 边界。
- Exit gate：不复制旧经济真相；主站与 V2 的 owner/contract 明确。

## V02｜环境隔离与唯一数据库发布链
- Stage: S0
- Work-package prerequisites: V00, V01

### V02.1｜Local/CI 数据库隔离
- 执行模式：`NORMAL`
- Hard dependencies：V00.3, V01.3
- 目的：建立本地 Supabase 与 CI 临时数据库策略、合成 fixture 和生产指纹拒绝。
- Exit gate：正常开发命令无法写共享生产；CI 无生产 secret。

### V02.2｜Staging 与唯一生产 Migration 发布链
- 执行模式：`NORMAL`
- Hard dependencies：V02.1
- 目的：建立独立 staging、V2 migration artifact 合同和主站唯一生产发布路径。
- Exit gate：两个 repo 不各自 db push；migration hash/顺序/审批可追踪。

### V02.3｜数据库升级/回退与环境演练
- 执行模式：`NORMAL`
- Hard dependencies：V02.2
- 目的：从 clean baseline 和既有 schema 两条路径演练升级、forward-fix/rollback 与环境指纹。
- Exit gate：真实 rehearsal 有证据；shared/auth owner 未被 V2 擅改。

## V03｜统一基础类型与 Registry
- Stage: S1
- Work-package prerequisites: V00, V01

### V03.1｜Money/Quantity/Rate/SimTime 基础类型
- 执行模式：`NORMAL`
- Hard dependencies：V00.3, V01.3
- 目的：建立 Decimal/fixed-point 金额、带单位数量、0..1 Rate、SimTime 与显式转换。
- Exit gate：币种/单位/比例错配 fail closed；无不受控 money float。

### V03.2｜固定 Registry 与参数来源
- 执行模式：`NORMAL`
- Hard dependencies：V03.1
- 目的：落地 12 商品、12 部门、22 技术、38 项目、Office、单位等 registry 与 provenance。
- Exit gate：目录数量逐项匹配；archetype 只用于初始化。

### V03.3｜错误码、版本与序列化协议
- 执行模式：`NORMAL`
- Hard dependencies：V03.2
- 目的：冻结 domain error、schema/model/registry version、稳定序列化和 hash 约定。
- Exit gate：跨进程版本不一致可拒绝；错误不 silent success。

## V04｜可执行工程门禁与负例验证
- Stage: S1
- Work-package prerequisites: V00, V01, V02, V03

### V04.1｜架构/权限/写入门禁
- 执行模式：`NORMAL`
- Hard dependencies：V00.3, V01.3, V02.3, V03.3
- 目的：扩展边界守卫，覆盖 client authority、跨 Engine direct write、禁用模式等。
- Exit gate：故意违规 fixture 必须被真实 CLI/CI 拦截。

### V04.2｜Invariant/Testkit 基础
- 执行模式：`NORMAL`
- Hard dependencies：V04.1
- 目的：建立守恒、账本、权限、时间、幂等等测试 harness 和 fixture builders。
- Exit gate：已实现范围有真断言；未实现项明确 NOT_RUN。

### V04.3｜CI Merge Gate 与证据模板
- 执行模式：`NORMAL`
- Hard dependencies：V04.2
- 目的：建立 P0/P1 merge gate、报告模板、需求覆盖和禁止弱化测试检查。
- Exit gate：任何 blocker 测试失败不能 merge；无 echo-pass/skip 规避。

## V05｜身份桥接、Office 授权与版本审批内核
- Stage: S1
- Work-package prerequisites: V01, V02, V03

### V05.1｜身份桥接与 Office Assignment
- 执行模式：`NORMAL`
- Hard dependencies：V01.3, V02.3, V03.3
- 目的：实现 shared user/team 查询适配、world/country/office assignment 和服务器再验证。
- Exit gate：错误 country/office/user 均拒绝；移除成员后新命令失权。

### V05.2｜Required Offices 与版本审批内核
- 执行模式：`NORMAL`
- Hard dependencies：V05.1
- 目的：实现 required_offices resolver、独立 Office 签字、reject/revise/invalidate/version semantics。
- Exit gate：同人多职不 auto-approve；拒绝不会被后续批准复活。

### V05.3｜Classified Projection 与授权生命周期
- 执行模式：`NORMAL`
- Hard dependencies：V05.2
- 目的：建立数据分级、读取投影、撤销权限和已接受命令/已签合同的生命周期规则。
- Exit gate：机密数据不靠前端隐藏；授权变化有真实负例测试。

## V06｜E01 时钟、规则时间与调度
- Stage: S1
- Work-package prerequisites: V01, V03

### V06.1｜10x Simulation Clock 核心
- 执行模式：`NORMAL`
- Hard dependencies：V01.3, V03.3
- 目的：实现 1 real day=10 sim days、360-day year、统一 SimTime 转换与注入式测试钟。
- Exit gate：8640 real sec=1 sim day；业务代码不自乘10。

### V06.2｜调度、Pause/Resume 与 Catch-up
- 执行模式：`NORMAL`
- Hard dependencies：V06.1
- 目的：实现 exact due、daily settlement、annual roll、暂停恢复与 catch-up 语义。
- Exit gate：暂停不累计经济时间；重启不重复到期。

### V06.3｜确定时间顺序与边界测试
- 执行模式：`NORMAL`
- Hard dependencies：V06.2
- 目的：冻结同时间优先级、day boundary、命令 cutoff 和断电/恢复测试。
- Exit gate：相同输入产生相同事件顺序；不依赖玩家在线。

## V07｜命令、事件、回执与确定性重放基础
- Stage: S1
- Work-package prerequisites: V02, V03, V05, V06

### V07.1｜Command/Event Schema 与不可变 Ledger
- 执行模式：`NORMAL`
- Hard dependencies：V02.3, V03.3, V05.3, V06.3
- 目的：建立 command_id、event_id、payload hash、simulation/real timestamps、append-only event store。
- Exit gate：同ID异payload拒绝；历史 event 不 UPDATE/DELETE。

### V07.2｜Receipts/Outbox/Idempotency
- 执行模式：`NORMAL`
- Hard dependencies：V07.1
- 目的：实现 accepted/executed 区分、consumer receipt、outbox 和重复消息去重。
- Exit gate：重复命令/事件无重复经济效果；通知可重投。

### V07.3｜Replay、Seed 与版本绑定
- 执行模式：`NORMAL`
- Hard dependencies：V07.2
- 目的：建立 deterministic replay、seeded RNG、engine/model/registry version 绑定和 hash 比较。
- Exit gate：相同 snapshot+events+seed 重放一致；版本不匹配明确阻断。

## V08｜库存与金融 Posting 基础
- Stage: S1
- Work-package prerequisites: V01, V02, V03, V07

### V08.1｜库存可用/预留/在途 Ledger
- 执行模式：`NORMAL`
- Hard dependencies：V01.3, V02.3, V03.3, V07.3
- 目的：实现 commodity stock buckets、reservation、release、shipment/transit interface。
- Exit gate：同库存不双占；物理 stock 默认不负。

### V08.2｜金融 Accounts/Postings 基础
- 执行模式：`NORMAL`
- Hard dependencies：V08.1
- 目的：实现账户、双边/多边 balanced posting、币种、债权债务接口。
- Exit gate：每笔 posting 平衡；cash/asset/liability 不单边变化。

### V08.3｜期初 Seed/Reconciliation Contract
- 执行模式：`NORMAL`
- Hard dependencies：V08.2
- 目的：建立 opening balance/source provenance、库存和金融 reconcile 工具。
- Exit gate：测试 seed 有对手项；snapshot 不成为唯一事实源。

## V09｜单世界 Writer、原子提交与故障恢复
- Stage: S1
- Work-package prerequisites: V02, V07, V08

### V09.1｜单 World Lease 与 Fencing
- 执行模式：`NORMAL`
- Hard dependencies：V02.3, V07.3, V08.3
- 目的：实现 logical single writer、lease renewal、fencing token 与 stale writer 拒绝。
- Exit gate：过期 writer 无法 commit。

### V09.2｜候选状态与原子 Commit
- 执行模式：`NORMAL`
- Hard dependencies：V09.1
- 目的：建立 private candidate/checkpoint、version recheck、经济事实+event+receipt+outbox 原子提交。
- Exit gate：commit 前崩溃无半笔，commit 后重试不双记。

### V09.3｜故障注入与恢复矩阵
- 执行模式：`NORMAL`
- Hard dependencies：V09.2
- 目的：测试 lease 过期、旧版本、DB/worker crash、通知中断、checkpoint 恢复。
- Exit gate：故障后 authoritative state 可恢复且可重放。

## V10｜真实读投影与双国交易纵向切片
- Stage: S1
- Work-package prerequisites: V05, V06, V07, V08, V09

### V10.1｜双国 Fixture 与授权 Read Projection
- 执行模式：`NORMAL`
- Hard dependencies：V05.3, V06.3, V07.3, V08.3, V09.3
- 目的：建立最薄 2-country world、Office 页面、真实 summary/receipt read model。
- Exit gate：页面不显示 hash/demo actual；权限投影一致。

### V10.2｜交易 Command/Approval/Reservation
- 执行模式：`NORMAL`
- Hard dependencies：V10.1
- 目的：实现一组批准的结构化商品交易，从命令到审批再到库存预留。
- Exit gate：没货/错权限/陈旧版本/重复命令 fail closed。

### V10.3｜Shipment/Delivery/Payment 原子结算
- 执行模式：`NORMAL`
- Hard dependencies：V10.2
- 目的：实现发货、在途、到货、买卖双方支付与必要分录。
- Exit gate：货物与资金双边对称；交付前不可作为 buyer 可用库存。

### V10.4｜浏览器 E2E、并发、重试与崩溃验收
- 执行模式：`NORMAL`
- Hard dependencies：V10.3
- 目的：跑两国两Office真实 E2E、并发双卖、重复提交、断线刷新和 crash/recovery。
- Exit gate：V10 只在成功/失败路径均通过后 VERIFIED；不得声称完整 E16。

## V11｜E02 人口与 E03 劳动力工资
- Stage: S2
- Work-package prerequisites: V03, V06, V08, V09

### V11.1｜E02 Population Stocks/Flows
- 执行模式：`NORMAL`
- Hard dependencies：V03.3, V06.3, V08.3, V09.3
- 目的：实现 cohort/家庭、出生死亡、双边 migration 与人口恒等。
- Exit gate：Population_t 恒等闭合；迁移双边一致。

### V11.2｜E03 Labour/Skill/Jobs/Wages
- 执行模式：`NORMAL`
- Hard dependencies：V11.1
- 目的：实现参与、技能、vacancy、job matching、工资与公共部门占用。
- Exit gate：劳动力来自人口；同一人不能重复全额占用。

### V11.3｜人口劳动跨引擎 Invariant
- 执行模式：`NORMAL`
- Hard dependencies：V11.2
- 目的：核对 skill handoff、就业分母、迁移与期初/滞后供给。
- Exit gate：无 instant labour/skill creation；读取时点符合 ADR。

## V12｜E08 完整资源及库存
- Stage: S2
- Work-package prerequisites: V08, V09, V11

### V12.1｜地质资源五层与 Exploration
- 执行模式：`NORMAL`
- Hard dependencies：V08.3, V09.3, V11.3
- 目的：实现 geological→undiscovered/discovered→recoverable→developed→extracted 层级。
- Exit gate：探索只转移 pool，不增加 geological total。

### V12.2｜开发/开采/储备/损耗
- 执行模式：`NORMAL`
- Hard dependencies：V12.1
- 目的：实现 development、extraction、strategic reserve、losses 与库存接口。
- Exit gate：E08/E10 不双采；reserve 不能被自由消费。

### V12.3｜资源 Reconciliation 与 Stress
- 执行模式：`NORMAL`
- Hard dependencies：V12.2
- 目的：建立 per-resource conservation、并发 reservation、极端耗尽测试。
- Exit gate：Initial endowment 永不增加；每单位流可追溯。

## V13｜E09 能源与 E10 生产
- Stage: S2
- Work-package prerequisites: V03, V11, V12

### V13.1｜E09 Energy Generation/Allocation
- 执行模式：`NORMAL`
- Hard dependencies：V03.3, V11.3, V12.3
- 目的：实现 MW/MWh、燃料、grid/storage、allocation、shortage。
- Exit gate：缺能真实限制下游；MW/MWh 不混用。

### V13.2｜E10 12-Sector Production
- 执行模式：`NORMAL`
- Hard dependencies：V13.1
- 目的：实现 installed capacity、inputs、labour、energy、logistics bottleneck 与实际扣料。
- Exit gate：检查投入后必须消费；产出只记一次。

### V13.3｜实体经济 Bottleneck/Reconciliation
- 执行模式：`NORMAL`
- Hard dependencies：V13.2
- 目的：联合测试资源→能源→生产、物流和 value-added 分类。
- Exit gate：不 silent 造粮/物料；参数显式且可测试。

## V14｜E11 技术及 E12 项目全生命周期
- Stage: S2
- Work-package prerequisites: V05, V06, V08, V11, V12, V13

### V14.1｜E11 Technology Rights/R&D
- 执行模式：`NORMAL`
- Hard dependencies：V05.3, V06.3, V08.3, V11.3, V12.3, V13.3
- 目的：实现 MASTERED/LICENSED/TRANSFER/JOINT/RESTRICTED、R&D 进度与约束。
- Exit gate：Licence≠Mastery；R&D 不直接加产能。

### V14.2｜E12 Project Lifecycle
- 执行模式：`NORMAL`
- Hard dependencies：V14.1
- 目的：实现融资、审批、材料、劳动、技术、施工、commissioning 的38项目流程。
- Exit gate：批准/付款不等 capacity；施工消耗真实材料劳动。

### V14.3｜Facility Handoff 与项目 Invariant
- 执行模式：`NORMAL`
- Hard dependencies：V14.2
- 目的：定义项目完工向设施/产能 owner 的唯一交接和建设账户。
- Exit gate：capacity 单一 owner；施工/GDP 不重复。

## V15｜E04 教育及 E05 医疗
- Stage: S2
- Work-package prerequisites: V06, V08, V11, V14

### V15.1｜E04 Education
- 执行模式：`NORMAL`
- Hard dependencies：V06.3, V08.3, V11.3, V14.3
- 目的：实现 teachers/seats/enrollment/duration/graduates/training 与 skill handoff。
- Exit gate：无教师/座位不能凭预算生毕业生。

### V15.2｜E05 Healthcare
- 执行模式：`NORMAL`
- Hard dependencies：V15.1
- 目的：实现 staff/beds/supplies/delivered care/backlog 与采购/设施接口。
- Exit gate：无医药/人员形成 unmet demand，而非 health buff。

### V15.3｜公共服务 Staffing/Material Invariant
- 执行模式：`NORMAL`
- Hard dependencies：V15.2
- 目的：联合核对人员占用、预算支付、设施与服务产出。
- Exit gate：同一人员不双占；服务与真实 capacity/inputs 绑定。

## V16｜E06 住房及 E07 治安
- Stage: S2
- Work-package prerequisites: V06, V08, V11, V14

### V16.1｜E06 Housing
- 执行模式：`NORMAL`
- Hard dependencies：V06.3, V08.3, V11.3, V14.3
- 目的：实现 units/occupancy/gap/rent、补贴与统一 Project 请求。
- Exit gate：补贴不直接增加住房；新增 unit 来自 commission。

### V16.2｜E07 Public Safety
- 执行模式：`NORMAL`
- Hard dependencies：V16.1
- 目的：实现 personnel/deployment/incidents/backlog 与紧急措施。
- Exit gate：支出不直接 stability buff；人员和事件有真实状态。

### V16.3｜住房治安权限与应急 Invariant
- 执行模式：`NORMAL`
- Hard dependencies：V16.2
- 目的：测试迁移/人口影响、过期授权、项目/人员交接。
- Exit gate：失效 emergency authority 不能执行；住房/治安无 hidden buff。

## V17｜E13 家庭、需求与国内供给闭合
- Stage: S2
- Work-package prerequisites: V11, V13, V15, V16

### V17.1｜Household Income/Cash
- 执行模式：`NORMAL`
- Hard dependencies：V11.3, V13.3, V15.3, V16.3
- 目的：实现 wages、tax、transfer、debt service、已到账收入与账户读取。
- Exit gate：未到账福利不能消费；bank deposit 不复制成第二真相。

### V17.2｜Consumption/Domestic Market
- 执行模式：`NORMAL`
- Hard dependencies：V17.1
- 目的：实现需求、成交、库存扣减、价格与短缺。
- Exit gate：消费对应真实商品/服务与支付；短缺不 clamp 后假装成交。

### V17.3｜国内供给闭合与生活成本视图
- 执行模式：`NORMAL`
- Hard dependencies：V17.2
- 目的：闭合 grain/service/construction/medical supply 方案并生成 poverty/cost views。
- Exit gate：供给来源可追溯；派生视图只读。

## V18｜E14 完整财政与 Treasury
- Stage: S3
- Work-package prerequisites: V05, V08, V14, V17

### V18.1｜Tax/Budget/Treasury
- 执行模式：`NORMAL`
- Hard dependencies：V05.3, V08.3, V14.3, V17.3
- 目的：实现税收、credits、预算、commitment、TGA cash 与 payment priority。
- Exit gate：没钱形成 arrear/delay/default，不假装 paid。

### V18.2｜Debt/Guarantee/SOE
- 执行模式：`NORMAL`
- Hard dependencies：V18.1
- 目的：实现债券认购、coupon/principal、担保、或有负债、SOE equity/dividend/asset sale。
- Exit gate：发行不等现金到账；担保 call 与付款时点分开。

### V18.3｜Finance Office 与财政 Reconciliation
- 执行模式：`NORMAL`
- Hard dependencies：V18.2
- 目的：接入 Finance commands、forecast inputs、Treasury ledger 和权限/审批。
- Exit gate：transfer 不计 G；Finance 不越权选工程设计。

## V19｜E15 完整银行央行
- Stage: S3
- Work-package prerequisites: V05, V08, V13, V17

### V19.1｜Commercial Bank Ledger
- 执行模式：`NORMAL`
- Hard dependencies：V05.3, V08.3, V13.3, V17.3
- 目的：实现 loan origination/repayment、deposit、NPL 与资产负债表。
- Exit gate：贷款同时增 loan asset+deposit liability；还款对应销毁/转移。

### V19.2｜Central Bank Tools/Monetary
- 执行模式：`NORMAL`
- Hard dependencies：V19.1
- 目的：实现 policy rate、OMO、reserve/capital/CCyB、refinancing/ELA/collateral。
- Exit gate：CB posting 平衡；M1/M2 只从账本派生。

### V19.3｜Liquidity/Solvency 与工具失败测试
- 执行模式：`NORMAL`
- Hard dependencies：V19.2
- 目的：区分 liquidity vs solvency，测试 ELA、NPL、collateral、期限利息。
- Exit gate：流动性援助不抹负权益；每个工具有失败路径。

## V20｜E17 外汇与国际金融
- Stage: S3
- Work-package prerequisites: V08, V18, V19

### V20.1｜LC/GCU FX Core
- 执行模式：`NORMAL`
- Hard dependencies：V08.3, V18.3, V19.3
- 目的：实现每国 LC/GCU authoritative rate、转换、valuation time 和统一 rounding。
- Exit gate：不建 70x69 权威 pair matrix。

### V20.2｜External Finance/Capital/Intervention
- 执行模式：`NORMAL`
- Hard dependencies：V20.1
- 目的：实现私营换汇、资本流、外债、income repatriation、official intervention/sterilization。
- Exit gate：私人进口不直接扣官方外储；外债双边一致。

### V20.3｜历史成交与 FX Reconciliation
- 执行模式：`NORMAL`
- Hard dependencies：V20.2
- 目的：锁定历史成交汇率，区分 cash settlement 与 revaluation。
- Exit gate：不使用 current FX 重写历史现金。

## V21｜E16 完整现货、海关与物流
- Stage: S3
- Work-package prerequisites: V10, V12, V13, V18, V20

### V21.1｜Global Order Book
- 执行模式：`NORMAL`
- Hard dependencies：V10.4, V12.3, V13.3, V18.3, V20.3
- 目的：实现12商品限价、价格时间优先、partial fill/cancel 和确定性撮合。
- Exit gate：相同订单序列可重放；库存预留不重复。

### V21.2｜Tariff/Customs/Shipment
- 执行模式：`NORMAL`
- Hard dependencies：V21.1
- 目的：实现单一 tariff resolver、quota/ban/sanction、海关、shipment/transit/delivery/loss。
- Exit gate：X/M 只在批准确认时点；关税只入账一次。

### V21.3｜Logistics Bottleneck 与贸易 Replay
- 执行模式：`NORMAL`
- Hard dependencies：V21.2
- 目的：接 port/rail/storage throughput、部分交付、到期/失败及 replay。
- Exit gate：合同不能绕过基础设施容量；在途不提前可用。

## V22｜E16 全部国际合同与专项执行器
- Stage: S3
- Work-package prerequisites: V14, V18, V19, V20, V21

### V22.1｜Contract Kernel 与23 Subtype Coverage
- 执行模式：`NORMAL`
- Hard dependencies：V14.3, V18.3, V19.3, V20.3, V21.3
- 目的：实现谈判/版本/审批/active/suspend/default/dispute 统一内核和23 subtype matrix。
- Exit gate：counteroffer 新版本使旧审批失效；free text 不直接改经济。

### V22.2｜国际执行器 A：商品/资本/融资/资源
- 执行模式：`NORMAL`
- Hard dependencies：V22.1
- 目的：实现 commodity agreements、FDI、sovereign loan、infrastructure finance、resource development 等真实 flows。
- Exit gate：每类都有 cash/goods/asset/liability/ownership 结果和失败边界。

### V22.3｜国际执行器 B：技术/条约/援助/招标/争端
- 执行模式：`NORMAL`
- Hard dependencies：V22.2
- 目的：实现 technology licence/joint project/FTA-swap/sanction/aid/tender/dispute 等并跑全覆盖测试。
- Exit gate：23类型逐条有证据；共同 kernel 不冒充 subtype 已实现。

## V23｜E18 国民账户、风险与评分
- Stage: S3
- Work-package prerequisites: V13, V14, V15, V16, V17, V18, V19, V20, V21, V22

### V23.1｜Production GDP Authority
- 执行模式：`NORMAL`
- Hard dependencies：V13.3, V14.3, V15.3, V16.3, V17.3, V18.3, V19.3, V20.3, V21.3, V22.3
- 目的：实现 sector value added + product taxes/subsidies 的唯一权威 GDP 口径。
- Exit gate：其他页面/Engine 不维护第二 GDP。

### V23.2｜Expenditure/BOP/CPI Reconciliation
- 执行模式：`NORMAL`
- Hard dependencies：V23.1
- 目的：实现 C+I+G+X-M 核对、current account、固定 basket CPI 与可加总贡献。
- Exit gate：两 GDP 不一致报错；transfer/intermediate/construction 不双算。

### V23.3｜Risk/Score 与总账户验收
- 执行模式：`NORMAL`
- Hard dependencies：V23.2
- 目的：实现 risk/scoring read-only、账户错误隔离、机制解释与正式 score version。
- Exit gate：score 不回写经济；CPI贡献和 headline reconcile。

## V24｜Captain 治理及因果危机 Admin
- Stage: S3
- Work-package prerequisites: V05, V06, V14, V18, V19, V22, V23

### V24.1｜Captain Strategy/Governance
- 执行模式：`NORMAL`
- Hard dependencies：V05.3, V06.3, V14.3, V18.3, V19.3, V22.3, V23.3
- 目的：实现 strategy/priority/agenda/proposal、political capital、commitment、cabinet coordination。
- Exit gate：Captain 不直接写财政/货币/生产权威状态。

### V24.2｜Crisis/Admin Cause-Layer Composer
- 执行模式：`NORMAL`
- Hard dependencies：V24.1
- 目的：实现 shock cause layer、crisis start/end、合法 pause/resume 与审批。
- Exit gate：Admin 不 set GDP/inflation/score；危机从原因传导。

### V24.3｜Brief/Conflict/Expiry Tests
- 执行模式：`NORMAL`
- Hard dependencies：V24.2
- 目的：实现 classified briefs、政策冲突检测、责任日志和临时权力到期。
- Exit gate：机密权限正确；临时权力按规则失效。

## V25｜六 Office 完整 UI 与地图行动覆盖
- Stage: S4
- Work-package prerequisites: V05, V10, V14, V15, V16, V17, V18, V19, V20, V21, V22, V23, V24

### V25.1｜地图技术试验与授权可视化壳
- 执行模式：`PARALLEL_PREPARATION`
- Hard dependencies：V00.3, V01.3, V03.3
- 目的：验证 Vite+MapLibre+deck.gl+PMTiles/MVT/动态GeoJSON 的 build/runtime/降级；仅消费授权投影。
- Exit gate：地图失败不影响核心功能；地图不成为 Source of Truth；可在核心 UI 前平行准备。

### V25.2｜六 Office 完整动作与真实报表接线
- 执行模式：`NORMAL`
- Hard dependencies：V05.3, V10.4, V14.3, V15.3, V16.3, V17.3, V18.3, V19.3, V20.3, V21.3, V22.3, V23.3, V24.3, V25.1
- 目的：按六份规范将所有正式动作接 command→approval→ledger/event→read model，补列表/表单/图表。
- Exit gate：无假按钮/假 actual/假榜单；每动作有成功失败回执。

### V25.3｜产品 E2E、可访问性与小屏验收
- 执行模式：`NORMAL`
- Hard dependencies：V25.2
- 目的：跑跨Office E2E、权限、loading/empty/error、键盘/小屏和 map/table fallback。
- Exit gate：未实现动作明确不可用并说明原因；forecast 与 actual 分离。

## V26｜预测、可解释性、Realtime 与断线恢复
- Stage: S4
- Work-package prerequisites: V07, V10, V17, V20, V23, V25

### V26.1｜Forecast Worker/Comlink 非权威协议
- 执行模式：`PARALLEL_PREPARATION`
- Hard dependencies：V03.3, V07.3, V10.4
- 目的：建立浏览器 Web Worker/Comlink、可取消任务、snapshot contract 和 stale result discard；不写 actual。
- Exit gate：缺输入时明确假设/不可用；不能读取无权秘密。

### V26.2｜Realtime/Cache/Reconnect
- 执行模式：`NORMAL`
- Hard dependencies：V07.3, V10.4, V17.3, V20.3, V23.3, V25.3, V26.1
- 目的：实现 private channel/outbox 消费、versioned IndexedDB/cache、断线重连/乱序/重复处理。
- Exit gate：状态不倒退；scope/model/version 进入 cache key；权限撤销清缓存。

### V26.3｜多政策 Forecast 与 Explanation
- 执行模式：`NORMAL`
- Hard dependencies：V26.2
- 目的：接完整可用模型的组合预测、账户贡献与机制链、限流/请求合并。
- Exit gate：预测不消耗正式 RNG 序列、不回写 actual；贡献与机制叙述不混淆。

## V27｜70 国初态、校准与无人国家控制
- Stage: S4
- Work-package prerequisites: V11, V12, V13, V14, V15, V16, V17, V18, V19, V20, V22, V23

### V27.1｜70国 Seed Schema/Provenance
- 执行模式：`NORMAL`
- Hard dependencies：V11.3, V12.3, V13.3, V14.3, V15.3, V16.3, V17.3, V18.3, V19.3, V20.3, V22.3, V23.3
- 目的：定义70国期初人口、资源、设施、技术、账户、贸易依赖的来源/假设 schema。
- Exit gate：地区/虚构参数标设计假设；旧0-100指数不直接变真实单位。

### V27.2｜70国生成/校准/闭合
- 执行模式：`NORMAL`
- Hard dependencies：V27.1
- 目的：生成并核对70国 opening balance、地质、facility/staffing、供应链差异。
- Exit gate：全部期初账与硬约束闭合；archetype 不持续 buff。

### V27.3｜无人国家 NPC Controller
- 执行模式：`NORMAL`
- Hard dependencies：V27.2
- 目的：实现默认国家控制器通过同一 command/approval/funding/inventory 规则行动。
- Exit gate：NPC 不无限资源/自动接单；可重放并受预算库存约束。

## V28｜两种 Orchestrator 与主站迁移桥
- Stage: S4
- Work-package prerequisites: V05, V10, V23, V25, V26, V27

### V28.1｜World/Season Orchestrator 配置
- 执行模式：`NORMAL`
- Hard dependencies：V05.3, V10.4, V23.3, V25.3, V26.3, V27.3
- 目的：实现 shared core 上的普通 World 与 Season 配置、时间/参与/截止差异。
- Exit gate：相同物理输入与事件产生相同 core 结果。

### V28.2｜主站身份/路由/登录桥
- 执行模式：`NORMAL`
- Hard dependencies：V28.1
- 目的：接主站入口、shared identity/team、跨origin/session策略和版本契约。
- Exit gate：长期token不进URL；真实登录/刷新/退出/撤销测试。

### V28.3｜Legacy 保留与迁移回归
- 执行模式：`NORMAL`
- Hard dependencies：V28.2
- 目的：实现旧世界历史读取/继续运行策略、clean seed、route/model compatibility。
- Exit gate：V2不写旧世界；旧链接不静默失效；不从抽象指数猜真实量。

## V29｜完整功能验证、经济校准与持续运行
- Stage: S5
- Work-package prerequisites: V22, V23, V24, V25, V26, V27, V28

### V29.1｜全需求证据链与缺口审计
- 执行模式：`NORMAL`
- Hard dependencies：V22.3, V23.3, V24.3, V25.3, V26.3, V27.3, V28.3
- 目的：将原规范动作/参数/失败/通知映射到代码、测试和状态。
- Exit gate：未验证不标完成；无静默延期 scope。

### V29.2｜70国×600日与1000日长跑
- 执行模式：`NORMAL`
- Hard dependencies：V29.1
- 目的：运行非空转正式周期和长跑，注入动作、危机、到期、短缺、违约。
- Exit gate：硬守恒/账本无未解释违规；合法危机不误判 bug。

### V29.3｜校准/重放/最小复现
- 执行模式：`NORMAL`
- Hard dependencies：V29.2
- 目的：输出 parameter provenance、固定 seed replay hash、异常最小复现和模型局限。
- Exit gate：相同版本+seed重放一致；经济合理性与程序正确性分报告。

## V30｜性能、安全与数据库恢复联合验收
- Stage: S5
- Work-package prerequisites: V02, V09, V26, V28, V29

### V30.1｜50/100/420会话负载模型与 Harness
- 执行模式：`NORMAL`
- Hard dependencies：V02.3, V09.3, V26.3, V28.3, V29.3
- 目的：定义真实操作频率、订单/合同/到期风暴/forecast 场景并运行分档测试。
- Exit gate：披露机器/套餐/版本/负载；记录 P50/P95/P99 与资源。

### V30.2｜Security/RLS/Attack 联合验收
- 执行模式：`NORMAL`
- Hard dependencies：V30.1
- 目的：跑真实DB权限、classified、office/country/season、攻击面、service-role 边界负例。
- Exit gate：错误身份无法读写；高权限路径显式鉴权。

### V30.3｜Worker/DB/Backup Failure Recovery
- 执行模式：`NORMAL`
- Hard dependencies：V30.2
- 目的：演练 worker crash、lease/fencing、DB恢复、snapshot/ledger replay、备份恢复。
- Exit gate：重复消息不双记；实际 restore 成功并记录 RPO/RTO。

### V30.4｜共享DB影响、SLO与容量签字
- 执行模式：`NORMAL`
- Hard dependencies：V30.3
- 目的：在共享主站关键流程下验证世界负载影响，形成 SLO/容量/扩容结论。
- Exit gate：主站不超批准预算；SLO不过则不开放正式规模。

## V31｜发布候选、灰度和生产切换
- Stage: S6
- Work-package prerequisites: V29, V30

### V31.1｜Release Manifest 与版本冻结
- 执行模式：`NORMAL`
- Hard dependencies：V29.3, V30.4
- 目的：冻结 code/model/registry/scoring/seed、兼容区间、migration artifact 和 kill switch。
- Exit gate：无 P0/P1 未决发布 blocker；版本可追踪。

### V31.2｜Staging Migration Rehearsal 与灰度
- 执行模式：`NORMAL`
- Hard dependencies：V31.1
- 目的：按唯一发布链在 staging 演练迁移、内部world/canary、回退/forward-fix。
- Exit gate：API/DB 先兼容再前端；灰度有真实观测。

### V31.3｜生产切换与主站入口
- 执行模式：`NORMAL`
- Hard dependencies：V31.2
- 目的：执行批准的生产发布、主站路由切换、监控和 rollback/kill-switch 演练。
- Exit gate：新旧世界各自单writer；UI回退不抹已接受经济事实。

## V32｜开赛、结束、归档与运营移交
- Stage: S6
- Work-package prerequisites: V31

### V32.1｜开赛/加入/认领/暂停 Runbook
- 执行模式：`NORMAL`
- Hard dependencies：V31.3
- 目的：完成 join/claim/start/pause/resume、管理员和玩家操作手册及权限演练。
- Exit gate：正式开赛路径可重复执行且有审计。

### V32.2｜季末结算与归档
- 执行模式：`NORMAL`
- Hard dependencies：V32.1
- 目的：实现 end cutoff、到期事项结算、未到期债务/在途/许可保留、archive/export。
- Exit gate：未到期义务不清零；结果可追溯到 ledger/events。

### V32.3｜运营移交与未完成声明
- 执行模式：`NORMAL`
- Hard dependencies：V32.2
- 目的：交付告警/值班/响应、48–72h监测、升级 forward-fix、最终 scope 状态。
- Exit gate：RC 不冒充 full release；负责人和剩余风险明确。
