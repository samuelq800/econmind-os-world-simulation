# V27 to V29 — existing-data seed closure preparation

## Gate and scope

Branch: `codex/v29-existing-data-closure`, based on `origin/main`
`0fa8da7e74488f4554185afb68c19b4933d72586`.

This is a P0-sensitive `PREPARATION_ONLY` data-boundary slice. It does not
create an OpeningSeed, select economic parameters, authorize fictional-country
mapping, change World/Season configuration, update a Gate, or connect to a
worker, database, Supabase or production runtime. A is responsible for worker
composition; this branch owns only pure Core opening/calibration preparation,
focused tests and evidence.

## Existing-data authority

The only identified frozen calibration source is branch
`codex/world-data-calibration` at
`abbcdc5c86279227627d30d13952fdadda96737b`. Its own artifacts classify the
dataset as `PILOT_NON_AUTHORITATIVE_PARTIAL`: 247 observations for 10 empirical
entities and 10 variables over 2021–2023, with WTO not fetched, zero admitted
features, no fictional-country mapping authorization, no final generator and
seven open handoff gates. Those facts cannot be reinterpreted as 70 fictional
countries or as final economic parameters.

## Deliverable

Add a strict, pure closure preflight under `packages/core/src/calibration` and
one hash-bound existing-data inventory under the evidence report. Every
reported count must identify the frozen artifact from which it came. Every
V27.1/V27.2 source, if supplied later, must match a declared artifact locator
and digest exactly. The preflight reparses V27.1, revalidates V27.2 and reuses
the reviewed provenance/calibration adapter; it reports explicit issues for
missing inputs, open external-data gates, provider gaps, unbound source bytes
and unavailable provenance/calibration links.

Output always keeps `generationAuthorized: false` and
`openingSeedAuthorized: false`. Even a future traceable input result remains a
preparation result requiring independent review and the existing V08
OpeningSeed/reconciliation boundary.

## Verification and honest stop

Run focused V27/V29 tests, Core typecheck/build, targeted lint/format, boundary
and authoritative-pattern scans, safe-local environment, foundation policy,
secret scan and diff checks. Verify inventory hashes from the immutable source
commit with `git show <sha>:<path>` rather than trusting the adjacent checkout.

Actual 70-country provenance/calibration values, fictional-country mapping,
missingness/archetype policy, WTO retrieval, vintage stability, sector/trade
reconciliation, source-owner approval, OpeningSeed conversion, worker wiring,
database writes, independent P0 review, V29 long-run execution and Gate changes
remain `NOT_RUN` or unavailable.
