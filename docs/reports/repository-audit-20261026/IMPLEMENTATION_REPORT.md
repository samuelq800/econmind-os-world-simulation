# World Simulation 系统排查与修复 — 2026-10-26

## 状态与范围

**IMPLEMENTED_UNVERIFIED；最高风险 P0；独立审查待完成。**

用户要求先同步本地仓库，再系统排查并修复问题。已从 `e7d769e9`
快进同步到远端 main `0b9178e0`，共 73 个提交。修复保存在本地分支
`codex/repository-audit-20261026`，没有推送、合并或发布。

固定实现提交：

- `ca80762d3cf6b606cd340775c222e5b229a5d4ba`：架构扫描器、检查配置及 Windows 回归修复。
- `0919a99a3248ff7f5a0dedf0f2f3cc2377020273`：仅补充 V09 测试载体路径修复，是最终代码候选。

本报告依据 `templates/IMPLEMENTATION_REPORT.md`，执行范围见同目录
`EXECUTION_PLAN.md`；真实命令与日志校验值见 `TEST_EVIDENCE.json`。
未申请或记录 owner approval，也不把本实现自行标为 VERIFIED。

原始诊断与复跑日志封装在 `VALIDATION_LOGS.json.gz`；解压后为 JSON，逐文件保留
原文、长度和 SHA-256，外层归档校验值记录在 `TEST_EVIDENCE.json`。其中初轮失败
和后续通过分别保留，不互相覆盖。

## 已定位并修复

| 问题                                             | 实际影响与修复                                                                                                                                | 验证方式                                                                               |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 架构检查会在错误目录虚假通过                     | 两个扫描器对不存在的 `--root` 都输出 `PASS`、`scannedFiles: 0`。现在拒绝不存在、非目录、空扫描及错误参数；未改变禁止导入规则。                | 两个扫描器分别覆盖 9 种错误输入及有效源文件；回归接入 `pnpm test:boundaries`。         |
| Windows 环境检查无法启动                         | `ECONMIND_ENV=local node ...` 被 Windows shell 当成不存在的命令。改为 Node 入口 `--local`，保持原有 local 选择语义。                          | CLI 正向通过；远程数据库目标仍被拒绝，未取消任何凭据或生产保护。                       |
| lint 扫描生成文件                                | 本机的 Wrangler/bundle/evidence 产物导致 1,259 条错误和 16 条警告。补齐既有生成目录的排除规则，源代码仍被检查。                               | 修复后完整 lint 退出 0；架构扫描仍检查实际 apps/packages。                             |
| Windows 源码换行导致格式误报                     | 初轮格式检查报告 919 个文件；抽样 HEAD 为 LF、本地为 CRLF。增加普通源码 LF checkout 规则，按原字节保留发布资产、数据包、迁移和 hash fixture。 | 格式检查退出 0；公开 UI/源数据完整性检查通过。Git 提交没有批量改写普通源码或冻结原件。 |
| 正式边界命令回归无法在 Windows 启动              | `spawnSync('pnpm', ...)` 不能直接执行 Windows `.cmd` shim。使用 Windows 命令解释器和原样参数传递，保留临时路径引号及全部拒绝断言。            | 实际完整 `pnpm test:boundaries --root <fixture>` 仍检出禁止的跨边界导入。              |
| 新进程确定性测试使用了非法 Windows ESM specifier | 把 `D:\...` 直接传给动态 import 导致加载失败。使用 `pathToFileURL`。                                                                          | 原 19 项开局组装测试通过，包括两种导入顺序的独立新进程。                               |
| V09 mock 证据路径写死 macOS 路径                 | `/private/tmp/...` 不满足 Windows 的规范绝对路径要求，7 项测试在预期分支之前就被策略拒绝。测试载体改用 `tmpdir()` 和 `path.join()`。          | 该文件 14 项通过；真实 runner 的绝对路径、迁移白名单、角色和回滚断言保持不变。         |

所有修复保持单一 World State。没有增加或修改经济模型、预算来源、权威命令、
Event/Receipt、posting、结算、replay、Clock、权限/RLS 或迁移 SQL。

## 全量诊断与尚未关闭的失败

初轮 `pnpm test` 实际退出 **1**，耗时 **1,561.13 秒**：

