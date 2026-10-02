# Root map official-source connection status

Status: `IMPLEMENTED_UNVERIFIED`; P2 non-authoritative integration, pending root review.
Map/navigation base: `85725830f0a6d102e73ae89697ab008f92208285` (includes F navigation).
Toolchain: Node 24.20.0, pnpm 12.3.4; frozen install.

The root React country map receives a compact, keyboard-accessible disclosure.
It reuses only `WORLD_OFFICIAL_READ_BASE_URL` →
`window.__ECONMIND_WORLD_READ_CONFIG__.apiBaseUrl`, injected into generated root
and immersive HTML by the existing postbuild script. Missing configuration
remains `NOT_CONFIGURED` and sends no request. Invalid configuration fails closed.
A legal configuration makes one credential-free GET to
`/v1/world-data/datasets` per mounted session, with no retry or polling. The
five-second limit, bounded body reader and retired-session handling prevent late
responses from promoting an abandoned or timed-out session.

The browser-safe registry pins all 34 selected JSON identities, paths, hashes,
byte counts and kinds from package `BALANCED_2026_09_28_V1`; its selection checksum
is `88dd44478f97d2e8893a4f11b3aaf96e256bdb13248aca0d08f097fabe10d315`.
Verification uses the actual Edge metadata envelope contract. Browser code does
not import the server registry or read economic rows. States are
`NOT_CONFIGURED`, `LOADING`, `SELECTED_SOURCE_CATALOG_VERIFIED`, and `UNAVAILABLE`.

Visible language identifies this as selected-source catalog verification and
explicitly distinguishes it from complete raw-byte verification, economic-state
refresh and an activated World. Existing map numbers retain their static source.
Six optional public role-page links preserve the currently selected country;
missing country explicitly uses 01 and malformed country disables those links.
The existing ◈ source control on each role page opens the dossiers. Navigation
provides no seat, identity, Command or execution authority.

## Local checks

- Config/catalog/view suite: 65 tests PASS, including 44 new status tests.
- Combined page configuration, full-data, world-read, explorer, F navigation and
  G status suite: 150 tests PASS.
- Existing six-role metric/provenance suite: 23 tests PASS.
- Existing atlas, public preview and visual-integrity suite: 56 tests PASS.
- App build/typecheck and three focused test typechecks: PASS.
- Changed-file ESLint, Prettier and `git diff --check`: PASS.
- Boundary scan (233 files), safe local environment, secret scan (1,895 files),
  selected UI publication consistency: PASS. Historical source remains 288
  files; 75 derived files and two shared-visual integration files are valid.
- Static build completed with `NOT_CONFIGURED`, `liveWorldState: false`.

[Local browser samples](LOCAL_BROWSER_SAMPLES.json) record five actual Chromium
pages: desktop unconfigured, desktop verified, mobile verified, mobile wrong
hash, and mobile HTTP failure. The HTTP catalog reply was intercepted using the
actual local Edge handler DTO, with an economic-query stub that throws. The
existing postbuild config function injected a fake `.example` endpoint into the
served generated root HTML. Every configured page sent exactly one GET;
unconfigured sent zero. Loading state, keyboard disclosure, six country links,
current-country focus refresh, normal-flow layout and no horizontal overflow
passed. Desktop 1440×900 and mobile 390×844 screenshots were visually inspected.
No unexpected remote requests or browser errors occurred. These are bounded
local samples, not C's 420-combination audit or a production endpoint check.

The existing page-config workflow retains all A/D/F commands and adds only G's
two tests, focused typecheck/lint/format and relevant file paths. No deployment,
secret, toolchain pin, immutable source, database, backend or economic behavior
is changed. Root review, production metadata connectivity, all-34 raw-byte
verification, database activation and live economic state are unverified.
