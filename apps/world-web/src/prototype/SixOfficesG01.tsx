import { useEffect, useState } from 'react';

import type {
  PrototypeBriefEvent,
  PrototypeWorldBriefProjection,
} from './contracts.js';
import { readableProjection, type PrototypeViewState } from './state.js';

type NavGroupId =
  'situation' | 'action' | 'collaboration' | 'international' | 'followup';

interface NavLeaf {
  readonly pageId: string;
  readonly label: string;
  readonly implemented: boolean;
}

interface NavGroup {
  readonly id: NavGroupId;
  readonly label: string;
  readonly leaves: readonly NavLeaf[];
}

const NAV_GROUPS: readonly NavGroup[] = [
  {
    id: 'situation',
    label: 'Situation',
    leaves: [
      { pageId: 'G01', label: 'Command Brief', implemented: true },
      { pageId: 'G02', label: 'Nation Overview', implemented: false },
      { pageId: 'T01', label: 'Markets & Partners', implemented: false },
    ],
  },
  {
    id: 'action',
    label: 'Action',
    leaves: [
      { pageId: 'G07', label: 'Policy Board', implemented: false },
      { pageId: 'T03', label: 'Spot Market & Fulfilment', implemented: false },
      { pageId: 'T04', label: 'Bilateral Deals', implemented: false },
    ],
  },
  {
    id: 'collaboration',
    label: 'Collaboration',
    leaves: [
      { pageId: 'G03', label: 'Cross-Office Requests', implemented: false },
      { pageId: 'G04', label: 'Joint Plans & Approval', implemented: false },
    ],
  },
  {
    id: 'international',
    label: 'International',
    leaves: [
      { pageId: 'T07', label: 'Loans & Infrastructure', implemented: false },
      {
        pageId: 'T09',
        label: 'Pacts & Economic Diplomacy',
        implemented: false,
      },
    ],
  },
  {
    id: 'followup',
    label: 'Follow-up',
    leaves: [
      { pageId: 'G05', label: 'Execution & Alerts', implemented: false },
      { pageId: 'G06', label: 'Review & Record', implemented: false },
    ],
  },
];

const EVENT_COPY: Readonly<
  Record<
    string,
    {
      readonly category: 'Intel' | 'Opportunity' | 'Follow-up';
      readonly title: string;
      readonly before: string;
      readonly after: string;
      readonly source: string;
      readonly chain: readonly string[];
      readonly nextStep: string;
    }
  >
> = {
  'EVENT-PROTOTYPE-001': {
    category: 'Intel',
    title: 'Grain reserve locks supply',
    before: '146k tonnes',
    after: '128k tonnes',
    source: 'Reserve tagged',
    chain: ['Reserve tagged', 'Free grain falls', 'Food buffer tightens'],
    nextStep: 'Inspect grain and trade levers',
  },
  'EVENT-PROTOTYPE-002': {
    category: 'Follow-up',
    title: 'Treasury queue claims cash',
    before: '2.06 bn GCU',
    after: '1.84 bn GCU',
    source: 'Payment commitment recorded',
    chain: [
      'Commitment queued',
      'Free cash falls',
      'Payment timing needs a check',
    ],
    nextStep: 'Inspect the finance dependency',
  },
  'EVENT-PROTOTYPE-003': {
    category: 'Opportunity',
    title: 'Labour market softens',
    before: '6.8% unemployment',
    after: '7.1% unemployment',
    source: 'Authorized labour report',
    chain: [
      'Labour data lands',
      'Unemployment rises',
      'Re-rank import and industry plays',
    ],
    nextStep: 'Open the Social Office collaboration route',
  },
};

function eventCopy(event: PrototypeBriefEvent) {
  return (
    EVENT_COPY[event.eventId] ?? {
      category: 'Intel' as const,
      title: event.title,
      before: 'Source unknown',
      after: 'Current projection',
      source: 'Source unknown',
      chain: ['Recorded event', 'Impact under review', 'Source unknown'],
      nextStep: 'Open object evidence',
    }
  );
}

