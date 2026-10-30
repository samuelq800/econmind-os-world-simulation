/** TEST_ONLY same-admission H0→H3 physical derived-page bridge. No opening
 * payload, Core replay, source generation, event insert or authority grant. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  clonePostwarNativeReference,
  loadPostwarNativeReferenceMarker,
} from './postwar-native-reference-db.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function need(value: unknown, code: string): asserts value {
  if (!value) throw Error('PHYSICAL_HTTP_FIXTURE:' + code);
}
function lossless(bytes: string): readonly Record<string, unknown>[] {
  const parse = JSON.parse as (
    s: string,
    reviver: (k: string, v: unknown, context: { source?: string }) => unknown,
  ) => unknown;
  const rows = parse(bytes, (_k, v, context) =>
    typeof v === 'number' ? context.source : v,
  );
  need(Array.isArray(rows), 'SOURCE_ROWS_ARRAY_REQUIRED');
  return rows as readonly Record<string, unknown>[];
}
export async function createPhysicalOpeningHttpNativeFixture(
  h3Path: string,
  h0Path: string,
) {
  const h3Bytes = await readFile(h3Path, 'utf8'),
    h0Bytes = await readFile(h0Path, 'utf8');
  const h3 = JSON.parse(h3Bytes),
    h0 = JSON.parse(h0Bytes);
  need(
    h3.referenceMarker === h0.referenceMarker,
    'SAME_REFERENCE_MARKER_REQUIRED',
  );
  const marker = await loadPostwarNativeReferenceMarker(h3.referenceMarker);
  for (const d of [h3, h0])
    need(
      d.seedFingerprint === marker.seedFingerprint &&
        d.admissionRef === marker.admissionRef,
      'SAME_SEED_ADMISSION_REQUIRED',
    );
  const clone = await clonePostwarNativeReference(
    marker,
    'physical_http',
    h3.templateDatabase,
  );
  let ancestor:
    Awaited<ReturnType<typeof clonePostwarNativeReference>> | undefined;
  try {
    const head = (
      await clone.installer.query(
        'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1',
        [marker.worldId],
      )
    ).rows[0];
    need(
      head?.world_version === '3' && head.event_sequence === '3',
      'ACTUAL_H3_TEMPLATE_REQUIRED',
    );
    const admission = (
      await clone.installer.query(
        'select admission_ref,seed_fingerprint from world_v2.runtime_opening_admission where world_id=$1',
        [marker.worldId],
      )
    ).rows[0];
    need(
      admission?.admission_ref === marker.admissionRef &&
        admission.seed_fingerprint === marker.seedFingerprint,
      'ACTUAL_SAME_IMMUTABLE_ADMISSION_REQUIRED',
    );
    ancestor = await clonePostwarNativeReference(
      marker,
      'physical_http_h0',
      h0.templateDatabase,
    );
    const documents = (
      await ancestor.installer.query<{ body: string }>(
        "select row_to_json(d)::text as body from world_v2.postwar_office_projection_document d where world_id=$1 and country_id=$2 and office_id in('INDUSTRY','TRADE','CAPTAIN')order by office_id,dataset",
        [marker.worldId, marker.countryId],
      )
    ).rows.map((r) => JSON.parse(r.body));
    need(documents.length === 5, 'FIVE_ACTUAL_PHYSICAL_DOCUMENTS_REQUIRED');
    const originals = new Map<string, readonly Record<string, unknown>[]>();
    const documentEvidence: unknown[] = [];
    await clone.installer.query('begin');
    try {
      for (const document of documents) {
        need(
          document.seed_fingerprint === marker.seedFingerprint &&
            document.admission_ref === marker.admissionRef &&
            document.source_bundle_sha256 === marker.sourceBundleSha256 &&
            document.world_version === 0 &&
            document.event_sequence === 0,
          'EXACT_H0_SOURCE_BINDING_REQUIRED',
        );
        await clone.installer.query(
          'insert into world_v2.postwar_office_projection_document select * from json_populate_record(null::world_v2.postwar_office_projection_document,$1::json)on conflict(document_ref)do nothing',
          [JSON.stringify(document)],
        );
        const pages = (
          await ancestor.installer.query<{ body: string }>(
            'select row_to_json(p)::text as body from world_v2.postwar_office_projection_page p where document_ref=$1 order by page_index',
            [document.document_ref],
          )
        ).rows.map((r) => JSON.parse(r.body));
        need(
          pages.length === document.page_count,
          'ORIGINAL_PAGE_COUNT_REQUIRED',
        );
        const rows: Record<string, unknown>[] = [];
        for (const page of pages) {
          need(
            sha(page.rows_text) === page.page_sha256,
            'ORIGINAL_PAGE_SHA256_REQUIRED',
          );
          rows.push(...lossless(page.rows_text));
          await clone.installer.query(
            'insert into world_v2.postwar_office_projection_page select * from json_populate_record(null::world_v2.postwar_office_projection_page,$1::json)on conflict(document_ref,page_index)do nothing',
            [JSON.stringify(page)],
          );
        }
        need(rows.length === document.total_rows, 'ORIGINAL_TOTAL_REQUIRED');
        originals.set(`${document.office_id}/${document.dataset}`, rows);
        documentEvidence.push({
          office: document.office_id,
          dataset: document.dataset,
          rows: rows.length,
          sourceVersion: document.source_version,
          sourcePointer: document.source_pointer,
          documentSha256: document.document_sha256,
          pageSha256: pages.map((p) => p.page_sha256),
        });
      }
      await clone.installer.query('commit');
    } catch (error) {
      await clone.installer.query('rollback');
      throw error;
    }
    const sqlPath =
      'database/proposals/postwar-physical-opening-facts-read.sql';
    const sql = await readFile(
      path.resolve(import.meta.dirname, '../..', sqlPath),
      'utf8',
    );
    await clone.installer.query(sql);
    await ancestor.drop();
    ancestor = undefined;
    return {
      marker,
      clone,
      originals,
      sourceEvidence: {
        classification:
          'TEST_ONLY_DERIVED_PAGE_COPY_NOT_NEW_SOURCE_OR_AUTHORITY',
        h3Descriptor: h3Path,
        h3DescriptorSha256: sha(h3Bytes),
        h0Descriptor: h0Path,
        h0DescriptorSha256: sha(h0Bytes),
        seedFingerprint: marker.seedFingerprint,
        admissionRef: marker.admissionRef,
        sourceBundleSha256: marker.sourceBundleSha256,
        head,
        sqlPath,
        sqlSha256: sha(sql),
        documents: documentEvidence,
        canonicalPayloadRead: false,
        coreEventsInsertedOrRewritten: false,
      },
    };
  } catch (error) {
    try {
      if (ancestor) await ancestor.drop();
    } finally {
      await clone.drop();
    }
    throw error;
  }
}

/** Explicit V2 read-only fixture mode. The retained template already contains
 * fixed-publisher attestations. Never installs SQL, republishes, copies source
 * facts, parses canonical_payload or treats a legacy descriptor as repaired. */
