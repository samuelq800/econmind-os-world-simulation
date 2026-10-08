# 正式运行链源码整合 — 2026-10-08

本包以 main `7f1c05c7bf5b26cd2aae13f25569a4e8852f0c58` 为基线。
用途是整合已经独立批准的源码；不是生产 admission、运行部署或引擎启用证明。
当前正式经济引擎仍为 **NOT_ACTIVATED**。

## 固定来源与独立审查

| 来源 | 固定 implementation                        | 独立结论及范围                                                                 |
| ---- | ------------------------------------------ | ------------------------------------------------------------------------------ |
| A    | `b9a85dd7620894f4947aecee156255d0cdb8841f` | B APPROVED SOURCE_ONLY：私有签名 authority 与 opening 发布机制；真实来源仍阻塞 |
| G    | `60a8f76390bb77361da3beac078bc68fc375786c` | C APPROVED SOURCE_ONLY：既有唯一 durable dispatcher 接 Captain/CB/Social PLAN  |
| D    | `5c1f355aecc7656c45a44bbab444699c0295b526` | E APPROVED SOURCE_ONLY：正式 country 首屏拒绝本地示例和假时钟                  |
| C    | `710441d834b191001e9f4d6d68cf69d4b7f30ba2` | F APPROVED SOURCE_ONLY：Social 查询真实 submission 的 command_type             |
| F    | `ceee8956793328ea44a9c4a5cd1c4dd864aa05ff` | G APPROVED SOURCE_ONLY：exact 0023 私有 release policy；未注册 caller          |

Root 正常 replay 上述固定提交，不修改其实现文件。顺序为
`bafdaa5` → `0c72f75` → `a9ffcc9` → `0929098` → `de3d723` → `e63e7ce`。
完整独立报告保留在各窗口固定 artifacts 中；实现原报告随来源提交保留。

E 的旧候选 `a6384c72bef8d47093285760a98a89d161db0812` **不纳入**：
A 已复现新增 decisionResult(s) 被同候选 strict API reader 拒收，结论
**CHANGES_REQUIRED**。等待独立审查后的修复，不能用 projector 单测通过替代端到端合同。
G 的正向 manual intake 属于后续独立候选，也未提前计入。

## Root 组合检查

工具链为 Node `24.20.0` / pnpm `12.3.4`，使用本 checkout 自有 Core/Worker 编译产物。

- A admission 直接测试 **25 PASS**；原 opening decision reconciliation 另跑 **16 PASS**。
- G dispatcher、C Social、原 goods durable consumer、D boot/HOME、CI prerequisite：
  **117 PASS / 14 SKIP**。14 项 native Social 在 Root 组合中 **NOT_RUN**，不写成 PASS。
  C 的原固定交付已有独立环境 native PostgreSQL **45 PASS（31 pure + 14 native）**；
  该原件证据与 Root 组合结果分开保存。
- F release policy 在真实临时 PGlite 上 **23 PASS / 0 FAIL / 0 SKIP**。
- A/G/F narrow types、CI test lint、diff check及自有 Core/Worker build通过。

Root 新增 CI paths/steps，保证上述已合入来源的 focused 检查真实运行；
checkout 使用完整 Git history以供原有 immutable migration/source 校验。
新增 architecture 用例验证每个显式 tests/scripts 配置路径存在，防止错误 selector
被测试框架静默遗漏。并未放宽数据库 guard、经济 invariant、授权或来源验证。
provider CI、main merge、Pages 部署和正式浏览器 AFTER 结果须分别以实际回执记录，
本段本地检查不能代替这些尚未完成的证据。

## 保留的激活边界

- 本包没有 SQL/schema、Supabase、旧站 public/auth/storage、开局数据或地图原件改动。
- A 的机制需要真实签名 Owner registry、完整 source bundle 与正式 publication connector；
  当前缺源不是 ADMITTED。原 SQL veto/role/grants 未绕过。
- G 未另建 queue、executor 或权威 state；Social 自动 MATCH 和 Industry 正式 writer 未由此启用。
- F 未注册生产 caller；不会自行发送任意 SQL或接受未知 migration 后缀。
- D 防止示例值泄漏；它没有令正式 API/Worker 连接或让不存在的数值变成 READY。
- 正式 WorldId、完整 opening carrier、真实 lawful seats及 API/Worker/clock 部署证据仍需闭合。
- `status/progress.json`、`status/world-data-selection.json` 的 gate/admission/worker 状态不改写。

源码可正常整合发布与正式经济引擎真正 ACTIVE 是两件事。
缺少前述来源/身份/受控发布与运行目标时，不启动模拟、不臆造数值、不伪报完成。
