# C 独立窄审 — B supplemental candidate CI

2026-10-10，Asia/Shanghai。结论：**APPROVED — 固定五文件源码/CI preparation only**。
Open blockers: 0；open majors: 0。P0 证据边界保持，不自授 VERIFIED。
补丁风险建议：`merge / human_review_required`，仅 advisory，不授权自动或实际 merge。

## 精确对象

- Repo：`samuelq800/econmind-os-world-simulation`。
- WT：`/Users/samuel/Documents/econclub/.econmind-worktrees/b-start-ready-candidate-ci-20261010`。
- Base：`42991acfee9d0eacc702ba47a380c938a4516f03`。
- Head：`d4fce6646ddcf2387ae0f7e37e18a8032d7d90b7`；tree：`4caf1125d4ad1a5650ad2af1d083a231c1fdde89`。
- Exact diff：`git -c color.ui=false diff --binary --full-index --no-ext-diff --no-textconv --no-renames BASE HEAD`，56846 bytes；SHA256 `09a6330d24c110f085a439d5b45a69bdd33e9d24d607e1428dc7bf63d8286412`。
- 产品/运行时实现零改动。三个 CI/test 文件在 code commit `a7f938d5c97d095571072bb014f8d8ad9c179d73` 后字节未变；最终 commit 只增加下面两份报告。以 exact Git 取得完整清单，五项均为新增：

| 文件                                                               | SHA256                                                             |
| ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `.github/workflows/start-ready-candidate.yml`                      | `c2e55f068956f526fcc62cdfa8976c3f2db67f148a0d69cd40ec9d8e54511748` |
| `docs/reports/start-ready-20261010/B/UNIFIED_CI_EVIDENCE.json`     | `be61ed3ea21f5536b3781b13dd3f6089cfb0a0b20f554fbbbec549b2e4a812c9` |
| `docs/reports/start-ready-20261010/B/UNIFIED_CI_IMPLEMENTATION.md` | `be36217642b349bf101c2afe880b127d0c8986cb665eff903de99ad3f53495a2` |
| `tests/support/start-ready-candidate-ci.mjs`                       | `217bc8198572e4ba7bd78a16ca977a6ef84fce19ca339b3432dfc5766afb2238` |
| `tests/support/start-ready-candidate-ci.test.mjs`                  | `9cf9686ab70149d3790d46f8c0369f5d8f66f7135a82039093740f64e5ab04d9` |

已有 guard、whole check/workflow、Core/Worker/API/浏览器产品代码、package/lock、schema/migration manifest/artifacts、status/gate 均未修改；没有范围外变化。

## 语义、调用与边界

入口 `.github/workflows/start-ready-candidate.yml` → CI helper 的 initialize/build/types/native-d/finalize；纯 node:test 不执行 compiler/full/native。
新增 job 仅 Node24.20.0/pnpm12.3.4、一次 frozen install、Core/Worker 两个必要 build、四个附加 strict configs、D 七例 native、原始日志与实际 checkout receipt。
原 `.github/workflows/cloudflare-runtime-environment.yml` 仍单独拥有 unmodified complete `pnpm check`、authenticated native 和 workerd/native；本补丁没有第二个 full 入口或 full 开关。

| 边界/反例                                      | 基线/调用方控制及窄审结果                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 重复 full 或权限扩张                           | 仅 filtered pull_request 和无输入 workflow_dispatch；唯一权限 contents:read，checkout persist-credentials:false；无 push/pull_request_target、secrets表达式、environment、deploy/publish、生产连接或写权限。静态 YAML 和纯契约通过。                                                                                      |
| B 缺少 C/D/F 时静默跳过 strict                 | initialize 先写实际 HEAD/tree，然后要求全部19输入和固定 base 祖先/洁净 tracked source。实际负向 CLI exit1，列出19缺项；finalize exit1/FAIL_OR_NOT_RUN，不把缺项当可选。                                                                                                                                                   |
| 放松 strict 或某项失败后掩盖                   | 四个配置逐项 `--noEmit --strict --skipLibCheck false`；所有四项均会尝试，失败逐项保留。build必须成功；结束判定不接受FAIL、RUNNING、NOT_RUN或workflow skipped。配置全集与委派要求相同，不由测试自行缩小。                                                                                                                  |
| D误连生产或用exit0/skip当native PASS           | native step唯一DSN是fresh postgres:16-alpine service的 `postgresql://postgres@127.0.0.1:5432/econmind_v09_d_supervisor_ci`、ECONMIND_ENV=ci及固定test fingerprint。原有guard CLI先检查，测试first Pool前再次检查；实际target/schema断言后只执行已存量0001..0006 prefix。JSON必须success且7 PASS/0 FAIL/0 pending/total7。 |
| 元数据head、旧full失败或F local2冒充新组合PASS | sourceIdentity使用真实git HEAD/HEADtree，不取github metadata。开始/阶段/结束检查身份和tracked变化，独占raw logs保留exit/signal，finalize记录step outcomes/log SHA。F native恒NOT_RUN；旧run38048771913格式失败/native skipped单独HISTORICAL_REFERENCE_ONLY，不继承PASS。                                                  |
| build/命令失败却得到PASS或自动重试             | child使用独立argv/shell:false；nonzero、ENOENT、signal都不能PASS；日志wx先占位，已存在日志拒绝执行，不自动retry；always finalization/upload保留普通失败。checkout之前失败可能没有receipt，此时job/上传失败，不能虚构PASS。                                                                                                |

