# MASTER｜原始规范文本索引

原文件：`EconMind_Season1_70_Country_World_Engine_Master_Specification.docx`
本文件为段落/表格顺序提取，未修改规则，未协调矛盾；图像、批注、页眉页脚与版式以原Word为准。锚点仅供回查，不代表独立需求条数。

### MASTER-U0001
EconMind OS Season 1

### MASTER-U0002
70-Country World Engine Master Specification

### MASTER-U0003
70 国世界统一底层逻辑、18 Engine、10× Simulation Time 与跨系统结算总规范

### MASTER-U0004
最高级架构原则 / 六个 Office 不是六套模型。70 个国家也不是 70 套互不相干的 simulation。Season 1 只有一个 WorldState、一个 Simulation Clock、一个 Event Ledger、一个全球经济网络和一套 Source of Truth。六个 Office 只是操作同一 CountryState 的不同 Controller。

### MASTER-U0005
项目 | 固定定义

### MASTER-U0006
正式 Season 时间倍率 | 10×。1 real second = 10 simulation seconds；1 real day = 10 simulation days。

### MASTER-U0007
Simulation Day | 24 simulation hours = 2 hours 24 minutes real time。

### MASTER-U0008
Simulation Year | 360 simulation days = 36 real days，用于利息、年率与年度统计。

### MASTER-U0009
两个月正式 Season | 60 real days ≈ 600 simulation days ≈ 1.667 simulation years。

### MASTER-U0010
国家数量 | 设计上限 70 个同时存在的 CountryState，所有国家共享同一 GlobalState。

### MASTER-U0011
Office | Captain / Central Bank / Finance / Trade / Industry / Social 六个永久 Office。

### MASTER-U0012
Engine 数量 | 18 个共享 Engine + Cross-Cutting Governance / Permission / Ledger Kernel。

### MASTER-U0013
经济表示 | Stock / Flow / Price-Rate / Rule-Right-Obligation / Derived Indicator。

### MASTER-U0014
文档用途 | 产品、经济引擎、数据库、权限、前端、Codex 实现和测试的最高级规范。

### MASTER-U0015
0. 规范来源、范围与优先级

### MASTER-U0016
本文件整合六份 Season 1 最终 Office 规范：Country Captain、Central Bank Governor、Minister of Finance & Economy、Trade & Foreign Affairs Minister、Minister of Industry, Technology & Resources、Minister of Labour, Education & Social Development。Office 文档定义“谁能操作什么”；本文件定义“世界如何计算、状态如何守恒、不同 Office 的动作如何进入同一底层世界”。

### MASTER-U0017
冲突处理优先级 / 若 Office 规范中的局部公式、字段或时间描述与本文件的 World Engine 规则冲突，正式 Season 的底层计算以本文件为 Source of Truth；Office 前端仍保留其权限和信息优势，但只能读写本文件定义的实体与事件。

### MASTER-U0018
0.1 六个 Controller 与 World Engine 的关系

### MASTER-U0019
Office | Controller | 允许写入的世界领域

### MASTER-U0020
Country Captain | GovernanceController | Strategy、Priority、Cabinet Agenda、Major Approval、Political Capital、Commitment、Crisis Command

### MASTER-U0021
Central Bank Governor | MonetaryController | Policy Rate、OMO、Reserve Requirement、Capital Regulation、Refinancing、ELA、FX Intervention、Official Reserves

### MASTER-U0022
Finance & Economy | FiscalController | Treasury、Tax、Budget、Debt、Guarantee、Project Financing、Fiscal Risk

### MASTER-U0023
Trade & Foreign Affairs | ExternalController | Global Market、Tariff、Quota、Contract、FDI、Technology Deal、Treaty、Sanction、Aid

### MASTER-U0024
Industry, Technology & Resources | ProductiveController | Resources、Production、Energy、Technology、Projects、Infrastructure、Strategic Reserves

### MASTER-U0025
Labour, Education & Social Development | HumanSystemController | Population、Labour、Education、Healthcare、Migration、Welfare、Housing、Public Safety

### MASTER-U0026
0.2 Cross-Cutting Kernel

### MASTER-U0027
Kernel | 职责

### MASTER-U0028
Governance Kernel | Strategy、National Priority、Cabinet Agenda、Proposal、Approval、Political Capital、Executive Directive、Commitment、Crisis Command。

### MASTER-U0029
Permission Kernel | RoleAssignment many-to-many；同一玩家兼任多个 Office 时仍产生独立 Office approval 和 actor_office。

### MASTER-U0030
Event Kernel | 所有正式动作生成 Event；Event 产生 Transaction / Rule Change / Scheduled Obligation。

### MASTER-U0031
Ledger Kernel | 货币、库存、债务、合同、所有权、项目、人口和公共服务状态变化均可追溯。

### MASTER-U0032
Validation Kernel | 守恒、余额、权限、资源、库存、期限、审批、技术前置、劳动力等硬约束。

### MASTER-U0033
Notification Kernel | 由 Engine 产生具体对象级通知，不允许只产生抽象“压力高”。

### MASTER-U0034
目录 / Contents

### MASTER-U0035
Part I 世界物理定律与 10× 时间系统

### MASTER-U0036
1. 世界状态与 Source of Truth

### MASTER-U0037
2. 10× Simulation Clock

### MASTER-U0038
3. 五类变量与守恒规则

### MASTER-U0039
4. 70 国初始化与结构差异

### MASTER-U0040
5. Cross-Engine Settlement Pipeline

### MASTER-U0041
6. Governance / Permission / Approval Kernel

### MASTER-U0042
Engine 01 Time & Event Engine

### MASTER-U0043
Engine 02 Population Engine

### MASTER-U0044
Engine 03 Labour & Wage Engine

### MASTER-U0045
Engine 04 Education & Human Capital Engine

### MASTER-U0046
Engine 05 Healthcare Engine

### MASTER-U0047
Engine 06 Housing Engine

### MASTER-U0048
Engine 07 Public Safety Engine

### MASTER-U0049
Engine 08 Resource & Inventory Engine

### MASTER-U0050
Engine 09 Energy Engine

### MASTER-U0051
Engine 10 Production Engine

### MASTER-U0052
Engine 11 Technology & R&D Engine

### MASTER-U0053
Engine 12 Project & Infrastructure Engine

### MASTER-U0054
Engine 13 Household & Demand Engine

### MASTER-U0055
Engine 14 Fiscal & Treasury Engine

### MASTER-U0056
Engine 15 Banking & Monetary Engine

### MASTER-U0057
Engine 16 Trade, Contract & Global Market Engine

### MASTER-U0058
Engine 17 FX & International Finance Engine

### MASTER-U0059
Engine 18 National Accounts, Risk & Scoring Engine

### MASTER-U0060
Part III 世界级互锁规则

### MASTER-U0061
7. 经济主体与部门账户

### MASTER-U0062
8. 全球市场、跨境传播与 70 国网络

### MASTER-U0063
9. Shock Engine 与 Admin Crisis Composer

### MASTER-U0064
10. Source of Truth 总表

### MASTER-U0065
11. 全局事件目录

### MASTER-U0066
12. 数据一致性、重算与错误处理

### MASTER-U0067
13. 前端世界层操作与可见性

### MASTER-U0068
14. 工程验收总 Checklist

### MASTER-U0069
附录 A 固定商品/生产/技术/项目目录

### MASTER-U0070
附录 B 10× 时间换算与标准期限

### MASTER-U0071
附录 C Cross-Engine Dependency Matrix

### MASTER-U0072
附录 D Office × Engine 权限矩阵

### MASTER-U0073
Part I · 世界物理定律与 10× 时间系统

### MASTER-U0074
1. 世界状态与 Source of Truth

### MASTER-U0075
WorldState / WorldState = GlobalState + Σ CountryState[c=1..70] + CrossBorderNetwork + ImmutableEventLedger

### MASTER-U0076
对象 | 完整范围

### MASTER-U0077
GlobalState | simulation_clock、GCU、global commodity books/prices、global technology network、global shocks、season config、ranking config

### MASTER-U0078
CountryState | 人口、人力、教育、医疗、住房、治安、资源、库存、能源、生产、技术、项目、家庭、财政、银行、央行、FX、外贸、治理状态

### MASTER-U0079
CrossBorderNetwork | shipment、payment、contract、FDI、loan、ownership、technology rights、talent flows、treaty、sanction、aid、joint projects

### MASTER-U0080
ImmutableEventLedger | 所有正式动作和系统结算的 append-only 事件流；Correction 必须新增反向/修正事件，不回写历史

### MASTER-U0081
最高级 Source of Truth 规则 / 同一经济对象只能存在一个权威 Engine。Office 页面、Captain Brief、League 排名、报表和 API 都读取同一权威值。禁止 GDP、Debt、Reserves、Employment、Inventory、Project Progress 等在不同模块重复计算。

### MASTER-U0082
2. 10× Simulation Clock

### MASTER-U0083
时间映射 / simulation_timestamp = season_start_sim + (real_timestamp - season_start_real) × 10

### MASTER-U0084
现实时间 | 模拟时间

### MASTER-U0085
1 real second | 10 simulation seconds

### MASTER-U0086
1 real minute | 10 simulation minutes

### MASTER-U0087
6 real minutes | 1 simulation hour

### MASTER-U0088
36 real minutes | 6 simulation hours

### MASTER-U0089
2h 24m real | 1 simulation day

### MASTER-U0090
12 real hours | 5 simulation days

### MASTER-U0091
1 real day | 10 simulation days

### MASTER-U0092
3.6 real days | 36 simulation days

### MASTER-U0093
36 real days | 360 simulation days = 1 simulation year

### MASTER-U0094
60 real days | 600 simulation days = 1.667 simulation years

### MASTER-U0095
2.1 玩家可见时间规则

### MASTER-U0096
玩家界面显示 Simulation Date / Time，并明确标注 10×。不显示 Round、Stage、Tick 或固定回合倒计时。

### MASTER-U0097
所有合同、债券、项目、培训、教育、研发、福利、移民、许可证、建设与危机期限均保存 simulation_timestamp 或 simulation_days。

### MASTER-U0098
玩家可在任意现实时间提交动作；系统把动作映射到精确 simulation_timestamp。

### MASTER-U0099
正式 Season 固定 10×，普通玩家无暂停、加速、减速权限。

### MASTER-U0100
管理员仅在技术事故、数据恢复或正式裁定情况下使用 Global Pause / Resume；Pause 期间 simulation_clock 冻结，现实时间不累计。

### MASTER-U0101
测试环境可配置 time_multiplier，但正式 Season 的 multiplier 锁定为 10。

### MASTER-U0102
2.2 后台结算节奏

### MASTER-U0103
类型 | 现实频率 | 职责

### MASTER-U0104
Immediate Event | 实时 | Policy Rate、Tariff Rule、Order Placement、Contract Signature、Approval、Project Decision、Programme Rule 等规则/交易立即写入

### MASTER-U0105
Market Event | 每次 order/fill | Global Market 订单撮合和成交立即处理；Daily Benchmark 在日结时固定收盘值

### MASTER-U0106
Scheduled Event | 精确 simulation timestamp | Shipment dispatch/arrival、payment due、debt maturity、licence expiry、project milestone、cohort completion

### MASTER-U0107
6-hour Mini Settlement | 每 36 real minutes | 可选轻量缓存：订单簿摘要、FX flow aggregation、notification refresh；不得产生重复宏观结算

### MASTER-U0108
Daily Settlement | 每 2h24m real | 完整 18 Engine 有序结算；生产、消费、工资、利息、税收、公共服务、价格、国民账户、风险和评分

### MASTER-U0109
Simulation-Year Roll | 每 36 real days | 年化统计、长期率校准、年度基准重置；不重置库存/债务/项目

### MASTER-U0110
2.3 年率与计息约定

### MASTER-U0111
年率日结 / DailyInterest = OutstandingPrincipal × AnnualRate / 360

### MASTER-U0112
N 日利息 / Interest(N) = OutstandingPrincipal × AnnualRate × N / 360

### MASTER-U0113
所有 % p.a. 利率统一使用 360 simulation-day year。债务、贷款、存款、央行工具、Royalty 延迟利息和违约利息均使用同一 day-count convention，除非合同明确写入不同规则；Season 1 默认不开放自定义 day-count。

### MASTER-U0114
3. 五类变量与守恒规则

### MASTER-U0115
类别 | 定义 | 固定用途

### MASTER-U0116
Stock | 某一时点余额 | Population、Inventory、Reserves、Cash、Debt、Loans、Deposits、Capacity、Housing Units、Beds、Technology Rights

### MASTER-U0117
Flow | 一段时间发生量 | Production、Consumption、Imports、Exports、Tax、Spending、Wages、Interest、Migration、Graduates、Care Episodes

### MASTER-U0118
Price / Rate | 交换或制度价格 | Commodity Price、Wage、Rent、FX、Interest Rate、Bond Yield、Tax、Tariff、Royalty

### MASTER-U0119
Rule / Right / Obligation | 制度或合同状态 | FTA、Quota、Sanction、Technology Licence、Ownership、Guarantee、Welfare Eligibility、Migration Rights

### MASTER-U0120
Derived Indicator | 由前四类计算 | GDP、Inflation、Unemployment、Debt/GDP、Current Account、Poverty、Gini、Coverage、Crime Rate

### MASTER-U0121
世界物理定律 | 硬规则

### MASTER-U0122
L01 Commodity Conservation | Opening + Production + Delivered Imports - Domestic Use - Delivered Exports - Losses = Closing Inventory

### MASTER-U0123
L02 Geological Conservation | Initial Geological Endowment - Cumulative Extraction = Remaining Geological Resource

### MASTER-U0124
L03 Population Conservation | Previous Population + Births - Deaths + Immigration - Emigration = Current Population

### MASTER-U0125
L04 Skill Transition | 技能只能通过 Education / Training / Migration / Talent Exchange 转换或流入；不能直接设置 Skill Stock

### MASTER-U0126
L05 Balance-Sheet Identity | Central Bank Assets = Liabilities + Equity；Commercial Bank Assets = Liabilities + Equity

### MASTER-U0127
L06 Fiscal Cash Constraint | 政府付款必须有 Treasury Cash / Revenue / Debt / Loan / Asset Sale / Approved Monetary Financing；否则形成 arrears

### MASTER-U0128
L07 Production Input Constraint | Output 必须有 Capacity + Inputs + Energy + Labour + Technology + Logistics

### MASTER-U0129
L08 Project Physicality | 项目支付不直接增加 GDP buff；必须施工、消耗材料和劳动后才形成 Capital Stock / Capacity

### MASTER-U0130
L09 Technology Rights | MASTERED ≠ LICENSED；权利范围和到期必须限制实际项目资格

### MASTER-U0131
L10 Cross-border Double Entry | 国际交易同时改变买卖双方的货物/资产/负债/现金或所有权

### MASTER-U0132
L11 Official Reserve Separation | 普通私人贸易只形成 FX demand/supply，不直接扣减 Official Reserves

### MASTER-U0133
L12 Single Source of Truth | 同一状态只能由一个 Engine 权威计算

### MASTER-U0134
L13 Score One-way | Economy → Score，Score 不得反向修改 Economy

### MASTER-U0135
L14 Exact-value First | 能以金额、人数、数量、率、期限、容量表示的对象不得以 0–100 作为底层输入

### MASTER-U0136
L15 Immutable History | 历史 Event 不可覆盖；修正必须创建 Correction / Reversal Event

### MASTER-U0137
4. 70 国初始化与结构差异

### MASTER-U0138
初始化领域 | 必须完整初始化

### MASTER-U0139
Identity | country_id、name、currency_code/name/symbol、initial FX、region、time display

### MASTER-U0140
Population | population、age groups、households、labour force、skill distribution、migration baseline

### MASTER-U0141
Resources | 六类 Geological Endowment、discovered/proven/developed state、deposit locations

### MASTER-U0142
Production | 12 production sectors 的 facilities、installed/operational capacity、inventory、utilisation baseline

### MASTER-U0143
Energy | plant fleet、fuel mix、grid capacity、storage、demand profile

### MASTER-U0144
Technology | 22 项 technology state、mastered/licensed/restricted、research capacity

### MASTER-U0145
Infrastructure | port、rail、grid、digital、logistics、strategic storage capacity

### MASTER-U0146
Households | income groups、wages、deposits、consumer loans、mortgages、housing demand、consumption weights

### MASTER-U0147
Fiscal | tax schedules、Treasury cash、budget commitments、debt instruments、guarantees、SOE fiscal positions

### MASTER-U0148
Banking | loans by sector、deposits、reserves、equity、RWA、NPL、wholesale/foreign funding

### MASTER-U0149
Central Bank | balance sheet、policy rate、target、RR、capital requirements、FX reserves、facilities

### MASTER-U0150
Trade | general tariffs、bilateral overrides、quotas、contracts、FDI、treaties、sanctions、supplier shares

### MASTER-U0151
Social Services | education seats/teachers、healthcare staff/capacity、housing units、police staff、welfare caseload

### MASTER-U0152
Governance | strategy、priorities、political capital、commitments、cabinet state、credibility history seed

### MASTER-U0153
国家差异原则 / 国家差异由真实 State 差异产生，不通过“Resource Country +15”“Technology Country +20”这类 Buff。可以在生成阶段使用内部 archetype 生成参数，但玩家和引擎只看到具体 State。

### MASTER-U0154
5. Cross-Engine Settlement Pipeline

### MASTER-U0155
顺序 | 结算阶段 | 完整作用

### MASTER-U0156
01 | Execute Scheduled Events | 处理到期付款、交付、到期债务、毕业、项目节点、Licence、迁移到达和前序延迟事件

### MASTER-U0157
02 | Apply Rule Changes | 生效的税、关税、利率、配额、福利、移民和制度规则

### MASTER-U0158
03 | Population Update | 出生/死亡低频、迁移、人口状态与 household count

### MASTER-U0159
04 | Resource Extraction & Inventory | 地下资源开发、开采、库存结转

### MASTER-U0160
05 | Energy Dispatch | 燃料、发电、储能、电网和供电分配

### MASTER-U0161
06 | Production | 工业/农业/资源生产和中间品消耗

### MASTER-U0162
07 | Labour & Wage | 岗位需求、匹配、空缺、工资、失业、公共部门用工

### MASTER-U0163
08 | Education & Healthcare | 教育 cohort、毕业、医疗服务、staff/capacity constraint

### MASTER-U0164
09 | Housing & Public Safety | 住房供需、租金基础、警务事件、响应与 backlog

### MASTER-U0165
10 | Household Income & Demand | 工资、税、转移、债务服务、可支配资源、消费需求

### MASTER-U0166
11 | Domestic Market & Prices | 国内商品/服务/住房价格和库存压力

### MASTER-U0167
12 | Global Trade & Contracts | 国际订单、合同义务、关税/海关和跨国网络状态

### MASTER-U0168
13 | FX & International Finance | FX flow、汇率、资本流、FDI income、外债、官方干预

### MASTER-U0169
14 | Banking & Monetary | 贷款、存款、准备金、NPL、利息、M1/M2、资本和流动性

### MASTER-U0170
15 | Fiscal & Treasury | 税收、关税收入、政府工资/采购/福利/项目/债务支付、现金和债务

### MASTER-U0171
16 | National Accounts | GDP、CPI、Current Account、Fiscal aggregates、sector accounts 对账

### MASTER-U0172
17 | Risk & Crisis Detection | 财政、金融、供应链、社会、能源、公共服务风险识别

### MASTER-U0173
18 | Score / Notifications / Snapshots | 评分、排名、Office 通知、Daily Snapshot 和 cache

### MASTER-U0174
6. Governance / Permission / Approval Kernel

### MASTER-U0175
治理实体 | 字段/作用

### MASTER-U0176
NationalStrategy | Primary Strategy、Supporting Strategy、effective_from、change history

### MASTER-U0177
NationalPriority | Primary/Secondary Priorities、targets、owner office、review

### MASTER-U0178
CabinetAgenda | issue、lead office、support offices、target、constraint、deadline、linked package

### MASTER-U0179
Proposal | owner、required approvals、version、resource request、risk、status

### MASTER-U0180
PoliticalCapital | opening、generated、allocated、spent、closing；只参与治理动作，不进入 GDP/生产公式

### MASTER-U0181
GovernmentCommitment | statement、target、deadline、measurable outcome、fulfilment status

### MASTER-U0182
CrisisCommand | crisis_id、coordination level、offices、emergency actions、start/end

### MASTER-U0183
OfficeApproval | object_id、version、office、decision、actor、timestamp、reason

### MASTER-U0184
RoleAssignment | user_id、country_id、office_id、primary/acting、effective period

### MASTER-U0185
审批版本原则 / Approval(object, version=n) becomes invalid if material_fields change and version becomes n+1

### MASTER-U0186
Captain 的 Strategy、Priority 和 Commitment 只能改变治理目标、审批、评分基准、Political Capital 与公共承诺，不允许直接给 GDP、Productivity、Trade 或 Social 指标加 Buff。

### MASTER-U0187
Engine 01 · Time & Event Engine

### MASTER-U0188
Engine Definition / 全世界唯一 Simulation Clock、调度队列、事件顺序和暂停/恢复机制。它不计算经济结果，只决定“何时发生、先发生什么、事件是否只执行一次”。

