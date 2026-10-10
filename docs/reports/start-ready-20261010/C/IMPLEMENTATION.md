# C — 三族 Office 浏览器链与正式会话生命周期

## Status / 固定候选

- `IMPLEMENTED_UNVERIFIED`，有效风险 **P0**：identity/authorization、Command/Receipt 边界。独立 B / 非实施者 review **PENDING**；不得 merge、依赖整合或自称 VERIFIED。
- base：`42991acfee9d0eacc702ba47a380c938a4516f03`。
- implementation commit：`213c5820e631b204134e567e28cbd0c917d649ab`；tree：`1df5f0fabd1c64457512d89c57f98e6ddd6c582a`。
- branch：`codex/c-office-browser-20261010`；worktree：`/Users/samuel/Documents/econclub/.econmind-worktrees/c-browser-trusted-host`。后续仅追加本报告/证据与保留的初始审计报告；最终 documentation head/tree 和报告 hash 在交付消息提供。
- AGENTS / PLANS / 集中 review policy 保持有效。未开始/解锁正式 V09.1 或其他受阻步骤；`status/progress.json` 和 gate 未改。

## 已实施范围

| 文件（仓库相对路径）                                                                                     | 实际行为                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/world-web/src/office-command/contract.ts`                                                          | 复用现有公共 DTO；严格 envelope/request 键、身份/职位/世界/原始 ID/version 一致性和有限大小 exact JSON。三族字面量受 Core 公共类型约束；经济 payload 仍由现有服务端 family parser 验证。                                                                                                                                                                              |
| `apps/world-web/src/office-command/client.ts`                                                            | 现有 `/v1/office-command` 单次 bearer POST，HTTPS 固定 target、omit credentials、no-store、禁止 redirect、10s deadline 和 1MiB 响应上限；严格 ACK 关联。网络/畸形/迟到/不确定写保留 UNKNOWN，不自动重放。                                                                                                                                                             |
| `apps/world-web/src/office-command/controller.ts`                                                        | 授权 READ → explicit original DTO → Review → Confirm once → QUEUE_ACK → 原 commandId/key/server fingerprint 的现有 FINAL lookup → 授权 readback。身份/视图/epoch 变化清私有状态并 fence late work。队列 FINALIZED 仍非 commit。DecisionResult 必须与原 command/fingerprint/event/version 关联才可报告 completion。缺投影、原始 fingerprint 或实际 result 不推算补齐。 |
| `apps/world-web/src/office-command/view.ts`                                                              | 国家 shell 的独立 drawer；可粘贴人工原始 DTO 并显式 Review/Confirm；展示 ACK、UNKNOWN/原始引用恢复、真实 receipt/readback/派生 DecisionResult。没有预置经济 payload 或自动命令 ID。native close 的 DOM 清理机制已实现，并用 DOM double 验证；未声称 native 浏览器测试。                                                                                               |
| `apps/world-web/src/trusted-host/formal-session-adapter.ts`                                              | 外部 auth provider 的 metadata/token/订阅生命周期、过期与 pagehide；严格 seat/admission 回执一致性；显式 display→server country 目录映射；token await、seat await 与既有 authenticated readback 前后复核。任意 provider JSON 不能单独建立连接。缺 provider 默认 BLOCKED，不引入同源 login bridge/Cookie/PKCE/cache。                                                  |
| `apps/world-web/src/trusted-host/bootstrap.ts`                                                           | 最小 optional Office target/binding/consumer 连接，共享同一 session/身份/world/view；Office DENIED 同步 retire 所有 consumer。保留原 Financial/read 默认断开和 fail-closed 行为。                                                                                                                                                                                     |
| `apps/world-web/src/country-runtime/entry.ts`                                                            | 正式入口安装新 drawer 与 session adapter；不自动 configure、登录、授予 seat、提交或激活。                                                                                                                                                                                                                                                                             |
| `tests/world-web/office-command*.ts` + `formal-session-adapter.test.ts` + `office-command.tsconfig.json` | 实际文件为 `office-command.test.ts`、`office-command-fixture.ts`、`office-command-schema.test.ts`、`formal-session-adapter.test.ts`、`office-command.tsconfig.json`。51 项新增定向用例；strict config 不 skipLibCheck。                                                                                                                                               |

仅支持 Captain political-capital allocation、Central Bank OMO、Social employment-service plan。**不是全六 Office 命令能力；不是 Social job matching 全部完成。** Finance/Trade 沿用既有 staged Financial 链；本 adapter 不制造其原始业务请求。Industry 显式 unsupported，Core/API/Worker 公共契约未改。

## authority / reads / writes 与兼容性

- Browser 只消费公共运输契约、现有 projection/FINAL client 和分类 DecisionResult；没有导入 API/Worker 实施或执行经济规则。服务端仍独占 JWT/当前持久授权、family parser、source/consumer、durable queue、Clock、event/receipt 和 settlement。
- ACK 从服务端取得 fingerprint，不在浏览器重算；receipt 恢复沿用 `READ_FINAL_NARROW_TRANSFER_RECEIPT`，**没有平行 FINAL API**。实际通用 SQL reader/serializer 已用三族 TEST_ONLY row 向量验证可被现有浏览器 parser 消费；不是 SQL/RLS/JWT 真实性证明。
- UNKNOWN 没有重放按钮；只能显式绑定原授权流程给出的同 command/key/fingerprint，再做读取。已明确零提交的 SOURCE_RUNTIME_UNAVAILABLE 保持 REJECTED，刷新后不改写为 UNKNOWN。
- 原始 DTO 与返回 state 分离快照；Review/Confirm 的运输 envelope/request 顶层不接受额外 actor/authSubject/simTime/authority 字段。当前授权或 country-office 丢失后断开、清 model/intent/receipt/ack 和关闭 drawer DOM；迟到响应不能恢复。
- 新 adapter 的局部 session label 仅用于 browser lifetime；不铸造 seat、scope、JWT 或 admission。display-country 目录映射只是选择一致性输入，不能授予权限。
- 无数据库/RLS/migration、Core/API/Worker source、地图/CSS、旧站、public assets、auth storage、凭据持久化或部署配置改动；未使用允许的一次性 DB，未接 linked Supabase。Core build 仅产生本地 ignored dist。

## 实际检查

环境：Node `24.20.0`（固定本地 binary）/ pnpm `12.3.4`（`npx --yes pnpm@12.3.4`，固定 Node 在 PATH）；lockfile 未改。完整命令、退出码和输出在 `EVIDENCE.json`。检查的源码/测试与上述 implementation commit 一致。

| 实际命令 / 范围                                                                                                               | 退出码 | 结果                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @econmind/core build`                                                                                          | 0      | PASS：本地公共契约构建，不改 Core source。                                                                      |
| `pnpm exec vitest run`：新 Office / schema / formal-session 三文件 + shared host / financial privacy 两文件，`--pool=threads` | 0      | **90 PASS / 5 files**：新增 51 + 既有共享边界 39；没有重跑既有完整 206/full/420。                               |
| `pnpm exec tsc --noEmit -p tests/world-web/office-command.tsconfig.json`                                                      | 0      | PASS，`skipLibCheck:false`。                                                                                    |
| `pnpm --filter @econmind/world-web typecheck`                                                                                 | 0      | PASS。                                                                                                          |
| `pnpm exec eslint`：本批 7 个 source + 4 个 test/helper TS                                                                    | 0      | PASS。                                                                                                          |
| `pnpm exec prettier --check`：本批 source/test/strict config                                                                  | 0      | PASS。报告另行格式检查。                                                                                        |
| `node scripts/check-boundaries.mjs`                                                                                           | 0      | PASS，318 files。                                                                                               |
| `node scripts/check-authoritative-patterns.mjs`                                                                               | 0      | PASS，313 files / Core 89，zero violations。                                                                    |
| `ECONMIND_ENV=local node scripts/assert-safe-environment.mjs`                                                                 | 0      | PASS：databaseConfigured=false，NOT_LINKED，mutationAllowed=false。                                             |
| `node scripts/check-repository-secrets.mjs`                                                                                   | 0      | PASS，2363 files（报告生成前）；追加报告的检查另附交付结果。                                                    |
| `pnpm --filter @econmind/world-web exec vite build --logLevel warn`                                                           | 0      | PASS：仅 source bundle，不运行地图/publication/deploy 链。保留既有 missing shared CSS 与 >500kB chunk warning。 |

