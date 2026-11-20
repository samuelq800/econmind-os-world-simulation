# Reproducible catalog scope inventory

Run from the repository with the pinned Node/pnpm toolchain:

```sh
node --test tools/office-connection/scope-inventory.test.mjs
node tools/office-connection/scope-inventory.mjs --out /tmp/office-scope-new.json \
  --evidence-root /workspace/office-connection-evidence \
  --evidence-root /workspace/.cloud-setup/evidence
```

The output is created exclusively; use a fresh filename. This runs no application,
database, browser, SQL, commands, Clock, network or production action.

The existing pinned catalog remains the denominator: 120 module actions, 1126
inputs and 158 result readouts, 1404 items; across 70 countries, 98280 target item
instances. The separate 148 page commands and five dynamic command expressions
are also retained. Every item has its catalog pointer, Office, specification
source IDs, exact generic renderer/selector, file hashes and lexical navigation
references. Renderer discovery is static and does not assert DOM execution.

Each item retains unknown command/API/SQL translation until a reviewed item-level
mapping exists. Per-Office command/API/SQL/test candidates are navigation aids,
not associations inferred from labels. The runtime has actual implementations
that postdate `requirements.json`'s old infrastructure annotations. Those old
annotations are identified as historical and are never used to conclude all
current runtime paths are missing.

The Finance main binder has one HUD control and ten supplemental read-only
slots. Its own mapping declares zero catalog inputs, readouts or actions bound.
This extra surface cannot shrink the catalog denominator or establish that all
modules work. Local catalog values/defaults and local saved drafts are also
distinct from admitted current values and final receipts.

Optional report discovery links actual assertion status counts by full test path,
preserving failures and skips. External JSON is a recorded assertion rather than
unforgeable execution evidence; it requires its own exact source/backend/scope
manifest review. Neither a test file, a lexical test reference nor an old green
report marks an item accepted on the new commit. Reports larger than 4 MiB are
listed as excluded, never interpreted as passing.

The bounded text scan lists explicit mock/fixture/simulation/placeholder and
similar markers with file/line/hash and classifies tests, rehearsal surfaces,
explicit simulation, refusal paths and remaining product-context review. It is
not an exhaustive scan for constants or a claim that every marker is a defect.
Only marker names are exported, without arbitrary source values or credentials.
No marker is promoted into an economic fact. Static prototype
directories, generated assets/dist and country bundles are excluded from this
navigation scan; the original pinned catalog denominator is not excluded.

Changes to catalog/page pins continue to fail the existing catalog validator;
this tool does not automatically refresh pins. Source manifest hashes include
the current code and lockfiles. A working tree manifest binds inspected WIP
bytes separately from its base commit. The result remains implementation and
acceptance planning evidence, without release approval or deployment meaning.
