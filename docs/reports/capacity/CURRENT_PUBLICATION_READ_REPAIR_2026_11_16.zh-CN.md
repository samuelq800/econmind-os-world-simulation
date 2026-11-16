# World 数据检查与发布窗口修复

2026-11-16，Asia/Shanghai。状态：`IMPLEMENTED_UNVERIFIED`；不是 V30 容量通过、独立审查批准或生产发布。

## 数据检查

本机没有发现可复用的 World PostgreSQL 监听端口、World 容器、命名卷或本地 reference-db 描述文件。仓库只有安全的 `.env.example`，环境检查为 `local / databaseConfigured=false / linkedSupabaseProject=NOT_LINKED / databaseMutationAllowed=false`。Docker 中发现的数据库属于其他应用，未使用。旧临时 PostgreSQL 数据属于团队生命周期测试，并非 World 模拟数据。

该结果只说明本机未发现可复用环境，不表示远程生产 World 没有数据。本次没有查询或修改生产 Supabase，没有使用旧站邮件配置作为数据库凭证。

按所有者“实在不行先用测试数据”的授权，复用双国小型测试夹具。其数据由真实 Core 生成，写入实际嵌入式 PostgreSQL（PGlite），运行正式 SQL 校验和带 ES256 JWT 的 Fetch handler。SQL 查询确认提交后 `world_version=2 / event_sequence=2 / commands=2 / events=2`。它不是空数据库或仅靠 mock 返回页面，但其测试日志写入器也不是注册 Worker 消费者，不用于声称真实 100 人容量。

## 机制与修复

小型 SQL/API 测试复现：head 推进时，新版本页面尚未发布，原 API 返回 503；同版本发布完成后恢复。这与原压测现象一致，但没有把该小型测试当作原 70 国运行的事务级唯一根因证明。

修改三个提案 SQL 的读取函数：仅在授权 seat 存在、当前 head 没有已发布页面时，用内部 `NOT_PUBLISHED` 区分缺失。游标过期仍为 STALE，权限拒绝仍为 DENIED，已存在页面的完整性、来源撤销与覆盖校验失败仍为 UNAVAILABLE。Captain 的原行为保留。没有返回旧版本行，没有改 grant、RLS、表结构、经济命令或提交协议；历史 hash 固定 SQL fixtures 未改。

Financial / Social / Industry adapter 识别内部缺失状态。API 在读取事务释放后，按 500/1000/2000ms 最多重试三次，每次重新鉴权并开启新快照。累计等待最多 3.5 秒，既有 SQL/请求执行时限继续适用。移除重复的额外计时预算和泛型回调封装；固定错误映射只维护一处。

只有缺失发布状态进入等待；SQL 已识别为 DENIED、STALE 或 UNAVAILABLE 的来源/权限/完整性问题不进入此重试。若页面缺失与来源撤销同时存在，缺失分支可能先触发有限探测；每次读取仍拒绝返回任何未经完整校验的数据。永久缺失也可能先经历这段有限等待；代码不将其承诺为将会恢复。预算耗尽后保持原公开 `CURRENT_*_UNAVAILABLE / retryable=false` 契约。取消请求不继续打开 SQL。未更改前端或新增后台服务。

修复取消后仍再次调用读取入口的问题：等待被取消时直接返回 499，不再发起读取。测试现在严格要求 CANCELLED 和一次调用，不再接受两种结果。移除本次额外添加的发布阶段/耗时字段，发布控制器恢复原有实现；保留“经济回执已提交、派生发布仍可失败和单独重试”的回归。

本轮不增加哈希、来源证明或完整性验证。既有授权、来源和版本约束属于该读取边界的要求，保留原实现。必要回归继续保留，测试中的异常转存和重复使用保护已移除。

## 验证与实际结果

环境：Windows，固定 Node 24.20.0 / pnpm 12.3.4，现有依赖，PGlite 临时目录位于 `D:/data/temp`。没有新增 Python / Java / 全局依赖。

- 精简后的最终定向 Vitest：9 文件，82 PASS / 8 SKIPPED，exit 0。覆盖发布后新快照成功、等待期间权限/来源撤销、已有撤销来源不重试、永久缺失的三次重试上限、取消后不再读取、Financial/Social 内部状态区分、SQL 当前版本/游标/完整性及既有发布回归。8 项原生环境门控跳过，不计为通过。
- `pnpm typecheck`：exit 0。
- `pnpm build`：exit 0，包含 API、Worker、Core 和 Web；保留原有构建警告，未部署。
- `pnpm test:boundaries`：exit 0，46 项测试通过，权威模式与 706 文件边界扫描通过。
- `pnpm foundation:policy`、`pnpm secrets:check`：exit 0。本轮未再修改 SQL，前轮 migration validate / clean-baseline / existing-schema 演练通过的证据保留。
- local 环境检查：exit 0。
- 本轮所有变更源码的 Prettier 检查与 `git diff --check`：exit 0。全目录 format:check 在前轮通过。
- 上轮本机根目录 `pnpm lint` 因历史生成文件报 1260 errors / 16 warnings，原始失败事实保留。本轮将全部 1855 份受版本控制的 JS/TS 当前内容复制到独立临时目录，使用原 ESLint 配置和同一依赖执行完整 `node D:/projects/econmind-os-world-simulation/node_modules/eslint/bin/eslint.js .`：exit 0。没有删扫描规则或改忽略项。

本轮临时 lint 目录复用依赖链接时，pnpm 的自动安装打断了并行中的测试和类型检查，产生缺少模块等错误。这是检查环境操作错误；已移除临时链接并按冻结锁文件恢复依赖，锁文件未变。受影响结果作废，随后重新构建、完整重跑目标测试和类型检查通过；最后 lint 直接调用 ESLint CLI，避免 pnpm 在临时工作区自动安装。没有 skip 或弱化失败用例。

最终定向命令：

```text
pnpm exec vitest run tests/world-api/postwar-industry-labour-paged-chain.test.ts tests/world-api/current-publication-read-retry.test.ts tests/world-core/postwar-social-mixed-current-projection-sql.test.ts tests/world-core/postwar-financial-mixed-current-projection.test.ts tests/world-core/postwar-social-mixed-current-projection.test.ts tests/world-core/postwar-industry-labour-current-sql.test.ts tests/world-core/postwar-office-publication-controller.test.ts tests/world-api/postwar-office-runtime-fetch-handler.test.ts tests/world-api/postwar-office-read-node-route.test.ts
```

## 剩余验收与发布边界

全量测试、70 国原生注册运行、100 会话 30 分钟混合负载、同数据库重启恢复与独立审查尚未完成。不能据此签容量承诺、采购更大服务器、标 VERIFIED 或合并 P0 候选。当前改动涉及 SQL 读取与重新鉴权边界，按集中审查政策走 P0 路径。

SQL 文件是隔离测试提案入口，并不是已执行的生产迁移。已有部署若使用旧函数，将继续原有拒绝行为；真实发布前必须按唯一受控链设计函数升级、兼容和回滚，不能把这些完整建表提案直接重放到已有生产库。

未触碰旧站仓库、World gate、生产权限或业务数据。没有启动本任务 Docker 容器；PGlite 临时数据库在 finally 中关闭并删除，测试后未发现 `D:/data/temp/industry-labour-chain-*` 残留。临时 lint 副本及其依赖链接已清理，原仓库依赖保留，锁文件未变。永久保留的是必要回归测试与报告，不保留临时数据。

当前工作分支 `codex/fix-current-read-availability-20261116`，集成分支 `codex/office-next-connections-20261108` 继续保留。本次未识别可废弃分支，不删除其他本地或远端工作。
