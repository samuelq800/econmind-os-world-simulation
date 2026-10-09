# C — 显式共享浏览器会话接线

状态：`IMPLEMENTED_UNVERIFIED`。`SOURCE_ONLY`。等待 Root/F 独立窄审；未自批、未合并、未发布或启用世界。

## 固定来源与所有权

- Base：`96217db583db4c1bd6ef74714b2e0a5ef6b7ed6d`。
- Base tree：`f605d1a21899a18636e62ebcb8bec69cd39cd3ac`。
- Implementation：`2614b01cbb6755f8b12bc48ab63ee02e60d8e21d`。
- Implementation tree：`b6c939fa97e8d15a688b1f39f836e8ce0b4c4075`。
- Branch：`codex/c-browser-trusted-host`。
- Worktree：`/Users/samuel/Documents/econclub/.econmind-worktrees/c-browser-trusted-host`。
- 本报告单独提交；最终提交/tree、报告与源码指纹在外部 `artifacts/C_TRUSTED_HOST_SOURCE_ONLY_2026_10_09/FREEZE.json` 固定，避免自引用。

Root 授权范围：新增 `apps/world-web/src/trusted-host/session.ts`、`bootstrap.ts`；`country-runtime/entry.ts` 薄安装；两个现有 view 的薄订阅出口；专用测试/严格配置/DOM helper/报告。随后明确增加 `financial-intake/view.ts` 的关闭态隐私清理修复。没有改现有 controller/client/authority parser、Worker/API、经济规则、SQL、source/admission、地图、mapping 或 country-game 原件。

## 接线与边界

现有三个 API 保留，新增 `window.EconMindTrustedHost`，在现有 `econmind-country-runtime-ready` 事件前安装。不自动发现配置，不读取 URL、storage 或 VITE 凭据，不发送启动请求。

调用次序只使用已有的 host-owned 值：

```ts
const host = window.EconMindTrustedHost;
host?.configureTargets(existingHostOwnedFixedTargets);
host?.connect({
  projection: existingOfficeProjectionBinding,
  // 只有已有原始请求时才提供，不由 UI 生成。
  financial: existingFinancialIntakeBinding,
});
```

`configureTargets` 每次安装只能成功固定一次。读取与金融 origin 可以分别固定；路径与 deploymentRef 精确匹配，不能通过后续配置替换目标。所有字符串仅为配置一致性输入，不是批准、seat 或身份凭证。

`connect` 先断开全部消费者。复用 `ProductionReadConfig`、`OfficeProjectionBinding`、`FinancialIntakeBinding` 和既有 identity/token/session 回调。金融绑定必须与读取绑定一致，包括身份、world pins、seat、目标读取接口、视图与会话回调；金融目标独立固定。已有原件使用既有 `exactJson` 脱离调用者对象后交给既有 controller，不创建 draft、签名、approval、command/FINAL 或重试替代物。

缺必要配置、seat/pins/身份/会话/视图不匹配或非法原件时保持断开，零网络请求。配置通过只返回 `SOURCE_ONLY / SESSION_CONFIGURED`；真实读取仍为 `NOT_CONNECTED`，直到既有 client 解析并核对服务端 authority、ACTIVE seat、admission 与 readback。绑定字符串本身不能使读取成功。

读取/INSPECT/提交仍由既有用户按钮发起。接线不会自动读、INSPECT、submit、replay 或启动 Clock。`UNKNOWN`、queued≠FINAL、既有最小 readback floor、缺值/null 与六职位能力边界保持原样。

`CountryRuntime` 仍只是 local Trade staged-reservation，接线仅对它调用 disconnect；没有挪用或放宽 local gate。既有 direct APIs 仍存在，本新增 API 不是浏览器安全沙箱；所有真实请求仍由既有 server-authority/SQL 边界约束。

## 生命周期与小 delta

共享会话复制固定 pins，持有不可复活的 retirement latch；包装 currentIdentity、getAccessToken、session.isCurrent/onInvalidate。host invalidation、身份/revision/session/view loss、pagehide、缺失 token 或真实消费者 DENIED 统一断开两边。迟到 token/body/响应/金融回调不能恢复已清理数据。每个成功尝试的 host sessionRef 在该安装中只能使用一次；显式重新绑定必须由 host 提供新的 sessionRef，不由浏览器生成。epoch 和 session 对象检查隔离旧回调与新显式会话。

两个 view 的订阅出口只转发既有 controller.subscribe 通知，跨显式 controller replacement 保持订阅。没有 busy loop/state timer。共享 DENIED 测试不轮询 host.getState，而是观察另一真实消费者已清空，证明通知自行广播。

金融 view 原有关闭态 early return 会保留旧 private DOM。最小修复在 closed early return 前检查失效原件：没有 request 时清空该 additive drawer；仍有效的普通 close 保持既有行为并可重开。没有改布局、原 country 页面或其它 DOM。bootstrap 不承担独立 view 的 DOM 修复兜底。

