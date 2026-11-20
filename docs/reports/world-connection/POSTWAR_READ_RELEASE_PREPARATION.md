# Immutable admitted-read API preparation

`postwar-read-release-preparation.yml` accepts a full immutable candidate SHA and
builds its actual Core, Worker and API modules. It runs Wrangler **4.148.0** with
`deploy --dry-run`, without a Cloudflare token, database connection, protected
release approval or production contact. This workflow never publishes.

The tool verifies the exact clean checkout, repository origin and tree before
and after bundling. Output must be fresh and outside the source checkout. It
uses an isolated HOME and empty dotenv file and strips inherited credentials,
proxy credentials and Node preload settings. A generated build-only configuration
retains the existing API and executor names while declaring
`RUNTIME_MODE=ADMITTED_READ_ONLY`. It copies no custom build hooks, schedules,
queues, assets, account IDs, DSNs or deployment routes from the candidate.

The candidate's existing `config/cloudflare/world-runtime-api.wrangler.jsonc`
staging configuration is separately inspected for pinned
`POSTWAR_READ_CONFIGURATION_JSON` and a `POSTWAR_READER` Hyperdrive declaration.
Nothing changes that file or provisions the binding. Missing declarations become
explicit blockers; they do not prevent a useful code bundle. A well-formed
binding ID is only a declaration, not evidence of existence, approved access or
query-cache settings. The server's own validation remains authoritative.

The artifact contains source commit/tree, candidate configuration SHA, actual
bundle file SHA/size, declaration findings and unresolved requirements.
It is a code bundle rather than a deployable configuration package: server
metadata and the database binding are deliberately absent from the generated
build configuration. Both configuration hashes are retained separately.
`deploymentReady` always remains `false`; bundle PASS is never publication,
P0 approval, complete candidate check, production admission or online acceptance.
Current `/readyz` remains the existing HOLD readiness endpoint; bundling the
read routes does not claim simulation readiness.

After the final candidate's checks and independent review pass, the deployment
owner can add a separate reviewed publication job using the existing protected
environment mechanism. Before any write it must verify actual existing binding
and least privilege, disabled authorization-query caching, exact signed admission
and H0 projection publication through the companion migration chain, and current
Worker version/settings. It must retain the previous version for rollback and
publish only the exact prepared bundle/config identity. The older
`world-runtime-actions.yml` remains pinned to its earlier HOLD source and cannot
publish this candidate. No approval or production bindings are inferred from it.

A local operator can run the same preparation after installing the pinned CLI
outside the repository:

```sh
node tools/office-connection/postwar-read-release-preparation.mjs \
  --source /absolute/clean/candidate \
  --commit FULL_40_CHARACTER_SHA \
  --output /absolute/fresh/output \
  --tool-root /absolute/isolated/wrangler-install
```

Provider API access and credentials are unnecessary for this command. Remote
version/binding checks and publish require the existing deployment owner's
approved channel; current proxy CONNECT failures must not be interpreted as
invalid token scope. This preparation creates no credential or database role.
