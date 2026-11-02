# World 当前阶段逻辑、代码与运行内存优化方案

日期：2026-10-31（Asia/Shanghai）。状态：提案；运行收益 `INSUFFICIENT_EVIDENCE`，性能实验 `NOT_RUN`。本文完成代码调查和实施设计，不表示实施、独立审查通过或生产部署获准。

## 1. 决策摘要

> 2026-10-31 二次复查：近期实施优先级以文末第 11 节为准。先精简同一可信操作内部的重复证明与对象重建；第 5 节的 checkpoints、流式 canonical 和复杂产物协议保留为有条件的后续方案，不作为首轮必做清单。

先保留 Supabase 数据与身份、静态前端、GitHub 交付、Node 权威执行的分工。以“一个 World 一个受控执行顺序”为核心，优先减少启动阶段的大对象重叠、重复重建与在线重复读取。不要先拆微服务、增加六个 Office 消费者、迁移整套数据库或采购高配机器。

近期目标是证明完整候选运行路径能否在 2 GiB 宿主预算内可靠工作；4 GiB 是未优化版本的保守试验候选，不是已证明的最低要求。若优化和测试不支持 2 GiB，保留 4 GiB，不以降低经济正确性换容量。CPU、存储和数据库费用需要单独测量。

第二条独立主线是长期运行能力：候选代码存在完整历史前缀 256 事件/版本、约 1 MiB 的显式限制。它不是内存泄漏，而是受控范围。正式长期运行前，需要证明目标玩法不会触及限制，或完成经过审查的分页/检查点恢复机制。不能把界限调大后宣称可长期运行。

## 2. 权威、版本与调查边界

本方案依照 `templates/EXECUTION_PLAN.md` 的权限、依赖、变更、验证和退出结构，任务拆解字段参考 `templates/TASK_PACKET.md`。

- 本地 main：`14595f81caec2ed5ce7cec564d7db9609b693718`，简称 M。
- 开发候选：本轮读取时 `origin/codex/office-operations-followup-20261030` 指向 `055143a53d6b0e66b2703d97814e21fafdb59062`，简称 C；分析以此不可变提交为准。分支名会移动，执行前重新绑定明确候选，不把 main 和 C 拼成已部署版本。
- 原始 `requirements.docx` 已通过只读解包核对相关文字；`specs/extracted/CONSTITUTION.md` 用于定位 One World、精确数值、10x Clock、原子结算、Snapshot 和性能规则。
- M 的 `status/progress.json.current_gate`：V09.1 / PLANNED，`next_step_ready=false`，隔离持久化/并发/runtime 证据待补；ADR-18 已批准隔离范围，不等于生产批准。
- 本次授权为调查和方案。实施前必须读取目标候选的 progress、decisions、对应工作包硬依赖及明确续行记录；本文不新增 R2 已批准步骤、不改 gate、不替任何 ADR 作决定。
- 原“2.04 GiB”测量报告在已调查材料中未定位到。将其视为待核实的外部观察，不作为本方案实测值、泄漏证据或已证明的容量下限。
- Windows 当前 Node `24.20.0`、pnpm `12.3.4` 与锁定版本相符；已检查 D:/dev，未安装软件或改变全局环境。前次机器观察约 31.6 GiB RAM、12.3 GiB 可用，只代表当时本机情况。
- 没有访问生产数据库、Supabase 账户后台、运行迁移、开启消费者、推进时钟或重跑完整模拟；无上线结论。

实际风险按 `FAST_MAINLINE_REVIEW_POLICY.json` 的最高受影响边界归类。文档不改变行为；涉及来源验证、canonical 格式、重放、权限、数据库和原子提交的实现按 P0 审查，不因标题含“性能”降级。P0 不能自授 VERIFIED。

## 3. 代码发现与证据导航

下列路径均为仓库相对路径；M/C 标明阅读版本。C 文件可通过 `git show 055143a53d6b0e66b2703d97814e21fafdb59062:<path>` 精确复查。相关符号列出以避免行号漂移。

