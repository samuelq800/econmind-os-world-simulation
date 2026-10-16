import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import {
  readPreviewLocale,
  subscribePreviewLocale,
  applyPreviewLocale,
  messages,
  type PreviewLocale,
} from '../world-preview/locale.js';
import {
  crisisPageMessages,
  crisisEnglishOfficeLabels,
  crisisEnglishStatusLabels,
  crisisEnglishFeedbackLabels,
} from './locale.js';

import {
  crisisFeedbackLabels,
  crisisMapObjects,
  crisisOfficeLabels,
  crisisPresentation,
  crisisSourcedFeedback,
  crisisStatusLabels,
  crisisVerifiedContributions,
  crisisWindow,
  type CrisisLocation,
  type CrisisReadState,
  type CrisisUnavailableReason,
  type CrisisRoute,
} from './model.js';
import './crisis-action.css';

export const UNBOUND_CRISIS_STATE: CrisisReadState = Object.freeze({
  status: 'UNBOUND',
});

const stateLabels: Record<CrisisReadState['status'], string> = {
  UNBOUND: '正式危机数据尚未接入',
  LOADING: '正在读取授权危机投影',
  DENIED: '当前身份无权读取危机详情',
  CURRENT: '服务端授权只读投影',
  STALE: '数据已过期，请刷新后复核',
  ERROR: '读取失败',
  UNAVAILABLE: '已读取授权投影，危机数据不可用',
};

const unavailableLabels: Record<
  CrisisUnavailableReason,
  readonly [string, string]
> = {
  ACTUAL_GAP_NOT_PROJECTED: [
    '实际缺口：服务端尚未投影',
    'Actual shortfall: not projected by the server',
  ],
  VERIFIED_DELIVERY_NOT_PROJECTED: [
    '核验交付：服务端尚未投影',
    'Verified delivery: not projected by the server',
  ],
  CONTRIBUTION_NOT_PROJECTED: [
    '核验贡献：服务端尚未投影',
    'Verified contributions: not projected by the server',
  ],
  CRISIS_CLOCK_NOT_PROJECTED: [
    '危机时钟：服务端尚未投影',
    'Crisis clock: not projected by the server',
  ],
  MODEL_NOT_ADMITTED: [
    '民众声音 · 系统模拟：模型尚未准入',
    'Citizen voices · System simulation: model not admitted',
  ],
  DISCLOSURE_UNAVAILABLE: [
    '他国回应 · 系统模拟：披露不可用',
    'Other governments · System simulation: disclosure unavailable',
  ],
  FEEDBACK_UNAVAILABLE: [
    '系统反馈：暂无可验证的授权来源',
    'System feedback: no verifiable authorized source',
  ],
  PLAYER_CONTENT_NOT_PROJECTED: [
    '玩家内容 / 外交：服务端尚未投影',
    'Player content / diplomacy: not projected by the server',
  ],
};
function UnavailableReasons({
  state,
  locale = 'zh',
}: {
  readonly state: CrisisReadState;
  readonly locale?: PreviewLocale;
}) {
  return state.status === 'UNAVAILABLE' ? (
    <ul>
      {state.reasons.map((reason) => (
        <li key={reason}>
          {unavailableLabels[reason][locale === 'zh' ? 0 : 1]} · {reason}
        </li>
      ))}
    </ul>
  ) : null;
}

