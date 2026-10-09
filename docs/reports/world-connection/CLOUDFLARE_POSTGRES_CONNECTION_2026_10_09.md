# Cloudflare PostgreSQL 与经济命令连接实施报告

## 状态和范围

按 `templates/IMPLEMENTATION_REPORT.md` 记录。正式接入任务为
`IMPLEMENTED_UNVERIFIED`：隔离机制实现已完成，生产前置条件仍阻断。
风险 P0，触及认证、数据库传输及权威执行集成。实施源码候选
`35dee047d8e4db822bdc60c93f80d925e11429e4`，tree
`adff3040693836d7bd1f4c7f1c8aaddc81b88fd3`；基线为合入 PR125/126 的
`95ca908`。独立审查已批准此基线至候选的传输适配与隔离机制范围，记录于
`CLOUDFLARE_POSTGRES_INDEPENDENT_REVIEW_2026_10_09.md`，无未解决 blocker/major。
该范围为 VERIFIED；正式接入仍 BLOCKED，本任务不宣称生产完成。

`status/progress.json` 的 V09.1、正式拓扑、准入和开局状态不变；本报告不批准
ADR 或整个 PR124 合并。既有 HOLD 发布的独立批准只覆盖原 HOLD 源码。

## 实现和归属

- API 增加请求内真实 pg Pool 工厂，reader/intake 分离，max=2，保留原对象
  身份。成功返回前等待两池关闭；连接/清理不确定时拒绝成功应答，不重试事务。
- 共用 JWKS fetch 保留 manual redirect、原验签及固定 issuer/project/claims。
- TEST_ONLY workerd 使用本地 Hyperdrive 连接拥有的一次性 PostgreSQL，复用
  原认证、持久席位、注册/签署/审批/入队和 Core/Worker 权威执行逻辑。
- Worker Reserve/Ship/Deliver 产生事件、账本、worldVersion 和 FINAL；API
  仅查询已授权派生结果。测试断言版本 1→2→3、重复入队单命令、空闲重消费、
  买方 2 GCU/卖方 8 GCU/买方库存 2 tonne，以及撤权后拒绝两条读路径。
- 测试 Worker 回执时间使用原 `toCanonicalValue()` 字符串，不使用 BigInt
  全局 JSON 替换或浮点数。内存领域对象及经济算法保持原有精确语义。

新增配置只供 TEST_ONLY 类型生成/本地打包。其 ID 不是云端资源，默认 main
拒绝执行；测试动态载体、合成开局和临时准入覆盖均不得用于正式发布。

## 安全和兼容

没有生产 SQL、迁移、账号/授权、seed、lease、Clock 或经济执行。共享 Supabase
`vimksjrhaxdpnkvgsavz` 仍由 `econmind-os` 唯一迁移链管理。
现有 local/CI consumer 守卫、事务与 UNKNOWN 处理、浏览器导入边界均保留。
同伴源码测试无需 Cloudflare 凭据；账号负责人只在正式前置条件满足后部署。

机制数据库是 macOS CI 上拥有的 loopback PostgreSQL18.6，使用原 fixture 的
trust 认证和 TEST_ONLY password 标记。本地 Hyperdrive 不证明云端 TLS、缓存
关闭、生产角色、真实用户席位或 Workers Free CPU/查询负载适配。测试 projection
仍由原 Node fixture 发布，自动 Ship/Deliver 仍由 TEST_ONLY 调度端写入，不能
据此声称已实现正式 projection producer 或自动经济调度器。

## 实际验证

新候选 CI：<https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/37919982783>。
真实 checkout `2cc7cb3d89835427fde244d0a4cbc2e72170d05c` 的 tree 经 GitHub
Git commit API 核实与候选完全相同。

| 验证                                                                 | 实际结果                                                                              |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 本机 strict fixture types / API typecheck / scoped ESLint / Prettier | exit0 PASS                                                                            |
| 本机 pool/JWKS 控制                                                  | exit0，15 PASS/0 FAIL                                                                 |
| 本机原 JWT/Office/HOLD/权限/边界回归                                 | exit0，208 PASS/0 FAIL/0 SKIP                                                         |
| 本机 boundaries / authoritative patterns / secrets / local env       | exit0 PASS，313/308/2314 文件；无数据库配置                                           |
| CI workerd-native-postgres job113785320613                           | SUCCESS，实际 mechanism 1 PASS/0 FAIL/0 SKIP，pool8 PASS                              |
| CI workerd job113785320293                                           | SUCCESS，原 workerd11 和聚焦208，通过 strict/bundle/boundary                          |
| CI official-and-native-postgres job113785320656                      | SUCCESS；主套件3072 PASS/154 SKIP/0 FAIL，Edge29、boundary40；原生PG闭环1 PASS/0 SKIP |

Node24.20.0、pnpm12.3.4、冻结锁文件；Wrangler4.148.0 安装在仓库外隔离工具目录。
Windows 未运行 macOS 专属 native fixture；普通套件中的 opt-in SKIP 不算数据库证据。

本轮保留三个失败候选及修复历史：f514 的 JSONC trailing comma 解析失败；821d
的 Miniflare local Hyperdrive 缺 password；2caa 的 raw receipt.simTime BigInt JSON
失败。最后修复仅转换已知回执时间并增加实际字符串断言；没有删除/跳过测试。
源文件、CI artifact、哈希和命令详情见配套 `CLOUDFLARE_POSTGRES_CONNECTION_EVIDENCE_2026_10_09.json`。

线上只读复查 `/healthz`200、`/readyz`503，仍为 HOLD/ALIVE_HOLD，DB、模拟、
Clock、权威命令均 false。本轮没有改变此前 API/executor 发布版本。

## 未完成工作和下一步

正式连接值及最小权限运行账号缺失；0023 正式发布 caller 未注册；runtime-read
schema 提案与正式 ADMITTED publisher 未注册；LC/FX/完整央行 producer 契约和
实现缺失；正式消费宿主仍未批准；Gate B/V09 runtime evidence pending。
这些不能用测试席位、准入覆盖、合成数据、删除 guard 或直接执行提案 SQL 解决。

数据库/发布负责人先经唯一发布链提供已审查对象、最小权限运行连接及读回；数据/
经济负责人补来源契约和规则；之后经正式 host 审查、准入和 gate 验收再部署。
完整操作说明见 `docs/SUPABASE_COMMAND_CONNECTION.zh-CN.md`。
