# Decisions needed for a complete fictional opening

Status: PROPOSED_OPTIONS_ONLY. No option is selected, adopted, signed or applied.
This is a new-world initialization choice, never permission to reset an existing
World, mint funding, import production data, or start World/Clock.

The fixed source already supplies the 70-country baseline. Existing D04 adoption
authorizes source employment targets, OP/GOV employer mapping, skill/region/job
capacity constraints, deterministic largest-remainder allocation and stable-ID
ties. These engineering rules need no repeated approval. They do not supply
missing wages, service queues, housing title or benefit rules.

## Choose the intended opening, then inspect its complete candidate

| Path                                | Concrete behavior                                                                                                                                     | Consequence                                                                                                                                                                                              |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preserve current adopted inputs     | Keep all known source values and explicit unknowns; expose source-backed reads.                                                                       | No new economic choices; incomplete employment/services remain unavailable. This does not complete six-Office runtime acceptance.                                                                        |
| Explicit cold-start service queues  | A new scoped genesis policy declares no existing student cohorts/applications, historical medical backlog or occupied beds at t0.                     | These become generated scenario zeros, not observed source facts. Existing facilities may start idle. Future demand, programmes, staffing, supplies and budgets still need valid rules.                  |
| Source-calibrated populated genesis | Prepare one versioned 70-country policy and generated manifest covering the choices below; preserve source totals and all physical/legal constraints. | Enables a complete candidate for review, replay and admission once inputs are complete. Generated values must retain their rule/version/provenance and cannot be presented as pre-existing observations. |

The populated path can use cold-start queues as an explicit subchoice. It cannot
be implemented by changing a missing value to zero or marking all gaps resolved.

## Concrete recommended candidate, not selected

For an explicitly **new fictional genesis**, the following is a reviewable
starting proposal rather than existing adopted data:

- Keep each country's separate local currency. Propose an opening rate of
  1 local-currency unit per GCU, recorded under a new versioned scenario FX rule;
  preserve any explicitly adopted exceptions. Do not conflate the currencies.
- Propose wage weights LOW=1, MEDIUM=1.5, HIGH=2 and DOCTOR=3. Hourly local wage
  is `countryDailyIncomeReferenceGcu * openingFx * jobWeight / (24 * sum(filledJobCount * jobWeight))`.
  Quote the derived price down to 0.01 LC/hour and record the calibration
  residual; source amounts are unchanged. Nonpositive or infeasible results
  fail validation. This is a new proposed pricing rule, not an existing salary.
- Use existing lawful employer funds and payable/arrears processing, with no
  initial cash grant or fabricated prior wage payment. Preserve adopted source
  employment totals and allocation constraints; unmatched people do not silently
  become unemployed or invented domestic-service jobs.
- Explicitly initialize empty historical student/application and medical
  backlog/occupied-bed queues. Capacity remains capacity; future demand,
  staffing, programmes, inputs and budgets still require lawful implementation.
- Propose HOUSEHOLDS aggregate ordinary-housing title/risk, all adopted units
  habitable, `occupied=min(households,units)`, `vacant=units-occupied`,
  `unhoused=max(households-units,0)`, owner-occupied with no inherited rental
  contracts. Preserve explicit public/foreign/other rights. Rent is NOT_APPLICABLE.
- Propose no existing welfare programme/payment obligation or historical
  safety case/deployment. Welfare coverage is NOT_APPLICABLE. Initial police
  staffing must be chosen explicitly: zero existing police, or a separate
  funded staffing policy. Neither means future crime is zero.

These choices unlock preparation of a complete candidate, not immediate
production acceptance. Medical occupation decomposition, complete lawful job
requirements, CB opening-register completeness and any unsupported action
contracts must still pass the existing rules. No unknown CB holding is declared
zero by this proposal, and no existing World is reset.

