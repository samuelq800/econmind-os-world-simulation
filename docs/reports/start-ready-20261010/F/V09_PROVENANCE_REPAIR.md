# F — 两例 native claim recovery 构建来源修复收据

2026-10-10。`PREPARATION_ONLY_NOT_V09_2_STARTED`。实施者收据，P0 增量待 D / 非实施者窄审；不是 VERIFIED、Gate B、staging/TLS 或正式角色验收。

## 不可变来源与范围

- 原 repo baseline：`42991acfee9d0eacc702ba47a380c938a4516f03`。
- 本修复 exact base：`d9853754b3eb2080a5ac4d30c71cae4db013fe0c`；tree `fb2b1f8fc82a9228f40f38c6b13890ea0b44eea4`。原 `V09_EVIDENCE_RECEIPT.md` 与 KgSwqT 原运行保持原 bytes，不追溯改成已绑定构建来源。
- 本轮实际测试代码：`86af039a8340a0220752b3f5038f52012ad37273`；tree `1002c1c1b87becb6b98db8dd78746d9665526d4b`。随后只追加本收据；最终 candidate/tree/hash 由外层绑定。
- WT `/Users/samuel/Documents/econclub/.econmind-worktrees/f-v29-native-worker-sequence`；branch `codex/f-v09-evidence-receipt-20261010`。
- 增量仅 `tests/support/f-v09-dist-provenance.mjs`、既有 F native test 的测试前 guard，以及本报告。原两例全部断言保留；没有 Core/Worker/API、Industry、数据库迁移、账号、权限、status/progress、地图、旧站或其他窗口文件改动。

## 具体修复与构建绑定

新增 helper 只读：capture 检查实际源码 bytes 的 Git blob 与指定 immutable commit 一致；收集 Core/Worker 完整 dist 的常规文件 hash，拒绝 symlink；解析实际 `@econmind/core` export，必须为该 WT 的 `packages/core/dist/index.js`。它不编译、不执行 SQL、不访问网络、不产生 gate/READY。

native beforeAll 在任何连接/SQL 前必须验证 `F_NATIVE_BUILD_MANIFEST_SHA256` 与 owned root 的 `BUILD_PROVENANCE.json` bytes，并重新读取全部 source/dist 精确比较 manifest。缺少/改动的 manifest、实际 source/dist 或 runtime export 不能仅凭 HEAD 标签过关。capture 本身不声称证明重新构建；下述实际构建与运行另有执行记录。

原 ignored Core/Worker dist 先确认在 Git ignore 中，分别移动到新 owned root 的 `previous-core-dist` / `previous-worker-dist` 保留；实际确认两个输出目录不存在后才构建。没有删除旧生成产物或重用未绑定 dist。

- Node 实际 `v24.20.0`：`/Users/samuel/.npm/_npx/92e92e656f04b72c/node_modules/node/bin/node`。
- pnpm 实际 `12.3.4`：`/Users/samuel/.cache/node/corepack/v1/pnpm/12.3.4/bin/pnpm.mjs`；PATH 固定该 Node。
- 实际 `pnpm --filter @econmind/core build`、`pnpm --filter @econmind/world-worker build` 各 exit0；未安装依赖、未改 lockfile。
- 随后 `node tests/support/f-v09-dist-provenance.mjs --capture` exit0，输出保存为 `BUILD_PROVENANCE.json`：**153 source inputs、280 dist files**；包含实际直接导入的 Worker TS、helper/test/config、Core/Worker tsconfig、package exports 与 lockfile。
- manifest SHA256：`c9c4c953231fd2f34f9f3d43dff5284ae55c1b647fac65b84755015f3b3dcf8f`。
- 实际 Core runtime export `packages/core/dist/index.js`：2518 bytes，SHA256 `dd7e821b5a29b5a08f61afd4e66469ecc6ece7573eb1da0e889ff2af40fe111e`。barrel 及其依赖的完整生成文件集合均在 manifest，不只记录入口文件名。
- native test source SHA256：`bec7f77b6f8d2a2d7d364bd90ea7d0facd7362b1f41bee04fc6480838f140e5d`；Git blob `b7da7d97bece7c8920252e455adee8d6a57e02d2`。
- 独立 helper control 实际通过：完整 binding positive；把预期 manifest hash 改为全0后，精确拒绝 `BUILD_MANIFEST_HASH_MISMATCH`；此控制没有连接数据库。

## 唯一追加 native invocation 与真实 target

全新 `mktemp -d` owned root：`/Users/samuel/Documents/econclub/artifacts/f-v09-claim-recovery-20261010.91tvbm`。root/pgdata 均 uid501 /0700。未使用旧 KgSwqT generation。

- PostgreSQL 16.15 (`160015`)，新 system identifier **`7694999330990948403`**。
- `127.0.0.1:61227`，Unix socket 空；database `econmind_v09_f_claim_20261010`，postgres disposable test role，trust/无密码凭据。启动前该端口 lsof 返回1且空输出。
- `initdb --encoding=UTF8 --locale=C --auth-local=trust --auth-host=trust -U postgres` exit0。max_connections=8/shared_buffers=16MB/timezone=UTC；测试串行，pool max2、statement5s、lock1s。
- 初次 mutation 前独立 `BEGIN READ ONLY` 查询 actual system/database/host/port/version/encoding/directory/socket 与空 world schema/public relations；native guard 再核同一 identity。不是只信 DSN。
- 安装仅既有 0001–0012 exact DDL，原测试逐项检查 manifest SHA；不发布正式迁移、不写 schema_release 发布收据、不更改 SQL。

