import { useEffect, useRef, useState } from 'react';

import { CaptainCommandCenter } from './CaptainCommandCenter.js';
import { CentralBankGovernor } from './CentralBankGovernor.js';
import {
  CommandLifecycleStatus,
  type CommandLifecycleState,
} from './CommandLifecycleStatus.js';
import { FinanceMinisterCommand } from './FinanceMinisterCommand.js';
import { GoodsTransferFlow } from './GoodsTransferFlow.js';
import { IndustryCommandCenter } from './IndustryCommandCenter.js';
import { LivingNationScene } from './LivingNationScene.js';
import {
  AuthorizedNationalOverview,
  NationalOverview,
} from './NationalOverview.js';
import {
  resolveAuthorizedUi,
  type AuthorizedUiInjection,
} from './authorized-read-adapter.js';
import { SocialCommandCenter } from './SocialCommandCenter.js';
import { TradeForeignAffairsCommand } from './TradeForeignAffairsCommand.js';
import type { NarrowTransferDraft } from '../authorized-client/client.js';
import type { PrototypeOfficeOption } from './contracts.js';
import type { AuthorizedReadState } from './authorized-read-adapter.js';
import type { LocalReadSnapshot } from './local-authorized-read.js';
import { readableProjection, type PrototypeViewState } from './state.js';

import './authorized-command-review.css';

type NavGroupId =
  'operations' | 'country' | 'policy' | 'crossOffice' | 'roleWork' | 'records';
type WorkspacePageId = 'G01' | 'G02';

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
      { pageId: 'G02', label: 'Nation overview', implemented: true },
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

const CAPTAIN_NAV_GROUPS: readonly NavGroup[] = [
  {
    id: 'operations',
    label: 'Command room',
    leaves: [
      { pageId: 'G01', label: 'Captain command', implemented: true },
      { pageId: 'C02', label: 'National intelligence', implemented: false },
    ],
  },
  {
    id: 'country',
    label: 'National direction',
    leaves: [
      { pageId: 'G02', label: 'Nation overview', implemented: true },
      { pageId: 'C03', label: 'Cabinet agenda', implemented: false },
      { pageId: 'C04', label: 'Strategy & priorities', implemented: false },
    ],
  },
  {
    id: 'policy',
    label: 'Decisions',
    leaves: [
      { pageId: 'C05', label: 'Approval inbox', implemented: false },
      { pageId: 'C06', label: 'Political capital', implemented: false },
    ],
  },
  {
    id: 'crossOffice',
    label: 'Cabinet',
    leaves: [
      { pageId: 'G03', label: 'Requests', implemented: false },
      { pageId: 'G04', label: 'Joint plans', implemented: false },
    ],
  },
  {
    id: 'roleWork',
    label: 'Statecraft',
    leaves: [
      { pageId: 'C07', label: 'International affairs', implemented: false },
      { pageId: 'C08', label: 'Crisis command', implemented: false },
    ],
  },
  {
    id: 'records',
    label: 'Accountability',
    leaves: [
      { pageId: 'G05', label: 'Execution alerts', implemented: false },
      { pageId: 'G06', label: 'Decision record', implemented: false },
    ],
  },
];

