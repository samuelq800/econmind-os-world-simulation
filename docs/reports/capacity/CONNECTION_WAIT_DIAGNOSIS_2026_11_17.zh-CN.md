# 连接等待定位：已证实的故障与待测根因

> 历史小型探针记录。后续已完成真实 70 国原生定位，当前结论见 [原生诊断报告](CONNECTION_WAIT_NATIVE_DIAGNOSIS_2026_11_17.zh-CN.md)，以下保留当时的证据边界。

2026-11-17。基线 `26e1a7e9efd16b841344114b026793d8d9cc1f22`。本轮仅定位，没有修改产品、执行完整压测或操作生产数据库。

## 结论

**直接故障是连接池等待超时。当前最值得测量的放大路径是 Social service-pools 页面附带的 Worker 前缀重建；尚未证明它是唯一根因，不能宣布已经定位到某条慢 SQL。**

上次 70 国负载的读池 CONNECT 超时、约 10 秒响应和多 Office 同时失败是已保存证据。队列没有积压、应用约占一个 CPU 核、PostgreSQL CPU 较低，支持先测应用计算和连接持有时间，但不能据此排除数据库锁等待。

## 已核对的实际代码

1. `apps/world-api/src/integration/postwar-office-runtime-read-service.ts`：Social `service-pools` 的普通页面返回后，还会调用 `socialServiceCreationPlanningReader.read`，然后重新检查 JWT、seat、admission 和 head。页面连接在独立 Worker 事务前已释放，不能把此代码解释成两个连接嵌套自锁。
2. `apps/world-worker/src/persistence/postwar-social-service-creation-planning-read.ts`：规划数据借用 `ports.database.transaction`；该 database 来自现有 Social/Worker 连接，因此页面查询会竞争 Worker 资源。
3. `postwar-social-employment-service-creation-runtime.ts` 的 `readPlanningFrom → readCurrentFrom`：读取注册 Clock、保护原始来源、重建当前 lineage，然后调用规划投影。计算发生于持有事务期间。
4. 正式 prepared 路径进入 `prepared-postwar-social-source.ts → readPostwarPagedFinanceSocialReplayFrom`。`postwar-paged-finance-social-replay.ts` 每次创建当前 replay continuation，输入包括全部国家的 Social state/offers，再处理当前历史页；并非只读取被选国家的简单分页。这里是应测的 CPU 与连接持有热点候选。
5. 上次测试 host `tools/office-connection/native-registered-final-host.mjs` 每角色 `max: 1`，正式入口 `apps/world-api/src/runtime/registered-node-service.ts` 每角色 `max: 2`；二者连接超时均为 10000ms。此差异真实存在，前次结果不能当作正式配置容量。

## 本轮短实验及局限

Docker daemon 未运行。只读检查 `docker info` 失败，未为了小实验启动 Docker。使用现有两国 H0 PGlite SQL fixture，在三个独立 repeatable-read 事务中调用真实 `DurableV08LedgerLineageReader.readValidatedLineageFrom`，记录每次 SQL await 与完整方法耗时。

| 次数 | 完整 lineage 读取 ms | 累计 query await ms | 二者差额 ms |
| ---- | -------------------: | ------------------: | ----------: |
| 1    |               11.759 |               5.329 |       6.430 |
| 2    |                6.262 |               3.763 |       2.499 |
| 3    |                6.282 |               4.038 |       2.244 |

该探针 exit 0，1 个诊断用例通过，实际 SQL/存储和校验均执行。query await 是 PGlite 调用墙钟时间，含 WASM/适配开销，不是原生 PostgreSQL 服务端执行时间；差额也不能等同于精确 CPU 时间。

这只说明小型空历史读没有复现 10 秒延迟，**不能排除 70 国 prepared 路径、真实历史、连接排队或锁等待**。它没有测到真正目标链路，不能将该实验称为压测或生产根因证明。

初始尝试将同一小 fixture 接入完整生成来源/规划路径，分别被 `GENERATED_POLICY_PROVENANCE_REQUIRED:source` 与来源文档 schema 校验拒绝，两个尝试均 exit 1；该 fixture 明确是 SQL 基础设施测试数据，不能冒充生成来源。未放宽校验或伪造来源批准。随后缩小探针范围，仅测其真实适用的 lineage 读取。

## 要关闭根因缺口的最小实验

恢复一次与原压测相同的 70 国隔离环境，用正式 `max: 2`，只执行短诊断而非立即重复五分钟压力。临时观测仅需：各角色 connect 排队时间、connect 到 release 持有时间、query await 总时长、Social 当前前缀重建/规划耗时，以及同一时刻的 pg_stat_activity wait_event。记录 Node event-loop delay 辅助区分 CPU 阻塞。

先顺序读三个原 Office 页面，再用相同读速率分别运行包含 Social service-pools 与不包含该页的短段；最后做一条合法预算写。只改变流量组合，不绕过权限、来源或新鲜度约束。

若去掉该页面后其他 Office 与写入恢复，并且 Worker 事务主要耗在 JS/重建，可确定优先拆分页面普通读取和按需规划、减少同一请求的重复派生；若服务器 query 时间/锁等待占主导，则按具体查询或锁持有修复。现阶段不先增加池大小、缓存服务、数据库索引或采购服务器。

本轮没有得到足以修改经济/权限路径的实测依据，未自授 VERIFIED、推进 gate 或合并。临时测试脚本、原始测量 JSON 与 PGlite 实例已清理，只保留本报告。当前本地/远端工作分支 `codex/office-next-connections-20261108`，此前 #201 源分支仍待所有者决定删除位置，本轮未删除分支。
