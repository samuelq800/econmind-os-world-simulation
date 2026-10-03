# Fixed official-source audit continuation

Scope: P2 audit adapter candidate; no Edge, original checker, DTO, schema,
migration, data, economic authority or original FAIL report changes.
Review/merge and further production authorization remain Root-owned.

## Fixed evidence, not a general resume facility

`scripts/official-source-resume-audit.mjs` pins one original audit's
`inputs.json`, `readback.json`, `REPORT.md`, original checker file and selected
source manifest SHA-256. It rejects byte changes before network binding. The
registry must exactly match the original inputs; no host, route, dataset selector,
arbitrary skip, numeric parser, bounds override or bypass-validation flag exists.

Original hashes:

- Inputs: `9a307091c07f4a84ca6655a1b356cd61ca27b27d594d375844f5b51ebc36b47a`.
- Ledger: `745e6485ebfde6cd83ca2d20abeffde54d9aed0dfc3ba1d817d1d6699d1e0ed9`.
- Report: `681c866179e6727822d60fa5a0ba50fb8dbf521ef41743933f37488de86aad77`.
- Unchanged checker: `16425fc88ddf85ff784e3e64a574a45f3cf1da8e18fe05da2bc3dfca0610ca15`.
- Selected source manifest: `88dd44478f97d2e8893a4f11b3aaf96e256bdb13248aca0d08f097fabe10d315`.

Reader-v2 source World SHA is fixed to
`0ec30a28d19f4ae51d81edad42d0598c356dc127`, function tree
`28d7ba3e102a7b4efb5cbb74088ed2a0f85f5d5b`. CLI checks both that commit and
the current checkout's function tree, plus absence of function-directory changes.
The adapter checksum and actual checkout SHA are added to the output report.
The source World SHA is not misrepresented as the adapter's later commit SHA.

## Group boundary and unchanged verification

Historical catalog + first 12 dataset groups remain HISTORICAL_ONLY, linked to
their original ledger hash, source checksums and earlier function/release/root
identity. They are not called again, relabeled new-version verified, returned as
fake HTTP bodies, or used to turn the original audit FAIL into PASS.

The new traversal is fixed to 303 previously unfinished logical groups:

- whole failed geography group, all native sections/pages/hashed fragments;
- later 21 datasets, in frozen registry order;
- dedicated country list and all 70 exact country detail DTOs;
- all 210 country associations for regions, changes and seasonal-water.

These use the original exports `reconstructOfficialDataset`,
`verifyOfficialCountryConnection` and `verifyOfficialRegionAssociations` without
edits. Exact complete received trees are compared to the original locally
hash-verified lossless trees; population arithmetic, unit/nature/hash metadata,
fragment hashes and actual returned-length cursor rules are unchanged.

`changes` was already an exact-tree-verified historical group. Its locally
hash-verified original tree supplies only the comparison basis for the newly
received country-filtered changes pages. This is explicitly labeled in the
report; no new unfiltered changes response is invented. Regions and seasonal-water
come from the new complete received/reconstructed trees.

The requester retains its fixed Supabase endpoint and original
`https://samuelq800.github.io` Origin, GET/credential-omit/redirect-error/no-store,
1,000 requests / 600,000 ms total / 30,000 ms per request / 256,000 response bytes,
no retries or fallback. The adapter has no arbitrary-origin flag. Root must
authorize the precise continuation transport separately; the completed
custom-domain probe does not itself authorize this later traversal.

## Two distinct authorizations

1. Release succeeded and Root explicitly authorizes the failed-route page probe.
2. Only after the probe succeeds, adapter review/merge and separate Root resume
   authorization may the fixed remaining-group traversal execute.

Authority references acknowledge external human decisions; they cannot grant
approval, prove a deployment by themselves or permit rerunning a used one-shot
authorization. Default planning never binds fetch. Fixture histories/receipts
cannot enter authorized production execution. A production resume requires
original-byte-verified history and a digest-verified actual successful probe
receipt for this same source World/function tree/checker/release, with exactly
one request and a different Root authorization reference from the resume.

The output directory must be new and created exclusively. Final `report.json`
is written with `wx`; old evidence cannot be overwritten. The append-only
`progress.jsonl` contains compact request/group checkpoints (received byte hashes,
actual headers/statuses, IDs and state), not raw response bodies or repeated
full reports. On failure the traversal stops; remaining groups stay NOT_RUN.
No retry of the audit is implied by a failure. Missing final evidence or process
interruption is INCOMPLETE, not success; inspect the checkpoints.

