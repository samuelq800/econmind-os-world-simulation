# CENTRAL_BANK｜原始规范文本索引

原文件：`EconMind_Season1_Central_Bank_Governor_Function_Specification.docx`
本文件为段落/表格顺序提取，未修改规则，未协调矛盾；图像、批注、页眉页脚与版式以原Word为准。锚点仅供回查，不代表独立需求条数。

### CENTRAL_BANK-U0001
EconMind OS Season 1

### CENTRAL_BANK-U0002
Central Bank Governor

### CENTRAL_BANK-U0003
中央银行行长

### CENTRAL_BANK-U0004
完整职能、账户、政策工具、交易流程与系统计算规范

### CENTRAL_BANK-U0005
Full Function, Balance Sheet, Transaction, Authority & Calculation Specification

### CENTRAL_BANK-U0006
Version: Season 1 Office Redesign Draft 1.0
Basis: Existing World Simulation Player Manual + Season 1 exact-value monetary-system redesign
Purpose: Product design / economic-engine specification / engineering handoff

### CENTRAL_BANK-U0007
文档使用说明

### CENTRAL_BANK-U0008
本文件用于定义 EconMind OS Season 1 中 Central Bank Governor / 中央银行行长的完整操作空间。它不是教学讲义，也不是功能举例清单，而是一个角色级产品与计算规范：文中列出的账户、字段、操作、权限、交易、审批、计算关系与日志均被视为该 Office 的完整功能边界。

### CENTRAL_BANK-U0009
核心设计原则 / 所有现实中能够用货币金额、资产、负债、数量、利率、期限、汇率或可计算比例精确表示的对象，均以精确值存储与计算；不使用“外储强度 0-100”“金融稳定度 0-100”“流动性程度”等人造程度值作为底层经济变量。定性标签只允许作为 UI 提示，不参与经济公式。

### CENTRAL_BANK-U0010
本文件继承现有 World Simulation 中央行职责框架：通胀、利率、信贷、汇率、外汇储备、银行体系，以及 Policy Interest Rate、Inflation Target、Reserve Requirement、Open Market Operations、FX Intervention、Countercyclical Buffer、Emergency Liquidity、Lending Guidance 等工具。Season 1 将这些机制改写为精确账户和交易体系，并以 Targeted Refinancing Facility 替换抽象 Lending Guidance。

### CENTRAL_BANK-U0011
目录

### CENTRAL_BANK-U0012
1. Office 定位与权限边界

### CENTRAL_BANK-U0013
2. 精确货币系统的基础规则

### CENTRAL_BANK-U0014
3. 中央银行资产负债表

### CENTRAL_BANK-U0015
4. 货币总量与货币供应

### CENTRAL_BANK-U0016
5. 全国商业银行汇总资产负债表

### CENTRAL_BANK-U0017
6. 央行 Dashboard 与全部页面

### CENTRAL_BANK-U0018
7. 政策利率 Policy Interest Rate

### CENTRAL_BANK-U0019
8. 通胀目标与货币政策框架

### CENTRAL_BANK-U0020
9. Open Market Operations 公开市场操作

### CENTRAL_BANK-U0021
10. Reserve Requirement 存款准备金制度

### CENTRAL_BANK-U0022
11. 银行资本监管与 Countercyclical Buffer

### CENTRAL_BANK-U0023
12. Targeted Refinancing Facility 定向再融资工具

### CENTRAL_BANK-U0024
13. Emergency Liquidity Assistance 紧急流动性

### CENTRAL_BANK-U0025
14. 外汇市场、汇率与官方外汇储备

### CENTRAL_BANK-U0026
15. FX Intervention 与 Sterilisation

### CENTRAL_BANK-U0027
16. Official FX Allocation Request 官方外汇使用审批

### CENTRAL_BANK-U0028
17. Reserve Swap 储备互换

### CENTRAL_BANK-U0029
18. Treasury Account 与财政-货币接口

### CENTRAL_BANK-U0030
19. 资本流动、外债与金融制裁

### CENTRAL_BANK-U0031
20. 金融危机、银行处置与债务危机

### CENTRAL_BANK-U0032
21. Monetary Policy Statement 与 Forward Guidance

### CENTRAL_BANK-U0033
22. 央行信息优势、报告与预警

### CENTRAL_BANK-U0034
23. Shared Policies 与跨 Office 审批矩阵

### CENTRAL_BANK-U0035
24. 交易账本、计算顺序与数据一致性

### CENTRAL_BANK-U0036
25. 玩家权限、兼任、审计日志与通知

### CENTRAL_BANK-U0037
26. Central Bank Score 与国家护栏

### CENTRAL_BANK-U0038
27. 旧版功能迁移矩阵

### CENTRAL_BANK-U0039
28. UI/工程实现检查清单

### CENTRAL_BANK-U0040
1. Office 定位与权限边界

### CENTRAL_BANK-U0041
1.1 正式名称与系统 Role ID

### CENTRAL_BANK-U0042
项目 | 固定定义

### CENTRAL_BANK-U0043
显示名称 | Central Bank Governor / 中央银行行长

### CENTRAL_BANK-U0044
系统 Role ID | CENTRAL_BANK

### CENTRAL_BANK-U0045
角色性质 | 独立货币与金融稳定机构，不属于财政部的下属权限

### CENTRAL_BANK-U0046
核心目标 | 维持价格稳定、货币与支付体系可运行、银行体系具备流动性与资本缓冲、外汇与官方储备可持续

### CENTRAL_BANK-U0047
核心约束 | 所有操作必须通过真实账户、交易和资产负债表反映，不允许通过未记账的抽象增益直接修改宏观结果

### CENTRAL_BANK-U0048
1.2 Central Bank 独占政策权限

### CENTRAL_BANK-U0049
Policy Interest Rate / 政策利率

### CENTRAL_BANK-U0050
Inflation Target / 通胀目标及容忍区间

### CENTRAL_BANK-U0051
Open Market Purchase / 公开市场买入

### CENTRAL_BANK-U0052
Open Market Sale / 公开市场卖出

### CENTRAL_BANK-U0053
Reserve Requirement / 存款准备金率

### CENTRAL_BANK-U0054
Base Capital Requirement / 基础资本充足要求

### CENTRAL_BANK-U0055
Countercyclical Capital Buffer / 逆周期资本缓冲

### CENTRAL_BANK-U0056
Targeted Refinancing Facility / 定向再融资工具的创建、参数与关闭

### CENTRAL_BANK-U0057
Emergency Liquidity Assistance / 紧急流动性工具的金额、利率、期限、抵押品与 haircut

### CENTRAL_BANK-U0058
FX Intervention / 官方外汇市场干预

### CENTRAL_BANK-U0059
Sterilisation / 冲销操作

### CENTRAL_BANK-U0060
Monetary Policy Statement / 货币政策声明

### CENTRAL_BANK-U0061
Forward Guidance / 前瞻指引

### CENTRAL_BANK-U0062
1.3 Central Bank 不得直接控制的政策

### CENTRAL_BANK-U0063
VAT / Personal Income Tax / Corporate Tax / Payroll Tax

### CENTRAL_BANK-U0064
政府支出总额与各预算部门拨款

### CENTRAL_BANK-U0065
财政赤字目标、普通政府债务发行的规模决策

### CENTRAL_BANK-U0066
关税、进口配额、出口限制、普通商品合同

### CENTRAL_BANK-U0067
产业补贴、产业项目、资源开采许可、R&D 项目选择

### CENTRAL_BANK-U0068
最低工资、失业福利、住房补贴、养老金、移民政策

### CENTRAL_BANK-U0069
国家长期发展战略、国家优先目标、内阁议程

### CENTRAL_BANK-U0070
普通外交关系、普通贸易谈判和普通 FDI 审查

### CENTRAL_BANK-U0071
1.4 Central Bank 的联合权限

### CENTRAL_BANK-U0072
联合事项 | Central Bank 权限 | 必须共同参与的 Office

### CENTRAL_BANK-U0073
Capital Controls | 提供金融稳定判断；确认资本流出与外储影响；批准金融执行部分 | Trade + Captain

### CENTRAL_BANK-U0074
Reserve Swap | 确定金额、货币、期限、汇率/利率条件及资产负债表影响 | Trade + Captain

### CENTRAL_BANK-U0075
Debt Restructuring | 评估银行持债损失、流动性、汇率、外储和金融稳定后果 | Finance + Captain

### CENTRAL_BANK-U0076
Bank Resolution with Fiscal Support | 确认银行资本缺口与流动性缺口；提出处置规模 | Finance + Captain

### CENTRAL_BANK-U0077
Direct Monetary Financing | 决定是否提供央行直接融资及金额、期限、利率 | Finance + Captain

### CENTRAL_BANK-U0078
Official Reserve Payment | 批准或部分批准官方外储实际支出 | 提出申请的 Trade / Finance / Industry；达到战略阈值时 Captain

### CENTRAL_BANK-U0079
Sovereign FX Emergency | 提供官方外汇、流动性与金融稳定方案 | Finance + Trade + Captain

### CENTRAL_BANK-U0080
Financial Sanctions | 执行金融结算、资产限制与支付通道措施 | Trade + Captain

### CENTRAL_BANK-U0081
2. 精确货币系统的基础规则

### CENTRAL_BANK-U0082
2.1 货币单位

### CENTRAL_BANK-U0083
对象 | 系统规则

### CENTRAL_BANK-U0084
Domestic Currency / 本币 | 每个国家拥有唯一 currency_code、currency_name、currency_symbol；国内账户、税收、工资、贷款、债券与政府支出均以本币计价

### CENTRAL_BANK-U0085
GCU / Global Currency Unit | Season 1 的统一国际结算与主要官方储备货币；跨国商品合同、官方储备、储备互换和多数外币债务以 GCU 计价

### CENTRAL_BANK-U0086
汇率报价 | 前端统一显示 1 GCU = X Local Currency；后台同时保存 reciprocal rate 供计算使用

### CENTRAL_BANK-U0087
金额存储 | 数据库使用整数最小货币单位或固定精度 decimal；禁止使用二进制 float 直接保存货币金额

### CENTRAL_BANK-U0088
显示精度 | 玩家界面根据规模自动显示 thousand / million / billion；底层数值不因显示缩写而丢失精度

### CENTRAL_BANK-U0089
模拟时间 | 所有交易记录 simulation_timestamp；期限、利息和到期均按模拟时间计算

### CENTRAL_BANK-U0090
2.2 货币与资产负债表恒等式

### CENTRAL_BANK-U0091
Central Bank Assets = Central Bank Liabilities + Central Bank Equity / Commercial Bank Assets = Commercial Bank Liabilities + Commercial Bank Equity

### CENTRAL_BANK-U0092
任何导致央行或银行体系资产、负债、资本发生变化的操作，必须创建至少一组平衡的 debit/credit 账目。任何不平衡交易不得提交为正式世界事件。

### CENTRAL_BANK-U0093
2.3 Stock 与 Flow 的严格区分

### CENTRAL_BANK-U0094
类型 | 定义 | 系统处理

