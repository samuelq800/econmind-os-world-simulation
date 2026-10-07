# E：正式 70 国开局的最小经济选择

日期：2026-10-07。状态：`PROPOSED_NEEDS_OWNER_DECISION`，不是 `APPROVED`。
这是给 Root 一次提交负责人的普通提案，不是 seed、审批记录或执行输入。
没有修改代码、schema、source、mapping、gap、status 或 ADR；没有生产请求、SQL、World 创建、角色分配、seed commit 或 Worker/Clock 启动。

结论：六个既有 OpeningSeed gap 可以合并为下面五项人类选择。推荐将币种和银行尾差按明确规则闭合，保留原件；产权按既有候选 ID 固定。真正不能从来源补出的，是唯一正式 World 绑定，以及财政/央行资金的经济关系、分拆值与金融账户对手。只读绑定、PG lease PASS、main 合入均不能代替这些选择。

## 1. 一次需要负责人回答的五项

以下所有推荐都未获批准；未选择项继续 HOLD，未知金额不填 0。

| 项目 | 推荐候选 | 必须明确的答复 / 替代项 |
| --- | --- | --- |
| 唯一 World | `BIND_VERIFIED_EXISTING_WORLD`：70 国共用一个正式 World，所有账户、库存、seed、replay 绑定同一 ID | Root/A 的独立只读证据给出正式 World ID、head/version、既有 seed/fingerprint、configuration/model。负责人确认该绑定。若没有可证明的正式 World，保持空；另行授权唯一正式创建，不能从 null 自动建第二个 |
| 主体与产权风险 | 批准下面固定 legal roster；正库存由对应 OP 同时持有 title、承担 risk，数量不变 | 接受该 roster 与逐项 stock manifest，或提交明确例外。GOV/OP 不互相替换；财政、央行、银行、家庭账户 owner 要同时批准，不能以 NPC/team 代替 |
| scenario GCU → Core | 对冻结包采用 exact `1 GCU_SCENARIO_ACCOUNTING_UNIT = 1 Core GCU`，无 FX、无舍入 | 接受 1:1；或给出版本化 exact 换算系数及适用字段；或 HOLD。价格、收入/税收参考不因此成为已赚/已付现金 |
| Treasury/CB 合并余额 B | 在下面 A/B 两种语义中选一种并补齐资金 manifest；当前没有依据推荐数值比例 | A：两个不重叠资金池，给出统一 exact 财政份额 p 或 70 行 T/C；B：财政在央行的存款，给出财政存款、央行其他初始资产/负债、资产 backing 的确定值与对手。另需确认银行 R 是什么资产/对谁的 claim，不能用 generic balancing account 代答 |
| 银行 L/E exact 对账 | 联合采用组件锚：保留 H、D、R、A，运行候选 `L*=H+D`、`E*=R+A−L*`；来源 L/E 永不覆盖 | 接受联合规则及既有 70 国差额清单；或提供重新审定的金融 source vintage；或 HOLD。不能只修 L 或 E、用 epsilon 放行、默认分币舍入 |

### 唯一 ID 规则

采用已核实的唯一正式 World ID，而不是给每国造一个 World。Core ID 必须符合现有 `^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$`；不把 country ID、Supabase project ID 或数据库 UUID 擅自转换成 World ID。即使是语法有效的 `WORLD_*` 名字，也不是存在/批准证据。

本提案的实际 `worldId` 仍 **未填写**。若已有 immutable seed，不能替换为这份提案；相同 seed 才能幂等重试，不同 seed 是 conflict。无 seed 的开局要求 WorldVersion 0，需独立核实，不在本提案查生产。

### 固定主体与 title/risk 候选

`NN` 为冻结映射中的两位国家编号 01–70，不是新 ID 生成器。采用已经存在的候选 ID：

