# 旧 EconMind → World 视觉补齐 · 2026-10-09

状态：`IMPLEMENTED_UNVERIFIED`。本地实施与自动检查完成；独立审查、PR、合并或部署尚未执行，未改动 R2 gate。初轮未推送；本次控制塔仅授权已有实现收尾、固定提交及必要的独立分支推送，交付结果以最终 Git receipt 为准。

## 工作区与来源

- 旧仓库：`/Users/samuel/Documents/econclub/econmind-os`，检查时为 `agent/school-curriculum-system` / `6705d4b`，有未提交工作，未修改。
- World 原仓库：`/Users/samuel/Documents/econclub/econmind-os-world-simulation`，为 `codex/world-core-planning` / `b803e28`，有未跟踪工作区和报告，未修改。
- 独立实施副本：`/Users/samuel/Documents/Codex/2026-10-09/task/world-visual`，分支 `codex/legacy-econmind-visual-20261009`，从本机 `origin/main` 的 `96217db583db4c1bd6ef74714b2e0a5ef6b7ed6d` 创建。
- 独立旧站参考：`../legacy-reference`，固定本机主线 `c8396ff`。终端最初不能解析 GitHub；没有声称已确认远端当前 HEAD。
- 已实际查看线上 `https://econmind.group/`、Season 1 大厅和 `https://world.econmind.group/`、Finance Office。保留既有共享视觉来源 `7b4db3b8cbdb1db86288a1172896ac9bb8febaa4`，本机 Git 对象的 CSS SHA-256 与原记录一致。
- 两仓库均无适用 `.agents/skills`；阅读 AGENTS、PLANS、status/ui-selection、progress、测试说明及已有迁移来源记录。只读参考 `memory_summary.md`，未读取原始会话目录。

旧站主站和 Season 1 都采用深海绿/青、浅青行动色、暖金标签、Arial 正文与 Georgia 标题。主站有亮色主题；World 国家地图原有亮色控制表面，因此沿用既有“暗色场景、亮色控制”的映射。未提交的首页/学校目录视觉不作为来源，不存在需要擅自选择的旧视觉版本。保留地图与职位艺术，未复制旧站全站目录导航。

## 变更

产品变更仅为 `apps/world-web/public/shared/econmind-os-visual.css`：补齐加载/旧入口、角色下拉框、分配控件、设施按钮、选中标记、Office 导航/抽屉、状态、已有编辑器表面和表格边框。沿用来源变量、现有间距、尺寸、响应式与滚动规则。

桌面正文适配 Arial；HUD、分配面板和 1000px 以下国家页保留原字体度量，避免换行使场景和设施锚点移动。标题、背景艺术、按钮圆角与构图适配 World 现有结构。

`../world-shared-visual/SOURCE.json` 记录当前 CSS 的真实字节数与 SHA-256，保留前一输出哈希、原来源及其提取范围。未修改 UI 归档、MANIFEST、PACKAGE、启动来源记录或发布验证器；没有新增例外。原迁移 README 明确区分历史证据与本次结果。其余新增文件只包含复现脚本、报告和证据。

经济逻辑、数据文件、API、权限、认证、结算、事件、时钟语义、数据库及生产配置均无变更。未启用引擎；来源未配置、World 未启动、确认禁用与缺失投影仍为真实状态。

## 验证

工具链 Node `24.20.0` / pnpm `12.3.4`，冻结锁文件安装成功。第一次离线安装因缓存缺失失败；安装日志记录随后成功的真实结果。

| 检查                                   | 最终结果                                                                                                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 全仓库 `pnpm lint`、`pnpm typecheck`   | PASS，exit 0                                                                                                                                                             |
| 全仓库 `pnpm build`                    | PASS，exit 0；包括 Web TypeScript/Vite、140 地图资源与发布产物                                                                                                           |
| `pnpm test:authoritative-ui`           | PASS，exit 0；286 原文件、75 既有派生文件、2 视觉文件、2 启动派生文件                                                                                                    |
| `pnpm test:boundaries`                 | PASS，34 tests、authoritative-patterns 和 browser import boundary 均通过                                                                                                 |
| `pnpm exec vitest run tests/world-web` | 首次 834 PASS、1 环境超时、5 原条件 SKIP；该失败文件原样重跑为 7 PASS / 5 SKIP，exit 0。合并计数为 835 PASS / 5 SKIP，未重复计算重跑项目                                 |
| 最终共享视觉/发布完整性测试            | PASS，2 files / 16 tests，exit 0                                                                                                                                         |
| 本机环境、秘密扫描、只读治理检查       | PASS；无 DB 配置、NOT_LINKED、数据库 mutation 禁止                                                                                                                       |
| 原视觉浏览器回归                       | PASS，14 rows；六 Office × 两视口，以及两张地图的精确几何/滚动、焦点、目录与缩放断言                                                                                     |
| 本次浏览器检查                         | PASS，21 rows；六 Office × 1440/390/320px 与各视口导航；保留 120 modules、基线控件和时钟状态、禁用确认、真实 MISSING、关闭投影清空、模块无命令提交、地图返回与浏览器返回 |

