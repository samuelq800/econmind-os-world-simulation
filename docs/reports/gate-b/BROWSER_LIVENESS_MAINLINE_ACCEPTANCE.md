# Local browser harness and liveness fix — scoped acceptance

Date: 2026-09-27. Scope: non-production preparation only.

## Immutable candidates and independent decision

- Harness: `5c8c17b90319bee4238dddc5c16c7766c1916571`.
- Reviewed fix: `cc83059882473d9d9f665cd76b379d0584513b36`.
- Prior main: `e8c4337aa6db3922eb13159264485cf5177703f4`.
- Conflict-free integration: `db410e2e7e7b6ee73b01bf6e26ed0152c3781351`.
- Independent reviewer: B, task `01a086cd-8c3b-7182-b14f-4d3b77f3b67d`.
- B decision on the exact fix: `APPROVED`, P0=0, MAJOR=0;
  `HISTORICAL_STALE_SEAT_POST_MAJOR=CLOSED`.

B explicitly allowed reuse of the unchanged harness review together with this
fix closure and recommended merging the composed harness plus fix as
non-production preparation. The harness base alone is not newly approved.

## Preserved behavior and evidence

Retired controllers cannot POST commands after pending token/marker awaits.
The pre-fetch guard fails closed, including disconnect, identity replacement,
same-identity reconnect and A-to-B-to-A. Exact in-memory cancellation evidence
applies only to confirmed unsent commands; a new reservation invalidates it.
Already dispatched requests may still commit and retain final-receipt or
UNKNOWN recovery semantics. Late old-client responses cannot update a new seat.

B independently reported five focused files / 43 tests PASS, architecture
three files / 34 tests PASS, both boundary scanners PASS, exact remote SHA
and clean fixed diff. D reported the wider web suite (25 files / 164 tests),
typechecking, web build and relevant lint/environment/secret checks PASS.
These are attributed reports, not claimed as control-tower reruns.

On the composed integration above, the control tower ran:

```sh
pnpm exec vitest run tests/world-web/local-command-disconnect-liveness.test.ts tests/world-web/local-audit-browser-harness.test.ts
git diff --check
```

Both exited 0; two files / 14 tests PASS. No full-suite duplicate run.

## Remaining boundary

No actual-user acceptance, real browser-to-durable-command economic closure,
production release or Gate B approval is claimed. Gate B stays PENDING.
A's approval-reference contract and F's durable intake/receipt adapter remain
separate candidates. No database, original-site or production mutation occurred.
