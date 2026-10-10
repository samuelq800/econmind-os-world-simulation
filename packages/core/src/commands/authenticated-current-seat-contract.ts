import type { FinancialIntakeBindingDto } from './authenticated-financial-intake-contract.js';
export const AUTHENTICATED_CURRENT_SEAT_PATH = '/v1/current-seat' as const;
export const AUTHENTICATED_CURRENT_SEAT_SCHEMA =
  'world-current-seat-v1' as const;
export interface AuthenticatedCurrentSeatRequestDto {
  readonly schemaVersion: typeof AUTHENTICATED_CURRENT_SEAT_SCHEMA;
  readonly requestId: string;
}
export type AuthenticatedCurrentSeatResponseDto = Readonly<{
  schemaVersion: typeof AUTHENTICATED_CURRENT_SEAT_SCHEMA;
  requestId: string;
}> &
  (
    | Readonly<{
        ok: true;
        session: Readonly<{
          authSubjectId: string;
          issuedAtEpochSeconds: number;
          expiresAtEpochSeconds: number;
        }>;
        world: Readonly<{
          worldId: string;
          seedRef: string;
          contentHash: string;
          admissionRef: string;
          minimumWorldVersion: string;
        }>;
        bindings: readonly FinancialIntakeBindingDto[];
      }>
    | Readonly<{
        ok: false;
        error: Readonly<{ code: string; retryable: boolean }>;
      }>
  );
