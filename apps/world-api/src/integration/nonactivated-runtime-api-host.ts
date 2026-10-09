import type { IncomingMessage, ServerResponse } from 'node:http';
import { WORLD_MODEL_VERSION } from '@econmind/core';
import { AUTHENTICATED_FINANCIAL_INTAKE_PATH } from '@econmind/core/authenticated-financial-intake-contract';
import { AUTHENTICATED_OFFICE_COMMAND_PATH } from '@econmind/core/authenticated-office-command-contract';
import { createNonactivatedRuntimeReadHost } from './nonactivated-runtime-read-host.js';
import {
  createHttpsAuthenticatedFinancialIntakeRoute,
  type HttpsFinancialIntakeRouteConfig,
} from './https-authenticated-financial-intake-route.js';
import {
  createHttpsAuthenticatedOfficeCommandRoute,
  type HttpsOfficeCommandRouteConfig,
} from './https-authenticated-office-command-route.js';
import type { AuthenticatedFinancialIntakeCompositionConfig } from './authenticated-financial-intake-composition.js';
import { OFFICIAL_COUNTRY_LIST_PATH } from './official-country-baseline.js';
import { OFFICIAL_DATASET_LIST_PATH } from './official-dataset-route.js';
import { OFFICIAL_MAP_ASSET_LIST_PATH } from './official-map-asset-route.js';
import { SEASON1_MY_TEAM_PATH } from './season1-my-team-route.js';

type ReadHostInput = Parameters<typeof createNonactivatedRuntimeReadHost>[0];
export interface NonactivatedRuntimeApiHostInput {
  /** Expected compiled model, not evidence that an opening has been admitted. */
  readonly modelVersion: typeof WORLD_MODEL_VERSION;
  readonly read: ReadHostInput;
  /** Null retains the existing NOT_CONNECTED command route. */
  readonly financial: HttpsFinancialIntakeRouteConfig | null;
  /** Positive compositions require an owner-provided immutable clock port;
   * this aggregate never freezes borrowed pool/clock/consumer objects. */
  readonly office: HttpsOfficeCommandRouteConfig | null;
}
export interface NonactivatedRuntimeApiHost {
  readonly simulationEnabled: false;
  readonly workerActivationAllowed: false;
  readonly clockActivationAllowed: false;
  /** Frozen configuration inventory only, never a readiness/authority receipt. */
  readonly configuration: Readonly<{
    modelVersion: typeof WORLD_MODEL_VERSION;
    endpointPins: ReadHostInput['endpointPins'];
    admittedWorldPins: ReadHostInput['admittedWorldPins'];
    allowedOrigins: readonly string[];
  }> | null;
  /** false preserves the caller's public/lobby/health/404 router. */
  handle(request: IncomingMessage, response: ServerResponse): Promise<boolean>;
}
const fail = (code: string): never => {
  throw new TypeError(code);
};
const id = (v: string) =>
  typeof v === 'string' &&
  /^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u.test(v) &&
  v.length <= 256;
