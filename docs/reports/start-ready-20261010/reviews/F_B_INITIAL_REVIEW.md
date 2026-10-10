# F — B source-adoption / preflight implementation 独立审查

结论：**CHANGES_REQUIRED / revise**。不批准此候选；已确认一个 P1 实现缺陷 F-B-01。A 的既有设计批准不代替 B 实现审查。此审查不修改候选、不推送、不合并、不部署、不更新 status/progress；不授予任何正式开局或六角色完成状态。

## 1. 不可变范围

- Repository: https://github.com/samuelq800/econmind-os-world-simulation.git
- WT: /Users/samuel/Documents/econclub/.econmind-worktrees/b-opening-source-composition-20261010
- Base: 27307a108ce5c0c3e2ce28e3776f8ba15ed73d3b
- Base tree: 69c04e4ca079e082e5f1bf85ce5d937ac6085b4d
- Product: ae4424f681414a00a6bd3fd6268ed733632690bb
- Product tree: a544893ef4465fb6ef42b09511416401469ad3b2
- Evidence tip: 0943142b798df8bca401f5f0987c31a7db9434ac
- Evidence tree: 3a7566d164e444656e9a6d3f275867e1af0815cd
- Product 父提交恰为 base；evidence 父提交恰为 product。
- 产品差异恰九文件（六 Worker、测试、helper、strict config），+1969/-49；evidence 仅三报告。九源码在 evidence tip 未变。
- full-index binary patch SHA256: 36579b753bf9e5b17c6a38bc65d997b91701939e157f0b1aea4a2b9189c2218a
- 源码、三证据文件、十二原始日志逐一独立 hash 验证见 PIN_RECEIPT.json。没有追随移动分支。

## 2. F-B-01 [P1] 原 producer fingerprint 被 V2 bridge 用另一协议重算

位置：apps/world-worker/src/preparation/opening-canonical-seed-bridge.ts:678（新加判断）。

原 producer formal-financial-opening-producer.ts:92–93、476–483 构造 candidate：
`fingerprint = 'sha256:' + SHA256(canonicalSerialize(body))`。

bridge.ts:75 的已有共享 helper 则为：
`hash(v) = canonicalSha256(canonicalHashInput(v), sha)`。

Core serialization/canonical.ts:162 的 canonicalHashInput 在 JSON 前添加 `SHA-256\\n`。因此新行678检查的是 SHA256("SHA-256\\n"+JSON)，不是原候选 SHA256(JSON)。同一候选 body 被两个不同的哈希协议解释。即使真正的 independent registration、receipt、proof、World 与所有其他字段均正确，正常原 producer 候选仍会触发 V2_ASSEMBLY_ADOPTION_BINDING_MISMATCH，不能抵达 Core rebuild。这是实现阻断，不能只归因为“等正式数据”。

合法对照：composition 已按原 producer plain canonical-JSON 协议校验候选；原 producer 未改变；V1 的 shared hash helper 本身不应改变。

独立普通离线控制：

- 从固定产品隔离归档读取实际 canonicalSerialize / canonicalHashInput、canonicalSha256 及 producer/bridge 的原表达式。
- plain candidate-shaped digest fixture，明确不是有效金融输入或正式候选；domain adapters 为 false，仅验证普通 string/array/plain-object 哈希协议；不执行 producer，不签发或伪造 proof。
- 原 producer convention 与 enumeration-order control 均 true。
- producer digest: sha256:ad6fb7265ad3fdea1af8a6065e92740477593abd6c19c6f0a210ffb4cc4314dd
- bridge digest: sha256:fa0f04bf035cfd4af22325b1f4bab2b22ab7fb7b86fd628013cb89f7019cbc4a
- requiredBridgeCompatibility = false。
- 进程 exit0 表示成功复现缺陷，不是产品测试通过。
- env-i + sandbox-exec，网络禁止，写入限制于隔离临时目录；没有凭据、SQL、生产访问或高压力实验。

保留 HASH_PROTOCOL_CONTROL.mjs 与 HASH_PROTOCOL_RESULT.json 的准确输出。

