# Social connection workflow

This is bounded integration preparation, not formal admission, gate acceptance or production authorization. Audit baseline was clean main `14595f81caec2ed5ce7cec564d7db9609b693718`. The workflow executes existing entries and does not change business rules, permissions, source facts, custody or settlement.

## Reproducible commands

Use Node24.20.0 and pnpm12.3.4 with frozen installed dependencies. In this cloud workspace:

```bash
bash /workspace/.cloud-setup/run.sh econmind-os-world-simulation node tools/office-connection/social-workflow.mjs plan
bash /workspace/.cloud-setup/run.sh econmind-os-world-simulation node tools/office-connection/social-workflow.mjs verify --fixture
```

`plan` (also `--plan`) does no build, SQL or listener work and returns one JSON document. It reads the formal gate from the current `status/progress.json`. `verify --fixture` runs the fixed finance source-byte checker, existing host builder and four focused domain/API/browser-controller test files. Building the browser does not demonstrate it in a browser; a dirty-source build manifest is build evidence only and cannot satisfy the host's clean-source custody requirement. These commands do not start a host, database or World/Clock.

For the separate native acceptance owner, after checking prerequisites and avoiding concurrent owned-host work:

```bash
ECONMIND_ENV=local ECONMIND_SOCIAL_OFFICE_DEMO=1 bash /workspace/.cloud-setup/run.sh econmind-os-world-simulation node tools/office-connection/social-workflow.mjs verify --isolated-http
```

This explicitly starts the existing isolated native host through `tools/social-office-demo/verify.mjs --isolated`. It exercises actual HTTP plus private source presets/due processing; it does not start World/Clock. The existing verifier owns cleanup and writes actual bounded, redacted HTTP evidence under `node_modules/.cache/g-social-office-demo/acceptance-*`. Browser and separate D native persistence suites remain NOT_RUN.

The host requires nonroot local/CI, a clean source build, no external database environment and exact PostgreSQL16.15 at `/usr/lib/postgresql/16/bin` on Linux. The initial cloud audit found that binary absent. The workflow reports existence only; existing host code retains version/custody enforcement. It never substitutes another binary, arbitrary DSN or imported result.

## Implemented Social slice

The existing isolated scenario joins employment PLAN/MATCH, technical-college admission/graduation and community-clinic service through the single labour slice, finite staff/time/seats/resources, exact budget obligations, inventory requirements and canonical replay. API routes are `/isolated/v1/social-office/{session,command,projection,receipt}`. The dedicated browser retains original request identity and recovers receipts after response loss; manual MATCH is forbidden.

Key sources are `packages/core/src/commands/social-office-actions.ts`, `apps/world-worker/src/social-office-demo/`, `apps/world-worker/src/persistence/social-office-atomic-repository.ts`, `social-office-resource-protection.ts`, `social-office-simulated-source-custody.ts`, `apps/world-api/src/integration/social-office-demo-{service,transport}.ts`, and `apps/world-web/src/social-office-demo/`.

The selected scenario remains `SIMULATED_OPENING`, `sourceAdmitted=false`, with fixed days 0/1/10, simulated identity and native simulation-scoped grants. Accrual obligations are distinct from cash payments; actual payroll is outside scope. Selection explicitly does not authorize other Offices or formal World policy.

## Remaining boundaries

- Formal PLAN has an existing concrete `social-employment-runtime-snapshot-reader.ts`, but still requires separately reviewed original-source custody and cooperating protection. Required material includes admitted genesis, same-head current boundary/minimum-wage/offer/population facts and physical attempt envelope. A constructor, parser or hash is not admission.
- Formal manual composition supplies `automaticAuthority:null`; the actual automatic MATCH publisher, durable grant and scheduling remain separate from the simulated publisher. Formal college/clinic consumer wiring and hosting are not established by this demonstration.
- `status/progress.json` remains the formal authority; V09.1 is PLANNED and `next_step_ready=false` at the audit baseline.
- `d-social-office-{atomic,protection}-postgres.test.ts` require owned private `D_SOCIAL_ATOMIC_NATIVE_MARKER` / `D_SOCIAL_SOURCE_NATIVE_MARKER` inputs. No existing repository runner creates those markers. The F host marker is incompatible. Do not fabricate markers or treat HTTP success as those native tests passing.
- Actual browser acceptance remains separate from controller tests and HTTP verification. No historical CI receipt is imported by this workflow.

Each invocation reports only newly executed child commands, including exit/signal and SHA256/byte counts of captured stdout/stderr; diagnostics are forwarded to stderr and the report is JSON on stdout. Child nonzero exits, signals and spawn errors stop dependent commands and return failure. FIXTURE, native HTTP, native persistence, browser and FORMAL statuses remain distinct; plan/disabled/unrun work never becomes PASS. A terminated HTTP verifier leaves cleanup UNKNOWN and preserves owned evidence for the native owner; the wrapper never fabricates cleanup or retries against another target. Existing builder and host custody checks remain mandatory.

## Current verification

The read-only audit ran the pinned finance source-byte checker successfully (exit0), confirming fixed distribution/overlay identity while retaining `DATA_NOT_AUTHENTICATED`, `PROPOSED_NOT_ADOPTED`, `sourceAdmitted=false` and `activationAuthorized=false`. The real fixture workflow then built existing Core/Worker/API/support/browser inputs and passed all four focused suites (68 tests, exit0). Orchestration tests mock child execution explicitly; they are not native evidence. Focused orchestration, lint, format and strict scoped TypeScript checks are recorded in the completion handoff. Initial scoped TypeScript failed on an inferred empty-array type; an explicit ledger type fixed it without suppression. No native host/cluster is started by this implementation task; native acceptance belongs to its separate owner. This report does not self-award VERIFIED.
