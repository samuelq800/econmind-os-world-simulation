/** Bounded provenance over genuinely Core-verified pages. This DATA proof is
 * never admission, source custody, actor authority or a commit capability. */
import { createHash } from 'node:crypto';
import {
  canonicalHashInput,
  canonicalSha256,
  canonicalSerialize,
} from '@econmind/core';
import {
  readFinanceSocialReplayContinuation,
  type FinanceSocialReplayContinuation,
  type FinanceSocialReplayHead,
} from '@econmind/core/finance-social-replay-continuation';
const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const hash = (v: unknown) => canonicalSha256(canonicalHashInput(v), sha);
export const POSTWAR_PAGED_PROOF_ALGORITHM =
  'COMPLETE_CANONICAL_PAGE_CHAINS_SHA256_V1' as const;
export interface PostwarCurrentPageProof {
  readonly schemaVersion: 'postwar-complete-page-proof-v1';
  readonly hashAlgorithm: typeof POSTWAR_PAGED_PROOF_ALGORITHM;
  readonly pageCount: string;
  readonly frameCount: string;
}
export interface PostwarPagedCurrentCoverage {
  readonly prefixFingerprint: string;
  readonly knownEffectsFingerprint: string;
  readonly coveredThroughEventId: string | null;
  readonly coveredThroughEventFingerprint: string | null;
  readonly financialPostingCount: string;
  readonly financialBatchCount: string;
  readonly financialPostingsFingerprint: string;
  readonly pageProof: Readonly<PostwarCurrentPageProof>;
}
declare const proofBrand: unique symbol;
export interface PostwarPagedCurrentProof {
  readonly [proofBrand]: true;
}
interface Facts {
  readonly worldId: string;
  readonly seedFingerprint: string;
  readonly expectedHead: Readonly<FinanceSocialReplayHead>;
  readonly head: Readonly<FinanceSocialReplayHead>;
  readonly prefix: string;
  readonly effects: string;
  readonly journal: string;
  readonly pages: bigint;
  readonly frames: bigint;
  readonly legs: bigint;
  readonly batches: bigint;
  readonly lastEventId: string | null;
  readonly lastEventFingerprint: string | null;
  readonly complete: boolean;
  readonly lastSocialCommandTypes: Readonly<Record<string, string>>;
}
const proofs = new WeakMap<object, Readonly<Facts>>();
function invalid(s: string): never {
  throw Error('POSTWAR_PAGED_CURRENT_PROOF:' + s);
}
function issue(f: Readonly<Facts>): PostwarPagedCurrentProof {
  const t = Object.freeze({}) as PostwarPagedCurrentProof;
  proofs.set(t, Object.freeze(f));
  return t;
}
function facts(t: PostwarPagedCurrentProof) {
  const f = proofs.get(t);
  if (!f) invalid('GENUINE_LIVE_DATA_PROOF_REQUIRED');
  return f;
}
export function createPostwarPagedCurrentProof(
  continuation: FinanceSocialReplayContinuation,
): PostwarPagedCurrentProof {
  const c = readFinanceSocialReplayContinuation(continuation);
  if (
    c.pageCount !== '0' ||
    c.frameCount !== '0' ||
    c.head.worldVersion !== '0' ||
    c.head.eventSequence !== '0'
  )
    invalid('GENUINE_OPENING_CONTINUATION_REQUIRED');
  const origin = {
    worldId: c.worldId,
    seedFingerprint: c.seedFingerprint,
    expectedHead: c.expectedHead,
  };
  return issue({
    ...origin,
    head: c.head,
    prefix: c.chainFingerprint,
    effects: hash({
      schemaVersion: 'postwar-effects-page-origin-v1',
      ...origin,
    }),
    journal: hash({
      schemaVersion: 'postwar-financial-page-origin-v1',
      ...origin,
    }),
    pages: 0n,
    frames: 0n,
    legs: 0n,
    batches: 0n,
    lastEventId: null,
    lastEventFingerprint: null,
    complete: false,
    lastSocialCommandTypes: Object.freeze({}),
  });
}
export function advancePostwarPagedCurrentProof(input: {
  readonly proof: PostwarPagedCurrentProof;
  readonly continuation: FinanceSocialReplayContinuation;
}): PostwarPagedCurrentProof {
  const p = facts(input.proof),
    c = readFinanceSocialReplayContinuation(input.continuation),
    frames = c.lastPage.frames;
  if (
    p.complete ||
    c.worldId !== p.worldId ||
    c.seedFingerprint !== p.seedFingerprint ||
    canonicalSerialize(c.expectedHead) !== canonicalSerialize(p.expectedHead) ||
    c.pageCount !== (p.pages + 1n).toString() ||
    c.frameCount !== (p.frames + BigInt(frames.length)).toString()
  )
    invalid('SAME_GENUINE_NEXT_CORE_PAGE_REQUIRED');
  const anchor = {
    worldId: p.worldId,
    seedFingerprint: p.seedFingerprint,
    fromHead: p.head,
    throughHead: c.head,
    expectedHead: p.expectedHead,
  };
  if (
    c.chainFingerprint !==
    hash({
      schemaVersion: 'finance-social-replay-page-chain-v1',
      previous: p.prefix,
      ...anchor,
      framesSha256: hash(frames),
    })
  )
    invalid('EXACT_CORE_PAGE_CHAIN_REQUIRED');
  const batches = frames.flatMap((f) => f.financialPostingBatches),
    effects = frames.map((f) => ({
      commandId: f.command.commandId,
      countryId: f.command.countryId,
      commandType: f.command.commandType,
      transitionFingerprint: hash(f.transition),
      receiptFingerprint: hash(f.receipt),
      eventFingerprints: f.events.map((e) => e.fingerprint),
      worldVersionBefore: f.transition.worldVersionBefore,
      worldVersionAfter: f.transition.worldVersionAfter,
      events: f.events.map((e) => ({
        eventId: e.eventId,
        fingerprint: e.fingerprint,
        sequence: e.sequence,
        worldVersion: e.worldVersion,
      })),
    }));
  let legCount = 0n;
  for (const raw of batches) {
    if (
      !raw ||
      typeof raw !== 'object' ||
      !Array.isArray((raw as { legs?: unknown }).legs)
    )
      invalid('ACTUAL_CORE_FINANCIAL_BATCH_REQUIRED');
    legCount += BigInt((raw as { legs: readonly unknown[] }).legs.length);
  }
  const lastSocial = { ...p.lastSocialCommandTypes };
  for (const f of frames)
    if (
      [
        'CORE_SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATE_V1',
        'CORE_SOCIAL_EMPLOYMENT_SERVICE_CREATE_V1',
        'CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1',
        'CORE_SOCIAL_JOB_MATCH_SETTLEMENT_V1',
      ].includes(f.command.commandType)
    )
      lastSocial[f.command.countryId] = f.command.commandType;
  const last = frames.at(-1)?.events.at(-1);
  const token = issue({
    ...p,
    head: c.head,
    prefix: c.chainFingerprint,
    effects: hash({
      schemaVersion: 'postwar-effects-page-chain-v1',
      previous: p.effects,
      ...anchor,
      effects,
    }),
    journal: hash({
      schemaVersion: 'postwar-financial-page-chain-v1',
      previous: p.journal,
      ...anchor,
      batches,
    }),
    pages: p.pages + 1n,
    frames: p.frames + BigInt(frames.length),
    legs: p.legs + legCount,
    batches: p.batches + BigInt(batches.length),
    lastEventId: last?.eventId ?? p.lastEventId,
    lastEventFingerprint: last?.fingerprint ?? p.lastEventFingerprint,
    complete: c.complete,
    lastSocialCommandTypes: Object.freeze(lastSocial),
  });
  proofs.delete(input.proof);
  return token;
}
/** The final Core handle may already be retired: these are checked DATA facts,
 * not a reusable actor or SQL permission. Incomplete proofs never read as ready. */
