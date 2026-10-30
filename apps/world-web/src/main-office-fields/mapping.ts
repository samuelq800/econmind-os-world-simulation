/** Versioned presentation mapping, not economic state or command terms. None
 * of the catalog's proposed policy inputs is inferred from aggregate capacity. */
export const MAIN_OFFICE_FIELD_MAPPING = Object.freeze({
  version: 'MAIN_OFFICE_FINANCE_CAPACITY_V1',
  officeId: 'FINANCE',
  role: 'finance',
  dataset: 'treasury-capacity',
  dataNature: 'ADMITTED_CURRENT_FINANCIAL_NO_POSTING_PREFIX',
  rootSelector: '.country-game',
  existingHudSelector: '[data-metric="treasury"]',
  mainSelector: '.national-play',
  sectionId: 'main-office-finance-capacity',
  // These are related policy modules, not a claim that their inputs/commands
  // have been bound. Envelope totals cannot populate departmental cap inputs.
  contextModuleIds: Object.freeze(['finance-11', 'finance-18', 'finance-20']),
  denominator: Object.freeze({
    offices: 6,
    modules: 120,
    policyInputs: 1126,
    readouts: 158,
  }),
  coverage: Object.freeze({
    existingHudControls: 1,
    newReadonlySlots: 10,
    uniqueFacts: 10,
    catalogPolicyInputs: 0,
    catalogReadouts: 0,
    moduleActions: 0,
  }),
  fields: Object.freeze([
    {
      field: 'accountId',
      id: 'main-finance-treasury-account',
      label: 'Treasury claim account',
      kind: 'IDENTIFIER',
    },
    {
      field: 'currency',
      id: 'main-finance-treasury-currency',
      label: 'Ledger currency',
      kind: 'CURRENCY',
    },
    {
      field: 'treasuryLedgerClaimBalance',
      id: 'main-finance-treasury-claim',
      label: 'Treasury ledger claim · not cash',
      kind: 'AMOUNT',
    },
    {
      field: 'openingReservedCapacity',
      id: 'main-finance-opening-reserved',
      label: 'Opening reserved capacity',
      kind: 'AMOUNT',
    },
    {
      field: 'budgetEnvelopeCapacity',
      id: 'main-finance-budget-envelopes',
      label: 'Budget envelope capacity',
      kind: 'AMOUNT',
    },
    {
      field: 'additionalPayrollReservedCapacity',
      id: 'main-finance-payroll-reserved',
      label: 'Additional payroll reservation',
      kind: 'AMOUNT',
    },
    {
      field: 'totalReservedCapacity',
      id: 'main-finance-total-reserved',
      label: 'Total reserved capacity',
      kind: 'AMOUNT',
    },
    {
      field: 'availableCapacity',
      id: 'main-finance-available-capacity',
      label: 'Unreserved capacity · not wallet cash',
      kind: 'AMOUNT',
    },
    {
      field: 'reservationNature',
      id: 'main-finance-reservation-nature',
      label: 'Reservation treatment',
      kind: 'NATURE',
    },
    {
      field: 'balanceNature',
      id: 'main-finance-balance-nature',
      label: 'Balance treatment',
      kind: 'NATURE',
    },
  ] as const),
} as const);
export type MainOfficeCapacityField =
  (typeof MAIN_OFFICE_FIELD_MAPPING.fields)[number]['field'];
