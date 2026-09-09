# Execute one dependency-ready R2 step

Read the repository governance and centralized FAST_MAINLINE policy, then
determine the first explicitly authorized dependency-ready step. Confirm its status in
`status/progress.json`, then read only `prompts/steps/<STEP_ID>.md`, the relevant
specifications, approved ADRs, and affected code.

If authorization, dependencies, decisions, or required evidence are missing,
stop with the precise blocker. Otherwise execute only that one step, run real
tests, and create its implementation and test-evidence reports. Finish and
continue only as permitted by
`docs/governance/FAST_MAINLINE_REVIEW_POLICY.json`. P0 always requires blocking
independent review; no failed mandatory check can be bypassed.
