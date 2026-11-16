/** Isolated acceptance only: borrow the existing registered Node and C2 seat.
 * No source registration, programme creation, world/Clock startup or old command
 * resubmission. Actual group application is not eligibility, admission or pay. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Pool } from 'pg';
import type { AuthenticatedOfficeCommandRequestDto } from '@econmind/core/authenticated-office-command-contract';
import {
  parseSocialProgrammeRowDto,
  parseSocialProgrammeApplicationRowDto,
  parseSocialProgrammeApplicationIntentDto,
} from '@econmind/core/social-labour-programme-public-contract';
import {
  createRegisteredOfficeBrowserStages,
  type RegisteredOfficeBrowserStageInput,
  type RegisteredOfficeBrowserSession,
} from '../../tools/office-connection/registered-office-browser-stages.mjs';
import {
  type createRegisteredFinalDriver,
  registeredFinalRecord as row,
} from './postwar-registered-final-driver.js';
import { wireColdError } from '../../tools/office-connection/native-mixed-cold-errors.mjs';
type Driver = ReturnType<typeof createRegisteredFinalDriver>;
type Dataset =
  'social-labour-programmes' | 'social-labour-programme-applications';
type BrowserInput = Omit<
  RegisteredOfficeBrowserStageInput,
  'actualOrigin' | 'evidenceDir'
>;
interface BrowserPage {
  locator(selector: string): {
    selectOption(value: string): Promise<unknown>;
    click(): Promise<void>;
    textContent(): Promise<string | null>;
  };
  waitForFunction(expression: string): Promise<unknown>;
  on(event: 'request', listener: (request: BrowserRequest) => void): void;
  off(event: 'request', listener: (request: BrowserRequest) => void): void;
}
interface BrowserRequest {
  url(): string;
  method(): string;
  postDataJSON(): unknown;
}
const text = (v: unknown) => {
  assert.equal(typeof v, 'string');
  return v as string;
};
async function pages(d: Driver, dataset: Dataset, worldId: string) {
  const head = await d.readHead(),
    output: Record<string, unknown>[] = [];
  let offset = 0,
    version: string | undefined,
    binding: string | undefined;
  for (let count = 0; count < 64; count++) {
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
      'ACTUAL_AUTHORIZED_SOCIAL_APPLICATION_READ_REQUIRED:' +
        JSON.stringify(response.body),
    );
    assert.equal(response.body.ok, true);
    const source = row(response.body.source),
      page = row(response.body.page),
      authority = row(response.body.authority);
    assert.equal(source.worldId, worldId);
    assert.equal(row(authority.identity).worldId, worldId);
    assert.equal(row(authority.readback).worldId, worldId);
    assert.equal(row(authority.identity).countryId, 'COUNTRY_02');
    assert.equal(row(authority.identity).officeId, 'SOCIAL');
    for (const key of ['worldVersion', 'eventSequence'] as const) {
      assert.equal(source[key], head[key]);
      assert.equal(row(authority.readback)[key], head[key]);
    }
    if (version) {
      assert.equal(source.sourceVersion, version);
      assert.equal(source.bindingVersion, binding);
    }
    version = text(source.sourceVersion);
    binding = text(source.bindingVersion);
    assert(Array.isArray(response.body.rows));
    assert.equal(page.offset, offset);
    assert.equal(page.returned, response.body.rows.length);
    for (const value of response.body.rows) {
      const parsed =
        dataset === 'social-labour-programmes'
          ? parseSocialProgrammeRowDto(value)
          : parseSocialProgrammeApplicationRowDto(value);
      assert.equal(parsed.countryId, 'COUNTRY_02');
    }
    output.push(response.body);
    if (page.nextOffset === null) {
      assert.equal(page.total, offset + response.body.rows.length);
      assert.deepEqual(await d.readHead(), head);
      return output;
    }
    assert.equal(page.nextOffset, offset + response.body.rows.length);
    assert(
      Number.isSafeInteger(page.nextOffset) && Number(page.nextOffset) > offset,
    );
    offset = Number(page.nextOffset);
  }
  throw Error('BOUNDED_APPLICATION_PAGE_SERIES_EXCEEDED');
}

export async function runRetainedSocialApplication(input: {
  driver: Driver;
  installer: Pick<Pool, 'query'>;
  worldId: string;
  evidencePath: string;
  ledgerSnapshot: () => Promise<{ sha256: string; facts: unknown }>;
  /** Without this configuration only authenticated HTTP/FIFO/FINAL is proved.
   * With it the helper owns/cleans UI Chromium unless explicitly borrowed. */
  browser?: BrowserInput;
}) {
  const d = input.driver,
    report: Record<string, unknown> = {
      classification:
        'ISOLATED_CURRENT_C2_WHOLE_GROUP_APPLICATION_NOT_APPROVAL_OR_PAY',
      status: 'IN_PROGRESS',
      browser: input.browser ? 'NOT_RUN' : 'NOT_CONFIGURED_API_ONLY',
      newWorldOrClockStarted: false,
      oldCommandsResubmitted: 0,
    };
  await mkdir(dirname(input.evidencePath), { recursive: true });
  await writeFile(input.evidencePath, JSON.stringify(report, null, 2) + '\n', {
    flag: 'wx',
  });
  const save = () =>
    writeFile(input.evidencePath, JSON.stringify(report, null, 2) + '\n');
  let manager:
    Awaited<ReturnType<typeof createRegisteredOfficeBrowserStages>> | undefined;
  let session: RegisteredOfficeBrowserSession | undefined;
  let original: AuthenticatedOfficeCommandRequestDto | undefined;
  // Inspector-only hashes supplement, never replace, authorised source/API reads.
  // The Social application field may change; all other cached domain contents
  // (including labour/population/budget/C10) and actual journals must not.
  const domainHashes = async () =>
    (
      await input.installer.query(
        `select materialization_key,encode(sha256(convert_to((case when materialization_key=$2 then canonical_payload::jsonb-'programmeApplications' else canonical_payload::jsonb end)::text,'UTF8')),'hex')content_hash from world_v2.current_materialization where world_id=$1 order by materialization_key`,
        [input.worldId, 'SOCIAL_EMPLOYMENT_SERVICE_COUNTRY_02'],
      )
    ).rows;
  try {
    const beforeLedger = await input.ledgerSnapshot(),
      beforeDomains = await domainHashes();
    report.before = { ledger: beforeLedger, domainHashes: beforeDomains };
    const programmes = await pages(
      d,
      'social-labour-programmes',
      input.worldId,
    );
    const applications = await pages(
      d,
      'social-labour-programme-applications',
      input.worldId,
    );
    const existing = applications.flatMap((p) =>
      (p.rows as unknown[]).map(parseSocialProgrammeApplicationRowDto),
    );
    let selected:
      | {
          programme: ReturnType<typeof parseSocialProgrammeRowDto>;
          applicant: ReturnType<
            typeof parseSocialProgrammeApplicationIntentDto
          >['applicant'];
          personCount: string;
          pageOffset: number;
          groupIndex: number;
        }
      | undefined;
    for (const p of programmes) {
      const context = row(row(p.source).currentSocialProgrammeContext);
      assert(Array.isArray(context.applicantGroups));
      assert(context.applicantGroups.length <= 1000);
      for (const value of p.rows as unknown[]) {
        const programme = parseSocialProgrammeRowDto(value);
        for (const [groupIndex, value] of context.applicantGroups.entries()) {
          const group = row(value);
          const applicant = parseSocialProgrammeApplicationIntentDto({
            schemaVersion: 'social-labour-programme-apply-v1',
            programmeId: programme.programmeId,
            programmeCommandFingerprint: programme.commandFingerprint,
            applicationId: 'SELECTION_CHECK_ONLY',
            applicant: {
              locationId: group.locationId,
              skill: group.skill,
              status: group.status,
            },
          }).applicant;
          assert.match(text(group.personCount), /^[1-9][0-9]{0,77}$/u);
          // Avoid a prior potentially overlapping same-location/skill cohort.
          if (
            existing.some(
              (a) =>
                a.programmeId === programme.programmeId &&
                a.applicant.locationId === applicant.locationId &&
                a.applicant.skill === applicant.skill,
            )
          )
            continue;
          selected = {
            programme,
            applicant,
            personCount: text(group.personCount),
            pageOffset: Number(row(p.page).offset),
            groupIndex,
          };
          break;
        }
        if (selected) break;
      }
      if (selected) break;
    }
    if (!selected) {
      report.status = programmes.some((p) => (p.rows as unknown[]).length)
        ? 'BLOCKED_NO_ACTUAL_UNUSED_CANONICAL_GROUP'
        : 'BLOCKED_NO_ACTUAL_PROGRAMME';
      report.after = await input.ledgerSnapshot();
      assert.deepEqual(report.after, beforeLedger);
      assert.deepEqual(await domainHashes(), beforeDomains);
      await save();
      return report;
    }
    report.selection = selected;
    const payload = (applicationId: string) => ({
      schemaVersion: 'social-labour-programme-apply-v1',
      programmeId: selected!.programme.programmeId,
      programmeCommandFingerprint: selected!.programme.commandFingerprint,
      applicationId,
      applicant: selected!.applicant,
    });
    await save();
    if (input.browser) {
      assert.equal(input.browser.countryId, 'COUNTRY_02');
      manager = await createRegisteredOfficeBrowserStages({
        ...input.browser,
        actualOrigin: d.origin(),
        evidenceDir: join(
          dirname(input.evidencePath),
          'social-application-browser',
        ),
      });
      session = await manager.open('social');
      let state = await session.read({ expectedHead: await d.readHead() });
      const page = session.page as BrowserPage;
      for (let i = 0; i < 64; i++) {
        const visible = row(row(state).socialProgrammesPage);
        if (row(visible.page).offset === selected.pageOffset) break;
        assert(row(visible.page).nextOffset !== null);
        await page
          .locator('[data-office-command-action="social-next-programmes"]')
          .click();
        await page.waitForFunction(
          'window.EconMindFixedOfficeProbe.state().canRead',
        );
        state = await session.state();
      }
      const visible = row(row(state).socialProgrammesPage);
      assert.equal(row(visible.page).offset, selected.pageOffset);
      const selector =
        '[data-social-programme-application="' +
        selected.programme.programmeId +
        '"]';
      const formText = await page.locator(selector).textContent();
      assert(formText?.includes(selected.personCount + ' 人'));
      await page
        .locator(selector + ' select')
        .selectOption(String(selected.groupIndex));
      await page.locator(selector + ' button[type="submit"]').click();
      state = await session.state();
      assert.equal(
        state.status,
        'REVIEW_REQUIRED',
        state.code ?? 'APPLICATION_NOT_STAGED',
      );
      assert(state.intent);
      original = state.intent;
      assert.deepEqual(
        original.request.payload,
        payload(text(row(original.request.payload).applicationId)),
      );
      assert.equal(
        original.request.commandType,
        'CORE_SOCIAL_LABOUR_PROGRAMME_APPLY_V1',
      );
      assert.equal(original.request.countryId, 'COUNTRY_02');
      assert.equal(original.request.worldId, input.worldId);
      assert.equal(
        original.request.expectedWorldVersion,
        (await d.readHead()).worldVersion,
      );
      await page.locator('[data-office-command-action="review"]').click();
      assert.equal((await session.state()).status, 'REVIEWED');
      d.originals.push(original);
      report.original = original;
      await save();
      const sent: unknown[] = [];
      const capture = (request: BrowserRequest) => {
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
        state = await session.state();
        if (state.status === 'UNKNOWN') {
          await page.locator('[data-office-command-action="recover"]').click();
          await page.waitForFunction(
            'window.EconMindFixedOfficeProbe.state().status !== "LOOKING_UP_FINAL"',
          );
          state = await session.state();
        }
        assert.equal(sent.length, 1, 'EXACTLY_ONE_APPLICATION_HTTP_SUBMISSION');
        assert.deepEqual(sent[0], original);
        assert.equal(
          state.status,
          'QUEUE_ACK',
          state.code ?? 'ACTUAL_QUEUE_ACK_REQUIRED',
        );
        report.actual = await d.consume(original.request.commandId, {
          commandType: original.request.commandType,
          countryId: 'COUNTRY_02',
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
        assert.equal(sent.length, 1, 'F5_FINAL_RECOVERY_MUST_NOT_RESUBMIT');
        report.browser = {
          status: 'ACTUAL_SELECT_REVIEW_CONFIRM_FINAL_AND_F5_RECOVERY',
          actualHttpSubmissions: sent.length,
          evidence: manager.evidence,
        };
      } finally {
        page.off('request', capture);
      }
    } else {
      const id =
        'SOCIAL_APPLICATION_' + randomUUID().replaceAll('-', '').toUpperCase();
      original = await d.makeRequest({
        countryId: 'COUNTRY_02',
        officeId: 'SOCIAL',
        commandType: 'CORE_SOCIAL_LABOUR_PROGRAMME_APPLY_V1',
        commandId: id,
        idempotencyKey: id + '_KEY',
        payload: payload(id),
      });
      report.original = original;
      await save();
      await d.submit(original);
      report.actual = await d.consume(original.request.commandId, {
        commandType: original.request.commandType,
        countryId: 'COUNTRY_02',
        financialBatches: 0,
        financialLegs: 0,
        inventoryPostings: 0,
      });
    }
    assert(original);
    report.originalRecovery = await d.recover(original, {
      duplicateProbe: false,
    });
    const afterPages = await pages(
      d,
      'social-labour-programme-applications',
      input.worldId,
    );
    const rows = afterPages.flatMap((p) =>
      (p.rows as unknown[]).map(parseSocialProgrammeApplicationRowDto),
    );
    const applied = rows.filter(
      (r) => r.commandId === original!.request.commandId,
    );
    assert.equal(applied.length, 1);
    assert.equal(rows.length, existing.length + 1);
    for (const prior of existing)
      assert.deepEqual(
        rows.find((r) => r.applicationId === prior.applicationId),
        prior,
        'PRIOR_APPLICATION_MUST_REMAIN_IDENTICAL',
      );
    assert.equal(applied[0]!.personCount, selected.personCount);
    assert.equal(
      applied[0]!.programmeCommandFingerprint,
      selected.programme.commandFingerprint,
    );
    assert.deepEqual(applied[0]!.applicant, selected.applicant);
    assert.equal(applied[0]!.status, 'APPLIED');
    const committedEvents = (
      await input.installer.query(
        "select event_type,canonical_payload::jsonb->'result' result from world_v2.authoritative_event where world_id=$1 and causation_command_id=$2 order by event_sequence",
        [input.worldId, original.request.commandId],
      )
    ).rows;
    assert.equal(committedEvents.length, 1);
    assert.equal(
      committedEvents[0]!.event_type,
      'SOCIAL_LABOUR_PROGRAMME_APPLIED_V1',
    );
    assert.deepEqual(committedEvents[0]!.result, {
      programmeId: selected.programme.programmeId,
      applicationId: row(original.request.payload).applicationId,
      personCount: selected.personCount,
      status: 'APPLIED',
      classification:
        'APPLICATION_ONLY_NOT_ELIGIBILITY_APPROVAL_FUNDING_OR_SERVICE',
    });
    report.committedEvents = committedEvents;
    report.application = applied[0];
    report.applicationPages = afterPages;
    const afterLedger = await input.ledgerSnapshot(),
      afterDomains = await domainHashes();
    assert.deepEqual(
      afterDomains,
      beforeDomains,
      'APPLICATION_MUST_NOT_CHANGE_LABOUR_POPULATION_BUDGET_OR_OTHER_DOMAIN_CONTENTS',
    );
    for (const key of ['financial', 'inventory'])
      assert.deepEqual(
        row(afterLedger.facts)[key],
        row(beforeLedger.facts)[key],
        'APPLICATION_MUST_NOT_PAY_OR_TRANSFER_' + key,
      );
    for (const key of ['commands', 'receipts', 'events']) {
      const before = row(beforeLedger.facts)[key],
        after = row(afterLedger.facts)[key];
      assert(Array.isArray(before) && Array.isArray(after));
      assert.equal(after.length, before.length + 1);
      for (const retained of before)
        assert(
          after.some((v) => JSON.stringify(v) === JSON.stringify(retained)),
          'PRIOR_HISTORY_RETAINED_' + key,
        );
    }
    report.after = { ledger: afterLedger, domainHashes: afterDomains };
    report.status =
      'APPLIED_AND_ORIGINAL_RECOVERED_NO_ELIGIBILITY_OR_FINANCIAL_EFFECT';
    report.secondNodeRecovery =
      'CALLER_MUST_RECOVER_DRIVER_ORIGINALS_AFTER_RESTART';
    await save();
    return report;
  } catch (error) {
    report.status = 'FAILED_OR_REAL_CONSTRAINT_BLOCKED';
    report.error = wireColdError(error);
    if (original) {
      try {
        report.recoveryAfterFailure = await d.recover(original, {
          duplicateProbe: false,
        });
      } catch (recoveryError) {
        report.recoveryAfterFailure = wireColdError(recoveryError);
      }
    }
    await save();
    throw error;
  } finally {
    try {
      await session?.close();
    } finally {
      await manager?.close();
    }
  }
}

/** Call after the caller's second Node launch. Recover/read only; no submission. */
export async function recoverRetainedSocialApplication(input: {
  driver: Driver;
  worldId: string;
  prior: Record<string, unknown>;
}) {
  if (
    input.prior.status !==
    'APPLIED_AND_ORIGINAL_RECOVERED_NO_ELIGIBILITY_OR_FINANCIAL_EFFECT'
  )
    return {
      status: 'NOT_RUN_NO_PREVIOUS_APPLIED_RESULT',
      priorStatus: input.prior.status,
    };
  const original = input.prior.original as AuthenticatedOfficeCommandRequestDto;
  assert.equal(original.request.worldId, input.worldId);
  assert.equal(original.request.countryId, 'COUNTRY_02');
  assert.equal(
    original.request.commandType,
    'CORE_SOCIAL_LABOUR_PROGRAMME_APPLY_V1',
  );
  const head = await input.driver.readHead();
  const recovered = await input.driver.recover(original, {
    duplicateProbe: false,
  });
  const readback = await pages(
    input.driver,
    'social-labour-programme-applications',
    input.worldId,
  );
  const matched = readback
    .flatMap((p) =>
      (p.rows as unknown[]).map(parseSocialProgrammeApplicationRowDto),
    )
    .filter((r) => r.commandId === original.request.commandId);
  assert.deepEqual(matched, [input.prior.application]);
  assert.deepEqual(await input.driver.readHead(), head);
  return {
    status: 'SECOND_NODE_ORIGINAL_FINAL_AND_AUTHORIZED_APPLICATION_READBACK',
    recovered,
    application: matched[0],
    head,
  };
}
