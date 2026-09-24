import {
  createAuthorizedWorldBrowserClient,
  type AuthorizedBrowserIdentity,
  type BrowserReadResult,
} from '../authorized-client/client.js';
import {
  sameAuthorizedIdentity,
  type AuthorizedUiInjection,
} from './authorized-read-adapter.js';

export interface LocalAuthorizedReadConfig {
  /** Supplied by a trusted host; never read from a URL or browser storage here. */
  readonly currentIdentity: AuthorizedBrowserIdentity | null;
  readonly getAccessToken: () => Promise<string | null>;
  /** F validates that this is an explicit loopback HTTP origin. */
  readonly bridgeOrigin: string;
  readonly command?: AuthorizedUiInjection['command'];
}

export interface LocalReadSnapshot {
  readonly phase: 'IDLE' | 'LOADING' | 'READ_RETURNED' | 'UNAVAILABLE';
  readonly connected: boolean;
  readonly identity: AuthorizedBrowserIdentity | null;
  readonly read: AuthorizedUiInjection['read'];
  readonly reason: string | null;
}

type ReadPort = Pick<
  ReturnType<typeof createAuthorizedWorldBrowserClient>,
  'readProjection'
> & {
  readonly cache?: Pick<
    ReturnType<typeof createAuthorizedWorldBrowserClient>['cache'],
    'revokeAuthorization'
  >;
};
type ClientFactory = (
  options: Parameters<typeof createAuthorizedWorldBrowserClient>[0],
) => ReadPort;

/** Local, explicit-read session. It cannot submit a Command. */
export function createLocalAuthorizedReadController(
  config: Pick<
    LocalAuthorizedReadConfig,
    'currentIdentity' | 'getAccessToken' | 'bridgeOrigin'
  >,
  clientFactory: ClientFactory = createAuthorizedWorldBrowserClient,
  requestId: () => string = () => crypto.randomUUID(),
) {
  let identity = config.currentIdentity ? { ...config.currentIdentity } : null;
  let generation = 0;
  let client: ReadPort | null = null;
  let snapshot: LocalReadSnapshot = {
    phase: 'IDLE',
    connected: false,
    identity,
    read: null,
    reason: null,
  };
  const listeners = new Set<() => void>();

  const clearClient = () => {
    client?.cache?.revokeAuthorization();
    client = null;
  };

  const publish = (next: LocalReadSnapshot) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };

  const invalidate = (reason: string) => {
    generation += 1;
    clearClient();
    publish({
      phase: 'UNAVAILABLE',
      connected: snapshot.connected,
      identity,
      read: null,
      reason,
    });
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setIdentity(next: AuthorizedBrowserIdentity | null) {
      if (next === null && identity === null) return;
      if (next && sameAuthorizedIdentity(identity, next)) return;
      identity = next ? { ...next } : null;
      clearClient();
      generation += 1;
      publish({
        phase: 'UNAVAILABLE',
        connected: snapshot.connected,
        identity,
        read: null,
        reason: next
          ? 'Office identity changed. Read again.'
          : 'Office identity unavailable.',
      });
    },
    disconnect() {
      generation += 1;
      clearClient();
      publish({
        phase: 'IDLE',
        connected: false,
        identity,
        read: null,
        reason: null,
      });
    },
    invalidate,
    async readProjection() {
      if (snapshot.phase === 'LOADING') return;
      if (!identity) {
        invalidate('Office identity unavailable.');
        return;
      }
      const readIdentity = { ...identity };
      generation += 1;
      const activeGeneration = generation;
      client?.cache?.revokeAuthorization();
      publish({
        phase: 'LOADING',
        connected: true,
        identity: readIdentity,
        read: null,
        reason: null,
      });
      let result: BrowserReadResult;
      let activeClient: ReadPort | null = null;
      try {
        client ??= clientFactory({
          currentIdentity: () => identity,
          getAccessToken: config.getAccessToken,
          bridge: { origin: config.bridgeOrigin },
        });
        activeClient = client;
        result = await client.readProjection(requestId());
      } catch {
        result = { status: 'UNAVAILABLE', reason: 'INVALID_RESPONSE' };
      }
      if (
        activeGeneration !== generation ||
        !snapshot.connected ||
        !sameAuthorizedIdentity(identity, readIdentity)
      ) {
        activeClient?.cache?.revokeAuthorization();
        return;
      }
      if (result.status !== 'PROJECTION') clearClient();
      publish({
        phase: result.status === 'PROJECTION' ? 'READ_RETURNED' : 'UNAVAILABLE',
        connected: true,
        identity: readIdentity,
        read: { identity: readIdentity, result },
        reason:
          result.status === 'PROJECTION'
            ? null
            : `Read ${result.status.toLowerCase()}.`,
      });
    },
  };
}
