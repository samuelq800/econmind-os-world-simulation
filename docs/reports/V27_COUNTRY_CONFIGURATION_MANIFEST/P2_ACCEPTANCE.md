# V27 country-source manifest — scoped P2 acceptance

`OWNER_FAST_TRACK_ACCEPTED` applies only to the non-authoritative tool/test
commit `5eb52ce`, cherry-picked from C's candidate `53da758` on mainline base
`e18a707`, with plan/evidence mappings `2006c84` and `42d2b4d`.

The tool describes an exactly-70-country **diagnostic** configuration manifest
and produces explicit source/parameter-coverage gaps. It supplies no country
values, policy defaults, verified source bytes, signed configuration authority,
OpeningSeed, or World generation. The country count here is the named
diagnostic scenario, not a new runtime hardcode. All authority booleans remain
false. Code changes are confined to `tools/v27` and `tests/foundation`; no
Core/Worker/API, schema, migration, production data or original website changed.

Combined mainline focused V27/V29 tooling tests passed 16/16; standalone
strict TypeScript, targeted ESLint/Prettier and diff check passed. C reported a
secret scan on its source candidate. Actual reviewed 70-country identities,
source-byte verification, configuration-owner attestation, parameter values,
Core/Worker binding and formal V27 review are `MISSING` or `NOT_RUN`.
