import type { PrototypeFinalReceipt } from './contracts.js';

import './command-lifecycle.css';

type LifecycleSource = 'LOCAL_FIXTURE' | 'AUTHORIZED_READ_MODEL';

interface LifecycleBase {
  readonly source: LifecycleSource;
}

export type CommandLifecycleState = LifecycleBase &
  (
    | { readonly kind: 'UNAVAILABLE'; readonly reason: string }
    | { readonly kind: 'APPROVAL_REQUIRED'; readonly reason: string }
    | {
        readonly kind: 'AWAITING_APPROVAL';
        readonly approvalRequestId: string;
      }
    | {
        readonly kind: 'SUBMITTED_AWAITING_FINAL_RECEIPT';
        readonly commandId: string;
      }
    | { readonly kind: 'SENDING_UNCONFIRMED'; readonly commandId: string }
    | { readonly kind: 'UNKNOWN_OUTCOME'; readonly commandId: string }
    | {
        readonly kind: 'SUCCEEDED';
        readonly receipt: {
          readonly outcome: 'COMMITTED';
          readonly commandId: string;
          readonly worldVersionAfter: string | null;
          readonly eventIds?: readonly string[];
        };
      }
    | {
        readonly kind: 'REJECTED';
        readonly receipt: {
          readonly outcome: 'REJECTED';
          readonly commandId: string;
          readonly reasonCode: string | null;
        };
      }
    | {
        readonly kind: 'VERSION_CONFLICT';
        readonly expectedWorldVersion: string;
        readonly observedWorldVersion: string | null;
      }
    | { readonly kind: 'AUTHORIZATION_REVOKED'; readonly reason: string }
  );

export interface CommandLifecycleCopy {
  readonly title: string;
  readonly detail: string;
  readonly nextStep: string;
  readonly tone: 'neutral' | 'pending' | 'success' | 'danger';
  readonly liveRegion: 'status' | 'alert';
  readonly referenceLabel: string | null;
  readonly referenceValue: string | null;
}

/** Presentation only. The caller must verify an authorized source upstream. */
export function commandLifecycleCopy(
  state: CommandLifecycleState,
): CommandLifecycleCopy {
  switch (state.kind) {
    case 'UNAVAILABLE':
      return {
        title: 'Command unavailable',
        detail: state.reason,
        nextStep:
          state.source === 'LOCAL_FIXTURE'
            ? 'No live Command can be sent from this page.'
            : 'No Command can be sent from this page.',
        tone: 'neutral',
        liveRegion: 'status',
        referenceLabel: null,
        referenceValue: null,
      };
    case 'APPROVAL_REQUIRED':
      return {
        title: 'Approval required',
        detail: state.reason,
        nextStep: 'No approval request has been submitted here.',
        tone: 'pending',
        liveRegion: 'status',
        referenceLabel: null,
        referenceValue: null,
      };
    case 'AWAITING_APPROVAL':
      return {
        title:
          state.source === 'LOCAL_FIXTURE'
            ? 'Rehearsal · awaiting approval'
            : 'Awaiting approval',
        detail: 'The owning Office has not returned a decision.',
        nextStep: 'Wait for the decision; do not treat this as execution.',
        tone: 'pending',
        liveRegion: 'status',
        referenceLabel: 'Approval request',
        referenceValue: state.approvalRequestId,
      };
    case 'SUBMITTED_AWAITING_FINAL_RECEIPT':
      return {
        title:
          state.source === 'LOCAL_FIXTURE'
            ? 'Rehearsal · awaiting final receipt'
            : 'Submitted · awaiting final receipt',
        detail: 'Submission is not a final outcome.',
        nextStep: 'Look up this Command ID; do not resubmit automatically.',
        tone: 'pending',
        liveRegion: 'status',
        referenceLabel: 'Command ID',
        referenceValue: state.commandId,
      };
    case 'SENDING_UNCONFIRMED':
      return {
        title: 'Sending · not confirmed',
        detail: 'The browser has not received a final response.',
        nextStep: 'Keep this Command ID. Do not send another command.',
        tone: 'pending',
        liveRegion: 'status',
        referenceLabel: 'Command ID',
        referenceValue: state.commandId,
      };
    case 'UNKNOWN_OUTCOME':
      return {
        title: 'Outcome unknown',
        detail:
          'The submission response was lost or cannot establish a final result.',
        nextStep:
          'Look up the original Command ID. Do not send a new Command automatically.',
        tone: 'danger',
        liveRegion: 'alert',
        referenceLabel: 'Command ID',
        referenceValue: state.commandId,
      };
    case 'SUCCEEDED':
      return {
        title:
          state.source === 'LOCAL_FIXTURE'
            ? 'Rehearsal receipt · succeeded'
            : 'Final receipt · succeeded',
        detail:
          state.source === 'LOCAL_FIXTURE'
            ? 'Fixture result only. No World State changed.'
            : `Final receipt at World v${state.receipt.worldVersionAfter ?? 'not supplied'}. Inspect the refreshed projection for effects.`,
        nextStep: 'Review the receipt before planning another action.',
        tone: 'success',
        liveRegion: 'status',
        referenceLabel: 'Command ID',
        referenceValue: state.receipt.commandId,
      };
    case 'REJECTED':
      return {
        title:
          state.source === 'LOCAL_FIXTURE'
            ? 'Rehearsal receipt · rejected'
            : 'Final receipt · rejected',
        detail:
          state.source === 'LOCAL_FIXTURE'
            ? 'Fixture result only. No World State changed.'
            : `No success is implied. Reason: ${state.receipt.reasonCode ?? 'not supplied'}.`,
        nextStep: 'Review the reason and rebuild the draft if permitted.',
        tone: 'danger',
        liveRegion: 'alert',
        referenceLabel: 'Command ID',
        referenceValue: state.receipt.commandId,
      };
    case 'VERSION_CONFLICT':
      return {
        title:
          state.source === 'LOCAL_FIXTURE'
            ? 'Rehearsal version conflict'
            : 'World version conflict',
        detail: `Expected v${state.expectedWorldVersion}; current version ${state.observedWorldVersion ? `v${state.observedWorldVersion}` : 'not supplied'}.`,
        nextStep: 'Refresh the authorized view and rebuild the draft.',
        tone: 'danger',
        liveRegion: 'alert',
        referenceLabel: null,
        referenceValue: null,
      };
    case 'AUTHORIZATION_REVOKED':
      return {
        title:
          state.source === 'LOCAL_FIXTURE'
            ? 'Rehearsal access revoked'
            : 'Office access revoked',
        detail: state.reason,
        nextStep: 'Stop; refresh Office authorization before acting.',
        tone: 'danger',
        liveRegion: 'alert',
        referenceLabel: null,
        referenceValue: null,
      };
  }
}

