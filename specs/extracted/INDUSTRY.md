# INDUSTRY｜原始规范文本索引

原文件：`EconMind_Season1_Industry_Technology_Resources_Minister_Function_Specification.docx`
本文件为段落/表格顺序提取，未修改规则，未协调矛盾；图像、批注、页眉页脚与版式以原Word为准。锚点仅供回查，不代表独立需求条数。

### INDUSTRY-U0001
EconMind OS Season 1

### INDUSTRY-U0002
Minister of Industry, Technology & Resources / 产业、科技与资源部长

### INDUSTRY-U0003
完整功能、资源-生产-技术-项目与国际技术交流系统规范

### INDUSTRY-U0004
ROLE DEFINITION / Industry, Technology & Resources Minister 是国家实体经济能力的建设者。该 Office 管理固定物理资源禀赋的发现与开发、生产设施、能源系统、技术研发、技术组合、国际技术交流、项目建设、基础设施、产业政策、战略储备和排放标准。所有能够精确表示的状态均使用真实资源量、产能、产量、库存、劳动力人数、能耗、设备、资金需求、技术权利、时间和项目进度，不使用 0–100 抽象强度作为底层经济状态。

### INDUSTRY-U0005
项目 | 定义

### INDUSTRY-U0006
文件性质 | Season 1 产品设计与工程实现规范

### INDUSTRY-U0007
Office | Minister of Industry, Technology & Resources

### INDUSTRY-U0008
核心权力 | Resources + Production + Energy + Technology + Projects + Infrastructure + Industrial Policy

### INDUSTRY-U0009
资源原则 | Geological Endowment 在 Season 创建时固定；玩家只能发现、证明、开发、开采和耗尽，不能创造地下资源

### INDUSTRY-U0010
技术原则 | 自主研发、Licence、Technology Transfer、Joint R&D、Research Centre、Talent Exchange 六种路径并存

### INDUSTRY-U0011
跨 Office 原则 | Industry 决定 what to build / what to produce；Finance 决定 how to pay；Trade 决定 how to obtain abroad；Social 决定 workforce response

### INDUSTRY-U0012
运行模式 | 持续运行、无固定回合、项目与政策按自然模拟时间推进

### INDUSTRY-U0013
目录 / Contents

### INDUSTRY-U0014
1. Office 定位与权限边界

### INDUSTRY-U0015
2. 核心设计原则

### INDUSTRY-U0016
3. Industry Dashboard 信息架构

### INDUSTRY-U0017
4. 固定资源禀赋总表

### INDUSTRY-U0018
5. Geological Endowment 五层资源模型

### INDUSTRY-U0019
6. Resource Deposit 资源区块数据模型

### INDUSTRY-U0020
7. Geological Exploration 勘探机制

### INDUSTRY-U0021
8. Recoverable Reserve 与技术恢复率

### INDUSTRY-U0022
9. Resource Development 资源开发项目

### INDUSTRY-U0023
10. Labour 劳动力约束系统

### INDUSTRY-U0024
11. Extraction 开采计算与生产限制

### INDUSTRY-U0025
12. Production Sector 生产体系

### INDUSTRY-U0026
13. 固定生产链与投入产出关系

### INDUSTRY-U0027
14. Production Facility 生产设施模型

### INDUSTRY-U0028
15. Production Target 与 Capacity Utilisation

### INDUSTRY-U0029
16. Inventory 与工业库存

### INDUSTRY-U0030
17. Energy System 能源系统

### INDUSTRY-U0031
18. Power Plant 与发电设施

### INDUSTRY-U0032
19. Electricity Balance 与电力分配

### INDUSTRY-U0033
20. Technology System 总体架构

### INDUSTRY-U0034
21. Technology Domains 与完整技术目录

### INDUSTRY-U0035
22. Technology Prerequisite 技术前置关系

### INDUSTRY-U0036
23. Domestic R&D 自主研发

### INDUSTRY-U0037
24. Technology Portfolio 技术资产组合

### INDUSTRY-U0038
25. Global Technology Exchange 国际技术交流平台

### INDUSTRY-U0039
26. Technology Licence 技术许可

### INDUSTRY-U0040
27. Technology Transfer 技术转移

### INDUSTRY-U0041
28. Joint R&D Programme 联合研发

### INDUSTRY-U0042
29. International Research Centre 国际研究中心

### INDUSTRY-U0043
30. Technical Talent Exchange 技术人才交流

### INDUSTRY-U0044
31. Technology Disclosure 与出口限制

### INDUSTRY-U0045
32. Project Pipeline 项目体系

### INDUSTRY-U0046
33. Project 固定类别与完整项目目录

### INDUSTRY-U0047
34. Project Schema 项目完整字段

### INDUSTRY-U0048
35. Project Lifecycle 项目生命周期

### INDUSTRY-U0049
36. Construction Inputs 建设材料与实际施工

### INDUSTRY-U0050
37. Funding、Import、Labour、Technology 四类跨 Office 请求

### INDUSTRY-U0051
38. Infrastructure 基础设施网络

### INDUSTRY-U0052
39. Industrial Policy 产业政策

### INDUSTRY-U0053
40. Sector Support Programme 产业支持方案

### INDUSTRY-U0054
41. Special Economic Zone 经济特区

### INDUSTRY-U0055
42. SOE 与国有产业关系

### INDUSTRY-U0056
43. Strategic Reserves 战略储备

### INDUSTRY-U0057
44. Emissions & Environmental Standards 排放与环境

### INDUSTRY-U0058
45. Resource Security 与 Future Demand

### INDUSTRY-U0059
46. Supply Chain Bottleneck Detection 产业瓶颈

### INDUSTRY-U0060
47. 与其他五个 Office 的共享权限

### INDUSTRY-U0061
48. Joint Project Committee 自动参与规则

### INDUSTRY-U0062
49. 内部审批矩阵

### INDUSTRY-U0063
50. Industry 信息优势

### INDUSTRY-U0064
51. 通知与预警系统

### INDUSTRY-U0065
52. Industry Score 与 National Guardrails

### INDUSTRY-U0066
53. 核心数据实体

### INDUSTRY-U0067
54. 核心计算公式

### INDUSTRY-U0068
55. 前端全部操作控件

### INDUSTRY-U0069
56. Audit Ledger

### INDUSTRY-U0070
57. 旧版 World Simulation 迁移规则

### INDUSTRY-U0071
58. 工程验收 Checklist

### INDUSTRY-U0072
附录 A：Industry 全部操作空间总表

### INDUSTRY-U0073
附录 B：完整技术目录与状态

### INDUSTRY-U0074
附录 C：完整项目目录与 Required Offices

### INDUSTRY-U0075
附录 D：全部资源与生产字段字典

### INDUSTRY-U0076
1. Office 定位与权限边界

### INDUSTRY-U0077
正式名称：Minister of Industry, Technology & Resources / 产业、科技与资源部长。

### INDUSTRY-U0078
核心使命：将国家固定的资源禀赋、现有人力与技术条件转化为可持续生产能力，并通过研发、技术获取、产业项目、能源设施和基础设施建设改变国家未来的实体经济结构。

### INDUSTRY-U0079
核心职责链 / Resources → Exploration → Recoverable Reserve → Development → Labour/Energy/Equipment → Extraction/Production → Inventory → Domestic Use / Trade，同时 Technology → Project → Capacity → Output。

### INDUSTRY-U0080
1.1 Industry 独占主责

### INDUSTRY-U0081
资源勘探、资源区块技术评估、资源开发项目与开采产能计划。

### INDUSTRY-U0082
国内工业、能源、矿业和关键基础设施项目的技术 Owner。

### INDUSTRY-U0083
生产设施的产能、利用率目标、扩建、升级、暂停与退役。

### INDUSTRY-U0084
国内 Research Project 的创建、技术优先级与 Industry R&D Budget 内部分配。

### INDUSTRY-U0085
Technology Portfolio 的技术状态、使用权、限制和对外开放意愿。

### INDUSTRY-U0086
产业支持方案、项目级本地采购规则、SEZ 产业规划。

### INDUSTRY-U0087
战略实物储备目标、储备释放技术决策和储备采购需求。

### INDUSTRY-U0088
行业排放标准和生产设施技术合规要求。

### INDUSTRY-U0089
向 Trade、Finance、Social、Central Bank 发起 External Supply、Funding、Workforce、Refinancing 等结构化请求。

### INDUSTRY-U0090
1.2 Industry 明确不拥有

### INDUSTRY-U0091
政府税率、国库、预算、发债和担保。

### INDUSTRY-U0092
关税、国际合同价格、外国供应商选择和国际谈判。

### INDUSTRY-U0093
政策利率、银行流动性、官方外储和 FX Intervention。

### INDUSTRY-U0094
福利、工资、移民制度和培训政策的最终决定权。

### INDUSTRY-U0095
国家长期战略、国家优先目标和战略条约最终批准。

### INDUSTRY-U0096
2. 核心设计原则

### INDUSTRY-U0097
原则 | 强制实现

### INDUSTRY-U0098
物理守恒 | 地下资源总量在 Season 创建时固定；发现与技术不会增加 Geological Endowment。

### INDUSTRY-U0099
层级资源 | Geological Endowment、Discovered Resource、Recoverable Reserve、Developed Reserve、Extracted Inventory 必须分离。

### INDUSTRY-U0100
真实劳动力 | 所有资源、生产、项目和研发记录 Low / Medium / High Skill 的人数需求和可用量。

### INDUSTRY-U0101
真实能耗 | 开采、工业和项目消耗实际 Electricity / Fuel。

### INDUSTRY-U0102
真实投入品 | 生产和建设必须消耗实际 Commodity Inventory 或在途已锁定输入。

### INDUSTRY-U0103
技术有权利状态 | Mastered、Licensed、Transferred、Jointly Owned 等状态直接决定项目许可和再授权。

### INDUSTRY-U0104
技术不等于产能 | 获得技术只满足 prerequisite；必须继续建设 Project 才形成 Capacity。

### INDUSTRY-U0105
项目不瞬时完成 | 施工由 Funding Released、Materials Delivered、Labour Available、Technology、Administrative Capacity 决定。

### INDUSTRY-U0106
行业政策具体化 | 补贴、采购规则和产业计划使用实际金额、单位补贴、覆盖项目和期限。

### INDUSTRY-U0107
可审计 | 所有资源发现、开采、产能变化、研发、技术权利、项目里程碑和储备流转形成审计事件。

### INDUSTRY-U0108
3. Industry Dashboard 信息架构

### INDUSTRY-U0109
页面 | 完整内容

### INDUSTRY-U0110
01 National Resources | 固定总禀赋、已发现、可采、已开发、累计开采、剩余寿命。

### INDUSTRY-U0111
02 Production | 各 Sector 产能、产量、利用率、投入品、工人、能源、成本、库存。

### INDUSTRY-U0112
03 Energy System | 发电设施、可用容量、发电量、需求、缺口、Reserve Margin、燃料库存。

### INDUSTRY-U0113
04 Technology & R&D | Research Pipeline、Technology Portfolio、技术前置、国内掌握和外国访问。

### INDUSTRY-U0114
05 Global Technology Exchange | Licence、Joint R&D、Technology Transfer、Research Centre、Talent Exchange。

### INDUSTRY-U0115
06 Project Pipeline | 全部资源、能源、产业、基础设施和研究项目。

### INDUSTRY-U0116
07 Infrastructure | 港口、铁路、电网、物流、数字网络、储存能力与瓶颈。

### INDUSTRY-U0117
08 Industrial Policy | Sector Support、Local Procurement、SEZ、SOE 产业计划。

### INDUSTRY-U0118
09 Strategic Reserves | Oil/Gas/Grain/Uranium/Strategic Metals 库存、覆盖天数、采购和释放。

### INDUSTRY-U0119
10 Emissions & Resource Security | 排放、标准、关键进口依赖、未来项目需求和供应瓶颈。

### INDUSTRY-U0120
11 Requests | Funding、Trade Supply、Technology Licence、Workforce、Refinancing 的跨 Office 请求。

### INDUSTRY-U0121
12 Alerts | 资源枯竭、投入短缺、劳工短缺、电力短缺、项目延误、技术到期和供应链风险。

### INDUSTRY-U0122
4. 固定资源禀赋总表

### INDUSTRY-U0123
Resource ID | 名称 | 计量单位

### INDUSTRY-U0124
CRUDE_OIL | Crude Oil / 原油 | barrel

### INDUSTRY-U0125
NATURAL_GAS | Natural Gas / 天然气 | MMBtu equivalent

### INDUSTRY-U0126
URANIUM | Uranium / 铀 | tonne U

### INDUSTRY-U0127
IRON_ORE | Iron Ore / 铁矿石 | tonne

### INDUSTRY-U0128
COPPER | Copper / 铜 | tonne

### INDUSTRY-U0129
LITHIUM | Lithium / 锂 | tonne LCE

### INDUSTRY-U0130
Grain 为可再生农业产出，不属于固定地下 Geological Endowment；Steel、Refined Fuel、Machinery、Semiconductors、Batteries 为生产链产出；Electricity 为能源流量。

### INDUSTRY-U0131
5. Geological Endowment 五层资源模型

### INDUSTRY-U0132
层级 | 定义

### INDUSTRY-U0133
Geological Endowment | Season 创建时服务器锁定的物理总资源；包括已开采部分在内的原始总禀赋，不因政策或技术增加。

### INDUSTRY-U0134
Discovered Resource | 已经通过勘探确认存在，但未必经济可采。

