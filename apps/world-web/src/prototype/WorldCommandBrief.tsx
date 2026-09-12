import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import type {
  PrototypeBriefEvent,
  PrototypeBriefMetric,
  PrototypeFinalReceipt,
  PrototypeWorldBriefProjection,
} from './contracts.js';
import {
  nextEventIndex,
  readableProjection,
  type PrototypeViewState,
} from './state.js';

interface WorldCommandBriefProps {
  readonly state: PrototypeViewState;
  readonly onRetry: () => void;
}

function StatusGlyph({ children }: { readonly children: ReactNode }) {
  return <span aria-hidden="true">{children}</span>;
}

function StateMessage({
  eyebrow,
  title,
  detail,
  tone,
  onRetry,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly detail: string;
  readonly tone: 'neutral' | 'warning' | 'danger';
  readonly onRetry?: (() => void) | undefined;
}) {
  return (
    <main className="state-screen" id="world-brief-main">
      <section
        className={`state-card state-card--${tone}`}
        role={tone === 'danger' ? 'alert' : 'status'}
        aria-live={tone === 'danger' ? 'assertive' : 'polite'}
      >
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{detail}</p>
        {onRetry ? (
          <button className="primary-button" type="button" onClick={onRetry}>
            Retry projection
          </button>
        ) : null}
      </section>
    </main>
  );
}

function MetricCard({ metric }: { readonly metric: PrototypeBriefMetric }) {
  return (
    <article
      className={`metric-card metric-card--${metric.status.toLowerCase()}`}
      aria-label={metric.accessibleSummary}
    >
      <div className="metric-card__label-row">
        <span>{metric.label}</span>
        <span className="metric-card__status">{metric.status}</span>
      </div>
      <p className="metric-card__value" aria-hidden="true">
        {metric.displayValue}
        <small>{metric.unit}</small>
      </p>
      <p className="metric-card__change">
        {metric.changeDirection === 'UP'
          ? '↑'
          : metric.changeDirection === 'DOWN'
            ? '↓'
            : '→'}{' '}
        {metric.changeLabel ?? 'No recorded change'}
      </p>
    </article>
  );
}

