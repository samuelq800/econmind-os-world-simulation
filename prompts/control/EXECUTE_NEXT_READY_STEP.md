# Execute one dependency-ready R2 step

Read the repository governance and determine the first explicitly authorized
step whose hard dependencies are all `VERIFIED`. Confirm its status in
`status/progress.json`, then read only `prompts/steps/<STEP_ID>.md`, the relevant
specifications, approved ADRs, and affected code.

If authorization, dependencies, decisions, or required evidence are missing,
stop with the precise blocker. Otherwise execute only that one step, run real
tests, and create its implementation and test-evidence reports. Finish as
`IMPLEMENTED_UNVERIFIED`, `CHANGES_REQUIRED`, or `BLOCKED`; never self-promote
to `VERIFIED` and never begin the following step automatically.
