import { useEffect, useState } from 'react';

import type {
  PrototypeBriefEvent,
  PrototypeWorldBriefProjection,
} from './contracts.js';
import { GoodsTransferFlow } from './GoodsTransferFlow.js';
import { readableProjection, type PrototypeViewState } from './state.js';

type NavGroupId =
  'operations' | 'country' | 'policy' | 'crossOffice' | 'roleWork' | 'records';

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

interface EconomicObject {
  readonly id: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly value: string;
  readonly state: 'risk' | 'opportunity' | 'blocked' | 'ready';
  readonly detail: string;
  readonly nextOwner: string;
  readonly means: string;
  readonly baseline: string;
  readonly condition: string;
  readonly unknown: string;
}

const NAV_GROUPS: readonly NavGroup[] = [
  {
    id: 'operations',
    label: 'Operations',
    leaves: [
      { pageId: 'G01', label: 'World desk', implemented: true },
      { pageId: 'ROLE', label: 'Trade office', implemented: false },
    ],
  },
  {
    id: 'country',
    label: 'Country & territory',
    leaves: [
      { pageId: 'G02', label: 'Nation overview', implemented: false },
      { pageId: 'T01', label: 'Markets & partners', implemented: false },
    ],
  },
  {
    id: 'policy',
    label: 'Policy & action',
    leaves: [
      { pageId: 'G07', label: 'Policy board', implemented: false },
      { pageId: 'T03', label: 'Spot market', implemented: false },
      { pageId: 'T04', label: 'Bilateral deals', implemented: false },
    ],
  },
  {
    id: 'crossOffice',
    label: 'Cross-office',
    leaves: [
      { pageId: 'G03', label: 'Requests', implemented: false },
      { pageId: 'G04', label: 'Joint plans', implemented: false },
    ],
  },
  {
    id: 'roleWork',
    label: 'Role work',
    leaves: [
      { pageId: 'T07', label: 'Loans & infrastructure', implemented: false },
      { pageId: 'T09', label: 'Economic diplomacy', implemented: false },
    ],
  },
  {
    id: 'records',
    label: 'Execution & records',
    leaves: [
      { pageId: 'G05', label: 'Execution alerts', implemented: false },
      { pageId: 'G06', label: 'Review & record', implemented: false },
    ],
  },
];

const OBJECTS: readonly EconomicObject[] = [
  {
    id: 'GRAIN-RESERVE',
    eyebrow: 'Supply reserve',
    title: 'Northstar grain reserve',
    value: '128k tonnes',
    state: 'risk',
    detail: 'A reserve tag moved grain out of the free pool.',
    nextOwner: 'Trade office',
    means: 'Local transfer draft',
    baseline: 'No move: food buffer remains tight.',
    condition: 'Version and office grant must still match.',
    unknown: 'Whether a counterpart accepts the offer.',
  },
  {
    id: 'MERIDIAN-DEMAND',
    eyebrow: 'Counterpart demand',
    title: 'Meridian import window',
    value: 'Open signal',
    state: 'opportunity',
    detail: 'Meridian is the available route for a grain conversation.',
    nextOwner: 'Meridian trade + finance',
    means: 'Draft before a request',
    baseline: 'No move: window may close without an offer.',
    condition: 'Treasury settlement source needs approval.',
    unknown: 'Counterpart quantity and delivery terms.',
  },
  {
    id: 'TREASURY-QUEUE',
    eyebrow: 'Settlement capacity',
    title: 'Meridian treasury queue',
    value: '1.84 bn GCU',
    state: 'blocked',
    detail: 'A prior commitment is already consuming payment capacity.',
    nextOwner: 'Finance office',
    means: 'Check dependency',
    baseline: 'No move: queue retains its current priority.',
    condition: 'Finance must release a settlement route.',
    unknown: 'Exact clearing order in the authoritative queue.',
  },
  {
    id: 'HARBOUR-LANE',
    eyebrow: 'Route condition',
    title: 'Harbour lane',
    value: 'Ready to inspect',
    state: 'ready',
    detail: 'A route is visible, but not guaranteed as capacity.',
    nextOwner: 'Trade office',
    means: 'Locate evidence',
    baseline: 'No move: route status remains observational.',
    condition: 'A real order needs an authoritative route check.',
    unknown: 'Weather and berth allocation.',
  },
];

