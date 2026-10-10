# F 独立审查 C — APPROVED（固定浏览器源码范围）

日期：2026-10-10。审查者 F，非实施者 C。PREPARATION_ONLY_NOT_V09_2_STARTED。
结论：**APPROVED**，仅批准以下固定 source candidate 的窄增量；无阻塞发现。assess-patch-risk recommendation=merge / workflowLabel=human_review_required 是建议，不授予 merge、依赖整合、部署、正式登录、activation 或 Gate B 权限。总体 P0，不可 auto-merge。

## 不可变身份

- repo: econmind-os-world-simulation；subject WT: /Users/samuel/Documents/econclub/.econmind-worktrees/c-browser-trusted-host。
- base: 42991acfee9d0eacc702ba47a380c938a4516f03；base tree: 1254c4144279717c9075e9bbf07b4b2ac4710558。
- reviewed head: 60687418ef8235e6505e7e0b117b2115dfca00df；tree: c5944008eeb0a33427b1ea837ad09af48b6ab2b7。
- code source: 213c5820e631b204134e567e28cbd0c917d649ab；后继仅 EVIDENCE.json / IMPLEMENTATION.md / REPORT.md。
- exact patch: git --no-replace-objects diff --binary --full-index --no-ext-diff --no-textconv --no-renames <base> <head>。
- patch SHA256: 9bef447fc7ba8c4e4fa19a51e27d53c3db6cbb2825db159d11a5e3c6ab59d9da。
- 15 changed files = 7 product TS + 4 test/helper TS + 1 strict config + 3 docs。所有15文件的隔离副本 bytes 与 exact head 对象匹配。九个被复用的 Core public contract/API service/FINAL reader/browser read parser/decision consumer/session/lockfile/Vitest config 与 base blob 一致，详见 source-pins.json。
- 未修改 C WT 或 F d985375 候选；审查前后 C HEAD/tree 相同，git status --short 均为空。无 commit/push/PR/merge/deploy/status/gate/database 操作。

## 审查结论与风险

影响 high：bearer 身份/目标、跨 country/Office 私有 DOM、command/receipt 边界有 P0 后果，绿测试不降低影响。
回归可能 low：全部变更函数及 installed caller 已追踪，现有独立服务端控制保留，定向检查通过，无已证实缺陷。
保护 partial：真实 shipped TS/纯 Core parser/SQL serializer/projector 被执行，但 transport/rows/DOM 均 TEST_ONLY；不是 native browser/provider/DB/TLS 证据。
恢复 managed：可回退到默认 disconnected UI，无 SQL/迁移/新服务端契约；已 enqueue 的合法命令仍持久，须按原 FINAL 恢复，不能靠刷新重放或回滚 UI 撤销。
置信 high，仅限已明示 source-only preparation 范围。未合并风险 moderate：三族已支持人工命令缺该浏览器安全确认/查询链；不合并不会自动获得新权限。

## 已追踪的边界与反例

1. **Seat/auth 来源**：formal-session-adapter.ts:261–347 先要求既有 authority envelope 与 subject/world/country/Office/admission/seat 一致，再由 createProductionReadClient 对真正配置的 HTTPS API 执行 authenticated readback。格式合法的伪造 seatRef 不能通过后续 authority 匹配，独立控制已实际拒绝；复核 await 期间撤权后的迟到正响应也不恢复 host。回调 JSON 不是 seat publisher，display-country mapping 不是授权。现有 API service 重新 JWT verify 并读 current durable seat；Worker intake 在真实 SQL cutoff 再校验，不接受客户端 actor/authSubject/Clock。
2. **Review/Confirm**：controller.ts:258–333 与 contract.ts:62–104。显式原 DTO，strict envelope/request 字段，JSON detached copy，当前投影版本、人工 Review、attempted/busy 防双发。修改输入/返回 state、双 confirm、wrong family/office/world、额外 authority 均实际拒绝或保持原 DTO。三族分区来自未变的 Core DTO，不由测试自行定义。
3. **不确定写与恢复**：client.ts 只 dispatch 一次，omit credentials/no-store/no redirects，10s deadline、1MiB response cap；网络、畸形、wrong ACK、timeout、WRITE_OUTCOME_UNKNOWN 保持 UNKNOWN；没有自动 replay。恢复只绑定原 commandId/key 与经原授权流程取得的 fingerprint，沿用既有只读 FINAL operation。明确 submitted=false/queued=false 的 SOURCE_RUNTIME_UNAVAILABLE 保持 REJECTED，不因 refresh 变 UNKNOWN。
4. **ACK/FINAL/readback**：队列 FINALIZED 仍只是 QUEUE_ACK。未变 FINAL parser 核对 command/key/fingerprint/current authority；readback watermark 必须不低于已观察 floor。completion 还要求 durable COMMITTED 和 decision cause 的 commandId/fingerprint/worldVersionAfter/eventId 对应原 receipt；另一条可见 DecisionResult 不代替本命令。实际 generic SQL serializer 三族与真实 classified projector 两族向量都通过；未建立另一个 FINAL API。
5. **撤权/导航/隐私**：controller disconnect 清 model/intent/lookup/ACK/receipt，异步操作 liveness/epoch fence；Office DENIED 传播至所有共享 consumer。view.ts:55–65/218–263 在 closed render 清 descendants，native close handler 捕获原 surface 且重新检查 open。同元素 country/Office 切换后的 CLOSED DOM，以及 queued close 回调到已 reopen 的合法视图，四个独立控制中均实际验证。此处“native close”是 DOM double 的事件语义，不是原生浏览器验收。
6. **范围/可达性**：country-runtime/entry.ts 真正安装 drawer/adapter；不自动 configure/login/bind/submit/start。只支持 Captain political-capital、CB OMO、Social PLAN，不声称 Social MATCH。Industry 没有 Core 公共契约，继续 unsupported；Finance/Trade 沿用既有独立 staged 端口，formal adapter 不生成它们的业务 intent。无新 Cookie、PKCE、auth storage、经济模型、Core/API/Worker 逻辑、SQL、地图/CSS 或旧站修改。

