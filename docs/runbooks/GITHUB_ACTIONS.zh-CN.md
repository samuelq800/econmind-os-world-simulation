# GitHub Actions 使用入口

本次整理以 main 的实际功能为准：减少独立工作流入口，保留原测试和历史证据。没有关闭整个仓库的 Actions，没有取消正在执行的任务，也没有删除运行记录、日志、artifact 或缓存。

## 日常入口

| 工作流文件                                 | 用途                                                        |
| ------------------------------------------ | ----------------------------------------------------------- |
| `deploy-world-web.yml`                     | main 的静态网页构建与 Pages 部署                            |
| `world-runtime-actions.yml`                | 已审查 HOLD 的校验/显式发布；保留原 environment 与确认保护  |
| `v09-postgres.yml`                         | 原生 PostgreSQL 验收与完整 pnpm check；工作流文件变化也触发 |
| `v09-renewal-supplement.yml`               | 独占执行租约续期的原生数据库回归                            |
| `trusted-country-runtime.yml`              | 国家/Office 运行边界与客户端回归                            |
| `world-web-atlas-candidate.yml`            | 地图、网页及公开资产校验                                    |
| `cloudflare-runtime-environment.yml`       | Cloudflare 适配的离线打包与隔离测试，非部署                 |
| `start-ready-candidate.yml`                | 额外的已登记组合验收与证据采集                              |
| `official-ui-provenance.yml`               | UI 来源精度与生成结果一致性                                 |
| `world-official-map-publication-check.yml` | 地图来源发布规则的离线校验                                  |
| `world-official-page-config-check.yml`     | 正式来源的页面接线校验                                      |
| `world-official-source-resume-check.yml`   | 来源读取续传审计工具的离线校验                              |
| `world-v2-official-edge-check.yml`         | Edge 读取器的测试和 Deno 检查                               |
| `world-v2-snapshot-storage-veto.yml`       | Storage/migration 边界回归                                  |
| `world-specialist-checks.yml`              | 下表的专项验收；一次只选择一项                              |

没有将生产发布和普通测试合成一个入口，也没有削弱 PR 检查来减少条目。仍在开发分支中的 `office-connection.yml` 不属于此 main 文件清单；保留其活跃 PR 的检查。GitHub 自动提供的 Dependency Graph、pages-build-deployment 也保留。

## 专项验收

在 Actions 选择 **World specialist checks (select one suite)**，点击 Run workflow，选择目标 ref 和 suite。默认项是纯来源审计，避免默认启动整套数据库任务。所有选择使用固定任务定义，输入不会拼接为命令。

以下 14 个 suite 与原文件名（去除 `.yml`）一致；原工作流文件从 `.github/workflows/` 移除，任务本身迁入统一入口。

| suite                                         | 能力                           |
| --------------------------------------------- | ------------------------------ |
| `e-world-v2-release-handoff`                  | PostgreSQL 17 发布交接演练     |
| `f-durable-command-intake`                    | 持久命令接收与恢复             |
| `f-official-opening`                          | 正式来源开局、类型和数据库验收 |
| `gate-b-disposable-diagnostic`                | Gate B 故障诊断与持久证据      |
| `narrow-transfer-approval-reference`          | 窄转账审批引用与重试           |
| `staged-narrow-transfer-http`                 | 分阶段 HTTP 转账验收           |
| `v30-2-postgres-permission-negatives`         | GRANT/RLS 权限负向回归         |
| `v30-3-local-authenticated-bridge`            | 本地认证桥接                   |
| `v30-4-buyer-finance-approval-reader`         | Buyer Finance 审批读取         |
| `v30-disposable-restore`                      | 隔离数据库真实备份恢复演练     |
| `world-v2-api-full-reader-role`               | 全来源读取角色                 |
| `world-v2-api-reader-readback-audit-postgres` | 原生数据库读取审计             |
| `world-v2-api-reader-readback-audit`          | 纯来源读取审计                 |
| `world-v2-api-reader-role`                    | 选定国家读取角色               |

选一项只执行该任务和轻量选择器校验，不自动执行其余 13 项。未知 suite 必须失败，不能因为全部任务跳过而得到空的成功结果。

这些任务仍使用原 runner、PostgreSQL 16/17 服务、loopback URL、隔离确认字段、只读仓库权限及上传策略，不调用生产数据库。原先特定旧分支的 push 分支名继续保留，每个任务仅响应自己原有分支。原 push 的路径过滤统一移除，因此在那些特定分支上可能多做检查；不会减少原先应做的检查，也不会让普通 main push 启动 14 项验收。

## 生效、历史与恢复

此变更合入默认 main 后，新手动入口才正式可用。在此之前不通过 API 停用旧工作流，避免暂时失去验收入口。

合入后可按清理记录中的旧 ID 停用 14 个旧入口，并读回状态。若 GitHub 仍显示旧工作流历史，它不等于该入口仍可执行；为了清理名称而删除过去的运行证据不属于本次操作。GitHub API 本身提供启用/停用工作流能力，参见[官方说明](https://docs.github.com/en/rest/actions/workflows#disable-a-workflow)。

需要恢复时，从 `cd966907494ddee5d8a86f18f75989f0eff288ce` 恢复相应 YAML，再启用原 workflow ID；先避免原入口和统一入口对同一分支重复触发。该提交只改变 CI 入口，不改变数据库 schema、应用运行或经济交易，不应通过迁移回退来恢复。
