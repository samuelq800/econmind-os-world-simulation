import { kernelInvalid } from './common.js';
import { CAUSAL_CHAINS } from './causal-channels.js';
import type { CausalUnit, CausalValueSign } from './causal-values.js';

/** The only systems permitted to use the fixed C101–C150 dimensional registry. */
export type QuantifiedSystemId =
  | 'FIRM_ECOLOGY'
  | 'INSTITUTIONS_STATE_CAPACITY'
  | 'LAND_WATER_FOOD'
  | 'ENVIRONMENT_NATURAL_CAPITAL'
  | 'DEMOGRAPHY_HOUSEHOLD'
  | 'ASSET_SPATIAL_DIGITAL';

export interface FixedQuantifiedNodeContract {
  readonly node: string;
  readonly systems: readonly QuantifiedSystemId[];
  readonly unit: CausalUnit;
  readonly sign: CausalValueSign;
}

interface FixedNodeDefinition {
  readonly unit: CausalUnit;
  readonly sign: CausalValueSign;
}

const SYSTEM_CHAIN_RANGES: Readonly<
  Record<QuantifiedSystemId, readonly [bigint, bigint]>
> = Object.freeze({
  FIRM_ECOLOGY: [101n, 110n],
  INSTITUTIONS_STATE_CAPACITY: [111n, 120n],
  LAND_WATER_FOOD: [121n, 125n],
  ENVIRONMENT_NATURAL_CAPITAL: [126n, 130n],
  DEMOGRAPHY_HOUSEHOLD: [131n, 140n],
  ASSET_SPATIAL_DIGITAL: [141n, 150n],
});

function quantityUnit(unit: string): CausalUnit {
  return Object.freeze({ kind: 'QUANTITY' as const, unit });
}

function moneyUnit(currency: string): CausalUnit {
  return Object.freeze({ kind: 'MONEY' as const, currency });
}

function priceUnit(currency: string, perUnit: string): CausalUnit {
  return Object.freeze({ kind: 'UNIT_PRICE' as const, currency, perUnit });
}

function fixedQuantity(
  unit: string,
  sign: CausalValueSign = 'NON_NEGATIVE',
): FixedNodeDefinition {
  return Object.freeze({ unit: quantityUnit(unit), sign });
}

function fixedMoney(
  sign: CausalValueSign = 'NON_NEGATIVE',
): FixedNodeDefinition {
  return Object.freeze({ unit: moneyUnit('GCU'), sign });
}

function fixedPrice(perUnit: string): FixedNodeDefinition {
  return Object.freeze({
    unit: priceUnit('GCU', perUnit),
    sign: 'NON_NEGATIVE',
  });
}

const DEFAULT_NODE_DEFINITION = fixedQuantity('index_point');

/**
 * Units for concrete stocks, flows, prices and currency values. Nodes omitted
 * here are still fixed to `index_point` below: their topology is known, but no
 * authoritative physical stock unit has been approved for them yet.
 */