### CENTRAL_BANK-U0095
Stock | 某一时点存在的余额 | Foreign Reserves、Currency in Circulation、Bank Reserves、Loans、Deposits、Government Bonds、Equity

### CENTRAL_BANK-U0096
Flow | 一个时间区间内发生的变化 | Tax Payments、Government Spending、Exports、Imports、Capital Inflows、Loan Creation、Loan Repayment、Interest Payments

### CENTRAL_BANK-U0097
Derived Ratio | 由真实余额/流量计算出的比例 | NPL Ratio、Capital Ratio、Reserve Requirement Fulfilment、Import Cover、Credit Growth、Real Policy Rate

### CENTRAL_BANK-U0098
2.4 禁止作为底层状态的虚拟指标

### CENTRAL_BANK-U0099
Reserve Strength 0-100

### CENTRAL_BANK-U0100
Liquidity Strength 0-100

### CENTRAL_BANK-U0101
Financial Stability 0-100

### CENTRAL_BANK-U0102
Currency Pressure 0-100

### CENTRAL_BANK-U0103
Banking Confidence 0-100

### CENTRAL_BANK-U0104
Monetary Tightness 0-100

### CENTRAL_BANK-U0105
Lending Guidance 0-100 或占总信贷的抽象强度

### CENTRAL_BANK-U0106
FX Intervention Strength 0-100

### CENTRAL_BANK-U0107
Emergency Liquidity Strength 0-100

### CENTRAL_BANK-U0108
允许系统根据真实数据在 UI 中显示 NORMAL / WATCH / STRESSED / CRITICAL 等标签，但标签只能由底层精确数值派生，不能反向进入经济计算。

### CENTRAL_BANK-U0109
3. 中央银行资产负债表

### CENTRAL_BANK-U0110
3.1 资产端全部科目

### CENTRAL_BANK-U0111
资产科目 | 定义与计入规则

### CENTRAL_BANK-U0112
FX Cash & Deposits | 央行持有的 GCU 现金与可立即动用存款；计入 Gross Reserves 与 Usable Reserves

### CENTRAL_BANK-U0113
Foreign Reserve Securities | 以 GCU 计价、可用于储备管理的高流动性外国证券；计入 Gross Reserves，按市场价值重估

### CENTRAL_BANK-U0114
Reserve Swap Receivables | 他国央行因储备互换欠本国央行的外币本金及应计利息

### CENTRAL_BANK-U0115
Gold / Other Reserve Assets | 若该国家初始条件配置该资产，则按 GCU 市值计价；Season 1 不允许玩家主动开采或购买未启用的储备资产类别

### CENTRAL_BANK-U0116
Domestic Government Securities | 央行通过 OMO 在二级市场持有的本国政府债券

### CENTRAL_BANK-U0117
Regular Refinancing Loans | 商业银行使用 Targeted Refinancing Facility 后形成的央行贷款资产

### CENTRAL_BANK-U0118
Emergency Liquidity Loans | ELA 对商业银行形成的央行贷款资产

### CENTRAL_BANK-U0119
Monetary Financing Claims | 仅在联合批准的 Direct Monetary Financing 中形成的对政府债权

### CENTRAL_BANK-U0120
Accrued Interest Receivable | 尚未结算的银行贷款、政府债权、外汇资产应收利息

### CENTRAL_BANK-U0121
Other Central Bank Assets | 系统预留科目；不得由玩家手动添加余额

### CENTRAL_BANK-U0122
3.2 负债端全部科目

### CENTRAL_BANK-U0123
负债科目 | 定义与计入规则

### CENTRAL_BANK-U0124
Currency in Circulation | 居民与企业持有的实体/流通本币；计入 Monetary Base

### CENTRAL_BANK-U0125
Commercial Bank Reserve Accounts | 商业银行在央行的准备金；计入 Monetary Base

### CENTRAL_BANK-U0126
Treasury / Government Deposit Account | 财政部门在央行的政府账户余额，不计入公众持有货币供应

### CENTRAL_BANK-U0127
Central Bank Bills / Term Deposits | 央行为吸收流动性发行或接受的央行票据/定期存款负债

### CENTRAL_BANK-U0128
Reserve Swap Payables | 本国央行因储备互换欠他国央行的本金及应计利息

### CENTRAL_BANK-U0129
Accrued Interest Payable | 央行对票据、存款、互换产生但尚未支付的利息

### CENTRAL_BANK-U0130
Other Central Bank Liabilities | 系统预留科目，不允许玩家直接修改

### CENTRAL_BANK-U0131
3.3 Equity 全部科目

### CENTRAL_BANK-U0132
资本科目 | 定义

### CENTRAL_BANK-U0133
Paid-in / Initial Central Bank Capital | 国家初始化时设定的央行初始资本

### CENTRAL_BANK-U0134
Retained Earnings | 央行已实现利息收入、交易收益与费用结余累计值

### CENTRAL_BANK-U0135
Valuation Reserve | 外汇储备和外国证券因汇率/市价变化形成的未实现估值变化

### CENTRAL_BANK-U0136
Accumulated Losses | ELA 违约、资产减值、处置损失等形成的累计损失

### CENTRAL_BANK-U0137
3.4 每次操作后必须重新计算

### CENTRAL_BANK-U0138
Total Assets

### CENTRAL_BANK-U0139
Total Liabilities

### CENTRAL_BANK-U0140
Central Bank Equity

### CENTRAL_BANK-U0141
Foreign Reserve Total

### CENTRAL_BANK-U0142
Monetary Base

### CENTRAL_BANK-U0143
Bank Reserve Balance

### CENTRAL_BANK-U0144
Government Deposit Balance

### CENTRAL_BANK-U0145
Outstanding CB Lending

### CENTRAL_BANK-U0146
Outstanding Swap Assets / Liabilities

### CENTRAL_BANK-U0147
Accrued Interest

### CENTRAL_BANK-U0148
4. 货币总量与货币供应

### CENTRAL_BANK-U0149
4.1 基础变量

### CENTRAL_BANK-U0150
变量 | 符号 | 精确定义

### CENTRAL_BANK-U0151
Currency in Circulation | C | 公众持有的流通本币余额

### CENTRAL_BANK-U0152
Commercial Bank Reserves | R | 商业银行存于央行的准备金余额

### CENTRAL_BANK-U0153
Demand Deposits | DD | 可随时支付与转账的银行存款余额

### CENTRAL_BANK-U0154
Savings / Time Deposits | SD | 储蓄和定期存款余额

### CENTRAL_BANK-U0155
Monetary Base | MB | C + R

### CENTRAL_BANK-U0156
M1 | M1 | C + DD

### CENTRAL_BANK-U0157
M2 | M2 | M1 + SD

### CENTRAL_BANK-U0158
MB = C + R / M1 = C + DD / M2 = C + DD + SD

### CENTRAL_BANK-U0159
4.2 Currency in Circulation 的变化来源

### CENTRAL_BANK-U0160
商业银行以 Reserve Account 余额向央行兑换实体/流通货币：C 增加、R 等额减少；MB 不变

### CENTRAL_BANK-U0161
流通货币回存银行并由银行交回央行：C 减少、R 等额增加；MB 不变

### CENTRAL_BANK-U0162
央行不得通过独立按钮直接把 C 调整到目标值；C 的变化必须来自银行与公众的现金需求流程

### CENTRAL_BANK-U0163
4.3 M1/M2 的变化规则

### CENTRAL_BANK-U0164
商业银行发放新贷款并同时形成借款人存款时，Loans 与 Deposits 同额增加，M1/M2 根据存款类别上升

### CENTRAL_BANK-U0165
银行贷款偿还导致 Loans 与 Deposits 同额减少，M1/M2 下降

### CENTRAL_BANK-U0166
存款在 Demand 与 Savings/Time 之间转换只改变 M1 与存款结构，不自动改变 M2

### CENTRAL_BANK-U0167
央行 OMO 直接改变 Bank Reserves 与 Monetary Base，但 M1/M2 的后续变化取决于银行信贷、存款和资金流动，不得直接按固定乘数强制改写

### CENTRAL_BANK-U0168
5. 全国商业银行汇总资产负债表

### CENTRAL_BANK-U0169
Season 1 不模拟数百家独立银行。系统维护一个 National Commercial Banking Sector 汇总资产负债表，作为全体商业银行的合并视图；所有信贷、存款、准备金、资本与 NPL 均由该汇总部门核算。

### CENTRAL_BANK-U0170
5.1 银行资产端

### CENTRAL_BANK-U0171
Reserves at Central Bank

### CENTRAL_BANK-U0172
Cash / Settlement Assets

### CENTRAL_BANK-U0173
Household Consumer Loans

### CENTRAL_BANK-U0174
Residential Mortgage Loans

### CENTRAL_BANK-U0175
Agriculture & Food Loans

### CENTRAL_BANK-U0176
Mining & Natural Resources Loans

### CENTRAL_BANK-U0177
Energy & Utilities Loans

### CENTRAL_BANK-U0178
Manufacturing Loans

### CENTRAL_BANK-U0179
Technology & Semiconductor Loans

### CENTRAL_BANK-U0180
Construction & Infrastructure Loans

### CENTRAL_BANK-U0181
Trade & Logistics Loans

### CENTRAL_BANK-U0182
Services & SME Loans

### CENTRAL_BANK-U0183
SOE / Public Enterprise Loans

### CENTRAL_BANK-U0184
Government Securities

### CENTRAL_BANK-U0185
Foreign Assets

### CENTRAL_BANK-U0186
Other Banking Assets

### CENTRAL_BANK-U0187
5.2 银行负债端

### CENTRAL_BANK-U0188
Demand Deposits

### CENTRAL_BANK-U0189
Savings Deposits

### CENTRAL_BANK-U0190
Time Deposits

### CENTRAL_BANK-U0191
Domestic Wholesale Funding

### CENTRAL_BANK-U0192
Foreign Borrowing

### CENTRAL_BANK-U0193
Central Bank Regular Refinancing Borrowing

### CENTRAL_BANK-U0194
Central Bank Emergency Liquidity Borrowing

### CENTRAL_BANK-U0195
Other Banking Liabilities

### CENTRAL_BANK-U0196
5.3 银行资本

### CENTRAL_BANK-U0197
Paid-in Bank Equity

### CENTRAL_BANK-U0198
Retained Earnings

### CENTRAL_BANK-U0199
Loan-loss Provisions

### CENTRAL_BANK-U0200
Accumulated Losses

### CENTRAL_BANK-U0201
5.4 信贷与 NPL 必须按同一行业分类保存

### CENTRAL_BANK-U0202
行业信贷类别 | 必须保存字段

### CENTRAL_BANK-U0203
Household Consumer Loans | outstanding_loan_amount / new_lending_flow / repayment_flow / interest_rate / npl_amount / provisioning_amount

### CENTRAL_BANK-U0204
Residential Mortgage Loans | outstanding_loan_amount / new_lending_flow / repayment_flow / interest_rate / npl_amount / provisioning_amount

### CENTRAL_BANK-U0205
Agriculture & Food Loans | outstanding_loan_amount / new_lending_flow / repayment_flow / interest_rate / npl_amount / provisioning_amount

