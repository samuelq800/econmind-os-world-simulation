import { useMemo, useState, type CSSProperties } from 'react';

import type { PrototypeWorldBriefProjection } from './contracts.js';

type OfficeId =
  'CAPTAIN' | 'CENTRAL_BANK' | 'FINANCE' | 'TRADE' | 'INDUSTRY' | 'SOCIAL';

type ObjectState = 'alert' | 'window' | 'ready' | 'blocked' | 'watch';

interface OfficeLens {
  readonly id: OfficeId;
  readonly label: string;
  readonly title: string;
  readonly shortTitle: string;
  readonly currentLoop: string;
  readonly nextMove: string;
  readonly nextPage: string;
  readonly actionLabel: string;
  readonly actionDetail: string;
  readonly actionFields: readonly string[];
  readonly route: readonly string[];
}

interface NationObject {
  readonly id: string;
  readonly kind: string;
  readonly label: string;
  readonly title: string;
  readonly value: string;
  readonly state: ObjectState;
  readonly officeIds: readonly OfficeId[];
  readonly x: number;
  readonly y: number;
  readonly fact: string;
  readonly noAction: string;
  readonly nextOwner: string;
  readonly dependency: string;
  readonly unknown: string;
}

const OFFICE_LENSES: readonly OfficeLens[] = [
  {
    id: 'CAPTAIN',
    label: 'Captain',
    title: 'National agenda',
    shortTitle: 'Captain',
    currentLoop: 'Frame the food-security agenda before commitments compete.',
    nextMove: 'Set the agenda lead',
    nextPage: 'C03',
    actionLabel: 'Stage agenda lead',
    actionDetail:
      'Choose the mandate and accountable office before a joint plan is reviewed.',
    actionFields: ['Mandate', 'Lead office', 'Decision horizon'],
    route: [
      'C03 agenda',
      'G03 requests',
      'G04 comparison',
      'G05 execution',
      'G06 outcome',
    ],
  },
  {
    id: 'CENTRAL_BANK',
    label: 'Central Bank',
    title: 'Liquidity and price watch',
    shortTitle: 'Central Bank',
    currentLoop:
      'Separate liquidity, reserves, and price pressure before an operation.',
    nextMove: 'Inspect legal operation',
    nextPage: 'B03',
    actionLabel: 'Stage monetary operation',
    actionDetail:
      'Define the eligible ledger operation and its guardrails; this does not move a balance.',
    actionFields: ['Instrument', 'Eligible ledger', 'Legal constraint'],
    route: [
      'B03 operation',
      'Review',
      'Official result',
      'B01 ledger',
      'Credit / price track',
    ],
  },
  {
    id: 'FINANCE',
    label: 'Finance',
    title: 'Treasury and funding route',
    shortTitle: 'Finance',
    currentLoop:
      'Protect the cash window while a public commitment asks for funding.',
    nextMove: 'Compare funding route',
    nextPage: 'F08',
    actionLabel: 'Stage funding route',
    actionDetail:
      'Compare a funding source against the cash window before formal funding is requested.',
    actionFields: ['Payment window', 'Funding source', 'Minimum cash buffer'],
    route: [
      'F01 cash window',
      'F08 route',
      'F05 / G04 review',
      'F06 / F07 funding',
      'F11 cash track',
    ],
  },
  {
    id: 'TRADE',
    label: 'Trade',
    title: 'Ports, partners and goods',
    shortTitle: 'Trade',
    currentLoop:
      'Use the open Meridian window without treating an observed route as capacity.',
    nextMove: 'Prepare a grain transfer',
    nextPage: 'T03',
    actionLabel: 'Draft grain transfer',
    actionDetail:
      'Open the local transfer flow. It stops before any World State command is made.',
    actionFields: ['Partner', 'Commodity', 'Quoted quantity'],
    route: [
      'T01 partner',
      'T03 / T04 terms',
      'Cross-office review',
      'T13 logistics',
      'Warehouse outcome',
    ],
  },
  {
    id: 'INDUSTRY',
    label: 'Industry',
    title: 'Capacity and construction',
    shortTitle: 'Industry',
    currentLoop:
      'Turn an idle industrial site into a scoped project, not a decorative build.',
    nextMove: 'Shape the capacity project',
    nextPage: 'I07',
    actionLabel: 'Stage capacity project',
    actionDetail:
      'Choose technology, scale, and location before cross-office gaps are requested.',
    actionFields: ['Technology', 'Scale', 'Location'],
    route: [
      'I07 project',
      'Cross-office gaps',
      'G04 approval',
      'Milestones',
      'I02 output track',
    ],
  },
  {
    id: 'SOCIAL',
    label: 'Social',
    title: 'Services and residents',
    shortTitle: 'Social',
    currentLoop:
      'See service strain as capacity and backlog, then choose a staffed response.',
    nextMove: 'Compare service response',
    nextPage: 'S07',
    actionLabel: 'Stage service response',
    actionDetail:
      'Compare training, recruitment, and support before a service plan requests resources.',
    actionFields: ['Service gap', 'Response path', 'Support request'],
    route: [
      'S06 service state',
      'S07 / S03 compare',
      'Support request',
      'Actual capacity',
      'S14 resident outcome',
    ],
  },
];

