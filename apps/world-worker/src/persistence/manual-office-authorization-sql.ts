/** Exact current membership lookup; no cached authorization verdict. */
export const MANUAL_OFFICE_CURRENT_MEMBERSHIP_QUERY = `select a.team_id, a.authorization_version from world_v2.current_commit_authorization a
       where a.world_id=$1 and a.auth_subject=$2::uuid and a.country_id=$3
         and a.office_id=$4 and a.capability=$5 and a.active
         and not exists(select 1 from world_v2.current_commit_authorization other
           where other.world_id=a.world_id and other.auth_subject=a.auth_subject and other.active
             and (other.country_id is distinct from a.country_id or other.team_id is distinct from a.team_id
               or other.authorization_version is distinct from a.authorization_version))`;
