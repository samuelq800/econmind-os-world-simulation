# 重放批处理与准入单次读取修复

**结论：一分钟门槛通过，五分钟持续负载失败，尚不能确认支持约 100 人在线。暂缓为此采购或扩容服务器；先处理随历史增长的整段重放成本。修复已在本地提交，未推送、未合并、未发布生产。**

2026-11-17 至 18，Asia/Shanghai。分支 `codex/office-next-connections-20261108`。批处理/SQL 提交 `957df01b`，账本游标 `a0cee5e8`，同一内容检查复用 `dcc48a8f`，去除未使用对账哈希 `6ca8323b`，共享派生发布快照 `00a9798a`，有限阶梯重试 `770c1720`，每国一次 SQL 前缀核验 `16655bf3`，修正完整库存适配的最终候选 `0c97db21d7f6549d2ffdc9bd1a4e7db6af399940`。

## 状态与范围

`IMPLEMENTED_UNVERIFIED`，有效风险 P0（Core 财务重放、数据库读取授权边界），独立审查待完成。没有授予 VERIFIED、owner approval、merge 或推进 `status/progress.json` 的 R2 gate。维护现有实现，不开始新的工作包。

修复依据是[持续写入定位报告](CURRENT_READ_WRITE_LOCALIZATION_2026_11_17.zh-CN.md)：同一账本反复聚合和扫描，以及一个席位查询按能力行重复执行相同准入头。保留[按需加载修复](SOCIAL_ON_DEMAND_CAPACITY_RETEST_2026_11_17.zh-CN.md)。

- Core 在一次批量计算中建立账户、余额、所有者及实际入账索引。批量同步每份真实 receipt/state 一次，消除先检查所有 origin、随后同步时再次聚合的重复工作。索引不跨请求或事务保留，不存储另一份权威余额。
- 对 genuine Core 账户的固定八个字段作精确比较，替代反复 canonical serialization。原始债权不能共存、非法账户、负余额、银行镜像、H0 总额和当前总额约束仍执行。
- 如果账本没有任何实际租金批次，未记录租金批次检查不再逐租约计算哈希；有任何租金批次时仍执行原有逐期精确匹配。已付记录的实际批次指纹、真实 receipt/state、同 world 与非回退 head 检查均保留。
- 新增前向 SQL `postwar-office-seat-admission-once.sql`，在同一 SQL/快照中用 MATERIALIZED CTE 读取一次准入头，再连接能力/席位。保留所有角色、能力一致性、席位、entitlement、撤销和 world head 判断；没有新授权、表或缓存。
- 新 SQL 追加在现有 loader 的当前完整开局选择之后。历史默认方案及既有 SQL 制品、迁移 ID、哈希不变。已安装环境须通过原受控发布链显式应用该新补丁；本轮只在一次性测试数据库安装，没有生产发布。
- 修正同组 SQL 打包测试的 Windows 路径转换：使用 `fileURLToPath`，避免 `URL.pathname` 产生 `D:\D:\...`。没有修改其拒绝执行/路径断言。
- 首次原生对照仍失败后，继续修复完整 fold 中未变化账本的重复传输解析。私有游标函数只接收已完成 canonical Command/FINAL/posting 规约的实际 transition，核对 genuine 账本、同 world 及 before/after head；只推进已验证的账本游标，复用不可变账户、余额、库存条目与已入账批次。仍经原 authority 注册，财务仍继承实际 deposit instrument 绑定。没有新增外部可调用的无效果 flag、任意版本重置或快照授权接口。
- 后续对照暴露仍在逐帧重复聚合未变化债权，因此沿 genuine rent state 记录其最近已核对的不可变账本引用。只有同一个 genuine receipt、同一组 `accounts`、`positions`、`appliedBatches` 对象，才复用该次检查；任何 posting/rebuild 改变引用后执行原有完整检查。WeakMap 随 state 释放，不存另一份余额、当前授权或 World head，不接受调用者提供的已验证 flag。每次仍检查 genuine 账本/rights、同 world 与非回退版本，来源锁、实际帧、FINAL 与 posting 规约不变。
- 三处只判断 paired lineage 的调用不再计算并丢弃完整 reconciliation 报告；改用原私有工厂实例集合的断言。真实 `reconcileV08LedgerSnapshots` 仍生成原哈希和对比结果，快照不匹配仍拒绝。原 public 准备函数的 hash 回调参数保留兼容，但没有对账报告请求时不调用它。
- 注册范围内的 post-commit / retryCommitted 发布，把 Industry 的派生和 SQL 发布并入 Office 已持有的同一完整 Core 快照及同一 publisher 事务。实际 Industry/source/head 检查和 SQL 函数仍执行；Industry 失败时同一国家的 Office 派生页也不提交。每国由两份重放减少为一份，没有跨请求缓存或扩大池、超时、重试预算。未注册 legacy controller 和显式重建接口保持原路径。
- 有限重试由原 `[500,1000,2000]` 毫秒退避调整为 `[500,500,750,750,750]`。最多六次读取、总等待 3250ms，低于原 3500ms；单次间隔不超过 750ms，以观察下一次 head 推进前的短发布窗口。每次仍重新授权并取得新快照，只对三种 NOT_PUBLISHED 重试，拒绝、过期、撤销与取消保持原语义。
- `16655bf3` 增加前向 `postwar-office-current-bundle.sql`：同一国家、同一 publisher 事务内仅执行一次 SQL 自行重建的完整 prefix，五类内部 mapper 复用这一局部变量。六个私有 helper 只授予 projection owner，publisher、reader、worker 均无直接执行权；外部 bundle 不接受 prefix、已验证标志或缓存。原各类覆盖、状态/行哈希、来源、撤销、当前 head、能力与角色检查保留；旧独立入口继续原样工作，没有改历史 proposal。完整开局 loader 显式追加新补丁，旧默认计划不变。没有新表、跨事务缓存或第二份状态。

