# World web custom-domain preparation — 2026-10-02

本报告记录前端代码准备与本地证据，不代表 `world.econmind.group` 已绑定、已上线或已获得官方数据接口的跨域许可。

- 仓库：`samuelq800/econmind-os-world-simulation`。
- 分支：`codex/custom-domain-readiness-20261002-side`。
- 初始检查基线：`85725830f0a6d102e73ae89697ab008f92208285`。
- 第一轮发布前同步的 main：`9b48a1618ce86ddebb08ab0617fc93552d4a28c5`。
- 之后主线程合入地图原件页与连接状态组件，第二轮同步到 `ab6e21cd3b7888ca9d8ff28504241c511425b771`，保留这些上游改动。
- 当前补丁代码提交：`71a12a4`；本报告是随后追加的文档记录。
- 所有修改隔离在独立工作树；未修改主线程的工作文件、打断其他窗口或调用子代理。

## 1. Files changed

| 文件                                                 | 变更                                                                           |
| ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| `apps/world-web/vite.config.ts`                      | 新增 `resolvePublicBasePath`，集中校验并解析显式 public base。                 |
| `.github/workflows/deploy-world-web.yml`             | build step 传入 `vars.WORLD_WEB_PUBLIC_BASE_PATH`，原 official-read 配置保留。 |
| `tests/world-web/public-base-path.test.ts`           | 27 个测试，覆盖默认值、显式根路径/子路径及非法配置拒绝。                       |
| `scripts/check-world-web-public-base.mjs`            | 对已生成的 dist 做离线路径检查；不启动服务、不请求远端、不发布。               |
| `docs/reports/custom-domain-readiness-2026-10-02.md` | 本交接与 owner fast-track 证据记录。                                           |

未改依赖或锁文件，未改 public UI、经济模型、Core/Worker/API 源码、Edge 入口、CORS、数据库或生产配置。

## 2. Exact behavior before / after

| 条件                                     | 修改前                                | 修改后                                             |
| ---------------------------------------- | ------------------------------------- | -------------------------------------------------- |
| `GITHUB_ACTIONS=true`，base 未设置或为空 | `/econmind-os-world-simulation/`      | 相同，保留现有 Pages fallback。                    |
| `GITHUB_ACTIONS=true`，base 为 `/`       | 忽略该变量，仍使用 repository subpath | `/`，供未来 custom domain 构建。                   |
| 本地，base 未设置或为空                  | `/`                                   | 相同。                                             |
| 显式 `/abc/` 或规范嵌套目录              | 忽略该变量                            | 原样使用，不从 hostname、repository 或浏览器猜测。 |
| 非法配置                                 | 变量未被读取                          | 构建失败，不回退掩盖错误。                         |

显式路径只接受以 `/` 开头、以 `/` 结尾的规范目录及 `/` 本身。目录段使用 ASCII unreserved 字符；URL、query/hash、重复斜线、dot segment、编码路径、反斜线及空白/control 字符均拒绝。空字符串才视为未配置，不自动 trim 非法输入。

`WORLD_OFFICIAL_READ_BASE_URL` 语义完全不变：它仍须是 HTTPS 的 `/functions/v1/world-v2-official-read` 地址，绝不是网页域名。

发布前的只读 GitHub 检查显示：Pages `cname=null`，当前地址仍为 `https://samuelq800.github.io/econmind-os-world-simulation/`，HTTPS 开启。两个相关 repository variables 当时均未列出；本任务未创建或修改它们。因此本次当前站发布继续使用旧子路径，不会提前切换根路径。

## 3. Tests

运行环境为固定 Node `24.20.0` / pnpm `12.3.4`。命令均实际以以下运行时目录置于 PATH 前部执行，而非系统 Node 26：

```text
/Users/samuel/.npm/_npx/92e92e656f04b72c/node_modules/.bin
```

依赖安装实际使用 `pnpm install --offline --frozen-lockfile`，下载数量为 0，锁文件未变化。

### 双模式构建与可复现离线检查

同步最新 main 后，实际按顺序执行：

```sh
env -u WORLD_WEB_PUBLIC_BASE_PATH -u WORLD_OFFICIAL_READ_BASE_URL \
  ECONMIND_ENV=production GITHUB_ACTIONS=true \
  pnpm --filter @econmind/world-web build
node scripts/check-world-web-public-base.mjs /econmind-os-world-simulation/

env -u WORLD_OFFICIAL_READ_BASE_URL \
  ECONMIND_ENV=production GITHUB_ACTIONS=true WORLD_WEB_PUBLIC_BASE_PATH=/ \
  pnpm --filter @econmind/world-web build
node scripts/check-world-web-public-base.mjs /
```

