# CAPTAIN｜原始规范文本索引

原文件：`EconMind_Season1_Country_Captain_Function_Specification.docx`
本文件为段落/表格顺序提取，未修改规则，未协调矛盾；图像、批注、页眉页脚与版式以原Word为准。锚点仅供回查，不代表独立需求条数。

### CAPTAIN-U0001
EconMind OS Season 1

### CAPTAIN-U0002
Country Captain / Head of Government

### CAPTAIN-U0003
完整职能、权限、流程与系统实现规范

### CAPTAIN-U0004
Full Function, Authority, Workflow & System Specification

### CAPTAIN-U0005
Version: Season 1 Office Redesign Draft 1.0
Basis: Existing World Simulation Player Manual + Season 1 redesign discussion
Purpose: Product design / role specification / engineering handoff

### CAPTAIN-U0006
0. 文档定位与设计原则

### CAPTAIN-U0007
本文件将 Country Captain / Head of Government 作为 Season 1 六个标准 Office 之一进行完整定义。六个 Office 永久存在，玩家可以兼任多个 Office，但 Office 权限本身不合并。本文仅定义 Captain，不替代 Finance、Trade、Industry、Central Bank、Social 各自的详细职能文件。

### CAPTAIN-U0008
核心定义 / Captain = Strategy + Coordination + Political Authority + Final Accountability。Captain 不直接管理日常经济政策，而负责国家长期方向、当前优先级、内阁议程、重大国家决策、政治资本、危机统筹和战略外交。

### CAPTAIN-U0009
0.1 设计必须满足的约束

### CAPTAIN-U0010
不把 Captain 设计成“超级部长”。其他 Office 的日常权限必须保留。

### CAPTAIN-U0011
不允许 Captain 直接调整普通税率、政策利率、最低工资、普通关税、普通产业补贴、普通商品合同等专业部门参数。

### CAPTAIN-U0012
所有重大政策必须区分 Owner、Required Approval、Optional Support，而不是笼统地“归 Captain”。

### CAPTAIN-U0013
Political Capital、Administrative Capacity、Fiscal Space、Foreign Reserves、Policy Credibility 等共享国家资源继续保留，但控制权分离。

### CAPTAIN-U0014
Policy Credibility 为系统内生结果，不允许任何玩家直接调节。

### CAPTAIN-U0015
所有 Captain 权力必须留下操作记录、审批记录与责任归属。

### CAPTAIN-U0016
兼任时仍按 Office 身份执行权限。例如同一玩家同时任 Captain 与 Finance，也要留下 Captain approval 与 Finance approval 两条独立记录。

### CAPTAIN-U0017
Captain 的核心乐趣来自战略判断、协调、承诺、冲突处理与最终责任，而不是更多 slider。

### CAPTAIN-U0018
0.2 与现有版本的继承关系

### CAPTAIN-U0019
现有 Captain 功能 | Season 1 处理

### CAPTAIN-U0020
National Priority | 保留并扩展为 Current National Priorities，同时新增长期 National Development Strategy。

### CAPTAIN-U0021
Emergency Coordination 0–100 | 删除连续 slider，改为 Normal / Elevated / Emergency 三档危机协调状态。

### CAPTAIN-U0022
Communication Quality 0–100 | 删除 slider，改为 Government Commitment / Public Statement 行动与承诺追踪。

### CAPTAIN-U0023
Political Capital Allocation | 保留并扩展为 Cabinet Political Support / Crisis Reserve。

### CAPTAIN-U0024
Executive Directive | 保留，但限定次数、用途、成本和不可突破的制度边界。

### CAPTAIN-U0025
Cabinet Approval | 显著强化，形成 Proposal、Revision、Joint Package、Vote、Decision Log。

### CAPTAIN-U0026
International Summit | 保留并扩展为 Bilateral / Multilateral / Crisis / Strategic Summit + Negotiation Room。

### CAPTAIN-U0027
1. Office 身份与角色使命

### CAPTAIN-U0028
1.1 正式名称与系统标识

### CAPTAIN-U0029
字段 | 定义

### CAPTAIN-U0030
System Role ID | CAPTAIN

### CAPTAIN-U0031
标准英文名 | Country Captain / Head of Government

### CAPTAIN-U0032
标准中文名 | 国家队长 / 政府首脑

### CAPTAIN-U0033
可选展示称谓 | Prime Minister / President / Chancellor；仅为国家 flavor，不改变权限

### CAPTAIN-U0034
Office 数量 | 每国 1 个 Captain Office

### CAPTAIN-U0035
玩家数量 | 可由 1 名玩家担任；同一玩家可兼任其他 Office

### CAPTAIN-U0036
1.2 角色使命

### CAPTAIN-U0037
制定并维护国家长期发展战略。

### CAPTAIN-U0038
设置当前主要与次要国家优先目标。

### CAPTAIN-U0039
建立 Cabinet Agenda，决定政府当前集中处理哪些问题。

### CAPTAIN-U0040
协调五个专业 Office，识别政策冲突、资源冲突和目标冲突。

### CAPTAIN-U0041
对达到国家级阈值的项目、改革、条约、制裁、危机措施进行最终审批。

### CAPTAIN-U0042
配置有限 Political Capital，决定政府政治推动力投向何处。

### CAPTAIN-U0043
在国家危机中启用协调机制、召集紧急内阁、宣布或结束紧急状态。

### CAPTAIN-U0044
代表国家参与重大国际峰会和战略外交承诺。

### CAPTAIN-U0045
对政府公开承诺负责，承诺实现情况影响 Policy Credibility 与 Public Support。

### CAPTAIN-U0046
承担国家整体结果的最终政治责任，但不替代专业 Office 的独立判断。

### CAPTAIN-U0047
1.3 明确禁止的日常权限

### CAPTAIN-U0048
Captain 不得直接操作 | 对应 Owner

### CAPTAIN-U0049
Policy Interest Rate / Inflation Target / Reserve Requirement / normal OMO | Central Bank

### CAPTAIN-U0050
VAT / PIT / Corporate Tax / ordinary Government Spending settings | Finance

### CAPTAIN-U0051
Average Tariff / routine import-export measures / ordinary commodity contracts | Trade

### CAPTAIN-U0052
R&D project selection / ordinary industrial subsidy / routine production decisions | Industry

### CAPTAIN-U0053
Minimum Wage / normal welfare / benefit duration / ordinary labour policy | Social

### CAPTAIN-U0054
2. Captain Dashboard 完整信息架构

### CAPTAIN-U0055
2.1 页面一级模块

### CAPTAIN-U0056
01 National Situation

### CAPTAIN-U0057
02 National Development Strategy

### CAPTAIN-U0058
03 Current National Priorities

### CAPTAIN-U0059
04 Cabinet Agenda

### CAPTAIN-U0060
05 Cabinet & Office Status

