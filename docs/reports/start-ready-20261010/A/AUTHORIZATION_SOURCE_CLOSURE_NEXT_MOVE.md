# A — 授权来源收口：可分派 next move 与设计差异

日期：2026-10-11，Asia/Shanghai。状态：DESIGN_PROPOSED / NOT_APPROVED / NO_RUNTIME_CHANGE。

我们已有可独审的 default-deny 机械候选，但还没有能授予 World seat 的真实来源链。我建议下一步先交付一个**未注册的 World 原生授权来源协议设计包**，再决定是否授权实现。内部缺少 record/pointer/adapter，不等于需要 Owner 交一份数据库；真正不能由工程合成的是合法操作者及任命事实，以及规范尚未指定的信任根。下文把这三类逐项拆开。

本次只提交这一份仓库文档，不创建新的 SQL、角色、registry、migration、grant、caller 或 writer，也不改变任何 ADR/进度状态。安全加固设计技能用于证据、边界和交付检查；按本轮单文档范围，不另起通用扫描或多方案 portfolio。

## 1. 固定证据与“当前”的含义

我读完 E 的冻结 source packet，并检查了下列必要的 Constitution、D06 和现有 server-authority 前沿，没有重做 E 的全范围筛查。

| 输入                    | 固定 identity / 证明范围                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| A 已交 C 的实现         | code `cb4465e103cdbde139292e3d183a0690c86c8fb1`；tip `023bef139f58fb1205830c3b9f81e80f0454ca8d`，保持冻结     |
| 本文父提交              | 同上 tip；独立分支 `codex/a-authz-source-closure-design-20261011`，仅新增本文                                 |
| 当次本地 origin/main    | `590b56b6f138fba2aaf81067c3aad0e8e1a69890`，已包含 PR134；不是新 fetch 或部署证明                             |
| 当前规范/authority 比较 | 13 个必要文件与上述 main 字节一致；Constitution 原 DOCX 匹配 source manifest；不据此认证其他组合代码          |
| E 完整 packet.md        | SHA256 `f8e1a3a93d7fe42e57192727583e4cd7b8079a6294417850b144b365d2f5aad3`                                     |
| E packet.json           | SHA256 `02b1abd616bf98d62d13cedb4c29212200b56f51c628ce1d28d0bb8ef47cb77c`                                     |
| E source-evidence.json  | SHA256 `91e24564804126ad95524a4a5d2db55ee508d27769188f00b6bfeeba5a510c5d`；24-source 固定索引，不是实际授权行 |

E managed collection locator：
`econmind-os-world-simulation/artifacts-9f5b0b5b98a46d70850984477e0abe830c761ec4f4413810e3052e22052331f4/artifacts/E_AUTHZ_SOURCE_PACKET/`。
其中 World 固定于 `eb033a4d9e717a9cb9149e450900b606c3457403`，Legacy 固定于 `c8396ffff0238c6871890176a679e791963cf379`。E 找到旧站平台角色/RPC、roster 和 World JWT 实现，但没有建立 World source registration/admin/cutoff；其 absence 只限所列源码范围。本文不读取旧站实际用户行或批准行，也不推断 deployed DB 状态。

### 已成立的规则，不重新求批

