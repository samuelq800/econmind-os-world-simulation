/** TEST_ONLY actual shipped DOM -> registered HTTP -> sole consumer -> FINAL.
 * Caller owns an isolated existing world, Node, JWT and Chromium. This helper
 * starts no backend, registers no source and never initializes a world. Terms
 * are pending requests only; zero target is intent, never production. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { parseIndustryRunParameterRow } from '@econmind/core/postwar-industry-run-parameters-contract';
import type { AuthenticatedOfficeCommandRequestDto } from '@econmind/core/authenticated-office-command-contract';
import {
  createRegisteredOfficeBrowserStages,
  type RegisteredOfficeBrowserSession,
  type RegisteredOfficeBrowserStageInput,
  type RegisteredOfficeBrowserState,
} from '../../tools/office-connection/registered-office-browser-stages.mjs';
import {
  createRegisteredFinalDriver,
  registeredFinalRecord as row,
} from './postwar-registered-final-driver.js';
import { wireColdError } from '../../tools/office-connection/native-mixed-cold-errors.mjs';

type Driver = ReturnType<typeof createRegisteredFinalDriver>;
/** Narrow actual Playwright surface; no fake implementation or response. */
interface LivePage {
  locator(selector: string): {
    fill(value: string): Promise<void>;
    selectOption(value: string): Promise<unknown>;
    click(): Promise<void>;
    textContent(): Promise<string | null>;
  };
  waitForFunction(expression: string): Promise<unknown>;
  on(event: 'request', listener: (request: LiveRequest) => void): void;
  off(event: 'request', listener: (request: LiveRequest) => void): void;
}
interface LiveRequest {
  url(): string;
  method(): string;
  postDataJSON(): unknown;
}
const text = (value: unknown): string => {
  assert.equal(typeof value, 'string');
  return value as string;
};
const pageOf = (session: RegisteredOfficeBrowserSession) =>
  session.page as LivePage;
const current = (
  page: RegisteredOfficeBrowserState['runtimePage'],
  head: Awaited<ReturnType<Driver['readHead']>>,
) => {
  assert(page, 'ACTUAL_CURRENT_PAGE_REQUIRED');
  assert.equal(page.source.worldVersion, head.worldVersion);
  assert.equal(page.source.eventSequence, head.eventSequence);
  assert.equal(page.authority.readback.worldVersion, head.worldVersion);
  assert.equal(page.authority.readback.eventSequence, head.eventSequence);
  return page;
};

/** Immutable H0 rule facts may accompany a current authorized head. They
 * are not a current stock/capacity-remaining projection. Keep both bindings. */
function openingRunParameters(
  page: RegisteredOfficeBrowserState['runParametersPage'],
  head: Awaited<ReturnType<Driver['readHead']>>,
  binding: RegisteredOfficeBrowserStageInput,
) {
  assert(page, 'ACTUAL_ADOPTED_RUN_PARAMETERS_REQUIRED');
  assert.equal(page.dataset, 'industry-run-parameters');
  assert.equal(page.authority.readback.worldVersion, head.worldVersion);
  assert.equal(page.authority.readback.eventSequence, head.eventSequence);
  assert.equal(page.authority.identity.countryId, binding.countryId);
  assert.equal(page.authority.identity.officeId, 'INDUSTRY');
  assert.equal(page.authority.identity.authSubjectId, binding.authSubject);
  for (const key of [
    'worldId',
    'seedRef',
    'contentHash',
    'admissionRef',
  ] as const) {
    assert.equal(
      page.source[key],
      binding.readConfiguration.admittedWorldPins[key],
    );
    assert.equal(
      page.authority.readback[key],
      binding.readConfiguration.admittedWorldPins[key],
    );
  }
  assert.equal(page.source.countryId, binding.countryId);
  assert.equal(page.source.officeId, 'INDUSTRY');
  assert.equal(page.source.dataNature, 'ADMITTED_IMMUTABLE_OPENING_FACTS');
  for (const key of [
    'worldVersion',
    'eventSequence',
    'originWorldVersion',
    'originEventSequence',
  ])
    assert.equal(page.source[key], '0');
  const observed = row(page.source.observedHead);
  assert.equal(observed.worldVersion, head.worldVersion);
  assert.equal(observed.eventSequence, head.eventSequence);
  const pointer = row(page.source.sourcePointer);
  assert.equal(
    pointer.rowOrigin,
    'world_v2.postwar_industry_first_day_source.source_text',
  );
  assert.equal(pointer.rowBinding, 'sourceRef+sourceRawSha256');
  for (const key of ['sourceVersion', 'bindingVersion'])
    assert.match(text(page.source[key]), /^sha256:[a-f0-9]{64}$/u);
  const rows = page.rows.map(parseIndustryRunParameterRow);
  assert(rows.every((r) => r.countryId === binding.countryId));
  assert.equal(new Set(rows.map((r) => r.facilityId)).size, rows.length);
  return { page, rows };
}