### CAPTAIN-U0061
06 Strategic Decisions / Approval Inbox

### CAPTAIN-U0062
07 Political Capital

### CAPTAIN-U0063
08 Government Commitments

### CAPTAIN-U0064
09 International Affairs

### CAPTAIN-U0065
10 Crisis Command

### CAPTAIN-U0066
11 National Intelligence Brief

### CAPTAIN-U0067
12 Decision & Accountability Log

### CAPTAIN-U0068
2.2 顶部 National Overview 固定指标

### CAPTAIN-U0069
Real GDP Growth

### CAPTAIN-U0070
Inflation

### CAPTAIN-U0071
Unemployment

### CAPTAIN-U0072
Poverty Rate

### CAPTAIN-U0073
Public Support

### CAPTAIN-U0074
National Stability

### CAPTAIN-U0075
Debt-to-GDP

### CAPTAIN-U0076
Fiscal Deficit

### CAPTAIN-U0077
Fiscal Space

### CAPTAIN-U0078
Foreign Reserves

### CAPTAIN-U0079
Current Account

### CAPTAIN-U0080
Productivity

### CAPTAIN-U0081
Energy Security

### CAPTAIN-U0082
Food Security

### CAPTAIN-U0083
Policy Credibility

### CAPTAIN-U0084
Administrative Capacity

### CAPTAIN-U0085
以上指标默认只读。Captain 可通过战略、审批、协调和共享政策间接改变结果，但不能在 Overview 上直接修改。

### CAPTAIN-U0086
3. National Development Strategy 长期国家发展战略

### CAPTAIN-U0087
3.1 结构

### CAPTAIN-U0088
Primary National Strategy：必须选择 1 个。

### CAPTAIN-U0089
Supporting Strategy：允许选择 0–1 个。

### CAPTAIN-U0090
Strategy Start Date：系统记录。

### CAPTAIN-U0091
Strategy Review Date：系统建议检查但不强制结束。

### CAPTAIN-U0092
Strategy Progress：系统计算，不由玩家手填。

### CAPTAIN-U0093
Strategy Consistency：系统计算各 Office 行动与战略的一致程度。

### CAPTAIN-U0094
3.2 Primary / Supporting Strategy 完整候选列表

### CAPTAIN-U0095
Strategy | 中文 | 核心关注

### CAPTAIN-U0096
Export-Led Industrialisation | 出口导向工业化 | 制造能力、出口竞争力、物流、贸易渠道、产业升级

### CAPTAIN-U0097
Technology Leadership | 科技领先 | R&D、技术树、高技能劳动力、先进制造、技术许可

### CAPTAIN-U0098
Resource Power | 资源强国 | 资源开采、能源与矿产供给、出口、战略储备、资源外交

### CAPTAIN-U0099
Green Transition | 绿色转型 | 可再生能源、核能、电网、排放、碳政策、绿色产业

### CAPTAIN-U0100
Domestic Consumption Economy | 内需驱动经济 | 居民收入、消费、就业、社会保障、国内产业需求

### CAPTAIN-U0101
Financial & Services Hub | 金融与服务中心 | 金融稳定、资本流动、专业服务、数字基础设施、国际融资

### CAPTAIN-U0102
Strategic Self-Sufficiency | 战略自主 | 关键商品安全、国内产能、储备、供应链多元化、关键技术

### CAPTAIN-U0103
Social Development | 社会发展 | 就业、减贫、公共服务、收入分配、人力资本、住房

### CAPTAIN-U0104
Infrastructure-Led Growth | 基础设施驱动增长 | 交通、能源、数字、物流、建设能力、长期生产率

### CAPTAIN-U0105
3.3 Strategy 的系统效果

### CAPTAIN-U0106
改变国家评分中“战略完成度”的权重和评价目标。

### CAPTAIN-U0107
改变 National Intelligence Brief 的重点风险与建议排序。

### CAPTAIN-U0108
改变 Cabinet Recommendation 的内容优先级。

### CAPTAIN-U0109
形成公开政府预期，长期偏离战略会降低 Strategy Consistency。

### CAPTAIN-U0110
影响部分重大项目是否被标记为 Strategically Aligned / Neutral / Misaligned。

### CAPTAIN-U0111
影响政府公开承诺的合理性判断。

### CAPTAIN-U0112
不直接给予 GDP、Productivity、Public Support 等无条件数值 Buff。

### CAPTAIN-U0113
3.4 Strategy 修改动作

### CAPTAIN-U0114
动作 | 权限与后果

### CAPTAIN-U0115
Maintain Strategy | 维持现有 Primary / Supporting Strategy；无额外成本。

### CAPTAIN-U0116
Change Supporting Strategy | 允许较低成本调整；系统记录原因和日期。

### CAPTAIN-U0117
Change Primary Strategy | 高成本重大决定；消耗 Political Capital，并根据原战略持续时间、既有投入、未完成承诺计算 Credibility/Consistency penalty。

### CAPTAIN-U0118
Suspend Strategy during Crisis | 危机中可暂时降低战略执行优先级，但不等于正式改变战略；危机结束后需恢复或正式重设。

### CAPTAIN-U0119
4. Current National Priorities 当前国家优先目标

### CAPTAIN-U0120
4.1 Priority 层级

### CAPTAIN-U0121
Primary Priority：必须 1 个。

### CAPTAIN-U0122
Secondary Priority：必须 1 个且不得与 Primary 相同。

### CAPTAIN-U0123
Priority 不等于长期 Strategy，可随短中期形势调整。

### CAPTAIN-U0124
4.2 完整 Priority 列表

### CAPTAIN-U0125
Economic Growth

### CAPTAIN-U0126
Price Stability

### CAPTAIN-U0127
Employment

### CAPTAIN-U0128
Fiscal Sustainability

### CAPTAIN-U0129
External Stability

### CAPTAIN-U0130
Poverty Reduction

### CAPTAIN-U0131
Energy Security

### CAPTAIN-U0132
Food Security

### CAPTAIN-U0133
Productivity

### CAPTAIN-U0134
Green Transition

### CAPTAIN-U0135
Financial Stability

### CAPTAIN-U0136
National Security

### CAPTAIN-U0137
4.3 Priority 的系统作用

### CAPTAIN-U0138
调整 Captain / Country scoring 中当前政策目标的权重。

### CAPTAIN-U0139
改变 Cabinet Agenda 推荐问题排序。

### CAPTAIN-U0140
影响 Public Expectations。

### CAPTAIN-U0141
影响系统对政策成功/失败的解释。

### CAPTAIN-U0142
当 Priority 与 Office 行动明显冲突时生成 Cabinet Conflict。

### CAPTAIN-U0143
长期未改善 Primary Priority 时降低 Government Performance / Credibility。

### CAPTAIN-U0144
4.4 Priority 修改规则

