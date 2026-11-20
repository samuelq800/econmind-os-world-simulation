# Postwar operating genesis

This workflow prepares a **new** fictional world from the selected 70-country,
122-region source. It preserves country resources, people and original GCU
financial values. It does not reset an existing world, sign an admission,
post wages/benefits/rent, start World/Clock, or deploy a service.

The policy adoption instruction is the project owner's message
`Sentinel_a619bdbe25588191aa05709db76c7567` at
`2026-10-28T14:27:54.000Z`. Generated wages, queues, housing rights, public
safety, missing-domain physical endowments and utility operating assumptions
carry `GENERATED_POLICY` provenance. They are distinct from selected-source
observations. This is not a P0 review approval or a cryptographic signature.

## Reproduce a candidate

Use the pinned Node and pnpm versions in `package.json` and the frozen lockfile:

```sh
pnpm install --frozen-lockfile
pnpm genesis:prepare --world WORLD_PREPARATION_POSTWAR_V1 --seed SEED_PREPARATION_POSTWAR_V1 --value-date 2026-10-28 --out /tmp/postwar-candidate-new
```

The output directory must not exist. The command creates a disposable in-memory
Postgres-compatible preparation database solely to observe that its isolated
scope is empty; it never obtains a production connection. It writes the complete
canonical seed, the adopted carrier, the actual owner-instruction/adoption
records and a receipt. `PROJECT_ADOPTED_NOT_ADMITTED` is the expected successful
preparation status. The production target must be observed again under the
existing publication/bootstrap locks.

Run the same inputs into a second new directory and compare `seedFingerprint`.
The seed contains source identities, the original financial lineage, finite
supplementary stock, policy documents, complete Core employment state, bounded
person/household allocations and future unpaid obligations. No service history
or payment is invented by preparing an opening.

## Validate and connect

```sh
pnpm check
pnpm connections:plan
```

`pnpm check` includes lint, formatting, type checks, the applicable test suite,
architecture boundaries, migration rehearsal, secret checks and builds. A skipped
test remains skipped. Run the explicit native Postgres evidence procedures in
`tools/office-connection` separately; their fixtures are isolated evidence, not
production admission.

The server-only runtime readers require the actual request's verified subject,
current seat, role, organization/country capability and private entitlement,
immutable admission, complete canonical seed and coherent durable ledger. Their
SQL transaction is stable and read only. They recheck authority before returning.
They do not return a whole-world private source to a country client. H0-only
readers reject advanced heads until the corresponding event replay is supported.

The V3 fixed-file incoming manifest pins `incoming/operating/final-seed.json`
in addition to the original V2 financial package. That file uses a bounded
Brotli transport envelope with decoded byte count and checksum; the canonical
seed and its source pointers remain unchanged. Publication re-runs the
original financial producer and verifies that the complete operating seed extends
that exact financial lineage with the same finite supplies and operating source.
Signed publication authorization must name the **final** seed fingerprint and
source-bundle digest. An earlier financial-only signature cannot be reused.
Existing admission, role, team, facility, resource and operating-authority gates
remain separate checks; policy generation does not discharge them by name.

## Release boundary

Use the repository's existing reviewed migration/admission/deployment chain and
provide its actual role configuration, retained owner signatures and target
identity. Preparing a candidate does not install that chain. Check the final
commit's native database, permission, restart, API and browser evidence before
publishing. Never count a static site or development URL as a production API.
The current engineering branch is not a merge approval.

Retain the previous deployment and immutable seed. Roll back a service deployment
through the existing deployment provider; do not delete canonical events or
replace an already initialized world's seed. Correct an initialized state only
through authorized append-only operations.