const CENTRAL_BANK_NAV_GROUPS: readonly NavGroup[] = [
  {
    id: 'operations',
    label: 'Monetary chamber',
    leaves: [
      { pageId: 'G01', label: 'Policy meeting', implemented: true },
      { pageId: 'B01', label: 'Balance sheet', implemented: false },
    ],
  },
  {
    id: 'country',
    label: 'Signals',
    leaves: [
      { pageId: 'G02', label: 'Nation overview', implemented: true },
      { pageId: 'B02', label: 'Price & credit watch', implemented: false },
    ],
  },
  {
    id: 'policy',
    label: 'Instruments',
    leaves: [
      { pageId: 'B03', label: 'Policy rate', implemented: false },
      { pageId: 'B04', label: 'Market operations', implemented: false },
      { pageId: 'B05', label: 'Reserve rule', implemented: false },
    ],
  },
  {
    id: 'crossOffice',
    label: 'Banking system',
    leaves: [
      { pageId: 'B06', label: 'Facilities & credit', implemented: false },
      { pageId: 'B07', label: 'FX & reserves', implemented: false },
    ],
  },
  {
    id: 'roleWork',
    label: 'Shared decisions',
    leaves: [
      { pageId: 'G03', label: 'Joint requests', implemented: false },
      { pageId: 'G04', label: 'Resolution table', implemented: false },
    ],
  },
  {
    id: 'records',
    label: 'Accountability',
    leaves: [
      { pageId: 'B08', label: 'Policy statement', implemented: false },
      { pageId: 'G06', label: 'Decision record', implemented: false },
    ],
  },
];

const FINANCE_NAV_GROUPS: readonly NavGroup[] = [
  {
    id: 'operations',
    label: 'Treasury command',
    leaves: [
      { pageId: 'G01', label: 'Treasury survival turn', implemented: true },
      { pageId: 'F01', label: 'Cash runway', implemented: false },
    ],
  },
  {
    id: 'country',
    label: 'Budget & requests',
    leaves: [
      { pageId: 'G02', label: 'Nation overview', implemented: true },
      { pageId: 'F02', label: 'Funding inbox', implemented: false },
      { pageId: 'F03', label: 'National budget', implemented: false },
    ],
  },
  {
    id: 'policy',
    label: 'Capital routes',
    leaves: [
      { pageId: 'F04', label: 'Project finance', implemented: false },
      { pageId: 'F05', label: 'Debt market', implemented: false },
      { pageId: 'F06', label: 'Tax studio', implemented: false },
    ],
  },
  {
    id: 'crossOffice',
    label: 'Joint funding',
    leaves: [
      { pageId: 'G03', label: 'Joint committee', implemented: false },
      { pageId: 'F07', label: 'Required approvals', implemented: false },
    ],
  },
  {
    id: 'roleWork',
    label: 'Fiscal risk',
    leaves: [
      { pageId: 'F08', label: 'Outlook & risk', implemented: false },
      { pageId: 'F09', label: 'Guarantees & SOEs', implemented: false },
    ],
  },
  {
    id: 'records',
    label: 'Fiscal ledger',
    leaves: [
      { pageId: 'F10', label: 'Publish review', implemented: false },
      { pageId: 'G06', label: 'Audit trail', implemented: false },
    ],
  },
];

const TRADE_NAV_GROUPS: readonly NavGroup[] = [
  {
    id: 'operations',
    label: 'Foreign desk',
    leaves: [
      { pageId: 'G01', label: 'Corridor command', implemented: true },
      { pageId: 'T01', label: 'Supply line watch', implemented: false },
    ],
  },
  {
    id: 'country',
    label: 'Markets & routes',
    leaves: [
      { pageId: 'G02', label: 'Nation overview', implemented: true },
      { pageId: 'T02', label: 'Global market', implemented: false },
      { pageId: 'T03', label: 'Import desk', implemented: false },
      { pageId: 'T04', label: 'Export desk', implemented: false },
    ],
  },
  {
    id: 'policy',
    label: 'Terms & controls',
    leaves: [
      { pageId: 'T05', label: 'Negotiation room', implemented: false },
      { pageId: 'T06', label: 'Contracts & logistics', implemented: false },
      { pageId: 'T07', label: 'Tariffs & controls', implemented: false },
    ],
  },
  {
    id: 'crossOffice',
    label: 'External partners',
    leaves: [
      { pageId: 'T08', label: 'Partner intelligence', implemented: false },
      { pageId: 'T09', label: 'Treaties & diplomacy', implemented: false },
    ],
  },
  {
    id: 'roleWork',
    label: 'Foreign activity',
    leaves: [
      { pageId: 'T10', label: 'Offers & deadlines', implemented: false },
      { pageId: 'T11', label: 'Investment & technology', implemented: false },
    ],
  },
  {
    id: 'records',
    label: 'Trade ledger',
    leaves: [
      { pageId: 'T12', label: 'Route review', implemented: false },
      { pageId: 'G06', label: 'Audit ledger', implemented: false },
    ],
  },
];

