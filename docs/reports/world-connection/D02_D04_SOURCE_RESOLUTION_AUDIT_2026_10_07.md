# D02 + D04 Source-Resolution Audit

## Executive Conclusion

Completed source audit, baseline commit
`278c9c98527bcda4f3942f3b6b47e8e926a14ca0`, tree
`3ea3118c63594ace2bb134995b0b264695c88774`. This is an evidence snapshot,
not opening adoption, database import, runtime acceptance or Gate B closure.

The final matrix has 123 distinct rows: E D02 53, C D04 69, and one distinct
G interest-denominator conflict. G's overlapping authority rows are retained
as a supplement, not double-counted. Resolved rows: 49 (SOURCE 22, APPROVED_SPEC
21, APPROVED_DECISION 6). Remaining statuses: NEEDS_OWNER_DECISION 10,
IMPLEMENTATION_GAP 10, ABSENT 36, CONFLICT 5, PROPOSAL_ONLY 11,
MISSING_SOURCE_REFERENCE 2. Engineering flags 43 and Owner flags 34 are
overlapping/conditional row flags, not separate jobs or questions.

**Subsequent adoption:** the human later instructed `就此执行` with the actual
non-host decision document, SHA256
`57bfdec38a9a400991cb26362a99d33d7a81c8e6258c03460185e51501fb5ac5`.
Its actual receipt hash is
`2c06c4bd1157a2d245143190c4d17b0499b5d09f42159a414846d0f9bcb8d99e`.
It resolves named policy choices, not unknown numeric inputs. Historical
component findings and statuses below remain literal; they are not today's
pending Owner questions. The separate minimum-decision crosswalk records the
new adoption without rewriting these originals.

## Source Authority Register

| Evidence                                       | Identity and authority boundary                                                                                                                                                                           |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Constitution and seven Master/Office originals | `requirements/source_manifest.json`, original DOCX and extracted source units; governing specifications, not invented numeric approval                                                                    |
| Official 70-country selected source            | `status/world-data-selection.json`, package BALANCED_2026_09_28_V1, CHECKSUMS SHA88dd44478f97d2e8893a4f11b3aaf96e256bdb13248aca0d08f097fabe10d315; selection is not seed admission                        |
| E proposal                                     | Original SHA15383e28d523bad7ff4fdbe14e141c7a46f21072c9bd4a81faa5a5acc378c7cb; PROPOSAL_ONLY at audit baseline, subsequently only explicit subset adopted                                                  |
| E D02 report/matrix/authority                  | SHA3715e56724769042ab12df0d4a20e29c9859f380d330da69b1ef1c6de8ed2127 / 0d0a14bf17462a21353975a50d7b11bad5d5b25b52ada15ed6dc1447f7c713cb / eb5e562a1e3046db20affbecfb8939b0111d2844a428ef2dd00b361b161569f6 |
| C D04 report/matrix/authority                  | SHA6f32e81b73afa8d1e16519d9abc7f75ad8ab6f2d002461638ab97ea9201f715a / 108832fcdc113a18dd3c1288f44a4e2b7215be199e5343d7266a2ba613de91cc / efd5774da97cbf05e837e2220985a930989e4b287a6fe952317fd741da570ca4 |
| G authority register/audit/matrix              | SHAa22cbf381429c29180e412b3b9042b7224c3ac481732f929812ba9f7a6405bbf / f760666590bede879b2b3e42803406abce5c75c8414ae9c35f3fd8fd7ead19f6 / 2dee3bc25fe93009eb226007728a71869fe483f60f321ffddf646064b4fde4dc |
| Located B compatibility review                 | SHA3e0408cefe29bc782d7e7b382ccdecc0fb4d2c76c9b3e3a7716b5eddfc8db5a6; historical source-only approval, not economic adoption                                                                               |
| Root reference correction                      | O_SOURCE_REFERENCE_RESOLUTION_2026_10_07.md SHAb14b24630b54c53ff5e27fd6ed3649da49bbee12b4df6b31fdd630da7f6f3722; locates B and corrects actual Core paths, no historical finding erased                   |

Authority JSONs preserve each original path/blob/hash/location. Root fully read
the component reports and checked their recorded hashes. Missing referenced
manuals do not invalidate definitions explicitly present in the CB/Industry
body. No Internet material replaces an absent source.

