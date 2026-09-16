import { kernelInvalid } from './common.js';

/**
 * This is a catalogue of requested causal pathways, not a policy or a state
 * model. Numeric responses, timing and application remain caller-owned,
 * versioned inputs until their responsible economic owners approve them.
 */
export type CausalChainId = `C${number}`;

/**
 * JSON-safe, exact ordinal values. Causal timing must never pass through a
 * JavaScript floating-point number: each source/due period stays a canonical
 * integer string throughout the auditable signal record.
 */
export type CausalPeriod = string;
export type CausalEdgeIndex = string;

const CANONICAL_NON_NEGATIVE_INTEGER = /^(?:0|[1-9]\d*)$/u;
const CANONICAL_POSITIVE_INTEGER = /^[1-9]\d*$/u;

export type CausalDirection = 'INCREASES' | 'DECREASES';

export type CausalReadiness =
  'PARAMETERIZED_KERNEL_READY' | 'FUTURE_INTERFACE_ONLY';

export type CausalOwnerScope =
  | 'E02_TO_E07_HUMAN_SYSTEMS'
  | 'E08_TO_E14_REAL_ECONOMY'
  | 'E13_TO_E14_DISTRIBUTION'
  | 'V19_TO_V21_FUTURE_MACRO_EXTERNAL'
  | 'V24_FUTURE_GOVERNANCE_CRISIS';

export interface CausalEdge {
  readonly source: string;
  readonly target: string;
  readonly direction: CausalDirection;
}

export interface CausalChainDefinition {
  readonly id: CausalChainId;
  readonly title: string;
  readonly ownerScope: CausalOwnerScope;
  readonly readiness: CausalReadiness;
  readonly edges: readonly CausalEdge[];
}

function edge(
  source: string,
  target: string,
  direction: CausalDirection,
): CausalEdge {
  return Object.freeze({ source, target, direction });
}

function chain(
  id: CausalChainId,
  title: string,
  ownerScope: CausalOwnerScope,
  readiness: CausalReadiness,
  edges: readonly CausalEdge[],
): CausalChainDefinition {
  return Object.freeze({
    id,
    title,
    ownerScope,
    readiness,
    edges: Object.freeze([...edges]),
  });
}

const HUMAN: CausalOwnerScope = 'E02_TO_E07_HUMAN_SYSTEMS';
const REAL_ECONOMY: CausalOwnerScope = 'E08_TO_E14_REAL_ECONOMY';
const DISTRIBUTION: CausalOwnerScope = 'E13_TO_E14_DISTRIBUTION';
const FUTURE_MACRO: CausalOwnerScope = 'V19_TO_V21_FUTURE_MACRO_EXTERNAL';
const GOVERNANCE: CausalOwnerScope = 'V24_FUTURE_GOVERNANCE_CRISIS';
const READY: CausalReadiness = 'PARAMETERIZED_KERNEL_READY';
const FUTURE: CausalReadiness = 'FUTURE_INTERFACE_ONLY';

/**
 * User-requested cross-engine pathways 1–100. The entries intentionally carry
 * signal topology only: neither a default elasticity nor a country parameter
 * can enter through this catalogue.
 */
