import { useState } from 'react';

import type { PrototypeWorldBriefProjection } from './contracts.js';

type IndustryPhase =
  'SURVEY' | 'BLUEPRINT' | 'REQUESTS' | 'PREFLIGHT' | 'RECORDED';
type BuildOrderId = 'GRID_RELAY' | 'STORAGE_YARD' | 'MACHINE_HALL';

interface IndustryCommandCenterProps {
  readonly projection: PrototypeWorldBriefProjection;
  readonly onNotice: (notice: string) => void;
}

interface DependencyRequest {
  readonly office: 'Finance' | 'Trade' | 'Social';
  readonly label: string;
  readonly detail: string;
}

interface BuildOrder {
  readonly id: BuildOrderId;
  readonly tag: string;
  readonly label: string;
  readonly story: string;
  readonly future: string;
  readonly technology: string;
  readonly technicalGate: string;
  readonly materialBill: string;
  readonly constructionNeed: string;
  readonly risk: string;
  readonly accent: 'blue' | 'amber' | 'green';
  readonly dependencies: readonly DependencyRequest[];
}

const BUILD_ORDERS: readonly BuildOrder[] = [
  {
    id: 'GRID_RELAY',
    tag: 'ENERGY · GRID UPGRADE',
    label: 'Riverside grid relay',
    story: 'Give the site a clearer path to carry future industrial load.',
    future: 'A new grid transfer path can be assessed after construction.',
    technology: 'Advanced grid management',
    technicalGate: 'Technical portfolio and grid study must confirm the route.',
    materialBill: 'Copper conductor · switchgear · machinery',
    constructionNeed: 'Grid crew · connection assessment',
    risk: 'Grid margin remains a watch item until an authoritative study lands.',
    accent: 'blue',
    dependencies: [
      {
        office: 'Finance',
        label: 'Construction funding',
        detail:
          'Industry defines the scope. Finance decides release and payment.',
      },
      {
        office: 'Trade',
        label: 'Copper and switchgear',
        detail: 'Trade owns external sourcing, terms, and contract choice.',
      },
      {
        office: 'Social',
        label: 'Grid construction crew',
        detail: 'Social owns the workforce response and skill pathway.',
      },
    ],
  },
  {
    id: 'STORAGE_YARD',
    tag: 'ENERGY · STORAGE FACILITY',
    label: 'Riverside storage yard',
    story:
      'Stage flexibility beside the grid instead of claiming instant supply.',
    future:
      'A storage facility can smooth a constrained industrial connection.',
    technology: 'Grid-scale storage',
    technicalGate:
      'Requires Advanced Materials or Battery Chemistry to be ready.',
    materialBill: 'Battery modules · power electronics · copper',
    constructionNeed: 'High-skill technicians · grid connection',
    risk: 'Technology access and delivered modules both gate construction.',
    accent: 'amber',
    dependencies: [
      {
        office: 'Finance',
        label: 'Capital release',
        detail:
          'Finance controls the public funding decision and payment timing.',
      },
      {
        office: 'Trade',
        label: 'Module and equipment request',
        detail:
          'Trade controls foreign suppliers, contracts, and arrival terms.',
      },
      {
        office: 'Social',
        label: 'Technical workforce request',
        detail: 'Social decides training, allocation, and any labour response.',
      },
    ],
  },
  {
    id: 'MACHINE_HALL',
    tag: 'INDUSTRIAL · MACHINERY PLANT',
    label: 'Riverside machine hall',
    story:
      'Turn an idle site into a deliberate industrial chain, not a score bump.',
    future:
      'A machinery line can enter the project pipeline after its inputs clear.',
    technology: 'Industrial Automation',
    technicalGate:
      'Technology rights, equipment, and operating inputs must be verified.',
    materialBill: 'Steel frame · machine tools · control equipment',
    constructionNeed: 'Medium and high-skill assembly crew',
    risk: 'Inputs, power, and workers can each stop a target from becoming output.',
    accent: 'green',
    dependencies: [
      {
        office: 'Finance',
        label: 'Project funding request',
        detail:
          'Finance decides how and when a technically scoped build is paid.',
      },
      {
        office: 'Trade',
        label: 'Machine tool request',
        detail: 'Trade negotiates foreign equipment and any technology access.',
      },
      {
        office: 'Social',
        label: 'Assembly workforce request',
        detail: 'Social owns staffing, training, and labour policy decisions.',
      },
    ],
  },
];

