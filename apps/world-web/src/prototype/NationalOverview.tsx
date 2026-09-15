import { useState } from 'react';

import type {
  PrototypeBriefMetric,
  PrototypeWorldBriefProjection,
} from './contracts.js';

interface NationalOverviewProps {
  readonly projection: PrototypeWorldBriefProjection;
  readonly onOpenBrief: () => void;
}

function metricEventIds(metric: PrototypeBriefMetric): readonly string[] {
  return metric.id === 'inflation'
    ? ['EVENT-PROTOTYPE-001']
    : metric.id === 'treasury-cash'
      ? ['EVENT-PROTOTYPE-002']
      : metric.id === 'unemployment'
        ? ['EVENT-PROTOTYPE-003']
        : metric.id === 'available-grain'
          ? ['EVENT-PROTOTYPE-001']
          : [];
}

export function NationalOverview({
  projection,
  onOpenBrief,
}: NationalOverviewProps) {
  const [selectedMetricId, setSelectedMetricId] = useState(
    projection.metrics[0]?.id ?? '',
  );
  const selectedMetric =
    projection.metrics.find((metric) => metric.id === selectedMetricId) ??
    projection.metrics[0] ??
    null;
  const relevantEvents = selectedMetric
    ? projection.events.filter((event) =>
        metricEventIds(selectedMetric).includes(event.eventId),
      )
    : [];

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
            Common national signals remain read-only. A future authorized
            projection decides which values, events, and Office detail may be
            shown here.
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
                  onClick={() => setSelectedMetricId(metric.id)}
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
                    onClick={() =>
                      setSelectedMetricId(event.affectedMetricIds[0] ?? '')
                    }
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
                  {relevantEvents[0]?.title ??
                    'No linked event in this fixture'}
                </dd>
              </div>
            </dl>
            <section>
              <span>Next route</span>
              <strong>Return to your selected Office brief.</strong>
              <small>
                The local transition retains only the selected fixture lens; it
                does not confer the event owner’s permission.
              </small>
              <button
                className="six-button six-button--primary"
                type="button"
                onClick={onOpenBrief}
              >
                Open G01 Office brief
              </button>
            </section>
          </aside>
        </div>
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
