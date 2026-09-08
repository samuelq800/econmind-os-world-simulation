# PLANS.md — EconMind World V2 R2 Execution Governance

本文件是仓库级执行治理入口。经济与工程 P0/P1 以 `requirements.docx` / Constitution 为最高约束。

## 1. 权威工作分解

- 主工作包：V00–V32，共 33 个。
- 详细步骤：101 个，权威清单见 `planning/r2_steps.json` 与 `planning/R2_33_WORK_PACKAGES_101_STEPS.md`。
- Engine：Master E01–E18；Engine ID 不等于 Settlement Phase ID。

## 2. 状态模型

`UNASSESSED → PLANNED → IN_PROGRESS → IMPLEMENTED_UNVERIFIED → (CHANGES_REQUIRED → …) → VERIFIED`
另有 `BLOCKED`、`DEFERRED_WITH_APPROVAL`。

## 3. 依赖门槛

普通步骤只有在所有 `hard_dependencies` 已 `VERIFIED` 后才可开始。
标记 `PARALLEL_PREPARATION` 的步骤可以按清单提前准备，但不能据此跳过父工作包的正式前置门槛，也不能把父工作包标完成。

## 4. 标准生命周期

READ SPECS → PLAN → IMPLEMENT → RUN REAL TESTS → IMPLEMENTATION REPORT → INDEPENDENT REVIEW → FIX BLOCKERS → RE-REVIEW → VERIFIED → NEXT STEP。
实施者不得自行把任务标为 VERIFIED。

治理同步及所有详细步骤的 `VERIFIED` 必须由独立可信审查者签署的 JSON attestation 授权。
统一机制见 `governance/SIGNED_REVIEW_ATTESTATIONS.md`；固定 schema、确定性序列化、
SSH Ed25519 签名、subject/commit/内容哈希和历史关系均由验证器校验。
Markdown 仅作人类可读证据，文件名、标题、Git author、APPROVED 文本不能授予验证权。
实施者可机械记录状态，但不能持有生产审查私钥或自行增加可信 authority。

公钥 registry 与验证策略由仓库外、实施者不可写的 trusted-runner policy 哈希固定。
修改密钥、权限、schema、签名策略或验证算法属于 `GOVERNANCE_CRITICAL_CHANGE`，
必须先经独立审查再由负责人更新外部 trust pin，合并前不得自我批准。
目前生产 registry 为空：`TRUST_ROOT_PROVISIONING_REQUIRED`；不得伪造生产 key 或 attestation。

`VERIFIED` 不等于 `MERGE_AUTHORIZED`。合并授权还要求 Governance 与 V00.1 均经签名
独立核验为 `VERIFIED`，且 `final_reconciliation.status = PASS`，并单独记录合并授权。
V00.2 readiness 还要求治理已实际合并并由可信 runner 核实 integration ref；
验证器支持未来合法生命周期，但本轮不得更改真实状态、合并或启动 V00.2。

## 5. 决策纪律

Codex 可提出 ADR proposal，但需要用户/负责人批准的架构或经济规则不得自动变为 APPROVED。未批准冲突只阻塞依赖它的步骤。

## 6. 证据纪律

- 测试文件存在 ≠ 测试通过。
- `NOT_RUN` 绝不能改写成 `PASS`。
- 真实数据库/RLS/并发/恢复若未运行，必须明示。
- 不得删除、skip 或弱化 P0 测试来通过 CI。

## 7. Scope 纪律

一个月是冲刺窗口，不是静默删减原规范功能的授权。任何延期必须显式 `DEFERRED_WITH_APPROVAL`。

## 8. 关键里程碑

- V10.4：首个双国真实经济闭环验收。
- V25：六 Office + 地图完整产品接线。
- V26：非权威 forecast / realtime / cache。
- V27：70 国初始化与 NPC。
- V29–V30：长跑、功能、安全、性能、恢复。
- V31–V32：灰度、生产切换、赛季归档和运营交接。

## 9. 技术边界

- world-web：Vite + React + TypeScript，非权威。
- world-api：认证命令/查询边界，不拥有第二经济模型。
- world-worker：Node/TS authoritative execution。
- MapLibre/deck.gl/PMTiles：展示层。
- Web Worker/Comlink/IndexedDB：非权威 forecast/replay/cache。
- Parquet/Arrow/DuckDB：后续分析归档。
- Rust/WASM/WebGPU：仅 profiling 证明需要后考虑。

## 10. 数据环境

开发/CI/staging 与共享生产 Supabase 隔离；生产数据库保持唯一受控 migration 发布链。新 repo 不得随意 `db push` 共享生产。

## 11. 当前执行门槛

- 当前步骤：V00.1。
- 当前真实状态：`IMPLEMENTED_UNVERIFIED`，技术复审正在进行。
- V00.2：`BLOCKED`，不得开始。
- V00.2 的解除条件：V00.1 经独立复审成为 `VERIFIED`，且本次治理同步经独立核验、合并到主分支。
- 治理文件存在、验证器通过或实施者完成修复，均不能代替上述独立复审与合并条件。

## 12. 导航

- 33 工作包和依赖：`planning/03_33个工作包与依赖.md` 与 `planning/work_packages.json`。
- 101 步权威定义：`planning/r2_steps.json` 与 `planning/R2_33_WORK_PACKAGES_101_STEPS.md`。
- 30 天窗口、阶段和架构边界：`planning/01_新仓库架构与完整交付路线.md`。
- ADR 与数据库发布协议：`planning/02_架构裁决与数据库协议.md`、`reference/02_规范冲突与裁决清单.md` 和 `status/decisions.json`。
- 功能覆盖：`planning/04_完整功能覆盖登记.md`。
- 最终验收与交付门槛：`planning/05_验收与交付清单.md`。
- 当前状态：`status/progress.json`。
- 单步执行提示：`prompts/steps/<STEP_ID>.md`。
- 可复用控制提示：`prompts/control/`。
- 报告和证据模板：`templates/`。

任何导航源互相冲突时，停止受影响工作并报告差异；不得自行选择一个版本继续。
