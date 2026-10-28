/** Server-only original-source guard for fresh postwar ADR-09 writes. No FX,
 * money creation, OP representation, transport right or admission is inferred. */
import { createHash } from 'node:crypto';
import {
  DOMAIN_ERROR_CODES,
  DomainError,
  canonicalSerialize,
  parseWorldDecimal,
  parseNarrowTreasuryGcuTransferTerms,
  validateCanonicalCommand,
  isAuthorizedOfficeContext,
  reauthorizeOfficeCapability,
  type CanonicalCommand,
  type AuthorizedOfficeContext,
} from '@econmind/core';
import type { SqlExecutor } from './sql-database.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const guards = new WeakSet<object>();
export const POSTWAR_NARROW_TRADE_SOURCE_QUERY =
  'select * from world_v2.read_postwar_narrow_trade_source($1,$2,$3,$4,$5,$6,$7)';
export const POSTWAR_NARROW_TRADE_SOURCE_SESSION = `select current_user as role_name,r.rolsuper,r.rolbypassrls,r.rolcreaterole,r.rolcreatedb,r.rolreplication,current_setting('transaction_isolation')as isolation,current_setting('transaction_read_only')as read_only,pg_has_role(current_user,'world_v2_postwar_projection_owner','MEMBER')as owner_member from pg_roles r where r.rolname=current_user`;
export type PostwarNarrowTradeMissing =
  | 'NATIVE_SOURCE_CUSTODY_NOT_INSTALLED'
  | 'CURRENT_ADMITTED_H0_SOURCE'
  | 'CURRENT_SETTLED_LINEAGE_REQUIRED'
  | 'SELLER_AVAILABLE_GRAIN'
  | 'BUYER_TREASURY_GCU_CASH'
  | 'SELLER_OWNER_GCU_CASH'
  | 'SELLER_OWNER_TRANSFER_MANDATE'
  | 'ADMITTED_CROSS_BORDER_ROUTE';
type Row = Record<string, unknown>;
export type PostwarNarrowTradeSourceResult =
  | Readonly<{
      kind: 'MISSING';
      missing: readonly PostwarNarrowTradeMissing[];
      source: Readonly<{
        seedFingerprint: string | null;
        admissionRef: string | null;
        worldVersion: string | null;
        eventSequence: string | null;
      }>;
      submitted: false;
      queued: false;
    }>
  | Readonly<{
      kind: 'SOURCE_MATCH';
      binding: Readonly<{
        seedFingerprint: string;
        admissionRef: string;
        commandFingerprint: string;
        buyerTreasuryAccountId: string;
        sellerSettlementAccountId: string;
        mandateSourceId: string;
        routeSourceId: string;
        mandateAdmissionRef: string;
        routeAdmissionRef: string;
        fingerprint: string;
      }>;
    }>;
export class PostwarNarrowTradeSourceMissing extends DomainError {
  readonly status = 'MISSING' as const;
  readonly submitted = false;
  readonly queued = false;
  constructor(
    readonly result: Extract<
      PostwarNarrowTradeSourceResult,
      { kind: 'MISSING' }
    >,
  ) {
    super(
      DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
      `Postwar narrow Trade source missing: ${result.missing.join(',')}`,
    );
  }
}
function invalid(reason: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    `POSTWAR_NARROW_TRADE_SOURCE: ${reason}`,
  );
}
function row(v: unknown): Row {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    invalid('closed native original result required');
  return v as Row;
}
function rows(v: unknown): Row[] {
  if (!Array.isArray(v)) invalid('native original array required');
  return v.map(row);
}
function freeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
function text(v: unknown): string {
  if (typeof v !== 'string' || !v) invalid('source reference required');
  return v;
}

export interface PostwarNarrowTradeFreshSourceGuard {
  inspectFrom(
    tx: SqlExecutor,
    input: Readonly<{
      command: CanonicalCommand;
      authorization: AuthorizedOfficeContext;
    }>,
  ): Promise<PostwarNarrowTradeSourceResult>;
  assertFrom(
    tx: SqlExecutor,
    input: Readonly<{
      command: CanonicalCommand;
      authorization: AuthorizedOfficeContext;
    }>,
  ): Promise<void>;
}
export function isPostwarNarrowTradeFreshSourceGuard(
  v: unknown,
): v is PostwarNarrowTradeFreshSourceGuard {
  return Boolean(v && typeof v === 'object' && guards.has(v));
}
/** Only explicit server construction can register this fixed SQL reader. The
 * intake owns submission -> H -> current-authority locks before calling it.
 * Original admission's permit lock is held by SQL until the OUTER commit. */
