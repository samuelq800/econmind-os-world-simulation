# E SHARED-4 strict reader delivery 修复

状态：**IMPLEMENTED_UNVERIFIED**；新固定包独立 P0 审查 **PENDING**。
原 `a6384c72bef8d47093285760a98a89d161db0812` 的 A 独审
**CHANGES_REQUIRED / P0 delivery blocker** 保留，不改写为通过。
Root 转交的实际证据：旧 COUNTRY/Office bodies 2 READ，新
`decisionResults`/`decisionResult` bodies 2 PROTOCOL_ERROR；原 24 tests
只覆盖 projector/publisher，不能证明 reader delivery。

修复在原 `codex/e-office-decision-results` 追加，以 `a6384` 为增量基线；
完整候选仍基于 `bcfc66787631a13aa5093df42954070c2d7dd66b`。
不改原 publisher、Core DTO/经济规则、G intake/service、admission/source、
D boot 或 Root integration 工作树。新增唯一纯 validator 在 API integration 层。

## 合同修复

`postgres-read-adapter.ts` 的既有 strict 顶层字段集合只增可选的精确字段：
COUNTRY 的 `decisionResults`、OFFICE_PRIVATE 的 `decisionResult`。
缺少新字段仍按原 legacy 合同处理；错用单/复数、其他 unknown field、
原 ledger/visibility/absolute-position、row metadata 拒绝规则不放宽。

`office-decision-result-validator.ts` 按既有 typed schema 验证所有嵌套字段集合、
schema/classification/country/office、sourceHead 精确 world 与当前 watermark。
COUNTRY 仅接受 NOT_AUTHORIZED / OFFICE_DECISION_DETAIL_PRIVATE 的无明细摘要。
四职位以外仅接受显式 null；四职位不接受 null。
SOURCE_UNAVAILABLE / NOT_AUTHORIZED 必须无 source/cause/businessState/metrics，
reason 绑定现有 publisher 实际输出，不能以数组/强制字符串化绕过。

COMMITTED 严格验证 event family/business kind、canonical command/event IDs 与
fingerprints、非未来 causality 和单版本推进、SimTime、plan ID 条件及有限 metric 集合。
Captain 七桶与 CB 两项验证 canonical before/delta/after 的实际相减等式；CB
只容许同币种自身两项 trace，仍必须处于 OFFICE_PRIVATE / CENTRAL_BANK 和
既有 AUTHORIZED_FILTERED visibility。Social 只容许 AFTER_ONLY、null before/delta
及 PREDECESSOR_STATE_NOT_CARRIED，不接受 hash→state 或伪造零前态。

last cause 不等于 current position：sourceHead 必须当前，但 cause 可以早于它。
非系统 due 的 cause 必须匹配既有该 Office 的 last activity；Social 系统 due 没有
human Office，允许晚于该统计，不能早于它。不重写旧统计/dispatcher 语义。
reader 的 shape 校验不替代 publisher 的实际 Core replay/committed lineage 检查，
不以 marker/DTO 发放权限；SQL 仍绑定已验证 subject、active/unrevoked entitlement 和
精确 row scope。既有服务层读取后撤权/metadata/readback guard 未改。

## 实际验证

本 checkout own compiled Core/Worker/API 与 dependencies/cache；Node 24.20.0、pnpm 12.3.4。
无 credential、生产连接、preview 或服务启动。本轮没有 native PostgreSQL/Supabase 操作。

- 第一轮两个 suites 72/72 PASS：原 24 projector/publisher + 新 24 consumer-chain +
  未改动 strict reader 24。之后新增 ordinary shape/last-cause 合同负例与 sparse-head control。
- 最终两个 suites **80/80 PASS, exit 0**：原 24 + 新 32 = 56，strict reader 24。
  actual publisher 的 COUNTRY/CAPTAIN rows 直接通过 actual strict adapter → parsed DTO；
  actual publisher 的 CB withheld、Social plan partial、Industry unavailable、Trade null 均送达。
  SQL transport/entitlement 是显式 TEST_ONLY double，非真实 PostgreSQL/HTTP acceptance。
  CB authorized 与 Social due 另以真实 Core/projector 输出通过 strict mapping（不是完整 SQL
  visibility-admission publication 链），保留 CBvisibility 与 Social fabricated-before 拒绝。
- 新负例：wrong country/office/world/head/schema/classification/shape、嵌套未知字段、
  stale/future/invalid last cause、metric delta/key、supported-null、unsupported-non-null、
  COUNTRY private-detail、错用顶层字段，以及 row scope/schema/extra metadata。legacy 两类
  无新字段 body 仍 READ；当前 mock entitlement 撤销后仍返回 null。
- 既有四 suites **91/91 PASS, exit 0**，在本轮后续只涉及新字段的窄校验前运行：
  `https-authenticated-read-composition`、`postgres-server-read-binding`、
  `financial-position-read-binding`、`v10-authoritative-activity-read-projection-publisher`。
  原分类/撤权/metadata/actual admission binding 断言未删除或修改；这些是 local/PGlite
  或 transport-double 检查，native PostgreSQL isolation/concurrency 仍 NOT_RUN。
- 最终 focused tsc / API build / focused lint 均 exit 0；boundary 295 PASS、
  authoritative-patterns 290（Core 89）PASS；safe environment local / databaseConfigured=false /
  NOT_LINKED / mutation=false；secrets、format、diff/freeze 检查另在冻结时记录。
- 本轮没有产品测试失败；来源 A 的原包失败单独保留。既有前轮失败历史不清零、不挪用为新通过。

## 未完成边界

不把 delivery compatibility 称作正式经济接通。Social predecessor reader 和 Industry
committed production source 仍缺；CB admitted-owner disclosure 与 current subject/readback
依赖仍按旧链维护。本包不启用来源、genesis、命令权限、Worker host 或自动发布。
生产 DB、native PostgreSQL、preview/full browser/full build/deployment/live read 全部 NOT_RUN。
不 self-approve/merge；冻结新 SHA 后交 Root 安排 A/B 对新包重新窄审，然后 STOP。
