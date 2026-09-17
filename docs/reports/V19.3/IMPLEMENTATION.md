# V19.3 Liquidity/Solvency and failure paths — foundation implementation record

## Status

`FOUNDATION_IMPLEMENTED_UNVERIFIED`. V19.3's ordinary V19.2 dependency remains
unchanged in repository status; this candidate supplies only pure-Core evidence
and does not authorize a downstream implementation.

## Implemented scope

- Caller-supplied exact required-reserve and required-capital facts derive
  reserve and capital shortfalls without choosing any ratio or formula.
- ELA requires a positive liquidity shortfall, eligible collateral, and
  facility capacity. It updates matched reserve/loan/borrowing traces, never
  equity.
- A capital shortfall or negative equity rejects ELA: liquidity assistance
  cannot repair insolvency or erase negative equity.
- Focused vectors cover forged, stale, mixed, duplicate, cross-bank,
  cross-currency, insufficient collateral/deposit/security, NPL-bound, and
  negative-equity failure paths plus deterministic replay evidence.

## Non-implemented authority

This candidate does not implement recapitalisation, resolution, default,
interest accrual, maturity, haircut calculation, approval resolution,
authoritative idempotency, write transactions, recovery, or any production
surface. Those are later-package / authoritative-writer responsibilities.

## Next action

Run no mainline or product promotion from this record. Freeze the exact commit,
push the branch, and obtain independent review before any subsequent action.