### INDUSTRY-U0135
Recoverable Reserve | 在当前技术、价格和基础设施条件下可以经济开采的已发现资源。

### INDUSTRY-U0136
Developed Reserve | 已有有效开发设施、许可、设备、劳动力和基础设施，可直接进入开采计划的储量。

### INDUSTRY-U0137
Extracted Inventory | 已经从地下开采并转化为可用商品库存的资源。

### INDUSTRY-U0138
物理总量守恒 / InitialGeologicalEndowment = RemainingUndergroundResource + CumulativeExtraction

### INDUSTRY-U0139
剩余地下资源 / RemainingUndergroundResource_t = InitialEndowment - CumulativeExtraction_t

### INDUSTRY-U0140
6. Resource Deposit 资源区块数据模型

### INDUSTRY-U0141
字段 | 定义

### INDUSTRY-U0142
Deposit ID | 唯一资源区块

### INDUSTRY-U0143
Resource Type | 六种固定地下资源

### INDUSTRY-U0144
Location | 国内地区/地图节点

### INDUSTRY-U0145
Initial Geological Resource | 区块原始物理总量

### INDUSTRY-U0146
Discovered Resource | 已发现量

### INDUSTRY-U0147
Recoverable Reserve | 当前可采量

### INDUSTRY-U0148
Developed Reserve | 现有设施可直接开采量

### INDUSTRY-U0149
Undiscovered Pool | 服务器隐藏未发现量

### INDUSTRY-U0150
Current Extraction Capacity | 单位/模拟日或年化

### INDUSTRY-U0151
Actual Extraction | 实际当前产量

### INDUSTRY-U0152
Unit Extraction Cost | LC/单位

### INDUSTRY-U0153
Low Skill Required | 人数

### INDUSTRY-U0154
Medium Skill Required | 人数

### INDUSTRY-U0155
High Skill Required | 人数

### INDUSTRY-U0156
Electricity Requirement | MWh/单位

### INDUSTRY-U0157
Fuel Requirement | 适用时单位燃料

### INDUSTRY-U0158
Machinery Requirement | 设备数量

### INDUSTRY-U0159
Rail/Port Requirement | 物流容量

### INDUSTRY-U0160
Ownership Structure | 政府/SOE/私人/外国

### INDUSTRY-U0161
Operator | 运营主体

### INDUSTRY-U0162
Environmental Factor | 单位产量排放/扰动

### INDUSTRY-U0163
Remaining Economic Life | 按现有产能推算

### INDUSTRY-U0164
Development Status | Undiscovered/Exploring/Discovered/Proven/Developing/Producing/Depleted/Closed

### INDUSTRY-U0165
7. Geological Exploration 勘探机制

### INDUSTRY-U0166
字段 | 定义

### INDUSTRY-U0167
Target Region / Deposit | 勘探区域

### INDUSTRY-U0168
Target Resource | 目标资源

### INDUSTRY-U0169
Survey Budget | LC

### INDUSTRY-U0170
Geologists Required | High Skill 人数

### INDUSTRY-U0171
Technical Staff Required | Medium Skill 人数

### INDUSTRY-U0172
Survey Equipment | Machinery/专用设备

### INDUSTRY-U0173
Survey Technology | 所需勘探技术

### INDUSTRY-U0174
Duration | 自然模拟时间

### INDUSTRY-U0175
Exploration Intensity | 由预算/人力/设备真实投入派生，不作为 0–100 输入

### INDUSTRY-U0176
Discovery Output | 从隐藏 Undiscovered Pool 转为 Discovered Resource 的量

### INDUSTRY-U0177
Commercial Assessment | 是否达到当前经济可采条件

### INDUSTRY-U0178
Status | Proposed/Funded/Surveying/Assessing/Completed/Cancelled

### INDUSTRY-U0179
发现约束 / Discovery_t <= RemainingUndiscoveredResourcePool

### INDUSTRY-U0180
Exploration 只能揭示 Season 创建时已经锁定的资源。任何勘探结果都必须从隐藏资源池扣减，不允许新增 Geological Endowment。

### INDUSTRY-U0181
8. Recoverable Reserve 与技术恢复率

### INDUSTRY-U0182
当前可采储量 / RecoverableReserve = DiscoveredResource × RecoveryRate(CurrentTechnology, Price, Infrastructure, ExtractionCost)

### INDUSTRY-U0183
技术可以提高 Recovery Rate、降低单位开采成本、减少劳动力需求、降低能源消耗和环境影响，但不能增加 Geological Endowment。

### INDUSTRY-U0184
技术影响 | 允许改变 | 禁止改变

### INDUSTRY-U0185
Advanced Exploration | 发现效率、勘探时间、勘探成本 | 地下物理总量

### INDUSTRY-U0186
Advanced Mining | Recovery Rate、Unit Cost、Labour Productivity | 地下物理总量

### INDUSTRY-U0187
Automation | Medium/Low Skill 需求、产能稳定性 | 地下物理总量

### INDUSTRY-U0188
Processing Technology | 可用成品率、能源效率 | 地下物理总量

### INDUSTRY-U0189
Environmental Technology | 单位排放、废弃物、恢复成本 | 地下物理总量

### INDUSTRY-U0190
9. Resource Development 资源开发项目

### INDUSTRY-U0191
字段 | 定义

### INDUSTRY-U0192
Deposit ID | 目标区块

### INDUSTRY-U0193
Planned Extraction Capacity | 计划新增产能

### INDUSTRY-U0194
Capex | 总资本成本

### INDUSTRY-U0195
Steel Required | 建设钢材

### INDUSTRY-U0196
Copper Required | 建设铜

### INDUSTRY-U0197
Machinery Required | 设备

### INDUSTRY-U0198
Electricity Connection | 所需电网容量

### INDUSTRY-U0199
Rail/Port Connection | 物流设施

### INDUSTRY-U0200
Construction Low Skill | 人数

### INDUSTRY-U0201
Construction Medium Skill | 人数

### INDUSTRY-U0202
Construction High Skill | 人数

### INDUSTRY-U0203
Operating Low Skill | 投产后人数

### INDUSTRY-U0204
Operating Medium Skill | 投产后人数

### INDUSTRY-U0205
Operating High Skill | 投产后人数

### INDUSTRY-U0206
Required Technology | 技术前置

### INDUSTRY-U0207
Environmental Requirement | 必须满足的标准

### INDUSTRY-U0208
Construction Duration | 自然时间

### INDUSTRY-U0209
Expected Unit Cost | 投产后单位成本

### INDUSTRY-U0210
Expected Recovery Rate | 投产后恢复率

### INDUSTRY-U0211
Ownership / Operator | 运营产权

### INDUSTRY-U0212
Funding Status | 融资状态

### INDUSTRY-U0213
Import Dependencies | 需 Trade 获取的外部输入

### INDUSTRY-U0214
10. Labour 劳动力约束系统

### INDUSTRY-U0215
Skill Tier | 主要用途

### INDUSTRY-U0216
Low Skill | 基础矿山作业、装卸、普通施工、一般现场维护。

### INDUSTRY-U0217
Medium Skill | 机械操作、工程技术员、设备维护、工艺操作、现场管理。

### INDUSTRY-U0218
High Skill | 地质、采矿工程、核安全、先进制造工程、研发、项目设计与高级自动化。

### INDUSTRY-U0219
每个 Deposit、Facility、Project 和 Research Project 必须分别记录三档劳动力 Required 与 Available。Industry 只能提出 Workforce Requirement，不得自行生成劳动力。Social 负责培训、技能转换、劳动力流动和移民政策。

### INDUSTRY-U0220
劳动力可用率 / LabourAvailability = min(LowAvailable/LowRequired, MediumAvailable/MediumRequired, HighAvailable/HighRequired, 1)

### INDUSTRY-U0221
11. Extraction 开采计算与生产限制

### INDUSTRY-U0222
实际开采 / ActualExtraction = InstalledExtractionCapacity × LabourAvailability × EnergyAvailability × EquipmentAvailability × InfrastructureAvailability × OperationalEfficiency

### INDUSTRY-U0223
任何乘数不足都会限制实际产量。系统必须将受限原因拆分显示为 Labour Shortfall、Energy Shortfall、Equipment Shortfall、Rail/Port Bottleneck、Maintenance Downtime 或 Resource Depletion。

### INDUSTRY-U0224
12. Production Sector 生产体系

### INDUSTRY-U0225
Sector ID | Sector

### INDUSTRY-U0226
OIL_EXTRACTION | Oil Extraction

### INDUSTRY-U0227
GAS_EXTRACTION | Gas Extraction

### INDUSTRY-U0228
URANIUM_MINING | Uranium Mining

### INDUSTRY-U0229
IRON_ORE_MINING | Iron Ore Mining

### INDUSTRY-U0230
COPPER_MINING | Copper Mining

### INDUSTRY-U0231
LITHIUM_MINING | Lithium Mining

### INDUSTRY-U0232
STEEL | Steel

### INDUSTRY-U0233
REFINED_FUEL | Refined Fuel

### INDUSTRY-U0234
BATTERY | Batteries

### INDUSTRY-U0235
MACHINERY | Machinery

### INDUSTRY-U0236
SEMICONDUCTOR | Semiconductors

### INDUSTRY-U0237
ELECTRICITY | Electricity

### INDUSTRY-U0238
13. 固定生产链与投入产出关系

### INDUSTRY-U0239
Sector | 固定生产链

### INDUSTRY-U0240
Oil Extraction | Developed Oil Reserve + Electricity + Labour + Machinery → Crude Oil

### INDUSTRY-U0241
Gas Extraction | Developed Gas Reserve + Electricity + Labour + Machinery → Natural Gas

### INDUSTRY-U0242
Uranium Mining | Developed Uranium Reserve + Electricity + Labour + Machinery → Uranium

### INDUSTRY-U0243
Iron Ore Mining | Developed Iron Ore Reserve + Electricity + Labour + Machinery → Iron Ore

### INDUSTRY-U0244
Copper Mining | Developed Copper Reserve + Electricity + Labour + Machinery → Copper

### INDUSTRY-U0245
Lithium Mining | Developed Lithium Reserve + Electricity + Labour + Machinery → Lithium

### INDUSTRY-U0246
Steel | Iron Ore + Electricity/Energy + Labour + Machinery Capacity → Steel

### INDUSTRY-U0247
Refined Fuel | Crude Oil + Electricity/Energy + Labour + Refinery Capacity → Refined Fuel

### INDUSTRY-U0248
Batteries | Lithium + Copper + Electricity + Machinery + Battery Technology + Skilled Labour → Batteries

### INDUSTRY-U0249
Machinery | Steel + Copper + Electricity + Manufacturing Technology + Skilled Labour → Machinery

### INDUSTRY-U0250
Semiconductors | Copper + Electricity + Machinery + Semiconductor Technology + High Skill Labour → Semiconductors

### INDUSTRY-U0251
Electricity | Fuel/Resource + Generation Capacity + Labour + Grid → Delivered Electricity

### INDUSTRY-U0252
14. Production Facility 生产设施模型

### INDUSTRY-U0253
字段 | 定义

### INDUSTRY-U0254
Facility ID | 设施 ID

### INDUSTRY-U0255
Facility Type | Sector 对应设施

### INDUSTRY-U0256
Location | 位置

### INDUSTRY-U0257
Installed Capacity | 设计产能

### INDUSTRY-U0258
Operational Capacity | 可运营产能

### INDUSTRY-U0259
Current Output | 当前产量

### INDUSTRY-U0260
Capacity Utilisation | 计算结果

### INDUSTRY-U0261
Utilisation Target | Industry 设置目标

### INDUSTRY-U0262
Input Recipe | 单位产出投入

### INDUSTRY-U0263
Current Input Inventory | 厂内投入库存

### INDUSTRY-U0264
Electricity Demand | MWh

### INDUSTRY-U0265
Low/Medium/High Skill Requirement | 人数

### INDUSTRY-U0266
Available Labour | 实际人数

### INDUSTRY-U0267
Unit Variable Cost | 单位变动成本

### INDUSTRY-U0268
Maintenance Cost | 维护费用

### INDUSTRY-U0269
Maintenance Status | 正常/检修

### INDUSTRY-U0270
Emission Factor | 单位排放

### INDUSTRY-U0271
Ownership | 产权

### INDUSTRY-U0272
Operator | 运营主体

### INDUSTRY-U0273
Commissioned Date | 投产时间

### INDUSTRY-U0274
Remaining Life | 剩余寿命

### INDUSTRY-U0275
Expansion Projects | 关联扩建

### INDUSTRY-U0276
Upgrade Projects | 关联升级

### INDUSTRY-U0277
15. Production Target 与 Capacity Utilisation

### INDUSTRY-U0278
利用率 / CapacityUtilisation = CurrentOutput / OperationalCapacity

### INDUSTRY-U0279
最大可行产量 / FeasibleOutput = OperationalCapacity × min(InputAvailability, LabourAvailability, EnergyAvailability, InfrastructureAvailability, MaintenanceAvailability)

### INDUSTRY-U0280
Industry 可以设置 Production Target 和 Utilisation Target，但系统不得允许目标自动转化为产量。若目标超过 FeasibleOutput，页面必须显示最大可行值和具体缺口。

### INDUSTRY-U0281
Industry 可操作 | 输入

### INDUSTRY-U0282
Set Production Target | Facility/Sector + Quantity per period