### CAPTAIN-U0145
允许比 Strategy 更频繁修改。

### CAPTAIN-U0146
修改必须选择 Reason：External Shock / Crisis / Target Achieved / Deterioration / Strategy Alignment / Other。

### CAPTAIN-U0147
连续短期无理由切换形成 Government Consistency penalty。

### CAPTAIN-U0148
Priority 修改本身生成世界/国内政府事件记录。

### CAPTAIN-U0149
5. Cabinet Agenda 内阁议程

### CAPTAIN-U0150
5.1 Active Agenda 容量

### CAPTAIN-U0151
同一时间最多 3 个 Active Cabinet Issues。每个 Issue 是一个政府需要跨部门处理的问题，不是具体政策。

### CAPTAIN-U0152
5.2 每个 Agenda Issue 的完整字段

### CAPTAIN-U0153
字段 | 定义

### CAPTAIN-U0154
Issue Title | 问题名称

### CAPTAIN-U0155
Issue Category | Inflation / Employment / Fiscal / Trade / Industry / Energy / Food / Social / Financial / Security / Environment / Other

### CAPTAIN-U0156
Priority Level | Strategic / High / Medium

### CAPTAIN-U0157
Problem Statement | 问题描述

### CAPTAIN-U0158
Target / Success Condition | 目标或可衡量成功条件

### CAPTAIN-U0159
Lead Office | 1 个主责 Office

### CAPTAIN-U0160
Supporting Offices | 0–5 个支持 Office

### CAPTAIN-U0161
Constraints | 不可突破约束，如储备底线、财政上限

### CAPTAIN-U0162
Target Date | 目标日期，可选

### CAPTAIN-U0163
Required Proposal | 是否要求正式 Cabinet Proposal

### CAPTAIN-U0164
Status | Draft / Active / Under Review / Resolved / Abandoned

### CAPTAIN-U0165
Captain Notes | 给 Cabinet 的短说明

### CAPTAIN-U0166
5.3 Captain 对 Agenda 的动作

### CAPTAIN-U0167
Create Issue

### CAPTAIN-U0168
Edit Issue

### CAPTAIN-U0169
Assign Lead Office

### CAPTAIN-U0170
Add / Remove Supporting Office

### CAPTAIN-U0171
Change Priority Level

### CAPTAIN-U0172
Request Proposal

### CAPTAIN-U0173
Request Joint Policy Package

### CAPTAIN-U0174
Mark Under Review

### CAPTAIN-U0175
Mark Resolved

### CAPTAIN-U0176
Abandon Issue

### CAPTAIN-U0177
Reopen Resolved Issue

### CAPTAIN-U0178
6. Cabinet Proposal System 重大提案系统

### CAPTAIN-U0179
6.1 何时进入 Proposal

### CAPTAIN-U0180
达到重大财政成本阈值。

### CAPTAIN-U0181
达到重大 Foreign Reserves 使用阈值。

### CAPTAIN-U0182
消耗大量 Political Capital 或 Administrative Capacity。

### CAPTAIN-U0183
被标记为 Strategic Project / Strategic Reform。

### CAPTAIN-U0184
涉及多个 Office 的 Required Approval。

### CAPTAIN-U0185
涉及主权、战略资产、金融稳定、债务重组、重大制裁或紧急状态。

### CAPTAIN-U0186
Captain 在 Cabinet Agenda 中主动要求正式 Proposal。

### CAPTAIN-U0187
6.2 Proposal 完整字段

### CAPTAIN-U0188
字段 | 定义

### CAPTAIN-U0189
Proposal ID | 唯一编号

### CAPTAIN-U0190
Name | 提案名称

### CAPTAIN-U0191
Proposing Office | 发起 Office

### CAPTAIN-U0192
Supporting Offices | 支持 Office

### CAPTAIN-U0193
Issue Link | 关联 Cabinet Agenda

### CAPTAIN-U0194
Problem | 问题

### CAPTAIN-U0195
Objective | 政策目标

### CAPTAIN-U0196
Policy / Project Settings | 具体参数

### CAPTAIN-U0197
Strategic Alignment | 与国家战略的一致性

### CAPTAIN-U0198
Primary Priority Alignment | 与当前主要优先目标的一致性

### CAPTAIN-U0199
Fiscal Cost | 财政成本

### CAPTAIN-U0200
FX Cost | 外储/外币成本

### CAPTAIN-U0201
Political Cost | 政治资本成本

### CAPTAIN-U0202
Administrative Burden | 行政能力占用

### CAPTAIN-U0203
Commodity Requirements | 关键商品需求

### CAPTAIN-U0204
Labour Requirements | 劳动力需求

### CAPTAIN-U0205
Technology Prerequisites | 技术前置条件

### CAPTAIN-U0206
Implementation Timeline | 实施时间

### CAPTAIN-U0207
Expected Short-Term Effects | 短期效果

### CAPTAIN-U0208
Expected Medium-Term Effects | 中期效果

### CAPTAIN-U0209
Expected Long-Term Effects | 长期效果

### CAPTAIN-U0210
Main Risks | 主要风险

### CAPTAIN-U0211
Dependencies | 依赖

### CAPTAIN-U0212
Alternatives | 替代方案

### CAPTAIN-U0213
Required Approvals | 强制审批 Office

### CAPTAIN-U0214
Optional Support | 可选支持 Office

### CAPTAIN-U0215
Status | Draft / Submitted / Revision Requested / Voting / Approved / Rejected / Withdrawn / Implementing / Closed

### CAPTAIN-U0216
6.3 Captain 的五种正式决策

### CAPTAIN-U0217
动作 | 定义 | 必须记录

### CAPTAIN-U0218
Approve | 批准按当前版本实施。 | Decision reason、time、Captain office identity

### CAPTAIN-U0219
Reject | 拒绝该版本。 | 拒绝理由：Too Expensive / Strategic Mismatch / Excessive Risk / Insufficient Resources / Wrong Timing / Other

### CAPTAIN-U0220
Request Revision | 退回发起 Office 修改。 | 必须写 Revision Request，如降低成本、改参数、补审批、推迟时间

### CAPTAIN-U0221
Request Joint Package | 要求将单部门提案升级为跨 Office 联合 Policy Package。 | 需要指定新增参与 Office 和需要补充的内容

### CAPTAIN-U0222
Call Cabinet Vote | 将争议提案提交内阁投票。 | 参与 Office、投票结果、Captain 最终处理

### CAPTAIN-U0223
7. Captain Approval Boundary 审批边界

### CAPTAIN-U0224
7.1 默认不需要 Captain 的日常政策

### CAPTAIN-U0225
Central Bank ordinary monetary policy decisions

### CAPTAIN-U0226
Finance ordinary tax-rate adjustments within normal thresholds

### CAPTAIN-U0227
Finance ordinary budget reallocations within approved envelope

