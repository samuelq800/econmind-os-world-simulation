# 预算申请反馈与页面读取验证

2026-11-19，Asia/Shanghai。现有运行时维护，候选 `87c64c405832ddd27d96d1b5556db712d4e4e044`，分支 `codex/office-next-connections-20261108`。状态 `IMPLEMENTED_UNVERIFIED`。独立审查待完成。

财政预算窗口显示申请动作、原始金额和额度编号，由当前状态决定主要操作。提交被受理后最多自动查询四次同一笔申请，只在服务端仍返回排队或已领取时继续。连接中断时保留手动查询入口。收到生效回执后立即呈现结果，并读取当前账本。读页失败时保留回执和刷新入口。只有取得授权的当前页，才开放下一笔。明确被拒绝的申请可在重新读取授权页后准备新申请，已用请求标识仍不可复用。

在同一浏览器读取客户端内，相同数据集和分页条件的并发读取共用一次 HTTP 请求。完成后下一次刷新重新取数。改换数据集或分页条件会取消旧请求，会话失效会清除当前请求和私有界面。改动归属 World Web 的预算窗口与当前页客户端，沿用现有查询授权和回执验证。服务端权限、数据库、正式迁移和经济命令执行留在原边界。

## 实际验证

Windows，Node 24.20.0，pnpm 12.3.4。测试使用隔离的 DOM 和网络替身，构建使用本地环境。

- `pnpm exec vitest run tests/world-web -t 'Office|office|Finance|finance|budget|postwar' --maxWorkers=3` 退出 0，378 项匹配回归通过。
- 随后新增一项明确拒绝后打开新申请的回归。`pnpm exec vitest run tests/world-web/office-command-next-request.test.ts tests/world-web/postwar-office-runtime.test.ts --maxWorkers=2` 退出 0，79 项通过。
- `pnpm test:boundaries` 退出 0，46 项架构检查和两项边界扫描通过。改动文件的 ESLint、Prettier、`git diff --cached --check` 和 `pnpm secrets:check` 退出 0。
- `ECONMIND_ENV=local node scripts/assert-safe-environment.mjs` 和 `pnpm --filter @econmind/world-web build` 退出 0，前端编译与构建通过。

原生浏览器端到端与真实 PostgreSQL 五分钟容量为 `NOT_RUN`。上一轮的 86/100 笔写入和读取 P95 2.29 秒仍是容量基线。候选留在本地，未推送。无新增或废弃分支。
