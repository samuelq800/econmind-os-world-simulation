# Gate A Foundation Review Bundle

## Candidate identity and authority

- Branch: `codex/foundation-v02-v05`
- Implementation candidate: `2a5cff3b825c88e23dddc6dcb08186252d5f8b5c`
- Scope: V02.1 through V05.3 only
- Candidate state: `IMPLEMENTED_UNVERIFIED`
- Independent decision: pending; this bundle is not an approval
- Production mutation: none
- Merge authorization: none
- V06: `PLANNED`, not started

The source manifest contains eight hash-verified authoritative Word documents;
`requirements.docx` remains byte-identical to the Constitution source. Plans,
implementation reports, and test evidence exist for every included step.

## Gate A questions

### Environment

**Can development accidentally mutate production?**

**NO through the repository-controlled launch, environment, migration, and
Supabase command paths.** Missing, unknown, conflicting, cross-environment,
wrong-fingerprint, wrong-namespace, or production-mutation configuration fails
closed. Arbitrary credentials used outside repository controls are not claimed
to be preventable by application code.

### Database authority

**Is there one controlled World V2 migration/release chain?**

**YES.** One repository manifest orders hash-bound migration artifacts; the
candidate namespace is `world_v2`; only `main-site-release-chain` may publish.
The included migration creates namespace/release metadata only and contains no
economic tables, RLS changes, or production execution.

### Numeric correctness

**Can authoritative economic arithmetic bypass decimal.js-backed canonical
numeric types?**

**NO in the implemented World Core path.** Only the isolated Canonical Numeric
Layer imports pinned `decimal.js@10.6.0`; architecture tests reject direct
imports and JS-number conversions elsewhere in core.

### Numeric serialization

**Can exact values lose precision through JS number conversion?**

**NO in authoritative paths.** Inputs are exact decimal strings, non-finite and
non-canonical forms fail closed, exact values serialize as canonical strings,
and the deterministic serializer rejects JS numbers.

### Architecture

**Can world-web or another layer create a second authoritative World State?**

**NO within the guarded repository architecture.** Ownership/import gates
reject browser persistence authority, core UI/browser/persistence dependencies,
and unregistered guarded roots. No temporary World state, economic store,
ledger, or fallback authority was added.

### Property testing

**Are core invariants attacked with reproducible property-based tests?**

**YES for the implemented Foundation invariants.** Six properties use pinned
`fast-check@4.9.0`, fixed seed `20260909`, 250 runs per property, verbose
counterexamples, and replay-path support. V06-V10 properties are declared
`NOT_RUN`, not represented as passing.

### Identity

**Can Main/Legacy identity metadata grant unauthorized World V2 economic
authority?**

**NO.** The bridge accepts exactly `user_id`, `display_name`, and `school_id`.
All extra portable authority fields fail closed; current World membership is
resolved independently on the server side.

### Office authorization

**Is Office authority server-side enforced?**

**YES for the V05 authorization and approval primitives.** Country, Office,
capability, active/suspension state, admin, and negotiation-party access use
current server-resolved membership. Approval contexts carry a runtime-private
brand that client JSON cannot forge. There are no economic Commands yet to
wire, and no UI security claim is made.

## Changed systems and explicit non-changes

- V02: environment policy, migration manifest/validator, local PostgreSQL
  rehearsal, namespace/release metadata artifact.
- V03: branded IDs, exact domain numbers, fixed registries, deterministic
  serialization and version checks.
- V04: reusable arbitraries, reproducible properties, authoritative-pattern
  scanner, protected CI gate.
- V05: identity verifier boundary, six-Office capabilities, current-membership
  authorization, versioned approvals, classified projections, revocation rules.
- No World Clock, Command Bus, Event Ledger, Receipt, inventory, transaction
  writer, cross-country settlement, economic Engine, map, forecast, country
  initialization, NPC, orchestrator, or gameplay UI.
- No production Supabase access, mutation, RLS change, seed, reset, backfill, or
  migration publication.

## Failure history retained

1. V02 authorization test fixture lacked the new required fingerprint; the
   fixture was corrected without weakening fail-closed policy.
2. V02 report JSON initially failed formatting and passed after formatting.
3. V03 frozen install detected an absent new workspace lock importer; the
   lockfile was updated and frozen install passed.
4. V03 typecheck exposed the decimal.js import form; the canonical wrapper was
   corrected.
5. V03 duplicate-ID test checked message text instead of the structured code;
   the assertion was corrected.
6. V03 generator output was not formatted; generation now includes formatting.
7. V04 first property run could not resolve fast-check from the root runner;
   the same pinned dev-only version was added at the runner root.
8. V04 boundary fixture arguments reached an appended scanner; the boundary
   CLI was restored to the final command position.
9. V04 policy correctly detected its own literal disabled-test fixture; the
   fixture now constructs the token while preserving the negative test.
10. V05 type narrowing and then a compile-only runtime brand failed initial
    checks; safe narrowing and a real private Symbol fixed both. A new negative
    test rejects forged contexts.
11. The first full `pnpm check` passed 146 tests and every preceding gate, then
    failed Core declaration output because an exported Office-ID array relied
    on an inferred private brand. An explicit public type annotation fixed the
    declaration boundary without changing behavior.

No fast-check property produced a counterexample. The V04 first failure was
dependency resolution before property collection, so seed/path/counterexample
are recorded as `20260909` / null / null rather than invented.

## Findings for independent review

| Severity | Count | Candidate-owner assessment                                                                                                                   |
| -------- | ----: | -------------------------------------------------------------------------------------------------------------------------------------------- |
| BLOCKER  |     0 | None identified; independent reviewer must confirm.                                                                                          |
| MAJOR    |     0 | None self-declared; P0 approval remains unavailable until Gate A.                                                                            |
| MINOR    |     2 | Live isolated Supabase-project rehearsal and real main-site verifier integration are `NOT_RUN`; both require future authorized environments. |
| INFO     |     3 | Live RLS is outside scope; V06-V10 invariants are `NOT_RUN`; ADR-09/12/16/18/20 remain unapproved.                                           |

The two MINOR evidence gaps do not authorize production work. The independent
reviewer may reclassify any finding. Any Gate A BLOCKER or MAJOR must be fixed
and re-reviewed before V06.

## Reviewer decision boundary

Review the immutable candidate and all per-step evidence. The implementation
owner has not added a `step_review`, has not marked any V02-V05 step `VERIFIED`,
and has not authorized merge or production deployment. An approval must name
the exact reviewed commit and be recorded by an independent reviewer under the
P0 policy.

**NEXT ACTION = GATE A FOUNDATION REVIEW. DO NOT START V06.**
