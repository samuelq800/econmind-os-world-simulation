import { useState } from 'react';

import type { PrototypeWorldBriefProjection } from './contracts.js';

type SocialPhase = 'READ' | 'DIAGNOSE' | 'ASSEMBLE' | 'REVIEW' | 'RECORDED';
type SocialResponseId = 'TRIAGE_EXTENSION' | 'FLOAT_TEAM' | 'FACILITY_REQUEST';

interface SocialCommandCenterProps {
  readonly projection: PrototypeWorldBriefProjection;
  readonly onNotice: (notice: string) => void;
}

interface ServiceResponse {
  readonly id: SocialResponseId;
  readonly label: string;
  readonly kind: 'staffing' | 'future-capacity';
  readonly capacity: number;
  readonly day: number;
  readonly detail: string;
  readonly constraint: string;
}

const SERVICE_NAME = 'Eastbank primary care';
const CURRENT_BACKLOG = 700;
const DAILY_DEMAND = 1_000;
const STAFF_CAPACITY = 800;
const FACILITY_CAPACITY = 1_200;
const MATERIAL_CAPACITY = 1_100;
const BUDGET_CAPACITY = 1_000;
const STABILISATION_BOOST = DAILY_DEMAND - STAFF_CAPACITY;

const SERVICE_RESPONSES: readonly ServiceResponse[] = [
  {
    id: 'TRIAGE_EXTENSION',
    label: 'Evening triage extension',
    kind: 'staffing',
    capacity: 80,
    day: 1,
    detail: 'Eight cleared shifts add 80 service visits per day.',
    constraint:
      'Uses the current operating envelope; staffing still needs cover.',
  },
  {
    id: 'FLOAT_TEAM',
    label: 'Regional float team',
    kind: 'staffing',
    capacity: 120,
    day: 2,
    detail: 'A qualified relief roster adds 120 service visits per day.',
    constraint:
      'Source roster must clear its own service schedule before execution.',
  },
  {
    id: 'FACILITY_REQUEST',
    label: 'Add 400 treatment slots',
    kind: 'future-capacity',
    capacity: 400,
    day: 10,
    detail:
      'A future rooms request raises facility capacity, not staff capacity.',
    constraint:
      'Industry and Finance own approval and delivery; Day 1 care stays capped by staff.',
  },
];