const FIXED_NODE_DEFINITIONS: Readonly<Record<string, FixedNodeDefinition>> =
  Object.freeze({
    SECTOR_PROFITABILITY: fixedMoney('SIGNED'),
    NEW_FIRM_ENTRY: fixedQuantity('firm'),
    SECTOR_CAPACITY: fixedQuantity('tonne_per_period'),
    LABOUR_DEMAND: fixedQuantity('person'),
    SECTOR_MARGIN: fixedQuantity('percentage_point', 'SIGNED'),
    FIRM_EXIT: fixedQuantity('firm'),
    SECTOR_EMPLOYMENT: fixedQuantity('person'),
    MARKET_SUPPLY: fixedQuantity('tonne_per_period'),
    UNIT_PRICE: fixedPrice('tonne'),
    OPERATING_CASH_FLOW: fixedMoney('SIGNED'),
    DEBT_SERVICE_FAILURE: fixedMoney(),
    TECHNICAL_DEFAULT: fixedQuantity('firm'),
    INSOLVENCY: fixedQuantity('firm'),
    LAYOFFS: fixedQuantity('person'),
    ASSET_LIQUIDATION: fixedMoney(),
    SUPPLIER_LOSSES: fixedMoney(),
    BANK_NPL: fixedMoney(),
    ENERGY_PRICE_SHOCK: fixedPrice('megawatt_hour'),
    LOW_EFFICIENCY_FIRM_EXIT: fixedQuantity('firm'),
    SURVIVING_FIRM_AVERAGE_PRODUCTIVITY: fixedQuantity(
      'tonne_per_person_period',
    ),
    EDUCATION: fixedQuantity('education_index_point'),
    QUALIFIED_FOUNDERS: fixedQuantity('person'),
    FINANCE: fixedMoney(),
    MARKET_OPPORTUNITY: fixedQuantity('opportunity'),
    INSTITUTIONAL_CAPACITY: fixedQuantity('permit'),
    STARTUP_FORMATION: fixedQuantity('firm'),
    STARTUP_EMPLOYMENT: fixedQuantity('person'),
    ENTREPRENEURIAL_INNOVATION: fixedQuantity('patent_per_period'),
    STARTUP_COHORT: fixedQuantity('firm'),
    STARTUP_FAILURE: fixedQuantity('firm'),
    STARTUP_SURVIVAL: fixedQuantity('firm'),
    SCALE_UP_FIRM_COUNT: fixedQuantity('firm'),
    SOE_LOSSES: fixedMoney(),
    GOVERNMENT_GUARANTEE: fixedMoney(),
    BANK_ROLLOVER_CREDIT: fixedMoney(),
    SOE_EXIT: fixedQuantity('firm'),
    SOE_SOFT_BUDGET_SUPPORT: fixedMoney(),
    PRODUCTIVITY: fixedQuantity('tonne_per_person_period'),
    FUTURE_FISCAL_LIABILITY: fixedMoney(),
    BUYER_PAYMENT_DELAY: fixedQuantity('day'),
    SUPPLIER_CASH: fixedMoney(),
    SUPPLIER_WAGE_PAYMENT: fixedMoney(),
    SUPPLIER_DEFAULT: fixedQuantity('firm'),
    TRADE_CREDIT_LOSSES: fixedMoney(),
    TARGET_INVENTORY: fixedQuantity('tonne'),
    SUPPLIER_ORDERS: fixedQuantity('tonne_per_period'),
    SUPPLIER_PRODUCTION: fixedQuantity('tonne_per_period'),
    ACTUAL_TAX_REVENUE: fixedMoney(),
    REPORTED_TAX_BASE: fixedMoney(),
    PROCUREMENT_APPROPRIATION: fixedMoney(),
    CORRUPTION_LEAKAGE: fixedMoney(),
    ACTUAL_PROCUREMENT: fixedMoney(),
    INFRASTRUCTURE_UNIT_COST: fixedPrice('infrastructure_unit'),
    EFFECTIVE_CONSTRUCTION: fixedQuantity('infrastructure_unit'),
    COURT_ENFORCEMENT_TIME: fixedQuantity('day'),
    PREPAYMENT_REQUIREMENT: fixedQuantity('ratio'),
    TRADE_CREDIT: fixedMoney(),
    LENDING_RISK_PREMIUM: fixedQuantity('percentage_point'),
    INVESTMENT: fixedMoney(),
    PRIVATE_INVESTMENT: fixedMoney(),
    FDI: fixedMoney(),
    CAPITAL_FLIGHT: fixedMoney(),
    FIXED_COMPLIANCE_COST: fixedMoney(),
    SMALL_FIRM_ENTRY: fixedQuantity('firm'),
    PROGRAMME_APPROVAL: fixedQuantity('case'),
    CASE_PROCESSING_QUEUE: fixedQuantity('case'),
    STAFF_CAPACITY: fixedQuantity('case_per_period'),
    ACTUAL_IMPLEMENTATION: fixedQuantity('case'),
    TRUE_ECONOMIC_ACTIVITY: fixedMoney(),
    OBSERVED_ECONOMIC_ACTIVITY: fixedMoney(),
    STATISTICAL_ERROR: fixedMoney('SIGNED'),
    DATA_REVISION: fixedMoney('SIGNED'),
    INFORMAL_EMPLOYMENT: fixedQuantity('person'),
    ACTUAL_ECONOMIC_ACTIVITY: fixedMoney(),
    SOCIAL_INSURANCE_COVERAGE: fixedQuantity('ratio'),
    LOCAL_TAX_BASE: fixedMoney(),
    LOCAL_REVENUE: fixedMoney(),
    LOCAL_DEBT_SERVICE: fixedMoney(),
    LOCAL_FISCAL_CAPACITY: fixedMoney('SIGNED'),
    PREFERENTIAL_REGULATION_SUBSIDY: fixedMoney(),
    INDUSTRIAL_EXPANSION: fixedQuantity('square_kilometre'),
    INDUSTRIAL_LAND_DEMAND: fixedQuantity('square_kilometre'),
    LAND_PRICE: fixedPrice('square_kilometre'),
    HOUSING_CONSTRUCTION_COST: fixedPrice('housing_unit'),
    LAND_ALLOCATION: fixedQuantity('square_kilometre'),
    AGRICULTURAL_LAND: fixedQuantity('square_kilometre'),
    POPULATION_INFLOW: fixedQuantity('person'),
    HOUSING_DEMAND: fixedQuantity('housing_unit'),
    RENT: fixedPrice('housing_unit'),
    WATER_SUPPLY: fixedQuantity('cubic_metre_per_day'),
    AGRICULTURAL_OUTPUT: fixedQuantity('tonne_per_day'),
    SEMICONDUCTOR_CAPACITY: fixedQuantity('wafer_per_day'),
    POWER_GENERATION: fixedQuantity('MWh_per_day'),
    CROP_YIELD: fixedQuantity('tonne_per_hectare'),
    HARVEST_OUTPUT: fixedQuantity('tonne'),
    PLANTING_HARVEST_SEASON: fixedQuantity('day'),
    FERTILIZER_PRICE: fixedPrice('tonne'),
    FARM_INPUT_USE: fixedQuantity('tonne_per_day'),
    FUTURE_CROP_YIELD: fixedQuantity('tonne_per_hectare'),
    FOOD_SUPPLY: fixedQuantity('tonne_per_day'),
    FOOD_INFLATION: fixedQuantity('percentage_point'),
    REMAINING_RESOURCE: fixedQuantity('tonne'),
    ORE_GRADE: fixedQuantity('percentage_point'),
    UNIT_EXTRACTION_COST: fixedPrice('tonne'),
    INDUSTRIAL_OUTPUT: fixedQuantity('tonne_per_day'),
    POLLUTION: fixedQuantity('tonne_per_day'),
    RESPIRATORY_ILLNESS: fixedQuantity('case'),
    HEALTHCARE_DEMAND: fixedQuantity('case'),
    ABSENTEEISM: fixedQuantity('person_day'),
    CONSUMPTION_PRODUCTION: fixedQuantity('tonne_per_day'),
    WASTE: fixedQuantity('tonne_per_day'),
    RECYCLING_CAPACITY: fixedQuantity('tonne_per_day'),
    SECONDARY_RAW_MATERIAL: fixedQuantity('tonne_per_day'),
    VIRGIN_RESOURCE_DEMAND: fixedQuantity('tonne_per_day'),
    AVERAGE_TEMPERATURE: fixedQuantity('degree_Celsius'),
    COOLING_DEMAND: fixedQuantity('MWh_per_day'),
    WORKER_PRODUCTIVITY: fixedQuantity('tonne_per_person_period'),
    WATER_DEMAND: fixedQuantity('cubic_metre_per_day'),
    INSURANCE_COST: fixedMoney(),
    COAL_DEMAND: fixedQuantity('tonne_per_day'),
    COAL_PLANT_VALUE: fixedMoney(),
    MINING_FIRM_LOSSES: fixedMoney(),
    BANK_LOAN_LOSSES: fixedMoney(),
    REGIONAL_EMPLOYMENT: fixedQuantity('person'),
    HOUSING_COST: fixedPrice('housing_unit'),
    FERTILITY: fixedQuantity('birth_per_1000_person'),
    FUTURE_SCHOOL_DEMAND: fixedQuantity('student'),
    FUTURE_LABOUR_FORCE: fixedQuantity('person'),
    YOUNG_ADULT_INCOME: fixedMoney(),
    LEAVING_PARENTAL_HOME: fixedQuantity('person'),
    HOUSEHOLD_COUNT: fixedQuantity('household'),
    ELDERLY_DEPENDENCY: fixedQuantity('person'),
    UNPAID_CARE_HOURS: fixedQuantity('hour'),
    LABOUR_PARTICIPATION: fixedQuantity('ratio'),
    IMMIGRATION: fixedQuantity('person'),
    EFFECTIVE_SKILL_SUPPLY: fixedQuantity('person'),
    PARENTAL_INCOME: fixedMoney(),
    FUTURE_INCOME: fixedMoney(),
    TAX_COMPLIANCE: fixedQuantity('ratio'),
    CASH_HOARDING: fixedMoney(),
    CONTRACT_COLLATERAL_REQUIREMENT: fixedQuantity('ratio'),
    WORKING_HOURS: fixedQuantity('hour'),
    SHORT_RUN_OUTPUT: fixedQuantity('tonne_per_day'),
    CRIME: fixedQuantity('incident'),
    SECURITY_SPENDING: fixedMoney(),
    RETAIL_FOOTFALL: fixedQuantity('person'),
    PROPERTY_VALUE: fixedMoney(),
    BUSINESS_ENTRY: fixedQuantity('firm'),
    HOUSEHOLD_INCOME: fixedMoney(),
    FOOD_BUDGET_SHARE: fixedQuantity('percentage_point'),
    SERVICES_DURABLES_BUDGET_SHARE: fixedQuantity('percentage_point'),
    HOUSE_PRICE: fixedPrice('housing_unit'),
    COLLATERAL_VALUE: fixedMoney(),
    MORTGAGE_CREDIT: fixedMoney(),
    EQUITY_VALUATION: fixedMoney(),
    COST_OF_EQUITY: fixedQuantity('percentage_point'),
    HOUSEHOLD_WEALTH: fixedMoney(),
    CORPORATE_BOND_YIELD: fixedQuantity('percentage_point'),
    REFINANCING_COST: fixedMoney(),
    FLOOD_CATASTROPHE_LOSS: fixedMoney(),
    INSURER_CLAIMS: fixedMoney(),
    INSURANCE_COVERAGE: fixedQuantity('ratio'),
    HOUSEHOLD_UNINSURED_LOSS: fixedMoney(),
    INSURER_SOLVENCY: fixedQuantity('ratio'),
    REINSURANCE: fixedMoney(),
    BANK_CREDIT: fixedMoney(),
    NONBANK_CREDIT_CAPACITY: fixedMoney(),
    ECONOMY_WIDE_CREDIT: fixedMoney(),
    REGIONAL_MIGRATION: fixedQuantity('person'),
    NATIONAL_GDP: fixedMoney(),
    TOURISM_ARRIVALS: fixedQuantity('person'),
    TOURISM_FX_REVENUE: Object.freeze({
      unit: moneyUnit('ICU'),
      sign: 'NON_NEGATIVE' as const,
    }),
    MIGRANT_INCOME_ABROAD: Object.freeze({
      unit: moneyUnit('ICU'),
      sign: 'NON_NEGATIVE' as const,
    }),
    REMITTANCE_HOME: Object.freeze({
      unit: moneyUnit('ICU'),
      sign: 'NON_NEGATIVE' as const,
    }),
    HOUSEHOLD_FX_INCOME: Object.freeze({
      unit: moneyUnit('ICU'),
      sign: 'NON_NEGATIVE' as const,
    }),
    CURRENCY_APPRECIATION_PRESSURE: fixedQuantity('percentage_point'),
    CYBERATTACK_NETWORK_FAILURE: fixedQuantity('network_outage_hour'),
    ELECTRONIC_PAYMENTS: fixedQuantity('transaction_per_hour'),
    BANKING_TRANSACTION_DELAY: fixedQuantity('hour'),
    RETAIL_SALES: fixedMoney(),
    PRODUCTION_TRADE: fixedQuantity('tonne_per_day'),
    REMOTE_SERVICES_DIGITAL_TRADE: fixedQuantity('service_transaction_per_day'),
  });

