# FINANCE｜原始规范文本索引

原文件：`EconMind_Season1_Finance_Economy_Minister_Function_Specification.docx`
本文件为段落/表格顺序提取，未修改规则，未协调矛盾；图像、批注、页眉页脚与版式以原Word为准。锚点仅供回查，不代表独立需求条数。

### FINANCE-U0001
EconMind OS · Season 1

### FINANCE-U0002
MINISTER OF FINANCE & ECONOMY

### FINANCE-U0003
财政与经济部长完整功能与操作空间规范

### FINANCE-U0004
Treasury · Taxation · Budget · Public Debt · Project Financing · Fiscal Risk · Economic Coordination

### FINANCE-U0005
设计原则  本职位不拥有具体产业、福利、贸易或货币项目的政策所有权；其核心权力来自国库、预算、融资、债务、担保和财政承诺。任何政府资金、主权负债、政府担保、政府股权和未来财政义务，均须进入财政部体系。

### FINANCE-U0006
Version 1.0  ·  September 2026  ·  Internal Design Document

### FINANCE-U0007
0. 文档定位与使用方式

### FINANCE-U0008
本文件是 Season 1 中 Minister of Finance & Economy 的完整产品、规则、权限和计算规范。它用于产品设计、跨 Office 权限讨论、数据库建模、前端页面设计、后端交易逻辑、评分系统和 Codex 工程实现。本文列出的功能均视为该 Office 的正式操作空间；没有用“举例”替代未定义列表。

### FINANCE-U0009
与现有 World Simulation 的关系：保留税收、政府支出、财政赤字、公共债务、预算、贷款担保、国企/私有化以及跨部门审批的经济学逻辑，同时将“百分比滑块式财政”重构为真实金额、真实账户、真实债券、真实付款计划和真实财政承诺。

### FINANCE-U0010
01  角色定位与不可逾越的权力边界

### FINANCE-U0011
02  财政权力模型：独立、资金审批、联合提案、风险披露

### FINANCE-U0012
03  Finance Dashboard 信息架构

### FINANCE-U0013
04  Treasury 国库与现金账户

### FINANCE-U0014
05  Treasury 现金操作与支付优先级

### FINANCE-U0015
06  Revenue & Taxation 税收体系

### FINANCE-U0016
07  Tax Expenditure 税式支出与税收激励

### FINANCE-U0017
08  National Budget 国家预算架构

### FINANCE-U0018
09  Department Funding 部门资金请求

### FINANCE-U0019
10  预算执行、承诺与付款计划

### FINANCE-U0020
11  Public Debt 主权债务发行

### FINANCE-U0021
12  Debt Management 债务组合与到期管理

### FINANCE-U0022
13  Project Financing 项目融资权

### FINANCE-U0023
14  Joint Project Committee 跨 Office 项目委员会

### FINANCE-U0024
15  Government Guarantees 政府担保

### FINANCE-U0025
16  SOE 财政关系

### FINANCE-U0026
17  Fiscal Assets & Privatisation 财政资产与私有化

### FINANCE-U0027
18  Fiscal Outlook 财政预测

### FINANCE-U0028
19  Fiscal Rules & Targets 财政规则

### FINANCE-U0029
20  Fiscal Risk & Contingent Liabilities 财政风险

### FINANCE-U0030
21  Emergency Fiscal Tools 紧急财政工具

### FINANCE-U0031
22  与其余五个 Office 的完整交互边界

### FINANCE-U0032
23  审批矩阵与权限规则

### FINANCE-U0033
24  Information Advantage 财政部专属信息

### FINANCE-U0034
25  通知、任务、状态与审计日志

### FINANCE-U0035
26  评分与 National Guardrails

### FINANCE-U0036
27  数据实体与核心计算字段

### FINANCE-U0037
28  前端页面操作控件

### FINANCE-U0038
29  后台交易与会计事件

### FINANCE-U0039
30  工程验收标准与旧版迁移

### FINANCE-U0040
1. 角色定位与不可逾越的权力边界

### FINANCE-U0041
正式使命  财政部长负责把国家战略、部门政策与具体项目转化为可支付、可融资、可持续且可追踪的财政承诺；同时维护国库现金、税收收入、预算约束、主权债务、政府担保、政府股权和财政风险。

### FINANCE-U0042
Finance = Treasury + Taxation + Budget + Public Debt + Project Financing + Fiscal Risk + Economic Coordination

### FINANCE-U0043
1.1 财政部长直接拥有的领域

### FINANCE-U0044
国库现金与支付管理

### FINANCE-U0045
税制参数与税收征管政策

### FINANCE-U0046
国家预算总盘子与部门预算上限

### FINANCE-U0047
预算拨款、预算调整与财政储备

### FINANCE-U0048
国内主权债务发行与债务组合管理

### FINANCE-U0049
外币主权债务发行的财政端决策

### FINANCE-U0050
项目融资结构与政府资金参与方式

### FINANCE-U0051
政府贷款担保与担保组合

### FINANCE-U0052
政府对国企的股权、分红、注资与财政风险

### FINANCE-U0053
非战略财政资产处置与政府持股出售

### FINANCE-U0054
财政规则、财政目标与财政预测

### FINANCE-U0055
财政紧急措施与债务危机财政方案

### FINANCE-U0056
1.2 财政部长明确不拥有的领域

### FINANCE-U0057
国家发展战略和 Cabinet Agenda：由 Country Captain / Head of Government 所有。

### FINANCE-U0058
政策利率、准备金、OMO、央行外储干预和银行监管：由 Central Bank Governor 所有。

### FINANCE-U0059
具体产业路线、技术树、资源开发、能源建设和产业项目设计：由 Industry, Technology & Resources Office 所有。

### FINANCE-U0060
贸易对象、商品合同、关税之外的贸易政策、FDI 谈判、国际商业合同和经济外交：由 Trade & Foreign Affairs Office 所有。

### FINANCE-U0061
福利制度结构、劳动力制度、最低工资、失业保障、住房支持、培训制度、移民和社会分配政策：由 Labour & Social Development Office 所有。

### FINANCE-U0062
Finance 不得通过“拒绝财政支持”自动删除其他 Office 的政策。拒绝财政支持只意味着该政策不能使用 Treasury Funding、Sovereign Debt、Government Guarantee、Government Equity 或其他政府财政承诺。

### FINANCE-U0063
1.3 最高财政原则

### FINANCE-U0064
No Treasury Money / Sovereign Liability / Government Guarantee / Government Equity without Finance Approval

### FINANCE-U0065
任何需要政府现金支付、形成未来财政付款义务、增加主权债务、提供政府担保、注入政府股权、出售政府资产或承担可量化财政风险的行动，必须进入 Finance 审批或联合审批流程。

### FINANCE-U0066
2. 财政权力模型：独立、资金审批、联合提案、风险披露

### FINANCE-U0067
权力类型 | 操作方式 | 完整范围

### FINANCE-U0068
A. 独立决策权 | Finance 独立发起并发布 | 税制参数、国库现金管理、普通债券发行、债务再融资、部门预算上限、财政储备、非战略资产处置、普通担保定价与限额、财政规则。

### FINANCE-U0069
B. 资金审批权 | 其他 Office 发起，Finance 决定财政参与 | 预算拨款、项目 Treasury Funding、匹配资金、政府担保、政府股权、项目债务融资、未来财政承诺。

### FINANCE-U0070
C. 联合提案权 | Finance 与政策 Owner 共同构造方案 | 大型基础设施、国家产业计划、重大福利扩张、住房计划、R&D 计划、主权贷款、银行注资、货币融资、债务重组。

### FINANCE-U0071
D. 财政风险披露权 | Finance 可独立发布正式 Fiscal Warning | 现金缺口、债务集中到期、担保风险、SOE 隐性负债、项目付款高峰、外币债务暴露、预算不可持续。

### FINANCE-U0072
3. Finance Dashboard 信息架构

### FINANCE-U0073
Finance 前端固定为八个一级工作区；每个工作区均使用真实金额、期限、税基、债券余额、付款计划和合同状态，不使用 Fiscal Space 0–100、Debt Stress 0–100 或 Funding Strength 等人造程度值作为底层变量。

### FINANCE-U0074
工作区 | 必须包含的功能

### FINANCE-U0075
01 Treasury | 国库账户、未来现金流、应收、应付、最低现金缓冲、融资缺口、付款队列

### FINANCE-U0076
02 Revenue & Taxation | VAT、PIT、CIT、Payroll Tax、Tax Credits、税基、应纳税额、实收、欠税、税收缺口

### FINANCE-U0077
03 National Budget | 强制支出、部门预算、资本预算、经常预算、中央财政基金、预算余额

### FINANCE-U0078
04 Department Funding | 所有部门 Funding Request、审批、部分拨款、匹配资金、延期、退回修改

### FINANCE-U0079
05 Public Debt | 发行、拍卖、到期结构、票息、收益率、币种、持有人、再融资、回购、置换

### FINANCE-U0080
06 Project Financing | 所有跨 Office 项目的资金结构、政府资金、债务、担保、SOE、私人、外国资金

### FINANCE-U0081
07 Guarantees, SOEs & Fiscal Assets | 担保组合、最大暴露、担保触发、SOE 注资/分红/持股、资产出售

### FINANCE-U0082
08 Fiscal Outlook & Risk | 收入预测、支出预测、主余额、总余额、债务、现金、或有负债、压力情景

### FINANCE-U0083
4. Treasury 国库与现金账户

### FINANCE-U0084
4.1 Treasury General Account

### FINANCE-U0085
政府在中央银行持有唯一的 Treasury General Account（TGA）。所有政府现金收入和现金支付最终必须落入该账户或与该账户对应的受控财政子账户。TGA Balance 是精确的本币金额。

### FINANCE-U0086
Closing TGA = Opening TGA + Cash Receipts - Cash Payments

### FINANCE-U0087
4.2 Treasury 余额分类

### FINANCE-U0088
余额项目 | 定义

### FINANCE-U0089
Current Cash Balance | 当前已经到账且尚未支付的国库现金。

### FINANCE-U0090
Restricted Cash | 依法、合同或项目条件限制用途的现金。

### FINANCE-U0091
Emergency Reserve Cash | 财政紧急储备账户中的可调用现金。

