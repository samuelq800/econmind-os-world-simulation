/** Read-only source inventory. Existence, lexical matches and test reports never
 * confer economic authority or prove an individual UI item works. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { loadInventory, repositoryRoot } from './catalog.mjs';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const roots = [
  'apps/world-web/src',
  'apps/world-web/public/season1-immersive',
  'apps/world-api/src',
  'apps/world-worker/src',
  'packages/core/src',
  'database/proposals',
  'tests',
];
const exclusions =
  /(?:^|\/)(?:node_modules|dist|assets|countries|prototype)(?:\/|$)/u;
const sourceType = /\.(?:ts|tsx|js|mjs|sql)$/u;
function walk(path, select) {
  const files = [];
  if (!statSafe(path)) return files;
  for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name, 'en'),
  )) {
    const child = resolve(path, entry.name);
    if (entry.isDirectory() && !exclusions.test(child))
      files.push(...walk(child, select));
    else if (entry.isFile() && select(child)) files.push(child);
  }
  return files;
}
function statSafe(path) {
  try {
    return statSync(path);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}
function reference(root, path, line = 1) {
  const bytes = readFileSync(resolve(root, path));
  return { path, line, sha256: sha(bytes) };
}
export function classifySourceHit(path, line) {
  if (/^tests\//u.test(path)) return 'TEST_FIXTURE_OR_ASSERTION';
  if (
    /public\/season1-immersive\/(?:game|living-world|journey)\.js$/u.test(path)
  )
    return 'LOCAL_REHEARSAL_PRODUCT_SURFACE_NOT_WORLD_SETTLEMENT';
  if (/simulated|demo/iu.test(path)) return 'EXPLICIT_SIMULATION_SOURCE';
  if (
    /sourceAdmitted\s*:\s*false|MISSING|UNAVAILABLE|NOT_RUN|fail\(|throw /u.test(
      line,
    )
  )
    return 'EXPLICIT_UNAVAILABLE_OR_REFUSAL_REQUIRES_CONTEXT';
  return 'PRODUCT_SOURCE_REQUIRES_CONTEXT_NOT_CONFIRMED_DEFECT';
}

/** Whole tree is finite and hashed. Exact token hits are only navigation links;
 * a source ID or contextModuleIds entry is not a DTO/field translation. */
