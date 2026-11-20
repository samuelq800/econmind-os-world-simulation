# 持续写入时的当前页读取与排队定位

2026-11-17。候选 `6ef840af8f296d6b6f359d56462a3e1b063550ea`，分支 `codex/office-next-connections-20261108`。本轮完成定向诊断，未修改产品代码、SQL 或权限规则，没有推进 R2 gate、授予 VERIFIED 或合并。

**已确认两处主要计算放大：发布端重复重放完整前缀，以及席位查询按能力行重复读取准入头。普通读请求在发布窗口重试，将开销进一步放大。下一步先修这两处重复工作，暂缓购买或扩容服务器。**

证据见[定向采集摘要](CURRENT_READ_WRITE_LOCALIZATION_2026_11_17.evidence.json)。这不是容量 PASS；之前的[持续混合负载失败结论](SOCIAL_ON_DEMAND_CAPACITY_RETEST_2026_11_17.zh-CN.md)仍有效。

## 一次定向采集得到的结果

同一 70 国来源、两个真实授权身份，应用 2 CPU / 6 GiB、数据库 1 CPU / 3 GiB，每角色池上限 2。12 次基线读取均成功后，按 20 次读/秒、20 条预算新增行/分钟采集约一分钟，随后排空。

| 指标           | 实际结果                                                                            |
| -------------- | ----------------------------------------------------------------------------------- |
| HTTP 输入      | 1200 次普通读取，首末注入跨度 59.949 秒                                             |
| 读取结果       | 1200 次均成功；P95 6749.88ms，P99 9021.45ms，最大 9811.86ms                         |
| 写入目标与实际 | 20 条计划、10 条实际执行；加上初始信封，共 11 条 COMMITTED 回执                     |
| 排空           | 计划尾部 30 秒内未完成，记录 `WRITE_DRAIN_TIMEOUT`；最后在途命令完成后总长 96.48 秒 |
| 最终状态       | head=11 / events=31，财务批次与库存 posting 均为 0，真实未完成队列 0                |
| 事件循环延迟   | P95 16.26ms，P99 **995.62ms**，最大 **1734.34ms**                                   |

零 HTTP 错误不构成通过：延迟超出原快速评估预算，目标写速率也未达到。100 个轮询编号中观测到 167 次同会话在途重叠，是固定输入的 offered-load 诊断，不是严格最多 100 个在途请求或 100 个独立账户验收。Node 命令 exit 0 仅代表采集和已接受命令核对完成。

## 主要开销一：发布端的 Core 重放

Node 主线程约 96.52 秒采样中，非 idle 采样时间约 76.49 秒。包含子调用的占比如下，**这些调用栈互相包含，不能相加**：

| 调用栈                                                | 占主线程非 idle 采样 |
| ----------------------------------------------------- | -------------------: |
| `readPostwarPagedFinanceSocialReplayFrom`             |               87.23% |
| `appendFinanceSocialReplayPage`                       |               75.78% |
| `foldFinanceNativeBudgetMixedPrefix`                  |               73.25% |
| `canonicalSerialize`                                  |               42.63% |
| `aggregateBeneficialHousingLiquidClaim`               |               38.05% |
| `financialAtVersion` / `parseFinancialLedgerSnapshot` |             约 22.9% |

Worker 连接借用 270 次，即每条混合写平均 27 次；累计持有约 85.07 秒，其中累计 query await 约 3.99 秒，约 81.08 秒位于 query await 之外。该差值不是独占 CPU 时间，但独立 CPU 采样确认主要热点在重放和序列化。读池自身的累计持有约 106.45 秒，query await 约 105.55 秒；query await 也包含回调因主线程忙而延迟的时间，不能全部叫作慢 SQL。

源码对应：

- `packages/core/src/finance/beneficial-housing-rent.ts:609`：每份租金债权聚合多次对整个 `accounts` / `positions` 做线性查找，并重复规范化比较账户定义。
- `packages/core/src/commands/beneficial-housing-rent-mixed-replay.ts:45`、`:83`：一次同步先对所有 origin 聚合检查，随后逐项 `synchronizeBeneficialHousingRentState` 又进行聚合。
- `packages/core/src/commands/finance-budget-native.ts:895`：`financialAtVersion` 重新构造并解析完整财务快照，出现在高成本调用栈中。
- `postwar-office-publication-controller.ts`、各 current publisher：一个全局 head 下按国家、领域分别取得受保护快照，反复进入完整分页前缀重放。这些保护必须保留，但纯计算不应无依据地重复。

因此，先前仅凭事件循环 P95 约 11ms 推断“同步长停顿已经消失”是不充分的。本轮 P99 / 最大值和 CPU profile 补足了这个证据缺口。普通 Social 懒加载修复保留；接下来重点是持续写入中的重复计算。

## 主要开销二：准入头与席位读取

本轮 PostgreSQL 函数计数差量：

| 函数                                   |     调用数 |    self time |
| -------------------------------------- | ---------: | -----------: |
| `postwar_projection_admission_header`  | **78,462** | **19.58 秒** |
| `read_postwar_office_projection_seats` |      4,319 |      7.65 秒 |
| `postwar_projection_reader_allowed`    |      4,319 |      1.62 秒 |
| `canonical_json`                       |    745,820 |      3.99 秒 |

