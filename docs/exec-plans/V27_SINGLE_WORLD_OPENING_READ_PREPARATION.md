# V27 worker-only persisted-opening read composition

## Gate and ownership

The prior V27 single-World preflight code at `0cdace33915751708194ccbe9df43356ff5457d9` received independent B code review BLOCKER=0/MAJOR=0, but cannot merge or run because V27.1–V27.3 and ADR-13 remain open. This next commit is separate `PREPARATION_ONLY` worker work; it does not inherit review approval. Do not edit C calibration, E API, D web, original main site, runtime startup, schema or production.

## Minimal executable slice

Add a worker-only read composition accepting the existing `WorldOpeningSeedStore` and raw single-World diagnostic input. It runs the existing preflight, requires opening SimTime zero, then calls only `WorldOpeningSeedStore.load(worldId)`. The store already canonicalizes and revalidates durable OpeningSeed lineage. Return a frozen read-only pairing of existing OpeningSeed identity/fingerprint and the separate preflight fingerprint/blockers. Never call `bootstrap`, create a seed from calibration, advance the clock, claim that preflight candidate data match the seed, execute NPC intents, or write a Command/Event/Posting. Missing/tampered seed fails closed.

A disposable PGlite test may set up its own opening row with the already existing store bootstrap; this is fixture setup, not new production behavior. The tested composition itself must make no database writes and remain outside `startWorkerRuntime`.

## Tests and open questions

Test WorldVersion-zero existing seed read, stable result, no write during inspection, missing seed rejection, nonzero SimTime rejection, and distinct candidate-vs-opening fingerprints. Re-run focused preflight/opening-store tests, Core/worker build/typecheck, targeted lint/format and boundary checks.

Still OPEN: V27.2 durable World/configuration provenance binding, real calibrated opening values, C source authority, ADR-13 NPC principal/policy, worker runtime integration, owner/independent review of this new commit, formal V27 gates and production access.
