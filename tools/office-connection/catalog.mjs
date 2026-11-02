/** Offline inventory only. No network, database, host, Clock or application imports. */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

export const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const manifestPath = 'config/office-connection/requirements.json';
const fail = (code) => {
  throw new Error(code);
};
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const read = (root, path) => readFileSync(resolve(root, path), 'utf8');
const unique = (values, code) => {
  if (new Set(values).size !== values.length) fail(code);
};

/** Literal command names are taken from the shipped JS, never invented here.
 * Whole-file pins also catch computed/new syntax that extraction cannot classify. */
export function pageCommands(text, path) {
  const commands = new Set();
  const dynamic = new Set();
  for (const match of text.matchAll(
    /data-(?:cmd|operation)=["']([^"']+)["']/gu,
  )) {
    if (match[1].includes('${')) dynamic.add(match[1]);
    else commands.add(match[1]);
  }
  const source = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const literal = (node) =>
    node &&
    (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
      ? node.text
      : null;
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'button'
    ) {
      const name = literal(node.arguments[1]);
      if (name) commands.add(name);
      else dynamic.add('button:nonliteral-command');
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken
    ) {
      const left = node.left;
      if (
        ts.isElementAccessExpression(left) &&
        left.expression.getText(source) === 'commands'
      ) {
        const name = literal(left.argumentExpression);
        if (name) commands.add(name);
        else dynamic.add('commands:computed-assignment');
      }
      if (
        ts.isPropertyAccessExpression(left) &&
        left.expression.getText(source) === 'commands'
      )
        commands.add(left.name.text);
    }
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(source) === 'commands' &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      for (const property of node.initializer.properties) {
        if (property.name && !ts.isComputedPropertyName(property.name))
          commands.add(literal(property.name) ?? property.name.getText(source));
        else dynamic.add('commands:computed-property');
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return { commands: [...commands].sort(), dynamic: [...dynamic].sort() };
}

function selectedCountryIds(text, path) {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  let ids = null;
  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(source) === 'OFFICIAL_EXPLORER_COUNTRY_FILES'
    ) {
      let argument = node.initializer?.arguments?.[0];
      if (argument && ts.isAsExpression(argument))
        argument = argument.expression;
      if (!argument || !ts.isObjectLiteralExpression(argument))
        fail('COUNTRY_MANIFEST_SHAPE_INVALID');
      ids = argument.properties.map((property) => property.name?.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (
    !ids ||
    ids.some(
      (id) => typeof id !== 'string' || !/^(0[1-9]|[1-6][0-9]|70)$/u.test(id),
    )
  )
    fail('COUNTRY_MANIFEST_SHAPE_INVALID');
  unique(ids, 'DUPLICATE_SELECTED_COUNTRY');
  return ids;
}

export function loadInventory(root = repositoryRoot) {
  const requirements = JSON.parse(read(root, manifestPath));
  if (requirements.schemaVersion !== 'office-connection-requirements-v1')
    fail('MANIFEST_SCHEMA_INVALID');
  const pageScripts = readdirSync(
    resolve(root, requirements.pageCommandDirectory),
  )
    .filter((name) => name.endsWith('.js'))
    .map((name) => `${requirements.pageCommandDirectory}/${name}`)
    .sort();
  if (
    JSON.stringify(pageScripts) !==
    JSON.stringify(
      requirements.pageCommandSources.map(({ path }) => path).sort(),
    )
  )
    fail('PAGE_SCRIPT_DENOMINATOR_DRIFT');
  for (const [path, expected] of Object.entries(requirements.sourcePins)) {
    if (digest(readFileSync(resolve(root, path))) !== expected)
      fail(`SOURCE_DRIFT:${path}`);
  }
  const catalog = JSON.parse(read(root, requirements.catalogPath));
  const wiring = JSON.parse(read(root, requirements.selectedSourceMatrixPath));
  const countryIds = selectedCountryIds(
    read(root, requirements.selectedCountryManifestPath),
    requirements.selectedCountryManifestPath,
  );
  const sourceUnits = new Set(
    read(root, requirements.sourceUnitsPath)
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line).source_id),
  );
  const roles = Object.keys(catalog.roles).sort();
  if (
    JSON.stringify(roles) !== JSON.stringify([...requirements.offices].sort())
  )
    fail('OFFICE_DENOMINATOR_DRIFT');
  unique(
    catalog.modules.map((module) => module.id),
    'DUPLICATE_MODULE',
  );
  unique(
    wiring.datasets.map((dataset) => dataset.slug),
    'DUPLICATE_DATASET',
  );
  const modules = catalog.modules.map((module) => {
    if (!roles.includes(module.role))
      fail(`UNKNOWN_MODULE_OFFICE:${module.id}`);
    unique(
      module.fields.map((field) => field.key),
      `DUPLICATE_FIELD:${module.id}`,
    );
    for (const source of [
      ...module.sources,
      ...module.fields.map((field) => field.source),
      ...module.readouts.map((field) => field.source),
    ]) {
      if (!sourceUnits.has(source))
        fail(`UNKNOWN_REQUIREMENT_SOURCE:${source}`);
    }
    return module;
  });
  const operations = requirements.pageCommandSources.map(({ path, scope }) => ({
    path,
    scope,
    ...pageCommands(read(root, path), path),
  }));
  const counts = {
    offices: roles.length,
    modules: modules.length,
    fields: modules.reduce((n, module) => n + module.fields.length, 0),
    readouts: modules.reduce((n, module) => n + module.readouts.length, 0),
    moduleActions: modules.length,
    pageCommands: operations.reduce(
      (n, source) => n + source.commands.length,
      0,
    ),
    dynamicCommandExpressions: operations.reduce(
      (n, source) => n + source.dynamic.length,
      0,
    ),
    sourceDatasets: wiring.datasets.length,
    selectedCountries: countryIds.length,
  };
  if (JSON.stringify(counts) !== JSON.stringify(requirements.expectedCounts))
    fail('DENOMINATOR_DRIFT');
  for (const [role, expected] of Object.entries(
    requirements.expectedOfficeCounts,
  )) {
    const selected = modules.filter((module) => module.role === role);
    const actual = {
      modules: selected.length,
      fields: selected.reduce((n, module) => n + module.fields.length, 0),
      readouts: selected.reduce((n, module) => n + module.readouts.length, 0),
    };
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      fail(`OFFICE_COUNT_DRIFT:${role}`);
  }
  for (const path of requirements.evidencePaths) read(root, path);
  return {
    requirements,
    catalog,
    modules,
    wiring,
    operations,
    counts,
    countryIds,
  };
}