### INDUSTRY-U0283
Set Utilisation Target | Facility/Sector + 0–100% 现实利用率

### INDUSTRY-U0284
Prioritise Critical Facility | 指定设施，改变有限维护/能源/输入分配顺序

### INDUSTRY-U0285
Reduce Output | 降低目标以保护库存/能源

### INDUSTRY-U0286
Ramp Up Output | 提高目标但受现实约束

### INDUSTRY-U0287
16. Inventory 与工业库存

### INDUSTRY-U0288
库存类型 | 定义

### INDUSTRY-U0289
Raw Material Inventory | Oil/Gas/Uranium/Iron Ore/Copper/Lithium/Grain

### INDUSTRY-U0290
Intermediate Inventory | Steel/Refined Fuel

### INDUSTRY-U0291
Strategic Industrial Inventory | Machinery/Semiconductors/Batteries

### INDUSTRY-U0292
In-Process Inventory | 已进入生产但尚未形成成品的投入

### INDUSTRY-U0293
Facility Input Inventory | 特定工厂可用输入

### INDUSTRY-U0294
National Available Inventory | 可供国内分配/出口的库存

### INDUSTRY-U0295
商品库存 / Inventory_t = Inventory_t-1 + Production + ImportsDelivered - DomesticUse - ExportsDelivered - ProjectUse - Losses

### INDUSTRY-U0296
17. Energy System 能源系统

### INDUSTRY-U0297
Energy System 使用真实发电能力、燃料、发电量、电力需求和 Grid Losses。禁止使用 Energy Security 0–100 作为底层变量。

### INDUSTRY-U0298
Asset Type | 定义

### INDUSTRY-U0299
GAS_POWER | Gas-fired Power

### INDUSTRY-U0300
FOSSIL_POWER | Other Fossil Power

### INDUSTRY-U0301
NUCLEAR | Nuclear Power

### INDUSTRY-U0302
SOLAR | Solar

### INDUSTRY-U0303
WIND | Wind

### INDUSTRY-U0304
STORAGE | Grid Storage

### INDUSTRY-U0305
GRID | Transmission / Distribution Grid

### INDUSTRY-U0306
18. Power Plant 与发电设施

### INDUSTRY-U0307
字段 | 定义

### INDUSTRY-U0308
Plant ID | 设施

### INDUSTRY-U0309
Technology | Gas/Fossil/Nuclear/Solar/Wind

### INDUSTRY-U0310
Installed Capacity MW | 装机

### INDUSTRY-U0311
Available Capacity MW | 可用

### INDUSTRY-U0312
Capacity Factor | 实际比例

### INDUSTRY-U0313
Fuel Type | 燃料

### INDUSTRY-U0314
Fuel Requirement | 单位发电燃料

### INDUSTRY-U0315
Fuel Inventory | 厂内库存

### INDUSTRY-U0316
Generation MWh | 实际发电

### INDUSTRY-U0317
Variable Cost | LC/MWh

### INDUSTRY-U0318
Maintenance Cost | 维护

### INDUSTRY-U0319
Low/Medium/High Skill | 人数

### INDUSTRY-U0320
Emission Factor | kgCO2e/MWh

### INDUSTRY-U0321
Grid Connection | 接入节点

### INDUSTRY-U0322
Commission Date | 投产

### INDUSTRY-U0323
Remaining Life | 寿命

### INDUSTRY-U0324
发电量 / Generation = AvailableCapacity × CapacityFactor × Time

### INDUSTRY-U0325
19. Electricity Balance 与电力分配

### INDUSTRY-U0326
可交付电力 / DeliveredElectricity = GrossGeneration - GridLosses - StorageLosses

### INDUSTRY-U0327
总需求 / ElectricityDemand = Household + PublicServices + Mining + Manufacturing + DigitalInfrastructure + Transport + ProjectConstruction

### INDUSTRY-U0328
Reserve Margin / ReserveMargin = (AvailableGenerationCapacity - PeakDemand) / PeakDemand

### INDUSTRY-U0329
当供电不足时，Industry 可以设置 Electricity Allocation Priority。固定优先对象为 Households、Critical Public Infrastructure、Strategic Industry、Mining、Heavy Industry、General Industry。优先分配只能重新分配有限电力，不能增加总供给。

### INDUSTRY-U0330
20. Technology System 总体架构

### INDUSTRY-U0331
层级 | 定义

### INDUSTRY-U0332
Domestic R&D | 自主创建 Research Project 并积累研究产出。

### INDUSTRY-U0333
Technology Portfolio | 记录本国 Mastered、Licensed、Transferred、Jointly Owned 的技术权利。

### INDUSTRY-U0334
Foreign Technology Access | 记录外部 Licence、Transfer 和期限/限制。

### INDUSTRY-U0335
Global Technology Exchange | 寻找 Licence、Joint R&D、Transfer、Research Centre、Talent Exchange。

### INDUSTRY-U0336
21. Technology Domains 与完整技术目录

### INDUSTRY-U0337
Technology ID | Domain | Technology

### INDUSTRY-U0338
ENERGY_ADV_SOLAR | Energy | Advanced Solar

### INDUSTRY-U0339
ENERGY_GRID_STORAGE | Energy | Grid-scale Storage

### INDUSTRY-U0340
ENERGY_ADV_NUCLEAR | Energy | Advanced Nuclear

### INDUSTRY-U0341
ENERGY_SMART_GRID | Energy | Smart Grid

### INDUSTRY-U0342
ENERGY_GREEN_H2 | Energy | Green Hydrogen

### INDUSTRY-U0343
MFG_AUTOMATION | Manufacturing | Industrial Automation

### INDUSTRY-U0344
MFG_ROBOTICS | Manufacturing | Advanced Robotics

### INDUSTRY-U0345
MFG_PRECISION | Manufacturing | Precision Manufacturing

### INDUSTRY-U0346
MFG_SMART | Manufacturing | Smart Manufacturing

### INDUSTRY-U0347
SEMI_BASIC | Semiconductor | Basic Semiconductor

### INDUSTRY-U0348
SEMI_ADV_FAB | Semiconductor | Advanced Fabrication

### INDUSTRY-U0349
SEMI_PACKAGING | Semiconductor | Advanced Packaging

### INDUSTRY-U0350
SEMI_HPC | Semiconductor | High-performance Chips

### INDUSTRY-U0351
RESOURCE_ADV_EXPLORATION | Resources & Materials | Advanced Exploration

### INDUSTRY-U0352
RESOURCE_ADV_MINING | Resources & Materials | Advanced Mining

### INDUSTRY-U0353
RESOURCE_EFFICIENT_REFINING | Resources & Materials | High-efficiency Refining

### INDUSTRY-U0354
RESOURCE_BATTERY_CHEM | Resources & Materials | Battery Chemistry

### INDUSTRY-U0355
RESOURCE_ADV_MATERIALS | Resources & Materials | Advanced Materials

### INDUSTRY-U0356
INFRA_DIGITAL_NETWORK | Infrastructure & Digital | Digital Industrial Network

### INDUSTRY-U0357
INFRA_AUTO_LOGISTICS | Infrastructure & Digital | Automated Logistics

### INDUSTRY-U0358
INFRA_SMART_PORT | Infrastructure & Digital | Smart Port

### INDUSTRY-U0359
INFRA_ADV_GRID_MGMT | Infrastructure & Digital | Advanced Grid Management

### INDUSTRY-U0360
22. Technology Prerequisite 技术前置关系

### INDUSTRY-U0361
Technology | Required Prerequisites

### INDUSTRY-U0362
Advanced Solar | 基础能源工业能力

### INDUSTRY-U0363
Grid-scale Storage | Advanced Materials 或 Battery Chemistry

### INDUSTRY-U0364
Advanced Nuclear | 基础核能能力 + Precision Manufacturing

### INDUSTRY-U0365
Smart Grid | Digital Industrial Network + Advanced Grid Management

### INDUSTRY-U0366
Green Hydrogen | Advanced Solar + Smart Grid

### INDUSTRY-U0367
Advanced Robotics | Industrial Automation + Precision Manufacturing

### INDUSTRY-U0368
Smart Manufacturing | Industrial Automation + Advanced Robotics + Digital Industrial Network

### INDUSTRY-U0369
Advanced Fabrication | Basic Semiconductor + Precision Manufacturing + Digital Industrial Network

### INDUSTRY-U0370
Advanced Packaging | Basic Semiconductor + Precision Manufacturing

### INDUSTRY-U0371
High-performance Chips | Advanced Fabrication + Advanced Packaging

### INDUSTRY-U0372
Advanced Mining | Advanced Exploration + Industrial Automation

### INDUSTRY-U0373
High-efficiency Refining | Precision Manufacturing + Advanced Materials

### INDUSTRY-U0374
Battery Chemistry | Advanced Materials

### INDUSTRY-U0375
Automated Logistics | Digital Industrial Network + Industrial Automation

### INDUSTRY-U0376
Smart Port | Automated Logistics + Digital Industrial Network

### INDUSTRY-U0377
Advanced Grid Management | Digital Industrial Network

### INDUSTRY-U0378
23. Domestic R&D 自主研发

### INDUSTRY-U0379
字段 | 定义

### INDUSTRY-U0380
Research Project ID | 唯一项目

### INDUSTRY-U0381
Target Technology | 技术 ID

### INDUSTRY-U0382
Required Research Output | 完成门槛

### INDUSTRY-U0383
Accumulated Research Output | 累计产出

### INDUSTRY-U0384
Budget Allocated | LC

### INDUSTRY-U0385
Research Staff High Skill | 人数

### INDUSTRY-U0386
Technical Staff Medium Skill | 人数

### INDUSTRY-U0387
Equipment Requirement | Machinery/Research Equipment

### INDUSTRY-U0388
Imported Knowledge Requirement | 适用时

### INDUSTRY-U0389
Prerequisites | 前置技术

### INDUSTRY-U0390
Start Date | 开始

### INDUSTRY-U0391
Expected Duration | 预测

### INDUSTRY-U0392
Actual Progress | 计算结果

### INDUSTRY-U0393
Remaining Cost | 预计剩余资金

### INDUSTRY-U0394
Status | Proposed/Funded/Researching/Paused/Completed/Cancelled

### INDUSTRY-U0395
研究产出 / ResearchOutput = FundingUsed × ResearchHumanCapital × EquipmentAvailability × TechnologyBase × CollaborationMultiplier

### INDUSTRY-U0396
研发进度 / ResearchProgress = AccumulatedResearchOutput / RequiredResearchOutput

### INDUSTRY-U0397
Finance 负责 Government R&D Budget 总额与资金释放；Industry 决定在已获预算内分配到具体 Research Project。

### INDUSTRY-U0398
24. Technology Portfolio 技术资产组合

### INDUSTRY-U0399
状态 | 定义

### INDUSTRY-U0400
UNKNOWN | 本国不知道或无法研发

### INDUSTRY-U0401
RESEARCHABLE | 具备前置条件，可以开始自主研发

### INDUSTRY-U0402
RESEARCHING | 正在研发

### INDUSTRY-U0403
MASTERED | 本国完整掌握，可自主用于项目，并按 IP/战略规则决定是否对外许可

### INDUSTRY-U0404
LICENSED | 按外国 Licence 合同使用，受期限、产量、地区、再授权限制

### INDUSTRY-U0405
TRANSFER_IN_PROGRESS | 正在吸收 Technology Transfer

### INDUSTRY-U0406
JOINTLY_OWNED | 通过 Joint R&D 共同拥有，权利按协议限制

### INDUSTRY-U0407
RESTRICTED | 本国掌握但禁止或限制国际转让

### INDUSTRY-U0408
OBSOLETE | 技术仍可存在但不再满足先进项目/效率要求

### INDUSTRY-U0409
25. Global Technology Exchange 国际技术交流平台

### INDUSTRY-U0410
入口 | 完整功能

### INDUSTRY-U0411
TECHNOLOGIES | 公开/商业可见技术目录

### INDUSTRY-U0412
RESEARCH PARTNERS | 正在寻找合作方的 Research Need / Capability

### INDUSTRY-U0413
JOINT R&D | 联合研发项目与邀请

### INDUSTRY-U0414
LICENCES | 可许可技术与 Licence Request

### INDUSTRY-U0415
TECH TRANSFER | 技术转移机会与申请

### INDUSTRY-U0416
RESEARCH CENTRES | 跨国研究中心项目

### INDUSTRY-U0417
TALENT EXCHANGE | 研究人员和技术人员交流计划

### INDUSTRY-U0418
Global Technology Exchange 只展示被允许公开的技术信息。Classified Technology 不对其他国家出现；Restricted Technology 可以仅显示存在而隐藏细节；Commercial Technology 可以显示 Licence Availability。

### INDUSTRY-U0419
26. Technology Licence 技术许可

### INDUSTRY-U0420
字段 | 定义

### INDUSTRY-U0421
Technology ID | 许可技术

### INDUSTRY-U0422
Licensor | 许可国

### INDUSTRY-U0423
Licensee | 被许可国

### INDUSTRY-U0424
Licence Type | Exclusive / Non-exclusive

### INDUSTRY-U0425
Territory | 允许使用地区

### INDUSTRY-U0426
Start / End | 期限

### INDUSTRY-U0427
Upfront Fee | GCU

### INDUSTRY-U0428
Royalty Rate | 销售额/产量比例

### INDUSTRY-U0429
Royalty Base | Revenue / Unit Output / Fixed Periodic