## D02-A Reserve claim

### 1. Source facts

All 70 source R amounts exist; B/H/D/R/A/L/E have 490 lossless original numeric
tokens. Currency label is GCU_SCENARIO_ACCOUNTING_UNIT. No explicit per-country
R exception field exists.

### 2. Approved semantics

R is BANK's asset and CB's equal reserve-account liability, one claim. It is
not bank cash, government claim or CB backing cash.

### 3. Existing implementation behavior

Core FinancialAccount, paired claims, FinancialOpeningLeg and lossless mapping
already exist. Preparation/carrier code is not posted authoritative accounts.

### 4. Gaps

Actual adopted claim, legal holder/account/counterpart, denomination and opening
binding were missing at baseline. A correct type/amount does not supply them.

### 5. Classification

Known source/spec versus conditional adoption/implementation gap; not a new
choice of R's general asset type.

### 6. Exact evidence

CENTRAL_BANK U0152, U0125, U0171–U0172, U0295; MASTER U1417–U1420;
matrix D02 A rows and original finance SHA
`4f30d7dd43aa2190604d4fb73c776a8d4aaa263653dc783def6f7c2c5cc80805`.

### 7. Owner decision still required at baseline

Actual source-R adoption belonged to OD-D02. Subsequent Owner §3 adopted this
rule; numeric/source completeness remains separate.

### 8. Engineering work still required

Trusted actual record loading, exact denomination/counterpart materialization,
existing carrier and seed admission integration; no duplicate mapper.

## D02-B Central-bank assets

### 1. Source facts

The 10-category catalogue exists. Complete 70-country holdings/amounts/currencies
and counterparties for those categories are absent from the frozen source.

### 2. Approved semantics

FX cash/deposits, foreign securities, swaps, gold/other reserves, domestic
government securities, refinancing, ELA, monetary-financing claims, accrued
interest and other CB assets have specified meanings.

### 3. Existing implementation behavior

Account and claim factories can validate supplied positions; they cannot
create source-supported holdings from the source R value or public book value.

### 4. Gaps

Actual holdings register, legal owner, currency and counterparty; zero/empty
must be explicitly supported, not inferred from absent records.

### 5. Classification

ABSENT t0 values plus conditional adoption; not undefined asset vocabulary.

### 6. Exact evidence

CENTRAL_BANK U0112–U0121, matrix D02-B; raw publicDebt=0 and empty historical
claims/contracts are not evidence of a newly invented CB government claim.

### 7. Owner decision still required at baseline

OD-D02 complete actual manifest. Subsequent §3 adopts source-only assets and
negative once-only net worth, not unlisted assets or missing-as-zero.

### 8. Engineering work still required

Explicit 21-position manifest contract, per-country source gaps and fail-closed
complete-input validation; no Other Assets plug.

## D02-C Central-bank liabilities

### 1. Source facts

Seven liability categories exist. R and B provide source candidates for two
categories; complete adopted t0 positions were absent.

### 2. Approved semantics

Reserve accounts and Treasury Deposit are CB obligations, not backing assets;
currency circulation, bills/term deposits, swap payables, accrued interest and
other liabilities require their actual claim/amount basis.

### 3. Existing implementation behavior

Existing paired-account carrier supports lawful supply; it does not approve
holder identities or create unobserved liabilities.

### 4. Gaps

Source adoption and all remaining positions, currency/holders/claims. Unknown
is not zero, nor is an unused instrument automatically approved zero.

### 5. Classification

Source-known candidates versus ABSENT actual adopted manifest.

### 6. Exact evidence

CENTRAL_BANK U0124–U0130; FINANCE U0796; MASTER U1408; D02-C/E matrix rows.

### 7. Owner decision still required at baseline

OD-D01 B interpretation and OD-D02 actual claim adoption; subsequently §2/§3
choose full TGA and paired R, without filling the other missing positions.

### 8. Engineering work still required

Materialize one claim on each balance sheet, preserve LC/FX identity, prohibit
double-counted cash, validate each zero/not-applicable input independently.

## D02-D Equity, genesis and exactness

### 1. Source facts