const blockedFormal = () => ({
  status: 'BLOCKED',
  reason: 'CATALOG_ITEM_HAS_NO_VERIFIED_END_TO_END_RUNTIME_BINDING',
  authoritativeValueSource: null,
  commandFamily: null,
  api: null,
  databaseRead: null,
  databaseWrite: null,
  serverAuthorization: null,
  organizationIsolation: null,
  worldCountryOfficeIsolation: null,
  idempotency: null,
  concurrency: null,
  appendOnlyAudit: null,
  finalReceipt: null,
  browserReadback: null,
  persistenceAfterReload: null,
  acceptance: 'NOT_RUN',
});

/** Relevance is not a field binding. Existing dataset focusFields are retained
 * in their own source layer; no proposed value becomes live state. */
export function buildAcceptanceMatrix(inventory = loadInventory()) {
  const { requirements, modules, wiring, operations, counts } = inventory;
  const rows = [];
  for (const module of modules) {
    const surface = requirements.officeSurfaces[module.role];
    const candidateDatasets = wiring.datasets
      .filter((dataset) => dataset.surfaces.includes(surface))
      .map((dataset) => dataset.slug);
    const base = {
      officeId: module.role,
      moduleId: module.id,
      catalogRef: `${requirements.catalogPath}#/modules/${inventory.catalog.modules.indexOf(module)}`,
      candidateDatasetSlugs: candidateDatasets,
      candidateDatasetsAreAuthoritativeBindings: false,
      formal: blockedFormal(),
    };
    rows.push({
      ...base,
      id: `module:${module.id}`,
      kind: 'MODULE_ACTION',
      label: module.title,
      specificationSourceIds: module.sources,
      sourcePermissions: module.permissions,
      localDemo: {
        status: 'LOCAL_ONLY',
        source: requirements.localEditorPath,
        persistence: 'BROWSER_LOCAL_STORAGE_ONLY',
      },
      countryPage: { status: 'BLOCKED', source: requirements.countryPagePath },
    });
    for (const field of module.fields)
      rows.push({
        ...base,
        id: `field:${module.id}:${field.key}`,
        kind: 'INPUT_FIELD',
        fieldKey: field.key,
        label: field.label,
        fieldType: field.type,
        unit: field.unit ?? null,
        specificationSourceIds: [field.source],
        localDemo: {
          status: 'LOCAL_ONLY',
          source: requirements.localEditorPath,
        },
        countryPage: {
          status: 'BLOCKED',
          source: requirements.countryPagePath,
        },
      });
    for (const [index, field] of module.readouts.entries())
      rows.push({
        ...base,
        id: `readout:${module.id}:${index}`,
        kind: 'RESULT_READOUT',
        label: field.label,
        specificationSourceIds: [field.source],
        localDemo: {
          status: 'AWAITING_SETTLEMENT_PLACEHOLDER',
          source: requirements.localEditorPath,
        },
        countryPage: {
          status: 'BLOCKED',
          source: requirements.countryPagePath,
        },
      });
  }
  for (const source of operations) {
    for (const command of source.commands)
      rows.push({
        id: `page:${source.path}:${command}`,
        kind: 'PAGE_COMMAND',
        officeId: null,
        moduleId: null,
        command,
        sourcePath: source.path,
        scope: source.scope,
        implementationSemantics: 'REQUIRES_COMMAND_SPECIFIC_REVIEW',
        formal: blockedFormal(),
      });
  }
  unique(
    rows.map((row) => row.id),
    'DUPLICATE_ACCEPTANCE_ROW',
  );
  return {
    schemaVersion: 'office-connection-acceptance-matrix-v1',
    sourceCommit: requirements.sourceCommit,
    scope: 'OFFLINE_STATIC_INVENTORY_NOT_RUNTIME_ACCEPTANCE',
    counts,
    offices: Object.entries(inventory.catalog.roles).map(
      ([officeId, label]) => {
        const selected = modules.filter((module) => module.role === officeId);
        const inputFieldCount = selected.reduce(
          (n, module) => n + module.fields.length,
          0,
        );
        const resultReadoutCount = selected.reduce(
          (n, module) => n + module.readouts.length,
          0,
        );
        return {
          officeId,
          label,
          moduleCount: selected.length,
          inputFieldCount,
          resultReadoutCount,
          moduleActionCount: selected.length,
          catalogRows: selected.length + inputFieldCount + resultReadoutCount,
        };
      },
    ),
    denominators: {
      catalogRows: counts.modules + counts.fields + counts.readouts,
      pageCommandRows: counts.pageCommands,
      totalRows: rows.length,
      selectedCountryIds: inventory.countryIds,
      countryOfficePairs: counts.selectedCountries * counts.offices,
      countryCatalogInstanceRows:
        counts.selectedCountries *
        (counts.modules + counts.fields + counts.readouts),
      countryInstancesAreAcceptanceTargetsNotVerifiedConnections: true,
      pageCommandRowsAreSharedAndNotMultipliedAcrossCountries: true,
      unresolvedDynamicCommandExpressions: counts.dynamicCommandExpressions,
    },
    layerRule:
      'SPECIFICATION_AND_SELECTED_SOURCE_AND_LOCAL_DEMO_ARE_NOT_FORMAL_RUNTIME_AUTHORITY',
    resources: {
      officeId: null,
      reason:
        'RESOURCES_IS_A_DOMAIN_WITHIN_EXISTING_INDUSTRY_AND_TRADE_OFFICES',
      catalogModuleIds: modules
        .filter((module) =>
          module.fields.some((field) =>
            /Resource|Deposit|Extraction|资源|矿区|勘探/u.test(
              field.sourceQuote ?? '',
            ),
          ),
        )
        .map((module) => module.id),
    },
    selectedSources: wiring.datasets.map((dataset) => ({
      ...dataset,
      status: 'SELECTED_SOURCE_ONLY',
      registryPath: requirements.selectedSourceRegistryPath,
      api: { method: 'GET', route: wiring.datasetRoute },
      database: {
        tables: [
          'world_v2.country_candidate_bundle',
          'world_v2.country_candidate_artifact',
        ],
        readerPath: requirements.selectedSourceReaderPath,
      },
      permissions: 'PUBLIC_READ_ONLY_SELECTED_PACKAGE',
      liveWorldState: false,
      proposalFieldsAreExecuted: false,
      browserAcceptance: 'NOT_RUN_THIS_WORKFLOW',
    })),
    existingRuntimeInfrastructure: requirements.existingRuntimeInfrastructure,
    acceptanceRequirements: requirements.acceptanceRequirements,
    unclassifiedDynamicCommandExpressions: operations.flatMap((source) =>
      source.dynamic.map((expression) => ({
        sourcePath: source.path,
        expression,
        status: 'BLOCKED_UNCLASSIFIED',
      })),
    ),
    rows,
  };
}

export function plan(root = repositoryRoot) {
  return buildAcceptanceMatrix(loadInventory(root));
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const flag = process.argv[2] ?? '--summary';
  if (
    !['--summary', '--matrix', '--plan', '--json'].includes(flag) ||
    process.argv.length > 3
  )
    fail('USAGE: catalog.mjs [--summary|--matrix|--plan|--json]');
  const matrix = plan();
  process.stdout.write(
    `${JSON.stringify(flag !== '--summary' ? matrix : { schemaVersion: matrix.schemaVersion, scope: matrix.scope, counts: matrix.counts, denominators: matrix.denominators, formalStatus: 'BLOCKED', runtimeAcceptance: 'NOT_RUN' }, null, 2)}\n`,
  );
}
