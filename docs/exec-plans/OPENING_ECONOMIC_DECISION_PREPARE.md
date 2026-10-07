# Opening economic decision — non-activated preparation

## Authority and endpoint

- Scope: `artifacts/O_AUTHORITY_CHAIN_IMPLEMENTATION_SCOPE_2026_10_07.md` in the control workspace, dated 2026-10-07.
- Fixed base: `e3a3b98527090203b5f9241a4d652aa024b394b3`.
- Branch: `codex/a-opening-economic-decision`.
- Risk: P0 opening economics / provenance / admission boundary.
- Endpoint: `IMPLEMENTED_UNVERIFIED`; independent review required. This plan does not update the formal status register.

## Progress

- [x] Read repository governance, opening ownership and fixed E proposal.
- [x] Implement pure decision parser, fingerprints and fail-closed inspection.
- [x] Verify focused tests, typecheck, lint and module import ownership.
- [ ] Independent review of immutable candidate and downstream composition.
- [ ] Real human economic records and complete opening inputs supplied through separately reviewed authority boundaries.
- [ ] Formal seed validation/admission, deployment and runtime evidence: outside this scope.

## Owned paths

Only these new files belong to this candidate:

1. `apps/world-worker/src/preparation/opening-economic-decision.ts`
2. `tests/world-core/opening-economic-decision.test.ts`
3. `tests/support/tsconfig.opening-economic-decision.json`
4. `docs/exec-plans/OPENING_ECONOMIC_DECISION_PREPARE.md`

No shared export, Core primitive, admission implementation, existing loader, schema, migration, API/UI, status or runtime startup is changed. E owns the official-source adapter and full 70-country reconciliation; A does not copy that adapter.

## Fixed inputs

- Source package: `BALANCED_2026_09_28_V1`.
- Source checksums SHA-256: `88dd44478f97d2e8893a4f11b3aaf96e256bdb13248aca0d08f097fabe10d315`.
- Finance bytes SHA-256: `4f30d7dd43aa2190604d4fb73c776a8d4aaa263653dc783def6f7c2c5cc80805`.
- Existing mapping bytes SHA-256: `d2811910a9021e68fabe894504701d6dc8d88e362fc2354b0c826e3446456253` (consumer input; not a new A mapping).
- Sole rule candidate: `E_OPENING_SEMANTIC_MAPPING_PROPOSAL_2026_10_07.md`, SHA-256 `15383e28d523bad7ff4fdbe14e141c7a46f21072c9bd4a81faa5a5acc378c7cb`.
- Proposal contains no internal version token. Its filename stem is the explicit artifact version identity, not a claimed upstream version field.

E remains a proposal until independently resolved human adoption records establish the exact decision intent. No new reconciliation proposal is introduced.

## Contract and trust boundary

`parseOpeningEconomicDecision(unknown)` returns `UNTRUSTED_DECISION_CANDIDATE`, immutable parsed body, intent fingerprint and complete-body fingerprint. The intent excludes the owner-record reference to avoid a circular approval hash; all economic fields, scope, source and proposal remain bound.

`inspectOpeningEconomicDecision({ decision, trusted })` returns structured semantic blockers, or `DECISION_VALIDATED_NOT_SEED`. Malformed syntax/IDs/keys fail with `OpeningEconomicDecisionInvalid`. `openingAdmissionAllowed` is always `false`. Any blocker suppresses all derived-bank output.

`TrustedOpeningDecisionInputs` is a separately resolved server input, not a request DTO. It carries exact original finance strings/pointers and independently obtained owner records. A type, caller flag, hash, filename or reference alone cannot establish trust. This module implements no registry loader or human identity authentication. The reviewed composition must never populate `trusted.ownerRecords` from caller assertions. Real records are currently missing; unit fixture records are inert mechanism tests only.

Owner adoption references bind the existing register through `git:<full-commit>:status/decisions.json#/<pointer>`. The supplied record must match schema, `ADOPT`, nonempty owner identity, canonical real-time timestamp, exact scope, fixed proposal, intent and record fingerprint. This validates supplied record consistency; provenance and authenticity of the independently loaded register are later composition responsibilities.

`worldId: null` is accepted as an unresolved planning input. Inspection adds `WORLD_ID_BINDING_REQUIRED`, skips all World-dependent Core account construction and returns `BLOCKED` with no derivation. No placeholder World is created. A non-null canonical ID still does not prove a formally admitted World exists.

