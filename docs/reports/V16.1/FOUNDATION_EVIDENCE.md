# V16.1 Housing Foundation Evidence

## Candidate disposition

`FOUNDATION_IMPLEMENTED_UNVERIFIED`. This report does not establish a housing
programme, project completion, benefit payment, rent policy, database change or
production outcome.

Every source fact is canonical-payload bound to source/predecessor IDs and the
same lineage/version/snapshot/time before the calculation can proceed.

## Implemented calculation boundary

`calculateHousingFoundation` reads identified total/habitable/occupied stock,
three sources of housing-unit demand, rent state/version, subsidy, and project
commission evidence. It returns exact unit stock, occupancy, vacancy and gap
with replay transitions.

Only a `COMMISSIONED` record with explicit project, commission and completion
time can increase total or habitable units. The subsidy and rent are retained as
observed caller-owned inputs; neither has a default supply or price formula.

## Focused evidence

The focused suite proves a much larger subsidy leaves physical stock unchanged,
while an explicit commissioned handoff alone adds units. An uncommissioned unit
claim is rejected.
