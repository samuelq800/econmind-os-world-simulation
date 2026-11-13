/** TEST_ONLY one existing Node and Chromium. Only actual authorized current
 * pages select parameters; the shipped forms create originals and the sole
 * registered consumer decides FINAL. No source, person, wage or money is made. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import type { AuthenticatedOfficeCommandRequestDto } from '@econmind/core/authenticated-office-command-contract';
import { createRegisteredOfficeBrowserStages } from '../../tools/office-connection/registered-office-browser-stages.mjs';
import type { RegisteredOfficeBrowserStageInput } from '../../tools/office-connection/registered-office-browser-stages.mjs';
import {
  createRegisteredFinalDriver,
  registeredFinalPublishedCommand,
  registeredFinalRecord as row,
} from './postwar-registered-final-driver.js';
import { wireColdError } from '../../tools/office-connection/native-mixed-cold-errors.mjs';
type Driver = ReturnType<typeof createRegisteredFinalDriver>;
type Head = Awaited<ReturnType<Driver['readHead']>>;
type Page = { body: Record<string, unknown>; offset: number };
const text = (v: unknown): string => {
  assert.equal(typeof v, 'string');
  return v as string;
};
const uint = (v: unknown): bigint => {
  const s = text(v);
  assert.match(s, /^(0|[1-9][0-9]*)$/u);
  return BigInt(s);
};
const array = (v: unknown): Record<string, unknown>[] => {
  assert(Array.isArray(v));
  return v.map(row);
};
export function selectRegisteredSocialCreation(pages: readonly Page[]) {
  for (const p of pages) {
    const source = row(p.body.source),
      options = row(source.currentEmploymentServiceCreationOptions);
    if (options.status !== 'AVAILABLE') continue;
    const data = row(options.data);
    assert.equal(
      data.classification,
      'CURRENT_T0_SERVICE_CREATION_PLANNING_DATA_NOT_AUTHORITY',
    );
    assert.equal(data.countryId, 'COUNTRY_02');
    assert.equal(data.dayIndex, '0');
    for (const target of array(data.rootTargets)) {
      const free =
        uint(target.capacitySlots) -
        uint(target.usedSlots) -
        uint(target.reservedSlots);
      assert(free >= 0n);
      if (
        free > 0n &&
        uint(target.actualUnemployedCount) > 0n &&
        array(data.usageLicences).some(
          (l) =>
            l.locationId === target.locationId &&
            uint(l.validFromDayIndex) === 0n &&
            uint(l.validUntilDayIndex) === 1n &&
            uint(l.maximumWorkerMinutes) > 0n &&
            l.scope === 'PUBLIC_REFERRALS_ONLY_NOT_EMPLOYER_TRANSFER' &&
            l.state === 'GENESIS_USAGE_LICENSE_NOT_PAID_PURCHASE' &&
            l.additionalFeeAmount === '0',
        )
      )
        return {
          servicePoolId: text(target.poolId),
          capacity: '1',
          sourceVersion: text(source.sourceVersion),
          poolPageOffset: p.offset,
        };
    }
  }
  return null;
}
export async function currentPages(
  d: Driver,
  dataset: 'positions' | 'service-pools',
  head: Head,
): Promise<Page[]> {
  const pages: Page[] = [];
  let offset: number | null = 0,
    version: string | undefined,
    binding: string | undefined;
  while (offset !== null) {
    assert(pages.length < 64, 'BOUNDED_SOCIAL_CURRENT_PAGE_SERIES_REQUIRED');
    const response = await d.post(
      '/v1/postwar-office-runtime',
      {
        schemaVersion: 'postwar-office-runtime-read-v1',
        requestId: randomUUID(),
        operation: 'READ_CURRENT_OFFICE_OPENING',
        officeId: 'SOCIAL',
        dataset,
        page: {
          offset,
          limit: 25,
          ...(version
            ? { sourceVersion: version, bindingVersion: binding }
            : {}),
        },
      },
      'COUNTRY_02',
    );
    assert.equal(
      response.status,
      200,
      'ACTUAL_AUTHORIZED_SOCIAL_CURRENT_READ_REQUIRED',
    );
    assert.equal(response.body.ok, true);
    array(response.body.rows);
    const source = row(response.body.source),
      page = row(response.body.page);
    assert.equal(source.worldVersion, head.worldVersion);
    assert.equal(source.eventSequence, head.eventSequence);
    if (version) {
      assert.equal(source.sourceVersion, version);
      assert.equal(source.bindingVersion, binding);
    }
    version = text(source.sourceVersion);
    binding = text(source.bindingVersion);
    pages.push({ body: response.body, offset });
    const next = page.nextOffset;
    assert(
      next === null || (Number.isSafeInteger(next) && Number(next) > offset),
    );
    offset = next as number | null;
  }
  return pages;
}
export async function runRegisteredSocialCreateBrowserChain(input: {
  driver: Driver;
  browserInput: RegisteredOfficeBrowserStageInput;
  evidencePath: string;
}) {
  const d = input.driver,
    report: Record<string, unknown> = {
      classification:
        'ACTUAL_SHIPPED_SOCIAL_FORM_AND_SOLE_REGISTERED_CONSUMER_NOT_SOURCE_AUTHORITY',
      status: 'RUNNING',
      stages: [],
    },
    stages = report.stages as unknown[];
  const save = () =>
    writeFile(input.evidencePath, JSON.stringify(report, null, 2) + '\n');
  await save();
  const browsers = await createRegisteredOfficeBrowserStages(
    input.browserInput,
  );
  const consume = async (original: AuthenticatedOfficeCommandRequestDto) => {
    d.originals.push(original);
    const actual = await d.consume(original.request.commandId, {
      countryId: 'COUNTRY_02',
      commandType: original.request.commandType,
      financialBatches: 0,
      financialLegs: 0,
      inventoryPostings: 0,
    });
    stages.push({ original, actual });
    await save();
    return actual;
  };
  try {
    const head = await d.readHead(),
      pools = await currentPages(d, 'service-pools', head),
      selected = selectRegisteredSocialCreation(pools);
    report.currentCreationSources = pools;
    if (!selected) {
      report.status = 'NOT_RUN';
      report.reason =
        'NO_ACTUAL_LICENSED_T0_FREE_ROOT_POOL_AND_UNEMPLOYED_PERSON';
      await save();
      return report;
    }
    const create = await browsers.open('social');
    let original: AuthenticatedOfficeCommandRequestDto;
    {
      const queued =
        await create.submitSocialEmploymentServiceCreateFromCurrent({
          ...selected,
          expectedHead: head,
        });
      assert(queued.intent);
      original = queued.intent;
      await consume(original);
      await create.recoverFinal({
        expectedHead: await d.readHead(),
        requireCurrent: true,
      });
      await create.reloadRestore(original, { recover: false });
      await create.recoverFinal({
        expectedHead: await d.readHead(),
        requireCurrent: true,
      });
      stages.push({
        stage: 'CREATE_FINAL_AND_F5_ORIGINAL_RECOVERY',
        head: await d.readHead(),
      });
      await create.beginNextRequest({ expectedHead: await d.readHead() });
      stages.push({
        stage: 'SAME_PAGE_EXPLICIT_NEXT_REQUEST_AFTER_RESTORED_FINAL',
        head: await d.readHead(),
      });
      await save();
    }
    const afterCreate = await d.readHead(),
      childPages = await currentPages(d, 'service-pools', afterCreate),
      positionPages = await currentPages(d, 'positions', afterCreate);
    const programme = row(original.request.payload).programmeId;
    const children = childPages.flatMap((page) => {
      const options = row(
        row(page.body.source).currentEmploymentServiceCreationOptions,
      );
      if (options.status !== 'AVAILABLE') return [];
      return array(row(options.data).creations)
        .filter((c) => c.programmeId === programme)
        .map((c) => ({ child: c, page }));
    });
    assert.equal(
      children.length,
      1,
      'ACTUAL_CREATE_COMMITTED_CHILD_METADATA_REQUIRED',
    );
    const { child, page: childPage } = children[0]!;
    const actualChildren = array(childPage.body.rows).filter(
      (p) => p.poolId === child.childPoolId,
    );
    assert.equal(actualChildren.length, 1);
    const childRow = actualChildren[0]!;
    assert(
      uint(childRow.capacitySlots) -
        uint(childRow.usedSlots) -
        uint(childRow.reservedSlots) >=
        1n,
    );
    const positions = positionPages.flatMap((page) =>
      array(page.body.rows)
        .filter(
          (p) =>
            p.countryId === 'COUNTRY_02' &&
            p.locationId === childRow.locationId &&
            p.skill === childRow.skill &&
            uint(p.requiredCount) > uint(p.employedCount),
        )
        .map((position) => ({ position, page })),
    );
    report.child = child;
    report.actualMatchingVacancies = positions.length;
    if (!positions.length) {
      report.status = 'CREATE_PASSED_PLAN_MATCH_NOT_RUN';
      report.reason = 'NO_ACTUAL_SAME_LOCATION_SKILL_VACANT_POSITION';
      await save();
      return report;
    }
    const chosen = positions[0]!,
      plan = create;
    let planOriginal: AuthenticatedOfficeCommandRequestDto;
    try {
      const queued = await plan.submitSocialProgrammePlanFromCurrent({
        programmeId: text(programme),
        servicePoolId: text(child.childPoolId),
        positionId: text(chosen.position.positionId),
        requestedMatches: '1',
        poolSourceVersion: text(row(childPage.body.source).sourceVersion),
        positionSourceVersion: text(row(chosen.page.body.source).sourceVersion),
        expectedHead: afterCreate,
        poolPageOffset: childPage.offset,
        positionPageOffset: chosen.page.offset,
      });
      assert(queued.intent);
      planOriginal = queued.intent;
      await plan.recoverPreviousFinal();
      stages.push({
        stage: 'CREATE_FINAL_READBACK_PRESERVES_QUEUED_PLAN_IN_SAME_PAGE',
        head: await d.readHead(),
      });
      await save();
      await consume(planOriginal);
      await plan.recoverFinal({
        expectedHead: await d.readHead(),
        requireCurrent: true,
      });
      await plan.reloadRestore(planOriginal, { recover: false });
      await plan.recoverFinal({
        expectedHead: await d.readHead(),
        requireCurrent: true,
      });
    } finally {
      await plan.close();
    }
    const match = registeredFinalPublishedCommand(
      await d.rpc('PUBLISH_MATCH', {
        countryId: 'COUNTRY_02',
        planCommandId: planOriginal.request.commandId,
      }),
      'CANONICAL',
    );
    const actual = await d.consume(match.commandId, {
      countryId: 'COUNTRY_02',
      commandType: 'CORE_SOCIAL_JOB_MATCH_SETTLEMENT_V1',
      fingerprint: match.commandFingerprint,
      financialBatches: 0,
      financialLegs: 0,
      inventoryPostings: 0,
    });
    const matchBefore = await d.inspect(match.commandId),
      matchRead = await d.rpc('PUBLISH_MATCH', {
        countryId: 'COUNTRY_02',
        planCommandId: planOriginal.request.commandId,
      });
    assert.equal(row(matchRead).commandId, match.commandId);
    assert.deepEqual(await d.inspect(match.commandId), matchBefore);
    await d.recover(original, { duplicateProbe: false });
    await d.recover(planOriginal, { duplicateProbe: false });
    stages.push({
      stage: 'MATCH_ACTUAL_FINAL_AND_FIXED_PUBLISHER_RECOVERY',
      actual,
    });
    report.finalPools = await currentPages(
      d,
      'service-pools',
      await d.readHead(),
    );
    report.status = 'CREATE_PLAN_MATCH_ACTUAL_FINAL_PASSED';
    report.head = await d.readHead();
    await save();
    return report;
  } catch (error) {
    report.status = 'FAIL';
    report.error = wireColdError(error);
    await save();
    throw error;
  } finally {
    await browsers.close();
  }
}