export function fixtureLifecycleFromReceipt(
  receipt: PrototypeFinalReceipt,
): CommandLifecycleState {
  if (receipt.outcome === 'COMMITTED') {
    return {
      source: 'LOCAL_FIXTURE',
      kind: 'SUCCEEDED',
      receipt: {
        outcome: 'COMMITTED',
        commandId: receipt.commandId,
        worldVersionAfter: receipt.worldVersionAfter,
      },
    };
  }
  if (receipt.outcome === 'REJECTED') {
    return {
      source: 'LOCAL_FIXTURE',
      kind: 'REJECTED',
      receipt: {
        outcome: 'REJECTED',
        commandId: receipt.commandId,
        reasonCode: receipt.reasonCode,
      },
    };
  }
  return {
    source: 'LOCAL_FIXTURE',
    kind: 'AUTHORIZATION_REVOKED',
    reason: receipt.reasonCode ?? 'The fixture authorization was revoked.',
  };
}

export function CommandLifecycleStatus({
  context,
  state,
  compact = false,
}: {
  readonly context: string;
  readonly state: CommandLifecycleState;
  readonly compact?: boolean;
}) {
  const copy = commandLifecycleCopy(state);
  return (
    <section
      className={`command-lifecycle command-lifecycle--${copy.tone}${compact ? ' command-lifecycle--compact' : ''}`}
      aria-label={`${context} Command status`}
      role={copy.liveRegion}
      aria-live={copy.liveRegion === 'alert' ? 'assertive' : 'polite'}
      data-phase={state.kind}
      data-source={state.source}
    >
      <div className="command-lifecycle__core">
        <span className="command-lifecycle__source">
          {state.source === 'LOCAL_FIXTURE'
            ? 'LOCAL REHEARSAL · NOT ACTUAL'
            : 'AUTHORIZED READ MODEL · DISPLAY ONLY'}
        </span>
        <strong>{copy.title}</strong>
        <p>{copy.detail}</p>
      </div>
      <div className="command-lifecycle__next">
        {copy.referenceLabel && copy.referenceValue ? (
          <small>
            {copy.referenceLabel} · <code>{copy.referenceValue}</code>
          </small>
        ) : null}
        <span>{copy.nextStep}</span>
      </div>
    </section>
  );
}