最小修复要求：只将新 candidateBody fingerprint 检查改为原 producer 既有协议；不得为了通过而改全局 shared hash、V1 fingerprints、Core 或 producer 算法。补真实原 producer 输出到该兼容性判断的窄回归，另保留真正 proof 输入边界。机制测试不得重新标成正式 adoption；真正正式 proof-to-seed positive 仍须单列 NOT_RUN，直到真实授权输入具备。

## 3. 已追踪的正向边界（不是整体批准）

- Genuine loader WeakSet 与深冻结：JSON clone/spread/ready DTO 不获得 brand。
- V2 preflight 和 publisher 调用同一个 prepareOfficialOpeningBundleCandidate；publisher 每次调用真实 loader.load，不复用已获准快照。源字节与 digest 在 SQL 前重新检查。
- digest 单实现移至 loader，publisher 仅 re-export；V1 仍是 SHA256(canonicalSerialize(bundle))，不新加前缀。loader 不再反向 import publisher；type imports 不构成运行时环。
- independent 六字段 registration 来自 server composition，不来自 receipt 自我声明。receipt 严格二十二字段、parent固定 pins、contract/candidate/World/seed/replay/orchestrator/文档集合与 completeness pointer 精确绑定；私有 WeakSet proof。
- hash DAG 将 assembly 自身 adoptionRef 排除于 intent，禁止 receipt 回指最终 seed/bundle/self hash；其他采用字段继续参与。
- 原 producer raw BLOCKED / seed:null / admissionAllowed:false / activationAllowed:false 保持原样；仅可通过真实 proof 记录两个原 authority obligations 的 discharge，不重标原结果。
- 未知 blocker 与 parent gaps 保留；仅 exact country/code/target overlay 可解除对应缺口。team/facility/deposit/water/power/employment/social 七类 deferred 不被隐藏。
- publisher 原目的授权、stored seed readback、World head/lineage、权限/revocation重新解析及 transaction completion 仍在；commit acknowledgement unknown 不改成确定 rollback 或自动 replay。既存 registry durable-revocation/commit 缺口并未被本候选关闭。
- 没有新增正式 migration、DCL/grant、Core ledger/算法、生产入口挂载或数据库操作。

## 4. 全部角色验收边界（用户最新要求）

角色集合由原有 packages/core/src/authorization/offices.ts 的 OFFICE_DEFINITIONS 独立确定，不从金融测试名推导。必须覆盖全部六 Office，而非只有 Finance：

| Office       | 原有 capability 族                                | 此九文件候选可证明的范围                          | 完整角色状态                  |
| ------------ | ------------------------------------------------- | ------------------------------------------------- | ----------------------------- |
| CAPTAIN      | STRATEGY / CABINET / CRISIS_COORDINATION          | 没有新增完整角色闭环证据                          | NOT_ESTABLISHED_BY_THIS_PATCH |
| CENTRAL_BANK | MONETARY_POLICY / BANKING_STABILITY / FX_RESERVES | 开局金融候选涉及 CB；非完整政策/稳定/储备闭环     | NOT_ESTABLISHED_BY_THIS_PATCH |
| FINANCE      | TREASURY / BUDGET / PUBLIC_DEBT                   | 只接开局金融 producer/publisher，且 F-B-01 未关闭 | NOT_ESTABLISHED_BY_THIS_PATCH |
| INDUSTRY     | PRODUCTION / TECHNOLOGY / RESOURCES               | facility/deposit/water/power 等缺口明确保留       | NOT_ESTABLISHED_BY_THIS_PATCH |
| SOCIAL       | LABOUR / EDUCATION / DEVELOPMENT                  | employment/social 等缺口明确保留                  | NOT_ESTABLISHED_BY_THIS_PATCH |
| TRADE        | POLICY / CONTRACTS / FOREIGN_AFFAIRS              | 没有新增完整角色闭环证据                          | NOT_ESTABLISHED_BY_THIS_PATCH |

这不是“其他分支不存在角色代码”的判断。本审只覆盖固定 B 补丁，不代替其他窗口的建设与验收。全产品完成必须逐角色核验身份/当前membership-country-Office-capability/revision、实际输入与动作、权威执行与原子/idempotency、可见性和结果、重启恢复/UNKNOWN、UI真实接线；70国乘六角色不能由一个角色或共有构造器样本外推。角色对象/路由存在也不等于完整经济玩法通过。保留 420 Office/browser NOT_RUN，不为满足全角色目标伪造席位或授权。

