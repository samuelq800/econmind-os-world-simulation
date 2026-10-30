/** Explicit offline immutable DATA preparation. No auth/head/lease/view or
 * admission authority survives preparation. Every online use locks the actual
 * source/admission again and reads/replays the complete bounded current prefix. */
import { createHash } from 'node:crypto';
import {
  DomainError,
  DOMAIN_ERROR_CODES,
  canonicalSerialize,
  rebuildV08LedgersFromLineage,
  type OpeningSeed,
  type OpeningSource,
  type FinancialLedgerState,
  type FinancialAccount,
  type IndustryPersistenceSchemaReadContextV1,
} from '@econmind/core';
import {
  prepareFinanceNativeBudgetMixedPrefix,
  type FinanceNativeBudgetMixedPrefixEvidence,
} from '@econmind/core/finance-budget-native';
import { replayPreparedPostwarFinanceSocialFxFrom } from './prepared-postwar-finance-social-fx-replay.js';
import {
  prepareFinanceSocialLedger,
  replayPreparedFinanceSocialLedger,
  type PreparedFinanceSocialLedger,
} from '@econmind/core/finance-social-prepared-ledger';
import { readPostwarSocialStartupSeedFrom } from './postwar-social-startup-seed.js';
import { WorldOpeningSeedStore } from './opening-seed-store.js';
import {
  readPostwarOperatingGenesisFromSeed,
  type PostwarGenesisFunding,
} from '../preparation/postwar-operating-genesis-adoption.js';
import {
  validatePostwarSocialEmploymentStateDocument,
  type PostwarSocialEmploymentStateDocument,
} from '../preparation/postwar-social-employment-state.js';
import { readBoundedPostwarSocialFramesFrom } from './bounded-postwar-social-lineage.js';
import { lockRegisteredSourceFrom } from './postgres-social-operating-custody.js';
import { createPostwarSocialSourceRoleScope } from './postwar-social-position-runtime.js';
import {
  readValidatedCanonicalLineageFrom,
  withValidatedCanonicalLineageFrom,
  type ValidatedCanonicalLineageData,
  type ValidatedCanonicalLineageView,
} from './validated-canonical-lineage.js';
import type { DurableV08LedgerLineageReader } from './durable-v08-ledger-lineage-reader.js';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function invalid(reason: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'PREPARED_SOCIAL_SOURCE:' + reason,
  );
}
type SourceMetadata = Pick<
  OpeningSource,
  'sourceId' | 'payloadHash' | 'locator'
>;
export interface PostwarSocialReplayLineage {
  readonly worldId: string;
  readonly seed: Pick<
    OpeningSeed,
    'worldId' | 'seedId' | 'fingerprint' | 'replayBinding'
  > & { readonly sources: readonly SourceMetadata[] };
  readonly headWorldVersion: string;
  readonly headEventSequence: string;
  readonly ledgers: Readonly<{ financial: Readonly<FinancialLedgerState> }>;
  readonly transitions: ValidatedCanonicalLineageData['transitions'];
  readonly mixedPrefixEvidence?: FinanceNativeBudgetMixedPrefixEvidence;
}
export interface PostwarSocialPreparationPins {
  readonly worldId: string;
  readonly seedRef: string;
  readonly contentHash: string;
  readonly admissionRef: string;
}
export interface PostwarSocialSourcePreparationInput {
  readonly observedAtReal: string;
  readonly admittedWorldPins: PostwarSocialPreparationPins;
  readonly modelVersion: string;
  /** Server-only actual Core opening DATA, normally shared with FX startup.
   * Never an HTTP DTO or an assertion of admission/readiness. */
  readonly startupSeed?: Readonly<OpeningSeed>;
}
declare const preparedSocial: unique symbol;
export interface PreparedPostwarSocialSource {
  readonly [preparedSocial]: true;
}
interface Base {
  readonly pins: PostwarSocialPreparationPins;
  readonly modelVersion: string;
  readonly seed: PostwarSocialReplayLineage['seed'];
  readonly source: Readonly<SourceMetadata>;
  readonly document: PostwarSocialEmploymentStateDocument;
  readonly ledger: PreparedFinanceSocialLedger;
  readonly financialAccounts: readonly FinancialAccount[];
  readonly funding: readonly PostwarGenesisFunding[];
  readonly sourceMetadata: readonly SourceMetadata[];
  readonly registrations: ReadonlyMap<string, string>;
  readonly retainedDocumentBytes: number;
}
interface Slot {
  base?: Base;
  inflight?: Promise<void>;
}
const slots = new WeakMap<PreparedPostwarSocialSource, Slot>();
const issuedLineages = new WeakMap<object, Base>();
const legacyLineages = new WeakMap<object, ValidatedCanonicalLineageData>();
declare const preparedView: unique symbol;
export interface PreparedPostwarSocialLineageView {
  readonly [preparedView]: true;
}
export type SocialCanonicalLineageView =
  ValidatedCanonicalLineageView | PreparedPostwarSocialLineageView;