### MASTER-U0189
A. Source of Truth 与权威状态

### MASTER-U0190
权威对象 | 定义

### MASTER-U0191
SimulationClock | season_start_real、season_start_sim、multiplier=10、current_sim_timestamp、current_sim_day

### MASTER-U0192
SeasonStatus | PREOPEN / ACTIVE / PAUSED / ENDED

### MASTER-U0193
ScheduledEvent | event_id、event_type、execute_at、priority、payload、status、idempotency_key

### MASTER-U0194
SettlementRun | sim_day、started_at、completed_at、engine checkpoints、status

### MASTER-U0195
PauseInterval | paused_real_start/end、reason、admin actor

### MASTER-U0196
该 Engine 是以下状态的唯一 Source of Truth：simulation_clock、event_queue、daily_settlement_id、season_status、time_multiplier、pause intervals、idempotency keys。

### MASTER-U0197
B. 输入

### MASTER-U0198
输入来源 | 输入

### MASTER-U0199
Admin / Season Config | start time、end time、正式 multiplier=10

### MASTER-U0200
All Engines | scheduled obligations、expiry、milestone、retry request

### MASTER-U0201
C. 输出与下游依赖

### MASTER-U0202
下游 Engine | 输出

### MASTER-U0203
All Engines | exact simulation timestamp、settlement boundary、event execution order

### MASTER-U0204
Audit Ledger | clock/pause/run records

### MASTER-U0205
D. 允许动作 / 状态转换

### MASTER-U0206
动作或系统事件 | 完整效果

### MASTER-U0207
Schedule Event | 写入唯一 execute_at，不改变经济状态

### MASTER-U0208
Cancel Pending Event | 仅允许尚未执行且业务规则允许取消的 event

### MASTER-U0209
Execute Due Event | 按 priority + execute_at + deterministic tie-breaker 只执行一次

### MASTER-U0210
Global Pause | 冻结 clock、停止 settlement 与 scheduled execution；普通玩家无权限

### MASTER-U0211
Resume | 从冻结 sim timestamp 继续，现实暂停时长不计入模拟

### MASTER-U0212
End Season | 锁定新玩家动作，执行 final settlement 和 final snapshots

### MASTER-U0213
E. 核心计算

### MASTER-U0214
计算 | 规则

### MASTER-U0215
Sim time | start_sim + active_real_elapsed × 10

### MASTER-U0216
Simulation day index | floor((sim_timestamp - season_start_sim)/24h)

### MASTER-U0217
Daily settlement interval | 2h24m real = 1 sim day

### MASTER-U0218
Simulation year | 360 sim days = 36 real days

### MASTER-U0219
Tie-break | priority → execute_at → event_id lexical / sequence

### MASTER-U0220
F. 硬约束、失败与异常

### MASTER-U0221
条件 | 处理

### MASTER-U0222
Duplicate delivery / payment | idempotency_key 阻止二次执行

### MASTER-U0223
Settlement crash | 从最后 completed engine checkpoint 重启，不重复已 committed transaction

### MASTER-U0224
Pause during scheduled due | 保持 PENDING，Resume 后立即按原 sim timestamp 顺序执行

### MASTER-U0225
Late worker | event 不因 worker 延迟改变 intended execute_at；实际处理记录 processed_at

### MASTER-U0226
Clock drift | 服务器 authoritative clock；客户端只展示，不参与计算

### MASTER-U0227
G. Office 权限映射

### MASTER-U0228
Office | 操作/只读权限

### MASTER-U0229
Captain | 只读 Simulation Clock；无调速权

### MASTER-U0230
Central Bank | 读时间用于利率/到期

### MASTER-U0231
Finance | 读时间用于税/预算/债务

### MASTER-U0232
Trade | 读时间用于合同/物流

### MASTER-U0233
Industry | 读时间用于项目/研发

### MASTER-U0234
Social | 读时间用于 cohort/福利/移民

### MASTER-U0235
Admin | Pause/Resume/technical correction；正式 multiplier 不可随意改

### MASTER-U0236
H. Audit Event

### MASTER-U0237
事件类型

### MASTER-U0238
EVENT_SCHEDULED

### MASTER-U0239
EVENT_CANCELLED

### MASTER-U0240
EVENT_EXECUTED

### MASTER-U0241
SETTLEMENT_STARTED

### MASTER-U0242
SETTLEMENT_ENGINE_COMPLETED

### MASTER-U0243
SETTLEMENT_COMPLETED

### MASTER-U0244
SEASON_PAUSED

### MASTER-U0245
SEASON_RESUMED

### MASTER-U0246
SEASON_ENDED

### MASTER-U0247
CLOCK_CORRECTION

### MASTER-U0248
I. 前端可见状态与操作

### MASTER-U0249
页面/组件 | 内容

### MASTER-U0250
Global Header | Simulation Date/Time、10× badge、Season Day、status

### MASTER-U0251
Admin Console | Pause/Resume、event queue inspection、failed events、settlement health

### MASTER-U0252
Player Deadline | 所有 due date 同时显示 simulation date 和预计 real-time countdown

### MASTER-U0253
J. 工程验收

### MASTER-U0254
□ 10× 映射无累计漂移。

### MASTER-U0255
□ 同一 ScheduledEvent 不可重复执行。

### MASTER-U0256
□ Daily Settlement 恢复机制不重复入账。

### MASTER-U0257
□ Pause 后所有期限按 simulation time 冻结。

### MASTER-U0258
□ 正式 Season 玩家不能改变倍率。

### MASTER-U0259
Engine 02 · Population Engine

### MASTER-U0260
Engine Definition / 管理 70 国人口 Stock、年龄组、家庭数与迁入迁出对人口的真实变化，为 Labour、Education、Healthcare、Housing、Fiscal 与 Social Services 提供人口基数。

### MASTER-U0261
A. Source of Truth 与权威状态

### MASTER-U0262
权威对象 | 定义

### MASTER-U0263
PopulationState | total、children_0_15、working_age_16_64、retired_65_plus

### MASTER-U0264
HouseholdState | household_count、average_household_size

### MASTER-U0265
PopulationFlow | births、deaths、immigration、emigration by sim day

### MASTER-U0266
MigrationArrival | person_count、skill/status、arrival time、destination

### MASTER-U0267
DependencyMetrics | dependency ratio，派生

### MASTER-U0268
该 Engine 是以下状态的唯一 Source of Truth：population stocks、age groups、household count、birth/death low-frequency flows、immigration/emigration booked population flows。

### MASTER-U0269
B. 输入

### MASTER-U0270
输入来源 | 输入

### MASTER-U0271
Migration Engine via Social/Trade | approved arrivals / departures

### MASTER-U0272
Healthcare | health crisis mortality modifier if enabled

### MASTER-U0273
Shock / Crisis | displacement、casualty flow when explicitly configured

### MASTER-U0274
Time Engine | daily boundary

### MASTER-U0275
C. 输出与下游依赖

### MASTER-U0276
下游 Engine | 输出

### MASTER-U0277
Labour & Wage | working-age population、migrant work status

### MASTER-U0278
Education | children/student base

### MASTER-U0279
Healthcare | population demand base

### MASTER-U0280
Housing | households and migration demand

### MASTER-U0281
Fiscal | PIT/welfare/pension population bases

### MASTER-U0282
National Accounts | per-capita denominators

### MASTER-U0283
D. 允许动作 / 状态转换

### MASTER-U0284
动作或系统事件 | 完整效果

### MASTER-U0285
Record Immigration Arrival | 增加指定人口组并创建 labour/education status

### MASTER-U0286
Record Emigration | 从可离境 stock 减少并同步 labour/household

### MASTER-U0287
Age Cohort Roll | 按简化年龄组迁移规则低频处理

### MASTER-U0288
Birth/Death Settlement | 按基线和明确 shock 低频计入

### MASTER-U0289
Household Formation Update | 根据 adult population / migration 更新 household count

### MASTER-U0290
E. 核心计算

### MASTER-U0291
计算 | 规则

### MASTER-U0292
Population identity | Prev + Births - Deaths + Immigration - Emigration

### MASTER-U0293
Dependency Ratio | (Children + Retired) / WorkingAge

### MASTER-U0294
Household demand base | household_count，不等于 total population

### MASTER-U0295
Net migration | Immigration - Emigration

### MASTER-U0296
F. 硬约束、失败与异常

### MASTER-U0297
条件 | 处理

### MASTER-U0298
Negative cohort | 阻止 transaction；返回 validation error

### MASTER-U0299
Immigration approved but not arrived | 不计 Population，保持 scheduled arrival

### MASTER-U0300
Mass displacement | 必须通过 explicit crisis/migration event，不允许风险分数直接减少人口

### MASTER-U0301
Household recompute discrepancy | 产生 reconciliation warning，不自动改人口总数

### MASTER-U0302
G. Office 权限映射

### MASTER-U0303
Office | 操作/只读权限

### MASTER-U0304
Social | Migration policy、人口详情只读/操作 migration pipeline

### MASTER-U0305
Trade | 国际人才/移民协议外部部分

### MASTER-U0306
Industry | 只读 labour base

### MASTER-U0307
Finance | 只读 tax/welfare demographic base

### MASTER-U0308
Captain | 人口摘要与危机信息

### MASTER-U0309
CB | 只读宏观人口/劳动力摘要

### MASTER-U0310
H. Audit Event

### MASTER-U0311
事件类型

### MASTER-U0312
POPULATION_BIRTHS_POSTED

### MASTER-U0313
POPULATION_DEATHS_POSTED

### MASTER-U0314
IMMIGRATION_ARRIVED

### MASTER-U0315
EMIGRATION_DEPARTED

### MASTER-U0316
HOUSEHOLD_COUNT_UPDATED

### MASTER-U0317
AGE_COHORT_ROLLED

### MASTER-U0318
POPULATION_RECONCILIATION_WARNING

### MASTER-U0319
I. 前端可见状态与操作

### MASTER-U0320
页面/组件 | 内容

### MASTER-U0321
Population Dashboard | 总人口、三年龄组、家庭数、净迁移、Dependency Ratio

### MASTER-U0322
Migration Pipeline | Approved vs Arrived 分离

### MASTER-U0323
Population History | 按 sim day 的 Stock/Flow

### MASTER-U0324
J. 工程验收

### MASTER-U0325
□ 人口恒等式每日闭合。

### MASTER-U0326
□ Approved migration 未到达前不改变人口。

### MASTER-U0327
□ Population 与 Labour status 同步不产生重复人数。

### MASTER-U0328
□ Households 与 Housing Demand 使用同一 household_count。

### MASTER-U0329
Engine 03 · Labour & Wage Engine

### MASTER-U0330
Engine Definition / 把 Population 转化为 Labour Force，并在 Sector × Skill × Location 上匹配真实岗位；决定 Employment、Unemployment、Vacancy、Wage 与 Labour Bottleneck。

### MASTER-U0331
A. Source of Truth 与权威状态

### MASTER-U0332
权威对象 | 定义

### MASTER-U0333
LabourPersonAggregate | skill LOW/MEDIUM/HIGH、status EMPLOYED/UNEMPLOYED/NOT_IN_LF/STUDENT、location、count

### MASTER-U0334
SectorLabour | sector、skill、required、employed、vacancies、average_wage、location

### MASTER-U0335
WageState | national/skill/sector wages、minimum_wage

### MASTER-U0336
MatchingQueue | unemployed supply、vacancy demand、duration

### MASTER-U0337
PublicServiceLabour | education/healthcare/police/admin staffing

### MASTER-U0338
Mining & Extraction | 固定 Employment Sector

### MASTER-U0339
Oil & Gas | 固定 Employment Sector

### MASTER-U0340
Agriculture / Grain | 固定 Employment Sector

### MASTER-U0341
Steel | 固定 Employment Sector

### MASTER-U0342
Refining | 固定 Employment Sector

### MASTER-U0343
Machinery | 固定 Employment Sector

### MASTER-U0344
Semiconductor | 固定 Employment Sector

### MASTER-U0345
Battery | 固定 Employment Sector

### MASTER-U0346
Power Generation | 固定 Employment Sector

### MASTER-U0347
Grid & Utilities | 固定 Employment Sector

### MASTER-U0348
Construction | 固定 Employment Sector

### MASTER-U0349
Logistics | 固定 Employment Sector

### MASTER-U0350
General Services | 固定 Employment Sector

### MASTER-U0351
Education | 固定 Employment Sector

### MASTER-U0352
Healthcare | 固定 Employment Sector

### MASTER-U0353
Public Administration | 固定 Employment Sector

### MASTER-U0354
Public Safety | 固定 Employment Sector

### MASTER-U0355
该 Engine 是以下状态的唯一 Source of Truth：labour status、skill stock、sector employment、vacancies、wages、matching flows、public-sector workforce。

### MASTER-U0356
B. 输入

### MASTER-U0357
输入来源 | 输入

### MASTER-U0358
Population | working-age stock、migrant status

### MASTER-U0359
Industry/Project | production/project labour requirement

### MASTER-U0360
Education/Training | graduates and skill transitions

### MASTER-U0361
Healthcare/Public Safety/Education | public workforce demand

### MASTER-U0362
Household/Demand | consumption and cost pressure

### MASTER-U0363
Finance | public payroll capacity / tax credits

### MASTER-U0364
Social Rules | minimum wage、mobility programmes

### MASTER-U0365
C. 输出与下游依赖

### MASTER-U0366
下游 Engine | 输出

### MASTER-U0367
Production | labour availability by sector/skill

### MASTER-U0368
Project | construction/operating workforce fulfilment

### MASTER-U0369
Household | wage income

### MASTER-U0370
Fiscal | PIT/payroll tax base、public payroll

### MASTER-U0371
Social | unemployment/skill gap

### MASTER-U0372
National Accounts | compensation of employees、employment stats

### MASTER-U0373
D. 允许动作 / 状态转换

### MASTER-U0374
动作或系统事件 | 完整效果

### MASTER-U0375
Set Minimum Wage | Social 写入 LC/hour or LC/year，下一生效时间应用

### MASTER-U0376
Create Vacancy Demand | 由 facility/project/public service 自动创建

### MASTER-U0377
Match Worker | 在 skill/location/wage 条件下从 unemployment 转 employment

### MASTER-U0378
Layoff / Separation | 岗位消失或 firm contraction，转 unemployment/other status

### MASTER-U0379
Training Graduate | 接受 Education Engine 的 skill transition

### MASTER-U0380
Migration Labour Entry | 到达且有 work rights 后进入可用 labour

### MASTER-U0381
Labour Mobility | Social programme 改变 location availability

### MASTER-U0382
Public Hiring | 受预算和 approved positions 限制

### MASTER-U0383
E. 核心计算

### MASTER-U0384
计算 | 规则

### MASTER-U0385
Labour Force | Employed + UnemployedSearching

### MASTER-U0386
LFPR | LabourForce / WorkingAgePopulation

### MASTER-U0387
Unemployment Rate | Unemployed / LabourForce

### MASTER-U0388
Skill Gap | Demand_k - Available_k

### MASTER-U0389
Vacancy | max(0, Required - Employed)

### MASTER-U0390
Labour availability | min_k(AvailableWorkers_s,k / RequiredWorkers_s,k)

### MASTER-U0391
Wage growth | f(vacancy rate, skill scarcity, productivity, inflation expectations, minimum wage)

### MASTER-U0392
Job matches | f(vacancies, unemployed, skill match, location match, employment service capacity)

### MASTER-U0393
F. 硬约束、失败与异常

### MASTER-U0394
条件 | 处理

### MASTER-U0395
Insufficient worker | 岗位保持 vacancy；不得自动创建 worker

### MASTER-U0396
Minimum wage above offered wage | 受影响岗位必须 raise wage / close / reduce hiring according to sector economics

### MASTER-U0397
Skill mismatch | Low worker 不能直接填 High vacancy

### MASTER-U0398
Location mismatch | 无 mobility/relocation 则不能匹配

### MASTER-U0399
Public hiring without budget | 保持 unfilled approved position / request funding

### MASTER-U0400
G. Office 权限映射

### MASTER-U0401
Office | 操作/只读权限

### MASTER-U0402
Social | Minimum Wage、training/mobility/employment service；完整 labour data

### MASTER-U0403
Industry | 提交 workforce requirement、只读可用 labour/sector wage

### MASTER-U0404
Finance | public payroll / tax credit、工资税基只读

### MASTER-U0405
Trade | talent/temporary worker external channel

### MASTER-U0406
Captain | national labour summary

### MASTER-U0407
CB | employment/wage/inflation summary

### MASTER-U0408
H. Audit Event

### MASTER-U0409
事件类型

### MASTER-U0410
MINIMUM_WAGE_CHANGED

### MASTER-U0411
VACANCY_CREATED

### MASTER-U0412
WORKER_MATCHED

### MASTER-U0413
WORKER_SEPARATED

### MASTER-U0414
LAYOFF_RECORDED

### MASTER-U0415
SKILL_TRANSITION_POSTED

### MASTER-U0416
LABOUR_MOBILITY_COMPLETED

### MASTER-U0417
PUBLIC_HIRE_COMPLETED

### MASTER-U0418
LABOUR_SHORTAGE_DETECTED

### MASTER-U0419
I. 前端可见状态与操作

### MASTER-U0420
页面/组件 | 内容

### MASTER-U0421
Labour Dashboard | Employment、Unemployment、Vacancy、Skill Gap、Wage by sector

### MASTER-U0422
Workforce Request | Industry/Public Service demand

### MASTER-U0423
Matching View | vacancy duration、unemployment duration、location

### MASTER-U0424
Wage Panel | nominal/real/skill/sector wages

### MASTER-U0425
J. 工程验收

### MASTER-U0426
□ Employment by sector sums to total employed.

### MASTER-U0427
□ Skill stock transitions conserve people.

### MASTER-U0428
□ Vacancy cannot become filled without actual worker.

### MASTER-U0429
□ Public-service hiring consumes the same labour pool as industry.

### MASTER-U0430
□ Minimum wage is real money, not 0–100.

### MASTER-U0431
Engine 04 · Education & Human Capital Engine

### MASTER-U0432
Engine Definition / 把人口与教育容量转化为长期 Skill Supply。教育通过 Seats、Teachers、Enrollment、Duration、Completion 和 Graduates 运行，不允许教育预算直接给 Productivity Buff。

### MASTER-U0433
A. Source of Truth 与权威状态

### MASTER-U0434
权威对象 | 定义

### MASTER-U0435
EducationLevel | BASIC / VOCATIONAL / HIGHER

### MASTER-U0436
EducationCapacity | level、specialisation、location、seats、teachers_required/employed、budget_supported_seats

### MASTER-U0437
EducationCohort | intake、enrolled、start、duration、dropout、completion、graduates

### MASTER-U0438
TeacherWorkforce | teachers by level/specialisation/location

### MASTER-U0439
Specialisation | Vocational: Manufacturing, Mining, Construction, Energy, Logistics, Healthcare Support, Public Safety Support, General Technical；Higher: Engineering, Energy & Resources, Digital & Semiconductor, Healthcare & Medicine, Education & Teaching, Public Administration & Law, Business & Economics, Science & Research

### MASTER-U0440
ScholarshipProgramme | target、seats、benefit、duration、completion condition

### MASTER-U0441
该 Engine 是以下状态的唯一 Source of Truth：education capacity、student cohorts、teacher staffing、specialisation、graduation、human-capital transitions。

### MASTER-U0442
B. 输入

### MASTER-U0443
输入来源 | 输入

### MASTER-U0444
Population | eligible child/working-age/student base

### MASTER-U0445
Labour | teacher availability

### MASTER-U0446
Finance | education budget and payments

### MASTER-U0447
Project/Infrastructure | school/university capacity

### MASTER-U0448
Industry/Social | future skill demand

### MASTER-U0449
Trade | student/research exchange arrivals

### MASTER-U0450
C. 输出与下游依赖

### MASTER-U0451
下游 Engine | 输出

### MASTER-U0452
Labour | Medium/High skill graduates、teacher supply

### MASTER-U0453
Household | education participation affects current labour force

### MASTER-U0454
Fiscal | education operating/payroll cost

### MASTER-U0455
Industry/Technology | research/engineering talent supply

### MASTER-U0456
Healthcare/Public Safety | professional workforce pipeline

### MASTER-U0457
D. 允许动作 / 状态转换

### MASTER-U0458
动作或系统事件 | 完整效果

### MASTER-U0459
Allocate Education Budget | Social 在已批预算内分 Basic/Vocational/Higher/Specialisation

### MASTER-U0460
Open Cohort | 按 seats/teachers/budget intake

### MASTER-U0461
Expand Existing Seats | 仅在现有 facility/teacher capacity 内

### MASTER-U0462
Create Strategic Education Programme | 固定 specialisation + cohort rules

### MASTER-U0463
Teacher Recruitment/Training | 建立 teacher pipeline

### MASTER-U0464
Request Education Infrastructure | Social → Project Engine

### MASTER-U0465
Graduate Cohort | 到期后按 completion 产生 skill transition

### MASTER-U0466
Student Exchange Arrival/Departure | 通过 Trade/Social 合同进入 cohort

### MASTER-U0467
E. 核心计算

### MASTER-U0468
计算 | 规则

