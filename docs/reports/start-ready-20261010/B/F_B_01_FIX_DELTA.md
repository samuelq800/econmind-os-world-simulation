# B — F-B-01 最小修复候选

状态：`IMPLEMENTED_UNVERIFIED / F_B_01_PENDING_INDEPENDENT_REVIEW`。不自授 CLOSED、APPROVED 或 VERIFIED。

## 固定身份

- 唯一修复基线：`0943142b798df8bca401f5f0987c31a7db9434ac`，tree `3a7566d164e444656e9a6d3f275867e1af0815cd`。
- F 完整独审报告 SHA256：`3bf4b2b2c2ae778684a529677910fc0eebed83cde9b15be29b805713b4c9c5cf`；原结论 `CHANGES_REQUIRED` 未改写。
- 修复代码：`2d986f3794ce81e5eb7d0fba3e2056fdd3b5daa8`，tree `a9d89c1a8675bdbfa55050e94cd6279afc5c6f4e`。父提交恰为上述基线。
- `git diff --binary --full-index --no-ext-diff <base> <fix>` SHA256：`7e02544e0b1d4dcf007ac7f8d71addd219bc2e90edbe67fa225c5cabc5925432`。
- 分支/worktree：`codex/b-opening-source-composition-20261010` / `/Users/samuel/Documents/econclub/.econmind-worktrees/b-opening-source-composition-20261010`。

## 唯一行为变更

原 producer 对 candidate body 使用 `sha256:` + SHA256(canonical JSON)。新增 V2 bridge 判断却调用旧共享 hash，对 JSON 加 `SHA-256\n` 域前缀，合法原候选必被拒绝。

只把新增 candidate 指纹判断提取成 `hasOriginalFinancialCandidateFingerprint` 并改用原 producer 协议。它是纯指纹兼容性谓词，不签发 proof、不采用来源、不构造 seed。生产调用仍在 genuine financial proof guard 之后；后续 proof/candidate/contract/World/seed/assembly/replay/source 等绑定条件全部保留。

共享 `hash`、全部 V1 指纹、Core、原 producer/parser、格式/brand、Owner loader、其他窗口文件均未修改。不是通过改原算法、删除 prefix 或放宽 proof 来过测试。代码 delta 恰三文件：bridge（+11/-2）、专用测试（131 行）、新增严格配置（9 行）。

## 实际窄验证与失败

固定 Node 24.20.0 / pnpm 12.3.4；清空环境后只提供 pinned PATH。没有数据库 URL、生产凭据或实际 adoption record。

| 检查                                                    | 实际结果                                                                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Red：保留原判断表达式的提取 helper + 新测试             | exit 1，3 FAIL / 2 PASS；真实 producer candidate 不被接受、旧域前缀被误接受、transport 正确候选被拒绝，均有保留输出 |
| Green：原 producer 协议                                 | exit 0，5/5 PASS                                                                                                    |
| 选定旧 producer / V1 bridge 指纹与重启回归              | exit 0，3 PASS；44 项被显式 `-t` 名称过滤未运行，不计 PASS，不删除/弱化旧测试                                       |
| 新严格配置                                              | exit 0，`skipLibCheck:false`，没有 stub                                                                             |
| Worker build、changed-file lint/format、diff whitespace | 全部 exit 0                                                                                                         |
| boundary、authoritative-pattern、secret、R2 governance  | 全部 exit 0                                                                                                         |

新测试实际调用原 loader/原 parser/原 producer，使用明确生成的 `MECHANISM_TEST_VECTOR`，不是手写 candidate-shaped 摘要代替。真实原输出直接进入 bridge 使用的同一个纯判断；正确指纹接受，错误/无 prefix/旧 domain-prefixed 指纹、改变 World/contract/batches 后的 stale 指纹拒绝。canonical transport/键序变化保持兼容。另测正确指纹也不能代替 genuine proof，bridge 仍在缺 proof 时拒绝。

原 result 仍为 `BLOCKED / seed:null / admissionAllowed:false / activationAllowed:false`；candidate 仍 `UNADOPTED_FINANCIAL_CALCULATION_NOT_IMPORTABLE`，保留两个 authority obligations 及 mechanism blocker。没有将机制数值或其正向指纹判断重标为正式 adoption。

实际命令、exit、三个源码 hash、十个日志 hash 见 `F_B_01_FIX_EVIDENCE.json`；去 ANSI 的 red/green 和其他输出见 `F_B_01_FIX_CHECKS.txt`。没有本轮额外检查失败；red 的三个预期失败不隐藏。

## 明确保留，不顺带修复或重测

- 原 132 focused / 90 architecture 及两项额外第三方声明 exit 2 是 `0943142…` 的历史证据，本轮全部不重跑、不抹去、不升级为本修复的新证据；原三报告字节未改。
- **Parent policy 读取限制仍在**：loader bounded 读取父文件后，原 `loadNonHostOwnerPolicy` 按路径再次 `readFile`；第二次读取未复用 bounded bytes，也没有独立执行该 reader 的 NOFOLLOW/byte-budget 约束。成功 brand 仍受固定父 hashes 约束；本 delta 不宣称 authority bypass，也不立新 P1。private server-owned immutable source directory 是必须明确并证明的部署条件，当前未由此修复证明。不顺带重构。
- formal genuine financial proof→seed 正向验证：`NOT_RUN`，缺真实独立采用输入/registration；本轮不伪造正式数据、proof、World 或阳性包来补空白。
- 原 private registry durable revocation/commit 缺口、六 Office 完整闭环和 420/browser 验收不由此修复关闭。
- full/native/external SQL、正式来源 provisioning、production、push、merge、部署及 status/gate 修改：全部 `NOT_RUN`。

`F_B_01 = FIX_CANDIDATE_PENDING_F_REVIEW`
`SOURCE_ADOPTION = NOT_PROVISIONED`
`FORMAL_WORLD_BINDING = UNRESOLVED`
`FORMAL_V2_SEED_POSITIVE = NOT_RUN`
`ALL_SIX_OFFICES_COMPLETE = NOT_ESTABLISHED`
`RUNTIME_AUTHORITY = NOT_GRANTED`
`PRODUCTION = HOLD`

冻结 delta，交 Root 派发 F 窄复审后停止。不自行关闭 finding、不整合其他窗口、不开始新批次。
