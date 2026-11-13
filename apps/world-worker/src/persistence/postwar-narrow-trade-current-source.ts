import { readPostwarSocialServiceCreationOriginalsForBase } from './postwar-social-service-creation-originals.js';
/** Server-only Trade current originals. No source admission, OP representation,
 * route, cash, consumer, or production installation is created here. */
import { createHash } from 'node:crypto';
import {
  DOMAIN_ERROR_CODES,
  DomainError,
  canonicalSerialize,
  canonicalHashInput,
  canonicalSha256,
  validateCanonicalCommand,
  validateAuthoritativeTransition,
  parseNarrowTreasuryGcuTransferTerms,
  parseWorldDecimal,
  Money,
  SimTime,
  shipNarrowTreasuryGcuTransfer,
  deliverNarrowTreasuryGcuTransfer,
  isAuthorizedOfficeContext,
  reauthorizeOfficeCapability,
  isCommitAuthorizationProof,
  reauthorizeCommitAuthorizationProof,
  createReservationPosting,
  type InventoryLedgerState,
  type FinancialLedgerState,
  createWorldWriterCommitAssertion,
  parseWorldWriterLease,
  parseNarrowTreasuryGcuShipmentTerms,
  parseNarrowTreasuryGcuDeliveryTerms,
  type CanonicalCommand,
  type AuthoritativeTransition,
  type AuthorizedOfficeContext,
  type CommitAuthorizationProof,
  type DecisionResultHead,
  type FinancialPostingBatch,
  type InventoryLedgerPosting,
  type FinancialAccount,
  type OpeningSeed,
  isValidatedOpeningSeed,
  parseOpeningSeed,
  rebuildV08LedgersFromLineage,
} from '@econmind/core';
import { POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND } from '@econmind/core/authenticated-office-command-contract';
import { parsePostwarDayOneFxQuoteData } from '@econmind/core/postwar-day-one-treasury-fx';
import {
  prepareFinanceSocialLedgerFromOpening,
  replayPreparedFinanceSocialFxLedger,
} from '@econmind/core/finance-social-prepared-ledger';
import { decodeBoundedPostwarCanonicalPrefix } from './bounded-postwar-canonical-prefix.js';
import { decodeBoundedPostwarJournal } from './bounded-postwar-fx-postings.js';
import {
  consumePreparedPostwarSocialFinancialReplayBase,
  type PreparedPostwarSocialFinancialReplayBase,
} from './prepared-postwar-social-source.js';
import { projectPostwarOpeningFinancialEncumbrances } from './prepared-postwar-finance-social-fx-replay.js';
import {
  readPostwarFinanceSocialRuntimeBinding,
  type PostwarFinanceSocialRuntimeConnection,
} from '../runtime-preparation/finance-social-runtime-connection.js';
import {
  isPostwarSocialRuntimeConnection,
  readPostwarSocialRuntimeConnectionResources,
  type PostwarSocialRuntimeConnection,
  readPostwarSocialRuntimeFinancialReplayBase,
} from '../runtime-preparation/social-runtime-connection.js';
import {
  readPagedFromPreparedSocialBaseOnHeldExecutor,
  releasePostwarPagedFinanceSocialReplay,
} from './postwar-paged-finance-social-replay.js';
import { readPostwarNarrowTradeHistoryOriginalsFrom } from './postwar-narrow-trade-history-originals.js';
import type { DurableConsumptionClock } from '../preparation/durable-command-consumption.js';
import type { SqlExecutor } from './sql-database.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const hash = (v: unknown) => canonicalSha256(canonicalHashInput(v), sha);
type Row = Record<string, unknown>;
function invalid(reason: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'POSTWAR_NARROW_TRADE_CURRENT: ' + reason,
  );
}
function row(v: unknown): Row {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    invalid('actual original object required');
  return v as Row;
}
function rows(v: unknown): Row[] {
  if (!Array.isArray(v)) invalid('actual original array required');
  return v.map(row);
}
function text(v: unknown): string {
  if (typeof v !== 'string' || !v || v.trim() !== v)
    invalid('exact source reference required');
  return v;
}
const same = (a: unknown, b: unknown) =>
  canonicalSerialize(a) === canonicalSerialize(b);
function freeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
const ports = new WeakSet<object>();
export const POSTWAR_NARROW_TRADE_CURRENT_SOURCE_PURPOSE =
  'POSTWAR_NARROW_TRADE_CURRENT_SOURCE_RECHECK_V1' as const;
export const POSTWAR_NARROW_TRADE_AUTOMATIC_SOURCE_QUERY =
  'select * from world_v2.read_postwar_narrow_trade_automatic_source($1,$2,$3,$4::timestamptz,$5)';
export const POSTWAR_NARROW_TRADE_CURRENT_SOURCE_QUERY =
  'select * from world_v2.read_postwar_narrow_trade_current_source($1,$2,$3,$4,$5::uuid,$6,$7)';
export const POSTWAR_NARROW_TRADE_CURRENT_PAGED_SCOPE_QUERY =
  'select * from world_v2.read_postwar_narrow_trade_current_paged_scope($1,$2,$3,$4,$5::uuid,$6,$7)';
export const POSTWAR_NARROW_TRADE_AUTOMATIC_PAGED_SCOPE_QUERY =
  'select * from world_v2.read_postwar_narrow_trade_automatic_paged_scope($1,$2,$3,$4::timestamptz,$5)';
export const POSTWAR_NARROW_TRADE_CURRENT_SESSION_QUERY = `select current_user as role_name,r.rolsuper,r.rolbypassrls,r.rolcreatedb,r.rolcreaterole,r.rolreplication,current_setting('transaction_isolation')as isolation,current_setting('transaction_read_only')as read_only,pg_backend_pid()::text as backend_pid,(select virtualxid::text from pg_locks where pid=pg_backend_pid()and locktype='virtualxid'and granted limit 1)as virtual_xid,pg_has_role(current_user,'world_v2_postwar_narrow_trade_source','MEMBER')as reader_member,pg_has_role(current_user,'world_v2_postwar_narrow_trade_current_owner','MEMBER')as owner_member from pg_roles r where r.rolname=current_user`;
export interface PostwarNarrowTradeSourceCommitRequest {
  readonly phase: 'BEFORE_EVENTS';
  readonly purpose: typeof POSTWAR_NARROW_TRADE_CURRENT_SOURCE_PURPOSE;
  readonly command: CanonicalCommand;
  readonly transition: AuthoritativeTransition;
  readonly currentHead: DecisionResultHead;
  readonly observedAtReal: string;
  readonly readBinding: unknown;
  readonly commitAuthorization: CommitAuthorizationProof | null;
  readonly inventoryPostings: readonly InventoryLedgerPosting[];
  readonly financialPostingBatches: readonly FinancialPostingBatch[];
}
export interface PostwarNarrowTradeSourceCommitAudit {
  readonly status: 'CURRENT_SOURCE_RECHECKED_NOT_AUTHORITY';
  readonly purpose: typeof POSTWAR_NARROW_TRADE_CURRENT_SOURCE_PURPOSE;
  readonly commandFingerprint: string;
  readonly currentHead: DecisionResultHead;
  readonly readBindingFingerprint: string;
  readonly protectionMode: 'HELD_SOURCE_GUARDS';
}
export interface PostwarNarrowTradeSourceCommitProtectionPort {
  assertCurrentFrom(
    tx: SqlExecutor,
    request: Readonly<PostwarNarrowTradeSourceCommitRequest>,
  ): Promise<Readonly<PostwarNarrowTradeSourceCommitAudit>>;
}
export function isPostwarNarrowTradeCurrentSourceCommitProtectionPort(
  v: unknown,
): v is PostwarNarrowTradeSourceCommitProtectionPort {
  return v !== null && typeof v === 'object' && ports.has(v);
}
export type PostwarNarrowTradeCurrentMissing =
  | 'NATIVE_SOURCE_CUSTODY_NOT_INSTALLED'
  | 'ADMITTED_OPENING_STOCK'
  | 'SELLER_AVAILABLE_GRAIN'
  | 'BUYER_TREASURY_GCU_CASH'
  | 'SELLER_OWNER_GCU_CASH'
  | 'SELLER_OWNER_TRANSFER_MANDATE'
  | 'ADMITTED_CROSS_BORDER_ROUTE';
