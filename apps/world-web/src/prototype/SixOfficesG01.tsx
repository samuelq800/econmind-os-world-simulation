import { useState } from 'react';

import { GoodsTransferFlow } from './GoodsTransferFlow.js';
import { LivingNationScene } from './LivingNationScene.js';
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
        G01 is live. Its six office role chains remain traceable; formal leaves
        remain mapped until their authorized handlers are attached.
      </p>
    </aside>
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [unavailablePage, setUnavailablePage] = useState<string | null>(null);
  const [draftOpen, setDraftOpen] = useState(false);
  const [deskNotice, setDeskNotice] = useState<string | null>(null);

  if (
    !projection ||
    state.status === 'loading' ||
    state.status === 'unauthorized'
  ) {
    return <StateScreen state={state} onRetry={onRetry} />;
  }

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
            <LivingNationScene
              projection={projection}
              onOpenTradeDraft={() => {
                setDraftOpen(true);
                setDeskNotice(null);
              }}
              onNotice={setDeskNotice}
            />
          )}
        </main>
      </div>
    </div>
  );
}
