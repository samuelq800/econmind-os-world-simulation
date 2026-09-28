# SOCIAL｜原始规范文本索引

原文件：`EconMind_Season1_Labour_Education_Social_Development_Minister_Function_Specification.docx`
本文件为段落/表格顺序提取，未修改规则，未协调矛盾；图像、批注、页眉页脚与版式以原Word为准。锚点仅供回查，不代表独立需求条数。

### SOCIAL-U0001
EconMind OS Season 1

### SOCIAL-U0002
Minister of Labour, Education & Social Development

### SOCIAL-U0003
劳工、教育与社会发展部长

### SOCIAL-U0004
完整功能、人口、人力资本、教育、医疗、住房、治安与社会系统规范

### SOCIAL-U0005
ROLE DEFINITION / 该 Office 是国家“人力与社会系统”的主责部门，统一管理 Population、Labour Market、Skills、Education、Healthcare、Migration、Social Protection、Housing、Public Safety 与 Distribution。所有可精确量化事项均使用真实人数、岗位、席位、工资、预算、床位、服务次数、等待时间、警力、住房单位和受益人数，不使用 0–100 程度值作为底层变量。

### SOCIAL-U0006
项目 | 定义

### SOCIAL-U0007
正式名称 | Minister of Labour, Education & Social Development / 劳工、教育与社会发展部长

### SOCIAL-U0008
核心资源 | Population / Labour / Human Capital / Public Services / Social Protection

### SOCIAL-U0009
核心权力 | 就业、技能、教育、医疗、移民、福利、住房、国内治安、公共服务和社会分配

### SOCIAL-U0010
项目原则 | Social 定义需求；Industry/Infrastructure 建实体设施；Finance 负责融资；Trade 负责国际人员与采购

### SOCIAL-U0011
继承基础 | 继承 World Simulation 现有最低工资、失业保障、福利、食品能源支持、住房、培训、养老金、安全网、移民和国家危机框架，并全部实体化

### SOCIAL-U0012
目录 / Contents

### SOCIAL-U0013
1. Office 定位与权限边界

### SOCIAL-U0014
2. 核心设计原则

### SOCIAL-U0015
3. Dashboard 与信息架构

### SOCIAL-U0016
4. Population 人口系统

### SOCIAL-U0017
5. Labour Force 劳动力系统

### SOCIAL-U0018
6. Employment & Unemployment

### SOCIAL-U0019
7. Skills & Workforce

### SOCIAL-U0020
8. Wage System

### SOCIAL-U0021
9. Cost of Living

### SOCIAL-U0022
10. Minimum Wage

### SOCIAL-U0023
11. National Workforce Plan

### SOCIAL-U0024
12. Training & Reskilling

### SOCIAL-U0025
13. Labour Mobility & Employment Services

### SOCIAL-U0026
14. Education 总架构

### SOCIAL-U0027
15. Basic Education

### SOCIAL-U0028
16. Vocational Education

### SOCIAL-U0029
17. Higher Education

### SOCIAL-U0030
18. Education Specialisation

### SOCIAL-U0031
19. Teachers & Education Capacity

### SOCIAL-U0032
20. Education Programmes

### SOCIAL-U0033
21. Education Infrastructure Request

### SOCIAL-U0034
22. Healthcare 总架构

### SOCIAL-U0035
23. Healthcare Demand

### SOCIAL-U0036
24. Healthcare Workforce

### SOCIAL-U0037
25. Healthcare Capacity

### SOCIAL-U0038
26. Healthcare Access & Waiting

### SOCIAL-U0039
27. Healthcare Programmes & Emergency

### SOCIAL-U0040
28. Migration

### SOCIAL-U0041
29. International Talent Exchange

### SOCIAL-U0042
30. Social Protection 总架构

### SOCIAL-U0043
31. Unemployment Insurance

### SOCIAL-U0044
32. Income / Food / Energy Support

### SOCIAL-U0045
33. Pension & Family Support

### SOCIAL-U0046
34. Welfare Pipeline

### SOCIAL-U0047
35. Housing

### SOCIAL-U0048
36. Housing Programmes

### SOCIAL-U0049
37. Public Safety

### SOCIAL-U0050
38. Police Workforce

### SOCIAL-U0051
39. Crime & Case Backlog

### SOCIAL-U0052
40. Protest & Public Order

### SOCIAL-U0053
41. Civil Emergency Response

### SOCIAL-U0054
42. Distribution & Social Conditions

### SOCIAL-U0055
43. Poverty & Inequality

### SOCIAL-U0056
44. Social Stress & National Condition

### SOCIAL-U0057
45. Shared Permissions

### SOCIAL-U0058
46. Approval Matrix

### SOCIAL-U0059
47. Information Advantage

### SOCIAL-U0060
48. Notifications

### SOCIAL-U0061
49. Score & Guardrails

### SOCIAL-U0062
50. Data Entities

### SOCIAL-U0063
51. Calculation Rules

### SOCIAL-U0064
52. Front-end Operations

### SOCIAL-U0065
53. Audit Ledger

### SOCIAL-U0066
54. Migration from Old World Simulation

### SOCIAL-U0067
55. Engineering Acceptance Checklist

### SOCIAL-U0068
Appendix A. Full Action Space

### SOCIAL-U0069
Appendix B. Programme Catalogue

### SOCIAL-U0070
Appendix C. Cross-office Approvals

### SOCIAL-U0071
Appendix D. Field Dictionary

### SOCIAL-U0072
1. Office 定位与权限边界

### SOCIAL-U0073
核心使命：确保国家拥有数量充足、技能匹配并能够被教育、医疗、住房、福利和治安系统支撑的人口与劳动力，同时把产业扩张、通胀、迁移、财政约束和危机转化为可执行的人力与社会政策。

### SOCIAL-U0074
核心定义 / Social Office = People + Labour + Skills + Education + Healthcare + Migration + Welfare + Housing + Public Safety

### SOCIAL-U0075
1.1 独占主责

### SOCIAL-U0076
人口与劳动年龄结构

### SOCIAL-U0077
劳动力参与、就业、失业、职位空缺和劳动市场服务

### SOCIAL-U0078
Low / Medium / High Skill 人力存量

### SOCIAL-U0079
National Minimum Wage

### SOCIAL-U0080
培训、再技能化和劳动力流动

### SOCIAL-U0081
Basic / Vocational / Higher Education 的政策与容量

### SOCIAL-U0082
教师、招生、毕业与教育专业方向

### SOCIAL-U0083
Healthcare 服务、人力、床位/门诊容量、等待和覆盖

### SOCIAL-U0084
Migration Policy 与国内准入

### SOCIAL-U0085
失业保险、收入、食品、能源、养老金、家庭和紧急援助

### SOCIAL-U0086
住房支持、住房需求和公共住房需求

### SOCIAL-U0087
国内 Police、Crime Response、Public Order 和 Civil Emergency

### SOCIAL-U0088
贫困、实际收入、生活成本与社会压力监测

### SOCIAL-U0089
1.2 非本 Office 所有事项

### SOCIAL-U0090
事项 | 主责 Office | Social 权限

### SOCIAL-U0091
政府总预算、税收、发债 | Finance | 提交预算需求、Programme 设计和受益对象；不能创造财政资金

### SOCIAL-U0092
产业/矿山/工厂/能源/基建项目 | Industry | 提交 Labour、Education、Healthcare、Housing 约束；不决定技术方案

### SOCIAL-U0093
国际合同、采购与人才国别谈判 | Trade | 定义需求、准入、技能和人数；Trade 谈对外条款

### SOCIAL-U0094
货币政策、银行、外储 | Central Bank | 处理对就业、住房成本、家庭负担的后果

### SOCIAL-U0095
国家战略与重大紧急权力 | Captain | 提供社会可行性；重大危机/结构改革升级 Captain

### SOCIAL-U0096
学校、医院、住房和警务设施建设 | Industry/Infrastructure + Finance | Social 是需求 Owner，不直接建设

### SOCIAL-U0097
2. 核心设计原则

### SOCIAL-U0098
原则 | 强制实现

### SOCIAL-U0099
真实人口 | 所有人口、学生、患者、教师、医护、警察、福利受益人使用真实人数

### SOCIAL-U0100
真实岗位 | Industry 和公共服务创建真实岗位需求，空缺由需求与供给计算

### SOCIAL-U0101
真实技能 | Low/Medium/High Skill 通过教育、培训、迁移和就业流动变化

### SOCIAL-U0102
真实教育 | Seats、Enrollment、Teachers、Duration、Graduates、Dropout

### SOCIAL-U0103
真实医疗 | Service Demand、Staff、Beds/Visits、Waiting、Backlog、Coverage

### SOCIAL-U0104
真实治安 | Police Personnel、Incidents、Response Time、Cases、Deployments

### SOCIAL-U0105
真实福利 | Eligibility、Applied、Approved、Paid、Benefit、Budget、Backlog

### SOCIAL-U0106
真实住房 | Units、Households、Shortage、Rent、Benefit Recipients

### SOCIAL-U0107
真实迁移 | Cap、Applications、Approved、Arrived、Departed、Active

### SOCIAL-U0108
派生比例 | Unemployment、Coverage、Crime Rate、Dependency、Gini 等全部由底层数据计算

### SOCIAL-U0109
跨部门守恒 | Social 不直接创造钱、房、医院、工厂、进口药品或工人

### SOCIAL-U0110
3. Dashboard 与信息架构

### SOCIAL-U0111
页面 | 完整内容

### SOCIAL-U0112
01 Population | 总人口、年龄组、家庭数、净迁移、Dependency Ratio

### SOCIAL-U0113
02 Labour Force | 劳动力、参与率、就业、失业、非劳动力人口、岗位空缺

### SOCIAL-U0114
03 Employment | 按 Sector × Skill × Location 的需求、就业、空缺、工资

### SOCIAL-U0115
04 Skills | Low/Medium/High Stock、Demand、Gap、在训与毕业管线

### SOCIAL-U0116
05 Wages & Living Costs | 工资、最低工资、生活成本、Real Disposable Margin

### SOCIAL-U0117
06 Education | Basic/Vocational/Higher、Seats、Enrollment、Teachers、Graduates、Specialisation

### SOCIAL-U0118
07 Healthcare | Demand、Staff、Capacity、Waiting、Backlog、Coverage、Emergency

### SOCIAL-U0119
08 Migration | 各类别 Cap、Applications、Approved、Arrived、Active

