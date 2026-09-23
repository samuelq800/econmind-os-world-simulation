# V21 composed pure-Core foundation candidate

The candidate combines A's V21.1 order book (`0c7ed26236ce4a25b5252c77c9609a60502dbddc`),
E's V21.2–V21.3 trade logistics (`509ceabfbd081237efbf97475af7721378edbb73`),
E's fill-to-eligibility bridge (`02c1da1216f7cb1ddc10de3639af6adb6deaa603`),
and Control Tower review remediations recorded in the V21.1 and V21.2
reports.

The remediations make runtime discriminators fail closed, bind customs
assessment to the same request, countries, commodity and permitted quantity,
and expire unmatched orders at the supplied replay snapshot. The bridge
turns a caller-attested order fill into a trade eligibility request; it does
not create a durable order, quota reservation, customs collection or shipment.

Local combined check: pinned Node 24.20.0 / pnpm 12.3.4; focused V20+V21
tests 3 files / 18 tests PASS; Core typecheck and build PASS; diff check PASS.
The original A/E candidate evidence remains attached to its own immutable
SHAs. This composed branch still needs an independent narrow review before
nonproduction owner acceptance or main merge.

A read-only independent narrow review of the first composed tip found P0=0
and three Major issues: exporter controls were bypassed by the import-side
bridge, event times could exceed the replay snapshot, and capacity consumption
was omitted from shipment replay output. This candidate now checks both import
and export controls, bounds trade/customs/shipment times to the snapshot, and
binds port/rail/storage consumption in the replay output. The added adverse
vectors pass locally. Independent closure review remains pending.

V10.4 product integration, authoritative inventory and financial posting,
database/RLS, Command/Event/receipt, UI, Gate B, and production remain outside
this candidate. Repository status files are unchanged.