const INDUSTRY_NAV_GROUPS: readonly NavGroup[] = [
  {
    id: 'operations',
    label: 'Build command',
    leaves: [
      { pageId: 'G01', label: 'Riverside work order', implemented: true },
      { pageId: 'I01', label: 'National resources', implemented: false },
    ],
  },
  {
    id: 'country',
    label: 'Capacity watch',
    leaves: [
      { pageId: 'G02', label: 'Nation overview', implemented: true },
      { pageId: 'I02', label: 'Production floor', implemented: false },
      { pageId: 'I03', label: 'Energy system', implemented: false },
    ],
  },
  {
    id: 'policy',
    label: 'Technology route',
    leaves: [
      { pageId: 'I04', label: 'Technology & R&D', implemented: false },
      { pageId: 'I05', label: 'Global exchange', implemented: false },
      { pageId: 'I06', label: 'Project pipeline', implemented: false },
    ],
  },
  {
    id: 'crossOffice',
    label: 'Project committee',
    leaves: [
      { pageId: 'G03', label: 'Dependency requests', implemented: false },
      { pageId: 'G04', label: 'Joint projects', implemented: false },
    ],
  },
  {
    id: 'roleWork',
    label: 'Industrial system',
    leaves: [
      { pageId: 'I07', label: 'Infrastructure network', implemented: false },
      { pageId: 'I08', label: 'Sector support', implemented: false },
      { pageId: 'I09', label: 'Strategic reserves', implemented: false },
    ],
  },
  {
    id: 'records',
    label: 'Guardrails & record',
    leaves: [
      { pageId: 'I10', label: 'Emissions & security', implemented: false },
      { pageId: 'G06', label: 'Audit ledger', implemented: false },
    ],
  },
];

const SOCIAL_NAV_GROUPS: readonly NavGroup[] = [
  {
    id: 'operations',
    label: 'Service command',
    leaves: [
      { pageId: 'G01', label: 'Eastbank care line', implemented: true },
      { pageId: 'S01', label: 'Social pressure', implemented: false },
    ],
  },
  {
    id: 'country',
    label: 'People & work',
    leaves: [
      { pageId: 'G02', label: 'Nation overview', implemented: true },
      { pageId: 'S02', label: 'Workforce & matching', implemented: false },
      { pageId: 'S03', label: 'Training pipeline', implemented: false },
    ],
  },
  {
    id: 'policy',
    label: 'Public services',
    leaves: [
      { pageId: 'S04', label: 'Education network', implemented: false },
      { pageId: 'S05', label: 'Healthcare', implemented: false },
      { pageId: 'S06', label: 'Capacity requests', implemented: false },
    ],
  },
  {
    id: 'crossOffice',
    label: 'Households',
    leaves: [
      { pageId: 'S07', label: 'Household ledger', implemented: false },
      { pageId: 'S08', label: 'Benefit delivery', implemented: false },
    ],
  },
  {
    id: 'roleWork',
    label: 'Arrival & safety',
    leaves: [
      { pageId: 'S09', label: 'Migration & settlement', implemented: false },
      { pageId: 'S10', label: 'Public safety response', implemented: false },
    ],
  },
  {
    id: 'records',
    label: 'Coordination & record',
    leaves: [
      { pageId: 'G03', label: 'Joint requests', implemented: false },
      { pageId: 'G06', label: 'Social audit', implemented: false },
    ],
  },
];

