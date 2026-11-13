export interface FreshRehearsalFileEvidence {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
}
export interface FreshRehearsalStartupPreflight {
  readonly schemaVersion: 'fresh-rehearsal-startup-preflight-v1';
  readonly classification: 'READ_ONLY_FILE_AND_BINDING_COMPARISON_NOT_AUTHORITY';
  readonly status:
    'PRECHECK_ONLY_FULL_VALIDATION_NOT_RUN' | 'BLOCKED_SOURCE_BINDING';
  readonly manifest: FreshRehearsalFileEvidence;
  readonly artifacts: readonly FreshRehearsalFileEvidence[];
  readonly suppliedIdentity: Readonly<Record<string, string>>;
  readonly expectedCurrentIdentity: Readonly<Record<string, string>>;
  readonly dependencies: readonly Readonly<{
    dependency: string;
    status:
      | 'PIN_MATCH_ONLY_CORE_PROOF_STILL_REQUIRED'
      | 'BLOCKED_NEW_SOURCE_NOT_BOUND_BY_CURRENT_PRODUCT';
    files: readonly FreshRehearsalFileEvidence[];
  }>[];
  readonly socialCreationSql: Readonly<{
    inExistingFullPlan: boolean;
    requiredBeforeCreate: string;
  }>;
  readonly requiredBeforeNode: readonly string[];
  readonly omittedOptionalPlugin: Readonly<{
    name: string;
    status: 'NOT_CONFIGURED';
    reason: string;
  }>;
  readonly fullCoreProof: 'NOT_ISSUED';
  readonly database: 'NOT_STARTED';
  readonly node: 'NOT_STARTED';
  readonly consumer: 'NOT_STARTED';
  readonly clock: 'NOT_STARTED';
}
export function inspectFreshRehearsalStartup(input: {
  repositoryRoot: string;
  manifestFile: string;
}): Promise<FreshRehearsalStartupPreflight>;
