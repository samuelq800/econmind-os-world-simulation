# GOV01: one future budget line, not a reconstructed government register

Status: PROPOSED / BLOCKED_FOR_DEPENDENT_IMPLEMENTATION. P0 source/command
design requiring Root scope confirmation and independent E/B review.
Investigation date: 2026-10-18. Implementation base: b8195e3fd671a361e4059944199e1bd9d14dc78b.
Remote main observed: 1a40309601074fe37fa3526f66a0b5c0beedb308.

## Decision requested

Use ONE existing World command/sole-writer/atomic-event chain to create a
future ordinary departmental envelope and one unconditional, fully approved
new budget line for COUNTRY_01's government, in ONE explicitly bound period.
Do not build another offline carrier, approval database, opening architecture,
or parallel budget ledger. Do not implement until this exact scope is reviewed.

The target original gap identity is ENTITY_GOVERNMENT_01. The native archive's
GOV-01 is a candidate owner label; their authoritative entity mapping must be
located, not presumed. Actual World/opening identity, entity mapping, currency,
period, amounts, envelope/line identities and cutoff remain unresolved/null.
No proposed ID in the existing blocked example is an actual created record.

This slice can establish that ONE newly created line starts with paid,
outstanding and reserved amounts of zero, after lawful creation and complete
lineage checks. It cannot establish that the government's historical payables,
other lines, mandatory spending, or any of the original 840 fields are complete.

## Source versus wiring: observed at the pinned base

| Subject                                    | Finding                                                     | Exact existing source / next producer                                                                                                        |
| ------------------------------------------ | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Ordinary budget actions and approval roles | Existing normative rules, not a missing economic model      | FINANCE-U0244, U0817, U1040 in specs/extracted/FINANCE.md                                                                                    |
| Mandatory baseline classification          | Existing rule, not discretionary by default                 | FINANCE-U0243; keep debt separate from mandatory non-debt                                                                                    |
| Native currency and FX                     | Candidate exists, adoption not established by this archive  | UNIT_SAFE_NATIVE_BUCKETS.json /countries/0: XAA, LCperGCU 163.84; GOV-01 legalAdoptionAndSpendabilityVerified=false                          |
| Budget amounts                             | Selected candidate is a stress choice, not an appropriation | BUDGET_CHOICE_PATHS.candidate.json /countries/0: 98412.81 GCU stress ceiling; ownerAdoptionRequired=true; mandatory cost/commitments UNKNOWN |
| Source registry                            | Archived source-and-gap index, not adopted budget history   | SOURCE_REGISTRY.json: ARCHIVED_SOURCE_AND_GAPS_ONLY; adoptedFacts=[] does not prove lawful empty history                                     |
| Actual target period and budget approval   | No nominated actual record in the selected readset          | Locate accepted source first; if absent, create a genuinely future authorized budget decision, not a backdated signature                     |
| Budget declaration planning                | Already implemented; no authority                           | planBudgetAppropriation and checkBudgetAppropriationHistory; inert flags remain false                                                        |
| Native capacity and commitment kernels     | Already implemented, require real inputs                    | calculateAvailableFiscalCapacity and FiscalBudgetLineSnapshot; never use missing cash/obligations/buffer as zero                             |
| FINANCE_BUDGET capability                  | Existing capability, not a current office grant             | packages/core/src/authorization/offices.ts; current actual identity remains A-owned                                                          |
| Authenticated Finance budget family        | Missing upstream implementation at this base                | ManualOfficeCommandFamily, strict intake and manualOfficeCapability currently admit Captain/CB/Social only                                   |
| Durable approvals                          | Existing but wrong economic family                          | Narrow-transfer approval store is bound to transfer terms, FINANCE_TREASURY and TRADE_CONTRACTS; cannot approve this budget                  |
| Atomic persistence and cache observation   | Existing reusable infrastructure                            | AtomicTransitionRepository, createAtomicCommandLifecyclePersistence, observeCurrentMaterialization                                           |
| Budget domain replay                       | Missing upstream implementation at this base                | DurableV08LedgerLineageReader rebuilds financial/inventory state only; RebuiltV08Ledgers has no budget records                               |
| b819 candidate producer                    | Existing approved blocked preparation only                  | Actual totals null; no issuer, office authentication, PR156 full-context validation or admission                                             |