## 5. 检查证据与失败历史

F 独立本轮：

- exact SHA/tree/parents、九源 blob、三报告、十二原日志 hash：PASS。
- git diff --check base..product：exit0。
- 源码逐条审查与实际原表达式 digest compatibility control：已复现 F-B-01。
- 没有重复132、90、全量、native、420、计时/压力或生产检查。

Producer evidence（仅核实原字节/范围，不冒充 F rerun 或 provider CI）：

- 132 focused（七文件，含十九新测试）与90 architecture（十六文件）：原 local exit0。
- builds、原 strict configs、new strict composition、lint/format/boundaries/governance/environment/secret/diff：按固定证据记录；新增 strict config skipLibCheck:false，无 stub。
- 十九新测试覆盖负向注册、raw producer保留、真实loader/publisher拒绝/重载、hash DAG、fresh import orders。没有 genuine financial proof 进入新 bridge 的正向候选，所以132 PASS没有捕获F-B-01。
- 两个旧配置额外强制 skipLibCheck:false：原 exit2 必须保留。tinybench 缺 DOMHighResTimeStamp；PGlite 缺 Emscripten/FS ambient declarations。旧配置本身未改且原检查通过；新 strict 配置未导入 PGlite，明确 DOM lib 且真实通过。
- 上述额外第三方声明环境失败不是本次新 Worker 类型错误的证据，也不证明所有第三方声明全过。无需重跑或弱化旧测试来掩盖它们。

## 6. 文件读取条件与未确立项

V2 的 bounded reader 保留32MiB单文件/96MiB总预算、owner record上限和documents数量/字节限制、路径/符号链接拒绝、fixed-size open/read/hash、UTF8检查。但 parent两文件在有界读取后又传路径给原 loadNonHostOwnerPolicy；原函数用 readFile 再读一次，不独立执行这些有界/NOFOLLOW约束。

成功 brand 仍受独立固定 parent hashes约束，没有发现 authority bypass。私有 server-owned immutable directory 是实质部署条件，不能把第二次读取说成也经过 bounded reader；正常固定输入额外重复读41006字节。未进行文件替换race或超大文件实验；不把不现实timing假设强行升级为第二个P1。建议后续让 policy消费已经验证的同一字节，或在正式部署时明确且证明目录不可变。此源可见限制已保留为 unresolved，非 F-B-01 的解释或豁免。

明确维持：

- SOURCE_ADOPTION: NOT_PROVISIONED
- FORMAL_WORLD_BINDING: UNRESOLVED
- FORMAL_V2_SEED_POSITIVE: NOT_PRODUCED / NOT_RUN
- ALL_SIX_OFFICE_COMPLETE: NOT_ESTABLISHED
- RUNTIME_AUTHORITY: NOT_GRANTED
- PRODUCTION / ADMISSION / ACTIVATION: HOLD
- full/native/external PostgreSQL/420 Office/browser/provider CI/deploy/merge/push：本审 NOT_RUN
- 审查只写托管证据目录，不改原网站、地图、候选源码或治理状态。

## 7. 风险判断与交接

recommendation/workflowLabel = revise。impact high（共享开局与privileged持久化契约）；likelihood critical（已确定候选兼容性回归，不表示灾难性业务影响）；regression protection partial；recoverability easy（未挂载且无迁移/生产写）；confidence high（固定源码、字节证据及确定性协议复现）。status-quo moderate：不接入会继续阻塞开局，但不应以不兼容候选冒充工程完成。

修复后只需针对 F-B-01 做固定 delta 和必要窄回归独审；不重做 A 设计批准，不继承本次 CHANGES_REQUIRED 为通过，不自行合并/发布。全部角色构造与真实六角色闭环是另外必须逐项完成的工程验收，不能缩为 Finance。

JSON: assessment.json；schema validator结果另附。此结论已冻结，不等待其他窗口或反复轮询。
