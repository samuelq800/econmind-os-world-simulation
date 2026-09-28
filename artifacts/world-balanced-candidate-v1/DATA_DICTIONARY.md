# World V2 完整候选数据字典

所有 JSON 均为候选设计数据；本目录没有生产入库脚本。JSON 保留完整嵌套关系，CSV 中嵌套对象使用 JSON 单元格。

## assumptions.json

记录数：1

| 字段 | 类型 |
|---|---|
| `resourceVolumes` | str |
| `population` | str |
| `grainWaterM3HaYear` | int |
| `averageGridLossFraction` | float |
| `storageHoursAtAverageDemand` | int |
| `storageEfficiency` | float |
| `solarFootprintKm2MW` | float |
| `windDedicatedFootprintKm2MW` | float |
| `urbanPopulationPerKm2` | int |
| `minimumStockDaysAfterLongestDelivery` | int |
| `normalTradeBalanceBand` | float |
| `industrialPortfolioMinimumShareOfConsumptionValuePerRoute` | str |
| `openingCapital` | str |
| `financialAndRecipeNumbers` | str |
| `domesticAccessDetourFactor` | float |
| `internationalRouting` | str |
| `transportCostGcuTonneKm` | float |
| `referenceFuelDemandBarrelEquivalentPersonDay` | float |
| `rejectedDraftFuelDemand` | float |
| `fuelCorrectionReason` | str |
| `costPerCapacityUnit.MW` | int |
| `costPerCapacityUnit.MWh` | int |
| `costPerCapacityUnit.bed` | int |
| `costPerCapacityUnit.student-seat` | int |
| `costPerCapacityUnit.dwelling-unit` | int |
| `costPerCapacityUnit.tonne` | int |
| `costPerCapacityUnit.tonne/sim-day` | int |
| `costPerCapacityUnit.barrel/sim-day` | int |
| `costPerCapacityUnit.barrel equivalent/sim-day` | int |
| `costPerCapacityUnit.MMBtu/sim-day` | int |
| `costPerCapacityUnit.tonne U/sim-day` | int |
| `costPerCapacityUnit.tonne LCE/sim-day` | int |
| `costPerCapacityUnit.equipment unit/sim-day` | int |
| `costPerCapacityUnit.standardised chip unit/sim-day` | int |
| `costPerCapacityUnit.MWh-equivalent/sim-day` | int |
| `costPerCapacityUnit.patient-visit/sim-day` | int |
| `costPerCapacityUnit.equipment-unit/sim-day` | int |
| `demographicDynamics.birthRatePerYear` | float |
| `demographicDynamics.deathRatePerYear` | float |
| `demographicDynamics.netMigration` | int |
| `demographicDynamics.appliedInSteadyStateRehearsal` | bool |
| `demographicDynamics.basis` | str |
| `disasterRules.droughtTestYieldReduction` | float |
| `disasterRules.droughtDurationDays` | int |
| `disasterRules.importPauseDays` | int |
| `disasterRules.hazardExposureIsNotEventProbability` | bool |

## changes.json

记录数：130

| 字段 | 类型 |
|---|---|
| `objectId` | str |
| `field` | str |
| `reason` | str |
| `transferredKm2` | float |
| `from` | str |
| `to` | str |
| `before` | int |
| `after` | int |

## commodity-catalog.json

记录数：12

| 字段 | 类型 |
|---|---|
| `id` | str |
| `unit` | str |
| `referencePriceGcu` | float |
| `finalDemandPerPersonDay` | float |
| `freightTonnesPerUnit` | float |

## countries.json

记录数：70

| 字段 | 类型 |
|---|---|
| `id` | str |
| `name` | str |
| `number` | str |
| `economyIdProposal` | str |
| `governmentId` | str |
| `operatorId` | str |
| `teamAssignment` | NoneType |
| `administrationProposal` | str |
| `areaKm2` | float |
| `population` | int |
| `previousPopulation` | int |
| `labourForce` | int |
| `urbanShare` | float |
| `coastal` | bool |
| `capitalPointProposal` | array |
| `regionIds` | array |
| `neighbours` | array |
| `climateMix[].id` | int |
| `climateMix[].landPixels` | int |
| `climateMix[].sharePercent` | float |
| `guaranteedProductionRoutes` | array |
| `leadingSectors` | array |
| `principalExports` | array |
| `principalImports` | array |
| `dailyReferenceConsumptionValueGcu` | float |
| `dailyReferenceTradeNetGcu` | float |
| `tradeNetToConsumptionRatio` | float |
| `stockBufferDays` | float |
| `sourceOfDifference` | str |
| `seaAccessPortCountryId` | str |
| `seaAccessBasis` | str |
| `longestInboundLeadDays` | float |
| `openingSettlementAndEnergyLandKm2` | float |
| `occupiedProductionAndPublicServiceJobs` | int |
| `maintenanceGcuDay` | float |
| `freightBudgetGcuDay` | float |