### INDUSTRY-U0430
Production Limit | 产量上限

### INDUSTRY-U0431
Export Rights | 允许/限制/禁止

### INDUSTRY-U0432
Permitted Export Markets | 出口目的国

### INDUSTRY-U0433
Sub-licensing | 是否允许

### INDUSTRY-U0434
Technical Support | 是否包含

### INDUSTRY-U0435
Localisation Requirement | 本地化

### INDUSTRY-U0436
Termination | 终止条件

### INDUSTRY-U0437
Post-expiry Rights | 到期后已有设施权利

### INDUSTRY-U0438
Breach Penalty | 违约

### INDUSTRY-U0439
Industry 决定技术是否允许对外 Licence、可许可范围和战略敏感性；Trade 负责对手方、价格和合同谈判；Finance 参与政府付款；战略技术对外许可需要 Captain。

### INDUSTRY-U0440
27. Technology Transfer 技术转移

### INDUSTRY-U0441
字段 | 定义

### INDUSTRY-U0442
Target Technology | 技术

### INDUSTRY-U0443
Provider | 提供国

### INDUSTRY-U0444
Recipient | 接收国

### INDUSTRY-U0445
Transfer Scope | Technical Documents / Training / Engineers / Equipment / Production Know-how / Localisation

### INDUSTRY-U0446
Transfer Fee | 费用

### INDUSTRY-U0447
Engineer Count | 技术人员

### INDUSTRY-U0448
Training Seats | 培训名额

### INDUSTRY-U0449
Equipment Package | 设备

### INDUSTRY-U0450
Duration | 期限

### INDUSTRY-U0451
Domestic Absorption Requirement | High Skill、Industrial Base、Research Capacity

### INDUSTRY-U0452
IP Ownership After Transfer | Mastered / Limited Mastery / Continued Licence

### INDUSTRY-U0453
Re-export Rights | 是否允许

### INDUSTRY-U0454
Confidentiality | 保密

### INDUSTRY-U0455
Completion Condition | 吸收完成条件

### INDUSTRY-U0456
吸收进度 / TechnologyAbsorption = f(DomesticHumanCapital, TrainingCompleted, ExistingTechnologyBase, IndustrialCapacity, EquipmentAvailability)

### INDUSTRY-U0457
28. Joint R&D Programme 联合研发

### INDUSTRY-U0458
字段 | 定义

### INDUSTRY-U0459
Target Technology | 目标技术

### INDUSTRY-U0460
Participants | 参与国家

### INDUSTRY-U0461
Lead Country | 牵头国

### INDUSTRY-U0462
Funding by Country | 各国投入

### INDUSTRY-U0463
Research Staff Contribution | 研究人员

### INDUSTRY-U0464
Equipment Contribution | 设备

### INDUSTRY-U0465
Existing Technology Contribution | 已有知识

### INDUSTRY-U0466
Required Research Output | 研发门槛

### INDUSTRY-U0467
IP Ownership Rule | 共同/按出资/Lead + Licence

### INDUSTRY-U0468
Domestic Use Rights | 各国使用权

### INDUSTRY-U0469
Third-country Licence Rights | 能否授权第三国

### INDUSTRY-U0470
Commercialisation Rights | 商业化权利

### INDUSTRY-U0471
Withdrawal Rule | 退出

### INDUSTRY-U0472
Default Rule | 不履约

### INDUSTRY-U0473
Duration | 研发周期

### INDUSTRY-U0474
联合研发产出 / JointResearchOutput = Σ_i(Funding_i × HumanCapital_i × ResearchEfficiency_i × ContributionCompatibility_i)

### INDUSTRY-U0475
29. International Research Centre 国际研究中心

### INDUSTRY-U0476
字段 | 定义

### INDUSTRY-U0477
Centre Type | Semiconductor / Energy / Materials / Nuclear / Industrial Technology

### INDUSTRY-U0478
Host Country | 所在地

### INDUSTRY-U0479
Participants | 参与国

### INDUSTRY-U0480
Capital Cost | 建设成本

### INDUSTRY-U0481
Contribution by Country | 出资

### INDUSTRY-U0482
Research Staff by Country | 人员

### INDUSTRY-U0483
Equipment Contribution | 设备

### INDUSTRY-U0484
Research Domains | 研究领域

### INDUSTRY-U0485
Governance | 投票/管理

### INDUSTRY-U0486
IP Ownership | 成果权利

### INDUSTRY-U0487
Operating Cost | 运营费

### INDUSTRY-U0488
Access Rights | 设施使用权

### INDUSTRY-U0489
Duration | 合作期限

### INDUSTRY-U0490
Exit Rule | 退出

### INDUSTRY-U0491
30. Technical Talent Exchange 技术人才交流

### INDUSTRY-U0492
字段 | 定义

### INDUSTRY-U0493
Skill Type | Researcher / Engineer / Technician

### INDUSTRY-U0494
Specialisation | 技术领域

### INDUSTRY-U0495
Sending Country | 派出国

### INDUSTRY-U0496
Receiving Country | 接收国

### INDUSTRY-U0497
Number of People | 人数

### INDUSTRY-U0498
Duration | 期限

### INDUSTRY-U0499
Host Project / Institution | 接收单位

### INDUSTRY-U0500
Funding | 资金承担

### INDUSTRY-U0501
Training Commitment | 培训

### INDUSTRY-U0502
Return Requirement | 回流要求

### INDUSTRY-U0503
Immigration Status | Social 管理

### INDUSTRY-U0504
Knowledge Transfer Requirement | 知识扩散

### INDUSTRY-U0505
Confidentiality / IP | 保密和 IP

### INDUSTRY-U0506
Industry 定义技术人才需求和专业方向；Trade 谈跨国合作；Social 决定移民、劳动和居留条件；Finance 参与政府资助。

### INDUSTRY-U0507
31. Technology Disclosure 与出口限制

### INDUSTRY-U0508
Disclosure State | 外部可见性

### INDUSTRY-U0509
PUBLIC | 其他国家可看到技术名称与本国掌握状态。

### INDUSTRY-U0510
COMMERCIAL | 可看到 Licence Availability 与商业合作入口。

### INDUSTRY-U0511
RESTRICTED | 只能看到有限描述或存在信息，不能直接 Request Licence。

### INDUSTRY-U0512
CLASSIFIED | 不出现在其他国家 Technology Exchange。

### INDUSTRY-U0513
Industry 可以 Publish Technology、Offer Licence、Seek Research Partner、Keep Restricted。涉及战略技术对外转让时由 Captain 最终批准；Trade 的 Technology Export Control 可以针对具体国家阻止 Licence 或 Transfer。

### INDUSTRY-U0514
32. Project Pipeline 项目体系

### INDUSTRY-U0515
所有实体能力扩张必须通过 Project Pipeline。项目不因政策强度直接生成产能。

### INDUSTRY-U0516
33. Project 固定类别与完整项目目录

### INDUSTRY-U0517
Category | Project Type

### INDUSTRY-U0518
Resource | Oil Field Development

### INDUSTRY-U0519
Resource | Gas Field Development

### INDUSTRY-U0520
Resource | Uranium Mine

### INDUSTRY-U0521
Resource | Iron Ore Mine

### INDUSTRY-U0522
Resource | Copper Mine

### INDUSTRY-U0523
Resource | Lithium Mine

### INDUSTRY-U0524
Energy | Gas Power Plant

### INDUSTRY-U0525
Energy | Fossil Power Plant

### INDUSTRY-U0526
Energy | Nuclear Power Plant

### INDUSTRY-U0527
Energy | Solar Farm

### INDUSTRY-U0528
Energy | Wind Farm

### INDUSTRY-U0529
Energy | Grid Upgrade

### INDUSTRY-U0530
Energy | Energy Storage Facility

### INDUSTRY-U0531
Industrial | Steel Mill

### INDUSTRY-U0532
Industrial | Refinery

### INDUSTRY-U0533
Industrial | Machinery Plant

### INDUSTRY-U0534
Industrial | Semiconductor Fab

### INDUSTRY-U0535
Industrial | Battery Gigafactory

### INDUSTRY-U0536
Industrial | Industrial Park

### INDUSTRY-U0537
Industrial | Special Economic Zone

### INDUSTRY-U0538
Infrastructure | Deepwater Port

### INDUSTRY-U0539
Infrastructure | Freight Railway

### INDUSTRY-U0540
Infrastructure | National Power Grid

### INDUSTRY-U0541
Infrastructure | Digital Backbone

### INDUSTRY-U0542
Infrastructure | Logistics Hub

### INDUSTRY-U0543
Infrastructure | Strategic Reserve Facility

### INDUSTRY-U0544
Research Infrastructure | National Research Centre

### INDUSTRY-U0545
Research Infrastructure | Semiconductor Research Facility

### INDUSTRY-U0546
Research Infrastructure | Energy Research Centre

### INDUSTRY-U0547
Research Infrastructure | Materials Research Centre

### INDUSTRY-U0548
34. Project Schema 项目完整字段

### INDUSTRY-U0549
字段 | 定义

### INDUSTRY-U0550
Project ID | 唯一项目

### INDUSTRY-U0551
Name | 名称

### INDUSTRY-U0552
Category / Type | 固定项目目录

### INDUSTRY-U0553
Location | 位置

### INDUSTRY-U0554
Project Owner | Industry

### INDUSTRY-U0555
Planned Capacity | 新增能力及单位

### INDUSTRY-U0556
Total Capex | 总成本

### INDUSTRY-U0557
Approved Funding | 已批准资金

### INDUSTRY-U0558
Funding Gap | 融资缺口

### INDUSTRY-U0559
Payment Schedule | 付款节点

### INDUSTRY-U0560
Steel Required | 建设钢材

### INDUSTRY-U0561
Copper Required | 建设铜

### INDUSTRY-U0562
Machinery Required | 设备

### INDUSTRY-U0563
Other Commodity Inputs | 适用投入

### INDUSTRY-U0564
Construction Electricity | 施工用电

### INDUSTRY-U0565
Construction Low/Medium/High Skill | 建设人员

### INDUSTRY-U0566
Permanent Low/Medium/High Skill | 运营人员

### INDUSTRY-U0567
Required Technology | 前置技术

### INDUSTRY-U0568
Licence Status | 外国技术状态

### INDUSTRY-U0569
External Supply Needs | 进口需求

### INDUSTRY-U0570
Start Date | 开始

### INDUSTRY-U0571
Milestones | 里程碑

### INDUSTRY-U0572
Expected Completion | 预计完成

### INDUSTRY-U0573
Construction Progress | 实际进度

### INDUSTRY-U0574
Annual Operating Cost | 运营成本

### INDUSTRY-U0575
Maintenance Cost | 维护

### INDUSTRY-U0576
Unit Input Recipe | 单位产出投入

### INDUSTRY-U0577
Emission Factor | 排放

### INDUSTRY-U0578
Land Requirement | 土地

### INDUSTRY-U0579
Grid/Port/Rail Requirement | 基础设施

### INDUSTRY-U0580
Ownership | 产权

### INDUSTRY-U0581
Foreign Ownership | 外资比例

### INDUSTRY-U0582
Status | 生命周期

### INDUSTRY-U0583
35. Project Lifecycle 项目生命周期

### INDUSTRY-U0584
状态 | 定义

### INDUSTRY-U0585
Proposed | Industry 创建

### INDUSTRY-U0586
Technical Review | 检查技术、地点和生产逻辑

### INDUSTRY-U0587
Awaiting Funding | 等待 Finance

### INDUSTRY-U0588
Awaiting Inputs | 关键建设输入未锁定

### INDUSTRY-U0589
Awaiting Technology | 技术 prerequisite 未满足

### INDUSTRY-U0590
Awaiting Labour | 劳动力缺口

### INDUSTRY-U0591
Awaiting Approval | 等待 Required Offices

### INDUSTRY-U0592
Approved | 所有开工前条件满足

### INDUSTRY-U0593
Under Construction | 施工中

### INDUSTRY-U0594
Delayed | 里程碑延期

### INDUSTRY-U0595
Partially Operational | 部分能力投产

### INDUSTRY-U0596
Operational | 正式运行

### INDUSTRY-U0597
Suspended | 暂停

### INDUSTRY-U0598
Cancelled | 取消

### INDUSTRY-U0599
Decommissioning | 退役施工

### INDUSTRY-U0600
Decommissioned | 退出生产

### INDUSTRY-U0601
36. Construction Inputs 建设材料与实际施工

### INDUSTRY-U0602
施工进度 / ConstructionProgressIncrement = f(FundingReleased, MaterialsDelivered, LabourAvailable, TechnologyReady, AdministrativeCapacity, InfrastructureAccess)

### INDUSTRY-U0603
每个里程碑必须扣减实际 Steel、Copper、Machinery 等库存。材料未交付不得计入施工进度；批准预算但 Treasury 未实际释放的资金不得视为已支付。

### INDUSTRY-U0604
37. Funding、Import、Labour、Technology 四类跨 Office 请求

### INDUSTRY-U0605
请求类型 | 接收 Office | 完整字段

### INDUSTRY-U0606
Funding Request | Finance | Project ID、Capex、Payment Schedule、Output、Inputs、Risks、Funding Requested

### INDUSTRY-U0607
External Supply Request | Trade | Commodity、Quantity、Required By、Technical Specification、Project、Criticality

### INDUSTRY-U0608
Technology Licence / Partner Request | Trade | Technology ID、Required Rights、Deadline、Project