Raw bank E is commercial-bank equity, not CB equity. Original L differs from
H+D in 56 countries; E differs from R+A−(H+D) in 62, maxima 0.00001/0.000017.

### 2. Approved semantics

Exact posted Assets=Liabilities+Equity; no epsilon. Complete once-only t0 CB
net worth now has explicit approval, but incomplete assets/liabilities do not.

### 3. Existing implementation behavior

Historical candidate checks had tolerance; existing exact carrier/admission
cannot adopt those diagnostics as replacement Money.

### 4. Gaps

Complete CB holdings/positions and truthful genesis provenance; source raw
tokens cannot be silently rounded or replaced.

### 5. Classification

CB t0 equity ABSENT; bank component-source conflict and historical tolerance
compatibility CONFLICT; higher-authority exact rule is already resolved.

### 6. Exact evidence

Constitution U0295–U0299; CB U0133–U0140/U0091–U0092/U0815;
E authority retains all 70 raw rows and exact comparisons. “62” is not 62
nonzero raw R+A−L−E identities. ADR-08 was PROPOSED_NOT_APPROVED at baseline.

### 7. Owner decision still required at baseline

Complete genesis and old bank-reconciliation decision. Current actual §3 and
§4.5 adopt once-only CB net worth and joint bank L/E; no running equity reset.

### 8. Engineering work still required

Opening-only derived L=H+D/E=R+A−L with raw source retained, negative CB net worth
allowed only after completeness, exact balanced legs and idempotent persistence.

## D02-E Treasury and CB funds model

### 1. Source facts

Only combined B exists; no separately sourced T/CB or approved split ratio.
Historical generation calls it Treasury base money/runway, not adopted accounts.

### 2. Approved semantics

Finance owns its account at CB; CB settles it and cannot spend the fiscal budget.

### 3. Existing implementation behavior

Model alternatives and validators existed, with no selected model at baseline.

### 4. Gaps

Specific B opening adoption, matching currency/counterpart and exact legs.

### 5. Classification

D01 NEEDS_OWNER_DECISION at baseline; candidate alternatives not approval.

### 6. Exact evidence

FINANCE U0796; CB U0480/U0487–U0489; source build.py line222 and complete.py
lines78–84; D02-E matrix.

### 7. Owner decision still required at baseline

OD-D01; subsequently actual §2 selects full Treasury Deposit at CB and rejects
separate T+C pools. Do not ask again or treat total B as duplicate free cash.

### 8. Engineering work still required

Consume actual policy and source denomination, replace incompatible preparation
assumptions narrowly, never duplicate B or invent backing.

## D02-F Cross-domain adoption and source references

### 1. Source facts

Proposal, source selection, Constitution and actual code are distinct sources;
CB U0006 references an unidentified Existing World Simulation Player Manual.

### 2. Approved semantics

Approval is content/version/scope-bound. A type, draft, fixture or hash is not a
human economic approval, actual user seat or formal World admission.

### 3. Existing implementation behavior

Preparation may use empty trusted registries and fail closed; no actual source
record loader was certified by this audit.

### 4. Gaps

Trusted record loading, official World binding and exact manual identity.
Local 12-country manual candidate is not proven the 70-country CB reference.

### 5. Classification

IMPLEMENTATION_GAP and MISSING_SOURCE_REFERENCE, not a new definition of R.

### 6. Exact evidence

AGENTS/Constitution, source indexes and E D02-F. Root local manual candidate
SHAadf055a93e917c4edb4b3c5e0d4a048aee8bc41123165d9fcde2462148b7f093;
title/version relation is unproven. Correct actual resource and labour Core
paths are recorded in Root's reference addendum.

### 7. Owner decision still required at baseline

Existing content-specific cross-dependencies; no new blanket approval request.
Old “D06 bank reconciliation” maps to current D03 §4.5, not identity D06.

### 8. Engineering work still required

Use portable actual human record, reject client/test substitutes, preserve
source/version evidence, and continue independent narrow implementation review.

## D04 historical domain findings

The following six domain sections reproduce C's completed fixed-baseline
findings without changing their historical decision statuses. Later actual
Owner §5 adoption is separately recorded above and in the minimum crosswalk.

# D04-A Facilities

