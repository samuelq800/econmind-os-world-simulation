# Code completion priority — 2026-09-27

Owner instruction: continue mainline code construction; defer actual-user
feedback. This is an execution order, not a claim that V00–V32 or Gate B is
complete. Preserve existing UI/maps/engines and implement missing connections.
No production Supabase mutation or original EconMind website change is allowed.

## Active independent slices

| Owner         | Concrete code delivery                                               | Boundary                                                                                                                                                   |
| ------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A             | Durable Buyer Finance approval reference and server writing contract | Forward-only V2 schema/manifest and Worker approval store; first resolve the existing-command-before-approval ordering without inventing economic approval |
| D             | Disconnected controller cannot dispatch a previously pending Command | Browser client/controller and deferred-token/marker regression; already-sent requests must not be falsely called cancelled                                 |
| F             | Native PG command acceptance and durable receipt adapter             | Existing Command/idempotency/World-head lock/Worker boundary, not a second economic engine; avoid A's schema/store files                                   |
| Control tower | Manifest-driven disposable restore compatibility and integration     | Existing migration validator, exact artifact bytes and provenance; no migration or production action                                                       |

Each P0 slice stays isolated and unverified until its fixed candidate passes
normal focused checks and B's narrow independent review. Do not build against
an unapproved new contract or mark a blocked dependency complete. Existing
known regressions remain mandatory; actual-user feedback is not a prerequisite
for these coding slices.

## Follow-on code integration order

Progress update: D's harness/session-liveness fix, A's immutable approval
reference and E's native approval reader are independently approved and merged.
The reviewed E candidate is `6a73e05c2f5c7006c87e6ebcc87233cab1f731c1`;
integration is `16ed0c59c5cfedaac396917c8da97058bb160215`. F's first candidate
`3223f3a45b12948aa400034bdc5df9d559a3440b` was rejected for
`F-INTAKE-LOCK-ORDER-001`. Fixed candidate
`9009528bbd48af77de80547f647dffbb14d05909` is independently approved with that
finding CLOSED and native PostgreSQL 31/31 PASS, integrated at
`d1017e6586b8ef1bd203f41ca163c27ba0518e71`. The staged module is now available;
actual HTTP registration/approval/enqueue/receipt composition remains next.

1. Completed: replace the API Finance approval fixture in the native bridge
   composition with a server-owned reader of A's approved contract. This is
   not removal of the remaining receipt-port fixture or production wiring.
2. Once the acceptance/receipt contract is approved, compose the real command
   path with the existing Worker; bind local browser read/command/receipt
   transport to those services. Do not simulate a final receipt in place of a
   durable commit. Preserve per-step numeric facts and causal identities.
3. Reuse existing V25 UI/map and V26 projection/cache modules; replace fixture
   transport only where a real authorized backend exists. Reconcile V27/V28
   initialization inputs with the authoritative source data, not invented
   countries, calibration values or unapproved orchestrator decisions.
4. Wire V29/V30 replay, recovery and bounded measurement tools to the completed
   non-production execution path. Exact tests are code evidence; realistic
   measured results, data approval and a gate decision remain separate.

## Deferred, not silently passed

Actual-user usability feedback, visual polish based on that feedback,
dedicated staging/TLS and production-scale measurements, release/production
switching and operational sign-off are not claimed by code completion.
V31/V32 hard dependencies still apply. Record code and remaining input or
approval blockers honestly; do not bulk-promote the stale formal ledger.
