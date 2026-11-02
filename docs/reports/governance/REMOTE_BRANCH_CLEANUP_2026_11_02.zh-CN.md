# GitHub 远端分支清理记录

> 后续纠正：Actions 整理的真实 CI 发现，文件内容等价不代表历史来源引用可删除。原 `codex/f-production-posting-schema` 中的 `4714c1da7af9324741996b94c6da036bf54c39a4` 是迁移 0023 的 manifest 来源。已用专用 tag `provenance/migration-0023-4714c1da` 恢复其远端可达性；23 项迁移来源的远端可达性复查通过，未改校验规则。今后清理分支必须先保留 manifest 和受控证据引用的历史提交。详细记录见 `ACTIONS_ENTRY_CLEANUP_2026_11_02.md`。

日期：2026-11-02（Asia/Shanghai）。范围：`samuelq800/econmind-os-world-simulation` 的远端分支维护，用户明确要求按 main 和现有方针清理。没有合并候选代码或改变经济逻辑、数据库、生产部署、ADR 和 R2 gate。

## 基准与判断方式

远端 main 固定为 `14595f81caec2ed5ce7cec564d7db9609b693718`。起始远端共有 395 个 heads；比较使用已有 Git 对象，只额外定向 fetch 三个较新分支，使用 `--no-tags --filter=blob:none`，没有 checkout 全部分支或运行构建测试。部分新分支的提交/树历史仍产生了较大的下载；过滤不能保证下载量很小。

根据仓库 `AGENTS.md`、`PLANS.md`、集中审查策略及此前运行优化方案，分支清理不构成对未审查功能的批准。未把分支名称中的 reviewed/mainline 当作已合并证据。

以下 315 个分支符合删除条件：

| 数量 | 可核对的依据 |
| --- | --- |
| 265 | 分支 tip 是 main 的祖先，提交历史仍在 main 中 |
| 13 | 从 merge-base 到分支 tip 的全部变更路径，在 main 的文件 blob、类型和模式完全一致，包含删除路径比较 |
| 8 | 分支 tip 是明确保留的活跃分支的祖先 |
| 29 | 分支 tip 被另一未合并后继分支完整包含；覆盖链最终解析到实际保留分支 |

保留 80 个分支：main、两个开放 PR、两个 11 月 1 日开发分支、已有 worktree 的 handoff 分支、本次运行优化方案分支，以及 73 个仍有未确认覆盖内容的分支。仅凭修改日期、标题或名字不删除独有内容；未以 patch 相似推断业务等价。

开放 PR #195（postwar-fx-mixed-replay）和 #196（office-operations-followup）均保留。两个现有 worktree 使用的分支也保留。没有修改 PR 状态。

## 执行与恢复

逐项提交号和最终状态见同目录 `REMOTE_BRANCH_CLEANUP_2026_11_02.json`。删除以每批 15 项的 `git push --atomic` 执行，对每项设置明确旧 tip 的 `--force-with-lease=refs/heads/<name>:<sha>`；有并发推送则拒绝整个批次，避免删掉后来增加的工作。

删除前已保存本地恢复引用 `refs/codex-cleanup-backup/20261102/<原分支名>`，不发布同名备份分支或 tags，避免新 clone 继续下载冗余分支。完整 manifest 记录所有旧 tip。祖先类提交也由 main 或保留分支持有；树内容等价类的原提交历史通过上述本地引用保留。

如需恢复，先核实远端同名分支尚不存在，再在本 checkout 执行（占位符须替换）：

```text
git push origin refs/codex-cleanup-backup/20261102/<原分支名>:refs/heads/<原分支名>
```

本地恢复引用只存在本机器，不作为异地备份承诺；不能单凭 manifest 的 SHA 假定 GitHub 永久保存已失去所有远端引用的对象。

## 体积与本机限制

分支共享对象，删除分支数量不等于下载体积减少比例。main 完整历史中的旧大文件仍存在；GitHub 的 PR 隐藏引用和对象保留也可能继续持有历史。本轮没有历史重写或强制垃圾回收，也不报告未经实测的节省空间。

起始本地有效 pack 约 376.53 MiB，另发现六个 2026-10-03 遗留的 tmp_pack，合计约 710.37 MiB。它们不是正常远端分支体积。按用户本次“GitHub 上”范围，未删除这些本地文件，也未运行可能占用较多内存的 repack/gc。

今后只需当前 main 的新环境，可用以下方式限制下载历史和分支（在新的目标目录使用，不覆盖现有 checkout）：

```text
git clone --depth 1 --single-branch --branch main --no-tags https://github.com/samuelq800/econmind-os-world-simulation.git
```

该 checkout 不含完整历史，后续执行依赖 merge-base、历史审查或旧版本恢复的任务时需按需补齐。需要完整 main 历史而暂不需要历史文件内容时，可以评估 `--single-branch --branch main --filter=blob:none --no-tags`；当前版本文件 checkout 仍会下载。

## 验证范围

必须在全部删除完成后用 `git ls-remote --heads origin` 读回：计划删除项全部不存在；保留项全部存在且 tip 未被本操作更改；main 未变化。实际批次退出码和读回结果写入 JSON。文档执行 Prettier，提交前执行 staged diff check。

应用 lint/typecheck/build/经济测试：NOT_RUN，本次没有应用代码改动。本报告与清理 JSON 发布到已有优化方案分支，未新增审计分支，也未合入 main。其余六个原有未跟踪治理文件不参与本次提交。