const NATION_OBJECTS: readonly NationObject[] = [
  {
    id: 'CABINET-AGENDA',
    kind: 'cabinet',
    label: 'Agenda chamber',
    title: 'National agenda chamber',
    value: '1 decision window',
    state: 'watch',
    officeIds: ['CAPTAIN'],
    x: 50,
    y: 28,
    fact: 'Food security and a public-payment commitment now compete for national attention.',
    noAction:
      'Separate requests continue to compete without a named agenda lead.',
    nextOwner: 'Captain',
    dependency:
      'A formal agenda mandate must be attached before a governing decision.',
    unknown: 'Which joint plan reaches review first.',
  },
  {
    id: 'CENTRAL-LEDGER',
    kind: 'central-bank',
    label: 'Reserve vault',
    title: 'Central reserve ledger',
    value: 'Price watch',
    state: 'watch',
    officeIds: ['CENTRAL_BANK', 'FINANCE'],
    x: 66,
    y: 33,
    fact: 'Inflation is 6.4 percent in the current projection; a ledger operation has not been chosen.',
    noAction:
      'Price and liquidity exposure stay observational until an authorized operation exists.',
    nextOwner: 'Central Bank',
    dependency:
      'Legal instrument and eligible ledger are not yet supplied by an authorized contract.',
    unknown: 'The official effect of a future operation.',
  },
  {
    id: 'TREASURY-QUEUE',
    kind: 'treasury',
    label: 'Treasury queue',
    title: 'Settlement queue',
    value: '1.84 bn GCU',
    state: 'blocked',
    officeIds: ['FINANCE', 'CENTRAL_BANK', 'CAPTAIN'],
    x: 75,
    y: 48,
    fact: 'A recorded commitment has entered the payment queue.',
    noAction:
      'The queue keeps its recorded priority and reduces the available cash window.',
    nextOwner: 'Finance',
    dependency: 'A funding route must preserve the minimum cash buffer.',
    unknown: 'The authoritative clearing order.',
  },
  {
    id: 'NORTHSTAR-RESERVE',
    kind: 'granary',
    label: 'Grain reserve',
    title: 'Northstar grain reserve',
    value: '128k tonnes',
    state: 'alert',
    officeIds: ['TRADE', 'CAPTAIN', 'SOCIAL'],
    x: 24,
    y: 52,
    fact: '18,000 tonnes moved from AVAILABLE to RESERVED in the recorded projection.',
    noAction:
      'The food buffer remains tight; no household outcome is asserted.',
    nextOwner: 'Trade',
    dependency:
      'A goods draft needs a current version, authority grant, and counterpart acceptance.',
    unknown: 'Counterpart quantity, price, and delivery terms.',
  },
  {
    id: 'HARBOUR-LANE',
    kind: 'port',
    label: 'Harbour lane',
    title: 'Northstar harbour lane',
    value: 'Route observed',
    state: 'window',
    officeIds: ['TRADE', 'INDUSTRY'],
    x: 14,
    y: 74,
    fact: 'A Meridian lane is visible in the relationship projection.',
    noAction:
      'The lane remains a signal, not a guaranteed berth or capacity allocation.',
    nextOwner: 'Trade',
    dependency:
      'Real logistics require route and berth evidence during formal execution.',
    unknown: 'Weather and berth allocation.',
  },
  {
    id: 'MERIDIAN-WINDOW',
    kind: 'market',
    label: 'Meridian signal',
    title: 'Meridian import window',
    value: 'Open signal',
    state: 'window',
    officeIds: ['TRADE', 'FINANCE'],
    x: 7,
    y: 30,
    fact: 'Meridian is the available counterpart for a grain conversation.',
    noAction:
      'The counterpart window may close before a formal offer is received.',
    nextOwner: 'Trade + Finance',
    dependency: 'Settlement source and exact terms need review.',
    unknown: 'Whether the counterpart accepts the offer.',
  },
  {
    id: 'GRID-PLANT',
    kind: 'industry',
    label: 'Idle plant',
    title: 'Riverside capacity site',
    value: 'Project ready',
    state: 'ready',
    officeIds: ['INDUSTRY', 'FINANCE', 'TRADE'],
    x: 43,
    y: 73,
    fact: 'An identified site can be scoped for a capacity project; no facility has started.',
    noAction: 'No new capacity or input demand is created.',
    nextOwner: 'Industry',
    dependency:
      'Technology, finance, and inputs must be resolved through their own offices.',
    unknown: 'Construction timing and operating output.',
  },
  {
    id: 'ENERGY-GRID',
    kind: 'energy',
    label: 'Power grid',
    title: 'Riverside power grid',
    value: 'Margin watch',
    state: 'watch',
    officeIds: ['INDUSTRY', 'SOCIAL'],
    x: 58,
    y: 78,
    fact: 'The grid is visible as a capacity dependency for new industrial and service load.',
    noAction: 'No connection reservation or new load is claimed.',
    nextOwner: 'Industry',
    dependency: 'A project needs an authoritative connection assessment.',
    unknown: 'Actual available margin at execution time.',
  },
  {
    id: 'CIVIC-DISTRICT',
    kind: 'district',
    label: 'Civic district',
    title: 'Eastbank civic district',
    value: 'Backlog rising',
    state: 'alert',
    officeIds: ['SOCIAL', 'CAPTAIN', 'FINANCE'],
    x: 37,
    y: 36,
    fact: 'The local service view has an observed backlog and staff-capacity question.',
    noAction:
      'Residents remain on the current service path; no outcome is predicted.',
    nextOwner: 'Social',
    dependency: 'A response may require finance, industry, or trade support.',
    unknown:
      'Resident impact until actual staffing and service records arrive.',
  },
  {
    id: 'LEARNING-HUB',
    kind: 'school',
    label: 'Training hub',
    title: 'Eastbank training hub',
    value: '48 seats open',
    state: 'ready',
    officeIds: ['SOCIAL', 'INDUSTRY'],
    x: 47,
    y: 48,
    fact: 'A training site is visible as one possible service response.',
    noAction: 'No trainees are enrolled and no labour result is inferred.',
    nextOwner: 'Social',
    dependency: 'Staffing, service scope, and funding need a formal plan.',
    unknown: 'Completion, placement, and resident outcomes.',
  },
  {
    id: 'CARE-CENTRE',
    kind: 'clinic',
    label: 'Care centre',
    title: 'Eastbank care centre',
    value: 'Queue monitored',
    state: 'watch',
    officeIds: ['SOCIAL', 'FINANCE'],
    x: 59,
    y: 56,
    fact: 'The service object exposes capacity and backlog, not an aggregate welfare score.',
    noAction: 'The current queue persists without a claimed resident effect.',
    nextOwner: 'Social',
    dependency:
      'Service capacity needs a staffed response and a valid funding source.',
    unknown: 'Actual wait-time change after execution.',
  },
];

