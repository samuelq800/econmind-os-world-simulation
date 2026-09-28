-- Extend only the inert candidate intake classification. This does not
-- activate either package or change World/OpeningSeed authority.
alter table world_v2.country_candidate_bundle
  drop constraint country_candidate_bundle_source_status_check;

alter table world_v2.country_candidate_bundle
  add constraint country_candidate_bundle_source_status_check
  check (source_status in (
    'ILLUSTRATIVE_PLANNING_ONLY',
    'IMPLEMENTED_UNVERIFIED_CANDIDATE'
  ));

comment on column world_v2.country_candidate_bundle.source_status is
  'Exact source-package status for separately versioned inert country candidates; no status grants activation.';
