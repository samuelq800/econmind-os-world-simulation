# F — B F-B-01 最小修复 delta 独审

结论：**F-B-01 = CLOSED（仅下列固定修复候选）**。**APPROVED_WITH_EXACT_BOUNDARIES / SOURCE_ONLY_INTEGRATION**。原B实现与本修复可按固定来源交Root做source-only整合；本审不执行整合、push、merge、部署、准入或启动。JSON建议 merge / human_review_required 为审查建议，不授予发布权限。

原审查CHANGES_REQUIRED及其记录保持原字节。此delta只关闭原finding，不将原结论倒写为“当时已通过”，不扩展到正式source adoption、genuine proof→seed、六角色完整构造或生产World。

## 1. 精确身份

- Repository: https://github.com/samuelq800/econmind-os-world-simulation.git
- WT: /Users/samuel/Documents/econclub/.econmind-worktrees/b-opening-source-composition-20261010
- Original product: ae4424f681414a00a6bd3fd6268ed733632690bb
- Fix baseline/original evidence: 0943142b798df8bca401f5f0987c31a7db9434ac
- Baseline tree: 3a7566d164e444656e9a6d3f275867e1af0815cd
- Fix product: 2d986f3794ce81e5eb7d0fba3e2056fdd3b5daa8
- Fix tree: a9d89c1a8675bdbfa55050e94cd6279afc5c6f4e
- Fix evidence tip: 517deccbe3b27ba0d9eb05e34392939ddad1c504
- Evidence tree: 470cfdc9ded9c8a751639c142dbddfcb8cc5ea73
- Fix父提交恰为0943142；evidence父提交恰为fix。
- Exact full-index binary no-ext-diff patch SHA256: 7e02544e0b1d4dcf007ac7f8d71addd219bc2e90edbe67fa225c5cabc5925432。
- Delta恰3文件、+151/-2：bridge +11/-2、131行新测试、9行新strict config。证据提交恰新增3报告。
- 最终WT CLEAN；源码未被本review修改；git diff --check exit0。

三源码固定SHA256：

| 文件                                                               | SHA256                                                           |
| ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| apps/world-worker/src/preparation/opening-canonical-seed-bridge.ts | d9291655eae77e119082ab6e4afb5d6cb2ffd9c26713494852547a406bbe6647 |
| tests/world-core/financial-candidate-bridge-fingerprint.test.ts    | d3d9ae6313343a6ffdaa352ef8d020b2ccb80e72340684f74e821915e55200a7 |
| tests/support/tsconfig.financial-candidate-bridge-fingerprint.json | e17cdba5da9d86e5e25ce49d8373e45a3c8e624be76eaf847fa23c836710f403 |

证据三文件：

- F_B_01_FIX_DELTA.md SHA256 6bfe974a4aeb91b90ba4530075d91ef3f5d1f8d62c1a46743758f442b177f161
- F_B_01_FIX_EVIDENCE.json SHA256 7236427d0ef75180346b3061be5ef173c6d3101106e46c41b76f2aa6ada7de78
- F_B_01_FIX_CHECKS.txt SHA256 731334064f2d42c29fc549c604cf22a192a28000dd165941441536e88b6b806a

完整pins与十份原始日志hash/原文见PIN_RECEIPT.json；fixed patch另存subject.patch。

## 2. Finding closure 的依据

原缺陷：V2新判断调用共享hash，要求SHA256("SHA-256\\n"+canonical JSON)，但原producer发出SHA256(canonical JSON)；正常候选被拒绝。

修复仅新增纯谓词 hasOriginalFinancialCandidateFingerprint，取掉candidate自身fingerprint后，以 `'sha256:' + sha(canonicalSerialize(candidateBody))` 比较原指纹。生产bridge确实调用该谓词，不是只为测试新增未使用helper。

最重要的保留项：

- shared hash仍是canonicalHashInput域前缀协议，完全不动。
- 原producer/parser、Core/V1指纹算法完全不动。
- genuine isFinancialSupplementAdoption guard仍先执行，然后才进入指纹校验。
- proof.candidate/contract/World/seed/assembly intent/parent/manifest/orchestrator/replay/source与后续库存/财务/Core checks全保留。
- pure predicate返回true不是proof、adoption、seed或grant；未新增package公开issuer或runtime入口。

独立inverse-delta控制：把新helper删去、将两处新判断/解构还原，所得bridge全文与0943142基线逐字节相等。受保护的Core、producer/parser、Owner proof loader、bundle loader、composition、publisher无diff。原三报告与原九源码除bridge外都未被此次delta改变。该控制不依赖“文件看起来差不多”。

因此F-B-01原协议不兼容原因已消除；没有用修改原算法或弱化授权边界掩盖问题。

## 3. 窄验证及实际含义

B提供方检查（F读取源码与原始日志并逐项hash核实，不冒充F重新执行）：

| 证据                                                    | 结果与实际覆盖                                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 新focused                                               | 5/5 PASS；实际原Owner loader→原parser→原producer生成机制candidate，进入生产bridge使用的同一纯谓词 |
| 选定旧回归                                              | 3 PASS；原producer指纹/transport/restart及V1 bridge restart determinism                           |
| 未选定旧测试                                            | 44项经明确-t过滤未运行，不计PASS，没有删改/弱化                                                   |
| strict新配置                                            | exit0，skipLibCheck:false、DOM+ES2024，无stub                                                     |
| Worker build/lint/format                                | 提供方exit0，十日志包含相关原始字节                                                               |
| boundary/authoritative patterns/secrets/governance/diff | 提供方exit0；F另跑固定diff --check exit0                                                          |
| red历史                                                 | 原判断提取阶段exit1：3 FAIL/2 PASS；报告完整保留                                                  |