- [Constitution](../../../../specs/extracted/CONSTITUTION.md)：R091–R094 / U0364–U0371 要求 many-to-many RoleAssignment、Office 独立审批和服务端复验；U0387–U0394 要求 identity、World、Country、Office、对象、状态、version、approval 全部适用检查。R098/R099 不能用关闭 RLS 或 UI 隐藏替代隔离；R100 不给 admin 经济法则豁免。
- [D06 原 Owner 决定 §6](../../../governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISIONS.original.md)：真实服务端验证的现有 Owner/admin 通过既有权限链获得**显式** TEST_ONLY seat；同一隔离 World 的前两个已准入且具备所需账户/库存国家、各六 Office，24 小时现实 TTL、可提前撤销；生产 seat 不自动发放，真实玩家名单继续后置。不能重问是否开启 NPC，答案仍为 OFF。
- [决策 register](../../../../status/decisions.json)：ADR-20 已 APPROVED，intake、适用 approval、权威 user-command commit 前重验，未提交 discretionary work 撤权后零效果失败；已提交事实/版本化自动义务不追溯撤销。ADR-17 的原子历史边界及 ADR-16 唯一发布链已批准，不再请求批准。
- [Core offices](../../../../packages/core/src/authorization/offices.ts) 定义六 Office、18 domain capabilities，另有 `SIGN_OFFICE_APPROVAL`；[projections](../../../../packages/core/src/authorization/projections.ts) 的 ADMIN 需要 current identity/membership/isWorldAdmin，只有接口不是已注册 ADMIN source。
- [JWT claims](../../../../apps/world-api/src/integration/identity.ts) 与 [JWKS verifier](../../../../apps/world-api/src/integration/supabase-jwks-signature-verifier.ts) 已有实际实现；只能证明身份链的代码能力，不能从 `sub/iss/aud/exp` 推出 World 任命。
- [A schema](../../../../database/migrations/artifacts/0011_world_v2_current_commit_authorization.sql) 是下游 current 投影，缺 original record/current pointer/admin/expiry；[Worker guard](../../../../apps/world-worker/src/authoritative-execution.ts) 在已开事务内读 A，不以 intake evidence 回退。
- [D06 seat preparation](../../../../apps/world-api/src/integration/non-host-isolated-seat-policy.ts) 返回 PREPARED_NOT_GRANTED，所需 source/resolver 尚不能当真实 grant；[current-seat reader](../../../../apps/world-api/src/integration/authenticated-current-seat-reader.ts) 枚举上限六 Office且要求同国/同 team，不能宣称已支持双国 seat。

以上是 Observed；“需要一个内部原生来源层才能避免把旧站资料当任命”是 Inferred。以下所有新增对象/协议/文件建议均是 Proposed，不是存在性或批准记录。

## 2. 缺口分类 / 最小工程交付

“owner”在工程列指负责模块的团队，不意味着工程人员可替人批准任命。每项均有独立产物和可判定出口。

| 缺口                          | 类别                              | 最小可执行交付（另审后才实施）                                                                                                                                                 | 验收 / 不可代替的证据                                                                                    |
| ----------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| source owner 与注册契约       | 内部 I-01                         | authz owner 写固定 producer/schema/version/World/environment/adapter/DB-caller 绑定清单；构造入口只接受受控注册实例，不接 caller callback / approved Boolean / URL             | 未注册、错版本/环境/World 一律零写入；代码 owner 不是任命 authority                                      |
| 原始不可变批准/变更 record    | 内部 I-02 + 外部 X-02             | 定义 authoring/acceptance 边界；保存**当次原始** bytes/hash、request/op ID、actor、任命各项、approval refs、revision/predecessor、purpose/effective/expiry/revoke/supersession | accepted record append-only，digest 不等于批准；旧 audit 缺 bytes 不能回填为“原始批准”                   |
| current pointer / lineage     | 内部 I-03                         | 按 environment/World/subject 指向唯一 accepted revision；CAS predecessor，拒绝 source branch fork，原始记录与 currentness 分离                                                 | revoke 可指向 empty set；旧 record 存在不等于当前；同 operation 改 bytes 不得复用                        |
| 当前 Owner/admin 验证         | 内部 I-04 + 外部 X-01 + 人定 H-01 | 固定 server lookup，并记录 World-scoped admin authority revision、issuer/subject binding、scope、revoked/effective/expiry 与信任根引用                                         | 不信任 DTO.isWorldAdmin；JWT/Legacy platform admin 只作为 identity/evidence 线索；不存在合法链则止于准备 |
| same-H cutoff 协议            | 内部 I-05 + 人定 H-03             | source grant/revoke/current-admin 变更与 publication 共用 World H；H 后 fresh READ COMMITTED snapshot，完整锁顺序与所有 consumer 覆盖清单                                      | 无 remote true→local write 间隙；不等待异步撤权任务才失效；不得持 source 锁后反向请求 H/S/Q/lease        |
| 完整 A/C publication          | 内部 I-06                         | 在实际 registered source 存在后，实现受限 execute-only publisher；同事务 source acceptance/current pointer+A+C，完整 subject replace/CAS；失败 all-or-zero                     | 原 proposal 仍只是 H-first refusal；新正向 schema/ACL/definer须另审、manifest/release 授权               |
| D06 双国/审批 capability 兼容 | 内部 I-07                         | 提交 source-envelope/complete-set 与读取契约差异；覆盖两个国家独立 Office、scope/team、独立 approval capability                                                                | 不能把单国 replacement 调两次冒充保留双国；不能把 domain capability 当签批权                             |
| 已有 A 无 C 的 baseline       | 内部 I-08 + 外部 X-03（若真有行） | 设计显式 reconciliation：可追溯真实来源逐项比对，否则保持不可用；不从 A 反签 original source                                                                                   | A 缺来源不能自证；不要假定 deployed A 为空，亦不要求本轮查生产                                           |

