# D fiscal source lifecycle — blocking design review candidate V1

Status: PROPOSED; P0 independent E review required before dependent implementation.
Base: `1a40309601074fe37fa3526f66a0b5c0beedb308`.
This proposal is not economic adoption, source admission, a new financial model,
an approved migration, an authority grant, or a production source-ready claim.

## Exact responsibility and existing seams

Root dispatched original B02 (70), B03 (140), B04 (70), B08 (560).
Original stable IDs and acceptance rules are preserved in `intake.mjs` output.
Only D source tooling and D evidence are currently implemented. No product
entrypoint, Core index, persistence schema, shared manifest or Root register changed.

Reuse, without modifying economics:

- `packages/core/src/commands/finance-budget-appropriation.ts`:
  `planBudgetAppropriation`, `checkBudgetAppropriationHistory`; immutable payload,
  revision/predecessor, complete context binding, ordinary departmental branch,
  optional sourced Captain approval and explicit new-line initialization checks.
- `apps/world-worker/src/persistence/finance-budget-appropriation-source-contract.ts`:
  `checkBudgetAppropriationCarrier` for exact reconstruction only. Its flags remain
  false. It must not be renamed or relabelled as an admitted source producer.
- `packages/core/src/engine-kernels/technology-project-household-fiscal.ts`:
  `calculateAvailableFiscalCapacity` is an existing downstream formula. This
  proposal does not call it with missing obligations/cash or change that formula.
- Existing server-owned admitted-opening/committed-event snapshot-reader pattern,
  e.g. `SocialEmploymentRuntimeSnapshotReader`, separates actual source evidence
  from a TEST_ONLY fixture. No social module code is copied or changed.

E's retained `D_BUDGET_SOURCE_INPUT_REVIEW_20261016_V1/decision.json` accepts
bounded gap evidence, not sourceREADY. It explicitly distinguishes a genuinely
new line's lawful creation baseline from undocumented legacy obligations.

## Smallest post-review implementation: source candidate producer, not carrier

First increment creates an immutable filesystem **candidate bundle** for one
specified entity/period and one new ordinary budget line. A legacy import is
reported as unsupported with its exact missing evidence, not produced by this
first increment. It reads exact original evidence leaves, normalizes and reconciles
them, derives hashes and writes reviewable source artifacts. It does not accept an
arbitrary precomputed result as evidence and does not create a live World source.

Proposed owned additions after E design approval:

1. `tools/unknown2544/d-fiscal-source/produce-candidate.mjs`
2. `tools/unknown2544/d-fiscal-source/produce-candidate.test.mjs`
3. D evidence candidate bundle and per-ID coverage files.

No Worker source/runtime/SQL implementation is authorized by this design alone.
A later actual source issuer must be separately reviewed against existing
single-writer/admission/command machinery; the offline candidate is its input,
never a second authority. No default adapter or `trusted: true` switch.

### Producer input contract (required, no guessed defaults)

- Source index: immutable file path, size, SHA256, JSON pointer, source-owner
  identity, source schema/revision, evidence class for every leaf. All file reads
  are regular, bounded and pinned; the actual leaf must match the declared scope.
- Scope: explicit World/opening identity or explicit unadopted scenario identity,
  country, entity, native currency, exact period and cutoff. A source date is not
  a World epoch. Missing actual identity stays null and blocks actual source use.
- Source-owned coverage: bounded entity/period inventory, inventory revision,
  origin, predecessor chain, terminal cutoff, included obligation IDs and source
  owner attestation locator. Caller-provided `complete: true` is not proof.
- Every original obligation: canonical ID; revision; legal-basis leaf; payer;
  creditor/beneficiary; original currency; exact due/period; exact original amount;
  legally committed state with source; classified rule/version and applicability;
  settled postings and releases with unique causation; remaining unpaid amount;
  inclusion/component identities. Missing legal status remains UNKNOWN.
- Budget records: actual immutable envelope/line creation and revision sources,
  exact approval-set input, and creation/initialization evidence. Reuse PR156's
  existing payload/context shape, never generalize its supported branches.
- Candidate approval inputs: the proposed payload hash/revision; required offices
  from the applicable sourced rule; separate approval evidence locators for each
  office; explicit missing/revoked/superseded state. This file does not sign,
  impersonate an office, issue authorization or mark its own proposal APPROVED.

When a required leaf is unavailable the output is `BLOCKED_INPUT` with exact
missing paths and null derived totals. No synthetic legal obligations are emitted.
Missing source-owned coverage blocks the **whole bounded total**, even if a few
individual source obligations can be traced and classified.

### Artifact creation and version lifecycle

`SOURCE_INPUTS -> CANDIDATE_VERSION -> E/B_REVIEW -> ROOT_ACCEPTANCE ->
SEPARATE_EXISTING_SOURCE_ADMISSION`.