### INDUSTRY-U0609
Workforce Request | Social | Project、Low/Medium/High Skill、Construction vs Operating、Required Date

### INDUSTRY-U0610
Targeted Refinancing Request | Central Bank | Sector、Financing Gap、Project Pipeline、Requested Facility Size

### INDUSTRY-U0611
38. Infrastructure 基础设施网络

### INDUSTRY-U0612
Infrastructure | 真实容量

### INDUSTRY-U0613
Port Capacity | tonnes/day + shipments/day

### INDUSTRY-U0614
Freight Rail Capacity | tonnes/day by corridor

### INDUSTRY-U0615
Grid Transfer Capacity | MW/GW by node/corridor

### INDUSTRY-U0616
Digital Industrial Coverage | 由已建网络节点和工业区域覆盖计算

### INDUSTRY-U0617
Logistics Hub Throughput | tonnes/day

### INDUSTRY-U0618
Storage Capacity | Commodity + quantity

### INDUSTRY-U0619
Strategic Reserve Storage | Commodity + quantity

### INDUSTRY-U0620
物流瓶颈 / EffectiveMovableOutput = min(ProductionAvailable, RailCapacity, PortCapacity, StorageHandlingCapacity)

### INDUSTRY-U0621
39. Industrial Policy 产业政策

### INDUSTRY-U0622
Industry 仍然拥有产业政策，但所有工具必须对应具体 Sector、预算、单位补贴、项目和期限。

### INDUSTRY-U0623
40. Sector Support Programme 产业支持方案

### INDUSTRY-U0624
字段 | 定义

### INDUSTRY-U0625
Target Sector | 固定 Sector

### INDUSTRY-U0626
Programme Budget | LC

### INDUSTRY-U0627
Duration | 期限

### INDUSTRY-U0628
Eligible Capacity / Projects | 覆盖对象

### INDUSTRY-U0629
Support Type | Output Subsidy / Investment Grant / Electricity Subsidy / R&D Grant / Equipment Support

### INDUSTRY-U0630
Unit Subsidy | LC/unit 或 Capex %

### INDUSTRY-U0631
Maximum Support per Project | 上限

### INDUSTRY-U0632
Performance Condition | 产量/就业/投资/技术条件

### INDUSTRY-U0633
Review Date | 复审

### INDUSTRY-U0634
Finance Approval | 政府资金必须

### INDUSTRY-U0635
41. Special Economic Zone 经济特区

### INDUSTRY-U0636
字段 | 定义

### INDUSTRY-U0637
Zone ID | 园区

### INDUSTRY-U0638
Location | 位置

### INDUSTRY-U0639
Area | hectares

### INDUSTRY-U0640
Eligible Sectors | 行业

### INDUSTRY-U0641
Industrial Capacity | 规划能力

### INDUSTRY-U0642
Power Capacity | MW

### INDUSTRY-U0643
Port/Rail Access | 物流

### INDUSTRY-U0644
Digital Capacity | 网络

### INDUSTRY-U0645
Customs Status | Trade 共同管理

### INDUSTRY-U0646
Tax Treatment | Finance 决定

### INDUSTRY-U0647
Foreign Ownership Rules | Trade 决定

### INDUSTRY-U0648
Local Procurement Rule | Industry

### INDUSTRY-U0649
Employment Capacity | 人数

### INDUSTRY-U0650
Housing Pressure | Social 可见

### INDUSTRY-U0651
Construction Projects | 基础设施清单

### INDUSTRY-U0652
Status | Planning/Construction/Operational/Expanding

### INDUSTRY-U0653
42. SOE 与国有产业关系

### INDUSTRY-U0654
Industry 权限 | Finance 权限

### INDUSTRY-U0655
SOE industrial strategy、capacity project、production plan、technology upgrade | Equity injection、government guarantee、dividend policy、fiscal exposure、privatisation

### INDUSTRY-U0656
提出 SOE 项目和产能需求 | 决定政府出资、债务和担保结构

### INDUSTRY-U0657
评估 SOE 技术与生产绩效 | 评估国有资产财政回报和风险

### INDUSTRY-U0658
43. Strategic Reserves 战略储备

### INDUSTRY-U0659
Reserve | 单位

### INDUSTRY-U0660
Crude Oil Reserve | barrel

### INDUSTRY-U0661
Natural Gas Reserve | MMBtu equivalent

### INDUSTRY-U0662
Grain Reserve | tonne

### INDUSTRY-U0663
Uranium Reserve | tonne U

### INDUSTRY-U0664
Strategic Metals Reserve - Copper | tonne

### INDUSTRY-U0665
Strategic Metals Reserve - Lithium | tonne

### INDUSTRY-U0666
覆盖天数 / CoverageDays = UsableStrategicInventory / DailyCriticalDemand

### INDUSTRY-U0667
Industry 设置 Target Inventory、Release Quantity/Rate 与 Request Acquisition。Trade 负责国际采购，Finance 负责财政支付，紧急大规模释放可触发 Captain/Cabinet。

### INDUSTRY-U0668
44. Emissions & Environmental Standards 排放与环境

### INDUSTRY-U0669
Carbon Tax 迁移给 Finance Owner；Industry 为 Required Consultation，Social 可以设计居民补偿。Industry 保留 Sector Emission Standard。

### INDUSTRY-U0670
Sector | 标准单位

### INDUSTRY-U0671
Steel | tCO2e / tonne Steel

### INDUSTRY-U0672
Refined Fuel | tCO2e / unit output

### INDUSTRY-U0673
Electricity | kgCO2e / MWh by technology

### INDUSTRY-U0674
Mining | tCO2e / tonne extracted

### INDUSTRY-U0675
Semiconductors | tCO2e / standardised output

### INDUSTRY-U0676
Batteries | tCO2e / MWh-equivalent output

### INDUSTRY-U0677
实际排放 / Emissions_sector = ActualOutput × EmissionFactor

### INDUSTRY-U0678
不达标设施必须进入 Upgrade Requirement、Output Restriction、Penalty（Finance 收入）或 Closure 流程。

### INDUSTRY-U0679
45. Resource Security 与 Future Demand

### INDUSTRY-U0680
字段 | 定义

### INDUSTRY-U0681
Domestic Production | 当前国内产量

### INDUSTRY-U0682
Remaining Recoverable Reserve | 剩余可采

### INDUSTRY-U0683
Strategic Inventory | 储备

### INDUSTRY-U0684
Import Dependency | 进口/总需求

### INDUSTRY-U0685
Supplier Concentration | Trade 数据

### INDUSTRY-U0686
Current Demand | 当前使用

### INDUSTRY-U0687
Committed Project Demand | 已批准项目未来材料需求

### INDUSTRY-U0688
Pipeline Demand | 拟建项目需求

### INDUSTRY-U0689
Coverage | 库存/合同覆盖期限

### INDUSTRY-U0690
Uncovered Future Requirement | 未来未覆盖需求

### INDUSTRY-U0691
46. Supply Chain Bottleneck Detection 产业瓶颈

### INDUSTRY-U0692
瓶颈 | 触发规则

### INDUSTRY-U0693
Input Bottleneck | Required Input > Available + Contracted Supply

### INDUSTRY-U0694
Labour Bottleneck | 某 Skill Tier Available < Required

### INDUSTRY-U0695
Energy Bottleneck | Delivered Electricity < Demand

### INDUSTRY-U0696
Technology Bottleneck | Required Technology not Mastered/Licensed/Transferred

### INDUSTRY-U0697
Finance Bottleneck | Approved Funding < Required Milestone Funding

### INDUSTRY-U0698
Infrastructure Bottleneck | Rail/Port/Grid capacity < required throughput

### INDUSTRY-U0699
Equipment Bottleneck | Machinery/Research Equipment unavailable

### INDUSTRY-U0700
Administrative Bottleneck | Admin capacity prevents milestone execution

### INDUSTRY-U0701
47. 与其他五个 Office 的共享权限

### INDUSTRY-U0702
Office | 共享事项 | 边界

### INDUSTRY-U0703
Captain | National Strategy execution、Major Industrial/Energy/Resource Project、Strategic Technology Transfer | Captain 定方向和战略批准；Industry 设计实体执行。

### INDUSTRY-U0704
Central Bank | Targeted Refinancing、重大项目金融稳定/FX 风险 | Industry 提融资缺口；CB 决定金融工具。

### INDUSTRY-U0705
Finance | Project Funding、R&D Budget、Subsidy、SOE、Reserve Purchase | Industry 决定项目与产业方案；Finance 决定政府钱和资本结构。

### INDUSTRY-U0706
Trade | Imported Inputs、Technology Licence、FDI、Resource Agreement、Foreign Project Finance | Industry 定需求和技术；Trade 谈外国对手、价格和合同。

### INDUSTRY-U0707
Social | Workforce、Training、Migration、Housing impact | Industry 提人数与技能需求；Social 决定劳动与社会响应。

### INDUSTRY-U0708
48. Joint Project Committee 自动参与规则

### INDUSTRY-U0709
Office | 自动参与条件

### INDUSTRY-U0710
Industry | 所有 Industry-owned 实体项目必须。

### INDUSTRY-U0711
Finance | 存在 Treasury Funding、Government Guarantee、SOE Fiscal Exposure、Sovereign Debt 时必须。

### INDUSTRY-U0712
Trade | 存在 Imported Critical Inputs、Foreign Technology、FDI、Foreign Loan、Cross-border Contract 时必须。

### INDUSTRY-U0713
Social | Construction/Permanent Workforce 超阈值、Housing/Resettlement、Migration、Training Requirement 时必须。

### INDUSTRY-U0714
Central Bank | Official FX Reserve Use、Targeted Refinancing、Bank Concentration、Systemic Financial Risk 时必须。

### INDUSTRY-U0715
Captain | Strategic Project Flag、金额超过阈值、战略资源、战略技术、国家级基础设施时必须。

### INDUSTRY-U0716
49. 内部审批矩阵

### INDUSTRY-U0717
行动 | Owner | Required Approval

### INDUSTRY-U0718
Ordinary Facility Utilisation Change | Industry | None

### INDUSTRY-U0719
Small Facility Expansion | Industry | Finance if public funding

### INDUSTRY-U0720
Major Industrial Project | Industry | Finance + Captain

### INDUSTRY-U0721
Large Energy Project | Industry | Finance + Captain

### INDUSTRY-U0722
Resource Development | Industry | Finance; Trade if foreign input/investment; Captain if strategic

### INDUSTRY-U0723
Technology Licence Purchase | Industry + Trade | Finance if government payment; Captain if strategic

### INDUSTRY-U0724
Domestic Technology Licence Abroad | Industry + Trade | Captain if strategic/restricted

### INDUSTRY-U0725
Joint R&D | Industry + Trade | Finance if government funding; Captain if strategic

### INDUSTRY-U0726
International Research Centre | Industry + Trade | Finance + Captain if large/strategic

### INDUSTRY-U0727
Strategic Reserve Purchase | Industry request + Trade | Finance

### INDUSTRY-U0728
Strategic Reserve Emergency Release | Industry | Captain if emergency/large

### INDUSTRY-U0729
Sector Support Programme | Industry | Finance

### INDUSTRY-U0730
SEZ | Industry | Finance + Trade; Captain if strategic

### INDUSTRY-U0731
SOE Major Programme | Industry | Finance + Captain

### INDUSTRY-U0732
50. Industry 信息优势

### INDUSTRY-U0733
Industry 专属详细信息

### INDUSTRY-U0734
Deposit-level Geological Data

### INDUSTRY-U0735
Discovered vs Recoverable vs Developed Reserve

### INDUSTRY-U0736
Facility-level Capacity and Utilisation

### INDUSTRY-U0737
Input Recipe and Shortfall

### INDUSTRY-U0738
Maintenance and Downtime

### INDUSTRY-U0739
Project Material Requirement

### INDUSTRY-U0740
Project Construction Progress

### INDUSTRY-U0741
Technology Prerequisites

### INDUSTRY-U0742
Research Project Detailed Progress

### INDUSTRY-U0743
Future Industrial Demand

### INDUSTRY-U0744
Energy Demand by Facility

### INDUSTRY-U0745
Infrastructure Bottleneck Detail

### INDUSTRY-U0746
Labour Requirement by Skill Tier

### INDUSTRY-U0747
Resource Depletion Projection

### INDUSTRY-U0748
51. 通知与预警系统

### INDUSTRY-U0749
Industry Inbox / Alert Event

### INDUSTRY-U0750
Resource Deposit Discovery

### INDUSTRY-U0751
Exploration Completed

### INDUSTRY-U0752
Recoverable Reserve Revised

### INDUSTRY-U0753
Deposit Near Depletion

### INDUSTRY-U0754
Extraction Below Target

### INDUSTRY-U0755
Low/Medium/High Skill Shortage

### INDUSTRY-U0756
Equipment Shortage

### INDUSTRY-U0757
Energy Shortage

### INDUSTRY-U0758
Rail/Port Bottleneck

### INDUSTRY-U0759
Production Target Infeasible

### INDUSTRY-U0760
Facility Maintenance Due

### INDUSTRY-U0761
Facility Breakdown

### INDUSTRY-U0762
Input Inventory Critical

### INDUSTRY-U0763
Research Milestone Reached

### INDUSTRY-U0764
Research Funding Insufficient

### INDUSTRY-U0765
Technology Licence Expiring

### INDUSTRY-U0766
Technology Transfer Milestone

### INDUSTRY-U0767
Joint R&D Partner Default

