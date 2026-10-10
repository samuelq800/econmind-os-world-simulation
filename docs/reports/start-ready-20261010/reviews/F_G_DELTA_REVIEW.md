# F — G slices 1/2 delta 独立复审冻结报告

日期：2026-10-10（Asia/Shanghai）。**结论：APPROVED，仅限下述未挂载源码候选和本地机制范围。F-G-01、F-G-02 均 CLOSED。**

Patch-risk recommendation：merge；workflow：human_review_required。这是审查建议，不是执行合并、挂载、发布、正式 World adoption 或全部六角色验收的权限。总体风险仍按 P0 边界管理，不因两处最小修复降级。原 CHANGES_REQUIRED 报告保留原样，本报告仅关闭其两项发现。

## 1. 固定对象

| 对象                 | Exact SHA / tree                                                                    |
| -------------------- | ----------------------------------------------------------------------------------- |
| 原完整产品           | 89c4446722a22b990c410dbc5726eb1a1208fd1a / 1c645b99de2cd3f608d7ebc980a2780aba320e29 |
| delta base（原证据） | 324906488e2c0ca7d8be70067f55085a281ab766 / b08add361aeba12ebc1583d836eca51b7b465632 |
| 修复产品             | 1bc24450aaa5323afab42c93f7d1e9e6d610f67c / 5894e79078284376417193d88255a12a171910d7 |
| 修复证据 tip         | e70a8bcb64aab70549a9978a9e03cb4320200ef0 / 39442440f36071c652a244023bbb16a7c1327370 |

- WT：/Users/samuel/Documents/econclub/.econmind-worktrees/g-nonactivated-runtime-api-host；最终只读检查 CLEAN。
- 产品父提交为 base，证据父提交为修复产品；没有跟随移动分支替换审查对象。
- full-index binary delta patch SHA256：`2c1965543d6c620148b017c37abff4aa950e26530413d96c90629a3b064079f0`，独立计算吻合。
- 正好 3 文件，+537/-2：2 产品、1 测试。证据 tip 仅增加 12 个 G 报告/原始 txt，产品字节不变。
- 完整读取 G/F_DELTA_IMPLEMENTATION.md，SHA256：`85c18eef2e78264dee91c7bd85e0f0c7091f42710c9c57f977b178fe21554cf2`。
- 完整读取 G/F_DELTA_EVIDENCE.json，SHA256：`05b4a0bbd2794964ece6cb917375702eb3c52a8821ca856c025864bff566ae34`。
- 14 项 manifest（3 source/test + 11 report/raw）hash 与 bytes 全部独立匹配。证据 JSON 自身另验 hash。
- 原 SLICES_1_2_IMPLEMENTATION.md / SLICES_1_2_EVIDENCE.json 与 base byte-identical，SHA256 分别为 `3b58b623923138073a296136670c5becccc9a1fa90257c9a4f0d41749c38f322` / `3370dfc9f30845e7ed9a7e934c5d0eb58f1c1c0bc4143fa725cf0d2ffd8544f0`。
- 原 F 报告 SHA256：`6fd61cd4b01cd134c9bd82d6e47bd3d1bffda9dbdff43f33f4cc3bece04be157`；当前已重新读取，仍为原 CHANGES_REQUIRED 记录。

本报告与原 F 初审联合解释修复后的完整切片 1/2，不将 delta 之外未改变的源码冒充重新全量检查。

## 2. 文件责任边界

1. apps/world-api/src/runtime-preparation/bounded-executor-transport.ts：financial ok:true 回复新增合法 Office/action/state guard。其余 Office/recovery、ok:false/error 分支未改。
2. apps/world-api/src/runtime-preparation/current-seat-fetch-handler.ts：唯一产品改动为 2048 → 1024。
3. tests/world-api/G-review-delta.test.ts：15 个新 wire/JWT/byte 机制测试。

无 Core 合约、原 staged service/intake、经济写入、数据库 schema/grants、迁移、生产数据、地图/CSS、配置/pins/workflow/status/progress/HOLD 变更。未构造第二架构。未修改候选、提交、推送、合并、挂载或部署。

## 3. F-G-01 — CLOSED

新增 financialSuccessAllowed：

- 用原 Core FINANCIAL_INTAKE_OFFICE_ACTIONS 校验 Office/action；Object.hasOwn 拒绝未知或继承属性 action/Office。
- Record<FinancialIntakeAction, ...> 穷举八种 action，先判允许状态，再进入原 authority/shape/fingerprint/receipt 校验。
- guard 位于 financial ok:true 分支，不扩大经济 family，也不重写原错误语义。

独立语义来源是未改的 Core 合法 Office/action、staged-narrow-transfer-service.execute（:345–473）与 PostgresNarrowTransferIntake（:138–279、#state）。不是以新增测试表自行定义业务合约。

