# 固定 CREATE 增量审阅包

候选代码基线：World `dc5dc7daf562c5c18b3a1f7a22fc5ac29cdcf7d4`（封存 bde catalog），V2 目标来源 `67cfcdc65f866d8e32ccddab38943d6ac064967a`。这不是生产批准或整套新装包；不重放旧提案，不改原安装、源登记或 schema ancestry 收据。

该单事务新增既有许可的只读派生补充表及 3 个固定函数，替换 13 个精确函数体。每个前驱的 body、owner、完整 EXEC ACL、search_path、参数名、返回类型及函数属性均须匹配已封存值；重复执行只接受目标元数据。最终 Industry frame fold 覆盖中间 paged 定义，使用其实际已安装版本。未知或部分补充结构拒绝，事务失败回滚，不修复未知对象。旧 scope 行和哈希保持。

1. 先验证独立 schema ancestry、旧 baseline 及本包 manifest/source 哈希。原两项物流 forward、opening-repair 等独立收据继续单列；本包没有放行其他未知变更。
2. 暂停并排空该数据库所有旧 Node consumer 和来源发布事务，确认无待提交经济事务。不得热升级仍运行的旧 Node。
3. 以受控 schema installer，在现有事务之外单独执行 `postwar-social-employment-creation.sql`。它自带 `BEGIN/COMMIT`；不要再包一层事务。保存开始、结果、SQL/hash、前后实际 catalog、旧行及权限核对收据。
4. 仅在确认提交且元数据核对通过后，以现有 `world_v2_postwar_projection_publisher` 另开受控事务调用 `prepare_postwar_social_employment_creation_licences(actual_world_id)`。该函数从实际 admitted seed 派生许可，调用者不能传 rows、金额或许可。原 World/Clock、许可事实和经济记录不在 schema 增量中创建或改写。
5. 若连接失败导致提交结果未知，停止后续步骤；只读核对实际 catalog、行及收据。即使本包支持精确目标重复，也不能把未知结果当作重试许可。已确认提交后仅采用另行审阅的前进修复。

固定只读入口：`tests/support/postwar-social-employment-creation-forward.ts` 的 `preparePostwarSocialEmploymentCreationForward(repositoryRoot)`。它只核本包和目标源码的固定哈希并返回 SQL/manifest 数据，不连接数据库、不执行或批准安装。

隔离内存测试覆盖旧 schema→本增量→实际 Core CREATE→PLAN→MATCH→旧读链、已登记许可/旧 scope/旧文档保留、OID/ACL/owner 保留、重复、未知元数据拒绝及中途失败回滚。该证据不代表原生 PG16、官方 70 国来源、现有封存克隆升级、运行中 Node、HTTP/browser 或生产验收。

现有 `postwar-schema-delta.mjs --forward-manifest` 支持本固定 V2 包、下述单函数 ordinal 包及既有物流包；默认 fresh 路径保持不变。入口只生成无安装批准的审阅产物，不连接数据库。

## 已安装 V1 的人员序号修复

V1 仍由 Git 提交 `16f1bedd09df119fda4aba846227f86a69bfd3f3` 封存。本 V2 不接受已经安装的 V1 initializer：不能以重放整包掩盖已提交升级。V1 曾把区域人口池的绝对人员序号与岗位人数直接比较；V2 按真实 `populationPositionRefs` 的半开范围校验，不增加人数、工资、480 分钟额度或岗位资格。

已安装 V1 的目标使用 `postwar-social-employment-creation-ordinal.manifest.json` / `postwar-social-employment-creation-ordinal-upgrade.sql`，只替换一个 initializer 函数体。它要求既有 13 个函数已经达到 V1 目标，许可补充表、RLS、触发器、另两个函数和 initializer 的旧体/属性完整吻合；唯一变更保留 OID、owner、ACL 和 search_path。重复执行拒绝。该包不创建表或角色、不扩大权限、不初始化许可；确认 DDL 收据后才按步骤 4 单独初始化。

固定入口为同一 loader 的 `preparePostwarSocialEmploymentCreationOrdinalForward(repositoryRoot)`。`targetSourceCommit` 绑定上述源码提交；包内固定 SHA 绑定实际 SQL 与 manifest 字节。旧封存数据库与原升级收据缺失时只能检查源码/一次性测试库，不能据此认定原数据库已经恢复或升级。任何未知 COMMIT 结果继续要求停止并只读核对，不能自动重试。

隔离 SQL 回归验证旧 V1 拒绝有效非零范围、V2 整包拒绝 V1、单函数修复成功、前后函数属性与其他 catalog/行保持、重复与异常配置拒绝、中途失败回滚、重复许可初始化以及 CREATE→PLAN→MATCH 回读。此处仍是 TEST_ONLY 小来源；正式 70 国与已封存 H3 世界的证据必须另行给出。