### 已批准产品引用：不混合 B tree

B 的 base-only 隔离是有意的，不要求把 C/D/F 源码混入 B 本地候选。
只读核对 PR131 产品组合 **`ed0e4df4571e30fdb8b2f3e95b43f4680c19acb8` / tree `69c04e4ca079e082e5f1bf85ce5d937ac6085b4d`**，其19 required input路径全部存在。
以下内容仅作为固定引用适用性检查；没有在该组合上运行compiler/runtime，也没有继承其整个tree的测试PASS：

- `scripts/v09-postgres-test-environment.mjs`：blob `484effcb88ef83582ea52eab9fa6224c98762626`；SHA256 `9b4a7f84ab5b9bf85287d398e89de455a63ea4c472f8d8d33ca81e049cf14a0e`。
- `tests/world-core/writer-lease-supervisor-postgres.test.ts`：blob `6b9c2959e5b94b74a6622b9dcfbcb0bf59b844a8`；SHA256 `b4c96c0c55bdebc0caf1749a6c921c60ea5a98c25f0c0358fffa879e8befc7f1`。
- `tests/support/renewal-frozen-migration-fixture.ts`：blob `06ed277a888639a48d923f54d71eec7d2c7684c5`；SHA256 `98be6c7203f5e6c46733bdfe205f9c7d336a248395b719bd71c65e9a2b6ee9fc`。
- `docs/reports/start-ready-20261010/reviews/D_F_review.md`：blob `1e8316d6d362698f7be6746172fc35f225a8772f`；SHA256 `2ff88ab43b861eb9f9963c039985962c8830874d247ea6bc1ce98ab97efe1c2e`。
- `tests/support/tsconfig.formal-financial-opening.json`：blob `844e20436a7357554b32875b230c6cf26852ab93`；SHA256 `8e6ec971f566e4aa0dd03e9f592d0dd7321362c9a8a1dd26ed73515558ec232f`。
- `tests/world-web/office-command.tsconfig.json`：blob `e7ff9734eebb3e60c44cbe4c78f9be5b6a061def`；SHA256 `0ac9742e35b20deee17e802e829f5743a1d50c0c0c92ae2b2e7708e3b0efdc23`。
- `tests/world-core/writer-lease-supervisor.tsconfig.json`：blob `b39abcbafe81bcdabe45a0fb330c04cee2fda67e`；SHA256 `4e683abe855acc3eb6f854a88dcd5a71a148bc3b921f66857a397be31dd8b544`。
- `tests/support/tsconfig.f-v09-native-claim.json`：blob `5dc9bd1d8e59d10e9f38f4dda06aaa9eb2d4c0d5`；SHA256 `15d373572bc015545bf6b30606563782fa0a76f460ac85001821a8e03404f4ed`。

读过 D native 完整七例、原 V09 guard、frozen migration fixture与四配置。guard拒绝runtime DSN、PG覆盖变量、非canonical/非loopback/带password等目标；测试先验证实际loopback/database和无world_v2，再安装prefix。fixture先验证完整当前manifest/Git provenance（含未执行suffix），没有把prefix执行冒称整链rehearsal。

