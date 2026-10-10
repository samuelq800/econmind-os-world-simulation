# E 对 D E-I02 column privilege guard 的独立审查

结论：**APPROVED，仅限固定源码候选**。风险建议 `merge / human_review_required`；无阻塞 finding。不授予合并、生产 DCL、部署、activation、admission 或 HOLD 解禁权限。本轮按要求冻结后 STOP。

## 固定输入与完整性

- 工作树：/Users/samuel/Documents/econclub/.econmind-worktrees/d-supervisor-column-guard-20261010
- base：`27307a108ce5c0c3e2ce28e3776f8ba15ed73d3b`
- code commit / tree：`c846305b34d394edbc6884ea933e4689f7ad7770` / `7878ed64874e6d03ce7ae0140966385316697b25`
- report-only tip / tree：`ad3c4609f43507c00710038256facc8fd6e94b99` / `109a10bd70c4e8246977ca4dc1fb796d4dbf4f1d`
- code delta SHA256：`40441048c65966c05c0ee448a5cffe569e403a1e7e9280a07fd8f68fd556b425`
- final delta SHA256：`35ab9b64c5039de3997f5b2ff09f5283984a4bf6915aab3898ffa18534ae6cb3`
- D 报告 SHA256：`4233d22fc30ed5086eacb79da76824544a65128190f2d2490004c24d4cd6ca3f`
- delta 命令为 `git diff --no-ext-diff --binary --full-index --no-renames --no-color BASE HEAD`，随后 SHA256。
- 独立核对 freeze 所列 **6 个源码/报告文件、16 个原始证据文件**，全部哈希一致。code→tip 仅新增报告，无测试后生产源码漂移。审查前后 D 工作树干净。
- 本轮是 E 独立审查 D，不是 E 自审 E-I01。A 的 E-I01、G 的 production identity/resource/manual runtime 均未改动。

## 语义与影响路径

生产仅修改 `apps/world-worker/src/runtime-preparation/writer-lease-supervisor.ts:bind()`。其他 delta 是负例单元测试、独立新 native 文件、旧 native fixture grant 收窄、strict include 和报告。无 migration、SQL 函数体、生产 grant、环境默认值、依赖或部署配置变更。

`acquire/renew -> change -> bind -> acquire SQL -> bind -> transaction resolves -> confirmed lease`；
`assertCanCommit -> bind -> real SQL guard -> bind`。
下游仍是 `PostgresSqlDatabase.transaction` 和原有 acquire/commit-guard 函数。commit guard 的锁序仍为 lease → World head。Worker main→runtime、index 和 package exports 均未新增 supervisor 自动接入，不能把 preparation primitive 当作已启动服务；也不能仅凭文本搜索把有明确契约的 owned primitive 判为无效改动。

## 逐项边界判断

| 边界            | 合法控制                                                                                     | 反例及结论                                                                                                                           |
| --------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Head 正权限     | table SELECT + UPDATE(world_version) + UPDATE(event_sequence)                                | 任一缺失即 head_access=false；逐项 AND，不是 comma OR                                                                                |
| Lease 正权限    | table SELECT + table INSERT + 五个独立 UPDATE 列                                             | holder_id、fencing_token、acquired_at_real、renewed_at_real、lease_expires_at_real 任一缺失即拒绝                                    |
| 超额写权限      | 上述精确列权限，无 table UPDATE、world_id UPDATE 或其他禁止写                                | table UPDATE 即使让所有正谓词为真仍被 broad_update 拒绝；有效 PUBLIC world_id UPDATE 也被拒绝                                        |
| Head 其他写     | 无 INSERT/DELETE/TRUNCATE                                                                    | INSERT 按任一 live column 检查，列级 INSERT 不能绕过；DELETE/TRUNCATE 独立 OR 拒绝                                                   |
| Lease lineage   | INSERT 保留，DELETE/TRUNCATE 禁止                                                            | negative DELETE,TRUNCATE 的 comma OR 表示任何一项即拒绝，语义正确；原 0006 lineage trigger 未改                                      |
| 身份/role graph | configured=current_user=session_user；无危险 role flags、schema CREATE、membership；事务可写 | 所有直接 membership edge 均拒绝，包括 INHERIT FALSE/SET TRUE 和两者均 FALSE；任意间接路径首先需要直接 edge。SET 后身份也不能通过匹配 |
| schema drift    | head3/lease6 个原有 live columns 的确切名称和顺序                                            | future column 不论是否获 UPDATE 均不匹配 layout，不能默默准入；native producer 覆盖 writable future column                           |
| 缺失观测        | 每个负谓词严格 false、正谓词严格 true                                                        | 缺字段、null、非布尔不被当成授权；新增单元控制只声明负例，不合成正 SQL 证据                                                          |
| lifecycle/fence | 同一事务前后 bind，COMMIT 确认后才发布，原 generation/time/stop/drain                        | acquire 后撤列权触发二次 bind 拒绝和 rollback；UNKNOWN 不覆盖旧 confirmed lease、不恢复 ready；函数身份和 SQL 锁序未改               |

PUBLIC 判断针对**禁止的有效权限**；本补丁并未宣称禁止一切 PUBLIC 权限，也未扫描所有其他表/函数。精确 function EXECUTE 检查仍沿用原契约。layout 只核 live column 名称/顺序，不是完整 type/schema/RLS/policy/function-body attestation。

旧 table-UPDATE role 被拒绝是已记录的契约收窄，不是兼容性承诺；不能通过给生产角色补 table UPDATE 来“修复”该拒绝。

## 本轮独立执行与输入证据严格分开

独立执行位置：managed 临时目录中的 exact-tip detached clone；依赖从现有冻结安装复制，Core/Worker 在副本重新构建。Node24.20.0；无数据库/密钥环境；sandbox 禁止全部 network，写入仅 managed temporary，并禁止用户目录读取（Node runtime 例外）。