function chainNumber(chainId: string): bigint {
  const parsed = /^C([1-9][0-9]*)$/u.exec(chainId);
  if (parsed?.[1] === undefined) kernelInvalid('causal chain ID is invalid');
  return BigInt(parsed[1]);
}

export function quantifiedSystemForChain(
  chainId: string,
): QuantifiedSystemId | null {
  const number = chainNumber(chainId);
  for (const [system, [first, last]] of Object.entries(SYSTEM_CHAIN_RANGES)) {
    if (number >= first && number <= last) return system as QuantifiedSystemId;
  }
  return null;
}

function buildFixedRegistry(): ReadonlyMap<
  string,
  FixedQuantifiedNodeContract
> {
  const systemsByNode = new Map<string, Set<QuantifiedSystemId>>();
  for (const chain of CAUSAL_CHAINS) {
    const system = quantifiedSystemForChain(chain.id);
    if (system === null) continue;
    for (const edge of chain.edges) {
      for (const node of [edge.source, edge.target]) {
        const systems =
          systemsByNode.get(node) ?? new Set<QuantifiedSystemId>();
        systems.add(system);
        systemsByNode.set(node, systems);
      }
    }
  }
  const registry = new Map<string, FixedQuantifiedNodeContract>();
  for (const [node, systems] of systemsByNode) {
    const definition = FIXED_NODE_DEFINITIONS[node] ?? DEFAULT_NODE_DEFINITION;
    registry.set(
      node,
      Object.freeze({
        node,
        systems: Object.freeze([...systems].sort()),
        unit: definition.unit,
        sign: definition.sign,
      }),
    );
  }
  return registry;
}

const FIXED_QUANTIFIED_NODE_REGISTRY = buildFixedRegistry();

/** Returns an immutable contract only when the node belongs to the system. */
export function getFixedQuantifiedNodeContract(
  system: QuantifiedSystemId,
  node: string,
): FixedQuantifiedNodeContract | undefined {
  const contract = FIXED_QUANTIFIED_NODE_REGISTRY.get(node);
  return contract?.systems.includes(system) ? contract : undefined;
}

/** Verifies that every C101–C150 topology node has exactly one fixed contract. */
export function assertFixedQuantifiedNodeRegistry(): void {
  for (const chain of CAUSAL_CHAINS) {
    const system = quantifiedSystemForChain(chain.id);
    if (system === null) continue;
    for (const edge of chain.edges) {
      for (const node of [edge.source, edge.target]) {
        if (getFixedQuantifiedNodeContract(system, node) === undefined) {
          kernelInvalid(`Missing fixed quantified node contract for ${node}`);
        }
      }
    }
  }
}

assertFixedQuantifiedNodeRegistry();
