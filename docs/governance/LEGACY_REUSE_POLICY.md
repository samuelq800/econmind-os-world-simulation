# EconMind World V2 legacy reuse policy

## Authority and purpose

This is planning guidance for future engine work. EconMind World V2 / Season 1
is not an incremental implementation of the legacy EconMind World runtime. The
legacy repository is reference material only; the V2 Constitution, approved
ADRs, R2 ownership contracts and versioned V2 packages remain authoritative.
This policy does not approve a value, formula, model, schema, runtime behavior
or production change.

Every proposed reuse must retain source provenance and be classified before it
enters a V2 work package.

## GREEN — reference or reuse after provenance check

- data-source registries and external observed datasets;
- variable definitions and dictionaries;
- economic literature and source classifications;
- calibration taxonomy and country-archetype research concepts;
- generic statistical algorithms and trade-network calibration methods.

GREEN means the source may inform V2 work after provenance/licensing and data
fitness checks. It does not make legacy outputs authoritative.

## YELLOW — redesign and independently validate

- numerical parameter values and elasticity assumptions;
- trade matrices, market baselines and country archetypes;
- trade-route and settlement-state ideas;
- economic formulas, market structures and calibration assumptions.

YELLOW material requires an explicit V2 design, source justification, exact
arithmetic/conservation treatment where applicable, package-scoped tests and
independent review. It must not be copied merely because an implementation
already exists.

## RED — do not copy into V2 authority

- the legacy engine runtime or authoritative state model;
- direct macro-state mutation, macro buffs or hidden country bonuses;
- legacy transaction/settlement implementations;
- legacy database schemas or migrations;
- hard-coded 12-country assumptions;
- floating or tolerance-based authoritative money, quantity or conservation;
- UI direct mutation of authoritative state;
- legacy Event, Ledger or state truth;
- formulas that bypass V2 Ledger/Event/Command architecture.

RED material may be studied to identify hazards, but its implementation or
state cannot become V2 authority.

## Review firewall

Any uncertain item defaults to YELLOW. Promotion from YELLOW to an executable
V2 contract requires the owning package and ADR/gate process; this note cannot
grant it. No legacy asset is permitted to bypass V07 Command/Event/receipt and
replay facts, V08 Ledger/Posting ownership, or the future V09 atomic writer.
