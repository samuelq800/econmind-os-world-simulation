declare const inventoryLedgerAuthority: unique symbol;
declare const financialLedgerAuthority: unique symbol;

export interface InventoryLedgerAuthority {
  readonly [inventoryLedgerAuthority]: 'OPENING_PLUS_POSTING_LINEAGE';
}

export interface FinancialLedgerAuthority {
  readonly [financialLedgerAuthority]: 'OPENING_PLUS_POSTING_LINEAGE';
}

const authoritativeInventoryStates = new WeakSet<object>();
const authoritativeFinancialStates = new WeakSet<object>();

export function authorizeInventoryLedgerState<T extends object>(
  state: T,
): Readonly<T & InventoryLedgerAuthority> {
  authoritativeInventoryStates.add(state);
  return state as Readonly<T & InventoryLedgerAuthority>;
}

export function authorizeFinancialLedgerState<T extends object>(
  state: T,
): Readonly<T & FinancialLedgerAuthority> {
  authoritativeFinancialStates.add(state);
  return state as Readonly<T & FinancialLedgerAuthority>;
}

export function isAuthoritativeInventoryLedgerState(
  state: object,
): state is object & InventoryLedgerAuthority {
  return authoritativeInventoryStates.has(state);
}

export function isAuthoritativeFinancialLedgerState(
  state: object,
): state is object & FinancialLedgerAuthority {
  return authoritativeFinancialStates.has(state);
}