export interface PostwarNarrowTradeCurrentReadBinding {
  readonly schemaVersion: 'postwar-narrow-trade-current-binding-v1';
  readonly commandFingerprint: string;
  readonly observedAtReal: string;
  readonly head: DecisionResultHead;
  readonly seedId: string;
  readonly seedFingerprint: string;
  readonly admissionRef: string;
  readonly authorization: Readonly<{
    authSubject: string;
    teamId: string;
    authorizationVersion: string;
  }>;
  readonly originalsFingerprint: string;
  readonly financialFingerprint: string;
  readonly buyerTreasuryAccountId: string;
  readonly sellerSettlementAccountId: string;
}
export type PostwarNarrowTradeCurrentResult =
  | Readonly<{
      kind: 'MISSING';
      missing: readonly PostwarNarrowTradeCurrentMissing[];
      head: DecisionResultHead | null;
      submitted: false;
      queued: false;
    }>
  | Readonly<{
      kind: 'SOURCE_MATCH';
      binding: Readonly<PostwarNarrowTradeCurrentReadBinding>;
    }>;
export class PostwarNarrowTradeCurrentSourceMissing extends DomainError {
  readonly submitted = false;
  readonly queued = false;
  constructor(
    readonly result: Extract<
      PostwarNarrowTradeCurrentResult,
      { kind: 'MISSING' }
    >,
  ) {
    super(
      DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
      'POSTWAR_NARROW_TRADE_CURRENT_MISSING: ' + result.missing.join(','),
    );
  }
}
const families = new Set([
  'CORE_FINANCE_BUDGET_APPROPRIATION_V1',
  'CORE_SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATE_V1',
  'CORE_SOCIAL_EMPLOYMENT_SERVICE_CREATE_V1',
  'CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1',
  'CORE_SOCIAL_JOB_MATCH_SETTLEMENT_V1',
  POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND,
  'CORE_GOODS_TRANSFER_V1',
  'CORE_GOODS_SHIPMENT_V1',
  'CORE_GOODS_DELIVERY_V1',
  'CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1',
  'CORE_CENTRAL_BANK_OMO_V1',
  'POSTWAR_BENEFICIAL_HOUSING_RENT_V1',
]);
/** Inert protocol decoder. Unknown or incomplete inventory prefix fails closed;
 * it does not issue a source/authority capability. */
export function decodePostwarNarrowTradeCurrentPrefix(
  value: unknown,
  worldId: string,
) {
  const r = row(value);
  if (Buffer.byteLength(JSON.stringify(r)) > 1572864)
    invalid('REPLAY_UNAVAILABLE: bounded complete prefix exceeded');
  for (const c of rows(r.commands))
    if (!families.has(text(c.command_type)))
      invalid('REPLAY_UNAVAILABLE: unsupported canonical family');
  const journal = decodeBoundedPostwarJournal(r);
  return decodeBoundedPostwarCanonicalPrefix({
    worldId,
    prefixRow: r,
    journal,
  });
}
function one<T>(values: readonly T[]): T {
  if (values.length !== 1)
    invalid('exact immutable financial account required');
  return values[0]!;
}
async function replay(
  tx: SqlExecutor,
  hostCountryId: string,
  baseline: Readonly<PreparedPostwarSocialFinancialReplayBase>,
  value: Row,
  worldId: string,
  mode: 'OFFICIAL_RUNTIME' | 'TEST_ONLY_LOCAL',
) {
  const b = consumePreparedPostwarSocialFinancialReplayBase(baseline);
  const prefix = decodePostwarNarrowTradeCurrentPrefix(value, worldId);
  const quotes = rows(value.quotes);
  const originals: Parameters<
    typeof replayPreparedFinanceSocialFxLedger
  >[0]['fxOriginals'][number][] = [];
  for (const f of prefix.frames) {
    if (f.command.commandType !== POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND)
      continue;
    const payload = row(JSON.parse(f.command.canonicalPayload));
    const original = one(
      quotes.filter(
        (q) =>
          q.quote_ref === payload.quoteRef &&
          q.country_id === f.command.countryId,
      ),
    );
    const bytes = text(original.quote_text);
    if (
      Buffer.byteLength(bytes) > 4096 ||
      sha(bytes) !== original.quote_text_sha256
    )
      invalid('historical quote bytes mismatch');
    const q = parsePostwarDayOneFxQuoteData(JSON.parse(bytes), sha);
    if (
      canonicalSerialize(q) !== bytes ||
      q.worldId !== worldId ||
      q.countryId !== f.command.countryId ||
      q.seedFingerprint !== b.pins.contentHash ||
      q.quoteRef !== payload.quoteRef ||
      q.quoteSha256 !== payload.expectedQuoteSha256 ||
      !same(row(JSON.parse(f.events[0]!.canonicalPayload)).quote, q)
    )
      invalid('historical quote differs from committed event');
    for (const [id, payloadHash] of [
      [q.financialSourceId, q.financialSourcePayloadHash],
      [q.gcuSourceId, q.gcuSourcePayloadHash],
    ])
      if (
        b.sourceMetadata.filter(
          (s) => s.sourceId === id && s.payloadHash === payloadHash,
        ).length !== 1
      )
        invalid('historical quote source is not genuine opening metadata');
    const asset = (owner: string) =>
      one(
        b.financialAccounts.filter(
          (a) =>
            a.worldId === worldId &&
            a.countryId === q.countryId &&
            a.ownerId === owner &&
            a.counterpartyEntityId === q.centralBankEntityId &&
            a.currency === q.localCurrency &&
            a.accountClass === 'ASSET' &&
            a.claimId !== null,
        ),
      );
    const mirror = (a: FinancialAccount) =>
      one(
        b.financialAccounts.filter(
          (m) =>
            m.worldId === worldId &&
            m.countryId === a.countryId &&
            m.ownerId === q.centralBankEntityId &&
            m.counterpartyEntityId === a.ownerId &&
            m.claimId === a.claimId &&
            m.currency === a.currency &&
            m.accountClass === 'LIABILITY',
        ),
      );
    if (!originals.some((o) => o.quote.countryId === q.countryId)) {
      const treasuryAsset = asset(q.governmentEntityId),
        bankSettlementAsset = asset(q.bankEntityId);
      originals.push({
        quote: q,
        treasuryAsset,
        treasuryLiability: mirror(treasuryAsset),
        bankSettlementAsset,
        bankSettlementLiability: mirror(bankSettlementAsset),
        bankGcuAsset: one(
          b.financialAccounts.filter(
            (a) =>
              a.accountId === q.dealerGcuAccountId &&
              a.ownerId === q.bankEntityId &&
              a.countryId === q.countryId &&
              a.accountClass === 'CASH' &&
              a.currency === 'GCU',
          ),
        ),
      });
    }
  }
  if (quotes.length !== originals.length)
    invalid('unexpected/missing historical quote original');
  const history = await readPostwarNarrowTradeHistoryOriginalsFrom(tx, {
    baseline,
    mode,
    worldId,
    hostCountryId,
    frames: prefix.frames,
    expectedHead: prefix.head,
  });
  const replayed = replayPreparedFinanceSocialFxLedger({
    ...history,
    prepared: b.prepared,
    socialCreationOriginals:
      readPostwarSocialServiceCreationOriginalsForBase(baseline),
    frames: prefix.frames,
    socialCountries: b.document.countries.map((c) => ({
      countryId: c.countryId,
      state: c.state,
      offers: c.offers,
    })),
    openingEncumbrances: projectPostwarOpeningFinancialEncumbrances(b.funding),
    fxOriginals: originals,
    expectedHead: prefix.head,
    sha256Hex: sha,
  });
  return {
    prefix,
    financial: replayed.financial,
    inventory: replayed.inventory,
    goods: replayed.narrowGoodsTransfers,
  };
}
/** A complete cumulative Core result, never a last page relabelled as history.
 * The rights/lease RPC must have succeeded first on this exact transaction. */
