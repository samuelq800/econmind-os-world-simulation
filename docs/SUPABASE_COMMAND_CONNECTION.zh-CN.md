# Supabase 与经济命令连接交接（2026-10-09）

本轮回应“正式 Supabase 连接”和“经济命令执行链路接入”。交付分支为
`codex/world-seed-delivery`，PR124 仍是 draft。已同步 PR125/126 的主线接口，
增加 Cloudflare PostgreSQL 传输适配及真实 workerd/native PostgreSQL 闭环测试。
当前不宣称生产连接或经济启用；完整验证结果见配套证据报告。

本轮证据：[实施报告](reports/world-connection/CLOUDFLARE_POSTGRES_CONNECTION_2026_10_09.md)、
[机器证据](reports/world-connection/CLOUDFLARE_POSTGRES_CONNECTION_EVIDENCE_2026_10_09.json)。

源码候选 `35dee047` 的传输与隔离机制范围已获独立批准，完整检查主套件
3072 PASS/154 条件SKIP/0 FAIL；两套 native/workerd 数据库闭环各1 PASS/0 SKIP。
[独立审查](reports/world-connection/CLOUDFLARE_POSTGRES_INDEPENDENT_REVIEW_2026_10_09.md)
不批准整个 PR124、正式数据库接入、开局或 gate。

## 现在可用的工程入口

- `apps/world-api/src/runtime-preparation/cloudflare-postgres-pools.ts`：在单次
  Worker 请求内从服务器持有的 Hyperdrive 连接值创建真正 pg Pools，分别用于
  reader/intake。保留池对象身份、连接上限及现有事务/权限检查；结束时等待关闭。
  不查找环境密码、不接受浏览器连接配置、不重试事务、不创建账号或执行开局。
- `apps/world-api/src/runtime-preparation/cloudflare-jwks-verifier.ts`：新增
  `createCloudflareJwksFetch`，向原 read/financial/Office 工厂提供同一个兼容
  Workers 的 JWKS fetch；原验签、固定项目/issuer/URL、claims 和拒绝规则保留。
- `apps/world-api/src/integration/nonactivated-runtime-api-host.ts`：PR125 已
  合并的四条精确路径组合。需真实 server-owned World/seed/admission/auth/pool/
  clock 配置；不会因 URL 或 JSON READY 声明获得 private runtime 身份。
- `tests/integration/cloudflare-postgres-command-roundtrip.test.ts`：新增显式
  opt-in 测试。真正 workerd 使用本地 Hyperdrive 传输连接一次性 PostgreSQL，
  执行 JWT/当前席位→注册/审批/入队→Worker Reserve/Ship/Deliver→持久 FINAL→
  授权回读与撤权拒绝。复用 Core 和既有 SQL 实现，不用成功回调替代结算。

测试配置 `tests/support/cloudflare-postgres-test.wrangler.jsonc` 的三个数字 ID
是 TEST_ONLY 本地类型生成标记，不是正式 Hyperdrive ID。已签入的测试 main 默认
拒绝请求；动态正向载体仅由测试生成。任何测试配置/载体都不得用于云端部署。

## 正式接入还缺什么

用户确认只有现有共用 Supabase 数据库，预计尚无 World 运行连接配置。
目标是 `vimksjrhaxdpnkvgsavz`。Cloudflare 账号 Hyperdrive 实际列表为空。
存在数据库不证明 schema、运行账号、准入或消费宿主已具备。

