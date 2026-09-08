# CONSTITUTION｜原始规范文本索引

原文件：`EconMind_Season1_Codex_Implementation_Constitution.docx`
本文件为段落/表格顺序提取，未修改规则，未协调矛盾；图像、批注、页眉页脚与版式以原Word为准。锚点仅供回查，不代表独立需求条数。

### CONSTITUTION-U0001
EconMind OS Season 1

### CONSTITUTION-U0002
Codex Implementation Constitution

### CONSTITUTION-U0003
Codex 开发宪法与不可破坏工程规则

### CONSTITUTION-U0004
STATUS: NON-NEGOTIABLE / 本文件不是建议、示例或最佳实践清单，而是 Season 1 World Engine 的强制工程约束。Codex 在任何实现、重构、修复、迁移、性能优化、UI 修改或数据库变更中都不得绕过本文件。若任务要求与本文件冲突，必须停止该冲突实现，并明确报告冲突，而不是自行弱化规则。

### CONSTITUTION-U0005
项目 | 定义

### CONSTITUTION-U0006
适用范围 | Season 1、70 国世界、6 Office、18 Shared Engines、World Simulation 共用核心、Supabase 数据层、前端、API、后台任务、Realtime、Admin、Debug tooling

### CONSTITUTION-U0007
时间规则 | 正式 Season 统一 10x Simulation Clock：1 real day = 10 simulation days；所有权威经济期限使用 simulation time

### CONSTITUTION-U0008
最高原则 | Never change an outcome directly when the underlying cause can be modelled.

### CONSTITUTION-U0009
执行模式 | Fail closed；关键约束无法满足时禁止提交“近似成功”实现

### CONSTITUTION-U0010
合并门槛 | Architecture invariants + domain invariants + permission tests + ledger reconciliation + migration safety 全部通过

### CONSTITUTION-U0011
文档用途 | 可直接作为 Codex 每轮任务 Prompt 的固定前缀、PR 审查标准和 CI acceptance contract

### CONSTITUTION-U0012
目录 / Contents

### CONSTITUTION-U0013
0. 法律地位、优先级与冲突处理

### CONSTITUTION-U0014
1. 12 条 World Engine Constitution

### CONSTITUTION-U0015
2. Codex 每次任务的强制执行流程

### CONSTITUTION-U0016
3. 架构与模块边界

### CONSTITUTION-U0017
4. Source of Truth 与权威状态

### CONSTITUTION-U0018
5. 10x Simulation Clock 与时间纪律

### CONSTITUTION-U0019
6. Event、Settlement、Determinism 与幂等

### CONSTITUTION-U0020
7. 数值、单位、精度与类型

### CONSTITUTION-U0021
8. 资源、库存、人口与劳动力守恒

### CONSTITUTION-U0022
9. Education、Healthcare、Technology 与 Project 物理性

### CONSTITUTION-U0023
10. Production、Energy 与基础设施约束

### CONSTITUTION-U0024
11. Fiscal、Treasury、Banking 与 Monetary Accounting

### CONSTITUTION-U0025
12. National Accounts 与派生指标

### CONSTITUTION-U0026
13. Trade、Tariff、Contract、FX 与跨国原子结算

### CONSTITUTION-U0027
14. Office、RoleAssignment、Approval 与 Governance

### CONSTITUTION-U0028
15. Security、RLS、Classified Data 与 Admin 权限

### CONSTITUTION-U0029
16. Transaction、Concurrency 与 Error Handling

### CONSTITUTION-U0030
17. Engine API、读写边界与依赖规则

### CONSTITUTION-U0031
18. Shock、Crisis、Political Capital、Credibility 与 Score

### CONSTITUTION-U0032
19. Realtime、Performance、Snapshot 与 Cache

### CONSTITUTION-U0033
20. World Simulation 向后兼容与迁移纪律

### CONSTITUTION-U0034
21. Debug / Test / Production 隔离

### CONSTITUTION-U0035
22. 测试体系与 CI Merge Gate

### CONSTITUTION-U0036
23. Codex 明确禁止的代码模式

### CONSTITUTION-U0037
24. 允许简化与禁止简化

### CONSTITUTION-U0038
25. 每个 PR 必须提交的工程产物

### CONSTITUTION-U0039
26. Code Review 一票否决条件

### CONSTITUTION-U0040
27. Codex 标准任务 Prompt 模板

### CONSTITUTION-U0041
附录 A：100 条 Non-Negotiable Rules 总表

### CONSTITUTION-U0042
附录 B：Source of Truth Registry

### CONSTITUTION-U0043
附录 C：Office 与 Engine 权限矩阵

### CONSTITUTION-U0044
附录 D：Required Invariant Test Suites

### CONSTITUTION-U0045
附录 E：错误码与 Fail-Closed 规则

### CONSTITUTION-U0046
附录 F：Merge Checklist

### CONSTITUTION-U0047
0. 法律地位、优先级与冲突处理

### CONSTITUTION-U0048
优先级 / 本文件 > 单个 Codex 任务说明中的实现偏好 > 局部组件代码风格 > 性能优化 > UI 便利。任何局部需求若要求破坏本文件，Codex 必须保留核心约束并报告冲突。

### CONSTITUTION-U0049
级别 | 内容 | Codex 行为

### CONSTITUTION-U0050
P0 | World Engine Constitution、守恒、账本、权限、事务、Source of Truth | 绝不可破坏；冲突时停止冲突实现

### CONSTITUTION-U0051
P1 | Engine contract、数据模型、Settlement 顺序、Simulation Clock | 只能通过显式 architecture change 修改

### CONSTITUTION-U0052
P2 | 产品功能与 Office 操作要求 | 必须实现，但不能绕过 P0/P1

### CONSTITUTION-U0053
P3 | UI、视觉、组件组织、非权威缓存 | 可以重构，但不能成为权威状态

### CONSTITUTION-U0054
P4 | 性能优化、代码简化 | 仅在不改变 P0-P3 语义时允许

### CONSTITUTION-U0055
Codex 不得将“为了快速上线”“为了 MVP”“为了减少数据库表”“为了避免复杂事务”作为破坏 P0/P1 的理由。

### CONSTITUTION-U0056
如果仓库现状已经违反本文件，Codex 必须先标出违反点并采用迁移方式修复，不得继续扩大违规设计。

### CONSTITUTION-U0057
如果任务信息不足以安全修改 P0/P1 结构，Codex 应实现可确定部分并留下明确 TODO / BLOCKER，不得猜测后写入正式逻辑。

### CONSTITUTION-U0058
1. 12 条 World Engine Constitution

### CONSTITUTION-U0059
# | 宪法条款 | 强制含义

### CONSTITUTION-U0060
1 | One World, One State | 六个 Office 只能控制同一个 World State，不得拥有各自独立经济模型。

### CONSTITUTION-U0061
2 | One Source of Truth | 每个权威变量只能有一个 Engine / Ledger 负责写入。

### CONSTITUTION-U0062
3 | Command, Not Mutation | UI 和 Office 只能发送 Command；权威状态由服务器端 Engine 通过 Event/Transaction 修改。

### CONSTITUTION-U0063
4 | Conservation | 实体商品、人口、资源和金融账本必须遵守守恒或明确的 Stock-Flow 恒等式。

### CONSTITUTION-U0064
5 | No Instant Creation | Population、Labour、Skill、Technology、Capacity、Housing、Healthcare、Education 等不能通过参数直接凭空生成。

### CONSTITUTION-U0065
6 | Project Physicality | 项目只能创建/改变物理 Capacity 或资产，不能直接给予 GDP、Productivity 或 Score Buff。

### CONSTITUTION-U0066
7 | Symmetric Cross-Border Flow | 跨国交易必须同时更新所有受影响国家和对应资产/负债/所有权/货物流。

### CONSTITUTION-U0067
8 | Single 10x Clock | 全部权威经济期限统一使用 10x Simulation Clock。

### CONSTITUTION-U0068
9 | Deterministic and Idempotent | 同样状态、事件和 seed 必须产生同样结果；Scheduled Event 重试不能重复入账。

### CONSTITUTION-U0069
10 | Office-Based Authority | 权限和审批属于 Office，不属于具体玩家；兼任角色不得绕过多 Office 审批。

### CONSTITUTION-U0070
11 | Derived Means Read-Only | Score、GDP、Inflation、风险、Coverage、Strength 描述等派生指标只观察世界，不反向驱动经济。

### CONSTITUTION-U0071
12 | No Fake Measurable Index | 可真实测量的量不得被 0-100 抽象值或 hidden country buff 替代。

### CONSTITUTION-U0072
最高实现原则 / Never change an outcome directly when the underlying cause can be modelled.

### CONSTITUTION-U0073
2. Codex 每次任务的强制执行流程

### CONSTITUTION-U0074
2.1 修改前

### CONSTITUTION-U0075
读取本文件相关章节和本次功能所属 Engine 规范。

### CONSTITUTION-U0076
检查仓库现有实现，定位当前 Source of Truth、数据表、API、服务层、前端入口、Realtime subscription 和 tests。

### CONSTITUTION-U0077
列出本次修改将读取的 Engine、将写入的 Engine、将发出的 Event、将新增/修改的 DB entity。

### CONSTITUTION-U0078
确认是否影响 World Simulation 旧功能；若影响，共享代码必须通过兼容层或 shared engine 演进，不得直接删除旧行为。

### CONSTITUTION-U0079
确认是否涉及 schema migration；若涉及，必须同时准备 migration、backfill/default policy、rollback/forward-fix strategy。

### CONSTITUTION-U0080
确认是否涉及 P0/P1 architecture；若涉及，必须明确标注为 Architecture Change，不得伪装成局部 refactor。

### CONSTITUTION-U0081
确认所有关键状态是否已有唯一 Source of Truth；若发现重复真相，先设计收敛方案。

### CONSTITUTION-U0082
确认本次功能需要的权限、RLS、classified visibility 和 approval offices。

### CONSTITUTION-U0083
确认需要补充哪些 invariant tests、transaction tests、permission tests 和 regression tests。

### CONSTITUTION-U0084
2.2 修改中

### CONSTITUTION-U0085
所有 authoritative mutation 只能发生在 server-side domain/engine transaction 中。

### CONSTITUTION-U0086
任何跨 Engine 写入必须通过定义好的 command/event/interface，不允许任意 import 后直接修改对方表。

### CONSTITUTION-U0087
所有金额、比例、单位、simulation duration 使用统一类型和转换工具。

### CONSTITUTION-U0088
关键 multi-step operation 必须事务化；任何一步失败时回滚，不得 partial success。

### CONSTITUTION-U0089
所有 scheduled/retryable operation 必须支持幂等。

### CONSTITUTION-U0090
新增行为必须写 audit event，并记录 actor、office、country、command、simulation time 和 real timestamp。

