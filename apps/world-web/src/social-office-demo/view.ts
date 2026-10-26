import { SOCIAL_DEMO_ACTIONS, type SocialDemoAction } from './contract.js';
import type { SocialDemoScreenState } from './controller.js';

export function createSocialDemoView(
  root: HTMLElement,
  submit: (action: SocialDemoAction) => void,
  reconnect: () => void,
) {
  root.innerHTML = `<header class="demo-header"><div><p class="eyebrow">SOCIAL OFFICE · SINGLE DEMONSTRATION</p><h1>Public services, one shared world</h1><p class="intro">Employment, education and healthcare share people, resources and confirmed records.</p></div><span class="scope-tag">Isolated simulation · Not adopted</span></header>
  <section class="status-strip" aria-label="Demonstration status"><span class="status-dot"></span><p id="demo-message" role="status" aria-live="polite">Connecting to the isolated demonstration…</p><button class="quiet" id="demo-reconnect">Refresh</button><span id="demo-day">Simulation day —</span></section>
  <section class="population" aria-label="Shared population"><div><span>Working-age population</span><strong id="metric-total">—</strong></div><div><span>Employed</span><strong id="metric-employed">—</strong></div><div><span>Students</span><strong id="metric-student">—</strong></div><div><span>Searching for work</span><strong id="metric-searching">—</strong></div><p id="skill-stocks">Skill profile awaiting read</p></section>
  <section class="office-grid" aria-label="Three public services">
  <article class="office-card"><p class="card-number">01 / EMPLOYMENT</p><h2>Employment Bureau</h2><p class="card-copy">Plan a match for the existing nurse vacancy. The due settlement receipt confirms the outcome.</p><dl class="card-metrics"><div><dt>Nurse vacancies</dt><dd id="job-vacancies">—</dd></div><div><dt>Matches</dt><dd id="job-matched">—</dd></div></dl><p class="budget" id="job-slots">Service slots awaiting read</p><p class="footnote" id="job-state">No confirmed matching result.</p><button data-action="PLAN">Plan a job match</button><p class="footnote">A queued plan awaits its due matching result.</p></article>
  <article class="office-card"><p class="card-number">02 / EDUCATION</p><h2>Technical College</h2><p class="card-copy">Each cohort completes its own instruction and assessment. Other learners retain student status and seats.</p><dl class="card-metrics"><div><dt>Enrolled</dt><dd id="college-students">—</dd></div><div><dt>Graduated</dt><dd id="college-graduates">—</dd></div><div><dt>Free seats</dt><dd id="college-seats">—</dd></div></dl><p class="budget" id="college-budget">Course budget awaiting read</p><button data-action="ADMIT">Admit this cohort</button><div class="button-pair"><button class="secondary" data-action="GRADUATE_OLD">Assess returning cohort</button><button class="secondary" data-action="GRADUATE_NEW">Assess new cohort</button></div><ul id="cohort-list" class="cohorts" aria-label="Cohort status"></ul></article>
  <article class="office-card"><p class="card-number">03 / HEALTHCARE</p><h2>Community Clinic</h2><p class="card-copy">Serve this care window within staff, facilities, medicine and budget. Unserved cases remain in the backlog.</p><dl class="card-metrics"><div><dt>Served</dt><dd id="clinic-served">—</dd></div><div><dt>Backlog</dt><dd id="clinic-backlog">—</dd></div><div><dt>Available doses</dt><dd id="clinic-medicine">—</dd></div></dl><p class="budget" id="clinic-budget">Care budget awaiting read</p><button data-action="SERVE">Serve this care window</button><p class="footnote">Budget commitments are distinct from payments. Payroll execution is outside this demonstration.</p></article>
  </section><section class="receipt-panel"><div><p class="eyebrow">COMMIT RECEIPT</p><h2>Commit receipt</h2><p id="receipt-message">No receipt submitted from this page yet.</p></div><dl><div><dt>Status</dt><dd id="receipt-status">—</dd></div><div><dt>Confirmed version</dt><dd id="receipt-version">—</dd></div></dl></section>
  <details class="trace"><summary>Inspect versions and source records</summary><p id="trace-head">Authorized view awaiting read</p><p id="trace-source">Source awaiting read</p><p id="trace-command">Original request awaiting read</p></details><footer>This is an explicitly selected simulation. Candidate construction, policy adoption and production remain separate. World / Clock are off.</footer>`;
  root.querySelector('#demo-reconnect')!.addEventListener('click', reconnect);
  root.addEventListener('click', (event) => {
    const button =
      event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>('button[data-action]')
        : null;
    if (
      button &&
      !button.disabled &&
      SOCIAL_DEMO_ACTIONS.includes(button.dataset.action as SocialDemoAction)
    )
      submit(button.dataset.action as SocialDemoAction);
  });
  const set = (id: string, value: string) => {
    root.querySelector(`#${id}`)!.textContent = value;
  };
  return Object.freeze({
    render(state: Readonly<SocialDemoScreenState>) {
      set('demo-message', state.message);
      root.dataset.phase = state.phase;
      for (const button of root.querySelectorAll<HTMLButtonElement>(
        'button[data-action]',
      ))
        button.disabled =
          state.pending !== null ||
          ['CONNECTING', 'SUBMITTING'].includes(state.phase) ||
          !state.projection?.availableActions.includes(
            button.dataset.action as SocialDemoAction,
          );
      const p = state.projection;
      if (p) {
        set('demo-day', `Simulation day ${p.dayIndex}`);
        for (const k of ['total', 'employed', 'student', 'searching'] as const)
          set(`metric-${k}`, p.labour[k]);
        set(
          'skill-stocks',
          `Low ${p.labour.low} · Medium ${p.labour.medium} · High ${p.labour.high}`,
        );
        set('job-vacancies', p.employment.vacancies);
        set('job-matched', p.employment.matched ?? '—');
        set(
          'job-slots',
          `Service slots available ${p.employment.freeServiceSlots}`,
        );
        set(
          'job-state',
          p.employment.planState === 'NONE'
            ? 'No matching plan yet.'
            : p.employment.planState === 'PENDING'
              ? 'Plan reserved; due settlement pending.'
              : `Settlement confirmed · ${p.employment.settlementCommandId}`,
        );
        set('clinic-served', p.clinic.served ?? '—');
        set('college-students', p.college.students);
        set('college-graduates', p.college.graduates);
        set('college-seats', p.college.freeSeats);
        set(
          'college-budget',
          `Course budget committed ${p.college.budgetCommitted} ${p.college.currency} · Remaining ${p.college.budgetRemaining}`,
        );
        set('clinic-backlog', p.clinic.backlog);
        set('clinic-medicine', p.clinic.medicineAvailable);
        set(
          'clinic-budget',
          `Care budget committed ${p.clinic.budgetCommitted} ${p.clinic.currency} · Remaining ${p.clinic.budgetRemaining}`,
        );
        const rows = p.college.cohorts.map((cohort) => {
          const li = document.createElement('li');
          li.textContent = `${cohort.cohortId === 'SIM_COHORT_RETURNING_01' ? 'Returning cohort' : 'New cohort'}: ${cohort.state === 'OPEN' ? 'Learning / awaiting assessment' : `Graduated ${cohort.graduates}; retained ${cohort.retained}`}`;
          return li;
        });
        root.querySelector('#cohort-list')!.replaceChildren(...rows);
        set(
          'trace-head',
          `World version ${p.worldVersion} · Event sequence ${p.eventSequence}`,
        );
        set(
          'trace-source',
          `Simulated source revision ${p.sourceGeneration} · SHA-256 ${p.sourceManifestHash}`,
        );
      } else {
        for (const id of [
          'metric-total',
          'metric-employed',
          'metric-student',
          'metric-searching',
          'college-students',
          'college-graduates',
          'college-seats',
          'clinic-backlog',
          'clinic-served',
          'job-vacancies',
          'job-matched',
          'clinic-medicine',
        ])
          set(id, '—');
        set('demo-day', 'Simulation day —');
        set('skill-stocks', 'Skill profile awaiting read');
        set('job-slots', 'Service slots awaiting read');
        set('job-state', 'Matching result awaiting authorized read');
        set('college-budget', 'Course budget awaiting read');
        set('clinic-budget', 'Care budget awaiting read');
        set('trace-head', 'Authorized view unavailable');
        set('trace-source', 'Source awaiting read');
        root.querySelector('#cohort-list')!.replaceChildren();
      }
      if (state.receipt) {
        set('receipt-message', state.receipt.message);
        set(
          'receipt-status',
          (
            {
              QUEUED: 'Queued, not completed',
              UNKNOWN: 'Original receipt pending',
              FINAL: 'Durably confirmed',
              REJECTED: 'Rejected',
            } as const
          )[state.receipt.status],
        );
        set(
          'receipt-version',
          state.receipt.worldVersion ?? 'Not yet confirmed',
        );
        set(
          'trace-command',
          `Original request ${state.receipt.requestId} · Command ${state.receipt.commandId}`,
        );
      } else if (state.pending) {
        set('receipt-status', 'Awaiting original request');
        set('receipt-message', 'This original request is not yet confirmed.');
        set('receipt-version', 'Not yet confirmed');
        set('trace-command', `Original request ${state.pending.requestId}`);
      }
    },
  });
}
