# F — V09 隔离 runtime 证据收据与 Industry 最小接线候选

日期：2026-10-10。`PREPARATION_ONLY_NOT_V09_2_STARTED`。
实施者收据，非独立批准、非正式 V09/Gate B 通过。

## 1. 不可变身份与实际交付

- exact base：`42991acfee9d0eacc702ba47a380c938a4516f03`；tree `1254c4144279717c9075e9bbf07b4b2ac4710558`。
- 分支：`codex/f-v09-evidence-receipt-20261010`；复用 F 独立工作树 `f-v29-native-worker-sequence`，保留此前 `ACCEPTANCE_GAPS.md`，不动其他窗口文件。
- 本轮 native 实际测试代码：`a8210186806b415defbefcc6e0261c18d15ef68c`；tree `790f3ff8fb79ef1ec2a8e9ebbe2cd8d5d203ceef`。随后交付只新增只读 provenance 工具与收据，不改变已测 native 文件、Core/Worker/API/迁移。
- 实际代码：`tests/world-core/f-v09-native-claim-recovery.test.ts`；strict typecheck config：`tests/support/tsconfig.f-v09-native-claim.json`；只读继承校验工具：`tests/support/f-v09-source-inheritance.mjs`。
- 数据库写入只发生于一次性 owned local generation；没有正式输入、个人数据、持久凭据、云端或 linked Supabase。没有状态/gate/主网站/地图 CSS/生产部署改动，也不依赖其他窗口的未审实现。

此前 `ACCEPTANCE_GAPS.md` 是同日先行只读阶段的历史收据；其中“本轮未运行/未提交”只描述该阶段，不描述本实施收据。其六角色覆盖矩阵保留；Industry 已定规则与精确源缺项以本收据第5节的进一步查验为准，不再要求 owner 重定义已定规则。

依据原 AGENTS/PLANS/集中 review policy 与既有 V09 plans。接触单 Writer/recovery/原子性证据的风险不因 test-only 降级；固定交付须交 B 或其他非实现者独审，未批准不 merge/依赖整合。本轮没有重新申请 ADR-18。

## 2. 已查验的原始证据，不重跑旧全套

### R1：当前适用的 V09/V10 与官方检查 CI

[Actions 37924277567](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/37924277567) metadata head 是 `7ad2313cedb26fe1ff8e854208c1965d3a80bb9b`，但 raw checkout/git-log 明确实际检出 **`ac3123ed43864a4e5214bb907f62e1b73fadb4be`**（PR merge）。本收据绑定后者，不误把 metadata head 当 tested code。

已取回 native job `113799358352` 完整日志、official job `113799357885` 的原始上传日志；没有 dispatch 或重跑。

