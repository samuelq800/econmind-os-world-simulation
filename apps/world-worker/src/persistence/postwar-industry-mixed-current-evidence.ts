/** Server-only DATA bridge. A live snapshot and genuine Core cumulative proof
 * remain mandatory; the final page is a byte binding, never the whole history. */
import { createHash } from 'node:crypto';
import {
  readFinanceNativeBudgetMixedPrefix,
  type FinanceNativeBudgetMixedPrefixEvidence,
  type FinanceNativeBudgetCanonicalFrame,
} from '@econmind/core/finance-budget-native';
import {
  consumePostwarMixedCurrentProjectionSnapshotFrom,
  type PostwarMixedCurrentProjectionSnapshot,
  type PostwarMixedCurrentProjectionFacts,
} from './postwar-mixed-current-projection-publication.js';
import {
  isPostwarSocialRuntimeConnection,
  readPostwarSocialRuntimeFinancialReplayBase,
  type PostwarSocialRuntimeConnection,
} from '../runtime-preparation/social-runtime-connection.js';
import { consumePreparedPostwarSocialFinancialReplayBase } from './prepared-postwar-social-source.js';
import { replayPreparedPostwarFinanceSocialFxFrom } from './prepared-postwar-finance-social-fx-replay.js';
import type { SqlExecutor } from './sql-database.js';
export interface PostwarIndustryCurrentEvidence {
  readonly facts: Readonly<PostwarMixedCurrentProjectionFacts>;
  readonly evidence: FinanceNativeBudgetMixedPrefixEvidence;
  /** Full frames for BOUNDED; final-page bytes only for a genuine PAGED
   * cumulative fold. This name must not imply these bytes cover all history. */
  readonly evidenceFrames: readonly FinanceNativeBudgetCanonicalFrame[];
}
export async function readPostwarIndustryMixedCurrentEvidenceFrom(
  tx: SqlExecutor,
  token: PostwarMixedCurrentProjectionSnapshot,
  social: Readonly<PostwarSocialRuntimeConnection>,
): Promise<Readonly<PostwarIndustryCurrentEvidence>> {
  const f = consumePostwarMixedCurrentProjectionSnapshotFrom(tx, token);
  if (!isPostwarSocialRuntimeConnection(social, f.head.worldId))
    throw Error('INDUSTRY_GENUINE_SOCIAL_SOURCE_REQUIRED');
  const baseline = readPostwarSocialRuntimeFinancialReplayBase(
      social,
      f.head.worldId,
    ),
    b = consumePreparedPostwarSocialFinancialReplayBase(baseline);
  if (
    f.document !== b.document ||
    f.seedPins.worldId !== f.head.worldId ||
    f.seedPins.seedId !== b.pins.seedRef ||
    f.seedPins.seedFingerprint !== b.pins.contentHash ||
    f.seedPins.admissionRef !== b.pins.admissionRef
  )
    throw Error('INDUSTRY_SAME_HELD_ORIGINAL_REQUIRED');
  let evidence: FinanceNativeBudgetMixedPrefixEvidence,
    evidenceFrames: readonly FinanceNativeBudgetCanonicalFrame[];
  if (f.frames === null) {
    const view = f.pagedReplay;
    if (
      f.historyMode !== 'PAGED_COMPLETE_V1' ||
      !view ||
      !view.complete ||
      view.worldId !== f.head.worldId ||
      view.seedFingerprint !== f.seedPins.seedFingerprint ||
      view.head.worldVersion !== f.head.worldVersion ||
      view.head.eventSequence !== f.head.eventSequence ||
      view.expectedHead.worldVersion !== f.head.worldVersion ||
      view.expectedHead.eventSequence !== f.head.eventSequence ||
      view.frameCount !== f.head.worldVersion ||
      !f.coverage.pageProof
    )
      throw Error('INDUSTRY_GENUINE_COMPLETE_PAGED_REPLAY_REQUIRED');
    evidence = view.lastPage.evidence;
    evidenceFrames = view.lastPage.frames;
  } else {
    if (f.historyMode !== 'BOUNDED_COMPLETE_V1')
      throw Error('INDUSTRY_EXACT_HISTORY_PROFILE_REQUIRED');
    const replay = await replayPreparedPostwarFinanceSocialFxFrom({
      executor: tx,
      baseline,
      worldId: f.head.worldId,
      hostCountryId: f.countryId,
      officeId: 'SOCIAL',
      seedId: f.seedPins.seedId,
      seedFingerprint: f.seedPins.seedFingerprint,
      admissionRef: f.seedPins.admissionRef,
      frames: f.frames,
      expectedHead: f.head,
    });
    evidence = replay.mixedPrefixEvidence;
    evidenceFrames = f.frames;
  }
  const current = readFinanceNativeBudgetMixedPrefix(
    evidence,
    f.head.worldId,
    evidenceFrames,
    (s) => createHash('sha256').update(s).digest('hex'),
  );
  if (
    current.budgetState.worldVersion !== f.head.worldVersion ||
    current.budgetState.eventSequence !== f.head.eventSequence
  )
    throw Error('INDUSTRY_COMPLETE_CURRENT_CORE_HEAD_REQUIRED');
  return Object.freeze({ facts: f, evidence, evidenceFrames });
}