const REPLAY_POINTS = [
  { day: '72', label: 'Reserve tagged', objectId: 'NORTHSTAR-RESERVE' },
  { day: '75', label: 'Cash queued', objectId: 'TREASURY-QUEUE' },
  { day: '78', label: 'Current world', objectId: 'CABINET-AGENDA' },
] as const;

const RELATIONS = [
  {
    id: 'MERIDIAN',
    label: 'Meridian',
    detail: 'Grain import window · partner signal visible',
    action: 'Open trade relation',
  },
  {
    id: 'ASTER',
    label: 'Aster',
    detail: 'Technology conversation · no open offer',
    action: 'Inspect technology relation',
  },
  {
    id: 'KESTREL',
    label: 'Kestrel',
    detail: 'Finance observation · no transaction path',
    action: 'Inspect finance relation',
  },
] as const;

function findOffice(id: OfficeId) {
  return OFFICE_LENSES.find((office) => office.id === id) ?? OFFICE_LENSES[3]!;
}

function toBoundOfficeId(officeId: string): OfficeId {
  return OFFICE_LENSES.some((office) => office.id === officeId)
    ? (officeId as OfficeId)
    : 'TRADE';
}

function findObject(id: string) {
  return (
    NATION_OBJECTS.find((object) => object.id === id) ?? NATION_OBJECTS[3]!
  );
}