权威数据仍归 Worker/Core，API 只鉴权和接线；浏览器无改动。命令、事件、回执、posting、Clock、幂等键、结算金额与规则不变。既有数据库对象 owner/ACL 保持不变；新增类型与六个内部函数只归 projection owner，新增 bundle 入口只另授原 publisher 执行权，没有新增角色或 membership。未接触生产 Supabase、服务密钥或其他仓库。

## 实际验证

Windows 本机 Node 24.20.0 / pnpm 12.3.4，使用冻结依赖。相关产品字节与实施提交一致。

| 检查                                                               | 实际命令                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | 退出码与结果                                                                              |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| 构建运行依赖                                                       | `pnpm pretest`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 0，PASS                                                                                   |
| 债权、混合重放、consumer/runtime、席位、历史修复绑定和完整库存 SQL | `pnpm exec vitest run tests/world-core/beneficial-housing-rent.test.ts tests/world-core/beneficial-housing-rent-mixed-replay.test.ts tests/world-core/postwar-beneficial-housing-rent-consumer.test.ts tests/world-core/postwar-beneficial-housing-rent-runtime.test.ts tests/world-core/postwar-office-projection-store.test.ts tests/world-core/postwar-schema-delta.test.ts tests/world-core/registered-current-read-repair-binding.test.ts tests/world-core/postwar-complete-opening-inventory-repair.test.ts` | 首次 exit 1；其余 47 项通过，SQL 打包组 26 项通过、4 项失败，见下一行修复后的结果，未忽略 |
| 修复后 SQL 打包组                                                  | `pnpm exec vitest run tests/world-core/postwar-schema-delta.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                               | 0，30 项 PASS；与上述其余 47 项合计 77 项                                                 |
| 改动文件 lint                                                      | `pnpm exec eslint packages/core/src/finance/beneficial-housing-rent.ts packages/core/src/commands/beneficial-housing-rent-mixed-replay.ts tests/world-core/beneficial-housing-rent.test.ts tests/world-core/postwar-office-projection-store.test.ts tests/world-core/postwar-schema-delta.test.ts tools/office-connection/registered-final-native-sql.mjs`                                                                                                                                                         | 0，PASS                                                                                   |
| 类型                                                               | `pnpm typecheck`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | 0，PASS                                                                                   |
| 边界与权威模式                                                     | `pnpm test:boundaries`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 0，46 项 PASS；两项脚本无违规                                                             |
| 密钥                                                               | `pnpm secrets:check`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | 0，4012 文件 PASS                                                                         |
| 环境                                                               | `ECONMIND_ENV=local node scripts/assert-safe-environment.mjs`（PowerShell 环境变量设置）                                                                                                                                                                                                                                                                                                                                                                                                                           | 0，PASS，未配置数据库、禁止生产变更                                                       |
| 迁移                                                               | `node scripts/validate-migrations.mjs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 0，23 项 PASS                                                                             |
| 构建                                                               | `pnpm build`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 0，PASS；保留原有浏览器 external、静态 CSS 和 chunk size 警告                             |
| 格式与补丁                                                         | 改动 JS/TS 文件 `pnpm exec prettier --check ...`；`git diff --check`                                                                                                                                                                                                                                                                                                                                                                                                                                               | 0，PASS                                                                                   |