| 源主体 | 既有 Core legal 候选 | 提议 owner/title/risk 语义 |
| --- | --- | --- |
| `OP-NN` | `ENTITY_OPERATOR_NN` | 源 OP 的 619 正库存 title=risk=此实体；business deposits D 的聚合持有人候选为此实体，须负责人明确接受 OP 代表该业务资金池，不能从名字自动推断 |
| `GOV-NN` | `ENTITY_GOVERNMENT_NN` | Treasury 账户 owner；源 GOV-owned 设施若后续采用，title=risk=此实体；OP 只作为 operator，不自动转移产权/风险 |
| `HOUSEHOLDS-NN` | `ENTITY_HOUSEHOLDS_NN` | 家庭存款 H 的聚合持有人；不是每户开户，也不绑定真实用户 |
| `BANK-NN` | `ENTITY_BANK_NN` | 银行 R/A/L/E 账户 owner；每个存款 claim 明确其持有人与银行对手 |
| `CENTRAL-BANK-NN` | `ENTITY_CENTRAL_BANK_NN` | 央行账户 owner；不因与 Treasury 合并展示而成为 GOV 或 OP |

若负责人不接受 OP 承接全部 D，必须补充真正的业务存款持有人分配，要求 exact 合计等于 D；来源没有更细的开户名单。所有 350 主体均须成为批准的 roster/账户 manifest，不能只把 null 改成字符串。221 个源零库存格仍参与全量对账，不创建 positive opening entry。设施 title/risk 的建议只有在独立资产采用批准后生效。

这个 legal 选择不批准 NPC principal、Office capability、自动接单、team/seat 或 Worker dispatch。ADR-05 的 title/risk 分离原则也不等于批准这份 70 国 roster。

## 2. Treasury/CB：缺的不是精度，是资金归属与账户关系

来源只有 `treasuryCentralBankBalance=B`，无 `treasuryBalance=T`、`centralBankBalance=C`，无比例 p，也没有足以证明 B 是现金还是财政在央行存款的账户关系。不能默认各半、默认 0、复制 B 到两份 CASH，不能把 bankReserveAssets R 从 B 自动扣掉或自动加上。

**选项 A——互不重叠的两个 genesis 资金池。** 负责人可给一个共同 exact `p∈[0,1]`，显式批准所有国家 `T=p×B`、`C=B−T`；也可给逐国 70 行 T/C。统一规则减少手填，但比例是政策选择，不是来源事实。本提案不选 p。所有行必须 exact `T+C=B`，不舍入，并说明各资金池的账户 class、owner、genesis funding/counterpart。若 p 选择使某腿为 0，保留对账中的 0，但不创建要求 positive Money 的零额金融腿。

**选项 B——财政在央行的存款。** 先由负责人明确是否 `财政存款=B`；该值若获批，应是财政 DEPOSIT 资产与央行相应 LIABILITY 的同一 claim，而非两份 cash。必须补齐央行 backing 资产、银行 R 是否央行存款/其他 reserve asset、对应负债与央行净权益。来源没有这些 backing/其他余额；不能为了借贷平衡捏造金额或历史借款。B 也不能直接沿用选项 A 的 `T+C=B` 资金池恒等式。

来源注明 `EXPLICIT_GENESIS_ALLOCATION; no invented historical debt`，publicDebt=0、existingContracts/historicalClaims=[]。物理资产 book value 的来源语义是 `GENESIS_PUBLIC_CAPITAL_EQUITY_NOT_NEW_CASH`，不能加入 Treasury/CB 现金。

现有 admission 要求 `treasuryCentralBankBoundary=SPLIT_APPROVED`。选项 A 满足语义后仍需独立审核新 manifest；选项 B 的账户承载和该 admission 标签是否准确须另行审核，不在本提案改代码/改标记。目前合法保留方式只有 source-only 的合并 B，不伪装为已拆分 seed。

## 3. 三个代表国：原始值、既有 derived 与差额

以下 B/H/D/R/A/L/E 全部单位为源 `GCU_SCENARIO_ACCOUNTING_UNIT`，不是已批准的 Core Money；1:1 候选批准后数值才按原数采用。无千位缩放，原始十进制尾数完整保留。

