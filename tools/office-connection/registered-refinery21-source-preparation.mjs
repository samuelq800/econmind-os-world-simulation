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
  if (input.countrySubset !== undefined)
    assert.deepEqual(
      input.countrySubset,
      ['COUNTRY_10'],
      'FIXED_C10_SOURCE_SUBSET_ONLY',
    );
}

export async function prepareRegisteredRefinery21Sources(input) {
  requireRefinery21PreparationOptIn(input);
  const [sitesModule, firstDay, utility, power, social, powerSource] =
    await Promise.all([
      import('../../apps/world-worker/dist/persistence/postwar-industry-refinery-sites.js'),
      import('../../apps/world-worker/dist/persistence/postwar-industry-first-day-source.js'),
      import('../../apps/world-worker/dist/persistence/postwar-industry-utility-source.js'),
      import('../../apps/world-worker/dist/persistence/postwar-industry-power-service-publication.js'),
      import('../../apps/world-worker/dist/runtime-preparation/social-runtime-connection.js'),
      import('../../apps/world-worker/dist/persistence/postwar-industry-utility-service-source.js'),
    ]);
  const coverage = sitesModule.readPostwarIndustryRefineryCoverage(
    input.sourceContext,
  );
  assert.equal(coverage.sites.length, 21);
  assert.equal(coverage.notApplicableCountries.length, 49);
  const selectedSites = input.countrySubset
    ? coverage.sites.filter((site) => site.countryId === 'COUNTRY_10')
    : coverage.sites;
  assert.equal(selectedSites.length, input.countrySubset ? 1 : 21);
  const configured = new Set(input.countries.map((c) => c.countryId));
  for (const site of selectedSites)
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
  const proposals = input.countrySubset
    ? [
        await utility.loadPostwarIndustryUtilitySourceProposal({
          ...utilityInput,
          site: selectedSites[0],
        }),
      ]
    : await utility.loadPostwarIndustryUtilitySourceProposals(utilityInput);
  assert.equal(proposals.length, selectedSites.length);
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
  const preparationActions = [];
  const progress = (type, countryId, status) => {
    if (status !== 'START')
      preparationActions.push({ type, countryId, status });
    assert.match(countryId, /^COUNTRY_(0[1-9]|[1-6][0-9]|70)$/u);
    process.stdout.write(
      JSON.stringify({
        kind: 'REFINERY_SOURCE_PREPARATION_PROGRESS',
        type,
        countryId,
        status,
        at: new Date().toISOString(),
        pid: process.pid,
      }) + '\n',
    );
  };
  const { workerRole } = social.readPostwarSocialRuntimeConnectionResources(
    input.socialConnection,
  );
  assert.match(workerRole, /^[a-z_][a-z0-9_]{0,62}$/u);
  // The genuine Social wrapper already establishes RR. This fixed reader scope
  // preserves both a source failure and a possible aborted-tx restore failure.
  const readCurrent = (read) =>
    input.socialConnection.database.transaction(async (tx) => {
      const heads = await tx.query(
        'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1',
        [input.configuration.admittedWorldPins.worldId],
      );
      assert.equal(heads.rows.length, 1);
      const head = {
        worldVersion: heads.rows[0].world_version,
        eventSequence: heads.rows[0].event_sequence,
      };
      let value, failure;
      try {
        await tx.query('set local role world_v2_industry_source_reader');
        value = await read(tx, head);
      } catch (error) {
        failure = error;
      }
      try {
        await tx.query('set local role "' + workerRole + '"');
      } catch (restore) {
        if (failure !== undefined)
          throw new AggregateError(
            [failure, restore],
            'REFINERY_REUSE_SOURCE_AND_ROLE_RESTORE_FAILED',
            { cause: restore },
          );
        throw restore;
      }
      if (failure !== undefined) throw failure;
      return value;
    });
  const expectedPins = {
    seedId: input.configuration.startupSeed.seedId,
    seedFingerprint: input.configuration.startupSeed.fingerprint,
    admissionRef: input.configuration.admittedWorldPins.admissionRef,
  };
  const economicBefore = await economicSnapshot();
  const originals = [],
    utilitySources = [],
    powerSources = [];
  const livePreparations = new Set();
  try {
    for (const site of selectedSites) {
      progress('FIRST_DAY', site.countryId, 'START');
      const existing = await readCurrent((tx, head) =>
        firstDay.readPostwarIndustryFirstDaySourceFrom(tx, {
          worldId: input.configuration.admittedWorldPins.worldId,
          countryId: site.countryId,
          facilityId: site.facilityId,
          head,
          expectedPins,
        }),
      );
      if (existing !== null) {
        originals.push({
          countryId: site.countryId,
          facilityId: site.facilityId,
          sourceRef: existing.sourceRef,
          sourceSha256: existing.rawSha256,
        });
        progress('FIRST_DAY', site.countryId, 'REUSED_VERIFIED');
      } else {
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
        progress('FIRST_DAY', site.countryId, 'COMMITTED');
      }
    }
    // This API performs a new restricted DB read and exact genuine compact
    // comparison per site. Its historical intersection is NOT readiness:
    // CURRENT assertion below separately checks active parents/revocations.
    const existingUtilities =
      await utility.preparePostwarIndustryUtilitySources(utilityInput);
    const existingBySite = new Map();
    for (const preparation of existingUtilities) {
      livePreparations.add(preparation);
      const c =
        utility.consumePostwarIndustryUtilitySource(preparation).compact;
      existingBySite.set(c.countryId + '/' + c.facilityId, preparation);
    }
    for (const [index, proposal] of proposals.entries()) {
      const site = selectedSites[index];
      progress('UTILITY', site.countryId, 'START');
      const existing = existingBySite.get(
        site.countryId + '/' + site.facilityId,
      );
      if (existing) {
        await readCurrent((tx, head) =>
          utility.assertPostwarIndustryUtilitySourceFrom(tx, {
            preparation: existing,
            head,
          }),
        );
        const source = utility.consumePostwarIndustryUtilitySource(existing);
        utilitySources.push({
          sourceRef: 'INDUSTRY_UTILITY_' + source.compactSha256.toUpperCase(),
          sourceSha256: source.compactSha256,
        });
        progress('UTILITY', site.countryId, 'REUSED_VERIFIED');
      } else {
        utilitySources.push(
          await publish((tx) =>
            utility.publishPostwarIndustryUtilitySourcesFrom(tx, { proposal }),
          ),
        );
        progress('UTILITY', site.countryId, 'COMMITTED');
      }
    }
    const allPreparations =
      await utility.preparePostwarIndustryUtilitySources(utilityInput);
    for (const preparation of allPreparations)
      livePreparations.add(preparation);
    const preparations = allPreparations.filter((p) => {
      const c = utility.consumePostwarIndustryUtilitySource(p).compact;
      return selectedSites.some(
        (s) => s.countryId === c.countryId && s.facilityId === c.facilityId,
      );
    });
    assert.deepEqual(
      preparations
        .map((p) => {
          const c = utility.consumePostwarIndustryUtilitySource(p).compact;
          return c.countryId + '/' + c.facilityId;
        })
        .sort(),
      selectedSites
        .map((site) => site.countryId + '/' + site.facilityId)
        .sort(),
    );
    for (const preparation of preparations) {
      const c =
        utility.consumePostwarIndustryUtilitySource(preparation).compact;
      progress('POWER', c.countryId, 'START');
      const projected = powerSource.projectPostwarIndustryPowerServiceSource({
        baseline,
        preparation,
      });
      const existing = await readCurrent(async (tx, head) => {
        await utility.assertPostwarIndustryUtilitySourceFrom(tx, {
          preparation,
          head,
        });
        const packets = await tx.query(firstDay.INDUSTRY_FIRST_DAY_READ_QUERY, [
          c.worldId,
          c.countryId,
          c.power.storageId,
          head.worldVersion,
          head.eventSequence,
        ]);
        if (packets.rows.length === 0) return null;
        assert.equal(packets.rows.length, 1);
        const packet = packets.rows[0];
        assert.equal(packet.source_text, projected.firstdayOriginal.rawText);
        assert.equal(
          packet.source_sha256,
          projected.firstdayOriginal.rawSha256,
        );
        assert.equal(packet.source_ref, projected.firstdayOriginal.sourceRef);
        assert.equal(packet.world_version, head.worldVersion);
        assert.equal(packet.event_sequence, head.eventSequence);
        assert.equal(
          createHash('sha256').update(packet.source_text).digest('hex'),
          packet.source_sha256,
        );
        return {
          sourceRef: packet.source_ref,
          sourceSha256: packet.source_sha256,
        };
      });
      if (existing !== null) {
        powerSources.push(existing);
        progress('POWER', c.countryId, 'REUSED_VERIFIED');
      } else {
        powerSources.push(
          await publish((tx) =>
            power.publishPostwarIndustryPowerServiceSourceFrom(tx, {
              baseline,
              preparation,
            }),
          ),
        );
        progress('POWER', c.countryId, 'COMMITTED');
      }
    }
  } finally {
    for (const preparation of livePreparations)
      utility.retireUnownedPostwarIndustryUtilitySource(preparation);
  }
  const economicAfter = await economicSnapshot();
  assert.deepEqual(
    economicAfter,
    economicBefore,
    'REFINERY21_SOURCE_PUBLICATION_CHANGED_ECONOMIC_ROWS',
  );
  const report = {
    classification: input.countrySubset
      ? 'ACTUAL_ISOLATED_C10_SOURCE_PUBLICATION_NOT_WORK_PAYMENT_DELIVERY_PRODUCTION'
      : 'ACTUAL_ISOLATED_21_SOURCE_PUBLICATION_NOT_WORK_PAYMENT_DELIVERY_PRODUCTION',
    selectedCountries: selectedSites.map((s) => s.countryId),
    proofReuse: 'SAME_COLD_HOST_LIVE_CHILD_SEED_RENT_AND_SOCIAL_SOURCE_SLOT',
    worldId: input.configuration.admittedWorldPins.worldId,
    seedFingerprint: input.configuration.startupSeed.fingerprint,
    admissionRef: input.configuration.admittedWorldPins.admissionRef,
    preparationActions,
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