## Completed authorized page probe — not group closure

Root authorization `CT-GEOGRAPHY-PHYSICAL50-PROBE-READER-V2-V1` was used once,
with explicit Origin `https://world.econmind.group`, no credentials, redirect
error, 30-second timeout and 256,000-byte cap. No other route or retry occurred.

Actual Shanghai time: 2026-10-04 00:25:57.459–00:25:59.908.
HTTP 200; ACAO `https://world.econmind.group`; Vary `Accept-Encoding, Origin`;
Cache-Control `no-store`; content type JSON. Elapsed 2,449.308 ms.
Response: 5,172 bytes, SHA-256
`5faefc2b03e066af1fc13b5be72b1d051666f53ae83f557adc024c5b58f34f2c`,
identical to the fixed offline physical50 response. Source declaration:
8,441,668 bytes / geography SHA
`c1a3d521ae91b37845f764be4ede73d522bc6958be90f4676ad5a19395b26a35`.
The 28 returned rows (total 78, offset 50, nextOffset null) exactly match local
lossless original physical entries. Numeric encoding, nature, units and non-live
semantics passed. This is DTO/source-identity evidence, not remote raw-byte hashing.

Durable actual probe report:
`/Users/samuel/Documents/econclub/artifacts/a-physical50-probe-v2.s0ILon/report.json`,
SHA-256 `2fced60d6f86fd9e18862d52c1462ae636512172424bfeadfb78da78909182f0`.
Runner SHA `24022fd25609633d5dcda6dcf66f79ba6fb7f9de7beda899e75204c8e719cf94`.
E update receipt is bound by SHA
`8ee2b96bed1281b762b6758ced4ad3cdb721e7971f8e43b223b74dd0e770303d`,
run `37136193366`. Original FAIL and historical HTTP 546 cause UNKNOWN remain.
Production full geography / remaining-group resume: NOT_RUN.

Do NOT invoke `--probe` again with that used authorization. Its retained CLI
phase is fixture-tested and requires a new explicit Root one-shot permission
if a future probe is ever needed; it uses the unchanged checker's Pages Origin.

## Invocation after approval (not an authorization to execute)

Planning only, no output writes or production GET:

```sh
node scripts/official-source-resume-audit.mjs --plan \
  --original-dir /Users/samuel/Documents/econclub/artifacts/a-official-all-data-readback.IQpPxx
```

Only after Root approves this candidate and separately supplies `RESUME_ROOT_REF`,
use an absolute, new, not-yet-existing output directory in place of `NEW_OUTPUT`:

```sh
node scripts/official-source-resume-audit.mjs --resume \
  --original-dir /Users/samuel/Documents/econclub/artifacts/a-official-all-data-readback.IQpPxx \
  --probe-report /Users/samuel/Documents/econclub/artifacts/a-physical50-probe-v2.s0ILon/report.json \
  --probe-sha256 2fced60d6f86fd9e18862d52c1462ae636512172424bfeadfb78da78909182f0 \
  --release-go github:econmind-os/actions/runs/37136193366 \
  --root-authorization RESUME_ROOT_REF --output NEW_OUTPUT
```

Maximum success status: `MIXED_VERSION_ALL_GROUPS_EVIDENCED`, with
`sameVersionFullPass=false`. Failure/unexecuted plan: `INCOMPLETE`. Fixtures
always have `fixtureEvidenceOnly=true`, `remoteGetPerformed=false`; they are
never production acceptance evidence. No Pages config, DB, worker, opening seed,
commands, extra53 artifacts, map-files or Gate B activation is covered.

## Verification

Eight normal offline tests cover fixed selection/history separation, CLI and
hash guards, exact one-page probe, normal wire/precision/nature/cursor failure,
one complete remaining-group fixture traversal using canonical Edge DTOs,
stop-on-cursor-failure, and matching probe/release/separate-authority binding.
Synthetic orchestration documents in tests are labeled fixtures and fail the
production original-byte guard. No skipped HTTP response is manufactured.

Local focused Vitest: 8 passed, exit 0. Scoped ESLint, formatting, syntax and
diff checks are recorded with the handoff. The dedicated offline workflow runs
only this file, lint and formatting on pinned Node 24.20.0 / pnpm 12.3.4, frozen
lockfile, no production credentials or network calls to the function. Actual CI
result is reported separately; no full/840 suite or original cache re-review.
