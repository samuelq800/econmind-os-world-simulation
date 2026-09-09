# Continue an interrupted R2 step

Identify the active step from `status/progress.json` and repository evidence.
Read its step prompt, execution plan, implementation report, test evidence,
current diff, and unresolved review comments. Confirm that its dependencies and
authorization remain valid.

Resume only unfinished work within that step. Preserve existing user changes,
do not repeat completed work, and do not expand scope. Re-run tests affected by
the continuation and update evidence honestly. Apply the centralized
FAST_MAINLINE policy: P0 must stop for independent review; lower-risk work may
continue only through its recorded policy path.
