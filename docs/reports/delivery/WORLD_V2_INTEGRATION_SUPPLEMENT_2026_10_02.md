# EconMind World V2 — 数据接线与视觉合流补充交付

日期：2026-10-02（Asia/Shanghai）。固定代码基线：World main `fa4b18ce01c5558ab15cfa3e936efbf1cd0a6ef8`。
本文件更新[首轮交付报告](WORLD_V2_DELIVERY_REPORT_2026_10_02.md)中的待办，不覆盖其历史失败、取证或原件。
不是 Gate B 批准书，不更改经济规则、开局状态或正式步骤记录。

## 一、当前结论

主地图动态数字已统一到官方平衡来源；六职位 HUD 和本地计划输入可查看精确来源；共享视觉已沿用固定版本的 EconMind OS 样式。
这些代码均已合并 main。地图新数值层已有两个国家的真实线上读回，但完整 70 国 × 6 职位审查尚未执行。
来源 API 的无数据库凭据实现已合并；新 Storage 发布运输层仍在构建，尚未获得生产 RELEASE_GO 或实际部署证据。
正式经济命令、执行、FINAL 回执与 projection 闭环仍未接入当前国家页面；不能把本地 Confirm 或来源匹配视为正式游戏运行。

## 二、已合并的固定候选与证据

