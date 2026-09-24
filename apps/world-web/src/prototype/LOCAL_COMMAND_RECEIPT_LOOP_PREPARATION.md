# Opt-in browser Command → receipt → refreshed projection

`PREPARATION_ONLY_NOT_GATE_B`

Base: `0fa8da7e74488f4554185afb68c19b4933d72586`.
`status/progress.json` still marks V10.4, V25.2 and V25.3 `PLANNED`.
This candidate is not their formal completion.

The default `prototype.html` still mounts `<PrototypeApp />` without trusted
configuration and remains `LOCAL_FIXTURE`. An external trusted host may supply
`localAuthorizedRead` with a current identity, access-token callback, explicit
loopback bridge origin, and an optional `narrowTransferDraft`. None of these
are derived from URL parameters, fixture values, or the original EconMind site.
Only the F browser client uses the token; this page does not persist or log it.

The playable authorized route is deliberately narrow:

1. Click **Connect & read**. F performs `readProjection`. The G02 view and
   Command review remain unavailable unless the injected result also passes
   the existing `g02-derived-read-v1` display binding.
2. From G02, return to G01. A host-supplied narrow transfer draft must target
   exactly the current read World version. The player opens **Review transfer**
   and confirms **send once**. The browser composes no economic terms; the
   server remains responsible for authorization and validation.
3. While F's `submitNarrowTransfer` is in flight, the old projection is cleared
   and the UI says **Sending · not confirmed**, not accepted or successful.
4. Only a matching durable final receipt can produce `SUCCEEDED`, `REJECTED`,
   or authorization-revoked display. A final receipt does not itself update
   G02; the player must refresh the scoped projection and reach the receipt's
   World version before values appear. The same Command ID is not sent again
   in this session.
5. `UNKNOWN` clears values and blocks reads and repeat submission until an
   external trusted receipt lookup supplies the matching final receipt. F/E
   currently do not expose that lookup in this page, so this remains a visible
   stop, not an automatic retry or fabricated final receipt.

Disconnect, identity changes and late responses clear/ignore old private
content. The fictional atlas is still navigation art, not server geography.
Only the narrow transfer route is prepared; other six-Office actions remain
fixture rehearsals, not authorized commands.

Scope: `apps/world-web/src/prototype` and focused `tests/world-web` only. No
F client, E/C API, Core, DB, migration, Gate/status, production, or original
main-site changes. A real trusted host, server-bound G02 payload, authenticated
browser submission, receipt lookup and full Gate B E2E are `NOT_RUN`.
