// Non-authoritative scenario declarations only. No account/source/permission issuance.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const root = new URL('../../', import.meta.url);
const pins = JSON.parse(
  fs.readFileSync(new URL('source-pins.json', import.meta.url), 'utf8'),
);
const digest = (/** @type {Buffer|string} */ b) =>
  createHash('sha256').update(b).digest('hex');

/** Exact closed-source integrity check, not source admission.
 * @param {string} id @param {Buffer} bytes
 */
export function verifyAccountConstructionSource(id, bytes) {
  const pin = pins.sources.find((/** @type {{id:string}} */ p) => p.id === id);
  if (
    !pin ||
    !Buffer.isBuffer(bytes) ||
    bytes.length !== pin.bytes ||
    digest(bytes) !== pin.sha256
  )
    throw new Error('ACCOUNT_CONSTRUCTION_SOURCE_PIN_MISMATCH:' + id);
  return JSON.parse(bytes.toString('utf8'));
}
function readSources() {
  return Object.fromEntries(
    pins.sources.map((/** @type {{id:string,path:string}} */ p) => [
      p.id,
      verifyAccountConstructionSource(
        p.id,
        fs.readFileSync(new URL(p.path, root)),
      ),
    ]),
  );
}

/** Reproduce the three immutable AW V2 UTF-8 documents, without filesystem writes.
 * Returned strings are declaration/requirement data, never accepted authority.
 */
