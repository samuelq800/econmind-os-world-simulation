/** TEST_ONLY diagnostic output. This is not Core canonical serialization, a
 * receipt constructor, a source hash input, or authority for an admission.
 * Preserve exact domain time and PostgreSQL bigint values without Number. */
import { isSimTime } from '@econmind/core';

export function serializePostwarSocialPrefixEvidence(value: unknown): string {
  const json = JSON.stringify(
    value,
    (_key, item: unknown) =>
      isSimTime(item)
        ? item.toCanonicalValue()
        : typeof item === 'bigint'
          ? item.toString()
          : item,
    2,
  );
  if (json === undefined)
    throw Error('POSTWAR_SOCIAL_PREFIX_EVIDENCE_JSON_REQUIRED');
  return json + '\n';
}
