/** Disclosure classification only; it never grants membership or read access. */
export const ECONOMIC_READ_VISIBILITY_SCHEMA =
  'economic-read-visibility-v1' as const;
export type EconomicReadScope = Readonly<{
  worldId: string;
  countryId: string;
  classification: 'COUNTRY' | 'OFFICE_PRIVATE';
  officeId: string | null;
}>;
export type EconomicReadDisclosure =
  | Readonly<{ status: 'AUTHORIZED'; sourceUnits: readonly string[] }>
  | Readonly<{ status: 'NOT_AUTHORIZED'; reason: EconomicReadDenialReason }>;
export type EconomicReadDenialReason =
  | 'ADMITTED_SOURCE_UNAVAILABLE'
  | 'OWNER_MAPPING_UNAVAILABLE'
  | 'SCOPE_NOT_AUTHORIZED'
  | 'SUMMARY_SOURCE_UNAVAILABLE';
export interface EconomicReadVisibilitySummary {
  readonly schemaVersion: typeof ECONOMIC_READ_VISIBILITY_SCHEMA;
  readonly financialDetail: 'AUTHORIZED_FILTERED' | 'NOT_AUTHORIZED';
  readonly inventoryDetail: 'NOT_AUTHORIZED';
  readonly countrySummary: 'NOT_AUTHORIZED';
}
