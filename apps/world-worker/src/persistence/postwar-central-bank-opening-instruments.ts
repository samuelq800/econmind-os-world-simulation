/** Fixed read composition over already admitted bounded H0 documents. It does
 * not adopt an OMO source, construct accounts, supply prices or hydrate a seed. */
import { canonicalSerialize } from '@econmind/core';
import {
  parsePostwarCentralBankOpeningInstruments,
  type PostwarCentralBankOpeningInstruments,
} from '@econmind/core/postwar-financial-mixed-current-contract';
import {
  createPostwarOfficeProjectionStore,
  type PostwarOfficeProjectionSource,
  type PostwarOfficeProjectionScope,
} from './postwar-office-projection-store.js';
import type { SqlExecutor } from './sql-database.js';
function invalid(): never {
  throw Error('CB_OPENING_INSTRUMENT_ORIGINALS_DIFFER');
}
function object(v: unknown): Readonly<Record<string, unknown>> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) invalid();
  return v as Readonly<Record<string, unknown>>;
}
export function createPostwarCentralBankOpeningInstrumentReader(config: {
  runtimeReaderRole: string;
  authorizationPublisherRole: string;
}) {
  const store = createPostwarOfficeProjectionStore(config);
  return Object.freeze({
    async readFrom(
      tx: SqlExecutor,
      input: { worldId: string },
    ): Promise<Readonly<{
      scope: PostwarOfficeProjectionScope;
      source: PostwarOfficeProjectionSource;
      instruments: Readonly<PostwarCentralBankOpeningInstruments>;
    }> | null> {
      const pages = [];
      for (const dataset of ['cb-categories', 'cb-holdings', 'bank-loans']) {
        const page = await store.readPageFrom(tx, {
          worldId: input.worldId,
          officeId: 'CENTRAL_BANK',
          dataset,
          offset: 0,
          limit: 100,
        });
        if (!('source' in page)) {
          if (page.status !== 'UNAVAILABLE') invalid();
          return null;
        }
        if (
          page.page.nextOffset !== null ||
          page.page.total !== page.rows.length
        )
          invalid();
        pages.push({ ...page, dataset });
      }
      const first = pages[0]!;
      for (const page of pages) {
        if (
          canonicalSerialize(page.scope) !== canonicalSerialize(first.scope) ||
          page.source.worldVersion !== '0' ||
          page.source.eventSequence !== '0'
        )
          invalid();
        for (const key of [
          'seedId',
          'seedFingerprint',
          'admissionRef',
          'canonicalSeedSha256',
          'sourceBundleSha256',
          'modelVersion',
          'replayBinding',
        ] as const)
          if (page.source[key] !== first.source[key]) invalid();
      }
      const categories = first.rows.map(object),
        matches = categories.filter(
          (c) => c.category === 'DOMESTIC_GOVERNMENT_SECURITIES',
        );
      if (matches.length !== 1) invalid();
      const declared = matches[0]!;
      if (
        !['DECLARED', 'NO_DECLARED_INSTRUMENT'].includes(
          String(declared.disposition),
        )
      )
        invalid();
      const holdings = pages[1]!.rows
        .map(object)
        .filter((h) => h.category === 'DOMESTIC_GOVERNMENT_SECURITIES');
      if (
        (declared.disposition === 'NO_DECLARED_INSTRUMENT') !==
        (holdings.length === 0)
      )
        invalid();
      const source = first.source;
      return Object.freeze({
        scope: first.scope,
        source,
        instruments: parsePostwarCentralBankOpeningInstruments({
          schemaVersion: 'postwar-cb-opening-instruments-v1',
          measurement: 'ADMITTED_OPENING_DECLARATION_NOT_CURRENT_TRADABILITY',
          countryId: first.scope.countryId,
          seedFingerprint: source.seedFingerprint,
          admissionRef: source.admissionRef,
          canonicalSeedSha256: source.canonicalSeedSha256,
          sourceBundleSha256: source.sourceBundleSha256,
          originWorldVersion: '0',
          originEventSequence: '0',
          status: holdings.length
            ? 'DECLARED_REQUIRES_INSTRUMENT_TERMS_AND_QUOTE'
            : 'NO_DECLARED_DOMESTIC_GOVERNMENT_SECURITY',
          governmentSecurityHoldingCount: holdings.length,
          bankLoanRecordCount: pages[2]!.rows.length,
          sourcePages: pages.map((p) => ({
            dataset: p.dataset,
            sourceVersion: p.source.sourceVersion,
            pageHash: p.source.pageHash,
            returnedRowsHash: p.source.returnedRowsHash,
          })),
        }),
      });
    },
  });
}