I-01/I-02/I-03/I-05/I-06 是我们应建设的工程部件，不该全部交回 Owner 作“external blocker”。但建设受审的空协议与确认真实 identity/appointment 是两回事；没有 X/H 输入时，我们仍只能验证负例或 TEST_ONLY oracle，不能将其升级为 grant truth。

## 3. 仅真正需要的外部输入

这些对象由未来合法 owner/operator 流程在受控 server 路径提供；当前不索要 token、密钥、玩家总名单或数据库 dump。不可用时准确标字段，不用 `approved:true` 代填。

| 对象                                      | 最小字段/事实                                                                                                                                                                   | 安全接入方式 / 当前边界                                                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| X-01 操作者 identity + 现有合法 authority | 实际 `issuer/audience/authSubject` 的服务端验证绑定；authority 根/批准记录 ref、World/environment/scope、当前 admin revision/status、效期/撤销；actor 与 DB service caller 分开 | 用户只在正式受控认证入口提交会话；服务端复用验签/claims 校验，token/私钥不落 repo、报告或日志；发布登录由 operator 后续绑定，不由用户 DTO 决定          |
| X-02 一次真实任命或撤销决定               | 有权批准者及可追溯决定 ref；目标 subject、environment/World、明确 country/team/Office/capability 集合、purpose、生效/失效、撤销/替代关系；各 Office 独立批准依据                | 服务端按已审契约在原 authoring 边界保存原 bytes；以现有合法权限链审查并接受，不接受浏览器自声明 grant；当前无需提供真实玩家，D06 也不自动生成十二条批准 |
| X-03 真正需要接续的历史授权               | 仅对应目标 World/subject 的现行源 record/ref/raw digest、predecessor/current pointer、revoke/expiry 与 A 对账证据                                                               | 后续限域只读/受控导入并去敏；没有原件只报缺项，不能从时间戳/moderation text/A.version 猜 lineage                                                        |
| X-04 部署绑定事实（发布阶段）             | 实际环境、非秘密 DB/project identity、source schema/object/version、adapter/source commit/hash、合法 publisher role、唯一发布 chain receipt                                     | 由有权 operator 在另行授权的治理步骤提供非秘密 receipt/locator；秘密保留既有 secret manager，不发到聊天；目前不查生产/不建立另一迁移发布链              |

国家目录、两个 eligible countries、opening/account/inventory readiness 应来自已受审 World admission/opening 的**内部**读取，不要求 Owner 重新制作余额或国家名单。它们未准入是另一工程/数据 gate，不由 authz source 包豁免。若本来没有历史 record，I-02 可为未来新的真实决定定义原始记录协议，不必假装旧站早就有该表；但“新协议”不自行产生 X-01/X-02。

## 4. 剩余人工/架构决策（不重开已定 D06）

Constitution 规定必须查什么，并未在上述必要片段中指定 World 任命的首个信任根或实际发布者。D06 明确要求**既有**合法链，因此不能把“Owner 允许测试”自动扩展为“工程可新造管理员”。我们需要以下精确 disposition，不要求 Owner 设计表结构：

