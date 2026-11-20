import type { RegisteredOfficeBrowserStageInput } from './registered-office-browser-stages.mjs';
export interface RegisteredTradeCbReadbackBrowserInput {
  /** Borrowed actual Chromium instance and shipped application asset server. */
  readonly browser: unknown;
  readonly application: Readonly<{ baseURL: string; bundleSha256: string }>;
  readonly apiBaseURL: string;
  readonly applicationOrigin: string;
  readonly readConfiguration: RegisteredOfficeBrowserStageInput['readConfiguration'];
  readonly authSubject: string;
  readonly countryId: string;
  readonly countryDisplayId: string;
  readonly getAccessToken: RegisteredOfficeBrowserStageInput['getAccessToken'];
  /** Expected quiescent current head from the actual fixture, not an authority. */
  readonly expectedHead: Readonly<{
    worldVersion: string;
    eventSequence: string;
  }>;
  /** Trusted local native evidence path. Failure still throws the original
   * assertion; saved data excludes headers, tokens and full intent state. */
  readonly failureEvidencePath?: string;
}
export function registeredReadbackFailureState(value: unknown): Readonly<{
  status: string | null;
  code: string | null;
  dataset: string | null;
  hasRuntimePage: boolean;
}>;
export function registeredReadbackPublicErrorCode(body: unknown): string | null;
export function registeredReadbackCompletedRecordSummary(
  value: unknown,
): Readonly<Record<string, unknown>>;
/** Starts no browser/backend/DB. Closes only contexts opened by this call.
 * Report contains bounded office-private read rows, never JWT/headers. */
export function runRegisteredTradeCbReadbackBrowserProbe(
  input: RegisteredTradeCbReadbackBrowserInput,
): Promise<
  Readonly<{
    classification: 'ACTUAL_REGISTERED_NODE_AND_SHIPPED_CHROMIUM_READBACK';
    expectedHead: RegisteredTradeCbReadbackBrowserInput['expectedHead'];
    records: readonly Readonly<Record<string, unknown>>[];
    network: readonly Readonly<Record<string, unknown>>[];
    metadata: readonly Readonly<Record<string, unknown>>[];
    bundleSha256: string;
    economicPosts: 0;
    backendStartedHere: false;
    consumerStartedHere: false;
    clockStartedHere: false;
    fundsCoverage: 'VISIBLE_FIRST_BROWSER_PAGE_NOT_ALL_CB_ACCOUNTS';
    displayCoverage: 'SHIPPED_COMMAND_DRAWER_AND_VALIDATED_RUNTIME_PAGE_STATE';
    platformTls: 'NOT_VERIFIED_BY_LOOPBACK_PROXY';
  }>
>;
