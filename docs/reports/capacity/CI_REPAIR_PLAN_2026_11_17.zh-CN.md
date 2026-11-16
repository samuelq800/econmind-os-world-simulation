# 当前集成分支 CI 最小修理计划

2026-11-17。状态：计划，尚未实施、未运行测试、未推送。

目标：修复当前已观察到的 CI 阻塞，复用现有检查取得可评估的结果。EconMind 是小平台，只做必要的契约与历史测试适配。

## 基线与新增发现

- PR：[#199](https://github.com/samuelq800/econmind-os-world-simulation/pull/199)，仍为 open；目标 main。
- 当前分支：`codex/office-next-connections-20261108`。
- 当前头：`4fab2f93a9d035c19e880fcda36bb30d241a2588`。
- 本轮查询该提交关联检查：13 项全部结束，9 成功、4 失败。部分 PR workflow 使用 GitHub 合成合并提交；执行时同时记录实际 checkout SHA，不能把源分支测试和合并结果混为一谈。
- 相比上一份适配分析，两个全量任务现已结束，新增暴露 Social mock 加载错误和历史升级制品来源不匹配。相同错误在两个任务出现，只修一次。
- #195/#196 已包含在当前分支，不需要重复合并。此计划不推进 `status/progress.json` 的 V09 gate。

| 失败任务 | 直接证据 | 修理项 |
| --- | --- | --- |
| [combined-candidate](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/43884644858/job/133359367845) | Office family 严格类型检查失败 | A |
| [trusted-country-runtime](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/43884644276/job/133359366485) | staging runner 与历史提交逐字节比较失败 | B |
| [Isolated official pnpm check](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/43884644052/job/133359366779) | Social planning suite 加载失败；另有 6 个历史升级包测试失败 | C、D |
| [official-and-native-postgres](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/43884644066/job/133359367149) | 相同的 suite 加载失败与 6 个测试失败 | C、D；后续原生步骤是否完成须看新运行结果 |

## 按顺序修理

### A. 对齐 Social 手动命令类型预期

修改 `tests/world-web/office-command-family-boundary.test.ts`：精确 readonly SOCIAL 元组补入现有产品契约的 `CORE_SOCIAL_LABOUR_PROGRAMME_APPLY_V1`。

保留手动命令全集、自动命令禁止及 readonly 检查。先重跑既有严格编译；如果仍有 TypeScript/Vitest 类型比较兼容错误，再调整等价的类型断言写法，不使用 `any`、类型断言绕过或关闭严格检查。

### B. 修正迁移 runner 的历史不变性断言范围

修改 `tests/foundation/migration-rehearsal-filtered-provenance.test.mjs`，先核对 `67afba68` 的 disposable 历史前缀扩展与原约束。把整份 runner 的旧字节断言改为针对正式 staging 路径及应保持不变的行为约束；其余未变的 policy/manifest 断言保留。

现有 `tests/world-core/v09-disposable-postgres-evidence.test.ts` 已覆盖：正式 staging 拒绝 0023；disposable 在完整来源验证后选择 21 项；未知、篡改、重排和额外后缀拒绝。复用这些用例，仅在实际存在覆盖缺口时补一项必要回归。不要重复生成一套测试，不放宽正式 allowlist，也不批量更新历史指纹。

### C. 修复 Social 规划测试的过期 mock

`tests/world-api/postwar-social-planning-sequencing.test.ts` 将 `POSTWAR_FINANCIAL_CURRENT_DATASETS` mock 成 `{}`，而实际 API 初始化会展开 `.FINANCE`，导致用例还未执行就报不可迭代。

让 mock 保留真实静态数据契约，优先复用现有真实导出，仅 mock 本测试需要控制的读操作。保持事务结束后规划、重新验证权限和失败拒绝等现有时序断言；不为测试错误给产品代码添加空数组兜底。

### D. 将历史 Social 升级回归绑定到历史来源

6 个断言失败都经过 `tests/support/postwar-social-employment-creation-forward.ts:92`：固定历史 manifest 的 sourcePins 被拿去校验当前工作区 SQL，出现 `bd52294f…` 与 `7a220342…` 不一致。

先确认 manifest 指向的 `targetSourceCommit=67cfcdc65f866d8e32ccddab38943d6ac064967a` 中的确切制品及既有历史 fixture 工具，再让历史升级用例使用该固定来源构造最小 fixture。优先修复测试输入，不把历史 loader 改成接受任意当前 SQL。

受影响的现有测试：

- `tests/world-core/postwar-social-creation-forward-package.test.ts`
- `tests/world-core/postwar-social-employment-creation-upgrade.test.ts`
- `tests/world-core/postwar-social-employment-creation-ordinal-upgrade.test.ts`

保留升级 SQL/manifest 指纹、候选不匹配拒绝、旧行/OID/ACL/RLS 保留及重复执行约束。历史制品校验在此有发布来源意义，不属于无必要哈希。不得通过重写历史 manifest、跳过失败用例或回退当前功能 SQL 使测试变绿。若证据表明当前候选确实需要新的 forward 制品，应单独登记发布适配，不能把旧制品伪装成新版。

## 最小验证顺序

执行前只核对当前头、工作区、固定 Node/pnpm 版本及依赖可用性；依赖完整时不重装。依赖缺失时按固定 lockfile 安装。一次性完成必要的 core/worker 构建准备，避免测试读到旧 dist。

1. **本地定向验证一轮**，在 A–D 修改完成后执行：

   ```text
   pnpm exec tsc -p tests/world-web/office-command.tsconfig.json --noEmit --strict --skipLibCheck false
   node --test tests/foundation/migration-rehearsal-filtered-provenance.test.mjs
   pnpm exec vitest run tests/world-web/office-command-family-boundary.test.ts tests/world-core/v09-disposable-postgres-evidence.test.ts tests/world-api/postwar-social-planning-sequencing.test.ts tests/world-core/postwar-social-creation-forward-package.test.ts tests/world-core/postwar-social-employment-creation-upgrade.test.ts tests/world-core/postwar-social-employment-creation-ordinal-upgrade.test.ts
   ```

   对实际修改的代码文件运行仓库现有 ESLint/Prettier，对完整 diff 执行 `git diff --check`。若修改超出测试/fixture 范围，再追加该实际变更要求的类型、边界或构建检查；不预先罗列无关检查。

2. **定向检查通过后一次推送**，由现有 PR workflow 完成正式 `pnpm check`、安全/环境/边界/构建和原生 PostgreSQL 检查。本地不再重复执行两套完整 `pnpm check`，不新增 workflow、不取消现有必需任务。

3. **读取这一轮真实结果**：必须对应最终候选及实际合并测试提交，所有适用强制检查完成并成功；跳过、未执行、仅上传日志均不等于通过。若出现新失败，只补查该失败和受影响路径；不对相同提交反复盲重跑。汇总器失败时核对步骤退出码与采集结果，不能因部分子测试通过就强制判绿。

## 本轮不增加的工作

不压测、不启动本机 Docker、不做浏览器交互、不扩大测试矩阵、不改基础设施、不升级依赖，也不做生产数据库操作。GitHub 既有原生数据库 CI 照常运行。

连接等待/容量问题与配套仓库 #125 的发布目录绑定仍是独立待办，CI 通过不等于支持 100 人并发或可以上线。暂不把这些工作混入本轮修理。

## 交付与停止点

交付小范围修复提交、一份记录实际命令/退出码/CI 链接和剩余问题的报告。测试产生的临时 fixture 清理，已有回归测试保留。

当前仅生成计划，不修改业务代码或宣布测试通过。后续若改动涉及迁移/授权等 P0 边界，按 `PLANS.md` 和集中审查策略保留独立审查要求；不能自行标记 VERIFIED 或以 CI 绿灯替代合并批准。

当前本地/远端分支均为 `codex/office-next-connections-20261108`；已合入的 #201 源分支 `codex/fix-current-read-availability-20261116` 在两处仍保留。此前删除位置选择尚未收到答复，本计划不删除任何分支。