| 决策                                   | 推荐 / 备选                                                                                                                                                                                     | 必须由谁确定及边界                                                                                                                                                                                               |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H-01 实际任命 authority 的信任根       | 优先提供并验证**现有** World/项目 authority chain 的具体 locator/actor binding；若不存在，单列一个最小 World-scoped bootstrap/appointment protocol 供 Owner 决定，而不是自动复用 Legacy Superme | Owner 决定谁有权任命、撤销和委派及其限域；C 审 bootstrap 防自批/权限提升；Root 另授权实施。不得仅填人名/true 或 JWT claim，就宣称验证完成                                                                        |
| H-02 缺 source 时采用什么架构          | 推荐评审下节 bounded World-native same-H source；若确有已存在同库真实 source，则做固定 adapter 而非重复 registry；remote source 仅在其真实能力已知且 fence 另审后考虑                           | 属于 P0 Architecture Change，须独审和负责的人类 owner disposition；本文件不登记新 ADR 为 APPROVED，也不声称原规范已指定对象                                                                                      |
| H-03 期限/全局生命周期的 cutoff        | TTL=24h、可撤销、未提交重验已定；尚须审定**实际线性化时点**、可信 real clock、长事务跨 expiry、admin/identity 全局撤销如何到各 World                                                            | 推荐沿用已有 transaction-cutoff 语义并禁止 stale source、加所有 consumer freshness；不得把异步定时刷新当精确 expiry。若要“expiry 后连此前开始事务的 COMMIT 也绝不成功”，需额外可证明机制，不能由本文默认改成宽限 |
| H-04 历史缺源 A 的接续（仅实际遇到时） | 有原件就受控 reconcile；无原件保持不可用，要求新的真实任命决定，不反签历史                                                                                                                      | Owner 对重新任命/取消旧状态负责，工程对差异/迁移负责；不得以回填 C 的便利决定谁仍有权                                                                                                                            |

双国、六独立 Office、禁止 auto-approve、24h、NPC OFF、生产排除、ADR-16/17/20 不在待选列表。SIGN_OFFICE_APPROVAL 的独立性已有 Core/Constitution 依据；如何在 source 中表达及 consumer 如何校验是内部契约实现，不是再问是否可以绕开独立审批。H-03 的 SQL clock/lock/fence 选型同样由工程与独审解决；仅当必须新增或改变“何时失权”的产品语义、宽限或全局撤销规则时才需要 Owner 裁定，不能把所有时钟实现细节都升级为人工 blocker。

## 5. Bounded design：一条原生来源链，不新增经济真相

### 可行路径与条件化推荐

**路径 1：已有真实来源的固定 adapter。** 若 X-01/X-02 能指向一个实际、合法且可同 H 协调的现有来源，这是迁移成本最低的路径。我们保留原 owner/record/currentness，不为了统一命名复制一份来源。E 只找到 Legacy admin/roster，它们不满足这个条件；当前不能把路径 1 标 READY。

**路径 2：受审 World-native 来源协议（当前建议）。** 我建议让 authz owner 负责一个小型 server-owned authoring/acceptance 边界：以真实有权 actor 的明确决定为输入，形成不可变授权记录和 World-scoped current pointer，再由固定 adapter 驱动 A/C。此层是权限事实的来源，不是经济 Event/Ledger 的竞争真相；A、C、entitlements 仍是派生数据。新增 authority trust root 仍须 H-01，不因我们选择存储模式就存在。它的好处是 revoke/admin/source/publication 可共用同库同 H；代价是要正式拥有记录、ACL、审计、期限 consumer 和 baseline migration。

**路径 3：真实 remote source + 另审 fence。** 若将来已有外部任命系统不可迁移，保留它可能更合适。但网络查询之后本地 commit 不能证明当前性；需明确远端 revision/current pointer、撤销协议、所有 consumer 的 fence 与失联 default-deny。这增加双系统 availability/恢复成本。在能力未知时不先做泛型 remote plugin，不接受“缓存若干分钟仍有效”作为隐含政策。

当前/拟态的关键差异如下；箭头表达未来受审依赖，不表示组件已经存在：