| 执行者/检查           | 实际结果                                  | 证明边界                                                                   |
| --------------------- | ----------------------------------------- | -------------------------------------------------------------------------- |
| E Core build          | exit0                                     | exact-tip Core 依赖产物                                                    |
| E Worker build        | exit0                                     | exact-tip Worker 编译                                                      |
| E scoped strict tsc   | exit0                                     | 含新 native 文件，未放宽 flags                                             |
| E focused Vitest      | **60 PASS / 0 FAIL / 0 PENDING**          | supervisor55 + Core lease5；不冒称原生 SQL 验证                            |
| D native columns 输入 | 哈希核实 **36 PASS / 0 FAIL / 0 PENDING** | 实际非 admin role、精确列 grant、真实 SQL、实际 frozen migration0001..0006 |
| D native legacy 输入  | 哈希核实 **7 PASS / 0 FAIL / 0 PENDING**  | 原七项断言未改，仅 fixture grant 收窄                                      |
| D unit 输入           | 哈希核实 60 PASS                          | 与 E 本轮独立执行分别归属                                                  |

精确独立命令（在隔离副本、通过 sandbox 执行）：

```text
node node_modules/typescript/bin/tsc -p packages/core/tsconfig.build.json
node node_modules/typescript/bin/tsc -p apps/world-worker/tsconfig.build.json
node node_modules/typescript/bin/tsc -p tests/world-core/writer-lease-supervisor.tsconfig.json --noEmit --pretty false
node node_modules/vitest/vitest.mjs run tests/world-core/writer-lease-supervisor.test.ts tests/world-core/world-writer-lease.test.ts --reporter=json --outputFile=<managed-temporary>/unit.json
```

审查技能要求 subject-controlled code 无网络执行，而原 native guard 要求 loopback TCP，因此本轮 **native independent NOT_RUN**，未改 guard、未伪装执行，也未创建 PG generation；没有要停止的本轮 PG。D generation stopped 仍仅为 producer 声明，不冒称本轮独立确认。

D 原失败历史未抹去：initial native34PASS2FAIL；reused-generation repair0PASS36PENDING；最终 fresh-generation36+7PASS。原始文件哈希全部匹配，fixture REVOKE/table→column baseline 修复未放宽生产 guard。本轮首次默认拒绝隔离策略使 Node 在构建前 SIGABRT、stderr 为空；调整策略后四项全部通过。首次评估 JSON 把此历史基础设施失败列为当前 failed validation，validator 拒绝；现已准确归类为已恢复的执行环境历史并保留说明，未改推荐以迎合校验。最终 JSON validator exit0。

Producer 的 ACK/release 控制是在真实 COMMIT 后由 host wrapper 抛错，不是物理网络 ACK 丢失或实际 pool.release 故障，本报告不扩大其证明力。

## 风险、恢复与未覆盖项

- Impact **high**：privileged gate 的错误可能接受超额能力或阻断 supervisor。
- Likelihood **low**：生产范围仅 bind，逐项允许/拒绝分离，相关源码与 hash-bound native 控制一致，独立编译/strict/负例回归通过。
- Protection **partial**：原生证据来自 producer；无当前生产身份、完整 schema/RLS、active startup/rollout 验证。
- Recoverability **easy**：源码回退，无迁移/不兼容持久化；回退将恢复旧 table-UPDATE 要求，不得由此扩大生产 grant。
- Confidence **moderate**：固定范围充分可查，独立 native/生产集成未执行，明确限于源码候选。
- Status quo **moderate**：旧 guard 与精确列权限契约不兼容；这不是扩权理由。
- 排除自动合并：privileged boundary、契约收窄、architecture-specific rollout；需 Root/owner 按既有政策处理。
- 本轮未重跑 full420、旧 synthetic24+21 或 E native9；未执行 CI、生产探测、admission、activation、manual intake、端口4198操作；未清除 veto、未改 HOLD。
- 无 decision-critical 未知影响这一固定源码建议；生产接入证据仍须由各 owner 单独提供，不能借本审查跳门槛。

## 冻结产物

- [结构化风险评估 JSON](/Users/samuel/.codex/state/plugins/codex-security/scans/d-supervisor-column-guard-20261010/artifacts-c816262dcd7cd273d21c658ed57fc01d237ce6861b8e868406a0ffedfa3d3264/artifacts/E_EI02_REVIEW/assessment.json) — 已由 bundled validator 校验 exit0。
- [执行命令/exit 原始记录](/Users/samuel/.codex/state/plugins/codex-security/scans/d-supervisor-column-guard-20261010/artifacts-c816262dcd7cd273d21c658ed57fc01d237ce6861b8e868406a0ffedfa3d3264/artifacts/E_EI02_REVIEW/checks.json)
- [文件与 producer 输入哈希核对、测试归属](/Users/samuel/.codex/state/plugins/codex-security/scans/d-supervisor-column-guard-20261010/artifacts-c816262dcd7cd273d21c658ed57fc01d237ce6861b8e868406a0ffedfa3d3264/artifacts/E_EI02_REVIEW/verification.json)
- [E 独立 Vitest 原始 JSON](/Users/samuel/.codex/state/plugins/codex-security/scans/d-supervisor-column-guard-20261010/artifacts-c816262dcd7cd273d21c658ed57fc01d237ce6861b8e868406a0ffedfa3d3264/artifacts/E_EI02_REVIEW/unit.json)
- 构建/strict/unit 的 stdout、stderr 及隔离策略、运行 helper 与上述文件同目录，均经 MCP 从 temporary 导入实际 bytes。

**STOP：无 source edit、push、merge、生产写入或其他 owner 文件修改。**