async function replayPaged(
  tx: SqlExecutor,
  socialConnection: Readonly<PostwarSocialRuntimeConnection>,
  hostCountryId: string,
  value: Row,
  worldId: string,
  mode: 'OFFICIAL_RUNTIME' | 'TEST_ONLY_LOCAL',
) {
  const head = pagedScopeHead(value);
  const result = await readPagedFromPreparedSocialBaseOnHeldExecutor(tx, {
    socialConnection,
    worldId,
    hostCountryId,
    expectedHead: head,
    omoOriginalMode: mode,
  });
  try {
    const {
      financialState: financial,
      inventoryState: inventory,
      narrowGoodsTransfers: goods,
    } = result.view.result;
    if (!financial || !inventory)
      invalid('complete paged financial and inventory state required');
    if (
      result.seedPins.seedId !== value.seed_id ||
      result.seedPins.seedFingerprint !== value.seed_fingerprint ||
      result.seedPins.admissionRef !== value.admission_ref
    )
      invalid('paged replay and actual Trade custody pins differ');
    return {
      prefix: {
        head,
        frames: null,
        maxCommandSimTimeTicks: result.metadata.maxCommandSimTimeTicks,
        pageChainFingerprint: result.metadata.pageChainFingerprint,
      },
      financial,
      inventory,
      goods,
    };
  } finally {
    releasePostwarPagedFinanceSocialReplay(result);
  }
}
function pagedScopeHead(value: Row) {
  if (
    value.history_mode !== 'GENUINE_SHARED_PAGED_CORE_REPLAY_REQUIRED' ||
    typeof value.world_version !== 'string' ||
    !/^(0|[1-9]\d*)$/u.test(value.world_version) ||
    typeof value.event_sequence !== 'string' ||
    !/^(0|[1-9]\d*)$/u.test(value.event_sequence)
  )
    invalid('exact actual paged custody head required');
  return {
    worldVersion: value.world_version,
    eventSequence: value.event_sequence,
  };
}
type CurrentPrefix =
  | ReturnType<typeof decodePostwarNarrowTradeCurrentPrefix>
  | Awaited<ReturnType<typeof replayPaged>>['prefix'];
function prefixHasFutureCommand(prefix: CurrentPrefix, ticks: bigint): boolean {
  return prefix.frames === null
    ? BigInt(prefix.maxCommandSimTimeTicks) > ticks
    : prefix.frames.some((f) => f.command.simTime.ticks > ticks);
}
/** Only genuine Core opening DATA is retained. This separate path supports H0
 * only; it cannot claim a complete Social/mixed source without real E03 data. */
declare const openingPreparation: unique symbol;
export interface PostwarNarrowTradeOpeningPreparation {
  readonly [openingPreparation]: true;
}
const openingPreparations = new WeakMap<
  object,
  Readonly<{
    worldId: string;
    seedId: string;
    seedFingerprint: string;
    canonicalSeedSha256: string;
    admissionRef: string;
    financial: ReturnType<typeof rebuildV08LedgersFromLineage>['financial'];
    prepared: ReturnType<typeof prepareFinanceSocialLedgerFromOpening>;
    governments: readonly Readonly<{ countryId: string; ownerId: string }>[];
  }>
>();
export function preparePostwarNarrowTradeOpening(
  input: Readonly<{ seed: OpeningSeed; admissionRef: string }>,
): Readonly<PostwarNarrowTradeOpeningPreparation> {
  if (
    !isValidatedOpeningSeed(input.seed) ||
    typeof input.admissionRef !== 'string' ||
    !input.admissionRef.trim()
  )
    invalid('genuine Core seed and exact admission pin required');
  // A genuine instance can have been constructed with a caller-supplied digest.
  // Re-parse its exact bytes using this module's fixed real SHA before retaining DATA.
  const seed = parseOpeningSeed(
      JSON.parse(canonicalSerialize(input.seed)),
      sha,
    ),
    reconstructed = rebuildV08LedgersFromLineage({
      seed,
      sha256Hex: sha,
    });
  const financial = reconstructed.financial;
  const fs = seed.sources.filter(
    (s) =>
      row(JSON.parse(s.canonicalPayload)).schemaVersion ===
      'adopted-financial-opening-source-v2',
  );
  if (fs.length !== 1) invalid('exact adopted financial original required');
  const countries = rows(
    row(row(JSON.parse(fs[0]!.canonicalPayload)).assembly).countries,
  );
  const governments = countries.map((c) => ({
    countryId: text(c.countryId),
    ownerId: text(row(c.roster).government),
  }));
  if (new Set(governments.map((g) => g.countryId)).size !== governments.length)
    invalid('unique actual government roster required');
  const { fingerprint, ...intent } = seed;
  const token = Object.freeze({}) as PostwarNarrowTradeOpeningPreparation;
  openingPreparations.set(
    token,
    freeze({
      worldId: seed.worldId,
      seedId: seed.seedId,
      seedFingerprint: fingerprint,
      canonicalSeedSha256: sha(canonicalSerialize(intent)),
      admissionRef: input.admissionRef,
      financial,
      prepared: prepareFinanceSocialLedgerFromOpening(reconstructed, sha),
      governments,
    }),
  );
  return token;
}
/** Explicit independent Goods-only opening DATA. Foreign committed domains
 * remain unsupported without a genuine prepared Social/shared original. */
const goodsPreparations = new WeakSet<object>();
export function preparePostwarNarrowTradeGoodsOpening(
  input: Parameters<typeof preparePostwarNarrowTradeOpening>[0],
): Readonly<PostwarNarrowTradeOpeningPreparation> {
  const token = preparePostwarNarrowTradeOpening(input);
  goodsPreparations.add(token);
  return token;
}
export interface PostwarNarrowTradeAutomaticReadBinding {
  readonly schemaVersion:
    | 'postwar-narrow-trade-automatic-binding-v1'
    | 'postwar-narrow-trade-automatic-page-chain-binding-v2';
  readonly commandFingerprint: string;
  readonly observedAtReal: string;
  readonly head: DecisionResultHead;
  readonly workerId: string;
  readonly seedId: string;
  readonly seedFingerprint: string;
  readonly admissionRef: string;
  readonly prefixFingerprint: string;
  readonly transferFingerprint: string;
  readonly inventoryFingerprint: string;
  readonly financialFingerprint: string;
}
export interface PostwarNarrowTradeAutomaticPreparation {
  readonly transferCommand: CanonicalCommand;
  readonly inventory: Readonly<InventoryLedgerState>;
  readonly financial: Readonly<FinancialLedgerState>;
  readonly source: Readonly<import('@econmind/core').InventoryAccount>;
  readonly binding: Readonly<PostwarNarrowTradeAutomaticReadBinding>;
  readonly commitAssertion: import('@econmind/core').WorldWriterCommitAssertion;
}
const issuedCurrentSources = new WeakMap<object, string>();
export function isPostwarNarrowTradeCurrentSource(
  value: unknown,
  world?: string,
): value is Readonly<PostwarNarrowTradeCurrentSource> {
  return (
    value !== null &&
    typeof value === 'object' &&
    issuedCurrentSources.has(value) &&
    (world === undefined || issuedCurrentSources.get(value) === world)
  );
}
export interface PostwarNarrowTradeCurrentSource {
  inspectFrom(
    tx: SqlExecutor,
    input: Readonly<{
      command: CanonicalCommand;
      authorization: AuthorizedOfficeContext;
      observedAtReal: string;
    }>,
  ): Promise<PostwarNarrowTradeCurrentResult>;
  inspectCommitFrom(
    tx: SqlExecutor,
    input: Readonly<{
      command: CanonicalCommand;
      commitAuthorization: CommitAuthorizationProof | null;
      observedAtReal: string;
    }>,
  ): Promise<PostwarNarrowTradeCurrentResult>;
  inspectAutomaticFrom(
    tx: SqlExecutor,
    input: Readonly<{
      command: CanonicalCommand;
      workerId: string;
      observedAtReal: string;
    }>,
  ): Promise<Readonly<PostwarNarrowTradeAutomaticPreparation>>;
  readonly sourceCommitProtectionPort: Readonly<PostwarNarrowTradeSourceCommitProtectionPort>;
}
/** A private-issued shared instance supplies only its genuine immutable DATA
 * baseline. Every use still reads actual Trade authority, H, admission, sealed
 * stock, independently admitted rights and the complete prefix in this tx. */
