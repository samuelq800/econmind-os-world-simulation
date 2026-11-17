# CI 契约与历史回归修复结果

## 第四轮：完整检查成功，另一任务总时限不足

提交 `6e885bea81d2a70692b86a15971257d74dd7f427` 的结果为 12 成功、1 取消，没有检测到新的断言失败。

- [official-and-native-postgres](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/43993680941/job/133740347099) 成功：完整官方检查的全量测试为 9093 PASS、389 SKIP，另有既有 Edge 29 个、边界 46 个测试通过，任务整体成功。跳过的数据库用例仍不是通过；该任务的后续原生步骤以任务实际记录为准。
- [Isolated official pnpm check](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/43993681024/job/133740347224) 从 01:11:49Z 开始、02:12:10Z 结束，完整检查步骤在 02:12:02Z 被取消，符合现有 60 分钟任务预算耗尽。日志停止在全量测试接近尾部处，没有失败断言和完整通过汇总；不可视作 PASS。

最小修正：仅将 `.github/workflows/v09-postgres.yml` 中该任务的 `timeout-minutes` 从 60 调至同类 `official-and-native-postgres` 已有的 70。触发条件、所有检查、串行测试设置和单项超时保持，不新增工作流或本地重跑全量。运行时间后续若继续增长，应根据测量优化，本轮不引入拆分/并发机制。

本地执行修改 YAML 和本报告的 Prettier 检查、Prettier YAML parser 解析及 `git diff --check`，均 exit 0。额外尝试直接导入 `yaml` 失败（ERR_MODULE_NOT_FOUND，Node exit 1），随后使用仓库已有 Prettier parser 完成解析，未安装依赖。未将本地静态检查作为远端任务完成证据。产品、SQL、权限和测试行为未改变。当前工作分支及此前保留的源分支不变；不在本轮删除或合并分支。

## 第三轮 CI 平台适配

`db233643af16da272b9649b7499a02b93469b546` 的结果为 11 成功、2 失败。报告格式检查已通过，本轮失败分别如下：

- [Isolated official pnpm check](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/43984519819/job/133709113927)：全量测试 9090 PASS、389 SKIP、3 FAIL；失败均在历史 forward package 的 `REGULAR_COMPANION_MODULE_REQUIRED`。macOS 临时目录可能包含符号链接，fixture 的路径与工具要求的 realpath 不一致。本轮在创建临时目录时取 realpath，保留工具对普通文件及真实路径的校验。
- [official-and-native-postgres](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/43984519716/job/133709113345)：前置回归 91 PASS、1 FAIL，Worker SIGINT 用例等待 readyz 超过 15 秒，尚未进入关闭断言。同轮 bootstrap 编译启动相关用例有 17.46 秒耗时，表明 15 秒设置存在环境负载敏感性，但日志不能排除其他启动失败。本轮让该启动阶段采用同文件 repeatedSignalAttack 已有的 30 秒预算，并将该用例总预算设为 60 秒以容纳启动与原关闭等待；关闭超时、进程消失、端口释放和 SHUTDOWN_COMPLETE 断言保持。

实际本地检查：三个历史升级/打包文件共 10 个用例 PASS（exit 0），修改的两个 TS 文件 ESLint、Prettier 及 `git diff --check` 均 exit 0。临时 fixture 已按既有 cleanup 清理。

POSIX 生命周期测试在 Windows 本机不能提供有效执行证据；只读检查 WSL Ubuntu 后未找到 Linux Node，不为此额外安装工具链。该修正的实际生命周期运行由既有 macOS CI 验证，仍为待验证；未将 Windows skip 或增加等待预算表述为通过。

本轮改动仅测试 fixture、测试启动等待和本报告，产品/SQL/权限/打包校验/workflow 均未变化。推送后读取新一轮 CI；未合并、未推进 gate、未清理分支。

## 第二轮 CI 格式修正

提交 `b6692d624a98b16ed5a7e208923d61033631e6b5` 的 13 项检查已结束：11 成功，2 失败。`combined-candidate` 与 `trusted-country-runtime` 已通过。

两个失败任务均在 `pnpm check` 的 `prettier --check .` 阶段退出，指向本报告、CI 修理计划及 PR195/196 适配报告。上次只检查了修改的测试/fixture，漏检这三份新增 Markdown；本轮补齐格式化，不修改产品或测试行为。

- [Isolated official pnpm check 日志](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/43982563147/job/133702463171)：前置 71 个测试通过，ESLint 通过，格式检查失败。
- [official-and-native-postgres 日志](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/43982563163/job/133702463002)：前置 92 个测试通过，ESLint 通过，格式检查失败；后续原生步骤未据此判定通过。

