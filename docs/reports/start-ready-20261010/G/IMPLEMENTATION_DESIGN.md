# G 实施设计候选：API boundary → 内部 executor intake → sole Worker consumer

日期：2026-10-10（Asia/Shanghai）。状态：**P0 DESIGN_CANDIDATE / INDEPENDENT_REVIEW_PENDING**。请求 B 审查本文件固定 commit/hash 的技术方案；设计批准不等于实现批准、生产授权或 gate 解锁。B 对既有源码的方向预审不是对此文件或未来代码的 APPROVED。此次仅新增本文件，保留既有报告与他人改动。未开始依赖实现。

base **42991acfee9d0eacc702ba47a380c938a4516f03**，tree **1254c4144279717c9075e9bbf07b4b2ac4710558**。分支 `codex/g-executor-command-design-20261010`，基于 G 报告 commit `266aed0deb85ac07e06595022f8388aa59a48143`（相对 base 只有 G 两份文档）。部署仍固定 **e7ecf45184baad69a37e2e51fff8862a635267dc**；本方案不修改 Cloudflare entry/config/workflow/pins、status/gate、数据库或旧站，不新增平台 builtin 例外。

## 1. 推荐方案与另一方案

推荐维持 **外部 API + 内部 executor**。API 处理路径、CORS、大小、真实 JWT 和严格输入；只向已有 WORLD_EXECUTOR service binding 的固定内部路径转发原始请求 bytes 和 bearer。executor 在自己的 isolate 再验证同一个真实 bearer，以当前服务器 seat/admission/source 完成 durable intake；真实私有 pool/clock/runtime identity 留在该 isolate。intake 只登记 command/queue 或 staged intent，不自动消费、结算、推进 Clock 或发布 projection。唯一消费 host 归 Worker，读 API 使用独立受限 reader。

| 方案                                          | source/authority cutoff                                                                                                     | 改动与代价                                                                                                                                      | 结论                                                                       |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| A：API boundary → executor 内完整 intake      | executor 内复用原服务、SQL cutoff/private runtime；跨边界只有请求原件和 durable DTO                                         | 增加固定 forwarding adapter、内部 Fetch handler、真实 production runtime constructor、可等待的取消/清理接口；API 不持 worker source/经济写权限  | 推荐；集中 source/lease/consumer 归属，符合已有 topology                   |
| B：API intake + DB 原子 source-preflight 协议 | 必须由一个受控 SQL transaction 同时验证真实 source/head/admission 与命令登记，或采用源版本绑定的服务端 proof 并在提交时重验 | 新 SQL/proof authority、过期/replay/cutoff 语义、privilege/migration 发布；remote “source OK” 后 API 再写有 TOCTOU，当前 WeakMap 不能跨 isolate | 不选；此轮不能把 callback/JSON/READY 当原子协议，也不临时增加 DB authority |

源码依据：`nonactivated-runtime-api-host.ts:125–173` 保留 exact ports，`manual-office-intake-runtime.ts:37,128–145` 私有 registry，`postgres-office-command-intake.ts:467–546` source/head/current authorization cutoff。A 也需要下述真实 production constructor；转发本身不能绕开现存 local/CI guard。

## 2. 固定路径、信任与消息契约

所有新入口默认不 mount。下列是本候选约定的唯一允许路径，不接受 URL/query/header/body 指定内部 host、route、role、clock、source factory 或 reader。现有 HOLD /healthz、/readyz 与 public/auth/storage/lobby 不受影响。

