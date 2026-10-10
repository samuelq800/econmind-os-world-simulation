# E 独立 P0 审查 — D writer lease supervisor

日期：2026-10-10（Asia/Shanghai）。**决定：APPROVED，限此固定非激活候选。**
技能建议：`merge / human_review_required`（仅 advisory，不是自动 merge 权限）。
无阻塞性 findings；不修改实现，不批准正式 host、权限扩大、生产发布、Clock/admission 或 scheduler topology。
审查者 E 不是此 D 实现者；E 自己的设计 `68b0f49` 不属于本次 subject，也未修改。

## 不可变身份与范围

- 仓库：`samuelq800/econmind-os-world-simulation`。
- base：`42991acfee9d0eacc702ba47a380c938a4516f03`，tree `1254c4144279717c9075e9bbf07b4b2ac4710558`。
- head：`3b4406eb8129fffa8c54433433b11b8c6d25b03a`，tree `13ea4ec19e8fe6cbdb004148aab9cfe9bf35e15e`；实际 Git 对象核实。
- 精确 patch：`git diff --no-ext-diff --binary --full-index BASE HEAD`，见 [patch.diff](patch.diff)；
  SHA256 `2d1f68e4465c3f41d7a2e4339f606ff662f91490f09acaf0288b61c0ffb2565e`。
- 五个新文件，1044 additions：supervisor TS 385行、两个 tests、专用 tsconfig、D 报告。
  没有改 schema/migration/grants、Core、Postgres adapter、atomic repo、package exports、Cloudflare entry/config 或 status。
- subject 中旧 `D/README.md` 始终 untracked，不纳 scope。审查前后 HEAD 相同且 subject 无新改动。

源码 SHA256 `8f5a8f4565e8cf977506ce8aba06ce7296228c3e5653e4d94064d6254f64ff80`、
D 报告 SHA256 `6cc62db4e5b263b116814cca02d912d4417026660c2c903586a9a88268d819d0`，
均与 producer handoff 原始回执匹配。报告/hash/五文件清单不靠可变工作树推断。

## 语义与可达性

`createWriterLeaseSupervisor` 是 Worker-owned、显式输入 SqlDatabase 的准备 API。
构造无 SQL；acquire/renew/assertCanCommit 只有调用者显式调用才访问既有 lease/head。
它不读取环境密钥，没有 HTTP、timer、cron、consumer callback、release/delete/reset 或隐藏重试。
精确 head 中产品搜索只找到声明；直接消费者在两个新测试中。包 exports 和部署 entry 不变：
现有 executor 仍指向 `hold-executor.ts`，/readyz 503，无 lease/consumer。
这是有明确拥有者与后续用途的准备接口，不因“尚未挂载”就称 no-op，也不称 live activation。

`assertCanCommit` 在自己的 SQL transaction 内执行现有 commit guard，返回 Core assertion；
它不是跨事务 reservation。`AtomicTransitionRepository:966` 的真正经济事务内 SQL guard 保持不变。
本地 single-flight 只拒绝同实例重入，**不等于 DB single-writer**；两个实例仍由实际 SQL lease 竞争。

## 边界反例与合法控制

行号均属于固定 head 的 supervisor；SQL 为未改 0005/0006 与现有 adapter。

| 边界                                                      | 最强具体反例                                                                 | 合法控制与追踪结果                                                                                                                                                                        |
| --------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 实际身份 / World（117–158）                               | admin SET ROLE、configured-role mismatch、缺 World                           | 同时核 current_user/session_user、role flags、schema/对象/函数权限与实际 World；调用敏感 SQL 前后均核验。native role/superuser/World denials支持，未凭配置名宣称已有角色。                |
| acquisition / generation（239–289）                       | 第二实例用相同 holder 将 RENEWED 认作新启动；旧实例续租时远端已 takeover     | 初始仅 ACQUIRED/TAKEN_OVER；renew 先锁 lease 并比较完整 prior tuple，再要求同 fence/acquisition、RENEWED 与延长期限；错误整事务 rollback，不静默 reacquire。                              |
| DB single-writer / stale assertion（318–354）             | 本地 ACTIVE 已被 takeover，或预检后实际 commit 前又失去 fence                | native 真实双实例只一个成功；真实 SQL 拒绝 stale holder。0005 guard 锁 lease→head 验 holder/fence/expiry/version；经济 repo仍在自身事务再验。预检不授予经济提交权。                       |
| UNKNOWN（207–218,287–289）                                | 实际 acquisition 已 COMMIT，ACK丢失；cleanup/release异常                     | 仅 transaction 完成才安装 confirmed lease；只有明确 ROLLED_BACK归REJECTED/LOST，其他关闭为UNKNOWN，无自动重试。native real-COMMIT wrapper与独立release失败负控支持。                      |
| drain / late connect / cancelled query（292–301,378–382） | connect未返回，查询取消后rollback仍pending，或同步release抛错却提前报drained | accepting立刻false；捕获唯一active promise并等待结算；active包含connect/transaction/同步release。三个独立负控均通过；LOST/UNKNOWN保留，stop只设置STOPPED而不清failure。                   |
| stop / persistent lineage                                 | 停止时DELETE/reset fence，或未到期就让新holder启动                           | 没有lease释放写；停renew等自然过期；native stop/renew barrier、DELETE veto、到期后fence2支持。                                                                                            |
| Clock / activation                                        | 把status.ready、建议alarm或preflight当正式启动批准                           | ready仅本地显式时点观察，远端状态需SQL；无host mount/Clock/admission/economic callback。ADR-03已批准时间规则，但production topology仍另待有权裁决；本审查不采纳D的hosting建议为生产决定。 |