## coverage.json

记录数：8

| 字段 | 类型 |
|---|---|
| `domain` | str |
| `candidateData` | str |
| `runtimeActivation` | str |
| `remainingAdapterWork` | str |

## deposits.json

记录数：240

| 字段 | 类型 |
|---|---|
| `id` | str |
| `countryId` | str |
| `commodityId` | str |
| `unit` | str |
| `provinceId` | str |
| `provinceType` | str |
| `initialGeological` | float |
| `historicalConsumed` | float |
| `cumulativeExtracted` | float |
| `remainingGeological` | float |
| `discoveredRemaining` | float |
| `recoverableRemaining` | float |
| `developedRemaining` | float |
| `qualityProxy` | float |
| `depthM` | int |
| `developmentDifficulty` | float |
| `extractionCapacityPerDay` | float |
| `requiredRoad` | bool |
| `requiredGrid` | bool |
| `visibility` | str |
| `uncertaintyFactor` | array |
| `point` | array |
| `regionId` | str |
| `runtimeExtractionPerDay` | int |
| `developedReserveInterpretation` | str |
| `openingExtractionPlanPerDay` | float |
| `openingStockRawEquivalentAllocated` | float |

## domestic-access.json

记录数：1304

| 字段 | 类型 |
|---|---|
| `id` | str |
| `fromId` | str |
| `toId` | str |
| `countryId` | str |
| `distanceKmEstimate` | float |
| `mode` | str |
| `status` | str |
| `capacityTonnesDayProposal` | float |
| `engineeringStatus` | str |

## employment.json

记录数：70

| 字段 | 类型 |
|---|---|
| `countryId` | str |
| `labourForce` | int |
| `employed` | int |
| `unemployed` | int |
| `sectors.CRUDE_OIL` | int |
| `sectors.NATURAL_GAS` | int |
| `sectors.URANIUM` | int |
| `sectors.GRAIN` | int |
| `sectors.IRON_ORE` | int |
| `sectors.COPPER` | int |
| `sectors.LITHIUM` | int |
| `sectors.STEEL` | int |
| `sectors.REFINED_FUEL` | int |
| `sectors.MACHINERY` | int |
| `sectors.SEMICONDUCTORS` | int |
| `sectors.BATTERIES` | int |
| `educationAndHealth` | int |
| `power` | int |
| `logistics` | int |
| `otherDomesticServices` | int |
| `interpretation` | str |

## entities.json

记录数：350

| 字段 | 类型 |
|---|---|
| `id` | str |
| `countryId` | str |
| `economyId` | str |
| `role` | str |
| `realTeamBinding` | NoneType |
| `bindingMode` | str |

## facilities.json

记录数：1374