### CAPTAIN-U0228
Trade ordinary tariff / quota / export policy within normal thresholds

### CAPTAIN-U0229
Trade routine commodity / commercial contracts

### CAPTAIN-U0230
Industry ordinary R&D project selection

### CAPTAIN-U0231
Industry routine industrial subsidy / production adjustment

### CAPTAIN-U0232
Social ordinary minimum-wage / welfare / benefit / labour-policy adjustments within normal thresholds

### CAPTAIN-U0233
7.2 必须 Captain 批准的类别

### CAPTAIN-U0234
Major National Project

### CAPTAIN-U0235
Major Fiscal Package

### CAPTAIN-U0236
Major Industrial Strategy

### CAPTAIN-U0237
Strategic Treaty

### CAPTAIN-U0238
Strategic Resource Agreement

### CAPTAIN-U0239
Strategic Technology Agreement

### CAPTAIN-U0240
Major Sanctions / Sanctions Escalation

### CAPTAIN-U0241
Capital Controls

### CAPTAIN-U0242
Debt Restructuring

### CAPTAIN-U0243
Sovereign Bailout / Sovereign Loan with material exposure

### CAPTAIN-U0244
Bank Resolution involving fiscal support

### CAPTAIN-U0245
Emergency Fiscal Package

### CAPTAIN-U0246
Emergency Powers / National Emergency

### CAPTAIN-U0247
Strategic Asset Sale / Foreign Control of Critical Infrastructure

### CAPTAIN-U0248
National Strategy Change

### CAPTAIN-U0249
Long-term strategic partnership or alliance

### CAPTAIN-U0250
Multilateral organisation entry/exit where implemented in Season

### CAPTAIN-U0251
7.3 Major Project 触发条件

### CAPTAIN-U0252
Fiscal cost exceeds configured GDP threshold（建议初始 2% GDP，最终由全局平衡确定）。

### CAPTAIN-U0253
FX use exceeds configured reserve threshold。

### CAPTAIN-U0254
Administrative Capacity occupation exceeds configured threshold。

### CAPTAIN-U0255
Project tagged STRATEGIC_PROJECT。

### CAPTAIN-U0256
Project changes critical national capacity：energy / food / advanced technology / major transport / financial infrastructure。

### CAPTAIN-U0257
Project creates major sovereign guarantee or contingent liability。

### CAPTAIN-U0258
7.4 Captain 对央行的制度边界

### CAPTAIN-U0259
Captain 不得否决央行普通货币政策。央行独立权限至少包括：

### CAPTAIN-U0260
Policy Interest Rate

### CAPTAIN-U0261
Reserve Requirement

### CAPTAIN-U0262
Normal Open Market Operations

### CAPTAIN-U0263
Countercyclical Buffer

### CAPTAIN-U0264
ordinary macroprudential decisions

### CAPTAIN-U0265
只有下列事项进入 Captain 联合审批：

### CAPTAIN-U0266
Large-scale Foreign Reserve deployment with sovereign implications

### CAPTAIN-U0267
Reserve Swap

### CAPTAIN-U0268
Debt Restructuring

### CAPTAIN-U0269
Capital Controls

### CAPTAIN-U0270
Bank Resolution with fiscal exposure

### CAPTAIN-U0271
Emergency financial measures requiring government guarantee / fiscal support

### CAPTAIN-U0272
8. Political Capital 政治资本管理

### CAPTAIN-U0273
8.1 Captain 的权限

### CAPTAIN-U0274
查看国家 Political Capital 当前值与变动来源。

### CAPTAIN-U0275
配置 Cabinet Political Support。

### CAPTAIN-U0276
为重大改革、产业转型、社会保护、贸易谈判、危机响应等分配政治支持。

### CAPTAIN-U0277
保留 Crisis Reserve，避免所有政治资本被提前锁定。

### CAPTAIN-U0278
不能直接“创造” Political Capital。

### CAPTAIN-U0279
8.2 Political Capital 来源

### CAPTAIN-U0280
Improved economic performance

### CAPTAIN-U0281
Higher public support

### CAPTAIN-U0282
Successful crisis response

### CAPTAIN-U0283
Fulfilled government commitments

### CAPTAIN-U0284
Successful major project delivery

### CAPTAIN-U0285
Stable government / institutional performance

### CAPTAIN-U0286
Successful strategic diplomacy

### CAPTAIN-U0287
Long periods of policy consistency

### CAPTAIN-U0288
8.3 Political Capital 消耗

### CAPTAIN-U0289
Tax increases

### CAPTAIN-U0290
Welfare cuts

### CAPTAIN-U0291
Major structural reform

### CAPTAIN-U0292
Capital controls

### CAPTAIN-U0293
Debt restructuring

### CAPTAIN-U0294
Major sanctions

### CAPTAIN-U0295
Emergency powers

### CAPTAIN-U0296
Export bans on critical goods

### CAPTAIN-U0297
Abrupt strategy reversal

### CAPTAIN-U0298
Repeated policy reversals

### CAPTAIN-U0299
Controversial major projects

### CAPTAIN-U0300
Executive Directive use

### CAPTAIN-U0301
8.4 Political Capital Allocation buckets

### CAPTAIN-U0302
Fiscal Reform

### CAPTAIN-U0303
Industrial Strategy

### CAPTAIN-U0304
Trade Negotiations

### CAPTAIN-U0305
Social Reform / Protection

### CAPTAIN-U0306
Strategic Project Support

### CAPTAIN-U0307
Crisis Response

### CAPTAIN-U0308
Unallocated / Crisis Reserve

### CAPTAIN-U0309
旧版“Central Bank Cooperation”不作为常规政治资本桶。金融危机时可出现临时 Financial Stability Coordination。

### CAPTAIN-U0310
9. Executive Directive 行政优先指令

### CAPTAIN-U0311
9.1 使用限制

### CAPTAIN-U0312
Season 内总次数有限，建议初始值 3 次。

### CAPTAIN-U0313
仅 Captain Office 可以使用。

### CAPTAIN-U0314
只能作用于已经满足必要审批、资源和前置条件的政策/项目。

### CAPTAIN-U0315
每次使用必须消耗 Political Capital。

### CAPTAIN-U0316
系统记录 Directive 对象、理由、时间和结果。

### CAPTAIN-U0317
9.2 允许效果

### CAPTAIN-U0318
提高 selected policy/project 的 administrative priority。

### CAPTAIN-U0319
缩短部分 implementation delay。

### CAPTAIN-U0320
临时调动 Administrative Capacity。

### CAPTAIN-U0321
在部门僵局中强制进入优先处理状态。

### CAPTAIN-U0322
9.3 明确禁止效果

### CAPTAIN-U0323
不得强迫 Central Bank 改利率。

### CAPTAIN-U0324
不得绕过 Fiscal Space。

