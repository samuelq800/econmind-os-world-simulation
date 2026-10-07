# E — 四个 Office 最小真实主循环接线 backlog

日期：2026-10-07（Asia/Shanghai）。状态：IMPLEMENTED_UNVERIFIED（定位/文档候选，不是 runtime 实现或验收）。
范围：Captain、Central Bank、Industry、Social 各一个最小合规 decision→result；仅新增本报告。
未修改 status、seed、Core、API/Worker、数据库、来源原件或其他窗口代码。没有部署/激活/生产访问。

## 1. 固定来源与结论

代码基线：main `1017ad6cc52075ec29eaebd3619a650330d147e9`，
tree `43d026b2ed044168dfeeebf7f0713c4e0768d530`。
E checkout：`/Users/samuel/Documents/econclub/.econmind-worktrees/e-opening-decision-reconciliation`；
branch：`codex/e-four-office-runtime-gap-backlog`。

G 当前 intake 是另一固定候选，不冒充已在本基线 main：
checkout `/Users/samuel/Documents/econclub/econmind-g-postgres-server-read-binding`，
head `df48568837a50961dc2f8bb78d9d64544e25a06e`，
tree `b8c246d13de07ed8b6489b09de4eda15ac089c67`，读取时工作树 clean。
`packages/core/src/commands/authenticated-financial-intake-contract.ts:9` 的
`FINANCIAL_INTAKE_OFFICE_ACTIONS` 确实只有 Trade/Finance 有 staged action；
`apps/world-api/src/integration/authenticated-financial-intake-composition.ts:206`
会对其余四个 Office 返回 `OFFICE_COMMAND_FAMILY_UNSUPPORTED`。
这是如实拒绝，不是四角色 command family 已落地，更不是生产入口已激活。

**四角色都有可复用核心，但没有完整运行接线。** 在本基线的
`apps/world-worker/src`、`apps/world-api/src`、`packages/core/src/orchestration`
针对下表四组函数的 bounded `rg` 无命中；不能从 UI 卡片、fixture 或纯函数测试推导可玩。
V11–V18 可复用 E03/E09/E10 等引擎；Captain 的最小实现实际位于 V24 preparation，
央行实际位于 V19 foundation。没有杜撰“V11–V18 央行/Captain runtime”。

| 角色 / 本次唯一主循环                                 | 真实可复用函数                                                                                                                                                      | 原始规范指针                                | 立即可见的实际 result                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------- |
| Captain：从一个政治资本桶调配到另一桶                 | `preparePoliticalCapitalAllocation`，`packages/core/src/engine-kernels/captain-strategy-governance-preparation.ts:1501`                                             | CAPTAIN-U0273–U0309；MASTER 治理约束        | 两个桶一减一增，总政治资本不变；提交回执与原因历史               |
| Central Bank：二级市场 OMO 买入/卖出                  | `calculateOpenMarketOperation`，`packages/core/src/engine-kernels/bank-central-foundation.ts:1459`                                                                  | CENTRAL_BANK-U0270–U0289、U0815–U0817       | 真实证券持仓及 BANK/CB 同一准备金 claim 变化，非 Treasury 注资   |
| Industry：设置一设施利用率目标→下一个合法生产结算结果 | `calculateV13Production`，`packages/core/src/engine-kernels/energy-production-foundation.ts:504`；必要时 `calculateV13EnergyAllocation:195`                         | INDUSTRY-U0257–U0286；MASTER L01/L07        | 目标与实际产出分开；实际投入/能源消耗、瓶颈与库存 readback       |
| Social：为既有岗位配置有限就业服务→真实匹配           | `calculateLabourMatch`，`packages/core/src/engine-kernels/population-labour-services.ts:237` + `applyLabourFacts`，`packages/core/src/labour/labour-engine.ts:1314` | SOCIAL-U0159–U0191、U0271–U0279；MASTER E03 | 同一 skill/location 求职池减少、岗位 employed 增加、vacancy 减少 |

这些是最小切片，不是把其他角色功能静默延期或宣称六角色完成。
Captain 选桶调配而不选战略逆转，避免擅自补政治成本/信誉惩罚公式；
Social 选真实岗位匹配而不选“瞬间毕业/生产率加成”。不新造经济规则。

