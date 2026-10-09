# Supabase CLI 复用检查（2026-10-09）

## 状态和范围

基于 `d33e274`。按实施报告模板记录，源码变更为 P2 工具兼容性，状态
`IMPLEMENTED_UNVERIFIED`：必要本地检查通过，没有新增独立审查或 owner fast-track
记录，不宣称正式生产接入或 gate 完成。

仅修改 CLI 工具选择、忽略本机路径配置并补操作说明。原 CLI allowlist、生产
环境守卫、迁移归属、权限、Core/API/Worker 经济实现均未扩展。生产变更仍只能
由 `econmind-os` 唯一批准发布链执行；本仓库没有成为第二 schema publisher。

## 只读检查结果

- 主仓库：`D:/projects/econmind-os`；本地 Supabase CLI 实际版本2.115.0，
  与主仓库部署 workflow 固定版本相同。版本提示有更新，但本轮没有升级。
- 主仓库关联缓存目标为 `vimksjrhaxdpnkvgsavz`；pooler 连接地址有用户名、
  没有密码。仅打印目标/布尔元数据，不输出连接值或 token。
- 在主仓库通过现有 CLI 只读列举项目成功，目标项目确实在可访问列表中，证明
  本机平台登录可用。这个操作没有查询/修改生产数据库，也未改变项目关联。
- 主仓库 GitHub Secrets 元数据确认 `SUPABASE_ACCESS_TOKEN`、
  `SUPABASE_DB_PASSWORD` 存在；只读取名称，不能由 GitHub 读回其明文。
  存在 secret 不证明当前数据库密码有效，更不证明已存在 World 最小权限角色。
- 本仓库没有 Supabase CLI 依赖；`supabase/config.toml` 已存在。config 中的
  本地 project_id 不是运行账号或正式 World 数据库连接配置。

## 复用方式

`scripts/supabase-safe.mjs` 在 allowlist 检查之后选择工具。可用环境变量
`SUPABASE_CLI_ENTRYPOINT`，或根目录被 gitignore 的 `.supabase-cli.local.json`
设置唯一 `entrypoint` 字段。要求绝对 JavaScript 路径；用 Node 直接启动，无 shell。
未配置时保留原 PATH CLI 方式。无效本机配置失败退出，不打印配置内容。

这台机器已创建忽略文件，指向主仓库已安装的
`node_modules/supabase/dist/supabase.js`。文件只含工具路径，没有秘密。
没有复制主仓库 node_modules、`.temp`、密码、迁移或部署 workflow，没有改锁文件。
同伴按实际机器路径自行配置；操作说明在 `docs/runbooks/ENVIRONMENT_SAFETY.md`。

## 实际验证

Windows PowerShell；Node24.20.0、pnpm12.3.4；复用 CLI2.115.0。

| 命令/检查                                                             | exit      | 结果                                    |
| --------------------------------------------------------------------- | --------- | --------------------------------------- |
| 主仓库已安装 CLI --version                                            | 0         | PASS，2.115.0                           |
| 主仓库 CLI projects list --output json（内存捕获）                    | 0         | PASS，目标可访问；无凭据输出            |
| 本仓库 pnpm supabase:safe -- --version                                | 0         | PASS，2.115.0                           |
| node scripts/supabase-safe.mjs db push                                | 2（预期） | PASS，启动 CLI 前拒绝，未执行数据库操作 |
| node --check scripts/supabase-safe.mjs                                | 0         | PASS                                    |
| pnpm exec eslint scripts/supabase-safe.mjs                            | 0         | PASS                                    |
| prettier 格式检查相关脚本/文档                                        | 0         | PASS                                    |
| 两个既有 environment-safety / environment-release-foundation 测试文件 | 0         | PASS，21 passed/0 failed                |
| node scripts/check-boundaries.mjs                                     | 0         | PASS，313 files                         |
| node scripts/check-repository-secrets.mjs                             | 0         | PASS，2319 files（新增本报告前）        |
| git check-ignore .supabase-cli.local.json                             | 0         | PASS，本机工具路径不入仓库              |
| git diff --check                                                      | 0         | PASS                                    |

没有启动本地 Supabase；`status` 仅检查本地服务，不能证明托管项目连通。
本轮没有重跑完整 pnpm check；上一轮完整源码证据绑定35dee047，不延伸为本次
工具选择变更的完整检查或独立批准。

## 正式接入仍缺的配置

平台 access token、前端 anon key、HTTP service key 与 PostgreSQL 登录密码
承担不同职责。已可用的 CLI 登录不是 Hyperdrive 运行凭据。现阶段 CLI 复用
不需要用户再提供密钥；正式 API/Worker 仍需要受控的最小权限运行连接。
主仓库现有管理员数据库密码也不能自动替代这些角色的正式授权与发布回执。

如果已有运行连接配置，应给受控本地文件路径/Secret 名称，不在聊天粘贴密码。
schema/admission/source/正式宿主和 Gate B 的缺口保持原交接说明中的状态。