export async function createPreparedPhysicalOpeningHttpNativeFixture(
  preparedPath: string,
) {
  const bytes = await readFile(preparedPath, 'utf8'),
    prepared = JSON.parse(bytes);
  need(
    prepared.schemaVersion ===
      'postwar-inventory-provenance-native-template-v2',
    'EXPLICIT_PREPARED_V2_DESCRIPTOR_REQUIRED',
  );
  const marker = await loadPostwarNativeReferenceMarker(
    prepared.referenceMarker,
  );
  need(
    prepared.worldId === marker.worldId &&
      prepared.sourceBundleSha256 === marker.sourceBundleSha256 &&
      prepared.seedFingerprint === marker.seedFingerprint &&
      prepared.admissionRef === marker.admissionRef &&
      prepared.worldVersion === '3' &&
      prepared.eventSequence === '3',
    'EXACT_PREPARED_H3_PINS_REQUIRED',
  );
  const clone = await clonePostwarNativeReference(
    marker,
    'physical_http_v2',
    prepared.templateDatabase,
  );
  try {
    const head = (
      await clone.installer.query(
        'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1',
        [marker.worldId],
      )
    ).rows[0];
    need(
      head?.world_version === '3' && head.event_sequence === '3',
      'ACTUAL_UNCHANGED_H3_REQUIRED',
    );
    const admission = (
      await clone.installer.query(
        'select admission_ref,seed_fingerprint from world_v2.runtime_opening_admission where world_id=$1',
        [marker.worldId],
      )
    ).rows[0];
    need(
      admission?.admission_ref === marker.admissionRef &&
        admission.seed_fingerprint === marker.seedFingerprint,
      'ACTUAL_PREPARED_IMMUTABLE_ADMISSION_REQUIRED',
    );
    const documents = (
      await clone.installer.query(
        "select row_to_json(d)::text as body from world_v2.postwar_office_projection_document d where world_id=$1 and country_id=$2 and office_id in('INDUSTRY','TRADE','CAPTAIN')order by office_id,dataset",
        [marker.worldId, marker.countryId],
      )
    ).rows.map((r) => JSON.parse(r.body));
    need(documents.length === 5, 'FIVE_ACTUAL_PHYSICAL_DOCUMENTS_REQUIRED');
    const attestations = (
      await clone.installer.query(
        'select row_to_json(v)::text as body from world_v2.postwar_inventory_provenance_v2 v where world_id=$1 and country_id=$2 order by office_id',
        [marker.worldId, marker.countryId],
      )
    ).rows.map((r) => JSON.parse(r.body));
    need(
      attestations.length === 2,
      'BOTH_FIXED_PUBLISHER_V2_ATTESTATIONS_REQUIRED',
    );
    const originals = new Map<string, readonly Record<string, unknown>[]>(),
      legacyDocuments = new Map<string, Record<string, unknown>>(),
      inventoryProvenance = new Map<string, Record<string, unknown>>();
    const documentEvidence: unknown[] = [];
    for (const d of documents) {
      need(
        d.seed_fingerprint === marker.seedFingerprint &&
          d.admission_ref === marker.admissionRef &&
          d.source_bundle_sha256 === marker.sourceBundleSha256 &&
          d.world_version === 0 &&
          d.event_sequence === 0,
        'EXACT_LEGACY_DOCUMENT_PINS_REQUIRED',
      );
      const pages = (
        await clone.installer.query(
          'select row_to_json(p)::text as body from world_v2.postwar_office_projection_page p where document_ref=$1 order by page_index',
          [d.document_ref],
        )
      ).rows.map((r) => JSON.parse(r.body));
      need(pages.length === d.page_count, 'EXACT_LEGACY_PAGE_COUNT_REQUIRED');
      const rows: Record<string, unknown>[] = [];
      for (const p of pages) {
        need(
          sha(p.rows_text) === p.page_sha256,
          'EXACT_LEGACY_PAGE_HASH_REQUIRED',
        );
        rows.push(...lossless(p.rows_text));
      }
      need(rows.length === d.total_rows, 'EXACT_LEGACY_ROW_COUNT_REQUIRED');
      const key = d.office_id + '/' + d.dataset;
      originals.set(key, rows);
      legacyDocuments.set(key, d);
      if (d.dataset === 'opening-inventory-entries') {
        const matches = attestations.filter(
          (a) =>
            a.document_ref === d.document_ref && a.office_id === d.office_id,
        );
        need(matches.length === 1, 'EXACT_V2_DOCUMENT_BINDING_REQUIRED');
        const a = matches[0];
        need(
          a.seed_fingerprint === d.seed_fingerprint &&
            a.admission_ref === d.admission_ref &&
            a.source_bundle_sha256 === d.source_bundle_sha256 &&
            a.canonical_seed_sha256 === d.canonical_seed_sha256 &&
            a.document_sha256 === d.document_sha256 &&
            a.legacy_source_version === d.source_version &&
            a.source_version !== d.source_version,
          'IMMUTABLE_VERSIONED_ATTESTATION_REQUIRED',
        );
        need(
          a.source_pointer.schemaVersion ===
            'postwar-inventory-source-pointer-v2' &&
            a.source_pointer.sourceRole === 'DIRECT_ROW_SOURCE' &&
            a.source_pointer.sourceId === a.direct_source_id &&
            a.source_pointer.sourcePayloadHash ===
              a.direct_source_payload_hash &&
            a.source_pointer.adoptionContextSourceId === d.source_id &&
            a.source_pointer.adoptionContextSourcePayloadHash ===
              d.source_payload_hash &&
            rows.every((r) => r.sourceId === a.direct_source_id),
          'DIRECT_ROW_SOURCE_DIFFERS_FROM_ADOPTION_CONTEXT_REQUIRED',
        );
        inventoryProvenance.set(d.office_id, a);
      }
      documentEvidence.push({
        office: d.office_id,
        dataset: d.dataset,
        rows: rows.length,
        legacySourceVersion: d.source_version,
        legacySourcePointer: d.source_pointer,
        legacyPointerSemantics:
          d.dataset === 'opening-inventory-entries'
            ? 'LEGACY_ADOPTION_CONTEXT_POINTER_NOT_DIRECT_ROW_SOURCE'
            : 'DIRECT_OPERATING_SOURCE',
        documentSha256: d.document_sha256,
        pageSha256: pages.map((p) => p.page_sha256),
      });
    }
    return {
      marker,
      clone,
      originals,
      legacyDocuments,
      inventoryProvenance,
      sourceEvidence: {
        classification:
          'TEST_ONLY_PREPARED_V2_DERIVED_METADATA_NOT_NEW_SOURCE_OR_AUTHORITY',
        mode: 'EXPLICIT_PREPARED_V2_NO_SQL_INSTALL_OR_PUBLICATION',
        preparedDescriptor: preparedPath,
        preparedDescriptorSha256: sha(bytes),
        seedFingerprint: marker.seedFingerprint,
        admissionRef: marker.admissionRef,
        sourceBundleSha256: marker.sourceBundleSha256,
        head,
        documents: documentEvidence,
        inventoryProvenance: attestations,
        canonicalPayloadRead: false,
        fullSeedValidatedAgain: false,
        CoreEventsInsertedOrRewritten: false,
        legacyDocumentsRewritten: false,
      },
    };
  } catch (error) {
    await clone.drop();
    throw error;
  }
}