| 字段 | COUNTRY_01 / Avenor | COUNTRY_02 / Brelis | COUNTRY_54 |
| --- | --- | --- | --- |
| B：财政/央行合并余额 | 46796106931.2 | 59376141711.36 | 161302241395.41 |
| H：家庭存款 | 17548540099.199997 | 22266053141.760002 | 60488340523.27765 |
| D：业务存款 | 5849513366.4 | 7422017713.92 | 20162780174.425884 |
| R：银行准备资产 | 25737858812.16 | 32656877941.248 | 88716232767.47389 |
| A：银行贷款资产 | 0 | 0 | 0 |
| source L | 23398053465.6 | 29688070855.68 | 80651120697.70354 |
| 既有 expected L*=H+D | 23398053465.599997 | 29688070855.680002 | 80651120697.703534 |
| source L−L* | +0.000003 | −0.000002 | +0.000006 |
| source E | 2339805346.56 | 2968807085.568 | 8065112069.770354 |
| 既有 expected E*=R+A−L* | 2339805346.560003 | 2968807085.567998 | 8065112069.770356 |
| source E−E* | −0.000003 | +0.000002 | −0.000002 |

采用组件锚时，运行改变量是上表 source−expected 的相反数。COUNTRY_54 的 ΔE 不等于 −ΔL，不能只用 L 的尾差推 E；必须从 R+A−L* exact 重算。未采用时，以上 expected 只是既有对账证据，source 未被修正。

财政拆分如果选择 A，三国分别需要负责人给出的 `p×46796106931.2`、`p×59376141711.36`、`p×161302241395.41` 作为 T，C 用 exact B−T。p 未选，故三国 T/C 的实际值均 **MISSING**；没有填写任何默认分拆数。

全 70 国差额直接引用冻结 `C_OFFICIAL_WORLD_OPENING_MAPPING.json#/records/finance/*/reconciliation`，不是本提案重生成的报告。其 `invariants` 记录 L 不匹配 56 国、E 不匹配 62 国，最大绝对差分别 0.00001 / 0.000017，经济语义算术异常分类数 0；这项分类不是修正或批准许可。

## 4. 开局资产与运行许可：哪些现在可以沿用

现有批准可沿用：官方 source package 的选择、冻结来源/地图的保留与 provenance、既有 Country ID/单位映射，以及 title/risk 分离和 exact ledger 原则。**没有一组下面的 proposal 可以仅凭这些批准自动升成已运营事实。** 可保留、展示、核算提案；不能自动实例化运行产能或收入。

| 既有来源及数量 | 源口径/单位 | 提议后续采用范围 | 仍须明确的采用与动作 |
| --- | --- | --- | --- |
| facilities 1374＝portfolio 1024＋development 350 | capacityUnit 随条目，例 tonne/sim-day；MW、m³/day、workers、machinery 等依字段；不是统一产能单位 | 优先逐项白名单审定 1024 portfolio；350 `UNBUILT_OPTION` 继续保留提案 | owner/title/risk、license、技术/recipe、投入/设备、资金、staffing、水/电、maintenance、domain carrier。建造/投产须独立授权，map point≠建成 |
| deposits 240 | commodity 单位如 tonne；开采能力为该单位/sim-day，分层 geological/discovered/recoverable/developed | 保留所有分层数，采用需与获准设施、矿权/license 配套 | developedRemaining 仍 conditional；源 runtimeExtractionPerDay=0 与 openingExtractionPlan 均不得冒充历史/已执行采出；库存不再重复从地质层扣减 |
| waterAllocations 122 | m³/day，季节可用水来源独立保留 | 显式分配权 manifest，不能把 proposal 当 granted | basin/region、季节约束、用户/持权人、配额、grant/license 与运行供水路径 |
| power 70 | MW、MWh、capacity factor、loss/efficiency/SOC fraction | 逐国候选电网与设备审定 | 设备权属、能源输入、接入/energization、dispatch、SOC 能量 backing；SOC=1 不自动变成已有可放电能量 |
| employment 70 | 人/候选岗位；收入是独立 reference | 已有劳动/社会计算口径可引用，不创建岗位 | 雇主、岗位、资格、合同、工资/资金与真实 staffing；source employed≠已就业事件 |
| populationServices 122 | population/households/housingUnits、schoolSeats、workers、beds、visits/day、domestic m³/day | 地理人口/服务候选可保留；服务资产按域白名单 | title/risk、设施、teachers/medicalWorkers、工资、维护、水电与服务许可；床位/学位≠staffed delivery |

