/** Small TEST_ONLY source/SQL rows. The actual Core reader, seed parser and
 * replay issue the lifetime token. No PG, full seed, official permit or FX
 * endowment is generated; these values are mechanism vectors only. */
import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import * as C from '@econmind/core';
import { DurableV08LedgerLineageReader } from '../../apps/world-worker/src/persistence/durable-v08-ledger-lineage-reader.js';
import {
  withValidatedCanonicalLineageFrom,
  type ValidatedCanonicalLineageView,
} from '../../apps/world-worker/src/persistence/validated-canonical-lineage.js';
import {
  classifyPostwarGcuCashInstrumentFrom,
  consumePostwarGcuCashInstrumentFrom,
  type PostwarGcuCashInstrumentEvidence,
} from '../../apps/world-worker/src/persistence/postwar-gcu-cash-instrument.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
import type { PostwarGenesisSourceDocument } from '../../apps/world-worker/src/preparation/postwar-operating-genesis-adoption.js';
const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const world = 'WORLD_TEST_ONLY_GCU_INSTRUMENT',
  country = 'COUNTRY_TEST_ONLY_GCU',
  owner = 'ENTITY_CB_TEST_ONLY_GCU',
  holdingId = 'HOLDING_TEST_ONLY_GCU';
function fixture(
  mode:
    | 'CASH'
    | 'LC'
    | 'CLAIM'
    | 'ORDINARY'
    | 'MISSING'
    | 'AMOUNT'
    | 'HOLDER' = 'CASH',
) {
  const currency = mode === 'LC' ? 'XAA' : 'GCU',
    sourceId = 'SOURCE_TEST_ONLY_GCU_INSTRUMENT',
    seedId = 'SEED_TEST_ONLY_GCU_INSTRUMENT';
  const h = {
    holdingId,
    category:
      mode === 'ORDINARY'
        ? 'OTHER_CENTRAL_BANK_ASSETS'
        : 'FX_CASH_AND_DEPOSITS',
    kind: mode === 'CLAIM' ? 'CLAIM' : 'CASH',
    amount: '12.5',
    currency,
    localCurrencyPerUnit: currency === 'GCU' ? '4' : '1',
    holderId: mode === 'HOLDER' ? 'ENTITY_GOV_TEST_ONLY_GCU' : owner,
    counterpartyId: mode === 'CLAIM' ? 'ENTITY_BANK_TEST_ONLY_GCU' : null,
    usableStatus: 'TEST_ONLY_SOURCE_STATUS_NOT_PAYMENT_PERMISSION',
  };
  const bytes = C.canonicalSerialize({
    holding: h,
    category: {
      category: h.category,
      disposition: mode === 'MISSING' ? 'NO_DECLARED_INSTRUMENT' : 'DECLARED',
    },
    register: { holdingIds: mode === 'MISSING' ? [] : [holdingId] },
    fx: { localCurrencyPerGcu: '4' },
  });
  const ref = (pointer: string) => ({
    documentId: 'TEST_ONLY_GCU_REGISTER',
    pointer,
  });
  const originalDocument = {
    documentId: 'TEST_ONLY_GCU_REGISTER',
    sourcePath: 'TEST_ONLY/gcu-register.json',
    sha256: sha(bytes),
    bytes,
    version: 'TEST_ONLY.1',
    valueDate: '2026-10-28',
  };
  const contract = {
    schemaVersion: 'formal-financial-opening-input-v2',
    evidenceKind: 'SOURCE_CANDIDATE',
    worldId: world,
    sourceId,
    sourceVersion: 'TEST_ONLY.1',
    valueDate: '2026-10-28',
    ownerReceiptSha256: 'a'.repeat(64),
    adoptionManifestFingerprint: 'sha256:' + 'b'.repeat(64),
    documents: [originalDocument],
    countries: [
      {
        countryId: country,
        localCurrency: 'XAA',
        openingFx: { localCurrencyPerGcu: '4', source: ref('/fx') },
        cbRegister: {
          source: ref('/register'),
          categories: [
            {
              category: h.category,
              disposition:
                mode === 'MISSING' ? 'NO_DECLARED_INSTRUMENT' : 'DECLARED',
              source: ref('/category'),
            },
          ],
          holdings:
            mode === 'MISSING' ? [] : [{ ...h, source: ref('/holding') }],
          crossCbMirrors: [],
        },
        bankLoans: [],
      },
    ],
  };
  const contractFingerprint = 'sha256:' + sha(C.canonicalSerialize(contract));
  const source = C.createOpeningSource(
    {
      schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: C.openingSourceId(sourceId),
      sourceKind: 'AUTHORITATIVE_DATASET',
      locator: 'TEST_ONLY_NOT_FORMAL_ADMISSION',
      sourceVersion: 'TEST_ONLY.1',
      payload: {
        schemaVersion: 'adopted-financial-opening-source-v2',
        parentReceiptSha256: contract.ownerReceiptSha256,
        adoptionManifestFingerprint: contract.adoptionManifestFingerprint,
        contractFingerprint,
        record: {
          contractFingerprint,
          sourceVersion: contract.sourceVersion,
          valueDate: contract.valueDate,
          documents: [
            { ...originalDocument, bytes: String(Buffer.byteLength(bytes)) },
          ],
        },
        assembly: {
          sourceId,
          worldId: world,
          seedId,
          contractFingerprint,
          countries: [
            {
              countryId: country,
              roster: {
                centralBank: owner,
                bank: 'ENTITY_BANK_TEST_ONLY_GCU',
                operator: 'ENTITY_OP_TEST_ONLY_GCU',
                households: 'ENTITY_HH_TEST_ONLY_GCU',
                government: 'ENTITY_GOV_TEST_ONLY_GCU',
              },
            },
          ],
        },
        reconciliations: [
          {
            countryId: country,
            denominations: [
              'businessBankDeposits',
              'householdBankDeposits',
            ].map((field) => ({
              field,
              localBookValue: { amount: '0', currency: 'XAA' },
            })),
          },
        ],
      },
    },
    sha,
  );
  const accountId =
    'ACCOUNT_' +
    sha(
      C.canonicalSerialize([world, country, 'CB_' + holdingId, currency]),
    ).toUpperCase();
  const account = C.createFinancialAccount({
    worldId: C.worldId(world),
    countryId: C.countryId(country),
    accountId: C.financialAccountId(accountId),
    ownerId: C.legalEntityId(owner),
    accountClass: 'ASSET',
    currency,
    claimId: null,
    counterpartyEntityId: null,
  });
  const equity = C.createFinancialAccount({
    ...account,
    accountId: C.financialAccountId('ACCOUNT_TEST_ONLY_GCU_EQUITY'),
    accountClass: 'EQUITY',
  });
  const amount = C.Money.from(mode === 'AMOUNT' ? '11' : '12.5', currency);
  const seed = C.createOpeningSeed(
    {
      schemaVersion: C.OPENING_SEED_SCHEMA_VERSION,
      seedId: C.openingSeedId(seedId),
      worldId: C.worldId(world),
      openingWorldVersion: '0',
      replayBinding: C.CURRENT_REPLAY_BINDING,
      sources: [source],
      inventoryEntries: [],
      financialBatches: [
        {
          batchId: C.financialOpeningBatchId('BATCH_TEST_ONLY_GCU'),
          sourceId: source.sourceId,
          settlementCurrency: currency,
          legs: [
            {
              legId: C.financialOpeningLegId('LEG_TEST_ONLY_GCU_CASH'),
              account,
              direction: 'DEBIT',
              amount,
              counterpartLegId: C.financialOpeningLegId(
                'LEG_TEST_ONLY_GCU_EQUITY',
              ),
            },
            {
              legId: C.financialOpeningLegId('LEG_TEST_ONLY_GCU_EQUITY'),
              account: equity,
              direction: 'CREDIT',
              amount,
              counterpartLegId: C.financialOpeningLegId(
                'LEG_TEST_ONLY_GCU_CASH',
              ),
            },
          ],
        },
      ],
    },
    sha,
  );
  const originalValue = {
    schemaVersion: 'postwar-financial-office-originals-v1',
    provenanceKind: 'GENERATED_POLICY',
    worldId: world,
    seedId,
    financialSourceId: sourceId,
    financialSourcePayloadHash: source.payloadHash,
    contractFingerprint,
    contract,
  };
  const documentBytes = C.canonicalSerialize(originalValue);
  const document: PostwarGenesisSourceDocument = {
    documentId: 'POSTWAR_FINANCIAL_OFFICE_ORIGINALS',
    path: 'generated/postwar-genesis/financial-office-originals.v1.json',
    bytes: documentBytes,
    sha256: sha(documentBytes),
    provenanceKind: 'GENERATED_POLICY',
  };
  const { fingerprint, ...intent } = seed;
  const executor: SqlExecutor = {
    async query<Row extends object>(q: string) {
      let rows: readonly object[] = [];
      if (q.includes('from world_v2.world_head'))
        rows = [{ world_version: '0', event_sequence: '0' }];
      else if (q.includes('from world_v2.opening_seed'))
        rows = [
          {
            world_id: world,
            seed_id: seedId,
            opening_world_version: '0',
            replay_binding: C.canonicalSerialize(seed.replayBinding),
            canonical_payload: C.canonicalSerialize(intent),
            seed_fingerprint: fingerprint,
          },
        ];
      else if (
        !/from world_v2\.(authoritative_event|inventory_posting|financial_posting_batch|command_receipt)/u.test(
          q,
        )
      )
        throw Error('UNEXPECTED_TEST_ONLY_QUERY');
      return { rows: rows as readonly Row[], rowCount: rows.length };
    },
  };
  const database = {
    query: executor.query,
    transaction: async <T>(): Promise<T> => {
      throw Error('NO_NESTED_TEST_TRANSACTION');
    },
  };
  const reader = new DurableV08LedgerLineageReader({
    database,
    sha256Hex: sha,
  });
  const scope = {
    worldId: world,
    countryId: country,
    ownerId: owner,
    accountId,
  };
  const classify = (view: ValidatedCanonicalLineageView) =>
    classifyPostwarGcuCashInstrumentFrom(executor, view, {
      countryId: country,
      holdingId,
      originalsDocument: document,
    });
  const run = <T>(
    consume: (view: ValidatedCanonicalLineageView) => Promise<T>,
  ) =>
    withValidatedCanonicalLineageFrom(
      { reader, executor, worldId: world },
      consume,
    );
  return { executor, scope, document, classify, run };
}
describe('provenance-backed GCU cash classification (not authority)', () => {
  it('recognizes the exact producer ASSET as declared GCU cash without renaming, transferring or approving it', async () => {
    const f = fixture();
    await f.run(async (view) => {
      const proof = f.classify(view);
      expect(proof.status).toBe('CLASSIFIED');
      if (proof.status !== 'CLASSIFIED')
        throw Error('EXPECTED_TEST_ONLY_PROOF');
      const facts = consumePostwarGcuCashInstrumentFrom(
        f.executor,
        view,
        proof.evidence,
        f.scope,
      );
      expect(facts).toMatchObject({
        accountClass: 'ASSET',
        currency: 'GCU',
        openingAmount: '12.5',
        ledgerBalance: '12.5',
        ownerId: owner,
        headWorldVersion: '0',
        classification:
          'SOURCE_DECLARED_GCU_CASH_INSTRUMENT_NOT_PAYMENT_AUTHORITY',
      });
      expect(Object.isFrozen(facts)).toBe(true);
      expect(facts).not.toHaveProperty('ready');
    });
  });
  it.each(['LC', 'CLAIM', 'ORDINARY', 'AMOUNT', 'HOLDER'] as const)(
    'rejects %s instead of treating arbitrary assets as money',
    async (mode) => {
      const f = fixture(mode);
      await expect(f.run(async (view) => f.classify(view))).rejects.toThrow(
        'POSTWAR_GCU_CASH_INSTRUMENT:',
      );
    },
  );
  it('keeps an absent declared holding typed MISSING rather than an observed zero or a ready account', async () => {
    const f = fixture('MISSING');
    await f.run(async (view) => {
      expect(f.classify(view)).toEqual({
        status: 'MISSING',
        reason: 'NO_DECLARED_GCU_CASH_INSTRUMENT',
      });
    });
  });
  it('rejects caller JSON proof, foreign legal holder, another executor and expired view', async () => {
    const f = fixture();
    let savedView: ValidatedCanonicalLineageView | undefined,
      savedProof: PostwarGcuCashInstrumentEvidence | undefined;
    await f.run(async (view) => {
      const result = f.classify(view);
      if (result.status !== 'CLASSIFIED')
        throw Error('EXPECTED_TEST_ONLY_PROOF');
      savedView = view;
      savedProof = result.evidence;
      expect(() =>
        consumePostwarGcuCashInstrumentFrom(
          f.executor,
          view,
          JSON.parse(
            JSON.stringify(result.evidence),
          ) as PostwarGcuCashInstrumentEvidence,
          f.scope,
        ),
      ).toThrow('GENUINE_SAME_LIFETIME');
      for (const scope of [
        { ...f.scope, countryId: 'COUNTRY_OTHER' },
        { ...f.scope, worldId: 'WORLD_OTHER' },
        { ...f.scope, accountId: 'ACCOUNT_OTHER' },
        {} as typeof f.scope,
      ])
        expect(() =>
          consumePostwarGcuCashInstrumentFrom(
            f.executor,
            view,
            result.evidence,
            scope,
          ),
        ).toThrow('GENUINE_SAME_LIFETIME');
      expect(() =>
        consumePostwarGcuCashInstrumentFrom(f.executor, view, result.evidence, {
          ...f.scope,
          ownerId: 'ENTITY_GOV_TEST_ONLY_GCU',
        }),
      ).toThrow('GENUINE_SAME_LIFETIME');
      expect(() =>
        consumePostwarGcuCashInstrumentFrom(
          { query: f.executor.query },
          view,
          result.evidence,
          f.scope,
        ),
      ).toThrow('another executor');
    });
    expect(() =>
      consumePostwarGcuCashInstrumentFrom(
        f.executor,
        savedView!,
        savedProof!,
        f.scope,
      ),
    ).toThrow('expired');
  });
  it('refuses altered or rehashed constructor bytes that differ from the actual fixed source contract', async () => {
    const f = fixture();
    await f.run(async (view) => {
      const value = JSON.parse(f.document.bytes);
      value.contract.countries[0].cbRegister.holdings[0].amount = '999';
      const bytes = C.canonicalSerialize(value);
      expect(() =>
        classifyPostwarGcuCashInstrumentFrom(f.executor, view, {
          countryId: country,
          holdingId,
          originalsDocument: { ...f.document, bytes, sha256: sha(bytes) },
        }),
      ).toThrow('financial source/contract binding mismatch');
    });
  });
  it('does not accept request ready/native booleans as a genuine lineage view', () => {
    const f = fixture();
    expect(() =>
      f.classify({
        native: true,
        ready: true,
      } as unknown as ValidatedCanonicalLineageView),
    ).toThrow('forged');
  });
});