export const CAUSAL_CHAINS: readonly CausalChainDefinition[] = Object.freeze([
  chain(
    'C1',
    'Education, skills, R&D and automation displacement',
    HUMAN,
    READY,
    [
      edge('EDUCATION_INVESTMENT', 'HIGHER_VOCATIONAL_GRADUATES', 'INCREASES'),
      edge(
        'HIGHER_VOCATIONAL_GRADUATES',
        'HIGH_MEDIUM_SKILL_STOCK',
        'INCREASES',
      ),
      edge('HIGH_MEDIUM_SKILL_STOCK', 'R_AND_D_HUMAN_CAPITAL', 'INCREASES'),
      edge('R_AND_D_HUMAN_CAPITAL', 'TECHNOLOGY_MASTERY', 'INCREASES'),
      edge('TECHNOLOGY_MASTERY', 'AUTOMATED_LOGISTICS_SMART_PORT', 'INCREASES'),
      edge('AUTOMATED_LOGISTICS_SMART_PORT', 'LOGISTICS_CAPACITY', 'INCREASES'),
      edge(
        'AUTOMATED_LOGISTICS_SMART_PORT',
        'LOW_MEDIUM_SKILL_DEMAND',
        'DECREASES',
      ),
    ],
  ),
  chain(
    'C2',
    'Higher education participation and current labour withdrawal',
    HUMAN,
    READY,
    [
      edge(
        'HIGHER_EDUCATION_ENROLLMENT',
        'STUDENT_LABOUR_FORCE_PARTICIPATION',
        'DECREASES',
      ),
      edge(
        'STUDENT_LABOUR_FORCE_PARTICIPATION',
        'EFFECTIVE_LABOUR_SUPPLY',
        'INCREASES',
      ),
      edge('EFFECTIVE_LABOUR_SUPPLY', 'VACANCIES', 'DECREASES'),
      edge('VACANCIES', 'WAGE_PRESSURE', 'INCREASES'),
      edge('WAGE_PRESSURE', 'PRODUCTION_PROJECT_PROGRESS', 'DECREASES'),
    ],
  ),
  chain('C3', 'Teacher competition across education levels', HUMAN, READY, [
    edge(
      'HIGHER_EDUCATION_EXPANSION',
      'HIGHER_EDUCATION_TEACHER_DEMAND',
      'INCREASES',
    ),
    edge(
      'HIGHER_EDUCATION_TEACHER_DEMAND',
      'BASIC_VOCATIONAL_TEACHERS_AVAILABLE',
      'DECREASES',
    ),
    edge(
      'BASIC_VOCATIONAL_TEACHERS_AVAILABLE',
      'BASIC_VOCATIONAL_TEACHER_CAPACITY',
      'INCREASES',
    ),
    edge(
      'BASIC_VOCATIONAL_TEACHER_CAPACITY',
      'BASIC_VOCATIONAL_ENROLLMENT',
      'INCREASES',
    ),
    edge('BASIC_VOCATIONAL_ENROLLMENT', 'FUTURE_SKILL_SUPPLY', 'INCREASES'),
  ]),
  chain(
    'C4',
    'Vocational education to infrastructure throughput',
    HUMAN,
    READY,
    [
      edge('VOCATIONAL_EDUCATION', 'MEDIUM_SKILL_STOCK', 'INCREASES'),
      edge('MEDIUM_SKILL_STOCK', 'CONSTRUCTION_WORKERS', 'INCREASES'),
      edge('CONSTRUCTION_WORKERS', 'INFRASTRUCTURE_COMPLETION', 'INCREASES'),
      edge('INFRASTRUCTURE_COMPLETION', 'RAIL_PORT_GRID_CAPACITY', 'INCREASES'),
      edge(
        'RAIL_PORT_GRID_CAPACITY',
        'PRODUCTION_TRADE_THROUGHPUT',
        'INCREASES',
      ),
    ],
  ),
  chain(
    'C5',
    'Reskilling opportunity cost and later productivity',
    HUMAN,
    READY,
    [
      edge('RESKILLING_PARTICIPATION', 'CURRENT_LABOUR_SUPPLY', 'DECREASES'),
      edge('CURRENT_LABOUR_SUPPLY', 'VACANCIES', 'DECREASES'),
      edge('RESKILLING_COMPLETION', 'SKILL_MATCH', 'INCREASES'),
      edge('SKILL_MATCH', 'VACANCIES', 'DECREASES'),
      edge('SKILL_MATCH', 'PRODUCTIVITY_OUTPUT', 'INCREASES'),
    ],
  ),
  chain('C6', 'Delivered healthcare and workforce availability', HUMAN, READY, [
    edge('HEALTHCARE_DELIVERED', 'SICK_UNAVAILABLE_WORKERS', 'DECREASES'),
    edge('SICK_UNAVAILABLE_WORKERS', 'EFFECTIVE_LABOUR_SUPPLY', 'DECREASES'),
    edge('EFFECTIVE_LABOUR_SUPPLY', 'PRODUCTION', 'INCREASES'),
    edge('EFFECTIVE_LABOUR_SUPPLY', 'WAGE_PRESSURE', 'DECREASES'),
    edge('PRODUCTION', 'TAX_BASE', 'INCREASES'),
  ]),
  chain('C7', 'Healthcare backlog to domestic cost pressure', HUMAN, READY, [
    edge('HEALTHCARE_BACKLOG', 'ABSENTEEISM', 'INCREASES'),
    edge('ABSENTEEISM', 'LABOUR_AVAILABILITY', 'DECREASES'),
    edge('LABOUR_AVAILABILITY', 'SKILL_SHORTAGE', 'DECREASES'),
    edge('SKILL_SHORTAGE', 'WAGES', 'INCREASES'),
    edge('WAGES', 'UNIT_COST', 'INCREASES'),
    edge('UNIT_COST', 'DOMESTIC_PRICES', 'INCREASES'),
  ]),
  chain('C8', 'Housing affordability and labour matching', HUMAN, READY, [
    edge('HOUSING_SUPPLY', 'RENT', 'DECREASES'),
    edge('RENT', 'COST_OF_LIVING', 'INCREASES'),
    edge('COST_OF_LIVING', 'REAL_WAGE', 'DECREASES'),
    edge('REAL_WAGE', 'REGIONAL_ATTRACTIVENESS', 'INCREASES'),
    edge('REGIONAL_ATTRACTIVENESS', 'LABOUR_MOBILITY', 'INCREASES'),
    edge('LABOUR_MOBILITY', 'VACANCY_FILLING', 'INCREASES'),
  ]),
  chain('C9', 'Project and FDI housing feedback', HUMAN, READY, [
    edge('LARGE_PROJECT_OR_FDI', 'WORKER_INFLOW', 'INCREASES'),
    edge('WORKER_INFLOW', 'HOUSING_DEMAND', 'INCREASES'),
    edge('HOUSING_DEMAND', 'RENT', 'INCREASES'),
    edge('RENT', 'REAL_WAGE', 'DECREASES'),
    edge('REAL_WAGE', 'NOMINAL_WAGE_PRESSURE', 'DECREASES'),
    edge('NOMINAL_WAGE_PRESSURE', 'PROJECT_COST', 'INCREASES'),
    edge('PROJECT_COST', 'PROJECT_DELAY_RISK', 'INCREASES'),
  ]),
  chain(
    'C10',
    'Minimum wage distribution, demand and automation',
    HUMAN,
    READY,
    [
      edge('MINIMUM_WAGE', 'LOW_INCOME_DISPOSABLE_INCOME', 'INCREASES'),
      edge('LOW_INCOME_DISPOSABLE_INCOME', 'CONSUMPTION', 'INCREASES'),
      edge('MINIMUM_WAGE', 'LABOUR_COST', 'INCREASES'),
      edge('LABOUR_COST', 'LOW_SKILL_VACANCIES', 'DECREASES'),
      edge('LABOUR_COST', 'AUTOMATION_INCENTIVE', 'INCREASES'),
      edge('LOW_SKILL_VACANCIES', 'LOW_SKILL_UNEMPLOYMENT_RISK', 'DECREASES'),
    ],
  ),
  chain(
    'C11',
    'Unemployment insurance demand buffer and job search',
    HUMAN,
    READY,
    [
      edge('UNEMPLOYMENT_INSURANCE', 'HOUSEHOLD_DEMAND_STABILITY', 'INCREASES'),
      edge('HOUSEHOLD_DEMAND_STABILITY', 'RECESSION_SEVERITY', 'DECREASES'),
      edge('UNEMPLOYMENT_INSURANCE', 'FISCAL_COST', 'INCREASES'),
      edge('UNEMPLOYMENT_INSURANCE', 'JOB_ACCEPTANCE_THRESHOLD', 'INCREASES'),
      edge('JOB_ACCEPTANCE_THRESHOLD', 'UNEMPLOYMENT_DURATION', 'INCREASES'),
    ],
  ),
  chain(
    'C12',
    'High-skill emigration and human-capital capacity',
    HUMAN,
    READY,
    [
      edge(
        'HIGH_SKILL_EMIGRATION',
        'RESEARCHERS_DOCTORS_TEACHERS',
        'DECREASES',
      ),
      edge(
        'RESEARCHERS_DOCTORS_TEACHERS',
        'R_AND_D_HEALTH_EDUCATION_CAPACITY',
        'INCREASES',
      ),
      edge(
        'R_AND_D_HEALTH_EDUCATION_CAPACITY',
        'TECHNOLOGY_HUMAN_CAPITAL_GROWTH',
        'INCREASES',
      ),
    ],
  ),
  chain(
    'C13',
    'Automation skill substitution and wage distribution',
    REAL_ECONOMY,
    READY,
    [
      edge('AUTOMATION_ROBOTICS', 'LOW_MEDIUM_SKILL_REQUIREMENT', 'DECREASES'),
      edge(
        'AUTOMATION_ROBOTICS',
        'HIGH_SKILL_MAINTENANCE_REQUIREMENT',
        'INCREASES',
      ),
      edge('SKILL_REQUIREMENT_COMPOSITION', 'WAGE_DISTRIBUTION', 'INCREASES'),
      edge(
        'LOW_MEDIUM_SKILL_REQUIREMENT',
        'LOW_SKILL_UNEMPLOYMENT',
        'DECREASES',
      ),
      edge(
        'HIGH_SKILL_MAINTENANCE_REQUIREMENT',
        'HIGH_SKILL_SCARCITY',
        'INCREASES',
      ),
    ],
  ),
  chain(
    'C14',
    'Capital-good bottleneck in technology adoption',
    REAL_ECONOMY,
    READY,
    [
      edge(
        'ROBOTICS_SMART_MANUFACTURING',
        'MACHINERY_SEMICONDUCTOR_DEMAND',
        'INCREASES',
      ),
      edge(
        'MACHINERY_SEMICONDUCTOR_DEMAND',
        'CAPITAL_GOOD_BOTTLENECK',
        'INCREASES',
      ),
      edge(
        'CAPITAL_GOOD_BOTTLENECK',
        'EQUIPMENT_PRICE_PROJECT_COST',
        'INCREASES',
      ),
      edge(
        'EQUIPMENT_PRICE_PROJECT_COST',
        'TECHNOLOGY_ADOPTION_SPEED',
        'DECREASES',
      ),
    ],
  ),
  chain('C15', 'Smart port logistics and landed cost', REAL_ECONOMY, READY, [
    edge('AUTOMATED_LOGISTICS_SMART_PORT', 'PORT_THROUGHPUT', 'INCREASES'),
    edge('PORT_THROUGHPUT', 'SHIPMENT_DELAY', 'DECREASES'),
    edge('SHIPMENT_DELAY', 'TRANSPORT_COST', 'INCREASES'),
    edge('TRANSPORT_COST', 'LANDED_COST', 'INCREASES'),
    edge('LANDED_COST', 'IMPORT_EXPORT_VOLUME', 'DECREASES'),
    edge(
      'AUTOMATED_LOGISTICS_SMART_PORT',
      'DOCK_LOW_SKILL_LABOUR',
      'DECREASES',
    ),
  ]),
  chain(
    'C16',
    'Freight logistics construction and material crowding',
    REAL_ECONOMY,
    READY,
    [
      edge(
        'FREIGHT_RAIL_LOGISTICS_HUB_CONSTRUCTION',
        'LOGISTICS_AVAILABILITY',
        'INCREASES',
      ),
      edge('LOGISTICS_AVAILABILITY', 'FACILITY_OUTPUT_EXPORTS', 'INCREASES'),
      edge(
        'FREIGHT_RAIL_LOGISTICS_HUB_CONSTRUCTION',
        'STEEL_COPPER_MACHINERY_DEMAND',
        'INCREASES',
      ),
      edge(
        'STEEL_COPPER_MACHINERY_DEMAND',
        'OTHER_PROJECT_INPUT_AVAILABILITY',
        'DECREASES',
      ),
    ],
  ),
  chain('C17', 'Digital backbone energy constraint', REAL_ECONOMY, READY, [
    edge(
      'DIGITAL_BACKBONE',
      'TECHNOLOGY_ABSORPTION_COLLABORATION',
      'INCREASES',
    ),
    edge(
      'TECHNOLOGY_ABSORPTION_COLLABORATION',
      'SMART_MANUFACTURING',
      'INCREASES',
    ),
    edge('DIGITAL_BACKBONE', 'ELECTRICITY_DEMAND', 'INCREASES'),
    edge('ELECTRICITY_DEMAND', 'GRID_BOTTLENECK_RISK', 'INCREASES'),
  ]),
  chain(
    'C18',
    'Grid upgrade efficiency and construction inputs',
    REAL_ECONOMY,
    READY,
    [
      edge('GRID_UPGRADE_SMART_GRID', 'TRANSMISSION_LOSS', 'DECREASES'),
      edge('TRANSMISSION_LOSS', 'DELIVERED_ELECTRICITY', 'DECREASES'),
      edge('DELIVERED_ELECTRICITY', 'PRODUCTION_COST', 'DECREASES'),
      edge('GRID_UPGRADE_SMART_GRID', 'COPPER_MACHINERY_DEMAND', 'INCREASES'),
      edge(
        'COPPER_MACHINERY_DEMAND',
        'INPUT_CROWDING_PRICE_PRESSURE',
        'INCREASES',
      ),
    ],
  ),
  chain(
    'C19',
    'Energy storage reliability and mineral pressure',
    REAL_ECONOMY,
    READY,
    [
      edge('ENERGY_STORAGE', 'PEAK_RELIABILITY', 'INCREASES'),
      edge('PEAK_RELIABILITY', 'BLACKOUT_RISK', 'DECREASES'),
      edge('BLACKOUT_RISK', 'INDUSTRIAL_OUTPUT', 'DECREASES'),
      edge('ENERGY_STORAGE', 'BATTERY_DEMAND', 'INCREASES'),
      edge('BATTERY_DEMAND', 'LITHIUM_COPPER_PRICE', 'INCREASES'),
      edge('LITHIUM_COPPER_PRICE', 'IMPORT_FX_DEMAND', 'INCREASES'),
    ],
  ),
  chain(
    'C20',
    'Renewable transition short-run and long-run FX effects',
    REAL_ECONOMY,
    READY,
    [
      edge('RENEWABLE_CAPACITY', 'FOSSIL_FUEL_IMPORTS', 'DECREASES'),
      edge('FOSSIL_FUEL_IMPORTS', 'FX_DEMAND', 'INCREASES'),
      edge('RENEWABLE_CONSTRUCTION', 'MACHINERY_COPPER_IMPORTS', 'INCREASES'),
      edge('MACHINERY_COPPER_IMPORTS', 'SHORT_RUN_FX_DEMAND', 'INCREASES'),
    ],
  ),
  chain(
    'C21',
    'Nuclear route resources, skill and fiscal pressure',
    REAL_ECONOMY,
    READY,
    [
      edge('NUCLEAR_EXPANSION', 'STABLE_GENERATION', 'INCREASES'),
      edge('STABLE_GENERATION', 'FOSSIL_DEPENDENCY', 'DECREASES'),
      edge(
        'NUCLEAR_EXPANSION',
        'URANIUM_HIGH_SKILL_LONG_BUILD_REQUIREMENT',
        'INCREASES',
      ),
      edge(
        'URANIUM_HIGH_SKILL_LONG_BUILD_REQUIREMENT',
        'LABOUR_IMPORT_FISCAL_PRESSURE',
        'INCREASES',
      ),
    ],
  ),
  chain(
    'C22',
    'Technology obsolescence, downtime and upgrade demand',
    REAL_ECONOMY,
    READY,
    [
      edge(
        'TECHNOLOGY_OBSOLESCENCE',
        'FACILITY_EFFICIENCY_ELIGIBILITY',
        'DECREASES',
      ),
      edge('FACILITY_EFFICIENCY_ELIGIBILITY', 'UPGRADE_DEMAND', 'DECREASES'),
      edge('UPGRADE_DEMAND', 'CAPEX_AND_DOWNTIME', 'INCREASES'),
      edge('CAPEX_AND_DOWNTIME', 'CURRENT_OUTPUT', 'DECREASES'),
    ],
  ),
  chain(
    'C23',
    'Resource boom, appreciation and manufacturing competitiveness',
    REAL_ECONOMY,
    READY,
    [
      edge('RESOURCE_EXPORT_BOOM', 'FX_INFLOW', 'INCREASES'),
      edge('FX_INFLOW', 'CURRENCY_APPRECIATION', 'INCREASES'),
      edge(
        'CURRENCY_APPRECIATION',
        'NON_RESOURCE_EXPORT_COMPETITIVENESS',
        'DECREASES',
      ),
      edge(
        'NON_RESOURCE_EXPORT_COMPETITIVENESS',
        'MANUFACTURING_EMPLOYMENT',
        'INCREASES',
      ),
    ],
  ),
  chain(
    'C24',
    'Emission standards, capacity and import need',
    REAL_ECONOMY,
    READY,
    [
      edge('TIGHTER_EMISSION_STANDARD', 'UPGRADE_DOWNTIME', 'INCREASES'),
      edge('UPGRADE_DOWNTIME', 'CAPACITY', 'DECREASES'),
      edge('UPGRADE_DOWNTIME', 'UNIT_COST', 'INCREASES'),
      edge('CAPACITY', 'DOMESTIC_PRICE_IMPORT_NEED', 'DECREASES'),
      edge('TIGHTER_EMISSION_STANDARD', 'EMISSIONS', 'DECREASES'),
    ],
  ),
  chain(
    'C25',
    'Infrastructure spending construction and operation phases',
    FUTURE_MACRO,
    FUTURE,
    [
      edge(
        'INFRASTRUCTURE_SPENDING',
        'CONSTRUCTION_EMPLOYMENT_MATERIAL_IMPORTS',
        'INCREASES',
      ),
      edge(
        'CONSTRUCTION_EMPLOYMENT_MATERIAL_IMPORTS',
        'SHORT_RUN_GDP_WAGE_INFLATION_FX_PRESSURE',
        'INCREASES',
      ),
      edge(
        'INFRASTRUCTURE_COMPLETION',
        'LOGISTICS_ENERGY_CAPACITY',
        'INCREASES',
      ),
      edge('LOGISTICS_ENERGY_CAPACITY', 'LONG_RUN_UNIT_COST', 'DECREASES'),
    ],
  ),
  chain(
    'C26',
    'Public hiring and private-sector crowding',
    FUTURE_MACRO,
    FUTURE,
    [
      edge(
        'EDUCATION_HEALTH_POLICE_HIRING',
        'PUBLIC_SERVICE_CAPACITY',
        'INCREASES',
      ),
      edge(
        'EDUCATION_HEALTH_POLICE_HIRING',
        'PRIVATE_SECTOR_WORKERS_AVAILABLE',
        'DECREASES',
      ),
      edge(
        'PRIVATE_SECTOR_WORKERS_AVAILABLE',
        'PRIVATE_WAGE_PRESSURE',
        'DECREASES',
      ),
      edge('PRIVATE_WAGE_PRESSURE', 'PRIVATE_OUTPUT_CONSTRAINT', 'INCREASES'),
    ],
  ),
  chain('C27', 'VAT behavioural tax-base feedback', FUTURE_MACRO, FUTURE, [
    edge('VAT_RATE', 'CONSUMER_PRICE', 'INCREASES'),
    edge('CONSUMER_PRICE', 'REAL_DISPOSABLE_INCOME', 'DECREASES'),
    edge('REAL_DISPOSABLE_INCOME', 'CONSUMPTION', 'INCREASES'),
    edge('CONSUMPTION', 'VAT_BASE', 'INCREASES'),
  ]),
  chain(
    'C28',
    'Payroll tax incidence and employment feedback',
    FUTURE_MACRO,
    FUTURE,
    [
      edge('PAYROLL_TAX', 'EMPLOYER_LABOUR_COST', 'INCREASES'),
      edge('EMPLOYER_LABOUR_COST', 'VACANCY_CREATION', 'DECREASES'),
      edge('VACANCY_CREATION', 'EMPLOYMENT', 'INCREASES'),
      edge('EMPLOYMENT', 'PAYROLL_TAX_BASE', 'INCREASES'),
    ],
  ),
  chain(
    'C29',
    'Corporate tax, investment and future tax base',
    FUTURE_MACRO,
    FUTURE,
    [
      edge('CIT_RATE', 'AFTER_TAX_PROFIT', 'DECREASES'),
      edge('AFTER_TAX_PROFIT', 'RETAINED_EARNINGS_INVESTMENT', 'INCREASES'),
      edge('RETAINED_EARNINGS_INVESTMENT', 'CAPACITY_GROWTH', 'INCREASES'),
      edge('CAPACITY_GROWTH', 'FUTURE_CIT_BASE', 'INCREASES'),
      edge('CIT_RATE', 'FDI_ATTRACTIVENESS', 'DECREASES'),
    ],
  ),
  chain(
    'C30',
    'Carbon tax, substitution and fiscal recycling',
    FUTURE_MACRO,
    FUTURE,
    [
      edge('CARBON_TAX', 'FOSSIL_INDUSTRIAL_COST', 'INCREASES'),
      edge('FOSSIL_INDUSTRIAL_COST', 'CLEAN_TECH_SUBSTITUTION', 'INCREASES'),
      edge('FOSSIL_INDUSTRIAL_COST', 'PRICE_AND_OUTPUT_MIX', 'INCREASES'),
      edge('CARBON_TAX', 'TAX_REVENUE', 'INCREASES'),
      edge(
        'TAX_REVENUE',
        'COMPENSATION_GREEN_INVESTMENT_CAPACITY',
        'INCREASES',
      ),
    ],
  ),
  chain(
    'C31',
    'Investment and R&D tax credit transmission',
    FUTURE_MACRO,
    FUTURE,
    [
      edge(
        'INVESTMENT_R_AND_D_TAX_CREDIT',
        'TREASURY_REVENUE_FOREGONE',
        'INCREASES',
      ),
      edge('INVESTMENT_R_AND_D_TAX_CREDIT', 'INVESTMENT_R_AND_D', 'INCREASES'),
      edge(
        'INVESTMENT_R_AND_D',
        'MACHINERY_HIGH_SKILL_IMPORT_DEMAND',
        'INCREASES',
      ),
      edge(
        'MACHINERY_HIGH_SKILL_IMPORT_DEMAND',
        'FUTURE_CAPACITY_TECHNOLOGY',
        'INCREASES',
      ),
    ],
  ),
  chain(
    'C32',
    'Domestic debt and private-credit crowding out',
    FUTURE_MACRO,
    FUTURE,
    [
      edge(
        'DOMESTIC_DEBT_ISSUANCE',
        'BANK_GOVERNMENT_SECURITIES_HOLDINGS',
        'INCREASES',
      ),
      edge(
        'BANK_GOVERNMENT_SECURITIES_HOLDINGS',
        'CORPORATE_CREDIT_CAPACITY',
        'DECREASES',
      ),
      edge('CORPORATE_CREDIT_CAPACITY', 'PRIVATE_INVESTMENT', 'INCREASES'),
    ],
  ),
  chain('C33', 'Sovereign-bank stress feedback loop', FUTURE_MACRO, FUTURE, [
    edge(
      'SOVEREIGN_YIELD_DEBT_STRESS',
      'GOVERNMENT_BOND_VALUATION_LOSS',
      'INCREASES',
    ),
    edge(
      'GOVERNMENT_BOND_VALUATION_LOSS',
      'BANK_EQUITY_CAPITAL_HEADROOM',
      'DECREASES',
    ),
    edge('BANK_EQUITY_CAPITAL_HEADROOM', 'CREDIT_SUPPLY', 'INCREASES'),
    edge('CREDIT_SUPPLY', 'GDP', 'INCREASES'),
    edge('GDP', 'TAX_REVENUE', 'INCREASES'),
    edge('TAX_REVENUE', 'SOVEREIGN_YIELD_DEBT_STRESS', 'DECREASES'),
  ]),
  chain(
    'C34',
    'Fiscal arrears, NPLs and production pressure',
    FUTURE_MACRO,
    FUTURE,
    [
      edge('FISCAL_ARREARS', 'SUPPLIER_HOUSEHOLD_CASH_FLOW', 'DECREASES'),
      edge('SUPPLIER_HOUSEHOLD_CASH_FLOW', 'LOAN_DEFAULT_NPL', 'DECREASES'),
      edge('LOAN_DEFAULT_NPL', 'BANK_CREDIT', 'DECREASES'),
      edge('BANK_CREDIT', 'PROJECTS_PRODUCTION', 'INCREASES'),
    ],
  ),
  chain('C35', 'Policy-rate tightening transmission', FUTURE_MACRO, FUTURE, [
    edge('POLICY_RATE', 'LENDING_RATE', 'INCREASES'),
    edge('LENDING_RATE', 'CONSUMPTION_INVESTMENT_WORKING_CAPITAL', 'DECREASES'),
    edge(
      'CONSUMPTION_INVESTMENT_WORKING_CAPITAL',
      'OUTPUT_EMPLOYMENT',
      'INCREASES',
    ),
    edge('POLICY_RATE', 'INTEREST_DIFFERENTIAL', 'INCREASES'),
    edge('INTEREST_DIFFERENTIAL', 'FX_APPRECIATION', 'INCREASES'),
    edge('FX_APPRECIATION', 'IMPORT_INFLATION', 'DECREASES'),
  ]),
  chain('C36', 'Policy easing, FX and housing feedback', FUTURE_MACRO, FUTURE, [
    edge('POLICY_EASING_CREDIT_EASING', 'CREDIT', 'INCREASES'),
    edge('CREDIT', 'DOMESTIC_DEMAND', 'INCREASES'),
    edge('DOMESTIC_DEMAND', 'IMPORTS', 'INCREASES'),
    edge('IMPORTS', 'FX_DEPRECIATION_PRESSURE_CPI', 'INCREASES'),
    edge('CREDIT', 'MORTGAGE_DEMAND', 'INCREASES'),
    edge('MORTGAGE_DEMAND', 'HOUSING_PRESSURE', 'INCREASES'),
  ]),
  chain(
    'C37',
    'Capital regulation and sector credit rationing',
    FUTURE_MACRO,
    FUTURE,
    [
      edge('RESERVE_OR_CAPITAL_REQUIREMENT', 'LOAN_CAPACITY', 'DECREASES'),
      edge('LOAN_CAPACITY', 'SECTOR_CREDIT_RATIONING', 'DECREASES'),
      edge('SECTOR_CREDIT_RATIONING', 'PROJECT_WORKING_CAPITAL', 'INCREASES'),
      edge('PROJECT_WORKING_CAPITAL', 'SECTOR_OUTPUT', 'INCREASES'),
    ],
  ),
  chain(
    'C38',
    'Depreciation and trade-volume adjustment',
    FUTURE_MACRO,
    FUTURE,
    [
      edge(
        'CURRENCY_DEPRECIATION',
        'EXPORT_PRICE_COMPETITIVENESS',
        'INCREASES',
      ),
      edge('EXPORT_PRICE_COMPETITIVENESS', 'EXPORT_VOLUME', 'INCREASES'),
      edge('CURRENCY_DEPRECIATION', 'IMPORT_SUBSTITUTION', 'INCREASES'),
      edge('IMPORT_SUBSTITUTION', 'IMPORT_VOLUME', 'DECREASES'),
      edge('EXPORT_VOLUME', 'TRADE_BALANCE', 'INCREASES'),
      edge('IMPORT_VOLUME', 'TRADE_BALANCE', 'DECREASES'),
    ],
  ),
  chain(
    'C39',
    'Depreciation, foreign debt and bank capital',
    FUTURE_MACRO,
    FUTURE,
    [
      edge('DEPRECIATION', 'FOREIGN_CURRENCY_DEBT_LOCAL_VALUE', 'INCREASES'),
      edge(
        'FOREIGN_CURRENCY_DEBT_LOCAL_VALUE',
        'DEBT_SERVICE_DEFAULT_NPL',
        'INCREASES',
      ),
      edge('DEBT_SERVICE_DEFAULT_NPL', 'BANK_CAPITAL', 'DECREASES'),
      edge('BANK_CAPITAL', 'CREDIT', 'INCREASES'),
    ],
  ),
  chain(
    'C40',
    'Sterilised and unsterilised FX intervention',
    FUTURE_MACRO,
    FUTURE,
    [
      edge(
        'UNSTERILISED_FX_INTERVENTION',
        'BANK_RESERVES_MONETARY_BASE',
        'INCREASES',
      ),
      edge('BANK_RESERVES_MONETARY_BASE', 'CREDIT_CONDITIONS', 'INCREASES'),
      edge('CREDIT_CONDITIONS', 'DEMAND_INFLATION', 'INCREASES'),
      edge(
        'STERILISED_FX_INTERVENTION',
        'BANK_RESERVES_MONETARY_BASE',
        'DECREASES',
      ),
    ],
  ),
  chain(
    'C41',
    'Foreign borrowing intertemporal FX obligation',
    FUTURE_MACRO,
    FUTURE,
    [
      edge('FOREIGN_BORROWING', 'IMMEDIATE_FX_INFLOW', 'INCREASES'),
      edge(
        'IMMEDIATE_FX_INFLOW',
        'CURRENCY_RESERVES_SPENDING_CAPACITY',
        'INCREASES',
      ),
      edge('FOREIGN_BORROWING', 'FUTURE_DEBT_SERVICE', 'INCREASES'),
      edge(
        'FUTURE_DEBT_SERVICE',
        'FUTURE_FX_DEMAND_ROLLOVER_RISK',
        'INCREASES',
      ),
    ],
  ),
  chain(
    'C42',
    'FDI construction, capacity and repatriation',
    FUTURE_MACRO,
    FUTURE,
    [
      edge('FDI_INFLOW', 'CONSTRUCTION_IMPORTS_LABOUR_DEMAND', 'INCREASES'),
      edge(
        'CONSTRUCTION_IMPORTS_LABOUR_DEMAND',
        'CAPACITY_EMPLOYMENT',
        'INCREASES',
      ),
      edge('CAPACITY_EMPLOYMENT', 'PROFIT', 'INCREASES'),
      edge('PROFIT', 'PROFIT_REPATRIATION', 'INCREASES'),
      edge('PROFIT_REPATRIATION', 'FUTURE_FX_OUTFLOW', 'INCREASES'),
    ],
  ),
  chain(
    'C43',
    'FDI conditionality, local spillovers and attractiveness',
    FUTURE_MACRO,
    FUTURE,
    [
      edge(
        'FDI_LOCAL_CONTENT_EMPLOYMENT_TECH_REQUIREMENT',
        'LOCAL_SKILL_INDUSTRY_DEMAND',
        'INCREASES',
      ),
      edge('LOCAL_SKILL_INDUSTRY_DEMAND', 'TECHNOLOGY_ABSORPTION', 'INCREASES'),
      edge('FDI_CONDITIONALITY_STRINGENCY', 'FDI_ATTRACTIVENESS', 'DECREASES'),
    ],
  ),
  chain(
    'C44',
    'Technology licence, royalties and expiry risk',
    FUTURE_MACRO,
    FUTURE,
    [
      edge('TECHNOLOGY_LICENCE', 'PRODUCTIVITY_ELIGIBILITY', 'INCREASES'),
      edge('PRODUCTIVITY_ELIGIBILITY', 'OUTPUT', 'INCREASES'),
      edge('TECHNOLOGY_LICENCE', 'ROYALTY_PAYMENT', 'INCREASES'),
      edge('ROYALTY_PAYMENT', 'FX_OUTFLOW', 'INCREASES'),
      edge('LICENCE_EXPIRY', 'FACILITY_PRODUCTION_RISK', 'INCREASES'),
    ],
  ),
  chain(
    'C45',
    'Final-good tariff, substitution and CPI',
    FUTURE_MACRO,
    FUTURE,
    [
      edge('FINAL_GOOD_TARIFF', 'LANDED_CONSUMER_PRICE', 'INCREASES'),
      edge('LANDED_CONSUMER_PRICE', 'IMPORT_DEMAND', 'DECREASES'),
      edge('IMPORT_DEMAND', 'DOMESTIC_PRODUCER_DEMAND', 'DECREASES'),
      edge('FINAL_GOOD_TARIFF', 'CPI_TARIFF_REVENUE', 'INCREASES'),
    ],
  ),
  chain(
    'C46',
    'Intermediate tariff and export competitiveness',
    FUTURE_MACRO,
    FUTURE,
    [
      edge(
        'INTERMEDIATE_CAPITAL_GOOD_TARIFF',
        'MACHINERY_INPUT_COST',
        'INCREASES',
      ),
      edge('MACHINERY_INPUT_COST', 'DOMESTIC_PRODUCTION_COST', 'INCREASES'),
      edge('DOMESTIC_PRODUCTION_COST', 'EXPORT_COMPETITIVENESS', 'DECREASES'),
    ],
  ),
  chain(
    'C47',
    'Import restriction shortage and domestic investment',
    FUTURE_MACRO,
    FUTURE,
    [
      edge('IMPORT_QUOTA_BAN_TIGHTENING', 'IMPORTED_SUPPLY', 'DECREASES'),
      edge('IMPORTED_SUPPLY', 'SHORTAGE', 'DECREASES'),
      edge('SHORTAGE', 'DOMESTIC_PRICE', 'INCREASES'),
      edge(
        'DOMESTIC_PRICE',
        'LOCAL_PRODUCTION_INVESTMENT_INCENTIVE',
        'INCREASES',
      ),
    ],
  ),
  chain(
    'C48',
    'Export restriction domestic supply and FX tradeoff',
    FUTURE_MACRO,
    FUTURE,
    [
      edge('EXPORT_CAP_BAN_TIGHTENING', 'DOMESTIC_INVENTORY', 'INCREASES'),
      edge('DOMESTIC_INVENTORY', 'DOMESTIC_PRICE', 'DECREASES'),
      edge('DOMESTIC_PRICE', 'DOWNSTREAM_PRODUCER_BENEFIT', 'DECREASES'),
      edge('EXPORT_CAP_BAN_TIGHTENING', 'EXPORT_REVENUE_FX', 'DECREASES'),
      edge('EXPORT_REVENUE_FX', 'CURRENCY_PRESSURE', 'DECREASES'),
    ],
  ),
  chain('C49', 'FTA sectoral reallocation', FUTURE_MACRO, FUTURE, [
    edge('FTA_TARIFF_CUT', 'IMPORT_COMPETITION', 'INCREASES'),
    edge(
      'IMPORT_COMPETITION',
      'IMPORT_COMPETING_SECTOR_EMPLOYMENT',
      'DECREASES',
    ),
    edge('FTA_TARIFF_CUT', 'EXPORTS', 'INCREASES'),
    edge('EXPORTS', 'EXPORT_SECTOR_EMPLOYMENT_INVESTMENT', 'INCREASES'),
    edge('FTA_TARIFF_CUT', 'TARIFF_REVENUE', 'DECREASES'),
  ]),
  chain(
    'C50',
    'Route disruption, shortage and rerouting',
    FUTURE_MACRO,
    FUTURE,
    [
      edge(
        'SANCTION_ROUTE_CLOSURE_CUSTOMS_CONGESTION',
        'SHIPMENT_DELAY',
        'INCREASES',
      ),
      edge('SHIPMENT_DELAY', 'INVENTORY_SHORTAGE', 'INCREASES'),
      edge('INVENTORY_SHORTAGE', 'PRODUCTION_PROJECT_DELAY', 'INCREASES'),
      edge('INVENTORY_SHORTAGE', 'PRICE', 'INCREASES'),
      edge('SHIPMENT_DELAY', 'ALTERNATIVE_SUPPLIER_SEARCH', 'INCREASES'),
      edge('ALTERNATIVE_SUPPLIER_SEARCH', 'LANDED_COST_FX_DEMAND', 'INCREASES'),
    ],
  ),
  chain(
    'C51',
    'Essential inflation, living cost and political support',
    GOVERNANCE,
    FUTURE,
    [
      edge('FOOD_ENERGY_INFLATION', 'ESSENTIAL_LIVING_COST', 'INCREASES'),
      edge('ESSENTIAL_LIVING_COST', 'LOW_MIDDLE_REAL_MARGIN', 'DECREASES'),
      edge('LOW_MIDDLE_REAL_MARGIN', 'COST_OF_LIVING_STRESS', 'DECREASES'),
      edge('COST_OF_LIVING_STRESS', 'PUBLIC_SUPPORT', 'DECREASES'),
      edge('PUBLIC_SUPPORT', 'POLITICAL_CAPITAL', 'INCREASES'),
    ],
  ),
  chain(
    'C52',
    'Nominal wage lag against CPI and perceived welfare',
    GOVERNANCE,
    FUTURE,
    [
      edge('CPI_EXCEEDING_NOMINAL_WAGE', 'REAL_WAGE', 'DECREASES'),
      edge('REAL_WAGE', 'PERCEIVED_LIVING_STANDARD', 'INCREASES'),
      edge('PERCEIVED_LIVING_STANDARD', 'CONSUMPTION_CONFIDENCE', 'INCREASES'),
      edge('CONSUMPTION_CONFIDENCE', 'PUBLIC_SUPPORT', 'INCREASES'),
    ],
  ),
  chain(
    'C53',
    'Unemployment duration, household stress and protest risk',
    GOVERNANCE,
    FUTURE,
    [
      edge('UNEMPLOYMENT_DURATION', 'HOUSEHOLD_LIQUID_SAVINGS', 'DECREASES'),
      edge('UNEMPLOYMENT_DURATION', 'HOUSEHOLD_DEBT_ARREARS', 'INCREASES'),
      edge('HOUSEHOLD_LIQUID_SAVINGS', 'HOUSEHOLD_STRESS', 'DECREASES'),
      edge('HOUSEHOLD_DEBT_ARREARS', 'HOUSEHOLD_STRESS', 'INCREASES'),
      edge('HOUSEHOLD_STRESS', 'PROTEST_RISK', 'INCREASES'),
      edge('PROTEST_RISK', 'PUBLIC_SUPPORT', 'DECREASES'),
    ],
  ),
  chain(
    'C54',
    'Youth unemployment, emigration and future skills',
    GOVERNANCE,
    FUTURE,
    [
      edge(
        'YOUTH_NEW_GRADUATE_UNEMPLOYMENT',
        'PERCEIVED_EDUCATION_RETURN',
        'DECREASES',
      ),
      edge(
        'PERCEIVED_EDUCATION_RETURN',
        'EMIGRATION_APPLICATIONS',
        'DECREASES',
      ),
      edge(
        'YOUTH_NEW_GRADUATE_UNEMPLOYMENT',
        'PROTEST_SOCIAL_STRESS',
        'INCREASES',
      ),
      edge('EMIGRATION_APPLICATIONS', 'FUTURE_SKILL_SUPPLY', 'DECREASES'),
    ],
  ),
  chain(
    'C55',
    'Concentrated regional stress and local disruption',
    GOVERNANCE,
    FUTURE,
    [
      edge(
        'REGIONAL_UNEMPLOYMENT_HOUSING_STRESS',
        'LOCAL_PROTEST',
        'INCREASES',
      ),
      edge('LOCAL_PROTEST', 'POLICE_DEPLOYMENT', 'INCREASES'),
      edge(
        'POLICE_DEPLOYMENT',
        'REGIONAL_BUSINESS_TRANSPORT_DISRUPTION',
        'INCREASES',
      ),
    ],
  ),
  chain(
    'C56',
    'Missed commitments, credibility and growth feedback',
    GOVERNANCE,
    FUTURE,
    [
      edge('MISSED_GOVERNMENT_COMMITMENT', 'POLICY_CREDIBILITY', 'DECREASES'),
      edge('POLICY_CREDIBILITY', 'PUBLIC_EXPECTATIONS', 'INCREASES'),
      edge('PUBLIC_EXPECTATIONS', 'PRECAUTIONARY_SAVING', 'DECREASES'),
      edge('PUBLIC_EXPECTATIONS', 'FIRM_INVESTMENT_DELAY', 'DECREASES'),
      edge('PRECAUTIONARY_SAVING', 'GROWTH', 'DECREASES'),
      edge('FIRM_INVESTMENT_DELAY', 'GROWTH', 'DECREASES'),
      edge('GROWTH', 'PUBLIC_SUPPORT', 'INCREASES'),
    ],
  ),
  chain(
    'C57',
    'Policy reversals, waiting value and investment delay',
    GOVERNANCE,
    FUTURE,
    [
      edge('REPEATED_POLICY_REVERSALS', 'POLICY_CREDIBILITY', 'DECREASES'),
      edge('POLICY_CREDIBILITY', 'BUSINESS_WAITING_VALUE', 'DECREASES'),
      edge('BUSINESS_WAITING_VALUE', 'PROJECT_FDI_DELAY', 'INCREASES'),
      edge('PROJECT_FDI_DELAY', 'EMPLOYMENT_INVESTMENT', 'DECREASES'),
      edge('EMPLOYMENT_INVESTMENT', 'GOVERNMENT_PERFORMANCE', 'INCREASES'),
    ],
  ),
  chain(
    'C58',
    'Successful crisis response and reform capacity',
    GOVERNANCE,
    FUTURE,
    [
      edge('SUCCESSFUL_CRISIS_RESPONSE', 'PUBLIC_SUPPORT', 'INCREASES'),
      edge('PUBLIC_SUPPORT', 'POLITICAL_CAPITAL', 'INCREASES'),
      edge('POLITICAL_CAPITAL', 'DIFFICULT_REFORM_CAPACITY', 'INCREASES'),
      edge('DIFFICULT_REFORM_CAPACITY', 'REFORM_SUCCESS', 'INCREASES'),
      edge('REFORM_SUCCESS', 'POLICY_CREDIBILITY', 'INCREASES'),
    ],
  ),
  chain(
    'C59',
    'Prolonged emergency powers and political cost',
    GOVERNANCE,
    FUTURE,
    [
      edge('EMERGENCY_POWERS', 'ADMINISTRATIVE_RESPONSE', 'INCREASES'),
      edge('PROLONGED_EMERGENCY_POWERS', 'POLITICAL_COST', 'INCREASES'),
      edge('POLITICAL_COST', 'PUBLIC_SUPPORT', 'DECREASES'),
      edge('POLITICAL_COST', 'POLITICAL_CAPITAL', 'DECREASES'),
    ],
  ),
  chain(
    'C60',
    'Public-service backlog and reform pressure',
    GOVERNANCE,
    FUTURE,
    [
      edge(
        'PUBLIC_SERVICE_BACKLOG',
        'EXPERIENCED_SERVICE_QUALITY',
        'DECREASES',
      ),
      edge('EXPERIENCED_SERVICE_QUALITY', 'PUBLIC_SUPPORT', 'INCREASES'),
      edge('PUBLIC_SUPPORT', 'SOCIAL_REFORM_PRESSURE', 'DECREASES'),
    ],
  ),
  chain(
    'C61',
    'Economic uncertainty and precautionary saving feedback',
    DISTRIBUTION,
    READY,
    [
      edge('ECONOMIC_UNCERTAINTY', 'PRECAUTIONARY_SAVING', 'INCREASES'),
      edge('PRECAUTIONARY_SAVING', 'CONSUMPTION', 'DECREASES'),
      edge('CONSUMPTION', 'FIRM_REVENUE', 'INCREASES'),
      edge('FIRM_REVENUE', 'EMPLOYMENT_TAX_REVENUE', 'INCREASES'),
      edge('EMPLOYMENT_TAX_REVENUE', 'ECONOMIC_UNCERTAINTY', 'DECREASES'),
    ],
  ),
  chain(
    'C62',
    'Confidence recovery and pent-up demand pressure',
    DISTRIBUTION,
    READY,
    [
      edge('CONFIDENCE_RECOVERY', 'SAVING_RATE', 'DECREASES'),
      edge('SAVING_RATE', 'PENT_UP_CONSUMPTION', 'DECREASES'),
      edge('PENT_UP_CONSUMPTION', 'RETAIL_SERVICE_DEMAND', 'INCREASES'),
      edge('RETAIL_SERVICE_DEMAND', 'IMPORTS', 'INCREASES'),
      edge('IMPORTS', 'CPI_FX_PRESSURE', 'INCREASES'),
    ],
  ),
  chain(
    'C63',
    'Consumer credit, leverage and future consumption risk',
    FUTURE_MACRO,
    FUTURE,
    [
      edge('CONSUMER_CREDIT_EASING', 'HOUSEHOLD_BORROWING', 'INCREASES'),
      edge('HOUSEHOLD_BORROWING', 'CONSUMPTION', 'INCREASES'),
      edge('CONSUMPTION', 'VAT_GDP', 'INCREASES'),
      edge('HOUSEHOLD_BORROWING', 'HOUSEHOLD_LEVERAGE', 'INCREASES'),
      edge('INTEREST_RATE_RISE', 'DEBT_SERVICE', 'INCREASES'),
      edge('DEBT_SERVICE', 'CONSUMPTION_COLLAPSE_RISK', 'INCREASES'),
    ],
  ),
  chain(
    'C64',
    'Mortgage rate and retail demand feedback',
    FUTURE_MACRO,
    FUTURE,
    [
      edge('MORTGAGE_RATE', 'DEBT_SERVICE', 'INCREASES'),
      edge('DEBT_SERVICE', 'DISPOSABLE_RESOURCES', 'DECREASES'),
      edge('DISPOSABLE_RESOURCES', 'NON_ESSENTIAL_CONSUMPTION', 'INCREASES'),
      edge('NON_ESSENTIAL_CONSUMPTION', 'RETAIL_SERVICE_OUTPUT', 'INCREASES'),
      edge('RETAIL_SERVICE_OUTPUT', 'VAT_REVENUE', 'INCREASES'),
    ],
  ),
  chain(
    'C65',
    'Low-income transfers, consumption and poverty',
    DISTRIBUTION,
    READY,
    [
      edge('LOW_INCOME_TRANSFERS', 'LOW_INCOME_CONSUMPTION', 'INCREASES'),
      edge('LOW_INCOME_CONSUMPTION', 'DOMESTIC_DEMAND', 'INCREASES'),
      edge('DOMESTIC_DEMAND', 'POVERTY', 'DECREASES'),
      edge('LOW_INCOME_TRANSFERS', 'FISCAL_SPENDING', 'INCREASES'),
    ],
  ),
  chain(
    'C66',
    'High-income tax cut, deposits and weak consumption stimulus',
    DISTRIBUTION,
    READY,
    [
      edge('HIGH_INCOME_TAX_CUT', 'HIGH_INCOME_DISPOSABLE_INCOME', 'INCREASES'),
      edge('HIGH_INCOME_DISPOSABLE_INCOME', 'SAVING_DEPOSITS', 'INCREASES'),
      edge('HIGH_INCOME_SAVING_SHARE', 'CONSUMPTION_STIMULUS', 'DECREASES'),
    ],
  ),
  chain(
    'C67',
    'VAT distribution and essential-consumption composition',
    DISTRIBUTION,
    READY,
    [
      edge('VAT_RATE', 'ESSENTIAL_BASKET_PRICE', 'INCREASES'),
      edge('ESSENTIAL_BASKET_PRICE', 'LOW_INCOME_REAL_MARGIN', 'DECREASES'),
      edge('LOW_INCOME_REAL_MARGIN', 'POVERTY_GINI', 'DECREASES'),
      edge('POVERTY_GINI', 'ESSENTIAL_CONSUMPTION_SHARE', 'INCREASES'),
    ],
  ),
  chain(
    'C68',
    'Profit-led productivity growth and income distribution',
    DISTRIBUTION,
    READY,
    [
      edge('PRODUCTIVITY', 'PROFIT_CAPITAL_INCOME', 'INCREASES'),
      edge('PRODUCTIVITY', 'GDP', 'INCREASES'),
      edge('PROFIT_CAPITAL_INCOME', 'MEDIAN_REAL_INCOME_SHARE', 'DECREASES'),
      edge('MEDIAN_REAL_INCOME_SHARE', 'GINI', 'DECREASES'),
      edge('GINI', 'CONSUMPTION_GROWTH', 'DECREASES'),
    ],
  ),
  chain(
    'C69',
    'Wage-share consumption and investment trade-off',
    DISTRIBUTION,
    READY,
    [
      edge('LOW_MIDDLE_WAGE_SHARE', 'HOUSEHOLD_CONSUMPTION', 'INCREASES'),
      edge('LOW_MIDDLE_WAGE_SHARE', 'FIRM_MARGIN', 'DECREASES'),
      edge('FIRM_MARGIN', 'INVESTMENT_CAPACITY', 'INCREASES'),
    ],
  ),
  chain(
    'C70',
    'Essential-cost crowding out of discretionary services',
    DISTRIBUTION,
    READY,
    [
      edge('FOOD_ENERGY_HOUSING_COST', 'ESSENTIAL_SPENDING_SHARE', 'INCREASES'),
      edge(
        'ESSENTIAL_SPENDING_SHARE',
        'DISCRETIONARY_CONSUMPTION',
        'DECREASES',
      ),
      edge(
        'DISCRETIONARY_CONSUMPTION',
        'SERVICES_GENERAL_GOODS_DEMAND',
        'INCREASES',
      ),
      edge('SERVICES_GENERAL_GOODS_DEMAND', 'SECTOR_EMPLOYMENT', 'INCREASES'),
    ],
  ),
  chain('C71', 'Inflation expectations feedback loop', FUTURE_MACRO, FUTURE, [
    edge('EXPECTED_INFLATION', 'WAGE_DEMANDS_FIRM_PREPRICING', 'INCREASES'),
    edge('WAGE_DEMANDS_FIRM_PREPRICING', 'ACTUAL_INFLATION', 'INCREASES'),
    edge('ACTUAL_INFLATION', 'EXPECTED_INFLATION', 'INCREASES'),
  ]),
  chain(
    'C72',
    'Credible tightening and inflation moderation',
    FUTURE_MACRO,
    FUTURE,
    [
      edge('CREDIBLE_CB_TIGHTENING', 'INFLATION_EXPECTATIONS', 'DECREASES'),
      edge(
        'INFLATION_EXPECTATIONS',
        'WAGE_PRICE_SETTING_MODERATION',
        'DECREASES',
      ),
      edge(
        'WAGE_PRICE_SETTING_MODERATION',
        'REQUIRED_RATE_TIGHTENING',
        'DECREASES',
      ),
    ],
  ),
  chain(
    'C73',
    'Forward-guidance misses and market volatility',
    FUTURE_MACRO,
    FUTURE,
    [
      edge('FORWARD_GUIDANCE_MISSES', 'MONETARY_CREDIBILITY', 'DECREASES'),
      edge(
        'MONETARY_CREDIBILITY',
        'FUTURE_GUIDANCE_EFFECTIVENESS',
        'INCREASES',
      ),
      edge(
        'FUTURE_GUIDANCE_EFFECTIVENESS',
        'INTEREST_FX_VOLATILITY',
        'DECREASES',
      ),
    ],
  ),
  chain(
    'C74',
    'Expected depreciation and self-validating FX demand',
    FUTURE_MACRO,
    FUTURE,
    [
      edge('EXPECTED_CURRENCY_DEPRECIATION', 'PREBUY_FX_IMPORTS', 'INCREASES'),
      edge('PREBUY_FX_IMPORTS', 'FX_DEMAND', 'INCREASES'),
      edge('FX_DEMAND', 'CURRENCY_DEPRECIATION', 'INCREASES'),
      edge(
        'CURRENCY_DEPRECIATION',
        'EXPECTED_CURRENCY_DEPRECIATION',
        'INCREASES',
      ),
    ],
  ),
  chain(
    'C75',
    'Expected tariff increase and import front-loading',
    FUTURE_MACRO,
    FUTURE,
    [
      edge('EXPECTED_TARIFF_INCREASE', 'FRONT_LOADED_IMPORTS', 'INCREASES'),
      edge('FRONT_LOADED_IMPORTS', 'CURRENT_FX_DEMAND', 'INCREASES'),
      edge('FRONT_LOADED_IMPORTS', 'INVENTORY', 'INCREASES'),
      edge('TARIFF_EFFECTIVE', 'IMPORTS', 'DECREASES'),
    ],
  ),
  chain(
    'C76',
    'Shortage expectations and stockpiling feedback',
    FUTURE_MACRO,
    FUTURE,
    [
      edge(
        'EXPECTED_COMMODITY_SHORTAGE',
        'HOUSEHOLD_FIRM_STOCKPILING',
        'INCREASES',
      ),
      edge('HOUSEHOLD_FIRM_STOCKPILING', 'USABLE_INVENTORY', 'DECREASES'),
      edge('USABLE_INVENTORY', 'SPOT_PRICE', 'DECREASES'),
      edge('SPOT_PRICE', 'SHORTAGE_PERCEPTION', 'INCREASES'),
    ],
  ),
  chain(
    'C77',
    'Bank solvency warnings and liquidity feedback',
    FUTURE_MACRO,
    FUTURE,
    [
      edge('BANK_SOLVENCY_WARNINGS', 'DEPOSITOR_WITHDRAWALS', 'INCREASES'),
      edge('DEPOSITOR_WITHDRAWALS', 'BANK_LIQUIDITY', 'DECREASES'),
      edge('BANK_LIQUIDITY', 'LENDING', 'INCREASES'),
      edge('LENDING', 'ECONOMIC_OUTPUT', 'INCREASES'),
      edge('ECONOMIC_OUTPUT', 'NPL', 'DECREASES'),
    ],
  ),
  chain(
    'C78',
    'Deposit guarantee, run risk and fiscal liability',
    FUTURE_MACRO,
    FUTURE,
    [
      edge('CREDIBLE_DEPOSIT_GUARANTEE', 'WITHDRAWAL_PROPENSITY', 'DECREASES'),
      edge('WITHDRAWAL_PROPENSITY', 'BANK_RUN_RISK', 'INCREASES'),
      edge(
        'CREDIBLE_DEPOSIT_GUARANTEE',
        'GOVERNMENT_CONTINGENT_LIABILITY',
        'INCREASES',
      ),
    ],
  ),
  chain('C79', 'Repeated bailouts and moral hazard', FUTURE_MACRO, FUTURE, [
    edge('REPEATED_BANK_BAILOUTS', 'EXPECTED_RESCUE', 'INCREASES'),
    edge('EXPECTED_RESCUE', 'BANK_RISK_APPETITE', 'INCREASES'),
    edge('BANK_RISK_APPETITE', 'RISKY_LENDING', 'INCREASES'),
    edge('RISKY_LENDING', 'FUTURE_NPL_TAIL_RISK', 'INCREASES'),
  ]),
  chain(
    'C80',
    'Sovereign stress, saving, capital outflow and FX pressure',
    FUTURE_MACRO,
    FUTURE,
    [
      edge('SOVEREIGN_STRESS', 'EXPECTED_TAX_INFLATION', 'INCREASES'),
      edge('EXPECTED_TAX_INFLATION', 'SAVING_CAPITAL_OUTFLOW', 'INCREASES'),
      edge('SAVING_CAPITAL_OUTFLOW', 'DOMESTIC_DEMAND', 'DECREASES'),
      edge('SAVING_CAPITAL_OUTFLOW', 'FX_PRESSURE', 'INCREASES'),
      edge('DOMESTIC_DEMAND', 'SOVEREIGN_STRESS', 'DECREASES'),
    ],
  ),
  chain(
    'C81',
    'Buyer concentration and partner recession exposure',
    FUTURE_MACRO,
    FUTURE,
    [
      edge(
        'TOP_BUYER_CONCENTRATION',
        'PARTNER_RECESSION_EXPOSURE',
        'INCREASES',
      ),
      edge('PARTNER_RECESSION_EXPOSURE', 'EXPORT_ORDERS', 'DECREASES'),
      edge('EXPORT_ORDERS', 'SECTOR_EMPLOYMENT', 'INCREASES'),
      edge('SECTOR_EMPLOYMENT', 'WAGE_INCOME', 'INCREASES'),
      edge('WAGE_INCOME', 'PUBLIC_SUPPORT', 'INCREASES'),
    ],
  ),
  chain(
    'C82',
    'Supplier concentration and precautionary importing',
    FUTURE_MACRO,
    FUTURE,
    [
      edge(
        'SUPPLIER_CONCENTRATION_CONTRACT_RISK',
        'PRECAUTIONARY_INVENTORY_TARGET',
        'INCREASES',
      ),
      edge(
        'PRECAUTIONARY_INVENTORY_TARGET',
        'FRONT_LOADED_IMPORTS',
        'INCREASES',
      ),
      edge('FRONT_LOADED_IMPORTS', 'WORKING_CAPITAL_FX_DEMAND', 'INCREASES'),
    ],
  ),
  chain(
    'C83',
    'Contract default and trade credit risk premium',
    FUTURE_MACRO,
    FUTURE,
    [
      edge(
        'REPEATED_CONTRACT_DEFAULT',
        'DEPOSIT_ADVANCE_PAYMENT_RISK_PREMIUM',
        'INCREASES',
      ),
      edge('DEPOSIT_ADVANCE_PAYMENT_RISK_PREMIUM', 'LANDED_COST', 'INCREASES'),
      edge('LANDED_COST', 'TRADE_VOLUME', 'DECREASES'),
    ],
  ),
  chain(
    'C84',
    'Reliable delivery and trade-finance terms',
    FUTURE_MACRO,
    FUTURE,
    [
      edge(
        'RELIABLE_DELIVERY_HISTORY',
        'PAYMENT_TERMS_COLLATERAL_RELIEF',
        'INCREASES',
      ),
      edge(
        'PAYMENT_TERMS_COLLATERAL_RELIEF',
        'TRADE_FINANCE_COST',
        'DECREASES',
      ),
      edge('TRADE_FINANCE_COST', 'EXPORT_COMPETITIVENESS', 'DECREASES'),
    ],
  ),
  chain('C85', 'Sanctions and domestic political cost', FUTURE_MACRO, FUTURE, [
    edge('GOVERNMENT_SANCTIONS', 'TARGET_TRADE', 'DECREASES'),
    edge(
      'GOVERNMENT_SANCTIONS',
      'DOMESTIC_IMPORT_SUPPLY_EXPORT_MARKETS',
      'DECREASES',
    ),
    edge('DOMESTIC_IMPORT_SUPPLY_EXPORT_MARKETS', 'DOMESTIC_COST', 'DECREASES'),
    edge(
      'DOMESTIC_IMPORT_SUPPLY_EXPORT_MARKETS',
      'EXPORT_REVENUE',
      'INCREASES',
    ),
    edge('DOMESTIC_COST', 'DOMESTIC_POLITICAL_COST', 'INCREASES'),
    edge('EXPORT_REVENUE', 'DOMESTIC_POLITICAL_COST', 'DECREASES'),
  ]),
  chain(
    'C86',
    'Food export ban domestic relief and external cost',
    FUTURE_MACRO,
    FUTURE,
    [
      edge('FOOD_EXPORT_BAN', 'DOMESTIC_AVAILABLE_FOOD_SUPPLY', 'INCREASES'),
      edge('DOMESTIC_AVAILABLE_FOOD_SUPPLY', 'FOOD_PRICE', 'DECREASES'),
      edge('FOOD_PRICE', 'COST_OF_LIVING_STRESS', 'INCREASES'),
      edge(
        'FOOD_EXPORT_BAN',
        'FARMER_EXPORTER_INCOME_FX_EARNINGS',
        'DECREASES',
      ),
      edge('FOOD_EXPORT_BAN', 'FOREIGN_DISPUTE_RISK', 'INCREASES'),
    ],
  ),
  chain(
    'C87',
    'Commodity aid relief and local-supply substitution risk',
    FUTURE_MACRO,
    FUTURE,
    [
      edge('COMMODITY_AID_INFLOW', 'ESSENTIAL_SUPPLY', 'INCREASES'),
      edge('ESSENTIAL_SUPPLY', 'PRICE_STRESS', 'DECREASES'),
      edge('ESSENTIAL_SUPPLY', 'IMPORT_BILL', 'DECREASES'),
      edge('PROLONGED_COMMODITY_AID', 'LOCAL_PRODUCER_REVENUE', 'DECREASES'),
      edge(
        'LOCAL_PRODUCER_REVENUE',
        'FUTURE_DOMESTIC_SUPPLY_CAPACITY',
        'INCREASES',
      ),
    ],
  ),
  chain(
    'C88',
    'Grant and loan aid intertemporal trade-off',
    FUTURE_MACRO,
    FUTURE,
    [
      edge('FOREIGN_AID_EMERGENCY_GRANT', 'FISCAL_FX_CONSTRAINT', 'DECREASES'),
      edge('FISCAL_FX_CONSTRAINT', 'CRISIS_SERVICE_RECOVERY', 'DECREASES'),
      edge('CRISIS_SERVICE_RECOVERY', 'SUPPORT_CREDIBILITY', 'INCREASES'),
      edge('LOAN_AID', 'FUTURE_DEBT_SERVICE', 'INCREASES'),
    ],
  ),
  chain(
    'C89',
    'Strategic resource agreement and current-account leakage',
    FUTURE_MACRO,
    FUTURE,
    [
      edge('STRATEGIC_RESOURCE_AGREEMENT', 'FOREIGN_INVESTMENT', 'INCREASES'),
      edge('FOREIGN_INVESTMENT', 'EXTRACTION_JOBS_REVENUE', 'INCREASES'),
      edge('STRATEGIC_RESOURCE_AGREEMENT', 'FOREIGN_OWNERSHIP', 'INCREASES'),
      edge('FOREIGN_OWNERSHIP', 'PROFIT_REPATRIATION', 'INCREASES'),
      edge('PROFIT_REPATRIATION', 'CURRENT_ACCOUNT_LEAKAGE', 'INCREASES'),
    ],
  ),
  chain(
    'C90',
    'Foreign-funded project localisation and public perception',
    FUTURE_MACRO,
    FUTURE,
    [
      edge(
        'FOREIGN_FUNDED_IMPORTED_CAPITAL_AND_LABOUR',
        'FDI_HEADLINE',
        'INCREASES',
      ),
      edge(
        'FOREIGN_FUNDED_IMPORTED_CAPITAL_AND_LABOUR',
        'DOMESTIC_EMPLOYMENT_MULTIPLIER',
        'DECREASES',
      ),
      edge(
        'FOREIGN_FUNDED_IMPORTED_CAPITAL_AND_LABOUR',
        'HOUSING_DEMAND',
        'INCREASES',
      ),
      edge('DOMESTIC_EMPLOYMENT_MULTIPLIER', 'PUBLIC_PERCEPTION', 'INCREASES'),
    ],
  ),
  chain('C91', 'Welfare arrears, poverty and protest', GOVERNANCE, FUTURE, [
    edge('WELFARE_PAYMENT_ARREARS', 'LOW_INCOME_CASH_FLOW', 'DECREASES'),
    edge('LOW_INCOME_CASH_FLOW', 'CONSUMPTION', 'INCREASES'),
    edge('LOW_INCOME_CASH_FLOW', 'DEBT_ARREARS', 'DECREASES'),
    edge('DEBT_ARREARS', 'POVERTY', 'INCREASES'),
    edge('POVERTY', 'PROTEST_RISK_PUBLIC_SUPPORT', 'INCREASES'),
  ]),
  chain(
    'C92',
    'Government wage arrears and service-capacity decline',
    GOVERNANCE,
    FUTURE,
    [
      edge(
        'GOVERNMENT_WAGE_ARREARS',
        'TEACHER_DOCTOR_POLICE_HOUSEHOLD_INCOME',
        'DECREASES',
      ),
      edge(
        'TEACHER_DOCTOR_POLICE_HOUSEHOLD_INCOME',
        'ABSENTEEISM_STAFF_EXIT_RISK',
        'DECREASES',
      ),
      edge(
        'ABSENTEEISM_STAFF_EXIT_RISK',
        'PUBLIC_SERVICE_CAPACITY',
        'DECREASES',
      ),
      edge('PUBLIC_SERVICE_CAPACITY', 'PUBLIC_SUPPORT', 'INCREASES'),
    ],
  ),
  chain(
    'C93',
    'Protest policing and residual public-safety capacity',
    GOVERNANCE,
    FUTURE,
    [
      edge(
        'POLICE_CONCENTRATION_ON_PROTEST',
        'AVAILABLE_POLICE_ELSEWHERE',
        'DECREASES',
      ),
      edge(
        'AVAILABLE_POLICE_ELSEWHERE',
        'RESPONSE_TIME_CRIME_BACKLOG',
        'DECREASES',
      ),
      edge('RESPONSE_TIME_CRIME_BACKLOG', 'LOCAL_SAFETY', 'DECREASES'),
      edge('LOCAL_SAFETY', 'PUBLIC_SUPPORT', 'INCREASES'),
    ],
  ),
  chain(
    'C94',
    'Protest disruption and unresolved feedback',
    GOVERNANCE,
    FUTURE,
    [
      edge('PROTEST_EVENT', 'TRANSPORT_WORK_RETAIL_DISRUPTION', 'INCREASES'),
      edge(
        'TRANSPORT_WORK_RETAIL_DISRUPTION',
        'PRODUCTION_CONSUMPTION',
        'DECREASES',
      ),
      edge('PRODUCTION_CONSUMPTION', 'WAGE_TAX_REVENUE', 'INCREASES'),
      edge('UNRESOLVED_PROTEST_DRIVERS', 'PROTEST_EVENT', 'INCREASES'),
    ],
  ),
  chain(
    'C95',
    'Successful mediation and business recovery',
    GOVERNANCE,
    FUTURE,
    [
      edge('SUCCESSFUL_MEDIATION', 'PROTEST_DURATION', 'DECREASES'),
      edge('PROTEST_DURATION', 'POLICE_DEPLOYMENT', 'INCREASES'),
      edge('POLICE_DEPLOYMENT', 'TRANSPORT_BUSINESS_RECOVERY', 'DECREASES'),
      edge('TRANSPORT_BUSINESS_RECOVERY', 'POLITICAL_COST', 'DECREASES'),
    ],
  ),
  chain(
    'C96',
    'Housing shortage, labour mobility and project delay',
    GOVERNANCE,
    FUTURE,
    [
      edge('HOUSING_SHORTAGE', 'RENT', 'INCREASES'),
      edge('RENT', 'REAL_MARGIN', 'DECREASES'),
      edge('REAL_MARGIN', 'WORKER_MIGRATION_WILLINGNESS', 'INCREASES'),
      edge('WORKER_MIGRATION_WILLINGNESS', 'VACANCY_FILLING', 'INCREASES'),
      edge('VACANCY_FILLING', 'PROJECT_DELAY', 'DECREASES'),
      edge('HOUSING_SHORTAGE', 'CONCENTRATED_HOUSING_DEMAND', 'INCREASES'),
    ],
  ),
  chain(
    'C97',
    'Immigration labour contribution and service-capacity pressure',
    GOVERNANCE,
    FUTURE,
    [
      edge('IMMIGRATION', 'LABOUR_SUPPLY', 'INCREASES'),
      edge('LABOUR_SUPPLY', 'VACANCY', 'DECREASES'),
      edge('LABOUR_SUPPLY', 'PRODUCTION', 'INCREASES'),
      edge('IMMIGRATION', 'HOUSING_SCHOOL_HEALTHCARE_DEMAND', 'INCREASES'),
      edge('HOUSING_SCHOOL_HEALTHCARE_DEMAND', 'RENT_BACKLOG', 'INCREASES'),
      edge('RENT_BACKLOG', 'SOCIAL_STRESS', 'INCREASES'),
    ],
  ),
  chain(
    'C98',
    'Emigration and misleading unemployment improvement',
    GOVERNANCE,
    FUTURE,
    [
      edge('EMIGRATION', 'UNEMPLOYMENT_RATE', 'DECREASES'),
      edge('EMIGRATION', 'POPULATION_TAX_BASE_CONSUMPTION', 'DECREASES'),
      edge('EMIGRATION', 'SKILL_STOCK', 'DECREASES'),
    ],
  ),
  chain(
    'C99',
    'Ageing, fiscal burden and working-age income',
    GOVERNANCE,
    FUTURE,
    [
      edge('AGEING_POPULATION', 'LABOUR_FORCE_PARTICIPATION', 'DECREASES'),
      edge('AGEING_POPULATION', 'PENSION_HEALTHCARE_DEMAND', 'INCREASES'),
      edge('PENSION_HEALTHCARE_DEMAND', 'FISCAL_BURDEN', 'INCREASES'),
      edge('FISCAL_BURDEN', 'TAX_CONTRIBUTION_PRESSURE', 'INCREASES'),
      edge(
        'TAX_CONTRIBUTION_PRESSURE',
        'WORKING_AGE_DISPOSABLE_INCOME',
        'DECREASES',
      ),
    ],
  ),
  chain(
    'C100',
    'Disaster displacement, essential demand and recovery',
    GOVERNANCE,
    FUTURE,
    [
      edge('DISASTER_CIVIL_EMERGENCY', 'DISPLACEMENT', 'INCREASES'),
      edge('DISPLACEMENT', 'REDISTRIBUTED_HOUSING_DEMAND', 'INCREASES'),
      edge(
        'DISASTER_CIVIL_EMERGENCY',
        'LABOUR_UNAVAILABLE_HEALTHCARE_DEMAND',
        'INCREASES',
      ),
      edge(
        'DISASTER_CIVIL_EMERGENCY',
        'ESSENTIAL_CONSUMPTION_SHARE',
        'INCREASES',
      ),
      edge(
        'DISASTER_CIVIL_EMERGENCY',
        'FISCAL_EMERGENCY_SPENDING',
        'INCREASES',
      ),
      edge('RESPONSE_SPEED_AND_RECOVERY', 'PUBLIC_SUPPORT', 'INCREASES'),
    ],
  ),
]);