### CENTRAL_BANK-U0206
Mining & Natural Resources Loans | outstanding_loan_amount / new_lending_flow / repayment_flow / interest_rate / npl_amount / provisioning_amount

### CENTRAL_BANK-U0207
Energy & Utilities Loans | outstanding_loan_amount / new_lending_flow / repayment_flow / interest_rate / npl_amount / provisioning_amount

### CENTRAL_BANK-U0208
Manufacturing Loans | outstanding_loan_amount / new_lending_flow / repayment_flow / interest_rate / npl_amount / provisioning_amount

### CENTRAL_BANK-U0209
Technology & Semiconductor Loans | outstanding_loan_amount / new_lending_flow / repayment_flow / interest_rate / npl_amount / provisioning_amount

### CENTRAL_BANK-U0210
Construction & Infrastructure Loans | outstanding_loan_amount / new_lending_flow / repayment_flow / interest_rate / npl_amount / provisioning_amount

### CENTRAL_BANK-U0211
Trade & Logistics Loans | outstanding_loan_amount / new_lending_flow / repayment_flow / interest_rate / npl_amount / provisioning_amount

### CENTRAL_BANK-U0212
Services & SME Loans | outstanding_loan_amount / new_lending_flow / repayment_flow / interest_rate / npl_amount / provisioning_amount

### CENTRAL_BANK-U0213
SOE / Public Enterprise Loans | outstanding_loan_amount / new_lending_flow / repayment_flow / interest_rate / npl_amount / provisioning_amount

### CENTRAL_BANK-U0214
5.5 银行系统自动派生数值

### CENTRAL_BANK-U0215
NPL Ratio = Total NPL Amount / Total Loans / Required Capital = Risk-Weighted Assets × Total Capital Requirement / Capital Headroom = Actual Bank Equity - Required Capital / Required Reserves = Reservable Deposits × Reserve Requirement / Excess Reserves = Actual Reserves - Required Reserves

### CENTRAL_BANK-U0216
6. Central Bank Dashboard 与全部页面

### CENTRAL_BANK-U0217
页面 | 必须显示的内容 | 允许操作

### CENTRAL_BANK-U0218
01 Overview | 政策利率、通胀/核心通胀/预期通胀、实际利率、MB/M1/M2、银行准备金、FX、Gross/Usable Reserves、Import Cover、银行资本缺口/流动性缺口 | 跳转；无直接改值

### CENTRAL_BANK-U0219
02 Central Bank Balance Sheet | 全部资产、负债、资本、各科目变化、历史交易 | 查看交易来源；导出/展开

### CENTRAL_BANK-U0220
03 Monetary Policy | Policy Rate、Inflation Target、Tolerance Band、OMO、Reserve Requirement、政策历史 | 发布利率、目标、OMO、准备金操作

### CENTRAL_BANK-U0221
04 Banking & Credit | 商业银行资产负债表、分行业信贷、NPL、资本、RWA、准备金、CB borrowing | 资本监管、CCyB、定向再融资、ELA

### CENTRAL_BANK-U0222
05 FX & Reserves | 汇率、外汇流量、储备组成、已承诺外储、可用外储、Import Cover、干预历史 | FX Intervention、Sterilisation、官方外储申请审批

### CENTRAL_BANK-U0223
06 Facilities | 全部 Targeted Refinancing Facility、ELA、使用额、未偿余额、到期、抵押品、损失 | 创建/修改未启用工具、暂停新提款、关闭到期工具

### CENTRAL_BANK-U0224
07 Shared Decisions | Reserve Swap、Capital Controls、Debt Restructuring、Bank Resolution、Monetary Financing、Financial Sanctions | 批准/拒绝/要求修改/提交联合意见

### CENTRAL_BANK-U0225
08 Reports & Surveillance | Monetary Policy Report、Inflation Decomposition、银行与 FX 预警、预测 | 阅读；发布央行内部结论

### CENTRAL_BANK-U0226
09 Communication | Monetary Policy Statement、Forward Guidance、历史承诺与实现情况 | 发布声明和指引

### CENTRAL_BANK-U0227
10 Transaction & Decision Log | 全部正式交易、审批、参数修改、旧值/新值、actor、timestamp | 只读审计

### CENTRAL_BANK-U0228
7. Policy Interest Rate / 政策利率

### CENTRAL_BANK-U0229
7.1 可操作字段

### CENTRAL_BANK-U0230
字段 | 类型/单位 | 规则

### CENTRAL_BANK-U0231
current_policy_rate | % p.a. | 系统当前正式政策利率

### CENTRAL_BANK-U0232
proposed_policy_rate | % p.a. | 玩家输入精确新利率；Season 1 默认允许 -2.00% 至 20.00%

### CENTRAL_BANK-U0233
change_bp | basis points | 系统自动计算 proposed - current

### CENTRAL_BANK-U0234
effective_time | simulation timestamp | 发布后进入政策生命周期的正式时间

### CENTRAL_BANK-U0235
decision_note | text | 可选内部说明；不改变经济效果

### CENTRAL_BANK-U0236
7.2 发布前必须展示的精确计算

### CENTRAL_BANK-U0237
Expected Inflation

### CENTRAL_BANK-U0238
Real Policy Rate = Proposed Policy Rate - Expected Inflation

### CENTRAL_BANK-U0239
Current Market Short-Term Rate

### CENTRAL_BANK-U0240
Average New Corporate Lending Rate 预估

### CENTRAL_BANK-U0241
Average New Mortgage Rate 预估

### CENTRAL_BANK-U0242
Government Bond Yield 预估变化方向与中央估计

### CENTRAL_BANK-U0243
对银行净息差、信贷需求、汇率需求/供给的模型传导

### CENTRAL_BANK-U0244
7.3 权限

### CENTRAL_BANK-U0245
Central Bank 可独立 Publish Monetary Decision

### CENTRAL_BANK-U0246
Captain 无 Approve / Reject / Edit 权限

### CENTRAL_BANK-U0247
Finance、Industry、Social、Trade 可提出 Coordination Request，但不能修改 proposed_policy_rate

### CENTRAL_BANK-U0248
同一玩家兼任其他 Office 时，发布利率动作仍以 CENTRAL_BANK office context 单独记录

### CENTRAL_BANK-U0249
8. Inflation Target 与货币政策框架

### CENTRAL_BANK-U0250
8.1 完整字段

### CENTRAL_BANK-U0251
字段 | 单位 | 规则

### CENTRAL_BANK-U0252
inflation_target | % | Season 1 默认 1.00%-8.00%

### CENTRAL_BANK-U0253
tolerance_lower | % | 目标下限；必须小于或等于 target

### CENTRAL_BANK-U0254
tolerance_upper | % | 目标上限；必须大于或等于 target

### CENTRAL_BANK-U0255
framework_start_time | simulation timestamp | 新框架正式生效时间

### CENTRAL_BANK-U0256
review_time | simulation timestamp | 系统生成下一次框架复核节点；不自动改变目标

### CENTRAL_BANK-U0257
change_reason | enum | STRUCTURAL_SHIFT / CRISIS_ACCOMMODATION / FRAMEWORK_REFORM / TEMPORARY_TOLERANCE_CHANGE

### CENTRAL_BANK-U0258
8.2 系统自动计算

### CENTRAL_BANK-U0259
Inflation Gap = Current Inflation - Inflation Target

### CENTRAL_BANK-U0260
Expected Inflation Gap = Expected Inflation - Inflation Target

### CENTRAL_BANK-U0261
Target Miss Duration = 连续超出 tolerance band 的模拟时间

### CENTRAL_BANK-U0262
Central Bank Credibility 的目标履约贡献项

### CENTRAL_BANK-U0263
Bond Yield、FX expectation、wage/price setting 的预期传导

### CENTRAL_BANK-U0264
8.3 权限与约束

### CENTRAL_BANK-U0265
目标改变属于 Central Bank 独立制度决策

### CENTRAL_BANK-U0266
Captain 接收通知但不拥有 veto

### CENTRAL_BANK-U0267
Finance 接收 consultation event，以评估债务利息和预算后果

### CENTRAL_BANK-U0268
频繁改变目标由系统降低 Central Bank Credibility；玩家不能直接抵消该惩罚

### CENTRAL_BANK-U0269
9. Open Market Operations / 公开市场操作

### CENTRAL_BANK-U0270
9.1 前端操作仅允许两种交易方向

### CENTRAL_BANK-U0271
BUY_GOVERNMENT_SECURITIES：央行从二级市场买入本国政府证券

### CENTRAL_BANK-U0272
SELL_GOVERNMENT_SECURITIES：央行向二级市场卖出本国政府证券

### CENTRAL_BANK-U0273
9.2 输入字段

### CENTRAL_BANK-U0274
字段 | 单位 | 完整规则

### CENTRAL_BANK-U0275
operation_type | enum | BUY_GOVERNMENT_SECURITIES / SELL_GOVERNMENT_SECURITIES

### CENTRAL_BANK-U0276
face_value | LC | 交易标的票面金额

### CENTRAL_BANK-U0277
transaction_price | LC | 按当期市场价格计算的实际结算金额

### CENTRAL_BANK-U0278
security_id / maturity_bucket | id / days | 用于识别被交易的政府证券批次或期限桶

### CENTRAL_BANK-U0279
settlement_time | simulation timestamp | 完成结算时间

### CENTRAL_BANK-U0280
policy_note | text | 可选说明，不改变会计结果

### CENTRAL_BANK-U0281
9.3 BUY 的会计分录

### CENTRAL_BANK-U0282
Central Bank Government Securities + Settlement Amount / Commercial Bank Reserves + Settlement Amount / Monetary Base + Settlement Amount

### CENTRAL_BANK-U0283
9.4 SELL 的会计分录

### CENTRAL_BANK-U0284
Central Bank Government Securities - Settlement Amount / Commercial Bank Reserves - Settlement Amount / Monetary Base - Settlement Amount

### CENTRAL_BANK-U0285
9.5 硬约束

### CENTRAL_BANK-U0286
SELL 金额不得超过央行实际持有且未受限的 Government Securities

### CENTRAL_BANK-U0287
交易后 Bank Reserves 不得出现负数

### CENTRAL_BANK-U0288
OMO 只能交易二级市场证券；不得通过 OMO 字段直接给 Treasury Account 增加余额

### CENTRAL_BANK-U0289
任何一次 OMO 必须产生 transaction ledger entries 和 world event

### CENTRAL_BANK-U0290
10. Reserve Requirement / 存款准备金制度

### CENTRAL_BANK-U0291
字段 | 单位 | 规则

### CENTRAL_BANK-U0292
reserve_requirement_rate | % | Season 1 默认允许 0.00%-30.00%

### CENTRAL_BANK-U0293
reservable_deposits | LC | 由 Demand Deposits + 被设定为应计准备金的存款类别自动汇总

### CENTRAL_BANK-U0294
required_reserves | LC | Reservable Deposits × Reserve Requirement

### CENTRAL_BANK-U0295
actual_reserves | LC | 商业银行在央行 Reserve Account 的真实余额

### CENTRAL_BANK-U0296
excess_reserves | LC | Actual Reserves - Required Reserves

