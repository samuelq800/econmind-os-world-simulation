# Account ownership scenario construction V2

This offline Node 24 tool reproduces three frozen, **CONSTRUCTED_NOT_ADOPTED**
declaration/requirement documents. It does not register a source, create a Core
account or World, grant permission, issue funds, or close any original field.

```sh
node tools/unknown2544-a-accounts/construct.mjs --check
```

The module-relative reader uses the four exact repository sources in
`source-pins.json`, not the current working directory, another worktree, the
author's artifact directory, environment variables, or a configurable provider.
The 17-batch file at
`data/scenario-candidates/unknown2544/approved17/execution_batches.v1.json` is the
single shared original-byte input for A/G. Do not maintain a second cropped plan.
The other three inputs already exist in Git. No database/network access or output
file writes occur. The CLI prints only output hashes, sizes and authority-deny
markers; callers may import `buildAccountOwnershipCandidateV2()` for the exact
three UTF-8 JSON strings. Output key order and LF encoding are frozen.

- 353 unique scene account declarations, 350 document-local own registers.
- Only five C01 original IDs have the approved eight-endpoint typed-register
  representation; the other 345 remain claim-free CASH declarations with missing
  World/date/legal issuer, **not valid Core accounts** or extended C01 exceptions.
- 350 B06 and 420 B16 original IDs are construction/requirement coverage, not
  accepted account/permission coverage. B16 requirements are not authorization
  parser payloads. No real subject/team/seat/grant is invented.
- Nominal currency/date references and document-local scenario keys are not
  admitted currency, inactive-opening anchors, historical accounts or legal
  source/custody capability. Missing actual values stay null/UNKNOWN/false.

Existing C01 consumers may inspect separately selected normalized declarations
under their unchanged contracts; this tool supplies data, not a new runtime
adapter. It never calls that reader or replays the old HH01 fixture. The formal
`tests/world-core/a-account-ownership-construction.test.ts` checks byte identity,
coverage, role/authority boundaries, input drift and module-relative execution.
No test result here is source adoption, independent review, or deployment.