### MASTER-U0469
Actual enrollment | min(applicants, seats, teacher-supported seats, budget-supported seats)

### MASTER-U0470
Teacher-supported seats | teachers_employed × students_per_teacher_standard

### MASTER-U0471
Graduates | enrolled × (1-dropout) × completion_rate

### MASTER-U0472
Skill transition | Vocational → MEDIUM；Higher → HIGH，按 specialisation 输出行业标签

### MASTER-U0473
Education cost | staff payroll + operating cost + scholarship + facility cost via fiscal/project

### MASTER-U0474
F. 硬约束、失败与异常

### MASTER-U0475
条件 | 处理

### MASTER-U0476
Teacher shortage | 限制 enrollment/capacity

### MASTER-U0477
Seat shortage | 形成 backlog/applicants not enrolled

### MASTER-U0478
Budget shortfall | 降低 budget-supported seats / create arrears if committed payroll

### MASTER-U0479
Programme duration not reached | 不得提前毕业

### MASTER-U0480
Student migration expired | 按 status 退出或转换，不隐式成为 worker

### MASTER-U0481
G. Office 权限映射

### MASTER-U0482
Office | 操作/只读权限

### MASTER-U0483
Social | 教育政策、allocation、cohort、teacher programme、需求 Owner

### MASTER-U0484
Finance | 总预算/项目融资

### MASTER-U0485
Industry | 设施建设、未来 skill demand

### MASTER-U0486
Trade | 国际学生/研究交流

### MASTER-U0487
Captain | 战略教育项目审批/摘要

### MASTER-U0488
CB | 只读长期 labour/productivity context

### MASTER-U0489
H. Audit Event

### MASTER-U0490
事件类型

### MASTER-U0491
EDUCATION_BUDGET_ALLOCATED

### MASTER-U0492
COHORT_OPENED

### MASTER-U0493
COHORT_ENROLLED

### MASTER-U0494
COHORT_GRADUATED

### MASTER-U0495
TEACHER_SHORTAGE_DETECTED

### MASTER-U0496
EDUCATION_INFRA_REQUESTED

### MASTER-U0497
SCHOLARSHIP_PROGRAMME_CREATED

### MASTER-U0498
STUDENT_EXCHANGE_POSTED

### MASTER-U0499
I. 前端可见状态与操作

### MASTER-U0500
页面/组件 | 内容

### MASTER-U0501
Education Dashboard | Seats、Enrollment、Teachers、Vacancies、Graduates、Specialisation

### MASTER-U0502
Human Capital Pipeline | future graduates 7/30/60/360 sim days

### MASTER-U0503
Infrastructure Requests | new seats/location/deadline

### MASTER-U0504
Teacher Panel | stock、wage、training、attrition

### MASTER-U0505
J. 工程验收

### MASTER-U0506
□ 教育容量不能超过 seat/teacher/budget 约束。

### MASTER-U0507
□ Cohort duration 使用 simulation time，10× 下仍按 sim days。

### MASTER-U0508
□ Graduate 写入 Labour Engine 一次且可审计。

### MASTER-U0509
□ 教育预算不直接修改 Productivity。

### MASTER-U0510
Engine 05 · Healthcare Engine

### MASTER-U0511
Engine Definition / 管理 Population Health Load、医疗人员、门诊/住院/急诊/公共卫生容量、等待与 backlog；医疗改善通过真实服务影响劳动力可用性和家庭负担。

### MASTER-U0512
A. Source of Truth 与权威状态

### MASTER-U0513
权威对象 | 定义

### MASTER-U0514
CareType | PRIMARY / HOSPITAL / EMERGENCY / PUBLIC_HEALTH

### MASTER-U0515
HealthcareDemand | required episodes by care type/location/age group

### MASTER-U0516
HealthcareCapacity | visits/day、beds、critical beds、emergency cases/day、diagnostic capacity

### MASTER-U0517
HealthcareWorkforce | Doctors HIGH、Nurses MEDIUM/HIGH、Technicians MEDIUM、Emergency Staff MEDIUM/HIGH、Public Health Staff、Support Staff

### MASTER-U0518
CareBacklog | waiting patients、waiting time、delayed cases

### MASTER-U0519
MedicalSupply | medicine/equipment availability and coverage

### MASTER-U0520
该 Engine 是以下状态的唯一 Source of Truth：health demand、service capacity、healthcare workforce、beds/visits、waiting/backlog、medical supply availability。

### MASTER-U0521
B. 输入

### MASTER-U0522
输入来源 | 输入

### MASTER-U0523
Population | age groups and population size

### MASTER-U0524
Labour | healthcare staff

### MASTER-U0525
Finance | health budget/payroll

### MASTER-U0526
Project | hospital/clinic capacity

### MASTER-U0527
Trade/Production | medical equipment/supplies if represented as programme inputs

### MASTER-U0528
Shock | health demand surge

### MASTER-U0529
C. 输出与下游依赖

### MASTER-U0530
下游 Engine | 输出

### MASTER-U0531
Labour | health-related availability modifier if enabled、healthcare jobs

### MASTER-U0532
Household | healthcare out-of-pocket/support burden

### MASTER-U0533
Social Conditions | coverage/waiting stress

### MASTER-U0534
Fiscal | health spending

### MASTER-U0535
Risk | public health capacity warning

### MASTER-U0536
D. 允许动作 / 状态转换

### MASTER-U0537
动作或系统事件 | 完整效果

### MASTER-U0538
Allocate Operating Capacity | Social 在批准预算内分 Primary/Hospital/Emergency/Public Health

### MASTER-U0539
Create Healthcare Workforce Programme | Social + education/training

### MASTER-U0540
Request Facility Expansion | Social → Project

### MASTER-U0541
Emergency Staffing Reallocation | 把 staff 从常规服务临时转 emergency

### MASTER-U0542
Request Medicine/Equipment Procurement | Social → Trade/Industry/Finance

### MASTER-U0543
Activate Public Health Programme | 针对 explicit event/caseload

### MASTER-U0544
Healthcare Cost Support | Social welfare programme

### MASTER-U0545
E. 核心计算

### MASTER-U0546
计算 | 规则

### MASTER-U0547
Delivered care | min(demand+backlog, staff capacity, facility capacity, supply capacity, budget capacity)

### MASTER-U0548
Backlog | prior backlog + new demand - delivered care

### MASTER-U0549
Bed occupancy | occupied beds / available beds

### MASTER-U0550
Coverage | population with effective access / eligible population

### MASTER-U0551
Waiting time | backlog / effective service throughput with floor/ceiling rules

### MASTER-U0552
F. 硬约束、失败与异常

### MASTER-U0553
条件 | 处理

### MASTER-U0554
No staff | facility capacity cannot be fully used

### MASTER-U0555
No beds/facilities | staff cannot create service beyond facility cap

### MASTER-U0556
Supply shortage | 降低 deliverable care

### MASTER-U0557
Emergency reallocation | 其他 care type capacity 同步下降

### MASTER-U0558
Budget arrears | staff/supply delivery受 fiscal settlement影响

### MASTER-U0559
G. Office 权限映射

### MASTER-U0560
Office | 操作/只读权限

### MASTER-U0561
Social | 核心操作与完整数据

### MASTER-U0562
Finance | 预算/支付

### MASTER-U0563
Industry | 医疗设施项目

### MASTER-U0564
Trade | 外部采购

### MASTER-U0565
Captain | 国家健康危机/摘要

### MASTER-U0566
CB | 只读 labour/household macro impact

### MASTER-U0567
H. Audit Event

### MASTER-U0568
事件类型

### MASTER-U0569
HEALTH_DEMAND_POSTED

### MASTER-U0570
CARE_DELIVERED

### MASTER-U0571
HEALTH_BACKLOG_UPDATED

### MASTER-U0572
HEALTHCARE_STAFF_REALLOCATED

### MASTER-U0573
HEALTHCARE_CAPACITY_REQUESTED

### MASTER-U0574
MEDICAL_PROCUREMENT_REQUESTED

### MASTER-U0575
HEALTH_EMERGENCY_ACTIVATED

### MASTER-U0576
I. 前端可见状态与操作

### MASTER-U0577
页面/组件 | 内容

### MASTER-U0578
Healthcare Dashboard | Demand、Delivered、Backlog、Waiting、Beds、Staff、Coverage

### MASTER-U0579
Capacity Map | location staff/facility constraints

### MASTER-U0580
Emergency Panel | surge、reallocation、unmet need

### MASTER-U0581
Procurement Request | medicine/equipment need

### MASTER-U0582
J. 工程验收

### MASTER-U0583
□ Delivered care 不得超过任何约束。

### MASTER-U0584
□ Hospital capacity expansion 必须经过 Project Engine。

### MASTER-U0585
□ Healthcare staff 与其他行业共享 Labour Engine。

### MASTER-U0586
□ Backlog 在未服务时持续结转。

### MASTER-U0587
Engine 06 · Housing Engine

### MASTER-U0588
Engine Definition / 管理 Housing Units、Household Demand、Occupancy、Vacancy、Rent 与 Housing Gap；把人口、迁移、项目工人、利率和公共住房连接到真实住房压力。

### MASTER-U0589
A. Source of Truth 与权威状态

### MASTER-U0590
权威对象 | 定义

### MASTER-U0591
HousingStock | total_units、habitable_units、occupied、vacant、location

### MASTER-U0592
HousingDemand | household_count + temporary/project worker households + migration demand

### MASTER-U0593
RentState | average rent by location / national weighted

### MASTER-U0594
HousingProgrammeStock | public/worker/emergency units

### MASTER-U0595
HousingBenefit | recipient count and payment rule from Social/Fiscal

### MASTER-U0596
该 Engine 是以下状态的唯一 Source of Truth：housing stock、habitable/occupied/vacant units、household demand、rent、housing programmes occupancy。

### MASTER-U0597
B. 输入

### MASTER-U0598
输入来源 | 输入

### MASTER-U0599
Population | households/migration

### MASTER-U0600
Labour/Projects | worker location demand

### MASTER-U0601
Project | new housing units completion / disaster damage

### MASTER-U0602
CB/Banking | mortgage rate and credit

### MASTER-U0603
Household | income/rent affordability

### MASTER-U0604
Fiscal/Social | housing benefits

### MASTER-U0605
C. 输出与下游依赖

### MASTER-U0606
下游 Engine | 输出

### MASTER-U0607
Household | housing cost

### MASTER-U0608
Labour | mobility constraint

### MASTER-U0609
Social Conditions | housing stress

### MASTER-U0610
Fiscal | housing benefit cost

### MASTER-U0611
Projects | housing demand request

### MASTER-U0612
D. 允许动作 / 状态转换

### MASTER-U0613
动作或系统事件 | 完整效果

### MASTER-U0614
Set Housing Benefit Rule | Social，财政增量需 Finance

### MASTER-U0615
Request Public Housing | Social need → Project

### MASTER-U0616
Request Worker Housing | Social/Industry → Project

### MASTER-U0617
Activate Emergency Housing | 占用 emergency capacity

### MASTER-U0618
Allocate Worker Housing | 把 units 分配给指定 project workforce

### MASTER-U0619
Complete Housing Project | Project Engine 增加 habitable units

### MASTER-U0620
E. 核心计算

### MASTER-U0621
计算 | 规则

### MASTER-U0622
Housing gap | household demand - habitable available units

### MASTER-U0623
Vacancy rate | vacant habitable units / habitable units

### MASTER-U0624
Rent movement | f(housing gap/vacancy, household income, mortgage conditions, new supply)

### MASTER-U0625
Housing burden | housing cost / disposable income

### MASTER-U0626
F. 硬约束、失败与异常

### MASTER-U0627
条件 | 处理

### MASTER-U0628
Benefit without supply | 不增加 units，可能增加 demand-side rent pressure

### MASTER-U0629
Migration surge | 立即增加 housing demand when arrivals occur

### MASTER-U0630
Damaged units | 从 habitable 移出，不能继续出租

### MASTER-U0631
Worker housing expiration | 按 project/permit status 释放或重新分配

### MASTER-U0632
G. Office 权限映射

### MASTER-U0633
Office | 操作/只读权限

### MASTER-U0634
Social | benefit/需求/分配

### MASTER-U0635
Industry | housing construction project

### MASTER-U0636
Finance | funding

### MASTER-U0637
CB | mortgage conditions only

### MASTER-U0638
Captain | 住房危机摘要

### MASTER-U0639
Trade | 外部 worker arrival read-only link

### MASTER-U0640
H. Audit Event

### MASTER-U0641
事件类型

### MASTER-U0642
HOUSING_UNIT_ADDED

### MASTER-U0643
HOUSING_UNIT_DAMAGED

### MASTER-U0644
HOUSING_BENEFIT_CHANGED

### MASTER-U0645
PUBLIC_HOUSING_REQUESTED

### MASTER-U0646
WORKER_HOUSING_ALLOCATED

### MASTER-U0647
EMERGENCY_HOUSING_ACTIVATED

### MASTER-U0648
RENT_STATE_UPDATED

### MASTER-U0649
I. 前端可见状态与操作

### MASTER-U0650
页面/组件 | 内容

### MASTER-U0651
Housing Dashboard | Units、Demand、Gap、Rent、Benefit、Construction

### MASTER-U0652
Location View | labour/project demand vs units

### MASTER-U0653
Housing Requests | Public/Worker/Emergency

### MASTER-U0654
J. 工程验收

### MASTER-U0655
□ HousingGap 使用 households 而非 population。

### MASTER-U0656
□ 补贴不改变 supply。

### MASTER-U0657
□ Completed construction 才增加 habitable units。

### MASTER-U0658
□ Mortgage rate 通过 Banking/CB 输入，Social 不直接修改。

### MASTER-U0659
Engine 07 · Public Safety Engine

### MASTER-U0660
Engine Definition / 管理国内 Police Workforce、Crime/Public Disorder、Response Time、Case Backlog、Deployment 与 Civil Emergency；不包含国防和外交安全。

### MASTER-U0661
A. Source of Truth 与权威状态

### MASTER-U0662
权威对象 | 定义

### MASTER-U0663
SafetyStaff | Police、Investigative、Public Order、Emergency Response、Community Safety、Admin Support

### MASTER-U0664
Incident | category、location、opened_at、required_staff、severity、status

### MASTER-U0665
CaseBacklog | open、resolved、average investigation time

### MASTER-U0666
Deployment | staff type/count/location/start/end/mission

### MASTER-U0667
ProtestEvent | participants、cause、required/deployed staff、transport/medical impacts

### MASTER-U0668
CivilEmergency | affected population、region、staff/medical/housing/food requirements

### MASTER-U0669
该 Engine 是以下状态的唯一 Source of Truth：police staff、deployments、incidents、case backlog、response capacity、protest/public-order events。

### MASTER-U0670
B. 输入

### MASTER-U0671
输入来源 | 输入

### MASTER-U0672
Population | population/location base

### MASTER-U0673
Labour | police workforce

### MASTER-U0674
Finance | public safety payroll/budget

### MASTER-U0675
Social Conditions | unemployment/poverty/housing stress as risk inputs

### MASTER-U0676
Captain | emergency authority

### MASTER-U0677
Shock | disaster/public-order trigger

### MASTER-U0678
C. 输出与下游依赖

### MASTER-U0679
下游 Engine | 输出

### MASTER-U0680
Housing/Labour | location disruption

### MASTER-U0681
Social Conditions | crime/public order stress

### MASTER-U0682
Captain | national crisis alerts

### MASTER-U0683
Fiscal | police/emergency spending

### MASTER-U0684
National Accounts | public service government consumption

### MASTER-U0685
D. 允许动作 / 状态转换

### MASTER-U0686
动作或系统事件 | 完整效果

### MASTER-U0687
Allocate Police Personnel | Social 在地区/功能间配置真实人员

### MASTER-U0688
Create Public Order Deployment | 占用 Available Personnel

### MASTER-U0689
Reallocate Staff | 从一地减、另一地加

### MASTER-U0690
Create Police Training | 通过 Training/Education pipeline

### MASTER-U0691
Open/Resolve Incident | 系统/玩家流程

### MASTER-U0692
Mediation Support | 对 Protest 创建非警力解决路径

### MASTER-U0693
Request National Emergency Support | Social → Captain

### MASTER-U0694
Request Police Infrastructure | Social → Project

### MASTER-U0695
E. 核心计算

### MASTER-U0696
计算 | 规则

### MASTER-U0697
Available police | employed - deployed - unavailable

### MASTER-U0698
Crime rate | recorded incidents / population × 100,000

### MASTER-U0699
Case clearance | resolved / cases handled

### MASTER-U0700
Response time | f(new incidents, available staff, location/logistics)

### MASTER-U0701
Backlog | prior + new cases - resolved

### MASTER-U0702
F. 硬约束、失败与异常

### MASTER-U0703
条件 | 处理

### MASTER-U0704
Overdeployment | 其他地区 capacity 同步下降

### MASTER-U0705
No staff | response delay/backlog 增长

### MASTER-U0706
National emergency power | Social 不能自行越级启用 Captain extraordinary authority

### MASTER-U0707
Public disorder | 不允许一个抽象 protest risk 直接修改 economy，必须生成 event

### MASTER-U0708
G. Office 权限映射

### MASTER-U0709
Office | 操作/只读权限

### MASTER-U0710
Social | 核心运营

### MASTER-U0711
Captain | 重大公共秩序/紧急状态

### MASTER-U0712
Finance | 预算

### MASTER-U0713
Industry | 警务设施项目

### MASTER-U0714
Healthcare | emergency medical coordination

### MASTER-U0715
Trade/CB | 无日常写权限

### MASTER-U0716
H. Audit Event

### MASTER-U0717
事件类型

### MASTER-U0718
SAFETY_INCIDENT_OPENED

### MASTER-U0719
SAFETY_INCIDENT_RESOLVED

### MASTER-U0720
POLICE_DEPLOYED

### MASTER-U0721
POLICE_REALLOCATED

### MASTER-U0722
PROTEST_EVENT_CREATED

### MASTER-U0723
PUBLIC_ORDER_ESCALATED

### MASTER-U0724
CIVIL_EMERGENCY_CREATED

### MASTER-U0725
NATIONAL_EMERGENCY_REQUESTED

### MASTER-U0726
I. 前端可见状态与操作

### MASTER-U0727
页面/组件 | 内容

### MASTER-U0728
Public Safety Dashboard | staff、incidents、response、backlog、deployments

### MASTER-U0729
Public Order | Protests、participants、staff requirement

### MASTER-U0730
Civil Emergency | unmet needs and cross-office requests

### MASTER-U0731
J. 工程验收

### MASTER-U0732
□ 警力人员守恒。

### MASTER-U0733
□ 部署占用真实 Available Personnel。

### MASTER-U0734
□ Crime Rate 来自事件数。

### MASTER-U0735
□ 重大 emergency 必须通过 Captain approval。

### MASTER-U0736
Engine 08 · Resource & Inventory Engine

### MASTER-U0737
Engine Definition / 管理固定 Geological Endowment、勘探、可采储量、开发储量、开采和所有实体商品库存；是资源与商品守恒的唯一账本。

### MASTER-U0738
A. Source of Truth 与权威状态

### MASTER-U0739
权威对象 | 定义

### MASTER-U0740
GeologicalEndowment | 初始固定，服务器隐藏/不可改

### MASTER-U0741
CRUDE_OIL | barrel

### MASTER-U0742
NATURAL_GAS | MMBtu equivalent

### MASTER-U0743
URANIUM | tonne U

### MASTER-U0744
IRON_ORE | tonne

### MASTER-U0745
COPPER | tonne

### MASTER-U0746
LITHIUM | tonne LCE

### MASTER-U0747
ResourceLayer | UNDISCOVERED / DISCOVERED / RECOVERABLE / DEVELOPED / EXTRACTED

### MASTER-U0748
Deposit | location、resource、geological amount、proven、recoverable、developed、extraction cap、cost

### MASTER-U0749
CommodityInventory | country、commodity、usable、strategic、reserved_for_contract、in_transit_in/out、losses

### MASTER-U0750
CRUDE_OIL | barrel

### MASTER-U0751
NATURAL_GAS | MMBtu

### MASTER-U0752
URANIUM | tonne U

### MASTER-U0753
GRAIN | tonne

### MASTER-U0754
IRON_ORE | tonne

### MASTER-U0755
COPPER | tonne

### MASTER-U0756
LITHIUM | tonne LCE

### MASTER-U0757
STEEL | tonne

### MASTER-U0758
REFINED_FUEL | barrel equivalent

### MASTER-U0759
MACHINERY | equipment unit

### MASTER-U0760
SEMICONDUCTORS | standardised chip unit

### MASTER-U0761
BATTERIES | MWh-equivalent

### MASTER-U0762
该 Engine 是以下状态的唯一 Source of Truth：geological resources、deposit state、commodity inventory、strategic reserve physical stock、in-transit commodity ownership。

### MASTER-U0763
B. 输入

### MASTER-U0764
输入来源 | 输入

### MASTER-U0765
Technology | exploration/recovery/extraction efficiency

### MASTER-U0766
Project | mine/field development and reserve facility

### MASTER-U0767
Labour | extraction workforce

### MASTER-U0768
Energy | power availability

### MASTER-U0769
Production | domestic commodity output/use