| 字段 | 类型 |
|---|---|
| `id` | str |
| `countryId` | str |
| `regionId` | str |
| `name` | str |
| `projectId` | str |
| `point` | array |
| `capacity` | float |
| `capacityUnit` | str |
| `operatorId` | str |
| `ownerId` | str |
| `scenarioRole` | str |
| `runtimeOperational` | bool |
| `openingAvailabilityProposal` | bool |
| `status` | str |
| `renderingStatus` | str |
| `resourceId` | NoneType |
| `legacyRecord.id` | str |
| `legacyRecord.countryId` | str |
| `legacyRecord.projectId` | str |
| `legacyRecord.projectNumber` | int |
| `legacyRecord.name` | str |
| `legacyRecord.lifecycle` | str |
| `legacyRecord.operational` | bool |
| `legacyRecord.estimatedCapacity` | float |
| `legacyRecord.capacityUnit` | str |
| `legacyRecord.requiredWorkers` | int |
| `legacyRecord.requiredPowerMW` | float |
| `legacyRecord.requiredWaterM3Day` | int |
| `legacyRecord.maintenanceGcuDay` | float |
| `legacyRecord.equipmentUnits` | int |
| `legacyRecord.constructionSimDays` | int |
| `legacyRecord.recipeStatus` | str |
| `legacyRecord.inputCategories` | array |
| `legacyRecord.gridNodeId` | str |
| `legacyRecord.accessNodeId` | str |
| `legacyRecord.capacityBasis` | str |
| `requiredWorkers` | int |
| `requiredPowerMW` | int |
| `requiredWaterM3Day` | int |
| `installedMachineryUnits` | int |
| `constructionSimDaysProposal` | int |
| `maintenanceGcuDayProposal` | float |
| `recipeId` | NoneType |
| `licenseIdProposal` | NoneType |
| `constructionStatusProposal` | str |
| `commodityId` | str |
| `plannedOutputPerDay` | float |
| `aggregateFacility` | bool |
| `labourBySkill.low` | int |
| `labourBySkill.medium` | int |
| `labourBySkill.high` | int |
| `replacementCostGcuProposal` | float |
| `dailyMaintenanceGcuProposal` | float |
| `conditionFraction` | int |
| `plannedUtilizationFraction` | NoneType |
| `costBasis` | str |
| `depositId` | str |
| `coastal` | bool |
| `previousCandidatePoint` | array |
| `siteBasis` | str |
| `harbourAccessStatus` | str |

## facility-map-links.json

记录数：1374

| 字段 | 类型 |
|---|---|
| `facilityId` | str |
| `legacyFacilityId` | NoneType |
| `countryId` | str |
| `geographicPoint` | array |
| `sceneAnchor` | NoneType |
| `markerAction` | str |
| `scenePointAuthority` | str |

## finance.json

记录数：70

| 字段 | 类型 |
|---|---|
| `countryId` | str |
| `currency` | str |
| `dailyLabourIncomeReference` | float |
| `treasuryCentralBankBalance` | float |
| `householdBankDeposits` | float |
| `businessBankDeposits` | float |
| `bankReserveAssets` | float |
| `bankLoanAssets` | int |
| `bankEquity` | float |
| `bankDepositLiabilities` | float |
| `publicDebt` | int |
| `existingContracts` | array |
| `historicalClaims` | array |
| `dailyReferenceTradeNet` | float |
| `openingMoneyOrigin` | str |
| `taxRateProposal` | float |
| `taxBase` | str |
| `priceAuthority` | str |
| `openingPhysicalAssetBookValueGcu` | float |
| `assetFunding` | str |
| `dailyMaintenanceBudgetGcu` | float |
| `dailyInboundFreightBudgetGcu` | float |
| `dailyTaxRevenueReferenceGcu` | float |
| `dailyNetCashDrainGcu` | float |
| `reserveBasis` | str |
| `cashRunwayDays` | float |
| `cashRunwayStatus` | str |

## geography.json

记录数：1