function ObjectGlyph({ kind }: { readonly kind: string }) {
  return (
    <span
      className={`living-object__glyph living-object__glyph--${kind}`}
      aria-hidden="true"
    />
  );
}

function PulseChart({
  active,
  onSelect,
}: {
  readonly active: boolean;
  readonly onSelect: () => void;
}) {
  return (
    <button
      className={`nation-pulse${active ? ' is-active' : ''}`}
      type="button"
      onClick={onSelect}
      aria-label="Open national replay from the food and cash pulse"
    >
      <span>National pulse</span>
      <svg
        viewBox="0 0 144 35"
        role="img"
        aria-label="Food buffer falling while payment pressure rises"
      >
        <path
          className="nation-pulse__area"
          d="M2 6 L25 10 L47 9 L71 19 L94 17 L118 29 L142 28 L142 35 L2 35 Z"
        />
        <path
          className="nation-pulse__line"
          d="M2 6 L25 10 L47 9 L71 19 L94 17 L118 29 L142 28"
        />
        <path
          className="nation-pulse__line nation-pulse__line--cash"
          d="M2 29 L25 26 L47 27 L71 18 L94 20 L118 9 L142 7"
        />
      </svg>
      <small>{active ? 'Replay open' : 'Click to replay'}</small>
    </button>
  );
}

function ReplayStrip({
  activeDay,
  onSelect,
  onReturnCurrent,
}: {
  readonly activeDay: string | null;
  readonly onSelect: (point: (typeof REPLAY_POINTS)[number]) => void;
  readonly onReturnCurrent: () => void;
}) {
  return (
    <section className="replay-strip" aria-label="National time replay">
      <div>
        <span>National replay</span>
        <strong>{activeDay ? `Season day ${activeDay}` : 'Live world'}</strong>
        <small>
          Replay reads a past projection; the world clock keeps running.
        </small>
      </div>
      <ol>
        {REPLAY_POINTS.map((point) => (
          <li
            key={point.day}
            className={activeDay === point.day ? 'is-active' : undefined}
          >
            <button
              type="button"
              onClick={() => onSelect(point)}
              aria-pressed={activeDay === point.day}
            >
              <b>{point.day}</b>
              <span>{point.label}</span>
            </button>
          </li>
        ))}
      </ol>
      {activeDay ? (
        <button
          className="six-text-button"
          type="button"
          onClick={onReturnCurrent}
        >
          Return to live
        </button>
      ) : null}
    </section>
  );
}

function OfficeLensRail({
  boundOfficeId,
}: {
  readonly boundOfficeId: OfficeId;
}) {
  return (
    <section
      className="office-lens-rail"
      aria-label="National office assignments"
    >
      <div>
        <span>Assigned office</span>
        <small>Actions follow the verified appointment</small>
      </div>
      <div aria-label="Office assignment index">
        {OFFICE_LENSES.map((office) => (
          <span
            key={office.id}
            className={office.id === boundOfficeId ? 'is-active' : 'is-locked'}
          >
            <b>{office.label}</b>
            <small>{office.nextPage}</small>
          </span>
        ))}
      </div>
    </section>
  );
}

