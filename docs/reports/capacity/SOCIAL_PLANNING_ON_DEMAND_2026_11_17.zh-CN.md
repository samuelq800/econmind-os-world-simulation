# Social 创建规划按需加载：实施与验证

2026-11-17，Asia/Shanghai。按照 `templates/IMPLEMENTATION_REPORT.md` 记录。

## 状态

- `IMPLEMENTED_UNVERIFIED`，独立审查待完成，不推进 R2 gate。
- 基线：`26e1a7e9efd16b841344114b026793d8d9cc1f22`。
- 不可变实现提交：`bcc4471d28a50248735fecb9b659176590c78103`。
- 分支：`codex/office-next-connections-20261108`，PR #199 仍为 draft。
- 按最高触及边界保守归类 P0：新增已授权读取操作，复用现有权限/来源/版本复核。依据 `docs/governance/FAST_MAINLINE_REVIEW_POLICY.json`，实施者不自行授予 VERIFIED 或合并。
- 当前 `status/progress.json` 的 V09.1 为 PLANNED、`next_step_ready=false`；本轮维护已有实现，不启动新的工作包。

## 实施范围

普通 Social `service-pools` 列表此前会附带运行 Worker 创建规划，造成前一轮真实 70 国诊断中观测到的同步计算与排队放大。现在普通列表只读现有已授权投影，明确打开“创建就业服务”表单时才请求规划。诊断基线和限制见[原生诊断报告](CONNECTION_WAIT_NATIVE_DIAGNOSIS_2026_11_17.zh-CN.md)。

- API：在原端点新增 `READ_CURRENT_SOCIAL_SERVICE_CREATION_PLANNING`，仅接受 SOCIAL / service-pools。两个普通读取操作均不调用规划器。显式规划沿用先释放页面连接、独立 Worker 读取、再重新验证 JWT、seat、admission 和 head 的原流程。
- Web client/controller：普通刷新不请求规划；打开表单重新读取第一页规划，表单打开期间的服务池翻页继续显式请求规划。刷新、失效或关闭窗口收起表单；关闭时清除尚未提交的 CREATE 意图，再次打开重新读取。已尝试提交的原命令及恢复身份保持原有行为。
- Web view：通用抽屉增加“创建就业服务”入口；现有 social-10 创建入口打开后按需加载。若刷新期间已关闭窗口，不继续触发规划。现有 PLAN、审阅、单次提交和原命令恢复继续使用原链路。
- 原生验收辅助链路：只有确实消费创建/子服务来源元数据的 helper 改用显式操作，浏览器 helper 先打开创建表单；普通读取保持普通操作。

涉及所有者为 API 认证/读取边界、Web 非权威表单、Worker 规划 reader 的调用方以及相应测试辅助代码。没有修改 Worker/Core 经济算法、Command/Event/Receipt、财政守恒、原有来源哈希或迁移。

## 安全与兼容

没有新增缓存、服务、依赖、框架或哈希验证。没有数据库 schema/RLS/SQL 修改、生产 Supabase 操作、凭证读取或发布；没有修改结算、幂等、Clock、replay 或另一仓库的代码。普通操作的投影行保持原有语义；创建规划附加字段现在仅在显式操作中提供，仓库内消费方已适配。部署时需配套 API/Web 版本，不能将旧 Web 的自动规划预期与新 API 混用。

## 实际验证

Windows 后台命令，Node 24.20.0、pnpm 12.3.4、现有冻结 lockfile；未安装依赖、未启动 Docker/数据库或前台浏览器。下列检查针对实现提交的相同代码内容，文档另行提交。

