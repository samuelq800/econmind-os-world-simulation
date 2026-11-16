# World 数据检查与发布窗口修复

2026-11-16，Asia/Shanghai。状态：`IMPLEMENTED_UNVERIFIED`；不是 V30 容量通过、独立审查批准或生产发布。

## 数据检查

本机没有发现可复用的 World PostgreSQL 监听端口、World 容器、命名卷或本地 reference-db 描述文件。仓库只有安全的 `.env.example`，环境检查为 `local / databaseConfigured=false / linkedSupabaseProject=NOT_LINKED / databaseMutationAllowed=false`。Docker 中发现的数据库属于其他应用，未使用。旧临时 PostgreSQL 数据属于团队生命周期测试，并非 World 模拟数据。

该结果只说明本机未发现可复用环境，不表示远程生产 World 没有数据。本次没有查询或修改生产 Supabase，没有使用旧站邮件配置作为数据库凭证。

按所有者“实在不行先用测试数据”的授权，复用双国小型测试夹具。其数据由真实 Core 生成，写入实际嵌入式 PostgreSQL（PGlite），运行正式 SQL 校验和带 ES256 JWT 的 Fetch handler。SQL 查询确认提交后 `world_version=2 / event_sequence=2 / commands=2 / events=2`。它不是空数据库或仅靠 mock 返回页面，但其测试日志写入器也不是注册 Worker 消费者，不用于声称真实 100 人容量。

## 机制与修复

小型 SQL/API 测试复现：head 推进时，新版本页面尚未发布，原 API 返回 503；同版本发布完成后恢复。这与原压测现象一致，但没有把该小型测试当作原 70 国运行的事务级唯一根因证明。

修改三个提案 SQL 的读取函数：仅在授权 seat 存在、当前 head 没有已发布页面时，用内部 `NOT_PUBLISHED` 区分缺失。游标过期仍为 STALE，权限拒绝仍为 DENIED，已存在页面的完整性、来源撤销与覆盖校验失败仍为 UNAVAILABLE。Captain 的原行为保留。没有返回旧版本行，没有改 grant、RLS、表结构、经济命令或提交协议；历史 hash 固定 SQL fixtures 未改。

Financial / Social / Industry adapter 识别内部缺失状态。API 在完整读取事务释放后有限等待，每次重新验证身份并开启完整快照。最多七次读取，等待间隔为 100/200/400/800/1000/1000ms，累计等待 3.5 秒；重试调度另以自首次读取起 4 秒的单调时钟预算限制。既有 SQL/请求执行时限仍适用；4 秒不是抢占正在执行 SQL 的额外硬截止。

只有缺失发布状态进入等待；SQL 已识别为 DENIED、STALE 或 UNAVAILABLE 的来源/权限/完整性问题不进入此重试。若页面缺失与来源撤销同时存在，缺失分支可能先触发有限探测；每次读取仍拒绝返回任何未经完整校验的数据。永久缺失也可能先经历这段有限等待；代码不将其承诺为将会恢复。预算耗尽后保持原公开 `CURRENT_*_UNAVAILABLE / retryable=false` 契约。取消请求不继续打开 SQL。未更改前端或新增后台服务。

保留前一阶段的发布诊断：固定阶段、已校验国家、累计耗时，不输出底层异常和私有载荷。未来原生复现可以分别验证 economic FINAL、derivedPublication 和页面可读性。

## 验证与实际结果

环境：Windows，固定 Node 24.20.0 / pnpm 12.3.4，现有依赖，PGlite 临时目录位于 `D:/data/temp`。没有新增 Python / Java / 全局依赖。

- 最终定向 Vitest：9 文件，81 PASS / 8 SKIPPED，exit 0。覆盖发布后新快照成功、等待期间权限/来源撤销、已有撤销来源不重试、永久缺失的次数上限、取消、Financial/Social 内部状态区分、SQL 当前版本/游标/完整性及既有发布回归。8 项原生环境门控跳过，不计为通过。
- `pnpm typecheck`：exit 0。
- `pnpm build`：exit 0，包含 API、Worker、Core 和 Web；保留原有构建警告，未部署。
- `pnpm test:boundaries`：exit 0，46 项测试通过，权威模式与 706 文件边界扫描通过。
- `pnpm foundation:policy`、`pnpm secrets:check`、`pnpm migration:validate`：均 exit 0。
- local 环境检查：exit 0；隔离迁移演练 clean-baseline / existing-schema 均 PASS，exit 0。
- `pnpm format:check`：exit 0；`git diff --check`：exit 0。
- `pnpm lint`：FAIL，exit 1；本机被忽略的历史构建产物及 `.wrangler/tmp` 被全目录扫描，1260 errors / 16 warnings。没有修改扫描规则、删除历史产物或将该命令记为 PASS。另通过 ESLint API 检查 `git ls-files` 中全部 JS/TS 文件及本次两个新源码/测试文件：1855 文件、0 errors、exit 0。这证明受控文件检查通过，不改写前述全目录失败事实。

过程中曾因读取 adapter 构建产物未更新而失败，执行 Core→Worker→API `pretest` 后恢复。新增 SQL 状态使两个原“未发布”断言需要精确更新，Industry 测试的两项后续失败为前一断言提前退出造成状态未复位；只修改未发布场景预期，撤销/损坏拒绝断言保留，最终完整目标测试集通过。没有 skip 或弱化现有失败用例。

最终定向命令：

```text
pnpm exec vitest run tests/world-api/postwar-industry-labour-paged-chain.test.ts tests/world-api/current-publication-read-retry.test.ts tests/world-core/postwar-social-mixed-current-projection-sql.test.ts tests/world-core/postwar-financial-mixed-current-projection.test.ts tests/world-core/postwar-social-mixed-current-projection.test.ts tests/world-core/postwar-industry-labour-current-sql.test.ts tests/world-core/postwar-office-publication-controller.test.ts tests/world-api/postwar-office-runtime-fetch-handler.test.ts tests/world-api/postwar-office-read-node-route.test.ts
```

## 剩余验收与发布边界

全量测试、带诊断的 70 国原生注册运行、100 会话 30 分钟混合负载、同数据库重启恢复与独立审查尚未完成。不能据此签容量承诺、采购更大服务器、标 VERIFIED 或合并 P0 候选。当前改动涉及 SQL 读取与重新鉴权边界，按集中审查政策走 P0 路径。

SQL 文件是隔离测试提案入口，并不是已执行的生产迁移。已有部署若使用旧函数，将继续原有拒绝行为；真实发布前必须按唯一受控链设计函数升级、兼容和回滚，不能把这些完整建表提案直接重放到已有生产库。

未触碰旧站仓库、World gate、生产权限或业务数据。没有启动本任务 Docker 容器；PGlite 临时数据库在 finally 中关闭并删除，测试后未发现 `D:/data/temp/industry-labour-chain-*` 残留。永久保留的是必要回归测试与报告，不保留临时数据。

当前工作分支 `codex/fix-current-read-availability-20261116`，集成分支 `codex/office-next-connections-20261108` 继续保留。本次未识别可废弃分支，不删除其他本地或远端工作。
