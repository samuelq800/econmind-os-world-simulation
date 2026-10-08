# World V2 正式经济引擎启用施工记录 — 2026-10-08

## 本轮目标和实际发布

Owner 最新直接指令：**“你继续推进直至正式经济引擎启用”**。
此前直接指令：**“本地预览文件不用继续修了。直接修正式发布版。”**
因此继续正式 API/Worker/Core/UI 接线、独立窄审和正常 main 发布。
2026-10-07 D05 的 OWNER_EXCLUDED/DEFERRED 是历史范围，不再作为本轮施工的
永久阻止。它也没有自动变成已部署主机、已批准生产拓扑或已验证 ACTIVE。
已批准的经济规则不重复询问；没有原始值的字段不臆造、不补零。

最新已验证 main：`bcfc66787631a13aa5093df42954070c2d7dd66b`（PR116）。
tree：`ff81dd455f32719e6383c96d5430e9c38fe9fa92`。
固定候选 `fc1b416f9c44bcafb39c4221a6548e71b84e9584` 与 main 的 tree 相同。
正常 merge，没有 force/admin bypass。实际 provider 结果：

| 证据                             | 实际结果                | 不代表什么           |
| -------------------------------- | ----------------------- | -------------------- |
| Trusted runtime CI `37734771187` | SUCCESS，固定候选       | 不是正式经济执行     |
| Atlas CI `37734771144`           | SUCCESS，固定候选       | 不是开局 admission   |
| Pages `37736879174`              | SUCCESS，main `bcfc667` | 不是 API/Worker 部署 |

PR115 已发布的开局计入金融读链和正式浏览器消费者保留；PR116 新增的
manual Office 入口、Captain source-to-Draft 和 native-test 兼容包均有固定独立窄审。
manual 入口当前仍如实拒绝缺少领域来源/唯一消费者的命令，零排队、零经济写入。
不把拒绝测试或 TEST_ONLY 联合链当正式正向执行。
详细旧检查与失败记录见
[正式发布 checkpoint](WORLD_V2_FORMAL_RELEASE_CHECKPOINT_2026_10_08.md)。

## 已派发的实质代码工作

各窗口使用专属 worktree/分支，固定上述 main 为新施工基线；不覆盖其他窗口文件。
提交先固定 SHA/tree/测试和来源边界，再独立窄审、组合检查和正常发布。

| 窗口 | 实际 ownership / 交付                                                         | 本轮边界                                                                                                      |
| ---- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| A    | 正式 opening admission 发布服务与直接测试                                     | SOURCE_READY_NOT_APPROVAL 不能充当 ADMITTED；不移除 SQL veto、不自行执行生产 SQL                              |
| G    | 既有 durable dispatcher 接入真实 Captain/CB/Social candidate factories        | 同一 queue、claim、execution 和 AtomicTransitionRepository；保留授权、fence、CAS、FINAL、once 与生产隔离      |
| C    | Social candidate source 的实际 SQL schema 兼容修复                            | 命令类型读取真实 command_submission；不为错误查询新增 queue 列、不削弱 claim/权限检查                         |
| E    | 四职位实际业务结果 projector，接既有唯一 replace publisher                    | 从 committed event/receipt/current head 推导 before/delta/after；不造结果、不另开 writer、不泄露 private 持仓 |
| F    | exact 0023 的受控 release-caller readiness 缺口                               | 复用唯一发布链；不泛化 20/21 allowlist、不接受未知 0024、不直接执行                                           |
| B    | A `fe8c4f263dbde520a3f1725fb39ffe199c1c8254` renewal fixture 兼容补丁独立窄审 | 保留原 FAIL；source review 不等于四项 native renewal 通过                                                     |
| D    | 最新正式在线六职位各一视图的必要 browser smoke及实际 UI 缺陷                  | 不再维护 preview、不发经济命令、不把此 smoke 叫作完整 420 视图验收                                            |

C 的具体缺陷由 G 接线时报告：Social source 查询 command_queue.command_type，
但正式 0003/0010/0012 schema 的类型在 command_submission，而非 queue。
修复和真实正式 schema 回归尚待交付；此记录不是提前声称通过。

## 真正启用的闭合顺序