- First candidate version has an explicit null predecessor and explicit origin
  kind: HISTORICAL_IMPORT or NEW_SCENARIO_PROPOSAL. Neither means legacy-empty.
- Candidate ID derives from canonical normalized content and exact input pins;
  timestamps and output path are outside the hashed economic content. A second
  identical run is identical content, not a new approval or new obligation.
- A changed candidate names its exact predecessor hash. Immutable source scope,
  entity, currency and original obligation identity cannot silently change; a
  requested identity change produces a migration proposal, not an in-place edit.
- Reviews bind the complete content hash, input hashes, scope, version and rule
  revisions. Any change invalidates prior candidate approvals. Independent review
  approval is not a substitute for project-owner economic adoption.
- Output uses exclusive creation. Never overwrite a prior version, source,
  original ledger or Root register. Review and acceptance receipts are separately
  appended by their actual owners, not synthesized by the D producer.
- Actual production admission remains absent until its existing trusted issuer
  validates lawful owner adoption and applicable identities/signatures. Offline
  hash matching alone never admits source content.

### Exact aggregation (after design approval, only for proven complete scope)

Reuse the adopted classification rule per unique original obligation; preserve
unclassified entries and block totals. No whole-budget mandatory label. Partition
by payer/currency/period and canonical obligation/component identity. A legal
amount is not its reference valuation. No FX conversion is introduced here.

`mandatoryNonDebtNative` sums unique eligible unpaid mandatory **non-debt** leaves.
`committedDiscretionaryNative` sums unique eligible unpaid discretionary leaves
with valid legal commitment evidence. Debt, settled portions, releases and covered
components are not counted again. Ambiguous inclusion or duplicate conflicting
identity is an error, not guessed netting. Partial payment requires exact posting
lineage; this is not permission to extend PR156 to partial appropriations.

Use exact decimal/rational arithmetic and the existing sourced precision rule;
missing precision blocks a fractional result. Do not mix currencies or periods.
An empty sum is permitted only for a proven complete, genuinely empty bounded set
with explicit creation/coverage evidence. An empty archive, missing cache or
unimplemented source cannot establish zero.

One new budget line cannot close the original government's complete register,
the other 349 entity registers or country-wide classification and totals.

## B02/B03/B04 inputs and cross-owner boundaries

- B02: bind an applicable adopted floor version, beneficiary/quality/coverage,
  exact period and C's physical recipe. Preserve real infeasibility/shortage.
  Capacity/reference demand and affordability do not choose the floor.
- B03: bind applicable adopted fee policy (free/fixed/fractional), beneficiary,
  trigger, base, precision and source schedule; fee totals then require actual
  eligible event inventory and inclusion/exemption evidence. No absent-fee zero.
- B04: bind applicable adopted buffer days/legal minimum, shortfall priority,
  source-owned retained-cash basis and F's restriction-set overlap evidence.
  Buffer creates neither a payable nor cash and is not deducted twice.
- Do not invent numbers if a precise policy leaf is unavailable in the selected
  readset. Request its existing adopted locator first. Only a genuinely new
  parameter requires an explicit economic decision; do not reopen D01–D04/D06,
  TIME360, corrected R or prior accepted rules.
- F retains cash/accounts/restriction construction; C physical recipes/costs;
  A identity/permissions; G claim terms/title/history. D references their immutable
  accepted outputs, never edits their files or substitutes reference values.

## Required bounded checks for dependent implementation

1. Original ID/batch identity, field semantics, exact source pins/pointers.
2. Real-source leaf trace vs TEST_ONLY; no fixture on actual-ID output.
3. Deterministic bundle/version, changed payload invalidates approval binding.
4. Complete register vs selected obligation subset, new line vs legacy universe.
5. Duplicate obligation/component, settled/released/debt exclusion, mixed
   currency/period, exact decimals, unknown classification and missing legal basis.
6. Genuine source-owned empty coverage vs missing source/empty archive.
7. Wrong owner/World/cutoff, absent/revoked/superseded approval, unsupported
   PR156 project/conditional/partial/import branches remain blocked.
8. No World/core state, seed, SQL, production network, Clock or real payment.

All original IDs retain separate sourceComplete / engineeringWired /
validationPassed / formallyAdopted axes. A passing intake check establishes none
of these four original-field acceptance phases. Root alone accepts original IDs.

## Review requested

E: decide APPROVED_FOR_EXACT_OFFLINE_CANDIDATE_PRODUCER or CHANGES_REQUIRED for
the scope above; no economic/source adoption requested. B: independently check
the actual intake tool and exact 840 mapping. Root: confirm that the offline
producer is the next narrow step; do not count a design approval as original-ID
closure or approval of future runtime/source issuer changes.