| 编号 | 已确认的代码事实 | 文件/符号 | 优化含义及不能推断的内容 |
| --- | --- | --- | --- |
| F01 | main Worker 健康接口报告 simulationEnabled=false | M `apps/world-worker/src/runtime.ts` / createWorkerServer | 启动默认 dev 服务的低内存不能证明完整模拟容量 |
| F02 | C API 可注入共享 Finance/Social 连接；连接限制 local/ci，单 World owner | C `apps/world-api/src/runtime.ts`；`apps/world-worker/src/runtime-preparation/finance-social-runtime-connection.ts` | 测正确组合，部署绑定是单独工作；不能把 ci 标签用在生产 |
| F03 | Social adoption loader 加载完整 source context，再返回 labourSocial | C `apps/world-worker/src/runtime-preparation/social-runtime-connection.ts` / loadPostwarSocialConnectionOpeningAdoption；`apps/world-worker/src/preparation/postwar-source-context.ts` | 窄加载/共享一次准备有切口，但全量校验承担来源证明职责 |
| F04 | bundle loader 逐项读入并保留 fixed/datasets 字符串；mapping 固定 29,609,172 bytes | C `apps/world-worker/src/preparation/official-opening-bundle-loader.ts`；M mapping 文件实测同大小 | 已是串行读文件，不能把“改 Promise.all 为串行”当作这段代码的新优化；文件大小不是 RSS |
| F05 | seed 读入会 JSON.parse、canonical 比较、parseOpeningSeed 和 rebuildV08LedgersFromLineage | M `apps/world-worker/src/persistence/opening-seed-store.ts` / seedFromRow、assertServerOwnedSeed | 重建次数/中间对象值得测；不能删除校验或随意把校验结果带过事务边界 |
| F06 | canonicalSerialize 先递归 normalize，创建规范树，再 JSON.stringify | M `packages/core/src/serialization/canonical.ts` | 峰值可能同时有原树、规范树和字符串；保留精度、排序和拒绝非法对象语义 |
| F07 | prepared Social 已保留窄 seed 元数据、prepared ledger、Social document；每次在线使用重新取得当前前缀 | C `apps/world-worker/src/persistence/prepared-postwar-social-source.ts` | 已有准备/在线分离，不重新设计一套平行缓存；retainedDocumentBytes 不是整个进程内存 |
| F08 | 共享连接已有 prepareTreasuryFx，说明允许完成 FX 后释放大型 seed | C `apps/world-worker/src/runtime-preparation/finance-social-runtime-connection.ts` | 先验证宿主是否真正结束引用生命周期；新增 API 并不等于调用方已受益 |
| F09 | canonical prefix 的 TS 和 SQL 同时限制 256、1,048,576 bytes，并检查完整集合 | C `apps/world-worker/src/persistence/bounded-postwar-canonical-prefix.ts`；`database/proposals/postwar-bounded-prefix-read.sql` | 界限正确拒绝超量；SQL proposal 不能当已安装生产迁移 |
| F10 | FX 混合重放对历史 frame 逐一读原始 quote，反复 filter financialAccounts/sourceMetadata | C `apps/world-worker/src/persistence/prepared-postwar-finance-social-fx-replay.ts` | 有 N 次 SQL 和重复扫描的候选热点，需量化；批读仍需逐条证据关联和锁协议 |
| F11 | shared prefix 会验证 Social document、构造 frames，并按 accountRef 查 positions | C `apps/world-worker/src/persistence/postwar-shared-office-prefix.ts` | 可在同一次操作内复用验证结果和只读索引，避免全局当前状态缓存 |
| F12 | consumer 同时只运行一个 active step；SQL 确定顺序选 limit 1 | M `apps/world-worker/src/preparation/durable-command-consumption.ts` / consumeOnce | 保留串行和 fencing；并发读优化不能增加并行经济写入 |
| F13 | snapshot reader 已有 LRU、同键请求合并、4 项/12 MB 原始/32 MB 计费树/2 个加载上限 | M `apps/world-api/src/integration/official-dataset-source.ts` | 已有按需缓存，不重复建设；generic SQL reader 不自动走这个缓存 |
| F14 | 官方只读 PG pool max=4，已有超时 | M `apps/world-api/src/integration/official-country-postgres.ts` | 按所有进程/角色求连接总额；不能把每个池的 4 当全系统连接数 |
| F15 | 前端入口已有 React.lazy；国家资料 reader 已有取消、超时；scoped cache 按权限变更清理 | M `apps/world-web/src/App.tsx`、`official-data/official-explorer-country.ts`、`reconnect/scoped-cache.ts` | 前端已有优化；scoped cache 的 Map 容量需要补充调查/限额，前端收益不计为 Node 内存收益 |

另有 M `docs/reviews/OFFICIAL_SOURCE_CACHE_COST_2026_10_03.md` 记录特定读取测试 RSS 从 400,960 KiB 到 141,600 KiB；是历史单套 fixture 观察，不是完整 World 的性能承诺。

## 4. 目标运行结构与数据生命周期

