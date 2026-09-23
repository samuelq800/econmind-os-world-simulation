import { Component, lazy, Suspense, useState, type ReactNode } from 'react';

import type { PrototypeWorldBriefProjection } from './contracts.js';
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

  override render() {
    if (this.state.failed) {
      return (
        <div className="national-atlas__unavailable" role="status">
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

interface NationalOverviewProps {
  readonly projection: PrototypeWorldBriefProjection;
  readonly status: ReadableOfficeState;
  readonly onOpenBrief: () => void;
}

function OfficeActionRoute({
  model,
  onOpenBrief,
}: {
  readonly model: OfficeActionReadModel;
  readonly onOpenBrief: () => void;
}) {
  const command = preparationOfficeActionAdapter.commandAvailability();
  return (
    <section className="office-action-route" aria-label="Selected event route">
      <div className="office-action-route__heading">
        <span>Event route · local fixture</span>
        <strong>
          {model.kind === 'LOCAL_REHEARSAL_ROUTE'
            ? 'Your Office can rehearse this response'
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
        <div>
          <dt>Live Command</dt>
          <dd>{command.kind}</dd>
        </div>
      </dl>
      <p>{model.reason}</p>
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

export function NationalOverview({
  projection,
  status,
  onOpenBrief,
}: NationalOverviewProps) {
  const [selectedMetricId, setSelectedMetricId] = useState(
    projection.metrics[0]?.id ?? '',
  );
  const [view, setView] = useState<'map' | 'table'>('map');
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState(
    projection.events[0]?.eventId ?? '',
  );
  const { metric: selectedMetric, events: relevantEvents } =
    nationalSignalSelection(projection, selectedMetricId);
  const selectedEvent =
    projection.events.find((event) => event.eventId === selectedEventId) ??
    relevantEvents[0] ??
    null;
  const actionModel = preparationOfficeActionAdapter.readModel({
    projection,
    event: selectedEvent,
    state: status,
  });
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

      <div
        className="national-overview__view-switch"
        role="group"
        aria-label="National overview view"
      >
        <button
          type="button"
          aria-pressed={view === 'map'}
          onClick={() => setView('map')}
        >
          World map
        </button>
        <button
          type="button"
          aria-pressed={view === 'table'}
          onClick={() => setView('table')}
        >
          Signal table
        </button>
        <small>
          LOCAL FIXTURE · Atlas territories are not linked to country records.
        </small>
      </div>

      {mapUnavailable ? (
        <div className="national-overview__map-notice" role="status">
          Map asset unavailable. Signal table is open.
        </div>
      ) : null}

      {selectedMetric ? (
        view === 'map' ? (
          <div className="national-atlas">
            <div className="national-atlas__board">
              <AtlasBoundary onUseTable={() => setView('table')}>
                <Suspense
                  fallback={
                    <div className="national-atlas__loading" role="status">
                      Loading atlas…
                    </div>
                  }
                >
                  <FictionalWorldMap
                    embedded
                    onMapUnavailable={() => {
                      setMapUnavailable(true);
                      setView('table');
                    }}
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
                <span>Observed national signals</span>
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
          <span>
            This state does not invent GDP, inflation, employment, or reserves.
            Refreshing an authorized snapshot would be the production recovery
            path.
          </span>
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
