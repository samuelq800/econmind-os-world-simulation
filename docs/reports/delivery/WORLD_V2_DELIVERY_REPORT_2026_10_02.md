# EconMind World V2 — 检查、发布与剩余工作交付报告

日期：2026-10-02。World 仓库：`samuelq800/econmind-os-world-simulation`。
本轮代码基线：`305cf27901412053b32b10e8d24b69e75b3dbb09`（#38 接线及 #39 入口修复合并后）。
这是事实交付报告，不是 Gate B 批准书，不修改经济规则或正式步骤状态。
地图与入口修复已上线且浏览器验收通过；只读 API 生产门槛明确 BLOCKED，未完成项不会写成 PASS。

## 一、结论与范围

大量引擎、地图、六职位界面和数据读取代码已经进入 main，完整的选定国家资料已经保存在生产 Supabase。
但**源码集成不等于完整游戏上线**：生产数据库的 PUBLIC 有效权限不满足隔离要求，只读 API 暂不激活；六职位未接正式经济命令、执行和回执。
页面可展示和本地演练，不能据此声称真实预算、库存、价格或交易已被改变。
Gate B 仍为 `PENDING`；本轮没有创建正式 OpeningSeed，也没有启动 Worker。

本轮按用户“检查发布后汇报”和继续调用 A–F 的授权推进。普通 World 与 Season 1 共用一个权威 World/Core。
大厅、队伍/人员/职位分配明确延期，不阻塞公共来源读取。原网站产品文件及 `public` / `auth` / `storage` 业务数据不在修改范围。
原网站仓库只承担已批准的唯一受控数据库发布链，不是此次 UI 的部署目标。

### A–F 本轮交付与责任

| 窗口 | 本轮结果                                                                | 边界                                                |
| ---- | ----------------------------------------------------------------------- | --------------------------------------------------- |
| A    | #37 Edge reader、#38 前端接线均固定候选审查通过并合并                   | 前端生产配置不启用，经济命令未接通                  |
| B    | #37 明确 CODE_MERGE_GO；#81 发现/复核有效权限缺陷及新版本 MAINTAIN 遗漏 | 独立审批代码，生产 RELEASE_HOLD 与代码结论分开      |
| C    | main `8efe907` 引擎/因果/开局/Gate/V29–32 只读盘点                      | 未改经济参数、未重跑长测、不以版本数计算完成率      |
| D    | 六职位字段/来源/本地操作矩阵；#38 独立增量 MERGE_GO，37 测试通过        | 未重做页面，真实 API 烟测因环境阻塞未运行           |
| E    | #81 发布守卫修复、源锁、单次生产 metadata 取证与非秘密证据              | 当前生产 BLOCKED，不设置凭据/LOGIN/函数，不动旧 ACL |
| F    | #35 新地图线上验收；#39 所选国家入口修复及线上点击 PASS                 | 未重跑性能/经济或启动模拟                           |

Control Tower 负责固定 SHA 合并、范围裁决、README/本报告和最终交付；不是向各窗口派发后就把结果算完成。

## 二、完整来源数据，而非只有国家摘要

选定基线为 `BALANCED_2026_09_28_V1`，不是较早地图锁定包。
唯一选择记录：[world-data-selection.json](../../../status/world-data-selection.json)。

| 范围       | 已有内容                                                                                                   | 边界                                                              |
| ---------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 国家       | 70 国，`visual-territory-01` 至 `visual-territory-70`；人口 14,712,146,434                                 | 选定开局来源，不是运行中的 World State                            |
| 原始资料   | 87 件来源文件含 checksum 清单，生产保存为 278 条不可变资料记录                                             | 保留原件、来源、精确数值，不臆造缺值                              |
| 结构化资料 | 34 类 JSON：地理、气候/灾害、矿产、设施、金融、库存、生产、水、电力、就业、社会服务、运输及贸易/许可提案等 | 142 条存储记录 = 23 个完整根记录 + 119 个分块；重建得到 34 个摘要 |
| 基础数量   | 1,374 个设施、240 个矿藏、122 个区域、12 类商品、840 个库存单元（619 正库存）、350 个旧实体发展选项        | 发展选项不是额外设施，提案不是已执行事实                          |
| 地图包     | 203 件文件 = 160 图像（90 PNG + 70 SVG）+ 43 支持文件；140 件按国家关联，63 件全局                         | 有来源/哈希不等于全部生产 URL 已验收；203 件不是 203 张图像       |

