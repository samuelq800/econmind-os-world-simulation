# TRADE｜原始规范文本索引

原文件：`EconMind_Season1_Trade_Foreign_Affairs_Minister_Function_Specification.docx`
本文件为段落/表格顺序提取，未修改规则，未协调矛盾；图像、批注、页眉页脚与版式以原Word为准。锚点仅供回查，不代表独立需求条数。

### TRADE-U0001
EconMind OS Season 1

### TRADE-U0002
Trade & Foreign Affairs Minister / 贸易与外交部长

### TRADE-U0003
完整功能、跨国活动与国际经济系统规范

### TRADE-U0004
ROLE DEFINITION / Trade & Foreign Affairs Minister 是国家外部经济关系的执行与谈判中心。该职位管理标准化商品的国际买卖、双边与多边合同、国别与商品维度的贸易政策、外国投资、技术许可、资源开发协议、主权融资谈判、经济外交、制裁、援助、国际招标与争端处理。所有可精确量化事项均使用真实数量、价格、货币、期限、所有权、库存、现金流和合同义务，不使用 0–100 程度值作为底层经济变量。

### TRADE-U0005
项目 | 定义

### TRADE-U0006
文件性质 | Season 1 产品设计与工程实现规范

### TRADE-U0007
Office | Minister of Trade & Foreign Affairs / 贸易与外交部长

### TRADE-U0008
权限原则 | 外部经济关系主责；不拥有国内生产、财政预算、货币政策或国家战略最终决定权

### TRADE-U0009
运行模式 | 持续运行、无固定回合、无季度锁定、合同与物流按自然模拟时间执行

### TRADE-U0010
经济表示 | Stock / Flow / Contract / Transaction / Ownership / Obligation

### TRADE-U0011
版本定位 | World Simulation 2.0 / Season 1

### TRADE-U0012
目录 / Contents

### TRADE-U0013
1. Office 定位与权限边界

### TRADE-U0014
2. 核心设计原则

### TRADE-U0015
3. Trade Dashboard 信息架构

### TRADE-U0016
4. Season 1 固定可交易商品目录

### TRADE-U0017
5. Global Market 世界市场

### TRADE-U0018
6. 国内供需、库存与进口/出口能力

### TRADE-U0019
7. Tariff 国别 × 商品关税系统

### TRADE-U0020
8. Import Quota、Export Cap 与禁运

### TRADE-U0021
9. Spot Import / Spot Export 现货交易

### TRADE-U0022
10. 国际物流与交付

### TRADE-U0023
11. 国际付款、FX 与官方外储接口

### TRADE-U0024
12. Negotiation Room 谈判系统

### TRADE-U0025
13. Contract State Machine 合同状态机

### TRADE-U0026
14. Commodity Supply Agreement 商品供应合同

### TRADE-U0027
15. Technology Licence 技术许可

### TRADE-U0028
16. Foreign Direct Investment 外商直接投资

### TRADE-U0029
17. Sovereign Loan 主权贷款

### TRADE-U0030
18. Infrastructure Finance 基础设施融资

### TRADE-U0031
19. Resource Development Agreement 资源开发协议

### TRADE-U0032
20. Joint International Project 跨国联合项目

### TRADE-U0033
21. Trade Agreement 贸易协定

### TRADE-U0034
22. Reserve Swap 储备互换

### TRADE-U0035
23. Sanctions 制裁机制

### TRADE-U0036
24. International Aid & Emergency Assistance 国际援助

### TRADE-U0037
25. International Tender 国际招标

### TRADE-U0038
26. Strategic Economic Partnership 战略经济伙伴关系

### TRADE-U0039
27. Trade Dispute & Settlement 国际争端

### TRADE-U0040
28. FDI Screening 与外国所有权规则

### TRADE-U0041
29. Customs & Border Administration 海关与边境管理

### TRADE-U0042
30. Trade Finance Guarantee 贸易融资担保

### TRADE-U0043
31. Economic Diplomacy 经济外交

### TRADE-U0044
32. Partner Profile 与 Supply Chain Intelligence

### TRADE-U0045
33. 通知、Inbox 与到期管理

### TRADE-U0046
34. 与其他五个 Office 的共享权限

### TRADE-U0047
35. 内部审批与签署权限矩阵

### TRADE-U0048
36. 信息优势与只读权限

### TRADE-U0049
37. Trade Office 评分与 National Guardrails

### TRADE-U0050
38. 核心数据实体与数据库字段

### TRADE-U0051
39. 核心计算与结算规则

### TRADE-U0052
40. 前端全部操作控件

### TRADE-U0053
41. Audit Ledger 与不可篡改事件记录

### TRADE-U0054
42. 旧版 World Simulation 迁移规则

### TRADE-U0055
43. 工程验收 Checklist

### TRADE-U0056
附录 A：Trade Office 全部操作空间总表

### TRADE-U0057
附录 B：全部跨国活动类型与 Required Offices

### TRADE-U0058
附录 C：全部合同通用字段字典

### TRADE-U0059
1. Office 定位与权限边界

### TRADE-U0060
正式名称：Minister of Trade & Foreign Affairs / 贸易与外交部长。

### TRADE-U0061
核心使命：保障国家获得所需外部商品、资本、技术与市场；将国内可出口资源、产品、技术和投资机会转换为国际收入与战略关系；管理对外经济制度与跨国合同执行。

### TRADE-U0062
核心公式 / Domestic Economy ↔ Trade Office ↔ International Economic Network

### TRADE-U0063
1.1 独占主责

### TRADE-U0064
标准化商品的 Spot Import 与 Spot Export 下单。

### TRADE-U0065
商品维度 General Tariff Schedule 的设定与修改。

### TRADE-U0066
Country-Specific Tariff Override 的设定、修改和撤销。

### TRADE-U0067
商品维度 Global Import Quota 的设定、修改和撤销。

### TRADE-U0068
Country-Specific Import Quota 的设定、修改和撤销。

### TRADE-U0069
Commodity × Destination 的 Export Cap 与 Export Ban 管理。

### TRADE-U0070
普通商业 Commodity Supply Agreement 的发起、谈判、签署和执行管理。

### TRADE-U0071
普通商业 Technology Licence 的谈判和合同管理。

### TRADE-U0072
国际市场搜索、Partner Search、国际招标和报价管理。

### TRADE-U0073
普通双边贸易谈判、市场准入谈判、关税谈判、合同争端谈判。

### TRADE-U0074
海关规则、通关制度与海关现代化项目的发起。

### TRADE-U0075
FDI Proposal 的受理、外资规则适用、条款谈判和内部流转。

### TRADE-U0076
国际合同履约、交付、付款、到期、违约、重谈与终止的业务管理。

### TRADE-U0077
1.2 非本 Office 所有的事项

### TRADE-U0078
国内产量、矿山产能、工厂产能、能源产能和库存生产决策归 Industry。

### TRADE-U0079
技术研究与研发项目归 Industry；Trade 仅管理外国技术获取和国内技术对外许可。

### TRADE-U0080
政府现金、税收、预算、发债、担保和财政支付归 Finance。

### TRADE-U0081
政策利率、银行储备、外汇干预、官方外储和储备互换的货币部分归 Central Bank。

### TRADE-U0082
工资、就业、培训、福利、住房与移民制度归 Social。

### TRADE-U0083
国家发展战略、国家优先目标、战略条约最终批准与重大危机政治授权归 Captain。

### TRADE-U0084
1.3 项目投资中的角色

### TRADE-U0085
事项 | Trade 权限 | 不可越权范围

### TRADE-U0086
进口设备与原料 | 寻找供应商、谈价格、签合同、安排交付 | 不决定项目是否建设

### TRADE-U0087
外国投资 | 寻找投资者、谈所有权和条款、提交审批 | 不单独决定财政承担或国内产业技术方案

### TRADE-U0088
外国技术 | 谈 Licence、价格、使用权和限制 | 不决定研发路线

### TRADE-U0089
国际融资 | 谈贷款方、币种、利率、期限和条件 | 不单独批准国家举债

### TRADE-U0090
战略资源协议 | 管理跨国谈判与合同执行 | 资源开发方案由 Industry 共同决定

### TRADE-U0091
大型国际项目 | 负责外部合作与条款 | 项目 Owner、Finance、Captain 按属性共同审批

### TRADE-U0092
2. 核心设计原则

### TRADE-U0093
原则 | 强制实现

### TRADE-U0094
真实数量 | 商品统一记录实际数量与计量单位，不以“供应强度”替代。

### TRADE-U0095
真实价格 | 交易记录单位价格、基准价格、运输费、保险费、关税和最终 Landed Cost。

### TRADE-U0096
真实货币 | 所有跨国付款记录结算币种和金额；标准国际结算单位为 GCU，本币通过 FX Market 转换。

### TRADE-U0097
真实库存 | 进口交付增加买方库存，出口交付减少卖方库存；不能交付不存在的库存。

### TRADE-U0098
真实物流 | 订单、在途、到港、延误和取消具有时间状态。

### TRADE-U0099
真实所有权 | FDI、合资项目、基础设施和资源开发协议记录股权、收益权、经营权和期限。

### TRADE-U0100
真实债权债务 | 主权贷款和融资协议记录本金、利率、利息、到期、余额与偿还。

### TRADE-U0101
真实义务 | 合同按 Delivery Schedule 和 Payment Schedule 产生未来义务。

### TRADE-U0102
无虚拟友好度 | 关系标签由履约、关税、制裁、援助、争端和条约事实派生。

### TRADE-U0103
无虚拟制裁强度 | 制裁由具体商品、技术、投资、金融和政府交易限制组成。

### TRADE-U0104
无虚拟进口限制强度 | Import Quota 使用实际数量上限。

### TRADE-U0105
无虚拟出口限制强度 | Export Cap 使用实际数量上限，Export Ban 使用 0 可出口数量。

### TRADE-U0106
可审计 | 每次报价、签署、付款、交付、违约、政策修改和审批均形成不可篡改事件记录。

### TRADE-U0107
3. Trade Dashboard 信息架构

### TRADE-U0108
页面 | 完整内容

### TRADE-U0109
01 Global Market | 全球价格、产量、消费、库存、可售现货、合同锁定量、主要出口国、主要进口国、历史价格。

### TRADE-U0110
02 Domestic Trade Position | 本国产量、消费、库存、战略最低库存、进口需求、可出口供给、在途货物。

### TRADE-U0111
03 Imports | Spot Purchase、进口订单、进口合同、在途、到港、付款与进口成本。

### TRADE-U0112
04 Exports | Spot Sale、出口订单、出口合同、可出口量、交付与出口收入。

### TRADE-U0113
05 Negotiations | 所有 Draft、Offer、Counteroffer、Internal Approval、Signature Pending 谈判。

### TRADE-U0114
06 Contracts | 所有 Active、Delayed、Disputed、Defaulted、Renegotiating、Expiring 合同。

### TRADE-U0115
07 Tariffs & Controls | General Tariff、Bilateral Override、Treaty Rate、Quota、Export Cap、Sanction Override。

