/** Offline/native full-source verifier for Finance/Central Bank opening data.
 * Live API handlers use the bounded country/Office store, not seed hydration.
 * No OMO quote, budget approval, writer, source issuer or new balance is minted. */
import { createHash } from 'node:crypto';
import {
  canonicalSerialize,
  rebuildV08LedgersFromLineage,
  type AuthorizedOfficeContext,
  type AuthorizationCapability,
  type OpeningSeed,
  type FinancialLedgerState,
} from '@econmind/core';
import {
  createAuthorizedAdmittedOpeningSource,
  consumeAuthorizedAdmittedOpeningSourceFrom,
  type AuthorizedAdmittedOpeningSource,
} from './postwar-operating-runtime-source.js';
import { validatePostwarFinancialOfficeOriginalDocument } from '../preparation/postwar-financial-office-originals.js';
import type {
  PostwarGenesisSourceDocument,
  PostwarOperatingGenesisFacts,
} from '../preparation/postwar-operating-genesis-adoption.js';
import type { SqlExecutor } from './sql-database.js';

export type PostwarFinancialOffice = 'FINANCE' | 'CENTRAL_BANK';
type Scope = {
  readonly worldId: string;
  readonly countryId: string;
  readonly officeId: PostwarFinancialOffice;
};
const sha = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
const capabilities: Readonly<
  Record<PostwarFinancialOffice, readonly AuthorizationCapability[]>
> = {
  FINANCE: ['FINANCE_TREASURY', 'FINANCE_BUDGET', 'FINANCE_PUBLIC_DEBT'],
  CENTRAL_BANK: [
    'CENTRAL_BANK_MONETARY_POLICY',
    'CENTRAL_BANK_BANKING_STABILITY',
    'CENTRAL_BANK_FX_RESERVES',
  ],
};
function invalid(reason: string): never {
  throw Error(`POSTWAR_FINANCIAL_OFFICE:${reason}`);
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    invalid('source record required');
  return value as Record<string, unknown>;
}
/** Pure data derivation. The executing runtime wrapper below supplies actual
 * admission, identity, seat and transaction checks; this function grants none. */