function origin(v: string) {
  try {
    const u = new URL(v);
    return (
      u.protocol === 'https:' &&
      u.origin === v &&
      !u.username &&
      !u.password &&
      !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
    );
  } catch {
    return false;
  }
}
function origins(values: readonly string[]) {
  if (!Array.isArray(values) || values.length === 0 || !values.every(origin))
    fail('RUNTIME_API_ORIGINS_INVALID');
  return Object.freeze([...new Set(values)].sort());
}
function sameOrigins(a: readonly string[], b: readonly string[]) {
  if (JSON.stringify(origins(a)) !== JSON.stringify(origins(b)))
    fail('RUNTIME_API_ORIGINS_MISMATCH');
}
function exactPath(v: string) {
  const reserved = [
    '/healthz',
    '/readyz',
    '/auth',
    '/storage',
    '/api/public',
    '/season1',
    '/world-data',
    OFFICIAL_COUNTRY_LIST_PATH,
    OFFICIAL_DATASET_LIST_PATH,
    OFFICIAL_MAP_ASSET_LIST_PATH,
    SEASON1_MY_TEAM_PATH,
  ];
  return (
    typeof v === 'string' &&
    v.length <= 256 &&
    /^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/u.test(v) &&
    !v.startsWith('/local/') &&
    !reserved.some((p) => v === p || v.startsWith(p + '/'))
  );
}
function snapshotRead(input: ReadHostInput): ReadHostInput {
  const pins = Object.freeze({ ...input.endpointPins });
  const world = Object.freeze({ ...input.admittedWorldPins });
  if (
    !origin(pins.origin) ||
    !id(pins.deploymentRef) ||
    ![pins.projectionPath, pins.finalLookupPath].every(exactPath)
  )
    fail('RUNTIME_API_ENDPOINTS_INVALID');
  if (
    ![world.worldId, world.seedRef, world.admissionRef].every(id) ||
    !/^sha256:[0-9a-f]{64}$/u.test(world.contentHash) ||
    !/^(?:0|[1-9]\d*)$/u.test(world.minimumWorldVersion) ||
    world.minimumWorldVersion.length > 19 ||
    BigInt(world.minimumWorldVersion) > 9223372036854775807n
  )
    fail('RUNTIME_API_WORLD_PINS_INVALID');
  return Object.freeze({
    ...input,
    endpointPins: pins,
    admittedWorldPins: world,
    auth: Object.freeze({ ...input.auth }),
    routeOptions: Object.freeze({
      ...input.routeOptions,
      allowedOrigins: origins(input.routeOptions.allowedOrigins),
    }),
  });
}
function snapshotComposition<
  C extends AuthenticatedFinancialIntakeCompositionConfig,
>(c: C | null, read: ReadHostInput): C | null {
  if (c === null) return null;
  const pinKeys = [
    'worldId',
    'seedRef',
    'contentHash',
    'admissionRef',
    'minimumWorldVersion',
  ] as const;
  if (pinKeys.some((k) => c.admittedWorldPins[k] !== read.admittedWorldPins[k]))
    fail('RUNTIME_API_WORLD_PINS_MISMATCH');
  const authKeys = [
    'projectRef',
    'expectedIssuer',
    'jwksUrl',
    'audience',
    'fetch',
  ] as const;
  if (authKeys.some((k) => c.auth[k] !== read.auth[k]))
    fail('RUNTIME_API_AUTH_MISMATCH');
  if (
    c.readPool !== read.pool ||
    c.readerRole !== read.readerRole ||
    c.authorizationPublisherRole !== read.authorizationPublisherRole
  )
    fail('RUNTIME_API_READ_PORT_MISMATCH');
  // Preserve the exact private-runtime clock identity. Only its owner may fix
  // method references; never freeze or proxy borrowed authority objects here.
  if (
    c.clock === null ||
    typeof c.clock !== 'object' ||
    typeof c.resolveActorId !== 'function'
  )
    fail('RUNTIME_API_SERVER_PORT_INVALID');
  const nowReal = Object.getOwnPropertyDescriptor(c.clock, 'nowReal');
  const simTime = Object.getOwnPropertyDescriptor(c.clock, 'simTime');
  if (
    !Object.isFrozen(c.clock) ||
    typeof nowReal?.value !== 'function' ||
    typeof simTime?.value !== 'function'
  )
    fail('RUNTIME_API_CLOCK_PORT_MUTABLE');
  return Object.freeze({
    ...c,
    admittedWorldPins: Object.freeze({ ...c.admittedWorldPins }),
    auth: Object.freeze({ ...c.auth }),
  });
}

/** SOURCE_ONLY explicit request composition. No listener, TLS, environment
 * discovery, default mount, seed adoption, grant or Worker/Clock activation.
 * All authority, cancellation and outcomes remain in the original constructors.
 * A JSON/URL/READY external Worker claim cannot replace the private runtime. */
