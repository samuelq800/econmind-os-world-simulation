# H6 数据连接与恢复验收

本次隔离整链通过，不等于六办公室全部建设或生产上线。完整结果见 [机器可读摘要](h6-native-summary.json)。

- 实际验收 World：`fcb3eb56fba8dce0e4b98edf2fe2e3419987d88b`。
- 配套仓库：`b238201600971558fd1743e4c14598828c7d1627`。
- 原分支分别为 `codex/office-next-connections-20261108`、`codex/social-employment-catalog-20261108`；均已推送，未合并。
- PostgreSQL、真实注册 Node、Chromium 整链：**1 通过、0 失败、0 跳过，退出码 0，705.56 秒**。套件旧名称含 H1，本次实际从 H5 续接到 H6。

## 本轮实现和实证

Social 待审批方案、Industry 首日利用率目标已接通共享命令、Core 事件、数据库和页面回读。真实浏览器验证了搬迁待审批条款和显式 0% 目标；它们不代表资格获批、预算拨付或实际产出。

已修复 Industry 已提交 RUN 的 HTTP 覆盖元数据、单连接事务内 Clock 嵌套取连接、跨国提交后派生页停留旧版本、物流库存分页解码，以及 prepared 回放漏传物流/水/电原件。独立 SQL forward 仅兼容已有单国 V1 和已采纳多国 V2，保留旧迁移文件、函数 OID、owner、ACL 及来源/RUN/回执/账本校验。

恢复已有 CREATE、programme、target、C10 RUN、BOOK 的五份原 FINAL，没有重新初始化或重复提交。新 SHIP 使用原 BOOK 真实提交；消费过程自动发布 H6 的 48 份派生文档，SHIP 后没有手工补刷新。第二个独立 Node 在同库冷启动后，CB/Trade 实际浏览器读、刷新、F5 和六份原 FINAL 恢复均通过。

最终 H6：6 命令、6 回执、6 事件、6 队列项、0 资金批次、2 库存记录。两 Node 优雅停止，清理无错误，PostgreSQL 已停止并封存。封存库不能当作 H0 重新初始化。

## 检查范围

Core/Worker/API 构建及受影响类型、lint、格式检查通过；Web 源码对应构建通过。本轮未重跑全仓长回归。最新迁移小检查30项、配套48项通过；另有来源/表单/跨国发布/回放定向检查，各轮日志保留，不把数量相加作为功能覆盖率。

实际 H5 完整分页验证确认旧 decoder 拒绝合法 BOOK，新 decoder 保留全部5个 frame和首笔库存记录。升级在隔离库应用一次，受限 read/intake 对内部函数仍被拒绝；未知或 NULL 政策版本仍拒绝。新库83个非Clock安装步骤仅打包，尚未完成全新安装的原生验收。

## 备份与复刻

完整停库备份：`/workspace/.cloud-setup/evidence/fn13o-native/pgdata-stopped-h6.tar.gz`，612136943字节；gzip CRC通过；SHA256：

```text
c38e0ae5eb9c37476233aebc757150caeb854a8187d751ebf01c43db243e958b
```

CRC/哈希是完整性检查，不是备份还原演练。原始日志、6份原请求、回执、迁移及恢复描述符都在 `/workspace/.cloud-setup/evidence/fn13o-native`。所有旧检查点和备份保留。

启动与构建沿用固定工具链 `bash /workspace/.cloud-setup/run-world.sh ...`。代码验收命令是显式受控环境下的 `pnpm exec vitest run tests/world-core/postwar-resumed-registered-node-native.test.ts --maxWorkers=1 --no-file-parallelism`，不能不带检查点/原件配置盲跑。

H6 后续恢复必须使用全部六份原请求，仅恢复 FINAL，不可退回 H5 重发 SHIP。旧 RUN/RUN+BOOK 续接方式会拒绝已经完成三个阶段的记录。后续已增加严格的 `ECONMIND_RESUME_RECOVERY_ONLY=1` 模式，跳过 programme/target/C10 新命令和旧派生重建，保留真实 C10 scope 校验，仅恢复原件及页面。入口为 `/workspace/.cloud-setup/evidence/fn13o-native/recover-h6-only.sh`，参数为完整的恢复工具提交 SHA 和一个不存在的新证据目录；到期续期必须显式追加 `--renew-isolated-registration`。该新增支持只完成类型/lint/非法参数拒绝及脚本语法检查，没有再次运行长链；上述原生通过仍绑定 `fcb3eb56`，不自动转移证据。授权到期只使用既有同 scope 有限续期，不修改原件、推进 Clock 或扩权。

## 未完成项

- C10 WORK/PAY/DELIVER 未执行：Clock仍为0，所需时间为1115。预约和发运不等于实际劳动、付款、交付或炼厂产出。
- C2实际60个岗位均满员，未制造空缺来跑 PLAN/MATCH。
- 原范围120模块/1126输入/158读出不缩减；21个适用炼厂国家的全部操作、其余办公室功能、OMO正式写入和水务人员资格未由本次结果证明。
- 未进行全量回归、正式部署或生产读写验收。Node宿主和正式绑定仍由用户配置。
- 没有改生产数据库、创建凭据、扩张权限、购买资源或访问 Mac/微信。

当前本地与 GitHub 功能分支应保留；其他未合并分支和 detached 工作树也均保留，未执行删除。后续报告/恢复工具提交不把本次原生证据自动转移到另一个功能版本。