### 原件身份

`requirements/source_manifest.json` 绑定原件与提取索引。
本次只读重算八份 DOCX 的 SHA256，全部与 manifest 相等；
规范内容引用固定 `specs/extracted/*.md` 的原始 unit 锚点，不重新抽取/改写 DOCX。
图像、公式和版式未重新审阅；以下主循环依据已索引文本，不作视觉/整规范新审计。

| 原件 ID      | 已核对 SHA256                                                      |
| ------------ | ------------------------------------------------------------------ |
| MASTER       | `0d4ea011a1291b5bd49c89c1616a7eee29731c2141a4f958e2930acf7189db13` |
| CONSTITUTION | `960a7745a8e18b8f1cb10c754ce6681d46bdfc5933a979c4a989bd3a07ff5d49` |
| CAPTAIN      | `e1d007253d3435316eae940185e52bb30316e9f72a411ca98127e3535d4c5a01` |
| CENTRAL_BANK | `c0fb17cc37a912938957a879b828c7b6139dd9e1ceef0976dc6c35ca072c36e9` |
| INDUSTRY     | `042a62b08e2c260acdb308e3f5aa7303c22003cd2de3b92251afec9dbf7c3f81` |
| SOCIAL       | `7ec7414047f4e2db5fc4c5d318d3e8ebca9f2236f8cd0f9e7d0a8213acf2f130` |
| FINANCE      | `5970033c01ba9592a8efac5c6e319c1d7424a6df562e1833e08920bf927a5576` |
| TRADE        | `f4c74900e6743afec693b7beaa2d88bdf5e574b5bc21164aff89ade043a453c0` |

## 2. 当前共用链条在哪里断

现有链条不是空白，以下必须复用，不另起命令/World/结算架构：

1. `packages/core/src/commands/command.ts:58` 的 `CanonicalCommand`、
   `parseCanonicalCommand:185` 和 fingerprint/idempotency/expectedWorldVersion。
   泛型 envelope 存在不等于四种 domain payload、capability 绑定存在。
2. `packages/core/src/authorization/offices.ts:14` 已有六个独立 Office/capability。
   本切片可用既有 `CAPTAIN_CABINET`、`CENTRAL_BANK_MONETARY_POLICY`、
   `INDUSTRY_PRODUCTION`、`SOCIAL_LABOUR`；新 payload→capability 绑定仍待实施与审查。
   G 的 read binding 只能证明读取范围，不能直接作为经济命令授权。
3. `apps/world-worker/src/intake/postgres-narrow-transfer-intake.ts:123`
   的 `PostgresNarrowTransferIntake` 在 `#run:154` 硬调用
   `parseNarrowTreasuryGcuTransferTerms`，且 `auth.capability` 与 SQL 条件固定
   `TRADE_CONTRACTS`（174/298）。不能把四角色 intent 塞进这个类或删掉其 guard。
4. `apps/world-worker/src/preparation/durable-command-consumption.ts:117`
   的 `createDurableCommandConsumptionPreparation` 在 323–327 只 dispatch
   Transfer/Shipment/Delivery。扩大浏览器 action 表不会让 Worker 执行新 family。
5. `apps/world-worker/src/authoritative-execution.ts:229`
   的 `createAuthoritativeWorkerExecution` → Core
   `processQueuedCommand`（`commands/receipt.ts:678`） →
   `AtomicTransitionCandidateFactory.prepare`
   （`persistence/atomic-transition-repository.ts:1250`）。
   已有 `createTransactionCutoffAuthorizationGuard:160` 在提交事务中重验当前 Office/capability。
6. `AtomicTransitionDraft`（同文件 55）已有 events、inventory/financial postings、
   receipt、outbox、currentMaterializations；`AtomicTransitionRepository.commit:793`
   原子写这些及 world head。四个角色现在缺的主要是**真实 server source→domain kernel→draft**。