### MASTER-U0770
Trade | delivered imports/exports

### MASTER-U0771
Shock | physical losses/damage

### MASTER-U0772
C. 输出与下游依赖

### MASTER-U0773
下游 Engine | 输出

### MASTER-U0774
Production | available raw material/intermediate inventory

### MASTER-U0775
Trade | exportable supply/import need

### MASTER-U0776
Energy | fuel inventory

### MASTER-U0777
Project | construction material availability

### MASTER-U0778
National Accounts | inventory change/output flows

### MASTER-U0779
Risk | resource security/coverage

### MASTER-U0780
D. 允许动作 / 状态转换

### MASTER-U0781
动作或系统事件 | 完整效果

### MASTER-U0782
Create Exploration Project | Industry；不增加 total resource，只发现 hidden pool

### MASTER-U0783
Post Discovery | 从 UNDISCOVERED 转 DISCOVERED

### MASTER-U0784
Reclassify Recoverable | 技术/成本条件满足后转可采

### MASTER-U0785
Develop Deposit | Project 完成后增加 DEVELOPED reserve/extraction capacity

### MASTER-U0786
Extract | 生产结算消耗 Developed/Remaining reserve，增加 inventory

### MASTER-U0787
Reserve Accumulation/Release | 在 usable ↔ strategic physical stock 间转移/通过贸易补充

### MASTER-U0788
Reserve Contract Quantity | 对 active obligations 冻结 inventory

### MASTER-U0789
Post Loss | 明确事故/运输/损耗事件减少 inventory

### MASTER-U0790
E. 核心计算

### MASTER-U0791
计算 | 规则

### MASTER-U0792
Resource conservation | Initial Endowment - Cumulative Extraction = Remaining Geological

### MASTER-U0793
Inventory | Opening + Production + Delivered Imports - Domestic Use - Delivered Exports - Losses = Closing

### MASTER-U0794
Import need | max(0, demand + strategic target - production - usable inventory - contracted inbound)

### MASTER-U0795
Exportable supply | max(0, production + usable inventory + inbound - domestic demand - strategic minimum - export obligations)

### MASTER-U0796
Coverage days | strategic/usable stock / critical daily demand

### MASTER-U0797
F. 硬约束、失败与异常

### MASTER-U0798
条件 | 处理

### MASTER-U0799
Exploration beyond hidden pool | 阻止；discovery <= remaining undiscovered

### MASTER-U0800
Extraction beyond developed reserve | 限制 actual extraction

### MASTER-U0801
Negative inventory | 阻止 transaction或形成 delivery shortfall，不允许负库存

### MASTER-U0802
Double reservation | reserved quantity 不可再次出售/使用

### MASTER-U0803
Technology recovery improvement | 只改变 recoverable share，不改变 geological total

### MASTER-U0804
G. Office 权限映射

### MASTER-U0805
Office | 操作/只读权限

### MASTER-U0806
Industry | 资源、勘探、开发、储备目标/释放

### MASTER-U0807
Trade | 读库存并创建进出口义务

### MASTER-U0808
Finance | 只读资产/项目资金

### MASTER-U0809
Social | 读 food/energy availability

### MASTER-U0810
Captain | resource security summary

### MASTER-U0811
CB | 读 critical import requirement

### MASTER-U0812
H. Audit Event

### MASTER-U0813
事件类型

### MASTER-U0814
RESOURCE_DISCOVERED

### MASTER-U0815
RESOURCE_RECLASSIFIED

### MASTER-U0816
DEPOSIT_DEVELOPED

### MASTER-U0817
RESOURCE_EXTRACTED

### MASTER-U0818
INVENTORY_PRODUCED

### MASTER-U0819
INVENTORY_CONSUMED

### MASTER-U0820
INVENTORY_RESERVED

### MASTER-U0821
INVENTORY_RELEASED

### MASTER-U0822
INVENTORY_LOSS_POSTED

### MASTER-U0823
STRATEGIC_RESERVE_TRANSFERRED

### MASTER-U0824
I. 前端可见状态与操作

### MASTER-U0825
页面/组件 | 内容

### MASTER-U0826
Resource Dashboard | 五层资源、deposit、remaining life、extraction

### MASTER-U0827
Inventory Ledger | 12 commodities by usable/strategic/reserved/in-transit

### MASTER-U0828
Security Panel | coverage、future project demand、shortfalls

### MASTER-U0829
J. 工程验收

### MASTER-U0830
□ Initial Geological Endowment 永不因技术/政策增加。

### MASTER-U0831
□ 所有商品库存每日守恒。

### MASTER-U0832
□ Trade/Production 共用同一 inventory。

### MASTER-U0833
□ Strategic reserve 是真实 inventory 分类。

### MASTER-U0834
Engine 09 · Energy Engine

### MASTER-U0835
Engine Definition / 管理电力生产、燃料消耗、发电设施、储能、电网、供电优先级与能源短缺；Electricity 主要为国内非标准 Spot Commodity。

### MASTER-U0836
A. Source of Truth 与权威状态

### MASTER-U0837
权威对象 | 定义

### MASTER-U0838
PowerPlant | technology GAS/FOSSIL/NUCLEAR/SOLAR/WIND、MW、available MW、capacity factor、fuel、labour、variable cost、emission factor、life

### MASTER-U0839
EnergyStorage | power MW、energy MWh、state_of_charge、efficiency

### MASTER-U0840
Grid | transfer capacity、loss rate、regional nodes

### MASTER-U0841
ElectricityDemand | household、industry、mining、public services、projects

### MASTER-U0842
PowerAllocation | priority class and delivered MWh

### MASTER-U0843
该 Engine 是以下状态的唯一 Source of Truth：power plants、generation capacity、fuel use、storage、grid capacity/loss、electricity demand/allocation。

### MASTER-U0844
B. 输入

### MASTER-U0845
输入来源 | 输入

### MASTER-U0846
Resource/Inventory | gas/oil/uranium fuel

### MASTER-U0847
Labour | plant/grid workers

### MASTER-U0848
Project | new plant/grid/storage

### MASTER-U0849
Technology | efficiency/capacity factor/grid management

### MASTER-U0850
Household/Production/Public Services | electricity demand

### MASTER-U0851
Trade | cross-border electricity only through specific grid agreements

### MASTER-U0852
C. 输出与下游依赖

### MASTER-U0853
下游 Engine | 输出

### MASTER-U0854
Production | energy availability factor

### MASTER-U0855
Household | energy price/availability

### MASTER-U0856
Healthcare/Education/Public Safety | critical service power

### MASTER-U0857
Emissions | generation emissions

### MASTER-U0858
Risk | blackout/shortage

### MASTER-U0859
National Accounts | electric utility output

### MASTER-U0860
D. 允许动作 / 状态转换

### MASTER-U0861
动作或系统事件 | 完整效果

### MASTER-U0862
Set Generation/Dispatch Target | Industry，按 plant availability/fuel

### MASTER-U0863
Set Crisis Allocation Priority | Industry；critical public service guardrails

### MASTER-U0864
Charge/Discharge Storage | 按 capacity/efficiency

### MASTER-U0865
Schedule Maintenance | 降低 available capacity

### MASTER-U0866
Request Fuel Import | Industry → Trade

### MASTER-U0867
Create Plant/Grid Project | Industry → Project

### MASTER-U0868
Cross-border Power Flow | 只在已建 interconnector/contract 下

### MASTER-U0869
E. 核心计算

### MASTER-U0870
计算 | 规则

### MASTER-U0871
Generation | AvailableCapacity × CapacityFactor × Time

### MASTER-U0872
Delivered supply | Generation + StorageDischarge + Imports - StorageCharge - GridLosses - Exports

### MASTER-U0873
Reserve margin | (AvailableGenerationCapacity - PeakDemand) / PeakDemand

### MASTER-U0874
Energy availability sector | DeliveredEnergy_s / RequiredEnergy_s capped at 1

### MASTER-U0875
Fuel burn | Generation × heat-rate / technology efficiency

### MASTER-U0876
F. 硬约束、失败与异常

### MASTER-U0877
条件 | 处理

### MASTER-U0878
Fuel shortage | fuel-based generation capped

### MASTER-U0879
Grid bottleneck | generation available but not deliverable

### MASTER-U0880
Storage empty/full | discharge/charge blocked

### MASTER-U0881
Demand > supply | ration/allocation + shortage events

### MASTER-U0882
Maintenance overdue | availability/reliability penalty via explicit facility state

### MASTER-U0883
G. Office 权限映射

### MASTER-U0884
Office | 操作/只读权限

### MASTER-U0885
Industry | dispatch、allocation、projects

### MASTER-U0886
Trade | fuel/cross-border power contracts

### MASTER-U0887
Finance | project/subsidy funding

### MASTER-U0888
Social | household/public service need read-only

### MASTER-U0889
Captain | energy crisis/strategic projects

### MASTER-U0890
CB | energy inflation exposure only

### MASTER-U0891
H. Audit Event

### MASTER-U0892
事件类型

### MASTER-U0893
POWER_GENERATED

### MASTER-U0894
FUEL_BURNED

### MASTER-U0895
POWER_ALLOCATED

### MASTER-U0896
GRID_LOSS_POSTED

### MASTER-U0897
STORAGE_CHARGED

### MASTER-U0898
STORAGE_DISCHARGED

### MASTER-U0899
BLACKOUT_DETECTED

### MASTER-U0900
PLANT_MAINTENANCE_STARTED

### MASTER-U0901
PLANT_COMMISSIONED

### MASTER-U0902
I. 前端可见状态与操作

### MASTER-U0903
页面/组件 | 内容

### MASTER-U0904
Energy Dashboard | generation mix、MW/MWh、demand、reserve margin、fuel cover

### MASTER-U0905
Dispatch View | sector allocation and shortage

### MASTER-U0906
Grid View | node capacity/bottleneck

### MASTER-U0907
Plant Fleet | capacity、fuel、maintenance、life

### MASTER-U0908
J. 工程验收

### MASTER-U0909
□ Electricity balance 每日闭合。

### MASTER-U0910
□ Power shortage 通过 delivered MWh 限制生产/公共服务。

### MASTER-U0911
□ Electricity 不进入普通 12 commodity spot book。

### MASTER-U0912
□ 跨国电力需实体 interconnector/contract。

### MASTER-U0913
Engine 10 · Production Engine

### MASTER-U0914
Engine Definition / 把 Capacity、Inventory、Energy、Labour、Technology 和 Logistics 转化为 12 个固定生产 Sector 的真实 Output、Cost、Sales 和 Capacity Utilisation。

### MASTER-U0915
A. Source of Truth 与权威状态

### MASTER-U0916
权威对象 | 定义

### MASTER-U0917
ProductionSector | OIL_EXTRACTION :: Developed Oil Reserve + Electricity + Labour + Machinery → Crude Oil

### MASTER-U0918
ProductionSector | GAS_EXTRACTION :: Developed Gas Reserve + Electricity + Labour + Machinery → Natural Gas

### MASTER-U0919
ProductionSector | URANIUM_MINING :: Developed Uranium Reserve + Electricity + Labour + Machinery → Uranium

### MASTER-U0920
ProductionSector | IRON_ORE_MINING :: Developed Iron Ore Reserve + Electricity + Labour + Machinery → Iron Ore

### MASTER-U0921
ProductionSector | COPPER_MINING :: Developed Copper Reserve + Electricity + Labour + Machinery → Copper

### MASTER-U0922
ProductionSector | LITHIUM_MINING :: Developed Lithium Reserve + Electricity + Labour + Machinery → Lithium

### MASTER-U0923
ProductionSector | STEEL :: Iron Ore + Energy + Labour + Machinery Capacity → Steel

### MASTER-U0924
ProductionSector | REFINED_FUEL :: Crude Oil + Energy + Labour + Refinery Capacity → Refined Fuel

### MASTER-U0925
ProductionSector | BATTERY :: Lithium + Copper + Electricity + Machinery + Battery Technology + Skilled Labour → Batteries

### MASTER-U0926
ProductionSector | MACHINERY :: Steel + Copper + Electricity + Manufacturing Technology + Skilled Labour → Machinery

### MASTER-U0927
ProductionSector | SEMICONDUCTOR :: Copper + Electricity + Machinery + Semiconductor Technology + High Skill Labour → Semiconductors

### MASTER-U0928
ProductionSector | ELECTRICITY :: Fuel/Resource + Generation Capacity + Labour + Grid → Delivered Electricity

### MASTER-U0929
Facility | facility_id、sector、location、installed/operational capacity、technology、ownership、maintenance、labour、energy、input coefficients

### MASTER-U0930
ProductionTarget | target output / utilisation

### MASTER-U0931
OutputFlow | gross output、intermediate inputs、inventory posting、unit cost

### MASTER-U0932
该 Engine 是以下状态的唯一 Source of Truth：production facilities、installed/operational capacity、target utilisation、actual output、input coefficients、unit cost、maintenance state。

### MASTER-U0933
B. 输入

### MASTER-U0934
输入来源 | 输入

### MASTER-U0935
Resource/Inventory | raw/intermediate inputs

### MASTER-U0936
Energy | delivered electricity/fuel

### MASTER-U0937
Labour | staff availability

### MASTER-U0938
Technology | productivity/input efficiency/eligibility

### MASTER-U0939
Infrastructure | logistics capacity

### MASTER-U0940
Household/Trade/Projects | demand

### MASTER-U0941
Finance/Banking | working capital/investment constraints

### MASTER-U0942
C. 输出与下游依赖

### MASTER-U0943
下游 Engine | 输出

### MASTER-U0944
Inventory | produced commodities

### MASTER-U0945
Labour | required jobs

### MASTER-U0946
Household/Trade | supply and prices

### MASTER-U0947
Fiscal | corporate/payroll tax base

### MASTER-U0948
Banking | sector revenue/debt service risk

### MASTER-U0949
National Accounts | gross output/intermediate consumption/value added

### MASTER-U0950
D. 允许动作 / 状态转换

### MASTER-U0951
动作或系统事件 | 完整效果

### MASTER-U0952
Set Production Target | Industry sets sector/facility target within capacity

### MASTER-U0953
Set Utilisation Target | Industry sets target; cost/maintenance implications

### MASTER-U0954
Expand/Upgrade Facility | through Project Engine

### MASTER-U0955
Pause/Close Facility | stop output and labour demand

### MASTER-U0956
Schedule Maintenance | reduce operational capacity

### MASTER-U0957
Consume Inputs | daily settlement before posting output

### MASTER-U0958
Post Output | after all bottleneck checks

### MASTER-U0959
E. 核心计算

### MASTER-U0960
计算 | 规则

### MASTER-U0961
Potential output | OperationalCapacity × TargetUtilisation × Productivity

### MASTER-U0962
Input availability | min_j(AvailableInput_j / RequiredInput_j)

### MASTER-U0963
Actual output | PotentialOutput × min(InputAvailability, EnergyAvailability, LabourAvailability, LogisticsAvailability)

### MASTER-U0964
Unit production cost | input cost + energy + wage + maintenance + financing allocation

### MASTER-U0965
Capacity utilisation | ActualOutput / OperationalCapacity

### MASTER-U0966
Value added | GrossOutputValue - IntermediateInputValue

### MASTER-U0967
F. 硬约束、失败与异常

### MASTER-U0968
条件 | 处理

### MASTER-U0969
Input shortage | output scaled, unmet target recorded

### MASTER-U0970
Labour shortage | output scaled

### MASTER-U0971
Energy shortage | output scaled by allocation

### MASTER-U0972
Technology prerequisite missing | facility cannot commission / advanced process blocked

### MASTER-U0973
Logistics bottleneck | sale/export movement limited even if produced

### MASTER-U0974
No working capital if enforced | production target constrained by cash/credit

### MASTER-U0975
G. Office 权限映射

### MASTER-U0976
Office | 操作/只读权限

### MASTER-U0977
Industry | production target、utilisation、facility operations

### MASTER-U0978
Trade | external demand/inputs

### MASTER-U0979
Finance | tax/subsidy/project funding

### MASTER-U0980
CB | credit conditions only

### MASTER-U0981
Social | labour supply

### MASTER-U0982
Captain | strategic summary

### MASTER-U0983
H. Audit Event

### MASTER-U0984
事件类型

### MASTER-U0985
PRODUCTION_TARGET_SET

### MASTER-U0986
INPUT_CONSUMED

### MASTER-U0987
OUTPUT_PRODUCED

### MASTER-U0988
FACILITY_UTILISATION_UPDATED

### MASTER-U0989
FACILITY_PAUSED

### MASTER-U0990
FACILITY_CLOSED

### MASTER-U0991
MAINTENANCE_STARTED

### MASTER-U0992
PRODUCTION_SHORTFALL_DETECTED

### MASTER-U0993
I. 前端可见状态与操作

### MASTER-U0994
页面/组件 | 内容

### MASTER-U0995
Production Dashboard | capacity、output、utilisation、inputs、cost、inventory

### MASTER-U0996
Facility View | technology、labour、energy、maintenance

### MASTER-U0997
Bottleneck Panel | input/energy/labour/logistics ratios

### MASTER-U0998
J. 工程验收

### MASTER-U0999
□ Output 不能超过物理与资源约束。

### MASTER-U1000
□ 所有中间投入必须从 Inventory 扣减。

### MASTER-U1001
□ Value Added 不重复计算中间品。

### MASTER-U1002
□ 产能扩张只能来自 Project completion。

### MASTER-U1003
Engine 11 · Technology & R&D Engine

### MASTER-U1004
Engine Definition / 管理 22 项固定 Technology、prerequisite、Domestic R&D、Licence、Transfer、Joint R&D、Research Centre、Talent Exchange 和技术权利。

### MASTER-U1005
A. Source of Truth 与权威状态

### MASTER-U1006
权威对象 | 定义

### MASTER-U1007
TechnologyCatalog | ENERGY_ADV_SOLAR | Energy | Advanced Solar

### MASTER-U1008
TechnologyCatalog | ENERGY_GRID_STORAGE | Energy | Grid-scale Storage

### MASTER-U1009
TechnologyCatalog | ENERGY_ADV_NUCLEAR | Energy | Advanced Nuclear

### MASTER-U1010
TechnologyCatalog | ENERGY_SMART_GRID | Energy | Smart Grid

### MASTER-U1011
TechnologyCatalog | ENERGY_GREEN_H2 | Energy | Green Hydrogen

### MASTER-U1012
TechnologyCatalog | MFG_AUTOMATION | Manufacturing | Industrial Automation

### MASTER-U1013
TechnologyCatalog | MFG_ROBOTICS | Manufacturing | Advanced Robotics

### MASTER-U1014
TechnologyCatalog | MFG_PRECISION | Manufacturing | Precision Manufacturing

### MASTER-U1015
TechnologyCatalog | MFG_SMART | Manufacturing | Smart Manufacturing

### MASTER-U1016
TechnologyCatalog | SEMI_BASIC | Semiconductor | Basic Semiconductor

### MASTER-U1017
TechnologyCatalog | SEMI_ADV_FAB | Semiconductor | Advanced Fabrication

### MASTER-U1018
TechnologyCatalog | SEMI_PACKAGING | Semiconductor | Advanced Packaging

### MASTER-U1019
TechnologyCatalog | SEMI_HPC | Semiconductor | High-performance Chips

### MASTER-U1020
TechnologyCatalog | RESOURCE_ADV_EXPLORATION | Resources & Materials | Advanced Exploration

### MASTER-U1021
TechnologyCatalog | RESOURCE_ADV_MINING | Resources & Materials | Advanced Mining

### MASTER-U1022
TechnologyCatalog | RESOURCE_EFFICIENT_REFINING | Resources & Materials | High-efficiency Refining

### MASTER-U1023
TechnologyCatalog | RESOURCE_BATTERY_CHEM | Resources & Materials | Battery Chemistry

### MASTER-U1024
TechnologyCatalog | RESOURCE_ADV_MATERIALS | Resources & Materials | Advanced Materials

### MASTER-U1025
TechnologyCatalog | INFRA_DIGITAL_NETWORK | Infrastructure & Digital | Digital Industrial Network

### MASTER-U1026
TechnologyCatalog | INFRA_AUTO_LOGISTICS | Infrastructure & Digital | Automated Logistics

### MASTER-U1027
TechnologyCatalog | INFRA_SMART_PORT | Infrastructure & Digital | Smart Port

### MASTER-U1028
TechnologyCatalog | INFRA_ADV_GRID_MGMT | Infrastructure & Digital | Advanced Grid Management

### MASTER-U1029
TechnologyState | UNKNOWN / RESEARCHABLE / RESEARCHING / MASTERED / LICENSED / TRANSFER_IN_PROGRESS / JOINTLY_OWNED / RESTRICTED / OBSOLETE

### MASTER-U1030
ResearchProject | technology、required research output、funding、staff、equipment、progress、duration/status

### MASTER-U1031
TechnologyRight | owner/holder、right type、territory、production/export/sub-licence limits、expiry

### MASTER-U1032
Disclosure | PUBLIC / COMMERCIAL / RESTRICTED / CLASSIFIED

### MASTER-U1033
该 Engine 是以下状态的唯一 Source of Truth：country technology rights、research projects、progress、prerequisites、licence/transfer/joint ownership、disclosure state。