### TRADE-U0116
08 Foreign Investment | FDI Proposal、外资股权、利润汇回、技术贡献、所有权限制。

### TRADE-U0117
09 Technology & Strategic Deals | 技术许可、资源协议、基础设施融资、跨国项目。

### TRADE-U0118
10 Treaties & Diplomacy | FTA、PTA、战略伙伴关系、多边协议、国际峰会经济条款。

### TRADE-U0119
11 Partner Intelligence | 每个国家的双边贸易、合同、依赖、关税、投资、技术、债权债务和履约记录。

### TRADE-U0120
12 Inbox & Deadlines | 新报价、反报价、审批、交付异常、付款异常、到期合同、条约邀请、争端。

### TRADE-U0121
4. Season 1 固定可交易商品目录

### TRADE-U0122
Commodity ID | 名称 | 计量单位 | 用途类别

### TRADE-U0123
CRUDE_OIL | Crude Oil / 原油 | barrel | 能源原料

### TRADE-U0124
NATURAL_GAS | Natural Gas / 天然气 | MMBtu | 能源原料

### TRADE-U0125
URANIUM | Uranium / 铀 | tonne U | 核能原料

### TRADE-U0126
GRAIN | Grain / 粮食 | tonne | 食品与农业

### TRADE-U0127
IRON_ORE | Iron Ore / 铁矿石 | tonne | 工业原料

### TRADE-U0128
COPPER | Copper / 铜 | tonne | 工业与电气原料

### TRADE-U0129
LITHIUM | Lithium / 锂 | tonne LCE | 电池与战略矿产

### TRADE-U0130
STEEL | Steel / 钢铁 | tonne | 中间工业品

### TRADE-U0131
REFINED_FUEL | Refined Fuel / 成品燃料 | barrel equivalent | 能源中间品

### TRADE-U0132
MACHINERY | Machinery / 工业设备 | equipment unit | 资本品

### TRADE-U0133
SEMICONDUCTORS | Semiconductors / 半导体 | standardised chip unit | 高技术中间品

### TRADE-U0134
BATTERIES | Batteries / 电池 | MWh-equivalent | 新能源中间品

### TRADE-U0135
该目录是 Season 1 的固定标准化国际商品目录。商品目录之外的跨国经济事项通过 Technology Licence、FDI、Infrastructure Finance、Resource Development、Joint Project 和 Treaty 等结构化对象处理，不通过临时自由文本商品创建。

### TRADE-U0136
5. Global Market 世界市场

### TRADE-U0137
字段 | 单位 | 定义

### TRADE-U0138
Global Benchmark Price | GCU / 标准单位 | 当前全球基准成交价

### TRADE-U0139
Global Production | 商品单位 / 模拟日 | 全球实际产量

### TRADE-U0140
Global Consumption | 商品单位 / 模拟日 | 全球实际消费

### TRADE-U0141
Global Inventory | 商品单位 | 全球可统计库存

### TRADE-U0142
Exportable Supply | 商品单位 | 当前满足国内需求和战略最低库存后可出口数量

### TRADE-U0143
Import Demand | 商品单位 | 各国未覆盖需求汇总

### TRADE-U0144
Available Spot Supply | 商品单位 | 未被长期合同占用且可立即出售数量

### TRADE-U0145
Contracted Future Supply | 商品单位 | 已被有效合同锁定的未来交付数量

### TRADE-U0146
Top Exporters | 国家 + 数量 | 按可出口量排序

### TRADE-U0147
Top Importers | 国家 + 数量 | 按未覆盖需求排序

### TRADE-U0148
Price History | 时间序列 | 历史价格与成交量

### TRADE-U0149
Market Tightness | 派生描述 | 由可售供给与未覆盖需求直接计算，不作为独立底层变量

### TRADE-U0150
全球价格核心输入 / P_i(t) = f(GlobalExportableSupply_i, GlobalImportDemand_i, GlobalInventory_i, ActiveShock_i) / 价格函数只能使用真实供给、需求、库存和外部事件。

### TRADE-U0151
5.1 World Market 可操作动作

### TRADE-U0152
动作 | 输入 | 执行结果

### TRADE-U0153
Search Commodity | Commodity ID | 返回全球市场完整数据。

### TRADE-U0154
Place Buy Order | Commodity、Quantity、Max Unit Price、Delivery Window、Settlement Currency | 进入市场撮合。

### TRADE-U0155
Place Sell Order | Commodity、Quantity、Min Unit Price、Delivery Window、Settlement Currency | 冻结对应可出口数量并进入撮合。

### TRADE-U0156
Cancel Unfilled Order | Order ID | 取消未成交剩余部分并释放冻结数量。

### TRADE-U0157
Accept Partial Fill | 预设允许/不允许 | 决定订单是否允许部分成交。

### TRADE-U0158
Convert Filled Order to Delivery | Matched Trade | 自动生成物流与付款义务。

### TRADE-U0159
6. 国内供需、库存与进口/出口能力

### TRADE-U0160
库存恒等式 / Inventory_i(t) = Inventory_i(t-1) + Production_i + ImportsDelivered_i - DomesticUse_i - ExportsDelivered_i - Losses_i

### TRADE-U0161
未覆盖进口需求 / ImportNeed_i = max(0, DomesticDemand_i + StrategicStockTarget_i - DomesticProduction_i - UsableInventory_i - ContractedInbound_i)

### TRADE-U0162
可出口供给 / ExportableSupply_i = max(0, DomesticProduction_i + UsableInventory_i + ContractedInbound_i - DomesticDemand_i - StrategicMinimum_i - ExistingExportObligations_i)

### TRADE-U0163
Trade Office 必须可见字段 | 性质

### TRADE-U0164
Domestic Production | 只读真实状态，由生产、库存、合同和物流系统计算

### TRADE-U0165
Domestic Consumption | 只读真实状态，由生产、库存、合同和物流系统计算

### TRADE-U0166
Usable Inventory | 只读真实状态，由生产、库存、合同和物流系统计算

### TRADE-U0167
Strategic Minimum Inventory | 只读真实状态，由生产、库存、合同和物流系统计算

### TRADE-U0168
Strategic Target Inventory | 只读真实状态，由生产、库存、合同和物流系统计算

### TRADE-U0169
Contracted Inbound | 只读真实状态，由生产、库存、合同和物流系统计算

### TRADE-U0170
Contracted Outbound | 只读真实状态，由生产、库存、合同和物流系统计算

### TRADE-U0171
In Transit Inbound | 只读真实状态，由生产、库存、合同和物流系统计算

### TRADE-U0172
In Transit Outbound | 只读真实状态，由生产、库存、合同和物流系统计算

### TRADE-U0173
Uncovered Import Need | 只读真实状态，由生产、库存、合同和物流系统计算

### TRADE-U0174
Exportable Supply | 只读真实状态，由生产、库存、合同和物流系统计算

### TRADE-U0175
Average Domestic Price | 只读真实状态，由生产、库存、合同和物流系统计算

### TRADE-U0176
Import Dependency % | 只读真实状态，由生产、库存、合同和物流系统计算

### TRADE-U0177
Top Supplier Shares | 只读真实状态，由生产、库存、合同和物流系统计算

### TRADE-U0178
Top Buyer Shares | 只读真实状态，由生产、库存、合同和物流系统计算

### TRADE-U0179
7. Tariff 国别 × 商品关税系统

### TRADE-U0180
Tariff 的最小政策单元固定为 Importer Country × Exporter Country × Commodity。玩家不需要手工维护 70 × 70 × 12 全矩阵，系统使用“General Schedule + Bilateral Override + Treaty Rate”三级结构。

### TRADE-U0181
7.1 General Tariff Schedule

### TRADE-U0182
Trade Office 对 12 个固定商品分别设定默认进口关税率。所有不存在 Bilateral Override、Treaty Rate 或 Sanction Blocking 的贸易伙伴使用该默认税率。

### TRADE-U0183
字段 | 类型 | 规则

### TRADE-U0184
Importer Country | Country ID | 自动为本国，不可修改

### TRADE-U0185
Commodity | 12 项固定枚举 | 逐商品设置

### TRADE-U0186
General Tariff Rate | 0%–100% | 从价关税率

### TRADE-U0187
Effective From | Simulation Time | 生效时间

### TRADE-U0188
Review Status | Active / Scheduled / Repealed | 政策状态

### TRADE-U0189
7.2 Bilateral Tariff Override

### TRADE-U0190
字段 | 类型 | 规则

### TRADE-U0191
Exporter Country | Country ID | 指定一个贸易伙伴

### TRADE-U0192
Commodity | 固定商品枚举 | 指定商品

### TRADE-U0193
Override Rate | 0%–100% | 覆盖 General Tariff

### TRADE-U0194
Effective From | Simulation Time | 生效时间

### TRADE-U0195
Expiry | Simulation Time / None | 到期后恢复下一优先级税率

### TRADE-U0196
Reason Code | Negotiated / Retaliatory / Strategic / Temporary | 审计用途

### TRADE-U0197
7.3 Treaty Tariff Rate

### TRADE-U0198
PTA、FTA 与其他有效贸易协定可以直接写入 Country Pair × Commodity 的 Treaty Rate。Trade Office 不能在不触发条约违约的情况下静默覆盖有效 Treaty Rate。

### TRADE-U0199
有效关税优先级 / Sanction Block > Import Ban/Quota Exhaustion > Treaty Rate > Bilateral Override > General Tariff

### TRADE-U0200
关税收入 / TariffRevenue = CustomsValue × EffectiveTariffRate

### TRADE-U0201
到岸成本 / LandedCost = CustomsValue + TransportCost + InsuranceCost + Tariff + BorderFees

### TRADE-U0202
8. Import Quota、Export Cap 与禁运

### TRADE-U0203
政策工具 | 完整输入 | 底层效果

### TRADE-U0204
Global Import Quota | Commodity + Quantity + Period | 本国在规定周期内对该商品全部来源的最大进口数量

### TRADE-U0205
Country-Specific Import Quota | Exporter + Commodity + Quantity + Period | 限制来自指定国家的指定商品进口数量

### TRADE-U0206
Import Ban | Exporter optional + Commodity + Start/End | 允许针对全部来源或指定国家将可进口数量设为 0

### TRADE-U0207
Global Export Cap | Commodity + Quantity + Period | 规定本国指定商品总出口上限

### TRADE-U0208
Destination Export Cap | Destination + Commodity + Quantity + Period | 规定向指定国家出口上限

### TRADE-U0209
Export Ban | Destination optional + Commodity + Start/End | 将指定商品对全部或指定目的国可出口量设为 0

### TRADE-U0210
Quota 使用累计实际交付量进行占用。订单和合同签署可以预留配额；已取消或终止的未交付部分释放配额。

### TRADE-U0211
9. Spot Import / Spot Export 现货交易

### TRADE-U0212
字段 | 定义

### TRADE-U0213
Order Side | BUY / SELL

### TRADE-U0214
Commodity | 固定 12 商品

### TRADE-U0215
Quantity | 商品单位