```text
CI：固定源码与锁文件 → 测试/构建 → 版本化运行产物
来源准备：原资料 → 完整校验 → 可重建的最小运行资料（若引入，需审查契约）
静态托管 → 浏览器：页面、地图、公开静态资产
浏览器 → API：认证、授权、命令接收、受限查询
API → 持久队列 → 同一 World 受控消费者 → 确定性 Core → 原子提交
                                              ↓
Supabase PostgreSQL：命令、事件、回执、账本、权威表与执行租约
                                              ↓
已提交投影 → 授权读取；Realtime 仅通知回读
```

逻辑模块分开不要求各自一个进程。先复用 C 已有共享组合，统计其完整内存；若 API 和执行器最终独立运行，必须把两个 RSS、连接池、缓存和部署期间重叠计入预算。保持 API/Worker 包所有权，不能为共进程放松浏览器导入边界。

| 数据 | 保存位置与生命期 | 策略 |
| --- | --- | --- |
| 原始来源、mapping、完整开局证明 | 持久原档；准备阶段使用 | 顺序验证，避免在线路径重复持有整套；不可删除来源证明 |
| 不可变 H0 基线及最小索引 | 单 World prepared scope | 绑定 seed/model/来源哈希；需要时复用；退休 World 后释放 |
| 当前权限、source admission、head、lease | 实际当前事务 | 不跨事务缓存；每次按已有锁协议验证 |
| 命令工作集、历史 frame、quote | 一次有界操作 | 事务内复用；commit/rollback 后失效 |
| 权威事件/账本 | PostgreSQL | 保留 append-only、幂等、唯一约束和原子提交 |
| checkpoint/投影 | 可重建的派生持久数据 | 版本绑定，损坏可丢弃；不能代替原账本或当前授权 |
| UI 数据、地图 | 浏览器/静态存储 | 页面范围加载、缓存限额、权限变化清理 |

按需加载的是数据和派生计算，不能按玩家是否在线决定一个国家是否生产、支付或清算。保持正式 10x Clock、既有结算顺序和到期事件。周期计算改为事件驱动仅在相同输入产生严格相同结果、且相应规则允许时立项，不在第一轮改变经济语义。

## 5. 分阶段实施路线

### O0：建立可信基线，先于容量采购

交付独立 profiling harness 和机器可读报告。拟新增 `tools/performance/world-runtime-profile.mjs`、`docs/reports/runtime-memory/<run-id>/summary.json`；路径仅为计划。

固定候选 SHA、lockfile hash、数据 manifest/hash、schema/migration 版本、Node/pnpm、OS/CPU、宿主/容器限制、运行入口。区分“默认 health stub”“全量来源构建”“API＋真实共享消费者”“测试父进程/数据库”，分别测量。

阶段标记：模块加载前后、bundle 加载、来源验证、seed hydrate、canonical、账本重建、FX prepare、Social prepare、释放临时引用、readiness、首条命令、稳定结算、恢复、关闭。阶段指标记 rss/heapUsed/heapTotal/external/arrayBuffers/maxRSS、耗时和 CPU；记录活跃加载数量、frame/账户/国家数量、SQL 次数与字节数、连接等待、GC、event-loop delay、队列龄。

外部采样进程每 100–250 ms 观察目标进程和子进程；同步大解析会阻塞 Node timer，不能只靠 setInterval 捕捉峰值。Linux 同时记录 cgroup memory.current/peak/events 和进程 RSS；Windows Working Set/Private Bytes 分列，不直接当 Linux RSS。external 与 arrayBuffers 可能包含关系，不相加形成总量；累计 maxRSS 不能被当成某一个阶段的独立峰值。

独立进程至少三次冷启动，区分进程冷启动与文件页缓存冷启动；暖运行固定相同输入。测试观测器避免保存全部查询结果和完整 SQL payload，采用计数/直方图/有界环形缓冲。证据不含凭据或私人业务数据。

不以强制 GC 成绩当生产成绩。可额外在隔离诊断中观察 GC 后 heap 是否回落，区分存活对象与分配峰值；heap snapshot 可能显著增加内存，仅在本地 fixture 环境按需使用。

退出：找回或重现 2.04 GiB 所对应路径；即使找不到原报告，也应得到有明确边界的新基线。没有真实运行绑定时标明缺口，不用桩入口填补。

### O1：启动对象生命周期与重复准备，第一轮代码优化

受影响：F03–F08；Worker preparation/store、Core 校验接口；潜在 P0，独立审查。

