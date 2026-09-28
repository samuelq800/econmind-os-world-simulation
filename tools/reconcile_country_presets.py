"""Produce a versioned, map-locked country preset from the geographic draft.

Only human settlement and derived opening quantities are revised.  Mapped
facility identities, countries, project types and coordinates are byte-for-byte
compared to the original draft before export.
"""

from __future__ import annotations

import copy
import hashlib
import json
import math
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "artifacts/world-geography"
OUT = SOURCE / "reconciled-v2"
APP = ROOT / "apps/world-web/src/map-lab/geographic-scenario.json"
TARGETS = {"visual-territory-51", "visual-territory-52"}


def read(name):
    return json.loads((SOURCE / name).read_text())


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()


def mapped_facility_identity(facilities, nodes):
    by_id = {node["id"]: node["point"] for node in nodes}
    return sorted((f["id"], f["countryId"], f["projectId"], by_id[f["id"]]) for f in facilities)


def population_initial(region, population):
    """Apply the original generator's human-geography equations after reallocation."""
    initial = region["initial"]
    geography = region["humanGeography"]
    access = geography["transportGravity"]
    urban = geography["scenarioUrbanShare"]
    working = round(population * (0.58 + 0.09 * urban))
    labour = round(working * (0.58 + 0.13 * access))
    high = round(labour * (0.035 + 0.17 * urban))
    medium = round(labour * (0.19 + 0.24 * urban))
    households = round(population / (3.7 - 0.9 * urban))
    grain_demand = population * 0.24 / 360
    cropped_ha = min(region["landUseKm2"]["croplandPotential"] * 100,
                     region["natural"]["allocatableWaterM3Day"] * 360 / 5000) * (0.22 + 0.35 * (1 - urban))
    initial.update(
        population=population, workingAge=working, labourForce=labour,
        skills={"low": labour - high - medium, "medium": medium, "high": high},
        households=households, housingUnits=round(households * (1.08 - 0.2 * urban)),
        croplandHa=round(cropped_ha, 2),
        grainTonnesDay=round(cropped_ha * region["natural"]["grainYieldTonnesHa"] / 360, 3),
        grainDemandTonnesDay=round(grain_demand, 3),
        foodStockTonnes=round(grain_demand * (20 + 40 * (1 - access)), 3),
        teachers=round(population * (0.0028 + 0.002 * urban)),
        medicalWorkers=round(population * (0.0016 + 0.0022 * urban)),
        schoolSeats=round(population * 0.19),
        hospitalBeds=round(population * (0.001 + 0.002 * urban)),
    )


def society_from_regions(country, regions):
    population = sum(r["initial"]["population"] for r in regions)
    labour = sum(r["initial"]["labourForce"] for r in regions)
    employed = round(labour * 0.86)
    food = sum(r["initial"]["grainTonnesDay"] for r in regions)
    demand = sum(r["initial"]["grainDemandTonnesDay"] for r in regions)
    wage = 18 + sum(r["settlementAccess"] * r["initial"]["population"] for r in regions) / population * 12
    income = round(employed * wage, 2)
    cash = round(income * 30, 2)
    country.update(
        population=population, labourForce=labour, scenarioEmployed=employed,
        scenarioUnemployed=labour - employed,
        foodProductionTonnesDay=round(food, 3), foodDemandTonnesDay=round(demand, 3),
        foodAvailableStockTonnes=round(sum(r["initial"]["foodStockTonnes"] for r in regions), 3),
        dailyIncomeGcu=income, treasuryCashGcu=cash, bankDepositsGcu=cash,
        bankReservesGcu=round(cash * 0.2, 2), bankLoansGcu=round(cash * 0.9, 2),
        bankEquityGcu=round(cash * 0.1, 2),
    )


