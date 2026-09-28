"""Flatten every preparatory country preset and create a reproducible handoff.

JSON is lossless. CSV/XLSX tables expose scalar fields, with large SVG geometry
referenced by digest because Excel cells cannot hold arbitrary path strings.
"""

from __future__ import annotations

import csv
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "artifacts/world-geography/reconciled-v2"
TABLES = DATA / "tables"
SCENES = ROOT / "apps/world-web/src/assets/country-scenes"


def read(name):
    return json.loads((DATA / name).read_text())


def sha(value):
    if not isinstance(value, (bytes, bytearray)):
        value = str(value).encode()
    return hashlib.sha256(value).hexdigest()


def flatten(record, prefix=""):
    result = {}
    for key, value in record.items():
        name = f"{prefix}.{key}" if prefix else key
        if isinstance(value, dict):
            result.update(flatten(value, name))
        elif isinstance(value, list):
            result[name] = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        elif isinstance(value, str) and len(value) > 1000:
            result[name + "Sha256"] = sha(value)
            result[name + "Length"] = len(value)
            result[name + "Source"] = "JSON_SOURCE_ONLY"
        else:
            result[name] = value
    return result


def write_csv(name, rows):
    columns = list(dict.fromkeys(k for row in rows for k in row))
    with (TABLES / f"{name}.csv").open("w", newline="") as out:
        writer = csv.DictWriter(out, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)
    return {"rows": len(rows), "columns": len(columns), "sha256": sha((TABLES / f"{name}.csv").read_bytes())}


