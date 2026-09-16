import {
  kernelInvalid,
  nonNegative,
  render,
  type ExactDecimal,
} from './common.js';

/**
 * This is a catalogue of requested causal pathways, not a policy or a state
 * model. Numeric responses, timing and application remain caller-owned,
 * versioned inputs until their responsible economic owners approve them.
 */
export type CausalChainId = `C${number}`;

export type CausalDirection = 'INCREASES' | 'DECREASES';

export type CausalReadiness =
  'PARAMETERIZED_KERNEL_READY' | 'FUTURE_INTERFACE_ONLY';

export type CausalOwnerScope =
  | 'E02_TO_E07_HUMAN_SYSTEMS'
  | 'E08_TO_E14_REAL_ECONOMY'
  | 'V19_TO_V21_FUTURE_MACRO_EXTERNAL';

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
const FUTURE_MACRO: CausalOwnerScope = 'V19_TO_V21_FUTURE_MACRO_EXTERNAL';
const READY: CausalReadiness = 'PARAMETERIZED_KERNEL_READY';
const FUTURE: CausalReadiness = 'FUTURE_INTERFACE_ONLY';

/**
 * User-requested cross-engine pathways 1–50. The entries intentionally carry
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
]);

export interface CausalTransmissionInput {
  readonly effectId: string;
  readonly chainId: CausalChainId;
  readonly edgeIndex: number;
  readonly sourcePeriod: number;
  /** Must be positive: a pure kernel cannot choose same-period settlement order. */
  readonly delayPeriods: number;
  readonly sourceMagnitude: ExactDecimal;
  /** Caller-owned, versioned conversion/response factor; there is no default. */
  readonly responsePerSourceUnit: ExactDecimal;
  readonly parameterVersion: string;
}

export interface ScheduledCausalEffect {
  readonly effectId: string;
  readonly chainId: CausalChainId;
  readonly edgeIndex: number;
  readonly source: string;
  readonly target: string;
  readonly direction: CausalDirection;
  readonly sourcePeriod: number;
  readonly duePeriod: number;
  readonly parameterVersion: string;
  readonly delta: ExactDecimal;
}

function nonNegativePeriod(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    kernelInvalid(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function positiveDelay(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    kernelInvalid('delayPeriods must be a positive safe integer');
  }
  return value;
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
 * Schedules exactly one caller-parameterized signal. It neither reads nor
 * mutates World State, and a scheduled signal is never an event or posting.
 */
export function scheduleCausalTransmission(
  input: CausalTransmissionInput,
): ScheduledCausalEffect {
  const definition = getCausalChain(input.chainId);
  if (!Number.isSafeInteger(input.edgeIndex) || input.edgeIndex < 0) {
    kernelInvalid('edgeIndex must be a non-negative safe integer');
  }
  const selected = definition.edges[input.edgeIndex];
  if (selected === undefined) {
    kernelInvalid(
      `Unknown causal edge ${input.edgeIndex} for ${input.chainId}`,
    );
  }
  const sourcePeriod = nonNegativePeriod(input.sourcePeriod, 'sourcePeriod');
  const delay = positiveDelay(input.delayPeriods);
  const duePeriod = sourcePeriod + delay;
  if (!Number.isSafeInteger(duePeriod))
    kernelInvalid('duePeriod exceeds safe range');
  const amount = nonNegative(input.sourceMagnitude, 'sourceMagnitude');
  const response = nonNegative(
    input.responsePerSourceUnit,
    'responsePerSourceUnit',
  );
  const absoluteDelta = amount.times(response);
  const delta =
    selected.direction === 'INCREASES'
      ? absoluteDelta
      : absoluteDelta.negated();
  return Object.freeze({
    effectId: stableIdentifier(input.effectId, 'effectId'),
    chainId: definition.id,
    edgeIndex: input.edgeIndex,
    source: selected.source,
    target: selected.target,
    direction: selected.direction,
    sourcePeriod,
    duePeriod,
    parameterVersion: stableIdentifier(
      input.parameterVersion,
      'parameterVersion',
    ),
    delta: render(delta),
  });
}

export interface CausalEffectPartition {
  readonly due: readonly ScheduledCausalEffect[];
  readonly pending: readonly ScheduledCausalEffect[];
}

function compareScheduledEffects(
  left: ScheduledCausalEffect,
  right: ScheduledCausalEffect,
): number {
  if (left.duePeriod !== right.duePeriod)
    return left.duePeriod - right.duePeriod;
  return left.effectId < right.effectId
    ? -1
    : left.effectId > right.effectId
      ? 1
      : 0;
}

/** Returns an ordered, lossless partition; consumers still decide whether to apply it. */
export function partitionCausalEffects(
  currentPeriod: number,
  effects: readonly ScheduledCausalEffect[],
): CausalEffectPartition {
  const current = nonNegativePeriod(currentPeriod, 'currentPeriod');
  const seen = new Set<string>();
  const ordered = [...effects].sort(compareScheduledEffects);
  const due: ScheduledCausalEffect[] = [];
  const pending: ScheduledCausalEffect[] = [];
  for (const effect of ordered) {
    stableIdentifier(effect.effectId, 'effectId');
    nonNegativePeriod(effect.sourcePeriod, 'effect sourcePeriod');
    nonNegativePeriod(effect.duePeriod, 'effect duePeriod');
    if (effect.duePeriod <= effect.sourcePeriod) {
      kernelInvalid('Scheduled effect must be due after its source period');
    }
    if (seen.has(effect.effectId))
      kernelInvalid('Causal effect IDs must be unique');
    seen.add(effect.effectId);
    if (effect.duePeriod <= current) due.push(effect);
    else pending.push(effect);
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
