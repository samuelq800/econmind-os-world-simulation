# Browser financial-intake WIP and public-export blocker

2026-10-07 Asia/Shanghai. **IN_PROGRESS — browser FAIL; not review/merge ready.**
No production authority, Gate B, deployment, acceptance or gameplay completion.

Branch `codex/d-browser-financial-intake`; checkout
`/Users/samuel/Documents/econclub/.econmind-worktrees/d-browser-financial-intake`.
Integration parent `ff3c26d` inherits fixed G
`df48568837a50961dc2f8bb78d9d64544e25a06e`, then D84 readout and D004 denial repair
as normal cherry-picks. Original D/G candidate branches and evidence are intact.
G's intake rollback remediation and separate public subpath are still upstream
dependencies. This browser delta does not repair or activate their backend.

## Owned implementation

New `apps/world-web/src/financial-intake/{transport,controller,view}.ts`, dedicated
`tests/world-web/financial-intake*`, this report and two additive entry mount lines.
No Core/API/Worker/public/map/economic DTO/schema/parser/migration/production data
or global style edit. The country HOME's original facilities/forms remain.

Transport implements the frozen public `AuthenticatedFinancialIntakeClientPort`;
consumes schema/path/actions from `@econmind/core`. Contract source SHA256 is
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

Signature, reference, pending/queued/executing and intake-reported FINAL remain
distinct. Only the existing original FINAL lookup and minimum-head projection
refresh produce FINAL_VERIFIED. D004's DENIED from that read also retires the
financial consumer. Confirmed FINAL stops subsequent writes. Economic values
remain net Posting movement, not spendable/opening-inclusive balances. G's new
COUNTRY visibility/opening-inclusive DTO is not consumed or fabricated.

## Actual local evidence and blocking browser failure

Pinned Node24.20.0 / TS6.0.3; local own cache and own workspace exports.
Selected six test files: **182 PASS** (28 new consumer tests +154 inherited
read/runtime/architecture). Tests use the real existing API staged parser and
real ProductionReadClient with client-local OFFLINE TEST_ONLY transport.
The browser harness itself imports no server parser/API module. Browser test
identifiers and transport replies are never production binding or settlement.

Web/scoped test typecheck, scoped lint/format, canonical boundary267,
authoritative patterns262/core76, secret2049 and immutable publication
288/75derived/70countries/140maps PASS. Initial WIP compile/lint errors were fixed,
not ignored. The Vite bundle build passed with copyPublicDir:false to avoid
another large immutable public-asset copy; it is NOT a full published site build.
Existing CSS/large-chunk warnings remain.

**Actual browser FAIL:** Core's root public barrel eagerly imports
`serialization/canonical.js` and `node:util`. Vite loopback browser module load
throws “Cannot access node:util.types in client code”; Transfer orders never
mounts. The production bundle tree-shakes that unused dependency (no matching
node-util/canonical symbols found in emitted JS), but this is not promoted to
browser PASS. Root has assigned G a separate, pure browser-safe public subpath
export pointing to the same frozen contract, without changing its hash.
No D Core edit, root-barrel fallback, source-path bypass, copied DTO or new parser.
After fixed export delivery, only lawful imports change before fresh actual
browser verification. The new interactive slice is not yet deliverable.

Evidence:
`/Users/samuel/Documents/econclub/.econmind-artifacts/d-browser-financial-intake-20261007/`:
`local-tests.log`, `browser-failure.json`, `browser-failure.png`, `bundle/`.
Temporary TEST_ONLY4184 is stopped. Original4178 DEMO and fixed84 unbound4182
visual preview remain unchanged; neither gains a new financial binding.

Disk incident: shared disk reached116Mi free and one apply_patch write failed.
Only D's ignored, unserved `d-read-denied-repair/apps/world-web/dist` (350MB)
was removed after exact-path/directory/git-ignore checks. It is reproducible from
fixed004 with the recorded Vite command. Fixed commits, logs/screenshots/evidence,
original preview output and other checkouts were not removed or modified.

NOT_RUN: successful browser intake loop, actual HTTPS host/signed session token/
seat/admission/ActorDirectory/Clock/publisher, production commands/FINAL,
database runtime, independent review, merge/release, full workspace/420 audit.
