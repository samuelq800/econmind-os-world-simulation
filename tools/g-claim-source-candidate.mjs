/** Offline source compilation only. No imports from a runtime or settlement port. */
import { createHash } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const SOURCE_PINS = Object.freeze({
  ledger: 'cedd88979d3cd8dd148d151906ebf5ddee76a76c5c706659676796f58b3a9ccb',
  claims: '9c47efb2ccad872bbd9afe99fa6c7883d883ce876dc6ef888bbd848b4f0bec00',
  annual: 'eddfa54bf8b564303bfeaf827f0a9f1302815b9fb5651fa830aa4c3905719636',
  short: '9c09ce97e6afbdd037b83f28db7096375d42b095be5a303db55f173e1d427735',
  history: '89105de8592908f42476e3af00f0b80ba442cd1d229917f1af48af6e9c76167a',
  batches: 'de8d1d9c52400d675b276f2e9df14ba79870647b579da29630a10746a28fa741',
});
const BATCHES = Object.freeze(['B01', 'B05', 'B09', 'B14', 'B15', 'B17']);
const FIELDS = Object.freeze([
  'originalHistoricalNativeCurrency',
  'actualLegalHolderIssuer',
  'actualTerms',
  'actualDue',
  'actualCashAccounts',
  'atomicRoute',
]);
const CLAIMS = Object.freeze(
  [
    ['SCENE_CLEARING_09_24_V2', '499500000', '09', '24'],
    ['SCENE_CLEARING_13_24_V2', '199800000', '13', '24'],
    ['SCENE_CLEARING_20_09_V2', '874125000', '20', '09'],
    ['SCENE_CLEARING_20_24_V2', '149850000', '20', '24'],
  ].map(Object.freeze),
);
const MAX_BYTES = 8 * 1024 * 1024;
function check(ok, reason) {
  if (!ok) throw new Error(reason);
}
function unique(rows, key) {
  check(Array.isArray(rows), `MISSING_ARRAY:${key}`);
  check(
    new Set(rows.map((r) => r[key])).size === rows.length,
    `DUPLICATE:${key}`,
  );
}
function unknown(value) {
  return (
    value?.status === 'UNKNOWN' &&
    value.value === null &&
    value.currency === null
  );
}
function pin(key, pointer) {
  return { source: key, sha256: SOURCE_PINS[key], pointer };
}

