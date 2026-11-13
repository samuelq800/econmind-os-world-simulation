import type { PostwarPhysicalSourceContext } from '../../apps/world-worker/src/preparation/postwar-physical-service-receipt.js';
import type {
  PostwarSocialRuntimeConnection,
  PostwarSocialSourcePreparationInput,
} from '../../apps/world-worker/src/runtime-preparation/social-runtime-connection.js';
import type { SqlDatabase } from '../../apps/world-worker/src/persistence/sql-database.js';
interface OptIn {
  readonly enabled: true;
  readonly repositoryRoot: string;
  readonly industryInstalled: true;
  readonly utilitiesInstalled: true;
  readonly countries: readonly { readonly countryId: string }[];
  readonly countrySubset?: readonly ['COUNTRY_10'];
}
export function requireRefinery21PreparationOptIn(input: OptIn): void;
export function prepareRegisteredRefinery21Sources(
  input: OptIn &
    Readonly<{
      sourceContext: PostwarPhysicalSourceContext;
      socialConnection: Readonly<PostwarSocialRuntimeConnection>;
      configuration: PostwarSocialSourcePreparationInput;
      publicationDatabase: SqlDatabase;
    }>,
): Promise<
  Readonly<{
    classification:
      | 'ACTUAL_ISOLATED_21_SOURCE_PUBLICATION_NOT_WORK_PAYMENT_DELIVERY_PRODUCTION'
      | 'ACTUAL_ISOLATED_C10_SOURCE_PUBLICATION_NOT_WORK_PAYMENT_DELIVERY_PRODUCTION';
    proofReuse: 'SAME_COLD_HOST_LIVE_CHILD_SEED_RENT_AND_SOCIAL_SOURCE_SLOT';
    worldId: string;
    seedFingerprint: string;
    admissionRef: string;
    preparationActions: readonly Readonly<{
      type: 'FIRST_DAY' | 'UTILITY' | 'POWER' | 'WATER_STAFF';
      countryId: string;
      status: 'COMMITTED' | 'REUSED_VERIFIED';
    }>[];
    originals: readonly Readonly<{
      countryId: string;
      facilityId: string;
      sourceRef: string;
      sourceSha256: string;
    }>[];
    utilitySources: readonly unknown[];
    powerSources: readonly Readonly<{
      sourceRef: string;
      sourceSha256: string;
    }>[];
    waterSources: readonly Readonly<{
      sourceRef: string;
      sourceSha256: string;
    }>[];
    waterStaffPreparation:
      'EXPLICIT_EXISTING_STAFF_SOURCE_ONLY' | 'NOT_REQUESTED';
    notApplicableCountries: readonly string[];
    economicBefore: Readonly<Record<string, unknown>>;
    economicAfter: Readonly<Record<string, unknown>>;
    serviceLabourCreated: false;
    commandsSubmitted: 0;
    reportSha256: string;
  }>
>;