新增回归核对批量与逐项结果、余额随真实租金入账变化、伪造 ledger/receipt/state 拒绝、实际未记录租金仍拒绝，以及 SQL 前后多能力席位、owner/ACL、其他 world 返回结果一致。现有授权、跨国、撤销与缺失席位回归继续针对新 SQL 执行。

后续游标修复另执行实际存在的 9 个相关文件、44 项测试，均 exit 0：`finance-budget-native-mixed-prefix.test.ts`、`finance-social-replay-continuation.test.ts`、`beneficial-housing-rent-mixed-replay.test.ts`、`postwar-paged-current-proof.test.ts`、`postwar-mixed-goods-omo-current-effects.test.ts`、`postwar-mixed-industry-utility-effects.test.ts`、`finance-industry-utilities-mixed-replay.test.ts`、`cb-finance-social-prepared-ledger.test.ts`、`captain-finance-social-prepared-ledger.test.ts`。包括 257 帧实际 Core 分页与独立完整重建的财务/库存 canonical equality、真实 FX/租金/OMO/Industry effects、遗漏与重排拒绝。因产品再次变更，重新执行 `pnpm pretest`、`pnpm typecheck`、`pnpm build`、该改动文件 lint/格式及 46 项边界与两个检查脚本，全部 exit 0。

检查复用修复后，运行债权单项、Budget/Rent 混合、分页 continuation、Budget 原生混合及 Industry utilities 混合五个文件，共 37 项，exit 0。回归中特别使用已经核对过的 rights state：伪造的 ledger 即使沿用完全相同数组也拒绝；真实租金 posting 改变账本后，未记录的 rent 仍被拒绝。该次 `pnpm pretest`、`pnpm typecheck`、`pnpm build`、两个改动文件 lint/格式、`pnpm test:boundaries`（46 项及两脚本）均 exit 0。

去除未使用哈希后，`opening-seed-reconciliation`、`v08-ledger-authority-boundary`、`finance-social-prepared-ledger`、`finance-social-replay-continuation`、`beneficial-housing-rent-mixed-replay`、`finance-industry-utilities-mixed-replay` 六组共 51 项通过。新回归要求 genuine paired 准备不调用未请求的 hash 回调、复制的 pair 拒绝、实际快照对账 MISMATCH 仍拒绝。首次 lint 报兼容参数未使用，增加明确的兼容参数读取后重新 lint exit 0；类型、构建、格式及 46 项边界检查均 exit 0。

2026-11-18 的合并发布改动运行 `postwar-office-publication-controller`、`postwar-current-publication-head-cutoff`、`postwar-office-publication-binding`、`postwar-captain-current-projection`、`postwar-industry-labour-current-contract` 五组共 54 项，exit 0。协议回归核对一次 source snapshot、一次 publisher transaction、同一个 tx/token 传入 Industry；错误 Industry head 或 SQL 异常均不能进入 COMMIT。协议替身不作为真实 SQL/source 准入证据，原生复测另行验证。该次 `pnpm pretest`、`pnpm typecheck`、`pnpm build`、四个改动文件 lint/格式、`pnpm test:boundaries`（46 项及两脚本）和 `git diff --check` 均 exit 0。

重试节奏回归复现了原退避探测点 0/500/1500/3500ms 跳过 1750–2750ms 可读窗口的情况。最终 `current-publication-read-retry`、`postwar-office-runtime-fetch-handler`、`postwar-mixed-current-readback-guards`、`postwar-industry-labour-current-readback` 四组 exit 0，16 项 PASS、8 项专门原生环境用例 NOT_RUN（未设置其独立开关，不算 PASS）。最终 API typecheck/build、两个改动文件 lint/格式、两个边界/权威模式脚本及 diff 检查 exit 0。没有因为改节奏重新跑未变的 Core 全矩阵。