const summaryZh = {
  aria: '危机行动与反馈摘要',
  eyebrow: '战后重建',
  title: '危机行动',
  country: '国家',
  chooseCountry: '选择国家查看危机上下文',
  shortage: '实际缺口：',
  noData: '暂无数据',
  effective: '生效',
  contributions: '核验贡献：',
  record: '条记录',
  records: '条记录',
  noContributions: '暂无核验记录',
  citizen: '民众声音',
  citizenSimulation: '民众声音 · 系统模拟',
  citizenPlayer: '民众声音 · 玩家内容',
  noCitizen: '暂无授权内容',
  governmentSimulation: '他国回应 · 系统模拟',
  noSimulation: '暂无模拟回应',
  diplomacy: '玩家外交',
  noDiplomacy: '暂无玩家外交记录',
  colon: '：',
  enter: '进入危机行动 →',
  states: stateLabels,
};
const summaryEn: typeof summaryZh = {
  aria: 'Crisis action and feedback summary',
  eyebrow: 'Post-war reconstruction',
  title: 'Crisis action',
  country: 'Country',
  chooseCountry: 'Select a country for crisis context',
  shortage: 'Actual shortfall: ',
  noData: 'No data',
  effective: 'Effective',
  contributions: 'Verified contributions: ',
  record: 'record',
  records: 'records',
  noContributions: 'No verified records',
  citizen: 'Citizen voices',
  citizenSimulation: 'Citizen voices · System simulation',
  citizenPlayer: 'Citizen voices · Player content',
  noCitizen: 'No authorized content',
  governmentSimulation: 'Other governments · System simulation',
  noSimulation: 'No simulated responses',
  diplomacy: 'Player diplomacy',
  noDiplomacy: 'No player diplomacy records',
  colon: ': ',
  enter: 'Enter crisis action →',
  states: {
    UNBOUND: 'Official crisis data is not connected',
    LOADING: 'Reading the authorized crisis projection',
    DENIED: 'This identity is not authorized to read crisis details',
    CURRENT: 'Server-authorized read-only projection',
    STALE: 'Data is stale; refresh and verify',
    ERROR: 'Read failed',
    UNAVAILABLE: 'Authorized projection read; crisis data unavailable',
  },
};
const summaryMessages = { zh: summaryZh, en: summaryEn };
// Preserve the existing Chinese server-rendered fallback; browser preference
// and same-page language changes use the existing locale contract above.
const serverSummaryLocale = (): PreviewLocale => 'zh';

function visibleStatus(state: CrisisReadState): CrisisReadState['status'] {
  // Retaining an old CURRENT string cannot resurrect a revoked/forged view.
  return 'view' in state && state.view !== null && !crisisPresentation(state)
    ? 'DENIED'
    : state.status;
}

function observedTime(value: string, label: string) {
  return `${value} · ${label}`;
}

export interface CrisisSummaryProps {
  readonly state?: CrisisReadState;
  readonly href?: string | null;
  readonly countryLabel?: string;
  /** Display context only, never an authoritative country identity. */
  readonly countryNumber?: string;
  readonly locale?: PreviewLocale;
}

/** Reusable on World and Country first screens. Same read view, same facts;
 * no aggregate, demo feed, public-to-private disclosure, or local settlement. */