function NationInspector({
  object,
  office,
  projection,
  replayDay,
  canAct,
  planOpen,
  onTogglePlan,
  onOpenTradeDraft,
}: {
  readonly object: NationObject;
  readonly office: OfficeLens;
  readonly projection: PrototypeWorldBriefProjection;
  readonly replayDay: string | null;
  readonly canAct: boolean;
  readonly planOpen: boolean;
  readonly onTogglePlan: () => void;
  readonly onOpenTradeDraft: () => void;
}) {
  const actionIsTransfer = office.id === 'TRADE';
  return (
    <aside
      className="nation-inspector"
      aria-labelledby="nation-inspector-title"
    >
      <div className="nation-inspector__kicker">
        <span>
          {replayDay ? `Replay · day ${replayDay}` : 'Live projection'}
        </span>
        <span className={`living-state living-state--${object.state}`}>
          {object.state}
        </span>
      </div>
      <h2 id="nation-inspector-title">{object.title}</h2>
      <p>{object.fact}</p>
      <dl>
        <div>
          <dt>No-action path</dt>
          <dd>{object.noAction}</dd>
        </div>
        <div>
          <dt>Next owner</dt>
          <dd>{object.nextOwner}</dd>
        </div>
        <div>
          <dt>Dependency</dt>
          <dd>{object.dependency}</dd>
        </div>
      </dl>
      <section
        className="office-loop-card"
        aria-label={`${office.title} action loop`}
      >
        {canAct ? (
          <>
            <span>
              {office.shortTitle} next move · {office.nextPage}
            </span>
            <strong>{office.nextMove}</strong>
            <ol>
              {office.route.map((step, index) => (
                <li
                  key={step}
                  className={index === 0 ? 'is-current' : undefined}
                >
                  {step}
                </li>
              ))}
            </ol>
          </>
        ) : (
          <>
            <span>Observation only</span>
            <strong>{object.nextOwner} owns the next action.</strong>
            <small>
              This object is visible in the national scene, but it is not
              actionable under the {office.shortTitle} appointment.
            </small>
          </>
        )}
      </section>
      {planOpen && canAct ? (
        <section
          className="local-plan-sheet"
          aria-label="Local preparation details"
        >
          <span>Local preparation</span>
          <strong>{office.actionDetail}</strong>
          <ul>
            {office.actionFields.map((field) => (
              <li key={field}>{field}</li>
            ))}
          </ul>
          <small>
            Command contract not attached. This prototype cannot submit, settle,
            or predict an outcome.
          </small>
        </section>
      ) : null}
      <div className="nation-inspector__actions">
        <button
          className="six-button six-button--primary"
          type="button"
          disabled={!canAct}
          onClick={actionIsTransfer ? onOpenTradeDraft : onTogglePlan}
        >
          {!canAct
            ? `Reserved for ${object.nextOwner}`
            : actionIsTransfer
              ? office.actionLabel
              : planOpen
                ? 'Close local plan'
                : office.actionLabel}
        </button>
        {actionIsTransfer && canAct ? (
          <button
            className="six-button six-button--secondary"
            type="button"
            onClick={onTogglePlan}
          >
            {planOpen ? 'Close local plan' : 'View plan fields'}
          </button>
        ) : null}
      </div>
      <footer>
        World v{projection.watermark.worldVersion} · evidence and local
        preparation only
      </footer>
    </aside>
  );
}

