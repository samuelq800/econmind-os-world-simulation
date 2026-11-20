# 十个未绑定字段的有界核对（2026-11-13）

只读；读取实际 `requirements/source_units.jsonl`、对应原文 `specs/extracted/{SOCIAL,INDUSTRY}.md`、catalog 字段及现有 Core/Worker/API 契约。没有运行测试或修改产品。

结论：**这四组动作都不能直接套用现有 payload、仅改 UI 就声称完成。** 两个 Industry 设施选择器可复用现有真实参数页，但它们所属的新动作尚无完整命令。最适合下一批代码实现的是有限首日设施的 utilisation target：有现成数学和源容量，缺正式目标意图/持久化接线；它不是需要用户重新决定百分比公式的外部阻断。

| catalog 字段     | 原文含义/实际输入                                             | 现有最接近数据或命令                                                                                                            | 精确缺口与可做范围                                                                                                                                                                                                                                                 |
| ---------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| social-u0933-0   | U0933 Create Relocation Support：Location；catalog 为地区选择 | Social PLAN 的 `locationId`、CREATE `target.locationId` 仅指同一就业服务池/岗位区域                                             | 不能把目标地区换成任意地区就当迁移。需要受控来源/目的地区、实际参与者群组及合法迁移状态连接。现有同地就业匹配不执行迁移。                                                                                                                                          |
| social-u0933-1   | Participants；人数                                            | PLAN `requestedMatches` 是匹配人数；CREATE `capacity.amount` 是柜台容量                                                         | 二者都不是迁移参与人口。缺参与人群登记、来源人数扣减/目的归属和不重复选择。可先做明确选择/验证契约，但不能创建经济成功。                                                                                                                                           |
| social-u0933-2   | Benefit；人均补助                                             | CREATE `budget` 有实际零新增费用 licence 限制；Finance预算不是付款事实                                                          | 不可把人数×补助塞入零费 CREATE。缺对应获益家庭/资金账户、批准预算及到期/到达支付条件的命令与原子账本连接。catalog 的 `LNY/人` 和默认500属于展示示例，不是70国币种/正式补助。须从实际LC及批准政策读取，不默认采用示例。                                             |
| social-u0934-0   | U0934 Create Return-to-Work：Eligible；资格条件               | `LabourPopulationAvailability`、既有 Social 求职者/职位资格事实                                                                 | 原文 U0275 明确是长期非就业人口重返 Labour Force，非现成失业者普通匹配。没有 Return-to-Work canonical intent/资格政策解释器。缺长期非就业定义、受控资格证据和劳动力参与转换权。                                                                                    |
| social-u0934-1   | Capacity；计划人数                                            | CREATE `capacity` 仅分割既有转介柜台；PLAN 限已在劳动力内求职者                                                                 | 不能用柜台分割冒充新增劳动参与。需项目容量登记与真实人员范围约束，并由合法参与状态转换产生人数，不能凭计划数增劳动力。                                                                                                                                             |
| social-u0934-2   | Duration；模拟日期限                                          | PLAN `dueDayIndex` 是一次匹配到期日                                                                                             | 缺项目起止/期限、参与/退出/完成状态和实际成本/服务需求契约。catalog 默认30天不是已批准政策。                                                                                                                                                                       |
| industry-u0283-0 | U0283 Set Utilisation Target：Facility/Sector                 | `IndustryRunParameterRow.facilityId`，现有受限 `read_postwar_industry_run_parameters_page`                                      | 可复用真实设施选项；当前只覆盖已批准有限设施，不扩大到sector/所有工厂。独立字段可接真实候选，但整组尚未有持久目标操作。                                                                                                                                            |
| industry-u0283-1 | 0–100%现实利用率目标                                          | Core `ProductionOutcomeInput.targetUtilisation` / `V13ProductionCapacity.targetUtilisation`；RUN terms只有quantity/time/expense | 现有 production intent只有facilityId/runId，RUN没有利用率字段；reader也未暴露capacityPerSimDay。缺目标payload/事件/回放和受限源容量读出，不缺基本公式。可按已有公式实现限定设施/期间目标，在服务端验证并保持实际工作/资金/能源约束；不能把UI百分比直接当实际产出。 |
| industry-u0284-0 | U0284 Prioritise Critical Facility：指定设施                  | 同上真实facilityId；既有各设施run/work/source                                                                                   | 可复用设施选择，不可用catalog类型列表默认“油田开发”。缺优先级变更命令及对真实分配器的生效连接。                                                                                                                                                                    |
| industry-u0284-1 | 改变有限维护/能源/投入分配顺序；catalog多选三类               | 现有 utility 的 `PUBLIC_PRIORITY` 是保留公共容量，不是手动工业排序命令                                                          | 缺受权优先序、竞争集合/期间、同优先序处理、对已有预留的处理契约与对应受控事件。不能重排已承诺权利或改公共/生态优先。若既有总分配规则未定义这些语义，需明确业务选择；仅UI多选不会产生真实调度。                                                                     |

## 精确代码依据

- `packages/core/src/commands/social-employment-service.ts:118` PLAN intent；`:300` CREATE parser严格限 `schemaVersion/programmeId/capacity/budget/target`；没有 relocation 或 return-to-work 字段。更换名字不能复用出另一种经济效果。
- `packages/core/src/labour/labour-engine.ts:1310` 明确 `applyLabourFacts` 不自行推导 participation、matching、wages、population timing 或付款。已有 migration labour entry fact 不是 Social 迁移项目的发行权。
- `packages/core/src/industry/industry-first-day-work.ts:45` RUN terms仅 quantity、窗口和maximumExpense等；`:83` 真实source已有 `capacityPerSimDay`；`:425` 既有上界是 `quantity * 86400000 <= capacityPerSimDay * (ends-starts)`。
- `packages/core/src/engine-kernels/resources-energy-production.ts:464` 起现成 `targetUtilisation` 乘数及有限投入/能源/劳力/物流瓶颈；`energy-production-foundation.ts:391` 为受来源保护的capacity fact。
- `packages/core/src/read-models/postwar-industry-run-parameters-contract.ts` 严格浏览器契约目前**没有** capacityPerSimDay / targetUtilisation。`apps/world-worker/src/persistence/postwar-industry-run-parameters-read.ts` 经同事务席位、原件hash及分页读取真实source，因此应通过该层新增版本化字段，不让前端直接读取原始seed。

## 给总控的最小实现建议

优先安排 **限定已有首日设施的 utilisation target**，不扩大设施/技术/权限。两种界限必须讲清：

1. 仅做“百分比→本次RUN数量”的显式辅助计算，可依现有 `capacityPerSimDay × (ends-starts)/86400000 × pct/100`，展示精确数量后仍由用户提交既有RUN，服务端保持原上界检查。这不新增经济规则，但只闭合一个运行计划输入方式，**不是持久 Utilisation Target 的完整U0283**；0%必须显示不安排运行，不能造正数命令。适用时避免未约定精度自动舍入。
2. 若目标是完整 U0283，则实现小型正式目标命令/事件/回放及受限参数API版本扩展，再让既有run准备显式读取目标。保持目标与实际产出区分、历史可重放、资金/工时/容量不变。已有原文和数学足以支持实现；只有持续有效期/覆盖已有计划等超出当前有限窗口的语义才应另列具体决定。

Social 两组与 Industry critical priority 需要新的真实业务命令链，不能归为“Node服务器没来所以接不了”，也不能直接当作获批就业柜台/有限首日RUN的别名。可继续实现严格DTO、验证、未配置拒绝和来源接口；需采纳的是尚未决定的具体资格/支付/竞争规则，不是再问用户是否允许编程。