### CAPTAIN-U0325
不得绕过 Foreign Reserves 约束。

### CAPTAIN-U0326
不得创造不存在的 commodity / inventory。

### CAPTAIN-U0327
不得绕过 technology prerequisite。

### CAPTAIN-U0328
不得绕过 Required Approval。

### CAPTAIN-U0329
不得删除经济副作用或 trade-off。

### CAPTAIN-U0330
不得免除财政、政治、行政成本。

### CAPTAIN-U0331
10. Government Commitment & Public Statement 政府承诺与公开沟通

### CAPTAIN-U0332
10.1 删除旧 Communication Quality Slider

### CAPTAIN-U0333
Captain 不再直接设置 0–100 的 Communication Quality。公开沟通改为可追踪的具体政府行动。

### CAPTAIN-U0334
10.2 Statement 类型

### CAPTAIN-U0335
Policy Announcement

### CAPTAIN-U0336
Crisis Address

### CAPTAIN-U0337
Strategic Announcement

### CAPTAIN-U0338
International Statement

### CAPTAIN-U0339
Reform Explanation

### CAPTAIN-U0340
Performance Update

### CAPTAIN-U0341
10.3 Commitment Level

### CAPTAIN-U0342
Cautious：方向性表态，不建立明确数值/期限承诺。

### CAPTAIN-U0343
Firm：明确承诺改善某个指标或完成某项行动。

### CAPTAIN-U0344
Explicit Target：包含明确指标、目标值和截止日期。

### CAPTAIN-U0345
10.4 Commitment 完整字段

### CAPTAIN-U0346
字段 | 定义

### CAPTAIN-U0347
Statement Type | 公开声明类型

### CAPTAIN-U0348
Issue | 涉及议题

### CAPTAIN-U0349
Commitment Level | Cautious / Firm / Explicit Target

### CAPTAIN-U0350
Target Metric | 目标指标，可为空

### CAPTAIN-U0351
Target Direction / Value | 改善方向或明确目标值

### CAPTAIN-U0352
Deadline | 截止日期，可为空

### CAPTAIN-U0353
Linked Policy / Package | 关联政策/政策包

### CAPTAIN-U0354
Linked Strategy / Priority | 关联战略或优先目标

### CAPTAIN-U0355
Status | Active / Achieved / Partially Achieved / Missed / Withdrawn

### CAPTAIN-U0356
Credibility Effect | 系统计算

### CAPTAIN-U0357
Public Support Effect | 系统计算

### CAPTAIN-U0358
10.5 承诺追踪逻辑

### CAPTAIN-U0359
Achieved：提高 Policy Credibility / Public Support，幅度取决于承诺难度和重要性。

### CAPTAIN-U0360
Partially Achieved：小幅正面或中性结果。

### CAPTAIN-U0361
Missed：降低 Credibility；明确目标失败的惩罚高于谨慎表态。

### CAPTAIN-U0362
Withdrawn：主动撤回，产生 reversal cost；若在明显外部冲击后撤回，惩罚可较低。

### CAPTAIN-U0363
Repeated unrealistic commitments：额外降低 credibility。

### CAPTAIN-U0364
11. International Affairs & Summit 国际战略外交

### CAPTAIN-U0365
11.1 Captain 可发起的 Summit 类型

### CAPTAIN-U0366
Bilateral Summit

### CAPTAIN-U0367
Multilateral Summit

### CAPTAIN-U0368
Crisis Conference

### CAPTAIN-U0369
Strategic Summit

### CAPTAIN-U0370
11.2 Summit 完整字段

### CAPTAIN-U0371
字段 | 定义

### CAPTAIN-U0372
Summit Type | 类型

### CAPTAIN-U0373
Participants | 参与国家

### CAPTAIN-U0374
Agenda | 议题

### CAPTAIN-U0375
Objectives | 目标

### CAPTAIN-U0376
Invited Offices | 本国参与 Office

### CAPTAIN-U0377
Proposed Agreements | 拟讨论协议

### CAPTAIN-U0378
Status | Invited / Confirmed / In Session / Agreement Reached / No Agreement / Cancelled

### CAPTAIN-U0379
Outcome | 结果

### CAPTAIN-U0380
11.3 Negotiation Room 可形成的结果

### CAPTAIN-U0381
Strategic Treaty

### CAPTAIN-U0382
Trade Package

### CAPTAIN-U0383
Strategic Resource Agreement

### CAPTAIN-U0384
Investment Agreement

### CAPTAIN-U0385
Technology Cooperation Agreement

### CAPTAIN-U0386
Joint Project Agreement

### CAPTAIN-U0387
Crisis Coordination Agreement

### CAPTAIN-U0388
Reserve / Financial Cooperation Agreement

### CAPTAIN-U0389
11.4 Captain 与 Trade Office 的边界

### CAPTAIN-U0390
Trade Office | Captain

### CAPTAIN-U0391
Routine trade negotiation | Strategic political commitment

### CAPTAIN-U0392
Commodity contract | Long-term strategic resource partnership

### CAPTAIN-U0393
Tariff / quota / export measure | Major sanctions / strategic treaty approval

### CAPTAIN-U0394
FDI negotiation | Strategic asset / sovereignty approval

### CAPTAIN-U0395
Technology licence commercial terms | Strategic technology alliance

### CAPTAIN-U0396
Commercial dispute | State-level diplomatic summit

### CAPTAIN-U0397
12. Crisis Command 危机统筹

### CAPTAIN-U0398
12.1 触发 Crisis Command Mode 的危机类型

### CAPTAIN-U0399
General Vulnerability Escalation

### CAPTAIN-U0400
Protest / Government Crisis

### CAPTAIN-U0401
Banking Crisis

### CAPTAIN-U0402
Debt Crisis

### CAPTAIN-U0403
Currency / Reserve Crisis

### CAPTAIN-U0404
Food Crisis

### CAPTAIN-U0405
Energy Crisis

### CAPTAIN-U0406
Critical Supply Shortage

### CAPTAIN-U0407
Major External Shock

### CAPTAIN-U0408
Institutional Crisis

### CAPTAIN-U0409
12.2 Crisis Dashboard 必须显示

### CAPTAIN-U0410
Crisis Type

### CAPTAIN-U0411
Severity

### CAPTAIN-U0412
Start Time

### CAPTAIN-U0413
Main Drivers

### CAPTAIN-U0414
Secondary Drivers

### CAPTAIN-U0415
Affected Indicators

### CAPTAIN-U0416
Affected Sectors

### CAPTAIN-U0417
Affected Population / Offices

### CAPTAIN-U0418
Immediate Risks

### CAPTAIN-U0419
Available Emergency Actions

### CAPTAIN-U0420
Political Capital available

### CAPTAIN-U0421
Administrative Capacity available

### CAPTAIN-U0422
Foreign Reserves / Fiscal Space relevant to crisis

