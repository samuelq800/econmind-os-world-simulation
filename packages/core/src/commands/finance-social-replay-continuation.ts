/** Sequential complete-domain replay DATA. A continuation is neither source
 * admission nor a lease, actor authorization, currentness or commit capability. */
import { DomainError, DOMAIN_ERROR_CODES } from '../errors.js';
import {
  canonicalSerialize,
  canonicalHashInput,
} from '../serialization/canonical.js';
import { canonicalSha256, type Sha256Hex } from './command.js';
import {
  reconcileV08LedgerSnapshots,
  type RebuiltV08Ledgers,
} from '../opening/opening-seed.js';
import {
  prepareFinanceNativeBudgetFinancialReplay,
  prepareFinanceNativeBudgetMixedPrefix,
  continueFinanceNativeBudgetMixedPrefix,
  readFinanceNativeBudgetMixedPrefix,
  type FinanceNativeBudgetCanonicalFrame,
  type FinanceNativeBudgetMixedPrefixEvidence,
  type FinanceNativeBudgetMixedPrefixResult,
  type FinanceNativeBudgetMixedPrefixInput,
} from './finance-budget-native.js';

export interface FinanceSocialReplayHead {
  readonly worldVersion: string;
  readonly eventSequence: string;
}
export interface FinanceSocialReplayPage {
  readonly schemaVersion: 'finance-social-replay-page-v1';
  readonly worldId: string;
  readonly seedFingerprint: string;
  readonly fromHead: FinanceSocialReplayHead;
  readonly throughHead: FinanceSocialReplayHead;
  readonly expectedHead: FinanceSocialReplayHead;
  readonly frames: readonly FinanceNativeBudgetCanonicalFrame[];
  /** Exact full frames: command/events/transition/FINAL receipt/both journals. */
  readonly framesSha256: string;
}
declare const continuationBrand: unique symbol;
export interface FinanceSocialReplayContinuation {
  readonly [continuationBrand]: true;
}
export interface FinanceSocialReplayContinuationView {
  readonly classification: 'CORE_REPLAY_DATA_NOT_SOURCE_OR_COMMIT_AUTHORITY';
  readonly worldId: string;
  readonly seedFingerprint: string;
  readonly head: FinanceSocialReplayHead;
  readonly expectedHead: FinanceSocialReplayHead;
  readonly complete: boolean;
  readonly pageCount: string;
  readonly frameCount: string;
  readonly chainFingerprint: string;
  readonly result: Readonly<FinanceNativeBudgetMixedPrefixResult>;
  /** Last page only. Private evidence contains all preceding verified fold
   * state; old full-prefix constructors keep their existing H0-only contract. */
  readonly lastPage: Readonly<{
    evidence: FinanceNativeBudgetMixedPrefixEvidence;
    frames: readonly FinanceNativeBudgetCanonicalFrame[];
  }>;
}
export interface FinanceSocialReplayPageOriginals {
  readonly industryWorkSources?: FinanceNativeBudgetMixedPrefixInput['industryWorkSources'];
  readonly industryWageSources?: FinanceNativeBudgetMixedPrefixInput['industryWageSources'];
  readonly industryPowerOriginals?: FinanceNativeBudgetMixedPrefixInput['industryPowerOriginals'];
  readonly industryWaterOriginals?: FinanceNativeBudgetMixedPrefixInput['industryWaterOriginals'];
  readonly industryLogisticsSources?: FinanceNativeBudgetMixedPrefixInput['industryLogisticsSources'];
  readonly fxOriginals?: Parameters<
    typeof prepareFinanceNativeBudgetFinancialReplay
  >[0]['fxOriginals'];
  readonly omoOriginals?: Parameters<
    typeof prepareFinanceNativeBudgetFinancialReplay
  >[0]['omoOriginals'];
  readonly captainCountries?: FinanceNativeBudgetMixedPrefixInput['captainCountries'];
}
interface ContinuationOrigin {
  readonly opening: Readonly<RebuiltV08Ledgers>;
  readonly openingEncumbrances: Parameters<
    typeof prepareFinanceNativeBudgetFinancialReplay
  >[0]['openingEncumbrances'];
}
const continuations = new WeakMap<
  object,
  {
    readonly view: Readonly<FinanceSocialReplayContinuationView>;
    readonly lastFramesText: string;
    readonly origin: ContinuationOrigin;
  }