1. 绘制单次 startup 的 seed/bundle/document 持有者，记录创建、最后消费者、闭包/WeakMap/Map/Promise 引用；WeakMap 不代表 value 自动释放，只要 key 仍可达就可能继续持有。
2. 优先利用已有 prepareTreasuryFx 和 startupSeed 复用，让同一份真实 seed 供批准范围内的准备操作顺序使用。准备完成后销毁宿主 scope，避免日志、诊断响应、配置对象继续持有 seed。不能把 seed 经 IPC 再复制一份后宣称节省内存。
3. 若测量证实 Social 窄入口重复加载全量 context，拆出固定的最小依赖集合；依赖集合由来源校验契约确定，不能仅凭函数最后 return 的字段决定读取范围。
4. 优先同一次可信 preparation 内共享已验证不可变内容和重建结果。若需要跨启动复用，则另行设计带模型/源码格式/来源哈希的派生运行资料协议，完整验证原始来源与派生资料关联。不得接受客户端提供的 verified=true、伪造 brand 或同形对象。
5. 将大型准备放独立短命进程是备选：仅当准备可输出小而可验证的派生产物时采用；不能直接序列化进程内 capability/WeakMap 身份。父子并存峰值和产物验证开销必须计入预算。

验收：所有来源缺失、错误哈希、旧 seed、错误模型、撤权、准备失败路径仍拒绝；启动期间不消费命令；相同原始输入产生相同账本和 fingerprint。比较 before/after 真实峰值、GC 与启动耗时，而不是仅检查局部 retainedDocumentBytes。

### O2：在线有界工作集、索引和背压

受影响：F10–F14，shared replay、API ingress、角色化读取；改变当前性/锁协议的部分按 P0。

- 为一次重放建立 accountId、sourceId＋hash、counterparty/mirror 的只读索引，替代循环里的全表 filter/find。重复键仍必须拒绝，不能让 Map.set 悄悄覆盖。保留输出排序和精确 Money 规则。
- FX historical originals 的逐条 SQL 先测 N 与延迟。若确有热点，使用有界批量固定查询或事务局部去重；返回完整集合，逐条校验 quote/event/payload/head 绑定、重复和缺失，保留域特定授权/锁。新 SQL 函数和 GRANT 经唯一迁移链发布。
- 同一事务的相同前缀/同一 head 可以共享纯派生结果；事务结束失效。跨事务即使命中同一个 head，也必须重新检查当前授权、source revocation、admission 和 lease。不能复用 transaction executor 到请求外。
- 为重加载、重查询和派生发布分别设有限并发/有限等待队列。消费者写入并发仍为 1/World；前端重试不增加重复经济执行。
- 拒绝尚未接受的超载请求时给明确可重试语义；已经持久接收的命令必须可查询结果，不能因取消 HTTP 或内存压力丢弃。不会把 BLOCKED/FAILED 翻译成 COMMITTED。
- 限制 request body、序列化响应和正在读取的来源大小；取消只作用于允许取消的读操作。提交结果未知时通过持久回执恢复，不盲目重新扣账。
- 不把已有 snapshot LRU 再复制成一层无限缓存。预算包括加载中的原始字节、解析树、caller 持有树及响应，而不仅是 LRU retained size。

退出：固定完整 fixture 下 SQL 次数/读取字节下降，账本/回执一致，尾延迟和队列不恶化；对资源上限的正常拒绝有测试。若索引新增内存大于收益，保留更简单实现。

### O3：长期历史与恢复，正式赛季前独立门槛

F09 的上限包含协议完整性，不是可直接调整的缓存参数。先调查所有消费者是否共用相同能力范围、哪些命令家族不支持，以及其他 lineage reader 是否有不同限制。不能推断整个产品统一只有 256 条，也不能用另一条较宽入口规避拒绝。

短期保留现有有界流程作为受控验收；分别测试 255/256/257 和字节边界，超限应 fail closed。不得为了压测把历史截断、重置 seed 或删掉 ledger。

长期设计分两个可审查增量：

1. 完整前缀分页重放：以真实 head 为固定目标，使用确定顺序的 keyset 游标，校验连续性、计数、事件/命令/回执/分录关联。不能用 OFFSET 加无序结果；跨页一致性需要明确事务/锁契约，不能把页面间的较新 head 混入同一次重建。分批读降低内存，但若每次都从零重放，总 CPU/SQL 仍随历史增长。
2. 校验过的 checkpoint＋增量后缀：checkpoint 绑定 world、seed fingerprint、schema/model/replay 版本、最后完整 transition 的 worldVersion/eventSequence、状态摘要与对应历史证据；仅在完整事务边界生成。读取 checkpoint 后重放到固定真实 head，当前授权仍另查。哈希只能证明字节一致，不能单独证明来源可信；生成方与来源验证必须受控。

恢复时 checkpoint 缺失、损坏或不匹配，回退到有界分页的权威重建；在线恢复超过资源/时间预算则保持 not-ready，交给受控离线恢复，不创建空世界。checkpoint 可以删除重建，权威原历史必须保留；检查点数量本身也需要保留策略。