### CENTRAL_BANK-U0297
reserve_shortfall | LC | max(0, Required Reserves - Actual Reserves)

### CENTRAL_BANK-U0298
Required Reserves = Reservable Deposits × Reserve Requirement / Excess Reserves = Actual Reserves - Required Reserves / Reserve Shortfall = max(0, Required Reserves - Actual Reserves)

### CENTRAL_BANK-U0299
10.1 准备金不足处理

### CENTRAL_BANK-U0300
系统首先记录 Reserve Shortfall 实际金额

### CENTRAL_BANK-U0301
银行可通过市场资金、缩减信贷、出售流动资产或央行合格 facility 补足

### CENTRAL_BANK-U0302
持续短缺影响支付与新增信贷能力；不通过“银行稳定度扣分”代替真实余额约束

### CENTRAL_BANK-U0303
Central Bank 可通过 OMO、常规再融资工具或 ELA 提供不同性质的流动性

### CENTRAL_BANK-U0304
11. 银行资本监管与 Countercyclical Buffer

### CENTRAL_BANK-U0305
11.1 可操作监管参数

### CENTRAL_BANK-U0306
参数 | 单位 | Season 1 默认操作区间

### CENTRAL_BANK-U0307
Base Capital Requirement | % of RWA | 4.00%-20.00%

### CENTRAL_BANK-U0308
Countercyclical Capital Buffer | % of RWA | 0.00%-5.00%

### CENTRAL_BANK-U0309
Total Capital Requirement | % of RWA | 系统自动 = Base + CCyB

### CENTRAL_BANK-U0310
11.2 自动计算

### CENTRAL_BANK-U0311
Total Capital Requirement = Base Capital Requirement + CCyB / Required Capital = Risk-Weighted Assets × Total Capital Requirement / Capital Headroom = Actual Bank Equity - Required Capital / Capital Shortfall = max(0, Required Capital - Actual Bank Equity)

### CENTRAL_BANK-U0312
11.3 资本不足的真实约束

### CENTRAL_BANK-U0313
Capital Shortfall 为正时，银行无法按正常速度扩大风险资产

### CENTRAL_BANK-U0314
银行必须通过 retained earnings、资本注入、减少/出售风险资产或政府批准的 recapitalisation 修复资本缺口

### CENTRAL_BANK-U0315
Capital Shortfall 不得被 ELA 自动修复，因为 ELA 提供流动性而不是资本

### CENTRAL_BANK-U0316
央行可独立调整监管要求，但财政注资必须进入 Bank Resolution / Recapitalisation 联合流程

### CENTRAL_BANK-U0317
12. Targeted Refinancing Facility / 定向再融资工具

### CENTRAL_BANK-U0318
该功能完全替换旧版 Lending Guidance 抽象比例。央行不直接指定“总信贷的 X% 流向某产业”，而是创建一个有额度、利率、期限、合格行业、抵押品和实际使用额的再融资工具。

### CENTRAL_BANK-U0319
12.1 Facility 创建字段

### CENTRAL_BANK-U0320
字段 | 类型/单位 | 规则

### CENTRAL_BANK-U0321
facility_name | text | 工具名称

### CENTRAL_BANK-U0322
eligible_sector | enum | Agriculture & Food / Mining & Resources / Energy & Utilities / Manufacturing / Technology & Semiconductors / Construction & Infrastructure / Trade & Logistics / Services & SMEs / SOE & Public Enterprise

### CENTRAL_BANK-U0323
facility_limit | LC | 最大可提款本金总额

### CENTRAL_BANK-U0324
facility_rate | % p.a. | 商业银行向央行借款的利率

### CENTRAL_BANK-U0325
maximum_maturity_days | simulation days | 单笔再融资最长到期日

### CENTRAL_BANK-U0326
bank_lending_rate_cap | % p.a. or null | 若启用，则接受工具的银行对终端借款人的最高新贷利率

### CENTRAL_BANK-U0327
collateral_type | enum | GOVERNMENT_SECURITIES / ELIGIBLE_CORPORATE_LOANS / MIXED

### CENTRAL_BANK-U0328
haircut | % | 抵押品折扣率

### CENTRAL_BANK-U0329
start_time | timestamp | 工具开放时间

### CENTRAL_BANK-U0330
end_time | timestamp | 停止新增提款时间

### CENTRAL_BANK-U0331
status | enum | DRAFT / OPEN / PAUSED / CLOSED / EXPIRED

### CENTRAL_BANK-U0332
12.2 Facility 实际余额字段

### CENTRAL_BANK-U0333
facility_limit

### CENTRAL_BANK-U0334
approved_drawdown_amount

### CENTRAL_BANK-U0335
utilised_amount

### CENTRAL_BANK-U0336
outstanding_principal

### CENTRAL_BANK-U0337
repaid_principal

### CENTRAL_BANK-U0338
accrued_interest

### CENTRAL_BANK-U0339
collateral_market_value

### CENTRAL_BANK-U0340
collateral_after_haircut

### CENTRAL_BANK-U0341
remaining_capacity

### CENTRAL_BANK-U0342
Remaining Capacity = Facility Limit - Outstanding Principal / Eligible Borrowing Capacity = Collateral Market Value × (1 - Haircut) / Actual Drawdown = min(Requested Amount, Remaining Capacity, Eligible Borrowing Capacity)

### CENTRAL_BANK-U0343
12.3 会计分录

### CENTRAL_BANK-U0344
Central Bank Regular Refinancing Loans + Actual Drawdown / Commercial Bank Reserves + Actual Drawdown / Commercial Bank Central Bank Borrowing + Actual Drawdown

### CENTRAL_BANK-U0345
12.4 还款与违约

### CENTRAL_BANK-U0346
到期按本金 + 应计利息结算

### CENTRAL_BANK-U0347
正常还款减少 CB loan asset、bank reserves、bank CB borrowing

### CENTRAL_BANK-U0348
未足额还款生成 overdue principal 和 default event

### CENTRAL_BANK-U0349
抵押品可按规则实现；最终未覆盖损失进入 Central Bank Accumulated Losses，不允许用抽象惩罚替代

### CENTRAL_BANK-U0350
13. Emergency Liquidity Assistance / 紧急流动性

### CENTRAL_BANK-U0351
13.1 ELA 输入字段

### CENTRAL_BANK-U0352
字段 | 类型/单位 | 规则

### CENTRAL_BANK-U0353
borrower | NATIONAL_BANKING_SECTOR | Season 1 汇总银行体系

### CENTRAL_BANK-U0354
principal | LC | 实际发放金额

### CENTRAL_BANK-U0355
ela_rate | % p.a. | 紧急流动性利率

### CENTRAL_BANK-U0356
maturity_days | simulation days | 到期期限

### CENTRAL_BANK-U0357
collateral_type | enum | GOVERNMENT_SECURITIES / HIGH_QUALITY_LOANS / MIXED

### CENTRAL_BANK-U0358
collateral_market_value | LC | 抵押物市场价值

### CENTRAL_BANK-U0359
haircut | % | 抵押折扣

### CENTRAL_BANK-U0360
maximum_loan_from_collateral | LC | Collateral Market Value × (1-Haircut)

### CENTRAL_BANK-U0361
start_time | timestamp | 发放时间

### CENTRAL_BANK-U0362
maturity_time | timestamp | 到期时间

### CENTRAL_BANK-U0363
status | enum | ACTIVE / REPAID / OVERDUE / DEFAULTED / RESOLVED

### CENTRAL_BANK-U0364
13.2 会计分录

### CENTRAL_BANK-U0365
Central Bank Emergency Liquidity Loans + Principal / Commercial Bank Reserves + Principal / Commercial Bank Central Bank Borrowing + Principal

### CENTRAL_BANK-U0366
13.3 Liquidity 与 Solvency 的强制区分

### CENTRAL_BANK-U0367
情形 | 判定基础 | ELA 处理

### CENTRAL_BANK-U0368
Liquidity Shortage | Reserve/Liquid Asset Shortfall > 0 且 Bank Equity >= Required Capital | 可通过 ELA 解决短期支付缺口

### CENTRAL_BANK-U0369
Capital/Solvency Shortage | Bank Equity < Required Capital，或预计贷款损失使 Equity 为负 | ELA 不能修复资本缺口；只能在联合 Bank Resolution 前临时维持支付

### CENTRAL_BANK-U0370
Both | 同时存在 liquidity shortfall 与 capital shortfall | ELA 只处理 liquidity 部分；资本必须通过 recapitalisation / resolution 处理

### CENTRAL_BANK-U0371
14. 外汇市场、汇率与官方外汇储备

### CENTRAL_BANK-U0372
14.1 汇率与结算单位

### CENTRAL_BANK-U0373
字段 | 定义

### CENTRAL_BANK-U0374
fx_rate_gcu_lc | 1 GCU = X Local Currency 的实时汇率

### CENTRAL_BANK-U0375
fx_rate_lc_gcu | 1 Local Currency = Y GCU；由 reciprocal 自动计算

### CENTRAL_BANK-U0376
spot_timestamp | 当前汇率对应模拟时间

### CENTRAL_BANK-U0377
fx_market_net_demand | 一个结算周期内 GCU 净需求金额

### CENTRAL_BANK-U0378
fx_market_net_supply | 一个结算周期内 GCU 净供给金额

### CENTRAL_BANK-U0379
14.2 FX 市场全部流量来源

### CENTRAL_BANK-U0380
GCU Demand / 本币卖出来源 | GCU Supply / 本币买入来源

### CENTRAL_BANK-U0381
Goods Imports | Goods Exports

### CENTRAL_BANK-U0382
Services Imports | Services Exports

### CENTRAL_BANK-U0383
External Interest & Dividend Payments | External Interest & Dividend Receipts

### CENTRAL_BANK-U0384
Private External Debt Repayment | Private External Borrowing

### CENTRAL_BANK-U0385
Sovereign External Debt Service | Sovereign External Borrowing

### CENTRAL_BANK-U0386
FDI Outflow | FDI Inflow

### CENTRAL_BANK-U0387
Portfolio Outflow | Portfolio Inflow

### CENTRAL_BANK-U0388
Resident Capital Outflow | Resident Capital Repatriation / Inflow

### CENTRAL_BANK-U0389
Official Import Payment | Official Export / Foreign Aid Receipt

### CENTRAL_BANK-U0390
Reserve Accumulation by Central Bank | Reserve Sale / FX Intervention by Central Bank

### CENTRAL_BANK-U0391
Swap Repayment Outflow | Swap Drawdown Inflow

### CENTRAL_BANK-U0392
14.3 官方外汇储备构成

### CENTRAL_BANK-U0393
储备科目 | 是否计入 Gross | 是否默认计入 Usable

### CENTRAL_BANK-U0394
GCU Cash & Deposits | Yes | Yes

### CENTRAL_BANK-U0395
Foreign Reserve Securities | Yes | Yes，扣除锁定/抵押部分

### CENTRAL_BANK-U0396
Reserve Swap Receivables | Yes | 按可立即动用条款决定

### CENTRAL_BANK-U0397
Gold / Other Enabled Reserve Assets | Yes | 按流动性与系统配置决定