| 命令 / 范围                                                                                                                               | exit | 结果                           |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ---: | ------------------------------ |
| `pnpm exec vitest run`，下列 9 个定向文件                                                                                                 |    0 | 139 PASS，8 SKIP               |
| `$taskTests = @(rg --files tests/world-web \| Where-Object { $_ -match 'office-command.*\.test\.ts$' }); pnpm exec vitest run @taskTests` |    0 | 12 文件，142 PASS              |
| `pnpm --filter @econmind/world-api typecheck`                                                                                             |    0 | PASS                           |
| `pnpm --filter @econmind/world-web typecheck`                                                                                             |    0 | PASS                           |
| `pnpm exec tsc -p tests/world-web/office-command.tsconfig.json --pretty false`                                                            |    0 | PASS                           |
| `pnpm exec eslint`，9 个修改的源码/测试/helper 文件                                                                                       |    0 | PASS                           |
| `pnpm exec prettier --check`，9 个修改文件及 3 份定位报告/证据                                                                            |    0 | PASS                           |
| `node scripts/check-boundaries.mjs`                                                                                                       |    0 | PASS，706 文件                 |
| `node scripts/check-authoritative-patterns.mjs`                                                                                           |    0 | PASS，699 文件                 |
| `$env:ECONMIND_ENV='local'; node scripts/assert-safe-environment.mjs`                                                                     |    0 | PASS，无数据库配置/生产连接    |
| `node scripts/check-repository-secrets.mjs`                                                                                               |    0 | PASS，4006 文件                |
| `pnpm --filter @econmind/world-api build`                                                                                                 |    0 | PASS                           |
| `pnpm --filter @econmind/world-web build`                                                                                                 |    0 | PASS，正式静态发布产物生成成功 |
| `git diff --check`                                                                                                                        |    0 | PASS                           |

9 个定向文件：

```text
tests/world-api/postwar-social-planning-sequencing.test.ts
tests/world-api/postwar-social-service-planning-reader-boundary.test.ts
tests/world-api/postwar-office-runtime-fetch-handler.test.ts
tests/world-web/social-employment-service-create-form.test.ts
tests/world-web/social-employment-plan-form.test.ts
tests/world-web/postwar-office-runtime.test.ts
tests/world-web/registered-social-command-browser-stages-protocol.test.ts
tests/world-web/social-service-catalog-context.test.ts
tests/world-core/registered-social-create-browser-chain.test.ts
```

两组正式回归不重叠，合计 **281 PASS / 8 SKIP**。8 个跳过项来自 fetch-handler 的既有原生数据库条件测试，本轮没有设置 `ECONMIND_POSTWAR_BOUNDED_TEMPLATE`，不能列作通过。普通/历史列表操作不调用规划器、新操作范围、规划前后授权及 head 变化拒绝、请求 drain、显式打开/关闭/重开、原命令恢复与旧 PLAN 均有相关回归。

初次用字面通配符 `tests/world-web/office-command*.test.ts` 调用 Vitest，exit 1、没有匹配文件；随后改为上述 `rg` 枚举实际路径的命令，通过 12 个文件。未将无测试运行记为 PASS。

构建保留 `node:util` 浏览器外置、运行时共享 CSS 路径和较大 chunk 的警告；这些不是本次新增依赖或本次容量验收结论。正式来源环境未配置，构建不代表线上接线成功。

## 证据缺口与下一步

原生 PostgreSQL/RLS/Chromium、修复后的 70 国短对照、100 人五分钟混合负载及线上部署均 **NOT_RUN**。本轮证明普通列表不会进入已定位的规划路径，没有量出修复后的延迟或证明 100 人容量通过，也没有解决显式创建规划本身的计算成本。

下一步先用同一配置复跑既定短对照，确认延迟恢复后再做一次既定混合负载；不先增加优化机制、测试矩阵或服务器。购置服务器继续暂缓，需根据修复后的测量作决定。既有诊断临时容器、卷、种子、采样脚本已清理，本轮仅保留必要回归代码、报告和证据，没有创建临时测试基础设施。

本地/远端当前分支均为 `codex/office-next-connections-20261108`。`codex/fix-current-read-availability-20261116` 的提交已被当前分支包含，本地和远端均仍保留；它相对本工作分支已被取代，但 #199 尚未合并到 main。依 AGENTS.md，删除位置仍由所有者决定；其他未确认已被取代的分支不删除。
