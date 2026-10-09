# World-sim 发布交付状态 — 2026-10-08

网页与 Cloudflare 官方来源只读 API 已发布。正式经济世界仍为 **NOT_ACTIVATED / BLOCKED**，
不能把本次云端读服务交付标成完整可玩的正式经济版本。

## 实际部署

| 项目                | 固定身份与实际证据                                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 网页                | 主线 `96217db583db4c1bd6ef74714b2e0a5ef6b7ed6d`，https://world.econmind.group/                                                                         |
| 首次主动 Pages 发布 | [37788541320](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/37788541320)，build/deploy SUCCESS                               |
| Cloudflare 服务     | `econmind-world-read`，https://econmind-world-read.observer-lagesan.workers.dev/functions/v1/world-v2-official-read/v1/world-data/datasets             |
| Cloudflare 源码     | `909161e8c95311ecc623cc90c332b81c204fc76e`，版本 `7c90b4bc-6886-4cff-8c76-bb6e19f66417`                                                                |
| 发布工具            | 隔离安装 Wrangler 4.148.0；dry-run 105.68 KiB / gzip 26.49 KiB；实际启动测量 9ms（不是每次请求 CPU 或经济结算耗时）                                    |
| 免费约束            | 用户直接确认该账号为 Workers Free；没有升级套餐、付费资源、数据库 binding 或 cron。当前 OAuth 无账单读取权限，套餐为 Owner 确认事实，非账单 API 认证。 |
| 云端数据验收        | 34/34 个有效来源查询 HTTP200，固定来源 SHA 匹配，全部 `liveWorldState=false`。目录/国家列表/01 国详情/地区读回与既有接口摘要一致。                     |

Cloudflare 复用原有官方来源 handler 和 snapshot reader，唯一传输适配是将 Workers
不支持的 `redirect: "error"` 转为 `manual`；原有 loader 继续拒绝所有非200、重定向、
字节数或 SHA 不匹配。没有放宽来源检查，没有 SQL、任意上游代理或经济命令路由。
CORS 保留现有两个 HTTPS 网页来源。官网公共配置已指向 Cloudflare 入口。

