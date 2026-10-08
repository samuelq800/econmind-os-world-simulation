# World V2 正式发布版推进记录

日期：2026-10-08，Asia/Shanghai。范围：
`samuelq800/econmind-os-world-simulation` 正式源码与发布链，不修改旧站。
Owner 最新指令：停止维护本地预览，直接修正式发布版。现有用户预览服务不被关闭；
不新增、恢复或修理 DEMO_LOCAL、local-demo 或 preview 展示分支。
正式代码的隔离回归仍是验证，不是预览建设。

## 已确认的 main 与待合并候选

本记录创建时，实际 main 仍为
`ead5636a1c871e3a4d7f0d81518125f99fb5730b`（PR113）。
运行时候选 PR115 的固定 head 为
`bf2fa0556eec59ccc5bd566496340e966c5b5c36`，tree
`240d3257d58ff0c56348a9a6899eb185c64d53b0`。
它与 main 的 SQL、migration manifest 和 policy 字节一致；不包含 F0023。
Provider 的 trusted-country-runtime `37646459126` 和 atlas-candidate
`37646459089` 已 SUCCESS，均 no-deploy。源码 CI 不是数据库启用或正式部署。

该候选新增 Social/CB source-to-Draft、稀疏 CAS、分类私有读取及页面消费，
各敏感增量均已有独立 source-only 审查。C 的编译模块身份修复 named closure
也已独立通过：31 项默认测试通过，31 个原断言不变；原 26PASS/5FAIL 保留。
这不提供缺失的 Social admitted operating opening carrier。

## 一次完整检查揭示的剩余修复

固定 bf 候选，Node24.20.0、pnpm12.3.4。整轮 lint、format、typecheck 和
Core/Worker/API pretest build 均 exit0。默认 Vitest 实际结果：
**2523PASS、2FAIL、139SKIP**，220 passed files、2 failed files、15 skipped files；
13:11:29 开始，702.48 秒，exit1。因此 **完整 pnpm check 是 FAIL**，不是通过。
以下后续检查需分开记录，不倒改原退出码。

Root 随后只补跑原脚本尚未到达的尾段，未重复整轮测试：official edge 29PASS、
boundaries 34PASS、AST/边界/environment/foundation/secrets exit0；旧22制品的
migration validate 与两次 PGlite rehearsal PASS；balanced candidate 与正式 UI
发布源检查 PASS；完整 workspace build exit0。build 明确
`officialSourceRead=NOT_CONFIGURED`、`liveWorldState=false`、`deploymentVerified=false`，
地图制品 203 项、静态输出约 938MB，未发布服务器或经济世界。
这些尾段通过不能把上面的完整检查 FAIL 改成 PASS。

两个失败交由 A 在新固定候选仅修测试兼容，不放宽实现、权限或披露：

- `tests/integration/staged-narrow-transfer-http.test.ts` 的旧 COUNTRY 断言期待
  Trade 原始库存分录。新分类契约合法 withheld 返回空数组；必须仍验证真实
  SQL Worker 库存、watermark、COMMITTED/FINAL 和生命周期，不以测试改动抹掉经济断言。
- `tests/integration/world-api-authenticated-read-boundary.test.ts` 的旧 COUNTRY
  fixture 只有 `{status: READY}`，不符合当前 classified activity payload。
  必须使用真实公开契约并保留 verified JWT subject 查询断言及拒绝路径。

在修复及相关回归通过前，PR115 不合并。未开始无意义地重跑全部 2523 项。

### 13:39 正式发布候选增量收口

上述两处旧测试已修复：A 原始固定候选 `3416a641135c220372351e35548957f8492aa278`，
仅两测试及报告；原 SQL 2/2 库存、守恒、JWT subject、COMMITTED/FINAL 和幂等断言
未改。增加缺 visibility 与 denied-marker 携带 raw inventory 两个拒绝控制；
policy 类型使用实际 API 公共类型，保留 timeout=1 负例。生产者 30PASS。
Root 重放 `8f93a82` 并在真实 G+D 组合上运行这两文件及原 CI prerequisites：
**32PASS**，13:35:12，4.93 秒，exit0。原 bf 的完整检查 FAIL 保留；未声称新候选
已重复全量通过。这使原两项已知失败成为已修复历史，而非静默忽略。

