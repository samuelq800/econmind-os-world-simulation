# G dedicated financial contract export

Status: `IMPLEMENTED_UNVERIFIED`. Coordinator-requested separate export candidate;
actual browser acceptance belongs to D and remains `NOT_RUN` here.

## Identity and scope

- Checkout: `g-browser-safe-financial-contract-export`.
- Branch: `codex/g-browser-safe-financial-contract-export`.
- Parent: `df48568837a50961dc2f8bb78d9d64544e25a06e`.
- Parent tree: `b8c246d13de07ed8b6489b09de4eda15ac089c67`.
- Frozen contract source SHA256:
  `889c8cf4c9d22bde9bce9af5612ad56f2bed2774b80a060fa30035249567f985`.

The package export `@econmind/core/authenticated-financial-intake-contract`
resolves directly to the existing contract runtime and declaration outputs.
Only `packages/core/package.json`, the focused export test, and this report
change. No source copy, DTO, parser, authorization, root barrel, ownership policy,
database, migration, API route, or browser consumer changes are included. The
G-INTAKE-01 repair candidate remains separate and unchanged.

## Verification

Node 24.20.0 and pnpm 12.3.4; frozen offline dependency installation.

- Core, Worker and API declaration builds: `PASS`, exit 0.
- Dedicated export tests and existing architecture boundaries:
  `31 PASS` (2 export + 29 boundary), exit 0, 22:30:35 local, 9.80 seconds.
- Focused strict NodeNext TypeScript check: `PASS`, exit 0.
- Focused ESLint and Prettier checks: `PASS`, exit 0.
- Repository boundary, authoritative-pattern, secret and local environment
  checks: `PASS`, exit 0.
- `git diff --check`: `PASS`, exit 0.

The export test uses an isolated Node process with browser resolution conditions
and rejects all subsequent `node:` imports. The direct contract import succeeds;
the unchanged root barrel control is rejected. Its type import resolves the
existing declaration, and its identity test pins the frozen source SHA and both
export targets. This is module-resolution evidence, not a browser-run result.

The first architecture run recorded `30 PASS / 1 FAIL`: only Core had been built,
so pre-existing API imports of three Worker export paths had no dist targets.
The standalone boundary check also failed closed for those missing targets.
After building the unchanged Worker and API prerequisites, all 31 tests and the
boundary checker passed. No test, guard, or ownership policy was weakened.

## Handoff and limits

D should import the new subpath and run the actual browser consumer. Browser
rendering, network intake, real provider connectivity, deployment and production
activation remain `NOT_RUN` for this export increment. No merge, independent
approval, or parent G-INTAKE-01 closure is claimed.