### CONSTITUTION-U0091
不要删除既有测试来让新代码通过；若测试语义需要更新，必须证明旧语义已被 architecture change 替代。

### CONSTITUTION-U0092
不要用临时 hardcode、magic multiplier、hidden buff 或 silent fallback 替代尚未实现的真实逻辑。

### CONSTITUTION-U0093
2.3 修改后

### CONSTITUTION-U0094
运行类型检查、lint、单元测试、invariant tests、integration tests 和 permission/RLS tests。

### CONSTITUTION-U0095
执行 ledger / national accounts reconciliation 测试。

### CONSTITUTION-U0096
检查 World Simulation regression。

### CONSTITUTION-U0097
检查 10x time conversion 和 scheduled event 行为。

### CONSTITUTION-U0098
检查同一命令重复执行、网络重试、并发审批和 version conflict。

### CONSTITUTION-U0099
检查所有新增 Realtime subscription 是否 scoped。

### CONSTITUTION-U0100
输出 Changed Files、Schema Changes、New Events、New Tests、Known Limitations、Migration Notes。

### CONSTITUTION-U0101
只有所有 P0/P1 merge gates 通过后才可宣称任务完成。

### CONSTITUTION-U0102
3. 架构与模块边界

### CONSTITUTION-U0103
R001 · MUST · 六个 Office 不得拥有独立经济模型

### CONSTITUTION-U0104
Finance、Trade、Industry、Social、CB、Captain 只能通过 shared engines 读写同一 World State。

### CONSTITUTION-U0105
R002 · MUST · Season 与 World Simulation 共用 Core，但分 Orchestrator

### CONSTITUTION-U0106
不得用 Season 页面或 Season-specific state 直接替换旧 World Simulation。

### CONSTITUTION-U0107
R003 · MUST · 70 国是配置，不是硬编码

### CONSTITUTION-U0108
country count 必须来自 Season configuration。

### CONSTITUTION-U0109
R004 · MUST · Engine 与 UI 分层

### CONSTITUTION-U0110
React component、client state、local forecast 不得成为权威状态。

### CONSTITUTION-U0111
R005 · MUST · Domain Logic 不得散落在组件中

### CONSTITUTION-U0112
生产、税、利息、FX、合同结算、库存等必须位于 domain/engine/service 层。

### CONSTITUTION-U0113
R006 · MUST · Engine 必须声明 reads/writes/emits/consumes

### CONSTITUTION-U0114
不允许任意 Engine 扫描并写入全库。

### CONSTITUTION-U0115
R007 · MUST · 跨 Engine 修改只走 Interface/Event

### CONSTITUTION-U0116
禁止 Production Engine 直接 UPDATE Treasury 或 Trade 直接改 CB reserves。

### CONSTITUTION-U0117
R008 · MUST · Settlement phase 顺序固定

### CONSTITUTION-U0118
任何顺序变更都视为 Architecture Change。

### CONSTITUTION-U0119
R009 · MUST · 共享 Registry 统一目录

### CONSTITUTION-U0120
commodities、technologies、project types、sectors、offices、units 由 config/registry/seed 维护。

### CONSTITUTION-U0121
R010 · MUST · Archetype 仅用于初始化

### CONSTITUTION-U0122
国家原型不能在正式计算公式中作为持续 hidden multiplier。

### CONSTITUTION-U0123
R011 · MUST · Derived View 不得反向成为主数据

### CONSTITUTION-U0124
materialized view、cache、snapshot 只能读，不能形成另一套真相。

### CONSTITUTION-U0125
R012 · MUST · 禁止 Combined Role domain

### CONSTITUTION-U0126
不得创建 FINANCE_CB、TRADE_INDUSTRY 等组合 Office。

### CONSTITUTION-U0127
4. Source of Truth 与权威状态

### CONSTITUTION-U0128
变量 | 唯一 Source of Truth

### CONSTITUTION-U0129
Population | Population Engine

### CONSTITUTION-U0130
Employment / Unemployment | Labour & Wage Engine

### CONSTITUTION-U0131
Skill Stock | Education & Human Capital + Labour Engine 按定义交接

### CONSTITUTION-U0132
Education Seats / Graduates | Education Engine

### CONSTITUTION-U0133
Healthcare Capacity | Healthcare Engine

### CONSTITUTION-U0134
Housing Units / Gap | Housing Engine

### CONSTITUTION-U0135
Police Capacity / Crime Backlog | Public Safety Engine

### CONSTITUTION-U0136
Geological Resource | Resource Engine

### CONSTITUTION-U0137
Commodity Inventory | Resource & Inventory Engine

### CONSTITUTION-U0138
Energy Generation | Energy Engine

### CONSTITUTION-U0139
Industrial Output | Production Engine

### CONSTITUTION-U0140
Technology Rights | Technology & R&D Engine

### CONSTITUTION-U0141
Project Progress / Capacity Creation | Project & Infrastructure Engine

### CONSTITUTION-U0142
Household Income / Consumption | Household & Demand Engine

### CONSTITUTION-U0143
Tax Revenue / Treasury Cash | Fiscal & Treasury Ledger

### CONSTITUTION-U0144
Government Debt | Debt sub-ledger in Fiscal Engine

### CONSTITUTION-U0145
Bank Loans / Deposits | Banking Ledger

### CONSTITUTION-U0146
Monetary Base / M1 / M2 | Monetary Engine derived from ledgers

### CONSTITUTION-U0147
Official Reserves | Central Bank Ledger

### CONSTITUTION-U0148
Tariff / Quota / Treaty Rules | Trade Rules Engine

### CONSTITUTION-U0149
Contract Obligations | Contract Engine

### CONSTITUTION-U0150
Cross-Border Delivered Trade | Cross-Border Settlement

### CONSTITUTION-U0151
FX Rate | FX Engine

### CONSTITUTION-U0152
GDP / CPI / Inflation / Current Account | National Accounts Engine

### CONSTITUTION-U0153
Risk / Score | Risk & Scoring Engine

### CONSTITUTION-U0154
R013 · MUST · 每个权威变量只能有一个写入者

### CONSTITUTION-U0155
其他模块只能调用接口、发事件或读取，不得复制维护。

### CONSTITUTION-U0156
R014 · MUST · 复制字段必须声明为 cache/denormalized

### CONSTITUTION-U0157
并提供刷新策略，不能被业务逻辑当作事实来源。

### CONSTITUTION-U0158
R015 · MUST · 前端 forecast 与 actual 分离

### CONSTITUTION-U0159
forecast_value / scenario output 不能写回 authoritative actual state。

### CONSTITUTION-U0160
R016 · MUST · Snapshot 不是 Source of Truth

### CONSTITUTION-U0161
Snapshot 只用于加速恢复和读取。

### CONSTITUTION-U0162
R017 · MUST · Event Ledger append-only

### CONSTITUTION-U0163
历史事件禁止 UPDATE/DELETE；修正必须追加 correction event。

### CONSTITUTION-U0164
R018 · MUST · 状态必须可由 snapshot + events 重建

### CONSTITUTION-U0165
至少关键账本、合同、项目、库存、债务和审批需要可审计重放。

### CONSTITUTION-U0166
5. 10x Simulation Clock 与时间纪律

### CONSTITUTION-U0167
正式倍率 / 1 real day = 10 simulation days

### CONSTITUTION-U0168
单个 simulation day / 1 simulation day = 2 hours 24 minutes real time

### CONSTITUTION-U0169
正式 60 real-day Season / ≈ 600 simulation days ≈ 1.67 simulation years

### CONSTITUTION-U0170
字段 | 用途

### CONSTITUTION-U0171
authoritative simulation time | 所有经济和游戏期限的唯一时间轴

### CONSTITUTION-U0172
created_at_real | 审计、日志、debug；不得用于经济期限

### CONSTITUTION-U0173
simulation_day_index | Daily Settlement 序号

### CONSTITUTION-U0174
event_due_simulation_time | Scheduled Event 到期时间

### CONSTITUTION-U0175
season_time_multiplier | 正式 Season = 10；测试环境可配置

### CONSTITUTION-U0176
R019 · MUST · 所有经济期限必须使用 simulation time

### CONSTITUTION-U0177
项目、研发、教育、培训、债务、合同、物流、福利、Licence、sanction、migration 全部统一。

### CONSTITUTION-U0178
R020 · MUST · 禁止混用 Date.now 作为经济到期依据

### CONSTITUTION-U0179
real timestamp 只能审计。

### CONSTITUTION-U0180
R021 · MUST · time multiplier 只能由 Simulation Clock 提供

### CONSTITUTION-U0181
业务代码不得自行乘 10 或除 10。

### CONSTITUTION-U0182
R022 · MUST · 持续时间必须明确单位

### CONSTITUTION-U0183
禁止 duration: 30 但不说明 simulation minutes/days。

### CONSTITUTION-U0184
R023 · MUST · 利息与年化指标按 simulation calendar 统一换算

### CONSTITUTION-U0185
不得各 Engine 自行定义 year length。

### CONSTITUTION-U0186
R024 · MUST · 后台 Daily Settlement 由 simulation day boundary 触发

### CONSTITUTION-U0187
不得依赖某个玩家在线。

### CONSTITUTION-U0188
6. Event、Settlement、Determinism 与幂等

### CONSTITUTION-U0189
Phase | Settlement Stage

### CONSTITUTION-U0190
1 | Execute Scheduled Events

### CONSTITUTION-U0191
2 | Update Stocks

### CONSTITUTION-U0192
3 | Resource Production

### CONSTITUTION-U0193
4 | Energy Production/Allocation

### CONSTITUTION-U0194
5 | Industrial Production

### CONSTITUTION-U0195
6 | Labour Market

### CONSTITUTION-U0196
7 | Household Income & Consumption

### CONSTITUTION-U0197
8 | Public Services

### CONSTITUTION-U0198
9 | Domestic Market / Prices

### CONSTITUTION-U0199
10 | Global Market & Trade

### CONSTITUTION-U0200
11 | FX & Financial Markets

### CONSTITUTION-U0201
12 | Fiscal Settlement

### CONSTITUTION-U0202
13 | National Accounts

### CONSTITUTION-U0203
14 | Risk & Crisis Detection

### CONSTITUTION-U0204
15 | Score & Notifications

### CONSTITUTION-U0205
R025 · MUST · Settlement 必须 deterministic

### CONSTITUTION-U0206
同初始状态、commands、events、seed 必须得到同输出。

### CONSTITUTION-U0207
R026 · MUST · 禁止业务逻辑直接使用 Math.random

### CONSTITUTION-U0208
所有随机性通过 seeded RNG service。

### CONSTITUTION-U0209
R027 · MUST · Scheduled Event 必须幂等

### CONSTITUTION-U0210
重复执行不能重复付款、发货、毕业、计息或完工。