| 字段 | 类型 |
|---|---|
| `partition.width` | int |
| `partition.height` | int |
| `partition.sourceSha256` | str |
| `partition.coastPath` | str |
| `partition.territories[].id` | str |
| `partition.territories[].number` | str |
| `partition.territories[].path` | str |
| `partition.territories[].label` | array |
| `partition.territories[].landPixels` | int |
| `partition.coverage.landPixels` | int |
| `partition.coverage.assignedPixels` | int |
| `partition.coverage.unassignedPixels` | int |
| `partition.coverage.assignedWaterPixels` | int |
| `partition.coverage.territoryCount` | int |
| `partition.coverage.landComponents` | int |
| `climates[].id` | int |
| `climates[].name` | str |
| `climates[].color` | str |
| `climates[].description` | str |
| `climates[].path` | str |
| `climates[].landPixels` | int |
| `physical[].id` | str |
| `physical[].name` | str |
| `physical[].kind` | str |
| `physical[].path` | str |
| `physical[].label` | array |
| `currents[].id` | str |
| `currents[].name` | str |
| `currents[].kind` | str |
| `currents[].path` | str |
| `currents[].points` | array |
| `currents[].arrows` | array |
| `maritime.version` | str |
| `maritime.status` | str |
| `maritime.partitionSha256` | str |
| `maritime.kmPerPixel` | float |
| `maritime.territorialSeaNm` | int |
| `maritime.eezLimitNm` | int |
| `maritime.territorialSeaKm` | float |
| `maritime.eezLimitKm` | float |
| `maritime.territorialRadiusPixels` | float |
| `maritime.eezRadiusPixels` | float |
| `maritime.countries[].id` | str |
| `maritime.countries[].coastal` | bool |
| `maritime.countries[].territorialCandidatePath` | str |
| `maritime.countries[].eezCandidatePath` | str |
| `maritime.territorialPath` | str |
| `maritime.eezPath` | str |
| `maritime.highSeasPath` | str |
| `maritime.overlapPath` | str |
| `maritime.territorialOverlapPath` | str |
| `maritime.oceanPath` | str |
| `maritime.areas.territorial` | float |
| `maritime.areas.eez` | float |
| `maritime.areas.highSeas` | float |
| `maritime.areas.ocean` | float |
| `maritime.assumptions` | array |
| `maritime.sources[].label` | str |
| `maritime.sources[].url` | str |
| `basins[].id` | str |
| `basins[].featureId` | str |
| `basins[].kind` | str |
| `basins[].regionIds` | array |
| `basins[].countryIds` | array |
| `basins[].annualInflowM3` | int |
| `basins[].environmentalFlowM3Year` | int |
| `basins[].allocatableM3Day` | int |
| `basins[].lakeStorageM3` | int |
| `basins[].freshwaterAssumed` | bool |
| `basins[].outlet` | str |
| `basins[].allocationMethod` | str |
| `basins[].limitation` | str |
| `backgroundResources[].id` | str |
| `backgroundResources[].kind` | str |
| `backgroundResources[].point` | array |
| `backgroundResources[].countryId` | str |
| `backgroundResources[].climateId` | int |
| `backgroundResources[].classification` | str |
| `backgroundResources[].commodityId` | str |
| `backgroundResources[].visibility` | str |
| `backgroundResources[].tradable` | bool |

## hazard-proposals.json

记录数：366

| 字段 | 类型 |
|---|---|
| `regionId` | str |
| `countryId` | str |
| `kind` | str |
| `exposure` | float |
| `annualEventProbabilityProposal` | float |
| `productionLossFractionProposal` | float |
| `durationSimDaysProposal` | int |
| `ruleAuthority` | str |

## illustration-links.json

记录数：1

| 字段 | 类型 |
|---|---|
| `countryScenes[].id` | str |
| `countryScenes[].number` | str |
| `countryScenes[].name` | str |
| `countryScenes[].file` | str |
| `countryScenes[].frame` | array |
| `countryScenes[].anchors.SF001` | array |
| `countryScenes[].anchors.SF002` | array |
| `countryScenes[].anchors.SF003` | array |
| `countryScenes[].anchors.SF004` | array |
| `countryScenes[].anchors.SF005` | array |
| `countryScenes[].status` | str |
| `countryScenes[].landmarkReview` | str |
| `continentScenes[].id` | str |
| `continentScenes[].name` | str |
| `continentScenes[].frame` | array |
| `continentScenes[].file` | str |
| `continentScenes[].description` | str |
| `interpretation` | str |

## land-program.json

记录数：76

| 字段 | 类型 |
|---|---|
| `countryId` | str |
| `regionId` | str |
| `from` | str |
| `to` | str |
| `areaKm2` | float |
| `reason` | str |

## license-proposals.json

记录数：234

| 字段 | 类型 |
|---|---|
| `id` | str |
| `countryId` | str |
| `grantorId` | str |
| `holderId` | str |
| `activity` | str |
| `validFromSimDay` | int |
| `validUntilSimDay` | int |
| `status` | str |
| `feeGcuProposal` | int |
| `conditions` | array |

## manifest.json

记录数：1

| 字段 | 类型 |
|---|---|
| `version` | str |
| `status` | str |
| `activationAllowed` | bool |
| `sourceSnapshots[].sourcePath` | str |
| `sourceSnapshots[].snapshot` | str |
| `sourceSnapshots[].sha256` | str |
| `sourceSnapshots[].bytes` | int |
| `sourcePriority` | array |
| `simDaysYear` | int |
| `seasonSimDays` | int |
| `populationTotalPreserved` | int |
| `balanceDefinition` | str |
| `pricePolicy` | str |
| `newNumbersAuthority` | str |
| `solver` | str |
| `worldIdentity` | str |
| `noProductionMutation` | bool |