```text
当前：JWT identity → current-membership 接口 / A consumers
      Legacy admin / roster ──不是──> World 任命
      未注册 preparation → DENY（零写入）

路径 2（拟）：真实有权决定 + server-verified actor
             → 固定 authoring/acceptance → immutable record/current pointer
             → H → real source/current-admin → C → complete A → 派生 reads
      所有相关 consumers：同 cutoff freshness/revocation，非浏览器自证
```

| 变化        | 当前                                | 拟态                                                       | 安全后果 / 成本                                      |
| ----------- | ----------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------- |
| source 身份 | 接口或提案 refs                     | 固定注册 owner/schema/code/locator/caller                  | 不能任意注入 resolver；新增发布治理                  |
| 任命证据    | A 无原批准、Legacy 无 World mapping | 原 authoring bytes + actor/authority/Office refs + lineage | 可追溯但必须真实批准；新增敏感记录留存/ACL           |
| currentness | A.active，无 expiry                 | source pointer/revision/revoke/expiry 与 cutoff reader     | 不靠延迟 job；要覆盖每个 consumer                    |
| 失败/重试   | 纯 metadata compare                 | 同事务 source+A+C / 新事务真实 source readback             | UNKNOWN 不重试成新 op，增加明确恢复状态              |
| D06 范围    | 单国准备 envelope/单国 reader       | 双国显式 binding 与逐 Office approval                      | 避免相互覆盖；是明确后续契约差异，不偷偷扩写当前候选 |

### 拟 record 与职责（逻辑字段，不是 DDL）

注册 descriptor 固定 producer owner、schema version、code artifact、environment/World allowlist、受控 object/key lookup、合法 service caller、source/current-admin helper 和发布策略版本。业务调用只能传受限 operation/reference/expected CAS 参数，不能传“验过的 source”对象来获得权限。service caller 的合法身份不等于 actor 有权任命；两者都必须查。

拟不可变 record 将以下内容分层，而不是混成一个 `isWorldAdmin`：

- **原始请求与批准**：原 bytes/hash、request/operation ID、真实 actor identity binding、决定/Office approval refs、用途；拒绝/未接受的请求不成为 source truth。
- **完整授权状态**：environment/World/subject，显式 `bindings[{countryId,teamId,officeId,capability,approvalRef}]`，schema/revision/predecessor/current pointer，生效/失效与 revoke/supersession。D06 的两个国家、各独立 Office 不得压缩为 wildcard。
- **authority 和时间依据**：World-scoped admin authority record/revision/status/root ref、trusted real-time cutoff 样本、同-H 协议版本。记录输入文字的 actor/admin 字段不替代 lookup。
- **派生发布证据**：原 expectedWorldVersion、完整 before/after semantic fingerprints、C publication metadata。source bytes hash、source code hash、projection digest 必须区分。

所有正向 source acceptance/current-pointer 变更和 A/C publication 拟在**同连接、同事务**完成，不让一条已接受的 current grant 先对外生效而 A 仍是旧状态。authoring 可先保存 unaccepted immutable request，但没有 accepted pointer 和合法 source transaction 的 request 不能授予权限。source 操作不新增经济 WorldVersion/Command/Event 语义；安全审计如何接已有 audit/outbox需在后继设计指明，不以权限 metadata 冒充经济事件。

checkpoint 仍按 World/subject 管理完整集合；country/team 移入显式 binding，须为候选 v1 的单国结构提交 versioned delta，而不是原地兼容猜测。D06 只要求双国上限，并不改变正式 RoleAssignment 的 many-to-many 规则。原候选只接受 18 domain capability；后继需明确逐 Office 的 SIGN_OFFICE_APPROVAL 来源与对象/版本绑定，它不代表任意经济动作或所有 proposal 的已批准记录。

### Lock / ACL / expiry 的闭合要求

拟正向 writer：H → real source/current-admin → C → **该 subject 的全部 active/inactive A**。H 后采用 fresh READ COMMITTED 读取，current pointer、admin 和原 record 必须由同一受控源解析；source helper 后面不得再取 S/Q/lease/other-World H。对同 World 多 subject/admin 更改要提交稳定锁序。全局 admin/account 撤销不能通过“逐 World 异步刷新最终一致”继续允许旧权；应有已审 fence/deny 协议，或仅使用确实可同-H验证的 World-scoped authority。跨 World 全局语义尚未成立，不能假装锁一行已解决。

