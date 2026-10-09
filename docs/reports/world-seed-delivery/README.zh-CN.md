# World-sim Seed 准备交付 v1

2026-10-08 后续云端交付与最新状态见 [发布交付状态](RELEASE_STATUS_2026_10_08.zh-CN.md)。
下文保留 v1 的原范围与证据；后续 Cloudflare 部署和 Linux 耐久回执不追改历史结果。

本次交付的是可运行、可复现的开局检查工具和验证材料。
**正式世界仍未启用；这不是六职位完整可玩或整个项目的最终上线版本。**
工具状态为 `IMPLEMENTED_UNVERIFIED`；正式开局/启用被权威输入、当前 gate、部署
证据和未完成的 V09 完整证据阻塞。未改写 `status/progress.json`。

## 交付内容

- `scripts/world-seed-preflight.mjs`：调用已有的金融、Seed bridge、物理、水、劳动/社会服务验证器，导出真实缺项。
- `pnpm seed:report`：构建 Core/Worker，然后生成诊断报告和逐国输入工作表。
- `pnpm seed:check`：执行相同检查；当前返回 **exit 2 / BLOCKED**，不能用于放行启用。
- `.gitattributes`：保护冻结来源和 migration SQL 的原始字节，避免 Windows 换行转换破坏 hash；没有改动来源数值或 SQL 内容。
- `tests/world-core/world-seed-preflight.test.ts`：实际来源、精确金额保留、确定性输出、来源漂移拒绝及 CLI 边界验证。
- `EXECUTION_PLAN.md`、`IMPLEMENTATION_REPORT.md`、`TEST_EVIDENCE.json`：范围、实际证据和未闭合项。
- `artifacts/world-seed-delivery-v1/`：本地生成的报告、逐国工作表、校验和、测试 JSON 与失败记录；该目录不提交 Git，可重新生成。

这套工具不提供 `--apply`、生产数据库入口、任意输出路径或 activation 开关。
工作表不是 OpeningSeed，不被运行时当作审批或发布输入；填完后仍需合法来源采用与独立审查。

## 使用方式

在已有完整仓库中使用固定工具链 Node 24.20.0 / pnpm 12.3.4，依赖按冻结 lockfile 安装。
已有相同依赖可直接运行；无需设置数据库 URL 或密钥。

```powershell
pnpm install --frozen-lockfile
pnpm seed:report
pnpm seed:check
```

退出码：`--report` 的 0 只表示成功导出诊断；`--check` 的 2 表示已验证存在阻塞；
1 表示参数、文件、来源身份或验证执行错误。任何一个都不表示正式经济启用成功。

输出文件：

| 文件                                  | 用途                                                        |
| ------------------------------------- | ----------------------------------------------------------- |
| `preflight.json`                      | 同一固定来源上的五组验证结果、逐国金融来源事实和原始缺项    |
| `input-worksheet.json`                | 70 国待补充材料；保留已知事实，未知值为 null                |
| `checksums.json`                      | 上述两个输出的实际字节数和 SHA-256                          |
| `*-tests.json`                        | 实际测试结果，不包含生产运行证明                            |
| `v09-preflight-console-attempt*.json` | 完整证据运行的原始 FAIL_CLOSED 回执；不是成功的耐久证据文件 |

## 实际核对结果

官方包中仍保留 70 国、350 个实体、840 个库存来源格，其中 619 格为正库存来源。
央行账户分类共 1470 行（70×21）；分类目录不等于 1470 笔实际持仓。
当前准备 scope 没有正式 World，因此准备阶段未生成权威库存 entry 或可发布 Seed。

| 验证器                | 当前诊断行数 | 含义                                                                   |
| --------------------- | ------------ | ---------------------------------------------------------------------- |
| 金融来源采用          | 1051         | 本币/FX/持仓完整性/World 绑定缺项；已有 B=TGA 等规则没有被重新要求审批 |
| canonical Seed bridge | 2450         | 同一缺项在 Seed 消费端展开；包括尚未采用的分类，不能填零消除           |
| 物理领域              | 12113        | 运行输入和来源问题，其中 49 项 SOURCE_CONFLICT                         |
| 水                    | 1283         | 来源冲突与运行输入缺项                                                 |
| 劳动/社会服务         | 1066         | 技能语义、实际运行输入与住房产权等问题                                 |

这些行跨字段和消费者重叠，**不是待回答问题数，也不是必须新造的参数数量**。
政治资本 genesis、真实身份与主机部署不由这五组验证器完整认证；仍单独保留为正式前置条件。
本次仅核对仓库当前固定来源，不声称所有外部文件中都不存在这些材料。

## 实际验证与局限

- 8 项新 preflight 测试、107 项 Seed/来源/admission/replay 回归、34 项架构测试通过。
- 独立本机 PostgreSQL 18.4：2 项开局/并发重试/冲突读回和 3 项 writer lease/fence 测试通过。
- 总计上述 **154 PASS / 0 FAIL / 0 SKIP**；这些是指定测试集，不是全仓 `pnpm check`。
- Core/Worker/API 构建、Worker/API 与新测试类型检查、定点 lint/format、边界、环境、secret、22 项 migration 校验及两种 PGlite migration 演练通过。
- 原始 Windows 换行漂移导致的来源/migration 校验失败已定位到检出字节；恢复 Git 原件后校验通过。hash 标准未降低。
- V09 完整 disposable runner 在独占新集群中通过全部执行步骤、提交确认丢失/回滚检查及清理，最终耐久证据落盘失败，整轮仍为 **FAIL_CLOSED / exit 1**。
- 定点系统调用复现 Windows `fsync(directory)` 为 `EPERM`。没有删去目录 fsync 要求，也没有把 console JSON 伪装成成功耐久回执。
- 本机 PostgreSQL 是 18.4，不将其当作 PostgreSQL 16 或正式 staging/生产拓扑的等价证明。
- 两个本次创建的 PostgreSQL 集群已停止；没有启动正式 API、经济 Worker 或时钟。

完整 V09 证据应在支持现有耐久落盘要求的批准环境中重新执行，或交付经过审查的
Windows 耐久写入兼容实现后重跑。当前不能关闭对应 gate。

## 正式版剩余前置条件

1. 补齐真实央行开局清单及完整性、币种/FX 口径、政治资本 genesis 和必要运行状态来源；已有经济规则不重问。
2. 绑定唯一正式 World、真实管理员及合法当前席位；测试身份不代用。
3. 闭合 V09 等正式 gate 与发布候选的必要独立审查，不把准备报告当作批准。
4. 明确 API/Worker/数据库运行环境，走唯一批准的发布链，完成实际开局/admission/部署读回。
5. 跑通真实账号命令→经济回执/领域变化→授权 UI 回读，以及幂等和恢复验收。

只有这些条件满足后，才能交付“正式可启动版本”。本文与输入工作表不授权生产写入，
也不新增默认值、第二份经济状态或新的 Seed 发布通道。
