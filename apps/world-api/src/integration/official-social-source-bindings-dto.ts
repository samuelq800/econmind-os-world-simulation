/** Public selected-source evidence only. No admission or live World authority. */
export const OFFICIAL_SOCIAL_BINDINGS_PATH =
  '/v1/world-data/social-source-bindings';
export const OFFICIAL_SOCIAL_BINDINGS_SCHEMA =
  'official-social-source-bindings-read-v1';
export const OFFICIAL_SOCIAL_BINDINGS_NATURE =
  'SELECTED_SOURCE_DERIVED_NOT_LIVE_WORLD';

export type SocialBindingStatus = 'KNOWN' | 'DERIVED' | 'MISSING' | 'CONFLICT';
export type SocialBindingValue =
  string | null | Readonly<Record<string, string>>;
export interface PublicSocialSourceReference {
  readonly namespace: 'DATASET' | 'ADOPTION' | 'MAPPING' | 'OWNER_RULE';
  /** OWNER_RULE uses a public identifier, never the custody document path. */
  readonly path: string;
  readonly pointer: string | null;
  readonly sha256: string | null;
  readonly relation:
    'EXACT_SOURCE_VALUE' | 'DERIVATION_INPUT' | 'CHECKED_PARENT_RECORD';
}
export interface PublicSocialBindingSubfield {
  readonly field: string;
  readonly status: SocialBindingStatus;
  readonly value: SocialBindingValue;
  readonly mappingOrigin: 'ALREADY_MAPPED' | 'NEWLY_WIRED' | 'UNBOUND';
  readonly sourceReferences: readonly PublicSocialSourceReference[];
  readonly absenceClaimScope:
    'INSPECTED_SOURCE_PARENTS_ONLY_NOT_GLOBAL_ABSENCE' | null;
}
export interface PublicSocialBindingRow {
  readonly gapKey: string;
  readonly countryId: string;
  readonly sourceCountryId: string;
  readonly locationId: string | null;
  readonly sourceRegionId: string | null;
  readonly economicEntityId: string | null;
  readonly sourceEconomicEntityId: string | null;
  readonly sourceObjectId: string;
  readonly field: string;
  readonly fieldFamily: string;
  readonly serviceKind:
    'COUNTRY_AGGREGATE' | 'BASIC_EDUCATION' | 'HOSPITAL' | 'ORDINARY_HOUSING';
  readonly sourceProjectId: string | null;
  readonly serviceGrain:
    | 'COUNTRY_AGGREGATE'
    | 'REGIONAL_EDUCATION_AGGREGATE'
    | 'REGIONAL_HOSPITAL_AGGREGATE'
    | 'REGIONAL_HOUSING_AGGREGATE';
  readonly originalGapCode: string;
  readonly subfields: readonly PublicSocialBindingSubfield[];
  readonly fullyClosed: false;
}
export interface PublicSocialBindingsMetadata {
  readonly schemaVersion: typeof OFFICIAL_SOCIAL_BINDINGS_SCHEMA;
  readonly dataNature: typeof OFFICIAL_SOCIAL_BINDINGS_NATURE;
  /** Hash of the complete generated artifact bytes, independent of raw source version. */
  readonly bindingFingerprint: string;
  readonly packageId: string;
  readonly checksumsSHA256: string;
  readonly mappingSHA256: string;
  readonly ownerRuleSHA256: string;
  readonly ownerReceiptSHA256: string;
  readonly adoptionFingerprint: string;
  readonly derivations: readonly {
    readonly module: string;
    readonly sourceSHA256: string;
    readonly outputSHA256: string;
  }[];
  readonly originalCompositeGaps: 1066;
  readonly fullyClosedCompositeGaps: 0;
  readonly unresolvedCompositeGaps: 1066;
  readonly newRawSourceValuesIntroduced: 0;
  readonly entityReferencesAreExecuted: false;
  readonly sourceAdmitted: false;
  readonly liveWorldState: false;
  readonly operationalService: false;
  readonly deployed: false;
}
export interface PublicSocialBindingsPage extends PublicSocialBindingsMetadata {
  readonly ok: true;
  readonly status: 'AVAILABLE' | 'EMPTY';
  readonly page: {
    readonly offset: number;
    readonly limit: number;
    readonly returned: number;
    readonly total: number;
    readonly nextOffset: number | null;
  };
  readonly rows: readonly PublicSocialBindingRow[];
}
