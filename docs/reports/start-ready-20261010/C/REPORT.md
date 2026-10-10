# C — 正式浏览器接入缺口（2026-10-10）

结论：现有入口已安装 trusted host，但尚未形成正式登录 → 服务端 seat → host connect 的生产调用链。六职位均有共享读取消费层；Finance/Trade 有 staged financial 消费层；Captain/Central Bank/Social 有服务端手动命令契约但没有正式浏览器消费层；Industry 不在该手动命令 API 契约内。真实开局包导入成功本身不能补齐这些接入，也不授予启动权限。

## 固定依据与边界

- 已 fetch 并核实 `origin/main`：`42991acfee9d0eacc702ba47a380c938a4516f03`；tree：`1254c4144279717c9075e9bbf07b4b2ac4710558`。
- 本报告所有源码行号均属于该 Git 对象，使用 `git show` / `git grep` 检查。独立 worktree `/Users/samuel/Documents/econclub/.econmind-worktrees/c-browser-trusted-host` 仍停在 `d9313b5`；没有把其工作文件冒充当前 main。
- Root 提供的发布上下文为 PR129/PR130、Actions `38028232852` 的 `PASS_HOLD_ONLY` 和固定部署 `e7ecf451`；本次未复核 CI 或线上部署，不能把 main 源码结论外推为已部署功能。
- 已读取固定版本的 `AGENTS.md`、`PLANS.md`、review policy、`status/progress.json`。当前 gate 仍为 V09.1 / PENDING，`next_step_ready=false`；本报告不改变它。
- 仅新增此目录报告；未改产品、地图/CSS、旧站、auth/storage、状态或门槛。未获取 token/密钥、个人数据；未调用线上服务、生产数据库、部署、Clock、开局或 activation。

## Source / API / test 缺口表

下列“已存在”仅表示固定源码中已实现；不等于生产实例已配置或授权。测试列列出已有证据入口，本次均未执行。

