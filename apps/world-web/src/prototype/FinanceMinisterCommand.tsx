import { useState } from 'react';

import type { PrototypeWorldBriefProjection } from './contracts.js';

type FinancePhase = 'ASSESS' | 'REQUEST' | 'STRUCTURE' | 'REVIEW' | 'RECORDED';
type FundingPathId = 'TREASURY_FIRST' | 'BALANCED' | 'PHASED';
type FundingSourceId =
  'DIRECT_TREASURY' | 'DEDICATED_BOND' | 'INDUSTRY_MATCH' | 'PHASE_TWO';

interface FinanceMinisterCommandProps {
  readonly projection: PrototypeWorldBriefProjection;
  readonly onNotice: (notice: string) => void;
}

interface FundingSource {
  readonly id: FundingSourceId;
  readonly label: string;
  readonly amount: number;
  readonly detail: string;
  readonly kind: 'treasury' | 'debt' | 'match' | 'timing';
}

interface FundingPath {
  readonly id: FundingPathId;
  readonly label: string;
  readonly shortLabel: string;
  readonly detail: string;
  readonly consequence: string;
  readonly sources: readonly FundingSource[];
}

const PROJECT_TOTAL = 3;
const MINIMUM_BUFFER = 1.2;
const PROJECT_NAME = 'Riverside Capacity Link';

const FUNDING_PATHS: readonly FundingPath[] = [
  {
    id: 'TREASURY_FIRST',
    label: 'Treasury first',
    shortLabel: 'FAST / BLOCKED',
    detail: 'Release the request now and ask the central fund to carry it.',
    consequence: 'It closes fast, but breaks the cash guardrail.',
    sources: [
      {
        id: 'DIRECT_TREASURY',
        label: 'Direct Treasury',
        amount: 2.2,
        detail: 'Immediate central-fund reservation.',
        kind: 'treasury',
      },
      {
        id: 'INDUSTRY_MATCH',
        label: 'Industry match',
        amount: 0.8,
        detail: 'Owner contribution already reserved.',
        kind: 'match',
      },
    ],
  },
  {
    id: 'BALANCED',
    label: 'Balanced structure',
    shortLabel: 'RECOMMENDED',
    detail:
      'Keep the cash window alive while matching the project to a debt window.',
    consequence: 'Preserves the buffer and creates a specific debt obligation.',
    sources: [
      {
        id: 'DIRECT_TREASURY',
        label: 'Direct Treasury',
        amount: 0.3,
        detail: 'Drawn from remaining uncommitted cash.',
        kind: 'treasury',
      },
      {
        id: 'DEDICATED_BOND',
        label: 'Dedicated bond',
        amount: 2,
        detail: 'Day 11 issue window; market demand stays uncertain.',
        kind: 'debt',
      },
      {
        id: 'INDUSTRY_MATCH',
        label: 'Industry match',
        amount: 0.7,
        detail: 'Project owner releases the matched envelope.',
        kind: 'match',
      },
    ],
  },
  {
    id: 'PHASED',
    label: 'Phase the build',
    shortLabel: 'SLOWER / SAFER',
    detail:
      'Fund the first operating phase and move the second release beyond the debt window.',
    consequence:
      'Cuts near-term cash pressure, but delays the final milestone.',
    sources: [
      {
        id: 'DIRECT_TREASURY',
        label: 'Direct Treasury',
        amount: 0.3,
        detail: 'Minimum viable mobilisation cash.',
        kind: 'treasury',
      },
      {
        id: 'DEDICATED_BOND',
        label: 'Dedicated bond',
        amount: 1.2,
        detail: 'Smaller Day 11 issue with a lower debt step.',
        kind: 'debt',
      },
      {
        id: 'INDUSTRY_MATCH',
        label: 'Industry match',
        amount: 0.6,
        detail: 'Released against phase-one capacity milestones.',
        kind: 'match',
      },
      {
        id: 'PHASE_TWO',
        label: 'Phase-two commitment',
        amount: 0.9,
        detail: 'A later milestone, not current Treasury cash.',
        kind: 'timing',
      },
    ],
  },
];