| 外部 API exact POST path                                                     | 内部 exact POST target（仅 service binding）             | 内容与结果                                                                                                                                  |
| ---------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `/v1/office-command`（已有）                                                 | `https://executor.internal/internal/v1/office-command`   | 原 `world-authenticated-office-command-v1` JSON bytes；返回原 Office response，202 NEW / 200 EXISTING queue acknowledgement，不是经济 FINAL |
| `/v1/financial-intake`（已有）                                               | `https://executor.internal/internal/v1/financial-intake` | 原 `world-authenticated-financial-intake-v1` bytes；仅既有 FINANCE/TRADE actions，结果保留原 staged provider 语义                           |
| `/v1/command-recovery`（拟新增）                                             | `https://executor.internal/internal/v1/command-recovery` | 下述只读 identity recovery；返回实际 durable queue/FINAL/NOT_FOUND，不能 enqueue/consume                                                    |
| `/v1/current-seat`（拟新增）                                                 | 无；API 自己受限 read-only snapshot                      | 下述真实 JWT → server-owned seat/binding DTO；不接受 country/office selector                                                                |
| `/v1/world-read`、`/v1/final-receipt`（既有可配置 read paths，在本方案固定） | 无；API 原受限 reader                                    | 原 projection 与 narrow-named FINAL 协议保留，不能悄悄改成全家族协议                                                                        |

外部 origin 固定配置为 `https://econmind-world-api-staging.observer-lagesan.workers.dev`；CORS 只允许现有 `https://world.econmind.group`、`https://samuelq800.github.io`。这是当前 HOLD 目标，不代表新路径已部署。auth 固定 projectRef `vimksjrhaxdpnkvgsavz`、issuer `https://vimksjrhaxdpnkvgsavz.supabase.co/auth/v1`、JWKS `https://vimksjrhaxdpnkvgsavz.supabase.co/auth/v1/.well-known/jwks.json`、audience `authenticated`；model 固定编译常量 `world-v2-foundation-1`。worldId/seedRef/contentHash/admissionRef/minimumWorldVersion 与真正 deploymentRef 尚无本轮正式输入，必须从后续已审 server release 配置精确装载；缺一项保持 HOLD，不能使用 TEST_ONLY 或自行杜撰 pin。

API 到 executor 只复制 `Authorization: Bearer …`、`Content-Type: application/json`、经校验的 Origin（若存在）；另由 API 生成两项内部 transport metadata：`X-EconMind-Forward-Version: world-command-forward-v1`、`X-EconMind-Deadline-Ms: <absolute epoch ms>`。先丢弃外来同名及其他自定义 headers，不转 Cookie、API key、X-Auth-Subject、seatRef、role 或授权标志。内部 deadline/version 只用于 transport，不能授予权限。bearer 不进入 URL/body/log/error/trace；不记录 body、token hash、decoded claims、敏感 SQL 或 connection string。

已有 WORLD_EXECUTOR 对象为真实 server-owned service binding；Fetch target 是代码常量，只允许绑定对象的 fetch，不用 ambient global fetch 发命令，不跟随 redirect，不设置 fallback host。executor 即便收到直接内部调用，也完整重验 bearer/current authority；不信任 “由 API 验过” 标记。内部 handler 不加浏览器 CORS，不对公网开放；以后是否发布仍需独立审批。

## 3. 边界、预算、取消与 UNKNOWN

| 项目                    | 固定要求                                                                                                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| command/staged 请求     | 维持已有 route 的 **16,384 bytes**（不是 service 内 64K 的较宽限制）；Content-Length 与流式累计均检查，严格 UTF-8/JSON；原 schema/keys/family parser 必须通过                                            |
| recovery / current-seat | recovery **32,768 bytes**（含原 Office intent，用于核对未知首次 acknowledgement）；current-seat **1,024 bytes**；禁止额外 keys、query、alias、trailing slash、重复 Authorization、压缩/不支持的 encoding |
| bearer / JWKS           | 沿用 header ≤8192 与原 verifier key/algorithm/issuer/audience/expiry 限制；同 auth config 用同一 createCloudflareJwksFetch port，强制 manual redirect                                                    |
| 响应                    | command/recovery ≤1 MiB；current-seat ≤32 KiB；API 有界读取并验证 schema/requestId/identity/state，不透传任意 upstream text/headers                                                                      |
| 用户可见 request budget | t0（外部请求进入）起 **10,000ms**，body ≤5,000ms；JWT 和内部请求共用剩余预算，不能每跳重置。executor 取 min(API deadline, own start+10s)，已过期先拒绝                                                   |
| 重试                    | API、service binding、pool wrapper、consumer 均不自动重试写入或 UNKNOWN。HTTP202/200 必须来自实际已确认的原 intake result                                                                                |
| 日志                    | 仅固定 sanitized code、阶段、duration、非敏感随机 transport correlation；commandId 等私有标识也不默认加入公开日志                                                                                        |