## 1. Source facts

1374 records=1024 OPENING_PORTFOLIO+350 DEVELOPMENT_OPTION；全1374 runtimeOperational=false、UNAPPROVED_SCENARIO_ASSET。1024 constructionStatusProposal=OPENING_EXISTING_ASSET，350=UNBUILT_OPTION。Aggregate facility群不等于单体已验收厂房。ownerId/operatorId、recipe、设备数、技能/人力、维护、电/水需求、licenseIdProposal等候选字段存在，缺值保持原样；requirements不证明availability。

## 2. Approved semantics

Constitution original p379–386：项目批准不增capacity，必须融资/材料/劳动/技术/施工/commissioning，社会实体设施遵守统一Project。p392–403要求真实input/energy/labour/logistics瓶颈。MASTER-U1182/U1189/U1232要求physical completion/testing、mandatory milestones/commissioning，commission后才增operating capacity。ADR02/05要求唯一owner和title/risk/位置分列。

EXISTS / BUILT / COMMISSIONED / OPERATIONAL 必须分开；源字段只给候选 existing/unbuilt，不证明每一步已完成。

## 3. Existing implementation behavior

V13ProductionCapacity与ProductionInput消费有lineage的operational capacity、duration/utilisation/productivity、materials/energy/labour/logistics facts。V14ProjectLifecycleInput消费approval/funding/materials/labour/technology/oversight/commissioning，结果为facilityHandoff proposal，不自己造设施。OpeningSeed:113–122只有inventoryEntries/financialBatches，没有设施authority carrier。

## 4. Gaps

无具体t=0 asset/legal-holder/commission/operational采用记录；许可/技术提案不生效；设备/输入/员工/水电需求不证明现存可用。book/replacement value与daily budget不证明已付成本/现金。

## 5. Classification

A01–A12：resolved7、proposal3、implementation gap1、owner1。估值用途由source明确（assetFunding=GENESIS_PUBLIC_CAPITAL_EQUITY_NOT_NEW_CASH；priceAuthority=BALANCE_REFERENCE_ONLY），不允许当new cash/CB backing，也不据此批准公共资本genesis。

## 6. Exact evidence

FACILITY#/*/scenarioRole,runtimeOperational,constructionStatusProposal；ENTITY#/0/bindingMode,realTeamBinding；LICENCE#/0/status=PROPOSED_NOT_GRANTED；TECH#/0/status=OPENING_LICENSE_PROPOSAL_NOT_GRANTED。MASTER原件w:p2262/3557与Constitution w:p379–403。源码ENERGY:388–427、PROJECT:300–321/425+。每个file的固定hash见register和矩阵A01–A12。

## 7. Owner decision still required

仅OD-C01：决定是否采用明确的既有资产genesis及有效权利/commission manifest；不重新定义Project chain，不自动把350开发选项投产。矿床有效开发/许可依赖共用此采用题，不再重复一道矿产模型题。

## 8. Engineering work still required

按唯一资产ID/typed引用接入实际facts、独立批准载入、state/Writer/Replay；验证input库存/设备/staff/utility/permit/tech关联，不重建mapper，不复制资产或伪造审批。

# D04-B Minerals

## 1. Source facts

240 deposits：id/country/commodity/unit、initialGeological/cumulativeExtracted/remainingGeological、三层Remaining、capacity/road/grid/visibility/uncertainty等。240/240原lexemes Decimal满足initial=remaining+cumulative；三层数量均有developed≤recoverable≤discovered≤remaining。全runtimeExtractionPerDay=0，developedReserveInterpretation=CONDITIONAL_ON_OPENING_FACILITY_AND_LICENSE_ADOPTION。106记录有openingExtractionPlan；计划不是已抽取。

## 2. Approved semantics

INDUSTRY-U0133–U0139定义总地质/发现/经济可采/有效开发/已抽取库存。U0182明确recoverable=discovered×recovery rate；Developed Reserve要求有效设施/许可/设备/劳动/基础设施。正式层级语义不是五项可直接相加的总量。矿藏不增；勘探只能揭示hidden pool；技术只影响recovery而不造矿；实际extract消耗developed/remaining并增加inventory。

## 3. Existing implementation behavior

