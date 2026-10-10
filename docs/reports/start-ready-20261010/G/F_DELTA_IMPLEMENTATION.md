# G F 独审修复 delta 固定交接

2026-10-10，Asia/Shanghai。**IMPLEMENTED_UNVERIFIED / P0 / independent delta review PENDING**。F 的原 CHANGES_REQUIRED 未由实施者关闭，本包交 Root 转 F 独立复审。

## 不可变对象

- 原产品：`89c4446722a22b990c410dbc5726eb1a1208fd1a`，tree `1c645b99de2cd3f608d7ebc980a2780aba320e29`。
- 原证据 / delta parent：`324906488e2c0ca7d8be70067f55085a281ab766`，tree `b08add361aeba12ebc1583d836eca51b7b465632`。
- **新代码：`1bc24450aaa5323afab42c93f7d1e9e6d610f67c`，tree `5894e79078284376417193d88255a12a171910d7`。**
- delta 正好 3 文件：2 产品、1 新测试，+537/-2。相对 parent 的 full-index binary patch SHA256：`2c1965543d6c620148b017c37abff4aa950e26530413d96c90629a3b064079f0`。
- WT：`/Users/samuel/Documents/econclub/.econmind-worktrees/g-nonactivated-runtime-api-host`，branch `codex/g-executor-slices-1-2-20261010`。
- 原 F 报告：`/Users/samuel/.codex/state/plugins/codex-security/scans/g-nonactivated-runtime-api-host/artifacts-5188513d79bd81986a823019895128cbe4a8422cd6bb52fe5b000cadca2cefad/artifacts/F_G_SLICES_1_2_SOURCE_REVIEW_20261010/F_REVIEW.md`；SHA256 `6fd61cd4b01cd134c9bd82d6e47bd3d1bffda9dbdff43f33f4cc3bece04be157`。
- 三文件 SHA256/bytes 在 F_DELTA_EVIDENCE.json；已逐一对比工作文件与新代码 commit 的 Git bytes。原两份 SLICES_1_2 文档已对比 parent Git bytes，完全保留。证据另提交，不替换原历史。

## 两项修复

F-G-01：validateReply 的 financial ok:true 分支先检查原 Core FINANCIAL_INTAKE_OFFICE_ACTIONS 合法 Office/action，再以穷举 Record 绑定八种 action 的成功状态。已有服务与原 intake 为唯一语义来源；无新业务 family。

| Action                                              | 允许成功状态                                                                   |
| --------------------------------------------------- | ------------------------------------------------------------------------------ |
| REGISTER                                            | PENDING_APPROVAL_OR_ENQUEUE / QUEUED / EXECUTING / FINAL / UNKNOWN             |
| INSPECT                                             | INTENT / NOT_FOUND                                                             |
| SIGN_SELLER / SIGN_BUYER_TRADE / SIGN_BUYER_FINANCE | SIGNATURE_RECORDED / NOT_FOUND                                                 |
| BIND_REFERENCE                                      | REFERENCE_BOUND / NOT_FOUND                                                    |
| ENQUEUE                                             | QUEUED / EXECUTING / FINAL / UNKNOWN / NOT_FOUND                               |
| READ                                                | PENDING_APPROVAL_OR_ENQUEUE / QUEUED / EXECUTING / FINAL / UNKNOWN / NOT_FOUND |

REGISTER 只能由 Trade 发出；INSPECT 可 Finance/Trade；三个签名与 reference 各按 Core 原 Office 约束。任意合法非 REGISTER 保留 NOT_FOUND。ENQUEUE 的原 intake recovery 遇 pending 会转 UNKNOWN，故不接受成功 pending。原 ok:false UNKNOWN/retryable:true 与 definite401/403/409、WRITE_OUTCOME_UNKNOWN/retryable:false 分支没有改变；无自动 replay。

八个矩阵测试穷举 6 Office × 8 action × 9 state = 432 控制，其中 28 合法 / 404 非法。两个真实 JWT + actual forwarder 的 dispatched 控制证明 SIGN_BUYER_FINANCE→INTENT、BIND_REFERENCE→SIGNATURE_RECORDED 返回503 WRITE_OUTCOME_UNKNOWN/retryable:false，各 dispatch 一次、零 SQL。另一个测试含六个合法 outcome 原样 relay 控制，各零 replay。

F-G-02：current-seat boundedBytes 恢复已审1024。四个精确 1024/1025 cases，字符串和真实 ReadableStream 都含前后 whitespace、无 Content-Length；1025 返回413且 JWT/SQL 都零，超限开放 stream 实际 cancel。1024 穿过 body/parser 与真实 ES256 JWT，进入刻意不可用的 SQL port 后503；这只证明边界接纳，不声称正向 seat/binding 或经济结果。

## 本次实际验证

固定 Node24.20.0 / pnpm12.3.4。每条实际命令、exit code 与捕获 stdout/stderr 在 f-delta-checks/*.txt。

| 检查                             | 结果                                        |
| -------------------------------- | ------------------------------------------- |
| 新 delta + 既有 transport/drain  | 30/30 PASS，3文件；其中15新、15既有         |
| boundary/foundation + 两项扫描   | 40/40 PASS，violations=[]                   |
| 专用 strict tsc                  | exit0                                       |
| 三文件 scoped ESLint / Prettier  | exit0                                       |
| secret / safe environment / diff | exit0；NOT_LINKED，databaseConfigured=false |

合计70个测试用例；432矩阵断言是8个新测试内部控制，不再叠加为测试数。本次未重跑 native、真实5s/10s budget、full/420、CI 或 build；原预算实现与经济路径无改动。新 fixtures 仅为 wire/JWT/byte 机制；不制造正式 adoption、positive seat 或 COMMITTED 结果。

## 失败与限制

最早 pre-compaction 工具返回输出截断，缺可恢复 session/result，完成状态 UNKNOWN，不计 PASS。恢复后单文件执行为14 PASS/1 FAIL：1025 stream 的 cancel 断言为 false；默认 stream prefetch 已关闭有限源。只将 fixture highWaterMark 设为0，使超限时源仍开放，验证实际 cancel。生产 reader 未改。最终30/30 PASS。选取的实际失败诊断在 failure-history.txt；该文件明确不是完整历史 raw log。

**原 native Worker dist pre-run 精确 manifest/order 收据仍 NOT_AVAILABLE。** stale dist 未被证明；本次不以重建或新测试追认旧 compiled bytes。原 monkeypatch timeout / afterAll database-in-use 精确根因仍 NOT_ESTABLISHED；后来的 adapter PASS 不抹去它。完整旧限制保留于原 packet 与 F 报告。

有限 completion 支持不扩成任意 never-settling port 硬返回保证。全部当前 Office binding 不等于全部六角色完整业务；Industry 仍没有新 executable family，其余角色也未证明完整 workflow。金融原 narrow 流程与三种原 manual recovery family 保持范围。

## 停止点

切片3/4 HOLD，切片5/platform/mount NOT_RUN，formal preflight HOLD。无生产 DB/凭据/grants/schema、迁移注册、admission、人类采用、Clock/consumer 启动、旧站 public/auth/storage、地图/CSS、配置/workflow/pins/status/gate、merge/push/deploy。仅冻结本 delta 与实际证据交 Root/F；不自批通过，不等待新工作。
