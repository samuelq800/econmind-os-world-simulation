# Independently review one implemented R2 step

Act as a reviewer, not the implementation agent. Read the step prompt, binding
specifications, approved ADRs, execution plan, implementation report, test
evidence, and exact commit diff. Re-run proportionate real checks and inspect
negative paths, architecture boundaries, authority, security, accounting,
time, idempotency, and scope as applicable.

Classify findings with reproducible evidence. Use `PASS`, `FAIL`, `NOT_RUN`, or
`INSUFFICIENT_EVIDENCE` accurately. Record `VERIFIED` only when all required
evidence and gates pass; otherwise return `CHANGES_REQUIRED` or `BLOCKED`. Do
not fix code, approve a human-required ADR, weaken tests, or review later steps.