function getMetric(
  projection: PrototypeWorldBriefProjection,
  metricId: string,
  fallback: number,
): number {
  const metric = projection.metrics.find((item) => item.id === metricId);
  const parsed = metric ? Number(metric.displayValue) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatBillion(value: number): string {
  return `${value.toFixed(2)} bn GCU`;
}

function amountLabel(value: number): string {
  return `${value.toFixed(1)} bn`;
}

export function FinanceMinisterCommand({
  projection,
  onNotice,
}: FinanceMinisterCommandProps) {
  const [turn, setTurn] = useState(78);
  const [phase, setPhase] = useState<FinancePhase>('ASSESS');
  const [runwayRead, setRunwayRead] = useState(false);
  const [fundingPathId, setFundingPathId] = useState<FundingPathId | null>(
    null,
  );
  const [selectedSourceIds, setSelectedSourceIds] = useState<
    readonly FundingSourceId[]
  >([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [log, setLog] = useState<readonly string[]>([
    'Treasury chamber opened · local fiscal rehearsal',
  ]);

  const freeCash = getMetric(projection, 'treasury-cash', 1.84);
  const fundingPath = FUNDING_PATHS.find((path) => path.id === fundingPathId);
  const selectedSources = fundingPath
    ? fundingPath.sources.filter((source) =>
        selectedSourceIds.includes(source.id),
      )
    : [];
  const stackAmount = selectedSources.reduce(
    (total, source) => total + source.amount,
    0,
  );
  const treasuryDraw = selectedSources
    .filter((source) => source.kind === 'treasury')
    .reduce((total, source) => total + source.amount, 0);
  const debtAmount = selectedSources
    .filter((source) => source.kind === 'debt')
    .reduce((total, source) => total + source.amount, 0);
  const proposedCash = freeCash - treasuryDraw;
  const fundingGap = Math.max(PROJECT_TOTAL - stackAmount, 0);
  const runwayValues = [
    freeCash,
    proposedCash - 0.08,
    proposedCash - 0.16,
    proposedCash - 0.27,
  ];
  const runwayLabels = ['Now', 'Day 7', 'Day 14', 'Day 30'];
  const firstGuardrailBreach = runwayValues.findIndex(
    (value) => value < MINIMUM_BUFFER,
  );
  const stackClosed =
    Boolean(fundingPath) &&
    selectedSourceIds.length === fundingPath?.sources.length &&
    fundingGap === 0;
  const cashGuardrailMet = firstGuardrailBreach === -1;
  const canOpenReview = stackClosed && cashGuardrailMet;
  const published = phase === 'RECORDED';
  const progress = published
    ? 5
    : stackClosed
      ? 4
      : fundingPath
        ? 3
        : phase === 'STRUCTURE'
          ? 2
          : runwayRead
            ? 1
            : 0;

  const addLog = (entry: string) => {
    setLog((current) => [entry, ...current].slice(0, 4));
  };

  const readRunway = () => {
    if (runwayRead) return;
    setRunwayRead(true);
    setPhase('REQUEST');
    addLog(
      `Cash runway read · ${formatBillion(freeCash)} before the ${formatBillion(MINIMUM_BUFFER)} guardrail`,
    );
    onNotice(
      'Cash runway read. The Riverside funding request can now be opened locally.',
    );
  };

  const openFundingRequest = () => {
    if (!runwayRead || published) return;
    setPhase('STRUCTURE');
    addLog('Funding request opened · Riverside Capacity Link / Industry owner');
    onNotice(
      'Riverside request opened. Choose a funding path before building the stack.',
    );
  };

  const chooseFundingPath = (path: FundingPath) => {
    if ((phase !== 'STRUCTURE' && phase !== 'REVIEW') || published) return;
    setFundingPathId(path.id);
    setSelectedSourceIds([]);
    setPhase('STRUCTURE');
    setReviewOpen(false);
    addLog(`${path.label} staged · stack reset for local drafting`);
    onNotice(
      `${path.label} staged locally. Add every source needed to close the package.`,
    );
  };

  const toggleSource = (source: FundingSource) => {
    if (!fundingPath || published) return;
    const included = selectedSourceIds.includes(source.id);
    const next = included
      ? selectedSourceIds.filter((id) => id !== source.id)
      : [...selectedSourceIds, source.id];
    setSelectedSourceIds(next);
    setPhase(
      next.length === fundingPath.sources.length ? 'REVIEW' : 'STRUCTURE',
    );
    setReviewOpen(false);
    addLog(
      `${source.label} ${included ? 'removed from' : 'added to'} local funding stack`,
    );
  };

  const openReview = () => {
    if (!canOpenReview || published) return;
    setReviewOpen(true);
    addLog('Publish review opened · cash, debt and approvals are visible');
    onNotice('Publish review opened. This remains a local fiscal rehearsal.');
  };

  const recordPackage = () => {
    if (!canOpenReview || !reviewOpen || published) return;
    setPhase('RECORDED');
    addLog(
      `Funding route recorded locally · ${formatBillion(treasuryDraw)} Treasury / ${formatBillion(debtAmount)} debt`,
    );
    onNotice(
      'Local funding route recorded. No Treasury transaction, debt issue, or approval was submitted.',
    );
  };

  const openNextTurn = () => {
    setTurn((current) => current + 1);
    setPhase('ASSESS');
    setRunwayRead(false);
    setFundingPathId(null);
    setSelectedSourceIds([]);
    setReviewOpen(false);
    addLog(`Turn ${turn + 1} opened · local funding draft cleared`);
    onNotice(`Local finance turn ${turn + 1} opened. No world state changed.`);
  };

  const loopStepClass = (step: number) => {
    if (progress >= step) return 'is-complete';
    if (progress + 1 === step) return 'is-current';
    return undefined;
  };

  const runwayPreview = [
    { label: 'NOW', value: runwayValues[0]!, detail: 'Free cash' },
    {
      label: 'DAY 7',
      value: runwayValues[1]!,
      detail: 'Debt-service watch',
    },
    { label: 'DAY 14', value: runwayValues[2]!, detail: 'Payment window' },
    { label: 'DAY 30', value: runwayValues[3]!, detail: 'Commitment view' },
  ];

  return (
    <section
      className="finance-command"
      aria-labelledby="finance-command-title"
    >
      <header className="finance-command__header">
        <div>
          <p>FINANCE · NORTHSTAR · TURN {turn}</p>
          <h1 id="finance-command-title">Treasury survival turn</h1>
          <span>
            Keep the country liquid. Build a route to fund what matters.
          </span>
        </div>
        <dl className="finance-command__hud" aria-label="Current fiscal state">
          <div>
            <dt>Free cash</dt>
            <dd>{formatBillion(freeCash)}</dd>
          </div>
          <div>
            <dt>Cash guardrail</dt>
            <dd>{formatBillion(MINIMUM_BUFFER)}</dd>
          </div>
          <div>
            <dt>Debt window</dt>
            <dd>Day 11</dd>
          </div>
        </dl>
      </header>

      <section
        className="finance-command__loop"
        aria-label="Funding mission loop"
      >
        {[
          'Read runway',
          'Open request',
          'Build structure',
          'Close stack',
          'Record route',
        ].map((label, index) => (
          <span className={loopStepClass(index + 1)} key={label}>
            <b>0{index + 1}</b> {label}
          </span>
        ))}
        <strong>{progress} / 5 mission steps</strong>
      </section>

      <div className="finance-command__board">
        <section
          className="finance-runway"
          aria-labelledby="finance-runway-title"
        >
          <header>
            <div>
              <p>LIVE CASH PATH</p>
              <h2 id="finance-runway-title">Cash is a clock.</h2>
            </div>
            <span>
              {fundingPath ? 'LOCAL DRAFT VIEW' : 'READ THE GUARDRAIL'}
            </span>
          </header>
          <p>
            Free Cash is what remains after restricted funds, near-term
            commitments, and the minimum reserve. The line below changes only in
            this local draft.
          </p>
          <div
            className="finance-runway__chart"
            aria-label="Local four-point cash runway preview"
          >
            <div className="finance-runway__buffer">
              <span>Minimum buffer · {formatBillion(MINIMUM_BUFFER)}</span>
            </div>
            {runwayPreview.map((point) => (
              <article key={point.label}>
                <span>{point.label}</span>
                <strong
                  className={
                    point.value < MINIMUM_BUFFER ? 'is-danger' : undefined
                  }
                >
                  {formatBillion(Math.max(point.value, 0))}
                </strong>
                <small>{point.detail}</small>
              </article>
            ))}
          </div>
          <dl className="finance-runway__facts">
            <div>
              <dt>Before</dt>
              <dd>{formatBillion(freeCash)}</dd>
            </div>
            <div>
              <dt>Proposed</dt>
              <dd>{formatBillion(proposedCash)}</dd>
            </div>
            <div>
              <dt>Difference</dt>
              <dd>
                {treasuryDraw
                  ? `−${formatBillion(treasuryDraw)}`
                  : 'No draft draw'}
              </dd>
            </div>
          </dl>
          {!runwayRead ? (
            <button
              className="finance-button finance-button--primary"
              type="button"
              onClick={readRunway}
            >
              Read cash runway
            </button>
          ) : (
            <span className="finance-runway__read">
              Cash guardrail read · funding routes unlocked.
            </span>
          )}
        </section>

        <section
          className="finance-mission"
          aria-labelledby="finance-mission-title"
        >
          <header>
            <div>
              <p>DECISION DECK · FUNDING</p>
              <h2 id="finance-mission-title">{PROJECT_NAME}</h2>
            </div>
            <span>INDUSTRY OWNER</span>
          </header>
          <dl className="finance-mission__brief">
            <div>
              <dt>Total request</dt>
              <dd>{amountLabel(PROJECT_TOTAL)} GCU</dd>
            </div>
            <div>
              <dt>Payment start</dt>
              <dd>Day 18</dd>
            </div>
            <div>
              <dt>Strategic link</dt>
              <dd>Capacity corridor</dd>
            </div>
          </dl>

          {!runwayRead ? (
            <div className="finance-mission__lock">
              <strong>Cash guardrail unread.</strong>
              <span>
                Finance cannot structure a request before seeing what the
                country can carry.
              </span>
            </div>
          ) : null}

          {runwayRead && phase === 'REQUEST' ? (
            <button
              className="finance-button finance-button--primary"
              type="button"
              onClick={openFundingRequest}
            >
              Open funding request
            </button>
          ) : null}

          {phase === 'STRUCTURE' && !fundingPath ? (
            <div
              className="finance-path-grid"
              aria-label="Funding path choices"
            >
              {FUNDING_PATHS.map((path) => (
                <button
                  className={
                    path.id === 'BALANCED' ? 'is-recommended' : undefined
                  }
                  key={path.id}
                  type="button"
                  onClick={() => chooseFundingPath(path)}
                >
                  <span>{path.shortLabel}</span>
                  <strong>{path.label}</strong>
                  <small>{path.detail}</small>
                </button>
              ))}
            </div>
          ) : null}

          {fundingPath && !published ? (
            <div className="finance-stack" aria-label="Local capital stack">
              <div className="finance-stack__heading">
                <div>
                  <p>CAPITAL STACK · {fundingPath.shortLabel}</p>
                  <strong>{fundingPath.label}</strong>
                </div>
                <button
                  type="button"
                  onClick={() => chooseFundingPath(fundingPath)}
                >
                  Change path
                </button>
              </div>
              <p>{fundingPath.consequence}</p>
              <div className="finance-source-grid">
                {fundingPath.sources.map((source) => {
                  const selected = selectedSourceIds.includes(source.id);
                  return (
                    <button
                      aria-pressed={selected}
                      className={`finance-source-card finance-source-card--${source.kind}${selected ? ' is-selected' : ''}`}
                      key={source.id}
                      type="button"
                      onClick={() => toggleSource(source)}
                    >
                      <span>{selected ? 'IN STACK' : 'ADD SOURCE'}</span>
                      <strong>{source.label}</strong>
                      <b>{amountLabel(source.amount)} GCU</b>
                      <small>{source.detail}</small>
                    </button>
                  );
                })}
              </div>
              <div className="finance-stack__totals">
                <span>
                  Confirmed stack{' '}
                  <b>
                    {amountLabel(stackAmount)} / {amountLabel(PROJECT_TOTAL)}{' '}
                    GCU
                  </b>
                </span>
                <span className={fundingGap ? 'is-warning' : 'is-ready'}>
                  {fundingGap
                    ? `Gap ${amountLabel(fundingGap)} GCU`
                    : 'Stack closes'}
                </span>
              </div>
              {stackClosed && !cashGuardrailMet ? (
                <div className="finance-stack__blocker">
                  <strong>Cannot record this route.</strong>
                  <span>
                    Treasury draw leaves{' '}
                    {formatBillion(runwayValues[firstGuardrailBreach]!)} by{' '}
                    {runwayLabels[firstGuardrailBreach]}, below the
                    {formatBillion(MINIMUM_BUFFER)} cash guardrail.
                  </span>
                  <button
                    className="finance-button"
                    type="button"
                    onClick={() =>
                      chooseFundingPath(
                        FUNDING_PATHS.find((path) => path.id === 'BALANCED')!,
                      )
                    }
                  >
                    Rebuild with balanced structure
                  </button>
                </div>
              ) : null}
              {canOpenReview && !reviewOpen ? (
                <button
                  className="finance-button finance-button--primary"
                  type="button"
                  onClick={openReview}
                >
                  Open publish review
                </button>
              ) : null}
            </div>
          ) : null}

          {reviewOpen && !published ? (
            <section
              className="finance-publish-review"
              aria-label="Local fiscal publish review"
            >
              <p>PUBLISH REVIEW · LOCAL ONLY</p>
              <h3>What this route would create</h3>
              <ul>
                <li>
                  {amountLabel(treasuryDraw)} GCU reserved from uncommitted
                  Treasury cash
                </li>
                <li>
                  {amountLabel(debtAmount)} GCU dedicated-bond preparation for
                  the Day 11 window
                </li>
                <li>
                  Industry owner confirmation and Captain approval stay required
                </li>
              </ul>
              <button
                className="finance-button finance-button--primary"
                type="button"
                onClick={recordPackage}
              >
                Record local funding route
              </button>
            </section>
          ) : null}

          {published ? (
            <div className="finance-mission__success">
              <strong>Funding route recorded for this rehearsal.</strong>
              <span>
                Cash, debt, and approvals stay clearly separated; no
                authoritative command was sent.
              </span>
              <button
                className="finance-button finance-button--primary"
                type="button"
                onClick={openNextTurn}
              >
                Open next funding turn
              </button>
            </div>
          ) : null}
        </section>
      </div>

      <section
        className="finance-command__ledger"
        aria-labelledby="finance-ledger-title"
      >
        <article>
          <p>FISCAL CONSEQUENCES</p>
          <h2>Every source leaves a different bill.</h2>
          <div className="finance-consequence-grid">
            <span>
              <b>Cash</b> Treasury funding protects time only while the buffer
              holds.
            </span>
            <span>
              <b>Debt</b> A bond opens a future maturity; it is not free cash.
            </span>
            <span>
              <b>Authority</b> Industry owns the project; Finance owns the
              funding route.
            </span>
          </div>
        </article>
        <article>
          <p>FISCAL REPLAY</p>
          <h2 id="finance-ledger-title">What this turn changed.</h2>
          <ol>
            {log.map((entry, index) => (
              <li key={`${index}-${entry}`}>{entry}</li>
            ))}
          </ol>
          <small>
            Local rehearsal only · no Treasury transaction, debt issue, or
            approval is submitted.
          </small>
        </article>
      </section>
    </section>
  );
}