| 链路                          | 判定与证据（仓库相对路径:行号）                                                                                                                                                                                                                                                                                                                                                                                                                                      | API / 已有测试                                                                                                                                  | 最小后续动作与依赖                                                                                                                                                                               |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 正式入口 → host               | **已存在安装；缺失生产调用方。** `apps/world-web/src/country-runtime/entry.ts:303–312` 安装 read、financial、host 并发 ready 事件。对 `apps/world-web/src` 和正式 `country-game.js` 的调用检索未发现生产 `configureTargets` / host `connect` 或 ready 消费方。                                                                                                                                                                                                       | `tests/world-web/trusted-host-session.test.ts`；安装不自动发起读取/提交。                                                                       | 在正式入口接入经批准的 host/session adapter；保持默认断开，配置不全零请求。需真实 host 输入，不可用 demo/local host 替代。                                                                       |
| 登录/token → 身份/seat        | **浏览器取得路径缺失；服务端验证已有。** `production-read/contract.ts:46–57`（下文简称路径位于 `apps/world-web/src/`）要求外部 token getter、identity、seatRef、session 和 world pins；`trusted-host/session.ts:73–96` 只包装 callback，不登录、不铸造 token。源码检索未见正式 sign-in / auth-session 获取实现。`apps/world-api/src/integration/postgres-full-read-provider.ts:55–118` 从持久 store 读取 current seat 与 immutable admission，并校验 revision/seed。 | 现有 projection / FINAL 读接口验证 server binding；它们不是已实现的浏览器登录/seat 列举 API。`tests/world-web/production-read-client.test.ts`。 | **契约依赖 + 权限依赖：** auth/API owner 提供真实会话来源、服务端授权 seat/scopes/revision、开局 pins 与批准 endpoints；由 adapter 显式传入。不得从 DOM、URL、角色选项或本地存储推导授权。       |
| 70 国 × 6 职位动态绑定        | **视图覆盖与 fail-closed 已有；动态授权/rebind 缺失。** `trusted-host/bootstrap.ts:140–164,188–197,225–271` 校验 01–70、六角色、当前视图；切换先 retire/disconnect，旧 sessionRef 不可复用；不会自动赋予 420 个 seat。`office-projection/model.ts:13–25` 显示 country key 由 host 提供，不能推导 server countryId。                                                                                                                                                  | `tests/world-web/trusted-host-session.test.ts`；`tests/world-web/office-projection.test.ts`。                                                   | host 在每次获准切换后重新取得真实授权 binding 与 fresh sessionRef；不能浏览器自造授权或把 420 fixture 视作 grant。需 API/auth owner 的选择和撤权通知契约。                                       |
| 撤权 → 停止请求/清除私有 DOM  | **机制已存在；真实事件来源仍依赖 host。** `trusted-host/bootstrap.ts:166–197` 共享失效广播/视图观察/pagehide；`office-projection/controller.ts:94–146` 清 model/receipt、断 port；`office-projection/view.ts:60–66`、`financial-intake/view.ts:76–87` 清关闭抽屉内的私有 DOM。session 对异步 token 前后复核并不可逆 retire。                                                                                                                                         | `tests/world-web/trusted-host-financial-privacy.test.ts`；`trusted-host-session.test.ts` 中 DENIED、迟到响应、UNKNOWN replay 用例。             | 保留现有 fence；接入真实 `currentIdentity/isCurrent/onInvalidate`。本次没有真实登录/撤权证明，不重复 native 或 420 检查。                                                                        |
| read → Financial              | **已有两职位消费链；配置与原始业务输入依赖外部。** `trusted-host/bootstrap.ts:35–51,86–121` 仅组合 projection / financial，并严格匹配原始请求；`financial-intake/controller.ts:299–309,404–470` 要求 bound、匹配和显式 review，再经真实 FINAL lookup + refresh 才到 FINAL_VERIFIED。                                                                                                                                                                                 | `/v1/financial-intake`；`tests/world-web/financial-intake.test.ts`、`trusted-host-session.test.ts`。                                            | host 提供批准 financial target、真实 staged 请求及原始 IDs/fingerprint。不能以本地规划、假投影或 FINAL_REPORTED 清除 MISSING / completion=false。                                                |
| read → Office command → FINAL | **服务端三族存在；正式浏览器命令消费链缺失。** `trusted-host/bootstrap.ts:35–51` 没有 Office target/binding/consumer；`office-projection/controller.ts:19–48` 明确 `PRODUCTION_COMMAND_PORT_MISSING`；`apps/world-worker/src/intake/postgres-office-command-intake.ts:109–117,222–245` 只接受三族，缺 admitted source / sole consumer 时拒绝。                                                                                                                       | `/v1/office-command`；`tests/world-api/https-authenticated-office-command-route.test.ts`、`positive-manual-office-command.test.ts`。            | 三族需要正式浏览器 transport/controller/view 和 host 扩展，沿用现有 DTO/严格 parser；真实 source/consumer、服务端授权和 P0 独立评审是硬依赖。不是只添加按钮。Industry 先解决契约，不伪装受支持。 |

## 六职位能力分界

共享 READ 支持六职位（`apps/world-web/src/production-read/contract.ts:7–14`），但每个 scope 仍须真实 server authority 和可用投影；声明支持不保证字段存在。以下仅覆盖现有正式 browser / financial / manual-Office 运输链，不断言 Kernel 中不存在其他领域命令。

| 职位         | 正式浏览器 READ    | 现有服务端命令运输契约                                                          | 浏览器 command → FINAL 缺口                                                  |
| ------------ | ------------------ | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Captain      | 共享 consumer 已有 | Office：`CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1`                                 | 缺正式提交与原始 command 身份关联流程。                                      |
| Finance      | 共享 consumer 已有 | Financial：INSPECT / SIGN_BUYER_FINANCE / BIND_REFERENCE                        | staged consumer 已有；真实 host binding、原始请求、授权与 runtime 仍须提供。 |
| Central Bank | 共享 consumer 已有 | Office：`CORE_CENTRAL_BANK_OMO_V1`                                              | 缺正式提交与原始 command 身份关联流程。                                      |
| Industry     | 共享 consumer 已有 | Financial actions 空；manual Office 的 officeId / family 均不含 Industry        | **契约缺口 + 消费层缺口**，不能靠 UI 按钮修复。                              |
| Trade        | 共享 consumer 已有 | Financial：REGISTER / INSPECT / SIGN_SELLER / SIGN_BUYER_TRADE / ENQUEUE / READ | staged consumer 已有；真实 host binding、原始请求、授权与 runtime 仍须提供。 |
| Social       | 共享 consumer 已有 | Office：`CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1`                                | 缺正式提交与原始 command 身份关联流程；此族不能代表所有就业命令均已接通。    |

