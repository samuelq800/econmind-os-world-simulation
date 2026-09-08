# Continue an interrupted R2 step

Identify the active step from `status/progress.json` and repository evidence.
Read its step prompt, execution plan, implementation report, test evidence,
current diff, and unresolved review comments. Confirm that its dependencies and
authorization remain valid.

Resume only unfinished work within that step. Preserve existing user changes,
do not repeat completed work, and do not expand scope. Re-run tests affected by
the continuation and update evidence honestly. Stop after the current step and
request independent review; do not start its successor.