### MASTER-U1034
B. 输入

### MASTER-U1035
输入来源 | 输入

### MASTER-U1036
Education/Labour | researcher/high-skill availability

### MASTER-U1037
Finance | R&D budget

### MASTER-U1038
Project/Production | equipment/industrial base

### MASTER-U1039
Trade | licence/transfer/joint R&D contracts

### MASTER-U1040
Time | research duration

### MASTER-U1041
Captain | strategic export/disclosure approval

### MASTER-U1042
C. 输出与下游依赖

### MASTER-U1043
下游 Engine | 输出

### MASTER-U1044
Project | technology eligibility

### MASTER-U1045
Production | productivity/input/energy/emission modifiers based on explicit tech

### MASTER-U1046
Resource | exploration/recovery efficiency

### MASTER-U1047
Trade | licensable technologies

### MASTER-U1048
Labour/Education | talent demand

### MASTER-U1049
D. 允许动作 / 状态转换

### MASTER-U1050
动作或系统事件 | 完整效果

### MASTER-U1051
Create Domestic R&D | Industry chooses technology and budget/resource plan

### MASTER-U1052
Allocate R&D Budget | within Finance-approved envelope

### MASTER-U1053
Publish/Restrict Technology | Industry; strategic threshold Captain

### MASTER-U1054
Offer Licence | Industry grants availability; Trade negotiates terms

### MASTER-U1055
Acquire Licence | Trade contract → TechnologyRight LICENSED

### MASTER-U1056
Technology Transfer | progressively changes capability/rights

### MASTER-U1057
Create Joint R&D | multi-country contribution and IP rights

### MASTER-U1058
Create International Research Centre | Project + R&D joint object

### MASTER-U1059
Talent Exchange | Social/Trade/Industry provides research staff

### MASTER-U1060
Complete Research | MASTERED or JOINTLY_OWNED according to rights

### MASTER-U1061
E. 核心计算

### MASTER-U1062
计算 | 规则

### MASTER-U1063
Research output | funding × human capital × equipment availability × existing technology base × research efficiency

### MASTER-U1064
Progress | accumulated research output / required research output

### MASTER-U1065
Transfer absorption | f(domestic human capital, training, existing tech base, industrial capacity)

### MASTER-U1066
Recovery effect | technology changes recoverable share, never total resource

### MASTER-U1067
Licence royalty | according to contract base and rate

### MASTER-U1068
F. 硬约束、失败与异常

### MASTER-U1069
条件 | 处理

### MASTER-U1070
Missing prerequisite | RESEARCHABLE/Project eligibility blocked

### MASTER-U1071
Licence expired | new builds blocked according to post-expiry rights；existing assets follow contract

### MASTER-U1072
Production limit exceeded | technology right prevents additional licensed output/capacity

### MASTER-U1073
Classified tech | not visible in Global Exchange

### MASTER-U1074
Insufficient research staff/equipment/funding | progress slows/stops

### MASTER-U1075
IP breach | creates Trade Dispute event

### MASTER-U1076
G. Office 权限映射

### MASTER-U1077
Office | 操作/只读权限

### MASTER-U1078
Industry | R&D、portfolio、disclosure、technical owner

### MASTER-U1079
Trade | international negotiation/contract

### MASTER-U1080
Finance | R&D funding/payments

### MASTER-U1081
Social | talent/education pipeline

### MASTER-U1082
Captain | strategic/classified transfer

### MASTER-U1083
CB | 无直接写权限

### MASTER-U1084
H. Audit Event

### MASTER-U1085
事件类型

### MASTER-U1086
RESEARCH_PROJECT_CREATED

### MASTER-U1087
RESEARCH_PROGRESS_POSTED

### MASTER-U1088
TECHNOLOGY_MASTERED

### MASTER-U1089
TECHNOLOGY_LICENCE_GRANTED

### MASTER-U1090
TECHNOLOGY_TRANSFER_STARTED

### MASTER-U1091
TECHNOLOGY_TRANSFER_COMPLETED

### MASTER-U1092
JOINT_RD_CREATED

### MASTER-U1093
TECH_DISCLOSURE_CHANGED

### MASTER-U1094
TECH_RIGHT_EXPIRED

### MASTER-U1095
IP_BREACH_DETECTED

### MASTER-U1096
I. 前端可见状态与操作

### MASTER-U1097
页面/组件 | 内容

### MASTER-U1098
Technology Portfolio | 22 technologies + state/rights

### MASTER-U1099
R&D Pipeline | progress、staff、funding、prerequisites

### MASTER-U1100
Global Technology Exchange | owners、licence availability、joint R&D、transfer、research centres、talent

### MASTER-U1101
Rights View | territory、export、production、sub-licence、expiry

### MASTER-U1102
J. 工程验收

### MASTER-U1103
□ 22 项 catalog ID 唯一稳定。

### MASTER-U1104
□ MASTERED/LICENSED 权利严格区分。

### MASTER-U1105
□ R&D 不直接加 GDP。

### MASTER-U1106
□ Technology effect 只能通过 Resource/Project/Production 等下游实体发生。

### MASTER-U1107
Engine 12 · Project & Infrastructure Engine

### MASTER-U1108
Engine Definition / 统一处理所有实体资本形成：资源、能源、工业、基础设施、研究设施、教育、医疗、住房、警务设施。项目必须经过 Owner、融资、技术、材料、劳动力、审批和施工。

### MASTER-U1109
A. Source of Truth 与权威状态

### MASTER-U1110
权威对象 | 定义

### MASTER-U1111
ProjectCatalog | Resource | Oil Field Development

### MASTER-U1112
ProjectCatalog | Resource | Gas Field Development

### MASTER-U1113
ProjectCatalog | Resource | Uranium Mine

### MASTER-U1114
ProjectCatalog | Resource | Iron Ore Mine

### MASTER-U1115
ProjectCatalog | Resource | Copper Mine

### MASTER-U1116
ProjectCatalog | Resource | Lithium Mine

### MASTER-U1117
ProjectCatalog | Energy | Gas Power Plant

### MASTER-U1118
ProjectCatalog | Energy | Fossil Power Plant

### MASTER-U1119
ProjectCatalog | Energy | Nuclear Power Plant

### MASTER-U1120
ProjectCatalog | Energy | Solar Farm

### MASTER-U1121
ProjectCatalog | Energy | Wind Farm

### MASTER-U1122
ProjectCatalog | Energy | Grid Upgrade

### MASTER-U1123
ProjectCatalog | Energy | Energy Storage Facility

### MASTER-U1124
ProjectCatalog | Industrial | Steel Mill

### MASTER-U1125
ProjectCatalog | Industrial | Refinery

### MASTER-U1126
ProjectCatalog | Industrial | Machinery Plant

### MASTER-U1127
ProjectCatalog | Industrial | Semiconductor Fab

### MASTER-U1128
ProjectCatalog | Industrial | Battery Gigafactory

### MASTER-U1129
ProjectCatalog | Industrial | Industrial Park

### MASTER-U1130
ProjectCatalog | Industrial | Special Economic Zone

### MASTER-U1131
ProjectCatalog | Infrastructure | Deepwater Port

### MASTER-U1132
ProjectCatalog | Infrastructure | Freight Railway

### MASTER-U1133
ProjectCatalog | Infrastructure | National Power Grid

### MASTER-U1134
ProjectCatalog | Infrastructure | Digital Backbone

### MASTER-U1135
ProjectCatalog | Infrastructure | Logistics Hub

### MASTER-U1136
ProjectCatalog | Infrastructure | Strategic Reserve Facility

### MASTER-U1137
ProjectCatalog | Research Infrastructure | National Research Centre

### MASTER-U1138
ProjectCatalog | Research Infrastructure | Semiconductor Research Facility

### MASTER-U1139
ProjectCatalog | Research Infrastructure | Energy Research Centre

### MASTER-U1140
ProjectCatalog | Research Infrastructure | Materials Research Centre

### MASTER-U1141
ProjectCatalog | Social Infrastructure | Basic Education Facility

### MASTER-U1142
ProjectCatalog | Social Infrastructure | Vocational Education Facility

### MASTER-U1143
ProjectCatalog | Social Infrastructure | Higher Education Facility

### MASTER-U1144
ProjectCatalog | Social Infrastructure | Primary Care Facility

### MASTER-U1145
ProjectCatalog | Social Infrastructure | Hospital / Emergency Facility

### MASTER-U1146
ProjectCatalog | Social Infrastructure | Public Housing

### MASTER-U1147
ProjectCatalog | Social Infrastructure | Worker Housing

### MASTER-U1148
ProjectCatalog | Social Infrastructure | Police / Emergency Facility

### MASTER-U1149
Project | owner_office、location、scale、planned capacity、capex、funding、inputs、labour、technology、timeline、operating cost、externalities

### MASTER-U1150
ProjectStatus | PROPOSED / TECHNICAL_REVIEW / AWAITING_FUNDING / AWAITING_INPUTS / AWAITING_TECHNOLOGY / AWAITING_APPROVAL / APPROVED / UNDER_CONSTRUCTION / DELAYED / PARTIALLY_OPERATIONAL / OPERATIONAL / SUSPENDED / CANCELLED / DECOMMISSIONED

### MASTER-U1151
InfrastructureCapacity | port throughput、rail tonnes/day、grid GW、digital coverage/capacity、logistics throughput、storage units

### MASTER-U1152
该 Engine 是以下状态的唯一 Source of Truth：project schema、approval state、funding state、input reservation、construction progress、milestones、commissioning、infrastructure capacity。

### MASTER-U1153
B. 输入

### MASTER-U1154
输入来源 | 输入

### MASTER-U1155
Finance | funding package / payment release

### MASTER-U1156
Resource/Inventory | construction materials

### MASTER-U1157
Labour | construction/operating workers

### MASTER-U1158
Technology | required rights

### MASTER-U1159
Trade | foreign inputs/FDI/finance

### MASTER-U1160
Energy | construction/operation energy

### MASTER-U1161
Governance | required approvals

### MASTER-U1162
C. 输出与下游依赖

### MASTER-U1163
下游 Engine | 输出

### MASTER-U1164
Production/Resource/Energy | new capacity

### MASTER-U1165
Education/Healthcare/Housing/Public Safety | new service capacity

### MASTER-U1166
Infrastructure | logistics/grid/digital bottleneck changes

### MASTER-U1167
Fiscal | future operating commitments

### MASTER-U1168
Labour | permanent job demand

### MASTER-U1169
National Accounts | capital formation when construction value is created

### MASTER-U1170
D. 允许动作 / 状态转换

### MASTER-U1171
动作或系统事件 | 完整效果

### MASTER-U1172
Create Project | Owner Office creates technical/need proposal

### MASTER-U1173
Modify Scale/Location/Technology | before locked milestones; material change invalidates approvals

### MASTER-U1174
Request Funding | to Finance

### MASTER-U1175
Request External Supply | to Trade

### MASTER-U1176
Request Workforce | to Social

### MASTER-U1177
Request Technology | to Trade/Technology

### MASTER-U1178
Approve/Reject | required offices per rules

### MASTER-U1179
Start Construction | all hard prerequisites satisfied

### MASTER-U1180
Prioritise/Pause/Resume | affects resource allocation/time

### MASTER-U1181
Reduce Scale | recomputes capex/inputs/capacity

### MASTER-U1182
Commission | after physical completion/testing

### MASTER-U1183
Decommission | removes operational capacity according to rules

### MASTER-U1184
E. 核心计算

### MASTER-U1185
计算 | 规则

### MASTER-U1186
Construction progress | f(funding released, materials delivered, labour available, admin/oversight capacity) capped by weakest required component

### MASTER-U1187
Funding gap | total cost - committed secured financing

### MASTER-U1188
Input reservation | remaining required materials - delivered/consumed materials

### MASTER-U1189
Completion | all mandatory milestones complete and commissioning passed

### MASTER-U1190
Capital formation | construction value completed during day, not full capex at signature

### MASTER-U1191
F. 硬约束、失败与异常

### MASTER-U1192
条件 | 处理

### MASTER-U1193
Funding incomplete | cannot progress beyond funded milestone

### MASTER-U1194
Material shortage | delay

### MASTER-U1195
Technology right missing/expired | cannot start relevant technical milestone

### MASTER-U1196
Labour shortage | progress scaled

### MASTER-U1197
Approval invalidated by material version change | return Awaiting Approval

### MASTER-U1198
Foreign shipment delayed | linked project delay

### MASTER-U1199
Cancellation | unused reserved inputs/funding released according to contract

### MASTER-U1200
G. Office 权限映射

### MASTER-U1201
Office | 操作/只读权限

### MASTER-U1202
Industry | Owner for resource/energy/industrial/infrastructure/research projects

### MASTER-U1203
Social | Need Owner for education/health/housing/police facilities

### MASTER-U1204
Trade | Owner for customs/logistics international-facing projects when designated; foreign components

### MASTER-U1205
Finance | financing authority

### MASTER-U1206
Captain | strategic/large final approval

### MASTER-U1207
CB | only if major FX/refinancing/systemic financial channel

### MASTER-U1208
H. Audit Event

### MASTER-U1209
事件类型

### MASTER-U1210
PROJECT_CREATED

### MASTER-U1211
PROJECT_VERSION_CHANGED

### MASTER-U1212
PROJECT_FUNDING_REQUESTED

### MASTER-U1213
PROJECT_FUNDED

### MASTER-U1214
PROJECT_INPUT_RESERVED

### MASTER-U1215
PROJECT_CONSTRUCTION_STARTED

### MASTER-U1216
PROJECT_PROGRESS_POSTED

### MASTER-U1217
PROJECT_DELAYED

### MASTER-U1218
PROJECT_PAUSED

### MASTER-U1219
PROJECT_RESUMED

### MASTER-U1220
PROJECT_COMMISSIONED

### MASTER-U1221
PROJECT_CANCELLED

### MASTER-U1222
PROJECT_DECOMMISSIONED

### MASTER-U1223
I. 前端可见状态与操作

### MASTER-U1224
页面/组件 | 内容

### MASTER-U1225
Project Pipeline | status、progress、funding、inputs、labour、technology、approvals

### MASTER-U1226
Joint Project Committee | Owner + required offices + versioned decisions

### MASTER-U1227
Infrastructure Map | capacity and bottlenecks

### MASTER-U1228
Milestone Timeline | simulation dates + real countdown under 10×

### MASTER-U1229
J. 工程验收

### MASTER-U1230
□ 项目不能在缺资金/材料/技术/劳动力/审批时开工。

### MASTER-U1231
□ Construction 消耗真实材料。

### MASTER-U1232
□ Commission 后才增加 operating capacity。

### MASTER-U1233
□ Social infrastructure 使用同一 Project Engine。

### MASTER-U1234
□ 项目版本修改正确重置审批。

### MASTER-U1235
Engine 13 · Household & Demand Engine

### MASTER-U1236
Engine Definition / 把工资、税、福利、利息、住房和价格转化为家庭可支配资源与最终消费需求，是 Aggregate Demand、生活成本、贫困和部分银行信贷需求的核心。

### MASTER-U1237
A. Source of Truth 与权威状态

### MASTER-U1238
权威对象 | 定义

### MASTER-U1239
IncomeGroup | LOW / MIDDLE / HIGH / UNEMPLOYED / RETIRED

### MASTER-U1240
HouseholdAccount | population/households、gross wage income、capital income、transfers、direct taxes、debt service、deposits

### MASTER-U1241
ConsumptionBasket | Food、Energy、Housing、Basic/General Consumption、Services

### MASTER-U1242
HouseholdDebt | consumer loan、mortgage outstanding、interest/payment

### MASTER-U1243
DisposableState | disposable income、disposable resources、real margin

### MASTER-U1244
该 Engine 是以下状态的唯一 Source of Truth：household groups、income、taxes、transfers、deposits、consumer/mortgage debt、essential basket、consumption demand。

### MASTER-U1245
B. 输入

### MASTER-U1246
输入来源 | 输入

### MASTER-U1247
Labour | employment/wages

### MASTER-U1248
Fiscal/Social | PIT、payroll incidence、transfers、benefits

### MASTER-U1249
Banking | consumer credit/mortgage/debt service

### MASTER-U1250
Prices | food/energy/housing/general/services prices

### MASTER-U1251
Population/Housing | households and rent/mortgage

### MASTER-U1252
CB | policy rate through loan/mortgage rates

### MASTER-U1253
C. 输出与下游依赖

### MASTER-U1254
下游 Engine | 输出

### MASTER-U1255
Production/Market | final consumption demand

### MASTER-U1256
Fiscal | VAT/PIT bases

### MASTER-U1257
Banking | credit demand/default risk

### MASTER-U1258
Housing | demand/affordability

### MASTER-U1259
Social | poverty/real margin

### MASTER-U1260
National Accounts | C and household saving

### MASTER-U1261
D. 允许动作 / 状态转换

### MASTER-U1262
动作或系统事件 | 完整效果

### MASTER-U1263
Receive Wages | daily accrued/paid according to payroll schedule

### MASTER-U1264
Receive Transfers | only after Treasury payment event

### MASTER-U1265
Pay Direct Tax | via Fiscal settlement

### MASTER-U1266
Service Debt | interest/principal payment

### MASTER-U1267
Consume | allocate budget to basket under prices/income

### MASTER-U1268
Borrow Consumer/Mortgage | if Banking approves

### MASTER-U1269
Save / Deposit | residual resources change deposits

### MASTER-U1270
E. 核心计算

### MASTER-U1271
计算 | 规则

### MASTER-U1272
Gross income | wages + capital income + transfers before direct tax classification as specified

### MASTER-U1273
Disposable income | gross income - direct taxes + eligible cash transfers if transfers modeled separately from gross

### MASTER-U1274
Disposable resources | disposable income + new credit - debt service

### MASTER-U1275
Essential living cost | food + energy + housing + basic consumption

### MASTER-U1276
Real margin | disposable income - essential living cost

### MASTER-U1277
Consumption demand | f(disposable resources, prices, interest rates, confidence proxies only if derived from real history)

### MASTER-U1278
Saving | disposable resources - consumption spending

### MASTER-U1279
F. 硬约束、失败与异常

### MASTER-U1280
条件 | 处理

### MASTER-U1281
Transfer approved but unpaid | 不进入 household income，形成 welfare payment delay

### MASTER-U1282
Credit denied | household demand adjusts; no fictional borrowing

### MASTER-U1283
Negative real margin | records stress/arrears according to household rules

### MASTER-U1284
Housing shortage | housing cost/availability constraint applies

### MASTER-U1285
Price spike | changes basket cost directly

### MASTER-U1286
G. Office 权限映射

### MASTER-U1287
Office | 操作/只读权限

### MASTER-U1288
Social | income group/welfare/poverty views；不能直接 set consumption

### MASTER-U1289
Finance | tax rules

### MASTER-U1290
CB | interest conditions

### MASTER-U1291
Industry/Trade | 只读 demand signals

### MASTER-U1292
Captain | national household stress summary

### MASTER-U1293
H. Audit Event

### MASTER-U1294
事件类型

### MASTER-U1295
HOUSEHOLD_WAGE_RECEIVED

### MASTER-U1296
HOUSEHOLD_TRANSFER_RECEIVED

### MASTER-U1297
HOUSEHOLD_TAX_PAID

### MASTER-U1298
HOUSEHOLD_DEBT_SERVICE_PAID

### MASTER-U1299
HOUSEHOLD_CONSUMPTION_POSTED

### MASTER-U1300
HOUSEHOLD_CREDIT_RECEIVED

### MASTER-U1301
HOUSEHOLD_SAVING_POSTED

### MASTER-U1302
I. 前端可见状态与操作

### MASTER-U1303
页面/组件 | 内容

### MASTER-U1304
Household Dashboard | income、tax、transfer、debt service、basket cost、real margin

### MASTER-U1305
Demand View | final consumption by category

### MASTER-U1306
Distribution View | five income groups

### MASTER-U1307
Affordability | housing/food/energy burden

### MASTER-U1308
J. 工程验收

### MASTER-U1309
□ Transfers only count after payment.

### MASTER-U1310
□ Consumption is final demand, not intermediate/project demand.

### MASTER-U1311
□ Household debt connects to Banking balance sheet.

### MASTER-U1312
□ C in GDP derives only from actual final consumption.

### MASTER-U1313
Engine 14 · Fiscal & Treasury Engine

### MASTER-U1314
Engine Definition / 政府唯一财政账本：税收、Treasury Account、预算、承诺、付款、债务、担保、财政资产、SOE 财政关系、项目融资与财政风险。

### MASTER-U1315
A. Source of Truth 与权威状态

### MASTER-U1316
权威对象 | 定义

### MASTER-U1317
TreasuryGeneralAccount | cash at Central Bank

### MASTER-U1318
TaxSystem | VAT、PIT schedule、Corporate Tax、Payroll Tax、Tariff revenue receipt、tax credits/expenditures

### MASTER-U1319
BudgetLine | appropriated、committed、spent、remaining、payment schedule

### MASTER-U1320
MandatoryObligation | interest、principal、pension、welfare、payroll、contract/project commitments

### MASTER-U1321
DebtInstrument | currency、principal、coupon、price、maturity、holder、domestic/foreign

