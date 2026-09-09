# V05.1 implementation report

## Status

- Implementation commit: `2a5cff3b825c88e23dddc6dcb08186252d5f8b5c`
- Effective risk: P0 identity and server authorization
- Status: `IMPLEMENTED_UNVERIFIED`; Gate A independent review required

## Implemented scope

The identity bridge accepts exactly `user_id`, `display_name`, and `school_id`
after an injected server verifier validates the signed-token envelope. Subject
mismatch and any portable `role`, `platform_role`, country, Office, credential,
or other extra field fail closed.

The six canonical Offices and coarse capability families are fixed in World
Core. `authorizeOfficeCapability` obtains current membership, country, Office
assignments, suspension, and authorization version from a server resolver. It
rejects unauthenticated, removed, suspended, cross-World, cross-country,
unassigned, cross-Office, and forged-client authority. The issued Office
context has a runtime-private brand and cannot be reconstructed from JSON.

No token cryptography, main-site route, credential, browser authorization, or
economic Command was implemented.

The first full workspace build later exposed that TypeScript could not name the
privately branded type of an inferred exported Office-ID array in declaration
output. The export now has an explicit `readonly OfficeId[]` annotation; no
runtime or authorization behavior changed.