export function readPostwarPagedCurrentProof(
  proof: PostwarPagedCurrentProof,
): Readonly<{
  coverage: Readonly<PostwarPagedCurrentCoverage>;
  lastSocialCommandTypes: Readonly<Record<string, string>>;
}> {
  const f = facts(proof);
  if (
    !f.complete ||
    f.pages === 0n ||
    f.frames.toString() !== f.expectedHead.worldVersion
  )
    invalid('COMPLETE_GENUINE_CORE_PREFIX_REQUIRED');
  return Object.freeze({
    coverage: Object.freeze({
      prefixFingerprint: f.prefix,
      knownEffectsFingerprint: f.effects,
      coveredThroughEventId: f.lastEventId,
      coveredThroughEventFingerprint: f.lastEventFingerprint,
      financialPostingCount: f.legs.toString(),
      financialBatchCount: f.batches.toString(),
      financialPostingsFingerprint: f.journal,
      pageProof: Object.freeze({
        schemaVersion: 'postwar-complete-page-proof-v1',
        hashAlgorithm: POSTWAR_PAGED_PROOF_ALGORITHM,
        pageCount: f.pages.toString(),
        frameCount: f.frames.toString(),
      }),
    }),
    lastSocialCommandTypes: f.lastSocialCommandTypes,
  });
}
export function retirePostwarPagedCurrentProof(
  proof: PostwarPagedCurrentProof,
): void {
  proofs.delete(proof);
}