### CONSTITUTION-U0211
R028 · MUST · 每个 Command 有唯一 command_id

### CONSTITUTION-U0212
重复网络请求必须能识别。

### CONSTITUTION-U0213
R029 · MUST · 每个 Event 有唯一 event_id

### CONSTITUTION-U0214
处理状态与 processed_at 可审计。

### CONSTITUTION-U0215
R030 · MUST · 禁止在单次事件中递归闭环无限求解

### CONSTITUTION-U0216
价格-工资-需求等反馈必须跨 settlement phase 或下一 simulation day。

### CONSTITUTION-U0217
R031 · MUST · 同一经济事实只能入账一次

### CONSTITUTION-U0218
Trade、Fiscal、National Accounts 不能各自重复加现金或交易额。

### CONSTITUTION-U0219
R032 · MUST · Correction 必须是新 Event

### CONSTITUTION-U0220
不得修改旧 ledger event。

### CONSTITUTION-U0221
7. 数值、单位、精度与类型

### CONSTITUTION-U0222
R033 · MUST · Money 禁止长期使用 JS binary float

### CONSTITUTION-U0223
必须使用 Decimal、fixed-point integer 或 bigint minor units。

### CONSTITUTION-U0224
R034 · MUST · 所有 quantity 必须带 unit

### CONSTITUTION-U0225
commodity quantity、MW、MWh、tonne、barrel、people、beds 等必须通过 unit registry。

### CONSTITUTION-U0226
R035 · MUST · 禁止 silent unit conversion

### CONSTITUTION-U0227
annual/day/hour、LC/GCU、MW/MWh、tonne/kg 必须显式转换。

### CONSTITUTION-U0228
R036 · MUST · Backend rate 统一 0..1

### CONSTITUTION-U0229
UI 可显示 0..100%，业务层不得混用 15 与 0.15。

### CONSTITUTION-U0230
R037 · MUST · Currency amount 必须携带 currency code

### CONSTITUTION-U0231
禁止只存 amount。

### CONSTITUTION-U0232
R038 · MUST · FX conversion 必须记录 rate 和 valuation time

### CONSTITUTION-U0233
不能事后用当前 FX 重算历史账。

### CONSTITUTION-U0234
R039 · MUST · Round policy 必须统一

### CONSTITUTION-U0235
税、利息、关税、royalty、bond cash flow 使用统一 rounding policy。

### CONSTITUTION-U0236
R040 · MUST · 物理 Stock 默认不得为负

### CONSTITUTION-U0237
允许负值的变量必须白名单。

### CONSTITUTION-U0238
8. 资源、库存、人口与劳动力守恒

### CONSTITUTION-U0239
商品守恒 / OpeningInventory + Production + ImportsDelivered - Consumption - ExportsDelivered - Losses = ClosingInventory

### CONSTITUTION-U0240
资源守恒 / RemainingGeologicalResource = InitialEndowment - CumulativeExtraction

### CONSTITUTION-U0241
人口守恒 / Population_t = Population_(t-1) + Births - Deaths + Immigration - Emigration

### CONSTITUTION-U0242
R041 · MUST · 禁止政策直接修改商品库存

### CONSTITUTION-U0243
所有变化必须来自生产、交付、消费、损耗或明确 inventory transfer。

### CONSTITUTION-U0244
R042 · MUST · Initial Geological Endowment 在 Season seed 后锁定

### CONSTITUTION-U0245
技术、政策和探索不得增加物理总量。

### CONSTITUTION-U0246
R043 · MUST · 资源层级不可混用

### CONSTITUTION-U0247
Geological > Undiscovered/Discovered > Recoverable > Developed > Extracted Inventory 必须区分。

### CONSTITUTION-U0248
R044 · MUST · Exploration 只能从 Undiscovered Pool 转移

### CONSTITUTION-U0249
不能凭空新增资源。

### CONSTITUTION-U0250
R045 · MUST · Technology 只能改变 recovery/cost/efficiency/discovery

### CONSTITUTION-U0251
不能改变 geological total。

### CONSTITUTION-U0252
R046 · MUST · Population 不能按百分比按钮直接增加

### CONSTITUTION-U0253
只能通过人口流事件。

### CONSTITUTION-U0254
R047 · MUST · Labour 不能凭空生成

### CONSTITUTION-U0255
必须来自现有人口状态、training、education、migration、talent exchange。

### CONSTITUTION-U0256
R048 · MUST · Skill 不能即时升级

### CONSTITUTION-U0257
必须经过 programme enrollment、duration、completion。

### CONSTITUTION-U0258
9. Education、Healthcare、Technology 与 Project 物理性

### CONSTITUTION-U0259
R049 · MUST · Education spending 不能直接加 Productivity

### CONSTITUTION-U0260
必须经 teachers/seats/enrollment/time/graduates/skill stock。

### CONSTITUTION-U0261
R050 · MUST · Healthcare spending 不能直接加 Health Buff

### CONSTITUTION-U0262
必须经 staff/facility/supplies/delivered care。

### CONSTITUTION-U0263
R051 · MUST · Technology right 必须结构化

### CONSTITUTION-U0264
MASTERED、LICENSED、TRANSFER_IN_PROGRESS、JOINTLY_OWNED、RESTRICTED 不得合并为 hasTechnology。

### CONSTITUTION-U0265
R052 · MUST · Licence 不等于 Mastery

### CONSTITUTION-U0266
Licence expiry、territory、production limit、royalty、export/sub-license constraints 必须可执行。

### CONSTITUTION-U0267
R053 · MUST · R&D 完成不能直接增加产能

### CONSTITUTION-U0268
只能产生 technology capability/right。

### CONSTITUTION-U0269
R054 · MUST · 项目批准不能直接增加 Capacity

### CONSTITUTION-U0270
必须经过融资、材料、劳动力、技术、施工和 commissioning。

### CONSTITUTION-U0271
R055 · MUST · Project completion 只创建资产/Capacity

### CONSTITUTION-U0272
GDP 只能在后续生产/服务中产生。

### CONSTITUTION-U0273
R056 · MUST · Construction 必须消耗真实材料和劳动

### CONSTITUTION-U0274
不能只支付 capex 后生成项目。

### CONSTITUTION-U0275
R057 · MUST · Public Housing / Hospital / School 等实体设施遵守统一 Project Engine

### CONSTITUTION-U0276
Social 是需求 owner，不得绕过 Project Engine。

### CONSTITUTION-U0277
R058 · MUST · Technology 国际交流必须产生权利/义务

### CONSTITUTION-U0278
Licence、Transfer、Joint R&D、Research Centre、Talent Exchange 不能只变 researchSpeed。

### CONSTITUTION-U0279
10. Production、Energy 与基础设施约束

### CONSTITUTION-U0280
Potential Output / InstalledCapacity × TargetUtilisation × Productivity

### CONSTITUTION-U0281
Actual Output / PotentialOutput × min(InputAvailability, EnergyAvailability, LabourAvailability, LogisticsAvailability)

### CONSTITUTION-U0282
R059 · MUST · 生产必须消耗真实投入

### CONSTITUTION-U0283
检查库存不是消耗；结算时 input inventory 必须扣减。

### CONSTITUTION-U0284
R060 · MUST · Sector 不能各自发明完全不同的隐式生产 Buff

### CONSTITUTION-U0285
统一 bottleneck framework，特殊行业只能显式增加参数。

### CONSTITUTION-U0286
R061 · MUST · Energy shortage 必须约束实际 Output

### CONSTITUTION-U0287
不能仅展示 warning。

### CONSTITUTION-U0288
R062 · MUST · Logistics/port/rail/grid capacity 必须形成 throughput bottleneck

### CONSTITUTION-U0289
Trade 合同不能绕过基础设施容量。

### CONSTITUTION-U0290
R063 · MUST · Capacity Utilisation 是实际 Capacity 上的运营目标/结果

### CONSTITUTION-U0291
不得替代 Installed Capacity。

### CONSTITUTION-U0292
R064 · MUST · Infrastructure capacity 使用真实单位

### CONSTITUTION-U0293
port tonnes/day、grid GW、storage units 等。

### CONSTITUTION-U0294
11. Fiscal、Treasury、Banking 与 Monetary Accounting

### CONSTITUTION-U0295
Central Bank / Assets = Liabilities + Equity

### CONSTITUTION-U0296
Commercial Banks / Assets = Liabilities + Equity

### CONSTITUTION-U0297
Debt Stock / Debt_(t+1) = Debt_t + NewBorrowing - PrincipalRepayment

### CONSTITUTION-U0298
R065 · MUST · 所有金融交易必须 balanced posting

### CONSTITUTION-U0299
CB 和商业银行不得单边修改资产或负债。

### CONSTITUTION-U0300
R066 · MUST · 贷款创造存款

### CONSTITUTION-U0301
bank loan origination 同时增加 loan asset 与 deposit liability。

### CONSTITUTION-U0302
R067 · MUST · 贷款偿还销毁对应存款/现金流

### CONSTITUTION-U0303
不得只减少 loan。

### CONSTITUTION-U0304
R068 · MUST · M2 只能从现金/存款账本派生

### CONSTITUTION-U0305
CB 禁止 setM2。

### CONSTITUTION-U0306
R069 · MUST · 政府付款必须经过 Treasury Account

### CONSTITUTION-U0307
不得由任何 Office 直接修改 receiver balance 而不记 Treasury flow。

### CONSTITUTION-U0308
R070 · MUST · Treasury 没有资金时 Fail Closed

### CONSTITUTION-U0309
生成 delayed/payment arrear/default/partial payment，不得假装成功。

### CONSTITUTION-U0310
R071 · MUST · Government spending 与 transfers 分开

### CONSTITUTION-U0311
福利转移不能直接计为 GDP G。

### CONSTITUTION-U0312
R072 · MUST · Official Reserve 只有授权交易可写

### CONSTITUTION-U0313
普通私人进口不得直接扣官方外储。

### CONSTITUTION-U0314
12. National Accounts 与派生指标

### CONSTITUTION-U0315
Production GDP / GDP = sum(SectorValueAdded) + ProductTaxes - ProductSubsidies

### CONSTITUTION-U0316
Expenditure Reconciliation / GDP = C + I + G + X - M

### CONSTITUTION-U0317
R073 · MUST · GDP 只能有一个权威 production-account algorithm

### CONSTITUTION-U0318
支出法用于 reconciliation，不得各页面维护 GDP。

### CONSTITUTION-U0319
R074 · MUST · GDP 两种口径不一致必须报错

### CONSTITUTION-U0320
禁止取平均、覆盖或 silent ignore。

### CONSTITUTION-U0321
R075 · MUST · Trade 只在 Delivered/ownership-transfer 时确认 X/M

### CONSTITUTION-U0322
签合同和发货不能提前记国民账户。

