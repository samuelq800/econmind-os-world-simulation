# Cloudflare Worker 配置交接：2026-10-16 实际读回

用户提供 `EconMind_Cloudflare_Handoff.html` 后，依据其中“先核对部署现状，保持
HOLD”的平台工作单核对实际配置。本记录源代码基线为
`526c9e50228834491f6b7bd7238995b9ea38f2e9`；观测时间见各 JSON 的 UTC 时间。
附件建议不是运行授权；现有仓库治理、生产数据库发布链和经济门槛保持适用。

**结论：当前 Worker 配置已经符合已批准的 HOLD 范围，无需重新设置绑定或重发
相同构件。本次没有修改云端配置、创建 Hyperdrive、部署、连接生产数据库或启动
World。正式接库和经济运行仍有实际代码与依赖缺口，不能宣布全部接通。**

机器证据与未完成项：[ASSESSMENT.json](../reports/cloudflare-handoff-20261016/ASSESSMENT.json)。
此次只新增 P3 非行为交接记录，不更新 `status/progress.json`，不重写历史报告。

## 可以直接核对的 Worker 配置

账号 ID：`9bad0b638402dc39700132716e3b312c`。

| 项目                | API                                                         | executor                               | 公共资料 reader                        |
| ------------------- | ----------------------------------------------------------- | -------------------------------------- | -------------------------------------- |
| Worker              | `econmind-world-api-staging`                                | `econmind-world-executor-staging`      | `econmind-world-read`                  |
| 当前版本            | `96ef9651-3349-4aee-99fa-25df79860c36`                      | `be51213f-96d4-4ade-af4d-cb8dc97fdfb0` | `7c90b4bc-6886-4cff-8c76-bb6e19f66417` |
| 当前流量            | 100%                                                        | 100%                                   | 100%                                   |
| 发布 UTC            | 2026-10-10 05:59:19                                         | 2026-10-10 05:59:15                    | 2026-10-08 14:13:33                    |
| `workers.dev`       | 开启                                                        | 关闭                                   | 开启                                   |
| preview URLs        | 关闭                                                        | 关闭                                   | 关闭                                   |
| 定时任务            | 无                                                          | 无                                     | 无                                     |
| 绑定                | `RUNTIME_MODE=HOLD`；`WORLD_EXECUTOR` service binding       | `RUNTIME_MODE=HOLD`                    | 无                                     |
| service target      | `econmind-world-executor-staging`，environment `production` | 不适用                                 | 不适用                                 |
| compatibility date  | 2026-10-09                                                  | 2026-10-09                             | 2026-10-08                             |
| compatibility flags | `nodejs_compat`                                             | `nodejs_compat`                        | `nodejs_compat`                        |
| 观测采样            | 0.01                                                        | 0.01                                   | 0.01                                   |

`production` 是 service binding 实际返回的 Cloudflare 环境标签，不表示经济世界
已经生产启用。当前账号没有分配到这三项 Worker 的 custom domains；executor
workers.dev 的无凭据 HEAD 返回404，API 内部探测仍为 ALIVE_HOLD。

API 和 executor 的实际 provider 模块已下载到内存计算哈希，与已审查固定 HOLD
构件完全一致：

- API：`b7a07ec01d2f67818ee0753246eddf611543e7480e28c828f108018a2bb209d4`
- executor：`37e92b7229786e61f5b57acfc4c8cbb96b739ac3198a522b98dd688fab0468b9`
- reader 实际哈希：`2d39fd5576ea1dbc57a48783a8660cb5e9088975a23e196d47e895c238490e77`；
  本轮没有将它另行宣称为经济 runtime 构件或重建该历史源码。

证据：[provider readback](../reports/cloudflare-handoff-20261016/provider-readback.json)、
[模块哈希](../reports/cloudflare-handoff-20261016/bundle-readback.json)。
旧交接附件只引用10月9日版本；本轮确认当前两个 runtime 版本为10月10日已发布版本，
没有将旧版本直接认定为现有版本或回退目标。

## URL、前端与现有发布流程

- 运行 API：<https://econmind-world-api-staging.observer-lagesan.workers.dev>
- 公共资料 URL：<https://econmind-world-read.observer-lagesan.workers.dev/functions/v1/world-v2-official-read/>
- HTTPS 前端：<https://world.econmind.group/>
- 前端 provider：GitHub Pages；当前成功发布
  [Actions38778045004](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/38778045004)，
  release SHA 为上述 `526c9e5…`。
- Pages artifact `11993993282` 的 GitHub 元数据 digest 为
  `sha256:1a4aac8453216cf58dfd6b61704b5361d1405c1b52b6b6a95a935ba012c86656`。
  808213856字节 ZIP 没有下载，因此不宣称已重算整包哈希。线上根 HTML 已独立读取，
  SHA256 为 `9410a1e6d83d635d33ba3dbeaec82d2ce3ed3773d3ba9af422851e9d1882eff9`。
- 实际根页面中的 `window.__ECONMIND_WORLD_READ_CONFIG__` 与仓库变量
  `WORLD_OFFICIAL_READ_BASE_URL` 一致，指向公共资料 reader，未混用 runtime API。