这里的“采用”不是本提案执行：以上字段没有 `OpeningSeed` carrier，需各域批准与适配器独立承载。人口、地理、设施、矿储、水权、电网、岗位、社会服务不应通过凑进 inventory/financialBatches 假称已完成运行初始化。税率、日收入/税收/贸易/维护参考、cashRunway 与 book value 也不能直接计作已赚 GDP、已到账款、已付成本或新增现金。

## 5. 五项答复后还需什么才能形成合法 full seed

负责人答复是经济语义输入，不是 bootstrap 执行授权。实现方之后须形成新版本批准 manifest，并独立核对：

1. 唯一正式 World/head/既有 seed、WorldVersion 0 与 configuration/model/replay 绑定；如已有不同 seed，不允许覆盖。
2. 350 主体 roster、619 正库存逐项 title/risk、840 源格 exact 对账和 commodity/unit/location；源保留 221 零格。
3. 全 70 国金融账户 owner/class/currency、claim 与 counterpartyEntityId 成对、genesis 来源和每条 opposite counterpart leg；批内 account 不重复，所有正额 debit/credit exact 闭合。来源未给出的央行 backing、资金池数/claim 和业务持有人细分必须有批准数值/规则，不能借“平衡”新增隐含债务或现金。
4. 70 个单国 GCU financial batches、经 Core parser 验证的源与完整 seed；admission 源选择/独立 oracle、mapping/gaps/coverage/new seed fingerprints 与新批准内容一致。hash 一致只证明身份，不证明批准；金融批整体平衡也不证明金额符合 source。
5. independently reviewed release/migration chain、明确的 E 操作授权及存储/readback 核对。正式 opening、各域运行采用、Worker/Clock 启动是分别授权的动作。

不得原地 flip 旧 `openingSeedReady=false`、`activationAllowed=false` 或沿用旧 fingerprint 冒称新语义已批准。此提案不关闭六个 canonical gap：`WORLD_ID_BINDING_REQUIRED`、`OWNER_LEGAL_ENTITY_BINDING_REQUIRED`、`SCENARIO_CURRENCY_CORE_BINDING_REQUIRED`、`TREASURY_CENTRAL_BANK_SPLIT_REQUIRED`、`SOURCE_BANK_DEPOSIT_LIABILITY_RECONCILIATION_REQUIRED`、`SOURCE_BANK_EQUITY_RECONCILIATION_REQUIRED`。

负责人可一次回复：唯一 World 证据引用；固定 roster/title/risk 是否接受及例外；GCU 是否 1:1；A/B 账户语义与 p/70 行分配或央行 backing manifest、R 的账户关系；L/E 组件锚是否联合接受。资产域可明确“暂保留 proposal，不影响先形成库存/金融 seed”，但这不表示完整经济循环已经可运行。

## 固定证据、hash 与本次检查

读取版本：`e3a3b98527090203b5f9241a4d652aa024b394b3`，仓库 `/Users/samuel/Documents/econclub/econmind-os-world-simulation`；只读 Git 对象，不运行 source generator。五项 identity 比较证明本 main 的 mapping、gaps、F handoff、finance、CHECKSUMS 与 C 冻结 draft 基线 `5e4b9d9ae50b04149a5a6e67478051dc1b1d8ec1` 字节相同。

