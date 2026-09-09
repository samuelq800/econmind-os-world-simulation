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
默认情况下 `hard_dependencies` 需已 `VERIFIED`。P1 若按
`docs/governance/FAST_MAINLINE_REVIEW_POLICY.json` 明确记录为工作包审查延期，
可在同一命名 Work Package 内继续；P0 永远不能用延期或 fast-track 解锁。
标记 `PARALLEL_PREPARATION` 的步骤可以按清单提前准备，但不能据此跳过父工作包的正式前置门槛，也不能把父工作包标完成。

## 4. FAST_MAINLINE 生命周期
唯一集中策略为 `docs/governance/FAST_MAINLINE_REVIEW_POLICY.json`。风险按实际
变更触及的最高边界分类，不能因工作包标题、文件位置或进度目标降级。

- P0 / HIGH RISK：必要自动证据通过后仍须阻塞式独立审查；未批准前不得
  `VERIFIED`、merge 或开始依赖实现。
- P1：自动测试、invariant、security、governance 全部通过后可继续 mainline；
  独立审查只能延期到明确命名的 Work Package gate。
- P2：foundation/docs/tooling/non-authoritative integration 可在证据通过且确认
  未改变 P0 边界后，由负责人明确 fast-track。
- P3：非行为变更在必要证据通过后不要求独立审查。

`VERIFIED` 可来自独立 `APPROVED`，或仅对 P2/P3 来自负责人明确的
`OWNER_FAST_TRACK_ACCEPTED`。记录必须绑定不可变 implementation commit、证据
文件和真实检查结果。实施者不得虚构 owner approval，也不得自行批准 P0。

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

当前状态、分支、证据和下一 gate 只以 `status/progress.json` 为准。本文件不复制
易过期的 step 状态。V01 完成后必须停在 V01 PACKAGE-LEVEL REVIEW，不得开始 V02。

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