### CENTRAL_BANK-U0398
Committed Reserves | Gross 的子集 | No，已对官方付款/担保/到期义务承诺

### CENTRAL_BANK-U0399
Pledged / Encumbered Reserves | Gross 的子集 | No

### CENTRAL_BANK-U0400
Usable Reserves = Gross Reserves - Committed Reserves - Encumbered Reserves / Import Cover (months) = Usable Reserves / Average Monthly GCU Import Payments

### CENTRAL_BANK-U0401
14.4 不允许的处理

### CENTRAL_BANK-U0402
私人企业普通进口不得直接扣减 Central Bank Gross Reserves

### CENTRAL_BANK-U0403
普通跨境支付通过 FX market 改变 GCU demand/supply 和汇率

### CENTRAL_BANK-U0404
只有 Central Bank FX Intervention、官方储备付款、Reserve Swap、外储资产交易和经批准的政府官方支付才直接改变官方储备余额

### CENTRAL_BANK-U0405
15. FX Intervention 与 Sterilisation

### CENTRAL_BANK-U0406
15.1 允许的两种干预交易

### CENTRAL_BANK-U0407
操作 | 央行交易 | 直接账户变化

### CENTRAL_BANK-U0408
SUPPORT_LOCAL_CURRENCY | Sell GCU / Buy Local Currency | FX Reserves 减少；Bank Reserves / Monetary Base 按结算本币金额减少

### CENTRAL_BANK-U0409
ACCUMULATE_RESERVES_OR_WEAKEN_LOCAL | Buy GCU / Sell Local Currency | FX Reserves 增加；Bank Reserves / Monetary Base 按结算本币金额增加

### CENTRAL_BANK-U0410
15.2 输入字段

### CENTRAL_BANK-U0411
字段 | 单位 | 规则

### CENTRAL_BANK-U0412
direction | enum | SELL_GCU_BUY_LC / BUY_GCU_SELL_LC

### CENTRAL_BANK-U0413
gcu_amount | GCU | 精确交易金额

### CENTRAL_BANK-U0414
execution_fx_rate | LC/GCU | 实际成交或系统结算汇率

### CENTRAL_BANK-U0415
lc_settlement_amount | LC | GCU Amount × Execution FX Rate

### CENTRAL_BANK-U0416
sterilisation_choice | boolean | 是否在同一政策包中创建冲销操作

### CENTRAL_BANK-U0417
sterilisation_amount | LC | 默认等于 liquidity impact；允许低于但不得高于被冲销的本币流动性影响

### CENTRAL_BANK-U0418
15.3 Support Local Currency 分录

### CENTRAL_BANK-U0419
FX Reserve Assets - GCU Amount / Bank Reserves - LC Settlement Amount / Monetary Base - LC Settlement Amount

### CENTRAL_BANK-U0420
15.4 Buy GCU 分录

### CENTRAL_BANK-U0421
FX Reserve Assets + GCU Amount / Bank Reserves + LC Settlement Amount / Monetary Base + LC Settlement Amount

### CENTRAL_BANK-U0422
15.5 Sterilisation

### CENTRAL_BANK-U0423
当 Sell GCU 导致 Bank Reserves 减少时，冲销通过 OMO BUY 注入等额或部分本币准备金

### CENTRAL_BANK-U0424
当 Buy GCU 导致 Bank Reserves 增加时，冲销通过 OMO SELL 或 CB Bills 吸收等额或部分本币准备金

### CENTRAL_BANK-U0425
冲销交易必须独立记账，并与原 FX transaction 通过 policy_package_id 关联

### CENTRAL_BANK-U0426
若央行没有足够可出售证券/票据工具，系统不得假设冲销一定可以完成

### CENTRAL_BANK-U0427
16. Official FX Allocation Request / 官方外汇使用审批

### CENTRAL_BANK-U0428
Trade、Finance、Industry 在需要直接动用官方外汇储备时，不拥有直接扣款权限。它们必须提交 Official FX Allocation Request。

### CENTRAL_BANK-U0429
16.1 Request 全部字段

### CENTRAL_BANK-U0430
字段 | 类型/单位 | 规则

### CENTRAL_BANK-U0431
requesting_office | office_id | TRADE / FINANCE / INDUSTRY

### CENTRAL_BANK-U0432
purpose_category | enum | CRITICAL_IMPORT / SOVEREIGN_DEBT_SERVICE / STRATEGIC_PROJECT_IMPORT / EMERGENCY_FOOD / EMERGENCY_ENERGY / GOVERNMENT_CONTRACT / OTHER_APPROVED_OFFICIAL_PURPOSE

### CENTRAL_BANK-U0433
requested_gcu_amount | GCU | 申请金额

### CENTRAL_BANK-U0434
required_payment_time | timestamp | 最晚付款时间

### CENTRAL_BANK-U0435
counterparty | country/entity id | 收款对象

### CENTRAL_BANK-U0436
contract_or_obligation_id | id | 对应合同、债务或项目义务

### CENTRAL_BANK-U0437
current_usable_reserves | GCU | 系统自动

### CENTRAL_BANK-U0438
post_payment_usable_reserves | GCU | 系统自动

### CENTRAL_BANK-U0439
current_import_cover | months | 系统自动

### CENTRAL_BANK-U0440
post_payment_import_cover | months | 系统自动

### CENTRAL_BANK-U0441
decision | enum | PENDING / APPROVED_FULL / APPROVED_PARTIAL / REJECTED / REVISION_REQUESTED

### CENTRAL_BANK-U0442
approved_gcu_amount | GCU | Central Bank 决定的实际金额

### CENTRAL_BANK-U0443
16.2 Central Bank 可执行动作

### CENTRAL_BANK-U0444
Approve Full：批准 requested_gcu_amount

### CENTRAL_BANK-U0445
Approve Partial：输入 approved_gcu_amount，金额必须大于 0 且小于 requested amount

### CENTRAL_BANK-U0446
Reject：不产生外储交易

### CENTRAL_BANK-U0447
Request Revision：要求改变金额、支付时间、结算货币、合同条款或融资方式

### CENTRAL_BANK-U0448
Approve with Condition：仅允许在系统定义的替代结算/融资条件完成后自动执行

### CENTRAL_BANK-U0449
16.3 批准后

### CENTRAL_BANK-U0450
系统在付款时创建官方储备减少交易

### CENTRAL_BANK-U0451
对应 Treasury/Project/Contract obligation 标记为 paid 或 partially paid

### CENTRAL_BANK-U0452
Gross/Usable Reserves、Import Cover、相关外汇现金流和交易日志自动更新

### CENTRAL_BANK-U0453
审批本身不等于立即付款；必须区分 approved amount 与 executed payment amount

### CENTRAL_BANK-U0454
17. Reserve Swap / 储备互换

### CENTRAL_BANK-U0455
17.1 完整合约字段

### CENTRAL_BANK-U0456
字段 | 类型/单位 | 规则

### CENTRAL_BANK-U0457
counterparty_country | country_id | 对手国家

### CENTRAL_BANK-U0458
principal_gcu_or_currency | currency + amount | 双方交换本金金额

### CENTRAL_BANK-U0459
spot_exchange_rate | rate | 起始交换汇率

### CENTRAL_BANK-U0460
maturity_days | days | 到期日

### CENTRAL_BANK-U0461
interest_rate_leg_a | % | A 方应付利率

### CENTRAL_BANK-U0462
interest_rate_leg_b | % | B 方应付利率

### CENTRAL_BANK-U0463
repayment_exchange_rate_rule | enum | ORIGINAL_RATE / MARKET_RATE / CONTRACT_FIXED_RATE

### CENTRAL_BANK-U0464
collateral | optional | 合同允许时的抵押/担保

### CENTRAL_BANK-U0465
early_termination_rule | enum/text | 提前终止规则

### CENTRAL_BANK-U0466
status | enum | DRAFT / NEGOTIATING / APPROVED / ACTIVE / MATURED / DEFAULTED / TERMINATED

### CENTRAL_BANK-U0467
17.2 分工

### CENTRAL_BANK-U0468
Office | 权限

### CENTRAL_BANK-U0469
Trade | 寻找对手方、谈判政治/贸易条件、发送与接收 counteroffer

### CENTRAL_BANK-U0470
Central Bank | 确定货币、金额、期限、利率、结算汇率规则、资产负债表与储备可持续性，并拥有金融条款批准权

### CENTRAL_BANK-U0471
Captain | 战略合作最终批准；可拒绝国家级互换关系

### CENTRAL_BANK-U0472
17.3 账务

### CENTRAL_BANK-U0473
收到 GCU 的一方增加 FX Reserve Asset，同时产生 Swap Payable

### CENTRAL_BANK-U0474
提供 GCU 的一方减少可用 GCU 资产或形成 Swap Receivable，具体取决于双方交换资产结构

### CENTRAL_BANK-U0475
到期按合同规则结算本金与利息

### CENTRAL_BANK-U0476
违约产生应收损失、储备变化、信誉与国际合同状态变化

### CENTRAL_BANK-U0477
18. Treasury Account 与财政-货币接口

### CENTRAL_BANK-U0478
18.1 Treasury Account

### CENTRAL_BANK-U0479
字段 | 定义

### CENTRAL_BANK-U0480
treasury_account_balance | 政府存于央行的本币余额

### CENTRAL_BANK-U0481
tax_receipts_to_treasury | 本周期进入 Treasury Account 的税收与政府收入

### CENTRAL_BANK-U0482
bond_proceeds_to_treasury | 政府债券发行实际结算后进入 Treasury 的资金

### CENTRAL_BANK-U0483
government_payments_from_treasury | 本周期财政支出实际支付

### CENTRAL_BANK-U0484
external_official_payments | 经官方外储审批执行的外币付款

### CENTRAL_BANK-U0485
interest_payment | 政府对债务利息的实际支付

### CENTRAL_BANK-U0486
18.2 政府收税与支出对银行准备金的对应关系

### CENTRAL_BANK-U0487
税收从私人银行账户支付至 Treasury：私人 Deposits 减少、Bank Reserves 减少、Treasury Account 增加

### CENTRAL_BANK-U0488
政府从 Treasury 向居民/企业支付：Treasury Account 减少、Bank Reserves 增加、私人 Deposits 增加

### CENTRAL_BANK-U0489
央行仅负责结算和账户记录，不决定税率或支出用途

### CENTRAL_BANK-U0490
18.3 政府债券发行

### CENTRAL_BANK-U0491
Finance 决定发行规模、期限和财政用途

### CENTRAL_BANK-U0492
市场购买债券后资金进入 Treasury Account

### CENTRAL_BANK-U0493
若由商业银行购买，Bank Reserves/Deposits 根据购买者结算路径变化

### CENTRAL_BANK-U0494
央行不得通过普通 OMO 在一级发行时自动承购新债

### CENTRAL_BANK-U0495
18.4 Direct Monetary Financing

### CENTRAL_BANK-U0496
项目 | 规则

### CENTRAL_BANK-U0497
发起 | Finance 发起，必须 Central Bank + Captain 同意