function RelationshipMap({
  selectedRelationId,
  activeOfficeId,
  onSelect,
  onClose,
  onOpenTrade,
  onNotice,
}: {
  readonly selectedRelationId: string;
  readonly activeOfficeId: OfficeId;
  readonly onSelect: (relationId: string) => void;
  readonly onClose: () => void;
  readonly onOpenTrade: () => void;
  readonly onNotice: (message: string) => void;
}) {
  const selected =
    RELATIONS.find((relation) => relation.id === selectedRelationId) ??
    RELATIONS[0]!;
  return (
    <section className="relationship-map" aria-label="World relationship map">
      <header>
        <div>
          <span>World relation view</span>
          <h2>Northstar’s external field</h2>
          <small>Relationship map · not to geographic scale</small>
        </div>
        <button className="six-text-button" type="button" onClick={onClose}>
          Close map
        </button>
      </header>
      <div className="relationship-map__field">
        <svg
          viewBox="0 0 800 390"
          aria-hidden="true"
          preserveAspectRatio="none"
        >
          <path
            className="relation-line relation-line--meridian"
            d="M404 198 C282 150 168 157 88 106"
          />
          <path
            className="relation-line"
            d="M404 198 C538 122 622 126 713 85"
          />
          <path
            className="relation-line"
            d="M404 198 C539 283 632 288 704 314"
          />
        </svg>
        <span className="relation-origin">NORTHSTAR</span>
        {RELATIONS.map((relation, index) => (
          <button
            type="button"
            key={relation.id}
            className={`relation-country relation-country--${index + 1}${selectedRelationId === relation.id ? ' is-selected' : ''}`}
            aria-pressed={selectedRelationId === relation.id}
            onClick={() => onSelect(relation.id)}
          >
            <i aria-hidden="true" />
            <strong>{relation.label}</strong>
            <small>
              {relation.id === 'MERIDIAN' ? 'Trade signal' : 'Observation'}
            </small>
          </button>
        ))}
      </div>
      <footer>
        <div>
          <span>Selected relation</span>
          <strong>{selected.label}</strong>
          <small>{selected.detail}</small>
        </div>
        <button
          className="six-button six-button--primary"
          type="button"
          onClick={() => {
            if (selected.id === 'MERIDIAN' && activeOfficeId === 'TRADE') {
              onOpenTrade();
              return;
            }
            onNotice(
              `${selected.label} is selected for inspection only. ${selected.id === 'MERIDIAN' ? 'Trade owns the next action for this relationship.' : 'No transaction route is attached.'}`,
            );
          }}
        >
          {selected.action}
        </button>
      </footer>
    </section>
  );
}

