# V29 same-World sequential Worker deliveries — preparation only

Status: `PREPARATION_ONLY_NOT_V29_STARTED`.

Frozen integration baseline: `3725f2f25403b96924baf82a04c2240b2aaf6065`.
The initial experiment began at `e18a7073bc487f8948061b1e140726bfe191b4a9`
and was rebased onto the exact integration baseline, which already includes
the canonical-UTC durable replay hash fix.

This test-only slice attempts two distinct `CORE_GOODS_DELIVERY_V1` Commands
in one World through the existing authoritative Worker composition and narrow
Treasury-GCU candidate factory. Its prior transfers/reservations/shipments,
opening stock/funds, claimed queue rows and candidate source remain explicit
local fixtures. Each Worker delivery must durably advance WorldVersion by one
and persist its own Event, inventory and financial postings, receipt and
outbox. The evidence reader hashes committed Event, Inventory Posting,
Financial Posting, Receipt and WorldVersion rows immediately after each Worker
step. The focused test checks each event's distinct transfer binding and each
receipt's version edge, plus the durable posting amounts:

| Worker step | WorldVersion | Goods delivered | Buyer Treasury payment | New Event/Inventory/Financial/Receipt/Outbox rows |
| ----------- | ------------ | --------------- | ---------------------- | ------------------------------------------------- |
| Delivery A  | 4 → 5        | 2 tonne         | 6 GCU                  | 1 each                                            |
| Delivery B  | 5 → 6        | 2 tonne         | 6 GCU                  | 1 each                                            |
| Retry B     | 6 → 6        | 0 additional    | 0 additional           | 0 additional                                      |

Total persisted delivery postings: 4 tonne and 12 GCU; the buyer's
14 GCU opening Treasury and the two pre-delivery transit sources are
test-only prepared fixture state, not a production World seed. Two fresh
PGlite worlds replay A/B/retry B with fixed seed
`V29_TWO_DELIVERIES_REPLAY` and canonical-UTC sequence hash
`sha256:8638d34d83bc1dd44fa7f11a9404e7fd53077901dcaf4f1eb7db3105b0501ae2`.

No Core, Worker, API, runtime, migration, production database, formal status,
Gate or original main-site code is modified. V29.1–V29.3 remain `PLANNED`.
This preparation is not a 70-country run, 600/1000-day long run, general
multi-command scheduler, native PostgreSQL proof, independent review,
formal acceptance or economic calibration.
