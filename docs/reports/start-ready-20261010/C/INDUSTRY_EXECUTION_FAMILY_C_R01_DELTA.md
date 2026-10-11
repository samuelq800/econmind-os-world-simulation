# Industry design delta — E C-R01 / P1

Date: 2026-10-11, Asia/Shanghai. Owner: C. Status: DESIGN_DELTA_REVIEW_PENDING.
This is a documentation-only correction to implementation partitioning. **T1 CODE NOT STARTED.**

## 1. Immutable input and precedence

- Parent candidate: `032ace57f911c4ccc2f66d9984dd3b33ba54236d`; tree `6ce3d33e26288957edcdea0c2c828bc676c91e57`.
- Original design: `docs/reports/start-ready-20261010/C/INDUSTRY_EXECUTION_FAMILY_DESIGN.md`; SHA-256 `4b9e0d824dd5c2277f6e18322ae66282b8ef441f7ad48a57fc18eb5cd8e06204`.
- E independent review: `/Users/samuel/.codex/state/plugins/codex-security/scans/c-industry-execution-design-20261010/artifacts-89906e23d4115420e6aec96649d9996b94534dadba5db45e72bf5c6291013131/artifacts/E_C_INDUSTRY_DESIGN_REVIEW/review.md`; SHA-256 `b13cf01220aa5c1370a93b45cf6dcf46e0ee749dc2788c9596250eac9e138c05`.
- E decision remains **CHANGES_REQUIRED**, C-R01/P1, until E's separate narrow re-review. C does not self-close it.
- Original design, review and intermediate failed reviewer-helper evidence remain untouched. The delta replaces only the old mixed I-READ/I-TIME dependencies and §6 inert-types-first/T1 gate; it does not erase the old report or change Industry economic semantics.
- Binding product operation remains INDUSTRY-U0261/U0283/U0947, one existing facility's utilisation target in [0%,100%]; U0280 continues to prohibit target→automatic output. No sector aggregation, production, commissioning, project, extraction, grant or economic formula is added.
- Existing Core Captain strict parser / pure Event preparation / replay is an engineering separation example, not an Industry implementation or a reusable Captain authority/state. Common command/Event/transition contracts are reused as contracts only.

This delta governs the revised work partition when read with the original design. Original production/maintenance/utilisation-denominator/settlement/valuation warnings and HOLDs remain. Original “test vectors cannot supply real production evidence” does not forbid clearly labeled UNIT_TEST_ONLY target-transition vectors.

## 2. Four acceptance points and corrected dependency gates

| E acceptance point                                                | Correction in this delta                                                                                                                                                                                                  |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Split TARGET_SOURCE and OPERATING_SOURCE                       | §2.1 assigns target identity/scope/genesis/head to target runtime only, and production facts to physical execution only. Neither is needed as live external data to author the pure T1 module.                            |
| 2. Split manual-target time compatibility and production interval | §2.2 separates TIME_TARGET from TIME_PRODUCTION. Pure target preparation has an explicit supported equal-time control and cross-time refusal; no production scheduler decision blocks it.                                 |
| 3. Meaningful first packet, not inert types-only                  | §3 freezes a proposed T1 strict parser, positive target-only Event preparation, deterministic replay, no-change behavior and positive/negative test contract. No accepted-family/SQL/runtime registration accompanies it. |
| 4. Runtime registration still gated                               | §4 requires actual TARGET_SOURCE/current authority/server clock/cutoff and independent review for T2; missing source remains refusal. Unit fixtures are never admitted World facts.                                       |

### 2.1 TARGET_SOURCE versus OPERATING_SOURCE

**TARGET_SOURCE** replaces the target part of I-READ:

- Same World/country, stable existing facility identity and evidence that this object falls within the allowed target-operation scope.
- Explicitly established previous target (canonical ratio), its admitted genesis or latest target Event predecessor, and complete source/head lineage at the current WorldVersion/global Event sequence.
- Actual owner/storage/read provenance for the target record and object-scope evidence. No browser snapshot, READY boolean, prototype label, built/adopted flag or invented default target=0 can supply it.
- This is a real-data prerequisite for **T2 runtime admission/commit**, not for designing or testing pure T1 behavior with explicit UNIT_TEST_ONLY inputs.
- built/adopted does not imply commissioned/operating. Conversely, the design does not invent a rule that every uncommissioned/unbuilt facility may accept a live target. T2's real reader must prove the permitted object scope; absent evidence refuses.

