import type {
  CanonicalCommand,
  CaptainPoliticalCapitalReason,
  PoliticalCapitalSnapshot,
  WorldWriterLease,
} from '@econmind/core';
import type { CaptainPoliticalCapitalMissing } from './captain-political-capital-candidate-source.js';
import type { SqlExecutor } from './sql-database.js';

/** Original data, never an authority grant. The server custodian must independently
 * resolve and validate issuer/admission/current revisions before exposing bytes. */
export interface CaptainOperatingOriginal {
  readonly recordId: string;
  readonly revision: string;
  readonly factRef: string;
  readonly sourceRef: string;
  readonly predecessorFactRefs: readonly string[];
  readonly issuerRef: string;
  readonly custodianRef: string;
  readonly admissionRef: string;
  readonly admissionRevision: string;
  readonly sourceClass: 'ADMITTED_ORIGINAL' | 'TEST_ONLY';
  readonly effectiveFromSimTime: string;
  readonly effectiveUntilSimTime: string | null;
  readonly revokedByRevision: string | null;
  readonly canonicalPayload: string;
  readonly payloadSHA256: string;
}

export interface CaptainOperatingGenesisV1 {
  readonly schemaVersion: 'captain-operating-genesis-v1';
  readonly worldId: string;
  readonly countryId: string;
  readonly seedId: string;
  readonly seedFingerprint: string;
  readonly semanticRevision: string;
  readonly capital: PoliticalCapitalSnapshot;
}

export interface CaptainOperatingReasonV1 {
  readonly schemaVersion: 'captain-operating-reason-v1';
  readonly worldId: string;
  readonly countryId: string;
  readonly reason: CaptainPoliticalCapitalReason;
}

export type CaptainOperatingOriginalsRead =
  | Readonly<{
      kind: 'MISSING';
      missing: readonly CaptainPoliticalCapitalMissing[];
    }>
  | Readonly<{
      kind: 'ORIGINALS';
      genesis: CaptainOperatingOriginal;
      reason: CaptainOperatingOriginal;
      lease: WorldWriterLease;
    }>;

export interface CaptainOperatingSourceRequest {
  readonly purpose: 'CAPTAIN_OPERATING_SOURCE_READ_V1';
  readonly command: Readonly<CanonicalCommand>;
  readonly observedAtReal: string;
}

/** Required, separately implemented server trust boundary. No default issuer,
 * registry, admission or native lock implementation is supplied by this module.
 *
 * The implementation must load original genesis/reason bytes from its actual
 * admitted publisher, validate issuer/owner adoption and current admission,
 * revocation/effective revisions and bind them to this command/world/country.
 * It must read the actual writer lease before the consumer reads the head.
 * Every SQL operation uses the supplied owning executor and respects existing
 * submission/lease/head lock order. Cooperating source guards must survive the
 * callback and remain held through the OUTER transaction's COMMIT/ROLLBACK.
 * Callback lifetime, sourceClass, DTO hashes and a parsed lease are not evidence
 * that those native/admission requirements were fulfilled.
 *
 * TEST_ONLY fixtures may implement this protocol explicitly; that does not make
 * them production source custodians. Never select this dependency from HTTP.
 */
export interface CaptainOperatingSourceCustodyPort {
  withProtectedAdmittedOriginalsFrom<Result>(
    executor: SqlExecutor,
    request: Readonly<CaptainOperatingSourceRequest>,
    consume: (read: CaptainOperatingOriginalsRead) => Promise<Result>,
  ): Promise<Result>;
}
