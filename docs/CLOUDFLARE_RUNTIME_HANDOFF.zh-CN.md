# Cloudflare 运行环境交接（2026-10-09）

本次交付对应分工中的“运行环境线”。API 和独立执行 Worker 已有可打包的
Cloudflare 入口，默认固定 HOLD。新增代码触及架构边界和 JWT 验签，已由用户授权的
独立审查代理批准不可变候选 `e7ecf45`，并完成两个 HOLD 服务发布及15项真实云端
检查。`VERIFIED` 仅适用于这次 HOLD 托管候选；正式 World 没有开局，Clock、
命令消费、数据库连接、writer lease 均未启用。整个 PR124 仍为 draft，未据此合并。

[独立审查记录](reports/world-connection/CLOUDFLARE_RUNTIME_INDEPENDENT_REVIEW_2026_10_09.md) ·
[实际部署记录](reports/world-connection/CLOUDFLARE_RUNTIME_DEPLOYMENT_2026_10_09.md)

## 服务和正式数据库

`config/cloudflare/world-runtime-targets.json` 是无秘密的目标清单，不是批准记录。
API 的 staging 名称为 `econmind-world-api-staging`，地址为
https://econmind-world-api-staging.observer-lagesan.workers.dev；执行 Worker 为
`econmind-world-executor-staging`。后者不开放 workers.dev，只通过 API 的
`WORLD_EXECUTOR` 服务绑定访问。`/healthz` 返回200只说明存活；`/readyz` 返回503，
即使执行 Worker 存活，也不会转为经济系统就绪。现有 Office HTTP 路径保留
CORS、请求体限制和授权拒绝行为，经济 composition 固定为 null。

正式目标是和主仓库共用的 Supabase `vimksjrhaxdpnkvgsavz`。仅读取了公开 JWKS：
当前有一个 ES256 公钥。未使用真实用户 JWT，未执行生产 SQL、迁移、seed 或权限
修改。PR118 的0023迁移源码已合并到本地，不代表生产已经发布。数据库接入仍须
由主仓库唯一发布链确认实际 schema、最小权限角色、连接方式和凭证绑定；这些
不能用本机测试数据代替。也没有捏造 Hyperdrive ID 或另一份权威数据库。

现有 `econmind-world-read` 公共资料 API 是此前已经部署的只读服务；它返回官方
资料源，不代表已经运行的 World State。本次两项运行服务的发布情况见目标清单。

## 同伴如何继续改仓库

同伴不需要 Cloudflare 登录，也不应持有 Cloudflare token 或生产数据库密码。
同步交付分支后，用仓库锁定的 Node24.20.0、pnpm12.3.4 和 frozen lockfile。
修改 API、Worker、公共契约及测试后运行正常仓库检查；不要绕过
`status/progress.json` 的 gate。Windows 的开发工具优先使用 `D:\dev` 隔离环境。

```powershell
pnpm install --frozen-lockfile
pnpm --filter @econmind/core build
pnpm --filter @econmind/world-worker build
pnpm --filter @econmind/world-api build
pnpm exec vitest run tests/world-api/runtime-environment-hold.test.ts tests/world-api/cloudflare-jwks-verifier.test.ts tests/world-api/supabase-jwks-signature-verifier.test.ts tests/world-api/https-authenticated-office-command-route.test.ts tests/world-api/production-runtime-binding.test.ts tests/architecture/boundaries.test.ts
pnpm exec tsc --noEmit -p tests/support/tsconfig.runtime-environment-hold.json
```

新增 `Cloudflare runtime preparation (no deploy)` CI 会执行真实 workerd 的
服务绑定和 ES256/RS256 验签、本仓库未修改的完整 `pnpm check`，以及现有 opt-in
原生 PostgreSQL JWT→持久席位→入队→fenced结算→FINAL→授权读取测试。
所有测试数据库均为隔离的一次性目标。CI没有 Cloudflare 凭证，不会部署。

真实 workerd 曾发现 Node 能接受、平台不能接受的公钥对象参数；现已先校验 JWK
再导出标准 SPKI 公钥供验签使用，算法、曲线、RSA长度、签名和 claims 限制保留。
公开 JWKS 请求使用 manual redirect，非200、重定向和来源不符仍被原有加载器拒绝。
测试用私钥只在内存生成，测试 Worker 不属于可部署入口。

## 无账号的本机平台验证

将 Wrangler4.148.0 安装在仓库之外的隔离工具目录。仓库依赖与 lockfile 不变。
以本机实际目录为例：

```powershell
$env:WRANGLER_SEND_METRICS='false'
$env:WORLD_CLOUDFLARE_TOOL_ROOT='D:/dev/node/isolated/world-cloudflare-tools'
$wranglerTool=Join-Path $env:WORLD_CLOUDFLARE_TOOL_ROOT 'node_modules/.bin/wrangler.cmd'
& $wranglerTool deploy --dry-run --env staging --config config/cloudflare/world-runtime-executor.wrangler.jsonc --outdir D:/projects/econmind-os-world-simulation/artifacts/world-runtime-environment-2026-10-09/executor
& $wranglerTool deploy --dry-run --env staging --config config/cloudflare/world-runtime-api.wrangler.jsonc --outdir D:/projects/econmind-os-world-simulation/artifacts/world-runtime-environment-2026-10-09/api
node scripts/check-cloudflare-runtime-local.mjs
```

脚本实际启动 workerd，测试两个服务和专用 TEST_ONLY 验签载体，结束时调用
`dispose()`。不会登录、创建云资源或访问生产数据库。平台绑定类型由 Wrangler
生成后执行 strict checkJs，具体可复现命令在 CI 工作流中。

## 后续发布和接入的负责人动作

本次源码和证据已绑定不可变 commit 的 P0 独立审查。账号负责人已先发布 HOLD
executor，再发布 HOLD API；版本分别为 `69f347ce-ee0e-45a2-97cf-84e4fe7984bb`
和 `dc5c245d-efc2-4905-a47d-4e7a75ea0902`。实际健康、503就绪、内部绑定、CORS、
请求体上限及拒绝路径检查通过；两个服务的 preview URL 均关闭，executor 没有
公共 workers.dev 路由。同伴只提交代码，不承担账号操作。后续改动须重新完成
相应检查和审查；本次批准不覆盖整个 PR124 的历史合并 delta。
Workers Free 由用户确认；配置没有付费资源、cron、Queue 或数据库绑定。请求受
平台免费套餐限制，不作无限可用承诺。

数据库连接不是部署两个 HOLD 服务就能完成的事情。主仓库发布链提供已批准的
schema/roles 和连接配置后，才能另行审查经济 composition、真实用户身份及席位、
opening admission、独占 lease、故障恢复和手动生命周期联调。当前入口没有可通过
环境变量打开的激活开关。正式接入、正式开局与启动 Clock 均须遵守现有 gate。

平台依据：[Workers Node HTTP](https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/)、
[Node crypto](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/)、
[Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)。