| Action                                              | 允许成功状态                                                                   |
| --------------------------------------------------- | ------------------------------------------------------------------------------ |
| REGISTER                                            | PENDING_APPROVAL_OR_ENQUEUE / QUEUED / EXECUTING / FINAL / UNKNOWN             |
| INSPECT                                             | INTENT / NOT_FOUND                                                             |
| SIGN_SELLER / SIGN_BUYER_TRADE / SIGN_BUYER_FINANCE | SIGNATURE_RECORDED / NOT_FOUND                                                 |
| BIND_REFERENCE                                      | REFERENCE_BOUND / NOT_FOUND                                                    |
| ENQUEUE                                             | QUEUED / EXECUTING / FINAL / UNKNOWN / NOT_FOUND                               |
| READ                                                | PENDING_APPROVAL_OR_ENQUEUE / QUEUED / EXECUTING / FINAL / UNKNOWN / NOT_FOUND |

REGISTER 仅 Trade；INSPECT 为 Trade/Finance；签名和 reference 按原 Core Office 限制。非 REGISTER 在原 service load 不存在时均可 NOT_FOUND。原 intake SUBMIT 插入后/重试可返回既有 pending、queue、receipt 或 UNKNOWN，不应接受 REGISTER NOT_FOUND。ENQUEUE 对 pending 会真正入队；操作失败后只读恢复仍 pending 不能证明成功，原实现转 UNKNOWN，因此排除 ENQUEUE 成功 pending。

旧两个反例独立重测已拒绝：

- SIGN_BUYER_FINANCE → INTENT：false。
- BIND_REFERENCE → SIGNATURE_RECORDED：false。
  合法签名、INSPECT INTENT、全部非 REGISTER NOT_FOUND、REGISTER/READ pending 保持；ENQUEUE pending、REGISTER NOT_FOUND、错误 Office、未知 action、错误 subject 拒绝。

实际 forwarder 调用 validateReply 后才返回 upstream body。判 false 走原 catch，dispatched financial 写结果保留 503 WRITE_OUTCOME_UNKNOWN/retryable:false。G 两个 actual-forwarder 测试断言 exact unknown 分类、一次 dispatch、零 SQL；六个合法 relay 控制断言 NOT_FOUND、legacy ok:false UNKNOWN/retryable:true、401/403/409 与 transport UNKNOWN 原 body/status 原样保留、各一次 dispatch，无 replay。F 阅读了这些断言及其固定执行日志，未重复该套测试；独立控制不宣称已执行 actual forwarder/JWT/SQL。

## 4. F-G-02 — CLOSED

current-seat-fetch-handler.ts:99 现在传入 1024，符合 B 批准设计。overlimit 在 body/parser 前返回 413，并位于 authenticated service 调用之前。

G 四个测试：

- 精确 1024/1025 bytes；
- 字符串、真实 ReadableStream；
- 前后 whitespace、无 Content-Length；
- 1025 返回413且 JWT/SQL 计数0，开放超限流实际 cancel；
- 1024 通过原 parser 与真实 ES256 JWT，到刻意不可用 SQL 后503（JWT1/SQL1），没有伪造 positive seat/admission。

F 独立以实际固定 handler/transport/parser/completion 源码，用257字节流分块（不同于 G512）、highWaterMark:0、1024/1025 whitespace、string/stream，再做四项控制：1024 进入一次 stub service，1025 为413且零服务调用，开放超限流 cancel=true。config/service 两个 port 明确 stub，服务返回503；这不是独立真实 JWT/SQL 测试，更不是正向 seat/业务成功。

## 5. 实际验证与来源

### F 本轮亲自执行

- 产品/证据 parent/tree/file-set、patch hash、14 manifest hashes/bytes、原历史两文档不变、CLEAN；
- git diff --check base..product：exit0；
- 从固定产品 Git archive 得到隔离源码，Node24.20.0 transform/VM 执行原模块：
  - 18 个 validateReply 普通定向控制：全部通过；
  - 4 个 actual current-seat handler 字节控制：全部通过；
  - command parsing ports 遇调用即 throw；Core Office-action map 来自实际 Core 源码；
  - current-seat config/service 明确 stub，不声称独立 real JWT/SQL；
  - exit0，网络禁用、空环境、不读取凭据、写仅限 managed temporary 目录。
- assessment.json schema helper：最终 exit0。Schema 合法不等于产品/部署批准。

以上为22项独立机制控制，不是新增22个 Vitest 测试，也不与 G 70 或原227相加夸大。

### G 固定本地证据，F 阅读/hash核对但未重跑

完整读取10个 raw txt（含 failure-history）：