D811 已获 B 独立 source-only 批准：45 consumer 回归及四个独立契约/渲染控制通过，
真实公共 G 合同 hash 匹配；没有 server→在线浏览器验收。Root 重放 `7cc2722`，
四个正式 browser 文件及直接测试字节与原 D 候选一致；新消费者和原披露控制
**45PASS**（13:31:48），strict web/direct types、lint、AST/import boundaries exit0。
G 两个 API 实现、publisher 与纯公开合同与独审 `2711a54` 字节一致，既有 Core
公共出口保留，新增两个财务公开出口。

代码/工具链候选 `07434d467e75424222a3871cc249d8d2b3a82ca7`，tree
`a51468255b52988e8c9bc8ccaa3a52a50b8e1230`，仍不包含 F0023。
正式新 web build exit0，203 地图制品、741 静态输出文件、937628391 bytes，
运行连接与部署状态仍明确 false。CI 新增 actual financial position/read regressions，
Core/Worker/API 构建在测试之前，contents:read/no-deploy 不变。

Root 还修复正式 Pages 全新环境缺 Core dist 的构建顺序：发布 workflow 先构建
纯 Core 合同再编译网页，Core 路径触发更新；没有 database/seed/server 启用步骤。
原两条 no-deploy 构建顺序回归不变，新增 Pages 控制，**3PASS**，13:39:00，exit0；
lint/format/diff exit0。首次新增测试的 Prettier FAIL 已格式修复，未变更语义。
此增量属于非权威 CI/tooling，按 Owner 正常发布授权处理，不改变 P0 经济或权限。
新 provider CI、main merge、Pages 实际发布结果必须另外回读，不能复用 bf 的绿灯。

## 正式财务读取与页面消费

G 的固定原始增量 `41559a3` 重放真实 admitted opening + Posting，输出
`authoritativeFinancialPosition`；分录净变动是另一个字段，不能当作余额或可花现金。
B 对 415 的初审发现真实 MAJOR：缓存 seed/hash 没有绑定当前 persisted admission。
原 CHANGES_REQUIRED 保留。

G 修复 `2711a54f064193ff542154f4b39c7e67350aa5c4` 已独立 source-only 批准：
同一实际读取快照的 subject/world/class/scope/seedRef/contentHash/head version/event
在服务端绑定，缺失、错误或异常上下文拒绝且不泄漏绑定元数据。
独立证据为实际 9 项 SQL/role/PGlite 读取链，不是 native 或正式账号验收。
未知源、未授权 Office、COUNTRY 明细均不补零、不授予。

Root 将 415+271 重放到独立正式整合分支
`codex/opening-position-reviewed-integration`，不改正在验证的固定运行时候选。
重放 tip `4de6b5d` 的 Core/Worker/API build exit0；实际绑定、SQL adapter、
publisher 及公共出口四文件 47PASS，13:28:16 开始，38.06 秒。
这尚未包含 D 当前财务头寸消费者，不代表整个新组合完成。
D 的正式 `apps/world-web` 消费候选
`811ebe74bcfae6940aed3f0745f2d4328ff8f6b3` 仍等待 B 窄审；它严格区分当前
财务头寸与分录变动，拒绝错误 seed/head、撤权及迟到的旧角色/国家响应。
原 45 项生产者回归与 TEST_ONLY 浏览器证据不等于独立批准或全部在线页面验收。

## 实际联合链与其他施工