新测试不是手工candidate摘要：beforeAll确实调用原loader/parser/producer，断言MECHANISM_TEST_VECTOR；真实原candidate正向指纹接受、错误旧域前缀/无prefix/零digest拒绝，修改World/contract/batches的stale fingerprint拒绝，transport/键序兼容。正确fingerprint配空proof仍在genuine guard拒绝。

红测来自未冻结的“先提取原判断”工作阶段；其完整tool capture已进hash绑定CHECKS，但没有独立原raw-log SHA或该中间阶段immutable commit，故只记提供方红测capture，不冒称F运行了固定旧candidate的5项红测。原F已确认的不兼容源码与离线复现历史仍存在，不需重测132/90。

F本轮独立实际执行：

1. exact commit/tree/parents、3源码、3证据、10原日志hash与旧三报告未变核对，exit0。
2. inverse-delta bridge全字节等价与受保护路径无变更，exit0。
3. 有界、禁网络、env-i隔离source-extracted纯谓词控制：七项全PASS。原plain指纹接受；旧prefixed/无prefix/零digest/stale World拒绝；canonical transport/键序接受。
4. 控制同时保留旧协议不兼容输出用于对照；旧结果false是预期历史重现，不是新candidate失败。
5. F控制只使用普通candidate-shaped机制数据及实际表达式，不执行原producer、不签发proof、不做SQL。实际原producer五项来自上述B固定证据，不偷换两种验证范围。

没有重复原132/90或无关全套测试，没有native/external DB、420、CI或生产操作。

## 4. 授权与状态没有升级

原raw result在新测试中仍为BLOCKED / seed:null / admissionAllowed:false / activationAllowed:false。candidate仍为UNADOPTED_FINANCIAL_CALCULATION_NOT_IMPORTABLE；mechanism-only blocker和原两个authority obligations都保留。pure predicate的正向不代表正式来源已被采用。

只有原finding状态可在本固定候选上关闭：

- F_B_01: CLOSED_ON_2d986f3794ce81e5eb7d0fba3e2056fdd3b5daa8
- SOURCE_ONLY_INTEGRATION_REVIEW: APPROVED_WITH_EXACT_BOUNDARIES
- SOURCE_ADOPTION: NOT_PROVISIONED
- FORMAL_WORLD_BINDING: UNRESOLVED
- FORMAL_GENUINE_PROOF_TO_SEED_POSITIVE: NOT_RUN
- RUNTIME_AUTHORITY: NOT_GRANTED
- ALL_SIX_OFFICES_COMPLETE: NOT_ESTABLISHED
- PRODUCTION / ADMISSION / ACTIVATION: HOLD

全部六Office要求继续保留：CAPTAIN、CENTRAL_BANK、FINANCE、INDUSTRY、SOCIAL、TRADE；不能以本修复或五项金融测试外推完整角色、70国×六角色或420/browser通过。Industry executable-family缺口仍是单独产品工程，不重标Finance/Trade替代。

## 5. 必须随整合保留的限制

**Parent二次readFile限制未修**：bounded loader先读父文件后，原policy loader按路径再次readFile；第二次不复用已验证bytes，没有独立NOFOLLOW/byte-budget。成功brand仍受固定parent hashes约束。本delta没有发现/证明authority bypass，也没有把它升级成新P1。private server-owned immutable source directory是正式部署必要条件，尚未在此证明；不可称完整有界读取已在所有阶段闭合。

**历史声明检查失败未抹去**：0943142原两项额外skipLibCheck:false exit2仍是tinybench DOMHighResTimeStamp、PGlite Emscripten/FS ambient问题；本轮不重跑、不转换为PASS。新strict通过不等于全第三方声明都通过。原132/90只作历史范围，不继承为修复新测试数量。

**其它真实门槛仍在**：独立registration/真实正式proof→seed positive、durable private registry revoke↔commit耦合、实际角色/权限/World绑定、平台/部署、所有Office完整业务均未由fix关闭。没有合成正式阳性包、移除veto、改schema/grants/production data或source authority。

## 6. 整合判断、风险与停止点

原ae4424f产品+原0943142证据+本2d986f fix+517decc证据，在上述source-only/non-activated范围内可由Root整合；必须保留原审与本closure作为前后链，不单取helper称整个产品已完成。整合后组合源码/必要CI由整合owner按原治理处理，F不自行push/merge或启动后续批次。

风险impact high（共享开局/持久化契约）、likelihood low（窄修复、字节等价、直接回归）、protection partial（formal positive/platform未验）、recoverability easy、confidence high；auto_merge不适用，仍human_review_required。接纳此修复不等于授予status VERIFIED或正式生产准入。

全部本轮NOT_RUN：原132/90/full/native/external PG/旧第三方声明强制检查/420/正式proof→seed/真实registration/CI/生产DB/push/merge/deploy/status/gate mutation。

报告与schema-validated assessment已冻结在独立托管目录；未改任何其他窗口文件、地图或原站。审查完成后停止，不等待其它窗口。