>();
// Immutable replay DATA may be borrowed after its cursor is retired. This is
// not source currentness or commit authority, and copies cannot mint it.
const issuedViews = new WeakSet<object>();
export const FINANCE_SOCIAL_REPLAY_PAGE_LIMITS = Object.freeze({
  events: 256,
  bytes: 1048576,
  eventBytes: 65536,
  commandBytes: 16384,
});
function invalid(reason: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'Finance/Social replay continuation: ' + reason,
  );
}
const same = (a: unknown, b: unknown) =>
  canonicalSerialize(a) === canonicalSerialize(b);
function head(value: FinanceSocialReplayHead): FinanceSocialReplayHead {
  if (
    !value ||
    !/^(?:0|[1-9]\d*)$/u.test(value.worldVersion) ||
    !/^(?:0|[1-9]\d*)$/u.test(value.eventSequence) ||
    BigInt(value.worldVersion) > BigInt(value.eventSequence)
  )
    invalid('canonical complete-group head required');
  return Object.freeze({
    worldVersion: value.worldVersion,
    eventSequence: value.eventSequence,
  });
}
function bytes(value: string): number {
  let size = 0;
  for (const character of value) {
    const point = character.codePointAt(0)!;
    size += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return size;
}
function exactOriginalSeed(
  seedFingerprint: string,
  originals: FinanceSocialReplayPageOriginals,
): void {
  if (
    originals.fxOriginals?.some(
      (o) => o.quote?.seedFingerprint !== seedFingerprint,
    ) ||
    originals.omoOriginals?.some(
      (o) =>
        o.valuationQuote !== undefined &&
        o.valuationQuote.seedFingerprint !== seedFingerprint,
    )
  )
    invalid('immutable quote differs from genuine opening seed');
}
function issue(
  value: Readonly<FinanceSocialReplayContinuationView>,
  origin: ContinuationOrigin,
): FinanceSocialReplayContinuation {
  issuedViews.add(value);
  const token = Object.freeze({}) as FinanceSocialReplayContinuation;
  continuations.set(token, {
    view: Object.freeze(value),
    lastFramesText: canonicalSerialize(value.lastPage.frames),
    origin,
  });
  return token;
}
export function readFinanceSocialReplayContinuationView(
  view: FinanceSocialReplayContinuationView,
  sha256Hex: Sha256Hex,
): Readonly<FinanceSocialReplayContinuationView> {
  if (!issuedViews.has(view)) invalid('genuine issued replay view required');
  if (
    readFinanceNativeBudgetMixedPrefix(
      view.lastPage.evidence,
      view.worldId,
      view.lastPage.frames,
      sha256Hex,
    ) !== view.result
  )
    invalid('exact replay view result required');
  return view;
}
function lookup(
  token: FinanceSocialReplayContinuation,
): Readonly<FinanceSocialReplayContinuationView> {
  const value = continuations.get(token);
  if (!value) invalid('genuine live continuation required');
  if (canonicalSerialize(value.view.lastPage.frames) !== value.lastFramesText)
    invalid('previous verified page was mutated');
  return value.view;
}
/** Cold preparation starts from one genuine paired H0 reconstruction. A JSON
 * checkpoint/current-state object or an independently genuine other inventory
 * cannot mint a continuation. Original domain validators remain unchanged. */
export function prepareFinanceSocialReplayContinuation(
  input: {
    readonly opening: Readonly<RebuiltV08Ledgers>;
    readonly expectedHead: FinanceSocialReplayHead;
    readonly socialCountries: FinanceNativeBudgetMixedPrefixInput['socialCountries'];
    readonly captainCountries?: FinanceNativeBudgetMixedPrefixInput['captainCountries'];
    readonly industryWorkSources?: FinanceNativeBudgetMixedPrefixInput['industryWorkSources'];
    readonly industryWageSources?: FinanceNativeBudgetMixedPrefixInput['industryWageSources'];
    readonly industryPowerOriginals?: FinanceNativeBudgetMixedPrefixInput['industryPowerOriginals'];
    readonly industryWaterOriginals?: FinanceNativeBudgetMixedPrefixInput['industryWaterOriginals'];
    readonly industryLogisticsSources?: FinanceNativeBudgetMixedPrefixInput['industryLogisticsSources'];
    readonly openingEncumbrances: Parameters<
      typeof prepareFinanceNativeBudgetFinancialReplay
    >[0]['openingEncumbrances'];
    readonly fxOriginals: Parameters<
      typeof prepareFinanceNativeBudgetFinancialReplay
    >[0]['fxOriginals'];
    readonly omoOriginals?: Parameters<
      typeof prepareFinanceNativeBudgetFinancialReplay
    >[0]['omoOriginals'];
    readonly beneficialHousingRentReceipts?: Parameters<
      typeof prepareFinanceNativeBudgetFinancialReplay
    >[0]['beneficialHousingRentReceipts'];
  },
  sha256Hex: Sha256Hex,
): FinanceSocialReplayContinuation {
  reconcileV08LedgerSnapshots({ reconstructed: input.opening, sha256Hex });
  if (
    input.opening.worldVersion !== '0' ||
    input.opening.financial.worldVersion !== '0' ||
    input.opening.inventory.worldVersion !== '0'
  )
    invalid('genuine paired H0 opening required');
  exactOriginalSeed(input.opening.seedFingerprint, input);
  const expectedHead = head(input.expectedHead),
    worldId = input.opening.financial.worldId,
    seedFingerprint = input.opening.seedFingerprint,
    financialReplay = prepareFinanceNativeBudgetFinancialReplay(
      {
        financial: input.opening.financial,
        opening: input.opening,
        openingEncumbrances: input.openingEncumbrances,
        fxOriginals: input.fxOriginals,
        ...(input.omoOriginals === undefined
          ? {}
          : { omoOriginals: input.omoOriginals }),
        ...(input.beneficialHousingRentReceipts === undefined
          ? {}
          : {
              beneficialHousingRentReceipts:
                input.beneficialHousingRentReceipts,
            }),
      },
      sha256Hex,
    ),
    frames = Object.freeze([]) as readonly FinanceNativeBudgetCanonicalFrame[],
    evidence = prepareFinanceNativeBudgetMixedPrefix(
      {
        worldId,
        frames,
        financialReplay,
        socialCountries: input.socialCountries,
        ...(input.captainCountries === undefined
          ? {}
          : { captainCountries: input.captainCountries }),
        ...(input.industryWorkSources === undefined
          ? {}
          : { industryWorkSources: input.industryWorkSources }),
        ...(input.industryWageSources === undefined
          ? {}
          : { industryWageSources: input.industryWageSources }),
        ...(input.industryPowerOriginals === undefined
          ? {}
          : { industryPowerOriginals: input.industryPowerOriginals }),
        ...(input.industryWaterOriginals === undefined
          ? {}
          : { industryWaterOriginals: input.industryWaterOriginals }),
        ...(input.industryLogisticsSources === undefined
          ? {}
          : { industryLogisticsSources: input.industryLogisticsSources }),
      },
      sha256Hex,
    ),
    result = readFinanceNativeBudgetMixedPrefix(
      evidence,
      worldId,
      frames,
      sha256Hex,
    );
  return issue(
    {
      classification: 'CORE_REPLAY_DATA_NOT_SOURCE_OR_COMMIT_AUTHORITY',
      worldId,
      seedFingerprint,
      head: head({ worldVersion: '0', eventSequence: '0' }),
      expectedHead,
      complete: false,
      pageCount: '0',
      frameCount: '0',
      chainFingerprint: canonicalSha256(
        canonicalHashInput({
          schemaVersion: 'finance-social-replay-origin-v1',
          worldId,
          seedFingerprint,
          expectedHead,
        }),
        sha256Hex,
      ),
      result,
      lastPage: Object.freeze({ evidence, frames }),
    },
    {
      opening: input.opening,
      openingEncumbrances: Object.freeze(
        input.openingEncumbrances.map((r) => Object.freeze({ ...r })),
      ),
    },
  );
}
/** Successful append consumes its old handle. Failure is atomic: the old
 * private fold remains live and unchanged, and no supplied head is applied. */
export function appendFinanceSocialReplayPage(input: {
  readonly continuation: FinanceSocialReplayContinuation;
  readonly page: FinanceSocialReplayPage;
  readonly sha256Hex: Sha256Hex;
  /** Fixed historical DATA supplied by the same held source transaction. Each
   * page's facts are revalidated against the original genuine H0; they cannot
   * replace a prior immutable reference or supply a domain/current-state DTO. */
  readonly originals?: FinanceSocialReplayPageOriginals;
}): FinanceSocialReplayContinuation {
  const prior = lookup(input.continuation),
    page = input.page,
    origin = continuations.get(input.continuation)!.origin;
  if (prior.complete)
    invalid('completed continuation cannot accept another page');
  if (
    !page ||
    page.schemaVersion !== 'finance-social-replay-page-v1' ||
    page.worldId !== prior.worldId ||
    page.seedFingerprint !== prior.seedFingerprint ||
    !same(head(page.fromHead), prior.head) ||
    !same(head(page.expectedHead), prior.expectedHead)
  )
    invalid('exact same source, World, anchor and previous page head required');
  const throughHead = head(page.throughHead);
  if (
    BigInt(throughHead.worldVersion) >
      BigInt(prior.expectedHead.worldVersion) ||
    BigInt(throughHead.eventSequence) > BigInt(prior.expectedHead.eventSequence)
  )
    invalid('page exceeds actual anchored head');
  if (!Array.isArray(page.frames))
    invalid('complete canonical frame array required');
  const framesText = canonicalSerialize(page.frames);
  if (bytes(framesText) > FINANCE_SOCIAL_REPLAY_PAGE_LIMITS.bytes)
    invalid('bounded complete page bytes required');
  if (
    !/^sha256:[a-f0-9]{64}$/u.test(page.framesSha256) ||
    canonicalSha256(canonicalHashInput(page.frames), input.sha256Hex) !==
      page.framesSha256
  )
    invalid('full canonical frame hash required');
  let eventCount = 0;
  for (const frame of page.frames) {
    if (
      !frame ||
      typeof frame !== 'object' ||
      !Array.isArray(frame.events) ||
      frame.events.length === 0 ||
      frame.receipt?.outcome !== 'COMMITTED'
    )
      invalid('nonempty complete COMMITTED transition required');
    eventCount += frame.events.length;
    if (
      bytes(frame.command.canonicalPayload) >
        FINANCE_SOCIAL_REPLAY_PAGE_LIMITS.commandBytes ||
      frame.events.some(
        (e: FinanceNativeBudgetCanonicalFrame['events'][number]) =>
          bytes(e.canonicalPayload) >
          FINANCE_SOCIAL_REPLAY_PAGE_LIMITS.eventBytes,
      )
    )
      invalid('bounded command and event bytes required');
  }
  if (eventCount > FINANCE_SOCIAL_REPLAY_PAGE_LIMITS.events)
    invalid('bounded complete page event count required');
  if (
    !page.frames.length &&
    (!same(prior.head, prior.expectedHead) ||
      !same(throughHead, prior.head) ||
      prior.pageCount !== '0')
  )
    invalid('empty page only closes a genuine empty H0 prefix');
  exactOriginalSeed(prior.seedFingerprint, input.originals ?? {});
  const financialReplay =
    input.originals?.fxOriginals !== undefined ||
    input.originals?.omoOriginals !== undefined
      ? prepareFinanceNativeBudgetFinancialReplay(
          {
            financial: origin.opening.financial,
            opening: origin.opening,
            openingEncumbrances: origin.openingEncumbrances,
            fxOriginals: input.originals.fxOriginals ?? [],
            ...(input.originals.omoOriginals === undefined
              ? {}
              : { omoOriginals: input.originals.omoOriginals }),
          },
          input.sha256Hex,
        )
      : undefined;
  const evidence = continueFinanceNativeBudgetMixedPrefix(
      {
        previous: prior.lastPage.evidence,
        worldId: prior.worldId,
        frames: page.frames,
        ...(financialReplay === undefined ? {} : { financialReplay }),
        ...(input.originals?.captainCountries === undefined
          ? {}
          : { captainCountries: input.originals.captainCountries }),
        ...(input.originals?.industryWorkSources === undefined
          ? {}
          : { industryWorkSources: input.originals.industryWorkSources }),
        ...(input.originals?.industryWageSources === undefined
          ? {}
          : { industryWageSources: input.originals.industryWageSources }),
        ...(input.originals?.industryPowerOriginals === undefined
          ? {}
          : { industryPowerOriginals: input.originals.industryPowerOriginals }),
        ...(input.originals?.industryWaterOriginals === undefined
          ? {}
          : { industryWaterOriginals: input.originals.industryWaterOriginals }),
        ...(input.originals?.industryLogisticsSources === undefined
          ? {}
          : {
              industryLogisticsSources:
                input.originals.industryLogisticsSources,
            }),
      },
      input.sha256Hex,
    ),
    result = readFinanceNativeBudgetMixedPrefix(
      evidence,
      prior.worldId,
      page.frames,
      input.sha256Hex,
    ),
    actualHead = head({
      worldVersion: result.budgetState.worldVersion,
      eventSequence: result.budgetState.eventSequence,
    });
  if (!same(actualHead, throughHead))
    invalid('Core-derived complete page boundary differs');
  const next = issue(
    {
      classification: prior.classification,
      worldId: prior.worldId,
      seedFingerprint: prior.seedFingerprint,
      head: actualHead,
      expectedHead: prior.expectedHead,
      complete: same(actualHead, prior.expectedHead),
      pageCount: (BigInt(prior.pageCount) + 1n).toString(),
      frameCount: (
        BigInt(prior.frameCount) + BigInt(page.frames.length)
      ).toString(),
      chainFingerprint: canonicalSha256(
        canonicalHashInput({
          schemaVersion: 'finance-social-replay-page-chain-v1',
          previous: prior.chainFingerprint,
          worldId: prior.worldId,
          seedFingerprint: prior.seedFingerprint,
          fromHead: prior.head,
          throughHead: actualHead,
          expectedHead: prior.expectedHead,
          framesSha256: page.framesSha256,
        }),
        input.sha256Hex,
      ),
      result,
      lastPage: Object.freeze({
        evidence,
        frames: Object.freeze([...page.frames]),
      }),
    },
    origin,
  );
  continuations.delete(input.continuation);
  return next;
}
export function readFinanceSocialReplayContinuation(
  continuation: FinanceSocialReplayContinuation,
): Readonly<FinanceSocialReplayContinuationView> {
  return lookup(continuation);
}
export function retireFinanceSocialReplayContinuation(
  continuation: FinanceSocialReplayContinuation,
): void {
  if (!continuations.has(continuation))
    invalid('genuine live continuation required');
  continuations.delete(continuation);
}
