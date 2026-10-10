# A — PR132 loopback CI repair 独立窄审

日期：2026-10-10（Asia/Shanghai）。本轮只审新的固定修复，不重审旧版。

## 结论

**APPROVED_FOR_NORMAL_PR_CI_ONLY**：四文件实施delta未发现阻止正常PR CI的源码问题，可由Root按既有流程更新PR132并获取真实CI证据。

**MERGE = HOLD_FOR_EVIDENCE**；patch-risk recommendation/workflowLabel均为 `hold_for_evidence`。这不是合并、部署、激活、Gate或产品就绪批准。Linux新拓扑/native七例仍 `NOT_RUN_NEW_TOPOLOGY`；新candidate build/four strict未在本轮执行，旧checkout成功不可继承。

## 固定身份

- Repository：https://github.com/samuelq800/econmind-os-world-simulation
- WT：/Users/samuel/Documents/econclub/.econmind-worktrees/c-pr132-pg-loopback-fix-20261010
- Base：`261983dc053f2522b6627864dc7025cdca8a27dc`；tree `cabe6cbb861a2913ddee87a827ade78703bb0305`。
- Implementation：`7b848c9f23ef6e63e0c8223536e42233b006cb13`；tree `35be6935827637bee360a004182d79a3c98cbfe0`。
- Tip：`33c88d853a744df8a78f1292220d47095fe9f44e`；tree `c15584e51091ff70c8077b7eb67bb0f64f994a31`。
- Base→tip完整binary diff SHA256：`e463ba2df0993d0ece61c382c6bde14c77e51ced9292ff95c1158d5354d1bbf5`；与C的FROZEN_HANDOFF一致。
- 四文件代码delta SHA256：`51bbfc5b4031b8eea02f8a19211cf7c205fc5519f44dba30c6a0b1d0ca8a9b25`。
- 四个实施文件：`.github/workflows/start-ready-candidate.yml`、`tests/support/start-ready-candidate-ci.mjs`、`tests/support/start-ready-postgres.mjs`、`tests/support/start-ready-postgres.test.mjs`。第五个变更仅C的报告。
- C报告 SHA256：`3c6f59ba2b294f5cff1ef3fb7072e33f8858531f0be5ca8361298099df179c06`；VERIFICATION.json：`ba1eff98cce9456437b3519eaf9f2ac4a3979660bf50b26d3fd8a54ac3ef6f24`；FROZEN_HANDOFF.json：`d2ec7e8e667f8dbbeea8413dc5606313be9e660970fad3b5e8eed35f7f20aadf`。

## 逐项审查与反例

### 1. runner自有loopback，不放宽D断言

workflow:47、91–110去除Docker service，固定ubuntu-24.04；startOwned/plan用mkdtemp新generation，initdb指定postgres/UTF8/trust，pg_ctl显式本data、wait30秒、listen_addresses=127.0.0.1、port5432、禁用Unix socket，createdb显式同loopback/port/role/database。start成功才进入native；端口被占、initdb或启动失败不能回落到现有服务或另一DSN。

原D guard的canonical DSN/fingerprint/禁止runtime数据库和PG overrides仍在；beforeAll的实际server address=127.0.0.1、数据库前缀和无world_v2 schema断言未改。它执行冻结0001..0006原前缀和原七例。本轮未连接数据库；源码/命令参数不是实际server身份的证明。

### 2. PG16.15来源与fail-closed

verifyTools:104–136仅允许非root Ubuntu24.04。四个二进制从固定/usr/lib/postgresql/16/bin取用；要求root-owned、非group/other writable、每级parent为同类可信目录；工具版本必须为16.15，不接受PATH、不同major/patch或安装/全局服务fallback。所有子进程只收到固定PATH/LANG/LC_ALL，不继承PGHOST/PGSERVICE/credential overrides。