export function indexSources(root, tokens) {
  const hits = new Map(tokens.map((token) => [token, []]));
  const files = roots.flatMap((path) =>
    walk(resolve(root, path), (p) => sourceType.test(p)),
  );
  const tokenPattern = new RegExp(
    `(?<![A-Za-z0-9_-])(?:${[...tokens]
      .sort()
      .map((s) => s.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'))
      .join('|')})(?![A-Za-z0-9_-])`,
    'gu',
  );
  const sourceFiles = [];
  const classifiedHits = [];
  const sqlFunctions = [];
  for (const file of files) {
    const path = relative(root, file);
    const bytes = readFileSync(file);
    const text = bytes.toString('utf8');
    const binding = { path, sha256: sha(bytes) };
    sourceFiles.push(binding);
    for (const [offset, line] of text.split('\n').entries()) {
      for (const token of new Set(line.match(tokenPattern) ?? []))
        hits.get(token).push({
          ...binding,
          line: offset + 1,
          meaning: 'LEXICAL_REFERENCE_ONLY',
        });
      if (
        /\b(?:mock|fake|fixture|hardcoded|placeholder|SIMULATED|TEST_ONLY)\b|sourceAdmitted\s*:\s*false|Math\.random\s*\(/iu.test(
          line,
        )
      )
        classifiedHits.push({
          ...binding,
          line: offset + 1,
          classification: classifySourceHit(path, line),
          // Navigation only. Never copy arbitrary source values/credentials.
          matchedMarkers: [
            ...new Set(
              line.match(
                /\b(?:mock|fake|fixture|hardcoded|placeholder|SIMULATED|TEST_ONLY)\b|sourceAdmitted|Math\.random/giu,
              ) ?? [],
            ),
          ],
        });
    }
    if (path.endsWith('.sql')) {
      for (const match of text.matchAll(
        /create\s+(?:or\s+replace\s+)?function\s+([\w.]+)\s*\(/giu,
      ))
        sqlFunctions.push({
          ...binding,
          function: match[1],
          line: text.slice(0, match.index).split('\n').length,
          meaning: 'DECLARATION_NOT_INSTALLATION_OR_EXECUTION',
        });
    }
  }
  return { hits, sourceFiles, classifiedHits, sqlFunctions };
}

/** Reports are external assertions, never self-authenticating execution proof.
 * Match full test suffixes, not office names; do not inherit pass across commits. */
export function collectRecordedTests(evidenceRoots, testPaths) {
  const recorded = new Map(testPaths.map((p) => [p, []]));
  const inspectedReports = [];
  const excludedReports = [];
  for (const root of evidenceRoots) {
    for (const path of walk(root, (p) => /\.json$/u.test(p))) {
      const size = statSync(path).size;
      if (size > 4 * 1024 * 1024) {
        excludedReports.push({
          path,
          bytes: size,
          reason: 'BOUNDED_REPORT_READER_LIMIT',
        });
        continue;
      }
      const bytes = readFileSync(path);
      // Avoid parsing non-test documents, in particular genesis artifacts.
      if (!bytes.includes(Buffer.from('testResults'))) continue;
      let report;
      try {
        report = JSON.parse(bytes.toString('utf8'));
      } catch {
        excludedReports.push({ path, reason: 'NOT_SINGLE_JSON_TEST_REPORT' });
        continue;
      }
      if (!Array.isArray(report.testResults)) continue;
      const ref = { path, sha256: sha(bytes) };
      inspectedReports.push(ref);
      for (const result of report.testResults) {
        if (typeof result.name !== 'string') continue;
        for (const test of testPaths) {
          if (result.name !== test && !result.name.endsWith(`/${test}`))
            continue;
          const counts = {};
          for (const assertion of result.assertionResults ?? [])
            counts[assertion.status] = (counts[assertion.status] ?? 0) + 1;
          recorded.get(test).push({
            ...ref,
            recordedName: result.name,
            recordedSuiteStatus: result.status ?? 'UNKNOWN',
            assertionStatusCounts: counts,
            sourceCommitBinding:
              'UNKNOWN_EXTERNAL_REPORT_REQUIRES_ITS_SOURCE_MANIFEST',
            significance: 'RECORDED_ASSERTIONS_NOT_ITEM_ACCEPTANCE',
          });
        }
      }
    }
  }
  return { recorded, inspectedReports, excludedReports };
}

function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
  }).trim();
}
const runtimeNames = {
  CAPTAIN: /captain/u,
  FINANCE: /financ|treasury|budget/u,
  CENTRAL_BANK: /central-bank|central_bank|day-one-fx/u,
  INDUSTRY: /industry/u,
  TRADE: /trade/u,
  SOCIAL: /social|housing-rent/u,
};

