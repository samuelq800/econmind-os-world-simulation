/** Explicit operator entry over the existing sole FIFO consumer. This runner
 * issues no command, lease, source, approval or Clock change. A failed/blocked
 * step or unconfirmed derived publication stops consumption for recovery. */
import { setTimeout as delay } from 'node:timers/promises';
import type { PostwarOfficeNodeBootstrap } from './postwar-office-node-bootstrap.js';

type Step = Awaited<
  ReturnType<PostwarOfficeNodeBootstrap['consumer']['consumeOnce']>
>;
type ObservedStep = Pick<Step, 'status' | 'derivedPublication'> &
  Readonly<{ commandId?: string | null }>;
export type RegisteredConsumerObservation = Readonly<{
  event: 'REGISTERED_CONSUMER_STEP';
  status: Step['status'];
  commandId?: string | null;
  recoveryRequired: boolean;
}>;

export async function runRegisteredConsumer(input: {
  consumer: Readonly<{ consumeOnce(): Promise<ObservedStep> }>;
  signal: AbortSignal;
  report: (observation: RegisteredConsumerObservation) => void;
}): Promise<void> {
  while (!input.signal.aborted) {
    // Deliberately no retry of exceptions or FAILED/unknown commit outcomes.
    // The existing registered consumer owns all authorization and FIFO fencing.
    const step = await input.consumer.consumeOnce();
    const recoveryRequired =
      step.status === 'BLOCKED' ||
      step.status === 'FAILED' ||
      step.derivedPublication?.status === 'UNAVAILABLE';
    if (step.status !== 'IDLE')
      input.report({
        event: 'REGISTERED_CONSUMER_STEP',
        status: step.status,
        ...('commandId' in step ? { commandId: step.commandId } : {}),
        recoveryRequired,
      });
    if (recoveryRequired) throw Error('REGISTERED_CONSUMER_REQUIRES_RECOVERY');
    if (step.status === 'IDLE' && !input.signal.aborted) {
      try {
        await delay(250, undefined, { signal: input.signal });
      } catch (error) {
        if (!input.signal.aborted) throw error;
      }
    }
  }
}
