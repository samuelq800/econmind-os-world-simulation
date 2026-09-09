#!/usr/bin/env python3
"""Build the V01.1 source-unit and planned-ownership traceability registries."""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
REQUIREMENTS = ROOT / "requirements"

ENGINE_PACKAGES = {
    "E01": ["V06"],
    "E02": ["V11"],
    "E03": ["V11"],
    "E04": ["V15"],
    "E05": ["V15"],
    "E06": ["V16"],
    "E07": ["V16"],
    "E08": ["V12"],
    "E09": ["V13"],
    "E10": ["V13"],
    "E11": ["V14"],
    "E12": ["V14"],
    "E13": ["V17"],
    "E14": ["V18"],
    "E15": ["V19"],
    "E16": ["V21", "V22"],
    "E17": ["V20"],
    "E18": ["V23"],
}

OFFICE_PACKAGES = {
    "OFFICE-CAPTAIN": ["V05", "V24", "V25"],
    "OFFICE-CENTRAL_BANK": ["V05", "V19", "V24", "V25"],
    "OFFICE-FINANCE": ["V05", "V18", "V24", "V25"],
    "OFFICE-TRADE": ["V05", "V21", "V22", "V24", "V25"],
    "OFFICE-INDUSTRY": ["V05", "V12", "V13", "V14", "V24", "V25"],
    "OFFICE-SOCIAL": ["V05", "V11", "V15", "V16", "V17", "V24", "V25"],
}

KIND_PACKAGES = {
    "commodity": ["V03", "V12", "V13", "V17"],
    "sector": ["V03", "V12", "V13", "V17"],
    "tech": ["V03", "V14"],
    "project": ["V03", "V14"],
    "international_subtype": ["V03", "V21", "V22"],
}

KIND_CODE_OWNERS = {
    "engine": ["packages/core", "apps/world-worker", "apps/world-api", "apps/world-web"],
    "office_family": ["packages/core", "apps/world-api", "apps/world-worker", "apps/world-web"],
    "commodity": ["packages/core", "apps/world-worker"],
    "sector": ["packages/core", "apps/world-worker"],
    "tech": ["packages/core", "apps/world-worker", "apps/world-api", "apps/world-web"],
    "project": ["packages/core", "apps/world-worker", "apps/world-api", "apps/world-web"],
    "international_subtype": ["packages/core", "apps/world-worker", "apps/world-api", "apps/world-web"],
}


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def unit_values(unit: dict[str, Any]) -> list[str]:
    if "cells" in unit:
        return [str(value) for value in unit["cells"]]
    return [str(unit.get("text", ""))]


def title(entry: dict[str, Any]) -> str:
    if entry.get("name"):
        return str(entry["name"])
    cells = entry.get("source_cells", [])
    return " — ".join(str(value) for value in cells)


def planned_packages(entry: dict[str, Any]) -> list[str]:
    if entry["kind"] == "engine":
        return ENGINE_PACKAGES[entry["id"]]
    if entry["kind"] == "office_family":
        return OFFICE_PACKAGES[entry["id"]]
    return KIND_PACKAGES[entry["kind"]]