ResourceLayers:23–29及assertResourceConservation:78–97明确五个**互斥**storage pools须sum=endowment；resource-inventory/foundation.ts:343的createResourcePoolState要求resourceId/endowment/pools/originRef。生命周期只逐层前进并检查来源量。它不是直接接受三项累积口径字段的批准器。

## 4. Gaps

尚无明确获批的source→exclusive-pools转换记录/authority adapter；不得三层原值直接相加或以historicalConsumed代cumulativeExtracted。formal semantic+source exact invariant给工程明确约束，需写出nested projection/exclusive storage对应与exact证明、保留原值后评审；本轮不转换、不输出采用值。

矿床层实际title/授予/运营开发事实未由countryId或facility/deposit候选链接提供。stocks另有840记录，material reconciliation另有6项；不能从remaining geology直接生成开局inventory。

## 5. Classification

B01–B10：resolved6、absent1、implementation gap2、conflict1、独立Owner0。矿产操作采用归OD-C01；互斥表示缺口为工程规范/适配，不让Owner重新猜nested与exclusive。

## 6. Exact evidence

INDUSTRY-U0133–U0139/U0179–U0183，original w:p188–200/285；MASTER-U0782–U0803。MINERAL#/*/runtimeExtractionPerDay,developedReserveInterpretation；STOCK#/0/origin；RECON#/0/cumulativeExtraction,openingStockRawEquivalent,historicalConsumed,basis。RESOURCE:343、POOLS:78–97。矩阵B01–B10固定hash/位置分列。

## 7. Owner decision still required

没有额外“矿产层级选择”。具体有效开局矿权/许可/设施属OD-C01；库存title/risk与stock provenance采用交Root同既有D03合并，C不代决或关闭D03。

## 8. Engineering work still required

合法且可评审的exact representation adapter、资源/库存单一owner与cross-reference检查、actual extraction events/守恒/replay carrier。stock origin与历史raw-equivalent叙述须作窄provenance reconciliation，不改变原标签/数量、不重新扣地质资源。

# D04-C Water

## 1. Source facts

122 allocation：country/region/basin、domestic/agriculture/industry/allocated/available/remaining/drySeasonAvailable M3/day。全rightsStatus=ALLOCATION_PROPOSAL_NOT_GRANTED。seasonal122记录有12项monthlyRunoffM3Proposal、ecologicalReserveShare=0.65及rain-proportional limitation。geography另有71 basins的feature、regions/countries、annual inflow/environmental flow、allocatable daily量及lakeStorageM3，明确简化catchment/non-topographic limitation；不能误报全无水文source。

## 2. Approved semantics

源选择决策明确proposal不是已授予权利/执行供水。ADR03只规定360日年/SimTime/pause，不确定month boundaries、30天/月、闰月、runoff-volume到daily supply换算。选读固定正式specs未找到具体water grant/transfer/rationing规则；Deepwater Port不是水权规范。

## 3. Existing implementation behavior

packages/core/src窄检索仅找到causal-channels.ts:1898 “Water allocation as an economic constraint”标签，没有water-right grant/operating-state构造器。量化节点/因果channel不构成授予或供水。OpeningSeed无水域字段。

## 4. Gaps

allocation没有actual grantor/holder/有效期/每户entitlement。basinId可链接水文估计，却不证明已建水库/供水设施、管网、可用库水或真实供水事实。transferability/短缺分配缺正式采用；月份转换也缺specific approved source。

同region social waterDomesticM3Day与allocation domesticM3Day在104/122记录有exact差异，禁止epsilon/静默rounding。

## 5. Classification

C01–C12：resolved3、proposal2、absent3、implementation gap1、owner2、conflict1。grant/carrier/month规则拆开；没有把“缺rights constructor”变成所有水务政策都待Owner。

## 6. Exact evidence

WATER#/_/rightsStatus，SEASONAL#/_/monthlyRunoffM3Proposal,seasonalBasis；GEOGRAPHY#/basins/0与lakeStorageM3/limitation；ADR03 Approved resolution。第一差异：SERVICE#/0/waterDomesticM3Day=`19049847.736111`；WATER#/0/domesticM3Day=`19049847.736111112`。BUILD:191与COMPLETE:91解释rounded/unrounded生成历史，只是code trace，不是批准precision选择。

