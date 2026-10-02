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
`ca522a1` 各 280 个画面复核；本记录写入时结果仍 **PENDING**，须后续固定证据补充。

主 Root atlas 自适应由 A #60 独立候选完成：FIT 随窗口调整，MANUAL 保留用户平移/缩放；世界总览包含原始完整 frame，手机与短屏不再使用旧 700 宽裁切。
Root 已实际查看手机与短桌面修后原图。最终候选 `4800a124da4ddf07ada313a7a9c402d0aeeac793` 保留 #61 布局和两组测试；CI `37032206789` 通过，合并 main `c1354ac857eb65b9fd573b6deadd7ebd2d0f10c0`。其实际 Pages 线上验收仍须单独取证。

## 功能矩阵与目视分开记录

C 原始只读浏览器矩阵在固定 `85725830` 完成 420/420 组合、840 views：
`artifacts/country-role-qa/85725830-20261002.vDlkrJ/full-420.json`，
SHA-256 `a0481d2aa038b1844893ac160250b287885a8641dad77f10266975489b02ad15`。

- 2,520/2,520 指标/来源抽屉字段、dataset hash 与 provenance 检查通过。
- 原始结果为 0 PASS / 7 FAIL / 413 BLOCKED；840 views 的异步 atlas 返回链接读取存在 harness 竞态。
- 7 个失败画面的 19 个对应控件以 3 秒有界、只读 trial/focus 重查，19/19 未复现；结论是 `NOT_REPRODUCED_IN_BOUNDED_RECHECK`，原始 FAIL 不改写。
- #58 增加等待真实可见 atlas 返回入口和独立 navigation-only 补充；本记录写入时全 840 导航补充仍 PENDING。
- 控件补充和导航补充不重复指标、经济动作或性能测试，也不能证明最新布局全部视觉通过。

所有检查均未点击正式经济确认、未改变 Supabase、未启用 Worker/OpeningSeed。
生产来源查询、正式席位、Command → FINAL → projection 闭环和 Gate B 仍各自需要真实证据。
