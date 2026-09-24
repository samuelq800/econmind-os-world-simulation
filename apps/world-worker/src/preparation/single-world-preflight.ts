import { createHash } from 'node:crypto';

import {
  prepareSingleWorldWorkerPreflight,
  type SingleWorldPreflightInput,
  type SingleWorldPreflightResult,
} from '@econmind/core';

export type WorkerSingleWorldPreflightInput = Omit<
  SingleWorldPreflightInput,
  'sha256Hex'
>;

/** Worker-owned diagnostic composition; never called from the live runtime. */
export function inspectSingleWorldWorkerPreparation(
  input: WorkerSingleWorldPreflightInput,
): Readonly<SingleWorldPreflightResult> {
  return prepareSingleWorldWorkerPreflight({
    ...input,
    sha256Hex: (preimage: string) =>
      createHash('sha256').update(preimage, 'utf8').digest('hex'),
  });
}
