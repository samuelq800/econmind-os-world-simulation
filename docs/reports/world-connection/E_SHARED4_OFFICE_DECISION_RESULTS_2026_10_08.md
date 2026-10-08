# E SHARED-4 四职位业务结果投影

状态：**IMPLEMENTED_UNVERIFIED**；独立 P0 审查 **PENDING**。
本包仅更新正式源码的已提交业务结果投影，不启用生产经济引擎、不修 local-preview。

基线 `bcfc66787631a13aa5093df42954070c2d7dd66b`（PR116）；分支
`codex/e-office-decision-results`，checkout
`/Users/samuel/Documents/econclub/.econmind-worktrees/e-opening-decision-reconciliation`。
最终 SHA/tree、diff、逐文件 hash 和最后检查固定于外部
`artifacts/E_SHARED4_OFFICE_DECISION_RESULTS_2026_10_08/E_FREEZE.json`。

## 正式接线

新增纯 `office-decision-result-projector.ts` 和公共
`packages/core/src/authorization/office-decision-result-contract.ts`。
Core 根索引只加一行 export；不改经济 parser/reducer、admission、规则或权威状态。
现有 `AuthoritativeActivityReadProjectionPublisher.replace` 仍是唯一替换 writer。
已提前通知 Root 转知 G：publisher 由 E 窄集成，不增加 competing DB writer。

在既有 writer guard / current scopes / visibility 的同一个 held transaction 读取
immutable authoritative_event、canonical command 和完整 COMMITTED receipt。
核对原始 event/command fingerprints 和 payload hashes、版本、连续全局 sequence、
correlation、SimTime、receipt eventIds、幂等键及 exact current head，之后才执行既有 replace。
没有从 cache、materialization、eventCount、调用者 delta 或浏览器 DTO 取业务值。
SQL bigint 以 text 读取，避免 JSON number 精度丢失；source 失败发生在删除投影之前。

批量投影只在批量入口校验全局链，不为每个 active office 重复执行该 hash 校验。
读取仍覆盖该 World 的完整已提交事件；本包未建立另一套经济 replay engine 或历史缓存。

## D 可消费的窄 DTO

Office projection 的 `payload.decisionResult`（非四职位为 null）：

- `schemaVersion: office-decision-results-v1`、`classification: OFFICE_PRIVATE`。
- `sourceHead` 是发布时当前 head；`cause.worldVersionBefore/After/eventSequence`
  是最后一次实际业务结果的位置。稀疏 head 允许二者不同。
- `source: COMMITTED_EVENT_RESULT`；`semantics: COMMITTED_EVENT_RESULT_NOT_CURRENT_POSITION`。
  它不是当前头寸、官方开局证明或来源 admission。
- `status: COMMITTED | SOURCE_UNAVAILABLE | NOT_AUTHORIZED`；缺源不填零。
- metrics 的 EXACT_CHANGE 携带 canonical before/delta/after 和 unit；AFTER_ONLY
  的 before/delta 为 null，明确 PREDECESSOR_STATE_NOT_CARRIED。
- `cause` 只保留该 Office 的 command/event fingerprints、版本、SimTime 与必要 planCommandId；
  不返回原始 event/source/ledger、账户、证券持仓、工资原件或 cabinet 记录。
- `afterState` 始终 null；尤其不能从 Social afterStateHash 生成经营状态。

COUNTRY 的 `payload.decisionResults` 只含 country、current head 和
`NOT_AUTHORIZED / OFFICE_DECISION_DETAIL_PRIVATE`。既有 governing source 未给出公开
业务明细授权，故不公开私有数值、金融工具、command/event 因果明细；原 country ledger
与 Office-private 金融隔离不变。所有 Office scopes 仍来自当前服务端授权，撤权后既有
replace 删除该 scope；本包没有新增授权接口。

## 四职位结果与精确缺口

Captain：从已提交 event 内真实 source.capitalFact 前态调用现有
`replayCaptainPoliticalCapitalAllocation`，重算并核对整个 allocation payload。
输出七桶实际变动；测试中 FISCAL 11.5−2.75=8.75、INDUSTRY 6.25+2.75=9。
该次前后七桶总和均 38，不生成政治资本，也不把 fixture 当正式 genesis。

Central Bank：绑定 source/current version/sequence/trace hash 与 canonical intent，调用
既有 `calculateOpenMarketOperation`，核对 kernelReplayHash，仅投影央行自身证券资产及
商业银行准备金负债两项 Core trace。两项 TEST_ONLY 数值均 GBP 100+10=110。
仍要求既有 admitted-owner financial visibility（含实际央行 owner 映射），不会公开
commercial-bank traces、holdings、账户或原始金融分录。本包不是完整 OMO 财务账本 / rights
历史 replay 或新的金融来源 admission；这些仍由既有权威执行与 ledger reader 负责。

