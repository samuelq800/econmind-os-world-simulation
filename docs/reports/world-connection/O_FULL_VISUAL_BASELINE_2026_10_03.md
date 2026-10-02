# 70 国 × 六职位：完整原始视觉检查与修复证据

记录日期：2026-10-03（Asia/Shanghai）；原始截图固定 World UI
`85725830f0a6d102e73ae89697ab008f92208285`。本记录不批准经济运行或 Gate B。

## 已实际检查的原始画面

70 国 × 6 职位 × 桌面/手机 = **840 个 HOME 画面**，420 个国家—职位组合。
全部原图已实际目视；未查看数为 0。不是以截图生成数量、DOM 断言或工具退出码代替目视。
原始检查发现 583 个画面存在视觉问题，257 个画面未发现本次范围内的重大碰撞。
后者不表示全部设施点位同时可见、全功能可玩或生产接线通过。

| 实际目视分工                    | 画面数 | 有问题 | 本范围未见重大问题 | 耐久证据位置（workspace 相对路径）                                 |
| ------------------------------- | -----: | -----: | -----------------: | ------------------------------------------------------------------ |
| F：Industry / Trade，01–70      |    280 |    184 |                 96 | `artifacts/f-industry-trade-visual-preserved.2yCzN0/`              |
| G：Central Bank / Social，01–70 |    280 |    182 |                 98 | `econmind-g-bank-social-visual-evidence/20261002T1511Z/`           |
| D：Captain / Finance，01–05     |     20 |     20 |                  0 | `.econmind-artifacts/d-captain-finance-8572583/manual-review.json` |
| F：Captain / Finance，06–38     |    132 |     89 |                 43 | `artifacts/f-captain-finance-06-38-baseline-review/`               |
| G：Captain / Finance，39–70     |    128 |    108 |                 20 | `econmind-g-captain-finance-visual-evidence/20261002T1546Z/`       |

上述位置以 `/Users/samuel/Documents/econclub/` 为根，不是发布到网站的路径。
原件和逐图 hash 留在本机交付证据目录，未把 840 张图片重复提交到 Git。
F 第一组临时目录的全部原件已复制到上述耐久目录，hash 未改变。

关键记录 SHA-256：

- F Industry/Trade visual matrix：`e8b3db382f02b92f8b21280199e43c3a8df49e5061343b158b1d4e95577409d0`。
- G Bank/Social visual report：`e35d86fa0dc62792893cfc909d18ba0201168b5788331150587edfab7151ec27`。
- F Captain/Finance 06–38 matrix：`5094c7a4aeb2e13d3d76a70be56136de65f94036ff936b810cc5bedcaf738485`。
- G Captain/Finance 39–70 matrix：`8c4ae26963a9e857ffbebdec9bd3464e2a976e146412ad55cf3fe08c0eaba717`。

主要问题模式：手机选中设施标签被规划卡或 footer 遮挡/挤出页面；工具入口被 HUD 压住；长职位标题截断；少数桌面标签/marker 遮住任务文字。
源 anchor 为 NULL 的记录必须保留在完整设施目录，不能补造坐标或把不显示 marker 等同于记录删除。

## 对应修复：不是抹掉原始问题