function readStaticMapping(root, path, variable) {
  const source = ts.createSourceFile(
    path,
    readFileSync(resolve(root, path), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const literal = (node) => {
    if (ts.isAsExpression(node) || ts.isParenthesizedExpression(node))
      return literal(node.expression);
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(source) === 'Object.freeze' &&
      node.arguments.length === 1
    )
      return literal(node.arguments[0]);
    if (ts.isStringLiteral(node)) return node.text;
    if (ts.isNumericLiteral(node)) return Number(node.text);
    if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
    if (ts.isObjectLiteralExpression(node))
      return Object.fromEntries(
        node.properties.map((p) => {
          if (
            !ts.isPropertyAssignment(p) ||
            !p.name ||
            ts.isComputedPropertyName(p.name)
          )
            throw Error('MAIN_FIELD_MAPPING_MUST_BE_STATIC');
          return [p.name.text, literal(p.initializer)];
        }),
      );
    throw Error('MAIN_FIELD_MAPPING_MUST_BE_STATIC');
  };
  let mapping;
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(source) === variable
    )
      mapping = literal(node.initializer);
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (!mapping) throw Error('STATIC_FIELD_MAPPING_MISSING:' + variable);
  return mapping;
}
function readMainMapping(root) {
  const mapping = readStaticMapping(
    root,
    'apps/world-web/src/main-office-fields/mapping.ts',
    'MAIN_OFFICE_FIELD_MAPPING',
  );
  if (mapping.fields.length !== mapping.coverage.newReadonlySlots)
    throw Error('MAIN_FIELD_MAPPING_SLOT_COUNT_DRIFT');
  return mapping;
}

/** Explicitly reviewed partial DTO translations. This is not inferred from
 * lexical references, and cannot claim installation or runtime acceptance. */
export function reviewedFieldConnections(root = repositoryRoot) {
  const anchor = (path, needle) => {
    const line = readFileSync(resolve(root, path), 'utf8')
      .split('\n')
      .findIndex((s) => s.includes(needle));
    if (line < 0)
      throw Error('REVIEWED_FIELD_CONNECTION_DRIFT:' + path + ':' + needle);
    return reference(root, path, line + 1);
  };
  const groups = [
    {
      path: 'apps/world-web/src/office-command/view.ts',
      variable: 'SOCIAL_PROGRAMME_TERMS_CATALOG_BINDING',
      fieldsProperty: 'fields',
      expected: {
        'social-u0933-0': 'RELOCATION_SUPPORT.locationId',
        'social-u0933-1': 'RELOCATION_SUPPORT.participants',
        'social-u0933-2': 'RELOCATION_SUPPORT.benefit',
        'social-u0934-0': 'RETURN_TO_WORK.eligible',
        'social-u0934-1': 'RETURN_TO_WORK.capacity',
        'social-u0934-2': 'RETURN_TO_WORK.duration',
      },
      scope:
        'PENDING_REVIEW_TERMS_ONLY_NOT_APPROVAL_FUNDING_OR_POPULATION_CHANGE',
      commandType: 'CORE_SOCIAL_LABOUR_PROGRAMME_CREATE_V1',
      dataset: 'social-labour-programmes',
      refs: {
        dto: [
          'apps/world-web/src/social-employment/programme-form.ts',
          'export function buildSocialProgrammeRequest',
        ],
        source: [
          'apps/world-web/src/social-employment/programme-form.ts',
          'currentSocialProgrammeContext',
        ],
        command: [
          'packages/core/src/commands/social-employment-service.ts',
          'SOCIAL_LABOUR_PROGRAMME_CREATE_COMMAND',
        ],
        api: [
          'apps/world-api/src/runtime/postwar-social-connection.ts',
          'manualFamilies.has(selector.commandType)',
        ],
        executor: [
          'apps/world-worker/src/persistence/postwar-social-employment-service-creation-runtime.ts',
          'SOCIAL_PROGRAMME_CREATION_SOURCE_PURPOSE',
        ],
        sql: [
          'database/proposals/postwar-pending-programme-target-prefix.sql',
          'create function world_v2.postwar_social_programme_effect_scoped',
        ],
        readback: [
          'apps/world-api/src/integration/postwar-office-runtime-read-service.ts',
          'fixed-social-programme-runtime',
        ],
      },
    },
    {
      path: 'apps/world-web/src/industry-run/form.ts',
      variable: 'INDUSTRY_RUN_CATALOG_BINDING',
      fieldsProperty: 'targetFields',
      expected: {
        'industry-u0283-0': 'facilityId',
        'industry-u0283-1': 'targetPercent',
      },
      scope: 'ADMITTED_FACILITY_FIRST_DAY_WINDOW_INTENT_NOT_RUN_OR_OUTPUT',
      commandType: 'CORE_INDUSTRY_UTILISATION_TARGET_SET_V1',
      dataset: 'industry-utilisation-targets',
      refs: {
        dto: [
          'apps/world-web/src/industry-run/form.ts',
          'export function buildIndustryUtilisationTargetRequest',
        ],
        source: [
          'apps/world-worker/src/persistence/postwar-industry-run-parameters-read.ts',
          'read_postwar_industry_run_parameters_page',
        ],
        command: [
          'packages/core/src/industry/industry-first-day-work.ts',
          'INDUSTRY_UTILISATION_TARGET_COMMAND',
        ],
        api: [
          'apps/world-api/src/runtime/postwar-industry-connection.ts',
          'r.request.commandType !== INDUSTRY_UTILISATION_TARGET_COMMAND',
        ],
        executor: [
          'apps/world-worker/src/persistence/postwar-industry-run-runtime.ts',
          'const target = c.commandType === INDUSTRY_UTILISATION_TARGET_COMMAND',
        ],
        sql: [
          'database/proposals/postwar-pending-programme-target-prefix.sql',
          'create or replace function world_v2.postwar_mixed_industry_work_group',
        ],
        readback: [
          'apps/world-worker/src/persistence/postwar-industry-utilisation-targets-read.ts',
          'fixed-industry-utilisation-targets-runtime',
        ],
      },
    },
  ];
  return groups.flatMap((group) => {
    const mapping = readStaticMapping(root, group.path, group.variable),
      fields = mapping[group.fieldsProperty];
    if (
      JSON.stringify(fields) !== JSON.stringify(group.expected) ||
      (mapping.scope ?? mapping.targetScope) !== group.scope
    )
      throw Error('REVIEWED_FIELD_MAPPING_REVIEW_REQUIRED:' + group.variable);
    const references = Object.fromEntries(
      Object.entries(group.refs).map(([k, [path, needle]]) => [
        k,
        anchor(path, needle),
      ]),
    );
    return Object.entries(fields).map(([fieldKey, payloadField]) => ({
      moduleId: mapping.moduleId,
      fieldKey,
      payloadField,
      scope: group.scope,
      commandType: group.commandType,
      dataset: group.dataset,
      codeStatus: 'IMPLEMENTED_UNVERIFIED_LIMITED_CONTRACT',
      mapping: anchor(group.path, group.variable),
      references,
      runtimeAcceptance: 'NOT_EXECUTED_BY_INVENTORY',
    }));
  });
}