### CONSTITUTION-U0323
R076 · MUST · Transfers 不能双算 GDP

### CONSTITUTION-U0324
福利支付只在最终消费发生时进入 C。

### CONSTITUTION-U0325
R077 · MUST · CPI 必须由固定 basket 和真实价格计算

### CONSTITUTION-U0326
Food/Energy/Housing/General Goods/Services。

### CONSTITUTION-U0327
R078 · MUST · Inflation decomposition 必须可加总解释

### CONSTITUTION-U0328
各 contribution 与 headline change reconciliation。

### CONSTITUTION-U0329
R079 · MUST · Derived indicators 只读

### CONSTITUTION-U0330
Debt/GDP、unemployment rate、coverage、crime rate、poverty、HHI 等不能直接写。

### CONSTITUTION-U0331
R080 · MUST · Score 不得成为经济输入

### CONSTITUTION-U0332
禁止 score bonus 影响 productivity、trade、FX、credit。

### CONSTITUTION-U0333
13. Trade、Tariff、Contract、FX 与跨国原子结算

### CONSTITUTION-U0334
Tariff key / Tariff[Importer, Exporter, Commodity]

### CONSTITUTION-U0335
Trade rule precedence / Sanction > Ban/Quota > Treaty > BilateralOverride > GeneralTariff

### CONSTITUTION-U0336
R081 · MUST · Tariff resolution 必须单一函数/服务

### CONSTITUTION-U0337
各页面不得复制 if/else 规则。

### CONSTITUTION-U0338
R082 · MUST · 跨国商品交易必须同时生成 goods flow + money flow

### CONSTITUTION-U0339
不能只改一边。

### CONSTITUTION-U0340
R083 · MUST · FDI 必须生成 cash flow + ownership

### CONSTITUTION-U0341
不能只增加 FDI 指标。

### CONSTITUTION-U0342
R084 · MUST · Sovereign loan 必须生成 borrower liability + lender asset

### CONSTITUTION-U0343
不得只给借款国现金。

### CONSTITUTION-U0344
R085 · MUST · Technology deal 必须生成 payment + technology right/obligation

### CONSTITUTION-U0345
不得只增加科技速度。

### CONSTITUTION-U0346
R086 · MUST · Cross-Border Settlement 必须原子化

### CONSTITUTION-U0347
任何一方失败时全局回滚或进入明确 pending/default 状态。

### CONSTITUTION-U0348
R087 · MUST · Contract 必须结构化并版本化

### CONSTITUTION-U0349
free text 不能直接改变经济状态。

### CONSTITUTION-U0350
R088 · MUST · Offer/Counteroffer 每次生成新 version

### CONSTITUTION-U0351
已审批版本的关键字段修改后审批自动失效。

### CONSTITUTION-U0352
R089 · MUST · FX 初版统一 Local Currency vs GCU

### CONSTITUTION-U0353
不得建立 70x69 独立 pairwise authoritative FX states。

### CONSTITUTION-U0354
R090 · MUST · 历史 FX 交易锁定成交汇率

### CONSTITUTION-U0355
不得使用当前汇率重估历史现金结算。

### CONSTITUTION-U0356
14. Office、RoleAssignment、Approval 与 Governance

### CONSTITUTION-U0357
Office ID | 主责

### CONSTITUTION-U0358
CAPTAIN | Governance / Strategy

### CONSTITUTION-U0359
CENTRAL_BANK | Monetary

### CONSTITUTION-U0360
FINANCE | Fiscal

### CONSTITUTION-U0361
TRADE | External

### CONSTITUTION-U0362
INDUSTRY | Productive

### CONSTITUTION-U0363
SOCIAL | Human & Social

### CONSTITUTION-U0364
R091 · MUST · RoleAssignment 必须 many-to-many

### CONSTITUTION-U0365
Player 可兼任，但 Office 实体永远六个。

### CONSTITUTION-U0366
R092 · MUST · Approval 记录按 Office 存储

### CONSTITUTION-U0367
不得以 required_users 代替 required_offices。

### CONSTITUTION-U0368
R093 · MUST · 同一玩家兼任多个 Office 不得 auto-approve

### CONSTITUTION-U0369
每个 Required Office 必须生成独立 approval record。

### CONSTITUTION-U0370
R094 · MUST · server 端必须重复验证权限

### CONSTITUTION-U0371
不能只靠隐藏按钮。

### CONSTITUTION-U0372
R095 · MUST · Political Capital 与经济公式隔离

### CONSTITUTION-U0373
只能用于治理、改革、紧急权力和政治行动。

### CONSTITUTION-U0374
R096 · MUST · Credibility 只能由历史行为派生

### CONSTITUTION-U0375
不得提供 Increase Credibility 操作。

### CONSTITUTION-U0376
R097 · MUST · Captain strategy 不得直接给 productivity/GDP buff

### CONSTITUTION-U0377
只能改变目标、优先级、审批、评分 benchmark 和承诺。

### CONSTITUTION-U0378
15. Security、RLS、Classified Data 与 Admin 权限

### CONSTITUTION-U0379
R098 · MUST · RLS 不得因开发便利关闭

### CONSTITUTION-U0380
Season 新表必须定义最小权限访问策略。

### CONSTITUTION-U0381
R099 · MUST · 秘密信息必须数据库/API 层隔离

### CONSTITUTION-U0382
Classified Technology、Negotiation Draft、Cabinet Brief、Treasury/CB detailed data 不能仅前端隐藏。

### CONSTITUTION-U0383
R100 · MUST · Admin 不能在正式模式绕过物理法则

### CONSTITUTION-U0384
Shock 应修改原因；直接 set GDP/Inflation 只允许 isolated debug tooling，且不得进入正式 scoring。

### CONSTITUTION-U0385
15.1 Server-side authorization 必查项

### CONSTITUTION-U0386
检查项 | 必须验证

### CONSTITUTION-U0387
Identity | authenticated user id

### CONSTITUTION-U0388
Season | user belongs to active season/world

### CONSTITUTION-U0389
Country | user belongs to target country

### CONSTITUTION-U0390
Office | has required office assignment

### CONSTITUTION-U0391
Object | object belongs to same season/country/negotiation

### CONSTITUTION-U0392
State | current object state allows command

### CONSTITUTION-U0393
Version | expected_version matches current

### CONSTITUTION-U0394
Approval | all required offices satisfied

### CONSTITUTION-U0395
RLS | row policy permits exact operation

### CONSTITUTION-U0396
15.2 Classified visibility

### CONSTITUTION-U0397
数据 | 可见范围

### CONSTITUTION-U0398
Classified Technology | owner country authorised Industry/Captain; Trade only when negotiation approved

### CONSTITUTION-U0399
Contract Draft / Counteroffer | negotiation parties and authorised offices only

### CONSTITUTION-U0400
Internal Cabinet Brief | country cabinet roles according to briefing scope

### CONSTITUTION-U0401
Treasury detailed cash/debt | Finance; Captain summary; other offices only request-relevant fields

### CONSTITUTION-U0402
CB detailed balance sheet | CB; Captain summary; Finance shared interfaces only

### CONSTITUTION-U0403
Secret sanction preparation | authorised Trade/Captain/CB as measure requires

### CONSTITUTION-U0404
16. Transaction、Concurrency 与 Error Handling

### CONSTITUTION-U0405
所有多实体关键操作必须数据库事务化，包括 project approval + funding commitment + approval record + future obligations。

### CONSTITUTION-U0406
Cross-border delivery/payment、bond issuance、loan origination、tax collection、welfare payment、technology licence activation、FDI closing 都必须定义 atomic boundary。

### CONSTITUTION-U0407
并发写入使用 version / optimistic locking 或数据库锁；发现 stale version 必须返回 VERSION_CONFLICT。

### CONSTITUTION-U0408
关键失败不得 fallback success；失败要 rollback、记录 error event/log，并向调用方返回明确错误码。

### CONSTITUTION-U0409
物理 Stock 计算成负值时必须拒绝 transaction 或进入明确 shortage/arrear 状态，不得 clamp 到 0 后宣称成功。

### CONSTITUTION-U0410
错误码 | 含义

### CONSTITUTION-U0411
VERSION_CONFLICT | 对象版本已变化，客户端必须重新读取

### CONSTITUTION-U0412
INSUFFICIENT_STOCK | 实体商品/资源不足

### CONSTITUTION-U0413
INSUFFICIENT_TREASURY_CASH | 政府现金不足

### CONSTITUTION-U0414
INSUFFICIENT_BANK_LIQUIDITY | 银行/支付结算不足

### CONSTITUTION-U0415
MISSING_REQUIRED_APPROVAL | Required Office 未完成

### CONSTITUTION-U0416
PERMISSION_DENIED | 用户无 Office / Country 权限

### CONSTITUTION-U0417
INVALID_STATE_TRANSITION | 对象当前状态不允许操作

### CONSTITUTION-U0418
UNIT_MISMATCH | 单位或维度不一致

### CONSTITUTION-U0419
LEDGER_IMBALANCE | 资产负债或交易分录不平

### CONSTITUTION-U0420
NATIONAL_ACCOUNTS_RECONCILIATION_ERROR | GDP / accounts 对账失败

### CONSTITUTION-U0421
DUPLICATE_COMMAND | 幂等键已处理

### CONSTITUTION-U0422
EVENT_ALREADY_PROCESSED | Scheduled Event 重复

### CONSTITUTION-U0423
CLASSIFIED_ACCESS_DENIED | 秘密信息无访问权

### CONSTITUTION-U0424
CROSS_BORDER_SETTLEMENT_FAILED | 跨国原子结算失败

### CONSTITUTION-U0425
17. Engine API、读写边界与依赖规则

### CONSTITUTION-U0426
Engine | 唯一写入职责 | 主要读取

### CONSTITUTION-U0427
Population | writes population stocks/flows | reads migration/birth/death events

### CONSTITUTION-U0428
Labour | writes employment, vacancy, wage states | reads population, projects, public-service staffing

### CONSTITUTION-U0429
Education | writes seats/enrollment/graduates | reads population, budget, teachers

### CONSTITUTION-U0430
Healthcare | writes capacity/service/backlog | reads population, labour, budget, supplies

### CONSTITUTION-U0431
Housing | writes units/occupancy/gap/rent state | reads population, migration, projects

### CONSTITUTION-U0432
Public Safety | writes personnel deployment/incidents/backlog | reads population, social conditions

### CONSTITUTION-U0433
Resource | writes geological/developed/extracted inventory | reads projects, labour, energy, technology

### CONSTITUTION-U0434
Energy | writes generation/availability | reads plants, fuel, labour

### CONSTITUTION-U0435
Production | writes output/input consumption | reads capacity, inventories, labour, energy, technology

### CONSTITUTION-U0436
Technology | writes technology rights/progress | reads R&D programmes, licences, talent

