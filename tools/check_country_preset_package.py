"""Independently check the map lock and all exported country preset tables."""

import csv
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "artifacts/world-geography"
DATA = BASE / "reconciled-v2"
TARGETS = {"visual-territory-51", "visual-territory-52"}


def read(directory, name):
    return json.loads((directory / name).read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    old = read(BASE, "opening-society.json")
    new = read(DATA, "opening-society.json")
    old_world = read(BASE, "world-space.json")
    new_world = read(DATA, "world-space.json")
    old_network = read(BASE, "connections-rights.json")
    new_network = read(DATA, "connections-rights.json")
    natural = read(DATA, "natural-endowment.json")
    assert natural == read(BASE, "natural-endowment.json")
    assert old_network["nodes"] == new_network["nodes"]
    assert old_network["rights"] == new_network["rights"]
    assert len(new["countries"]) == 70
    assert len(new["facilities"]) == 350
    assert len(new_world["regions"]) == 122
    assert len(natural["deposits"]) == 240
    assert len(new_network["freight"]) == 349
    for before, after in zip(old["countries"], new["countries"]):
        assert before["countryId"] == after["countryId"]
        if after["countryId"] not in TARGETS:
            assert before == after
        local = [r for r in new_world["regions"] if r["countryId"] == after["countryId"]]
        assert sum(r["initial"]["population"] for r in local) == after["population"]
        assert abs(sum(r["initial"]["grainTonnesDay"] for r in local) - after["foodProductionTonnesDay"]) < 0.002
        assert abs(after["bankReservesGcu"] + after["bankLoansGcu"] - after["bankDepositsGcu"] - after["bankEquityGcu"]) < 0.03
    for before, after in zip(old_world["regions"], new_world["regions"]):
        assert before["id"] == after["id"]
        assert before["path"] == after["path"]
        assert before["label"] == after["label"]
        if after["countryId"] not in TARGETS:
            assert before == after
        assert abs(sum(after["landUseKm2"].values()) - after["areaKm2"]) < 0.01
        assert after["initial"]["grainTonnesDay"] * 360 <= after["natural"]["grainPotentialTonnesYear"] + 2
    for before, after in zip(old["facilities"], new["facilities"]):
        assert all(before[key] == after[key] for key in ("id", "countryId", "projectId", "projectNumber", "name", "lifecycle", "operational", "accessNodeId", "gridNodeId"))
        if after["countryId"] not in TARGETS:
            assert before == after
    for before, after in zip(old_network["freight"], new_network["freight"]):
        assert {k: v for k, v in before.items() if k != "capacityTonnesDay"} == {k: v for k, v in after.items() if k != "capacityTonnesDay"}
    for before, after in zip(old_network["power"], new_network["power"]):
        if after["countryId"] not in TARGETS:
            assert before == after
    manifest = read(DATA, "package-manifest.json")
    for name, digest in manifest["sourceJson"].items():
        assert sha(DATA / name) == digest
    for name, info in manifest["tables"].items():
        path = DATA / "tables" / f"{name}.csv"
        assert sha(path) == info["sha256"]
        with path.open() as handle:
            rows = list(csv.DictReader(handle))
        assert len(rows) == info["rows"]
        assert len(rows[0]) == info["columns"]
    assert sha(DATA / "tables/all_tables.json") == manifest["allTablesJsonSha256"]
    scenes = read(ROOT / "apps/world-web/src/assets/country-scenes", "index.json")
    reviews = read(ROOT / "apps/world-web/src/assets/country-scenes", "reviews.json")
    facility_ids = {f["id"] for f in new["facilities"]}
    anchors = set()
    for scene in scenes:
        local_ids = {f["id"] for f in new["facilities"] if f["countryId"] == scene["id"]}
        assert set(scene["anchors"]) == local_ids == set(reviews[scene["number"]]["anchors"])
        anchors.update(local_ids)
    assert anchors == facility_ids
    result = {
        "status": "PASS", "countries": 70, "regions": 122, "deposits": 240,
        "mapFacilities": 350, "sceneAnchors": 350, "csvTables": len(manifest["tables"]),
        "mapIdentityAndNodeCoordinatesUnchanged": True, "geologicalResourceRecordsUnchanged": True,
        "untouchedCountryAndRegionRecords": 68, "mapConsistencyCorrections": sorted(TARGETS),
        "financialAndTechnologyProposalsActivated": False,
        "fullEconomicFairnessSimulation": "NOT_RUN",
    }
    (DATA / "package-validation.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result))


if __name__ == "__main__":
    main()