### FINANCE-U0092
Debt Service Reserve | 专门用于债务本息支付的准备现金。

### FINANCE-U0093
Unrestricted Cash | 没有被用途限制的现金。

### FINANCE-U0094
Committed Cash | 已存在确定付款义务但尚未支付的现金需求。

### FINANCE-U0095
Free Cash | 扣除受限资金、已承诺支出和最低现金缓冲后的可自由配置现金。

### FINANCE-U0096
Free Cash = TGA Cash - Restricted Cash - Near-term Committed Payments - Minimum Cash Buffer

### FINANCE-U0097
4.3 Treasury 应收项目

### FINANCE-U0098
VAT Receivables

### FINANCE-U0099
Personal Income Tax Receivables

### FINANCE-U0100
Corporate Income Tax Receivables

### FINANCE-U0101
Payroll Tax Receivables

### FINANCE-U0102
Tariff / Customs Revenue Receivables

### FINANCE-U0103
SOE Dividend Receivables

### FINANCE-U0104
Asset Sale Receivables

### FINANCE-U0105
Guarantee Fee Receivables

### FINANCE-U0106
Domestic Borrowing Proceeds Receivable

### FINANCE-U0107
Foreign Borrowing Proceeds Receivable

### FINANCE-U0108
Intergovernmental / International Grant Receivables

### FINANCE-U0109
Loan Repayment Receivables from Public Entities

### FINANCE-U0110
Other Legally Defined Non-tax Receivables

### FINANCE-U0111
4.4 Treasury 应付项目

### FINANCE-U0112
Public Payroll

### FINANCE-U0113
Existing Pension Payments

### FINANCE-U0114
Existing Welfare Payments

### FINANCE-U0115
Departmental Operating Payments

### FINANCE-U0116
Project Milestone Payments

### FINANCE-U0117
Procurement Contract Payments

### FINANCE-U0118
Debt Interest

### FINANCE-U0119
Debt Principal Redemption

### FINANCE-U0120
Government Guarantee Calls

### FINANCE-U0121
SOE Equity Injection Commitments

### FINANCE-U0122
Capital Contribution to Public Projects

### FINANCE-U0123
International Government Obligations

### FINANCE-U0124
Sovereign Loan Repayment

### FINANCE-U0125
Court / Settlement Obligations if enabled

### FINANCE-U0126
Emergency Programme Payments

### FINANCE-U0127
5. Treasury 现金操作与支付优先级

### FINANCE-U0128
5.1 Finance 可执行的现金动作

### FINANCE-U0129
动作 | 系统行为

### FINANCE-U0130
Pay Now | 立即执行已到期且合法的付款。

### FINANCE-U0131
Schedule Payment | 为已批准义务设定未来执行日期。

### FINANCE-U0132
Prioritise Payment | 提高付款在 Treasury 队列中的优先级。

### FINANCE-U0133
Delay Eligible Payment | 仅对允许延期的义务更改付款日期并记录延期成本。

### FINANCE-U0134
Split Payment | 将允许分期的付款拆分为多个金额与日期。

### FINANCE-U0135
Draw Emergency Reserve | 将 Emergency Reserve 转入可支付现金。

### FINANCE-U0136
Transfer Between Fiscal Subaccounts | 在用途允许的财政子账户之间划转。

### FINANCE-U0137
Freeze Discretionary Payment | 冻结尚未形成法定义务的可选支出。

### FINANCE-U0138
Release Frozen Payment | 解除已冻结支出。

### FINANCE-U0139
5.2 不允许由 Finance 任意延期的支付

### FINANCE-U0140
已到期主权债务本金，除非进入正式债务重组或违约流程。

### FINANCE-U0141
已到期主权债务利息，除非进入正式债务重组或违约流程。

### FINANCE-U0142
法律/规则定义为强制支付的既有养老金和福利。

### FINANCE-U0143
已经触发且具有法律支付义务的政府担保。

### FINANCE-U0144
合同明确禁止延迟且没有重新谈判条款的政府付款。

### FINANCE-U0145
系统设定为 protected essential public-service payment 的最低支付。

### FINANCE-U0146
5.3 Treasury Cash Forecast

### FINANCE-U0147
预测区间：1 simulation day

### FINANCE-U0148
预测区间：7 simulation days

### FINANCE-U0149
预测区间：14 simulation days

### FINANCE-U0150
预测区间：30 simulation days

### FINANCE-U0151
预测区间：60 simulation days / remaining season horizon

### FINANCE-U0152
每个预测区间必须展示 Opening Cash、Expected Receipts、Mandatory Payments、Committed Discretionary Payments、Debt Service、Projected Closing Cash、Minimum Cash Buffer、Projected Financing Gap。

### FINANCE-U0153
Financing Gap = Required Payments + Minimum Cash Buffer - (Opening Cash + Expected Cash Receipts)

### FINANCE-U0154
6. Revenue & Taxation 税收体系

### FINANCE-U0155
Finance 通过税制参数影响实际税收收入。所有收入由税基 × 法定/有效税率 × 征管/合规率计算；系统同时保存应纳税额、实收、欠税和税收缺口。

### FINANCE-U0156
6.1 VAT

### FINANCE-U0157
Standard VAT Rate

### FINANCE-U0158
Reduced VAT Rate

### FINANCE-U0159
Zero-rated Categories

### FINANCE-U0160
Exempt Categories

### FINANCE-U0161
Gross Consumption Base

### FINANCE-U0162
Exempt Consumption Base

### FINANCE-U0163
Zero-rated Consumption Base

### FINANCE-U0164
Taxable Standard-rate Base

### FINANCE-U0165
Taxable Reduced-rate Base

### FINANCE-U0166
Compliance Rate

### FINANCE-U0167
VAT Liability

### FINANCE-U0168
VAT Collected

### FINANCE-U0169
VAT Arrears

### FINANCE-U0170
VAT Gap

### FINANCE-U0171
VAT Liability = Σ(Taxable Base_k × VAT Rate_k)

### FINANCE-U0172
VAT Collected = VAT Liability × Collection / Compliance Rate

### FINANCE-U0173
6.2 Personal Income Tax

### FINANCE-U0174
Low Income Bracket: threshold, marginal rate, taxable income, liability, collected revenue

### FINANCE-U0175
Middle Income Bracket: threshold, marginal rate, taxable income, liability, collected revenue

### FINANCE-U0176
High Income Bracket: threshold, marginal rate, taxable income, liability, collected revenue

### FINANCE-U0177
Top Income Bracket: threshold, marginal rate, taxable income, liability, collected revenue

### FINANCE-U0178
Basic Allowance / Personal Allowance

### FINANCE-U0179
Taxable Labour Income

### FINANCE-U0180
Taxable Non-labour Personal Income if enabled

### FINANCE-U0181
PIT Compliance Rate

### FINANCE-U0182
PIT Arrears

### FINANCE-U0183
PIT Revenue Gap

### FINANCE-U0184
6.3 Corporate Income Tax

### FINANCE-U0185
Standard Corporate Tax Rate

### FINANCE-U0186
SME Corporate Tax Rate

### FINANCE-U0187
Investment Allowance

### FINANCE-U0188
Eligible Deduction Base

### FINANCE-U0189
Taxable Corporate Profit

### FINANCE-U0190
Loss Offset / Carryforward if enabled

### FINANCE-U0191
Corporate Tax Liability

### FINANCE-U0192
Corporate Tax Collected

### FINANCE-U0193
Corporate Tax Arrears

### FINANCE-U0194
Corporate Tax Gap

### FINANCE-U0195
Effective Corporate Tax Rate

### FINANCE-U0196
6.4 Payroll Tax

### FINANCE-U0197
Employer Payroll Tax Rate

### FINANCE-U0198
Employee Payroll Tax Rate

### FINANCE-U0199
Formal Payroll Base

### FINANCE-U0200
Exempt Payroll

### FINANCE-U0201
Employer Payroll Tax Liability

### FINANCE-U0202
Employee Payroll Tax Liability

### FINANCE-U0203
Collected Payroll Tax

### FINANCE-U0204
Payroll Tax Arrears

### FINANCE-U0205
Payroll Tax Liability = Taxable Payroll × Applicable Payroll Tax Rate

### FINANCE-U0206
6.5 Tax Administration Readouts

### FINANCE-U0207
Estimated Tax Liability

### FINANCE-U0208
Declared Liability

### FINANCE-U0209
Collected Revenue

### FINANCE-U0210
Outstanding Arrears

### FINANCE-U0211
Collection Rate

### FINANCE-U0212
Tax Gap Amount

### FINANCE-U0213
Tax Gap Rate

### FINANCE-U0214
Refunds Payable

### FINANCE-U0215
Enforcement / Administration Cost where modelled

### FINANCE-U0216
7. Tax Expenditure 税式支出与税收激励

### FINANCE-U0217
Tax Expenditure 不是直接 Treasury 付款，而是通过降低未来应纳税额形成财政成本。所有税收优惠必须记录 Eligible Base、Rate / Credit Amount、Start Date、End Date、Maximum Fiscal Cost、Actual Revenue Foregone。

### FINANCE-U0218
工具 | 计税/资格基础

### FINANCE-U0219
Investment Tax Credit | 企业合格资本投资

### FINANCE-U0220
R&D Tax Credit | 合格研发支出

### FINANCE-U0221
Green Investment Credit | 合格绿色资本支出

### FINANCE-U0222
Employment Credit | 符合条件的新增就业工资/雇佣

### FINANCE-U0223
Youth Employment Credit | 符合年龄条件的新增就业

### FINANCE-U0224
Low-income Employment Credit | 符合收入条件的雇佣

### FINANCE-U0225
High-skill Recruitment Credit | 符合技能条件的高技能招聘

### FINANCE-U0226
Strategic Industry Tax Credit | 由 Industry 提出且经 Finance 批准的战略产业投资/经营税收减免

### FINANCE-U0227
Export-related Tax Credit | 由 Trade 参与设计、Finance 批准并满足国际贸易规则约束的出口相关税收激励

### FINANCE-U0228
7.1 Finance 对 Tax Expenditure 的操作

### FINANCE-U0229
Create Programme

### FINANCE-U0230
Set Eligibility