const views = new WeakMap<
  object,
  { executor: SqlExecutor; data: PostwarSocialReplayLineage }
>();
export function createPostwarSocialSourcePreparation(): PreparedPostwarSocialSource {
  const token = Object.freeze({}) as PreparedPostwarSocialSource;
  slots.set(token, {});
  return token;
}
function baseOf(token: PreparedPostwarSocialSource): Base {
  const base = slots.get(token)?.base;
  if (!base) invalid('SOURCE_NOT_PREPARED');
  return base;
}
/** No caller source object, allowed flag, held executor or auth token accepted. */
export async function preparePostwarSocialSource(input: {
  readonly preparation: PreparedPostwarSocialSource;
  readonly database: SqlDatabase;
  readonly workerRole: string;
  readonly countryIds: readonly string[];
  readonly configuration: PostwarSocialSourcePreparationInput;
}): Promise<void> {
  const slot = slots.get(input.preparation);
  if (!slot) invalid('GENUINE_PREPARATION_REQUIRED');
  const c = input.configuration,
    pins = Object.freeze({ ...c.admittedWorldPins });
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(c.observedAtReal) ||
    new Date(c.observedAtReal).toISOString() !== c.observedAtReal
  )
    invalid('AUDIT_TIMESTAMP_REQUIRED');
  const identity = canonicalSerialize({ pins, modelVersion: c.modelVersion });
  if (slot.base) {
    if (
      canonicalSerialize({
        pins: slot.base.pins,
        modelVersion: slot.base.modelVersion,
      }) !== identity
    )
      invalid('PREPARATION_PINS_CHANGED');
    return;
  }
  if (slot.inflight) {
    await slot.inflight;
    if (
      canonicalSerialize({
        pins: baseOf(input.preparation).pins,
        modelVersion: baseOf(input.preparation).modelVersion,
      }) !== identity
    )
      invalid('PREPARATION_PINS_CHANGED');
    return;
  }
  const operation = (async () => {
    const roles = createPostwarSocialSourceRoleScope({
      workerRole: input.workerRole,
    });
    const base = await input.database.transaction((tx) =>
      roles.withSourceReaderFrom(tx, async () => {
        const countryIds = [...input.countryIds].sort();
        if (
          countryIds.length === 0 ||
          new Set(countryIds).size !== countryIds.length
        )
          invalid('GENUINE_COUNTRY_SCOPE_REQUIRED');
        // Establish H/admission/source lock scope before any offline raw read.
        // Country selectors come from the genuine opening-adoption roster.
        const first = await lockRegisteredSourceFrom(
          tx,
          pins.worldId,
          countryIds[0]!,
        );
        const firstRow = first.rows[0];
        if (
          first.rows.length !== 1 ||
          !firstRow ||
          firstRow.seed_fingerprint !== pins.contentHash ||
          firstRow.admission_ref !== pins.admissionRef
        )
          invalid('ACTUAL_PREPARATION_ADMISSION_REQUIRED');
        const seed = c.startupSeed
          ? await readPostwarSocialStartupSeedFrom({
              executor: tx,
              seed: c.startupSeed,
              worldId: pins.worldId,
              countryId: countryIds[0]!,
              seedRef: pins.seedRef,
              seedFingerprint: pins.contentHash,
              admissionRef: pins.admissionRef,
              modelVersion: c.modelVersion,
              registration: firstRow,
            })
          : // Legacy offline-capable path only. Missing raw permission is an
            // explicit failure; it never justifies granting an online reader raw.
            await new WorldOpeningSeedStore({
              database: input.database,
              sha256Hex: sha,
            }).loadFrom(tx, pins.worldId);
        if (
          seed.worldId !== pins.worldId ||
          seed.seedId !== pins.seedRef ||
          seed.fingerprint !== pins.contentHash ||
          seed.replayBinding.modelVersion !== c.modelVersion
        )
          invalid('ACTUAL_IMMUTABLE_SEED_PINS_DIFFER');
        const view = readPostwarOperatingGenesisFromSeed(seed);
        if (!view.socialEmployment) invalid('ACTUAL_FULL_E03_REQUIRED');
        const document = validatePostwarSocialEmploymentStateDocument(
          view.socialEmployment,
        );
        if (
          canonicalSerialize(
            document.countries.map((c) => c.countryId).sort(),
          ) !== canonicalSerialize(countryIds)
        )
          invalid('PREPARED_COUNTRY_ROSTER_DIFFERS');
        const sources = seed.sources.filter(
          (s) =>
            (JSON.parse(s.canonicalPayload) as { schemaVersion?: unknown })
              .schemaVersion === 'postwar-operating-genesis-seed-source-v1',
        );
        if (sources.length !== 1) invalid('EXACT_ORIGINAL_SOURCE_REQUIRED');
        const source = Object.freeze({
          sourceId: sources[0]!.sourceId,
          payloadHash: sources[0]!.payloadHash,
          locator: sources[0]!.locator,
        });
        const registrations = new Map<string, string>();
        for (const country of document.countries) {
          const result = await lockRegisteredSourceFrom(
              tx,
              pins.worldId,
              country.countryId,
            ),
            r = result.rows[0];
          if (
            result.rows.length !== 1 ||
            !r ||
            r.world_id !== pins.worldId ||
            r.country_id !== country.countryId ||
            r.seed_fingerprint !== pins.contentHash ||
            r.admission_ref !== pins.admissionRef ||
            r.source_id !== source.sourceId ||
            r.source_payload_hash !== source.payloadHash ||
            r.issuer_role !== 'world_v2_social_source_publisher' ||
            r.revision !== '1'
          )
            invalid('CURRENT_REGISTERED_ORIGINAL_PINS_DIFFER');
          registrations.set(country.countryId, canonicalSerialize(r));
        }
        if (!registrations.size) invalid('CANONICAL_COUNTRIES_REQUIRED');
        const financial = rebuildV08LedgersFromLineage({
          seed,
          sha256Hex: sha,
        }).financial;
        const ledger = prepareFinanceSocialLedger(financial);
        return Object.freeze({
          pins,
          modelVersion: c.modelVersion,
          seed: Object.freeze({
            worldId: seed.worldId,
            seedId: seed.seedId,
            fingerprint: seed.fingerprint,
            replayBinding: seed.replayBinding,
            sources: Object.freeze([source]),
          }),
          source,
          document,
          ledger,
          financialAccounts: financial.accounts,
          funding: view.facts.funding,
          sourceMetadata: Object.freeze(
            seed.sources.map((s) =>
              Object.freeze({
                sourceId: s.sourceId,
                payloadHash: s.payloadHash,
                locator: s.locator,
              }),
            ),
          ),
          registrations,
          retainedDocumentBytes: Buffer.byteLength(
            canonicalSerialize(document),
          ),
        });
      }),
    );
    // Install only after the actual outer COMMIT acknowledgement. Failed prepare
    // retains neither a partial baseline nor a usable token.
    slot.base = base;
  })();
  slot.inflight = operation;
  try {
    await operation;
  } finally {
    delete slot.inflight;
  }
}
export function assertPreparedSocialRegistration(
  preparation: PreparedPostwarSocialSource,
  registration: Readonly<Record<string, unknown>>,
  countryId: string,
): void {
  const base = baseOf(preparation);
  if (base.registrations.get(countryId) !== canonicalSerialize(registration))
    invalid('CURRENT_REGISTRATION_DIFFERS_FROM_PREPARED_ORIGINAL');
}
export function readPreparedSocialOriginals(
  preparation: PreparedPostwarSocialSource,
) {
  const b = baseOf(preparation);
  return Object.freeze({
    document: b.document,
    source: b.source,
    seed: b.seed,
  });
}
/** Genuine immutable DATA baseline only. Every consumer still obtains current
 * source/admission/head/authority independently; retired/forged tokens fail. */
