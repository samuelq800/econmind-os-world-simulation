# 固定 CREATE 增量审阅包

候选代码基线：World `dc5dc7daf562c5c18b3a1f7a22fc5ac29cdcf7d4`（封存 bde catalog），目标来源 `37fe83971e7a4de01e24919cb8b8584fdb148ced`。这不是生产批准或整套新装包；不重放旧提案，不改原安装、源登记或 schema ancestry 收据。

该单事务新增既有许可的只读派生补充表及 3 个固定函数，替换 13 个精确函数体。每个前驱的 body、owner、完整 EXEC ACL、search_path、参数名、返回类型及函数属性均须匹配已封存值；重复执行只接受目标元数据。最终 Industry frame fold 覆盖中间 paged 定义，使用其实际已安装版本。未知或部分补充结构拒绝，事务失败回滚，不修复未知对象。旧 scope 行和哈希保持。

1. 先验证独立 schema ancestry、旧 baseline 及本包 manifest/source 哈希。原两项物流 forward、opening-repair 等独立收据继续单列；本包没有放行其他未知变更。
2. 暂停并排空该数据库所有旧 Node consumer 和来源发布事务，确认无待提交经济事务。不得热升级仍运行的旧 Node。
3. 以受控 schema installer，在现有事务之外单独执行 `postwar-social-employment-creation.sql`。它自带 `BEGIN/COMMIT`；不要再包一层事务。保存开始、结果、SQL/hash、前后实际 catalog、旧行及权限核对收据。
4. 仅在确认提交且元数据核对通过后，以现有 `world_v2_postwar_projection_publisher` 另开受控事务调用 `prepare_postwar_social_employment_creation_licences(actual_world_id)`。该函数从实际 admitted seed 派生许可，调用者不能传 rows、金额或许可。原 World/Clock、许可事实和经济记录不在 schema 增量中创建或改写。
5. 若连接失败导致提交结果未知，停止后续步骤；只读核对实际 catalog、行及收据。即使本包支持精确目标重复，也不能把未知结果当作重试许可。已确认提交后仅采用另行审阅的前进修复。

固定只读入口：`tests/support/postwar-social-employment-creation-forward.ts` 的 `preparePostwarSocialEmploymentCreationForward(repositoryRoot)`。它只核本包和目标源码的固定哈希并返回 SQL/manifest 数据，不连接数据库、不执行或批准安装。

隔离内存测试覆盖旧 schema→本增量→实际 Core CREATE→PLAN→MATCH→旧读链、已登记许可/旧 scope/旧文档保留、OID/ACL/owner 保留、重复、未知元数据拒绝及中途失败回滚。该证据不代表原生 PG16、官方 70 国来源、现有封存克隆升级、运行中 Node、HTTP/browser 或生产验收。

现有 `postwar-schema-delta` 的 forward-manifest CLI 仍限其原固定物流包，本 13 函数格式尚未接入该 CLI；本 SQL 已通过其原有保守事务分类器，未放宽规则。本批使用上述固定只读 loader 提供隔离验收入口，不把 CLI 未支持写成已支持。