API 在完整 body/真实 JWT/严格 parser 通过前不 dispatch；executor 对同一 bytes 再解析，调用固定原 service constructor。为了保持原件，transport reader 提供 bounded raw bytes 与解析值，转发原 bytes；不改写 country/office/payload/requestId，不发送“预先 canonical 化的 command”。真正 server actor、SimTime、submittedAt、fingerprint 仍在原 intake 中生成。

API 的外部 abort/timeout 连接内部 Request.signal；**不能假定 service binding 自动把客户端断连可靠传给 executor**。executor 自己的 absolute deadline/AbortController 必须独立有效。可能写入的 Office/staged 请求已交给 binding 之后，API 无法证明没有写入：若没有完整可验证的 definite response，则返回/保留 **WRITE_OUTCOME_UNKNOWN, retryable:false**；客户端已断连时不再写响应。只有明确尚未 dispatch，或 executor 原服务确认无写且返回 definite denial，才能报告相应 4xx/未写拒绝。未知不是 NOT_FOUND、REJECTED、FINAL 或 COMMITTED。read-only recovery 自身失败只报读失败，不把原未知命令改成拒绝或已提交，也不声称 recovery 产生了一次未知写。

executor 也不能把断连等同 rollback：保留 `OfficeCommandOutcomeUnknownError`、原 SQL COMMIT/ROLLBACK acknowledgement-loss 与 `PostgresTransactionError.outcome`。完整 definite 401/403/409 可原样映射；丢失/截断/超限/不合法 upstream response 在 dispatch 后一律 UNKNOWN，不猜测是否已写。原 financial state UNKNOWN 与错误 retryability 保持；transport 新产生的 uncertainty 统一不可自动重试。

**需要实际实施的生命周期修复，不是 Promise.race 外壳：** 原 `createAuthenticatedOfficeCommandService.handle` :104–115,259–265 可在 execute() 完全 settle 前返回取消结果；production request-scoped pool 不能据此提前 close/返回成功。应为原 HTTP-neutral service 增加 server-only tracked completion/drain（旧 handle 默认行为不变），内部 host 必须 join 实际执行、回滚/连接销毁和 Pool.end。所有真实 SQL/JWKS/source ports 必须提供可取消、可等待的完成路径；unsupported/unbounded source port 不准启用。response 10s 超时可先成为 UNKNOWN，但 executor 的已有 I/O 清理仍须完成；不以 waitUntil、脱离 promise 或无界 background write 掩盖清理。

实现时为 pool connect ≤3s、SQL 服务端 timeout ≤剩余业务预算，辅以真实 driver/connection abort，测试断网/释放后 pending query 确实 settle。额外 cleanup tail 上限候选 **5s**，超限必须销毁连接、记录 CLEANUP_UNCONFIRMED/UNKNOWN 并证明剩余本地任务已结束；仅 race 一个计时器不算满足。若实际 pg/workerd 无法在该上限内确认完成，B/Root 需审查真实失败证据并修订预算，不能宣称实现通过。这是实现验收约束，当前没有运行机制测试。

## 4. 同 isolate 的真实 production 构造与 Worker sole ownership

源码所有权与运行 isolate 分开：现有 API HTTP-neutral service 可以在内部 executor isolate 被调用，执行/持久化/sole consumer 仍用 Worker 模块。复用 `createAuthenticatedOfficeCommandService`、`createAuthenticatedFinancialIntakeComposition`、`PostgresOfficeCommandIntake`、原 JWT/provider；不复制认证/经济实现。架构 registry `scripts/architecture-ownership.mjs:architecturalEdgeViolation` 允许 server API/Worker 互调，但禁止 browser/Core 导入 server implementation；新实现仍要过真实 boundary check。

建议后续文件/装配边界（本文件不创建它们）：