### INDUSTRY-U0768
Project Funding Approved/Rejected

### INDUSTRY-U0769
Project Input Delayed

### INDUSTRY-U0770
Project Labour Shortage

### INDUSTRY-U0771
Project Milestone Delayed

### INDUSTRY-U0772
Project Completed

### INDUSTRY-U0773
Strategic Reserve Below Target

### INDUSTRY-U0774
Strategic Reserve Coverage Critical

### INDUSTRY-U0775
Emission Standard Breach

### INDUSTRY-U0776
Foreign Technology Offer Received

### INDUSTRY-U0777
Talent Exchange Offer Received

### INDUSTRY-U0778
52. Industry Score 与 National Guardrails

### INDUSTRY-U0779
维度 | 权重 | 方向

### INDUSTRY-U0780
Productive Capacity | 20% | 新增并维持可用实体产能

### INDUSTRY-U0781
Capacity Utilisation | 15% | 在不制造库存/能源危机下有效使用产能

### INDUSTRY-U0782
Technology Progress | 15% | Mastered/Transferred/Joint R&D 的真实进展

### INDUSTRY-U0783
Project Delivery | 15% | 按成本、时间和规格完成项目

### INDUSTRY-U0784
Resource Security | 10% | 资源储量、开发与供应安全

### INDUSTRY-U0785
Energy Reliability | 10% | 电力供需与 Reserve Margin

### INDUSTRY-U0786
Infrastructure Performance | 10% | 物流、电网、数字基础设施的瓶颈改善

### INDUSTRY-U0787
Emissions Efficiency | 5% | 单位产出的排放改善

### INDUSTRY-U0788
52.1 National Guardrails

### INDUSTRY-U0789
不能通过过度开采导致关键资源不可逆枯竭而刷分。

### INDUSTRY-U0790
不能通过满负荷生产导致电力、原料或劳动系统崩溃。

### INDUSTRY-U0791
不能通过项目数量堆积制造财政、材料和行政能力超载。

### INDUSTRY-U0792
不能通过高污染产能扩张无视国家排放与社会成本。

### INDUSTRY-U0793
不能通过占用关键生活商品/能源导致国内严重短缺。

### INDUSTRY-U0794
不能依赖即将到期或被限制的外国 Licence 冒充自主技术能力。

### INDUSTRY-U0795
53. 核心数据实体

### INDUSTRY-U0796
实体 | 核心字段

### INDUSTRY-U0797
resource_endowment | country_id, resource_id, initial_geological_endowment, cumulative_extraction

### INDUSTRY-U0798
resource_deposit | deposit_id, resource_id, geological, discovered, recoverable, developed, capacity, cost, labour, energy, infra, status

### INDUSTRY-U0799
exploration_project | project_id, target_area, target_resource, budget, labour, equipment, technology, progress, discovery_output

### INDUSTRY-U0800
production_sector | sector_id, country_id, total_capacity, output, demand, inventory

### INDUSTRY-U0801
facility | facility_id, type, capacity, utilisation, recipe, labour, energy, cost, ownership, status

### INDUSTRY-U0802
facility_inventory | facility_id, commodity_id, quantity

### INDUSTRY-U0803
power_plant | plant_id, technology, capacity, generation, fuel, labour, emission, grid_node

### INDUSTRY-U0804
grid_node | node_id, capacity, load, losses

### INDUSTRY-U0805
technology | technology_id, domain, prerequisites

### INDUSTRY-U0806
country_technology | country_id, technology_id, state, rights, disclosure, expiry

### INDUSTRY-U0807
research_project | research_id, technology_id, required_output, accumulated_output, funding, staff, equipment, status

### INDUSTRY-U0808
technology_exchange_listing | listing_id, country_id, technology_id, listing_type, visibility, conditions

### INDUSTRY-U0809
technology_licence | contract_id, technology_id, rights, fees, royalty, limits, expiry

### INDUSTRY-U0810
technology_transfer | transfer_id, technology_id, provider, recipient, scope, absorption_progress

### INDUSTRY-U0811
joint_rd | programme_id, target_technology, participants, contributions, ip_rule, progress

### INDUSTRY-U0812
research_centre | centre_id, type, host, participants, ownership, staff, equipment

### INDUSTRY-U0813
talent_exchange | exchange_id, specialisation, sending, receiving, count, duration, project

### INDUSTRY-U0814
industry_project | project_id, type, location, capex, funding, inputs, labour, technology, milestones, progress, status

### INDUSTRY-U0815
infrastructure_asset | asset_id, type, capacity, location, status

### INDUSTRY-U0816
sector_support | programme_id, sector, budget, support_type, unit_support, duration

### INDUSTRY-U0817
strategic_reserve | country_id, commodity_id, inventory, target, facility_capacity

### INDUSTRY-U0818
emission_standard | sector_id, metric, limit, effective_from

### INDUSTRY-U0819
54. 核心计算公式

### INDUSTRY-U0820
计算 | 规则

### INDUSTRY-U0821
Resource conservation | InitialEndowment = RemainingUnderground + CumulativeExtraction

### INDUSTRY-U0822
Recoverable Reserve | DiscoveredResource × RecoveryRate

### INDUSTRY-U0823
Labour Availability | min(Available_skill / Required_skill, 1)

### INDUSTRY-U0824
Actual Extraction | Capacity × Labour × Energy × Equipment × Infrastructure × Efficiency

### INDUSTRY-U0825
Facility Feasible Output | OperationalCapacity × min(Input, Labour, Energy, Infrastructure, Maintenance)

### INDUSTRY-U0826
Inventory | Previous + Production + Imports - Use - Exports - Projects - Losses

### INDUSTRY-U0827
Generation | AvailableMW × CapacityFactor × Time

### INDUSTRY-U0828
Electricity Balance | DeliveredGeneration - TotalDemand

### INDUSTRY-U0829
Reserve Margin | (AvailableCapacity - PeakDemand) / PeakDemand

### INDUSTRY-U0830
Research Output | FundingUsed × HumanCapital × EquipmentAvailability × TechnologyBase × Collaboration

### INDUSTRY-U0831
Research Progress | AccumulatedOutput / RequiredOutput

### INDUSTRY-U0832
Construction Progress | f(FundingReleased, MaterialsDelivered, Labour, Technology, Admin, Infra)

### INDUSTRY-U0833
Strategic Coverage Days | ReserveInventory / DailyCriticalDemand

### INDUSTRY-U0834
Emissions | ActualOutput × EmissionFactor

### INDUSTRY-U0835
55. 前端全部操作控件

### INDUSTRY-U0836
模块 | 全部操作

### INDUSTRY-U0837
Resources | Open Deposit, Create Exploration, Create Development Project, Set Extraction Target, Reduce/Pause Extraction, Decommission

### INDUSTRY-U0838
Production | Set Production Target, Set Utilisation Target, Prioritise Facility, Expand, Upgrade, Pause, Resume, Close

### INDUSTRY-U0839
Energy | Create Plant Project, Set Generation Priority, Set Electricity Allocation Priority, Schedule Maintenance

### INDUSTRY-U0840
R&D | Create Research Project, Allocate Industry R&D Budget, Prioritise, Pause, Resume, Cancel

### INDUSTRY-U0841
Technology Portfolio | View Rights, Set Disclosure, Offer Licence, Seek Partner, Restrict Technology

### INDUSTRY-U0842
Technology Exchange | Search Licence, Post Research Need, Start Joint R&D, Request Transfer, Create Research Centre Proposal, Talent Exchange Request

### INDUSTRY-U0843
Projects | Create, Edit Technical Scope, Change Scale, Location, Technology, Request Funding, Request Inputs, Request Labour, Start, Pause, Resume, Reduce Scale, Upgrade, Decommission

### INDUSTRY-U0844
Infrastructure | Create Port/Rail/Grid/Digital/Storage Project, View Capacity Bottleneck

### INDUSTRY-U0845
Industrial Policy | Create Sector Support, Set Unit Subsidy, Create Local Procurement Rule, Create SEZ

### INDUSTRY-U0846
Strategic Reserves | Set Target, Request Purchase, Authorise Release, Schedule Release

### INDUSTRY-U0847
Environment | Set Sector Emission Standard, Require Upgrade, Restrict Non-compliant Capacity

### INDUSTRY-U0848
Requests | Create Funding/Trade/Workforce/Refinancing Request, Track Status

### INDUSTRY-U0849
56. Audit Ledger

### INDUSTRY-U0850
Audit Event Type

### INDUSTRY-U0851
ResourceEndowmentInitialised

### INDUSTRY-U0852
ExplorationStarted

### INDUSTRY-U0853
ExplorationCompleted

### INDUSTRY-U0854
ResourceDiscovered

### INDUSTRY-U0855
RecoverableReserveRevised

### INDUSTRY-U0856
DevelopmentProjectCreated

### INDUSTRY-U0857
ExtractionStarted

### INDUSTRY-U0858
ExtractionChanged

### INDUSTRY-U0859
DepositDepleted

### INDUSTRY-U0860
FacilityCreated

### INDUSTRY-U0861
ProductionTargetChanged

### INDUSTRY-U0862
FacilityExpanded

### INDUSTRY-U0863
FacilityUpgraded

### INDUSTRY-U0864
FacilityPaused

### INDUSTRY-U0865
FacilityClosed

### INDUSTRY-U0866
PowerPlantCommissioned

### INDUSTRY-U0867
GenerationPriorityChanged

### INDUSTRY-U0868
ResearchProjectCreated

### INDUSTRY-U0869
RDBudgetAllocated

### INDUSTRY-U0870
ResearchMilestoneReached

### INDUSTRY-U0871
TechnologyMastered

### INDUSTRY-U0872
TechnologyLicensed

### INDUSTRY-U0873
TechnologyTransferStarted

### INDUSTRY-U0874
TechnologyTransferCompleted

### INDUSTRY-U0875
JointRDCreated

### INDUSTRY-U0876
JointRDMilestone

### INDUSTRY-U0877
TechnologyDisclosureChanged

### INDUSTRY-U0878
ProjectCreated

### INDUSTRY-U0879
FundingRequested

### INDUSTRY-U0880
SupplyRequested

### INDUSTRY-U0881
WorkforceRequested

### INDUSTRY-U0882
ProjectApproved

### INDUSTRY-U0883
ConstructionStarted

### INDUSTRY-U0884
ConstructionMilestone

### INDUSTRY-U0885
ProjectDelayed

### INDUSTRY-U0886
ProjectOperational

### INDUSTRY-U0887
ProjectCancelled

### INDUSTRY-U0888
SectorSupportCreated

### INDUSTRY-U0889
SEZCreated

### INDUSTRY-U0890
StrategicReserveTargetChanged

### INDUSTRY-U0891
ReserveReleased

### INDUSTRY-U0892
EmissionStandardChanged

### INDUSTRY-U0893
EmissionBreach

### INDUSTRY-U0894
所有事件必须记录 event_id、simulation_id、country_id、actor_user_id、actor_office、object_id、timestamp、structured_payload、before_state_hash、after_state_hash。

### INDUSTRY-U0895
57. 旧版 World Simulation 迁移规则

### INDUSTRY-U0896
旧版 | Season 1

### INDUSTRY-U0897
R&D Spending 0–5% GDP | 保留为 Finance 批准的总 R&D Budget 统计结果；前端核心操作改为具体 Research Project 与预算分配。

### INDUSTRY-U0898
Industrial Subsidy 0–30% | 改为 Sector Support Programme：Budget、Unit Subsidy、Eligible Projects、Duration。

### INDUSTRY-U0899
Infrastructure Investment 0–15% GDP | 删除为直接控制；改为具体 Port/Rail/Grid/Digital/Storage Project。

### INDUSTRY-U0900
SEZ Size slider | 改为具体 SEZ Project 与 Location/Area/Capacity/Infrastructure。

### INDUSTRY-U0901
Local Procurement 0–80% | 改为项目/补贴项目的 Domestic Content Minimum。

### INDUSTRY-U0902
Digital Infrastructure %GDP | 改为 Digital Backbone / Industrial Network Project。

### INDUSTRY-U0903
Skills & Technology Diffusion %GDP | 拆分为 Social Workforce/Training + Industry Technology Transfer/Absorption。

### INDUSTRY-U0904
SOE Investment %GDP | 拆分为 Industry SOE Project + Finance Equity/Guarantee。

### INDUSTRY-U0905
Fossil/Renewable/Nuclear Investment slider | 改为具体 Power Plant / Grid / Storage Project。

### INDUSTRY-U0906
Strategic Reserve Release % | 改为 Commodity + Quantity/Rate + Duration。

### INDUSTRY-U0907
Reserve Accumulation % annual demand | 改为 Target Inventory + Acquisition Request。

### INDUSTRY-U0908
Extraction Licence % capacity | 删除；改为 Deposit Development Project。

### INDUSTRY-U0909
Carbon Tax | 迁移 Finance Owner；Industry consultation。

### INDUSTRY-U0910
Emission Standard 0–100 | 改为 Sector-specific physical emission limit。

### INDUSTRY-U0911
58. 工程验收 Checklist

### INDUSTRY-U0912
□ 六种地下资源的 Initial Geological Endowment 在 Season 创建后不可因玩家行为增加。

### INDUSTRY-U0913
□ 所有勘探发现量均从隐藏 Undiscovered Pool 转移，不改变总量。

### INDUSTRY-U0914
□ 累计开采永久减少 Remaining Underground Resource。