### TRADE-U0216
Limit Price | BUY 为 Max Price；SELL 为 Min Price

### TRADE-U0217
Settlement Currency | GCU 或系统允许的结算币种

### TRADE-U0218
Delivery Window Start | Simulation Time

### TRADE-U0219
Delivery Window End | Simulation Time

### TRADE-U0220
Allow Partial Fill | Boolean

### TRADE-U0221
Minimum Fill Quantity | 商品单位

### TRADE-U0222
Order Expiry | Simulation Time

### TRADE-U0223
Incoterm Simplification | Buyer-arranged / Seller-arranged transport

### TRADE-U0224
9.1 撮合约束

### TRADE-U0225
卖方必须拥有足够 Exportable Supply 或满足交付窗口前的已承诺生产。

### TRADE-U0226
买方必须不受 Import Ban、Quota Exhaustion、Sanction Blocking 或有效条约限制。

### TRADE-U0227
撮合数量不能超过买方剩余配额、卖方剩余出口额度、可用现货和订单剩余数量。

### TRADE-U0228
成交价格必须满足买方 Limit Price 与卖方报价条件。

### TRADE-U0229
成交后自动生成 Payment Obligation、Delivery Obligation、Shipment Record 与 Trade Ledger Event。

### TRADE-U0230
所有未成交部分保持 Open，直至 Filled、Cancelled 或 Expired。

### TRADE-U0231
10. 国际物流与交付

### TRADE-U0232
字段 | 定义

### TRADE-U0233
Shipment ID | 唯一编号

### TRADE-U0234
Underlying Contract / Order | 来源交易

### TRADE-U0235
Commodity | 商品

### TRADE-U0236
Quantity | 数量

### TRADE-U0237
Origin Country | 起运国

### TRADE-U0238
Destination Country | 目的国

### TRADE-U0239
Dispatch Time | 发运时间

### TRADE-U0240
Expected Arrival | 预计到达

### TRADE-U0241
Actual Arrival | 实际到达

### TRADE-U0242
Transport Responsibility | Buyer / Seller / Joint

### TRADE-U0243
Transport Cost | GCU

### TRADE-U0244
Insurance Cost | GCU

### TRADE-U0245
Status | Scheduled / Loaded / In Transit / Delayed / Delivered / Lost / Cancelled

### TRADE-U0246
Delivered Quantity | 实际交付数量

### TRADE-U0247
Shortfall Quantity | 交付缺口

### TRADE-U0248
Delay Duration | 延误时长

### TRADE-U0249
货物只有在 Shipment 状态进入 Delivered 后才增加买方库存；在卖方发运时按照合同规则减少卖方可用库存或转入 In Transit Inventory。

### TRADE-U0250
11. 国际付款、FX 与官方外储接口

### TRADE-U0251
字段 | 定义

### TRADE-U0252
Payment ID | 唯一编号

### TRADE-U0253
Payer | 国家 / 政府 / 经济部门

### TRADE-U0254
Payee | 国家 / 合同对手

### TRADE-U0255
Currency | 结算币种

### TRADE-U0256
Amount | 应付金额

### TRADE-U0257
Due Time | 到期时间

### TRADE-U0258
Payment Trigger | Upfront / Shipment / Delivery / Periodic / Maturity

### TRADE-U0259
Source | Private FX Market / Treasury / Official Reserve Request

### TRADE-U0260
Status | Scheduled / Due / Paid / Late / Defaulted / Waived

### TRADE-U0261
Late Interest | 逾期利率

### TRADE-U0262
Linked Contract | 合同 ID

### TRADE-U0263
11.1 普通贸易付款

### TRADE-U0264
普通进口付款通过 FX Market 形成外币需求，普通出口收入形成外币供给。普通私人贸易不得自动减少 Central Bank 官方外储。

### TRADE-U0265
11.2 Official Reserve Payment Request

### TRADE-U0266
政府紧急采购或依法允许的官方支付可以由 Trade 发起 Official FX Request。Central Bank 对金额、币种和外储使用拥有审批权。Trade 不能直接扣减外储。

### TRADE-U0267
Trade 可提交字段 | 定义

### TRADE-U0268
Underlying Contract | 合同 ID

### TRADE-U0269
Requested Currency | 外币

### TRADE-U0270
Requested Amount | 金额

### TRADE-U0271
Payment Due | 支付时间

### TRADE-U0272
Strategic Necessity | Critical Import / Emergency / Sovereign Obligation

### TRADE-U0273
Alternative FX Source | 可替代外汇来源

### TRADE-U0274
Partial Approval Allowed | Boolean

### TRADE-U0275
12. Negotiation Room 谈判系统

### TRADE-U0276
所有非标准化、长期、战略性或需要多字段条款的跨国活动均进入结构化 Negotiation Room。自由文本只能用于附注，不构成经济执行条款。

### TRADE-U0277
动作 | 系统效果

### TRADE-U0278
Initiate Negotiation | 选择 Partner、Activity Type、内部 Owner

### TRADE-U0279
Create Offer | 填写该 Activity Type 的全部必填字段

### TRADE-U0280
Send Offer | 冻结该版本并发送对手方

### TRADE-U0281
Counteroffer | 基于上一版本生成新版本并修改字段

### TRADE-U0282
Accept Commercial Terms | 双方确认商业条款

### TRADE-U0283
Request Internal Approval | 进入本国内部 Required Offices 审批

### TRADE-U0284
Approve Internal | 授权本国签署

### TRADE-U0285
Reject Internal | 拒绝签署并返回谈判

### TRADE-U0286
Request Revision | 指定需要重谈字段

### TRADE-U0287
Sign | 具有签署权限的 Office 完成正式签署

### TRADE-U0288
Withdraw | 撤回未签署报价

### TRADE-U0289
Terminate Negotiation | 结束谈判，不生成合同

### TRADE-U0290
12.1 版本控制

### TRADE-U0291
每一次 Offer / Counteroffer 形成不可覆盖的 Version Number。

### TRADE-U0292
双方看到相同的结构化字段与差异比较。

### TRADE-U0293
已发送版本不可直接编辑，只能通过 Counteroffer 创建新版本。

### TRADE-U0294
Internal Approval 必须绑定具体 Version Number。

### TRADE-U0295
任何关键字段在审批后发生修改，原审批失效并重新进入审批。

### TRADE-U0296
13. Contract State Machine 合同状态机

### TRADE-U0297
状态 | 定义

### TRADE-U0298
Draft | 本方正在编辑，未发送

### TRADE-U0299
Negotiating | 双方存在有效谈判

### TRADE-U0300
Sent | 本方报价已发送

### TRADE-U0301
Counteroffer | 对手方已发送反报价

### TRADE-U0302
Awaiting Internal Approval | 商业条款确认，等待至少一个 Required Office

### TRADE-U0303
Approved | 双方内部审批全部完成，等待签署或激活

### TRADE-U0304
Signed | 双方签署完成，尚未到 Start Date

### TRADE-U0305
Active | 合同正在产生交付、付款或其他义务

### TRADE-U0306
Delayed | 至少一个交付或执行节点逾期但未构成最终违约

### TRADE-U0307
Suspended | 因制裁、不可抗力、审批或争端临时停止

### TRADE-U0308
Renegotiating | 已签合同进入正式重谈

### TRADE-U0309
Disputed | 存在已提出且未解决的违约/条款争议

### TRADE-U0310
Partially Defaulted | 部分义务未履行

### TRADE-U0311
Defaulted | 重大义务违约

### TRADE-U0312
Completed | 全部义务履行完毕

### TRADE-U0313
Terminated | 依据条款提前终止

### TRADE-U0314
Expired | 到期且无后续义务

### TRADE-U0315
14. Commodity Supply Agreement 商品供应合同

### TRADE-U0316
字段 | 定义

### TRADE-U0317
Buyer Country | 买方国家

### TRADE-U0318
Seller Country | 卖方国家

### TRADE-U0319
Commodity | 固定 12 商品

### TRADE-U0320
Quality / Grade | 商品适用时的等级

### TRADE-U0321
Total Contract Quantity | 合同总数量

### TRADE-U0322
Quantity Per Delivery | 每次交付数量

### TRADE-U0323
Delivery Frequency | 每 N 模拟日

### TRADE-U0324
Start Date | 开始

### TRADE-U0325
End Date | 结束

### TRADE-U0326
First Delivery Date | 首批交付

### TRADE-U0327
Delivery Location | 交付地点

### TRADE-U0328
Pricing Method | Fixed / Benchmark-linked / Price Band

### TRADE-U0329
Fixed Unit Price | 固定价使用

### TRADE-U0330
Benchmark Index | 挂钩价使用

### TRADE-U0331
Benchmark Multiplier | 基准乘数

### TRADE-U0332
Price Floor | 最低价格

### TRADE-U0333
Price Ceiling | 最高价格

### TRADE-U0334
Settlement Currency | 结算币种

### TRADE-U0335
Upfront Payment | 预付款金额或比例

### TRADE-U0336
Payment Trigger | 发运 / 到货 / 定期

### TRADE-U0337
Credit Period | 交货后付款期限

### TRADE-U0338
Late Payment Interest | 逾期利率

### TRADE-U0339
Transport Responsibility | Buyer / Seller / Joint

### TRADE-U0340
Transport Cost Allocation | 运输费承担

### TRADE-U0341
Insurance Responsibility | 保险承担

### TRADE-U0342
Performance Deposit | 履约保证金

### TRADE-U0343
Collateral | 抵押物

### TRADE-U0344
Sovereign Guarantee | 是否存在主权担保

### TRADE-U0345
Seller Default Trigger | 卖方违约触发

### TRADE-U0346
Buyer Default Trigger | 买方违约触发

### TRADE-U0347
Shortfall Tolerance | 允许短缺

### TRADE-U0348
Grace Period | 宽限期

### TRADE-U0349
Default Penalty | 违约罚则

### TRADE-U0350
Renegotiation Type | None / Periodic / Shock-triggered

### TRADE-U0351
Review Interval | 定期重谈周期

### TRADE-U0352
Price Shock Trigger | 价格变化阈值

### TRADE-U0353
Force Majeure | 适用事件

### TRADE-U0354
Sanction Clause | 制裁处理

### TRADE-U0355
Termination Clause | 终止条件

### TRADE-U0356
交付结算 / Payment_due = DeliveredQuantity × ContractUnitPrice + AllocatedTransport + AllocatedInsurance + ContractFees

### TRADE-U0357
每个 Delivery Event 分别执行库存扣减、在途状态、买方到货、付款、关税、贸易统计和合同履约记录。

### TRADE-U0358
15. Technology Licence 技术许可

### TRADE-U0359
字段 | 定义

### TRADE-U0360
Technology ID | Industry 技术目录中的技术

### TRADE-U0361
Licensor Country | 许可方

### TRADE-U0362
Licensee Country | 被许可方

### TRADE-U0363
Licence Type | Exclusive / Non-exclusive

### TRADE-U0364
Territory | 允许使用的国家范围

### TRADE-U0365
Start Date | 生效