export function LivingNationScene({
  projection,
  onOpenTradeDraft,
  onNotice,
}: {
  readonly projection: PrototypeWorldBriefProjection;
  readonly onOpenTradeDraft: () => void;
  readonly onNotice: (message: string) => void;
}) {
  const activeOfficeId = toBoundOfficeId(projection.viewer.actingOfficeId);
  const [selectedObjectId, setSelectedObjectId] = useState('NORTHSTAR-RESERVE');
  const [replayDay, setReplayDay] = useState<string | null>(null);
  const [worldMapOpen, setWorldMapOpen] = useState(false);
  const [selectedRelationId, setSelectedRelationId] = useState('MERIDIAN');
  const [planOpen, setPlanOpen] = useState(false);

  const activeOffice = findOffice(activeOfficeId);
  const selectedObject = findObject(selectedObjectId);
  const relevantObjects = useMemo(
    () =>
      NATION_OBJECTS.filter((object) =>
        object.officeIds.includes(activeOfficeId),
      ),
    [activeOfficeId],
  );

  return (
    <section className="living-nation" aria-label="Living Nation game scene">
      <header className="living-nation__header">
        <div>
          <span>National command view · G01</span>
          <h1>Northstar is moving. Choose where to intervene.</h1>
          <small>{activeOffice.currentLoop}</small>
        </div>
        <div className="living-nation__header-actions">
          <PulseChart
            active={replayDay !== null}
            onSelect={() => setReplayDay('72')}
          />
          <button
            className="world-map-trigger"
            type="button"
            onClick={() => setWorldMapOpen(true)}
          >
            <span>World relations</span>
            <strong>3 visible links</strong>
            <small>Explore before any transaction</small>
          </button>
        </div>
      </header>
      <OfficeLensRail boundOfficeId={activeOfficeId} />
      <section className="living-nation__hud" aria-label="National status">
        <div>
          <span>Food buffer</span>
          <strong>
            128k <small>t</small>
          </strong>
          <em className="is-alert">Reserve locked</em>
        </div>
        <div>
          <span>Cash window</span>
          <strong>
            1.84 <small>bn GCU</small>
          </strong>
          <em className="is-blocked">Queue active</em>
        </div>
        <div>
          <span>Price watch</span>
          <strong>
            6.4<small>%</small>
          </strong>
          <em className="is-watch">+0.8 pp</em>
        </div>
        <div>
          <span>Assigned office</span>
          <strong>{activeOffice.label}</strong>
          <em className="is-ready">{relevantObjects.length} objects</em>
        </div>
      </section>
      <ReplayStrip
        activeDay={replayDay}
        onSelect={(point) => {
          setReplayDay(point.day);
          setSelectedObjectId(point.objectId);
          setPlanOpen(false);
        }}
        onReturnCurrent={() => setReplayDay(null)}
      />
      <section className="living-nation__workspace">
        <div className="nation-stage-wrap">
          <div
            className={`nation-stage${replayDay ? ' is-replay' : ''}`}
            aria-label="Northstar national scene"
          >
            <div className="nation-stage__sky" aria-hidden="true" />
            <div className="nation-stage__water" aria-hidden="true" />
            <div
              className="nation-stage__district nation-stage__district--north"
              aria-hidden="true"
            />
            <div
              className="nation-stage__district nation-stage__district--south"
              aria-hidden="true"
            />
            <div
              className="nation-stage__road nation-stage__road--one"
              aria-hidden="true"
            />
            <div
              className="nation-stage__road nation-stage__road--two"
              aria-hidden="true"
            />
            <span className="nation-stage__label nation-stage__label--harbour">
              HARBOUR REACH
            </span>
            <span className="nation-stage__label nation-stage__label--civic">
              EASTBANK
            </span>
            <span className="nation-stage__label nation-stage__label--riverside">
              RIVERSIDE
            </span>
            {NATION_OBJECTS.map((object) => {
              const isRelevant = object.officeIds.includes(activeOfficeId);
              return (
                <button
                  key={object.id}
                  type="button"
                  className={`living-object living-object--${object.kind} living-object--${object.state}${isRelevant ? ' is-relevant' : ''}${selectedObjectId === object.id ? ' is-selected' : ''}`}
                  style={
                    {
                      '--object-x': `${object.x}%`,
                      '--object-y': `${object.y}%`,
                    } as CSSProperties
                  }
                  aria-pressed={selectedObjectId === object.id}
                  aria-label={`${object.title}, ${object.value}, ${object.state}`}
                  onClick={() => {
                    setSelectedObjectId(object.id);
                    setPlanOpen(false);
                  }}
                >
                  <ObjectGlyph kind={object.kind} />
                  <span className="living-object__copy">
                    <small>{object.label}</small>
                    <strong>{object.value}</strong>
                  </span>
                </button>
              );
            })}
            <div className="nation-stage__legend" aria-label="Scene legend">
              <span>
                <i className="is-alert" />
                Alert
              </span>
              <span>
                <i className="is-window" />
                Window
              </span>
              <span>
                <i className="is-blocked" />
                Dependency
              </span>
              <span>
                <i className="is-ready" />
                Ready
              </span>
            </div>
            {replayDay ? (
              <div className="nation-stage__replay-watermark">
                REPLAY · DAY {replayDay}
              </div>
            ) : null}
          </div>
          {worldMapOpen ? (
            <RelationshipMap
              selectedRelationId={selectedRelationId}
              activeOfficeId={activeOfficeId}
              onSelect={setSelectedRelationId}
              onClose={() => setWorldMapOpen(false)}
              onOpenTrade={() => {
                setWorldMapOpen(false);
                setSelectedObjectId('MERIDIAN-WINDOW');
                onOpenTradeDraft();
              }}
              onNotice={onNotice}
            />
          ) : null}
        </div>
        <NationInspector
          object={selectedObject}
          office={activeOffice}
          projection={projection}
          replayDay={replayDay}
          canAct={selectedObject.officeIds.includes(activeOfficeId)}
          planOpen={planOpen}
          onTogglePlan={() => setPlanOpen((open) => !open)}
          onOpenTradeDraft={onOpenTradeDraft}
        />
      </section>
      <section
        className="consequence-tray"
        aria-label="Action consequence path"
      >
        <div>
          <span>Action consequence</span>
          <strong>{activeOffice.nextMove}</strong>
        </div>
        <ol>
          <li className="is-complete">
            <b>1</b>
            <span>Fact</span>
            <small>object observed</small>
          </li>
          <li className="is-active">
            <b>2</b>
            <span>Local draft</span>
            <small>you are here</small>
          </li>
          <li>
            <b>3</b>
            <span>Review</span>
            <small>contract needed</small>
          </li>
          <li>
            <b>4</b>
            <span>Actual result</span>
            <small>receipt required</small>
          </li>
        </ol>
        <small>Unknown: {selectedObject.unknown}</small>
      </section>
    </section>
  );
}
