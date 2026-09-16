import { useState } from 'react';

import type { PrototypeWorldBriefProjection } from './contracts.js';

type AgendaStatus = 'ACTIVE' | 'UNDER_REVIEW' | 'RESOLVED';
type ProposalDecision =
  | 'PENDING'
  | 'APPROVED'
  | 'REVISION_REQUESTED'
  | 'JOINT_PACKAGE_REQUESTED'
  | 'REJECTED';
type CoordinationMode = 'NORMAL' | 'ELEVATED' | 'EMERGENCY';
type MapPointId = 'CABINET' | 'GRANARY' | 'TREASURY' | 'RESERVE' | 'HARBOUR';

interface AgendaIssue {
  readonly id: string;
  readonly title: string;
  readonly lead: string;
  readonly status: AgendaStatus;
}

interface MapPoint {
  readonly id: MapPointId;
  readonly label: string;
  readonly kicker: string;
  readonly x: number;
  readonly y: number;
  readonly signal: string;
  readonly tone: 'amber' | 'coral' | 'blue' | 'mint';
}

interface CaptainCommandCenterProps {
  readonly projection: PrototypeWorldBriefProjection;
  readonly onNotice: (notice: string) => void;
}

const STRATEGIES = [
  'Strategic Self-Sufficiency',
  'Export-Led Industrialisation',
  'Technology Leadership',
  'Green Transition',
  'Infrastructure-Led Growth',
  'Social Development',
] as const;

const PRIORITIES = [
  'Food Security',
  'Price Stability',
  'Employment',
  'Fiscal Sustainability',
  'External Stability',
  'Energy Security',
  'Productivity',
] as const;

const INITIAL_AGENDA: readonly AgendaIssue[] = [
  {
    id: 'AGENDA-FOOD',
    title: 'Protect the food buffer',
    lead: 'Trade · Finance · Social',
    status: 'ACTIVE',
  },
  {
    id: 'AGENDA-TREASURY',
    title: 'Keep the payment window open',
    lead: 'Finance · Central Bank',
    status: 'UNDER_REVIEW',
  },
  {
    id: 'AGENDA-PRICE',
    title: 'Contain price pressure',
    lead: 'Central Bank · Trade',
    status: 'ACTIVE',
  },
];

const MAP_POINTS: readonly MapPoint[] = [
  {
    id: 'CABINET',
    label: 'Capital District',
    kicker: 'Cabinet chamber',
    x: 45,
    y: 43,
    signal: 'Set the national line',
    tone: 'amber',
  },
  {
    id: 'GRANARY',
    label: 'Eastbank Granary',
    kicker: 'Food buffer',
    x: 72,
    y: 61,
    signal: '18k tonnes reserved',
    tone: 'coral',
  },
  {
    id: 'TREASURY',
    label: 'Treasury Quarter',
    kicker: 'Payment window',
    x: 31,
    y: 65,
    signal: 'Commitment is queued',
    tone: 'amber',
  },
  {
    id: 'RESERVE',
    label: 'Reserve Hill',
    kicker: 'Crisis line',
    x: 54,
    y: 23,
    signal: 'Price pressure rising',
    tone: 'blue',
  },
  {
    id: 'HARBOUR',
    label: 'South Coast Port',
    kicker: 'External route',
    x: 20,
    y: 42,
    signal: 'Capacity can be called',
    tone: 'mint',
  },
];

const DECISION_COPY: Readonly<
  Record<Exclude<ProposalDecision, 'PENDING'>, { label: string; log: string }>
> = {
  APPROVED: {
    label: 'Approve local draft',
    log: 'Food buffer draft marked approved',
  },
  REVISION_REQUESTED: {
    label: 'Request revision',
    log: 'Food buffer returned for a smaller resource call',
  },
  JOINT_PACKAGE_REQUESTED: {
    label: 'Call joint package',
    log: 'Joint package called across Trade, Finance and Social',
  },
  REJECTED: {
    label: 'Reject local draft',
    log: 'Food buffer draft rejected for this planning turn',
  },
};

function metricValue(
  projection: PrototypeWorldBriefProjection,
  metricId: string,
  fallback: string,
): string {
  const metric = projection.metrics.find((item) => item.id === metricId);
  return metric ? `${metric.displayValue} ${metric.unit}` : fallback;
}

