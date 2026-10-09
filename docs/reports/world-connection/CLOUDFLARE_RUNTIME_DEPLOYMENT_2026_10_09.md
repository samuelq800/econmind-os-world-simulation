# Cloudflare HOLD 运行服务实际发布

2026-10-09（北京时间）。用户授权独立审查后，独立审查代理批准不可变源码
`e7ecf45184baad69a37e2e51fff8862a635267dc` 的23文件 HOLD 候选 delta。账号负责人
已按顺序发布内部 executor 和 API，并完成实际云端验证。批准只适用于这次 HOLD
托管，不批准整个 PR124 合并、生产 Supabase 接入、ADR、R2 gate 或经济激活。

## 实际服务

| 服务     | 发布版本                               | 访问方式                                                        |
| -------- | -------------------------------------- | --------------------------------------------------------------- |
| API      | `dc5c245d-efc2-4905-a47d-4e7a75ea0902` | https://econmind-world-api-staging.observer-lagesan.workers.dev |
| executor | `69f347ce-ee0e-45a2-97cf-84e4fe7984bb` | 仅 API 的 `WORLD_EXECUTOR` 内部服务绑定                         |

两项 provider deployment 都以100%运行对应版本。Cloudflare 返回的启动时间为
API22ms、executor1ms；这是部署时观察值，不是每请求CPU额度或响应时延承诺。
两个服务的 preview URL 均实际关闭；API workers.dev 开放，executor workers.dev
关闭。executor 部署输出的“no targets”表示没有公共触发路由；内部绑定实际连通。
provider 的 `environment=production` 是命名 Worker 的默认服务环境标识，不能
推导为生产 Supabase 接入或 World 激活。

## 真实验证

15项云端探测均通过：GET/HEAD健康200、GET/HEAD就绪503且内部 executor 为
`ALIVE_HOLD`；Office正确预检204、有效形状但未接通的请求503/NOT_CONNECTED、
缺Bearer401、不允许来源403、Cookie403、超限请求体413；tick/seed/open/lease/
dispatch 的POST均405。没有真实用户JWT、合法席位或经济命令接受的正向云端证据。

API健康/就绪返回的 readiness、DB连接、simulation、Clock、authoritative command
标志均 false。部署不会自动开局、获取lease或消费命令。实际云端bindings只有
HOLD文本和内部服务绑定，没有数据库、Hyperdrive、D1、KV、Queue或秘密绑定。

源码在部署时仍与已审查候选相同，工作分支HEAD `02c4695` 仅新增此前证据文档。
API bundle SHA-256 为
`b7a07ec01d2f67818ee0753246eddf611543e7480e28c828f108018a2bb209d4`，
executor 为 `37e92b7229786e61f5b57acfc4c8cbb96b739ac3198a522b98dd688fab0468b9`，
与本机、CI、独立审查重新打包结果一致。完整自动证据仍绑定该源码候选：主套件
2999 PASS/153条件SKIP/0FAIL，Edge29、boundary40、聚焦208、workerd11通过；
原生PostgreSQL18.6身份到FINAL闭环1 PASS/0SKIP/0FAIL。

补充的本机启动profile已通过。Wrangler4.148.0的直接check startup构建未转发
config而误触monorepo检测，且workerBundle需要multipart；两次CLI调用失败已记入
机器证据。使用dry-run --outfile的正确multipart后成功：active39.3ms，window63.8ms。
该profile仅说明本机启动行为，没有放宽检查或宣称云端CPU保证。

## 交接边界

实际发布交付包：`artifacts/world-runtime-environment-2026-10-09/world-runtime-cloudflare-hold-release-v1.zip`，
743017 bytes，SHA-256
`add6bb5daa432cee73d856e734364f67ce52fa73ca8d8430140d6b72d505725e`。
ZIP内24个payload的大小和SHA-256已逐项验证，总计25个entry。包括两个已审查构件、
可移植配置、无秘密目标清单、同伴说明、独立审查和实际部署证据。该包记录HOLD
托管发布，没有真实凭证/私钥、TEST_ONLY验签Worker入口或生产经济激活授权。

账号为用户已确认的Workers Free，未创建付费资源、数据库或定时任务。共用生产
Supabase没有执行SQL、迁移、seed、权限或身份修改。现有公共资料reader和主站
部署未改。正式DB/schema/roles、真实身份席位、opening、独占writer与经济生命周期
仍按主仓库发布链和现有gate接线；正式世界尚未激活，Clock未启用。

同伴同步 `codex/world-seed-delivery` 后可以修改、运行本机/CI验证，无需Cloudflare
凭证。后续发布由账号负责人完成，并为新改动收集相应证据/审查。本次审查没有
覆盖整个PR124历史delta，因此PR保持draft；不要只同步main而遗漏交付分支。

[独立审查](CLOUDFLARE_RUNTIME_INDEPENDENT_REVIEW_2026_10_09.md)、
[发布机器证据](CLOUDFLARE_RUNTIME_DEPLOYMENT_EVIDENCE_2026_10_09.json)、
[同伴操作说明](../../CLOUDFLARE_RUNTIME_HANDOFF.zh-CN.md)。