| 依赖           | 当前事实                                                                                                                  | 由谁/哪条链提供                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 运行账号与连接 | 未提供 reader/intake/executor 的最小权限 PostgreSQL 登录及连接值                                                          | 数据库/发布负责人，经已有主仓库发布链审查；凭据放受控 Secret/Hyperdrive，不能进仓库或 VITE |
| schema 发布    | 0023 有固定源码策略，但正式 caller 未登记；没有本轮生产读回                                                               | `econmind-os` 唯一 schema publisher，固定对象/锁/确认、真实 readback 和 UNKNOWN 停止       |
| 席位/准入结构  | `database/proposals/runtime-read-binding-storage.sql` 未登记到 manifest；正式 ADMITTED publisher 缺失，触发器明确拒绝发布 | 源码实现、独审和唯一迁移发布链；不能直接执行提案 SQL 或禁用生产触发器                      |
| 正式开局       | PR125 的真实 bundle 预检仍阻断；LC/FX/完整 CB producer 契约与生产实现缺失                                                 | 权威数据和经济决策负责人提供完整来源契约，再实现/审查生产 bridge；未知值不能补零           |
| 正式执行宿主   | 当前 consumer 仍 local/CI only；Office private runtime 要求同一真实 pool/clock/World 引用                                 | 独审后的正式宿主组合；服务绑定存活不是执行授权，不能删守卫或伪造 READY                     |
| 正式验收       | Gate B / V09 runtime evidence pending，正式 World/seed/admission/current seats 未建立                                     | 现有治理记录与合法发布流程；本测试不推进 gate                                              |

不能把这一表压缩成“只差一个密码”。即使收到连接值，仍须先按正式发布链核实
实际结构/权限，再接入经过准入的 World 和合法席位，最后验证真实命令、独占 lease、
恢复及授权读。当前 HOLD API/executor 部署保持原版本，未换成测试载体。

## 同伴如何同步和修改

只同步 main 可取得 PR125/126；本轮和 HOLD 托管交付尚在 PR124 分支。取得交付
分支时执行普通 fetch/switch/pull；已有未提交修改应先保存，不能 reset 丢弃。

```powershell
git fetch origin
git switch --track origin/codex/world-seed-delivery
pnpm install --frozen-lockfile
pnpm --filter @econmind/core build
pnpm --filter @econmind/world-worker build
pnpm --filter @econmind/world-api build
pnpm exec vitest run tests/world-api/cloudflare-postgres-pools.test.ts tests/world-api/cloudflare-jwks-verifier.test.ts
```

已经有本地分支时使用 `git switch codex/world-seed-delivery` 和 `git pull --ff-only`。
Node24.20.0/pnpm12.3.4、锁文件保持固定。Cloudflare CLI 在仓库外的隔离工具目录。
同伴可以修改源码、补测试、发 PR，完全不需要 Cloudflare 账号或生产数据库密码。

新增 native/workerd 闭环复用现有 macOS 一次性 PG fixture，由
`.github/workflows/cloudflare-runtime-environment.yml` 自动执行。Windows 不运行该
macOS 专属 fixture，也不把跳过测试称为成功。CI 分开运行完整 `pnpm check` 与
原 native 闭环，以及 Workers 类型生成、strict typecheck 和新 workerd 闭环。
没有生产凭据或部署步骤。

该机制测试使用合成双国数据和 TEST_ONLY 当前席位/准入；准入提案触发器只在
已拥有的一次性数据库内按原 fixture 临时覆盖并立即恢复。自动 Ship/Deliver
也由原 TEST_ONLY 调度端写入。它们均不代表正式 source、任职、admission、调度器
或 Gate B；本地 Hyperdrive 不证明云端 TLS、cache 配置、免费 CPU 预算或生产权限。

## 账号负责人后续部署

准备并审查真实最小权限连接；注册 Hyperdrive 时关闭查询缓存，避免复用过期
授权、head 或 receipt；配置实际 binding ID；通过唯一发布链获得 schema/准入
回执后再组合正式 host。整个过程不得把服务启动变成自动开局/跑 Clock。

Cloudflare [Hyperdrive Free 说明](https://developers.cloudflare.com/hyperdrive/platform/pricing/)
确认免费套餐可用；免费额度内限制必须在真实部署负载下验证。
驱动依据：[Cloudflare pg 接入](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/node-postgres/)。
