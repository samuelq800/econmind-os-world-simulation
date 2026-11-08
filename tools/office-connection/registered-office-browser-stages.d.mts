import type { createOfficeCommandController } from '../../apps/world-web/src/office-command/controller.js';
import type { AuthenticatedOfficeCommandRequestDto } from '../../packages/core/src/commands/authenticated-office-command-contract.js';

export type RegisteredOfficeBrowserRole =
  'captain' | 'finance' | 'central_bank' | 'industry' | 'trade' | 'social';
export type RegisteredOfficeBrowserState = ReturnType<
  ReturnType<typeof createOfficeCommandController>['getState']
>;
export interface RegisteredOfficeBrowserHead {
  readonly worldVersion: string;
  readonly eventSequence: string;
}
export interface RegisteredOfficeBrowserStageInput {
  readonly actualOrigin: string;
  readonly applicationOrigin: string;
  readonly evidenceDir: string;
  readonly authSubject: string;
  readonly countryId: string;
  readonly countryDisplayId: string;
  readonly readConfiguration: Readonly<{
    admittedWorldPins: Readonly<{
      worldId: string;
      seedRef: string;
      contentHash: string;
      admissionRef: string;
      minimumWorldVersion: string;
    }>;
    endpointPins: Readonly<{
      origin: string;
      projectionPath: string;
      finalLookupPath: string;
      deploymentRef: string;
    }>;
    modelVersion: string;
  }>;
  /** Existing Chromium instance; if absent, this tool owns Chromium only. */
  readonly browser?: unknown;
  readonly playwrightModule?: string;
  readonly chromiumExecutable?: string;
  /** Actual credential provider, never written to evidence. */
  readonly getAccessToken: () => string | Promise<string>;
}
export type RegisteredIndustryPowerFormSelection = Readonly<{
  /** Selected from a real current utilityPlanningPage; never a sample/default. */
  planningRef: string;
  sourceVersion: string;
  expectedHead: RegisteredOfficeBrowserHead;
}> &
  (
    | Readonly<{
        action: 'BOOK';
        quantity: string;
        startsAtSimTime: string;
        endsAtSimTime: string;
      }>
    | Readonly<{ action: 'DELIVER' }>
  );
export interface RegisteredOfficeBrowserSession {
  readonly role: RegisteredOfficeBrowserRole;
  /** Opaque real Playwright Page; use the finite stages below. */
  readonly page: unknown;
  state(): Promise<RegisteredOfficeBrowserState>;
  read(
    expectation?: Readonly<{
      status?: RegisteredOfficeBrowserState['status'];
      expectedHead?: RegisteredOfficeBrowserHead;
    }>,
  ): Promise<RegisteredOfficeBrowserState>;
  /** Read the real planning page, operate the shipped form, review and submit
   * once. Returns its actual original in state.intent for reloadRestore;
   * caller must separately consume and recoverFinal. An ACK is never FINAL. */
  submitIndustryPowerFromPlanning(
    selection: RegisteredIndustryPowerFormSelection,
    expectation?: Readonly<{
      expectedStatus?: RegisteredOfficeBrowserState['status'];
    }>,
  ): Promise<RegisteredOfficeBrowserState>;
  submitOnce(
    original: AuthenticatedOfficeCommandRequestDto,
    expectation?: Readonly<{
      expectedStatus?: RegisteredOfficeBrowserState['status'];
    }>,
  ): Promise<RegisteredOfficeBrowserState>;
  recoverFinal(
    expectation?: Readonly<{
      expectedOutcome?: 'COMMITTED' | 'REJECTED';
      requireCurrent?: boolean;
      expectedHead?: RegisteredOfficeBrowserHead;
    }>,
  ): Promise<RegisteredOfficeBrowserState>;
  /** Reload, paste the original into the shipped UI, then query only. */
  reloadRestore(
    original: AuthenticatedOfficeCommandRequestDto,
    options?: Readonly<{ recover?: boolean }>,
  ): Promise<RegisteredOfficeBrowserState>;
  setAccessTokenForNextRequest(bearer: string): Promise<void>;
  assertDeniedCleared(): Promise<RegisteredOfficeBrowserState>;
  close(): Promise<void>;
}
export interface RegisteredOfficeBrowserStages {
  readonly evidence: Readonly<Record<string, unknown>>;
  open(
    role: RegisteredOfficeBrowserRole,
  ): Promise<RegisteredOfficeBrowserSession>;
  readAll(
    expectation?: Readonly<{
      expectedHead?: RegisteredOfficeBrowserHead;
      expectedByRole?: Partial<
        Record<
          RegisteredOfficeBrowserRole,
          RegisteredOfficeBrowserState['status']
        >
      >;
    }>,
  ): Promise<
    readonly Readonly<{
      role: RegisteredOfficeBrowserRole;
      state: RegisteredOfficeBrowserState;
    }>[]
  >;
  /** Owned child restart only; keeps live Chromium pages and never submits. */
  setActualOrigin(origin: string): Promise<void>;
  close(): Promise<void>;
}
export function createRegisteredOfficeBrowserStages(
  input: RegisteredOfficeBrowserStageInput,
): Promise<RegisteredOfficeBrowserStages>;
