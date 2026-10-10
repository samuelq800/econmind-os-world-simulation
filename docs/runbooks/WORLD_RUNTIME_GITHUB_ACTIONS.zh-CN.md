# World 运行服务的 GitHub Actions

采用与主仓库相同的 Actions + Secrets 方式。World 仓库负责 Cloudflare 的
API/executor 托管验证与发布；正式 Supabase schema、账号授权和准入结构仍由
`econmind-os` 唯一生产发布链管理。本流程不使用或复制主仓库数据库密码。

工作流为 `.github/workflows/world-runtime-actions.yml`，名称
**World runtime Actions (reviewed HOLD only)**。发布源码固定为已独立批准且已
托管的 `e7ecf45184baad69a37e2e51fff8862a635267dc`，而非触发分支的任意代码。
API/executor bundle SHA-256 必须与既有正式 HOLD 发布回执一致。

## 不需要密钥的部分

PR 自动运行完整调用者检查及打包验证；手动运行默认 `publish_hold=false`。
CI 安装 Supabase CLI2.115.0 并只检查版本，安装隔离的 Wrangler4.148.0，构建
固定源码，运行真实 workerd11项检查及本工作流的发布守卫测试，保留可追溯构件。
上传物仅包括两个 HOLD JS、公开检查 JSON；TEST_ONLY JWT 载体/私钥不上传。
完整 pnpm check 沿用仓库既有 macOS 门禁并拉取完整来源历史；workerd 打包
准备仍在 Linux。初次 Ubuntu 全量验收的失败见报告，不代表已验收 Linux Node 宿主。

工作流须先经独立审查合入 main，GitHub 才会提供手动 Run workflow 入口。
既有运行服务源码已随 PR124 合并；本工作流仍是单独审查范围。

## 账号负责人配置一次

早期现有 GitHub 凭证尝试创建环境时返回403。账号负责人已完成配置；
2026-10-10（Asia/Shanghai）实际读回确认环境存在，部署策略仅允许 Branch `main`，
仓库级 Secret 和账号变量均已保存。Token 的实际权限仍须由发布运行验证。
World 同伴改源码、提交 PR、看验证不受此影响。

在此仓库 Settings → Environments 创建 **world-cloudflare-hold**，部署分支
仅允许 `main`；发布环境使用：

| 类型                | 名称                    | 内容                               |
| ------------------- | ----------------------- | ---------------------------------- |
| Repository secret   | `CLOUDFLARE_API_TOKEN`  | 专用 Cloudflare Workers 发布 Token |
| Repository variable | `CLOUDFLARE_ACCOUNT_ID` | `9bad0b638402dc39700132716e3b312c` |

当前发布环境没有同名 Secret/variable，工作流使用上述仓库级配置。
也可将凭据放到同名 Environment 配置中；同名环境配置会覆盖仓库配置，
需要核对实际使用值，不能留下互相矛盾的副本。

Token 使用 Cloudflare 当前 Workers 部署授权方式，仅授权上述账号及这两个
Worker；按平台支持的粒度授予所需编辑权限。不要上传本机 OAuth 登录缓存。
创建入口按 Cloudflare 当前 API Token 控制台为准；创建专用 Workers 部署
Token 后，直接保存到上表的 Secret。
Token 不写源码、聊天、构件或前端变量；主仓库已有 Secrets 不能从 GitHub
读回明文或自动继承到另一仓库。

同伴提交 PR、看检查和改源码不需要 Cloudflare 账号；账号负责人配置 Secret
并从 main 手动发布。Environment 可以配置 GitHub 的 required reviewers，但
当前是否实际启用必须由设置读回确认，不能仅因写了 environment 字段而声称受保护。

## 同伴继续修改时

修改 API/Worker 源码不会自动替换线上服务；当前流程固定发布上述 HOLD 版本。
要发布新的版本，先为新源码和实际构件完成必要审查，再更新工作流/辅助脚本的
固定 commit、tree 和两个 bundle SHA256，运行验证并审查该发布变更。负责人
合并后手动发布。同伴无需登录 Cloudflare，也无需取得数据库密码。

正式经济版本的启用还受仓库当前 gate 和唯一数据库发布链约束，不能仅把 HOLD
改成 ACTIVE 或换成 TEST_ONLY 构件。

## 发布已审查 HOLD

在 Actions 选择该工作流，main 分支；开启 `publish_hold`，confirmation 填
`PUBLISH_REVIEWED_HOLD`。完整检查和准备必须先成功。发布端再核实固定源码/
构件哈希、账号、现有两个 HOLD bindings、公共入口、preview 关闭和无 cron。
依次发布内部 executor、API，再读回相同拓扑及 health200/readiness503/ALIVE_HOLD。
结果不确定时停止，保留 UNKNOWN 回执，不自动重试或回滚。

缺少 Token 时发布失败；默认验证不需要 Token，也不会联系生产 Supabase。
本流程不会创建 Hyperdrive、运行生产 SQL、开局、获取 lease 或跑 Clock。
它解决可重复托管发布；正式数据库、数据源、准入、正式执行宿主和 gate 依赖
仍需另外完成，不能把这个工作流成功当作经济世界启用。

依据：[Cloudflare GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)、
[GitHub deployment environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)。
