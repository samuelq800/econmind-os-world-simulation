# Local six-office preview

Status: IMPLEMENTED_UNVERIFIED. Local preview only; not independent acceptance,
Gate B, a production release, or an authoritative World execution loop.

Open http://127.0.0.1:4178/local-demo/ on this computer.

## Launch

From this checkout, with the repository-pinned Node 24.20.0:

```sh
node scripts/local-demo-server.mjs 4178
node --test scripts/local-demo.test.mjs
```

The server binds only 127.0.0.1 and serves only `/local-demo/`. No package
installation, build, Supabase configuration, login, seat or worker is needed.
If the port is occupied, choose another port; the server never kills a process.
Stop your foreground launch with Ctrl-C.

For the delivered session on 2026-10-07: PID 23266, terminal session 12053.
Stop only that process with `kill 23266` after confirming its identity. The
service has deliberately been left running for the user.

## What to try

Choose one of 70 countries and six offices. Country home retains the original
country art, local facilities, source drawers and role-specific tools. World map
uses the original terrain and all 70 territory paths; click a country or use the
country selector. Fit world, regional fit and zoom affect display only.

Office actions retains all 120 original modules and their existing configure,
review and results pages. Playable scenes opens the original three sample
missions per role. Demo log records local operations. Next demo event manually
advances the sample state, not the official World clock. Reset this demo clears
only the selected country's selected office demo state; the audit log remains.

Country HOME figures are static opening-source facts. Scene accounts and
outcomes are separate sample fixtures, not forecasts or current country state.
Country allocations record a local demo intent only; they do not alter the
source facilities or claim an official execution result.

## Boundary

Only `public/local-demo/`, `scripts/local-demo*` and this document are new.
Original six-office source, publication hashes, country JSON, geometry, core,
backend, migrations and governance status are untouched.

The local server serves narrowly derived copies of four existing scripts:
game storage uses a DEMO_LOCAL namespace; the final country module guard and
trusted production runtime mount are omitted only in the served demo copies;
the language preference has a separate namespace. Static reader validation is
retained. No global fetch interception or fake production API exists. CSP
allows same-origin connections only, and HTTP mutation methods return 405.

## Checks and evidence

- PASS: four Node tests, including availability of all 70 country JSON/scene/
  detail assets, 70 source territory geometries, map-fit bounds, original 120
  modules/six offices, local namespace and route boundaries.
- PASS: scoped script ESLint, scoped Prettier check, JavaScript syntax checks,
  authoritative-pattern scan and diff whitespace check. HTTP GET 200, mutation
  method 405 and non-demo route 404 checked against the running server.
- PASS: real browser country/role switches, original Captain form, Captain
  allocation recording, Finance bond book/allocation/issue, Bank collateral/
  loan, Industry expansion, Trade packing/shipment, Social clinic, event step
  and Social reset. All six operations appeared in the parent demo log.
- PASS: full world map renders 70 territories; country 70 regional fit; 1280px
  normal viewport and 960px map sample; screenshots saved below.
- PARTIAL: form configure/review/results sampling. Captain configure inspected;
  Social and Finance traversed during the batch; Bank reached Review. The batch
  stopped on browser timeout. No claim that all 120 forms were clicked.
- NOT_RUN: full 420 country-office visual matrix, all 18 scene workflows,
  all parameter combinations, full workspace build/typecheck/regression suite,
  production connection, deployment, Gate B and independent review.
- Boundary check could not establish workspace imports when using the existing
  dependency directory from another worktree: unresolved/cross-checkout core
  and worker declarations. This is not recorded as PASS. The preview uses only
  native Node and unchanged public assets, with no workspace package imports.
- Known UI backlog: original English translation leaves mixed-language strings
  in several sample scenes and some source-generated facility names. This
  preview preserves that source UI; complete English localization remains open.

Evidence directory:
`/Users/samuel/Documents/econclub/.econmind-artifacts/d-local-demo-20261007/`

Screenshots: `01-world-map.png`, `02-country70-neighbours.png`,
`03-map-960px.png`, `04-captain-home.png`, plus the final demo action log.

Base: `e326a923d6b51b05583558be48a7ce1f80c37828` (current main at setup).
Branch: `codex/d-local-demo`.
