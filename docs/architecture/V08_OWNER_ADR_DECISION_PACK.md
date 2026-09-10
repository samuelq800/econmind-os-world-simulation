# V08 owner ADR decision pack

## Decision request and authority

The responsible human owner approved ADR-02 and ADR-05. Both are now
`APPROVED` in `status/decisions.json` and bound to their canonical records.
This pack records the decision boundary; it is not Codex self-approval.

The exact current sources are `status/decisions.json`,
`requirements/adr_dependency_map.json`,
`reference/02_规范冲突与裁决清单.md`,
`docs/architecture/WORLD_CORE_JIT_ADR_PACK.md`,
`docs/architecture/WORLD_CORE_OWNER_ADR_DECISION_PACK.md`,
`planning/work_packages.json`, `planning/r2_steps.json` and
`docs/planning/V06_V10_IMPLEMENTATION_SEQUENCE.md`.

## ADR-02

- **Subject:** 技能、库存、设施、存款和外债等逐字段唯一 owner.
- **Current status:** `APPROVED`; record:
  `docs/architecture/decisions/ADR-02.md`.
- **Exact proposal:** 为每个 canonical entity 固定唯一 owner 和 posting
  service；跨领域通过事件或命令交接，projection 不得回写。
- **Latest gate:** `V03/V08`; the V08 owner pack narrows the immediate safe
  point to before the V08.1 model/schema.
- **Affected work packages:** V01, V03, V05, V08, V11, V12, V13, V14, V15,
  V16, V17, V19, V20, V22 and V23. The first V08 step is V08.1.
- **Why V08.1 needs it:** inventory positions cannot be authoritative if Trade,
  Resource, Production, an Office, a projection and a posting service can each
  update synonymous balances.
- **Recommended option:** a World Inventory Posting service uniquely owns stock
  accounts/positions/postings; a World Financial Posting service uniquely owns
  settlement accounts/positions/postings. Other domains submit typed Commands,
  obligations or Events and cannot write either ledger. Projections never
  write back.
- **Alternatives:** per-Engine balance columns or duplicated Trade balances.
  Both create a second economic truth.
- **Consequences if approved:** typed cross-domain posting interfaces, one
  canonical position owner, enforceable import/write boundaries, and balanced
  batch handoffs. V08 owns posting facts; V09 later owns commit mechanics.
- **Reversibility/migration cost:** low before any V08 schema or economic fact;
  high after consumers or tables persist duplicate balances, because migration
  would require choosing a surviving authority, reconciling history, changing
  writers and rebuilding projections.
- **Approved now:** unique V08 Inventory Posting and Financial Posting owners,
  typed cross-domain handoff and no projection write-back. ADR-17's staged
  V08/V09 ownership remains separately binding.
- **Later ownership left open:** post-sprint owners for skills, facilities,
  deposits and foreign debt; domain-specific Commands and projection shapes.

## ADR-05

- **Subject:** 库存位置、在途、产权、风险及进出口确认时点.
- **Current status:** `APPROVED`; record:
  `docs/architecture/decisions/ADR-05.md`.
- **Exact proposal:** 分别记录 physical location、reservation、ownership、risk
  bearer 和 economic recognition；按批次守恒并冻结 title 与进出口确认时点。
- **Latest gate:** register says `V10`; the owner/JIT packs require the bucket
  model before V08.1 and the title/risk point no later than V10.1.
- **Affected work packages:** V01, V08, V10, V12, V21 and V22. The first V08
  step is V08.1.
- **Why V08.1 needs it:** AVAILABLE/RESERVED/IN_TRANSIT cannot safely encode
  ownership, custody, risk and national-account recognition as one implicit
  state. Dispatch must not make stock disappear or become buyer-available
  prematurely.
- **Recommended option:** keep physical location, reservation, title, risk and
  economic recognition as separate versioned fields. Use `AVAILABLE ->
RESERVED -> IN_TRANSIT -> DELIVERED/AVAILABLE`; reservation and dispatch
  conserve stock. For the minimal V10 proof, dispatch remains seller-owned
  in-transit custody and atomic delivery transfers title/risk, records X/M,
  makes buyer stock available and settles exact GCU.
- **Alternatives:** transfer title at dispatch or use configurable Incoterms.
  Both are legitimate future models but add contract/logistics semantics
  outside the minimal World Core proof.
- **Consequences if approved:** V08.1 can freeze separate fields and conserved
  bucket transitions without implementing Trade. V10 can later bind one narrow
  delivery transaction without redefining inventory history.
- **Reversibility/migration cost:** moderate before real transfers because the
  transition version can be replaced; high after title/risk/X/M facts exist,
  because changing the recognition point requires versioned migration and
  reconciliation rather than rewriting historical postings/Events.
- **Approved now:** separated location/reservation/title/risk/X-M/settlement
  facts, exactly conserved minimal bucket lifecycle, and delivery-time
  title/risk/X-M semantics for the future minimal V10 transaction version.
- **Later ownership left open:** full logistics, partial loss, configurable
  Incoterms, customs, insurance, macro recognition variants and contract-type
  policy beyond the minimal versioned proof.

## Related decisions that do not need a new owner answer now

- **ADR-17:** already `APPROVED`. V07 owns Command/Event/Replay, V08 owns
  Ledger/Posting, and V09 owns writer/lease/fencing/atomic commit/recovery.
- **ADR-16:** already `APPROVED` for `world_v2` and the sole V02 migration
  provenance/publication chain. It does not authorize production publication.
- **ADR-07:** remains proposed. The JIT pack explicitly defers ADR-06/07 as
  outside World Core; V08.1 excludes construction value-added, WIP/completion
  and GDP semantics.
- **ADR-08:** remains proposed and must be decided before an operation adds
  economic rounding, minor units, FX, CPI, tax, interest, demand or other
  formula policy. V08.1 inherits exact-or-reject and adds none of those rules.

## Recorded owner action

ADR-02 and ADR-05 are approved through their canonical records. V08.1 may use
them only after its full dependency/preflight recomputation passes. This does
not start V08, approve ADR-07/08, or authorize production publication.