An explicit owner choice can be captured as a project adoption record containing
the actual message reference, policy version and artifact hashes. That record is
not a cryptographic signature. Use an already authorized signing service only
within its established scope; do not invent Owner signatures or create new keys,
persistent permissions or external approvals under this proposal.

## Minimum policy sections

| Section               | Existing decisions to reuse                                                                                                                                                     | New choice or record needed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wages and jobs        | D04 employment targets, aggregate employers, allocation and conservation; real existing employer funds and normal payable/arrears rules.                                        | Choose an actual wage table or a versioned 70-country scenario wage policy: occupation/skill rates, local currency, SIM_HOUR or SIM_YEAR, effective interval and source/version. Resolve the school generic mix versus required HIGH teacher occupation. Derive region/skill allocations where the already approved constraints determine them; do not ask for thousands of arrays.                                                                                                                                                                                                                                                                                                      |
| Money and funding     | D03 local-currency wages, traceable opening FX/version, one TGA claim represented on both sides, no duplicate money.                                                            | Identify the complete local-currency/FX and CB holding source records. Any new fictional denomination/FX policy needs explicit adoption; GCU income reference is not automatically local-currency salary. Bind existing employer accounts and approved budgets; do not add cash to make payroll pass.                                                                                                                                                                                                                                                                                                                                                                                    |
| Schools and hospitals | 122 existing BASIC school groups and 122 HOSPITAL groups; no existing college group, six unbuilt clinic options. Capacity is not enrollment, treated patients or occupied beds. | Choose explicit empty initial queues or a versioned cohort/care-type initialization with programme/duration, backlog, occupancy and future-demand rules. Supply lawful staffing/occupation, inputs and budget rules separately.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Ordinary housing      | Preserve the 122 regional housing stocks and household references. Ordinary housing is not automatically government property.                                                   | Choose existing title/tenure records or a new explicit aggregate-title policy, such as HOUSEHOLDS title with a separately stated operator/risk rule. Then choose occupancy/habitability and owner-occupied versus rental treatment. An owner-occupied/no-rental policy means rent is NOT_APPLICABLE, not a fabricated zero-priced lease. One concrete minimal candidate is: all adopted units habitable; occupied = min(households, units), vacant = units - occupied, unhoused = max(households - units, 0), HOUSEHOLDS aggregate title/risk and no initial rental contracts. These are proposed scenario rules, not derivations from missing source facts. No policy is selected here. |
| Welfare and safety    | Preserve actual existing programmes and cases if present; use actual fiscal and staffing constraints.                                                                           | Choose explicit t0 no-programme/no-existing-case state, or a versioned eligibility/benefit/payment and incident/case initialization. A declared empty programme means coverage is NOT_APPLICABLE. Empty initial cases do not mean future crime is zero. A zero-police start, if selected, explicitly starts without that protection; otherwise a funded lawful staffing policy is required.                                                                                                                                                                                                                                                                                              |

The current generator's `employed * (18 + 12 * urban)` is an existing **GCU daily
income reference**, not an adopted job wage table. The C01 wage/model files are
documented, unselected candidates for C01 only; their numerical values and
currencies cannot be silently extended to 70 countries.

## Evidence and closure

Current inventory: 1,066 composite source groups, 2,844 known/derived field
references (2,356 already mapped and 488 newly wired), zero whole groups closed.
Counts are reference occurrences, not unique missing facts or new source values.

After a policy choice, engineering must first produce its complete deterministic
candidate and conservation/feasibility results. Any impossible staffing, budget,
ownership or accounting constraint remains a blocker; a policy choice is not a
successful simulation or production admission. Real signed authorization, fixed
V2 source material, least-privilege connections, controlled release, independent
review and actual target readback remain separate requirements.

Primary authority: `docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISIONS.original.md`
sections 3 and 5.1/5.5/5.6; immutable selected source under
`artifacts/world-balanced-candidate-v1/data/`; exact outstanding fields in the
`social-source-bindings.mjs --summary` output and retained source inventory.