### TRADE-U0366
End Date | 到期

### TRADE-U0367
Upfront Fee | GCU

### TRADE-U0368
Royalty Rate | 销售额 / 产量 / 固定量对应费率

### TRADE-U0369
Royalty Base | Revenue / Unit Output / Fixed Periodic

### TRADE-U0370
Minimum Royalty | 最低定期费用

### TRADE-U0371
Production Limit | 最大允许产量

### TRADE-U0372
Export Rights | Allowed / Restricted / Prohibited

### TRADE-U0373
Permitted Export Markets | 允许出口目的国

### TRADE-U0374
Sub-licensing Rights | Allowed / Prohibited

### TRADE-U0375
Technical Assistance | 是否包含

### TRADE-U0376
Technical Assistance Fee | GCU

### TRADE-U0377
Localisation Requirement | 本地化要求

### TRADE-U0378
Confidentiality | 条款状态

### TRADE-U0379
Termination Trigger | 终止触发

### TRADE-U0380
Post-expiry Rights | 到期后现有产能能否继续使用

### TRADE-U0381
Breach Penalty | 违约罚则

### TRADE-U0382
Trade 负责许可谈判与合同执行；Industry 确认技术需求、兼容性和是否允许国内技术对外许可；涉及政府付款时 Finance 参与。

### TRADE-U0383
16. Foreign Direct Investment 外商直接投资

### TRADE-U0384
字段 | 定义

### TRADE-U0385
Investor Country | 投资来源国

### TRADE-U0386
Host Country | 东道国

### TRADE-U0387
Target Project / Asset | 具体项目或资产

### TRADE-U0388
Sector | Industry 产业目录

### TRADE-U0389
Total Investment | 总投资

### TRADE-U0390
Equity Investment | 股权投资

### TRADE-U0391
Debt Component | 债务融资

### TRADE-U0392
Foreign Ownership % | 外国持股

### TRADE-U0393
Domestic Ownership % | 本国持股

### TRADE-U0394
Voting Rights % | 表决权

### TRADE-U0395
Board Rights | 治理权

### TRADE-U0396
Profit Share | 利润分配

### TRADE-U0397
Dividend Repatriation % | 允许汇回比例

### TRADE-U0398
Repatriation Frequency | 汇回周期

### TRADE-U0399
Technology Contribution | 技术投入

### TRADE-U0400
Equipment Contribution | 设备投入

### TRADE-U0401
Domestic Employment Minimum | 本地就业要求

### TRADE-U0402
Local Procurement Minimum | 本地采购要求

### TRADE-U0403
Training Commitment | 培训义务

### TRADE-U0404
Resource Rights | 资源项目适用

### TRADE-U0405
Project Duration | 合作期限

### TRADE-U0406
Lock-up Period | 最低持有期

### TRADE-U0407
Exit Method | 出售 / 回购 / 到期

### TRADE-U0408
Government Buyback Right | 政府回购权

### TRADE-U0409
Security Conditions | 战略安全条件

### TRADE-U0410
Data / IP Conditions | 数据与知识产权条件

### TRADE-U0411
Dispute Mechanism | 争端机制

### TRADE-U0412
17. Sovereign Loan 主权贷款

### TRADE-U0413
字段 | 定义

### TRADE-U0414
Lender Country | 贷款国

### TRADE-U0415
Borrower Country | 借款国

### TRADE-U0416
Currency | 币种

### TRADE-U0417
Principal | 本金

### TRADE-U0418
Disbursement Schedule | 放款计划

### TRADE-U0419
Interest Rate Type | Fixed / Floating

### TRADE-U0420
Interest Rate | 固定利率或基准加点

### TRADE-U0421
Maturity | 最终到期

### TRADE-U0422
Payment Frequency | 付息/还本频率

### TRADE-U0423
Amortisation | Bullet / Equal Principal / Equal Payment

### TRADE-U0424
Grace Period | 宽限期

### TRADE-U0425
Collateral | 抵押

### TRADE-U0426
Resource-backed Clause | 资源偿还条款

### TRADE-U0427
Default Interest | 违约利率

### TRADE-U0428
Cross-default Clause | 交叉违约

### TRADE-U0429
Early Repayment | 提前还款规则

### TRADE-U0430
Renegotiation | 重谈规则

### TRADE-U0431
Political Conditions | 政治条件

### TRADE-U0432
Use of Proceeds | 用途约束

### TRADE-U0433
Trade 负责寻找贷款方与谈判外部条件；Finance 对债务承担、偿付结构和 Treasury 接收负责；战略级主权贷款需要 Captain 批准。

### TRADE-U0434
18. Infrastructure Finance 基础设施融资

### TRADE-U0435
字段 | 定义

### TRADE-U0436
Project ID | 对应具体国内项目

### TRADE-U0437
Financier Country | 融资方

### TRADE-U0438
Host Country | 项目所在地

### TRADE-U0439
Financing Model | Loan / Equity / BOT / Concession

### TRADE-U0440
Total Project Cost | 总成本

### TRADE-U0441
Foreign Contribution | 外方金额

### TRADE-U0442
Domestic Contribution | 本国金额

### TRADE-U0443
Currency | 融资币种

### TRADE-U0444
Interest / Required Return | 贷款利率或股权回报

### TRADE-U0445
Ownership Share | 股权模式

### TRADE-U0446
Operating Right | 经营权范围

### TRADE-U0447
Operating Period | 经营期限

### TRADE-U0448
Revenue Share | 收入分成

### TRADE-U0449
Capacity Allocation | 产能/服务分配

### TRADE-U0450
Construction Milestones | 建设节点

### TRADE-U0451
Disbursement Milestones | 放款节点

### TRADE-U0452
Technology Contribution | 技术投入

### TRADE-U0453
Equipment Supply | 设备供应

### TRADE-U0454
Local Employment | 就业要求

### TRADE-U0455
Local Procurement | 本地采购

### TRADE-U0456
Transfer Date | BOT 转移日期

### TRADE-U0457
Termination | 终止条件

### TRADE-U0458
19. Resource Development Agreement 资源开发协议

### TRADE-U0459
字段 | 定义

### TRADE-U0460
Resource | Oil / Gas / Uranium / Iron Ore / Copper / Lithium

### TRADE-U0461
Deposit / Field ID | 资源区块

### TRADE-U0462
Host Country | 东道国

### TRADE-U0463
Foreign Partner | 外方

### TRADE-U0464
Development Investment | 开发投资

### TRADE-U0465
Planned Capacity | 新增产能

### TRADE-U0466
Foreign Ownership % | 外国所有权

### TRADE-U0467
Domestic Ownership % | 国内所有权

### TRADE-U0468
Royalty Rate | 资源特许费

### TRADE-U0469
Production Sharing | 产量分成

### TRADE-U0470
Domestic Supply Requirement | 最低国内供应

### TRADE-U0471
Foreign Export Right | 外方可出口份额

### TRADE-U0472
Export Destination Rights | 允许目的地

### TRADE-U0473
Technology Contribution | 技术投入

### TRADE-U0474
Infrastructure Contribution | 配套设施

### TRADE-U0475
Environmental Obligation | 环境义务

### TRADE-U0476
Rehabilitation Reserve | 复垦/恢复资金

### TRADE-U0477
Start Date | 开始

### TRADE-U0478
Development Period | 建设期

### TRADE-U0479
Operating Period | 运营期

### TRADE-U0480
Termination / Expropriation Clause | 终止与征收规则

### TRADE-U0481
20. Joint International Project 跨国联合项目

### TRADE-U0482
字段 | 定义

### TRADE-U0483
Project Type | Cross-border Railway / Pipeline / Power Grid / Port Network / Joint Research Centre / Industrial Corridor

### TRADE-U0484
Participants | 全部参与国家

### TRADE-U0485
Lead Country | 牵头国

### TRADE-U0486
Project Owner per Country | 各国内部 Owner Office

### TRADE-U0487
Total Cost | 总成本

### TRADE-U0488
Contribution by Country | 各国出资

### TRADE-U0489
Foreign Currency Contribution | 外币投入

### TRADE-U0490
Ownership Share | 产权分配

### TRADE-U0491
Voting Rule | 治理规则

### TRADE-U0492
Capacity Allocation | 产能使用权

### TRADE-U0493
Revenue Share | 收入分成

### TRADE-U0494
Transit Fee | 跨境通行费

### TRADE-U0495
Construction Milestones | 建设节点

### TRADE-U0496
Technology Responsibilities | 技术责任

### TRADE-U0497
Operating Responsibilities | 运营责任

### TRADE-U0498
Maintenance Cost Sharing | 维护费用分担

### TRADE-U0499
Withdrawal Rule | 退出规则

### TRADE-U0500
Default Rule | 不出资/不履约处理

### TRADE-U0501
Dispute Mechanism | 争端处理

### TRADE-U0502
End / Transfer Rule | 终止与移交

### TRADE-U0503
21. Trade Agreement 贸易协定

### TRADE-U0504
21.1 协定类型

### TRADE-U0505
类型 | 范围

### TRADE-U0506
Preferential Trade Agreement (PTA) | 逐商品优惠关税、配额、海关合作和有限市场准入。

### TRADE-U0507
Free Trade Agreement (FTA) | 逐商品关税表、配额、原产地、服务准入、投资准入、技术条款和争端机制。

### TRADE-U0508
Customs Cooperation Agreement | 海关数据、通关互认、检查协作和边境流程。

### TRADE-U0509
Sector Market Access Agreement | 对指定行业开放市场、许可和准入。

### TRADE-U0510
Multilateral Economic Agreement | 三国及以上共同适用的关税、市场、投资或标准规则。

### TRADE-U0511
字段 | 定义

### TRADE-U0512
Parties | 参与国

### TRADE-U0513
Effective Date | 生效

### TRADE-U0514
Expiry / Review | 到期/审查

### TRADE-U0515
Tariff Schedule | Country Pair × Commodity Rate

### TRADE-U0516
Quota Schedule | 商品与数量

### TRADE-U0517
Rules of Origin | Minimum Domestic Value Added %

### TRADE-U0518
Customs Rules | 通关规则

### TRADE-U0519
Services Access | 服务市场开放

### TRADE-U0520
Investment Access | 外资准入

### TRADE-U0521
Ownership Exceptions | 外资持股例外

### TRADE-U0522
Technology Provisions | 技术交易规则

### TRADE-U0523
Government Procurement | 政府采购开放规则

### TRADE-U0524
Safeguard Clause | 临时保护条款

### TRADE-U0525
Anti-circumvention | 规避条款

### TRADE-U0526
Dispute Settlement | 争端机制

### TRADE-U0527
Suspension Clause | 暂停条款

### TRADE-U0528
Withdrawal Notice | 退出提前通知期限

### TRADE-U0529
22. Reserve Swap 储备互换

### TRADE-U0530
字段 | 定义

### TRADE-U0531
Counterparty Country | 对手国家

### TRADE-U0532
Currency A | 本国/外币

### TRADE-U0533
Currency B | 对手币/GCU