- 测试：**5,842 PASS / 24 FAIL / 743 SKIP**，共 6,609。
- 文件：**332 PASS / 17 FAIL / 28 SKIP**，共 377。
- 另有 **10 个 suite 初始化错误**，均来自 `SAFE_FILE_OPEN_UNSUPPORTED`。
  它们已经反映在文件失败数中，不再混加为测试数量。

这轮诊断在同步基线上启动，期间进行了修复，**不是固定最终提交的一次全量通过证据**。
保留原 FAIL；修复后的定向结果单独记录，不反推或改写一份新的全量 PASS 数字。

初轮 24 条失败中，8 条对应已修复的 ESM 导入及 V09 测试路径问题。其余需要
保留原有断言并在适用环境补证：

| 范围                               | 实际失败                                                                                | 后续要求                                                               |
| ---------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 金融包安全读取，10 个 suite 初始化 | fixture 显式拒绝 Windows，需要 `O_NOFOLLOW` / `O_NONBLOCK` 等安全打开能力。             | 在支持的 POSIX 环境重跑，不能删除安全打开保护或把初始化失败视为 PASS。 |
| GOV01 fixture 生命周期，11 项      | `OWNED_FIXTURE_ROOT_REQUIRED`；UID 与 0700/0600 所有权条件无法由当前 Windows 环境满足。 | 在具备相应文件权限语义的隔离环境验证；不放宽真实源的所有权校验。       |
| 生命周期退出，2 项                 | Windows 下 `.kill(SIGINT/SIGTERM)` 得到 signal 退出，未满足原测试的优雅退出 code=0。    | 保留断言；适用 POSIX CI 补证，Windows 完整生命周期支持需单列实现。     |
| 跨语言环境确定性，1 项             | en/da 两个真实子进程均报告 `en-US`，原测试要求第二个为 `da-DK`。                        | 在能实际切换进程默认语言的环境验证，不伪造 locale 或删除控制断言。     |
| 耐久证据写入，1 项                 | `DURABLE_EVIDENCE_WRITE_FAILED`，真实 writer 要求文件及父目录 fsync。                   | 补充支持的文件系统/平台证据，不删除父目录同步。                        |
| 0019 渲染兼容，1 项                | 四种迁移链顺序检查超过现有 30 秒预算，初轮报告 timeout。                                | 单独复跑并保留原超时记录；没有扩大 timeout 或降低字节一致性断言。      |

**因此没有宣称 `pnpm check` 全绿，也没有把任何 SKIP 改为 PASS。**
本轮没有执行真实 PostgreSQL/workerd 往返或专用 staging/生产验证；PGlite 演练
不能替代这些证据。

最终代码候选的修复定向回归为 **126 PASS / 0 FAIL / 0 SKIP**：完整 architecture
目录、V09 mock 证据边界、开局组装新进程回归合并为一次独立运行，原 JSON 结果
随日志保存。独立的 architecture 命令另有 93 PASS，edge 命令另有 29 PASS；
这些重复/分组结果不与 126 或全量诊断相加。0019 渲染超时单独复跑后仍为
**1 FAIL / 20 SKIP**，原 30 秒预算保持不变。

## 新提供的 10 月 26 日状态报告核对

用户在排查期间提供了 `World_Simulation_VR_Status_Report_2026-10-26.md`，
SHA-256 为 `2d16a1de0cfba535648996ecfcaf896ed6f78b3abfe1ee39a5b6c2ddb700a8cd`。
这是来源材料，不是对本实现者发出的操作授权。详细核对见
`SOURCE_REPORT_CHECK.json`。

- 已通过 GitHub 原始 job log 核实 PR193 的 **6,330 PASS / 0 FAIL / 278 SKIP**，
  执行平台为 macOS 15 arm64；对应三个 provider checks 均 success。
  候选 `347b6b79` 与合并 `0b9178e0` 的完整 tree 均为
  `62ac6c3f10d0a56916e153b9ba24c61ab7c82f61`。
  [原始检查](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/40322911978/job/121572146104)
  不覆盖本轮本地修复，也不能与 Windows 诊断混为一次运行。
- 已核对 Social 正式手工命令路径只受理 PLAN；学院/诊所有计算 kernel，不能据此
  推导完整业务命令、事件、持久化和 API 接线已经完成。