- focused 30/30：15新、15原 transport/drain；
- boundary 40/40，pattern/boundary violations=[]；
- scoped strict/type、lint、format、secret、safe environment、diff、packet：exit0；
- environment 为 local，NOT_LINKED，databaseConfigured:false；
- 矩阵6 Office×8action×9state=432内部断言（28合法/404非法），已属于8个测试，不另加到测试数；
- 最终70个本地测试，不是 CI。

本轮未重复原227、full/native/420、5s/10s timer、build、CI或生产。原证据不改标为新 head 的全套验证；本次 targeted coverage 足以覆盖两处 guard delta，未修改经济/预算机制。

## 6. 失败历史原样保留

1. G最早工具输出截断、无可恢复 session/result：completion UNKNOWN，不计 PASS。
2. G恢复后14 PASS/1 FAIL：1025 streamed cancel=false；默认预取已关闭有限源。仅 fixture highWaterMark:0 让超限时源仍开放以观察实际 cancel；生产 reader 未改。最终30/30通过。这一解释与源码/独立开放流控制一致，不把选取诊断称完整历史raw log。
3. 旧 native monkeypatch timeout / afterAll database-in-use 精确根因 **NOT_ESTABLISHED**，后续 real adapter PASS 不抹去。
4. 旧 native Worker dist pre-run exact manifest/order收据仍缺失；stale dist未建立，无重建/重跑追认旧编译字节。
5. F初次manifest脚本误把证据才新增的报告查询于产品提交，读取失败；改为分别校验产品和证据后exit0，未触及源码。初始结构化assessment误将该读取诊断归入failed patch validation，schema拒绝；按实际性质移到非决策关键历史说明，保留原文件，最终schema exit0，推荐未变。
6. 原 F 初审 helper strip-only 参数属性失败、及其他已记录历史，仍由原冻结报告承载，未删除或重命名为通过。

## 7. 修复后完整切片1/2的最终可接受范围

**接受：固定1bc24450产品（证据e70a8bcb）的未挂载源码候选，及所列本地有限端口机制证据。** 原两项 CHANGES_REQUIRED 已关闭，范围内没有新增需修正发现。结合原25文件初审，本候选可作为切片1/2独立审查已通过的固定输入交 Control Tower；不以缺失的后续部署证据阻止这次两项修复关闭，也不借此批准后续范围。

继承原审查中已追踪且本次未改变的范围：

- 原 bearer/raw body 与固定 server-binding forwarding；
- 原真实 JWT/current World/subject/pins；current-seat同一read-only snapshot枚举真实active Offices、逐项原provider/admission/entitlement/current-head检查，缺一项不静默丢弃；
- manual recovery 只读原subject/intent/idempotency/fingerprint/queue/receipt，不造新命令，不自动重试；
- 不确定写不假称rollback/final，有限真实task/JWKS/SQL/owned cleanup被join；
- 所有Core导出仍为纯DTO，浏览器不取得服务器执行权。

继续保留的限制：

- 任意 never-settling port 不支持有限返回保证；5s尾标记不等于硬清理上限。
- 隐藏source pool ownership 仍需后续constructor证明；cleanup失败不得称已清理。
- 三种manual FINAL fixture 不等于实际经济COMMITTED settlement。
- private local admission/source/grant机制不是正式World采用。
- constructor切片3/4 HOLD；slice5/Clock/consumer/workerd/platform/mount NOT_RUN；formal preflight HOLD。此报告不给启动权限。
- 无真实平台TLS/部署/生产数据库/CI/activation或Gate B认证。

## 8. 六角色完整性不得偷换

主人要求全部六角色，保持显式未完成范围：

- FINANCE、TRADE：复用原窄financial staged流程，不等于完整角色工作流。
- CAPTAIN、CENTRAL_BANK、SOCIAL：原三种manual family与recovery，不等于完整角色产品。
- INDUSTRY：真实seat/binding可被枚举不等于有新的executable family；本切片未实现完整Industry。
- 六current-seat binding不是六角色完整业务验收；wire正向shape不是经济执行结果。

后续全部六角色构造与验收必须另行按原范围接线、授权和执行证据确认，不从本次两缺陷关闭推导。

## 9. 风险/收官

Impact high；delta likelihood low；protection partial（定向完整、后续平台/旧native来源未证明）；recoverability easy；confidence 对两项关闭high、aggregate中等。Privileged/public-contract边界排除auto-merge。Status-quo risk moderate：不采纳则保留已知错配与cap缺陷。

持久化同目录包含 subject.patch、pin-and-raw-evidence.json、independent-controls.mjs/result、assessment.json 与初始诊断。全部在源码checkout/Git之外，原报告未覆盖。此处冻结并停止，不等待、不启动其他切片，不自推/合并/挂载/发布，不更新status/progress。