这涉及 Core replay 接口、持久 schema/GRANT、启动和恢复，是独立 P0 提案，需要依赖门槛、ADR 和独立审查。禁止直接把 256 改成无限大。验收覆盖全量与增量结果一致、跨国分录、进程崩溃、尾部缺失、重启幂等、错误模型和租约切换。

### O4：canonical 分配优化，仅在 profiling 证明后启动

F06 的 normalize 副本可能是热点，但 canonical 格式控制 fingerprint、命令身份和重放，不能替换为普通 JSON.stringify 或浮点数。

先减少同一可信操作中对同一不可变数据的重复 canonicalSerialize；缓存只绑定真正不可变对象，不能缓存可变对象导致旧哈希。跨边界的再次校验并非天然冗余。

如果仍需流式 canonical，新增独立候选接口，逐 token 写入 hash/有界 sink，避免完整规范树及完整 hash-only 字符串。保持现有格式的精确字节顺序：特别是整数型属性键的 JSON 枚举行为、字符串转义、Unicode、数组顺序、Money/Quantity/SimTime 适配，以及 Proxy/getter/sparse/cycle/number 等拒绝规则。仅“字母排序再输出”不保证与当前实现相同。

新旧 golden bytes、SHA-256、错误行为和历史 fixture 必须一致；对必须保存完整 canonical_payload 的路径，流式 hash 本身不能消除最终字符串。任何 fingerprint 改变都超出本优化范围，应拒绝而不是重写历史。

### O5：前端、运维和交付的低成本改进

- 保留 React.lazy 和国家资料取消机制。只对测到的地图解码/画布/GPU资源、重复订阅和 DTO 留存做改进。离开页面释放监听器、图层和 Worker；按 viewport/country 加载资产。
- scoped cache 加总条目/字节预算；payload 淘汰不能随意清除防版本回退的 progress 水位。若淘汰整个 scope，重新进入必须从授权全量 snapshot 握手，不能接受旧增量。撤权仍清空私人内容，私人数据不放公共 CDN。
- Realtime 合并重复刷新、按 scope 订阅，断线后回读；不把通知当提交凭据。浏览器内存另测，不能计为服务端节省。
- CI 构建固定产物，运行机不执行全仓编译/测试；去掉 dev watcher、测试 fixtures 和不需要的源资料，部署清单保留所有运行必要文件。
- 部署时同机双版本会叠加 RAM。单写者交接先 drain、等待提交、按 lease/fencing 恢复；不能为零停机同时启动两个独立 World consumer。API 的多实例设计不自动授予写入权。
- 日志轮转、有界指标、崩溃重启退避；liveness 与经济 readiness 区分，重启不自动绕过准入或启动 Clock。核对旧 cron/Edge 调度，保证不会双推进。
- 合计所有角色池与重启重叠连接，保留低权限隔离。TLS、驱动及 pooler 的事务/会话语义逐项验证；不把连接数调大当作性能修复。

## 6. 内存、吞吐与采购判定

以下是拟议试验预算，不是当前性能，也不是已经批准的产品 SLA。先用 O0 基线校准，容量失败时如实记录。

| 指标 | 2 GiB 宿主试验目标 | 解释 |
| --- | --- | --- |
| Node 全部应用进程稳态 RSS 合计 | 不超过约 768 MiB | API/执行器若分进程合计；不只统计主进程 |
| Node 应用进程启动/结算/恢复峰值 | 不超过约 1,280 MiB | 取所有代表场景最高值，不取平均掩盖峰值 |
| 应用 cgroup 总预算 | 1,536 MiB | 包含归属于组的文件缓存等；不与 RSS 简单相加 |
| 宿主剩余预算 | 至少约 512 MiB | OS、代理、监控等；不足就不能采用 2 GiB |
| OOM / 依赖 swap 才能完成 | 0 | 不把 swap 当容量证明；允许系统配置不等于依赖其兜底 |
| 每轮释放后的 retained heap | 同等状态规模趋稳 | 历史/实体增长与泄漏分开解释；保留率无界增长则失败 |

只有在代表性负载、恢复及部署切换均通过后，才建议 2 GiB。4 GiB 也需完整测量，不是无限并发保证。V8 old-space 只控制堆的一部分，不是进程内存上限；不能简单设置一个 flag 就宣称解决 OOM。

CPU 验收：测每类命令 CPU、wall time、数据库等待，队列处理速率必须持续高于选定负载的到达速率，并留余量。正式到期事件在 10x Clock 下的 backlog 恢复时间需要负责人确定；未确定前报告曲线，不编造 SLA。单 JS 执行线程不会因为购买两个 vCPU 就自动翻倍。