Workers Free 文档当前列明每天100,000请求、每次调用10ms CPU；额度由账号共享，
超限可能拒绝服务。本次普通读回成功不能证明70国完整结算或长期负载能落在免费额度内。
参考：[Workers 定价](https://developers.cloudflare.com/workers/platform/pricing/)、
[运行限制](https://developers.cloudflare.com/workers/platform/limits/)。

## 当前产品能做什么

官网连接 Cloudflare 的第二次 Pages 发布
[37791371716](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/37791371716)
已 SUCCESS；2026-10-08T14:20:51Z 实际官网 HTML 读回新 API 配置，SHA256
`124bca7a8bf3affd7404b378103fe17e0dfc125da1ccff4cfb2b7844d0a76f03`。

- 展示世界地图、70国与六职位界面，读取34类固定官方来源及国家资料。
- 展示来源身份、单位和精确数值；数据是选定的开局参考来源，不是实时经济状态。
- 代码已有 canonical OpeningSeed、重复初始化防护、确定性重放，以及在隔离环境验证的命令、唯一写入、原子结算和授权投影机制。
- 线上 Cloudflare 服务只开放已有公共读路由；尚无真实经济命令、正式 OpeningSeed admission、Worker/Clock 或六职位完整业务闭环。

## 验证与已处理失败

- `pnpm seed:report` 导出成功；`pnpm seed:check` 仍为 exit2/BLOCKED。缺失值保持未知，没有补零或生成权威 Seed。
- Cloudflare 六项专属回归（包括四种重定向拒绝）通过；与既有 reader、snapshot、preflight 合计的本轮指定集合为43 PASS /0 FAIL /0 SKIP。
- API类型、专属测试严格类型、lint、格式、仓库边界、权威模式和secret扫描通过；原冻结22模块 Edge bundle 与当前源码仍一致。
- 原 workerd 503 失败保留；定位到不支持 `redirect:error` 后，新入口直接本机 workerd 六项 smoke 全部通过。桥接 Node 出站的 Miniflare 结果单独标明，不替代直接 smoke。
- [隔离 PostgreSQL16 回执](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/37788536214)实际 SUCCESS：耐久落盘、提交确认丢失、回滚、角色/RLS、lease、恢复、双国验收均完成。下载 ZIP SHA256 `231f8adcd86d575d1a456119cce88c8214c83ad7ac9148726814470eb4541d26`，内部 repository commit 为 `1006d5df213c34b533637165fcc4c03a77480418`。
- 该回执明确 `DISPOSABLE_LOOPBACK_POSTGRESQL`、`gate_b_dedicated_staging=NOT_RUN`；不用于自行关闭 Gate B 或批准生产拓扑。
- 初次全仓 [37788517329](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/37788517329)为 FAIL：2891 PASS /3 FAIL /153 SKIP，538.38s。PR head 为1006d5d，实际 synthetic merge checkout 为392693db；不把 PR head 写成 runner checkout。三项均来自旧 Country/Office 测试插入孤立 Event、没有合法 FINAL receipt。
- 复用仓库已有 `93016f8` 测试修复（本分支15270a5）：通过真实 AtomicTransitionRepository 写入合法谱系，保留原断言并增加幂等/孤立事件/receipt时间/hash拒绝校验。当前定点7 PASS /0 FAIL；没有改动生产 publisher 或放宽其校验。
- 修复后的完整 [pnpm check 37791157942](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/37791157942)已 SUCCESS：主测试集2904 PASS /0 FAIL /153 SKIP，随后 Edge29项、架构34项和余下所有既有检查/构建均通过。PR head为586363f，实际 macOS runner checkout为dfb8b41ea53806ffe0dba6757f3703d51066ab5c；原始日志 SHA256为829375152b62a1949e0039c8546fc72485c1a1be53ad64869e61d4241a0c44a5。旧失败保留，不声称153项已执行。
- 同一当前提交的 Linux PostgreSQL16 五组检查50 PASS /0 FAIL /1 SKIP；本次PR运行按现有workflow跳过marked diagnostic，耐久诊断由前述独立workflow_dispatch真实回执提供。UI来源、地图和lease续期专项CI均SUCCESS。
- 本机冻结Edge编译器摘要00fee14…和macOS CI摘要2b2c29…分别通过各自源码一致性校验；没有宣称跨平台编译字节相等。所有测试结果均不自动批准正式经济启用或替代独立审查。

浏览器工具两次超时，本轮不声称完成新的真实浏览器视觉验收。已执行实际 HTTPS
页面/静态脚本/公共 API 读回，原 country-context.js 与固定 main Git 字节一致。

## 正式经济版尚缺的事实

1. 完整真实开局载体：央行持仓完整性、币种与FX、政治资本 genesis，以及必要 Industry/Social 运行状态。现有规则不重问，缺失事实不虚构。
2. 唯一正式 World/seed/admission 谱系、真实管理员 registry 和合法席位记录。
3. exact0023 的唯一受控 schema 发布/读回、正式隔离/审查 gate，以及 Cloudflare 经济执行适配后的性能、授权、lease、生命周期与真实账号闭环验收。

本轮没有改写 `status/progress.json`、生产 Supabase、经济规则、权威状态或 legacy
站点。Cloudflare 已成为公共来源读取主机；把 Node 权威执行器接为免费 Workers
经济服务仍需独立架构与运行证据，不能将只读部署回执当作该证据。

## 交付入口

- 代码与修复：[PR124](https://github.com/samuelq800/econmind-os-world-simulation/pull/124)，`codex/world-seed-delivery`。
- 配置：`config/cloudflare/world-official-read.wrangler.jsonc`。
- v2交付包：`artifacts/world-seed-delivery-v1/world-sim-cloudflare-delivery-v2.zip`，附独立SHA256文件；内含可单独部署的只读Worker、相对固定main的源码patch、诊断工作表、真实回执、旧失败与逐文件manifest。它不是正式经济世界激活包。
- 本机回执/校验和/工作表：`artifacts/world-seed-delivery-v1/`，忽略目录不含部署密钥。
- v1说明和失败记录作为历史保留；本文件补充本次云端部署与后续证据，不自授 VERIFIED 或 ACTIVE。

发布命令：使用隔离 Wrangler 执行
`wrangler deploy --config config/cloudflare/world-official-read.wrangler.jsonc`。
Cloudflare 登录凭证由 Wrangler 本机配置提供，不放进源码、ZIP 或命令参数。
如只读入口出现服务问题，可把 GitHub 公共变量 `WORLD_OFFICIAL_READ_BASE_URL`
恢复为 `https://vimksjrhaxdpnkvgsavz.supabase.co/functions/v1/world-v2-official-read/`，
再运行既有 `deploy-world-web.yml` 发布 main；该回退不涉及任何经济状态。