### FINANCE-U0231
Set Credit / Deduction Rate

### FINANCE-U0232
Set Programme Cap

### FINANCE-U0233
Set Per-recipient Cap if applicable

### FINANCE-U0234
Set Start / End Date

### FINANCE-U0235
Pause New Eligibility

### FINANCE-U0236
Resume Programme

### FINANCE-U0237
Terminate Programme for new claims

### FINANCE-U0238
Allow Existing Claims to Run Off

### FINANCE-U0239
Review Actual Revenue Foregone

### FINANCE-U0240
8. National Budget 国家预算架构

### FINANCE-U0241
8.1 预算层级

### FINANCE-U0242
预算层级 | 完整范围

### FINANCE-U0243
Mandatory / Baseline Spending | 债务本息、已承诺养老金、既有福利权利、公共工资、有效合同、既有项目付款义务。

### FINANCE-U0244
Departmental Operating Budget | 各 Office 日常政策执行、行政和经常性项目预算。

### FINANCE-U0245
Capital Budget | 形成长期公共资产的资本性支出。

### FINANCE-U0246
Central Treasury Funds | Emergency Reserve、Debt Service Reserve、Strategic Co-financing Fund、Contingency Fund。

### FINANCE-U0247
8.2 Departmental Budget Envelopes

### FINANCE-U0248
Captain / Central Government Administration Envelope

### FINANCE-U0249
Trade & Foreign Affairs Envelope

### FINANCE-U0250
Industry, Technology & Resources Envelope

### FINANCE-U0251
Labour & Social Development Envelope

### FINANCE-U0252
Cross-government Public Administration Envelope

### FINANCE-U0253
Other nationally defined departmental envelopes retained by scenario configuration

### FINANCE-U0254
Central Bank monetary-policy balance sheet operations不纳入普通财政部门预算；若模拟需要央行行政经费，可单独作为固定政府行政支出，不赋予 Finance 对货币政策的控制权。

### FINANCE-U0255
8.3 Budget Amount States

### FINANCE-U0256
Requested

### FINANCE-U0257
Approved / Appropriated

### FINANCE-U0258
Reserved

### FINANCE-U0259
Committed

### FINANCE-U0260
Paid / Spent

### FINANCE-U0261
Remaining Uncommitted

### FINANCE-U0262
Remaining Unpaid Commitment

### FINANCE-U0263
Cancelled

### FINANCE-U0264
Reallocated

### FINANCE-U0265
Remaining Appropriation = Approved Appropriation - Paid - Outstanding Commitments - Reserved Amount

### FINANCE-U0266
9. Department Funding 部门资金请求

### FINANCE-U0267
9.1 Funding Request 必填字段

### FINANCE-U0268
Request ID

### FINANCE-U0269
Requesting Office

### FINANCE-U0270
Programme / Project ID

### FINANCE-U0271
Title

### FINANCE-U0272
Policy / Project Owner

### FINANCE-U0273
Total Programme Cost

### FINANCE-U0274
Treasury Funding Requested

### FINANCE-U0275
Existing Approved Funding

### FINANCE-U0276
Private Funding

### FINANCE-U0277
SOE Funding

### FINANCE-U0278
Domestic Bank Funding

### FINANCE-U0279
Foreign Funding

### FINANCE-U0280
Foreign Currency Requirement

### FINANCE-U0281
Payment Schedule

### FINANCE-U0282
Expected Operating Cost

### FINANCE-U0283
Expected Future Public Revenue if any

### FINANCE-U0284
Guarantee Requirement

### FINANCE-U0285
Government Equity Requirement

### FINANCE-U0286
Strategic Priority Link

### FINANCE-U0287
Mandatory / Discretionary Classification

### FINANCE-U0288
Requested Start Date

### FINANCE-U0289
Funding Deadline

### FINANCE-U0290
Alternative Financing Plan

### FINANCE-U0291
Required Cross-office Approvals

### FINANCE-U0292
Attached fiscal notes / projections

### FINANCE-U0293
9.2 Finance Funding Decision 全部动作

### FINANCE-U0294
Finance 动作 | 系统效果

### FINANCE-U0295
Approve Full Budget Funding | 批准请求的全部 Treasury 资金。

### FINANCE-U0296
Approve Partial Funding | 仅批准部分 Treasury 资金，未融资部分保留为 Funding Gap。

### FINANCE-U0297
Approve Matching Funding | 只有在非财政资金达到规定金额或比例时释放 Treasury 资金。

### FINANCE-U0298
Approve Debt-financed Funding | 批准并关联特定主权债务发行或债务池。

### FINANCE-U0299
Approve Government Guarantee | 不给或少给现金，允许符合条件的融资获得政府担保。

### FINANCE-U0300
Approve Government Equity | 政府以股权方式投入公共/混合项目或 SOE。

### FINANCE-U0301
Approve SOE Financing Route | 允许由指定 SOE 负债/现金承担融资，并记录政府隐性风险。

### FINANCE-U0302
Defer Decision | 不批准也不拒绝，要求等待指定财政条件或日期。

### FINANCE-U0303
Request Cost Reduction | 退回并要求降低总成本或 Treasury 份额。

### FINANCE-U0304
Request Financing Restructure | 退回并要求改变债务、股权、私人、外资、担保构成。

### FINANCE-U0305
Request Scope Reduction | 要求 Project Owner 减少项目规模。

### FINANCE-U0306
Reject Fiscal Participation | 拒绝任何新的政府财政承诺；项目可继续寻找非政府资金。

### FINANCE-U0307
10. 预算执行、承诺与付款计划

### FINANCE-U0308
10.1 预算执行状态

### FINANCE-U0309
Draft

### FINANCE-U0310
Requested

### FINANCE-U0311
Under Finance Review

### FINANCE-U0312
Approved

### FINANCE-U0313
Partially Approved

### FINANCE-U0314
Conditionally Approved

### FINANCE-U0315
Reserved

### FINANCE-U0316
Committed

### FINANCE-U0317
Payment Scheduled

### FINANCE-U0318
Partially Paid

### FINANCE-U0319
Fully Paid

### FINANCE-U0320
Deferred

### FINANCE-U0321
Frozen

### FINANCE-U0322
Cancelled

### FINANCE-U0323
Expired

### FINANCE-U0324
Over Budget

### FINANCE-U0325
Payment Default / Arrears

### FINANCE-U0326
10.2 Commitment

### FINANCE-U0327
任何已经签署采购合同、贷款协议、担保协议、项目里程碑或法定福利义务的未来付款都必须创建 Fiscal Commitment。Fiscal Commitment 不等于现金已经支付，但必须占用未来财政能力。

### FINANCE-U0328
Commitment ID

### FINANCE-U0329
Source Programme / Project

### FINANCE-U0330
Creditor / Beneficiary

### FINANCE-U0331
Currency

### FINANCE-U0332
Total Committed Amount

### FINANCE-U0333
Paid Amount

### FINANCE-U0334
Outstanding Amount

### FINANCE-U0335
Payment Dates

### FINANCE-U0336
Priority Class

### FINANCE-U0337
Can Delay?

### FINANCE-U0338
Delay Penalty

### FINANCE-U0339
Funding Source

### FINANCE-U0340
Budget Line

### FINANCE-U0341
Foreign Exchange Need

### FINANCE-U0342
Legal / Contract Status

### FINANCE-U0343
10.3 Payment Schedule

### FINANCE-U0344
每个长期项目或 programme 必须拆解到一个或多个 Payment Milestones；Finance 可以批准、调整允许调整的付款时间、划分资金来源，但不得擅自修改 Project Owner 的技术里程碑。

### FINANCE-U0345
11. Public Debt 主权债务发行

### FINANCE-U0346
旧版 Debt Issuance 百分比滑块取消。每一笔主权融资均创建具体 Debt Instrument / Auction。

### FINANCE-U0347
11.1 可发行的债务工具

### FINANCE-U0348
Treasury Bill

### FINANCE-U0349
Short-term Government Note

### FINANCE-U0350
Medium-term Government Bond

### FINANCE-U0351
Long-term Government Bond

### FINANCE-U0352
Inflation-linked Government Bond

### FINANCE-U0353
Foreign Currency Sovereign Bond

### FINANCE-U0354
Green / Project-linked Sovereign Bond

### FINANCE-U0355
Emergency Sovereign Bond

### FINANCE-U0356
11.2 每一笔发行的全部字段

### FINANCE-U0357
Debt ID

### FINANCE-U0358
Instrument Type

### FINANCE-U0359
Currency

### FINANCE-U0360
Face Value Offered

### FINANCE-U0361
Coupon Rate / Discount Rate

### FINANCE-U0362
Issue Price / Minimum Acceptable Price

### FINANCE-U0363
Auction Date

### FINANCE-U0364
Settlement Date

### FINANCE-U0365
Maturity Date

### FINANCE-U0366
Payment Frequency

### FINANCE-U0367
Principal Repayment Structure

### FINANCE-U0368
Domestic / Foreign Classification

### FINANCE-U0369
Eligible Investor Categories

### FINANCE-U0370
Use-of-Proceeds Tag if restricted

### FINANCE-U0371
Underwriting / Auction Method if modelled

### FINANCE-U0372
Bids Received

### FINANCE-U0373
Amount Subscribed

### FINANCE-U0374
Amount Allocated

### FINANCE-U0375
Cash Proceeds

### FINANCE-U0376
Effective Yield

### FINANCE-U0377
Fees / Issuance Cost

### FINANCE-U0378
Outstanding Principal

### FINANCE-U0379
Cash Proceeds = Allocated Face Value × Issue Price +/− Accrued / Fees as configured

### FINANCE-U0380
11.3 市场认购机制必须使用的财政/宏观输入

### FINANCE-U0381
Policy Rate

### FINANCE-U0382
Expected Inflation

### FINANCE-U0383
Existing Sovereign Yield Curve

### FINANCE-U0384
Debt-to-GDP

### FINANCE-U0385
Fiscal Balance

### FINANCE-U0386
Primary Balance

### FINANCE-U0387
Debt Maturity Concentration

### FINANCE-U0388
Government / Policy Credibility

### FINANCE-U0389
Default / Restructuring History

### FINANCE-U0390
Currency Risk for foreign holders

