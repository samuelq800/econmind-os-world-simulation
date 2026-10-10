# G executor intake 切片 1/2 固定实施交接

日期：2026-10-10（Asia/Shanghai）。状态：**IMPLEMENTED_UNVERIFIED / P0 / 等待非实施者独审**。

本交接完成已授权的未挂载机制准备；不将设计批准、fixture、Node socket 或本地通过改称正式准入、生产可用或 Gate 通过。

## 不可变目标

- base：`42991acfee9d0eacc702ba47a380c938a4516f03`，tree：`1254c4144279717c9075e9bbf07b4b2ac4710558`。
- design/parent：`f19e8bad4983ae0cd247182b8ce9a0f74315a03d`，tree：`a44880f4f02458be50046e7a54c0426cb0896c5a`。
- B 设计审查 SHA256：`70680ef80cfabfb8d778e8d92c1ef5d45976ad8e67cce2395cddfb032b23ad13`；结论仅为切片 1/2 的 DESIGN_ONLY_APPROVED_WITH_BOUNDARIES。
- **代码候选：`89c4446722a22b990c410dbc5726eb1a1208fd1a`，tree：`1c645b99de2cd3f608d7ebc980a2780aba320e29`。**
- 分支：`codex/g-executor-slices-1-2-20261010`；工作树：`/Users/samuel/Documents/econclub/.econmind-worktrees/g-nonactivated-runtime-api-host`。
- 代码提交准确包含 25 文件（19 产品 / 6 测试与 support）、4296 insertions / 141 deletions。逐文件 SHA256 与 byte length 见 SLICES_1_2_EVIDENCE.json；已逐一验证工作文件等于该 commit 的 Git bytes。证据随后单独提交，不能把证据提交误当另一套产品代码。

## 实现与边界

固定 Fetch forwarding adapter 仅处理 Office、financial、manual recovery 三条精确路径；默认 null/无效 pins 保持 NOT_CONNECTED、零 body/JWKS/SQL/dispatch。它先验证真实签名 JWT 和原 strict transport parser，再将原始 bytes 与 bearer 交固定 service binding；不转发 cookie、actor、客户端 deadline、pool、source、role 或 READY。没有 redirect、任意目标或 executor global-fetch fallback。内部 handler 重新验 JWT、解析并调用既有服务；原私有 runtime / pool / clock identity、local/CI / production-config guard 均保留。请求 context 只用一次，必须拥有实际 read/writer pools。

外部起点共用 10s deadline，body reader 有 5s 上限，内部取最早 deadline。dispatch 前失败不调用写服务；可能写入的 dispatch 后，丢失、无效、截断、超限或重定向响应保留 WRITE_OUTCOME_UNKNOWN，零自动 replay。严格校验响应身份、schema、queue/receipt 一致性与 financial authority pins；原 financial UNKNOWN 原样保留，包括既有 retryable 字段的语义，转发器不据此自动重试。

server-only completion scope 追踪实际 execute、JWKS fetch/body/read/cancel、晚到 connect、snapshot 查询/rollback，以及 owned Pool.end。先等真实 settle，再结束池；不是只 await handle 的 race。无效/超限 upstream body 也必须 cancel/drain。5s cleanup tail 超限或关闭失败返回 uncertainty；不伪报清理成功。真正永不 settle 的 port 不支持启用，本交接没有声称这种 port 也有硬有限返回保证。

current-seat 请求只有 schema/requestId，无 World/country/Office/seat selector。World 固定于 server pins，subject 来自已验签 JWT；在同一个 REPEATABLE READ READ ONLY transaction 枚举全部 active authorization，再逐项复用原 persisted seat/admission hydration。跨 country/team/revision、缺 seat/entitlement/admission、滞后 projection、当前 head 不符都 fail closed；相同 Office 的多个 capability 不复制 binding。原 selector reader 的兼容语义保留。

recovery 只支持原三种 manual Office family。在同一只读 snapshot 验全部当前 Office bindings、World/model/seed/admission pins，再读取 subject-bound submission。复用从原 intake 提取的 strict canonical/family intent 与 fingerprint 重建，保留原 actor / submittedAt / SimTime / correlation。双 key、known fingerprint 或原 intent 不符返回 409；实际 queue 与原 FINAL mapper 不一致不返回结果。权限不足保持 NOT_CONNECTED，不补 grant 或借 writer。NOT_FOUND 不解除原 UNKNOWN、不消费或重发。旧 narrow FINAL 文件、名称与协议未改。

