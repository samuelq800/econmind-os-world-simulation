# World 100 会话容量实测报告

2026-11-15（Asia/Shanghai）。状态：`BLOCKED`。已完成隔离环境恢复、来源校验、两次独立 API 冷启动和单请求业务检查；**混合负载被首条预算命令的权限错误阻塞，100 会话、30 分钟压测没有执行，不能宣布容量通过。**

候选分支：`codex/office-next-connections-20261108`；提交 `b51ac3c43a27081f70ac3e70299ea2a8a549db38`。详细命令、退出码、指纹及结果见同目录 `CAPACITY_100_SESSION_2026_11_15.evidence.json`。

## 对服务器需求的结论

目前优先解决候选运行链的预算来源权限问题，再测实际吞吐。新增 CPU 或内存不能解决本次 SQL 权限拒绝。

本次 API 启动峰值 RSS 约 2.35–2.36 GiB，因此当前测试入口已有证据表明 2 GiB 进程总内存预算不足。4 GiB 仍只是待测档位，不能据此保证 100 人在线；操作系统、数据库、部署重叠及持续增长还需单独计入。开局来源生成的 Windows 约 3.53 GiB 峰值属于另一阶段，不与 API RSS 相加，也不当作 Linux 在线服务最低配置。

## 实际环境与结果

| 项目               | 实测结果                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| 宿主               | Intel Core Ultra 5 125H，18 逻辑处理器，约 31.6 GiB Windows 内存；用户同时工作，非独占基准机    |
| 运行环境           | Ubuntu / WSL2，Linux 6.6.87.2；Node 24.20.0、pnpm 12.3.4、PostgreSQL 16.15                      |
| 数据库             | 独立 Docker 容器，固定镜像 digest，1 CPU / 3 GiB，network=none，仅 Unix socket                  |
| 调度与采样         | 测试进程 nice=5；进程外约每秒采样 procfs RSS/VmHWM/CPU ticks，数据库约每 10 秒采样 Docker stats |
| 开局数据           | 父开局、子开局和 70 份回执逐字节 SHA 与候选固定值相同，完整 Core 来源证明通过                   |
| 来源与权限重新准备 | 480.887 秒；之后使用已完成 H0 快照恢复只需 0.513 秒，但 API 仍重新校验真实来源                  |
| API 冷启动 1       | 279.075 秒；进程峰值 RSS 2.362 GiB；ready RSS 1.392 GiB；观测 CPU 约 290.11 秒                  |
| API 冷启动 2       | 284.166 秒；进程峰值 RSS 2.347 GiB；ready RSS 1.115 GiB；观测 CPU 约 295.90 秒                  |
| H0 Finance 读取    | 修正为受支持的 currency-fx 后 HTTP 200；单次探测约 104 ms，不能当作 P95                         |
| 第一条预算命令     | HTTP 503 / SOURCE_RUNTIME_UNAVAILABLE；底层 SQLSTATE 42501                                      |
| 经济状态           | 退出前 head=0/0，commands/receipts/events/batches/inventory/queues 均为 0；没有接受或结算命令   |
| 100 会话混合负载   | NOT_RUN；负载 P50/P95/P99、稳定内存、队列积压和恢复吞吐均无有效数据                             |

API CPU 秒数来自 `/proc/<pid>/stat`，以 `CLK_TCK=100` 换算；VmHWM 保留进程生命周期峰值，不能把它当作某个子阶段的独立峰值。API 没有设置 cgroup 内存/CPU 硬限额，数据库限额只约束数据库。本轮仅有两次完整冷启动，没有完成三次冷启动或 2/4 GiB 限额实验。

## 阻塞原因与复现

实际链路：受控 H0 来源/权限准备 → 独立 `native-registered-final-host.mjs` → `/v1/office-command` → 预算来源检查 → `world_v2.lock_finance_budget_policy(...)`。

返回内容为 `SOURCE_RUNTIME_UNAVAILABLE`，`submitted=false`、`queued=false`，缺少项列为 `ADMITTED_DOMAIN_SOURCE`、`SOLE_DURABLE_CONSUMER`。子进程诊断进一步定位到 SQL 权限错误，而不是据这两个通用缺少项推断两个组件均不存在。

在与被测快照相同的、独立拥有且随后删除的审计 clone 中确认：

```text
role: fixture_rent_child_worker_2682f2a5
rolinherit: false
rolsuper / rolbypassrls: false / false
pg_has_role(..., world_v2_finance_budget_source_reader, MEMBER): true
pg_has_role(..., world_v2_finance_budget_source_reader, USAGE): false
has_function_privilege(..., lock_finance_budget_policy(...), EXECUTE): false
```