These are bounded findings, not a claim that all possible sources were searched.
SOURCE_EVIDENCE.json has 62 lineage references; they were not all replayed.
Byte pins and selected observations are in SOURCE_CONSTRUCTION_OBSERVATIONS_V1.json.

## One implementation path (proposed, not currently installed)

1. Root/F supplies accepted World/opening/entity/native-currency/period/policy
   locators and exact versions. A supplies current genuine Finance identity and
   FINANCE_BUDGET authorization through the existing resolver, not through D JSON.
   A missing locator returns SOURCE_RUNTIME_UNAVAILABLE; no trusted=true callback.
2. Root/A extends the existing authenticated office intake to a strict Finance
   budget family supporting only SET_ENVELOPE and APPROVE_NEW_LINE. Browser
   intent supplies no actor, grant, SimTime, approval status or source-readiness.
   Queue acknowledgement remains registration, never appropriation success.
3. A new D-owned deterministic transition module validates the exact canonical
   command and real authorization evidence, scope, policy, complete bounded
   allocation coverage, new-slot identity, predecessor and expected World head.
   Reuse PR156 for declaration consistency only: passing it is not authentication.
   Do not change its BUDGET_INERT_FLAGS or relabel its proposed sources as real.
4. A genuine Finance decision is the authorized future budget command and its
   committed event/receipt lineage. Any planner declaration adapter must bind
   the actual canonical payload/fingerprint, auth subject, authorization version
   and command observation, never invent an earlier signature or approval set.
   Its decision is effective only after the atomic commit. This command-as-
   decision mapping is specifically submitted for E/A review, not assumed legal.
5. First increment supports only a SOURCED ordinary case where Captain and
   other offices are NOT_REQUIRED. UNKNOWN blocks. REQUIRED blocks until a
   separately reviewed budget-bound co-approval path exists; no threshold is
   invented to make this case qualify. Existing transfer approvals are forbidden.
6. D's Worker candidate builder obtains a server-owned, transaction-consistent
   budget lineage snapshot tied to actual World head and writer fence. A new
   budget replay reader must verify canonical committed commands/events,
   complete sequence/head binding, immutable scope and predecessor continuity.
   It must handle unrelated valid World events without treating them as budget
   records, and reject unknown budget versions, omissions, duplicate identities
   or malformed history. Existing V08 replay alone is insufficient.
7. Absence of a materialization row is never absence of budget history. Prove
   the new envelope/line slot against admitted identity and complete relevant
   command/event lineage. External legacy obligations are not imported into
   this new line. No-import disposition is bounded to that fresh line; if it
   cannot be established, block rather than initialize zero.
8. Emit real envelope/line creation, appropriation and initialization events
   with causation, version and scope using the existing atomic draft/sole writer.
   Any current_materialization is a replaceable replay-checked cache, not an
   issuer. Revalidate source heads, current office authorization, allocation
   preconditions and writer fence inside the final existing commit transaction.
   No new schema/table is proposed. If existing atomic assertions cannot express
   the required guard, stop for a precise Root-owned seam review, not an ad-hoc SQL
   writer. Concurrent different-ID creates in the same scope must not exceed cap.
9. Re-read and replay the committed source at the exact new World head; compare
   envelope, line, appropriation, initialization and receipt hashes. Only then
   expose a source snapshot to downstream consumers. A filesystem bundle, cache,
   INERT_PROPOSED result, queue acknowledgement or human design review cannot
   supply the source-ready state.

The proposed events are budget authority, not cash. This slice makes no payment,
tax collection, borrowing, FX conversion, reserve, purchase or simulated payroll.
This is not permission to ignore any applicable capacity gate: if its sourced
rule requires cash, protected floors, buffer, financing or complete obligations,
missing authoritative inputs block approval. No unconditional solvency claim.