### TRADE-U0534
Principal A | 金额

### TRADE-U0535
Principal B | 金额

### TRADE-U0536
Initial FX Rate | 初始换汇率

### TRADE-U0537
Maturity | 期限

### TRADE-U0538
Interest A | 利率

### TRADE-U0539
Interest B | 利率

### TRADE-U0540
Drawdown Rule | 提取规则

### TRADE-U0541
Repayment Rule | 归还规则

### TRADE-U0542
Collateral | 抵押

### TRADE-U0543
Default Clause | 违约

### TRADE-U0544
Renewal Option | 续期

### TRADE-U0545
Trade 负责国际谈判与对手方条款；Central Bank 对货币、外储、金额、期限和资产负债表影响拥有必要批准；Captain 对战略级互换拥有最终政治批准。

### TRADE-U0546
23. Sanctions 制裁机制

### TRADE-U0547
Sanctions 不使用 Intensity 0–100。每个 Sanction Package 由具体限制条款组成。

### TRADE-U0548
制裁条款 | 执行定义

### TRADE-U0549
Goods Import Ban | 禁止从目标国进口指定 Commodity

### TRADE-U0550
Goods Export Ban | 禁止向目标国出口指定 Commodity

### TRADE-U0551
Technology Licence Ban | 禁止向目标国授予或从目标国购买指定 Technology Licence

### TRADE-U0552
Technology Export Control | 限制指定技术、设备或技术服务

### TRADE-U0553
New FDI Ban | 禁止新增来自/流向目标国的 FDI

### TRADE-U0554
Ownership Acquisition Ban | 禁止目标国投资者购买指定资产或行业股权

### TRADE-U0555
New Sovereign Loan Ban | 禁止新增政府贷款

### TRADE-U0556
Financial Transaction Restriction | 禁止指定金融支付类型

### TRADE-U0557
Asset Freeze | 冻结可识别的目标国政府/国有资产

### TRADE-U0558
Government Contract Ban | 禁止政府与目标国签订新合同

### TRADE-U0559
Strategic Goods Embargo | 禁止战略商品进出口

### TRADE-U0560
Exemption Schedule | 允许 Food / Critical Humanitarian / Existing Contract 等系统定义例外

### TRADE-U0561
Sanction Package 必填字段 | 定义

### TRADE-U0562
Target Country | 目标国

### TRADE-U0563
Measures | 上述措施组合

### TRADE-U0564
Target Commodity / Technology / Sector | 适用对象

### TRADE-U0565
Start Time | 开始

### TRADE-U0566
End Condition | 结束日期或条件

### TRADE-U0567
Exemptions | 豁免

### TRADE-U0568
Grandfather Existing Contracts | 既有合同是否豁免

### TRADE-U0569
Required Approvals | Trade / CB / Captain 按措施自动生成

### TRADE-U0570
24. International Aid & Emergency Assistance 国际援助

### TRADE-U0571
类型 | 完整经济表示

### TRADE-U0572
Grant Aid | GCU / 本币金额，无偿转移

### TRADE-U0573
Commodity Aid | 固定商品 + 数量，无偿或优惠交付

### TRADE-U0574
Emergency Concessional Loan | 本金、优惠利率、期限、宽限期

### TRADE-U0575
Emergency Supply Contract | 紧急商品合同，允许短交付周期和特殊付款

### TRADE-U0576
Technical Assistance | 技术支持、专家与技术服务权利

### TRADE-U0577
Project Reconstruction Aid | 指定项目恢复资金与用途约束

### TRADE-U0578
任何商品援助必须真实减少援助国库存并增加受援国到货库存；任何财政援助必须真实形成 Treasury 资金流或债权债务。

### TRADE-U0579
25. International Tender 国际招标

### TRADE-U0580
字段 | 定义

### TRADE-U0581
Tender Type | Commodity Procurement / Technology / Project Finance / FDI / Infrastructure Contractor

### TRADE-U0582
Requesting Country | 发起国

### TRADE-U0583
Underlying Need / Project | 需求或项目

### TRADE-U0584
Commodity / Technology / Project | 标的

### TRADE-U0585
Required Quantity / Capital | 数量或金额

### TRADE-U0586
Maximum Price / Required Return | 最高价格或回报约束

### TRADE-U0587
Delivery / Completion Window | 交付或完工区间

### TRADE-U0588
Currency | 币种

### TRADE-U0589
Minimum Reliability Conditions | 履约条件

### TRADE-U0590
Minimum Technology Conditions | 技术条件

### TRADE-U0591
Ownership Limit | 外资标适用

### TRADE-U0592
Submission Deadline | 投标截止

### TRADE-U0593
Partial Award Allowed | 是否允许拆标

### TRADE-U0594
Evaluation Rule | Price / Reliability / Financing / Strategic Conditions 的权重规则

### TRADE-U0595
Award Status | Open / Evaluating / Awarded / Cancelled

### TRADE-U0596
25.1 Bid 字段

### TRADE-U0597
字段 | 定义

### TRADE-U0598
Bidder Country | 投标国

### TRADE-U0599
Offered Quantity / Capital | 数量/资金

### TRADE-U0600
Unit Price / Return | 报价

### TRADE-U0601
Delivery Schedule | 交付

### TRADE-U0602
Payment Terms | 付款

### TRADE-U0603
Technology / Investment Terms | 附加条件

### TRADE-U0604
Validity | 报价有效期

### TRADE-U0605
Bid Version | 版本

### TRADE-U0606
26. Strategic Economic Partnership 战略经济伙伴关系

### TRADE-U0607
Strategic Partnership 是多个具体合同、协定和共同项目的组合容器，不直接给予抽象经济 Buff。

### TRADE-U0608
字段 | 定义

### TRADE-U0609
Partner Countries | 伙伴国

### TRADE-U0610
Strategic Scope | Resources / Technology / Trade / Investment / Finance / Infrastructure

### TRADE-U0611
Component Agreements | 所有绑定的合同与条约 ID

### TRADE-U0612
Joint Governance | 协调机制

### TRADE-U0613
Review Interval | 复审周期

### TRADE-U0614
Entry Conditions | 加入条件

### TRADE-U0615
Exit Conditions | 退出条件

### TRADE-U0616
Crisis Consultation | 危机协调义务

### TRADE-U0617
Confidential / Public Terms | 公开与内部条款

### TRADE-U0618
Captain Approval | 必须

### TRADE-U0619
27. Trade Dispute & Settlement 国际争端

### TRADE-U0620
可正式立案的争端触发

### TRADE-U0621
Contract delivery shortfall

### TRADE-U0622
Late payment

### TRADE-U0623
Non-payment

### TRADE-U0624
Quality failure

### TRADE-U0625
Tariff treaty violation

### TRADE-U0626
Quota treaty violation

### TRADE-U0627
Rules of origin violation

### TRADE-U0628
FDI ownership violation

### TRADE-U0629
Technology licence misuse

### TRADE-U0630
Unauthorised sub-licensing

### TRADE-U0631
Royalty non-payment

### TRADE-U0632
Sovereign loan default

### TRADE-U0633
Resource sharing breach

### TRADE-U0634
Joint project contribution default

### TRADE-U0635
Sanction clause breach

### TRADE-U0636
Aid-use condition breach

### TRADE-U0637
27.1 Settlement 动作

### TRADE-U0638
动作 | 结果

### TRADE-U0639
Negotiate Settlement | 双方创建结构化和解条款

### TRADE-U0640
Compensation Payment | 产生真实付款义务

### TRADE-U0641
Replacement Delivery | 创建补交货物义务

### TRADE-U0642
Price Adjustment | 修改未来合同价格

### TRADE-U0643
Debt Rescheduling | 修改付款与到期

### TRADE-U0644
Contract Suspension | 暂停履约

### TRADE-U0645
Contract Termination | 提前终止

### TRADE-U0646
Tariff Retaliation | 创建双边关税 Override

### TRADE-U0647
Quota Retaliation | 创建双边配额限制

### TRADE-U0648
Treaty Suspension | 暂停协定适用

### TRADE-U0649
Multilateral Mediation | 进入多边调解流程

### TRADE-U0650
Waiver | 受损方正式放弃部分权利

### TRADE-U0651
28. FDI Screening 与外国所有权规则

### TRADE-U0652
FDI Screening 不使用 0–100。Trade 维护结构化 Sector Rule。

### TRADE-U0653
字段 | 定义

### TRADE-U0654
Sector | 产业

### TRADE-U0655
Status | Open / Approval Required / Restricted / Prohibited

### TRADE-U0656
Foreign Ownership Cap | 0%–100%

### TRADE-U0657
Single Foreign Country Cap | 单一来源国持股上限

### TRADE-U0658
Government Approval Threshold | 超过金额需要审批

### TRADE-U0659
Strategic Asset Flag | 是否战略资产

### TRADE-U0660
Technology Transfer Requirement | 是否要求

### TRADE-U0661
Local Employment Requirement | 最低比例

### TRADE-U0662
Local Procurement Requirement | 最低比例

### TRADE-U0663
Profit Repatriation Limit | 汇回限制

### TRADE-U0664
Special Captain Approval | 是否需要

### TRADE-U0665
29. Customs & Border Administration 海关与边境管理

### TRADE-U0666
指标 | 单位/定义

### TRADE-U0667
Average Clearance Time | 模拟日

### TRADE-U0668
Processing Capacity | shipments / 模拟日

### TRADE-U0669
Inspection Capacity | shipments / 模拟日

### TRADE-U0670
Tariff Collection Due | 应收关税

### TRADE-U0671
Tariff Collection Received | 实收关税

### TRADE-U0672
Customs Arrears | 欠缴

### TRADE-U0673
Border Congestion | 排队货物数量与预计延迟

### TRADE-U0674
Blocked Shipments | 因禁令/制裁/文件问题冻结数量

### TRADE-U0675
29.1 Trade 可操作项

### TRADE-U0676
动作 | 规则

### TRADE-U0677
Set Customs Inspection Rule | 按 Commodity / Origin 设定检查要求

### TRADE-U0678
Set Documentation Requirement | 按交易类型设定文件要求

### TRADE-U0679
Release Blocked Shipment | 仅在限制解除或补齐条件后

### TRADE-U0680
Initiate Customs Modernisation Project | Trade 为 Project Owner，Finance 负责融资

### TRADE-U0681
Negotiate Mutual Customs Recognition | 通过双边/多边协议降低重复检查

### TRADE-U0682
30. Trade Finance Guarantee 贸易融资担保

### TRADE-U0683
字段 | 定义

### TRADE-U0684
Underlying Export Contract | 出口合同

### TRADE-U0685
Exporter Sector | 出口行业

### TRADE-U0686
Financing Bank / Lender | 融资方

### TRADE-U0687
Loan Principal | 贷款本金

### TRADE-U0688
Guarantee % | 政府担保比例

### TRADE-U0689
Maximum Fiscal Exposure | 最大财政敞口

### TRADE-U0690
Guarantee Fee | 担保费

### TRADE-U0691
Maturity | 期限