7. `DurableV08LedgerLineageReader.rebuildFrom`
   （`persistence/durable-v08-ledger-lineage-reader.ts:452`）
   只重放 opening + Command/Event/Posting 的 V08 ledgers。
   `RebuiltV08Ledgers`（`packages/core/src/opening/opening-seed.ts:127`）
   只有 inventory/financial，不包含政治资本、设施运行、劳动力或服务容量。
   本基线没有一个已接这四领域的完整 `WorldState` 类型/reader；下节字段是待接入的权威领域状态，
   不是声称现有字段已经可从数据库读出。
8. `AuthoritativeActivityReadProjectionPublisher.replace:389`
   （`apps/world-worker/src/projections/authoritative-activity-read-projection-publisher.ts`）
   只读 event 活动和 ledger；`#deriveProjections:848` 输出 activity/ledger，
   没有四角色业务结果。不得用 eventCount 代替实际产出/就业/资本/证券。
   该 writer 会替换同一 COUNTRY/OFFICE_PRIVATE rows（423）；不要再开一个竞争 replace writer。
   API 已有 subject-bound `createPostgresRuntimeReadExecutor`
   （`apps/world-api/src/integration/postgres-runtime-read-executor.ts:20`）和 final-receipt 查询，可继续消费。

**领域状态还缺 event lineage→current checkpoint 的可靠桥。**
`current_materialization` 可以复用为派生 checkpoint，而不能被浏览器 DTO 或 caller-approved
fact 升级为另一个权威值。`AtomicTransitionRepository.#upsertMaterializations:1113`
按 `world_version = transition.worldVersionBefore` CAS；新领域按键稀疏更新时，
其最后修改版本未必等于当前 World head。实现者必须为该实际版本语义做一次明确适配和回归：
从 admitted opening + 所属 events 重建至当前 head，处理 stale checkpoint；
不能仅把行的版本强行上调来通过 guard。全局 WorldVersion、同一 writer/fence 保持不变。

## 3. 四个可直接分配的垂直切片

下列 **NEW 路径是拟新增实现文件，不是已存在代码**；family 名称也是 proposed，
需在实施时固定其 schema/event/replay version。只补运行接线，不重写上述纯核心。
现有 A 金融桥、C 社会、F 水/物理来源、G 入口、D 浏览器所有权保持不变。

### CAP-1：有限政治资本桶调配

**意图 / 授权：** fromBucket、toBucket、正 amount、reasonRef；world/country/actor、
SimTime、expectedWorldVersion 和前置事实均由当前 server binding/clock/source 绑定。
拟 family `CORE_CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1`，既有 capability `CAPTAIN_CABINET`。
不接受客户端 total、generated、bucketBalances、GDP/利率/生产率 patch。

**需要的真实状态：**
`PoliticalCapitalSnapshot`（`captain-strategy-governance-preparation.ts:87`）完整的
capitalRef/countryRef/opening/generated/total/available/spent/closing，
按固定顺序排列的七个 `buckets[].balance`，以及来源 version/lineage。
reasonRef 必须指向实际持久原因记录，不能只造一个合法格式字符串。
`capitalSnapshot:536` 验证 total/available/spent/closing 与各桶相等关系；
初始政治资本及桶配置没有接入当前 V08 reader，**不能设为0或任意演示余额**。

**Command→transition→posting→projection：**

- Server source 用 `createFoundationFact`
  （`foundation-provenance.ts:192`）绑定真实状态、canonical request、当前 snapshot；
  该工厂只校验绑定格式，不授予来源权限，所以必须由 server reader 构造。
- `preparePoliticalCapitalAllocation:1501` 已校验异桶、正量、余额充足和 exact before/delta/after，
  输出 `V24_1_POLITICAL_CAPITAL_ALLOCATION` 与 capitalAfter；不得另算成本或宏观 buff。
- 新 event/reducer 写两桶数量迁移、保持总量；用既有 authoritative transition/receipt 原子提交。
  **不是货币或商品交易，financial/inventory postings 应明确为空，不能为满足“posting”造假分录。**
  政治资本领域 transition/event/checkpoint 就是它的真实状态写入。
- 在同一授权 OFFICE_PRIVATE 结果中显示 old/new 两桶、amount、reason、committed version/receipt；
  COUNTRY/Captain brief 仅派生合法摘要，不声称政策自动生效或宏观增长。