### CENTRAL_BANK-U0498
本金 | 精确 LC amount

### CENTRAL_BANK-U0499
利率 | 精确 % p.a.

### CENTRAL_BANK-U0500
期限 | simulation days

### CENTRAL_BANK-U0501
资产端 | Central Bank Monetary Financing Claims 增加

### CENTRAL_BANK-U0502
负债端 | Treasury Account 增加

### CENTRAL_BANK-U0503
宏观传导 | Monetary Base 在 Treasury 后续支出时进入银行储备/公众存款；系统同时更新通胀预期、汇率与央行信誉机制

### CENTRAL_BANK-U0504
19. 资本流动、外债与金融制裁

### CENTRAL_BANK-U0505
19.1 资本流动全部记录类别

### CENTRAL_BANK-U0506
FDI Inflow / FDI Outflow

### CENTRAL_BANK-U0507
Portfolio Inflow / Portfolio Outflow

### CENTRAL_BANK-U0508
Private External Borrowing / Repayment

### CENTRAL_BANK-U0509
Sovereign External Borrowing / Debt Service

### CENTRAL_BANK-U0510
Resident Capital Inflow / Outflow

### CENTRAL_BANK-U0511
Bank Foreign Borrowing / Repayment

### CENTRAL_BANK-U0512
Official Reserve Transactions

### CENTRAL_BANK-U0513
Reserve Swap Drawdown / Repayment

### CENTRAL_BANK-U0514
19.2 Central Bank 看到的精确资本账户视图

### CENTRAL_BANK-U0515
Gross Capital Inflow by category

### CENTRAL_BANK-U0516
Gross Capital Outflow by category

### CENTRAL_BANK-U0517
Net Capital Flow

### CENTRAL_BANK-U0518
Bank Foreign Currency Assets

### CENTRAL_BANK-U0519
Bank Foreign Currency Liabilities

### CENTRAL_BANK-U0520
Government External Debt Principal Outstanding

### CENTRAL_BANK-U0521
Next 30 simulation days External Debt Service

### CENTRAL_BANK-U0522
FX mismatch = Foreign Currency Liabilities - Foreign Currency Assets by sector

### CENTRAL_BANK-U0523
19.3 Capital Controls

### CENTRAL_BANK-U0524
控制对象 | 可设置的精确/离散参数

### CENTRAL_BANK-U0525
Resident Outflow | allowed_amount_per_period / blocked transaction categories / start_time / end_time

### CENTRAL_BANK-U0526
Portfolio Outflow | maximum transfer amount / approval requirement / applicable securities

### CENTRAL_BANK-U0527
Bank FX Transfer | maximum transfer / reserve retention requirement

### CENTRAL_BANK-U0528
Corporate External Payment | approval threshold amount / allowed purpose categories

### CENTRAL_BANK-U0529
FDI Repatriation | repatriation cap / waiting period

### CENTRAL_BANK-U0530
Capital Controls 不使用 0-100 强度。Trade 负责跨境制度与交易限制配置，Central Bank 负责金融阈值、外汇结算与银行执行，Captain 负责政治/制度层最终批准。

### CENTRAL_BANK-U0531
19.4 Financial Sanctions

### CENTRAL_BANK-U0532
冻结目标国家/实体在本国金融体系的指定余额

### CENTRAL_BANK-U0533
禁止指定 currency/payment channel 结算

### CENTRAL_BANK-U0534
阻止指定金融合同新增执行

### CENTRAL_BANK-U0535
保留既有到期义务是否 grandfathered 的明确开关

### CENTRAL_BANK-U0536
记录被阻止的实际支付金额、未结算义务与报复风险；不使用 sanction intensity 0-100 作为底层金融执行

### CENTRAL_BANK-U0537
20. 金融危机、银行处置与债务危机

### CENTRAL_BANK-U0538
20.1 系统只用真实缺口触发金融危机状态

### CENTRAL_BANK-U0539
Liquidity Shortfall = max(0, Required Liquidity - Available Liquidity) / Capital Shortfall = max(0, Required Capital - Actual Bank Equity) / Reserve Funding Gap = max(0, Scheduled Official FX Payments - Usable Reserves Available for Official Use)

### CENTRAL_BANK-U0540
20.2 银行流动性危机

### CENTRAL_BANK-U0541
触发基础：Reserve Shortfall、支付义务、存款流出、可变现资产不足

### CENTRAL_BANK-U0542
可用工具：OMO、Targeted Refinancing Facility、ELA、临时结算安排

### CENTRAL_BANK-U0543
所有工具均以精确金额注入，并进入央行/银行资产负债表

### CENTRAL_BANK-U0544
20.3 银行偿付能力危机

### CENTRAL_BANK-U0545
触发基础：Actual Bank Equity < Required Capital 或预期已确认损失使 Equity < 0

### CENTRAL_BANK-U0546
Central Bank 提交 Bank Resolution Proposal，必须包含 capital shortfall 金额、liquidity shortfall、NPL、RWA、所需财政资本注入、债权人损失方案

### CENTRAL_BANK-U0547
需要 Central Bank + Finance + Captain 批准

### CENTRAL_BANK-U0548
处置选项固定为：RECAPITALISE / BAIL_IN_ELIGIBLE_CREDITORS / ASSET_TRANSFER / TEMPORARY_PUBLIC_OWNERSHIP / ORDERLY_WIND_DOWN / MIXED_RESOLUTION

### CENTRAL_BANK-U0549
每一种处置必须产生对应资产、负债、资本、政府账户和债务变化

### CENTRAL_BANK-U0550
20.4 Sovereign Debt Crisis

### CENTRAL_BANK-U0551
Finance 提供债务到期、财政收入、primary balance、市场融资需求

### CENTRAL_BANK-U0552
Central Bank 提供银行持债金额、市场流动性、债券收益率、外币债务与外储压力

### CENTRAL_BANK-U0553
Debt Restructuring 必须明确 principal haircut、coupon change、maturity extension、currency conversion、eligible debt amount

### CENTRAL_BANK-U0554
重组后银行政府债券资产按条款重新估值，损失直接进入 bank equity；不得只扣“银行信心”

### CENTRAL_BANK-U0555
21. Monetary Policy Statement 与 Forward Guidance

### CENTRAL_BANK-U0556
21.1 Monetary Policy Statement 固定字段

### CENTRAL_BANK-U0557
字段 | 允许值/规则

### CENTRAL_BANK-U0558
decision_reference | 关联具体利率/OMO/框架决策 id

### CENTRAL_BANK-U0559
policy_assessment | INFLATION_RISK / GROWTH_RISK / BALANCED_RISKS / FINANCIAL_STABILITY_RISK / FX_RISK

### CENTRAL_BANK-U0560
stance_language | DOVISH / BALANCED / HAWKISH

### CENTRAL_BANK-U0561
main_rationale | 由系统数据选择或短文本

### CENTRAL_BANK-U0562
inflation_view | ABOVE_TARGET / NEAR_TARGET / BELOW_TARGET

### CENTRAL_BANK-U0563
growth_view | ABOVE_POTENTIAL / NEAR_POTENTIAL / BELOW_POTENTIAL

### CENTRAL_BANK-U0564
financial_view | STABLE / LIQUIDITY_STRESS / CAPITAL_STRESS / SYSTEMIC_STRESS

### CENTRAL_BANK-U0565
publication_time | simulation timestamp

### CENTRAL_BANK-U0566
21.2 Forward Guidance 允许选项

### CENTRAL_BANK-U0567
NO_GUIDANCE

### CENTRAL_BANK-U0568
DATA_DEPENDENT

### CENTRAL_BANK-U0569
INFLATION_DEPENDENT

### CENTRAL_BANK-U0570
GROWTH_DEPENDENT

### CENTRAL_BANK-U0571
EXPECT_FURTHER_TIGHTENING

### CENTRAL_BANK-U0572
EXPECT_HOLD

### CENTRAL_BANK-U0573
EXPECT_EASING_IF_CONDITIONS_MET

### CENTRAL_BANK-U0574
EMERGENCY_TEMPORARY_MEASURES

### CENTRAL_BANK-U0575
21.3 Central Bank Credibility 的数据来源

### CENTRAL_BANK-U0576
Inflation target fulfilment history

### CENTRAL_BANK-U0577
Target change frequency

### CENTRAL_BANK-U0578
Forward guidance consistency with subsequent actions

### CENTRAL_BANK-U0579
Emergency facility repayment / loss outcomes

### CENTRAL_BANK-U0580
Unsterilised monetary financing exposure

### CENTRAL_BANK-U0581
Repeated failed FX defence with reserve depletion

### CENTRAL_BANK-U0582
Accuracy of explicit numerical commitments if the statement includes a target range

### CENTRAL_BANK-U0583
Central Bank Credibility 允许作为系统派生评分/状态，但玩家不能直接设置。底层必须保存上述可核查事件与数值。

### CENTRAL_BANK-U0584
22. 央行信息优势、报告与预警

### CENTRAL_BANK-U0585
22.1 Central Bank 专属数据

### CENTRAL_BANK-U0586
完整央行资产负债表科目

### CENTRAL_BANK-U0587
完整商业银行汇总资产负债表

### CENTRAL_BANK-U0588
分行业信贷余额、新增贷款、还款、NPL 与平均利率

### CENTRAL_BANK-U0589
Bank Capital、RWA、Capital Requirement、Capital Shortfall

### CENTRAL_BANK-U0590
Bank Reserve Account、Required Reserves、Excess/Shortfall

### CENTRAL_BANK-U0591
外币资产与外币负债、FX mismatch

### CENTRAL_BANK-U0592
全部资本流动分类与金额

### CENTRAL_BANK-U0593
官方储备组成、Committed/Encumbered/Usable Reserves

### CENTRAL_BANK-U0594
未来 30 simulation days sovereign FX debt service

### CENTRAL_BANK-U0595
全部 CB facilities utilisation、collateral 与到期表

### CENTRAL_BANK-U0596
22.2 Captain 与其他 Office 只能看到的摘要

### CENTRAL_BANK-U0597
Monetary Policy Rate / Inflation / Inflation Target

### CENTRAL_BANK-U0598
Gross Reserves / Usable Reserves / Import Cover

### CENTRAL_BANK-U0599
总银行信贷与信贷增长

### CENTRAL_BANK-U0600
是否存在 Capital Shortfall / Liquidity Shortfall 以及缺口总金额

### CENTRAL_BANK-U0601
金融危机是否需要跨 Office 决策

### CENTRAL_BANK-U0602
不向其他 Office 默认公开单项银行敏感明细和所有央行内部 facility 参数，除非其为联合决策所必需

### CENTRAL_BANK-U0603
22.3 Monetary Policy Report 固定章节

### CENTRAL_BANK-U0604
Price Developments

### CENTRAL_BANK-U0605
Inflation Decomposition

### CENTRAL_BANK-U0606
Inflation Expectations

### CENTRAL_BANK-U0607
Real Economy & Output Gap

### CENTRAL_BANK-U0608
Labour Market

### CENTRAL_BANK-U0609
Credit & Monetary Aggregates

### CENTRAL_BANK-U0610
Banking Capital & Liquidity

