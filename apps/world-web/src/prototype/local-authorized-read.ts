import {
  createAuthorizedWorldBrowserClient,
  type AuthorizedBrowserIdentity,
  type BrowserCommandResult,
  type BrowserReadResult,
  type NarrowTransferDraft,
} from '../authorized-client/client.js';
import {
  resolveAuthorizedUi,
  sameAuthorizedIdentity,
  type AuthorizedUiInjection,
} from './authorized-read-adapter.js';

export interface LocalAuthorizedReadConfig {
  /** Supplied by a trusted host; never read from a URL or browser storage here. */
  readonly currentIdentity: AuthorizedBrowserIdentity | null;
  readonly getAccessToken: () => Promise<string | null>;
  /** F validates that this is an explicit loopback HTTP origin. */
  readonly bridgeOrigin: string;
  /** Trusted-host draft reference; the server must validate every term. */
  readonly narrowTransferDraft?: NarrowTransferDraft | null;
  readonly command?: AuthorizedUiInjection['command'];
}

export interface LocalReadSnapshot {
  readonly phase:
    | 'IDLE'
    | 'LOADING'
    | 'READ_RETURNED'
    | 'UNAVAILABLE'
    | 'SUBMITTING'
    | 'UNKNOWN'
    | 'FINAL_RECEIPT'
    | 'COMMAND_UNAVAILABLE';
  readonly connected: boolean;
  readonly identity: AuthorizedBrowserIdentity | null;
  readonly read: AuthorizedUiInjection['read'];
  readonly command: AuthorizedUiInjection['command'];
  readonly pendingCommandId: string | null;
  readonly lastSubmittedCommandId: string | null;
  readonly reason: string | null;
}

type ReadPort = Pick<
  ReturnType<typeof createAuthorizedWorldBrowserClient>,
  'readProjection'
> & {
  readonly submitNarrowTransfer?: ReturnType<
    typeof createAuthorizedWorldBrowserClient
  >['submitNarrowTransfer'];
  readonly cache?: Pick<
    ReturnType<typeof createAuthorizedWorldBrowserClient>['cache'],
    'revokeAuthorization'
  >;
};
type ClientFactory = (
  options: Parameters<typeof createAuthorizedWorldBrowserClient>[0],
) => ReadPort;

