# World V2 selected-source snapshot connection

Status: PROPOSED_NOT_APPROVED. Non-production candidate only; no ADR, runtime
gate, production release, source selection or opening state is self-approved.
This forward proposal is required by ADR-18's production topology boundary.

Keep the existing DB connection publisher HOLD, NOLOGIN and old PUBLIC ACLs
unchanged. A new `world-v2-official-source-v1` public bucket would contain only
the existing 34-whitelisted JSON sources under the fixed selection SHA prefix,
with each object named by content SHA256. The frozen 87-artifact candidate
provenance is verified, not converted into a new World State. No other source
or map binaries are implicitly approved for public upload.

The API-owned server adapter uses credential-free, fixed-origin public GET,
no redirects, bounded timeout/body and pinned byte count/hash, then feeds the
existing DTO, pagination, association and exact-decimal handlers. No SQL,
service role, password, environment dump or new browser import is introduced.
The Edge transport header explicitly identifies a source snapshot; it is not
a live database-backed economic projection. A modified/missing object fails
closed; Storage is not WORM and project administrators can still mutate it.

Only the main-site controlled publisher may create the new bucket/objects,
after immutable source pins, real DB source readback hashes, CI, independent B
approval and explicit forward production authorization. Create-only uploads
never upsert; identical existing objects are readback-verified for idempotency,
conflicts stop. No old bucket/object, RLS policy or global grant may be altered.
Publisher-only Storage administration is a separate permission decision:
official CLI remote uploads retrieve a service-role key using Management API;
they are not anon/publishable writes. No such key may enter Edge runtime,
logs, artifacts, source, persistent config or browser code. This candidate has
not acquired a key or performed any production operation.

Rollback means separately authorized removal/disablement of this new function
and only this release's new bucket/objects; no automatic destructive rollback
or old infrastructure mutation. DB runtime, worker, OpeningSeed, settlement
and Gate B are unchanged. Governance/credential approval remains pending.
