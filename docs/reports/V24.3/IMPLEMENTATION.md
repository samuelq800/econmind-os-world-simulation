# V24.3 — Brief/Conflict/Expiry Tests pure Core preparation

## Identity and gate

- Branch: `codex/v24-3-brief-conflict-expiry-core`.
- Branch base after rebase: `origin/main` `0c8178b5e2aac957faa57d92672e23ec6d87b36d`.
- Code/plan commit after rebase: `3c8c6d84d50ca69d217f75894e85ab1920b8d0ae`; focused follow-up test/plan commit: `4e3746ab5003f91f022868d07065622933c55cda`.
- `status/progress.json` still lists V24.1, V24.2 and V24.3 as `PLANNED`. V24.2 is not in this base; this is a **PREPARATION_ONLY** candidate, not formal V24.3 implementation/acceptance.

## Pure candidate

- Cabinet briefs are projected only from same-snapshot, versioned, caller-supplied country/season/world, office scope, membership and server-authorization facts. Restricted briefs additionally require a matching actor/office/brief-version grant and predecessor bindings. Denial is a generic `{status: "DENIED"}` without brief ID, title, body, source binding or hash preimage. This is a Core check, not an API/DB secrecy boundary: authoritative server fetch authorization and RLS remain required.
- Policy conflict diagnostics detect overlapping, half-open, integer-SimTime intervals with opposing target direction or concurrent claim to one exclusive resource. Pair and fact ordering use locale-independent codepoint order. The candidate never selects a winning policy or writes economic state.
- Responsibility-log candidates contain only explicit actor/office/action/decision/version/outcome/time/receipt metadata. Undeclared fields, including a brief body, are rejected before a fact binding can appear in output. No authoritative audit append occurs.
- Temporary crisis power temporal eligibility is `[issuedAt, min(expiresAt, crisisEndedAt))`; it is expired at the exact boundary, uses no wall-clock time, and rejects contradictory lifecycle facts. Caller-supplied approval/authorization references are provenance only, not real access grants.
- Replay assertions recompute each complete result from source-bound facts. No migration, event dispatch, clock mutation, durable writer or production access is included.

## Verification

- V24.3 focused Vitest: **PASS**, one file / eight tests under each of `LC_ALL=en_US.UTF-8` and `LC_ALL=tr_TR.UTF-8`.
- V24.1 + V24.3 focused Vitest after rebase: **PASS**, two files / 16 tests.
- Core typecheck and build: **PASS**. Targeted ESLint and Prettier: **PASS**.
- Authoritative-pattern and repository-boundary scans: **PASS**.
- Local environment, repository-secret and foundation-policy checks: **PASS**; no linked Supabase project and database mutation disallowed.
- Git diff check: **PASS**.

## NOT_RUN / ownership

V24.2 formal closure and dependency recomputation, actual server identity/office/approval checks, API/DB fetch isolation and RLS, authoritative Cabinet Brief persistence, authoritative audit log append, V09 atomic writer, Event Kernel dispatch, migrations, production access, independent review and Gate acceptance are **NOT_RUN**. ADR-12 remains unapproved. This branch changes no V24.1, V24.2, API/UI, main-site, schema/migration, status/Gate or production file.