清单 SHA-256：`88dd44478f97d2e8893a4f11b3aaf96e256bdb13248aca0d08f097fabe10d315`。
完整覆盖见 [C 来源报告](../world-connection/C_OFFICIAL_WORLD_COMPLETE_COVERAGE_REPORT.md)。
源十进制与字段性质保持不变。维护/建造 Proposal、贸易计划、水权、电网、岗位、许可和 NPC 身份不能仅因入库就变成已执行权利或经济事件。

## 三、数据库与只读连接

唯一生产 Supabase 项目：`vimksjrhaxdpnkvgsavz`，World 资料限定 `world_v2`。

| 项目              | 证据/状态                                                                                                                                                              | 不代表什么                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 来源导入          | 先前生产回读确认平衡包、70 国、人口与来源身份/hash                                                                                                                     | 不代表 OpeningSeed 提交                                                            |
| 0020 reader       | 独立只读审计 [36657427073](https://github.com/samuelq800/econmind-os/actions/runs/36657427073) 成功，核对 ledger/角色边界                                              | 不代表可用 LOGIN 或部署 API                                                        |
| 0021 完整来源权限 | 受控运行 [36672349466](https://github.com/samuelq800/econmind-os/actions/runs/36672349466) 成功：ledger 20→21、policy 2→3、142 行重建、34 摘要及来源状态保持           | 不代表经济执行、浏览器直连数据库                                                   |
| Edge 读取代码     | World [PR #37](https://github.com/samuelq800/econmind-os-world-simulation/pull/37) 经 B 固定 SHA 审查后合并为 `8efe907`                                                | 合并不是部署                                                                       |
| 服务器凭据与部署  | #81 经 B CODE_MERGE_GO 与 CI37008877520 后合并为 `7b4db3b8cbdb1db86288a1172896ac9bb8febaa4`，发布守卫/源锁/报告已进入原网站 main                                       | 生产 RELEASE_HOLD：两角色 NOLOGIN，没有新 secrets/函数部署；只合并安全准备代码     |
| 前端真实 base URL | [PR #38](https://github.com/samuelq800/econmind-os-world-simulation/pull/38) 经 D 独立审查、37 聚焦测试及两 CI 成功后合并为 `36cb6bb4b015ca622f7e5303b298d84a09daf356` | 构建注入与 Edge 子路径已实现，生产变量未设置、仍 DISABLED；不声称真实 fetch 已通过 |

0021 [非秘密发布归档](https://github.com/samuelq800/econmind-os/blob/31d37dc8f700bec4e4cbbd6f29e9cf52e74babdc/docs/WORLD_V2_0021_FULL_READER_RELEASE_2026_09_30.md) 保存固定 run 与证据摘要。
`2026-09-30T00:24:15Z` 的记录是 `world_head=0`、`opening_seed=0`；引用的是当时回读，不假称本轮又查过生产。

### 本轮生产权限取证：运行绿灯，但发布 BLOCKED

E 仅执行一次授权的 metadata 只读查询：[37007399395](https://github.com/samuelq800/econmind-os/actions/runs/37007399395)，head `d931c367b46ffa18716fac359cb75c0df2c9f1cc`。
它成功保存证据，不表示许可通过。实际结果为 `WORLD_V2_EDGE_EFFECTIVE_ACCESS_BLOCKED`。
覆盖 14 schemas、216 relations、452 routines，核 login/reader 两身份及 SET 角色闭包；两角色仍 `can_login=false`，migration_count=21。
404 个有效权限项包含 8 合法列权限，但还包括 357 routine、5 schema usage、6 sequence 和 28 table 项。
两身份对 `net._http_response` / `net.http_request_queue` 有全部 7 类表权限，对 `net.http_request_queue_id_seq` 有 USAGE/SELECT/UPDATE。
login 有 169、reader 有 188 个可执行非白名单 routine，其中各 140 个 SECURITY DEFINER；取证只查 catalog，没有调用函数，不能据此断言业务鉴权绕过。
示例为 `public.set_league_platform_role(uuid,text)` 与 `public.set_live_auction_balance(uuid,numeric)`，不得在本轮调用。

Control Tower 独立检查非秘密 artifact 的实际 status 和角色标志，未再查生产。
`effective-permission-evidence.json` SHA-256：`ba97c4373ba0849c7f4700e51b93802d362f3a6120d837bd0bb1a4822433094e`。
`control-plane-evidence.json` SHA-256：`c76dadf1aa46b7e29a6196fe7e37c7d5e7c339cb10eaa206dea95cc818e497df`。
PUBLIC 权限影响所有角色，NOINHERIT 或角色自己的 REVOKE 不能消除它；当前旧站保护范围内不能直接全局撤销。
故本轮不设置新凭据、不启 LOGIN、不部署函数、不启前端生产配置，也不重放 0021。只读权限门槛修复和真实生产隔离是两件事。
上述历史取证枚举未含 PostgreSQL 17+ 的 MAINTAIN 表权限；它已独立证明 BLOCKED，但不得把其对象覆盖数冒充所有权限类型完整放行证据。B 在收尾回归中发现该遗漏，E 在最终候选 `6466d72729959d9e9c4eb053a983b4fd9958cc8b` 补齐共享投影、事务内复查与 PG17 原生负例。该候选另把生产 HOLD 硬编码在工作流第一步；解除 HOLD 需要新的审查，不能靠 dispatch 参数绕过。本轮无需重复生产查询来再次证明已知阻塞。

完整 [E 非秘密 readiness 报告](https://github.com/samuelq800/econmind-os/blob/6466d72729959d9e9c4eb053a983b4fd9958cc8b/docs/WORLD_V2_EDGE_READER_READINESS_2026_10_02.md) 保存实际 pooler、旧七函数版本/hash/源码读取名称、生产 catalog 结果与安全边界。最终代码 CI/独立审查结论单独补在收尾记录，不将生产 HOLD 标为已关闭。

### 明确的数据连接点

路径为 **GitHub Pages → Supabase Edge Function → 受限 PostgreSQL reader**。Pages 不运行 Node API 或 Worker。

- 前端：[World 页面](https://samuelq800.github.io/econmind-os-world-simulation/)。CORS origin 为 `https://samuelq800.github.io`。
- 新函数 `world-v2-official-read`，计划 base URL：`https://vimksjrhaxdpnkvgsavz.supabase.co/functions/v1/world-v2-official-read`；尚未宣称上线。
- 读取入口包含 `/v1/world-data/countries`、国家详情、`/v1/world-data/datasets`、单资料分页、地理分片和地图目录，以固定合并代码的路由为准。
- 运行身份 `world_v2_api_login`，只读身份 `world_v2_api_reader`；不用 admin/service-role 捷径。实际事务池地址已由受控 GET 确认为 `aws-0-ap-northeast-1.pooler.supabase.com:6543`，连接须 TLS；当前角色仍不可登录。
- 只读事务、固定 SQL、超时和分页上限，十进制保持精确字符串。只开放批准公共来源，不开放命令写入；地图目录 `publicUrl=null` 的缺口单列。
- 连接串等 secrets 不进页面、`VITE_*`、报告或日志。Edge secrets 是项目级，不能假称仅一个函数能访问。

函数目录树：`0e64ed6243ec5d38bfa332b1a601129d329c382b`。
PR #37 审查目标：`43322811eff235500490b748449ba0c030476d65`；[Edge CI 36676782573](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/36676782573) 和 [官方/native CI 36676782505](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/36676782505) 均成功。

## 四、地图和页面交付

滚动/尺寸 [PR #33](https://github.com/samuelq800/econmind-os-world-simulation/pull/33) 已合并，Pages [36667807757](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/36667807757) 成功。
已有桌面 `1280×720`、移动 `390px` 浏览器证据：页面/抽屉可滚动，地图适配，移动无横向溢出。

首页地图 [PR #35](https://github.com/samuelq800/econmind-os-world-simulation/pull/35) 合并为 `b3b59e3f405f14815344245c05ba10110a26c725`。
复用已交付的 4 大陆图和 70 国家边界，提供平移/缩放/聚焦/国家操作入口；源图像字节与经济数据未改。
固定候选 `42beb8a9fc871336126f8c718f0ebe843039ff30` 的 [CI 36668349897](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/36668349897) 成功，B 代码审查无 BLOCKER/MAJOR。
地图独立第三方公开分发权凭证仍为 `UNKNOWN`；本轮记录用户对既有选定项目资产的发布授权，不伪造版权证明。

最终 Pages [37005892239](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/37005892239) 已成功，deployment `6808318585` 绑定 `8efe907592006ea5491c341f4c54bed75bfd107f`。
F 已在实际网址集中验证桌面/手机：4 大陆、70 国家项、41 条河/30 湖/7 山体；桌面 viewBox 1900→1235 并可恢复，选 01 进入 Avenor；390px 选择 70 Rhea 可显示其 3 个设施候选。
角色页桌面 scrollTop 0→210，手机 0→376，抽屉 0→657；页面宽 390/390 无横向溢出，地图/角色页 console error/warning 均为空。
“国家操作”固定 01 国的问题已由 [PR #39](https://github.com/samuelq800/econmind-os-world-simulation/pull/39) 修复并合并为 `305cf27901412053b32b10e8d24b69e75b3dbb09`。固定候选 `7bc1ec9f9309b39428ed9369560cc32432eda9e8` 的 26 聚焦测试及 [CI 37007603136](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/37007603136) 成功。新 Pages [37007770659](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/37007770659) 成功，deployment `6808567801` 绑定同一 merge SHA。F 实际选择 70 Rhea、点击一次国家操作后落地 `?role=finance&country=70#country`，title 为 Rhea · Finance Minister · EconMind，画面有 Rhea/SEASON1、SF328 Lithium mine、14 Local sites，非 Avenor；console warnings/errors 为空。本修复线上验收 PASS，未重跑全图/性能/经济测试。
接受的性能边界：初始 14 请求约 16.19 MB，比旧稿传输少约 32.5%，不初载 70 SVG，放大后按视窗加载。
本地缓存关闭、10 Mbps/100 ms 下控件约 0.8–0.9 秒可用，大陆完整图像约 13.5 秒完成；不是生产 SLA，不能承诺弱网秒开。

### 重要剩余项：新首页地图的数值层尚未统一到平衡包

Control Tower 对主线文件做一次定向来源核对发现：新根首页 `WorldExplorer.tsx` 仍 import `map-lab/geographic-scenario.json`。
国家场景人口、设施候选数、区域数和设施详情来自该 illustrative 图层；这个文件的 70 国人口合计是 **14,714,012,813**、设施候选 **350**，不是平衡包的 **14,712,146,434 / 1,374**。
这解释了地图 Rhea 的 3 个候选与正式来源角色页 14 个 Local sites 的差异：两处尚未共用数值层。
地图交互/入口验收已通过，不等于它的所有数值已正式接线。六职位开局包与原地图原件不重写，但新首页的动态数字/详情需接选定官方来源并明确资产点位与经济设施的对应关系。
不能只改总数标签而把旧设施详情继续冒充正式数据；此项列入下一轮实际功能接线，不在本轮报告工作中擅自扩成页面重设计。

## 五、六职位：已有显示与未接通功能

D 对 main `8efe907` 只读核验以下矩阵；所有角色都可浏览完整 34 类来源，而不是仅 Finance。

| 职位                    | 已显示的选定来源指标                            | 优先来源                                                                                                        | 当前操作                              |
| ----------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Captain                 | 人口、设施数、矿藏数                            | countries / regions / facilities / population-services / hazard-proposals / land-program                        | 地点、优先级预览，保存本地计划        |
| Finance                 | Treasury/CB 合并余额、设施维护 Proposal、设施数 | finance / stocks / trade-plans / facilities / countries                                                         | 覆盖天数/假设支出，本地记录，不扣账本 |
| Central Bank            | 储备、存款负债、权益                            | finance / countries / entities                                                                                  | 分配比例预览，不执行清算/利率/外汇    |
| Industry                | 电力、工人需求、建造期 Proposal                 | facilities / deposits / production-plans / recipes / power / water-allocations / employment                     | 电力覆盖预览，不开工/生产             |
| Trade / Foreign Affairs | GRAIN 库存、日需求参考、矿藏数                  | stocks / trade-plans / transport-routes / transit-proposals / commodity-catalog / supplier-concentration-policy | 运输比例预览，不生成订单/在途/到货    |
| Social                  | 劳动力、失业候选量、设施工人需求                | population-services / employment / settlements / water-allocations / hazard-proposals / facilities              | 人力覆盖预览，不生成岗位/培训/接诊    |

确认按钮统一保存 `LOCAL_NOT_EXECUTED` 到 `localStorage`。目录有 120 业务模块，但国家模式深入模块被拦截，不能计为 120 个正式操作。
静态 HUD 不自动被来源响应改成实时状态。离线 Finance 样例拨款/发债/付款也不是生产结算。

证据：`apps/world-web/public/season1-immersive/country-game.js:18–20,45–69`；`country-context.js:105–268,284`；`scripts/sync-official-ui-country-data.mjs:116–220`。
独立 React authorized-client/controller 仍是未挂载准备；代码存在不能代替当前页面真实连接。

## 六、引擎、数字因果、V29/V30 的真实边界

| 已有代码      | 可证明能力                                                                                    | 不能推断                                              |
| ------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| V11           | 人口存量/流量、成对迁移、技能岗位匹配/分离                                                    | 工资断言不是已支付工资                                |
| V12–18        | 资源库存、能源/生产、科技项目、社会服务、家庭/财政的确定性基础                                | caller 显式输入不证明自动跨域调度                     |
| V19–24        | 银行双记/偿还/NPL、央行/货币量、FX/外债、订单/关税/合同、统计/风险/政治危机基础               | 不证明完整真实清算、合同权利、GDP 输入或政策已运行    |
| 数值因果      | 150 个具名 C001–C150 通道；Money/物量/价格、系数/延迟、before/delta/after、单位/负值/重复拒绝 | 部分仍 index_point，不能称 150 条全部运行的真实经济链 |
| ledger/replay | 精确资金/库存守恒、seed/event/random/state hash、版本绑定与持久重建                           | 窄 fixture replay 不等于正式 70 国 World              |

证据目录：`docs/reports/integration/V11_V18_FOUNDATION_*`、`docs/reports/V11_V18_CAUSAL_CHANNEL_PREPARATION/IMPLEMENTATION.md` 和各 V19–24 acceptance 报告。
数字因果最终应证明：授权决策 → Event → 前后数值/金融与库存 Posting → WorldVersion → durable receipt → 可重复回放。目前默认页面未完成此生产链。

原生 PG 两次 Deliver [35973174009](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/35973174009) 证明合成 Reserve/Ship 前置后的版本 4→5→6，每次 2 吨/6 GCU，丢确认重试 `EXISTING_FINAL` 不双记；不是完整交易或全世界。
现有 durable HTTP/三签/approval reference 可到 `QUEUED`，仍缺可信 actor/member/proposal resolver、重启后授权上下文恢复与 Reserve runner。
Worker runtime 明示 `simulationEnabled:false`，没有正式 clock/tick 的全域执行证据。

- V29 离线平衡包 `check.py` 实际跑过 600 日、临时副本跑过 1,000 日；[报告](../V29.2/BALANCED_WORLD_ISOLATED_RUN_2026_09_28.md) 明示固定设施/recipe/计划贸易与 float tolerance，不是 Core 授权交易、内生价格或全金融账本，正式 70 国长跑 `NOT_RUN`。
- V29.1 的 139 项证据 claim 默认未绑定/MISSING；不能误称 139 项全部没代码，需给已有模块绑定规范、代码、测试、SHA。
- V30 有有界负载 runner、权限负例、恢复准备；真实 50/100/420 会话 P50/P95/P99/资源、部署权限与共享主站 SLO 尚未验收。
- 原生 PG16 小样本备份恢复 [36388204579](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/36388204579) 成功；[174 ms RPO / 303 ms RTO](../V30.3/LEDGER_RESTORE_2026_09_28.md) 只属微型合成样本，不是正式灾备承诺。

正式 `status/progress.json` 与已合并准备代码有记录差异：V09 之后仍 PLANNED，ADR-18 旧阻塞文字与批准记录不一致；单 World 与旧 ADR-14/V28 两 orchestrator 文本待治理对齐。
C 的限定检索未找到 Gate C 明确定义/闭合记录：`NOT_FOUND/UNVERIFIED`，本报告不新造 Gate C。
V31–V32 灰度、切换、归档、运营尚无接受报告，不宣称完成。

## 七、发现的错误与处置

| 问题                        | 处理/状态                                                                                                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR #81 有效权限遗漏         | 初始 PUBLIC 有效权限缺陷与收尾 MAINTAIN 漏项已修复，B 对最终6466d727判定 PR81-MAJ-01 CLOSED、代码 OPEN_BLOCKER=0/OPEN_MAJOR=0；生产 PUBLIC/net 权限仍 BLOCKED，不等于已修旧站 ACL |
| API 发布 smoke 只查静态目录 | B 要求新增真正 countries 数据读取与 CORS；目录绿不能证明 pooler 连通                                                                                                              |
| 页面配置拒绝 Edge 子路径    | #38 已修复并合并，D MERGE_GO；page-config 37006973467、atlas 37006973650 成功；生产仍 DISABLED                                                                                    |
| 地图选国后操作入口仍固定 01 | #39 已修所选国家链接，01/70/full IDs/未选/非法选择回归通过，merge `305cf279`；新版本线上点击另验                                                                                  |
| README 过期                 | 更新 #33/#35/#37 与 0021 实际状态，保留旧报告日期/失败历史                                                                                                                        |
| 0020 首次取消               | 历史 UNKNOWN 保留，后续成功审计是独立证据                                                                                                                                         |
| 0021 分块前检误判           | `36668095506` 在写前跳过；修正后另一次授权运行成功，不算重放失败迁移                                                                                                              |
| 图像加载慢                  | #35 降初载与视窗加载，保留约 13.5 秒限制，不隐瞒弱网成本                                                                                                                          |

## 八、剩余工作按优先级排序

1. **先裁决只读凭据隔离路径（E/B）**：生产 catalog 已证禁止权限，保持 NOLOGIN。单个角色不能通过负向 REVOKE 抵消 PUBLIC 授予。需单独审查保持旧站不变的隔离方案，或用户明确扩大旧站 PUBLIC ACL 范围后评估精确影响；不能用 admin/service-role 或只读 GUC 代替最小权限。此轮不擅自改旧站、不创建付费基础设施。隔离通过后才部署、验证 country/34 类/hash/decimal/地理/CORS、启用已合并的 #38 配置和浏览器烟测。
2. **统一新首页地图数值层，并补目录 URL 证据**：#39 线上点击已 PASS，但新根首页仍用旧 illustrative 人口/350 设施候选。下一轮在保留图像/交互的前提下绑定完整平衡包指标/设施详情，明确静态点位与正式设施对应，不只替换总数标签。另核所有地图交付 URL；不重跑已通过的全图性能。
3. **C/F 解决正式开局六类语义**：唯一 World ID；70 国正库存合法 title/risk 主体；场景货币→Core GCU；Treasury/CB 拆分；56 负债/62 权益尾差（最大 0.00001/0.000017）的明确规则。源数据不静默 round；准备提案需独立 P0 审查。设施/许可、水权、通电、岗位和社会资产另需域 adoption/执行授权。
4. **A/D 与 Worker owner 接真实玩家闭环**：席位授权、projection/WorldVersion、幂等发送、异步执行、持久回执、刷新数值与事件追踪；复用既有引擎而非造第二模型。队伍名单仍延期，最终身份权威不可凭空编造。
5. **B 定向闭合 Gate B**：专用非生产 staging/TLS/connection-loss、真实部署 role/JWT→GUC 权限、双国双职位 browser→Command→Worker→FINAL receipt→projection→refresh、最终固定候选独立审查。既有证据不重复乱跑，只补真缺口。
6. **V27/V29/V30 完整验收，再 V31/V32**：70 国开局/NPC/单 Orchestrator、规范证据绑定、授权 Core 长跑/完整 replay、合理实测负载/权限/恢复/共享 SLO；再灰度、切换、赛季归档和 48–72h 运营交接。

不按版本编号给虚假百分比：**展示和来源保存已充分；只读连接代码已齐，但生产凭据被共享 PUBLIC 权限明确阻塞；授权经济闭环与正式验收仍是实质工作。**
原网站 PR #50（队伍 lifecycle）与 #36（School Leader）不属本轮交付，不因“所有稿件”就合并。

## 九、收尾检查记录

PR #81 最终代码候选为 `6466d72729959d9e9c4eb053a983b4fd9958cc8b`。
同 SHA [CI 37008877520](https://github.com/samuelq800/econmind-os/actions/runs/37008877520) 的 verify、member-identity-database、season1-database、world-v2-edge-role 四 job 均 SUCCESS。
B 已独立验证合法基线/激活正例及 8 类权限拒绝：PUBLIC 表/列/SD/sequence/schema CREATE、reader 额外 SET、PUBLIC MAINTAIN、reader 直接 MAINTAIN；前检和激活事务拒绝均保留 NOLOGIN。
生产环境禁止权限仍 OPEN，旧站 ACL 未改。B 最终结论为 `APPROVED_FOR_CODE_MERGE / RELEASE_HOLD`，PR81-MAJ-01（含 MAINTAIN）CLOSED、代码 OPEN_BLOCKER=0/OPEN_MAJOR=0。
Control Tower 于 `2026-10-02T12:52:28Z` 按授权将固定候选合并为原网站 main `7b4db3b8cbdb1db86288a1172896ac9bb8febaa4`。只合并代码/报告，未 dispatch 生产 release；API live smoke 仍 NOT_RUN，Gate B 仍 PENDING。

本轮已完成稿件 #35/#37/#38/#39 和原网站 #81 全部在对应 main；README/本报告通过 [World PR #40](https://github.com/samuelq800/econmind-os-world-simulation/pull/40) 发布。
A–F 的本轮任务均已交付停止，Control Tower 在归档后停止；不存在后台继续尝试 LOGIN 或模拟的授权延伸。

### 文档检查

README/本报告为 P3 非行为变更，检查限改动文件格式、相对链接和 `git diff --check`；不为文档重跑经济全量，也不新增生产读写。
测试只绑定各自 SHA，合并不自动证明部署；历史 UNKNOWN/NOT_RUN/FAIL 与边界保留。
各窗口返回新候选/生产结果后仅补对应证据，不覆盖历史原件。