### SOCIAL-U0120
09 Social Protection | 福利 Eligibility、Recipients、Payment、Backlog、Cost

### SOCIAL-U0121
10 Housing | 住房单位、家庭需求、短缺、租金和 Housing Support

### SOCIAL-U0122
11 Public Safety | Police Workforce、Incidents、Response Time、Cases、Public Order

### SOCIAL-U0123
12 Social Conditions | Poverty、Inequality、Real Income、Cost-of-Living Stress

### SOCIAL-U0124
13 Workforce Plan | 未来 7/30/60 天 Labour Demand 与 Supply Forecast

### SOCIAL-U0125
14 Requests & Approvals | Workforce / Education / Healthcare / Housing / Talent / Budget 请求

### SOCIAL-U0126
15 Inbox | 所有短缺、超载、延期、危机和待审批事项

### SOCIAL-U0127
4. Population 人口系统

### SOCIAL-U0128
人口组 | 系统范围 | 主要作用

### SOCIAL-U0129
Children | 0-15 | 基础教育需求

### SOCIAL-U0130
Working Age | 16-64 | 潜在 Labour Force

### SOCIAL-U0131
Retired / Elderly | 65+ | 养老金与医疗需求

### SOCIAL-U0132
人口恒等式 / Population_t = Population_(t-1) + Births - Deaths + Immigration - Emigration

### SOCIAL-U0133
Dependency Ratio / (Children + Retired) / WorkingAgePopulation

### SOCIAL-U0134
字段 | 定义

### SOCIAL-U0135
Total Population | 真实人数、金额、容量、期限或派生指标

### SOCIAL-U0136
Children | 真实人数、金额、容量、期限或派生指标

### SOCIAL-U0137
Working-Age Population | 真实人数、金额、容量、期限或派生指标

### SOCIAL-U0138
Retired Population | 真实人数、金额、容量、期限或派生指标

### SOCIAL-U0139
Households | 真实人数、金额、容量、期限或派生指标

### SOCIAL-U0140
Average Household Size | 真实人数、金额、容量、期限或派生指标

### SOCIAL-U0141
Labour Force | 真实人数、金额、容量、期限或派生指标

### SOCIAL-U0142
Students | 真实人数、金额、容量、期限或派生指标

### SOCIAL-U0143
Net Immigration | 真实人数、金额、容量、期限或派生指标

### SOCIAL-U0144
Net Emigration | 真实人数、金额、容量、期限或派生指标

### SOCIAL-U0145
Dependency Ratio | 真实人数、金额、容量、期限或派生指标

### SOCIAL-U0146
5. Labour Force 劳动力系统

### SOCIAL-U0147
Labour Force / LabourForce = Employed + UnemployedSearching

### SOCIAL-U0148
LFPR / LabourForce / WorkingAgePopulation

### SOCIAL-U0149
Unemployment Rate / UnemployedSearching / LabourForce

### SOCIAL-U0150
状态 | 定义

### SOCIAL-U0151
Employed | 存在有效岗位

### SOCIAL-U0152
Unemployed Searching | 无工作且求职

### SOCIAL-U0153
Student | 教育中

### SOCIAL-U0154
Caregiving / Family | 非劳动力

### SOCIAL-U0155
Unable to Work | 非劳动力

### SOCIAL-U0156
Early Retired | 非劳动力

### SOCIAL-U0157
Temporary Project Worker | 按许可进入 Labour Force

### SOCIAL-U0158
Migrant Worker | 按工作权进入 Labour Force

### SOCIAL-U0159
6. Employment & Unemployment

### SOCIAL-U0160
固定 Employment Sector

### SOCIAL-U0161
Mining & Extraction

### SOCIAL-U0162
Oil & Gas

### SOCIAL-U0163
Agriculture / Grain

### SOCIAL-U0164
Steel

### SOCIAL-U0165
Refining

### SOCIAL-U0166
Machinery

### SOCIAL-U0167
Semiconductor

### SOCIAL-U0168
Battery

### SOCIAL-U0169
Power Generation

### SOCIAL-U0170
Grid & Utilities

### SOCIAL-U0171
Construction

### SOCIAL-U0172
Logistics

### SOCIAL-U0173
General Services

### SOCIAL-U0174
Education

### SOCIAL-U0175
Healthcare

### SOCIAL-U0176
Public Administration

### SOCIAL-U0177
Public Safety

### SOCIAL-U0178
字段 | 定义

### SOCIAL-U0179
Required Workers | 按 Sector × Skill × Location 存储或计算

### SOCIAL-U0180
Employed Workers | 按 Sector × Skill × Location 存储或计算

### SOCIAL-U0181
Vacancies | 按 Sector × Skill × Location 存储或计算

### SOCIAL-U0182
New Hires | 按 Sector × Skill × Location 存储或计算

### SOCIAL-U0183
Separations | 按 Sector × Skill × Location 存储或计算

### SOCIAL-U0184
Layoffs | 按 Sector × Skill × Location 存储或计算

### SOCIAL-U0185
Average Vacancy Duration | 按 Sector × Skill × Location 存储或计算

### SOCIAL-U0186
Average Unemployment Duration | 按 Sector × Skill × Location 存储或计算

### SOCIAL-U0187
Low-Skill Demand | 按 Sector × Skill × Location 存储或计算

### SOCIAL-U0188
Medium-Skill Demand | 按 Sector × Skill × Location 存储或计算

### SOCIAL-U0189
High-Skill Demand | 按 Sector × Skill × Location 存储或计算

### SOCIAL-U0190
Average Wage | 按 Sector × Skill × Location 存储或计算

### SOCIAL-U0191
Location | 按 Sector × Skill × Location 存储或计算

### SOCIAL-U0192
7. Skills & Workforce

### SOCIAL-U0193
ID | 层级 | 定义

### SOCIAL-U0194
LOW | Low Skill | 基础操作、一般服务和辅助岗位

### SOCIAL-U0195
MEDIUM | Medium Skill | 技术工、设备操作、维修、护理辅助和一般专业岗位

### SOCIAL-U0196
HIGH | High Skill | 工程师、研究人员、教师、医生和高级专业岗位

### SOCIAL-U0197
Skill Gap / SkillGap_k = LabourDemand_k - AvailableWorkers_k

### SOCIAL-U0198
Labour Constraint / LabourAvailability_s = min_k(AvailableWorkers_(s,k) / RequiredWorkers_(s,k))

### SOCIAL-U0199
8. Wage System 工资系统

### SOCIAL-U0200
字段 | 定义

### SOCIAL-U0201
National Median Wage | LC/hour 或 LC/year；增长率为派生

### SOCIAL-U0202
National Average Wage | LC/hour 或 LC/year；增长率为派生

### SOCIAL-U0203
Low-Skill Median Wage | LC/hour 或 LC/year；增长率为派生

### SOCIAL-U0204
Medium-Skill Median Wage | LC/hour 或 LC/year；增长率为派生

### SOCIAL-U0205
High-Skill Median Wage | LC/hour 或 LC/year；增长率为派生

### SOCIAL-U0206
Sector Average Wage | LC/hour 或 LC/year；增长率为派生

### SOCIAL-U0207
Teacher Wage | LC/hour 或 LC/year；增长率为派生

### SOCIAL-U0208
Healthcare Wage | LC/hour 或 LC/year；增长率为派生

### SOCIAL-U0209
Police Wage | LC/hour 或 LC/year；增长率为派生

### SOCIAL-U0210
Minimum Wage | LC/hour 或 LC/year；增长率为派生

### SOCIAL-U0211
Nominal Wage Growth | LC/hour 或 LC/year；增长率为派生

### SOCIAL-U0212
Real Wage Growth | LC/hour 或 LC/year；增长率为派生

### SOCIAL-U0213
行业工资变化 / WageGrowth_s = f(VacancyRate_s, Productivity_s, Inflation, MinimumWage, SkillScarcity_s)

### SOCIAL-U0214
9. Cost of Living 与家庭生活成本

### SOCIAL-U0215
组成 | 底层来源

### SOCIAL-U0216
Food Cost | Food/Grain Price 与家庭消费

### SOCIAL-U0217
Energy Cost | Electricity/Fuel/Gas Price

### SOCIAL-U0218
Housing Cost | Rent / Mortgage Cost

### SOCIAL-U0219
Basic Consumption | 一般消费和交通价格

### SOCIAL-U0220
Essential Living Cost / FoodCost + EnergyCost + HousingCost + BasicConsumptionCost

### SOCIAL-U0221
Disposable Income / GrossIncome - DirectTaxes + Transfers

### SOCIAL-U0222
Real Disposable Margin / DisposableIncome - EssentialLivingCost

### SOCIAL-U0223
10. Minimum Wage 最低工资

### SOCIAL-U0224
字段 | 定义

### SOCIAL-U0225
National Minimum Wage | 金额、人数、日期或派生效果

### SOCIAL-U0226
Effective Date | 金额、人数、日期或派生效果

### SOCIAL-U0227
Affected Workers | 金额、人数、日期或派生效果

### SOCIAL-U0228
Affected Payroll | 金额、人数、日期或派生效果

### SOCIAL-U0229
Employer Cost Change | 金额、人数、日期或派生效果

### SOCIAL-U0230
Public Sector Cost Change | 金额、人数、日期或派生效果

### SOCIAL-U0231
Estimated Employment Effect | 金额、人数、日期或派生效果

### SOCIAL-U0232
Inflation Pass-through | 金额、人数、日期或派生效果

### SOCIAL-U0233
Season 1 采用统一 National Minimum Wage；玩家直接设置 LC/hour 或 LC/year，不使用“median wage 百分比 slider”。

### SOCIAL-U0234
11. National Workforce Plan 国家人力规划

### SOCIAL-U0235
字段 | 定义

### SOCIAL-U0236
Current Employment | 系统预测字段

### SOCIAL-U0237
Current Vacancies | 系统预测字段

### SOCIAL-U0238
Unemployment by Skill | 系统预测字段

### SOCIAL-U0239
Project Construction Labour Demand | 系统预测字段

### SOCIAL-U0240
Future Operational Labour Demand | 系统预测字段

### SOCIAL-U0241
Expected Retirements | 系统预测字段

### SOCIAL-U0242
Training Graduates | 系统预测字段

### SOCIAL-U0243
Education Graduates | 系统预测字段

### SOCIAL-U0244
Approved Migrant Arrivals | 系统预测字段