### CONSTITUTION-U0437
Project | writes project lifecycle/capacity creation | reads funding, materials, labour, technology, approvals

### CONSTITUTION-U0438
Household | writes income/consumption demand | reads wages, taxes, transfers, prices, credit

### CONSTITUTION-U0439
Fiscal | writes taxes, treasury, debt | reads taxable activity, payments, debt market

### CONSTITUTION-U0440
Banking/Monetary | writes loans/deposits/reserves/monetary aggregates | reads policy, credit demand, payments

### CONSTITUTION-U0441
Trade/Contract | writes rules/contracts/orders/shipments | reads inventories, partner offers, approvals

### CONSTITUTION-U0442
FX | writes FX rate / external settlement positions | reads trade, capital, policy, intervention

### CONSTITUTION-U0443
National Accounts | writes GDP/CPI/current account/derived macro | reads authoritative flows from engines

### CONSTITUTION-U0444
Risk/Scoring | writes risk state/score/notifications | reads authoritative world state only

### CONSTITUTION-U0445
任何 Engine 若需要写其他 Engine 的权威状态，必须发 Domain Command/Event 由目标 Engine 执行，而不是直接数据库写入。

### CONSTITUTION-U0446
18. Shock、Crisis、Political Capital、Credibility 与 Score

### CONSTITUTION-U0447
18.1 Shock Composer 允许修改的原因层

### CONSTITUTION-U0448
类别 | 允许冲击

### CONSTITUTION-U0449
Supply | resource production, commodity inventory, energy supply

### CONSTITUTION-U0450
Capacity | factory, mine, grid, port, housing, hospital, education facilities

### CONSTITUTION-U0451
Financial | NPL, bank asset loss, sovereign access, market liquidity

### CONSTITUTION-U0452
Population/Public Services | health demand, migration, labour availability, public safety demand

### CONSTITUTION-U0453
External Access | trade route, sanction, contract disruption, shipping delay

### CONSTITUTION-U0454
Asset Values | collateral / financial asset valuation where modelled

### CONSTITUTION-U0455
18.2 Shock Composer 禁止直接写入

### CONSTITUTION-U0456
禁止直接修改

### CONSTITUTION-U0457
GDP

### CONSTITUTION-U0458
Inflation

### CONSTITUTION-U0459
Score

### CONSTITUTION-U0460
Industrial Strength

### CONSTITUTION-U0461
Trade Power

### CONSTITUTION-U0462
Social Stability

### CONSTITUTION-U0463
Banking Confidence

### CONSTITUTION-U0464
Currency Pressure

### CONSTITUTION-U0465
Productivity unless shock is explicitly a technology/productivity event with causal state

### CONSTITUTION-U0466
18.3 Score

### CONSTITUTION-U0467
Score 只能在全部经济结算完成后计算。

### CONSTITUTION-U0468
Score 只能读取 world state / derived indicators。

### CONSTITUTION-U0469
任何 score bonus、rank bonus、league boost 不得写回 World Engine。

### CONSTITUTION-U0470
19. Realtime、Performance、Snapshot 与 Cache

### CONSTITUTION-U0471
Realtime subscription 必须按 country、negotiation、market、contract、room 或 event channel scoped，禁止 subscribe(*)。

### CONSTITUTION-U0472
高频 UI 可以读 denormalized/cache view，但写入仍然通过 authoritative command。

### CONSTITUTION-U0473
Snapshot 可以按 simulation day / checkpoint 保存，用于恢复、读取和 replay 加速。

### CONSTITUTION-U0474
Snapshot 过期或缺失时必须能从权威 ledger / events / current tables 恢复，不得把 snapshot 当唯一真相。

### CONSTITUTION-U0475
性能优化不得牺牲 transaction atomicity、RLS、idempotency、ledger reconciliation 或 Source of Truth。

### CONSTITUTION-U0476
批量结算可以按国家/分区并行，但跨国原子交易和共享市场 clearing 必须有确定顺序或事务边界。

### CONSTITUTION-U0477
20. World Simulation 向后兼容与迁移纪律

### CONSTITUTION-U0478
现有 World Simulation、Simulation 一级目录、合同、预测、角色、危机等功能不得因 Season 开发而静默删除。

### CONSTITUTION-U0479
共享逻辑优先抽入 shared economic engine；Season 与 World Simulation 使用各自 orchestrator。

### CONSTITUTION-U0480
如果 schema 改动影响旧 Simulation，必须提供兼容 view/adapter/migration。

### CONSTITUTION-U0481
数据库 migration 必须可重复执行、可检测已应用状态，并提供 forward-fix 或 rollback 说明。

### CONSTITUTION-U0482
不能以“新架构更干净”为理由删除用户现有数据或破坏旧 route/API。

### CONSTITUTION-U0483
涉及历史数据 backfill 时，必须标明来源和转换公式，禁止填入看似合理但无法追溯的默认值。

### CONSTITUTION-U0484
21. Debug / Test / Production 隔离

### CONSTITUTION-U0485
环境 | 允许 | 禁止

### CONSTITUTION-U0486
Development | seed assets、skip time、inspect hidden state、synthetic shock、replay | 不得把 debug bypass 混入正式 route

### CONSTITUTION-U0487
Test | fixed seed、time acceleration、fixture reset、invariant stress test | 不得依赖真实 production data

### CONSTITUTION-U0488
Production Season | 正常 Office command、admin approved shock、正式 settlement | 禁止 direct state edit、skip approval、inject money/resource、set GDP/score

### CONSTITUTION-U0489
debug flag 必须 server-side controlled。

### CONSTITUTION-U0490
正式 Season 数据中必须能识别并拒绝 debug-only command。

### CONSTITUTION-U0491
任何 debug override 产生的数据不得进入正式 ranking/scoring。

### CONSTITUTION-U0492
22. 测试体系与 CI Merge Gate

### CONSTITUTION-U0493
Test Suite | 强制覆盖

### CONSTITUTION-U0494
Architecture | single source registry, forbidden direct writes, role model

### CONSTITUTION-U0495
Commodity Conservation | inventory identity per commodity and cross-border transfer

### CONSTITUTION-U0496
Resource Conservation | geological endowment cannot increase

### CONSTITUTION-U0497
Population Conservation | birth/death/migration identity

### CONSTITUTION-U0498
Labour/Skill | no instant labour/skill creation

### CONSTITUTION-U0499
Project Physicality | approval != capacity; materials/labour consumed

### CONSTITUTION-U0500
Technology Rights | licensed/mastered distinction and expiry

### CONSTITUTION-U0501
Bank Ledger | assets = liabilities + equity

### CONSTITUTION-U0502
Central Bank Ledger | balanced posting

### CONSTITUTION-U0503
Treasury | no unpaid payment marked paid

### CONSTITUTION-U0504
Debt | issuance / coupon / repayment stock consistency

### CONSTITUTION-U0505
Cross-Border Settlement | buyer/seller atomic flow

### CONSTITUTION-U0506
Tariff Resolver | full precedence matrix

### CONSTITUTION-U0507
Contract Versioning | approval invalidation after counteroffer

### CONSTITUTION-U0508
FX | GCU conversion, historical rate locking

### CONSTITUTION-U0509
National Accounts | production vs expenditure reconciliation

### CONSTITUTION-U0510
CPI | basket and decomposition reconciliation

### CONSTITUTION-U0511
Permission | Office/country/season/server auth

### CONSTITUTION-U0512
RLS | unauthorised rows inaccessible

### CONSTITUTION-U0513
Idempotency | duplicate command/event has no duplicate effect

### CONSTITUTION-U0514
Concurrency | version conflict and transaction rollback

### CONSTITUTION-U0515
10x Clock | all durations resolve via simulation time

### CONSTITUTION-U0516
World Simulation Regression | existing core functionality preserved

### CONSTITUTION-U0517
Realtime Scope | no global broad subscription

### CONSTITUTION-U0518
Debug Isolation | production rejects debug command

### CONSTITUTION-U0519
Merge Gate / 任何 P0 invariant test、ledger reconciliation、permission/RLS test 或 World Simulation regression 失败时，禁止 merge。不得使用 skip、xfail、comment-out 或降低断言来规避。

### CONSTITUTION-U0520
23. Codex 明确禁止的代码模式

### CONSTITUTION-U0521
Forbidden Pattern

### CONSTITUTION-U0522
client component 直接 update authoritative Supabase row。

### CONSTITUTION-U0523
为了方便在多个 Office 各保存一份 GDP / debt / inventory / employment。

### CONSTITUTION-U0524
使用 Math.random() 产生正式 Season 结果。

### CONSTITUTION-U0525
使用 Date.now() 判定经济到期。

### CONSTITUTION-U0526
使用普通 number 长期累计 Money / Debt / Interest。

### CONSTITUTION-U0527
quantity 字段无 unit。

### CONSTITUTION-U0528
百分比有时 15、有时 0.15。

### CONSTITUTION-U0529
catch error 后 return success。

### CONSTITUTION-U0530
库存不足时 clamp to zero 后仍完成交易。

### CONSTITUTION-U0531
Treasury cash 不足时仍标记 payment paid。

### CONSTITUTION-U0532
项目 approved 后直接 capacity += X。

### CONSTITUTION-U0533
R&D complete 后直接 production/productivity += X。

### CONSTITUTION-U0534
educationSpending 直接 productivity buff。

### CONSTITUTION-U0535
healthcareSpending 直接 health buff。

### CONSTITUTION-U0536
policyEffect 直接 inventory += X。

### CONSTITUTION-U0537
admin shock 直接 GDP -= X 或 inflation += X。

### CONSTITUTION-U0538
high score / rank 反向加 economic bonus。

### CONSTITUTION-U0539
combined role enum。

### CONSTITUTION-U0540
same user holds two offices -> auto approve。

### CONSTITUTION-U0541
只在 UI 隐藏 classified 数据而 API 返回全量。

### CONSTITUTION-U0542
关闭 RLS 或使用 service role 将客户端全局写权限暴露。

### CONSTITUTION-U0543
subscribe(*) 或整个世界所有行的 realtime subscription。

### CONSTITUTION-U0544
历史 Event UPDATE/DELETE。

### CONSTITUTION-U0545
Offer/Counteroffer 覆盖旧版本。

### CONSTITUTION-U0546
跨国交易先扣卖方后异步随缘增加买方。

### CONSTITUTION-U0547
Engine A 直接 UPDATE Engine B 的权威表。

### CONSTITUTION-U0548
用 hidden country bonus 持续乘生产率/贸易力。

### CONSTITUTION-U0549
用 average tariff 替代 country x commodity 规则。

### CONSTITUTION-U0550
用 current FX 重新解释历史成交。

### CONSTITUTION-U0551
删除失败测试以通过 CI。