### TRADE-U0692
Claim Trigger | 索赔触发

### TRADE-U0693
Recovery Rights | 代偿后追索权

### TRADE-U0694
Status | Proposed / Approved / Active / Claimed / Expired

### TRADE-U0695
Trade 发起并证明出口合同需求；Finance 对政府担保承担、费率和最大财政风险拥有必要批准。

### TRADE-U0696
31. Economic Diplomacy 经济外交

### TRADE-U0697
Trade 可独立发起的经济谈判

### TRADE-U0698
Bilateral Trade Negotiation

### TRADE-U0699
Tariff Negotiation

### TRADE-U0700
Quota Negotiation

### TRADE-U0701
Market Access Negotiation

### TRADE-U0702
Investment Negotiation

### TRADE-U0703
Technology Negotiation

### TRADE-U0704
Resource Supply Negotiation

### TRADE-U0705
Trade Dispute Negotiation

### TRADE-U0706
Customs Cooperation Negotiation

### TRADE-U0707
International Tender Negotiation

### TRADE-U0708
Commercial Contract Negotiation

### TRADE-U0709
必须升级 Captain 的外交事项

### TRADE-U0710
Free Trade Agreement

### TRADE-U0711
Strategic Economic Partnership

### TRADE-U0712
Multilateral Economic Treaty

### TRADE-U0713
Major Sanctions Package

### TRADE-U0714
Strategic Resource Alliance

### TRADE-U0715
Security-linked Economic Agreement

### TRADE-U0716
Strategic Asset Foreign Ownership Approval

### TRADE-U0717
Major Sovereign Financial Commitment

### TRADE-U0718
32. Partner Profile 与 Supply Chain Intelligence

### TRADE-U0719
Partner Profile 字段 | 定义

### TRADE-U0720
Bilateral Imports | 本国从对方进口，按商品

### TRADE-U0721
Bilateral Exports | 本国向对方出口，按商品

### TRADE-U0722
Trade Balance | 双边净额

### TRADE-U0723
Effective Tariffs | 双方 Country × Commodity 税率

### TRADE-U0724
Quota / Ban | 双方限制

### TRADE-U0725
Active Contracts | 全部有效合同

### TRADE-U0726
Contract History | Completed / Delayed / Defaulted / Disputed

### TRADE-U0727
FDI Positions | 双方股权与项目

### TRADE-U0728
Sovereign Debt Position | 双方债权债务

### TRADE-U0729
Technology Licences | 双方许可

### TRADE-U0730
Treaties | 现行协定

### TRADE-U0731
Sanctions | 现行限制

### TRADE-U0732
Critical Dependency | 关键进口依赖

### TRADE-U0733
Partner Dependency on Us | 对方对本国关键依赖

### TRADE-U0734
Upcoming Contract Expiry | 即将到期

### TRADE-U0735
32.1 Supply Chain Exposure

### TRADE-U0736
字段 | 定义

### TRADE-U0737
Domestic Sector | 产业

### TRADE-U0738
Required Input | 投入品

### TRADE-U0739
Domestic Share | 国内供应比例

### TRADE-U0740
Import Share | 进口比例

### TRADE-U0741
Top Foreign Supplier | 最大来源国

### TRADE-U0742
Top Supplier Share | 依赖比例

### TRADE-U0743
Active Contract Coverage | 未来需求已有合同覆盖

### TRADE-U0744
Uncovered Requirement | 未覆盖数量

### TRADE-U0745
Technology Dependency | 外国技术许可依赖

### TRADE-U0746
Critical Logistics Dependency | 跨境物流依赖

### TRADE-U0747
33. 通知、Inbox 与到期管理

### TRADE-U0748
Trade Inbox 事件类型

### TRADE-U0749
New Foreign Offer

### TRADE-U0750
Counteroffer Received

### TRADE-U0751
Offer Accepted Commercially

### TRADE-U0752
Internal Approval Required

### TRADE-U0753
Partner Internal Approval Pending

### TRADE-U0754
Signature Required

### TRADE-U0755
Contract Activated

### TRADE-U0756
Shipment Dispatched

### TRADE-U0757
Shipment Delayed

### TRADE-U0758
Delivery Shortfall

### TRADE-U0759
Delivery Arrived

### TRADE-U0760
Payment Due

### TRADE-U0761
Payment Late

### TRADE-U0762
Payment Default

### TRADE-U0763
Quota Near Exhaustion

### TRADE-U0764
Quota Exhausted

### TRADE-U0765
Tariff Change by Partner

### TRADE-U0766
New Sanction Affecting Contract

### TRADE-U0767
Contract Suspended

### TRADE-U0768
Contract Dispute Filed

### TRADE-U0769
Renegotiation Requested

### TRADE-U0770
Contract Expiring

### TRADE-U0771
Technology Licence Expiring

### TRADE-U0772
Sovereign Loan Payment Due

### TRADE-U0773
FDI Profit Repatriation Due

### TRADE-U0774
Tender Bid Received

### TRADE-U0775
Tender Deadline Approaching

### TRADE-U0776
Treaty Review Due

### TRADE-U0777
Supply Chain Critical Shortage

### TRADE-U0778
34. 与其他五个 Office 的共享权限

### TRADE-U0779
Office | 共享事项 | 权限边界

### TRADE-U0780
Captain | FTA、战略伙伴关系、多边条约、重大制裁、战略资源联盟、战略资产外资、重大主权金融承诺 | Trade 谈具体经济条款；Captain 决定国家战略承诺与最终签署。

### TRADE-U0781
Central Bank | Official Reserve Payment、Reserve Swap、Capital Controls、Financial Sanctions、FX Emergency | Trade 管跨境交易与谈判；CB 管货币、外储和金融稳定。

### TRADE-U0782
Finance | Sovereign Loan、Infrastructure Finance、Trade Guarantee、政府采购付款、外资财政条件 | Trade 管外部对手与合同；Finance 管 Treasury、债务、担保和财政风险。

### TRADE-U0783
Industry | Technology Licence、Resource Agreement、FDI Industrial Project、Strategic Supply、Joint Project | Industry 管生产、技术和项目；Trade 管外国资源、技术、资本和市场。

### TRADE-U0784
Social | 重大劳工条款、外国项目就业条件、移民相关经济协定、贸易冲击就业协调 | Social 管劳动与社会政策；Trade 管跨国经济条款。

### TRADE-U0785
35. 内部审批与签署权限矩阵

### TRADE-U0786
活动 | 发起/Owner | Required Approval | 签署权限

### TRADE-U0787
Spot Commodity Trade | Trade | Trade | Trade

### TRADE-U0788
Ordinary Commodity Contract | Trade | Trade | Trade

### TRADE-U0789
Large Government Commodity Purchase | Trade | Finance if Treasury funds; CB if official reserves | Trade after approvals

### TRADE-U0790
Commercial Technology Licence | Trade + Industry | Finance if government payment | Trade

### TRADE-U0791
Strategic Technology Licence | Trade + Industry | Captain if strategic; Finance if fiscal | Trade/Captain by classification

### TRADE-U0792
Ordinary FDI Project | Trade + Project Owner | Finance if public fiscal exposure | Trade after host rules

### TRADE-U0793
Strategic FDI / Strategic Asset | Trade + Project Owner | Finance + Captain | Captain final

### TRADE-U0794
Sovereign Loan | Trade + Finance | Captain | Captain / Finance authorised signatory

### TRADE-U0795
Infrastructure Finance | Trade + Project Owner + Finance | Captain if strategic/large | Authorised offices

### TRADE-U0796
Resource Development | Trade + Industry + Finance | Captain if strategic resource | Authorised offices

### TRADE-U0797
Joint International Project | Trade + Project Owner + Finance | Captain if strategic/large | Captain/authorised offices

### TRADE-U0798
PTA | Trade | Captain notification/approval per scope | Trade + Captain if strategic

### TRADE-U0799
FTA | Trade | Captain | Captain

### TRADE-U0800
Reserve Swap | Trade + CB | Captain | CB/Captain authorised

### TRADE-U0801
Capital Controls | Trade + CB | Captain | Captain

### TRADE-U0802
Trade Sanctions | Trade | Captain if major | Trade/Captain

### TRADE-U0803
Financial Sanctions | Trade + CB | Captain | Captain

### TRADE-U0804
Aid Grant | Trade + Finance | Captain above threshold | Finance/Captain authorised

### TRADE-U0805
International Tender | Trade / relevant Project Owner | Finance if purchase/fiscal | Owner/Trade after award approval

### TRADE-U0806
36. 信息优势与只读权限

### TRADE-U0807
Trade 专属详细信息

### TRADE-U0808
完整全球商品可售供给与未覆盖需求

### TRADE-U0809
全部国际报价与 Counteroffer

### TRADE-U0810
双边 Tariff Matrix

### TRADE-U0811
国别 Import/Export Quota 使用量

### TRADE-U0812
合同付款与交付时间表

### TRADE-U0813
Partner Contract Performance History

### TRADE-U0814
双边贸易依赖

### TRADE-U0815
对手国家对本国关键依赖

### TRADE-U0816
Supply Chain Exposure

### TRADE-U0817
Technology Licence Availability

### TRADE-U0818
FDI Opportunity Pipeline

### TRADE-U0819
Foreign Financing Offer Pipeline

### TRADE-U0820
国际招标 Bid Book

### TRADE-U0821
全部贸易争端档案

### TRADE-U0822
Captain 获得国家级外部风险摘要；Finance、Industry、Central Bank、Social 仅获得与其审批和职责直接相关的合同字段。

### TRADE-U0823
37. Trade Office 评分与 National Guardrails

### TRADE-U0824
维度 | 权重 | 计算方向

### TRADE-U0825
Trade Performance | 20% | 按实际出口、进口效率、贸易余额的可持续性与相对初始条件计算

### TRADE-U0826
Supply Security | 20% | 关键进口覆盖、供应缺口、合同覆盖和来源集中风险

### TRADE-U0827
Contract Performance | 15% | 按时交付、按时付款、违约和争端

### TRADE-U0828
Export Market Development | 15% | 新增稳定出口市场与出口结构

### TRADE-U0829
Partner Diversification | 10% | 关键商品来源与主要出口市场集中度

### TRADE-U0830
International Investment | 10% | 有效 FDI、国际项目与资本引入质量

### TRADE-U0831
Strategic Economic Relations | 10% | 有效长期协定、资源、技术和战略合作

### TRADE-U0832
37.1 National Guardrails

### TRADE-U0833
不得通过出口关键生活商品导致国内严重短缺来提高 Trade Score。

### TRADE-U0834
不得通过极端进口压低国内产业而无视国家长期战略来提高分数。

### TRADE-U0835
不得通过大量高风险外国融资制造不可持续外债来提高国际资本指标。

### TRADE-U0836
不得通过高度集中于单一供应国而获得短期低价却制造系统性供应风险。

### TRADE-U0837
不得通过违约、拒付或强制撕毁合同获得短期贸易利益。

### TRADE-U0838
制裁导致本国关键供应链崩溃时必须计入 Trade 负面表现。

