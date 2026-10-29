# Postwar 办公室连接复跑流程

这是云端隔离验收流程，不是生产准入、迁移批准或 World/Clock 启动命令。
固定 Node 24.20.0、pnpm 12.3.4、冻结锁文件；先保存待验收的完整 commit SHA。
不要将 Mac 路径、生产 DSN 或聊天中的密钥用于本流程。

## 1. 清单和普通检查

```bash
pnpm connections:plan
pnpm check
```

清单分母是 120 模块、1126 输入、158 读出；抽屉或新正文的若干字段不能算全部接通。
普通检查中未启用的 native suites 会跳过。单独记录其 `NOT_RUN`，不能计作数据库验收通过。

## 2. 离线开局与隔离 PostgreSQL

`pnpm genesis:prepare --world WORLD_ID --seed SEED_ID --value-date YYYY-MM-DD --out NEW_DIRECTORY`
只生成版本化准备文件；使用记录的开局参数、原件和 policy。不得覆盖已有目录或重置生产。
当前实际 c427 reference 的 world/seed 分别为
`WORLD_PREPARATION_POSTWAR_CLI_V1` / `SEED_PREPARATION_POSTWAR_CLI_V1`。
fixture 仍严格检查完整 seed fingerprint；其他场景须单独审阅其预期，不能删掉 pin。

隔离 bootstrap 已实现在 `tests/support/postwar-native-reference-db.ts`，使用固定镜像、
私有 Unix socket、具 ownership nonce 的 Docker named volume，以及临时 TEST_ONLY 签名。
只在明确需要新隔离参考库时执行：

```bash
ECONMIND_POSTWAR_REFERENCE_BOOTSTRAP=1 \
ECONMIND_POSTWAR_REFERENCE_SEED_FILE=/absolute/path/to/final-seed.json \
ECONMIND_POSTWAR_REFERENCE_EVIDENCE_DIRECTORY=/workspace/.cloud-setup/evidence/NEW_RUN \
pnpm exec vitest run tests/world-core/postwar-native-reference-db.test.ts
```

已封存参考库应加载 marker 并克隆；不得伪写 descriptor、回退 head、重建已有 reference，
或把 TEST_ONLY key/role 当生产权限。完整种子只在离线校验/发布阶段读取；在线接口使用有界小源。

## 3. 分层验收

| 层         | 必须保存的证据                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------ |
| 原件与开局 | source/policy SHA、完整 seed fingerprint、人口/资金/容量不变量；正式值、生成值、缺值分开         |
| 命令与提交 | 实际 canonical command、events、receipt、同事务账本/状态；旧 FINAL 优先恢复、重复不重复发钱/分配 |
| 权限       | 实际 PG 低权角色；错用户、国家、办公室、撤权、原始表拒绝；不以 BYPASSRLS 修错                    |
| 重启与读取 | 新进程恢复、同 head 来源和分页版本；未知前缀/未更新投影返回不可用，不能展示旧值为当前            |
| 浏览器     | 实际 JWT/HTTP/PG 后的 Chromium；切国/切办公室/撤权清除私有 DOM；组件与 full-app 证据分列         |
| 发布       | 最终不可变 SHA 的适用完整检查、迁移目录及角色依赖、独立审查、provider 版本/回滚读回              |

现有可选 suites 的输入通过环境变量给出**实际生成的**封存 descriptor：

| 验收                   | 变量                                                                                           | 测试                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| H6→H7 mixed 小源与重启 | `ECONMIND_POSTWAR_MIXED_H6_CHECKPOINT`                                                         | `postwar-finance-budget-mixed-capacity-native.test.ts` |
| 两国 Social 当前读     | `ECONMIND_SOCIAL_PREFIX_HTTP_CHECKPOINT`，浏览器另置 `ECONMIND_SOCIAL_PREFIX_BROWSER_VERIFY=1` | `postwar-social-current-prefix-http-browser.test.ts`   |
| 库存 V2 直接来源       | `ECONMIND_POSTWAR_PHYSICAL_HTTP_PREPARED_V2_TEMPLATE`                                          | `postwar-physical-opening-http-browser.test.ts`        |
| Finance 主字段         | `ECONMIND_MAIN_FIELDS_HTTP_TEMPLATE`                                                           | `main-office-finance-fields-http-browser.test.ts`      |