### FINANCE-U0391
Foreign Reserve / FX Conditions for foreign-currency obligations

### FINANCE-U0392
Banking-sector sovereign exposure

### FINANCE-U0393
Market Liquidity

### FINANCE-U0394
Finance 可以设置发行规模、期限和票息/最低可接受条件，但不能直接指定最终市场需求或强制全额认购。未认购金额不会进入 Treasury。

### FINANCE-U0395
12. Debt Management 债务组合与到期管理

### FINANCE-U0396
12.1 Debt Portfolio 必须显示

### FINANCE-U0397
Total Gross Debt

### FINANCE-U0398
Domestic-currency Debt

### FINANCE-U0399
Foreign-currency Debt

### FINANCE-U0400
Short-term Debt

### FINANCE-U0401
Medium-term Debt

### FINANCE-U0402
Long-term Debt

### FINANCE-U0403
Fixed-rate Debt

### FINANCE-U0404
Floating-rate Debt if enabled

### FINANCE-U0405
Inflation-linked Debt

### FINANCE-U0406
Debt Held by Domestic Banks

### FINANCE-U0407
Debt Held by Other Domestic Investors

### FINANCE-U0408
Debt Held by Foreign Investors

### FINANCE-U0409
Debt Held by Central Bank in secondary market

### FINANCE-U0410
Weighted Average Coupon

### FINANCE-U0411
Weighted Average Effective Yield

### FINANCE-U0412
Weighted Average Maturity

### FINANCE-U0413
Interest Due

### FINANCE-U0414
Principal Due

### FINANCE-U0415
Debt Service by horizon

### FINANCE-U0416
Foreign-currency Debt Share

### FINANCE-U0417
Refinancing Requirement

### FINANCE-U0418
12.2 Maturity Ladder 时间桶

### FINANCE-U0419
Due within 1 day

### FINANCE-U0420
Due within 7 days

### FINANCE-U0421
Due within 14 days

### FINANCE-U0422
Due within 30 days

### FINANCE-U0423
Due within 60 days / remaining season

### FINANCE-U0424
Due beyond current season horizon

### FINANCE-U0425
12.3 Finance 可执行的债务管理动作

### FINANCE-U0426
Issue New Debt

### FINANCE-U0427
Refinance Maturing Debt

### FINANCE-U0428
Repay at Maturity

### FINANCE-U0429
Early Debt Buyback

### FINANCE-U0430
Debt Exchange Offer

### FINANCE-U0431
Extend Maturity through consensual exchange

### FINANCE-U0432
Change Currency Composition through new issuance / repayment

### FINANCE-U0433
Build Debt Service Cash Buffer

### FINANCE-U0434
Pre-fund Future Maturities

### FINANCE-U0435
Launch Formal Debt Restructuring Proposal when ordinary servicing is unsustainable

### FINANCE-U0436
13. Project Financing 项目融资权

### FINANCE-U0437
核心边界  Finance 不选择具体要建设的产业、能源、资源、社会或贸易项目。具体项目由对应 Office 作为 Project Owner 发起。Finance 决定政府资金是否参与、参与多少、采用什么融资结构、何时支付、承担什么未来风险。

### FINANCE-U0438
13.1 Project Owner 分类

### FINANCE-U0439
Project Owner | 完整项目归属

### FINANCE-U0440
Industry, Technology & Resources | 产业产能、矿产/资源、能源设施、发电、电网、港口、铁路、数字基础设施、工业园/SEZ、技术/R&D基础设施及该 Office 定义的生产性项目。

### FINANCE-U0441
Labour & Social Development | 住房、劳动力培训网络、社会服务能力、劳动力与人力资本相关公共项目。

### FINANCE-U0442
Trade & Foreign Affairs | 海关与贸易便利化、政府主导国际物流/贸易支持、国际经济合作设施以及由该 Office 负责的外部经济项目。

### FINANCE-U0443
Captain / Head of Government | 仅限明确属于国家战略治理、跨部门且没有单一政策 Owner 的国家级战略 programme；Captain 不替代具体技术 Owner。

### FINANCE-U0444
13.2 Project Financing 页面必须显示字段

### FINANCE-U0445
Project ID

### FINANCE-U0446
Project Owner

### FINANCE-U0447
Total Capex

### FINANCE-U0448
Approved Scope

### FINANCE-U0449
Construction / Implementation Period

### FINANCE-U0450
Treasury Funding Requested

### FINANCE-U0451
Treasury Funding Approved

### FINANCE-U0452
Domestic Sovereign Debt Funding

### FINANCE-U0453
Foreign Sovereign Debt Funding

### FINANCE-U0454
SOE Funding

### FINANCE-U0455
Domestic Bank Funding

### FINANCE-U0456
Private Equity / Private Capital

### FINANCE-U0457
Foreign Investor Funding

### FINANCE-U0458
Foreign Loan Funding

### FINANCE-U0459
Government Guarantee

### FINANCE-U0460
Government Equity

### FINANCE-U0461
FX Requirement

### FINANCE-U0462
Import Requirement Link

### FINANCE-U0463
Technology Licence Cost Link

### FINANCE-U0464
Operating Cost after completion

### FINANCE-U0465
Expected Government Revenue

### FINANCE-U0466
Expected SOE Dividend

### FINANCE-U0467
Payment Milestones

### FINANCE-U0468
Funding Gap

### FINANCE-U0469
Unfunded Future Commitments

### FINANCE-U0470
Financing Status

### FINANCE-U0471
13.3 Finance 可构造的融资来源

### FINANCE-U0472
Direct Treasury Budget

### FINANCE-U0473
Dedicated Sovereign Bond

### FINANCE-U0474
General Sovereign Debt Pool

### FINANCE-U0475
Government Equity Contribution

### FINANCE-U0476
SOE Equity / Retained Earnings

### FINANCE-U0477
SOE Borrowing

### FINANCE-U0478
Domestic Commercial Bank Loan

### FINANCE-U0479
Foreign Commercial / Sovereign Loan

### FINANCE-U0480
Foreign Direct Investment / Equity

### FINANCE-U0481
PPP / Concession Capital

### FINANCE-U0482
Government Guarantee-supported Borrowing

### FINANCE-U0483
International Infrastructure Finance

### FINANCE-U0484
Project-linked Tax Expenditure if approved

### FINANCE-U0485
Total Financing Sources = Project Funding Requirement before project can proceed at approved scale

### FINANCE-U0486
13.4 Funding Gap 处理动作

### FINANCE-U0487
Reduce Project Scale

### FINANCE-U0488
Phase Project Construction

### FINANCE-U0489
Delay Start Date

### FINANCE-U0490
Delay Later Phase

### FINANCE-U0491
Seek Additional Private Funding

### FINANCE-U0492
Seek Additional Foreign Funding

### FINANCE-U0493
Request Higher Treasury Contribution

### FINANCE-U0494
Request Government Guarantee

### FINANCE-U0495
Request SOE Financing

### FINANCE-U0496
Issue Dedicated Debt

### FINANCE-U0497
Cancel Project before irreversible commitment

### FINANCE-U0498
14. Joint Project Committee 跨 Office 项目委员会

### FINANCE-U0499
所有达到“重大项目”阈值或具有跨 Office 依赖的项目，系统自动创建 Joint Project Committee。项目不要求六个 Office 一律审批；系统根据项目属性生成 Required Offices。

### FINANCE-U0500
14.1 必须参加的规则

### FINANCE-U0501
Office | 自动加入条件

### FINANCE-U0502
Project Owner | 所有项目必须存在且必须参加。

### FINANCE-U0503
Finance | 任何 Treasury Funding、Sovereign Debt、Government Guarantee、Government Equity、SOE Fiscal Exposure、Future Fiscal Commitment 均必须参加。

### FINANCE-U0504
Trade | 项目存在进口关键投入、外国技术许可、外国投资、外国贷款、国际承购/供应合同时必须参加。

### FINANCE-U0505
Social | 项目存在重大劳动力需求、培训需求、住房压力、人口迁移/安置、显著就业分配影响时必须参加。

### FINANCE-U0506
Central Bank | 项目存在重大官方外汇使用、定向再融资工具、银行体系集中风险、系统性信贷风险、金融稳定影响时必须参加。

### FINANCE-U0507
Captain | 项目达到国家战略级、重大财政规模、重大安全/主权影响、跨多个 Office 的国家级方案阈值时必须最终批准。

### FINANCE-U0508
14.2 Committee 操作状态

### FINANCE-U0509
Draft

### FINANCE-U0510
Owner Submitted

### FINANCE-U0511
Finance Review

### FINANCE-U0512
Partner Review

### FINANCE-U0513
Revision Requested

### FINANCE-U0514
Funding Structured

### FINANCE-U0515
Approvals Pending

### FINANCE-U0516
Captain Approval Pending if required

### FINANCE-U0517
Approved

### FINANCE-U0518
Rejected

### FINANCE-U0519
On Hold

### FINANCE-U0520
Funding Incomplete

### FINANCE-U0521
Ready to Start

### FINANCE-U0522
Active

### FINANCE-U0523
Suspended

### FINANCE-U0524
Completed

### FINANCE-U0525
Cancelled

### FINANCE-U0526
14.3 Finance 在 Committee 中可以做的全部动作

### FINANCE-U0527
Approve Fiscal Envelope

### FINANCE-U0528
Approve Partial Fiscal Envelope

### FINANCE-U0529
Set Treasury Contribution

### FINANCE-U0530
Set Debt Contribution

### FINANCE-U0531
Set Guarantee Contribution

### FINANCE-U0532
Set Government Equity Contribution

### FINANCE-U0533
Set Maximum Fiscal Exposure

### FINANCE-U0534
Set Payment Schedule

### FINANCE-U0535
Set Funding Conditions

### FINANCE-U0536
Set Matching Funding Conditions

### FINANCE-U0537
Request Cost Reduction

### FINANCE-U0538
Request Scope Reduction through Project Owner

### FINANCE-U0539
Request Financing Restructure

### FINANCE-U0540
Request Foreign Funding Plan

### FINANCE-U0541
Request SOE Funding Plan

### FINANCE-U0542
Return for Revision

### FINANCE-U0543
Approve Finance Portion

