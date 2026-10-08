# Captain source-to-draft adapter

状态：**IMPLEMENTED_UNVERIFIED / SOURCE_TO_DRAFT_ONLY**；P0 独立审查 **PENDING**。
正式 admitted reader、政治 genesis、原因记录 admission、共享入口及自动发布仍 **BLOCKED**。
本轮实现正式 Worker 源码的依赖适配机制，不建设或修复 DEMO_LOCAL / preview。

## 固定范围

基线 `bf2fa0556eec59ccc5bd566496340e966c5b5c36`，tree
`240d3257d58ff0c56348a9a6899eb185c64d53b0`；分支
`codex/e-captain-source-to-draft-adapter`。候选最终 head、tree、diff 和逐文件 hash
固定于外部制品 `artifacts/E_CAPTAIN_SOURCE_TO_DRAFT_ADAPTER_2026_10_08/E_FREEZE.json`。

仅四个文件：

- Worker `apps/world-worker/src/persistence/captain-political-capital-candidate-source.ts`。
- 新测试 `tests/world-core/captain-runtime-source-adapter.test.ts`。
- 定点配置 `tests/support/tsconfig.captain-runtime-source-adapter.json`。
- 本报告。

未改 Core、A/C/F/G、shared intake/dispatcher、AtomicRepository、sole publisher、
数据库权限、schema、seed、Clock 或进度状态；没有创建新 engine 或 genesis。
CAP-1 原冻结候选 `3ecb872` 及旧 5-file UNKNOWN 结论保持不变。

## 实现与边界

`CaptainPoliticalCapitalRuntimeReader.read` 是 Root 可信服务端必须实现的 typed port。
请求绑定 world/country、commandId/fingerprint、expected head、SimTime、reasonFactRef
及显式 observation；返回复用已有 READ(snapshot,lease) / MISSING。
没有 source issuer、magic tag、caller boolean 或客户端权威 DTO。
**接口存在、READ、FoundationFact、trace/hash 均不构成来源 admission 证明。**

reader 为 null 时默认精确拒绝 CURRENT_WORLD_HEAD、POLITICAL_CAPITAL_EVENT_LINEAGE、
REASON_RECORD、WRITER_LEASE 四类缺口；MISSING 不产生草案。
读取结果转为 inert immutable snapshot，拒绝未知顶层字段；保留真实 issued lease
对象而不是丢失品牌的 clone。strict intent、实际 issued commit proof、读取前后再授权、
lease/fence、world/head/sequence、trace/hash、真实原因语义和余额约束均沿用既有验证。

实际调用 `prepareCaptainPoliticalCapitalEvent` 和已有
`replayCaptainPoliticalCapitalAllocation`，比较重放资本与 event 准备结果；派生既有
transition、receipt、outbox 和 AtomicDraft。金融/库存 postings 为空。
`captain-political-capital-checkpoint-v2` 保留旧字段，并绑定前后版本、前序 sequence、
当前 transition 的完整 events/eventIds 和 sourceSnapshotHash；资本由该次实际重放得到。
**这是一跳重放与当前 transition 的完整记录，不是完整历史链或 admitted genesis。**
继续使用既有 materialization CAS，未改变 SQL observer/update 协议或执行 durable commit。

## 实际隔离机制证据

新测试显式标注 TEST_ONLY，不冒充正式经营开局。固定输入：worldVersion 4→5、
eventSequence 7→8、SimTime 16000；opening 35、generated 7、total 42、available 38、
spent 4、closing 38。七桶为 11.5 / 6.25 / 4 / 5 / 3 / 2 / 6.25，总和 38。
FISCAL_REFORM 向 INDUSTRIAL_STRATEGY 转移 2.75 后分别为 8.75 / 9；
总量、available/spent/closing 不变，没有凭空资本、现金或库存。

测试真实经过 authorizeOfficeCapability → processQueuedCommand issued proof → reader →
Core event/replay → `prepareAtomicTransitionCandidate`；TEST_ONLY capture 不执行数据库提交。
验证 queue receipt retry、event replay exact duplicate 无第二 effect。
负例覆盖 missing reader/source/reason、wrong world/country/head/time/hash/reasonRef/sequence、
unknown sourceAuthority 字段、余额不足、读取中撤权、alias mutation、伪造/错命令 proof、
future-renewed/wrong-world lease、expanded intent，以及重新绑定正确 hash 后仍为空或错国的原因。

使用本 checkout 的 compiled Core、node_modules 与 Vite cache，Node 24.20.0 / pnpm 12.3.4。
实际命令和结果：

- `pnpm --filter @econmind/core build`：exit 0，PASS。
- `vitest run tests/world-core/captain-runtime-source-adapter.test.ts tests/world-core/captain-political-capital-slice.test.ts`：exit 0，43/43 PASS（当时新 16 + 既有 27）。
- 加入两个真实 reason 负例后，仅 `vitest run tests/world-core/captain-runtime-source-adapter.test.ts`：exit 0，新 18/18 PASS；未重复既有 27。
- `tsc -p tests/support/tsconfig.captain-runtime-source-adapter.json --pretty false`：最终 18 项版本 exit 0，PASS。
- `eslint` 定点 Worker / 新测试：最终版本 exit 0，PASS。
- `check-boundaries.mjs`：exit 0，PASS，288 文件。
- `check-authoritative-patterns.mjs`：exit 0，PASS，283 文件 / 87 Core。
- `assert-safe-environment.mjs`：exit 0，PASS；local、databaseConfigured=false、未 link、mutation 不允许。

本轮上述 adapter 检查没有失败。旧 CAP-1 的失败/修复历史仍留在原报告，不作为本轮新证据。
最终格式、secret scan、diff/ownership 与冻结一致性结果记录于外部 E_FREEZE。
PostgreSQL、Supabase、SQL、seed、生产启用、实际 durable commit / readback、完整历史重放、
六职位 gameplay、全仓 build 及 preview 均 **NOT_RUN**。

## Root 精确依赖

Root 必须在唯一 trusted server lineage 中，从真正 admitted political genesis/operating
前态和完整 committed-event 链重放到当前 global head，核实真实同 world/country 的
reasonFactRef / recordRef；与 lease 在同一一致 cutoff 形成既有 snapshot。
仅给 SQL-row-lock、可解析 Fact、source metadata 或 checksum 不解决 admission。

现有 V08 OpeningSeed sources/inventoryEntries/financialBatches 和公开 lineage reader
head + V08 ledgers 不包含已定义的 Captain political genesis / reason admission。
若需新增持久化经营开局、政治源或原因记录格式，由 Root 明确协议与所有权后另行实现；
E 没有把 generic opening source、首条 allocation event 或 materialization 变成 genesis。
稀疏 CAS 修复与该来源依赖分开，CAS 通过不证明政治来源已获采纳。

固定来源审计独立保存：
`/Users/samuel/Documents/econclub/artifacts/E_CAPTAIN_GENESIS_SOURCE_AUDIT_2026_10_08/E_CAPTAIN_GENESIS_SOURCE_BLOCKER.md`，
SHA256 `38e45495a002cac711512b7ac268df19b9ad9907d4bbd248d3a660f1061b8315`。
结论仍为 **MISSING_GENESIS_INPUT_IN_FIXED_SOURCES**；原件与 selected 70 国相关字段
在 bf2fa05 与 pinned main ead5636 间一致。固定源内数值/规则 MISSING，范围外真实 runtime
carrier 与 admission 实现 UNKNOWN；不补零、90/100、随机/等分值或新 Owner 问卷。

本包交 Root 安排独立 P0 窄审和集成；E 不 self-approve、self-merge 或激活。交接后 STOP。
