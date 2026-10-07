# Browser financial-intake candidate with safe public export

2026-10-07 Asia/Shanghai. **IMPLEMENTED_UNVERIFIED — independent review required.**
No production authority, Gate B, deployment, acceptance or gameplay completion.

Branch `codex/d-browser-financial-intake`; checkout
`/Users/samuel/Documents/econclub/.econmind-worktrees/d-browser-financial-intake`.
Integration parent `ff3c26d` inherits fixed G
`df48568837a50961dc2f8bb78d9d64544e25a06e`, then D84 readout and D004 denial repair
as normal cherry-picks. Original D/G candidate branches and evidence are intact.
G's intake rollback remediation remains a separate upstream dependency. This
browser delta does not repair or activate the backend. G's fixed public export
`e92dc1db8d62968f186f08662d2052616115409b` was then normally cherry-picked as
`c5d2049557070cfee35ab27ad545ff943061119e`; its package change/test/report remain
G-owned, not mixed into D's source fix. Original WIP9e and failure evidence remain.

## Owned implementation

New `apps/world-web/src/financial-intake/{transport,controller,view}.ts`, dedicated
`tests/world-web/financial-intake*`, this report and two additive entry mount lines.
No D-authored Core/API/Worker/public/map/economic DTO/schema/parser/migration/
production data or global style edit. The country HOME's original facilities/forms
remain. The latest D delta comprises five legitimate public imports plus one
narrow HTTP-denial privacy repair and two regression tests.

Transport implements the frozen public `AuthenticatedFinancialIntakeClientPort`;
consumes schema/path/actions from
`@econmind/core/authenticated-financial-intake-contract`. Contract source SHA256 is
`889c8cf4c9d22bde9bce9af5612ad56f2bed2774b80a060fa30035249567f985`.
Endpoint HTTPS origin, exact `/v1/financial-intake` and deployment provenance
must be supplied explicitly by a trusted host. Session token is current-call
memory only, never URL/storage/VITE/cookies or fixture-derived authority.
No browser signature verification or actor/clock/seat invention.

Connection starts NOT_CONNECTED. Before any host-supplied write, the user must
explicitly INSPECT the original command through the actual configured endpoint,
receive consistent existing read authority and matching original identity,
then review that original action. A capability map or config string alone
cannot enable submit. Server NOT_CONNECTED (including missing actual host,
ActorDirectory/Clock/publisher) leaves it disabled. Four other Offices remain
OFFICE_COMMAND_FAMILY_UNSUPPORTED; only existing Trade/Finance actions are used.

INSPECT uses identity fields only: never commandFingerprint. Original READ or
write bodies are passed intact, not silently sanitized; real server parser owns
action-specific and economic validation. Exact original request/command/key/
intent are snapshotted and reused on explicitly requested retry. UNKNOWN never
automatically replays: inspect original again, review again, then same-body retry.
Nonretryable semantic conflict remains nonretryable after inspection.

An UNKNOWN result wins over assumptions about HTTP status. Authentication denial
retires privacy even if the attempted economic result is still unknown; no
claim of definite rollback. Original identity remains in the host-bound closure
for recovery, not replaced by a new command. Retired UI exposes no private
request/read/receipt and no executable control. Session/role loss aborts and
fences late completion. Token lookup and transport are bounded, including hosts
ignoring AbortSignal. No automatic reconnect, heartbeat or submit.

Before freeze, the real G route-level denial shape exposed a consumer defect:
HTTP401/403 can carry a fallback requestId before request decoding. Correlation
rejection previously became UNAVAILABLE and retained an earlier private FINAL.
Two real-read/client-local HTTP regressions first FAILED, then PASSED after the
transport remembered the known HTTP denial across body/correlation/error paths.
It retires privacy even with a fallback ID; attempted writes still remain UNKNOWN.
This is not economic rollback evidence or an upstream backend fix. No contract,
DTO, parser, authorization grant or successful-response acceptance was weakened.

Signature, reference, pending/queued/executing and intake-reported FINAL remain
distinct. Only the existing original FINAL lookup and minimum-head projection
refresh produce FINAL_VERIFIED. D004's DENIED from that read also retires the
financial consumer. Confirmed FINAL stops subsequent writes. Economic values
remain net Posting movement, not spendable/opening-inclusive balances. G's new
COUNTRY visibility/opening-inclusive DTO is not consumed or fabricated.