## Independent file ownership and integration dependencies

D-owned NEW files after scope/design approval (names proposed):

- packages/core/src/commands/finance-budget-source-transition.ts and its test.
- apps/world-worker/src/persistence/finance-budget-source-candidate.ts and its test.
- apps/world-worker/src/persistence/finance-budget-lineage-reader.ts and its test.

Root/A-owned shared seams requiring explicit assignment before editing:

- packages/core/src/commands/authenticated-office-command-contract.ts.
- apps/world-worker/src/intake/manual-office-command-intent.ts.
- apps/world-worker/src/intake/postgres-office-command-intake.ts.
- apps/world-worker/src/intake/manual-office-intake-runtime.ts.
- apps/world-worker/src/preparation/manual-office-command-composition.ts.
- Core exports, runtime composition, any required atomic commit guard seam and
  their focused tests. Inspect exact existing family wiring before assigning.

No D edit to G UI/map/preview, F cash/opening/reserve sources, C physical costs,
G claims, A current-seat sources, SQL/migrations, Root registers or status files.
No second approval service, starter seed, production connection or Clock activation.

Dependency order: Root scope + E/A design review -> accepted source locators and
policy applicability -> D pure transition/replay candidate + Root/A seam patch
-> finite local tests -> B engineering/E economics exact-SHA review -> separately
authorized runtime integration. Actual execution is not authorized by this plan.
Existing b819 approval does not unlock any of those dependent authority changes.

## Minimal locator packet, then only genuinely missing decisions

Root should request accepted locators from existing owners before asking humans
to restate accepted D01-D04/D06, TIME360, corrected R, currency/FX or classification.

| Required item                                           | First action                                                                      | Human decision only if not already established                                                                                                         |
| ------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| World/opening, government identity and GOV-01 crosswalk | Root/A/F accepted immutable locator and current head                              | No new economic decision; unresolved integration blocks                                                                                                |
| Native currency, Money precision and period/cutoff      | Root/F accepted policy/period locator; XAA is a known candidate, not adopted by D | Select only the genuinely unchosen target period or precision; never infer from archive dates                                                          |
| Envelope cap, line amount and purpose                   | Locate an actual accepted proposal/decision if one exists                         | For a genuinely new proposal choose exact native-currency cap and appropriation plus ordinary departmental purpose; no 98412.81 GCU conversion/default |
| Captain/other-office applicability                      | Bind existing rule revision and evaluate the exact selected proposal              | Only an unresolved strategic threshold/applicability rule needs a new ruling; no blanket NOT_REQUIRED                                                  |
| Relevant fiscal capacity preconditions                  | Bind existing floor/buffer/classification policy and F/C accepted inputs          | Only genuinely absent policy parameters, with exact fields identified; missing source records are not new economic choices                             |

Do not request blanket approval of all 17 fields, all 70 countries, or an empty
government obligations register. Source producer/office binding work is an
engineering dependency, not a reason to ask humans to invent historical facts.

## Finite verification and acceptance boundaries

After approval, focused tests must cover: missing actual World/period/identity;
cross-world/currency/period; absent/revoked/changed current Finance grant;
caller-forged approval and wrong-family transfer reference; sourced Captain
required/unknown; unsupported legacy/project/partial/conditional cases; absent
cache with present history; duplicate slot/cross-envelope line identity; stale
head/source/predecessor; concurrent cap consumption; idempotent retry versus
changed fingerprint; event replay gaps/duplicates/tamper/unknown budget version;
atomic rollback before receipt/cache publication; exact Money/cap arithmetic;
one fresh line's lawful zero versus UNKNOWN government totals; readback matches
committed event/receipt lineage. No long-running stress or production tests.

This deliverable is a source investigation and design, not those tests passing.
No actual budget issuer, current approval, full obligations coverage, production
readiness, original-field closure, gate promotion or merge is claimed.