### MASTER-U1322
Guarantee | beneficiary、lender、principal、coverage、fee、max exposure、trigger

### MASTER-U1323
FiscalAsset | SOE equity、other government assets

### MASTER-U1324
Arrear | payee、amount、due、priority、penalty

### MASTER-U1325
该 Engine 是以下状态的唯一 Source of Truth：Treasury cash、tax liabilities/collections、budget appropriations/commitments/spending、public debt、guarantees、fiscal assets、arrears。

### MASTER-U1326
B. 输入

### MASTER-U1327
输入来源 | 输入

### MASTER-U1328
Household/Production | tax bases

### MASTER-U1329
Trade | tariff revenue/customs and external finance

### MASTER-U1330
Project/Social/Public Services | funding/payment requests

### MASTER-U1331
Banking/CB | TGA、bond buyers、monetary financing interface

### MASTER-U1332
Time | due schedules

### MASTER-U1333
Governance | budget/major approvals

### MASTER-U1334
C. 输出与下游依赖

### MASTER-U1335
下游 Engine | 输出

### MASTER-U1336
Household/Firms | tax/payment transfers

### MASTER-U1337
Project/Public Services | actual funding/payment

### MASTER-U1338
CB/Banking | TGA/reserves interaction、government securities

### MASTER-U1339
National Accounts | G、taxes/subsidies、fiscal balance

### MASTER-U1340
Risk | debt service/arrears/guarantee risk

### MASTER-U1341
D. 允许动作 / 状态转换

### MASTER-U1342
动作或系统事件 | 完整效果

### MASTER-U1343
Set VAT/PIT/CIT/Payroll Tax | Finance

### MASTER-U1344
Create Tax Credit/Expenditure | Finance；target inputs from relevant Office

### MASTER-U1345
Approve Department Envelope | Finance

### MASTER-U1346
Create/Amend Budget Line | Finance

### MASTER-U1347
Pay Now / Schedule / Delay Eligible Payment | Finance

### MASTER-U1348
Issue T-bill/Bond/FX Bond/Emergency/Project Bond | Finance

### MASTER-U1349
Refinance/Buyback/Exchange | Finance

### MASTER-U1350
Create Project Financing Package | Finance

### MASTER-U1351
Approve/Price Guarantee | Finance

### MASTER-U1352
SOE Equity Injection/Dividend/Asset Sale | Finance

### MASTER-U1353
Invoke Fiscal Exception | Finance + governance rules

### MASTER-U1354
Emergency Reallocation/Freeze/Reserve Draw | Finance

### MASTER-U1355
Debt Restructuring / Monetary Financing | shared approval

### MASTER-U1356
E. 核心计算

### MASTER-U1357
计算 | 规则

### MASTER-U1358
VAT | taxable consumption × rate × compliance

### MASTER-U1359
PIT | sum taxable income by bands × marginal rates less allowances

### MASTER-U1360
CIT | taxable corporate profit × rate

### MASTER-U1361
Payroll | payroll base × rates/credits

### MASTER-U1362
Primary balance | revenue - non-interest spending

### MASTER-U1363
Overall balance | revenue - total spending

### MASTER-U1364
Debt stock | prior debt + new borrowing - principal repaid ± recognised restructuring

### MASTER-U1365
Available fiscal capacity | cash + feasible financing - mandatory payments - minimum buffer

### MASTER-U1366
Guarantee exposure | covered outstanding principal capped by max exposure

### MASTER-U1367
F. 硬约束、失败与异常

### MASTER-U1368
条件 | 处理

### MASTER-U1369
No cash | payment blocked or arrear unless financing closes gap

### MASTER-U1370
Bond undersubscribed | only actual proceeds enter Treasury

### MASTER-U1371
Guarantee trigger | creates real Treasury obligation

### MASTER-U1372
Foreign debt FX movement | LC value changes via FX Engine

### MASTER-U1373
Budget appropriation without cash | not equal paid spending

### MASTER-U1374
Transfer spending | not counted as G in GDP; enters household income

### MASTER-U1375
G. Office 权限映射

### MASTER-U1376
Office | 操作/只读权限

### MASTER-U1377
Finance | 完整写权限

### MASTER-U1378
Captain | 重大财政/战略/紧急批准

### MASTER-U1379
CB | TGA、monetary financing、debt/financial stability interface

### MASTER-U1380
Trade | external finance/tariff input

### MASTER-U1381
Industry | project funding requests

### MASTER-U1382
Social | programme/public service funding requests

### MASTER-U1383
H. Audit Event

### MASTER-U1384
事件类型

### MASTER-U1385
TAX_RULE_CHANGED

### MASTER-U1386
TAX_LIABILITY_ACCRUED

### MASTER-U1387
TAX_COLLECTED

### MASTER-U1388
BUDGET_APPROPRIATED

### MASTER-U1389
BUDGET_COMMITTED

### MASTER-U1390
TREASURY_PAYMENT_POSTED

### MASTER-U1391
PAYMENT_ARREAR_CREATED

### MASTER-U1392
BOND_ISSUED

### MASTER-U1393
DEBT_REPAID

### MASTER-U1394
DEBT_REFINANCED

### MASTER-U1395
GUARANTEE_CREATED

### MASTER-U1396
GUARANTEE_TRIGGERED

### MASTER-U1397
FISCAL_ASSET_SOLD

### MASTER-U1398
MONETARY_FINANCING_POSTED

### MASTER-U1399
I. 前端可见状态与操作

### MASTER-U1400
页面/组件 | 内容

### MASTER-U1401
Treasury Dashboard | cash、receivables、payables、7/30/60-day forecast

### MASTER-U1402
Tax | bases、liability、collection、gap

### MASTER-U1403
Budget | appropriation/commitment/spent

### MASTER-U1404
Debt | instruments、yield、maturity ladder、FX share

### MASTER-U1405
Guarantee/SOE | contingent exposure

### MASTER-U1406
Fiscal Outlook | baseline/current/stress

### MASTER-U1407
J. 工程验收

### MASTER-U1408
□ Treasury cash 与 CB TGA 完全一致。

### MASTER-U1409
□ 债券只有实际发行/成交金额进入 cash。

### MASTER-U1410
□ 福利 transfer 不进入 G。

### MASTER-U1411
□ Debt instrument schedules 在 10× time 下正确到期。

### MASTER-U1412
□ 预算、承诺、付款三者严格区分。

### MASTER-U1413
Engine 15 · Banking & Monetary Engine

### MASTER-U1414
Engine Definition / 统一中央银行与全国聚合商业银行的资产负债表、货币供应、信贷、准备金、资本、NPL、货币政策、OMO、再融资、ELA 与金融稳定。

### MASTER-U1415
A. Source of Truth 与权威状态

### MASTER-U1416
权威对象 | 定义

### MASTER-U1417
CentralBankAssets | FX cash/deposits、foreign securities、swap receivables、gold/other reserves、domestic gov securities、refinancing loans、ELA

### MASTER-U1418
CentralBankLiabilities | currency in circulation、bank reserves、Treasury deposit、CB bills/deposits、swap payables、interest payable

### MASTER-U1419
CentralBankEquity | capital、retained earnings、valuation reserve、losses

### MASTER-U1420
BankAssets | reserves、household loans、mortgages、sector corporate loans、government securities、foreign assets、other

### MASTER-U1421
BankLiabilities | demand deposits、savings/time deposits、wholesale funding、foreign borrowing、CB borrowing、equity

### MASTER-U1422
MoneyAggregates | C、R、DD、SD、MB、M1、M2

### MASTER-U1423
CreditBySector | household consumer、mortgage、agriculture/food、mining/resources、energy/utilities、manufacturing、technology/semiconductor、construction/infrastructure、trade/logistics、services/SMEs、SOE/public enterprise

### MASTER-U1424
该 Engine 是以下状态的唯一 Source of Truth：CB balance sheet、commercial banking aggregate balance sheet、M0/MB/M1/M2、sector credit、NPL、reserves、capital、policy tools。

### MASTER-U1425
B. 输入

### MASTER-U1426
输入来源 | 输入

### MASTER-U1427
Fiscal | Treasury flows、government debt securities

### MASTER-U1428
Household/Production/Project | credit demand and repayments

### MASTER-U1429
FX | reserve valuation/flows

### MASTER-U1430
Trade | foreign funding/sanctions

### MASTER-U1431
National Accounts/Prices | inflation/growth context

### MASTER-U1432
CB Controller | policy tools

### MASTER-U1433
C. 输出与下游依赖

### MASTER-U1434
下游 Engine | 输出

### MASTER-U1435
Household/Production | loan supply/rates

### MASTER-U1436
Fiscal | bond yields/liquidity/TGA effects

### MASTER-U1437
FX | interest differential and official intervention settlement

### MASTER-U1438
National Accounts | money/credit stats、interest income

### MASTER-U1439
Risk | bank liquidity/capital/solvency

### MASTER-U1440
D. 允许动作 / 状态转换

### MASTER-U1441
动作或系统事件 | 完整效果

### MASTER-U1442
Set Policy Rate | CB exact %

### MASTER-U1443
Set Inflation Target/Tolerance | CB

### MASTER-U1444
OMO Buy/Sell Government Securities | exact LC secondary-market transaction

### MASTER-U1445
Set Reserve Requirement | CB

### MASTER-U1446
Set Base Capital Requirement/CCyB | CB

### MASTER-U1447
Create Targeted Refinancing Facility | CB by sector/limit/rate/maturity/collateral

### MASTER-U1448
Draw/Repay Refinancing | bank/system based on facility use

### MASTER-U1449
Provide ELA | CB exact principal/rate/maturity/collateral/haircut

### MASTER-U1450
Create/Repay Commercial Loan | bank endogenous subject to capital/liquidity/risk

### MASTER-U1451
Recognise NPL/Provision/Loss | based on borrower default

### MASTER-U1452
Bank Recapitalisation | Finance + CB + Captain shared

### MASTER-U1453
Direct Monetary Financing | Finance + CB + Captain

### MASTER-U1454
E. 核心计算

### MASTER-U1455
计算 | 规则

### MASTER-U1456
MB | C + R

### MASTER-U1457
M1 | C + DemandDeposits

### MASTER-U1458
M2 | M1 + SavingsTimeDeposits

### MASTER-U1459
Required reserves | reservable deposits × RR

### MASTER-U1460
Excess reserves | actual reserves - required reserves

### MASTER-U1461
Total capital requirement | base + CCyB

### MASTER-U1462
Required capital | RWA × total capital requirement

### MASTER-U1463
Capital headroom | bank equity - required capital

### MASTER-U1464
Loan rate | policy rate + bank spread + sector risk premium

### MASTER-U1465
NPL ratio | NPL amount / total loans

### MASTER-U1466
Daily interest | principal × annual rate / 360

### MASTER-U1467
F. 硬约束、失败与异常

### MASTER-U1468
条件 | 处理

### MASTER-U1469
Balance sheet mismatch | settlement fails; no partial commit

### MASTER-U1470
Reserve shortfall | bank must obtain liquidity/reduce payments according to rules

### MASTER-U1471
Capital shortfall | new lending constrained; resolution/recap may trigger

### MASTER-U1472
ELA to insolvent bank | requires resolution/fiscal path; liquidity ≠ solvency

### MASTER-U1473
OMO insufficient security/reserves | transaction limited to available asset/counterparty balance

### MASTER-U1474
M2 direct edit | forbidden; only result of deposits/loans/currency flows

### MASTER-U1475
G. Office 权限映射

### MASTER-U1476
Office | 操作/只读权限

### MASTER-U1477
Central Bank | 货币/银行核心写权限

### MASTER-U1478
Finance | Treasury、bank recap/monetary financing shared

### MASTER-U1479
Captain | 重大金融危机/shared actions

### MASTER-U1480
Trade | capital controls/sanctions/reserve swap shared

### MASTER-U1481
Industry/Social | 只读 credit conditions / request targeted facility indirectly

### MASTER-U1482
H. Audit Event

### MASTER-U1483
事件类型

### MASTER-U1484
POLICY_RATE_CHANGED

### MASTER-U1485
INFLATION_TARGET_CHANGED

### MASTER-U1486
OMO_BUY_SETTLED

### MASTER-U1487
OMO_SELL_SETTLED

### MASTER-U1488
RESERVE_REQUIREMENT_CHANGED

### MASTER-U1489
CAPITAL_REQUIREMENT_CHANGED

### MASTER-U1490
REFINANCING_FACILITY_CREATED

### MASTER-U1491
REFINANCING_DRAWN

### MASTER-U1492
ELA_GRANTED

### MASTER-U1493
COMMERCIAL_LOAN_CREATED

### MASTER-U1494
LOAN_REPAID

### MASTER-U1495
NPL_RECOGNISED

### MASTER-U1496
BANK_CAPITAL_LOSS_POSTED

### MASTER-U1497
BANK_RECAPITALISED

### MASTER-U1498
I. 前端可见状态与操作

### MASTER-U1499
页面/组件 | 内容

### MASTER-U1500
CB Overview | policy、inflation、money、reserves、bank capital/liquidity

### MASTER-U1501
Balance Sheets | full CB and banking ledgers

### MASTER-U1502
Credit | sector loans/rates/NPL

### MASTER-U1503
Facilities | refinancing/ELA

### MASTER-U1504
Shared Decisions | capital controls、resolution、monetary financing

### MASTER-U1505
J. 工程验收

### MASTER-U1506
□ CB 与银行资产负债表每次交易后恒等。

### MASTER-U1507
□ Loans create deposits under defined accounting.

### MASTER-U1508
□ M2 无直接 setter。

### MASTER-U1509
□ Fiscal TGA 与 CB liability 一致。

### MASTER-U1510
□ 所有 annual rate 在 360-day sim year 下计息。

### MASTER-U1511
Engine 16 · Trade, Contract & Global Market Engine

### MASTER-U1512
Engine Definition / 70 国跨境商品、合同、关税、配额、物流、FDI、技术协议、主权贷款、资源/基础设施协议、条约、制裁、援助、招标和争端的世界级网络。

### MASTER-U1513
A. Source of Truth 与权威状态

### MASTER-U1514
权威对象 | 定义

### MASTER-U1515
GlobalCommodityBook | 12 commodities、buy/sell orders、fills、benchmark price、available spot supply

### MASTER-U1516
TariffRule | general / bilateral / treaty rate by importer×exporter×commodity

### MASTER-U1517
QuotaRule | global/country-specific import quota、export cap/ban

### MASTER-U1518
MarketOrder | side、commodity、qty、remaining、limit price、currency、delivery window

### MASTER-U1519
Shipment | commodity、qty、origin/destination、dispatch/arrival、transport/insurance、status

### MASTER-U1520
Negotiation | activity type、parties、version、offer/counteroffer、internal approvals

### MASTER-U1521
Contract | type、parties、signed version、status、start/end、obligations

### MASTER-U1522
CrossBorderAsset | FDI equity、loan principal、ownership/right

### MASTER-U1523
Commodity Supply Agreement | 固定跨国活动类型

### MASTER-U1524
Technology Licence | 固定跨国活动类型

### MASTER-U1525
Foreign Direct Investment | 固定跨国活动类型

### MASTER-U1526
Sovereign Loan | 固定跨国活动类型

### MASTER-U1527
Infrastructure Finance | 固定跨国活动类型

### MASTER-U1528
Resource Development Agreement | 固定跨国活动类型

### MASTER-U1529
Joint International Project | 固定跨国活动类型

### MASTER-U1530
Preferential Trade Agreement | 固定跨国活动类型

### MASTER-U1531
Free Trade Agreement | 固定跨国活动类型

### MASTER-U1532
Customs Cooperation Agreement | 固定跨国活动类型

### MASTER-U1533
Sector Market Access Agreement | 固定跨国活动类型

### MASTER-U1534
Multilateral Economic Agreement | 固定跨国活动类型

### MASTER-U1535
Reserve Swap | 固定跨国活动类型

### MASTER-U1536
Sanction Package | 固定跨国活动类型

### MASTER-U1537
Grant Aid | 固定跨国活动类型

### MASTER-U1538
Commodity Aid | 固定跨国活动类型

### MASTER-U1539
Emergency Concessional Loan | 固定跨国活动类型

### MASTER-U1540
Emergency Supply Contract | 固定跨国活动类型

### MASTER-U1541
Technical Assistance | 固定跨国活动类型

### MASTER-U1542
Project Reconstruction Aid | 固定跨国活动类型

### MASTER-U1543
International Tender | 固定跨国活动类型

### MASTER-U1544
Strategic Economic Partnership | 固定跨国活动类型

### MASTER-U1545
Trade Dispute Settlement | 固定跨国活动类型

### MASTER-U1546
该 Engine 是以下状态的唯一 Source of Truth：global commodity order books、trade rules、shipments、contracts/versions/obligations、FDI/ownership、treaties/sanctions/aid/tenders/disputes。

### MASTER-U1547
B. 输入

### MASTER-U1548
输入来源 | 输入

### MASTER-U1549
Resource/Inventory | exportable supply/import need

### MASTER-U1550
Production/Household/Project | commodity demand

### MASTER-U1551
FX/Banking/Fiscal | payment ability

### MASTER-U1552
Technology | licence rights

### MASTER-U1553
Governance | approvals/strategic treaty

### MASTER-U1554
Time | delivery/payment/expiry

### MASTER-U1555
C. 输出与下游依赖

### MASTER-U1556
下游 Engine | 输出

### MASTER-U1557
Inventory | delivered import/export

### MASTER-U1558
FX | payment demand/supply

### MASTER-U1559
Fiscal | tariff revenue、sovereign finance

### MASTER-U1560
Technology | rights

### MASTER-U1561
Project | FDI/foreign inputs/finance

### MASTER-U1562
National Accounts | X/M/current account

### MASTER-U1563
Risk | supply concentration/contract default

### MASTER-U1564
D. 允许动作 / 状态转换

### MASTER-U1565
动作或系统事件 | 完整效果

### MASTER-U1566
Place Buy/Sell Order | Trade；standard commodity spot

### MASTER-U1567
Match/Fill | market engine continuous

### MASTER-U1568
Set General Tariff | Trade by commodity

### MASTER-U1569
Set Bilateral Tariff Override | Trade by country×commodity

### MASTER-U1570
Set Import Quota / Export Cap / Ban | Trade

### MASTER-U1571
Start Negotiation / Offer / Counteroffer | Trade and relevant owners

### MASTER-U1572
Request Internal Approval | versioned

### MASTER-U1573
Sign/Activate Contract | after required approvals

### MASTER-U1574
Create Shipment/Delivery | from fill/contract obligation

### MASTER-U1575
Renegotiate/Suspend/Terminate | according to contract clause

### MASTER-U1576
Create FDI/Loan/Infrastructure/Resource/Joint Project Agreement | structured schemas

### MASTER-U1577
Create PTA/FTA/Treaty | tariff/market rules

### MASTER-U1578
Create Sanction Package | specific measures/exemptions

### MASTER-U1579
Create Aid | real money/goods/right

### MASTER-U1580
Publish Tender / Receive Bid / Award | structured

### MASTER-U1581
File/Settle Dispute | compensation/replacement/tariff/etc.

### MASTER-U1582
E. 核心计算

### MASTER-U1583
计算 | 规则

### MASTER-U1584
Effective tariff | Sanction/ban > treaty > bilateral override > general tariff

### MASTER-U1585
Tariff revenue | customs value × effective tariff

### MASTER-U1586
Landed cost | goods value + transport + insurance + tariff + border fees

### MASTER-U1587
Quota remaining | limit - delivered - binding reserved obligations

### MASTER-U1588
Supplier share | imports from partner / total commodity imports

### MASTER-U1589
HHI | Σ supplier_share²

### MASTER-U1590
Contract payment | delivered qty × contract price + allocated costs + fees - credits/penalties

### MASTER-U1591
Exportable supply/import need | reads Resource Engine authoritative calculation

### MASTER-U1592
F. 硬约束、失败与异常

### MASTER-U1593
条件 | 处理

### MASTER-U1594
Seller no inventory | partial delivery/default, no negative inventory

### MASTER-U1595
Buyer no payment/FX | late/default/financing request

### MASTER-U1596
Quota exhausted/ban/sanction | shipment/order blocked

### MASTER-U1597
Contract version changed | prior internal approval invalid

### MASTER-U1598
Delivery delayed | project/production downstream sees delay

### MASTER-U1599
Treaty violation | creates dispute; rule not silently overwritten

### MASTER-U1600
Ordinary private trade | does not directly use official reserves

### MASTER-U1601
G. Office 权限映射

### MASTER-U1602
Office | 操作/只读权限

### MASTER-U1603
Trade | 核心写权限

### MASTER-U1604
Industry | technology/resource/project owner approvals

### MASTER-U1605
Finance | sovereign finance/guarantee/Treasury payment

### MASTER-U1606
CB | reserve swap/capital controls/official FX/financial sanctions

### MASTER-U1607
Captain | FTA/strategic partnership/major sanctions/strategic deals

### MASTER-U1608
Social | talent/migration labour terms

### MASTER-U1609
H. Audit Event

### MASTER-U1610
事件类型

### MASTER-U1611
MARKET_ORDER_PLACED

### MASTER-U1612
MARKET_FILL_CREATED

### MASTER-U1613
TARIFF_RULE_CHANGED