以上文件位于 `tests/world-api/`。使用 `pnpm exec vitest run <file>`，检查实际 case 数、零跳过和 cleanup；
保留失败原件，修复后另存新结果。每次封存源码 SHA、执行命令、退出码和报告 hash。
重测试错峰；来源准备成功后复用 sealed 小源，不为重试在线错误反复初始化世界。

预算提交后的完整回读使用 `tests/world-api/postwar-budget-current-readback-native.test.ts`，
传入实际 H6 checkpoint 的 `ECONMIND_POSTWAR_MIXED_H6_CHECKPOINT`，以及已封存混合来源的
`ECONMIND_POSTWAR_MIXED_CAPACITY_SOURCE_CHECKPOINT`。它检验 H7 提交后旧页面不可用、
独立派生发布后的同版本页面、旧游标失效和重复发布；派生失败只能重试派生，不能重发经济命令。
`@econmind/world-worker/postwar-budget-current-readback` 提供显式一次性安装接口；
来源连接与派生发布连接必须分开，发布连接沿用已有专用角色，不给命令写入角色增加发布权限。

两国完整原生命令验收是 `tests/world-core/postwar-social-current-prefix-native.test.ts`。
`ECONMIND_SOCIAL_PREFIX_NATIVE_CHECKPOINT` 指向真实 H3 checkpoint；已有同种子封存来源时，
可用 `ECONMIND_SOCIAL_PREFIX_NATIVE_SCOPE_TEMPLATE` 指向真实 H4 descriptor，复用经逐行
哈希校验的不可变来源。该测试用法不复制经济事件、当前状态或权限，不将原测试失败改记为通过。

主测试中的 skip 应按 case 与文件分别统计；仅启用指定环境变量后实际执行的原生测试，
才能作为对应数据库路径的验证证据。旧候选完整检查与新增源码的验证结论必须分别记录。

标准 Node API 的安装验收使用 `tests/world-api/postwar-finance-connection-native.test.ts`，
除上述两个 H6/小来源 descriptor 外，设置 `ECONMIND_POSTWAR_FINANCE_CONNECTION_NATIVE=1`。
它通过 `startApiRuntime` 的显式 `postwarFinanceConnection` 依赖执行 JWT 提交、单步消费、
进程重启恢复和撤权拒绝；默认进程启动不会自动安装连接或启动消费。
Finance 与 Social 连接使用相同命令路径，不能依次调用两个处理器来消费同一请求体。
Node 可显式配置 `postwarFinanceConnection` 与 `postwarSocialConnection`：固定入口有界读取一次
请求体，按严格办公室/命令类型选择唯一连接；恢复也绑定原始请求，不在失败后尝试另一个连接。
显式 Social 连接在监听前完成产品 `prepare()`：离线验证不可变种子，在线只读取并核对有界的
完整当前前缀及来源、席位和撤销状态。未准备的 HTTP 入口保持关闭，不在请求期重读完整种子。
准备不授予执行权限，也不启动 consumer。当前真实验收使用 Node 进程，不能套用为 Workers 内存验收。
写请求交给服务后若传输中断、提交结果不明，必须先恢复回执，不得自动重发。
HTTP 分派不等于共享执行调度：两个本地 consumer 都读取全 World 队首，不能同时启动，
也不能用轮流尝试消费作为全办公室调度器。正式执行门保持关闭。

