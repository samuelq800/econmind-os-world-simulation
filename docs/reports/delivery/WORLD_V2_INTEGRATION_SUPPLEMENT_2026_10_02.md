# EconMind World V2 — 数据接线与视觉合流补充交付

日期：2026-10-02（Asia/Shanghai）；补充更新于 2026-10-03。
最新已合并地图/布局基线：World main `66d57ec3a2bfa47d2d2081ee746214c111795105`。
下文 15:20 UTC 各项保留为当时检查点，不当作更新后的状态。
本文件更新[首轮交付报告](WORLD_V2_DELIVERY_REPORT_2026_10_02.md)中的待办，不覆盖其历史失败、取证或原件。
不是 Gate B 批准书，不更改经济规则、开局状态或正式步骤记录。

## 一、当前结论

最新实际状态：main-site #90/#91/#92 均经固定候选独立窄审、同 tree 实际 CI 并由 Root 合并。#92 main `fc5c328965403cbbbf9b77a3639559cc7bb619df` / tree `d40257fec85c2a70a11265eabf2a5862545299ad` 的唯一新授权 publish `37130549747` / job `111224628180` / attempt 1 实际 **SUCCESS**。同 run fresh 权限否决验证、固定 World source `ae57dc090f736ea17aa9d67b0e1295f10c97e4c6` / function tree `4d38784bf907397e2a71d0f1ff654d9e3cc3991c` / DB proof `36672349466`、34 JSON 完整公开字节校验、新 reader 部署、旧 7 函数身份保全、GET200/OPTIONS204/exact CORS 均成功；RELEASE_LOCK 已撤销，全部 World 锁名回读为空。

范围：选定输入 34、最终公开 byte-verified 34、未完成 0；87 原始来源验证，不等于另 53 原件或 203 地图上传 Storage。既有回执未分别记录 bucket create / 新 object POST 次数，不能写成“新创建 34 个对象”。新 reader ACTIVE/version1/verify_jwt=false；路由来源是 `HASH_PINNED_IMMUTABLE_SOURCE_SNAPSHOT`，`database_projection=false` / `live_world_state=false`。子 Storage 回执保留其原阶段 `deployment=NOT_RUN` / `production_release=HOLD`，实际后续部署由独立 function/route 回执证明，不篡改子回执。

耐久目录 `/Users/samuel/Documents/econclub/artifacts/e-snapshot-publish-compat92.7MGt6k/receipt/`：Storage SHA-256 `710001d829dd2cb35e0dc488df9777e69aa1e5121df9680ee6bd7066201628bf`；function `3457f1cd405719d8eb896d59017c47da2041ffc33cf65d932d8c05e7285b86a0`；route `13a33e563a4e49cba5ef0e4e8797e2ea48578b95e867f19182b092bf9295c826`；permission `ed27c28e34cce80304c7edd5399e8d8495fd87afe37055ce5a94c9d219e2949a`。Root 实际读取前三项并重算 hash 一致。GitHub artifact `11276344090` digest `49c5155e3c6e9622c8dde2b5ed7d9398018211ba41a26fe34bb5cb8bec6d8c42`。

A 已获一次全资料 API 只读验收授权，B 窄核实际发布回执，G 仅准备 Pages 接通路径；这些验收尚未交付。页面 API 配置仍未启用，完整经济执行、LOGIN/World/Core/Worker 和 Gate B 未获本次放行。以下故障及中间 HOLD 保留为历史顺序，不覆盖本段最新成功，也不因成功抹去历史 UNKNOWN。

新增历史：#90 单次 publish `37044748085` 在首次 bucket GET 失败，Storage write 0；#91 单次诊断 `37128962923` 观察 HTTP400/`KNOWN_NO_SUCH_BUCKET_SHAPE_NOT_ABSENCE_PROOF`，只 Management GET1 + bucket GET1、write0，锁已确认退休。诊断 SHA `83a6a392ac169e77e7914d15d17cef16d626173a8c582ebe6091738b3629618c`；不据此推断 bucket absence/key usable/旧失败根因。#92 只增加 bucket 专用严格 HTTP400 识别，所有 create-only/no-overwrite/失败 UNKNOWN_STOP、对象读取与权限规则保留。

