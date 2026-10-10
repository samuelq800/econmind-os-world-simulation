# 真正需要提供的输入与权限 — 2026-10-10

当前不是再问经济模型选择。D01–D04、D06、ADR-03/18 已有明确决定；D05历史排除
与后续源码准备范围分别保留，不重新问“是否同意D05”。新方案由工程方提出并独审。

## 需要真实来源 / 人类权威，代码不能代填

1. **70国本币与开局FX来源**：每国LC code、LC per 1 GCU的精确rate、version、valueDate、来源及采用依据。GCU scenario→Core GCU1:1已定，不代表LC=GCU。格式与精度校验由A实现，不要求用户设计JSON。
2. **完整央行开局资产/负债/工具清单与计价来源**：声明哪些工具存在、哪些有来源支持的不存在/为零，及实际amount/native currency/holder/issuer/claim/counterparty、valuation/version/date与完整性范围。净值A−L及允许负值已定；未知清单不能由代码补成0。
3. **实际身份与合法席位来源**：现存Auth administrator/subject到团队、国家、Office、capability/revision的合法发布输入与采用者。不是用户重新决定六职位权限模型；session/seat端点、严格绑定和撤权是C/G/E要完成的工程。玩家名单未定可保留未发布，不铸造生产测试席位。

以上先查已固定来源；若已存在就直接消费，不重复索取。以下是已固定候选中的具体定位，
不是要求用户重新设计输入格式。

### 已核实的来源边界和待交付字段

- **金融输入**：A 的 `36ee5c1be849b37a40e97c091af40d3c22398b22` 已实现严格契约和精确多币种生产器，仍待独审。每国需要 `localCurrency`、`openingFx.localCurrencyPerGcu/version/valueDate/source`，以及 CB register 的 `version/valueDate/source/categories/holdings` 和有来源的 `bankLoans`。金额与汇率使用精确十进制字符串；来源绑定原始 UTF-8 JSON 文档、路径、SHA256 和文档内 pointer。已有 scenario GCU 数值和 D01–D04 规则不构成本币/FX/补充清单的采用授权。
- **CB 完整性**：21 类工具须逐类声明 `DECLARED` 或有来源的 `NO_DECLARED_INSTRUMENT`；存在的工具提供 amount、currency、holder、counterparty、usable status 和原币估值来源。来源支持的 0 与未知不同，不补零；净值可为负，不需重新批准这一规则。已有银行 A 全部为 0，正 A 的机制测试不算真实贷款来源。
- **采用与 World 绑定**：A 候选即使所有计算通过，也返回 `BLOCKED`、`seed=null`、admission/activation=false；明确缺 `SUPPLEMENTAL_FINANCIAL_SOURCE_ADOPTION_UNRESOLVED` 与 `FORMAL_WORLD_BINDING_UNRESOLVED`。需要有权采用者绑定实际补充文档的 hash/version/date 和目标 World，而不是把测试向量或规则批准提升为正式 seed。正式 preflight/publisher 接入仍是工程任务，不能误报“仅差数据”。
- **Industry 已有规则**：F 的 `d9853754b3eb2080a5ac4d30c71cae4db013fe0c` 已定位 MASTER U1149–1152、U1172–1183、U1186–1189、U1193–1199、INDUSTRY U1002 及既有 V14 project lifecycle kernel。建设不能免费生成 capacity、库存、就业或资金，无需用户重定这些规则。
- **Industry 真正待决的源值**：固定 `facilities.json` SHA256 `049e39330646048b95636d3a075fc1423ee62762999184a2326df161a198b485` 的 P01/PROJECT-21/territory-44-E1 示例缺精确 construction recipe/capex/payment schedule；建设天数 proposal 90 与 legacy 270 冲突，power/water 顶层 0 与 legacy 49.32/4932 冲突，maintenance 10960 与 legacy 23121.13 冲突。需要固定采用哪个来源字段/版本或提供修正依据；不能默选较小值或把 0 当免费运营。350 个未建 development options 不当作 D04 已建 genesis。

原件通过项目已有受控文件交付路径提交，保留来源、日期、单位和 hash；不在聊天粘贴秘密。
工程方负责转换、逐国错误清单、校验与可回滚幂等导入准备；本轮不执行正式导入。

## 需要当次安全操作确认，不在聊天提供秘密

- **生产专用角色及持久连接**：E先固定最小DCL与唯一publisher设计并独审，再列出确切拟创建/授权对象。实际角色/登录、DB运行凭据/托管绑定须由有权人按安全入口配置；不借现有Cloudflare部署Token充当DB凭据，不复制旧站secret。
- **隔离staging/TLS验收目标**：ADR-18已批准隔离路线，不重问ADR。F先继承现有同目标证据；若确缺受控目标或权限，由负责人提供安全连接/只读证据或作出明确替代决定。一次性PG机制通过不能冒充此证据。
- **唯一数据库发布链实际执行**：E先完成可独审caller/manifest/readback工程，旧站唯一发布者按明确授权执行；World仓库不增第二条发布链。真实生产prefix目前UNKNOWN，不能盲发最初17项或当前23项。

此文件没有请求密码/Token明文，没有新建或扩大持久权限。准备可启动不自动授权正式导入、经济运行、paid资源或修改gate。

## 已决定、正在实施，不需要用户再审批同一规则

| 工作                                                       | 执行方与当前动作                                         |
| ---------------------------------------------------------- | -------------------------------------------------------- |
| LC多batch、B/TGA与R paired claims、银行开局reconciliation  | A实际生产器与严格输入代码；已有经济决定不重开。          |
| 三族Office浏览器提交/FINAL、真实session生命周期            | C实际消费链；真实server seat输入缺失明确断开。           |
| acquire/renew/fence/drain与正常恢复、既定10×/pause/catchup | D实际lease代码及既有ADR-03的Clock恢复方案。              |
| 跨服务private authority、唯一publisher、最小权限           | G/E给技术方案，B独立设计审查；不让用户代做一般工程选择。 |
| V09实际证据及Industry既有规范查明                          | F复用原件、只补真缺项；不重复全量或420巡检。             |

当前状态：A/C/D/F 已形成固定实现或证据候选，交叉独审进行中；E 权限设计独审中；
G 仅按独立设计批准实施切片 1/2，生产构造与消费切片 3/4 仍 HOLD。仍非 START_READY。
最小角色、绑定名称、发布前缀检测、Clock/host 接线与上述 preflight 接入由工程方解决，
不把一般技术选择变成新的用户审批项；真实持久授权、来源采用及生产启动仍独立受控。
