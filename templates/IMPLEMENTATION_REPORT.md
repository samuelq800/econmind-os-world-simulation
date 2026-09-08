# Implementation report for STEP_ID

## Status

Use `IN_PROGRESS` when some work is complete but the step is not
implementation-complete, `IMPLEMENTED_UNVERIFIED` when implementation and
required local evidence are complete but independent review has not approved
the step, or `BLOCKED` when work cannot safely continue because an external
decision, missing prerequisite, environment limitation, or P0/P1 conflict
prevents progress. `CHANGES_REQUIRED` and `VERIFIED` are review-controlled
states and must not be self-awarded in an implementation report.

## Implemented scope

- Requirements and approved ADRs implemented:
- Files changed:
- Authoritative owners, reads, and writes:
- Commands, events, receipts, and postings:

## Safety and compatibility

- Database, RLS, credentials, and environment effects:
- Transaction, idempotency, clock, and replay effects:
- Legacy-system and migration effects:

## Actual validation

For each command record the environment, commit, exit code, and result. Valid
evidence results are `PASS`, `FAIL`, `NOT_RUN`, and `INSUFFICIENT_EVIDENCE`.

## Incomplete and deferred work

List scope not completed, evidence gaps, unresolved decisions, and approved
deferrals. Never omit scope to make the report appear complete.

## Next action

Request independent review of this step. Do not start the next step.