## 7. Owner decision still required

OD-C02决定是否实际授予一份明确水权manifest；OD-C03只在采用12月供给时确定实际月界/换算。若仍保持候选，不为了读源引入水权市场/transfer或月长默认。

## 8. Engineering work still required

已知区域/basin引用沿用原mapper；补rights/state/source-facility/真实供水carrier与exact quota/time执行。精度alias报告/拒绝不一致与权限事实载入属工程；真正缺的grant/时间规则不自选。

# D04-D Electricity

## 1. Source facts

70国均CANDIDATE_NOT_ENERGIZED、hourlyDispatchValidated=false。solar/wind MW/CF、average demand/delivered、loss、storageMWh/dischargeMW/efficiency/SOC/cross-border列表已给。SOC=1的70条**都有storage capacity源值**；不能说capacity absent，也不能说actual backed charge已存在。loss0.06、storage efficiency0.9/48小时是候选假设。

## 2. Approved semantics

MASTER-U0838–U0882定义plant available capacity、storage MW/MWh/SOC/efficiency、grid、demand/allocation，Generation/DeliveredSupply/ReserveMargin/FuelBurn，燃料/grid/storage空满约束和已建interconnector/contract。INDUSTRY-U0329给固定priority对象及Industry可设置优先，但不能增总供给；规范不等于当前70国已选择的dispatch sequence。

## 3. Existing implementation behavior

V13EnergyAllocationInput:152–159消费fuel/generation/grid/allocationPlan FoundationFacts；generation要求availableCapacity/CF/hours/fuel-rate/efficiency，fuel来自read-only V12库存；priority caller-owned。计算不创建plant/grid/storage authority state，不自行采用source CF/loss/default dispatch。

## 4. Gaps

实际commission/grid availability、已充储能MWh与来源、燃料stock/heat-rate/tech事实、首段SimTime interval、peakDemand/dispatch inputs未被候选平均量/SOC证明。reserve margin不能把averageDemand冒充PeakDemand。独立storage operating state与authoritative source adapter仍缺。

## 5. Classification

D01–D11：resolved5、proposal2、absent2、implementation gap1、owner1。capacity源存在已resolved；实际stored energy/backing adopted absent，不能相乘后当已充电ledger。source平均供需不是hourly test evidence。

## 6. Exact evidence

POWER#/*/status,hourlyDispatchValidated,storageMWh,storageDischargeMW,openingStateOfChargeFraction；MASTER-U0862–U0882、original w:p1604–1613；INDUSTRY original w:p579。ENERGY:119–159/195+与V13–14 acceptance排除dispatch formula selection。见D01–D11逐条hash。

## 7. Owner decision still required

OD-C04：是否采用具体已投运、有实际储能背书的电力开局manifest。普通公式/约束无需重新Owner定义；真实未来dispatch动作输入不逐次升级成新宏观规则。

## 8. Engineering work still required

使用既有Energy/V12 inventory/Project interfaces，按实际plant/storage/grid/inventory/time事实接入energy state、可用性/放电/charge、优先分配和Writer/Replay。source label与negative status保持；不从power.json直接energize。

# D04-E Employment

## 1. Source facts

70国interpretation=Candidate allocated posts; not runtime jobs。employed/unemployed/sector/educationAndHealth/power/logistics/otherDomesticServices是候选配置。区域teachers/medicalWorkers为两套现存分项；70国exact sum均等于educationAndHealth。第一国教师771012+医护369274=1140286，不需要新50/50。

## 2. Approved semantics

MASTER-U0375–U0398：LabourForce=Employed+UnemployedSearching；skill/location/wage匹配真实岗位，public hiring受budget/approved positions，缺worker不可造人。ADR02唯一labour owner，social/facility引用共享事实；规范不由source employed自动造actual contracts。

## 3. Existing implementation behavior

正确路径是packages/core/src/labour/labour-engine.ts，不是engine-kernels/labour子路径。LabourEngineState:64含aggregates/positions/wageAssertions/appliedFactBindings；applyLabourFacts:1314接受显式fact，不derive participation/matching/wages/population timing/money/public budget。已有接口，不等于selected jobs已运行。

