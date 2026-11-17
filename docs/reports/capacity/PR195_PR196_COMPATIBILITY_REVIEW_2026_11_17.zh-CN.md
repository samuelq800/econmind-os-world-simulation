# PR #195 / #196 与当前集成分支的适配核对

2026-11-17，Asia/Shanghai。只读功能与依赖分析，未修改代码、运行测试、合并或回退。当前集成提交 `4fab2f93a9d035c19e880fcda36bb30d241a2588`。

## 功能关系

`git merge-base --is-ancestor` 确认：#195 的头 `aeece72d` 在 #196 的头 `46532148` 中；两者均是当前 #199 分支的祖先，`HEAD..旧分支` 没有遗漏提交。实际开发关系为 **#195 → #196 → #199（已包含 #200、#201）**。不是三套需要重新拼接的实现。

| PR                                                                          | 功能层次                                                                                                      | 当前处理                                                           |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [#195](https://github.com/samuelq800/econmind-os-world-simulation/pull/195) | 战后开局与银行 GCU 来源、Finance/Social 共享执行、首日 FX、受限历史读取、当前页发布和回执恢复                 | 已包含，属于基础层；其旧绿灯和有限历史验收不等于 #199 当前候选通过 |
| [#196](https://github.com/samuelq800/econmind-os-world-simulation/pull/196) | 注册 Node 入口、World actor/control 绑定、共享消费器、Captain/CB OMO、窄 Trade 来源与回放、租金候选及截止校验 | 已包含，并被 #199 继续扩展；不需要重复合并                         |
| [#199](https://github.com/samuelq800/econmind-os-world-simulation/pull/199) | 在前两层上增加 Office 操作、Industry/水电物流、Social 申请及审查读取、FX 表单、派生发布恢复等接线             | 当前待验收集成层，应在此修复契约与 CI 问题                         |

#195 到 #196 改动 155 文件；#196 到当前集成分支继续改动 681 文件。因此旧 PR 的说明、配置和测试通过记录不能直接作为当前行为说明或发布凭证。祖先关系证明代码包含，不代表每个新增链路已完成原生验收。

## 明确需要的适配

### 1. Social 命令类型测试

当前 `apps/world-web/src/office-command/contract.ts` 的 `officeFamilies.SOCIAL` 已包含 `CORE_SOCIAL_LABOUR_PROGRAMME_APPLY_V1`；`tests/world-web/office-command-family-boundary.test.ts` 的精确类型预期仍只列到 CREATE。这是实际的新旧契约不同步，不应仅将 CI 错误解释成编译器噪声。

应将 APPLY 纳入精确预期，保留 readonly、手动命令家族与自动命令禁止边界，并核对 TypeScript 6 / Vitest 类型比较报出的 `Symbol.unscopables` 兼容问题。先只运行对应严格类型命令和命令边界回归。

### 2. 迁移测试的历史基线范围

`scripts/v09-staging-evidence-runner.mjs` 的 `67afba68` 已增加可丢弃环境专用的历史前缀选择器：在完整来源验证后，对明确的 0023 后缀作历史故障演练范围处理；正式 staging loader 保持原入口。

`tests/foundation/migration-rehearsal-filtered-provenance.test.mjs` 仍要求整个 runner 与 `13fd4ce8` 逐字节一致。对照显示，该断言中的其他三份策略/manifest 文件未变化，只有 runner 有 30 行增加、3 行删除。

应核对这项演练范围变更的来源与授权，再将不变性断言限定到真正必须不变的正式策略/路径，并为 disposable 选择器保留实际行为约束。不能简单删除迁移安全测试、更新所有指纹或放宽正式 staging allowlist。该问题属于 #199 的整合与测试适配，不是再次合并 #195/#196 可以解决的。

### 3. 发布目录与 SQL 候选

配套仓库的 [#123](https://github.com/samuelq800/econmind-os/pull/123) 对应 #195 的 31 项提案目录；[#124](https://github.com/samuelq800/econmind-os/pull/124) 对应 #196 阶段的 43 项目录；[#125](https://github.com/samuelq800/econmind-os/pull/125) 对应 #199 的扩展目录和受控函数升级准备。

#125 当前头 `2e724c4a` 的说明仍绑定 World `4ddc84fb`。该 World 候选到当前集成提交，有三份 SQL 变化：

- `postwar-mixed-current-projection-read.sql`
- `postwar-paged-current-projection.sql`
- `postwar-industry-labour-current-read.sql`

#125 的策略已包含三者的函数/owner/EXEC 契约，但这不能替代对新函数体和实际发布候选的绑定。发布前应基于当前不可变 World 提交重新生成或核对目录、SQL 制品与已安装库所需的受控升级；不直接套用旧 #123/#124，也不自动执行生产 SQL。旧默认 preflight binding 和历史验收记录不自动升级为当前发布批准。

## 继续沿用的机制与独立待办

保持一个 World State、一个共享消费器、原命令 FINAL 身份、派生重试和数据库 writer/control 约束；没有发现需要为旧 PR 新增兼容服务或第二条执行链的依据。

正式注册 Node 文档规定每池上限为 2；本次原生负载 host 每池为 1。该配置差异需要在修复连接等待后显式对齐验收，不宜直接扩大连接池作为结论。Social `service-pools` 读取附带规划事务，是需要测量的读取成本/占用路径；这与旧 PR 是否重复合并无关。

目前没有依据因为这两个旧 PR 而回退 #201。最小行动顺序为：先修 Social 类型预期和迁移测试适配，再定位连接等待；发布前同步 #125 的当前候选。此次不推进 gate，不声明独立 APPROVED 或生产就绪。

当前本地/远端工作分支为 `codex/office-next-connections-20261108`。#195/#196 源分支已被当前分支包含，但两条旧 PR 均仍开启；它们如何合并/关闭及删除哪个位置的分支，应由所有者明确决定，本轮未清理分支。
