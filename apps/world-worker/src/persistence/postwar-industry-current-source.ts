/** Fixed same-transaction Industry DATA reader. Does not grant source admission,
 * issuer rights, employer mandates, recipe coefficients or operating capability. */
import { createHash } from 'node:crypto';
import { canonicalSerialize } from '@econmind/core';
import type { SqlExecutor } from './sql-database.js';
import {
  decodeCommittedIndustryOperatingReceipt,
  receiptObject,
  type CommittedIndustryOperatingReceipt,
  type IndustryOperatingReceiptKind,
  type IndustryOperatingReceiptScope,
  INDUSTRY_OPERATING_RECEIPT_KINDS,
} from './postwar-industry-operating-receipts.js';
import {
  deriveIndustrySettledPaymentReceipt,
  industrySettledPaymentPrefixText,
  type IndustrySettledPaymentInput,
  type IndustrySettledPaymentReceipt,
} from './postwar-industry-settled-payment-receipt.js';
export const INDUSTRY_SETTLED_PAYMENT_PREFIX_QUERY =
  'select * from world_v2.lock_postwar_industry_payment_prefix($1,$2,$3,$4::bigint,$5::bigint,$6)';
export interface IndustrySettledPaymentCurrentFacts {
  readonly payment: IndustrySettledPaymentReceipt;
  readonly registrationRef: string;
  readonly admissionRef: string;
  readonly seedFingerprint: string;
  readonly documentSha256: string;
  readonly actualPrefixSha256: string;
}
declare const paymentLease: unique symbol;
export interface IndustrySettledPaymentSourceLease {
  readonly [paymentLease]: true;
}
const paymentLeases = new WeakMap<
  object,
  { tx: SqlExecutor; facts: Readonly<IndustrySettledPaymentCurrentFacts> }
>();
const activePayments = new WeakMap<
  object,
  WeakMap<SqlExecutor, IndustrySettledPaymentSourceLease>
>();
/** Fixed cutoff reads only its own currently held, SQL-verified payment scope. */
export function readIndustrySettledPaymentForCutoffFrom(
  tx: SqlExecutor,
  source: PostwarIndustryCurrentSource,
  targetFingerprint: string,
): Readonly<IndustrySettledPaymentCurrentFacts> {
  const token = activePayments.get(source)?.get(tx);
  if (!token)
    throw Error('INDUSTRY_ACTUAL_SETTLED_PAYMENT_SOURCE_SCOPE_REQUIRED');
  const facts = consumeIndustrySettledPaymentCurrentFrom(tx, token);
  if (facts.payment.targetCommand.fingerprint !== targetFingerprint)
    throw Error('INDUSTRY_ACTUAL_PAYMENT_TARGET_MISMATCH');
  return facts;
}
export function consumeIndustrySettledPaymentCurrentFrom(
  tx: SqlExecutor,
  value: IndustrySettledPaymentSourceLease,
): Readonly<IndustrySettledPaymentCurrentFacts> {
  const row = paymentLeases.get(value);
  if (!row || row.tx !== tx)
    throw Error('INDUSTRY_PAYMENT_LIVE_SAME_EXECUTOR_LEASE_REQUIRED');
  return row.facts;
}
export const INDUSTRY_OPERATING_CURRENT_QUERY =
  'select * from world_v2.lock_postwar_industry_operating_receipts($1,$2,$3,$4::bigint,$5::bigint,$6::jsonb)';
export const INDUSTRY_OPERATING_SESSION_QUERY = `select current_user as role_name,r.rolsuper,r.rolbypassrls,r.rolcreatedb,r.rolcreaterole,r.rolreplication,current_setting('transaction_isolation')as isolation,current_setting('transaction_read_only')as read_only,pg_backend_pid()::text as backend_pid,(select virtualxid::text from pg_locks where pid=pg_backend_pid()and locktype='virtualxid'and granted limit 1)as virtual_xid,pg_has_role(current_user,'world_v2_industry_source_reader','MEMBER')as reader_member,pg_has_role(current_user,'world_v2_industry_source_owner','MEMBER')as owner_member,pg_has_role(current_user,'world_v2_industry_source_publisher','MEMBER')as publisher_member from pg_roles r where r.rolname=current_user`;
export interface IndustryOperatingReceiptRequirement {
  readonly kind: IndustryOperatingReceiptKind;
  readonly receiptId: string;
  readonly factCanonicalPayload: string;
}
export interface IndustryOperatingCurrentRequest {
  readonly scope: IndustryOperatingReceiptScope;
  readonly targetCommand: Readonly<{ commandId: string; fingerprint: string }>;
  readonly head: Readonly<{ worldVersion: string; eventSequence: string }>;
  readonly simTime: string;
  readonly requirements: readonly IndustryOperatingReceiptRequirement[];
}
export interface IndustryOperatingCurrentFacts {
  readonly request: IndustryOperatingCurrentRequest;
  readonly registrationRef: string;
  readonly documentSha256: string;
  readonly seedFingerprint: string;
  readonly admissionRef: string;
  readonly receipts: readonly CommittedIndustryOperatingReceipt[];
  readonly fingerprint: string;
}
declare const lease: unique symbol;
export interface IndustryOperatingCurrentLease {
  readonly [lease]: true;
}
const leases = new WeakMap<
    object,
    {
      tx: SqlExecutor;
      owner: object;
      facts: Readonly<IndustryOperatingCurrentFacts>;
    }
  >(),
  sources = new WeakSet<object>();
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const hash = (v: unknown) =>
  'sha256:' + sha('SHA-256\n' + canonicalSerialize(v));
