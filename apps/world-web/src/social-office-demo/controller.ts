import {
  parseSocialDemoRequest,
  type SocialDemoAction,
  type SocialDemoProjection,
  type SocialDemoReceipt,
  type SocialDemoRequest,
} from './contract.js';
import type { SocialDemoClient } from './client.js';

export interface SocialDemoScreenState {
  readonly phase:
    | 'CONNECTING'
    | 'READY'
    | 'SUBMITTING'
    | 'PENDING'
    | 'UNKNOWN'
    | 'FINAL'
    | 'ERROR';
  readonly projection: Readonly<SocialDemoProjection> | null;
  readonly pending: Readonly<SocialDemoRequest> | null;
  readonly receipt: Readonly<SocialDemoReceipt> | null;
  readonly message: string;
}
export interface SocialDemoPendingStore {
  read(): string | null;
  write(value: string): void;
  clear(): void;
}
export function createSocialDemoController(
  input: Readonly<{
    client: SocialDemoClient;
    render(state: Readonly<SocialDemoScreenState>): void;
    pendingStore: SocialDemoPendingStore;
    newRequestId(): string;
  }>,
) {
  let state: SocialDemoScreenState = {
    phase: 'CONNECTING',
    projection: null,
    pending: null,
    receipt: null,
    message: 'Connecting to the isolated demonstration…',
  };
  let busy = false,
    stopped = false;
  const emit = (next: Partial<SocialDemoScreenState>) => {
    if (!stopped) {
      state = Object.freeze({ ...state, ...next });
      input.render(state);
    }
  };
  const errorText = (e: unknown) =>
    e instanceof Error ? e.message : 'Demonstration read failed';
  async function refresh() {
    try {
      const projection = await input.client.projection();
      emit({ projection });
    } catch (error) {
      emit({ projection: null });
      throw error;
    }
  }
  async function accept(receipt: SocialDemoReceipt) {
    emit({ receipt });
    if (receipt.status === 'FINAL' || receipt.status === 'REJECTED') {
      // A storage failure must not turn a confirmed commit back into UNKNOWN.
      // A retained marker is safe: reload queries that same original receipt.
      try {
        input.pendingStore.clear();
      } catch {
        /* receipt remains authoritative for this controller */
      }
      emit({
        pending: null,
        phase: receipt.status === 'FINAL' ? 'FINAL' : 'ERROR',
        message:
          receipt.status === 'FINAL'
            ? 'Commit confirmed by its durable receipt. Reading the latest authorized view…'
            : receipt.message,
      });
      try {
        await refresh();
        emit({
          message:
            receipt.status === 'FINAL'
              ? `Commit confirmed · World version ${receipt.worldVersion}`
              : receipt.message,
        });
      } catch (e) {
        emit({
          message:
            receipt.status === 'FINAL'
              ? `Commit remains confirmed. The latest authorized view is unavailable: ${errorText(e)}`
              : receipt.message,
        });
      }
    } else
      emit({
        phase: receipt.status === 'QUEUED' ? 'PENDING' : 'UNKNOWN',
        message:
          receipt.status === 'QUEUED'
            ? 'Queued. Business completion is not yet confirmed.'
            : 'Outcome unknown. Looking up the original receipt without resubmitting.',
      });
  }
  return Object.freeze({
    async start() {
      if (busy || stopped) return;
      busy = true;
      try {
        await input.client.session();
        const raw = input.pendingStore.read();
        if (raw !== null) {
          const pending = parseSocialDemoRequest(JSON.parse(raw) as unknown);
          emit({
            pending,
            phase: 'UNKNOWN',
            message: 'Recovering the original request receipt…',
          });
          await accept(await input.client.receipt(pending.requestId));
        } else {
          await refresh();
          emit({ phase: 'READY', message: 'Current authorized view loaded.' });
        }
      } catch (e) {
        emit({
          projection: null,
          phase: state.pending ? 'UNKNOWN' : 'ERROR',
          message: errorText(e),
        });
      } finally {
        busy = false;
      }
    },
    async submit(action: SocialDemoAction) {
      if (
        busy ||
        stopped ||
        state.pending !== null ||
        !state.projection?.availableActions.includes(action)
      )
        return;
      busy = true;
      let pending: SocialDemoRequest | null = null,
        submitted = false;
      try {
        pending = parseSocialDemoRequest({
          requestId: input.newRequestId(),
          action,
          expectedWorldVersion: state.projection.worldVersion,
        });
        input.pendingStore.write(JSON.stringify(pending));
        emit({
          pending,
          receipt: null,
          phase: 'SUBMITTING',
          message:
            'Submitting the original request. Awaiting a durable result…',
        });
        submitted = true;
        await accept(await input.client.command(pending));
      } catch (e) {
        emit(
          submitted
            ? {
                projection: null,
                pending,
                phase: 'UNKNOWN',
                message: `${errorText(e)}. Looking up only the original request receipt.`,
              }
            : {
                projection: null,
                pending: null,
                phase: 'ERROR',
                message: errorText(e),
              },
        );
      } finally {
        busy = false;
      }
    },
    async poll() {
      if (busy || stopped) return;
      busy = true;
      try {
        if (state.pending)
          await accept(await input.client.receipt(state.pending.requestId));
        else await refresh();
      } catch (e) {
        emit({
          projection: null,
          phase: state.pending ? 'UNKNOWN' : 'ERROR',
          message: errorText(e),
        });
      } finally {
        busy = false;
      }
    },
    stop() {
      stopped = true;
    },
    snapshot() {
      return state;
    },
  });
}