**最小 NEW：**

- `packages/core/src/commands/captain-political-capital-allocation.ts`：
  strict intent parser、family/capability binding、event payload、纯 replay reducer。
- `apps/world-worker/src/persistence/captain-political-capital-candidate-source.ts`：
  真实 snapshot/原因读取，调用既有 preparation、构造 AtomicTransitionDraft。
- 使用 SHARED-1/2/3 的 intake、dispatch、领域读/结果投影；不新开 Captain 专用 DB/host。

**建议归属：** Root 指派 Captain runtime 执行线；不得修改 A/C/F/G/D 现有 owned 模块来绕接口。
**验收：** 一次调配→当前读回两桶及总量守恒；重复 command 不二次调配；
不足/同桶/跨国/旧版本/提交前撤职均零效果拒绝；重放=readback；没有宏观或现金变化。
现有可复用测试 `tests/world-core/v24-1-captain-governance-preparation.test.ts:250`
只证明 preparation 设计测试存在，本次未重跑，也不能替代 SQL command 闭环。

### CB-1：OMO 二级市场证券交易

**意图 / 授权：** direction、securityRef/faceValue、合法 settlementTime、policyNote；
实际 settlement amount 必须由当前证券报价、批次/期限、可用持仓与 canonical intent 派生/核对，
不是客户端任意“印钞金额”。拟 family `CORE_CENTRAL_BANK_OMO_V1`；
既有 capability `CENTRAL_BANK_MONETARY_POLICY`。最小先做一个合法到期/即期结算点，
未来日期必须由现有系统 scheduler 发布 due work，不能浏览器自动补做。

**真实状态和差距：**

- `CommercialBankLedgerSnapshot:47` 与 `CentralBankLedgerSnapshot:69`
  （`bank-central-foundation.ts`）均要求完整、同币种的 A/L/E。
  BANK reserve 与 CB reserve liability 必须是同一已存在 claim 和同金额；
  `ensureReserveReconciliation:692` 已有断言。
- 具体 security_id、issuer、holder、faceValue、marketPrice、maturity、encumbrance/可用量、
  原 reserve claimId/account IDs/counterparty、LC/FX 及 valueDate 必须真实读取。
  kernel 的 `securityRef` 只检查 reference 格式，余额是 aggregate governmentSecurities；
  **批次未受限证券校验与市场定价 reader 仍是具体代码/持仓输入缺口**，不能假定全部证券可售。
- source B/R 及 D02/D03 的 Owner 规则不提供证券库存，不提供完整 BANK/CB snapshot。
  BANK governmentSecurities 等未给定余额也不得用0补齐。

**结果与分录：**
复用 `calculateOpenMarketOperation:1459`，输出四条 exact money transitions。
BUY：CB 借记 Government Securities / 贷记 reserve liability；
BANK 借记同 reserve asset / 贷记 governmentSecurities。SELL反向。
用真实账户、对应证券权利与同 reserve claim 构造
`createFinancialPostingBatch`（`finance/financial-ledger.ts:333`）并
`applyFinancialPostingBatch:508`，与同一 authoritative Event/WorldVersion 绑定。
更新证券批次持有/可用状态；不向 Treasury TGA 增额、不直接设 M1/M2、不重复R。
新结果 projector 可调用 `deriveMonetaryAggregates`（`bank-central-foundation.ts:1612`）
从 posted balances派生，不能浏览器填写货币总量。

**最小 NEW：**

- `packages/core/src/commands/central-bank-open-market-operation.ts`：
  strict intent、kernel/event/financial-batch adapter、证券权利 replay 绑定。
- `apps/world-worker/src/persistence/central-bank-omo-candidate-source.ts`：
  当前证券报价/可用批次 + A既有真实金融carrier接口 + 完整 snapshot读取。
- SHARED intake/dispatch/projector 增加该已实现 family；不改 A 的 opening/admission/seed bridge。
  如 A尚无上述所需运行账户/权利 contract，向A提交明确字段接口，不在这里造第二金融表。

