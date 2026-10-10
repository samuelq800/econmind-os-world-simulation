import type {
  AuthenticatedOfficeCommandRequestDto,
  ManualOfficeCommandFamily,
} from './authenticated-office-command-contract.js';
export const AUTHENTICATED_COMMAND_RECOVERY_PATH =
  '/v1/command-recovery' as const;
export const AUTHENTICATED_COMMAND_RECOVERY_SCHEMA =
  'world-command-recovery-v1' as const;
export interface AuthenticatedCommandRecoveryRequestDto {
  readonly schemaVersion: typeof AUTHENTICATED_COMMAND_RECOVERY_SCHEMA;
  readonly requestId: string;
  readonly request: Readonly<{
    worldId: string;
    commandId: string;
    idempotencyKey: string;
    originalRequest: AuthenticatedOfficeCommandRequestDto;
    knownCommandFingerprint?: string;
  }>;
}
export interface ManualCommandFinalReceiptDto {
  readonly source: 'DURABLE_FINAL_COMMAND_RECEIPT';
  readonly schemaVersion: 'command-receipt-v2';
  readonly worldId: string;
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly commandFingerprint: string;
  readonly outcome: 'COMMITTED' | 'REJECTED' | 'AUTHORIZATION_REVOKED';
  readonly reasonCode: string | null;
  readonly transitionId: string | null;
  readonly worldVersionBefore: string | null;
  readonly worldVersionAfter: string | null;
  readonly simTime: string;
  readonly eventIds: readonly string[];
  readonly recordedAtReal: string;
}
export type AuthenticatedCommandRecoveryResponseDto = Readonly<{
  schemaVersion: typeof AUTHENTICATED_COMMAND_RECOVERY_SCHEMA;
  requestId: string;
}> &
  (
    | Readonly<{
        ok: true;
        state:
          | Readonly<{
              status: 'QUEUED' | 'CLAIMED';
              commandType: ManualOfficeCommandFamily;
              commandId: string;
              idempotencyKey: string;
              commandFingerprint: string;
            }>
          | Readonly<{
              status: 'FINAL';
              commandType: ManualOfficeCommandFamily;
              receipt: ManualCommandFinalReceiptDto;
            }>;
      }>
    | Readonly<{
        ok: false;
        error: Readonly<{ code: string; retryable: boolean }>;
      }>
  );