| 固定对象 / locator | SHA-256（字节 hash） |
| --- | --- |
| `artifacts/world-balanced-candidate-v1/CHECKSUMS.json`，package `BALANCED_2026_09_28_V1` | `88dd44478f97d2e8893a4f11b3aaf96e256bdb13248aca0d08f097fabe10d315` |
| `docs/reports/world-connection/C_OFFICIAL_WORLD_OPENING_MAPPING.json` | `d2811910a9021e68fabe894504701d6dc8d88e362fc2354b0c826e3446456253` |
| `docs/reports/world-connection/C_OFFICIAL_WORLD_OPENING_GAPS.json` | `1254b3c2929e10d3b8a582e032bc22648b04d01236e3098a18a1c39974d46539` |
| `docs/reports/world-connection/F_OFFICIAL_OPENING_WORKER_HANDOFF.md` | `d63fd304b23dd4f5eb5c0a5a6658cbdcc4ed9f87682ae407de3c5b9b52525625` |
| package `data/finance.json` | `4f30d7dd43aa2190604d4fb73c776a8d4aaa263653dc783def6f7c2c5cc80805` |
| package `data/entities.json` | `d53e64a28110ea3615d42be03fc740a2fe72b55e6aeb5d4a584f5d2c117a6593` |
| package `data/stocks.json` | `d52e68856dabdda6d5488043291ee92100f22c16ea44d34d2000170402ee8153` |
| package `data/facilities.json` | `049e39330646048b95636d3a075fc1423ee62762999184a2326df161a198b485` |
| package `data/deposits.json` | `62076847d10529da672de8a97607dd98387be459cf6fd617c24d33f29875f516` |
| package `data/water-allocations.json` | `53b4d7cd0425f6a0789cad2e1bcd0800420a5010f38307e895742df1c0567841` |
| package `data/power.json` | `81e910b36558260e0372f6b00474147e431ed502387b78bfdcc0d8dd2f26713e` |
| package `data/employment.json` | `f5e5f79d9d0453f291c05840ee468fa71b7e021e29a79766cc75530a1986155f` |
| package `data/population-services.json` | `86e828a421346aecaa31c95a7805289a022c80df93399545aeea39f6ce361615` |

后三类及实体/库存/设施/矿储的 hash 引自冻结 mapping 的 `source.dataFiles`，不是本次重验所有文件。mapping 的 canonical fingerprint 为 `sha256:230f8d695c25ea839fb6415de3c4c2985dd6d95e6261fa10dbec73053dedac82`；gaps 为 `sha256:f374ed3a888305a467f52d0aeaf7c545a6513cf17accc10c9537850694b68e95`；coverage 为 `sha256:8b915aadb1aa299cc1c2529eb8ed996f1e8ff9c8ad5bd7ff88731c6d459efa2d`。canonical fingerprint 不等于字节 hash。

复用 C draft：[README](/Users/samuel/Documents/econclub/artifacts/opening-decisions-5e4b9d9-20261005.ngSB9x/README.md)、[决策选项](/Users/samuel/Documents/econclub/artifacts/opening-decisions-5e4b9d9-20261005.ngSB9x/DECISION_DRAFT.json)、[冻结证据](/Users/samuel/Documents/econclub/artifacts/opening-decisions-5e4b9d9-20261005.ngSB9x/FROZEN_EVIDENCE.json)。本提案只补具体主体规则、账户选择与三国例子，没有重生成全 70 国差额。

本次局部检查：3 国原始 JSON 数字 token 先转 string 再读取，不经过 JS Number；BigInt 定点 exact 独立核算这 3 国的 H+D、R+A−L* 与两个 source−expected 差额，12 项均匹配既有报告（exit 0）。五对象 byte equality/hash 检查 exit 0。查阅当前 Core ID/OpeningSeed/financial ledger、Worker admission/store 约束；未运行 Core/PG 全量测试，不声称独立 P0 review、正式 opening 或 Gate B 通过。交 Root 后 STOP。

附加离线核对：三国 B/H/D/R/A/L/E 共 21 个原始 token 与冻结 mapping 字符串逐项相同；文档必要标记/数值与密钥模式扫描通过（exit 0）。第一次附加核对因 one-liner 引号语法错误 exit 1，未执行检查/未改文件；修正后 exit 0。使用宿主 Node v26.5.0 做文本/BigInt 诊断，不当作 pinned Core toolchain 的构建或测试证据。
