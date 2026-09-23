# V22.2 — international executors A, pure Core preparation

## Immutable candidate

- Code/plan/test commit: `2b3249bfde301959381a7a24bb3f165aca1a8cd0`.
- Base: `f4815cc3d24e4876e9f09858f5536aac560592ef` (`origin/main` at task entry).
- Branch: `codex/v22-2-international-executors-a`.
- Scope: new Core module, focused tests and this V22.2 plan/report only.
- Result: `FOUNDATION_IMPLEMENTED_UNVERIFIED`. This is neither authoritative execution nor package acceptance.

## Implemented candidate effects

The pure calculation module requires caller-supplied V22.1 `ACTIVE` contract,
current signed version, matching party/structured-term facts and exact
same-snapshot balances. It prepares deterministic before/delta/after effects
and causal fact bindings for five contract activity families:

1. Commodity supply: GCU buyer-to-seller cash and fixed-catalogue goods
   seller-to-buyer quantity.
2. FDI: GCU investor-to-target cash with equal issuer share increase and
   foreign-investor holding increase.
3. Sovereign loan: GCU lender-to-borrower cash and exactly paired lender debt
   asset/borrower liability.
4. Infrastructure finance: explicit caller-selected debt or equity mode,
   paired cash and the corresponding paired claim/liability or
   issued-share/ownership effects.
5. Resource development: GCU foreign-to-host cash and bounded development
   right-share transfer, with geological endowment unchanged.

All outputs have canonical replay preimages; the proof rebinds input facts and
detects input/order/output-reference mutation. A caller's uniqueness witness
is checked locally, but only the V09 authoritative writer can establish and
persist real idempotency, atomic effects, posting and receipt. Contract
approval and delivery/payment evidence are caller-supplied refs, not
independently authenticated by this pure kernel. No FX rate, price, tax,
customs, amortization, infrastructure yield or resource extraction model is
chosen here.

## Verification

- Focused Vitest: **PASS**, 1 file / 8 tests (five positive families plus
  invalid/stale/replay cases).
- Entire workspace typecheck via pinned Node 24.20.0 and pnpm 12.3.4:
  **PASS** (`pnpm -r --if-present typecheck`).
- Core build, targeted ESLint, targeted Prettier: **PASS**.
- Authoritative-pattern and boundary scans: **PASS**.
- Local environment check: **PASS**, database not configured, no linked
  Supabase project and database mutation disallowed.
- Repository secret scan, foundation gate policy and `git diff --check`:
  **PASS**.
- The convenience `pnpm typecheck` package script initially invoked a
  different nested fallback (`Node 24.19.0` / `pnpm 11.19.0`) and failed its
  toolchain guard; the equivalent direct pinned recursive command above
  passed. The wrapper failure is not recorded as a code pass.

## Still open / NOT_RUN

V21.3, authoritative V10.4, V22.1 product closure, ADR-10 and V22.2 package
gates remain open in repository status. No atomic writer integration,
posting, persistence, Command/Event/receipt, end-to-end cross-border test,
independent review, production access, migration or Gate approval was run.
This branch must not be promoted as V22.2 product completion.