## 4. Gaps

具体雇主、position、region×skill×status actual人数、工资/budget/payroll funding、初始聘用/contract facts缺采用证据。现存facility labourBySkill或社会区域目标不能自动扩成全部country-sector actual分配；dailyLabourIncomeReference不是逐job工资/已付资金。

## 5. Classification

E01–E09：resolved5、absent2、implementation gap1、owner1。已有教育/医护候选拆分resolved；专业/医疗staff-type技能结构与真实合同仍未解决，不能从“教师+医护已分开”外推全部实际劳务。

## 6. Exact evidence

JOBS#/_/interpretation，JOBS#/0/educationAndHealth，SERVICE#/_/countryId,teachers,medicalWorkers；BUILD:216–219。COMPLETE:53–54把同region教师/医护作为PROJECT-31/35 requiredWorkers，FACILITY#/353/requiredWorkers、/354/requiredWorkers。LABOUR:40–69/1314+，MASTER-U0375–U0398。源分项数已exact对比，不执行生成器。

## 7. Owner decision still required

OD-C05：是否采用具体actual employment genesis及工资/payroll输入；不重复问已明确的部门/技能/匹配原则，不再问educationAndHealth默认如何50/50。

## 8. Engineering work still required

沿用候选分项/区域引用，统一人口、facility与public-service人员需求，检查不能重复占同人力池；load真实采用/岗位/facts到Labour engine和单一工资/资金链，补canonical carrier/replay，而非另造lossy mapper。

# D04-F Social Services

## 1. Source facts

122 records均OPENING_SOCIAL_ASSET_PROPOSAL，给population/households/housingUnits/schoolSeats/teachers/medicalWorkers/hospitalBeds/dailyMedicalVisits/waterDomestic reference。schools PROJECT-31、hospitals PROJECT-35、housing PROJECT-36各122区域portfolio capacity exact等于相应social capacity；它们是同一候选资产的重复视图，不是独立再造一次资产。

## 2. Approved semantics

SOCIAL-U0340–U0341限制enrollment；U0376/U0414–U0426医疗要实际Demand/Staff/Facility/Supply/Budget；U0562–U0579分total/habitable/occupied/vacant住房与rent/support。住房现金benefit不增加供给，新school/hospital/housing遵循统一Project。CAPACITY ≠ AVAILABLE CAPACITY ≠ OPERATING SERVICE ≠ ACTUAL DELIVERY；人口不是已入学/患者/已入住/已服务。

## 3. Existing implementation behavior

createSocialFoundationFact:213要求source/lineage/snapshot/time/predecessors；education:474要求applicant/capacity/cohort/course-duration/outcome，healthcare:746要求backlog/demand/staff/facility/supply/budget，housing:933要求habitable/occupied/demand/rent/subsidy/commission，safety:1151要求真实workforce/incidents/backlog/funding/time/authority。它们是NONPRODUCTION pure foundation inputs/result，不构成已运行服务。

## 4. Gaps

actual operating owner/title/permit/maintenance-paid/utilities采用不能由设施候选字段证明；initial student cohorts/programmes/duration、health demand/queues/patients/occupied beds、housing habitability/occupancy/rent/subsidy以及safety events不在122记录。不能人口乘比例造实际服务，也不能为欠缺历史静默填零。

## 5. Classification

F01–F12：resolved4、proposal1、absent5、implementation gap1、owner1。普通服务瓶颈/住房cash-vs-real-supply已解决；欠缺service-state是具体initial inputs，不等于需要Owner重写education/health/housing全部规则。

## 6. Exact evidence

SERVICE#/*/sourceStatus,capacity/person fields；FACILITY#/352 PROJECT-36、/353 PROJECT-31、/354 PROJECT-35；regional exact checks122/122各组。SOCIAL-U0340/U0341/U0376/U0426/U0562–U0579，original w:p576–578/647/1013+。SOCIAL_CORE:358–397/693–728/879–918及各calculator；V15–16 acceptance排除social/rent/subsidy formula采用。

## 7. Owner decision still required

仅OD-C06的实际t=0 service-state采用。资产、人力、水权、energization统一引用OD-C01/02/04/05，避免再给Owner重复同一经济事实；未发生future事件不需伪造“历史安全事件”。