### CENTRAL_BANK-U0611
Foreign Exchange & Capital Flows

### CENTRAL_BANK-U0612
Official Reserves

### CENTRAL_BANK-U0613
Government Bond Market

### CENTRAL_BANK-U0614
Baseline Forecast

### CENTRAL_BANK-U0615
Risk Scenarios

### CENTRAL_BANK-U0616
Policy Actions Since Last Report

### CENTRAL_BANK-U0617
Outstanding Facilities & Maturities

### CENTRAL_BANK-U0618
Required Cabinet Coordination Items

### CENTRAL_BANK-U0619
22.4 Inflation Decomposition 固定贡献项

### CENTRAL_BANK-U0620
Energy Prices

### CENTRAL_BANK-U0621
Food Prices

### CENTRAL_BANK-U0622
Imported Goods / Exchange Rate Pass-through

### CENTRAL_BANK-U0623
Domestic Demand

### CENTRAL_BANK-U0624
Wage / Labour Cost

### CENTRAL_BANK-U0625
Housing / Rent

### CENTRAL_BANK-U0626
Tax & Administered Price Changes

### CENTRAL_BANK-U0627
Supply-chain / Commodity Input Costs

### CENTRAL_BANK-U0628
Other Residual

### CENTRAL_BANK-U0629
每一项以 percentage-point contribution 显示，所有贡献项之和必须与系统通胀率变化一致或在定义的 residual 中完全对账。

### CENTRAL_BANK-U0630
23. Shared Policies 与跨 Office 审批矩阵

### CENTRAL_BANK-U0631
事项 | 可发起者 | 必要参与 | 最终规则

### CENTRAL_BANK-U0632
Official Reserve Payment | Trade / Finance / Industry | Central Bank；达到战略阈值时 Captain | Central Bank 可 Full/Partial/Reject

### CENTRAL_BANK-U0633
Reserve Swap | Trade | Central Bank + Captain | CB 对金融条款拥有必要批准权

### CENTRAL_BANK-U0634
Capital Controls | Trade / Central Bank | Trade + Central Bank + Captain | 三方均必须批准

### CENTRAL_BANK-U0635
Debt Restructuring | Finance | Finance + Central Bank + Captain | 三方均必须批准

### CENTRAL_BANK-U0636
Bank Resolution | Central Bank | Central Bank + Finance + Captain | 财政介入时三方均必须批准

### CENTRAL_BANK-U0637
Direct Monetary Financing | Finance | Finance + Central Bank + Captain | Central Bank 可独立拒绝

### CENTRAL_BANK-U0638
Sovereign FX Emergency | Finance / Trade | Central Bank + Finance + Trade + Captain | 按付款、融资、控制措施拆分执行

### CENTRAL_BANK-U0639
Financial Sanctions | Trade / Captain | Trade + Central Bank + Captain | CB 负责金融执行参数

### CENTRAL_BANK-U0640
Sector Refinancing Request | Industry / Finance | Central Bank | 请求方无强制通过权

### CENTRAL_BANK-U0641
Fiscal-Monetary Coordination Meeting | Captain / Finance / Central Bank | Finance + Central Bank；Captain 可参加 | 会议无自动政策效果

### CENTRAL_BANK-U0642
23.1 央行独立性硬规则

### CENTRAL_BANK-U0643
Policy Rate 不进入 Captain approval

### CENTRAL_BANK-U0644
Reserve Requirement 不进入 Finance approval

### CENTRAL_BANK-U0645
OMO 不进入政府预算审批

### CENTRAL_BANK-U0646
Base Capital Requirement / CCyB 不进入 Industry 或 Finance approval

### CENTRAL_BANK-U0647
Targeted Refinancing Facility 的创建由 Central Bank 独立决定；其他 Office 只能 request

### CENTRAL_BANK-U0648
只有涉及财政损失、主权承诺、官方外储支出或跨境制度限制时才触发联合审批

### CENTRAL_BANK-U0649
24. 交易账本、计算顺序与数据一致性

### CENTRAL_BANK-U0650
24.1 每个正式状态变化必须创建 Transaction Ledger

### CENTRAL_BANK-U0651
字段 | 必须保存内容

### CENTRAL_BANK-U0652
transaction_id | 全局唯一 ID

### CENTRAL_BANK-U0653
simulation_timestamp | 正式生效时间

### CENTRAL_BANK-U0654
country_id | 所属国家

### CENTRAL_BANK-U0655
office_context | CENTRAL_BANK 或联合 action context

### CENTRAL_BANK-U0656
actor_user_id | 实际操作玩家

### CENTRAL_BANK-U0657
transaction_type | OMO_BUY / OMO_SELL / FX_BUY / FX_SELL / ELA_DRAW / ELA_REPAY / REFINANCING_DRAW / REFINANCING_REPAY / SWAP_DRAW / SWAP_REPAY / TREASURY_SETTLEMENT / MONETARY_FINANCING / OTHER_DEFINED_TYPE

### CENTRAL_BANK-U0658
debit_account | 被借记账户

### CENTRAL_BANK-U0659
credit_account | 被贷记账户

### CENTRAL_BANK-U0660
amount | 精确金额

### CENTRAL_BANK-U0661
currency | LC / GCU

### CENTRAL_BANK-U0662
linked_policy_id | 对应政策

### CENTRAL_BANK-U0663
linked_contract_id | 对应合同/工具

### CENTRAL_BANK-U0664
approval_record_ids | 跨 Office 审批记录

### CENTRAL_BANK-U0665
pre_balance | 交易前余额

### CENTRAL_BANK-U0666
post_balance | 交易后余额

### CENTRAL_BANK-U0667
status | PENDING / POSTED / REVERSED / FAILED

### CENTRAL_BANK-U0668
24.2 计算顺序

### CENTRAL_BANK-U0669
验证玩家 CENTRAL_BANK 权限与联合审批条件。

### CENTRAL_BANK-U0670
验证账户余额、证券持仓、抵押品、facility capacity、外储可用额和所有硬约束。

### CENTRAL_BANK-U0671
计算交易金额、汇率结算、本金、利息、haircut 和到期。

### CENTRAL_BANK-U0672
生成平衡的 debit/credit entries。

### CENTRAL_BANK-U0673
提交账本并更新央行/银行/财政/外汇相关账户余额。

### CENTRAL_BANK-U0674
重新计算 MB、M1、M2、Required Reserves、Capital Requirement、NPL Ratio、Import Cover、FX exposures 等派生量。

### CENTRAL_BANK-U0675
触发经济传导模型：利率、信贷、投资、消费、汇率、进口价格、通胀、产出等。

### CENTRAL_BANK-U0676
创建 policy/world event 与审计日志。

### CENTRAL_BANK-U0677
向受影响 Office 推送必要通知。

### CENTRAL_BANK-U0678
24.3 时间累计项目

### CENTRAL_BANK-U0679
Loan interest accrual

### CENTRAL_BANK-U0680
Bond coupon accrual

### CENTRAL_BANK-U0681
Swap interest accrual

### CENTRAL_BANK-U0682
External debt interest accrual

### CENTRAL_BANK-U0683
Facility maturity countdown

### CENTRAL_BANK-U0684
NPL provisioning/loss recognition

### CENTRAL_BANK-U0685
Foreign asset valuation

### CENTRAL_BANK-U0686
FX revaluation of foreign-currency balance sheet items

### CENTRAL_BANK-U0687
利息统一按 Season 1 年化规则计算：Accrued Interest = Principal × Annual Rate × Simulation Days / 365。若后续整个经济引擎采用其他 day-count convention，应全系统统一修改，不允许不同工具各自使用不同算法。

### CENTRAL_BANK-U0688
25. 玩家权限、兼任、审计日志与通知

### CENTRAL_BANK-U0689
25.1 Office-based Permission

### CENTRAL_BANK-U0690
用户权限来自 RoleAssignment(CENTRAL_BANK)，不来自组合角色字符串

### CENTRAL_BANK-U0691
用户可同时持有多个 Office，但每次操作必须选择明确 office_context

### CENTRAL_BANK-U0692
同一用户兼任 Finance + Central Bank 时，联合事项必须分别创建 FINANCE approval record 与 CENTRAL_BANK approval record

### CENTRAL_BANK-U0693
不得因为同一玩家兼任而跳过跨 Office 工作流

### CENTRAL_BANK-U0694
25.2 Central Bank 通知全部类别

### CENTRAL_BANK-U0695
MONETARY_DATA_ALERT：通胀/预期通胀显著偏离目标

### CENTRAL_BANK-U0696
RESERVE_SHORTFALL_ALERT：银行准备金不足

### CENTRAL_BANK-U0697
CAPITAL_SHORTFALL_ALERT：银行资本不足

### CENTRAL_BANK-U0698
FX_RESERVE_ALERT：Usable Reserves 或 Import Cover 下降

### CENTRAL_BANK-U0699
FX_ALLOCATION_REQUEST：其他 Office 申请官方外汇

### CENTRAL_BANK-U0700
SWAP_PROPOSAL：储备互换谈判进入央行审批

### CENTRAL_BANK-U0701
DEBT_RESTRUCTURING_REQUEST

### CENTRAL_BANK-U0702
BANK_RESOLUTION_REQUIRED

### CENTRAL_BANK-U0703
ELA_MATURITY_ALERT

### CENTRAL_BANK-U0704
REFINANCING_MATURITY_ALERT

### CENTRAL_BANK-U0705
SWAP_MATURITY_ALERT

### CENTRAL_BANK-U0706
CAPITAL_FLOW_ALERT：大额净流出/流入

### CENTRAL_BANK-U0707
GOVERNMENT_BOND_MARKET_ALERT

### CENTRAL_BANK-U0708
FORWARD_GUIDANCE_COMMITMENT_ALERT

### CENTRAL_BANK-U0709
SHARED_POLICY_APPROVAL_REQUIRED

### CENTRAL_BANK-U0710
25.3 Decision Log 固定记录

### CENTRAL_BANK-U0711
旧值与新值

### CENTRAL_BANK-U0712
精确金额/利率/期限/汇率

### CENTRAL_BANK-U0713
操作者

### CENTRAL_BANK-U0714
Office context

### CENTRAL_BANK-U0715
发布时间

### CENTRAL_BANK-U0716
所需审批与实际审批

### CENTRAL_BANK-U0717
系统预测

### CENTRAL_BANK-U0718
实际到账/结算金额

### CENTRAL_BANK-U0719
到期/还款结果

### CENTRAL_BANK-U0720
任何 reversal / cancellation / default

### CENTRAL_BANK-U0721
对 Central Bank Credibility 的事件记录

### CENTRAL_BANK-U0722
26. Central Bank Score 与国家护栏

### CENTRAL_BANK-U0723
评分用于比较角色表现，但所有评分都必须从真实经济结果与已记录操作派生，不允许玩家直接操作评分变量。

### CENTRAL_BANK-U0724
Central Bank Score = 30% Price Stability + 20% Financial Stability + 15% FX & Reserve Sustainability + 15% Central Bank Credibility + 10% Credit Stability + 10% Crisis Management