interface FinancialDerivationInput {
  readonly seed: OpeningSeed;
  readonly originalsDocument: PostwarGenesisSourceDocument;
  readonly operatingFacts?: PostwarOperatingGenesisFacts;
  readonly scope: Scope;
}
function deriveWithCanonicalLedger(
  input: FinancialDerivationInput,
  ledger: FinancialLedgerState,
) {
  const { seed, scope } = input;
  if (
    seed.worldId !== scope.worldId ||
    ledger.worldId !== seed.worldId ||
    ledger.worldVersion !== '0' ||
    !Object.hasOwn(capabilities, scope.officeId)
  )
    invalid('source scope mismatch');
  const originals = validatePostwarFinancialOfficeOriginalDocument(
    input.originalsDocument,
    seed,
  );
  const contract = originals.contract.countries.filter(
    (c) => c.countryId === scope.countryId,
  );
  if (contract.length !== 1) invalid('country outside financial originals');
  const country = contract[0]!;
  const financial = seed.sources
    .filter((s) => s.sourceId === originals.financialSourceId)
    .map((s) => ({
      source: s,
      payload: record(JSON.parse(s.canonicalPayload)),
    }));
  const assembly = record(financial[0]!.payload.assembly);
  if (!Array.isArray(assembly.countries))
    invalid('financial country assembly absent');
  const rows = assembly.countries.filter(
    (c) => record(c).countryId === scope.countryId,
  );
  if (rows.length !== 1) invalid('financial country roster absent');
  const roster = record(record(rows[0]).roster);
  for (const field of ['government', 'bank', 'centralBank'])
    if (typeof roster[field] !== 'string')
      invalid('actual source roster required');
  const owners =
    scope.officeId === 'FINANCE'
      ? [roster.government]
      : [roster.centralBank, roster.bank];
  const positions = ledger.positions
    .filter(
      (p) =>
        p.account.countryId === scope.countryId &&
        owners.includes(p.account.ownerId),
    )
    .map((p) => ({
      account: p.account,
      netDebitBalance: p.netDebitBalance.toCanonicalValue(),
    }));
  if (!positions.length) invalid('canonical office financial positions absent');
  const metadata = new Map(
    originals.contract.documents.map((d) => [
      d.documentId,
      {
        documentId: d.documentId,
        sha256: d.sha256,
        sourcePath: d.sourcePath,
        version: d.version,
        valueDate: d.valueDate,
      },
    ]),
  );
  const sourceReferences = [
    country.openingFx.source,
    country.cbRegister.source,
    ...country.cbRegister.categories.map((c) => c.source),
    ...country.cbRegister.holdings.map((h) => h.source),
    ...country.bankLoans.map((l) => l.source),
  ].map((ref) => ({ ...metadata.get(ref.documentId)!, pointer: ref.pointer }));
  const binding = {
    financialSourceId: originals.financialSourceId,
    financialSourcePayloadHash: originals.financialSourcePayloadHash,
    contractFingerprint: originals.contractFingerprint,
    originalsDocumentSHA256: input.originalsDocument.sha256,
  };
  const common = {
    classification: 'DERIVED_FINANCIAL_OFFICE_FACTS_NOT_AUTHORIZATION' as const,
    scope,
    localCurrency: country.localCurrency,
    valueDate: originals.contract.valueDate,
    financialPositions: positions,
    sourceBinding: binding,
  };
  if (scope.officeId === 'FINANCE') {
    const treasuryRegister = country.cbRegister.holdings.filter(
      (h) => h.category === 'TREASURY_GOVERNMENT_DEPOSIT',
    );
    const openingLegs = seed.financialBatches
      .filter((b) => b.sourceId === originals.financialSourceId)
      .flatMap((b) => b.legs);
    const assets = openingLegs.filter(
      (l) =>
        l.account.countryId === scope.countryId &&
        l.account.ownerId === roster.government &&
        l.account.counterpartyEntityId === roster.centralBank &&
        l.account.accountClass === 'ASSET' &&
        l.account.claimId !== null &&
        l.account.currency === country.localCurrency &&
        l.direction === 'DEBIT',
    );
    if (assets.length !== 1 || treasuryRegister.length !== 1)
      invalid('exact treasury cash claim required');
    const asset = assets[0]!,
      declared = treasuryRegister[0]!;
    const mirrors = openingLegs.filter(
      (l) => l.legId === asset.counterpartLegId,
    );
    const mirror = mirrors[0];
    if (
      mirrors.length !== 1 ||
      !mirror ||
      mirror.counterpartLegId !== asset.legId ||
      mirror.direction !== 'CREDIT' ||
      mirror.account.accountClass !== 'LIABILITY' ||
      mirror.account.countryId !== scope.countryId ||
      mirror.account.worldId !== scope.worldId ||
      asset.account.worldId !== scope.worldId ||
      mirror.account.ownerId !== roster.centralBank ||
      mirror.account.counterpartyEntityId !== roster.government ||
      mirror.account.claimId !== asset.account.claimId ||
      mirror.account.currency !== country.localCurrency ||
      mirror.amount.currency !== country.localCurrency ||
      asset.amount.currency !== country.localCurrency ||
      !mirror.amount.amount.equals(asset.amount.amount) ||
      declared.kind !== 'CLAIM' ||
      declared.holderId !== roster.centralBank ||
      declared.counterpartyId !== roster.government ||
      declared.currency !== country.localCurrency ||
      declared.localCurrencyPerUnit !== '1' ||
      !asset.amount.amount.equals(declared.amount)
    )
      invalid('treasury original/mirrored financial claim mismatch');
    const currentAsset = ledger.positions.find(
      (p) => p.account.accountId === asset.account.accountId,
    );
    const currentMirror = ledger.positions.find(
      (p) => p.account.accountId === mirror.account.accountId,
    );
    if (
      !currentAsset ||
      !currentMirror ||
      !currentAsset.netDebitBalance.amount.equals(asset.amount.amount) ||
      !currentMirror.netDebitBalance.amount
        .negated()
        .equals(asset.amount.amount)
    )
      invalid('treasury held opening/current balance mismatch');
    const treasury = {
      kind: 'TREASURY_TGA' as const,
      countryId: scope.countryId,
      accountId: asset.account.accountId,
      claimId: asset.account.claimId!,
      issuerEntityId: mirror.account.ownerId,
      counterpartAccountId: mirror.account.accountId,
      ownerId: asset.account.ownerId,
      currency: asset.account.currency,
      availableAmount: currentAsset.netDebitBalance.toCanonicalValue().amount,
      sourceId: originals.financialSourceId,
    };
    const tgaPosition = positions.find(
      (p) => p.account.accountId === treasury.accountId,
    );
    if (
      !tgaPosition ||
      tgaPosition.netDebitBalance.amount !== treasury.availableAmount
    )
      invalid('treasury opening/current balance mismatch');
    const regionIds = new Set(
      input.operatingFacts?.regions
        .filter((r) => r.countryId === scope.countryId)
        .map((r) => r.regionId) ?? [],
    );
    if (input.operatingFacts && !regionIds.size)
      invalid('country operating source absent');
    const funding =
      input.operatingFacts?.funding.filter(
        (f) =>
          f.countryId === scope.countryId &&
          f.payerEntityId === roster.government &&
          positions.some((p) => p.account.accountId === f.accountId),
      ) ?? [];
    const fundingIds = new Set(funding.map((f) => f.fundingId));
    const obligations =
      input.operatingFacts?.obligations.filter(
        (o) =>
          regionIds.has(o.regionId) &&
          o.payerEntityId === roster.government &&
          fundingIds.has(o.fundingId),
      ) ?? [];
    return freeze({
      ...common,
      officeId: 'FINANCE' as const,
      governmentEntityId: roster.government as string,
      treasuryLiquidClaim: treasury,
      openingOperatingAllocations: input.operatingFacts
        ? {
            funding,
            obligations,
            interpretation:
              'VALIDATED_GENESIS_ALLOCATION_AND_OPEN_UNPAID_OBLIGATIONS_NOT_NEW_APPROPRIATION' as const,
          }
        : null,
      readFacts: {
        treasuryAccountId: treasury.accountId,
        currency: treasury.currency,
        availableAmount: tgaPosition.netDebitBalance.amount,
        sourceKind: 'CANONICAL_TGA_ASSET' as const,
      },
    });
  }
  // Keep the exact category register, including NO_DECLARED_INSTRUMENT. A
  // monetary claim against the treasury is not a government security holding.
  const declared = country.cbRegister.categories.find(
    (c) => c.category === 'DOMESTIC_GOVERNMENT_SECURITIES',
  );
  if (!declared) invalid('government security category coverage absent');
  const governmentSecurities = country.cbRegister.holdings.filter(
    (h) => h.category === 'DOMESTIC_GOVERNMENT_SECURITIES',
  );
  if (
    declared.disposition === 'NO_DECLARED_INSTRUMENT' &&
    governmentSecurities.length
  )
    invalid('security absence/register conflict');
  if (declared.disposition === 'DECLARED' && !governmentSecurities.length)
    invalid('declared security originals absent');
  return freeze({
    ...common,
    officeId: 'CENTRAL_BANK' as const,
    centralBankEntityId: roster.centralBank as string,
    domesticBankEntityId: roster.bank as string,
    openingFx: country.openingFx,
    centralBankRegister: country.cbRegister,
    bankLoans: country.bankLoans,
    sourceReferences,
    omoInventory: {
      status: governmentSecurities.length
        ? ('REQUIRES_INSTRUMENT_TERMS_AND_ACTUAL_QUOTE' as const)
        : ('NO_DECLARED_GOVERNMENT_SECURITY' as const),
      holdings: governmentSecurities,
      categorySource: declared.source,
    },
  });
}
/** Offline producer path: one genuine Core replay, no actor/admission cache. */
export function derivePostwarFinancialOfficeReadFacts(
  input: FinancialDerivationInput,
) {
  return deriveWithCanonicalLedger(
    input,
    rebuildV08LedgersFromLineage({ seed: input.seed, sha256Hex: sha })
      .financial,
  );
}
/** One source replay for a complete offline publication batch. Runtime role,
 * identity and admission are still independently checked by each live reader. */