SQL bundle 改动运行 `pnpm exec vitest run tests/world-core/postwar-current-publication-head-cutoff.test.ts tests/world-core/postwar-office-publication-controller.test.ts tests/world-core/postwar-office-publication-binding.test.ts tests/world-core/postwar-schema-delta.test.ts`，exit 0、64 项通过。保留实际 head 不匹配及 SQL 异常不得 COMMIT 的回归，固定 proposal 清单更新为 88。Worker typecheck、Windows/Linux Worker build、四个改动 JS/TS 文件 lint/格式、`pnpm test:boundaries`（46 项与两脚本）、迁移检查（23 项）、diff 均 exit 0。隔离 PG 实际安装 exit 0；目录权限读回确认六个内部函数仅 owner 可执行，bundle 仅另授 publisher，worker/reader 无权调用。完整原生复测另列，协议替身不算 SQL 权限证明。

## 原生定向复测

沿用实际 70 国来源、正式注册 Node/JWT/SQL/RLS 入口、应用 2 CPU / 6 GiB、PG16 1 CPU / 3 GiB、角色池 2、每秒 20 次读与每分钟 20 条实际预算命令。来源准入和准备不计入在线窗口；一分钟通过后才运行五分钟。测试为两个 JWT 身份与 100 个轮询编号的 offered load，不能称作 100 独立账户或严格最多 100 个在途请求验收。

第一候选 `957df01b` 的一分钟对照 **FAIL**：1200 次读，3 次 503（Social 1、Industry 2），P95 5777.55ms、P99 6960.03ms；20 条计划写入只实际完成 15 条，排空超过 30 秒，总长 97.50 秒。加上初始信封，共 16 条 COMMITTED、head=16/events=46、财务批次/库存 posting=0、真实未完成队列=0。实际命令均完成 32 份派生文档；没有把失败或未发送的五条记作成功。未执行五分钟，也未推送或合并这个候选。

新 SQL 已实际生效：准入头调用 6612 次、席位函数 5532 次，其他准入头调用还包括发布路径。与旧候选约每席位 18 次不同，现在每条席位 SQL 的 CTE 至多一次；未缓存跨请求授权。读池等待 P95 降至约 1093.78ms，但 Worker 仍借用 405 次，即每条混合写 27 次，累计持有 92.63 秒、query await 仅 3.92 秒；Node CPU 83.82 秒，事件循环 P99 838.34ms，仍存在重放计算瓶颈。本轮未启用旧诊断的 Inspector CPU profiler，不能把跨轮 CPU 数值作为严格 A/B 百分比。

第一轮固定测试入口退出时自动清理了它的测试 PG。后续重用同一 Linux 应用环境、下载件和已生成来源文件，只为新不可变候选重新初始化一次隔离 PG；来源不再重新生成，但保留入口要求的 genuine 完整准入。

第二候选 `a0cee5e8` 也 **FAIL**：按连续错误停止条件注入 584 次后结束（约 29 秒注入、含排空 30.77 秒），6 次 503，P95 1793.65ms、P99 3556.67ms，10 条混合命令完成。加上初始信封，head=11/events=31、11 条 COMMITTED、财务/库存 posting=0，每条完成 32 份派生文档。读池等待 P95 47.07ms、事件循环 P99 214.70ms，单写完成约 2–3.5 秒；仍有 Country 02 派生发布窗口错误，因此不因 P95 达到预算而判 PASS，也未运行五分钟。该环境保留在同一父进程内用于最后一项修理，旧 Node 已正常停止、池已排空。

`dcc48a8f` 从真实 H11 继续，也提前失败：237 次读、8 次 503，P95 1970.69ms、P99 3996.72ms，4 条写完成，总长 14.71 秒。随后一次约 12 秒的 CPU profile 采样（不是容量验收）中，非 idle 约 5063.91ms，被丢弃的 reconciliation 调用含子调用约占 26.41%；这些 inclusive 调用栈互相包含，不能相加。`6ca8323b` 去除该重复哈希后，短对照仍在 Country 02 派生窗口失败：99 次读、7 次 503、两条写完成，总长 8.60 秒。因此继续合并相同国家的 Office / Industry 快照，未把较低读池等待当作容量通过。

11 月 18 日恢复时 Docker 已关闭，旧父进程和其内存签名配置已丢失。已核验并清理旧的停止状态测试 PG 容器/卷，保留原始失败摘要。重用同一 Linux 工作卷、安装件、实际来源文件，重新运行固定 genuine 准入与隔离 PG 初始化；没有从 JSON 缓存伪造内存 capability。

