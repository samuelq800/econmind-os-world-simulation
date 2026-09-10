import { addDecimal, assertCanonicalDecimal } from './decimal.js';

export interface BilateralFlow {
  readonly exporterId: string;
  readonly importerId: string;
  readonly sectorId: string;
  readonly value: string;
}

export interface TradeDiagnostic {
  readonly countryId: string;
  readonly sectorId: string;
  readonly exportTotal: string;
  readonly importTotal: string;
}

export function validateAndSummarizeFlows(
  flows: readonly BilateralFlow[],
): readonly TradeDiagnostic[] {
  const totals = new Map<string, { exports: string; imports: string }>();
  for (const flow of flows) {
    if (flow.exporterId === flow.importerId) {
      throw new Error(
        `Self-flow is not permitted: ${flow.exporterId}/${flow.sectorId}`,
      );
    }
    assertCanonicalDecimal(flow.value);
    for (const [countryId, side] of [
      [flow.exporterId, 'exports'],
      [flow.importerId, 'imports'],
    ] as const) {
      const key = `${countryId}\u0000${flow.sectorId}`;
      const current = totals.get(key) ?? { exports: '0', imports: '0' };
      current[side] = addDecimal(current[side], flow.value);
      totals.set(key, current);
    }
  }
  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => {
      const [countryId = '', sectorId = ''] = key.split('\u0000');
      return {
        countryId,
        sectorId,
        exportTotal: value.exports,
        importTotal: value.imports,
      };
    });
}