function EventInbox({
  events,
  selectedEventId,
  onSelect,
}: {
  readonly events: readonly PrototypeBriefEvent[];
  readonly selectedEventId: string;
  readonly onSelect: (eventId: string) => void;
}) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const handleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const nextIndex = nextEventIndex(index, events.length, event.key);
    if (nextIndex === index) return;
    event.preventDefault();
    const nextEvent = events[nextIndex];
    if (!nextEvent) return;
    onSelect(nextEvent.eventId);
    buttons.current[nextIndex]?.focus();
  };

  return (
    <section className="panel event-inbox" aria-labelledby="event-inbox-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Priority inbox</p>
          <h2 id="event-inbox-title">What deserves attention</h2>
        </div>
        <span className="count-pill">{events.length} recorded</span>
      </div>
      <p className="keyboard-hint">
        Use arrow keys, Home or End to move through events.
      </p>
      <ul className="event-list" aria-label="Recorded world events">
        {events.map((item, index) => {
          const selected = selectedEventId === item.eventId;
          return (
            <li key={item.eventId}>
              <button
                ref={(node) => {
                  buttons.current[index] = node;
                }}
                className={`event-row${selected ? ' event-row--selected' : ''}`}
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect(item.eventId)}
                onKeyDown={(event) => handleKeyDown(event, index)}
              >
                <span
                  className={`priority-dot priority-dot--${item.priority.toLowerCase()}`}
                />
                <span className="event-row__content">
                  <strong>{item.title}</strong>
                  <small>{item.occurredAtLabel}</small>
                </span>
                <span aria-hidden="true">›</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function EvidenceTrace({
  event,
  metrics,
}: {
  readonly event: PrototypeBriefEvent;
  readonly metrics: readonly PrototypeBriefMetric[];
}) {
  const affected = metrics.filter((metric) =>
    event.affectedMetricIds.includes(metric.id),
  );
  return (
    <section
      className="panel evidence-panel"
      id="event-evidence"
      aria-labelledby="evidence-title"
    >
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Evidence trace</p>
          <h2 id="evidence-title">Why this is in focus</h2>
        </div>
        <span className="version-chip">World v{event.worldVersion}</span>
      </div>
      <h3>{event.title}</h3>
      <p className="event-summary">{event.summary}</p>
      <ol className="evidence-list">
        {event.evidence.map((item) => (
          <li key={`${item.kind}-${item.label}`}>
            <span
              className={`evidence-kind evidence-kind--${item.kind.toLowerCase()}`}
            >
              {item.label}
            </span>
            <p>{item.detail}</p>
          </li>
        ))}
      </ol>
      <div className="affected-row">
        <strong>Affected views</strong>
        <div>
          {affected.map((metric) => (
            <span key={metric.id}>{metric.label}</span>
          ))}
        </div>
      </div>
      <p className="causality-note">
        <StatusGlyph>ⓘ</StatusGlyph> Derived attribution helps order the
        briefing; it is not an authoritative causal finding.
      </p>
    </section>
  );
}

function NextAction({
  projection,
  event,
}: {
  readonly projection: PrototypeWorldBriefProjection;
  readonly event: PrototypeBriefEvent;
}) {
  const route = projection.routes.find(
    (candidate) => candidate.officeId === event.ownerOfficeId,
  );
  return (
    <section className="panel action-panel" aria-labelledby="next-action-title">
      <p className="eyebrow">Legitimate next step</p>
      <h2 id="next-action-title">
        {route?.label ?? 'No authorized route in this projection'}
      </h2>
      <p>
        {route?.reason ??
          'A real route must come from the future authorized query contract.'}
      </p>
      <dl className="action-facts">
        <div>
          <dt>Responsible Office</dt>
          <dd>{event.ownerOfficeId}</dd>
        </div>
        <div>
          <dt>Route status</dt>
          <dd>{route?.availability ?? 'BLOCKED'}</dd>
        </div>
      </dl>
      <a className="secondary-button" href="#event-evidence">
        Review evidence first
      </a>
      <button className="primary-button" type="button" disabled>
        Command wiring waits for V10.4
      </button>
      <p className="button-explanation">
        Prototype navigation only. No command is created or submitted.
      </p>
    </section>
  );
}

function ReceiptPanel({
  receipt,
}: {
  readonly receipt: PrototypeFinalReceipt | null;
}) {
  return (
    <section className="panel receipt-panel" aria-labelledby="receipt-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Last final receipt</p>
          <h2 id="receipt-title">World change evidence</h2>
        </div>
        {receipt ? (
          <span
            className={`receipt-outcome receipt-outcome--${receipt.outcome.toLowerCase()}`}
          >
            {receipt.outcome}
          </span>
        ) : null}
      </div>
      {receipt ? (
        <>
          <p className="receipt-version">
            World v{receipt.worldVersionBefore ?? '—'} → v
            {receipt.worldVersionAfter ?? '—'}
          </p>
          <dl className="receipt-grid">
            <div>
              <dt>Command</dt>
              <dd>{receipt.commandId}</dd>
            </div>
            <div>
              <dt>Events</dt>
              <dd>{receipt.eventIds.length}</dd>
            </div>
            <div>
              <dt>Simulation time</dt>
              <dd>{receipt.simTime}</dd>
            </div>
          </dl>
          <p className="receipt-recorded">{receipt.recordedAtLabel}</p>
        </>
      ) : (
        <p>No final receipt is present in this authorized projection.</p>
      )}
    </section>
  );
}

function ProjectionBanner({ state }: { readonly state: PrototypeViewState }) {
  if (state.status === 'stale') {
    return (
      <div
        className="projection-banner projection-banner--warning"
        role="status"
      >
        <StatusGlyph>◷</StatusGlyph>
        <div>
          <strong>Projection is behind the authoritative watermark.</strong>
          <span>
            Read-only context is retained; command submission stays unavailable.
          </span>
        </div>
      </div>
    );
  }
  if (state.status === 'offline' || state.status === 'retrying') {
    return (
      <div
        className="projection-banner projection-banner--danger"
        role="status"
        aria-live="polite"
      >
        <StatusGlyph>⌁</StatusGlyph>
        <div>
          <strong>
            {state.status === 'retrying'
              ? 'Retrying projection…'
              : 'Connection unavailable.'}
          </strong>
          <span>
            Last known mock projection is visibly retained for review only.
          </span>
        </div>
      </div>
    );
  }
  return null;
}

export function WorldCommandBrief({ state, onRetry }: WorldCommandBriefProps) {
  const projection = readableProjection(state);
  const [selectedEventId, setSelectedEventId] = useState(
    projection?.events[0]?.eventId ?? '',
  );
  const [actingOfficeId, setActingOfficeId] = useState(
    projection?.viewer.actingOfficeId ?? '',
  );

  useEffect(() => {
    if (!projection) return;
    if (!projection.events.some((event) => event.eventId === selectedEventId)) {
      setSelectedEventId(projection.events[0]?.eventId ?? '');
    }
    if (
      !projection.viewer.offices.some(
        (office) => office.officeId === actingOfficeId,
      )
    ) {
      setActingOfficeId(projection.viewer.actingOfficeId);
    }
  }, [actingOfficeId, projection, selectedEventId]);

  if (state.status === 'loading') {
    return (
      <StateMessage
        eyebrow="Authorized projection"
        title="Preparing the World brief…"
        detail="Waiting for a scoped read model. No browser state is treated as World State."
        tone="neutral"
      />
    );
  }
  if (state.status === 'unauthorized') {
    return (
      <StateMessage
        eyebrow="Access changed"
        title="This projection is not available to the current viewer."
        detail={state.reason}
        tone="danger"
        onRetry={onRetry}
      />
    );
  }
  if (!projection) {
    return (
      <StateMessage
        eyebrow="Connection recovery"
        title="The World projection is offline."
        detail={
          state.status === 'offline' ? state.reason : 'Retry in progress.'
        }
        tone="warning"
        onRetry={state.status === 'offline' ? onRetry : undefined}
      />
    );
  }

  const selectedEvent =
    projection.events.find((event) => event.eventId === selectedEventId) ??
    projection.events[0];
  const actingOffice = projection.viewer.offices.find(
    (office) => office.officeId === actingOfficeId,
  );

  return (
    <>
      <a className="skip-link" href="#world-brief-main">
        Skip to World brief
      </a>
      <header className="world-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            E
          </span>
          <div>
            <p>EconMind World V2</p>
            <strong>{projection.countryLabel}</strong>
          </div>
        </div>
        <dl className="world-clock" aria-label="Simulation clock">
          <div>
            <dt>Simulation time</dt>
            <dd>{projection.simulationDateLabel}</dd>
          </div>
          <div>
            <dt>Clock</dt>
            <dd>10× · {projection.seasonDayLabel}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              <span className="live-dot" aria-hidden="true" />
              {projection.worldStatus}
            </dd>
          </div>
        </dl>
        <div className="watermark" aria-label="Projection watermark">
          <span>{projection.classification.replace('_', ' ')}</span>
          <strong>World v{projection.watermark.worldVersion}</strong>
          <small>Event #{projection.watermark.eventSequence}</small>
        </div>
      </header>

      <nav className="office-nav" aria-label="Acting Office display context">
        <span className="office-nav__label">Acting Office</span>
        <div className="office-tabs">
          {projection.viewer.offices.map((office) => (
            <button
              key={office.officeId}
              type="button"
              aria-current={
                office.officeId === actingOfficeId ? 'page' : undefined
              }
              onClick={() => setActingOfficeId(office.officeId)}
            >
              {office.shortLabel}
            </button>
          ))}
        </div>
        <p>
          Display context only ·{' '}
          {actingOffice?.fullLabel ?? 'No selected Office'}
        </p>
      </nav>

      <ProjectionBanner state={state} />

      <main className="world-main" id="world-brief-main">
        <section className="hero" aria-labelledby="brief-title">
          <div>
            <p className="eyebrow">National intelligence brief</p>
            <h1 id="brief-title">
              Read the world. Trace the evidence. Take one legitimate step.
            </h1>
            <p>
              A compact decision loop designed around authorized projections,
              recorded events and explicit Office context.
            </p>
          </div>
          <div className="hero-path" aria-label="Decision loop">
            <span>01 State</span>
            <span>02 Event</span>
            <span>03 Evidence</span>
            <span>04 Route</span>
          </div>
        </section>

        {projection.metrics.length ? (
          <section className="metric-grid" aria-label="National pulse">
            {projection.metrics.map((metric) => (
              <MetricCard key={metric.id} metric={metric} />
            ))}
          </section>
        ) : (
          <section className="panel empty-panel" role="status">
            <p className="eyebrow">Valid empty projection</p>
            <h2>No metrics or events are available yet.</h2>
            <p>
              The projection returned successfully. The interface does not
              substitute demonstration values for missing actual data.
            </p>
          </section>
        )}

        {selectedEvent ? (
          <div className="decision-grid">
            <EventInbox
              events={projection.events}
              selectedEventId={selectedEvent.eventId}
              onSelect={setSelectedEventId}
            />
            <EvidenceTrace event={selectedEvent} metrics={projection.metrics} />
            <aside
              className="right-rail"
              aria-label="Action and receipt context"
            >
              <NextAction projection={projection} event={selectedEvent} />
              <ReceiptPanel receipt={projection.recentReceipt} />
            </aside>
          </div>
        ) : null}

        {(state.status === 'offline' ||
          state.status === 'stale' ||
          state.status === 'retrying') && (
          <section className="recovery-region" aria-labelledby="recovery-title">
            <div>
              <p className="eyebrow">Error recovery</p>
              <h2 id="recovery-title">Keep context, refresh authority.</h2>
              <p>
                The last projection remains visibly labelled. A real integration
                must re-query authority before enabling any command.
              </p>
            </div>
            <button
              className="primary-button"
              type="button"
              onClick={onRetry}
              disabled={state.status === 'retrying'}
            >
              {state.status === 'retrying' ? 'Retrying…' : 'Retry projection'}
            </button>
          </section>
        )}
      </main>
    </>
  );
}