def main():
    world = read("world-space.json")
    natural = read("natural-endowment.json")
    society = read("opening-society.json")
    network = read("connections-rights.json")
    validation = read("initialization-validation.json")
    ledger = read("reconciliation-ledger.json")
    scenes = {item["id"]: item for item in json.loads((SCENES / "index.json").read_text())}
    reviews = json.loads((SCENES / "reviews.json").read_text())
    nodes = {node["id"]: node["point"] for node in network["nodes"]}
    regions = defaultdict(list)
    deposits = defaultdict(list)
    facilities = defaultdict(list)
    freight = defaultdict(list)
    grid = {item["countryId"]: item for item in network["power"]}
    rights = {item["countryId"]: item for item in network["rights"]}
    for region in world["regions"]: regions[region["countryId"]].append(region)
    for deposit in natural["deposits"]: deposits[deposit["countryId"]].append(deposit)
    for facility in society["facilities"]: facilities[facility["countryId"]].append(facility)
    for edge in network["freight"]:
        for cid in edge["countryIds"]: freight[cid].append(edge)

    summary, fairness = [], []
    for country in society["countries"]:
        cid = country["countryId"]
        local = regions[cid]
        mineral = deposits[cid]
        facility = facilities[cid]
        population = country["population"]
        food_need = country["foodDemandTonnesDay"]
        food_supply = country["foodProductionTonnesDay"]
        food_stock = country["foodAvailableStockTonnes"]
        reserve_days = food_stock / food_need if food_need else 0
        area = sum(r["areaKm2"] for r in local)
        mean = lambda key: sum(r["natural"][key] * r["areaKm2"] for r in local) / area
        land = lambda key: sum(r["landUseKm2"][key] for r in local)
        weighted_access = sum(r["humanGeography"]["transportGravity"] * r["initial"]["population"] for r in local) / population
        g = grid[cid]
        scene = scenes[cid]
        number = scene["number"]
        visual = reviews[number]
        row = dict(
            countryId=cid, countryNumber=number, countryName=scene["name"],
            mapSceneFile=f"{number}.png", mapSceneStatus=scene["status"],
            mapVisualReview=visual["visualDetail"], mapBrowserReview=visual["browser"],
            countryFrame=json.dumps(scene["frame"]), regionCount=len(local), areaKm2=round(area, 3),
            population=population, populationDensityPerKm2=round(population / area, 4),
            labourForce=country["labourForce"], employed=country["scenarioEmployed"],
            unemployed=country["scenarioUnemployed"], highSkillWorkers=sum(r["initial"]["skills"]["high"] for r in local),
            mediumSkillWorkers=sum(r["initial"]["skills"]["medium"] for r in local),
            lowSkillWorkers=sum(r["initial"]["skills"]["low"] for r in local),
            households=sum(r["initial"]["households"] for r in local),
            housingUnits=sum(r["initial"]["housingUnits"] for r in local),
            teachers=sum(r["initial"]["teachers"] for r in local),
            medicalWorkers=sum(r["initial"]["medicalWorkers"] for r in local),
            schoolSeats=sum(r["initial"]["schoolSeats"] for r in local),
            hospitalBeds=sum(r["initial"]["hospitalBeds"] for r in local),
            meanElevationM=round(mean("meanElevationM"), 2),
            meanTemperatureC=round(mean("temperatureC"), 2),
            meanAnnualRainMm=round(mean("annualRainMm"), 2),
            meanSolarKwhM2Day=round(mean("solarKwhM2Day"), 3),
            meanWindMps=round(mean("windMps"), 3),
            meanDroughtExposure=round(mean("droughtExposure"), 3),
            meanFloodExposure=round(mean("floodExposure"), 3),
            meanStormExposure=round(mean("stormExposure"), 3),
            croplandPotentialKm2=round(land("croplandPotential"), 3),
            forestKm2=round(land("forest"), 3),
            urbanIndustrialPotentialKm2=round(land("urbanIndustrialPotential"), 3),
            mountainKm2=round(land("mountain"), 3),
            inlandWaterKm2=round(land("inlandWater"), 3),
            convertibleKm2=round(land("convertible"), 3),
            croplandHa=round(sum(r["initial"]["croplandHa"] for r in local), 2),
            allocatableWaterM3Day=sum(r["natural"]["allocatableWaterM3Day"] for r in local),
            drySeasonWaterM3Day=sum(r["natural"]["drySeasonWaterM3Day"] for r in local),
            grainPotentialTonnesYear=sum(r["natural"]["grainPotentialTonnesYear"] for r in local),
            foodProductionTonnesDay=food_supply, foodDemandTonnesDay=food_need,
            foodNetTonnesDay=round(food_supply - food_need, 3),
            foodAvailableStockTonnes=food_stock, foodReserveDays=round(reserve_days, 2),
            dailyIncomeGcu=country["dailyIncomeGcu"], treasuryCashGcu=country["treasuryCashGcu"],
            bankDepositsGcu=country["bankDepositsGcu"], bankReservesGcu=country["bankReservesGcu"],
            bankLoansGcu=country["bankLoansGcu"], bankEquityGcu=country["bankEquityGcu"],
            historicalDebtGcu=country["historicalDebtGcu"],
            settlementTransportGravity=round(weighted_access, 4),
            mineralDepositCount=len(mineral), mineralCommodityCount=len({m["commodityId"] for m in mineral}),
            mineralCommodities="、".join(sorted({m["commodityId"] for m in mineral})),
            mappedFacilityCount=len(facility), mappedFacilityIds="、".join(f["id"] for f in facility),
            mappedFacilityProjects="、".join(f["projectId"] for f in facility),
            surveyCorridorCount=len(freight[cid]), proposedGridDemandMW=g["scenarioDemandMW"],
            proposedGridGenerationMW=g["suggestedGenerationMW"],
            economyIdProposal=country["economyIdProposal"], bindingStatus=country["bindingStatus"],
            facilityLifecycle="CANDIDATE_NOT_OPERATIONAL", activationAllowed=False,
        )
        for commodity in ("CRUDE_OIL", "NATURAL_GAS", "URANIUM", "IRON_ORE", "COPPER", "LITHIUM"):
            row[f"depositCount_{commodity}"] = sum(x["commodityId"] == commodity for x in mineral)
            row[f"recoverableRemaining_{commodity}"] = round(sum(x["recoverableRemaining"] for x in mineral if x["commodityId"] == commodity), 3)
        summary.append(row)
        food_deficit = food_supply < food_need
        fixed_map_constraint = len(facility) <= 3 or len({m["commodityId"] for m in mineral}) <= 2
        finance_runway_days = 30 if food_deficit and fixed_map_constraint else 20 if food_deficit or fixed_map_constraint else 0
        if food_deficit:
            technology_focus = "FOOD_TRADE_LOGISTICS_RESEARCH_ACCESS_PROPOSAL"
        elif len(facility) <= 3:
            technology_focus = "INDUSTRIAL_PROCESS_RESEARCH_ACCESS_PROPOSAL"
        elif len({m["commodityId"] for m in mineral}) <= 2:
            technology_focus = "RESOURCE_EFFICIENCY_RESEARCH_ACCESS_PROPOSAL"
        else:
            technology_focus = "NO_ADDITIONAL_TECH_ACCESS_PROPOSED"
        fairness.append(dict(
            countryId=cid, countryNumber=number, countryName=scene["name"],
            criterion="国家参赛单位起步机会; 保留自然与人口差异", population=population,
            mappedFacilityCount=len(facility), mineralCommodityCount=row["mineralCommodityCount"],
            foodNetTonnesDay=row["foodNetTonnesDay"], foodReserveDays=row["foodReserveDays"],
            housingGapUnits=max(0, row["households"] - row["housingUnits"]),
            dailyIncomeGcu=country["dailyIncomeGcu"], cashRunwayDays=round(country["treasuryCashGcu"] / country["dailyIncomeGcu"], 2),
            waterStressM3Day=min((x["waterAfterHouseholdsAndFarmsM3Day"] for x in validation["balanceChecks"] if x["regionId"] in {r["id"] for r in local}), default=0),
            proposedFinanceCreditLineGcu=round(finance_runway_days * country["dailyIncomeGcu"], 2),
            proposedCreditRunwayDays=finance_runway_days,
            proposedTechnologyAccess=technology_focus,
            financingBasis="20/30 days of current scenario daily income when map-derived constraints apply; credit remains undrawn",
            technologyBasis="research-access priority only; no Core licence or production recipe granted",
            balancingStatus="PROPOSED_NOT_ACTIVATED",
            humanGeographyRevision=any(x["countryId"] == cid for x in ledger["changes"]),
            mappedInfrastructureIdentityChanged=False,
            derivedFacilityEstimateRecomputed=cid in {"visual-territory-51", "visual-territory-52"},
        ))

    TABLES.mkdir(parents=True, exist_ok=True)
    sections = {
        "country_summary": summary,
        "fairness_audit": fairness,
        "regions": [flatten(x) for x in world["regions"]],
        "deposits": [flatten(x) for x in natural["deposits"]],
        "facilities": [dict(flatten(x), mapPointX=nodes[x["id"]][0], mapPointY=nodes[x["id"]][1],
                            sceneAnchorX=reviews[x["countryId"][-2:]]["anchors"][x["id"]][0],
                            sceneAnchorY=reviews[x["countryId"][-2:]]["anchors"][x["id"]][1])
                       for x in society["facilities"]],
        "freight": [flatten(x) for x in network["freight"]],
        "power": [flatten(x) for x in network["power"]],
        "rights": [flatten(x) for x in network["rights"]],
        "basins": [flatten(x) for x in natural["basins"]],
        "climate_templates": [dict(templateIndex=i, temperatureC=row[0], annualRainMm=row[1],
                                   proxyCoefficient3=row[2], cropSuitabilityProxy=row[3])
                              for i, row in enumerate(natural["climateTemplates"])],
        "balance_checks": [flatten(x) for x in validation["balanceChecks"]],
        "scenarios": [flatten(x) for x in validation["scenarios"]],
        "country_opening_raw": [flatten(x) for x in society["countries"]],
        "model_parameters": [dict(group=group, parameter=key, value=json.dumps(value, ensure_ascii=False) if isinstance(value, (dict, list)) else value)
                             for group, block in (("scale", world["scale"]), ("coefficients", validation["coefficients"]), ("source", validation["source"]))
                             for key, value in block.items()] +
                            [dict(group="activationBlocker", parameter=f"blocker{i+1}", value=value)
                             for i, value in enumerate(validation["blockers"])],
    }
    manifest = {"status": "ILLUSTRATIVE_PLANNING_ONLY", "authority": "NOT_CORE_OR_PRODUCTION",
                "sourcePdfSha256": validation["source"]["pdfSha256"],
                "infrastructureSha256": ledger["mapInfrastructureSha256"],
                "mapNodeSha256": ledger["mapNodeSha256"],
                "depositSha256": ledger["depositsSha256"],
                "sourceJson": {}, "tables": {}, "limitations": ledger["remainingLimits"]}
    for name in ("world-space.json", "natural-endowment.json", "opening-society.json",
                 "connections-rights.json", "initialization-validation.json", "reconciliation-ledger.json"):
        manifest["sourceJson"][name] = sha((DATA / name).read_bytes())
    for name, rows in sections.items():
        manifest["tables"][name] = write_csv(name, rows)
    (TABLES / "all_tables.json").write_text(json.dumps(sections, ensure_ascii=False, separators=(",", ":")) + "\n")
    manifest["allTablesJsonSha256"] = sha((TABLES / "all_tables.json").read_bytes())
    (DATA / "package-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"tables": {name: len(rows) for name, rows in sections.items()},
                      "countriesWithFinancialProposal": sum(x["proposedFinanceCreditLineGcu"] > 0 for x in fairness),
                      "totalProposedCreditGcu": round(sum(x["proposedFinanceCreditLineGcu"] for x in fairness), 2)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