**建议归属：** Root 指派 CB runtime adapter；A继续负责其金融 carrier，
G接既有认证入口，不能把 E source-adoption loader直接当完整交易 snapshot。
**验收：** BUY/SELL真实四腿守衡及同R claim；缺行情/证券受限/无证券/不足reserve/币种不符拒绝；
重复不二次入账；撤职 cutoff/重启 replay；FINAL与授权投影版本一致。
现有 `tests/world-core/v19-bank-central-foundation.test.ts:302` 是纯 foundation，
本次未运行新的证券/SQL/真实身份链。

### IND-1：设施利用率目标→实际生产入账

**用户决定：** 指定已可运营且有合法operator/技术权利的 facility，提交现实 utilisation target；
拟 `CORE_INDUSTRY_PRODUCTION_PLAN_V1`，capability `INDUSTRY_PRODUCTION`。
目标更新先有独立事件/回执；受约束实际 output 只能由合法 daily/system settlement 得出。
拟 due family `CORE_INDUSTRY_PRODUCTION_SETTLEMENT_V1`；
这是已有生产引擎的调度，不是新 NPC，不能浏览器传 actualOutput 或手写系统事件。

**真实状态 / kernel：**
`V13ProductionInput`（`energy-production-foundation.ts:420`）要求：

- capacity：facilityRef、operationalCapacity、operatingDuration、targetUtilisation、productivity；
  并绑定原设施状态、维护状态、技术/许可、operator/title/risk。
- materials：每个 materialRef、v12AvailabilityRef、inventoryRef、usableBefore、
  requiredAtPotentialOutput；真实库存 batch/location/unit，OP产权/风险。
- energy：allocationRef、deliveredBefore/requiredAtPotentialOutput（MWh，不能把MW当MWh）；
  labour/logistics：实际可用 capacityRef/amount/unit 及所需量。
- 上述每项是当前同 snapshot 的 server-owned facts。
  `createE08ProductionReadBoundary`
  （`resource-inventory/foundation.ts:755`）明确 E10 不能直接改 E08库存；
  它的 read-only usable availability 不等于生产已入账。
- `calculateV13Production:504` 输出 potential/actual/bottleneck及每项 proposed consumption；
  不直接写 stock。设施维护/技术约束应先真实体现在可运营产能/许可中；
  当前 V13 input无独立 maintenanceAvailability 字段，若上游不能证明已施加该约束，
  必须实现/审查明确的约束接入，不能把 maintenance默认为1。
- frozen `facilities.json` 有 capacity/operator/owner、runtimeOperational、
  openingAvailabilityProposal、maintenanceGcuDayProposal 等字段；
  `production-plans.json` 是 output/use/netPerDay。它们的存在或 source proposal
  不能替代 adopted facility/recipe/实际运行输入，更不能把outputPerDay直接当本次产出。

**明确的 Core writer 缺口：**
`inventory/inventory-ledger.ts:57` 的 InventoryOperation只有
RESERVE/RELEASE/SHIP/DELIVER；`immutableEntries:234` 强制按同commodity/batch/unit总delta=0，
`validateOperationEntries:275` 只接受两腿搬运。
生产消耗和新产出不能用这些 operation表达，跨材料/产出也不是同一商品数量守恒。
`resource-inventory/foundation.ts:584` 的 `applyInventoryMovement`
只有 reserve/strategic/loss；**不得把生产耗用伪装 RECORD_USABLE_LOSS**。
必须增加受真实生产 event/recipe/input/output evidence限定的合法生产/耗用写入路径，
保留既有搬运守恒，按 MASTER L01 的 opening+production−use−loss=closing做精确对账；
不能删除旧检查、伪造目的账户、造openingentry或在current_materialization另藏库存。

**最小 NEW / 受控接线：**

- `packages/core/src/commands/industry-production-plan.ts`：
  strict目标payload和日结绑定，纯plan event/reducer（不生成产出）。
- `packages/core/src/inventory/production-consumption-posting.ts`：
  必须由Core权威执行线新增的真实E08 writer协议/replay；精确绑定V13实际结果及合法来源。
  现有inventory ledger、opening lineage、AtomicTransitionDraft/repository需必要且经过P0审查的接入，
  不能仅新文件却绕开唯一writer。具体storage/schema变更若需要，单列受控发布，不在本任务执行。
