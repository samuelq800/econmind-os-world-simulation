import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildAcceptanceMatrix,
  loadInventory,
  pageCommands,
  plan,
  repositoryRoot,
} from '../../tools/office-connection/catalog.mjs';

const manifestPath = 'config/office-connection/requirements.json';
type FixtureRequirements = {
  catalogPath: string;
  sourcePins: Record<string, string>;
  pageCommandDirectory: string;
  evidencePaths: string[];
};
type TestCatalog = {
  roles: Record<string, string>;
  modules: {
    id: string;
    role: string;
    fields: { key: string; source: string }[];
    readouts: { source: string; label: string }[];
  }[];
};

/** Disposable text-only fixtures. Never touch the shared checkout or a DB. */
function fixture(
  run: (root: string, requirements: FixtureRequirements) => void,
) {
  const root = mkdtempSync(resolve(tmpdir(), 'office-connection-catalog-'));
  const requirements = JSON.parse(
    readFileSync(resolve(repositoryRoot, manifestPath), 'utf8'),
  );
  function put(path: string, text: string) {
    mkdirSync(dirname(resolve(root, path)), { recursive: true });
    writeFileSync(resolve(root, path), text);
  }
  for (const path of Object.keys(requirements.sourcePins))
    put(path, readFileSync(resolve(repositoryRoot, path), 'utf8'));
  requirements.evidencePaths = [];
  put(manifestPath, JSON.stringify(requirements));
  try {
    run(root, requirements);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function mutateCatalog(
  root: string,
  requirements: FixtureRequirements,
  change: (catalog: TestCatalog) => void,
) {
  const path = resolve(root, requirements.catalogPath);
  const catalog = JSON.parse(readFileSync(path, 'utf8'));
  change(catalog);
  const text = JSON.stringify(catalog);
  writeFileSync(path, text);
  // Even a deliberately refreshed byte pin cannot hide count/office drift.
  requirements.sourcePins[requirements.catalogPath] = createHash('sha256')
    .update(text)
    .digest('hex');
  writeFileSync(resolve(root, manifestPath), JSON.stringify(requirements));
}

describe('all Office connection denominator and acceptance inventory', () => {
  it('enumerates every actual catalog module, input and result exactly once', () => {
    const inventory = loadInventory();
    const matrix = buildAcceptanceMatrix(inventory);
    expect(matrix.counts).toMatchObject({
      offices: 6,
      modules: 120,
      moduleActions: 120,
      fields: 1126,
      readouts: 158,
      sourceDatasets: 34,
    });
    expect(matrix.denominators.catalogRows).toBe(1404);
    expect(matrix.denominators.countryOfficePairs).toBe(420);
    expect(matrix.denominators.countryCatalogInstanceRows).toBe(98280);
    expect(matrix.denominators.selectedCountryIds).toHaveLength(70);
    expect(matrix.offices.map((office) => office.officeId)).toEqual(
      Object.keys(inventory.catalog.roles),
    );
    expect(inventory.catalog.countries).toHaveLength(3);
    expect(
      matrix.denominators
        .countryInstancesAreAcceptanceTargetsNotVerifiedConnections,
    ).toBe(true);
    expect(new Set(matrix.rows.map((row) => row.id)).size).toBe(
      matrix.rows.length,
    );
    for (const module of inventory.modules) {
      expect(
        matrix.rows.filter((row) => row.moduleId === module.id),
      ).toHaveLength(1 + module.fields.length + module.readouts.length);
      for (const field of module.fields) {
        expect(
          matrix.rows.find(
            (row) => row.id === `field:${module.id}:${field.key}`,
          ),
        ).toMatchObject({
          officeId: module.role,
          specificationSourceIds: [field.source],
          fieldType: field.type,
          unit: field.unit ?? null,
        });
      }
    }
  });

  it('keeps legal requirements, public selected data and local drafts separate from runtime authority', () => {
    const matrix = plan();
    for (const row of matrix.rows) {
      expect(row.formal.status).toBe('BLOCKED');
      expect(row.formal.acceptance).toBe('NOT_RUN');
      expect(
        Object.entries(row.formal)
          .filter(([key]) => !['status', 'reason', 'acceptance'].includes(key))
          .every(([, value]) => value === null),
      ).toBe(true);
      expect(row).not.toHaveProperty('value');
    }
    expect(matrix.resources.officeId).toBeNull();
    expect(matrix.selectedSources).toHaveLength(34);
    expect(
      matrix.selectedSources.every(
        (source: {
          liveWorldState: boolean;
          proposalFieldsAreExecuted: boolean;
          status: string;
        }) =>
          source.liveWorldState === false &&
          source.proposalFieldsAreExecuted === false &&
          source.status === 'SELECTED_SOURCE_ONLY',
      ),
    ).toBe(true);
    expect(
      matrix.existingRuntimeInfrastructure.manualOfficeCommand
        .catalogItemBinding,
    ).toBeNull();
    expect(matrix.existingRuntimeInfrastructure.trade.status).toBe(
      'PREPARATION_ONLY_NOT_ROUTE_OR_PERSISTENCE',
    );
    expect(
      matrix.existingRuntimeInfrastructure.industry.productionCustodyAdapter,
    ).toBeNull();
  });

  it('rejects changed source bytes and newly added page scripts', () => {
    fixture((root, requirements) => {
      writeFileSync(resolve(root, requirements.catalogPath), '{}');
      expect(() => loadInventory(root)).toThrow('SOURCE_DRIFT:');
    });
    fixture((root, requirements) => {
      writeFileSync(
        resolve(root, requirements.pageCommandDirectory, 'new-action.js'),
        "commands['new-action'] = () => {};\n",
      );
      expect(() => loadInventory(root)).toThrow(
        'PAGE_SCRIPT_DENOMINATOR_DRIFT',
      );
    });
  });

  it.each(['office', 'module', 'field', 'readout'] as const)(
    'rejects an unreviewed %s even after a fixture byte-pin refresh',
    (kind) => {
      fixture((root, requirements) => {
        mutateCatalog(root, requirements, (catalog) => {
          if (kind === 'office') catalog.roles.UNKNOWN = 'Unknown';
          if (kind === 'module')
            catalog.modules.push({
              ...catalog.modules[0],
              id: 'unknown-module',
            });
          if (kind === 'field')
            catalog.modules[0].fields.push({
              ...catalog.modules[0].fields[0],
              key: 'unknown-field',
            });
          if (kind === 'readout')
            catalog.modules[0].readouts.push({
              ...catalog.modules[0].readouts[0],
            });
        });
        expect(() => loadInventory(root)).toThrow(
          kind === 'office' ? 'OFFICE_DENOMINATOR_DRIFT' : 'DENOMINATOR_DRIFT',
        );
      });
    },
  );

  it('rejects unknown module ownership, duplicate input identities and fabricated requirement anchors', () => {
    for (const [change, error] of [
      [
        (catalog: TestCatalog) => {
          catalog.modules[0].role = 'UNKNOWN';
        },
        'UNKNOWN_MODULE_OFFICE:',
      ],
      [
        (catalog: TestCatalog) => {
          catalog.modules[0].fields.push(catalog.modules[0].fields[0]);
        },
        'DUPLICATE_FIELD:',
      ],
      [
        (catalog: TestCatalog) => {
          catalog.modules[0].fields[0].source = 'INVENTED-U0000';
        },
        'UNKNOWN_REQUIREMENT_SOURCE:',
      ],
    ] as const)
      fixture((root, requirements) => {
        mutateCatalog(root, requirements, change);
        expect(() => loadInventory(root)).toThrow(error);
      });
  });

  it('extracts action declarations and exposes computed commands as unclassified', () => {
    const found = pageCommands(
      `
      const commands = { submit() {}, 'review': () => {} };
      commands['confirm'] = () => {};
      commands.cancel = () => {};
      button('New', 'new-command');
      commands[unknown] = () => {};
      const html = '<button data-cmd="open"></button>';
    `,
      'test.js',
    );
    expect(found.commands).toEqual([
      'cancel',
      'confirm',
      'new-command',
      'open',
      'review',
      'submit',
    ]);
    expect(found.dynamic).toContain('commands:computed-assignment');
    expect(plan().unclassifiedDynamicCommandExpressions.length).toBeGreaterThan(
      0,
    );
  });

  it('rejects an added literal operation even when its fixture byte pin is refreshed', () => {
    fixture((root, requirements) => {
      const path = `${requirements.pageCommandDirectory}/country-game.js`;
      const text = `${readFileSync(resolve(root, path), 'utf8')}\ncommands['unreviewed-action'] = () => {};\n`;
      writeFileSync(resolve(root, path), text);
      requirements.sourcePins[path] = createHash('sha256')
        .update(text)
        .digest('hex');
      writeFileSync(resolve(root, manifestPath), JSON.stringify(requirements));
      expect(() => loadInventory(root)).toThrow('DENOMINATOR_DRIFT');
    });
  });
});
