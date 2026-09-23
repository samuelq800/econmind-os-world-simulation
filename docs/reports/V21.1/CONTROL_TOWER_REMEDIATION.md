# V21.1 focused review remediation

Base candidate: `0c7ed26236ce4a25b5252c77c9609a60502dbddc`.

The Control Tower review found that an unmatched order whose expiry falls
between the final action and the replay snapshot remained `OPEN`, leaving a
seller reservation held after expiry. The book now applies expiry at the
snapshot time as well as before each action. A focused case verifies the
expired status, release movement, and restored available capacity when no
later action exists.

The composed V21 candidate also carries the separate V21.2–V21.3 customs
binding remediation. Combined focused V21 tests passed locally: 2 files,
12 tests. Core typecheck, formatting, and diff check passed. Independent
narrow review of these remediations is still required before owner acceptance
or mainline integration. No product or Gate state is promoted.
