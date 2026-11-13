/** Isolated test setup only: numeric capital is REQUIRED from the fixture;
 * never a formal rule, Owner adoption, role grant, signature or production seed.
 * Reuses the actual fixed packet validator and controlled SQL publication entry. */
import { createHash } from 'node:crypto';
import {
  canonicalSerialize,
  type PoliticalCapitalSnapshot,
} from '@econmind/core';
import {
  createCaptainSourcePublicationPacket,
  publishCaptainOperatingSourceFrom,
  type CaptainSourcePublicationPacket,
} from '../../apps/world-worker/src/persistence/postwar-captain-source-publication.js';
import type { CaptainOperatingOriginal } from '../../apps/world-worker/src/persistence/captain-operating-source-custody.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
export function createTestOnlyCaptainPublicationPacket(input: {
  worldId: string;
  countryId: string;
  seedId: string;
  seedFingerprint: string;
  worldAdmissionRef: string;
  capital: PoliticalCapitalSnapshot;
  reasonFactRef: string;
  reasonRecordRef: string;
  reason: string;
}): Readonly<CaptainSourcePublicationPacket> {
  const suffix = sha(
    canonicalSerialize({ world: input.worldId, country: input.countryId }),
  )
    .slice(0, 24)
    .toUpperCase();
  const original = (
    ref: string,
    payload: unknown,
  ): CaptainOperatingOriginal => {
    const raw = canonicalSerialize(payload);
    return {
      recordId: ref,
      revision: 'TEST_ONLY_REV_1',
      factRef: ref,
      sourceRef: 'SOURCE_TEST_ONLY_CAPTAIN_' + suffix,
      predecessorFactRefs: ['TEST_ONLY_SOURCE_ADOPTION_NOT_OWNER'],
      issuerRef: 'ISSUER_TEST_ONLY_NOT_OWNER',
      custodianRef: 'CUSTODIAN_TEST_ONLY',
      admissionRef: 'CAPTAIN_ADMISSION_TEST_ONLY_' + suffix,
      admissionRevision: 'CAPTAIN_ADOPTION_TEST_ONLY_REV_1',
      sourceClass: 'TEST_ONLY',
      effectiveFromSimTime: '0',
      effectiveUntilSimTime: null,
      revokedByRevision: null,
      canonicalPayload: raw,
      payloadSHA256: sha(raw),
    };
  };
  const genesis = original('GENESIS_TEST_ONLY_CAPTAIN_' + suffix, {
    schemaVersion: 'captain-operating-genesis-v1',
    worldId: input.worldId,
    countryId: input.countryId,
    seedId: input.seedId,
    seedFingerprint: input.seedFingerprint,
    semanticRevision: 'CAPTAIN_ALLOCATION_TEST_ONLY_V1',
    capital: input.capital,
  });
  return createCaptainSourcePublicationPacket({
    adoption: {
      adoptionRef: 'ADOPTION_TEST_ONLY_CAPTAIN_' + suffix,
      worldId: input.worldId,
      countryId: input.countryId,
      seedId: input.seedId,
      seedFingerprint: input.seedFingerprint,
      worldAdmissionRef: input.worldAdmissionRef,
      issuerRef: genesis.issuerRef,
      custodianRef: genesis.custodianRef,
      admissionRef: genesis.admissionRef,
      admissionRevision: genesis.admissionRevision,
      originalAdmissionEvidenceSha256: sha(
        canonicalSerialize({
          kind: 'TEST_ONLY_NOT_OWNER_NOT_APPROVAL',
          worldId: input.worldId,
          countryId: input.countryId,
          seedFingerprint: input.seedFingerprint,
          capital: input.capital,
          reasonRecordRef: input.reasonRecordRef,
        }),
      ),
    },
    genesis,
    reasons: [
      original(input.reasonFactRef, {
        schemaVersion: 'captain-operating-reason-v1',
        worldId: input.worldId,
        countryId: input.countryId,
        reason: {
          countryRef: input.countryId,
          recordRef: input.reasonRecordRef,
          reason: input.reason,
        },
      }),
    ],
  });
}
/** Caller must open its own isolated TEST_ONLY release transaction/session.
 * Existing SQL requires effective admission_release + actual session membership.
 * No grant, enrollment or new credential occurs here. */
export async function registerAndPublishTestOnlyCaptainFrom(
  tx: SqlExecutor,
  packet: CaptainSourcePublicationPacket,
) {
  if (
    [packet.genesis, ...packet.reasons].some(
      (o) => o.sourceClass !== 'TEST_ONLY',
    )
  )
    throw Error('TEST_ONLY_ORIGINALS_REQUIRED');
  const raw = canonicalSerialize(packet);
  await tx.query('select world_v2.register_captain_source_publication($1,$2)', [
    raw,
    sha(raw),
  ]);
  return publishCaptainOperatingSourceFrom(tx, packet);
}
