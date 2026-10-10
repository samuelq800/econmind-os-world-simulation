# 真正需要提供的输入与权限 — 2026-10-10

当前不是再问经济模型选择。D01–D04、D06、ADR-03/18 已有明确决定；D05历史排除
与后续源码准备范围分别保留，不重新问“是否同意D05”。新方案由工程方提出并独审。

## 需要真实来源 / 人类权威，代码不能代填

1. **70国本币与开局FX来源**：每国LC code、LC per 1 GCU的精确rate、version、valueDate、来源及采用依据。GCU scenario→Core GCU1:1已定，不代表LC=GCU。格式与精度校验由A实现，不要求用户设计JSON。
2. **完整央行开局资产/负债/工具清单与计价来源**：声明哪些工具存在、哪些有来源支持的不存在/为零，及实际amount/native currency/holder/issuer/claim/counterparty、valuation/version/date与完整性范围。净值A−L及允许负值已定；未知清单不能由代码补成0。
3. **实际身份与合法席位来源**：现存Auth administrator/subject到团队、国家、Office、capability/revision的合法发布输入与采用者。不是用户重新决定六职位权限模型；session/seat端点、严格绑定和撤权是C/G/E要完成的工程。玩家名单未定可保留未发布，不铸造生产测试席位。

以上先查已固定来源；若已存在就直接消费，不重复索取。尚未找到的逐字段缺项由A/F精确列出。
Industry成本、材料、资金、产能与完成规则先从原MASTER/INDUSTRY/D04及已有kernel定位；
没有完成来源定位前，不把它列为新的用户经济裁决。

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

当前状态：施工已分配；仍非START_READY。下一更新应包含真实fixed候选/测试/审查结果，
不是重复“已发现缺口”。