### CONSTITUTION-U0552
没有 migration/backfill 直接修改生产 schema。

### CONSTITUTION-U0553
为了 Season 直接替换或删除 World Simulation 路由/状态。

### CONSTITUTION-U0554
24. 允许简化与禁止简化

### CONSTITUTION-U0555
允许简化 | 禁止简化

### CONSTITUTION-U0556
减少 UI 动画、减少图表、延迟非核心可视化 | 守恒关系

### CONSTITUTION-U0557
减少 sector/commodity/technology 的展示复杂度但不得改变固定 registry | Source of Truth

### CONSTITUTION-U0558
第一版使用聚合 Commercial Banking Sector | 资产负债平衡

### CONSTITUTION-U0559
第一版使用 GCU 作为统一国际结算锚 | 跨国双边原子 flow

### CONSTITUTION-U0560
降低地图/视觉复杂度 | 权限/RLS

### CONSTITUTION-U0561
使用 approximation function 计算价格/需求但必须显式、确定且可测试 | 事务、幂等、versioning

### CONSTITUTION-U0562
延后高级 AI narrative | 10x Simulation Clock

### CONSTITUTION-U0563
延后高级外交文本生成 | Project physicality / technology rights

### CONSTITUTION-U0564
延后更细人口微观异质性 | National Accounts reconciliation

### CONSTITUTION-U0565
延后复杂 spatial logistics | 已有 Port/Rail/Grid 容量约束

### CONSTITUTION-U0566
25. 每个 PR 必须提交的工程产物

### CONSTITUTION-U0567
PR 必填项 | 内容

### CONSTITUTION-U0568
Change Summary | 修改了什么，为什么。

### CONSTITUTION-U0569
Affected Engines | reads / writes / emits / consumes。

### CONSTITUTION-U0570
Source of Truth Impact | 新增/变更的权威变量及 owner。

### CONSTITUTION-U0571
Schema Changes | tables/columns/index/RLS/migration。

### CONSTITUTION-U0572
New Commands | command name、input、permission、idempotency key。

### CONSTITUTION-U0573
New Events | event name、payload、consumer、audit fields。

### CONSTITUTION-U0574
Transactions | atomic boundary 与 rollback behavior。

### CONSTITUTION-U0575
Approvals | required_offices 和 version binding。

### CONSTITUTION-U0576
Simulation Time | duration / schedule 如何使用 Simulation Clock。

### CONSTITUTION-U0577
Tests | unit / invariant / integration / RLS / regression。

### CONSTITUTION-U0578
Migration/Backfill | 旧数据如何迁移。

### CONSTITUTION-U0579
World Simulation Impact | 兼容性验证。

### CONSTITUTION-U0580
Performance | query / realtime / batch impact。

### CONSTITUTION-U0581
Known Limitations | 尚未实现但不会违反 P0/P1 的部分。

### CONSTITUTION-U0582
Rollback / Forward Fix | 出现问题如何恢复。

### CONSTITUTION-U0583
26. Code Review 一票否决条件

### CONSTITUTION-U0584
出现任一项即拒绝 Merge

### CONSTITUTION-U0585
新增第二个 Source of Truth。

### CONSTITUTION-U0586
client 直接写权威状态。

### CONSTITUTION-U0587
破坏资源/库存/人口/金融守恒。

### CONSTITUTION-U0588
绕过 Office approval 或 RLS。

### CONSTITUTION-U0589
使用 real time 作为经济期限。

### CONSTITUTION-U0590
Scheduled Event 非幂等。

### CONSTITUTION-U0591
跨国交易非原子。

### CONSTITUTION-U0592
金额使用不受控 binary float 累积。

### CONSTITUTION-U0593
单位/百分比语义不统一。

### CONSTITUTION-U0594
项目/研发/教育/医疗直接产生宏观 Buff。

### CONSTITUTION-U0595
Score/derived indicator 反向影响世界。

### CONSTITUTION-U0596
Admin production path 可直接 set macro outcome。

### CONSTITUTION-U0597
World Simulation regression。

### CONSTITUTION-U0598
删除/skip P0 tests。

### CONSTITUTION-U0599
关键 schema change 无 migration。

### CONSTITUTION-U0600
classified data 只在 UI 隐藏。

### CONSTITUTION-U0601
失败路径 silent success。

### CONSTITUTION-U0602
历史 event 可改写。

### CONSTITUTION-U0603
Offer approval 与 version 未绑定。

### CONSTITUTION-U0604
Engine 任意跨域直接写表。

### CONSTITUTION-U0605
27. Codex 标准任务 Prompt 模板

### CONSTITUTION-U0606
固定前缀 / 以下结构应作为每次 Codex Season 1 开发任务的固定 prompt 前缀。具体需求只能追加在其后，不得删除 Constitution。

### CONSTITUTION-U0607
You are modifying EconMind OS Season 1.

### CONSTITUTION-U0608
Treat EconMind_Season1_Codex_Implementation_Constitution.docx as non-negotiable P0/P1 engineering law.

### CONSTITUTION-U0609
Before changing code, inspect the existing repository and identify the affected engines, current Source of Truth, DB schema, API routes, RLS, realtime subscriptions and tests.

### CONSTITUTION-U0610
Do not invent a second Source of Truth. Do not directly mutate authoritative state from UI.

### CONSTITUTION-U0611
All authoritative economic time uses the single 10x Simulation Clock.

### CONSTITUTION-U0612
All physical stocks obey conservation; all financial ledgers balance; all cross-border settlement is symmetric and atomic.

### CONSTITUTION-U0613
All scheduled operations must be deterministic and idempotent.

### CONSTITUTION-U0614
Permissions and approvals are Office-based. Multi-role users do not bypass required approvals.

### CONSTITUTION-U0615
Do not replace measurable quantities with 0-100 state variables, hidden buffs, or direct macro outcome changes.

### CONSTITUTION-U0616
Preserve existing World Simulation behavior unless the task explicitly includes a backward-compatible architecture migration.

### CONSTITUTION-U0617
Use database transactions, version checks, RLS and audit events for critical operations.

### CONSTITUTION-U0618
Add or update invariant tests. Never delete or weaken a failing P0 test to make the patch pass.

### CONSTITUTION-U0619
At completion, report Changed Files, Engine Reads/Writes, Schema Changes, Commands, Events, RLS, Migrations, Tests, World Simulation Regression, Known Limitations and Rollback/Forward-Fix notes.

### CONSTITUTION-U0620
附录 A：100 条 Non-Negotiable Rules 总表

### CONSTITUTION-U0621
Rule | 标题 | 硬性要求

### CONSTITUTION-U0622
R001 | 六个 Office 不得拥有独立经济模型 | Finance、Trade、Industry、Social、CB、Captain 只能通过 shared engines 读写同一 World State。

### CONSTITUTION-U0623
R002 | Season 与 World Simulation 共用 Core，但分 Orchestrator | 不得用 Season 页面或 Season-specific state 直接替换旧 World Simulation。

### CONSTITUTION-U0624
R003 | 70 国是配置，不是硬编码 | country count 必须来自 Season configuration。

### CONSTITUTION-U0625
R004 | Engine 与 UI 分层 | React component、client state、local forecast 不得成为权威状态。

### CONSTITUTION-U0626
R005 | Domain Logic 不得散落在组件中 | 生产、税、利息、FX、合同结算、库存等必须位于 domain/engine/service 层。

### CONSTITUTION-U0627
R006 | Engine 必须声明 reads/writes/emits/consumes | 不允许任意 Engine 扫描并写入全库。

### CONSTITUTION-U0628
R007 | 跨 Engine 修改只走 Interface/Event | 禁止 Production Engine 直接 UPDATE Treasury 或 Trade 直接改 CB reserves。

### CONSTITUTION-U0629
R008 | Settlement phase 顺序固定 | 任何顺序变更都视为 Architecture Change。

### CONSTITUTION-U0630
R009 | 共享 Registry 统一目录 | commodities、technologies、project types、sectors、offices、units 由 config/registry/seed 维护。

### CONSTITUTION-U0631
R010 | Archetype 仅用于初始化 | 国家原型不能在正式计算公式中作为持续 hidden multiplier。

### CONSTITUTION-U0632
R011 | Derived View 不得反向成为主数据 | materialized view、cache、snapshot 只能读，不能形成另一套真相。

### CONSTITUTION-U0633
R012 | 禁止 Combined Role domain | 不得创建 FINANCE_CB、TRADE_INDUSTRY 等组合 Office。

### CONSTITUTION-U0634
R013 | 每个权威变量只能有一个写入者 | 其他模块只能调用接口、发事件或读取，不得复制维护。

### CONSTITUTION-U0635
R014 | 复制字段必须声明为 cache/denormalized | 并提供刷新策略，不能被业务逻辑当作事实来源。

### CONSTITUTION-U0636
R015 | 前端 forecast 与 actual 分离 | forecast_value / scenario output 不能写回 authoritative actual state。

### CONSTITUTION-U0637
R016 | Snapshot 不是 Source of Truth | Snapshot 只用于加速恢复和读取。

### CONSTITUTION-U0638
R017 | Event Ledger append-only | 历史事件禁止 UPDATE/DELETE；修正必须追加 correction event。

### CONSTITUTION-U0639
R018 | 状态必须可由 snapshot + events 重建 | 至少关键账本、合同、项目、库存、债务和审批需要可审计重放。

### CONSTITUTION-U0640
R019 | 所有经济期限必须使用 simulation time | 项目、研发、教育、培训、债务、合同、物流、福利、Licence、sanction、migration 全部统一。

### CONSTITUTION-U0641
R020 | 禁止混用 Date.now 作为经济到期依据 | real timestamp 只能审计。

### CONSTITUTION-U0642
R021 | time multiplier 只能由 Simulation Clock 提供 | 业务代码不得自行乘 10 或除 10。

### CONSTITUTION-U0643
R022 | 持续时间必须明确单位 | 禁止 duration: 30 但不说明 simulation minutes/days。

### CONSTITUTION-U0644
R023 | 利息与年化指标按 simulation calendar 统一换算 | 不得各 Engine 自行定义 year length。

### CONSTITUTION-U0645
R024 | 后台 Daily Settlement 由 simulation day boundary 触发 | 不得依赖某个玩家在线。

### CONSTITUTION-U0646
R025 | Settlement 必须 deterministic | 同初始状态、commands、events、seed 必须得到同输出。

### CONSTITUTION-U0647
R026 | 禁止业务逻辑直接使用 Math.random | 所有随机性通过 seeded RNG service。

### CONSTITUTION-U0648
R027 | Scheduled Event 必须幂等 | 重复执行不能重复付款、发货、毕业、计息或完工。

### CONSTITUTION-U0649
R028 | 每个 Command 有唯一 command_id | 重复网络请求必须能识别。