export function derivePostwarFinancialOfficeReadFactsBatch(
  input: Omit<FinancialDerivationInput, 'scope'>,
) {
  const ledger = rebuildV08LedgersFromLineage({
    seed: input.seed,
    sha256Hex: sha,
  }).financial;
  const originals = validatePostwarFinancialOfficeOriginalDocument(
    input.originalsDocument,
    input.seed,
  );
  return freeze(
    originals.contract.countries.flatMap((country) =>
      (['FINANCE', 'CENTRAL_BANK'] as const).map((officeId) =>
        deriveWithCanonicalLedger(
          {
            ...input,
            scope: {
              worldId: input.seed.worldId,
              countryId: country.countryId,
              officeId,
            },
          },
          ledger,
        ),
      ),
    ),
  );
}
export type PostwarFinancialOfficeReadFacts = ReturnType<
  typeof deriveWithCanonicalLedger
>;
export interface PostwarFinancialOfficeRuntimeSource {
  readonly schemaVersion: 'postwar-financial-office-runtime-source-v1';
  readonly status: 'ADMITTED_OPENING_AT_H0';
  readonly scope: AuthorizedAdmittedOpeningSource['scope'];
  readonly boundary: AuthorizedAdmittedOpeningSource['boundary'];
  readonly facts: PostwarFinancialOfficeReadFacts;
}
const leases = new WeakMap<
  object,
  { executor: SqlExecutor; active: boolean }
