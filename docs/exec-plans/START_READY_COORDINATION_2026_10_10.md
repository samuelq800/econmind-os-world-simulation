# 开局包到达即可受控启动：本轮接线计划

2026-10-10，Asia/Shanghai。状态：差距定位已分配；不是 START_READY、生产发布或经济启用批准。

## Authority and scope

- 目标：正式开局包成为最后业务输入，导入和校验之后不再临时补接线；启动仍须满足正式准入及独立审查。
- 本轮接续既有开局/接口准备，不新设平行总控、引擎或数据库发布链。绑定 `AGENTS.md`、`PLANS.md`、`status/progress.json` 和集中 review policy。
- 人类此前允许本总控协调既有 A–G；本次目标由“接续 World 总控任务”线程 `01a1252e-63fd-75c8-9f07-4ae61e73708f` 移交。交接消息不是新增生产写入、凭据或架构决定授权。
- 排除：正式开局写入/启动、生产 SQL/账号配置、取秘密、付费资源、旧站变更、自动修改 gate。新持久凭据或权限扩大须走当次确认与安全输入。
- Oct10 左上徽标/邻接渐暗归“修复 World 地图界面”线程 `01a124b0-e22d-770d-8bc3-60de2ff6f0ac`；昨日视觉收官不能覆盖这项新任务。

## Dependency and decision gate

- 实际起点 main `42991acfee9d0eacc702ba47a380c938a4516f03`，tree `1254c4144279717c9075e9bbf07b4b2ac4710558`，含 PR129/130。
- PR129 merge `bd001cb3ea4e7ff2629eda28afc88f28af331126`；实际手动发布 [38028232852](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/38028232852) 的 caller-check/prepare/publish 均成功。
- 发布构件来自固定 `e7ecf45184baad69a37e2e51fff8862a635267dc`，**不是**触发分支所有 main 变更。新正式接线需要另行固定、验证、独审发布构件，不能沿用旧 HOLD 批准或只翻开关。
- Root 实际下载 publication artifact `11661855670`；provider ZIP digest `7faa3c448ba33d616ffdd8f2f53f5eed5995201ffe8149902eea3a4e2c053397`。其中原始 `publication.json` SHA256 `80c842f48340b304d3702822fbbee7b3e77d9ebc123629715b6294794fdb32ff`，明确 `PASS_HOLD_ONLY`、两个目标获确认、`databaseConnected=false`、`economicActivation=false`。
- Root 本轮只读 live GET：`/healthz` 200 / `ALIVE_NOT_ACTIVATED`；`/readyz` 503 / `ALIVE_HOLD`，database/simulation/clock/authoritative commands 均 false。不是一次新的云端完整验收。
- 当前 `status/progress.json` 仍 V09.1 PLANNED、gate PENDING、next_step_ready=false。B 先核对既有 evidence 与依赖；本计划不解锁后继步骤，也不把已合并源码改称 VERIFIED。
- 当前文档为 P3 非行为记录。后续 authority、身份、数据/账本、single writer、时间及生产边界补丁按 P0 处理，先固定范围及硬依赖，再施工、实际验证、阻塞式独审；无法确定时保持 HOLD。

## 已由 Root 当前源码确认的缺口

| 实际入口                                                              | 已有实现                                        | 仍不能直接靠导入解决的部分                                                                         |
| --------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `apps/world-api/cloudflare/runtime-api.mjs` → `createHoldApiServer()` | 实际 Node HTTP bridge、内部 executor 健康探测   | Office composition 固定 null；无开局/数据库/经济配置开关，不是正式 API 总接线。                    |
| `apps/world-worker/src/runtime-preparation/hold-executor.ts`          | 内部存活/未就绪响应                             | 没有 queue、lease、storage、Clock、scheduled event 或正式消费循环。                                |
| `apps/world-api/src/integration/nonactivated-runtime-api-host.ts`     | read/Financial/Office 显式聚合、pins/身份一致性 | 只是非激活工厂，默认不挂载；不能用 URL/JSON/READY 替代私有 runtime。                               |
| `apps/world-worker/src/intake/manual-office-intake-runtime.ts`        | 绑定同 pool/clock/World 的真实 consumer 构造    | 没有生产注册/host loop；底层 durable preparation 当前仅允许 local/ci，不允许删除守卫伪造生产支持。 |
| `apps/world-web/src/trusted-host/bootstrap.ts`                        | 现有消费者 configureTargets/connect 与撤权清理  | 实际生产 session/seat/endpoint 调用链仍待 C 核实，安装函数不等于已连接。                           |
| 既有官方开局 loader/preflight                                         | 原字节验证与拒绝缺失输入                        | 正式 LC/FX/完整 CB 来源与 producer 缺口按 A 的当前源码核实，不能补零/FX1/提升 TEST_ONLY。          |