### MASTER-U1614
QUOTA_RULE_CHANGED

### MASTER-U1615
NEGOTIATION_STARTED

### MASTER-U1616
OFFER_SENT

### MASTER-U1617
COUNTEROFFER_SENT

### MASTER-U1618
INTERNAL_APPROVAL_REQUESTED

### MASTER-U1619
CONTRACT_SIGNED

### MASTER-U1620
CONTRACT_ACTIVATED

### MASTER-U1621
SHIPMENT_DISPATCHED

### MASTER-U1622
SHIPMENT_DELIVERED

### MASTER-U1623
DELIVERY_SHORTFALL

### MASTER-U1624
PAYMENT_DEFAULT_REPORTED

### MASTER-U1625
CONTRACT_RENEGOTIATED

### MASTER-U1626
FDI_CREATED

### MASTER-U1627
SOVEREIGN_LOAN_CREATED

### MASTER-U1628
TREATY_ACTIVATED

### MASTER-U1629
SANCTION_APPLIED

### MASTER-U1630
TENDER_PUBLISHED

### MASTER-U1631
BID_RECEIVED

### MASTER-U1632
DISPUTE_FILED

### MASTER-U1633
SETTLEMENT_SIGNED

### MASTER-U1634
I. 前端可见状态与操作

### MASTER-U1635
页面/组件 | 内容

### MASTER-U1636
Global Market | 12 commodity books、price、supply/demand

### MASTER-U1637
Negotiations | versioned rooms

### MASTER-U1638
Contracts | obligations/state

### MASTER-U1639
Tariffs/Controls | country×commodity matrix

### MASTER-U1640
Shipments | in transit/arrival/delay

### MASTER-U1641
Partner Profile | bilateral trade/investment/debt/tech/treaty

### MASTER-U1642
Tender/Dispute | bids and settlements

### MASTER-U1643
J. 工程验收

### MASTER-U1644
□ Tariff matrix country×commodity works for 70 countries without manual full-grid editing.

### MASTER-U1645
□ All international goods have shipment + payment.

### MASTER-U1646
□ Contract approvals are version-bound.

### MASTER-U1647
□ Delivered—not signed—trade enters inventory and X/M.

### MASTER-U1648
□ Cross-border contracts never create abstract relationship buffs.

### MASTER-U1649
Engine 17 · FX & International Finance Engine

### MASTER-U1650
Engine Definition / 以 GCU 为统一国际结算锚，管理 70 条本币/GCU 汇率、FX demand/supply、资本流、外债、利润汇回、官方储备与干预结算；避免 70×69 双边汇率。

### MASTER-U1651
A. Source of Truth 与权威状态

### MASTER-U1652
权威对象 | 定义

### MASTER-U1653
Currency | country currency code/name/symbol

### MASTER-U1654
FXRate | 1 GCU = X LC、reciprocal

### MASTER-U1655
FXFlow | trade demand/supply、debt service、FDI、profit repatriation、capital inflow/outflow

### MASTER-U1656
OfficialReserve | gross、committed、encumbered、usable GCU assets from CB ledger

### MASTER-U1657
FXIntervention | buy/sell GCU、LC settlement、sterilisation link

### MASTER-U1658
ForeignDebtPosition | currency、principal、interest、maturity、LC equivalent

### MASTER-U1659
CapitalControlRule | transaction category、threshold/tax/approval/holding period

### MASTER-U1660
该 Engine 是以下状态的唯一 Source of Truth：LC/GCU exchange rate、FX flow book、capital flows、official reserves interface、foreign-currency debt valuation、FDI income flows。

### MASTER-U1661
B. 输入

### MASTER-U1662
输入来源 | 输入

### MASTER-U1663
Trade | import/export payments、FDI、loans

### MASTER-U1664
Fiscal | foreign debt/government payments

### MASTER-U1665
Banking/CB | policy rate、reserves、intervention

### MASTER-U1666
Household/Firms | capital flows if enabled

### MASTER-U1667
National Accounts | inflation/current account context

### MASTER-U1668
C. 输出与下游依赖

### MASTER-U1669
下游 Engine | 输出

### MASTER-U1670
Trade | settlement currency availability

### MASTER-U1671
Fiscal | LC value of FX debt

### MASTER-U1672
Banking | foreign funding/assets

### MASTER-U1673
Prices | import price via FX

### MASTER-U1674
National Accounts | capital/current account、reserve changes

### MASTER-U1675
Risk | FX liquidity/reserve adequacy

### MASTER-U1676
D. 允许动作 / 状态转换

### MASTER-U1677
动作或系统事件 | 完整效果

### MASTER-U1678
Convert LC↔GCU in private FX market | creates demand/supply, not official reserve change

### MASTER-U1679
Settle Cross-border Payment | use prevailing/contract FX mechanism

### MASTER-U1680
FX Intervention Sell GCU | CB reserves ↓、LC liquidity effect

### MASTER-U1681
FX Intervention Buy GCU | CB reserves ↑、LC liquidity effect

### MASTER-U1682
Sterilise | OMO offset of domestic liquidity

### MASTER-U1683
Official FX Allocation | requesting office → CB approve/partial/reject

### MASTER-U1684
Capital Controls | Trade + CB + Captain structured rule

### MASTER-U1685
Reserve Swap | Trade + CB + Captain

### MASTER-U1686
Profit Repatriation | FDI owner income outflow

### MASTER-U1687
Foreign Debt Service | creates FX demand and liability reduction

### MASTER-U1688
E. 核心计算

### MASTER-U1689
计算 | 规则

### MASTER-U1690
Net FX demand | imports + debt service + profit repatriation + capital outflow + foreign asset purchase - exports - FDI inflow - foreign borrowing - capital inflow - foreign income

### MASTER-U1691
FX movement | f(net FX demand, interest differential, inflation expectation, capital flow, official intervention)

### MASTER-U1692
Import price LC | GCU price × LC/GCU FX + trade costs

### MASTER-U1693
Usable reserves | gross - committed - encumbered

### MASTER-U1694
Import cover | usable reserves / monthly critical imports

### MASTER-U1695
FX debt LC value | GCU debt × LC/GCU rate

### MASTER-U1696
F. 硬约束、失败与异常

### MASTER-U1697
条件 | 处理

### MASTER-U1698
Private trade asks official reserves | blocked unless explicit official FX request

### MASTER-U1699
Insufficient usable reserves | intervention/allocation limited

### MASTER-U1700
Capital control violation | payment blocked / flagged

### MASTER-U1701
FX debt appreciation | LC debt burden changes automatically

### MASTER-U1702
Reserve swap maturity | creates reciprocal repayment obligations

### MASTER-U1703
G. Office 权限映射

### MASTER-U1704
Office | 操作/只读权限

### MASTER-U1705
Central Bank | FX intervention、official reserves、swap monetary leg

### MASTER-U1706
Trade | cross-border payment/controls/negotiation

### MASTER-U1707
Finance | foreign debt/Treasury FX obligation

### MASTER-U1708
Captain | major capital controls/FX emergency

### MASTER-U1709
Industry/Social | official FX request only through relevant procurement when authorised

### MASTER-U1710
H. Audit Event

### MASTER-U1711
事件类型

### MASTER-U1712
FX_PRIVATE_CONVERSION

### MASTER-U1713
FX_PAYMENT_SETTLED

### MASTER-U1714
FX_RATE_UPDATED

### MASTER-U1715
FX_INTERVENTION_SELL_GCU

### MASTER-U1716
FX_INTERVENTION_BUY_GCU

### MASTER-U1717
FX_STERILISATION_POSTED

### MASTER-U1718
OFFICIAL_FX_REQUESTED

### MASTER-U1719
OFFICIAL_FX_APPROVED

### MASTER-U1720
CAPITAL_CONTROL_APPLIED

### MASTER-U1721
RESERVE_SWAP_DRAWN

### MASTER-U1722
FOREIGN_DEBT_SERVICE_PAID

### MASTER-U1723
FDI_INCOME_REPATRIATED

### MASTER-U1724
I. 前端可见状态与操作

### MASTER-U1725
页面/组件 | 内容

### MASTER-U1726
FX Dashboard | 1 GCU=X LC、flows by source、history

### MASTER-U1727
Reserves | gross/usable/committed/import cover

### MASTER-U1728
Capital Flows | FDI、loans、portfolio/other if enabled

### MASTER-U1729
Official Requests | amount/currency/due/approval

### MASTER-U1730
Foreign Debt | principal、interest、LC value、maturity

### MASTER-U1731
J. 工程验收

### MASTER-U1732
□ 只有 70 条主要 LC/GCU 汇率。

### MASTER-U1733
□ 普通贸易不扣官方外储。

### MASTER-U1734
□ Intervention 分录进入 CB balance sheet。

### MASTER-U1735
□ FX debt 重估与 national/fiscal accounts 一致。

### MASTER-U1736
Engine 18 · National Accounts, Risk & Scoring Engine

### MASTER-U1737
Engine Definition / 统一计算 GDP、CPI/Inflation、Current Account、Fiscal/Money/Social derived indicators，执行跨账本 reconciliation、风险检测、Office/国家评分和 League 排名；只读，不允许通过评分反向改经济。

### MASTER-U1738
A. Source of Truth 与权威状态

### MASTER-U1739
权威对象 | 定义

### MASTER-U1740
NationalAccounts | GDP production approach、C/I/G/X/M cross-check、sector value added

### MASTER-U1741
PriceIndex | CPI basket: Food、Energy、Housing、General Goods、Services

### MASTER-U1742
BalanceOfPayments | current account、capital/financial flows、reserve change

### MASTER-U1743
FiscalIndicators | revenue、spending、primary/overall balance、debt/GDP

### MASTER-U1744
MonetaryIndicators | MB/M1/M2、credit growth、real rate

### MASTER-U1745
SocialIndicators | unemployment、poverty、Gini、coverage、crime rate、health/education/housing metrics

### MASTER-U1746
RiskState | financial/fiscal/FX/energy/resource/supply-chain/social/public-service/project risks

### MASTER-U1747
ScoreSnapshot | country score、office score、guardrail flags、relative-to-initial metrics

### MASTER-U1748
Ranking | Season/League ranking snapshot

### MASTER-U1749
该 Engine 是以下状态的唯一 Source of Truth：GDP/national accounts、CPI、balance of payments summaries、derived social/financial/fiscal ratios、risk states、score snapshots、ranking。

### MASTER-U1750
B. 输入

### MASTER-U1751
输入来源 | 输入

### MASTER-U1752
All 17 Engines | authoritative stocks/flows/prices/rules

### MASTER-U1753
Governance | strategy/priorities/commitments for scoring benchmark

### MASTER-U1754
Time | daily settlement snapshot

### MASTER-U1755
C. 输出与下游依赖

### MASTER-U1756
下游 Engine | 输出

### MASTER-U1757
All Office Dashboards | derived metrics and alerts

### MASTER-U1758
Captain | National Intelligence Brief

### MASTER-U1759
League | ranking

### MASTER-U1760
Admin | reconciliation/risk diagnostics

### MASTER-U1761
D. 允许动作 / 状态转换

### MASTER-U1762
动作或系统事件 | 完整效果

### MASTER-U1763
Compute GDP | production approach primary ledger

### MASTER-U1764
Cross-check Expenditure GDP | C+I+G+X-M；difference recorded

### MASTER-U1765
Compute CPI/Inflation | fixed/periodically rebased basket, daily index

### MASTER-U1766
Compute Current Account | trade + primary/secondary income according to implemented flows

### MASTER-U1767
Compute Risk Flags | only from real gaps/ratios/events

### MASTER-U1768
Compute Scores | after economy settled

### MASTER-U1769
Apply National Guardrails | cap/penalise role score when national harm thresholds triggered

### MASTER-U1770
Publish Snapshot | immutable daily derived snapshot

### MASTER-U1771
Reconcile Accounts | flag mismatch, never average conflicting values

### MASTER-U1772
E. 核心计算

### MASTER-U1773
计算 | 规则

### MASTER-U1774
GDP production | Σ sector value added + product taxes - product subsidies

### MASTER-U1775
GDP expenditure | C + I + G + X - M

### MASTER-U1776
Inflation | (CPI_t - CPI_t-1)/CPI_t-1

### MASTER-U1777
CPI | weighted Food + Energy + Housing + General Goods + Services

### MASTER-U1778
Debt/GDP | public debt / nominal GDP

### MASTER-U1779
Current Account | trade balance + net primary income + net transfers

### MASTER-U1780
Real policy rate | policy rate - expected inflation

### MASTER-U1781
Poverty | population below configured income threshold

### MASTER-U1782
Gini | derived from income distribution

### MASTER-U1783
Role score | weighted real outcomes × guardrails; Score never feeds back

### MASTER-U1784
F. 硬约束、失败与异常

### MASTER-U1785
条件 | 处理

### MASTER-U1786
GDP approach mismatch | National Accounts Reconciliation Error；保留两边，不取平均

### MASTER-U1787
Missing source data | indicator status INCOMPLETE，禁止填 0 伪装

### MASTER-U1788
Risk score without real basis | forbidden; each risk must link underlying quantities

### MASTER-U1789
Score gaming | guardrails/relative-to-initial conditions

### MASTER-U1790
Late event correction | next snapshot includes correction, prior snapshot immutable

### MASTER-U1791
G. Office 权限映射

### MASTER-U1792
Office | 操作/只读权限

### MASTER-U1793
Captain | strategy/priority/commitment + national score/risk

### MASTER-U1794
CB | monetary/financial derived indicators

### MASTER-U1795
Finance | fiscal indicators

### MASTER-U1796
Trade | external indicators

### MASTER-U1797
Industry | productive/resource/project indicators

### MASTER-U1798
Social | human/social indicators

### MASTER-U1799
Admin | reconciliation and scoring config

### MASTER-U1800
H. Audit Event

### MASTER-U1801
事件类型

### MASTER-U1802
GDP_COMPUTED

### MASTER-U1803
GDP_RECONCILIATION_ERROR

### MASTER-U1804
CPI_COMPUTED

### MASTER-U1805
INFLATION_COMPUTED

### MASTER-U1806
CURRENT_ACCOUNT_COMPUTED

### MASTER-U1807
RISK_FLAG_CREATED

### MASTER-U1808
RISK_FLAG_CLEARED

### MASTER-U1809
SCORE_SNAPSHOT_CREATED

### MASTER-U1810
GUARDRAIL_TRIGGERED

### MASTER-U1811
RANKING_PUBLISHED

### MASTER-U1812
DATA_INCOMPLETE_FLAG

### MASTER-U1813
I. 前端可见状态与操作

### MASTER-U1814
页面/组件 | 内容

### MASTER-U1815
National Accounts | GDP、sector VA、C/I/G/X/M cross-check

### MASTER-U1816
Price Dashboard | CPI/inflation decomposition

### MASTER-U1817
Risk Centre | underlying amount/ratio and causal chain

### MASTER-U1818
Score | country + office + guardrail details

### MASTER-U1819
Ranking | season leaderboard with initial-condition normalization where configured

### MASTER-U1820
J. 工程验收

### MASTER-U1821
□ GDP source唯一且支出法可对账。

### MASTER-U1822
□ Transfer 不计 G。

### MASTER-U1823
□ X/M 只认 Delivered trade。

### MASTER-U1824
□ Risk 必须引用真实底层变量。

### MASTER-U1825
□ Score 不修改经济状态。

### MASTER-U1826
□ Daily snapshot immutable。

### MASTER-U1827
Part III · 世界级互锁规则

### MASTER-U1828
7. 经济主体与部门账户

### MASTER-U1829
经济主体 | 持有/发生对象

### MASTER-U1830
Household Sector | Labour、income、deposits、consumer debt、mortgage、consumption、housing demand、taxes、transfers

### MASTER-U1831
Corporate / Production Sectors | Capacity、inventory、revenue、wage/input/energy cost、debt、profit、investment、tax base

### MASTER-U1832
Commercial Banking Sector | 全国聚合 banking balance sheet、credit、deposits、capital、NPL

### MASTER-U1833
Treasury / Government | tax、cash、budget、debt、payments、assets、guarantees

### MASTER-U1834
Central Bank | monetary base、reserves、securities、bank lending、FX reserves、policy tools

### MASTER-U1835
Rest of World | 其余 69 国通过 CrossBorderNetwork 形成真实货物、资金、所有权、债权、技术和人员关系

### MASTER-U1836
7.1 企业/生产部门利润闭环

### MASTER-U1837
Revenue / Price × Sales

### MASTER-U1838
Operating Cost / Intermediate Inputs + Energy + Wages + Maintenance + Taxes/Subsidies + allocated financing cost

### MASTER-U1839
Profit / Revenue - Cost

### MASTER-U1840
Profit 影响企业税基、偿债、招聘、私人投资和银行风险。不得使用独立 Business Confidence slider 直接创造投资。

### MASTER-U1841
7.2 Household 闭环

### MASTER-U1842
Disposable Resources / Wages + CapitalIncome + Transfers - DirectTaxes + NewCredit - DebtService

### MASTER-U1843
Consumption / f(DisposableResources, Prices, InterestRates, HouseholdBalanceSheet)

### MASTER-U1844
8. 全球市场、跨境传播与 70 国网络

### MASTER-U1845
跨境网络层 | 真实流动对象

### MASTER-U1846
Goods | 12 commodity shipments + bilateral electricity through dedicated infrastructure

### MASTER-U1847
Money | trade payments、aid、royalty、interest、dividends

### MASTER-U1848
Debt | sovereign loans、foreign bonds、bank foreign borrowing

### MASTER-U1849
Ownership | FDI equity、joint project shares、resource/infrastructure rights

### MASTER-U1850
Technology | licence、transfer、joint R&D、IP rights

### MASTER-U1851
Labour/Talent | temporary project workers、researcher/student exchange、migration

### MASTER-U1852
Rules | tariffs、quotas、FTA/PTA、sanctions、capital controls

### MASTER-U1853
Commitments | contracts、guarantees、treaties、joint governance

### MASTER-U1854
8.1 全球冲击传播必须走真实链条

### MASTER-U1855
冲击 | 必须经过的因果链

### MASTER-U1856
Resource Supply Shock | Resource Output ↓ → Global Supply ↓ → Global Price ↑ → Import Cost ↑ → Production/Household Cost ↑ → CPI/Trade/FX responses

### MASTER-U1857
Trade Sanction | Rule blocks shipment/payment/technology → contract shortfall → inventory/project/production impact → prices/current account

### MASTER-U1858
FX Crisis | Net FX demand ↑ → LC depreciation → import price/FX debt burden ↑ → CPI/fiscal/bank/household impact

### MASTER-U1859
Banking Crisis | NPL/Loss ↑ → Equity/Capital Headroom ↓ → Credit Supply ↓ → investment/working capital ↓ → production/employment

### MASTER-U1860
Energy Shock | Fuel/plant/grid constraint → Electricity Delivered ↓ → production/public services constrained → prices/output

### MASTER-U1861
Migration Surge | Population/Labour ↑ → skill supply + housing/education/healthcare demand ↑ → wage/rent/public-service consequences

### MASTER-U1862
9. Shock Engine 与 Admin Crisis Composer

### MASTER-U1863
Shock 不是独立第 19 Engine，而是 Admin 通过 Event Kernel 对 18 Engine 的合法底层变量写入一个受控 Shock Event。管理员不得直接输入 GDP -5%、Inflation +3 或 Social Stability -20。

### MASTER-U1864
可写底层对象 | Admin Shock 允许改变

### MASTER-U1865
Resource | destroy/disable deposit capacity、reduce extraction temporarily、inventory loss

### MASTER-U1866
Energy | plant outage、fuel loss、grid capacity damage

### MASTER-U1867
Production | facility damage、capacity outage、input efficiency shock

### MASTER-U1868
Infrastructure | port/rail/grid/digital/housing/hospital damage

### MASTER-U1869
Population | casualties/displacement/forced migration only when scenario explicitly requires

### MASTER-U1870
Healthcare | demand surge、staff unavailable

### MASTER-U1871
Banking | loan loss/NPL shock、asset valuation loss、liquidity withdrawal

### MASTER-U1872
Trade | route closure、sanction/embargo、delivery disruption

### MASTER-U1873
FX | capital flow shock、official reserve loss only through explicit transaction

### MASTER-U1874
Public Safety | incident/protest/emergency demand surge

### MASTER-U1875
Technology | facility/research disruption; no arbitrary knowledge deletion unless scenario explicitly defines

### MASTER-U1876
10. Source of Truth 总表

### MASTER-U1877
核心变量 | 唯一 Source of Truth

### MASTER-U1878
Simulation Time | Time & Event

### MASTER-U1879
Population | Population

### MASTER-U1880
Employment / Wage | Labour & Wage

### MASTER-U1881
Education / Graduates | Education & Human Capital

### MASTER-U1882
Healthcare Capacity / Backlog | Healthcare

### MASTER-U1883
Housing Units / Rent | Housing

### MASTER-U1884
Police / Incident / Backlog | Public Safety

### MASTER-U1885
Geological Resource / Commodity Inventory | Resource & Inventory

### MASTER-U1886
Electricity / Grid / Generation | Energy

### MASTER-U1887
Production / Capacity Utilisation | Production