[D #61](https://github.com/samuelq800/econmind-os-world-simulation/pull/61)
固定候选 `7867a79f4f577115a46a652cd140bfb2f03eb6f7`，合并 main
`ca522a19c8471c9f2d89d79ebcc2f2dd6da9c3da`。
仅派生共享布局、聚焦测试/CI与证据：手机纵向内容流、完整职位标题、可见工具入口、选中设施 dock、桌面装饰 marker 区域裁切；不改源坐标、数据、原 UI archive/MANIFEST 或经济权限。

合并前实际修后样本为 108 个 HOME 画面、324 次工具打开；另实际查看 4 个来源抽屉底部样本。
CI `37030821721` 的 63 项聚焦测试通过。Root 已实际查看四张交付原图并审阅实现。
这不是修后全 840 画面 PASS。
合并后 D/F/G 分别承担 Captain/Finance、Industry/Trade、Central Bank/Social 的固定
`ca522a1` 各 280 个画面复核。D、F、G 均已完成；修后全部 **840/840 HOME 实际目视，0 未查看**。
按完整 Local Sites 与 dock 替代边缘装饰 marker 的限定 HOME 标准，未发现新的阻断性主布局问题；不扩大为所有抽屉、所有设施行或完整玩法通过。
D 已完成 Captain/Finance 的 280 次 Local sites 打开和 140 次手机到底滚动；F、G 分别完成 Industry/Trade、Central Bank/Social 的独立 280 HOME 实际目视。

D 结果为 `PARTIAL_HOME_PASS_AUXILIARY_UX_ISSUES`，不是全页 PASS：主 HOME 标题/入口/map/dock/工具/底部流程未见新遮挡，但手机设施列表还有两层滚动、长文本裁切与混合语言。66 手机中心 marker 文字重叠、桌面边缘装饰 pin 裁切分别记录；完整目录/dock 可替代 marker，不造 NULL 点位。
报告 `.econmind-artifacts/d-captain-finance-post-fix-ca522a19/POST_FIX_REVIEW.md` SHA-256
`5c489944b986bec6e1f87cbb9a17edffef5452f5b99a02fbad5b320ca5a2a38e`，
280 行台账 `manual-review.json` SHA-256 `a9cd2ac3b1b7f8e797be0eb33f081a4b9e91d0be6df99a5859d263ef9aa4ec38`；Root 实际重算一致，实际查看 57/70 手机恢复原图确认问题。
新授权仅修派生手机 drawer 视口包含、单滚动与列表完整换行，原记录/文字/IDs/源 hash 不改；混合语言不靠修改源 name 掩盖。

F 的结论为 `NO_BLOCKING_HOME_ISSUE_OBSERVED`，不等于全页/全发布 GO：70 张原尺寸板图含全部 280 HOME，另实际查看 10 HOME 原图、20 drawer 原图、10 页尾原图与 2 有界 drawer reachability 原图。
280 次 Local sites 打开保留完整源 ID；没有逐行视觉接受全部设施。F 同样确认手机 drawer 双滚动摩擦及 66 手机装饰 marker 集群，已并入 D 的同一修复责任，不重复开工。
耐久 `artifacts/f-industry-trade-postfix-ca522a19/POST_FIX_HANDOFF.md` SHA-256
`619a2250af05980eacfbc052d8e6c5811f32a32ab0910d27ba64c24fcffd38bd`；
逐画面 `postfix-visual-matrix.json` SHA-256
`df73c15ae71e26c321877a1fde21acfc5a3c4f0a8a419984d6d06a5867a139ca`。
Root 实际重算一致；F 已停止，未修改产品/数据库/正式状态。

G 的 Central Bank/Social 280 HOME 均单独展示原始 PNG 后判定，另 5 个 Local Sites/滚动/最后记录选择样本、18 辅助原图实际检查。
其中列表计数 21/21/20/20/25 与源 IDs 相同；66 手机装饰集群 10/79/41 重叠仍记账，完整 25 记录可达；56–62 NULL 不造点。
耐久 `econmind-g-bank-social-postfix-evidence/20261002T1610Z/POST_FIX.md` SHA-256
`34ba86a7899f1b924adb289118abdf1d097d532483d876c5f963453b76742c2c`；
逐图 `RESULTS.json` SHA-256 `e6e999530bf18087b348210f0cf94d9ac05a7b94d2f561ca6de7794b9a7c699a`；
`PROVENANCE.json` SHA-256 `5dc0d669729e024231aa3cc9e35c99be0fa5c3c0009cd15f3ec798a6f47b8541`。
Root 实际读取报告/重算 hash 一致。G 已停止，本地预览关闭；未修改产品/生产或旧 baseline。

### #64：手机列表的部分改进与仍未闭合字形问题

固定候选 `e4ab2db7c02b350dbbbd01402018dcc5a09f9aee`，合并 main
`66d57ec3a2bfa47d2d2081ee746214c111795105`；仅派生 CSS 与 3 个聚焦测试追加，不改 JS/JSON/raw names/IDs/单位/archive/MANIFEST。
手机 drawer 固定于视口 safe-area 内、单内部滚动、sticky Close、长文本单列完整换行；Source intel 旧 inline bounds 被有限覆盖，source details 与焦点恢复保留。
14 真实列表样本保持 ordered IDs 精确，12 手机末卡/Close 在视口内、pageScroll=0，3 source details/error/Escape 样本有证据；同 head CI `37035476222` SUCCESS，78 atlas/camera/layout 聚焦测试。

Root 实际看过 delivery/isolated57/70原图，**57 曾真实出现 ID/名称前缀缺损**；不能用 DOM 完整或几何 PASS 关闭。
后续严格 3 个清洁 context、同 57 Finance、fonts.ready/双 RAF、有界对比默认字体与 system font/paint reset，10 原图均实际查看且未复现；没有“失败→修好”的因果对比，不更换产品字体。
字形问题保持 `IMPLEMENTED_UNVERIFIED / INCONCLUSIVE`；本合并仅接受已证滚动/关闭/换行改善，不是完整文字修复或整页 PASS。
耐久 `.econmind-artifacts/d-mobile-drawer-86ee5be/REPORT.md` SHA-256
`ed67d7fb5149ae7e7a0f4f01fc3e403536d45aeadffe4f149486dbc579c380f3`；
`delivery/evidence.json` SHA-256 `45726db57d1ba879b9e95ee6ea49956e17bcfc2f4c04b6c8687e888acb87a50d`；
`font-diagnosis/DIAGNOSIS.md` SHA-256 `df91b5547826ad0ca60a93d10a71ba77cf0550954bbf87f145014705eea5092a`。
Root 重算一致，另实际查看默认字体诊断原图。此前缺损原件不改；混合语言与装饰 marker 集群仍为单独待办。
本修复只改抽屉/打开态表面，未把其样本扩大为重新执行 840 HOME 或全部浏览器验收。

主 Root atlas 自适应由 A #60 独立候选完成：FIT 随窗口调整，MANUAL 保留用户平移/缩放；世界总览包含原始完整 frame，手机与短屏不再使用旧 700 宽裁切。
Root 已实际查看手机与短桌面修后原图。最终候选 `4800a124da4ddf07ada313a7a9c402d0aeeac793` 保留 #61 布局和两组测试；CI `37032206789` 通过，合并 main `c1354ac857eb65b9fd573b6deadd7ebd2d0f10c0`。

### #60 / #61 的有界真实线上验收

A 已实际绑定 Pages `37032508901` 的产品 SHA `c1354ac`，build/deploy SUCCESS；不把之后的文档 SHA 误写成该产品部署。
24 份选定静态资源实际 HTTP 200 与固定源/已审阅 build hash 匹配；22 张原始截图已由 A 逐张实际查看，Root 另实际查看手机 390×844 与短桌面 1440×500 的总览原图。
两种总览完整包含原始 1774×887 frame；短桌面 map 底部为 500px。

01/56/64/70 的完整设施 ID 分别为 16/20/24/14，最后一项实际打开再返回完整目录；Root 底部 pager 可达。
每国六职位入口保留国号，对应 24 份实际公开页面身份检查正确。
finance01 / central_bank56 / industry64 / social70 的真实 atlas 点击及返回保留国家、职位，390×500 与 1440×500 实际滚动可到页尾并返回顶部。
没有全 70 国线上 gallery、840 线上页面或全指标重新验收；短桌面标题仍覆盖部分地图标签，未宣称 label-layout 重设计。

耐久原件在 `artifacts/a-pr60-live-preserved.EDLPz2/`（workspace 根下），包含全部 earlier harness attempts 与 22 张原图。
`results.json` SHA-256 `7f8d346eb950395c0ed0df74ee5a04277ac32006eab849ecf7db26f07eed3fef`，
`REPORT.md` SHA-256 `ef14a16e9a61561026c42a81debbba3c81b371ea7981be2609e45d211ed4a059`；Root 实际重算并复制保存，一致不改。
Root 来源为 `NOT_CONFIGURED`，角色抽屉为 `NOT_CONNECTED / API_NOT_CONFIGURED`，可见“不替代值”；没有真实来源 API GET 或经济动作。
原 global network-idle 超时、两项本地取证脚本错误和五个 unused journey image `ERR_ABORTED` 均保留；只在目标 DOM/首图就绪后完成实际返回，不把取消图片声称为加载成功。

## 功能矩阵与目视分开记录

C 原始只读浏览器矩阵在固定 `85725830` 完成 420/420 组合、840 views：
`artifacts/country-role-qa/85725830-20261002.vDlkrJ/full-420.json`，
SHA-256 `a0481d2aa038b1844893ac160250b287885a8641dad77f10266975489b02ad15`。

- 2,520/2,520 指标/来源抽屉字段、dataset hash 与 provenance 检查通过。
- 原始结果为 0 PASS / 7 FAIL / 413 BLOCKED；840 views 的异步 atlas 返回链接读取存在 harness 竞态。
- 7 个失败画面的 19 个对应控件以 3 秒有界、只读 trial/focus 重查，19/19 未复现；结论是 `NOT_REPRODUCED_IN_BOUNDED_RECHECK`，原始 FAIL 不改写。
- #58 的独立 navigation-only 补充已实际完成 840/840，838 PASS / 1 FAIL / 1 BLOCKED / 0 NOT_RUN；固定 helper/UI 为 `74768eafc8461767a02c3a7008e3acf8ccfbb4d9`，四个 UI trees 与原始 UI 一致，不是最新 #61 布局验收。
- 控件补充和导航补充不重复指标、经济动作或性能测试，也不能证明最新布局全部视觉通过。

所有检查均未点击正式经济确认、未改变 Supabase、未启用 Worker/OpeningSeed。
生产来源查询、正式席位、Command → FINAL → projection 闭环和 Gate B 仍各自需要真实证据。

### 导航补充的两项非通过（原件保留）

全导航补充开始 `2026-10-02T15:41:18.594Z`，结束 `2026-10-02T16:20:43.367Z`。
原件 `artifacts/country-role-qa/85725830-20261002.vDlkrJ/navigation-only-74768ea.json`，
SHA-256 `f364d36f1e4933cbe91be50168ee902fb665913e0f352f0d18bd79f82e93d2fa`；Root 实际重算 hash、读取完成时间和汇总一致。

- 59 / central_bank / desktop：返回 atlas 本身通过；后续 native role switch 到 industry 的本地只读 GET 出现 `ECONNRESET`，随后 8 秒等待超时。不能把它推断为经济代码或生产网络故障。
- 60 / finance / desktop：初始国家/职位与 atlas URL 正确，显式可见返回链接等待 8 秒超时，记录 BLOCKED。没有 page/console/request error，不能据此断言缺少该功能。

仅这两个样本获新授权进行一次独立、清洁 context、15 秒有界只读导航复核，现均为
`NOT_REPRODUCED_IN_BOUNDED_RECHECK`：真实返回后国家/role/href 正确，59 再实际 native 切到 industry，国家仍为 59。
零 page/console/request error；无 cache、无请求自动 retry，一次/tuple，未改写全导航原件或旧 FAIL/BLOCKED。
复核开始 `2026-10-02T16:24:19.060Z`，结束 `2026-10-02T16:24:27.496Z`。
独立 `navigation-two-tuple-74768ea.json` SHA-256
`55e525ca25fa550a09139500d651ea88fd5e0c6d3ea7621de46f256e065e5433`；
完整小摘要 `C_QA_HANDOFF_SUMMARY.json` SHA-256
`79ee9bb368fbe6fbb292ec8f2917828c86c8db0e726ee13f2c39c2083b00165a`。
文件均在上述固定原始证据目录；C 已停止，没有重复完整矩阵。