### FINANCE-U0544
Reject Fiscal Participation

### FINANCE-U0545
Escalate Fiscal Risk to Captain

### FINANCE-U0546
Freeze New Fiscal Commitments after approval if formal emergency rules allow, without cancelling already protected legal obligations

### FINANCE-U0547
15. Government Guarantees 政府担保

### FINANCE-U0548
旧版 Loan Guarantee 占 GDP 百分比滑块取消。所有担保均以单笔 Guarantee Contract 和组合风险管理。

### FINANCE-U0549
15.1 每笔 Guarantee 全部字段

### FINANCE-U0550
Guarantee ID

### FINANCE-U0551
Beneficiary

### FINANCE-U0552
Underlying Project / Loan

### FINANCE-U0553
Lender / Creditor

### FINANCE-U0554
Loan Currency

### FINANCE-U0555
Underlying Principal

### FINANCE-U0556
Guarantee Percentage

### FINANCE-U0557
Guaranteed Principal

### FINANCE-U0558
Maximum Government Exposure

### FINANCE-U0559
Guarantee Fee

### FINANCE-U0560
Issue Date

### FINANCE-U0561
Start Date

### FINANCE-U0562
Expiry / Maturity

### FINANCE-U0563
Trigger Conditions

### FINANCE-U0564
Recovery Rights

### FINANCE-U0565
Collateral / Security if any

### FINANCE-U0566
Current Outstanding Guaranteed Amount

### FINANCE-U0567
Amount Already Called

### FINANCE-U0568
Amount Recovered

### FINANCE-U0569
Probability of Default / Risk Estimate

### FINANCE-U0570
Fiscal Provision if modelled

### FINANCE-U0571
Status

### FINANCE-U0572
15.2 Guarantee 状态

### FINANCE-U0573
Draft

### FINANCE-U0574
Requested

### FINANCE-U0575
Under Review

### FINANCE-U0576
Approved

### FINANCE-U0577
Active

### FINANCE-U0578
Partially Utilised

### FINANCE-U0579
Expired

### FINANCE-U0580
Cancelled

### FINANCE-U0581
Trigger Pending

### FINANCE-U0582
Called

### FINANCE-U0583
Paid

### FINANCE-U0584
Recovery in Progress

### FINANCE-U0585
Recovered

### FINANCE-U0586
Loss Realised

### FINANCE-U0587
15.3 Finance 对担保的全部操作

### FINANCE-U0588
Approve

### FINANCE-U0589
Approve Partial Guarantee

### FINANCE-U0590
Change Guarantee Percentage before activation

### FINANCE-U0591
Set Guarantee Fee

### FINANCE-U0592
Set Exposure Cap

### FINANCE-U0593
Set Eligibility Conditions

### FINANCE-U0594
Reject

### FINANCE-U0595
Suspend New Drawdowns if contract permits

### FINANCE-U0596
Terminate Unused Guarantee if contract permits

### FINANCE-U0597
Recognise Guarantee Call

### FINANCE-U0598
Pay Guarantee Call

### FINANCE-U0599
Initiate Recovery

### FINANCE-U0600
Record Recovery

### FINANCE-U0601
Close Guarantee

### FINANCE-U0602
16. SOE 财政关系

### FINANCE-U0603
Industry 负责 SOE 的产业/生产战略，Finance 负责政府作为所有者、出资人和担保人的财政关系。Finance 不直接设置 SOE 产量或技术路线。

### FINANCE-U0604
16.1 Finance 必须维护的 SOE 财政字段

### FINANCE-U0605
SOE ID

### FINANCE-U0606
Government Ownership %

### FINANCE-U0607
Government Book Value

### FINANCE-U0608
Market / Estimated Equity Value if available

### FINANCE-U0609
SOE Cash Dividend Declared

### FINANCE-U0610
Dividend Received

### FINANCE-U0611
Government Equity Injection

### FINANCE-U0612
Government Loan

### FINANCE-U0613
Government Guarantee

### FINANCE-U0614
SOE Debt Outstanding

### FINANCE-U0615
SOE Debt Guaranteed by Government

### FINANCE-U0616
SOE Arrears to Government

### FINANCE-U0617
SOE Receivables from Government

### FINANCE-U0618
SOE Fiscal Transfer

### FINANCE-U0619
Expected Fiscal Support Need

### FINANCE-U0620
Maximum Government Exposure

### FINANCE-U0621
16.2 Finance 可执行的 SOE 财政动作

### FINANCE-U0622
Equity Injection

### FINANCE-U0623
Receive Dividend

### FINANCE-U0624
Set Dividend Expectation / Policy within governance rules

### FINANCE-U0625
Waive / Reduce Dividend when jointly justified

### FINANCE-U0626
Acquire Additional Equity

### FINANCE-U0627
Sell Government Equity

### FINANCE-U0628
Guarantee SOE Debt

### FINANCE-U0629
Provide Government Loan

### FINANCE-U0630
Recapitalise SOE

### FINANCE-U0631
Recognise SOE Fiscal Loss

### FINANCE-U0632
Request Financial Restructuring jointly with Industry

### FINANCE-U0633
Trigger Strategic Asset Review when solvency or control is affected

### FINANCE-U0634
17. Fiscal Assets & Privatisation 财政资产与私有化

### FINANCE-U0635
17.1 财政资产分类

### FINANCE-U0636
Government Equity in SOEs

### FINANCE-U0637
Non-strategic Government Equity Stakes

### FINANCE-U0638
Government Land Available for Sale / Lease

### FINANCE-U0639
Infrastructure Concession Rights

### FINANCE-U0640
Government Financial Assets

### FINANCE-U0641
Loans Receivable

### FINANCE-U0642
Other Scenario-defined Saleable Public Assets

### FINANCE-U0643
17.2 每笔资产处置必须记录

### FINANCE-U0644
Asset ID

### FINANCE-U0645
Asset Type

### FINANCE-U0646
Responsible Policy Office

### FINANCE-U0647
Government Ownership / Rights before Sale

### FINANCE-U0648
Share / Rights Offered

### FINANCE-U0649
Valuation

### FINANCE-U0650
Minimum Sale Price

### FINANCE-U0651
Buyer / Investor

### FINANCE-U0652
Sale Currency

### FINANCE-U0653
Gross Proceeds

### FINANCE-U0654
Transaction Cost

### FINANCE-U0655
Net Cash Proceeds

### FINANCE-U0656
Government Ownership / Rights after Sale

### FINANCE-U0657
Future Dividend / Revenue Foregone

### FINANCE-U0658
Strategic Classification

### FINANCE-U0659
Required Approvals

### FINANCE-U0660
Settlement Date

### FINANCE-U0661
Status

### FINANCE-U0662
17.3 Finance 可执行动作

### FINANCE-U0663
Initiate Non-strategic Asset Sale

### FINANCE-U0664
Propose Strategic Asset Sale

### FINANCE-U0665
Set Sale Amount / Share

### FINANCE-U0666
Set Minimum Price

### FINANCE-U0667
Accept Bid

### FINANCE-U0668
Reject Bid

### FINANCE-U0669
Cancel Sale before binding settlement

### FINANCE-U0670
Receive Proceeds

### FINANCE-U0671
Record Transaction Costs

### FINANCE-U0672
Update Government Ownership

### FINANCE-U0673
Acquire Fiscal Asset if approved

### FINANCE-U0674
Lease / Concession Fiscal Rights where enabled

### FINANCE-U0675
战略资产出售必须由相关政策 Office + Finance + Captain 共同批准；涉及外资或国际买方时 Trade 加入；涉及金融稳定时 Central Bank 加入。

### FINANCE-U0676
18. Fiscal Outlook 财政预测

### FINANCE-U0677
18.1 系统自动计算的核心财政量

### FINANCE-U0678
Tax Revenue

### FINANCE-U0679
Non-tax Revenue

### FINANCE-U0680
Total Government Revenue

### FINANCE-U0681
Primary Expenditure

### FINANCE-U0682
Interest Expenditure

### FINANCE-U0683
Total Expenditure

### FINANCE-U0684
Primary Balance

### FINANCE-U0685
Overall Fiscal Balance

### FINANCE-U0686
Fiscal Deficit / Surplus

### FINANCE-U0687
Debt Stock

### FINANCE-U0688
Debt-to-GDP

### FINANCE-U0689
Interest-to-Revenue Ratio

### FINANCE-U0690
Debt Service

### FINANCE-U0691
Treasury Cash

### FINANCE-U0692
Free Cash

### FINANCE-U0693
Future Commitments

### FINANCE-U0694
Guarantee Exposure

### FINANCE-U0695
SOE Fiscal Exposure

### FINANCE-U0696
Foreign-currency Fiscal Exposure

### FINANCE-U0697
Primary Balance = Total Revenue - Non-interest Expenditure

### FINANCE-U0698
Overall Balance = Total Revenue - Total Expenditure

### FINANCE-U0699
Fiscal Deficit Ratio = max(0, -Overall Balance) / GDP

### FINANCE-U0700
18.2 预测情景

### FINANCE-U0701
Baseline Forecast: 使用当前外生路径和既定正常假设。

### FINANCE-U0702
Current Policy Forecast: 使用已经发布和已承诺政策/项目。

### FINANCE-U0703
Stress Scenario: 对增长、利率、汇率、税收、项目成本、担保违约等指定冲击进行压力测试。

### FINANCE-U0704
18.3 预测时间

### FINANCE-U0705
Next 7 days

### FINANCE-U0706
Next 14 days

### FINANCE-U0707
Next 30 days

### FINANCE-U0708
Next 60 days / remaining season

### FINANCE-U0709
End-of-season projected position

### FINANCE-U0710
19. Fiscal Rules & Targets 财政规则

### FINANCE-U0711
财政规则是 Finance 设置和维护的政策承诺，不是底层物理约束。突破规则必须通过 Fiscal Exception 流程并承担信誉、融资成本和政治影响。

### FINANCE-U0712
Fiscal Deficit Ceiling

### FINANCE-U0713
Debt-to-GDP Ceiling

### FINANCE-U0714
Minimum Treasury Cash Buffer

### FINANCE-U0715
Minimum Debt Service Reserve

### FINANCE-U0716
Emergency Reserve Target