### TRADE-U0839
38. 核心数据实体与数据库字段

### TRADE-U0840
实体 | 核心字段

### TRADE-U0841
trade_tariff_general | country_id, commodity_id, rate, effective_from, expiry, status

### TRADE-U0842
trade_tariff_bilateral | importer_id, exporter_id, commodity_id, rate, effective_from, expiry, reason

### TRADE-U0843
trade_quota | country_id, partner_id nullable, commodity_id, direction, quantity_limit, quantity_used, period_start, period_end

### TRADE-U0844
market_order | order_id, country_id, side, commodity_id, qty, remaining_qty, limit_price, currency, delivery_window, status

### TRADE-U0845
market_fill | fill_id, buy_order, sell_order, qty, unit_price, matched_at

### TRADE-U0846
shipment | shipment_id, source_object, commodity_id, qty, origin, destination, dispatch, expected_arrival, actual_arrival, status

### TRADE-U0847
payment_obligation | payment_id, payer, payee, currency, amount, due_at, trigger, source, status

### TRADE-U0848
negotiation | negotiation_id, activity_type, parties, owner_office, status

### TRADE-U0849
negotiation_version | negotiation_id, version, fields_json, sender, sent_at

### TRADE-U0850
internal_approval | object_id, version, office, decision, decided_by, decided_at

### TRADE-U0851
international_contract | contract_id, contract_type, parties, signed_version, start, end, status

### TRADE-U0852
contract_obligation | contract_id, obligation_type, due_at, qty_or_amount, status

### TRADE-U0853
technology_licence | contract_id, technology_id, rights, fees, royalty, limits, expiry

### TRADE-U0854
fdi_position | investment_id, investor, host, project, equity, debt, ownership, governance, repatriation

### TRADE-U0855
sovereign_loan | loan_id, lender, borrower, currency, principal, rate, maturity, outstanding

### TRADE-U0856
resource_agreement | agreement_id, resource, field, ownership, royalty, production_share, obligations

### TRADE-U0857
trade_agreement | agreement_id, parties, type, effective, expiry, tariff_schedule, quota_schedule, status

### TRADE-U0858
sanction_package | sanction_id, issuer, target, measures, scope, start, end_condition, exemptions

### TRADE-U0859
trade_dispute | dispute_id, claimant, respondent, trigger, source_object, status, settlement

### TRADE-U0860
partner_profile_cache | country_pair, bilateral_trade, dependencies, contracts, investment, debt, technology, treaties

### TRADE-U0861
39. 核心计算与结算规则

### TRADE-U0862
计算 | 规则

### TRADE-U0863
Effective Tariff | 按优先级解析 Sanction/Import Ban → Treaty Rate → Bilateral Override → General Tariff

### TRADE-U0864
Tariff Revenue | CustomsValue × EffectiveTariffRate

### TRADE-U0865
Landed Cost | GoodsValue + Transport + Insurance + Tariff + BorderFees

### TRADE-U0866
Import Need | max(0, Demand + StrategicTarget − Production − UsableInventory − ContractedInbound)

### TRADE-U0867
Exportable Supply | max(0, Production + UsableInventory + Inbound − Demand − StrategicMinimum − ExistingExportObligations)

### TRADE-U0868
Quota Remaining | QuantityLimit − DeliveredAgainstQuota − ReservedByBindingObligations

### TRADE-U0869
Contract Payment | DeliveredQty × ContractPrice + AllocatedCosts + Fees − Credits/Penalties

### TRADE-U0870
Supplier Share | ImportsFromPartner / TotalImportsOfCommodity

### TRADE-U0871
Buyer Share | ExportsToPartner / TotalExportsOfCommodity

### TRADE-U0872
Partner Concentration HHI | Σ supplier_share² 或 buyer_share²

### TRADE-U0873
FDI Income Outflow | DistributableProfit × ForeignOwnership × RepatriationRule

### TRADE-U0874
Sovereign Loan Interest | OutstandingPrincipal × ContractRate × TimeFraction

### TRADE-U0875
Royalty Payment | RoyaltyBase × RoyaltyRate 或 Fixed Periodic Amount

### TRADE-U0876
Delivery Shortfall | ScheduledQuantity − DeliveredQuantity

### TRADE-U0877
40. 前端全部操作控件

### TRADE-U0878
页面 | 全部操作

### TRADE-U0879
Global Market | Search, Filter, Buy Order, Sell Order, Cancel Order, View Market Depth

### TRADE-U0880
Tariffs | Edit General Rate, Add Bilateral Override, Schedule Change, Repeal Override, View Effective Rate

### TRADE-U0881
Quotas | Create Global Quota, Create Country Quota, Amend, Repeal, View Usage

### TRADE-U0882
Export Controls | Create Export Cap, Destination Cap, Export Ban, Repeal

### TRADE-U0883
Negotiations | Start, Draft, Send, Counteroffer, Compare Version, Accept Terms, Withdraw, Terminate

### TRADE-U0884
Approvals | Request Internal Approval, Approve, Reject, Request Revision

### TRADE-U0885
Contracts | Sign, Activate, View Obligations, Request Renegotiation, Suspend if authorised, Terminate if clause allows

### TRADE-U0886
Shipments | View Scheduled, View Transit, Report/Receive Delay, Confirm Delivery where required

### TRADE-U0887
Payments | View Due, Request Official FX, Confirm Government Payment routing, Flag Late Payment

### TRADE-U0888
FDI | Create/Receive Proposal, Screen, Negotiate, Submit for Approval, Approve under Trade authority

### TRADE-U0889
Technology | Search Available Licence, Initiate Licence Negotiation, Offer Domestic Licence

### TRADE-U0890
Tender | Create RFB/RFP, Publish, Receive Bids, Compare, Shortlist, Award, Split Award, Cancel

### TRADE-U0891
Treaties | Draft Tariff Schedule, Negotiate, Submit Captain Approval, Sign, Review, Withdraw per clause

### TRADE-U0892
Sanctions | Create Package, Select Measures, Scope Goods/Tech/Sector, Set Exemptions, Submit Approvals, Repeal

### TRADE-U0893
Disputes | File, Respond, Propose Settlement, Accept Settlement, Escalate, Close

### TRADE-U0894
Partner Profile | Search Country, View Bilateral Data, Initiate Negotiation

### TRADE-U0895
Inbox | Open Notification, Navigate to Object, Snooze non-critical, Mark Reviewed

### TRADE-U0896
41. Audit Ledger 与不可篡改事件记录

### TRADE-U0897
Audit Event Type

### TRADE-U0898
TariffCreated

### TRADE-U0899
TariffChanged

### TRADE-U0900
TariffRepealed

### TRADE-U0901
QuotaCreated

### TRADE-U0902
QuotaChanged

### TRADE-U0903
QuotaExhausted

### TRADE-U0904
ExportControlCreated

### TRADE-U0905
OrderPlaced

### TRADE-U0906
OrderPartiallyFilled

### TRADE-U0907
OrderFilled

### TRADE-U0908
OrderCancelled

### TRADE-U0909
ShipmentScheduled

### TRADE-U0910
ShipmentDispatched

### TRADE-U0911
ShipmentDelayed

### TRADE-U0912
ShipmentDelivered

### TRADE-U0913
DeliveryShortfall

### TRADE-U0914
PaymentScheduled

### TRADE-U0915
PaymentPaid

### TRADE-U0916
PaymentLate

### TRADE-U0917
PaymentDefaulted

### TRADE-U0918
NegotiationStarted

### TRADE-U0919
OfferSent

### TRADE-U0920
CounterofferSent

### TRADE-U0921
CommercialTermsAccepted

### TRADE-U0922
InternalApprovalRequested

### TRADE-U0923
InternalApprovalGranted

### TRADE-U0924
InternalApprovalRejected

### TRADE-U0925
ContractSigned

### TRADE-U0926
ContractActivated

### TRADE-U0927
ContractSuspended

### TRADE-U0928
ContractRenegotiationStarted

### TRADE-U0929
ContractDefaulted

### TRADE-U0930
ContractCompleted

### TRADE-U0931
ContractTerminated

### TRADE-U0932
FDIProposalCreated

### TRADE-U0933
FDIApproved

### TRADE-U0934
TechnologyLicenceGranted

### TRADE-U0935
SovereignLoanDisbursed

### TRADE-U0936
LoanPaymentDue

### TRADE-U0937
LoanPaymentMade

### TRADE-U0938
SanctionCreated

### TRADE-U0939
SanctionApplied

### TRADE-U0940
SanctionRepealed

### TRADE-U0941
DisputeFiled

### TRADE-U0942
SettlementSigned

### TRADE-U0943
TenderPublished

### TRADE-U0944
BidSubmitted

### TRADE-U0945
TenderAwarded

### TRADE-U0946
所有 Ledger Event 必须记录 event_id、simulation_id、country_id、actor_user_id、actor_office、object_id、object_version、timestamp、before_state_hash、after_state_hash、structured_payload。

### TRADE-U0947
42. 旧版 World Simulation 迁移规则

### TRADE-U0948
旧版机制 | Season 1 迁移

### TRADE-U0949
Average Tariff Rate | 删除为核心控制；迁移为 12 商品 General Tariff Schedule 的初始值或按旧值生成统一初始税率。

### TRADE-U0950
Import Quota 0–100 | 删除；改为商品实际数量额度。

### TRADE-U0951
Export Restriction 0–100 | 删除；改为 Export Cap / Export Ban。

### TRADE-U0952
Capital Outflow Control 0–100 | 删除；改为具体跨境金融规则，进入 Trade + CB + Captain 共享决策。

### TRADE-U0953
FDI Screening 0–100 | 删除；改为 Sector Status、Ownership Cap、Approval Threshold、Strategic Asset Rules。

### TRADE-U0954
Trade Finance Guarantee 0–80% slider | 删除；改为逐笔 Guarantee 合同并由 Finance 批准财政敞口。

### TRADE-U0955
Sanction Intensity 0–100 | 删除；改为具体 Sanction Package。

### TRADE-U0956
Customs Efficiency Investment %GDP | 删除为直接 slider；改为 Customs Modernisation Project + 实际通关能力。

### TRADE-U0957
旧 International Contract Types | 保留其思想并拆分为本规范的结构化合同与跨国活动。

### TRADE-U0958
Draft/Sent/Counteroffer/Awaiting Approval/Approved/Active/Delayed/Disputed/Defaulted/Completed/Terminated | 保留并扩展 Negotiating、Signed、Suspended、Renegotiating、Partially Defaulted、Expired。

### TRADE-U0959
43. 工程验收 Checklist

### TRADE-U0960
□ General Tariff 对 12 商品全部可设置且可以产生 Country-Specific Override。

### TRADE-U0961
□ 实际 Effective Tariff 能正确按 Sanction / Ban / Treaty / Bilateral / General 优先级解析。

### TRADE-U0962
□ 关税收入真实进入 Finance/Treasury 相关账本。

### TRADE-U0963
□ Quota 使用量基于实际交付和预留义务，不是 UI 状态。

