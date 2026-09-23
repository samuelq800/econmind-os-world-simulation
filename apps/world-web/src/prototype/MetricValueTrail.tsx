import type { FixtureValueTrailState } from './metric-value-trace.js';

import './metric-value-trace.css';

export function MetricValueTrail({
  metricLabel,
  state,
}: {
  readonly metricLabel: string;
  readonly state: FixtureValueTrailState;
}) {
  const available = state.kind === 'AVAILABLE';
  return (
    <details
      className="metric-value-trace"
      data-evidence={available ? 'partial' : 'missing'}
    >
      <summary>
        <span>TRACE THIS SIGNAL</span>
        <strong>{available ? 'Value trail' : 'Evidence missing'}</strong>
        <small>{metricLabel} · local fixture only</small>
      </summary>
      <div className="metric-value-trace__body">
        {state.kind === 'MISSING' ? (
          <p className="metric-value-trace__missing">
            {state.reason} A displayed change alone does not establish a cause.
          </p>
        ) : (
          <>
            <ol className="metric-value-trace__steps" aria-label="Value trail">
              <li>
                <span>01 · Fixture input</span>
                <strong>{state.trail.input.displayValue}</strong>
                <small>Source record missing</small>
              </li>
              <li>
                <span>02 · Recorded movement</span>
                <strong>{state.trail.difference.displayValue}</strong>
                <small>{state.trail.difference.label}</small>
              </li>
              <li>
                <span>03 · Displayed output</span>
                <strong>{state.trail.output.displayValue}</strong>
                <small>Fixture v{state.trail.output.snapshotVersion}</small>
              </li>
            </ol>
            <dl className="metric-value-trace__evidence">
              <div>
                <dt>Source fact</dt>
                <dd>{state.trail.difference.sourceFact.detail}</dd>
              </div>
              <div>
                <dt>Event / version</dt>
                <dd>
                  <code>{state.trail.difference.sourceFact.eventId}</code> · v
                  {state.trail.difference.sourceFact.eventVersion}
                </dd>
              </div>
              <div>
                <dt>Final receipt</dt>
                <dd>
                  {state.trail.receipt.kind === 'MISSING' ? (
                    state.trail.receipt.reason
                  ) : (
                    <>
                      Fixture link ·{' '}
                      <code>{state.trail.receipt.commandId}</code>
                    </>
                  )}
                </dd>
              </div>
            </dl>
            <p className="metric-value-trace__caveat">
              Partial fixture trail. The input has no independent source record;
              this does not prove a complete causal attribution or an actual
              World change.
            </p>
          </>
        )}
      </div>
    </details>
  );
}