export function prototypeStateMessage(state: PrototypeViewState): {
  readonly title: string;
  readonly detail: string;
  readonly liveRegion: 'alert' | 'status';
} {
  const reason = 'reason' in state ? state.reason : 'No readable projection.';
  if (state.status === 'loading') {
    return {
      title: 'Loading world desk',
      detail: 'Waiting for the scoped fixture projection.',
      liveRegion: 'status',
    };
  }
  if (state.status === 'unauthorized') {
    return {
      title: 'Office access changed',
      detail: `${state.reason} No Office action is available.`,
      liveRegion: 'alert',
    };
  }
  if (state.status === 'offline' || state.status === 'retrying') {
    return {
      title:
        state.status === 'offline'
          ? 'Projection offline'
          : 'Reconnecting to projection',
      detail: `${reason} No live action is available.`,
      liveRegion: 'status',
    };
  }
  return {
    title: 'Projection unavailable',
    detail: reason,
    liveRegion: 'status',
  };
}

function StateScreen({
  state,
  onRetry,
}: {
  readonly state: PrototypeViewState;
  readonly onRetry: () => void;
}) {
  const message = prototypeStateMessage(state);
  return (
    <main className="six-state-screen" id="six-offices-main">
      <section
        className="six-state-card"
        role={message.liveRegion}
        aria-live={message.liveRegion === 'alert' ? 'assertive' : 'polite'}
      >
        <p>WORLD SIMULATION · G01</p>
        <h1>{message.title}</h1>
        <span>{message.detail}</span>
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
  activePageId,
  actingOffice,
  onNavigate,
  onClose,
  onChangeFixtureRoute,
}: {
  readonly mobileOpen: boolean;
  readonly activePageId: WorkspacePageId;
  readonly actingOffice: PrototypeOfficeOption;
  readonly onNavigate: (leaf: NavLeaf) => void;
  readonly onClose: () => void;
  readonly onChangeFixtureRoute: () => void;
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
      aria-label={`${actingOffice.shortLabel} workspace navigation`}
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
        <span>Fixture Office route</span>
        <strong>{actingOffice.fullLabel}</strong>
        <small>{actingOffice.officeId} · no appointment granted</small>
      </div>
      <div className="six-sidebar__counts" aria-label="work summary">
        <span>
          <strong>G01</strong> Office brief
        </span>
        <span>
          <strong>G02</strong> national view
        </span>
      </div>
      <nav>
        {(actingOffice.officeId === 'CAPTAIN'
          ? CAPTAIN_NAV_GROUPS
          : actingOffice.officeId === 'FINANCE'
            ? FINANCE_NAV_GROUPS
            : actingOffice.officeId === 'TRADE'
              ? TRADE_NAV_GROUPS
              : actingOffice.officeId === 'CENTRAL_BANK'
                ? CENTRAL_BANK_NAV_GROUPS
                : actingOffice.officeId === 'INDUSTRY'
                  ? INDUSTRY_NAV_GROUPS
                  : actingOffice.officeId === 'SOCIAL'
                    ? SOCIAL_NAV_GROUPS
                    : NAV_GROUPS
        ).map((group) => {
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
                          leaf.pageId === activePageId ? 'page' : undefined
                        }
                        className={
                          leaf.pageId === activePageId ? 'is-active' : undefined
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
        G01 and G02 are local fixture routes.{' '}
        {actingOffice.officeId === 'FINANCE'
          ? 'Funding routes are local rehearsals; Treasury, debt, and approval actions remain mapped until their authorized handlers are attached.'
          : actingOffice.officeId === 'TRADE'
            ? 'Foreign routes are local rehearsals; orders, shipments, FX settlement, tariffs, and contracts remain mapped until their authorized handlers are attached.'
            : actingOffice.officeId === 'CENTRAL_BANK'
              ? 'Policy meeting is a local rehearsal; other instruments remain mapped until their authorized handlers are attached.'
              : actingOffice.officeId === 'INDUSTRY'
                ? 'Build orders are local rehearsals; funding, external supply, workforce, and project approvals remain mapped to their owning offices.'
                : actingOffice.officeId === 'SOCIAL'
                  ? 'Service plans are local rehearsals; staffing, funding, facilities, benefits, and deliveries remain mapped until their authorized handlers are attached.'
                  : actingOffice.officeId === 'CAPTAIN'
                    ? 'Captain command is a local planning loop; other leaves stay visible until their authorized handlers are attached.'
                    : 'This office remains a local fixture route until its authorized handlers are attached.'}
      </p>
      <button
        className="six-sidebar__route"
        type="button"
        onClick={onChangeFixtureRoute}
      >
        Change fixture route
      </button>
    </aside>
  );
}

export interface AuthorizedCommandAction {
  readonly draft: NarrowTransferDraft | null;
  readonly receiptBindingReady: boolean;
  readonly phase: LocalReadSnapshot['phase'];
  readonly alreadySubmitted: boolean;
  readonly onSubmit: () => void;
  readonly onRefresh: () => void;
}

function AuthorizedCommandReview({
  action,
  read,
}: {
  readonly action: AuthorizedCommandAction | undefined;
  readonly read: AuthorizedReadState;
}) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const reviewButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const focusAfterToggleRef = useRef(false);
  const draft = action?.draft;
  const canReview =
    !!draft &&
    read.kind === 'CURRENT' &&
    draft.expectedWorldVersion === read.worldVersion &&
    action.receiptBindingReady &&
    action.phase === 'READ_RETURNED' &&
    !action.alreadySubmitted;
  const notice = !action
    ? 'No authorized Command route is attached.'
    : !draft
      ? 'No server-owned transfer draft was supplied.'
      : action.phase === 'UNKNOWN'
        ? 'Outcome unknown. Find the original receipt before another move.'
        : action.phase === 'SUBMITTING'
          ? 'Sending once. Wait for a final result.'
          : action.phase === 'FINAL_RECEIPT'
            ? 'Final receipt recorded. Refresh national intel.'
            : !action.receiptBindingReady
              ? 'Trusted receipt binding unavailable. Request a new transfer draft.'
              : read.kind !== 'CURRENT'
                ? 'Current national intel is required before review.'
                : draft.expectedWorldVersion !== read.worldVersion
                  ? `Draft targets v${draft.expectedWorldVersion}; current view is v${read.worldVersion}. Request a new draft.`
                  : action.alreadySubmitted
                    ? 'This Command ID has already been sent in this session.'
                    : 'Review the trusted transfer reference before sending.';

  useEffect(() => {
    if (!focusAfterToggleRef.current || !canReview) return;
    if (reviewOpen) confirmButtonRef.current?.focus();
    else reviewButtonRef.current?.focus();
    focusAfterToggleRef.current = false;
  }, [reviewOpen, canReview]);

  return (
    <section
      className="authorized-command-review"
      aria-label="Narrow transfer Command"
    >
      <div className="authorized-command-review__heading">
        <span>OFFICE MOVE · REQUEST REVIEW</span>
        <h2>Narrow treasury transfer</h2>
        <p>{notice}</p>
      </div>
      {canReview && draft ? (
        reviewOpen ? (
          <div className="authorized-command-review__confirm">
            <dl>
              <div>
                <dt>Proposal</dt>
                <dd>
                  <code>{draft.proposalRef}</code>
                </dd>
              </div>
              <div>
                <dt>Buyer country</dt>
                <dd>{draft.buyerCountryId}</dd>
              </div>
              <div>
                <dt>Finance approval ref</dt>
                <dd>
                  <code>{draft.buyerFinanceApprovalRef}</code>
                </dd>
              </div>
              <div>
                <dt>Expected World</dt>
                <dd>v{draft.expectedWorldVersion}</dd>
              </div>
              <div>
                <dt>Command ID</dt>
                <dd>
                  <code>{draft.commandId}</code>
                </dd>
              </div>
            </dl>
            <p>
              The server must validate all terms. This page cannot predict
              settlement.
            </p>
            <div className="authorized-command-review__buttons">
              <button
                ref={confirmButtonRef}
                className="six-button six-button--primary"
                type="button"
                onClick={action.onSubmit}
              >
                Confirm &amp; send once
              </button>
              <button
                className="six-button six-button--secondary"
                type="button"
                onClick={() => {
                  focusAfterToggleRef.current = true;
                  setReviewOpen(false);
                }}
              >
                Back
              </button>
            </div>
          </div>
        ) : (
          <button
            ref={reviewButtonRef}
            className="six-button six-button--primary"
            type="button"
            onClick={() => {
              focusAfterToggleRef.current = true;
              setReviewOpen(true);
            }}
          >
            Review transfer
          </button>
        )
      ) : action &&
        ['FINAL_RECEIPT', 'COMMAND_UNAVAILABLE', 'UNAVAILABLE'].includes(
          action.phase,
        ) ? (
        <button
          className="six-button six-button--secondary"
          type="button"
          onClick={action.onRefresh}
        >
          Refresh national intel
        </button>
      ) : null}
    </section>
  );
}

function AuthorizedOfficeView({
  authorized,
  commandAction,
}: {
  readonly authorized: AuthorizedUiInjection;
  readonly commandAction?: AuthorizedCommandAction | undefined;
}) {
  const [page, setPage] = useState<WorkspacePageId>('G02');
  const mainRef = useRef<HTMLElement>(null);
  const ui = resolveAuthorizedUi(authorized);
  useEffect(() => {
    mainRef.current?.focus();
  }, [page]);
  return (
    <div
      className="six-offices six-offices--gameplay"
      data-source="AUTHORIZED_READ_MODEL"
    >
      <a className="six-skip-link" href="#six-offices-main">
        Skip to world desk
      </a>
      <header className="six-topbar">
        <div className="six-brand">
          <span aria-hidden="true">E</span>
          <div>
            <small>ECONMIND WORLD SIMULATION</small>
            <strong>
              {ui.read.kind === 'CURRENT'
                ? ui.read.countryId
                : 'Country unavailable'}
            </strong>
          </div>
        </div>
        <div className="six-topbar__game-status" aria-label="world status">
          <span>
            <i aria-hidden="true" />
            {ui.read.kind === 'CURRENT'
              ? commandAction?.draft
                ? 'SCOPED VIEW · COMMAND REVIEW'
                : 'AUTHORIZED READ · DISPLAY ONLY'
              : 'AUTHORIZED VIEW UNAVAILABLE'}
          </span>
          <small>
            {ui.read.kind === 'CURRENT'
              ? `Snapshot v${ui.read.worldVersion}`
              : 'No current snapshot'}
          </small>
        </div>
      </header>
      <div className="six-layout">
        <aside
          className="six-sidebar"
          aria-label="Authorized Office navigation"
        >
          <div className="six-sidebar__identity">
            <span>Office context</span>
            <strong>
              {ui.read.kind === 'CURRENT' ? ui.read.officeId : 'Not available'}
            </strong>
            <small>Actions require server authorization</small>
          </div>
          <nav aria-label="Office views">
            <div className="six-nav-group">
              <ul>
                <li>
                  <button
                    type="button"
                    aria-current={page === 'G01' ? 'page' : undefined}
                    onClick={() => setPage('G01')}
                  >
                    <span>Office brief</span>
                    <small>G01</small>
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    aria-current={page === 'G02' ? 'page' : undefined}
                    onClick={() => setPage('G02')}
                  >
                    <span>Nation overview</span>
                    <small>G02</small>
                  </button>
                </li>
              </ul>
            </div>
          </nav>
          <p className="six-sidebar__note">
            The existing Office games remain LOCAL_FIXTURE. Authorized mode
            offers only supplied read results and a host-supplied narrow Command
            request.
          </p>
        </aside>
        <main
          ref={mainRef}
          className="trade-main"
          id="six-offices-main"
          tabIndex={-1}
        >
          {page === 'G02' ? (
            <AuthorizedNationalOverview
              read={ui.read}
              command={ui.command}
              onOpenBrief={() => setPage('G01')}
            />
          ) : (
            <section
              className="national-overview"
              aria-label="Authorized Office brief"
            >
              <header className="national-overview__header">
                <div>
                  <p>OFFICE BRIEF · G01</p>
                  <h1>
                    {commandAction
                      ? 'Make the next move.'
                      : 'Hold for a final outcome.'}
                  </h1>
                  <span>
                    Review the Command status before making another move.
                  </span>
                </div>
              </header>
              <CommandLifecycleStatus
                context="Authorized Office"
                state={ui.command}
              />
              <AuthorizedCommandReview
                key={JSON.stringify([
                  commandAction?.draft?.commandId,
                  commandAction?.draft?.idempotencyKey,
                  commandAction?.draft?.expectedWorldVersion,
                  commandAction?.draft?.proposalRef,
                  commandAction?.draft?.buyerCountryId,
                  commandAction?.draft?.buyerFinanceApprovalRef,
                  commandAction?.receiptBindingReady,
                  ui.read.kind === 'CURRENT'
                    ? ui.read.worldVersion
                    : 'unavailable',
                ])}
                action={commandAction}
                read={ui.read}
              />
              <section className="national-overview__empty" role="status">
                <h2>
                  {ui.read.kind === 'CURRENT'
                    ? 'National intel is ready.'
                    : 'National intel unavailable.'}
                </h2>
                <span>
                  {ui.read.kind === 'CURRENT'
                    ? `Read snapshot v${ui.read.worldVersion} in G02.`
                    : ui.read.reason}
                </span>
                <button
                  className="six-button six-button--primary"
                  type="button"
                  onClick={() => setPage('G02')}
                >
                  Open national view
                </button>
              </section>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

export function SixOfficesG01({
  state,
  onRetry,
  onReturnToEntry,
  authorized,
  commandAction,
}: {
  readonly state: PrototypeViewState;
  readonly onRetry: () => void;
  readonly onReturnToEntry: () => void;
  readonly authorized?: AuthorizedUiInjection;
  readonly commandAction?: AuthorizedCommandAction | undefined;
}) {
  return authorized ? (
    <AuthorizedOfficeView
      authorized={authorized}
      commandAction={commandAction}
    />
  ) : (
    <FixtureSixOfficesG01
      state={state}
      onRetry={onRetry}
      onReturnToEntry={onReturnToEntry}
    />
  );
}

function FixtureSixOfficesG01({
  state,
  onRetry,
  onReturnToEntry,
}: {
  readonly state: PrototypeViewState;
  readonly onRetry: () => void;
  readonly onReturnToEntry: () => void;
}) {
  const projection = readableProjection(state);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [currentPageId, setCurrentPageId] = useState<WorkspacePageId>('G01');
  const [unavailablePage, setUnavailablePage] = useState<string | null>(null);
  const [draftOpen, setDraftOpen] = useState(false);
  const [deskNotice, setDeskNotice] = useState<string | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const previousPageRef = useRef<WorkspacePageId>(currentPageId);

  useEffect(() => {
    if (previousPageRef.current !== currentPageId) {
      previousPageRef.current = currentPageId;
      mainRef.current?.focus();
    }
  }, [currentPageId]);

  if (
    !projection ||
    state.status === 'loading' ||
    state.status === 'unauthorized'
  ) {
    return <StateScreen state={state} onRetry={onRetry} />;
  }

  const actingOffice =
    projection.viewer.offices.find(
      (office) => office.officeId === projection.viewer.actingOfficeId,
    ) ?? projection.viewer.offices[0];

  if (!actingOffice) {
    return <StateScreen state={state} onRetry={onRetry} />;
  }

  const g01CommandState: CommandLifecycleState = {
    source: 'LOCAL_FIXTURE',
    kind: 'UNAVAILABLE',
    reason:
      state.status === 'ready'
        ? 'This Office can rehearse locally; authorized submission is not connected.'
        : 'This projection is not current; authorized submission is unavailable.',
  };

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
            {state.status === 'stale'
              ? 'FIXTURE SNAPSHOT BEHIND'
              : state.status === 'offline'
                ? 'FIXTURE PROJECTION OFFLINE'
                : state.status === 'retrying'
                  ? 'FIXTURE RECONNECTING'
                  : 'LOCAL FIXTURE VIEW'}
          </span>
          <small>
            Snapshot v{projection.watermark.worldVersion} · no live clock
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
          activePageId={currentPageId}
          actingOffice={actingOffice}
          onClose={() => setMobileNavOpen(false)}
          onChangeFixtureRoute={() => {
            setMobileNavOpen(false);
            onReturnToEntry();
          }}
          onNavigate={(leaf) => {
            if (leaf.implemented) {
              setCurrentPageId(leaf.pageId as WorkspacePageId);
              setUnavailablePage(null);
              setDraftOpen(false);
              return;
            }
            setUnavailablePage(leaf.pageId);
          }}
        />
        <main
          ref={mainRef}
          className="trade-main"
          id="six-offices-main"
          tabIndex={-1}
        >
          {state.status === 'stale' ||
          state.status === 'offline' ||
          state.status === 'retrying' ? (
            <section
              className="six-stale-banner"
              role="status"
              aria-live="polite"
            >
              <strong>
                {state.status === 'stale'
                  ? 'Fixture intel is behind.'
                  : state.status === 'offline'
                    ? 'Projection connection is offline.'
                    : 'Reconnecting to projection.'}
              </strong>
              <span>
                Supplied snapshot only. Live actions are unavailable; refresh to
                check for a current authorized view.
              </span>
              <button
                className="six-button six-button--secondary"
                type="button"
                onClick={onRetry}
              >
                Refresh intel
              </button>
            </section>
          ) : null}
          {currentPageId === 'G01' ? (
            <CommandLifecycleStatus
              context={`${actingOffice.shortLabel} G01`}
              state={g01CommandState}
              compact
            />
          ) : null}
          {unavailablePage ? (
            <section className="unavailable-page-notice" role="status">
              <strong>{unavailablePage} is mapped, not connected.</strong>
              <span>
                This candidate keeps the leaf visible without simulating its
                runtime.
              </span>
              <button type="button" onClick={() => setUnavailablePage(null)}>
                Return to current page
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
          {currentPageId === 'G02' ? (
            <NationalOverview
              projection={projection}
              status={state.status}
              onRetry={onRetry}
              onOpenBrief={() => {
                setCurrentPageId('G01');
                setDraftOpen(false);
              }}
            />
          ) : draftOpen ? (
            <div className="trade-draft-area">
              <GoodsTransferFlow
                onClose={() => setDraftOpen(false)}
                onAuthorizationRevoked={(reason) => {
                  setDraftOpen(false);
                  setDeskNotice(`Access changed: ${reason}`);
                }}
              />
            </div>
          ) : actingOffice.officeId === 'CAPTAIN' ? (
            <CaptainCommandCenter
              projection={projection}
              onNotice={setDeskNotice}
            />
          ) : actingOffice.officeId === 'FINANCE' ? (
            <FinanceMinisterCommand
              projection={projection}
              onNotice={setDeskNotice}
            />
          ) : actingOffice.officeId === 'TRADE' ? (
            <TradeForeignAffairsCommand
              projection={projection}
              onNotice={setDeskNotice}
            />
          ) : actingOffice.officeId === 'CENTRAL_BANK' ? (
            <CentralBankGovernor
              projection={projection}
              onNotice={setDeskNotice}
            />
          ) : actingOffice.officeId === 'INDUSTRY' ? (
            <IndustryCommandCenter
              projection={projection}
              onNotice={setDeskNotice}
            />
          ) : actingOffice.officeId === 'SOCIAL' ? (
            <SocialCommandCenter
              projection={projection}
              onNotice={setDeskNotice}
            />
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