`00a9798a` 的对照仍 **FAIL**：760 次读、5 次 Country 02 的 503，P95 1598.88ms、P99 3600.73ms；13 条混合写完成，head=14/events=40。读池等待 P95 20.36ms，源 Worker 借用由每写 27 次降至 25 次，publisher 事务由每写五次降至三次，每条仍实际发布 32 份文档。吞吐与平均等待改善，但仍存在 503；短窗口回归说明退避可能跳过可读窗口，后续真实统计还需继续区分发布耗时与探测时机。未执行五分钟。

曾用 `6881a44c` 的 250ms 高频探测作对照，1200 次读零错误、20 条写完成，但总长 91.35 秒、超出排空预算，P95 3721.84ms、P99 4670.59ms。读池借用 3938 次、等待 P95 356.34ms（包含非普通页流量，不能把全部借用都称作页面尝试），增加了数据库负载。该候选未通过，也未作为最终重试方案。最终候选改为上述有限阶梯，当前在真实 H34 状态继续复测，不重置既有回执或事件。

`770c1720` 从 H34 的短对照仍失败：119 次读取、12 次 Country 02 的 503，P95 3829.49ms、P99 3871.83ms；一条写完成，总长 7.30 秒，head=35/events=103。该命令实际 COMMITTED、32 份文档 PUBLISHED，`writeError` 为空，写入及派生完成共 6535.81ms，不能归因为命令失败。SQL 函数统计显示该单写执行完整 prefix 十次，canonical_json 递归调用约 59.8 万次、self time 2348.23ms，publisher 持有约 4208.28ms。可见前述调节探测只能缓解短窗口，不能消除发布的重复工作，因此继续实施每国一次的 bundle。新补丁实际安装到同一隔离 PG，作为单独的前向 DDL 收据记录，不声称它已经存在于最初冻结的安装计划中。

`16655bf3` 首次重启没有进入负载：冷启动期间原测试注册的一小时有效期已过，实际 INIT 返回 `FORMAL_EXECUTION_EXPIRED_OR_REVOKED`，关闭子进程时另记录 EPIPE。此项记为环境 ERROR、容量 NOT_RUN，不能归入容量失败或通过；原生入口没有放宽有效期，PG 随 finally 正常删除。随后复用本地下载件与原始来源文件，重新执行 genuine 准入并建立新的隔离数据库；新完整安装计划正式包含 bundle 补丁，不通过 JSON 缓存恢复私有 capability，也不改到期判断。

该候选在新环境的基线发布暴露真实适配缺陷：新增 Trade 内部 mapper 复制了历史独立入口的 `opening-inventory-entries` 条件，遗漏此前前向完整库存修复的 `postwar_complete_opening_inventory_document` 文档选择。命令实际 COMMITTED，但派生事务遇到 P0002 回滚，状态 UNAVAILABLE，负载未开始。本地候选没有推送。`0c97db21` 修正这一个条件，未更改既有 #199 的完整库存代码；新增真实 PGlite 回归在安装全部依赖和完整库存修复后安装 bundle，逐个比较五类 mapper 的真实数据库函数体，除了共享 coverage 调用外必须完全一致，并核对六个内部函数的 publisher/reader 执行权均为 false。三组命令 `pnpm exec vitest run tests/world-core/postwar-complete-opening-inventory-repair.test.ts tests/world-core/postwar-current-publication-head-cutoff.test.ts tests/world-core/postwar-schema-delta.test.ts` exit 0、36 项通过；改动测试 lint/格式及 diff exit 0。该改动仅 SQL 与回归测试，没有再次构建未变化的 JS。

## 最终候选的实际结果

候选 `0c97db21` 使用新的隔离 H0，完整来源及 SQL 安装后启动；与之前 H34 的短诊断不是相同起点，不计算跨轮严格 A/B 延迟改善百分比。在线资源仍为应用 2 CPU/6GiB、PG 1 CPU/3GiB、角色池上限 2。原生驱动实际以 `ECONMIND_REGISTERED_FINAL_NODE_NATIVE=1`、`NODE_OPTIONS=--import=/task/observer.mjs` 在隔离应用内执行 `nice -n 10 node --experimental-transform-types --import ./tools/office-connection/beneficial-child-source-loader.mjs /task/run-20261118e.mjs`。