1. **权威开局与 admission。** 保留已选 70 国包及 203 地图文件；核实完整金融
   carrier、原始币种/冻结 FX、政治资本 genesis、Social/设施实际 operating carrier。
   exact source/hash/model/replay/WorldId 与实际 readback 一致；真实批准证据与来源
   readiness 分离。只有真实 admission 发布入口完成审查，才可注册对应受控发布材料。
2. **真实身份和命令入口。** 服务端 JWT/JWKS、当前合法 seat/grant、capability、
   admission 与 head 必须同绑定；正式 API 只挂已完成来源和执行接线的命令族。
   UI 不提供 actor 权限、权威 state 或结算时间。
3. **唯一执行和数值回读。** 在同一 durable queue/claim、current authorization、
   lease/fence/CAS/atomic transition 下执行；结果来自 committed event/receipt 和
   当前 head。未知/缺源/撤权/旧版本均拒绝而不是伪成功；自动 Social 还需真实来源授权。
4. **受控 schema 与 host cutover。** 在固定候选完成独立窄审及适量真实集成证据后，
   仅用批准的唯一数据库发布路径。独立 API/Worker/clock 部署必须有真实目标、
   构建身份、DB namespace/role、TLS/身份绑定、lease/lifecycle 和回滚证据。
   GitHub Pages 是前端，不是运行 Node Worker 的经济服务器。
5. **正式正向验收。** 对依法绑定的真实国家/职位执行最小真实主循环，记录
   command→event→posting/domain delta→FINAL→授权 UI readback；重试只产生一次效果，
   重建后数值相同、停止/恢复不重复结算。成功后才能报告正式引擎启用，不能只据 CI。

依赖执行的部分等待实际来源/交付，不阻止其他安全源码施工。
原经济规则、原件和已有 map/climate/mineral/infrastructure 数据继续保留。
容量、目标和提案不能升级为已生产、雇佣、付款、交付或持仓。

## 当前仍缺的事实，不是新一轮规则审批

- 70 国完整 CB 开局 positions/holdings 的来源与 completeness；既有 R/B 规则已知，
  但它们不提供不存在的资产数值、配对 claim 或证券批次。
- 各金融字段的原始币种与冻结 FX/version/effective t0/source。
  已批准 GCU scenario→Core GCU 1:1，不等于 LC=GCU。
- 政治资本 genesis 和真实原因载体、Social 真实求职/岗位/服务运行状态等。
  已固定来源未包含部分开局数值；不能把 TEST_ONLY 或物理 openingCapital 代用。
- 唯一正式 World 绑定与实际 admission/seed lineage。
  当前 `status/world-data-selection.json` 的 worldId 仍为 null；
  openingSeedCommitted/workerStarted 仍 false。先确认实际唯一身份，不另造第二 World。
- 已验证真实 Owner/admin 与 lawful current-seat publisher；此前给出的 UUID
  本身不是真实 auth/admin/seat evidence。队伍尚未确认不妨碍代码接线，但不能编造席位。
- 正式 API/Worker 运行目标及可核验 deployment、readback、lease/lifecycle。
  当前 runtime-binding consistency checker 明确 evidenceVerification=NOT_PERFORMED，
  simulationEnabled=false；Worker 默认 health runtime 同样不运行经济循环。

这些材料可来自既有权威文件、实际正式绑定或 Owner 新提供的明确输入；
不重复扫描未变化包，不猜数值，不购置未确定主机或读取密钥来掩盖缺项。

## 保留的状态

正式经济引擎：**NOT_ACTIVATED**。生产经济命令、开局 seed 写入、Worker/clock 激活：
本轮 **NOT_RUN**。完整 420 视图验收：**NOT_RUN**。
Gate B 仍 **PENDING**；`status/progress.json` 的 V09 PLANNED、next_step_ready=false
未因源码合并改变。PR114 的 schema 增量与 caller readiness 单独处理。
没有生产 Supabase 任意 SQL、旧站 public/auth/storage 改动或本地预览修复。

本记录属于非行为性交付和授权范围更新，不授予新的 runtime proof 或独立审查结论。
收到窗口固定交付后继续真实组合/审查，不通过重复等待或反复全量检查制造进展。