### SOCIAL-U0245
Expected Emigration | 系统预测字段

### SOCIAL-U0246
Public Service Hiring Demand | 系统预测字段

### SOCIAL-U0247
Forecast Skill Gap 7/30/60 days | 系统预测字段

### SOCIAL-U0248
12. Training & Reskilling

### SOCIAL-U0249
字段 | 定义

### SOCIAL-U0250
Programme ID | Programme 固定字段

### SOCIAL-U0251
Programme Name | Programme 固定字段

### SOCIAL-U0252
Starting Skill | Programme 固定字段

### SOCIAL-U0253
Target Skill | Programme 固定字段

### SOCIAL-U0254
Target Sector | Programme 固定字段

### SOCIAL-U0255
Seats | Programme 固定字段

### SOCIAL-U0256
Applicants | Programme 固定字段

### SOCIAL-U0257
Enrolled | Programme 固定字段

### SOCIAL-U0258
Training Duration | Programme 固定字段

### SOCIAL-U0259
Cost per Participant | Programme 固定字段

### SOCIAL-U0260
Total Budget | Programme 固定字段

### SOCIAL-U0261
Trainers Required | Programme 固定字段

### SOCIAL-U0262
Facility Capacity | Programme 固定字段

### SOCIAL-U0263
Start Date | Programme 固定字段

### SOCIAL-U0264
Completion Rate | Programme 固定字段

### SOCIAL-U0265
Expected Graduates | Programme 固定字段

### SOCIAL-U0266
Actual Graduates | Programme 固定字段

### SOCIAL-U0267
Placement Target | Programme 固定字段

### SOCIAL-U0268
Placed in Employment | Programme 固定字段

### SOCIAL-U0269
Graduates / Enrolled × CompletionRate

### SOCIAL-U0270
标准 Skill Transition 固定为 LOW→MEDIUM、MEDIUM→HIGH；High Skill 的形成要求更长周期、更高成本和教育/专业训练容量。

### SOCIAL-U0271
13. Labour Mobility & Employment Services

### SOCIAL-U0272
Programme | 作用

### SOCIAL-U0273
Public Employment Service | Vacancy 与求职者匹配

### SOCIAL-U0274
Relocation Support | 支持跨地区就业迁移

### SOCIAL-U0275
Return-to-Work | 长期非就业人口重返 Labour Force

### SOCIAL-U0276
Childcare Support | 减少照护导致的退出

### SOCIAL-U0277
Retirement Retention | 延长部分高技能劳动参与

### SOCIAL-U0278
Project Labour Mobility | 向特定项目地区移动劳动力

### SOCIAL-U0279
Job Matches / f(Vacancies, UnemployedWorkers, SkillMatch, LocationMatch, EmploymentServiceCapacity)

### SOCIAL-U0280
14. Education 教育系统总架构

### SOCIAL-U0281
层级 | 主要功能

### SOCIAL-U0282
Basic Education | 基础人力资本和后续教育基础

### SOCIAL-U0283
Vocational Education | 主要产生 Medium Skill 技术劳动力

### SOCIAL-U0284
Higher Education | 主要产生 High Skill 专业、教师、医生与研究人才

### SOCIAL-U0285
字段 | 定义

### SOCIAL-U0286
Eligible Population | 按 Education Level / Specialisation / Location 存储

### SOCIAL-U0287
Available Seats | 按 Education Level / Specialisation / Location 存储

### SOCIAL-U0288
Applications | 按 Education Level / Specialisation / Location 存储

### SOCIAL-U0289
Enrolled Students | 按 Education Level / Specialisation / Location 存储

### SOCIAL-U0290
Teacher Requirement | 按 Education Level / Specialisation / Location 存储

### SOCIAL-U0291
Teachers Employed | 按 Education Level / Specialisation / Location 存储

### SOCIAL-U0292
Teacher Vacancies | 按 Education Level / Specialisation / Location 存储

### SOCIAL-U0293
Student-Teacher Ratio | 按 Education Level / Specialisation / Location 存储

### SOCIAL-U0294
Programme Duration | 按 Education Level / Specialisation / Location 存储

### SOCIAL-U0295
Dropout Rate | 按 Education Level / Specialisation / Location 存储

### SOCIAL-U0296
Completion Rate | 按 Education Level / Specialisation / Location 存储

### SOCIAL-U0297
Graduates | 按 Education Level / Specialisation / Location 存储

### SOCIAL-U0298
Operating Cost | 按 Education Level / Specialisation / Location 存储

### SOCIAL-U0299
Capital Capacity | 按 Education Level / Specialisation / Location 存储

### SOCIAL-U0300
Location | 按 Education Level / Specialisation / Location 存储

### SOCIAL-U0301
Specialisation | 按 Education Level / Specialisation / Location 存储

### SOCIAL-U0302
15. Basic Education

### SOCIAL-U0303
管理适龄人口 Enrollment、Seats、Teachers、Completion

### SOCIAL-U0304
Seat、Teacher、Budget Shortage 均可限制实际 Enrollment

### SOCIAL-U0305
决定未来进入 Vocational / Higher Education 的人口基础

### SOCIAL-U0306
不直接产生 High Skill

### SOCIAL-U0307
16. Vocational Education

### SOCIAL-U0308
固定 Vocational Specialisation

### SOCIAL-U0309
Manufacturing & Machinery

### SOCIAL-U0310
Mining & Resources

### SOCIAL-U0311
Construction

### SOCIAL-U0312
Energy & Grid

### SOCIAL-U0313
Logistics

### SOCIAL-U0314
Healthcare Support

### SOCIAL-U0315
Public Safety Support

### SOCIAL-U0316
General Technical

### SOCIAL-U0317
Medium Skill Graduates / CompletedVocationalStudents × SkillConversionFactor

### SOCIAL-U0318
17. Higher Education

### SOCIAL-U0319
固定 Higher Education Specialisation

### SOCIAL-U0320
Engineering & Manufacturing

### SOCIAL-U0321
Energy & Resources

### SOCIAL-U0322
Digital & Semiconductor

### SOCIAL-U0323
Healthcare & Medicine

### SOCIAL-U0324
Education & Teaching

### SOCIAL-U0325
Public Administration & Law

### SOCIAL-U0326
Business & Economics

### SOCIAL-U0327
Science & Research

### SOCIAL-U0328
18. Education Specialisation

### SOCIAL-U0329
字段 | 定义

### SOCIAL-U0330
Specialisation ID | 教育专业方向字段

### SOCIAL-U0331
Level | 教育专业方向字段

### SOCIAL-U0332
Seats | 教育专业方向字段

### SOCIAL-U0333
Current Enrollment | 教育专业方向字段

### SOCIAL-U0334
Required Teachers | 教育专业方向字段

### SOCIAL-U0335
Required Facilities | 教育专业方向字段

### SOCIAL-U0336
Programme Duration | 教育专业方向字段

### SOCIAL-U0337
Graduate Skill Type | 教育专业方向字段

### SOCIAL-U0338
Target Employment Sectors | 教育专业方向字段

### SOCIAL-U0339
19. Teachers & Education Capacity

### SOCIAL-U0340
Actual Enrollment / min(Applicants, AvailableSeats, TeacherSupportedSeats, BudgetSupportedSeats)

### SOCIAL-U0341
Teacher Supported Seats / TeachersEmployed × StudentsPerTeacherStandard

### SOCIAL-U0342
字段 | 定义

### SOCIAL-U0343
Teacher Stock | 真实人数或工资

### SOCIAL-U0344
Teacher Vacancies | 真实人数或工资

### SOCIAL-U0345
Teachers in Training | 真实人数或工资

### SOCIAL-U0346
Teacher Wage | 真实人数或工资

### SOCIAL-U0347
Teacher Attrition | 真实人数或工资

### SOCIAL-U0348
New Teacher Graduates | 真实人数或工资

### SOCIAL-U0349
Teacher Recruitment | 真实人数或工资

### SOCIAL-U0350
Teacher Distribution by Level | 真实人数或工资

### SOCIAL-U0351
20. Education Programmes

### SOCIAL-U0352
Programme | 固定用途

### SOCIAL-U0353
Scholarship Programme | Target Group、Seats、Benefit、Duration、Cost

### SOCIAL-U0354
Strategic Engineering Programme | Engineering seats

### SOCIAL-U0355
Semiconductor Talent Programme | Digital/Semiconductor seats

### SOCIAL-U0356
Energy & Resources Programme | 能源矿业人才

### SOCIAL-U0357
Healthcare Workforce Programme | 医疗人力

### SOCIAL-U0358
Teacher Training Programme | 教师供给

### SOCIAL-U0359
Adult Education | Working-Age 再教育

### SOCIAL-U0360
Public Safety Training | 警务与应急人员培训

### SOCIAL-U0361
21. Education Infrastructure Request

### SOCIAL-U0362
字段 | 定义

### SOCIAL-U0363
Education Level | Social 提交给 Industry/Infrastructure + Finance 的结构化需求

### SOCIAL-U0364
Specialisation | Social 提交给 Industry/Infrastructure + Finance 的结构化需求

### SOCIAL-U0365
Required Additional Seats | Social 提交给 Industry/Infrastructure + Finance 的结构化需求

### SOCIAL-U0366
Location | Social 提交给 Industry/Infrastructure + Finance 的结构化需求

### SOCIAL-U0367
Required Completion Date | Social 提交给 Industry/Infrastructure + Finance 的结构化需求

### SOCIAL-U0368
Projected Students | Social 提交给 Industry/Infrastructure + Finance 的结构化需求

### SOCIAL-U0369
Teacher Requirement | Social 提交给 Industry/Infrastructure + Finance 的结构化需求

### SOCIAL-U0370
Facility Type | Social 提交给 Industry/Infrastructure + Finance 的结构化需求

### SOCIAL-U0371
Estimated Capital Need | Social 提交给 Industry/Infrastructure + Finance 的结构化需求

### SOCIAL-U0372
Operating Budget Need | Social 提交给 Industry/Infrastructure + Finance 的结构化需求

### SOCIAL-U0373
Strategic Rationale | Social 提交给 Industry/Infrastructure + Finance 的结构化需求

### SOCIAL-U0374
Social 不直接建设学校或大学。

### SOCIAL-U0375
22. Healthcare 医疗系统总架构

### SOCIAL-U0376
Healthcare 核心原则 / Healthcare 不使用 Quality 0–100。系统使用人口医疗需求、Healthcare Workforce、Beds/Visits、Service Episodes、Waiting Time、Backlog、Coverage、Medicine/Equipment Availability 和 Budget。