## 实际独立检查

按技能要求在 managed temporary 目录以 git archive exact head 建副本，APFS clone 已有 frozen 依赖；414 个 symlink 均留在副本，无外部指向。执行 Node24.20.0，未调用 npx/安装依赖/网络。sandbox-exec deny network*；env -i 清凭据；禁止用户目录读取（只允许 Node binary 与临时副本），写入限临时目录。先从固定 Core/Worker source 各 build，均 exit0；没有使用 subject ignored dist。

- 五个 scoped files：office-command.test.ts、office-command-schema.test.ts、formal-session-adapter.test.ts、trusted-host-session.test.ts、trusted-host-financial-privacy.test.ts。实际 **90 PASS /0 FAIL /0 SKIP**，2.69s；非 835/full/420。
- F 独立 controls：valid-shaped counterfeit seatRef、authenticated readback await 中撤权、same-element country/Office switch + closed/reopened DOM：**4 PASS /0 FAIL /0 SKIP**，334ms。测试源随证据保存，未写 subject。
- strict tsc -p tests/world-web/office-command.tsconfig.json（skipLibCheck=false）、web tsc -b、定向 ESLint/Prettier：各 exit0。
- check-boundaries：318 files /0 violations；check-authoritative-patterns：313/Core89 /0 violations，各 exit0。
- 使用既有 secret policy 扫15 changed files：PASS；git diff --check：exit0；patch SHA 二次核对一致。
- assessment.json 由技能 validator 实际验证，exit0。完整命令/真实输出见 checks.json；机器生成测试结果已按实际 bytes 导入 managed persistent storage。
- C 原实施报告的首轮类型/测试 FAIL 仍保留在原 EVIDENCE，不把原始失败抹掉；本独审没有新的 behavior/check FAIL。一次只读 pin 查询用了不存在的 decision-result-consumer.ts 文件名，已按实际 decision-result.ts 更正；不是测试结果。
- 原 C 自报 90 PASS 等不是独立结论来源；本次上述检查为实际重新执行，未移植 CI/full PASS。

## 保持阻塞，不随 APPROVED 推进

productionLogin 仍 BLOCKED_PENDING_REAL_PROVIDER_AND_G_ENDPOINT；seatEndpointContract 仍 PENDING_G_REVIEW。真实 provider、G endpoint契约、正式 country directory/seat/admission、domain source/sole consumer/FinanceTrade intent producer 是各 owner 后续工作。
Native browser/视觉、真实 JWT/RLS/数据库/TLS、live revocation notification、完整六角色、70×6、full CI、发布、经济/Clock 激活、Gate B：NOT_RUN。离线 subscribe/401/403/expiry 成功不是线上及时撤权证明。它们不是默认 disconnected browser source candidate 的阻塞缺陷，也绝非正式 readiness 通过。
C 本批并未承诺完成所有六角色；此批准不可拿去抹除 Industry 或正式宿主缺项。后续真实接入需新的固定来源、适用验收与独审。审查无阻塞 findings；没有 code-comment 指令。

## 证据目录

同目录：subject.patch、source-pins.json、checks.json、scoped-tests.json、independent-tests.json、independent-controls.test.ts、assessment.json。

- scoped-tests.json SHA256: 5ece29ea7ca5bc8a7d12b7739d2038f8642a5d2fe567edfb7a8a9502d3a97861
- independent-tests.json SHA256: 33fd9f18911bc00cafbbd86eed77546ca3bf2a9865959eb579acc8384a6e1a93
- independent-controls.test.ts SHA256: c6618db15042405c81487ade291298fe1e66b59fe60c1100009b235c985747d7
- source-pins.json SHA256: 18ad91bb32cc559f59425683162281fe768f5d4163a0b0ae8a673f0509f5e0c9
- checks.json SHA256: ecd87985de946689e17c24a3b431285400e44350f4efe6db4ed15761d09f709c
- assessment.json SHA256: ec93ada98efc0c6a2eab6115f46b6c2c738bb11d1a5ee201bfc419f3f5c7125b

本报告 hash 由外层保存回执绑定，避免自引用。C 独审到此完成；不自行 merge 或修改 subject。
