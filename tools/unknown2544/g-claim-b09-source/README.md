# Four B09 source associations

This offline packet projects only the four original `actualLegalHolderIssuer`
IDs. It consumes the existing six-source claim compiler, E's fixed unadopted
comparison, D48's exact leaf selections, and their original paired-position
document. Every document is byte pinned before use. All 48 leaf values are
dereferenced; the eight positions are joined to four instruments with opposite
asset/liability owners, counterparties, equal native amounts and currencies.
Book amounts and source dates retain their separate meanings.

The output preserves each original `REGISTER` value as null and identifies the
source-owned legal-title/adoption/opening evidence still needed. Its four
principals and eight registrations are candidate associations. It issues no
title, account, adoption, payment, seed or runtime artifact. The existing
authoritative writer is never called. The pure relation helpers are exported
for counterexamples and cannot bypass the producer's fixed source pins.

Run the focused source audit with pinned Node 24.20.0, specifying:

- `G_CLAIM_SOURCE_CONFIG`: the existing six-key source-path JSON used by
  `tools/g-claim-source-candidate.mjs`.
- `G_CLAIM_COMPARISON_SOURCE`: E's fixed `PARAMETER_CANDIDATES.json`.
- `G_CLAIM_SUPPORT_CONFIG`: JSON containing only `d48` and `positions` file paths.

Then run `node --test tools/unknown2544/g-claim-b09-source/produce.test.mjs`.
`produceB09Packet` returns the review packet for an explicitly chosen new
artifact path; it performs no filesystem write. The test is an opt-in local
source audit requiring those immutable input files, not a portable CI fixture.
No original field closure or global completion count follows from its passing.