live publisher 只拥有精确函数 EXECUTE；拟 NOLOGIN/non-assumable definer 非表 owner/NOBYPASSRLS，固定 search_path/列权限/RLS，原始 record append-only、pointer CAS。实施包必须列所有 inherited/SET ROLE/maintenance/alternate-function/raw-DML 路径，不能给 app/service 一个通用 A/C/source 写口再声称 writer 唯一。

expiry 随现实时间变化，不会自动取得 H；A 目前也不存期限。因此“定时 revoke job 与 H 串行”**单独不够**。拟要求 intake、approval、E/manual、Worker 正/负分支、恢复与私有 read binding 均在各自受审 cutoff 查询受控 source freshness，或消费经审定可证明等价的期限证据；只改 writer 不发布其他正向路径。同步的 current source 决定 effectiveAt ≤ now < expiresAt、revoke/admin status；无 source/错 revision/过期则 deny。长事务在最终检查与 COMMIT 之间跨期限的语义明确交 H-03，不用 transaction-start timestamp 静默延长 TTL。

UNKNOWN 恢复只能在新事务重新取 H/source/admin/C/complete A，比对原 op、原 bytes、原 expected 值和实际现行源。已被 supersede/revoke/expiry 的旧 op 不能因 C 曾匹配而恢复权限。产品级 EXISTING 也须真实 source 检查；当前纯 comparator 的 METADATA_MATCH_REAL_SOURCE_REQUIRED 不升级为成功 receipt。

## 6. 工程差异与可分派交付顺序

以下文件名是拟分工，不存在性声明；真正实施需 Root 固定组合基线、C 独审、负责 Owner disposition。没有 source 时最多先做不具授权效果的类型/拒绝/契约测试，不能继续“准备”出可调用的正向后门。

| 交付                                      | 建议责任边界 / 产物                                                                                                                                                        | 最小出口                                                                                                                     | 外部/人定依赖                                                                               |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| N-01 本文的 owner review                  | Root/C + 实际 authz owner：确认 I/X/H 分类、选择路径、信任根/期限语义 disposition                                                                                          | 明确采用/拒绝/差异，不自批                                                                                                   | H-01/H-02/H-03；不要求真实玩家名单                                                          |
| N-02 source contract delta                | A/authz owner：拟 `docs/architecture/authorization-source-contract.md`，schema/字段/lock/clock/CAS/ACL/consumer inventory；必要的 versioned pure contract tests            | 接受的是设计，不是 registration；补双国、approval capability、不可变请求与 accepted record 区别                              | N-01；X-01/X-02 可尚未实际发放，但不能宣称 live readiness                                   |
| N-03 原生 source/adapter 未注册候选       | A/authz owner：拟 `apps/world-worker/src/authorization/current-authorization-source.ts`、`database/proposals/world-authorization-source.sql`；实际字段/role/原批准接入测试 | 原始 record/pointer/admin/cutoff 来源查明；非管理员 actual-schema / failure / CAS / UNKNOWN 测试；无 production registration | N-02 独审，真实 authority 链证据；任何新增正向部分需独立实施授权                            |
| N-04 writer + consumer 组合 closure       | A：source/A/C publication；B：narrow approval；D：zero-effect；E：manual-definer 另定 scope；API/read owner：双国 seat/read；G：composition/runtime 仍独立                 | 正反 cutoff 双顺序、expiry without job、recovery、无 A/source 绕路；双国不覆盖、独立签批；固定组合 review                    | N-03；E-I01 不被本文关闭。B/D 已有 PR134 closure 不重做，新增 source/TTL delta 必须明确增量 |
| N-05 唯一发布治理与一次真实隔离 seat 发放 | Root/唯一 publisher + verified authority：按 ADR-16 固定 artifact/manifest/provenance/catalog/role receipt，受控 registration，合法 D06 seat                               | 每个 gate receipt齐备后才可接线/发放；无经济/production 自动 activation                                                      | X-01/X-02/X-04 + N-04 审批；生产单独授权，D05 仍排除                                        |

