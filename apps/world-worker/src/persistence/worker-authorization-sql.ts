/** Fixed authoritative cutoff statements. A native database adapter may
 * delegate these exact lock reads to its reviewed definer functions, without
 * granting the economic worker permission to update authority rows. */
export const WORKER_CURRENT_AUTHORIZATION_LOCK_QUERY = `select auth_subject::text as auth_subject,
              world_id,
              country_id,
              office_id,
              capability,
              team_id,
              authorization_version
         from world_v2.current_commit_authorization
        where world_id = $1
          and auth_subject = $2::uuid
          and country_id = $3
          and office_id = $4
          and capability = $5
          and active
        for key share`;

export const WORKER_REVOKED_AUTHORIZATION_LOCK_QUERY = `select 1
         from world_v2.current_commit_authorization
        where world_id = $1
          and auth_subject = $2::uuid
          and country_id = $3
          and office_id is not distinct from $4
          and active
        for key share`;
