/** V2 provenance, not a new inventory or current-state truth. Only fixed SQL
 * can attest the direct row source; online reads remain bounded metadata/pages. */
import {
  createPostwarPhysicalOpeningHeadReader,
  POSTWAR_PHYSICAL_OPENING_PAGE_QUERY,
  type PostwarPhysicalOpeningRequest,
  type PostwarPhysicalOpeningHeadPage,
} from './postwar-physical-opening-head-read.js';
import type { SqlExecutor } from './sql-database.js';
export const POSTWAR_INVENTORY_PROVENANCE_PUBLISH_QUERY =
  'select * from world_v2.publish_postwar_inventory_provenance_v2($1,$2,$3,$4,$5,$6)';
export const POSTWAR_INVENTORY_PROVENANCE_PAGE_QUERY =
  'select * from world_v2.read_postwar_inventory_provenance_v2_page($1,$2,$3,$4,$5,$6)';
/** Controlled offline only. Pins are assertions, not authority: SQL checks its
 * own admitted canonical seed, both legacy documents and every original page.
 * It accepts no caller source IDs, pointer, rows, Ready or validation flags. */
export async function publishPostwarPhysicalInventoryProvenanceFrom(
  tx: SqlExecutor,
  pins: Readonly<{
    worldId: string;
    countryId: string;
    seedFingerprint: string;
    canonicalSeedSha256: string;
    sourceBundleSha256: string;
    admissionRef: string;
  }>,
): Promise<readonly Readonly<Record<string, unknown>>[]> {
  const result = await tx.query<Record<string, unknown>>(
    POSTWAR_INVENTORY_PROVENANCE_PUBLISH_QUERY,
    [
      pins.worldId,
      pins.countryId,
      pins.seedFingerprint,
      pins.canonicalSeedSha256,
      pins.sourceBundleSha256,
      pins.admissionRef,
    ],
  );
  if (result.rows.length !== 2)
    throw Error(
      'POSTWAR_INVENTORY_PROVENANCE:BOTH_OFFICE_ATTESTATIONS_REQUIRED',
    );
  return Object.freeze(result.rows.map((r) => Object.freeze({ ...r })));
}
type Failure = Readonly<{
  status: 'DENIED' | 'STALE' | 'UNAVAILABLE';
  code: string;
}>;
/** Explicit opt-in. Does not rewrite or transparently upgrade old readers. Old
 * continuation tokens fail against the distinct V2 metadata sourceVersion. */
export function createPostwarPhysicalInventoryProvenanceReader(configuration: {
  readonly runtimeReaderRole: string;
  readonly authorizationPublisherRole: string;
  readonly expectedSeedFingerprint: string;
}) {
  const reader = createPostwarPhysicalOpeningHeadReader(configuration);
  return Object.freeze({
    async readPageFrom(
      tx: SqlExecutor,
      input: PostwarPhysicalOpeningRequest,
    ): Promise<PostwarPhysicalOpeningHeadPage | Failure> {
      if (
        !['INDUSTRY', 'TRADE'].includes(input.officeId) ||
        input.dataset !== 'opening-inventory-entries'
      )
        throw Error(
          'POSTWAR_INVENTORY_PROVENANCE:FIXED_INVENTORY_DATASET_REQUIRED',
        );
      const fixed: SqlExecutor = {
        query: (sql, args) =>
          tx.query(
            sql === POSTWAR_PHYSICAL_OPENING_PAGE_QUERY
              ? POSTWAR_INVENTORY_PROVENANCE_PAGE_QUERY
              : sql,
            args,
          ),
      };
      const result = await reader.readPageFrom(fixed, input);
      if ('code' in result) return result;
      const pointer = result.source.sourcePointer;
      if (
        pointer.schemaVersion !== 'postwar-inventory-source-pointer-v2' ||
        pointer.sourceRole !== 'DIRECT_ROW_SOURCE' ||
        pointer.adoptionContextSourceRole !== 'OPERATING_ADOPTION_CONTEXT' ||
        pointer.countryId !== result.scope.countryId ||
        typeof pointer.sourceId !== 'string' ||
        typeof pointer.adoptionContextSourceId !== 'string' ||
        pointer.sourceId === pointer.adoptionContextSourceId ||
        pointer.decode !== 'seed.inventoryEntries[]' ||
        pointer.legacySourceVersion === result.source.sourceVersion ||
        !/^sha256:[0-9a-f]{64}$/u.test(String(pointer.sourcePayloadHash)) ||
        !/^sha256:[0-9a-f]{64}$/u.test(
          String(pointer.adoptionContextSourcePayloadHash),
        )
      )
        throw Error(
          'POSTWAR_INVENTORY_PROVENANCE:EXACT_V2_SOURCE_ROLES_REQUIRED',
        );
      for (const row of result.rows) {
        if (
          !row ||
          typeof row !== 'object' ||
          !('sourceId' in row) ||
          row.sourceId !== pointer.sourceId ||
          !('account' in row) ||
          !row.account ||
          typeof row.account !== 'object' ||
          !('countryId' in row.account) ||
          row.account.countryId !== result.scope.countryId
        )
          throw Error(
            'POSTWAR_INVENTORY_PROVENANCE:ROW_SOURCE_OR_COUNTRY_DIFFERS',
          );
      }
      return result;
    },
  });
}