export type PostwarNarrowTradeCurrentSourceConfiguration = {
  readonly runtimeRole: string;
  readonly historyMode?: 'PAGED';
} & (
  | Readonly<{
      sharedConnection: Readonly<PostwarFinanceSocialRuntimeConnection>;
    }>
  | Readonly<{
      goodsOpeningPreparation: Readonly<PostwarNarrowTradeOpeningPreparation>;
      workerId: string;
      clock: DurableConsumptionClock;
    }>
  | Readonly<{
      openingPreparation: Readonly<PostwarNarrowTradeOpeningPreparation>;
    }>
);
export function createPostwarNarrowTradeCurrentSource(
  configuration: PostwarNarrowTradeCurrentSourceConfiguration,
): Readonly<PostwarNarrowTradeCurrentSource> {
  if ('socialConnection' in configuration)
    invalid('use the fixed genuine Social internal constructor');
  return constructPostwarNarrowTradeCurrentSource(configuration);
}
/** Internal fixed composition: no shared consumer must already exist. This
 * issues source DATA factories only; current SQL, signatures and Atomic guards
 * still establish their own authority on every actual use. */
export function createPostwarNarrowTradeCurrentSourceFromSocial(
  input: Readonly<{
    socialConnection: Readonly<PostwarSocialRuntimeConnection>;
    runtimeRole: string;
    clock: DurableConsumptionClock;
    environment?: 'local' | 'ci' | 'staging' | 'production';
    historyMode?: 'PAGED';
  }>,
): Readonly<PostwarNarrowTradeCurrentSource> {
  const environment = input.environment ?? 'production';
  if (!['local', 'ci', 'staging', 'production'].includes(environment))
    invalid('fixed server runtime environment required');
  const social = input.socialConnection;
  if (!isPostwarSocialRuntimeConnection(social, social?.worldId))
    invalid('genuine fixed Social connection required');
  const resources = readPostwarSocialRuntimeConnectionResources(social);
  if (resources.workerRole !== input.runtimeRole)
    invalid('same genuine Social worker role required');
  if (
    !Object.isFrozen(input.clock) ||
    typeof Object.getOwnPropertyDescriptor(input.clock, 'nowReal')?.value !==
      'function' ||
    typeof Object.getOwnPropertyDescriptor(input.clock, 'simTime')?.value !==
      'function'
  )
    invalid('same immutable server clock required');
  return constructPostwarNarrowTradeCurrentSource({ ...input, environment });
}
function constructPostwarNarrowTradeCurrentSource(
  configuration:
    | PostwarNarrowTradeCurrentSourceConfiguration
    | Readonly<{
        socialConnection: Readonly<PostwarSocialRuntimeConnection>;
        runtimeRole: string;
        clock: DurableConsumptionClock;
        environment?: 'local' | 'ci' | 'staging' | 'production';
        historyMode?: 'PAGED';
      }>,
): Readonly<PostwarNarrowTradeCurrentSource> {
  const role = configuration.runtimeRole;
  if (
    !/^[a-z][a-z0-9_]{0,62}$/u.test(role) ||
    [
      'postgres',
      'service_role',
      'anon',
      'authenticated',
      'world_v2_postwar_narrow_trade_current_owner',
    ].includes(role)
  )
    invalid('fixed unprivileged runtime role required');
  const connection =
    'sharedConnection' in configuration ? configuration.sharedConnection : null;
  const fixedSocial =
    'socialConnection' in configuration ? configuration.socialConnection : null;
  const fixedClock =
    'socialConnection' in configuration ? configuration.clock : undefined;
  const opening =
    'openingPreparation' in configuration
      ? openingPreparations.get(configuration.openingPreparation)
      : 'goodsOpeningPreparation' in configuration &&
          goodsPreparations.has(configuration.goodsOpeningPreparation)
        ? openingPreparations.get(configuration.goodsOpeningPreparation)
        : undefined;
  const paged = configuration.historyMode === 'PAGED';
  if (paged && !connection && !fixedSocial)
    invalid('paged replay requires a genuine shared Social baseline');
  const goodsOnly = 'goodsOpeningPreparation' in configuration;
  if (!connection && !fixedSocial && !opening)
    invalid('genuine Core opening preparation required');
  const world = connection
    ? readPostwarFinanceSocialRuntimeBinding(connection).worldId
    : (fixedSocial?.worldId ?? opening!.worldId);
  const actualSocial = () => {
    if (connection) return readPostwarFinanceSocialRuntimeBinding(connection);
    if (!fixedSocial) return undefined;
    if (!isPostwarSocialRuntimeConnection(fixedSocial, world))
      invalid('fixed Social source connection is retired');
    return {
      worldId: world,
      workerId: fixedSocial.workerId,
      socialConnection: fixedSocial,
      clock: fixedClock!,
    };
  };
  const historyMode = (): 'OFFICIAL_RUNTIME' | 'TEST_ONLY_LOCAL' => {
    const environment = connection
      ? readPostwarFinanceSocialRuntimeBinding(connection).environment
      : 'socialConnection' in configuration
        ? (configuration.environment ?? 'production')
        : 'production';
    return environment === 'local' || environment === 'ci'
      ? 'TEST_ONLY_LOCAL'
      : 'OFFICIAL_RUNTIME';
  };
  const active = new WeakSet<object>();
  const session = async (tx: SqlExecutor) => {
    const result = await tx.query<Row>(
        POSTWAR_NARROW_TRADE_CURRENT_SESSION_QUERY,
      ),
      m = result.rows[0];
    if (
      result.rows.length !== 1 ||
      !m ||
      m.role_name !== role ||
      [
        m.rolsuper,
        m.rolbypassrls,
        m.rolcreatedb,
        m.rolcreaterole,
        m.rolreplication,
        m.owner_member,
      ].some((v) => v !== false) ||
      m.reader_member !== true ||
      m.read_only !== 'off' ||
      !['read committed', 'repeatable read', 'serializable'].includes(
        String(m.isolation),
      ) ||
      typeof m.backend_pid !== 'string' ||
      typeof m.virtual_xid !== 'string' ||
      !/^\d+\/\d+$/u.test(m.virtual_xid)
    )
      invalid('actual stable unprivileged transaction required');
    return canonicalSerialize(m);
  };
  async function inspect(
    tx: SqlExecutor,
    command: CanonicalCommand,
    authority: Readonly<{
      authSubject: string;
      teamId: string;
      authorizationVersion: string;
    }>,
    observedAtReal: string,
  ): Promise<PostwarNarrowTradeCurrentResult> {
    validateCanonicalCommand(command, sha);
    const t = parseNarrowTreasuryGcuTransferTerms(command);
    if (
      command.worldId !== world ||
      command.officeId !== 'TRADE' ||
      command.countryId !== t.sellerCountryId ||
      command.authSubject !== authority.authSubject ||
      new Date(observedAtReal).toISOString() !== observedAtReal
    )
      invalid('exact current Trade scope and time required');
    const shared = actualSocial();
    const baseline = shared
      ? consumePreparedPostwarSocialFinancialReplayBase(
          readPostwarSocialRuntimeFinancialReplayBase(
            shared.socialConnection,
            world,
          ),
        )
      : undefined;
    const identity = await session(tx);
    let response;
    try {
      response = await tx.query<Row>(
        paged
          ? POSTWAR_NARROW_TRADE_CURRENT_PAGED_SCOPE_QUERY
          : POSTWAR_NARROW_TRADE_CURRENT_SOURCE_QUERY,
        [
          world,
          t.sellerCountryId,
          t.buyerCountryId,
          t.assetSource.batchId,
          authority.authSubject,
          authority.teamId,
          authority.authorizationVersion,
        ],
      );
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        ['42883', '42P01'].includes(String(error.code))
      )
        return freeze({
          kind: 'MISSING',
          missing: ['NATIVE_SOURCE_CUSTODY_NOT_INSTALLED'],
          head: null,
          submitted: false,
          queued: false,
        });
      throw error;
    }
    if (response.rows.length !== 1)
      invalid('unique actual current original required');
    const r = response.rows[0]!;
    if (
      r.seed_id !== (baseline?.pins.seedRef ?? opening!.seedId) ||
      r.seed_fingerprint !==
        (baseline?.pins.contentHash ?? opening!.seedFingerprint) ||
      r.admission_ref !== (baseline?.pins.admissionRef ?? opening!.admissionRef)
    )
      invalid('actual admission differs from immutable preparation');
    if (
      opening &&
      !goodsOnly &&
      (r.world_version !== '0' || r.event_sequence !== '0')
    )
      invalid(
        'REPLAY_UNAVAILABLE: genuine opening-only preparation supports H0 only',
      );
    if (
      opening &&
      r.stock_status === 'SEALED_ADMITTED_OPENING' &&
      r.canonical_seed_sha256 !== opening.canonicalSeedSha256
    )
      invalid('actual sealed canonical seed SHA differs');
    const decoded = paged
      ? { head: pagedScopeHead(r), frames: null }
      : decodePostwarNarrowTradeCurrentPrefix(r, world);
    if (
      baseline &&
      rows(r.rights).length === 0 &&
      (paged ||
        decoded.frames?.some((f) =>
          [
            'CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1',
            'CORE_CENTRAL_BANK_OMO_V1',
            'POSTWAR_BENEFICIAL_HOUSING_RENT_V1',
          ].includes(f.command.commandType),
        ))
    ) {
      if ((await session(tx)) !== identity)
        invalid('transaction lifetime changed');
      return freeze({
        kind: 'MISSING',
        missing: [
          'SELLER_OWNER_TRANSFER_MANDATE',
          'ADMITTED_CROSS_BORDER_ROUTE',
        ],
        head: { worldId: world, ...decoded.head },
        submitted: false,
        queued: false,
      });
    }
    const { prefix, financial, inventory } = baseline
      ? paged
        ? await replayPaged(
            tx,
            shared!.socialConnection,
            t.sellerCountryId,
            r,
            world,
            historyMode(),
          )
        : await replay(tx, t.sellerCountryId, baseline, r, world, historyMode())
      : goodsOnly
        ? replayGoodsOnly(r)
        : {
            prefix: decodePostwarNarrowTradeCurrentPrefix(r, world),
            financial: opening!.financial,
            inventory: undefined,
          };
    const head = { worldId: world, ...prefix.head };
    if (
      command.expectedWorldVersion !== head.worldVersion ||
      prefixHasFutureCommand(prefix, command.simTime.ticks)
    )
      invalid('candidate precedes/differs from actual prefix');
    const missing: PostwarNarrowTradeCurrentMissing[] = [];
    if (r.stock_status !== 'SEALED_ADMITTED_OPENING')
      missing.push('ADMITTED_OPENING_STOCK');
    if (prefix.head.worldVersion !== '0' && !inventory)
      invalid('REPLAY_UNAVAILABLE: genuine current inventory base required');
    // The sealed opening document is provenance, never current stock after a
    // movement. Complete Core replay determines every current inventory balance.
    const stocks = inventory
        ? inventory.balances
            .filter(
              (b) =>
                b.account.countryId === t.sellerCountryId &&
                b.account.batchId === t.assetSource.batchId &&
                b.account.bucket === 'AVAILABLE',
            )
            .map((b) => ({
              account: b.account,
              quantity: {
                amount: b.quantity.amount.toFixed(),
                unit: b.quantity.unit,
              },
            }))
        : rows(r.stock),
      stock = stocks[0],
      a = stock ? row(stock.account) : null;
    if (
      stocks.length !== 1 ||
      !stock ||
      !a ||
      a.countryId !== t.sellerCountryId ||
      a.commodityId !== 'GRAIN' ||
      a.bucket !== 'AVAILABLE' ||
      a.reservationId !== null ||
      a.shipmentId !== null ||
      a.batchId !== t.assetSource.batchId ||
      a.unit !== t.quantity.unit ||
      a.titleHolderId !== t.assetSource.titleHolderId ||
      a.riskBearerId !== t.assetSource.riskBearerId ||
      a.physicalLocationId !== t.assetSource.physicalLocationId ||
      a.economicRecognitionId !== t.assetSource.economicRecognitionId ||
      parseWorldDecimal(text(row(stock.quantity).amount)).lessThan(
        t.quantity.amount,
      )
    )
      missing.push('SELLER_AVAILABLE_GRAIN');
    const governments = [
      ...new Set(
        baseline
          ? baseline.document.inputs.fundingAccounts
              .filter(
                (f) =>
                  f.countryId === t.buyerCountryId && f.payerRole === 'GOV',
              )
              .map((f) => f.payerEntityId)
          : opening!.governments
              .filter((g) => g.countryId === t.buyerCountryId)
              .map((g) => g.ownerId),
      ),
    ];
    const cash = (country: string, owner: string) =>
      financial.accounts.filter(
        (a) =>
          a.countryId === country &&
          a.ownerId === owner &&
          a.accountClass === 'CASH' &&
          a.currency === 'GCU' &&
          a.claimId === null &&
          a.counterpartyEntityId === null,
      );
    const buyer =
        governments.length === 1 ? cash(t.buyerCountryId, governments[0]!) : [],
      seller = cash(t.sellerCountryId, t.assetSource.titleHolderId);
    const amount = (id: string) =>
      financial.positions.find((p) => p.account.accountId === id)
        ?.netDebitBalance ?? Money.from('0', 'GCU');
    if (
      buyer.length !== 1 ||
      amount(buyer[0]!.accountId).amount.lessThan(
        t.price.multiply(t.quantity).amount,
      )
    )
      missing.push('BUYER_TREASURY_GCU_CASH');
    if (seller.length !== 1) missing.push('SELLER_OWNER_GCU_CASH');
    const rights: Row[] = [];
    for (const original of rows(r.rights)) {
      const bytes = text(original.canonical_payload),
        sourceId = text(original.source_id),
        payloadHash = text(original.source_payload_hash);
      if (
        Buffer.byteLength(bytes) > 65536 ||
        hash({ payload: JSON.parse(bytes) }) !== payloadHash ||
        canonicalSerialize(JSON.parse(bytes)) !== bytes
      )
        invalid('rights original is not genuine admitted immutable source');
      for (const field of [
        'domain_admission_ref',
        'domain_admission_revision',
        'issuer_ref',
        'custodian_ref',
      ])
        text(original[field]);
      if (
        typeof original.admission_evidence_sha256 !== 'string' ||
        !/^[a-f0-9]{64}$/u.test(original.admission_evidence_sha256)
      )
        invalid('actual independent domain admission evidence required');
      const body = row(JSON.parse(bytes));
      if (
        body.schemaVersion !== 'postwar-narrow-trade-operating-rights-v1' ||
        body.worldId !== world
      )
        invalid('exact operating-rights original required');
      for (const record of rows(body.records))
        rights.push({
          ...record,
          sourceId,
          domainAdmissionRef: text(original.domain_admission_ref),
          domainAdmissionRevision: text(original.domain_admission_revision),
        });
    }
    const effective = (v: Row) =>
      typeof v.effectiveFromSimTime === 'string' &&
      /^(0|[1-9]\d*)$/u.test(v.effectiveFromSimTime) &&
      BigInt(v.effectiveFromSimTime) <= command.simTime.ticks &&
      (v.effectiveUntilSimTime === null ||
        (typeof v.effectiveUntilSimTime === 'string' &&
          /^(0|[1-9]\d*)$/u.test(v.effectiveUntilSimTime) &&
          BigInt(v.effectiveUntilSimTime) > command.simTime.ticks)) &&
      v.revokedByRevision === null &&
      v.commodityId === 'GRAIN' &&
      v.unit === t.quantity.unit &&
      typeof v.maximumQuantity === 'string' &&
      !parseWorldDecimal(v.maximumQuantity).lessThan(t.quantity.amount);
    const mandate = rights.filter(
      (v) =>
        v.kind === 'OWNER_TRANSFER_MANDATE' &&
        v.countryId === t.sellerCountryId &&
        v.ownerId === t.assetSource.titleHolderId &&
        v.authSubject === authority.authSubject &&
        v.batchId === t.assetSource.batchId &&
        v.buyerCountryId === t.buyerCountryId &&
        effective(v),
    );
    const route = rights.filter(
      (v) =>
        v.kind === 'CROSS_BORDER_ROUTE' &&
        v.fromCountryId === t.sellerCountryId &&
        v.toCountryId === t.buyerCountryId &&
        effective(v),
    );
    if (mandate.length !== 1) missing.push('SELLER_OWNER_TRANSFER_MANDATE');
    if (route.length !== 1) missing.push('ADMITTED_CROSS_BORDER_ROUTE');
    if ((await session(tx)) !== identity)
      invalid('transaction lifetime changed');
    if (missing.length)
      return freeze({
        kind: 'MISSING',
        missing,
        head,
        submitted: false,
        queued: false,
      });
    return freeze({
      kind: 'SOURCE_MATCH',
      binding: {
        schemaVersion: 'postwar-narrow-trade-current-binding-v1',
        commandFingerprint: command.fingerprint,
        observedAtReal,
        head,
        seedId: text(r.seed_id),
        seedFingerprint: text(r.seed_fingerprint),
        admissionRef: text(r.admission_ref),
        authorization: {
          authSubject: authority.authSubject,
          teamId: authority.teamId,
          authorizationVersion: authority.authorizationVersion,
        },
        originalsFingerprint: hash({ stock, rights: rows(r.rights) }),
        financialFingerprint: hash(financial),
        buyerTreasuryAccountId: buyer[0]!.accountId,
        sellerSettlementAccountId: seller[0]!.accountId,
      },
    });
  }
  function replayGoodsOnly(r: Row) {
    const prefix = decodePostwarNarrowTradeCurrentPrefix(r, world);
    if (
      !opening ||
      prefix.frames.some(
        (f) =>
          ![
            'CORE_GOODS_TRANSFER_V1',
            'CORE_GOODS_SHIPMENT_V1',
            'CORE_GOODS_DELIVERY_V1',
          ].includes(f.command.commandType),
      )
    )
      invalid(
        'REPLAY_UNAVAILABLE: independent paired opening supports Goods-only prefix',
      );
    const current = replayPreparedFinanceSocialFxLedger({
      prepared: opening.prepared,
      frames: prefix.frames,
      socialCountries: [],
      openingEncumbrances: [],
      fxOriginals: [],
      expectedHead: prefix.head,
      sha256Hex: sha,
    });
    return {
      prefix,
      financial: current.financial,
      inventory: current.inventory,
      goods: current.narrowGoodsTransfers,
    };
  }
  const inspectAutomaticFrom: PostwarNarrowTradeCurrentSource['inspectAutomaticFrom'] =
    async (tx, input) => {
      const c = validateCanonicalCommand(input.command, sha),
        at = input.observedAtReal,
        shared = actualSocial(),
        holder =
          shared?.workerId ??
          ('workerId' in configuration ? configuration.workerId : undefined),
        clock =
          shared?.clock ??
          ('clock' in configuration ? configuration.clock : undefined);
      const nowSim = clock
        ? SimTime.fromTicks(await clock.simTime(world))
        : undefined;
      if (
        !holder ||
        !clock ||
        holder !== input.workerId ||
        c.worldId !== world ||
        c.officeId !== null ||
        !['CORE_GOODS_SHIPMENT_V1', 'CORE_GOODS_DELIVERY_V1'].includes(
          c.commandType,
        ) ||
        c.expectedWorldVersion === null ||
        new Date(at).toISOString() !== at ||
        !nowSim ||
        c.simTime.ticks > nowSim.ticks
      )
        invalid(
          'fixed automatic Goods worker, due Command and server time required',
        );
      const identity = await session(tx);
      const leaseRow = await tx.query<Row>(
        'select world_id,holder_id,fencing_token::text,acquired_at_real,renewed_at_real,lease_expires_at_real from world_v2.world_writer_lease where world_id=$1 for share',
        [world],
      );
      if (leaseRow.rows.length !== 1)
        invalid('actual automatic lease required');
      const l = leaseRow.rows[0]!,
        stamp = (v: unknown) => (v instanceof Date ? v.toISOString() : text(v)),
        lease = parseWorldWriterLease({
          schemaVersion: 'world-writer-lease-v1',
          worldId: text(l.world_id),
          holderId: text(l.holder_id),
          fencingToken: text(l.fencing_token),
          acquiredAtReal: stamp(l.acquired_at_real),
          renewedAtReal: stamp(l.renewed_at_real),
          expiresAtReal: stamp(l.lease_expires_at_real),
        });
      if (
        lease.holderId !== holder ||
        lease.renewedAtReal > at ||
        lease.expiresAtReal <= at
      )
        invalid('actual current automatic lease differs');
      const response = await tx.query<Row>(
        paged
          ? POSTWAR_NARROW_TRADE_AUTOMATIC_PAGED_SCOPE_QUERY
          : POSTWAR_NARROW_TRADE_AUTOMATIC_SOURCE_QUERY,
        [world, c.commandId, holder, at, nowSim!.toCanonicalValue()],
      );
      if (response.rows.length !== 1)
        invalid('one complete fixed automatic source required');
      const r = response.rows[0]!,
        baseline = shared
          ? consumePreparedPostwarSocialFinancialReplayBase(
              readPostwarSocialRuntimeFinancialReplayBase(
                shared.socialConnection,
                world,
              ),
            )
          : undefined;
      if (
        r.seed_id !== (baseline?.pins.seedRef ?? opening?.seedId) ||
        r.seed_fingerprint !==
          (baseline?.pins.contentHash ?? opening?.seedFingerprint) ||
        r.admission_ref !==
          (baseline?.pins.admissionRef ?? opening?.admissionRef) ||
        (opening && r.canonical_seed_sha256 !== opening.canonicalSeedSha256)
      )
        invalid('automatic actual admitted opening differs');
      const replayed = baseline
          ? paged
            ? await replayPaged(
                tx,
                shared!.socialConnection,
                c.countryId,
                r,
                world,
                historyMode(),
              )
            : await replay(tx, c.countryId, baseline, r, world, historyMode())
          : replayGoodsOnly(r),
        { prefix, financial, inventory } = replayed;
      if (
        !inventory ||
        c.expectedWorldVersion !== prefix.head.worldVersion ||
        prefixHasFutureCommand(prefix, c.simTime.ticks)
      )
        invalid('automatic exact complete current inventory/head required');
      const payload = row(JSON.parse(c.canonicalPayload)),
        entry = replayed.goods?.find(
          (g) => g.transfer.commandId === payload.transferCommandId,
        );
      if (
        !entry ||
        entry.delivered ||
        payload.transferFingerprint !== entry.transfer.fingerprint
      )
        invalid('actual unfinished committed Goods obligation required');
      let source: import('@econmind/core').InventoryAccount;
      if (c.commandType === 'CORE_GOODS_SHIPMENT_V1') {
        const terms = parseNarrowTreasuryGcuShipmentTerms({
          shipmentCommand: c,
          transferCommand: entry.transfer,
          sha256Hex: sha,
        });
        if (
          entry.shipmentId !== null ||
          replayed.goods?.some((g) => g.shipmentId === terms.shipmentId)
        )
          invalid('obligation already shipped or duplicate shipment identity');
        source = one(
          inventory.balances
            .filter((b) => same(b.account, entry.reservation))
            .map((b) => b.account),
        );
      } else {
        const terms = parseNarrowTreasuryGcuDeliveryTerms({
          deliveryCommand: c,
          transferCommand: entry.transfer,
          sha256Hex: sha,
        });
        if (entry.shipmentId !== terms.shipmentId)
          invalid('actual committed shipment differs');
        // The committed payment policy is BUYER_TREASURY_GCU. Core's generic
        // movement primitive does not confer government control over another
        // domestic owner's cash. Reuse the same actual GOV roster as Reserve.
        const transferTerms = parseNarrowTreasuryGcuTransferTerms(
          entry.transfer,
        );
        const governments = [
          ...new Set(
            baseline
              ? baseline.document.inputs.fundingAccounts
                  .filter(
                    (f) =>
                      f.countryId === transferTerms.buyerCountryId &&
                      f.payerRole === 'GOV',
                  )
                  .map((f) => f.payerEntityId)
              : opening!.governments
                  .filter((g) => g.countryId === transferTerms.buyerCountryId)
                  .map((g) => g.ownerId),
          ),
        ];
        const cash = (owner: string, country: string) =>
          financial.accounts.filter(
            (a) =>
              a.ownerId === owner &&
              a.countryId === country &&
              a.accountClass === 'CASH' &&
              a.currency === 'GCU' &&
              a.claimId === null &&
              a.counterpartyEntityId === null,
          );
        const buyer =
            governments.length === 1
              ? cash(governments[0]!, transferTerms.buyerCountryId)
              : [],
          seller = cash(
            transferTerms.assetSource.titleHolderId,
            transferTerms.sellerCountryId,
          );
        if (
          buyer.length !== 1 ||
          seller.length !== 1 ||
          terms.buyerTreasuryAccountId !== buyer[0]!.accountId ||
          terms.sellerSettlementAccountId !== seller[0]!.accountId ||
          terms.destination.titleHolderId !== buyer[0]!.ownerId
        )
          invalid(
            'automatic actual GOV treasury and original seller-title accounts required',
          );

        source = one(
          inventory.balances
            .filter(
              (b) =>
                b.account.shipmentId === entry.shipmentId &&
                b.account.bucket === 'IN_TRANSIT',
            )
            .map((b) => b.account),
        );
      }
      if ((await session(tx)) !== identity)
        invalid('automatic source transaction lifetime changed');
      return freeze({
        transferCommand: entry.transfer,
        source,
        inventory,
        financial,
        commitAssertion: createWorldWriterCommitAssertion(
          lease,
          c.expectedWorldVersion,
        ),
        binding: {
          schemaVersion:
            prefix.frames === null
              ? 'postwar-narrow-trade-automatic-page-chain-binding-v2'
              : 'postwar-narrow-trade-automatic-binding-v1',
          commandFingerprint: c.fingerprint,
          observedAtReal: at,
          head: { worldId: world, ...prefix.head },
          workerId: holder,
          seedId: text(r.seed_id),
          seedFingerprint: text(r.seed_fingerprint),
          admissionRef: text(r.admission_ref),
          prefixFingerprint:
            prefix.frames === null
              ? prefix.pageChainFingerprint
              : hash(prefix.frames),
          transferFingerprint: entry.transfer.fingerprint,
          inventoryFingerprint: hash(inventory),
          financialFingerprint: hash(financial),
        },
      });
    };
  const inspectCommitFrom: PostwarNarrowTradeCurrentSource['inspectCommitFrom'] =
    async (tx, input) => {
      const c = input.command,
        p = input.commitAuthorization;
      if (
        !isCommitAuthorizationProof(p) ||
        p.capability !== 'TRADE_CONTRACTS' ||
        p.commandId !== c.commandId ||
        p.commandFingerprint !== c.fingerprint ||
        p.authSubject !== c.authSubject ||
        p.worldId !== world ||
        p.worldId !== c.worldId ||
        p.countryId !== c.countryId ||
        p.officeId !== 'TRADE'
      )
        invalid('genuine exact Trade commit authorization required');
      await reauthorizeCommitAuthorizationProof(p);
      // Worker GUC comes only from the actual server-issued command proof. No
      // HTTP scope/subject, ready flag or caller-created authorization is used.
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
        p.authSubject,
      ]);
      return inspect(tx, c, p, input.observedAtReal);
    };
  const sourceCommitProtectionPort: PostwarNarrowTradeSourceCommitProtectionPort =
    Object.freeze({
      async assertCurrentFrom(
        tx: SqlExecutor,
        request: Readonly<PostwarNarrowTradeSourceCommitRequest>,
      ): Promise<Readonly<PostwarNarrowTradeSourceCommitAudit>> {
        if (active.has(tx))
          invalid('nonreentrant same-executor cutoff required');
        const { command: c, commitAuthorization: p, transition: t } = request;
        if (
          ['CORE_GOODS_SHIPMENT_V1', 'CORE_GOODS_DELIVERY_V1'].includes(
            c.commandType,
          )
        ) {
          if (
            request.phase !== 'BEFORE_EVENTS' ||
            request.purpose !== POSTWAR_NARROW_TRADE_CURRENT_SOURCE_PURPOSE ||
            p !== null ||
            c.officeId !== null ||
            request.inventoryPostings.length !== 1
          )
            invalid('fixed automatic Goods source cutoff required');
          validateAuthoritativeTransition(t);
          if (
            t.commandId !== c.commandId ||
            t.commandFingerprint !== c.fingerprint ||
            t.worldId !== world ||
            t.events.length !== 1 ||
            t.worldVersionBefore !== request.currentHead.worldVersion
          )
            invalid('exact automatic Goods transition required');
          active.add(tx);
          try {
            const binding = row(request.readBinding),
              prepared = await inspectAutomaticFrom(tx, {
                command: c,
                workerId: text(binding.workerId),
                observedAtReal: request.observedAtReal,
              });
            if (
              !same(prepared.binding, request.readBinding) ||
              !same(prepared.binding.head, request.currentHead)
            )
              invalid('automatic Goods source changed before commit');
            const posting = request.inventoryPostings[0]!;
            if (posting.schemaVersion !== 'inventory-posting-v1')
              invalid('automatic narrow inventory movement required');
            const event = t.events[0]!;
            let expected: import('@econmind/core').InventoryPosting;
            if (c.commandType === 'CORE_GOODS_SHIPMENT_V1') {
              if (request.financialPostingBatches.length !== 0)
                invalid('shipment has no financial effect');
              const terms = parseNarrowTreasuryGcuShipmentTerms({
                shipmentCommand: c,
                transferCommand: prepared.transferCommand,
                sha256Hex: sha,
              });
              if (
                event.eventType !== 'NARROW_TREASURY_GCU_SHIPPED_V1' ||
                !same(JSON.parse(event.canonicalPayload), {
                  schemaVersion: 'narrow-treasury-gcu-shipment-event-v1',
                  shipmentId: terms.shipmentId,
                  transferCommandId: prepared.transferCommand.commandId,
                  transferFingerprint: prepared.transferCommand.fingerprint,
                })
              )
                invalid('exact automatic shipment event required');
              expected = shipNarrowTreasuryGcuTransfer({
                shipmentCommand: c,
                transferCommand: prepared.transferCommand,
                inventoryState: prepared.inventory,
                source: prepared.source,
                postingId: posting.postingId,
                transition: t,
                causationEventIds: t.eventIds,
                sha256Hex: sha,
              }).posting;
            } else {
              const batch = request.financialPostingBatches[0],
                terms = parseNarrowTreasuryGcuDeliveryTerms({
                  deliveryCommand: c,
                  transferCommand: prepared.transferCommand,
                  sha256Hex: sha,
                });
              if (
                request.financialPostingBatches.length !== 1 ||
                !batch ||
                batch.legs.length !== 2
              )
                invalid('exact automatic delivery settlement required');
              if (
                event.eventType !== 'NARROW_TREASURY_GCU_DELIVERED_V1' ||
                !same(JSON.parse(event.canonicalPayload), {
                  schemaVersion: 'narrow-treasury-gcu-delivery-event-v1',
                  shipmentId: terms.shipmentId,
                  transferCommandId: prepared.transferCommand.commandId,
                  transferFingerprint: prepared.transferCommand.fingerprint,
                })
              )
                invalid('exact automatic delivery event required');
              const buyer = one(
                  prepared.financial.accounts.filter(
                    (a) => a.accountId === terms.buyerTreasuryAccountId,
                  ),
                ),
                seller = one(
                  prepared.financial.accounts.filter(
                    (a) => a.accountId === terms.sellerSettlementAccountId,
                  ),
                );
              const buyerLeg = batch.legs.find(
                  (l) => l.account.accountId === buyer.accountId,
                ),
                sellerLeg = batch.legs.find(
                  (l) => l.account.accountId === seller.accountId,
                );
              if (!buyerLeg || !sellerLeg)
                invalid('exact delivery buyer/seller legs required');
              const derived = deliverNarrowTreasuryGcuTransfer({
                deliveryCommand: c,
                transferCommand: prepared.transferCommand,
                inventoryState: prepared.inventory,
                financialState: prepared.financial,
                source: prepared.source,
                inventoryPostingId: posting.postingId,
                financialBatchId: batch.batchId,
                buyerTreasuryLegId: buyerLeg.legId,
                sellerSettlementLegId: sellerLeg.legId,
                buyerTreasury: buyer,
                sellerSettlement: seller,
                transition: t,
                causationEventIds: t.eventIds,
                sha256Hex: sha,
              });
              if (!same(derived.settlement, batch))
                invalid(
                  'automatic delivery financial legs differ from actual source',
                );
              expected = derived.posting;
            }
            if (!same(expected, posting))
              invalid('automatic Goods inventory differs from actual source');
            return freeze({
              status: 'CURRENT_SOURCE_RECHECKED_NOT_AUTHORITY',
              purpose: POSTWAR_NARROW_TRADE_CURRENT_SOURCE_PURPOSE,
              commandFingerprint: c.fingerprint,
              currentHead: { ...request.currentHead },
              readBindingFingerprint: hash(request.readBinding),
              protectionMode: 'HELD_SOURCE_GUARDS',
            });
          } finally {
            active.delete(tx);
          }
        }
        if (
          request.phase !== 'BEFORE_EVENTS' ||
          request.purpose !== POSTWAR_NARROW_TRADE_CURRENT_SOURCE_PURPOSE ||
          !isCommitAuthorizationProof(p) ||
          p.capability !== 'TRADE_CONTRACTS' ||
          p.commandId !== c.commandId ||
          p.commandFingerprint !== c.fingerprint ||
          p.authSubject !== c.authSubject ||
          p.worldId !== c.worldId ||
          p.countryId !== c.countryId ||
          p.officeId !== 'TRADE'
        )
          invalid('genuine exact Trade commit authorization required');
        validateAuthoritativeTransition(t);
        if (
          t.events.length !== 1 ||
          t.events[0]!.eventType !== 'NARROW_TREASURY_GCU_RESERVED_V1' ||
          !same(JSON.parse(t.events[0]!.canonicalPayload), {
            schemaVersion: 'narrow-treasury-gcu-reservation-event-v1',
            transferFingerprint: c.fingerprint,
          })
        )
          invalid('exact narrow reservation event required');
        if (
          t.commandId !== c.commandId ||
          t.commandFingerprint !== c.fingerprint ||
          t.worldId !== c.worldId
        )
          invalid('transition differs from exact command');
        if (
          request.currentHead.worldId !== world ||
          request.currentHead.worldVersion !== t.worldVersionBefore ||
          request.financialPostingBatches.length !== 0 ||
          request.inventoryPostings.length !== 1
        )
          invalid('exact reserve-only candidate required');
        const posting = request.inventoryPostings[0]!;
        if (
          posting.schemaVersion !== 'inventory-posting-v1' ||
          posting.operation !== 'RESERVE' ||
          posting.entries.length !== 2
        )
          invalid('unsupported inventory candidate');
        const terms = parseNarrowTreasuryGcuTransferTerms(c),
          from = posting.entries[0]!,
          to = posting.entries[1]!;
        if (
          from.account.countryId !== terms.sellerCountryId ||
          from.account.commodityId !== 'GRAIN' ||
          from.account.batchId !== terms.assetSource.batchId ||
          from.account.titleHolderId !== terms.assetSource.titleHolderId ||
          from.account.riskBearerId !== terms.assetSource.riskBearerId ||
          from.account.physicalLocationId !==
            terms.assetSource.physicalLocationId ||
          from.account.economicRecognitionId !==
            terms.assetSource.economicRecognitionId ||
          !to.delta.amount.equals(terms.quantity.amount) ||
          to.delta.unit !== terms.quantity.unit
        )
          invalid('candidate differs from exact asset/quantity');
        const expected = createReservationPosting(
          {
            ...posting,
            command: c,
            transition: t,
            quantity: terms.quantity,
            source: from.account,
            destination: to.account,
          },
          sha,
        );
        if (!same(expected, posting))
          invalid('candidate posting differs from genuine reserve derivation');
        active.add(tx);
        try {
          const result = await inspectCommitFrom(tx, {
            command: c,
            commitAuthorization: p,
            observedAtReal: request.observedAtReal,
          });
          if (result.kind === 'MISSING')
            throw new PostwarNarrowTradeCurrentSourceMissing(result);
          if (
            !same(result.binding, request.readBinding) ||
            !same(result.binding.head, request.currentHead)
          )
            invalid('source changed since candidate preparation');
          await reauthorizeCommitAuthorizationProof(p);
          return freeze({
            status: 'CURRENT_SOURCE_RECHECKED_NOT_AUTHORITY',
            purpose: POSTWAR_NARROW_TRADE_CURRENT_SOURCE_PURPOSE,
            commandFingerprint: c.fingerprint,
            currentHead: { ...request.currentHead },
            readBindingFingerprint: hash(request.readBinding),
            protectionMode: 'HELD_SOURCE_GUARDS',
          });
        } finally {
          active.delete(tx);
        }
      },
    });
  ports.add(sourceCommitProtectionPort);
  const source: Readonly<PostwarNarrowTradeCurrentSource> = Object.freeze({
    sourceCommitProtectionPort,
    inspectAutomaticFrom,
    inspectCommitFrom,
    async inspectFrom(
      tx: SqlExecutor,
      input: Readonly<{
        command: CanonicalCommand;
        authorization: AuthorizedOfficeContext;
        observedAtReal: string;
      }>,
    ) {
      const a = input.authorization;
      if (
        !isAuthorizedOfficeContext(a) ||
        a.worldId !== world ||
        a.countryId !== input.command.countryId ||
        a.officeId !== 'TRADE' ||
        a.capability !== 'TRADE_CONTRACTS' ||
        a.authSubject !== input.command.authSubject
      )
        invalid('genuine seller Trade authorization required');
      if (!same(await reauthorizeOfficeCapability(a), a))
        invalid('current seller Trade changed');
      return inspect(tx, input.command, a, input.observedAtReal);
    },
  });
  issuedCurrentSources.set(source, world);
  return source;
}