export function buildAccountOwnershipCandidateV2() {
  const sources = readSources(),
    plan = sources['17_batches'],
    entities = sources.economic_entities,
    dict = sources.nominal_dictionary,
    def = sources.C01_definition,
    version = pins.constructionVersion;
  /** @type {Record<string,string>} */
  const outputs = {};
  const write = (/** @type {string} */ name, /** @type {unknown} */ value) => {
    outputs[name] = JSON.stringify(value, null, 2) + '\n';
  };
  const accounts = [],
    registers = [],
    coverage = [],
    permissions = [];
  const roles = [
      'GOVERNMENT',
      'OPERATOR',
      'HOUSEHOLDS',
      'BANK',
      'CENTRAL_BANK',
    ],
    legacy = ['GOV', 'OP', 'HOUSEHOLDS', 'BANK', 'CENTRAL-BANK'];
  const rels = [
    [
      'TGA',
      'TGA_ASSET',
      'TGA_ISSUANCE_LIABILITY',
      'GOVERNMENT',
      'CENTRAL_BANK',
      'TREASURY_DEPOSIT_AT_CB',
    ],
    [
      'RESERVE',
      'RESERVE_ASSET',
      'RESERVE_ISSUANCE_LIABILITY',
      'BANK',
      'CENTRAL_BANK',
      'BANK_RESERVE_DEPOSIT_AT_CB',
    ],
    [
      'HOUSEHOLD_DEPOSIT',
      'HOUSEHOLD_DEPOSIT_ASSET',
      'HOUSEHOLD_DEPOSIT_ISSUANCE_LIABILITY',
      'HOUSEHOLDS',
      'BANK',
      'HOUSEHOLD_DEPOSIT_AT_BANK',
    ],
    [
      'BUSINESS_DEPOSIT',
      'BUSINESS_DEPOSIT_ASSET',
      'BUSINESS_DEPOSIT_ISSUANCE_LIABILITY',
      'OPERATOR',
      'BANK',
      'BUSINESS_DEPOSIT_AT_BANK',
    ],
  ];
  /** @param {string} role @param {string} n */
  const eid = (role, n) => 'ENTITY_' + role + '_' + n,
    aid = (/** @type {string} */ role, /** @type {string} */ n) =>
      'SCENARIO_DECL_AW_V2_' + n + '_' + role;
  for (let c = 1; c <= 70; c++) {
    const n = String(c).padStart(2, '0'),
      countryId = 'COUNTRY_' + n,
      currency = dict.countries[c - 1];
    assert.equal(currency.countryId, countryId);
    const countriesOwn = [];
    if (c === 1)
      for (const [
        relation,
        asset,
        liability,
        holder,
        issuer,
        purpose,
      ] of rels) {
        for (const [role, other, cls, owner, counterparty] of [
          [asset, liability, 'ASSET', holder, issuer],
          [liability, asset, 'LIABILITY', issuer, holder],
        ])
          accounts.push({
            sourceRecordId: 'DOC_LOCAL_AW_V2_01_' + role,
            accountId: aid(role, n),
            claimId: 'SCENARIO_DECL_AW_V2_01_' + relation + '_CLAIM',
            ownerId: eid(owner, n),
            holderId: eid(holder, n),
            issuerId: eid(issuer, n),
            counterpartyEntityId: eid(counterparty, n),
            accountClass: cls,
            countryId,
            currency: currency.currencyCode,
            sourceVersion: version,
            valueDate: currency.valueDate,
            purpose,
            sourceHoldingKind: 'CLAIM',
            sourceCapabilityLocator: null,
            role,
            mirrorDeclarationKey: aid(other, n),
            classification: 'CONSTRUCTED_CANDIDATE',
            recordNature: 'CONSTRUCTED_NOT_ADOPTED',
            actualAccountId: null,
            actualCurrency: null,
            actualOpening: null,
            actualAdmission: null,
            actualBalance: null,
            accountIssued: false,
            sourceAdopted: false,
          });
      }
    for (let ri = 0; ri < roles.length; ri++) {
      const role = roles[ri],
        ownerId = eid(role, n),
        originalId = 'U2544::ENTITY::' + ownerId + '::account',
        sourceIndex = (c - 1) * 5 + ri,
        entity = entities[sourceIndex];
      assert.equal(entity.id, legacy[ri] + '-' + n);
      assert.equal(entity.countryId, 'visual-territory-' + n);
      if (c !== 1)
        accounts.push({
          sourceRecordId: 'DOC_LOCAL_AW_V2_' + n + '_' + role + '_PRIMARY_CASH',
          accountId: aid(role + '_PRIMARY_CASH', n),
          ownerId,
          holderId: ownerId,
          issuerId: null,
          counterpartyEntityId: null,
          accountClass: 'CASH',
          claimId: null,
          countryId,
          currency: currency.currencyCode,
          sourceVersion: version,
          valueDate: null,
          worldId: null,
          purpose: 'NATIVE_CASH_SETTLEMENT',
          sourceHoldingKind: 'CASH',
          sourceCapabilityLocator: null,
          role: 'PRIMARY_CASH',
          mirrorDeclarationKey: null,
          classification: 'CONSTRUCTED_CANDIDATE',
          recordNature: 'CONSTRUCTED_NOT_ADOPTED',
          actualAccountId: null,
          actualCurrency: null,
          actualOpening: null,
          actualAdmission: null,
          actualBalance: null,
          accountIssued: false,
          sourceAdopted: false,
        });
      const own = accounts.filter(
          (x) => x.countryId === countryId && x.ownerId === ownerId,
        ),
        ownKeys = own.map((x) => x.accountId),
        mirrorKeys = c === 1 ? own.map((x) => x.mirrorDeclarationKey) : [];
      const register = {
        registerKey: 'DOC_LOCAL_AW_V2_' + ownerId + '_OWN',
        stableId: originalId,
        ownerId,
        countryId,
        sourceVersion: version,
        adoptedDefinitionVersion: c === 1 ? def.adoptedDefinitionVersion : null,
        memberRoles: c === 1 ? def.roles[ownerId] : ['PRIMARY_CASH'],
        ownDeclarationKeys: ownKeys,
        necessaryMirrorDeclarationKeys: [...new Set(mirrorKeys)],
        classification: 'CONSTRUCTED_CANDIDATE',
        recordNature: 'CONSTRUCTED_NOT_ADOPTED',
        meaning:
          c === 1
            ? 'C01 existing typed-register declaration'
            : 'Document-local source inventory, NOT typed-register product acceptance or expansion of C01 exception',
        actualTypedRegisterBinding: null,
        sourceAdopted: false,
      };
      registers.push(register);
      const mapping = {
        originalId,
        unit: 'ACCOUNT',
        countryId,
        ownerId,
        known: {
          originalId,
          legacyEntityId: entity.id,
          sourcePointer: 'economic_entities#/' + sourceIndex,
          entityBindingModeInSource: entity.bindingMode,
          acceptanceContract:
            c === 1
              ? 'C01_TYPED_REGISTER_STRUCTURE_ONLY'
              : 'LEGACY_CLAIM_FREE_NATIVE_CASH_ACCOUNT',
        },
        derived: {
          canonicalEntityId: ownerId,
          countryId,
          joinRule:
            '17-batch exact original ID + ordered legacy role/country validation',
          referenceCurrency: currency.currencyCode,
          currencyPointer: 'nominal_currency_dictionary#/countries/' + (c - 1),
        },
        constructed: {
          sourceVersion: version,
          ownDeclarationKeys: ownKeys,
          mirrorDeclarationKeys: mirrorKeys,
          registerKey: register.registerKey,
          purposeCandidate:
            c === 1
              ? 'EXISTING_APPROVED_ROLE_PURPOSE'
              : 'NATIVE_CASH_SETTLEMENT',
        },
        missing: [
          'genuine source issuance/custody record capability',
          'admitted currency',
          'existing lawful inactive-opening World/genesis/head/asOf/valueDate',
          'exact record-set adoption',
          ...(c === 1 ? [] : ['record-specific legal issuer']),
        ],
        stage: 'CONSTRUCTED_NOT_ADOPTED',
        consumerDisposition:
          c === 1
            ? 'Existing C01 typed reader may inspect declared shape'
            : 'NOT_SUBMITTED_TO_CORE_NULL_WORLD_OR_ISSUER_NOT_VALID_ACCOUNT',
        originalFieldStages: {
          sourceComplete: false,
          engineeringWired: false,
          validationPassed: false,
          formallyAdopted: false,
        },
        actualValue: null,
      };
      coverage.push(mapping);
      countriesOwn.push(originalId);
    }
    for (const id of plan
      .find((/** @type {{batchId:string}} */ x) => x.batchId === 'B16')
      .stableIds.filter((/** @type {string} */ x) =>
        x.includes('_' + n + '::'),
      )) {
      const target = id.split('::')[2],
        isCountry = id.includes('::COUNTRY::');
      permissions.push({
        originalId: id,
        field: isCountry ? 'discretionaryAuthorization' : 'currentPermission',
        countryId,
        resourceTarget: target,
        constructedInputRequirementKey:
          'AW_V2_REQUIREMENT_' +
          target +
          '_' +
          (isCountry ? 'COUNTRY_DISCRETIONARY' : 'ENTITY_CURRENT'),
        classification:
          'CONSTRUCTED_REQUIREMENT_DATA_NOT_AUTHORIZATION_SOURCE_RECORD',
        known: {
          countryId,
          resourceTarget: target,
          notEconomicEntityEqualsUser: true,
        },
        derived: {
          relatedAccountOriginalIds: isCountry
            ? countriesOwn
            : ['U2544::ENTITY::' + target + '::account'],
        },
        constructed: {
          requestedEvidencePurpose:
            'Bind actual current authenticated identity/revision/seat/capability to resource target through existing server authorization chain',
        },
        missing: [
          'AuthSubject and verified actor identity',
          'current team/seat/membership and revocation revisions',
          'registered sourceOwner/sourceRecord/sourceRevision',
          'World/head and SAME_TRANSACTION_H cutoff',
          'actual approved office/capability grants and actor/admin approval scope',
          'effective/expires timestamps',
        ],
        parser:
          'parseAuthorizationSourceBytes only after complete genuine source data; current requirement manifest is NOT its input schema',
        actualAuthSubject: null,
        actualTeamId: null,
        actualGrants: null,
        actualDecision: null,
        currentPermission: 'UNKNOWN',
        authorizationIssued: false,
        currentPermissionIssued: false,
        originalFieldStages: {
          sourceComplete: false,
          engineeringWired: false,
          validationPassed: false,
          formallyAdopted: false,
        },
      });
    }
  }
  assert.equal(accounts.length, 353);
  assert.equal(registers.length, 350);
  assert.equal(coverage.length, 350);
  assert.equal(permissions.length, 420);
  assert.equal(new Set(accounts.map((x) => x.accountId)).size, 353);
  assert.deepEqual(
    coverage.map((x) => x.originalId).sort(),
    [
      ...plan.find((/** @type {{batchId:string}} */ x) => x.batchId === 'B06')
        .stableIds,
    ].sort(),
  );
  assert.deepEqual(
    permissions.map((x) => x.originalId).sort(),
    [
      ...plan.find((/** @type {{batchId:string}} */ x) => x.batchId === 'B16')
        .stableIds,
    ].sort(),
  );
  write('SCENARIO_ACCOUNT_RECORDS.json', {
    schemaVersion: 'A_ACCOUNT_OWNERSHIP_CONSTRUCTION_V2',
    sourceVersion: version,
    classification: 'CONSTRUCTED_CANDIDATE',
    recordNature: 'CONSTRUCTED_NOT_ADOPTED',
    identitySemantics:
      'All accountId/claimId/sourceRecordId/register keys newly authored scenario declarations, not historical/source-admitted/Core issuance. CASH issuer missing is intentional; no invented bank authority.',
    currencySemantics:
      'Unadopted nominal dictionary candidates only, not LC=GCU or actual account currency',
    accounts,
    registers,
    accountIdsIssued: 0,
    claimIdsIssued: 0,
    sourceAdopted: false,
    originalClosures: 0,
  });
  write('B06_COVERAGE_BY_ORIGINAL_ID.json', {
    originalCount: 350,
    countries: 70,
    typedExceptionOriginalCount: 5,
    unchangedLegacyOriginalCount: 345,
    constructionCoverage: 350,
    actualAcceptedCoverage: 0,
    rows: coverage,
  });
  write('B16_ADMISSION_INPUT_REQUIREMENTS.json', {
    originalCount: 420,
    entityCurrentPermission: 350,
    countryDiscretionaryAuthorization: 70,
    countries: 70,
    resourceTargetCoverage: 420,
    actualAuthorizationCoverage: 0,
    sourceContract:
      'apps/world-worker/src/preparation/current-authorization-source-contract.ts',
    requirementManifestNotCallableAuthorizationPayload: true,
    rows: permissions,
  });

  for (const pin of pins.expectedOutputs) {
    const bytes = outputs[pin.name];
    if (
      typeof bytes !== 'string' ||
      Buffer.byteLength(bytes) !== pin.bytes ||
      digest(bytes) !== pin.sha256
    )
      throw new Error('ACCOUNT_CONSTRUCTION_OUTPUT_DRIFT:' + pin.name);
  }
  if (Object.keys(outputs).length !== 3)
    throw new Error('ACCOUNT_CONSTRUCTION_OUTPUT_SET');
  return Object.freeze(outputs);
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv.length !== 3 || process.argv[2] !== '--check')
    throw new Error('USAGE: construct.mjs --check');
  const outputs = buildAccountOwnershipCandidateV2();
  console.log(
    JSON.stringify({
      classification: 'CONSTRUCTED_CANDIDATE',
      outputs: Object.entries(outputs).map(([name, bytes]) => ({
        name,
        bytes: Buffer.byteLength(bytes),
        sha256: digest(bytes),
      })),
      sourceAdopted: false,
      accountIdsIssued: 0,
      currentPermissionIssued: false,
      originalClosures: 0,
    }),
  );
}