/** Relation checker is exported for negative tests; it never emits a candidate. */
export function validateSourceRelations(d) {
  const ledger = d.ledger.records.filter((r) => r.scope === 'CLAIM');
  unique(ledger, 'stableId');
  unique(d.claims.claims, 'canonicalClaimId');
  unique(d.annual.terms, 'canonicalClaimId');
  unique(d.short.terms, 'canonicalClaimId');
  unique(d.history.records, 'stableId');
  unique(d.batches, 'batchId');
  const batches = d.batches.filter((b) => BATCHES.includes(b.batchId));
  const batchIds = batches.flatMap((b) => b.stableIds);
  check(
    batches.length === 6 &&
      batchIds.length === 24 &&
      new Set(batchIds).size === 24 &&
      ledger.every(
        (r) =>
          batchIds.includes(r.stableId) &&
          batches.find((b) => b.stableIds.includes(r.stableId)).rootCause ===
            r.rootCause,
      ),
    'BATCH_COVERAGE_OR_CAUSE_MISMATCH',
  );
  check(
    ledger.length === 24 &&
      d.claims.claims.length === 4 &&
      d.annual.terms.length === 4 &&
      d.short.terms.length === 4 &&
      d.history.records.length === 4 &&
      d.annual.pairedExistingPositions.length === 8,
    'EXACT_COVERAGE_REQUIRED',
  );
  check(
    d.annual.ownerAdoptionRequired === true &&
      d.annual.newEconomicClaimCount === 0 &&
      d.history.actualValueRecovered === 0 &&
      d.history.actualClosed === 0,
    'SOURCE_BOUNDARY_CHANGED',
  );
  for (const [id, amount, issuer, holder] of CLAIMS) {
    const c = d.claims.claims.find((r) => r.canonicalClaimId === id);
    const a = d.annual.terms.find((r) => r.canonicalClaimId === id);
    const s = d.short.terms.find((r) => r.canonicalClaimId === id);
    check(c && a && s, 'FOREIGN_OR_MISSING_CLAIM');
    check(
      c.originalNativePrincipal.value === amount &&
        c.originalNativePrincipal.currency === 'GCU' &&
        c.originalNativePrincipal.evidenceClass === 'CONSTRUCTED' &&
        a.nativePrincipal === amount &&
        a.nativeCurrency === 'GCU' &&
        a.settlementCurrency === 'GCU' &&
        s.amountFact.value === amount &&
        s.amountFact.currency === 'GCU' &&
        s.nativeCurrency.value === 'GCU',
      'PRINCIPAL_OR_CURRENCY_CHANGED',
    );
    check(
      a.issuerCBEntityId === `ENTITY_CENTRAL_BANK_${issuer}` &&
        a.creditorCBEntityId === `ENTITY_CENTRAL_BANK_${holder}` &&
        c.candidateIssuer.value === a.issuerCBEntityId &&
        c.candidateCreditor.value === a.creditorCBEntityId &&
        s.payer.candidateOwnerId === a.issuerCBEntityId &&
        s.payee.candidateOwnerId === a.creditorCBEntityId,
      'PROPOSED_PAIR_CHANGED',
    );
    check(
      a.interestDayCount === 360 &&
        a.firstPrincipalDueSimDay === 360 &&
        s.relativeDueSimDay.value === 140 &&
        a.annualCoupon === '0' &&
        a.newTermsAdopted === false &&
        a.priorTermsAdopted === false &&
        a.actualDisbursement === false &&
        a.actualRepayment === false &&
        a.newClaimMinted === false &&
        a.originalSource.originalNativeCurrency === null &&
        a.originalSource.actualWorldPosting === false,
      'PROPOSAL_PROMOTED_OR_TIME_CHANGED',
    );
    const mirrors = d.annual.pairedExistingPositions.filter(
      (r) => r.canonicalClaimId === id,
    );
    check(
      mirrors.length === 2 &&
        new Set(mirrors.map((r) => r.role)).size === 2 &&
        mirrors.every(
          (r) =>
            r.nativeCurrency === 'GCU' &&
            r.nativeAmount === amount &&
            r.existingPositionOnly === true &&
            r.newCashOrCapital === false &&
            ((r.role === 'LIABILITY' && r.holderId === a.issuerCBEntityId) ||
              (r.role === 'ASSET' && r.holderId === a.creditorCBEntityId)),
        ),
      'MIRROR_MISMATCH',
    );
    for (const field of FIELDS) {
      const idKey = `U2544::CLAIM::${id}::${field}`;
      const r = ledger.find((row) => row.stableId === idKey);
      check(
        r &&
          r.ownerId === id &&
          r.missingField === field &&
          unknown(r.before) &&
          unknown(r.afterActualField) &&
          unknown(c[field]),
        'ORIGINAL_FIELD_NOT_UNKNOWN_OR_ID_MISMATCH',
      );
      check(
        r.originalSource.sha256 === SOURCE_PINS.claims,
        'ORIGINAL_SOURCE_CHANGED',
      );
    }
    const h = d.history.records.find(
      (r) =>
        r.stableId === `U2544::CLAIM::${id}::originalHistoricalNativeCurrency`,
    );
    check(
      h &&
        h.actualValueRecovered === false &&
        h.actualClosed === false &&
        unknown(h.after),
      'HISTORY_PROMOTED',
    );
  }
}