export async function runRegisteredProgrammeTargetBrowserChain(input: {
  driver: Driver;
  browserInput: RegisteredOfficeBrowserStageInput;
  evidencePath: string;
  /** Recover saved programme and optional target originals. Only an absent
   * target original permits its first submission; unknown outcomes stop. */
  resumeEvidencePath?: string;
}) {
  const d = input.driver;
  assert.equal(input.browserInput.countryId, 'COUNTRY_02');
  assert(
    input.browserInput.browser && input.browserInput.application,
    'BORROWED_ACTUAL_BROWSER_AND_APPLICATION_REQUIRED',
  );
  let resumedProgramme: AuthenticatedOfficeCommandRequestDto | undefined;
  let resumedTarget: AuthenticatedOfficeCommandRequestDto | undefined;
  let resumeEvidenceSha256: string | undefined;
  if (input.resumeEvidencePath) {
    assert.notEqual(
      resolve(input.resumeEvidencePath),
      resolve(input.evidencePath),
    );
    const bytes = await readFile(input.resumeEvidencePath);
    assert(bytes.length <= 1048576, 'BOUNDED_SAVED_EVIDENCE_REQUIRED');
    resumeEvidenceSha256 = createHash('sha256').update(bytes).digest('hex');
    const previous = row(JSON.parse(bytes.toString('utf8')));
    assert.equal(
      previous.classification,
      'TEST_ONLY_ACTUAL_REGISTERED_DOM_PROGRAMME_AND_TARGET',
    );
    assert.equal(
      previous.scope,
      'ISOLATED_WORLD_ONLY_PENDING_TERMS_AND_TARGET_INTENT',
    );
    assert(
      Array.isArray(previous.originals) &&
        [1, 2].includes(previous.originals.length),
      'EXACT_PROGRAMME_AND_OPTIONAL_TARGET_ORIGINALS_REQUIRED',
    );
    const original = row(previous.originals[0]),
      request = row(original.request);
    assert.equal(request.commandType, 'CORE_SOCIAL_LABOUR_PROGRAMME_CREATE_V1');
    assert.equal(request.officeId, 'SOCIAL');
    assert.equal(request.countryId, input.browserInput.countryId);
    assert.equal(
      request.worldId,
      input.browserInput.readConfiguration.admittedWorldPins.worldId,
    );
    resumedProgramme =
      original as unknown as AuthenticatedOfficeCommandRequestDto;
    if (previous.originals.length === 2) {
      const target = row(previous.originals[1]),
        targetRequest = row(target.request);
      assert.equal(
        targetRequest.commandType,
        'CORE_INDUSTRY_UTILISATION_TARGET_SET_V1',
      );
      assert.equal(targetRequest.officeId, 'INDUSTRY');
      assert.equal(targetRequest.countryId, request.countryId);
      assert.equal(targetRequest.worldId, request.worldId);
      assert.notEqual(targetRequest.commandId, request.commandId);
      assert.notEqual(targetRequest.idempotencyKey, request.idempotencyKey);
      resumedTarget = target as unknown as AuthenticatedOfficeCommandRequestDto;
    }
  }
  const originals: AuthenticatedOfficeCommandRequestDto[] = [];
  const stages: Record<string, unknown>[] = [];
  const report: Record<string, unknown> = {
    classification: 'TEST_ONLY_ACTUAL_REGISTERED_DOM_PROGRAMME_AND_TARGET',
    scope: 'ISOLATED_WORLD_ONLY_PENDING_TERMS_AND_TARGET_INTENT',
    productionOrPolicyAdoption: false,
    syntheticResponses: false,
    newWorldOrClockStarted: false,
    status: 'IN_PROGRESS',
    originals,
    stages,
    resumeEvidencePath: input.resumeEvidencePath ?? null,
    resumeEvidenceSha256: resumeEvidenceSha256 ?? null,
  };
  await mkdir(dirname(input.evidencePath), { recursive: true });
  const save = () =>
    writeFile(input.evidencePath, JSON.stringify(report, null, 2) + '\n');
  // A previous uncertain original must be recovered by the owner, not replaced
  // by another invocation of this helper with fresh UI-generated identities.
  await writeFile(input.evidencePath, JSON.stringify(report, null, 2) + '\n', {
    flag: 'wx',
  });
  const browsers = await createRegisteredOfficeBrowserStages(
    input.browserInput,
  );
  function retainOriginal(original: AuthenticatedOfficeCommandRequestDto) {
    for (const list of [originals, d.originals]) {
      const prior = list.find(
        (o) => o.request.commandId === original.request.commandId,
      );
      if (prior)
        assert.deepEqual(prior, original, 'SAVED_ORIGINAL_IDENTITY_CONFLICT');
      else list.push(original);
    }
  }
  async function submitStaged(
    session: RegisteredOfficeBrowserSession,
    expectedType: string,
    validate: (dto: AuthenticatedOfficeCommandRequestDto) => void,
  ) {
    const page = pageOf(session),
      staged = await session.state();
    assert.equal(
      staged.status,
      'REVIEW_REQUIRED',
      staged.code ?? 'FORM_NOT_STAGED',
    );
    assert(staged.intent);
    const original = staged.intent;
    assert.equal(original.request.commandType, expectedType);
    assert.equal(original.request.countryId, 'COUNTRY_02');
    assert.equal(
      original.request.expectedWorldVersion,
      (await d.readHead()).worldVersion,
    );
    validate(original);
    await page.locator('[data-office-command-action="review"]').click();
    const reviewed = await session.state();
    assert.equal(reviewed.status, 'REVIEWED');
    assert.deepEqual(reviewed.intent, original);
    retainOriginal(original);
    stages.push({ stage: 'ORIGINAL_SAVED_BEFORE_CONFIRM', original });
    await save();
    const sent: unknown[] = [];
    const capture = (request: LiveRequest) => {
      if (
        request.method() === 'POST' &&
        new URL(request.url()).pathname === '/v1/office-command'
      )
        sent.push(request.postDataJSON());
    };
    page.on('request', capture);
    try {
      await page.locator('[data-office-command-action="confirm"]').click();
      await page.waitForFunction(
        'window.EconMindFixedOfficeProbe.state().status !== "SUBMITTING"',
      );
      let result = await session.state();
      if (result.status === 'UNKNOWN') {
        // Query exactly this original. A missing/unknown result stops the run.
        await page.locator('[data-office-command-action="recover"]').click();
        await page.waitForFunction(
          'window.EconMindFixedOfficeProbe.state().status !== "LOOKING_UP_FINAL"',
        );
        result = await session.state();
      }
      assert.equal(sent.length, 1, 'ONE_ORIGINAL_HTTP_SUBMISSION_REQUIRED');
      assert.deepEqual(sent[0], original);
      assert.equal(
        result.status,
        'QUEUE_ACK',
        result.code ?? 'ACTUAL_QUEUE_ACK_REQUIRED',
      );
      const actual = await d.consume(original.request.commandId, {
        countryId: 'COUNTRY_02',
        commandType: expectedType,
        financialBatches: 0,
        financialLegs: 0,
        inventoryPostings: 0,
      });
      await session.recoverFinal({
        expectedHead: await d.readHead(),
        requireCurrent: true,
      });
      await session.reloadRestore(original, { recover: false });
      const restored = await session.recoverFinal({
        expectedHead: await d.readHead(),
        requireCurrent: true,
      });
      assert.equal(restored.receipt?.commandId, original.request.commandId);
      assert.equal(sent.length, 1, 'FINAL_AND_F5_MUST_NOT_RESUBMIT');
      stages.push({
        stage: 'ACTUAL_FINAL_F5_ORIGINAL_RECOVERY',
        actual,
        commandId: original.request.commandId,
        actualHttpSubmissions: sent.length,
      });
      await save();
      return { original, restored };
    } finally {
      page.off('request', capture);
    }
  }
  // Preserve both retained originals even if the first recovery fails; a later
  // continuation must never mistake an omitted target for permission to submit.
  if (resumedProgramme) retainOriginal(resumedProgramme);
  if (resumedTarget) retainOriginal(resumedTarget);
  await save();
  try {
    const social = await browsers.open('social');
    try {
      const state = await social.read({ expectedHead: await d.readHead() });
      const programmePage = current(
        state.socialProgrammesPage,
        await d.readHead(),
      );
      const context = row(programmePage.source.currentSocialProgrammeContext);
      assert(
        Array.isArray(context.locationIds) && context.locationIds.length > 0,
      );
      const locationId = resumedProgramme
          ? text(row(resumedProgramme.request.payload).locationId)
          : text(context.locationIds[0]),
        currency = text(context.localCurrency);
      assert(context.locationIds.includes(locationId));
      const validateProgramme = (dto: AuthenticatedOfficeCommandRequestDto) => {
        const terms = row(dto.request.payload);
        assert.equal(terms.kind, 'RELOCATION_SUPPORT');
        assert.equal(terms.locationId, locationId);
        assert.equal(terms.participants, '1');
        assert.deepEqual(terms.benefit, { amount: '0', currency });
      };
      const page = pageOf(social);
      let original: AuthenticatedOfficeCommandRequestDto;
      let restored: RegisteredOfficeBrowserState;
      if (resumedProgramme) {
        original = resumedProgramme;
        validateProgramme(original);
        retainOriginal(original);
        stages.push({
          stage: 'SAVED_PROGRAMME_ORIGINAL_RETAINED_FOR_RECOVERY',
          original,
        });
        await save();
        await d.recover(original, { duplicateProbe: false });
        await social.reloadRestore(original, { recover: false });
        restored = await social.recoverFinal({
          expectedHead: await d.readHead(),
          requireCurrent: true,
        });
        assert.equal(restored.receipt?.commandId, original.request.commandId);
        stages.push({
          stage: 'EXISTING_PROGRAMME_FINAL_RECOVERED_NO_RESUBMISSION',
          commandId: original.request.commandId,
        });
        await save();
      } else {
        const selector = '[data-social-programme-kind="RELOCATION_SUPPORT"]';
        await page
          .locator(selector + ' [name="locationId"]')
          .selectOption(locationId);
        await page.locator(selector + ' [name="participants"]').fill('1');
        await page.locator(selector + ' [name="benefit"]').fill('0');
        await page.locator(selector + ' button[type="submit"]').click();
        ({ original, restored } = await submitStaged(
          social,
          'CORE_SOCIAL_LABOUR_PROGRAMME_CREATE_V1',
          validateProgramme,
        ));
      }
      let visible = restored;
      let found: Record<string, unknown> | undefined;
      for (let pages = 0; pages < 64; pages++) {
        const p = current(visible.socialProgrammesPage, await d.readHead());
        found = p.rows.find((r) => r.commandId === original.request.commandId);
        if (found || p.page.nextOffset === null) break;
        await page
          .locator('[data-office-command-action="social-next-programmes"]')
          .click();
        await page.waitForFunction(
          'window.EconMindFixedOfficeProbe.state().canRead',
        );
        visible = await social.state();
      }
      assert(found, 'COMMITTED_PROGRAMME_MUST_BE_VISIBLE_AFTER_F5');
      assert.equal(found.status, 'PENDING_REVIEW');
      assert.equal(
        found.classification,
        'TERMS_ONLY_NOT_ELIGIBILITY_APPROVAL_FUNDING_OR_SERVICE',
      );
      assert.deepEqual(found.terms, original.request.payload);
      const programmeText = await page
        .locator('[data-social-programme-form]')
        .textContent();
      assert(programmeText !== null);
      assert(programmeText.includes(text(found.programmeId)));
      assert(programmeText.includes('待审批'));
      stages.push({
        stage: 'PROGRAMME_PENDING_TERMS_DOM_F5_READBACK',
        row: found,
      });
      await save();
    } finally {
      await social.close();
    }
    const industry = await browsers.open('industry');
    try {
      const state = await industry.read({ expectedHead: await d.readHead() });
      const parameters = openingRunParameters(
        state.runParametersPage,
        await d.readHead(),
        input.browserInput,
      );
      stages.push({
        stage: 'IMMUTABLE_ADOPTED_PARAMETERS_AT_CURRENT_AUTHORIZED_HEAD',
        source: parameters.page.source,
        authority: parameters.page.authority,
      });
      await save();
      const before = current(state.targetPage, await d.readHead());
      assert.equal(
        before.page.nextOffset,
        null,
        'COMPLETE_TARGET_PAGE_REQUIRED',
      );
      const savedTargetTerms = resumedTarget
        ? row(resumedTarget.request.payload)
        : null;
      const facility = parameters.rows.find(
        (r) =>
          r.capacityPerSimDay !== undefined &&
          (!savedTargetTerms || r.facilityId === savedTargetTerms.facilityId),
      );
      assert(facility, 'ACTUAL_SOURCE_CAPACITY_FACILITY_REQUIRED');
      const facilityId = text(facility.facilityId);
      if (!resumedTarget)
        assert(
          !before.rows.some((r) => r.facilityId === facilityId),
          'TEST_REQUIRES_UNSET_TARGET_NOT_OVERWRITE',
        );
      const starts = text(
          savedTargetTerms?.startsAtSimTime ?? facility.windowStartsAtSimTime,
        ),
        ends = text(
          savedTargetTerms?.endsAtSimTime ?? facility.windowEndsAtSimTime,
        );
      assert(
        BigInt(starts) >= 0n &&
          BigInt(ends) > BigInt(starts) &&
          BigInt(ends) <= 86400000n &&
          BigInt(starts) >= BigInt(facility.windowStartsAtSimTime) &&
          BigInt(ends) <= BigInt(facility.windowEndsAtSimTime),
      );
      const runsBefore = current(state.committedRunsPage, await d.readHead());
      assert.equal(
        runsBefore.page.nextOffset,
        null,
        'COMPLETE_RUN_PAGE_REQUIRED',
      );
      const page = pageOf(industry);
      const validateTarget = (dto: AuthenticatedOfficeCommandRequestDto) => {
        const terms = row(dto.request.payload);
        assert.equal(terms.facilityId, facilityId);
        assert.equal(terms.targetPercent, '0');
        assert.equal(terms.startsAtSimTime, starts);
        assert.equal(terms.endsAtSimTime, ends);
        assert.equal(terms.sourceRef, facility.sourceRef);
        assert.equal(terms.sourceRawSha256, facility.sourceRawSha256);
        assert.equal(terms.policyVersion, facility.policyVersion);
      };
      let original: AuthenticatedOfficeCommandRequestDto;
      let restored: RegisteredOfficeBrowserState;
      if (resumedTarget) {
        original = resumedTarget;
        validateTarget(original);
        const headBeforeRecovery = await d.readHead();
        await d.recover(original, { duplicateProbe: false });
        await industry.reloadRestore(original, { recover: false });
        restored = await industry.recoverFinal({
          expectedHead: headBeforeRecovery,
          requireCurrent: true,
        });
        assert.equal(restored.receipt?.commandId, original.request.commandId);
        assert.deepEqual(
          await d.readHead(),
          headBeforeRecovery,
          'TARGET_RECOVERY_MUST_NOT_ADVANCE_HEAD',
        );
        stages.push({
          stage: 'EXISTING_TARGET_FINAL_RECOVERED_NO_RESUBMISSION',
          commandId: original.request.commandId,
        });
        await save();
      } else {
        await page
          .locator('[data-industry-run-field="facilityId"]')
          .selectOption(facilityId);
        await page
          .locator('[data-industry-run-field="startsAtSimTime"]')
          .fill(starts);
        await page
          .locator('[data-industry-run-field="endsAtSimTime"]')
          .fill(ends);
        await page
          .locator('[data-industry-run-field="utilisationPercent"]')
          .fill('0');
        await page.locator('[data-industry-run-action="stage-target"]').click();
        ({ original, restored } = await submitStaged(
          industry,
          'CORE_INDUSTRY_UTILISATION_TARGET_SET_V1',
          validateTarget,
        ));
      }
      const targets = current(restored.targetPage, await d.readHead());
      const target = targets.rows.find(
        (r) => r.commandId === original.request.commandId,
      );
      assert(target, 'EXPLICIT_ZERO_TARGET_MUST_BE_VISIBLE_AFTER_F5');
      assert.equal(target.targetPercent, '0');
      assert.equal(target.facilityId, facilityId);
      assert.equal(target.startsAtSimTime, starts);
      assert.equal(target.endsAtSimTime, ends);
      assert.equal(target.sourceRef, facility.sourceRef);
      assert.equal(target.sourceRawSha256, facility.sourceRawSha256);
      assert.deepEqual(
        current(restored.committedRunsPage, await d.readHead()).rows,
        runsBefore.rows,
        'TARGET_MUST_NOT_CREATE_OR_CHANGE_RUN',
      );
      assert.match(
        (await page
          .locator('[data-industry-utilisation-targets]')
          .textContent()) ?? '',
        /0%/u,
      );
      stages.push({
        stage: resumedTarget
          ? 'TARGET_EXISTING_ZERO_F5_CURRENT_RUNS_UNCHANGED'
          : 'TARGET_UNSET_TO_EXPLICIT_ZERO_F5_NO_RUN',
        target,
      });
      await save();
    } finally {
      await industry.close();
    }
    report.status = 'PASSED';
    report.head = await d.readHead();
    await save();
    return report;
  } catch (error) {
    report.status = 'FAILED_SAVED_ORIGINALS_REQUIRE_RECOVERY_BEFORE_RETRY';
    report.error = wireColdError(error);
    await save();
    throw error;
  } finally {
    await browsers.close();
  }
}