## 8. Engineering work still required

按原asset-ID/region-ID建立facilities-social capacity引用而非新资产；绑定真实staff/input/utility与service-state事实、后续事件/delivery/queue/occupancy/replay。统一人员分配与服务统计，不直接用人口更新actual delivered值。

## Cross-Domain Conflicts

1. Source component L/E tails versus exact admission: 56/62 component
   comparisons, with originals retained. Subsequent D03 §4.5 approves only
   opening joint reconciliation, not raw rewriting or running equity repair.
2. Historical checker tolerance versus authoritative exact ledger: preserve
   both versions, apply higher-authority exactness, no new epsilon choice.
3. Nested mineral source versus exclusive Core buckets: source arithmetic is
   valid for all 240 deposits. The projection is an engineering adapter, not a
   reason to count nested remaining values multiple times; cumulative extracted
   is not initial inventory. Operational unit/ownership gaps remain distinct.
4. Domestic-water aliases disagree for 104/122 records, for example
   `19049847.736111` versus `19049847.736111112`. Rounded/unrounded code origin
   explains the conflict but does not approve silent rounding or duplicate use.
5. Mineral stock genesis label versus historical-allocation wording is a
   provenance tension, not proof of resource creation or authority to re-deduct
   geological extracted amounts.
6. CB annual interest `/365` versus simulation calendar `/360`: G-X06 distinct
   conflict at baseline. Actual new Owner §7 explicitly selects interest 360;
   calendar ADR alone previously did not prove the interest denominator.

These are issue groupings, not six CONFLICT-status rows: the final matrix
retains its literal five CONFLICT rows; mineral Core projection is separately
classified as engineering/spec-resolution where appropriate.

## Final Owner Decision Minimum Set

See `OWNER_MINIMUM_DECISIONS_AFTER_D02_D04_AUDIT_2026_10_07.md`. Nine minimum
historical bundles, not 34 separate questions. The actual later human document
now adopts the named principles/subsets and is explicitly cross-walked. D05
host/production activation remains excluded. Complete CB holdings, LC/FX and
formal World identity are not fabricated by this adoption.

## Engineering-Only Remaining Work

Use existing factories and carriers for trusted-source financial admission,
exact one-claim B/R counterparts, adopted opening-only L/E reconciliation,
exclusive mineral projection, capacity/facility ownership, constrained water
calendar/allocation, power/fuel/grid/storage, lawful jobs/skills/population and
capacity-not-actual social services. These are approved-rule implementations
only where actual required inputs exist. Conditional flags are not permission
to invent missing source data, coefficients, initial jobs or patients.

Load actual independent Owner records from pinned originals, not fixtures,
client-provided approval/hash/type or blanket proposal adoption. Keep namespace,
entity/Office, unit and source lineage consistent from seed to durable head,
ledger, command/receipt and authorized projection. Implementation candidates
still need scoped automated evidence and independent P0 review.

## Blocking Assessment

At the audit baseline, source selection/spec definitions did not complete
opening adoption or full authoritative economic runtime. Missing CB manifest,
currency/World binding and adopted domain inputs blocked their dependent steps,
not all existing read-only/source code. At subsequent implementation time,
decision policy is adopted but actual materialization/admission/readback must
be demonstrated separately. No formal Gate state is changed by this report.

Two exact source references remain missing: CB's referenced manual identity,
and geosource Handbook CNv1.1 PDF
`befe98dbe34531a40019104712c3b185ab14be33b944553a85a53268e8b8cb40`.
The local 12-country manual is not silently substituted. Teachers and medical
workers are already separately supplied (70/70); no invented 50/50 split.

## Verification and delivery

The matrix contains 123 unique IDs and populated evidence/status fields;
component counts match the final classification. Each original component and
Root reference correction is retained. Code/build/production/native-role
evidence is not claimed by the audit. Current subsequent source-record checks
matched all eight original DOCX hashes and Constitution/requirements equality;
they do not retroactively change the audit's evidence scope.

Deliverables: this report, the complete final matrix and minimum-decision
crosswalk. The source audit itself is complete. The separately authorized D02
IMPLEMENTATION is underway and is not substituted with this documentation.