### SOCIAL-U0377
层级 | 职责

### SOCIAL-U0378
Primary Care | 基础门诊和常见医疗需求

### SOCIAL-U0379
Hospital Care | 住院与综合医疗

### SOCIAL-U0380
Emergency Care | 急诊与紧急医疗

### SOCIAL-U0381
Public Health | 预防、筛查、公共卫生和危机应对

### SOCIAL-U0382
23. Healthcare Demand

### SOCIAL-U0383
字段 | 定义

### SOCIAL-U0384
Population | 真实服务次数/病例数

### SOCIAL-U0385
Children Health Demand | 真实服务次数/病例数

### SOCIAL-U0386
Working-Age Health Demand | 真实服务次数/病例数

### SOCIAL-U0387
Elderly Health Demand | 真实服务次数/病例数

### SOCIAL-U0388
Routine Primary Care Visits Required | 真实服务次数/病例数

### SOCIAL-U0389
Hospital Admissions Required | 真实服务次数/病例数

### SOCIAL-U0390
Emergency Cases | 真实服务次数/病例数

### SOCIAL-U0391
Chronic Care Load | 真实服务次数/病例数

### SOCIAL-U0392
Public Health Cases | 真实服务次数/病例数

### SOCIAL-U0393
Unserved Demand | 真实服务次数/病例数

### SOCIAL-U0394
Unserved Health Demand / RequiredServiceEpisodes - DeliveredServiceEpisodes

### SOCIAL-U0395
Season 1 不做复杂疾病微观模型；以医疗服务次数、住院、急诊和公共卫生负荷为核心单位。

### SOCIAL-U0396
24. Healthcare Workforce

### SOCIAL-U0397
Staff Type | Skill

### SOCIAL-U0398
Doctors | HIGH

### SOCIAL-U0399
Nurses | MEDIUM / HIGH

### SOCIAL-U0400
Medical Technicians | MEDIUM

### SOCIAL-U0401
Emergency Medical Staff | MEDIUM / HIGH

### SOCIAL-U0402
Public Health Staff | MEDIUM / HIGH

### SOCIAL-U0403
Support Staff | LOW / MEDIUM

### SOCIAL-U0404
字段 | 定义

### SOCIAL-U0405
Required Staff | 按 Staff Type × Location 存储

### SOCIAL-U0406
Employed Staff | 按 Staff Type × Location 存储

### SOCIAL-U0407
Vacancies | 按 Staff Type × Location 存储

### SOCIAL-U0408
Staff in Training | 按 Staff Type × Location 存储

### SOCIAL-U0409
New Graduates | 按 Staff Type × Location 存储

### SOCIAL-U0410
Overtime Load | 按 Staff Type × Location 存储

### SOCIAL-U0411
Attrition | 按 Staff Type × Location 存储

### SOCIAL-U0412
Average Wage | 按 Staff Type × Location 存储

### SOCIAL-U0413
Staff per 1,000 Population | 按 Staff Type × Location 存储

### SOCIAL-U0414
25. Healthcare Capacity

### SOCIAL-U0415
容量 | 单位

### SOCIAL-U0416
Primary Care Capacity | visits / simulation day

### SOCIAL-U0417
Hospital Beds | beds

### SOCIAL-U0418
Occupied Beds | beds

### SOCIAL-U0419
Critical Care Capacity | critical beds/equivalent

### SOCIAL-U0420
Emergency Treatment Capacity | cases / simulation day

### SOCIAL-U0421
Diagnostic Capacity | tests / simulation day

### SOCIAL-U0422
Public Health Capacity | cases/programmes per day

### SOCIAL-U0423
Medicine & Supply Availability | inventory coverage

### SOCIAL-U0424
Medical Equipment | operational units

### SOCIAL-U0425
Bed Occupancy / OccupiedBeds / AvailableBeds

### SOCIAL-U0426
Delivered Care / min(Demand, StaffSupportedCapacity, FacilityCapacity, SupplySupportedCapacity, BudgetSupportedCapacity)

### SOCIAL-U0427
26. Healthcare Access & Waiting

### SOCIAL-U0428
字段 | 定义

### SOCIAL-U0429
Patients Served | 真实人数、病例或模拟时间

### SOCIAL-U0430
Patients Waiting | 真实人数、病例或模拟时间

### SOCIAL-U0431
Average Primary Care Waiting Time | 真实人数、病例或模拟时间

### SOCIAL-U0432
Average Hospital Waiting Time | 真实人数、病例或模拟时间

### SOCIAL-U0433
Emergency Response Time | 真实人数、病例或模拟时间

### SOCIAL-U0434
Healthcare Coverage Population | 真实人数、病例或模拟时间

### SOCIAL-U0435
Unserved Population | 真实人数、病例或模拟时间

### SOCIAL-U0436
Delayed Treatment Cases | 真实人数、病例或模拟时间

### SOCIAL-U0437
Treatment Backlog | 真实人数、病例或模拟时间

### SOCIAL-U0438
Public Health Programme Coverage | 真实人数、病例或模拟时间

### SOCIAL-U0439
Healthcare Coverage / PopulationWithAccess / EligiblePopulation

### SOCIAL-U0440
27. Healthcare Programmes & Emergency

### SOCIAL-U0441
Programme | 职责

### SOCIAL-U0442
Primary Care Expansion | 增加门诊服务容量

### SOCIAL-U0443
Hospital Capacity Expansion Request | Social 定义床位/区域需求；Industry 建设；Finance 融资

### SOCIAL-U0444
Healthcare Workforce Training | 扩大医生/护士/技术人员供给

### SOCIAL-U0445
Emergency Medical Staffing | 临时增加急诊和危机轮班

### SOCIAL-U0446
Public Health Campaign | 增加公共卫生覆盖

### SOCIAL-U0447
Medicine Emergency Procurement Request | Social 定义需求，Trade 采购，Finance 支付

### SOCIAL-U0448
Medical Equipment Procurement Request | Social 定义规格/数量，Trade/Industry 配合

### SOCIAL-U0449
Healthcare Cost Support | 降低合资格群体医疗支出

### SOCIAL-U0450
28. Migration

### SOCIAL-U0451
类型 | Skill/Status | 用途

### SOCIAL-U0452
General Labour Migration | LOW / MEDIUM | 一般劳动力

### SOCIAL-U0453
Skilled Migration | MEDIUM | 技术岗位

### SOCIAL-U0454
High-Skill / Research Migration | HIGH | 工程、科研、医疗、教育

### SOCIAL-U0455
Temporary Project Workers | LOW/MEDIUM/HIGH | 限定项目与期限

### SOCIAL-U0456
Student / Training Migration | Education | 教育/训练

### SOCIAL-U0457
Humanitarian Migration | Mixed | 人口与公共服务优先处理

### SOCIAL-U0458
字段 | 定义

### SOCIAL-U0459
Admission Cap | 按 Migration Type 存储

### SOCIAL-U0460
Applications | 按 Migration Type 存储

### SOCIAL-U0461
Approved | 按 Migration Type 存储

### SOCIAL-U0462
Permit Issued | 按 Migration Type 存储

### SOCIAL-U0463
Arrived | 按 Migration Type 存储

### SOCIAL-U0464
Departed | 按 Migration Type 存储

### SOCIAL-U0465
Active Migrants | 按 Migration Type 存储

### SOCIAL-U0466
Skill Requirement | 按 Migration Type 存储

### SOCIAL-U0467
Sector Eligibility | 按 Migration Type 存储

### SOCIAL-U0468
Duration | 按 Migration Type 存储

### SOCIAL-U0469
Work Rights | 按 Migration Type 存储

### SOCIAL-U0470
Settlement Rights | 按 Migration Type 存储

### SOCIAL-U0471
Employer Sponsorship | 按 Migration Type 存储

### SOCIAL-U0472
Minimum Salary Requirement | 按 Migration Type 存储

### SOCIAL-U0473
Housing Requirement | 按 Migration Type 存储

### SOCIAL-U0474
Public Service Load | 按 Migration Type 存储

### SOCIAL-U0475
29. International Talent Exchange

### SOCIAL-U0476
字段 | 定义

### SOCIAL-U0477
Partner Country | 协议固定字段

### SOCIAL-U0478
Talent Type | 协议固定字段

### SOCIAL-U0479
Skill Level | 协议固定字段

### SOCIAL-U0480
Number of Participants | 协议固定字段

### SOCIAL-U0481
Host Sector / Institution | 协议固定字段

### SOCIAL-U0482
Start Date | 协议固定字段

### SOCIAL-U0483
Duration | 协议固定字段

### SOCIAL-U0484
Funding Responsibility | 协议固定字段

### SOCIAL-U0485
Salary / Stipend | 协议固定字段

### SOCIAL-U0486
Housing Responsibility | 协议固定字段

### SOCIAL-U0487
Training Commitment | 协议固定字段

### SOCIAL-U0488
Return Requirement | 协议固定字段

### SOCIAL-U0489
Knowledge Transfer Requirement | 协议固定字段

### SOCIAL-U0490
Work Rights | 协议固定字段

### SOCIAL-U0491
Extension Rule | 协议固定字段

### SOCIAL-U0492
Industry 提出技术人才需求；Trade 负责国际谈判；Social 管准入、劳动状态、住房和公共服务。

### SOCIAL-U0493
30. Social Protection 总架构

### SOCIAL-U0494
固定 Programme

### SOCIAL-U0495
Unemployment Insurance

### SOCIAL-U0496
Income Support

### SOCIAL-U0497
Food Support

### SOCIAL-U0498
Energy Support

### SOCIAL-U0499
Pension

### SOCIAL-U0500
Housing Benefit

### SOCIAL-U0501
Family / Child Support

### SOCIAL-U0502
Emergency Household Assistance

### SOCIAL-U0503
Healthcare Cost Support

### SOCIAL-U0504
字段 | 定义

### SOCIAL-U0505
Programme ID | Programme 通用字段

### SOCIAL-U0506
Eligibility Rule | Programme 通用字段

### SOCIAL-U0507
Eligible Population | Programme 通用字段

### SOCIAL-U0508
Applications | Programme 通用字段

### SOCIAL-U0509
Approved Population | Programme 通用字段

### SOCIAL-U0510
Paid Recipients | Programme 通用字段

### SOCIAL-U0511
Benefit Amount | Programme 通用字段

