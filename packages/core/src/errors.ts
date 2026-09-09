export const DOMAIN_ERROR_CODES = Object.freeze({
  CURRENCY_MISMATCH: 'CURRENCY_MISMATCH',
  DUPLICATE_REGISTRY_ID: 'DUPLICATE_REGISTRY_ID',
  INVALID_DECIMAL: 'INVALID_DECIMAL',
  INVALID_ID: 'INVALID_ID',
  INVALID_QUANTITY_UNIT: 'INVALID_QUANTITY_UNIT',
  INVALID_RATE: 'INVALID_RATE',
  NON_FINITE_DECIMAL: 'NON_FINITE_DECIMAL',
  REGISTRY_ENTRY_NOT_FOUND: 'REGISTRY_ENTRY_NOT_FOUND',
  SERIALIZATION_REJECTED: 'SERIALIZATION_REJECTED',
  UNIT_MISMATCH: 'UNIT_MISMATCH',
  VERSION_MISMATCH: 'VERSION_MISMATCH',
} as const);

export type DomainErrorCode =
  (typeof DOMAIN_ERROR_CODES)[keyof typeof DOMAIN_ERROR_CODES];

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}