**OPERATING_SOURCE** replaces the physical-production part of I-READ:

- Actual commissioned/operating facility status, title/risk/operator, permission, technology rights, recipe coefficients, staffing, maintenance application/payment, inputs, delivered energy/water/logistics and production cost/funding lineage.
- Together with I-SEM/I-SETTLE, these gate later physical production/consumption/settlement, not target-only parser/Event/replay engineering or the target intent's data shape.
- A valid target record with missing fuel/maintenance funding can support a pure target transition test and, once T2's independent target/authority/time gates are satisfied, a target-only runtime decision. It cannot support a production settlement or a physical-success display.
- Neither target nor operating source is established by this delta. No gap is filled with a positive Boolean, synthetic commissioning or a production quantity.

### 2.2 TIME_TARGET versus TIME_PRODUCTION

**TIME_TARGET** replaces the manual-target part of I-TIME: existing server-owned command time, preparation/current commit observation time, Event/receipt time, source snapshot tick and current head must be modeled explicitly. T1 may consume supplied data for deterministic validation; it issues no clock or time authority.

At this pinned base the common projection/replay path expects command/Event/receipt SimTime equality. The initial T1 contract supports an explicit same-tick preparation: supplied source snapshot tick and proposed Event/commit SimTime equal the unchanged canonical Command SimTime. Real-time recording/submission audit timestamps remain separate fields. A cross-tick request returns a proposed pure `TIME_TARGET_NOT_SUPPORTED` refusal until the responsible owner's reviewed compatibility contract is consumed. Do not rewrite/refingerprint Command SimTime, backdate a runtime commit to make equality pass, construct a new clock, or claim other owners' time fixes are approved.

This narrow supported/refused matrix is enough to implement and test T1. Real T2 binding must use the then-current independently reviewed clock/command/Event/receipt/cutoff contract; equality-only tests do not establish a live server clock.

**TIME_PRODUCTION** replaces the production part of I-TIME: actual production duration/unit basis, target-to-run effective policy, interval/due command family and automatic scheduling. It remains a later physical-run owner decision/dependency. It is **not** a prerequisite for pure target conversion and cannot be used to defer T1. This round performs no World Clock work or activation.

## 3. T1 — meaningful pure target transition (future separately assigned work)

### 3.1 Ownership and proposed serialization freeze

Future exclusive T1 files:

- `packages/core/src/commands/industry-utilisation-target.ts`
- `tests/world-core/industry-utilisation-target.test.ts`

Any necessary shared Core export is a separately coordinated file change, not implicitly owned by T1. No browser DTO accepted-family union, API intake, Worker composition/consumer, SQL, grant or runtime export/registration is in T1.

The following names and schemas are **proposed local serialization decisions frozen for E's re-review**, not new economics, an already accepted public family, or authorization to write code:

| Contract             | Proposed fixed value / exact fields                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Command type         | `CORE_INDUSTRY_UTILISATION_TARGET_V1`, office `INDUSTRY`; reuse the existing `command-v1` common envelope, non-null expectedWorldVersion and existing integrity/fingerprint validation.                                                                                                                                                                                                                                                                                              |
| Payload schema       | `industry-utilisation-target-v1`; exactly `schemaVersion, facilityRef, targetUtilisation`.                                                                                                                                                                                                                                                                                                                                                                                           |
| Ratio                | Exactly `amount, unit`; amount is a canonical decimal string in [0,1], unit is `ratio`. No JavaScript number, percent alias, negative zero, leading/trailing decimal alias or automatic coercion.                                                                                                                                                                                                                                                                                    |
| Event type           | `INDUSTRY_UTILISATION_TARGET_CHANGED_V1`, common existing Event envelope with command causation/correlation/World binding, current head version +1 and next global sequence for this one-Event transition.                                                                                                                                                                                                                                                                           |
| Event payload schema | `industry-utilisation-target-event-v1`; exactly `schemaVersion, command, commandFingerprint, source, beforeTarget, afterTarget, preparationHash`. The embedded command uses the existing canonical command serialization.                                                                                                                                                                                                                                                            |
| Source data schema   | `industry-utilisation-target-source-v1`; exactly `schemaVersion, worldId, countryId, facilityRef, targetScopeRef, head, targetFact`. `head`: exactly `worldVersion,lastEventSequence,trace`, using existing FoundationTraceRequest binding. `targetFact`: existing FoundationFact wrapper; payload exactly `facilityRef,targetUtilisation,targetPredecessorRef`. All identity/snapshot/time/hash/predecessor/canonical-payload bindings are checked, not trusted from strings alone. |
| Preparation result   | `UNCOMMITTED_TARGET_EVENT_PREPARATION` with checked Event and target-after data, or the pure no-change result below. Neither is an authority proof, committed receipt, registered source or persisted fact.                                                                                                                                                                                                                                                                          |