### SOCIAL-U0512
Payment Frequency | Programme 通用字段

### SOCIAL-U0513
Waiting Period | Programme 通用字段

### SOCIAL-U0514
Duration | Programme 通用字段

### SOCIAL-U0515
Maximum Benefit | Programme 通用字段

### SOCIAL-U0516
Programme Budget | Programme 通用字段

### SOCIAL-U0517
Actual Paid Cost | Programme 通用字段

### SOCIAL-U0518
Payment Backlog | Programme 通用字段

### SOCIAL-U0519
Administrative Capacity Required | Programme 通用字段

### SOCIAL-U0520
31. Unemployment Insurance

### SOCIAL-U0521
字段 | 定义

### SOCIAL-U0522
Replacement Rate | 真实比例、人数、金额或期限

### SOCIAL-U0523
Minimum Benefit | 真实比例、人数、金额或期限

### SOCIAL-U0524
Maximum Benefit | 真实比例、人数、金额或期限

### SOCIAL-U0525
Waiting Period | 真实比例、人数、金额或期限

### SOCIAL-U0526
Benefit Duration | 真实比例、人数、金额或期限

### SOCIAL-U0527
Eligible Unemployed | 真实比例、人数、金额或期限

### SOCIAL-U0528
Approved Recipients | 真实比例、人数、金额或期限

### SOCIAL-U0529
Paid Recipients | 真实比例、人数、金额或期限

### SOCIAL-U0530
Average Eligible Wage | 真实比例、人数、金额或期限

### SOCIAL-U0531
Average Benefit | 真实比例、人数、金额或期限

### SOCIAL-U0532
Programme Cost | 真实比例、人数、金额或期限

### SOCIAL-U0533
Benefit Exhaustions | 真实比例、人数、金额或期限

### SOCIAL-U0534
UI Cost / PaidRecipients × AverageEligibleWage × ReplacementRate，受 Minimum/Maximum Benefit 约束

### SOCIAL-U0535
32. Income / Food / Energy Support

### SOCIAL-U0536
Programme | 字段

### SOCIAL-U0537
Income Support | Income Eligibility Threshold; Benefit Amount; Eligible; Approved; Paid; Cost; Review Frequency

### SOCIAL-U0538
Food Support | Eligibility; Benefit per person/household; Recipients; Food Basket Cost; Basket Coverage; Cost; Frequency

### SOCIAL-U0539
Energy Support | Eligibility; Fixed Energy Credit; Recipients; Average Energy Cost; Coverage; Cost; Frequency

### SOCIAL-U0540
33. Pension & Family Support

### SOCIAL-U0541
Programme | 字段

### SOCIAL-U0542
Pension | Eligible Retirees; Recipients; Average Pension; Replacement Rate; Payment Frequency; Total Cost; Arrears; New Retirees

### SOCIAL-U0543
Family / Child Support | Eligibility; Child/Household Count; Benefit Amount; Frequency; Cost

### SOCIAL-U0544
Emergency Household Assistance | Eligibility Event; Target Group; Amount; Duration; Cost

### SOCIAL-U0545
Healthcare Cost Support | Eligibility; Covered Cost; Recipient Count; Cost

### SOCIAL-U0546
Pension Cost / PaidRetirees × AveragePension

### SOCIAL-U0547
34. Welfare Pipeline

### SOCIAL-U0548
状态 | 定义

### SOCIAL-U0549
Eligible | 满足制度条件

### SOCIAL-U0550
Applied | 已申请

### SOCIAL-U0551
Verified | 审核完成

### SOCIAL-U0552
Approved | 进入支付名单

### SOCIAL-U0553
Scheduled | 生成付款义务

### SOCIAL-U0554
Paid | 实际付款完成

### SOCIAL-U0555
Delayed | 到期未支付

### SOCIAL-U0556
Suspended | 暂停

### SOCIAL-U0557
Ended | 退出/到期

### SOCIAL-U0558
Coverage Rate / PaidRecipients / EligiblePopulation

### SOCIAL-U0559
Safety-net Coverage 不再是可调 slider。

### SOCIAL-U0560
35. Housing

### SOCIAL-U0561
字段 | 定义

### SOCIAL-U0562
Total Housing Units | 真实住房单位、家庭数、金额或派生缺口

### SOCIAL-U0563
Habitable Units | 真实住房单位、家庭数、金额或派生缺口

### SOCIAL-U0564
Occupied Units | 真实住房单位、家庭数、金额或派生缺口

### SOCIAL-U0565
Vacant Units | 真实住房单位、家庭数、金额或派生缺口

### SOCIAL-U0566
Households | 真实住房单位、家庭数、金额或派生缺口

### SOCIAL-U0567
Household Housing Demand | 真实住房单位、家庭数、金额或派生缺口

### SOCIAL-U0568
Housing Shortage | 真实住房单位、家庭数、金额或派生缺口

### SOCIAL-U0569
Average Rent | 真实住房单位、家庭数、金额或派生缺口

### SOCIAL-U0570
Average Housing Cost | 真实住房单位、家庭数、金额或派生缺口

### SOCIAL-U0571
Units Under Construction | 真实住房单位、家庭数、金额或派生缺口

### SOCIAL-U0572
Worker Housing Units | 真实住房单位、家庭数、金额或派生缺口

### SOCIAL-U0573
Emergency Housing Capacity | 真实住房单位、家庭数、金额或派生缺口

### SOCIAL-U0574
Housing Benefit Recipients | 真实住房单位、家庭数、金额或派生缺口

### SOCIAL-U0575
Housing Gap / HouseholdHousingDemand - HabitableAvailableUnits

### SOCIAL-U0576
36. Housing Programmes

### SOCIAL-U0577
Programme | 职责

### SOCIAL-U0578
Housing Benefit | 现金支持，不增加住房供给

### SOCIAL-U0579
Public Housing Request | Social 定义区域/单位/群体；Industry 建设；Finance 融资

### SOCIAL-U0580
Worker Housing Request | 服务产业/建设项目

### SOCIAL-U0581
Emergency Temporary Housing | 危机或大规模人员流入

### SOCIAL-U0582
Housing Relocation Support | 帮助劳动力从住房富余区迁往缺工区

### SOCIAL-U0583
37. Public Safety

### SOCIAL-U0584
边界 / Public Safety = Domestic Policing + Crime Response + Public Order + Civil Emergency Response。National Defence、外交安全与制裁不归 Social。

### SOCIAL-U0585
固定模块

### SOCIAL-U0586
Police

### SOCIAL-U0587
Crime Prevention

### SOCIAL-U0588
Investigation

### SOCIAL-U0589
Public Order

### SOCIAL-U0590
Emergency Civil Response

### SOCIAL-U0591
Community Safety

### SOCIAL-U0592
38. Police Workforce

### SOCIAL-U0593
Staff Type | Skill

### SOCIAL-U0594
Police Officers | MEDIUM / HIGH

### SOCIAL-U0595
Investigative Staff | MEDIUM / HIGH

### SOCIAL-U0596
Public Order Units | MEDIUM

### SOCIAL-U0597
Emergency Response Personnel | MEDIUM / HIGH

### SOCIAL-U0598
Community Safety Staff | MEDIUM

### SOCIAL-U0599
Administrative Support | LOW / MEDIUM

### SOCIAL-U0600
字段 | 定义

### SOCIAL-U0601
Required Personnel | 真实人数或金额

### SOCIAL-U0602
Employed Personnel | 真实人数或金额

### SOCIAL-U0603
Vacancies | 真实人数或金额

### SOCIAL-U0604
Personnel in Training | 真实人数或金额

### SOCIAL-U0605
Personnel Deployed | 真实人数或金额

### SOCIAL-U0606
Personnel Available | 真实人数或金额

### SOCIAL-U0607
Average Wage | 真实人数或金额

### SOCIAL-U0608
Training Capacity | 真实人数或金额

### SOCIAL-U0609
Attrition | 真实人数或金额

### SOCIAL-U0610
Regional Distribution | 真实人数或金额

### SOCIAL-U0611
39. Crime & Case Backlog

### SOCIAL-U0612
Category

### SOCIAL-U0613
Violent Crime

### SOCIAL-U0614
Property Crime

### SOCIAL-U0615
Economic / General Crime

### SOCIAL-U0616
Public Disorder

### SOCIAL-U0617
Critical Infrastructure Incident

### SOCIAL-U0618
字段 | 定义

### SOCIAL-U0619
Recorded Incidents | 真实事件数或模拟时间

### SOCIAL-U0620
New Incidents | 真实事件数或模拟时间

### SOCIAL-U0621
Resolved Cases | 真实事件数或模拟时间

### SOCIAL-U0622
Open Cases | 真实事件数或模拟时间

### SOCIAL-U0623
Case Backlog | 真实事件数或模拟时间

### SOCIAL-U0624
Average Response Time | 真实事件数或模拟时间

### SOCIAL-U0625
Average Investigation Time | 真实事件数或模拟时间

### SOCIAL-U0626
Repeat Incidents | 真实事件数或模拟时间

### SOCIAL-U0627
Regional Incident Count | 真实事件数或模拟时间

### SOCIAL-U0628
Crime Rate / RecordedCrime / Population × 100,000

### SOCIAL-U0629
Case Clearance Rate / ResolvedCases / CasesClosedOrDue

### SOCIAL-U0630
40. Protest & Public Order

### SOCIAL-U0631
字段 | 定义

### SOCIAL-U0632
Event ID | Protest Event 字段

### SOCIAL-U0633
Location | Protest Event 字段

### SOCIAL-U0634
Cause | Protest Event 字段

### SOCIAL-U0635
Participants | Protest Event 字段

### SOCIAL-U0636
Start Time | Protest Event 字段

### SOCIAL-U0637
Duration | Protest Event 字段

### SOCIAL-U0638
Public Order Personnel Required | Protest Event 字段

### SOCIAL-U0639
Personnel Deployed | Protest Event 字段

### SOCIAL-U0640
Emergency Medical Requirement | Protest Event 字段

### SOCIAL-U0641
Transport Disruption | Protest Event 字段

### SOCIAL-U0642
Escalation Status | Protest Event 字段

### SOCIAL-U0643
Resolution Status | Protest Event 字段

### SOCIAL-U0644
Social 动作

### SOCIAL-U0645
Normal Policing

### SOCIAL-U0646
Increased Public Order Deployment

### SOCIAL-U0647
Mediation / Negotiation Support

