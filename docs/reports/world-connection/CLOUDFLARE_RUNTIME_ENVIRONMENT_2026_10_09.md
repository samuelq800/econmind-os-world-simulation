# Cloudflare 运行环境准备交付

实现候选：`e7ecf45184baad69a37e2e51fff8862a635267dc`，基线
`812e8ae95f83c8c8bd6811ccffa21217561ea8cf`，main 来源为已合并 PR118
`3eb6e049d02a76e010cb5cb449d6d7151ae63573`。源码位于 PR124 的交付分支。
风险 P0，必要自动证据 PASS，状态 `IMPLEMENTED_UNVERIFIED`，独立审查 PENDING。本报告不批准 ADR、不推进
`status/progress.json` 的 gate，不宣称生产数据库或经济世界已启用。

## 交付行为

API 用 Cloudflare Node HTTP bridge 接入既有 Office HTTP 边界，composition
固定 null；独立 executor 仅提供 HOLD 健康/就绪响应，通过服务绑定访问。
`/healthz` 的200不能解锁经济 readiness；`/readyz` 始终503。没有 seed、Clock、
消费队列、lease 获取、数据库池或自动开局，也没有请求/环境激活开关。

真实 workerd 发现既有验签实现将 PublicKeyObject 放进 options.key 时被平台拒绝。
修复先执行原有 JWK 校验，再导出 SPKI PEM；ES256/RS256、curve/modulus、签名
长度、issuer、claims、资源上限和缓存规则保留。Workers 的 JWKS 请求使用 manual
redirect，原加载器继续拒绝非200、redirected、错误响应 URL 和超限响应。
架构规则只允许指定 API bridge 的 `cloudflare:node`；新增测试验证其他 API、
Worker、Core、web 和其他 Cloudflare 模块仍被拒绝。没有削弱原有测试或规则。

## 实际证据范围

本机 Windows：Node24.20.0 / pnpm12.3.4；独立工具目录使用 Wrangler4.148.0 /
Miniflare5.20261006.0-alpha。仓库依赖和 lockfile 未改。平台类型由 Wrangler
实际生成并执行 strict checkJs；另取回最新 workers-types5.20261009.1 作参考。

本机和 Ubuntu CI 的208项聚焦回归均为208 PASS / 0 FAIL / 0 SKIP；真实 workerd
的11项服务绑定、HTTP拒绝和 ES256/RS256/过期/issuer/篡改签名检查均 PASS。
API、Worker 构建、仓库 typecheck、聚焦 strict types、源码 lint/format、
架构/authoritative-pattern/environment/secrets、23迁移的隔离 PGlite 演练均通过。
冻结官方 Edge 的22文件一致性和29回归也通过。

API 构件738288 bytes，SHA-256
`b7a07ec01d2f67818ee0753246eddf611543e7480e28c828f108018a2bb209d4`；
executor1248 bytes，SHA-256
`37e92b7229786e61f5b57acfc4c8cbb96b739ac3198a522b98dd688fab0468b9`。
Windows 和 CI 构件哈希一致。API gzip152.63KiB、executor gzip0.62KiB。

运行环境 CI：[37893668787](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/37893668787)。
其实际 synthetic merge checkout 为 `fcda97aed51eead36f1c85f4bac9aa713a2e27e4`，
与实现候选的 tree 均为 `8ac834bca15b11ef517154133c4e6740ae87ff59`。
workerd artifact11599248422 的 ZIP SHA-256 为
`a137fffb5e820e2b58664d3601385e0cf414f22699726bbded4d0da52a765249`。
完整未修改的 `pnpm check` 退出码0：主套件2999 PASS / 0 FAIL / 153 SKIP，
后续 Edge29 PASS、boundary40 PASS，以及所有检查和构建通过。153个已有条件性
测试在该调用中未运行，不能算 PASS。单独启用的原生 PostgreSQL18.6（Homebrew）
身份到 FINAL 闭环为1 PASS / 0 FAIL / 0 SKIP，数据库仅为owned loopback TEST_ONLY。
完整检查原始日志 SHA-256 为
`8336780e09de0df79826c082bca284f5146c8ff8357795f38c6eb94b6face5f0`。
native artifact11600245534 ZIP SHA-256 为
`4e26cc4a23b806bf75000dd5d10e3a2d04a2d747d8c64fbbab2bf90994a6e98e`。
既有 V09 PostgreSQL、lease renewal、atlas 和 UI provenance CI均 PASS。
机器证据见同目录 `CLOUDFLARE_RUNTIME_ENVIRONMENT_EVIDENCE_2026_10_09.json`，
记录实际命令、退出码和缺口；没有用旧候选的绿色结果覆盖新代码。

初始 workerd JWT 正向失败、本次新测试 JWT 头缺少 typ 的失败均保留。
前者通过公钥兼容修复解决，后者修正 TEST_ONLY 测试载体，未放宽生产验签。
本机 `pnpm lint` 曾扫描到本地生成构件、类型和历史诊断输出并失败；源码 lint
已通过，未修改 ESLint 规则，干净 CI 的完整检查仍是必需证据。

## 正式目标、权限与遗留影响

用户明确确认 Workers Free 和主仓库共用 Supabase。正式 projectRef 为
`vimksjrhaxdpnkvgsavz`。仅做公开、无认证 JWKS GET，观察一个 ES256 公钥；没有
实际用户 JWT、生产 SQL、迁移、seed 或权限变更。0023源码合并不能证明生产发布。
数据库 schema、最小权限角色及连接配置由主仓库唯一批准发布链负责。不存在
已确认的隔离云 PostgreSQL；本机/CI一次性测试不能替代正式目标的验证。

没有新增 Cloudflare 付费资源、Hyperdrive ID、cron、Queue 或数据库绑定。
本次两个运行 Worker 尚未发布。此前只读 `econmind-world-read` 服务仍可访问，
复查34组资料 HTTP200，`liveWorldState=false`。原主站和生产数据库未修改。
同伴只需要同步源码、修改和运行无凭证验证；Cloudflare 操作由账号负责人执行。

影响负责人：API身份/传输、Worker执行宿主、架构边界、Cloudflare账号负责人和
主仓库生产迁移/角色负责人。部署构件只包含两个正式 HOLD 入口；测试验签载体、
诊断 Worker 和私钥不进入可部署构件。

## 未完成门槛

本机候选构件包：`artifacts/world-runtime-environment-2026-10-09/world-runtime-cloudflare-candidate-e7ecf45.zip`，
726109 bytes，SHA-256
`7a16d1b76aeeaf88a6d56e55aac50d60ff19654a4fb81a29ac73728bb58ac4e2`。
实际 ZIP 中19个payload的大小/哈希及总计20个entry已逐项验证。该包为离线候选，
不因打包而成为已发布或已批准的生产版本。构件包和原始诊断输出保存在本机
ignored artifact目录；源码、配置、报告及可复现 CI纳入仓库，便于同伴同步。

P0独立审查必须批准不可变候选，才能合并或发布本次运行服务。仍缺实际 Cloudflare
version ID/探测、生产 DB schema/roles/connection、真实 JWT/合法席位、正式 opening
及独占 writer 生命周期接线。保持 HOLD，不以健康检查或测试夹具宣布正式开局。

操作者与同伴入口：[运行环境交接](../../CLOUDFLARE_RUNTIME_HANDOFF.zh-CN.md)、
`config/cloudflare/world-runtime-targets.json`、
`.github/workflows/cloudflare-runtime-environment.yml`。
