# F 0023 源端 caller / selector policy

状态：`IMPLEMENTED_UNVERIFIED`，P0，等待固定候选独立审查。
正式 caller：`NOT_REGISTERED / CALLER_NOT_READY`。不是发布、启用或 Gate B 通过。

## 不可变身份与责任边界

World 基线：`bcfc66787631a13aa5093df42954070c2d7dd66b`，tree
`ff81dd455f32719e6383c96d5430e9c38fe9fa92`。
本轮实现提交：`c996b913fed2e2e4565957cd13418097d984ae63`，tree
`176b948840999e088710311049e13f424dc67fc7`。后续仅附加本报告和证据。
分支：`codex/f-0023-release-caller-policy`，专属 worktree：
`/Users/samuel/Documents/econclub/.econmind-worktrees/f-0023-release-caller-policy`。

制品只从固定 PR114 `7461a053a74131fcc8273a8ac981e28b510ca03c` 的 Git
对象读取，migration subtree `97cd00dea1a9e9ff600278fb2c41fa67a037c667`。
0023 artifact source：`4714c1da7af9324741996b94c6da036bf54c39a4`，SHA256
`0e1ec372429164acb94f9b9588beac75fbf984f5a41413af13715e28a4e94a36`。
23 项 manifest 的全部制品与各自 source object hash 逐项核对；不借 moving
HEAD、工作树字节或 Git replacement objects。

F 仅新增 policy、定向测试、strict JS typecheck 配置、F plan/report/evidence。
现有 A migration-policy、rehearsal、manifest、0023 SQL、历史 20/21 staging
allowlist、C/G/D/E、apps/packages、workflow、status/progress 均未修改。
没有重做原 0023 经济 SQL 审计。

## 已实现的接口

`scripts/production-posting-release-policy.mjs`：

- `prepareProductionPostingRelease`：只允许 exact 0023、`world_v2`、publish
  或 readback；拒绝未知 0024、任意 SQL、moving source 与额外参数。返回冻结的
  单请求 `{query}`，不发送请求、不构造连接、不读取密钥。
- `productionPostingPolicyFingerprint`：绑定固定身份及本模块确切字节。
  publish/readback 使用不同锁前缀和不同 confirmation；锁只检查接口条件，
  不是独立审批、正式 registration 或 target authorization 证明。
- publish request：单 BEGIN/COMMIT；锁住实际 schema_release，验证完整真实
  22 行前缀，执行 exact 0023 bytes、追加 original-order23 provenance，再验证
  完整 23 行。不是通用 SQL 入口，不执行 0022 或重复执行其他历史制品。
- `verifyProductionPostingReadback`：用本模块私有 plan identity 校验真实数据库
  返回的逐行 ID/hash/source/original order。输出 `BASELINE_METADATA_MATCH`、
  `APPLIED_METADATA_MATCH` 或 `CONFLICT`；缺项、额外项、乱序、错身份拒绝或冲突。
  绝不以 manifest 字面值代替 observed ledger。匹配只是 release metadata 证明，
  不是完整 schema/catalog 证明、World admission 或任何经济就绪证明。
- 0023 非幂等 DDL 不自动重放；重复 publish 在 DDL 前拒绝。单独 readback 使用
  READ ONLY，可重复检查已经记录的同一结果。
- `productionPostingUnknownOutcome`：acknowledgement / transport / proof
  不完整均 `UNKNOWN_STOP_NO_RETRY`，不得自动重发。所有结果固定
  `economicActivation:false`、`schemaAdmitted:false`、caller 未注册。

## 现有唯一发布机制及准确缺项

只读核对旧站不可变 publisher
`fda91732ccc12dc6004c1e281f2e850d2414274d` 的
`.github/workflows/release-world-v2-schema.yml` 与 render/verify 接口。
已记录其实际历史 run36310359277：一份原子 Management API request，固定
World source、明确确认、固定 target、supabase-production concurrency，真实
readback、未知结果停止。未访问 API，也未读取凭据。

还只读核对旧站本地 `origin/main` 引用
`4325139dbb432d51fe0f3d02cf233aa47e2f073f` 的 additive0021/0022 发布接口：
固定目标、分别锁定 phase、bounded once-only request、readback、UNKNOWN stop。
这是旧站的本地 historical/provider 未刷新的引用，**不是当前 World main**，
不宣称已核实旧站在线最新 tip。旧站没有任何本轮写入。

确切剩余事项只有 owner-side registration / authority：唯一 main-site publisher
的 owner 必须在固定独审后，把这个 exact module/fingerprint 接到已有发布
workflow；固定 publisher commit、World policy commit、target、phase locks、
确认、concurrency、真实 response verifier 与 UNKNOWN 停止逻辑，并完成所需
staging/release 审查。现有 publisher 不会因 World 新增可导入模块而自动注册
0023。目标/锁由现有安全机制持有，不需要 F 发明新主机、拓扑或新凭据。
后续 owner 注册补丁仍需单独审查；本轮不能修改旧站或冒充已注册正式 caller。

## 实际验证

Node `24.20.0`；复用现有 frozen-lockfile 对应 PGlite0.5.8/TS6.0.3/
ESLint10.10.0/Prettier3.9.6，未 install、未运行 pnpm、未升级依赖。
最终测试使用 `env -i`，仅 pinned PATH；OS sandbox `(deny network*)`。
没有数据库 URL、Supabase credential 或 inherited shell secrets。

- `node --test tests/foundation/production-posting-release-policy.test.mjs`：
  **23PASS/0FAIL/0SKIP，exit0，3985.85475ms**，包含 Node 父测试计数。
  实际执行一次 ephemeral PGlite 真实历史22 fixture、完整 atomic0023 request。
  实测 hash/source ledger 冲突在 DDL 前拒绝；DDL 后 ledger INSERT 故障使
  SQL/行全部回滚；一次追加、重复 publish 拒绝、重复 READ ONLY 回读及 unknown0024
  冲突；public 非个人 sentinel 与原两条 Storage policy 保留。
  TEST_ONLY historical setup 的 local roles/storage 不是生产 grant/publication。
- lost-response 项仅为 `UNKNOWN` classifier + 已真实提交状态的独立 SQL 回读
  控制；没有真实网络断链/commit acknowledgement 故障注入，不能升级为该证明。
- `node node_modules/typescript/bin/tsc -p
tests/support/tsconfig.f-production-posting-release.json --pretty false`：exit0，
  strict checkJs 检查实际实现，不是只检查声明。
- scoped ESLint、Prettier `--check`、`node --check`：均 exit0。
- staged `git diff --check`：exit0；受保护原文件 delta 为空。

历史失败保留：首次 strict JS 检查出现 TS18046 unknown response narrowing，
已给实际抛错 helper 标注 never 后修复；不是首次通过。首次测试
**21PASS/2FAIL/0SKIP，exit1，4034.60425ms**，实际只有一个子断言错误并使父测试
失败：删除23行后是合法22基线，却期望 CONFLICT。改为删除历史基线行，保留
合法 baseline 分类、publish 必须23行的规则及所有真正经济/事务断言。
没有放宽实现来满足该错误测试。

## 明确未运行

native PostgreSQL、真实并发发布/DDL锁超时、真实网络/ack loss、完整 schema
catalog readback、production SQL/seed/grants/ManagementAPI、正式 caller registration、
部署、原0023 SQL22矩阵、115/420/full suites、provider CI、World/Clock/SchemaAdmitted
和 Gate B：`NOT_RUN` 或 `NOT_REGISTERED`，不借历史 PASS。

源端政策可独立交审；没有 self-approval、merge 或发布。本轮交付后 F 停止。