Provenance kinds distinguish `SOURCE_IMMUTABLE`, `OWNER_ADOPTED_RULE`, `OWNER_ADOPTED_VALUE`, `DERIVED_BY_ADOPTED_RULE`, `DOMAIN_ADOPTED`, `PROPOSAL_ONLY` and `AUTHORITATIVE_OPENING_STATE`. References must form a valid DAG. An authoritative label is rejected as proof of actual admission.

## Economic invariants

- Preserve all seven source-finance lexemes byte-for-string, including `660.0` versus `660`. Canonical Core decimal output is distinct from original source values.
- Missing funds-model choice, Treasury/CB allocation, legal owners or rules stays `UNRESOLVED_HUMAN_ECONOMIC_INPUT`; no zero/50:50 default.
- Only an explicitly adopted independent-pools model uses exact `T + C = B`.
- Treasury deposit at CB uses one reciprocal claim. It cannot also claim a separate CB cash allocation; the complete CB sheet is required instead of applying the independent-pools equation.
- Supported reserve relationship is only the proposed bank asset / CB liability claim, with matching identity, owners, account roles and exact amount. Other economic interpretations are unresolved, not silently converted.
- A reserve/Treasury liability claim is not a new CB backing asset. Duplicate monetary accounts/claims and reusing those claims as backing are rejected.
- Explicit CB positions must have adopted-value provenance and exact `Assets = Liabilities + Equity`. Empty or unbalanced sheets block. No inferred backing, auto-equity, balancing plug, tolerance or rounding.
- After all decisions validate, E component-anchor derivation computes bank liabilities `H + D` and bank equity `R + A - L` using existing Core Money. Original source liabilities/equity remain unchanged; derived values carry input refs, adoption ref, fixed proposal hash and transformation version.

Checking an explicitly supplied sheet is not independent evidence that its backing assets exist. Full domain carriers, rights/title/risk, 350-entity roster and materializations are not generated or proved here.

## Verification and risks

Pinned Node `24.20.0`, pnpm `12.3.4`; offline frozen install reused dependencies, ignored install scripts. Core public package build passed. No Worker startup or whole-runtime build was run.

| Focused check                                                              | Result                 |
| -------------------------------------------------------------------------- | ---------------------- |
| New mechanism tests                                                        | PASS — 18/18, one file |
| Dedicated two-file TypeScript check                                        | PASS                   |
| ESLint on new module/test                                                  | PASS                   |
| Existing AST import/ownership analyzer on new module only                  | PASS — zero violations |
| Dedicated emit with explicit repository `rootDir`, output outside checkout | PASS                   |
| Prettier on all four new paths                                             | PASS                   |

Tests cover raw lexemes versus canonical output; unresolved World and owner evidence; fake/caller adoption rejection; intent/scope/hash binding; null allocation; exact independent-pools arithmetic; deposit-at-CB claim model; missing/wrong reserve counterpart; duplicated backing; absent/unbalanced/plug sheet; source mutation; fixed E rules; provenance cycles/labels; duplicate IDs and coverage; deterministic hashes; JS numbers/unknown keys/accessors.

P0 review points: authenticity at the independent owner-record loader, full source equality/70-country coverage at E, actual backing evidence, non-null World versus real admission, and final canonical seed boundary. P1 points: contract-version migration, strict unknown-field handling and reproducible fingerprints under pinned tools. Accepted unit fixtures establish mechanisms only.

First check iteration exposed test fixture typing, Vitest's DOM time declaration and lint issues; corrected without skipping checks or removing invariant assertions. Latest fresh checks above are the passing iteration.

An initial emit command omitted TypeScript 6's required explicit common `rootDir` and failed with TS6059/TS5011. Repeated with `--rootDir .` and the same external output directory: PASS. The two accidental untracked JavaScript outputs were moved into the external evidence directory, not committed; no source was removed.

## Current actual blockers and next owner

At the fixed base, `status/world-data-selection.json` records `worldId = null`, `openingSeedCommitted = false`, `workerStarted = false`. This candidate does not change them.

Missing actual human adoption, allocation/model choice, reserve relationship, complete CB positions/backing and domain ownership remain blockers. A does not regenerate the official 70-country source or fabricate economic values. E owns the bounded official-input blocker manifest, default empty independently resolved owner-record set, and `manifest = null` on blocked inspection.

After independent review, Root may compose compatible candidates only under applicable authority. Any future seed/admission/runtime activation requires its own source/decision/manifest binding and formal gates. No DB/SQL, secrets, production, public site, World/seed, Worker/Clock, push/merge/deployment or Gate promotion is performed by this preparation.