`self time` 为函数内部、不含所调用其他函数的服务器耗时；它不是整机 CPU 占比。统计按函数名合并重载后取前后差量。[PostgreSQL 16 统计定义](https://www.postgresql.org/docs/16/monitoring-stats.html#MONITORING-PG-STAT-USER-FUNCTIONS-VIEW)

在 `database/proposals/postwar-office-derived-read.sql:84` 中，席位查询先连接授权能力行，随后执行依赖 `s.world_id` 的 `cross join lateral postwar_projection_admission_header(s.world_id)`，最后才 DISTINCT。该夹具有六个 Office、每个三个 capability，通常同一 world 的准入头被重复读取约 18 次；4,319 × 18 已达 77,742 次，其余调用还包括发布等路径。

另外，同一次普通页尝试的 API 头读取、分页路由及具体分页函数分别查询席位：Financial/Social 路径为三次，Industry 为两次。路由和分页都在同一 RR 快照中重复了这些元数据工作。

## 重试怎样放大排队

客户端 SQL 计数可直接对上这条链：

- Financial/Social 当前页查询 1061 次：800 PAGE、261 NOT_PUBLISHED。
- Industry 当前页查询 553 次：400 PAGE、153 NOT_PUBLISHED。
- 共 1614 次页尝试服务 1200 次 HTTP 读取，额外 414 次对应 NOT_PUBLISHED 后的重试。
- 席位读取 4319 次中，页面链为 `3 × 1061 + 2 × 553 = 4289` 次，另有 30 次普通页之外的头读取。没有把全部头调用都归为某一个请求。
- 读池借用共 1674 次，等待 P95 **3080.85ms**；该数字还包括非普通页流量，不能全部视为页面重试次数。

这形成“发布慢 → 当前页尚未发布 → 完整重新授权读取 → 更多排队”的放大链。原有有界重试不能直接删除：它修复了真实发布窗口的读取可用性，也仍需在每次尝试重新核对授权、撤销和 head。应优先降低每次合法尝试和发布本身的成本。

## 最小修理顺序

1. **Core 局部批处理。** 在同一次真实账本计算中建立账户/余额索引，复用同轮必要聚合结果，减少按每个 receipt 反复扫全账本。保留原账户、非法/重复债权、负余额、银行镜像及金额守恒检查。先不修改通用 canonical serializer，不删来源哈希，不引入跨请求的状态缓存。
2. **同条 SQL 的准入头只取一次。** 将与能力行无关的 world 准入元数据在同一查询/快照中读取一次，再与席位结果连接，保持完整能力一致性和撤销过滤；随后按实际收益处理分页路由多余的席位查询。遵守新版本/前向 SQL 发布链，不能直接改写已安装历史制品来冒充同一版本。
3. **如仍不足，再合并同批发布的纯重放。** 仅在同一受保护快照、同一真实 head / 来源下复用 genuine 计算结果；不跨事务缓存授权或创建第二份 World State。`financialAtVersion` 的完整重解析也属于这个后续范围，不能直接改版本字段跳过账本边界。

验证只保留相关既有债权/账本/授权撤销回归，再跑一次相同的一分钟对照；恢复后才重做既定五分钟容量验收。上述是根据测量形成的修理方案，本轮尚未实施或推送产品修改，不承诺优化幅度。

## 环境、证据与清理

- Node 24.20.0、pnpm 12.3.4，冻结依赖安装及 `pnpm pretest` 实际 exit 0。固定 PostgreSQL 16.15 镜像和既有原生注册入口，真实 70 国来源、JWT、SQL/RLS、预算命令、FINAL 和派生发布；未连接生产 Supabase、未启动 WorldClock。
- 复用已下载的安装件和候选源码归档，来源重新构建后完整 Core 验证约 335.24 秒；SQL 准备约 373.85 秒，Node 冷启动约 284.11 秒，均不计入在线窗口。
- 纯 H0 准备时临时将该任务数据库设为 2 CPU，以两个独立事务调用相同的逐国修复函数；全局劳动范围仍由原函数验证。进入 Node 启动前恢复为 1 CPU。测量阶段为应用 2 CPU / 6 GiB、数据库 1 CPU / 3 GiB、network=none、无发布端口。
- 本轮临时开启 `track_functions=all`、Node Inspector CPU profiler 和 pg 客户端 query 计时；记录的是带诊断开销的结果，不能拿本轮 0 HTTP 错误替代前次未带 profiler 的容量失败。参数、预算和业务规则未调整。
- 主线程采样分布、进程 CPU、累计连接持有和服务器函数时间口径不同，不能直接相加。进程 CPU 约 87.18 秒；与主线程非 idle 采样约 76.49 秒的差异不应补成某个臆测函数的耗时。
- 现有 PR 候选的 13 项 CI 已全部成功；不代表容量或 P0 独立审查通过。当前分支仍为 `codex/office-next-connections-20261108`，旧 #201 分支已按此前选择删除，本轮没有新建或确认废弃分支。

原生入口正常退出、角色池排空、已接受命令及回执核对成功。已核验清理两只任务容器、三个任务卷（含匿名卷）及一项本次下载的 PostgreSQL 镜像引用；原有五只容器和四个卷保留。格式、diff 检查及秘密扫描（4011 文件）通过，产品 tracked diff 为 0，报告未推送以避免触发无关全量 CI。

最终资源清理与 Windows 临时目录保留情况见 JSON 的 `finalCleanup`。Windows 目录此前已遭自动审批审查拒绝删除（`blocked by policy`），本轮没有换手段绕过或重复尝试该拒绝动作；原始 profile 和脚本仍暂存 `D:/data/temp/econmind-lazy-capacity-20261117`，需人工删除。仅将本文与必要统计摘要留在仓库，原有六份 LOG_USAGE 报告保持不动。