| 拟实现文件/接口                                                                 | 责任与固定依赖                                                                                                                                                                          |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/world-api/src/runtime-preparation/executor-command-forwarder.ts`          | exact-path bounded public adapter；构造真实 verifier/原 parsers；唯一 WORLD_EXECUTOR transport，不注入可返回 positive 的业务 handler                                                    |
| `apps/world-api/src/runtime-preparation/internal-executor-command-handler.ts`   | 标准 Request/Response handler，直接调用原 HTTP-neutral services + Worker production runtime；无 Node HTTP/Cloudflare builtin，null config 返回 HOLD/503、无 pool I/O                    |
| `apps/world-worker/cloudflare/runtime-executor.mjs`（暂不改任何 wrangler main） | 未挂载的 Worker-owned Fetch 入口；导入上项已编译 API 模块。先 Core→Worker→API build，再独立 bundle/typecheck 此 mjs，避免 Worker tsconfig rootDir:src 跨根 TS 与循环编译依赖            |
| `apps/world-worker/src/runtime-preparation/production-world-command-host.ts`    | 固定生产 source factories、真实 read-only validation、受控 intake/consume 生命周期、私有 registration；不接受 environment:'ci'、arbitrary readers/positive callback/READY               |
| 原 `manual-office-intake-runtime.ts` / `postgres-office-command-intake.ts`      | 增加专用 production runtime 分支/union 和私有 registry 绑定；旧 constructor/复制-token-negative 行为保留；不得公开 mint token 的通用 helper                                             |
| 原 `durable-command-consumption.ts` / `local-narrow-reservation-worker.ts`      | 如需复用则提取 Worker 内部执行核心；原 local/CI wrapper guard 与 production env 禁令保持；新 production constructor 独立验证真实 ports/source/admission/role/lease条件                  |
| D/E 已审组件（尚待固定交付身份）                                                | 真正 admitted source readers、production database/role validation、server clock/lease/lifecycle；消费仍复用原固定 family factories、authoritative execution/atomic repository/publisher |

**不接受只改 env 的新 constructor。** production host 的 public 输入必须是 server release metadata + D/E 真实受控 source/clock/database constructors 产生的 ports；它在每次使用时验证实际 DB role、World/admission/seed/head、source lineage、required family；缺源拒绝。不能只验证一个传入 record 的 hash/approved flag。D/E 接口或证据未就绪则 constructor 默认 HOLD，正向路径不得用 fixture 填补；实现可以先完成拒绝/生命周期支路，但不能报 production-ready。

request-local **intakePool、immutable clock 对象、worldId** 由 executor 的真实 private constructor 注册，与原 intake 使用完全相同的对象。readPool、intakePool、worker source database 分属最小角色，不能为了满足 identity 用经济 writer 兼任 intake。不同 request 的 Pool 不共享，也不把 API pool 传过去。clock 的 owner 固定其 own nowReal/simTime methods；聚合/host 不 freeze、复制、proxy borrowed authority ports；数值来自批准的真实 World clock，不取客户端时间。

**同时解决 consumer 生命周期，不制造一个 PREPARED 假 consumer。** 当前 manual runtime 把某个 preparation consumer 与 request pool 固定关联，不能将 per-request consumer 冒称长期 sole consumer，也不能在所有 request 内 startPreparation。新 production 分支需区分：

- Worker-owned host registration：同 isolate 私有身份，保存 World/worker/source/clock/lifecycle 的实际受控构造关系，不保存跨 request 的活跃 socket；不是远程状态、bool 或可序列化 token。
- request-bound intake runtime：用真实 host registration 和当前真实 ports 创建的短期私有 token，只证明此 source-preflight/intake construction；request settle 后 retire，copy/另一 pool/另一 clock/World 均拒绝。
- controlled consumer step：只由 Worker host 的已审 lifecycle 调用，另在本次 I/O context 建库连接，实际 lease/fencing 保证跨 isolate single writer。不得把 JS single-flight 当集群锁。仅 intake 不触发该 step，默认 HOLD 不注册运行或消费。

现有 `boundManualOfficeIntakeRuntime`/preflight 需针对两种真实 registry 分支进行固定检验；production 分支不能接收任意 state() getter 来绕过检查。旧 local factory 类型与测试保留。新 worker public subpath 只暴露必要受控 constructor/types，不把通用执行核心或 private issuer export 给 browser/共享 Core。跨 isolate 的运行 holder 必须由真实已审 lease supervisor 绑定执行实例/epoch，不能把所有实例共用的 service 名称或 HTTP requestId 当 holder；另一个实例即便有相同 World/pins 也不能重用别人的 lease/fence。默认只准备 intake 的私有对象不声明 RUNNING、已获 lease 或已在消费。

per-request I/O 先完成/消费 JWKS body 再做 SQL；最多 reader2 + intake2 + worker source1 个 pg connection，保留至少1个外部 I/O slot。原二池 helper可复用，worker source pool由已审 host port管理；source read 不递归调用 API/service binding。实际 workerd connection budget与 abort/end 行为需要真实定向证据，不能仅以 max 字段证明可用。

## 5. admission、source/head、撤权与 commit cutoff

executor 重新验证 issuer/audience/signature/expiry，使用 verified subject 找 server actor 和当前绑定；不把 browser country/office当当前 seat。请求包含的 country/office只是 intent selector，必须与实际 current seat匹配。正式 five world pins 与 compiled model始终固定。

新 Office command：

1. 原只读 binding provider获得当前 seat/admission/entitlement/projection/head，严格 family parser生成 canonical intent；private runtime/preflight使用D/E真实源。
2. source preflight只证明当前来源可用，不是持久授权或可传输 approval。原 intake:483–546 按 submission→head 锁顺序重新检查 current auth/entitlement/role/revision/expectedWorldVersion，并原子写 command+queue。source advance导致head变更时拒绝，不能用预检旧head继续登记。source carrier若能在不改变其声明head/lineage的情况下变化，该producer不满足接口，必须失败关闭。
3. 这一步不取得经济 commit权或自动续lease。Worker consume再次读取durable command/current source/clock，并在原claim/atomic commit中验证当前auth、expectedhead、holder/fencing/未过期lease；token不代替SQL guard。
4. enqueue后撤权：execution cutoff再次拒绝，不能仅凭入队时JWT成功继续。撤权先于intake cutoff则403/无新写；锁定cutoff并确认commit后发生的撤权不能把真实已入队ack改写成“从未登记”。后续读取仍必须当前授权，可能403。
5. source缺失/lease过期/其他holder/未来SimTime/stalehead/停止中的runtime → 原明确BLOCKED/REJECTED，无fallback source或lease takeover。UNKNOWN保留恢复流程，不自动reclaim另一holder。
6. FINAL生成只来自原atomic repository的真实durable receipt；投影由Worker publisher基于实际committed lineage和同head/fencing重新发布。读取API不更新投影，不从queue计数推断经济结果。

financial staged服务沿用原signature/approval/cutoff/原子enqueue；同request身份必须保持原intent、commandId、idempotencyKey。设计不扩大其Office actions、不增加LC/FX或其它经济family。

如后续组件采用 SECURITY DEFINER，仅是受限持久权限机制，不能当新的经济授权：任何新增/修改函数必须固定 search_path、schema-qualified 对象、无动态任意SQL、无 PUBLIC EXECUTE；使用受限非超级 owner，独立隔离数据库实际验证调用角色可做的最小操作与无权操作。intake 不能获得经济 posting/event/lease-grant 权限，reader 不能借函数升级为writer。锁顺序沿原 submission→lease/head→queue 与 cutoff 原语，不另建反序的source锁；原查询/原子函数的有效权限需审查，不凭 role 名字断言。此设计不创建或修改任何函数/owner/grant，不能授予 PUBLIC 或绕开现有生产发布链。

非激活 lease supervisor 可由负责窗口独立提出并审查，但本设计不改变生产调度 topology/时间规则，不增加第二 writer/publisher，不新增同源登录桥、Cookie、PKCE、代理cache或隔离环境。需要这类变化时须有权裁决，不能由本候选自动扩大。

## 6. exact idempotency 与只读恢复 DTO

Office request保持现有三层JSON与family payload，exact commandId/idempotencyKey/world/subject/actor/country/office/expectedversion绑定由原SQL/核心fingerprint核对。重复同intent沿用durable submittedAt/SimTime/actor/fingerprint，只有一次command/queue写；异intent、换身份或任一key冲突保持409。requestId只是transport关联，不是经济identity；自动生成新commandId“重试”禁止。

候选新公开transport文件：`packages/core/src/commands/authenticated-command-recovery-contract.ts`，只定义纯DTO。请求：

```ts
type RecoveryRequest = {
  schemaVersion: 'world-command-recovery-v1';
  requestId: string; // canonical UUID
  request: {
    worldId: string;
    commandId: string;
    idempotencyKey: string;
    originalRequest: AuthenticatedOfficeCommandRequestDto;
    knownCommandFingerprint?: string; // sha256; omission supports lost first ack
  };
};
type RecoveryResponse =
  | {
      schemaVersion: 'world-command-recovery-v1';
      requestId: string;
      ok: true;
      state: {
        status: 'QUEUED' | 'CLAIMED';
        commandType: ManualOfficeCommandFamily;
        commandId: string;
        idempotencyKey: string;
        commandFingerprint: string;
      };
    }
  | {
      schemaVersion: 'world-command-recovery-v1';
      requestId: string;
      ok: true;
      state: {
        status: 'FINAL';
        commandType: ManualOfficeCommandFamily;
        receipt: FinalReceiptWire;
      };
    }
  | {
      schemaVersion: 'world-command-recovery-v1';
      requestId: string;
      ok: false;
      error: {
        code:
          | 'NOT_FOUND'
          | 'AUTHENTICATION_REQUIRED'
          | 'AUTHENTICATION_INVALID'
          | 'CURRENT_SEAT_OR_ADMISSION_REQUIRED'
          | 'IDEMPOTENCY_CONFLICT'
          | 'INVALID_REQUEST'
          | 'REQUEST_TOO_LARGE'
          | 'BODY_TIMEOUT'
          | 'NOT_CONNECTED'
          | 'UPSTREAM_UNAVAILABLE'
          | 'CANCELLED';
        retryable: boolean;
      };
    };