## 实际验证

所有命令、exit code 与完整已捕获最终 stdout/stderr 均在 JSON 和 slices-1-2-checks/*.txt 中。固定 Node 24.20.0 / pnpm 12.3.4。

| 检查                                                      | 实际结果                                                                                                                                                                                   |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 新机制窄测试                                              | 37/37 PASS，3 文件；另有真实 Node timer 2/2 PASS，共 39 项                                                                                                                                 |
| 其中一次测试进程拥有的 native PG16 场景                   | 22/22 PASS；包含受限角色、单只读 snapshot、当前权限/多 Office、三 family queue/FINAL、未提交记录 NOT_FOUND、真实金融 SQL/ack-loss UNKNOWN、native pg_sleep rejection/client close/Pool.end |
| 既有 Office/JWKS/read/aggregate 回归                      | 140/140 PASS，5 文件                                                                                                                                                                       |
| 既有 native financial rollback uncertainty 回归           | 8/8 PASS                                                                                                                                                                                   |
| boundary/foundation 测试与两项静态扫描                    | 40/40 PASS，violations=[]                                                                                                                                                                  |
| 专用 strict、Core/Worker/API typecheck 与 build           | exit 0                                                                                                                                                                                     |
| 修改范围 lint / Prettier、secret、environment、diff check | exit 0；environment NOT_LINKED / databaseConfigured=false                                                                                                                                  |

真实双 Node loopback socket 使用两个真实 handler 与真实 ES256 JWT，验证 raw bytes/bearer/header allowlist/fixed target；第二端改签名被拒、零 SQL。正向 manual 用原真实私有 local/CI consumer 与 SQL source fixture，非 positive readiness callback。实际 source 迟到 settle、JWKS fetch/body cancel、晚到 connect、rollback 与 end 失败均有检查。真实 5s body timer 在 JWT/SQL/dispatch 前停止；真实 10s 请求预算触发后等到有限的迟到 source 完成，5s cleanup tail 内返回 UNKNOWN 且零 enqueue/replay。

本地 native 使用旧 TEST_ONLY fixture 拥有的临时 PG16 cluster、private Unix socket、TCP disabled，无 env DSN/linked Supabase。测试 setup 的 isolated admission veto bypass、local grants、queue/receipt/lease rows 只为机制检查；只读操作前后 footprint 不变且 reader INSERT 被 42501 拒绝。这不证明正式 genesis/admission、native authoritative manual source、生产 registry、经济 settlement 或 activation。

## 保留的失败与限制

早期 native 19 项曾 14 PASS / 5 FAIL：一个新 fixture 把同 Office 多 capability 错当重复 assignment，三个 CLAIM fixture 未获得实际 writer lease；另一个揭示 recovery 漏验其他 Office 缺 seat，已修为同 snapshot 全量水合。后续 ack-loss fixture 曾在更早 authorization COMMIT 注错（UNKNOWN、零 submission），已限定实际 submission 写入。随后一次 Pool.connect/client.query monkeypatch 测试超时并导致 afterAll database-in-use；精确原因未确立，已退役该 instrumentation，改为显式 adapter 包装真实 owned native Pool，增加防御清理，精确 stopped/removed 自有临时 cluster。最终对应真实 ack-loss/Pool.end 场景 PASS；不据此声称任意驱动不会 stall。

构建/strict 的早期 import、brand/null、未使用项、标点与 absent upstream 诊断也保留在证据历史。最终通过没有删除这些失败事实，没有关闭独审发现或自授 VERIFIED。

10s/5s 的本地真实 timer、有限故障和实际 completion 已验证；平台 workerd/service-binding request lifetime、任意 never-settling port、隐藏 source pool ownership 与生产构造仍未被证明。所有额外 source pools 必须由后续受审构造明确纳入 owned inventory；本 transport shell 不猜测 Worker 私有数据库所有权。current-seat 不提供上游即时 session revocation。

## 停止点

切片 3/4 **HOLD**；切片 5 平台测试与挂载 **NOT_RUN**。Cloudflare entry/config、旧 HOLD entry、public/auth/storage、数据库 schema/grants/release、status/gate、workflow/pins 均未修改。full/420 suite、CI、生产请求、DDL promotion、正式输入 admission、部署/挂载、Clock/consumer 激活、merge/push 均未执行。等待 Root 将以上固定代码候选交非实施者独审。