| 交付                                                                                                | 固定候选                                   | 合并 SHA                                                 | 实际检查与边界                                                                                                   |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| C：字段精确来源 [#42](https://github.com/samuelq800/econmind-os-world-simulation/pull/42)           | `90c897670fff8f64b5f55b029c153b5cc9feabc3` | `2a4f0535826f15925f99076a14bbff1a053f02ff`               | B CODE_MERGE_GO；C-UNIT-01 CLOSED；CI `37014452727` / `37014452960` / `37014452666` 成功                         |
| E：无凭据来源快照 reader [#41](https://github.com/samuelq800/econmind-os-world-simulation/pull/41)  | `45cfa2e7a8f28148d3195448fba2fc19f00b147b` | `ae57dc090f736ea17aa9d67b0e1295f10c97e4c6`               | B CODE_MERGE_GO；CI `37013012316` / `37013012976` / `37013012764` 成功；仅代码合并                               |
| E：原网站受控发布准备 [#84](https://github.com/samuelq800/econmind-os/pull/84)                      | `88d26d1a3e27c2c5a9eae78aa3e47553d04e0de9` | `cf4b1f323e4153802d0f37018b9451101106614c`（原网站仓库） | B CODE_MERGE_GO / RELEASE_HOLD；CI `37013179178` 四 job 成功；prepare/mock，不是真实运输或发布                   |
| A：lazy 官方国家 loader [#44](https://github.com/samuelq800/econmind-os-world-simulation/pull/44)   | `74c3266033210851296784cac13ff2708365c867` | `957a4a0ef8c77cf1cfa1c5937846a2d1d5aaf8ea`               | P2 OWNER_FAST_TRACK_ACCEPTED 后 B CODE_MERGE_GO；CI `37015786907` / `37015786892` 成功                           |
| F：主地图实际数值接线 [#45](https://github.com/samuelq800/econmind-os-world-simulation/pull/45)     | `689be21a951a22ef2cb304ee12b084d5142daa31` | `72883bb34753a5889e82b9a10525c15fa932ecf7`               | P2 fast-track 后 B CODE_MERGE_GO，0 BLOCKER / 0 MAJOR；CI `37016792195` 成功，40 聚焦测试；B 独立离线 23/23      |
| D：六职位指标来源 [#46](https://github.com/samuelq800/econmind-os-world-simulation/pull/46)         | `56f77250d7e9a26809b67fe5ebc9ae4a9717a788` | `f6c96747003c6fafa7ad4913bd924242b44723f3`               | P2 OWNER_FAST_TRACK_ACCEPTED；CI `37017721026` / `37017721010` 成功，72 既有 + 23 新增指标测试；B 增量复核待回传 |
| G：共享视觉与精确发布校验 [#43](https://github.com/samuelq800/econmind-os-world-simulation/pull/43) | `5aa237563dfb50e767df01752c6bfa1b4153f874` | `fa4b18ce01c5558ab15cfa3e936efbf1cd0a6ef8`               | P2 OWNER_FAST_TRACK_ACCEPTED；CI `37018383986` 成功，56 聚焦测试；288 原件、75 既有派生、2 精确视觉派生校验通过  |

独立审查的时间顺序保留：A/F 先按用户授权的 P2 fast-track 合并，B 结论随后补入 PR，不倒签为合并前审批。
各 CI 绑定其候选 SHA，不将多个候选的结果拼成一次最终全量验收。

## 三、所有数据范围与页面连接点

选定来源仍为 `BALANCED_2026_09_28_V1`：70 国，人口 **14,712,146,434**，1,374 设施、240 矿藏、122 区域。
87 原始资料、34 JSON、203 地图包文件的既有保存范围不变；本轮没有重新导入、覆盖原件或把提案转成运营权利。
350 历史发展选项不是完整设施目录。986 设施的地图 anchor 为 NULL，目录保留来源点位，不补造坐标。

- 根地图：`WorldExplorer.tsx` → `official-explorer-country.ts` → 固定清单的 `season1-immersive/countries/data/NN.json`。请求限制路径、bytes、SHA、国家身份、超时与重定向；切国退休旧请求，非 ready 不展示旧国数字。
- 国家/六职位：`country-context.js` 提供字段与集合 provenance；`country-game.js` 的 HUD、计划输入和来源抽屉展示 exact/raw token、dataset、row、pointer、unit、unitBasis、nature、hash。
- 只读资料连接：页面配置仍未启用。已有 Edge 子路径 `/v1/world-data/countries`、国家详情、资料目录与分页/分片路由，当前部署目标仍是 `world-v2-official-read`；仅合并代码不能证明端点可用。
- 新来源路径：Pages → credential-free Edge → 固定公开 Storage 源文件。只允许项目 `vimksjrhaxdpnkvgsavz` 的新 bucket `world-v2-official-source-v1`、固定 34 JSON、内容 hash 键；真实运输层和有效 ACL 前检待独立固定候选审查。
- 原 DB reader 路径仍 NOLOGIN / RELEASE_HOLD，已知共享 PUBLIC 有效权限阻塞未被该静态来源替代路径“修复”。旧站产品及旧 bucket/object/ACL 不修改。

来源快照明确 `SELECTED_SOURCE_NOT_RUNTIME` / `STATIC_BASELINE`。只读匹配可称 `VERIFIED_SOURCE`，不能改称 LIVE、开局已提交、Command 已执行或经济状态已改变。
通用 Day/PerDay 单位使用源 day，并保留 `TIME_BASIS_UNSPECIFIED`；只有明确 SimDays 或原文 sim-day 字段可称模拟日。
GCU 仍是场景会计单位；Treasury/CB 合并账户不能直接当作已拆分且可支出的财政余额。

## 四、真实线上读回与视觉证据

F 在 [Pages run 37017238617](https://github.com/samuelq800/econmind-os-world-simulation/actions/runs/37017238617) 成功后，实际验证部署 SHA `72883bb34753a5889e82b9a10525c15fa932ecf7`。
这不是较后的 D/G 最终合流浏览器验收。

| 网址国家      | 实际显示                 | 完整设施目录 | 线上 JSON bytes / SHA-256                                                     |
| ------------- | ------------------------ | ------------ | ----------------------------------------------------------------------------- |
| `?country=70` | Rhea，人口 `89351229`    | 14           | `188532` / `c97a7149b1013ef6ffef4f9e7714466df184caa56b4c758165c538243f6efc68` |
| `?country=01` | Avenor，人口 `105506849` | 16           | `228879` / `ab3fae4db7fc1cbe873c762d169bc221cd9d808a7aa1142d76a57940f5a8ad70` |

各 JSON 一次 HTTP 200 与固定部署 `git show` 字节匹配。桌面 Rhea 键盘 Enter、390×844 手机点击均实际展开人口来源，country=70 的国家操作链接保留 70；warning/error/Runtime.exceptionThrown 为空，手机 01 无横向溢出。
JS 资源名与发布日志匹配，包含新 retry/source hooks，但 JS 与 CI artifact 的逐字节比较 NOT_RUN；不能把资源名匹配写成这一检查已通过。
本次无经济 HTTP、LocalConfirm、DB/config 改动、全性能或完整 420 检查，临时浏览器 tab 已关闭。

D 的离线六职位低压力样本覆盖 01/38/63/70，桌面 Escape 回焦点与移动抽屉可达有实际证据：[桌面](../../ui-evidence/metric-source-finance-offline-desktop.jpg)、[移动](../../ui-evidence/metric-source-maintenance-offline-mobile.jpg)。
G 的 12 页视觉样本与截图明确绑定旧视觉候选 `031f14e`；最终修复仅改 verifier/证据/CI，CSS 与两 HTML 视觉字节不变。详见[共享视觉记录](../world-shared-visual/README.md)，不把旧截图当新合流 420 PASS。

## 五、报错、修复与剩余主线

| 项目                                           | 本轮处置                                                                     | 当前边界                                                   |
| ---------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------- |
| C-UNIT-01：solar 日单位被误称 sim-day          | 修正通用 Day 推断，B 关闭 finding                                            | exact/raw 原值保持，不臆造时间基准                         |
| 根地图仍用旧人口/350 候选                      | A loader + F 全目录接线，代表国家线上读回                                    | 历史烘焙图中文字仍只作历史视觉资产                         |
| G 旧候选 CI `37014670114` publication mismatch | 精确单 tag 还原原件校验、固定 CSS hash 与负例，最终 CI 成功                  | 历史 MANIFEST/PACKAGE 不改；未知 shared 文件继续拒绝       |
| G 模型容量错误中断                             | 从已有进展恢复并完成，无重做截图                                             | 不算代码失败或验收通过                                     |
| 浏览器整体可玩性                               | C 正在交付只读真实浏览器 harness，少量样本不是完整矩阵                       | 最终合流固定 SHA 一次跑 70×6，逐国逐职记录，未跑项 NOT_RUN |
| 来源生产发布                                   | E 构建真实 create-only 运输、精确重试/readback、ACL 前检与一次性凭据生命周期 | 新 P0 候选经 B/CI 后才可执行；不复用旧 DB HOLD 发布        |
| 正式经济闭环 / Gate B                          | 保留既有引擎与准备，不造第二模型                                             | 本地确认仍 LOCAL_NOT_EXECUTED，Gate B PENDING              |

接下来的顺序：先合并并执行 C 的最终 420 矩阵；对真实发现只修相关代码。并行完成 E 的受控发布候选与独立窄审，再做一次真实来源读回和前端配置连接。
其后解决既有开局语义、权威命令/执行/回执/projection，才可做正式经济可玩性与 Gate B 验收。
队伍、人员、大厅仍延期；不伪造最终席位。420 页可达与静态数据正确，不足以证明正式经济闭环可玩。

本补充仅修改 README/记录性文档；格式、相对链接与 diff 检查即可，不为文档重复全量经济测试或生产读写。
