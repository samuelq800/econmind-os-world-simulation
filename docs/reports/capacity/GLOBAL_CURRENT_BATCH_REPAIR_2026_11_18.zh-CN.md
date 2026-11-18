# 多国当前页共享重放修复

2026-11-18，Asia/Shanghai。分支 `codex/office-next-connections-20261108`。多国批量候选 `723a0e89ea2bb807c867e61998a3b6bef1315bd4`；后续预算摘要复用候选 `1ea20e879cd012ae77561f33dcc274ad9a2eb74e`。

## 状态与范围

**结论：本轮容量验收仍未通过，不推送、不合并。先不因本次结果购买服务器；应先减少随命令历史增长的重复重放，再用相同门槛复测。当前配额不能据此承诺 100 人正式使用。** 功能回归和权限/一致性检查通过不等于容量通过，也没有证据表明已出现错误经济写入。

`IMPLEMENTED_UNVERIFIED`，有效风险 P0（来源、重放及数据库派生发布边界）。独立审查待完成；未授予 VERIFIED、owner approval 或 merge，也未推进 R2 gate。`status/progress.json` 的 V09 前置条件不因本次维护改变。

前一候选的一分钟通过、五分钟失败，详见[前轮报告](REPLAY_BATCH_ADMISSION_REPAIR_2026_11_18.zh-CN.md)。本轮只合并注册范围内的重复发布工作，不改变经济规则、命令/回执、结算金额、WorldClock 或浏览器实现。

- 同一次 RR/source-revocation-fence 保护下，逐国锁定并核对真实 source pins；同一份全局完整历史只交给 Core 重放一次。每页仍读取各选定国家的 Captain 原始数据，保留缺失、撤销、历史原件及冲突拒绝。
- 为每国签发绑定同一 executor 的短期派生 DATA token，共享同一个完整 Core 结果。所有 token 及 page proof 在 callback 结束或失败后失效，不跨请求留存，也不成为授权或另一份 World State。
- 注册 post-commit / derived-only retry 在一次 publisher 事务内发布多国页面。新增 SQL 入口自行完整重建一次全局 prefix；每国仍锁定当前来源、执行原有五类 mapper 的 coverage、状态、head、原件和撤销检查。某国失败则本次派生事务整体回滚，已提交 FINAL 不变。
- 保留原单国入口、未注册 legacy 路径和显式逐国重建接口。提取共用 mapper/readback，删除已不可达的逐国 Industry 合并分支。Trade 对手方即使不在常规注册列表中，仍按原逻辑纳入已验证的有限发布范围。
- 新增前向 proposal `postwar-current-countries-bundle.sql`，仅在已有完整开局 profile 中追加。没有改历史 SQL、现有类型/私有 mapper、表、角色或 membership；新入口归原 projection owner，撤销 PUBLIC 执行权，只另授原 publisher。生产 Supabase未访问或变更，正式发布仍须原受控链与 P0 审查。
- 后续 measured repair：预算组三个事件原先重复计算相同的 before/after DATA 摘要，下一帧又重新计算上一帧的 after。Core 在单次重放内按确切冻结状态对象复用摘要；SQL 在单页 fold 内按完整 JSONB 相等复用相邻状态摘要。逐事件的 canonical、指纹、before/after 比对、授权、金额和所有其他命令族处理保持。没有跨请求缓存、信任标记、新表或新服务。SQL 使用前向 `postwar-budget-frame-state-hash-once.sql`，保留原函数 OID、owner、私有执行权限及 search_path。

## 实际验证

Windows Node 24.20.0 / pnpm 12.3.4，冻结依赖；Linux 同版本工具链单独安装在有资源限制的一次性容器中。

| 检查          | 实际命令                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 结果                                                              |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 相关回归      | `pnpm exec vitest run tests/world-core/postwar-current-countries-snapshot.test.ts tests/world-core/postwar-office-publication-controller.test.ts tests/world-core/postwar-current-publication-head-cutoff.test.ts tests/world-core/postwar-complete-opening-inventory-repair.test.ts tests/world-core/postwar-paged-current-proof.test.ts tests/world-core/postwar-paged-office-history-originals.test.ts tests/world-core/postwar-schema-delta.test.ts` | exit 0，71 项 PASS                                                |
| 接线兼容      | `pnpm exec vitest run tests/world-core/postwar-office-publication-binding.test.ts tests/world-core/postwar-industry-runtime-connection.test.ts`                                                                                                                                                                                                                                                                                                          | exit 0，7 项 PASS                                                 |
| 类型          | `pnpm typecheck`                                                                                                                                                                                                                                                                                                                                                                                                                                         | exit 0，PASS                                                      |
| 构建          | `pnpm build`                                                                                                                                                                                                                                                                                                                                                                                                                                             | exit 0，PASS；原有 CSS、node:util external 和 chunk size 警告仍在 |
| 边界          | `pnpm test:boundaries`                                                                                                                                                                                                                                                                                                                                                                                                                                   | exit 0，46 项及两个脚本 PASS                                      |
| 迁移          | `node scripts/validate-migrations.mjs`                                                                                                                                                                                                                                                                                                                                                                                                                   | exit 0，23 项 PASS；最终 proposal 清单另由 SQL 回归核对为 90      |
| 环境          | `ECONMIND_ENV=local node scripts/assert-safe-environment.mjs`                                                                                                                                                                                                                                                                                                                                                                                            | exit 0，PASS，无数据库配置、禁止生产变更                          |
| 秘密          | `pnpm secrets:check`                                                                                                                                                                                                                                                                                                                                                                                                                                     | exit 0，初版 4017、实现后 4019、含报告收尾 4020 文件 PASS         |
| 格式/静态检查 | 改动 JS/TS 的 `pnpm exec prettier --check`、`pnpm exec eslint`；`git diff --check`                                                                                                                                                                                                                                                                                                                                                                       | exit 0，PASS                                                      |
| Linux 编译    | 隔离容器中 `pnpm install --frozen-lockfile`、`pnpm pretest`                                                                                                                                                                                                                                                                                                                                                                                              | exit 0，PASS                                                      |

