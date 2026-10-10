# B — opening source-adoption / preflight 实现候选

状态：`IMPLEMENTED_UNVERIFIED / INDEPENDENT_REVIEW_REQUIRED`。本报告不批准来源采用、正式 seed、runtime admission、merge 或生产发布。

## 固定身份与范围

- 分支：`codex/b-opening-source-composition-20261010`。
- 独立 worktree：`/Users/samuel/Documents/econclub/.econmind-worktrees/b-opening-source-composition-20261010`。
- 起点：拉取后的 `origin/main` `27307a108ce5c0c3e2ce28e3776f8ba15ed73d3b`，tree `69c04e4ca079e082e5f1bf85ce5d937ac6085b4d`；包含已合并的 A 原生产器。
- 已审设计：`ba92a1b7a4f1853710b1883078b1829ca6b537ff`。F 完整独审报告 SHA256：`5d8603b45091137dfbd29d60459292fa93ec8ac7d29669efb7c3f4ca54c58e51`，结论仅为设计的 `APPROVED_WITH_EXACT_IMPLEMENTATION_BOUNDARIES`，不作为本实现批准。
- 代码候选：`ae4424f681414a00a6bd3fd6268ed733632690bb`，tree `a544893ef4465fb6ef42b09511416401469ad3b2`。
- 规范 diff SHA256：`36579b753bf9e5b17c6a38bc65d997b91701939e157f0b1aea4a2b9189c2218a`。命令为 `git diff --binary --full-index --no-ext-diff <base> <code>`；逐文件身份见相邻 evidence JSON。
- 仅 6 个 Worker 源文件、1 个聚焦测试、1 个机制 helper、1 个严格配置。报告为后续 evidence-only 提交；最终 handoff 固定其 SHA/tree，避免文档自引用。

本批独占上述 source-adoption/loader/composition/bridge/preflight/publisher 最小面。没有改动 A 的地图、其他窗口、Core、原金融 parser/calculator、private authority、persistence/SQL、migration/grant、真实来源值、原审计、生产配置或 status/gate。PR131 已合并，不重复处理。

## 实现的机械消费链

| 文件                                                    | 本候选职责与边界                                                                                                                                                                                                                                                           |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `preparation/owner-non-host-source-adoption.ts`         | 原 Owner policy、null World、旧 issuer/brand 原样保留；新增同一 provenance ownership 下的独立注册契约、22 exact-key scoped record 检查及私有 proof brand。没有安装真实 registration，也没有新 registry、签名 purpose、管理员 API 或凭据。                                  |
| `preparation/official-opening-bundle-loader.ts`         | 明确 V2 incoming manifest；复用 bounded/no-symlink/O_NOFOLLOW/UTF-8/hash 读取。补充 input/docs/采用原文/receipt/父原文/receipt 全部进入同一个 publication digest。旧 digest API 从 publisher 原名 re-export；V1 shape/digest/限制不变。                                    |
| `preparation/official-opening-candidate-composition.ts` | 唯一新共用只读组装入口，只接 genuine immutable loader snapshot；调用原 parser 和原 producer，独立检查 exact adopted bytes、注册身份、输出指纹、V2 assembly、Core parse/rebuild。无 SQL、signer、validator callback 或运行注册。                                            |
| `preparation/opening-canonical-seed-bridge.ts`          | 显式 V2 多币种 assembly，绑定 70 国、五实体、619 positive 库存、title/risk、全部原生产器 batches、World/seed/replay/父规则及新采用 proof；原 V1 / TEST_ONLY 路径不变。                                                                                                     |
| `preparation/official-opening-bundle-preflight.ts`      | V2 调同一入口；只有实际返回原 producer result 才报告 `CALLED_ORIGINAL_PRODUCER`，并展示原始 result、精确 obligations、逐项 gap overlay。V1 诊断原样保留。                                                                                                                  |
| `admission/official-opening-admission-publication.ts`   | digest-selected V2 provider 返回受审的 `OfficialOpeningBundleLoader` 配置实例；服务在每次 publish 内重新 `load()`，取得 fresh genuine snapshot，调用同一组装入口。禁止 structural V2/缓存 preflight DTO。原 authority、事务、readback、purpose/revoke/UNKNOWN 协议未修改。 |

注册 identity 属于独立留存/受审服务端配置，不从 incoming receipt 自刷新。新记录绑定 Owner/原文身份、父 receipt/source pins/manifest、合同/原候选/assembly intent、精确 World/seed/current replay/orchestrator、完整文档集合、70 国与 21 类完整性 source pointer，以及显式排除项。旧真实 receipt 仍只能证明原规则，不能批准新数字或正式 World。

V2 保留每文件 32 MiB、总 96 MiB、owner-record 总额 64；两个父/补充 receipt 计入该总额。补充 docs 最多 256、每份 4 MiB、合计 16 MiB。没有提高旧资源上限。

Hash DAG 为：稳定 recordId → 完整 assembly intent（只排除 country 自己的 adoptionRef）→ receipt → source payload / bundle digest → 既有 publication signature。receipt exact keys 不接受自身 hash、seed/bundle fingerprint 或 signature 的反向字段。country order 在 intent 与 seed payload 中均 canonical；不同 inventory/financial intent 不能沿用旧采用指纹。

原生产器仍返回未经改写的 `BLOCKED / seed:null / admissionAllowed:false / activationAllowed:false` 与 `UNADOPTED_FINANCIAL_CALCULATION_NOT_IMPORTABLE` candidate。组装器确认原边界及两项 obligation 各出现一次，才可能通过 genuine 新 proof 分别记录：