## 实际验证

环境：Node `24.20.0`、pnpm `12.3.4`；本独立工作树 frozen lockfile 安装；无数据库配置、未链接 Supabase。测试使用实际安装函数/view/controller/client，加专用 `OFFLINE TEST_ONLY` DOM contract double 和拦截传输。不是 native browser、生产连接、真实 seat、实际写入、经济闭环或 Gate B 证据。

最终定向命令：

```sh
pnpm exec vitest run tests/world-web/trusted-host-session.test.ts tests/world-web/trusted-host-financial-privacy.test.ts tests/world-web/production-read-client.test.ts tests/world-web/office-projection.test.ts tests/world-web/office-projection-denied.test.ts tests/world-web/office-projection-closed-drawer.test.ts tests/world-web/financial-intake.test.ts tests/world-web/trusted-country-runtime.test.ts --pool=threads
```

结果：exit `0`，8 files、206 tests PASS。新增 shared-host 35 + direct closed Financial 4；既有回归 167。覆盖六职位读取、缺绑定/非法原件零请求、分别 pinned origins、真实 authority 不成立、两侧 HTTP DENIED、内嵌 FINAL 拒绝、closed private DOM、host/country/role/identity/pagehide retirement、旧 session ABA、迟到 token/body/response/intake、新显式会话隔离和 UNKNOWN 不自动重放。

其余最终命令均 exit `0`：

- `pnpm --filter @econmind/core build`。
- `pnpm --filter @econmind/world-worker build`：只生成本地依赖输出，不改 Worker source，不启动执行。
- `pnpm exec tsc --noEmit -p tests/world-web/trusted-host-session.tsconfig.json`：严格检查，`skipLibCheck: false`。
- `pnpm --filter @econmind/world-web typecheck`。
- `pnpm exec eslint`：本轮 5 个源码文件与 3 个专用 TS 测试/helper。
- `pnpm exec prettier --check`：本轮源码/测试/strict config。
- `node scripts/check-boundaries.mjs`：304 files PASS。
- `node scripts/check-authoritative-patterns.mjs`：299 files / 89 Core files PASS。
- `ECONMIND_ENV=local node scripts/assert-safe-environment.mjs`：databaseConfigured false、NOT_LINKED、databaseMutationAllowed false。
- `node scripts/check-repository-secrets.mjs`：2227 files PASS（添加本报告前）。
- `git diff --check`。
- `pnpm --filter @econmind/world-web exec vite build --logLevel warn`：源码 bundle PASS。没有运行地图/UI publication scripts；不是完整 web publication 或 Pages deploy。保留现有 missing shared CSS 与 large chunk warning，未扩 scope 修复。

最终源码 bundle：`apps/world-web/dist/country-runtime-entry.js`，68682 bytes，SHA-256 `ade80547134afc168a205bdfa0f9ab57a349063d5a8aa85f66966bff06ee1947`；含 `EconMindTrustedHost` 与原 ready event。dist 未提交。

## 原始失败保留

1. 首轮 shared-host 31 tests PASS；扩为 35 时原件 byte assertion 34 PASS / 1 FAIL（exit 1）。测试错误地用 JSON.stringify 的插入顺序作为期望，而现有原件流程使用 `exactJson` canonical key 顺序。改为既有 exactJson 原件期望后 35 PASS，未改生产原件转换或放宽值/ID 断言。
2. 未构建 Worker 依赖输出时，boundary checker exit 1：7 个既有 API→Worker export 无法解析。补本地 Worker build 后同一边界命令 PASS，未改任何 import、ownership 规则或 Worker source。
3. 独立 direct Financial closed revoke/disconnect/roleloss 复现：4 tests，3 FAIL / 1 PASS，exit 1；失效后仍有 14 个子节点。这些测试未安装 bootstrap、失效后未重开抽屉或轮询状态。源码最小修复后 4 PASS；没有把历史 FAIL 改记为首次通过。
4. app create_worktree 未找到固定 ref；改用实际 World repository 的 git worktree add，从 exact base 建立上述独立分支。没有修改原 checkout 或他人 worktree。

## 待独审与外部条件

Root/F 需审固定 source-only patch、共享拒绝与 lifetime fence、两个薄订阅 delta、独立关闭态隐私修复及失败记录。C 不自批 P0、不自行合并/部署、不自派下一任务。

真实 auth provider/seat、批准 HTTPS deployment、完整 opening/admission/readback、服务端数据库/Worker/Clock、管理员授权和真实闭环均由现有对应 owner/发布链承担。本轮没有等待或创造新 server DTO，也不以 fixture 代替这些条件。production/native browser/SQL/420 online acceptance/full pnpm check/publication/Gate B 均 `NOT_RUN`。