### CONSTITUTION-U0650
R029 | 每个 Event 有唯一 event_id | 处理状态与 processed_at 可审计。

### CONSTITUTION-U0651
R030 | 禁止在单次事件中递归闭环无限求解 | 价格-工资-需求等反馈必须跨 settlement phase 或下一 simulation day。

### CONSTITUTION-U0652
R031 | 同一经济事实只能入账一次 | Trade、Fiscal、National Accounts 不能各自重复加现金或交易额。

### CONSTITUTION-U0653
R032 | Correction 必须是新 Event | 不得修改旧 ledger event。

### CONSTITUTION-U0654
R033 | Money 禁止长期使用 JS binary float | 必须使用 Decimal、fixed-point integer 或 bigint minor units。

### CONSTITUTION-U0655
R034 | 所有 quantity 必须带 unit | commodity quantity、MW、MWh、tonne、barrel、people、beds 等必须通过 unit registry。

### CONSTITUTION-U0656
R035 | 禁止 silent unit conversion | annual/day/hour、LC/GCU、MW/MWh、tonne/kg 必须显式转换。

### CONSTITUTION-U0657
R036 | Backend rate 统一 0..1 | UI 可显示 0..100%，业务层不得混用 15 与 0.15。

### CONSTITUTION-U0658
R037 | Currency amount 必须携带 currency code | 禁止只存 amount。

### CONSTITUTION-U0659
R038 | FX conversion 必须记录 rate 和 valuation time | 不能事后用当前 FX 重算历史账。

### CONSTITUTION-U0660
R039 | Round policy 必须统一 | 税、利息、关税、royalty、bond cash flow 使用统一 rounding policy。

### CONSTITUTION-U0661
R040 | 物理 Stock 默认不得为负 | 允许负值的变量必须白名单。

### CONSTITUTION-U0662
R041 | 禁止政策直接修改商品库存 | 所有变化必须来自生产、交付、消费、损耗或明确 inventory transfer。

### CONSTITUTION-U0663
R042 | Initial Geological Endowment 在 Season seed 后锁定 | 技术、政策和探索不得增加物理总量。

### CONSTITUTION-U0664
R043 | 资源层级不可混用 | Geological > Undiscovered/Discovered > Recoverable > Developed > Extracted Inventory 必须区分。

### CONSTITUTION-U0665
R044 | Exploration 只能从 Undiscovered Pool 转移 | 不能凭空新增资源。

### CONSTITUTION-U0666
R045 | Technology 只能改变 recovery/cost/efficiency/discovery | 不能改变 geological total。

### CONSTITUTION-U0667
R046 | Population 不能按百分比按钮直接增加 | 只能通过人口流事件。

### CONSTITUTION-U0668
R047 | Labour 不能凭空生成 | 必须来自现有人口状态、training、education、migration、talent exchange。

### CONSTITUTION-U0669
R048 | Skill 不能即时升级 | 必须经过 programme enrollment、duration、completion。

### CONSTITUTION-U0670
R049 | Education spending 不能直接加 Productivity | 必须经 teachers/seats/enrollment/time/graduates/skill stock。

### CONSTITUTION-U0671
R050 | Healthcare spending 不能直接加 Health Buff | 必须经 staff/facility/supplies/delivered care。

### CONSTITUTION-U0672
R051 | Technology right 必须结构化 | MASTERED、LICENSED、TRANSFER_IN_PROGRESS、JOINTLY_OWNED、RESTRICTED 不得合并为 hasTechnology。

### CONSTITUTION-U0673
R052 | Licence 不等于 Mastery | Licence expiry、territory、production limit、royalty、export/sub-license constraints 必须可执行。

### CONSTITUTION-U0674
R053 | R&D 完成不能直接增加产能 | 只能产生 technology capability/right。

### CONSTITUTION-U0675
R054 | 项目批准不能直接增加 Capacity | 必须经过融资、材料、劳动力、技术、施工和 commissioning。

### CONSTITUTION-U0676
R055 | Project completion 只创建资产/Capacity | GDP 只能在后续生产/服务中产生。

### CONSTITUTION-U0677
R056 | Construction 必须消耗真实材料和劳动 | 不能只支付 capex 后生成项目。

### CONSTITUTION-U0678
R057 | Public Housing / Hospital / School 等实体设施遵守统一 Project Engine | Social 是需求 owner，不得绕过 Project Engine。

### CONSTITUTION-U0679
R058 | Technology 国际交流必须产生权利/义务 | Licence、Transfer、Joint R&D、Research Centre、Talent Exchange 不能只变 researchSpeed。

### CONSTITUTION-U0680
R059 | 生产必须消耗真实投入 | 检查库存不是消耗；结算时 input inventory 必须扣减。

### CONSTITUTION-U0681
R060 | Sector 不能各自发明完全不同的隐式生产 Buff | 统一 bottleneck framework，特殊行业只能显式增加参数。

### CONSTITUTION-U0682
R061 | Energy shortage 必须约束实际 Output | 不能仅展示 warning。

### CONSTITUTION-U0683
R062 | Logistics/port/rail/grid capacity 必须形成 throughput bottleneck | Trade 合同不能绕过基础设施容量。

### CONSTITUTION-U0684
R063 | Capacity Utilisation 是实际 Capacity 上的运营目标/结果 | 不得替代 Installed Capacity。

### CONSTITUTION-U0685
R064 | Infrastructure capacity 使用真实单位 | port tonnes/day、grid GW、storage units 等。

### CONSTITUTION-U0686
R065 | 所有金融交易必须 balanced posting | CB 和商业银行不得单边修改资产或负债。

### CONSTITUTION-U0687
R066 | 贷款创造存款 | bank loan origination 同时增加 loan asset 与 deposit liability。

### CONSTITUTION-U0688
R067 | 贷款偿还销毁对应存款/现金流 | 不得只减少 loan。

### CONSTITUTION-U0689
R068 | M2 只能从现金/存款账本派生 | CB 禁止 setM2。

### CONSTITUTION-U0690
R069 | 政府付款必须经过 Treasury Account | 不得由任何 Office 直接修改 receiver balance 而不记 Treasury flow。

### CONSTITUTION-U0691
R070 | Treasury 没有资金时 Fail Closed | 生成 delayed/payment arrear/default/partial payment，不得假装成功。

### CONSTITUTION-U0692
R071 | Government spending 与 transfers 分开 | 福利转移不能直接计为 GDP G。

### CONSTITUTION-U0693
R072 | Official Reserve 只有授权交易可写 | 普通私人进口不得直接扣官方外储。

### CONSTITUTION-U0694
R073 | GDP 只能有一个权威 production-account algorithm | 支出法用于 reconciliation，不得各页面维护 GDP。

### CONSTITUTION-U0695
R074 | GDP 两种口径不一致必须报错 | 禁止取平均、覆盖或 silent ignore。

### CONSTITUTION-U0696
R075 | Trade 只在 Delivered/ownership-transfer 时确认 X/M | 签合同和发货不能提前记国民账户。

### CONSTITUTION-U0697
R076 | Transfers 不能双算 GDP | 福利支付只在最终消费发生时进入 C。

### CONSTITUTION-U0698
R077 | CPI 必须由固定 basket 和真实价格计算 | Food/Energy/Housing/General Goods/Services。

### CONSTITUTION-U0699
R078 | Inflation decomposition 必须可加总解释 | 各 contribution 与 headline change reconciliation。

### CONSTITUTION-U0700
R079 | Derived indicators 只读 | Debt/GDP、unemployment rate、coverage、crime rate、poverty、HHI 等不能直接写。

### CONSTITUTION-U0701
R080 | Score 不得成为经济输入 | 禁止 score bonus 影响 productivity、trade、FX、credit。

### CONSTITUTION-U0702
R081 | Tariff resolution 必须单一函数/服务 | 各页面不得复制 if/else 规则。

### CONSTITUTION-U0703
R082 | 跨国商品交易必须同时生成 goods flow + money flow | 不能只改一边。

### CONSTITUTION-U0704
R083 | FDI 必须生成 cash flow + ownership | 不能只增加 FDI 指标。

### CONSTITUTION-U0705
R084 | Sovereign loan 必须生成 borrower liability + lender asset | 不得只给借款国现金。

### CONSTITUTION-U0706
R085 | Technology deal 必须生成 payment + technology right/obligation | 不得只增加科技速度。

### CONSTITUTION-U0707
R086 | Cross-Border Settlement 必须原子化 | 任何一方失败时全局回滚或进入明确 pending/default 状态。

### CONSTITUTION-U0708
R087 | Contract 必须结构化并版本化 | free text 不能直接改变经济状态。

### CONSTITUTION-U0709
R088 | Offer/Counteroffer 每次生成新 version | 已审批版本的关键字段修改后审批自动失效。

### CONSTITUTION-U0710
R089 | FX 初版统一 Local Currency vs GCU | 不得建立 70x69 独立 pairwise authoritative FX states。

### CONSTITUTION-U0711
R090 | 历史 FX 交易锁定成交汇率 | 不得使用当前汇率重估历史现金结算。

### CONSTITUTION-U0712
R091 | RoleAssignment 必须 many-to-many | Player 可兼任，但 Office 实体永远六个。

### CONSTITUTION-U0713
R092 | Approval 记录按 Office 存储 | 不得以 required_users 代替 required_offices。

### CONSTITUTION-U0714
R093 | 同一玩家兼任多个 Office 不得 auto-approve | 每个 Required Office 必须生成独立 approval record。

### CONSTITUTION-U0715
R094 | server 端必须重复验证权限 | 不能只靠隐藏按钮。

### CONSTITUTION-U0716
R095 | Political Capital 与经济公式隔离 | 只能用于治理、改革、紧急权力和政治行动。

### CONSTITUTION-U0717
R096 | Credibility 只能由历史行为派生 | 不得提供 Increase Credibility 操作。

### CONSTITUTION-U0718
R097 | Captain strategy 不得直接给 productivity/GDP buff | 只能改变目标、优先级、审批、评分 benchmark 和承诺。

### CONSTITUTION-U0719
R098 | RLS 不得因开发便利关闭 | Season 新表必须定义最小权限访问策略。

### CONSTITUTION-U0720
R099 | 秘密信息必须数据库/API 层隔离 | Classified Technology、Negotiation Draft、Cabinet Brief、Treasury/CB detailed data 不能仅前端隐藏。

### CONSTITUTION-U0721
R100 | Admin 不能在正式模式绕过物理法则 | Shock 应修改原因；直接 set GDP/Inflation 只允许 isolated debug tooling，且不得进入正式 scoring。

### CONSTITUTION-U0722
附录 B：Source of Truth Registry

### CONSTITUTION-U0723
Domain | Authoritative Owner | 禁止的重复真相

### CONSTITUTION-U0724
Population | Population Engine | 任何 Office/client/cache 独立维护同义 authoritative field

