import { createHash } from 'node:crypto';

export function deterministicUnitInterval(
  seed: string,
  namespace: string,
): number {
  const digest = createHash('sha256')
    .update(`${seed}\u0000${namespace}`)
    .digest();
  const numerator = digest.readBigUInt64BE(0);
  return Number(numerator >> 11n) / 9_007_199_254_740_992;
}

export function deterministicCandidateOrder(
  seed: string,
  candidateIds: readonly string[],
): readonly string[] {
  return [...candidateIds].sort((left, right) => {
    const leftScore = createHash('sha256')
      .update(`${seed}\u0000${left}`)
      .digest('hex');
    const rightScore = createHash('sha256')
      .update(`${seed}\u0000${right}`)
      .digest('hex');
    return leftScore.localeCompare(rightScore) || left.localeCompare(right);
  });
}