### CAPTAIN-U0423
Active Emergency Measures

### CAPTAIN-U0424
Exit Conditions

### CAPTAIN-U0425
12.3 Captain 危机动作

### CAPTAIN-U0426
Convene Emergency Cabinet

### CAPTAIN-U0427
Create Emergency Cabinet Agenda

### CAPTAIN-U0428
Assign Lead Office

### CAPTAIN-U0429
Add Supporting Offices

### CAPTAIN-U0430
Declare Elevated Coordination

### CAPTAIN-U0431
Declare National Emergency

### CAPTAIN-U0432
Request Emergency Policy Package

### CAPTAIN-U0433
Approve / Reject emergency proposals

### CAPTAIN-U0434
Issue Crisis Address

### CAPTAIN-U0435
Request International Crisis Conference

### CAPTAIN-U0436
End Elevated Coordination

### CAPTAIN-U0437
End National Emergency

### CAPTAIN-U0438
Launch Post-Crisis Review

### CAPTAIN-U0439
12.4 Emergency Coordination 三档

### CAPTAIN-U0440
状态 | 效果 | 成本/风险

### CAPTAIN-U0441
NORMAL | 正常行政流程。 | 无额外成本。

### CAPTAIN-U0442
ELEVATED | 提高跨部门协调优先级、缩短部分紧急政策执行时间。 | 消耗 Political Capital，挤占部分 Administrative Capacity。

### CAPTAIN-U0443
EMERGENCY | 最大化危机政策优先级，开放特定紧急措施。 | 高 Political Capital cost；长期维持降低 Institutional Stability / Trust。

### CAPTAIN-U0444
12.5 Emergency Exit

### CAPTAIN-U0445
Captain 必须主动结束 Emergency。

### CAPTAIN-U0446
系统显示 Exit Conditions 是否满足。

### CAPTAIN-U0447
危机缓解后持续维持 Emergency 会产生逐步增加的政治与制度成本。

### CAPTAIN-U0448
结束 Emergency 不自动取消已发布的普通长期政策；紧急政策按各自 lifecycle 退出。

### CAPTAIN-U0449
13. Cabinet Coordination 内阁协作

### CAPTAIN-U0450
13.1 Captain Cabinet Status Board

### CAPTAIN-U0451
每个 Office 显示以下字段：

### CAPTAIN-U0452
Current Focus

### CAPTAIN-U0453
Active Policies

### CAPTAIN-U0454
Active Projects

### CAPTAIN-U0455
Pending Approvals

### CAPTAIN-U0456
Resource Requests

### CAPTAIN-U0457
Current Warnings

### CAPTAIN-U0458
Office-specific critical indicators

### CAPTAIN-U0459
Conflicts with other offices

### CAPTAIN-U0460
Linked Cabinet Agenda Issues

### CAPTAIN-U0461
13.2 Policy Conflict Detection 类型

### CAPTAIN-U0462
Fiscal expansion vs monetary tightening

### CAPTAIN-U0463
High carbon cost vs low energy-price target

### CAPTAIN-U0464
Capital controls vs FDI attraction

### CAPTAIN-U0465
Export restriction vs trade relationship / FX earnings

### CAPTAIN-U0466
High minimum wage vs low-skill employment

### CAPTAIN-U0467
Industrial subsidy vs fiscal sustainability

### CAPTAIN-U0468
Major infrastructure vs debt / inflation constraint

### CAPTAIN-U0469
Reserve defence vs reserve adequacy

### CAPTAIN-U0470
Welfare expansion vs fiscal space

### CAPTAIN-U0471
Automation / productivity drive vs labour displacement

### CAPTAIN-U0472
Strategic self-sufficiency vs import cost / efficiency

### CAPTAIN-U0473
Fast industrial expansion vs energy / skilled-labour capacity

### CAPTAIN-U0474
13.3 Captain 面对 Conflict 的动作

### CAPTAIN-U0475
Ignore / Accept Trade-off

### CAPTAIN-U0476
Request Coordination

### CAPTAIN-U0477
Add issue to Cabinet Agenda

### CAPTAIN-U0478
Request Joint Policy Package

### CAPTAIN-U0479
Request Revision of major proposal

### CAPTAIN-U0480
Convene Cabinet Vote（仅适用于需内阁决定的事项）

### CAPTAIN-U0481
14. National Intelligence Brief 国家综合情报简报

### CAPTAIN-U0482
14.1 Brief 分类

### CAPTAIN-U0483
Strategic Risks

### CAPTAIN-U0484
Emerging Risks

### CAPTAIN-U0485
Cabinet Inconsistency

### CAPTAIN-U0486
Critical Dependencies

### CAPTAIN-U0487
International Exposure

### CAPTAIN-U0488
Resource Bottlenecks

### CAPTAIN-U0489
Commitment Risk

### CAPTAIN-U0490
Strategy Progress

### CAPTAIN-U0491
Crisis Probability

### CAPTAIN-U0492
Upcoming Major Decisions

### CAPTAIN-U0493
14.2 Strategic Risks 可识别领域

### CAPTAIN-U0494
Energy dependency

### CAPTAIN-U0495
Food dependency

### CAPTAIN-U0496
Debt refinancing

### CAPTAIN-U0497
Foreign reserve adequacy

### CAPTAIN-U0498
Banking fragility

### CAPTAIN-U0499
Skilled labour shortage

### CAPTAIN-U0500
Infrastructure bottleneck

### CAPTAIN-U0501
Technology dependence

### CAPTAIN-U0502
Commodity concentration

### CAPTAIN-U0503
Trade partner concentration

### CAPTAIN-U0504
Fiscal rigidity

### CAPTAIN-U0505
Public service pressure

### CAPTAIN-U0506
Housing pressure

### CAPTAIN-U0507
Environmental / emission pressure

### CAPTAIN-U0508
Political / institutional instability

### CAPTAIN-U0509
14.3 信息原则

### CAPTAIN-U0510
Captain 获得国家级综合信息，而不是其他 Office 的隐藏精确未来结果。

### CAPTAIN-U0511
Brief 只给风险、暴露、约束、趋势和可能冲突，不提供确定性答案。

### CAPTAIN-U0512
信息基于当前世界状态、已发布政策、合同、项目和模拟传导。

### CAPTAIN-U0513
所有预测必须体现 uncertainty / confidence level。

### CAPTAIN-U0514
15. Notification System Captain 通知系统

### CAPTAIN-U0515
15.1 Captain 只接收国家级重要通知

### CAPTAIN-U0516
Approval Required

### CAPTAIN-U0517
Revision Returned / Resubmitted

### CAPTAIN-U0518
Cabinet Vote Required

### CAPTAIN-U0519
Strategic Warning

### CAPTAIN-U0520
Cabinet Conflict

### CAPTAIN-U0521
Major Project Milestone / Failure