Social 标准 Node 路径的隔离验收为 `tests/world-api/postwar-social-node-native.test.ts`：
`ECONMIND_SOCIAL_NODE_H3_CHECKPOINT` 指向真实封存 H3，
`ECONMIND_SOCIAL_NODE_SCOPE_CHECKPOINT` 指向同种子封存 H4 小来源。
该测试在三个独立 Node 进程间分别入队、单次消费、恢复 FINAL，检查重复请求与权限拒绝。
必须记录实际运行结果；未启用 descriptor 的 skip 不代表成功。
`social-intake-authorization.sql` 只提供精确的身份/席位锁读取，专用角色的成员关系须由
已有发布链单独核对，不能给 intake 增加修改权限元数据的权力。

SQL 审查包生成器为 `tools/office-connection/postwar-schema-delta.mjs`。使用
`--source-root <clean-world-checkout> --candidate-sha <full-SHA> --companion-root <companion-checkout> --output-directory <fresh-directory>`，
生成当前候选固定哈希的 19 份非 Clock 提案、逐文件事务副本、依赖与冲突前提、恢复说明。
此前 62261b5c 候选为 18 份，旧包不能替代新增 Social 锁读取提案的验证。
它不执行 SQL 或注册迁移；不确定 COMMIT 结果必须停止核对，不能盲目重试。

## 当前边界

Finance 已有受控预算写链与重启验收，Social 已有 POSITION/PLAN/MATCH 和跨国当前读取；
其余办公室已有受控历史/账本读取样本。它们不代表 120 模块全部完成或生产已发布。
Finance 主页面新增覆盖是 HUD 1 项和只读正文 10 项，不包含政策输入提交。
工资支付仍需真实 completed-day recognition；生产仍需实际用水交付及合格运行成本等原件。
Industry 用工读取可将已采用 E03 岗位与同一完整前缀的当前人数精确关联到设施，
但人数不等于完成工日；缺少实际工作记录仍须拒绝生产，未知前缀不能回退到开局人数。
项目负责人已采用一次性 GCU 开局方案：各国私人银行按一天计划进口货值加入境运费获得资产，
并记同额初始权益，70 国合计不超过 `6,662,014,088.360237 GCU`。
使用 `node tools/office-connection/postwar-gcu-opening.mjs --world NEW_WORLD_ID --seed NEW_SEED_ID --value-date YYYY-MM-DD --out NEW_DIRECTORY`
构建新版本并完整复验原开局链；输出目录必须新建。现有 c427 参考库不自动获得 GCU，不能从 B/R
拆分或覆盖既有状态。银行现金不等于 GOV/OP 资金，实际换汇仍需独立的经营授权、可执行报价和结算链。
首日换汇规则已由项目负责人另行采用，原文与版本化参数分别位于
`docs/governance/owner-inputs/2026-10-29/DAY_ONE_FX_USER_ADOPTION.original.json`、
`config/postwar-genesis/day-one-fx.v1.json`。构建 Core/Worker 后，运行
`node tools/office-connection/postwar-day-one-fx.mjs --seed-file EXISTING_NEW_WORLD_SEED --out FRESH_DIRECTORY`
从已验证的新 GCU 种子生成 70 国报价包；此命令不复制种子、不写数据库、不付款。
报价使用各国原 LC/GCU 单位与数值、零初始点差，首个模拟日结束即失效。
请求 LC 数额为最大支出，GCU 向下取六位后按原汇率精确反算实际 LC 扣款；余额留在原账户。
政府结算要求真实 `FINANCE_TREASURY` 授权、当前报价与未占用资金，
以四条 LC 腿完成 TGA 至银行央行清算账户转移，以两条 GCU 腿完成银行至政府支付。
两币种各自平衡，在同一原子事务提交；不能动用央行外汇储备或透支。
企业付款代表权不由此政策授予，报价包也不等于运行时准入或生产上线。
FX 原生 fixture 使用独立 cfc 新种子 bootstrap/admission，不覆盖现有 c427 参考库。
库存旧指针仅为采用上下文，V2 才区分金融直接来源。
最终发布仍须现有生产发布链、具体最小角色和 provider 配置，不使用开发服务代替正式上线。