容量报告同时给出 RAM、CPU 秒、SQL/命令、查询字节/命令、DB 磁盘增长、Realtime 消息/更新和出站量。降低 Node RSS 却导致更贵 DB 规格时，需要比较总月成本。80 GB SSD 不是硬性条件，按运行产物＋日志上限＋升级副本＋必要缓存计算；本地磁盘不承载唯一权威数据。

运行机若完全可重建，整机快照可按恢复目标评估；数据库、Storage 对象、配置与密钥恢复各自验证，不能省掉权威资料备份。当前 Supabase 套餐、组织、区域、用量和项目关系未核实，不在本文给出已确认报价或升级对象。

## 7. 实验与验收矩阵

所有数据库实验在受控 disposable PostgreSQL/获准隔离 staging。不能将现有生产项目当压测目标。Windows 可运行纯加载/序列化实验；Linux 容器/VM 用于目标环境和 cgroup 验证。部分现有 native host 固定 Unix socket 和隔离 fixture 名称，不能改掉保护以连接任意 DSN。

| 场景 | 测量与必须保持的结果 |
| --- | --- |
| 空入口与完整入口对照 | 明确是否启用真实 connection、prepare、consumer；不是比较不同功能 |
| 完整来源冷启动 ×3 | 相同全部来源；阶段峰值、耗时、seed/ledger 输出一致 |
| 同时启动准备/读取 | 有界并发；不重复构建同一份大对象；无半准备 ready |
| 1/5/20 并发查询 | 试验档位而非预测人数；内存、p95、队列、SQL/出站 |
| 串行混合命令 | Finance/Social/FX 及候选实际支持家族；保留顺序、分录、回执 |
| 255/256/257 及字节上限 | 原版在保护边界拒绝；新恢复协议完成前不假装长跑通过 |
| 长期增长 | O3 后再测 10³/10⁴ 合法 transitions；先短稳态、通过后 24h soak；非无界 fuzz |
| 重复提交/响应丢失/重启 | 最多一次经济效果，持久回执可回读；DB commit 未知正确恢复 |
| source/席位撤权、lease 失效 | 即使缓存命中也拒绝；不可使用旧授权继续提交 |
| checkpoint 丢失/错误/旧版本 | 权威重建或 not-ready，不凭空生成余额、不使用失效状态 |
| 正常退出/新版本接管 | drain 完成、租约受控、无双执行；统计切换峰值 |

比较应使用相同原始数据和命令序列，核对 canonical 输出/事件/回执/账本 hash 及金额库存守恒；仅响应 200 或测试文件存在不算通过。禁止 skip、删测试或缩小正式世界范围以获得内存成绩。

建议证据字段：runId、candidateSHA、baselineSHA、toolchain、environment、dataHash、workload、phaseMetrics、processTreePeak、cgroupPeak、sqlCount/bytes、latency、queueAge、semanticHashes、commands[{command,exitCode}]、gaps、productionMutation=false。采样文件有限保留，重型输出分开落盘。

## 8. 任务包与验证命令

| 包 | 顺序/前置 | 主要交付 | 审查与退出 |
| --- | --- | --- | --- |
| OPT-00 | 首先；确认目标版本和隔离范围 | profile harness、真实基线、热点排序 | 工具不改变权威行为；风险复核，证据可复现 |
| OPT-01 | OPT-00 发现启动重叠/重复重建 | 生命周期缩短、现有准备机制复用 | 涉来源/seed P0；独立审查，结果等价 |
| OPT-02 | OPT-00 发现在线热点 | 操作内索引/有界读取/背压 | 域/SQL/权限变更 P0；吞吐与内存同时验证 |
| OPT-03 | 正式长期运行前；需获准依赖与设计 | 分页完整重放，随后 checkpoint | P0 ADR/迁移/恢复专项；不替代当前 gate |
| OPT-04 | OPT-01 后仍证明 canonical 为主要热点 | 字节完全兼容的低分配实现 | P0，golden 与历史结果一致 |
| OPT-05 | 可独立处理的 UI/交付范围 | 限额、资源释放、部署预算 | 按实际边界归类；权限缓存不得降级 |

不预先承诺所有包都要实施。OPT-00/01 已达到容量目标后，OPT-04 可以不做；OPT-03 是否必要由长期运行的真实能力边界决定，不能因内存达标忽略。

命令均从固定候选的隔离 checkout 执行，先验证其 package.json 与实际测试路径。本文未执行以下行为测试：

