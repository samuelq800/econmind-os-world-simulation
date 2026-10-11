# Repository presentation of E's independent Industry review

Original managed artifact: `/Users/samuel/.codex/state/plugins/codex-security/scans/c-industry-execution-design-20261010/artifacts-89906e23d4115420e6aec96649d9996b94534dadba5db45e72bf5c6291013131/artifacts/E_C_INDUSTRY_DESIGN_REVIEW/review.md`.

Presentation only; original managed artifact remains canonical. Original negative
review and final delta review are both retained; design approval is not runtime
or implementation approval.

---

# E 对 C Industry execution-family DESIGN 的独立窄审

结论：**CHANGES_REQUIRED — 仅实施分包/依赖计划需修订**。  
评估建议：`revise`；不是经济规则否决，也不是“所有工程 external blocked”。认可 facility target-only 方向、exact arithmetic、安全/权威边界及 production HOLD；不据此批准执行注册、生产或调度激活。

## 1. 固定对象与实际核验

- WT：`/Users/samuel/Documents/econclub/.econmind-worktrees/c-industry-execution-design-20261010`；审查前后 clean。
- base：`5089a69096f351c3e651600c65deab5ead2fccf2`；tree：`fa5b7e753e323a15cd5585672d75a6367bf31183`。
- doc commit：`032ace57f911c4ccc2f66d9984dd3b33ba54236d`；tree：`6ce3d33e26288957edcdea0c2c828bc676c91e57`。
- 唯一改动：`docs/reports/start-ready-20261010/C/INDUSTRY_EXECUTION_FAMILY_DESIGN.md`，201 行新增；无执行代码、SQL、grants、配置或经济状态变化。
- 文档 SHA256：`4b9e0d824dd5c2277f6e18322ae66282b8ef441f7ad48a57fc18eb5cd8e06204`。
- 完整 canonical diff SHA256：`0981bc27af2848a8536c2b5998e74888f0674cb08b76738b607565088de54aaa`。
- diff 定义：`git diff --no-ext-diff --binary --full-index --no-renames --no-color BASE HEAD`。
- 完整读取设计；独立复核 24/24 principal-source 哈希与 base 原始字节一致；Industry 原 DOCX 与 source_manifest 哈希一致。
- 原始 OOXML 与 source_units 的 10/10 路由关键单元逐项核对；Markdown 的表格/换行格式化也匹配；oMath 数量 0。
- 独立只读 helper 最终 exit0；`git diff --check BASE HEAD` exit0。
- 初版 reviewer helper 把带人工 `|`/换行展示分隔符的 Markdown 当作原 XML 连续字符串，得到 2/10；随后按原始 table cells/source_units 比较，原文 10/10 匹配。中间 renderer 将换行误当字面反斜杠 n，另有 3 个展示比较失败；修正 helper 后全过。两份中间结果保留，不将 reviewer 工具错误报为 C 的源文错误。
- 只执行 reviewer 自有标准库哈希/ZIP/XML/Git 只读 helper；没有执行 subject-controlled build/test/script。写入仅 reviewer-managed artifact 临时区及保留集合。

## 2. 一个应修订的问题

### C-R01 / P1：target-only 与 physical-run 依赖在实施计划重新混合

定位：设计 :131–153，尤其 :137 的 I-READ、:152 的 inert-types-first、:153 的 target implementation after I-CMD/I-AUTH/I-READ。

第 4 节 :97–103 正确承诺“只改 target、不产生 inventory/financial postings”。但 I-READ 把同头设施身份/旧目标与真实配方、人员、维护、供能供水、物流和资金并成一个门槛，再让 target intent 的实现依赖整个 I-READ；最先工作则只允许 inert types/refusal tests。这会使没有制造结算事实时，连有实义的目标 parser/Event/replay 工程也被延后，不能形成最小可测切片。

依据：

- 原规范 INDUSTRY-U0261/U0283/U0947 明确 Industry 可以设置 Facility/Sector utilisation target；U0280 明确 target 不能自动变产量。
- U0262–U0269/U0279 约束真实投入、产能、维护与可行产出，不把这些因素写成纯目标意图 parser 的输入。
- `authenticated-office-command-contract.ts:7–19`、`manual-office-command-composition.ts:50–78` 的三族 allowlist 证实 Industry 尚未注册。工程上需要独立、有行为的纯模块；并不需要现在打开 allowlist。
- 既有 `captain-political-capital-allocation.ts:109–150,305–343,348+` 已示范 strict parser、纯 Event preparation、确定性 replay 与后续 server authority/commit 分离。它不是 Industry 现成实现，不能直接复用其经济状态/授权。
- production persistence/replay 的拒绝门槛不会拦空 inventory 数组的 target-only candidate；不可因此删除或绕过该拒绝门槛。

反例：某设施的权威身份、旧目标和同头 lineage 有效，但没有足够燃料/维护资金。它不能获得生产结算正例；这不应阻止编写并验证目标从旧值到新值的确定性转换。真实 runtime 是否接纳该设施仍须 reader/admission 证据；本审查未宣称其存在。

