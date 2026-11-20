/** TEST_ONLY child H0 derived rows only. No source-admission/role issuance,
 * consumer, clock, pool creation, seed parsing or 70-family proof replay. */
import { projectRegisteredFinalOpeningInventoryRows } from './registered-final-opening-inventory.js';
import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import * as C from '@econmind/core';
import { PostgresSqlDatabase } from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import {
  consumeBeneficialHousingRentSource,
  type PreparedBeneficialHousingRentSource,
} from '../../apps/world-worker/src/persistence/postwar-beneficial-housing-rent-source.js';
import { readPostwarBeneficialHousingRentChildOperatingView } from '../../apps/world-worker/src/persistence/postwar-beneficial-housing-rent-child-view.js';
import {
  derivePostwarBeneficialChildFinanceSocialSources,
  readPostwarFinanceSocialSourceDerivation,
  type PostwarFinanceSocialSourceDerivation,
} from '../../apps/world-worker/src/persistence/postwar-finance-social-source-publication.js';
import { validatePostwarFinancialOfficeOriginalDocument } from '../../apps/world-worker/src/preparation/postwar-financial-office-originals.js';
import {
  buildPostwarMixedCurrentH0Documents,
  type H0Data,
} from './postwar-mixed-current-native-readback.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const CHILD =
    'sha256:cd6cd0825fd8b15c13dab28f030e2df24b804d5675e132ff77715a20ec67056a',
  PARENT =
    'sha256:cfc55796562b44bd616f33082cbbafd9dbd43d58733a24ac550339cbc8376274';
const issued = new WeakMap<
  object,
  { seed: C.OpeningSeed; preparation: PreparedBeneficialHousingRentSource }
