import { useState, useSyncExternalStore, type ReactNode } from 'react';

import {
  readPreviewLocale,
  subscribePreviewLocale,
  type PreviewLocale,
} from '../world-preview/locale.js';

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
};

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

function observedTime(value: string) {
  return `${value} · 服务端快照`;
}

export interface CrisisSummaryProps {
  readonly state?: CrisisReadState;
  readonly href?: string;
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
      <a href={href}>{text.enter}</a>
    </section>
  );
}

export interface CrisisMapSlot {
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
  readonly worldHref?: string;
  readonly countryHref?: string;
  readonly renderMap?: (slot: CrisisMapSlot) => ReactNode;
  /** Refresh only through the host's existing authorized read composition. */
  readonly onRefresh?: () => void;
}

export function CrisisActionPage({
  state = UNBOUND_CRISIS_STATE,
  countryLabel,
  worldHref = '/',
  countryHref,
  renderMap,
  onRefresh,
}: CrisisActionPageProps) {
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
  const window = crisisWindow(view?.clock ?? null);
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
    <main className="crisis-page" aria-label="战后重建危机行动">
      <a
        className="crisis-brand"
        href={worldHref}
        aria-label="EconMind 返回世界"
      >
        ECONMIND<span>WORLD</span>
      </a>
      <nav className="crisis-context" aria-label="页面位置">
        <a href={worldHref}>世界总览</a>
        <span>/</span>
        {countryHref ? (
          <a href={countryHref}>
            {view?.countryLabel ?? countryLabel ?? '本国总览'}
          </a>
        ) : (
          <span>{view?.countryLabel ?? countryLabel ?? '本国总览'}</span>
        )}
        <span>/ 危机行动</span>
      </nav>
      <div className="crisis-clocks" aria-label="独立现实与世界时间">
        <div>
          <span>现实活动窗口 · 前14天（两周）</span>
          <strong>{window.remainingLabel}</strong>
          <small>
            {view?.clock
              ? observedTime(view.clock.serverNow)
              : '等待服务端现实窗口'}
          </small>
        </div>
        <div>
          <span>世界时间</span>
          <strong>{view?.clock?.worldTimeLabel ?? '暂无服务端世界时间'}</strong>
          <small>
            {view?.clock
              ? `${view.clock.worldRate}× · 服务端倍率`
              : '目标 10× · 尚未绑定'}{' '}
            · 与现实活动窗口独立
          </small>
        </div>
      </div>

      <div className="crisis-map" aria-label="危机行动地理地图">
        {renderMap ? (
          renderMap({
            selectedLocationId: locationId,
            selectedTaskId: task?.taskId ?? null,
            locations: map.locations,
            routes: map.routes,
            onSelectLocation: selectLocation,
          })
        ) : (
          <div className="crisis-map-empty">
            <span>连续国家地图</span>
            <p>等待权威地理地图接入；尚无核验危机点位与供给路线。</p>
          </div>
        )}
      </div>

      <section className="crisis-overview" aria-label="当前缺口">
        <span className="crisis-eyebrow">战后重建 · 危机行动</span>
        <h1>{view?.eventLabel ?? '从缺口到真实交付'}</h1>
        <p className="crisis-read-status" role="status" aria-live="polite">
          {stateLabels[status]}
          {view
            ? ` · ${status === 'ERROR' || status === 'STALE' ? '最近可靠快照 · ' : ''}更新 ${view.effectiveAt}`
            : ' · 未知值不代表零'}
        </p>
        {(status === 'ERROR' || status === 'STALE') && onRefresh && (
          <button type="button" onClick={onRefresh}>
            重新读取
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
                        ? '当前库存'
                        : '累计核验交付'}
                    </dt>
                    <dd>
                      {shortage.current ?? '暂无数据'} {shortage.unit}
                    </dd>
                  </div>
                  <div>
                    <dt>目标</dt>
                    <dd>
                      {shortage.target ?? '暂无数据'} {shortage.unit}
                    </dd>
                  </div>
                  <div>
                    <dt>实际缺口</dt>
                    <dd>
                      {shortage.gap ?? '暂无数据'} {shortage.unit}
                    </dd>
                  </div>
                </dl>
                <small>
                  预估到货 {shortage.expectedArrival ?? '暂无数据'} ·
                  不提前抵扣缺口
                </small>
                <small>
                  生效 {shortage.effectiveAt} · 来源 {shortage.sourceRef}
                </small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="crisis-empty">
            暂无权威缺口快照，等待库存或实际交付口径接入。
          </p>
        )}
      </section>

      <aside
        className={`crisis-panel${detailOpen ? ' is-open' : ''}`}
        aria-label="任务与协作详情"
      >
        <button
          className="crisis-drawer-toggle"
          type="button"
          aria-expanded={detailOpen}
          onClick={() => setDetailOpen(!detailOpen)}
        >
          {detailOpen ? '收起任务面板' : '展开任务面板'}
        </button>
        <div className="crisis-panel__body">
          <span className="crisis-eyebrow">本职行动与协作</span>
          <h2>{view ? crisisOfficeLabels[view.officeId] : '职位尚未绑定'}</h2>
          <p>六职位沿用既有授权；具体动作由服务端返回。</p>
          <div className="crisis-offices" aria-label="六职位索引">
            {Object.entries(crisisOfficeLabels).map(([office, label]) => (
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
              查看全部地点任务
            </button>
          )}
          <h3>任务列表</h3>
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
                    <small>{crisisStatusLabels[item.status]}</small>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="crisis-empty">
              {status === 'DENIED'
                ? '当前身份没有授权任务。'
                : '暂无授权任务；未生成示例任务或操作。'}
            </p>
          )}
          {task ? (
            <section className="crisis-task-detail" aria-label="选中任务详情">
              <h3>{task.label}</h3>
              <span className="crisis-status">
                {crisisStatusLabels[task.status]}
              </span>
              <dl>
                <div>
                  <dt>地点</dt>
                  <dd>
                    {map.locations.find(
                      (item) => item.locationId === task.locationId,
                    )?.label ?? '暂无核验地点'}
                  </dd>
                </div>
                <div>
                  <dt>所需资源</dt>
                  <dd>{task.resourcesLabel ?? '暂无数据'}</dd>
                </div>
                <div>
                  <dt>负责人</dt>
                  <dd>{task.ownerLabel ?? '待指定'}</dd>
                </div>
                <div>
                  <dt>协作办公室</dt>
                  <dd>
                    {task.requiredOffices
                      .map((office) => crisisOfficeLabels[office])
                      .join('、') || '待指定'}
                  </dd>
                </div>
                <div>
                  <dt>下一步</dt>
                  <dd>{task.nextStep ?? '待指定'}</dd>
                </div>
                <div>
                  <dt>预计效果</dt>
                  <dd>{task.expectedEffect ?? '暂无数据'} · 不计入实际交付</dd>
                </div>
                <div>
                  <dt>证据</dt>
                  <dd>{task.evidenceRefs.join('、') || '暂无核验记录'}</dd>
                </div>
              </dl>
              <small>
                来源 {task.sourceRef} · 版本 {task.version} · 生效{' '}
                {task.effectiveAt}
              </small>
              <div className="crisis-actions" aria-label="服务端允许动作">
                {task.allowedActions.length ? (
                  task.allowedActions.map((action) => (
                    <button type="button" disabled key={action.actionId}>
                      {action.label}
                    </button>
                  ))
                ) : (
                  <p>当前服务端未返回可用动作。</p>
                )}
              </div>
              <p className="crisis-empty">
                {window.status === 'CLOSED'
                  ? '现实活动窗口已关闭。'
                  : status !== 'CURRENT'
                    ? '等待当前授权快照。'
                    : '执行通道尚未绑定。'}{' '}
                认领、批准和运输不代表完成；仅权威交付或投产可进入结算。
              </p>
            </section>
          ) : (
            <p className="crisis-empty">
              选择地点或任务查看负责人、协作与交付证据。
            </p>
          )}
        </div>
      </aside>

      <div className="crisis-legend" aria-label="地图图例">
        <span>◇ 短缺</span>
        <span>○ 供给</span>
        <span>⇢ 运输</span>
        <span>✓ 已交付</span>
        <small>无权威点位或核验路线时不绘制。</small>
      </div>
      <section className="crisis-feedback" aria-label="贡献与反馈">
        <div>
          <h2>个人与团队贡献</h2>
          {contributions.length ? (
            <ul>
              {contributions.map((item) => (
                <li key={item.contributionId}>
                  <button type="button" onClick={() => selectTask(item.taskId)}>
                    {item.contributorLabel} · {item.resultLabel}
                  </button>
                  <small>
                    已核验 {item.verifiedAt} · 证据 {item.evidenceRef}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p>暂无已核验交付或投产贡献。</p>
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
                  ? '民众声音'
                  : group === 'GOVERNMENT_SIMULATION'
                    ? '他国回应 · 系统模拟'
                    : '玩家外交'}
              </h2>
              {items.length ? (
                <ul>
                  {items.map((item) => (
                    <li key={item.feedbackId}>
                      <strong>{crisisFeedbackLabels[item.origin]}</strong>
                      <p>{item.text}</p>
                      <small>
                        {item.generatedAt} · 来源 {item.sourceRef}
                      </small>
                      {item.taskId && (
                        <button
                          type="button"
                          onClick={() => selectTask(item.taskId!)}
                        >
                          查看相关任务
                        </button>
                      )}
                      {!item.taskId && item.locationId && (
                        <button
                          type="button"
                          onClick={() => selectLocation(item.locationId!)}
                        >
                          定位相关地点
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>
                  {group === 'GOVERNMENT_SIMULATION'
                    ? '暂无系统模拟回应。'
                    : '暂无授权内容。'}
                </p>
              )}
            </div>
          );
        })}
      </section>
    </main>
  );
}