- `apps/world-worker/src/persistence/industry-production-candidate-source.ts`：
  从F的真实物理来源/维护/权利接口、E08库存、E09电力、E03劳动力读当前输入，
  生成目标draft及due settlement draft；原子包含所有耗用+唯一产出+结果event/receipt。
- Actual output的货币估值/成本或国民账户 handoff只有来源/settled valuation足够才产生；
  不默认投入成本为0、不复制实际产出进入第二GDP计数。
  `engine-kernels/national-accounts-production-foundation.ts:341` 已要求 settled real production；
  缺金额只允许如实未完成财务/国民账户闭环，不能把 physical preview叫完成经济闭环。

**建议归属：** Root指派 Industry runtime + 唯一Core inventory writer责任线；
F保留物理/水来源范围只供接口，不由本 backlog重复修改F water；A保留金融范围。
**验收：** 相同真实输入下target过高被瓶颈限制、投入/能源逐项扣减且不负，
唯一output对应唯一batch与OP权利；缺maintenance/recipe/许可/source拒绝；
日结重复/重启不再产出，plan回执≠production FINAL，授权结果同head。
复用 `tests/world-core/v13-v14-foundation.test.ts:144` 的真实计算断言设计，
以及 V08旧搬运回归；本次没有运行/造新的生产 posting证据。

### SOC-1：有限就业服务→已有岗位真实匹配

**决定与时序：** 为实际 location/skill 的既有 position选择服务分配/最大匹配请求；
拟 `CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1`，capability `SOCIAL_LABOUR`。
daily E03 到期发布 `CORE_SOCIAL_JOB_MATCH_SETTLEMENT_V1`；
不允许玩家直接增加就业总数、伪造Vacancy、给自己生成毕业生或最低工资通过bool。

**真实状态：**
`LabourEngineState`（`labour/labour-engine.ts:64`）的
aggregates(country/location/skill/status/count)、positions(position/country/location/
skill/owner/classification/requiredCount/employedCount)、wageAssertions、
appliedFactBindings；E02 `LabourPopulationAvailability:25` workingAgeAvailable；
合法 `E01DailyBoundary`、就业服务总/剩余 capacity、目标岗位有效offer/minimum-wage版本。
matchingCapacity是有限真实服务槽位，不能设为求职总量或任意默认值。
country/location/skill/wage eligibility必须由当前状态比较得到，不信任浏览器boolean。
`population-services.json` 的population/teachers/medicalWorkers等122行来源
不等于完整skill/status/position的E03状态；既有G/C来源转换可复用但必须给出上述真实binding，
本次不重新做population/source审计。

**计算 / 写入：**

- `calculateLabourMatch:237` 已按合格条件与 supply/demand/capacity取min，返回
  matched、remainingUnemployed、remainingVacancies与失败原因。
- 为正实际matched构造唯一 `JobMatchFact`（`labour-engine.ts:112`），
  由 `applyLabourFacts:1314` 修改E03；`occupyPosition:1207` 检查实际vacancy/owner/
  country/location，减少同一个UNEMPLOYED_SEARCHING池并增加EMPLOYED及position employed。
  同时从本期服务capacity扣去已用槽位，防止对多岗位重复占用同一服务量。
  无matched时如实零效果结果，不造0 quantity posting。
- 结果event + E03纯reducer/checkpoint + capacity使用记录原子提交；保留appliedFactBindings幂等。
  此动作本身不是工资付款，financial/inventory arrays为空是合法语义；
  后续真实工资由原定Labour/Wage/Fiscal链计算，不能伪造现金或用wageAssertion当已支付工资。
- 可复用 `assertEmploymentAllocation`
  （`population-labour-services.ts:256`）及 population-labour invariants，
  确保私营/公共用工不重复、就业人数=各position分配。授权Social结果显示真实newHires、
  vacancy/池变化及capacity剩余，不做抽象就业指数。

**最小 NEW：**

- `packages/core/src/commands/social-employment-service.ts`：
  计划/due payload、已有E03事实转换、event/replay reducer。
