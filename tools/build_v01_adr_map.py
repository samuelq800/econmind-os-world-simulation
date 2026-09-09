#!/usr/bin/env python3
"""Build the V01.2 ADR conflict, dependency, and blocking graph."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]

ADR_RELATIONSHIPS = [
    ("ADR-01", "ADR-03", "Phase ordering requires the clock and cutoff contract."),
    ("ADR-01", "ADR-04", "Phase mapping must preserve opening/current/prior-day reads."),
    ("ADR-02", "ADR-05", "Inventory ownership fields constrain cross-border title transfer."),
    ("ADR-02", "ADR-07", "Facility and capital owners constrain construction recognition."),
    ("ADR-02", "ADR-11", "Command and receipt ownership constrain idempotent replay."),
    ("ADR-02", "ADR-12", "Canonical owners constrain authorized projections."),
    ("ADR-02", "ADR-20", "Historical actor references depend on canonical ownership."),
    ("ADR-03", "ADR-04", "Clock/cutoff rules determine which period values may be read."),
    ("ADR-03", "ADR-11", "Idempotency is evaluated against accepted simulation time."),
    ("ADR-03", "ADR-17", "Checkpoint and recovery semantics require a fixed clock."),
    ("ADR-04", "ADR-05", "Trade recognition timing depends on period read rules."),
    ("ADR-04", "ADR-06", "Domestic supply closure must avoid same-day recursive inputs."),
    ("ADR-04", "ADR-07", "Construction value added depends on current/prior-period rules."),
    ("ADR-04", "ADR-08", "Price and flow formula periods depend on read timing."),
    ("ADR-05", "ADR-10", "International subtype adapters require title-transfer rules."),
    ("ADR-05", "ADR-17", "Transit and delivery facts require atomic persistence."),
    ("ADR-06", "ADR-07", "Construction inputs depend on the domestic supply catalogue."),
    ("ADR-06", "ADR-08", "New domestic services require units and price functions."),
    ("ADR-08", "ADR-15", "Scoring and CPI attribution require fixed formula versions."),
    ("ADR-09", "ADR-12", "Required offices constrain private authorization projections."),
    ("ADR-09", "ADR-20", "Membership revocation constrains approval validity."),
    ("ADR-10", "ADR-16", "International adapters constrain migration artefacts."),
    ("ADR-11", "ADR-17", "Replay receipts constrain persistence and recovery."),
    ("ADR-12", "ADR-19", "Projection classes constrain cross-origin caching and login."),
    ("ADR-12", "ADR-20", "Projection access must follow current identity lifecycle."),
    ("ADR-14", "ADR-16", "Legacy/V2 coexistence constrains schema publication."),
    ("ADR-14", "ADR-19", "Mode routing constrains login and proxy behavior."),
    ("ADR-14", "ADR-20", "Legacy history preservation constrains identity deletion."),
    ("ADR-16", "ADR-18", "Migration publication depends on environment isolation."),
    ("ADR-17", "ADR-16", "Persistence contracts constrain migration artefacts."),
    ("ADR-17", "ADR-18", "Recovery and fencing depend on runtime isolation."),
    ("ADR-19", "ADR-20", "Session lifecycle must enforce current authorization."),
]


def load_json(relative: str) -> Any:
    return json.loads((ROOT / relative).read_text(encoding="utf-8"))


def main() -> None:
    decision_data = load_json("status/decisions.json")
    steps = load_json("planning/r2_steps.json")["steps"]
    packages = load_json("planning/work_packages.json")
    package_ids = {package["id"] for package in packages}
    first_step_by_package: dict[str, str] = {}
    for step in steps:
        first_step_by_package.setdefault(step["work_package"], step["step_id"])

    adrs = []
    for record in decision_data["decisions"]:
        affected = record["affected_work_packages"]
        if not set(affected) <= package_ids:
            raise ValueError(f"unknown package in {record['id']}")
        adrs.append(
            {
                "id": record["id"],
                "conflict_subject": record["subject"],
                "coordination_proposal": record["proposal"],
                "decision_status": record["status"],
                "approval_record": record["approval_record"],
                "approval_required_from": record["approval_required_from"],
                "latest_gate": record["latest_gate"],
                "affected_work_packages": affected,
                "first_affected_steps": [first_step_by_package[item] for item in affected],
                "current_v01_coordination_effect": "DISCLOSURE_ONLY_NOT_BLOCKING",
                "future_implementation_effect": "BLOCK_BEFORE_LATEST_GATE_UNLESS_APPROVED",
                "source_locations": [
                    f"reference/02_规范冲突与裁决清单.md#{record['id'].lower()}",
                    "planning/02_架构裁决与数据库协议.md",
                    "status/decisions.json",
                ],
            }
        )

    ids = {record["id"] for record in adrs}
    relationships = []
    for predecessor, successor, rationale in ADR_RELATIONSHIPS:
        if predecessor not in ids or successor not in ids:
            raise ValueError("ADR relationship refers to an unknown decision")
        relationships.append(
            {
                "from": predecessor,
                "to": successor,
                "type": "CONSTRAINS_OR_PRECEDES",
                "rationale": rationale,
            }
        )

    package_edges = [
        {
            "from": record["id"],
            "to": package,
            "type": "BLOCKS_AFFECTED_IMPLEMENTATION_BY_LATEST_GATE",
        }
        for record in adrs
        for package in record["affected_work_packages"]
    ]

    approved = sum(record["decision_status"] == "APPROVED" for record in adrs)
    proposed_not_approved = sum(
        record["decision_status"] == "PROPOSED_NOT_APPROVED" for record in adrs
    )

    output = {
        "schema_version": "V01.2-ADR-GRAPH-1",
        "authority": "Coordination map only. It does not approve or implement any ADR proposal.",
        "generated_from": [
            "status/decisions.json",
            "reference/02_规范冲突与裁决清单.md",
            "planning/02_架构裁决与数据库协议.md",
            "planning/r2_steps.json",
            "planning/work_packages.json",
        ],
        "counts": {
            "adrs": len(adrs),
            "adr_relationships": len(relationships),
            "adr_to_package_edges": len(package_edges),
        },
        "current_gate": {
            "step": "V01.2",
            "unresolved_blockers": [],
            "reason": "V01.2 records proposals and future gates; it does not select or implement an unapproved proposal.",
        },
        "approval_summary": {
            "approved": approved,
            "proposed_not_approved": proposed_not_approved,
            "bulk_approval_permitted": False,
        },
        "adrs": adrs,
        "adr_relationships": relationships,
        "adr_to_package_edges": package_edges,
    }
    (ROOT / "requirements/adr_dependency_map.json").write_text(
        json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