## Change plan / 现有窗口所有权

首轮只做一次精确定位：各窗口不改产品，独占各自 `docs/reports/start-ready-20261010/<窗口>/` 报告；不重复 full/native/420，不合并/部署。全部发送接口已确认成功。

| 窗口 | 独占责任                                          | 本轮交付                                                              |
| ---- | ------------------------------------------------- | --------------------------------------------------------------------- |
| A    | 开局→金融 producer→bootstrap/admission/readback   | 精确输入契约、仅缺数据/缺契约/缺代码区分、最小 producer patch。       |
| B    | 治理硬依赖与独立验收边界                          | 已有独审继承范围、真正阻塞项与可施工顺序，不自改 gate。               |
| C    | 浏览器真实 session/国家职位/read/command          | 六职位真实能力及最小接线 patch，不修改视觉地图。                      |
| D    | Clock/scheduler/lease/fencing/恢复                | 实际 host 构造/续租/hydration 缺口及隔离恢复用例。                    |
| E    | 唯一数据库发布链/最小权限运行连接                 | API/executor/publisher 身份、配置名称、隔离权限验证，无真实凭据/SQL。 |
| F    | 隔离环境端到端验收                                | 复用实际 PG/workerd 链，区分 TEST_ONLY 输入证据与真实六 Office 能力。 |
| G    | 正式 API/executor/consumer/FINAL/投影 composition | exact constructors/ports/callers 与默认 HOLD 的最小生产构造方案。     |

各自报告绑定 base SHA、文件/符号/测试、风险和依赖。收到后由 Root 分配精确文件级补丁，避免两个窗口各造半条独立权威链。跨文件契约先固定，不让相互依赖实现抢跑；只有存在真实必要工程才施工。

## Validation plan

- 首轮已做：最新 main/PR129、实际发布 run 与原始 publication artifact、live 两个只读端点、相关入口源码核实；未重复完整 CI。
- 后续必要正向：真实构造→合法隔离 JWT/current seat→手动命令→幂等原子账本→COMMITTED/FINAL→授权投影读回；数据库、auth 和 consumer 必须属于同一合法 World/admission/version。
- 后续必要拒绝/恢复：无输入/错误 pins/撤权/重复请求/UNKNOWN、普通进程重启与 hydration、lease 到期/竞争 fencing；缺失输入拒绝且不产生权威写入。
- 权限：API/executor/publisher 按实际职责最小授权，唯一发布者；隔离 PG 用真实 grants/SQL 验证，不把“未读取秘密”写成“权限已验证”。
- 单一最终候选 SHA 上集中跑适用组合检查和 CI；已核实且原件不变的证据继承，不对每个小提交重复全量。
- 六职位必须各有合法 read/command/结果链，不把 Finance/Trade 或420 URL可访问当全部玩法验收。不得造假输入、mock成功或移除原 guard 来过关。
- 证据 vocabulary：PASS / FAIL / NOT_RUN / INSUFFICIENT_EVIDENCE；静态发布、机制测试、正式 source admission、生产 activation 分开。

## Exit condition / 下一检查点

下一检查点是六条定位结果与 B 门槛对账，形成一个文件级、可独审的最小施工批次。窗口完成报告后停止；总控不挂起等待或轮询未变结果。

真正 START_READY 要求：所有非数据工程已实施并独审，正式 producer 可消费批准契约，真实身份/最小权限/唯一发布/host/Worker/Clock恢复链有固定 SHA 隔离验收，受控导入与启动步骤可机械执行。未获得的权限、契约或架构决定明确列为阻塞，不宣称只差数据。

即使达到 START_READY，也不自动执行正式数据导入、经济写入或启动；失败维持 HOLD，实质变更后才继续。