C 的 O 联合测试最终报告候选
`65b93a127126f7747183d630a4c57341d5b894d2`（测试固定在 `33f60a5`）
实际第三次独占空库 PostgreSQL16.15 运行 **1PASS/0FAIL、3.41 秒**，
2026-10-08 05:08:39 UTC。前两次 FAIL 保留。
JWT/三签/一次排队、Reserve/Ship/Deliver、开局计入后的 2/8GCU 和 2tonne、
version/event3、真实 COMMITTED/FINAL 与撤权均执行。Office/Country 明细正确
withheld；同一用户两个 Office 的 COUNTRY 身份歧义明确拒绝，不任择一个职位。
这是 TEST_ONLY 机制证明，不是 official Finance carrier、新绝对余额正向读取或上线。
该测试兼容增量仍待独立窄审。

G 新统一 Office 命令入口候选
`73c834b09b9cfaef42275c9baa16e7a649ae0e38` 以真实 JWT、persisted binding、
同事务当前 capability/seat/admission/head 和 Core 严格 parser 验证 Captain、CB、
Social Plan。实际领域 source/sole dispatcher 缺失时在写入前精确
`SOURCE_RUNTIME_UNAVAILABLE`，提交/队列零效应。生产者 115PASS/8SKIP，
独立审查 PENDING；不能把安全拒绝称作三个职位已执行闭环。
E 在构建 Captain source-to-AtomicDraft；不制造新的 genesis 或第二份权威状态。

E 随后冻结 source-to-Draft 四文件候选 `85e62917678b14b59f295d631a5cc04b2734d0b8`，
tree `dd90d30d5ec8795963f12df48e4fef9568f2af48`；实际新18和旧27分次通过，
没有真实数据库提交/完整历史源重放。已交 C 独立窄审，尚未整合或批准。
G73c834 的新 read-only source-blocked 命令入口已交 F 独立窄审，尚未整合或批准。
不因窗口交付而把两项新的 P0 IMPLEMENTED_UNVERIFIED 改成 VERIFIED。

E 的固定源审计确认本次原始规范与选定平衡包没有政治资本开局余额/生成函数：
`MISSING_GENESIS_INPUT_IN_FIXED_SOURCES`。七分桶规则和守恒已知，但不能把
物理 openingCapital、首都坐标、TEST_ONLY 90/100 或均分值作为官方政治资本。
这个结论仅覆盖固定源，不声称所有外部资料都不存在。

## Schema、启用和仍未完成的边界

PR114 独立保留 F0023/schema 候选。A 的 rehearsal 过滤索引修复
`7461a053a74131fcc8273a8ac981e28b510ca03c` 经 F 独立窄审通过：
12 项回归及两次串行 PGlite 演练通过，逐行 ID/hash/source/original order 绑定，
Storage、shared-schema、原始20/21 staging 门控不变。只批准 source-only 修复；
**CALLER_READINESS=NOT_READY**，不启用 SchemaAdmitted，不执行生产 SQL。
F 不是审查其自己编写的 0023 SQL；原 schema 审查证据独立保留。
该 source-only 修复已正常 fast-forward/push 至原 PR114 分支，provider 回读 head
为 `7461a05`、仍 draft；不是 main merge、SQL 发布或旧 CI FAIL 改判。

真实完整金融开局、Social operating carrier、政治资本 genesis、合法身份/当前席位、
四 Office sole-consumer/自动调度/真实领域写入仍有具体源或代码缺口。
地图、气候、矿产、基建及已合并容量数据保留；容量不是产出、雇佣、交付或付款。
没有新做 70国×6职位完整在线功能/视觉验收，也没有启动正式模拟。

Owner 已授权正常安全 main 发布；P0 固定补丁独审和实际失败修复仍保留。
D05 host/生产启用仍明确 deferred。旧站 public/auth/storage 不修改，数据库只走
既定唯一发布链。`status/progress.json` 的 PLANNED/PENDING/next_step_ready=false
不被源码 CI、隔离测试或 main 合并偷偷改成 Gate B 通过。
