# Final receipt lookup UI preparation

`NOT_LIVE` · `NOT_GATE_B`

Base: `fc1e4f977d3de1196c2b3c447fa099bdb381f828` (the original
Command/key/fingerprint binding candidate). E's receipt-read API candidate
`4f99422ad03b5e5d982110eff3d0fa79f097c339` was not merged into this
branch. This UI does not import it, run its bridge, or claim a live lookup.

Only a trusted host may inject `lookupFinalReceipt`. The host owns Bearer-token
transport and the loopback URL. The UI sends exactly the E candidate request
envelope, with only `worldId`, the originally submitted `commandId`, and the
original `idempotencyKey` in its payload. It sends no country, Office, or
browser-held scope. The button is available only for a locally submitted
UNKNOWN with a captured trusted fingerprint binding; it never retries the
Command. `NOT_FOUND`, malformed envelopes, mismatched receipts, transport
errors, or changed identity retain UNKNOWN and keep the old projection hidden.
Only an exact original key/fingerprint/identity match can display a final
receipt, and the projection still requires a separate refresh.

Next gate: independently review the D and E candidates, bind a real trusted
host and E bridge in an isolated non-production environment, then perform
browser E2E. No World Core, API, database, original site, production data, or
Gate status is modified here.
