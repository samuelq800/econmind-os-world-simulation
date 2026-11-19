# 分页重放优化与回归结果

2026-11-19，Asia/Shanghai。现有运行时维护，候选 `0d27cc22e4b46df073beda9d7f08ae9a5c86769f`，分支 `codex/office-next-connections-20261108`。P0 `IMPLEMENTED_UNVERIFIED`，独立审查待完成。

## 改动

上一轮五分钟窗口记录了 9,627,556 次 `canonical_json` 调用，SQL 函数自身耗时 32.00 秒。新 SQL 提案直接输出对象和数组内标量的 PostgreSQL JSONB 文本，仅对子容器递归。键排序、数组顺序、字符串转义、数值表示和空值沿用原规则。提案接入隔离环境的完整开局安装配置，保留原函数所有者和授权。历史 SQL 和正式迁移发布链保留原样。

Worker 在处理同一页时，将经过验证的 Core 结果同时用于核对历史计划和清理待追踪的回执。追踪表为空时直接继续。重放输入、页链验证、原始来源检查及命令提交行为保持原样。

## 实际验证

Windows、Node 24.20.0、pnpm 12.3.4。PGlite 中对照优化前后的实际 SQL 函数，8 组输入逐字节一致。输入涵盖 SQL 空值、JSON 空值、带尾零小数、Unicode、转义和空容器。覆盖 257 个历史帧的既有分页回归继续通过，仍检查完整前缀、发布证明和撤销行为。

PGlite 微基准使用 256 页合成数据，每页 16 帧。四组交替测量，预热后原函数中位耗时 482.37 ms，新函数 448.24 ms，下降 7.1%，输出 SHA-256 一致。这个结果只衡量 SQL 序列化。

- `pnpm test <七个相关文件> --maxWorkers=1` 退出 0，72 项通过。文件包括分页帧、Schema 清单、开局完整性、社会当前页、跨国快照、Core 连续重放和社会撮合计划。
- `pnpm -r --if-present typecheck` 和 `pnpm test:boundaries` 退出 0，后者包含 46 项回归和两项扫描。
- 改动文件的 ESLint、Prettier 和 `git diff --cached --check` 退出 0。`pnpm secrets:check` 与 `ECONMIND_ENV=local node scripts/assert-safe-environment.mjs` 退出 0。

## 待验证

真实 PostgreSQL 下的 100 人负载未复测。上一次完整五分钟结果为 86/100 笔写入、读取 P95 2.29 秒，保留为容量基线。候选保留在本地，未推送。无新分支和新增的测试数据库、容器或持久化测试数据。