## nodes.json

记录数：1374

| 字段 | 类型 |
|---|---|
| `id` | str |
| `countryId` | str |
| `regionId` | str |
| `point` | array |

## opening-material-reconciliation.json

记录数：6

| 字段 | 类型 |
|---|---|
| `commodityId` | str |
| `unit` | str |
| `cumulativeExtraction` | float |
| `openingStockRawEquivalent` | float |
| `historicalConsumed` | float |
| `basis` | str |

## population-services.json

记录数：122

| 字段 | 类型 |
|---|---|
| `id` | str |
| `countryId` | str |
| `regionId` | str |
| `population` | int |
| `households` | int |
| `housingUnits` | int |
| `schoolSeats` | int |
| `teachers` | int |
| `medicalWorkers` | int |
| `hospitalBeds` | int |
| `dailyMedicalVisits` | int |
| `waterDomesticM3Day` | float |
| `sourceStatus` | str |

## power.json

记录数：70

| 字段 | 类型 |
|---|---|
| `id` | str |
| `countryId` | str |
| `solarMW` | float |
| `windMW` | float |
| `solarCapacityFactor` | float |
| `windCapacityFactor` | float |
| `averageDemandMW` | float |
| `averageDeliveredMW` | float |
| `lossFraction` | float |
| `storageMWh` | float |
| `storageDischargeMW` | float |
| `storageEfficiency` | float |
| `openingStateOfChargeFraction` | int |
| `crossBorderConnections` | array |
| `hourlyDispatchValidated` | bool |
| `status` | str |

## production-plans.json

记录数：840

| 字段 | 类型 |
|---|---|
| `countryId` | str |
| `commodityId` | str |
| `outputPerDay` | float |
| `usePerDay` | float |
| `netPerDay` | float |
| `unit` | str |

## recipes.json

记录数：12

| 字段 | 类型 |
|---|---|
| `id` | str |
| `commodityId` | str |
| `outputUnit` | str |
| `outputQuantity` | int |
| `electricityMWhPerUnit` | float |
| `waterM3PerUnit` | float |
| `workersPerDailyOutputUnit` | float |
| `projectId` | str |
| `agricultureOwnerProposal` | NoneType |
| `authority` | str |
| `inputsPerUnit.IRON_ORE` | float |
| `inputsPerUnit.NATURAL_GAS` | int |
| `inputsPerUnit.CRUDE_OIL` | float |
| `inputsPerUnit.STEEL` | int |
| `inputsPerUnit.COPPER` | float |
| `inputsPerUnit.MACHINERY` | float |
| `inputsPerUnit.LITHIUM` | float |

## regions.json

记录数：122

| 字段 | 类型 |
|---|---|
| `id` | str |
| `countryId` | str |
| `path` | str |
| `label` | array |
| `areaKm2` | float |
| `landUseKm2.croplandPotential` | float |
| `landUseKm2.forest` | float |
| `landUseKm2.urbanIndustrialPotential` | float |
| `landUseKm2.mountain` | float |
| `landUseKm2.inlandWater` | float |
| `landUseKm2.convertible` | float |
| `natural.meanElevationM` | int |
| `natural.temperatureC` | float |
| `natural.annualRainMm` | int |
| `natural.monthlyRainMm` | array |
| `natural.runoffM3Year` | int |
| `natural.environmentalFlowM3Year` | int |
| `natural.allocatableWaterM3Day` | int |
| `natural.drySeasonWaterM3Day` | int |
| `natural.grainPotentialTonnesYear` | float |
| `natural.grainYieldTonnesHa` | float |
| `natural.solarKwhM2Day` | float |
| `natural.windMps` | float |
| `natural.droughtExposure` | float |
| `natural.floodExposure` | float |
| `natural.stormExposure` | float |
| `initial.population` | int |
| `initial.workingAge` | int |
| `initial.labourForce` | int |
| `initial.skills.low` | int |
| `initial.skills.medium` | int |
| `initial.skills.high` | int |
| `initial.households` | int |
| `initial.housingUnits` | int |
| `initial.croplandHa` | float |
| `initial.grainTonnesDay` | float |
| `initial.grainDemandTonnesDay` | float |
| `initial.foodStockTonnes` | int |
| `initial.teachers` | int |
| `initial.medicalWorkers` | int |
| `initial.schoolSeats` | int |
| `initial.hospitalBeds` | int |
| `basis` | str |
| `settlementAccess` | float |
| `humanGeography.transportDistanceKm` | int |
| `humanGeography.riverDistanceKm` | int |
| `humanGeography.transportGravity` | float |
| `humanGeography.riverGravity` | float |
| `humanGeography.settlementType` | str |
| `humanGeography.scenarioUrbanShare` | float |
| `humanGeography.basis` | str |
| `basinId` | str |
| `populationBasis` | str |

