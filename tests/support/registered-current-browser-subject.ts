import assert from 'node:assert/strict';
/** Same fixed query as registered-utility-checkpoint-restore. Inspection-only
 * authorizations without an actual, unrevoked actor binding are not HTTP seats. */
export const REGISTERED_CURRENT_BROWSER_SUBJECT_QUERY =
  "select distinct a.country_id,a.auth_subject::text,b.actor_id from world_v2.current_commit_authorization a join world_v2.world_actor_binding b on b.world_id=a.world_id and b.auth_subject=a.auth_subject where a.world_id=$1 and a.office_id='INDUSTRY'and a.active and not exists(select 1 from world_v2.world_actor_binding_revocation r where r.world_id=b.world_id and r.binding_ref=b.binding_ref)order by a.country_id";
export interface RegisteredCurrentBrowserActorBinding {
  readonly country_id: string;
  readonly auth_subject: string;
  readonly actor_id: string;
}
/** Token payload comparison is an audit of setup identity, not JWT validation.
 * The unchanged real Node still verifies signature, session and current seat. */
export function registeredCurrentC2BrowserSubject(
  joinedBindings: readonly RegisteredCurrentBrowserActorBinding[],
  setupToken: string,
): string {
  const selected = joinedBindings.filter((r) => r.country_id === 'COUNTRY_02');
  assert.equal(selected.length, 1, 'SAME_EXISTING_C2_AUTH_SUBJECT_REQUIRED');
  const binding = selected[0]!;
  assert.ok(
    binding.actor_id && binding.auth_subject,
    'ACTUAL_REGISTERED_HTTP_ACTOR_REQUIRED',
  );
  const parts = setupToken.split('.');
  assert.equal(parts.length, 3, 'SETUP_JWT_REQUIRED');
  const payload: unknown = JSON.parse(
    Buffer.from(parts[1]!, 'base64url').toString('utf8'),
  );
  assert.ok(payload && typeof payload === 'object' && !Array.isArray(payload));
  assert.equal(
    (payload as { sub?: unknown }).sub,
    binding.auth_subject,
    'SETUP_JWT_MUST_MATCH_REGISTERED_C2_HTTP_SUBJECT',
  );
  return binding.auth_subject;
}