### FINANCE-U0717
Maximum Short-term Debt Share

### FINANCE-U0718
Maximum Foreign-currency Debt Share

### FINANCE-U0719
Maximum Annual / Season Guarantee Exposure

### FINANCE-U0720
Maximum SOE Fiscal Exposure where enabled

### FINANCE-U0721
Capital Spending Floor / Target if adopted

### FINANCE-U0722
Primary Balance Target

### FINANCE-U0723
19.1 Fiscal Exception

### FINANCE-U0724
Select Rule to Override

### FINANCE-U0725
Set Override Amount / Temporary Limit

### FINANCE-U0726
Set Start Date

### FINANCE-U0727
Set Expiry Date

### FINANCE-U0728
Provide Fiscal Rationale

### FINANCE-U0729
Identify Funding / Risk Impact

### FINANCE-U0730
Submit to Captain when rule is nationally adopted or strategic

### FINANCE-U0731
Publish Exception

### FINANCE-U0732
Track Compliance after expiry

### FINANCE-U0733
20. Fiscal Risk & Contingent Liabilities 财政风险

### FINANCE-U0734
20.1 财政风险必须量化为金额、期限或比率

### FINANCE-U0735
Near-term Cash Shortfall

### FINANCE-U0736
Debt Refinancing Requirement

### FINANCE-U0737
Interest Rate Exposure

### FINANCE-U0738
Foreign Exchange Exposure

### FINANCE-U0739
Guarantee Maximum Exposure

### FINANCE-U0740
Expected Guarantee Loss

### FINANCE-U0741
SOE Support Exposure

### FINANCE-U0742
PPP / Concession Payment Obligation if enabled

### FINANCE-U0743
Project Cost Overrun Exposure

### FINANCE-U0744
Tax Revenue Shortfall

### FINANCE-U0745
Arrears

### FINANCE-U0746
Unfunded Mandatory Spending

### FINANCE-U0747
Bank Recapitalisation Exposure

### FINANCE-U0748
Sovereign Loan Repayment Exposure

### FINANCE-U0749
Commodity / Emergency Fiscal Support Exposure

### FINANCE-U0750
20.2 Fiscal Warning 类型

### FINANCE-U0751
Cash Warning

### FINANCE-U0752
Debt Maturity Warning

### FINANCE-U0753
Debt Auction Warning

### FINANCE-U0754
Foreign Currency Debt Warning

### FINANCE-U0755
Guarantee Warning

### FINANCE-U0756
SOE Warning

### FINANCE-U0757
Project Payment Warning

### FINANCE-U0758
Revenue Shortfall Warning

### FINANCE-U0759
Mandatory Spending Warning

### FINANCE-U0760
Arrears Warning

### FINANCE-U0761
Fiscal Rule Breach Warning

### FINANCE-U0762
Bank Rescue Exposure Warning

### FINANCE-U0763
Warning 的触发条件来自真实数据阈值或模型条件；Warning 标签仅用于 UI，不作为独立数值参与经济计算。

### FINANCE-U0764
21. Emergency Fiscal Tools 紧急财政工具

### FINANCE-U0765
工具 | 完整含义

### FINANCE-U0766
Emergency Budget Reallocation | 在允许的预算科目之间快速重分配尚未承诺资金。

### FINANCE-U0767
Expenditure Freeze | 冻结尚未形成法律/合同义务的非必要可选支出。

### FINANCE-U0768
Draw Emergency Reserve | 调用 Treasury Emergency Reserve。

### FINANCE-U0769
Emergency Bond Issue | 以具体金额、期限、币种和市场条件发行紧急债务。

### FINANCE-U0770
Payment Rescheduling | 对允许延期的付款重新排期并记录延期代价。

### FINANCE-U0771
Sovereign Loan Request | 向 Trade 发起国际主权融资谈判请求。

### FINANCE-U0772
Guarantee Expansion | 在紧急政策框架下增加特定贷款/行业担保，并记录最大财政暴露。

### FINANCE-U0773
Temporary Tax Surcharge | 对已有税基临时提高法定税率或附加税。

### FINANCE-U0774
Temporary Tax Relief | 对已有税基临时减税、延期或抵免。

### FINANCE-U0775
Debt Restructuring Proposal | 正式进入 Finance + Central Bank + Captain 的债务重组流程。

### FINANCE-U0776
Monetary Financing Request | 请求 Central Bank 在极端情况下提供直接货币融资；必须联合审批。

### FINANCE-U0777
Emergency Capital Contribution | 对关键公共机构/项目进行紧急政府注资，按对应 Owner 和审批规则处理。

### FINANCE-U0778
21.1 紧急工具不可绕过的约束

### FINANCE-U0779
不能创造未记账 Treasury Cash。

### FINANCE-U0780
不能自动取消主权债务或合同义务。

### FINANCE-U0781
不能绕过 Central Bank 的货币政策独立权限。

### FINANCE-U0782
不能绕过战略项目的跨 Office 审批。

### FINANCE-U0783
不能把未支付义务从数据库删除；延期必须形成 Arrears / Rescheduled Liability。

### FINANCE-U0784
不能把 Government Guarantee 当作零成本工具；必须进入 Contingent Liability。

### FINANCE-U0785
22. 与其余五个 Office 的完整交互边界

### FINANCE-U0786
22.1 Country Captain / Head of Government

### FINANCE-U0787
Captain 设置 National Strategy、National Priority 和 Cabinet Agenda；Finance 不得修改。

### FINANCE-U0788
Finance 向 Captain 提供 Fiscal Outlook、Fiscal Warning、重大预算约束和重大融资风险。

### FINANCE-U0789
达到战略阈值的预算、国家级项目、战略资产出售、债务重组、货币融资和重大紧急财政方案需要 Captain 最终批准。

### FINANCE-U0790
Captain 不得直接修改税率、发债参数、国库付款、部门预算数字或担保合同；必须通过 Finance 流程。

### FINANCE-U0791
22.2 Central Bank Governor

### FINANCE-U0792
Finance 管理 Treasury、税收、政府债务；Central Bank 管理货币、银行储备、政策利率、OMO、官方外储和金融稳定。

### FINANCE-U0793
Finance 发行债券，Central Bank 不能被 Finance 强制认购。

### FINANCE-U0794
普通二级市场 OMO 由 Central Bank 独立决定。

### FINANCE-U0795
Debt Restructuring、Bank Recapitalisation、Monetary Financing、重大外币财政危机和金融系统财政救助需要联合。

### FINANCE-U0796
政府 Treasury Account 位于中央银行，但账户资金属于财政系统；Central Bank 不得替 Finance 支配政府预算。

### FINANCE-U0797
22.3 Trade & Foreign Affairs

### FINANCE-U0798
Trade 负责国际合同、商品贸易、FDI、经济外交和国际融资谈判；Finance 负责这些安排中的政府付款、税收、主权债务、担保和财政承诺。

### FINANCE-U0799
Sovereign Loan：Trade 寻找/谈判对手方，Finance 决定借款规模、财政可承受性、还款计划，Captain 按阈值批准。

### FINANCE-U0800
Foreign Infrastructure Finance：Trade + Project Owner + Finance 共同构建。

### FINANCE-U0801
Tariff / Customs Revenue 进入 Finance Revenue，但关税政策所有权属于 Trade。

### FINANCE-U0802
涉及官方外储支付时必须再进入 Central Bank 流程。

### FINANCE-U0803
22.4 Industry, Technology & Resources

### FINANCE-U0804
Industry 拥有产业、资源、技术、能源、基础设施和生产性项目的政策/项目所有权。

### FINANCE-U0805
Finance 不决定建什么；Finance 决定 Treasury 资金、债务、担保、政府股权、SOE 财政参与和付款计划。

### FINANCE-U0806
Industrial Subsidy 必须由 Industry 提出政策目的和受益行业，Finance 决定财政额度、支付方式和预算来源。

### FINANCE-U0807
R&D Programme 由 Industry 设计技术目标，Finance 决定财政拨款、税收优惠和财政期限。

### FINANCE-U0808
SOE 生产/战略由 Industry 管，政府股东资金关系由 Finance 管。

### FINANCE-U0809
22.5 Labour & Social Development

### FINANCE-U0810
Social 拥有福利制度、劳动力、最低工资、失业保障、养老金、住房、培训和移民政策结构。

### FINANCE-U0811
Finance 不决定福利对象、替代率、资格等政策设计；Finance 决定预算上限、财政资金、支付能力和长期财政承诺。

### FINANCE-U0812
重大 Welfare Expansion、Pension Reform、Housing Programme、Training Programme 需要 Social + Finance；达到战略阈值再加 Captain。

### FINANCE-U0813
Employment Tax Credit 等税制工具由 Finance 执行，但资格逻辑可由 Social 联合定义。

### FINANCE-U0814
23. 审批矩阵与权限规则

### FINANCE-U0815
事项 | 发起 | 必须批准 | 条件性参与

### FINANCE-U0816
普通税率调整 | Finance | Finance | 无

### FINANCE-U0817
部门预算上限 | Finance | Finance | Captain 仅在国家预算/战略阈值下参与

### FINANCE-U0818
普通主权债务发行 | Finance | Finance | Central Bank 仅观察宏观金融影响，不审批普通发行

### FINANCE-U0819
外币主权债券 | Finance | Finance | 重大规模可触发 Captain；FX/金融稳定阈值触发 CB consultation

### FINANCE-U0820
项目 Treasury Funding | Project Owner | Finance | 重大项目 Captain；按依赖加入其他 Office

### FINANCE-U0821
工业/基础设施项目 | Industry | Industry + Finance 对财政部分 | Trade/Social/CB/Captain 按规则加入

### FINANCE-U0822
重大福利扩张 | Social | Social + Finance | Captain 若结构性/战略级

### FINANCE-U0823
Sovereign Loan | Finance / Trade 联合 | Finance + Trade | Captain；官方外储相关加 CB

### FINANCE-U0824
Government Guarantee | Finance 或 Project Owner 请求 | Finance | 重大/战略项目按项目矩阵

### FINANCE-U0825
SOE Equity Injection | Industry / Finance | Industry + Finance | Captain 若重大