>();
function fail(s: string): never {
  throw Error('REGISTERED_CHILD_H0:' + s);
}
function immutable<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(immutable);
    Object.freeze(v);
  }
  return v;
}
export interface RegisteredFinalChildH0ReadData {
  readonly classification: 'ACTUAL_BENEFICIAL_CHILD_DERIVED_H0_DATA_NOT_AUTHORITY';
  readonly worldId: string;
  readonly seedId: string;
  readonly seedFingerprint: string;
  readonly parentFingerprint: string;
  readonly canonicalSeedSHA256: string;
  readonly admissionRef: string;
  readonly sourceId: string;
  readonly sourcePayloadHash: string;
  readonly sourceRevision: string;
  readonly modelVersion: string;
  readonly replayBinding: string;
  readonly scopes: readonly Readonly<{
    countryId: string;
    scope: Readonly<Record<string, unknown>>;
  }>[];
  readonly documents: readonly H0Data[];
}
export interface RegisteredFinalChildH0DeriveInput {
  readonly seed: C.OpeningSeed;
  readonly preparation: PreparedBeneficialHousingRentSource;
  readonly admissionRef: string;
  readonly canonicalSeedSHA256: string;
  /** Same privately issued object from the parent initializer, not its manifest. */
  readonly derivation?: PostwarFinanceSocialSourceDerivation;
  readonly countryIds?: readonly string[];
}
function assertProof(
  seed: C.OpeningSeed,
  preparation: PreparedBeneficialHousingRentSource,
) {
  const proof = consumeBeneficialHousingRentSource(preparation);
  if (
    !C.isValidatedOpeningSeed(seed) ||
    seed.fingerprint !== CHILD ||
    proof.seedFingerprint !== CHILD ||
    proof.parentSeedFingerprint !== PARENT ||
    proof.worldId !== seed.worldId ||
    proof.seedId !== seed.seedId ||
    seed.openingWorldVersion !== '0' ||
    proof.receipts.length !== 70 ||
    new Set(proof.receipts.map((r) => r.countryId)).size !== 70
  )
    fail('LIVE_GENUINE_FIXED_CHILD_PROOF_REQUIRED');
  const batches = new Set(proof.receipts.map((r) => r.reclassificationBatchId));
  if (
    batches.size !== 70 ||
    seed.financialBatches.filter((b) => batches.has(b.batchId)).length !== 70
  )
    fail('ACTUAL_SEVENTY_CHILD_RECLASSIFICATION_BATCHES_REQUIRED');
  return proof;
}
export function deriveRegisteredFinalChildH0ReadData(
  input: RegisteredFinalChildH0DeriveInput,
): Readonly<RegisteredFinalChildH0ReadData> {
  const { seed, preparation } = input;
  assertProof(seed, preparation);
  if (
    !/^[a-f0-9]{64}$/u.test(input.canonicalSeedSHA256) ||
    !/^ADMISSION_[A-F0-9]{64}$/u.test(input.admissionRef)
  )
    fail('EXACT_ADMISSION_AND_STORED_INTENT_SHA_REQUIRED');
  const d =
    input.derivation === undefined
      ? derivePostwarBeneficialChildFinanceSocialSources({ seed, preparation })
      : readPostwarFinanceSocialSourceDerivation(input.derivation);
  // This actual private issuer identity is also the positive accessor check in
  // the one live initializer; JSON restoration cannot supply it.
  if (
    readPostwarFinanceSocialSourceDerivation(d) !== d ||
    d.worldId !== seed.worldId ||
    d.seedId !== seed.seedId ||
    d.seedFingerprint !== CHILD ||
    d.canonicalSeedSha256 !== input.canonicalSeedSHA256 ||
    d.countries.length !== 70
  )
    fail('SAME_ISSUED_CHILD_DERIVATION_REQUIRED');
  const child = readPostwarBeneficialHousingRentChildOperatingView({
      seed,
      preparation,
    }),
    view = child.parentView;
  if (
    child.binding.childFingerprint !== CHILD ||
    child.binding.parentFingerprint !== PARENT ||
    view.seedFingerprint !== PARENT ||
    !view.financialOfficeOriginalsDocument
  )
    fail('TRUE_PARENT_ORIGINAL_VIEW_REQUIRED');
  const financial = validatePostwarFinancialOfficeOriginalDocument(
      view.financialOfficeOriginalsDocument,
      seed,
    ),
    op = seed.sources.filter(
      (s) => s.sourceId === 'SOURCE_POSTWAR_OPERATING_V1',
    );
  if (op.length !== 1) fail('EXACT_RETAINED_OPERATING_SOURCE_REQUIRED');
  const scopes = d.countries.map((c) => {
    if (
      sha(c.derivedText) !== c.derivedSha256 ||
      Buffer.byteLength(c.derivedText) > 524288
    )
      fail('ACTUAL_COUNTRY_SOURCE_BYTES_REQUIRED');
    const body = JSON.parse(c.derivedText) as Record<string, unknown>,
      scope = body.scope;
    if (
      body.countryId !== c.countryId ||
      body.worldId !== seed.worldId ||
      body.seedId !== seed.seedId ||
      body.seedFingerprint !== CHILD ||
      body.canonicalSeedSha256 !== input.canonicalSeedSHA256 ||
      body.operatingSourceId !== op[0]!.sourceId ||
      body.operatingSourcePayloadHash !== op[0]!.payloadHash ||
      !scope ||
      typeof scope !== 'object' ||
      Array.isArray(scope) ||
      (scope as Record<string, unknown>).countryId !== c.countryId ||
      Buffer.byteLength(C.canonicalSerialize(scope)) > 262144
    )
      fail('ACTUAL_CHILD_COUNTRY_SCOPE_REQUIRED');
    return Object.freeze({
      countryId: c.countryId,
      scope: scope as Readonly<Record<string, unknown>>,
    });
  });
  if (new Set(scopes.map((c) => c.countryId)).size !== 70)
    fail('ALL_SEVENTY_ORIGINAL_COUNTRY_SCOPES_REQUIRED');
  const countries = input.countryIds ?? ['COUNTRY_01', 'COUNTRY_02'];
  if (countries.some((c) => !scopes.some((s) => s.countryId === c)))
    fail('ACTUAL_COUNTRY_SCOPE_REQUIRED');
  const projected = [
    ...buildPostwarMixedCurrentH0Documents({
      seed,
      view,
      financial,
      operatingSourceId: op[0]!.sourceId,
      countryIds: countries,
    }),
  ];
  const fs = seed.sources.filter(
    (source) => source.sourceId === financial.financialSourceId,
  );
  if (fs.length !== 1)
    fail('EXACT_RETAINED_FINANCIAL_INVENTORY_SOURCE_REQUIRED');
  for (const countryId of countries) {
    const inventory = projectRegisteredFinalOpeningInventoryRows({
      inventoryEntries: seed.inventoryEntries,
      sources: seed.sources,
      countryId,
    });
    for (const officeId of ['INDUSTRY', 'TRADE'] as const)
      projected.push({
        countryId,
        officeId,
        dataset: 'opening-inventory-entries',
        rows: inventory.rows,
        sourcePointer: {
          sourceId: op[0]!.sourceId,
          sourcePayloadHash: op[0]!.payloadHash,
          decode: 'seed.inventoryEntries',
          countryId,
          path: 'seed.inventoryEntries[account.countryId]',
          inventorySources: inventory.inventorySources,
          financialSourceId: fs[0]!.sourceId,
          financialSourcePayloadHash: fs[0]!.payloadHash,
          sourceRole: 'LEGACY_OPERATING_ADOPTION_CONTEXT_NOT_DIRECT_ROW_SOURCE',
        },
      });
  }
  const documents = projected.map((doc) =>
    Object.freeze({
      ...doc,
      sourcePointer: Object.freeze({
        ...doc.sourcePointer,
        classification:
          doc.dataset === 'opening-inventory-entries'
            ? 'ACTUAL_CHILD_COMPLETE_OPENING_INVENTORY'
            : 'TRUE_PARENT_FACTS_ACTUAL_CHILD_FINANCIAL_BATCHES',
        parentOperatingSeedFingerprint: PARENT,
        actualOpeningSeedFingerprint: CHILD,
        ...(doc.dataset === 'opening-financial-legs'
          ? {
              actualFinancialSourceIds: [
                ...new Set(
                  (doc.rows as readonly { sourceId: string }[]).map(
                    (r) => r.sourceId,
                  ),
                ),
              ].sort(),
            }
          : {}),
      }),
    }),
  );
  const data: Readonly<RegisteredFinalChildH0ReadData> = immutable({
    classification: 'ACTUAL_BENEFICIAL_CHILD_DERIVED_H0_DATA_NOT_AUTHORITY',
    worldId: seed.worldId,
    seedId: seed.seedId,
    seedFingerprint: CHILD,
    parentFingerprint: PARENT,
    canonicalSeedSHA256: input.canonicalSeedSHA256,
    admissionRef: input.admissionRef,
    sourceId: op[0]!.sourceId,
    sourcePayloadHash: op[0]!.payloadHash,
    sourceRevision: op[0]!.sourceVersion,
    modelVersion: seed.replayBinding.modelVersion,
    replayBinding: C.canonicalSerialize(seed.replayBinding),
    scopes,
    documents,
  });
  issued.set(data, { seed, preparation });
  return data;
}
export function readRegisteredFinalChildH0Data(
  data: RegisteredFinalChildH0ReadData,
): Readonly<RegisteredFinalChildH0ReadData> {
  const binding = issued.get(data);
  if (!binding) fail('SAME_ISSUED_CHILD_H0_DATA_REQUIRED');
  assertProof(binding.seed, binding.preparation);
  return data;
}
export interface RegisteredFinalChildH0Fixture {
  readonly marker: Readonly<{
    worldId: string;
    seedId: string;
    seedFingerprint: string;
    admissionRef: string;
    sourceBundleSha256: string;
  }>;
  readonly clone: Readonly<{ installer: Pool }>;
}
export interface RegisteredFinalChildH0Installation {
  readonly classification: 'TEST_ONLY_ACTUAL_CHILD_H0_REGISTRATION_NOT_RUNTIME_OR_ADMISSION';
  readonly data: Readonly<RegisteredFinalChildH0ReadData>;
  readonly documentCount: number;
  readonly scopeCount: 70;
  readonly insertedDocuments: number;
  readonly existingExactDocuments: number;
  readonly installedSqlHashes: Readonly<Record<string, string>>;
}
/** The initializer installs the reviewed schema/ACL chain separately. This
 * helper performs no DDL/GRANT or creates any role/pool/consumer/clock. */
