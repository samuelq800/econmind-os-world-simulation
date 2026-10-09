# World-sim 当前版本与协作交接

2026-10-09 更新：PR118 已合入 main 并同步到本交付分支。本次新增的 API/executor
HOLD 入口、共用 Supabase 目标和无账号验证方式见
[运行环境交接](CLOUDFLARE_RUNTIME_HANDOFF.zh-CN.md)。新增 P0 HOLD 候选已独立审查
批准并发布，生产经济接入仍未完成；以下2026-10-08快照保留其原有证据范围，
旧绿色检查不覆盖本次代码。

记录日期：2026-10-08（北京时间）。面向同步仓库后继续修改代码的同伴。
本说明是交接导航，不替代 `requirements.docx`、`AGENTS.md` 或仓库正式状态记录。

## 先同步正确分支

本轮代码位于 **`codex/world-seed-delivery`**，见 [PR124](https://github.com/samuelq800/econmind-os-world-simulation/pull/124)。
写本说明时 PR 尚未合入 `main`；只更新 `main` 不会得到本轮完整交付。

| 身份                            | 本次核对的固定版本                                |
| ------------------------------- | ------------------------------------------------- |
| 远端 main                       | `96217db583db4c1bd6ef74714b2e0a5ef6b7ed6d`，PR123 |
| 本说明新增前的交付分支基线      | `2a903050811b067cfbf1b15a265022003384718c`        |
| 完整检查通过的代码候选          | `586363f0b3779e4d5b7499538b8a2ea8941bc358`        |
| 已部署 Cloudflare Worker 的源码 | `909161e8c95311ecc623cc90c332b81c204fc76e`        |

后续文档提交会改变分支 HEAD，请同步分支最新提交，不要为匹配表中旧 SHA 回退仓库。
若 PR124 后续已合并，按实际合并结果选择 main；不要把本快照当永久分支策略。

在自己的仓库目录中执行：

```powershell
git status --short
git fetch origin
git switch codex/world-seed-delivery
git pull --ff-only origin codex/world-seed-delivery
git log -5 --oneline
git switch -c codex/teammate-next-change
```

先处理自己的未提交改动，再切换或拉取；不要用 reset/clean 覆盖自己的工作。
若本地尚无交付分支且 Git 未自动建立跟踪，使用
`git switch --track origin/codex/world-seed-delivery`。
最后一行是新工作分支示例，换成实际任务名；已有工作分支则按正常协作流程继续。

## 这个版本究竟是什么

现在是 **已发布的世界资料网页与公共只读 API，加上仓库中的经济内核及开局准备工具**。
正式经济世界仍为 **NOT_ACTIVATED / BLOCKED**，不是已经持续运行的70国经济游戏。

| 层           | 当前能力与边界                                                                                                   |
| ------------ | ---------------------------------------------------------------------------------------------------------------- |
| 网页         | https://world.econmind.group/；地图、70国、六职位界面和来源展示。界面存在不表示六职位业务闭环已完成。            |
| 公共数据 API | Cloudflare 提供34组固定官方来源读取，保留字节数与 SHA 校验，返回 `liveWorldState=false`。                        |
| 开局机制     | 已有 canonical OpeningSeed、初始化防重和确定性重放；新增工具检查真实来源缺项并导出逐国工作表。                   |
| 经济执行     | Core/Worker 中已有命令、权限、原子结算、租约与恢复代码及隔离验证；这些没有成为本次线上 Cloudflare 经济执行服务。 |
| 正式开局     | 缺失事实和门禁尚未闭合；没有生成或采用正式权威 Seed，没有启用世界时钟和真实线上经济结算。                        |

公共 API 目录：
https://econmind-world-read.observer-lagesan.workers.dev/functions/v1/world-v2-official-read/v1/world-data/datasets

网站由 GitHub Pages 发布。网站公共配置已指向上述 Cloudflare API。
Git 提交、Pages 网页发布和 Cloudflare Worker 发布是分别记录的动作；修改仓库不会自动更新该 Cloudflare Worker。

## 同伴的职责与 Cloudflare 边界

**同伴负责仓库代码、测试和文档，不操作 Cloudflare。** 这是本次协作限制。

- 可以修改网页、公共契约、API/Worker/Core 的授权范围内源码，以及 Cloudflare 适配相关源码和测试；遵守仓库门禁后提交 PR。
- 不登录 Cloudflare、不索取或复制账号凭证，不执行 Wrangler 登录、部署、secret、资源或套餐管理命令，不修改线上 Worker、域名或路由。
- Cloudflare 配置变更可以作为待发布代码提交，说明原因、检查结果和所需操作；实际部署、线上配置和回退由项目负责人处理。
- 同伴无需安装 Wrangler、配置 Cloudflare token，或取得生产数据库密钥，即可安装依赖、运行普通仓库检查和修改代码。
- 如改动影响公共 API，交接给负责人时提供固定 commit、涉及接口、兼容性、测试结果及是否需要重新部署。保持现有 API 配置，不因没有云端权限而换成另一套权威数据。

合并到 main 且命中 `.github/workflows/deploy-world-web.yml` 的路径可能触发 Pages 发布；
正常走 PR 审查与合并流程，不把合并当作仅保存本地代码。
只读 API 公开可读；浏览器 CORS 不是经济权限系统，不要把公共 GET 无 CORS 头的 HTTP200 误判为授权漏洞。

## 修改入口

| 要做的工作                       | 优先查看                                                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 地图、国家界面、来源显示         | `apps/world-web/src/official-data/`、`apps/world-web/public/season1-immersive/`                                                                   |
| 国家运行入口、职位投影和结果展示 | `apps/world-web/src/country-runtime/`、`apps/world-web/src/office-projection/`                                                                    |
| 公共数据目录、来源读取与校验     | `apps/world-api/src/integration/official-dataset-registry.ts`、`official-source-snapshot-reader.ts`、`official-edge-fetch-adapter.ts`             |
| Cloudflare 的只读传输适配        | `apps/world-api/src/integration/cloudflare-official-read.ts`、`config/cloudflare/world-official-read.wrangler.jsonc`                              |
| 已有认证与职位命令边界           | `apps/world-api/src/integration/https-authenticated-office-command-route.ts`、`authenticated-office-command-service.ts`；源码存在不表示线上已挂载 |
| canonical Seed 与来源采用        | `packages/core/src/opening/opening-seed.ts`、`apps/world-worker/src/preparation/`、`apps/world-worker/src/admission/`                             |
| 权威持久化、原子提交与恢复       | `apps/world-worker/src/persistence/`                                                                                                              |
| 本轮开局诊断工具                 | `scripts/world-seed-preflight.mjs`、`tests/world-core/world-seed-preflight.test.ts`                                                               |
| 已修复的 Country/Office 测试载体 | `tests/integration/v10-1-country-office-read-flow.test.ts`                                                                                        |

网页只能消费获授权的公共契约和投影，不能直接导入服务端 Worker、持久化或结算实现。
Core 必须保持确定性；正式状态变更走授权命令、追加事件、幂等处理和原子结算。
不得另建浏览器经济真相、用随机补值填满 Seed，或删除校验来消除 BLOCKED。
完整边界见 [REPO_BOUNDARIES.md](architecture/REPO_BOUNDARIES.md)。

## 本地安装与检查

固定工具链：**Node 24.20.0、pnpm 12.3.4**。使用自己的隔离环境，不复制负责人电脑中的凭证或环境文件。
无需先连接 Cloudflare 或生产 Supabase。

```powershell
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm seed:report
pnpm seed:check
```

- `seed:report` 返回0：只代表成功导出诊断。
- 当前 `seed:check` 预期返回 **2 / BLOCKED**：真实缺项存在，不能作为启用通过。
- 输出在被 Git 忽略的 `artifacts/world-seed-delivery-v1/`；同步 Git 不会取得负责人本机的 ZIP、原始日志和生成工作表，可重新生成诊断，CI回执见下文链接。
- 工作表未知值保留 `null`；它不是合法 OpeningSeed，也没有 apply 或 activation 开关。

根据实际修改执行相关检查。常用命令：

```powershell
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test:boundaries
pnpm secrets:check
pnpm exec vitest run tests/world-core/world-seed-preflight.test.ts tests/world-api/cloudflare-official-read.test.ts
```

仓库完整验收命令为 `pnpm check`，应保留正常 CI 检查链。
Windows 原生 shell 对现有 POSIX 环境赋值脚本及目录 fsync 的行为可能不同；
本轮完整链在 macOS CI 通过，耐久数据库证据在 Linux 隔离 PostgreSQL16 生成。
不得为本机兼容性删除耐久落盘校验，或把本机失败改写为通过。
在 PowerShell 单独运行安全环境检查可用：

```powershell
$env:ECONMIND_ENV = 'local'
node scripts/assert-safe-environment.mjs
```

已有 `pnpm dev` 是本地开发 bootstrap 入口，默认端口4100/4101/4102；
就绪和健康响应不代表经济世界启用。本交接不新增或恢复 DEMO 维护任务。
数据库相关测试只用按仓库协议准备的隔离本地/CI环境。
绑定的生产 Supabase 不是开发库，不能运行开发迁移、SQL、seed、reset 或 db push。

## 已有证据，及不能从中推导的结论

- 完整 [pnpm check 37791157942](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/37791157942) SUCCESS：主测试集2904 PASS、0 FAIL、153 SKIP，后续既有检查与构建通过。
- 对应代码候选为 `586363f`，实际 CI 合成合并 checkout 为 `dfb8b41ea53806ffe0dba6757f3703d51066ab5c`。其后的 `2a90305` 仅发布说明；本交接也是文档改动，不能宣称其另跑过完整测试。
- 同次原生 PostgreSQL16 检查50 PASS、1 SKIP；[另一次耐久诊断37788536214](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/37788536214)为隔离一次性数据库 PASS，正式 dedicated staging 仍 NOT_RUN。
- 实际云端34/34来源读取通过；不证明经济运行、长期免费额度负载或六职位全链路完成。
- 初次全仓失败与后续修复分别保留。Country/Office 测试现使用真实原子提交及 FINAL receipt，没有放宽生产校验。
- 浏览器工具本轮超时，未声称完成新的全量视觉验收。

完整发布身份、原失败与证据索引见
[发布状态](reports/world-seed-delivery/RELEASE_STATUS_2026_10_08.zh-CN.md)和
[证据记录](reports/world-seed-delivery/RELEASE_EVIDENCE_2026_10_08.json)。
任何后续行为改动都应按其影响重新验证，不能沿用旧提交的绿色 CI 当作新代码证明。

## 接下来可以如何接手

1. 先读 `AGENTS.md`、`PLANS.md`、`status/progress.json`、`status/decisions.json` 和相关需求原文，确定实际任务及依赖。当前正式记录仍是 V09.1 PLANNED、next_step_ready=false、gate PENDING；本说明不自行推进它。
2. 在自己的分支完成明确范围内的源码、测试或资料整理。能独立准备的工作可继续；依赖未批准架构/经济决定的实现仍按门禁处理。
3. 对开局缺项逐项寻找仓库内真实来源，记录证据和冲突。仍缺的是持仓完整性、币种/FX、政治资本 genesis、必要 Industry/Social 输入及 World/Owner/合法席位谱系等事实；已经采用的 B=TGA 等规则不要重复要求审批。
4. 正式启用还依赖 exact0023 的唯一受控 schema 发布/读回、独立审查，以及经济执行适配后的授权、租约、生命周期和性能验收。不要把已部署的公共只读 Worker 当作这些条件已经满足。
5. 提交 PR 时写明改了什么、固定提交、实际执行的检查/退出码、未执行项、剩余阻塞，以及是否需要负责人发布 Cloudflare。不自授 VERIFIED，不改写历史失败。

**交接完成的含义：同伴能在不接触 Cloudflare 的条件下继续正常修改和验证仓库；线上云端发布仍由负责人负责。**
