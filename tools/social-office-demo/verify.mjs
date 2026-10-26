/** Actual fixed-host HTTP acceptance. Unit results are never substituted for this run. */
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { canonicalSerialize } from '@econmind/core';
import { startSocialOfficeDemo } from './run.mjs';

const repository = fileURLToPath(new URL('../..', import.meta.url));
const sha = (s) => createHash('sha256').update(s).digest('hex');
export async function verifySocialOfficeDemo() {
  if (arguments.length !== 0)
    throw Error(
      'Fixed actual acceptance only; no supplied result or host overrides',
    );
  const directory = path.join(
    repository,
    'node_modules/.cache/g-social-office-demo',
    `acceptance-${randomUUID()}`,
  );
  await mkdir(directory, { recursive: true });
  const evidence = [],
    assertions = [];
  let host,
    authorization,
    finalProjection = null,
    primaryError = null,
    cleanup = null;
  const check = (id, condition) => {
    assert.equal(condition, true, id);
    assertions.push({ id, status: 'PASS' });
  };
  async function http(route, method = 'GET', body = null, extra = {}) {
    const headers = {
      Accept: 'application/json',
      Origin: host.origin,
      ...(authorization ? { Authorization: authorization } : {}),
      ...(body === null ? {} : { 'Content-Type': 'application/json' }),
      ...extra,
    };
    const response = await fetch(
      `${host.origin}/isolated/v1/social-office/${route}`,
      {
        method,
        headers,
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(20000),
        ...(body === null ? {} : { body: JSON.stringify(body) }),
      },
    );
    const raw = await response.text();
    assert.ok(raw.length <= 262144, 'bounded actual response');
    const value = JSON.parse(raw);
    // Session bearer and all authorization headers are deliberately absent.
    evidence.push({
      route,
      method,
      request: body,
      status: response.status,
      response:
        route === 'session'
          ? { schemaVersion: value.schemaVersion, authorization: 'REDACTED' }
          : value,
    });
    return { status: response.status, value };
  }
  async function projection() {
    const response = await http('projection');
    assert.equal(response.status, 200, 'actual authorized projection');
    check(
      `projection-${evidence.length}-scope`,
      response.value.sourceClass === 'SIMULATED_OPENING' &&
        response.value.sourceAdmitted === false &&
        response.value.worldId === 'WORLD_SOCIAL_SINGLE_DEMO_V1' &&
        response.value.countryId === 'COUNTRY_01',
    );
    return response.value;
  }
  async function command(action) {
    const before = await projection(),
      requestId = randomUUID();
    let response = await http('command', 'POST', {
      requestId,
      action,
      expectedWorldVersion: before.worldVersion,
    });
    assert.ok(
      response.status === 200 || response.status === 202,
      `actual ${action} intake`,
    );
    for (
      let n = 0;
      n < 30 && !['FINAL', 'REJECTED'].includes(response.value.status);
      n++
    ) {
      await delay(200);
      response = await http(`receipt?requestId=${requestId}`);
      assert.equal(response.status, 200, 'same original receipt recovery');
      assert.equal(
        response.value.requestId,
        requestId,
        'original request retained',
      );
    }
    assert.ok(
      ['FINAL', 'REJECTED'].includes(response.value.status),
      'bounded original outcome confirmed',
    );
    return {
      requestId,
      receipt: response.value,
      before,
      after: await projection(),
    };
  }
  try {
    host = await startSocialOfficeDemo();
    const session = await http('session', 'POST', {});
    assert.equal(session.status, 200, 'real isolated signed session');
    assert.ok(
      typeof session.value.authorization === 'string' &&
        session.value.authorization.startsWith('Bearer '),
      'actual session available',
    );
    authorization = session.value.authorization;
    const initial = await projection();
    check(
      'opening-actual-common-population',
      initial.labour.total === '24' &&
        initial.labour.employed === '6' &&
        initial.labour.student === '5' &&
        initial.labour.searching === '13',
    );
    check(
      'opening-actual-course-obligation',
      initial.college.budgetCommitted === '150' &&
        initial.college.budgetRemaining === '150',
    );
    check(
      'opening-actual-stock-and-backlog',
      initial.clinic.medicineAvailable === '5' &&
        initial.clinic.backlog === '4',
    );
    const forbidden = await http('command', 'POST', {
      requestId: randomUUID(),
      action: 'MATCH',
      expectedWorldVersion: initial.worldVersion,
    });
    check('manual-http-match-refused', forbidden.status === 400);
    const injected = await http('command', 'POST', {
      requestId: randomUUID(),
      action: 'PLAN',
      expectedWorldVersion: initial.worldVersion,
      simTime: '86400000',
    });
    check('caller-time-refused', injected.status === 400);
    const afterRefusals = await projection();
    check(
      'wire-refusals-have-no-world-effects',
      canonicalSerialize(afterRefusals) === canonicalSerialize(initial),
    );
    const plan = await command('PLAN');
    check(
      'plan-durable-receipt',
      plan.receipt.status === 'FINAL' &&
        plan.after.employment.planState === 'PENDING' &&
        plan.after.employment.freeServiceSlots === '5',
    );
    const early = await command('GRADUATE_OLD');
    check(
      'early-graduation-durable-refusal',
      early.receipt.status === 'REJECTED' &&
        early.after.college.graduates === '0' &&
        early.after.labour.student === '5',
    );
    const admitted = await command('ADMIT');
    check(
      'admission-actual-two',
      admitted.receipt.status === 'FINAL' &&
        admitted.after.college.students === '5' &&
        admitted.after.college.budgetCommitted === '250' &&
        admitted.after.college.budgetRemaining === '50',
    );
    const served = await command('SERVE');
    check(
      'clinic-actual-bottleneck-result',
      served.receipt.status === 'FINAL' &&
        served.after.clinic.served === '5' &&
        served.after.clinic.backlog === '9' &&
        served.after.clinic.medicineAvailable === '0' &&
        served.after.clinic.budgetCommitted === '200',
    );
    const duplicate = await http('command', 'POST', {
      requestId: served.requestId,
      action: 'SERVE',
      expectedWorldVersion: served.before.worldVersion,
    });
    check(
      'duplicate-post-returns-original-final',
      duplicate.status === 200 &&
        duplicate.value.status === 'FINAL' &&
        duplicate.value.commandId === served.receipt.commandId &&
        duplicate.value.worldVersion === served.receipt.worldVersion,
    );
    const afterDuplicate = await projection();
    check(
      'duplicate-post-has-no-second-economic-effect',
      canonicalSerialize(afterDuplicate) === canonicalSerialize(served.after),
    );
    const day1 = await host.advanceToNextPreset();
    evidence.push({ privateStep: 'advance', result: day1 });
    check('actual-preset1-published', day1.dayIndex === '1');
    let automatic = await host.processDueBoundary();
    evidence.push({ privateStep: 'automatic', result: automatic });
    for (let n = 0; n < 30 && automatic.status !== 'FINAL'; n++) {
      assert.notEqual(
        automatic.status,
        'NO_DUE_PLAN',
        'accepted automatic identity must not disappear',
      );
      await delay(200);
      const previous = automatic;
      automatic = await host.processDueBoundary();
      evidence.push({
        privateStep: 'recover-automatic-original',
        result: automatic,
      });
      if (automatic.status !== 'FINAL' && previous.commandId)
        assert.equal(
          automatic.commandId,
          previous.commandId,
          'automatic original identity retained',
        );
    }
    check(
      'independent-automatic-final',
      automatic.status === 'FINAL' && automatic.receipt.outcome === 'COMMITTED',
    );
    const matched = await projection();
    check(
      'actual-match-and-sole-labour',
      matched.employment.planState === 'SETTLED' &&
        matched.employment.matched === '1' &&
        matched.employment.vacancies === '0' &&
        matched.employment.freeServiceSlots === '5' &&
        matched.labour.employed === '7' &&
        matched.labour.total === '24',
    );
    const day10 = await host.advanceToNextPreset();
    evidence.push({ privateStep: 'advance', result: day10 });
    check('actual-preset10-published', day10.dayIndex === '10');
    const graduate = await command('GRADUATE_OLD');
    check(
      'old-cohort-real-transition',
      graduate.receipt.status === 'FINAL' &&
        graduate.after.college.graduates === '1' &&
        graduate.after.labour.student === '4' &&
        graduate.after.labour.searching === '13' &&
        graduate.after.labour.low === '11' &&
        graduate.after.labour.medium === '9' &&
        graduate.after.labour.total === '24',
    );
    const newCohort = await command('GRADUATE_NEW');
    check(
      'new-own-duration-zero-graduate-processed',
      newCohort.receipt.status === 'FINAL' &&
        newCohort.after.college.cohorts.some(
          (c) =>
            c.cohortId === 'SIM_COHORT_NEW_01' &&
            c.state === 'GRADUATION_PROCESSED' &&
            c.graduates === '0' &&
            c.retained === '2',
        ),
    );
    check(
      'no-double-course-charge',
      newCohort.after.college.budgetCommitted === '250' &&
        newCohort.after.college.budgetRemaining === '50',
    );
    const originalAuto = await host.processDueBoundary();
    evidence.push({ privateStep: 'old-auto-at-day10', result: originalAuto });
    check(
      'old-auto-receipt-after-new-window-expired',
      originalAuto.status === 'FINAL' &&
        originalAuto.receipt.commandId === automatic.receipt.commandId &&
        originalAuto.receipt.commandFingerprint ===
          automatic.receipt.commandFingerprint,
    );
    finalProjection = await projection();
  } catch (error) {
    primaryError = error;
  } finally {
    authorization = undefined;
    if (host) {
      try {
        cleanup = await host.close();
      } catch (error) {
        primaryError ??= error;
      }
    }
    // Evidence contains actual HTTP/native numeric metadata; it is not a Core business fingerprint.
    const transcript = JSON.stringify({
      classification: 'ACTUAL_ISOLATED_HTTP_AND_PRIVATE_CONTROLLER_EVIDENCE',
      evidence,
      assertions,
      finalProjection,
      cleanup: cleanup ?? null,
      error: primaryError
        ? {
            name: primaryError.name,
            message:
              'Acceptance did not complete; inspect the bounded actual responses.',
          }
        : null,
      browser: 'NOT_RUN_BY_THIS_HTTP_TOOL',
      sourceAdmitted: false,
      WorldClock: false,
    });
    await writeFile(path.join(directory, 'actual-http.json'), transcript);
    await writeFile(
      path.join(directory, 'receipt.json'),
      `${JSON.stringify({ status: primaryError ? 'INCOMPLETE' : 'HTTP_FLOW_CONFIRMED_BROWSER_AND_NATIVE_INDEPENDENT_CHECKS_REMAIN', bytes: Buffer.byteLength(transcript), sha256: sha(transcript), browser: 'NOT_RUN', sourceAdmitted: false, WorldClock: false }, null, 2)}\n`,
    );
  }
  if (primaryError)
    throw Error(`SOCIAL_HTTP_ACCEPTANCE_INCOMPLETE: ${directory}`);
  return Object.freeze({
    evidenceDirectory: directory,
    assertionsPassed: assertions.length,
    browser: 'NOT_RUN',
    sourceAdmitted: false,
    WorldClock: false,
  });
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.slice(2).join('|') !== '--isolated') {
    process.stderr.write('Use --isolated; overrides are forbidden.\n');
    process.exitCode = 2;
  } else
    verifySocialOfficeDemo().then(
      (r) => process.stdout.write(`${JSON.stringify(r)}\n`),
      () => {
        process.stderr.write(
          'SOCIAL_HTTP_ACCEPTANCE_INCOMPLETE: original evidence and identities retained.\n',
        );
        process.exitCode = 1;
      },
    );
}