### MASTER-U1888
Technology Rights / R&D | Technology & R&D

### MASTER-U1889
Project Progress / Infrastructure Capacity | Project & Infrastructure

### MASTER-U1890
Household Income / Consumption | Household & Demand

### MASTER-U1891
Tax / Treasury / Debt / Guarantee | Fiscal & Treasury

### MASTER-U1892
Loans / Deposits / Money / CB Balance Sheet | Banking & Monetary

### MASTER-U1893
Tariff / Contract / Shipment / FDI / Treaty | Trade, Contract & Global Market

### MASTER-U1894
FX / Capital Flow / Official Reserve Interface | FX & International Finance

### MASTER-U1895
GDP / CPI / Risk / Score | National Accounts, Risk & Scoring

### MASTER-U1896
Strategy / Approval / Political Capital | Governance Kernel

### MASTER-U1897
11. 全局事件目录

### MASTER-U1898
事件命名空间 | 固定类别

### MASTER-U1899
TIME | SCHEDULED / EXECUTED / PAUSE / RESUME / SETTLEMENT

### MASTER-U1900
POP | BIRTH / DEATH / IMMIGRATION / EMIGRATION / HOUSEHOLD

### MASTER-U1901
LABOUR | VACANCY / MATCH / SEPARATION / WAGE / SKILL / MOBILITY

### MASTER-U1902
EDU | COHORT / ENROLLMENT / GRADUATION / TEACHER / INFRA REQUEST

### MASTER-U1903
HEALTH | DEMAND / CARE / BACKLOG / STAFF / EMERGENCY

### MASTER-U1904
HOUSING | UNIT / RENT / BENEFIT / REQUEST / EMERGENCY

### MASTER-U1905
SAFETY | INCIDENT / DEPLOYMENT / PROTEST / CIVIL EMERGENCY

### MASTER-U1906
RESOURCE | DISCOVERY / DEVELOPMENT / EXTRACTION / INVENTORY / RESERVE

### MASTER-U1907
ENERGY | GENERATION / FUEL / STORAGE / ALLOCATION / BLACKOUT

### MASTER-U1908
PRODUCTION | TARGET / INPUT / OUTPUT / FACILITY / MAINTENANCE

### MASTER-U1909
TECH | R&D / MASTERY / LICENCE / TRANSFER / JOINT R&D / RIGHT

### MASTER-U1910
PROJECT | CREATE / APPROVAL / FUNDING / INPUT / PROGRESS / COMMISSION / CANCEL

### MASTER-U1911
HOUSEHOLD | WAGE / TAX / TRANSFER / DEBT / CONSUMPTION / SAVING

### MASTER-U1912
FISCAL | TAX / BUDGET / PAYMENT / DEBT / GUARANTEE / ASSET

### MASTER-U1913
BANKING | RATE / OMO / RESERVE / CAPITAL / LOAN / NPL / ELA / REFINANCE

### MASTER-U1914
TRADE | ORDER / FILL / TARIFF / QUOTA / CONTRACT / SHIPMENT / TREATY / SANCTION / DISPUTE

### MASTER-U1915
FX | CONVERSION / RATE / INTERVENTION / OFFICIAL REQUEST / DEBT SERVICE / CAPITAL CONTROL

### MASTER-U1916
NATIONAL | GDP / CPI / RISK / SCORE / RANKING / RECONCILIATION

### MASTER-U1917
GOV | STRATEGY / PRIORITY / AGENDA / PROPOSAL / APPROVAL / COMMITMENT / CRISIS

### MASTER-U1918
Event 命名建议使用 NAMESPACE_ACTION，例如 TRADE_CONTRACT_SIGNED。所有事件至少包含 event_id、world_id、country_id nullable、actor_user_id nullable、actor_office nullable、sim_timestamp、processed_at、object_type/id/version、payload、idempotency_key、causation_event_id、correlation_id。

### MASTER-U1919
12. 数据一致性、重算与错误处理

### MASTER-U1920
异常 | 固定处理

### MASTER-U1921
Balance Sheet Mismatch | 阻止本次金融 transaction commit；产生 SEVERE error

### MASTER-U1922
Inventory Negative | 阻止消费/交付超过库存；转 shortfall/default

### MASTER-U1923
Population Negative | 阻止人口 flow

### MASTER-U1924
Project Progress >100% | cap + integrity error；不能静默修正来源

### MASTER-U1925
Duplicate Scheduled Event | idempotency 阻止

### MASTER-U1926
GDP Reconciliation | 保留 Production GDP 与 Expenditure GDP，标记差额，不取平均

### MASTER-U1927
Missing Source Data | derived indicator = INCOMPLETE，不填 0

### MASTER-U1928
Late Event | 按 intended sim timestamp 和实际 processed time 记录；必要时产生 correction in current settlement

### MASTER-U1929
Historical Correction | 创建 reversal/correction event，不修改原 event

### MASTER-U1930
Cross-engine circular dependency | 遵循固定 settlement order；本日下游影响不得反写已结算上游，进入 next-day state unless immediate rule explicitly permits

### MASTER-U1931
13. 前端世界层操作与可见性

### MASTER-U1932
世界级页面 | 内容

### MASTER-U1933
World Clock | 10×、simulation date、next daily settlement

### MASTER-U1934
Global Market | 12 commodities、prices、orders/supply/demand

### MASTER-U1935
Global Technology Exchange | technologies、licences、joint R&D、partners

### MASTER-U1936
World Map / Country Profile | 70-country public macro/trade/technology summary according to visibility

### MASTER-U1937
Cross-border Network | contracts、shipments、FDI、loans、treaties、sanctions

### MASTER-U1938
Season Risk Feed | 全球/本国重大事件和 supply chain exposure

### MASTER-U1939
League Ranking | derived score snapshot only

### MASTER-U1940
Admin Engine Health | settlement status、failed events、reconciliation errors、data integrity

### MASTER-U1941
14. 工程验收总 Checklist

### MASTER-U1942
□ 正式 Season 固定 10×，所有 expiry/maturity/duration 使用 simulation time。

### MASTER-U1943
□ 每 2h24m real 完成一个完整 simulation-day settlement。

### MASTER-U1944
□ 18 Engine 按固定顺序结算且 crash recovery 不重复交易。

### MASTER-U1945
□ 70 个 CountryState 共享同一个 GlobalState/Market/Technology/Contract network。

### MASTER-U1946
□ 六个 Office UI 不拥有重复经济计算。

### MASTER-U1947
□ 所有 Stock/Flow/Price/Rule/Derived 类型字段标注清楚。

### MASTER-U1948
□ 15 条世界物理定律全部有 automated invariant test。

### MASTER-U1949
□ Geological Endowment 固定且技术不能增加总量。

### MASTER-U1950
□ 12 commodity inventory 全部守恒。

### MASTER-U1951
□ Population 和 skill transition 守恒。

### MASTER-U1952
□ CB 和 Commercial Bank balance sheet 恒等。

### MASTER-U1953
□ Treasury 不可支付不存在的现金而不形成融资/arrear。

### MASTER-U1954
□ Projects 只有 commission 后才创建 capacity。

### MASTER-U1955
□ Education/Training 只有 duration 完成后才创建 skill supply。

### MASTER-U1956
□ Healthcare/Public Safety/Housing 使用真实容量。

### MASTER-U1957
□ Global Market、contracts、shipments 和 payments 双边同步。

### MASTER-U1958
□ 普通进口不直接扣 Official Reserves。

### MASTER-U1959
□ Tariff 解析 country×commodity 并遵循 treaty/sanction 优先级。

### MASTER-U1960
□ FX 只使用 70 条 LC/GCU 核心汇率。

### MASTER-U1961
□ GDP Production Approach 为主，Expenditure Approach 自动对账。

### MASTER-U1962
□ Welfare transfer 不计入 G。

### MASTER-U1963
□ Delivered exports/imports 才进入 X/M。

### MASTER-U1964
□ Shock 只能改变合法底层状态，不直接改 GDP/score。

### MASTER-U1965
□ Risk 每条都能追溯 underlying quantities。

### MASTER-U1966
□ Score 只能读经济，不能写经济。

### MASTER-U1967
□ Captain Strategy 不直接给宏观 Buff。

### MASTER-U1968
□ 同一玩家兼任时仍记录独立 Office approval。

### MASTER-U1969
□ 所有正式事件 append-only 可追溯。

### MASTER-U1970
□ 数据不足时显示 INCOMPLETE，不以 0 填充。

### MASTER-U1971
□ Final Season snapshot 可以从 Event Ledger + initial state 重放复现。

### MASTER-U1972
附录 A · 固定商品 / 生产 / 技术 / 项目目录

### MASTER-U1973
A1. 12 类全球标准化商品

### MASTER-U1974
Commodity | Unit

### MASTER-U1975
CRUDE_OIL | barrel

### MASTER-U1976
NATURAL_GAS | MMBtu

### MASTER-U1977
URANIUM | tonne U

### MASTER-U1978
GRAIN | tonne

### MASTER-U1979
IRON_ORE | tonne

### MASTER-U1980
COPPER | tonne

### MASTER-U1981
LITHIUM | tonne LCE

### MASTER-U1982
STEEL | tonne

### MASTER-U1983
REFINED_FUEL | barrel equivalent

### MASTER-U1984
MACHINERY | equipment unit

### MASTER-U1985
SEMICONDUCTORS | standardised chip unit

### MASTER-U1986
BATTERIES | MWh-equivalent

### MASTER-U1987
A2. 12 Production Sectors 与固定生产链

### MASTER-U1988
Sector | Production Chain

### MASTER-U1989
OIL_EXTRACTION | Developed Oil Reserve + Electricity + Labour + Machinery → Crude Oil

### MASTER-U1990
GAS_EXTRACTION | Developed Gas Reserve + Electricity + Labour + Machinery → Natural Gas

### MASTER-U1991
URANIUM_MINING | Developed Uranium Reserve + Electricity + Labour + Machinery → Uranium

### MASTER-U1992
IRON_ORE_MINING | Developed Iron Ore Reserve + Electricity + Labour + Machinery → Iron Ore

### MASTER-U1993
COPPER_MINING | Developed Copper Reserve + Electricity + Labour + Machinery → Copper

### MASTER-U1994
LITHIUM_MINING | Developed Lithium Reserve + Electricity + Labour + Machinery → Lithium

### MASTER-U1995
STEEL | Iron Ore + Energy + Labour + Machinery Capacity → Steel

### MASTER-U1996
REFINED_FUEL | Crude Oil + Energy + Labour + Refinery Capacity → Refined Fuel

### MASTER-U1997
BATTERY | Lithium + Copper + Electricity + Machinery + Battery Technology + Skilled Labour → Batteries

### MASTER-U1998
MACHINERY | Steel + Copper + Electricity + Manufacturing Technology + Skilled Labour → Machinery

### MASTER-U1999
SEMICONDUCTOR | Copper + Electricity + Machinery + Semiconductor Technology + High Skill Labour → Semiconductors

### MASTER-U2000
ELECTRICITY | Fuel/Resource + Generation Capacity + Labour + Grid → Delivered Electricity

### MASTER-U2001
A3. 22 项 Technology Catalog

### MASTER-U2002
Technology ID | Domain | Technology

### MASTER-U2003
ENERGY_ADV_SOLAR | Energy | Advanced Solar

### MASTER-U2004
ENERGY_GRID_STORAGE | Energy | Grid-scale Storage

### MASTER-U2005
ENERGY_ADV_NUCLEAR | Energy | Advanced Nuclear

### MASTER-U2006
ENERGY_SMART_GRID | Energy | Smart Grid

### MASTER-U2007
ENERGY_GREEN_H2 | Energy | Green Hydrogen

### MASTER-U2008
MFG_AUTOMATION | Manufacturing | Industrial Automation

### MASTER-U2009
MFG_ROBOTICS | Manufacturing | Advanced Robotics

### MASTER-U2010
MFG_PRECISION | Manufacturing | Precision Manufacturing

### MASTER-U2011
MFG_SMART | Manufacturing | Smart Manufacturing

### MASTER-U2012
SEMI_BASIC | Semiconductor | Basic Semiconductor

### MASTER-U2013
SEMI_ADV_FAB | Semiconductor | Advanced Fabrication

### MASTER-U2014
SEMI_PACKAGING | Semiconductor | Advanced Packaging

### MASTER-U2015
SEMI_HPC | Semiconductor | High-performance Chips

### MASTER-U2016
RESOURCE_ADV_EXPLORATION | Resources & Materials | Advanced Exploration

### MASTER-U2017
RESOURCE_ADV_MINING | Resources & Materials | Advanced Mining

### MASTER-U2018
RESOURCE_EFFICIENT_REFINING | Resources & Materials | High-efficiency Refining

### MASTER-U2019
RESOURCE_BATTERY_CHEM | Resources & Materials | Battery Chemistry

### MASTER-U2020
RESOURCE_ADV_MATERIALS | Resources & Materials | Advanced Materials

### MASTER-U2021
INFRA_DIGITAL_NETWORK | Infrastructure & Digital | Digital Industrial Network

### MASTER-U2022
INFRA_AUTO_LOGISTICS | Infrastructure & Digital | Automated Logistics

### MASTER-U2023
INFRA_SMART_PORT | Infrastructure & Digital | Smart Port

### MASTER-U2024
INFRA_ADV_GRID_MGMT | Infrastructure & Digital | Advanced Grid Management

### MASTER-U2025
A4. Project Catalog

### MASTER-U2026
Category | Project Type

### MASTER-U2027
Resource | Oil Field Development

### MASTER-U2028
Resource | Gas Field Development

### MASTER-U2029
Resource | Uranium Mine

### MASTER-U2030
Resource | Iron Ore Mine

### MASTER-U2031
Resource | Copper Mine

### MASTER-U2032
Resource | Lithium Mine

### MASTER-U2033
Energy | Gas Power Plant

### MASTER-U2034
Energy | Fossil Power Plant

### MASTER-U2035
Energy | Nuclear Power Plant

### MASTER-U2036
Energy | Solar Farm

### MASTER-U2037
Energy | Wind Farm

### MASTER-U2038
Energy | Grid Upgrade

### MASTER-U2039
Energy | Energy Storage Facility

### MASTER-U2040
Industrial | Steel Mill

### MASTER-U2041
Industrial | Refinery

### MASTER-U2042
Industrial | Machinery Plant

### MASTER-U2043
Industrial | Semiconductor Fab

### MASTER-U2044
Industrial | Battery Gigafactory

### MASTER-U2045
Industrial | Industrial Park

### MASTER-U2046
Industrial | Special Economic Zone

### MASTER-U2047
Infrastructure | Deepwater Port

### MASTER-U2048
Infrastructure | Freight Railway

### MASTER-U2049
Infrastructure | National Power Grid

### MASTER-U2050
Infrastructure | Digital Backbone

### MASTER-U2051
Infrastructure | Logistics Hub

### MASTER-U2052
Infrastructure | Strategic Reserve Facility

### MASTER-U2053
Research Infrastructure | National Research Centre

### MASTER-U2054
Research Infrastructure | Semiconductor Research Facility

### MASTER-U2055
Research Infrastructure | Energy Research Centre

### MASTER-U2056
Research Infrastructure | Materials Research Centre

### MASTER-U2057
Social Infrastructure | Basic Education Facility

### MASTER-U2058
Social Infrastructure | Vocational Education Facility

### MASTER-U2059
Social Infrastructure | Higher Education Facility

### MASTER-U2060
Social Infrastructure | Primary Care Facility

### MASTER-U2061
Social Infrastructure | Hospital / Emergency Facility

### MASTER-U2062
Social Infrastructure | Public Housing

### MASTER-U2063
Social Infrastructure | Worker Housing

### MASTER-U2064
Social Infrastructure | Police / Emergency Facility

### MASTER-U2065
附录 B · 10× 时间换算与标准期限

### MASTER-U2066
对象 | Simulation Time | Real Time @10×

### MASTER-U2067
Daily Settlement | 1 sim day | 2h24m real

### MASTER-U2068
7-day Forecast | 7 sim days | 16h48m real

### MASTER-U2069
30-day Forecast | 30 sim days | 3 real days

### MASTER-U2070
60-day Forecast | 60 sim days | 6 real days

### MASTER-U2071
90-day Maturity | 90 sim days | 9 real days

### MASTER-U2072
180-day Maturity | 180 sim days | 18 real days

### MASTER-U2073
1 Simulation Year | 360 sim days | 36 real days

### MASTER-U2074
Formal 60-real-day Season | 600 sim days | 60 real days

### MASTER-U2075
所有 Programme/Project/Contract 的具体 duration 由其对象配置，不在此强行统一。此表只定义时间换算和常用 horizon，防止前端把“30 天”误显示为 30 个现实日。

### MASTER-U2076
附录 C · Cross-Engine Dependency Matrix

### MASTER-U2077
Engine | 主要输出到 | 主要输入自

### MASTER-U2078
Population | Labour, Education, Healthcare, Housing, Fiscal | Migration, Shock

### MASTER-U2079
Labour | Production, Project, Household, Education, Healthcare, Safety | Population, Education, Migration, Wages

### MASTER-U2080
Education | Labour/Skill, Technology talent | Population, Labour teachers, Fiscal, Project

### MASTER-U2081
Healthcare | Labour availability, Social stress | Population, Labour, Fiscal, Project

### MASTER-U2082
Housing | Household cost, Labour mobility, Social stress | Population, Project, Banking

### MASTER-U2083
Public Safety | Social risk, emergency | Labour, Fiscal, Social conditions

### MASTER-U2084
Resource/Inventory | Production, Trade, Energy, Project | Resource development, Production, Trade

### MASTER-U2085
Energy | Production, Household, Public Services | Resource, Plants, Grid, Labour

### MASTER-U2086
Production | Inventory, Household supply, Fiscal tax base, GDP | Resource, Energy, Labour, Tech, Demand

### MASTER-U2087
Technology | Project/Production/Resource eligibility | R&D funding, Labour talent, Trade rights

### MASTER-U2088
Project | Capacity/Infrastructure | Finance, Inventory, Labour, Tech, Approval

### MASTER-U2089
Household | Demand, VAT/PIT, Social stats | Labour wages, Fiscal transfers/taxes, Banking, Prices

### MASTER-U2090
Fiscal | Government demand/payments/debt | Tax bases, Funding requests, Debt market

### MASTER-U2091
Banking | Credit, Money, Financial risk | Policy, Borrowers, Fiscal securities, FX

### MASTER-U2092
Trade | Inventory, FX, Contracts, Global prices | Supply/Demand, Rules, Payments

### MASTER-U2093
FX | Import price, FX debt, reserves | Trade/Capital flows, Policy, Intervention

### MASTER-U2094
National Accounts | Dashboards/Risk/Score | All engines

### MASTER-U2095
Time/Event | All engines | Scheduled events from all engines

### MASTER-U2096
附录 D · Office × Engine 权限矩阵

### MASTER-U2097
Engine | Captain | CB | Finance | Trade | Industry | Social

### MASTER-U2098
Time & Event | R | R | R | R | R | R

### MASTER-U2099
Population | R | R | R | R | R/W via migration request | W Social

### MASTER-U2100
Labour & Wage | R | R | R tax/payroll | R | R workforce request | W

### MASTER-U2101
Education | R strategy | R | R funding | R exchange | R demand | W

### MASTER-U2102
Healthcare | R/crisis | R | R funding | R procurement | R facilities | W

### MASTER-U2103
Housing | R | R mortgage context | R funding | R migrant context | R build | W benefit/need

### MASTER-U2104
Public Safety | W emergency approval | R | R funding | R | R facilities | W operations

### MASTER-U2105
Resource & Inventory | R | R | R | R trade obligations | W | R

### MASTER-U2106
Energy | R/crisis | R | R funding | R fuel trade | W | R demand

### MASTER-U2107
Production | R | R | R tax/subsidy | R demand/input | W | R labour

### MASTER-U2108
Technology & R&D | W strategic approval | R | R funding | W international terms | W technical owner | W talent

### MASTER-U2109
Project & Infrastructure | W strategic approval | R systemic cases | W finance | W external | W owner | W need/social projects

### MASTER-U2110
Household & Demand | R | R rates | W tax | R | R | W transfers

### MASTER-U2111
Fiscal & Treasury | W major approval | W shared monetary finance | W | W external finance | R request | R request

### MASTER-U2112
Banking & Monetary | W crisis | W | W shared | W capital control | R request | R

### MASTER-U2113
Trade/Contract/Market | W strategic | W shared FX/financial | W sovereign finance | W | W | W talent

### MASTER-U2114
FX/International Finance | W crisis | W | W debt/payment | W | R official request | R

### MASTER-U2115
National Accounts/Risk/Score | R priority/score | R | R | R | R | R

### MASTER-U2116
R = read / review；W = 该 Office 在该 Engine 中存在正式写入动作。具体 Required Approval 仍以对象类型和 Governance Kernel 为准。

### MASTER-U2117
最终架构 / 6 Offices → Governance/Permission/Event Kernel → 18 Shared Engines → 70 Country States ↔ 1 Global Economic Network → 1 Immutable Event Ledger。正式 Season 固定 10×，世界连续运行，玩家没有回合，但后台以确定性的 simulation-day settlement 保证可审计、可重放和可验证。
