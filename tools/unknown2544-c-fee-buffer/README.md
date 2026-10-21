# C COUNTRY01 B03/B04 DRAFT source projection

IMPLEMENTED_UNVERIFIED. Exactly three original fields, five new files. No source
admission, economic adoption, account/permission issuer, payment, balance writer,
World, Clock, production operation or original-field closure.

The controlling contract is SHA256
`e2fbf6db1fa0d249419cdcf207540fc9d0f152b774d2c03eda8d9872cbe073a5`;
the reviewed V2 test plan is
`835066dde903dc0615d3cf7cdee8b812d8f09a3c5d69db023faca1c1e8455b68`.

`readFixedCountry01FeeBufferInputs()` reads exactly the prepared three ledger
pointers and source leaves, not a210-country/batch scan. Fixed file type/length,
SHA256, original identity/unit and source-null checks are enforced. Historical
feeRule stays UNKNOWN_NOT_ADOPTED. No caller pin, path or selector is accepted.

`buildCountry01FeeBufferCandidate` independently resolves tagged fee-policy,
fee-event and buffer inputs. Caller documents require exact bytes, version/hash,
pointer and payload agreement. Nested `{pointer}` witnesses inherit the bound
document identity/version/hash, avoiding a self-referential document hash. This
proves bytes only: complete caller JSON is at most DRAFT, never adoption or legal
authority. Separate adoption locators are unapplied/unverified.

Policy-only output survives missing events. Fee totals require a valid policy and
complete declared bounded event family. Buffer requirements do not depend on fee
policy/events/cash. Invalid source nodes affect their dependent rows, not every
row. Policy/event completeness is not whole-country completeness. TEST_ONLY
results always use synthetic output IDs, never original numeric evidence.

Reuse: existing Core Money/world-decimal operations (120-digit operand/result
guards, exact240-digit multiplication context), existing gross diagnostic,
existing F native-cash restriction-UNION reader, existing fiscal-capacity function.
No second financial ledger or arithmetic model is introduced. Unsupported rate,
precision or scope fails explicitly; no rounding, FX1 or missing-value zero.

Fees are deduplicated by canonical charge/component identity, not messages.
Inclusive gross100/fee5 discloses fee5 but incremental gross fee0, not another5.
Fee already inside a committed-payment component is included once. Non-GCU gross
uses cash:null and does not claim the existing GCU funding diagnostic supports
native settlement.

Buffer fixed or days-times-daily-base methods must be explicitly selected and
source-bound. An undeclared optional legal minimum alone does not block a draft;
declared incomplete/conflicting/breached minimum does. No implicit max/min rule.
A candidate requirement is not actual retained cash or a payable.

Optional joint diagnostics require genuine existing F-reader inputs plus exact
cash snapshot/period binding and source-owned coverage portions. F computes cash
minus restriction UNION; only uncovered payment/fee and buffer amounts are then
subtracted by Core. Duplicate/overclaimed/cross-purpose portion credit or missing
disjointness/financing blocks the diagnostic only. Negative shortfall is preserved.
These remain DRAFT diagnostics, not cash availability or payment authority.

B06 typed TGA/deposit/reserve structure is independent of B07 spendability. This
module imposes no extra claim-free CASH requirement on the five entity bindings;
an optional F cash diagnostic cannot invalidate their structure.

Verification: one targeted Vitest file covers the34 reviewed scenario IDs. Enable
the private fixed-source cases explicitly with C_FEE_BUFFER_FIXED_INPUTS=1; absent
that switch those cases are skipped, not evidence of private-source PASS. The
existing owned6.4MB test-only financial fixture is reused and disposed by its own
helper; no large archive/replay/model or old full suite is invoked. Strict noEmit
configuration maps Core to source and changes no shared configuration.

All actual amounts/currency/period/World/adoption/payment fields remain null; all
original stage/admission/runtime/payment/register flags remain false. Independent
B/E implementation review and later applicable Root verification remain pending.