export function createNonactivatedRuntimeApiHost(
  input: NonactivatedRuntimeApiHostInput | null = null,
): Readonly<NonactivatedRuntimeApiHost> {
  const flags = {
    simulationEnabled: false as const,
    workerActivationAllowed: false as const,
    clockActivationAllowed: false as const,
  };
  if (input === null)
    return Object.freeze({
      ...flags,
      configuration: null,
      handle: async () => false,
    });
  if (input.modelVersion !== WORLD_MODEL_VERSION)
    fail('RUNTIME_API_MODEL_MISMATCH');
  const read = snapshotRead(input.read);
  const readPaths = [
    read.endpointPins.projectionPath,
    read.endpointPins.finalLookupPath,
  ];
  if (
    new Set([
      ...readPaths,
      AUTHENTICATED_FINANCIAL_INTAKE_PATH,
      AUTHENTICATED_OFFICE_COMMAND_PATH,
    ]).size !== 4
  )
    fail('RUNTIME_API_PATH_CONFLICT');
  const financial = input.financial,
    office = input.office;
  if (
    (financial !== null &&
      financial.path !== AUTHENTICATED_FINANCIAL_INTAKE_PATH) ||
    (office !== null && office.path !== AUTHENTICATED_OFFICE_COMMAND_PATH)
  )
    fail('RUNTIME_API_ENDPOINTS_INVALID');
  if (financial !== null)
    sameOrigins(financial.allowedOrigins, read.routeOptions.allowedOrigins);
  if (office !== null)
    sameOrigins(office.allowedOrigins, read.routeOptions.allowedOrigins);
  // Snapshot all inputs before constructing any route. No config reassignment
  // can switch an admitted World, source, token provider, origin or handler.
  const financialConfig = Object.freeze({
    path: AUTHENTICATED_FINANCIAL_INTAKE_PATH,
    allowedOrigins: read.routeOptions.allowedOrigins,
    composition: snapshotComposition(financial?.composition ?? null, read),
  });
  const officeConfig = Object.freeze({
    path: AUTHENTICATED_OFFICE_COMMAND_PATH,
    allowedOrigins: read.routeOptions.allowedOrigins,
    composition: snapshotComposition(office?.composition ?? null, read),
  });
  const readHost = createNonactivatedRuntimeReadHost(read);
  const financialRoute =
    createHttpsAuthenticatedFinancialIntakeRoute(financialConfig);
  const officeRoute = createHttpsAuthenticatedOfficeCommandRoute(officeConfig);
  const routes = new Map([
    [readPaths[0]!, readHost.route],
    [readPaths[1]!, readHost.route],
    [AUTHENTICATED_FINANCIAL_INTAKE_PATH, financialRoute],
    [AUTHENTICATED_OFFICE_COMMAND_PATH, officeRoute],
  ]);
  type Pending = {
    readonly request: IncomingMessage;
    readonly response: ServerResponse;
    readonly result: Promise<boolean>;
  };
  const requests = new WeakMap<IncomingMessage, Pending>();
  const responses = new WeakMap<ServerResponse, Pending>();
  return Object.freeze({
    ...flags,
    configuration: Object.freeze({
      modelVersion: WORLD_MODEL_VERSION,
      endpointPins: read.endpointPins,
      admittedWorldPins: read.admittedWorldPins,
      allowedOrigins: read.routeOptions.allowedOrigins,
    }),
    handle(request: IncomingMessage, response: ServerResponse) {
      const pending = requests.get(request) ?? responses.get(response);
      if (pending) {
        if (pending.request !== request || pending.response !== response)
          fail('RUNTIME_API_REQUEST_RESPONSE_MISMATCH');
        return pending.result;
      }
      const route =
        request.url === undefined ? undefined : routes.get(request.url);
      if (!route) return Promise.resolve(false);
      const result = route(request, response);
      const owned = { request, response, result };
      requests.set(request, owned);
      responses.set(response, owned);
      return result;
    },
  });
}