/**
 * Qualitative topology scheduling only. Concrete quantities and money must use
 * `scheduleExactCausalTransmission` from causal-values.ts.
 */
export interface CausalSignalScheduleInput {
  readonly effectId: string;
  readonly chainId: CausalChainId;
  readonly edgeIndex: CausalEdgeIndex;
  readonly sourcePeriod: CausalPeriod;
  /** Must be positive: a pure kernel cannot choose same-period settlement order. */
  readonly delayPeriods: CausalPeriod;
  readonly parameterVersion: string;
}

export interface ScheduledCausalSignal {
  readonly effectId: string;
  readonly chainId: CausalChainId;
  readonly edgeIndex: CausalEdgeIndex;
  readonly source: string;
  readonly target: string;
  readonly direction: CausalDirection;
  readonly sourcePeriod: CausalPeriod;
  readonly duePeriod: CausalPeriod;
  readonly parameterVersion: string;
}

export function canonicalCausalPeriod(
  value: string,
  label: string,
): CausalPeriod {
  if (
    typeof value !== 'string' ||
    !CANONICAL_NON_NEGATIVE_INTEGER.test(value)
  ) {
    kernelInvalid(`${label} must be a canonical non-negative integer string`);
  }
  return value;
}

function canonicalPositiveCausalPeriod(
  value: string,
  label: string,
): CausalPeriod {
  if (typeof value !== 'string' || !CANONICAL_POSITIVE_INTEGER.test(value)) {
    kernelInvalid(`${label} must be a canonical positive integer string`);
  }
  return value;
}