首次提取共用 readback 时类型检查发现局部 countryId 引用未迁移，已改为 held facts 的 countryId。首轮旧协议替身未适配新批量方法和完整 facts，62 项中 11 项失败；适配协议形状并隔离 per-test mock 后，上述最终命令通过，原撤销、跨 head、后续国家失败及 durable FINAL 不变的断言均保留，没有 skip 或降低门槛。

新增 source/publisher 测试是生命周期与编排协议证据：一次事务、一次重放、逐国 source 检查、共享结果、不同 executor 拒绝、callback 结束失效、第二国失败不得 COMMIT。协议替身不能证明真实 Core 或 SQL 准入；实际完整来源及 SQL/HTTP 验收另列。

预算摘要修复后：九个相关回归文件 69 项 PASS（exit 0），覆盖 Budget、mixed prefix、分页续接、utility、Captain、rent 和真实 PGlite 完整安装；类型、完整构建、边界 46 项及两个脚本、改动文件 eslint/prettier、迁移、秘密、环境均 exit 0。新增负例在兄弟事件重新签入错误 stateAfterHash，仍拒绝；实际两帧 replay 的三个状态各计算一次摘要。SQL 安装后只归一化本次明确允许的局部摘要复用变更，函数体须与此前最新完整 reducer 完全相同，防止覆盖 Trade/Industry 等既有前向修复。

隔离 PostgreSQL 的 H93/E277 上，先确认旧函数体等于仓库完整 predecessor，再通过正式 publisher 批量入口发布相同 genuine Core assertions，前后均回滚；应用新 proposal 后再次发布，32 行结果逐行一致，OID/owner/私有 ACL 不变，PASS。首次诊断误调用私有 prefix 被 42501 拒绝，改走正式入口；SQL 首次生成因紧邻 `or` 的变量少括号出现语法错误，事务未应用，补括号后通过上述真实数据库与 PGlite 检查。没有扩大权限或绕过断言。

## 原生复测

旧临时源文件现已不在。使用仓库现有离线 producer 从 2026-10-29 的固定输入重建父开局，再生成 child candidate。父指纹 `sha256:cfc55796562b44bd616f33082cbbafd9dbd43d58733a24ac550339cbc8376274`、文件 SHA256 `ee2f777126e9050ce7139e2d9d9e24d2ec7305de95b8380d3e4c35fc4edb314f`；子指纹 `sha256:cd6cd0825fd8b15c13dab28f030e2df24b804d5675e132ff77715a20ec67056a`、文件 SHA256 `835f9ec096746e3bc8f8cd1a7235fc7a2af0daee06d4ceeedff1fdff99d0262f`；70 份 receipts 文件 SHA256 `7d37e721da1021b290d8a1464e4fec096046efe623c2a5d12ee719a28fba5ae6`，均与上一轮一致。

离线 child 使用现有 `--candidate-only`，不把它记为 full validation；后续原生 fixture 仍执行完整 genuine 来源准入。没有用指纹匹配替代 Core 检查，没有从 JSON 恢复私有 capability。源生成进程以隐藏窗口和低优先级运行，Docker 不操作桌面应用。

测试配额保持应用 2 CPU / 6GiB、PG16 1 CPU / 3GiB、角色池上限 2。H0 离线准备阶段暂用 PG 2 CPU/两条 publisher 事务，在线前恢复 1 CPU。两国真实 JWT 身份、100 个轮询标签、20 读/秒、20 条新预算行/分钟，先 60 秒门槛，再 300 秒；读取 Finance/Social/Industry 当前页。每笔 1 LC、唯一命令/幂等键，所有实际接受命令核对 COMMITTED 和 32 份派生文档。

阶段记录实际提交时刻，超出注入窗口的新提交不计入目标写速率；窗口尾部仍允许原有 30 秒排空。零错误、全部读写目标、P95 ≤ 2000ms、P99 ≤ 5000ms 必须同时满足；连续三次读错误停止。仍不能把两个身份/轮询编号视为 100 独立用户，也不涵盖全部 Office 命令、真实 WorldClock、公网/远程数据库 RTT 或长跑。