Social：按 Root 明确批准的保守 partial，严格绑定 committed command、event type、
world/country/position/time、结果字段、实际已提交 original plan/fingerprint 与 due day。
仅输出事件明确承载的 matched / remainingUnemployed / remainingVacancies /
remainingFreeServiceSlots；单位分别为 person 和命名字段的 service_slot 计数标签，不增经济规则。
PLAN_PENDING 与 MATCH_SETTLED 分开。TEST_ONLY due 明确产生 3 / 2 / 1 / 0；这最后的 0
来自实际 Core outcome，不是 missing→0。前态未携带，before/delta/afterState=null，
不是 reducer replay-verified 或完整前后经营状态。实际 historical predecessor reader 仍是缺口。

Industry：固定 main 有 production-consumption pure protocol/tests，但没有可用的正式
committed production source/writer/登记链；现有 durable V08 reader 还明确拒绝该 production schema。
输出 SOURCE_UNAVAILABLE / COMMITTED_PRODUCTION_SOURCE_UNAVAILABLE，不借测试 output 或
构造新的生产事件规则。该缺口以本次 inspected fixed source 为边界，不扩大为全局不存在。

## 实际检查及失败记录

工具链 Node 24.20.0 / pnpm 12.3.4；本 checkout 的 compiled Core、Worker dist、node_modules、Vite cache。
未安装依赖、未借其他窗口 mutable dist。

- Core build exit 0，PASS；最终 Worker build exit 0，PASS。
- 新 `vitest run tests/world-core/office-decision-result-projector.test.ts`：初始 23/23 PASS；
  加入幂等 receipt 绑定后最终 24/24 PASS（含纯投影与 held-SQL double 的 replace / 撤权）。
- 受影响既有 publisher 文件首次 13 项：12 PASS / 1 FAIL，exit 1。
  唯一旧 legacy fixture 用常量 a-hash、缺完整 canonical committed 记录，新读取拒绝。
  经 Root 同意，仅把该 fixture 改成真实 Core canonical command/event/receipt 和完整 posting binding；
  原分类、账目不可见、撤权、fence、其他 projection 保留等断言未删除或减弱。
  `vitest run ...v10-authoritative-activity-read-projection-publisher.test.ts -t 'preserves activity and fenced rebuilds'`
  exit 0：1 PASS / 12 本次未跑。此前 12 PASS 未重复，不声称新整轮 13/13。
- 定点 tsc 首次 exit 2：两个 unused 测试 import；删除未用 import 后最终 exit 0，PASS。
- 幂等负例编辑时新 suite 曾 exit 1 / 0 tests：fault 插入了错误作用域；修正位置后通过。
  一次 apply_patch 的旧格式上下文未匹配、没有落盘，随后用实际文本修正；未改断言。
- eslint 定点所有实现及新/受影响测试 exit 0，PASS。
- boundaries 首次 FAIL：API 的 office-command-intake export 在本 checkout 旧 Worker dist 中缺失。
  正常 build 自己的 Worker 后重查 exit 0，PASS，294 文件；不改源码 ownership/policy。
- authoritative-patterns exit 0，PASS，289 文件 / 89 Core；后续窄编辑未增加 forbidden imports/authority pattern。
- safe environment exit 0，PASS：local、databaseConfigured=false、NOT_LINKED、mutation=false。
- 最终格式、secret scan、diff、ownership 与 freeze 核对记录于 E_FREEZE。

新正例是显式 TEST_ONLY canonical record / Core 运算；SQL double 不冒充实际 PostgreSQL。
旧定点回归使用既有隔离内存 PGlite 数据库，没有生产 SQL 或新运行服务。
真实 PostgreSQL/RLS、生产数据库、正式 source activation、六职位 gameplay、D 的 UI 消费、
部署/生产启用、全仓检查和本地预览均 **NOT_RUN**。没有读取密钥或连接 Supabase。

总计只改八个文件：pure projector、现有 publisher、公共 DTO、Core 一行出口、
新直接测试、旧 publisher 单一 fixture、定点 tsconfig、本报告。
旧 Captain genesis 缺失审计及旧固定候选原件未修改。
交 Root 做固定候选独立窄审与正式 main 集成；E 不 self-approve / self-merge。交接后停止。
