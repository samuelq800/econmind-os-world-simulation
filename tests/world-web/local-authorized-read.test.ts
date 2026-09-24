import { createElement } from '../../apps/world-web/node_modules/react';
import { renderToStaticMarkup } from '../../apps/world-web/node_modules/react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type {
  AuthorizedBrowserIdentity,
  BrowserReadResult,
} from '../../apps/world-web/src/authorized-client/client.js';
import { LocalAuthorizedReadEntry } from '../../apps/world-web/src/prototype/LocalAuthorizedReadEntry.js';
import { PrototypeApp } from '../../apps/world-web/src/prototype/App.js';
import { createLocalAuthorizedReadController } from '../../apps/world-web/src/prototype/local-authorized-read.js';

const identity: AuthorizedBrowserIdentity = {
  worldId: 'WORLD_TEST',
  countryId: 'COUNTRY_NORTH',
  officeId: 'FINANCE',
  scopeKey: 'SCOPE_TEST',
  authSubjectId: 'subject-1',
  authorizationRevision: 'revision-1',
  modelVersion: 'model-1',
  projectionVersion: 'projection-1',
  classification: 'OFFICE_PRIVATE',
};

const projection: BrowserReadResult = {
  status: 'PROJECTION',
  source: 'DERIVED_SERVER_PROJECTION',
  worldVersion: '42',
  snapshotRef: 'projection:42:7',
  payload: { schemaVersion: 'not-a-g02-payload' },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

describe('explicit local authorized read entry', () => {
  it('does not create the F client or read before opt-in', async () => {
    const createClient = vi.fn(() => ({
      readProjection: vi.fn(async () => projection),
    }));
    const controller = createLocalAuthorizedReadController(
      {
        currentIdentity: identity,
        getAccessToken: async () => 'token',
        bridgeOrigin: 'http://127.0.0.1:4102',
      },
      createClient,
      () => '123e4567-e89b-42d3-a456-426614174000',
    );
    expect(controller.getSnapshot()).toMatchObject({
      phase: 'IDLE',
      connected: false,
      read: null,
    });
    expect(createClient).not.toHaveBeenCalled();
    await controller.readProjection();
    expect(createClient).toHaveBeenCalledOnce();
    expect(createClient.mock.calls[0]?.[0].bridge?.origin).toBe(
      'http://127.0.0.1:4102',
    );
    expect(controller.getSnapshot().phase).toBe('READ_RETURNED');
  });

  it('clears values at load, disconnect and identity change; late reads cannot restore them', async () => {
    const first = deferred<BrowserReadResult>();
    const second = deferred<BrowserReadResult>();
    const revokeAuthorization = vi.fn();
    const readProjection = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const controller = createLocalAuthorizedReadController(
      {
        currentIdentity: identity,
        getAccessToken: async () => 'token',
        bridgeOrigin: 'http://127.0.0.1:4102',
      },
      () => ({ readProjection, cache: { revokeAuthorization } }),
      () => '123e4567-e89b-42d3-a456-426614174000',
    );
    const firstRead = controller.readProjection();
    expect(controller.getSnapshot()).toMatchObject({
      phase: 'LOADING',
      read: null,
    });
    controller.disconnect();
    first.resolve(projection);
    await firstRead;
    expect(controller.getSnapshot()).toMatchObject({
      phase: 'IDLE',
      connected: false,
      read: null,
    });
    expect(revokeAuthorization).toHaveBeenCalled();

    const nextRead = controller.readProjection();
    controller.setIdentity({
      ...identity,
      authorizationRevision: 'revision-2',
    });
    expect(controller.getSnapshot()).toMatchObject({
      phase: 'UNAVAILABLE',
      read: null,
    });
    second.resolve(projection);
    await nextRead;
    expect(controller.getSnapshot().read).toBeNull();
  });

  it('clears a returned projection when an UNKNOWN outcome is reported', async () => {
    const revokeAuthorization = vi.fn();
    const controller = createLocalAuthorizedReadController(
      {
        currentIdentity: identity,
        getAccessToken: async () => 'token',
        bridgeOrigin: 'http://127.0.0.1:4102',
      },
      () => ({
        readProjection: async () => projection,
        cache: { revokeAuthorization },
      }),
      () => '123e4567-e89b-42d3-a456-426614174000',
    );
    await controller.readProjection();
    expect(controller.getSnapshot().read?.result.status).toBe('PROJECTION');
    controller.invalidate('Command outcome unknown.');
    expect(controller.getSnapshot()).toMatchObject({
      phase: 'UNAVAILABLE',
      read: null,
    });
    expect(revokeAuthorization).toHaveBeenCalledOnce();
  });

  it('rejects a non-loopback bridge without asking for a token', async () => {
    const getAccessToken = vi.fn(async () => 'token');
    const controller = createLocalAuthorizedReadController({
      currentIdentity: identity,
      getAccessToken,
      bridgeOrigin: 'https://example.com',
    });
    await controller.readProjection();
    expect(controller.getSnapshot()).toMatchObject({
      phase: 'UNAVAILABLE',
      read: { result: { status: 'UNAVAILABLE' } },
    });
    expect(getAccessToken).not.toHaveBeenCalled();
  });

  it('renders an opt-in control and unavailable G02 before any read', () => {
    const markup = renderToStaticMarkup(
      createElement(LocalAuthorizedReadEntry, {
        config: {
          currentIdentity: identity,
          getAccessToken: async () => 'token',
          bridgeOrigin: 'http://127.0.0.1:4102',
        },
      }),
    );
    expect(markup).toContain('Connect &amp; read');
    expect(markup).toContain('AUTHORIZED VIEW UNAVAILABLE');
    expect(markup).not.toContain('LOCAL FIXTURE VIEW');
    expect(markup).not.toContain('128k');
  });

  it('keeps the default prototype on LOCAL_FIXTURE without a connection control', () => {
    const markup = renderToStaticMarkup(createElement(PrototypeApp));
    expect(markup).toContain('PREPARATION ONLY · NOT RUNTIME');
    expect(markup).not.toContain('Connect &amp; read');
  });
});