export function buildScopeInventory({
  root = repositoryRoot,
  evidenceRoots = [],
} = {}) {
  // Existing strict source pins/count checks remain the denominator authority.
  const inventory = loadInventory(root);
  const { requirements, modules, counts } = inventory;
  const mainMapping = readMainMapping(root);
  const reviewedConnections = reviewedFieldConnections(root);
  const tokens = [
    ...new Set(
      modules.flatMap((module) => [
        module.id,
        ...module.fields.map((field) => field.key),
        ...module.sources,
      ]),
    ),
  ];
  const index = indexSources(root, tokens);
  const tests = index.sourceFiles.filter(({ path }) =>
    /^tests\/.+\.test\.[cm]?[jt]sx?$/u.test(path),
  );
  const reports = collectRecordedTests(
    evidenceRoots,
    tests.map(({ path }) => path),
  );
  const editorPath = requirements.localEditorPath;
  const editor = readFileSync(resolve(root, editorPath), 'utf8').split('\n');
  const countryPath = requirements.countryPagePath;
  const country = readFileSync(resolve(root, countryPath), 'utf8').split('\n');
  const immersivePath = 'apps/world-web/public/season1-immersive/immersive.js';
  const immersive = readFileSync(resolve(root, immersivePath), 'utf8').split(
    '\n',
  );
  const contextPath =
    'apps/world-web/public/season1-immersive/country-context.js';
  const context = readFileSync(resolve(root, contextPath), 'utf8').split('\n');
  const anchor = (path, lines, needle) => {
    const line = lines.findIndex((text) => text.includes(needle));
    if (line < 0)
      throw new Error(`PAGE_RENDERER_ANCHOR_MISSING:${path}:${needle}`);
    return reference(root, path, line + 1);
  };
  const renderer = {
    module: anchor(editorPath, editor, 'function openModule('),
    input: anchor(editorPath, editor, 'function renderField('),
    readout: anchor(editorPath, editor, 'function renderEditor('),
    save: anchor(editorPath, editor, 'function savePolicy('),
    countryBlock: anchor(countryPath, country, 'function blockedModule('),
    countryGuard: anchor(
      contextPath,
      context,
      'if(countryScope){openModule=function(',
    ),
    immersiveInput: anchor(immersivePath, immersive, 'function objectField('),
    immersiveReadout: anchor(
      immersivePath,
      immersive,
      'renderEditor=function(){if(!activeModule)',
    ),
  };
  const itemRows = [];
  for (const [moduleIndex, module] of modules.entries()) {
    const base = {
      officeId: module.role,
      moduleId: module.id,
      requirementSourceIds: module.sources,
      catalogPointer: `/modules/${moduleIndex}`,
      moduleTitle: module.title,
    };
    const add = (row, selector, pageRef, lexicalTokens) => {
      const sourceReferences = [
        ...new Map(
          lexicalTokens
            .flatMap((token) => index.hits.get(token) ?? [])
            .map((ref) => [`${ref.path}:${ref.line}`, ref]),
        ).values(),
      ];
      const itemTests = sourceReferences.filter(({ path }) =>
        tests.some((test) => test.path === path),
      );
      const reviewed =
        row.kind === 'INPUT_FIELD'
          ? reviewedConnections.find(
              (r) => r.moduleId === module.id && r.fieldKey === row.fieldKey,
            )
          : undefined;
      itemRows.push({
        ...base,
        ...(reviewed ? { reviewedConnection: reviewed } : {}),
        ...row,
        page: {
          staticRenderer: pageRef,
          selector,
          actualDomExecution: 'NOT_RUN_BY_THIS_TOOL',
          editorMeaning: 'LOCAL_DRAFT_OR_AWAITING_SETTLEMENT',
          countryNativeRoute: renderer.countryBlock,
          countryOverrideGuard: renderer.countryGuard,
          countryNavigationSelector: `[data-module="${module.id}"]`,
          immersiveRenderer:
            row.kind === 'INPUT_FIELD'
              ? renderer.immersiveInput
              : renderer.immersiveReadout,
          immersiveSelector:
            row.fieldType === 'select' || row.fieldType === 'multi'
              ? `[data-cmd="field-choice"][data-id="${row.fieldKey}"]`
              : selector,
          saveHandler: renderer.save,
        },
        sourceReferences,
        links: {
          command: {
            status:
              reviewed?.codeStatus ??
              'UNKNOWN_NO_REVIEWED_ITEM_TO_DTO_TRANSLATION',
            reference: reviewed?.references.command ?? null,
          },
          api: {
            status:
              reviewed?.codeStatus ?? 'UNKNOWN_NO_ITEM_ROUTE_BINDING_PROVEN',
            reference: reviewed?.references.api ?? null,
          },
          sql: {
            status:
              reviewed?.codeStatus ??
              'UNKNOWN_NO_ITEM_ROW_OR_MUTATION_BINDING_PROVEN',
            reference: reviewed?.references.sql ?? null,
          },
          tests: itemTests.map((test) => ({
            ...test,
            recordedReports: reports.recorded.get(test.path) ?? [],
            acceptance:
              'UNKNOWN_LEXICAL_REFERENCE_DOES_NOT_PROVE_FIELD_BEHAVIOUR',
          })),
        },
        acceptance: 'UNKNOWN_NOT_EXECUTED_AS_A_CATALOG_ITEM',
      });
    };
    add(
      { id: `module:${module.id}`, kind: 'MODULE_ACTION', label: module.title },
      `[data-module-card="${module.id}"]`,
      renderer.module,
      [module.id],
    );
    for (const [i, field] of module.fields.entries())
      add(
        {
          id: `field:${module.id}:${field.key}`,
          kind: 'INPUT_FIELD',
          label: field.label,
          fieldKey: field.key,
          fieldType: field.type,
          unit: field.unit ?? null,
          catalogPointer: `${base.catalogPointer}/fields/${i}`,
          originalValueMeaning:
            'PRESENTATION_PROPOSAL_NOT_ADMITTED_CURRENT_FACT',
        },
        field.type === 'conditions' || field.type === 'table'
          ? `[data-structured="${field.key}"]`
          : `[data-field="${field.key}"]`,
        renderer.input,
        [module.id, field.key, field.source],
      );
    for (const [i, field] of module.readouts.entries())
      add(
        {
          id: `readout:${module.id}:${i}`,
          kind: 'RESULT_READOUT',
          label: field.label,
          catalogPointer: `${base.catalogPointer}/readouts/${i}`,
          requirementSourceIds: [field.source],
        },
        `[data-readout="${field.source}"]`,
        renderer.readout,
        [module.id, field.source],
      );
  }
  if (
    reviewedConnections.some(
      (r) =>
        !itemRows.some(
          (item) =>
            item.kind === 'INPUT_FIELD' &&
            item.moduleId === r.moduleId &&
            item.fieldKey === r.fieldKey,
        ),
    )
  )
    throw Error('REVIEWED_FIELD_NOT_IN_ORIGINAL_CATALOG');
  const manifest = {
    schemaVersion: 'office-connection-scope-inventory-v1',
    classification:
      'READ_ONLY_STATIC_NAVIGATION_AND_EVIDENCE_INVENTORY_NOT_ACCEPTANCE',
    commit: git(root, ['rev-parse', 'HEAD']),
    workingTreeStatus: git(root, ['status', '--porcelain=v1']),
    scanConsistency:
      'PER_FILE_HASHED_NON_ATOMIC_WORKTREE_NAVIGATION_REQUIRE_CLEAN_FROZEN_CANDIDATE_FOR_FINAL_EVIDENCE',
    denominators: {
      ...counts,
      catalogItems: itemRows.length,
      countryCatalogInstances: itemRows.length * counts.selectedCountries,
    },
    sourceBinding: [
      ...Object.keys(requirements.sourcePins),
      'config/office-connection/requirements.json',
      'tools/office-connection/catalog.mjs',
      'tools/office-connection/scope-inventory.mjs',
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
    ]
      .filter((path, i, all) => all.indexOf(path) === i)
      .map((path) => reference(root, path)),
    pageCommandInventory: inventory.operations,
    offices: requirements.offices.map((officeId) => ({
      officeId,
      counts: requirements.expectedOfficeCounts[officeId],
      candidateNavigationOnly: true,
      // This is deliberately not copied onto each input/readout as a connection.
      commandApiSqlTestCandidates: index.sourceFiles.filter(({ path }) =>
        runtimeNames[officeId].test(path),
      ),
    })),
    supplementalMainFields: {
      mapping: reference(
        root,
        'apps/world-web/src/main-office-fields/mapping.ts',
      ),
      binder: reference(
        root,
        'apps/world-web/src/main-office-fields/binder.ts',
      ),
      mappingVersion: mainMapping.version,
      hudControls: mainMapping.coverage.existingHudControls,
      readonlySlots: mainMapping.coverage.newReadonlySlots,
      catalogPolicyInputs: mainMapping.coverage.catalogPolicyInputs,
      catalogReadouts: mainMapping.coverage.catalogReadouts,
      catalogModuleActions: mainMapping.coverage.moduleActions,
      exactSupplementalFieldSelectors: mainMapping.fields.map((field) => ({
        field: field.field,
        selector: `#${field.id}`,
        acceptance: 'NOT_EXECUTED_BY_INVENTORY',
      })),
      significance:
        'SUPPLEMENTAL_MAIN_FIELDS_NOT_A_REDUCTION_OF_CATALOG_DENOMINATORS',
    },
    reviewedCatalogFieldConnections: {
      status: 'STATIC_REVIEWED_LIMITED_CONTRACTS_NOT_RUNTIME_ACCEPTANCE',
      fields: reviewedConnections,
      inputFieldCount: reviewedConnections.length,
      moduleActionsCompleted: 0,
      catalogReadoutsCompleted: 0,
      nativeEvidence:
        'HISTORICAL_VERSION_SPECIFIC_SEPARATELY_RECORDED_NOT_INHERITED',
    },
    legacyInventory: {
      reference: reference(root, 'config/office-connection/requirements.json'),
      runtimeInfrastructureStatus:
        'HISTORICAL_STATIC_ANNOTATIONS_NOT_CURRENT_RUNTIME_STATUS',
    },
    sharedActorIdentityBoundary: {
      currentResolver: reference(
        root,
        'apps/world-api/src/integration/postgres-world-actor-registry.ts',
      ),
      candidateSql: reference(
        root,
        'database/proposals/world-actor-identity-registry.sql',
      ),
      runtimeAssignmentRecords: 'UNKNOWN_NOT_READ_OR_CREATED_BY_THIS_TOOL',
      semantics:
        'EXPLICIT_WORLD_LOCAL_IDENTITY_CONFIGURATION_NOT_OFFICE_OR_ECONOMIC_AUTHORITY',
      fallbackActorGeneration: 'FORBIDDEN',
    },
    itemRows,
    sqlDeclarations: index.sqlFunctions,
    sourceFiles: index.sourceFiles,
    mockAndConstantReview: {
      method:
        'FINITE_LEXICAL_NAVIGATION_NOT_DEFECT_DETECTION_OR_EXHAUSTIVE_CONSTANT_SCAN',
      classifications: index.classifiedHits,
      hitsAreConfirmedProductDefects: false,
    },
    externalRecordedEvidence: {
      roots: evidenceRoots,
      inspectedReports: reports.inspectedReports,
      excludedReports: reports.excludedReports,
      testsWithRecordedReports: tests
        .filter(({ path }) => reports.recorded.get(path)?.length)
        .map(({ path }) => ({ path, reports: reports.recorded.get(path) })),
      acceptanceRule:
        'SKIP_NOT_PASS_REPORTS_NEED_EXACT_SOURCE_BACKEND_SCOPE_AND_ASSERTION_REVIEW',
    },
    statement:
      'No application runtime, DB, HTTP, SQL installation, browser or production acceptance was performed. Unknown item mappings remain in all denominators.',
  };
  return { ...manifest, inventorySha256: sha(JSON.stringify(manifest)) };
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  try {
    const args = process.argv.slice(2);
    let output;
    const evidenceRoots = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--out' && args[i + 1]) output = resolve(args[++i]);
      else if (args[i] === '--evidence-root' && args[i + 1])
        evidenceRoots.push(resolve(args[++i]));
      else
        throw new Error(
          'USAGE: scope-inventory.mjs [--out new-output.json] [--evidence-root directory]',
        );
    }
    const result = buildScopeInventory({ evidenceRoots });
    if (output)
      writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, {
        flag: 'wx',
      });
    process.stdout.write(
      `${JSON.stringify(output ? { path: output, inventorySha256: result.inventorySha256, denominators: result.denominators, acceptance: 'NOT_RUN' } : result)}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