最新增量：World #50 及原站原子发布封装 #87 已经独立审查、CI 通过并合并。
唯一授权 policy 发布 run `37031019041` 的 Management 请求步骤成功，但回执校验失败
`SNAPSHOT_POLICY_PUBLICATION_EVIDENCE_INVALID`，实际数据库提交/回滚为 **UNKNOWN**。
已停止，不重放 DDL、不盲目重试；临时发布 lock 已删除；34 文件运输、取 key、Edge 部署和经济启动均 NOT_RUN。
后续 main-site #88 的严格 OID 验证修复及一次纯 SELECT 恢复入口已由 B 独立 25 项窄审、真实 PG17 完整 CLI 及常规 CI 通过，Root 合并 `9d1207921a5f2715268d9f98547ef81bd8775e08`；原 proof finding CLOSED_IN_CODE，原生产 run UNKNOWN 不变。
Root 已单独授权的一次纯 SELECT run `37036290594` 已产生真实回执：`CURRENT_STATE_RECOVERED / EXACT_VETO_AND_LEDGER22_PRESENT`，精确两 policy+ledger22 当前存在，历史前 21 条/旧权限摘要、NOLOGIN/NOINHERIT、source inactive、空新 bucket/object 等 guards 全 true，普通角色 Storage write DENIED。
耐久原件 `artifacts/e-policy-current-state-readback.vVgEPT/readback.json` SHA-256 `6201a29a79d6766b32b974667c14928ef14df342a5e052b8fe2f7c42dcb87f4e`，Root 实际重算/读取一致，B 独立从真实 artifact 核对一致。
READBACK_LOCK 已退休并回读各锁名字为空；原 `37031019041` 仍 UNKNOWN，历史完整 ACL/bucket 保全仍 NOT_EVIDENCED，不能补造旧成功。
条件已成立，Root 另授权既有 #85 一次新鲜权限 preflight（请求 ID `CT-SNAPSHOT-PREFLIGHT-POSTREADBACK-37036290594-V1`），B 同步窄核真实回执；无 key/Storage/Edge 发布授权，不重放 DDL。