契约依据：`packages/core/src/commands/authenticated-financial-intake-contract.ts:7–27` 与 `authenticated-office-command-contract.ts:3–21,40–49`。Office 的 QUEUED / EXECUTING / FINALIZED 是队列 acknowledgement，**不是经济 commit receipt**。`apps/world-web/src/office-projection/decision-result.ts:92–108` 能展示另外四职位的派生结果，不意味着其提交能力已实现。

### FINAL：不要误报为“必须新建接口”

现有浏览器 lookup 使用 `READ_FINAL_NARROW_TRANSFER_RECEIPT`（`apps/world-web/src/production-read/client.ts:389–412`），但 SQL reader 查询通用 `world_v2.command_receipt` / `command_submission`，按原始 command/idempotency/fingerprint、用户及当前 country/office 授权关联，没有 command family 过滤（`apps/world-api/src/integration/postgres-final-receipt-reader.ts:39–129`）。因此，**不能仅因 operation 名含 NARROW 就断言 Office FINAL 服务端完全缺失**。

真正尚缺的是正式 Office browser acknowledgement → 原始 commandId/idempotencyKey/fingerprint → 当前授权 lookup → readback/DecisionResult 的关联闭环。现有 lookup 能否完整消费各 Office 实际 durable receipt 的 schema/语义，仍需该契约的有界验证；本次未证明可复用，也不要求先新增一个平行 FINAL API。

## 最小补丁候选（仅建议，未实施/未授权）

1. **正式 session adapter：** 修改 `apps/world-web/src/country-runtime/entry.ts`，新增例如 `apps/world-web/src/trusted-host/formal-session-adapter.ts`（拟议路径），只消费真实 host/auth binding，调用现有 `configureTargets/connect`；视图切换先 retire，再等待新的服务端授权 binding。现有 read / financial target 可分别固定来源；配置字符串不是部署批准。
2. **三族 Office 浏览器消费层：** 新增 `apps/world-web/src/office-command/` transport/controller/view（拟议路径），扩展现有 `trusted-host/bootstrap.ts` 与入口；使用现有公共 DTO 与 API，不导入 Worker、不重算经济结果。先确认原始 IDs/fingerprint 与现有 FINAL/readback 关联契约，再接按钮。
3. **Industry：** 先由 Core/API/Worker owner 明确已批准的命令族、payload、source/consumer 与权限边界；若批准接入，涉及 `packages/core/src/commands/authenticated-office-command-contract.ts`、`apps/world-worker/src/intake/postgres-office-command-intake.ts` 等既有运输边界，然后才做浏览器 consumer。不是本报告授权的产品扩展，也不能以本地 fixture 填洞。

这些候选触及身份、授权、Command/Receipt，属于需独立 P0 review 的后续包。API host 的源码组合并不建立线上 listener/TLS 或激活：`apps/world-api/src/integration/nonactivated-runtime-api-host.ts:176–220` 明确无默认 listener/env/activation。真实 seat grant、admission、admitted source、sole durable consumer、部署许可及现有治理 gate 必须分别满足；本报告不代替其他 owner 的 host 挂载检查或启动批准。

## 检查与停止点

- 本次：固定 Git 对象的源码/契约/现有测试入口检查；**产品测试 NOT_RUN，线上检查 NOT_RUN**。
- 已比较 `d9313b5..42991ac` 的 trusted-host、office-projection、financial-intake 与两份 dedicated host 测试，差异为空；没有复跑昨日 targeted/full/native/420，不把昨日结果记作本次 PASS。
- 仅交付本报告；不 commit、push、merge、部署、开局、改 gate 或发送额外 Root 消息。报告完成即停止。