export function compareCausalPeriods(
  left: CausalPeriod,
  right: CausalPeriod,
): number {
  const canonicalLeft = canonicalCausalPeriod(left, 'left causal period');
  const canonicalRight = canonicalCausalPeriod(right, 'right causal period');
  if (canonicalLeft === canonicalRight) return 0;
  return BigInt(canonicalLeft) < BigInt(canonicalRight) ? -1 : 1;
}

function addCausalPeriods(
  left: CausalPeriod,
  right: CausalPeriod,
): CausalPeriod {
  return (BigInt(left) + BigInt(right)).toString();
}

function selectedCausalEdge(
  definition: CausalChainDefinition,
  edgeIndex: CausalEdgeIndex,
): CausalEdge | undefined {
  let currentIndex: CausalEdgeIndex = '0';
  for (const candidate of definition.edges) {
    if (currentIndex === edgeIndex) return candidate;
    currentIndex = addCausalPeriods(currentIndex, '1');
  }
  return undefined;
}

function stableIdentifier(value: string, label: string): string {
  if (!/^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u.test(value)) {
    kernelInvalid(`${label} must be a stable identifier`);
  }
  return value;
}

export function getCausalChain(chainId: CausalChainId): CausalChainDefinition {
  const found = CAUSAL_CHAINS.find((candidate) => candidate.id === chainId);
  if (found === undefined) kernelInvalid(`Unknown causal chain: ${chainId}`);
  return found;
}

