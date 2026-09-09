# World Core Remediation Reconciliation

## Control state

Observed after fetching remotes on 2026-09-09:

- remediation branch: `codex/gate-a-targeted-fixes`;
- branch HEAD/evidence commit: `b383904573b2959b3f22ea6d8ded4d02c3582b83`;
- immutable code candidate: `47fe5c5d465748370d9a8ea046bc443978437203`;
- reviewed Foundation base: `1a950a41567900761d4f4313092ab4a3404e6f67`;
- remediation bundle state: `IMPLEMENTATION FIXED / READY_FOR_REVIEW`;
- authoritative gate state: `PENDING_RE_REVIEW`, `next_step_ready=false`;
- V02.1-V05.3: `IMPLEMENTED_UNVERIFIED`; V06.1-V10.4: `PLANNED`.

Candidate tests and the remediation bundle are not independent approval. This
document neither approves nor merges Gate A, activates batch governance, starts
V06, changes status, nor authorizes a database operation.

## Repaired Foundation contracts inherited by World Core

| Boundary | Inherited contract | World Core consequence |
| --- | --- | --- |
| Runtime environment | Every public launcher runs the canonical fail-closed policy before any child spawn. | No authoritative Worker persistence/client/lease initialization may occur before the same validation succeeds. |
| Numeric arithmetic | Accepted operands and returned results are in the validated 120-digit public domain; add/subtract/multiply are exact; an out-of-domain exact result raises `DECIMAL_RESULT_OUT_OF_RANGE`. | All clock, Money, Quantity, Price, posting, conservation and replay checks use exact-or-reject. No tolerance or silent rounding. |
| Office authority | An issued context is an opaque snapshot, not authority; decisions re-resolve current identity, membership, country, Office, capability, suspension and authorization revision and bind the complete immutable proposal scope. | Intake, approval and worker commit perform server-side current checks. A queued or cached context is never a durable credential. |
| Identity | External `AuthSubject` is a canonical lowercase PostgreSQL UUID and is distinct from uppercase catalogue/domain IDs. | The API verifies token/profile subject equality, then resolves that subject to current World membership and World-side actor/team/country/Office IDs. |
| Canonical bytes | Only inert primitives/plain enumerable data and explicitly trusted domain adapters are accepted. Accessors, arbitrary methods/providers, Proxies, hidden/symbol state, sparse/noncanonical arrays, cycles and unsupported prototypes fail closed. | Command fingerprints and Event/Receipt/replay hashes inherit this serializer. No duck-typed canonical provider or behavioral object is admitted. |
| Architecture | TypeScript AST enforcement covers import/export/require/dynamic import/import-equals, unresolved module references, dependency ownership and direct/aliased/reflective numeric coercion. | World Core adds no regex-only parallel scanner and cannot bypass the existing owner graph through alternate syntax. |
| Migration provenance | The manifest must name a full immutable source commit; with replace refs disabled, the commit, artifact path and exact SHA-256-bound bytes must all exist. | Every World Core migration extends the V02 manifest/release chain and uses the same provenance verifier. Caller-supplied metadata is not evidence. |

## Surgical plan changes

- V06 composes its exact properties with the Foundation exact-decimal oracle
  where numeric values are involved and adds fail-closed Worker startup as an
  inherited precondition.
- V07 fingerprints only inert canonical envelopes and adds `authSubject` as
  external identity evidence distinct from `actorId`. Idempotency and replay
  compare repaired canonical bytes/hashes.
- V07/V10 require current server resolution at intake, approval and execution;
  authorization snapshots can support audit but cannot authorize later work.
- V08/V10 conservation is canonical exact equality. Price-by-Quantity or any
  other exact result outside the public domain is deterministically rejected.
  No economic rounding rule is added and ADR-08 remains open.
- V07-V09 migration candidates inherit commit/path/byte-hash provenance and
  the sole V02 chain; no second World Core migration authority is created.
- V09 cannot initialize authoritative persistence, acquire a lease or recover
  commands until canonical environment validation succeeds.
- Gate B retains its fourteen World Core properties and additionally runs the
  seven repaired Foundation boundaries as inherited regression invariants.

## Exact-oracle fast-check strategy

Use `packages/testkit/src/exact-decimal-oracle.ts` as the single independent
arithmetic oracle. Extend shared arbitraries to cover public-domain boundaries,
carry, scale alignment and overflow; do not create another decimal framework.
For Money and inventory conservation, equality means canonical exact equality:
compare canonical coefficients/scale or canonical serialized values, never JS
numbers, epsilon, rounded displays or tolerance bands. Preserve seed, run count,
shrink path and first counterexample for every failure.

## Intentionally unchanged

The milestone, one-writer architecture, 10x clock ratio, 360-day calendar,
V06-V10.4 sequence, two-country fixture, fourteen World Core Gate B properties,
E02-E18 exclusion, production prohibition and V11 stop remain unchanged.

## Planning-branch contamination audit

Against Foundation base `1a950a41567900761d4f4313092ab4a3404e6f67`, planning
commit `cbcfd0272bcd5922b22bc5709b6cb56541e82690` contains exactly 23 files,
all under `docs/architecture`, `docs/exec-plans`, `docs/planning`,
`docs/testing` or the single World Core control prompt. This reconciliation adds
only the same planning/control classes plus one explicitly inert governance
draft. It changes no `apps/**`, `packages/**`, `database/**`, `status/**`,
runtime configuration, lockfile or Foundation evidence.

The source worktree also contained an untracked `docs/reports/GATE_A/` directory
created outside this planning commit series. It is not branch content, is not
staged, and must remain isolated from the reconciliation commit.

## Reconciliation result

The planning contracts are aligned to the remediation candidate but remain
conditional on a fresh independent Gate A decision. Execution authority is
defined by `V06_EXECUTION_PREFLIGHT.md`, not by this document.
