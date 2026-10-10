# 窗口交付收口记录 — 2026-10-10

本记录为总控实际核对结果，不改变 `status/progress.json`、gate 或生产状态。
检查点：2026-10-10 19:30 Asia/Shanghai。base main `42991acfee9d0eacc702ba47a380c938a4516f03`。

## 已独审并接入整合分支

| 窗口 | 原固定候选                                 | 独立审查                                                  | 接入范围                                                                                                              |
| ---- | ------------------------------------------ | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| A    | `36ee5c1be849b37a40e97c091af40d3c22398b22` | B APPROVED；4 files / 76 tests PASS                       | 8 个新增文件；严格金融输入、精确多币种计算和证据。仍 BLOCKED、seed=null，不含正式采用或 preflight/publisher 接线。    |
| C    | `60687418ef8235e6505e7e0b117b2115dfca00df` | F APPROVED；90 scoped + 4 independent controls PASS       | 15 文件；三族人工命令确认、原身份 FINAL 查询及 session/私有 DOM 清理。实际 provider/G endpoint 与 Industry 仍未接通。 |
| D    | `3b4406eb8129fffa8c54433433b11b8c6d25b03a` | E APPROVED；25 unit/Core + 3 controls PASS；继承 7 native | 5 个新增文件；显式 SQL lease supervisor。无 timer/Clock/host 启用，真实经济事务仍自行验 fence。                       |
| F    | `d9853754b3eb2080a5ac4d30c71cae4db013fe0c` | D APPROVED；六文件测试/证据范围                           | 6 个新增文件；准确区分历史 CI checkout/native/PGlite，新增 2 条 claim recovery。原运行前 dist 未绑定的限制保留。      |

总控在组合 `2289332b1c5119689202fb009c50b630d483cec3` / tree
`b24c5b9e28c50e06e4f2bb57d12b3b57404530ad` 逐项比较全部 34 个候选文件的 Git blob，
均与对应独审目标一致；cherry-pick 无冲突。这是组合来源核验，不是组合全套 CI 或正式运行验收。
总控还实际重放 F 的只读继承工具，输出逐字节匹配已审 JSON，SHA256
`b4df014a2a69c74ac39846018f9437c3255076a40893d2f4f1183516af3b830e`。

## 未收官项已安排继续

| 工作                   | 当前结论与下一动作                                                                                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E 最小权限设计         | A 对 `68b0f49` 判 CHANGES_REQUIRED。E-01：持 head 后重新取 submission 锁可能造成普通重试死锁。E 只修设计与有界多 session oracle，再做独立增量审查；尚不实施/注册正式 SQL。 |
| G API/executor         | B 对 `f19e8bad` 仅设计批准切片 1/2，G 正在实施有界 raw command 转发、真实 bearer 复核、seat/recovery 及 drain。切片 3/4 的正式构造、消费、Clock 仍 HOLD。                  |
| F 新测试构建来源       | F 在完成 C 审查后，只补 pre-build/runtime dist hash 绑定和全新隔离 PG 的 2-case 重跑；原证据不覆盖、不追认。新增量需独审。                                                 |
| A 正式来源到 preflight | 已安排下一最小设计：复用现有可信采用与 private authority，绑定补充来源和 World；不新造权威，不把计算成功变正式 seed。此设计未批准前不改权威接入。                          |
| 单一组合 CI            | B 正在准备无部署、无秘密的专用 CI；完整检查在一个固定组合 SHA 上集中执行，另显式检查本批严格 tsconfig。不得用路径不存在静默跳过适用检查。                                  |
| 旧站风格迁移稿         | `d1b4c4356a718c80922e2bb42f21a31837c4d49e` 已冻结并推远端，但此前尚未独审/合并。D 已接手定向独审，与 Oct10 地图任务分开。                                                  |
| Oct10 地图视觉         | 《修复 World 地图界面》仍缺连续渐暗及最终桌面/窄屏交互验收；上轮因本机断连停止。已让原窗口先确认一次连接，恢复后继续现有工作区；若仍断连则具体报告，不无界重试。           |

《导出 Season1 队伍表》已交付 36 队/67 成员的私有导出并核验；无需重做。
该统计来源不是 subject→国家→Office→capability/revision 的合法席位发布或生产授权证据，
本轮未读取/公开成员明细，也未用导出表创建席位。

## 审查原件与仓库展示副本

总控完整读取并重新计算以下原报告 SHA256 后才接入相应候选。
`../reviews/` 是内容相同、按仓库格式整理的展示副本；其字节 hash 不冒充原件 hash。
原件仍保存在审查技能的 managed persistent storage，审查中的 source SHA/tree 不变。

| 原报告           | 原始 SHA256                                                        | 展示副本                                    |
| ---------------- | ------------------------------------------------------------------ | ------------------------------------------- |
| B 审 A           | `da532ba412a41adba09c21eb1ee4006b9e3eccd60e42767c98e6dec3a0b0fcff` | [B_A](../reviews/B_A_independent-review.md) |
| F 审 C           | `4edadcbdc3ee448bee1183c148e17cdb7ae376f83cfb912565b5e230f2707c75` | [F_C](../reviews/F_C_F_REVIEW.md)           |
| E 审 D           | `2364b80cd2c2419bf3b5ad0662462d8653addf2afcdc45738c2972203bb7d1e5` | [E_D](../reviews/E_D_REVIEW.md)             |
| D 审 F           | `f0ec9e2cb0365901c4467d36c95714781509cff7ea6017f8e867d55e058ea33a` | [D_F](../reviews/D_F_review.md)             |
| A 审 E（未通过） | `30584c5d66c3bd569ae994a64f61ec06f1f93183d0738a80250ea7a3ba8455b3` | [A_E](../reviews/A_E_REVIEW.md)             |

本检查点尚未 push 本批全部整合、创建 PR、merge main 或执行组合全套检查；后续实际结果另行追加，
不得从已接入整合分支推断已发布。既有 HOLD 部署、唯一旧站数据库发布链与所有 local/CI guards 保持。
真实补充源值/采用、正式 World/seat、最小权限/生产 prefix、staging/TLS 与完整 host/Clock/六角色闭环
仍分别受控；不是“全部完成”或“只差开局数据”。
