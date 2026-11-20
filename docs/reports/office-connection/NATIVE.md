# Isolated native acceptance

Status: **IMPLEMENTED_UNVERIFIED**. This is an isolated simulated-source engineering
acceptance harness. It does not grant source admission, production admission,
World/Clock startup, or completion of an Office package gate.

## Reproduce

After the integration owner creates a clean candidate commit, run:

```bash
bash /workspace/.cloud-setup/run.sh econmind-os-world-simulation \
  node tools/office-connection/native-evidence.mjs --plan

bash /workspace/.cloud-setup/run.sh econmind-os-world-simulation \
  node tools/office-connection/native-evidence.mjs --run --commit=<full-current-commit>
```

`--plan` prints one JSON object and creates no resources. `--run` refuses a dirty
candidate or a commit other than current HEAD. It records the source commit,
every command, exit code, start/end time, stdout/stderr, actual Vitest JSON,
HTTP transcript and owned marker/checkpoint evidence in a new
`/tmp/econmind-office-native-evidence-*` directory. Nonzero exits, failed
assertions and skipped native assertions remain incomplete. Source classification
is always `SIMULATED_OPENING`, `sourceAdmitted=false`, `WorldClock=false`.

The runner:

1. Creates a clean local shallow clone of the exact commit and imports every
   original migration `artifact_source_commit` and the existing immutable renewal
   manifest baseline from the verified local Git object database. The source
   commits and artifact blobs must exist. Git credentials/configuration are not
   copied from the original checkout.
2. Pulls the official image
   `postgres@sha256:1beaa3084eee2676f20a9cd9928f0bf2c5bf674f8e49f81017912183d377c61c`
   (`postgres:16.15`, Linux amd64). Its PostgreSQL binaries are normal root-owned
   files at the unchanged `/usr/lib/postgresql/16/bin` location.
3. Creates only its own disposable container. No host mounts, Docker socket,
   privileged mode, host networking, published ports, production credentials or
   external database URLs are supplied. The default image database entrypoint is
   replaced with `sleep`; the image does not auto-initialize a database.
4. Copies the verified Node 24.20.0 archive into container `/tmp`, checking SHA-256
   `2f2c0da162318f0de47665410c7c8c2ed3d36c8f3105de4bbc61176c70a7cbf2`.
   Copies the existing pnpm 12.3.4 tool, content-addressed package store and public
   metadata cache. Preparation may fetch missing public npm metadata over HTTPS. It installs the frozen lockfile under the nonroot
   `postgres` account; pnpm integrity and supply-chain policy checks stay enabled.
5. Installs `git` inside the disposable container through Debian's signed APT
   source over HTTPS. The existing host's public CA bundle is supplied explicitly
   for the environment proxy. TLS certificate verification, Debian signing keys
   and package digest verification remain enabled. PGDG is unnecessary for git;
   it is not added as a new trusted source.
6. Disconnects the container from its bridge network and checks that its Docker
   network map is empty after installing frozen dependencies and before running tests.
   Unix sockets and loopback HTTP remain available inside the container.
7. Builds the unchanged host with Node 24.20.0/pnpm 12.3.4; runs the existing F
   installed-role/private-socket/custody tests and the actual HTTP roundtrip;
   runs the new Linux native persistence test. Tests run as nonroot `postgres`.
8. Preserves bounded actual evidence and destroys only its own named container,
   including any anonymous volume. The receipt records cleanup success/failure.

## Coverage and limits

`tests/integration/f-social-office-isolated-host-postgres.test.ts` executes the
original migration installer, separated roles, forbidden publisher/authority
access, actual private socket identity, role-pool closure, marker-mode refusal,
wrong-current-PID refusal and verified owned cleanup.

`tools/social-office-demo/verify.mjs --isolated` executes the original fixed-host
HTTP session, command/receipt/projection and preset flow. Its own acceptance
transcript remains authoritative evidence for the assertions it actually ran;
browser acceptance is separately `NOT_RUN` by that HTTP tool.

`tests/world-core/office-native-evidence.test.ts`, with
`ECONMIND_OFFICE_NATIVE_EVIDENCE=1`, executes genuine private host controls for
revoked authority, missing/revoked source and wrong version. It verifies the
economic-fact digest is unchanged, submits an actual PLAN through HTTP, waits for
its original FINAL receipt and preserves the actual DAY0 checkpoint. After
normal host cleanup, the test verifies the same owned private directories,
unchanged marker, root-owned PG binaries, stopped cluster and original database
system identifier. It restarts only that newly created PGDATA and compares every
checkpoint table against native SQL readback. The restarted server's PID, PID-file
epoch and OS start identity are bound before stopping it.

This fresh Linux restart does **not** claim the historical Mac recovery. The
existing recovery function pins a different `/private/tmp` root, device/inodes,
uid 501 and original hashes. Those restrictions are unchanged and that recovery
is `NOT_RUN_FIXED_FOREIGN_CUSTODY` here.

The D atomic/source suites require private markers with independent provenance.
Their marker source is absent from this cloud task. No marker is fabricated or
borrowed; they remain `NOT_RUN_NO_PROVENANCE`. A successful fresh F/Linux run does
not certify those separate suites or production readiness.

## Actual preparation evidence (2026-10-28)

- Host: Debian 13, uid 1000; Node 24.20.0 and pnpm 12.3.4 confirmed.
- Ordinary system installation with `require_escalated` was attempted; APT exited
  100 because this environment still runs as uid 1000 and cannot acquire
  `/var/lib/dpkg/lock-frontend`. No auto-review rejection occurred and no host
  system file was changed.
- Direct official PGDG/source/key HTTPS and the supported PGDG artifact cache
  returned HTTP 403. TLS/signature checks were not disabled.
- Ubuntu's official HTTPS archive was reachable. Its noble-updates InRelease had
  a valid Ubuntu archive signature with fingerprint
  `F6ECB3762474EDA9D21B7022871920D1991BC93C`; the signed Packages.xz digest was
  verified. PostgreSQL server/client `16.15-0ubuntu0.24.04.1` packages were
  downloaded and their SHA-256 digests verified. They were not installed into the
  Debian host; the Ubuntu server additionally requires libicu74.
- The first actual host-native F run exited 1: **3 failed, 0 skipped**, all at
  `realpath('/usr/lib/postgresql/16/bin')` with `ENOENT`. Original Vitest JSON is
  `/tmp/office-native-pg16-evidence/f-social-native.vitest.json`.
- The fixed official Docker image was successfully pulled and inspected. Its
  actual version is `16.15 (Debian 16.15-1.pgdg13+2)`, and the required executables
  are regular root-owned files. Preparation continues in a private disposable
  container; final acceptance must bind a clean integration commit.
- Focused local plan test: **1 passed, 1 native test skipped** without the explicit
  native opt-in. The skip is expected for this plan-only invocation and is not
  native execution evidence. Focused ESLint and Prettier checks passed.

No commit, push, merge, deployment, production connection or World/Clock startup
was performed by this workstream.