时间戳/整数/duration/millisecond alignment、绑定world/holder、expiry-overflow在SQL前拒绝、
borrowed database port/scalar捕获亦已逐项追踪。未添加任意SQL/参数化role标识符入口。
如果底层连接永不结算，drain会保持pending，不伪报完成；连接/查询timeout及整个consumer生命周期仍由后继host契约负责。

## 检查与计数归属

独立执行在精确 head 的 disposable clone，Node24.20.0；复用相同锁文件的已安装依赖。
`env -i` 无凭据；sandbox禁止网络、禁止读用户目录（仅允许固定Node runtime），所有写入限本次临时审查目录。
subject checkout及其Git目录不执行/生成测试产物。

| 检查                                                            | 本轮结果 / 归属                                                                                                                                                          |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Core build、Worker build（tsc -p各build config）                | 独立exit0                                                                                                                                                                |
| `tsc -p tests/world-core/writer-lease-supervisor.tsconfig.json` | 独立exit0，strict配置未弱化                                                                                                                                              |
| 两个unit/Core文件重跑                                           | **独立25 PASS / 0 FAIL / 0 SKIP = 20新supervisor + 5既有Core**；[independent-unit.json](independent-unit.json)                                                           |
| 实际PostgresSqlDatabase负向传输控制                             | **独立3/3 PASS**：late connect拒绝前stop不完成；57014取消后等rollback ACK和release；同步release错误保留UNKNOWN；[源码](drain-controls.mjs)、[结果](controls-result.json) |
| producer完整原始单测                                            | 25 PASS =同一20+5，哈希匹配；不与独立重跑相加                                                                                                                            |
| producer真实native PG16.15                                      | **继承7 PASS / 0 FAIL / 0 SKIP**；没有重新运行；[原始JSON](producer-native-final.json)                                                                                   |
| producer原始前后只读证据                                        | 同一system_identifier，初始无world_v2，最终6 lease / 7 synthetic version0 heads、submissions/queue/event/receipt/outbox均0；六项原artifact ledger原样；不冒充经济闭环    |
| 精确diff / 未变路径                                             | exit0；schema/config/adapter/atomic repo/status/package exports无差异                                                                                                    |
| patch-risk schema validator                                     | `launch_codex_security_mcp --helper validate-patch-risk-assessment assessment.json` exit0                                                                                |

**生产者32项 = 20新unit + 5既有Core + 7真实native**，不是32个新测试。
独立3个负控使用实际未改adapter和伪连接的错误/等待，不伪造肯定lease rows、authority或economic outcome。
没有重复全量native/full/420/CI，不把继承native改称独立native。

启动审查clone时一次checkout命令cwd在clone父目录而失败；随后在clone内detach固定SHA成功。
未作用于subject；没有删改失败记录或因此改动patch。

## 原始证据完整性

| 原件                       | 实际重算SHA256                                                     |
| -------------------------- | ------------------------------------------------------------------ |
| producer-native-final.json | `68c06d9159e24089ba304c5a0cfb4b2654d8bff3948f798a6a9ca3e3fdab204e` |
| producer-final-unit.json   | `a892208bac999ab18e7fbb7ae7f903fb4d2ba726953992c00df31173c4316d02` |
| producer-pre-readonly.txt  | `6c412085d1f823abeb8a3b2fb777359674bcd48e5e2b160444d62fdf27028176` |
| producer-post-readonly.txt | `3167dc051b51a6769632a9f0b3513b99e911a2595c97368cdbbbbf2a7f091226` |
| independent-unit.json      | `1415925a1e1658dd1737f1142479c261e95323db5556a2eba1753818b3832522` |
| controls-result.json       | `c15b6318a50588a8a5c02b579972e68f11b706701a73e3cff5f654aa71849c00` |

原件通过managed artifact工具保留，源文件与producer handoff均未改。
native fixture在连接前调用不变V09 local/CI loopback guard与完整current/frozen provenance校验，
随后只安装原0001..0006；原始readback核对相同generation。
local trust和限定fixture grants不是生产认证或最小权限证明。

## 风险、恢复与未覆盖

- impact **high / P0**：若未来调用错误，会影响lease/fencing和可用性；绿色测试不降低影响。
- regression likelihood **moderate**，protection **partial**：关键变更路径有实证，formal host/consumer/真实进程kill不在本patch。
- recoverability **managed**：当前没有部署或migration；后继可禁用/卸载caller、停renew，保留lease自然过期，不DELETE或重置fence。
- confidence **high**：固定Git/patch/source/report/原始证据与直接反例均可追踪。
- status-quo risk **low**：不合并仍保持HOLD，只延后准备接口；不能以赶进度自动合并P0。
- auto-merge排除：privileged boundary、persistent state和repository P0独审规则。

非阻塞**后继集成限制**（不是本候选的生产批准）：
当前bind要求table-level lease/head权限，未证明与E后续column-only/definer DCL兼容；
不得为让它跑通而自动扩大真实grants。正式host挂载时要独审权限契约与调用者唯一holder identity。
supervisor drain只覆盖自己SQL，不覆盖consumer/pool关闭/Clock；整体drain必须在后继caller实现测试。
无正式admission/registry/source、Hyperdrive/TLS、production角色、真实网络故障或populated economic settlement证据。
private alarm/coordinator只是engineering proposal；production topology/resource creation仍需有权裁决，不能由本APPROVED推出。

## 决定与停止边界

**APPROVED：固定五文件source-preparation候选，无需本轮代码修订。**
结构化建议与边界见 [assessment.json](assessment.json)，其schema已验证。
本决定不自动merge，不更新status/gate，不批准依赖整合的其他候选，
不授予生产权限、发布/部署/启动，也不批准E自己的设计。
本轮只产出独立review artifacts，未push/merge/deploy/访问数据库；报告后STOP。
