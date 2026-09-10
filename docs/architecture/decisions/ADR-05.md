# ADR-05 — Inventory location, transit, title, risk and recognition

## Status and authority

```text
Decision: APPROVED
Authority: RESPONSIBLE_HUMAN_OWNER
Approved at: 2026-09-10T11:58:11Z
```

This record transcribes the project owner's explicit architecture and economic
decision. It is not a Codex self-approval.

## Approved resolution

The authoritative model keeps these facts separate:

- physical location;
- reservation;
- ownership/title holder;
- risk bearer;
- economic export/import recognition;
- financial settlement.

Inventory remains exactly batch-conserved. The canonical minimal lifecycle is:

```text
AVAILABLE -> RESERVED -> IN_TRANSIT -> DELIVERED / destination AVAILABLE
```

Reservation does not remove physical stock, and transit does not duplicate it.
No bucket state alone implies title transfer, risk transfer, export/import
recognition or payment.

## Minimal V10 transaction rule

For the minimal V10 transaction path, delivery transfers title and risk and
recognizes export/import. Financial settlement occurs only through explicit
authoritative Financial Posting semantics and never through direct balance
mutation. V08.1 establishes the separate facts and conserved transitions but
does not pre-implement V10 Trade or settlement behavior.

## Future versioning boundary

Alternative Incoterms or different title/risk/recognition timing require an
explicit versioned contract or later ADR. A future rule may govern new
transactions only; it must never reinterpret historical transactions,
postings or Events.

## Alternatives not selected for the minimal path

- Inferring title or export recognition at reservation.
- Automatically transferring title at dispatch.
- Treating delivery as proof of payment.
- Introducing configurable Incoterms inside V08.1.

These may not replace the approved minimal lifecycle without a future explicit
versioned decision.

Affected work packages: V01, V08, V10, V12, V21 and V22.