独立读取的[固定runner inventory](https://github.com/actions/runner-images/blob/8197087fc536320d1441203fdb5da9ae1b44b863/images/ubuntu/Ubuntu2404-Readme.md)列出image20261004.327.1及PG16.15；[同commit installer](https://github.com/actions/runner-images/blob/8197087fc536320d1441203fdb5da9ae1b44b863/images/ubuntu/scripts/build/install-postgresql.sh)使用PGDG package且停用全局service。这支持来源选择，不证明下一次hosted runner实际配置。OS label非immutable image，版本漂移会失败而非静默升级；marker记录实际ImageOS/ImageVersion和versions，缺省UNKNOWN不能被本报告升级为已验证来源。

### 3. 初始化/清理身份与失败传播

locations/directory:27–52验证RUNNER_TEMP/evidence绝对、canonical、当前UID、非group/other writable；不chmod共享temp。validateOwned:54–68绑定marker schema/UID/bin/version、直接子root前缀与data；root/data必须0700。startOwned:163–197在initdb之前以wx/0600保留marker，不复用、重试或覆盖generation。

stopOwned:138–161拒绝symlink/foreign marker/data，验证owned PID文件的数据目录与端口后只执行固定pg_ctl -D本data -m fast -w -t30 stop；无PID搜索、任意kill、drop、目录删除或共享cluster控制。无marker/PID时不发stop。initdb中途失败、createdb失败仍有可核验自有身份；stop异常向上抛出，shell pipefail使tee不掩盖失败。

[PG16 pg_ctl文档](https://www.postgresql.org/docs/16/app-pg-ctl.html)支持-D数据目录、-l日志和wait/fast-stop语义；真实生命周期仍需CI。always是尽力清理，不保证在硬取消/runner终止后执行完；未执行或失败的清理不能产出PASS。

### 4. receipt防SKIP假绿

candidate-ci:81原completeNativeResult完全未变：success=true、passed7、failed0、pending0、total7，非exit0即可PASS。native guard/执行异常、缺JSON、空/skip suite不能成功。finalize:343–365新增pg_start/pg_stop到原六项成功要求；所有八项必须精确success，原actual checkout SHA/tree与tracked diff检查继续生效。日志digest新增owned marker并包含startup/server/shutdown日志。

反例：native exit0但pending7、pg_stop skipped/cancelled/failure、startup失败均不能得到PASS_SUPPLEMENTAL_CI_ONLY_FULL_SEPARATE。pure测试覆盖这些outcome。receipt仍把full check/F native/production/gate分开，没有继承旧PASS。

## 原失败证据不可改写

Run38055193920的actual checkout fd454b14cd74692e046f5e049df9ec7be0db855c，tree与本base相同。独立核对全部12个原artifact文件digest；native-d.log明确beforeAll预期127.0.0.1却取得172.18.0.2。原JSON success=false，passed0/failed0/pending7/total7；最终receipt仍FAIL_OR_NOT_RUN。这里failed0不是成功，七例是SKIP而非执行PASS。没有dispatch/rerun该run，也未修改其证据。

## 本轮实际检查

| 检查                                                     | 实际结果                     | 边界                                                                                                           |
| -------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 20 pure：原11+新9                                        | exit0；20 PASS/0 FAIL/0 SKIP | 五个exact-tip文件复制到managed临时目录；env -i无凭证，macOS sandbox deny network，写入限临时目录；无数据库     |
| Node24.20.0 --check三文件                                | 全部exit0                    | 仅语法                                                                                                         |
| Ruby YAML + bash -n十个run scripts                       | exit0                        | 仅YAML/shell语法，不代替Actions runtime                                                                        |
| git diff --check base..tip                               | exit0                        | 固定range，不只是dirty diff                                                                                    |
| 原guard/native D测试/原11-test文件对base                 | git diff --exit-code exit0   | 字节不变，不是native重执行                                                                                     |
| SHA/tree/四实施文件hash/C报告/manifest/原12artifact hash | 一致                         | 结束时HEAD仍固定tip，工作树干净                                                                                |
| 新Linux cluster/native7/build/four strict                | NOT_RUN                      | 不借旧checkout结果                                                                                             |
| full/420、旧build、F native、production                  | NOT_RUN                      | 本轮范围外                                                                                                     |
| assessment JSON schema/invariant validator               | 最终exit0                    | 初次把历史失败列成candidate失败check被validator拒绝；改为“历史artifact完整性验证”并保留旧FAIL/SKIP，不改变结论 |

原producer的ESLint/Prettier/actionlint结果只读核验其manifest，不冒充本轮重跑。不存在本轮产品改动/新migration/SQL/权限/secret/prod操作；A设计未修改。

## 风险与恢复

Impact moderate：错误会破坏supplemental evidence或自有临时cluster生命周期，不涉及产品状态。Likelihood moderate、protection partial：纯控制有效，但Linux集成未执行。Recoverability easy：仅workflow/helpers可独立revert，无产品schema/state兼容迁移。Merge confidence low（关键CI未到）；源码级进入正常CI结论明确。架构/平台特定验证未完成，不能auto-merge。保持旧版的风险是已知Docker接口失败继续阻断真实native证据，而不是已证明产品运行错误。

## Root下一步与停止线

1. Root可按既有权限正常更新PR132，等待普通PR CI；本审查不发push/dispatch/merge指令。
2. 新artifact必须绑定实际checkout SHA/tree、ImageOS/ImageVersion、受信16.15 tool versions、owned marker及start/server/stop原日志；证明真实loopback和fresh schema。
3. build、四strict、原guard、七例实际PASS/零pending/零failed、八step outcomes及owned cleanup全部成功，final receipt同source；任何skip/失败/cleanup失败/identity错配不得合并。full workflow、其他package/gate和产品授权仍独立。

报告和validated完整assessment JSON固定存于managed artifact，未写入C checkout或A设计。到此STOP，不等待、不自行更新PR。

Assessment JSON SHA256：`ce1b64bcd764100bfcc798bc18cb9e8b03405757f8e63915121e52130eb7647b`。
