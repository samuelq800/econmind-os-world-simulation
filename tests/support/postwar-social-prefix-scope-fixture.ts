/** Explicit TEST_ONLY reuse of immutable H0 scope rows between owned clones.
 * No canonical seed parsing, economic/authority/head copying, or SQL grants.
 * Real Core replay and publication still validate the subsequent H4 command. */
import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { PostwarNativeReferenceMarker } from './postwar-native-reference-db.js';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const columns = [
  'world_id',
  'country_id',
  'seed_fingerprint',
  'admission_ref',
  'canonical_seed_sha256',
  'source_bundle_sha256',
  'source_id',
  'source_payload_hash',
  'scope_document',
  'scope_sha256',
] as const;
type Scope = Record<(typeof columns)[number], string>;
const metadataSql = `select h.world_version::text,h.event_sequence::text,
 s.seed_id,s.seed_fingerprint,a.model_version,s.replay_binding,
 a.admission_ref,p.source_bundle_sha256
 from world_v2.world_head h join world_v2.opening_seed s using(world_id)
 join world_v2.runtime_opening_admission a using(world_id,seed_id,seed_fingerprint,replay_binding)
 join world_v2.runtime_admission_publication_permit p on 'ADMISSION_'||upper(p.authorization_sha256)=a.admission_ref
 and p.world_id=a.world_id and p.seed_id=a.seed_id and p.seed_fingerprint=a.seed_fingerprint
 and p.model_version=a.model_version and p.replay_binding=a.replay_binding
 where h.world_id=$1 and a.model_version=s.replay_binding::jsonb->>'modelVersion'
 and a.admitted_at_real>=p.valid_from and a.admitted_at_real<p.valid_until
 and not exists(select 1 from world_v2.runtime_admission_publication_revocation r where r.authorization_id=p.authorization_id)`;
const footprintSql = `select h.world_version::text,h.event_sequence::text,
 (select count(*)::text from world_v2.authoritative_event where world_id=$1)as events,
 (select count(*)::text from world_v2.command_submission where world_id=$1)as commands,
 (select count(*)::text from world_v2.command_receipt where world_id=$1)as receipts,
 (select count(*)::text from world_v2.financial_posting_batch where world_id=$1)as financial,
 (select count(*)::text from world_v2.inventory_posting where world_id=$1)as inventory,
 (select count(*)::text from world_v2.current_commit_authorization where world_id=$1)as authorizations,
 (select count(*)::text from world_v2.runtime_read_seat where world_id=$1)as seats,
 (select count(*)::text from world_v2.projection_entitlement where world_id=$1)as entitlements,
 (select count(*)::text from world_v2.runtime_opening_admission where world_id=$1)as admissions
 from world_v2.world_head h where h.world_id=$1`;