export async function installRegisteredFinalChildH0From(
  input: Readonly<{
    fixture: RegisteredFinalChildH0Fixture;
    seed: C.OpeningSeed;
    preparation: PreparedBeneficialHousingRentSource;
    derivation?: PostwarFinanceSocialSourceDerivation;
    countryIds?: readonly string[];
  }>,
): Promise<Readonly<RegisteredFinalChildH0Installation>> {
  const { fixture, seed, preparation } = input;
  assertProof(seed, preparation);
  const d = readPostwarFinanceSocialSourceDerivation(
    input.derivation ??
      derivePostwarBeneficialChildFinanceSocialSources({ seed, preparation }),
  );
  const data = deriveRegisteredFinalChildH0ReadData({
    seed,
    preparation,
    derivation: d,
    canonicalSeedSHA256: d.canonicalSeedSha256,
    admissionRef: fixture.marker.admissionRef,
    ...(input.countryIds === undefined ? {} : { countryIds: input.countryIds }),
  });
  if (
    fixture.marker.worldId !== data.worldId ||
    fixture.marker.seedId !== data.seedId ||
    fixture.marker.seedFingerprint !== CHILD ||
    fixture.marker.admissionRef !== data.admissionRef ||
    !/^[a-f0-9]{64}$/u.test(fixture.marker.sourceBundleSha256)
  )
    fail('ACTUAL_OWNED_CHILD_FIXTURE_REQUIRED');
  const database = new PostgresSqlDatabase(fixture.clone.installer);
  let insertedDocuments = 0,
    existingExactDocuments = 0;
  await database.transaction(async (tx) => {
    await tx.query('set transaction isolation level repeatable read');
    await tx.query('set local role world_v2_postwar_projection_publisher');
    // Versioned revocation lock comes before the first source/head snapshot;
    // parent SHARE by itself cannot refresh an older RR snapshot.
    await tx.query(
      'select world_v2.lock_postwar_source_revocation_fences($1)',
      [data.worldId],
    );
    // Existing TEST_ONLY installer may assume both already-installed roles.
    // Owner is used only for immutable derived INSERTs, never to widen the
    // fence's effective-caller profile or grant an online reader raw access.
    await tx.query('set local role world_v2_postwar_projection_owner');
    await tx.query(
      "select set_config('econmind.postwar_projection_world',$1,true)",
      [data.worldId],
    );
    // Admission is immutable and its permit revocation is fenced above. Do not
    // require UPDATE privilege on that authoritative admission just to read it;
    // H and the already lockable permit retain their real SHARE locks.
    const actual = await tx.query<{
      seed_id: string;
      seed_fingerprint: string;
      canonical_sha: string;
      admission_ref: string;
      source_bundle_sha256: string;
      model_version: string;
      replay_binding: string;
      world_version: string;
      event_sequence: string;
    }>(
      "select s.seed_id,s.seed_fingerprint,encode(sha256(convert_to(s.canonical_payload,'UTF8')),'hex')canonical_sha,a.admission_ref,p.source_bundle_sha256,a.model_version,a.replay_binding,h.world_version::text,h.event_sequence::text from world_v2.opening_seed s join world_v2.runtime_opening_admission a on a.world_id=s.world_id and a.seed_id=s.seed_id and a.seed_fingerprint=s.seed_fingerprint and a.replay_binding=s.replay_binding join world_v2.world_head h on h.world_id=s.world_id join world_v2.runtime_admission_publication_permit p on 'ADMISSION_'||upper(p.authorization_sha256)=a.admission_ref and p.world_id=a.world_id and p.seed_id=a.seed_id and p.seed_fingerprint=a.seed_fingerprint and p.model_version=a.model_version and p.replay_binding=a.replay_binding where s.world_id=$1 and a.admitted_at_real>=p.valid_from and a.admitted_at_real<p.valid_until and not exists(select 1 from world_v2.runtime_admission_publication_revocation r where r.authorization_id=p.authorization_id)for share of h,p",
      [data.worldId],
    );
    const header = actual.rows[0];
    if (
      actual.rows.length !== 1 ||
      !header ||
      header.seed_id !== data.seedId ||
      header.seed_fingerprint !== CHILD ||
      header.canonical_sha !== data.canonicalSeedSHA256 ||
      header.admission_ref !== data.admissionRef ||
      header.source_bundle_sha256 !== fixture.marker.sourceBundleSha256 ||
      header.model_version !== data.modelVersion ||
      header.replay_binding !== data.replayBinding ||
      header.world_version !== '0' ||
      header.event_sequence !== '0'
    )
      fail('ACTUAL_STORED_CHILD_SHA_UNREVOKED_ADMISSION_AND_H0_REQUIRED');
    readRegisteredFinalChildH0Data(data);
    for (const country of data.scopes) {
      const raw = C.canonicalSerialize(country.scope),
        expected = [
          data.worldId,
          country.countryId,
          CHILD,
          data.admissionRef,
          data.canonicalSeedSHA256,
          header.source_bundle_sha256,
          data.sourceId,
          data.sourcePayloadHash,
          raw,
          sha(raw),
        ];
      const old = await tx.query<{
        world_id: string;
        country_id: string;
        seed_fingerprint: string;
        admission_ref: string;
        canonical_seed_sha256: string;
        source_bundle_sha256: string;
        source_id: string;
        source_payload_hash: string;
        scope_document: string;
        scope_sha256: string;
      }>(
        'select * from world_v2.postwar_social_prefix_scope where world_id=$1 and country_id=$2 for share',
        [data.worldId, country.countryId],
      );
      if (old.rows.length) {
        const r = old.rows[0]!;
        if (
          old.rows.length !== 1 ||
          C.canonicalSerialize([
            r.world_id,
            r.country_id,
            r.seed_fingerprint,
            r.admission_ref,
            r.canonical_seed_sha256,
            r.source_bundle_sha256,
            r.source_id,
            r.source_payload_hash,
            r.scope_document,
            r.scope_sha256,
          ]) !== C.canonicalSerialize(expected)
        )
          fail('IMMUTABLE_CHILD_SCOPE_CONFLICT');
      } else
        await tx.query(
          'insert into world_v2.postwar_social_prefix_scope(world_id,country_id,seed_fingerprint,admission_ref,canonical_seed_sha256,source_bundle_sha256,source_id,source_payload_hash,scope_document,scope_sha256)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
          expected,
        );
    }
    for (const doc of data.documents) {
      const normalized = await tx.query<{ text: string }>(
          'select $1::jsonb::text as text',
          [C.canonicalSerialize(doc.rows)],
        ),
        raw = normalized.rows[0]?.text;
      if (typeof raw !== 'string')
        fail('EXACT_POSTGRES_JSONB_DOCUMENT_TEXT_REQUIRED');
      const ref =
          'TEST_CHILD_H0_' +
          sha(
            C.canonicalSerialize({
              world: data.worldId,
              seed: CHILD,
              country: doc.countryId,
              office: doc.officeId,
              dataset: doc.dataset,
              rows: sha(raw),
            }),
          ).toUpperCase(),
        pages: unknown[][] = [[]];
      for (const value of doc.rows) {
        let page = pages.at(-1)!;
        if (
          page.length >= 100 ||
          (page.length > 0 &&
            Buffer.byteLength(C.canonicalSerialize([...page, value])) > 40000)
        ) {
          page = [];
          pages.push(page);
        }
        page.push(value);
      }
      const old = await tx.query<{
        document_ref: string;
        seed_fingerprint: string;
        admission_ref: string;
        document_sha256: string;
        total_rows: number;
        page_count: number;
        source_id: string;
        source_payload_hash: string;
        canonical_seed_sha256: string;
        source_bundle_sha256: string;
        source_pointer: unknown;
        model_version: string;
        replay_binding: string;
        seed_id: string;
        source_version: string;
        source_revision: string;
        projection_version: string;
      }>(
        'select * from world_v2.postwar_office_projection_document where world_id=$1 and country_id=$2 and office_id=$3 and dataset=$4 for share',
        [data.worldId, doc.countryId, doc.officeId, doc.dataset],
      );
      if (old.rows.length) {
        const r = old.rows[0]!;
        if (
          old.rows.length !== 1 ||
          r.document_ref !== ref ||
          r.seed_fingerprint !== CHILD ||
          r.seed_id !== data.seedId ||
          r.projection_version !== 'postwar-office-projection.v1' ||
          r.source_revision !== data.sourceRevision ||
          r.source_version !== 'sha256:' + sha(ref + sha(raw)) ||
          r.admission_ref !== data.admissionRef ||
          r.document_sha256 !== sha(raw) ||
          r.total_rows !== doc.rows.length ||
          r.page_count !== pages.length ||
          r.source_id !== data.sourceId ||
          r.source_payload_hash !== data.sourcePayloadHash ||
          r.canonical_seed_sha256 !== data.canonicalSeedSHA256 ||
          r.source_bundle_sha256 !== header.source_bundle_sha256 ||
          r.model_version !== data.modelVersion ||
          r.replay_binding !== data.replayBinding ||
          C.canonicalSerialize(r.source_pointer) !==
            C.canonicalSerialize(doc.sourcePointer)
        )
          fail('IMMUTABLE_CHILD_H0_DOCUMENT_CONFLICT');
        existingExactDocuments++;
      } else {
        await tx.query(
          "insert into world_v2.postwar_office_projection_document(document_ref,world_id,country_id,office_id,dataset,projection_version,source_version,source_revision,admission_ref,seed_id,seed_fingerprint,canonical_seed_sha256,source_bundle_sha256,source_id,source_payload_hash,source_pointer,model_version,replay_binding,world_version,event_sequence,document_sha256,total_rows,page_count)values($1,$2,$3,$4,$5,'postwar-office-projection.v1',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17,0,0,$18,$19,$20)",
          [
            ref,
            data.worldId,
            doc.countryId,
            doc.officeId,
            doc.dataset,
            'sha256:' + sha(ref + sha(raw)),
            data.sourceRevision,
            data.admissionRef,
            data.seedId,
            CHILD,
            data.canonicalSeedSHA256,
            header.source_bundle_sha256,
            data.sourceId,
            data.sourcePayloadHash,
            C.canonicalSerialize(doc.sourcePointer),
            data.modelVersion,
            data.replayBinding,
            sha(raw),
            doc.rows.length,
            pages.length,
          ],
        );
        insertedDocuments++;
      }
      let offset = 0;
      for (const [index, page] of pages.entries()) {
        const n = await tx.query<{ text: string }>(
            'select $1::jsonb::text as text',
            [C.canonicalSerialize(page)],
          ),
          text = n.rows[0]?.text;
        if (typeof text !== 'string' || Buffer.byteLength(text) > 48000)
          fail('BOUNDED_EXACT_H0_PAGE_REQUIRED');
        if (old.rows.length) {
          const existing = await tx.query<{
            rows_text: string;
            page_sha256: string;
            row_offset: string;
            row_count: string;
          }>(
            'select rows_text,page_sha256,row_offset::text,row_count::text from world_v2.postwar_office_projection_page where document_ref=$1 and page_index=$2',
            [ref, index],
          );
          const r = existing.rows[0];
          if (
            existing.rows.length !== 1 ||
            !r ||
            r.rows_text !== text ||
            r.page_sha256 !== sha(text) ||
            r.row_offset !== String(offset) ||
            r.row_count !== String(page.length)
          )
            fail('IMMUTABLE_CHILD_H0_PAGE_CONFLICT');
        } else
          await tx.query(
            'insert into world_v2.postwar_office_projection_page(document_ref,world_id,country_id,office_id,page_index,row_offset,row_count,rows_text,page_sha256)values($1,$2,$3,$4,$5,$6,$7,$8,$9)',
            [
              ref,
              data.worldId,
              doc.countryId,
              doc.officeId,
              index,
              offset,
              page.length,
              text,
              sha(text),
            ],
          );
        offset += page.length;
      }
      const pageCount = await tx.query<{ count: string }>(
        'select count(*)::text as count from world_v2.postwar_office_projection_page where document_ref=$1',
        [ref],
      );
      if (
        pageCount.rows.length !== 1 ||
        pageCount.rows[0]?.count !== String(pages.length)
      )
        fail('EXACT_IMMUTABLE_CHILD_H0_PAGE_COUNT_REQUIRED');
    }
    readRegisteredFinalChildH0Data(data);
  });
  return Object.freeze({
    classification:
      'TEST_ONLY_ACTUAL_CHILD_H0_REGISTRATION_NOT_RUNTIME_OR_ADMISSION',
    data,
    documentCount: data.documents.length,
    scopeCount: 70,
    insertedDocuments,
    existingExactDocuments,
    installedSqlHashes: Object.freeze({}),
  });
}