- `apps/world-worker/src/persistence/social-job-match-candidate-source.ts`：
  C既有社会consumer上增加真实E03/source-to-draft接口，复用G劳动源/身份来源；
  如C当前分支已有等价模块，直接对接，不复制第二Social引擎。
- SHARED运行接线和结果投影；C社会/F水/G入口/D浏览器现有owned scope不变。

**建议归属：** C原社会执行线接此一个job-match切片，Root安排shared runtime接线；
E只交精确backlog，不向C分支写代码。
**验收：** 真实合法岗位fill→池/position/vacancy三者一致；
不足服务容量、不匹配skill/location、未满足最低工资拒绝/零匹配；
重复命令/事实不重复就业，人数守恒，撤职cutoff、日结重启/结果投影一致。
复用 `tests/world-core/v11-2-labour-engine.test.ts:133`；
它不是新的真实Social HTTP/SQL闭环证据。

## 4. 可分配的共用 backlog（不能只扩 capability catalog）

| ID / 责任边界                              | 必须新增或复用的具体文件                                                                                                                                                                                                                                                     | 输出 / 完成条件                                                                                                                                                                                                                                       |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SHARED-1 / G入口 + Root指定Worker intake线 | NEW `apps/world-api/src/integration/authenticated-office-command-service.ts`；NEW `apps/world-worker/src/intake/postgres-office-command-intake.ts`；复用G JWT/current persisted binding/actor/clock ports；G现有HTTPS route/transport contract经review后才扩展真实family分派 | strict domain intent经Core构造真正CanonicalCommand；intake最新capability/seed绑定、G前后sameBinding与Worker提交cutoff重验、幂等及same-head队列写入；无caller经济snapshot/任意SQL；保留UNKNOWN写后不确定性。原narrow Trade/Finance路径和三签机制不退化 |
| SHARED-2 / Root指定领域state/replay线      | NEW `apps/world-worker/src/persistence/office-runtime-source-reader.ts`；复用每个NEW command模块的纯event reducers，既有 `DurableV08LedgerLineageReader` 和 `current_materialization`                                                                                        | admitted opening+events重放至同head，读真实政治资本/E03/设施/证券事实并证前置版本；明确稀疏checkpoint/CAS语义；缺数据fail closed，cache/projection不是权威                                                                                            |
| SHARED-3 / 唯一Worker composition owner    | 修改现有 `preparation/durable-command-consumption.ts` 的已实现family dispatcher；注入四个真实candidate factories，继续 `createAuthoritativeWorkerExecution`、commit cutoff guard、lease/fence与原子repository；按已有E01 scheduler发布生产/E03合法due work                   | 不让未实现family冒充支持，不以fixture自动publisher当生产；自动工作有持久causation/版本化system authority，officeId/人工authority不可假造；原Transfer/Ship/Delivery回归保持                                                                            |
| SHARED-4 / Worker read owner + G read      | NEW `apps/world-worker/src/projections/office-decision-result-projector.ts`（纯source-bound projector）；接入现有 `AuthoritativeActivityReadProjectionPublisher.#deriveProjections` 与唯一replace过程；复用授权read/final查询和scope key                                     | 四个typed角色结果随真实committed version/event watermark刷新，同事务/确定head；不与现有writer争同rows，不把eventCount当业务数值；授权隔离和receipt一致                                                                                                |
| UI消费 / D现有scope                        | 只消费上述实际DTO、current binding、submission/receipt/result；复用已有四Office的原场景与控件，不在本任务改浏览器                                                                                                                                                            | 一个真实decision→QUEUED/FINAL→结果回访；失败/UNKNOWN/NOT_CONNECTED不伪装成功，不以DEMO localStorage或UIcards当真经济                                                                                                                                  |

新增域payload/事件/写入均触及P0，必须固定候选+独立审查。数据库现有generic tables可复用
不代表API writer的SQL许可已覆盖新路径；G的
`apps/world-api/src/integration/postgres-financial-intake-database.ts` 有固定权限边界，
实施时做所需SQL grants/role与RLS的有界兼容核对。不得在本报告阶段执行migration/grant或换service-role。

