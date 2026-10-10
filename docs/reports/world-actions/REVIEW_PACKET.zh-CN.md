# 单轮审查合同：World HOLD Actions / PR129

任务ID：PR129，P0 托管发布授权审查，当前 PENDING。
目标结果：无密钥可复现验证；有受控 Token 时，main 手动发布已批准的同一 HOLD 构件。
依据：用户 Actions 请求、AGENTS.md、PLANS.md、FAST_MAINLINE_REVIEW_POLICY.json。
ADR18 不批准正式经济启用；status/progress.json 的 V09 门槛保持原状。

审查的实现候选：`ad6fbda42ef26822f21810973cfb759a0b9c18fb`。
base：`c74744b21d17bb47e960ff73fe24561884f4f408`。
实现 tree：`81dd9ebb22c6ab31976d0d3685a8a0ff27f403f5`。
实际 CI checkout：`29607395f68016c18d52b2e5962c92c50cc91f99`，tree 与实现相同。
后续证据记录仅补充非执行文档；审查者仍须核对最终 diff，不能继承旧托管源码批准作为新流程批准。

允许审查的变更：world-runtime-actions.yml、world-runtime-actions.mjs、对应20项
守卫测试、ignore 规则、运维说明和本目录回执。没有 API/Worker/Core/前端实现、
项目依赖、数据库、RLS、经济源数据、Clock 或 gate 修改。

唯一外部写入 owner：手动 main 发布 job，固定 Cloudflare 账号和两个现存 Worker。
经济 commands/events/postings/outbox：无；无 World State 写入。
数据库实体/迁移/atomic settlement/币种/舍入/simulation time：无改变。

状态与失败路径：先通过完整调用者门禁和固定源码 workerd 准备；默认不发布。
发布前及发布后检查现有 HOLD bindings、入口、preview 和 cron。精确 bundle
SHA256 校验后，executor → API；UNKNOWN 回执停止，无自动重试或回滚。

必须核对的真实证据：最终不修改的 pnpm check、20项发布守卫、11项真实 workerd、
固定源码/tree、实际上传和下载的 ZIP/hash/layout、--no-bundle 干跑输出哈希。
具体 exit code、CI URL 和初次失败均见 IMPLEMENTATION_REPORT.md、TEST_EVIDENCE.json
及 [PR129](https://github.com/samuelq800/econmind-os-world-simulation/pull/129)。

不能猜测的部分：现无 Cloudflare CI Token；创建 GitHub Environment 返回403。
环境管理员须配置 main 限制、账号变量和 Token，required reviewers 是否启用需
实际读回。Ubuntu 首次全量的三个 bootstrap 生命周期失败未验收关闭；正式完整
门禁沿用既有 macOS 环境，不能宣称新的 Linux Node 宿主验收。

本轮停止边界：P0 独审批准前不 merge、不 VERIFIED；无 Token 不发布；不运行
生产 Supabase SQL、不复制主仓库 Secrets、不启动经济世界。Supabase/真实开局/
正式 producer/admission/host/gate 仍是独立条件。同伴源码协作不需要 Cloudflare 权限。
