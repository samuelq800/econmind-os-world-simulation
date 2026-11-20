/** Offline/native fixture selection only. The private immutable country scope
 * has a database-enforced 256 KiB bound. Never parse opening_seed here: an
 * inlined full-seed lateral query previously exhausted the isolated PG memory.
 * Core/source-cutoff validation still decides whether the command can commit. */
export const SELECT_POSTWAR_COUNTRY_VACANCY_SOURCE = `
with bounded_scope as materialized (
 select scope_document,octet_length(scope_document)as scope_bytes,scope_sha256,seed_fingerprint,admission_ref,source_id,source_payload_hash
 from world_v2.postwar_social_prefix_scope
 where world_id=$1 and country_id=$2
 and octet_length(scope_document)<=262144
 and scope_sha256=encode(sha256(convert_to(scope_document,'UTF8')),'hex')
), parsed as materialized (
 select scope_document::jsonb as d,scope_bytes,scope_sha256,seed_fingerprint,admission_ref,source_id,source_payload_hash
 from bounded_scope
)
select w as wage,f as funding,scope_bytes,scope_sha256,seed_fingerprint,admission_ref,source_id,source_payload_hash
from parsed
cross join lateral jsonb_array_elements(d->'wages')w
cross join lateral jsonb_array_elements(d->'funding')f
where d->>'countryId'=$2 and w->>'countryId'=$2 and f->>'countryId'=$2
and w->>'owner'='PUBLIC_SERVICE' and w->>'employerRole'='GOV'
and w->>'occupation'='GENERAL' and w->>'wagePeriod'='SIM_YEAR'
and w->>'classificationId'in('PUBLIC_SAFETY','PUBLIC_ADMINISTRATION')
and f->>'payerRole'='GOV' and f->>'payerEntityId'=w->>'employerId'
and f->>'currency'=w->>'wageCurrency'
and (w->>'wageAmount')::numeric>0
and (f->>'remainingAmount')::numeric*360>(w->>'wageAmount')::numeric
and exists(select 1 from jsonb_array_elements(d->'aggregates')a
 where a->>'countryId'=$2 and a->>'locationId'=w->>'locationId'
 and a->>'skill'=w->>'skill' and a->>'status'='UNEMPLOYED_SEARCHING'
 and (a->>'count')::numeric>0)
order by w->>'positionId',f->>'accountRef' limit 1`;