type FinalReceiptWire = {
  source: 'DURABLE_FINAL_COMMAND_RECEIPT';
  schemaVersion: 'command-receipt-v2';
  worldId: string;
  commandId: string;
  idempotencyKey: string;
  commandFingerprint: string;
  outcome: 'COMMITTED' | 'REJECTED' | 'AUTHORIZATION_REVOKED';
  reasonCode: string | null;
  transitionId: string | null;
  worldVersionBefore: string | null;
  worldVersionAfter: string | null;
  simTime: string;
  eventIds: readonly string[];
  recordedAtReal: string;
};
```

`FinalReceiptWire` 精确复用已存在 receipt字段：source=`DURABLE_FINAL_COMMAND_RECEIPT`、schemaVersion=`command-receipt-v2`、worldId、commandId、idempotencyKey、commandFingerprint、outcome、reasonCode、transitionId、worldVersionBefore、worldVersionAfter、simTime（canonical string）、eventIds、recordedAtReal。outcome仍仅原 reader 支持的 `COMMITTED | REJECTED | AUTHORIZATION_REVOKED`；COMMITTED/非COMMITTED字段一致性沿用 `postgres-final-receipt-reader.ts:323–356`。commandType从actual submission取得并限定已支持family，不能任意string成功；最终DTO实现必须使用现有已实现family的字面量union。QUEUED/CLAIMED 只映射 durable PENDING/CLAIMED row，不声称 worker 正在执行或 lease 当前有效。

executor recovery用实际受限intake/read权限在一个subject-bound **READ ONLY** snapshot中连command_submission→command_queue/command_receipt，并验当前seat/admission/authscope/已知fingerprint。必须再以原 strict family parser 与 stored actor/submittedAt/SimTime 重建 originalRequest 所指 command 并比较 durable fingerprint/intent；不得因相同 IDs 就把别的 intent 的 FINAL 当作本次结果。原请求内 world/commandId/idempotencyKey 必须与外层一致，原 requestId 不参与经济身份；纯重建逻辑从原 intake 私有代码提取复用，不生成新时间/写入，不用新的宽松比较器。无rawSQL/新增grant，无insert/update/consume；intake role若没有所需只读权限就NOT_CONNECTED。receipt优先返回实际FINAL；无receipt但durable queue存在返回queue状态；无匹配记录才NOT_FOUND。NOT_FOUND是该snapshot的事实，不证明之前未写（仍可能有尚未settle的事务），客户端维持UNKNOWN、不自动重发。明确known fingerprint或original intent不符返回409。

它是新增明确的generic recovery协议，不能复用 `READ_FINAL_NARROW_TRANSFER_RECEIPT` 名字假装已覆盖manualOffice。原FINAL路径与parser保持。第一批只覆盖manual三family；financial保留原 READ/INSPECT 与既有 narrow FINAL，不因 Finance 能签名就开放另一 subject 的 Trade receipt。未登记intent阶段无伪造FINAL，自动shipment/delivery未证明用户scope时不开放。

## 7. 真实 session → server-owned seat endpoint 公共 DTO

新增候选 `packages/core/src/commands/authenticated-current-seat-contract.ts`；API handler复用真实JWT verifier与原subject-bound read-only provider。**请求没有countryId、officeId、seatRef、worldId或scopeKey**：

```ts
type CurrentSeatRequest = {
  schemaVersion: 'world-current-seat-v1';
  requestId: string;
};
type CurrentSeatResponse =
  | {
      schemaVersion: 'world-current-seat-v1';
      requestId: string;
      ok: true;
      session: {
        authSubjectId: string;
        issuedAtEpochSeconds: number;
        expiresAtEpochSeconds: number;
      };
      world: {
        worldId: string;
        seedRef: string;
        contentHash: string;
        admissionRef: string;
        minimumWorldVersion: string;
      };
      bindings: readonly FinancialIntakeBindingDto[];
    }
  | {
      schemaVersion: 'world-current-seat-v1';
      requestId: string;
      ok: false;
      error: {
        code:
          | 'AUTHENTICATION_REQUIRED'
          | 'AUTHENTICATION_INVALID'
          | 'CURRENT_SEAT_REQUIRED'
          | 'CURRENT_AUTHORIZATION_NOT_COHERENT'
          | 'READ_BINDING_UNAVAILABLE'
          | 'INVALID_REQUEST'
          | 'REQUEST_TOO_LARGE'
          | 'BODY_TIMEOUT'
          | 'NOT_CONNECTED'
          | 'UPSTREAM_UNAVAILABLE'
          | 'CANCELLED';
        retryable: boolean;
      };
    };