| 实际历史命令                                                                    | 原始结果与环境                                                                                                                                                                     |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test:v09:postgres`                                                        | native PG 3 PASS，独立连接 lease/fencing/version/DELETE/TRUNCATE lineage                                                                                                           |
| `pnpm exec vitest run tests/world-core/v09-commit-authorization-cutoff.test.ts` | 1 PASS；PGlite 授权 cutoff，不伪称 native                                                                                                                                          |
| `pnpm exec vitest run tests/world-core/v09-atomic-recovery-postgres.test.ts`    | native PG 3 PASS，包括恢复 coordinator、invalid fence、双 Delivery lost-ack/新 Worker retry                                                                                        |
| `pnpm test:v10.4:postgres`                                                      | 34 PASS / 1 SKIP；含独立 pools 竞争、Reserve/Ship/Delivery 各五 checkpoint 的真实 SIGKILL/restart，全量原子 footprint 与 committed-response-loss。SKIP 为子进程专用入口，不计 PASS |
| `pnpm exec vitest run tests/world-core/v09-world-recovery-preparation.test.ts`  | 9 PASS，实际构造 `createPGliteV09AtomicTestDatabase`；即使位于 native CI job，仍不是 native claim-recovery                                                                         |
| unmodified `pnpm check`                                                         | 原上传日志：248 files PASS /16 skipped，3072 tests PASS /154 skipped；后续 edge 29、architecture 40 实际 PASS。仅历史执行，不称 F 本轮执行或交付全树 CI 通过                       |

该 native job 是 `postgres:16-alpine`，raw server log 为 PG 16.15；Node 24.20.0 / pnpm 12.3.4，trust loopback、CI disposable `econmind_v09`。**marked disposable fault evidence 与其 upload step 实际 SKIPPED**，不能据 job success 声称本次还执行了 least-privileged-role fault runner。

继承校验：`f-v09-source-inheritance.mjs` 读取不可变 Git objects，比较实际 checkout `ac3123…` 与 base `42991ac…`。Core、Worker、API、world-core/property/support/fixture tests、数据库 SQL/manifest、lockfile、V09 workflows 等 **516 个 blob 相同**。所选 scope 唯一差异为 `scripts/world-runtime-actions.mjs`，是 HOLD 部署 runner，明确不继承其部署结果。无删除；关键 atomic repository / SQL adapter / recovery / V10.4 tests 均相同。完整 pins、源 commit 与 0001–0012 hashes 见 `V09_SOURCE_INHERITANCE.json`。新候选不修改这些既有实现。

此前较旧的 `ca5b056…` CI 35950584759 虽然通过，但 atomic repository 已发生后续变化；不作为当前实现的直接继承依据。更近 R1 已含这些变更，避免无必要重跑。

### R2：renewal 补充

[Actions 37924277640](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/37924277640) 同样实际 checkout `ac3123…`。已取原始 JSON artifact `11612898379`，文件名 `renewal-results.json`：**4 PASS /0 FAIL /0 pending**，四条 actual assertions 分别验证 renewal 延长而 fence/acquired 不变、renewed competitor 拒绝、倒退/相等/缩短拒绝、到期 takeover+1 与旧 fence 拒绝。与 base 相同 test/fixture blobs，未重跑。

另追踪 10-07 本地 raw package `artifacts/f-renewal-fixed-native-once-20261007.cpVRK0`，四个已记 hash 均重新匹配：HANDOFF `d3246150…`、CHECKS `f6d1446b…`、TEST_RAW `f1ef8b1f…`、POST_FACTS `224c5c59…`。原 811 observer invocation 的 0 PASS/4 FAIL 保留。当前 renewal test 已因 frozen-prefix loader 变更而非该旧 blob，因此当前直接继承用 R2，不用“旧 local test 完全未改”的错误前提。

### R3：历史 transport/role fault runner

CI 35950584759 raw 标记 runner 曾 PASS 且 cleanup PASS，receipt_recovery 自身 NOT_RUN，后续独立 test step 才补 receipt。它是 disposable loopback，不是 TLS/staging。历史 staging `ERR_SSL_DECRYPTION_FAILED_OR_BAD_RECORD_MAC` **FAIL 保留**。当前真实 TLS、专用 staging、正式最小权限角色与 host binding 仍 `INSUFFICIENT`，不得由 R1/R2 的 postgres-superuser/trust 测试替代。

## 3. 本轮唯一新增 native suite：普通 abandoned-claim recovery

缺口依据：现有 9-case recovery preparation 无条件创建 PGlite；普通 reclaim 不能从 CI job 名称推断 native 已测。因此仅增加一个文件、一个 invocation，不扩 crash/lease 全套，不创建 formal input。

### Owned target

- 私有根：`/Users/samuel/Documents/econclub/artifacts/f-v09-claim-recovery-20261010.KgSwqT`，0700，保留停止后的 pgdata。
- 实际 PG 16.15 (`160015`)，system identifier `7694989011588890045`；`127.0.0.1:61217`，Unix sockets 禁用；database `econmind_v09_f_claim_20261010`、postgres test role、trust、无密码凭据。
- 全新 initdb 使用 `LC_ALL=C`，encoding SQL_ASCII；本测试所有 fixture tokens 为 ASCII，不声称 UTF-8/生产 locale 验收。max_connections=8/shared_buffers=16MB；客户端池 max=2、连接 2s、statement 5s、lock 1s；串行，无并发/压力攻击。
- 创建前端口无 listener；首次 mutation 前 READ ONLY 验证 actual system/host/port/database/data_directory/socket/空 world schema/空 public relations，不能只信 DSN。共享 environment guard 拒绝 runtime/Supabase/PG overrides。
- 安装既有 manifest **0001–0012 exact DDL**，逐件 SHA 校验；独立 migration validator 验证当前全部 23 artifact/source commit。没有正式发布/schema_release receipt 冒充：本地 DDL 安装不等于批准生产迁移，也没有创建新的 SQL。

### 单次命令与观察

```sh
env -i PATH=/usr/bin:/bin LC_ALL=C ECONMIND_ENV=local \
V09_TEST_DATABASE_FINGERPRINT=world-v2-v09-test-local \
V09_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:61217/econmind_v09_f_claim_20261010 \
F_NATIVE_CLAIM_RECOVERY=OWNED_FRESH_GENERATION \
F_NATIVE_SYSTEM_IDENTIFIER=7694989011588890045 \
F_NATIVE_DATA_DIRECTORY=/Users/samuel/Documents/econclub/artifacts/f-v09-claim-recovery-20261010.KgSwqT/pgdata \
/Users/samuel/.npm/_npx/92e92e656f04b72c/node_modules/node/bin/node node_modules/vitest/vitest.mjs run \
tests/world-core/f-v09-native-claim-recovery.test.ts \
--maxWorkers=1 --testTimeout=10000 --hookTimeout=10000 \
--reporter=default --reporter=json \
--outputFile.json=/Users/samuel/Documents/econclub/artifacts/f-v09-claim-recovery-20261010.KgSwqT/NATIVE_RESULTS.json
```

实际 1 file，**2 PASS /0 FAIL /0 SKIP，exit 0**；700ms total，115ms tests；无 retry、无第二次 native invocation。

1. 旧 Worker claim fence1；过期后实际 SQL takeover fence2；关闭旧 pool，新 pool/新 `WorldRecoveryCoordinator` 读取原持久 claim，调用真正 `reclaimAbandonedCommand`。queue 精确为 CLAIMED / WORKER_F_NATIVE_NEW / fence2 / attempt2；第二次 reclaim 因当前 fence 拒绝且 attempt 不再增加；旧 Worker 的 fence1 精确拒绝 `WORLD_WRITER_FENCE_STALE`。所有拒绝断言 actual adapter error 的 `outcome=ROLLED_BACK` 与精确 cause，不是吞任意异常算成功。
2. 活跃、未过期的当前 claim 不允许 reclaim；queue/facts 完全不变。

11 类 raw JSON footprint 前后 exact 相等：head、canonical test command、event、receipt、outbox、inventory posting、financial batch、commit/current authorization、consumer receipt、materialization。经济五类表为空；两个 World head/version/sequence 均 0。恢复只改变 claim/lease，不编造经济 commit。这是空经济账的普通连接/host reconstruction，**不是 populated settlement、OS crash、API kill、TLS 或正式 player 玩法验收**；那些断言用 R1 的相应真实场景单独归属。

运行后 READ ONLY 再查同一 system/database/port；RECOVER queue attempt2/fence2，ACTIVE queue attempt1/fence1；events/receipts/outbox/inventory/financial 全 0。`pg_ctl -m fast -w stop` exit0，postmaster.pid 不存在，端口无 listener；0700 stopped cluster 保留，没有 drop/reset/delete。

构建 provenance 限度：test 直接导入当前 `WorldRecoveryCoordinator` / `PostgresSqlDatabase` TS，但 `@econmind/core` 通过 package export 使用本地生成的 dist。运行前没有单独记录该既有 dist 的 hash，故不能声称其生成 bytes 已绑定 a821 tree。最终 static 检查阶段才从固定源码重新 build Core/Worker；未为弥补此记录缺口启动第二次 native invocation。2 PASS 是真实场景观察，完整构建产物来源核验仍有此明确限制；R1/R2 的独立 CI checkout/构建记录与 scoped source inheritance 单独归属。

## 4. 14 硬性质逐项对应

`INHERITED` 仅指 R1/R2 raw execution + scoped blob equality，不是本轮重跑或 gate approval。

| #   | 硬性质                          | 可采证据与执行类型                                                                     | 边界                                                         |
| --- | ------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1   | Clock deterministic             | R1 official `simulation-clock` unit/property INHERITED                                 | 无正式 Clock 启动                                            |
| 2   | SimTime monotonic               | R1 clock/scheduler/command-sequence property INHERITED                                 | 不把测试时钟当 wall-clock host                               |
| 3   | Commands canonical              | R1 `command-event-contracts`/properties INHERITED                                      | 新 claim synthetic SQL input 不证明人工命令合法              |
| 4   | Authorization server-side       | R1 cutoff PGlite + V10.4 Reserve revoked-Finance native INHERITED                      | 正式身份提供方/role RLS 仍 INSUFFICIENT                      |
| 5   | Idempotency durable             | R1 receipt/property + native committed-response-loss + double Delivery retry INHERITED | queue ack 不等于经济 FINAL                                   |
| 6   | Events append-only              | R1 command-event-ledger/contracts + 0002–0004 相同 SQL INHERITED                       | 无生产权限声明                                               |
| 7   | Replay exact                    | R1 replay/property/durable ledger lineage INHERITED                                    | hash/版本 exact，不容差                                      |
| 8   | Single writer                   | R1 三个 native lease cases + R2 四个 native renewal cases INHERITED                    | 旧 fence、renewal、expiry 分别有断言                         |
| 9   | Transactions atomic             | R1 V10.4 各 stage ×五 checkpoint SIGKILL/native footprint INHERITED                    | 15 precommit kills 与 commit 后 response-loss 不混为一个测试 |
| 10  | Inventory conserved             | R1 inventory property + native Reserve/Ship/Deliver INHERITED                          | 本轮空账 footprint 不是额外 populated conservation           |
| 11  | Money conserved                 | R1 financial property + native Delivery exact GCU INHERITED                            | 未证明正式 LC/FX 来源                                        |
| 12  | Recovery works                  | R1 native SIGKILL/receipt recovery + 本轮 native claim suite 2 PASS                    | PGlite 9-case 不冒充 native；TLS/staging FAIL 未闭合         |
| 13  | Projections derived/rebuildable | R1 activity publisher/lineage/recovery preparation INHERITED                           | 正式 publisher/visibility/source 接线另验                    |
| 14  | Concurrency safe                | R1 V10.4 independent PostgreSQL pools 的 N→N+1 竞争 INHERITED                          | 本轮不再启动并发压力测试                                     |

all-or-zero 观测层：R1 native 每次 precommit crash 读取 event/receipt/outbox/inventory/financial/head；commit 后 lost-response 读取同一 durable FINAL，重试不得双记。未确认 commit 保持 UNKNOWN，rollback/cleanup 未确认不得改写 ROLLED_BACK；不把已存在 command/CLAIMED 行当作经济半笔。普通回收只在新的更高 lease generation 下进行，不静默授权 takeover。

## 5. Industry：已定规则、最小 canonical 候选与真正缺项

本节只读 MASTER/INDUSTRY、实际 D04 adopted source 与 Core；没有修改 Industry Core、Writer、parser、registry 或 C/E 文件。候选名与 wire 字段是待 B 审的工程选择，不是已注册命令。

### 不再请人类重复定义的规则

- MASTER-U1149–U1152 已定 Project 唯一事实源、owner/location/scale/capex/inputs/labour/technology/milestones/commissioning；U1172–U1183 已定创建、变更、请求资金/外部供给/劳动力、审批、开工、暂停、commission/decommission。
- U1186–U1189 已定最弱必需组件约束进度、funding gap、input reservation、mandatory milestones + commissioning；U1193–U1199 已定资金/材料/技术/劳动短缺、版本变更审批失效、取消释放。
- INDUSTRY-U1002 起的 Required Offices 条件已有：public funding→Finance；foreign inputs/tech/FDI→Trade；labour threshold→Social；strategic/large→Captain；CB 仅相应 refinancing/FX/systemic channel。不得让 Industry 代签，也不无条件强迫每项目六部签字。
- Owner D04 §5.1 已采用 source `OPENING_EXISTING_ASSET` 为 t0 物理存量，350 `UNBUILT_OPTION` 继续未建；产权/运营条件、book value≠现金、t0非新增GDP 已定。既有设施 genesis 不要求重演历史，新建/扩产仍走真实施工链。

### 最小候选，不增加另一套架构

1. **人工 proposal** `CORE_INDUSTRY_PROJECT_PROPOSE_V1`：沿用 canonical envelope 的 AuthSubject/actor/country/INDUSTRY/expectedVersion/idempotency/SimTime；payload 仅 `sourceOptionRef`、固定 `sourceOptionHash`、`catalogProjectId`、`locationRef`、所选 scope/version 引用。服务器核对 country/真实代理权与 approved source，确定 project/facility ID；原子 append `PROJECT_CREATED` + durable receipt/outbox + head。只建立 PROPOSED 状态，不增加产能/库存/就业、不发资金。ID 命名、strict parser、command/event version、source-hash 绑定和 derived result DTO 是工程选择，可直接供 B 审，不需重新做宏观经济决策。
2. **批准后实际推进** `CORE_PROJECT_CONSTRUCTION_PROGRESS_V1`（VERSIONED_AUTOMATIC）：只接 server-owned same-head facts 与实际 scheduled interval，复用 `V14ProjectLifecycleInput` / `calculateV14ProjectLifecycle`，把 proposal 的 exact material/labour consumption 接现有库存、Labour owner 与 atomic candidate，不能让客户端提交 funding/material availability factor 或任意 finish 百分比。
3. **commission** `CORE_PROJECT_COMMISSION_V1`：只有物理进度完成、全部 mandatory input/milestone 证据与实际测试通过、当前审批/许可/技术/owner 有效时，原子建立唯一 facility handoff/operating-capacity fact 和 event/receipt/outbox。尚缺 operating inputs 时保留 BUILT/NOT_OPERATIONALLY_READY；设施地图仅消费其 projection，不由图标创建经济能力。

实际可复用：`technology-project-foundation.ts:247–352` 的 typed inputs/result、`:425` 的 lifecycle kernel（校验 lineage、same project、材料唯一、reservation、资金/劳动/技术/oversight、exact progress、handoff）；`technology-project-household-fiscal.ts` 的 `canStartProject/calculateProjectProgress`；V12 inventory availability、production-consumption posting 与现有 atomic repository；`tests/world-core/v13-v14-foundation.test.ts:268` 的 complete/commissioning 与 blocked cases。它们是 deterministic proposals，不是现成设施 authority store 或合法付款证明。

### 具体源记录检验，不泛称所有成本/能力都缺

读取固定 `artifacts/world-balanced-candidate-v1/data/facilities.json`：1374 条，SHA256 `049e39330646048b95636d3a075fc1423ee62762999184a2326df161a198b485`。例 **P01 / PROJECT-21 深水港 / visual-territory-44-E1**：位置 `[135,328]`、候选 capacity `60056.27 tonne/sim-day`、owner GOV-44/operator OP-44、workers2740、machinery137 已存在；不重新生成这些值，也不把候选 capacity 当可用 capacity。

这一记录确实仍需具体源绑定：

- `recipeId=null`、`legacyRecord.recipeStatus=CORE_COEFFICIENT_BINDING_REQUIRED`；没有 construction steel/copper/machinery exact quantity recipe 或 total capex/payment schedule。需要实际项目目录/成本/材料输入来源，不是请用户重新发明建设链。
- `constructionSimDaysProposal=90` 与 legacy `constructionSimDays=270` 不同；不能擅选。需 source owner 记录采用哪个字段/版本，不能改自然时间 multiplier。
- 顶层 requiredPowerMW/requiredWaterM3Day 为0，legacy分别49.32/4932；maintenance10960与legacy23121.13不一致。需确切 reconciliation/adopted operational facts，不能把0当已获无限水电或免维护。
- 350 development options 不因 D04 genesis 采用而建成。可立即实现 proposal/严格拒绝缺事实；实际开工和commission依赖已经提供或后续补齐的 funding/material/labour/rights/milestone facts。这里只对冲突/缺失的精确输入求 owner/source 决定，不重问“是否审批/是否commission/是否材料约束”。

## 6. 实际检查、保留失败与剩余 gate

本轮 Node `/Users/samuel/.npm/_npx/92e92e656f04b72c/node_modules/node/bin/node` =24.20.0；pnpm `/Users/samuel/.cache/node/corepack/v1/pnpm/12.3.4/bin/pnpm.mjs` =12.3.4；下表 node/pnpm 指这两个实际路径，pnpm 子进程 PATH 也绑定该 Node。锁文件未改。

- migration validator：23 artifacts，0 violations，exit0；新 native 文件 1次、2 PASS、exit0。
- 保留一次初始 typecheck FAIL：初版复用 shared `v09-atomic-database` 带入 PGlite 的6条 Emscripten/FS 第三方类型缺失；单条 tsc exit未独立捕获（组合 shell 最终exit0不能冒充其PASS）。未设 skipLibCheck、未补假声明，而是改为直接复用既有实际 `PostgresSqlDatabase`。随后严格 tsc 独立exit0；native invocation 从未失败/重试。
- 保留一次初始 boundary FAIL，exit1：18 条 `UNRESOLVED_ARCHITECTURE_IMPORT`。只读确认两个 Core contract d.ts、两个 Worker d.ts 缺失，API 的 worker workspace link 也缺失。`pnpm install --offline --frozen-lockfile --ignore-scripts` exit0，恢复本地 workspace links（无网络解析或 lifecycle script）；固定源码 Core/Worker build 各 exit0 后，同一未改动 checker exit0。没有改 checker、导入/exports、业务代码或锁文件来绕过失败。

| 本轮实际检查命令                                                                                                                         | 结果                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `node scripts/validate-migrations.mjs`                                                                                                   | exit0；23 artifacts /0 violations                                                    |
| `node node_modules/typescript/bin/tsc -p tests/support/tsconfig.f-v09-native-claim.json`                                                 | 独立 exit0；strict、skipLibCheck=false                                               |
| `node node_modules/eslint/bin/eslint.js tests/world-core/f-v09-native-claim-recovery.test.ts tests/support/f-v09-source-inheritance.mjs` | exit0                                                                                |
| `node node_modules/prettier/bin/prettier.cjs --check` + 本候选六个新增文件                                                               | exit0；全部符合格式                                                                  |
| `pnpm --filter @econmind/core build`；`pnpm --filter @econmind/world-worker build`                                                       | 各 exit0；只生成 ignored dist，不重跑数据库                                          |
| `node scripts/check-boundaries.mjs`                                                                                                      | setup 修复后 exit0；313 files；原18条 FAIL 保留                                      |
| `node scripts/check-authoritative-patterns.mjs`                                                                                          | exit0；Core89/total308；0 violations                                                 |
| `node scripts/check-repository-secrets.mjs`                                                                                              | exit0；2358 files，包含新增文件                                                      |
| `python3 tools/validate_r2_governance.py --json`                                                                                         | exit0；14 checks PASS；只读，无应用执行/DB；required gate 仍为 V09.1_ADR_18_DECISION |
| `env -i PATH=/usr/bin:/bin ECONMIND_ENV=local <node> scripts/assert-safe-environment.mjs`                                                | exit0；databaseConfigured=false；NOT_LINKED；mutation=false                          |
| `f-v09-source-inheritance.mjs` + Node strict assert 生成输出与已存 JSON bytes 相等、516相同/唯一差异/无删除                              | exit0                                                                                |
| `git diff --check 42991acfee9d0eacc702ba47a380c938a4516f03`；`git diff --cached --check`                                                 | 均 exit0；staged 检查包含此次新增文件                                                |

- 本轮未跑全套、420、六角色浏览器玩法、正式开局、worker/Clock activation、生产/TLS/staging/真实身份角色授权。原 FAIL/UNKNOWN/SKIP 没有擦除。
- 证据足以交 B 判断 **V09 隔离实现/证据的下一合理 review gate**，不自行写 VERIFIED、不称 Gate B 闭合；formal source/admission/角色/部署仍单独门控。六角色整链的既有缺口表保留，不用 V09 事务测试代替角色业务完成。

## 7. Raw artifact 定位

新 owned root：`/Users/samuel/Documents/econclub/artifacts/f-v09-claim-recovery-20261010.KgSwqT`。历史 CI 是只读下载；没有重建或修改原 producer artifact。

| 文件                                           | SHA256                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| `NATIVE_RESULTS.json`                          | `fbba98a2b2214b1ea05cc512eaaa4a468af37e5abbabc28a5bdd9d6de3008fd7` |
| `CI_RENEWAL_ARTIFACT/renewal-results.json`     | `55b93bec438e10446f5d5b0f6fc4e5d7c4259fff30b9a961db16797f5e28a053` |
| `CI_OFFICIAL_ARTIFACT/official-pnpm-check.log` | `dee31a5d4aa48a5f3f508e46464e6af0442ea5bb033c87deeaf328d728da7eb6` |
| `CI_37924277567_NATIVE_JOB.raw.log`            | `881ab97895dc939ae7ce53ccc6d221c8630de120b3f0149051833f904e24e1d1` |
| `CI_37924277640_RENEWAL_JOB.raw.log`           | `8d987f5e4c8280a6ad7d3641878c64b25d395e1780823dd3064111ac0a1fa7a7` |
| `CI_37924277567_METADATA.raw.json`             | `f9f33092f24080d89f354e02f3ed474117f7ff2b68725328a9059c0d0cf5176f` |
| `CLOSURE.txt`                                  | `b099e26394957cfe6f3b39a145d2fa56b5044cbb36456c183a9e8b7ac20fc5e5` |

本报告与最终 commit/tree/hash 由外层交付绑定，避免自引用改写收据。完成后 STOP，不自行 merge、部署或扩展 Industry 实现。