function StateScreen({
  state,
  onRetry,
}: {
  readonly state: PrototypeViewState;
  readonly onRetry: () => void;
}) {
  const reason = 'reason' in state ? state.reason : 'No readable projection.';
  const content =
    state.status === 'loading'
      ? ['Loading command brief', 'Waiting for the scoped projection.']
      : state.status === 'unauthorized'
        ? ['Office access changed', state.reason]
        : ['Projection unavailable', reason];
  const danger = state.status === 'unauthorized';
  return (
    <main className="six-state-screen" id="six-offices-main">
      <section
        className={`six-state-card${danger ? ' six-state-card--danger' : ''}`}
        role={danger ? 'alert' : 'status'}
        aria-live={danger ? 'assertive' : 'polite'}
      >
        <p>WORLD SIMULATION · G01</p>
        <h1>{content[0]}</h1>
        <span>{content[1]}</span>
        {state.status !== 'loading' ? (
          <button
            className="six-button six-button--primary"
            type="button"
            onClick={onRetry}
          >
            Refresh intel
          </button>
        ) : null}
      </section>
    </main>
  );
}

function OfficeSidebar({
  activePage,
  mobileOpen,
  onNavigate,
  onClose,
}: {
  readonly activePage: string;
  readonly mobileOpen: boolean;
  readonly onNavigate: (leaf: NavLeaf) => void;
  readonly onClose: () => void;
}) {
  const [open, setOpen] = useState<Readonly<Record<NavGroupId, boolean>>>(
    Object.freeze({
      situation: true,
      action: true,
      collaboration: true,
      international: false,
      followup: true,
    }),
  );
  return (
    <aside
      id="six-workspace-navigation"
      className={`six-sidebar${mobileOpen ? ' is-open' : ''}`}
      aria-label="Trade and Foreign Affairs workspace navigation"
    >
      <div className="six-sidebar__mobile-heading">
        <strong>Workspace navigation</strong>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close workspace navigation"
        >
          Close
        </button>
      </div>
      <div className="six-sidebar__identity">
        <span>Acting office</span>
        <strong>Trade & Foreign Affairs</strong>
        <small>TRADE · verified appointment</small>
      </div>
      <div className="six-sidebar__counts" aria-label="work summary">
        <span>
          <strong>2</strong> on your desk
        </span>
        <span>
          <strong>1</strong> hard blocker
        </span>
      </div>
      <nav>
        {NAV_GROUPS.map((group) => {
          const isOpen = open[group.id];
          return (
            <section className="six-nav-group" key={group.id}>
              <button
                type="button"
                className="six-nav-group__toggle"
                aria-expanded={isOpen}
                onClick={() =>
                  setOpen((current) => ({
                    ...current,
                    [group.id]: !current[group.id],
                  }))
                }
              >
                <span>{group.label}</span>
                <span aria-hidden="true">{isOpen ? '−' : '+'}</span>
              </button>
              {isOpen ? (
                <ul>
                  {group.leaves.map((leaf) => {
                    const active = leaf.pageId === activePage;
                    return (
                      <li key={leaf.pageId}>
                        <button
                          type="button"
                          aria-current={active ? 'page' : undefined}
                          className={active ? 'is-active' : undefined}
                          onClick={() => {
                            onNavigate(leaf);
                            onClose();
                          }}
                        >
                          <span>{leaf.label}</span>
                          <small>{leaf.pageId}</small>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </section>
          );
        })}
      </nav>
      <p className="six-sidebar__note">
        All specified leaves remain visible. Only G01 is wired in this
        candidate.
      </p>
    </aside>
  );
}

function CausalCard({
  event,
  selected,
  onSelect,
}: {
  readonly event: PrototypeBriefEvent;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  const copy = eventCopy(event);
  return (
    <button
      className={`six-causal-card${selected ? ' is-selected' : ''}`}
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className={`six-category six-category--${copy.category}`}>
        {copy.category}
      </span>
      <strong>{copy.title}</strong>
      <span className="six-causal-card__values">
        <small>{copy.before}</small>
        <b aria-hidden="true">→</b>
        <small>{copy.after}</small>
      </span>
      <span className="six-causal-card__footer">
        <small>{event.occurredAtLabel}</small>
        <span aria-hidden="true">Trace cause →</span>
      </span>
    </button>
  );
}

function CausalDetail({
  event,
  projection,
}: {
  readonly event: PrototypeBriefEvent;
  readonly projection: PrototypeWorldBriefProjection;
}) {
  const copy = eventCopy(event);
  const affectedMetrics = projection.metrics.filter((metric) =>
    event.affectedMetricIds.includes(metric.id),
  );
  return (
    <section
      className="six-causal-detail"
      aria-labelledby="causal-detail-title"
    >
      <div className="six-panel-heading">
        <div>
          <p>Selected causal chain</p>
          <h2 id="causal-detail-title">{copy.title}</h2>
        </div>
        <span>World v{event.worldVersion}</span>
      </div>
      <ol className="six-chain">
        {copy.chain.map((item, index) => (
          <li key={item}>
            <span>{index + 1}</span>
            <strong>{item}</strong>
          </li>
        ))}
      </ol>
      <dl className="six-fact-grid">
        <div>
          <dt>Trigger</dt>
          <dd>{copy.source}</dd>
        </div>
        <div>
          <dt>Affected object</dt>
          <dd>
            {affectedMetrics.map((metric) => metric.label).join(', ') ||
              'Source unknown'}
          </dd>
        </div>
        <div>
          <dt>Owning Office</dt>
          <dd>{event.ownerOfficeId}</dd>
        </div>
        <div>
          <dt>Brief cut-off</dt>
          <dd>World v{projection.watermark.worldVersion}</dd>
        </div>
      </dl>
      <p className="six-boundary">
        Trace, not a browser-side ruling. Unknown causes stay marked.
      </p>
    </section>
  );
}

function DecisionPanel({
  event,
  onOpenEvidence,
}: {
  readonly event: PrototypeBriefEvent;
  readonly onOpenEvidence: () => void;
}) {
  const copy = eventCopy(event);
  return (
    <aside className="six-decisions" aria-labelledby="decision-title">
      <div className="six-panel-heading">
        <div>
          <p>Your move</p>
          <h2 id="decision-title">Choose a legal next move</h2>
        </div>
        <span>2 on your desk</span>
      </div>
      <article className="six-decision-card six-decision-card--primary">
        <span>Priority</span>
        <h3>{copy.nextStep}</h3>
        <p>Check object, version, Office.</p>
        <button
          className="six-button six-button--primary"
          type="button"
          onClick={onOpenEvidence}
        >
          Open evidence
        </button>
      </article>
      <article className="six-decision-card">
        <span>Team play</span>
        <h3>Open a cross-office request</h3>
        <p>Ask—do not assume resources.</p>
        <button
          className="six-button six-button--secondary"
          type="button"
          onClick={onOpenEvidence}
        >
          See gap & owner
        </button>
      </article>
      <article className="six-decision-card">
        <span>Track</span>
        <h3>Review the latest world receipt</h3>
        <p>Accepted, pending, applied: distinct.</p>
        <a href="#six-execution-track" className="six-text-link">
          Open execution track →
        </a>
      </article>
    </aside>
  );
}

function ExecutionTrack({
  projection,
}: {
  readonly projection: PrototypeWorldBriefProjection;
}) {
  const receipt = projection.recentReceipt;
  return (
    <section
      className="six-execution"
      id="six-execution-track"
      aria-labelledby="execution-title"
    >
      <div className="six-panel-heading">
        <div>
          <p>Action track</p>
          <h2 id="execution-title">World runs while you read</h2>
        </div>
        <span>Last sync {projection.simulationDateLabel}</span>
      </div>
      <ol>
        <li className="is-complete">
          <span>1</span>
          <div>
            <strong>Payment commitment recorded</strong>
            <small>World v1841 · fact queue</small>
          </div>
        </li>
        <li className="is-active">
          <span>2</span>
          <div>
            <strong>Intel refreshed</strong>
            <small>
              World v{projection.watermark.worldVersion} · event #
              {projection.watermark.eventSequence}
            </small>
          </div>
        </li>
        <li>
          <span>3</span>
          <div>
            <strong>Awaiting an authorized move</strong>
            <small>UI never invents completion.</small>
          </div>
        </li>
      </ol>
      {receipt ? (
        <p className="six-receipt-line">
          Latest final receipt: <strong>{receipt.outcome}</strong> · World v
          {receipt.worldVersionBefore ?? '—'} → v
          {receipt.worldVersionAfter ?? '—'} · {receipt.eventIds.length} events
        </p>
      ) : (
        <p className="six-receipt-line">No final receipt in this projection.</p>
      )}
    </section>
  );
}

function EmptyBrief() {
  return (
    <section className="six-empty-brief" aria-labelledby="empty-brief-title">
      <p>Quiet cycle</p>
      <h2 id="empty-brief-title">No high-priority offline changes.</h2>
      <span>World still runs. Inspect an authorized object or move.</span>
    </section>
  );
}

export function SixOfficesG01({
  state,
  onRetry,
}: {
  readonly state: PrototypeViewState;
  readonly onRetry: () => void;
}) {
  const projection = readableProjection(state);
  const [selectedEventId, setSelectedEventId] = useState('EVENT-PROTOTYPE-001');
  const [activePage, setActivePage] = useState('G01');
  const [unavailablePage, setUnavailablePage] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!projection) return;
    if (!projection.events.some((event) => event.eventId === selectedEventId)) {
      setSelectedEventId(projection.events[0]?.eventId ?? '');
    }
  }, [projection, selectedEventId]);

  if (
    !projection ||
    state.status === 'loading' ||
    state.status === 'unauthorized'
  ) {
    return <StateScreen state={state} onRetry={onRetry} />;
  }

  const selectedEvent =
    projection.events.find((event) => event.eventId === selectedEventId) ??
    projection.events[0];

  return (
    <div className="six-offices">
      <a className="six-skip-link" href="#six-offices-main">
        Skip to command brief
      </a>
      <header className="six-topbar">
        <div className="six-brand">
          <span aria-hidden="true">E</span>
          <div>
            <small>ECONMIND WORLD SIMULATION</small>
            <strong>{projection.countryLabel}</strong>
          </div>
        </div>
        <button
          className="six-mobile-nav-toggle"
          type="button"
          aria-controls="six-workspace-navigation"
          aria-expanded={mobileNavOpen}
          onClick={() => setMobileNavOpen((open) => !open)}
        >
          Menu
        </button>
        <dl className="six-clock" aria-label="world and simulation clocks">
          <div>
            <dt>Simulation time</dt>
            <dd>{projection.simulationDateLabel}</dd>
          </div>
          <div>
            <dt>World clock</dt>
            <dd>10× · {projection.seasonDayLabel}</dd>
          </div>
          <div>
            <dt>Sync version</dt>
            <dd>World v{projection.watermark.worldVersion}</dd>
          </div>
        </dl>
        <div className="six-topbar__status">
          <span>
            <i aria-hidden="true" />
            {state.status === 'stale' ? 'Projection stale' : 'World running'}
          </span>
          <small>
            {projection.classification.replace('_', ' ')} ·{' '}
            {projection.authorizationVersion ??
              'Authorization revision unavailable'}
          </small>
        </div>
      </header>
      <div className="six-layout">
        {mobileNavOpen ? (
          <button
            className="six-sidebar-backdrop"
            type="button"
            aria-label="Close workspace navigation"
            onClick={() => setMobileNavOpen(false)}
          />
        ) : null}
        <OfficeSidebar
          activePage={activePage}
          mobileOpen={mobileNavOpen}
          onNavigate={(leaf) => {
            setActivePage(leaf.pageId);
            setUnavailablePage(leaf.implemented ? null : leaf.pageId);
          }}
          onClose={() => setMobileNavOpen(false)}
        />
        <main className="six-main" id="six-offices-main">
          <header className="six-page-heading">
            <div>
              <p>G01 · Return / Command Brief</p>
              <h1>Offline changed the board. Pick your next move.</h1>
              <span>
                Since last brief → World v{projection.watermark.worldVersion}.
                Acting Office: Trade.
              </span>
            </div>
            <div className="six-page-heading__resources">
              <span>Available now</span>
              <strong>128k grain · 1.84 bn GCU</strong>
              <small>Local typed mock. Not World State.</small>
            </div>
          </header>

          {state.status === 'stale' ? (
            <section className="six-stale-banner" role="status">
              <strong>Projection behind authority.</strong>
              <span>Read it, then refresh before any real submission.</span>
              <button
                className="six-button six-button--secondary"
                type="button"
                onClick={onRetry}
              >
                Refresh projection
              </button>
            </section>
          ) : null}
          {unavailablePage ? (
            <section className="six-unavailable" role="status">
              <strong>{unavailablePage} remains in navigation.</strong>
              <span>
                Its route and authorized query are not wired. No empty screen,
                no invented data.
              </span>
              <button
                className="six-button six-button--secondary"
                type="button"
                onClick={() => {
                  setActivePage('G01');
                  setUnavailablePage(null);
                }}
              >
                Return to G01
              </button>
            </section>
          ) : projection.metrics.length === 0 &&
            projection.events.length === 0 ? (
            <EmptyBrief />
          ) : (
            <>
              <section
                className="six-metric-grid"
                aria-label="shared nation metrics"
              >
                {projection.metrics.map((metric) => (
                  <article
                    key={metric.id}
                    className={`six-metric six-metric--${metric.status.toLowerCase()}`}
                    aria-label={metric.accessibleSummary}
                  >
                    <span>{metric.label}</span>
                    <small>{metric.status}</small>
                    <strong>
                      {metric.displayValue}
                      <em>{metric.unit}</em>
                    </strong>
                    <p>
                      {metric.changeDirection === 'UP'
                        ? '↑'
                        : metric.changeDirection === 'DOWN'
                          ? '↓'
                          : '→'}{' '}
                      {metric.changeLabel ?? 'No recorded change'}
                    </p>
                  </article>
                ))}
              </section>
              <section
                className="six-brief-grid"
                aria-label="command brief and decisions"
              >
                <div className="six-brief-panel">
                  <div className="six-panel-heading">
                    <div>
                      <p>Office intel</p>
                      <h2>What changed your plan?</h2>
                    </div>
                    <span>3 traceable chains</span>
                  </div>
                  <div className="six-causal-list">
                    {projection.events.map((event) => (
                      <CausalCard
                        key={event.eventId}
                        event={event}
                        selected={event.eventId === selectedEvent?.eventId}
                        onSelect={() => setSelectedEventId(event.eventId)}
                      />
                    ))}
                  </div>
                  {selectedEvent ? (
                    <CausalDetail
                      event={selectedEvent}
                      projection={projection}
                    />
                  ) : null}
                </div>
                {selectedEvent ? (
                  <DecisionPanel
                    event={selectedEvent}
                    onOpenEvidence={() =>
                      document
                        .getElementById('six-execution-track')
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }
                  />
                ) : null}
              </section>
              <ExecutionTrack projection={projection} />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