Stable facility/scope/predecessor references use the existing Core stable-reference domain, not client labels. Source `targetPredecessorRef` must resolve to an explicit target genesis or the previous target Event in supplied replay lineage; missing/null/invented genesis rejects. `targetScopeRef` binds the same World/country/facility target-operation scope data, but the pure module cannot authenticate its owner or grant permission. T2 must resolve that real provenance.

Unknown fields reject, including actualOutput, capacity, recipe, price, READY, authority/approval booleans, caller clock and operating inputs in the payload. Existing server-owned Command SimTime in the common envelope is not a browser-controlled clock field; this distinction must be tested.

### 3.2 Positive preparation and no-change behavior

A pure prepare function validates the canonical Industry command and explicit source predecessor, checks facility/World/country/head/snapshot/time/canonical payload/hash consistency and compares the requested ratio to the source's established old ratio.

- Changed valid target: compute **afterTarget = the checked requested ratio**; beforeTarget is the checked source ratio. Produce a deterministic target-only Event preparation and canonical preparation hash. No production kernel, capacity/duration/productivity calculation, Inventory/Financial Posting, permission, wage, GDP, authority proof, clock or database effect.
- Same target, new intent: return pure `NO_CHANGE` with unchanged target/head and no Event or physical effect. Do not create a fake target-changed Event, consume an Event sequence or advance WorldVersion.
- No-change is not a committed zero-effect receipt or durable identity claim. T2 must separately review its existing receipt/refusal mapping before runtime registration; this does not block the pure T1 result.
- Missing old target/genesis/predecessor, mismatched scope/head/hash/time or noncanonical input refuses; no fallback to 0, UI state or a “latest” unrelated facility.
- Supplied UNIT_TEST_ONLY source records allow meaningful positive preparation without asserting real source admission. The exact same source contract must reject missing facts; a test's status string cannot enable product intake.

### 3.3 Deterministic replay and shared global stream

T1 replay recomputes the Event from its embedded command and source data, compares the complete canonical payload/fingerprint, and changes only the checked facility's target. The target predecessor and **global head cursor are separate**: another family can advance the World head without changing that facility's last target Event.

- Track applied command ID/fingerprint and Event ID/fingerprint. An exact duplicate returns the identical current replay state with no second target effect/head movement; same identity with different fingerprint or crossed command/Event identity refuses.
- A new Industry Event must match the state's current global WorldVersion/sequence, explicit target predecessor and beforeTarget; gaps, reordered/missing global transitions, wrong source/World/country/facility and altered before/hash/sequence refuse.
- Do not assume Industry Events occupy adjacent global sequences. The surrounding existing global replayer owns the complete ordered World transition stream and validates each other family's semantics. A small pure T1 head-advance seam may consume those checked foreign transitions; it independently checks common envelope integrity, same World, version continuity and every global sequence, then advances only its cursor.
- Foreign transitions are not validated economically by T1 and are not authorized by a caller “validated=true” flag. If the existing outer replayer cannot supply an identified, checked non-target transition, or an unknown transition could alter target/object scope, return NOT_SUPPORTED rather than silently skipping it.
- One other-family transition may contain multiple Events: advance WorldVersion once per validated transition and Event sequence to its actual last Event, not WorldVersion=sequence or a presumed +1 foreign Event count.
- Required test path: target change → an existing known non-target family transition validated by its owner replay → next target change. The second target binds the advanced global head while retaining the earlier target Event predecessor. An omitted foreign transition must fail; this seam creates no second World truth or general replacement replay engine.

The pure apply/replay state is derived calculation data. It is not a new authoritative facility store. Durable command idempotency and actual global lineage remain existing Worker/Core responsibilities when T2 is separately admitted.

### 3.4 Future focused acceptance — not run in this design round

T1's first code packet must actually run positive/negative tests and strict checks; it is **not restricted to inert types/refusal-only tests**:

- UNIT_TEST_ONLY canonical ratios `"0"`, `"1"` and non-boundary `"0.5"`: explicit existing before→after changes, deterministic Event payload/hash and replay. The non-boundary value is a controlled test vector within the normative range, not a real World number, assumed opening target or economic parameter.
- Same-target NO_CHANGE; exact duplicate replay; same ID/different fingerprint; wrong office/World/country/facility/scope/source/head/sequence/before; missing old target/genesis/predecessor; changed canonical payload/hash.
- Number/wrong unit/out-of-range/noncanonical ratio/extra payload fields refuse; same-tick control passes and distinct command/current tick explicitly refuses without rewriting the Command.
- Shared global stream positive/gap/reordering/multi-Event foreign-transition controls as above.
- No physical effects: no generated Inventory/Financial Posting, no output/capacity/funding/authority proof, no economic kernel or SQL/network/clock dependency, no product accepted family/route registration.
- Actual focused test output, strict build/typecheck, bounded lint and format evidence, with immutable SHA/tree and independent review. These future checks are NOT_RUN here.

T1 schema/engineering review and Root's explicit file ownership assignment, not external production data, gate starting T1 code. **This documentation task does not make that assignment or start T1.**

## 4. T2/T3 and physical-run gates — corrected partition

| Packet                                    | Prerequisites / owned responsibility                                                                                                                                                                                                                                                                                                   | Not inferred from its success                                                                                                                 |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| T1 pure parser/preparation/replay         | Reviewed technical contract, explicit assignment, UNIT_TEST_ONLY positive/negative source data and focused evidence. Live TARGET_SOURCE, OPERATING_SOURCE and production interval are not required to author/test it.                                                                                                                  | No source admission, current grant, runtime registration, actual commit, physical output or playability.                                      |
| T2 target-only reader/candidate/transport | T1 fixed contract; actual TARGET_SOURCE owner/storage/target genesis/object scope/exact-head lineage; actual current Industry authorization; bound server clock and TIME_TARGET/receipt/cutoff compatibility; reviewed no-change runtime disposition; independent immutable implementation review. Missing source defaults to refusal. | No operating/commissioning promotion, positive source from fixture, production interval/settlement admission, SQL/grant/activation authority. |
| T3 target result view                     | Validated target Event/receipt plus actual disclosure/entitlement and exact-head publication; target before/after labeled “目标已修改，未产生实际产量”; installed DOM clears on authorization/view loss.                                                                                                                               | No inventory/finance visibility widening or physical-success fields from saved target/Event counts.                                           |
| Later physical execution                  | OPERATING_SOURCE + I-SEM + TIME_PRODUCTION + I-SETTLE and original single-writer/atomic settlement gates; I-ACCOUNTS before any GDP claim.                                                                                                                                                                                             | No silent maintenance=1, altered utilisation denominator, free inputs/funding or removal of production persistence/replay refusal.            |

An empty inventory/financial posting array for a target-only candidate is not the rejected production schema. Therefore the existing production gate is **not** a reason to postpone pure T1. Both production persistence and durable replay refusals remain unchanged and cannot be bypassed to run physical production.

Actual runtime registration still needs the T2 gates and independent review, even if local T1/T2 fixtures pass. Root may separately sequence isolated World Clock validation after pending review changes; this C delta neither constructs/enables that clock nor starts a formal World.

## 5. Evidence, freeze and stop

This round changes only newly added C Markdown design/freeze documents. Old design, original specs, economic kernels, Core code, public contracts, API/Worker/SQL, grants, configuration, migration/status, E report and other owners' files remain unchanged.

Performed: fixed parent/head/tree and original-design/review SHA checks; bounded existing parser/Event/replay source reading; Markdown formatting/check; exact-range diff checks and changed-path verification. Final commit/tree/diff/document hashes are recorded in the separate freeze note and final handoff; no self-referential hash claim.

NOT_RUN: T1 or other implementation tests/typecheck/lint/build, native PG, HTTP/database/permission/production checks, source/authority registration, SQL/grants, World Clock construction/advancement, consumer enablement, real opening, full/420/CI/deployment/activation/push/merge. Future tests are not PASS. E's prior negative review and intermediate helper failures are preserved; no review is self-awarded.

Stop: deliver the immutable documentation delta to Root for **original reviewer E's narrow re-review**. No peer message is issued here; no automatic continuation to T1 or World Clock.