def main():
    world = read("world-space.json")
    natural = read("natural-endowment.json")
    society = read("opening-society.json")
    network = read("connections-rights.json")
    checks = read("initialization-validation.json")
    original_facilities = copy.deepcopy(society["facilities"])
    original_nodes = copy.deepcopy(network["nodes"])
    original_deposits = copy.deepcopy(natural["deposits"])
    original_identity = mapped_facility_identity(original_facilities, original_nodes)
    old_total = sum(r["initial"]["population"] for r in world["regions"])
    regions_by_country = defaultdict(list)
    for region in world["regions"]:
        regions_by_country[region["countryId"]].append(region)

    changes = []
    added = 0
    for cid in sorted(TARGETS):
        local = regions_by_country[cid]
        area = sum(r["areaKm2"] for r in local)
        # Very wet, forested countries with mapped transport access can support
        # a sparse coastal/trade settlement, even without large existing fields.
        target = round(sum(r["areaKm2"] * (0.35 + 0.25 * r["humanGeography"]["transportGravity"]) for r in local))
        old = sum(r["initial"]["population"] for r in local)
        additions = target - old
        assert additions > 0 and area > 1_000_000
        added += additions
        weights = [r["areaKm2"] * r["humanGeography"]["transportGravity"] for r in local]
        allocations = [round(target * w / sum(weights)) for w in weights]
        allocations[-1] += target - sum(allocations)
        for region, population in zip(local, allocations):
            # Reclassify just 0.6% of previously all-forest land as potential
            # mixed farms and settlement.  This is a scenario, not mapped farms.
            land = region["landUseKm2"]
            clearing = round(region["areaKm2"] * 0.006, 3)
            cropland = round(clearing * 2 / 3, 3)
            land["forest"] = round(land["forest"] - clearing, 3)
            land["croplandPotential"] = round(land["croplandPotential"] + cropland, 3)
            land["urbanIndustrialPotential"] = round(land["urbanIndustrialPotential"] + clearing - cropland, 3)
            irrigation_area = min(land["croplandPotential"] * 100,
                                  region["natural"]["allocatableWaterM3Day"] * 360 / 5000)
            region["natural"]["grainPotentialTonnesYear"] = round(irrigation_area * region["natural"]["grainYieldTonnesHa"])
            population_initial(region, population)
            region["basis"] += " | V2_FOREST_SETTLEMENT_CLEARING_0.6_PERCENT_SCENARIO"
        changes.append({"countryId": cid, "oldPopulation": old, "newPopulation": target,
                        "addedPopulation": additions, "areaKm2": round(area, 3),
                        "basis": "area * (0.35 + 0.25 * mapped-transport-gravity) persons/km2"})

    # Do not alter unrelated countries' populations to make the world total
    # match a prior estimate: population follows mapped human geography, not
    # the final competitive-balance constraint.

    for country in society["countries"]:
        society_from_regions(country, regions_by_country[country["countryId"]])
    populations = {c["countryId"]: c["population"] for c in society["countries"]}
    facility_counts = Counter(f["countryId"] for f in society["facilities"])
    estimate_changes = []
    for facility in society["facilities"]:
        cid = facility["countryId"]
        if cid not in TARGETS:
            continue
        old_capacity = facility["estimatedCapacity"]
        old_workers = facility["requiredWorkers"]
        mine = facility["projectNumber"] in (1, 2, 3, 4, 5, 6)
        workers = max(12, round(math.sqrt(populations[cid]) * (0.4 if mine else 0.25)))
        capacity = old_capacity if mine else max(10, round(populations[cid] / facility_counts[cid] * 0.002, 2))
        facility.update(
            estimatedCapacity=capacity, requiredWorkers=workers,
            requiredPowerMW=round(workers * 0.018, 3),
            requiredWaterM3Day=round(workers * 1.8),
            maintenanceGcuDay=round(workers * 8 + capacity * 0.02, 2),
            equipmentUnits=max(1, round(workers / 20)),
            constructionSimDays=round(90 + workers * 0.06 + capacity ** 0.25),
        )
        estimate_changes.append({"facilityId": facility["id"], "oldCapacity": old_capacity,
                                 "newCapacity": capacity, "oldWorkers": old_workers,
                                 "newWorkers": workers, "reason": "recompute scenario estimate after map-based population correction"})
    node_country = {n["id"]: n["countryId"] for n in network["nodes"]}
    for edge in network["freight"]:
        a, b = node_country[edge["fromId"]], node_country[edge["toId"]]
        if a in TARGETS or b in TARGETS:
            demand = min(populations[a], populations[b]) * 0.002
            edge["capacityTonnesDay"] = round(max(25, demand / (1 + edge["distanceKm"] / 1500)), 2)
    for grid in network["power"]:
        if grid["countryId"] not in TARGETS:
            continue
        population = sum(r["initial"]["population"] for r in regions_by_country[grid["countryId"]])
        demand = population * 0.00045
        grid["scenarioDemandMW"] = round(demand, 3)
        grid["suggestedGenerationMW"] = round(demand * 1.2 / max(0.1, grid["solarCapacityFactor"]), 2)
        grid["transferCapacityMW"] = round(demand * 1.15, 3)

    checks["balanceChecks"] = [dict(
        regionId=r["id"],
        foodNetTonnesDay=round(r["initial"]["grainTonnesDay"] - r["initial"]["grainDemandTonnesDay"], 3),
        housingGapUnits=max(0, r["initial"]["households"] - r["initial"]["housingUnits"]),
        waterAfterHouseholdsAndFarmsM3Day=round(r["natural"]["allocatableWaterM3Day"]
            - r["initial"]["population"] * 65 / 360 - r["initial"]["croplandHa"] * 5000 / 360),
        action="TRADE_HOUSING_POWER_AND_EMPLOYMENT_CALIBRATION_REQUIRED",
    ) for r in world["regions"]]
    normal = sum(c["foodProductionTonnesDay"] for c in society["countries"])
    demand = sum(c["foodDemandTonnesDay"] for c in society["countries"])
    dry = sum(r["initial"]["grainTonnesDay"] * r["natural"]["drySeasonWaterM3Day"] /
              max(1, r["natural"]["allocatableWaterM3Day"]) for r in world["regions"])
    scenarios = checks["scenarios"]
    scenarios[0].update(supply=round(normal, 2), demand=round(demand, 2), status="PASS" if normal >= demand else "FAIL")
    scenarios[1].update(supply=round(dry, 2), demand=round(demand, 2), status="SHORTFALL" if dry < demand else "SURPLUS")
    lake_storage = sum(basin["lakeStorageM3"] for basin in natural["basins"])
    scenarios[2].update(supply=round(min(normal, dry + lake_storage / 90 / (5000 / 3)), 2), demand=round(demand, 2))
    checks["coefficients"]["forestSettlementRevision"] = {
        "status": "AUTHORED_FICTIONAL_SCENARIO_NOT_OBSERVED_HISTORY",
        "affectedCountries": sorted(TARGETS), "populationDensityPersonsKm2": "0.35 + 0.25 * transportGravity",
        "forestReclassificationFraction": 0.006, "croplandShareOfClearing": 2/3,
        "worldPopulationChangeReason": "correction of two map-inconsistent near-empty countries; no donor reallocation",
    }

    assert mapped_facility_identity(society["facilities"], network["nodes"]) == original_identity
    assert network["nodes"] == original_nodes
    assert natural["deposits"] == original_deposits
    assert sum(r["initial"]["population"] for r in world["regions"]) == old_total + added
    assert len(society["facilities"]) == len(network["nodes"]) == 350
    for region in world["regions"]:
        assert abs(sum(region["landUseKm2"].values()) - region["areaKm2"]) < 0.01

    combined = dict(status="ILLUSTRATIVE_PLANNING_ONLY", source=checks["source"],
                    coefficients=checks["coefficients"], regions=world["regions"],
                    basins=natural["basins"], countries=society["countries"],
                    deposits=natural["deposits"], facilities=society["facilities"],
                    freight=network["freight"], power=network["power"],
                    rights=network["rights"], balanceChecks=checks["balanceChecks"],
                    scenarios=checks["scenarios"], blockers=checks["blockers"],
                    activationAllowed=False)
    OUT.mkdir(parents=True, exist_ok=True)
    for name, value in (("world-space.json", world), ("natural-endowment.json", natural),
                        ("opening-society.json", society), ("connections-rights.json", network),
                        ("initialization-validation.json", checks)):
        dump(OUT / name, value)
    dump(APP, combined)
    facilities_by_country = Counter(f["countryId"] for f in society["facilities"])
    ledger = {
        "status": "PREPARATION_ONLY_NOT_ACTIVATED", "populationBefore": old_total,
        "populationAfter": sum(c["population"] for c in society["countries"]),
        "populationRevision": added,
        "mapInfrastructureSha256": digest(original_identity),
        "originalFacilityRecordSha256": digest(original_facilities),
        "revisedFacilityRecordSha256": digest(society["facilities"]),
        "capacityEstimateChanges": estimate_changes,
        "mapNodeSha256": digest(original_nodes),
        "depositsSha256": digest(original_deposits),
        "mappedFacilityCountsByCountry": dict(sorted(facilities_by_country.items())),
        "changes": changes,
        "remainingLimits": ["600_SIM_DAY_VALIDATION_NOT_RUN", "CORE_RECIPES_AND_RIGHTS_NOT_ACTIVATED",
                            "HUMAN_GEOGRAPHY_COEFFICIENTS_ARE_SCENARIO_ASSUMPTIONS"],
    }
    dump(OUT / "reconciliation-ledger.json", ledger)
    print(json.dumps({"regions": len(world["regions"]), "countries": len(society["countries"]),
                      "facilitiesLocked": len(original_facilities), "populationBefore": old_total,
                      "populationAfter": old_total + added,
                      "modifiedCountries": len(changes), "foodSupply": round(normal, 2),
                      "foodDemand": round(demand, 2)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