| 候选/阶段                  | 实际读取/目标 | 窗口内写入/目标 | 读错误 | P95 / P99 ms      | 结果                       |
| -------------------------- | ------------- | --------------- | ------ | ----------------- | -------------------------- |
| 723a0e89 / 60 秒           | 1200 / 1200   | 20 / 20         | 0      | 553.45 / 644.93   | PASS                       |
| 723a0e89 / 300 秒          | 6000 / 6000   | 72 / 100        | 0      | 2544.86 / 3517.07 | FAIL                       |
| 1ea20e87 / 60 秒，H93 继续 | 1200 / 1200   | 11 / 20         | 0      | 2633.60 / 3174.73 | FAIL                       |
| 1ea20e87 / 300 秒          | NOT_RUN       | NOT_RUN         | —      | —                 | 一分钟失败后按既定门槛停止 |

批量版已把 SQL 完整 prefix 从每次写入两次降到一次，Worker 借池降到每写 24 次，但未达五分钟目标；300 秒 Node CPU 199740.964ms，SQL canonical_json 12502116 次，自耗时 45924.023ms，支持继续削除确切重复摘要的定位。失败不能用零 HTTP 错误或已完成命令全部 COMMITTED 替代。后续候选在同一真实历史 H93 继续，不回退或清空世界。

最终一分钟 elapsed 61720.995ms，历史增长至 H104/E310。不同候选的阶段起始历史不同，不能用两行延迟直接计算优化增益或宣称退化由本次修改导致；但较大历史下目标不满足已经成立。11 笔实际写入都 COMMITTED、32 文档发布成功，writeError=null。收尾真实 SQL 检查 8 项 PASS：私有 helper/批量入口 ACL、相同 head 双国真实重建、第二国 Financial/Social/Captain/Trade/Industry 五种错误 coverage 均 23514 拒绝、全部回滚后世界计数不变。最终 104 命令/104 回执/310 事件、0 financial batches、0 inventory postings，未完成队列 0。

## 剩余定位与最短后续路线

最终一分钟 Node CPU 45774.490ms；真实读池 2280 次借用，等待 P95 469.73ms，SQL `read_postwar_office_projection_seats` 5939 次、`postwar_projection_admission_header` 6577 次。写入 ack 约 0.99–1.32 秒、实际观察 FINAL 约 3.22–3.91 秒、完成派生发布约 5.26–6.09 秒。这些是现有阶段采样，不是额外压测或 CPU 火焰图，不能把全部 CPU 成本归因于某一个函数。

源码确认预算 `candidate.prepare` 与 `commitGuard.assertCurrentFrom` 各调用 `sourceFrom`；capacity 分支各从真实分页历史重放，提交后当前页发布再重放。安全边界需要当前来源及提交时校验，但目前调用安排重复支付了历史成本。下一步优先评估将候选生成和提交前比较放入同一受保护提交事务、共享那次 genuine replay；保留 head、来源、撤销和 writer fence，不能把上个请求的授权或未检查的缓存作为当前证明。同步检查单次读取 SQL 内部重复座位/来源查询；不要靠加重试、扩大读池或增加 Redis 掩盖增长。

后续只保留该事务边界/拒绝回归及既有一致性检查，真实负载仍先一分钟，失败即停，通过才五分钟。先解决这个已测瓶颈；暂无充分依据给出必须购买的服务器规格，也不能承诺换机即可达到 100 人目标。

第一次原生启动在完整数据证明后，因指定的离线 PG 镜像缺失（`--pull never`）终止，未创建运行 World，记为 `ERROR_BEFORE_LOAD` / 压测 `NOT_RUN`。随后拉取原固定 digest，增加启动前 image inspect 后重启成功；不能把这一基础设施错误算作容量测试失败。

实现已本地提交至 `1ea20e87`，按用户“通过后推送”的条件未推送；GitHub PR #199 仍是草稿，远端 head `6ef840af8f296d6b6f359d56462a3e1b063550ea`，base main `9d060114`，未合并。P0 独立审查仍待完成。没有新增或确认废弃分支；当前本地/远端分支保留，旧 #201 分支已按此前明确选择在本地和远端删除，六份既有 LOG_USAGE 治理报告不改动。

原生 fixture 已删除测试 PostgreSQL 容器与数据卷，外部 Docker 清单确认不再存在。核对 task label、完整容器 ID 和卷挂载后，删除本轮 app 容器、work 卷、匿名卷、两项本轮下载的镜像；五个用户原有停止容器及四个用户卷保留，原有 app 基础镜像保留。Docker Desktop stop exit 0，恢复测试前关闭状态。所有原始命令、采样、失败及修复记录保留在同名 evidence.json，必要的产品回归测试保留。

**清理未完全完成：**自动审批检查拒绝递归删除本轮 `D:\data\temp\econmind-global-publication-20261118`，理由为 `blocked by policy`；验证与删除同一命令整体未执行，未改用其他工具绕过。目录内临时种子、离线源数据及压测脚本仍在，需要用户手动删除。该拒绝不是文件已删除的证明，报告不宣称完全清理。