### CAPTAIN-U0522
Treaty / Summit Invitation

### CAPTAIN-U0523
Crisis Alert

### CAPTAIN-U0524
Emergency Exit Warning

### CAPTAIN-U0525
Commitment Deadline Warning

### CAPTAIN-U0526
Commitment Achieved / Missed

### CAPTAIN-U0527
Strategy Progress Report

### CAPTAIN-U0528
Political Capital Low

### CAPTAIN-U0529
Administrative Capacity Critical

### CAPTAIN-U0530
National Condition Change

### CAPTAIN-U0531
Major Contract Default with national impact

### CAPTAIN-U0532
Critical Supply Dependency Warning

### CAPTAIN-U0533
15.2 Notification Priority

### CAPTAIN-U0534
级别 | 定义

### CAPTAIN-U0535
CRITICAL | 国家危机、重大违约、制度风险、必须立即审批

### CAPTAIN-U0536
HIGH | 重大提案、战略预警、关键承诺截止

### CAPTAIN-U0537
NORMAL | 常规战略更新、议程进展、项目里程碑

### CAPTAIN-U0538
INFO | 已完成记录、普通报告

### CAPTAIN-U0539
16. Shared Resources 与 Captain 的关系

### CAPTAIN-U0540
共享资源 | Captain 权限 | Captain 不具备的权限

### CAPTAIN-U0541
Fiscal Space | 查看；重大方案审批时考虑；可要求 Finance revision。 | 不能直接修改或生成。

### CAPTAIN-U0542
Foreign Reserves | 查看；重大动用/战略互换时参与审批。 | 不能进行日常 FX operation。

### CAPTAIN-U0543
Political Capital | 主要配置者；可分配 Cabinet support。 | 不能直接无成本增加。

### CAPTAIN-U0544
Administrative Capacity | 查看、在 Executive Directive / Emergency 中重排优先级。 | 不能创造无限行政能力。

### CAPTAIN-U0545
Policy Credibility | 查看，承诺和决策会影响。 | 完全不可直接调节。

### CAPTAIN-U0546
17. Shared Policies / Joint Decisions 与 Captain 的完整参与表

### CAPTAIN-U0547
事项 | Owner / 发起 | Required Participants | Captain 权限

### CAPTAIN-U0548
Major Infrastructure Project | Industry | Finance + Captain | Approve / Reject / Revision / Joint Package

### CAPTAIN-U0549
Major Industrial Strategy | Industry | Finance + Captain；按需要 Trade/Social | 最终审批

### CAPTAIN-U0550
National Technology Programme | Industry | Finance + Captain；按需要 Trade/Social | 最终审批

### CAPTAIN-U0551
Major Social Reform | Social | Finance + Captain | 最终审批

### CAPTAIN-U0552
Strategic Trade Treaty | Trade | Captain | 最终政治批准

### CAPTAIN-U0553
Strategic Resource Agreement | Trade | Industry + Captain；必要时 CB/Finance | 最终政治批准

### CAPTAIN-U0554
Reserve Swap | Trade / Central Bank | Trade + Central Bank + Captain | 联合批准

### CAPTAIN-U0555
Capital Controls | Trade / Central Bank | Trade + Central Bank + Captain | 联合批准

### CAPTAIN-U0556
Debt Restructuring | Finance | Finance + Central Bank + Captain | 联合批准

### CAPTAIN-U0557
Bank Resolution with Fiscal Support | Central Bank | Central Bank + Finance + Captain | 联合批准

### CAPTAIN-U0558
Major Sanctions | Trade | Trade + Captain | 最终政治批准

### CAPTAIN-U0559
Emergency Fiscal Package | Finance | Finance + relevant Offices + Captain | 最终审批

### CAPTAIN-U0560
Strategic Asset Sale | Finance / Industry / Trade depending asset | Relevant offices + Captain | 主权/战略批准

### CAPTAIN-U0561
National Emergency | Captain | Relevant offices | Captain 独占宣布/结束权

### CAPTAIN-U0562
18. Captain Scoring 评分机制

### CAPTAIN-U0563
18.1 建议权重

### CAPTAIN-U0564
组成 | 权重 | 含义

### CAPTAIN-U0565
National Performance | 30% | 国家整体经济、社会、外部与制度表现

### CAPTAIN-U0566
Strategic Progress | 20% | Primary Strategy 的实际完成度

### CAPTAIN-U0567
Cabinet Coordination | 15% | 冲突处理、议程推进、跨 Office 协作

### CAPTAIN-U0568
Credibility | 15% | 承诺兑现、政策一致性、反转与违约

### CAPTAIN-U0569
Crisis Management | 10% | 危机响应、成本控制、退出质量

### CAPTAIN-U0570
Institutional Stability | 10% | 避免滥用紧急权力、制度持续性与政府稳定

### CAPTAIN-U0571
18.2 National Guardrails

### CAPTAIN-U0572
不能通过牺牲国家整体稳定刷 Captain 分数。

### CAPTAIN-U0573
不能仅依靠 GDP growth 获得高分。

### CAPTAIN-U0574
严重通胀、债务、贫困、金融危机、制度崩溃会触发综合扣分。

### CAPTAIN-U0575
评分应更多使用 relative-to-initial-condition / progress-based 指标，而非按绝对富裕程度排名。

### CAPTAIN-U0576
危机中的成功恢复应获得高评价，即使最终绝对 GDP 仍低于富裕国家。

### CAPTAIN-U0577
19. Decision & Accountability Log 决策责任记录

### CAPTAIN-U0578
19.1 必须记录的 Captain 行为

### CAPTAIN-U0579
Strategy create/change

### CAPTAIN-U0580
Priority change

### CAPTAIN-U0581
Cabinet Agenda create/close

### CAPTAIN-U0582
Proposal approval/rejection/revision

### CAPTAIN-U0583
Cabinet Vote call

### CAPTAIN-U0584
Political Capital allocation

### CAPTAIN-U0585
Executive Directive

### CAPTAIN-U0586
Government Commitment / Statement

### CAPTAIN-U0587
Summit invitation / agreement

### CAPTAIN-U0588
Emergency declaration / escalation / exit

### CAPTAIN-U0589
Strategic treaty approval

### CAPTAIN-U0590
Major sanctions approval

### CAPTAIN-U0591
National emergency actions

### CAPTAIN-U0592
19.2 每条 Log 字段

### CAPTAIN-U0593
Actor User ID

### CAPTAIN-U0594
Actor Office = CAPTAIN

### CAPTAIN-U0595
Action Type

### CAPTAIN-U0596
Target Entity

### CAPTAIN-U0597
Before State

### CAPTAIN-U0598
After State

### CAPTAIN-U0599
Reason / Note

### CAPTAIN-U0600
Required Approvals

### CAPTAIN-U0601
Timestamp

