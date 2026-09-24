# ADR-14 / V28.1 — single-World supersession proposal

Status: **DECISION_REQUIRED / NOT_APPROVED**. This is a forward proposal, not an amendment to the historical ADR-14 record, a Constitution change, or a V28.1 gate pass.

## Owner direction to reconcile

The latest owner direction is: “Season1 world 与普通 world 不区分，只做一个”. The follow-up clarifies that even a separate Season 1 instance/configuration label is not required in this slice. Accordingly the proposed path is **one World, one World State, one Simulation Clock, one Event ledger and the existing shared Core**. There is no World/Season mode discriminator, alternative physics, participation/clock/settlement engine, automatic bonus or direct World State edit. This owner's product direction does not itself mark ADR-14 `APPROVED` in `status/decisions.json`.

## Existing authority requiring a deliberate change

| Source                                                                                                           | Existing wording / state                                                                                                                       | Reconciliation needed                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Constitution R002 (`requirements.docx`; searchable `requirements/source_units.jsonl` `CONSTITUTION-U0105–U0106`) | Season and World Simulation share Core **but use separate orchestrators**.                                                                     | A governing owner-approved Constitution/contract amendment or explicit interpretation is needed before an active step may require one path instead. Do not edit only the extracted copy.                                           |
| Constitution R003/R019/R021 and approved ADR-03                                                                  | Country count is configuration; economic deadlines are SimTime; the existing clock owns the exact 10× conversion.                              | Preserve, not supersede. Which country count is activated and how enrollment/cutoff operates remain OPEN.                                                                                                                          |
| `planning/r2_steps.json` V28.1, `planning/R2_33_WORK_PACKAGES_101_STEPS.md`, rendered `prompts/steps/V28.1.md`   | “World/Season Orchestrator 配置”; separate time/participation/cutoff differences.                                                              | After higher authority is reconciled, change the active step title/purpose/acceptance in the manifest, sync the human mirror and re-render the prompt together. Preserve step ID and hard dependencies unless separately approved. |
| `planning/work_packages.json` V28 and planning route                                                             | Two orchestrators and separate Season/ordinary-World runtime configuration.                                                                    | Replace only after a coherent package-level scope decision; keep main-site/legacy preservation and login/route requirements OPEN.                                                                                                  |
| `status/decisions.json` ADR-14 and `requirements/adr_dependency_map.json`                                        | `PROPOSED_NOT_APPROVED`: per-world model version, V2/Season shared Core with **different orchestrators**, legacy compatibility and clean seed. | Owner must explicitly supersede/restate the proposal, separate retained migration questions, and record approval or continued pending status. Do not mutate the historical proposal or self-approve.                               |

The R2 source manifests under `docs/governance/r2/source/` are immutable historical evidence. They must not be rewritten when an active authority is legitimately superseded. `PLANS.md` says conflicting navigation sources stop affected work. This proposal records the conflict rather than choosing one silently.

## Proposed single-World path after reconciliation

1. Keep one canonical World identity/model/clock binding and configured positive country count. There is no second Season instance or mode in V28.1.
2. Pass the same physical opening and authoritative Events to existing Core replay/settlement logic. No duplicated reducer, direct buff, new economic Source of Truth or runtime mutation shortcut.
3. Preserve original main-site and legacy historical data while defining their access/migration boundary later under V28.2/V28.3. No old route/state is removed by this proposal.
4. Resolve operational clock control, participant authorization/admission, command cutoff/expiry, country activation and clean-seed/legacy compatibility explicitly; none is decided by the single-World preparation module.

## Decision request and current gate

The responsible owner/governance process must confirm the precise R002 reconciliation and ADR-14 replacement record before the active V28.1 contract can be rewritten/promoted. V28.1 hard dependencies (V05.3, V10.4, V23.3, V25.3, V26.3, V27.3) remain unchanged; all but V05.3 are still `PLANNED` at this candidate's entry. The current branch is **PREPARATION_ONLY**. No ADR status, Gate/status, production, schema, migration or original main-site change is authorized here.
