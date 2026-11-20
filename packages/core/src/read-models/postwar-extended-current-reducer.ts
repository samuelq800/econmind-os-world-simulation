/** DATA wire discriminator. Full ordered frames (including actual inventory
 * postings) remain bound by prefixFingerprint; this is never replay authority. */
export const POSTWAR_EXTENDED_CURRENT_REDUCER =
  'POSTWAR_FINANCE_SOCIAL_FX_CAPTAIN_GOODS_OMO_COMPLETE_PREFIX_V2' as const;

export const POSTWAR_RENT_CURRENT_REDUCER =
  'POSTWAR_FINANCE_SOCIAL_FX_CAPTAIN_GOODS_OMO_RENT_COMPLETE_PREFIX_V3' as const;

/** Distinct from the old monolithic-array fingerprints. */
export const POSTWAR_PAGED_CURRENT_REDUCER =
  'POSTWAR_COMPLETE_MIXED_PAGED_PREFIX_V1' as const;
export const POSTWAR_PAGED_PROOF_ALGORITHM =
  'COMPLETE_CANONICAL_PAGE_CHAINS_SHA256_V1' as const;
export interface PostwarCurrentPageProof {
  readonly schemaVersion: 'postwar-complete-page-proof-v1';
  readonly hashAlgorithm: typeof POSTWAR_PAGED_PROOF_ALGORITHM;
  readonly pageCount: string;
  readonly frameCount: string;
}
/** Wire shape only; neither a parsed hash nor a page count is replay authority. */
export function parsePostwarCurrentPageProof(
  value: unknown,
  head: { readonly worldVersion: string; readonly eventSequence: string },
): Readonly<PostwarCurrentPageProof> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('POSTWAR_PAGED_CURRENT_PROOF_REQUIRED');
  const p = value as Record<string, unknown>;
  const uint = (s: unknown): s is string =>
    typeof s === 'string' && /^(0|[1-9][0-9]*)$/u.test(s);
  if (
    Object.keys(p).sort().join(',') !==
      'frameCount,hashAlgorithm,pageCount,schemaVersion' ||
    p.schemaVersion !== 'postwar-complete-page-proof-v1' ||
    p.hashAlgorithm !== POSTWAR_PAGED_PROOF_ALGORITHM ||
    !uint(p.pageCount) ||
    !uint(p.frameCount) ||
    !uint(head.worldVersion) ||
    !uint(head.eventSequence) ||
    p.frameCount !== head.worldVersion ||
    BigInt(p.pageCount) < 1n ||
    (head.worldVersion === '0'
      ? p.pageCount !== '1' || head.eventSequence !== '0'
      : BigInt(p.pageCount) > BigInt(head.worldVersion)) ||
    BigInt(head.eventSequence) > BigInt(p.pageCount) * 256n
  )
    throw Error('POSTWAR_EXACT_COMPLETE_PAGE_PROOF_REQUIRED');
  return Object.freeze({
    ...p,
  }) as unknown as Readonly<PostwarCurrentPageProof>;
}