- GitHub 旧 `/pages/builds/latest` 返回2026-09-12的 legacy 构建；当前 provider 为
  workflow，不能用该旧接口记录覆盖上述实际 Actions 发布事实。
- `world-cloudflare-hold` 环境仍存在，仅允许 Branch `main`；发布 Token 的 Secret
  名称和正确账号变量仍存在。本轮只读元数据，不提取 Secret 值。发布方式见
  [Actions 运行说明](WORLD_RUNTIME_GITHUB_ACTIONS.zh-CN.md)。

**待 GitHub 仓库管理员处理：** 当前 Pages `https_enforced=false`，HTTP 也返回200。
管理员应在仓库 Settings → Pages 开启 **Enforce HTTPS**，随后验证该设置和 HTTP
重定向（[GitHub 官方设置说明](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https)）。
HTTPS 页面和 Worker 的 HTTPS CORS 目前正常；不要为兼容 HTTP 而扩大
Worker 来源白名单。本次 Worker 核对没有修改 GitHub Pages 设置。

证据：[GitHub 读回](../reports/cloudflare-handoff-20261016/github-readback.json)、
[Pages artifact 元数据](../reports/cloudflare-handoff-20261016/pages-artifact-metadata.json)。

## 本次真实探测及边界

共12项 GET/HEAD/OPTIONS 探测：10项有明确预期的响应码全部通过，另2项观察记录
为 executor 公网404与前端 HTTP200；没有发送经济命令 POST。

- `/healthz` 200，`ALIVE_NOT_ACTIVATED`。
- `/readyz` 503，`executorTransport=ALIVE_HOLD`；503是 HOLD 的预期结果。
- runtimeReady、databaseConnected、simulationEnabled、clockEnabled、
  authoritativeCommandsEnabled 均为 false。
- 两个批准 HTTPS origin 的 Office OPTIONS 均204；未批准来源403；Office GET405。
  OPTIONS 成功仅证明预检，不证明命令权限或经济接收成功。
- 公共 reader datasets200、允许来源预检204、未批准来源预检403；不开放通配 CORS。
  返回34个资料集，`liveWorldState=false`，`dataNature=OFFICIAL_SELECTED_SOURCE_DATASET`。
  `databaseAvailability=VERIFY_PER_REQUEST` 是资料接口字段，不是已连接生产数据库的证明。
- 当前 Hyperdrive 列表成功读回且为空，实际没有可设置 TLS/cache 的现存资源。
  不用 TEST_ONLY ID 创建或绑定空壳资源。
- 套餐读取 HTTP403/code10000，因此当前套餐仍只有此前用户确认的 Workers Free
  证据；本轮不宣称取得新的计费/额度证明，也没有创建任何付费资源。
- 1%采样、持久 invocation logs 和 `redact_query_string=false` 是当前平台读回值；
  关键审计及脱敏策略尚需正式设计审查，不能声称已建立完整安全审计/监控。

证据：[公开探测](../reports/cloudflare-handoff-20261016/public-probes.json)、
[reader 响应摘要](../reports/cloudflare-handoff-20261016/reader-response-summary.json)。
真实用户 JWT、当前席位正向、正式数据库和 Clock 验收均 NOT_RUN；未重复完整 CI。

## 真正接入数据库前还需要的交接

| 责任人                         | 必须提供或完成                                                                                         | 当前处理                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `econmind-os` 数据库发布负责人 | 唯一受控发布链的 schema/角色/准入读回；分开的 reader/intake/source/executor 最小权限连接引用           | 未取凭据、未执行生产 SQL，不使用 postgres/service_role 兜底                                      |
| Runtime/API/Worker 开发负责人  | 正式 source、Clock、actor host 构造器及 module-private identity/request 生命周期的实现、适用检查和独审 | 当前 `ServerCommandHostBinding=never`，三个正式 constructor 仍缺失，单填连接信息不能挂载正式命令 |
| 资料、身份和经济负责人         | 正式 source/World/seed/admission、真实当前席位与授权范围的验收证据                                     | 保留缺项，不从历史报告推断全部已实现或全部未实现                                                 |
| 平台发布负责人                 | 上述依赖满足后，审查真实 Hyperdrive binding 名称/资源 ID/角色映射、TLS、缓存关闭及新不可变发布集合     | 继续 HOLD，不修改现有固定 HOLD 发布脚本去绕过拒绝条件                                            |

目标 Supabase project 仍为 `vimksjrhaxdpnkvgsavz`。前述连接参数是服务端组合参数，
不是已经存在的 Cloudflare 环境变量；角色与 binding 名称需要正式组合定义，
不能在控制台随意添加几个同名字符串就声称连通。

仓库当前 `V09.1=PLANNED`、`next_step_ready=false`。正式接库、开局、手动经济
命令、自动 Clock 需要各自满足原有批准与验收，不能由本记录或部署按钮替代。
当前状态可表述为“已核对的 HOLD 托管可用，正式经济接入未完成”。
