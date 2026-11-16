# 读写可用性修复执行记录

状态：`IN_PROGRESS`，不是完整修复或容量通过。

工作分支：`codex/fix-current-read-availability-20261116`，基线 `189a511c5124bcad1a457710442634286417e731`。

已执行方案第一阶段的内部诊断准备：发布结果附带受限阶段、已校验国家和单调计时耗时。保留 PUBLISHED / UNAVAILABLE 和既有持久回执语义；不返回底层异常、SQL、令牌或私有载荷。关闭后的调用继续原行为。此诊断不是经济事件或第二份权威状态。

新增确定性协议回归使用阶段同步点，证明已提交回执可以与未完成的 Industry 发布并存，发布失败后保持原回执，并可通过既有派生重试恢复。此测试使用协议替身，不证明真实 SQL 的失败原因，也不代替原生并发验收。

已运行：

- `pnpm exec vitest run tests/world-core/postwar-office-publication-controller.test.ts tests/world-core/postwar-current-publication-head-cutoff.test.ts tests/world-core/postwar-office-publication-binding.test.ts`：exit 0，31 项通过。
- `pnpm run pretest`：exit 0，按 Core → Worker → API 顺序构建通过。此前单独先构建 Worker / 检查 API 因本地旧 Core 构建产物缺导出失败；按依赖顺序重建后通过，未改业务源码解决该构建问题。
- 定向 ESLint：exit 0。
- `node scripts/check-boundaries.mjs`：exit 0，705 个文件通过。
- `node scripts/check-repository-secrets.mjs`：exit 0，3992 个文件通过。
- 定向 Prettier 与 `git diff --check`：exit 0。

尚未执行：带新诊断的真实注册 Node / 原生 PostgreSQL 并发复现、读取恢复逻辑修复、完整必需检查及 30 分钟混合负载。既有 503 缺陷仍未宣布修复。不修改治理 gate，不自授独立审查或 VERIFIED。

当前未启动新测试容器或生成种子、临时数据库；无新运行时资源需要清理。当前修复分支与集成分支均仍有用途，未删除分支。既有无关未跟踪报告保持原样。