唯一追加命令（准确单行在 `NATIVE_EXECUTION.json`）：

```sh
env -i PATH=/usr/bin:/bin LC_ALL=C ECONMIND_ENV=local \
V09_TEST_DATABASE_FINGERPRINT=world-v2-v09-test-local \
V09_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:61227/econmind_v09_f_claim_20261010 \
F_NATIVE_CLAIM_RECOVERY=OWNED_FRESH_GENERATION \
F_NATIVE_SYSTEM_IDENTIFIER=7694999330990948403 \
F_NATIVE_DATA_DIRECTORY=/Users/samuel/Documents/econclub/artifacts/f-v09-claim-recovery-20261010.91tvbm/pgdata \
F_NATIVE_BUILD_MANIFEST_SHA256=c9c4c953231fd2f34f9f3d43dff5284ae55c1b647fac65b84755015f3b3dcf8f \
/Users/samuel/.npm/_npx/92e92e656f04b72c/node_modules/node/bin/node node_modules/vitest/vitest.mjs run \
tests/world-core/f-v09-native-claim-recovery.test.ts \
--maxWorkers=1 --testTimeout=10000 --hookTimeout=10000 \
--reporter=default --reporter=json \
--outputFile.json=/Users/samuel/Documents/econclub/artifacts/f-v09-claim-recovery-20261010.91tvbm/NATIVE_RESULTS.json
```

实际 **1 file、2 PASS /0 FAIL /0 SKIP、exit0**，805ms total /195ms tests。stdout 先记录 `F_NATIVE_BUILD_BINDING` 全部 pins，再记录 actual server identity，之后才安装 DDL。没有 retry 或第三次 native invocation；本次是总控明确追加授权后的第二个独立 generation，不能把此前“一次”的历史描述抹掉。

两例原机制结论不扩大：higher-fence ordinary reconnect/reclaim exactly once、旧 fence 精确拒绝、当前活跃 claim 拒绝回收；11类事实 footprint exact 相等。独立 post READ ONLY 查询同一 system identifier，两个 World head/version/eventSequence 均0；RECOVER 为 CLAIMED/newWorker/fence2/attempt2，ACTIVE 为 CLAIMED/oldWorker/fence1/attempt1；events/receipts/outbox/inventory/financial 全0。只是 synthetic claim + 空经济账，不是 populated settlement 或 OS crash 测试。

`pg_ctl -m fast -w stop` exit0。CLOSURE 实际 assert：postmaster.pid 不存在，61227 listener lsof exit1/空stdout/空stderr，root/pgdata0700同用户，旧 KgSwqT pid 也不存在；新旧 cluster、旧 dist backup 均保留，没有 drop/reset/delete。

## 定向检查、责任与停止点

- strict `tsc -p tests/support/tsconfig.f-v09-native-claim.json` exit0，skipLibCheck=false；config未改。
- 定向 ESLint：新增 helper 与 native test，exit0；三个增量文件 Prettier check exit0；普通、增量范围与 staged diff check 均实际 exit0。
- boundaries exit0（313 files /0 violations）、authoritative-patterns exit0（308/Core89 /0 violations）、repository secrets exit0（2360 files）、safe-environment exit0。环境未配置数据库、NOT_LINKED、mutation=false；此环境检查不冒充 native test 的身份或生产权限证明。
- 原 d985375 收据的早期 typecheck/boundary FAIL、原运行构建 hash 缺口、历史 staging TLS FAIL/正式权限 INSUFFICIENT 全保留。本次只补新运行的 exact source/build provenance，不追溯升级旧证据，不重跑历史 CI。
- 不运行全套/835/420/历史 native套件、staging/TLS、真实登录/角色、正式经济激活、Industry；本次2 PASS 不是 Gate B 或六角色完成。
- 固定增量交总控安排 D 窄审。尚未收到本增量 D 正式报告，不虚构其决定；若后续正式报告与实施者判断不同，以正式报告为准集中处理，不自行覆盖。未 merge、push、deploy、更新 gate，完成后 STOP。

## 新 raw package（与旧 package 分离）

以下文件位于新 owned root，JSON 结果来自实际 Vitest；执行与前后核验记录保存实际命令及工具输出，没有把模型重造结果当 producer 文件。

| 文件                       | SHA256                                                           |
| -------------------------- | ---------------------------------------------------------------- |
| BUILD_PROVENANCE.json      | c9c4c953231fd2f34f9f3d43dff5284ae55c1b647fac65b84755015f3b3dcf8f |
| NATIVE_RESULTS.json        | 511f802285cf2af00413be8b5aaa817f11d69fad3a407a91f837cc7447f12498 |
| NATIVE_EXECUTION.json      | ba6bb0f987a034e1461b0e30a31c58c9508913b4327dd572702a94a69aadbdf5 |
| PRE_MUTATION_READONLY.json | 43cb9a0c530658ef2994e1bb564273e35cb0ee1b58fa2ff6cc45cecf35712af9 |
| POST_FACTS_READONLY.json   | fb0af3a5cd2bdcf97e3781241311475b7dacd914a937bfcd2bcebe02772c6b4c |
| STOP.json                  | ce364b6d61bd6e6186be0f6e85f0a796ec80e01306be33bf0351895d670ed742 |
| CLOSURE.json               | 35c3b0c98b9d47d8dc43c6449b46cdf5aaa744f5de820632c5fdcfa15f726e29 |

POSTGRES.log 与 stopped pgdata 一并保留；本报告与最终 commit/tree/hash 外层绑定，不自引用。
