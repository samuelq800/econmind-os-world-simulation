# V21.2 Foundation Implementation

## Disposition

`FOUNDATION_IMPLEMENTED_UNVERIFIED`. This pure Core candidate is not evidence
that V21.1/V10.4 has integrated, nor permission to advance an authoritative
workflow or Gate.

## Implemented surface

`trade-logistics-foundation.ts` exports `resolveTradeEligibility` and
`assessCustomsTariff`. The resolver reads immutable fact evidence and enforces
sanction/ban first, concrete quota/cap headroom second, then treaty/bilateral/
general tariff precedence. Customs calculates an exact ad-valorem amount and
rejects a caller-scoped assessment reference already recorded as collected.

No quota is reserved, tariff is posted, order/contract created, payment taken,
shipment created, or inventory changed.

`deriveTradeEligibilityRequestFromOrderBookFill` is the sole V21.1 bridge. It
maps a provenance-bound structural `BookFill` subset from buyer/seller to an
importer/exporter request and replay proof; it neither imports V21.1 nor makes
an authoritative order or contract.
