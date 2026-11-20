/** Explicit offline publisher for a privately verified beneficial child. It
 * neither grants a publisher role nor creates admission. The original parent
 * view and the actual stored child header keep their separate fingerprints. */
import type { OpeningSeed } from '@econmind/core';
import {
  consumeBeneficialHousingRentSource,
  type PreparedBeneficialHousingRentSource,
} from './postwar-beneficial-housing-rent-source.js';
import { readPostwarBeneficialHousingRentChildOperatingView } from './postwar-beneficial-housing-rent-child-view.js';
import {
  SOCIAL_CUSTODY_SESSION_QUERY,
  SOCIAL_OPERATING_CUSTODY_ROLES,
} from './postgres-social-operating-custody.js';
import { validatePostwarSocialEmploymentStateDocument } from '../preparation/postwar-social-employment-state.js';
import type { SqlExecutor } from './sql-database.js';
function invalid(reason: string): never {
  throw Error('BENEFICIAL_CHILD_SOCIAL_PUBLISHER:' + reason);
}
export interface BeneficialChildSocialSourceRegistration {
  readonly classification: 'REGISTERED_CHILD_ORIGINALS_NOT_COMMAND_AUTHORIZATION';
  readonly childFingerprint: string;
  readonly parentFingerprint: string;
  readonly registrations: readonly Readonly<Record<string, unknown>>[];
}
export function createPostwarBeneficialHousingRentSocialSourcePublisher() {
  return Object.freeze({
    async registerWorldFrom(
      tx: SqlExecutor,
      selection: {
        readonly worldId: string;
        readonly seed: Readonly<OpeningSeed>;
        readonly preparation: PreparedBeneficialHousingRentSource;
      },
    ): Promise<Readonly<BeneficialChildSocialSourceRegistration>> {
      const session = await tx.query<Record<string, unknown>>(
          SOCIAL_CUSTODY_SESSION_QUERY,
        ),
        r = session.rows[0];
      if (
        session.rows.length !== 1 ||
        !r ||
        r.role_name !== SOCIAL_OPERATING_CUSTODY_ROLES.publisher ||
        r.rolsuper !== false ||
        r.rolbypassrls !== false ||
        r.rolcreaterole !== false ||
        r.rolcreatedb !== false ||
        r.rolreplication !== false ||
        r.owner_member !== false ||
        r.read_only !== 'off' ||
        !['repeatable read', 'serializable'].includes(String(r.isolation))
      )
        invalid('FIXED_SEPARATED_OFFLINE_PUBLISHER_REQUIRED');
      const proof = consumeBeneficialHousingRentSource(selection.preparation);
      const seed = selection.seed;
      const child = readPostwarBeneficialHousingRentChildOperatingView({
        seed,
        preparation: selection.preparation,
      });
      if (
        child.binding.worldId !== selection.worldId ||
        !child.parentView.socialEmployment
      )
        invalid('EXACT_CHILD_WORLD_AND_FULL_E03_REQUIRED');
      const document = validatePostwarSocialEmploymentStateDocument(
        child.parentView.socialEmployment,
      );
      const countries = new Set(document.countries.map((c) => c.countryId));
      const sources = seed.sources.filter(
        (s) =>
          (JSON.parse(s.canonicalPayload) as { schemaVersion?: unknown })
            .schemaVersion === 'postwar-operating-genesis-seed-source-v1',
      );
      if (sources.length !== 1)
        invalid('EXACT_RETAINED_OPERATING_SOURCE_REQUIRED');
      const source = sources[0]!;
      const registered = await tx.query<Record<string, unknown>>(
        'select world_id,country_id,registration_ref,seed_fingerprint,source_id,source_payload_hash,admission_ref,issuer_role,revision::text from world_v2.register_postwar_beneficial_rent_social_source_world($1,$2,$3)',
        [selection.worldId, proof.seedFingerprint, proof.canonicalSeedSha256],
      );
      if (
        registered.rows.length !== countries.size ||
        new Set(registered.rows.map((v) => v.country_id)).size !==
          countries.size ||
        registered.rows.some(
          (v) =>
            v.world_id !== selection.worldId ||
            !countries.has(String(v.country_id)) ||
            v.seed_fingerprint !== child.binding.childFingerprint ||
            v.source_id !== source.sourceId ||
            v.source_payload_hash !== source.payloadHash ||
            v.issuer_role !== SOCIAL_OPERATING_CUSTODY_ROLES.publisher ||
            v.revision !== '1' ||
            typeof v.admission_ref !== 'string' ||
            !v.admission_ref,
        )
      )
        invalid('ACTUAL_SQL_CHILD_REGISTRATION_DIFFERS');
      return Object.freeze({
        classification: 'REGISTERED_CHILD_ORIGINALS_NOT_COMMAND_AUTHORIZATION',
        childFingerprint: child.binding.childFingerprint,
        parentFingerprint: child.binding.parentFingerprint,
        registrations: Object.freeze(
          registered.rows.map((row) => Object.freeze(row)),
        ),
      });
    },
  });
}