export function createPostwarNarrowTradeFreshSourceGuard(configuration: {
  readonly runtimeRole: string;
}): Readonly<PostwarNarrowTradeFreshSourceGuard> {
  const role = configuration.runtimeRole;
  if (
    !/^[a-z][a-z0-9_]{0,62}$/u.test(role) ||
    ['anon', 'authenticated', 'service_role', 'postgres'].includes(role)
  )
    invalid('fixed separated server role required');
  const inspectFrom: PostwarNarrowTradeFreshSourceGuard['inspectFrom'] = async (
    tx,
    input,
  ) => {
    const command = validateCanonicalCommand(input.command, sha),
      terms = parseNarrowTreasuryGcuTransferTerms(command),
      auth = input.authorization;
    if (
      !isAuthorizedOfficeContext(auth) ||
      auth.worldId !== command.worldId ||
      auth.countryId !== terms.sellerCountryId ||
      auth.officeId !== 'TRADE' ||
      auth.capability !== 'TRADE_CONTRACTS' ||
      auth.authSubject !== command.authSubject
    )
      invalid('genuine current seller Trade authorization required');
    const current = await reauthorizeOfficeCapability(auth);
    if (canonicalSerialize(current) !== canonicalSerialize(auth))
      invalid('seller authority changed before source evaluation');
    const mode = await tx.query<Row>(POSTWAR_NARROW_TRADE_SOURCE_SESSION),
      m = mode.rows[0];
    if (
      mode.rows.length !== 1 ||
      !m ||
      m.role_name !== role ||
      m.rolsuper !== false ||
      m.rolbypassrls !== false ||
      m.rolcreaterole !== false ||
      m.rolcreatedb !== false ||
      m.rolreplication !== false ||
      m.owner_member !== false ||
      m.read_only !== 'off' ||
      !['read committed', 'repeatable read', 'serializable'].includes(
        String(m.isolation),
      )
    )
      invalid('stable owning transaction and unprivileged fixed role required');
    let result;
    try {
      result = await tx.query<Row>(POSTWAR_NARROW_TRADE_SOURCE_QUERY, [
        command.worldId,
        terms.sellerCountryId,
        terms.buyerCountryId,
        terms.assetSource.batchId,
        auth.authSubject,
        auth.teamId,
        auth.authorizationVersion,
      ]);
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? error.code
          : null;
      if (code === '42501')
        throw new DomainError(
          DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED,
          'Current postwar narrow source authorization is required',
        );
      if (code === '42883' || code === '42P01')
        return freeze({
          kind: 'MISSING' as const,
          missing: ['NATIVE_SOURCE_CUSTODY_NOT_INSTALLED'] as const,
          source: {
            seedFingerprint: null,
            admissionRef: null,
            worldVersion: null,
            eventSequence: null,
          },
          submitted: false as const,
          queued: false as const,
        });
      throw error;
    }
    if (result.rows.length !== 1)
      invalid('unique admitted source result required');
    const source = result.rows[0]!;
    if (Buffer.byteLength(JSON.stringify(source)) > 48000)
      invalid('bounded source result required');
    const binding = {
      seedFingerprint:
        typeof source.seed_fingerprint === 'string'
          ? source.seed_fingerprint
          : null,
      admissionRef:
        typeof source.admission_ref === 'string' ? source.admission_ref : null,
      worldVersion:
        typeof source.world_version === 'string' ? source.world_version : null,
      eventSequence:
        typeof source.event_sequence === 'string'
          ? source.event_sequence
          : null,
    };
    const missing: PostwarNarrowTradeMissing[] = [];
    if (
      source.status !== 'SOURCE' ||
      !binding.seedFingerprint ||
      !binding.admissionRef
    )
      missing.push('CURRENT_ADMITTED_H0_SOURCE');
    if (
      binding.worldVersion !== '0' ||
      binding.eventSequence !== '0' ||
      command.expectedWorldVersion !== '0'
    )
      missing.push('CURRENT_SETTLED_LINEAGE_REQUIRED');
    const stocks = rows(source.stock ?? []),
      stock = stocks[0];
    if (
      stocks.length !== 1 ||
      !stock ||
      stock.unit !== terms.quantity.unit ||
      stock.batchId !== terms.assetSource.batchId ||
      stock.titleHolderId !== terms.assetSource.titleHolderId ||
      stock.riskBearerId !== terms.assetSource.riskBearerId ||
      stock.physicalLocationId !== terms.assetSource.physicalLocationId ||
      stock.economicRecognitionId !== terms.assetSource.economicRecognitionId ||
      parseWorldDecimal(text(stock.quantity)).lessThan(terms.quantity.amount)
    )
      missing.push('SELLER_AVAILABLE_GRAIN');
    const buyer = rows(source.buyer_cash ?? []),
      seller = rows(source.seller_cash ?? []);
    const cost = terms.price.multiply(terms.quantity);
    if (
      buyer.length !== 1 ||
      parseWorldDecimal(text(buyer[0]!.amount)).lessThan(cost.amount)
    )
      missing.push('BUYER_TREASURY_GCU_CASH');
    if (seller.length !== 1) missing.push('SELLER_OWNER_GCU_CASH');
    // Rights are explicit originals in the independently admitted seed. Neither
    // an Office assignment nor D04's facility operating scope is a transfer or
    // international transport mandate. This schema creates no such originals.
    const originals = rows(source.rights ?? []);
    const effective = (v: Row) =>
      typeof v.effectiveFromSimTime === 'string' &&
      /^\d+$/u.test(v.effectiveFromSimTime) &&
      BigInt(v.effectiveFromSimTime) <= command.simTime.ticks &&
      (v.effectiveUntilSimTime === null ||
        (typeof v.effectiveUntilSimTime === 'string' &&
          /^\d+$/u.test(v.effectiveUntilSimTime) &&
          BigInt(v.effectiveUntilSimTime) > command.simTime.ticks)) &&
      v.revokedByRevision === null;
    const mandate = originals.find(
      (v) =>
        v.kind === 'OWNER_TRANSFER_MANDATE' &&
        v.countryId === terms.sellerCountryId &&
        v.ownerId === terms.assetSource.titleHolderId &&
        v.authSubject === auth.authSubject &&
        v.batchId === terms.assetSource.batchId &&
        v.buyerCountryId === terms.buyerCountryId &&
        v.commodityId === 'GRAIN' &&
        v.unit === terms.quantity.unit &&
        typeof v.maximumQuantity === 'string' &&
        !parseWorldDecimal(v.maximumQuantity).lessThan(terms.quantity.amount) &&
        effective(v),
    );
    const route = originals.find(
      (v) =>
        v.kind === 'CROSS_BORDER_ROUTE' &&
        v.fromCountryId === terms.sellerCountryId &&
        v.toCountryId === terms.buyerCountryId &&
        v.commodityId === 'GRAIN' &&
        v.unit === terms.quantity.unit &&
        typeof v.maximumQuantity === 'string' &&
        !parseWorldDecimal(v.maximumQuantity).lessThan(terms.quantity.amount) &&
        effective(v),
    );
    if (!mandate) missing.push('SELLER_OWNER_TRANSFER_MANDATE');
    if (!route) missing.push('ADMITTED_CROSS_BORDER_ROUTE');
    if (missing.length)
      return freeze({
        kind: 'MISSING' as const,
        missing,
        source: binding,
        submitted: false as const,
        queued: false as const,
      });
    const matched = {
      seedFingerprint: text(binding.seedFingerprint),
      admissionRef: text(binding.admissionRef),
      commandFingerprint: command.fingerprint,
      buyerTreasuryAccountId: text(buyer[0]!.accountId),
      sellerSettlementAccountId: text(seller[0]!.accountId),
      mandateSourceId: text(mandate!.sourceId),
      routeSourceId: text(route!.sourceId),
      mandateAdmissionRef: text(mandate!.domainAdmissionRef),
      routeAdmissionRef: text(route!.domainAdmissionRef),
    };
    return freeze({
      kind: 'SOURCE_MATCH' as const,
      binding: {
        ...matched,
        fingerprint: `sha256:${sha(canonicalSerialize(matched))}`,
      },
    });
  };
  const guard: PostwarNarrowTradeFreshSourceGuard = {
    inspectFrom,
    async assertFrom(tx, input) {
      const result = await inspectFrom(tx, input);
      if (result.kind === 'MISSING')
        throw new PostwarNarrowTradeSourceMissing(result);
    },
  };
  guards.add(guard);
  return Object.freeze(guard);
}
