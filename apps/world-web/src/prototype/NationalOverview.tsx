import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { PrototypeWorldBriefProjection } from './contracts.js';
import {
  CommandLifecycleStatus,
  type CommandLifecycleState,
} from './CommandLifecycleStatus.js';
import { MetricValueTrail } from './MetricValueTrail.js';
import { AuthorizedMetricValueTrail } from './MetricValueTrail.js';
import type { AuthorizedReadState } from './authorized-read-adapter.js';
import { fixtureValueTrail } from './metric-value-trace.js';
import {
  preparationOfficeActionAdapter,
  type OfficeActionReadModel,
  type ReadableOfficeState,
} from './office-action-adapter.js';

import './office-action.css';

const FictionalWorldMap = lazy(async () => {
  const map = await import('../map-lab/FictionalWorldMap.js');
  return { default: map.FictionalWorldMap };
});

class AtlasBoundary extends Component<
  { readonly children: ReactNode; readonly onUseTable: () => void },
  { readonly failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch() {
    this.props.onUseTable();
  }

  override render() {
    if (this.state.failed) {
      return (
        <div className="national-atlas__unavailable" role="alert">
          <strong>Map unavailable.</strong>
          <button type="button" onClick={this.props.onUseTable}>
            Open signal table
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function AuthorizedNationalOverview({
  read,
  command,
  onOpenBrief,
}: {
  readonly read: AuthorizedReadState;
  readonly command: CommandLifecycleState;
  readonly onOpenBrief: () => void;
}) {
  const [selectedMetricId, setSelectedMetricId] = useState('');
  const [view, setView] = useState<'map' | 'table'>('map');
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const tableViewButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (mapUnavailable) tableViewButtonRef.current?.focus();
  }, [mapUnavailable]);
  const metrics = read.kind === 'CURRENT' ? read.metrics : [];
  const selectedMetric =
    metrics.find((item) => item.id === selectedMetricId) ?? metrics[0] ?? null;
  const trail =
    read.kind === 'CURRENT'
      ? (read.trails.find((item) => item.metricId === selectedMetric?.id) ??
        null)
      : null;
  const fallbackToTable = () => {
    setMapUnavailable(true);
    setView('table');
  };

  return (
    <section
      className="national-overview"
      aria-labelledby="authorized-national-title"
      data-source="AUTHORIZED_READ_MODEL"
    >
      <header className="national-overview__header">
        <div>
          <p>NATIONAL OVERVIEW · G02</p>
          <h1 id="authorized-national-title">
            Read the country before acting.
          </h1>
          <span>Choose a signal. Trace its source. Return to your Office.</span>
        </div>
        <dl>
          <div>
            <dt>Snapshot</dt>
            <dd>
              {read.kind === 'CURRENT'
                ? `Authorized v${read.worldVersion}`
                : 'Not available'}
            </dd>
          </div>
          <div>
            <dt>Coverage</dt>
            <dd>{metrics.length} verified signals</dd>
          </div>
        </dl>
      </header>
      {selectedMetric ? (
        <>
          <div
            className="national-overview__view-switch"
            role="group"
            aria-label="National overview view"
          >
            <button
              type="button"
              aria-pressed={view === 'map'}
              disabled={mapUnavailable}
              onClick={() => setView('map')}
            >
              World map
            </button>
            <button
              ref={tableViewButtonRef}
              type="button"
              aria-pressed={view === 'table'}
              onClick={() => setView('table')}
            >
              Signal table
            </button>
            <small>
              AUTHORIZED READ · Fictional atlas is navigation art, not territory
              evidence.
            </small>
          </div>
          {view === 'map' ? (
            <div className="national-atlas">
              <div className="national-atlas__board">
                <AtlasBoundary onUseTable={fallbackToTable}>
                  <Suspense
                    fallback={
                      <div className="national-atlas__loading" role="status">
                        Loading atlas…
                      </div>
                    }
                  >
                    <FictionalWorldMap
                      embedded
                      onMapUnavailable={fallbackToTable}
                    />
                  </Suspense>
                </AtlasBoundary>
              </div>
              <aside
                className="national-atlas__intel"
                aria-label="Authorized national signals"
              >
                <div className="national-atlas__intel-head">
                  <span>
                    {read.kind === 'CURRENT'
                      ? read.countryId
                      : 'Country unavailable'}
                  </span>
                  <strong>National intel</strong>
                  <small>
                    {read.kind === 'CURRENT'
                      ? `Snapshot v${read.worldVersion}`
                      : 'No snapshot'}
                  </small>
                </div>
                <div
                  className="national-atlas__signals"
                  aria-label="Select an authorized signal"
                >
                  {metrics.map((metric) => (
                    <button
                      key={metric.id}
                      type="button"
                      aria-pressed={metric.id === selectedMetric.id}
                      onClick={() => setSelectedMetricId(metric.id)}
                    >
                      <span>{metric.label}</span>
                      <strong>
                        {metric.displayValue} <small>{metric.unit}</small>
                      </strong>
                      <em>{metric.changeLabel ?? 'No comparison'}</em>
                    </button>
                  ))}
                </div>
                <div className="national-atlas__intel-event" aria-live="polite">
                  <span>Selected signal</span>
                  <strong>{selectedMetric.label}</strong>
                  <small>{selectedMetric.accessibleSummary}</small>
                </div>
                <AuthorizedMetricValueTrail
                  key={selectedMetric.id}
                  metric={selectedMetric}
                  trail={trail}
                  command={command}
                />
                <CommandLifecycleStatus
                  context="Selected signal"
                  state={command}
                  compact
                />
                <button
                  className="six-button six-button--secondary"
                  type="button"
                  onClick={onOpenBrief}
                >
                  Return to my Office
                </button>
              </aside>
            </div>
          ) : (
            <div className="national-overview__layout">
              <section
                className="national-overview__signals"
                aria-label="Authorized read-only national signals"
              >
                <div className="national-overview__group-label">
                  <span>Authorized national signals</span>
                  <small>Only current verified values appear here.</small>
                </div>
                <div className="national-signal-grid">
                  {metrics.map((metric) => (
                    <button
                      key={metric.id}
                      type="button"
                      className={
                        metric.id === selectedMetric.id
                          ? 'national-signal is-selected'
                          : 'national-signal'
                      }
                      aria-pressed={metric.id === selectedMetric.id}
                      onClick={() => setSelectedMetricId(metric.id)}
                    >
                      <span>{metric.label}</span>
                      <strong>
                        {metric.displayValue} <small>{metric.unit}</small>
                      </strong>
                      <em>{metric.changeLabel ?? 'No comparison'}</em>
                    </button>
                  ))}
                </div>
              </section>
              <aside
                className="national-overview__inspector"
                aria-live="polite"
              >
                <p>Selected signal</p>
                <h2>{selectedMetric.label}</h2>
                <strong>
                  {selectedMetric.displayValue} {selectedMetric.unit}
                </strong>
                <span>{selectedMetric.accessibleSummary}</span>
                <AuthorizedMetricValueTrail
                  key={selectedMetric.id}
                  metric={selectedMetric}
                  trail={trail}
                  command={command}
                />
                <CommandLifecycleStatus
                  context="Selected signal"
                  state={command}
                  compact
                />
                <button
                  className="six-button six-button--secondary"
                  type="button"
                  onClick={onOpenBrief}
                >
                  Return to my Office
                </button>
              </aside>
            </div>
          )}
        </>
      ) : (
        <section
          className="national-overview__empty"
          role="status"
          aria-live="polite"
        >
          <p>NATIONAL OVERVIEW · G02</p>
          <h2>Authorized signals unavailable.</h2>
          <span>
            {read.kind === 'UNAVAILABLE'
              ? read.reason
              : 'No verified signals were supplied.'}
          </span>
          <CommandLifecycleStatus
            context="National overview"
            state={command}
            compact
          />
          <button
            className="six-button six-button--secondary"
            type="button"
            onClick={onOpenBrief}
          >
            Return to G01
          </button>
        </section>
      )}
    </section>
  );
}

interface NationalOverviewProps {
  readonly projection: PrototypeWorldBriefProjection;
  readonly status: ReadableOfficeState;
  readonly onOpenBrief: () => void;
  readonly onRetry: () => void;
}

function OfficeActionRoute({
  model,
  onOpenBrief,
}: {
  readonly model: OfficeActionReadModel;
  readonly onOpenBrief: () => void;
}) {
  const commandStatus = fixtureLifecycleForOfficeAction(model);
  return (
    <section className="office-action-route" aria-label="Selected event route">
      <div className="office-action-route__heading">
        <span>Event route · local fixture</span>
        <strong>
          {model.kind === 'LOCAL_REHEARSAL_ROUTE'
            ? 'Your Office can rehearse this response'
            : model.code === 'APPROVAL_REQUIRED'
              ? 'Approval gate before action'
              : 'Action route unavailable'}
        </strong>
      </div>
      <dl>
        <div>
          <dt>Owner</dt>
          <dd>{model.ownerOfficeId ?? 'Not supplied'}</dd>
        </div>
        <div>
          <dt>Route</dt>
          <dd>{model.routeLabel ?? 'Not supplied'}</dd>
        </div>
      </dl>
      {model.kind === 'LOCAL_REHEARSAL_ROUTE' ? <p>{model.reason}</p> : null}
      <CommandLifecycleStatus
        context="Selected event"
        state={commandStatus}
        compact
      />
      {model.kind === 'LOCAL_REHEARSAL_ROUTE' ? (
        <button
          className="six-button six-button--primary"
          type="button"
          onClick={onOpenBrief}
        >
          Open G01 Office brief
        </button>
      ) : (
        <button
          className="six-button six-button--secondary"
          type="button"
          onClick={onOpenBrief}
        >
          Return to my Office
        </button>
      )}
    </section>
  );
}

export function fixtureLifecycleForOfficeAction(
  model: OfficeActionReadModel,
): CommandLifecycleState {
  return model.kind === 'UNAVAILABLE' && model.code === 'APPROVAL_REQUIRED'
    ? {
        source: 'LOCAL_FIXTURE',
        kind: 'APPROVAL_REQUIRED',
        reason: 'This route needs an approval decision.',
      }
    : {
        source: 'LOCAL_FIXTURE',
        kind: 'UNAVAILABLE',
        reason:
          model.kind === 'LOCAL_REHEARSAL_ROUTE'
            ? preparationOfficeActionAdapter.commandAvailability().reason
            : model.reason,
      };
}

export function nationalSignalSelection(
  projection: PrototypeWorldBriefProjection,
  selectedMetricId: string,
) {
  const metric =
    projection.metrics.find((item) => item.id === selectedMetricId) ??
    projection.metrics[0] ??
    null;
  const events = metric
    ? projection.events.filter((event) =>
        event.affectedMetricIds.includes(metric.id),
      )
    : [];
  return { metric, events };
}

export function initialNationalView(viewportWidth: number): 'map' | 'table' {
  return viewportWidth <= 700 ? 'table' : 'map';
}

export function NationalOverview({
  projection,
  status,
  onOpenBrief,
  onRetry,
}: NationalOverviewProps) {
  const [selectedMetricId, setSelectedMetricId] = useState(
    projection.metrics[0]?.id ?? '',
  );
  const [view, setView] = useState<'map' | 'table'>(() =>
    initialNationalView(
      typeof window === 'undefined'
        ? Number.POSITIVE_INFINITY
        : window.innerWidth,
    ),
  );
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const tableViewButtonRef = useRef<HTMLButtonElement>(null);
  const [selectedEventId, setSelectedEventId] = useState(
    projection.events[0]?.eventId ?? '',
  );
  const { metric: selectedMetric, events: relevantEvents } =
    nationalSignalSelection(projection, selectedMetricId);
  const valueTrail = fixtureValueTrail(
    projection,
    selectedMetric?.id ?? '',
    status,
  );
  const selectedEvent =
    projection.events.find((event) => event.eventId === selectedEventId) ??
    relevantEvents[0] ??
    null;
  const actionModel = preparationOfficeActionAdapter.readModel({
    projection,
    event: selectedEvent,
    state: status,
  });
  useEffect(() => {
    if (mapUnavailable) tableViewButtonRef.current?.focus();
  }, [mapUnavailable]);
  const fallbackToTable = () => {
    setMapUnavailable(true);
    setView('table');
  };
  const chooseMetric = (metricId: string) => {
    setSelectedMetricId(metricId);
    setSelectedEventId(
      projection.events.find((event) =>
        event.affectedMetricIds.includes(metricId),
      )?.eventId ?? '',
    );
  };
  const chooseEvent = (eventId: string) => {
    const event = projection.events.find((item) => item.eventId === eventId);
    if (!event) return;
    setSelectedEventId(eventId);
    const metricId = event.affectedMetricIds.find((id) =>
      projection.metrics.some((metric) => metric.id === id),
    );
    if (metricId) setSelectedMetricId(metricId);
  };

  return (
    <section
      className="national-overview"
      aria-labelledby="national-overview-title"
    >
      <header className="national-overview__header">
        <div>
          <p>NATIONAL OVERVIEW · G02</p>
          <h1 id="national-overview-title">Read the country before acting.</h1>
          <span>
            Explore the atlas. Choose a signal. Return to your Office to act.
          </span>
        </div>
        <dl>
          <div>
            <dt>Snapshot</dt>
            <dd>Fixture v{projection.watermark.worldVersion}</dd>
          </div>
          <div>
            <dt>Coverage</dt>
            <dd>{projection.metrics.length} signals loaded</dd>
          </div>
        </dl>
      </header>

      {selectedMetric ? (
        <>
          <div
            className="national-overview__view-switch"
            role="group"
            aria-label="National overview view"
          >
            <button
              type="button"
              aria-pressed={view === 'map'}
              disabled={mapUnavailable}
              onClick={() => setView('map')}
            >
              World map
            </button>
            <button
              ref={tableViewButtonRef}
              type="button"
              aria-pressed={view === 'table'}
              onClick={() => setView('table')}
            >
              Signal table
            </button>
            <small>
              LOCAL FIXTURE · Atlas territories are not linked to country
              records.
            </small>
          </div>

          {mapUnavailable ? (
            <div
              className="national-overview__map-notice"
              role="status"
              aria-live="polite"
            >
              Map unavailable. The signal table remains usable; map view is
              paused.
            </div>
          ) : null}
        </>
      ) : null}

      {selectedMetric ? (
        view === 'map' ? (
          <div className="national-atlas">
            <div className="national-atlas__board">
              <AtlasBoundary onUseTable={fallbackToTable}>
                <Suspense
                  fallback={
                    <div className="national-atlas__loading" role="status">
                      Loading atlas…
                    </div>
                  }
                >
                  <FictionalWorldMap
                    embedded
                    onMapUnavailable={fallbackToTable}
                  />
                </Suspense>
              </AtlasBoundary>
            </div>
            <aside
              className="national-atlas__intel"
              aria-label="Projected national signals"
            >
              <div className="national-atlas__intel-head">
                <span>
                  {projection.countryLabel} · {projection.seasonDayLabel}
                </span>
                <strong>National intel</strong>
                <small>
                  Fixture snapshot v{projection.watermark.worldVersion}
                </small>
              </div>
              <div
                className="national-atlas__signals"
                aria-label="Select a national signal"
              >
                {projection.metrics.map((metric) => (
                  <button
                    key={metric.id}
                    type="button"
                    aria-pressed={metric.id === selectedMetric.id}
                    onClick={() => chooseMetric(metric.id)}
                  >
                    <span>{metric.label}</span>
                    <strong>
                      {metric.displayValue} <small>{metric.unit}</small>
                    </strong>
                    <em>{metric.changeLabel ?? 'No comparison'}</em>
                  </button>
                ))}
              </div>
              <div className="national-atlas__intel-event" aria-live="polite">
                <span>Selected event</span>
                <strong>
                  {selectedEvent?.title ?? 'No linked event in this fixture'}
                </strong>
                <small>{selectedMetric.accessibleSummary}</small>
              </div>
              <MetricValueTrail
                key={selectedMetric.id}
                metricLabel={selectedMetric.label}
                state={valueTrail}
              />
              <div
                className="national-atlas__events"
                aria-label="Choose a recorded event"
              >
                {projection.events.map((event) => (
                  <button
                    key={event.eventId}
                    type="button"
                    aria-pressed={event.eventId === selectedEvent?.eventId}
                    onClick={() => chooseEvent(event.eventId)}
                  >
                    <span>
                      {event.priority} · {event.ownerOfficeId}
                    </span>
                    <strong>{event.title}</strong>
                  </button>
                ))}
              </div>
              <OfficeActionRoute
                model={actionModel}
                onOpenBrief={onOpenBrief}
              />
            </aside>
          </div>
        ) : (
          <div className="national-overview__layout">
            <section
              className="national-overview__signals"
              aria-label="Read-only national signals"
            >
              <div className="national-overview__group-label">
                <span>Fixture national signals</span>
                <small>
                  Unavailable national metrics are not rendered as zero or an
                  estimate.
                </small>
              </div>
              <div className="national-signal-grid">
                {projection.metrics.map((metric) => (
                  <button
                    key={metric.id}
                    type="button"
                    className={
                      metric.id === selectedMetric.id
                        ? 'national-signal is-selected'
                        : 'national-signal'
                    }
                    aria-pressed={metric.id === selectedMetric.id}
                    onClick={() => chooseMetric(metric.id)}
                  >
                    <span>{metric.label}</span>
                    <strong>
                      {metric.displayValue} <small>{metric.unit}</small>
                    </strong>
                    <em>{metric.changeLabel ?? 'No comparison loaded'}</em>
                  </button>
                ))}
              </div>

              <section
                className="national-overview__objects"
                aria-label="Related country objects"
              >
                <div>
                  <span>Objects in the current fixture</span>
                  <small>
                    Select an event to preserve the country context before
                    returning to the Office brief.
                  </small>
                </div>
                <div className="national-object-list">
                  {projection.events.map((event) => (
                    <button
                      key={event.eventId}
                      type="button"
                      className={
                        relevantEvents.some(
                          (relevantEvent) =>
                            relevantEvent.eventId === event.eventId,
                        )
                          ? 'is-related'
                          : undefined
                      }
                      onClick={() => chooseEvent(event.eventId)}
                    >
                      <span>{event.priority} signal</span>
                      <strong>{event.title}</strong>
                      <small>Owner · {event.ownerOfficeId}</small>
                    </button>
                  ))}
                </div>
              </section>
            </section>

            <aside className="national-overview__inspector" aria-live="polite">
              <p>Selected signal</p>
              <h2>{selectedMetric.label}</h2>
              <strong>
                {selectedMetric.displayValue} {selectedMetric.unit}
              </strong>
              <span>{selectedMetric.accessibleSummary}</span>
              <dl>
                <div>
                  <dt>Change</dt>
                  <dd>{selectedMetric.changeLabel ?? 'Not loaded'}</dd>
                </div>
                <div>
                  <dt>Scope</dt>
                  <dd>Common national fixture view</dd>
                </div>
                <div>
                  <dt>Related event</dt>
                  <dd>
                    {selectedEvent?.title ?? 'No linked event in this fixture'}
                  </dd>
                </div>
              </dl>
              <MetricValueTrail
                key={selectedMetric.id}
                metricLabel={selectedMetric.label}
                state={valueTrail}
              />
              <OfficeActionRoute
                model={actionModel}
                onOpenBrief={onOpenBrief}
              />
            </aside>
          </div>
        )
      ) : (
        <section className="national-overview__empty" role="status">
          <p>NATIONAL OVERVIEW · G02</p>
          <h2>No common fixture signals are loaded.</h2>
          <span>No national values are inferred from an empty fixture.</span>
          <button
            className="six-button six-button--primary"
            type="button"
            onClick={onRetry}
          >
            Refresh intel
          </button>
          <button
            className="six-button six-button--secondary"
            type="button"
            onClick={onOpenBrief}
          >
            Return to G01
          </button>
        </section>
      )}
    </section>
  );
}