更新：新鲜 preflight `37037210421` 实际 PASS，权限原件 SHA-256 `ed27c28e34cce80304c7edd5399e8d8495fd87afe37055ce5a94c9d219e2949a`；B 独立真实回执窄核后给 existing85 技术 RELEASE_GO。
Root 另行单次授权 publish `37038527126`，实际 **FAILURE** 于 `SNAPSHOT_PUBLISHER_KEY_AMBIGUOUS`。
凭据 metadata 响应已收到，但未选出可用 publisher key；候选数量未记录，不能推断多个 key、缺 key 或类型错误是哪一种。
transport callback 未进入、Storage API 调用 0：输入 34、attempted/created/byte-verified/对象操作失败均 0、not-attempted 34。
新 Edge deploy、GET/OPTIONS/CORS 全 SKIPPED/NOT_RUN；Pages URL 配置不改，来源 API 仍未接通。
runner 私有文件已清理、RELEASE_LOCK 退休、各 World 锁为空；无远端 cleanup/覆盖/迁移/LOGIN/经济启动，原 UNKNOWN 不变。
耐久 `artifacts/e-snapshot-publish-once.OHX0P4/handoff.json` SHA-256 `29af83ed49810983e722c48cda4f2d4040655472350133f95a4f879d1d100c87`，Root 实际重算/读取一致。
下一步仅离线按[官方 Management API 契约](https://supabase.com/docs/reference/api/v1-get-project-api-keys)检查 selector、区分非秘密失败类别；必要时准备独立有界 metadata-only 诊断候选，经 B 窄审和 Root 新授权后才运行。
本次失败不自动重试，不搜索旧站环境密钥、不新建/轮换 key、不泄漏原 API 响应。

后续 main-site #89 固定 head `e882e1ca3520018458879c2b81fc351558d294b2` 经 B 独立窄审通过，Root 合并为 `33d504540d0f11f7f61d3a601a394911eed8795d`；CI `37040873808` 五 job 成功，测试 checkout 为合成 merge，完整 tree 与候选一致，不冒称纯 head 检查。
Root 新授权 ID `CT-SNAPSHOT-KEY-METADATA-37038527126-V1` 的唯一 metadata-only run `37042407081` / job `110955490935` 实际 SUCCESS，绑定上述 main/tree；固定 `GET .../api-keys?reveal=false` 恰好一次，无重试、选 key、Storage、Edge 或数据库操作。
仅聚合回执：当前 4 entries（2 legacy、1 publishable、1 secret），严格 role predicate 匹配 1 modern service-role secret 和 1 legacy service-role，合计 2；没有保存 key/id/custom name/template/raw response。当前 metadata 不证明历史失败根因或 key 可用性。
耐久原件 `artifacts/e-snapshot-key-metadata-once.XzCXaR/receipt/metadata.json` SHA-256 `cff069ca818066dd13042d0b14f04876b87e833dc92f41fb75a9a60f4febbefc`，Root 实际读取/重算一致。METADATA_LOCK 已撤销，全部 World V2 锁名为空。
下一步 E 仅构建最小 admission 候选：唯一严格合格 modern 优先，多个 modern 拒绝；没有 modern 时才允许唯一严格 legacy；选中 modern 非法或缺值停止，不 fallback。格式/ref/role 检查不放宽，需 B 新固定候选窄审、新 fingerprint 和 Root 新单次授权才可发布。当前 publication retry 仍 HOLD，34 文件真实 API 接线未完成。

完整原始 70 国 × 6 职位 × 桌面/手机的 **840 HOME 原图已全部实际目视**，583 有问题、257 本范围未见重大问题、0 未查看。
原始功能矩阵完成 420/420 组合，2,520 来源抽屉通过；旧异步导航 harness 阻塞和 7 个短超时失败均保留原件。
19 个对应控件有界复核未复现，但不改写原始 FAIL。#58 的 navigation-only 补充已完成全部 840：838 PASS、59/central_bank/desktop 本地连接中断后 FAIL、60/finance/desktop 可见入口等待超时 BLOCKED；0 NOT_RUN。仅两项独立有界复核现均未复现，真实返回身份/href 和 59 的实际职位切换正确，零 page/console/request error；原件不改。
#61 共享布局修复已合并；后续修后全 840 HOME 实际目视已完成，未发现新的阻断性主布局问题。
#64 手机 drawer 的视口包含、单内部滚动、sticky Close/完整换行改进另已合并；14 实际列表样本和聚焦 CI 通过，但真实偶发文字前缀缺损在 3 清洁 context 诊断未复现、因果仍未确认，保留 IMPLEMENTED_UNVERIFIED。
不把 HOME 无阻断扩大成全页、全字段或正式玩法通过；原先 583 问题原件及新列表/marker/混合语言待办均保留。
详见[完整视觉记录](../world-connection/O_FULL_VISUAL_BASELINE_2026_10_03.md)。

#57 响应式地图原件目录/入口已合并。Pages run `37026163647` 已成功，Root 实际六次 HTTP 读回
与固定发布字节/hash 匹配（目录和三份地图原件样本），见[只读线上回执](../world-connection/O_PAGES_MAP_READBACK_2026_10_02.json)。
不表示全部 203 原件线上 hash 检查。#60 Root 世界总览/国家 FIT 自适应已合并 `c1354ac`；最终 head `4800a12` CI `37032206789` 通过，保留 #61 的测试/布局。Root 实际查看手机、短桌面总览修后原图；最新线上验收另行进行。

以下段落保留 15:20 UTC 的历史状态；上述增量优先。

主地图动态数字已统一到官方平衡来源；六职位 HUD 和本地计划输入可查看精确来源；共享视觉已沿用固定版本的 EconMind OS 样式。
这些代码均已合并 main。根地图另已完成固定版本的 70 国本地真实浏览器数值/来源检查；完整 70 国 × 6 职位功能矩阵及逐张视觉检查正在进行，尚未全部通过。
来源 API 的无数据库凭据实现与受控 Storage 运输层均已合并；真实前检发现新 bucket 写入否决策略缺口，仍无生产 RELEASE_GO 或实际 Edge 部署证据。
正式经济命令、执行、FINAL 回执与 projection 闭环仍未接入当前国家页面；不能把本地 Confirm 或来源匹配视为正式游戏运行。

## 二、已合并的固定候选与证据

### 15:20 UTC 增量检查点

下列是新增代码合并，不是正式经济运行验收。以上时间之后的结果须由后续记录补充。

| 交付                     | 固定候选                                   | main 合并                                  | 证据与限制                                                                                                                                             |
| ------------------------ | ------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C #48 浏览器矩阵工具     | `d5618f3b659b14576a50eef168140e06c6b9ceac` | `8992178303677ec0f54398f3401a38bfbac0b528` | 实际本地 9/9 fixture；原始全矩阵固定 UI `85725830` 运行中。异步 atlas 返回链接读取竞态正在独立修 harness，原始失败报告保留                             |
| F #49 只读职位/地图导航  | `145544b9fcf9dfbda08add84ad0f0a27c15a2d88` | `85725830f0a6d102e73ae89697ab008f92208285` | CI `37021607088` / `37021607373` 成功；不授予席位、不提交命令                                                                                          |
| A #51 全资料只读检查工具 | `e55ef95de8b21d2efd6d092ae6a99e505adfba7f` | `9b48a1618ce86ddebb08ab0617fc93552d4a28c5` | 本地 9/9 fixture；Root 固定 Node 24 实际执行 plan，87 原件、34 JSON、70 国身份通过；真实 API 执行 NOT_RUN                                              |
| D #52 全地图原件发布     | `d9cdc8db58f2ab829bb1cefb2bc25bb261592c02` | `27b8e157e8a41f1b5137144fa7498a5e3800e3c2` | 同 SHA 三 CI 成功；203 文件原字节复制到 manifest-hash 路径，160 图像/43 支持文件。实际 build 937,544,136 bytes；在线读回尚未完成                       |
| F #54 根地图卡片换行     | `e2826232d11f675d39f0240a2314e3d125c22ad7` | `f7c70cf7d14a232bcce8641bdf9e9a291078f249` | CI `37024934971` 成功；Root 实际看过 70 手机与 01 桌面修后原图；既有 dot/card 几何重叠保留为问题，不宣称 pixel-perfect                                 |
| G #53 来源连接状态/入口  | `26490f533bd7b011d30c16f3454a526b95193a06` | `ab6e21cd3b7888ca9d8ff28504241c511425b771` | CI `37024682214` / `37024682156` 成功；实际 mock 浏览器 5 样本，不是真实生产 API。Root 与 immersive 共用唯一 postbuild URL 配置；生产仍 NOT_CONFIGURED |

Root 已独立审阅 #51–#54 的固定实现/证据并按 P2 接受；这不是 B 的生产批准。
在合流 SHA `ab6e21c` 上，Root 使用 Node 24.20.0 / pnpm 12.3.4 实际执行地图发布、来源目录/视图、页面配置、根地图 preview 的 5 个测试文件，117/117 PASS；不是全项目检查或全部浏览器验收。
合流 Pages run `37026163647` 此检查点仍 pending，不把代码合并写成部署完成。

视觉审查按 D（Captain/Finance）、F（Industry/Trade）、G（Central Bank/Social）分配，各 140 国家—职位组合、桌面及手机共 280 画面，总计 840 画面。
截图生成、DOM 几何断言和真正目视分别记录；未实际看过的仍为 `NOT_VISUALLY_REVIEWED`。
已实际发现手机设施标签被规划卡遮挡、部分操作入口被资源 HUD 压住、长职位名截断，以及少数桌面标签遮住任务文案。D 是共享派生布局修复唯一 owner；不改原始 UI archive/MANIFEST，不隐去问题、不复制经济测试。

F 根地图固定 UI `85725830` 已完成 70/70 本地浏览器来源/链接 PASS，覆盖 1,374 设施、240 矿藏、122 区域；不是 70 国线上或 420 六职位视觉 PASS。
数值报告 SHA-256 `c1c296a6064deed850581226c38b98be902c9c3fc5e5bf0bde52594aca4bf1aa`，mobile 来源补充 `f0d6b9ba3b51ee076d499b1f3a1355c2a922a69f0eb5a54cdb53affcb029c4d8`。

### 真实发布前检：HOLD 的具体原因

原网站 #85 固定候选 `33bbbcd5ef051a80a1743b8abfde651d707e2eba` 经 B `CODE_MERGE_GO / PREFLIGHT_GO / RELEASE_HOLD`、CI `37019384434` 后，合并 `a864390327194171c61ffc8abf15f4e5ec2db1a1`。
E 按唯一发布路径在该 SHA 执行一次只读前检 run `37021759785`，run 成功而 receipt 为 `SNAPSHOT_STORAGE_WRITE_BOUNDARY_BLOCKED`：authenticated 对新 Storage objects INSERT/DELETE 缺少可证明的 restrictive veto。
未取服务 key、未写 Storage、未部署 Edge；临时 preflight lock 已删除，release lock 未设置。此替代来源路径未解除原 DB NOLOGIN/PUBLIC 权限 HOLD。

受控修复候选 World #50 仅添加新 bucket 对 anon/authenticated 的两条 restrictive INSERT/DELETE 否决策略及受控 ledger entry，不修改旧数据/旧策略。
旧候选 `7f9f3102dfc090995486844b6e31ac11d0c8af31` 必要 CI 因完整 manifest consumers 未适配新 0022 而失败，B `CHANGES_REQUIRED_LOCAL`，不能合并。
新固定候选 `ea89db1cf05aa34384ebd908aba498e3703a28c9` 修 disposable fixtures 与历史 0021 前缀，SQL hash 不变；此检查点 native job 与 scoped CI 通过，但完整 official check/B 增量闭合仍未结束。生产原子封装另行审查，任何数据库写入或发布都未发生。

以下表格保留此前固定候选记录。

| 交付                                                                                                | 固定候选                                   | 合并 SHA                                                 | 实际检查与边界                                                                                                                    |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| C：字段精确来源 [#42](https://github.com/samuelq800/econmind-os-world-simulation/pull/42)           | `90c897670fff8f64b5f55b029c153b5cc9feabc3` | `2a4f0535826f15925f99076a14bbff1a053f02ff`               | B CODE_MERGE_GO；C-UNIT-01 CLOSED；CI `37014452727` / `37014452960` / `37014452666` 成功                                          |
| E：无凭据来源快照 reader [#41](https://github.com/samuelq800/econmind-os-world-simulation/pull/41)  | `45cfa2e7a8f28148d3195448fba2fc19f00b147b` | `ae57dc090f736ea17aa9d67b0e1295f10c97e4c6`               | B CODE_MERGE_GO；CI `37013012316` / `37013012976` / `37013012764` 成功；仅代码合并                                                |
| E：原网站受控发布准备 [#84](https://github.com/samuelq800/econmind-os/pull/84)                      | `88d26d1a3e27c2c5a9eae78aa3e47553d04e0de9` | `cf4b1f323e4153802d0f37018b9451101106614c`（原网站仓库） | B CODE_MERGE_GO / RELEASE_HOLD；CI `37013179178` 四 job 成功；prepare/mock，不是真实运输或发布                                    |
| A：lazy 官方国家 loader [#44](https://github.com/samuelq800/econmind-os-world-simulation/pull/44)   | `74c3266033210851296784cac13ff2708365c867` | `957a4a0ef8c77cf1cfa1c5937846a2d1d5aaf8ea`               | P2 OWNER_FAST_TRACK_ACCEPTED 后 B CODE_MERGE_GO；CI `37015786907` / `37015786892` 成功                                            |
| F：主地图实际数值接线 [#45](https://github.com/samuelq800/econmind-os-world-simulation/pull/45)     | `689be21a951a22ef2cb304ee12b084d5142daa31` | `72883bb34753a5889e82b9a10525c15fa932ecf7`               | P2 fast-track 后 B CODE_MERGE_GO，0 BLOCKER / 0 MAJOR；CI `37016792195` 成功，40 聚焦测试；B 独立离线 23/23                       |
| D：六职位指标来源 [#46](https://github.com/samuelq800/econmind-os-world-simulation/pull/46)         | `56f77250d7e9a26809b67fe5ebc9ae4a9717a788` | `f6c96747003c6fafa7ad4913bd924242b44723f3`               | P2 fast-track 后 B CODE_MERGE_GO，0 BLOCKER / 0 MAJOR；CI `37017721026` / `37017721010` 成功，72 既有 + 23 新增；B 独立离线 23/23 |
| G：共享视觉与精确发布校验 [#43](https://github.com/samuelq800/econmind-os-world-simulation/pull/43) | `5aa237563dfb50e767df01752c6bfa1b4153f874` | `fa4b18ce01c5558ab15cfa3e936efbf1cd0a6ef8`               | P2 OWNER_FAST_TRACK_ACCEPTED；CI `37018383986` 成功，56 聚焦测试；288 原件、75 既有派生、2 精确视觉派生校验通过                   |

独立审查的时间顺序保留：A/D/F 先按用户授权的 P2 fast-track 合并，B 结论随后补入 PR，不倒签为合并前审批。
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

| 项目                                           | 本轮处置                                                                 | 当前边界                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------- |
| C-UNIT-01：solar 日单位被误称 sim-day          | 修正通用 Day 推断，B 关闭 finding                                        | exact/raw 原值保持，不臆造时间基准                   |
| 根地图仍用旧人口/350 候选                      | A loader + F 全目录接线，代表国家线上读回                                | 历史烘焙图中文字仍只作历史视觉资产                   |
| G 旧候选 CI `37014670114` publication mismatch | 精确单 tag 还原原件校验、固定 CSS hash 与负例，最终 CI 成功              | 历史 MANIFEST/PACKAGE 不改；未知 shared 文件继续拒绝 |
| G 模型容量错误中断                             | 从已有进展恢复并完成，无重做截图                                         | 不算代码失败或验收通过                               |
| 浏览器整体可玩性                               | C 的只读真实浏览器 harness 已合并并运行矩阵；少量样本不是完整验收        | 功能矩阵与真实目视分开计数，未跑项 NOT_RUN           |
| 来源生产发布                                   | 运输层已合并，真实前检发现 new-bucket veto 缺口，E 修复受控策略/原子封装 | 新 P0 候选经 B/CI 后才可执行；不复用旧 DB HOLD 发布  |
| 正式经济闭环 / Gate B                          | 保留既有引擎与准备，不造第二模型                                         | 本地确认仍 LOCAL_NOT_EXECUTED，Gate B PENDING        |

接下来的顺序：完成 C 的原始 420 功能矩阵并保留报告，对 harness 导航竞态只补导航检查；完成 D/F/G 的逐项目视，对真实发现只修相关布局并回看。并行完成 E 的受控策略/生产封装候选与独立窄审，再做一次真实来源读回和前端配置连接。
其后解决既有开局语义、权威命令/执行/回执/projection，才可做正式经济可玩性与 Gate B 验收。
队伍、人员、大厅仍延期；不伪造最终席位。420 页可达与静态数据正确，不足以证明正式经济闭环可玩。

本补充仅修改 README/记录性文档；格式、相对链接与 diff 检查即可，不为文档重复全量经济测试或生产读写。