function formatVisits(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function responseClass(response: ServiceResponse): string {
  return response.kind === 'staffing' ? 'is-staffing' : 'is-facility';
}

export function SocialCommandCenter({
  projection,
  onNotice,
}: SocialCommandCenterProps) {
  const [desk, setDesk] = useState(78);
  const [phase, setPhase] = useState<SocialPhase>('READ');
  const [queueRead, setQueueRead] = useState(false);
  const [bottleneckRead, setBottleneckRead] = useState(false);
  const [selectedResponseIds, setSelectedResponseIds] = useState<
    readonly SocialResponseId[]
  >([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [replay, setReplay] = useState<readonly string[]>([
    'Social desk opened · local public-service rehearsal',
  ]);

  const selectedResponses = SERVICE_RESPONSES.filter((response) =>
    selectedResponseIds.includes(response.id),
  );
  const staffingBoost = selectedResponses
    .filter((response) => response.kind === 'staffing')
    .reduce((total, response) => total + response.capacity, 0);
  const facilityBoost = selectedResponses
    .filter((response) => response.kind === 'future-capacity')
    .reduce((total, response) => total + response.capacity, 0);
  const proposedStaffCapacity = STAFF_CAPACITY + staffingBoost;
  const proposedFacilityCapacity = FACILITY_CAPACITY + facilityBoost;
  const proposedDelivery = Math.min(
    DAILY_DEMAND + CURRENT_BACKLOG,
    proposedStaffCapacity,
    proposedFacilityCapacity,
    MATERIAL_CAPACITY,
    BUDGET_CAPACITY,
  );
  const queueChange = DAILY_DEMAND - proposedDelivery;
  const proposedBacklog = CURRENT_BACKLOG + queueChange;
  const staffingGap = Math.max(STABILISATION_BOOST - staffingBoost, 0);
  const facilitySelected = selectedResponseIds.includes('FACILITY_REQUEST');
  const canOpenReview =
    bottleneckRead && staffingBoost >= STABILISATION_BOOST && !reviewOpen;
  const recorded = phase === 'RECORDED';
  const progress = recorded
    ? 5
    : canOpenReview || reviewOpen
      ? 4
      : selectedResponses.length
        ? 3
        : bottleneckRead
          ? 2
          : queueRead
            ? 1
            : 0;

  const addReplay = (entry: string) => {
    setReplay((current) => [entry, ...current].slice(0, 4));
  };

  const readQueue = () => {
    if (queueRead || recorded) return;
    setQueueRead(true);
    setPhase('DIAGNOSE');
    addReplay(
      `Eastbank queue read · ${formatVisits(CURRENT_BACKLOG)} visits carried into a ${formatVisits(DAILY_DEMAND)}-visit day`,
    );
    onNotice(
      'Eastbank queue read. Inspect which service limit fixes delivery before drafting a response.',
    );
  };

  const diagnoseService = () => {
    if (!queueRead || bottleneckRead || recorded) return;
    setBottleneckRead(true);
    setPhase('ASSEMBLE');
    addReplay(
      `Bottleneck confirmed · qualified staffing fixes delivery at ${formatVisits(STAFF_CAPACITY)} visits per day`,
    );
    onNotice(
      'Staffing is the active bottleneck. A larger building does not add today’s service capacity.',
    );
  };

  const toggleResponse = (response: ServiceResponse) => {
    if (recorded) return;
    const included = selectedResponseIds.includes(response.id);
    const next = included
      ? selectedResponseIds.filter((id) => id !== response.id)
      : [...selectedResponseIds, response.id];
    setSelectedResponseIds(next);
    setPhase('ASSEMBLE');
    setReviewOpen(false);
    addReplay(
      `${response.label} ${included ? 'removed from' : 'added to'} the local service plan`,
    );
  };

  const clearFacilitiesOnlyDraft = () => {
    setSelectedResponseIds((current) =>
      current.filter((id) => id !== 'FACILITY_REQUEST'),
    );
    setReviewOpen(false);
    addReplay(
      'Future rooms request cleared · immediate service plan returned to staffing',
    );
    onNotice(
      'Future capacity remains a separate request. Build the local stabilisation plan from qualified staff cover.',
    );
  };

  const openServiceReview = () => {
    if (!canOpenReview || recorded) return;
    setPhase('REVIEW');
    setReviewOpen(true);
    addReplay(
      `Service-day review opened · local staffing cover reaches ${formatVisits(proposedDelivery)} visits per day`,
    );
    onNotice(
      'Service-day review opened. The staffing plan is still local and has not deployed anyone.',
    );
  };

  const recordServicePlan = () => {
    if (!reviewOpen || recorded) return;
    setPhase('RECORDED');
    addReplay(
      `Eastbank stabilisation plan recorded locally · ${formatVisits(staffingBoost)} visits per day of proposed cover`,
    );
    onNotice(
      'Local service plan recorded. No staff, budget, facility, payment, or public-service command was submitted.',
    );
  };

  const openNextDesk = () => {
    setDesk((current) => current + 1);
    setPhase('READ');
    setQueueRead(false);
    setBottleneckRead(false);
    setSelectedResponseIds([]);
    setReviewOpen(false);
    addReplay(`Desk ${desk + 1} opened · local service draft cleared`);
    onNotice(`Local Social desk ${desk + 1} opened. No world state changed.`);
  };

  const loopStepClass = (step: number) => {
    if (progress >= step) return 'is-complete';
    if (progress + 1 === step) return 'is-current';
    return undefined;
  };

  return (
    <section className="social-command" aria-labelledby="social-command-title">
      <header className="social-command__header">
        <div>
          <p>SOCIAL · PUBLIC SERVICE · NORTHSTAR · DESK {desk}</p>
          <h1 id="social-command-title">Hold the care line.</h1>
          <span>
            Find the binding limit, then build the smallest response that keeps
            a public service from falling further behind.
          </span>
        </div>
        <dl className="social-command__hud" aria-label="Current service state">
          <div>
            <dt>Queue carried</dt>
            <dd>{formatVisits(CURRENT_BACKLOG)} visits</dd>
          </div>
          <div>
            <dt>Daily demand</dt>
            <dd>{formatVisits(DAILY_DEMAND)} visits</dd>
          </div>
          <div>
            <dt>Staff delivery</dt>
            <dd>{formatVisits(STAFF_CAPACITY)} / day</dd>
          </div>
        </dl>
      </header>

      <section
        className="social-command__loop"
        aria-label="Social service mission loop"
      >
        {[
          'Read queue',
          'Name bottleneck',
          'Build cover',
          'Test service day',
          'File plan',
        ].map((label, index) => (
          <span className={loopStepClass(index + 1)} key={label}>
            <b>0{index + 1}</b> {label}
          </span>
        ))}
        <strong>{progress} / 5 mission steps</strong>
      </section>

      <div className="social-command__board">
        <section
          className="social-network"
          aria-labelledby="social-network-title"
        >
          <header>
            <div>
              <p>SERVICE NETWORK · LOCAL VIEW</p>
              <h2 id="social-network-title">The queue has a shape.</h2>
            </div>
            <span>{queueRead ? 'QUEUE READ' : 'READ THE SERVICE'}</span>
          </header>
          <p>
            {SERVICE_NAME} receives {formatVisits(DAILY_DEMAND)} visits a day
            and already carries {formatVisits(CURRENT_BACKLOG)}. Delivery is
            limited by the first constrained resource, not a service score.
          </p>

          <div className="social-network__flow" aria-label="Local service flow">
            <article className="social-network__queue">
              <span>OPEN QUEUE</span>
              <strong>{formatVisits(CURRENT_BACKLOG)}</strong>
              <small>visits carried in</small>
            </article>
            <span className="social-network__arrow" aria-hidden="true">
              →
            </span>
            <article className="social-network__demand">
              <span>TODAY&apos;S LOAD</span>
              <strong>{formatVisits(DAILY_DEMAND + CURRENT_BACKLOG)}</strong>
              <small>visits awaiting delivery</small>
            </article>
            <span className="social-network__arrow" aria-hidden="true">
              →
            </span>
            <article className="social-network__delivery">
              <span>LOCAL DELIVERY</span>
              <strong>{formatVisits(proposedDelivery)}</strong>
              <small>visits / day in this draft</small>
            </article>
          </div>

          <div
            className="social-network__constraints"
            aria-label="Service constraints"
          >
            <article className="is-bottleneck">
              <span>Qualified staff</span>
              <strong>{formatVisits(proposedStaffCapacity)} / day</strong>
              <small>Active constraint</small>
            </article>
            <article className={facilitySelected ? 'is-proposed' : undefined}>
              <span>Rooms &amp; equipment</span>
              <strong>{formatVisits(proposedFacilityCapacity)} / day</strong>
              <small>
                {facilitySelected ? 'Day 10 request' : 'Not binding today'}
              </small>
            </article>
            <article>
              <span>Medical supplies</span>
              <strong>{formatVisits(MATERIAL_CAPACITY)} / day</strong>
              <small>Not binding today</small>
            </article>
            <article>
              <span>Operating envelope</span>
              <strong>{formatVisits(BUDGET_CAPACITY)} / day</strong>
              <small>Not binding today</small>
            </article>
          </div>

          <div className="social-network__outlook">
            <span>END OF SHOWN DAY</span>
            <strong>
              {formatVisits(proposedBacklog)} visits
              {queueChange > 0
                ? ` · +${formatVisits(queueChange)} added`
                : queueChange < 0
                  ? ` · ${formatVisits(Math.abs(queueChange))} cleared`
                  : ' · no new queue added'}
            </strong>
            <small>Local arithmetic illustration · not a world forecast</small>
          </div>

          {!queueRead ? (
            <button
              className="social-button social-button--primary"
              type="button"
              onClick={readQueue}
            >
              Read Eastbank queue
            </button>
          ) : (
            <span className="social-network__read">
              Queue read · choose a limit before choosing a response.
            </span>
          )}
        </section>

        <section
          className="social-mission"
          aria-labelledby="social-mission-title"
        >
          <header>
            <div>
              <p>SOCIAL DESK · PRIMARY CARE</p>
              <h2 id="social-mission-title">Eastbank service day</h2>
            </div>
            <span>SOCIAL OWNS THE DRAFT</span>
          </header>
          <dl className="social-mission__brief">
            <div>
              <dt>Required cover</dt>
              <dd>+{formatVisits(STABILISATION_BOOST)} / day</dd>
            </div>
            <div>
              <dt>Future rooms</dt>
              <dd>Day 10</dd>
            </div>
            <div>
              <dt>Authority</dt>
              <dd>Local draft</dd>
            </div>
          </dl>

          {!queueRead ? (
            <div className="social-mission__lock">
              <strong>Service pressure unread.</strong>
              <span>
                Start from the queue. Social cannot solve a capacity question by
                guessing which resource is scarce.
              </span>
            </div>
          ) : null}

          {queueRead && !bottleneckRead ? (
            <section className="social-diagnosis">
              <p>CAPACITY CHECK · LOCAL READ</p>
              <h3>Staff fixes today&apos;s delivery.</h3>
              <span>
                Rooms can handle {formatVisits(FACILITY_CAPACITY)} visits, but
                qualified staff can handle only {formatVisits(STAFF_CAPACITY)}.
              </span>
              <button
                className="social-button social-button--primary"
                type="button"
                onClick={diagnoseService}
              >
                Mark staffing as the bottleneck
              </button>
            </section>
          ) : null}

          {bottleneckRead ? (
            <div
              className="social-response-board"
              aria-label="Local service responses"
            >
              <div className="social-response-board__heading">
                <div>
                  <p>LOCAL RESPONSE CARDS</p>
                  <strong>Build cover before the next service day.</strong>
                </div>
                <span>{projection.seasonDayLabel}</span>
              </div>
              <div className="social-response-grid">
                {SERVICE_RESPONSES.map((response) => {
                  const selected = selectedResponseIds.includes(response.id);
                  return (
                    <button
                      aria-pressed={selected}
                      className={`social-response-card ${responseClass(response)}${selected ? ' is-selected' : ''}`}
                      key={response.id}
                      type="button"
                      onClick={() => toggleResponse(response)}
                    >
                      <span>
                        {selected ? 'IN LOCAL PLAN' : `DAY ${response.day}`}
                      </span>
                      <strong>{response.label}</strong>
                      <b>
                        +{formatVisits(response.capacity)}
                        {response.kind === 'staffing'
                          ? ' visits / day'
                          : ' room visits / day'}
                      </b>
                      <small>{response.detail}</small>
                      <em>{response.constraint}</em>
                    </button>
                  );
                })}
              </div>

              {selectedResponses.length ? (
                <section
                  className="social-plan__consequences"
                  aria-label="Service plan consequences"
                >
                  <span>
                    <b>Staffing cover</b> +{formatVisits(staffingBoost)} visits
                    / day
                  </span>
                  <span>
                    <b>Delivery limit</b> {formatVisits(proposedDelivery)}{' '}
                    visits / day
                  </span>
                  <span>
                    <b>Queue change</b>{' '}
                    {queueChange > 0
                      ? `+${formatVisits(queueChange)} visits`
                      : 'No additional visits'}
                  </span>
                </section>
              ) : null}

              {selectedResponses.length && !canOpenReview && !reviewOpen ? (
                <div className="social-plan__blocker">
                  <strong>Service day is not stable yet.</strong>
                  <span>
                    {facilitySelected && staffingBoost === 0
                      ? `A room request cannot clear today’s queue. Staff delivery remains ${formatVisits(STAFF_CAPACITY)} visits per day while the new rooms wait until Day 10.`
                      : `The local plan is still ${formatVisits(staffingGap)} visits per day short. The queue keeps growing until qualified staffing reaches ${formatVisits(DAILY_DEMAND)} visits per day.`}
                  </span>
                  {facilitySelected && staffingBoost === 0 ? (
                    <button
                      className="social-button"
                      type="button"
                      onClick={clearFacilitiesOnlyDraft}
                    >
                      Return to staffing response
                    </button>
                  ) : null}
                </div>
              ) : null}

              {canOpenReview ? (
                <button
                  className="social-button social-button--primary"
                  type="button"
                  onClick={openServiceReview}
                >
                  Test the local service day
                </button>
              ) : null}

              {reviewOpen ? (
                <section
                  className="social-publish-review"
                  aria-label="Local service plan review"
                >
                  <p>SERVICE DAY REVIEW · LOCAL ONLY</p>
                  <h3>What this plan would hold.</h3>
                  <ul>
                    <li>
                      {formatVisits(staffingBoost)} visits per day of proposed
                      qualified cover; no clinician is deployed yet.
                    </li>
                    <li>
                      Delivery reaches {formatVisits(proposedDelivery)} visits
                      per day in the shown local arithmetic, so the queue stops
                      adding to itself.
                    </li>
                    <li>
                      The existing {formatVisits(CURRENT_BACKLOG)}-visit queue
                      remains. A future rooms request needs Industry and Finance
                      to run through their own approvals.
                    </li>
                  </ul>
                  <button
                    className="social-button social-button--primary"
                    type="button"
                    onClick={recordServicePlan}
                  >
                    Record local service plan
                  </button>
                </section>
              ) : null}
            </div>
          ) : null}

          {recorded ? (
            <div className="social-mission__success">
              <strong>Local service plan recorded for this rehearsal.</strong>
              <span>
                Staffing, funding, facilities, and delivery stay separate until
                their authorized paths run.
              </span>
              <button
                className="social-button social-button--primary"
                type="button"
                onClick={openNextDesk}
              >
                Open next social desk
              </button>
            </div>
          ) : null}
        </section>
      </div>

      <section
        className="social-command__ledger"
        aria-labelledby="social-ledger-title"
      >
        <article>
          <p>LINE CAUSALITY</p>
          <h2>The limit is the action.</h2>
          <div className="social-causality-grid">
            <span>
              <b>Fact</b> {formatVisits(DAILY_DEMAND + CURRENT_BACKLOG)} visits
              compete for today&apos;s capacity.
            </span>
            <span>
              <b>Mechanism</b> Qualified staffing fixes daily delivery at
              {formatVisits(proposedStaffCapacity)}.
            </span>
            <span>
              <b>Authority</b> Social drafts the service response; other offices
              own their funding and construction decisions.
            </span>
          </div>
        </article>
        <article>
          <p>SOCIAL DESK REPLAY</p>
          <h2 id="social-ledger-title">What this desk changed.</h2>
          <ol>
            {replay.map((entry, index) => (
              <li key={`${index}-${entry}`}>{entry}</li>
            ))}
          </ol>
          <small>
            Local rehearsal only · no staff deployment, budget reservation,
            facility request, payment, or public-service command is submitted.
          </small>
        </article>
      </section>
    </section>
  );
}