`EVIDENCE.json`、`BROWSER_CHECK.json`、`COMPLETION_BROWSER.json` 与对应日志记录真实结果。原浏览器脚本被复制到本报告，仅将 Office 抽屉选择器明确限定为 `role=dialog` 的既有非原生抽屉：新主线有两个关闭的原生 dialog，旧宽泛选择器产生 strict-mode 错误。没有删减任何断言。字体导致的初次几何失败已通过收窄字体覆盖修复，最终原断言全部通过。新增测试最初误从 toast 读取模块消息，已按真实 UI 的阻断抽屉读取状态及“未提交命令”文本。

实测抽屉次要文字对比度 `5.44:1`。桌面、390px、320px 均无文档横向溢出，未加入第二层全站导航。人工检查了最终桌面 Finance 和手机 Finance/Trade 截图；场景、文本、控件与来源状态均可辨认。

## 截图与复现

本机对照图册：`/Users/samuel/Documents/Codex/2026-10-09/task/evidence/index.html`。包含六 Office 的桌面/390px 前后配对；同目录还包含 320px 截图、Atlas、Finance 抽屉和 MISSING 状态截图，以及旧站来源截图。完整截图保存在任务目录，未上传外部服务。

本报告另附最终 `desktop-finance.png` 与 `mobile-trade.png`。`BEFORE_ROLES.json` 固定基线提交/CSS 哈希及实际控件、时钟和禁用状态，供回归对照。

```sh
pnpm install --frozen-lockfile
pnpm --filter @econmind/core build
pnpm --filter @econmind/world-web build
pnpm exec vite preview --config apps/world-web/vite.config.ts --host 127.0.0.1 --port 4198
# 在第二个终端执行；若 Playwright 不在常规模块解析路径，设置 PLAYWRIGHT_MODULE。
VISUAL_PREVIEW_URL=http://127.0.0.1:4198/ node docs/reports/legacy-visual-completion-20261009/check-existing-browser.mjs
VISUAL_PREVIEW_URL=http://127.0.0.1:4198/ node docs/reports/legacy-visual-completion-20261009/check-completion.mjs
```

## 尚未验证的差异

未连接的真实 Office 表单/图表内页无法在当前缺失 runtime 下完整检查；没有使用样例结算或伪投影填充。原有细小 HUD 字体、窄屏字体和几何保持，后续若需放大应独立评估布局。Atlas/Map 的已有大 chunk 警告仍存在。生产 DB/RLS、经济端到端、真实倒计时运行与发布验证均 `NOT_RUN`。这是本地视觉候选，不构成生产或 Gate B 验收。

## 控制塔收尾

断连后重新核实同一独立 checkout、分支和 dirty；全部现有改动均属于本次视觉候选。未重设计，也未改动 CSS、经济逻辑、权限、时钟、地图数据或旧站。保留以上首轮超时、条件跳过与 MISSING 业务限制，未重复全量测试或浏览器检查。

`SOURCE_RECHECK.json` 记录从旧站本地固定 Git 对象重新读取的 3 个原始 blob 与 12 段原始行提取哈希，逐项匹配 SOURCE；当前 CSS 字节数/哈希以及 base 中前一 CSS 输出也匹配。最终格式、证据脚本 lint 和 diff 检查结果写入 `EVIDENCE.json` 的 `closureChecks`；初轮日志保留，补充收尾日志随提交保存。原实现的 `boundaries.pushed=false` 是初轮检查时的观察，最终独立分支推送状态在交付 receipt 中记录。

唯一产品文件仍为 `apps/world-web/public/shared/econmind-os-visual.css`；其余变更为来源记录、历史报告注记及本报告目录。状态保持 `IMPLEMENTED_UNVERIFIED`，等待 Root 安排 F 定向独审和后续正常主线流程。
