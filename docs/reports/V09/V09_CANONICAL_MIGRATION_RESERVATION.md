# V09 Canonical Migration Reservation Binding

## Exact binding

| Item | Value |
| --- | --- |
| Candidate | `dadad8292f7b2e3f16430052d1e599d733c76031` |
| Remote ref at review | `origin/codex/v09-recovery-preparation` |
| Manifest blob | `6eb5ee0487c5521d065eae204fbe9f781036711a` |
| Sequence review decision | `CAN_RECORD_V09_MIGRATION_RESERVATION=YES` |
| Recorded blockers / majors / minors | `0 / 0 / 0` |
| Scope | Canonical migration-number and provenance reservation only |

The reviewed manifest binds the following consecutive release slots. Each
entry's artifact bytes, manifest SHA-256 and source-commit copy matched during
the sequence review.

| Release order | Canonical artifact | Source commit | SHA-256 |
| --- | --- | --- | --- |
| 0007 | `0007_world_v2_atomic_transition_facts.sql` | `080502fdc5615a05910120c9170adaf113ad0ce0` | `4f91759a05092b3d9432b3743ad2a4abddb20e5730eb02450ffa96c15d982a61` |
| 0008 | `0008_world_v2_materialization_recovery.sql` | `81a0022be738f8720dc5f9ca379d6556943adede` | `f35ccc9273e94766a942d9b50ed87cf2fa32387993be44ee562a4853d400a1bb` |
| 0009 | `0009_world_v2_posting_payload_integrity.sql` | `4bba830119b259104cd3c09f718cfdb66e4bdaa9` | `189607be57cbce235685fc4ab7a8a1c69e1b2f8e3ea235cdec9ad7b61a831498` |
| 0010 | `0010_world_v2_command_claim_fencing.sql` | `6276fbd8a53447be7e015e275b4d57725e41e98a` | `7131f64afd486e26fe038839448dcb9f5df117a75d7265b453ca55b851fb1447` |
| 0011 | `0011_world_v2_current_commit_authorization.sql` | `f86167afad56d3f27537df8e88131aa02b4bb0a8` | `89d7c6c3ae977fa835af6f3aa8d5dea012dee4a77f0ee38a0e7cc434d7373722` |
| 0012 | `0012_world_v2_command_claim_active_lease_guard.sql` | `f86167afad56d3f27537df8e88131aa02b4bb0a8` | `01bef128971818338cbb9e54eca010ac24d5585e035b9d1bd17373ab1e0677f9` |

`0007_world_v2_atomic_transition_facts.sql` is the canonical V09 atomic
transition slot. A preparation candidate must not reuse that number. Any later
projection-preparation artifact must use a non-conflicting number, bind its
own source commit and bytes in the manifest, and receive a fresh review.

## Preserved boundaries

This record does **not** apply a migration, publish DDL, authorize a runtime,
change `status/progress.json`, mark V09.2 or V09.3 implemented or verified,
authorize V10, merge to `main`, or authorize any production/shared-Supabase
access or mutation. It merely preserves the reviewed numbering/provenance
facts needed for a later branch-local preparation candidate.