>();
const ports = new WeakSet<object>();
export interface PostwarFinancialOfficeRuntimeSourcePort {
  withSourceFrom<Result>(
    executor: SqlExecutor,
    authorization: AuthorizedOfficeContext,
    consume: (source: PostwarFinancialOfficeRuntimeSource) => Promise<Result>,
  ): Promise<Result>;
}
export function createPostwarFinancialOfficeRuntimeSource(input: {
  readonly scope: Scope;
  readonly authorizationPublisherRole: string;
  readonly runtimeReaderRole: string;
}): PostwarFinancialOfficeRuntimeSourcePort {
  const scope = Object.freeze({
    worldId: input.scope.worldId,
    countryId: input.scope.countryId,
    officeId: input.scope.officeId,
  });
  if (!Object.hasOwn(capabilities, scope.officeId))
    invalid('unsupported office');
  const common = createAuthorizedAdmittedOpeningSource({
    scope,
    authorizationPublisherRole: input.authorizationPublisherRole,
    runtimeReaderRole: input.runtimeReaderRole,
    capabilities: capabilities[scope.officeId],
  });
  const port: PostwarFinancialOfficeRuntimeSourcePort = Object.freeze({
    async withSourceFrom<Result>(
      executor: SqlExecutor,
      authorization: AuthorizedOfficeContext,
      consume: (source: PostwarFinancialOfficeRuntimeSource) => Promise<Result>,
    ): Promise<Result> {
      return common.withSourceFrom(executor, authorization, async (held) => {
        consumeAuthorizedAdmittedOpeningSourceFrom(executor, held);
        if (
          held.scope.officeId !== scope.officeId ||
          held.scope.countryId !== scope.countryId ||
          held.scope.worldId !== scope.worldId
        )
          invalid('exact office scope mismatch');
        const originalsDocument =
          held.operating.financialOfficeOriginalsDocument;
        if (!originalsDocument)
          invalid('retained typed financial originals unavailable');
        const facts = deriveWithCanonicalLedger(
          {
            seed: held.seed,
            scope,
            operatingFacts: held.operating.facts,
            originalsDocument,
          },
          held.replayed.ledgers.financial,
        );
        const source: PostwarFinancialOfficeRuntimeSource = freeze({
          schemaVersion: 'postwar-financial-office-runtime-source-v1',
          status: 'ADMITTED_OPENING_AT_H0',
          scope: held.scope,
          boundary: held.boundary,
          facts,
        });
        const lease = { executor, active: true };
        leases.set(source, lease);
        try {
          return await consume(source);
        } finally {
          lease.active = false;
        }
      });
    },
  });
  ports.add(port);
  return port;
}
export function consumePostwarFinancialOfficeRuntimeSourceFrom(
  executor: SqlExecutor,
  source: PostwarFinancialOfficeRuntimeSource,
) {
  const lease = leases.get(source);
  if (!lease?.active || lease.executor !== executor)
    invalid('source scope expired');
  return source;
}
/** API-handler entry point: returns an exact-office JSON read response. Its
 * detached data is not usable as a command/custody/transaction capability. */
export async function readPostwarFinancialOfficeApiFrom(input: {
  readonly executor: SqlExecutor;
  readonly authorization: AuthorizedOfficeContext;
  readonly source: PostwarFinancialOfficeRuntimeSourcePort;
}): Promise<PostwarFinancialOfficeRuntimeSource> {
  if (!ports.has(input.source)) invalid('fixed server source port required');
  return input.source.withSourceFrom(
    input.executor,
    input.authorization,
    async (source) => {
      consumePostwarFinancialOfficeRuntimeSourceFrom(input.executor, source);
      return freeze(
        JSON.parse(
          canonicalSerialize(source),
        ) as PostwarFinancialOfficeRuntimeSource,
      );
    },
  );
}