export interface PreparedPostwarSocialFinancialReplayBase {
  readonly prepared: PreparedFinanceSocialLedger;
  readonly financialAccounts: readonly FinancialAccount[];
  readonly funding: readonly PostwarGenesisFunding[];
  readonly document: PostwarSocialEmploymentStateDocument;
  readonly pins: PostwarSocialPreparationPins;
  readonly sourceMetadata: readonly SourceMetadata[];
}
const issuedFinancialReplayBases = new WeakMap<
  object,
  PreparedPostwarSocialSource
>();
export function readPreparedPostwarSocialFinancialReplayBase(
  preparation: PreparedPostwarSocialSource,
): Readonly<PreparedPostwarSocialFinancialReplayBase> {
  const b = baseOf(preparation);
  const value = Object.freeze({
    prepared: b.ledger,
    financialAccounts: b.financialAccounts,
    funding: b.funding,
    document: b.document,
    pins: b.pins,
    sourceMetadata: b.sourceMetadata,
  });
  issuedFinancialReplayBases.set(value, preparation);
  return value;
}
export function consumePreparedPostwarSocialFinancialReplayBase(
  value: Readonly<PreparedPostwarSocialFinancialReplayBase>,
): Readonly<PreparedPostwarSocialFinancialReplayBase> {
  const preparation = issuedFinancialReplayBases.get(value);
  if (!preparation || baseOf(preparation).ledger !== value.prepared)
    invalid('GENUINE_LIVE_FINANCIAL_REPLAY_BASE_REQUIRED');
  return value;
}
export async function readPreparedPostwarSocialLineageFrom(input: {
  readonly preparation: PreparedPostwarSocialSource;
  readonly executor: SqlExecutor;
  readonly database: SqlDatabase;
  readonly worldId: string;
  readonly countryId: string;
}): Promise<PostwarSocialReplayLineage> {
  const b = baseOf(input.preparation);
  if (b.pins.worldId !== input.worldId || !b.registrations.has(input.countryId))
    invalid('PREPARED_WORLD_COUNTRY_MISMATCH');
  // Source/admission checks are repeated here as well as in the owning custody;
  // neither a previously prepared token nor its data can replace current locks.
  const registration = await lockRegisteredSourceFrom(
    input.executor,
    input.worldId,
    input.countryId,
  );
  if (registration.rows.length !== 1 || !registration.rows[0])
    invalid('CURRENT_SOURCE_REQUIRED');
  assertPreparedSocialRegistration(
    input.preparation,
    registration.rows[0],
    input.countryId,
  );
  const prefix = await readBoundedPostwarSocialFramesFrom(input);
  const fxReplay = prefix.frames.some(
    (f) =>
      f.financialPostingBatches.length !== 0 ||
      f.inventoryPostings.length !== 0 ||
      f.command.commandType === 'CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1',
  )
    ? await replayPreparedPostwarFinanceSocialFxFrom({
        executor: input.executor,
        baseline: readPreparedPostwarSocialFinancialReplayBase(
          input.preparation,
        ),
        worldId: input.worldId,
        hostCountryId: input.countryId,
        officeId: 'SOCIAL',
        seedId: b.pins.seedRef,
        seedFingerprint: b.pins.contentHash,
        admissionRef: b.pins.admissionRef,
        frames: prefix.frames,
        expectedHead: prefix.head,
      })
    : null;
  const mixedPrefixEvidence =
    fxReplay?.mixedPrefixEvidence ??
    prepareFinanceNativeBudgetMixedPrefix(
      {
        worldId: input.worldId,
        frames: prefix.frames,
        socialCountries: b.document.countries.map((c) => ({
          countryId: c.countryId,
          state: c.state,
          offers: c.offers,
        })),
      },
      sha,
    );
  const financial =
    fxReplay?.financial ??
    replayPreparedFinanceSocialLedger({
      prepared: b.ledger,
      mixedPrefixEvidence,
      frames: prefix.frames,
      expectedHead: prefix.head,
      sha256Hex: sha,
    });
  const lineage = Object.freeze({
    worldId: input.worldId,
    seed: b.seed,
    headWorldVersion: prefix.head.worldVersion,
    headEventSequence: prefix.head.eventSequence,
    ledgers: Object.freeze({ financial }),
    mixedPrefixEvidence,
    transitions: Object.freeze(
      prefix.frames.map((f) =>
        Object.freeze({
          command: f.command,
          transition: f.transition,
          receipt: f.receipt,
          financialPostingBatches: f.financialPostingBatches,
          inventoryPostings: Object.freeze([]),
        }),
      ),
    ),
  });
  issuedLineages.set(lineage, b);
  return lineage;
}
export async function withPreparedPostwarSocialLineageFrom<T>(
  input: Parameters<typeof readPreparedPostwarSocialLineageFrom>[0],
  consume: (view: PreparedPostwarSocialLineageView) => Promise<T>,
): Promise<T> {
  const data = await readPreparedPostwarSocialLineageFrom(input),
    view = Object.freeze({}) as PreparedPostwarSocialLineageView;
  views.set(view, { executor: input.executor, data });
  try {
    return await consume(view);
  } finally {
    views.delete(view);
  }
}
export function readSocialCanonicalLineageFrom(
  executor: SqlExecutor,
  view: SocialCanonicalLineageView,
): PostwarSocialReplayLineage {
  const prepared = views.get(view);
  if (prepared) {
    if (prepared.executor !== executor)
      invalid('PREPARED_VIEW_EXECUTOR_MISMATCH');
    return prepared.data;
  }
  const legacy = readValidatedCanonicalLineageFrom(
    executor,
    view as ValidatedCanonicalLineageView,
  );
  legacyLineages.set(legacy, legacy);
  return legacy;
}
export function preparedSocialDocumentFor(
  lineage: PostwarSocialReplayLineage,
): PostwarSocialEmploymentStateDocument | undefined {
  return issuedLineages.get(lineage)?.document;
}
export function preparedSocialOriginalAt(
  lineage: PostwarSocialReplayLineage,
  sourceId: unknown,
  payloadHash: unknown,
  pointer: string,
): { readonly value: unknown } | undefined {
  const base = issuedLineages.get(lineage);
  if (!base) return undefined;
  if (
    sourceId !== base.source.sourceId ||
    payloadHash !== base.source.payloadHash ||
    !pointer.startsWith('/carrier/socialEmployment/')
  )
    invalid('PREPARED_EXACT_ORIGINAL_POINTER_REQUIRED');
  let value: unknown = base.document;
  for (const encoded of pointer
    .slice('/carrier/socialEmployment/'.length)
    .split('/')) {
    if (/~(?![01])/u.test(encoded)) invalid('NONCANONICAL_ORIGINAL_POINTER');
    const key = encoded.replaceAll('~1', '/').replaceAll('~0', '~');
    if (
      !value ||
      typeof value !== 'object' ||
      !Object.hasOwn(value, key) ||
      (Array.isArray(value) && !/^(?:0|[1-9]\d*)$/u.test(key))
    )
      invalid('PREPARED_ORIGINAL_POINTER_ABSENT');
    value = (value as Record<string, unknown>)[key];
  }
  return Object.freeze({ value });
}