export function CrisisSummary({
  state = UNBOUND_CRISIS_STATE,
  href = '#crisis',
  countryLabel,
  countryNumber,
  locale: requestedLocale,
}: CrisisSummaryProps) {
  const preference = useSyncExternalStore(
    subscribePreviewLocale,
    readPreviewLocale,
    serverSummaryLocale,
  );
  const locale = requestedLocale ?? preference;
  const text = summaryMessages[locale];
  const view = crisisPresentation(state);
  const status = visibleStatus(state);
  const contributions = crisisVerifiedContributions(view);
  const feedback = crisisSourcedFeedback(view);
  const citizen = feedback.find((item) => item.origin.startsWith('CITIZEN_'));
  return (
    <section
      className="crisis-summary"
      aria-label={text.aria}
      lang={locale === 'zh' ? 'zh-CN' : 'en'}
      data-no-translate=""
    >
      <div>
        <span className="crisis-eyebrow">{text.eyebrow}</span>
        <h2>{view?.eventLabel ?? text.title}</h2>
        <p>
          {view?.countryLabel ??
            countryLabel ??
            (countryNumber
              ? `${text.country} ${countryNumber}`
              : text.chooseCountry)}
        </p>
      </div>
      <p role="status">{text.states[status]}</p>
      <UnavailableReasons state={state} locale={locale} />
      <div className="crisis-summary__feeds">
        <span>
          {text.shortage}
          {view?.shortages[0]
            ? `${view.shortages[0].label} ${view.shortages[0].gap ?? text.noData} ${view.shortages[0].unit} · ${text.effective} ${view.shortages[0].effectiveAt}`
            : text.noData}
        </span>
        <span>
          {text.contributions}
          {contributions.length
            ? `${contributions.length} ${contributions.length === 1 ? text.record : text.records}`
            : text.noContributions}
        </span>
        <span>
          {citizen
            ? `${citizen.origin === 'CITIZEN_PLAYER' ? text.citizenPlayer : text.citizenSimulation}${text.colon}${citizen.text}`
            : `${text.citizen}${text.colon}${text.noCitizen}`}
        </span>
        <span>
          {text.governmentSimulation}
          {text.colon}
          {feedback.find((item) => item.origin === 'GOVERNMENT_SIMULATION')
            ?.text ?? text.noSimulation}
        </span>
        <span>
          {text.diplomacy}
          {text.colon}
          {feedback.find((item) => item.origin === 'PLAYER_DIPLOMACY')?.text ??
            text.noDiplomacy}
        </span>
      </div>
      {href !== null && <a href={href}>{text.enter}</a>}
    </section>
  );
}

export interface CrisisMapSlot {
  readonly locale: PreviewLocale;
  readonly selectedLocationId: string | null;
  readonly selectedTaskId: string | null;
  readonly locations: readonly CrisisLocation[];
  readonly routes: readonly CrisisRoute[];
  readonly onSelectLocation: (locationId: string) => void;
}
export interface CrisisActionPageProps {
  readonly state?: CrisisReadState;
  /** Display-only country context must not be interpreted as a server ID. */
  readonly countryLabel?: string;
  readonly countryNumber?: string;
  readonly worldHref?: string;
  readonly countryHref?: string;
  readonly renderMap?: (slot: CrisisMapSlot) => ReactNode;
  /** Refresh only through the host's existing authorized read composition. */
  readonly onRefresh?: () => void;
}

