# Fix only independently reported blockers

Read the current step prompt, latest independent review, governing specs,
approved ADRs, and affected files. Confirm each blocker is still reproducible.
Change only what is necessary to resolve those blockers and add regression
tests that exercise the reported failure paths.

Run the full required gate and update implementation and test evidence without
rewriting the independent review. Keep the result
`IMPLEMENTED_UNVERIFIED`; request re-review. Do not address deferred findings,
approve ADRs, expand scope, start a later step, or touch production Supabase.