function invalid(s: string): never {
  throw Error('INDUSTRY_OPERATING_CURRENT:' + s);
}
export class IndustryOperatingFactsMissing extends Error {
  readonly code = 'INDUSTRY_OPERATING_FACTS_MISSING';
  constructor(
    readonly missing: readonly IndustryOperatingReceiptRequirement[],
  ) {
    super(
      'INDUSTRY_OPERATING_FACTS_MISSING:' +
        missing.map((r) => r.kind + ':' + r.receiptId).join(','),
    );
  }
}
export function consumeIndustryOperatingCurrentFrom(
  tx: SqlExecutor,
  value: IndustryOperatingCurrentLease,
): Readonly<IndustryOperatingCurrentFacts> {
  const found = leases.get(value);
  if (!found || found.tx !== tx)
    invalid('GENUINE_LIVE_SAME_EXECUTOR_LEASE_REQUIRED');
  return found.facts;
}
export interface PostwarIndustryCurrentSource {
  withSettledPaymentFrom<T>(
    tx: SqlExecutor,
    input: IndustrySettledPaymentInput,
    consume: (lease: IndustrySettledPaymentSourceLease) => Promise<T>,
  ): Promise<T>;
  withCurrentFrom<T>(
    tx: SqlExecutor,
    request: IndustryOperatingCurrentRequest,
    consume: (lease: IndustryOperatingCurrentLease) => Promise<T>,
  ): Promise<T>;
}
export function isPostwarIndustryCurrentSource(
  v: unknown,
): v is PostwarIndustryCurrentSource {
  return v !== null && typeof v === 'object' && sources.has(v);
}
export function createPostwarIndustryCurrentSource(configuration: {
  readonly worldId: string;
  readonly countryId: string;
  readonly runtimeReaderRole: string;
}): Readonly<PostwarIndustryCurrentSource> {
  const config = Object.freeze({ ...configuration });
  if (
    !/^[A-Z][A-Z0-9_]*$/u.test(config.worldId) ||
    !/^COUNTRY_[A-Z0-9_]{1,96}$/u.test(config.countryId) ||
    !/^[a-z][a-z0-9_]{0,62}$/u.test(config.runtimeReaderRole) ||
    [
      'postgres',
      'service_role',
      'anon',
      'authenticated',
      'world_v2_industry_source_owner',
      'world_v2_industry_source_publisher',
    ].includes(config.runtimeReaderRole)
  )
    invalid('FIXED_SEPARATE_READER_AND_SCOPE_REQUIRED');
  const session = async (tx: SqlExecutor) => {
    const r = await tx.query<Record<string, unknown>>(
        INDUSTRY_OPERATING_SESSION_QUERY,
      ),
      v = r.rows[0];
    if (
      r.rows.length !== 1 ||
      !v ||
      v.role_name !== config.runtimeReaderRole ||
      [
        v.rolsuper,
        v.rolbypassrls,
        v.rolcreatedb,
        v.rolcreaterole,
        v.rolreplication,
        v.owner_member,
        v.publisher_member,
      ].some((x) => x !== false) ||
      v.reader_member !== true ||
      v.read_only !== 'off' ||
      !['repeatable read', 'serializable'].includes(String(v.isolation)) ||
      typeof v.backend_pid !== 'string' ||
      typeof v.virtual_xid !== 'string' ||
      !/^\d+\/\d+$/u.test(v.virtual_xid)
    )
      invalid('ACTUAL_STABLE_TRANSACTION_ROLE_REQUIRED');
    return canonicalSerialize(v);
  };
  const read = async (
    tx: SqlExecutor,
    request: IndustryOperatingCurrentRequest,
  ) => {
    const result = await tx.query<Record<string, unknown>>(
      INDUSTRY_OPERATING_CURRENT_QUERY,
      [
        config.worldId,
        config.countryId,
        request.scope.facilityId,
        request.head.worldVersion,
        request.head.eventSequence,
        canonicalSerialize(
          request.requirements.map(({ kind, receiptId }) => ({
            kind,
            receiptId,
          })),
        ),
      ],
    );
    if (result.rows.length !== 1) invalid('UNIQUE_ACTUAL_ORIGINAL_REQUIRED');
    const row = result.rows[0]!,
      original = receiptObject(row.original);
    if (
      original.worldVersion !== request.head.worldVersion ||
      original.eventSequence !== request.head.eventSequence ||
      typeof original.registrationRef !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(String(original.documentSha256)) ||
      !/^sha256:[a-f0-9]{64}$/u.test(String(original.seedFingerprint)) ||
      typeof original.admissionRef !== 'string' ||
      !Array.isArray(row.frames)
    )
      invalid('ACTUAL_HEAD_SOURCE_BINDING_REQUIRED');
    const receipts = row.frames.map(decodeCommittedIndustryOperatingReceipt),
      missing = [];
    for (const req of request.requirements) {
      const matching = receipts.filter(
        (r) => r.body.kind === req.kind && r.body.receiptId === req.receiptId,
      );
      if (matching.length === 0) {
        missing.push(req);
        continue;
      }
      if (matching.length !== 1) invalid('DUPLICATE_RECEIPT_OR_REVISION');
      const r = matching[0]!,
        b = r.body;
      if (
        Object.entries(request.scope).some(
          ([k, v]) => b[k as keyof typeof b] !== v,
        ) ||
        b.targetCommandId !== request.targetCommand.commandId ||
        b.targetCommandFingerprint !== request.targetCommand.fingerprint ||
        b.factCanonicalPayload !== req.factCanonicalPayload ||
        BigInt(request.simTime) < BigInt(b.validFromTicks) ||
        BigInt(request.simTime) >= BigInt(b.validUntilTicks) ||
        BigInt(r.transition.worldVersionAfter) >
          BigInt(request.head.worldVersion) ||
        BigInt(r.command.simTime.toCanonicalValue()) > BigInt(request.simTime)
      )
        invalid('PURPOSE_CURRENT_USE_ORIGINAL_FACT_MISMATCH');
    }
    if (missing.length)
      throw new IndustryOperatingFactsMissing(Object.freeze(missing));
    if (receipts.length !== request.requirements.length)
      invalid('UNREQUESTED_RECEIPT');
    const facts = {
      request,
      registrationRef: String(original.registrationRef),
      documentSha256: String(original.documentSha256),
      seedFingerprint: String(original.seedFingerprint),
      admissionRef: String(original.admissionRef),
      receipts: Object.freeze(receipts),
    };
    return Object.freeze({ ...facts, fingerprint: hash(facts) });
  };
  const source: Readonly<PostwarIndustryCurrentSource> = Object.freeze({
    async withSettledPaymentFrom<T>(
      tx: SqlExecutor,
      input: IndustrySettledPaymentInput,
      consume: (lease: IndustrySettledPaymentSourceLease) => Promise<T>,
    ): Promise<T> {
      // The Core object/view is DATA only. Actual DB history equality below is
      // mandatory even when seed fingerprint and head already coincide.
      const payment = deriveIndustrySettledPaymentReceipt(input),
        prefixText = industrySettledPaymentPrefixText(input.prior),
        prefixSha = sha(prefixText),
        seedFingerprint = input.seed.fingerprint,
        physicalLocationId =
          input.target.posting.evidence.output.physicalLocationId;
      if (
        payment.worldId !== config.worldId ||
        payment.countryId !== config.countryId ||
        Buffer.byteLength(prefixText) > 1048576
      )
        invalid('PAYMENT_SCOPE_OR_PREFIX_CAPACITY');
      const readProof = async () => {
        const result = await tx.query<Record<string, unknown>>(
          INDUSTRY_SETTLED_PAYMENT_PREFIX_QUERY,
          [
            config.worldId,
            config.countryId,
            payment.facilityId,
            payment.observedHead.worldVersion,
            payment.observedHead.eventSequence,
            prefixText,
          ],
        );
        if (result.rows.length !== 1) invalid('ACTUAL_PAYMENT_PREFIX_REQUIRED');
        const row = result.rows[0]!,
          o = receiptObject(row.original);
        if (
          row.prefix_sha256 !== prefixSha ||
          o.seedFingerprint !== seedFingerprint ||
          o.worldVersion !== payment.observedHead.worldVersion ||
          o.eventSequence !== payment.observedHead.eventSequence ||
          typeof o.registrationRef !== 'string' ||
          typeof o.admissionRef !== 'string' ||
          typeof o.documentText !== 'string' ||
          sha(o.documentText) !== o.documentSha256
        )
          invalid('ACTUAL_PAYMENT_ORIGINAL_AND_PREFIX_REQUIRED');
        const doc = receiptObject(JSON.parse(o.documentText));
        if (
          doc.worldId !== config.worldId ||
          doc.countryId !== config.countryId ||
          doc.operatorId !== payment.operatorId ||
          doc.locationId !== physicalLocationId ||
          receiptObject(doc.sourceFacility).id !== payment.facilityId
        )
          invalid('ACTUAL_PAYMENT_ORIGINAL_SCOPE_REQUIRED');
        return Object.freeze({
          payment,
          registrationRef: o.registrationRef,
          admissionRef: o.admissionRef,
          seedFingerprint,
          documentSha256: String(o.documentSha256),
          actualPrefixSha256: prefixSha,
        });
      };
      const identity = await session(tx),
        facts = await readProof(),
        token = Object.freeze({}) as IndustrySettledPaymentSourceLease;
      let active = activePayments.get(source);
      if (!active) {
        active = new WeakMap();
        activePayments.set(source, active);
      }
      if (active.has(tx)) invalid('REENTRANT_PAYMENT_SOURCE_SCOPE');
      paymentLeases.set(token, { tx, facts });
      active.set(tx, token);
      try {
        const result = await consume(token);
        if ((await session(tx)) !== identity)
          invalid('TRANSACTION_LIFETIME_CHANGED');
        if (canonicalSerialize(await readProof()) !== canonicalSerialize(facts))
          invalid('CURRENT_PAYMENT_SOURCE_CHANGED');
        return result;
      } finally {
        paymentLeases.delete(token);
        active.delete(tx);
      }
    },
    async withCurrentFrom<T>(
      tx: SqlExecutor,
      request: IndustryOperatingCurrentRequest,
      consume: (lease: IndustryOperatingCurrentLease) => Promise<T>,
    ): Promise<T> {
      if (
        !/^sha256:[a-f0-9]{64}$/u.test(request.targetCommand.fingerprint) ||
        !/^[A-Za-z][A-Za-z0-9_.:-]{0,511}$/u.test(
          request.targetCommand.commandId,
        ) ||
        request.scope.worldId !== config.worldId ||
        request.scope.countryId !== config.countryId ||
        ![
          request.head.worldVersion,
          request.head.eventSequence,
          request.simTime,
        ].every((s) => /^(0|[1-9]\d*)$/u.test(s)) ||
        request.requirements.length < 1 ||
        request.requirements.length > 9 ||
        new Set(request.requirements.map((r) => r.kind)).size !==
          request.requirements.length
      )
        invalid('EXACT_BOUNDED_REQUEST_REQUIRED');
      // Caller mutation must not change what is protected during await/callback.
      const frozenRequest = JSON.parse(
        canonicalSerialize(request),
      ) as IndustryOperatingCurrentRequest;
      if (
        !Object.values(frozenRequest.scope).every(
          (v) =>
            typeof v === 'string' &&
            /^[A-Za-z][A-Za-z0-9_.:-]{0,511}$/u.test(v),
        ) ||
        frozenRequest.requirements.some(
          (r) =>
            !(INDUSTRY_OPERATING_RECEIPT_KINDS as readonly unknown[]).includes(
              r.kind,
            ) ||
            typeof r.receiptId !== 'string' ||
            r.receiptId.length < 1 ||
            r.receiptId.length > 512 ||
            typeof r.factCanonicalPayload !== 'string' ||
            Buffer.byteLength(r.factCanonicalPayload) > 65536 ||
            canonicalSerialize(
              JSON.parse(r.factCanonicalPayload) as unknown,
            ) !== r.factCanonicalPayload,
        )
      )
        invalid('CANONICAL_REQUIREMENTS_REQUIRED');
      Object.freeze(frozenRequest.scope);
      Object.freeze(frozenRequest.head);
      Object.freeze(frozenRequest.targetCommand);
      for (const r of frozenRequest.requirements) Object.freeze(r);
      Object.freeze(frozenRequest.requirements);
      Object.freeze(frozenRequest);
      const identity = await session(tx),
        facts = await read(tx, frozenRequest),
        value = Object.freeze({}) as IndustryOperatingCurrentLease;
      leases.set(value, { tx, owner: source, facts });
      try {
        const answer = await consume(value);
        if ((await session(tx)) !== identity)
          invalid('TRANSACTION_LIFETIME_CHANGED');
        const current = await read(tx, frozenRequest);
        if (current.fingerprint !== facts.fingerprint)
          invalid('CURRENT_SOURCE_CHANGED');
        return answer;
      } finally {
        leases.delete(value);
      }
    },
  });
  sources.add(source);
  return source;
}