### INDUSTRY-U0915
□ 技术只改变 Recovery Rate、成本、效率、劳动力和环境，不增加 Geological Endowment。

### INDUSTRY-U0916
□ 每个 Deposit/Facility/Project/Research 都有 Low/Medium/High Skill Required 与 Available。

### INDUSTRY-U0917
□ 劳动力不足实际限制开采、生产、建设和研发。

### INDUSTRY-U0918
□ 生产设施不能在投入品、能源、工人或基础设施不足时达到目标产量。

### INDUSTRY-U0919
□ 所有固定生产链严格消耗对应 Commodity Inventory。

### INDUSTRY-U0920
□ Power Plant 使用真实 MW/MWh、燃料和 Grid Capacity。

### INDUSTRY-U0921
□ Technology Portfolio 能区分 MASTERED、LICENSED、TRANSFER_IN_PROGRESS、JOINTLY_OWNED。

### INDUSTRY-U0922
□ Licence 的期限、产量、出口和再授权限制能够阻止非法项目/使用。

### INDUSTRY-U0923
□ Technology Transfer 有 Absorption Progress，不能瞬时变成 Mastered。

### INDUSTRY-U0924
□ Joint R&D 由各国真实 Funding/Staff/Equipment 贡献形成进度。

### INDUSTRY-U0925
□ Global Technology Exchange 按 Disclosure State 控制可见性。

### INDUSTRY-U0926
□ Classified Technology 对其他国家不可见。

### INDUSTRY-U0927
□ 所有实体能力增长必须来自 Project Pipeline。

### INDUSTRY-U0928
□ 项目必须满足 Funding、Materials、Labour、Technology、Approvals 才能开工。

### INDUSTRY-U0929
□ 施工里程碑真实消耗 Steel/Copper/Machinery 等材料。

### INDUSTRY-U0930
□ Industry 无法替 Finance 发债或付款。

### INDUSTRY-U0931
□ Industry 无法替 Trade 选择外国供应商或签国际合同。

### INDUSTRY-U0932
□ Industry 无法替 Social 生成劳动力。

### INDUSTRY-U0933
□ Industry 无法修改政策利率或官方外储。

### INDUSTRY-U0934
□ Infrastructure capacity 能真实限制贸易/生产吞吐。

### INDUSTRY-U0935
□ Strategic Reserve 使用实物库存和 Coverage Days。

### INDUSTRY-U0936
□ Emission Standard 使用物理单位并真实影响不合规设施。

### INDUSTRY-U0937
□ 所有跨 Office 请求具有结构化字段和状态。

### INDUSTRY-U0938
□ 所有关键操作写入 Audit Ledger。

### INDUSTRY-U0939
□ 70 国环境下 Technology Exchange、Supply Request 和 Partner Search 不依赖手工浏览全部国家。

### INDUSTRY-U0940
附录 A：Industry 全部操作空间总表

### INDUSTRY-U0941
模块 | 动作 | 权限 | 输入

### INDUSTRY-U0942
Resources | Create Exploration | Industry | Region, Resource, Budget, Staff, Equipment, Technology

### INDUSTRY-U0943
Resources | Develop Deposit | Industry + Finance | Deposit, Capacity, Inputs, Labour, Technology, Capex

### INDUSTRY-U0944
Resources | Set Extraction Target | Industry | Deposit, Quantity per period

### INDUSTRY-U0945
Resources | Pause/Resume Extraction | Industry | Deposit

### INDUSTRY-U0946
Production | Set Production Target | Industry | Facility/Sector, Quantity

### INDUSTRY-U0947
Production | Set Utilisation Target | Industry | Facility/Sector, %

### INDUSTRY-U0948
Production | Expand Facility | Industry + Finance | Capacity increment, Capex, inputs, labour

### INDUSTRY-U0949
Production | Upgrade Facility | Industry + Finance | Technology, equipment, cost, downtime

### INDUSTRY-U0950
Production | Decommission | Industry | Facility, schedule

### INDUSTRY-U0951
Energy | Create Power Project | Industry + Finance + Captain if large | Technology, MW, fuel, grid, labour, cost

### INDUSTRY-U0952
Energy | Set Allocation Priority | Industry | Priority order

### INDUSTRY-U0953
R&D | Create Research Project | Industry | Technology, budget, staff, equipment

### INDUSTRY-U0954
R&D | Allocate R&D Budget | Industry within Finance ceiling | Research project + LC

### INDUSTRY-U0955
Technology | Set Disclosure | Industry; Captain for strategic changes | Technology, State

### INDUSTRY-U0956
Technology | Offer Licence | Industry + Trade | Technology rights

### INDUSTRY-U0957
Technology | Request Foreign Licence | Industry + Trade | Technology rights needed

### INDUSTRY-U0958
Technology | Start Technology Transfer | Industry + Trade | Transfer scope, absorption plan

### INDUSTRY-U0959
Technology | Start Joint R&D | Industry + Trade | Technology, contributions, IP rule

### INDUSTRY-U0960
Technology | Create Research Centre Proposal | Industry + Trade + Finance | Centre type, participants, cost, IP

### INDUSTRY-U0961
Technology | Talent Exchange Request | Industry + Trade + Social | Skill, count, duration, host

### INDUSTRY-U0962
Projects | Create Project | Industry | Full Project Schema

### INDUSTRY-U0963
Projects | Change Scale/Location/Technology | Industry | Revised technical scope

### INDUSTRY-U0964
Projects | Request Funding | Industry → Finance | Project financial request

### INDUSTRY-U0965
Projects | Request Imported Inputs | Industry → Trade | Commodity, qty, due date

### INDUSTRY-U0966
Projects | Request Workforce | Industry → Social | Skill tiers, counts, dates

### INDUSTRY-U0967
Projects | Request Refinancing | Industry → CB | Sector, financing gap

### INDUSTRY-U0968
Projects | Start/Pause/Resume/Cancel | Industry subject to approvals | Project ID

### INDUSTRY-U0969
Industrial Policy | Create Sector Support | Industry + Finance | Sector, budget, support type

### INDUSTRY-U0970
Industrial Policy | Create Local Procurement Rule | Industry; Trade/Finance where relevant | Domestic content %

### INDUSTRY-U0971
SEZ | Create/Expand SEZ | Industry + Finance + Trade | Location, area, infrastructure, sectors

### INDUSTRY-U0972
Reserves | Set Target | Industry | Commodity, target quantity

### INDUSTRY-U0973
Reserves | Request Acquisition | Industry → Trade + Finance | Commodity, qty, due date

### INDUSTRY-U0974
Reserves | Release | Industry; Captain if emergency threshold | Commodity, qty/rate

### INDUSTRY-U0975
Environment | Set Emission Standard | Industry | Sector, physical limit

### INDUSTRY-U0976
附录 B：完整技术目录与状态

### INDUSTRY-U0977
Technology ID | Domain | Technology | 可获得状态

### INDUSTRY-U0978
ENERGY_ADV_SOLAR | Energy | Advanced Solar | RESEARCHABLE / MASTERED / LICENSED / TRANSFER_IN_PROGRESS / JOINTLY_OWNED / RESTRICTED / OBSOLETE

### INDUSTRY-U0979
ENERGY_GRID_STORAGE | Energy | Grid-scale Storage | RESEARCHABLE / MASTERED / LICENSED / TRANSFER_IN_PROGRESS / JOINTLY_OWNED / RESTRICTED / OBSOLETE

### INDUSTRY-U0980
ENERGY_ADV_NUCLEAR | Energy | Advanced Nuclear | RESEARCHABLE / MASTERED / LICENSED / TRANSFER_IN_PROGRESS / JOINTLY_OWNED / RESTRICTED / OBSOLETE

### INDUSTRY-U0981
ENERGY_SMART_GRID | Energy | Smart Grid | RESEARCHABLE / MASTERED / LICENSED / TRANSFER_IN_PROGRESS / JOINTLY_OWNED / RESTRICTED / OBSOLETE

### INDUSTRY-U0982
ENERGY_GREEN_H2 | Energy | Green Hydrogen | RESEARCHABLE / MASTERED / LICENSED / TRANSFER_IN_PROGRESS / JOINTLY_OWNED / RESTRICTED / OBSOLETE

### INDUSTRY-U0983
MFG_AUTOMATION | Manufacturing | Industrial Automation | RESEARCHABLE / MASTERED / LICENSED / TRANSFER_IN_PROGRESS / JOINTLY_OWNED / RESTRICTED / OBSOLETE

### INDUSTRY-U0984
MFG_ROBOTICS | Manufacturing | Advanced Robotics | RESEARCHABLE / MASTERED / LICENSED / TRANSFER_IN_PROGRESS / JOINTLY_OWNED / RESTRICTED / OBSOLETE

### INDUSTRY-U0985
MFG_PRECISION | Manufacturing | Precision Manufacturing | RESEARCHABLE / MASTERED / LICENSED / TRANSFER_IN_PROGRESS / JOINTLY_OWNED / RESTRICTED / OBSOLETE

### INDUSTRY-U0986
MFG_SMART | Manufacturing | Smart Manufacturing | RESEARCHABLE / MASTERED / LICENSED / TRANSFER_IN_PROGRESS / JOINTLY_OWNED / RESTRICTED / OBSOLETE

### INDUSTRY-U0987
SEMI_BASIC | Semiconductor | Basic Semiconductor | RESEARCHABLE / MASTERED / LICENSED / TRANSFER_IN_PROGRESS / JOINTLY_OWNED / RESTRICTED / OBSOLETE

### INDUSTRY-U0988
SEMI_ADV_FAB | Semiconductor | Advanced Fabrication | RESEARCHABLE / MASTERED / LICENSED / TRANSFER_IN_PROGRESS / JOINTLY_OWNED / RESTRICTED / OBSOLETE

### INDUSTRY-U0989
SEMI_PACKAGING | Semiconductor | Advanced Packaging | RESEARCHABLE / MASTERED / LICENSED / TRANSFER_IN_PROGRESS / JOINTLY_OWNED / RESTRICTED / OBSOLETE

### INDUSTRY-U0990
SEMI_HPC | Semiconductor | High-performance Chips | RESEARCHABLE / MASTERED / LICENSED / TRANSFER_IN_PROGRESS / JOINTLY_OWNED / RESTRICTED / OBSOLETE

### INDUSTRY-U0991
RESOURCE_ADV_EXPLORATION | Resources & Materials | Advanced Exploration | RESEARCHABLE / MASTERED / LICENSED / TRANSFER_IN_PROGRESS / JOINTLY_OWNED / RESTRICTED / OBSOLETE

### INDUSTRY-U0992
RESOURCE_ADV_MINING | Resources & Materials | Advanced Mining | RESEARCHABLE / MASTERED / LICENSED / TRANSFER_IN_PROGRESS / JOINTLY_OWNED / RESTRICTED / OBSOLETE

### INDUSTRY-U0993
RESOURCE_EFFICIENT_REFINING | Resources & Materials | High-efficiency Refining | RESEARCHABLE / MASTERED / LICENSED / TRANSFER_IN_PROGRESS / JOINTLY_OWNED / RESTRICTED / OBSOLETE

### INDUSTRY-U0994
RESOURCE_BATTERY_CHEM | Resources & Materials | Battery Chemistry | RESEARCHABLE / MASTERED / LICENSED / TRANSFER_IN_PROGRESS / JOINTLY_OWNED / RESTRICTED / OBSOLETE

### INDUSTRY-U0995
RESOURCE_ADV_MATERIALS | Resources & Materials | Advanced Materials | RESEARCHABLE / MASTERED / LICENSED / TRANSFER_IN_PROGRESS / JOINTLY_OWNED / RESTRICTED / OBSOLETE

### INDUSTRY-U0996
INFRA_DIGITAL_NETWORK | Infrastructure & Digital | Digital Industrial Network | RESEARCHABLE / MASTERED / LICENSED / TRANSFER_IN_PROGRESS / JOINTLY_OWNED / RESTRICTED / OBSOLETE

### INDUSTRY-U0997
INFRA_AUTO_LOGISTICS | Infrastructure & Digital | Automated Logistics | RESEARCHABLE / MASTERED / LICENSED / TRANSFER_IN_PROGRESS / JOINTLY_OWNED / RESTRICTED / OBSOLETE

### INDUSTRY-U0998
INFRA_SMART_PORT | Infrastructure & Digital | Smart Port | RESEARCHABLE / MASTERED / LICENSED / TRANSFER_IN_PROGRESS / JOINTLY_OWNED / RESTRICTED / OBSOLETE

### INDUSTRY-U0999
INFRA_ADV_GRID_MGMT | Infrastructure & Digital | Advanced Grid Management | RESEARCHABLE / MASTERED / LICENSED / TRANSFER_IN_PROGRESS / JOINTLY_OWNED / RESTRICTED / OBSOLETE

### INDUSTRY-U1000
附录 C：完整项目目录与 Required Offices

### INDUSTRY-U1001
Category | Project | Required Offices

### INDUSTRY-U1002
Resource | Oil Field Development | Industry + Finance if public funding; Trade if foreign inputs/tech/FDI; Social if labour threshold; Captain if strategic/large

### INDUSTRY-U1003
Resource | Gas Field Development | Industry + Finance if public funding; Trade if foreign inputs/tech/FDI; Social if labour threshold; Captain if strategic/large

### INDUSTRY-U1004
Resource | Uranium Mine | Industry + Finance if public funding; Trade if foreign inputs/tech/FDI; Social if labour threshold; Captain if strategic/large