- `SUPPLEMENTAL_FINANCIAL_SOURCE_ADOPTION_UNRESOLVED`
- `FORMAL_WORLD_BINDING_UNRESOLVED`

额外/未知计算 blocker、null candidate、输入/输出 fingerprint 不符仍失败。原 TEST_FIXTURE validation seed 不导入，也不转标签。独立 adopted source 仅在新 proof、原输出及完整库存/roster equality 检查后构造；复用原 Core create/parse/rebuild，不增加计算器或 Core schema。

冻结 C 审计不改写。overlay 只逐项关联 exact code/country/target 与实际 proof；库存项额外要求原 adopted rights 和 same-world exact assembly。未知 parent gaps 保留；七类 deferred gap 每国仍保留（team/facility/deposit/water/power/employment/social）。金融成功不代表六 Office 或完整 World 成功；当前整体仍 HOLD。

## 实际验证

固定 Node `24.20.0`、pnpm `12.3.4`；测试使用清空环境后的 pinned PATH，不读取数据库 URL/生产 credential。依赖来自隔离复制的已安装 pinned workspace 依赖；lockfile 不变。没有全量/native/420 重跑。

| 检查                                                          | 实际结果                                                                                                                                                                                                                   |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core / Worker build                                           | 两个实际 tsc build exit 0                                                                                                                                                                                                  |
| 新 composition 聚焦测试                                       | 19/19 PASS：真实 93-file 底包及父 receipt、机制向量/缺注册/改标签/bytes mismatch、brand 克隆拒绝、每个新增 digest 成员、双入口同 blocker 集、fresh reload drift、限额、intent 属性、fresh-process output 与双 import order |
| 相邻 V1/原 producer 回归                                      | 113/113 PASS；与新测试同一最终命令合计 7 files / 132 tests PASS，exit 0                                                                                                                                                    |
| 架构                                                          | 16 files / 90 tests PASS，exit 0                                                                                                                                                                                           |
| 新及相邻严格配置                                              | 5 个 `skipLibCheck=false` 配置 PASS，包含新增 composition 严格配置；另外两份原配置按其原选项 PASS                                                                                                                          |
| Changed-file lint / format / whitespace                       | exit 0                                                                                                                                                                                                                     |
| boundary / authoritative-pattern / local environment / secret | 全部 exit 0                                                                                                                                                                                                                |
| R2 governance                                                 | 14 checks PASS，exit 0；无 status 写入                                                                                                                                                                                     |

命令、exit code、逐文件 SHA 与原始输出 hash 见 `SOURCE_ADOPTION_PREFLIGHT_EVIDENCE.json`；`SOURCE_ADOPTION_PREFLIGHT_CHECKS.txt` 是仅去除 ANSI 颜色的持久输出副本。测试中的 ephemeral signature 仅验证否定路径，不是新来源采用。既有 financial-bridge 回归包含一次性隔离 PGlite 保存/恢复/回滚检查，不是 native PG 或生产 SQL。

保留的失败，不改写为 PASS：

1. 初始依赖复制尚未完成时，Core build 找不到 TypeScript；复制完成后实际 build PASS。
2. 初始 18 项新测试 16 PASS / 2 FAIL：非 canonical 文档 whitespace 被原 parser 更早拒绝，后改成 canonical 额外行以覆盖独立 byte equality；publisher 的 blocker 在错误对象 `blockerCodes` 中，不在 message 中，改为比较完整 code 集。没有放宽产品 guard 或既有断言。
3. 初始新测试 strict 的两处 readonly→mutable 否定 fixture cast 修正；不影响权威代码。
4. 对两份旧配置额外强制 `--skipLibCheck false` 各 exit 2：unchanged tinybench 在旧 ES2024-only 配置缺 `DOMHighResTimeStamp`；unchanged PGlite 缺 Emscripten/FS ambient declaration。原配置都保留其已有 `skipLibCheck:true` 并通过原检查。新增严格配置没有 skip/stub，真实通过。额外失败原文保留，未冒充完整第三方声明验证通过。

## 尚缺的真实证据 / 停止点

没有真实新的补充 adopted bytes、Owner scoped adoption record、独立 registration 或正式 World 输入。本轮不生成阳性 formal package。因此**有效正式 V2 proof→正式 candidate seed 的正向运行证据未建立**；这是明确输入/证据缺口，不用机制向量假装关闭。待真实采用输入到达及独审通过后，由对应 Owner 走已安装契约；不临时改算法、pins 或塞 approved callback。

全量 suite、native/external PostgreSQL、420 Office/browser、正式 source adoption provisioning、真实 registry、production bootstrap/admission/readback、生产部署、merge、push、gate/status promotion 全部 `NOT_RUN`。本候选不关闭 private registry 的独立 durable-revocation/commit 缺口，也不批准 schema 或扩大 grant。

`IMPLEMENTATION = FROZEN_FOR_INDEPENDENT_REVIEW`
`SOURCE_ADOPTION = NOT_PROVISIONED`
`FORMAL_WORLD_BINDING = UNRESOLVED`
`FORMAL_SEED = NOT_PRODUCED`
`RUNTIME_ADMISSION = NOT_GRANTED`
`ALL_SIX_OFFICES_COMPLETE = NOT_ESTABLISHED`
`PRODUCTION = HOLD`

交 Root dispatch 独立实现审查后停止；实施者没有自授 APPROVED/VERIFIED，也没有开始下一批。