def main() -> None:
    manifest = load_json(REQUIREMENTS / "source_manifest.json")
    coverage = load_json(REQUIREMENTS / "coverage_families.json")["entries"]
    steps = load_json(ROOT / "planning/r2_steps.json")["steps"]
    package_ids = {step["work_package"] for step in steps}
    units = [
        json.loads(line)
        for line in (REQUIREMENTS / "source_units.jsonl").read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    units_by_document: dict[str, list[dict[str, Any]]] = defaultdict(list)
    unit_by_id: dict[str, dict[str, Any]] = {}
    for unit in units:
        units_by_document[unit["document"]].append(unit)
        unit_by_id[unit["source_id"]] = unit

    requirements: list[dict[str, Any]] = []
    unit_requirements: dict[str, list[str]] = defaultdict(list)
    sources: list[dict[str, Any]] = []

    for source in manifest:
        document_units = units_by_document[source["id"]]
        requirement_id = f"REQ-SOURCE-{source['id']}"
        for unit in document_units:
            unit_requirements[unit["source_id"]].append(requirement_id)
        requirements.append(
            {
                "requirement_id": requirement_id,
                "kind": "source_scope",
                "title": f"Preserve and decompose the complete {source['id']} specification",
                "source_document": source["id"],
                "source_unit_selector": {
                    "first": document_units[0]["source_id"],
                    "last": document_units[-1]["source_id"],
                    "count": len(document_units),
                },
                "target_ids": [],
                "planned_work_packages": ["V01"],
                "planned_code_owners": ["requirements", "planning"],
                "implementation_status": "PLANNED_NOT_IMPLEMENTED",
                "evidence_status": "SOURCE_INDEXED_ONLY",
            }
        )
        sources.append(
            {
                "id": source["id"],
                "original_path": source["original_path"],
                "extracted_path": source["extracted_path"],
                "sha256": source["sha256"],
                "source_units": len(document_units),
                "source_scope_requirement": requirement_id,
            }
        )

    for entry in coverage:
        refs = list(entry.get("source_refs", []))
        source_document = entry.get("source_document")
        if not refs:
            needles = entry.get("source_cells") or [entry.get("name")]
            if entry["kind"] == "office_family":
                refs = [units_by_document[source_document][0]["source_id"]]
            else:
                refs = [
                    unit["source_id"]
                    for unit in units_by_document[source_document]
                    if all(
                        any(str(needle) in value for value in unit_values(unit))
                        for needle in needles
                    )
                ]
        if not refs or any(reference not in unit_by_id for reference in refs):
            raise ValueError(f"missing source-unit evidence for {entry['id']}")
        packages = planned_packages(entry)
        if not set(packages) <= package_ids:
            raise ValueError(f"invalid planned package for {entry['id']}")
        requirement_id = f"REQ-{entry['id']}"
        for reference in refs:
            unit_requirements[reference].append(requirement_id)
        requirements.append(
            {
                "requirement_id": requirement_id,
                "kind": entry["kind"],
                "title": title(entry),
                "source_document": source_document or unit_by_id[refs[0]]["document"],
                "source_unit_refs": refs,
                "target_ids": [entry["id"]],
                "planned_work_packages": packages,
                "planned_code_owners": KIND_CODE_OWNERS[entry["kind"]],
                "implementation_status": "PLANNED_NOT_IMPLEMENTED",
                "evidence_status": "SOURCE_LINKED_ONLY",
            }
        )

    registry = {
        "schema_version": "V01.1-TRACEABILITY-1",
        "authority": "Traceability and planned ownership only; this registry is not an implementation claim.",
        "generated_from": [
            "requirements/source_manifest.json",
            "requirements/source_units.jsonl",
            "requirements/coverage_families.json",
            "planning/r2_steps.json",
        ],
        "counts": {
            "authoritative_sources": len(sources),
            "source_units": len(units),
            "requirements": len(requirements),
            "fixed_targets": len(coverage),
        },
        "sources": sources,
        "requirements": requirements,
        "claim_boundary": {
            "documented": True,
            "planned": True,
            "implemented": False,
            "verified_product_behavior": False,
        },
    }
    (REQUIREMENTS / "requirement_registry.json").write_text(
        json.dumps(registry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    assignment_path = REQUIREMENTS / "source_unit_assignments.jsonl"
    assignment_path.write_text(
        "".join(
            json.dumps(
                {
                    "source_unit_id": unit["source_id"],
                    "document": unit["document"],
                    "extraction_kind": unit["kind"],
                    "requirement_ids": sorted(set(unit_requirements[unit["source_id"]])),
                    "implementation_status": "UNASSESSED",
                },
                ensure_ascii=False,
            )
            + "\n"
            for unit in units
        ),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