### INDUSTRY-U1005
Resource | Iron Ore Mine | Industry + Finance if public funding; Trade if foreign inputs/tech/FDI; Social if labour threshold; Captain if strategic/large

### INDUSTRY-U1006
Resource | Copper Mine | Industry + Finance if public funding; Trade if foreign inputs/tech/FDI; Social if labour threshold; Captain if strategic/large

### INDUSTRY-U1007
Resource | Lithium Mine | Industry + Finance if public funding; Trade if foreign inputs/tech/FDI; Social if labour threshold; Captain if strategic/large

### INDUSTRY-U1008
Energy | Gas Power Plant | Industry + Finance if public funding; Trade if foreign inputs/tech/FDI; Social if labour threshold; Captain if strategic/large

### INDUSTRY-U1009
Energy | Fossil Power Plant | Industry + Finance if public funding; Trade if foreign inputs/tech/FDI; Social if labour threshold; Captain if strategic/large

### INDUSTRY-U1010
Energy | Nuclear Power Plant | Industry + Finance if public funding; Trade if foreign inputs/tech/FDI; Social if labour threshold; Captain if strategic/large

### INDUSTRY-U1011
Energy | Solar Farm | Industry + Finance if public funding; Trade if foreign inputs/tech/FDI; Social if labour threshold; Captain if strategic/large

### INDUSTRY-U1012
Energy | Wind Farm | Industry + Finance if public funding; Trade if foreign inputs/tech/FDI; Social if labour threshold; Captain if strategic/large

### INDUSTRY-U1013
Energy | Grid Upgrade | Industry + Finance if public funding; Trade if foreign inputs/tech/FDI; Social if labour threshold; Captain if strategic/large

### INDUSTRY-U1014
Energy | Energy Storage Facility | Industry + Finance if public funding; Trade if foreign inputs/tech/FDI; Social if labour threshold; Captain if strategic/large

### INDUSTRY-U1015
Industrial | Steel Mill | Industry + Finance if public funding; Trade if foreign inputs/tech/FDI; Social if labour threshold; Captain if strategic/large

### INDUSTRY-U1016
Industrial | Refinery | Industry + Finance if public funding; Trade if foreign inputs/tech/FDI; Social if labour threshold; Captain if strategic/large

### INDUSTRY-U1017
Industrial | Machinery Plant | Industry + Finance if public funding; Trade if foreign inputs/tech/FDI; Social if labour threshold; Captain if strategic/large

### INDUSTRY-U1018
Industrial | Semiconductor Fab | Industry + Finance if public funding; Trade if foreign inputs/tech/FDI; Social if labour threshold; Captain if strategic/large

### INDUSTRY-U1019
Industrial | Battery Gigafactory | Industry + Finance if public funding; Trade if foreign inputs/tech/FDI; Social if labour threshold; Captain if strategic/large

### INDUSTRY-U1020
Industrial | Industrial Park | Industry + Finance if public funding; Trade if foreign inputs/tech/FDI; Social if labour threshold; Captain if strategic/large

### INDUSTRY-U1021
Industrial | Special Economic Zone | Industry + Finance if public funding; Trade if foreign inputs/tech/FDI; Social if labour threshold; Captain if strategic/large

### INDUSTRY-U1022
Infrastructure | Deepwater Port | Industry + Finance if public funding; Trade if foreign inputs/tech/FDI; Social if labour threshold; Captain if strategic/large

### INDUSTRY-U1023
Infrastructure | Freight Railway | Industry + Finance if public funding; Trade if foreign inputs/tech/FDI; Social if labour threshold; Captain if strategic/large

### INDUSTRY-U1024
Infrastructure | National Power Grid | Industry + Finance if public funding; Trade if foreign inputs/tech/FDI; Social if labour threshold; Captain if strategic/large

### INDUSTRY-U1025
Infrastructure | Digital Backbone | Industry + Finance if public funding; Trade if foreign inputs/tech/FDI; Social if labour threshold; Captain if strategic/large

### INDUSTRY-U1026
Infrastructure | Logistics Hub | Industry + Finance if public funding; Trade if foreign inputs/tech/FDI; Social if labour threshold; Captain if strategic/large

### INDUSTRY-U1027
Infrastructure | Strategic Reserve Facility | Industry + Finance if public funding; Trade if foreign inputs/tech/FDI; Social if labour threshold; Captain if strategic/large

### INDUSTRY-U1028
Research Infrastructure | National Research Centre | Industry + Finance if public funding; Trade if international; Captain if strategic/large

### INDUSTRY-U1029
Research Infrastructure | Semiconductor Research Facility | Industry + Finance if public funding; Trade if international; Captain if strategic/large

### INDUSTRY-U1030
Research Infrastructure | Energy Research Centre | Industry + Finance if public funding; Trade if international; Captain if strategic/large

### INDUSTRY-U1031
Research Infrastructure | Materials Research Centre | Industry + Finance if public funding; Trade if international; Captain if strategic/large

### INDUSTRY-U1032
附录 D：全部资源与生产字段字典

### INDUSTRY-U1033
Entity | Field | Definition

### INDUSTRY-U1034
Resource Deposit | Deposit ID | 唯一资源区块

### INDUSTRY-U1035
Resource Deposit | Resource Type | 六种固定地下资源

### INDUSTRY-U1036
Resource Deposit | Location | 国内地区/地图节点

### INDUSTRY-U1037
Resource Deposit | Initial Geological Resource | 区块原始物理总量

### INDUSTRY-U1038
Resource Deposit | Discovered Resource | 已发现量

### INDUSTRY-U1039
Resource Deposit | Recoverable Reserve | 当前可采量

### INDUSTRY-U1040
Resource Deposit | Developed Reserve | 现有设施可直接开采量

### INDUSTRY-U1041
Resource Deposit | Undiscovered Pool | 服务器隐藏未发现量

### INDUSTRY-U1042
Resource Deposit | Current Extraction Capacity | 单位/模拟日或年化

### INDUSTRY-U1043
Resource Deposit | Actual Extraction | 实际当前产量

### INDUSTRY-U1044
Resource Deposit | Unit Extraction Cost | LC/单位

### INDUSTRY-U1045
Resource Deposit | Low Skill Required | 人数

### INDUSTRY-U1046
Resource Deposit | Medium Skill Required | 人数

### INDUSTRY-U1047
Resource Deposit | High Skill Required | 人数

### INDUSTRY-U1048
Resource Deposit | Electricity Requirement | MWh/单位

### INDUSTRY-U1049
Resource Deposit | Fuel Requirement | 适用时单位燃料

### INDUSTRY-U1050
Resource Deposit | Machinery Requirement | 设备数量

### INDUSTRY-U1051
Resource Deposit | Rail/Port Requirement | 物流容量

### INDUSTRY-U1052
Resource Deposit | Ownership Structure | 政府/SOE/私人/外国

### INDUSTRY-U1053
Resource Deposit | Operator | 运营主体

### INDUSTRY-U1054
Resource Deposit | Environmental Factor | 单位产量排放/扰动

### INDUSTRY-U1055
Resource Deposit | Remaining Economic Life | 按现有产能推算

### INDUSTRY-U1056
Resource Deposit | Development Status | Undiscovered/Exploring/Discovered/Proven/Developing/Producing/Depleted/Closed

### INDUSTRY-U1057
Production Facility | Facility ID | 设施 ID

### INDUSTRY-U1058
Production Facility | Facility Type | Sector 对应设施

### INDUSTRY-U1059
Production Facility | Location | 位置

### INDUSTRY-U1060
Production Facility | Installed Capacity | 设计产能

### INDUSTRY-U1061
Production Facility | Operational Capacity | 可运营产能

### INDUSTRY-U1062
Production Facility | Current Output | 当前产量

### INDUSTRY-U1063
Production Facility | Capacity Utilisation | 计算结果

### INDUSTRY-U1064
Production Facility | Utilisation Target | Industry 设置目标

### INDUSTRY-U1065
Production Facility | Input Recipe | 单位产出投入

### INDUSTRY-U1066
Production Facility | Current Input Inventory | 厂内投入库存

### INDUSTRY-U1067
Production Facility | Electricity Demand | MWh

### INDUSTRY-U1068
Production Facility | Low/Medium/High Skill Requirement | 人数

### INDUSTRY-U1069
Production Facility | Available Labour | 实际人数

### INDUSTRY-U1070
Production Facility | Unit Variable Cost | 单位变动成本

### INDUSTRY-U1071
Production Facility | Maintenance Cost | 维护费用

### INDUSTRY-U1072
Production Facility | Maintenance Status | 正常/检修

### INDUSTRY-U1073
Production Facility | Emission Factor | 单位排放

### INDUSTRY-U1074
Production Facility | Ownership | 产权

### INDUSTRY-U1075
Production Facility | Operator | 运营主体

### INDUSTRY-U1076
Production Facility | Commissioned Date | 投产时间

### INDUSTRY-U1077
Production Facility | Remaining Life | 剩余寿命

### INDUSTRY-U1078
Production Facility | Expansion Projects | 关联扩建

### INDUSTRY-U1079
Production Facility | Upgrade Projects | 关联升级

### INDUSTRY-U1080
Power Plant | Plant ID | 设施

### INDUSTRY-U1081
Power Plant | Technology | Gas/Fossil/Nuclear/Solar/Wind

### INDUSTRY-U1082
Power Plant | Installed Capacity MW | 装机

### INDUSTRY-U1083
Power Plant | Available Capacity MW | 可用

### INDUSTRY-U1084
Power Plant | Capacity Factor | 实际比例

### INDUSTRY-U1085
Power Plant | Fuel Type | 燃料

### INDUSTRY-U1086
Power Plant | Fuel Requirement | 单位发电燃料

### INDUSTRY-U1087
Power Plant | Fuel Inventory | 厂内库存

### INDUSTRY-U1088
Power Plant | Generation MWh | 实际发电

### INDUSTRY-U1089
Power Plant | Variable Cost | LC/MWh

### INDUSTRY-U1090
Power Plant | Maintenance Cost | 维护

### INDUSTRY-U1091
Power Plant | Low/Medium/High Skill | 人数

### INDUSTRY-U1092
Power Plant | Emission Factor | kgCO2e/MWh

### INDUSTRY-U1093
Power Plant | Grid Connection | 接入节点

### INDUSTRY-U1094
Power Plant | Commission Date | 投产

### INDUSTRY-U1095
Power Plant | Remaining Life | 寿命

### INDUSTRY-U1096
Industry Project | Project ID | 唯一项目

### INDUSTRY-U1097
Industry Project | Name | 名称

### INDUSTRY-U1098
Industry Project | Category / Type | 固定项目目录

### INDUSTRY-U1099
Industry Project | Location | 位置

### INDUSTRY-U1100
Industry Project | Project Owner | Industry

### INDUSTRY-U1101
Industry Project | Planned Capacity | 新增能力及单位

### INDUSTRY-U1102
Industry Project | Total Capex | 总成本

### INDUSTRY-U1103
Industry Project | Approved Funding | 已批准资金

### INDUSTRY-U1104
Industry Project | Funding Gap | 融资缺口

### INDUSTRY-U1105
Industry Project | Payment Schedule | 付款节点

### INDUSTRY-U1106
Industry Project | Steel Required | 建设钢材

### INDUSTRY-U1107
Industry Project | Copper Required | 建设铜

### INDUSTRY-U1108
Industry Project | Machinery Required | 设备

### INDUSTRY-U1109
Industry Project | Other Commodity Inputs | 适用投入

### INDUSTRY-U1110
Industry Project | Construction Electricity | 施工用电

### INDUSTRY-U1111
Industry Project | Construction Low/Medium/High Skill | 建设人员

### INDUSTRY-U1112
Industry Project | Permanent Low/Medium/High Skill | 运营人员

### INDUSTRY-U1113
Industry Project | Required Technology | 前置技术

### INDUSTRY-U1114
Industry Project | Licence Status | 外国技术状态

### INDUSTRY-U1115
Industry Project | External Supply Needs | 进口需求

### INDUSTRY-U1116
Industry Project | Start Date | 开始

### INDUSTRY-U1117
Industry Project | Milestones | 里程碑

### INDUSTRY-U1118
Industry Project | Expected Completion | 预计完成

### INDUSTRY-U1119
Industry Project | Construction Progress | 实际进度

### INDUSTRY-U1120
Industry Project | Annual Operating Cost | 运营成本

### INDUSTRY-U1121
Industry Project | Maintenance Cost | 维护

### INDUSTRY-U1122
Industry Project | Unit Input Recipe | 单位产出投入

### INDUSTRY-U1123
Industry Project | Emission Factor | 排放

### INDUSTRY-U1124
Industry Project | Land Requirement | 土地

### INDUSTRY-U1125
Industry Project | Grid/Port/Rail Requirement | 基础设施

### INDUSTRY-U1126
Industry Project | Ownership | 产权

### INDUSTRY-U1127
Industry Project | Foreign Ownership | 外资比例

### INDUSTRY-U1128
Industry Project | Status | 生命周期

### INDUSTRY-U1129
实现总原则 / Industry Office 的可玩性来自“真实资源约束 + 技术路线 + 项目建设 + 生产瓶颈 + 跨 Office 协商”。任何产能、储量、技术能力和项目进度都必须能够追溯到资源、投入、劳动力、能源、设备、资金、技术权利和自然时间，不允许通过抽象强度直接生成经济能力。
