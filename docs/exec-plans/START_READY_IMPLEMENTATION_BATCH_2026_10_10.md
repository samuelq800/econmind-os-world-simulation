# Start-ready 最小施工批次 — 2026-10-10

状态：已向现有 A–G 发送实施/设计窄审指令；不是源码批准、正式步骤解锁或生产启动。
固定 base：`42991acfee9d0eacc702ba47a380c938a4516f03`。
前轮七份定位报告已经读取；不再安排重复 inventory。

## Authority and scope

Owner 已授权现有总控持续协调 A–G 与必要代码工作。本轮经接续线程
`01a1252e-63fd-75c8-9f07-4ae61e73708f` 移交“报告后继续实际施工”的目标。
此授权不等于批准尚未形成的 P0 补丁、架构 ADR、正式数据/数据库写入、凭据扩权或启动。
本批是既有非启用准备的精确延续，不以 SOURCE_ONLY 标签降低风险或替代治理硬依赖。

不动旧站、地图/CSS、生产数据库、云端配置、真实数据、status/gate、既有 local/ci guards。
各线独立 worktree；他人变更不得撤销。本批所有产品候选按最高边界 P0 冻结独审。

## Dependency and decision gate

V09.1 的 V02.3/V07.3/V08.3 已 VERIFIED，ADR-18 已 APPROVED；待闭合的是 V09
本身环境/运行证据，不重新询问 ADR-18。V09.2→V10 及后续正式依赖仍保持原样。
新候选先检查其实际硬依赖；不通过并行施工或本文件制造 continuation/owner_approved。
任何未满足依赖的正式阶段保持阻断；可独立的既有接口准备不冒充其正式验收。

已定规则继续实施，不转回用户：D01 TGA B 单一 paired claim、D02 R 镜像/来源支持
CB净值、D03 GCU1:1与银行开局 reconciliation、D04物理运营约束、D06隔离权限/NPC约束。
ADR-03 已定10×一次、PAUSED零elapsed、RUNNING recorded-input catchup及 due-order；
不用“等待时钟政策”阻塞实现。生产宿主/凭据和真实来源批准仍各自独立。

## Change plan / 本批已经分配的精确边界

| 线  | 实际工作与独占文件                                                                                                                                               | 阻塞依赖 / 本批停止点                                                                                                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A   | 新 Worker `preparation/formal-financial-opening-{contract,producer}.ts` 及必要同前缀模块、专用tests/strictconfig；正式LC多batch确定性生产，不改旧guard或冻结源。 | 缺真实来源/完整性/valuation/adoption仍BLOCKED。先固定独立生产器；独审后才接现有preflight/publisher，同一seed derivation不分叉。                              |
| C   | 新web `office-command/{contract,client,controller,view}.ts`、`trusted-host/formal-session-adapter.ts`，host/bootstrap及entry薄接线、专用tests。                  | 三个现有manual families→queue ack→原ID/key/fingerprint FINAL→授权readback；server seat/provider真实输入缺失不伪造。Industry暂unsupported，等待真实Core候选。 |
| D   | 新Worker `runtime-preparation/writer-lease-supervisor.ts`、专用tests/config。复用现有真实SQL acquire/renew/fence，serialized/drain/uncertainty fail-close。      | 构造无SQL；无timer/cron/host启用；shutdown停止续期自然到期，不DELETE。完整Clock/consumer提取另等架构与schema独审。                                           |
| E   | 新 `E/IMPLEMENTATION_DESIGN.md` 与专用permission oracle准备；给精确DCL/admission/intake锁定设计。                                                                | B先审，之后才做branch-local SQL/DCL与独立角色PG验证；不注册manifest或执行生产权限。                                                                          |
| G   | 新 `G/IMPLEMENTATION_DESIGN.md`：跨服务runtime/source-preflight及session/seat契约，给具体方案比较。                                                              | B先审；之后实施真实ports/constructors，不只做READY外壳。不换Cloudflare pin、不部署。                                                                         |
| F   | 新 `F/V09_EVIDENCE_RECEIPT.md`；继承精确不变原artifact，只补真正缺的有界一次性nativePG证据；定位Industry已批准规范与现有kernel。                                 | 机制测试≠真实staging/TLS权限证据。Industry本批不改公共Core契约或E intake文件，避免未审依赖与冲突。                                                           |
| B   | 独立审G/E技术设计与可实施边界，后续按实际fixed A/C/D patch另做代码窄审。                                                                                         | Design review不等于代码批准。没有有权证据不改gate；报告未到不轮询/等待。                                                                                     |

### 总控的跨服务工程推荐：待独立设计审查，不是新权威凭证

优先维持已有 API＋内部executor topology。API守外部JWT/path/CORS/输入边界，受限
service binding只转发有界原始命令及真实bearer；内部executor重新校验当前授权/source，
在同一isolate构造真实同pool/clock/World的private intake/runtime，sole consumer归Worker。
跨网络只传原件及durable queue/FINAL结果，不传WeakMaptoken、READY或“source approved”。
API查询使用独立受限reader。bearer不写日志/构件，无任意URL、自动redirect或未知提交重放。

G须与API侧DB原子source-preflight协议比较，说明owner/import边界、current cutoff、
head/version/fence、timeout/cancel/UNKNOWN及恢复。E优先论证固定search_path、无动态SQL、
专有不可membership owner的受限锁定/入队原语，避免fixture对head/authz的宽UPDATE。
若技术方案确实触及人类保留的架构裁决，列具体差异，不把一般工程判断全部转交用户。

## Validation plan

每个候选：fixed commit/tree、逐文件scope、实际focused tests、strict types/build、
lint/format/boundary/secret/environment与风险适用检查。保留FAIL/UNKNOWN/NOT_RUN。
正常测试可用隔离生成向量证明机制，但不能升级为真实来源、席位、admission或开局证据。

- A：非1 FX精确转换、multi-currency conservation、七字段/CB完整性、missing vs sourced-zero、subset/source/version拒绝，不用JS浮点或补数。
- C：显式Review/Confirm、queue与COMMITTED/FINAL分离、exactIDs、UNKNOWN不重放、撤权/迟到/换国换Office/关闭DOM清理。
- D：真实PG双supervisor、续租身份不变、到期takeover/旧fence拒绝、UNKNOWN非就绪、stop/inflight drain。
- E/G：设计先独审；之后真实最小角色/当前授权锁定及executor private identity机制必须有实际隔离证据，不能用positive callback证明。
- F：已有不变证据可继承；只补当前缺项，不重复full/420。真实staging/TLS缺项明确INSUFFICIENT。

独立批准后才组合依赖；最终单一组合SHA集中跑适用CI。不对每个微提交重复全量。
本批不把设计/源码/isolated机制测试计为生产部署、真实六职位玩法或Gate B。

## Exit condition / 下一批

1. 收到G/E固定设计→B独审结论→仅按批准契约实现正式host/source/admission/权限。
2. 收到A/C/D固定代码→非实现方窄审→最小组合；再接preflight/publisher、真实session endpoint与Clock/恢复。
3. F在最终链做各角色真实命令→原子账本→FINAL→授权投影与普通恢复；Industry必须有真实已批准family，不以Finance成功代替。
4. 仍缺人类源值/完整性或持久权限事项集中见
   [用户输入与工程分界](../reports/start-ready-20261010/O/OWNER_INPUTS.md)。

未批准、失败或来源缺失保持HOLD。即使源码工程收齐，也不在本轮导入正式数据或启动经济。