```

`FinancialIntakeBindingDto` 是现有纯公开type，精确含source/capability/seatRef/ACTIVE、identity（subject/world/country/office/scope/classification/revision/model/projectionVersion）、seed、readback；不是导入API server实现。bindings一至六项，officeId限定六Office、classification固定OFFICE_PRIVATE，按officeId排序、不得重复；subject/world/pins全一致且revision/current team/current country一致。真实multi-office在同country/team/revision下可返回多个绑定，浏览器只选择服务端已返回的项。

服务器先在一个coherent read-only snapshot按verifiedsubject+固定World枚举实际active授权/seat（非仅select第一行），确认没有跨country/team/revision冲突；每项通过 `RuntimeReadBindingStore.readCurrentSeatFrom` 与原fullprovider/实际admission/entitlement/current projection/head校验。scopeKey由服务器既有injective函数形成并由持久entitlement匹配，不能客户端推导。任何条目缺失或投影不是current head，整次失败而非补造seat/从lobby/mapping推断。原snapshot runner需增加固定current-seat枚举query/方法，不能变成通用rawSQL port，也不能串多个独立transaction声称同一snapshot。

session字段只来自**已验签**的原claims（identity.ts:12–17），不回传bearer，不mintsession credential，不把nonce/expiry當live-session权限。此接口证明“本次JWT有效且本次seat当前”，现有源代码没有服务器端即时logout/sessionrevocation reader，不能称已验证上游session持续存活。浏览器真实登录session的token refresh/logout/account switch必须使本地lifetime立即retire、清空private DOM并重新请求；每个command/read/recovery仍独立验证JWT/currentseat，前一份DTO不能授权下一次请求。若要求即时上游sessionrevocation，需负责身份的窗口另交真实受限session reader契约；本候选不读auth schema、不新增凭据或权限，也不以isCurrent() callback冒充该能力。

响应private/no-store，最多32KiB；无binding缓存成为authority。客户端endpoint/world/deployment pins由已审host配置固定，与DTO逐项匹配，响应不能选择新URL。sessionRef可由真实client lifetime管理，但仅用作失效关联；country/office必须逐项取自本DTO并由后续服务器再次判定。当前未部署这些路径，不能用stub结果接入正式登录。

两个新只读协议的 HTTP 映射固定为：200 成功，400 INVALID_REQUEST，413 REQUEST_TOO_LARGE，408 BODY_TIMEOUT，401 AUTHENTICATION_REQUIRED/INVALID，403 CURRENT_SEAT_REQUIRED/CURRENT_SEAT_OR_ADMISSION_REQUIRED，409 CURRENT_AUTHORIZATION_NOT_COHERENT/IDEMPOTENCY_CONFLICT，404 recovery NOT_FOUND，503 READ_BINDING_UNAVAILABLE/NOT_CONNECTED/UPSTREAM_UNAVAILABLE；有效连接上的 CANCELLED 可用499，断连不再写响应。definite拒绝 retryable:false；只读 upstream 暂不可用可 retryable:true，但不驱动命令重试。原 Office/financial routes 的已有状态码与错误含义不因此改写。

## 8. 实施切片、真实检查与评审停止点

B本轮需决定：A方案、上述固定public/internal contracts、production private registration/请求pool生命周期、UNKNOWN/drain语义、当前seat语义与限制是否可作为后续实施基线。D/E实际组件身份未冻结、正式pins/权限未提供是依赖，不在本文件里填READY。

| 次序 | 最小源码切片（需Root另授准确实施范围）                                                                             | 必要窄证据                                                                                                                                                                                        |
| ---- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | 固定forward adapter/internal Fetch handler、旧transport共同bounded reader、service completion/drain；默认null/HOLD | actual local Node socket→真实两handler/真实签名JWT；exact paths/CORS/bodylimit；默认无DB调用；deadline前无dispatch；dispatched后丢响应UNKNOWN；无日志bearer                                       |
| 2    | current-seat/recovery纯DTO、固定subject-bound SQL reader，复用原provider                                           | 一次性local/CI PG：真实currentseat/多office、跨country/revision冲突、revocation、admission/projection缺失、exactscope；recovery只读权限、真实queued/FINAL/NOT_FOUND及wrongsubject/key/fingerprint |
| 3    | D/E已审生产ports + 独立productionconstructor/private token/Worker lifecycle                                        | actual DB角色/来源检查，旧production env拒绝测试不退化，copiedtoken/另一pool/clock/world拒绝，缺source不写；不以fixturecarrier宣称正式准入                                                        |
| 4    | 真实productionintake composition接fixedfamilies，受控consumer与publisher分开                                       | local/CI PG真command+queue一次写、并发key冲突、实际COMMIT ackloss/UNKNOWN、sourcehead推进/撤权cutoff/fence过期与恢复、真实once消费FINAL与projection水位；包含停止和poolend失败                    |
| 5    | 未挂载的两个isolate workerd bundle/harness                                                                         | 真实servicebinding传原件/二次JWT/currentauth、不同isolate token不跨传、有限connection/真实cancel/drain；生成向量仅证明机制，明确无正式包/生产验收                                                 |

每切片跑适用build/types/lint/format/boundary和相应一次定向真实检查；失败/UNKNOWN原样保留后修复，不把full/native/420作为反复证据。代码必须在固定SHA/tree与全部必要结果后交非实现者独审，设计批准不允许自批P0/merge/dependency整合。实际正式source接线只有B批准设计且Root明确授权依赖实现后才开始；云端mount/deploy/DB发布/正式开局/Clock或经济启动均在本轮外。

本设计验证只做源码/构建边界读取、固定身份检查、文档格式与diff检查；机制测试 **NOT_RUN**。无持久凭据/权限/数据或产品代码改动。完成设计固定hash回传Root，然后STOP等待独审与准确implementation允许。
