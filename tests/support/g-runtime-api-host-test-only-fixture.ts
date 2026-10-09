import { WORLD_MODEL_VERSION } from '@econmind/core';
import { AUTHENTICATED_FINANCIAL_INTAKE_PATH } from '@econmind/core/authenticated-financial-intake-contract';
import { AUTHENTICATED_OFFICE_COMMAND_PATH } from '@econmind/core/authenticated-office-command-contract';
import type { NonactivatedRuntimeApiHostInput } from '../../apps/world-api/src/integration/nonactivated-runtime-api-host.js';
import { officeRouteTestOnlyFixture } from './g-office-route-test-only-fixture.js';
import {
  classifiedActivityWireFixture,
  classifiedOfficeScope,
} from './classified-activity-wire-fixture.js';

export const G_HOST_TEST_ORIGIN = 'https://browser-test-only.example.invalid';
/** Complete existing signed JWT/current SQL/private source+runtime builder.
 * This additional disposable SQL wire projection is TEST_ONLY, not genesis,
 * official adoption or a mocked positive query/handler/ready callback. */
export async function runtimeApiHostTestOnlyFixture() {
  const f = await officeRouteTestOnlyFixture();
  // TEST_ONLY clock owner supplies an immutable method port with unchanged
  // private runtime identity; server time remains live in its original closure.
  Object.freeze(f.config.clock);
  await f.admin('update world_v2.read_projection set payload=$1', [
    JSON.stringify(
      classifiedActivityWireFixture(f.request.countryId, f.request.officeId),
    ),
  ]);
  const endpointPins = {
    origin: 'https://api-test-only.example.invalid',
    projectionPath: '/v1/world-read',
    finalLookupPath: '/v1/world-final',
    deploymentRef: 'DEPLOYMENT_TEST_ONLY',
  };
  const input: NonactivatedRuntimeApiHostInput = {
    modelVersion: WORLD_MODEL_VERSION,
    read: {
      pool: f.config.readPool,
      readerRole: f.config.readerRole,
      authorizationPublisherRole: f.config.authorizationPublisherRole,
      admittedWorldPins: { ...f.config.admittedWorldPins },
      endpointPins,
      auth: { ...f.config.auth },
      routeOptions: { allowedOrigins: [G_HOST_TEST_ORIGIN] },
    },
    financial: {
      path: AUTHENTICATED_FINANCIAL_INTAKE_PATH,
      allowedOrigins: [G_HOST_TEST_ORIGIN],
      composition: {
        ...f.config,
        admittedWorldPins: { ...f.config.admittedWorldPins },
        auth: { ...f.config.auth },
      },
    },
    office: {
      path: AUTHENTICATED_OFFICE_COMMAND_PATH,
      allowedOrigins: [G_HOST_TEST_ORIGIN],
      composition: {
        ...f.config,
        admittedWorldPins: { ...f.config.admittedWorldPins },
        auth: { ...f.config.auth },
        runtime: f.runtime,
      },
    },
  };
  const readRequest = {
    schemaVersion: 'world-read-api-v1',
    operation: 'READ_WORLD_PROJECTION',
    requestId: '33333333-3333-4333-8333-333333333333',
    payload: {
      worldId: f.request.worldId,
      classification: 'OFFICE_PRIVATE',
      scopeKey: classifiedOfficeScope(f.request.countryId, f.request.officeId),
    },
  };
  return { ...f, input, readRequest };
}