```text
node --version
pnpm --version
pnpm install --frozen-lockfile          # 仅隔离 checkout 缺依赖时
pnpm --filter @econmind/core build
pnpm --filter @econmind/world-worker build
pnpm --filter @econmind/world-api build
pnpm exec vitest run tests/foundation/canonical-core.test.ts tests/property/canonical-properties.test.ts tests/world-core/opening-seed-store.test.ts
pnpm exec vitest run tests/world-core/finance-social-prepared-ledger.test.ts tests/world-core/postwar-bounded-prefix-read.test.ts
pnpm test:boundaries
pnpm typecheck
pnpm lint
pnpm format:check
pnpm secrets:check
pnpm build
```

前两类 focused tests 按改动选择；后一个 focused 行属于 C 而非 M。DB/恢复/真实低权限测试须使用候选现有的隔离 harness，记录实际命令和真实 PASS/FAIL，不能仅跑内存 mock。SQL 改动增加 migration:validate/rehearse、权限和真实 PG 测试；当前 package 的 env:check 使用 POSIX 环境变量写法，Windows 需用显式 local 环境运行相同检查器并记录调用方式。正式合入完成工作包要求的其余 checks，不用本文短列表替代门槛。

## 9. 受影响所有权、迁移和回退

- Core owner：canonical、账本重建、纯 replay；不可引入 React/Supabase SDK/持久化写入。
- Worker owner：来源准备、租约、唯一消费者、原子执行、恢复；派生优化不能取代权威链。
- API owner：身份、权限、接收、查询与背压；不生成第二经济模型。
- Web owner：受限投影、分页、取消、资源释放；不导入 Worker 实现。
- 主站/数据库发布 owner：唯一 migration 链、角色/GRANT/RLS、兼容旧站；当前提案没有实际 migration。
- Operations owner：版本化部署、日志、池预算、恢复演练；项目负责人确定运行时段、容量目标、预算和最终部署。

无 schema 的生命周期改动可回退二进制；缓存/派生 checkpoint 可失效后重建，但回退版本必须能理解现有权威历史。不可把经济交易回滚视为应用回滚。新 schema 应采用兼容扩展、先读后切换与 forward-fix；不得同时启用两条迁移链。每个 PR 用模板记录 owners、权限、迁移、旧站影响、实跑命令、证据缺口及未决事项。

## 10. 本轮交付与待决事项

本轮完成必要模块静态调查、原始 Constitution 相关规则核对和上述方案；没有性能结论、实现变更或生产访问。调查中部分搜索因路径仅存在于 C 而在 M 返回不存在，已转为固定提交读取；不是测试失败或测试通过。既有未跟踪治理文件保持原样。

文档验证记录（Windows PowerShell，本地 M checkout）：

- `node --version` / `pnpm --version`：exit 0，分别为 24.20.0 / 12.3.4。
- `node node_modules/prettier/bin/prettier.cjs --check docs/reports/governance/WORLD_RUNTIME_OPTIMIZATION_PLAN_2026_10_31.zh-CN.md`：exit 0，PASS。
- `git diff --check`：exit 0；此命令不包含未跟踪文件，新增文档格式以 Prettier 单文件检查为证据。
- 对 10 个关键 C 源码/SQL/测试路径执行 `git cat-file -e <C>:<path>`：全部 exit 0。只证明引用存在，不证明相应测试通过。
- 原始 `requirements.docx` SHA-256：`960a7745a8e18b8f1cb10c754ce6681d46bdfc5933a979c4a989bd3a07ff5d49`。
- 应用 lint/typecheck/build/test、真实 PostgreSQL、性能与恢复实验：本轮 `NOT_RUN`，仅新增方案文档。

实施前待确定：原 2.04 GiB 报告/入口；最终集成 SHA 与 gate；正式在线时段、预期峰值及恢复时限；Supabase 实际项目/区域/资源；支持的全部命令家族与完整世界 fixture；checkpoints 的契约及迁移责任。可以先完成不依赖账户信息的 OPT-00，无法运行的场景明确 NOT_RUN。

优先执行建议：OPT-00 → OPT-01 → 测量复查 → 必要的 OPT-02；同时将 OPT-03 作为长期运行能力的独立设计门槛。只有完整候选的证据支持时再选择 2 GiB，否则使用 4 GiB 并保留优化路线。不要为省一档宿主费用引入超过收益的分布式复杂度。

## 11. 二次复查：先减少重复防御，不先增加架构

复查结论：存在具体的重复全量证明、对象重建候选；没有 profiling 证据证明其占据 2.04 GiB 的主要部分。不能把所有 guard 都归为浪费，也不能把大项目的架构方案一并作为当前实施要求。上一版路线将近期精简和未来恢复工程放在一起，容易扩大首轮范围，本节明确收缩。

