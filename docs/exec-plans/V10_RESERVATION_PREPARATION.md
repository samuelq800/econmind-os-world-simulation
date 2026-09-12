# V10.2 Worker reservation candidate

Status: PREPARATION_ONLY, P0, not approved or committed economic state.

The owner requested advance code construction while B reviews immutable prior
steps. O owns only `apps/world-worker/src/trade/goods-reservation.ts` and its
focused tests; F owns V10.3 settlement. Reuse C's exact two-country fixture and
the existing canonical command, approval, inventory posting and lineage writer.

Implement the missing reservation candidate: parse a narrow GRAIN/Treasury-GCU
command, require a server-held versioned Office policy with an approval-record
reference (no built-in policy), verify both stored proposals and all current
signature contexts, reauthorize the command, reject stale/duplicate intents,
and construct AVAILABLE -> RESERVED with unchanged title/risk/location. Dry-run
the existing joint lineage writer to reject insufficient stock and preserve
financial balances. Expose the real posting and transition for V09 atomic
persistence; do not invent a second balance store or mark a draft as committed.

Reads: canonical command, server policy/proposals/contexts, verified opening
seed and append-only lineage, seller account. Writes: none; returns candidate
event/posting/next-ledgers. No cash reserve or payment is introduced in V10.2;
Finance signatures bind price/payment intent, while V10.3 owns actual payment.

The caller must obtain all inputs under the V09 writer transaction and repeat
current authorization at final commit; this module alone is not a transaction
or durable receipt. ADR-09 remains unapproved, so no runtime policy is installed.
No schema, main-site, browser, production database, or official status edits.

Run focused success/no-stock/current-auth/proposal/duplicate/version tests plus
strict typecheck and focused style checks. Retain failures and gaps honestly.