该角色属于预算读取角色组，但 NOINHERIT 使其没有可直接使用的函数执行权限。调用时错误中记录的有效角色仍是该 worker。**这证实本次候选与 fixture 的角色使用不匹配；是否属于产品事务角色选择、组合入口或 fixture 装配问题，需相应 owner 审查，不外推为生产环境现状。**

关联源码：`tests/support/postwar-beneficial-rent-child-native-fixture.ts` 创建 NOINHERIT worker 并授予角色成员关系；`database/proposals/finance-budget-custody.sql` 将函数执行权授予预算读取角色；`tools/office-connection/native-registered-final-host.mjs`、`apps/world-worker/src/persistence/postgres-finance-budget-custody.ts` 组成此次实际调用链。

复现步骤：固定上述提交与来源指纹，在 disposable 原生 PostgreSQL 中通过 `prepareFreshRegisteredNodeRehearsal` 建立测试来源，或通过 `restoreCompletedFreshH0` 克隆完整封存 H0；重新生成临时 JWT 签名能力；以真实 descriptor 启动独立进程；先读取 H0 `currency-fx`，然后提交 `SET_ENVELOPE` 预算命令。本轮没有向生产写入、使用生产服务角色或以扩大授权绕过错误。

## 测试过程中的纠正

第一次业务检查在 H0 读取 `treasury-capacity`，返回 `CURRENT_FINANCIAL_UNAVAILABLE`。该 dataset 的现有 reader 要求正历史前缀，现有原生测试在 H0 使用 `currency-fx`。因此修正临时 harness 的请求顺序后重新启动；原失败仍保留在证据中，不能据其宣布产品回归。

上次暂停产生的子进程退出/清理错误属于用户主动暂停，不计为本轮自然运行故障。临时 harness 曾误调用 `child.close()`，恢复时已改用 helper 实际提供的 `child.stop()`；未修改仓库 helper 或产品源码。

为复用现有“干净 checkout”恢复入口，仅在临时 Linux 副本的 `.git/info/exclude` 中忽略该任务的根目录运行文件、Node/pnpm 和 `.cloud-setup`。没有忽略或改动 apps/packages/database/config/tools/tests；Windows 原仓库不受该配置影响。

## 覆盖范围、治理和下一步

原负载假设为 100 虚拟会话、30 分钟、36,000 次投影读取、3,000 条命令、6,000 次回执轮询，最大在途请求数 32。额外的逐命令持久回执确认属于 correctness 探测。fixture 使用同一授权 Finance 席位，不能代表 100 个独立身份和完整 Office 分布。这些操作尚未进入稳态执行。

前一阶段的冻结安装、Core/Worker/API 构建、V30 工具 10 项回归、分页历史/证明 3 项回归，以及边界、权威模式、secret、本地环境检查均通过；这是准备和正确性证据，不是 100 人容量证据。完整仓库检查、本轮端到端持续负载、时钟到期任务、长期历史、提交后的重启恢复、100 个独立身份均为 NOT_RUN。

当前治理 gate 仍是 V09.1 / PLANNED / next_step_ready=false；V30 正式硬依赖未关闭。没有推进 gate、授予 VERIFIED 或独立审查 APPROVED。

后续应由 Worker/API/数据库权限 owner 核对上述角色切换和最小授权契约，保留 NOINHERIT、RLS、单写者、来源证明和原子性约束，补原生回归并按实际权限边界完成 P0 审查。之后重新做单命令成功/幂等/回执恢复，再逐档运行负载。不能用超级用户、直接 ledger 写入或跳过来源检查来取得压测数字。

## 清理与分支

清理已完成并核验：本次 Windows 临时目录、Linux `/workspace` 副本、临时脚本、负载配置、开局数据、测试缓存、准备文档、隔离容器与 owned volume 均已删除，本次下载的 PostgreSQL 镜像引用也已移除。最终只保留本报告与结果摘要。原有测试、产品文件和其他应用容器保留，tracked diff 为零。

Docker 的两个临时 WSL 集成设置键已恢复为原值。为避免中断其他应用容器，没有重启 Docker；设置文件的恢复会在正常重启时生效。复用的 Linux 包依赖缓存保留，不含本次开局、脚本或数据库测试数据。具体清理及恢复过程见证据 JSON 的 cleanup 字段。

候选本地及 GitHub 跟踪分支均为 `codex/office-next-connections-20261108` / `b51ac3c4`；未提交、合并或推送任何产品修改。本次没有确定已被替代、可删除的分支，未执行分支删除。原有未跟踪 LOG_USAGE 报告保留。