定向证据覆盖实际三族 Core payload parser、strict DTO、人工确认、一次 dispatch、SOURCE 拒绝、UNKNOWN/超时、原始引用匹配、FINAL 失配/旧 readback、actual SQL receipt serializer、actual classified projector 的 cause 关联、异步 token/seat 期间撤权/导航、过期/pagehide、共享 DENIED 传播及关闭 DOM 清理。HTTP/seat/source/rows/DOM 中的向量均显式 TEST_ONLY，不安装到正式数据或页面中。

### 保留首轮 FAIL

首次 web typecheck FAIL：view 对 `renderDecisionResult` 的调用参数错误，已改成 append 其返回节点。首次新增 strict check FAIL：测试误把 payload 直接传给 Core parser；已通过实际 CanonicalCommand + digest 调用。首次新增测试 **33 PASS / 4 FAIL**：上述三族 parser 调用失败，加上 fixture 重复 requestId 触发 fresh lifetime 拒绝。修正 fixture 使用 fresh requestId；没有删除、skip 或弱化测试。之后 37、42、89 项中间 PASS 和最终 90 PASS 都保留在证据中。

## 未覆盖 / 真实阻塞

- **真实 auth provider 未安装；productionLogin 仍为 `BLOCKED_PENDING_REAL_PROVIDER_AND_G_ENDPOINT`。** 本批没有登录页面/密码采集/真实 token 获取证明，也不取存储中的 token 或密钥。
- G 的 server seat endpoint / 具体 HTTP 契约尚未 fixed + approved，标 `PENDING_G_REVIEW`；本批只定义 provider 输入及既有 authority-envelope 消费，不捏造 endpoint 或新的服务器信任模型。真实连接必须由实际 authenticated endpoint/原 authority 读回，不能把 callback 的 JSON 称为批准的 seat。
- 批准的 host country directory、endpoint/world/admission pins、真实 seat grants/revisions、实际 admitted domain source + sole durable consumer 仍由对应 owner 提供；没有用 READY callback 或 fixture 填洞。
- 新 adapter 当前只连接 projection 与适用的三族 Office consumer；Finance/Trade 的真实原始 staged intent 仍应经既有 host/Financial 契约显式供给，未在这里伪造或完成该 producer。
- native browser/visual QA、real DB/RLS/JWT、线上 70×6、正式源经济闭环、CI/full check、publication/deployment、Clock/opening/activation、Gate B **NOT_RUN**。
- Industry 运输契约及完整各领域命令不在本批实施范围，继续显式 unsupported；没有把它们 silently deferred 或 claimed complete。

## 下一动作 / STOP

将固定 implementation SHA/tree、最终 report head/tree、报告 hash 与本证据交独立 B / 非实施者审查；待 APPROVED 前不能 merge 或作依赖整合。G 契约/真实 provider 的后续接线另需其固定审查与既有许可，不能由本报告解锁。无 push/PR/merge/deploy、status/gate 变更或其他窗口消息。本批报告后 STOP。