### CENTRAL_BANK-U0725
26.1 各子项必须使用真实指标

### CENTRAL_BANK-U0726
子项 | 底层真实指标

### CENTRAL_BANK-U0727
Price Stability | Inflation 与 Inflation Target 的距离、超出 tolerance band 的持续时间、预期通胀偏离

### CENTRAL_BANK-U0728
Financial Stability | Capital Shortfall、Liquidity Shortfall、NPL、bank losses、payment disruption、resolution outcome

### CENTRAL_BANK-U0729
FX & Reserve Sustainability | 汇率变化、Usable Reserves、Import Cover、官方付款违约、无效干预造成的储备损失

### CENTRAL_BANK-U0730
Central Bank Credibility | 目标履约、声明一致性、政策反转、货币融资、失败的显式承诺

### CENTRAL_BANK-U0731
Credit Stability | 信贷增长、行业集中、贷款违约与资本吸收能力

### CENTRAL_BANK-U0732
Crisis Management | ELA 损失、危机持续时间、支付体系恢复、处置资本成本

### CENTRAL_BANK-U0733
26.2 National Guardrail

### CENTRAL_BANK-U0734
不能通过把通胀压到极低而造成极端失业/深度衰退获得高分

### CENTRAL_BANK-U0735
不能通过耗尽官方外储短期固定汇率获得高分

### CENTRAL_BANK-U0736
不能通过无上限 ELA 掩盖资不抵债银行获得高分

### CENTRAL_BANK-U0737
不能通过强迫银行向战略产业过度放贷而牺牲资本稳健性获得高分

### CENTRAL_BANK-U0738
角色评分必须受国家 Institutional Collapse / sovereign default / payment-system failure 等严重状态约束

### CENTRAL_BANK-U0739
27. 旧版功能迁移矩阵

### CENTRAL_BANK-U0740
旧版功能 | Season 1 处理 | 最终实现

### CENTRAL_BANK-U0741
Policy Interest Rate -2%-20% | 保留 | 继续使用精确 %；新增 real rate、银行贷款利率传导与完整决策日志

### CENTRAL_BANK-U0742
Inflation Target 1%-8% | 保留并制度化 | 新增 tolerance band、review time、change reason、credibility tracking

### CENTRAL_BANK-U0743
Reserve Requirement 0%-30% | 保留 | 由真实 Reservable Deposits 自动计算 required reserves 与 shortfall

### CENTRAL_BANK-U0744
OMO -15%~15% GDP | 彻底重构 | 删除 GDP% slider；改为精确 LC 金额的政府证券 BUY/SELL 交易

### CENTRAL_BANK-U0745
FX Intervention -50%~50% reserves | 彻底重构 | 删除储备百分比 slider；改为精确 GCU amount、汇率结算与可选 sterilisation

### CENTRAL_BANK-U0746
Countercyclical Buffer 0%-5% | 保留并扩展 | 加入 Base Capital Requirement、RWA、Required Capital、Capital Shortfall

### CENTRAL_BANK-U0747
Emergency Liquidity 0%-25% deposits | 彻底重构 | 改为精确 LC principal、rate、maturity、collateral、haircut、repayment/default

### CENTRAL_BANK-U0748
Lending Guidance 0%-30% total credit | 删除并替换 | 替换为 Targeted Refinancing Facility；额度与实际使用额分离

### CENTRAL_BANK-U0749
Foreign Reserves | 彻底精确化 | 拆为 Gross / Committed / Encumbered / Usable；以 GCU 资产科目保存

### CENTRAL_BANK-U0750
Banking System | 彻底精确化 | 新增全国商业银行汇总资产负债表、分行业信贷、NPL、资本、准备金、CB borrowing

### CENTRAL_BANK-U0751
28. UI / 工程实现检查清单

### CENTRAL_BANK-U0752
28.1 玩家端必须存在

### CENTRAL_BANK-U0753
Central Bank Overview

### CENTRAL_BANK-U0754
Central Bank Balance Sheet

### CENTRAL_BANK-U0755
Monetary Aggregates panel: C / R / MB / M1 / M2

### CENTRAL_BANK-U0756
Commercial Banking Balance Sheet

### CENTRAL_BANK-U0757
Sector Credit & NPL table

### CENTRAL_BANK-U0758
Capital & Reserve Compliance table

### CENTRAL_BANK-U0759
Monetary Policy control page

### CENTRAL_BANK-U0760
OMO transaction composer

### CENTRAL_BANK-U0761
Reserve Requirement control

### CENTRAL_BANK-U0762
Capital Requirement & CCyB control

### CENTRAL_BANK-U0763
Targeted Refinancing Facility manager

### CENTRAL_BANK-U0764
ELA transaction manager

### CENTRAL_BANK-U0765
FX market flow table

### CENTRAL_BANK-U0766
Official Reserve composition table

### CENTRAL_BANK-U0767
FX intervention composer

### CENTRAL_BANK-U0768
Sterilisation linkage

### CENTRAL_BANK-U0769
Official FX Allocation Request inbox

### CENTRAL_BANK-U0770
Reserve Swap negotiation/approval view

### CENTRAL_BANK-U0771
Shared Policy approval inbox

### CENTRAL_BANK-U0772
Treasury settlement read-only interface

### CENTRAL_BANK-U0773
Monetary Policy Report

### CENTRAL_BANK-U0774
Inflation Decomposition

### CENTRAL_BANK-U0775
Forward Guidance / Statement publisher

### CENTRAL_BANK-U0776
Facility maturity calendar

### CENTRAL_BANK-U0777
Transaction Ledger

### CENTRAL_BANK-U0778
Decision & Approval Log

### CENTRAL_BANK-U0779
28.2 后端必须存在的数据实体

### CENTRAL_BANK-U0780
currencies

### CENTRAL_BANK-U0781
exchange_rates

### CENTRAL_BANK-U0782
central_bank_balance_sheet_accounts

### CENTRAL_BANK-U0783
central_bank_ledger_entries

### CENTRAL_BANK-U0784
commercial_bank_balance_sheet_accounts

### CENTRAL_BANK-U0785
bank_credit_sector_balances

### CENTRAL_BANK-U0786
bank_npl_sector_balances

### CENTRAL_BANK-U0787
bank_capital_state

### CENTRAL_BANK-U0788
monetary_aggregates

### CENTRAL_BANK-U0789
monetary_policy_settings

### CENTRAL_BANK-U0790
open_market_operations

### CENTRAL_BANK-U0791
reserve_requirement_history

### CENTRAL_BANK-U0792
capital_requirement_history

### CENTRAL_BANK-U0793
refinancing_facilities

### CENTRAL_BANK-U0794
refinancing_drawdowns

### CENTRAL_BANK-U0795
emergency_liquidity_facilities

### CENTRAL_BANK-U0796
ela_drawdowns

### CENTRAL_BANK-U0797
foreign_reserve_assets

### CENTRAL_BANK-U0798
foreign_reserve_commitments

### CENTRAL_BANK-U0799
fx_market_flows

### CENTRAL_BANK-U0800
fx_interventions

### CENTRAL_BANK-U0801
official_fx_requests

### CENTRAL_BANK-U0802
reserve_swaps

### CENTRAL_BANK-U0803
treasury_accounts

### CENTRAL_BANK-U0804
treasury_settlements

### CENTRAL_BANK-U0805
external_debt_obligations

### CENTRAL_BANK-U0806
capital_flow_records

### CENTRAL_BANK-U0807
shared_policy_proposals

### CENTRAL_BANK-U0808
office_approvals

### CENTRAL_BANK-U0809
monetary_policy_statements

### CENTRAL_BANK-U0810
forward_guidance_records

### CENTRAL_BANK-U0811
central_bank_reports

### CENTRAL_BANK-U0812
central_bank_alerts

### CENTRAL_BANK-U0813
audit_logs

### CENTRAL_BANK-U0814
28.3 硬性验收标准

### CENTRAL_BANK-U0815
任何央行资产负债表都必须在每次 posted transaction 后保持 Assets = Liabilities + Equity。

### CENTRAL_BANK-U0816
任何 OMO、FX intervention、ELA、refinancing、swap、monetary financing 都必须可追溯到具体 ledger entries。

### CENTRAL_BANK-U0817
Currency in Circulation、Bank Reserves、MB、M1、M2 必须由账户余额自动计算，玩家不能直接改值。

### CENTRAL_BANK-U0818
Gross Reserves、Committed Reserves、Encumbered Reserves、Usable Reserves 必须分别保存并自动对账。

### CENTRAL_BANK-U0819
普通私人进口不得直接扣减官方外储。

### CENTRAL_BANK-U0820
所有银行信贷与 NPL 必须以实际 LC amount 保存，并可按行业展开。

### CENTRAL_BANK-U0821
Reserve Requirement、Capital Requirement、CCyB 产生的合规缺口必须显示精确 LC amount。

### CENTRAL_BANK-U0822
ELA 必须区分 liquidity 与 solvency；不能自动修复 capital shortfall。

### CENTRAL_BANK-U0823
Lending Guidance 百分比功能必须从 Season 1 央行 UI 删除。

### CENTRAL_BANK-U0824
Central Bank 的独立政策不得被 Captain 直接 Edit / Approve / Reject。

### CENTRAL_BANK-U0825
同一用户兼任多个 Office 时，联合审批必须生成多个 office-specific approval records。

### CENTRAL_BANK-U0826
所有 qualitative warnings 只能从真实数据派生，不能作为隐藏 0-100 状态反向影响经济。

### CENTRAL_BANK-U0827
历史记录必须能重建每一个关键央行余额变化的来源。

### CENTRAL_BANK-U0828
失败、拒绝、逾期、违约、reversal 均必须保留，不得覆盖旧记录。

### CENTRAL_BANK-U0829
所有跨国和外币交易必须记录 currency、amount、exchange rate、settlement time 和 counterparty。

### CENTRAL_BANK-U0830
结论：Central Bank Governor 的最终玩法边界

### CENTRAL_BANK-U0831
Season 1 中央银行不再是“调利率、调外储强度、调流动性程度”的宏观滑块页面，而是一个具有真实本币、真实外汇储备、真实商业银行准备金、真实贷款与存款、真实政府账户以及平衡资产负债表的货币金融机构。玩家的每一次有效操作都必须先改变一个可以被记账的金融状态，再通过货币、信贷、汇率和预期渠道传导至实体经济。

### CENTRAL_BANK-U0832
Season 1 Central Bank Core Architecture / Transaction → Balance Sheet → Money / Credit / FX → Real Economy → Macro Outcome

### CENTRAL_BANK-U0833
该 Office 的全部操作空间已经在本文件中固定为：Policy Rate、Inflation Framework、OMO、Reserve Requirement、Capital Regulation、Targeted Refinancing Facility、ELA、FX Intervention、Sterilisation、Official FX Approval、Reserve Swap、Treasury Settlement Interface、金融危机联合处置、Monetary Policy Statement、Forward Guidance、Reports、Approvals、Alerts、Transaction Ledger 与 Role-specific Scoring。除本文件列出的权限外，Central Bank 不获得财政、贸易、产业、社会或国家战略的直接控制权。