修正后对三份报告执行 `pnpm exec prettier --write`、`pnpm exec prettier --check`，并执行 `git diff --check`，均 exit 0。本轮不重复运行与 Markdown 排版无关的功能测试。推送后仍需读取完整 CI 结果；此前被格式错误阻断的后续检查尚无本轮通过证据。

2026-11-17，Windows，Node 24.20.0 / pnpm 12.3.4。基线 `4fab2f93a9d035c19e880fcda36bb30d241a2588`，分支 `codex/office-next-connections-20261108`。状态：IMPLEMENTED_UNVERIFIED，等待新提交的 GitHub CI；不代表容量验收、独立审批或生产批准。

## 改动

- Office readonly 精确类型预期补入已存在的 Social APPLY 家族；严格编译通过，无需额外类型绕过。
- 迁移来源回归继续锁定原 policy/manifest 和 runner 的历史保护段；允许已有 disposable loader 扩展，正式 staging 与 disposable 行为由现有 V09 回归验证。
- Social 规划测试改为部分 mock，保留实际静态数据集契约及新增 FX reader 导出，继续验证释放连接后规划与再次授权。
- 新增 TEST_ONLY 临时历史来源 fixture，从 manifest 固定 target commit 读取原 SQL；三个历史升级测试使用它。原 loader、升级 SQL、manifest、候选来源不匹配拒绝以及元数据/权限断言保持。临时目录在测试结束清理，构造失败也清理。
- 定向运行发现 V09 测试写死 `/private/tmp`，导致 Windows 在路径策略阶段提前拒绝。改为平台原生临时目录路径，保留原策略和断言。

只有测试及 fixture 改动，没有产品、SQL、权限、迁移、workflow、依赖或 lockfile 变化。未启动本机 Docker、使用前台 UI 或操作生产数据库。

## 实际验证

所有命令在仓库根目录执行。

| 检查               | 命令 / 范围                                                                                                                                                                                                     | 结果                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 固定工具链         | `node --version` / `pnpm --version`                                                                                                                                                                             | 24.20.0 / 12.3.4，exit 0                                                               |
| 构建测试依赖       | `pnpm pretest`（core、worker、API）                                                                                                                                                                             | exit 0                                                                                 |
| 严格类型           | `pnpm exec tsc -p tests/world-web/office-command.tsconfig.json --noEmit --strict --skipLibCheck false`                                                                                                          | exit 0                                                                                 |
| 来源与保护段       | `node --test tests/foundation/migration-rehearsal-filtered-provenance.test.mjs`                                                                                                                                 | 13 PASS，exit 0；含两个实际 PGlite migration rehearsal                                 |
| 定向 Vitest 首轮   | 计划中的 6 个测试文件                                                                                                                                                                                           | 53 PASS / 14 FAIL，exit 1；暴露缺少 FX 导出、遗漏的历史 loader 调用和 Windows 路径问题 |
| 定向 Vitest 修正后 | `pnpm exec vitest run tests/world-core/v09-disposable-postgres-evidence.test.ts tests/world-api/postwar-social-planning-sequencing.test.ts tests/world-core/postwar-social-employment-creation-upgrade.test.ts` | 26 PASS，exit 0                                                                        |
| 其余三文件         | Office family、Social forward package、Social ordinal upgrade                                                                                                                                                   | 首轮均 PASS，未再次修改行为；合计最终覆盖 6 文件 67 个用例                             |
| ESLint             | 修改的 8 份测试/fixture；后续改动的 3 文件再次检查                                                                                                                                                              | exit 0                                                                                 |
| Prettier           | 修改的测试/fixture                                                                                                                                                                                              | 格式化完成，exit 0                                                                     |
| whitespace         | `git diff --check`                                                                                                                                                                                              | exit 0                                                                                 |

首轮失败已保留记录，不算作通过；最终受影响用例已修复并重跑。没有本地重复完整 `pnpm check`，由本次推送后的既有 CI 执行正式全量与原生 PostgreSQL 检查。远端结果尚不能标为 PASS。

## 后续与边界

读取新提交及 GitHub 实际合并提交对应的完整 CI 结果；失败则沿直接证据修复。连接等待/容量失败及配套发布目录 #125 的当前候选绑定仍为独立待办，此修复不能支持购置规格或上线结论。

当前本地/远端分支为 `codex/office-next-connections-20261108`。已合入 #201 的 `codex/fix-current-read-availability-20261116` 两处仍在，删除位置尚待所有者决定。没有清理其他工作、删除分支或自行合并 #199。
