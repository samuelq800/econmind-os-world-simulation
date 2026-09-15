import { useState } from 'react';

import { FIXTURE_OFFICES, type FixtureOfficeId } from './fixtures.js';

type EntryStage = 'country' | 'office';
type EntryRoute = 'first' | 'returning';

interface OfficeEntryFlowProps {
  readonly lastOfficeId: FixtureOfficeId;
  readonly onEnterOffice: (officeId: FixtureOfficeId) => void;
}

function officeLabel(officeId: FixtureOfficeId): string {
  return (
    FIXTURE_OFFICES.find((office) => office.officeId === officeId)
      ?.shortLabel ?? 'Trade'
  );
}

export function OfficeEntryFlow({
  lastOfficeId,
  onEnterOffice,
}: OfficeEntryFlowProps) {
  const [stage, setStage] = useState<EntryStage>('country');
  const [route, setRoute] = useState<EntryRoute>('first');

  if (stage === 'office') {
    return (
      <main className="entry-flow" id="fixture-entry-main">
        <section
          className="entry-flow__shell"
          aria-labelledby="office-entry-title"
        >
          <header className="entry-flow__header">
            <button
              className="entry-flow__back"
              type="button"
              onClick={() => setStage('country')}
            >
              Back to country
            </button>
            <p>FIRST ENTRY · STEP 2 OF 2</p>
            <h1 id="office-entry-title">Choose an Office to preview.</h1>
            <span>
              Each route opens the same local fixture through a different Office
              lens. Choosing a card does not create an appointment, grant a
              permission, or submit an economic command.
            </span>
          </header>

          <section
            className="entry-office-grid"
            aria-label="Fixture Office routes"
          >
            {FIXTURE_OFFICES.map((office) => (
              <article className="entry-office-card" key={office.officeId}>
                <div>
                  <span>{office.officeId}</span>
                  <small>G01 fixture brief</small>
                </div>
                <h2>{office.fullLabel}</h2>
                <p>{office.mission}</p>
                <dl>
                  <div>
                    <dt>First lens</dt>
                    <dd>{office.firstLens}</dd>
                  </div>
                  <div>
                    <dt>Works with</dt>
                    <dd>{office.collaborators}</dd>
                  </div>
                </dl>
                <button
                  className="six-button six-button--primary"
                  type="button"
                  onClick={() => onEnterOffice(office.officeId)}
                >
                  Open {office.shortLabel} brief
                </button>
              </article>
            ))}
          </section>
        </section>
      </main>
    );
  }

  return (
    <main className="entry-flow" id="fixture-entry-main">
      <section
        className="entry-flow__shell"
        aria-labelledby="country-entry-title"
      >
        <header className="entry-flow__header">
          <p>WORLD ENTRY · FIXTURE ONLY</p>
          <h1 id="country-entry-title">Choose your country.</h1>
          <span>
            This is the local first-entry path from the V2 interaction spec. A
            production route must receive country membership and appointment
            status from the authorized query boundary.
          </span>
        </header>

        <div className="entry-route-toggle" aria-label="Entry path preview">
          <button
            type="button"
            aria-pressed={route === 'first'}
            onClick={() => setRoute('first')}
          >
            First entry
          </button>
          <button
            type="button"
            aria-pressed={route === 'returning'}
            onClick={() => setRoute('returning')}
          >
            Returning route
          </button>
        </div>

        {route === 'returning' ? (
          <section
            className="entry-returning"
            aria-labelledby="returning-title"
          >
            <div>
              <p>RETURNING FIXTURE</p>
              <h2 id="returning-title">Resume the last local Office lens.</h2>
              <span>
                A real session revalidates country and Office appointment before
                this handoff. This preview cannot verify or restore either.
              </span>
            </div>
            <button
              className="six-button six-button--primary"
              type="button"
              onClick={() => onEnterOffice(lastOfficeId)}
            >
              Open {officeLabel(lastOfficeId)} brief
            </button>
          </section>
        ) : (
          <section
            className="entry-country-card"
            aria-label="Northstar country fixture"
          >
            <div className="entry-country-card__map" aria-hidden="true">
              <span>Northstar</span>
              <i />
              <i />
              <i />
            </div>
            <div className="entry-country-card__copy">
              <p>LOCAL COUNTRY FIXTURE</p>
              <h2>Northstar Republic</h2>
              <span>
                One public preparation surface with a reserve, treasury, and
                service object path. It is not a country roster or a World State
                query.
              </span>
              <ul>
                <li>Country profile: fixture available</li>
                <li>Office appointment: not granted in browser</li>
                <li>Next step: choose a local Office lens</li>
              </ul>
              <button
                className="six-button six-button--primary"
                type="button"
                onClick={() => setStage('office')}
              >
                Choose an Office
              </button>
            </div>
          </section>
        )}

        <p className="entry-flow__boundary">
          No country membership, entitlement, draft, resource, appointment, or
          command is persisted by this page.
        </p>
      </section>
    </main>
  );
}
