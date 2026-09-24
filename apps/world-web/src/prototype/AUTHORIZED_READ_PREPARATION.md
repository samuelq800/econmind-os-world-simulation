# Injected authorized read display preparation

`PREPARATION_ONLY_NOT_V25_2_OR_V25_3_STARTED`

Base: `45990429bb5405675d72cfde0299ca176084485c` (non-production main).
`status/progress.json` still has V25.1–V25.3 and V25.2 hard dependencies
`PLANNED`. This slice does not start the formal V25.2/V25.3 work package.

The browser client in `apps/world-web/src/authorized-client/client.ts` can
return a `BrowserReadResult` or `BrowserCommandResult`, but its read payload is
intentionally `unknown`; the current E bridge does not publish a G02 metric
contract. The prototype therefore accepts **injected** results only. It
does not create a client, call `readProjection`, submit a Command, or fetch.
The display adapter requires a matching current identity, a
`DERIVED_SERVER_PROJECTION` result, and a narrow, version-bound G02 payload.
That payload is currently an adapter-only `g02-derived-read-v1` shape. It binds
world/country/Office/scope/subject/authorization/model/projection version,
classification, worldVersion and snapshotRef, with exact integer metric values.
A value trail is shown only when input sourceRef, event ID/version and exact
input + difference = output are all supplied. This is a display check, not
client-side economic settlement. E's current bridge does **not** supply this
shape, so merely passing its ordinary read result shows unavailable.
Absent, stale, mismatched, denied, or disconnected reads expose no authorized
metric or trace and never substitute the local fixture.

Default use remains the existing visibly labelled `LOCAL_FIXTURE` rehearsal.
When an injection is present, G01 is read-only and the G02 signal surface
uses only the validated injected payload. Fixture Office actions are not
offered in that mode. `UNKNOWN` Command outcomes mean look up the original
Command ID and invalidate the old projection; only a supplied durable final
receipt can produce a final status. A committed receipt ahead of the read
watermark also withholds metrics until a refreshed projection arrives.
Authorization change/denial and disconnected or stale reads clear authorized
private values on the next injected state update.

The authorized G01/G02 branch reuses the Office shell and fictional atlas.
It has no fixture role-action buttons; the atlas is labelled as navigation art
and never treated as geographic evidence for the injected country. The G02
signal picker and accessible value trail expose only validated injected data.
The trail links a final receipt only when a supplied committed receipt names
its event ID and version; otherwise it explicitly says the receipt is absent.

The adapter validates _display binding_, not user identity or API authority;
the authorized browser client and server remain responsible for those. This
slice edits only `apps/world-web/src/prototype` and focused `tests/world-web`.
Reads: injected F client result and derived payload. Writes, new Events,
Commands, receipt creation, DB/RLS, production, F/E/Core files, original main
site: none. Real browser/server E2E: `NOT_RUN`.