async function metadata(client: Pool | PoolClient, world: string) {
  const r = await client.query<Record<string, string>>(metadataSql, [world]);
  if (r.rows.length !== 1)
    throw Error('SCOPE_FIXTURE_ONE_ACTUAL_ADMITTED_METADATA_REQUIRED');
  return r.rows[0]!;
}
export async function copyImmutablePostwarSocialPrefixScopes(input: {
  source: Pool;
  target: Pool;
  marker: PostwarNativeReferenceMarker;
  expectedCanonicalSeedSha256: string;
}) {
  const { marker } = input,
    origin = await metadata(input.source, marker.worldId),
    destination = await metadata(input.target, marker.worldId);
  if (
    origin.world_version !== '4' ||
    origin.event_sequence !== '4' ||
    destination.world_version !== '3' ||
    destination.event_sequence !== '3' ||
    !/^[0-9a-f]{64}$/u.test(input.expectedCanonicalSeedSha256)
  )
    throw Error('SCOPE_FIXTURE_EXACT_H4_SOURCE_H3_DESTINATION_REQUIRED');
  for (const key of [
    'seed_id',
    'seed_fingerprint',
    'model_version',
    'replay_binding',
    'admission_ref',
    'source_bundle_sha256',
  ])
    if (origin[key] !== destination[key])
      throw Error('SCOPE_FIXTURE_ACTUAL_IMMUTABLE_LINEAGE_MISMATCH');
  if (
    origin.seed_id !== marker.seedId ||
    origin.seed_fingerprint !== marker.seedFingerprint ||
    origin.admission_ref !== marker.admissionRef ||
    origin.source_bundle_sha256 !== marker.sourceBundleSha256
  )
    throw Error('SCOPE_FIXTURE_REFERENCE_PINS_MISMATCH');
  const scopes = (
    await input.source.query<Scope>(
      `select ${columns.join(',')} from world_v2.postwar_social_prefix_scope where world_id=$1 order by country_id`,
      [marker.worldId],
    )
  ).rows;
  if (
    scopes.length !== 70 ||
    new Set(scopes.map((row) => row.country_id)).size !== 70
  )
    throw Error('SCOPE_FIXTURE_EXACT_SEVENTY_UNIQUE_COUNTRIES_REQUIRED');
  const docs = (
    await input.target.query<Record<string, string>>(
      `select distinct seed_id,seed_fingerprint,admission_ref,canonical_seed_sha256,source_bundle_sha256,source_id,source_payload_hash
       from world_v2.postwar_office_projection_document where world_id=$1 and office_id='SOCIAL'
       and dataset in('positions','service-pools')and world_version=0 and event_sequence=0`,
      [marker.worldId],
    )
  ).rows;
  if (docs.length !== 1)
    throw Error('SCOPE_FIXTURE_ACTUAL_H0_DOCUMENT_ORIGINAL_PINS_REQUIRED');
  const doc = docs[0]!;
  for (const row of scopes) {
    if (
      columns.some((key) => typeof row[key] !== 'string') ||
      row.world_id !== marker.worldId ||
      row.seed_fingerprint !== marker.seedFingerprint ||
      row.admission_ref !== marker.admissionRef ||
      row.canonical_seed_sha256 !== input.expectedCanonicalSeedSha256 ||
      Buffer.byteLength(row.scope_document) > 262144 ||
      sha(row.scope_document) !== row.scope_sha256 ||
      JSON.parse(row.scope_document).countryId !== row.country_id ||
      [
        'seed_fingerprint',
        'admission_ref',
        'canonical_seed_sha256',
        'source_bundle_sha256',
        'source_id',
        'source_payload_hash',
      ].some((key) => row[key as keyof Scope] !== doc[key])
    )
      throw Error('SCOPE_FIXTURE_SOURCE_ROW_BYTES_OR_ORIGINAL_PINS_MISMATCH');
  }
  const tx = await input.target.connect();
  try {
    await tx.query('begin');
    const before = (await tx.query(footprintSql, [marker.worldId])).rows;
    for (const row of scopes)
      await tx.query(
        `insert into world_v2.postwar_social_prefix_scope(${columns.join(',')})values(${columns.map((_, i) => '$' + (i + 1)).join(',')})`,
        columns.map((key) => row[key]),
      );
    const copied = (
      await tx.query<Scope>(
        `select ${columns.join(',')} from world_v2.postwar_social_prefix_scope where world_id=$1 order by country_id`,
        [marker.worldId],
      )
    ).rows;
    if (JSON.stringify(scopes) !== JSON.stringify(copied))
      throw Error('SCOPE_FIXTURE_COPIED_BYTES_DIFFER_FROM_ORIGINAL');
    const after = (await tx.query(footprintSql, [marker.worldId])).rows;
    if (JSON.stringify(before) !== JSON.stringify(after))
      throw Error('SCOPE_FIXTURE_ECONOMIC_HEAD_OR_AUTHORITY_FOOTPRINT_CHANGED');
    await tx.query('commit');
    return {
      classification: 'TEST_ONLY_IMMUTABLE_H0_SCOPE_CACHE_REUSE_NOT_AUTHORITY',
      origin,
      destination,
      actualH0OriginalPins: doc,
      sourceRows: scopes.length,
      sourceScopeBytes: scopes.reduce(
        (n, row) => n + Buffer.byteLength(row.scope_document),
        0,
      ),
      rowHashes: scopes.map((row) => ({
        countryId: row.country_id,
        sourceId: row.source_id,
        sourcePayloadHash: row.source_payload_hash,
        sha256: row.scope_sha256,
        bytes: Buffer.byteLength(row.scope_document),
      })),
      destinationBefore: before,
      destinationAfter: after,
      seedPayloadParsedByCopy: false,
      commandsOrAuthorityCopied: false,
    };
  } catch (error) {
    await tx.query('rollback').catch(() => {});
    throw error;
  } finally {
    tx.release();
  }
}