**分配顺序：** SHARED-1/2契约和四组真实字段 → CAP-1/CB-1/IND-1/SOC-1单角色source-to-draft
→ SHARED-3唯一Worker → SHARED-4授权projection/FINAL → D四个实际页面消费。
Industry额外Core生产writer是明确前置，不可用“能算出result”越过；缺官方输入时仍可构造明确TEST_ONLY
机制回归，但不能把fixture当正式seed/权威。C社会、A金融、F水、G入口与D浏览器保持既定接口所有权。

## 5. 与1051来源/绑定缺口严格分列

既有 E `artifacts/owner-non-host-source-adoption-2026-10-07/REVIEW_MANIFEST.json`
是本基线真实loader的review projection，不是seed。原1051不改、不归并成Owner问题：

| 原缺口                                 | 原计数 | 本次依赖                                                                        |
| -------------------------------------- | ------ | ------------------------------------------------------------------------------- |
| 七金融字段每国LC缺失                   | 490    | CB LC金融carriers/估值；不妨碍先实现strict parser、纯adapter与明确TEST_ONLY机制 |
| 七金融字段每国opening FX缺失           | 490    | 不可用GCU=LC或FX=1替代；正式金融seed仍阻塞                                      |
| 完整CB opening holdings register未建立 | 70     | CB完整A/L/E、source-backed初始净值；OMO证券可用持仓仍需另外真实明细             |
| formalWorld binding未核实              | 1      | 四角色官方seed/current seat/运行都必须绑定同一个真实World                       |

**本报告新增定位的代码缺口不计入1051：** 四domain payload/command、intake/capability绑定、
真实state reader/replay、candidateFactory/dispatch、生产E08 writer、due work publisher、typed结果投影。
即使LC/FX明天补齐，这些接线仍不会自动出现。

**另外的运行输入/采纳依赖也不是“再问D01/D02/D03”：**
Captain完整政治资本七桶seed；CB证券批次/行情/encumbrance及完整BANK snapshot；
Industry adopted设施recipe/operational/maintenance/能源/劳力/物流；
Social真实skill/status/position/服务capacity/wage版本。
这里指出所需typed字段，未新做完整source缺失判定，也未把所有数据说成不存在。
某些原始物理/人口字段已存在或由A/C/F/G在建，必须复用它们的真实adopted接口；
它们尚未接到本基线所选runtime读/写链是代码定位结论。
任何确实未给定数值继续SOURCE_MISSING，不造默认运营数、匿名管理员、policy NPC或假历史事件。

## 6. 本次有界检查与停止边界

只读范围：上述command/authorization/intake/queued-consumer/atomic-repository/ledger-reader/projection骨架，
四个所选kernel及必要E03/E08/源规范片段；G三个intake候选文件；三个来源JSON仅检查row count/keys，
未重复全34 datasets/source adoption或全仓经济审计。

实际：固定SHA/tree与clean检查；八原件hash=manifest；针对四函数的Worker/API/orchestration消费搜索无命中；
检阅上述函数、schema/operation/guard与原始unit指针。搜索无匹配的 `rg` exit1是定位结果，不是测试失败。
一轮尝试用两个猜测的shared模块文件名定位返回exit2（文件不存在），随后使用 `rg --files`
找到并检查真实 `commands/receipt.ts` / Worker persistence；没有把猜测路径纳入backlog现状。

实际报告检查：Prettier check PASS；5个精确函数行、12个规范锚点存在核对PASS；
G固定head/clean与原1051计数一致PASS；仅本报告敏感pattern检查0项；
git diff --cached --check PASS。八原件SHA核对也已实际PASS。这些均为只读/文档检查。
本次Core/Worker build、V11–V24旧suite、原生PG/HTTP/JWT、RLS、四角色命令执行、浏览器120/420、
生产、独立review均NOT_RUN；旧测试文件仅是可复用测试指针，不声称本次PASS或四角色已可玩。
`status/progress.json` 仍按仓库原状态，不因本定位改gate/next_step_ready。

交付固定docs-only候选与一份简洁Root handoff后STOP；不实施上述NEW模块，不自行merge/deploy，
不触碰A/C/F/G/D owned范围。1051原缺口、D05排除及NPC OFF保持原样。