修订验收：

1. 将 I-READ 拆为 TARGET_SOURCE（同 World/country 设施身份、允许目标操作的对象范围、已建立旧目标、当前 head/lineage）与 OPERATING_SOURCE（实际生产所需事实）。不能将 built/adopted 升格为 commissioned/operating；也不擅自断言所有未投产设施可接收 live target。
2. 将 I-TIME 拆为手工 target 的既有 server-clock/command/Event/receipt 兼容与后续 production interval/due policy；后者不阻塞纯 target 转换模块。
3. 将 §6 首包改成下节的有实义 parser＋positive Event preparation＋replay＋正反例，而非 inert types-only。明确纯模块不是 authority issuer、不是已提交事实，不修改 public accepted families、数据库或 runtime start。
4. 后续 runtime 注册/真实正例仍依赖实际 TARGET_SOURCE、现行授权、clock/cutoff 和独立评审；保留 missing-source 默认拒绝。不要用测试向量伪装已准入 World。

这是一处已明确的计划契约问题，因此使用 CHANGES_REQUIRED/revise，不使用笼统 hold_for_evidence。无需获取新的生产数据即可修订文档。

## 3. 已获源码支持的边界

| 审查点                                | 证据与结论                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 最小合法操作                          | 原 DOCX/INDUSTRY-U0283/U0947；一个 existing facility＋canonical ratio [0,1]。不扩大到 sector aggregation、开厂、扩建、项目、采矿或生产。目标操作本身未规定 Finance/Trade 联签；不能由此免除其他操作审批。                                                                                                                    |
| exact ratio/units                     | `common.ts:17–34,79–82`；目标是 ratio，不是 number/百分数裸值。capacity 为 output/duration，duration 单位须匹配；productivity 必须保持 output 维度。                                                                                                                                                                         |
| maintenance 与 utilisation 缺口       | `resources-energy-production.ts:464–551` 计算 P=C×d×u×p，Q=P×min(material,energy,labour,logistics)，无显式 maintenance；其 capacityUtilisation 为 Q/P，不能冒充 U0278 的 CurrentOutput/OperationalCapacity。设计对此警告正确。实际生产需经济 owner 明确维护如何作用且不双扣、时间分母与 productivity basis；不能默认维护=1。 |
| V13 是提案                            | `energy-production-foundation.ts:504–647` 要求 nonempty material facts，按 Q/P 提出材料/energy/labour/logistics consumption；P=0 时 scale=0。没有创建权威 inventory、发电、工资或 GDP。                                                                                                                                      |
| production 不被现有持久层接纳         | `production-consumption-posting.ts:435–448` 的 admission guard；atomic repository :832 在 transaction 前调用；durable lineage reader :255–263 拒绝 production schema/operation。保留两侧拒绝，不能把 Core 正例称为 SQL 可运行。                                                                                              |
| 没有零产量伪 posting                  | posting constructor :177–186 拒绝 Q≤0；:259–260 拒绝 zero/unfunded cost。零目标不等于没有维护成本、退款、恢复库存或退役。                                                                                                                                                                                                    |
| 单 writer/结算边界                    | Constitution-U0433–U0445；生产物量、能源、资金、国民账户各有权威写入边界。未来 settlement 必须协调原子效果，而非 browser/Office 新建独立账本。                                                                                                                                                                               |
| 原型不是真执行                        | IndustryCommandCenter 是 local-state prototype；设计保留其非权威标签。真实 Browser/Core/Worker family 都没有 Industry；capability enum 不是 grant。                                                                                                                                                                          |
| projection 分离                       | `office-decision-result-projector.ts:239–240` 对 Industry 当前无条件 source unavailable。未来应独立呈现 target committed 与 production settled，不能拿 Event 数量、saved target 或 prototype log 展示“已生产”。                                                                                                              |
| clock 不凭空成立                      | durable consumption :395–399,479–486 使用 bound server clock，null clock 拒绝；prepared lifecycle 不代表 activated。current generic projector :133–145 仍要求 Event/receipt 与 command SimTime 相等。设计保留兼容缺口是正确的；本审查不修、不重审其他 owner's time patch。                                                   |
| 真实 source 不从 opening preview 推导 | official physical adoption :245–255 的 built 状态仍 commissioning UNRESOLVED、operatingReady:false，未包含可直接使用的既有 target lineage。不得补 target=0、伪 commissioning 或 invent operating authority。                                                                                                                 |

技术/R&D/project/energy 等全家族表仅作为后续范围边界；本次不声称完成这些家族全部规则或 licence/lifecycle 的专项审查。

## 4. Root 可另行授权的最小工程包（本次不实施）

### 包 T1：可运行的纯 target transition，而不是只添类型

建议 ownership：Industry/Core implementer 仅新建
`packages/core/src/commands/industry-utilisation-target.ts` 与
`tests/world-core/industry-utilisation-target.test.ts`。
必要的 Core export 单独列入共享文件协调；不擅自改 accepted DTO union 或 composition。