/** Fixed byte pins are always checked before parsing or compiling. */
export function compileClaimCandidate(rawSources) {
  const documents = {};
  check(Object.keys(rawSources).length === 6, 'EXACT_SOURCE_SET_REQUIRED');
  for (const [key, hash] of Object.entries(SOURCE_PINS)) {
    const bytes = rawSources[key];
    check(
      Buffer.isBuffer(bytes) && bytes.length <= MAX_BYTES,
      `SOURCE_SIZE:${key}`,
    );
    check(
      createHash('sha256').update(bytes).digest('hex') === hash,
      `PIN_MISMATCH:${key}`,
    );
    documents[key] = JSON.parse(bytes.toString('utf8'));
  }
  validateSourceRelations(documents);
  const d = documents;
  const scenarios = CLAIMS.map(([id, amount]) => {
    const ai = d.annual.terms.findIndex((r) => r.canonicalClaimId === id);
    const si = d.short.terms.findIndex((r) => r.canonicalClaimId === id);
    const ci = d.claims.claims.findIndex((r) => r.canonicalClaimId === id);
    return {
      scenarioId: `DRAFT_SCENARIO_20261018::${id}`,
      originalClaimSelector: id,
      sourceClass: 'CONSTRUCTED_SCENARIO',
      status: 'DRAFT_REQUIRES_ADOPTION',
      migrationExecuted: false,
      historicalEvidenceRecovered: false,
      proposedInstrument: {
        principal: amount,
        currency: 'GCU',
        issuerId: d.annual.terms[ai].issuerCBEntityId,
        holderId: d.annual.terms[ai].creditorCBEntityId,
        legalTitleVerified: false,
        source: pin('annual', `/terms/${ai}`),
      },
      pairedRegistrations: d.annual.pairedExistingPositions.flatMap((row, i) =>
        row.canonicalClaimId === id
          ? [
              {
                proposedRegistration: structuredClone(row),
                source: pin('annual', `/pairedExistingPositions/${i}`),
              },
            ]
          : [],
      ),
      principalCount: 1,
      mirrorsAreNotSeparateClaims: true,
      alternatives: [
        {
          label: 'EXISTING_140_DAY_PROPOSAL',
          selected: false,
          adopted: false,
          relativePrincipalDueSimDay: 140,
          source: pin('short', `/terms/${si}`),
          completeOriginalProposal: structuredClone(d.short.terms[si]),
        },
        {
          label: 'EXISTING_360_DAY_PROPOSAL',
          selected: false,
          adopted: false,
          relativePrincipalDueSimDay: 360,
          source: pin('annual', `/terms/${ai}`),
          completeOriginalProposal: structuredClone(d.annual.terms[ai]),
        },
      ],
      temporalBinding: {
        openingEpoch: null,
        clockBinding: null,
        actualDue: null,
        interestDayCountReferenceOnly: 360,
        accrualComputed: false,
        day0PaymentComputed: false,
      },
      accountBinding: {
        owner: 'F',
        issuerCash: null,
        holderCash: null,
        availableNativeCash: null,
        restrictions: null,
        currencyRequirement: 'GCU',
        sourceRequirement:
          'Source-owned current cash; receivables and TGA/reserve mirrors are not new backing',
      },
      atomicRoute: {
        status: 'PORT_NOT_INSTALLED',
        formalPaymentAllowed: false,
        settlementExecuted: false,
        calculationDtoEmitted: false,
        missingPrerequisites: [
          'adopted version and legal title',
          'actual accounts and available cash',
          'complete fee/FX/partial/refund/default applicability',
          'current head/fence/permission/idempotency',
          'supported authoritative operation and COMMITTED receipt',
        ],
      },
      sourceMapping: pin('claims', `/claims/${ci}`),
    };
  });
  const fieldMappings = d.ledger.records
    .filter((r) => r.scope === 'CLAIM')
    .map((r) => {
      const originalIndex = d.ledger.records.indexOf(r);
      const scenarioIndex = scenarios.findIndex(
        (s) => s.originalClaimSelector === r.ownerId,
      );
      const ci = d.claims.claims.findIndex(
        (c) => c.canonicalClaimId === r.ownerId,
      );
      const hi = d.history.records.findIndex((h) => h.ownerId === r.ownerId);
      return {
        stableId: r.stableId,
        ownerId: r.ownerId,
        field: r.missingField,
        before: structuredClone(r.before),
        candidateActualValue: structuredClone(r.afterActualField),
        historicalStatus: 'UNPROVEN',
        sourceComplete: false,
        engineeringWired: false,
        validationPassed: false,
        formallyAdopted: false,
        closureProposed: false,
        originalAcceptanceRule: r.acceptanceRule,
        adoptedPlanBatch: d.batches.find((b) =>
          b.stableIds.includes(r.stableId),
        ).batchId,
        planAcceptanceRule: d.batches.find((b) =>
          b.stableIds.includes(r.stableId),
        ).executionAndAcceptance,
        originalRecord: pin('ledger', `/records/${originalIndex}`),
        sourceField: pin('claims', `/claims/${ci}/${r.missingField}`),
        scenarioTemplatePointer: `/scenarios/${scenarioIndex}`,
        scenarioTemplateIsActualFieldCompletion: false,
        historicalInvestigation: pin('history', `/records/${hi}`),
        missingEvidence: structuredClone(r.dependencies),
      };
    });
  return {
    schema: 'G_CLAIM_SOURCE_CANDIDATE_V1',
    status: 'IMPLEMENTED_UNVERIFIED_OFFLINE_REVIEW_CANDIDATE',
    sources: SOURCE_PINS,
    authority: {
      sourceAdopted: false,
      runtimeConnected: false,
      productionSeed: false,
      clockStarted: false,
      settlementAllowed: false,
      rootRegisterWritten: false,
    },
    fieldMappings,
    scenarios,
    statistics: {
      originalIds: 24,
      originalValuesModified: 0,
      actualFieldsRecovered: 0,
      originalClosuresProposed: 0,
      scenarioTemplates: 4,
      termAlternatives: 8,
      proposedMirrorRegistrations: 8,
      distinctProposedPrincipals: 4,
    },
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [, , configPath, outputPath] = process.argv;
  check(
    configPath && outputPath && process.argv.length === 4,
    'Usage: node tools/g-claim-source-candidate.mjs SOURCES.json NEW_OUTPUT.json',
  );
  check(statSync(configPath).size < 16384, 'CONFIG_TOO_LARGE');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  check(Object.keys(config).length === 6, 'EXACT_SOURCE_SET_REQUIRED');
  const raw = {};
  for (const key of Object.keys(SOURCE_PINS)) {
    check(
      typeof config[key] === 'string' &&
        statSync(config[key]).size <= MAX_BYTES,
      `SOURCE_SIZE:${key}`,
    );
    raw[key] = readFileSync(config[key]);
  }
  const result = compileClaimCandidate(raw);
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, {
    flag: 'wx',
  });
  process.stdout.write(`${JSON.stringify(result.statistics)}\n`);
}
