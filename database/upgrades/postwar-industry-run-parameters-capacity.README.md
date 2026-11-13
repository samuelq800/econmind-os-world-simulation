# Industry RUN 参数 V2 双函数修复

这是现有安装的固定审阅产物，不是生产授权。源码基线为 World `ae79a0599ea3da984e6dce969ffd9f7dec043409`，目标为 `a490fd8913ddecd97b9b8afc483dc16202d391b7`。新装继续使用 `database/proposals/postwar-industry-run-parameters-read.sql`；不要把新装提案与本修复串成安装链。

V2 从原有 `source_text.sourceFacility.capacity` 读取不可变的每日总容量，供利用率换算；它不声称这是剩余容量、预留、完成产量或执行许可。两函数的签名、owner、EXEC ACL、search_path 和 RLS 权限不变，不添加角色、资金、资源、资格或来源记录。

执行前必须停止并排空读者、消费者和来源发布事务，独立核对完整 schema ancestry 及 manifest 的源文件和 SQL 哈希。SQL 在单事务中先验证两个精确旧函数体与元数据，再仅替换函数体；保留 OID 等属性。未知前驱、部分更新及重复执行均拒绝。manifest 内 `oldBody` 是固定 V1 审阅/测试证据，不是新装脚本或回滚指令。

此包不执行来源初始化，不启动 World/Clock，也不接入 CLI 的通用任意 SQL 入口。现有发布链应先审阅并选择此固定产物，不能推断生产目标已安装。执行后保存 SQL/manifest 哈希、实际前后 catalog 与确认提交收据。提交结果未知时立即停止，先只读核查实际目录和收据，不盲目重试。已提交的变更只能另行准备前进修复；这里没有自动或破坏性回滚。

定向测试使用 TEST_ONLY PGlite 和既有 source/role fixture，覆盖 V1→V2 真实低权限页面容量回读、OID/owner/ACL/RLS/旧行保持、未知体/权限/配置拒绝、重复拒绝及注入失败回滚。小测试库中的来源注册元数据不是官方生产采纳证据；原生 PG、运行中 Node、浏览器与正式部署仍须独立报告。
