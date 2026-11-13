/** TEST_ONLY embedded SQL: real signed tiny World + actual selected site/raw
 * policy producer, but original-site/deposit/header registration is installer
 * metadata. NOT the official physical financial source registrar or economics. */
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as C from '@econmind/core';
import { installPostwarNarrowTradeCutoffFixture } from './postwar-narrow-trade-cutoff-fixture.js';
import { loadPostwarSourceContext } from '../../apps/world-worker/src/preparation/postwar-source-context.js';
import {
  loadPostwarIndustryFirstDayAdoptedPolicy,
  publishPostwarIndustryFirstDaySourceFrom,
} from '../../apps/world-worker/src/persistence/postwar-industry-first-day-source.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const read = (name: string) =>
  readFile(
    new URL('../../database/proposals/' + name + '.sql', import.meta.url),
    'utf8',
  );
export async function createIndustryRunParametersSqlFixture(
  options: Readonly<{
    operatingSocialEmployment?: Readonly<Record<string, unknown>>;
  }> = {},
) {
  const db = new PGlite(),
    f = await installPostwarNarrowTradeCutoffFixture(db, {
      extraBuyerBankCash: true,
      ...options,
    }),
    tx: SqlExecutor = {
      async query<Row extends object>(q: string, p: readonly unknown[] = []) {
        const r = await db.query<Row>(q, [...p]);
        return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
      },
    };
  try {
    for (const name of [
      'postwar-industry-production-source',
      'postwar-industry-intake-binding',
      'postwar-industry-first-day-source',
      'postwar-industry-run-parameters-read',
    ])
      await db.exec(await read(name));
    await db.exec(
      `grant world_v2_postwar_projection_reader to ${f.readerRole}`,
    );
    await db.query(
      'update world_v2.current_commit_authorization set active=false where world_id=$1',
      [f.world],
    );
    await db.query(
      "insert into world_v2.current_commit_authorization values($1,$2::uuid,$3,'INDUSTRY','INDUSTRY_PRODUCTION',$4,$5,true,now())",
      [f.world, f.subject, f.buyer, f.team, f.revision],
    );
    await db.query(
      "insert into world_v2.runtime_read_seat(world_id,auth_subject,country_id,office_id,team_id,authorization_revision)values($1,$2::uuid,$3,'INDUSTRY',$4,$5)",
      [f.world, f.subject, f.buyer, f.team, f.revision],
    );
    await db.query(
      "insert into world_v2.projection_entitlement values($1,$2::uuid,'OFFICE_PRIVATE',$3,$4,true,now(),null)",
      [
        f.world,
        f.subject,
        'OFFICE_' +
          Buffer.from(f.buyer).toString('hex').toUpperCase() +
          '_494E445553545259',
        f.revision,
      ],
    );
    const context = await loadPostwarSourceContext(process.cwd()),
      policy = await loadPostwarIndustryFirstDayAdoptedPolicy(process.cwd()),
      datasets = context.sourceBytes.datasets;
    const facilities = JSON.parse(datasets['data/facilities.json']!) as Record<
        string,
        unknown
      >[],
      facility = facilities.find((x) => x.id === 'OPEN-02-REFINED_FUEL')!,
      recipe = (
        JSON.parse(datasets['data/recipes.json']!) as Record<string, unknown>[]
      ).find((x) => x.id === facility.recipeId)!;
    const mapping = JSON.parse(context.mappingBytes) as {
        mappings: {
          regions: Record<string, unknown>[];
          entityProposals: Record<string, unknown>[];
        };
      },
      location = mapping.mappings.regions.find(
        (r) => r.sourceRegionId === facility.regionId,
      )!,
      operator = mapping.mappings.entityProposals.find(
        (x) => x.sourceEntityId === facility.operatorId,
      )!;
    const body = JSON.stringify({
        worldId: f.world,
        countryId: f.buyer,
        locationId: location.normalizedRegionId,
        operatorId: operator.proposedCoreLegalEntityId,
        sourceFacility: facility,
        recipe,
        technologyProposals: [],
        licenseProposals: [],
        commodityCatalog: JSON.parse(datasets['data/commodity-catalog.json']!),
      }),
      registration = 'REGISTRATION_TEST_ONLY_PARAMETERS';
    const operating = f.seed.sources.find(
      (s) =>
        JSON.parse(s.canonicalPayload).schemaVersion ===
        'postwar-operating-genesis-seed-source-v1',
    )!;
    // Deliberate installer metadata fixture: no claim that this tiny seed carries
    // official E03/OP deposit adoption. No economic balance or authority is added.
    await db.query(
      'insert into world_v2.postwar_industry_original(world_id,country_id,facility_id,registration_ref,seed_fingerprint,admission_ref,operating_source_id,operating_source_hash,checksums_sha256,owner_original_sha256,document_text,document_sha256)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,$11)',
      [
        f.world,
        f.buyer,
        facility.id,
        registration,
        f.seed.fingerprint,
        f.admissionRef,
        operating.sourceId,
        operating.payloadHash,
        sha(context.sourceBytes.checksumsBytes),
        body,
        sha(body),
      ],
    );
    const leg = f.seed.financialBatches
        .flatMap((b) => b.legs)
        .find((l) => l.account.countryId === f.buyer)!,
      currency = leg.amount.currency;
    await db.query(
      "insert into world_v2.postwar_industry_deposit_original values($1,$2,'OPERATOR_BANK_DEPOSIT',$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9)",
      [
        f.world,
        f.buyer,
        f.seed.fingerprint,
        f.admissionRef,
        f.financial.sourceId,
        f.financial.payloadHash,
        JSON.stringify({
          currency,
          ownerId: operator.proposedCoreLegalEntityId,
        }),
        JSON.stringify({ currency }),
        leg.amount.amount.toFixed(),
      ],
    );
    const admission = (
        await db.query<{
          source_bundle_sha256: string;
          replay_binding: string;
          model_version: string;
        }>(
          'select source_bundle_sha256,replay_binding,model_version from world_v2.runtime_admission_publication_permit where world_id=$1',
          [f.world],
        )
      ).rows[0]!,
      { fingerprint, ...intent } = f.seed;
    void fingerprint;
    await db.query(
      "insert into world_v2.postwar_office_projection_document values($1,$2,$3,'INDUSTRY','regional-source-capacity','postwar-office-projection.v1',$4,'TEST_ONLY_METADATA',$5,$6,$7,$8,$9,$10,$11,'{}'::jsonb,$12,$13,0,0,$14,0,1)",
      [
        'PARAMETER_HEADER_TEST_ONLY',
        f.world,
        f.buyer,
        'sha256:' + sha('TEST_ONLY_HEADER'),
        f.admissionRef,
        f.seed.seedId,
        f.seed.fingerprint,
        sha(C.canonicalSerialize(intent)),
        admission.source_bundle_sha256,
        operating.sourceId,
        operating.payloadHash,
        admission.model_version,
        admission.replay_binding,
        sha('[]'),
      ],
    );
    await db.exec(
      'set session authorization world_v2_industry_source_publisher',
    );
    const published = await publishPostwarIndustryFirstDaySourceFrom(tx, {
      worldId: f.world,
      countryId: 'COUNTRY_02',
      facilityId: 'OPEN-02-REFINED_FUEL',
      adoptedPolicy: policy,
      sourceContext: context,
    });
    await f.reset();
    return {
      db,
      f,
      tx,
      published,
      currency,
      async begin() {
        await f.reset();
        await db.exec('set session authorization ' + f.readerRole);
        await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
          f.subject,
        ]);
        await db.exec(
          'begin isolation level repeatable read read only;set local role world_v2_postwar_projection_reader',
        );
      },
      async close() {
        await f.reset();
        await db.close();
      },
    };
  } catch (error) {
    await db.close();
    throw error;
  }
}