### CAPTAIN-U0602
Political Capital Cost

### CAPTAIN-U0603
Administrative Cost

### CAPTAIN-U0604
Resulting Event ID

### CAPTAIN-U0605
20. 兼任与权限实现规则

### CAPTAIN-U0606
20.1 一人兼任时的权限模型

### CAPTAIN-U0607
Player 与 Office 使用 many-to-many RoleAssignment。不得创建诸如 CAPTAIN_FINANCE 的混合永久角色。

### CAPTAIN-U0608
同一玩家可以同时拥有 CAPTAIN 与其他 Office。

### CAPTAIN-U0609
执行动作时必须明确当前 Acting Office。

### CAPTAIN-U0610
每个 approval 以 Office 记录，不以用户数量记录。

### CAPTAIN-U0611
同一玩家兼任多个 Required Approval Office 时，仍要分别执行每个 Office 的确认动作。

### CAPTAIN-U0612
UI 必须显示当前操作身份，避免误以为以 Captain 身份修改 Finance 参数。

### CAPTAIN-U0613
21. Captain 完整玩家操作循环

### CAPTAIN-U0614
登录后阅读 National Intelligence Brief 与 National Overview。

### CAPTAIN-U0615
检查当前 National Development Strategy 与 Strategy Progress。

### CAPTAIN-U0616
检查 Primary / Secondary National Priorities 是否仍适合当前局势。

### CAPTAIN-U0617
查看 Cabinet Agenda，新增、关闭或调整最多 3 个 Active Issues。

### CAPTAIN-U0618
查看五个 Office 的 Current Focus、Warnings、Pending Approvals 与 Policy Conflicts。

### CAPTAIN-U0619
处理 Strategic Decisions / Approval Inbox。

### CAPTAIN-U0620
对需要协作的事项 Request Joint Policy Package 或 Request Coordination。

### CAPTAIN-U0621
根据政府重点重新分配 Political Capital。

### CAPTAIN-U0622
必要时使用 Government Commitment 形成公开目标。

### CAPTAIN-U0623
必要时发起 Summit / Strategic Negotiation。

### CAPTAIN-U0624
若发生危机，进入 Crisis Command，召集紧急内阁并调整协调状态。

### CAPTAIN-U0625
持续跟踪承诺、重大项目、政策包、风险与 Strategy Progress。

### CAPTAIN-U0626
通过 Rolling Cabinet Briefing / periodic report 复盘结果并修改议程。

### CAPTAIN-U0627
所有重大操作自动进入 Decision & Accountability Log。

### CAPTAIN-U0628
22. Captain 功能总清单（实现 Checklist）

### CAPTAIN-U0629
☐ Role identity / acting-office switch

### CAPTAIN-U0630
☐ National Overview

### CAPTAIN-U0631
☐ National Development Strategy: primary/supporting

### CAPTAIN-U0632
☐ Strategy progress

### CAPTAIN-U0633
☐ Strategy change cost

### CAPTAIN-U0634
☐ Current primary/secondary priorities

### CAPTAIN-U0635
☐ Priority change reason

### CAPTAIN-U0636
☐ Cabinet Agenda max 3

### CAPTAIN-U0637
☐ Issue owner/supporting offices

### CAPTAIN-U0638
☐ Cabinet Status Board

### CAPTAIN-U0639
☐ Policy Conflict Detection

### CAPTAIN-U0640
☐ Cabinet Proposal inbox

### CAPTAIN-U0641
☐ Approve

### CAPTAIN-U0642
☐ Reject

### CAPTAIN-U0643
☐ Request Revision

### CAPTAIN-U0644
☐ Request Joint Package

### CAPTAIN-U0645
☐ Call Cabinet Vote

### CAPTAIN-U0646
☐ Major decision thresholds

### CAPTAIN-U0647
☐ Political Capital dashboard

### CAPTAIN-U0648
☐ Political Capital allocation

### CAPTAIN-U0649
☐ Crisis reserve

### CAPTAIN-U0650
☐ Executive Directive limited uses

### CAPTAIN-U0651
☐ Government Statements

### CAPTAIN-U0652
☐ Commitment levels

### CAPTAIN-U0653
☐ Explicit target tracking

### CAPTAIN-U0654
☐ Credibility consequence

### CAPTAIN-U0655
☐ International Summit creation

### CAPTAIN-U0656
☐ Negotiation Room link

### CAPTAIN-U0657
☐ Strategic treaty approval

### CAPTAIN-U0658
☐ Crisis Command Mode

### CAPTAIN-U0659
☐ Emergency Cabinet

### CAPTAIN-U0660
☐ Normal/Elevated/Emergency coordination

### CAPTAIN-U0661
☐ Emergency declaration

### CAPTAIN-U0662
☐ Emergency exit

### CAPTAIN-U0663
☐ National Intelligence Brief

### CAPTAIN-U0664
☐ Strategic risk detection

### CAPTAIN-U0665
☐ Critical dependency detection

### CAPTAIN-U0666
☐ Captain notifications

### CAPTAIN-U0667
☐ Notification priority

### CAPTAIN-U0668
☐ Captain scoring

### CAPTAIN-U0669
☐ National guardrails

### CAPTAIN-U0670
☐ Decision & Accountability Log

### CAPTAIN-U0671
☐ Many-to-many role assignment

### CAPTAIN-U0672
☐ Office-level approval records

### CAPTAIN-U0673
23. 本 Office 后续仍需与其他职位共同确认的接口

### CAPTAIN-U0674
以下内容在 Captain 规范中已定义 Captain 的一侧，但最终参数和 Required Approval 仍需在对应 Office 设计时逐项确认：

### CAPTAIN-U0675
Finance：Major Fiscal Package、Debt Restructuring、Strategic Asset Sale、budget threshold。

### CAPTAIN-U0676
Industry：Major Project、National Technology Programme、Strategic Resource use。

### CAPTAIN-U0677
Trade：Strategic Treaty、Sanctions、Resource Agreement、Summit negotiation。

### CAPTAIN-U0678
Central Bank：Reserve Swap、Capital Controls、Bank Resolution、央行独立边界。

### CAPTAIN-U0679
Social：Major Social Reform、crisis support package、labour/social constraints。

### CAPTAIN-U0680
24. 最终角色定义

### CAPTAIN-U0681
最终定义 / Country Captain / Head of Government 是六 Office 体系中的国家战略与协调中枢。其独占权力包括长期国家战略、当前优先目标、Cabinet Agenda、Political Capital 配置、有限 Executive Directive、政府公开承诺、重大国际峰会、危机统筹以及国家级重大决策最终审批。Captain 不直接控制其他 Office 的日常政策，也不能突破财政、外储、行政、技术与经济传导约束。其核心评价是能否将多个独立 Office 的行为组织成一致、可信、可执行并能承担结果责任的国家战略。
