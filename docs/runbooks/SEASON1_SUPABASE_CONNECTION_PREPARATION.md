# Season 1 team connection preparation — 2026-09-27

Status: source/configuration confirmed; live authenticated team read NOT_RUN.
The user is preparing the UI and requested Supabase connection preparation
using the **recent Season 1-specific lobby**, not previous team systems.
This handoff does not deploy a route, approve new World permissions, modify
the original website, or publish any SQL to the shared production project.

## Exact source, not a guessed team version

- Source repository: `samuelq800/econmind-os` (original website, read-only here).
- Successful Pages run:
  [36296944556](https://github.com/samuelq800/econmind-os/actions/runs/36296944556),
  source commit `210afd804d9116efe4e68e160edc2aab68d9d90a`.
- Also inspected remote main `7ab221b26ee63030b48d65380ee74634729f28da`;
  the two files below are byte-identical between those commits.
- Client: `lib/supabase/season1.ts`, `getSeason1MyTeam()` /
  `Season1MyTeamData`; SHA-256
  `aaac2180a2b9b69eb61f3f03aa191f083f0da41f7fbd2afe4623323701beafa4`.
- Contract source:
  `supabase/migrations/20260926000000_season1_my_team.sql`; SHA-256
  `4ec1af1cc3e49e5cf4388e85401de9b625daec48c3219ff97a928e2475fdd009`.
- Sole planned upstream read: `public.get_world_preseason_my_team()`, no
  arguments. Its SQL resolves `auth.uid()` and joins the season with
  **`code = 'season-1'`**. It does not select a team by recency or accept a
  browser-supplied user/team/season ID.
- The original participant guard requires an authenticated, active account.

Do not fall back to legacy League, Live World, generic team tables,
`get_world_preseason_admin_lobby`, or an older RPC if this RPC is unavailable.
The recent team code and six-member-capacity fields help identify this source,
but neither a name nor a capacity is an authority check. The response does not
include a season ID: any `season-1` provenance label describes the fixed RPC
contract, not independently verified live database state.

## Shared Supabase project

The original website's GitHub deployment variable `SUPABASE_PROJECT_REF`
currently equals `vimksjrhaxdpnkvgsavz`. The V2 checkout's existing local link
metadata matches it. Therefore the preparation target is:

`https://vimksjrhaxdpnkvgsavz.supabase.co`

The other project mentioned earlier in conversation is not substituted. No
key, password, session token, service-role credential or database URL is copied
into this document. No remote team records were fetched during this inspection.
Successful old-site deployment is source/configuration evidence, not a new
authenticated end-to-end V2 connection test.

Server configuration template:
[`season1-lobby.env.example`](../examples/season1-lobby.env.example). All values
are intentionally empty. The candidate reader expects
`WORLD_LOBBY_SUPABASE_PROJECT_REF`, `WORLD_LOBBY_SUPABASE_URL` and
`WORLD_LOBBY_SUPABASE_PUBLISHABLE_KEY`. The URL must match the project's exact
HTTPS origin. The public key is not a user session and does not grant roster
access by itself. Service-role/secret credentials are not accepted. Do not
copy these variables into `VITE_*` or the existing local bridge environment.

## Connection and identity boundary

The new UI should consume a reviewed World API read response. Only the
server-owned adapter calls the fixed existing Supabase RPC, carrying the
requesting user's access token and a separately configured public API key.
Supabase's existing RPC/participant authorization selects that user's team.
The adapter must not accept a service-role bypass or retrieve another roster
by changing a request parameter. Disable redirects and shared response caches;
never log tokens or upstream response bodies containing personal information.

This slice is read-only; it does not create, import, synchronize, rename or
duplicate teams. The old Season 1 lobby remains the roster source of truth.
Joining/leaving, captain changes and recruitment remain on the old site.

Using the same Supabase project does **not** by itself share a browser session
across website origins. When the UI host is known, prepare the explicit login
and callback/session path. Do not place access tokens in URL parameters or
ask the user to paste a session/password into source control. Session setup
and a signed-in user's own-team smoke test are deferred, not marked PASS.

## UI data handoff

| Existing source                                                                               | UI use                                                  | Boundary                                                            |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------- |
| `team.id`, `team.name`, `team.code`                                                           | Stable team identity, title and invitation code display | Preserve UUID; do not create another team ID or infer a country     |
| `team.description`, `capacity`, `status`, `recruitmentMode`, `preferredLanguage`, `teamStyle` | Team summary                                            | Display only; do not duplicate lobby mutations                      |
| `team.captainUserId`, `membership.memberRole`                                                 | Captain/member presentation                             | Captain does not imply World administrator or Finance authorization |
| `members[].userId`, `displayName`, `schoolName`                                               | Own-team roster                                         | School is descriptive, not a cross-school restriction               |
| `members[].rolePreferences`                                                                   | Preferred responsibilities                              | Preferences are not approved Office appointments                    |
| `membership.isReady`, `members[].isReady`, `joinedAt`                                         | Lobby readiness and join information                    | Readiness is not World activation or economic approval              |

Keep no-team, unauthenticated, access-denied, unavailable-RPC and network-error
states distinct. A successful `{team:null,membership:null,members:[]}` response
means no team; failures must not be converted to that result or fixture data.
Fetch fresh identity-scoped data after sign-in or a roster change; do not reuse
another user's cached roster. The first slice does not include chat, invites,
applications or a directory of other teams.

## Remaining activation checklist

1. E implements and tests the server-only read adapter and exact configuration
   validation in an isolated V2 branch. It is not installed into the default
   API/web entrypoint by this document.
2. Review the frozen code candidate and ordinary negative/compatibility tests;
   reject wrong project/redirects/elevated credentials/legacy-RPC fallback.
3. Select the new UI origin and deploy-time session/configuration mechanism;
   mount the reviewed adapter through a same-user read route, not a generic RPC
   proxy. Keep connection keys server configured and user sessions per request.
4. With an authorized signed-in user, read only that user's Season 1 team and
   compare team ID and roster with the old lobby. Live access is NOT_RUN now.
5. Separately define/review team-to-World/country/Office assignment. This read
   preparation neither grants simulation permissions nor closes the Reserve
   authority-bridge gap, Gate B, or production release.

No database migration is needed merely to prepare this existing-RPC reader.
If the expected RPC is missing remotely, report the version mismatch; do not
execute SQL, repair migration history or switch to an older team system.
