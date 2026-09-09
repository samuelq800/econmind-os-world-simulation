# V00.2 Targeted Lifecycle Self-Audit

## Result

Implementation-side adversarial audit completed on 2026-09-08 using macOS
arm64, Node.js 24.20.0, and pnpm 12.3.4. Every required targeted attack passed
after correction. This is not independent review and does not authorize
`VERIFIED`.

End state: `IMPLEMENTED_UNVERIFIED`.

Required next action: new independent re-review of the exact final
`feat/v00-2` candidate HEAD, which contains correction commit
`52f44f962d9f28b27781c4ee74f7c25dea813470`.

## Attack matrix

| Attack                          | Original failure reproduced before fix?                                             | Post-fix expected behavior                                                                              | Post-fix observed behavior                                                                                                                 | Result | Residual risk                                                                              |
| ------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------ |
| 1. Web public SIGINT            | Yes; outer pnpm exited while nested pnpm and Web kept serving                       | All owned descendants stop; endpoint closes; port rebinds                                               | Three-layer tree stopped; endpoint unreachable; rebind succeeded                                                                           | PASS   | Darwin observation only                                                                    |
| 2. Web public SIGTERM           | Yes; same orphan/listener failure                                                   | Same as attack 1                                                                                        | Same as attack 1                                                                                                                           | PASS   | Darwin observation only                                                                    |
| 3. API public SIGINT            | Yes; nested pnpm, shell, and API survived                                           | Same as attack 1                                                                                        | Three-layer corrected tree stopped; endpoint unreachable; rebind succeeded                                                                 | PASS   | Darwin observation only                                                                    |
| 4. API public SIGTERM           | Yes; same orphan/listener failure                                                   | Same as attack 3                                                                                        | Same as attack 3                                                                                                                           | PASS   | Darwin observation only                                                                    |
| 5. Worker public SIGINT         | Yes; nested pnpm, shell, and Worker survived                                        | Same as attack 1                                                                                        | Three-layer corrected tree stopped; endpoint unreachable; rebind succeeded                                                                 | PASS   | Darwin observation only                                                                    |
| 6. Worker public SIGTERM        | Yes; same orphan/listener failure                                                   | Same as attack 5                                                                                        | Same as attack 5                                                                                                                           | PASS   | Darwin observation only                                                                    |
| 7. API repeated SIGINT          | Equivalent one-shot-listener defect established; exact pre-fix capture used SIGTERM | One shutdown owner; second signal remains controlled                                                    | Active incomplete request held drain; process survived repeat; one start and one completion                                                | PASS   | None observed                                                                              |
| 8. API repeated SIGTERM         | Yes; second SIGTERM previously caused default termination                           | Same as attack 7                                                                                        | Same as attack 7                                                                                                                           | PASS   | None observed                                                                              |
| 9. Worker repeated SIGINT       | Equivalent one-shot-listener defect established; exact pre-fix capture used SIGTERM | Same as attack 7                                                                                        | Same as attack 7                                                                                                                           | PASS   | None observed                                                                              |
| 10. Worker repeated SIGTERM     | Yes; second SIGTERM previously caused default termination                           | Same as attack 7                                                                                        | Same as attack 7                                                                                                                           | PASS   | None observed                                                                              |
| 11. Process-tree orphan probe   | Yes; pnpm descendants were re-parented and retained listeners                       | Parent loss initiates per-app cleanup without group kill                                                | Corrected tree is pnpm to one launcher to one runtime; no captured PID survived                                                            | PASS   | Parent identity uses POSIX `ps` on tested platforms                                        |
| 12. Shutdown timing race        | Yes; an intermediate fix could miss parent loss before its first PPID sample        | Pre-readiness signal or pre-initialization parent loss cannot create later readiness                    | Six immediate signal cases and three delayed-initialization cases produced no later readiness; ports rebound                               | PASS   | Windows timing path is not verified                                                        |
| 13. Forced-timeout race         | Pre-fix repeated-signal path failed during active drain                             | One forced close near five seconds; repeated signal remains controlled                                  | API completed in 5008 ms and Worker in 5020 ms; one completion each; sockets closed; ports rebound                                         | PASS   | Wall-clock scheduling can add small latency                                                |
| 14. Startup-failure cleanup     | No public-command leak was established before correction                            | Invalid environment, host, port, and occupied port fail closed without leaks                            | Twelve public-command cases exited 1; no survivor or later readiness; every port rebound                                                   | PASS   | None observed                                                                              |
| 15. Independent-app termination | No pre-fix cross-app kill was established                                           | Stopping one app leaves the other two healthy and allows restart                                        | Web, API, and Worker each stopped and restarted on the same port while siblings stayed healthy                                             | PASS   | None observed                                                                              |
| 16. Test-harness escape audit   | Yes; old tests spawned Node entries directly and never attacked root pnpm           | Signal only public pnpm PID; record failure before cleanup; check descendants, HTTP, and rebind         | New tests spawn exact root commands, capture PID/PPID/PGID/session, signal only outer public PID, and assert recorded state before cleanup | PASS   | Public lifecycle tests are skipped on Windows                                              |
| 17. Mixed signal reentrancy     | Same one-shot-listener mechanism applied                                            | SIGINT to SIGTERM and SIGTERM to SIGINT remain idempotent                                               | Both sequences passed for API and Worker with active incomplete requests                                                                   | PASS   | None observed                                                                              |
| 18. Supported command aliases   | Unsafe nested app-level aliases existed before correction                           | Root and app `dev` and `start` paths share the safe per-app launcher                                    | Six app-level dev/start attacks stopped descendants and rebound ports                                                                      | PASS   | `start` assumes an existing build, as before                                               |
| 19. Failed development build    | An intermediate fix retained a live watchdog after compiler failure                 | Compiler failure exits promptly with its code and no runtime                                            | Injected TypeScript exit 2 propagated for API and Worker; no endpoint appeared                                                             | PASS   | Fault injected through a test preload                                                      |
| 20. Unexpected runtime signal   | An intermediate fix mapped every non-SIGINT signal to 143                           | Preserve conventional `128 + signal` exit code                                                          | SIGKILL propagated as exit 137                                                                                                             | PASS   | Signal-number mapping depends on Node platform constants                                   |
| 21. Security and V00.3 scope    | No new exploit was required                                                         | No shell injection, secret logging, cross-app orchestrator, domain service, persistence, or World State | Fixed command mapping, `shell: false`, redacted errors, per-app ownership only; repository security checks passed                          | PASS   | Inherited environment remains unchanged; Vite browser exposure policy still gates `VITE_*` |

## State-machine and resource audit

- The public launcher has one `stoppingPromise`; later launcher signals reuse it.
- Each API, Worker, and Web process has one shutdown promise; later signals reuse
  the existing promise.
- API and Worker runtime objects retain their existing idempotent shutdown
  promise and one bounded server-close timer.
- Persistent SIGINT/SIGTERM handlers are registered before listener startup is
  scheduled. They remain installed until natural process exit.
- Natural active-request completion cancelled the server force timer and
  completed once. The held-incomplete-request attacks reached the forced close
  once at the configured five-second boundary.
- Every dynamic probe checked descendant exit, endpoint failure, and immediate
  port rebind before being marked PASS. Failure cleanup was separate and ran
  only after the observation was recorded.

## Platform statement

No shell command interpolation, `shell: true`, or process-group kill is used.
The isolated-outer-PID parent-identity check uses `ps` on POSIX systems and was
tested on macOS arm64. Windows signal and pre-sample parent-loss behavior were
not tested; public lifecycle tests are explicitly skipped there. No claim of
Windows lifecycle parity is made.

## Baseline gate

The full repository baseline passed during the completed correction round.
This candidate-finalization round did not rerun it. This document remains
implementation-side targeted self-audit evidence, not independent review.