工作内容：

- 在短小设计增量中冻结 command/payload/Event tag、严格字段集合、before/after schema、no-change 行为和 replay 身份规则。命名与序列化是本地工程决定＋普通独立 review，不是等待外部经济数据。
- strict parser：versioned INDUSTRY scope、stable facilityRef、canonical decimal ratio [0,1]、exact key set；拒绝 output/capacity/recipe/price/READY/authority/client-clock 字段与 number/错单位/非 canonical 输入。
- 纯 prepare/apply/replay：调用方显式提供已存在的 facility/旧 target/source-head 事实；验证 World/country/facility/head/time/hash/前驱一致，再形成 target-only Event；不生成库存、资金、产能或 authority proof。
- 开始/前驱 target 必须已明确，缺失报错，不用 0 或最近 UI 值补齐。current-time 与 command-time 分开建模；沿用现行已审契约，未解决的跨时刻兼容必须有明确拒绝/NOT_SUPPORTED 测试，不回写 Command SimTime，不自行开新 clock。
- replay 对 exact duplicate 不增加第二效果，对同 identity 不同 fingerprint、错 before/head/sequence/source 拒绝。共享 global stream 的其他家族事件如何推进 head需明确，不能假设 Industry Event 连续独占 sequence。
- 测试必须包含合法 0/1 和一个非边界 ratio 的确定性 before→after、exact replay/retry、错误身份/范围/字段、missing predecessor、同 ID conflict 和无物理效果。这里的受控测试向量是 UNIT_TEST_ONLY；不是正式 World 数值、真实源 admission 或生产运行证据。

验收产物：实际正反例运行记录＋strict build/typecheck＋bounded lint/format；没有 public intake 注册、grant、SQL DML、runtime enable 或“可玩”声明。Root explicit assignment/review 后才可开始，本报告不自动授权写代码。

### 包 T2：target-only reader/candidate/transport 再接线

在 T1 固定契约后，独立明确 TARGET_SOURCE 的真实 owner/存储来源、既有 target genesis、设施可操作范围及 exact-head replay。可随后实现真实 reader 与固定 candidate factory、source-before-claim 和 commit-cutoff recheck；接入现有三族 transport/composition 的明确 Industry 分支。不存在来源时保持拒绝；不要传 caller snapshot/READY boolean 或泛化任意 candidateFactory。

真实成功 commit 另需 A 的实际授权 source、现行 writer/head/cutoff、bound server clock/time compatibility、正式 source admission 与 target-only receipt/result replay。此包可在 isolated local fixture 证明工程行为，但不能把该 fixture 升格成这些真实事实。

### 包 T3：Industry target result 展示

读取经验证 Event/receipt 的 facility、before/after、source head，展示“目标已修改，未产生实际产量”。等待实际 disclosure/entitlement 接入后才给用户可见字段；保留安装后的 DOM 授权失效清除。physical-output fields 继续 unavailable，不能顺带开启 inventory/finance visibility。

### 不是 T1 的前置条件

完整 recipe、实际能源/水/物流/劳动力、维护付款、技术许可、production funding/settlement、GDP valuation、生产周期或自动 due scheduler。它们是后续物理生产的真实依赖/规则决定，不是 target parser/replay 工程的借口，也不是可默认填值的参数。

## 5. 真正需事实、规则或外部接入的事项

- TARGET_SOURCE：设施与国家/运营对象范围、已准入初始 target/event lineage；目前未建立。schema 可以设计，真实记录不能伪造。
- AUTH/VIEW：当前 server-held Industry seat/capability/team/revision、source registration 与 disclosure；必须消费对应 owner 的正式接入，不加 grants、不凭 enum 放行。
- TIME_RUNTIME：真实 bound clock 与既有 command/event/receipt 时间契约一致性；不要混同为需要现在决定 production interval。
- PRODUCTION_SEM：maintenance 与 operational capacity 的去重位置、规范利用率分母、实际 interval/productivity/recipe；改变经济语义需相应 owner 决定。
- PRODUCTION_FACTS/SETTLE：真实所有权/许可/技术、投入/能源/人员/物流/维护/资金，以及两侧 production schema admission 和跨 writer 原子结算。没有实际来源就不能宣称真实产出。
- ACCOUNTS：源估值、货币口径、期间完整性与单 national-accounts writer；禁止 target 即 GDP。

## 6. 证据等级与停止

独立 PASS 是 fixed-doc/source provenance/原始单元核对和源码窄审，不是 Industry 单元执行或 runtime 验证。NOT_RUN：build/typecheck/lint/完整420/CI/native PG/HTTP/数据库/生产/grants/clock推进/consumer enable/源注册/真实 production 数值/activation/main composition/push/PR/merge。设计中 future tests 不记为 PASS。

适用评估技能使保留报告/JSON/evidence 写入 managed artifact collection，并将 doc-only 检查与执行验证明确分开。无源码修复、不回退他人修改；本次不实施上述未来包，不给 Root 发未获人类授权的跨线程消息。完成固定报告后 STOP。
