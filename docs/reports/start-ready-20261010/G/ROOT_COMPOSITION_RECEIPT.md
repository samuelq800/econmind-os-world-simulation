# Root — reviewed unmounted G slices 1/2 composition

2026-10-10, Asia/Shanghai. This is a source-integration receipt, not formal
adoption, admission, deployment, activation, Gate B or six-Office acceptance.

## Immutable reviewed inputs

- G original product `89c4446722a22b990c410dbc5726eb1a1208fd1a`, original
  evidence `324906488e2c0ca7d8be70067f55085a281ab766`.
- G repaired product `1bc24450aaa5323afab42c93f7d1e9e6d610f67c`, evidence
  `e70a8bcb64aab70549a9978a9e03cb4320200ef0`.
- F original independent report SHA256
  `6fd61cd4b01cd134c9bd82d6e47bd3d1bffda9dbdff43f33f4cc3bece04be157`:
  CHANGES_REQUIRED, preserved in `../reviews/F_G_SOURCE_REVIEW.md`.
- F delta report SHA256
  `99006e93b1b5c0c02af6e4fea402002b2f7253373a29a0219a3930e99dbab966`:
  APPROVED, closes F-G-01/02, preserved in `../reviews/F_G_DELTA_REVIEW.md`.
  Those are formatter-normalized presentation copies; their hashes are not
  represented as the immutable raw report hashes above.
- Composition starts at main `27307a108ce5c0c3e2ce28e3776f8ba15ed73d3b`.
  Root applied the six G design/product/evidence commits without source edits.
  All 26 changed product/test/config blobs independently match final G evidence
  tip exactly; the newer main's unrelated A/C/D/F files remain present.
- A exact owner-input catalogue `3f9fce4965b73f6a7dcdef188d3a3a57a073fe7a`
  contributes only OWNER_INPUTS.md and its fixed-source verification receipt.
  Its status table is explicitly an immutable source checkpoint, not a live
  claim that G's two defects remain open after the later F delta approval.

## Actual root composition checks

- Pinned Node24.20.0/pnpm12.3.4, credential-free local environment.
- Actual Core/Worker/API build: exit0, three package builds.
- G dedicated unchanged type configuration: exit0. Its existing
  skipLibCheck=true is retained, not advertised as full dependency-declaration
  verification.
- Three focused transport/review-delta/completion suites: 30 PASS/0 FAIL,
  three files, actual real socket/JWT and finite completion mechanisms.
- Changed-code ESLint exit0; architecture40 PASS plus both static boundary
  scanners PASS; secrets2459 files PASS; whitespace and formatter-supported
  changed files PASS. Explicitly passing raw .txt logs to the first formatter
  command produced unsupported-parser errors, not style violations. The
  corrected command retained raw bytes and used ignore-unknown for those
  non-format targets; three new receipt/review Markdown files were separately
  checked successfully. No repository formatting policy was changed.
- No local native/full/420 or real timer rerun. Prior G native results belong
  to their own source/run; pre-run dist provenance and retired stall root-cause
  limitations remain unresolved as documented by F.

Provider CI for this composed source has not yet run at this receipt checkpoint.
No tests or raw failure records were weakened or retrospectively relabelled.

## Parallel work and hard boundaries

PR132 is separate. Its repaired workflow now actually executed run38055193920:
all four strict checks passed, but D's beforeAll observed the Docker server
address172.18.0.2 rather than the required127.0.0.1; seven cases skipped and
finalize correctly returned FAIL_OR_NOT_RUN. Actual checkout was
fd454b14cd74692e046f5e049df9ec7be0db855c, tree
cabe6cbb861a2913ddee87a827ade78703bb0305. C is fixing the disposable test
topology, not weakening the loopback assertion or counting skipped cases.

B opening-source implementation is with non-implementer F for independent
review. E's head-first authorization-writer/column-supervisor integration
design is with D; its nine real-schema diagnostic controls are not product
intake acceptance. G's next constructors3/4 are design-only, not unlocked code.

No Cloudflare entry/config/pin, HOLD, SQL/proposal/migration/permission,
private-authority registration, status/gate or old-site object is changed.
Oct10 map tree remains local and unpublished. Source-only API handlers are
unmounted; official source adoption, startup and all six role workflows remain
separate unfulfilled conditions. This is not START_READY.