| 指标            | 一分钟门槛         | 五分钟目标阶段                     |
| --------------- | ------------------ | ---------------------------------- |
| 结果            | PASS               | FAIL，约 227.43 秒触发连续错误停止 |
| 实际读取 / 计划 | 1200 / 1200        | 4534 / 6000                        |
| HTTP 错误       | 0                  | 12 次 Country 02 的 503            |
| P95 / P99       | 615.18 / 1126.38ms | 3267.55 / 4357.07ms                |
| 实际写入 / 计划 | 20 / 20            | 48 / 100                           |
| 完成及排空总长  | 59.96 秒           | 227.43 秒（未运行满五分钟）        |
| head / events   | 21 / 61            | 69 / 205                           |

两段之间没有重置世界；五分钟阶段从实际 H21 继续。加上初始信封，累计 69 条命令/69 条 COMMITTED 回执，财务批次和库存 posting 均为 0，真实未完成队列为 0。68 条负载命令及初始命令均实际完成每条 32 份派生文档，`writeError` 为空；这不等于持续吞吐通过。原生驱动退出码为 0 只表示记录、已接受命令核对及清理完成，容量结果仍为 FAIL。

一分钟的 SQL prefix 调用为 40 次 / 20 条写，五分钟阶段为 96 次 / 48 条写，均确认为每条两次，而原来是十次。后半程仍有 150 个完整 page fold、canonical_json 递归约 1044 万次；prefix 核验累计约 62.71 秒、canonical_json self time 47.21 秒（调用栈重叠，不能相加）。Node CPU 144.27 秒，Worker 源连接累计持有 210.19 秒，其中 query await 24.57 秒；publisher 累计持有 75.67 秒。读池等待 P95 364.31ms。这表明减少一部分重复工作有效，但完整重建及重试放大仍随历史增长，不能凭一分钟较快判定可承载持续负载，也不能认为简单加机器已得到验证。

负载结束后执行八项原生检查（`exec('node', ['/task/check-bundle-native.mjs', fixture.marker.socket, fixture.clone.database])`），exit 0：实际六个私有函数的 publisher/reader/worker 权限均 false，bundle 仅 publisher 另获执行权；同一真实 H69 断言可重建 16 份该国文档；分别篡改五类 coverage 均以 23514 拒绝；所有检查回滚，head/event 不变。它们在负载窗口结束后执行，不计入容量统计。

## 后续与清理

后续应先设计一次受保护的全局 head 快照内完成一次完整重放，再派生注册范围内的多国、多 Office 页面，避免逐国重复重建。每国的真实来源、撤销、原始 Captain 状态和准确 head 检查必须保留；不以延长等待、扩大池或新增 Redis/服务代替修复。实施后沿用同一最小门槛，不增加测试矩阵；发布前仍须 P0 独立审查。本轮的持续容量缺口、P0 独立审查及公网/远程数据库部署验收仍未关闭，没有批准延期或自授通过。

按“通过才推送”的指示，本地候选及报告保留，远端工作分支仍为 `6ef840af8f296d6b6f359d56462a3e1b063550ea`，没有推送、合并、部署或采购。当前本地/远端分支均为 `codex/office-next-connections-20261108`；旧 #201 分支已按所有者此前选择从本地和远端删除，本任务未新增或确认其他废弃分支。原有六份 LOG_USAGE 报告不改动。

清理实际读回见[机器可读证据](REPLAY_BATCH_ADMISSION_REPAIR_2026_11_18.evidence.json)。原生进程及角色池已关闭，全部本轮测试 PG/卷已由入口清理；应用容器与两个归属已核验的卷、PG16 与 docker:29-cli 两项下载镜像引用已移除。原有五只容器、四个卷和其他镜像保留，确认没有其他运行容器后，Docker Desktop 停止命令 exit 0，恢复任务前的停止状态。没有全局 prune。

**Windows 临时目录清理被拦截，仍需手动删除：** 自动审批审查拒绝删除 `D:\data\temp\econmind-replay-repair-20261117`，仅返回 `blocked by policy`。此前已核验绝对目录、非 reparse point、62 个平面文件且无子目录；原生 PowerShell 的逐字路径删除命令未获执行，没有换工具绕过。目录仍为 617,940,527 字节（约 589MiB），包含测试脚本、来源归档、下载件和原始结果，不能声称只剩报告。更早被拦截的 `econmind-lazy-capacity-20261117` 现已不在，本轮未尝试再次删除该路径。