### SOCIAL-U0648
Emergency Crowd Management

### SOCIAL-U0649
Request National Emergency Support

### SOCIAL-U0650
警力部署真实占用 Personnel Available；重大紧急权力升级 Captain。

### SOCIAL-U0651
41. Civil Emergency Response

### SOCIAL-U0652
字段 | 定义

### SOCIAL-U0653
Emergency Type | 应急响应字段

### SOCIAL-U0654
Affected Population | 应急响应字段

### SOCIAL-U0655
Affected Region | 应急响应字段

### SOCIAL-U0656
Personnel Required | 应急响应字段

### SOCIAL-U0657
Medical Support Required | 应急响应字段

### SOCIAL-U0658
Temporary Housing Required | 应急响应字段

### SOCIAL-U0659
Food/Energy Support Required | 应急响应字段

### SOCIAL-U0660
Police/Public Order Requirement | 应急响应字段

### SOCIAL-U0661
Duration | 应急响应字段

### SOCIAL-U0662
Current Unmet Need | 应急响应字段

### SOCIAL-U0663
Finance Required | 应急响应字段

### SOCIAL-U0664
Captain Emergency Status | 应急响应字段

### SOCIAL-U0665
42. Distribution & Social Conditions

### SOCIAL-U0666
固定收入/人口组 | 定义

### SOCIAL-U0667
Low Income | 低收入家庭

### SOCIAL-U0668
Middle Income | 中等收入

### SOCIAL-U0669
High Income | 高收入

### SOCIAL-U0670
Unemployed | 失业人口

### SOCIAL-U0671
Retired | 退休人口

### SOCIAL-U0672
字段 | 定义

### SOCIAL-U0673
Population | 每组真实人数或金额

### SOCIAL-U0674
Employment | 每组真实人数或金额

### SOCIAL-U0675
Gross Income | 每组真实人数或金额

### SOCIAL-U0676
Direct Taxes | 每组真实人数或金额

### SOCIAL-U0677
Cash Transfers | 每组真实人数或金额

### SOCIAL-U0678
Disposable Income | 每组真实人数或金额

### SOCIAL-U0679
Food Cost | 每组真实人数或金额

### SOCIAL-U0680
Energy Cost | 每组真实人数或金额

### SOCIAL-U0681
Housing Cost | 每组真实人数或金额

### SOCIAL-U0682
Basic Consumption Cost | 每组真实人数或金额

### SOCIAL-U0683
Real Disposable Margin | 每组真实人数或金额

### SOCIAL-U0684
43. Poverty & Inequality

### SOCIAL-U0685
Poverty Threshold / Season 启动时统一配置为 Median Disposable Income 的既定比例

### SOCIAL-U0686
Poverty Population / Population with DisposableIncome < PovertyThreshold

### SOCIAL-U0687
Real Disposable Margin / DisposableIncome - EssentialLivingCost

### SOCIAL-U0688
Gini 为派生统计，不是可直接调整变量。

### SOCIAL-U0689
44. Social Stress & National Condition

### SOCIAL-U0690
派生压力 | 底层来源

### SOCIAL-U0691
Cost-of-Living Stress | EssentialLivingCost / DisposableIncome, Real Wage

### SOCIAL-U0692
Labour Stress | Unemployment, duration, skill mismatch

### SOCIAL-U0693
Housing Stress | HousingGap, Rent burden

### SOCIAL-U0694
Healthcare Stress | UnservedDemand, Waiting, Staff Shortage, Bed Occupancy

### SOCIAL-U0695
Education Stress | Seat/Teacher Shortage, Dropout

### SOCIAL-U0696
Public Safety Stress | Incidents, Response Time, Backlog, Staff Shortage

### SOCIAL-U0697
Welfare Delivery Stress | Eligible but unpaid, Payment Backlog

### SOCIAL-U0698
Migration Integration Load | Arrivals relative to Housing/Education/Healthcare/Labour absorption

### SOCIAL-U0699
这些压力可以进入 Vulnerable / Protest / Government Crisis 等国家状态，但不能作为玩家 slider。

### SOCIAL-U0700
45. Shared Permissions

### SOCIAL-U0701
Office | 共享事项 | 边界

### SOCIAL-U0702
Captain | 重大社会改革、教育医疗战略、公共秩序危机、大规模迁移 | Social 提供社会可行性；Captain 做国家级政治决定

### SOCIAL-U0703
Central Bank | 就业、住房金融成本、家庭债务 | CB 管金融；Social 管家庭/劳动力结果

### SOCIAL-U0704
Finance | 教育、医疗、福利、住房、培训、警务预算 | Social 决规则/对象/容量；Finance 决总资金

### SOCIAL-U0705
Trade | 国际人才、项目工人、学生培训、医疗紧急采购 | Social 定义需求与准入；Trade 负责对外谈判采购

### SOCIAL-U0706
Industry | 项目 Workforce、技能、学校医院住房设施需求 | Industry 产生项目需求；Social 负责人力和公共服务响应

### SOCIAL-U0707
46. Approval Matrix

### SOCIAL-U0708
事项 | 发起 | Required Approval

### SOCIAL-U0709
Minimum Wage | Social | Social; extreme reform → Captain review

### SOCIAL-U0710
Training within budget | Social | Social

### SOCIAL-U0711
Major Training | Social + Industry if sector-specific | Finance

### SOCIAL-U0712
Education Allocation | Social | Social within approved budget

### SOCIAL-U0713
Education Infrastructure | Social | Industry + Finance; Captain if strategic

### SOCIAL-U0714
Healthcare Operating Allocation | Social | Social within approved budget

### SOCIAL-U0715
Hospital/Clinic Expansion | Social | Industry + Finance; Captain if strategic

### SOCIAL-U0716
Emergency Medical Procurement | Social | Trade + Finance; CB if official reserves

### SOCIAL-U0717
Migration Policy | Social | Trade for bilateral sourcing; Captain if mass/strategic

### SOCIAL-U0718
International Talent | Social + Industry | Trade + Finance if funded

### SOCIAL-U0719
Major Welfare Expansion | Social | Finance; Captain if structural

### SOCIAL-U0720
Pension Reform | Social | Finance + Captain if structural

### SOCIAL-U0721
Public Housing | Social | Industry + Finance

### SOCIAL-U0722
Public Safety Deployment | Social | Social

### SOCIAL-U0723
National Public Order Emergency | Social request | Captain

### SOCIAL-U0724
47. Information Advantage

### SOCIAL-U0725
Social 专属详细信息

### SOCIAL-U0726
Population Structure

### SOCIAL-U0727
Labour Force Status

### SOCIAL-U0728
Employment by Sector/Skill/Location

### SOCIAL-U0729
Skill Gap

### SOCIAL-U0730
Wage Distribution

### SOCIAL-U0731
Training Pipeline

### SOCIAL-U0732
Education Seats/Teachers/Graduates

### SOCIAL-U0733
Healthcare Demand/Staff/Capacity/Waiting/Backlog

### SOCIAL-U0734
Migration Pipeline

### SOCIAL-U0735
Welfare Eligibility/Payment

### SOCIAL-U0736
Housing Demand/Shortage

### SOCIAL-U0737
Police Personnel/Incidents/Backlog

### SOCIAL-U0738
Poverty & Real Disposable Income

### SOCIAL-U0739
Future Workforce Forecast

### SOCIAL-U0740
Public Service Capacity

### SOCIAL-U0741
48. Notifications

### SOCIAL-U0742
Inbox Event Type

### SOCIAL-U0743
Labour Shortage

### SOCIAL-U0744
High-Skill Shortage

### SOCIAL-U0745
Vacancy Surge

### SOCIAL-U0746
Unemployment Surge

### SOCIAL-U0747
Mass Layoff

### SOCIAL-U0748
Project Workforce Request

### SOCIAL-U0749
Training Capacity Full

### SOCIAL-U0750
Training Completed

### SOCIAL-U0751
Education Seat Shortage

### SOCIAL-U0752
Teacher Shortage

### SOCIAL-U0753
Healthcare Staff Shortage

### SOCIAL-U0754
Hospital Capacity Critical

### SOCIAL-U0755
Healthcare Waiting Backlog

### SOCIAL-U0756
Emergency Medical Warning

### SOCIAL-U0757
Migration Cap Near Full

### SOCIAL-U0758
Migration Arrival Surge

### SOCIAL-U0759
Housing Warning

### SOCIAL-U0760
Welfare Budget Insufficient

### SOCIAL-U0761
Benefit Delay

### SOCIAL-U0762
Pension Warning

### SOCIAL-U0763
Food Cost Surge

### SOCIAL-U0764
Energy Cost Surge

### SOCIAL-U0765
Real Wage Decline

### SOCIAL-U0766
Poverty Increase

### SOCIAL-U0767
Police Shortage

### SOCIAL-U0768
Crime Surge

### SOCIAL-U0769
Case Backlog Critical

### SOCIAL-U0770
Public Disorder Event

### SOCIAL-U0771
Protest Escalation

### SOCIAL-U0772
Emergency Housing Required

### SOCIAL-U0773
Mass Migration Crisis

### SOCIAL-U0774
Public Service Overload

### SOCIAL-U0775
49. Score & Guardrails

### SOCIAL-U0776
维度 | 权重 | 方向

### SOCIAL-U0777
Employment | 15% | 就业、失业和长期失业

### SOCIAL-U0778
Workforce Match | 12% | Vacancy、Skill Gap、匹配

### SOCIAL-U0779
Real Income | 12% | Real Wage 与 Margin

### SOCIAL-U0780
Education & Human Capital | 12% | 覆盖、教师、毕业和技能供给

### SOCIAL-U0781
Healthcare Access | 12% | 覆盖、等待、未满足需求

### SOCIAL-U0782
Poverty & Protection | 12% | 贫困与按时支付

### SOCIAL-U0783
Housing Accessibility | 8% | Housing Gap 与负担

### SOCIAL-U0784
Public Safety | 8% | 响应、积压、警力

### SOCIAL-U0785
Migration & Integration | 5% | 劳动力贡献与承载

### SOCIAL-U0786
Inequality | 4% | 收入分配

### SOCIAL-U0787
49.1 National Guardrails

### SOCIAL-U0788
不得靠无法支付的福利承诺刷分

### SOCIAL-U0789
不得靠压工资换取就业而恶化贫困

### SOCIAL-U0790
不得靠高移民填岗位却无视住房教育医疗承载

