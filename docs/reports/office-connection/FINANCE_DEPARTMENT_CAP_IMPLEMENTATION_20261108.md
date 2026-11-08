# Finance18 ordinary department ceiling: conditional Core implementation

Status: IMPLEMENTED_UNVERIFIED. Branch `codex/finance-department-cap-20261108`,
base World `4b6d400c2620303bfdc167d6645adfbfed3f3e04`. This is an independent
preparation branch, not the frozen POWER/native candidate and not policy adoption.

FINANCE-U0068/U0817 and MASTER-U1345 already authorize Finance to set ordinary
department ceilings. No additional choice about that existing power is requested.
The implementation adds the separate `FINANCE_ORDINARY_DEPARTMENT_CAP_ONLY_V1`
contract; it does not broaden `FINANCE_ORDINARY_SELF_ADMINISTRATION_FULL_V1`, its
FINANCE programme ownership, U0295 full funding or its appropriation behavior.

## Exact boundary and field chain

| Finance18 source/input                | Deterministic contract                                                    | Actual implementation/verification                                                    |
| ------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| U0248 government administration       | GOVERNMENT_ADMINISTRATION                                                 | Fixed supported category, not Captain programme approval                              |
| U0249 trade/diplomacy                 | TRADE_DIPLOMACY                                                           | Fixed supported category, not a trade mandate                                         |
| U0250 industry/science/resources      | INDUSTRY_SCIENCE_RESOURCES                                                | New Core positive under TEST_ONLY policy originals                                    |
| U0251 labour/social development       | LABOUR_SOCIAL_DEVELOPMENT                                                 | Second cap shares the same actual TEST_ONLY TGA, capacity conserved                   |
| U0252 cross-government administration | CROSS_GOVERNMENT_ADMINISTRATION                                           | Budget category, no programme-owner reassignment                                      |
| U0253 scenario extra departments      | No default/OTHER category                                                 | Not implemented without actual scenario department definition                         |
| Explicit user amount                  | Existing SET_ENVELOPE amount                                              | Strict existing payload parser, actual policy currency and period; no defaults        |
| Government/envelope/period            | Actual source scope + deterministic envelope ID                           | Hash World/country/GOV/category/period; changing a revision cannot open a second slot |
| FINANCE_BUDGET authorization          | Existing Core queued-command authorization/commit proof                   | Real Core TEST_ONLY proof, one envelope event, zero financial/stock batches           |
| Total fiscal capacity                 | Existing actual Treasury balance, every prior cap and adopted reservation | Multi-department + existing-reservation refusal verified; cash balance unchanged      |

`financeDepartmentCapSetPayload` produces the existing public command payload,
not a source record, approval or new authority. It accepts only policy DATA,
explicit amount and revision reference. There is no client-controlled currency,
programme ownership, paid amount or policy exemption in that payload. The new
policy carries exact ordinary-classification and governance-original references
and hashes. Those pointers are **not proof that the originals exist or apply**.
The Worker must independently establish their actual adoption before publication.

Core history replays the new policy with the same strict command/event checks.
A cap-only policy rejects APPROVE_NEW_LINE. All prior caps and adopted
encumbrances still reduce current Treasury capacity. This first contract creates
one immutable department/period slot; it does not implement cap amendment,
period rollover/release, strategic classification or a national budget workflow.

## What is not connected or verified

No SQL, source publisher, role, grant, UI form, API selector or current publisher
was changed. The existing controlled Finance SQL publisher **still rejects this
new policy**, and the current SQL reducers retain their old supported-policy
gates. There is no formal source publication or SQL/current-read positive for
this new rule. The old full-funding branch remains available with its original
semantics. No production World can obtain a cap by supplying these pointer
strings to the HTTP command endpoint. No native/API/browser/production chain is
claimed. A later source/current integration must verify real classification and
policy applicability, then use the same immutable original through replay and
readback; it cannot merely accept this schema or relax the old FULL assertion.

## Narrow unresolved decision — PROPOSAL ONLY, not adopted

FINANCE-U0789 requires Captain final approval at the strategic threshold;
U0817 retains national-budget/strategic participation and MASTER-U1378 covers
major fiscal/strategic/emergency approval. The reviewed Finance/Master originals
and current `config/postwar-genesis` do not supply an executable numeric threshold,
comparison basis, or an applicable approved national-period ceiling. This is a
bounded source finding, not a claim that no external approved record exists.
An initial Treasury asset balance is **not** an approved national budget.

A directly answerable next question is:

> For the first cap-only batch, should Finance independently set ordinary
> department ceilings only within an already Captain-approved national total for
> the same period, with the sum of all department ceilings kept within that
> total; changing that total or a strategic/emergency allocation still needs
> Captain? Or should a new explicit amount/ratio trigger be defined first?

- **Recommended conservative scope:** the first option. It introduces no numeric
  default and grants no payment/programme funding. It needs an actual approved
  national total and applicable period; if none exists the new branch remains
  unavailable until that total is explicitly approved and recorded. The current
  first-set-only implementation still does not perform cap adjustments.
- **Alternative:** define a new trigger first. The decision must say whether it
  compares one department cap or all caps in the period, the amount or ratio,
  currency/denominator and the period. No suggested number is inferred here.
  Crossing that rule requires Captain, and unknown classification remains closed.

Neither option has been adopted by this document. This is not a request to
reapprove ordinary Finance budget authority or to fill in 70 × 7 initial values.
It resolves precisely the missing boundary between ordinary ceilings and the
existing national/strategic escalation requirement.