## Actual local evidence and historical browser failure

Pinned Node24.20.0 / TS6.0.3; local own cache and own workspace exports.
Selected seven test files: **186 PASS** (30 new consumer tests +154 inherited
read/runtime/architecture +2 public-export tests). Tests use the real existing API staged parser and
real ProductionReadClient with client-local OFFLINE TEST_ONLY transport.
The browser harness itself imports no server parser/API module. Browser test
identifiers and transport replies are never production binding or settlement.

Web/scoped test typecheck, scoped lint/format, canonical boundary267,
authoritative/secret checks and immutable publication
288/75derived/70countries/140maps PASS. Initial WIP compile/lint errors were fixed,
not ignored. The Vite bundle build passed with copyPublicDir:false to avoid
another large immutable public-asset copy; it is NOT a full published site build.
Existing CSS/large-chunk warnings remain.

**Historical actual browser FAIL at WIP9e:** Core's root public barrel eagerly imports
`serialization/canonical.js` and `node:util`. Vite loopback browser module load
throws “Cannot access node:util.types in client code”; Transfer orders never
mounts. The production bundle tree-shakes that unused dependency (no matching
node-util/canonical symbols found in emitted JS), but this is not promoted to
browser PASS. G's fixed pure subpath points to the same contract; source hash and
package bytes match frozen e92. The export repair changes five D imports, with no source-path
bypass, copied DTO, tolerant parser or root-barrel fallback. The fresh bundle
build no longer reports node:util externalization.

**Fresh actual browser checks after export: PASS within explicit TEST_ONLY scope.**
The live Vite browser now mounts the drawer. Trade inspection still needs review;
queue is not FINAL; original FINAL lookup refreshes to Worldv3 with exact money/
units and disables further writes. UNKNOWN freezes the original and cannot retry
until explicit inspection/review; manual retry uses the original body (also
unit-asserted byte-identical). Finance SIGNATURE_RECORDED is not settlement.
Session revocation clears private request/read/receipt and disables controls.
All four unsupported Offices disable inspection/submit. Fixture console errors
are empty. This is a client-local offline transport, not production proof.

Actual Trade HOME source also mounts the new entry with no fixture/binding:
NOT_CONNECTED, TRUSTED_FINANCIAL_BINDING_MISSING, all executable controls disabled;
existing country illustration, fonts/forms remain. The development-only regional
atlas namespace is unavailable (visible fallback); no map/routing source edit.
This check is not a full built six-role/420/map audit or production connectivity.

Evidence:
`/Users/samuel/Documents/econclub/.econmind-artifacts/d-browser-financial-intake-20261007/`:
`local-tests.log`, `browser-failure.json`, `browser-failure.png`, `bundle/`.
New passing evidence (old failure directory untouched):
`/Users/samuel/Documents/econclub/.econmind-artifacts/d-browser-financial-intake-safe-export-20261007/`:
`local-tests.log`, `bundle-build.log`, `browser-checks.json`,
`route-denial-before.log` (2 FAIL), `route-denial-after.log` (2 PASS),
`final-local-tests.log` (186 PASS), `final-bundle-build.log`,
`final-browser-replay.json` (Trade/Finance/session and actual unbound HOME),
`01-test-only-queued.png`, `02-test-only-final-refresh.png`,
`03-test-only-unknown.png`, `04-test-only-finance-signature.png`,
`05-test-only-revoked.png`, `06-actual-home-unbound.png`,
`07-test-only-final-exact-values.png`, `08-final-actual-home.png`.
Local4184 is retained for the requested actual HOME preview; the TEST_ONLY tab
is closed after checks. No actual host is connected. Original4178 DEMO and fixed84 unbound4182
visual preview remain unchanged; neither gains a new financial binding.

Disk incident: shared disk reached116Mi free and one apply_patch write failed.
Only D's ignored, unserved `d-read-denied-repair/apps/world-web/dist` (350MB)
was removed after exact-path/directory/git-ignore checks. It is reproducible from
fixed004 with the recorded Vite command. Fixed commits, logs/screenshots/evidence,
original preview output and other checkouts were not removed or modified.

NOT_RUN: actual HTTPS host/signed session token/
seat/admission/ActorDirectory/Clock/publisher, production commands/FINAL,
database runtime, independent review, merge/release, full workspace/420 audit.