function statusClass(accent: BuildOrder['accent'], selected: boolean): string {
  return `industry-build-card industry-build-card--${accent}${
    selected ? ' is-selected' : ''
  }`;
}

export function IndustryCommandCenter({
  projection,
  onNotice,
}: IndustryCommandCenterProps) {
  const [workOrder, setWorkOrder] = useState(1);
  const [phase, setPhase] = useState<IndustryPhase>('SURVEY');
  const [siteSurveyed, setSiteSurveyed] = useState(false);
  const [buildOrderId, setBuildOrderId] = useState<BuildOrderId | null>(null);
  const [requestsPrepared, setRequestsPrepared] = useState(false);
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [replay, setReplay] = useState<readonly string[]>([
    'Riverside yard opened · local construction rehearsal',
  ]);

  const selectedOrder = BUILD_ORDERS.find((order) => order.id === buildOrderId);
  const recorded = phase === 'RECORDED';
  const progress = recorded
    ? 5
    : preflightOpen
      ? 4
      : requestsPrepared
        ? 3
        : selectedOrder
          ? 2
          : siteSurveyed
            ? 1
            : 0;

  const addReplay = (entry: string) => {
    setReplay((current) => [entry, ...current].slice(0, 4));
  };

  const surveySite = () => {
    if (siteSurveyed || recorded) return;
    setSiteSurveyed(true);
    setPhase('BLUEPRINT');
    addReplay(
      'Riverside surveyed · idle plant, grid watch, and no started facility confirmed',
    );
    onNotice(
      'Riverside site read. Choose one build order for the local project packet.',
    );
  };

  const chooseBuildOrder = (order: BuildOrder) => {
    if (!siteSurveyed || recorded) return;
    setBuildOrderId(order.id);
    setRequestsPrepared(false);
    setPreflightOpen(false);
    setPhase('BLUEPRINT');
    addReplay(`${order.label} scoped · technical and delivery gates revealed`);
    onNotice(
      `${order.label} scoped locally. Prepare the dependency packet before preflight.`,
    );
  };

  const prepareRequests = () => {
    if (!selectedOrder || recorded) return;
    setRequestsPrepared(true);
    setPreflightOpen(false);
    setPhase('REQUESTS');
    addReplay(
      `${selectedOrder.label} requests prepared · Finance, Trade, and Social own the responses`,
    );
    onNotice(
      'Dependency packet prepared locally. Industry has not granted any outside approval.',
    );
  };

  const openPreflight = () => {
    if (!selectedOrder || !requestsPrepared || recorded) return;
    setPreflightOpen(true);
    setPhase('PREFLIGHT');
    addReplay(
      `${selectedOrder.label} preflight opened · capacity remains uncreated`,
    );
    onNotice(
      'Project preflight opened. Review every gate before recording the local work order.',
    );
  };

  const recordWorkOrder = () => {
    if (!selectedOrder || !requestsPrepared || !preflightOpen || recorded)
      return;
    setPhase('RECORDED');
    addReplay(
      `${selectedOrder.label} local work order recorded · awaiting external decisions`,
    );
    onNotice('Local work order recorded. No World State changed.');
  };

  const openNextOrder = () => {
    setWorkOrder((current) => current + 1);
    setPhase('SURVEY');
    setSiteSurveyed(false);
    setBuildOrderId(null);
    setRequestsPrepared(false);
    setPreflightOpen(false);
    addReplay(`Work order ${workOrder + 1} opened · local draft cleared`);
    onNotice(
      `Local build order ${workOrder + 1} opened. No World State changed.`,
    );
  };

  return (
    <section
      className="industry-command"
      aria-labelledby="industry-command-title"
    >
      <header className="industry-command__header">
        <div>
          <p>INDUSTRY · RIVERSIDE WORK ORDER {workOrder}</p>
          <h1 id="industry-command-title">Build command</h1>
          <span>
            Choose the next piece of {projection.countryLabel}. Own its
            constraints.
          </span>
        </div>
        <dl
          className="industry-command__hud"
          aria-label="Riverside work order state"
        >
          <div>
            <dt>Site</dt>
            <dd>Riverside</dd>
          </div>
          <div>
            <dt>Grid</dt>
            <dd>Margin watch</dd>
          </div>
          <div>
            <dt>Order</dt>
            <dd>{recorded ? 'Awaiting' : 'Draft'}</dd>
          </div>
        </dl>
      </header>

      <section
        className="industry-command__loop"
        aria-label="Project command loop"
      >
        {[
          'Survey site',
          'Choose build order',
          'Prepare requests',
          'Run preflight',
          'Record work order',
        ].map((label, index) => {
          const step = index + 1;
          return (
            <span
              className={
                progress >= step
                  ? 'is-complete'
                  : progress + 1 === step
                    ? 'is-current'
                    : undefined
              }
              key={label}
            >
              <b>{`0${step}`}</b>
              {label}
            </span>
          );
        })}
        <strong>{recorded ? 'LOCAL ORDER SAVED' : 'BUILD DRAFT'}</strong>
      </section>

      <div className="industry-command__board">
        <section
          className="industry-yard"
          aria-labelledby="industry-yard-title"
        >
          <header>
            <div>
              <p>SITE BOARD</p>
              <h2 id="industry-yard-title">Riverside capacity yard</h2>
            </div>
            <span>{siteSurveyed ? 'SITE READ' : 'UNREAD'}</span>
          </header>
          <div
            className="industry-yard__map"
            aria-label="Riverside project site diagram"
          >
            <div className="industry-yard__river" aria-hidden="true" />
            <div className="industry-yard__rail" aria-hidden="true" />
            <span className="industry-yard__zone industry-yard__zone--plant">
              <i aria-hidden="true" />
              <b>Idle plant</b>
              <small>
                {siteSurveyed ? 'Scope available' : 'Survey required'}
              </small>
            </span>
            <span className="industry-yard__zone industry-yard__zone--grid">
              <i aria-hidden="true" />
              <b>Power grid</b>
              <small>Margin watch</small>
            </span>
            <span className="industry-yard__zone industry-yard__zone--freight">
              <i aria-hidden="true" />
              <b>Freight spur</b>
              <small>Route not claimed</small>
            </span>
            <div className="industry-yard__overlay" aria-live="polite">
              <span>
                {selectedOrder ? selectedOrder.tag : 'NO BUILD ORDER'}
              </span>
              <strong>
                {selectedOrder
                  ? selectedOrder.label
                  : 'Survey before you build'}
              </strong>
              <small>
                {selectedOrder
                  ? selectedOrder.future
                  : 'The site is visible, but no facility, capacity, or input demand has started.'}
              </small>
            </div>
          </div>
          <dl className="industry-yard__facts">
            <div>
              <dt>Site state</dt>
              <dd>{siteSurveyed ? 'Project ready' : 'Unconfirmed'}</dd>
            </div>
            <div>
              <dt>Facility</dt>
              <dd>Not started</dd>
            </div>
            <div>
              <dt>Next owner</dt>
              <dd>Industry scope</dd>
            </div>
          </dl>
          <button
            className="industry-button industry-button--primary"
            type="button"
            onClick={surveySite}
            disabled={siteSurveyed || recorded}
          >
            {siteSurveyed ? 'Site surveyed' : 'Survey Riverside site'}
          </button>
          {siteSurveyed ? (
            <p className="industry-yard__read">
              Survey confirmed an idle industrial site and a grid dependency. It
              did not create capacity.
            </p>
          ) : null}
        </section>

        <section
          className="industry-mission"
          aria-labelledby="industry-mission-title"
        >
          <header>
            <div>
              <p>BUILD ORDER</p>
              <h2 id="industry-mission-title">Set the physical route</h2>
            </div>
            <span>{selectedOrder ? 'SCOPED' : 'CHOOSE ONE'}</span>
          </header>

          <div
            className="industry-build-grid"
            aria-label="Available build orders"
          >
            {BUILD_ORDERS.map((order) => (
              <button
                aria-pressed={order.id === buildOrderId}
                className={statusClass(order.accent, order.id === buildOrderId)}
                disabled={!siteSurveyed || recorded}
                key={order.id}
                type="button"
                onClick={() => chooseBuildOrder(order)}
              >
                <span>{order.tag}</span>
                <strong>{order.label}</strong>
                <small>{order.story}</small>
                <em>{order.technology}</em>
              </button>
            ))}
          </div>

          {selectedOrder ? (
            <div className="industry-scope-card is-active">
              <div>
                <span>TECHNOLOGY GATE</span>
                <strong>{selectedOrder.technology}</strong>
                <small>{selectedOrder.technicalGate}</small>
              </div>
              <div>
                <span>CONSTRUCTION BILL</span>
                <strong>{selectedOrder.materialBill}</strong>
                <small>{selectedOrder.constructionNeed}</small>
              </div>
              <p>{selectedOrder.risk}</p>
            </div>
          ) : (
            <p className="industry-mission__lock">
              Survey the site, then select a project type. A choice reveals its
              technology, material, and workforce gates.
            </p>
          )}

          <button
            className="industry-button"
            disabled={!selectedOrder || recorded}
            type="button"
            onClick={prepareRequests}
          >
            {requestsPrepared
              ? 'Dependency packet prepared'
              : 'Prepare dependency packet'}
          </button>
        </section>
      </div>

      <section
        className="industry-requests"
        aria-labelledby="industry-requests-title"
      >
        <header>
          <div>
            <p>JOINT PROJECT COMMITTEE</p>
            <h2 id="industry-requests-title">Dependency packet</h2>
          </div>
          <span>
            {requestsPrepared ? '3 REQUESTS STAGED' : 'WAITING FOR SCOPE'}
          </span>
        </header>
        <div className="industry-request-grid">
          {(selectedOrder?.dependencies ?? []).map((request) => (
            <article key={request.office}>
              <span>{request.office}</span>
              <strong>{request.label}</strong>
              <small>{request.detail}</small>
              <b>{requestsPrepared ? 'Prepared locally' : 'Not prepared'}</b>
            </article>
          ))}
          {!selectedOrder ? (
            <p className="industry-requests__empty">
              A build order creates structured requests; it cannot self-approve
              funding, imports, or workers.
            </p>
          ) : null}
        </div>
        <div className="industry-requests__actions">
          <span>
            Industry owns the technical scope. Finance, Trade, and Social each
            own their decision.
          </span>
          <button
            className="industry-button industry-button--primary"
            disabled={!requestsPrepared || recorded}
            type="button"
            onClick={openPreflight}
          >
            {preflightOpen ? 'Preflight opened' : 'Run local project preflight'}
          </button>
        </div>
      </section>

      <section className="industry-command__ledger">
        <article
          className="industry-preflight"
          aria-labelledby="industry-preflight-title"
        >
          <div>
            <p>PREFLIGHT</p>
            <h2 id="industry-preflight-title">What this order changes</h2>
          </div>
          {selectedOrder ? (
            <div className="industry-preflight__checks">
              <span className={siteSurveyed ? 'is-ready' : undefined}>
                <b>Site</b>
                {siteSurveyed ? 'Scoped at Riverside' : 'Survey missing'}
              </span>
              <span className={requestsPrepared ? 'is-ready' : undefined}>
                <b>Materials</b>
                {requestsPrepared
                  ? 'Trade request prepared'
                  : 'No supply request'}
              </span>
              <span className={requestsPrepared ? 'is-ready' : undefined}>
                <b>Workforce</b>
                {requestsPrepared
                  ? 'Social request prepared'
                  : 'No workforce request'}
              </span>
              <span className={preflightOpen ? 'is-ready' : undefined}>
                <b>Technology</b>
                {preflightOpen
                  ? 'Portfolio check required'
                  : 'Awaiting preflight'}
              </span>
            </div>
          ) : (
            <p className="industry-preflight__empty">
              No project is selected. Capacity only appears through a completed
              project pipeline.
            </p>
          )}
          {preflightOpen && selectedOrder ? (
            <div className="industry-preflight__result">
              <strong>Technical packet ready for outside review.</strong>
              <span>
                It remains an awaiting-decision draft: no funding, material
                delivery, labour, technology right, or construction progress is
                assumed.
              </span>
              <button
                className="industry-button industry-button--primary"
                type="button"
                disabled={recorded}
                onClick={recordWorkOrder}
              >
                Record local work order
              </button>
            </div>
          ) : null}
        </article>

        <article
          className="industry-command__record"
          aria-labelledby="industry-record-title"
        >
          <div>
            <p>WORK ORDER LOG</p>
            <h2 id="industry-record-title">Field replay</h2>
          </div>
          <ol>
            {replay.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ol>
          {recorded ? (
            <div className="industry-command__success">
              <strong>
                {selectedOrder?.label} is awaiting outside decisions.
              </strong>
              <span>
                No World State changed. No project, facility, or request was
                submitted.
              </span>
              <button
                className="industry-button"
                type="button"
                onClick={openNextOrder}
              >
                Open next build order
              </button>
            </div>
          ) : (
            <small>
              A local work order is a rehearsal record, not a completed project
              or an approval.
            </small>
          )}
        </article>
      </section>
    </section>
  );
}