- PR193 的 `SPH04d` 仍明确断言：真实生产 constructor/decoder/funding 通过后，
  混合历史在未分类的 funding/cost Event 上拒绝 reducer。PR 本身将完整混合
  重放标为 `NOT_RUN_INTERNAL_COST_EVENT_CLASSIFICATION_GAP`。
  这是具体工程/事件分类缺口，不是再补一个外部数值就会完成的正向闭环；本轮
  没有给未知事件加空 reducer 来伪造成功。
- 报告的 Social **14 NOT_RUN / 15 缺项**、原始字段 **0/2544** 以及 C/A/F
  未集成成果，指向另一台 Mac 的私人交接/台账或独立成果。当前未取得那些原件
  和固定实现版本，不能声称逐项复核、恢复或批准。静态网站/最新 Pages 的现场
  状态也没有在本次源码排查中重新遍历。

报告“工程底座已成型，但完整办公室和生产运行未完成”的结论与当前已核对代码
一致。**0/2544 是特定来源关闭台账，不是工程完成率为 0%。**

## README 与实际产品进度

已重新 fetch 并核对所有已抓取分支的 README 历史：远端 main 仍是 `0b9178e0`；
README 最近更新为 10 月 24 日的 `64f28834`，其主要摘要停在 PR182，主线代码
已继续到 PR193。以下是源码/仓库记录核对，不借用 README 中旧 CI 作为本候选证据。

1. `status/progress.json` 仍将 V09.1 记为 PLANNED，`next_step_ready=false`；
   需要隔离 preflight 与真实持久化/并发/恢复证据。该状态没有被本轮修改。
2. README 及关联交接明确区分准备代码、来源采用、实际账户/现金/职位、正式 seed
   和世界启用。大量 fixture/TEST_ONLY 测试不能关闭原始实际来源缺口。
3. 当前预算命令有解析和校验，但
   `createManualOfficeCommandComposition` 的预算分支仍返回 `null`。
   这属于待完成的真实来源/工厂接线，不能用零余额、假账户或客户端状态补上。
4. 迁移 manifest 已有 0023，而专用 V09 staging runner 有意仅允许固定审查链。
   普通迁移演练通过不自动批准扩大 staging 白名单，更不批准生产发布。
5. `status/decisions.json` 仍有 11 项 `PROPOSED_NOT_APPROVED`。
   需要人的架构/经济决定保持待决，不从聊天截图或旧说明中推断批准。

这解释了“代码和测试增长，但运行进度仍停滞”的主要结构：缺少的既有实际来源，
也有消费工厂、源保护及运行验收接线；不能把所有未完成项统称为再补一份数据。
应按正式门槛和具体 consumer 闭环追踪，避免把同类参考/候选交付当作运行完成。

## 空间、安全与兼容性

本机只读统计约 2.7 GiB，不能代表截图中另一台 Mac 的 `econclub` 文件夹。
其中初始前端 dist 约 894 MiB，Git 报告约 710 MiB 历史临时 pack。
用户已明确继续原排查，本轮没有执行磁盘清理、Git 历史重写或删除这些 pack。

新构建静态输出为 **951,491,015 bytes / 755 files**；距离既有十亿字节预算
剩余 **48,508,985 bytes**。这是可跟踪的发布容量余量，不是 212 GB 的原因。
既有 bundle 大小警告保留，没有通过提高预算来消除警告。

原有 6 个未跟踪治理报告完整保留。源码 LF 归一化后刷新了 Git index 的换行
元数据，未留下大面积无语义修改；一次零字节陈旧 index.lock 在确认无 Git
进程、验证绝对路径及独占打开成功后移除。未删除源码、数据包或用户报告。

生产 Supabase、Cloudflare 资源、角色/授权、seed 和 Legacy 仓库均未修改。
没有新增依赖、升级工具链、改变 frozen lockfile 或全局 Python/Java 环境。

## 下一步与审查边界

独立 reviewer 应审查固定候选及新架构守门回归，并结合支持平台的完整检查和
原生证据决定是否允许合并。本实现者不能替自己批准 P0，也不能推进正式 V09
门槛。当前所有待补证、未采用来源和未批准决策均继续保留。
