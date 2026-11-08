# Social-10：三项创建动作的最小实施边界

状态：**未接通创建，0/9 输入闭环**。本次只核对来源，不新增命令、表单、DRAFT 业务状态、registry 或永远返回 503 的产品入口；不把 PLAN 预留名额算作创建。

审查基线为 next `f89465422f7db1e04d78f44b79587abaa528acb3`。未采用独立自动物流草稿 `a1634c72`，没有运行 DB、Node、Clock 或修改 shared dist。

## 原规范与九个字段

原件是 [Social Minister specification](../../specs/original/EconMind_Season1_Labour_Education_Social_Development_Minister_Function_Specification.docx)。可检索引用均为 [SOCIAL.md](../../specs/extracted/SOCIAL.md) 的原 source-unit ID。

| 创建动作 / 原文          | 字段与量纲                                                 | 已存在的真实来源或规则                                                                                | 还缺什么；不能从输入推导什么                                                                                     |
| ------------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| U0932 Employment Service | Capacity：person；必须绑定服务窗口                         | E03 服务池的 `capacitySlots/usedSlots/reservedSlots`、`dayIndex`，以及实际岗位与专属人员工时          | 新 programme 对底层容量的唯一分配/使用绑定。创建不能增加底层名额，不能在旧池之外重复占用同一人员时间。           |
| U0932                    | Budget：本国 LC 金额；期间来自批准预算                     | 已有 Finance 预算审批、用途、期间、当前余额和保留额机制                                               | 具体 programme 的合法预算绑定或受控服务采购合同。TGA 可用余额、其他部门 cap、教育/医疗预算均不等于就业服务拨款。 |
| U0932                    | Target：目标群体，不是任意人数或“全部就业”效果             | 当前 E03 的 country/location/skill/status、岗位空缺与真实工资 offer；U0273/U0279 已定义转介与匹配用途 | 将真实群体变成授权可选 target、将创建对象与其绑定的工程接线。旧 UI 三个样例选项不是已采纳的政策。                |
| U0933 Relocation Support | Location：目的地标识，无金额量纲                           | 已有规范化地区映射与当前人口地点                                                                      | programme、实际人员来源地和目的地的绑定；不能因选择目的地就改写人口、住房占用或工作地点。                        |
| U0933                    | Participants：person，需去重后的实际名单/群体范围          | 已有人口群体、人员 ordinal/range 和劳动力状态；U0549–U0554 的申请→核验→批准→付款管线                  | 本 programme 的真实参与申请、资格核验和批准名单。一般人口名册只是候选来源，不是迁移或领取补助资格。              |
| U0933                    | Benefit：本国 LC/person                                    | `Money` 的精确金额/币种，已有财务记账与预算守恒机制；U0511–U0517                                      | 付款频率、有效期限、资金用途和收款人账户绑定；不得把 `participants × benefit` 默认为每天付款或已经支付。         |
| U0934 Return-to-Work     | Eligible：资格规则/经核验群体；合格人数的派生单位为 person | 当前 E03 的 `NOT_IN_LABOUR_FORCE` 等人数和 E01 工作年龄范围；U0275 明确“长期非就业”                   | “长期”的判定及原始资格记录。当前状态不含非就业持续时长，不能把所有未就业或全部非劳动力人口直接标为 eligible。    |
| U0934                    | Capacity：person；是 programme 上限，不能当实际完成数      | 可复用现有人员/设施时间约束和 Social 资源保护机制                                                     | 返岗服务的实际提供者、资格、资源/工时配方与用途许可。现有转介 desk 的有限许可不自动覆盖新增返岗服务。            |
| U0934                    | Duration：sim-day；不得替换为现实日                        | 现有 SimTime/有效期和 World 时钟体系；原规范明确这是模拟期限                                          | programme 有效窗口与实际参与/完成记录的绑定。经过 Duration 不等于完成服务，更不等于获得职位。                    |

上述量纲来自原动作表及现 catalog，不能据此添加默认金额、时长、参与比例或新补贴。U0934 的 `Eligible` 原表未规定资格表达式，U0506（规则）与 U0507（合格人口）须分开，不采用旧表单的虚构条件。

## 可以复用，不再要求用户重定义的部分

