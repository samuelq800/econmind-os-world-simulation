import type { Pool } from 'pg';
import {
  createHttpsAuthenticatedReadComposition,
  type HttpsReadCompositionConfig,
} from './https-authenticated-read-composition.js';
import {
  createHttpsAuthenticatedReadRoute,
  type HttpsAuthenticatedReadRouteOptions,
} from './https-authenticated-read-route.js';
import { createSupabaseJwksSignatureVerifier } from './supabase-jwks-signature-verifier.js';
import { createPostgresServerReadBindingProvider } from './postgres-full-read-provider.js';
import { createPostgresRuntimeReadExecutor } from './postgres-runtime-read-executor.js';

/** Explicit composition of reviewed entrypoints. Does not listen, deploy,
 * obtain secrets, admit a seed, assign seats or start Clock/Worker. JWKS is
 * fetched only when a caller actually uses a read handler. */
export function createNonactivatedRuntimeReadHost(input: {
  readonly pool: Pick<Pool, 'connect'>;
  readonly readerRole: string;
  readonly authorizationPublisherRole: string;
  readonly endpointPins: HttpsReadCompositionConfig['endpointPins'];
  readonly admittedWorldPins: HttpsReadCompositionConfig['admittedWorldPins'];
  readonly auth: {
    readonly projectRef: string;
    readonly expectedIssuer: string;
    readonly jwksUrl: string;
    readonly audience: string;
    readonly fetch?: typeof globalThis.fetch;
  };
  readonly routeOptions: HttpsAuthenticatedReadRouteOptions;
}): Readonly<{
  simulationEnabled: false;
  workerActivationAllowed: false;
  clockActivationAllowed: false;
  config: HttpsReadCompositionConfig;
  composition: ReturnType<typeof createHttpsAuthenticatedReadComposition>;
  route: ReturnType<typeof createHttpsAuthenticatedReadRoute>;
  invalidateSessionKeyCache: () => void;
}> {
  const auth = Object.freeze({ ...input.auth });
  const verifier = createSupabaseJwksSignatureVerifier(auth);
  const config: HttpsReadCompositionConfig = Object.freeze({
    endpointPins: Object.freeze({ ...input.endpointPins }),
    admittedWorldPins: Object.freeze({ ...input.admittedWorldPins }),
    verifier,
    currentJwtPolicy: () => ({
      expectedIssuer: verifier.expectedIssuer,
      expectedAudience: auth.audience,
      nowEpochSeconds: Math.floor(Date.now() / 1000),
    }),
    bindingReader: createPostgresServerReadBindingProvider(input),
    executor: createPostgresRuntimeReadExecutor(input),
  });
  return Object.freeze({
    simulationEnabled: false as const,
    workerActivationAllowed: false as const,
    clockActivationAllowed: false as const,
    config,
    composition: createHttpsAuthenticatedReadComposition(config),
    route: createHttpsAuthenticatedReadRoute(config, input.routeOptions),
    invalidateSessionKeyCache: () => verifier.invalidateCache(),
  });
}
