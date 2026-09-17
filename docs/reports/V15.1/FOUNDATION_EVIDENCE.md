# V15.1 Education Foundation Evidence

## Candidate disposition

`FOUNDATION_IMPLEMENTED_UNVERIFIED`. This report records a narrow pure-Core
candidate only. It neither starts V15.1 nor changes V14.3, status, Gate, merge,
or production disposition.

## Implemented calculation boundary

`calculateEducationFoundation` in
`packages/core/src/engine-kernels/social-foundation.ts` accepts explicitly
identified applicants, teachers, facility seats, budget-supported seats,
training duration and cohort states. It returns only exact person/simulation-day
quantities, the next caller-owned cohort shape, and an ID-bound replay trace.

The function rejects a cohort above actual capacity, rejects early or fractional
graduates, and requires an actual vocational/higher graduate plus a matching
skill-stock handoff before labour-skill stock can change. It has no productivity
output, command, event, persistence or default formula.

## Focused evidence

`tests/world-core/v15-v16-social-foundation.test.ts` covers real teacher/seat
capacity, duration, zero-teacher no-graduate behaviour, explicit handoff
before/after values, and invalid fractional-person results.
