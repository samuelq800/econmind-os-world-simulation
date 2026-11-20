# 70 国原生诊断：Social 计算放大连接排队

> 本文保留修复前诊断。后续按需加载实现和本地验证见[实施报告](SOCIAL_PLANNING_ON_DEMAND_2026_11_17.zh-CN.md)；本文的性能数值均来自修复前基线。

2026-11-17，Asia/Shanghai。基线 `26e1a7e9efd16b841344114b026793d8d9cc1f22`。本轮仅定位，未修改产品、SQL、权限或依赖，不是 100 人容量验收，也不推进 R2 gate。

**已确认：普通 Social service-pools 页面附带的规划读取执行大量同步计算，阻塞 Node 事件循环，放大普通读池排队并拖慢其他 Office。应先减少这条路径的重复工作，再做容量复测；暂缓为这个已测出的软件开销采购服务器。**

[紧凑证据](CONNECTION_WAIT_DIAGNOSIS_2026_11_17.evidence.json)包含各角色连接/查询耗时、CPU 热点和所有实验段摘要。

## 干净对照

同一冷启动进程、同一 H1 数据库、同一授权身份、相同总输入速率。基线发送 100 次 Central Bank 读取；实验段发送 67 次 Central Bank、33 次 Social 读取。按时间发起请求，不等待上个响应后再发。

| 指标                 | 不含 Social | 三分之一为 Social |
| -------------------- | ----------: | ----------------: |
| 实际输入速率         | 19.64 次/秒 |       19.68 次/秒 |
| 请求数 / HTTP 错误数 |     100 / 0 |           100 / 0 |
| Central Bank P95     |     26.96ms |         4951.69ms |
| Social P95           |      未请求 |         7736.41ms |
| 普通读池排队 P95     |     0.107ms |         4628.50ms |
| 事件循环延迟 P95     |     10.72ms |          263.19ms |
| 注入首末请求跨度     |    5.040 秒 |          5.031 秒 |
| 含排空的阶段耗时     |    5.090 秒 |         10.447 秒 |

加上 9 次顺序读取，共 **209 次 HTTP 读取全部成功**；36 次 Social 规划结果均为 `AVAILABLE`，不是吞掉规划失败后返回空结果。P95 使用 nearest-rank。HTTP 200 不等于延迟或容量通过。

此次池上限为正式配置的 2，短段未复现原来的 10 秒 CONNECT 超时，但明确复现了排队和跨页面延迟。不能据此逐个解释此前所有 503。

## 直接耗时证据

实验段 Social Worker 事务平均持有连接 **330.30ms**，其中每次累计 query await 约 **42.35ms**，约 **287.95ms 在 query await 之外**。顺序调用对应约 328.93ms / 21.95ms。query await 含客户端调度和解析，不等于服务端 SQL 执行时间；差额也不能单独等同于精确 CPU 时间。

V8 CPU 采样确认热点集中于：

- `packages/core/src/serialization/canonical.ts`：`normalizeRecord`、`ownDescriptors`、`canonicalSerialize`。
- `apps/world-worker/src/persistence/postwar-shared-office-prefix.ts:218`：全部国家的 `sourceFootprints` 构造，以及人口位置引用过滤。已将采样的构建 JS `:160`、`:178` 对照到实际源码。
- `packages/core/src/finance/beneficial-housing-rent.ts:609`：债权聚合、账户/余额线性查找及定义比较。

250ms 间隔的 `pg_stat_activity` 采样仅见 `ClientRead` 和无等待项，没有观察到 `Lock`。Worker 单次 query await P95 约 3.11ms，读池排队 P95 却达到 4.63 秒。证据支持优先处理应用计算；不据此排除一切瞬时数据库等待。

## 触发链路与修理方向

Social 普通页面释放页面连接后，会调用 `socialServiceCreationPlanningReader.read`，再重新检查 JWT、seat、admission 和 head。规划 reader 借用 Worker 事务，进入 `readPlanningFrom → readCurrentFrom → readPreparedPostwarSocialLineageFrom`。paged 路径创建完整前缀 continuation，随后共享前缀处理还构造预算、债权及全国家来源足迹，最后才裁出本国规划选项。

大量同步计算发生在持有事务期间，也拖延其他连接回调与释放。页面连接已在 Worker 事务前释放，不能将此解释成嵌套借用同一个连接造成自锁。

建议最小顺序：

1. 普通列表只读取已授权投影；打开创建服务/劳务表单时才按需读取规划选项。保留现有功能及实时授权、撤销和 head 复查。
2. 必要时只在只读规划路径复用真实已验证的 paged 结果，避免构造未消费的完整报告/见证数据。不直接删除提交路径的财政守恒、来源保护或规范化校验。
3. 跑相关权限/新鲜度回归及同一短对照；恢复后再跑既定五分钟混合负载。若按需加载已足够，后续微观优化可以不做。

这是待实现方案，本轮没有批准 P0 变更或自动合并，也不需要增加 Redis、服务、框架或测试矩阵。

## 环境、准备和结果边界

- Node 24.20.0、pnpm 12.3.4、PostgreSQL 16.15，冻结 lockfile。应用 2 CPU / 6 GiB，数据库 1 CPU / 3 GiB，每角色池上限 2、连接等待上限 10 秒。
- 固定 PG 镜像 `postgres@sha256:1beaa3084eee2676f20a9cd9928f0bf2c5bf674f8e49f81017912183d377c61c`。应用采用已有 Debian 13 基础镜像与官方 Node 24.20.0 独立包；没有启动该基础镜像所带数据库。
- 父开局、125315829 字节子种子、70 份回执均与原绑定一致。完整 Core 来源验证、原生 SQL/RLS、真实签名 JWT、正式注册 Node 入口和 HTTP 均实际运行。两次冷启动约 294.67 / 295.75 秒，独立计入准备。
- 一个实际授权身份，完整 70 国来源，无 WorldClock 服务、生产 Supabase、生产凭证或公网延迟实验。在线 CPU 采样仅在启动完成后开启。

准备曾被冻结源码检查和错误的 Industry 发布角色拦截，均未放宽检查；计时移到准备完成后，角色按既有职责修正。逐国 Industry H0 派生与本定位无关，主动取消后通过既有 sealed H0/committed checkpoint 恢复入口继续，没有重做 World 初始化。

首轮 Finance H0 基线返回 `CURRENT_FINANCIAL_UNAVAILABLE`，不纳入干净对照。首轮一条预算实际 COMMITTED，head/event 0→1，回执一条，无新增财务批次或库存 posting；但未完成的 Industry H0 准备使其派生发布出现 `P0002: query returned no rows`。因此不能称为完整单写发布验收通过。干净对照仅恢复该真实 H1，不再新增命令。

最初两国 SQL 探针不覆盖本次真实路径，其 6–12ms 结果不用于上述结论；失败的来源校验也未绕过。脚本 exit 0 只代表诊断收集完成，不代表容量 PASS。

## 清理和仓库

任务容器、三个任务卷（含自动创建的匿名卷）、本次完整下载的 PG/CLI 镜像、种子、临时脚本和原始采样按所有权核验后清理；既有用户容器与四个用户卷保留。未做全局 Docker 缓存 prune，Docker 恢复为开始时的停止状态。

只保留报告与紧凑证据，未推送以免触发无关的全量 CI。当前本地/远端分支仍是 `codex/office-next-connections-20261108`；#201 源分支删除位置选择仍待所有者决定，本轮没有新建、删除或合并分支。