## seasonal-water.json

记录数：122

| 字段 | 类型 |
|---|---|
| `regionId` | str |
| `basinId` | str |
| `monthlyRunoffM3Proposal` | array |
| `ecologicalReserveShare` | float |
| `seasonalBasis` | str |

## settlements.json

记录数：244

| 字段 | 类型 |
|---|---|
| `id` | str |
| `countryId` | str |
| `regionId` | str |
| `name` | str |
| `kind` | str |
| `population` | int |
| `representativePoint` | array |
| `coordinatePrecision` | str |

## stocks.json

记录数：840

| 字段 | 类型 |
|---|---|
| `id` | str |
| `countryId` | str |
| `ownerId` | str |
| `warehouseId` | str |
| `commodityId` | str |
| `unit` | str |
| `available` | float |
| `reserved` | int |
| `inTransit` | int |
| `bufferDays` | float |
| `origin` | str |

## supplier-concentration-policy.json

记录数：12

| 字段 | 类型 |
|---|---|
| `commodityId` | str |
| `maxCountryOutputShare` | float |
| `basis` | str |

## technology-proposals.json

记录数：98

| 字段 | 类型 |
|---|---|
| `countryId` | str |
| `technologyId` | str |
| `holderId` | str |
| `levelProposal` | int |
| `status` | str |
| `royaltyGcuPerDayProposal` | int |
| `scope` | str |

## trade-plans.json

记录数：641

| 字段 | 类型 |
|---|---|
| `id` | str |
| `commodityId` | str |
| `unit` | str |
| `sellerCountryId` | str |
| `buyerCountryId` | str |
| `sellerEntityId` | str |
| `buyerEntityId` | str |
| `fromNodeId` | str |
| `toNodeId` | str |
| `quantityPerDay` | float |
| `freightTonnesDay` | float |
| `referenceUnitPriceGcu` | float |
| `distanceKmEstimate` | float |
| `travelSimDaysEstimate` | float |
| `mode` | str |
| `transportCostGcuDayProposal` | float |
| `status` | str |
| `physicalRouteStatus` | str |
| `routeGeometry.routeId` | str |
| `requiresTransit` | bool |
| `routeId` | str |

## transit-proposals.json

记录数：153

| 字段 | 类型 |
|---|---|
| `id` | str |
| `flowId` | str |
| `countryIds` | array |
| `consentStatus` | str |

## transport-routes.json

记录数：564

| 字段 | 类型 |
|---|---|
| `id` | str |
| `fromCountryId` | str |
| `toCountryId` | str |
| `fromNodeId` | str |
| `toNodeId` | str |
| `portCountryIds` | array |
| `transitCountryIds` | array |
| `segments[].mode` | str |
| `segments[].points` | array |
| `segments[].distanceKm` | float |
| `segments[].surfaceOutsideLengthPixels` | float |
| `distanceKm` | float |
| `status` | str |
| `gridStepPixels` | int |
| `engineeringAndRightsApproved` | bool |

## water-allocations.json

记录数：122

| 字段 | 类型 |
|---|---|
| `regionId` | str |
| `countryId` | str |
| `basinId` | str |
| `domesticM3Day` | float |
| `agricultureM3Day` | float |
| `industryM3Day` | float |
| `allocatedM3Day` | float |
| `availableM3Day` | int |
| `remainingM3Day` | float |
| `drySeasonAvailableM3Day` | int |
| `rightsStatus` | str |

