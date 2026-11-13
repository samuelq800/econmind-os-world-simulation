# H6 后的 Industry 读回接线

基线 World `056d3a01a04017abbb333357d57cdb11d01138fb`，配套 `b238201600971558fd1743e4c14598828c7d1627`。本记录对应后续工作树改动，不继承 H6 原生验收通过，也不改写历史报告。仅非权威浏览器读回；没有操作数据库、推进 Clock 或发送经济命令。

## 本次闭合的代码缺口

`industry-run-parameters` 的服务端已支持分页，但命令抽屉只请求第一页。现在用户可明确读取下一页设施来源，每页最多25行；不会自动加载全部数据。控制器将原页作为续页凭证传给现有受权 client，保持原来源/绑定版本与世界 head，拒绝上一页重复的设施。换页先清空原参数展示和未提交的 RUN/target 草稿；已提交或结果未知的原请求仍保留用于恢复，不因翻页重发。

来源读取失败现在显示服务端错误代码，数量标为未知；真实空页保留 `EMPTY`，不是网络失败的替代。界面显示当前页范围/总量和世界版本，最后一页没有续页按钮。利用率目标读出同样显示范围和总量；当前契约是指定设施的最新目标（至多一行），没有为制造分页覆盖而放宽单设施/唯一性约束。

实际路径：`office-command/view.ts` → `controller.ts::nextIndustryRunParametersPage/readRunParameters` → `postwar-office-runtime/client.ts` → 现有 `/v1/postwar-office-runtime` 的 `industry-run-parameters` → `postwar-industry-run-parameters-read.ts` → `world_v2.read_postwar_industry_run_parameters_page`。本轮未修改后端路由或 SQL。

## 范围矩阵增量

原分母仍为120模块、1126输入、158读出（1404项）；70国的420个办公室实例不缩减。旧 `scope-inventory.json.gz` 是逐文件哈希的静态导航快照，全部 `UNKNOWN` 不代表不存在代码，也不能由词法命中改成验收通过。

| 已核对字段组         | 实际接线与有限含义                                           | 本轮证据边界                                                                        |
| -------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `industry-u0282-0/1` | 原设施来源 → 显式RUN计划；本次补来源续页可达性               | 实际产品 controller/client/DOM，拦截 TEST_ONLY HTTP DTO；不是数据库或21国运行验收   |
| `industry-u0283-0/1` | 同一来源 → 明确窗口的持久利用率目标；目标不代表产出/容量预留 | 同上；H6的真实0%目标仅对该历史候选有效                                              |
| `social-u0932-0/1/2` | 已许可转介容量的CREATE；真实LC零新增费用及已有服务池         | 现有代码映射，H6既有FINAL恢复；本轮未重新执行                                       |
| `social-u0933-0/1/2` | 地区/人数/补助的待审批项目条款                               | 非获批迁移、资格、预算或付款；本轮未重新执行                                        |
| `social-u0934-0/1/2` | 资格文本/容量/期限的待审批项目条款                           | 不增劳动力、不替代实际资格/成本规则；本轮未重新执行                                 |
| `industry-u0284-0/1` | 设施优先级及竞争性资源分配                                   | 仍未接线；需要按原有规则确定竞争范围、既有承诺与同优先序处理，不套用utilisation命令 |

这里列出的13个输入仅表示已逐项读过有限字段映射，不是13个规范功能完整验收。其余模块未在此轮逐项执行，不能推算全仓覆盖率。

21个国家有已采纳来源范围内的现有炼厂，另外49国只对该炼厂类型不适用。已有 `postwar-refinery-source-coverage.mjs` 和原件测试枚举这一范围；没有复制C2参数、虚构其他49国工厂或声称21国全部运营通过。当前 H6 的 C10 只到 SHIP；WORK/PAY/DELIVER仍受Clock与实际劳动/资金约束。

水务值守方案已由用户确认，另一路正在实现；不再把它作为待用户答复。本报告不以授权代替真实人员、技能、480分钟、不重复占用和值守付款证据。

## 本轮定向检查

- `pnpm exec vitest run tests/world-web/industry-run-controller.test.ts tests/world-web/industry-committed-runs.test.ts tests/world-web/industry-utilisation-target-form.test.ts tests/world-web/industry-utility-controller.test.ts tests/world-web/office-command-lifecycle-ux.test.ts --maxWorkers=1 --no-file-parallelism`：53通过、0失败、0跳过。
- 新增续页、末页停止、旧草稿清除、旧页设施不可再次选取、重复/来源变化/撤权/head变化拒绝，以及真实产品DOM按钮路径检查；所有HTTP响应明确是 TEST_ONLY DTO，没有后端验收声明。
- 修改过的历史表单断言由“不保存持续利用率目标”修正为现有独立target支持文案；不改变目标不代表生产的断言。
- 本轮真实Chromium、原生DB、全仓长回归：未运行；由总控单独记录其最终候选证据。

## 静态矩阵工具的限定更新

`scope-inventory.mjs` 现在读取实际 TypeScript 字面量映射，为 U0933/U0934 的6项条款字段与 U0283 的2项目标字段记录 `IMPLEMENTED_UNVERIFIED_LIMITED_CONTRACT`，并逐项保存页面/DTO/来源/Core命令/API/执行器/SQL/读回文件的行号和SHA256。映射字段或所核对关键入口变化时拒绝生成，要求重新核对；不从简单词法命中推导功能已完成。

8项字段保留 `UNKNOWN_NOT_EXECUTED_AS_A_CATALOG_ITEM` 的验收状态，0个完整模块/读出因此被认定完成，分母1404不变。既有Finance补充字段与这8项catalog字段分别记录；机器记录 `reviewedCatalogFieldConnections` 不替换旧的 `supplementalMainFields`。新报告必须在最终候选冻结后再生成；当前临时输出仅是带工作树状态的导航证据。
