/** Explicit TEST_ONLY offline preparation inside the one registered cold host.
 * Uses that host's Worker/dist graph and already issued seed/rent/Social proof.
 * It does not start HTTP/consumer/Clock, alter roles, or create service labour. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../..', import.meta.url));

export function requireRefinery21PreparationOptIn(input) {
  assert.equal(process.env.ECONMIND_REGISTERED_FINAL_NODE_CHILD, '1');
  assert.equal(
    process.env.ECONMIND_REGISTERED_REFINERY21_SOURCE_PREPARATION,
    '1',
  );
  assert.equal(input.enabled, true);
  assert.equal(path.resolve(input.repositoryRoot), path.resolve(root));
  assert.equal(input.industryInstalled, true);
  assert.equal(input.utilitiesInstalled, true);
  assert(
    Array.isArray(input.countries) &&
      input.countries.length > 0 &&
      input.countries.length <= 70,
  );
  assert(
    input.countries.every((c) =>
      /^COUNTRY_(0[1-9]|[1-6][0-9]|70)$/u.test(c.countryId),
    ),
  );

  assert.equal(
    new Set(input.countries.map((c) => c.countryId)).size,
    input.countries.length,
  );
}

export async function prepareRegisteredRefinery21Sources(input) {
  requireRefinery21PreparationOptIn(input);
  const [sitesModule, firstDay, utility, power, social] = await Promise.all([
    import('../../apps/world-worker/dist/persistence/postwar-industry-refinery-sites.js'),
    import('../../apps/world-worker/dist/persistence/postwar-industry-first-day-source.js'),
    import('../../apps/world-worker/dist/persistence/postwar-industry-utility-source.js'),
    import('../../apps/world-worker/dist/persistence/postwar-industry-power-service-publication.js'),
    import('../../apps/world-worker/dist/runtime-preparation/social-runtime-connection.js'),
  ]);
  const coverage = sitesModule.readPostwarIndustryRefineryCoverage(
    input.sourceContext,
  );
  assert.equal(coverage.sites.length, 21);
  assert.equal(coverage.notApplicableCountries.length, 49);
  const configured = new Set(input.countries.map((c) => c.countryId));
  for (const site of coverage.sites)
    assert(
      configured.has(site.countryId),
      'REFINERY21_ACTUAL_HOST_COUNTRY_CONFIGURATION_REQUIRED:' + site.countryId,
    );
  assert(
    input.configuration.startupSeed &&
      input.configuration.startupBeneficialHousingRentSource,
    'REFINERY21_BORROWED_LIVE_CHILD_PROOF_REQUIRED',
  );
  // The same source slot returns early for the same pins on the later formal
  // shared/API prepare. It never reparses/reissues the 70-family child proof.
  await input.socialConnection.prepare(input.configuration);
  const baseline = social.readPostwarSocialRuntimeFinancialReplayBase(
    input.socialConnection,
    input.configuration.admittedWorldPins.worldId,
  );
  const utilityInput = {
    repositoryRoot: input.repositoryRoot,
    socialConnection: input.socialConnection,
    startupSeed: input.configuration.startupSeed,
    startupBeneficialHousingRentSource:
      input.configuration.startupBeneficialHousingRentSource,
  };
  const policy = await firstDay.loadPostwarIndustryFirstDayAdoptedPolicy(
    input.repositoryRoot,
  );
  const proposals =
    await utility.loadPostwarIndustryUtilitySourceProposals(utilityInput);
  assert.equal(proposals.length, 21);
  const publish = (run) =>
    input.publicationDatabase.transaction(async (tx) => {
      await tx.query('set transaction isolation level repeatable read');
      await tx.query('set local role world_v2_industry_source_publisher');
      return run(tx);
    });
  const economicSnapshot = async () => {
    const rows = {};
    for (const table of [
      'world_head',
      'command_submission',
      'command_queue',
      'command_receipt',
      'authoritative_event',
      'financial_posting_batch',
      'inventory_posting',
    ]) {
      // Literal closed table list, using the already authorized host worker.
      rows[table] = (
        await input.socialConnection.database.query(
          `select count(*)::text as count,encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,E'\\n'order by to_jsonb(t)::text collate "C"),''),'UTF8')),'hex')as sha256 from world_v2.${table} t`,
        )
      ).rows;
    }
    return rows;
  };
  const economicBefore = await economicSnapshot();
  const originals = [],
    utilitySources = [],
    powerSources = [];
  for (const site of coverage.sites)
    originals.push(
      await publish((tx) =>
        firstDay.registerPostwarIndustryRefineryFirstDayFrom(tx, {
          worldId: input.configuration.admittedWorldPins.worldId,
          countryId: site.countryId,
          facilityId: site.facilityId,
          adoptedPolicy: policy,
          sourceContext: input.sourceContext,
        }),
      ),
    );
  for (const proposal of proposals)
    utilitySources.push(
      await publish((tx) =>
        utility.publishPostwarIndustryUtilitySourcesFrom(tx, { proposal }),
      ),
    );
  const preparations =
    await utility.preparePostwarIndustryUtilitySources(utilityInput);
  try {
    assert.deepEqual(
      preparations
        .map((p) => {
          const d = utility.consumePostwarIndustryUtilitySource(p).compact;
          return d.countryId + '/' + d.facilityId;
        })
        .sort(),
      coverage.sites.map((s) => s.countryId + '/' + s.facilityId).sort(),
    );
    for (const preparation of preparations)
      powerSources.push(
        await publish((tx) =>
          power.publishPostwarIndustryPowerServiceSourceFrom(tx, {
            baseline,
            preparation,
          }),
        ),
      );
  } finally {
    for (const p of preparations)
      utility.retireUnownedPostwarIndustryUtilitySource(p);
  }
  const economicAfter = await economicSnapshot();
  assert.deepEqual(
    economicAfter,
    economicBefore,
    'REFINERY21_SOURCE_PUBLICATION_CHANGED_ECONOMIC_ROWS',
  );
  const report = {
    classification:
      'ACTUAL_ISOLATED_21_SOURCE_PUBLICATION_NOT_WORK_PAYMENT_DELIVERY_PRODUCTION',
    proofReuse: 'SAME_COLD_HOST_LIVE_CHILD_SEED_RENT_AND_SOCIAL_SOURCE_SLOT',
    worldId: input.configuration.admittedWorldPins.worldId,
    seedFingerprint: input.configuration.startupSeed.fingerprint,
    admissionRef: input.configuration.admittedWorldPins.admissionRef,
    originals,
    utilitySources,
    powerSources,
    notApplicableCountries: coverage.notApplicableCountries,
    economicBefore,
    economicAfter,
    serviceLabourCreated: false,
    commandsSubmitted: 0,
  };
  return Object.freeze({
    ...report,
    reportSha256: createHash('sha256')
      .update(JSON.stringify(report))
      .digest('hex'),
  });
}
