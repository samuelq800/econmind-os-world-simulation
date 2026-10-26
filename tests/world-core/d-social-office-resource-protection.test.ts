// Synthetic parser/adapter controls. Not native source or domain authority.
import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { canonicalSerialize } from '@econmind/core';
import {
  PostgresSqlDatabase,
  PostgresTransactionError,
} from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import {
  parseSocialOfficeSimulatedPublication,
  publishSocialOfficeSimulatedSource,
  type SocialOfficeSimulatedSourceRequest,
} from '../../apps/world-worker/src/persistence/social-office-simulated-source-custody.js';
import { withSocialOfficeSimulatedSourceTransaction } from '../../apps/world-worker/src/persistence/social-office-resource-protection.js';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const scope = {
  simulationId: 'SIM_SOCIAL_SOURCE_V1',
  worldId: 'WORLD_SOCIAL_SINGLE_DEMO_V1',
  countryId: 'COUNTRY_01',
};
function fixture() {
  const catalog = {
    schemaVersion: 'social-office-simulated-resource-catalog-v1',
    sourceClass: 'SIMULATED_OPENING',
    ...scope,
    resources: [
      {
        resourceId: 'PERSON_M001',
        kind: 'PERSON',
        unit: 'person',
        aliases: ['PERSON_M001', 'BUREAU_CASEWORKER', 'COLLEGE_REGISTRAR'],
      },
      {
        resourceId: 'TIME_M001_DAY0',
        kind: 'TIME',
        unit: 'minute',
        aliases: ['TIME_M001_DAY0'],
      },
    ],
  };
  const physical = {
    worldId: scope.worldId,
    countryId: scope.countryId,
    locationId: 'REGION_01_E1',
    dayIndex: '0',
    minutes: '360',
  };
  const records = [
    {
      recordId: 'COMMON_RF_RESOURCE_CATALOG_V1',
      revision: 'V1',
      role: 'RESOURCE_CATALOG',
      physicalGroupKey: null,
      rawUtf8: canonicalSerialize(catalog),
    },
    {
      recordId: 'DAY0_ORIGINAL',
      revision: 'V1',
      role: 'PHYSICAL_ORIGINAL_BODY',
      physicalGroupKey: sha(
        [
          'SOCIAL_PHYSICAL_GROUP_V1',
          scope.worldId,
          scope.countryId,
          'REGION_01_E1',
          '0',
        ].join('\n'),
      ),
      rawUtf8: canonicalSerialize(physical),
    },
  ].map((r) => ({ ...r, sha256: sha(r.rawUtf8) }));
  return {
    schemaVersion: 'social-office-simulated-source-publication-v1',
    sourceClass: 'SIMULATED_OPENING',
    ...scope,
    operationId: 'PUBLISH_1',
    expectedGeneration: '0',
    expectedManifestHash: null as string | null,
    validFromSimTime: '0',
    validUntilSimTime: '10' as string | null,
    disposition: 'ACTIVE',
    allowedPurposes: ['EDUCATION', 'EMPLOYMENT', 'HEALTHCARE'],
    selectedRecordIds: records.map((r) => r.recordId),
    records,
  };
}
const request: SocialOfficeSimulatedSourceRequest = {
  schemaVersion: 'social-office-simulated-source-request-v1',
  sourceClass: 'SIMULATED_OPENING',
  ...scope,
  purpose: 'EMPLOYMENT',
  simTime: '0',
  expectedGeneration: null,
  expectedManifestHash: null,
};
function mechanism(commitFailure = false) {
  const pub = fixture(),
    bytes = canonicalSerialize(pub),
    calls: string[] = [];
  const client = {
    query: async (sql: string) => {
      calls.push(sql);
      if (sql === 'commit' && commitFailure)
        throw Error('simulated lost acknowledgement');
      if (sql.includes('social_demo_publish_source'))
        return {
          rows: [
            {
              outcome: {
                sourceClass: 'SIMULATED_OPENING',
                ...scope,
                source: 'NEW',
                generation: '1',
                manifestHash: sha('different publication'),
              },
            },
          ],
        };
      if (sql.includes('from world_v2.social_demo_source_scope'))
        return {
          rows: [
            {
              schema_version: 'social-office-simulated-source-store-v1',
              source_class: 'SIMULATED_OPENING',
            },
          ],
        };
      if (sql.includes('from world_v2.social_demo_source_revision'))
        return {
          rows: [
            {
              generation: '1',
              manifest_hash: sha(bytes),
              publication_utf8: bytes,
            },
          ],
        };
      if (sql.includes('from world_v2.social_demo_source_record'))
        return {
          rows: pub.records.map((r) => ({
            record_id: r.recordId,
            revision: r.revision,
            role: r.role,
            physical_group_key: r.physicalGroupKey,
            raw_utf8: r.rawUtf8,
            sha256: r.sha256,
          })),
        };
      return { rows: [], rowCount: 0 };
    },
    release: () => {
      calls.push('release');
    },
  };
  const database = new PostgresSqlDatabase({
    connect: async () => client,
  } as unknown as Pool);
  return { database, calls };
}
describe('D simulated Social source structure and transaction scope', () => {
  it('owns/freeze complete shared alias source without creating admission', () => {
    const input = fixture(),
      p = parseSocialOfficeSimulatedPublication(input);
    expect(p).toEqual(input);
    expect(Object.isFrozen(p.records[0])).toBe(true);
    input.records[0]!.rawUtf8 = '{}';
    expect(p.records[0]!.rawUtf8).not.toBe('{}');
  });
  it.each([
    'sourceClass',
    'schemaVersion',
    'worldId',
    'expectedGeneration',
    'validUntilSimTime',
  ])('refuses malformed %s', (field) => {
    const v = fixture() as unknown as Record<string, unknown>;
    v[field] =
      field === 'expectedGeneration'
        ? '01'
        : field === 'validUntilSimTime'
          ? '0'
          : 'INVALID';
    expect(() => parseSocialOfficeSimulatedPublication(v)).toThrow();
  });
  it.each(['extra', 'accessor', 'symbol', 'proxy', 'sparse', 'class'])(
    'refuses %s data without invoking hooks',
    (kind) => {
      const value = fixture();
      let got = false;
      let v: unknown = value;
      if (kind === 'extra') Object.assign(value, { extra: 'x' });
      if (kind === 'accessor')
        Object.defineProperty(value, 'sourceClass', {
          enumerable: true,
          get() {
            got = true;
            return 'SIMULATED_OPENING';
          },
        });
      if (kind === 'symbol') Object.assign(value, { [Symbol('x')]: 'x' });
      if (kind === 'proxy')
        v = new Proxy(value, {
          get() {
            got = true;
            return undefined;
          },
        });
      if (kind === 'sparse') delete value.records[0];
      if (kind === 'class') Object.setPrototypeOf(value, new Date());
      expect(() => parseSocialOfficeSimulatedPublication(v)).toThrow();
      expect(got).toBe(false);
    },
  );
  it.each([
    'forgedGroup',
    'auditHead',
    'otherWorld',
    'duplicateGroup',
    'hash',
    'alias',
    'catalogDrop',
    'selectedDrop',
  ])('rejects %s original', (kind) => {
    const p = fixture(),
      r = p.records[1]!;
    if (kind === 'forgedGroup') r.physicalGroupKey = sha('renamed');
    if (kind === 'auditHead' || kind === 'otherWorld') {
      const body = JSON.parse(r.rawUtf8) as Record<string, unknown>;
      body[kind === 'auditHead' ? 'headWorldVersion' : 'worldId'] = '1';
      r.rawUtf8 = canonicalSerialize(body);
      r.sha256 = sha(r.rawUtf8);
    }
    if (kind === 'duplicateGroup')
      p.records.push({ ...r, recordId: 'DAY0_RENAMED' });
    if (kind === 'hash') r.sha256 = sha('different');
    if (kind === 'alias') {
      const c = JSON.parse(p.records[0]!.rawUtf8) as {
        resources: { aliases: string[] }[];
      };
      c.resources[1]!.aliases.push('PERSON_M001');
      p.records[0]!.rawUtf8 = canonicalSerialize(c);
      p.records[0]!.sha256 = sha(p.records[0]!.rawUtf8);
    }
    if (kind === 'catalogDrop') p.records.shift();
    if (kind === 'selectedDrop')
      p.selectedRecordIds = ['COMMON_RF_RESOURCE_CATALOG_V1'];
    expect(() => parseSocialOfficeSimulatedPublication(p)).toThrow();
  });
  it('uses one original adapter/executor and refuses ended recheck before querying', async () => {
    const m = mechanism();
    let ended: (() => Promise<void>) | undefined;
    const result = await withSocialOfficeSimulatedSourceTransaction(
      { database: m.database, request },
      async (s) => {
        expect(s.source.sourceAdmitted).toBe(false);
        expect(s.source.actualSourceCustodian).toBe('SUPPLIER_UNCONFIRMED');
        ended = s.assertCurrent;
        await s.assertCurrent();
        return 'simulated-only';
      },
    );
    expect(result).toBe('simulated-only');
    expect(m.calls[0]).toBe('begin');
    expect(m.calls.filter((s) => s === 'commit')).toHaveLength(1);
    const before = m.calls.length;
    await expect(ended!()).rejects.toThrow('ended scope');
    expect(m.calls).toHaveLength(before);
  });
  it('passes actual rollback and COMMIT uncertainty without retry/success', async () => {
    const m = mechanism();
    await expect(
      withSocialOfficeSimulatedSourceTransaction(
        { database: m.database, request },
        async () => {
          throw Error('failure');
        },
      ),
    ).rejects.toMatchObject({ outcome: 'ROLLED_BACK' });
    expect(m.calls.filter((s) => s === 'rollback')).toHaveLength(1);
    const u = mechanism(true);
    await expect(
      withSocialOfficeSimulatedSourceTransaction(
        { database: u.database, request },
        async () => 'not-a-commit',
      ),
    ).rejects.toBeInstanceOf(PostgresTransactionError);
    expect(u.calls.filter((s) => s === 'begin')).toHaveLength(1);
    expect(u.calls.filter((s) => s === 'commit')).toHaveLength(1);
  });
  it('captures the request before the real adapter can yield on connect', async () => {
    const m = mechanism(),
      mutable = { ...request };
    const pending = withSocialOfficeSimulatedSourceTransaction(
      { database: m.database, request: mutable },
      async (s) => s.source.request.worldId,
    );
    mutable.worldId = 'WORLD_CHANGED_AFTER_CALL';
    await expect(pending).resolves.toBe(scope.worldId);
  });
  it('refuses a publication outcome that does not bind the exact submitted bytes', async () => {
    const m = mechanism();
    await expect(
      publishSocialOfficeSimulatedSource(m.database, fixture()),
    ).rejects.toMatchObject({
      outcome: 'ROLLED_BACK',
      cause: expect.objectContaining({
        message: expect.stringContaining('publication outcome mismatch'),
      }),
    });
    expect(m.calls).not.toContain('commit');
  });
  it('refuses faked adapter rather than invoking its transaction', async () => {
    let invoked = false;
    const fake = {
      transaction: () => {
        invoked = true;
      },
    } as unknown as PostgresSqlDatabase;
    await expect(
      publishSocialOfficeSimulatedSource(fake, fixture()),
    ).rejects.toThrow('original PostgreSQL adapter');
    expect(invoked).toBe(false);
  });
});