### TRADE-U0964
□ Spot 买卖不能超过可售供给、买方限价、配额和制裁限制。

### TRADE-U0965
□ 任何商品成交都生成 Shipment 与 Payment Obligation。

### TRADE-U0966
□ 未 Delivered 的货物不得进入买方可用库存。

### TRADE-U0967
□ 卖方库存不足能触发 Shortfall 而不是凭空交付。

### TRADE-U0968
□ 普通跨国付款进入 FX Market，不自动扣 Central Bank 官方外储。

### TRADE-U0969
□ Official Reserve Payment 必须经过 CB 审批。

### TRADE-U0970
□ 所有复杂国际交易使用 Negotiation Versioning。

### TRADE-U0971
□ 审批绑定版本，条款修改后旧审批失效。

### TRADE-U0972
□ 合同状态机可以完整流转且所有状态有审计事件。

### TRADE-U0973
□ Commodity Contract 可以逐期交付、逐期付款、延迟、短交、违约和重谈。

### TRADE-U0974
□ Technology Licence 能控制 Industry 的技术访问权限。

### TRADE-U0975
□ FDI 能形成真实股权、利润权、汇回和退出条款。

### TRADE-U0976
□ Sovereign Loan 能形成真实本金余额、利息、偿付和违约。

### TRADE-U0977
□ Infrastructure Finance 能支持 Loan / Equity / BOT / Concession。

### TRADE-U0978
□ Resource Agreement 能产生资源产能、分成、Royalty 和国内供应义务。

### TRADE-U0979
□ Joint Project 能支持多国出资、治理、产能和收入分配。

### TRADE-U0980
□ FTA/PTA 的关税表能实际覆盖 Tariff Matrix。

### TRADE-U0981
□ Sanction Package 能实际阻断对应商品、技术、投资或金融交易。

### TRADE-U0982
□ International Tender 能收集多个国家 Bid 并支持拆分授标。

### TRADE-U0983
□ Dispute 能绑定具体合同/条约并执行补偿、补交、暂停或终止。

### TRADE-U0984
□ Partner Profile 能显示完整双边贸易、合同、投资、技术、债务、关税和依赖。

### TRADE-U0985
□ Trade 与 Finance / Industry / CB / Captain 的 Required Approval 自动按活动类型生成。

### TRADE-U0986
□ Trade Office 无法越权修改国内产量、政府预算、政策利率、官方外储或福利。

### TRADE-U0987
□ 所有操作写入 Audit Ledger。

### TRADE-U0988
□ 70 国环境下 Partner Search、Inbox、合同筛选和 Tariff 管理不要求人工浏览全矩阵。

### TRADE-U0989
□ 跨国流量最终能传导到库存、Treasury/FX、产业投入、当前账户、价格与国家指标。

### TRADE-U0990
附录 A：Trade Office 全部操作空间总表

### TRADE-U0991
模块 | 动作 | 权限 | 完整输入

### TRADE-U0992
Global Market | Place Buy Order | Trade exclusive | Commodity, Qty, Max Price, Currency, Delivery Window

### TRADE-U0993
Global Market | Place Sell Order | Trade exclusive | Commodity, Qty, Min Price, Currency, Delivery Window

### TRADE-U0994
Global Market | Cancel Unfilled Order | Trade exclusive | Order ID

### TRADE-U0995
Tariff | Set General Tariff | Trade exclusive | Commodity, Rate, Effective Time

### TRADE-U0996
Tariff | Set Bilateral Override | Trade exclusive / treaty constraints | Partner, Commodity, Rate, Expiry

### TRADE-U0997
Tariff | Repeal Override | Trade exclusive | Override ID

### TRADE-U0998
Quota | Set Global Import Quota | Trade exclusive | Commodity, Qty, Period

### TRADE-U0999
Quota | Set Bilateral Import Quota | Trade exclusive | Partner, Commodity, Qty, Period

### TRADE-U1000
Export Control | Set Global Export Cap | Trade exclusive | Commodity, Qty, Period

### TRADE-U1001
Export Control | Set Destination Export Cap | Trade exclusive | Partner, Commodity, Qty, Period

### TRADE-U1002
Export Control | Create Export Ban | Trade; Captain if strategic escalation | Partner optional, Commodity, Start/End

### TRADE-U1003
Commodity Contract | Initiate / Offer / Counteroffer | Trade exclusive | Full Commodity Contract Schema

### TRADE-U1004
Commodity Contract | Sign Ordinary Contract | Trade exclusive | Approved Version

### TRADE-U1005
Commodity Contract | Renegotiate | Trade + counterparty | Affected fields

### TRADE-U1006
Technology | Acquire Licence | Trade + Industry; Finance if public payment | Full Licence Schema

### TRADE-U1007
Technology | Licence Domestic Technology | Trade + Industry | Full Licence Schema

### TRADE-U1008
FDI | Receive/Initiate FDI Proposal | Trade + Project Owner | Full FDI Schema

### TRADE-U1009
FDI | Apply Screening Rules | Trade exclusive | Sector Rules

### TRADE-U1010
FDI | Submit Strategic FDI | Trade + Owner + Finance + Captain | Approved FDI Version

### TRADE-U1011
Sovereign Loan | Negotiate | Trade + Finance | Full Loan Schema

### TRADE-U1012
Infrastructure Finance | Negotiate | Trade + Project Owner + Finance | Full Infrastructure Finance Schema

### TRADE-U1013
Resource Development | Negotiate | Trade + Industry + Finance | Full Resource Schema

### TRADE-U1014
Joint Project | Negotiate | Trade + Project Owner + Finance | Full Joint Project Schema

### TRADE-U1015
PTA | Negotiate | Trade; Captain by scope | Tariff/Quota/Customs Schedule

### TRADE-U1016
FTA | Negotiate | Trade + Captain | Full Treaty Schema

### TRADE-U1017
Reserve Swap | Negotiate | Trade + CB + Captain | Full Swap Schema

### TRADE-U1018
Sanctions | Create Goods Package | Trade; Captain if major | Target, Goods Measures, Exemptions

### TRADE-U1019
Sanctions | Create Financial Package | Trade + CB + Captain | Target, Financial Measures, Exemptions

### TRADE-U1020
Aid | Grant / Commodity / Emergency Loan | Trade + Finance; Captain above threshold | Aid Schema

### TRADE-U1021
Tender | Publish International Tender | Trade / relevant Owner | Tender Schema

### TRADE-U1022
Tender | Evaluate/Award | Trade + Owner; Finance if fiscal | Bid Selection

### TRADE-U1023
Strategic Partnership | Negotiate | Trade + Captain + relevant offices | Component Agreements

### TRADE-U1024
Dispute | File Dispute | Trade | Trigger, Source Object, Claim

### TRADE-U1025
Dispute | Negotiate Settlement | Trade + affected offices | Settlement Terms

### TRADE-U1026
Customs | Set Inspection Rule | Trade exclusive | Commodity/Origin, Rule

### TRADE-U1027
Customs | Initiate Modernisation | Trade Owner + Finance funding | Project Request

### TRADE-U1028
Guarantee | Request Trade Finance Guarantee | Trade + Finance | Guarantee Schema

### TRADE-U1029
Partner | Search Partner | Trade exclusive | Commodity/Technology/Capital filters

### TRADE-U1030
Partner | Open Economic Profile | Trade exclusive detailed access | Country ID

### TRADE-U1031
附录 B：全部跨国活动类型与 Required Offices

### TRADE-U1032
活动类型 | 发起主责 | Required Offices

### TRADE-U1033
Spot Commodity Trade | Trade | None unless official government FX/payment is used

### TRADE-U1034
Commodity Supply Agreement | Trade | Finance for Treasury payment; CB for official reserve; Captain if strategic

### TRADE-U1035
Technology Licence | Trade + Industry | Finance if government-funded; Captain if strategic

### TRADE-U1036
FDI | Trade + Project Owner | Finance if fiscal exposure; Captain for strategic asset

### TRADE-U1037
Sovereign Loan | Trade + Finance | Captain

### TRADE-U1038
Infrastructure Finance | Trade + Project Owner + Finance | Captain if strategic/large

### TRADE-U1039
Resource Development | Trade + Industry + Finance | Captain if strategic resource

### TRADE-U1040
Joint International Project | Trade + Project Owner + Finance | Captain if strategic/large

### TRADE-U1041
PTA | Trade | Captain by scope

### TRADE-U1042
FTA | Trade | Captain mandatory

### TRADE-U1043
Reserve Swap | Trade + Central Bank | Captain mandatory

### TRADE-U1044
Capital Controls | Trade + Central Bank | Captain mandatory

### TRADE-U1045
Sanctions | Trade | CB for financial; Captain for major/strategic

### TRADE-U1046
International Aid | Trade + Finance | Captain above threshold

### TRADE-U1047
International Tender | Trade / Project Owner | Finance for fiscal commitment

### TRADE-U1048
Strategic Economic Partnership | Trade + Captain | Relevant offices for component agreements

### TRADE-U1049
Trade Dispute | Trade | Affected office if settlement changes fiscal/monetary/project rights

### TRADE-U1050
附录 C：全部合同通用字段字典

### TRADE-U1051
字段 | 定义

### TRADE-U1052
object_id | 全局唯一 ID

### TRADE-U1053
simulation_id | Season 世界实例

### TRADE-U1054
activity_type | 跨国活动类型

### TRADE-U1055
parties | 全部参与国家

### TRADE-U1056
owner_office | 本国主责 Office

### TRADE-U1057
counterparty_owner | 对手主责 Office

### TRADE-U1058
version | 当前条款版本

### TRADE-U1059
status | 状态机状态

### TRADE-U1060
created_at | 创建时间

### TRADE-U1061
sent_at | 首次发送时间

### TRADE-U1062
commercial_acceptance_at | 商业条款确认时间

### TRADE-U1063
internal_approval_status | 本国审批

### TRADE-U1064
counterparty_approval_status | 对手审批

### TRADE-U1065
signed_at | 签署时间

### TRADE-U1066
effective_from | 生效时间

### TRADE-U1067
expiry | 到期

### TRADE-U1068
currency | 结算币种

### TRADE-U1069
payment_schedule | 付款义务

### TRADE-U1070
delivery_schedule | 交付义务

### TRADE-U1071
renegotiation_rule | 重谈

### TRADE-U1072
default_rule | 违约

### TRADE-U1073
termination_rule | 终止

### TRADE-U1074
force_majeure | 不可抗力

### TRADE-U1075
sanction_clause | 制裁处理

### TRADE-U1076
dispute_rule | 争端

### TRADE-U1077
audit_version_hash | 版本哈希

### TRADE-U1078
实现总原则 / Trade Office 的可玩性来自“真实的跨国选择与对手方博弈”，而不是更多滑块。所有国际活动最终必须改变至少一种真实状态：Goods、Money、Ownership、Technology、Debt、Contractual Commitment、Tariff/Quota Rule 或 Logistics Obligation。不存在只改变抽象 Relationship 或 Trade Strength 的独立按钮。