const EVENT_COPY: Readonly<
  Record<string, { readonly title: string; readonly chain: readonly string[] }>
> = {
  'EVENT-PROTOTYPE-001': {
    title: 'Grain reserve locks supply',
    chain: ['Reserve tagged', 'Free grain falls', 'Food buffer tightens'],
  },
  'EVENT-PROTOTYPE-002': {
    title: 'Treasury queue claims cash',
    chain: ['Commitment queued', 'Free cash falls', 'Payment timing narrows'],
  },
  'EVENT-PROTOTYPE-003': {
    title: 'Labour market softens',
    chain: [
      'Labour report lands',
      'Unemployment rises',
      'Industry play changes',
    ],
  },
};

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
      ? ['Loading world desk', 'Waiting for the scoped projection.']
      : state.status === 'unauthorized'
        ? ['Office access changed', state.reason]
        : ['Projection unavailable', reason];
  return (
    <main className="six-state-screen" id="six-offices-main">
      <section className="six-state-card" role="status" aria-live="polite">
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
  mobileOpen,
  onNavigate,
  onClose,
}: {
  readonly mobileOpen: boolean;
  readonly onNavigate: (leaf: NavLeaf) => void;
  readonly onClose: () => void;
}) {
  const [open, setOpen] = useState<Readonly<Record<NavGroupId, boolean>>>(
    Object.freeze({
      operations: true,
      country: true,
      policy: true,
      crossOffice: true,
      roleWork: false,
      records: true,
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
          <strong>2</strong> on desk
        </span>
        <span>
          <strong>1</strong> dependency
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
                  {group.leaves.map((leaf) => (
                    <li key={leaf.pageId}>
                      <button
                        type="button"
                        aria-current={
                          leaf.pageId === 'G01' ? 'page' : undefined
                        }
                        className={
                          leaf.pageId === 'G01' ? 'is-active' : undefined
                        }
                        onClick={() => {
                          onNavigate(leaf);
                          onClose();
                        }}
                      >
                        <span>{leaf.label}</span>
                        <small>{leaf.pageId}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          );
        })}
      </nav>
      <p className="six-sidebar__note">
        G01 is live here. Other leaves are retained, but not connected.
      </p>
    </aside>
  );
}

function ObjectStage({
  objects,
  selectedObjectId,
  onSelect,
}: {
  readonly objects: readonly EconomicObject[];
  readonly selectedObjectId: string;
  readonly onSelect: (objectId: string) => void;
}) {
  return (
    <section className="object-stage" aria-labelledby="object-stage-title">
      <div className="object-stage__heading">
        <div>
          <p>Supply network · actionable objects</p>
          <h1 id="object-stage-title">Move from signal to object.</h1>
        </div>
        <span>Choose one node</span>
      </div>
      <div
        className="supply-network"
        aria-label="Northstar and Meridian grain route"
      >
        <div className="supply-network__route" aria-hidden="true" />
        <span className="supply-network__country supply-network__country--northstar">
          NORTHSTAR
        </span>
        <span className="supply-network__country supply-network__country--meridian">
          MERIDIAN
        </span>
        {objects.map((object, index) => (
          <button
            className={`supply-node supply-node--${object.state} supply-node--${index + 1}${object.id === selectedObjectId ? ' is-selected' : ''}`}
            type="button"
            key={object.id}
            aria-pressed={object.id === selectedObjectId}
            onClick={() => onSelect(object.id)}
          >
            <span>{object.eyebrow}</span>
            <strong>{object.title}</strong>
            <small>{object.value}</small>
          </button>
        ))}
        <div
          className="supply-network__legend"
          aria-label="object status legend"
        >
          <span>
            <i className="is-risk" />
            Risk
          </span>
          <span>
            <i className="is-opportunity" />
            Window
          </span>
          <span>
            <i className="is-blocked" />
            Dependency
          </span>
          <span>
            <i className="is-ready" />
            Evidence
          </span>
        </div>
      </div>
    </section>
  );
}

function ObjectInspector({
  object,
  event,
  projection,
  compareOpen,
}: {
  readonly object: EconomicObject;
  readonly event: PrototypeBriefEvent | undefined;
  readonly projection: PrototypeWorldBriefProjection;
  readonly compareOpen: boolean;
}) {
  const eventCopy = event ? EVENT_COPY[event.eventId] : undefined;
  return (
    <aside
      className="object-inspector"
      aria-labelledby="object-inspector-title"
    >
      <div className="object-inspector__title">
        <p>Selected object</p>
        <span className={`object-state object-state--${object.state}`}>
          {object.state}
        </span>
      </div>
      <h2 id="object-inspector-title">{object.title}</h2>
      <p className="object-inspector__detail">{object.detail}</p>
      <dl className="object-facts">
        <div>
          <dt>Evidence</dt>
          <dd>{eventCopy?.title ?? 'Projection signal'}</dd>
        </div>
        <div>
          <dt>No-action baseline</dt>
          <dd>{object.baseline}</dd>
        </div>
        <div>
          <dt>Available means</dt>
          <dd>{object.means}</dd>
        </div>
        <div>
          <dt>Next owner</dt>
          <dd>{object.nextOwner}</dd>
        </div>
      </dl>
      {compareOpen ? (
        <section className="path-compare" aria-label="path comparison">
          <p>Path comparison</p>
          <article>
            <strong>Draft transfer</strong>
            <span>Cost now: quantity and quoted unit price.</span>
            <small>Needs: {object.condition}</small>
          </article>
          <article>
            <strong>Hold position</strong>
            <span>Cost now: no new obligation.</span>
            <small>Crowds out: the Meridian window.</small>
          </article>
          <p className="path-compare__unknown">
            Unknown risk: {object.unknown}
          </p>
        </section>
      ) : null}
      <footer>
        World v{projection.watermark.worldVersion} · evidence only, not a ruling
      </footer>
    </aside>
  );
}

function ActionDock({
  object,
  draftOpen,
  compareOpen,
  onStartDraft,
  onCompare,
  onHold,
}: {
  readonly object: EconomicObject;
  readonly draftOpen: boolean;
  readonly compareOpen: boolean;
  readonly onStartDraft: () => void;
  readonly onCompare: () => void;
  readonly onHold: () => void;
}) {
  return (
    <section className="context-action-dock" aria-label="available moves">
      <div>
        <span>Next move</span>
        <strong>
          {object.id === 'GRAIN-RESERVE'
            ? 'Prepare a grain transfer'
            : `Inspect ${object.title}`}
        </strong>
        <small>Draft only · no World State write</small>
      </div>
      <div className="context-action-dock__actions">
        <button
          className="six-button six-button--primary"
          type="button"
          onClick={onStartDraft}
        >
          {draftOpen ? 'Transfer draft open' : 'Draft transfer'}
        </button>
        <button
          className="six-button six-button--secondary"
          type="button"
          onClick={onCompare}
        >
          {compareOpen ? 'Hide paths' : 'Compare paths'}
        </button>
        <button className="six-text-button" type="button" onClick={onHold}>
          Hold for later
        </button>
      </div>
    </section>
  );
}

function ProgressTray({
  projection,
}: {
  readonly projection: PrototypeWorldBriefProjection;
}) {
  return (
    <section className="world-progress-tray" aria-label="world progression">
      <span>
        <i className="is-complete" />
        Reserve event recorded
      </span>
      <span>
        <i className="is-active" />
        Object selected
      </span>
      <span>
        <i />
        Draft awaiting review
      </span>
      <small>
        Last receipt: {projection.recentReceipt?.outcome ?? 'none'} · World
        keeps running
      </small>
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
  const [selectedObjectId, setSelectedObjectId] = useState('GRAIN-RESERVE');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [unavailablePage, setUnavailablePage] = useState<string | null>(null);
  const [draftOpen, setDraftOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [deskNotice, setDeskNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!OBJECTS.some((object) => object.id === selectedObjectId)) {
      setSelectedObjectId('GRAIN-RESERVE');
    }
  }, [selectedObjectId]);

  if (
    !projection ||
    state.status === 'loading' ||
    state.status === 'unauthorized'
  ) {
    return <StateScreen state={state} onRetry={onRetry} />;
  }

  const selectedObject =
    OBJECTS.find((object) => object.id === selectedObjectId) ?? OBJECTS[0]!;
  const selectedEvent = projection.events[0];

  return (
    <div className="six-offices six-offices--gameplay">
      <a className="six-skip-link" href="#six-offices-main">
        Skip to world desk
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
        <div className="six-topbar__game-status" aria-label="world status">
          <span>
            <i aria-hidden="true" />
            {state.status === 'stale' ? 'INTEL BEHIND' : 'WORLD RUNNING'}
          </span>
          <small>
            {projection.simulationDateLabel} · 10× · World v
            {projection.watermark.worldVersion}
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
          mobileOpen={mobileNavOpen}
          onClose={() => setMobileNavOpen(false)}
          onNavigate={(leaf) => {
            setUnavailablePage(leaf.implemented ? null : leaf.pageId);
            if (leaf.implemented) setDraftOpen(false);
          }}
        />
        <main className="trade-main" id="six-offices-main">
          <section className="trade-hud" aria-label="world HUD">
            <div>
              <span>Free grain</span>
              <strong>
                128k <small>t</small>
              </strong>
              <em className="is-risk">Reserve lock</em>
            </div>
            <div>
              <span>Cash route</span>
              <strong>
                1.84 <small>bn GCU</small>
              </strong>
              <em className="is-blocked">Queue active</em>
            </div>
            <div>
              <span>Open window</span>
              <strong>
                1 <small>route</small>
              </strong>
              <em className="is-opportunity">Meridian</em>
            </div>
            <div>
              <span>Authority</span>
              <strong>
                Trade <small>verified</small>
              </strong>
              <em className="is-ready">Auth 17</em>
            </div>
          </section>
          {state.status === 'stale' ? (
            <section className="six-stale-banner" role="status">
              <strong>Intel is behind authority.</strong>
              <span>Refresh before leaving local preparation.</span>
              <button
                className="six-button six-button--secondary"
                type="button"
                onClick={onRetry}
              >
                Refresh intel
              </button>
            </section>
          ) : null}
          {unavailablePage ? (
            <section className="unavailable-page-notice" role="status">
              <strong>{unavailablePage} is mapped, not connected.</strong>
              <span>
                This candidate keeps the leaf visible without simulating its
                runtime.
              </span>
              <button type="button" onClick={() => setUnavailablePage(null)}>
                Return to G01
              </button>
            </section>
          ) : null}
          {deskNotice ? (
            <section className="desk-notice" role="status">
              <span>{deskNotice}</span>
              <button type="button" onClick={() => setDeskNotice(null)}>
                Dismiss
              </button>
            </section>
          ) : null}
          {draftOpen ? (
            <div className="trade-draft-area">
              <GoodsTransferFlow
                onClose={() => setDraftOpen(false)}
                onAuthorizationRevoked={(reason) => {
                  setDraftOpen(false);
                  setDeskNotice(`Access changed: ${reason}`);
                }}
              />
            </div>
          ) : (
            <section className="trade-workspace">
              <ObjectStage
                objects={OBJECTS}
                selectedObjectId={selectedObject.id}
                onSelect={(id) => {
                  setSelectedObjectId(id);
                  setDeskNotice(null);
                }}
              />
              <ObjectInspector
                object={selectedObject}
                event={selectedEvent}
                projection={projection}
                compareOpen={compareOpen}
              />
            </section>
          )}
          <ActionDock
            object={selectedObject}
            draftOpen={draftOpen}
            compareOpen={compareOpen}
            onStartDraft={() => {
              setDraftOpen(true);
              setDeskNotice(null);
            }}
            onCompare={() => setCompareOpen((open) => !open)}
            onHold={() =>
              setDeskNotice(
                'Held locally. No object, balance, or right changed.',
              )
            }
          />
          <ProgressTray projection={projection} />
        </main>
      </div>
    </div>
  );
}