/** Explicit local browser session; only a host-supplied narrow draft can be sent. */
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
  let lastSubmittedCommandId: string | null = null;
  const submittedCommandIds = new Set<string>();
  let snapshot: LocalReadSnapshot = {
    phase: 'IDLE',
    connected: false,
    identity,
    read: null,
    command: null,
    pendingCommandId: null,
    lastSubmittedCommandId,
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
      command: snapshot.command,
      pendingCommandId: null,
      lastSubmittedCommandId,
      reason,
    });
  };

  return {
    getSnapshot: () => snapshot,
    wasSubmitted: (commandId: string) => submittedCommandIds.has(commandId),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setIdentity(next: AuthorizedBrowserIdentity | null) {
      if (next === null && identity === null) return;
      if (next && sameAuthorizedIdentity(identity, next)) return;
      identity = next ? { ...next } : null;
      lastSubmittedCommandId = null;
      clearClient();
      generation += 1;
      publish({
        phase: 'UNAVAILABLE',
        connected: snapshot.connected,
        identity,
        read: null,
        command: null,
        pendingCommandId: null,
        lastSubmittedCommandId,
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
        command: null,
        pendingCommandId: null,
        lastSubmittedCommandId,
        reason: null,
      });
    },
    invalidate,
    reconcileFinalReceipt(
      command: NonNullable<AuthorizedUiInjection['command']>,
    ) {
      if (
        snapshot.phase !== 'UNKNOWN' ||
        command.result.status !== 'FINAL_RECEIPT' ||
        command.commandId !== lastSubmittedCommandId ||
        !sameAuthorizedIdentity(identity, command.identity)
      )
        return false;
      const resolved = resolveAuthorizedUi({
        currentIdentity: identity,
        read: null,
        command,
      });
      if (
        !['SUCCEEDED', 'REJECTED', 'AUTHORIZATION_REVOKED'].includes(
          resolved.command.kind,
        )
      )
        return false;
      publish({
        phase: 'FINAL_RECEIPT',
        connected: snapshot.connected,
        identity,
        read: null,
        command,
        pendingCommandId: null,
        lastSubmittedCommandId,
        reason: 'Final receipt supplied. Refresh the projection.',
      });
      return true;
    },
    recordUnknown(command: NonNullable<AuthorizedUiInjection['command']>) {
      if (
        command.result.status !== 'UNKNOWN' ||
        (snapshot.phase === 'UNKNOWN' &&
          snapshot.command?.commandId === command.commandId) ||
        (snapshot.phase === 'FINAL_RECEIPT' &&
          snapshot.command?.commandId === command.commandId) ||
        !sameAuthorizedIdentity(identity, command.identity)
      )
        return;
      lastSubmittedCommandId = command.commandId;
      submittedCommandIds.add(command.commandId);
      generation += 1;
      clearClient();
      publish({
        phase: 'UNKNOWN',
        connected: snapshot.connected,
        identity,
        read: null,
        command,
        pendingCommandId: null,
        lastSubmittedCommandId,
        reason: 'Outcome unknown. Look up the original Command ID.',
      });
    },
    async readProjection() {
      if (['LOADING', 'SUBMITTING', 'UNKNOWN'].includes(snapshot.phase)) return;
      if (!identity) {
        invalidate('Office identity unavailable.');
        return;
      }
      const readIdentity = { ...identity };
      generation += 1;
      const activeGeneration = generation;
      publish({
        phase: 'LOADING',
        connected: true,
        identity: readIdentity,
        read: null,
        command: snapshot.command,
        pendingCommandId: null,
        lastSubmittedCommandId,
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
        command: snapshot.command,
        pendingCommandId: null,
        lastSubmittedCommandId,
        reason:
          result.status === 'PROJECTION'
            ? null
            : `Read ${result.status.toLowerCase()}.`,
      });
    },
    async submitNarrowTransfer(draft: NarrowTransferDraft) {
      if (
        !draft ||
        !identity ||
        !snapshot.connected ||
        snapshot.phase !== 'READ_RETURNED' ||
        !snapshot.read ||
        submittedCommandIds.has(draft.commandId)
      )
        return;
      const current = resolveAuthorizedUi({
        currentIdentity: identity,
        read: snapshot.read,
        command: null,
      });
      if (
        current.read.kind !== 'CURRENT' ||
        draft.expectedWorldVersion !== current.read.worldVersion ||
        !client?.submitNarrowTransfer
      )
        return;
      const commandIdentity = { ...identity };
      const activeClient = client;
      const submit = activeClient.submitNarrowTransfer;
      if (!submit) return;
      generation += 1;
      const activeGeneration = generation;
      lastSubmittedCommandId = draft.commandId;
      publish({
        phase: 'SUBMITTING',
        connected: true,
        identity: commandIdentity,
        read: null,
        command: null,
        pendingCommandId: draft.commandId,
        lastSubmittedCommandId,
        reason: null,
      });
      let result: BrowserCommandResult;
      try {
        result = await submit(requestId(), draft);
      } catch {
        // A thrown browser/transport error after dispatch is not proof of rejection.
        result = { status: 'UNKNOWN' };
      }
      if (
        activeGeneration !== generation ||
        !snapshot.connected ||
        !sameAuthorizedIdentity(identity, commandIdentity)
      ) {
        activeClient.cache?.revokeAuthorization();
        return;
      }
      let command = {
        identity: commandIdentity,
        commandId: draft.commandId,
        result,
      };
      if (result.status === 'FINAL_RECEIPT') {
        const verified = resolveAuthorizedUi({
          currentIdentity: identity,
          read: null,
          command,
        });
        if (
          !['SUCCEEDED', 'REJECTED', 'AUTHORIZATION_REVOKED'].includes(
            verified.command.kind,
          )
        ) {
          result = { status: 'UNKNOWN' };
          command = {
            identity: commandIdentity,
            commandId: draft.commandId,
            result,
          };
        }
      }
      const phase =
        result.status === 'FINAL_RECEIPT'
          ? 'FINAL_RECEIPT'
          : result.status === 'UNKNOWN'
            ? 'UNKNOWN'
            : 'COMMAND_UNAVAILABLE';
      if (result.status === 'FINAL_RECEIPT' || result.status === 'UNKNOWN') {
        submittedCommandIds.add(draft.commandId);
      }
      if (result.status !== 'FINAL_RECEIPT') clearClient();
      publish({
        phase,
        connected: true,
        identity: commandIdentity,
        read: null,
        command,
        pendingCommandId: null,
        lastSubmittedCommandId,
        reason:
          result.status === 'FINAL_RECEIPT'
            ? 'Final receipt supplied. Refresh the projection.'
            : result.status === 'UNKNOWN'
              ? 'Outcome unknown. Look up the original Command ID.'
              : `Command ${result.status.toLowerCase()}. Read again before acting.`,
      });
    },
  };
}