### SOCIAL-U0791
不得砍教育医疗换短期财政改善

### SOCIAL-U0792
不得无限部署警力造成其他地区治安崩溃

### SOCIAL-U0793
培训按结业和就业结果而非投入计分

### SOCIAL-U0794
住房补贴不能被视为增加供给

### SOCIAL-U0795
50. Data Entities

### SOCIAL-U0796
实体 | 核心字段

### SOCIAL-U0797
population_state | children, working_age, retired, households, births, deaths, immigration, emigration

### SOCIAL-U0798
labour_force_state | skill, status, location, count

### SOCIAL-U0799
sector_labour | sector, skill, required, employed, vacancies, wage, location

### SOCIAL-U0800
training_programme | target_sector, starting_skill, target_skill, seats, enrolled, duration, cost, status

### SOCIAL-U0801
education_capacity | level, specialisation, seats, enrolled, teachers_required, teachers_employed, duration

### SOCIAL-U0802
education_cohort | programme, intake, start, completion, dropout, graduates

### SOCIAL-U0803
healthcare_demand | care_type, required_episodes, delivered_episodes, backlog

### SOCIAL-U0804
healthcare_workforce | staff_type, required, employed, vacancies, training_pipeline, wage

### SOCIAL-U0805
healthcare_capacity | facility_type, beds_or_visits, available, occupied, location

### SOCIAL-U0806
migration_policy | type, cap, skill, sector, duration, rights

### SOCIAL-U0807
social_programme | type, eligibility, benefit, frequency, duration, budget, status

### SOCIAL-U0808
social_programme_pipeline | eligible, applied, verified, approved, scheduled, paid, delayed

### SOCIAL-U0809
housing_state | units, habitable, occupied, vacant, households, shortage, rent

### SOCIAL-U0810
public_safety_workforce | staff_type, required, employed, deployed, available, wage

### SOCIAL-U0811
public_safety_incident | category, location, opened_at, required_staff, status, response_time

### SOCIAL-U0812
protest_event | location, cause, participants, staff_required, staff_deployed, status

### SOCIAL-U0813
income_group_state | group, population, gross_income, taxes, transfers, essential_costs

### SOCIAL-U0814
workforce_forecast | horizon, skill, current_supply, projected_supply, projected_demand, gap

### SOCIAL-U0815
51. Calculation Rules

### SOCIAL-U0816
计算 | 规则

### SOCIAL-U0817
Population | Previous + Births - Deaths + Immigration - Emigration

### SOCIAL-U0818
Labour Force | Employed + UnemployedSearching

### SOCIAL-U0819
LFPR | LabourForce / WorkingAgePopulation

### SOCIAL-U0820
Unemployment Rate | Unemployed / LabourForce

### SOCIAL-U0821
Skill Gap | Demand - Available

### SOCIAL-U0822
Vacancies | Required - Employed

### SOCIAL-U0823
Real Wage | NominalWage / CostOfLivingIndex

### SOCIAL-U0824
Disposable Income | GrossIncome - Taxes + Transfers

### SOCIAL-U0825
Real Margin | DisposableIncome - EssentialLivingCost

### SOCIAL-U0826
Education Enrollment | min(Applicants, Seats, TeacherCapacity, BudgetCapacity)

### SOCIAL-U0827
Education Graduates | Enrolled × (1-Dropout) × Completion

### SOCIAL-U0828
Healthcare Delivered | min(Demand, StaffCapacity, FacilityCapacity, SupplyCapacity, BudgetCapacity)

### SOCIAL-U0829
Healthcare Backlog | PriorBacklog + NewDemand - DeliveredCare

### SOCIAL-U0830
Welfare Coverage | PaidRecipients / EligiblePopulation

### SOCIAL-U0831
Housing Gap | HousingDemand - HabitableAvailableUnits

### SOCIAL-U0832
Crime Rate | RecordedCrime / Population × 100,000

### SOCIAL-U0833
Police Available | Employed - Deployed - Unavailable

### SOCIAL-U0834
Dependency Ratio | (Children + Retired) / WorkingAge

### SOCIAL-U0835
52. Front-end Operations

### SOCIAL-U0836
页面 | 全部操作

### SOCIAL-U0837
Labour | Set Minimum Wage; Create Employment/Relocation/Return-to-Work programmes

### SOCIAL-U0838
Training | Create; submit budget; start; pause intake; close; view placement

### SOCIAL-U0839
Education | Allocate budget; change seats within capacity; create strategic programme; submit infrastructure request

### SOCIAL-U0840
Healthcare | Allocate operating budget; create workforce programme; submit capacity expansion; activate emergency response

### SOCIAL-U0841
Migration | Set category caps/rules; open/close intake; process programme-level status

### SOCIAL-U0842
Talent Exchange | Create need; submit to Trade; allocate arrivals

### SOCIAL-U0843
Social Protection | Create/modify eligibility, benefit, duration within approvals

### SOCIAL-U0844
Housing | Set benefit; create Public/Worker/Emergency Housing Request

### SOCIAL-U0845
Public Safety | Allocate personnel; create deployments; reallocate regions; initiate training

### SOCIAL-U0846
Protest/Public Order | Deploy; mediation; emergency request

### SOCIAL-U0847
Civil Emergency | Create response plan; request Finance/Captain resources

### SOCIAL-U0848
Distribution | View income groups, poverty, real margin and target support

### SOCIAL-U0849
Inbox | Open alert and navigate to affected object

### SOCIAL-U0850
53. Audit Ledger

### SOCIAL-U0851
Audit Event Type

### SOCIAL-U0852
MinimumWageChanged

### SOCIAL-U0853
TrainingProgrammeCreated

### SOCIAL-U0854
TrainingProgrammeStarted

### SOCIAL-U0855
TrainingCompleted

### SOCIAL-U0856
EducationAllocationChanged

### SOCIAL-U0857
EducationProgrammeCreated

### SOCIAL-U0858
EducationInfrastructureRequested

### SOCIAL-U0859
TeacherProgrammeCreated

### SOCIAL-U0860
HealthcareAllocationChanged

### SOCIAL-U0861
HealthcareProgrammeCreated

### SOCIAL-U0862
HealthcareCapacityRequested

### SOCIAL-U0863
HealthcareEmergencyActivated

### SOCIAL-U0864
MigrationPolicyCreated

### SOCIAL-U0865
MigrationPolicyChanged

### SOCIAL-U0866
MigrationCapReached

### SOCIAL-U0867
TalentExchangeRequested

### SOCIAL-U0868
MigrantArrivalsRecorded

### SOCIAL-U0869
BenefitRuleChanged

### SOCIAL-U0870
BenefitPaymentScheduled

### SOCIAL-U0871
BenefitPaymentPaid

### SOCIAL-U0872
BenefitPaymentDelayed

### SOCIAL-U0873
PensionRuleChanged

### SOCIAL-U0874
HousingBenefitChanged

### SOCIAL-U0875
HousingRequestCreated

### SOCIAL-U0876
PoliceDeploymentCreated

### SOCIAL-U0877
PoliceReallocated

### SOCIAL-U0878
PublicOrderEventOpened

### SOCIAL-U0879
EmergencySupportRequested

### SOCIAL-U0880
WorkforceRequestReceived

### SOCIAL-U0881
LabourShortageDetected

### SOCIAL-U0882
HealthcareBacklogCritical

### SOCIAL-U0883
EducationCapacityCritical

### SOCIAL-U0884
PublicSafetyBacklogCritical

### SOCIAL-U0885
每个 Event 记录 event_id、simulation_id、country_id、actor_user_id、actor_office、object_id、object_version、timestamp、before_state_hash、after_state_hash、structured_payload。

### SOCIAL-U0886
54. Migration from Old World Simulation

### SOCIAL-U0887
旧机制 | Season 1

### SOCIAL-U0888
Minimum Wage 20%-100% median | 改为 LC/hour 或 LC/year；比例派生

### SOCIAL-U0889
Unemployment Benefit Replacement Rate | 保留并加入真实 recipients/cost

### SOCIAL-U0890
Benefit Duration | 保留为模拟期限

### SOCIAL-U0891
Welfare Spending %GDP | 删除 slider，拆具体 Programme

### SOCIAL-U0892
Food/Energy Voucher coverage % | 删除 slider，改 Eligibility/Recipients/Benefit

### SOCIAL-U0893
Housing Subsidy %GDP | 删除，改 Housing Benefit + Supply Request

### SOCIAL-U0894
Labour Training %GDP | 删除，改 Training Programme

### SOCIAL-U0895
Pension Replacement Rate | 保留并加入人数/金额/arrears

### SOCIAL-U0896
Safety-net Coverage % | 删除控制器，Coverage 派生

### SOCIAL-U0897
Immigration Quota %population | 删除，改类别×人数×技能×权利

### SOCIAL-U0898
Public Service Budget 教育医疗 | 保留财政来源，教育医疗运营与容量归 Social

### SOCIAL-U0899
Protest / Government Crisis | 保留国家状态，底层接入 Social 真实数据

### SOCIAL-U0900
55. Engineering Acceptance Checklist

### SOCIAL-U0901
□ 人口恒等式正确，迁入迁出改变 Population 与 Labour

### SOCIAL-U0902
□ Labour Force 状态不混淆

### SOCIAL-U0903
□ Employment 按 Sector×Skill×Location

### SOCIAL-U0904
□ 项目和公共服务都产生真实 Labour Demand

### SOCIAL-U0905
□ Training 有 Seats/Duration/Graduates/Placement

### SOCIAL-U0906
□ Education 三层与 Specialisation 可计算

### SOCIAL-U0907
□ 教师不足限制 Enrollment

### SOCIAL-U0908
□ Healthcare 有 Demand/Staff/Capacity/Waiting/Backlog

### SOCIAL-U0909
□ 医疗不足形成 Unserved Demand

### SOCIAL-U0910
□ 医院扩容必须跨 Office

### SOCIAL-U0911
□ Migration 按类别记录 Cap→Arrived

### SOCIAL-U0912
□ Talent Exchange 跨 Social+Industry+Trade

### SOCIAL-U0913
□ Welfare Coverage 只能派生

### SOCIAL-U0914
□ 福利生成真实 Payment

### SOCIAL-U0915
□ Housing Gap 由 Units 与 Demand

### SOCIAL-U0916
□ 住房补贴不增加供给

### SOCIAL-U0917
□ 警力为真实 Personnel

### SOCIAL-U0918
□ 部署警力减少 Available Personnel

