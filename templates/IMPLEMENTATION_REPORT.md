# Implementation report for STEP_ID

## Status

Status and continuation must follow
`docs/governance/FAST_MAINLINE_REVIEW_POLICY.json`. Record the effective risk
class, highest affected boundary, verification method, immutable implementation
commit, and whether Work Package review is pending. P0 cannot be fast-tracked.

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

State the policy-required next action. Never continue after a failed mandatory
check or unresolved blocker.