- **已有首日转介来源**：[postwar-social-employment-state.ts](../../apps/world-worker/src/preparation/postwar-social-employment-state.ts) 的 `POSTWAR_SOCIAL_EMPLOYMENT_POLICY` 与 `npcUsageLicenses`，由真实既有 OP 岗位、人群范围及原工资关系生成。许可是一个初始模拟日内的公共转介、无额外费用，不是新购买服务、转移雇佣或长期免费供给。后续新采购已有明确条件 `NEW_PUBLIC_PURCHASE_REQUIRES_SEPARATE_LAWFUL_FUNDED_CONTRACT`。
- **已有当前匹配**：[social-employment-service.ts](../../packages/core/src/commands/social-employment-service.ts) 的 `prepareSocialEmploymentServiceOperation` 只接受已存在的岗位和池；PLAN 预留，MATCH 才按真实失业池、空缺、技能、地点、offer/最低工资及物理约束执行。`servicePools.map(...)` 不创建新池。此入口可以继续使用，不能重命名成 Create。
- **已有预算审批机制**：[finance-budget-appropriation.ts](../../packages/core/src/commands/finance-budget-appropriation.ts) 有合法 scope/期间/approval 的检查；真实 native 路径为 [finance-budget-native.ts](../../packages/core/src/commands/finance-budget-native.ts) 的 `evaluateFinanceNativeBudgetSource`。前者的 inert proposal 本身不是支出权限。U0704 已规定 Finance 决总资金、Social 决规则/对象/容量；不需另创审批制度，也不能拿 requesting/programme owner 为 Finance 的额度直接授予 Social。
- **已有 Social 资源/预算约束**：[social-office-actions.ts](../../packages/core/src/commands/social-office-actions.ts) 的 `approvedBudgets`、`budgetCommitments`、资源窗口及 `prepareSocialOfficeOperation` 可复用。它们需要实际预算原件、成本规则和合法来源；不是把现教育/医疗配方复制成新 programme。
- **已有人员基线**：同一 E01/E03 的 `populationPositionRefs`、cohort/ordinal、工作年龄范围和 [Labour engine](../../packages/core/src/labour/labour-engine.ts) 的状态。它们可做名单去重、人数守恒和当前状态校验，但没有 programme 申请/批准或长期非就业历史。

当前没有发现可以直接消费的三项 programme 已批准拨款、迁移批准名单、返岗资格/完成原件。已暴露的 Social `positions/service-pools/offers/minimum-wage` 是上下文，不是这些缺失原件；重复发布现有页不能补齐创建。

## 最小待决项与后续工程

1. **就业服务：先限定已有许可，还是新增采购。** 在原首日有效期内，复用已有有限转介许可不需要重新决定工资、20 分之一人员划分或单位转介工时；这些已经存在。可实现的最小工程是新 programme 身份、target 绑定及底层容量唯一分配，且不能重复计算旧池供给。若要求新增/扩大服务或跨许可期运行，缺的是实际合法合同与用途拨款，不是允许程序填一个“单人成本”。新 programme 生命周期仍未实现，不能把现 PLAN 包装成它。
2. **迁移补助：明确付款日程，而不是重定义审批。** Benefit 数值由用户请求，实际批准金额受既有拨款和名单约束。原文没有说明一次性还是周期性。最小建议是版本化的“每名获批参与者一次性上限、真实名单核验后再形成付款义务”，属于 **PROPOSAL_ONLY，未采用**；不补默认金额。若采用分期/周期，必须明确次数/频率与期限。沿用 U0717/U0719 的实际 Required Approvals 和既有 Finance 机制，不自行添加或绕过审批；跨境/重大/战略分类缺原件时应停止。人员、住房、实际迁移与支付分别记账，不能互相冒充。
3. **返岗：明确资格及产生劳动力变化的实际条件。** 原文只给“长期非就业”，没有阈值，也没有开局历史处理。最小建议是“开局不回填持续时长，只接受真实经核验资格原件；实际完成/重返求职有独立事实，随后仍走既有 job matching”，属于 **PROPOSAL_ONLY，未采用**。用户只需决定长期资格口径/初始历史处理及实际返岗条件，不需要重写人口账本、工资或匹配公式。技术上需补对应来源和新的明确事实；现 LabourFact 没有 `NOT_IN_LABOUR_FORCE → UNEMPLOYED_SEARCHING` 的返岗分支，不能冒用教育毕业、跨境入境或在岗离职事件。

在上述来源和必要规则明确前，不创建成功记录、不入队、不发 `Created`、不生成工资/补助/人口转移；也不新增一个永久 503 入口。后续一份有效实现应由同一 World/current head 的真实审批、预算、名册和容量原件进入固定 Worker→Core 创建及重放，再接现有 API/表单，而不是从浏览器 `eligible/approved/paid/ready` 字段发权限。

## 本次交付与证据边界

只提交本文档。未新增 public export 或消费入口，没有未使用的 creation 产品模块；新建表单和九个字段的实际 creation 连通度仍是 0/9。金额、资格、人员时长和实际支付均未假定。现有功能保持，未运行数据库、重 proof、全面测试或 shared emit；文档改动仅检查格式与 diff。