export function CrisisActionPage({
  state = UNBOUND_CRISIS_STATE,
  countryLabel,
  countryNumber,
  worldHref = '/',
  countryHref,
  renderMap,
  onRefresh,
}: CrisisActionPageProps) {
  const [locale, setLocale] = useState<PreviewLocale>(() =>
    typeof window === 'undefined' ? 'zh' : readPreviewLocale(),
  );
  useEffect(
    () => subscribePreviewLocale(() => setLocale(readPreviewLocale())),
    [],
  );
  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
    document.documentElement.dataset.language = locale;
  }, [locale]);
  const changeLocale = (next: PreviewLocale) => {
    applyPreviewLocale(next);
    setLocale(next);
  };
  const text = crisisPageMessages[locale];
  const officeLabels =
    locale === 'zh' ? crisisOfficeLabels : crisisEnglishOfficeLabels;
  const taskStatusLabels =
    locale === 'zh' ? crisisStatusLabels : crisisEnglishStatusLabels;
  const feedbackLabels =
    locale === 'zh' ? crisisFeedbackLabels : crisisEnglishFeedbackLabels;
  const view = crisisPresentation(state);
  const status = visibleStatus(state);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
    null,
  );
  const [detailOpen, setDetailOpen] = useState(true);
  const map = crisisMapObjects(view);
  // Old local selection cannot expose details after a read/identity changes.
  const task =
    view?.tasks.find((item) => item.taskId === selectedTaskId) ?? null;
  const requestedLocationId = task?.locationId ?? selectedLocationId;
  const locationId = map.locations.some(
    (item) => item.locationId === requestedLocationId,
  )
    ? requestedLocationId
    : null;
  const tasks = (view?.tasks ?? []).filter(
    (item) => locationId === null || item.locationId === locationId,
  );
  const activityWindow = crisisWindow(view?.clock ?? null);
  // Preserve the existing validated OPEN countdown and all server labels;
  // locale selection never reads a device clock or changes a cutoff.
  const remaining =
    activityWindow.status === 'UNKNOWN'
      ? text.noServerTime
      : activityWindow.status === 'UPCOMING'
        ? text.upcoming
        : activityWindow.status === 'CLOSED'
          ? text.ended
          : activityWindow.remainingLabel;
  const contributions = crisisVerifiedContributions(view);
  const feedback = crisisSourcedFeedback(view);
  const selectLocation = (id: string) => {
    if (!map.locations.some((item) => item.locationId === id)) return;
    setSelectedTaskId(null);
    setSelectedLocationId(id);
    setDetailOpen(true);
  };
  const selectTask = (id: string) => {
    const next = view?.tasks.find((item) => item.taskId === id);
    if (!next) return;
    setSelectedTaskId(id);
    setSelectedLocationId(next.locationId);
    setDetailOpen(true);
  };
  return (
    <main
      className="crisis-page"
      aria-label={text.page}
      lang={locale === 'zh' ? 'zh-CN' : 'en'}
      data-no-translate=""
    >
      <a className="crisis-brand" href={worldHref} aria-label={text.brand}>
        ECONMIND<span>WORLD</span>
      </a>
      <nav className="crisis-context" aria-label={text.position}>
        <a href={worldHref}>{text.overview}</a>
        <span>/</span>
        {countryHref ? (
          <a href={countryHref}>
            {view?.countryLabel ??
              countryLabel ??
              (countryNumber ? `${text.country} ${countryNumber}` : text.home)}
          </a>
        ) : (
          <span>
            {view?.countryLabel ??
              countryLabel ??
              (countryNumber ? `${text.country} ${countryNumber}` : text.home)}
          </span>
        )}
        <span>/ {text.action}</span>
        <span
          className="crisis-language"
          role="group"
          aria-label={messages[locale].language}
        >
          <button
            type="button"
            lang="zh-CN"
            aria-pressed={locale === 'zh'}
            onClick={() => changeLocale('zh')}
          >
            中文
          </button>
          <button
            type="button"
            lang="en"
            aria-pressed={locale === 'en'}
            onClick={() => changeLocale('en')}
          >
            EN
          </button>
        </span>
      </nav>
      <div className="crisis-clocks" aria-label={text.clocks}>
        <div>
          <span>{text.realWindow}</span>
          <strong>{remaining}</strong>
          <small>
            {view?.clock
              ? observedTime(view.clock.serverNow, text.serverSnapshot)
              : text.waitingWindow}
          </small>
        </div>
        <div>
          <span>{text.worldTime}</span>
          <strong>{view?.clock?.worldTimeLabel ?? text.noWorldTime}</strong>
          <small>
            {view?.clock
              ? `${view.clock.worldRate}× · ${text.serverRate}`
              : text.targetRate}{' '}
            · {text.independentWindow}
          </small>
        </div>
      </div>

      <div className="crisis-map" aria-label={text.map}>
        {renderMap ? (
          renderMap({
            locale,
            selectedLocationId: locationId,
            selectedTaskId: task?.taskId ?? null,
            locations: map.locations,
            routes: map.routes,
            onSelectLocation: selectLocation,
          })
        ) : (
          <div className="crisis-map-empty">
            <span>{text.continuousMap}</span>
            <p>{text.waitingMap}</p>
          </div>
        )}
      </div>

      <section className="crisis-overview" aria-label={text.gap}>
        <span className="crisis-eyebrow">{text.eyebrow}</span>
        <h1>{view?.eventLabel ?? text.title}</h1>
        <p className="crisis-read-status" role="status" aria-live="polite">
          {summaryMessages[locale].states[status]}
          {view
            ? ` · ${status === 'ERROR' || status === 'STALE' ? `${text.reliable} · ` : ''}${text.updated} ${view.effectiveAt}`
            : ` · ${text.unknownNotZero}`}
        </p>
        <UnavailableReasons state={state} locale={locale} />
        {(status === 'ERROR' || status === 'STALE') && onRefresh && (
          <button type="button" onClick={onRefresh}>
            {text.refresh}
          </button>
        )}
        {view && view.shortages.length ? (
          <ul className="crisis-shortages">
            {view.shortages.map((shortage) => (
              <li key={shortage.shortageId}>
                <h2>{shortage.label}</h2>
                <dl>
                  <div>
                    <dt>
                      {shortage.basis === 'INVENTORY'
                        ? text.inventory
                        : text.delivery}
                    </dt>
                    <dd>
                      {shortage.current ?? text.noData} {shortage.unit}
                    </dd>
                  </div>
                  <div>
                    <dt>{text.target}</dt>
                    <dd>
                      {shortage.target ?? text.noData} {shortage.unit}
                    </dd>
                  </div>
                  <div>
                    <dt>{text.shortfall}</dt>
                    <dd>
                      {shortage.gap ?? text.noData} {shortage.unit}
                    </dd>
                  </div>
                </dl>
                <small>
                  {text.arrival} {shortage.expectedArrival ?? text.noData} ·{' '}
                  {text.noAdvanceCredit}
                </small>
                <small>
                  {text.effective} {shortage.effectiveAt} · {text.source}{' '}
                  {shortage.sourceRef}
                </small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="crisis-empty">{text.noSnapshot}</p>
        )}
      </section>

      <aside
        className={`crisis-panel${detailOpen ? ' is-open' : ''}`}
        aria-label={text.collaboration}
      >
        <button
          className="crisis-drawer-toggle"
          type="button"
          aria-expanded={detailOpen}
          onClick={() => setDetailOpen(!detailOpen)}
        >
          {detailOpen ? text.collapse : text.expand}
        </button>
        <div className="crisis-panel__body">
          <span className="crisis-eyebrow">{text.officeWork}</span>
          <h2>{view ? officeLabels[view.officeId] : text.noOffice}</h2>
          <p>{text.authorization}</p>
          <div className="crisis-offices" aria-label={text.officeIndex}>
            {Object.entries(officeLabels).map(([office, label]) => (
              <span
                key={office}
                aria-current={view?.officeId === office ? 'true' : undefined}
              >
                {label}
              </span>
            ))}
          </div>
          {locationId && (
            <button
              type="button"
              onClick={() => {
                setSelectedLocationId(null);
                setSelectedTaskId(null);
              }}
            >
              {text.allLocations}
            </button>
          )}
          <h3>{text.tasks}</h3>
          {tasks.length ? (
            <ul className="crisis-tasks">
              {tasks.map((item) => (
                <li key={item.taskId}>
                  <button
                    type="button"
                    aria-pressed={task?.taskId === item.taskId}
                    onClick={() => selectTask(item.taskId)}
                  >
                    <span>{item.label}</span>
                    <small>{taskStatusLabels[item.status]}</small>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="crisis-empty">
              {status === 'DENIED' ? text.deniedTasks : text.emptyTasks}
            </p>
          )}
          {task ? (
            <section
              className="crisis-task-detail"
              aria-label={text.selectedTask}
            >
              <h3>{task.label}</h3>
              <span className="crisis-status">
                {taskStatusLabels[task.status]}
              </span>
              <dl>
                <div>
                  <dt>{text.location}</dt>
                  <dd>
                    {map.locations.find(
                      (item) => item.locationId === task.locationId,
                    )?.label ?? text.noLocation}
                  </dd>
                </div>
                <div>
                  <dt>{text.resources}</dt>
                  <dd>{task.resourcesLabel ?? text.noData}</dd>
                </div>
                <div>
                  <dt>{text.owner}</dt>
                  <dd>{task.ownerLabel ?? text.unassigned}</dd>
                </div>
                <div>
                  <dt>{text.offices}</dt>
                  <dd>
                    {task.requiredOffices
                      .map((office) => officeLabels[office])
                      .join(text.separator) || text.unassigned}
                  </dd>
                </div>
                <div>
                  <dt>{text.next}</dt>
                  <dd>{task.nextStep ?? text.unassigned}</dd>
                </div>
                <div>
                  <dt>{text.effect}</dt>
                  <dd>
                    {task.expectedEffect ?? text.noData} · {text.notDelivered}
                  </dd>
                </div>
                <div>
                  <dt>{text.evidence}</dt>
                  <dd>
                    {task.evidenceRefs.join(text.separator) || text.noVerified}
                  </dd>
                </div>
              </dl>
              <small>
                {text.source} {task.sourceRef} · {text.version} {task.version} ·{' '}
                {text.effective} {task.effectiveAt}
              </small>
              <div className="crisis-actions" aria-label={text.allowedActions}>
                {task.allowedActions.length ? (
                  task.allowedActions.map((action) => (
                    <button type="button" disabled key={action.actionId}>
                      {action.label}
                    </button>
                  ))
                ) : (
                  <p>{text.noActions}</p>
                )}
              </div>
              <p className="crisis-empty">
                {activityWindow.status === 'CLOSED'
                  ? text.closed
                  : status !== 'CURRENT'
                    ? text.waitingCurrent
                    : text.noExecution}{' '}
                {text.completion}
              </p>
            </section>
          ) : (
            <p className="crisis-empty">{text.chooseTask}</p>
          )}
        </div>
      </aside>

      <div className="crisis-legend" aria-label={text.legend}>
        <span>{text.shortageMark}</span>
        <span>{text.supplyMark}</span>
        <span>{text.transportMark}</span>
        <span>{text.deliveredMark}</span>
        <small>{text.noGeometry}</small>
      </div>
      <section className="crisis-feedback" aria-label={text.feedback}>
        <div>
          <h2>{text.contributions}</h2>
          {contributions.length ? (
            <ul>
              {contributions.map((item) => (
                <li key={item.contributionId}>
                  <button type="button" onClick={() => selectTask(item.taskId)}>
                    {item.contributorLabel} · {item.resultLabel}
                  </button>
                  <small>
                    {text.verified} {item.verifiedAt} · {text.evidence}{' '}
                    {item.evidenceRef}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p>{text.noContributions}</p>
          )}
        </div>
        {(
          ['CITIZEN', 'GOVERNMENT_SIMULATION', 'PLAYER_DIPLOMACY'] as const
        ).map((group) => {
          const items = feedback.filter((item) =>
            group === 'CITIZEN'
              ? item.origin.startsWith('CITIZEN_')
              : item.origin === group,
          );
          return (
            <div key={group}>
              <h2>
                {group === 'CITIZEN'
                  ? text.citizen
                  : group === 'GOVERNMENT_SIMULATION'
                    ? text.government
                    : text.diplomacy}
              </h2>
              {items.length ? (
                <ul>
                  {items.map((item) => (
                    <li key={item.feedbackId}>
                      <strong>{feedbackLabels[item.origin]}</strong>
                      <p>{item.text}</p>
                      <small>
                        {item.generatedAt} · {text.source} {item.sourceRef}
                      </small>
                      {item.taskId && (
                        <button
                          type="button"
                          onClick={() => selectTask(item.taskId!)}
                        >
                          {text.relatedTask}
                        </button>
                      )}
                      {!item.taskId && item.locationId && (
                        <button
                          type="button"
                          onClick={() => selectLocation(item.locationId!)}
                        >
                          {text.relatedLocation}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>
                  {group === 'GOVERNMENT_SIMULATION'
                    ? text.noSimulation
                    : text.noContent}
                </p>
              )}
            </div>
          );
        })}
      </section>
    </main>
  );
}