### SOCIAL-U0919
□ Protest 有参与人数/警力需求/状态

### SOCIAL-U0920
□ Minimum Wage 为真实货币

### SOCIAL-U0921
□ Real Wage/Poverty/Gini 派生

### SOCIAL-U0922
□ Cost of Living 连接食品能源住房价格

### SOCIAL-U0923
□ Social 无法越权税收、发债、关税、利率、生产、技术和外储

### SOCIAL-U0924
□ Required Approval 自动生成

### SOCIAL-U0925
□ 所有操作写 Audit

### SOCIAL-U0926
□ 70 国 Talent/Migration 可按国家筛选

### SOCIAL-U0927
□ 旧版功能有迁移路径

### SOCIAL-U0928
□ Healthcare/Education/Public Safety 有独立 Dashboard 和接口

### SOCIAL-U0929
Appendix A. Full Action Space

### SOCIAL-U0930
模块 | 动作 | 权限 | 输入

### SOCIAL-U0931
Labour | Set National Minimum Wage | Social | LC/hour, Effective Date

### SOCIAL-U0932
Labour | Create Employment Service | Social | Capacity, Budget, Target

### SOCIAL-U0933
Labour | Create Relocation Support | Social | Location, Participants, Benefit

### SOCIAL-U0934
Labour | Create Return-to-Work | Social | Eligible, Capacity, Duration

### SOCIAL-U0935
Training | Create Training Programme | Social | Skill, Sector, Seats, Duration, Cost

### SOCIAL-U0936
Education | Allocate Approved Budget | Social | Level/Specialisation

### SOCIAL-U0937
Education | Create Strategic Programme | Social | Specialisation, Seats, Duration, Budget

### SOCIAL-U0938
Education | Request Infrastructure | Social+Industry+Finance | Seats, Location, Deadline

### SOCIAL-U0939
Education | Create Teacher Programme | Social | Level, Seats, Duration, Cost

### SOCIAL-U0940
Healthcare | Allocate Approved Budget | Social | Primary/Hospital/Emergency/Public Health

### SOCIAL-U0941
Healthcare | Create Workforce Programme | Social+Finance | Staff, Seats, Duration, Cost

### SOCIAL-U0942
Healthcare | Request Hospital Expansion | Social+Industry+Finance | Beds/Visits, Location, Deadline

### SOCIAL-U0943
Healthcare | Request Medicine Procurement | Social+Trade+Finance | Quantity, Date

### SOCIAL-U0944
Healthcare | Activate Emergency Response | Social; Captain if national | Capacity, Staff, Region

### SOCIAL-U0945
Migration | Set General/Skilled/High-Skill Cap | Social | Cap, Skill, Sector, Rights

### SOCIAL-U0946
Migration | Set Temporary Project Workers | Social+Industry+Trade | Project, Count, Skill, Duration

### SOCIAL-U0947
Migration | Create Talent Exchange Need | Social+Industry+Trade | Partner, Talent, Count, Duration

### SOCIAL-U0948
Welfare | Set Unemployment Insurance | Social; Finance if expansion | Replacement, Duration, Min/Max

### SOCIAL-U0949
Welfare | Set Income/Food/Energy Support | Social+Finance if expansion | Eligibility, Amount, Frequency

### SOCIAL-U0950
Welfare | Set Pension | Social+Finance; Captain if structural | Eligibility, Pension, Frequency

### SOCIAL-U0951
Welfare | Set Family/Emergency Assistance | Social+Finance | Eligibility, Amount, Duration

### SOCIAL-U0952
Housing | Set Housing Benefit | Social+Finance if expansion | Eligibility, Amount

### SOCIAL-U0953
Housing | Request Public Housing | Social+Industry+Finance | Units, Location, Group

### SOCIAL-U0954
Housing | Request Worker Housing | Social+Industry+Finance | Project, Units, Location

### SOCIAL-U0955
Housing | Activate Emergency Housing | Social+Finance | Capacity, Region, Duration

### SOCIAL-U0956
Public Safety | Allocate Police Personnel | Social | Region, Staff, Count

### SOCIAL-U0957
Public Safety | Create Public Order Deployment | Social | Event, Personnel, Duration

### SOCIAL-U0958
Public Safety | Create Police Training | Social+Finance | Seats, Skill, Duration

### SOCIAL-U0959
Public Safety | Request Police Infrastructure | Social+Industry+Finance | Facility, Capacity, Location

### SOCIAL-U0960
Public Safety | Request National Emergency | Social+Captain | Event, Powers, Duration

### SOCIAL-U0961
Social Conditions | Create Cost-of-Living Package | Social+Finance; Captain if major | Group, Components, Duration

### SOCIAL-U0962
Appendix B. Programme Catalogue

### SOCIAL-U0963
固定 Programme / Policy Type

### SOCIAL-U0964
Public Employment Service

### SOCIAL-U0965
Relocation Support

### SOCIAL-U0966
Return-to-Work

### SOCIAL-U0967
Childcare Support

### SOCIAL-U0968
Retirement Retention

### SOCIAL-U0969
Low-to-Medium Training

### SOCIAL-U0970
Medium-to-High Training

### SOCIAL-U0971
Sector Reskilling

### SOCIAL-U0972
Teacher Training

### SOCIAL-U0973
Healthcare Workforce Training

### SOCIAL-U0974
Basic Education Capacity

### SOCIAL-U0975
Vocational Education

### SOCIAL-U0976
Higher Education

### SOCIAL-U0977
Scholarship

### SOCIAL-U0978
Strategic Engineering

### SOCIAL-U0979
Semiconductor Talent

### SOCIAL-U0980
Energy & Resources Education

### SOCIAL-U0981
Healthcare Education

### SOCIAL-U0982
Adult Education

### SOCIAL-U0983
General Labour Migration

### SOCIAL-U0984
Skilled Migration

### SOCIAL-U0985
High-Skill Migration

### SOCIAL-U0986
Temporary Project Worker

### SOCIAL-U0987
Student/Training Migration

### SOCIAL-U0988
Humanitarian Migration

### SOCIAL-U0989
Technical Talent Exchange

### SOCIAL-U0990
Unemployment Insurance

### SOCIAL-U0991
Income Support

### SOCIAL-U0992
Food Support

### SOCIAL-U0993
Energy Support

### SOCIAL-U0994
Pension

### SOCIAL-U0995
Housing Benefit

### SOCIAL-U0996
Family/Child Support

### SOCIAL-U0997
Emergency Household Assistance

### SOCIAL-U0998
Healthcare Cost Support

### SOCIAL-U0999
Public Housing Request

### SOCIAL-U1000
Worker Housing Request

### SOCIAL-U1001
Emergency Housing

### SOCIAL-U1002
Primary Care Expansion

### SOCIAL-U1003
Hospital Capacity Request

### SOCIAL-U1004
Emergency Health Response

### SOCIAL-U1005
Public Health Campaign

### SOCIAL-U1006
Police Recruitment

### SOCIAL-U1007
Police Training

### SOCIAL-U1008
Public Order Deployment

### SOCIAL-U1009
Community Safety

### SOCIAL-U1010
Civil Emergency Response

### SOCIAL-U1011
Appendix C. Cross-office Approvals

### SOCIAL-U1012
事项 | 主流程 | Additional Approval

### SOCIAL-U1013
Project Workforce | Industry → Social | Finance if funded training/housing

### SOCIAL-U1014
Education Infrastructure | Social → Industry → Finance | Captain if strategic/large

### SOCIAL-U1015
Healthcare Infrastructure | Social → Industry → Finance | Captain if strategic/large

### SOCIAL-U1016
Medical Imports | Social → Trade → Finance | CB if official reserves

### SOCIAL-U1017
International Talent | Social+Industry → Trade | Finance if public funding

### SOCIAL-U1018
Temporary Project Workers | Industry+Social | Trade for bilateral sourcing

### SOCIAL-U1019
Major Welfare | Social | Finance; Captain if structural

### SOCIAL-U1020
Pension Reform | Social | Finance + Captain if structural

### SOCIAL-U1021
Public Housing | Social | Industry + Finance

### SOCIAL-U1022
Mass Migration Crisis | Social | Trade + Finance + Captain

### SOCIAL-U1023
National Public Order Emergency | Social | Captain

### SOCIAL-U1024
Employment Tax Credit | Social defines target | Finance owns tax credit

### SOCIAL-U1025
Carbon Compensation | Social | Finance + Industry

### SOCIAL-U1026
Healthcare Emergency Fiscal Package | Social | Finance + Captain if major

### SOCIAL-U1027
Appendix D. Field Dictionary

### SOCIAL-U1028
字段组 | 核心字段

### SOCIAL-U1029
Population | Total, Children, WorkingAge, Retired, Households, LabourForce, Employment, Students, Migration

### SOCIAL-U1030
Labour | Sector, Skill, Location, Required, Employed, Vacancies, Wage, Hires, Layoffs

### SOCIAL-U1031
Training | Programme, Skills, Sector, Seats, Enrolled, Duration, Cost, Graduates, Placement

### SOCIAL-U1032
Education | Level, Specialisation, Seats, Enrollment, Teachers, Duration, Graduates, Dropout

### SOCIAL-U1033
Healthcare | CareType, RequiredEpisodes, Delivered, Backlog, Staff, Beds, Visits, Waiting, Coverage, Supplies

### SOCIAL-U1034
Migration | Type, Cap, Applications, Approved, Arrived, Active, Skill, Sector, Duration, Rights

### SOCIAL-U1035
Welfare | Type, Eligibility, Eligible, Applied, Approved, Paid, Benefit, Budget, Backlog

### SOCIAL-U1036
Housing | Units, Habitable, Occupied, Vacant, Demand, Shortage, Rent, Benefits, Construction

### SOCIAL-U1037
Public Safety | Staff, Required, Employed, Deployed, Available, Incidents, ResponseTime, Backlog, Region

### SOCIAL-U1038
Distribution | Group, Population, GrossIncome, Taxes, Transfers, DisposableIncome, EssentialCosts, RealMargin

### SOCIAL-U1039
最终实现原则 / 第六 Office 的可玩性来自“有限人口、人力资本和公共服务容量之间的真实取舍”。教育、医疗、治安、住房、福利和产业劳动力共享同一人口与技能池；任何扩张都会占用真实人员、预算、设施与时间。不存在 Education +10、Healthcare +20、Public Safety 80 这类独立程度按钮。
