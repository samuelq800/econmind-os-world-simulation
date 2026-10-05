# ADR-18 descriptive progress reconciliation

Date: 2026-10-05 (Asia/Shanghai). Base:
`5e4b9d9ae50b04149a5a6e67478051dc1b1d8ec1`.

`status/decisions.json` and
`docs/architecture/decisions/ADR-18.md` already record ADR-18 APPROVED at
2026-09-10T16:20:14Z. Its exact scope is disposable local/CI PostgreSQL and
isolated staging, with Web/API/Worker ownership separation. Production
topology, cost, publication, cutover and mutation are excluded.

The previous progress note, review description and blocker text incorrectly
described this existing decision as still awaiting approval. This candidate
changes only those three descriptive fields. It grants no new approval and
does not reinterpret the source decision.

Preserved without changes:

- All 101 step states, all package/evidence/review records and dependencies.
- Current/next step V09.1; status PLANNED; `next_step_ready=false`.
- Historical `required_gate=V09.1_ADR_18_DECISION`; `gate_status=PENDING`.
- Decision register, all ADR documents, historical timestamps/source commits.
- Missing dedicated staging, trusted identity/deployment and real browser
  Command-to-FINAL/projection evidence. No Gate B closure is supplied.

The historical gate identifier remains for compatibility with the existing
validator. It is not a claim that ADR-18 itself remains unapproved. Renaming
the gate or promoting a step requires its own reviewed reconciliation and
actual evidence, not this descriptive repair. ADR-09, economic opening rules
and production activation are deliberately outside this patch.

Baseline `python3 tools/validate_r2_governance.py`: PASS, exit 0; 101 steps,
33 packages, 27 VERIFIED and 74 PLANNED. Candidate checks are reported on the
fixed PR; no earlier application test counts are relabelled as new runtime
evidence. This candidate changes no validator or application code, does not
access a database and does not enable API commands, a Worker or an OpeningSeed.