export async function withSocialCanonicalLineageFrom<T>(
  input: {
    readonly preparedSource?: PreparedPostwarSocialSource;
    readonly reader: DurableV08LedgerLineageReader;
    readonly database: SqlDatabase;
    readonly executor: SqlExecutor;
    readonly worldId: string;
    readonly countryId: string;
    readonly industryReadContext?: IndustryPersistenceSchemaReadContextV1;
  },
  consume: (view: SocialCanonicalLineageView) => Promise<T>,
): Promise<T> {
  if (input.preparedSource) {
    if (input.industryReadContext)
      invalid('PREPARED_SOURCE_UNKNOWN_INDUSTRY_PREFIX');
    return withPreparedPostwarSocialLineageFrom(
      {
        preparation: input.preparedSource,
        executor: input.executor,
        database: input.database,
        worldId: input.worldId,
        countryId: input.countryId,
      },
      consume,
    );
  }
  return withValidatedCanonicalLineageFrom(input, consume);
}
export function socialDocumentForLineage(
  lineage: PostwarSocialReplayLineage,
): PostwarSocialEmploymentStateDocument | undefined {
  const prepared = issuedLineages.get(lineage);
  if (prepared) return prepared.document;
  const legacy = legacyLineages.get(lineage);
  if (!legacy) invalid('ACTUAL_LEXICAL_LINEAGE_REQUIRED');
  return (
    readPostwarOperatingGenesisFromSeed(legacy.seed).socialEmployment ??
    undefined
  );
}
export function socialOriginalAt(
  lineage: PostwarSocialReplayLineage,
  sourceId: unknown,
  payloadHash: unknown,
  pointer: string,
): unknown {
  const prepared = preparedSocialOriginalAt(
    lineage,
    sourceId,
    payloadHash,
    pointer,
  );
  if (prepared) return prepared.value;
  const legacy = legacyLineages.get(lineage);
  if (!legacy) invalid('ACTUAL_LEXICAL_LINEAGE_REQUIRED');
  const sources = legacy.seed.sources.filter((s) => s.sourceId === sourceId);
  if (sources.length !== 1 || sources[0]!.payloadHash !== payloadHash)
    invalid('EXACT_LEGACY_ORIGINAL_REQUIRED');
  let value: unknown = JSON.parse(sources[0]!.canonicalPayload);
  if (!pointer.startsWith('/') || /~(?![01])/u.test(pointer))
    invalid('NONCANONICAL_ORIGINAL_POINTER');
  for (const encoded of pointer.slice(1).split('/')) {
    const key = encoded.replaceAll('~1', '/').replaceAll('~0', '~');
    if (
      !value ||
      typeof value !== 'object' ||
      !Object.hasOwn(value, key) ||
      (Array.isArray(value) && !/^(?:0|[1-9]\d*)$/u.test(key))
    )
      invalid('ACTUAL_ORIGINAL_POINTER_ABSENT');
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

/** Private preparation identity/data diagnostic only; never current authority. */
export function isPreparedPostwarSocialSource(
  value: PreparedPostwarSocialSource,
  worldId: string,
): boolean {
  return slots.get(value)?.base?.pins.worldId === worldId;
}

/** Retire only after the fixed host has drained all source transactions. */
export function retirePreparedPostwarSocialSource(
  value: PreparedPostwarSocialSource,
): void {
  const slot = slots.get(value);
  if (slot?.inflight) invalid('PREPARATION_STILL_RUNNING');
  slots.delete(value);
}