两种模式均通过。第一轮每种检查 76 个 HTML、114 个可达文件、626 次本地路径引用；同步新增地图原件页后再跑两模式，每种检查 77 个 HTML、319 个可达文件、830 次本地路径引用。每轮均包含 70 国记录及 140 条 scene/detail 地图引用。当前模式入口资源为 `/econmind-os-world-simulation/assets/...`；根模式为 `/assets/...`。根模式生成的 runtime JS/CSS 不含旧 repository prefix。

保留上游新发布步骤后，构建额外校验并复制 203 个地图原件/支持文件（160 张图、43 个支持文件）；整个静态输出约 937.6 MB，原有 1,000 MB 构建预算尚余约 62.4 MB。本补丁未新增地图素材，也未放宽该预算。

两次构建各复制并按权威 UI manifest 校验 140 张地图。手写 immersive HTML 在两模式下完全一致：

```text
e8442a65ccac714f92a10fdc9fd04d31a81b7368663a5a596cef1966f1d1f9a0
```

build 时刻未提供 official-read endpoint，输出如实为 `NOT_CONFIGURED` / `liveWorldState=false`；这不是生产 API 验收。

### 相关测试与检查

```sh
pnpm --filter @econmind/world-web typecheck
pnpm exec vitest run \
  tests/world-web/public-base-path.test.ts \
  tests/architecture/vite-environment.test.ts \
  tests/world-api/official-public-cors.test.ts \
  tests/world-web/world-public-preview.test.ts \
  tests/world-web/official-page-config.test.ts \
  tests/world-web/shared-visual-contract.test.ts
pnpm exec eslint apps/world-web/vite.config.ts \
  tests/world-web/public-base-path.test.ts scripts/check-world-web-public-base.mjs
pnpm exec prettier --check apps/world-web/vite.config.ts \
  tests/world-web/public-base-path.test.ts scripts/check-world-web-public-base.mjs \
  .github/workflows/deploy-world-web.yml
pnpm test:authoritative-ui
pnpm env:check
pnpm --filter @econmind/core build
pnpm --filter @econmind/world-worker build
node scripts/check-boundaries.mjs
git diff --check
```

第一轮 Vitest 运行 6 个文件、82 项测试，全部通过；typecheck、ESLint、Prettier、环境安全及 diff 检查通过。authoritative UI 检查通过：288 个发布文件、75 个派生文件、2 个视觉集成文件、70 个国家页及 140 个地图资产。边界检查通过，扫描 229 个源码文件。Core/Worker 只编译到此隔离工作树的产物目录，未启动任何执行服务。

同步上游地图原件页与连接状态组件后，额外实际执行以下目标，7 个文件 146 项测试全部通过；这是第二轮相关集成回归，不与第一轮重复测试累加：

```sh
pnpm exec vitest run tests/world-web/public-base-path.test.ts \
  tests/world-web/world-public-preview.test.ts \
  tests/world-web/official-page-config.test.ts \
  tests/world-web/shared-visual-contract.test.ts \
  tests/world-web/official-map-publication.test.ts \
  tests/world-web/official-source-status-catalog.test.ts \
  tests/world-web/official-source-status-view.test.ts
```

另外实际用非法完整 URL 启动 Vite build，构建 exit 1，错误明确指向 `WORLD_WEB_PUBLIC_BASE_PATH`，验证了 fail-closed 行为。

### 浏览器证据及边界

使用现有 Playwright/Chromium，对两种真实 dist 分别启动本地 Vite preview；每种实际跑 11 个页面/导航场景及 8 个资源 HTTP/MIME 检查：

- React 地图：国家 01、70。
- 国家 01 的全部六个职位页面及一次原生角色切换。
- 国家 70 的独立入口重定向和静态 country atlas。
- scene PNG、detail SVG、shared CSS、numeric module、lobby badge 和 catalog。

两模式均无 page error、HTTP 4xx/5xx、逃离 base 的资源请求或外部请求。浏览器禁止访问远端；所有临时 preview 已停止。这是路径兼容性抽检，不是 420 个国家/职位的全面可玩性验收，也不是生产 Edge/API 连通性证明。

初次构建发现 `exactOptionalPropertyTypes` 对传入 `undefined` 的类型要求，已修复并重新通过。初次浏览器脚本误用只在总览中出现的 mosaic selector，超时后改用国家页面实际设施元素；页面本身无错误。边界检查最初缺少 workspace export 的编译产物；补齐本地编译后原检查原样通过，没有放宽任何断言。

构建仍有原先的大 chunk 提示，以及 shared CSS 在 Vite 转换时保留 runtime 相对引用的提示；实际文件存在且浏览器成功加载。未为这些提示改动 UI 或游戏代码。

## 4. Path audit

对整个仓库的 repository path/GitHub URL 做搜索，并重点检查 frontend 的 `/season1-immersive`、`/shared`、`/assets`、location、href/src、fetch、CSS url 和模块导入。