### 11.1 新确认的成本与一项纠正

1. C `packages/core/src/commands/finance-budget-native.ts` 的 `readFinanceNativeBudgetMixedPrefix` 在 WeakMap 命中后仍调用 completeFrameHash/frameHash；前者哈希整组 frames，后者先 map 出 command/events 再哈希。它不是普通 O(1) getter。`readFinanceNativeBudgetMixedFinancialState` 又调用同一个 reader；在 `replayPreparedFinanceSocialLedger` 的 financialState 分支中，两次读取发生在同一次调用链。这是明确的重复哈希路径。
2. C `finance-social-prepared-ledger.ts` 的零分录分支逐 frame 重建 transition、receipt，分别对生成对象和原对象 canonicalSerialize 后比较，随后调用 parseFinancialLedgerSnapshot 构造当前版本。检查有真实用途：已有 mixed evidence 并非总覆盖完整 transition、receipt 和 posting 容器。正确优化是一次建立完整证明并在内部复用，而不是删掉每次检查或信任 TS 类型。
3. C `postwar-shared-office-prefix.ts` 将 transitions 再 map 为 frames，随后再次通过 evidence reader 验证。需要确认对象是否已是同一事务内的完整不可变快照；若是，可传递其私有内部对象，避免只因重新包装丢失身份而反复哈希。
4. 纠正 F11 的可能解读：`validatePostwarSocialEmploymentStateDocument` 已有 checkedDocuments.has(value) 快速返回。命中时不重新 derive/serialize。先统计命中率、是否有无意义复制破坏身份；不新增第二个 WeakMap 缓存。
5. M 前端 `office-command/controller.ts` 的 getState 每次 JSON stringify/parse 复制 model 和 intent。这是独立的浏览器成本；可以调查是否适合更新时生成不可变 snapshot、读取时复用，但仍须防止调用方修改内部状态。不将此收益用于解释 Node 峰值。

### 11.2 当前真正需要的最小改造

首轮仅做一个固定完整输入的启动＋一组代表命令基线，增加 canonical/hash/rebuild 的调用次数、累计输入字节和阶段峰值计数；不先开发通用观测平台或全套性能基础设施。

随后优先三项改动：

- 在现有模块内拆分“外部/持久化数据验证入口”和“已验证结果内部读取”。保留公开入口原有检查；调用方跨越真实边界时仍验证。内部快路只接受模块私有构造的完整不可变数据，不接收布尔 verified 标志，不新增通用 capability 框架。
- 同一调用链对同一 frames 只做一次完整验证/哈希，并复用返回的 result；先消除上述直接重复 reader，再评估跨模块对象共享。浅 readonly/Object.freeze 不足以证明嵌套不可变；必须确认所有 alias 无法修改，且同样证明覆盖 command/event/receipt/postings。
- 启动共享一次真实 seed hydrate/账本重建结果，结束准备 scope 后释放大对象。优先复用已有准备机制，不先引入子进程、运行资料编译格式或新的持久缓存。

重构后的数据证明只证明不可变内容，不能证明当前授权。数据库读入的新 bytes、不同模型/seed、另一事务的 source/admission/head/lease 必须继续按真实边界检查。现有负向回归中，如果一个对象曾可被修改或证据覆盖不完整，必须补足封装再走快路；不能删测试来接受旧证明。

### 11.3 暂不做与必须保留

暂不做：分布式执行、按国分片、六 Office 独立服务、Redis、新消息中间件、流式 canonical、通用验证框架、后台通用缓存平台、独立 prepare 子进程、默认部署检查点系统。只有基线揭示实际瓶颈或玩法需求超过现有恢复范围时再立项。

必须保留：真实边界的鉴权与来源检查、唯一消费者/fencing、事务、幂等、精确金额与守恒、完整历史证明、原始 canonical 身份。它们针对的是重复点击、断线重试、普通重启和双进程等小项目同样会遇到的情况。

256 上限既不是吞吐优化目标，也不能简单删除。先明确当前内测允许的命令量；如果正式会话很容易超过，就必须处理长期历史能力。解决它不必立即实现完整 checkpoint 系统：先比较固定 head 的分页完整重放是否已足够，只有累计重放成本确实超预算时再加检查点。

复查后的首轮退出条件：同一场景的 canonical/hash/rebuild 总工作下降，内存或耗时有实际收益，全部相关正确性/权限/恢复回归保持；若简单精简已经达到需求，就停止增加架构。本轮为静态复查和文档修正，尚未修改以上代码或执行性能实验。