现在明确的最小 next move 是 **N-01 → N-02 的受审 source contract delta**，不是让 E 再扫一次旧站、让 Owner 建表，或让 A 在 C 审查期间扩写被冻结 writer。N-03–N-05 只是分派出口，不构成实施授权。若 N-01 无法确定真实合法 chain 或批准必要 trust-root 设计，应报告 H-01 实质阻塞并停止在未注册协议层。

## 7. 后继验收 / 风险 / 回退

本轮所有以下测试均 NOT_RUN；它们是后继的验收计划，不将旧候选 15+9 PASS 转移给新 source 方案。

| 风险                   | 必须验证的实际失败场景                                                                                                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0 source/admin 假权威 | 未注册 producer、替换 helper、错误 issuer/audience/World/environment/service caller、actor 非当前 admin、admin revoked、任命越 country/Office、无独立 approval；全拒绝且零写入      |
| P0 原子性/竞态         | grant 与 revoke 两种先后、admin revoke 与 user commit 两种先后、并发 source predecessor、完整 active/inactive A CAS、source/pointer/A/C 任一步异常全回滚；无 Event/Ledger 竞争真相  |
| P0 expiry/cutoff       | 不运行清理 job 也能拒绝过期；H 等待后重新取 real time/source；事务跨 expiry 按 H-03 精确规则；全局撤销 fence失效/失联拒绝；所有正/负/manual/approval/read/recovery consumers 不遗漏 |
| P0 ACK/UNKNOWN         | COMMIT 前失败、COMMIT 成功 ACK 丢失、cleanup 异常；新事务真实 readback；重复 op 改 bytes/expected 冲突、superseded/expired 不复活                                                   |
| P0 scope/ACL           | 同 subject 双国各六 Office、无第三国/wildcard、每 Office 独立批准；非 admin 不能 DML/SET ROLE/继承/替代函数绕过；正式环境拒绝 TEST_ONLY身份/source                                  |
| P1 迁移/读兼容         | 已有 A 无 C、inactive rows、old envelope version、单国 reader limit 7、scope-aware membership/resolver、SIGN_OFFICE_APPROVAL 独立源；不弱化原 fail-closed 检查来“支持双国”          |
| P1 运维                | source不可用/record过大/锁等待超时/版本不兼容，明确 refusal/UNKNOWN 与最小去敏审计；日志不保留 JWT或无关个人资料                                                                    |

资源取舍未测量：路径 1 少一层迁移但取决于真实来源能力；路径 2 增加原始记录/索引存储、H/source 锁驻留和源读取，换取同库可证明的串行边界；路径 3 多网络/fence状态和失联拒绝，availability/恢复更复杂。实施前用单 World 并发 grant/revoke 与实际 consumer workload 比较基线/候选的 p95 cutoff、H wait、transaction duration、RSS、record/index增长；由实施 review 先定阈值，本文件不捏造性能数值。集中固定 adapter 可减少各 caller 自行判权的漂移，但还需完整 consumer inventory 才能证明唯一入口。

本文可直接撤销，零运行影响。未来 rollout 应先保持入口 unavailable，再验证 source/schema/ACL/组合 gate，最后才受控 registration。正向发布后 rollback 必须 default-deny 并保留不可变批准/经济历史，不能退回裸 A DML、旧过期 cache 或删除历史来“恢复可用”。

## 8. 本次结束条件

本次只做必要源码/规范/packet 阅读、固定 hash、文档格式/相对链接/差异检查和独立本地文档提交。没有 runtime/schema/migration/grant/status 改动，没有 native/full/420、生产读取、密钥、网络探测、push 或 merge。原候选工作树和 branch tip023bef 保持不动；C 的候选审查不被本文替代。

```text
SOURCE_REGISTRATION = NOT_ESTABLISHED
REAL_GRANT = NOT_CREATED
SOURCE_CLOSURE_DESIGN = PROPOSED_FOR_REVIEW
E-I01 = OPEN（本文不作新的 closure 判断）
STOP = DOCUMENT_FROZEN
```