| 发现                                                                     | 处理与原因                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vite.config.ts` repository prefix                                       | 必须保留为未配置时的 CI fallback；集中到解析函数。                                                                                                                                                                                              |
| `scripts/country-role-qa.mjs` 的固定旧子路径                             | 本地 QA harness 的限定 prefix，不是生产页面导航；保持不变。新增离线检查可同时验证两种 base。                                                                                                                                                    |
| `PROVENANCE.json` 中的旧 checkout/sourceRoot                             | 历史来源记录，不是资源 URL；保持原件。文档、测试 fixture 的历史 URL 同理。                                                                                                                                                                      |
| root HTML 中 `/src/...`                                                  | Vite 输入，不是发布后的路径；双模式构建会改写为对应 `/assets/...`。                                                                                                                                                                             |
| immersive/country/shared/lobby 资源及导航                                | 相对路径或 `document.currentScript.src` 解析。国家入口、角色切换、atlas return 保持 base；无需机械替换。                                                                                                                                        |
| React 地图源数据                                                         | `import.meta.env.BASE_URL` 解析；两模式浏览器均成功读取本地选定开局包。                                                                                                                                                                         |
| `/season1-immersive/countries/assets/...` dev bridge                     | 本地 development 专用，默认本地仍为 `/`。发布资源由复制脚本提供，不依赖该中间件。                                                                                                                                                               |
| `/healthz`、`/readyz`、`/__bootstrap/api-health`、`/v1/...`、Edge prefix | 开发/后端路由，不是 web 静态 base；保持不变。                                                                                                                                                                                                   |
| local audit harness 的 root pathname                                     | 限定 loopback、本地审计入口的安全条件，不是生产路径；保持不变。                                                                                                                                                                                 |
| 两条未引用旧 CSS 图片路径                                                | `shared/next-roles.css -> ../finance/world-art-v2.png`、`shared/play-controls.css -> ../central-bank/world-art-v2.png` 文件缺失，但未从任一发布 HTML 的资源图加载。离线检查单列 `dormantCssFindings`，不吞掉活动页面错误；本次不修无关归档 UI。 |

### 必须明确的 CORS 切换缺口

两个 CORS library 保持 exact-origin allowlist；未改为 `*`，也未新增任何允许来源。

但当前 **实际 Edge 入口** `supabase/functions/world-v2-official-read/index.ts:7` 为：

```ts
const allowedOrigins = ['https://samuelq800.github.io'];
```

这个入口没有调用 `readOfficialPublicCorsOrigins`，不读取 `WORLD_API_OFFICIAL_PUBLIC_ORIGINS`。实际本地直接调用此入口做 OPTIONS（远端 fetch 被禁止）得到旧 origin 204、新 origin `https://world.econmind.group` 403，外部请求数为 0。

因此不能保证“只增加 Supabase production secret 即可切换”。未来需另行处理实际 Edge 入口的精确 allowlist/配置接线及发布，仍保持同一安全模型；当前任务按限制未改入口或部署 Edge。以上是此固定源码快照的结论，未声称验证了当前生产部署版本。

## 5. Remaining manual steps

本次用户追加授权测试后发布到**当前** GitHub Pages；这不是授权提前变更 Custom Domain/DNS/secrets。发布过程及最终结果由关联 PR/Pages workflow 记录，不能用本报告的本地证据代替现网验证。

未来域名切换需协调完成，避免在旧 repository URL 仍是唯一入口时单独发布 root-base 构建：

1. GitHub Repository Variable 设置 `WORLD_WEB_PUBLIC_BASE_PATH=/`；与域名启用和发布协调，不提前触发 root 构建。
2. GitHub Pages Custom Domain 设置 `world.econmind.group`。
3. Cloudflare 设置 `world CNAME samuelq800.github.io`，确认 DNS/Pages 域名检查。
4. official-read 实际入口精确允许 `https://world.econmind.group`，需要保留旧站时同时允许 `https://samuelq800.github.io`。先确认配置确实被实际入口读取；当前固定数组版本仅新增 secret 不会生效，需单独范围明确的代码/Edge 发布步骤。不要新增 wildcard，也不要把网页域名填进 `WORLD_OFFICIAL_READ_BASE_URL`。
5. 重新运行 `Deploy EconMind World preview`，确认此次构建使用 root base。
6. 验证 HTTPS、入口、资源、immersive、国家跳转/角色切换及来自新 origin 的 official-source read。前端读取静态开局数据成功不能代替 API/CORS 成功。

### Owner fast-track record

本补丁按实际边界归为 P2：非权威前端路径配置、检查工具与文档；默认生产站构建行为不变，未变更生产环境设置、经济状态、身份授权、数据库、CORS、Worker 或 settlement。2026-10-02 用户明确授权“你结束后通过test直接发布上线就好”，接受相关证据通过后的当前静态站发布。不声称独立审计，不变更任何开发 Gate/ADR 状态；该批准仅覆盖本报告列出的补丁与当前 Pages 发布，不覆盖未来域名/生产 API 改造。
