# 预算来源权限修复报告

状态：`BLOCKED`，修复已实施并完成定向验证，P0 独立审查待完成。
实现提交：`90d1cc1ff3287cf4ae92a1f41ca1d9405a12997d`。
候选：`codex/fix-finance-budget-reader-scope-20261115`，基于 `b51ac3c4`。
详细命令、结果、环境、分支盘点见同目录 evidence JSON。使用仓库 IMPLEMENTATION_REPORT / TEST_EVIDENCE 模板字段组织证据，不推进正式步骤。

## 修复内容

原生容量诊断中的 worker 属于预算读取角色，但使用 NOINHERIT，直接调用预算函数没有 EXECUTE 权限。Finance/Social 共享入口现在为五条固定来源/授权查询，使用同一事务和同一执行器切到已有 `world_v2_finance_budget_source_reader`，读取后恢复固定 worker 角色并再次核验。

切换前后检查真实会话、危险角色标志和 reader/owner/publisher 成员关系。SQL 近似匹配、原始表读取、发布函数和其他能力不进入角色委托。读取与恢复同时失败时保留两个错误，外层事务回滚。经济写入继续使用原 worker；没有新增 GRANT、迁移、SQL 函数、池或服务。

涉及 Worker 数据库执行和授权边界，按集中策略最高风险 P0 处理。当前正式 gate 保持 V09.1 / PLANNED / next_step_ready=false；本次是已知缺陷修复，不作为 V09/V30 正式验收，也不批准 ADR 或生产发布。受影响 owner：Worker、API 组合入口、数据库权限。

## 验证结果

- 原生 PostgreSQL 16.15：6 项通过。复现原始权限拒绝；修复后真实策略/容量函数进入缺少租约的正常拒绝，授权函数成功返回真实行；同 backend、角色恢复、回滚和错误保留通过。
- 预算及相关回归：388 项通过，2 项既有完整来源原生测试未启用。未运行项不计通过。
- 共享 Finance/Social、Captain、Host 与角色回归：62 项通过，其中 6 项与上一组重复。
- Worker/API 构建、工作区类型检查、全仓库格式检查、本次文件 lint、边界扫描、权威模式、secret、本地环境、迁移校验及 foundation policy 通过。
- **全仓库 lint 失败**：1260 errors、16 warnings，涉及历史生成 bundle 和 Wrangler 临时文件。当前 lint 配置会扫描它们；已确认两个样例在 Git 忽略范围内。本次没有修改这些文件或忽略规则。
- **架构套件失败**：95 项通过、1 项失败。既有 `boundary-command.test.ts` 在 Windows 调用 `spawnSync('pnpm', ...)` 返回 status=null。直接边界及权威扫描通过，不能替代整套通过。
- 早期夹具的多语句执行、schema USAGE 和 PGlite 会话恢复问题均已修正，最终嵌入式和原生运行通过。探索时错误使用根目录 `tsc --noEmit` 失败，随后使用实际 `pnpm typecheck` 通过。

## 合并条件与证据缺口

依据 `PLANS.md` 和 `docs/governance/FAST_MAINLINE_REVIEW_POLICY.json`，P0 需要独立审查批准不可变候选后才能 merge。本次未自行授予 VERIFIED、APPROVED 或 owner_approved。还存在上述全仓库检查失败。

基础功能分支比 main 多 238 个提交、1073 个文件，不能把本次定向验证扩展为这些功能的总体验收。因此提交修复供定向审查，目标基于原功能分支，不合并 main。

本次没有重建此前已按要求删除的完整开局来源，未重新执行完整 HTTP 命令→提交→回执/重启，也没有执行 100 会话 30 分钟混合负载。原生定向测试证明执行权限和角色恢复修复；没有把缺租约拒绝当作成功经济提交。服务器容量、启动耗时改善和持续吞吐仍无新结论。没有更改 Supabase、旧系统或任何生产服务。

## 清理与分支

原生 PostgreSQL 在独立的 1 CPU / 512 MiB Docker 容器、384 MiB tmpfs 中运行，仅监听随机 loopback 端口。任务容器、数据库及下载镜像引用已删除，未创建持久数据卷，其他应用容器保留。永久回归源码随修复提交；临时业务测试数据不保留。

按本次用户清理指令，fetch/prune 后核实三个旧分支均为 origin/main 祖先且远端已不存在，删除了它们的本地分支：

- `codex/world-hold-actions-publication-record`（f75138ea）
- `codex/world-runtime-actions`（fcc1b888）
- `codex/world-seed-delivery`（7ad2313c）

`codex/cloudflare-handoff-20261016` 虽已合并，但仍在另一 worktree 使用，保留本地和 GitHub 分支。其余未合入 main 的分支保留，完整本地/GitHub 跟踪盘点在 evidence JSON。未删除未合并工作，也未修改原有 LOG_USAGE 报告。