### CONSTITUTION-U0725
Employment / Unemployment | Labour & Wage Engine | 任何 Office/client/cache 独立维护同义 authoritative field

### CONSTITUTION-U0726
Skill Stock | Education & Human Capital + Labour Engine 按定义交接 | 任何 Office/client/cache 独立维护同义 authoritative field

### CONSTITUTION-U0727
Education Seats / Graduates | Education Engine | 任何 Office/client/cache 独立维护同义 authoritative field

### CONSTITUTION-U0728
Healthcare Capacity | Healthcare Engine | 任何 Office/client/cache 独立维护同义 authoritative field

### CONSTITUTION-U0729
Housing Units / Gap | Housing Engine | 任何 Office/client/cache 独立维护同义 authoritative field

### CONSTITUTION-U0730
Police Capacity / Crime Backlog | Public Safety Engine | 任何 Office/client/cache 独立维护同义 authoritative field

### CONSTITUTION-U0731
Geological Resource | Resource Engine | 任何 Office/client/cache 独立维护同义 authoritative field

### CONSTITUTION-U0732
Commodity Inventory | Resource & Inventory Engine | 任何 Office/client/cache 独立维护同义 authoritative field

### CONSTITUTION-U0733
Energy Generation | Energy Engine | 任何 Office/client/cache 独立维护同义 authoritative field

### CONSTITUTION-U0734
Industrial Output | Production Engine | 任何 Office/client/cache 独立维护同义 authoritative field

### CONSTITUTION-U0735
Technology Rights | Technology & R&D Engine | 任何 Office/client/cache 独立维护同义 authoritative field

### CONSTITUTION-U0736
Project Progress / Capacity Creation | Project & Infrastructure Engine | 任何 Office/client/cache 独立维护同义 authoritative field

### CONSTITUTION-U0737
Household Income / Consumption | Household & Demand Engine | 任何 Office/client/cache 独立维护同义 authoritative field

### CONSTITUTION-U0738
Tax Revenue / Treasury Cash | Fiscal & Treasury Ledger | 任何 Office/client/cache 独立维护同义 authoritative field

### CONSTITUTION-U0739
Government Debt | Debt sub-ledger in Fiscal Engine | 任何 Office/client/cache 独立维护同义 authoritative field

### CONSTITUTION-U0740
Bank Loans / Deposits | Banking Ledger | 任何 Office/client/cache 独立维护同义 authoritative field

### CONSTITUTION-U0741
Monetary Base / M1 / M2 | Monetary Engine derived from ledgers | 任何 Office/client/cache 独立维护同义 authoritative field

### CONSTITUTION-U0742
Official Reserves | Central Bank Ledger | 任何 Office/client/cache 独立维护同义 authoritative field

### CONSTITUTION-U0743
Tariff / Quota / Treaty Rules | Trade Rules Engine | 任何 Office/client/cache 独立维护同义 authoritative field

### CONSTITUTION-U0744
Contract Obligations | Contract Engine | 任何 Office/client/cache 独立维护同义 authoritative field

### CONSTITUTION-U0745
Cross-Border Delivered Trade | Cross-Border Settlement | 任何 Office/client/cache 独立维护同义 authoritative field

### CONSTITUTION-U0746
FX Rate | FX Engine | 任何 Office/client/cache 独立维护同义 authoritative field

### CONSTITUTION-U0747
GDP / CPI / Inflation / Current Account | National Accounts Engine | 任何 Office/client/cache 独立维护同义 authoritative field

### CONSTITUTION-U0748
Risk / Score | Risk & Scoring Engine | 任何 Office/client/cache 独立维护同义 authoritative field

### CONSTITUTION-U0749
附录 C：Office 与 Engine 权限矩阵

### CONSTITUTION-U0750
Office | 主要读取 | 可发起写入 | 禁止直接写入

### CONSTITUTION-U0751
Captain | Governance / Risk summaries / approvals | Strategy, cabinet agenda, political actions | 不得直接写 fiscal/monetary/production/social authoritative state

### CONSTITUTION-U0752
Central Bank | Banking/Monetary, FX, CB ledger | Rates, OMO, reserve tools, FX intervention | 不得写 Treasury、trade contracts、production

### CONSTITUTION-U0753
Finance | Fiscal/Treasury/Debt | Tax, budget, debt, guarantees, payment authority | 不得选择 project physical design 或 CB policy

### CONSTITUTION-U0754
Trade | Trade/Contract/Global Market | Tariff, quota, contracts, international negotiation | 不得写 domestic production 或 official reserves

### CONSTITUTION-U0755
Industry | Resource/Energy/Production/Technology/Project | projects, production targets, R&D, resource development | 不得写 Treasury、tariff、labour policy

### CONSTITUTION-U0756
Social | Population/Labour/Education/Healthcare/Housing/Public Safety | minimum wage, training, education allocation, migration, welfare, safety | 不得写 tax/debt/production/FX

### CONSTITUTION-U0757
附录 D：Required Invariant Test Suites

### CONSTITUTION-U0758
Suite | 最低断言

### CONSTITUTION-U0759
Commodity Conservation | 任一商品任一国家 Opening + Production + Imports - Consumption - Exports - Losses = Closing

### CONSTITUTION-U0760
Resource Conservation | Initial geological endowment 永不增加；exploration 仅转移 undiscovered

### CONSTITUTION-U0761
Population | 人口恒等式和 labour population subset

### CONSTITUTION-U0762
Skill | 无 programme completion/migration 时 skill stock 不凭空增加

### CONSTITUTION-U0763
Project | 未满足 funding/material/labour/technology/approval 时不能 operational

### CONSTITUTION-U0764
Banking | 每个 posting 后 balance sheet 平衡

### CONSTITUTION-U0765
Treasury | 未支付不能 marked paid；cash flow 对账

### CONSTITUTION-U0766
Cross-border | 卖方减少 = 买方 received / transit 状态，支付双方一致

### CONSTITUTION-U0767
Contract | version/approval invalidation/idempotency

### CONSTITUTION-U0768
Time | 所有 due event 使用 simulation clock

### CONSTITUTION-U0769
National Accounts | GDP reconciliation and X/M matching

### CONSTITUTION-U0770
Security | RLS/office/classified access

### CONSTITUTION-U0771
Concurrency | stale version fails; retry idempotent

### CONSTITUTION-U0772
Regression | existing World Simulation critical flows unchanged

### CONSTITUTION-U0773
附录 E：错误码与 Fail-Closed 规则

### CONSTITUTION-U0774
错误 | 默认行为

### CONSTITUTION-U0775
VERSION_CONFLICT | 对象版本已变化，客户端必须重新读取；不得自动降级为成功。

### CONSTITUTION-U0776
INSUFFICIENT_STOCK | 实体商品/资源不足；不得自动降级为成功。

### CONSTITUTION-U0777
INSUFFICIENT_TREASURY_CASH | 政府现金不足；不得自动降级为成功。

### CONSTITUTION-U0778
INSUFFICIENT_BANK_LIQUIDITY | 银行/支付结算不足；不得自动降级为成功。

### CONSTITUTION-U0779
MISSING_REQUIRED_APPROVAL | Required Office 未完成；不得自动降级为成功。

### CONSTITUTION-U0780
PERMISSION_DENIED | 用户无 Office / Country 权限；不得自动降级为成功。

### CONSTITUTION-U0781
INVALID_STATE_TRANSITION | 对象当前状态不允许操作；不得自动降级为成功。

### CONSTITUTION-U0782
UNIT_MISMATCH | 单位或维度不一致；不得自动降级为成功。

### CONSTITUTION-U0783
LEDGER_IMBALANCE | 资产负债或交易分录不平；不得自动降级为成功。

### CONSTITUTION-U0784
NATIONAL_ACCOUNTS_RECONCILIATION_ERROR | GDP / accounts 对账失败；不得自动降级为成功。

### CONSTITUTION-U0785
DUPLICATE_COMMAND | 幂等键已处理；不得自动降级为成功。

### CONSTITUTION-U0786
EVENT_ALREADY_PROCESSED | Scheduled Event 重复；不得自动降级为成功。

### CONSTITUTION-U0787
CLASSIFIED_ACCESS_DENIED | 秘密信息无访问权；不得自动降级为成功。

### CONSTITUTION-U0788
CROSS_BORDER_SETTLEMENT_FAILED | 跨国原子结算失败；不得自动降级为成功。

### CONSTITUTION-U0789
附录 F：Merge Checklist

### CONSTITUTION-U0790
□ 已读取 Constitution 与受影响 Engine 规范。

### CONSTITUTION-U0791
□ 已列出 Source of Truth 与读写边界。

### CONSTITUTION-U0792
□ 无新的重复 authoritative field。

### CONSTITUTION-U0793
□ UI 无直接权威写入。

### CONSTITUTION-U0794
□ 10x Simulation Clock 全部通过统一接口。

### CONSTITUTION-U0795
□ 金额、比例、单位类型统一。

### CONSTITUTION-U0796
□ 关键操作有 transaction。

### CONSTITUTION-U0797
□ retry 有 idempotency key。

### CONSTITUTION-U0798
□ 并发有 version check。

### CONSTITUTION-U0799
□ Office permission + country + season + object state server-side 校验。

### CONSTITUTION-U0800
□ RLS 已新增/更新并测试。

### CONSTITUTION-U0801
□ classified data 在 API/DB 层隔离。

### CONSTITUTION-U0802
□ cross-border settlement 原子且双边对称。

### CONSTITUTION-U0803
□ resource/inventory/population/ledger invariants 通过。

### CONSTITUTION-U0804
□ project/technology/education/healthcare 不存在 direct buff。

### CONSTITUTION-U0805
□ GDP/CPI/derived indicators 只由 authoritative flows 计算。

### CONSTITUTION-U0806
□ Shock 不直接写宏观结果。

### CONSTITUTION-U0807
□ Score 不反向写经济状态。

### CONSTITUTION-U0808
□ Event Ledger append-only。

### CONSTITUTION-U0809
□ migration/backfill 已提供。

### CONSTITUTION-U0810
□ World Simulation regression 通过。

### CONSTITUTION-U0811
□ Realtime subscription scoped。

### CONSTITUTION-U0812
□ Debug command 无法进入 Production Season。

### CONSTITUTION-U0813
□ 所有 P0 tests 未被 skip/削弱。

### CONSTITUTION-U0814
□ PR 产物清单完整。

### CONSTITUTION-U0815
FINAL MERGE LAW / 如果一个实现“看起来能跑”，但违反守恒、账本、权限、Source of Truth、10x 时间、事务、幂等、版本、RLS 或跨国原子结算，它就不是可接受的 Season 1 实现。Codex 必须优先保持世界规则正确，再追求代码简洁和交付速度。
