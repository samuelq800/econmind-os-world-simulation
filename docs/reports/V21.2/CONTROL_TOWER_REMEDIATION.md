# V21.2–V21.3 focused review remediation

Base candidate: `509ceabfbd081237efbf97475af7721378edbb73`.

The independent Control Tower review found two fail-open inputs and a customs
binding gap in the pure-Core candidate:

- Unknown runtime trade directions and control kinds could leave eligibility
  allowed because TypeScript unions are absent at runtime.
- An allowed eligibility result could be reused for a different country,
  commodity, request, or quantity at customs assessment.

This branch adds runtime discriminator rejection, binds eligibility identity
to the declaration, and refuses a zero or over-permitted customs quantity.
The eligibility identity and decision are included in the replay output.

Focused V20+V21 tests: 2 files / 9 tests passed. Core typecheck, Core build,
formatting, and diff check passed locally. This remediation is a review
candidate, not a product verification or Gate decision. It requires a separate
narrow review before owner acceptance and mainline integration.