/**
 * Schedules causal topology only. It cannot carry a number, quantity, or
 * currency amount; concrete values must use the exact dimensional API.
 */
export function scheduleCausalSignal(
  input: CausalSignalScheduleInput,
): ScheduledCausalSignal {
  const definition = getCausalChain(input.chainId);
  const edgeIndex = canonicalCausalPeriod(input.edgeIndex, 'edgeIndex');
  const selected = selectedCausalEdge(definition, edgeIndex);
  if (selected === undefined) {
    kernelInvalid(`Unknown causal edge ${edgeIndex} for ${input.chainId}`);
  }
  const sourcePeriod = canonicalCausalPeriod(
    input.sourcePeriod,
    'sourcePeriod',
  );
  const delay = canonicalPositiveCausalPeriod(
    input.delayPeriods,
    'delayPeriods',
  );
  const duePeriod = addCausalPeriods(sourcePeriod, delay);
  return Object.freeze({
    effectId: stableIdentifier(input.effectId, 'effectId'),
    chainId: definition.id,
    edgeIndex,
    source: selected.source,
    target: selected.target,
    direction: selected.direction,
    sourcePeriod,
    duePeriod,
    parameterVersion: stableIdentifier(
      input.parameterVersion,
      'parameterVersion',
    ),
  });
}

