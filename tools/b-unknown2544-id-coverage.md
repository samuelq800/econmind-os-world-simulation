# B original-ID coverage diagnostics

Offline adjunct to the already conditionally adopted closure guard, not another
closure engine. Never authenticates facts, independent review, human adoption or
runtime authority. No imports from Core/API/Worker/Web; no writes or network.

Run pinned Node 24.20.0 directly (no dependency install or package setup):

```text
node --test tools/b-unknown2544-id-coverage.test.mjs
node tools/b-unknown2544-id-coverage.mjs CONFIG.json
```

CLI prints diagnostic JSON to stdout; caller controls any saved output. Config:

```json
{
  "ledgerPath": "/absolute/UNKNOWN_LEDGER.json",
  "batchesPath": "/absolute/execution_batches.json",
  "registerPath": "/absolute/closure-register.json",
  "deliveries": [
    {
      "label": "G-frozen-offline-candidate",
      "path": "/absolute/CLAIM_CANDIDATE_V1.json",
      "sha256": "exact-independent-reviewed-64-hex-sha256",
      "rowsPointer": "/fieldMappings",
      "batchIds": ["B01", "B05", "B09", "B14", "B15", "B17"]
    }
  ]
}
```

Original ledger/17-batch plan/historical register byte pins are hardcoded. Actual
source files are read only from the pinned ledger's source references, bounded,
hashed before JSON parsing, then dereferenced with RFC6901 own-property rules.
No recursive source recovery. Original ID grammar/composite uniqueness, original
acceptance rules, full disjoint batch partition/root causes, exact register ID
coverage and source-leaf equality are structural checks, not field completion.

Every selected delivery must map its explicitly declared complete original batch
scope without duplicate/foreign/missing IDs. Existing original metadata, if
present, must match. The four stage flags must be booleans; they are reported
claims, never authenticated decisions. There is no false stage-prefix rule:
engineering may be prepared before source completion. Even all four producer
flags true or a stored CLOSED register cannot establish current acceptance.

Per-ID records preserve original standard, category, source and stage mentions.
Overlapping deliveries/versions are counted once for coverage; not mapped in the
selected artifacts means only that, not proof no code/work exists. STARTED,
merged infrastructure and supporting facts do not create implicit per-ID credit.
Current semantic closure counts and independently accepted stages remain null;
originalClosuresAuthorized is always zero. Root alone accepts/counts closures
after separate source/semantic/engineering evidence. This validator itself also
requires independent Root/E review; B cannot approve it.

Use an explicit per-row `stagesPointer` (for example `/phases`) when those four
flags are nested. Default is the row itself. Never infer flags from code-progress
or test labels such as `candidateEngineering` or from STARTED records.

CLI stops nonzero on pin/structural failure and emits no success report. The pure
auditDocuments export supports finite small fixtures; it does not authenticate
caller objects. New baseline/register versions require a new explicitly frozen
tool/input review, not replacing old negative/FAIL/SKIP evidence.