function decisionLabel(decision: ProposalDecision): string {
  return decision === 'PENDING'
    ? 'Awaiting your call'
    : decision.replaceAll('_', ' ').toLowerCase();
}

function agendaStatusLabel(status: AgendaStatus): string {
  return status === 'UNDER_REVIEW' ? 'IN REVIEW' : status;
}

export function CaptainCommandCenter({
  projection,
  onNotice,
}: CaptainCommandCenterProps) {
  const [selectedPointId, setSelectedPointId] = useState<MapPointId>('GRANARY');
  const [strategy, setStrategy] = useState<(typeof STRATEGIES)[number]>(
    'Strategic Self-Sufficiency',
  );
  const [priority, setPriority] =
    useState<(typeof PRIORITIES)[number]>('Food Security');
  const [agenda, setAgenda] = useState<readonly AgendaIssue[]>(INITIAL_AGENDA);
  const [politicalCapital, setPoliticalCapital] = useState(28);
  const [supportCommitted, setSupportCommitted] = useState(false);
  const [decision, setDecision] = useState<ProposalDecision>('PENDING');
  const [coordination, setCoordination] = useState<CoordinationMode>('NORMAL');
  const [fieldFileOpen, setFieldFileOpen] = useState(true);
  const [log, setLog] = useState<readonly string[]>([
    'Map table opened · local command rehearsal',
  ]);

  const selectedPoint =
    MAP_POINTS.find((point) => point.id === selectedPointId) ?? MAP_POINTS[0]!;
  const activeAgenda = agenda.filter((item) => item.status !== 'RESOLVED');
  const foodSignal = metricValue(projection, 'available-grain', '128k tonnes');
  const progress = [
    supportCommitted,
    decision !== 'PENDING',
    coordination !== 'NORMAL',
  ].filter(Boolean).length;

  const addLog = (entry: string) => {
    setLog((current) => [entry, ...current].slice(0, 4));
  };

  const focusPoint = (id: MapPointId) => {
    const point = MAP_POINTS.find((item) => item.id === id)!;
    setSelectedPointId(id);
    setFieldFileOpen(true);
    onNotice(`${point.label} selected on the local Captain map.`);
  };

  const stageDirection = () => {
    addLog(`National line staged · ${strategy} / ${priority}`);
    onNotice(
      `Local national direction staged: ${strategy}, prioritising ${priority}.`,
    );
  };

  const resolveAgenda = (id: string) => {
    const issue = agenda.find((item) => item.id === id);
    if (!issue || issue.status === 'RESOLVED') return;
    setAgenda((current) =>
      current.map((item) =>
        item.id === id ? { ...item, status: 'RESOLVED' } : item,
      ),
    );
    addLog(`Cabinet seat cleared · ${issue.title}`);
    onNotice(`Local agenda update: ${issue.title} marked resolved.`);
  };

  const makeDecision = (next: Exclude<ProposalDecision, 'PENDING'>) => {
    setDecision(next);
    addLog(DECISION_COPY[next].log);
    onNotice(
      `${DECISION_COPY[next].label} recorded locally. No command was submitted.`,
    );
  };

  const commitSupport = () => {
    if (supportCommitted || politicalCapital < 4) return;
    setSupportCommitted(true);
    setPoliticalCapital((current) => current - 4);
    addLog('Four Political Capital committed to food-buffer coordination');
    onNotice('4 Political Capital reserved in this local rehearsal.');
  };

  const setPosture = (mode: CoordinationMode) => {
    setCoordination(mode);
    addLog(`Coordination posture staged · ${mode.toLowerCase()}`);
    onNotice(
      mode === 'EMERGENCY'
        ? 'Emergency posture is preview-only; the authority route remains required.'
        : `Local coordination posture staged: ${mode}.`,
    );
  };

  const renderFieldFile = () => {
    switch (selectedPointId) {
      case 'CABINET':
        return (
          <>
            <p className="captain-map-file__eyebrow">
              CABINET CARD · DIRECTION
            </p>
            <h2>Choose the line.</h2>
            <div className="captain-map-file__fields">
              <label>
                <span>National strategy</span>
                <select
                  value={strategy}
                  onChange={(event) =>
                    setStrategy(
                      event.target.value as (typeof STRATEGIES)[number],
                    )
                  }
                >
                  {STRATEGIES.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>First priority</span>
                <select
                  value={priority}
                  onChange={(event) =>
                    setPriority(
                      event.target.value as (typeof PRIORITIES)[number],
                    )
                  }
                >
                  {PRIORITIES.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
            </div>
            <button
              className="captain-map-button captain-map-button--primary"
              type="button"
              onClick={stageDirection}
            >
              Pin to the map
            </button>
          </>
        );
      case 'GRANARY':
        return (
          <>
            <p className="captain-map-file__eyebrow">FOOD BUFFER · DECISION</p>
            <h2>Make the call.</h2>
            <p className="captain-map-file__brief">
              Trade can release stock and open a targeted import route. Finance
              and Social stay in the chain.
            </p>
            <dl className="captain-map-file__facts">
              <div>
                <dt>Buffer</dt>
                <dd>{foodSignal} · 18k reserved</dd>
              </div>
              <div>
                <dt>Call</dt>
                <dd>0.32 bn GCU · port capacity</dd>
              </div>
              <div>
                <dt>State</dt>
                <dd>{decisionLabel(decision)}</dd>
              </div>
            </dl>
            <div
              className="captain-map-file__actions"
              aria-label="Food buffer decision options"
            >
              {(
                Object.keys(DECISION_COPY) as Exclude<
                  ProposalDecision,
                  'PENDING'
                >[]
              ).map((item) => (
                <button
                  className={
                    item === 'JOINT_PACKAGE_REQUESTED'
                      ? 'captain-map-button captain-map-button--primary'
                      : 'captain-map-button'
                  }
                  key={item}
                  type="button"
                  onClick={() => makeDecision(item)}
                >
                  {DECISION_COPY[item].label}
                </button>
              ))}
            </div>
          </>
        );
      case 'TREASURY':
        return (
          <>
            <p className="captain-map-file__eyebrow">
              TREASURY QUARTER · GUARDRAIL
            </p>
            <h2>Protect the window.</h2>
            <p className="captain-map-file__brief">
              The Captain can name the conflict and pull offices together, but
              fiscal space stays with Finance.
            </p>
            <dl className="captain-map-file__facts">
              <div>
                <dt>Cash window</dt>
                <dd>
                  {metricValue(projection, 'treasury-cash', '1.84 bn GCU')}
                </dd>
              </div>
              <div>
                <dt>Cannot bypass</dt>
                <dd>Fiscal space · reserve terms</dd>
              </div>
            </dl>
            <button
              className="captain-map-button captain-map-button--primary"
              type="button"
              onClick={() => {
                addLog('Finance asked to redraw the payment-window package');
                onNotice('Local request for Finance revision recorded.');
              }}
            >
              Request Finance revision
            </button>
          </>
        );
      case 'RESERVE':
        return (
          <>
            <p className="captain-map-file__eyebrow">
              RESERVE HILL · CRISIS LINE
            </p>
            <h2>Set the tempo.</h2>
            <p className="captain-map-file__brief">
              Inflation is rising; this changes the coordination rhythm, not the
              Central Bank instrument.
            </p>
            <div
              className="captain-posture-grid"
              role="group"
              aria-label="Coordination posture"
            >
              {(['NORMAL', 'ELEVATED', 'EMERGENCY'] as CoordinationMode[]).map(
                (mode) => (
                  <button
                    aria-pressed={coordination === mode}
                    className={coordination === mode ? 'is-active' : undefined}
                    key={mode}
                    type="button"
                    onClick={() => setPosture(mode)}
                  >
                    <strong>{mode}</strong>
                    <small>
                      {mode === 'NORMAL'
                        ? 'Cabinet rhythm'
                        : mode === 'ELEVATED'
                          ? 'Cross-office priority'
                          : 'Authority route required'}
                    </small>
                  </button>
                ),
              )}
            </div>
          </>
        );
      case 'HARBOUR':
        return (
          <>
            <p className="captain-map-file__eyebrow">
              SOUTH COAST PORT · SUPPORT
            </p>
            <h2>Back the route.</h2>
            <p className="captain-map-file__brief">
              A political push can protect the coordination slot; Trade still
              owns the operational move.
            </p>
            <dl className="captain-map-file__facts">
              <div>
                <dt>Available</dt>
                <dd>{politicalCapital} Political Capital</dd>
              </div>
              <div>
                <dt>Cost</dt>
                <dd>4 PC for food-buffer coordination</dd>
              </div>
            </dl>
            <button
              className="captain-map-button captain-map-button--primary"
              disabled={supportCommitted || politicalCapital < 4}
              type="button"
              onClick={commitSupport}
            >
              {supportCommitted
                ? 'Support committed this turn'
                : 'Commit 4 PC to the route'}
            </button>
          </>
        );
    }
  };

  return (
    <section
      className="captain-map-command"
      aria-labelledby="captain-map-title"
    >
      <header className="captain-map-command__header">
        <div>
          <p>CAPTAIN · NORTHSTAR · TURN 78</p>
          <h1 id="captain-map-title">National map command</h1>
          <span>Read the pressure. Pick a place. Make one move.</span>
        </div>
        <dl
          className="captain-map-hud"
          aria-label="Current national command state"
        >
          <div>
            <dt>Political Capital</dt>
            <dd>{politicalCapital} PC</dd>
          </div>
          <div>
            <dt>Cabinet seats</dt>
            <dd>{activeAgenda.length} / 3</dd>
          </div>
          <div>
            <dt>Posture</dt>
            <dd>{coordination}</dd>
          </div>
        </dl>
      </header>

      <section
        className="captain-map-command__playloop"
        aria-label="Command turn loop"
      >
        <span>
          <b>01</b> Scan the map
        </span>
        <i aria-hidden="true" />
        <span>
          <b>02</b> Commit support
        </span>
        <i aria-hidden="true" />
        <span>
          <b>03</b> Resolve a call
        </span>
        <strong>{progress} / 3 moves locked</strong>
      </section>

      <div className="captain-map-command__board">
        <section
          className="captain-map-stage"
          aria-label="Northstar national operations map"
        >
          <div className="captain-map-stage__legend" aria-hidden="true">
            <span>
              <i className="is-coral" /> Immediate call
            </span>
            <span>
              <i className="is-amber" /> Cabinet pressure
            </span>
            <span>
              <i className="is-blue" /> Watch line
            </span>
          </div>
          <svg
            className="captain-map-stage__art"
            viewBox="0 0 1000 620"
            role="img"
            aria-label="Illustrated map of Northstar with a coast, river, roads and five operational districts"
          >
            <defs>
              <linearGradient id="captain-sea" x1="0" x2="1" y1="0" y2="1">
                <stop stopColor="#173b56" />
                <stop offset="1" stopColor="#0e2438" />
              </linearGradient>
              <linearGradient id="captain-land" x1="0" x2=".85" y1="0" y2="1">
                <stop stopColor="#d9c78b" />
                <stop offset="1" stopColor="#9fb477" />
              </linearGradient>
              <pattern
                id="captain-grid"
                height="38"
                patternUnits="userSpaceOnUse"
                width="38"
              >
                <path
                  d="M 38 0 L 0 0 0 38"
                  fill="none"
                  stroke="#ffffff"
                  strokeOpacity=".11"
                  strokeWidth="1"
                />
              </pattern>
            </defs>
            <rect fill="url(#captain-sea)" height="620" width="1000" />
            <path
              d="M130 34 C265 17 335 67 434 43 C549 16 644 72 757 44 C852 21 907 88 915 158 L864 256 L920 346 L829 443 L830 571 L676 603 L538 555 L442 593 L326 536 L204 551 L104 453 L152 361 L82 260 Z"
              fill="url(#captain-land)"
              stroke="#f6dda0"
              strokeWidth="7"
            />
            <path
              d="M117 250 C279 243 354 339 445 330 C533 321 583 255 691 274 C785 291 815 365 920 349"
              fill="none"
              stroke="#5a9ac2"
              strokeLinecap="round"
              strokeWidth="19"
            />
            <path
              d="M117 250 C279 243 354 339 445 330 C533 321 583 255 691 274 C785 291 815 365 920 349"
              fill="none"
              stroke="#c8e2e4"
              strokeDasharray="4 18"
              strokeLinecap="round"
              strokeWidth="3"
            />
            <g
              fill="none"
              opacity=".72"
              stroke="#695b39"
              strokeLinecap="round"
              strokeWidth="7"
            >
              <path d="M215 427 C342 366 418 291 510 150" />
              <path d="M303 489 C409 413 614 449 753 362" />
              <path d="M460 89 C495 204 467 285 451 388" />
            </g>
            <g fill="#7e935e" opacity=".54">
              <circle cx="350" cy="195" r="61" />
              <circle cx="655" cy="151" r="73" />
              <circle cx="740" cy="453" r="86" />
              <circle cx="270" cy="353" r="47" />
            </g>
            <rect fill="url(#captain-grid)" height="620" width="1000" />
            <path d="M194 85 L392 85" stroke="#f7e5ad" strokeWidth="2" />
            <text
              fill="#f7e5ad"
              fontFamily="ui-monospace, monospace"
              fontSize="18"
              letterSpacing="4"
              x="194"
              y="68"
            >
              NORTHSTAR OPERATIONS MAP
            </text>
            <text
              fill="#f7e5ad"
              fontFamily="ui-monospace, monospace"
              fontSize="13"
              letterSpacing="3"
              x="803"
              y="556"
            >
              TURN 78
            </text>
          </svg>
          <div
            className="captain-map-stage__markers"
            role="list"
            aria-label="Map command points"
          >
            {MAP_POINTS.map((point) => (
              <button
                aria-pressed={point.id === selectedPointId}
                className={`captain-map-marker captain-map-marker--${point.tone}${point.id === selectedPointId ? ' is-selected' : ''}`}
                key={point.id}
                style={{ left: `${point.x}%`, top: `${point.y}%` }}
                type="button"
                onClick={() => focusPoint(point.id)}
              >
                <i aria-hidden="true" />
                <span>{point.kicker}</span>
                <strong>{point.label}</strong>
                <small>{point.signal}</small>
              </button>
            ))}
          </div>
          <div className="captain-map-stage__caption">
            <span>Live local scenario</span>
            <strong>
              {strategy} · {priority}
            </strong>
          </div>
        </section>

        <aside
          className={`captain-map-file captain-map-file--${selectedPoint.tone}${fieldFileOpen ? ' is-open' : ''}`}
          aria-live="polite"
        >
          <header>
            <div>
              <span>FIELD FILE</span>
              <strong>{selectedPoint.label}</strong>
            </div>
            <button
              aria-label={
                fieldFileOpen
                  ? 'Collapse selected field file'
                  : 'Open selected field file'
              }
              className="captain-map-file__toggle"
              type="button"
              onClick={() => setFieldFileOpen((current) => !current)}
            >
              {fieldFileOpen ? '−' : '+'}
            </button>
          </header>
          {fieldFileOpen ? (
            <div className="captain-map-file__body">{renderFieldFile()}</div>
          ) : (
            <p className="captain-map-file__collapsed">
              Open the file to make a move.
            </p>
          )}
        </aside>
      </div>

      <section
        className="captain-map-command__ledger"
        aria-labelledby="captain-ledger-title"
      >
        <div className="captain-map-command__agenda">
          <div className="captain-map-section-heading">
            <p>CABINET TABLE</p>
            <h2>Three seats. One direction.</h2>
          </div>
          <div
            className="captain-map-agenda-list"
            role="list"
            aria-label="Cabinet agenda"
          >
            {agenda.map((item, index) => (
              <article
                className={
                  item.status === 'RESOLVED' ? 'is-resolved' : undefined
                }
                key={item.id}
                role="listitem"
              >
                <span>
                  SEAT 0{index + 1} · {agendaStatusLabel(item.status)}
                </span>
                <strong>{item.title}</strong>
                <small>{item.lead}</small>
                <button
                  disabled={item.status === 'RESOLVED'}
                  type="button"
                  onClick={() => resolveAgenda(item.id)}
                >
                  {item.status === 'RESOLVED' ? 'Cleared' : 'Clear seat'}
                </button>
              </article>
            ))}
          </div>
        </div>
        <aside
          className="captain-map-command__record"
          aria-labelledby="captain-ledger-title"
        >
          <div className="captain-map-section-heading">
            <p>TURN RECORD</p>
            <h2 id="captain-ledger-title">Your moves leave a trace.</h2>
          </div>
          <ol>
            {log.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ol>
          <small>
            Local rehearsal only · no proposal, approval, or command is
            submitted.
          </small>
        </aside>
      </section>
    </section>
  );
}