F的D独审回执SHA独立重算为 `2ff88ab43b861eb9f9963c039985962c8830874d247ea6bc1ce98ab97efe1c2e`，与helper引用一致。其原本机 generation/PG16.15 与Core dist pre-run provenance限制仍保留。本CI不启用该native2、不升级为新CI PASS，也不批准之后的F provenance补丁。Root所报四strict exit0仅归属固定ed0产品组合，本次不重跑、不据此宣称B整tree runtime通过。

## 本轮实际独立检查

在 exact-head shared-object sparse disposable clone 运行，原WT不运行候选代码；env-i无凭据，macOS sandbox拒绝所有network及临时目录外持久写入（只额外允许/dev/null）；临时目录外node_modules只读复用，未安装依赖或build。

1. Exact HEAD/tree/5新增/Git diff --check：exit0；候选始终CLEAN、HEAD/tree不变。
2. `node --test tests/support/start-ready-candidate-ci.test.mjs`：**10 PASS / 0 FAIL / 0 SKIP**，exit0。
3. 两support文件真实ESLint：exit0；全部五文件Prettier --check：exit0；两文件node --check：各exit0。
4. Ruby YAML parse：exact triggers、readonly permissions、one job、无environment；实际7个run block逐一bash -n：exit0。未将此称作actionlint/provider验证。
5. 实际initialize负向CLI：预期exit1、19缺项；实际finalize：预期exit1。独立assertions exit0：固定d4fce664/4caf1125、inputs FAIL、FAIL_OR_NOT_RUN、两build/四strict/D/F native仍NOT_RUN。
6. Schema validator `launch_codex_security_mcp --helper validate-patch-risk-assessment`：exit0。

两次reviewer harness初始错误均保留在validation：第一版sandbox阻止git打开/dev/null；随后只修正sandbox null-device权限，候选不变，10项通过。第一次negative CLI的env assignment位置错误导致sandbox execvp失败；修正review命令后运行上述真实negative测试。它们不是候选逻辑缺陷，也未删掉失败记录。

- [原始检查输出/身份](/Users/samuel/.codex/state/plugins/codex-security/scans/b-start-ready-candidate-ci-20261010/artifacts-fd770339a611b6f24a4deb6a0003aca11a746fcc8c00f567d6e9ce876a49cdff/artifacts/C_B_SUPPLEMENTAL_CI_VALIDATION_20261010.json)，SHA256 `2076578eecc9f10e20e9ad3ab30112c5510f7c42aa6dfdb4f3ff2df7171629bf`。
- [实际negative receipt](/Users/samuel/.codex/state/plugins/codex-security/scans/b-start-ready-candidate-ci-20261010/artifacts-fd770339a611b6f24a4deb6a0003aca11a746fcc8c00f567d6e9ce876a49cdff/artifacts/C_B_NEGATIVE_NOT_RUN_RECEIPT_20261010.json)，SHA256 `2a3a20b1d27d6a14c3e6ffbc047507751f4c0ade63bdb0e96a346b2495d39747`。
- [已校验风险JSON](/Users/samuel/.codex/state/plugins/codex-security/scans/b-start-ready-candidate-ci-20261010/artifacts-fd770339a611b6f24a4deb6a0003aca11a746fcc8c00f567d6e9ce876a49cdff/artifacts/C_B_SUPPLEMENTAL_CI_ASSESSMENT_20261010.json)，SHA256 `106dd140cb2bb6818210e81094202a8821cc62f44845166a3ae17608f2d90b75`。

## 风险与必要限制

Impact high：P0 CI证据若误标可能误导后续接受；likelihood moderate；protection partial；recoverability easy（孤立五新增可回退，无生产state/schema迁移）；confidence moderate。自动合并不适用，仍须正常owner/组合流程。

**本次APPROVED只允许将该固定补丁作为正常组合审查的已审源码输入，不代表实际组合CI成功。**
四compiler、D native、F native、full/native/420、provider dispatch在本轮均NOT_RUN。
actionlint未安装，NOT_RUN；真实Actions平台/服务启动/包安装/timeout等仍待获授权后的组合执行验证。
旧full的FAIL/native SKIPPED只按producer历史观察保留，本轮未重新获取其job logs，也未把后续新run结果混入该旧run。
CI组合待PR131收口；实际CI必须再绑定自己的真实checkout SHA/tree和log hashes。F native继续单独NOT_RUN，不可用D七例补齐F两例，更不构成Gate B、运行/经济启动或六职位业务闭环。

无被审对象修复、无新产品代码、无commit/push/merge/deploy、无数据库/service启动或生产访问、无status/gate提升。STOP。