### FINANCE-U0826
Strategic Asset Sale | Finance + relevant Office | Finance + relevant Office + Captain | Trade 若外国买方；CB 若金融稳定

### FINANCE-U0827
Debt Restructuring | Finance | Finance + CB + Captain | Trade 若国际债权人谈判

### FINANCE-U0828
Monetary Financing | Finance | Finance + CB + Captain | 无替代 bypass

### FINANCE-U0829
Bank Recapitalisation | CB / Finance | CB + Finance + Captain | 依危机加入相关 Office

### FINANCE-U0830
24. Information Advantage 财政部专属信息

### FINANCE-U0831
其他 Office 可查看与自己决策相关的财政摘要，但以下详细账本和预测属于 Finance 专属信息层。Captain 可以查看国家级摘要和重大警告，不自动获得全部底层财政账本。

### FINANCE-U0832
完整 Treasury Cash Forecast

### FINANCE-U0833
全部 Tax Liability / Collection / Arrears / Tax Gap 细项

### FINANCE-U0834
全部 Departmental Budget Requests

### FINANCE-U0835
全部 Fiscal Commitments 与付款队列

### FINANCE-U0836
完整 Debt Instrument Register

### FINANCE-U0837
完整 Maturity Ladder

### FINANCE-U0838
债券发行市场需求与认购不足信息

### FINANCE-U0839
完整 Government Guarantee Register

### FINANCE-U0840
Expected / Maximum Guarantee Exposure

### FINANCE-U0841
完整 SOE Fiscal Exposure

### FINANCE-U0842
完整 Project Payment Commitments

### FINANCE-U0843
完整 Fiscal Asset Register

### FINANCE-U0844
基于当前政策的 Baseline / Current Policy / Stress Fiscal Forecast

### FINANCE-U0845
内部 Financing Gap 预测

### FINANCE-U0846
内部 Debt Refinancing Requirement

### FINANCE-U0847
Fiscal Rule Compliance Detail

### FINANCE-U0848
25. 通知、任务、状态与审计日志

### FINANCE-U0849
25.1 Finance 必须收到的通知

### FINANCE-U0850
Funding Request Submitted

### FINANCE-U0851
Funding Request Revised

### FINANCE-U0852
Project Cost Changed

### FINANCE-U0853
Project Payment Milestone Approaching

### FINANCE-U0854
Project Overrun Detected

### FINANCE-U0855
Tax Revenue Shortfall

### FINANCE-U0856
Large Tax Arrears Change

### FINANCE-U0857
Treasury Cash Below Buffer

### FINANCE-U0858
Financing Gap Detected

### FINANCE-U0859
Debt Auction Scheduled

### FINANCE-U0860
Debt Auction Under-subscribed

### FINANCE-U0861
Debt Interest Due

### FINANCE-U0862
Debt Principal Due

### FINANCE-U0863
Foreign-currency Debt FX Loss / Gain Threshold

### FINANCE-U0864
Guarantee Exposure Increased

### FINANCE-U0865
Guarantee Trigger Pending

### FINANCE-U0866
Guarantee Called

### FINANCE-U0867
SOE Support Request

### FINANCE-U0868
SOE Dividend Missed

### FINANCE-U0869
Fiscal Rule Breach

### FINANCE-U0870
Captain Requests Fiscal Briefing

### FINANCE-U0871
Central Bank Flags Financial/Fiscal Risk

### FINANCE-U0872
Trade Requests Sovereign Financing / FX-linked Fiscal Commitment

### FINANCE-U0873
Social Requests Major Welfare Funding

### FINANCE-U0874
Industry Requests Major Project Funding

### FINANCE-U0875
25.2 所有 Finance 操作必须进入 Audit Ledger

### FINANCE-U0876
Action ID

### FINANCE-U0877
User ID

### FINANCE-U0878
Office Assignment

### FINANCE-U0879
Action Type

### FINANCE-U0880
Source Record ID

### FINANCE-U0881
Before Value

### FINANCE-U0882
After Value

### FINANCE-U0883
Currency

### FINANCE-U0884
Amount

### FINANCE-U0885
Timestamp

### FINANCE-U0886
Required Approvals

### FINANCE-U0887
Approval Records

### FINANCE-U0888
Reason / Note

### FINANCE-U0889
Fiscal Impact

### FINANCE-U0890
Related Treasury Transaction

### FINANCE-U0891
Related Debt / Guarantee / Project ID

### FINANCE-U0892
Status

### FINANCE-U0893
Reversal / Amendment Link

### FINANCE-U0894
26. 评分与 National Guardrails

### FINANCE-U0895
26.1 Finance Role Score

### FINANCE-U0896
维度 | 权重 | 评价内容

### FINANCE-U0897
Treasury Management | 20% | 现金稳定、避免无计划欠款、维持必要现金缓冲、付款执行质量。

### FINANCE-U0898
Fiscal Sustainability | 20% | 赤字、债务、利息负担、未来承诺相对于国家能力的可持续性。

### FINANCE-U0899
Revenue Efficiency | 15% | 税收制度收入表现、征管、税基保护与不必要税收缺口。

### FINANCE-U0900
Debt Management | 15% | 期限结构、融资成本、再融资风险、币种风险与发行执行。

### FINANCE-U0901
Project Financing Quality | 15% | 融资闭合、资本结构、财政杠杆、项目付款可靠性与风险调整后的资金配置。

### FINANCE-U0902
Fiscal Risk Management | 10% | 担保、SOE、外币、银行救助及其他或有负债管理。

### FINANCE-U0903
Budget Execution | 5% | 预算执行率、未计划超支、拨款与实际政策优先级的一致性。

### FINANCE-U0904
26.2 National Guardrails

### FINANCE-U0905
不能通过极端削减必要公共服务单纯压低赤字获得高分。

### FINANCE-U0906
不能通过停止偿债人为保存 Treasury Cash 获得高分。

### FINANCE-U0907
不能通过把财政风险转移到 SOE 或担保体系隐藏债务获得高分。

### FINANCE-U0908
不能通过过度短期发债把风险推到未来获得高分。

### FINANCE-U0909
不能通过积累大量现金同时严重阻塞已批准国家战略和基本公共服务获得高分。

### FINANCE-U0910
债务违约、长期欠付强制支出、失控担保损失、严重未披露财政风险触发评分惩罚。

### FINANCE-U0911
27. 数据实体与核心计算字段

### FINANCE-U0912
建议实体 | 核心字段

### FINANCE-U0913
treasury_accounts | country_id, currency, current_balance, restricted_balance, emergency_reserve, debt_service_reserve, minimum_buffer

### FINANCE-U0914
treasury_transactions | transaction_id, type, amount, currency, payer, payee, linked_record, due_date, paid_date, status

### FINANCE-U0915
tax_policies | tax_type, statutory_rate, thresholds, allowances, exemptions, start/end

### FINANCE-U0916
tax_ledgers | tax_base, liability, collected, arrears, refunds, gap

### FINANCE-U0917
budget_envelopes | office, fiscal_period, requested, approved, committed, paid, remaining

### FINANCE-U0918
fiscal_commitments | source, creditor, amount, currency, payment_schedule, priority, delay_rules

### FINANCE-U0919
funding_requests | owner, programme/project, requested_amount, financing_mix, decision, conditions

### FINANCE-U0920
debt_instruments | instrument_type, currency, face_value, coupon, issue_price, maturity, holders, outstanding

### FINANCE-U0921
debt_auctions | offered, bids, allocated, yield, cash_proceeds

### FINANCE-U0922
project_financing | project_id, sources, amounts, guarantee, equity, payment_schedule, funding_gap

### FINANCE-U0923
government_guarantees | underlying_loan, guaranteed_amount, fee, trigger, exposure, status

### FINANCE-U0924
soe_fiscal_positions | ownership, equity_injection, dividends, guarantees, debt_exposure

### FINANCE-U0925
fiscal_assets | asset_type, ownership, valuation, sale_status, proceeds

### FINANCE-U0926
fiscal_rules | rule_type, threshold, effective_dates, exception_status

### FINANCE-U0927
fiscal_forecasts | scenario, horizon, revenues, expenditures, balance, cash, debt, commitments

### FINANCE-U0928
fiscal_warnings | warning_type, source_metric, threshold, amount, severity_label, status

### FINANCE-U0929
27.1 核心计算

### FINANCE-U0930
Free Cash = TGA Cash - Restricted Cash - Near-term Committed Payments - Minimum Cash Buffer

### FINANCE-U0931
Primary Balance = Total Revenue - Non-interest Expenditure

### FINANCE-U0932
Overall Balance = Total Revenue - Total Expenditure

### FINANCE-U0933
Debt-to-GDP = Gross Public Debt / Nominal GDP

### FINANCE-U0934
Interest-to-Revenue = Interest Expenditure / Government Revenue

### FINANCE-U0935
Guarantee Maximum Exposure = Σ Outstanding Guaranteed Exposure

### FINANCE-U0936
Net Fiscal Position Horizon h = Opening Cash + Expected Receipts_h - Scheduled Payments_h - Minimum Buffer

### FINANCE-U0937
Project Funding Gap = Approved Project Funding Requirement - Confirmed Financing Sources

### FINANCE-U0938
28. 前端页面操作控件

### FINANCE-U0939
28.1 数字输入规则

### FINANCE-U0940
所有金额字段必须显示 Currency Code。

### FINANCE-U0941
金额支持按 full value / thousand / million / billion 的显示单位切换，但数据库保存统一最小货币单位或高精度 decimal。

### FINANCE-U0942
税率、票息、比例、保证比例使用百分比输入并限制合法范围。

### FINANCE-U0943
所有未来付款使用 simulation date / timestamp。

### FINANCE-U0944
所有债务与贷款必须输入 maturity。

### FINANCE-U0945
所有融资来源合计实时显示，不允许 UI 把未确认资金算作 confirmed funding。

### FINANCE-U0946
所有可编辑字段必须同时显示 Current / Proposed / Difference。

### FINANCE-U0947
28.2 Finance 通用操作按钮

### FINANCE-U0948
Save Draft

### FINANCE-U0949
Submit / Publish Fiscal Decision

### FINANCE-U0950
Approve

### FINANCE-U0951
Approve Partial

### FINANCE-U0952
Conditionally Approve

