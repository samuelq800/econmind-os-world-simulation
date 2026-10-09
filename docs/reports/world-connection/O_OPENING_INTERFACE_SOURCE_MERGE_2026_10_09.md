# 开局包与接口准备：源码合并交接

2026-10-09，Asia/Shanghai。结论：本轮显式接口准备代码已合并，生产未连接、经济未启用。
这是源码交付回执，不是正式开局数据写入或 Gate B 批准。

## 固定合并及适用检查

- PR125：https://github.com/samuelq800/econmind-os-world-simulation/pull/125
- final candidate：`a435a31466eec5ed52478e75ef9c4c5cfd189f55`
- 实际CI checkout：`85cdcde6272f79caf502542ad7136c3dba955099`
- 正常merge main：`56cdcfa9573464c64c7368571dea7c6abb8ffa24`，2026-10-09 14:40:52 北京时间。
- 三者完整tree均`69381337f3fe8aab845e761a79a6b8a0e7159bee`，Root已fetch/diff核实。
- trusted runtime `37893770119`、atlas `37893770112`均SUCCESS。
- 实际provider新增composition step：4文件64PASS/0FAIL/0SKIP，25.56s；three config检查执行。
- Root先前本地组合含CI prerequisites为71PASS，25.48s；不是另一次完整pnpm check。

## 独审范围与原始限制

三份最终报告均由Root实际读取并核对SHA256；实现原件到组合不变。

| 独审       | 固定范围                                                | 最终报告SHA256                                                   |
| ---------- | ------------------------------------------------------- | ---------------------------------------------------------------- |
| B APPROVED | A49e8359a五文件 +Root a435a31来源/CI组合及报告修正      | 424e698ca608487f6db86b8126cf121b7d4244dfe39b9647ba03c762a4ee2a0a |
| F APPROVED | Cd9313b5十文件trusted browser与Financial closed私密清理 | 3ec9fbb85031ba4edd251d30b84f55e8e212c9477956776404d44df611e1f283 |
| E APPROVED | G89ae38a五文件explicit API host                         | 8a934b37a8e95c43a44f5e7bc19451c047b0112f75e8c4e5e254d511f4269cc0 |

B独立14PASS；F首次38PASS/1timeout，原因UNKNOWN，原pool和threads各单例PASS，
不称F独立聚合39/206全绿；E独立11PASS及另ownership control1PASS。
E观察到matrix/build实际完成，但完整raw JSON未留存，仅明确标记transcribed summary。
各producer/reviewer历史FAIL、timeout及修后结果保留在原独审/实现报告，未删断言、放大timeout或skip。
G config继承既有skipLibCheck=true，vendor声明NOT_CHECKED；A无skip、C明确false。
Root曾错误声称三者无skip，B指出后仅修正报告，未改任何实现/config/test/CI。
SOURCE_ONLY边界仍为高影响人工决定范围；最终由Root按Owner授权正常合并，不是自动合并。

## 接入点及提供方责任

### 1. 权威开局包：先读原件与预检，不直接写库

入口位于Worker preparation：
`OfficialOpeningBundleLoader({repositoryRoot, incoming?}).load()` →
`preflightOfficialOpeningBundle(loaded)`。

`repositoryRoot`必须是服务端保管、不可被不可信上传者并发改写的真实目录。
原93文件/34JSON的固定来源与hash不变；不是任意上传JSON均可使用。
`incoming`由受审服务端配置提供decision/assembly各自`sha256,bytes`、
`ownerRecords[{recordId,reference,identity:{sha256,bytes}}]`及`expectedBundleSha256`。
文件固定为`incoming/decision.json`、`incoming/assembly.json`及
`incoming/owner-records/<recordId>.json`；禁止调用者自带路径/READY替代来源。
没有真实decision/assembly时保持缺失，不能把既有Owner subset receipt当完整新decision。

loader读原字节、完整集合、UTF8、路径、大小/hash及digest；preflight复用既有验证器。
当前真实输入结果PREFLIGHT_BLOCKED，seed/World为空；成功seed分支未实测。
本入口不调用DB/bootstrap/publisher。真实兼容seed完成独审后，才另走既有
`OfficialWorldOpeningBootstrapper.bootstrap`及`WorldOpeningBootstrapReadback.bootstrapAndReadback`，
由唯一批准的发布/写入路径执行并读回，不由此工厂自动触发。

### 2. API：显式挂载，不自动启动

`createNonactivatedRuntimeApiHost(input).handle(request,response)`复用原read/Financial/Office服务。
两条read path来自批准的endpoint pins；intake固定`/v1/financial-intake`及`/v1/office-command`。
实际World/seed/hash/admission/version、auth项目/issuer/JWKS/audience与ports必须一致。
public/lobby/health仍由原router管理；无配置默认不接入命令。
没有listen/TLS/部署、生产consumer或Clock启动。原private runtime要求真实同pool/clock/World，
local/CI与production guards未松，外部Worker不能仅靠URL/JSON/READY替代真实构造。

### 3. 浏览器：可信会话连接现有bindings

现有`econmind-country-runtime-ready`事件后使用`window.EconMindTrustedHost`：
显式`configureTargets`成功pin一次，然后`connect(existingBindings)`。
read和Financial origin各自独立固定；须提供真实token/current identity/session/seat/World bindings。
Financial可选且必须使用已有原始request，不生成draft、自动submit或重放UNKNOWN。
六Office读取保持；Financial动作仍仅Finance/Trade，其他四Office的通用命令/FINAL不由此wrapper补齐。
撤权、DENIED、身份/国家/职位变更、断开与pagehide统一退休；迟到响应不复活。
失效时包括关闭抽屉的私密DOM也清除，有效普通close/reopen不当作撤权。

## 真实剩余条件

正式LC/FX的rate/version/valueDate/字段币种以及完整央行持仓/claim/counterparty来源契约仍缺，
对应正式producer尚未接通；这不是只有外部数值等待。既有Core支持多币种batch，
但旧单GCU bridge与TEST_ONLY FX/CB机制不能通过改标签、默认FX=1或未知持仓填0升级。
取得真实契约后还需窄producer工程与独审，然后完成唯一schema publisher、正式seed/admission、
lawful seats、实际host/Worker连接和数字变化→FINAL→授权读回验证。

无生产SQL/写库/开局admission、engine/Clock启动、420在线视图或完整经济验收。
source merge、静态Pages发布和生产API部署是不同状态；Pages完成须另有对应run。
Gate B、worldId、seed、Worker激活状态均未改，正式经济仍NOT_ACTIVATED。
