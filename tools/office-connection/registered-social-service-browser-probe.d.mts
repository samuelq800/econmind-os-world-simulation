import type { RegisteredTradeCbReadbackBrowserInput } from './registered-trade-cb-readback-browser-probe.mjs';
export type RegisteredSocialServiceBrowserInput = Omit<
  RegisteredTradeCbReadbackBrowserInput,
  'expectedHead'
>;
export type SocialServiceBrowserExpectation =
  | Readonly<{
      status: 'PAGE' | 'EMPTY';
      head: Readonly<{ worldVersion: string; eventSequence: string }>;
    }>
  | Readonly<{ status: 'DENIED' | 'UNAVAILABLE' }>;
/** Source code contains shipped UI only, never a JWT or backend response. */
export function buildSocialServiceBrowserAdapter(): Promise<
  Readonly<{ code: string; sha256: string }>
>;
/** Pure assertion of an observation; calling it with test data is not actual
 * Chromium/backend acceptance. Production probe obtains observations itself. */
export function assertSocialServiceBrowserObservation(
  observation: unknown,
  expected: SocialServiceBrowserExpectation &
    Readonly<{
      countryId: string;
      authSubject: string;
      pins: Readonly<Record<string, string>>;
    }>,
): Readonly<Record<string, unknown>>;
/** Borrows the existing actual Node, browser and application asset server.
 * Mounts shipped read component additively; does not certify main-app mounting.
 * Caller must arrange actual EMPTY/403/failure conditions, otherwise NOT_RUN. */
export function createRegisteredSocialServiceContextBrowserProbe(
  input: RegisteredSocialServiceBrowserInput,
): Promise<
  Readonly<{
    read(
      expected: SocialServiceBrowserExpectation,
    ): Promise<Readonly<Record<string, unknown>>>;
    /** F5, fresh actual current-seat/JWT and component config; no old private DOM. */
    reload(): Promise<void>;
    /** Ephemeral actual bearer supplied by native fixture; never returned/logged. */
    setAccessTokenForNextRead(bearer: string): Promise<void>;
    report(): Readonly<Record<string, unknown>>;
    close(): Promise<void>;
  }>
>;