### FINANCE-U0953
Request Revision

### FINANCE-U0954
Defer

### FINANCE-U0955
Reject

### FINANCE-U0956
Freeze

### FINANCE-U0957
Unfreeze

### FINANCE-U0958
Schedule Payment

### FINANCE-U0959
Pay Now

### FINANCE-U0960
Create Debt Issue

### FINANCE-U0961
Launch Auction

### FINANCE-U0962
Create Guarantee

### FINANCE-U0963
Create Financing Package

### FINANCE-U0964
Create Fiscal Warning

### FINANCE-U0965
Open Joint Committee

### FINANCE-U0966
Escalate to Captain

### FINANCE-U0967
Request Central Bank Coordination

### FINANCE-U0968
Request Trade Financing Support

### FINANCE-U0969
Request Project Owner Revision

### FINANCE-U0970
Cancel Draft

### FINANCE-U0971
Amend Published Decision through formal amendment flow

### FINANCE-U0972
28.3 预测面板

### FINANCE-U0973
Treasury Cash Before / After

### FINANCE-U0974
7 / 14 / 30 / 60-day cash impact

### FINANCE-U0975
Revenue change

### FINANCE-U0976
Expenditure change

### FINANCE-U0977
Primary balance change

### FINANCE-U0978
Overall balance change

### FINANCE-U0979
Debt stock change

### FINANCE-U0980
Debt service change

### FINANCE-U0981
Guarantee exposure change

### FINANCE-U0982
Project funding gap change

### FINANCE-U0983
Foreign-currency fiscal exposure change

### FINANCE-U0984
29. 后台交易与会计事件

### FINANCE-U0985
所有 Finance 操作必须产生可追踪的财政事件；不存在只改变 UI 指标而没有账本变化的财政动作。

### FINANCE-U0986
事件 | 必须产生的账本变化

### FINANCE-U0987
Tax Collection | Tax receivable/assessment → Treasury cash receipt; update collected revenue and arrears.

### FINANCE-U0988
Government Payment | TGA cash decreases; beneficiary receives payment; commitment outstanding decreases.

### FINANCE-U0989
Bond Issuance | Debt liability increases by principal; Treasury cash increases by actual proceeds; issuance cost recorded.

### FINANCE-U0990
Debt Interest Payment | Treasury cash decreases; interest expense recognised; debt principal unchanged.

### FINANCE-U0991
Debt Principal Repayment | Treasury cash decreases; outstanding principal decreases.

### FINANCE-U0992
Government Guarantee Approval | No immediate cash unless fee; contingent liability / exposure created.

### FINANCE-U0993
Guarantee Call | Treasury payable and cash payment created; contingent exposure becomes realised fiscal loss / receivable recovery right.

### FINANCE-U0994
Government Equity Injection | Treasury cash decreases; government equity asset increases; linked SOE/project cash increases.

### FINANCE-U0995
Dividend Receipt | Treasury cash increases; non-tax revenue recorded.

### FINANCE-U0996
Asset Sale | Government asset / ownership decreases; Treasury cash increases by net proceeds; future dividend stream updated.

### FINANCE-U0997
Project Commitment | Future fiscal commitment created; cash not yet reduced until payment milestone.

### FINANCE-U0998
Payment Deferral | Due date changes if legally allowed; arrears / penalty / credibility effects recorded.

### FINANCE-U0999
Debt Restructuring | Old debt terms amended/replaced; new principal, maturity, coupon and recognised losses tracked through joint process.

### FINANCE-U1000
30. 工程验收标准与旧版迁移

### FINANCE-U1001
30.1 必须删除或降级为只读结果的旧式输入

### FINANCE-U1002
Government Spending % GDP：删除作为直接控制器；改为实际预算支出的只读比率。

### FINANCE-U1003
Debt Issuance % GDP：删除；改为逐笔 Debt Instrument。

### FINANCE-U1004
Loan Guarantees % GDP：删除；改为逐笔 Guarantee Contract。

### FINANCE-U1005
Privatisation / SOE Revenue ±% GDP：删除；改为逐笔 Equity Injection、Dividend、Asset Sale。

### FINANCE-U1006
Fiscal Space 0–100：不得作为底层独立变量；改为基于现金、融资、承诺和债务约束的 Derived Fiscal Capacity。

### FINANCE-U1007
Public Service Budget 单一百分比：拆入 National Budget 的实际金额科目和部门预算。

### FINANCE-U1008
Fiscal Deficit Target：保留为 policy target，不允许直接改变实际赤字。

### FINANCE-U1009
Government Spending 总滑块：由各预算、强制支出和项目支付的实际金额加总形成。

### FINANCE-U1010
30.2 必须保留并升级的旧版逻辑

### FINANCE-U1011
VAT、Personal Income Tax、Corporate Tax、Payroll Tax / Credit 的政策方向。

### FINANCE-U1012
预算分配的稀缺性和部门权衡。

### FINANCE-U1013
公共债务融资与债务成本。

### FINANCE-U1014
政府担保及其或有负债风险。

### FINANCE-U1015
SOE 政府投资和私有化的财政权衡。

### FINANCE-U1016
Finance 与 Captain、Central Bank、Industry、Trade、Social 的跨部门审批。

### FINANCE-U1017
重大基础设施、重大福利、债务重组等 Joint Approval 逻辑。

### FINANCE-U1018
财政政策的滞后、间接影响、资源约束和政策反转成本。

### FINANCE-U1019
30.3 工程验收 Checklist

### FINANCE-U1020
□ 每个国家拥有可计算且持久化的 Treasury General Account。

### FINANCE-U1021
□ 所有政府收入与支出均产生 Treasury Transaction。

### FINANCE-U1022
□ 预算金额存在 Requested / Approved / Committed / Paid 等状态。

### FINANCE-U1023
□ 任何项目 Treasury Funding 必须由 Finance 批准。

### FINANCE-U1024
□ Finance 拒绝财政参与不得自动删除 Project Owner 的项目。

### FINANCE-U1025
□ 所有主权债务均为具体 instrument，具有本金、币种、票息、发行价、到期日和 outstanding balance。

### FINANCE-U1026
□ 债务发行只有实际认购/结算部分进入 Treasury。

### FINANCE-U1027
□ 所有政府担保都有最大暴露和触发状态。

### FINANCE-U1028
□ 所有未来项目付款进入 Fiscal Commitment。

### FINANCE-U1029
□ Fiscal Forecast 可以在 7/14/30/60 日区间重算。

### FINANCE-U1030
□ 财政规则突破必须形成 Fiscal Exception 记录。

### FINANCE-U1031
□ Finance 与 Central Bank 的权限不能互相覆盖。

### FINANCE-U1032
□ Finance 与 Industry/Social/Trade 的项目权和资金权必须分离。

### FINANCE-U1033
□ 所有重大操作都有审批记录、审计日志和 amendment/reversal 链。

### FINANCE-U1034
□ 所有 UI 预测均可追溯到底层现金流、税基、债务、付款或担保数据。

### FINANCE-U1035
□ 不存在以 Fiscal Space、Funding Strength、Debt Stress 等人造 0–100 数值直接驱动财政交易的核心逻辑。

### FINANCE-U1036
附录 A：Finance 完整操作空间总表

### FINANCE-U1037
操作领域 | 全部 Finance 动作

### FINANCE-U1038
Treasury | Pay Now; Schedule Payment; Prioritise Payment; Delay Eligible Payment; Split Payment; Draw Emergency Reserve; Transfer Fiscal Subaccounts; Freeze / Release Discretionary Payment

### FINANCE-U1039
Taxation | Set VAT; Set PIT Brackets; Set CIT; Set Payroll Tax; Create Employment Credits; Create Tax Expenditure; Set Exemptions / Allowances; Monitor Collection / Arrears

### FINANCE-U1040
Budget | Set Budget Envelope; Approve Appropriation; Amend Budget; Reallocate Uncommitted Funds; Set Central Treasury Funds; Reserve Funds

### FINANCE-U1041
Department Funding | Approve Full; Approve Partial; Matching Funding; Debt-financed Funding; Guarantee; Government Equity; SOE Route; Defer; Request Revision; Reject Fiscal Participation

### FINANCE-U1042
Debt | Issue; Auction; Refinance; Repay; Buyback; Exchange; Pre-fund; Manage Currency / Maturity Mix; Launch Restructuring Proposal

### FINANCE-U1043
Projects | Build Financing Package; Set Treasury Share; Set Debt Share; Set Guarantee; Set Government Equity; Set Payment Schedule; Set Funding Conditions; Request Cost/Scope/Structure Revision

### FINANCE-U1044
Guarantees | Approve; Set %; Set Fee; Set Cap; Monitor Exposure; Pay Call; Recover; Close

### FINANCE-U1045
SOEs | Equity Injection; Dividend; Government Loan; Guarantee; Acquire / Sell Equity; Recapitalise; Request Restructuring

### FINANCE-U1046
Fiscal Assets | Sell / Lease; Accept Bid; Receive Proceeds; Acquire Asset; Update Ownership

### FINANCE-U1047
Rules & Risk | Set Fiscal Rules; Invoke Exception; Issue Fiscal Warning; Run Forecast; Run Stress Scenario

### FINANCE-U1048
Emergency | Reallocate; Freeze; Use Reserve; Emergency Bond; Reschedule; Sovereign Loan Request; Temporary Tax Change; Debt Restructuring; Monetary Financing Request

### FINANCE-U1049
最终角色定义  财政部长不是项目 Owner，也不是“只负责付款”的会计。其核心玩法是：面对有限国库现金、未来付款、税收变化、债务到期、市场融资条件、担保与项目请求，为国家建立可支付且可持续的资本结构和财政路径。

### FINANCE-U1050
附录 B：与现有 World Simulation 的继承关系

### FINANCE-U1051
本规范以现有 EconMind OS World Simulation 玩家手册中 Finance & Economic Minister、Shared National Resources、Cabinet Coordination and Approval、Policy Package、Crisis Actions、Rolling Cabinet Briefing 和 Scoring System 的框架为基底。Season 1 版本保留其经济学方向和跨部门协作原则，并将旧式比例/强度输入重构为真实的 Treasury、预算、债券、担保、税收和项目融资系统。