export interface CausalSignalPartition {
  readonly due: readonly ScheduledCausalSignal[];
  readonly pending: readonly ScheduledCausalSignal[];
}

function compareScheduledSignals(
  left: ScheduledCausalSignal,
  right: ScheduledCausalSignal,
): number {
  const duePeriodOrder = compareCausalPeriods(left.duePeriod, right.duePeriod);
  if (duePeriodOrder !== 0) return duePeriodOrder;
  return left.effectId < right.effectId
    ? -1
    : left.effectId > right.effectId
      ? 1
      : 0;
}

/** Returns an ordered, lossless partition; consumers still decide whether to apply it. */
export function partitionCausalSignals(
  currentPeriod: CausalPeriod,
  signals: readonly ScheduledCausalSignal[],
): CausalSignalPartition {
  const current = canonicalCausalPeriod(currentPeriod, 'currentPeriod');
  const seen = new Set<string>();
  const ordered = [...signals].sort(compareScheduledSignals);
  const due: ScheduledCausalSignal[] = [];
  const pending: ScheduledCausalSignal[] = [];
  for (const signal of ordered) {
    stableIdentifier(signal.effectId, 'effectId');
    canonicalCausalPeriod(signal.sourcePeriod, 'signal sourcePeriod');
    canonicalCausalPeriod(signal.duePeriod, 'signal duePeriod');
    if (compareCausalPeriods(signal.duePeriod, signal.sourcePeriod) <= 0) {
      kernelInvalid('Scheduled signal must be due after its source period');
    }
    if (seen.has(signal.effectId))
      kernelInvalid('Causal signal IDs must be unique');
    seen.add(signal.effectId);
    if (compareCausalPeriods(signal.duePeriod, current) <= 0) due.push(signal);
    else pending.push(signal);
  }
  return Object.freeze({
    due: Object.freeze(due),
    pending: Object.freeze(pending),
  });
}

/** A small integrity gate for tests and future catalogue consumers. */
export function assertCausalCatalogueIntegrity(
  definitions: readonly CausalChainDefinition[] = CAUSAL_CHAINS,
): void {
  const ids = new Set<string>();
  for (const definition of definitions) {
    if (!/^C[1-9][0-9]*$/u.test(definition.id)) {
      kernelInvalid('Causal chain ID must be canonical');
    }
    if (ids.has(definition.id))
      kernelInvalid('Causal chain IDs must be unique');
    ids.add(definition.id);
    if (definition.title.length === 0)
      kernelInvalid('Causal chain title is required');
    if (definition.edges.length === 0)
      kernelInvalid('Causal chain requires an edge');
    for (const item of definition.edges) {
      if (item.source.length === 0 || item.target.length === 0) {
        kernelInvalid('Causal edge source and target are required');
      }
      if (item.direction !== 'INCREASES' && item.direction !== 'DECREASES') {
        kernelInvalid('Causal edge direction is invalid');
      }
    }
  }
}
